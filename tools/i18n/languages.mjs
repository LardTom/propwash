// The languages of the site (tools/i18n/languages.json) and their dictionaries (tools/i18n/dict/<lang>.json).
//
// English and German are the official languages: one page each with both side by side. Every other language is a
// generated tree /<code>/ that only goes live when its dictionary covers every text ("active": true).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const I18N_DIR = path.join(ROOT, 'tools/i18n');
export const DICT_DIR = path.join(I18N_DIR, 'dict');

export const CONFIG = JSON.parse(fs.readFileSync(path.join(I18N_DIR, 'languages.json'), 'utf8'));
export const SITE = CONFIG.site;
export const OFFICIAL = CONFIG.official;
export const LANGUAGES = CONFIG.languages;

// Fixed texts of the language support; their translations come from the dictionary, else from the drafts in
// languages.json.
export const PHRASES = Object.freeze({
  tag: 'AI',
  banner: 'This page was translated with AI. Only the English and German versions are official.',
  english: 'English version',
  german: 'German version',
  hint: 'This page is also available in <a>English</a> (AI translation).',
  close: 'Close',
  languages: 'Languages',
});

export const byCode = (code) => LANGUAGES.find((l) => l.code === code) || null;
export const activeLanguages = () => LANGUAGES.filter((l) => l.active);

const dicts = new Map();

/** The dictionary of a language ({schema, lang, source, entries, glossary?}); empty if there is none yet. */
export function loadDict(code) {
  if (dicts.has(code)) return dicts.get(code);
  const file = path.join(DICT_DIR, `${code}.json`);
  let dict = { schema: 1, lang: code, source: 'en', entries: {}, glossary: {}, missingFile: true };
  if (fs.existsSync(file)) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    dict = { glossary: {}, ...data, entries: data.entries || {}, missingFile: false };
  }
  dicts.set(code, dict);
  return dict;
}

/** A fixed text of the language support in a language: dictionary first, then the draft. */
export function phrase(code, key) {
  const lang = byCode(code);
  const dict = loadDict(code);
  if (Object.prototype.hasOwnProperty.call(dict.entries, key)) return dict.entries[key];
  return lang && lang.drafts ? lang.drafts[key] : undefined;
}

/** <link rel="alternate"> lines for a page (path relative to the root, '' for the landing page). */
export function alternateLinks(pagePath, languages) {
  if (!languages.length) return [];
  const url = (p) => `${SITE}${p}`;
  return [
    `<link rel="alternate" hreflang="en" href="${url(pagePath)}">`,
    `<link rel="alternate" hreflang="de" href="${url(pagePath)}?lang=de">`,
    ...languages.map((l) => `<link rel="alternate" hreflang="${l.hreflang}" href="${url(`${l.code}/${pagePath}`)}">`),
    `<link rel="alternate" hreflang="x-default" href="${url(pagePath)}">`,
  ];
}
