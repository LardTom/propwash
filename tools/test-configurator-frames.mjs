#!/usr/bin/env node
// Accessories that fit only some frames, as in the game since Propwash 0.6.0 (AccessoryDefinition#frames(), the key
// "frames" in propwash_parts/accessory/*.json, the build problem accessory_frame; finding APIFRAMESSITE-1):
//   - the parts reader (partjson.js) reads "frames" like PartJson: a list or a single id, each a valid id (errors name
//     frames[i]), sorted like Identifier.compareTo (path first, then namespace) without repeats, not an unknown field
//     any more; the export of an add-on jar carries data.frames only for an accessory that has frames, like the web
//     export of the game
//   - rules.js reports accessory_frame right after accessory_mount when an accessory has frames and the frame is not
//     one of them (without frames every frame fits); a PW3 code keeps such an accessory and reports the problem
//   - the catalog has the rule with the game's text in English and German, all rules in the order of RuleCheck.RULES
//     (with --propwash-repo: kinds, formulas and texts read from that checkout), and the dictionaries of the five other
//     languages translate the text
//   - the camera add-on of the sibling checkouts (if its checkout and jar are there): its gimbals, limited to the
//     add-on's own frames where its part files do not say otherwise, fit each of those frames and no other frame
//   - headless Chrome, English and German at 1280 and 390 px with a made-up add-on jar: such an accessory is not offered
//     on another frame and is offered on its frames; in the frame picker the other frames show the problem with the
//     game's text; a build with it on another frame lists the problem and keeps it in the accessory picker to take it
//     off; /es/, /fr/, /pt-br/, /pl/ and /ru/ (built from the dictionaries) show the problem in their language; the
//     camera add-on's jar (if there) the same in English and German
//
//   node tools/test-configurator-frames.mjs [--propwash-repo <dir>] [--addon-repos <dir>,…] [--no-browser] [--shots <dir>] [--chrome <path>]
//
// --propwash-repo (or PROPWASH_REPO) is a Propwash checkout of 0.6.0 with F-APIFRAMES-1; --addon-repos (or
// PROPWASH_ADDON_REPOS, default: the propwash-* folders next to this repository's main checkout) names the add-on
// checkouts. Nothing of the add-ons is written into this repository.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { readAddon } from '../assets/js/configurator/addon-catalog.js';
import { openJar, JAR_LIMITS } from '../assets/js/configurator/jar.js';
import { decodePart } from '../assets/js/configurator/partjson.js';
import { composeCatalog, createCatalog } from '../assets/js/configurator/data.js';
import { PROBLEM_ORDER, WARNING_ORDER } from '../assets/js/configurator/rules.js';
import { normalize, EXTRA } from '../assets/js/i18n.js';
import { loadDict, LANGUAGES } from './i18n/languages.mjs';
import { extract } from './i18n/extract.mjs';
import { startBrowser, counter, arg, flag, readJson, sleep, ROOT, CFG_READY } from './fixtures/cov/browser.mjs';
import { unlistedAddons, buildPreview, serveDirs } from './fixtures/cov/site-b.mjs';

const { check, note, finish } = counter('configurator frames');
const base = readJson('assets/data/configurator/catalog.json');
const registry = readJson('assets/data/addons/registry.json');
const SHOTS = arg('--shots');
const PW_REPO = arg('--propwash-repo', 'PROPWASH_REPO');

const RULE = 'accessory_frame';
const TEXT = { en_us: 'Accessory only fits other frames', de_de: 'Zubehör passt nur an andere Rahmen' };
const FORMULA = 'ein Zubehör hat frames und frame.id ∉ accessory.frames (ohne frames passt jeder Rahmen)';
const pathFirst = (a, b) => {
  const [na, pa] = [a.slice(0, a.indexOf(':')), a.slice(a.indexOf(':') + 1)];
  const [nb, pb] = [b.slice(0, b.indexOf(':')), b.slice(b.indexOf(':') + 1)];
  return pa < pb ? -1 : pa > pb ? 1 : na < nb ? -1 : na > nb ? 1 : 0;
};
const sortedIds = (ids) => [...new Set(ids)].sort(pathFirst);

// ---------------------------------------------------------------------------------------------------------------
// A made-up add-on: a frame of its own, a front gimbal for that frame and two built-in ones, a top mount only for its
// own frame and an LED ring without frames.

const NS = 'testaddon';
const GIMBAL = `${NS}:frame_gimbal`;
const TOP = `${NS}:top_holder`;
const RING = `${NS}:ring`;
const OWN_FRAME = `${NS}:box_frame`;
const GIMBAL_FRAMES = ['propwash:long_range_7', OWN_FRAME, 'propwash:cinewhoop_3', 'propwash:long_range_7'];
const GIMBAL_SORTED = [OWN_FRAME, 'propwash:cinewhoop_3', 'propwash:long_range_7'];
const FOREIGN_FRONT = ['propwash:freestyle_5', 'propwash:race_5'];
const FRAME_JSON = {
  mass_g: 3.4, wheelbase_mm: 65, max_prop_mm: 31, motor_mounts: ['propwash:m08'], stack_mounts: ['propwash:whoop_aio'],
  accessory_mounts: ['top', 'bottom', 'front'], aero: { frontal_area_m2: 0.003, drag_coefficient: 1.1 }, battery_fit: { cells: [1, 1], max_mass_g: 10 },
  visual: { accent: '#22aa44' },
};
const GIMBAL_JSON = { mass_g: 55.0, slot: 'front', size_mm: [40.0, 30.0, 36.0], flight_battery_w: 0.0, frontal_area_m2: 0.0012, frames: GIMBAL_FRAMES };
const TOP_JSON = { mass_g: 12.0, slot: 'top', size_mm: [20.0, 10.0, 20.0], frames: OWN_FRAME };
const RING_JSON = { mass_g: 2.0, slot: 'bottom', size_mm: [30, 3, 30], leds: 12 };
const NAMES = {
  en_us: { [`part.${NS}.box_frame`]: 'Box Frame', [`part.${NS}.frame_gimbal`]: 'Frame Gimbal', [`part.${NS}.top_holder`]: 'Top Holder', [`part.${NS}.ring`]: 'LED Ring' },
  de_de: { [`part.${NS}.box_frame`]: 'Kastenrahmen', [`part.${NS}.frame_gimbal`]: 'Rahmen-Gimbal', [`part.${NS}.top_holder`]: 'Halter oben', [`part.${NS}.ring`]: 'LED-Ring' },
};
const entryOf = (kind, id, json) => ({ name: `data/${NS}/propwash_parts/${kind}/${id}.json`, data: JSON.stringify({ format: 1, ...json }) });

/** A ZIP file of entries {name, data}, deflated. */
function zip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const data = Buffer.from(e.data);
    const packed = zlib.deflateRawSync(data);
    const crc = zlib.crc32(data);
    const name = Buffer.from(e.name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, packed);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(8, 10);
    c.writeUInt32LE(crc >>> 0, 16);
    c.writeUInt32LE(packed.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += 30 + name.length + packed.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, end]));
}

function madeUpJar() {
  return zip([
    { name: 'fabric.mod.json', data: JSON.stringify({ schemaVersion: 1, id: NS, version: '0.4.0', name: 'Frames Test Add-on', depends: { propwash: '>=0.6.0-' } }) },
    entryOf('frame', 'box_frame', FRAME_JSON),
    entryOf('accessory', 'frame_gimbal', GIMBAL_JSON),
    entryOf('accessory', 'top_holder', TOP_JSON),
    entryOf('accessory', 'ring', RING_JSON),
    { name: `assets/${NS}/lang/en_us.json`, data: JSON.stringify(NAMES.en_us) },
    { name: `assets/${NS}/lang/de_de.json`, data: JSON.stringify(NAMES.de_de) },
  ]);
}

// ---------------------------------------------------------------------------------------------------------------
// 1. The parts reader

function reader() {
  const read = (json) => decodePart('accessory', `${NS}:x`, JSON.stringify({ format: 1, ...json }));
  const r = read(GIMBAL_JSON);
  check(r.definition && JSON.stringify(r.definition.frames) === JSON.stringify(GIMBAL_SORTED),
    `partjson: frames read, sorted path first like Identifier.compareTo, without repeats (${r.definition && JSON.stringify(r.definition.frames)})`);
  check(!r.warnings.some((w) => w.includes('frames')), `partjson: frames is not an unknown field (${r.warnings.join(' | ')})`);
  const single = read(TOP_JSON);
  check(single.definition && JSON.stringify(single.definition.frames) === JSON.stringify([OWN_FRAME]), `partjson: a single id as frames (${single.definition && JSON.stringify(single.definition.frames)})`);
  const plain = read(RING_JSON);
  check(plain.definition && Array.isArray(plain.definition.frames) && !plain.definition.frames.length, 'partjson: without frames the list is empty (every frame fits)');
  const empty = read({ ...RING_JSON, frames: [] });
  check(empty.definition && Array.isArray(empty.definition.frames) && !empty.definition.frames.length && !empty.errors.length, 'partjson: an empty frames list is no error, like optIdList');
  const short = read({ ...RING_JSON, frames: ['cinewhoop_3'] });
  check(short.definition && JSON.stringify(short.definition.frames) === '["propwash:cinewhoop_3"]', 'partjson: a frame id without namespace belongs to propwash');
  const bad = read({ ...RING_JSON, frames: ['propwash:cinewhoop_3', 'Not An Id'] });
  check(bad.definition === null && bad.errors.some((e) => e.includes('frames[1]') && e.includes('ungültige Id')), `partjson: an invalid id in frames is refused with its place (${bad.errors[0] || 'no error'})`);
  const number = read({ ...RING_JSON, frames: [3] });
  check(number.definition === null && number.errors.some((e) => e.includes('frames[0]') && e.includes('Id als Text erwartet')), `partjson: a number in frames is refused (${number.errors[0] || 'no error'})`);
}

// ---------------------------------------------------------------------------------------------------------------
// 2. Rules and the catalog

const withAccessory = (c, presetId, frame, slot, id) => {
  const build = { ...c.presetBuild(presetId), frame };
  build.accessories = { ...(build.accessories || {}), [slot]: id };
  return build;
};

function rules(c) {
  const at = PROBLEM_ORDER.indexOf(RULE);
  check(at >= 0 && at === PROBLEM_ORDER.indexOf('accessory_mount') + 1 && at === PROBLEM_ORDER.length - 1, `rules.js: ${RULE} right after accessory_mount, last of the problems (${PROBLEM_ORDER.join(', ')})`);
  const keys = base.rules.rules.map((r) => r.key);
  check(JSON.stringify(keys) === JSON.stringify([...PROBLEM_ORDER, ...WARNING_ORDER]), `catalog: the rules in the order of rules.js (${keys.join(', ')})`);
  check(base.rules.rules.every((r, i) => r.order === i && r.kind === (i < PROBLEM_ORDER.length ? 'problem' : 'warning')), 'catalog: order and kind of every rule');
  const rule = base.rules.rules.find((r) => r.key === RULE);
  check(rule && rule.kind === 'problem' && rule.formula === FORMULA, `catalog: ${RULE} is a problem with the formula of RuleCheck (${rule && rule.formula})`);
  check(rule && rule.text && rule.text.en_us === TEXT.en_us && rule.text.de_de === TEXT.de_de, `catalog: ${RULE} with the game's text (${rule && JSON.stringify(rule.text)})`);
  check(c.issueKind(RULE) === 'problem' && c.issueText(RULE, 'en') === TEXT.en_us && c.issueText(RULE, 'de') === TEXT.de_de, 'catalog: issueKind and issueText of the rule');

  for (const frame of c.partsIn('frame')) {
    const fits = GIMBAL_SORTED.includes(frame.id);
    const r = c.check(withAccessory(c, 'propwash:cinewhoop', frame.id, 'front', GIMBAL));
    check(r.problems.includes(RULE) === !fits, `rules: the gimbal on ${frame.id} ${fits ? 'fits' : 'is accessory_frame'} (${r.problems.join(', ')})`);
    const mounts = frame.data.accessory_mounts.includes('front');
    check(r.problems.includes('accessory_mount') === !mounts, `rules: accessory_mount on ${frame.id} only without a front mount`);
    if (!fits && !mounts) check(r.problems.indexOf('accessory_mount') + 1 === r.problems.indexOf(RULE), `rules: on ${frame.id} accessory_mount, then ${RULE} (${r.problems.join(', ')})`);
    const ring = c.check(withAccessory(c, 'propwash:cinewhoop', frame.id, 'bottom', RING));
    check(!ring.problems.includes(RULE), `rules: an accessory without frames fits ${frame.id}`);
  }
  const both = c.check({ ...withAccessory(c, 'propwash:cinewhoop', 'propwash:cinewhoop_3', 'front', GIMBAL), accessories: { front: GIMBAL, top: TOP } });
  check(JSON.stringify(both.problems.filter((p) => p === RULE)) === `["${RULE}"]`, 'rules: two accessories on a foreign frame give the problem once');
  const preset = c.check(c.presetBuild('propwash:cinewhoop'));
  check(!preset.problems.includes(RULE), 'rules: a preset without such accessories is not touched');

  const build = withAccessory(c, 'propwash:freestyle', 'propwash:freestyle_5', 'front', GIMBAL);
  const code = c.encode({ build, paint: null, tune: null, osd: null, name: null });
  const back = c.decode(code);
  check(back.ok && back.content.build.accessories.front === GIMBAL && c.check(back.content.build).problems.includes(RULE),
    `PW3: a code with the gimbal on another frame keeps it and reports ${RULE} (${code})`);
}

function sameAsGame() {
  if (!PW_REPO) {
    note('no --propwash-repo: kinds, formulas and texts of the rules checked against the values in this test only');
    return;
  }
  const java = fs.readFileSync(path.join(PW_REPO, 'common/src/main/java/de/lardtom/propwash/webexport/RuleCheck.java'), 'utf8');
  const list = java.slice(java.indexOf('RULES = List.of('), java.indexOf(');', java.indexOf('RULES = List.of(')) + 2);
  const game = [...list.matchAll(/new Rule\("([^"]+)",\s*"([^"]+)",\s*"((?:[^"\\]|\\.)*)"\)/g)].map((m) => ({ key: m[1], kind: m[2], formula: m[3] }));
  const site = base.rules.rules.map((r) => ({ key: r.key, kind: r.kind, formula: r.formula }));
  check(game.length > 0 && JSON.stringify(site) === JSON.stringify(game), `catalog: rules as RuleCheck.RULES of ${PW_REPO} (${game.map((r) => r.key).join(', ')})`);
  const lang = { en_us: {}, de_de: {} };
  const langRoot = path.join(PW_REPO, 'common/src/lang');
  for (const dir of fs.readdirSync(langRoot).sort()) {
    for (const l of Object.keys(lang)) {
      const file = path.join(langRoot, dir, `${l}.json`);
      if (fs.existsSync(file)) Object.assign(lang[l], JSON.parse(fs.readFileSync(file, 'utf8')));
    }
  }
  for (const r of base.rules.rules) {
    const key = `propwash.build.issue.${r.key}`;
    check(r.text.en_us === lang.en_us[key] && r.text.de_de === lang.de_de[key], `catalog: the text of ${r.key} is the game's (${JSON.stringify(r.text)} vs ${lang.en_us[key]} / ${lang.de_de[key]})`);
  }
}

function dictionaries() {
  const key = normalize(TEXT.en_us);
  const extracted = extract({ languages: LANGUAGES });
  const found = extracted.entries.get(key);
  check(found && found.sources.has('assets/data/configurator/catalog.json') && extracted.runtime.has(key), 'i18n: the text of the rule is a runtime text of catalog.json');
  for (const code of EXTRA) {
    const tr = loadDict(code).entries[key];
    check(typeof tr === 'string' && tr.trim() && tr !== TEXT.en_us, `i18n ${code}: the rule is translated (${tr})`);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 3. The camera add-on of the sibling checkouts

function cameraAddon() {
  const listed = new Set([registry.base.namespace, ...registry.addons.map((a) => a.namespace)]);
  const candidates = unlistedAddons(listed, arg('--addon-repos', 'PROPWASH_ADDON_REPOS')).filter((a) => a.jar && /^0\.6\./.test(a.propwash || ''));
  for (const addon of candidates) {
    const jar = openJar(new Uint8Array(fs.readFileSync(addon.jar)), { ...JAR_LIMITS, entryBytes: 2 ** 30, totalBytes: 2 ** 33, ratio: 1e9 });
    const names = jar.list();
    const partDir = (kind) => new RegExp(`^data/${addon.id}/propwash_parts/${kind}/([^/]+)\\.json$`);
    const frames = names.map((n) => partDir('frame').exec(n)).filter(Boolean).map((m) => `${addon.id}:${m[1]}`);
    const gimbals = names.filter((n) => partDir('accessory').test(n)).map((n) => ({ n, json: JSON.parse(new TextDecoder().decode(jar.read(n, { maxBytes: 2 ** 30 }))) }))
      .filter((g) => g.json.slot === 'front' && g.json.action_cam);
    if (!frames.length || !gimbals.length) continue;
    const limited = new Map();
    const entries = names.filter((n) => /^(fabric\.mod\.json|META-INF\/neoforge\.mods\.toml)$/.test(n) || n.startsWith(`data/${addon.id}/`) || n.startsWith(`assets/${addon.id}/`)).map((n) => {
      const g = gimbals.find((x) => x.n === n);
      if (!g) return { name: n, data: jar.read(n, { maxBytes: 2 ** 30 }) };
      const own = g.json.frames === undefined;
      const json = own ? { ...g.json, frames } : g.json;
      limited.set(`${addon.id}:${partDir('accessory').exec(n)[1]}`, sortedIds([].concat(json.frames).map((f) => (f.includes(':') ? f : `propwash:${f}`))));
      return { name: n, data: JSON.stringify(json) };
    });
    const label = `the camera add-on of ${path.basename(addon.repo)}`;
    note(`${label}: ${gimbals.length} gimbals, ${frames.length} frames of its own${gimbals.some((g) => g.json.frames !== undefined) ? ', frames from its part files' : ', frames set by this test'}`);
    const bytes = zip(entries);
    const a = readAddon(bytes, { base, fileName: path.basename(addon.jar) });
    if (!check(a.ok, `${label}: the jar with limited gimbals reads (${a.problems.map((p) => p.code)})`)) return null;
    for (const [id, want] of limited) {
      const exported = a.export[addon.id].parts.find((p) => p.id === id);
      check(exported && JSON.stringify(exported.data.frames) === JSON.stringify(want), `${label}: ${id} exported with data.frames ${JSON.stringify(want)} (${exported && JSON.stringify(exported.data.frames)})`);
    }
    const c = createCatalog(composeCatalog(base, { fragments: [a.fragment] }));
    const preset = c.presets.find((p) => p.id.startsWith(`${addon.id}:`)) || c.presets.find((p) => p.id === 'propwash:cinewhoop');
    let fits = 0;
    let refused = 0;
    for (const [id, want] of limited) {
      for (const frame of c.partsIn('frame')) {
        const r = c.check(withAccessory(c, preset.id, frame.id, 'front', id));
        const ok = want.includes(frame.id);
        check(r.problems.includes(RULE) === !ok, `${label}: ${id} on ${frame.id}: ${ok ? 'fits' : RULE} (${r.problems.join(', ')})`);
        if (ok) fits++;
        else refused++;
      }
    }
    note(`${label}: ${fits} fitting and ${refused} refused gimbal–frame pairs`);
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pw-frames-')), path.basename(addon.jar));
    fs.writeFileSync(file, bytes);
    const [gimbal, frameList] = [...limited][0];
    return { file, label, gimbal, frames: frameList, name: a.fragment.parts.find((p) => p.id === gimbal).name, catalog: c };
  }
  note('no camera add-on checkout with a jar next to this repository – its gimbals are not checked');
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// 4. Headless Chrome

async function loadJar(p, file) {
  await p.setFile('[data-addon-file]', file);
  await sleep(150);
  await p.waitFor("!document.querySelector('.addon-bar__message--busy') && document.querySelector('[data-addon-bar]').getAttribute('aria-busy') !== 'true'", `reading ${file}`, 60000);
  await sleep(400);
}

const options = (p, cat) => p.evaluate(`(async () => {
  document.querySelector('[data-slots] [data-cat="${cat}"]').click();
  await new Promise((r) => setTimeout(r, 150));
  const all = document.querySelector('[data-picker] [data-cls="all"]');
  if (all && all.getAttribute('aria-pressed') !== 'true') { all.click(); await new Promise((r) => setTimeout(r, 150)); }
  return [...document.querySelectorAll('[data-picker] [role=option]')].map((o) => ({ id: o.dataset.id, mount: o.dataset.mount,
    selected: o.getAttribute('aria-selected') === 'true', bad: o.classList.contains('is-bad'),
    issue: o.querySelector('.part__issue') ? o.querySelector('.part__issue').textContent + ' ' + (o.querySelector('.part__issue').title || '') : '' }));
})()`);

async function choose(p, cat, id) {
  await options(p, cat);
  const done = await p.evaluate(`(() => {
    const o = document.querySelector('[data-picker] [role=option][data-id="${id}"]');
    if (!o) return false;
    o.click();
    return true;
  })()`);
  await sleep(700);
  return done;
}

const checks = (p) => p.evaluate("[...document.querySelectorAll('[data-checks] li')].map((li) => ({ bad: li.classList.contains('is-bad'), text: li.textContent.trim() }))");
const slots = (p) => p.evaluate("[...document.querySelectorAll('[data-slots] .slot')].map((s) => ({ cat: s.dataset.cat, bad: s.classList.contains('is-bad'), text: s.querySelector('.slot__value').textContent.trim() }))");

/** The flow on one page: not offered on another frame, offered on its frame, the problem on another frame. */
async function flow(p, where, { gimbal, frames, name, text, other = null, foreign }) {
  let acc = await options(p, 'accessory');
  check(acc.length > 0 && !acc.some((o) => o.id === gimbal), `${where}: ${gimbal} is not offered on the frame of the preset`);
  if (other) check(acc.some((o) => o.id === other), `${where}: an accessory without frames (${other}) is offered`);
  check(await choose(p, 'frame', frames[frames.length - 1]), `${where}: ${frames[frames.length - 1]} picked`);
  acc = await options(p, 'accessory');
  const offered = acc.find((o) => o.id === gimbal);
  check(offered && offered.mount === 'front' && !offered.bad, `${where}: on ${frames[frames.length - 1]} the gimbal is offered under the front mount (${JSON.stringify(offered)})`);
  check(await choose(p, 'accessory', gimbal), `${where}: the gimbal picked`);
  let s = await slots(p);
  check(s.some((x) => x.cat === 'accessory' && x.text.includes(name) && !x.bad), `${where}: the accessory slot names it, no problem (${JSON.stringify(s.find((x) => x.cat === 'accessory'))})`);
  check(!(await checks(p)).some((x) => x.text === text), `${where}: no “${text}” on its frame`);
  const fr = await options(p, 'frame');
  for (const id of frames) {
    const o = fr.find((x) => x.id === id);
    check(o && !o.issue.includes(text), `${where}: frame ${id} is not marked with “${text}”`);
  }
  for (const id of foreign) {
    const o = fr.find((x) => x.id === id);
    check(o && o.bad && o.issue.includes(text), `${where}: frame ${id} is marked with “${text}” (${o && o.issue})`);
  }
  check(await choose(p, 'frame', foreign[0]), `${where}: ${foreign[0]} picked`);
  const list = await checks(p);
  check(list.some((x) => x.bad && x.text === text), `${where}: on ${foreign[0]} the checks list “${text}” as a problem (${list.map((x) => x.text).join(' | ')})`);
  s = await slots(p);
  check(s.some((x) => x.cat === 'accessory' && x.bad), `${where}: the accessory slot is marked`);
  acc = await options(p, 'accessory');
  const kept = acc.find((o) => o.id === gimbal);
  check(kept && kept.selected && kept.bad && kept.issue.includes(text), `${where}: the fitted gimbal stays in the accessory picker to take it off (${JSON.stringify(kept)})`);
  return { list };
}

async function browser(made, camera) {
  const b = await startBrowser();
  let loads = 0;
  try {
    for (const lang of ['en', 'de']) {
      for (const width of [1280, 390]) {
        const where = `made-up add-on ${lang} ${width} px`;
        const p = await b.page({ lang });
        await p.open('/configurator/', { width, lang, ready: CFG_READY });
        loads++;
        await loadJar(p, made);
        const text = lang === 'de' ? TEXT.de_de : TEXT.en_us;
        await flow(p, where, { gimbal: GIMBAL, frames: GIMBAL_SORTED, name: lang === 'de' ? 'Rahmen-Gimbal' : 'Frame Gimbal', text, other: RING, foreign: FOREIGN_FRONT });
        const acc = await options(p, 'accessory');
        check(!acc.some((o) => o.id === TOP), `${where}: the top holder (only for ${OWN_FRAME}) is not offered on ${FOREIGN_FRONT[0]}`);
        if (SHOTS) await p.shot(path.join(SHOTS, `frames-${lang}-${width}.png`));
        check(p.errors.length === 0, `${where}: no console errors (${p.errors.slice(0, 2).join(' | ')})`);
        await p.close();
      }
    }
    if (camera) {
      for (const [lang, width] of [['en', 1280], ['de', 390]]) {
        const where = `${camera.label} ${lang} ${width} px`;
        const p = await b.page({ lang });
        await p.open('/configurator/', { width, lang, ready: CFG_READY });
        loads++;
        await loadJar(p, camera.file);
        const text = lang === 'de' ? TEXT.de_de : TEXT.en_us;
        const foreign = camera.catalog.partsIn('frame').filter((f) => !camera.frames.includes(f.id) && f.data.accessory_mounts.includes('front')).map((f) => f.id);
        await flow(p, where, { gimbal: camera.gimbal, frames: camera.frames, name: lang === 'de' ? camera.name.de_de : camera.name.en_us, text, foreign });
        if (SHOTS) await p.shot(path.join(SHOTS, `frames-camera-${lang}-${width}.png`));
        check(p.errors.length === 0, `${where}: no console errors (${p.errors.slice(0, 2).join(' | ')})`);
        await p.close();
      }
    }
    const { dir } = await buildPreview({ languages: LANGUAGES, mode: 'strict' });
    const { server, base: preview } = await serveDirs([dir, ROOT]);
    try {
      for (const code of EXTRA) {
        const where = `/${code}/configurator/ 1280 px`;
        const text = loadDict(code).entries[normalize(TEXT.en_us)] || TEXT.en_us;
        const p = await b.page({ lang: 'en' });
        await p.open(`${preview}/${code}/configurator/`, { width: 1280, ready: CFG_READY });
        loads++;
        await loadJar(p, made);
        check(await choose(p, 'frame', 'propwash:cinewhoop_3') && await choose(p, 'accessory', GIMBAL) && await choose(p, 'frame', FOREIGN_FRONT[0]), `${where}: gimbal on ${FOREIGN_FRONT[0]}`);
        const list = await checks(p);
        check(text !== TEXT.en_us && list.some((x) => x.bad && x.text === text), `${where}: the problem in the language: “${text}” (${list.map((x) => x.text).join(' | ')})`);
        if (SHOTS) await p.shot(path.join(SHOTS, `frames-${code}-1280.png`));
        await p.close();
      }
    } finally {
      server.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } finally {
    await b.close();
  }
  return loads;
}

// ---------------------------------------------------------------------------------------------------------------

async function main() {
  reader();
  const jar = madeUpJar();
  const a = readAddon(jar, { base, fileName: 'frames.jar' });
  let catalog = null;
  if (check(a.ok, `made-up add-on: loads (${JSON.stringify(a.problems)})`)) {
    const exp = a.export[NS].parts;
    const g = exp.find((p) => p.id === GIMBAL);
    check(g && JSON.stringify(g.data.frames) === JSON.stringify(GIMBAL_SORTED) && Object.keys(g.data).pop() === 'frames', `made-up add-on: the gimbal's export has data.frames last, after led_path (${g && JSON.stringify(g.data)})`);
    const ring = exp.find((p) => p.id === RING);
    check(ring && !('frames' in ring.data), 'made-up add-on: an accessory without frames has no data.frames, like the web export');
    catalog = createCatalog(composeCatalog(base, { fragments: [a.fragment] }));
    rules(catalog);
  }
  sameAsGame();
  dictionaries();
  const camera = cameraAddon();
  let loads = 0;
  if (flag('--no-browser')) {
    note('--no-browser: the pages are not checked');
  } else if (catalog) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-frames-jar-'));
    const made = path.join(dir, 'frames-test.jar');
    fs.writeFileSync(made, jar);
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    loads = await browser(made, camera);
  }
  finish(`made-up add-on${camera ? ', camera add-on' : ''}${loads ? `; ${loads} page loads` : ''}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
