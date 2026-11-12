#!/usr/bin/env node
// The add-on directory, its data and its pages (website design 0.6.0, 3.6 and 6.2):
//   - assets/data/addons/registry.json: valid, namespaces and short ids unique, propwash never given to an add-on,
//     an add-on without a short id yet (short_id null: share codes name it with its full namespace) is fine and stays
//     out of directory.json, which Propwash copies (0.6.0 knows the short ids 1 and 2 only),
//     no download address of its own (downloads come only from assets/data/platforms.json: CurseForge and Modrinth),
//     only appended to against the last release (newest tag v*, else origin/main, or --against <ref>); the validator
//     refuses broken copies
//   - only released official add-ons and no page for anything else: the add-on pages are exactly the listed ones,
//     nothing for the deferred server add-on, nothing for the namespaces of add-ons still in development (the sibling
//     checkouts propwash-camera and propwash-mobdefense, if they are there, whose mod id is no product of
//     platforms.json); the official add-ons of the release (Just More Parts, Camera Drones, Mob Defense) are listed
//     with a card that has its picture, the version, the Propwash it needs and its downloads, and a page of their own
//   - the hosted web export of every listed version exists and loads into the configurator's catalog; with --release
//     it must be built from the release jar itself, not a pre-release
//   - /addons/ and the pages of the add-ons are up to date (node tools/build-addons.mjs): cards, short ids, facts,
//     part lists; every part count on the pages is the count of the hosted parts.json; the page of Just More Parts
//     names what 1.2.0 brings and which Propwash it needs, in English and German
//   - the navigation links /addons/, the sitemap lists the pages, the privacy policy covers the jar read in the browser
//
//   node tools/test-addons.mjs [--against <git ref>] [--release]

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateRegistry, appendOnly, listed } from '../assets/js/configurator/directory.js';
import { composeCatalog, createCatalog } from '../assets/js/configurator/data.js';
import { catalogPart } from '../assets/js/configurator/catalog-build.js';
import { outOfDate, context, versionDir, REGISTRY, PLATFORMS } from './build-addons.mjs';
import { LINKS } from './site-nav.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_REPOSITORY = 'https://github.com/LardTom/propwash';
const argv = process.argv.slice(2);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
let checks = 0;
const failures = [];
const notes = [];
function check(ok, message) {
  checks++;
  if (!ok) failures.push(message);
  return !!ok;
}

const registry = JSON.parse(read(REGISTRY));
const platforms = JSON.parse(read(PLATFORMS));
const catalog = JSON.parse(read('assets/data/configurator/catalog.json'));

// 1. The registry and its validator.
const problems = validateRegistry(registry, platforms);
check(!problems.length, `${REGISTRY}:\n    ${problems.join('\n    ')}`);
const broken = [
  ['propwash as an add-on', (r) => { r.addons.push({ ...r.addons[0], namespace: 'propwash', short_id: 9 }); }, 'belongs to Propwash'],
  ['short id given twice', (r) => { r.addons.push({ ...r.addons[0], namespace: 'other', short_id: r.addons[0].short_id }); }, 'given twice'],
  ['namespace given twice', (r) => { r.addons.push({ ...r.addons[0], short_id: 99 }); }, 'namespace given twice'],
  ['short id 1', (r) => { r.addons[0].short_id = 1; }, 'short_id must be'],
  ['own download address', (r) => { r.addons[0].download = 'https://github.com/LardTom/x/releases'; }, 'only from assets/data/platforms.json'],
  ['a product without platforms', (r) => { r.addons[0].platforms = 'server'; }, 'platforms must name a product'],
  ['missing German text', (r) => { delete r.addons[0].text.de; }, 'text needs en and de'],
  ['unknown status', (r) => { r.addons[0].status = 'beta'; }, 'status must be'],
  ['web export of an unlisted version', (r) => { r.addons[0].web_export = { version: '9.9.9', path: `assets/data/addons/${r.addons[0].namespace}/9.9.9/` }; }, 'web_export.version'],
  ['versions falling', (r) => { r.addons[0].versions = ['1.2.0', '1.1.0']; }, 'versions must rise'],
  ['unknown kind', (r) => { r.addons[0].kinds = ['servers']; }, 'kinds must be'],
  ['base changed', (r) => { r.base.short_id = 3; }, 'base must be propwash'],
];
for (const [what, mutate, expected] of broken) {
  const copy = structuredClone(registry);
  mutate(copy);
  const errs = validateRegistry(copy, platforms);
  check(errs.some((e) => e.includes(expected)), `validator misses: ${what} (got ${errs.join(' | ') || 'no error'})`);
}
{
  const later = structuredClone(registry);
  later.addons.push({ ...structuredClone(registry.addons[0]), namespace: 'noshortid', short_id: null, official: false });
  check(!validateRegistry(later, platforms).some((e) => e.includes('short_id')), 'validator: an add-on without a short id yet (null) is fine');
  const twice = structuredClone(later);
  twice.addons.push({ ...structuredClone(registry.addons[0]), namespace: 'noshortid2', short_id: null, official: false });
  check(!validateRegistry(twice, platforms).some((e) => e.includes('given twice')), 'validator: two add-ons without a short id do not clash');
  const given = structuredClone(later);
  given.addons[given.addons.length - 1].short_id = 7;
  check(!appendOnly(later, given).length, 'append-only: a short id given later to an add-on that had none is fine');
  const taken = structuredClone(given);
  taken.addons[taken.addons.length - 1].short_id = null;
  check(appendOnly(given, taken).length > 0, 'append-only: a given short id is never taken back');
}
const appended = structuredClone(registry);
appended.addons.push({ ...structuredClone(registry.addons[0]), namespace: 'later', short_id: 3, official: false });
check(!appendOnly(registry, appended).length, 'append-only: a new add-on at the end is fine');
const moved = structuredClone(registry);
moved.addons[0].short_id = 5;
check(appendOnly(registry, moved).length > 0, 'append-only: a changed short id is refused');
const dropped = structuredClone(registry);
dropped.addons = [];
check(appendOnly(registry, dropped).length > 0, 'append-only: a removed add-on is refused');

// 2. Append-only against the last release.
function gitShow(ref, rel) {
  try {
    return execFileSync('git', ['-C', ROOT, 'show', `${ref}:${rel}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}
function lastRelease() {
  const i = argv.indexOf('--against');
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  try {
    const tags = execFileSync('git', ['-C', ROOT, 'tag', '--list', 'v*', '--sort=-v:refname'], { encoding: 'utf8' }).split('\n').filter(Boolean);
    if (tags.length) return tags[0];
  } catch {
    // no git
  }
  return 'origin/main';
}
const ref = lastRelease();
const before = gitShow(ref, REGISTRY);
if (before) {
  const d = appendOnly(JSON.parse(before), registry);
  check(!d.length, `${REGISTRY} against ${ref}: ${d.join('; ')}`);
} else {
  notes.push(`${ref} has no ${REGISTRY} yet – nothing to compare`);
}

// 3. Only released official add-ons, no pages for anything else.
const pages = listed(registry).map((a) => a.page);
const dirs = exists('addons') ? fs.readdirSync(path.join(ROOT, 'addons'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => `addons/${e.name}/`) : [];
check(JSON.stringify(dirs.sort()) === JSON.stringify([...pages].sort()), `add-on pages (${dirs}) are exactly the listed add-ons (${pages})`);
for (const a of registry.addons) check(a.status !== 'listed' || exists(`${a.page}index.html`), `${a.namespace}: page ${a.page} exists`);
check(!exists('addons/server') && !exists('docs/server'), 'no page for the deferred server add-on');
const blocked = [];
// The sibling checkouts lie next to the main checkout of this repository (also when this is a worktree of it).
let home = path.resolve(ROOT, '..');
try {
  home = path.resolve(path.dirname(path.resolve(ROOT, execFileSync('git', ['-C', ROOT, 'rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim())), '..');
} catch {
  // no git: next to this folder
}
for (const repo of ['propwash-camera', 'propwash-mobdefense']) {
  const props = path.resolve(home, repo, 'gradle.properties');
  if (!fs.existsSync(props)) continue;
  const id = /^mod_id\s*=\s*(\S+)/m.exec(fs.readFileSync(props, 'utf8'));
  // Released (a product of platforms.json, like Camera Drones and Mob Defense with 0.6.0) or still in development.
  if (id && !platforms.products[id[1]]) blocked.push(id[1]);
}
for (const ns of blocked) {
  check(!registry.addons.some((a) => a.namespace === ns), 'an add-on still in development is not in the registry');
  check(!exists(`assets/data/addons/${ns}`), 'no hosted data for an add-on still in development');
  check(!dirs.some((d) => d.includes(ns)), 'no page for an add-on still in development');
}
if (!blocked.length) notes.push('no sibling checkout of an add-on in development – nothing to keep off the site');

// The official add-ons of the release: listed with a card and a page of their own.
const OFFICIAL = { justmoreparts: 'addons/just-more-parts/', camdrones: 'addons/camera-drones/', mobdefense: 'addons/mob-defense/' };
const directoryJson = JSON.parse(read('assets/data/addons/directory.json'));
const copied = directoryJson.addons.map((a) => a.namespace);
for (const a of registry.addons) {
  check(a.short_id == null ? !copied.includes(a.namespace) : copied.includes(a.namespace),
    `${a.namespace}: directory.json (Propwash's copy) lists exactly the add-ons with a short id (short id ${a.short_id})`);
}
{
  const dirHtml = read('addons/index.html');
  const official = (/<section[^>]*aria-labelledby="official-title"[\s\S]*?<\/section>/.exec(dirHtml) || [''])[0];
  for (const [ns, page] of Object.entries(OFFICIAL)) {
    const a = registry.addons.find((x) => x.namespace === ns);
    if (!check(a && a.official && a.status === 'listed' && a.page === page, `${ns}: listed as an official add-on with the page ${page}`)) continue;
    const product = platforms.products[a.platforms];
    const card = (new RegExp(`<li class="addon-card[^"]*" id="addon-${ns}"[\\s\\S]*?</li>\\n\\s*(?=<li class="addon-card|</ul>)`).exec(official) || [''])[0];
    check(card, `/addons/: the card of ${ns} under “Official add-ons”`);
    check(/<img [^>]*src="[^"]*assets\/img\/addon-[a-z-]+-800\.webp"[^>]*alt="[^"]{20,}"/.test(card), `/addons/: the card of ${ns} has its picture with a description`);
    check(card.includes(`<span class="mono">${product.version}</span>`), `/addons/: the card of ${ns} names version ${product.version}`);
    check(card.includes(`Propwash ${a.requires.propwash} or newer`) && card.includes(`Propwash ${a.requires.propwash} oder neuer`), `/addons/: the card of ${ns} names the Propwash it needs`);
    check(card.includes(product.curseforge.url) && card.includes(product.modrinth.url), `/addons/: the card of ${ns} has its CurseForge and Modrinth buttons`);
    const html = exists(`${page}index.html`) ? read(`${page}index.html`) : '';
    check(/<img [^>]*src="(?:\.\.\/)+assets\/img\/addon-[a-z-]+-(?:800|1600)\.webp"/.test(html), `${page}: the page shows the add-on's picture`);
    check(html.includes(product.curseforge.url) && html.includes(product.modrinth.url), `${page}: downloads on CurseForge and Modrinth`);
    check(/href="(?:\.\.\/)+#server"/.test(html), `${page}: points to the community server on the landing page`);
  }
}
{
  const said = (page, lang) => [...read(page).matchAll(new RegExp(`<([a-z0-9]+)[^>]*lang="${lang}"[^>]*>([\\s\\S]*?)</\\1>`, 'g'))].map((m) => m[2].replace(/<[^>]+>/g, '')).join(' ');
  const cam = 'addons/camera-drones/index.html';
  const mob = 'addons/mob-defense/index.html';
  if (exists(cam)) {
    const en = said(cam, 'en');
    const de = said(cam, 'de');
    for (const [e, d] of [[/Getting started/, /Erste Schritte/], [/Flight modes/, /Flugmodi/], [/Flight Planner/, /Flugplaner/], [/[Tt]wo pilots/, /[Zz]wei Piloten/]]) {
      check(e.test(en) && d.test(de), `Camera Drones page: the section ${e.source} / ${d.source}`);
    }
    check(/server and on every client/.test(en) && /Server und auf jedem Client/.test(de), 'Camera Drones page: installed on the server and on every client');
  } else check(false, `${cam} exists`);
  if (exists(mob)) {
    const html = read(mob);
    const en = said(mob, 'en');
    const de = said(mob, 'de');
    for (const [e, d] of [[/Dispenser Mount/, /Dispenser-Halterung/], [/Spear Mount/, /Speer-Halterung/], [/Rocket Booster/, /Raketen-Booster/], [/Getting started/, /Erste Schritte/]]) {
      check(e.test(en) && d.test(de), `Mob Defense page: names ${e.source} / ${d.source}`);
    }
    check(/<table[\s\S]*?\bMob\b[\s\S]*?<\/table>/.test(html), 'Mob Defense page: a table of the mobs and how they react');
    check(/<table[\s\S]*?mobdefense:[a-z_]+[\s\S]*?<\/table>/.test(html), 'Mob Defense page: a table of its world rules with their ids');
    check(/server and on every client/.test(en) && /Server und auf jedem Client/.test(de), 'Mob Defense page: installed on the server and on every client');
  } else check(false, `${mob} exists`);
}
for (const a of registry.addons) check(a.official || a.status !== 'listed' || a.versions.length, `${a.namespace}: listed with a released version`);

// 4. Hosted exports exist and load into the configurator.
const ctx = context(ROOT);
for (const a of listed(registry)) {
  if (!a.web_export) continue;
  const dir = versionDir(a.namespace, a.web_export.version);
  check(dir === a.web_export.path, `${a.namespace}: web_export.path ${a.web_export.path}`);
  for (const f of ['manifest.json', 'parts.json', 'chemistries.json', 'mounts.json']) check(exists(`${dir}${f}`), `${dir}${f} exists`);
  const m = ctx.hosted[a.namespace] && ctx.hosted[a.namespace][a.web_export.version];
  if (!check(m, `${a.namespace}: manifest of ${a.web_export.version}`)) continue;
  check(m.namespace === a.namespace && m.listed_as === a.web_export.version && m.short_id === a.short_id, `${a.namespace}: manifest names the add-on, the version and short id ${a.short_id}`);
  check(/^[0-9a-f]{64}$/.test(m.jar.sha256) && m.jar.bytes > 0 && m.jar.file.endsWith('.jar'), `${a.namespace}: manifest names the jar with its SHA-256`);
  check((m.requires.propwash || '').startsWith(`>=${a.requires.propwash}`) || (m.requires.propwash || '').startsWith(`[${a.requires.propwash}`), `${a.namespace}: the jar needs Propwash ${a.requires.propwash} (${m.requires.propwash})`);
  if (argv.includes('--release')) check(m.mod.version === m.listed_as, `${a.namespace}: hosted ${m.listed_as} is built from ${m.mod.version} – rebuild from the release jar`);
  else if (m.mod.version !== m.listed_as) notes.push(`${a.namespace} ${m.listed_as} is built from ${m.mod.version} (pre-release); --release refuses that`);
  const parts = JSON.parse(read(`${dir}parts.json`));
  const counted = Object.entries(m.counts).filter(([k]) => k !== 'chemistry').reduce((n, [, v]) => n + v, 0);
  check(parts.length === counted, `${a.namespace}: ${parts.length} parts in parts.json, manifest counts ${counted}`);
  const fragment = {
    namespaces: [{ namespace: a.namespace, name: m.mod.name, version: m.mod.version, short_id: m.short_id, table_source: m.table_source, table_entries: m.table_entries, table_crc: m.table_crc, requires: m.requires, source: 'directory' }],
    parts: parts.map(catalogPart),
    chemistries: JSON.parse(read(`${dir}chemistries.json`)).map(({ used_by, ...c }) => c),
    mounts: {},
    tables: exists(`${dir}share_table.json`) ? { [a.namespace]: JSON.parse(read(`${dir}share_table.json`)) } : {},
  };
  const composed = createCatalog(composeCatalog(catalog, { fragments: [fragment] }));
  check(composed.parts.filter((p) => p.id.startsWith(`${a.namespace}:`)).length === parts.length, `${a.namespace}: the hosted export loads into the configurator`);
  const official = catalog.parts.filter((p) => p.id.startsWith(`${a.namespace}:`));
  if (official.length) {
    const same = official.every((p) => JSON.stringify(p) === JSON.stringify(fragment.parts.find((x) => x.id === p.id)));
    check(same && official.length === parts.length, `${a.namespace}: the hosted export is the add-on the configurator shows (${official.length} parts)`);
  }
}

// 5. Pages up to date and what they say.
const stale = outOfDate(ROOT);
check(!stale.length, `out of date, run node tools/build-addons.mjs: ${stale.map((s) => s.file).join(', ')}`);
const jmp = registry.addons.find((a) => a.namespace === 'justmoreparts');
if (jmp) {
  const html = read(`${jmp.page}index.html`);
  const parts = JSON.parse(read(`${versionDir('justmoreparts', jmp.web_export.version)}parts.json`));
  const totals = [...html.matchAll(/data-addon-parts-total>(\d+)</g)].map((m) => Number(m[1]));
  check(totals.length && totals.every((n) => n === parts.length), `JMP page: part count ${totals} = parts.json (${parts.length})`);
  // The parts lists of the page; the parts new in the listed version (addons:new) appear there a second time.
  const listedParts = new Set(html.match(/data-part="justmoreparts:[^"]+"/g) || []).size;
  check(listedParts === parts.length, `JMP page: ${listedParts} parts listed, parts.json has ${parts.length}`);
  for (const p of parts) if (!html.includes(`data-part="${p.id}"`)) check(false, `JMP page: ${p.id} missing from the list`);
  const dirHtml = read('addons/index.html');
  const cardTotals = [...dirHtml.matchAll(/data-addon-parts-total>(\d+)</g)].map((m) => Number(m[1]));
  check(cardTotals.includes(parts.length), `/addons/: the card counts ${parts.length} parts (${cardTotals})`);
  const text = (lang) => [...html.matchAll(new RegExp(`<([a-z]+)[^>]*lang="${lang}"[^>]*>([\\s\\S]*?)</\\1>`, 'g'))].map((m) => m[2].replace(/<[^>]+>/g, '')).join(' ');
  const en = text('en');
  const de = text('de');
  const wants = [
    ['race whoop motors of very high KV', /very high KV/.test(en), /sehr hoher KV/.test(de)],
    ['the 65 mm race whoop preset', /65&nbsp;mm race whoop preset|65 mm race whoop preset/.test(en), /65-mm-Renn-Whoop/.test(de)],
    ['the battery plugged in', /Battery plugged in/.test(en), /Akku gesteckt/.test(de)],
    ['share codes from Propwash', /Share codes from Propwash/.test(en), /Sharecodes von Propwash/.test(de)],
    [`Propwash ${jmp.requires.propwash} needed`, en.includes(`Propwash ${jmp.requires.propwash}`), de.includes(`Propwash ${jmp.requires.propwash}`) || de.includes(`Propwash ab ${jmp.requires.propwash}`)],
  ];
  for (const [what, inEn, inDe] of wants) check(inEn && inDe, `JMP page: says ${what} in English (${inEn}) and German (${inDe})`);
  const oldJmp = (lang) => [...html.matchAll(new RegExp(`<li lang="${lang}">([\\s\\S]*?)</li>`, 'g'))].map((m) => m[1].replace(/<[^>]+>/g, '')).find((s) => /Just More Parts 1\.1\b/.test(s)) || '';
  const oldEn = oldJmp('en');
  const oldDe = oldJmp('de');
  check(/Propwash 0\.6\.0/.test(oldEn) && /refuses|does not start|won’t start|stops/.test(oldEn) && /1\.2\.0/.test(oldEn) && !/also (?:starts|runs)|(?:starts|runs) with Just More Parts 1\.1/.test(oldEn),
    `JMP page: Propwash 0.6.0 refuses Just More Parts 1.1 and asks for 1.2.0, in English (“${oldEn}”)`);
  check(/Propwash 0\.6\.0/.test(oldDe) && /lehnt|bricht|startet nicht/.test(oldDe) && /1\.2\.0/.test(oldDe) && !/startet auch mit|läuft (?:auch )?mit Just More Parts 1\.1/.test(oldDe),
    `JMP page: Propwash 0.6.0 refuses Just More Parts 1.1 and asks for 1.2.0, in German (“${oldDe}”)`);
  check(/configurator\/\?addon=justmoreparts/.test(html) && /configurator\/\?addon=justmoreparts/.test(dirHtml), '“Show in the configurator” on the card and the page');
  check(!/<a\b[^>]*href="https:\/\/github\.com[^"]*"[^>]*>[^<]*\w/.test(html.replace(/<svg[\s\S]*?<\/svg>/g, '')), 'JMP page: GitHub only as an icon');
}
for (const page of ['addons/index.html', ...pages.map((p) => `${p}index.html`)]) {
  const html = read(page);
  for (const m of html.matchAll(/<a\b[^>]*href="(https?:[^"]+)"/g)) {
    const url = m[1];
    const ok = /^https:\/\/(www\.curseforge\.com|modrinth\.com)\//.test(url) || /^https:\/\/github\.com\/LardTom\//.test(url) || /^https:\/\/discord\.gg\//.test(url)
      || /^https:\/\/polyformproject\.org\//.test(url);
    check(ok, `${page}: external link ${url} – downloads only on CurseForge and Modrinth`);
  }
  check(!/\bdownload\b[^<]*github|github[^<]*\bdownload\b/i.test(html), `${page}: no GitHub download`);
}

{
  const html = read('addons/index.html');
  const section = (/<section[^>]*\bid="listing"[\s\S]*?<\/section>/.exec(html) || [''])[0];
  const dir = '.github/ISSUE_TEMPLATE';
  const template = exists(dir) ? fs.readdirSync(path.join(ROOT, dir)).find((f) => /\.ya?ml$/.test(f) && /^name:\s*Add-on listing\s*$/m.test(read(`${dir}/${f}`))) : null;
  const hrefs = [...section.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  const issue = `${SITE_REPOSITORY}/issues/new?template=${template}`;
  check(!!template, `${dir}: the issue template “Add-on listing” exists`);
  check(hrefs.includes(issue), `/addons/#listing: links the issue template “Add-on listing” (${issue}; links: ${hrefs.join(', ')})`);
  check(hrefs.some((h) => /^https:\/\/discord\.gg\//.test(h)), `/addons/#listing: links the Discord (${hrefs.join(', ')})`);
  const said = (lang) => [...section.matchAll(new RegExp(`<([a-z]+)[^>]*lang="${lang}"[^>]*>([\\s\\S]*?)</\\1>`, 'g'))].map((m) => m[2].replace(/<[^>]+>/g, '')).join(' ');
  check(/ticket/i.test(said('en')) && /\bissue\b/i.test(said('en')) && said('en').includes('Add-on listing'), `/addons/#listing: names the Discord ticket and the issue with the template in English (“${said('en').slice(0, 200)}”)`);
  check(/Ticket/.test(said('de')) && /\bIssue\b/.test(said('de')) && said('de').includes('Add-on listing'), `/addons/#listing: names the Discord ticket and the issue with the template in German (“${said('de').slice(0, 200)}”)`);
}

// 6. Navigation, sitemap, privacy policy.
check(LINKS.some((l) => l.href === 'addons/' && l.current === 'addons'), 'the main navigation links /addons/');
const sitemap = read('sitemap.xml');
for (const p of ['addons/', ...pages]) check(sitemap.includes(`https://propwashfpv.com/${p}</loc>`), `sitemap.xml lists ${p}`);
const privacy = read('datenschutz/index.html');
check(/jar file[^<]*only|reads the file on your device only/.test(privacy) && /Jar-Datei[^<]*nur auf deinem Gerät|liest dein Browser sie nur/.test(privacy), 'privacy policy: the add-on jar is only read in the browser (EN and DE)');
check(/never uploaded/.test(privacy) && /nie hochgeladen/.test(privacy), 'privacy policy: nothing is uploaded (EN and DE)');

for (const n of notes) console.log(`note: ${n}`);
if (failures.length) {
  for (const f of failures) console.log(`  FAIL ${f}`);
  console.log(`add-ons: ${checks - failures.length}/${checks} checks passed`);
  process.exit(1);
}
console.log(`add-ons: ${checks} checks passed (${listed(registry).length} listed: ${listed(registry).map((a) => `${a.namespace} ${a.versions.at(-1)}`).join(', ')}; pages ${['addons/', ...pages].join(', ')})`);
