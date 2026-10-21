#!/usr/bin/env node
// Checks the download platforms (assets/data/platforms.json, website design 0.6.0, 3.3):
//   - platforms.json is valid (only CurseForge and Modrinth, known statuses, source addresses are repositories) and
//     the validator rejects broken copies (a GitHub download, a releases address, an unknown status, …)
//   - every platform region of the hand-written pages is up to date (node tools/build-platforms.mjs) and the landing
//     page has its regions: hero, download buttons and status line, FAQ answer, add-on, source-code icons
//   - on every page and in the data and scripts: no link to github.com/…/releases, every link to a CurseForge or
//     Modrinth page of Propwash is an address from platforms.json, every link to a repository of LardTom starts with a
//     source address (or is the issue template "Add-on listing" of this website's repository, website design 0.6.0,
//     3.6), links that say "Download" lead to a platform or stay on the site, and no GitHub link says
//     "GitHub" or "Download" in its visible text
//   - the pages for players (all but the docs and the legal pages) name GitHub only in aria-label/title of the icon
//   - the footer constants of tools/site-nav.mjs and the docs use the same addresses as platforms.json
//   - the status lines match the versions, the version in the compatibility list and in the add-on block is current,
//     and the version of "What's new" belongs to the current release line
//   - the roadmap draws download buttons only for products of platforms.json, through assets/js/i18n.js
//   - the FAQ has an id on every question (the 15 of 0.6.0, in order) and no page names the deferred server add-on
//
//   node tools/test-platforms.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePlatforms, downloads, statusText, PLATFORMS_URL } from '../assets/js/roadmap/platforms.js';
import { validateRoadmap } from '../assets/js/roadmap/data.js';
import { outOfDate, regions, pagesWithRegions, render, DATA } from './build-platforms.mjs';
import { CURSEFORGE, MODRINTH, SOURCE } from './site-nav.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

let checks = 0;
const failures = [];
function check(ok, message) {
  checks++;
  if (!ok) failures.push(message);
}

const data = JSON.parse(read(DATA));
const products = Object.keys(data.products || {});
const main = products[0];

// 1. The data and its validator.
const problems = validatePlatforms(data);
check(problems.length === 0, `${DATA}:\n    ${problems.join('\n    ')}`);
check(fileURLToPath(PLATFORMS_URL) === path.join(ROOT, DATA), `PLATFORMS_URL points to ${PLATFORMS_URL}`);
check(main === 'propwash', `the first product of ${DATA} is the mod itself (propwash), not ${main}`);
const broken = [
  ['GitHub as a platform', (d) => { d.products.propwash.github = { url: 'https://github.com/LardTom/propwash-fpv/releases', status: 'live' }; }, 'unknown field'],
  ['releases as source', (d) => { d.source.propwash = 'https://github.com/LardTom/propwash-fpv/releases'; }, 'repository address'],
  ['unknown status', (d) => { d.products.propwash.modrinth.status = 'soon'; }, 'must be one of'],
  ['CurseForge address on another host', (d) => { d.products.propwash.curseforge.url = 'https://example.com/propwash'; }, 'must be https://www.curseforge.com'],
  ['missing platform', (d) => { delete d.products.justmoreparts.modrinth; }, 'missing'],
  ['missing German label', (d) => { delete d.labels.review.de; }, 'missing text'],
  ['label without placeholder', (d) => { d.labels.live.en = 'Download'; }, 'placeholder {platform}'],
  ['GitHub in a label', (d) => { d.labels.live.en = 'Download on {platform} or GitHub'; }, 'GitHub is no download platform'],
  ['bad version', (d) => { d.products.propwash.version = 'v0.6'; }, 'must look like 1.2.3'],
  ['source of an unknown product', (d) => { d.source.server = 'https://github.com/LardTom/propwash-server'; }, 'no such product']
];
for (const [what, mutate, expected] of broken) {
  const copy = structuredClone(data);
  mutate(copy);
  const errs = validatePlatforms(copy);
  check(errs.some((e) => e.includes(expected)), `validator misses: ${what} (got ${errs.length ? errs.join(' | ') : 'no error'})`);
}
const cases = structuredClone(data);
cases.products.propwash.curseforge.status = 'live';
cases.products.propwash.modrinth.status = 'review';
const mixed = downloads(cases, 'propwash');
check(mixed[0].primary && !mixed[1].primary && mixed[0].url && mixed[1].url, 'live CurseForge is the primary button, Modrinth in review a plain one');
check(statusText(cases, 'propwash').en === 'CurseForge: out now · Modrinth: in review', `status line of a mixed state: ${statusText(cases, 'propwash').en}`);
cases.products.propwash.curseforge.status = 'review';
check(downloads(cases, 'propwash').every((d) => !d.primary), 'no primary button while no platform is live');
cases.products.propwash.modrinth.status = 'pending';
const pend = downloads(cases, 'propwash');
check(pend[1].url === null && pend[1].label === null, 'a pending platform has no link');
const html = render('<div>\n  <!-- platforms:buttons propwash -->\n  <!-- /platforms -->\n</div>\n', cases);
check(!html.includes('modrinth.com') && html.includes('Coming to Modrinth'), 'pending platforms are named without a link');

// 2. The generated regions.
let stale = [];
try {
  stale = outOfDate();
} catch (e) {
  check(false, e.message);
}
check(stale.length === 0, `out of date, run node tools/build-platforms.mjs: ${stale.map((s) => s.page).join(', ')}`);
check(pagesWithRegions().includes('index.html'), 'index.html carries platform regions');
const home = read('index.html');
let homeRegions = [];
try {
  homeRegions = regions(home);
} catch (e) {
  check(false, `index.html: ${e.message}`);
}
const section = (id) => {
  const start = home.search(new RegExp(`<(section|details|div)[^>]*\\sid="${id}"`));
  if (start < 0) return null;
  const tag = /<(\w+)/.exec(home.slice(start))[1];
  let depth = 0;
  const re = new RegExp(`<${tag}\\b|</${tag}>`, 'g');
  re.lastIndex = start;
  let m;
  while ((m = re.exec(home))) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return { start, end: m.index + m[0].length };
  }
  return null;
};
const inside = (id, kind, product) => {
  const s = section(id);
  return !!s && homeRegions.some((r) => r.kind === kind && r.product === product && r.start > s.start && r.end < s.end);
};
const heroEnd = home.indexOf('</section>', home.indexOf('<section class="hero"'));
check(homeRegions.some((r) => r.kind === 'hero' && r.product === main && r.end < heroEnd), 'index.html: the hero carries the download button (platforms:hero propwash)');
check(inside('download', 'buttons', main), 'index.html: the download section carries the platform buttons (platforms:buttons propwash)');
check(inside('download', 'status', main), 'index.html: the download section carries the status line (platforms:status propwash)');
check(inside('faq-download', 'faq-download', main), 'index.html: the FAQ "Where can I download it?" is generated (platforms:faq-download propwash)');
check(inside('faq-license', 'source', main), 'index.html: the FAQ about the license links the repository through the icon');
check(inside('addon', 'buttons', 'justmoreparts'), 'index.html: the add-on block carries the buttons and the source-code icon of Just More Parts');
check(inside('source', 'source', main), 'index.html: the source-code section carries the source-code icon');

// 3. Links on every page, in the data and in the scripts.
const SKIP = new Set(['node_modules', 'tools', '.git']);
function walk(dir = '', pick = () => true) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue;
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(rel, pick));
    else if (pick(rel)) out.push(rel);
  }
  return out.sort();
}
const pages = walk('', (f) => f.endsWith('/index.html') || f === 'index.html').filter((f) => !f.startsWith('assets/'));
const dataFiles = walk('assets/data', (f) => f.endsWith('.json')).filter((f) => !f.startsWith('assets/data/configurator/'));
const scripts = walk('assets/js', (f) => f.endsWith('.js'));

const platformUrls = new Set(products.flatMap((p) => ['curseforge', 'modrinth'].map((k) => data.products[p][k].url)));
const sources = Object.values(data.source || {});
const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const visible = (fragment) => decode(fragment.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/g, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const LANG_TREE = /^(es|fr|pt-br|pl|ru)\//;
const legal = (page) => /^(?:(?:es|fr|pt-br|pl|ru)\/)?(impressum|datenschutz)\//.test(page);
const docs = (page) => /^(?:(?:es|fr|pt-br|pl|ru)\/)?docs\//.test(page);

const LISTING_ISSUE = /^https:\/\/github\.com\/LardTom\/propwash\/issues\/new\?template=addon-listing\.yml$/;

function urlRules(url, where) {
  check(!/github\.com\/[^\s"'<>)]*\/releases\b/i.test(url), `${where}: links to GitHub releases (${url}) – downloads only on CurseForge and Modrinth`);
  if (/^https:\/\/(?:www\.)?(?:curseforge\.com|modrinth\.com)\//.test(url) && /propwash/i.test(url)) {
    check(platformUrls.has(url), `${where}: ${url} is not an address from ${DATA}`);
  }
  if (/^https:\/\/github\.com\/LardTom\//i.test(url) && !LISTING_ISSUE.test(url)) {
    check(sources.some((s) => url === s || url.startsWith(`${s}/`)), `${where}: ${url} is not below a source address of ${DATA}`);
  }
}

let links = 0;
for (const page of pages) {
  const body = read(page).replace(/<!--[\s\S]*?-->/g, '').replace(/<pre\b[\s\S]*?<\/pre>/g, '');
  for (const m of body.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
    const href = decode((/\shref="([^"]*)"/.exec(m[1]) || [])[1] || '');
    if (!href) continue;
    links++;
    urlRules(href, page);
    const text = visible(m[2]);
    const attrs = m[1];
    if (/^https?:\/\/github\.com\//i.test(href)) {
      check(!/github|download|herunterlad|release/i.test(text) || docs(page), `${page}: GitHub link with the visible text "${text}" (only an icon, named in aria-label/title)`);
      if (!text) check(/\saria-label="[^"]+"/.test(attrs) && /\stitle="[^"]+"/.test(attrs), `${page}: GitHub icon link without aria-label and title`);
    }
    if (/\b(download|herunterlad)/i.test(text) && /^https?:/i.test(href)) {
      check(platformUrls.has(href), `${page}: "${text}" leads to ${href} – downloads only from ${DATA}`);
    }
  }
  if (!legal(page) && !docs(page)) {
    const text = visible(body);
    check(!/\bGitHub\b/i.test(text), `${page}: names GitHub in its visible text – only the source-code icon (aria-label/title) may`);
  }
}
for (const file of [...dataFiles, ...scripts.filter((f) => f !== 'assets/js/roadmap/platforms.js')]) {
  const text = read(file);
  for (const m of text.matchAll(/https:\/\/[^\s"'`<>)\\]+/g)) urlRules(m[0], file);
}
for (const file of ['assets/data/roadmap.json', DATA]) {
  const strings = [];
  const visit = (v, key) => {
    if (typeof v === 'string') { if (key !== 'href' && key !== 'url' && !/^https:/.test(v)) strings.push(v); }
    else if (Array.isArray(v)) v.forEach((x) => visit(x, key));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) visit(x, k);
  };
  visit(JSON.parse(read(file)), null);
  check(!strings.some((s) => /\bGitHub\b/i.test(s)), `${file}: names GitHub in a text`);
}

// 4. The same addresses everywhere.
check(CURSEFORGE === data.products.propwash.curseforge.url, `tools/site-nav.mjs CURSEFORGE is ${CURSEFORGE}, ${DATA} says ${data.products.propwash.curseforge.url}`);
check(MODRINTH === data.products.propwash.modrinth.url, `tools/site-nav.mjs MODRINTH is ${MODRINTH}, ${DATA} says ${data.products.propwash.modrinth.url}`);
check(SOURCE === data.source.propwash, `tools/site-nav.mjs SOURCE is ${SOURCE}, ${DATA} says ${data.source.propwash}`);
if (exists('tools/docs/html.mjs')) {
  const jmp = /SOURCE_JMP\s*=\s*'([^']+)'/.exec(read('tools/docs/html.mjs'))?.[1];
  check(!jmp || jmp === data.source.justmoreparts, `tools/docs/html.mjs SOURCE_JMP is ${jmp}, ${DATA} says ${data.source.justmoreparts}`);
}

// 5. Versions on the landing page.
const versionOf = (p) => data.products[p].version;
for (const p of products) {
  const label = p === main ? 'VERSION' : data.products[p].short.toUpperCase();
  const lines = [...home.matchAll(new RegExp(`<p class="status">[\\s\\S]*?<span class="mono">${label} ([^<]+)</span>`, 'g'))].map((m) => m[1]);
  check(lines.every((v) => v === versionOf(p)) && (p !== main || lines.length === 1), `index.html: status line of ${p} shows ${lines.join(', ') || 'nothing'}, ${DATA} says ${versionOf(p)}`);
}
const compat = /<dl class="compat__list">[\s\S]*?<\/dl>/.exec(home)?.[0] || '';
const install = /<div><dt><span lang="en">Install<\/span>[\s\S]*?<\/div>/.exec(compat)?.[0] || '';
check((install.match(new RegExp(`\\b${versionOf(main).replace(/\./g, '\\.')}\\b`, 'g')) || []).length === 2, `index.html: the compatibility line "Install" names ${versionOf(main)} in English and German`);
const addon = section('addon');
if (addon) {
  const text = visible(home.slice(addon.start, addon.end));
  const named = [...text.matchAll(/\b\d+\.\d+\.\d+\b/g)].map((m) => m[0]);
  const allowed = new Set(products.map(versionOf));
  check(named.length > 0 && named.every((v) => allowed.has(v)), `index.html: the add-on block names ${[...new Set(named)].join(', ')}, ${DATA} has ${[...allowed].join(', ')}`);
}
const whatsNew = /<p class="hero__version"><a href="#new"><span class="mono">(\d+\.\d+)\.\d+<\/span>/.exec(home)?.[1];
const kicker = /id="new"[\s\S]*?<span lang="en">New in Propwash (\d+\.\d+)\.\d+<\/span>/.exec(home)?.[1];
const line = versionOf(main).split('.').slice(0, 2).join('.');
check(whatsNew === line && kicker === line, `index.html: "What's new" (hero ${whatsNew}, section ${kicker}) belongs to the release line ${line} of ${DATA}`);

// 6. The roadmap reads the platforms at runtime, in the page's language.
const roadmap = JSON.parse(read('assets/data/roadmap.json'));
const roadmapProblems = validateRoadmap(roadmap, { products: new Set(products) });
check(roadmapProblems.length === 0, `roadmap.json against ${DATA}:\n    ${roadmapProblems.join('\n    ')}`);
check(roadmap.horizons.some((h) => h.id === 'released' && h.download === main), 'roadmap.json: the released horizon shows the download buttons of Propwash');
const wrongProduct = structuredClone(roadmap);
wrongProduct.horizons[0].download = 'server';
check(validateRoadmap(wrongProduct, { products: new Set(products) }).some((e) => e.includes('no product "server"')), 'roadmap validator misses an unknown download product');
const view = read('assets/js/roadmap/view.js');
check(/from '\.\/platforms\.js(\?v=[0-9a-f]+)?'/.test(view), 'roadmap view.js imports platforms.js');
check(/import \{[^}]*\bspans\b[^}]*\bhref\b[^}]*\} from '\.\.\/i18n\.js(\?v=[0-9a-f]+)?'/.test(view), 'roadmap view.js draws its texts and links through assets/js/i18n.js (spans, href)');
check(/\bload\(\)/.test(view), 'roadmap view.js loads the texts of a translated page');
check(read('roadmap/index.html').includes('href="../assets/data/platforms.json"'), 'roadmap/index.html preloads assets/data/platforms.json');

// 7. FAQ ids and the deferred server add-on.
const FAQ = ['faq-radio', 'faq-radio-not-detected', 'faq-goggles', 'faq-realism', 'faq-learn', 'faq-multiplayer', 'faq-survival', 'faq-vr',
  'faq-motion-blur', 'faq-old-codes', 'faq-try', 'faq-download', 'faq-license', 'faq-addons', 'faq-languages'];
const faq = section('faq');
const faqHtml = faq ? home.slice(faq.start, faq.end) : '';
const details = [...faqHtml.matchAll(/<details(?:\s+id="([^"]*)")?[^>]*>/g)].map((m) => m[1] || null);
check(details.every(Boolean), `index.html: every FAQ question has an id (${details.filter((d) => !d).length} without)`);
check(details.join() === FAQ.join(), `index.html: FAQ ids in this order: ${FAQ.join(', ')} (found ${details.join(', ')})`);
check(new Set(details).size === details.length, 'index.html: FAQ ids are unique');
for (const page of pages.filter((p) => !p.startsWith('roadmap/') && !LANG_TREE.test(p))) {
  const text = visible(read(page));
  check(!/Propwash: Server|server add-on|Server-Add-on|Server-Mod\b|server mod\b/i.test(text), `${page}: names the deferred server add-on`);
  check(!/href="[^"]*(?:addons|docs)\/server\//.test(read(page)), `${page}: links to a server page`);
}
check(!exists('addons/server') && !exists('docs/server'), 'no page for the deferred server add-on (addons/server/, docs/server/)');

if (failures.length) {
  console.log(`platforms: ${failures.length} of ${checks} checks FAILED`);
  for (const f of failures.slice(0, 60)) console.log(`  FAIL ${f}`);
  process.exit(1);
}
const state = products.map((p) => `${p} ${versionOf(p)} (${downloads(data, p).map((d) => `${d.name} ${d.status}`).join(', ')})`).join('; ');
console.log(`platforms: ${checks} checks passed (${state}; ${pages.length} pages, ${links} links)`);
