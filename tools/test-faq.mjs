#!/usr/bin/env node
// Coverage of the landing page and its FAQ (check plan 0.6.0, 5.1 no. 2, 4–10 and 12), English and German:
//   - direct links: /#faq-motion-blur, /#faq-old-codes and /#faq-license opened fresh at 360 and 1280 px and by a
//     hashchange on the same page open their <details>, the question stands in the window below the header bar
//     (top ≥ 61 px) and the answer is visible (headless Chrome)
//   - the answers say what the check plan asks for: license (No, source-available, PolyForm Shield 1.0.0, modpacks,
//     pull requests, no re-upload, no competing drone mod, MIT, link to the rules for add-ons) and “not open source”
//     in #source; FPV goggles (not needed, no video to goggles, HDMI input as a screen, radio over USB, no promise of
//     streaming); VR (No, not planned, no add-on or community hint); motion blur (no Propwash feature, Iris, shader
//     pack, simpler overlay, K as <kbd>, rebind one key); old share codes (still work, PW3 needs 0.6.0, link to
//     convert/, post next to the old code); languages (English and German in the game, the website languages exactly
//     the active ones with a complete dictionary of tools/i18n/languages.json, no promises); add-ons (namespace,
//     links to docs/api/#rules and addons/, both there)
//   - “What’s new”: exactly three cards (freecam drone, RX block, share codes), each with div.shot and a picture that
//     exists; “Everything in 0.6.0” links changelog/#propwash-<version of platforms.json>, an anchor of changelog.json
//
//   node tools/test-faq.mjs [--no-browser] [--chrome <path>]
//
// Checks of a known fault are locked (they print their state); COV_UNLOCK=<id>,… or all makes them count.

import fs from 'node:fs';
import path from 'node:path';
import { startBrowser, counter, flag, read, readJson, ROOT, sleep } from './fixtures/cov/browser.mjs';
import { faq, byId, langHtml, plain, linkTarget, parse, walk, attr } from './fixtures/cov/site-b.mjs';
import { LANGUAGES, loadDict } from './i18n/languages.mjs';
import { extract } from './i18n/extract.mjs';

const { check, lock, note, finish } = counter('faq');
const home = read('index.html');
const platforms = readJson('assets/data/platforms.json');
const changelog = readJson('assets/data/changelog.json');
const VERSION = platforms.products.propwash.version;
const LANGS = ['en', 'de'];
const hrefs = (html) => [...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map((m) => m[1]);

function answer(id, lang) {
  const a = faq(home, id, lang);
  check(!!a && a.text.length > 20, `${id} ${lang}: question and answer there`);
  return a || { question: '', answer: '', text: '', outer: '' };
}

function license() {
  const want = {
    en: [[/^No\b/, 'begins with “No”'], [/source-available/, 'source-available'], [/PolyForm Shield (License )?1\.0\.0/, 'PolyForm Shield 1.0.0'],
      [/modpacks/i, 'modpacks'], [/pull requests/i, 'pull requests'], [/re-upload/i, 're-upload not allowed'],
      [/competing drone mod/i, 'no competing drone mod'], [/\bMIT\b/, 'MIT']],
    de: [[/^Nein\b/, 'beginnt mit „Nein“'], [/source-available/, 'source-available'], [/PolyForm Shield (License )?1\.0\.0/, 'PolyForm Shield 1.0.0'],
      [/Modpacks/, 'Modpacks'], [/Pull Requests/, 'Pull Requests'], [/erneutes Hochladen/, 'erneutes Hochladen nicht erlaubt'],
      [/konkurrierende Drohnen-Mod|Konkurrenz-Drohnen-Mod/, 'keine Konkurrenz-Drohnen-Mod'], [/\bMIT\b/, 'MIT']],
  };
  for (const lang of LANGS) {
    const a = answer('faq-license', lang);
    for (const [re, label] of want[lang]) check(re.test(a.text), `no. 4 faq-license ${lang}: ${label} (“${a.text.slice(0, 90)}…”)`);
    if (lang === 'en') check(/\bnot\b[^.]*\b(allowed|permitted)\b|\bmay not\b/i.test(a.text), `no. 4 faq-license en: says what is not allowed`);
    else check(/Nicht erlaubt|nicht erlaubt|darfst (es )?nicht/.test(a.text), 'no. 4 faq-license de: sagt, was nicht erlaubt ist');
    const links = hrefs(a.answer);
    check(links.includes('docs/api/#rules'), `no. 4 faq-license ${lang}: links docs/api/#rules (${links})`);
    const t = linkTarget('index.html', 'docs/api/#rules');
    check(t.ok, `no. 4: docs/api/#rules exists (${t.target}, anchor ${t.anchor})`);
    const order = [...(lang === 'en' ? ['read', 'build', 'modpacks', 'pull requests'] : ['lesen', 'selbst bauen', 'Modpacks', 'Pull Requests'])];
    check(order.every((w) => a.text.includes(w)), `no. 4 faq-license ${lang}: allowed – ${order.join(', ')}`);
  }
  const source = byId(home, 'source');
  check(!!source, 'no. 4: section #source there');
  if (source) {
    check(/\bnot open source\b/i.test(plain(langHtml(source.html, 'en'))), 'no. 4 #source en: “not open source”');
    check(/nicht Open Source/.test(plain(langHtml(source.html, 'de'))), 'no. 4 #source de: „nicht Open Source“');
  }
}

function goggles() {
  const want = {
    en: [[/don[’']t need goggles|no goggles (are )?needed|goggles aren[’']t needed/i, 'goggles not needed'],
      [/can[’']t send video|cannot send video|no video (is sent )?to/i, 'no video to the goggles'], [/HDMI input/i, 'HDMI input'], [/\bscreen\b/i, 'as a screen'],
      [/radio[^.]*\bUSB\b/i, 'radio over USB']],
    de: [[/brauchst keine Brille|keine Brille nötig/, 'Brille nicht nötig'], [/kein Video/, 'kein Video an die Brille'], [/HDMI-Eingang/, 'HDMI-Eingang'],
      [/Bildschirm/, 'als Bildschirm'], [/Funke[^.]*\bUSB\b/, 'Funke per USB']],
  };
  const PROMISES = [/stream(s|ing|ed)? (the |your )?(fpv |video |picture |feed )?(directly |straight )?to (your |the )?goggles/i,
    /(support|supports|works with) (dji|hdzero|walksnail|real|your) goggles/i, /goggles? support/i, /\bvideo out(put)?\b/i,
    /an (die|deine) Brille (streamen|senden|übertragen)/i, /Brillen-?(unterstützung|support)/i, /streamt? (das |dein )?(Bild|Video) (an|auf) (die|deine) Brille/i];
  for (const lang of LANGS) {
    const a = answer('faq-goggles', lang);
    for (const [re, label] of want[lang]) check(re.test(a.text), `no. 5 faq-goggles ${lang}: ${label} (“${a.text.slice(0, 90)}…”)`);
    const plainSentences = a.text.split(/(?<=[.!?])\s+/).filter((x) => !/\b(can[’']t|cannot|not|no|kein|keine|nicht)\b/i.test(x)).join(' ');
    const promised = PROMISES.filter((re) => re.test(plainSentences));
    check(!promised.length, `no. 5 faq-goggles ${lang}: no promise of video to the goggles (${promised.map(String)})`);
    if (lang === 'en') check(/can[’']t send video to your goggles/i.test(a.text), 'no. 5 faq-goggles en: the only “send video to your goggles” is negated');
  }
}

function vr() {
  for (const lang of LANGS) {
    const a = answer('faq-vr', lang);
    check(lang === 'en' ? /^No\b/.test(a.text) : /^Nein\b/.test(a.text), `no. 6 faq-vr ${lang}: begins with No/Nein (“${a.text}”)`);
    check(lang === 'en' ? /(isn[’']t|is not|not) planned/i.test(a.text) : /nicht geplant/.test(a.text), `no. 6 faq-vr ${lang}: not planned / nicht geplant`);
    check(!/add-?on/i.test(a.text) && !/community/i.test(a.text), `no. 6 faq-vr ${lang}: neither add-on nor community (“${a.text}”)`);
  }
}

function motionBlur() {
  const want = {
    en: [[/isn[’']t a Propwash feature|is not a Propwash feature|no Propwash feature/, 'not a Propwash feature'], [/\bIris\b/, 'Iris'], [/shader pack/i, 'shader pack'],
      [/simpler overlay/i, 'simpler overlay'], [/change one of the two key bindings|rebind/i, 'rebind a key']],
    de: [[/kein Propwash-Feature/, 'kein Propwash-Feature'], [/\bIris\b/, 'Iris'], [/Shaderpack/, 'Shaderpack'], [/einfacheres Overlay/, 'einfacheres Overlay'],
      [/belege eine der beiden Tasten um|Taste umbeleg|umbelegen/, 'eine Taste umbelegen']],
  };
  for (const lang of LANGS) {
    const a = answer('faq-motion-blur', lang);
    for (const [re, label] of want[lang]) check(re.test(a.text), `no. 7 faq-motion-blur ${lang}: ${label} (“${a.text.slice(0, 90)}…”)`);
    check(/<kbd>K<\/kbd>/.test(a.answer), `no. 7 faq-motion-blur ${lang}: key K as <kbd>`);
  }
}

function oldCodes() {
  const want = {
    en: [[/^Yes\b/, 'begins with Yes'], [/still read|keep working|still work/i, 'old codes still work'], [/PW3/, 'PW3'], [/Propwash 0\.6\.0/, 'Propwash 0.6.0'],
      [/need[^.]*0\.6\.0/i, 'PW3 needs 0.6.0'], [/next to (the|your) old/i, '“next to” the old code']],
    de: [[/^Ja\b/, 'beginnt mit Ja'], [/weiter/, 'alte Codes gehen weiter'], [/PW3/, 'PW3'], [/Propwash 0\.6\.0/, 'Propwash 0.6.0'],
      [/brauchen[^.]*0\.6\.0/, 'PW3 braucht 0.6.0'], [/neben (den|deinen) alten/, '„neben“ den alten Code']],
  };
  for (const lang of LANGS) {
    const a = answer('faq-old-codes', lang);
    for (const [re, label] of want[lang]) check(re.test(a.text), `no. 8 faq-old-codes ${lang}: ${label} (“${a.text.slice(0, 90)}…”)`);
    const links = hrefs(a.answer).filter((h) => /(^|\/)convert\/$/.test(h));
    check(links.length === 1, `no. 8 faq-old-codes ${lang}: a link with href on convert/ (${hrefs(a.answer)})`);
    if (links[0]) check(linkTarget('index.html', links[0]).ok, `no. 8: ${links[0]} exists`);
  }
}

const LANGUAGE_NAMES = {
  es: { en: /Spanish/, de: /Spanisch/ }, fr: { en: /French/, de: /Französisch/ }, 'pt-br': { en: /Portuguese/, de: /Portugiesisch/ },
  pl: { en: /Polish/, de: /Polnisch/ }, ru: { en: /Russian/, de: /Russisch/ },
};

function languages() {
  const keys = [...extract().entries.keys()];
  const complete = new Map(LANGUAGES.map((l) => {
    const dict = loadDict(l.code);
    const missing = keys.filter((k) => !Object.prototype.hasOwnProperty.call(dict.entries, k)).length;
    return [l.code, { active: !!l.active, missing }];
  }));
  const live = LANGUAGES.filter((l) => complete.get(l.code).active && complete.get(l.code).missing === 0).map((l) => l.code);
  note(`no. 9: website languages beside English and German that are active with a complete dictionary: ${live.length ? live.join(', ') : 'none'} (${LANGUAGES.map((l) => `${l.code} ${complete.get(l.code).active ? 'active' : 'inactive'}, ${complete.get(l.code).missing} missing`).join('; ')})`);
  const BLOCK = { en: /\b(soon|coming|planned|later|will follow|more languages)\b/i, de: /\b(bald|geplant|folgen|folgt|später|kommen noch|weitere Sprachen)\b/i };
  for (const lang of LANGS) {
    const a = answer('faq-languages', lang);
    const [game, site] = lang === 'en' ? a.text.split(/This website/) : a.text.split(/Diese Website/);
    check(lang === 'en' ? /game[^.]*English[^.]*German/.test(game || '') : /Spiel[^.]*Englisch[^.]*Deutsch/.test(game || ''), `no. 9 faq-languages ${lang}: the game in English and German (“${(game || '').trim()}”)`);
    check(!BLOCK[lang].test(a.text), `no. 9 faq-languages ${lang}: no promise (${(BLOCK[lang].exec(a.text) || [])[0]})`);
    const named = LANGUAGES.filter((l) => LANGUAGE_NAMES[l.code][lang].test(site || '')).map((l) => l.code);
    const same = named.length === live.length && named.every((c) => live.includes(c));
    lock('cov-site-b-1', same, `no. 9 faq-languages ${lang}: the website languages named (${named.join(', ') || 'none'}) are the active ones with 100 % coverage of tools/i18n/languages.json (${live.join(', ') || 'none'})`);
    if (live.length) check(lang === 'en' ? /\bAI\b/.test(site || '') : /\bKI\b/.test(site || ''), `no. 9 faq-languages ${lang}: says the other languages are translated with AI`);
    check(lang === 'en' ? /only English and German are official/.test(a.text) : /offiziell sind nur Englisch und Deutsch/.test(a.text), `no. 9 faq-languages ${lang}: only English and German are official`);
  }
}

function addons() {
  for (const lang of LANGS) {
    const a = answer('faq-addons', lang);
    check(lang === 'en' ? /\bnamespace\b/.test(a.text) : /Namensraum/.test(a.text), `no. 10 faq-addons ${lang}: namespace / Namensraum`);
    const links = hrefs(a.answer);
    for (const href of ['docs/api/#rules', 'addons/']) {
      check(links.includes(href), `no. 10 faq-addons ${lang}: links ${href} (${links})`);
      const t = linkTarget('index.html', href);
      check(t.ok, `no. 10: ${href} exists (${t.target})`);
    }
  }
}

function whatsNew() {
  const sec = byId(home, 'new');
  check(!!sec, 'no. 12: section #new there');
  if (!sec) return;
  const doc = parse(sec.html);
  const figures = [...walk(doc)].filter((e) => e.name === 'figure');
  check(figures.length === 3, `no. 12: #new has exactly three cards (${figures.length})`);
  const WANT = [{ en: /^Freecam drone$/, de: /^Freecam-Drohne$/ }, { en: /^RX block$/, de: /^RX-Block$/ }, { en: /^Share codes\b/, de: /^Sharecodes\b/ }];
  figures.forEach((f, i) => {
    const html = sec.html.slice(f.start, f.end);
    const fdoc = parse(html);
    const h3 = [...walk(fdoc)].find((e) => e.name === 'h3');
    const title = h3 ? html.slice(h3.start, h3.end) : '';
    for (const lang of LANGS) check(WANT[i] && WANT[i][lang].test(plain(langHtml(title, lang))), `no. 12 card ${i + 1} ${lang}: “${plain(langHtml(title, lang))}”`);
    const shot = [...walk(fdoc)].find((e) => e.name === 'div' && (attr(e, 'class') || '').split(/\s+/).includes('shot'));
    check(!!shot, `no. 12 card ${i + 1}: div.shot`);
    const img = [...walk(fdoc)].find((e) => e.name === 'img');
    const src = img ? attr(img, 'src') : null;
    check(!!src && fs.existsSync(path.join(ROOT, src)), `no. 12 card ${i + 1}: picture ${src} exists`);
    const srcset = img && attr(img, 'srcset') ? attr(img, 'srcset').split(',').map((s) => s.trim().split(/\s+/)[0]) : [];
    check(srcset.every((s) => fs.existsSync(path.join(ROOT, s))), `no. 12 card ${i + 1}: every picture of srcset exists (${srcset})`);
    check(!!img && !!attr(img, 'alt') && !!attr(img, 'data-de-alt'), `no. 12 card ${i + 1}: picture with alt and data-de-alt`);
  });
  const all = [...sec.html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].filter((m) => /Everything in/.test(m[2]) && /Alles in/.test(m[2]));
  check(all.length === 1, `no. 12: one link “Everything in …”/„Alles in …“ (${all.length})`);
  if (all[0]) {
    check(all[0][1] === `changelog/#propwash-${VERSION}`, `no. 12: “Alles in ${VERSION}” leads to ${all[0][1]}, expected changelog/#propwash-${VERSION}`);
    check(plain(langHtml(all[0][2], 'en')) === `Everything in ${VERSION}` && plain(langHtml(all[0][2], 'de')) === `Alles in ${VERSION}`, `no. 12: the button names ${VERSION}`);
    const releases = changelog.products.flatMap((p) => p.releases.map((r) => r.id));
    check(releases.includes(`propwash-${VERSION}`), `no. 12: the anchor propwash-${VERSION} is in changelog.json`);
  }
}

async function directLinks() {
  const IDS = ['faq-motion-blur', 'faq-old-codes', 'faq-license'];
  const MEASURE = (id, lang) => `(() => {
    const d = document.getElementById(${JSON.stringify(id)});
    if (!d) return null;
    const s = d.querySelector('summary').getBoundingClientRect();
    const header = document.querySelector('.site-header').getBoundingClientRect();
    const p = d.querySelector('p[lang="${lang}"]');
    const r = p ? p.getBoundingClientRect() : null;
    return { open: d.open, top: Math.round(s.top), bottom: Math.round(s.bottom), header: Math.round(header.bottom), vh: innerHeight,
      answer: !!p && p.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true }) && r.height > 0 && r.top < innerHeight && r.bottom > Math.round(header.bottom), hash: location.hash };
  })()`;
  const b = await startBrowser();
  const results = [];
  try {
    for (const lang of LANGS) {
      for (const width of [360, 1280]) {
        const p = await b.page({ lang });
        for (const id of IDS) {
          await p.open(`/#${id}`, { width, lang, ready: "document.readyState === 'complete'" });
          await sleep(400);
          const m = await p.evaluate(MEASURE(id, lang));
          results.push({ how: 'fresh', id, lang, width, m });
        }
        await p.open('/#faq-motion-blur', { width, lang, ready: "document.readyState === 'complete'" });
        await sleep(300);
        for (const id of ['faq-license', 'faq-old-codes']) {
          await p.evaluate(`(location.hash = ${JSON.stringify(`#${id}`)}, true)`);
          await sleep(500);
          const m = await p.evaluate(MEASURE(id, lang));
          results.push({ how: 'hashchange', id, lang, width, m });
        }
        check(p.errors.length === 0, `no. 2 ${lang} ${width}: no console errors (${p.errors.slice(0, 3).join(' | ')})`);
        await p.close();
      }
    }
  } finally {
    await b.close();
  }
  const closed = [];
  const hidden = [];
  for (const r of results) {
    const where = `no. 2 ${r.how} /#${r.id} ${r.lang} ${r.width} px`;
    check(!!r.m && r.m.hash === `#${r.id}`, `${where}: page with the anchor`);
    if (!r.m) continue;
    check(r.m.top >= 61 && r.m.top >= r.m.header && r.m.bottom <= r.m.vh, `${where}: the question stands in the window below the header bar (top ${r.m.top}, header ${r.m.header}, window ${r.m.vh})`);
    if (!r.m.open) closed.push(`${r.how} #${r.id} ${r.lang} ${r.width}`);
    if (!r.m.answer) hidden.push(`${r.how} #${r.id} ${r.lang} ${r.width}`);
  }
  check(!closed.length, `no. 2: the <details> of the anchor is open – closed in ${closed.length} of ${results.length} cases (first: ${closed.slice(0, 2).join('; ')})`);
  check(!hidden.length, `no. 2: the answer is visible – hidden in ${hidden.length} of ${results.length} cases (first: ${hidden.slice(0, 2).join('; ')})`);
  return results.length;
}

async function main() {
  license();
  goggles();
  vr();
  motionBlur();
  oldCodes();
  languages();
  addons();
  whatsNew();
  let loads = 0;
  if (flag('--no-browser')) note('--no-browser: no. 2 (direct links) skipped');
  else loads = await directLinks();
  finish(`FAQ license, goggles, VR, motion blur, old codes, languages, add-ons; “What’s new”; ${loads ? `${loads} direct links at 360/1280 px` : 'no browser'}; en/de`);
}

main().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
