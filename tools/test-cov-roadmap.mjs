#!/usr/bin/env node
// Coverage of the roadmap (check plan 0.6.0, 5.6 no. 41 and 42). The stand comes from assets/data/platforms.json: a
// live platform of Propwash means the release stand, otherwise the pre-release stand.
//   - every stand: each item id is in the snapshot the owner approved (tools/fixtures/cov/roadmap-approved.json),
//     a new id fails until it is added there; the roadmap validator of the page has nothing to say
//   - pre-release stand (no. 41, on the branch site/0.6.0-roadmap-start, read with git): no spoiler of 0.6.0 outside
//     the released horizon (freecam, RX block, velocity vector, camera angle in the K menu, gate tutorial, slime and
//     wool, in English and German, also as item ids), and “In the next release” holds exactly share codes, the
//     add-on API and the next version of Just More Parts
//   - release stand (no. 42): 0.6.0 is the first group of the released horizon, all done, with highlights and the link
//     ../changelog/#propwash-0.6.0 (an anchor of changelog.json); after it, in this order, the official add-ons and the
//     backport to Minecraft 1.21.1; no server add-on (owner decision of 19.10., test-platforms keeps it off the site)
//   - before the release the release checks run on the stand the README's “Releasing” steps make of the current file
//     (a dry run) and on broken copies of it, so the checks are known to work when the release comes
//
//   node tools/test-cov-roadmap.mjs [--stand pre|release] [--pre-ref <git ref>] [--file <roadmap.json>]
//
// --pre-ref: the pre-release stand (default site/0.6.0-roadmap-start, skipped with a note when the ref is missing);
// --file: check another roadmap.json as the current stand. Checks of a known fault are locked (they print their
// state); COV_UNLOCK=<id>,… or all makes them count.

import fs from 'node:fs';
import { validateRoadmap } from '../assets/js/roadmap/data.js';
import { counter, arg, read, readJson, ROOT } from './fixtures/cov/browser.mjs';
import { gitShow, gitHasRef } from './fixtures/cov/site-b.mjs';

const { check, lock, note, finish } = counter('cov roadmap');
const platforms = readJson('assets/data/platforms.json');
const changelog = readJson('assets/data/changelog.json');
const approved = readJson('tools/fixtures/cov/roadmap-approved.json');
const icons = new Set([...read('roadmap/index.html').matchAll(/<symbol id="ri-([a-z0-9-]+)"/g)].map((m) => m[1]));
const products = new Set(Object.keys(platforms.products));
const VERSION = platforms.products.propwash.version;
const live = ['curseforge', 'modrinth'].some((k) => platforms.products.propwash[k].status === 'live');
const STAND = arg('--stand') || (live ? 'release' : 'pre');
const PRE_REF = arg('--pre-ref') || 'site/0.6.0-roadmap-start';
const FILE = arg('--file');
const current = FILE ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : readJson('assets/data/roadmap.json');

const SPOILERS = [
  { what: 'freecam', en: /free-?cam/i, de: /free-?cam/i, id: /freecam/ },
  { what: 'RX block', en: /\bRX[ -]block/i, de: /\bRX-Block/i, id: /rx-block/ },
  { what: 'velocity vector', en: /velocity vector|flight path marker/i, de: /Geschwindigkeitsvektor|Flugbahn-Marker/i, id: /flight-path-marker|velocity/ },
  { what: 'camera angle in the K menu', en: /camera angle/i, de: /Kamerawinkel/i, id: /camera-angle-menu/ },
  { what: 'gate tutorial', en: /gate tutorial/i, de: /Gate-Tutorial/i, id: /gate-tutorial/ },
  { what: 'slime and wool', en: /\bslime\b|\bwool\b/i, de: /Schleim|Wolle/i, id: /slime|wool/ },
];

const items = (roadmap, pick = () => true) => roadmap.horizons.filter(pick).flatMap((h) => h.groups.flatMap((g) => g.items.map((i) => ({ ...i, horizon: h.id, group: g }))));
const texts = (x) => [x.title, x.text, x.link && x.link.label].filter(Boolean);

function approvedIds(roadmap, label, lockId = null) {
  const known = new Set(approved.ids);
  const fresh = items(roadmap).map((i) => i.id).filter((id) => !known.has(id));
  const message = `no. 42 ${label}: every item id approved by the owner (tools/fixtures/cov/roadmap-approved.json) – new: ${fresh.join(', ')}`;
  if (lockId) lock(lockId, !fresh.length, message);
  else check(!fresh.length, message);
  const problems = validateRoadmap(roadmap, { icons, products });
  check(!problems.length, `no. 41/42 ${label}: the roadmap validator has nothing to say (${problems.slice(0, 3).join(' | ')})`);
  return fresh;
}

function spoilers(roadmap) {
  const found = [];
  const later = items(roadmap, (h) => h.id !== 'released');
  for (const s of SPOILERS) {
    for (const i of later) {
      if (s.id.test(i.id)) found.push(`${s.what}: id ${i.id}`);
      for (const t of texts(i)) {
        if (s.en.test(t.en || '')) found.push(`${s.what}: “${t.en}”`);
        if (s.de.test(t.de || '')) found.push(`${s.what}: „${t.de}“`);
      }
    }
    for (const h of roadmap.horizons.filter((x) => x.id !== 'released')) {
      for (const t of [h.title, h.intro, h.label, ...h.groups.map((g) => g.title)].filter(Boolean)) {
        if (s.en.test(t.en || '') || s.de.test(t.de || '')) found.push(`${s.what}: heading or intro of ${h.id}`);
      }
    }
  }
  return [...new Set(found)];
}

function preRelease(roadmap, label) {
  const found = spoilers(roadmap);
  check(!found.length, `no. 41 ${label}: no spoiler of ${VERSION} outside the released horizon (${found.slice(0, 4).join('; ')})`);
  const now = roadmap.horizons.find((h) => h.id === 'now');
  check(!!now, `no. 41 ${label}: horizon “In the next release” there`);
  if (!now) return;
  check(now.title.en === 'In the next release' && now.title.de === 'Im nächsten Update', `no. 41 ${label}: “${now.title.en}” / „${now.title.de}“`);
  const group = now.groups.find((g) => g.version === VERSION);
  check(!!group, `no. 41 ${label}: ${VERSION} stands under “In the next release”`);
  const ids = items(roadmap, (h) => h.id === 'now').map((i) => i.id);
  const want = approved.pre_release_now;
  check(ids.length === want.length && want.every((id) => ids.includes(id)), `no. 41 ${label}: “In the next release” holds exactly ${want.join(', ')} (${ids.join(', ')})`);
  const nowItems = items(roadmap, (h) => h.id === 'now');
  const has = (re) => nowItems.some((i) => re.test(i.title.en) || re.test(i.title.de));
  check(has(/share codes/i) && has(/Sharecodes/), `no. 41 ${label}: share codes / Sharecodes`);
  check(has(/add-on API/i) && has(/Add-on-API/), `no. 41 ${label}: add-on API / Add-on-API`);
  check(has(/Just More Parts/), `no. 41 ${label}: the next version of Just More Parts`);
  const jmp = nowItems.find((i) => /Just More Parts/.test(i.title.en));
  check(!!jmp && jmp.group.version !== VERSION, `no. 41 ${label}: Just More Parts stands as the add-on, not as a part of ${VERSION}`);
  const server = items(roadmap).filter((i) => /propwash-server|server-addon/.test(i.id) || texts(i).some((t) => /Propwash: Server|server add-on|Server-Add-on/i.test(`${t.en} ${t.de}`)));
  lock(label === PRE_REF ? 'cov-site-b-3' : 'cov-site-b-3-file', !server.length, `no. 41 ${label}: no server add-on, not even without a date (owner decision 19.10., main aaf7501) – found ${server.map((i) => i.id).join(', ')}`);
}

function releaseProblems(roadmap) {
  const problems = [];
  const fail = (ok, message) => { if (!ok) problems.push(message); return ok; };
  const rel = roadmap.horizons.find((h) => h.id === 'released');
  const first = rel && rel.groups[0];
  fail(!!first && first.version === VERSION, `${VERSION} is the first group of the released horizon (${first && first.version})`);
  if (first) {
    fail(first.items.length >= 2 && first.items.every((i) => i.status === 'done'), `${VERSION} has its highlights, all done (${first.items.length})`);
    fail(first.link && first.link.href === `../changelog/#propwash-${VERSION}`, `${VERSION} links the changelog ../changelog/#propwash-${VERSION} (${first.link && first.link.href})`);
    fail(first.link && first.link.label && first.link.label.en && first.link.label.de, `${VERSION}: the changelog link has a label in English and German`);
    fail(changelog.products.some((p) => p.releases.some((r) => r.id === `propwash-${VERSION}`)), `the anchor propwash-${VERSION} is in changelog.json`);
  }
  const after = items(roadmap, (h) => h.id !== 'released').map((i) => i.id);
  const order = approved.order_after_release.map((id) => after.indexOf(id));
  fail(order.every((x) => x >= 0) && order.every((x, i) => i === 0 || x > order[i - 1]), `after ${VERSION} in this order: ${approved.order_after_release.join(', ')} (positions ${order.join(', ')})`);
  const server = items(roadmap).filter((i) => /propwash-server|server-addon/.test(i.id) || texts(i).some((t) => /Propwash: Server|server add-on|Server-Add-on/i.test(`${t.en} ${t.de}`)));
  fail(!server.length, `no server add-on on the roadmap (${server.map((i) => i.id)})`);
  return problems;
}

function release(roadmap, label) {
  const problems = releaseProblems(roadmap);
  for (const p of problems) check(false, `no. 42 ${label}: ${p}`);
  return problems;
}

function releaseOf(roadmap) {
  const r = structuredClone(roadmap);
  const now = r.horizons.find((h) => h.id === 'now');
  const rel = r.horizons.find((h) => h.id === 'released');
  const at = now.groups.findIndex((g) => g.version === VERSION);
  const [group] = now.groups.splice(at, 1);
  for (const i of group.items) i.status = 'done';
  group.link = { href: `../changelog/#propwash-${VERSION}`, label: { en: 'Full changelog', de: 'Alle Änderungen' } };
  rel.groups.unshift(group);
  if (!now.groups.length) r.horizons.splice(r.horizons.indexOf(now), 1);
  return r;
}

function dryRun() {
  const stand = releaseOf(current);
  const clean = release(stand, 'dry run (release stand made from the current file)');
  check(!clean.length, `no. 42 dry run: the release checks pass on the stand the README's releasing steps give`);
  const broken = [
    ['an id the owner has not approved', (d) => { d.horizons.find((h) => h.id === 'ideas').groups[0].items.push({ id: 'cov-new-idea', icon: 'prop', status: 'idea', title: { en: 'New idea', de: 'Neue Idee' }, text: { en: 'Something new.', de: 'Etwas Neues.' } }); }, 'ids'],
    ['add-ons in the wrong order', (d) => { const g = d.horizons.find((h) => h.id === 'later').groups[0]; g.items.reverse(); }, 'in this order'],
    ['no changelog link', (d) => { delete d.horizons[0].groups[0].link; }, 'links the changelog'],
    ['a server add-on', (d) => { d.horizons.find((h) => h.id === 'later').groups.push({ title: { en: 'Servers', de: 'Server' }, items: [{ id: 'propwash-server', icon: 'prop', status: 'planned', title: { en: 'Propwash: Server', de: 'Propwash: Server' }, text: { en: 'A server add-on.', de: 'Ein Server-Add-on.' } }] }); }, 'no server add-on'],
  ];
  for (const [what, mutate, kind] of broken) {
    const copy = structuredClone(stand);
    mutate(copy);
    if (kind === 'ids') {
      const known = new Set(approved.ids);
      check(items(copy).some((i) => !known.has(i.id)), `no. 42 dry run: the snapshot check catches ${what}`);
      continue;
    }
    const problems = releaseProblems(copy);
    check(problems.some((p) => p.includes(kind)), `no. 42 dry run: the release checks catch ${what} (${problems.join(' | ') || 'nothing'})`);
  }
  const preSpoilers = spoilers(current);
  check(spoilers(releaseOf(current)).length < preSpoilers.length || !preSpoilers.length, 'no. 41 dry run: the spoiler check sees the items of 0.6.0 outside the released horizon');
}

function main() {
  note(`stand: ${STAND} (Propwash ${VERSION}: CurseForge ${platforms.products.propwash.curseforge.status}, Modrinth ${platforms.products.propwash.modrinth.status})`);
  approvedIds(current, FILE ? FILE : 'roadmap.json');
  let preLabel = null;
  if (STAND === 'pre') {
    if (gitHasRef(ROOT, PRE_REF)) {
      const text = gitShow(ROOT, PRE_REF, 'assets/data/roadmap.json');
      const pre = JSON.parse(text);
      preLabel = `${PRE_REF}`;
      approvedIds(pre, PRE_REF, 'cov-site-b-3');
      preRelease(pre, PRE_REF);
    } else {
      note(`no ref ${PRE_REF}: no. 41 checks only the current file`);
    }
    const found = spoilers(current);
    if (found.length) note(`no. 41: the current roadmap.json (the live stand of main) names ${found.length} things of ${VERSION} before the release (${found.slice(0, 3).join('; ')} …) – the owner keeps that stand live; the stand without spoilers is ${PRE_REF}`);
    else preRelease(current, 'roadmap.json');
    dryRun();
  } else {
    release(current, 'roadmap.json');
  }
  finish(`${STAND} stand${preLabel ? `, no. 41 on ${preLabel}` : ''}${STAND === 'pre' ? ', release checks as a dry run' : ''}; ${approved.ids.length} approved ids`);
}

main();
