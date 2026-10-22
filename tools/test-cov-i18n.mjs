#!/usr/bin/env node
// Coverage of the other languages of the website (check plan 0.6.0, 5.4 no. 26, 30 and 34; no. 31 by test-i18n part 3,
// test-layout and the heading pictures of test-layout). The language trees are built into a temporary folder with
// every language of tools/i18n/languages.json, active or not, from their dictionaries (strict: a text without a
// translation stays English, so it shows).
//   - no. 26 language menu: exactly English, Deutsch, Español, Français, Português (Brasil), Polski, Русский; the five
//     others carry the short AI tag of languages.json in their language (IA, IA, IA, AI, ИИ); by keyboard: focus the
//     globe, Enter opens, Tab reaches every entry in order, Escape closes and gives the focus back to the globe;
//     at 360 px it lies in the menu (headless Chrome, on an English page and on a translated one)
//   - no. 30 terms of the game, per language and dictionary: part and preset names of catalog.json unchanged;
//     decimal numbers outside code/kbd, version numbers, model numbers (motor stators like 2207.5, prop sizes like
//     5.1×4.6) and part names written with a comma; inch sizes the same way all through a language; on the generated
//     pages the first game UI term of a section (tools/i18n/ui-terms.json, as <strong>/<em>) is followed by a
//     translation in brackets “(…)”, except glossary terms and names in capitals
//   - no. 34 script contents: (a) the texts the scripts draw for the figure explanations (stathelp), the builds for
//     beginners (beginner), the converter (convert.js) and the directory (directory page, add-on bar) are listed here,
//     reach assets/i18n/<lang>.json and have a translation in every dictionary; tools/i18n/pages.mjs is not changed,
//     its RUNTIME list is reported; (b) /es/configurator/ with a preset and an open figure explanation, /es/roadmap/,
//     /es/changelog/ and /es/convert/ with a converted post, after their scripts ran: the visible text is checked with
//     the “still English” rule of test-i18n (3 or more English function words and more than a quarter of the words)
//
//   node tools/test-cov-i18n.mjs [--lang es] [--no-browser] [--keep] [--list] [--chrome <path>]
//
// --lang: the language of no. 34 (b) (default es, as in the check plan); --list prints every English block found. Checks of a known fault are locked (they
// print their state); COV_UNLOCK=<id>,… or all makes them count.

import fs from 'node:fs';
import path from 'node:path';
import { startBrowser, counter, arg, flag, read, readJson, ROOT, sleep, CFG_READY, CV_READY, setInput } from './fixtures/cov/browser.mjs';
import { buildPreview, serveDirs, plain, decode } from './fixtures/cov/site-b.mjs';
import { LANGUAGES, loadDict, phrase, PHRASES } from './i18n/languages.mjs';
import { extract } from './i18n/extract.mjs';
import { RUNTIME } from './i18n/pages.mjs';
import { entry } from '../assets/js/configurator/i18n.js';
import { normalize } from '../assets/js/i18n.js';

const { check, lock, note, finish } = counter('cov i18n');
const LANG34 = arg('--lang') || 'es';
const NAMES = ['English', 'Deutsch', 'Español', 'Français', 'Português (Brasil)', 'Polski', 'Русский'];
const TAGS = { es: 'IA', fr: 'IA', 'pt-br': 'IA', pl: 'AI', ru: 'ИИ' };
const GLOSSARY = readJson('tools/i18n/glossary.json');
const KEEP = new Set(GLOSSARY.keep);
const UI = new Set(readJson('tools/i18n/ui-terms.json').terms);
const catalog = readJson('assets/data/configurator/catalog.json');
const PART_NAMES = [...new Set([...catalog.parts.flatMap((p) => [p.name && p.name.en_us, p.short_name && p.short_name.en_us]),
  ...(catalog.presets || []).map((p) => p.name && p.name.en_us)].filter((n) => typeof n === 'string' && n.length >= 4))].sort((a, b) => b.length - a.length);
const ENGLISH = new Set(['the', 'and', 'of', 'to', 'with', 'is', 'are', 'for', 'your', 'you', 'this', 'that', 'it', 'in', 'on', 'from', 'when', 'what', 'which', 'can', 'will', 'be', 'not', 'or', 'an', 'its', 'by', 'as', 'at']);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const stripCode = (s) => s.replace(/<(code|kbd|pre)\b[^>]*>[\s\S]*?<\/\1>/g, ' ').replace(/`[^`]*`/g, ' ');
const withoutNames = (s) => PART_NAMES.reduce((t, n) => t.split(n).join(' '), s);
const stillEnglish = (text) => {
  const w = text.toLowerCase().split(/[^\p{L}']+/u).filter(Boolean);
  const n = w.filter((x) => ENGLISH.has(x)).length;
  return n >= 3 && n / w.length > 0.25;
};

// no. 30 ---------------------------------------------------------------------------------------------------------------
const DEC = /(?<![\d.,\p{L}])(\d+)\.(\d+)(?![\d.]|\.\d)/gu;
const VERSION_BEFORE = /(Propwash( FPV)?|API|Minecraft|Betaflight|ffmpeg|EdgeTX|OpenTX|version|versions|JMP|Just More Parts|Fabric|NeoForge|Java|protocol|lesson|lessons|includes|on|with|from|until|to|and|or|before|since|in|\bv|\+)\s*$/i;

function partNames() {
  const bad = [];
  for (const l of LANGUAGES) {
    const dict = loadDict(l.code);
    const changed = [];
    let seen = 0;
    for (const [en, tr] of Object.entries(dict.entries)) {
      const pe = plain(en);
      const pt = plain(tr);
      for (const n of PART_NAMES) {
        if (!new RegExp(`(?<![\\p{L}\\d])${esc(n)}(?![\\p{L}\\d])`, 'u').test(pe)) continue;
        seen++;
        if (!pt.includes(n)) changed.push(`“${n}” → „${pt.slice(0, 40)}“`);
      }
    }
    if (changed.length) bad.push(`${l.code} ${changed.length} of ${seen} (${changed.slice(0, 2).join('; ')})`);
  }
  lock('cov-site-b-7', !bad.length, `no. 30: part and preset names of catalog.json stay unchanged in every dictionary – changed: ${bad.join(' · ')}`);
}

function decimals() {
  const out = {};
  const wrongAll = [];
  const mixedAll = [];
  const has = (text, num) => new RegExp(`(?<![\\d.,])${esc(num)}(?![\\d])`).test(text);
  const around = (text, num) => { const i = text.search(new RegExp(`(?<![\\d.,])${esc(num)}(?![\\d])`)); return i < 0 ? '…' : text.slice(Math.max(0, i - 20), i + num.length + 6); };
  for (const l of LANGUAGES) {
    const dict = loadDict(l.code);
    const wrong = [];
    const inch = { dot: [], comma: [] };
    let measures = 0;
    for (const [en, tr] of Object.entries(dict.entries)) {
      const pe = plain(withoutNames(stripCode(en)));
      const pt = plain(withoutNames(stripCode(tr)));
      for (const m of pe.matchAll(DEC)) {
        const pre = pe.slice(Math.max(0, m.index - 25), m.index);
        const post = pe.slice(m.index + m[0].length, m.index + m[0].length + 12);
        if (VERSION_BEFORE.test(pre) || /^\.\d|^\+/.test(post) || m[0] === '26.3') continue;
        if (/^\d{4}\.5$/.test(m[0]) || /^\s?(Motor|motor|stator)\b/.test(post) || /^×\d/.test(post) || /\d×$/.test(pre)) continue;
        const comma = `${m[1]},${m[2]}`;
        if (/^\s?″/.test(post) || /^[–-]\d+(\.\d+)?″/.test(post)) {
          if (has(pt, comma)) inch.comma.push(`${comma}″ („${around(pt, comma)}“)`);
          else inch.dot.push(`${m[0]}″ („${around(pt, m[0])}“)`);
          continue;
        }
        measures++;
        if (!has(pt, comma)) wrong.push(`${m[0]}${post.slice(0, 2).trim()} („${around(pt, m[0])}“)`);
      }
    }
    out[l.code] = { measures, wrong: wrong.length, inchDot: inch.dot.length, inchComma: inch.comma.length };
    if (wrong.length) wrongAll.push(`${l.code} ${wrong.length} of ${measures} (${wrong.slice(0, 2).join('; ')})`);
    if (inch.dot.length && inch.comma.length) mixedAll.push(`${l.code} ${inch.comma.length} comma / ${inch.dot.length} dot (${(inch.comma.length < inch.dot.length ? inch.comma : inch.dot).slice(0, 2).join('; ')})`);
  }
  lock('cov-site-b-8', !wrongAll.length, `no. 30: decimal numbers outside code, versions, model numbers and part names with a comma – with a dot: ${wrongAll.join(' · ')}`);
  lock('cov-site-b-8', !mixedAll.length, `no. 30: inch sizes written the same way through a language – mixed: ${mixedAll.join(' · ')}`);
  note(`no. 30 decimal numbers: ${Object.entries(out).map(([c, x]) => `${c} ${x.measures - x.wrong}/${x.measures} with a comma, inch sizes ${x.inchComma} comma / ${x.inchDot} dot`).join('; ')}`);
}

function uiTermsInBrackets(files) {
  const stats = {};
  for (const l of LANGUAGES) {
    const dg = new Set(Object.keys(loadDict(l.code).glossary || {}));
    let firsts = 0;
    let pageFirsts = 0;
    const miss = [];
    const pageMiss = [];
    for (const [rel, html] of files) {
      if (!rel.startsWith(`${l.code}/`) || !rel.endsWith('.html')) continue;
      const main = (/<main[\s\S]*<\/main>/.exec(html) || [''])[0];
      for (const [granularity, parts, list] of [['section', main.split(/<h2[\s>]|<section[\s>]/), miss], ['page', [main], pageMiss]]) {
        for (const sec of parts) {
          const seen = new Set();
          for (const m of sec.matchAll(/<(strong|em)>([^<]+)<\/\1>/g)) {
            const term = decode(m[2]).trim();
            if (!UI.has(term) || seen.has(term)) continue;
            seen.add(term);
            if (KEEP.has(term) || dg.has(term) || /^[A-Z0-9 ()·.\-…]+$/.test(term)) continue;
            if (granularity === 'section') firsts++;
            else pageFirsts++;
            const after = decode(sec.slice(m.index + m[0].length, m.index + m[0].length + 40).replace(/<[^>]+>/g, ''));
            if (!/^[\s ]*\(/.test(after)) list.push(`${rel} «${term}»`);
          }
        }
      }
    }
    stats[l.code] = { firsts, miss: miss.length, pageFirsts, pageMiss: pageMiss.length, first: miss.slice(0, 2) };
  }
  const bad = Object.entries(stats).filter(([, x]) => x.miss);
  lock('cov-site-b-9', !bad.length, `no. 30: the first game UI term of a section has its translation in brackets – missing: ${bad.map(([c, x]) => `${c} ${x.miss} of ${x.firsts} (${x.first.join('; ')})`).join(' · ')}`);
  note(`no. 30 UI terms in brackets (first in a section / first on a page): ${Object.entries(stats).map(([c, s]) => `${c} ${s.firsts - s.miss}/${s.firsts} · ${s.pageFirsts - s.pageMiss}/${s.pageFirsts}`).join('; ')}`);
}

// no. 34 (a) ----------------------------------------------------------------------------------------------------------
function scriptTexts() {
  const strings = (node) => {
    if (Array.isArray(node) && node.length === 2 && node.every((x) => typeof x === 'string')) return [node[0]];
    if (Array.isArray(node)) return node.flatMap(strings);
    if (node && typeof node === 'object') return Object.values(node).flatMap(strings);
    return [];
  };
  const registry = readJson('assets/data/addons/registry.json');
  const directoryPage = read('assets/js/addons/directory-page.js');
  const literal = [...directoryPage.matchAll(/(['"])([A-Z][^'"\n]{3,}\s[^'"\n]+)\1/g)].map((m) => m[2]).filter((s) => /\p{L}{3,} \p{L}{2,}/u.test(s));
  const SOURCES = {
    'stathelp.json (figure explanations, ranges)': [...strings(entry('statHelp')), ...strings(entry('ui.statRange')), ...strings(entry('ui.statOutside')), ...strings(entry('ui.statOutsideLong')), ...strings(entry('ui.statInfo'))],
    'beginner.json (builds for beginners)': strings(entry('beginner')),
    'convert.js and the page /convert/': strings(entry('convert')),
    'directory and add-on bar': [...strings(entry('addons')), registry.addons.flatMap((a) => (a.text ? [a.text.en] : [])), ...literal].flat(),
  };
  const ex = extract();
  const runtime = new Set([...ex.runtime, ...ex.page]);
  const listed = RUNTIME.map((s) => s.file);
  for (const [label, list] of Object.entries(SOURCES)) {
    const keys = [...new Set(list.map(normalize).filter((k) => k && /\p{L}/u.test(k)))];
    check(keys.length > 0, `no. 34 (a) ${label}: texts found (${keys.length})`);
    const notRuntime = keys.filter((k) => !runtime.has(k) && !ex.entries.has(k));
    check(!notRuntime.length, `no. 34 (a) ${label}: every text reaches the translation (extract of tools/i18n) – missing ${notRuntime.length} (${notRuntime.slice(0, 2).join(' | ')})`);
    for (const l of LANGUAGES) {
      const dict = loadDict(l.code);
      const missing = keys.filter((k) => !Object.prototype.hasOwnProperty.call(dict.entries, k));
      check(!missing.length, `no. 34 (a) ${l.code} ${label}: every text translated in tools/i18n/dict/${l.code}.json – missing ${missing.length} (${missing.slice(0, 2).join(' | ')})`);
    }
  }
  const named = ['assets/data/configurator/stathelp.json', 'assets/data/configurator/beginner.json', 'assets/js/configurator/convert.js', 'assets/js/configurator/convert-page.js', 'assets/js/addons/directory-page.js', 'assets/js/addons/configurator-addons.js'];
  const absent = named.filter((f) => !listed.includes(f));
  lock('cov-site-b-10', !absent.length, `no. 34 (a): RUNTIME of tools/i18n/pages.mjs names the script contents of 0.6.0 – not named: ${absent.join(', ')} (their texts come in through assets/js/configurator/i18n.js)`);
}

// no. 26 and 34 (b) ---------------------------------------------------------------------------------------------------
const VISIBLE_TEXT = String.raw`(() => {
  const BLOCK = 'p, li, td, th, dd, dt, h1, h2, h3, h4, summary, figcaption, label, button, a, span, div, strong, em, small, legend, caption, option';
  const skip = (el) => el.closest('code, kbd, pre, script, style, [lang="en"], .keep, svg, textarea, input, select, .cv__result, [data-code]');
  const out = [];
  for (const el of document.querySelectorAll('main ' + BLOCK.split(', ').join(', main '))) {
    if (skip(el)) continue;
    if ([...el.children].some((c) => c.matches(BLOCK) && !c.matches('strong, em, a, span, small, kbd, code'))) continue;
    if (!el.checkVisibility || !el.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true })) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
    if (t.length > 12) out.push({ tag: el.tagName.toLowerCase(), cls: (el.className && el.className.baseVal === undefined ? el.className : '').toString().split(' ')[0], text: t });
  }
  const tip = document.querySelector('[data-stat-tip]');
  if (tip && tip.checkVisibility()) out.push({ tag: 'tip', cls: 'stat-tip', text: tip.innerText.replace(/\s+/g, ' ').trim() });
  return out;
})()`;

async function enter(p) {
  const common = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
  await p.send('Input.dispatchKeyEvent', { type: 'keyDown', text: '\r', unmodifiedText: '\r', ...common });
  await p.send('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
  await sleep(80);
}

async function inBrowser(dir) {
  const { server, base } = await serveDirs([dir, ROOT]);
  const b = await startBrowser();
  let loads = 0;
  try {
    for (const [url, label, kind] of [[`${base}/?lang=en`, 'en', 'official'], [`${base}/fr/roadmap/`, 'fr/roadmap/', 'tree']]) {
      for (const width of [1280, 360]) {
        const p = await b.page({ lang: 'en' });
        await p.open(url, { width, ready: "document.readyState === 'complete'" });
        loads++;
        const folded = width < 1100 || await p.evaluate("document.documentElement.classList.contains('nav-folded')");
        if (folded) await p.evaluate("(document.querySelector('[data-nav-toggle]').click(), true)");
        await p.evaluate("(document.querySelector('[data-lang-menu] [data-nav-group-toggle]').click(), true)");
        await sleep(200);
        const menu = await p.evaluate(`(() => {
          const panel = document.querySelector('#nav-languages');
          return { open: getComputedStyle(panel).display !== 'none' && panel.getBoundingClientRect().height > 0,
            inMenu: !!document.querySelector('#site-nav.is-open #nav-languages'),
            items: [...panel.querySelectorAll('a')].map((a) => ({ lang: a.dataset.langPick, name: a.querySelector('.nav-group__title').firstChild.textContent.trim(), tag: (a.querySelector('.i18n-tag') || {}).textContent || null, visible: a.checkVisibility() })) };
        })()`);
        const where = `no. 26 ${label} ${width} px`;
        check(menu.open, `${where}: the menu opens`);
        if (width < 1100) check(menu.inMenu, `${where}: below 1100 px the language menu lies in the opened menu`);
        check(JSON.stringify(menu.items.map((i) => i.name)) === JSON.stringify(NAMES), `${where}: names ${menu.items.map((i) => i.name).join(', ')}`);
        for (const i of menu.items) {
          const want = TAGS[i.lang] || null;
          const own = LANGUAGES.find((l) => l.code === i.lang);
          check(i.tag === want && (!own || i.tag === own.drafts.AI && i.tag === phrase(i.lang, PHRASES.tag)), `${where}: ${i.name} carries the tag ${want} of languages.json (${i.tag})`);
          check(i.visible, `${where}: ${i.name} visible`);
        }
        if (width === 1280) {
          await p.evaluate("(document.querySelector('[data-lang-menu] [data-nav-group-toggle]').click(), true)");
          await sleep(150);
          await p.evaluate("(document.querySelector('[data-lang-menu] [data-nav-group-toggle]').focus(), true)");
          await enter(p);
          await sleep(150);
          const opened = await p.evaluate("document.querySelector('[data-lang-menu] [data-nav-group-toggle]').getAttribute('aria-expanded') === 'true' && getComputedStyle(document.querySelector('#nav-languages')).display !== 'none'");
          check(opened, `${where} keyboard: Enter on the focused globe opens the menu`);
          const reached = [];
          for (let i = 0; i < NAMES.length; i++) {
            await p.key('Tab');
            reached.push(await p.evaluate("document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.langPick || document.activeElement.tagName : null"));
          }
          check(JSON.stringify(reached) === JSON.stringify(menu.items.map((i) => i.lang)), `${where} keyboard: Tab reaches every entry in order (${reached.join(', ')})`);
          await p.key('Escape');
          await sleep(150);
          const closed = await p.evaluate("({ expanded: document.querySelector('[data-lang-menu] [data-nav-group-toggle]').getAttribute('aria-expanded'), focus: document.activeElement === document.querySelector('[data-lang-menu] [data-nav-group-toggle]') })");
          check(closed.expanded === 'false' && closed.focus, `${where} keyboard: Escape closes and the globe has the focus again (${JSON.stringify(closed)})`);
          await p.evaluate("(document.querySelector('[data-lang-menu] [data-nav-group-toggle]').focus(), true)");
          await enter(p);
          await sleep(100);
          await p.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 });
          await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 });
          await sleep(100);
          const arrow = await p.evaluate("document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.langPick || null : null");
          note(`no. 26 ${label}: the arrow keys ${arrow ? 'also move' : 'do not move'} through the language menu (Tab does)`);
          await p.key('Escape');
        }
        check(p.errors.length === 0, `${where}: no console errors (${p.errors.slice(0, 2).join(' | ')})`);
        await p.close();
      }
    }

    const tree = LANG34;
    const found = [];
    const dict = loadDict(tree);
    const sources = new Map();
    for (const [k, tr] of Object.entries(dict.entries)) {
      const en = plain(k);
      const out = plain(tr);
      const words = en.toLowerCase().split(/[^\p{L}']+/u).filter(Boolean);
      const same = en.toLowerCase() === out.toLowerCase();
      if (words.length < 2 || en.length < 8 || KEEP.has(en) || PART_NAMES.includes(en)) continue;
      if (same && !(words.length >= 4 && words.some((w) => ENGLISH.has(w)))) continue;
      sources.set(en.toLowerCase(), en);
    }
    const visit = async (pathPart, ready, prepare) => {
      const p = await b.page({ lang: 'en' });
      await p.open(`${base}/${tree}/${pathPart}`, { width: 1280, ready });
      loads++;
      if (prepare) await prepare(p);
      await sleep(400);
      const blocks = await p.evaluate(VISIBLE_TEXT);
      const english = blocks.filter((x) => stillEnglish(withoutNames(x.text)) || sources.has(x.text.toLowerCase()));
      found.push({ page: `${tree}/${pathPart}`, blocks: blocks.length, english, errors: p.errors.slice() });
      await p.close();
    };
    await visit('configurator/', CFG_READY, async (p) => {
      await p.evaluate(`(() => { const s = document.querySelector('[data-preset]'); s.value = 'propwash:freestyle'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
      await sleep(600);
      await p.evaluate("(document.querySelector('[data-stat-help]').click(), true)");
    });
    await visit('roadmap/', "document.querySelector('[data-rm-root]') && document.querySelector('[data-rm-root]').children.length > 0");
    await visit('changelog/', "!!document.querySelector('[data-cl-tally]') && !document.querySelector('[data-cl-tally]').hidden && !!document.querySelector('[data-cl-root] article')");
    await visit('convert/', CV_READY, async (p) => {
      await p.evaluate(setInput('[data-cv-input]', read('tools/fixtures/cov/post.txt')));
      await sleep(900);
    });
    const KNOWN_RED = { 'configurator/': 'cov-site-b-11', 'convert/': 'cov-site-b-11', 'changelog/': 'cov-site-b-12' };
    for (const f of found) {
      check(f.blocks > 5, `no. 34 (b) /${f.page}: visible text collected (${f.blocks} blocks)`);
      check(!f.errors.length, `no. 34 (b) /${f.page}: no console errors (${f.errors.slice(0, 2).join(' | ')})`);
      const message = `no. 34 (b) /${f.page}: no English left after the scripts ran – ${f.english.length} of ${f.blocks} blocks still English (${f.english.slice(0, 3).map((x) => `${x.tag}${x.cls ? `.${x.cls}` : ''}: “${x.text.slice(0, 50)}”`).join('; ')})`;
      const known = Object.entries(KNOWN_RED).find(([k]) => f.page.endsWith(`/${k}`));
      if (known) lock(known[1], !f.english.length, message);
      else check(!f.english.length, message);
    }
    if (flag('--list')) for (const f of found) for (const x of f.english) console.log(`  english /${f.page} ${x.tag}${x.cls ? `.${x.cls}` : ''}: ${x.text.slice(0, 140)}`);
  } finally {
    await b.close();
    server.close();
  }
  return loads;
}

async function main() {
  const { dir, files } = await buildPreview({ languages: LANGUAGES, mode: 'strict' });
  let loads = 0;
  try {
    partNames();
    decimals();
    uiTermsInBrackets(files);
    scriptTexts();
    if (flag('--no-browser')) note('--no-browser: no. 26 and no. 34 (b) skipped');
    else loads = await inBrowser(dir);
  } finally {
    if (flag('--keep')) note(`preview kept: ${dir}`);
    else fs.rmSync(dir, { recursive: true, force: true });
  }
  finish(`${LANGUAGES.length} languages from their dictionaries; language menu, game terms, script texts${loads ? `; ${loads} page loads (menu at 360/1280 px, /${LANG34}/ after the scripts)` : ''}`);
}

main().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
