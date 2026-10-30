#!/usr/bin/env node
// VTX antennas at the frame's antenna holder (Propwash 0.6.0 after F-ANTENNA3-1: AntennaRules, AntennaGeometry,
// AntennaMask, antenna_anchor of a frame and antenna of a VTX in the web export; the "_antenna" models and the anchor
// "antenna" in drone_layout.json of the core frames are gone):
//   - rules (assets/js/configurator/antenna.js): for every VTX of tools/fixtures/antenna-export (the four core VTX of
//     Propwash c23e9188 and the seven of Just More Parts 1.2.0-dev.1, as /propwash webexport writes them) kind, count,
//     length and cap derived from its values equal the export's antenna; for every frame of that export
//     (frames.json) the fallback holder equals the export's antenna_anchor where the frame has none of its own; an
//     add-on's own antenna and antenna_anchor win, invalid ones fall back
//   - the build tool (build-configurator-models.mjs) on the fixture: no VTX has an antenna variant any more, every VTX
//     model lists the faces the game leaves out (AntennaMask: faces of "antenna…" elements not inside another
//     element) – none for the core VTX, for the Just More Parts VTX as many as the game leaves out in its own self
//     test (antenne: Antennen-Elemente der Add-on-VTX ausgelassen), each of them on an antenna element
//   - the jar path (catalog-build.js, partjson.js): the same model files and colours as the build tool and the export;
//     a frame's antenna_anchor and a VTX's antenna are read like PartJson (tilt 35° by default, errors and warnings
//     like the mod) and exported like PartData (antenna_anchor after accessory_anchors, antenna last)
//   - assembly: every frame with every VTX of the fixture has exactly one antenna piece – role antenna, the VTX's id,
//     category video, drawn from shapes (AntennaGeometry) at the holder of the frame (drone_layout.json "antenna" only
//     as an override), with its tilt and not turned by the camera angle, behind and above the holder – and the video
//     piece leaves out the masked faces; a VTX model without the mask (data of an older export, antennas in the
//     model) gets no antenna piece, so no antenna is drawn twice; a VTX without a model still gets its antenna
//   - geometry: holder, SMA and the cap of every kind (whip, stubby, lollipop, pagoda, patch) with the sizes of
//     AntennaGeometry, one antenna leaning 12° to the left, a pair 25° in a V, tips at the length along the axis
//   - paint: the antenna slot starts with the colour of the cap (PaintPicker.defaults, before every model group),
//     is offered for every VTX, a pick on the antenna paints it, its colour recolours the caps only
//   - headless Chrome, English and German, 1280 and 390 px, with the fixture's catalog data and VTX models on their way
//     to the page: whoop, 5″ race, 5″ freestyle with HD and 7″ long range (Just More Parts VTX): one antenna mesh at
//     the holder, the masked video unit, a hover and a click on the antenna pick “Video” and the antenna slot, the
//     camera preview hides it like the video unit; with --shots also the drone from behind for the comparison with
//     the game's sheets (antenna_rear_<frame>_*.png)
//
//   node tools/test-configurator-antenna.mjs [--no-browser] [--shots <dir>] [--chrome <path>]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, CHROME, serve, launch, cdp, sleep } from './headless-chrome.mjs';
import { createCatalog } from '../assets/js/configurator/data.js';
import { assemble, frameLayout, pieceCategory } from '../assets/js/configurator/assembly.js';
import { resources, modelOf, partModel, hex, exportData } from '../assets/js/configurator/catalog-build.js';
import { decodePart } from '../assets/js/configurator/partjson.js';
import { paintDefaults, paintAvailable, groupsOf, pieceSlots, rgbOf } from '../assets/js/configurator/paint.js';
import { PAINT_SLOTS } from '../assets/js/configurator/sharecode.js';
import { entry } from '../assets/js/configurator/i18n.js';

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
};
const BROWSER = !argv.includes('--no-browser');
const SHOTS = arg('--shots') ? path.resolve(arg('--shots')) : null;

let checks = 0;
const failures = [];
function check(ok, message) {
  checks++;
  if (!ok) failures.push(message);
  return !!ok;
}
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const near = (a, b, eps = 1e-9) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < eps);

// The module of the antennas; without it every check below fails instead of the whole test.
let A = null;
try {
  A = await import('../assets/js/configurator/antenna.js');
} catch (e) {
  check(false, `assets/js/configurator/antenna.js: ${e.message}`);
}
const call = (name, ...args) => {
  if (!A || typeof A[name] !== 'function') return null;
  try {
    return A[name](...args);
  } catch (e) {
    check(false, `${name}: ${e.message}`);
    return null;
  }
};

const FIXTURE = path.join(ROOT, 'tools/fixtures/antenna-export');
const NAMESPACES = ['propwash', 'justmoreparts'];
const fixtureParts = NAMESPACES.flatMap((ns) => readJson(path.join(FIXTURE, ns, 'parts.json')));
const fixtureFrames = readJson(path.join(FIXTURE, 'frames.json'));
const VTX = fixtureParts.map((p) => p.id);
const CORE_VTX = VTX.filter((id) => id.startsWith('propwash:'));
// The core frames' own holders (frame files of Propwash, F-ANTENNA3-1), tilt 35°.
const CORE_ANCHORS = {
  'propwash:whoop_65': [0, 23.2, 9.2], 'propwash:cinewhoop_3': [0, 24, 34], 'propwash:freestyle_5': [0, 28.5, 50],
  'propwash:race_5': [0, 20, 44], 'propwash:long_range_7': [0, 32.5, 62],
};
// What the game leaves out of the Just More Parts VTX (selftest antenne:, F-ANTENNA3-1, JMP 1.2.0-dev.1): antenna
// elements, faces left out, faces kept.
const MASKED = {
  'justmoreparts:analog_whoop_25mw': [2, 11, 72], 'justmoreparts:analog_race_800': [3, 17, 81], 'justmoreparts:analog_lr_1600': [3, 17, 93],
  'justmoreparts:digital_micro': [2, 11, 57], 'justmoreparts:digital_low_latency': [4, 22, 57], 'justmoreparts:digital_hd_pro': [6, 32, 95],
  'justmoreparts:digital_lr': [6, 32, 89],
};
const local = (id) => id.split(':')[1];
const nsOf = (id) => id.split(':')[0];
const rawModel = (id, suffix = '') => readJson(path.join(FIXTURE, nsOf(id), `assets/${nsOf(id)}/models/part/video/${local(id)}${suffix}.json`));
const exportAntenna = (p) => ({ count: p.data.antenna.count, lengthMm: p.data.antenna.length_mm, cap: p.data.antenna.cap });
const without = (part, key) => ({ ...part, data: Object.fromEntries(Object.entries(part.data).filter(([k]) => k !== key)) });

// ---------------------------------------------------------------------------------------------------------------
// Rules against the export

for (const p of fixtureParts) {
  const values = call('videoValues', without(p, 'antenna'));
  check(p.data.antenna && p.data.antenna.derived === true, `${p.id}: the export derives its antenna`);
  check(values && call('antennaKind', values) === p.data.antenna.kind, `${p.id}: kind ${values && call('antennaKind', values)} = export ${p.data.antenna.kind}`);
  const derived = values && call('derivedAntenna', values);
  check(same(derived, exportAntenna(p)), `${p.id}: derived ${JSON.stringify(derived)} = export ${JSON.stringify(exportAntenna(p))}`);
  const own = call('videoAntenna', p);
  check(own && same({ count: own.count, lengthMm: own.lengthMm, cap: own.cap }, exportAntenna(p)) && own.kind === p.data.antenna.kind,
    `${p.id}: videoAntenna from the export's antenna (${JSON.stringify(own)})`);
}
let explicitFrames = 0;
for (const f of fixtureFrames) {
  const anchor = f.data.antenna_anchor;
  const fallback = call('fallbackAnchor', call('frameValues', without(f, 'antenna_anchor')) || {});
  if (anchor.explicit) {
    explicitFrames++;
    check(near(anchor.pos, CORE_ANCHORS[f.id] || []) && anchor.tilt_deg === 35, `${f.id}: own holder of the frame file ${anchor.pos}`);
  } else {
    check(fallback && same([fallback.x, fallback.y, fallback.z], anchor.pos) && fallback.tiltDeg === anchor.tilt_deg,
      `${f.id}: fallback holder ${fallback && [fallback.x, fallback.y, fallback.z]} = export ${anchor.pos}`);
  }
  const used = call('frameAntennaAnchor', f);
  check(used && same(used.position, anchor.pos) && used.tilt === anchor.tilt_deg, `${f.id}: frameAntennaAnchor ${used && used.position} = export ${anchor.pos}`);
  const old = call('frameAntennaAnchor', without(f, 'antenna_anchor'));
  check(old && fallback && same(old.position, [fallback.x, fallback.y, fallback.z]) && old.tilt === 35, `${f.id}: without antenna_anchor (older export) the fallback holder`);
}
check(explicitFrames === 5, `frames with an own holder: ${explicitFrames} (the five core frames)`);
{
  const hd = fixtureParts.find((p) => p.id === 'propwash:digital_hd');
  const own = { ...hd, data: { ...hd.data, antenna: { count: 1, length_mm: 70, cap: 'stubby' } } };
  check(same(call('videoAntenna', own), { count: 1, lengthMm: 70, cap: 'stubby', kind: 'hd' }), 'an own antenna of the VTX wins');
  for (const bad of [{ count: 3, length_mm: 70, cap: 'stubby' }, { count: 1, length_mm: 5, cap: 'stubby' }, { count: 1, length_mm: 70, cap: 'dish' }, 'x']) {
    const a = call('videoAntenna', { ...hd, data: { ...hd.data, antenna: bad } });
    check(a && a.count === 2 && a.lengthMm === 90 && a.cap === 'lollipop', `invalid antenna ${JSON.stringify(bad)}: derived instead`);
  }
  const frame = fixtureFrames.find((f) => f.id === 'justmoreparts:lr_7_deadcat');
  const own2 = call('frameAntennaAnchor', { ...frame, data: { ...frame.data, antenna_anchor: { pos: [1, 2, 3], tilt_deg: 20, explicit: true } } });
  check(own2 && same(own2.position, [1, 2, 3]) && own2.tilt === 20, 'an own holder of the frame wins');
}

// ---------------------------------------------------------------------------------------------------------------
// The build tool on the fixture export

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-antenna-'));
execFileSync(process.execPath, [path.join(ROOT, 'tools/build-configurator-models.mjs'), '--export', FIXTURE, '--out', out], { stdio: 'pipe' });
const built = readJson(path.join(out, 'render.json'));
const builtModel = (id) => {
  const file = path.join(out, 'models', nsOf(id), 'video', `${local(id)}.json`);
  return fs.existsSync(file) ? readJson(file) : null;
};
const faceCount = (elements) => elements.reduce((n, e) => n + e[7].filter(Boolean).length, 0);

for (const id of VTX) {
  const m = builtModel(id);
  if (!check(m, `${id}: model file built from the export`)) continue;
  check(!m.variants.antenna && !m.variants.antenna_paint, `${id}: no antenna variant (the "_antenna" models are gone)`);
  const mask = m.variants.base.antenna;
  if (!check(Array.isArray(mask), `${id}: the base variant lists the faces left out for the antennas (got ${JSON.stringify(mask)})`)) continue;
  const total = faceCount(m.variants.base.el);
  const raw = rawModel(id);
  const owners = [];
  raw.elements.forEach((e) => {
    for (const dir of ['down', 'up', 'north', 'south', 'west', 'east']) if (e.faces && e.faces[dir]) owners.push(e.name || '');
  });
  check(owners.length === total, `${id}: ${total} faces counted like the model's elements`);
  check(mask.every((i, k) => Number.isInteger(i) && i >= 0 && i < total && (k === 0 || i > mask[k - 1])), `${id}: face indices in order`);
  check(mask.every((i) => /^antenna/i.test(owners[i])), `${id}: every face left out lies on an antenna element`);
  const antennaElements = raw.elements.filter((e) => /^antenna/i.test(e.name || '')).length;
  if (MASKED[id]) {
    const [elements, hidden, kept] = MASKED[id];
    check(antennaElements === elements && mask.length === hidden && total - mask.length === kept,
      `${id}: ${antennaElements} antenna elements, ${mask.length} faces left out, ${total - mask.length} kept – the game: ${elements}, ${hidden}, ${kept}`);
  } else {
    check(antennaElements === 0 && mask.length === 0, `${id}: core VTX without antenna elements (${antennaElements}), nothing left out`);
  }
  const paint = rawModel(id, '_paint');
  check(same(call('antennaFaces', paint), mask), `${id}: the paint model leaves out the same faces`);
}
for (const id of Object.keys(CORE_ANCHORS)) {
  check(built.layouts[id] && built.layouts[id].antenna === undefined, `render.json ${id}: no anchor "antenna" in drone_layout.json any more`);
}

// ---------------------------------------------------------------------------------------------------------------
// The jar path: the same files read in the browser (catalog-build.js), the part files read like PartJson

for (const ns of NAMESPACES) {
  const files = new Map();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, e.name);
      if (e.isDirectory()) walk(file);
      else files.set(path.relative(path.join(FIXTURE, ns), file).split(path.sep).join('/'), new Uint8Array(fs.readFileSync(file)));
    }
  };
  walk(path.join(FIXTURE, ns, 'assets'));
  const res = resources(files);
  for (const p of fixtureParts.filter((q) => nsOf(q.id) === ns)) {
    const m = modelOf({ id: p.id, kind: p.category, basics: { visual: { renderModel: null } } }, res);
    check(same(m.variants, p.model.variants), `jar path ${p.id}: variants ${JSON.stringify(m.variants)} as the export`);
    check(same(m.textures, p.model.textures), `jar path ${p.id}: textures as the export`);
    check(m.paintable === p.paint.paintable_model, `jar path ${p.id}: paintable as the export`);
    const colors = Object.fromEntries(Object.entries(m.baseColors).map(([slot, rgb]) => [slot, hex(rgb)]));
    check(same(colors, p.paint.default_colors), `jar path ${p.id}: colours ${JSON.stringify(colors)} as the export ${JSON.stringify(p.paint.default_colors)}`);
    let model = null;
    try {
      model = partModel(p, res);
    } catch (e) {
      check(false, `jar path ${p.id}: model file (${e.message})`);
    }
    const file = path.join(out, 'models', ns, 'video', `${local(p.id)}.json`);
    check(model && fs.existsSync(file) && `${JSON.stringify(model)}\n` === fs.readFileSync(file, 'utf8'), `jar path ${p.id}: model file byte for byte as the build tool's`);
  }
}
{
  const frameJson = {
    format: 1, mass_g: 120, wheelbase_mm: 225, max_prop_mm: 130, motor_mounts: ['propwash:m22xx'], stack_mounts: ['propwash:stack_30x30'],
    aero: { frontal_area_m2: 0.012, drag_coefficient: 1.1 }, battery_fit: { cells: [4, 6], max_mass_g: 260 },
  };
  const withAnchor = (anchor) => decodePart('frame', 'addon:frame_a', JSON.stringify({ ...frameJson, antenna_anchor: anchor }));
  let r = withAnchor({ pos: [0, 30, 52.5], tilt_deg: 40 });
  const g = r.definition && r.definition.geometry;
  check(g && same(g.antennaAnchor, { x: 0, y: 30, z: 52.5, tiltDeg: 40, lengthMm: 0 }) && !r.warnings.length && !r.errors.length,
    `PartJson antenna_anchor: read as the frame's holder (${JSON.stringify(g && g.antennaAnchor)}, ${JSON.stringify(r.warnings)})`);
  r = withAnchor({ pos: [0, 30, 52.5] });
  check(r.definition && r.definition.geometry.antennaAnchor && r.definition.geometry.antennaAnchor.tiltDeg === 35, 'PartJson antenna_anchor: tilt 35° by default');
  r = withAnchor({ tilt_deg: 20 });
  check(!r.definition && r.errors.some((e) => e.includes('antenna_anchor.pos')), `PartJson antenna_anchor without pos: error (${JSON.stringify(r.errors)})`);
  r = withAnchor({ pos: [0, 30, 52.5], length_mm: 3 });
  check(r.definition && r.warnings.some((w) => w.includes('antenna_anchor.length_mm')), `PartJson antenna_anchor: unknown field warned (${JSON.stringify(r.warnings)})`);
  r = decodePart('frame', 'addon:frame_b', JSON.stringify(frameJson));
  check(r.definition && r.definition.geometry.antennaAnchor === null, 'PartJson: a frame without antenna_anchor has none of its own');
  const data = r.definition ? exportData(r.definition) : {};
  const keys = Object.keys(data);
  check(keys.indexOf('antenna_anchor') === keys.indexOf('accessory_anchors') + 1, `PartData: antenna_anchor right after accessory_anchors (${keys})`);
  const fb = call('fallbackAnchor', { wheelbaseMm: 225, batteryOnTop: true, batteryPlateMm: r.definition ? r.definition.geometry.batteryPlateMm : 0, electronicsMm: 0, cameraY: null, ducted: false });
  check(fb && same(data.antenna_anchor, { pos: [fb.x, fb.y, fb.z], tilt_deg: 35, explicit: false }), `PartData antenna_anchor: the fallback holder (${JSON.stringify(data.antenna_anchor)})`);
  const own = withAnchor({ pos: [0, 30, 52.5], tilt_deg: 40 });
  check(own.definition && same(exportData(own.definition).antenna_anchor, { pos: [0, 30, 52.5], tilt_deg: 40, explicit: true }), 'PartData antenna_anchor: the frame\'s own holder, explicit');

  const videoJson = { format: 1, mass_g: 9, link: 'digital', latency_ms: 28, range_blocks: 800, image_quality: 0.9, vtx_power_mw: 500 };
  const withAntenna = (antenna) => decodePart('video', 'addon:vtx_a', JSON.stringify(antenna === undefined ? videoJson : { ...videoJson, antenna }));
  r = withAntenna({ count: 2, length_mm: 80, cap: 'patch' });
  check(r.definition && same(r.definition.antenna, { count: 2, lengthMm: 80, cap: 'patch' }) && !r.warnings.length, `PartJson antenna: read (${JSON.stringify(r.definition && r.definition.antenna)})`);
  let d = r.definition ? exportData(r.definition) : {};
  check(Object.keys(d).at(-1) === 'antenna' && same(d.antenna, { count: 2, length_mm: 80, cap: 'patch', kind: 'long_range', derived: false }),
    `PartData antenna: the VTX's own, last (${JSON.stringify(d.antenna)})`);
  r = withAntenna({ length_mm: 80, cap: 'PATCH' });
  check(r.definition && same(r.definition.antenna, { count: 1, lengthMm: 80, cap: 'patch' }), 'PartJson antenna: count 1 by default, cap in any case');
  r = withAntenna(undefined);
  d = r.definition ? exportData(r.definition) : {};
  check(r.definition && r.definition.antenna === null && same(d.antenna, { count: 2, length_mm: 135, cap: 'pagoda', kind: 'long_range', derived: true }),
    `PartData antenna without one of its own: derived (${JSON.stringify(d.antenna)})`);
  for (const [bad, what] of [[{ count: 1, cap: 'patch' }, 'antenna.length_mm'], [{ count: 1, length_mm: 80, cap: 'dish' }, 'antenna.cap'],
    [{ count: 3, length_mm: 80, cap: 'patch' }, 'Antennen-Anzahl'], [{ count: 1, length_mm: 300, cap: 'patch' }, 'Antennen-Länge']]) {
    r = withAntenna(bad);
    check(!r.definition && r.errors.some((e) => e.includes(what)), `PartJson antenna ${JSON.stringify(bad)}: error on ${what} (${JSON.stringify(r.errors)})`);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Assembly with the fixture's data (antenna_anchor, antenna) in the site's catalog and the fixture's VTX models

const siteJson = readJson(path.join(ROOT, 'assets/data/configurator/catalog.json'));
const fixtureData = new Map([...fixtureFrames, ...fixtureParts].map((p) => [p.id, p.data]));
const withFixtureData = (json) => ({
  ...json,
  parts: json.parts.map((p) => {
    const data = fixtureData.get(p.id);
    if (!data) return p;
    if (p.category === 'frame') return { ...p, data: { ...p.data, antenna_anchor: data.antenna_anchor } };
    return { ...p, data: { ...p.data, antenna: data.antenna } };
  }),
});
const catalog = createCatalog(withFixtureData(siteJson));
const oldCatalog = createCatalog(siteJson);
const render = readJson(path.join(ROOT, 'assets/data/configurator/render.json'));
const siteModels = new Map();
const siteModel = (id) => {
  if (!siteModels.has(id)) {
    const part = oldCatalog.part(id);
    const file = part && path.join(ROOT, 'assets/data/configurator/models', nsOf(id), part.category, `${local(id)}.json`);
    siteModels.set(id, file && fs.existsSync(file) ? readJson(file) : null);
  }
  return siteModels.get(id);
};
const fixtureModels = new Map(VTX.map((id) => [id, builtModel(id)]));
const env = { catalog, render, model: (id) => (fixtureModels.has(id) ? fixtureModels.get(id) : siteModel(id)) };
const oldEnv = { catalog: oldCatalog, render, model: siteModel };
const anchorOf = (id) => fixtureFrames.find((f) => f.id === id).data.antenna_anchor;

const base = catalog.presetBuild('propwash:freestyle');
let combos = 0;
for (const frame of catalog.partsIn('frame')) {
  const anchor = anchorOf(frame.id);
  const layout = frameLayout(frame, catalog, render);
  check(near(layout.antenna, anchor.pos) && layout.antennaTilt === anchor.tilt_deg, `${frame.id}: layout holder ${layout.antenna} / ${layout.antennaTilt}° = export ${anchor.pos}`);
  for (const id of VTX) {
    const label = `${frame.id} + ${id}`;
    const build = { ...base, frame: frame.id, video: id, accessories: {} };
    const a = assemble(build, env);
    const antennas = a.pieces.filter((p) => p.role === 'antenna');
    if (!check(antennas.length === 1, `${label}: one antenna piece (got ${antennas.length})`)) continue;
    const piece = antennas[0];
    const video = a.pieces.find((p) => p.role === 'video');
    const spec = exportAntenna(fixtureParts.find((p) => p.id === id));
    check(piece.id === id && pieceCategory(piece) === 'video' && piece.procedural === 'antenna' && !piece.variant, `${label}: antenna of the VTX, category video, drawn from shapes`);
    check(near(piece.position, anchor.pos) && piece.tilt === anchor.tilt_deg && piece.wheelbase === frame.data.wheelbase_mm,
      `${label}: antenna at the holder ${piece.position} / ${piece.tilt}°, expected ${anchor.pos}`);
    check(piece.antenna && same({ count: piece.antenna.count, lengthMm: piece.antenna.lengthMm, cap: piece.antenna.cap }, spec), `${label}: antenna ${JSON.stringify(piece.antenna)}`);
    check(!piece.tiltX && !piece.spinY && !piece.stretchX, `${label}: not turned by the camera angle (tilt ${piece.tiltX})`);
    const tip = call('antennaTip', piece.antenna, piece.tilt, piece.wheelbase, 0);
    check(tip && tip[1] > 0 && tip[2] > call('antennaPieces', piece.antenna, piece.tilt, piece.wheelbase)[0].matrix[11], `${label}: the antenna stands up and back from its holder`);
    const mask = fixtureModels.get(id).variants.base.antenna || [];
    check(video && (mask.length ? same(video.hideFaces, mask) : !video.hideFaces), `${label}: the video unit leaves out ${mask.length} faces (got ${video && JSON.stringify(video.hideFaces)})`);
    const old = assemble(build, oldEnv);
    check(!old.pieces.some((p) => p.role === 'antenna' || p.hideFaces) && old.pieces.length === a.pieces.length - 1,
      `${label}: with the site's older VTX model (antennas in it) no second antenna`);
    combos++;
  }
}
{
  const noModel = { ...env, model: (id) => (id === 'propwash:digital_hd' ? null : env.model(id)) };
  const a = assemble({ ...base, video: 'propwash:digital_hd', accessories: {} }, noModel);
  check(a.pieces.filter((p) => p.role === 'antenna').length === 1, 'VTX without a model: its antenna is drawn at the holder all the same');
  const frame = catalog.part('propwash:freestyle_5');
  for (const [point, expected] of [[[0, 31, 47], [0, 31, 47]], ['x', anchorOf(frame.id).pos], [[0, 3000, 1], anchorOf(frame.id).pos], [[1, 2], anchorOf(frame.id).pos]]) {
    const layouts = { ...render.layouts, [frame.id]: { ...render.layouts[frame.id], antenna: point } };
    const l = frameLayout(frame, catalog, { ...render, layouts });
    check(near(l.antenna, expected) && l.antennaTilt === 35, `drone_layout.json "antenna" ${JSON.stringify(point)}: holder at ${l.antenna} (expected ${expected})`);
  }
  // An older export: no antenna_anchor and no antenna in the catalog – the holder and the antenna from the rules.
  const lr = oldCatalog.part('justmoreparts:lr_7_deadcat');
  check(near(frameLayout(lr, oldCatalog, render).antenna, anchorOf(lr.id).pos), 'older catalog: the fallback holder of an add-on frame equals the export');
  const a2 = assemble({ ...base, frame: 'propwash:freestyle_5', video: 'justmoreparts:digital_lr', accessories: {} }, { ...oldEnv, model: env.model });
  const p2 = a2.pieces.find((p) => p.role === 'antenna');
  check(p2 && p2.antenna.count === 2 && p2.antenna.lengthMm === 150 && p2.antenna.cap === 'pagoda', `older catalog: the antenna derived from the VTX (${JSON.stringify(p2 && p2.antenna)})`);
}
console.log(`assembly: ${combos} frame and VTX combinations`);

// ---------------------------------------------------------------------------------------------------------------
// Geometry (AntennaGeometry)

{
  const PARTS = { whip: 4, stubby: 3, lollipop: 6, pagoda: 7, patch: 3 };
  for (const cap of Object.keys(PARTS)) {
    for (const count of [1, 2]) {
      const antenna = { count, lengthMm: 100, cap };
      const pieces = call('antennaPieces', antenna, 35, 225) || [];
      check(pieces.length === 2 + count * PARTS[cap], `${cap} × ${count}: ${pieces.length} shapes, expected ${2 + count * PARTS[cap]}`);
      check(pieces.every((p) => (p.kind === 'box' || p.kind === 'cylinder') && p.matrix.length === 16 && p.matrix.every(Number.isFinite)), `${cap} × ${count}: boxes and cylinders`);
      check(pieces.filter((p) => p.name === 'mount').length === 2 && pieces.filter((p) => p.name === 'sma').length === count, `${cap} × ${count}: holder and SMA nuts`);
      const lean = count === 1 ? 12 : 25;
      const offset = Math.min(7, 0.06 * 225);
      for (let i = 0; i < count; i++) {
        const side = count === 1 || i === 0 ? -1 : 1;
        const r = Math.PI / 180;
        // Rx(35°) · Rz(−side · lean) · (0, 1, 0)
        const axis = [side * Math.sin(lean * r), Math.cos(lean * r) * Math.cos(35 * r), Math.cos(lean * r) * Math.sin(35 * r)];
        const tip = call('antennaTip', antenna, 35, 225, i);
        const expected = [side * offset + 100 * axis[0], 0.8 + 100 * axis[1], 4.5 + 100 * axis[2]];
        check(tip && near(tip, expected, 1e-6), `${cap} × ${count} antenna ${i}: tip ${tip} = ${expected} (lean ${lean}° to the ${side < 0 ? 'left' : 'right'}, 35° back)`);
      }
    }
  }
  check(call('antennaOffset', 65) === 0.06 * 65 && call('antennaOffset', 500) === 7, 'pair distance: 0.06 × wheelbase, at most 7 mm each side');
  const light = A ? A.ANTENNA_COLORS.capLight : -1;
  const red = A ? A.ANTENNA_COLORS.cap : -2;
  check(['whip', 'pagoda'].every((cap) => call('capColor', { cap }) === light) && ['stubby', 'lollipop', 'patch'].every((cap) => call('capColor', { cap }) === red),
    'cap colour: light for whip and pagoda, red for the others');
  const pieces = call('antennaPieces', { count: 1, lengthMm: 138, cap: 'pagoda' }, 35, 300) || [];
  const painted = call('paintedAntenna', pieces, 0x123456) || [];
  check(painted.length === pieces.length && painted.every((p, i) => (pieces[i].color === light || pieces[i].color === red ? p.color === 0x123456 : p.color === pieces[i].color))
    && painted.some((p) => p.color === 0x123456), 'paint recolours the caps of the antenna and nothing else');
}

// ---------------------------------------------------------------------------------------------------------------
// Paint

for (const id of VTX) {
  const label = `freestyle + ${id}`;
  const a = assemble({ ...base, video: id, accessories: {} }, env);
  const modelOfPiece = (pid) => env.model(pid);
  const piece = a.pieces.find((p) => p.role === 'antenna');
  const video = a.pieces.find((p) => p.role === 'video');
  if (!check(piece, `${label}: antenna piece`)) continue;
  const defaults = paintDefaults(a.pieces, modelOfPiece, render);
  const capHex = hex(call('capColor', piece.antenna) || 0);
  check(defaults.antenna === capHex, `${label}: default antenna colour ${defaults.antenna} = the cap's ${capHex}`);
  const cameraGroup = (fixtureModels.get(id).variants.paint.groups || []).find(([channel]) => channel === 'camera');
  check(cameraGroup && defaults.camera === cameraGroup[1], `${label}: default camera colour ${defaults.camera}`);
  const available = paintAvailable(a.pieces, modelOfPiece, render, PAINT_SLOTS);
  check(available.has('antenna') && available.has('camera'), `${label}: antenna and camera slots offered`);
  const slots = pieceSlots(piece, groupsOf(piece, env.model(id), render));
  check(slots.main === 'antenna' && slots.groups.length === 0, `${label}: a pick on the antenna paints the antenna slot (${JSON.stringify(slots)})`);
  const videoSlots = pieceSlots(video, groupsOf(video, env.model(id), render));
  check(videoSlots.main === 'camera', `${label}: the video unit paints the camera slot (${JSON.stringify(videoSlots)})`);
}
{
  const a = assemble({ ...base, video: 'propwash:analog_race', accessories: {} }, oldEnv);
  const defaults = paintDefaults(a.pieces, siteModel, render);
  const group = (siteModel('propwash:analog_race').variants.paint.groups || []).find(([channel]) => channel === 'antenna');
  check(!group || defaults.antenna === group[1], 'older VTX model: the antenna slot keeps the colour of its antenna group');
  check(rgbOf('#c83232') === 0xc83232, 'colours');
}

// ---------------------------------------------------------------------------------------------------------------
// Headless Chrome

const VIEWS = [[], [['ArrowLeft', 26]], [['ArrowLeft', 13], ['ArrowDown', 6]], [['ArrowRight', 26]], [['ArrowLeft', 26], ['ArrowDown', 11]], [['ArrowUp', 8]]];
// The game's sheets look at the drone obliquely from behind (AntennaShowcase.REAR_YAW 215°).
const REAR = { azimuth: 215, elevation: 22 };

async function browserChecks() {
  const server = await serve();
  const site = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-antenna-chrome-'));
  const { child, ws } = await launch(arg('--chrome') || CHROME, profile);
  const browser = cdp(ws);
  const errors = [];
  try {
    await browser.ready;
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => browser.send(method, params, sessionId);
    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text}: ${expression.slice(0, 120)}`);
      return r.result.value;
    };
    browser.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error' || p.type === 'assert') errors.push(`console.${p.type}: ${p.args.map((x) => x.value ?? x.description).join(' ')}`);
    });
    browser.on('Runtime.exceptionThrown', (p) => errors.push(`exception: ${p.exceptionDetails.exception?.description || p.exceptionDetails.text}`));
    // The fixture's catalog data and VTX models on their way to the page.
    browser.on('Fetch.requestPaused', async (p) => {
      try {
        let text = null;
        if (/\/catalog\.json(\?|$)/.test(p.request.url)) {
          const { body, base64Encoded } = await send('Fetch.getResponseBody', { requestId: p.requestId });
          text = JSON.stringify(withFixtureData(JSON.parse(base64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body)));
        } else {
          const parts = new URL(p.request.url).pathname.split('/');
          const id = `${parts.at(-3)}:${decodeURIComponent(parts.at(-1)).replace(/\.json$/, '')}`;
          if (fixtureModels.has(id)) text = JSON.stringify(fixtureModels.get(id));
        }
        if (text === null) {
          await send('Fetch.continueRequest', { requestId: p.requestId });
          return;
        }
        await send('Fetch.fulfillRequest', {
          requestId: p.requestId, responseCode: 200, body: Buffer.from(text).toString('base64'),
          responseHeaders: [{ name: 'content-type', value: 'application/json' }],
        });
      } catch (e) {
        errors.push(`fetch interception: ${e.message}`);
        await send('Fetch.continueRequest', { requestId: p.requestId }).catch(() => {});
      }
    });
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.bringToFront');
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await send('Fetch.enable', {
      patterns: [
        { urlPattern: '*/assets/data/configurator/catalog.json*', requestStage: 'Response' },
        { urlPattern: '*/assets/data/configurator/models/*/video/*', requestStage: 'Response' },
      ],
    });
    let langScript = null;

    const viewerToTop = () => evaluate("(document.querySelector('[data-viewer]').scrollIntoView({ block: 'start', behavior: 'instant' }), scrollBy({ top: -70, behavior: 'instant' }), true)");
    const canvasRect = () => evaluate(`(() => {
      const r = document.querySelector('[data-viewer-canvas] canvas').getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    })()`);
    const ui = () => evaluate(`(() => {
      const label = document.querySelector('[data-pick-label]');
      const slot = document.querySelector('[data-slots] .slot.is-active');
      return {
        category: slot ? slot.dataset.cat : null,
        targets: [...document.querySelectorAll('[data-paint-row].is-target')].map((r) => r.dataset.paintRow),
        label: label.hidden ? null : { kind: label.querySelector('.viewer__pick-kind')?.textContent || '', name: label.querySelector('.viewer__pick-name')?.textContent || '' },
      };
    })()`);
    const mouse = (type, x, y, pressed) => send('Input.dispatchMouseEvent', {
      type, x, y, button: type === 'mouseMoved' && !pressed ? 'none' : 'left', buttons: pressed ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1, pointerType: 'mouse',
    });
    const touch = (type, points) => send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], i) => ({ x, y, id: i, radiusX: 4, radiusY: 4, force: 1 })) });
    const setTab = (tab) => evaluate(`(document.querySelector('#tab-${tab}').click(), true)`);
    const turn = (view) => evaluate(`(() => {
      const canvas = document.querySelector('[data-viewer-canvas] canvas');
      const press = (key, n) => { for (let i = 0; i < n; i++) canvas.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); };
      press('0', 1);
      ${view.map(([key, n]) => `press('${key}', ${n});`).join('\n')}
      return true;
    })()`);

    /** Canvas point of the antenna (a pick of category video with the antenna slot) in the first view that shows it. */
    async function antennaPoint() {
      for (const view of VIEWS) {
        await turn(view);
        await sleep(150);
        await viewerToTop();
        const p = (await evaluate('window.__viewer.pickPoints()')).find((x) => x.category === 'video' && x.paintSlot === 'antenna');
        if (p) {
          const r = await canvasRect();
          const vp = await evaluate('({ w: innerWidth, h: innerHeight })');
          const at = { x: r.x + p.x, y: r.y + p.y };
          if (at.x > 0 && at.y > 0 && at.x < vp.w && at.y < vp.h) return at;
        }
      }
      return null;
    }

    async function tap(at, viewport) {
      if (viewport.mobile) {
        await touch('touchStart', [[at.x, at.y]]);
        await sleep(40);
        await touch('touchEnd', []);
      } else {
        await mouse('mouseMoved', at.x, at.y, false);
        await sleep(160);
        await mouse('mousePressed', at.x, at.y, true);
        await mouse('mouseReleased', at.x, at.y, false);
      }
      await sleep(150);
    }

    const LOADS = [
      { lang: 'en', frame: 'propwash:freestyle_5', vtx: 'propwash:digital_hd', viewport: { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false } },
      { lang: 'en', frame: 'propwash:race_5', vtx: 'propwash:analog_race', viewport: { width: 390, height: 844, deviceScaleFactor: 3, mobile: true } },
      { lang: 'de', frame: 'propwash:long_range_7', vtx: 'justmoreparts:digital_lr', viewport: { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false } },
      { lang: 'de', frame: 'propwash:whoop_65', vtx: 'propwash:analog_nano', viewport: { width: 390, height: 844, deviceScaleFactor: 3, mobile: true } },
    ];
    for (const { lang, frame, vtx, viewport } of LOADS) {
      const label = `${lang} ${viewport.width} px ${frame} + ${vtx}`;
      const at = lang === 'de' ? 1 : 0;
      if (langScript) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: langScript });
      ({ identifier: langScript } = await send('Page.addScriptToEvaluateOnNewDocument', {
        source: `try { localStorage.setItem('propwash-lang', '${lang}'); } catch (e) {} document.addEventListener('propwash:viewer', (e) => { window.__viewer = e.detail; });`,
      }));
      await send('Emulation.setDeviceMetricsOverride', viewport);
      await send('Emulation.setTouchEmulationEnabled', { enabled: viewport.mobile, maxTouchPoints: viewport.mobile ? 5 : 1 });
      await send('Page.navigate', { url: 'about:blank' });
      await sleep(100);
      const preset = catalog.presets.find((p) => p.id.startsWith('propwash:') && p.build.frame === frame);
      const build = { ...(preset ? catalog.presetBuild(preset.id) : base), frame, video: vtx, accessories: {} };
      const code = catalog.encode({ build, paint: null, tune: null, osd: null, name: null });
      await send('Page.navigate', { url: `${site}/configurator/#${code}` });
      const start = Date.now();
      while (!(await evaluate(`(() => {
        const cfg = document.querySelector('[data-cfg]');
        const v = window.__viewer;
        return !!(cfg && cfg.getAttribute('aria-busy') === 'false' && v && v.current() && v.current().assembly.pieces.length);
      })()`))) {
        if (Date.now() - start > 30000) throw new Error(`${label}: configurator did not finish loading within 30 s`);
        await sleep(200);
      }
      await evaluate('document.fonts.ready.then(() => true)');
      await sleep(600);
      await viewerToTop();

      const spec = exportAntenna(fixtureParts.find((p) => p.id === vtx));
      const pieces = await evaluate('window.__viewer.current().assembly.pieces');
      const piece = pieces.find((p) => p.role === 'antenna');
      check(piece && piece.id === vtx && piece.procedural === 'antenna' && near(piece.position, CORE_ANCHORS[frame]) && piece.tilt === 35 && !piece.tiltX
        && piece.antenna.count === spec.count && piece.antenna.cap === spec.cap, `${label}: antenna piece at the holder of the frame (got ${JSON.stringify(piece)})`);
      const mask = fixtureModels.get(vtx).variants.base.antenna || [];
      const videoPiece = pieces.find((p) => p.role === 'video');
      check(mask.length ? same(videoPiece.hideFaces, mask) : !videoPiece.hideFaces, `${label}: the video unit leaves out ${mask.length} faces`);
      const meshes = () => evaluate('window.__viewer.highlights()');
      let drawn = await meshes();
      const antennaMeshes = drawn.filter((h) => h.role === 'antenna');
      check(antennaMeshes.length === 1 && antennaMeshes[0].category === 'video' && antennaMeshes[0].visible === true && antennaMeshes[0].triangles > 0,
        `${label}: one antenna mesh drawn (${JSON.stringify(antennaMeshes)})`);
      const videoMesh = drawn.find((h) => h.role === 'video');
      const faces = fixtureModels.get(vtx).variants.base.el.reduce((n, e) => n + e[7].filter(Boolean).length, 0);
      check(videoMesh && videoMesh.triangles === 2 * (faces - mask.length), `${label}: video unit drawn with ${videoMesh && videoMesh.triangles / 2} of ${faces} faces, expected ${faces - mask.length}`);

      await setTab('parts');
      let point = await antennaPoint();
      if (check(point, `${label}: the antenna is in sight and pickable`)) {
        await evaluate(`(document.querySelector('[data-slots] [data-cat="frame"]').click(), true)`);
        await viewerToTop();
        point = await antennaPoint();
        if (!viewport.mobile) {
          await mouse('mouseMoved', point.x, point.y, false);
          await sleep(160);
          const s = await ui();
          check(s.label && s.label.kind.trim() === entry('categories.video')[at] && s.label.name.trim() === catalog.partName(vtx, lang),
            `${label}: hover on the antenna names “${entry('categories.video')[at]} / ${catalog.partName(vtx, lang)}” (got ${JSON.stringify(s.label)})`);
        }
        await tap(point, viewport);
        check((await ui()).category === 'video', `${label}: a click on the antenna opens the video parts (got ${(await ui()).category})`);
        await setTab('paint');
        await viewerToTop();
        point = await antennaPoint();
        if (check(point, `${label}: the antenna is pickable in the paint tab`)) {
          if (!viewport.mobile) {
            await mouse('mouseMoved', point.x, point.y, false);
            await sleep(160);
            const s = await ui();
            check(s.label && s.label.kind.trim() === catalog.paintSlotName('antenna', lang), `${label}: hover on the antenna names the slot “${catalog.paintSlotName('antenna', lang)}” (got ${JSON.stringify(s.label)})`);
          }
          await tap(point, viewport);
          const s = await ui();
          check(s.targets.length === 1 && s.targets[0] === 'antenna', `${label}: a click on the antenna targets the antenna paint row (got ${s.targets})`);
        }
      }
      await turn([]);
      await viewerToTop();
      await sleep(150);
      if (SHOTS) {
        fs.mkdirSync(SHOTS, { recursive: true });
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(SHOTS, `antenna-${lang}-${viewport.width}-${local(frame)}-${local(vtx)}.png`), Buffer.from(shot.data, 'base64'));
        const rear = await evaluate(`(() => { const c = window.__viewer.snapshot({ maxWidth: 900, maxHeight: 600, azimuth: ${REAR.azimuth}, elevation: ${REAR.elevation} }); return c ? c.toDataURL('image/png') : null; })()`);
        if (check(rear, `${label}: snapshot from behind`)) {
          fs.writeFileSync(path.join(SHOTS, `rear-${local(frame)}-${local(vtx)}.png`), Buffer.from(rear.split(',')[1], 'base64'));
        }
      }

      await evaluate('(window.__viewer.setCamera({ on: true, frame: true }), true)');
      await sleep(150);
      drawn = await meshes();
      check(drawn.some((h) => h.role === 'antenna') && drawn.filter((h) => h.role === 'antenna' || h.role === 'video').every((h) => h.visible === false)
        && drawn.some((h) => h.role === 'frame' && h.visible === true), `${label}: the camera preview hides antenna and video unit, the frame stays (${JSON.stringify(drawn.map((h) => [h.role, h.visible]))})`);
      await evaluate('(window.__viewer.setCamera({ on: false }), true)');
      await sleep(100);
      drawn = (await meshes()).filter((h) => h.role === 'antenna');
      check(drawn.length === 1 && drawn[0].visible === true, `${label}: back in 3D the antenna is drawn again`);
      check(!errors.length, `${label}: no console errors (${errors.splice(0).join(' | ')})`);
    }
  } finally {
    browser.close();
    child.kill();
    server.close();
    await sleep(300);
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {
      // Chrome may still write into its profile while it shuts down; the temporary folder stays then.
    }
  }
}

if (BROWSER) {
  try {
    await browserChecks();
  } catch (e) {
    check(false, `headless Chrome: ${e.stack || e.message}`);
  }
}
fs.rmSync(out, { recursive: true, force: true });

if (failures.length) {
  console.error(failures.join('\n'));
  console.error(`FAIL: antenna: ${failures.length} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`PASS: antenna: ${checks} checks passed (${VTX.length} VTX, ${combos} frame and VTX combinations${BROWSER ? ', en/de at 1280/390 px' : ''})`);
