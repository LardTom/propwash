#!/usr/bin/env node
// Tests the documentation under docs/ (propwashfpv.com/docs).
//
//   node tools/test-docs.mjs [--quiet]
//
// 1. The pages on disk are exactly what tools/build-docs.mjs renders from tools/docs/data (no hand edits, nothing
//    stale, no leftover files).
// 2. Completeness against the mod's code: every API type has a description, every field the part reader reads is
//    documented (and nothing else), every server.json setting and every event is explained, the API history covers
//    the current API version, the world rules carry both languages and every example command is valid.
// 3. Every page: unique ids, every in-page anchor and every relative link or image exists, English and German texts
//    come in pairs, tags are balanced, German texts use real umlauts, no local paths, and no term of the local
//    denylist (the same file the mod's public export uses: PROPWASH_EXPORT_DENYLIST, otherwise
//    ~/.config/propwash/public-export-denylist.txt, one term per line). The list stays outside the repository, so the
//    terms it guards never end up on the site; without it this check fails.
// Exit code 0 only if every check passes.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderAll, loadData, ROOT } from './build-docs.mjs';
import { checkGamerules } from './docs/extract.mjs';
import { RECIPES, checkCommand } from './docs/pages/gamerules.mjs';
import { SERVER_FIELDS } from './docs/pages/guide.mjs';
import { EVENT_INFO, apiHistoryProblem } from './docs/pages/api.mjs';
import { referenceProblems } from './docs/pages/reference.mjs';
import { partsFormatProblems } from './docs/pages/parts-format.mjs';

const quiet = process.argv.includes('--quiet');
let passed = 0;
let failed = 0;

function ok(cond, what) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.log(`  FAIL ${what}`);
  }
  return cond;
}

function none(problems, what) {
  for (const p of problems) ok(false, `${what}: ${p}`);
  if (!problems.length) ok(true, what);
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

const rel = (file) => path.relative(ROOT, file).split(path.sep).join('/');

// 1. Generated pages are up to date

const data = loadData();
const rendered = renderAll(data);
for (const [file, content] of Object.entries(rendered)) {
  const target = path.join(ROOT, file);
  ok(fs.existsSync(target) && fs.readFileSync(target, 'utf8') === content, `${file} entspricht der Ausgabe von build-docs (node tools/build-docs.mjs --render-only)`);
}
for (const file of walk(path.join(ROOT, 'docs'))) {
  if (path.basename(file) === '.DS_Store') continue;
  ok(Object.prototype.hasOwnProperty.call(rendered, rel(file)), `${rel(file)} wird von build-docs erzeugt (sonst übrig geblieben)`);
}

// 2. Completeness against the code

none(referenceProblems(data.api), 'API-Typen beschrieben');
none(partsFormatProblems(data.parts), 'Teile-Felder mit PartJson abgeglichen');
const historyProblem = apiHistoryProblem(data.meta.api);
none(historyProblem ? [historyProblem] : [], `API-Versionsgeschichte bis ${data.meta.api}`);
ok(data.api.version === data.meta.api, 'API-Version in api.json und meta.json gleich');

const serverNames = data.server.fields.map((f) => f.name);
none(serverNames.filter((n) => !SERVER_FIELDS[n]).map((n) => `server.json-Feld ${n} ohne Erklärung in SERVER_FIELDS (tools/docs/pages/guide.mjs)`), 'server.json-Felder erklärt');
none(Object.keys(SERVER_FIELDS).filter((n) => !serverNames.includes(n)).map((n) => `SERVER_FIELDS erklärt ${n}, das es in server.json nicht mehr gibt`), 'keine veralteten server.json-Erklärungen');

const events = data.api.packages.flatMap((p) => p.types).find((t) => t.name === 'PropwashEvents');
const eventNames = events ? events.members.filter((m) => m.kind === 'field').map((m) => m.name) : [];
ok(eventNames.length > 0, 'Events gefunden');
none(eventNames.filter((n) => !EVENT_INFO[n]).map((n) => `Event ${n} ohne Erklärung in EVENT_INFO (tools/docs/pages/api.mjs)`), 'Events erklärt');
none(Object.keys(EVENT_INFO).filter((n) => !eventNames.includes(n)).map((n) => `EVENT_INFO erklärt ${n}, das es nicht mehr gibt`), 'keine veralteten Event-Erklärungen');

try {
  checkGamerules(data.gamerules);
  ok(true, 'Welt-Regeln vollständig (Texte en/de, Gruppen)');
} catch (e) {
  ok(false, `Welt-Regeln: ${e.message}`);
}
ok(data.gamerules.version === data.meta.propwash, `Welt-Regeln-Export aus Propwash ${data.meta.propwash}`);
none(data.gamerules.rules.map((r) => checkCommand(data.gamerules.rules, r.example)).filter(Boolean), 'Beispielbefehle der Regeln gültig');
none(RECIPES.flatMap((r) => r.commands.map((c) => checkCommand(data.gamerules.rules, c))).filter(Boolean), 'Befehle der Rezepte gültig');
none(data.controls.keys.filter((k) => !k.title || !k.title.en || !k.title.de).map((k) => `Taste ${k.name} ohne Text`), 'Tasten mit Texten en/de');

// 3. Pages

const UMLAUT_SUBSTITUTES = /\b(fuer|ueber|koennen|koennte|moeglich|waehrend|waehlen|aendern|Aenderung|Groesse|groesser|muessen|muesst|zurueck|Schluessel|hoechstens|naechste|spaeter|Haelfte|Gelaende|heisst|Strasse|schliesslich|gruen|Faelle|Laenge|Hoehe|natuerlich|uebernehmen|Uebersicht)\b/;
const LOCAL_PATHS = [/\/Users\//, /[A-Za-z]:\\Users/];
const DENYLIST_FILE = process.env.PROPWASH_EXPORT_DENYLIST || path.join(os.homedir(), '.config', 'propwash', 'public-export-denylist.txt');
const DENYLIST = fs.existsSync(DENYLIST_FILE)
  ? fs.readFileSync(DENYLIST_FILE, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.toLowerCase())
  : [];
const SELF_CLOSING = new Set(['br', 'img', 'meta', 'link', 'input', 'wbr', 'source', 'use', 'path', 'circle', 'rect', 'hr']);
const CHECKED_TAGS = ['section', 'div', 'table', 'thead', 'tbody', 'tr', 'ul', 'ol', 'li', 'p', 'figure', 'figcaption', 'details', 'summary', 'pre', 'nav', 'article', 'header', 'footer', 'main', 'h1', 'h2', 'h3', 'a', 'code', 'span', 'strong', 'em', 'kbd', 'td', 'th', 'button'];

function resolveLink(fromFile, href) {
  const clean = href.split('#')[0].split('?')[0];
  if (!clean) return null;
  let target = path.resolve(path.dirname(path.join(ROOT, fromFile)), clean);
  if (clean.endsWith('/')) target = path.join(target, 'index.html');
  return target;
}

for (const [file, html] of Object.entries(rendered)) {
  if (!file.endsWith('.html')) continue;
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  ok(!dup.length, `${file}: Ids eindeutig ${dup.length ? '(' + [...new Set(dup)].join(', ') + ')' : ''}`);
  const idSet = new Set(ids);
  const missingAnchors = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]).filter((id) => !idSet.has(id));
  ok(!missingAnchors.length, `${file}: Sprungziele vorhanden ${missingAnchors.length ? '(' + [...new Set(missingAnchors)].join(', ') + ')' : ''}`);

  const refs = [
    ...[...html.matchAll(/\s(?:href|src)="([^"]+)"/g)].map((m) => m[1]),
    ...[...html.matchAll(/\ssrcset="([^"]+)"/g)].flatMap((m) => m[1].split(',').map((s) => s.trim().split(/\s+/)[0])),
  ].filter((h) => !/^(https?:|mailto:|#|data:)/.test(h));
  const broken = [];
  for (const href of refs) {
    const target = resolveLink(file, href);
    if (!target) continue;
    const local = target.startsWith(ROOT) ? rel(target) : null;
    const exists = fs.existsSync(target) || (local && Object.prototype.hasOwnProperty.call(rendered, local));
    if (!exists) broken.push(href);
  }
  ok(!broken.length, `${file}: lokale Links und Bilder vorhanden ${broken.length ? '(' + [...new Set(broken)].join(', ') + ')' : ''}`);

  for (const [anchorFile, anchor] of [...html.matchAll(/href="([^"#]+\/)#([^"]+)"/g)].map((m) => [m[1], m[2]])) {
    const target = resolveLink(file, anchorFile);
    const local = target && target.startsWith(ROOT) ? rel(target) : null;
    const other = local && rendered[local];
    if (other) ok(other.includes(`id="${anchor}"`), `${file}: Sprungziel ${anchorFile}#${anchor} vorhanden`);
  }

  const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  const en = (main.match(/\slang="en"/g) || []).length;
  const de = (main.match(/\slang="de"/g) || []).length;
  ok(en === de && en > 0, `${file}: Texte englisch und deutsch paarweise (${en}/${de})`);

  const unbalanced = [];
  for (const tag of CHECKED_TAGS) {
    if (SELF_CLOSING.has(tag)) continue;
    const open = (html.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length;
    const close = (html.match(new RegExp(`</${tag}>`, 'g')) || []).length;
    if (open !== close) unbalanced.push(`${tag} ${open}/${close}`);
  }
  ok(!unbalanced.length, `${file}: Tags ausgeglichen ${unbalanced.length ? '(' + unbalanced.join(', ') + ')' : ''}`);

  const germanTexts = [...html.matchAll(/<([a-z0-9]+)[^>]*\slang="de"[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => m[2].replace(/<[^>]+>/g, ' '));
  const substitutes = germanTexts.map((t) => t.match(UMLAUT_SUBSTITUTES)).filter(Boolean).map((m) => m[0]);
  ok(!substitutes.length, `${file}: deutsche Texte mit echten Umlauten ${substitutes.length ? '(' + [...new Set(substitutes)].join(', ') + ')' : ''}`);
}

const scanned = [
  ...Object.entries(rendered).map(([file, content]) => [file, content]),
  ...walk(path.join(ROOT, 'tools/docs')).map((f) => [rel(f), fs.readFileSync(f, 'utf8')]),
  ...['tools/build-docs.mjs', 'assets/css/docs.css', 'assets/js/docs.js'].map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]),
];
ok(DENYLIST.length > 0, `Sperrliste vorhanden und nicht leer (PROPWASH_EXPORT_DENYLIST oder ~/.config/propwash/public-export-denylist.txt)`);
for (const [file, content] of scanned) {
  const lower = content.toLowerCase();
  const hits = [
    ...LOCAL_PATHS.filter((re) => re.test(content)).map(String),
    ...DENYLIST.map((term, i) => (lower.includes(term) ? `Begriff ${i + 1} der Sperrliste` : null)).filter(Boolean),
  ];
  ok(!hits.length, `${file}: keine lokalen Pfade und kein Begriff der Sperrliste ${hits.length ? '(' + hits.join(', ') + ')' : ''}`);
}

const images = Object.values(data.images);
for (const img of images) {
  for (const w of [img.small, img.large]) {
    ok(fs.existsSync(path.join(ROOT, `assets/img/docs/${img.name}-${w}.webp`)), `Bild assets/img/docs/${img.name}-${w}.webp vorhanden`);
  }
}

const total = passed + failed;
if (!quiet || failed) console.log(`${passed}/${total} Prüfungen bestanden`);
else console.log(`${passed}/${total} Prüfungen bestanden`);
process.exit(failed ? 1 : 0);
