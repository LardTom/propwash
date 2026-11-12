#!/usr/bin/env node
// The switch for the release day (findings SITE-SIM-1 and SITE-SIM-2): one command per platform.
//   - in a copy of this site: `node tools/go-live.mjs curseforge` sets every product live on CurseForge and rewrites
//     the pages (hero button, download buttons, status lines, FAQ answer, add-on cards and pages); Modrinth stays in
//     review; build-platforms and build-addons have nothing left to do
//   - `node tools/go-live.mjs modrinth justmoreparts` switches only that product (Modrinth releases projects one by one)
//   - --check writes nothing and says what would change; a second run changes nothing; an unknown platform or
//     product is refused without writing
//   - this checkout itself stays in review until the release day (the owner switches); tools/test-links.mjs takes the
//     platform pages that are not live yet as pending (the Modrinth pages of Propwash and of the three add-ons)
//
//   node tools/test-go-live.mjs

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { outOfDate as platformsOutOfDate } from './build-platforms.mjs';
import { outOfDate as addonsOutOfDate } from './build-addons.mjs';
import { pendingAddresses } from './pending-addresses.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0;
const failures = [];
function check(ok, message) {
  checks++;
  if (!ok) failures.push(message);
  return !!ok;
}
const json = (root) => JSON.parse(fs.readFileSync(path.join(root, 'assets/data/platforms.json'), 'utf8'));
const statuses = (data) => Object.fromEntries(Object.entries(data.products).map(([k, p]) => [k, `${p.curseforge.status}/${p.modrinth.status}`]));
const run = (root, ...args) => spawnSync(process.execPath, [path.join(ROOT, 'tools/go-live.mjs'), ...args, '--root', root], { encoding: 'utf8' });

// 0. This checkout: still in review, the not yet live platform pages are pending for the link check.
const here = json(ROOT);
check(Object.values(here.products).every((p) => p.curseforge.status !== 'live' && p.modrinth.status !== 'live'),
  `this checkout stays in review until the release day (${JSON.stringify(statuses(here))})`);
const pending = pendingAddresses(here);
for (const [key, p] of Object.entries(here.products)) {
  check(pending.includes(p.modrinth.url), `test-links PENDING has the Modrinth page of ${key} (${p.modrinth.url})`);
}

// 1. A copy of the site.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-go-live-'));
try {
  fs.cpSync(ROOT, tmp, { recursive: true, filter: (src) => !/[/\\](\.git|node_modules|\.claude)$/.test(src) });
  const before = fs.readFileSync(path.join(tmp, 'index.html'), 'utf8');

  const dry = run(tmp, 'curseforge', '--check');
  check(dry.status === 0 && /would switch/.test(dry.stdout), `--check says what would change (${dry.stdout.trim().split('\n')[0]})`);
  check(fs.readFileSync(path.join(tmp, 'index.html'), 'utf8') === before && json(tmp).products.propwash.curseforge.status === 'review', '--check writes nothing');

  const bad = run(tmp, 'github');
  check(bad.status !== 0 && /curseforge or modrinth/.test(bad.stderr), `an unknown platform is refused (${bad.stderr.trim()})`);
  const badProduct = run(tmp, 'modrinth', 'server');
  check(badProduct.status !== 0 && /unknown product/.test(badProduct.stderr) && json(tmp).products.propwash.modrinth.status === 'review', `an unknown product is refused without writing (${badProduct.stderr.trim()})`);

  const cf = run(tmp, 'curseforge');
  check(cf.status === 0, `go-live curseforge runs (${cf.stderr.trim()})`);
  const afterCf = json(tmp);
  check(Object.values(afterCf.products).every((p) => p.curseforge.status === 'live' && p.modrinth.status === 'review'), `CurseForge live for every product, Modrinth still in review (${JSON.stringify(statuses(afterCf))})`);
  const home = fs.readFileSync(path.join(tmp, 'index.html'), 'utf8');
  check(/<a class="btn btn--primary" href="https:\/\/www\.curseforge\.com\/minecraft\/mc-mods\/propwash-fpv"[^>]*>[\s\S]*?Download on CurseForge/.test(home), 'the hero downloads from CurseForge');
  check(home.includes('CurseForge: out now · Modrinth: in review'), 'the status line: CurseForge out now, Modrinth in review');
  const cam = fs.readFileSync(path.join(tmp, 'addons/camera-drones/index.html'), 'utf8');
  check(/href="https:\/\/www\.curseforge\.com\/minecraft\/mc-mods\/propwash-camera-drones"[^>]*>(?!<span class="soon-dot")/.test(cam), 'the page of Camera Drones downloads from CurseForge without “in review”');
  check(!platformsOutOfDate(tmp).length && !addonsOutOfDate(tmp).length, 'build-platforms and build-addons have nothing left to do');
  check(!pendingAddresses(afterCf).includes(afterCf.products.propwash.curseforge.url) && pendingAddresses(afterCf).includes(afterCf.products.propwash.modrinth.url), 'test-links: live pages are no longer pending, the others are');

  const again = run(tmp, 'curseforge');
  check(again.status === 0 && /nothing to switch/.test(again.stdout), `a second run changes nothing (${again.stdout.trim().split('\n')[0]})`);

  const mr = run(tmp, 'modrinth', 'justmoreparts');
  const afterMr = json(tmp);
  check(mr.status === 0 && afterMr.products.justmoreparts.modrinth.status === 'live'
    && ['propwash', 'camdrones', 'mobdefense'].every((k) => afterMr.products[k].modrinth.status === 'review'), `modrinth justmoreparts switches only that product (${JSON.stringify(statuses(afterMr))})`);
  check(!platformsOutOfDate(tmp).length && !addonsOutOfDate(tmp).length, 'after Modrinth for one product the pages are up to date');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) {
  for (const f of failures) console.log(`  FAIL ${f}`);
  console.log(`go-live: ${failures.length} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`go-live: ${checks} checks passed (one command per platform, in a copy of the site)`);
