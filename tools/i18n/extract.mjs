// Every English text the other languages translate, with where it comes from (tools/i18n/pages.mjs). The key of a
// text is its English source with whitespace collapsed and markup kept (assets/js/i18n.js normalize()), the same
// key the dictionaries tools/i18n/dict/<lang>.json use.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, PHRASES } from './languages.mjs';
import { sourcePages, runtimeSources } from './pages.mjs';
import { parse, findPairs, inner, walk, attr } from './html.mjs';
import { normalize } from '../../assets/js/i18n.js';
import { siteNav, siteFooterLinks, NAV_PATTERN, FOOTER_PATTERN } from '../site-nav.mjs';

export const TEXT_ATTRS = ['alt', 'aria-label', 'title'];
export const META_TEXTS = ['description', 'og:title', 'og:description', 'og:image:alt', 'twitter:title', 'twitter:description', 'twitter:image:alt'];

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** A page without its navigation and footer links (they come from tools/site-nav.mjs in every language). */
export function withoutNav(html) {
  return html.replace(NAV_PATTERN, '').replace(FOOTER_PATTERN, '');
}

/** The texts of the navigation and footer links of a page: siteNav with a recording translation. */
export function navTexts(prefix, current, languages) {
  const seen = [];
  const tr = (en) => {
    seen.push(normalize(en));
    return en;
  };
  siteNav(prefix, current, { tr, lang: 'xx', languages });
  siteFooterLinks(prefix, current, { tr, lang: 'xx' });
  return seen;
}

/** Texts of one page: {key, where} for pairs, translated attributes and the head. */
export function pageTexts(html) {
  const out = [];
  const body = withoutNav(html);
  const doc = parse(body);
  const { pairs, single } = findPairs(body, doc);
  for (const p of pairs) out.push({ key: normalize(inner(body, p.en)), where: `<${p.en.name} lang="en">` });
  for (const el of walk(doc)) {
    for (const a of TEXT_ATTRS) {
      if (attr(el, `data-de-${a}`) !== null && attr(el, a)) out.push({ key: normalize(attr(el, a)), where: `${a}=` });
    }
    if (el.name === 'title') out.push({ key: normalize(inner(body, el)), where: '<title>' });
    if (el.name === 'meta') {
      const name = attr(el, 'name') || attr(el, 'property');
      if (META_TEXTS.includes(name) && attr(el, 'content')) out.push({ key: normalize(attr(el, 'content')), where: `meta ${name}` });
    }
  }
  return { texts: out.filter((t) => t.key), single, pairs: pairs.length };
}

function pairTexts(data) {
  const out = [];
  const visit = (v) => {
    if (Array.isArray(v)) { v.forEach(visit); return; }
    if (!v || typeof v !== 'object') return;
    if (typeof v.en === 'string' && typeof v.de === 'string') out.push(v.en);
    for (const [k, x] of Object.entries(v)) if (!(k === 'en' || k === 'de')) visit(x);
  };
  visit(data);
  return out;
}

// Part texts of the configurator catalog: every en_us text except names (the item names of the game).
function catalogTexts(data) {
  const out = [];
  const visit = (v, key) => {
    if (Array.isArray(v)) { v.forEach((x) => visit(x, key)); return; }
    if (!v || typeof v !== 'object') return;
    if (Object.prototype.hasOwnProperty.call(v, 'en_us') && !['name', 'short_name'].includes(key)) {
      const strings = (x) => {
        if (typeof x === 'string') out.push(x);
        else if (Array.isArray(x)) x.forEach(strings);
        else if (x && typeof x === 'object') Object.values(x).forEach(strings);
      };
      strings(v.en_us);
    }
    for (const [k, x] of Object.entries(v)) if (k !== 'en_us' && k !== 'de_de') visit(x, k);
  };
  visit(data, null);
  return out;
}

const STRING = String.raw`(['"])((?:\\.|(?!\1)[^\\\n])*)\1`;
function unescapeJs(s) {
  return s.replace(/\\u\{([0-9a-f]+)\}|\\u([0-9a-f]{4})|\\x([0-9a-f]{2})|\\(.)/gi, (m, cp, u, x, c) => {
    if (cp || u || x) return String.fromCodePoint(parseInt(cp || u || x, 16));
    return { n: '\n', t: '\t' }[c] ?? c;
  });
}
function jsTexts(source, arrays) {
  const out = [];
  const re = arrays
    ? new RegExp(String.raw`\[\s*${STRING}\s*,\s*(['"])((?:\\.|(?!\3)[^\\\n])*)\3`, 'g')
    : new RegExp(String.raw`\ben\s*:\s*${STRING}\s*,\s*de\s*:\s*(['"])`, 'g');
  for (const m of source.matchAll(re)) out.push(unescapeJs(m[2]));
  return out;
}

/** The English texts of one runtime source. */
export function runtimeTexts(source) {
  const text = read(source.file);
  if (source.kind === 'pairs') return pairTexts(JSON.parse(text));
  if (source.kind === 'catalog') return catalogTexts(JSON.parse(text));
  if (source.kind === 'js') return jsTexts(text, false);
  if (source.kind === 'js-arrays') return jsTexts(text, true);
  throw new Error(`${source.file}: unknown kind ${source.kind}`);
}

/**
 * Everything to translate.
 * @returns {{entries: Map<string, {sources: Set<string>}>, runtime: Set<string>, page: Set<string>, pages: object[],
 *   single: {file: string, where: string}[]}}
 *   entries: all keys; runtime: keys the scripts need (assets/i18n/<lang>.json); page: keys put into every page.
 */
export function extract({ languages = [] } = {}) {
  const entries = new Map();
  const add = (key, source) => {
    const k = normalize(key);
    if (!k || !/\p{L}/u.test(k)) return null;
    if (!entries.has(k)) entries.set(k, { sources: new Set() });
    entries.get(k).sources.add(source);
    return k;
  };
  const single = [];
  const pages = sourcePages();
  for (const page of pages) {
    const html = read(page.file);
    const { texts, single: lone } = pageTexts(html);
    for (const t of texts) add(t.key, page.file);
    for (const el of lone) single.push({ file: page.file, where: html.slice(el.start, Math.min(el.end, el.start + 80)) });
    for (const k of navTexts(page.prefix, page.current, languages)) add(k, 'tools/site-nav.mjs');
  }
  for (const key of Object.values(PHRASES)) add(key, 'tools/i18n/languages.json');
  const runtime = new Set();
  const page = new Set();
  for (const source of runtimeSources()) {
    for (const t of runtimeTexts(source)) {
      const k = add(t, source.file);
      if (!k) continue;
      if (source.page) page.add(k);
      else runtime.add(k);
    }
  }
  return { entries, runtime, page, pages, single };
}

/** Number of words of a text (markup removed). */
export function words(key) {
  return key.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').split(/\s+/).filter((w) => /\p{L}/u.test(w)).length;
}
