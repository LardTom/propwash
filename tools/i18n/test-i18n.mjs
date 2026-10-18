#!/usr/bin/env node
// Checks of the language support (tools/i18n/, assets/js/i18n.js).
//
//   node tools/i18n/test-i18n.mjs
//
// - assets/js/i18n.js: root(), the page language, lookup of translated texts, spans, links and numbers

import { createI18n, normalize, fill, EXTRA, OFFICIAL, LOCALES } from '../../assets/js/i18n.js';

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
const SITE = 'https://propwashfpv.com/';

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

if (failures.length) {
  console.log(`i18n: ${failures.length} of ${checks} checks FAILED`);
  for (const f of failures.slice(0, 80)) console.log(`  FAIL ${f}`);
  process.exit(1);
}
console.log(`i18n: ${checks} checks passed`);
