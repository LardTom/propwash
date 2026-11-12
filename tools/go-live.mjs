#!/usr/bin/env node
// Release day: one command per platform. Sets the download status of assets/data/platforms.json to “live” and rewrites
// every page that shows it (hero button, download buttons, status lines, the FAQ answer, the add-on cards and pages).
// CurseForge goes live with the release; Modrinth releases the projects one by one after its review, so a product can
// be named on its own.
//
//   node tools/go-live.mjs curseforge                     # every product live on CurseForge
//   node tools/go-live.mjs modrinth                       # every product live on Modrinth
//   node tools/go-live.mjs modrinth justmoreparts …       # only these products (keys of platforms.json)
//   node tools/go-live.mjs modrinth --check               # say what would change, write nothing
//
// --root <dir> works on another copy of the site (tools/test-go-live.mjs). Afterwards: node tools/test-platforms.mjs,
// node tools/test-addons.mjs and node tools/test-links.mjs (the pages that went live are no longer “after publishing”;
// with the network: --online). Once Propwash is live on a platform, tools/test-cov-roadmap.mjs checks the release stand.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { outOfDate as platformsOutOfDate, DATA } from './build-platforms.mjs';
import { outOfDate as addonsOutOfDate } from './build-addons.mjs';
import { validatePlatforms } from '../assets/js/roadmap/platforms.js';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLATFORMS = ['curseforge', 'modrinth'];
const NAMES = { curseforge: 'CurseForge', modrinth: 'Modrinth' };

function main() {
  const argv = process.argv.slice(2);
  const at = argv.indexOf('--root');
  const root = at >= 0 ? path.resolve(argv[at + 1]) : HERE;
  const words = argv.filter((a, i) => !a.startsWith('--') && !(at >= 0 && i === at + 1));
  const check = argv.includes('--check');
  const [platform, ...wanted] = words;
  if (!PLATFORMS.includes(platform)) throw new Error('the platform is curseforge or modrinth (usage: node tools/go-live.mjs curseforge|modrinth [product …] [--check])');
  const file = path.join(root, DATA);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const unknown = wanted.filter((p) => !data.products[p]);
  if (unknown.length) throw new Error(`unknown product ${unknown.join(', ')} (platforms.json has ${Object.keys(data.products).join(', ')})`);
  const products = wanted.length ? wanted : Object.keys(data.products);
  const switched = products.filter((p) => data.products[p][platform] && data.products[p][platform].status !== 'live');
  if (!switched.length) {
    console.log(`${NAMES[platform]}: nothing to switch, ${products.join(', ')} already live`);
    return;
  }
  const from = switched.map((p) => `${p} (${data.products[p][platform].status})`).join(', ');
  if (check) {
    console.log(`${NAMES[platform]}: would switch ${from} to live and rewrite the pages that show it`);
    return;
  }
  for (const p of switched) data.products[p][platform].status = 'live';
  const problems = validatePlatforms(data);
  if (problems.length) throw new Error(`platforms.json would be invalid:\n  ${problems.join('\n  ')}`);
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  const written = [];
  for (const s of platformsOutOfDate(root)) {
    fs.writeFileSync(path.join(root, s.page), s.wanted);
    written.push(s.page);
  }
  for (const s of addonsOutOfDate(root)) {
    fs.writeFileSync(path.join(root, s.file), s.wanted);
    if (!written.includes(s.file)) written.push(s.file);
  }
  console.log(`${NAMES[platform]}: switched ${from} to live`);
  console.log(`  pages rewritten: ${written.join(', ') || 'none'}`);
  const left = Object.entries(data.products).flatMap(([k, p]) => PLATFORMS.filter((x) => p[x] && p[x].status !== 'live').map((x) => `${k} on ${NAMES[x]}`));
  console.log(`  not live yet: ${left.join(', ') || 'nothing, every product is live everywhere'}`);
  console.log('  next: node tools/test-platforms.mjs && node tools/test-addons.mjs && node tools/test-links.mjs');
}

try {
  main();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
