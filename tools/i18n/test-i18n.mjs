#!/usr/bin/env node
// Checks of the language support (tools/i18n/, assets/js/i18n.js, assets/css/i18n.css, assets/fonts/).
//
//   node tools/i18n/test-i18n.mjs
//
// 1. assets/js/i18n.js: root(), the page language, lookup of translated texts, spans, links and numbers
// 2. tools/i18n/languages.json: the languages of assets/js/i18n.js, drafts of the banner, the hint and the menu
// 3. fonts: every letter of every language (alphabet, drafts, dictionary) is in the fonts its pages load, read from
//    the WOFF2 files' cmap; the @font-face rules point to those files
// 4. sources: every page to translate has its head block, navigation, footer links and header, only complete
//    lang="en"/lang="de" pairs, and the head block of the hand-written pages is current (tools/build-nav.mjs)
// 5. a pseudo build of all five languages (tools/i18n/pseudo.mjs) in memory, checked like real pages: no EN/DE pairs
//    left, lang attributes, banner with working EN/DE links, head (pw-lang, pw-root, canonical, og:locale, hreflang
//    complete and mutual), every local link resolves, assets/i18n/<lang>.json
// 6. every active language: its dictionary covers every text and has no stale entries; per entry the same tags,
//    attributes, links, numbers, units and code spans as the English text, glossary terms and the game's UI terms
//    (tools/i18n/ui-terms.json) unchanged, no English left, no term of the local denylist; length ratio 0.6–1.8 is
//    reported as a hint for the reviewers; the generated pages are current (build-i18n.mjs --check)
// 7. no term of the local denylist in the files of the language support. The denylist is the one of the mod's public
//    export (PROPWASH_EXPORT_DENYLIST, otherwise ~/.config/propwash/public-export-denylist.txt), extended by
//    PROPWASH_I18N_DENYLIST, otherwise ~/.config/propwash/i18n-denylist.txt, if there is one (names of models and
//    providers); neither is part of the repository.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createI18n, normalize, fill, EXTRA, OFFICIAL, LOCALES } from '../../assets/js/i18n.js';
import { ROOT, I18N_DIR, SITE, LANGUAGES, PHRASES, activeLanguages, loadDict } from './languages.mjs';
import { sourcePages, runtimeSources, translatedPaths } from './pages.mjs';
import { extract, pageTexts } from './extract.mjs';
import { parse, walk, attr, hasClass, findPairs, inner, plain, tagSignature } from './html.mjs';
import { charsOf } from './fonts.mjs';
import { buildSite, generatedFiles } from './build-i18n.mjs';
import { HAND_PAGES, buildPage as buildHandPage } from '../build-nav.mjs';
import { HEAD_PATTERN, NAV_PATTERN, FOOTER_PATTERN, TREE_HEAD_SCRIPT } from '../site-nav.mjs';

let checks = 0;
const failures = [];
function check(ok, message) {
  checks++;
  if (!ok) failures.push(message);
}
const eq = (actual, expected, message) => check(actual === expected, `${message}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);

function fakeDocument({ url, lang = 'en', meta = {} }) {
  const node = (tag) => ({
    tag, attrs: {}, children: [], text: '',
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    appendChild(c) { this.children.push(c); return c; },
    set textContent(v) { this.text = String(v); },
    get textContent() { return this.text; },
  });
  return {
    baseURI: url,
    documentElement: { lang },
    querySelector(sel) {
      const m = /^meta\[name="([^"]+)"\]$/.exec(sel);
      if (!m || !(m[1] in meta)) return null;
      return { getAttribute: (k) => (k === 'content' ? meta[m[1]] : null) };
    },
    createDocumentFragment: () => node('#fragment'),
    createElement: (tag) => node(tag),
    createTextNode: (t) => ({ tag: '#text', text: t }),
  };
}

// 1. assets/js/i18n.js
{
  eq(normalize('  Open the tab\n   <strong>World rules</strong>. '), 'Open the tab <strong>World rules</strong>.', 'normalize collapses whitespace');
  eq(fill('{done} of {total}', { done: 3, total: 5 }), '3 of 5', 'fill');
  eq(fill('{done} of {total}', { done: 3 }), '3 of {total}', 'fill keeps unknown placeholders');
  check(EXTRA.join() === 'es,fr,pt-br,pl,ru' && OFFICIAL.join() === 'en,de', 'language codes');
  eq(LOCALES['pt-br'], 'pt-BR', 'locale of pt-br');

  const home = createI18n({ document: fakeDocument({ url: `${SITE}roadmap/`, lang: 'de' }), root: '../' });
  eq(home.root(), SITE, 'root() on /roadmap/ with pw-root ../');
  eq(home.root('assets/data/roadmap.json'), `${SITE}assets/data/roadmap.json`, 'root(path)');
  eq(home.lang(), 'de', 'lang() follows the switch on English/German pages');
  check(!home.translated(), 'English/German page is not translated');
  eq(home.text({ en: 'Done', de: 'Erledigt' }), 'Erledigt', 'text() on a German page');
  eq(home.lookup('Done'), 'Done', 'lookup() is the identity on English/German pages');
  eq(home.href('../docs/api/'), '../docs/api/', 'href() leaves links on English/German pages alone');
  const both = home.spans({ en: 'Done', de: 'Erledigt' });
  eq(both.children.map((c) => `${c.attrs.lang}:${c.text}`).join('|'), 'en:Done|de:Erledigt', 'spans() gives both languages');
  eq(home.spans('Propwash').children.map((c) => c.tag).join(), '#text', 'spans() of a plain string is text');
  eq(home.number(1234.5, { maximumFractionDigits: 1 }), '1.234,5', 'number() in German');

  const noMeta = createI18n({ document: fakeDocument({ url: `${SITE}docs/guide/` }) });
  check(noMeta.root().endsWith('/') && new URL('assets/js/i18n.js', noMeta.root()).protocol === 'file:', 'root() without pw-root comes from the script location');

  const fetched = [];
  const fr = createI18n({
    document: fakeDocument({ url: `${SITE}fr/roadmap/`, lang: 'fr', meta: { 'pw-lang': 'fr', 'pw-root': '../../' } }),
    fetch: (url) => {
      fetched.push(url);
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ schema: 1, lang: 'fr', pages: ['', 'roadmap/', 'changelog/'], texts: { 'Done': 'Terminé', '{done} of {total}': '{done} sur {total}' } }) });
    },
  });
  eq(fr.root(), SITE, 'root() on /fr/roadmap/ with pw-root ../../');
  eq(fr.lang(), 'fr', 'lang() on a French page');
  eq(fr.locale(), 'fr', 'locale() on a French page');
  check(fr.translated(), 'French page is translated');
  await fr.load();
  await fr.load();
  eq(fetched.join(), `${SITE}assets/i18n/fr.json`, 'load() fetches assets/i18n/fr.json once');
  eq(fr.lookup('  Done '), 'Terminé', 'lookup() normalizes the key');
  eq(fr.text({ en: '{done} of {total}', de: '{done} von {total}' }, { done: 2, total: 4 }), '2 sur 4', 'text() fills placeholders of the translation');
  eq(fr.lookup('Not there'), 'Not there', 'lookup() falls back to English');
  check(fr.missing().includes('Not there'), 'missing() lists texts without translation');
  const one = fr.spans({ en: 'Done', de: 'Erledigt' });
  eq(one.children.map((c) => `${c.attrs.lang}:${c.text}`).join('|'), 'fr:Terminé', 'spans() gives one span on a French page');
  eq(fr.href('../changelog/#propwash-0.5.2'), '../changelog/#propwash-0.5.2', 'href() keeps links to translated pages');
  eq(fr.href('../docs/api/#events'), `${SITE}docs/api/#events`, 'href() sends untranslated pages to the root');
  eq(fr.href('../roadmap/?lang=de'), `${SITE}roadmap/?lang=de`, 'href() sends EN/DE links to the root');
  eq(fr.href('https://modrinth.com/mod/propwash-fpv'), 'https://modrinth.com/mod/propwash-fpv', 'href() leaves external links alone');
  eq(fr.href('#top'), '#top', 'href() leaves anchors alone');
  eq(fr.number(1234.5, { maximumFractionDigits: 1 }).replace(/\s/g, ' '), '1 234,5', 'number() in French');

  const broken = createI18n({
    document: fakeDocument({ url: `${SITE}ru/`, lang: 'ru', meta: { 'pw-lang': 'ru', 'pw-root': '../' } }),
    fetch: () => Promise.resolve({ ok: false, status: 404 }),
  });
  await broken.load();
  check(broken.error instanceof Error, 'load() keeps the error of a failed fetch');
  eq(broken.lookup('Done'), 'Done', 'a failed load() leaves English texts');
  eq(broken.root(), SITE, 'root() on /ru/');
}

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

// 2. languages.json
{
  eq(LANGUAGES.map((l) => l.code).join(), EXTRA.join(), 'languages.json has the languages of assets/js/i18n.js');
  for (const l of LANGUAGES) {
    eq(l.hreflang, LOCALES[l.code], `${l.code}: hreflang`);
    check(/^[a-z]{2}_[A-Z]{2}$/.test(l.og || ''), `${l.code}: og:locale ${l.og}`);
    check(!!l.name && typeof l.active === 'boolean', `${l.code}: name and active`);
    for (const key of Object.values(PHRASES)) check(typeof l.drafts?.[key] === 'string' && l.drafts[key].trim() !== '', `${l.code}: draft for "${key}"`);
    const banner = l.drafts?.[PHRASES.banner] || '';
    check(banner.includes(l.drafts?.[PHRASES.tag] || '?'), `${l.code}: the banner names the AI as in its tag (${l.drafts?.[PHRASES.tag]})`);
    check(((l.drafts?.[PHRASES.hint] || '').match(/<a>[^<]+<\/a>/g) || []).length === 1, `${l.code}: the hint has one <a>…</a>`);
    check(!/<(?!\/?a>)/.test(l.drafts?.[PHRASES.hint] || ''), `${l.code}: the hint has no other markup`);
  }
  eq(OFFICIAL.join(), 'en,de', 'official languages');
}

// 3. fonts
const ALPHABETS = {
  es: 'áéíóúüñÁÉÍÓÚÜÑ¿¡«»',
  fr: 'àâæçéèêëîïôœùûüÿÀÂÆÇÉÈÊËÎÏÔŒÙÛÜŸ«»',
  'pt-br': 'ãõáâàçéêíóôúüÃÕÁÂÀÇÉÊÍÓÔÚÜ',
  pl: 'ąćęłńóśźżĄĆĘŁŃÓŚŹŻ„”',
  ru: 'абвгдеёжзийклмнопрстуфхцчшщъыьэюяАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ«»—№',
};
const COMMON = 'äöüßÄÖÜ–—„“”‘’…·×°±−→←↑↓€ ';
const FONT_FILES = {
  sans: ['assets/fonts/saira-var.woff2'], mono: ['assets/fonts/jetbrains-mono-var.woff2'],
  ruSans: ['assets/fonts/saira-var.woff2', 'assets/fonts/exo2-cyrillic-var.woff2'],
  ruMono: ['assets/fonts/jetbrains-mono-var.woff2', 'assets/fonts/jetbrains-mono-cyrillic-var.woff2'],
};
const fontChars = new Map();
for (const file of new Set(Object.values(FONT_FILES).flat())) {
  check(exists(file), `${file} is there`);
  if (exists(file)) fontChars.set(file, charsOf(path.join(ROOT, file)));
}
const covered = (files, ch) => files.some((f) => fontChars.get(f)?.has(ch.codePointAt(0)));
{
  const css = read('assets/css/style.css');
  check(/font-family: "PW Saira";\n  src: url\("\.\.\/fonts\/saira-var\.woff2"\)/.test(css), 'style.css loads saira-var.woff2');
  check(/font-family: "PW Mono";\n  src: url\("\.\.\/fonts\/jetbrains-mono-var\.woff2"\)/.test(css), 'style.css loads jetbrains-mono-var.woff2');
  const i18nCss = read('assets/css/i18n.css');
  for (const [family, file] of [['PW Saira Cyrillic', 'exo2-cyrillic-var.woff2'], ['PW Mono Cyrillic', 'jetbrains-mono-cyrillic-var.woff2']]) {
    check(new RegExp(`font-family: "${family}";\\n  src: url\\("\\.\\./fonts/${file.replace(/\./g, '\\.')}"\\)`).test(i18nCss), `i18n.css: ${family} from ${file}`);
    check(i18nCss.includes(`"${family}"`) && /html\[lang="ru"\] \{[^}]*"PW Saira Cyrillic"[^}]*"PW Mono Cyrillic"/.test(i18nCss), `i18n.css: the Russian pages use ${family}`);
  }
  check(exists('assets/fonts/OFL-Saira.txt') && exists('assets/fonts/OFL-JetBrainsMono.txt') && exists('assets/fonts/OFL-Exo2.txt'), 'OFL texts of the three fonts');
  for (const l of LANGUAGES) {
    const sans = l.code === 'ru' ? FONT_FILES.ruSans : FONT_FILES.sans;
    const mono = l.code === 'ru' ? FONT_FILES.ruMono : FONT_FILES.mono;
    const dict = loadDict(l.code);
    const text = ALPHABETS[l.code] + COMMON + Object.values(l.drafts).join('') + Object.values(dict.entries).map(plain).join('');
    const lost = new Set();
    const lostMono = new Set();
    for (const ch of text) {
      if (/\s/.test(ch) && ch !== ' ' && ch !== ' ') continue;
      if (!covered(sans, ch)) lost.add(ch);
      if (!covered(mono, ch)) lostMono.add(ch);
    }
    check(!lost.size, `${l.code}: letters missing in the text fonts: ${[...lost].map((c) => `${c} U+${c.codePointAt(0).toString(16).toUpperCase()}`).join(', ')}`);
    check(!lostMono.size, `${l.code}: letters missing in the monospaced fonts: ${[...lostMono].map((c) => `${c} U+${c.codePointAt(0).toString(16).toUpperCase()}`).join(', ')}`);
  }
}

// 4. sources
const extracted = extract();
{
  for (const page of sourcePages()) {
    const html = read(page.file);
    check(HEAD_PATTERN.test(html), `${page.file}: head script (tools/site-nav.mjs HEAD_PATTERN)`);
    if (page.app) {
      // App page (the simulator): no navigation, the banner goes to its marker.
      check(!NAV_PATTERN.test(html) && html.includes('<!-- i18n-banner -->'), `${page.file}: app page without navigation, with the marker <!-- i18n-banner -->`);
    } else {
      check(NAV_PATTERN.test(html) && FOOTER_PATTERN.test(html), `${page.file}: navigation and footer links`);
      check(/<header class="site-header">/.test(html), `${page.file}: <header class="site-header">`);
    }
    const { single, texts } = pageTexts(html);
    check(!single.length, `${page.file}: lang="en"/"de" without its partner: ${single.slice(0, 3).map((el) => html.slice(el.start, el.start + 60)).join(' | ')}`);
    const nested = findPairs(html).pairs.filter((p) => /\slang="(?:en|de)"/.test(inner(html, p.en)));
    check(!nested.length, `${page.file}: pairs inside pairs (${nested.length})`);
    check(texts.length > 3, `${page.file}: texts found (${texts.length})`);
  }
  for (const source of runtimeSources()) check(extracted.entries.size && [...extracted.entries.values()].some((e) => e.sources.has(source.file)), `${source.file}: texts found`);
  check(extracted.page.has('Enlarge screenshot'), 'texts of main.js for the pages');
  check(extracted.entries.size > 1000, `${extracted.entries.size} texts to translate`);
  for (const [file, prefix, current] of HAND_PAGES) {
    const html = read(file);
    check(buildHandPage(html, prefix, current, file) === html, `${file}: head block, navigation or footer links out of date (node tools/build-nav.mjs)`);
    check(new RegExp(`<meta name="pw-root" content="${prefix || './'}">\\n(?:<link [^>]*>\\n)*<script data-pw-head>`).test(html), `${file}: pw-root and head script`);
  }
  if (activeLanguages().length) {
    for (const page of sourcePages()) {
      const html = read(page.file);
      check(/<link rel="stylesheet" href="[^"]*assets\/css\/i18n\.css\?v=[0-9a-f]{8}">/.test(html), `${page.file}: loads i18n.css (siteHead of tools/site-nav.mjs)`);
      for (const l of activeLanguages()) check(html.includes(`<link rel="alternate" hreflang="${l.hreflang}" href="${SITE}${l.code}/${page.path}">`), `${page.file}: hreflang ${l.hreflang}`);
      check(html.includes('data-lang-menu'), `${page.file}: language menu`);
    }
  }
}

// 5. generated pages (pseudo build of every language; with active languages also the real ones)
function checkGenerated(files, languages, label) {
  const paths = translatedPaths();
  const has = (rel) => files.has(rel) || exists(rel);
  const pageAt = (rel) => (files.has(rel) ? files.get(rel) : exists(rel) ? read(rel) : null);
  for (const l of languages) {
    const runtimeFile = `assets/i18n/${l.code}.json`;
    let runtime = null;
    try { runtime = JSON.parse(files.get(runtimeFile)); } catch { runtime = null; }
    check(!!runtime && runtime.lang === l.code && JSON.stringify(runtime.pages) === JSON.stringify(paths), `${label} ${runtimeFile}: lang and pages`);
    if (runtime) check(Object.keys(runtime.texts).length === extracted.runtime.size, `${label} ${runtimeFile}: ${Object.keys(runtime.texts).length} texts for the scripts, expected ${extracted.runtime.size}`);
    for (const pagePath of paths) {
      const rel = `${l.code}/${pagePath}index.html`;
      const where = `${label} ${rel}`;
      const html = files.get(rel);
      check(!!html, `${where}: generated`);
      if (!html) continue;
      const doc = parse(html);
      const { pairs } = findPairs(html, doc);
      check(!pairs.length, `${where}: ${pairs.length} EN/DE pairs left`);
      const els = [...walk(doc)];
      const htmlEl = els.find((e) => e.name === 'html');
      eq(attr(htmlEl, 'lang'), l.hreflang, `${where}: <html lang>`);
      check(!htmlEl.attrs.some((a) => /^data-(title|description)-/.test(a.name)), `${where}: no data-title-*/data-description-*`);
      const badLang = els.filter((e) => e !== htmlEl && attr(e, 'lang') !== null && ![l.hreflang, 'en'].includes(attr(e, 'lang')) && !hasClass(e, 'keep'));
      check(!badLang.length, `${where}: lang attributes of other languages: ${badLang.slice(0, 3).map((e) => html.slice(e.start, e.start + 60)).join(' | ')}`);
      check(!els.some((e) => e.attrs.some((a) => a.name.startsWith('data-de-'))), `${where}: data-de-* left`);
      const meta = (name) => attr(els.find((e) => e.name === 'meta' && (attr(e, 'name') === name || attr(e, 'property') === name)) || { attrs: [] }, 'content');
      eq(meta('pw-lang'), l.code, `${where}: pw-lang`);
      check(['.', './'].includes(path.posix.normalize(path.posix.join(path.posix.dirname(rel), meta('pw-root') || 'x'))), `${where}: pw-root ${meta('pw-root')} does not lead to the root`);
      eq(meta('og:locale'), l.og, `${where}: og:locale`);
      eq(meta('og:url'), `${SITE}${l.code}/${pagePath}`, `${where}: og:url`);
      const canonical = els.find((e) => e.name === 'link' && attr(e, 'rel') === 'canonical');
      eq(canonical && attr(canonical, 'href'), `${SITE}${l.code}/${pagePath}`, `${where}: canonical`);
      const alternates = new Map(els.filter((e) => e.name === 'link' && attr(e, 'rel') === 'alternate').map((e) => [attr(e, 'hreflang'), attr(e, 'href')]));
      const wanted = new Map([['en', `${SITE}${pagePath}`], ['de', `${SITE}${pagePath}?lang=de`], ['x-default', `${SITE}${pagePath}`], ...languages.map((x) => [x.hreflang, `${SITE}${x.code}/${pagePath}`])]);
      check(alternates.size === wanted.size && [...wanted].every(([k, v]) => alternates.get(k) === v), `${where}: hreflang alternates ${JSON.stringify([...alternates])}`);
      for (const [hl, url] of alternates) {
        if (hl === 'x-default' || hl === 'de') continue;
        const other = pageAt(`${url.slice(SITE.length)}index.html`);
        check(!!other && other.includes(`<link rel="alternate" hreflang="${l.hreflang}" href="${SITE}${l.code}/${pagePath}">`), `${where}: hreflang ${hl} does not point back`);
      }
      check(html.includes(TREE_HEAD_SCRIPT), `${where}: head script of the language pages`);
      check(/<link rel="stylesheet" href="[^"]*assets\/css\/i18n\.css\?v=[0-9a-f]{8}">/.test(html), `${where}: i18n.css stamped`);
      const banners = els.filter((e) => e.name === 'aside' && hasClass(e, 'i18n-banner'));
      check(banners.length === 1, `${where}: ${banners.length} banners`);
      const header = els.find((e) => e.name === 'header' && hasClass(e, 'site-header'));
      const app = !header && !html.includes('<!-- i18n-banner -->') && /<main class="sim"/.test(html);
      if (banners[0] && (header || app)) {
        const b = banners[0];
        if (header) check(!html.slice(header.end, b.start).trim(), `${where}: banner right under the header`);
        else check(/<aside class="sim__about"[\s\S]*<aside class="i18n-banner/.test(html), `${where}: banner inside the note of the app page`);
        eq(attr(b, 'role'), 'note', `${where}: banner role`);
        eq(attr(b, 'lang'), l.hreflang, `${where}: banner lang`);
        check(plain(inner(html, b)).includes(l.drafts.AI), `${where}: banner names the AI (${l.drafts.AI})`);
        const links = [...walk(b)].filter((e) => e.name === 'a');
        for (const official of ['en', 'de']) {
          const a = links.find((e) => attr(e, 'hreflang') === official);
          const target = a && new URL(attr(a, 'href'), `${SITE}${rel}`);
          check(!!target && target.href === `${SITE}${pagePath}?lang=${official}`, `${where}: banner link ${official} leads to ${target && target.href}`);
        }
      }
      for (const e of els) {
        for (const a of e.attrs) {
          if (!['href', 'src', 'srcset', 'poster', 'data-zoom-src'].includes(a.name)) continue;
          const refs = a.name === 'srcset' ? a.value.split(',').map((x) => x.trim().split(/\s+/)[0]) : [a.value];
          for (const ref of refs) {
            if (!ref || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\?)/i.test(ref)) continue;
            const clean = ref.split('#')[0].split('?')[0];
            let target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), clean));
            if (target.startsWith('..')) { check(false, `${where}: ${ref} leaves the site`); continue; }
            if (clean.endsWith('/') || target === '.') target = path.posix.join(target === '.' ? '' : target, 'index.html');
            check(has(target), `${where}: ${ref} not found (${target})`);
          }
        }
      }
    }
  }
}
{
  const { files } = buildSite({ languages: LANGUAGES, mode: 'pseudo', withRoot: true });
  checkGenerated(files, LANGUAGES, 'pseudo');
  for (const [file] of HAND_PAGES) {
    const html = files.get(file);
    check(!!html && html.includes('data-lang-menu') && /assets\/css\/i18n\.css\?v=/.test(html), `pseudo ${file}: language menu and i18n.css with every language`);
  }
}

// 6. active languages
const GLOSSARY = JSON.parse(fs.readFileSync(path.join(I18N_DIR, 'glossary.json'), 'utf8'));
const UI_TERMS = new Set(JSON.parse(fs.readFileSync(path.join(I18N_DIR, 'ui-terms.json'), 'utf8')).terms);
const UNITS = /\d[\d.,]*\s?(mAh|mm|cm|km\/h|m\/s|ms|min|kHz|Hz|KV|kV|°C|°|%|Wh|kg|W|V|A|g|s|m|h|C)(?![\p{L}\d])/gu;
const ENGLISH = new Set(['the', 'and', 'of', 'to', 'with', 'is', 'are', 'for', 'your', 'you', 'this', 'that', 'it', 'in', 'on', 'from', 'when', 'what', 'which', 'can', 'will', 'be', 'not', 'or', 'an', 'its', 'by', 'as', 'at']);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const numbers = (t) => (plain(t).match(/\d+/g) || []).sort().join(' ');
const codes = (t) => [...t.matchAll(/<(code|kbd)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => m[2]).sort().join('|');
const marked = (t) => [...t.matchAll(/<(strong|em|b)>([^<]+)<\/\1>/g)].filter((m) => UI_TERMS.has(m[2].trim())).map((m) => m[0]);
const DENY_BASE = process.env.PROPWASH_EXPORT_DENYLIST || path.join(os.homedir(), '.config', 'propwash', 'public-export-denylist.txt');
const DENY_EXTRA = process.env.PROPWASH_I18N_DENYLIST || path.join(os.homedir(), '.config', 'propwash', 'i18n-denylist.txt');
const denyTerms = [DENY_BASE, DENY_EXTRA].filter((f) => fs.existsSync(f)).flatMap((f) => fs.readFileSync(f, 'utf8').split(/\r?\n/))
  .map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith('#'));
const denied = (text) => denyTerms.map((t, i) => (text.toLowerCase().includes(t) ? i + 1 : null)).filter(Boolean);
const hints = [];
for (const l of activeLanguages()) {
  const dict = loadDict(l.code);
  check(!dict.missingFile, `${l.code}: tools/i18n/dict/${l.code}.json is there`);
  check(dict.schema === 1 && dict.lang === l.code && dict.source === 'en', `${l.code}: dictionary header`);
  const missing = [...extracted.entries.keys()].filter((k) => !Object.prototype.hasOwnProperty.call(dict.entries, k));
  const stale = Object.keys(dict.entries).filter((k) => !extracted.entries.has(k));
  check(!missing.length, `${l.code}: ${missing.length} texts without translation (node tools/i18n/build-i18n.mjs --missing ${l.code})`);
  check(!stale.length, `${l.code}: ${stale.length} stale entries (first: ${stale[0]})`);
  const fixed = Object.entries(dict.glossary || {});
  for (const [en, tr] of Object.entries(dict.entries)) {
    if (!extracted.entries.has(en)) continue;
    const where = `${l.code} "${en.slice(0, 50)}"`;
    check(typeof tr === 'string' && tr.trim() !== '', `${where}: empty`);
    if (typeof tr !== 'string') continue;
    check(JSON.stringify(tagSignature(en)) === JSON.stringify(tagSignature(tr)), `${where}: tags, attributes or links differ`);
    check(numbers(en) === numbers(tr), `${where}: numbers differ (${numbers(en)} / ${numbers(tr)})`);
    for (const m of plain(en).matchAll(UNITS)) check(new RegExp(`\\d\\s?${escapeRe(m[1])}(?![\\p{L}\\d])`, 'u').test(plain(tr)), `${where}: unit ${m[1]} missing`);
    check(codes(en) === codes(tr), `${where}: code or key spans differ`);
    for (const term of GLOSSARY.keep) if (new RegExp(`(?<![\\p{L}\\d])${escapeRe(term)}(?![\\p{L}\\d])`, 'u').test(plain(en))) check(plain(tr).includes(term), `${where}: glossary term ${term} changed`);
    for (const [term, fix] of fixed) if (new RegExp(`(?<![\\p{L}])${escapeRe(term)}(?![\\p{L}])`, 'iu').test(plain(en))) check(plain(tr).toLowerCase().includes(String(fix).toLowerCase()), `${where}: glossary term ${term} not "${fix}"`);
    for (const ui of marked(en)) check(tr.includes(ui), `${where}: game UI term ${ui} changed`);
    const w = plain(tr).toLowerCase().split(/[^\p{L}']+/u).filter(Boolean);
    const englishWords = w.filter((x) => ENGLISH.has(x)).length;
    check(!(englishWords >= 3 && englishWords / w.length > 0.25), `${where}: still English (${englishWords} of ${w.length} words)`);
    check(!(tr === en && w.length >= 4 && w.some((x) => ENGLISH.has(x))), `${where}: not translated`);
    check(!denied(tr).length, `${where}: term ${denied(tr).join(', ')} of the denylist`);
    const ratio = plain(tr).length / Math.max(1, plain(en).length);
    if (plain(en).length >= 20 && (ratio < 0.6 || ratio > 1.8)) hints.push(`${where}: length ratio ${ratio.toFixed(2)}`);
  }
}
{
  const { files } = buildSite({ languages: activeLanguages(), mode: 'strict' });
  if (activeLanguages().length) checkGenerated(files, activeLanguages(), 'active');
  const existing = generatedFiles();
  const stale = existing.filter((f) => !files.has(f));
  const changed = [...files].filter(([rel, c]) => !exists(rel) || read(rel) !== c).map(([rel]) => rel);
  check(!stale.length && !changed.length, `generated language pages out of date (node tools/i18n/build-i18n.mjs): ${[...changed, ...stale].slice(0, 5).join(', ')}`);
}

// 7. denylist
{
  check(denyTerms.length > 0, `denylist there and not empty (${DENY_BASE})`);
  const files = ['assets/js/i18n.js', 'assets/css/i18n.css', 'tools/test-layout.mjs', 'tools/site-nav.mjs', 'tools/build-nav.mjs',
    ...fs.readdirSync(I18N_DIR).filter((f) => /\.(mjs|json|py)$/.test(f)).map((f) => `tools/i18n/${f}`)];
  for (const file of files) check(!denied(read(file)).length, `${file}: term ${denied(read(file)).join(', ')} of the denylist`);
}

if (failures.length) {
  console.log(`i18n: ${failures.length} of ${checks} checks FAILED`);
  for (const f of failures.slice(0, 80)) console.log(`  FAIL ${f}`);
  process.exit(1);
}
for (const h of hints.slice(0, 40)) console.log(`  hint ${h}`);
console.log(`i18n: ${checks} checks passed (${extracted.entries.size} texts, ${LANGUAGES.length} languages, ${activeLanguages().length} active${hints.length ? `, ${hints.length} hints for the reviewers` : ''})`);
