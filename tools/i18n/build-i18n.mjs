#!/usr/bin/env node
// Generates the pages of the other languages (/es/ /fr/ /pt-br/ /pl/ /ru/) from the English/German pages and the
// dictionaries tools/i18n/dict/<lang>.json, and the texts their scripts need (assets/i18n/<lang>.json).
//
//   node tools/i18n/build-i18n.mjs                    # every active language (tools/i18n/languages.json)
//   node tools/i18n/build-i18n.mjs --check            # reports generated files that are out of date, writes nothing
//   node tools/i18n/build-i18n.mjs --missing fr       # missing and stale texts of a language as JSON (the work list)
//   node tools/i18n/build-i18n.mjs --stats            # texts and words to translate, per source
//   node tools/i18n/build-i18n.mjs --propwash <repo>  # tools/i18n/ui-terms.json from the mod's English language file
//   node tools/i18n/build-i18n.mjs --out <dir> --lang fr,ru [--pseudo | --allow-missing]
//                                                     # a preview of any language into another folder, with the
//                                                     # English/German pages and their language menu
//
// A page is built in this order: navigation and footer links from tools/site-nav.mjs in the language, every pair
// lang="en"/lang="de" becomes one element with the translation of the English one, translated attributes
// (data-de-alt|aria-label|title), title and meta texts, head (pw-root, pw-lang, canonical, hreflang, i18n.css, head
// script), the banner under the header, links (translated pages stay in the tree, everything else leads to the
// root), cache-busting stamps. An active language needs every text in its dictionary; --pseudo fills gaps with
// pseudo translations (tools/i18n/pseudo.mjs), --allow-missing with the English text.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, I18N_DIR, SITE, LANGUAGES, PHRASES, byCode, activeLanguages, loadDict, alternateLinks } from './languages.mjs';
import { sourcePages, translatedPaths } from './pages.mjs';
import { extract, words, TEXT_ATTRS, META_TEXTS } from './extract.mjs';
import { parse, findPairs, walk, attr, hasClass, inner, splice, escapeAttr } from './html.mjs';
import { pseudo } from './pseudo.mjs';
import { normalize } from '../../assets/js/i18n.js';
import { siteNav, siteFooterLinks, NAV_PATTERN, FOOTER_PATTERN, HEAD_PATTERN, TREE_HEAD_SCRIPT } from '../site-nav.mjs';
import { withNav, withHead, buildPage as buildHandPage, buildAppPage, HAND_PAGES, APP_PAGES } from '../build-nav.mjs';
import { computeHashes, stampHtml } from '../stamp-assets.mjs';

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const GLOSSARY = JSON.parse(fs.readFileSync(path.join(I18N_DIR, 'glossary.json'), 'utf8'));
const KEEP_WORDS = new Set(GLOSSARY.keep.filter((t) => !/\s/.test(t)));
const LINK_ATTRS = new Set(['href', 'src', 'srcset', 'poster', 'data-zoom-src', 'data-src', 'data-srcset']);

/** The translation function of a language: dictionary, then the drafts of languages.json, then the mode's fallback. */
export function translator(lang, mode = 'strict') {
  const dict = loadDict(lang.code);
  const missing = new Set();
  const used = new Set();
  const tr = (source) => {
    const key = normalize(source);
    if (!key || !/\p{L}/u.test(key)) return source;
    used.add(key);
    if (Object.prototype.hasOwnProperty.call(dict.entries, key)) return dict.entries[key];
    if (lang.drafts && Object.prototype.hasOwnProperty.call(lang.drafts, key)) return lang.drafts[key];
    missing.add(key);
    if (mode === 'pseudo') return pseudo(key, lang.code, KEEP_WORDS);
    return key;
  };
  return { tr, missing, used };
}

function splitRef(ref) {
  const hashAt = ref.indexOf('#');
  const hash = hashAt === -1 ? '' : ref.slice(hashAt);
  const rest = hashAt === -1 ? ref : ref.slice(0, hashAt);
  const queryAt = rest.indexOf('?');
  return { pathPart: queryAt === -1 ? rest : rest.slice(0, queryAt), query: queryAt === -1 ? '' : rest.slice(queryAt), hash };
}

// A root-relative target ('' = the root, 'docs/api/' = a folder, 'assets/x.css' = a file) as seen from a folder.
function relativeTo(fromDir, target) {
  const isDir = target === '' || target.endsWith('/');
  const toDir = isDir ? target.replace(/\/$/, '') : path.posix.dirname(target);
  let rel = path.posix.relative(fromDir.replace(/\/$/, '') || '.', toDir || '.');
  if (!isDir) return (rel ? `${rel}/` : '') + path.posix.basename(target);
  return rel ? `${rel}/` : './';
}

/** A link of an English/German page (file) for the same page in a language tree. */
export function rewriteRef(ref, page, code, pages, official) {
  if (ref === '' || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref)) return ref;
  const { pathPart, query, hash } = splitRef(ref);
  let target;
  if (pathPart === '') target = page.path;
  else {
    const joined = path.posix.normalize(path.posix.join(page.path || '.', pathPart));
    target = joined === '.' || joined === './' ? '' : joined.replace(/^\.\//, '');
    if (pathPart.endsWith('/') && target && !target.endsWith('/')) target += '/';
  }
  const asPage = target.endsWith('index.html') ? target.replace(/index\.html$/, '') : target;
  const isOfficial = official || /(?:^\?|&)lang=(?:en|de)(?:&|$)/.test(query);
  const inTree = !isOfficial && pages.includes(asPage) && (asPage === target || target.endsWith('index.html'));
  const finalTarget = inTree ? `${code}/${target}` : target;
  const fromDir = `${code}/${page.path}`;
  if (pathPart === '' && inTree) return query + hash || './';
  return relativeTo(fromDir, finalTarget) + query + hash;
}

function rewriteLinks(html, page, code, pages) {
  const doc = parse(html);
  const edits = [];
  for (const el of walk(doc)) {
    const official = ['en', 'de'].includes(attr(el, 'hreflang'));
    for (const a of el.attrs) {
      if (!LINK_ATTRS.has(a.name) || a.raw === null) continue;
      let value;
      if (a.name.endsWith('srcset')) {
        value = a.value.split(',').map((part) => {
          const [url, ...rest] = part.trim().split(/\s+/);
          return [rewriteRef(url, page, code, pages, false), ...rest].join(' ');
        }).join(', ');
      } else {
        value = rewriteRef(a.value, page, code, pages, official);
      }
      if (value !== a.value) edits.push({ start: a.start, end: a.end, text: ` ${a.name}="${escapeAttr(value)}"` });
    }
  }
  return splice(html, edits);
}

function setAttr(el, name, value, edits) {
  const a = el.attrs.find((x) => x.name === name);
  if (a) edits.push({ start: a.start, end: a.end, text: ` ${name}="${escapeAttr(value)}"` });
}

// Where an app page (no site header) wants the banner.
const BANNER_MARKER = '<!-- i18n-banner -->';

/** One page of a language. */
export function buildPage(page, lang, { tr, languages, hashes, pageTexts = {} }) {
  const code = lang.code;
  const pages = translatedPaths();
  const treeFile = `${code}/${page.file}`;
  let html = read(page.file);
  if (!page.app && (!NAV_PATTERN.test(html) || !FOOTER_PATTERN.test(html))) throw new Error(`${page.file}: navigation or footer links not found`);
  if (page.app && !html.includes(BANNER_MARKER)) throw new Error(`${page.file}: app page without the marker ${BANNER_MARKER}`);
  if (!HEAD_PATTERN.test(html)) throw new Error(`${page.file}: head script not found`);
  if (!page.app) {
    html = html
      .replace(NAV_PATTERN, () => siteNav(page.prefix, page.current, { tr, lang: code, languages, path: page.path }))
      .replace(FOOTER_PATTERN, () => siteFooterLinks(page.prefix, page.current, { tr, lang: code }));
  }

  const doc = parse(html);
  const edits = [];
  const { pairs } = findPairs(html, doc);
  const inPair = new Set();
  for (const p of pairs) {
    for (const el of walk(p.en)) inPair.add(el);
    for (const el of walk(p.de)) inPair.add(el);
    const open = html.slice(p.en.start, p.en.tagEnd).replace(/\slang="en"/, ` lang="${lang.hreflang}"`);
    edits.push({ start: p.start, end: p.end, text: `${open}${tr(inner(html, p.en))}</${p.en.name}>` });
  }
  const pairEls = new Set(pairs.flatMap((p) => [p.en, p.de]));
  let header = null;
  const head = [];
  for (const el of walk(doc)) {
    if (inPair.has(el) || pairEls.has(el)) continue;
    if (el.name === 'header' && hasClass(el, 'site-header') && !header) header = el;
    for (const a of TEXT_ATTRS) {
      const de = el.attrs.find((x) => x.name === `data-de-${a}`);
      if (!de) continue;
      setAttr(el, a, tr(attr(el, a) || ''), edits);
      edits.push({ start: de.start, end: de.end, text: '' });
    }
    if (el.name === 'html') {
      setAttr(el, 'lang', lang.hreflang, edits);
      for (const a of el.attrs) if (/^data-(title|description)-(en|de)$/.test(a.name)) edits.push({ start: a.start, end: a.end, text: '' });
    }
    if (el.name === 'title') edits.push({ start: el.innerStart, end: el.innerEnd, text: tr(inner(html, el)) });
    if (el.name === 'meta') {
      const name = attr(el, 'name') || attr(el, 'property');
      if (META_TEXTS.includes(name)) setAttr(el, 'content', tr(attr(el, 'content') || ''), edits);
      if (name === 'og:url') setAttr(el, 'content', `${SITE}${code}/${page.path}`, edits);
    }
    if (el.name === 'link' && attr(el, 'rel') === 'canonical') setAttr(el, 'href', `${SITE}${code}/${page.path}`, edits);
  }
  if (!header && !page.app) throw new Error(`${page.file}: <header class="site-header"> not found`);
  const texts = Object.fromEntries(Object.keys(pageTexts).sort().map((k) => [k, pageTexts[k]]));
  head.push(
    `<meta name="pw-root" content="../${page.prefix}">`,
    `<meta name="pw-lang" content="${code}">`,
    `<meta property="og:locale" content="${lang.og}">`,
    ...alternateLinks(page.path, languages),
    `<link rel="stylesheet" href="${page.prefix}assets/css/i18n.css">`,
  );
  if (Object.keys(texts).length) head.push(`<script type="application/json" id="pw-i18n-page">${JSON.stringify(texts).replace(/</g, '\\u003c')}</script>`);
  head.push(TREE_HEAD_SCRIPT);
  const headMatch = HEAD_PATTERN.exec(html);
  edits.push({ start: headMatch.index, end: headMatch.index + headMatch[0].length, text: head.join('\n') });
  const banner = `\n<aside class="i18n-banner" role="note" lang="${lang.hreflang}">
  <div class="wrap i18n-banner__inner">
    <span class="i18n-banner__tag">${tr(PHRASES.tag)}</span>
    <p>${tr(PHRASES.banner)} <span class="i18n-banner__links"><a href="?lang=en" hreflang="en">${tr(PHRASES.english)}</a> · <a href="?lang=de" hreflang="de">${tr(PHRASES.german)}</a></span></p>
  </div>
</aside>`;
  if (page.app) {
    const at = html.indexOf(BANNER_MARKER);
    edits.push({ start: at, end: at + BANNER_MARKER.length, text: banner.trim().replace('<div class="wrap i18n-banner__inner">', '<div class="i18n-banner__inner">') });
  } else {
    edits.push({ start: header.end, end: header.end, text: banner });
  }
  html = splice(html, edits);
  html = rewriteLinks(html, page, code, pages);
  return stampHtml(treeFile, html, hashes);
}

/**
 * All files of the given languages: Map of path below the root → content.
 * @param {object} options  languages (default: active), mode ('strict' | 'pseudo' | 'preview'), withRoot (also the
 *   English/German pages with the language menu and alternates of these languages, for a preview folder)
 */
export function buildSite({ languages = activeLanguages(), mode = 'strict', withRoot = false } = {}) {
  const hashes = computeHashes();
  const extracted = extract({ languages });
  const files = new Map();
  const report = [];
  const pages = translatedPaths();
  for (const lang of languages) {
    const { tr, missing, used } = translator(lang, mode);
    const pageTexts = Object.fromEntries([...extracted.page].map((k) => [k, tr(k)]));
    for (const page of extracted.pages) files.set(`${lang.code}/${page.file}`, buildPage(page, lang, { tr, languages, hashes, pageTexts }));
    const runtime = [...extracted.runtime].sort();
    const lines = runtime.map((k) => `${JSON.stringify(k)}:${JSON.stringify(tr(k))}`);
    files.set(`assets/i18n/${lang.code}.json`, `{"schema":1,"lang":${JSON.stringify(lang.code)},"pages":${JSON.stringify(pages)},"texts":{\n${lines.join(',\n')}\n}}\n`);
    for (const k of extracted.entries.keys()) tr(k);
    report.push({ code: lang.code, missing: [...missing], used: used.size });
  }
  if (withRoot) {
    for (const [file, prefix, current] of HAND_PAGES) files.set(file, buildHandPage(read(file), prefix, current, file, { languages }, hashes));
    for (const [file, prefix] of APP_PAGES) files.set(file, buildAppPage(read(file), prefix, file, { languages }, hashes));
    for (const page of extracted.pages.filter((p) => p.file.startsWith('docs/'))) {
      const html = withHead(withNav(read(page.file), page.prefix, page.current, page.file, { languages, path: page.path }), page.prefix, page.file, { languages });
      files.set(page.file, stampHtml(page.file, html, hashes));
    }
  }
  return { files, report, extracted };
}

function listFiles(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(rel));
    else out.push(rel);
  }
  return out;
}

/** Generated files there are now (language trees and assets/i18n/). */
export function generatedFiles() {
  return [...LANGUAGES.flatMap((l) => listFiles(l.code)), ...listFiles('assets/i18n')].sort();
}

/** The mod's names of tabs, buttons, keys, modes and world rules: short texts of its English language file. */
export function uiTerms(repo) {
  const file = path.join(repo, 'common/src/main/resources/assets/propwash/lang/en_us.json');
  const lang = JSON.parse(fs.readFileSync(file, 'utf8'));
  const props = fs.readFileSync(path.join(repo, 'gradle.properties'), 'utf8');
  const version = (/^(?:mod_)?version\s*=\s*(\S+)/m.exec(props) || [])[1] || 'unknown';
  const terms = new Set();
  for (const [key, value] of Object.entries(lang)) {
    if (typeof value !== 'string' || key.startsWith('propwash.guide.')) continue;
    const v = value.trim();
    if (v.length < 2 || v.length > 40 || v.split(/\s+/).length > 5) continue;
    if (/[%§{}\[\]<>\n]|[.!?:;,]$|\d{3,}/.test(v) || !/^\p{Lu}/u.test(v) || !/\p{L}{2}/u.test(v)) continue;
    terms.add(v);
  }
  return { schema: 1, source: `Propwash ${version}, assets/propwash/lang/en_us.json`, terms: [...terms].sort((a, b) => a.localeCompare(b, 'en')) };
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const has = (f) => process.argv.includes(f);
  if (arg('--propwash')) {
    const data = uiTerms(path.resolve(arg('--propwash')));
    fs.writeFileSync(path.join(I18N_DIR, 'ui-terms.json'), `${JSON.stringify(data, null, 1)}\n`);
    console.log(`tools/i18n/ui-terms.json: ${data.terms.length} terms from ${data.source}`);
    process.exit(0);
  }
  if (has('--stats')) {
    const { entries, runtime, pages } = extract();
    const per = new Map();
    let total = 0;
    for (const [key, e] of entries) {
      const w = words(key);
      total += w;
      for (const s of e.sources) per.set(s, (per.get(s) || 0) + w);
    }
    console.log(`${entries.size} texts, ${total} words (${runtime.size} texts for the scripts), ${pages.length} pages`);
    for (const [s, w] of [...per].sort((a, b) => b[1] - a[1])) console.log(`  ${String(w).padStart(6)}  ${s}`);
    process.exit(0);
  }
  if (arg('--missing')) {
    const lang = byCode(arg('--missing'));
    if (!lang) { console.error(`unknown language ${arg('--missing')}`); process.exit(2); }
    const { entries } = extract();
    const dict = loadDict(lang.code);
    const missing = [...entries].filter(([k]) => !Object.prototype.hasOwnProperty.call(dict.entries, k)).map(([k, e]) => ({
      key: k, words: words(k), sources: [...e.sources].sort(), ...(lang.drafts && lang.drafts[k] !== undefined ? { draft: lang.drafts[k] } : {}),
    }));
    const stale = Object.keys(dict.entries).filter((k) => !entries.has(k));
    // Written before the exit: a long list on a pipe (test-news-060 reads it) would be cut off by process.exit().
    await new Promise((resolve) => process.stdout.write(`${JSON.stringify({ lang: lang.code, texts: entries.size, translated: entries.size - missing.length, missing, stale }, null, 1)}\n`, resolve));
    process.exit(0);
  }
  const out = arg('--out');
  const codes = arg('--lang');
  let languages = activeLanguages();
  if (codes) {
    languages = codes.split(',').map((c) => byCode(c.trim()) || (() => { throw new Error(`unknown language ${c}`); })());
    if (!out && languages.some((l) => !l.active)) {
      console.error('a language that is not active goes only into a preview folder (--out <dir>)');
      process.exit(2);
    }
  }
  const mode = has('--pseudo') ? 'pseudo' : has('--allow-missing') ? 'preview' : 'strict';
  const { files, report } = buildSite({ languages, mode, withRoot: !!out });
  const incomplete = report.filter((r) => r.missing.length);
  if (mode === 'strict' && incomplete.length) {
    for (const r of incomplete) console.error(`${r.code}: ${r.missing.length} texts without translation (node tools/i18n/build-i18n.mjs --missing ${r.code})`);
    process.exit(1);
  }
  if (out) {
    for (const [rel, content] of files) {
      const target = path.join(path.resolve(out), rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
    console.log(`${files.size} files written into ${out} (${languages.map((l) => l.code).join(', ')}, ${mode})`);
    process.exit(0);
  }
  const existing = generatedFiles();
  const stale = existing.filter((f) => !files.has(f));
  const changed = [...files].filter(([rel, content]) => !fs.existsSync(path.join(ROOT, rel)) || read(rel) !== content).map(([rel]) => rel);
  if (has('--check')) {
    if (stale.length || changed.length) {
      console.log(`language pages out of date: ${[...changed, ...stale.map((f) => `${f} (left over)`)].slice(0, 20).join(', ')}${changed.length + stale.length > 20 ? ' …' : ''} – run node tools/i18n/build-i18n.mjs`);
      process.exit(1);
    }
    console.log(`language pages: up to date (${languages.length ? languages.map((l) => l.code).join(', ') : 'no other language active'}, ${files.size} files)`);
    process.exit(0);
  }
  for (const rel of changed) {
    const target = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, files.get(rel));
  }
  for (const rel of stale) fs.rmSync(path.join(ROOT, rel));
  console.log(`language pages: ${changed.length} written, ${stale.length} removed (${languages.map((l) => l.code).join(', ') || 'no other language active'})`);
}
