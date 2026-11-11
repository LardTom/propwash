#!/usr/bin/env node
// The official add-ons next to Just More Parts in the configurator (finding SITEADD-1): Propwash: Camera Drones
// (camdrones) and Propwash: Mob Defense (mobdefense), both in the catalog from the web export of Propwash made with all
// three add-ons installed, both share-code compatible (PW3, parts tables without a short id: the namespace goes into
// the code as text with the mod's name and address).
//   - catalog: every namespace of the export with name, version and homepage (the address a PW3 code names), the 19
//     parts of the camera add-on's parts table and the three of Mob Defense with names, help, mass and a model file;
//     the three camera drones (Compact, Tour, Cine) as presets whose share code, check and analysis the page computes
//     like the game; the Mob Defense accessories on their mounts (dispenser front, spear bottom, booster top) with the
//     frame limits of the game (the mount must be on the frame; the gimbals only on the camera frames)
//   - models: every add-on part drawn from its own block model; the dispenser's front plate uses the vanilla texture
//     minecraft:block/dispenser_front, which no export carries – the page draws it with a texture of its own
//   - camera drones (assets/data/configurator/camera-drones.json, what the add-on keeps in code): nav boards with GPS,
//     compass, barometer and their obstacle sensors, gimbals with tilt, pan and lenses, the flight classes; against the
//     Java sources of a camera add-on checkout next to this repository if there; the camera check of the workbench
//     (CameraCheck: Nav-FC, gimbal, battery, camera link) with the game's texts and its rows like CameraCheckScreen
//     (finding AUTO42-1): a wrong Nav-FC says why and names the part to fit (“Fit: …”), a missing part names the part
//     to fit, only an accepted other part gets “Recommended: …”, the hint “No camera frame” only while the build is
//     incomplete – also in the panel of the page for the game's case (tour frame with an FPV stack and no gimbal)
//   - share codes from the game (tools/fixtures/sharecode-vectors.json, format PW3: a camera drone, a Mob Defense
//     accessory, both Mob Defense accessories plus booster, all three add-ons): read and written byte for byte like the
//     game; without the add-on the page names it like the game (“Needs Propwash: Camera Drones from 1.0.0” with its
//     CurseForge page, the homepage of the 1.0.0 jars, link type 2) and writes the code back unchanged
//   - texts: the add-on filter and the camera drone texts in English and German, the class cinelifter, the figure
//     ranges of camera drones
//   - headless Chrome, English and German at 1280 and 390 px: the add-on filter of the part lists, the badges, the
//     camera presets in the preset list, a camera drone and every Mob Defense accessory drawn with their models, the
//     camera drone panel, the hint for a code of a missing add-on; --shots <dir> keeps the pictures (also the drone
//     pictures for the comparison with the game)
//
//   node tools/test-configurator-addons.mjs [--camera-repo <dir>] [--no-browser] [--shots <dir>] [--chrome <path>]
//
// --camera-repo (or PROPWASH_CAMERA_REPO, default: ../propwash-camera next to this repository's main checkout) is a
// checkout of the camera add-on; nothing of it is written into this repository.

import fs from 'node:fs';
import path from 'node:path';
import { createCatalog, composeCatalog } from '../assets/js/configurator/data.js';
import { addonNote, codeAddons, withCodeAddons } from '../assets/js/configurator/convert.js';
import { encode as encodeCode } from '../assets/js/configurator/sharecode.js';
import { STAT_KEYS } from '../assets/js/configurator/analysis.js';
import { entry } from '../assets/js/configurator/i18n.js';
import { startBrowser, counter, arg, flag, readJson, sleep, ROOT, CFG_READY } from './fixtures/cov/browser.mjs';

const { check, note, finish } = counter('configurator add-ons');
const SHOTS = arg('--shots');
const CAM = 'camdrones';
const MD = 'mobdefense';
const JMP = 'justmoreparts';
const ADDONS = [JMP, CAM, MD];
const NAMES = { [JMP]: 'Propwash: Just More Parts', [CAM]: 'Propwash: Camera Drones', [MD]: 'Propwash: Mob Defense' };
const SHORT = { [JMP]: 'Just More Parts', [CAM]: 'Camera Drones', [MD]: 'Mob Defense' };
const HOMEPAGE = { [CAM]: 'https://www.curseforge.com/minecraft/mc-mods/propwash-camera-drones', [MD]: 'https://www.curseforge.com/minecraft/mc-mods/propwash-mob-defense' };
const CAM_COUNTS = { frame: 3, stack: 2, motor: 3, prop: 3, video: 2, battery: 3, accessory: 3 };
const CAM_PRESETS = ['camdrones:compact', 'camdrones:tour', 'camdrones:cine'];
const CAM_FRAMES = ['camdrones:compact_fold_frame', 'camdrones:tour_fold_frame', 'camdrones:cine_frame'];
const GIMBALS = ['camdrones:gimbal_compact', 'camdrones:gimbal_tour', 'camdrones:gimbal_cine'];
const NAV = ['camdrones:nav_fc_compact', 'camdrones:nav_fc_pro'];
// Mob Defense, as in its part files (data/mobdefense/propwash_parts/accessory/*.json) and its player guide.
const MD_PARTS = { 'mobdefense:dispenser_mount': { slot: 'front', mass: 150 }, 'mobdefense:spear_mount': { slot: 'bottom', mass: 40 },
  'mobdefense:rocket_booster': { slot: 'top', mass: 28 } };
const VANILLA = 'minecraft:block/dispenser_front';

const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const base = readJson('assets/data/configurator/catalog.json');
const render = readJson('assets/data/configurator/render.json');
const catalog = createCatalog(base);
const vectors = readJson('tools/fixtures/sharecode-vectors.json').filter((v) => v.format === 'PW3');
const cameraData = exists('assets/data/configurator/camera-drones.json') ? readJson('assets/data/configurator/camera-drones.json') : null;
const nsOf = (id) => id.slice(0, id.indexOf(':'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const text = (path, lang) => {
  const e = entry(path);
  return Array.isArray(e) ? e[lang === 'de' ? 1 : 0] : null;
};
const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
const gameText = (s) => {
  let next = 0;
  return s.replace(/%(?:(\d)\$)?s/g, (m, n) => ['{x}', '{y}'][(n ? Number(n) : ++next) - 1] || m);
};
const flat = (s) => String(s || '').replace(/[\s  ]+/g, ' ').trim();
// Finding AUTO42-1: the tour frame with an FPV stack and without gimbal (code of the review, read in Chrome).
const WRONG_NAV_CODE = 'PW3-01g3njSaz6kOMbxctGEJlNq8WvvXjNjc1tDDXjiOQP4eqKgfODbGoxNPTeT1A4YYxvdPZ8fme3KG';
const attempt = (fn) => {
  try {
    return fn();
  } catch (e) {
    return `ERROR ${e.key || e.message}`;
  }
};
const attemptNote = (fn) => {
  try {
    return fn();
  } catch {
    return null;
  }
};
const close = (a, b, rel = 1e-9) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= Math.max(Math.abs(b) * rel, 1e-9);

function modelFile(id) {
  const p = catalog.part(id);
  return p ? `assets/data/configurator/models/${nsOf(id)}/${p.category}/${id.slice(id.indexOf(':') + 1)}.json` : null;
}

function pngSize(dataUrl) {
  const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl || '');
  if (!m) return null;
  const b = Buffer.from(m[1], 'base64');
  if (b.length < 24 || b.toString('latin1', 1, 4) !== 'PNG') return null;
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

// ---------------------------------------------------------------------------------------------------------------
// 1. Catalog

function catalogChecks() {
  for (const ns of ADDONS) {
    const n = catalog.namespace(ns);
    if (!check(n, `catalog: namespace ${ns} is there (${catalog.namespaces.map((x) => x.namespace).join(', ')})`)) continue;
    check(n.name === NAMES[ns], `catalog: ${ns} is called “${n.name}”, expected “${NAMES[ns]}”`);
    check(typeof n.version === 'string' && n.version.length > 0, `catalog: ${ns} has a version (${n.version})`);
    check(base.source.mods && base.source.mods[ns] === n.version, `catalog: the export was made with ${ns} ${n.version} (${JSON.stringify(base.source.mods)})`);
    if (HOMEPAGE[ns]) check(n.homepage === HOMEPAGE[ns], `catalog: ${ns} has the homepage of its jar, ${HOMEPAGE[ns]} (${n.homepage})`);
  }
  check(!!base.source.sources && base.source.sources.length >= 1, `catalog: source names the export(s) it was built from (${JSON.stringify(base.source.sources)})`);

  const table = (base.sharecode.tables || {})[CAM];
  if (check(table, 'catalog: the parts table of camdrones is there')) {
    const counts = {};
    for (const [kind, list] of Object.entries(table.parts)) {
      counts[kind] = list.length;
      for (const e of list) {
        const id = `${CAM}:${e.id}`;
        const p = catalog.part(id);
        check(p && p.category === kind, `camdrones: ${id} is in the catalog as ${kind}`);
      }
    }
    check(same(counts, CAM_COUNTS), `camdrones: 19 parts in the table by kind ${JSON.stringify(counts)}`);
  }
  check((base.sharecode.tables || {})[MD] && (base.sharecode.tables[MD].parts.accessory || []).length === 3, 'catalog: the parts table of mobdefense with three accessories');
  const addonParts = catalog.parts.filter((p) => [CAM, MD].includes(nsOf(p.id)));
  check(addonParts.length === 22, `catalog: 22 parts of Camera Drones and Mob Defense (${addonParts.length})`);
  for (const p of addonParts) {
    check(p.name && p.name.en_us && p.name.de_de, `${p.id}: name in English and German`);
    const help = p.help || {};
    check(help.en_us && help.en_us.summary && help.de_de && help.de_de.summary, `${p.id}: help text in English and German`);
    check(p.basics.mass_g > 0, `${p.id}: mass ${p.basics.mass_g} g`);
    check(render.models.includes(p.id), `${p.id}: listed in render.json with a model`);
    const file = modelFile(p.id);
    if (!check(file && exists(file), `${p.id}: model file ${file}`)) continue;
    const m = readJson(file);
    check(m.variants && m.variants.base && Array.isArray(m.variants.base.el) && m.variants.base.el.length > 0, `${p.id}: model with elements`);
    check(Array.isArray(m.tex) && m.tex.length > 0 && m.tex.every((t) => pngSize(t)), `${p.id}: textures are PNG pictures`);
  }
  for (const [id, want] of Object.entries(MD_PARTS)) {
    const p = catalog.part(id);
    if (!check(p, `${id}: in the catalog`)) continue;
    check(p.category === 'accessory' && p.data.slot === want.slot && p.basics.mass_g === want.mass, `${id}: ${want.slot} mount, ${want.mass} g (${p.data.slot}, ${p.basics.mass_g} g)`);
    check(!('frames' in p.data), `${id}: fits every frame with a ${want.slot} mount (no frames)`);
  }

  // The dispenser front plate: a second texture the export does not carry, drawn with the page's own stand-in.
  const disp = exists('assets/data/configurator/models/mobdefense/accessory/dispenser_mount.json')
    ? readJson('assets/data/configurator/models/mobdefense/accessory/dispenser_mount.json') : null;
  if (check(disp, 'dispenser model file')) {
    check(disp.tex.length === 3, `dispenser: three textures, its own, its paint texture and a stand-in for ${VANILLA} (${disp.tex.length})`);
    const base0 = disp.variants.base;
    const faces = base0.el.reduce((n, e) => n + e[7].filter(Boolean).length, 0);
    check(Array.isArray(base0.ftex) && base0.ftex.length === faces, `dispenser: a texture per face (${base0.ftex && base0.ftex.length} of ${faces})`);
    check(Array.isArray(base0.ftex) && base0.ftex.filter((t) => t === 1).length === 1, 'dispenser: exactly the north face of the front plate shows the stand-in');
    check(same((disp.stand_ins || {})[1], VANILLA), `dispenser: the second texture is named as the stand-in of ${VANILLA}`);
    const paint = disp.variants.paint;
    check(paint && Array.isArray(paint.ftex) && same(paint.ftex.map((t) => t === 1), base0.ftex.map((t) => t === 1)), 'dispenser: the paint variant has the same face with the stand-in');
  }

  for (const id of CAM_PRESETS) {
    const p = catalog.preset(id);
    if (!check(p, `${id}: preset in the catalog`)) continue;
    const c = catalog.check(p.build);
    check(c.problems.length === 0 && c.warnings.length === 0, `${id}: no problems or warnings (${JSON.stringify(c)})`);
    const a = catalog.analyze(p.build);
    check(a && STAT_KEYS.every((k) => (p.analysis[k] === null ? a[k] === null || Number.isNaN(a[k]) : close(a[k], p.analysis[k]))),
      `${id}: analysis like the game (${a && STAT_KEYS.filter((k) => !close(a[k], p.analysis[k])).map((k) => `${k} ${a[k]} vs ${p.analysis[k]}`).join(', ')})`);
    const code = attempt(() => catalog.encode(catalog.presetContent(id)));
    check(code === p.sharecode, `${id}: PW3 code written like the game (${code} vs ${p.sharecode})`);
  }
  for (const [label, frame, mount, id] of [['whoop', 'propwash:whoop_65', 'front', 'mobdefense:dispenser_mount'], ['whoop', 'propwash:whoop_65', 'top', 'mobdefense:rocket_booster']]) {
    const preset = catalog.presetBuild('propwash:whoop');
    const r = catalog.check({ ...preset, frame, accessories: { [mount]: id } });
    check(r.problems.includes('accessory_mount'), `${id} on the ${label} (only a bottom mount): accessory_mount (${r.problems})`);
  }
  const fs5 = catalog.presetBuild('propwash:freestyle');
  for (const [id, want] of Object.entries(MD_PARTS)) {
    const r = catalog.check({ ...fs5, accessories: { [want.slot]: id } });
    check(!r.problems.length, `${id} on the 5″ freestyle frame: no problem (${r.problems})`);
  }
  for (const g of GIMBALS) {
    const part = catalog.part(g);
    check(part && same(part.data.frames, [...CAM_FRAMES].sort((a, b) => a.localeCompare(b))), `${g}: only on the three camera frames (${part && part.data.frames})`);
    const r = catalog.check({ ...fs5, accessories: { front: g } });
    check(r.problems.includes('accessory_frame'), `${g} on the 5″ freestyle frame: accessory_frame (${r.problems})`);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 2. Camera drones

const SENSORS_ALL = ['forward', 'back', 'left', 'right', 'up', 'down'];

function cameraRepo() {
  const given = arg('--camera-repo', 'PROPWASH_CAMERA_REPO');
  const candidates = given ? [given] : [path.resolve(ROOT, '../propwash-camera'), path.resolve(ROOT, '../../../../propwash-camera')];
  return candidates.find((d) => fs.existsSync(path.join(d, 'common/src/main/java/de/lardtom/camdrones/part/GimbalTable.java'))) || null;
}

async function cameraChecks() {
  if (!check(cameraData, 'assets/data/configurator/camera-drones.json is there')) return;
  check(cameraData.namespace === CAM, 'camera-drones.json: namespace camdrones');
  check(same(Object.keys(cameraData.nav_boards || {}).sort(), [...NAV].sort()), `camera-drones.json: the two nav boards (${Object.keys(cameraData.nav_boards || {})})`);
  for (const [id, nav] of Object.entries(cameraData.nav_boards || {})) {
    check(catalog.part(id) && catalog.part(id).category === 'stack', `${id}: a stack of the catalog`);
    check(nav.gps === true && nav.compass === true && nav.barometer === true, `${id}: GPS, compass and barometer`);
    check(Array.isArray(nav.sensors) && nav.sensors.every((s) => SENSORS_ALL.includes(s)), `${id}: obstacle sensors ${nav.sensors}`);
  }
  check(same(Object.keys(cameraData.gimbals || {}).sort(), [...GIMBALS].sort()), 'camera-drones.json: the three gimbals');
  for (const [id, g] of Object.entries(cameraData.gimbals || {})) {
    check(catalog.part(id) && catalog.part(id).data.slot === 'front', `${id}: a front accessory of the catalog`);
    check(Array.isArray(g.tilt) && g.tilt.length === 2 && g.tilt[0] < g.tilt[1], `${id}: tilt range ${g.tilt}`);
  }
  check(same(cameraData.lenses_mm, [24, 50, 85]), `camera-drones.json: the lenses 24, 50 and 85 mm (${cameraData.lenses_mm})`);
  check(Array.isArray(cameraData.classes) && same(cameraData.classes.map((c) => c.preset), CAM_PRESETS), 'camera-drones.json: the three flight classes with their presets');
  for (const c of cameraData.classes || []) {
    const preset = catalog.preset(c.preset);
    check(preset && preset.build.frame === c.frame, `${c.key}: frame ${c.frame} is the frame of ${c.preset}`);
    check(c.speeds_ms && c.speeds_ms.cine < c.speeds_ms.normal && c.speeds_ms.normal < c.speeds_ms.sport, `${c.key}: speeds Cine < Normal < Sport ${JSON.stringify(c.speeds_ms)}`);
  }

  const repo = cameraRepo();
  if (!repo) {
    note('no camera add-on checkout next to this repository – camera-drones.json not compared with its sources');
  } else {
    const src = (rel) => fs.readFileSync(path.join(repo, 'common/src/main/java/de/lardtom/camdrones', rel), 'utf8');
    const gimbals = src('part/GimbalTable.java');
    for (const [key, id] of [['COMPACT', 'gimbal_compact'], ['TOUR', 'gimbal_tour'], ['CINE', 'gimbal_cine']]) {
      const m = new RegExp(`${key},\\s*new Spec\\(([-\\d.]+),\\s*([-\\d.]+),\\s*(true|false),\\s*(true|false),\\s*List\\.of\\(([^)]*)\\)\\)`).exec(gimbals);
      const g = cameraData.gimbals[`${CAM}:${id}`];
      if (!check(m && g, `GimbalTable: ${key} found`)) continue;
      const focal = m[5].split(',').map((s) => s.trim()).filter(Boolean).map((s) => (s === 'DEFAULT_FOCAL_MM' ? 24 : Number(s)));
      check(same(g.tilt, [Number(m[1]), Number(m[2])]) && g.pan_360 === (m[3] === 'true') && g.lens_bay === (m[4] === 'true') && same(g.focal_mm, focal),
        `${id}: like GimbalTable (${JSON.stringify(g)} vs ${m[0]})`);
    }
    const sensors = src('part/SensorTable.java');
    check(/NAV_FC_COMPACT,\s*Set\.copyOf\(EnumSet\.of\(SensorDirection\.DOWN\)\)/.test(sensors) && same(cameraData.nav_boards[`${CAM}:nav_fc_compact`].sensors, ['down']),
      'nav_fc_compact: only the downward sensor, like SensorTable');
    check(/NAV_FC_PRO,\s*Set\.copyOf\(EnumSet\.allOf\(SensorDirection\.class\)\)/.test(sensors) && same(cameraData.nav_boards[`${CAM}:nav_fc_pro`].sensors, SENSORS_ALL),
      'nav_fc_pro: sensors in all six directions, like SensorTable');
    const range = /RANGE_METRES\s*=\s*([\d.]+)/.exec(sensors);
    check(range && Number(range[1]) === cameraData.sensor_range_m, `sensor range ${cameraData.sensor_range_m} m like SensorTable (${range && range[1]})`);
    const classes = src('logic/nav/FlightClass.java');
    for (const c of cameraData.classes || []) {
      const m = new RegExp(`${c.key.toUpperCase()}\\("${c.key}",\\s*(\\d+),\\s*([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)`).exec(classes);
      check(m && same([Number(m[2]), Number(m[3]), Number(m[4])], [c.speeds_ms.cine, c.speeds_ms.normal, c.speeds_ms.sport])
        && Number(m[5]) === c.climb_ms && Number(m[6]) === c.descend_ms, `${c.key}: speeds like FlightClass (${m && m[0]})`);
    }
    const lenses = src('part/LensItems.java');
    check(same([...lenses.matchAll(/new Lens\("lens_\d+",\s*(\d+)/g)].map((m) => Number(m[1])), cameraData.lenses_mm), 'lenses like LensItems');
    const presets = src('part/CamPresets.java');
    for (const c of cameraData.classes || []) {
      const m = new RegExp(`new Entry\\("${c.key}",\\s*FlightClass\\.\\w+,\\s*"(\\w+)",\\s*"(\\w+)",\\s*"(\\w+)",\\s*"(\\w+)",\\s*"(\\w+)",\\s*"(\\w+)",\\s*"(\\w+)"`).exec(presets);
      const b = catalog.presetBuild(c.preset);
      check(m && b && same([m[1], m[2], m[3], m[4], m[5], m[6], m[7]].map((x) => `${CAM}:${x}`), [b.frame, b.stack, b.motor, b.prop, b.video, b.battery, b.accessories.front]),
        `${c.preset}: parts like CamPresets`);
    }
    for (const lang of ['en_us', 'de_de']) {
      const file = path.join(repo, `common/src/lang/parts/${lang}.json`);
      if (!fs.existsSync(file)) continue;
      const game = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const key of ['title', 'complete', 'incomplete', 'fitted', 'missing', 'wrong', 'other', 'advice', 'recommended', 'no_camera_frame',
        'role.nav_fc', 'role.gimbal', 'role.battery', 'role.link', ['completeHint', 'complete.hint'], ['incompleteHint', 'incomplete.hint'],
        ['wrongNav', 'wrong.nav_fc']]) {
        const [site, gameKey] = Array.isArray(key) ? key : [key, key];
        const mine = text(`camdrones.check.${site}`, lang === 'de_de' ? 'de' : 'en');
        const theirs = game[`camdrones.check.${gameKey}`];
        check(theirs && mine === gameText(theirs), `camera check text ${site} (${lang}): “${mine}” like the game's ${gameKey} “${theirs}”`);
      }
    }
    const screen = src('part/client/CameraCheckScreen.java');
    check(/if \(!complete && result\.preset\(\)\.isEmpty\(\)\)\s*\{\s*out\.add\(new Row\(Component\.translatable\(CameraCheck\.NO_CAMERA_FRAME\)/.test(screen),
      'CameraCheckScreen.rows: “No camera frame” only for an incomplete build without a camera frame (the page follows it)');
    check(/line\.state\(\) == CameraCheck\.State\.WRONG && line\.fitted\(\)\.isPresent\(\)\)\s*\{[^}]*wrongKey\(\)[^}]*\}\s*if \(line\.advice\(\)\.isPresent\(\)\)/.test(screen),
      'CameraCheckScreen.rows: a wrong part gets its reason and then, on its own, the advice (the page follows it)');
    check(/other \? CameraCheck\.RECOMMENDED : CameraCheck\.ADVICE/.test(screen),
      'CameraCheckScreen.rows: “Recommended” only next to an accepted other part, else “Fit” (the page follows it)');
  }

  let mod = null;
  try {
    mod = await import('../assets/js/configurator/camdrones.js');
  } catch (e) {
    check(false, `assets/js/configurator/camdrones.js loads (${e.message})`);
    return;
  }
  const tour = catalog.presetBuild('camdrones:tour');
  const run = (build) => mod.cameraCheck(build, catalog, cameraData);
  const roles = (r) => Object.fromEntries(r.lines.map((l) => [l.role, l.state]));
  for (const id of CAM_PRESETS) {
    const r = run(catalog.presetBuild(id));
    check(r.camera && r.complete && Object.values(roles(r)).every((s) => s === 'fitted'), `camera check ${id}: complete (${JSON.stringify(roles(r))})`);
  }
  let r = run({ ...tour, stack: 'propwash:stack_30' });
  check(roles(r).nav_fc === 'wrong' && !r.complete && r.lines.find((l) => l.role === 'nav_fc').advice === 'camdrones:nav_fc_pro', `camera check: an FPV stack on the tour frame is wrong, advice nav_fc_pro (${JSON.stringify(r.lines)})`);
  r = run({ ...tour, accessories: {} });
  check(roles(r).gimbal === 'missing' && r.lines.find((l) => l.role === 'gimbal').advice === 'camdrones:gimbal_tour', 'camera check: without gimbal it is missing, advice gimbal_tour');
  r = run({ ...tour, battery: 'propwash:b6s_1300' });
  check(roles(r).battery === 'other' && r.complete, 'camera check: another battery is fine (other part), the drone stays complete');
  r = run({ ...tour, video: 'propwash:digital_hd' });
  check(roles(r).link === 'other' && r.complete, 'camera check: another video link is fine (other part)');
  r = run(catalog.presetBuild('propwash:freestyle'));
  check(!r.camera, 'camera check: an FPV drone without camera parts is no camera drone');
  r = run({ ...catalog.presetBuild('propwash:long_range'), stack: 'camdrones:nav_fc_pro' });
  check(r.camera && r.preset === null, 'camera check: a nav board on a non-camera frame: camera drone without a camera frame (no advice)');
  check(mod.isCameraDrone(tour, cameraData) && !mod.isCameraDrone(catalog.presetBuild('propwash:freestyle'), cameraData), 'isCameraDrone: by the nav board');

  // The rows under each role and the hint without camera frame, like CameraCheckScreen.rows (finding AUTO42-1).
  if (!check(typeof mod.lineNotes === 'function' && typeof mod.noCameraFrameHint === 'function',
    'camdrones.js: lineNotes and noCameraFrameHint (the rows of CameraCheckScreen)')) return;
  const notesOf = (res, role) => mod.lineNotes(res.lines.find((l) => l.role === role));
  r = run({ ...tour, stack: 'propwash:stack_30' });
  check(same(notesOf(r, 'nav_fc'), [{ key: 'wrongNav', part: 'propwash:stack_30' }, { key: 'advice', part: 'camdrones:nav_fc_pro' }]),
    `camera check rows: a wrong Nav-FC says why and then “Fit: Nav-FC Pro” (${JSON.stringify(notesOf(r, 'nav_fc'))})`);
  r = run({ ...tour, accessories: {} });
  check(same(notesOf(r, 'gimbal'), [{ key: 'advice', part: 'camdrones:gimbal_tour' }]),
    `camera check rows: a missing gimbal gets “Fit: …”, not “Recommended: …” (${JSON.stringify(notesOf(r, 'gimbal'))})`);
  r = run({ ...tour, battery: 'propwash:b6s_1300' });
  check(same(notesOf(r, 'battery'), [{ key: 'recommended', part: tour.battery }]),
    `camera check rows: another battery is fine and gets “Recommended: …” (${JSON.stringify(notesOf(r, 'battery'))})`);
  for (const id of CAM_PRESETS) {
    r = run(catalog.presetBuild(id));
    check(r.lines.every((l) => mod.lineNotes(l).length === 0) && !mod.noCameraFrameHint(r), `camera check rows ${id}: complete, no advice and no hint`);
  }
  r = run({ ...tour, stack: 'propwash:stack_30', accessories: {} });
  check(!mod.noCameraFrameHint(r), 'camera check rows: incomplete on a camera frame – no hint “No camera frame”');
  const lr = catalog.presetBuild('propwash:long_range');
  r = run({ ...lr, stack: 'camdrones:nav_fc_pro' });
  check(!r.complete && mod.noCameraFrameHint(r) && r.lines.every((l) => mod.lineNotes(l).every((n) => n.key !== 'advice' && n.key !== 'recommended')),
    'camera check rows: a nav board on a non-camera frame – incomplete, the hint “No camera frame”, no advice');
  r = run({ ...lr, stack: 'camdrones:nav_fc_pro', accessories: { front: 'camdrones:gimbal_tour' } });
  check(r.complete && r.preset === null && !mod.noCameraFrameHint(r),
    `camera check rows: complete without a camera frame – no hint “No camera frame”, like the game (complete ${r.complete})`);
}

// ---------------------------------------------------------------------------------------------------------------
// 3. Share codes from the game

function vectorChecks() {
  check(vectors.length === 4, `four PW3 vectors of the add-ons in sharecode-vectors.json (${vectors.length})`);
  for (const v of vectors) {
    const d = catalog.decode(v.code);
    check(d.ok && d.status === v.status && d.format === 'PW3', `${v.name}: reads (${d.status})`);
    check(same(d.layers, v.layers), `${v.name}: layers ${d.layers} vs ${v.layers}`);
    check(same(d.unknownParts, v.unknown_parts), `${v.name}: no unknown parts (${d.unknownParts})`);
    check(same(d.namespaces.map((n) => ({ key: n.namespace, short_id: n.short_id, table: n.table, min_version: n.min_version, result: n.result })), v.namespaces),
      `${v.name}: namespaces like the game ${JSON.stringify(d.namespaces.map((n) => [n.namespace, n.result]))}`);
    check(d.ok && same(d.content.build, v.decoded.build) && same(d.content.name, v.decoded.name), `${v.name}: build and name like the game`);
    const fresh = { build: v.decoded.build, paint: v.layers.includes('paint') ? v.decoded.paint : null, tune: v.layers.includes('tune') ? v.decoded.tune : null,
      osd: null, name: v.layers.includes('name') ? v.decoded.name : null };
    const written = attempt(() => catalog.encode(fresh));
    check(written === v.code, `${v.name}: written byte for byte like the game (${written} vs ${v.code})`);
    if (d.ok) check(attempt(() => catalog.encode(d.content, { carry: d.carry })) === v.code, `${v.name}: read and written again unchanged`);
    if (v.check) {
      const c = catalog.check(v.decoded.build);
      check(same({ problems: c.problems, warnings: c.warnings }, v.check), `${v.name}: check like the game ${JSON.stringify(c)}`);
    }
    if (v.analysis) {
      const a = catalog.analyze(v.decoded.build);
      check(a && STAT_KEYS.every((k) => close(a[k], v.analysis[k])), `${v.name}: analysis like the game`);
    }
    // Without the add-ons: the page names them like the game and writes the code back unchanged.
    const off = v.missing.map((m) => m.key);
    const without = createCatalog(composeCatalog(base, { off }));
    const w = without.decode(v.code);
    check(w.ok, `${v.name} without ${off}: still reads (${w.status})`);
    for (const m of v.missing) {
      const report = w.namespaces.find((n) => n.namespace === m.key);
      check(report && report.result === 'MISSING' && report.min_version === m.required_version, `${v.name} without ${m.key}: MISSING from ${m.required_version} (${JSON.stringify(report)})`);
      check(report && report.name === m.name && `https://www.curseforge.com/minecraft/mc-mods/${report.link}` === m.link && report.link_type === 2, `${v.name} without ${m.key}: name and CurseForge page of the code like the game (${report && report.name}, ${report && report.link_type} ${report && report.link})`);
      const unknown = w.unknownParts.filter((id) => id.includes(m.key));
      check(unknown.length === m.parts, `${v.name} without ${m.key}: ${m.parts} unknown parts (${unknown.length})`);
      for (const lang of ['en', 'de']) {
        globalThis.document = { documentElement: { lang } };
        const n = report ? attemptNote(() => addonNote(report, without, lang, '../addons/')) : null;
        delete globalThis.document;
        check(n && n.text.includes(m.name) && n.text.includes(m.required_version), `${v.name} ${lang}: the note names ${m.name} ${m.required_version} (${n && n.text})`);
        check(n && m.clickable && n.links.some((l) => (l.href || l.url || l) === m.link || JSON.stringify(l).includes(m.link)) && !n.free, `${v.name} ${lang}: the CurseForge page to click like the game (${n && JSON.stringify(n)})`);
      }
    }
    const tables = withCodeAddons(without.shareTables(), codeAddons(w.namespaces));
    check(w.ok && attempt(() => encodeCode(w.content, { tables, carry: w.carry })) === v.code, `${v.name} without ${off}: written back unchanged`);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 4. Texts

function textChecks() {
  for (const key of ['ui.addonFilter', 'ui.addonFilterAll', 'roles.cinelifter', 'camdrones.title', 'camdrones.check.title', 'camdrones.gps', 'camdrones.sensorsDown',
    'camdrones.sensorsAll', 'camdrones.gimbal', 'camdrones.pan', 'camdrones.lensBay', 'camdrones.speeds', 'camdrones.rangeNote', 'ui.fpvGimbalNote']) {
    const e = entry(key);
    check(Array.isArray(e) && e[0] && e[1], `text ${key} in English and German`);
  }
  for (const ns of ADDONS) {
    const e = entry(`addonShort.${ns}`);
    check(Array.isArray(e) && e[0] === SHORT[ns], `badge and filter name of ${ns}: “${SHORT[ns]}” (${e})`);
  }
  const help = readJson('assets/data/configurator/stathelp.json');
  for (const cls of ['cinelifter', 'camera_drone']) {
    check(cls === 'camera_drone' ? help.build_classes.includes(cls) && !help.classes.includes(cls) : help.classes.includes(cls),
      `stathelp.json: ${cls === 'camera_drone' ? 'build class' : 'frame class'} ${cls}`);
    for (const [key, ranges] of Object.entries(help.stats)) check(Array.isArray(ranges[cls]) && ranges[cls][0] < ranges[cls][1], `stathelp.json: ${key} range for ${cls}`);
  }
  for (const id of CAM_PRESETS) {
    const a = catalog.preset(id) && catalog.preset(id).analysis;
    if (!a) continue;
    for (const [key, ranges] of Object.entries(help.stats)) {
      const r = ranges.camera_drone;
      check(r && a[key] >= r[0] - 1e-9 && a[key] <= r[1] + 1e-9, `${id}: ${key} ${a[key]} inside the camera drone range ${r}`);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 5. Headless Chrome

const VIEWER_HOOK = "document.addEventListener('propwash:viewer', (e) => { window.__viewer = e.detail; });";

async function openCat(p, cat) {
  await p.evaluate(`(async () => {
    document.querySelector('[data-slots] [data-cat="${cat}"]').click();
    await new Promise((r) => setTimeout(r, 150));
    const all = document.querySelector('[data-picker] [data-cls="all"]');
    if (all && all.getAttribute('aria-pressed') !== 'true') { all.click(); await new Promise((r) => setTimeout(r, 150)); }
    return true;
  })()`);
}

const listed = (p) => p.evaluate(`[...document.querySelectorAll('[data-picker] [role=option]')].filter((o) => o.dataset.id).map((o) => ({
  id: o.dataset.id, mount: o.dataset.mount, bad: o.classList.contains('is-bad'), facts: (o.querySelector('.part__facts') || {}).textContent || '',
  badge: o.querySelector('.badge') ? o.querySelector('.badge').textContent.trim() : '', title: o.querySelector('.badge') ? o.querySelector('.badge').title : '' }))`);

const filterChips = (p) => p.evaluate(`[...document.querySelectorAll('[data-picker] [data-src]')].map((b) => ({ src: b.dataset.src, text: b.textContent.trim(), on: b.getAttribute('aria-pressed') === 'true' }))`);

async function filterBy(p, src) {
  return p.evaluate(`(() => {
    const b = document.querySelector('[data-picker] [data-src="${src}"]');
    if (!b) return false;
    b.click();
    return true;
  })()`);
}

async function choose(p, cat, id) {
  await openCat(p, cat);
  await filterBy(p, 'all');
  const done = await p.evaluate(`(() => {
    const o = document.querySelector('[data-picker] [role=option][data-id="${id}"]');
    if (!o) return false;
    o.click();
    return true;
  })()`);
  await sleep(800);
  return done;
}

async function drawnAll(p) {
  await p.waitFor('!!(window.__viewer && window.__viewer.current())', 'viewer', 30000).catch(() => {});
  await sleep(600);
  return p.evaluate(`(() => {
    const c = window.__viewer && window.__viewer.current();
    if (!c) return null;
    const ids = [...new Set(c.assembly.pieces.filter((x) => !x.procedural).map((x) => x.id))];
    return { ids, missing: ids.filter((id) => !c.models.has(id)) };
  })()`);
}

async function preset(p, id) {
  await p.evaluate(`(() => {
    const s = document.querySelector('[data-preset]');
    s.value = ${JSON.stringify(id)};
    s.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await sleep(1200);
}

async function snapshotTo(p, file) {
  await sleep(1500);
  const url = await p.evaluate('(() => { const s = window.__viewer && window.__viewer.snapshot({ maxWidth: 900, maxHeight: 900, pad: 0.04 }); return s && s.toDataURL ? s.toDataURL("image/png") : null; })()');
  if (url && url.startsWith('data:image/png;base64,')) fs.writeFileSync(file, Buffer.from(url.slice(22), 'base64'));
  return !!url;
}

async function browser() {
  const b = await startBrowser();
  const all3 = vectors.find((v) => v.name === 'addon:all-three');
  const cam = vectors.find((v) => v.name === 'addon:camdrones:tour');
  let loads = 0;
  try {
    for (const lang of ['en', 'de']) {
      for (const width of [1280, 390]) {
        const where = `${lang} ${width} px`;
        const p = await b.page({ lang });
        await p.send('Page.addScriptToEvaluateOnNewDocument', { source: VIEWER_HOOK });
        await p.open('/configurator/', { width, lang, ready: CFG_READY });
        loads++;
        // Preset list: a group per add-on with presets.
        const groups = await p.evaluate("[...document.querySelectorAll('[data-preset] optgroup')].map((g) => ({ label: g.label, ids: [...g.querySelectorAll('option')].map((o) => o.value) }))");
        const camGroup = groups.find((g) => g.label === SHORT[CAM]);
        check(camGroup && same(camGroup.ids, CAM_PRESETS), `${where}: preset list has the group “${SHORT[CAM]}” with Compact, Tour and Cine (${JSON.stringify(groups.map((g) => g.label))})`);
        for (const id of CAM_PRESETS) {
          if (!check(catalog.preset(id), `${where}: ${id} is a preset of the page`)) continue;
          await preset(p, id);
          const d = await drawnAll(p);
          check(d && d.ids.length >= 7 && d.missing.length === 0, `${where}: ${id} drawn with the models of all its parts (${d && d.missing.join(', ')})`);
          const panel = await p.evaluate("(() => { const n = document.querySelector('[data-camdrone]'); return n && !n.hidden ? n.textContent.replace(/\\s+/g, ' ').trim() : null; })()");
          check(panel && panel.includes(text('camdrones.check.complete', lang)), `${where}: ${id} – the camera drone panel says “${text('camdrones.check.complete', lang)}” (${panel && panel.slice(0, 160)})`);
          check(panel && panel.includes('GPS'), `${where}: ${id} – the panel names GPS`);
          check(panel && !panel.includes(flat(text('camdrones.check.no_camera_frame', lang))), `${where}: ${id} – complete, no hint “No camera frame”`);
          const mass = await p.evaluate("[...document.querySelectorAll('[data-keystats] .keystat')].map((k) => k.textContent.replace(/\\s+/g, ' ').trim())");
          const g = catalog.preset(id).analysis.mass_grams;
          const shown = lang === 'de' ? g.toFixed(1).replace('.', ',') : g.toFixed(1);
          check(mass.some((m) => m.includes(shown.replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'de' ? '.' : ','))) || mass.some((m) => m.includes(shown)), `${where}: ${id} weight ${shown} g like the game (${mass[0]})`);
          const odd = await p.evaluate("document.querySelectorAll('[data-stats] .is-odd, [data-keystats] .is-odd').length");
          check(odd === 0, `${where}: ${id} – no figure marked as unusual: a camera drone is compared with camera drones (${odd})`);
          if (SHOTS && lang === 'en' && width === 1280) {
            fs.mkdirSync(SHOTS, { recursive: true });
            check(await snapshotTo(p, path.join(SHOTS, `cam-${id.split(':')[1]}.png`)), `${where}: picture of ${id}`);
          }
        }
        // Part list of the camera drone: nav board and gimbal facts, badges, the add-on filter.
        await openCat(p, 'stack');
        let opts = await listed(p);
        for (const id of NAV) {
          const o = opts.find((x) => x.id === id);
          check(o && o.facts.includes('GPS'), `${where}: ${id} in the stack list with GPS in its facts (${o && o.facts})`);
          check(o && o.badge === SHORT[CAM] && o.title.includes(NAMES[CAM]), `${where}: ${id} has the badge “${SHORT[CAM]}” (${o && o.badge} / ${o && o.title})`);
        }
        await openCat(p, 'accessory');
        opts = await listed(p);
        const cine = opts.find((x) => x.id === 'camdrones:gimbal_tour');
        check(cine && /−90/.test(cine.facts) && /24/.test(cine.facts), `${where}: gimbal_tour facts with tilt and lenses (${cine && cine.facts})`);
        await openCat(p, 'frame');
        let chips = await filterChips(p);
        check(chips.length >= 4 && chips[0].src === 'all' && ['propwash', JMP, CAM].every((s) => chips.some((c) => c.src === s)), `${where}: frame list with the add-on filter (${JSON.stringify(chips)})`);
        check(chips.find((c) => c.src === CAM) && chips.find((c) => c.src === CAM).text === SHORT[CAM], `${where}: the filter says “${SHORT[CAM]}”`);
        await filterBy(p, CAM);
        await sleep(200);
        opts = await listed(p);
        check(same(opts.map((o) => o.id).sort(), [...CAM_FRAMES].sort()), `${where}: filter Camera Drones shows the three camera frames (${opts.map((o) => o.id)})`);
        await filterBy(p, JMP);
        await sleep(200);
        opts = await listed(p);
        check(opts.length > 10 && opts.every((o) => nsOf(o.id) === JMP && o.badge === text('ui.addon', lang)), `${where}: filter Just More Parts shows only its frames with their badge “${text('ui.addon', lang)}” (${opts.length})`);
        await filterBy(p, 'all');

        // Mob Defense on the 5″ freestyle preset: the filter, every accessory drawn, weight and mount.
        await preset(p, 'propwash:freestyle');
        await openCat(p, 'accessory');
        await filterBy(p, MD);
        await sleep(200);
        opts = await listed(p);
        check(same(opts.map((o) => o.id).sort(), Object.keys(MD_PARTS).sort()), `${where}: filter Mob Defense shows its three accessories (${opts.map((o) => o.id)})`);
        for (const [id, want] of Object.entries(MD_PARTS)) {
          const o = opts.find((x) => x.id === id);
          check(o && o.mount === want.slot && o.facts.includes(`${want.mass}`) && !o.bad, `${where}: ${id} under the ${want.slot} mount, ${want.mass} g, fits (${o && JSON.stringify(o)})`);
          check(o && o.badge === SHORT[MD], `${where}: ${id} badge “${SHORT[MD]}” (${o && o.badge})`);
          await preset(p, 'propwash:freestyle');
          check(await choose(p, 'accessory', id), `${where}: ${id} picked`);
          const d = await drawnAll(p);
          check(d && d.ids.includes(id) && d.missing.length === 0, `${where}: ${id} drawn with its model (${d && d.missing})`);
          if (SHOTS && lang === 'en' && width === 1280) check(await snapshotTo(p, path.join(SHOTS, `md-${id.split(':')[1]}.png`)), `${where}: picture with ${id}`);
        }
        await choose(p, 'frame', 'propwash:whoop_65');
        await openCat(p, 'accessory');
        await filterBy(p, 'all');
        opts = await listed(p);
        check(!opts.some((o) => o.id === 'mobdefense:dispenser_mount' && !o.bad), `${where}: on the 65 mm whoop the dispenser does not fit (no front mount)`);
        check(p.errors.length === 0, `${where}: no console errors (${p.errors.slice(0, 2).join(' | ')})`);
        await p.close();
      }
    }
    // The panel “Check camera drone” row by row like CameraCheckScreen (finding AUTO42-1): the review's code (tour frame,
    // FPV stack, no gimbal) and a nav board on the long range frame without and with a gimbal (no camera frame).
    const lrNav = { ...catalog.presetBuild('propwash:long_range'), stack: 'camdrones:nav_fc_pro' };
    const codeOf = (build) => attempt(() => catalog.encode({ build, paint: null, tune: null, osd: null, name: null }));
    const camCases = [
      { label: 'tour frame, FPV stack, no gimbal', code: WRONG_NAV_CODE, complete: false, hint: false,
        rows: { nav_fc: ['wrong', [['wrongNav', 'propwash:stack_30'], ['advice', 'camdrones:nav_fc_pro']]], gimbal: ['missing', [['advice', 'camdrones:gimbal_tour']]] } },
      { label: 'nav board on the long range frame', code: codeOf(lrNav), complete: false, hint: true, rows: { gimbal: ['missing', []] } },
      { label: 'nav board and gimbal on the long range frame', code: codeOf({ ...lrNav, accessories: { front: 'camdrones:gimbal_tour' } }), complete: true, hint: false,
        rows: { nav_fc: ['fitted', null], gimbal: ['fitted', null] } },
    ];
    for (const lang of ['en', 'de']) {
      const p = await b.page({ lang });
      for (const c of camCases) {
        const where = `camera check ${lang}: ${c.label}`;
        if (!check(typeof c.code === 'string' && c.code.startsWith('PW3-'), `${where}: code (${c.code})`)) continue;
        await p.open(`/configurator/#${c.code}`, { width: 1280, lang, ready: CFG_READY });
        loads++;
        await sleep(300);
        const panel = await p.evaluate(`(() => {
          const n = document.querySelector('[data-camdrone]');
          if (!n || n.hidden) return null;
          return {
            status: (n.querySelector('.camdrone__status') || {}).textContent || '',
            hints: [...n.querySelectorAll('.camdrone__hint')].map((h) => h.textContent),
            rows: [...n.querySelectorAll('.camdrone__roles li')].map((li) => ({ role: li.dataset.role, state: li.dataset.state,
              notes: [...li.querySelectorAll('.camdrone__part')].map((s) => s.textContent) })),
          };
        })()`);
        if (!check(panel, `${where}: the panel “${text('camdrones.check.title', lang)}” is shown`)) continue;
        const status = text(c.complete ? 'camdrones.check.complete' : 'camdrones.check.incomplete', lang);
        check(flat(panel.status) === flat(status), `${where}: “${status}” (${flat(panel.status)})`);
        const noFrame = flat(text('camdrones.check.no_camera_frame', lang));
        const hinted = panel.hints.map(flat).includes(noFrame);
        check(hinted === c.hint, `${where}: hint “No camera frame” ${c.hint ? 'shown' : 'not shown'}, like the game (${JSON.stringify(panel.hints.map(flat))})`);
        const recommended = flat(fill(text('camdrones.check.recommended', lang), { x: '' }));
        for (const [role, [state, notes]] of Object.entries(c.rows)) {
          const row = panel.rows.find((x) => x.role === role);
          if (!check(row && row.state === state, `${where}: ${role} ${state} (${row && row.state})`)) continue;
          if (!notes) continue;
          const want = notes.map(([key, part]) => flat(fill(text(`camdrones.check.${key}`, lang), { x: catalog.partName(part, lang) })));
          const got = row.notes.map(flat);
          check(want.length ? same(got.filter((g) => want.includes(g)), want) : got.length === 0,
            `${where}: ${role} – ${JSON.stringify(want)}${want.length > 1 ? ' in this order' : ''}, like the game (${JSON.stringify(got)})`);
          check(!got.some((s) => s.startsWith(recommended)), `${where}: ${role} – no “${recommended}…” (only next to an accepted other part)`);
        }
      }
      check(p.errors.length === 0, `camera check ${lang}: no console errors (${p.errors.slice(0, 2).join(' | ')})`);
      await p.close();
    }

    // A code with all three add-ons opens complete; with Camera Drones switched off it names the add-on like the game.
    for (const lang of ['en', 'de']) {
      const where = `link ${lang}`;
      const p = await b.page({ lang });
      await p.send('Page.addScriptToEvaluateOnNewDocument', { source: VIEWER_HOOK });
      await p.open(`/configurator/#${all3.code}`, { width: 1280, lang, ready: CFG_READY });
      loads++;
      const slots = await p.evaluate("[...document.querySelectorAll('[data-slots] .slot')].map((s) => ({ cat: s.dataset.cat, bad: s.classList.contains('is-bad') }))");
      check(slots.length === 7 && slots.every((s) => !s.bad || s.cat === 'accessory'), `${where}: all three add-ons – every part known (${JSON.stringify(slots)})`);
      const d = await drawnAll(p);
      check(d && d.missing.length === 0 && ['camdrones:gimbal_tour', 'mobdefense:rocket_booster', 'justmoreparts:m2207_1500'].every((id) => d.ids.includes(id)), `${where}: drawn with the models of all three add-ons (${d && d.missing})`);
      check((await p.evaluate("document.querySelector('[data-code]').textContent")).trim() === all3.code, `${where}: the page writes the same code as the game`);
      const off = await p.evaluate(`(() => {
        const sw = document.querySelector('[data-addon-item="${CAM}"] [role="switch"], [data-addon-item="${CAM}"] input[type="checkbox"]');
        if (!sw) return false;
        sw.click();
        return true;
      })()`);
      check(off, `${where}: Camera Drones has a switch in the add-on bar`);
      await sleep(900);
      await p.open(`/configurator/#${cam.code}`, { width: 1280, lang, ready: CFG_READY, blank: false });
      const line = await p.evaluate("(() => { const n = document.querySelector('.addon-line'); return n ? { text: n.textContent.replace(/\\s+/g, ' ').trim(), links: [...n.querySelectorAll('a')].map((a) => a.href) } : null; })()");
      note(`${where}: hint ${line ? line.text : '(none)'}`);
      if (line) {
        check(line.text.includes(NAMES[CAM]) && line.text.includes('1.0.0') && line.text.includes('CurseForge'), `${where}: the hint names ${NAMES[CAM]} 1.0.0 and CurseForge (${line.text})`);
        check(line.links.includes(HOMEPAGE[CAM]), `${where}: the CurseForge page of the code is a link (${line.links})`);
      }
      check(p.errors.length === 0, `${where}: no console errors (${p.errors.slice(0, 2).join(' | ')})`);
      await p.close();
    }
  } finally {
    await b.close();
  }
  return loads;
}

async function main() {
  catalogChecks();
  await cameraChecks();
  vectorChecks();
  textChecks();
  let loads = 0;
  if (flag('--no-browser')) note('--no-browser: the pages are not checked');
  else loads = await browser();
  finish(`${catalog.parts.length} parts, ${vectors.length} add-on codes of the game${loads ? `, ${loads} page loads` : ''}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
