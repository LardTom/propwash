#!/usr/bin/env node
// Checks the roadmap page data (assets/data/roadmap.json) with the same validation the page uses
// (assets/js/roadmap/data.js):
//   - schema, horizons in order, unique item ids and versions, statuses that fit their horizon (released = done,
//     ideas = idea), both languages for every text, short texts, no dates, links https:// or relative
//   - every icon exists in the sprite of roadmap/index.html
//   - the validator itself rejects broken copies (wrong status, a date, a missing translation, …)
//   - the page is linked from the main navigation of every page and loads its script, styles and data
//
//   node tools/test-roadmap.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRoadmap, ROADMAP_URL, tally, allItems, currentRelease } from '../assets/js/roadmap/data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let checks = 0;
const failures = [];
function check(ok, message) {
  checks++;
  if (!ok) failures.push(message);
}

const page = read('roadmap/index.html');
const icons = new Set([...page.matchAll(/<symbol id="ri-([a-z0-9-]+)"/g)].map((m) => m[1]));
const data = JSON.parse(read('assets/data/roadmap.json'));

// 1. The real data
const problems = validateRoadmap(data, { icons });
check(problems.length === 0, `roadmap.json:\n    ${problems.join('\n    ')}`);
check(fileURLToPath(ROADMAP_URL) === path.join(ROOT, 'assets/data/roadmap.json'), `ROADMAP_URL points to ${ROADMAP_URL}`);
const count = tally(allItems(data));
check(count.total > 0, 'roadmap has items');
if (data.horizons.some((h) => h.id === 'now' && h.groups.length)) {
  check(currentRelease(data) !== null, 'the "now" horizon has a release with a version for the page header');
}

// 2. The validator catches mistakes
const broken = [
  ['released item not done', (d) => { d.horizons[0].groups[0].items[0].status = 'progress'; }, 'released items are done'],
  ['date in a text', (d) => { d.horizons[0].groups[0].items[0].text.en = 'Coming in October 2026.'; }, 'looks like a date'],
  ['missing German text', (d) => { delete d.horizons[0].groups[0].items[0].title.de; }, 'missing text'],
  ['unknown icon', (d) => { d.horizons[0].groups[0].items[0].icon = 'no-such-icon'; }, 'unknown icon'],
  ['duplicate id', (d) => { d.horizons[0].groups[0].items[1].id = d.horizons[0].groups[0].items[0].id; }, 'appears twice'],
  ['unknown status', (d) => { d.horizons[0].groups[0].items[0].status = 'soon'; }, 'must be one of'],
  ['idea outside ideas', (d) => { const h = d.horizons.find((x) => x.id !== 'released' && x.id !== 'ideas'); h.groups[0].items[0].status = 'idea'; }, 'ideas belong under the ideas horizon'],
  ['horizons out of order', (d) => { d.horizons.reverse(); }, 'in the order'],
  ['bad version', (d) => { d.horizons[0].groups[0].version = 'v0.4'; }, 'must look like 1.2.3'],
  ['javascript link', (d) => { d.horizons[0].groups[0].items[0].link = { href: 'javascript:alert(1)', label: { en: 'x', de: 'x' } }; }, 'https:// address'],
  ['HTML in a text', (d) => { d.horizons[0].groups[0].items[0].title.en = '<b>Bold</b>'; }, 'no HTML']
];
for (const [what, mutate, expected] of broken) {
  const copy = structuredClone(data);
  mutate(copy);
  const errs = validateRoadmap(copy, { icons });
  check(errs.some((e) => e.includes(expected)), `validator misses: ${what} (got ${errs.length ? errs.join(' | ') : 'no error'})`);
}

// 3. The page and its links
check(page.includes('src="../assets/js/roadmap/view.js"'), 'roadmap/index.html loads assets/js/roadmap/view.js');
check(page.includes('href="../assets/css/roadmap.css"'), 'roadmap/index.html loads assets/css/roadmap.css');
check(page.includes('href="../assets/data/roadmap.json"'), 'roadmap/index.html preloads assets/data/roadmap.json');
check(/data-rm-root/.test(page) && /data-rm-current/.test(page) && /data-rm-tally/.test(page) && /data-rm-jump/.test(page), 'roadmap/index.html has the render targets');
for (const [file, href] of [['index.html', 'roadmap/'], ['configurator/index.html', '../roadmap/'], ['roadmap/index.html', './'], ['changelog/index.html', '../roadmap/']]) {
  const nav = /<nav class="site-nav"[\s\S]*?<\/nav>/.exec(read(file))?.[0] || '';
  check(nav.includes(`href="${href}"`), `${file}: main navigation links to the roadmap (${href})`);
}
// Only the hosts the site already links to; scripts, styles, fonts and data come from the site itself.
const HOSTS = new Set(['propwashfpv.com', 'discord.gg', 'www.curseforge.com', 'modrinth.com', 'github.com', 'www.w3.org']);
for (const file of ['assets/js/roadmap/view.js', 'assets/js/roadmap/data.js', 'assets/css/roadmap.css', 'roadmap/index.html', 'assets/data/roadmap.json']) {
  const foreign = [...read(file).matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase()).filter((h) => !HOSTS.has(h));
  check(foreign.length === 0, `${file}: other hosts ${[...new Set(foreign)].join(', ')}`);
}
check(!/<script[^>]+src="https?:|<link[^>]+href="https?:[^"]*"[^>]*rel="stylesheet"|rel="stylesheet"[^>]+href="https?:/.test(page), 'roadmap/index.html: no external scripts or styles');

if (failures.length) {
  console.log(`roadmap: ${failures.length} of ${checks} checks FAILED`);
  for (const f of failures) console.log(`  FAIL ${f}`);
  process.exit(1);
}
console.log(`roadmap: ${checks} checks passed (${count.total} items: ${count.done} done, ${count.progress} in progress, ${count.planned} planned, ${count.idea} ideas)`);
