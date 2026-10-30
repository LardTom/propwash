#!/usr/bin/env node
// Coverage of the docs and the privacy page (check plan 0.6.0, 5.7 no. 44–47 and 49, 6.7 no. 47, 6.10 no. 59),
// English and German:
//   - player guide: “Sharing builds” (#share) names PW3, missing add-ons, the shopping list, stand-in parts and
//     <code>/propwash code</code> and links convert/ (there); the sections of 0.6.0 by id (freecam, RX block, flight
//     path marker, slime and wool, motor heat, stacked gates, pressure plates, /propwash clear, gate hint); no page or
//     section “Run a server”; every OSD element that is new in Propwash 0.6.0 (OsdElement of the mod against v0.5.2)
//     has its own section video-<element> in “Video and FPV view” that names it as the game does, and the spectator
//     count says who counts (F7, goggles on the channel), who doesn't (pilot, gimbal operator) and its presets
//   - world rules: “Allow freecam drone” off by default as in the export, its text names walls and modified clients;
//     “Hardware limits” names the ESC; no “restart the race” / „Rennen neu starten“ anywhere in docs/**, “Reset” there
//   - add-on API: <code>/propwash webexport</code> in English and German, explained in its own section “Your add-on in
//     the configurator” / „Dein Add-on im Konfigurator“ (#web-configurator: the command with a namespace, the export
//     folder, the jar opened in the browser and the add-on directory), and the parts table (PW3) with its own anchor;
//     #rules in English and German, and the address Propwash opens from its namespace report (NamespaceReportScreen.RULES_URL) is
//     https://propwashfpv.com/docs/api/#rules, the canonical address of this page plus that anchor
//   - “New in API 1.7” with its ten building blocks (switches and axes, OSD, collision, dispensing, world rules, data on
//     the drone, autonomous flight, operator, service button, namespace), the checklist, the example of moving a
//     noclip add-on off mixins and the rules for add-ons with their three core sentences; drawn in headless Chrome at
//     390 and 1280 px without overflow, #rules opens below the header bar
//   - privacy: a section says converter and opened jars run only in the browser, nothing is uploaded or stored; the
//     language build makes no legal pages in the language trees, their footer leads to the root pages
//
//   node tools/test-cov-docs.mjs [--propwash-repo <dir>] [--propwash-ref <ref>] [--gamerules <file>] [--no-browser] [--chrome <path>]
//
// --propwash-repo (or PROPWASH_REPO, default: the propwash checkout next to this repository) and --propwash-ref (default
// integration, else HEAD): where RULES_URL, OsdElement and the element names are read with git show; --gamerules (or PROPWASH_GAMERULES): the mod's
// export of its world rules (default docs/gamerules/gamerules.json). Checks of a known fault are locked (they print
// their state); COV_UNLOCK=<id>,… or all makes them count.

import fs from 'node:fs';
import path from 'node:path';
import { startBrowser, counter, arg, flag, read, ROOT, sleep } from './fixtures/cov/browser.mjs';
import { docSection, langHtml, plain, linkTarget, gitShow, gitHasRef, siblingRepo, buildPreview, byId } from './fixtures/cov/site-b.mjs';
import { LANGUAGES } from './i18n/languages.mjs';
import { SITE } from './docs/html.mjs';

const { check, lock, note, finish } = counter('cov docs');
const guide = read('docs/guide/index.html');
const api = read('docs/api/index.html');
const rulesPage = read('docs/gamerules/index.html');
const LANGS = ['en', 'de'];
const hrefs = (html) => [...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map((m) => m[1]);

function docsPages() {
  const out = [];
  const walkDir = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walkDir(rel);
      else if (e.name.endsWith('.html')) out.push(rel);
    }
  };
  walkDir('docs');
  return out;
}

function headingBoth(html, id, label) {
  const s = docSection(html, id);
  check(!!s, `${label}: section #${id} there`);
  if (!s) return null;
  const en = plain(langHtml(s.heading, 'en'));
  const de = plain(langHtml(s.heading, 'de'));
  check(en && de && en !== de || /^[A-Za-z./ ]+$/.test(plain(s.heading.replace(/<a class="docs-anchor"[^>]*>#<\/a>/, ''))), `${label}: #${id} has its heading in English and German (“${en}” / „${de}“)`);
  return s;
}

function sharing() {
  const s = headingBoth(guide, 'share', 'no. 44');
  if (!s) return;
  check(/^Sharing builds$/.test(plain(langHtml(s.heading, 'en'))) && /^Builds teilen$/.test(plain(langHtml(s.heading, 'de'))), `no. 44: the section is “Sharing builds” / „Builds teilen“`);
  const want = {
    en: [[/\bPW3\b/, 'PW3'], [/missing add-ons?/i, 'missing add-ons'], [/shopping list/i, 'shopping list'], [/stand-in parts|spare parts|substitutes/i, 'stand-in parts']],
    de: [[/\bPW3\b/, 'PW3'], [/fehlende(n)? Add-ons|fehlt/i, 'fehlende Add-ons'], [/Einkaufsliste/, 'Einkaufsliste'], [/Ersatzteil/, 'Ersatzteile']],
  };
  for (const lang of LANGS) for (const [re, label] of want[lang]) check(re.test(s[lang]), `no. 44 ${lang}: “Sharing builds” names ${label}`);
  check(/<code>\/propwash code<\/code>/.test(s.html), 'no. 44: <code>/propwash code</code> in the section');
  const convert = hrefs(s.html).filter((h) => /(^|\/)convert\/$/.test(h));
  check(convert.length >= 1, `no. 44: the section links the converter (${hrefs(s.html).join(' ')})`);
  for (const h of new Set(convert)) check(linkTarget('docs/guide/index.html', h).ok, `no. 44: ${h} exists`);
}

const SECTIONS_060 = [
  ['freecam', 'freecam drone'], ['rx-block', 'RX block'], ['video-flight-path-marker', 'flight path marker'], ['world-surfaces', 'slime and wool'],
  ['motor-heat', 'motor heat'], ['racing-stacks', 'stacked gates'], ['world-plates', 'pressure plates'], ['servers-clear', '/propwash clear'], ['racing-gate-hint', 'gate hint'],
];

function sections060() {
  for (const [id, what] of SECTIONS_060) headingBoth(guide, id, `no. 45 ${what}`);
  const words = { 'world-surfaces': [/slime[^.]*wool|wool[^.]*slime/i, /(Slime|Schleim)[^.]*Wolle/], 'servers-clear': [/\/propwash clear/, /\/propwash clear/], 'world-plates': [/pressure plate/i, /Druckplatte/], 'racing-stacks': [/stack/i, /stapel|Stapel/] };
  for (const [id, [en, de]] of Object.entries(words)) {
    const s = docSection(guide, id);
    if (s) check(en.test(s.en) && de.test(s.de), `no. 45 #${id}: the text is about ${en} / ${de}`);
  }
  headingBoth(api, 'rules', 'no. 45 docs/api');
  const server = docsPages().filter((p) => /server/i.test(p));
  check(!server.length, `no. 45: no page about running a server under docs/ (${server})`);
  const headings = docsPages().flatMap((p) => [...read(p).matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/g)].map((m) => ({ p, t: plain(m[1]) })));
  const run = headings.filter((h) => /\b(run(ning)? a server|host(ing)? a server|server betreiben|server aufsetzen)\b/i.test(h.t));
  check(!run.length, `no. 45: no section “Run a server” / „Server betreiben“ (${run.map((h) => `${h.p}: ${h.t}`).join('; ')})`);
}

const OSD_ELEMENT_JAVA = 'common/src/main/java/de/lardtom/propwash/osd/OsdElement.java';
const OSD_BEFORE = 'v0.5.2';
const OSD_WORDS = {
  SPECTATORS: {
    en: [[/\beye\b/i, 'the eye'], [/\bF7\b/, 'F7'], [/goggles[^.]*channel/i, 'goggles on its channel'], [/gimbal operator/i, 'the gimbal operator'], [/don’t count|doesn’t count|do not count/i, 'who doesn’t count'], [/\bStandard\b/, 'preset Standard'], [/\bFull\b/, 'preset Full']],
    de: [[/\bAuge\b/, 'das Auge'], [/\bF7\b/, 'F7'], [/Brille[^.]*Kanal/, 'Brille auf ihrem Kanal'], [/Gimbal-Operator/, 'den Gimbal-Operator'], [/zählen nicht|zählt nicht/, 'wer nicht zählt'], [/\bStandard\b/, 'Vorlage Standard'], [/\bVoll\b/, 'Vorlage Voll']],
  },
};
const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function osdElements060() {
  const repo = arg('--propwash-repo', 'PROPWASH_REPO') || siblingRepo('propwash');
  if (!repo) {
    note('no. 45 OSD: no Propwash checkout (--propwash-repo / PROPWASH_REPO): new OSD elements not read');
    return;
  }
  const ref = arg('--propwash-ref') || (gitHasRef(repo, 'integration') ? 'integration' : 'HEAD');
  const now = gitShow(repo, ref, OSD_ELEMENT_JAVA);
  const before = gitHasRef(repo, OSD_BEFORE) ? gitShow(repo, OSD_BEFORE, OSD_ELEMENT_JAVA) : null;
  const langEn = gitShow(repo, ref, 'common/src/main/resources/assets/propwash/lang/en_us.json');
  const langDe = gitShow(repo, ref, 'common/src/main/resources/assets/propwash/lang/de_de.json');
  if (!now || !before || !langEn || !langDe) {
    note(`no. 45 OSD: ${ref} or ${OSD_BEFORE} of ${repo} without OsdElement.java or language files: new OSD elements not read`);
    return;
  }
  const constants = (java) => new Set([...java.matchAll(/^ {4}([A-Z][A-Z0-9_]*)\(/gm)].map((m) => m[1]));
  const old = constants(before);
  const added = [...constants(now)].filter((c) => !old.has(c));
  check(added.length > 0, `no. 45 OSD: OsdElement of ${ref} has elements that are new since ${OSD_BEFORE}`);
  const names = { en: JSON.parse(langEn), de: JSON.parse(langDe) };
  const video = docSection(guide, 'video');
  check(!!video, 'no. 45 OSD: chapter #video “Video and FPV view” there');
  for (const c of added) {
    const key = `propwash.osd.element.${c.toLowerCase()}`;
    const name = { en: names.en[key], de: names.de[key] };
    if (!check(!!(name.en && name.de), `no. 45 OSD: ${key} has its name in English and German (${ref})`)) continue;
    const id = `video-${c.toLowerCase().replace(/_/g, '-')}`;
    const s = headingBoth(guide, id, `no. 45 OSD element ${c}`);
    if (!s) continue;
    check(!!video && video.html.includes(s.heading), `no. 45 OSD: #${id} is part of the chapter “Video and FPV view”`);
    for (const lang of LANGS) {
      check(new RegExp(`(^|[^\\p{L}])${reEscape(name[lang])}($|[^\\p{L}])`, 'iu').test(s[lang]), `no. 45 OSD ${lang}: #${id} names the element “${name[lang]}” as the game does`);
      for (const [re, what] of (OSD_WORDS[c] || {})[lang] || []) check(re.test(s[lang]), `no. 45 OSD ${lang}: #${id} names ${what}`);
    }
  }
  note(`no. 45 OSD: elements new since ${OSD_BEFORE} read from ${path.basename(repo)} ${ref}: ${added.join(', ')}`);
}

function worldRules() {
  const file = arg('--gamerules', 'PROPWASH_GAMERULES') || path.join(ROOT, 'docs/gamerules/gamerules.json');
  const exp = JSON.parse(fs.readFileSync(file, 'utf8'));
  const rule = (name) => exp.rules.find((r) => r.name === name || r.id === `propwash:${name}`);
  const freecam = rule('allow_freecam');
  check(!!freecam && freecam.default === false, `no. 46: the export has allow_freecam with default false (${file === path.join(ROOT, 'docs/gamerules/gamerules.json') ? 'docs/gamerules/gamerules.json' : file}: ${freecam && freecam.default})`);
  const row = byId(rulesPage, 'rule-allow_freecam');
  check(!!row, 'no. 46: docs/gamerules has the row #rule-allow_freecam');
  if (row) {
    const en = plain(langHtml(row.html, 'en'));
    const de = plain(langHtml(row.html, 'de'));
    check(/^Allow freecam drone\b/.test(en) && /^Freecam-Drohne erlauben\b/.test(de), `no. 46: “Allow freecam drone” / „Freecam-Drohne erlauben“`);
    check(/\bOff\b/.test(en) && /\bAus\b/.test(de), 'no. 46: the default stands as Off / Aus');
    check(/walls/i.test(en) && /Wände/.test(de), 'no. 46: the text names walls / Wände');
    check(/modified clients/i.test(en) && /veränderte Clients/i.test(de), 'no. 46: the text names modified clients / veränderte Clients');
  }
  const hw = byId(rulesPage, 'rule-hardware_limits');
  check(!!hw, 'no. 46: docs/gamerules has the row #rule-hardware_limits');
  if (hw) {
    check(/\bESC\b/.test(plain(langHtml(hw.html, 'en'))) && /\bESC\b/.test(plain(langHtml(hw.html, 'de'))), 'no. 46: “Hardware limits” names the ESC in English and German');
    check(/throttles back/i.test(plain(langHtml(hw.html, 'en'))) && /regelt[^.]*ab/.test(plain(langHtml(hw.html, 'de'))), 'no. 46: … that throttles back / abregelt');
  }
  const OLD = /rennen neu starten|restart(s|ing)? the race|restart race|renn-neustart|race restart/i;
  const hits = docsPages().flatMap((p) => {
    const text = plain(read(p));
    return [...text.matchAll(new RegExp(OLD.source, 'gi'))].map((m) => `${p}: „${text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 10)}“`);
  });
  lock('cov-site-b-4', hits.length === 0, `no. 46: no “Rennen neu starten” / “restart the race” in docs/** – ${hits.length} hits (${hits.slice(0, 2).join('; ')})`);
  check(/<strong>Reset<\/strong>/.test(guide) && /\bReset\b/.test(plain(langHtml(guide, 'de'))), 'no. 46: “Reset” in the player guide (English and German)');
}

function addonApi() {
  for (const lang of LANGS) {
    const text = langHtml(api, lang);
    check(/<code>\/propwash webexport<\/code>/.test(text), `no. 47 (5.7) ${lang}: docs/api names <code>/propwash webexport</code> (how an add-on gets into the web configurator)`);
  }
  const web = headingBoth(api, 'web-configurator', 'no. 47 (5.7) your add-on in the configurator');
  if (web) {
    const en = plain(langHtml(web.heading, 'en'));
    const de = plain(langHtml(web.heading, 'de'));
    check(en === 'Your add-on in the configurator' && de === 'Dein Add-on im Konfigurator', `no. 47 (5.7): #web-configurator is “Your add-on in the configurator” / „Dein Add-on im Konfigurator“ (“${en}” / „${de}“)`);
    for (const [lang, text] of [['en', web.en], ['de', web.de]]) {
      check(/\/propwash webexport <(namespace|namensraum)>/.test(text), `no. 47 (5.7) ${lang}: the section gives the command for one add-on (/propwash webexport <namespace>)`);
      check(/propwash\/web-export\//.test(text), `no. 47 (5.7) ${lang}: the section names the export folder propwash/web-export/`);
      check(lang === 'en' ? /Open add-on jar/.test(text) && /web export/i.test(text) : /Add-on-Jar öffnen/.test(text) && /Web-Export/.test(text), `no. 47 (5.7) ${lang}: the section explains the jar opened in the browser and when an add-on needs a web export`);
    }
    const links = hrefs(web.html);
    check(links.some((h) => /(^|\/)configurator\/$/.test(h)) && links.some((h) => /(^|\/)addons\/(#listing)?$/.test(h)), `no. 47 (5.7): the section links the configurator and the add-on directory (${links.join(', ')})`);
  }
  const share = headingBoth(api, 'share', 'no. 47 (5.7) parts table');
  if (share) {
    check(/part table/i.test(share.en) && /Teile-Tabelle/.test(share.de) && /\bPW3\b/.test(share.en) && /\bPW3\b/.test(share.de), 'no. 47 (5.7): the section #share explains the parts table for PW3 in English and German');
    check(/propwash_share\/table\.json/.test(share.html), 'no. 47 (5.7): it names data/<namespace>/propwash_share/table.json');
  }
}

function rulesUrl() {
  const s = headingBoth(api, 'rules', 'no. 47 (6.7)');
  if (s) check(plain(langHtml(s.heading, 'en')) === 'Rules for add-ons' && plain(langHtml(s.heading, 'de')) === 'Regeln für Add-ons', `no. 47 (6.7): #rules is “Rules for add-ons” / „Regeln für Add-ons“`);
  const canonical = (/<link rel="canonical" href="([^"]+)"/.exec(api) || [])[1];
  check(canonical === `${SITE}docs/api/`, `no. 47 (6.7): canonical address of docs/api/ is ${SITE}docs/api/ (${canonical})`);
  const repo = arg('--propwash-repo', 'PROPWASH_REPO') || siblingRepo('propwash');
  if (!repo) {
    note('no. 47 (6.7): no Propwash checkout (--propwash-repo / PROPWASH_REPO): RULES_URL not read');
    return;
  }
  const ref = arg('--propwash-ref') || (gitHasRef(repo, 'integration') ? 'integration' : 'HEAD');
  const java = gitShow(repo, ref, 'common/src/main/java/de/lardtom/propwash/guard/client/NamespaceReportScreen.java');
  if (!java) {
    note(`no. 47 (6.7): ${ref} of ${repo} has no NamespaceReportScreen.java`);
    return;
  }
  const url = (/RULES_URL\s*=\s*"([^"]+)"/.exec(java) || [])[1];
  check(url === `${canonical}#rules`, `no. 47 (6.7): NamespaceReportScreen.RULES_URL (${ref}) is ${url}, the page's ${canonical}#rules`);
  const u = url ? new URL(url) : null;
  if (u) {
    const t = linkTarget('index.html', `${u.pathname.replace(/^\//, '')}${u.hash}`);
    check(t.ok, `no. 47 (6.7): ${u.pathname}${u.hash} exists on the site (${t.target}, anchor ${t.anchor})`);
  }
  note(`no. 47 (6.7): RULES_URL read from ${path.basename(repo)} ${ref}`);
}

const BLOCKS = [
  ['switches and axes', /^Switches and axes$/, /^Schalter und Achsen$/],
  ['OSD', /^OSD elements and warnings$/, /^OSD-Elemente und Warnungen$/],
  ['collision', /^Collision rules$/, /^Kollisionsregeln$/],
  ['dispensing', /^Dispensing$/, /^Werfen/],
  ['world rules', /^World rules$/, /^Welt-Regeln$/],
  ['data on the drone', /^Data on the drone$/, /^Daten an der Drohne$/],
  ['autonomous flight', /^Autonomous flight$/, /^Autonomer Flug$/],
  ['operator', /operator/i, /Operator/],
  ['service button', /service screen/i, /Wartung/],
];

function api17() {
  const s = headingBoth(api, 'api-17', 'no. 59');
  if (!s) return;
  check(/^New in API 1\.7$/.test(plain(langHtml(s.heading, 'en'))) && /^Neu in API 1\.7$/.test(plain(langHtml(s.heading, 'de'))), 'no. 59: “New in API 1.7” / „Neu in API 1.7“');
  const blocks = docSection(api, 'api-17-blocks');
  check(!!blocks, 'no. 59: building blocks #api-17-blocks');
  if (blocks) {
    const rows = [...blocks.html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => m[1]).map((row) => {
      const cell = (/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/.exec(row) || [])[1] || '';
      return { en: plain(langHtml(cell, 'en')), de: plain(langHtml(cell, 'de')) };
    });
    for (const [what, en, de] of BLOCKS) check(rows.some((r) => en.test(r.en) && de.test(r.de)), `no. 59: building block ${what} in English and German`);
  }
  const ns = headingBoth(api, 'api-17-namespace', 'no. 59 namespace');
  if (ns) check(/namespace propwash is reserved/i.test(ns.en) && /Namensraum propwash ist reserviert/.test(ns.de), 'no. 59: building block namespace – “propwash is reserved”');
  const checklist = headingBoth(api, 'checklist', 'no. 59 checklist');
  if (checklist) check((checklist.html.match(/<li\b/g) || []).length >= 4, `no. 59: the checklist has its points (${(checklist.html.match(/<li\b/g) || []).length})`);
  const mixins = headingBoth(api, 'api-17-mixins', 'no. 59 moving off mixins');
  if (mixins) {
    check(/without a mixin/i.test(mixins.en) && /ohne Mixin/.test(mixins.de), 'no. 59: the example works without a mixin');
    check(/<pre\b/.test(mixins.html) && /registerCollisionRule|CollisionRule/.test(mixins.html), 'no. 59: the example has code with a collision rule');
    check(/ghost/i.test(mixins.en) && /Geist/.test(mixins.de), 'no. 59: the example is the ghost / noclip mode');
    lock('cov-site-b-6', /noclip/i.test(mixins.en) && /noclip/i.test(mixins.de), 'no. 59: the example names Noclip (“Noclip ohne Mixins”, as docs/addon-api-1.7.md §5 of Propwash)');
  }
  const r1 = docSection(api, 'rules-1');
  const r2 = docSection(api, 'rules-2');
  const r4 = docSection(api, 'rules-4');
  check(!!r1 && /own namespace/i.test(r1.en) && /propwash.{0,10}is reserved/i.test(r1.en) && /eigenen Namensraum/.test(r1.de) && /propwash.{0,10}ist reserviert/.test(r1.de), 'no. 59 rules: own namespace, propwash is reserved');
  check(!!r4 && /for Propwash/.test(r4.en) && /Propwash: …/.test(r4.en) && /official/i.test(r4.en) && /for Propwash/.test(r4.de) && /„Propwash: …“/.test(r4.de) && /offiziell/i.test(r4.de), 'no. 59 rules: “X for Propwash” allowed, “Propwash: …” only official');
  check(!!r2 && /Only de\.lardtom\.propwash\.api is stable/.test(r2.en) && /Stabil ist nur de\.lardtom\.propwash\.api/.test(r2.de), 'no. 59 rules: only de.lardtom.propwash.api is stable');
}

function privacy() {
  const html = read('datenschutz/index.html');
  const want = {
    en: [/convert/i, /\bjar\b/i, /in your browser|browser reads/i, /never uploaded/i, /stored/i],
    de: [/Umrechn/, /Jar/, /Browser/, /nie hochgeladen/, /gespeichert/],
  };
  for (const lang of LANGS) {
    const paras = [...html.matchAll(new RegExp(`<p lang="${lang}">([\\s\\S]*?)</p>`, 'g'))].map((m) => plain(m[1]));
    const hit = paras.find((p) => want[lang].every((re) => re.test(p)));
    check(!!hit, `no. 49 ${lang}: datenschutz/ has a section on converter and jar: only in the browser, nothing uploaded or stored`);
  }
}

async function languageTrees() {
  const { dir, files } = await buildPreview({ languages: LANGUAGES, mode: 'pseudo' });
  try {
    const legal = [...files.keys()].filter((f) => LANGUAGES.some((l) => f.startsWith(`${l.code}/`)) && /(^|\/)(impressum|datenschutz)\//.test(f));
    check(!legal.length, `no. 49: the language build makes no imprint or privacy page in the language trees (${legal.slice(0, 3)})`);
    for (const l of LANGUAGES) {
      check(!fs.existsSync(path.join(ROOT, l.code, 'impressum')) && !fs.existsSync(path.join(ROOT, l.code, 'datenschutz')), `no. 49: no ${l.code}/impressum/ or ${l.code}/datenschutz/ in the site`);
      const home = files.get(`${l.code}/index.html`);
      const links = hrefs(home || '').filter((h) => /impressum|datenschutz/.test(h));
      check(links.length >= 2 && links.every((h) => /^(\.\.\/)+(impressum|datenschutz)\/$/.test(h)), `no. 49 ${l.code}/: the footer leads to the root pages (${[...new Set(links)]})`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function apiInBrowser() {
  const b = await startBrowser();
  let loads = 0;
  try {
    for (const lang of LANGS) {
      for (const width of [390, 1280]) {
        const p = await b.page({ lang });
        await p.open('/docs/api/#rules', { width, lang, ready: "document.readyState === 'complete'" });
        await sleep(300);
        loads++;
        const m = await p.evaluate(`(() => {
          const vis = (id) => { const el = document.getElementById(id); if (!el) return null; const span = el.querySelector('[lang="${lang}"]') || el; const r = span.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), visible: span.checkVisibility() }; };
          const rules = document.getElementById('rules').getBoundingClientRect();
          return { sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth, top: Math.round(rules.top), header: Math.round(document.querySelector('.site-header').getBoundingClientRect().bottom),
            sections: Object.fromEntries(['rules', 'api-17', 'api-17-blocks', 'api-17-namespace', 'api-17-mixins', 'checklist'].map((id) => [id, vis(id)])),
            wideTables: [...document.querySelectorAll('#api-17 ~ .docs-table-wrap, .docs-table-wrap')].filter((t) => t.getBoundingClientRect().right > document.documentElement.clientWidth + 1).length };
        })()`);
        const where = `no. 59 docs/api/ ${lang} ${width} px`;
        check(m.sw <= m.vw + 1, `${where}: no horizontal overflow (${m.sw} > ${m.vw})`);
        check(m.top >= m.header && m.top < 300, `${where}: #rules opens below the header bar (top ${m.top}, header ${m.header})`);
        for (const [id, v] of Object.entries(m.sections)) check(!!v && v.visible && v.w > 0 && v.h > 0, `${where}: #${id} drawn in ${lang} (${JSON.stringify(v)})`);
        check(m.wideTables === 0, `${where}: no table sticks out of the window (${m.wideTables})`);
        check(p.errors.length === 0, `${where}: no console errors (${p.errors.slice(0, 2).join(' | ')})`);
        await p.close();
      }
    }
  } finally {
    await b.close();
  }
  return loads;
}

async function main() {
  sharing();
  sections060();
  osdElements060();
  worldRules();
  addonApi();
  rulesUrl();
  api17();
  privacy();
  await languageTrees();
  let loads = 0;
  if (flag('--no-browser')) note('--no-browser: docs/api/ is not drawn');
  else loads = await apiInBrowser();
  finish(`player guide, world rules, add-on API, rules URL, privacy, language trees${loads ? `, docs/api/ in ${loads} page loads at 390/1280 px` : ''}; en/de`);
}

main().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
