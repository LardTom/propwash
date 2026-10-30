#!/usr/bin/env node
// VTX antennas at the frame's antenna holder (Propwash 0.6.0 after F-ANTENNA4-1: AntennaRules, AntennaGeometry,
// AntennaMask, DroneAssembly#antennaPart, antenna_anchor of a frame and antenna of a VTX in the web export; the
// "_antenna" models and the anchor "antenna" in drone_layout.json of the core frames are gone):
//   - rules (assets/js/configurator/antenna.js): for every VTX of tools/fixtures/antenna-export (the four core VTX of
//     Propwash 810cdb410 and the seven of Just More Parts 1.2.0-rc.1, as /propwash webexport writes them) kind, count,
//     length and cap derived from its values equal the export's antenna (race 45–60 mm); for every frame of that export
//     (frames.json) the fallback holder (12 mm behind the top plate, whoop 0.18 × wheelbase, tilt 45°) equals the
//     export's antenna_anchor where the frame has none of its own, and the longest antenna (1.2 × wheelbase) and the
//     lean of a pair (15° each, narrower on small open frames) equal its max_length_mm and pair_lean_deg; a VTX's
//     antenna on a frame is cut to that length; an add-on's own antenna and antenna_anchor win, invalid ones fall back
//   - the build tool (build-configurator-models.mjs) on the fixture: no VTX has an antenna variant any more, every VTX
//     model lists the faces the game leaves out (AntennaMask: faces of "antenna…" elements not inside another
//     element) – none for the core VTX, for the Just More Parts VTX as many as the game leaves out in its own self
//     test (antenne: Antennen-Elemente der Add-on-VTX ausgelassen), each of them on an antenna element
//   - the jar path (catalog-build.js, partjson.js): the same model files and colours as the build tool and the export;
//     a frame's antenna_anchor and a VTX's antenna are read like PartJson (tilt 45° by default, errors and warnings
//     like the mod) and exported like PartData (antenna_anchor after accessory_anchors with max_length_mm and
//     pair_lean_deg, antenna last)
//   - assembly: every frame with every VTX of the fixture has exactly one antenna piece – role antenna, the VTX's id,
//     category video, drawn from shapes (AntennaGeometry) at the holder of the frame (drone_layout.json "antenna" only
//     as an override), with its tilt, the frame's pair lean and longest antenna and not turned by the camera angle,
//     behind and above the holder – and the video piece leaves out the masked faces; a VTX model without the mask
//     (data of an older export, antennas in the model) gets no antenna piece, so no antenna is drawn twice; a VTX
//     without a model still gets its antenna
//   - behind the pack (DroneAssembly#behindPackMm): a pack on top that reaches further back than the holder moves the
//     antenna 5 mm behind its rear (the rear of the pack without plug and leads, PlugAnchors and
//     DroneRenderResources#packRear on the fixture's battery models, the pack of FallbackShapes without a model) and
//     the holder reaches forward by as much; a pack under the frame never does
//   - geometry: holder, SMA and the cap of every kind (whip, stubby, lollipop, pagoda, patch) with the sizes of
//     AntennaGeometry, one antenna in the middle straight up and back, a pair in a V from one point (15° each by
//     default), tips at the length along the axis, the holder reaching forward to the top plate
//   - paint: the antenna slot starts with the colour of the cap (PaintPicker.defaults, before every model group),
//     is offered for every VTX, a pick on the antenna paints it, its colour recolours the caps only
//   - headless Chrome, English and German, 1280 and 390 px, with the fixture's catalog data and VTX models on their way
//     to the page: whoop, 5″ race, 5″ freestyle with HD and 7″ long range (Just More Parts VTX): one antenna mesh at
//     the holder, the masked video unit, a hover and a click on the antenna pick “Video” and the antenna slot, the
//     camera preview hides it like the video unit; with --shots also the drone from behind for the comparison with
//     the game's sheets (antenna_rear_<frame>_*.png, antenna_close_*.png)
//
//   node tools/test-configurator-antenna.mjs [--no-browser] [--shots <dir>] [--chrome <path>]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, CHROME, serve, launch, cdp, sleep } from './headless-chrome.mjs';
import { createCatalog } from '../assets/js/configurator/data.js';
import * as Assembly from '../assets/js/configurator/assembly.js';
import { resources, modelOf, partModel, hex, exportData } from '../assets/js/configurator/catalog-build.js';
import { decodePart } from '../assets/js/configurator/partjson.js';
import { paintDefaults, paintAvailable, groupsOf, pieceSlots, rgbOf } from '../assets/js/configurator/paint.js';
import { PAINT_SLOTS } from '../assets/js/configurator/sharecode.js';
import { entry } from '../assets/js/configurator/i18n.js';

const { assemble, frameLayout, pieceCategory } = Assembly;

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
const callIn = (module, name, ...args) => {
  if (!module || typeof module[name] !== 'function') {
    check(false, `${name}: not exported`);
    return null;
  }
  try {
    return module[name](...args);
  } catch (e) {
    check(false, `${name}: ${e.message}`);
    return null;
  }
};
const call = (name, ...args) => callIn(A, name, ...args);

const FIXTURE = path.join(ROOT, 'tools/fixtures/antenna-export');
const NAMESPACES = ['propwash', 'justmoreparts'];
const fixtureParts = NAMESPACES.flatMap((ns) => readJson(path.join(FIXTURE, ns, 'parts.json')));
const fixtureVideos = fixtureParts.filter((p) => p.category === 'video');
const fixtureBatteries = fixtureParts.filter((p) => p.category === 'battery');
const fixtureFrames = readJson(path.join(FIXTURE, 'frames.json'));
const VTX = fixtureVideos.map((p) => p.id);
const BATTERIES = fixtureBatteries.map((p) => p.id);
// The core frames' own holders (frame files of Propwash, F-ANTENNA4-1), tilt 45°.
const CORE_ANCHORS = {
  'propwash:whoop_65': [0, 23.2, 11.5], 'propwash:cinewhoop_3': [0, 24, 46], 'propwash:freestyle_5': [0, 28.5, 64],
  'propwash:race_5': [0, 20, 54], 'propwash:long_range_7': [0, 32.5, 72],
};
const TILT = 45;
// Longest antenna and lean of a pair the game reports for some frames (G-ANTENNA4-1, web export 810cdb410).
const LIMITS = {
  'propwash:whoop_65': [78, 15], 'justmoreparts:tp_2_x': [108, 5], 'justmoreparts:tp_35_stretched': [191, 8.9], 'justmoreparts:lr_4_x': [210, 11.3],
  'justmoreparts:cw_25_duct': [134.5, 15], 'propwash:freestyle_5': [250, 15],
};
// What the game leaves out of the Just More Parts VTX (selftest antenne:, F-ANTENNA3-1, JMP 1.2.0-dev.1; the models
// are the same in 1.2.0-rc.1): antenna elements, faces left out, faces kept.
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
const limitsOf = (frame) => frame.data.antenna_anchor;
// AntennaRules.antenna(video, frame): the VTX's antenna cut to the frame's longest antenna.
const onFrame = (spec, frame) => ({ ...spec, lengthMm: Math.min(spec.lengthMm, limitsOf(frame).max_length_mm) });

// ---------------------------------------------------------------------------------------------------------------
// The game's pack rear (DroneRenderResources#packRear on PlugAnchors.elements of the raw model with element names)

const PLUG_ELEMENTS = ['connector', 'connector_grip', 'bt_connector'];
const LEAD_ELEMENTS = [...PLUG_ELEMENTS, 'wire', 'balance_plug', 'pigtail'];
function gameBox(e) {
  const r = e.rotation && typeof e.rotation === 'object' && !Array.isArray(e.rotation) ? e.rotation : null;
  let m = null;
  if (r) {
    let [x, y, z] = [0, 0, 0];
    if (typeof r.axis === 'string') {
      const angle = Number.isFinite(r.angle) ? r.angle : 0;
      if (r.axis === 'x') x = angle;
      else if (r.axis === 'y') y = angle;
      else if (r.axis === 'z') z = angle;
    } else {
      [x, y, z] = [r.x || 0, r.y || 0, r.z || 0];
    }
    const k = Math.PI / 180;
    const rx = [1, 0, 0, 0, Math.cos(x * k), -Math.sin(x * k), 0, Math.sin(x * k), Math.cos(x * k)];
    const ry = [Math.cos(y * k), 0, Math.sin(y * k), 0, 1, 0, -Math.sin(y * k), 0, Math.cos(y * k)];
    const rz = [Math.cos(z * k), -Math.sin(z * k), 0, Math.sin(z * k), Math.cos(z * k), 0, 0, 0, 1];
    const mul3 = (a, b) => [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]));
    if ((x || y || z) && Array.isArray(r.origin) && r.origin.length === 3) m = { matrix: mul3(mul3(rz, ry), rx), origin: r.origin };
  }
  const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < 8; i++) {
    let c = [(i & 1) ? e.to[0] : e.from[0], (i & 2) ? e.to[1] : e.from[1], (i & 4) ? e.to[2] : e.from[2]];
    if (m) {
      const d = c.map((v, j) => v - m.origin[j]);
      c = [0, 1, 2].map((j) => m.matrix[j * 3] * d[0] + m.matrix[j * 3 + 1] * d[1] + m.matrix[j * 3 + 2] * d[2] + m.origin[j]);
    }
    for (let j = 0; j < 3; j++) {
      box[j] = Math.min(box[j], (c[j] - 8) * 8);
      box[j + 3] = Math.max(box[j + 3], (c[j] - 8) * 8);
    }
  }
  return box;
}
const touches = (a, b, margin) => [0, 1, 2].every((i) => a[i] <= b[i + 3] + margin && b[i] <= a[i + 3] + margin);
function gamePackRear(model) {
  const elements = (model.elements || []).filter((e) => Array.isArray(e.from) && Array.isArray(e.to))
    .map((e) => ({ name: typeof e.name === 'string' ? e.name : '', box: gameBox(e) }));
  let body = null;
  const plugs = [];
  for (const e of elements) {
    if (PLUG_ELEMENTS.includes(e.name) || e.name === 'balance_plug') plugs.push(e.box);
    if (e.name === 'connector' || e.name === 'bt_connector') body = body ? body.map((v, i) => (i < 3 ? Math.min(v, e.box[i]) : Math.max(v, e.box[i]))) : e.box.slice();
  }
  let leads = [];
  if (body && [0, 1, 2].every((i) => body[i + 3] - body[i] > 0)) {
    leads = [...plugs, ...elements.filter((e) => e.name === 'wire' && plugs.some((p) => touches(e.box, p, 0.01))).map((e) => e.box)];
  }
  let rear = NaN;
  for (const e of elements) {
    if (leads.some((b) => same(b, e.box)) || LEAD_ELEMENTS.includes(e.name)) continue;
    rear = Number.isNaN(rear) ? e.box[5] : Math.max(rear, e.box[5]);
  }
  return rear;
}
const rawPartModel = (p) => {
  const ns = nsOf(p.id);
  const item = readJson(path.join(FIXTURE, ns, p.model.drone));
  const [mns, mpath] = item.model.model.split(':');
  return readJson(path.join(FIXTURE, ns, `assets/${mns}/models/${mpath}.json`));
};
// FallbackShapes.buildBattery: the pack's box (length from pack_mm, else 2.2 × the height from mass and chemistry),
// the connector 8 mm behind it from 2 cells.
function fallbackPackRear(battery) {
  const d = battery.data;
  let length;
  if (Array.isArray(d.pack_mm) && d.pack_mm.length === 3) {
    length = d.pack_mm[0];
  } else {
    const density = d.chemistry === 'propwash:lion' ? 2.4 : 2.1;
    length = 2.2 * Math.cbrt(battery.basics.mass_g / density / 2.86) * 10;
  }
  return d.cells > 1 ? length / 2 + 8 : length / 2;
}
// DroneAssembly#behindPackMm: 5 mm behind the rear of a pack on top that reaches past the holder, else 0.
function gameBehind(frame, battery, layout, rear) {
  if (frame.data.battery.on_top === false || !Number.isFinite(rear)) return 0;
  return Math.max(0, layout.battery[2] + rear + 5 - layout.antenna[2]);
}

// ---------------------------------------------------------------------------------------------------------------
// Rules against the export

for (const p of fixtureVideos) {
  const values = call('videoValues', without(p, 'antenna'));
  check(p.data.antenna && p.data.antenna.derived === true, `${p.id}: the export derives its antenna`);
  check(values && call('antennaKind', values) === p.data.antenna.kind, `${p.id}: kind ${values && call('antennaKind', values)} = export ${p.data.antenna.kind}`);
  const derived = values && call('derivedAntenna', values);
  check(same(derived, exportAntenna(p)), `${p.id}: derived ${JSON.stringify(derived)} = export ${JSON.stringify(exportAntenna(p))}`);
  const own = call('videoAntenna', p);
  check(own && same({ count: own.count, lengthMm: own.lengthMm, cap: own.cap }, exportAntenna(p)) && own.kind === p.data.antenna.kind,
    `${p.id}: videoAntenna from the export's antenna (${JSON.stringify(own)})`);
  for (const f of fixtureFrames) {
    const fitted = call('videoAntenna', p, f);
    const expected = onFrame(exportAntenna(p), f);
    check(fitted && same({ count: fitted.count, lengthMm: fitted.lengthMm, cap: fitted.cap }, expected) && fitted.kind === p.data.antenna.kind,
      `${p.id} on ${f.id}: ${JSON.stringify(fitted)}, expected at most ${limitsOf(f).max_length_mm} mm (${JSON.stringify(expected)})`);
  }
}
{
  const race = { rangeBlocks: 380, massGrams: 8, link: 'analog', imageQuality: 0.6, latencyMs: 10, vtxPowerMw: 600 };
  const length = (rangeBlocks) => (call('derivedAntenna', { ...race, rangeBlocks }) || {}).lengthMm;
  check(length(380) === 50 && length(100) === 45 && length(520) === 60 && length(660) === 60 && Math.abs(length(450) - 55) < 1e-9,
    `race antennas 45 to 60 mm, 50 mm at 380 blocks (got ${[380, 100, 520, 660, 450].map(length)})`);
  check(A && A.RACE_MIN_MM === 45 && A.RACE_MAX_MM === 60 && A.MAX_LENGTH_OF_WHEELBASE === 1.2 && A.DEFAULT_ANTENNA_TILT === 45
    && A.WHOOP_REAR_OF_WHEELBASE === 0.18 && A.BEHIND_PLATE_MM === 12 && A.PAIR_LEAN_DEG === 15 && A.MIN_PAIR_LEAN_DEG === 5,
    'constants of AntennaRules after F-ANTENNA4-1');
}
let explicitFrames = 0;
for (const f of fixtureFrames) {
  const anchor = f.data.antenna_anchor;
  const values = call('frameValues', without(f, 'antenna_anchor'));
  const fallback = call('fallbackAnchor', values || {});
  if (anchor.explicit) {
    explicitFrames++;
    check(near(anchor.pos, CORE_ANCHORS[f.id] || []) && anchor.tilt_deg === TILT, `${f.id}: own holder of the frame file ${anchor.pos}`);
  } else {
    check(fallback && same([fallback.x, fallback.y, fallback.z], anchor.pos) && fallback.tiltDeg === anchor.tilt_deg,
      `${f.id}: fallback holder ${fallback && [fallback.x, fallback.y, fallback.z]} / ${fallback && fallback.tiltDeg}° = export ${anchor.pos} / ${anchor.tilt_deg}°`);
  }
  check(fallback && fallback.tiltDeg === TILT, `${f.id}: fallback holder tilted ${fallback && fallback.tiltDeg}°, expected ${TILT}°`);
  const maxLength = values && call('maxLengthMm', values);
  const pairLean = values && call('pairLeanDeg', values);
  check(maxLength === anchor.max_length_mm, `${f.id}: longest antenna ${maxLength} mm = export ${anchor.max_length_mm} mm`);
  check(pairLean === anchor.pair_lean_deg, `${f.id}: lean of a pair ${pairLean}° = export ${anchor.pair_lean_deg}°`);
  if (LIMITS[f.id]) {
    check(anchor.max_length_mm === LIMITS[f.id][0] && anchor.pair_lean_deg === LIMITS[f.id][1], `${f.id}: export ${anchor.max_length_mm} mm / ${anchor.pair_lean_deg}° as in the game`);
  }
  const used = call('frameAntennaAnchor', f);
  check(used && same(used.position, anchor.pos) && used.tilt === anchor.tilt_deg && used.maxLengthMm === anchor.max_length_mm
    && used.pairLeanDeg === anchor.pair_lean_deg, `${f.id}: frameAntennaAnchor ${JSON.stringify(used)} = export ${JSON.stringify(anchor)}`);
  const old = call('frameAntennaAnchor', without(f, 'antenna_anchor'));
  check(old && fallback && same(old.position, [fallback.x, fallback.y, fallback.z]) && old.tilt === TILT && old.maxLengthMm === anchor.max_length_mm
    && old.pairLeanDeg === anchor.pair_lean_deg, `${f.id}: without antenna_anchor (older export) the fallback holder and the frame's limits (${JSON.stringify(old)})`);
  const { max_length_mm: _m, pair_lean_deg: _p, ...withoutLimits } = anchor;
  const older = call('frameAntennaAnchor', { ...f, data: { ...f.data, antenna_anchor: withoutLimits } });
  check(older && same(older.position, anchor.pos) && older.maxLengthMm === anchor.max_length_mm && older.pairLeanDeg === anchor.pair_lean_deg,
    `${f.id}: antenna_anchor without max_length_mm and pair_lean_deg (export before F-ANTENNA4-1): the limits from the frame (${JSON.stringify(older)})`);
}
check(explicitFrames === 5, `frames with an own holder: ${explicitFrames} (the five core frames)`);
{
  const hd = fixtureVideos.find((p) => p.id === 'propwash:digital_hd');
  const own = { ...hd, data: { ...hd.data, antenna: { count: 1, length_mm: 70, cap: 'stubby' } } };
  check(same(call('videoAntenna', own), { count: 1, lengthMm: 70, cap: 'stubby', kind: 'hd' }), 'an own antenna of the VTX wins');
  for (const bad of [{ count: 3, length_mm: 70, cap: 'stubby' }, { count: 1, length_mm: 5, cap: 'stubby' }, { count: 1, length_mm: 70, cap: 'dish' }, 'x']) {
    const a = call('videoAntenna', { ...hd, data: { ...hd.data, antenna: bad } });
    check(a && a.count === 2 && a.lengthMm === 90 && a.cap === 'lollipop', `invalid antenna ${JSON.stringify(bad)}: derived instead`);
  }
  const whoop = fixtureFrames.find((f) => f.id === 'propwash:whoop_65');
  check(same(call('videoAntenna', hd, whoop), { count: 2, lengthMm: 78, cap: 'lollipop', kind: 'hd' }), 'whoop_65 + digital_hd: two antennas of 78 mm (1.2 × 65 mm)');
  const frame = fixtureFrames.find((f) => f.id === 'justmoreparts:lr_7_deadcat');
  const own2 = call('frameAntennaAnchor', { ...frame, data: { ...frame.data, antenna_anchor: { pos: [1, 2, 3], tilt_deg: 20, explicit: true } } });
  check(own2 && same(own2.position, [1, 2, 3]) && own2.tilt === 20 && own2.maxLengthMm === 250 && own2.pairLeanDeg === 15, 'an own holder of the frame wins');
  const narrow = { wheelbaseMm: 90, ducted: false };
  check(call('pairLeanDeg', narrow) === 5 && call('pairLeanDeg', { wheelbaseMm: 150, ducted: false }) === 7.5 && call('pairLeanDeg', { wheelbaseMm: 90, ducted: true }) === 15
    && call('pairLeanDeg', { wheelbaseMm: 200, ducted: false }) === 15, 'lean of a pair: 15° on ducted frames and from 200 mm, at least 5° below');
  check(call('maxLengthMm', { wheelbaseMm: 5 }) === 10 && call('maxLengthMm', { wheelbaseMm: 112 }) === 134.5 && call('maxLengthMm', { wheelbaseMm: 500 }) === 250,
    'longest antenna: 1.2 × wheelbase to half a millimetre, 10 to 250 mm');
}

// ---------------------------------------------------------------------------------------------------------------
// The build tool on the fixture export

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-antenna-'));
execFileSync(process.execPath, [path.join(ROOT, 'tools/build-configurator-models.mjs'), '--export', FIXTURE, '--out', out], { stdio: 'pipe' });
const built = readJson(path.join(out, 'render.json'));
const builtModel = (id) => {
  const part = fixtureParts.find((p) => p.id === id);
  const file = path.join(out, 'models', nsOf(id), part ? part.category : 'video', `${local(id)}.json`);
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
    const file = path.join(out, 'models', ns, p.category, `${local(p.id)}.json`);
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
  check(r.definition && r.definition.geometry.antennaAnchor && r.definition.geometry.antennaAnchor.tiltDeg === 45, `PartJson antenna_anchor: tilt 45° by default (got ${r.definition && r.definition.geometry.antennaAnchor && r.definition.geometry.antennaAnchor.tiltDeg})`);
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
  check(fb && same(data.antenna_anchor, { pos: [fb.x, fb.y, fb.z], tilt_deg: 45, explicit: false, max_length_mm: 250, pair_lean_deg: 15 }),
    `PartData antenna_anchor: the fallback holder with the frame's longest antenna and lean of a pair (${JSON.stringify(data.antenna_anchor)})`);
  const own = withAnchor({ pos: [0, 30, 52.5], tilt_deg: 40 });
  check(own.definition && same(exportData(own.definition).antenna_anchor, { pos: [0, 30, 52.5], tilt_deg: 40, explicit: true, max_length_mm: 250, pair_lean_deg: 15 }),
    `PartData antenna_anchor: the frame's own holder, explicit (${JSON.stringify(own.definition && exportData(own.definition).antenna_anchor)})`);
  const small = decodePart('frame', 'addon:frame_c', JSON.stringify({ ...frameJson, wheelbase_mm: 175, max_prop_mm: 100 }));
  check(small.definition && same(Object.entries(exportData(small.definition).antenna_anchor).slice(3), [['max_length_mm', 210], ['pair_lean_deg', 11.3]]),
    `PartData antenna_anchor of a 175 mm frame: 210 mm and 11.3° like lr_4_x, last (${JSON.stringify(small.definition && exportData(small.definition).antenna_anchor)})`);

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
    if (p.category === 'video') return { ...p, data: { ...p.data, antenna: data.antenna } };
    return p;
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
const fixtureModels = new Map([...VTX, ...BATTERIES].map((id) => [id, builtModel(id)]));
const env = { catalog, render, model: (id) => (fixtureModels.has(id) ? fixtureModels.get(id) : siteModel(id)) };
const oldEnv = { catalog: oldCatalog, render, model: siteModel };
// Frames the fixture does not have (the add-ons the site gained after it, e.g. Camera Drones) bring their holder in the
// site's catalog, from the export the catalog was built from.
const anchorOf = (id) => (fixtureFrames.find((f) => f.id === id) || oldCatalog.part(id)).data.antenna_anchor;

const base = catalog.presetBuild('propwash:freestyle');
const rawRear = new Map(fixtureBatteries.map((p) => [p.id, gamePackRear(rawPartModel(p))]));
const baseBattery = catalog.part(base.battery);
let combos = 0;
for (const frame of catalog.partsIn('frame')) {
  const anchor = anchorOf(frame.id);
  const layout = frameLayout(frame, catalog, render);
  check(near(layout.antenna, anchor.pos) && layout.antennaTilt === anchor.tilt_deg, `${frame.id}: layout holder ${layout.antenna} / ${layout.antennaTilt}° = export ${anchor.pos}`);
  const behind = gameBehind(frame, baseBattery, layout, rawRear.get(base.battery));
  for (const id of VTX) {
    const label = `${frame.id} + ${id}`;
    const build = { ...base, frame: frame.id, video: id, accessories: {} };
    const a = assemble(build, env);
    const antennas = a.pieces.filter((p) => p.role === 'antenna');
    if (!check(antennas.length === 1, `${label}: one antenna piece (got ${antennas.length})`)) continue;
    const piece = antennas[0];
    const video = a.pieces.find((p) => p.role === 'video');
    const spec = onFrame(exportAntenna(fixtureVideos.find((p) => p.id === id)), frame);
    const at = [anchor.pos[0], anchor.pos[1], anchor.pos[2] + behind];
    check(piece.id === id && pieceCategory(piece) === 'video' && piece.procedural === 'antenna' && !piece.variant, `${label}: antenna of the VTX, category video, drawn from shapes`);
    check(near(piece.position, at, 1e-4) && piece.tilt === anchor.tilt_deg && piece.wheelbase === frame.data.wheelbase_mm && piece.pairLean === anchor.pair_lean_deg
      && Number.isFinite(piece.behindPack) && Math.abs(piece.behindPack - behind) < 1e-4,
      `${label}: antenna at the holder ${piece.position} / ${piece.tilt}° / pair ${piece.pairLean}° / ${piece.behindPack} mm behind it, expected ${at} / ${anchor.tilt_deg}° / ${anchor.pair_lean_deg}° / ${behind}`);
    check(piece.antenna && same({ count: piece.antenna.count, lengthMm: piece.antenna.lengthMm, cap: piece.antenna.cap }, spec), `${label}: antenna ${JSON.stringify(piece.antenna)}, expected ${JSON.stringify(spec)}`);
    check(!piece.tiltX && !piece.spinY && !piece.stretchX, `${label}: not turned by the camera angle (tilt ${piece.tiltX})`);
    const tip = call('antennaTip', piece.antenna, piece.tilt, piece.wheelbase, 0, piece.pairLean);
    const shapes = call('antennaPieces', piece.antenna, piece.tilt, piece.wheelbase, piece.pairLean, piece.behindPack) || [];
    check(tip && shapes.length && tip[1] > 0 && tip[2] > shapes[0].matrix[11], `${label}: the antenna stands up and back from its holder`);
    const mask = fixtureModels.get(id).variants.base.antenna || [];
    check(video && (mask.length ? same(video.hideFaces, mask) : !video.hideFaces), `${label}: the video unit leaves out ${mask.length} faces (got ${video && JSON.stringify(video.hideFaces)})`);
    const old = assemble(build, oldEnv);
    const site = siteModel(id);
    if (site && Array.isArray(site.variants.base.antenna)) {
      check(old.pieces.filter((p) => p.role === 'antenna').length === 1 && old.pieces.length === a.pieces.length,
        `${label}: the site's VTX model of a newer export (with its list of left-out faces) has one antenna at the holder too`);
    } else {
      check(!old.pieces.some((p) => p.role === 'antenna' || p.hideFaces) && old.pieces.length === a.pieces.length - 1,
        `${label}: with the site's older VTX model (antennas in it) no second antenna`);
    }
    combos++;
  }
}

// Behind an overhanging pack (DroneAssembly#behindPackMm) with every battery of the fixture on every frame.
let pushed = 0;
let packs = 0;
for (const p of fixtureBatteries) {
  const model = fixtureModels.get(p.id);
  const rear = callIn(Assembly, 'packRear', model);
  check(Number.isFinite(rawRear.get(p.id)) && Number.isFinite(rear) && Math.abs(rear - rawRear.get(p.id)) < 1e-3,
    `${p.id}: rear of the pack ${rear} mm without plug and leads = the game's ${rawRear.get(p.id)} mm`);
  const all = Math.max(...model.variants.base.el.map((e) => Assembly.elementBox(e)[5]));
  check(!model.variants.base.socket || all > rear + 1, `${p.id}: plug and leads reach further back (${all} mm) than the pack (${rear} mm)`);
}
for (const frame of catalog.partsIn('frame')) {
  const anchor = anchorOf(frame.id);
  const layout = frameLayout(frame, catalog, render);
  const reach = Math.min(16, 0.12 * frame.data.wheelbase_mm);
  for (const id of BATTERIES) {
    const battery = catalog.part(id);
    if (!battery) continue;
    const label = `${frame.id} + ${id}`;
    const behind = gameBehind(frame, battery, layout, rawRear.get(id));
    const a = assemble({ ...base, frame: frame.id, battery: id, video: 'propwash:digital_hd', accessories: {} }, env);
    const piece = a.pieces.find((q) => q.role === 'antenna');
    packs++;
    if (behind > 0) pushed++;
    if (!check(piece, `${label}: antenna piece`)) continue;
    check(near(piece.position, [anchor.pos[0], anchor.pos[1], anchor.pos[2] + behind], 1e-4) && Math.abs(piece.behindPack - behind) < 1e-4,
      `${label}: antenna ${behind.toFixed(2)} mm behind the holder (got ${piece.position}, ${piece.behindPack})`);
    const mount = (call('antennaPieces', piece.antenna, piece.tilt, piece.wheelbase, piece.pairLean, piece.behindPack) || [])[0];
    const front = mount ? piece.position[2] + mount.matrix[11] - mount.matrix[10] / 2 : NaN;
    check(Math.abs(front - (anchor.pos[2] - Math.max(3, reach))) < 1e-3, `${label}: the holder still reaches forward to ${anchor.pos[2] - Math.max(3, reach)} mm (got ${front})`);
  }
}
check(pushed >= 10 && pushed < packs, `antennas moved behind an overhanging pack: ${pushed} of ${packs}`);
console.log(`behind the pack: ${pushed} of ${packs} frame and battery combinations`);
{
  // The pack the game's self test puts on every frame (AntennaSelfTests#with: the preset's pack on a core frame, else
  // the first fitting pack in the game's order, worked out on the full web export 810cdb410). The game moves the antenna
  // in 22 of its 330 combinations (antenne:, G-ANTENNA4-1: 30 frames, of them the three example frames, × 11 VTX).
  const SELFTEST_PACKS = {
    'propwash:whoop_65': 'propwash:b1s_300_hv', 'propwash:cinewhoop_3': 'propwash:b4s_650', 'propwash:freestyle_5': 'propwash:b6s_1300',
    'propwash:race_5': 'propwash:b6s_1100', 'propwash:long_range_7': 'propwash:b6s_4000_lion', 'justmoreparts:tp_25_x': 'justmoreparts:b2s_300_hv',
  };
  for (const id of ['whoop_65_lite', 'whoop_75_duct', 'whoop_85_duct', 'tp_2_x']) SELFTEST_PACKS[`justmoreparts:${id}`] = 'propwash:b1s_300_hv';
  for (const id of ['cw_25_duct', 'tp_3_x', 'cw_35_duct', 'tp_35_stretched', 'lr_4_x', 'deadcat_5', 'fs_5_bash', 'race_5_stretched', 'fs_5_squashed', 'hframe_5', 'lr_6_x']) {
    SELFTEST_PACKS[`justmoreparts:${id}`] = 'propwash:b4s_650';
  }
  for (const id of ['lr_7_deadcat', 'lr_8_x', 'xclass_10', 'xclass_12', 'xclass_13', 'xclass_13_h']) SELFTEST_PACKS[`justmoreparts:${id}`] = 'propwash:b6s_1100';
  let moved = 0;
  let all = 0;
  const frames = [];
  for (const frame of catalog.partsIn('frame')) {
    const battery = SELFTEST_PACKS[frame.id];
    if (!check(battery && catalog.part(battery), `${frame.id}: the self test's pack ${battery}`)) continue;
    let here = 0;
    for (const id of VTX) {
      const piece = assemble({ ...base, frame: frame.id, battery, video: id, accessories: {} }, env).pieces.find((q) => q.role === 'antenna');
      all++;
      if (piece && piece.behindPack > 0) here++;
    }
    moved += here;
    if (here) frames.push(frame.id);
  }
  check(moved === 22 && all === 297 && same(frames, ['justmoreparts:tp_2_x', 'justmoreparts:cw_25_duct']),
    `with the self test's packs ${moved} of ${all} antennas behind the pack (${frames}), the game: 22 (tp_2_x and cw_25_duct)`);
}
{
  const tp2 = catalog.part('justmoreparts:tp_2_x');
  const pack = catalog.part('justmoreparts:b1s_750_hv');
  const behind = gameBehind(tp2, pack, frameLayout(tp2, catalog, render), rawRear.get(pack.id));
  check(behind > 10, `tp_2_x + b1s_750_hv: the pack reaches ${behind} mm past the holder`);
  const whoop = catalog.part('propwash:whoop_65');
  const below = assemble({ ...base, frame: whoop.id, battery: 'justmoreparts:b1s_750_hv', video: 'propwash:analog_nano', accessories: {} }, env).pieces.find((q) => q.role === 'antenna');
  check(below && below.behindPack === 0 && near(below.position, anchorOf(whoop.id).pos), 'a pack under the frame never moves the antenna');
  const noPack = { ...env, model: (id) => (BATTERIES.includes(id) ? null : env.model(id)) };
  for (const id of ['justmoreparts:b1s_750_hv', 'justmoreparts:b4s_1800']) {
    const frame = catalog.part('justmoreparts:tp_2_x');
    const battery = catalog.part(id);
    const expected = gameBehind(frame, battery, frameLayout(frame, catalog, render), fallbackPackRear(battery));
    const piece = assemble({ ...base, frame: frame.id, battery: id, video: 'propwash:digital_hd', accessories: {} }, noPack).pieces.find((q) => q.role === 'antenna');
    check(piece && Math.abs(piece.behindPack - expected) < 1e-4, `tp_2_x + ${id} without a model: behind the pack of FallbackShapes ${expected} mm (got ${piece && piece.behindPack})`);
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
    check(near(l.antenna, expected) && l.antennaTilt === TILT, `drone_layout.json "antenna" ${JSON.stringify(point)}: holder at ${l.antenna} / ${l.antennaTilt}° (expected ${expected})`);
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
  const r = Math.PI / 180;
  for (const cap of Object.keys(PARTS)) {
    for (const count of [1, 2]) {
      for (const [pairLean, wheelbase] of [[undefined, 225], [5, 90], [8.9, 159]]) {
        const antenna = { count, lengthMm: 100, cap };
        const what = `${cap} × ${count}${pairLean === undefined ? '' : ` (pair ${pairLean}°)`} at ${wheelbase} mm`;
        const pieces = call('antennaPieces', antenna, TILT, wheelbase, pairLean) || [];
        check(pieces.length === 2 + count * PARTS[cap], `${what}: ${pieces.length} shapes, expected ${2 + count * PARTS[cap]}`);
        check(pieces.every((p) => (p.kind === 'box' || p.kind === 'cylinder') && p.matrix.length === 16 && p.matrix.every(Number.isFinite)), `${what}: boxes and cylinders`);
        check(pieces.filter((p) => p.name === 'mount').length === 2 && pieces.filter((p) => p.name === 'sma').length === count, `${what}: holder and SMA nuts`);
        const lean = count === 1 ? 0 : (pairLean === undefined ? 15 : pairLean);
        for (let i = 0; i < count; i++) {
          const side = count === 1 ? 0 : (i === 0 ? -1 : 1);
          // Rx(45°) · Rz(−side · lean) · (0, 1, 0), from one point in the middle of the holder
          const axis = [side * Math.sin(lean * r), Math.cos(lean * r) * Math.cos(TILT * r), Math.cos(lean * r) * Math.sin(TILT * r)];
          const tip = call('antennaTip', antenna, TILT, wheelbase, i, pairLean);
          const expected = [100 * axis[0], 0.8 + 100 * axis[1], 0.5 + 100 * axis[2]];
          check(tip && near(tip, expected, 1e-6), `${what} antenna ${i}: tip ${tip} = ${expected} (${count === 1 ? 'in the middle' : `${lean}° to the ${side < 0 ? 'left' : 'right'}`}, ${TILT}° back)`);
          const dir = call('antennaAxis', antenna, TILT, i, pairLean);
          check(dir && near(dir, axis, 1e-9), `${what} antenna ${i}: axis ${dir} = ${axis}`);
        }
        const reach = Math.min(16, 0.12 * wheelbase);
        const [low, high] = pieces.filter((p) => p.name === 'mount');
        const extent = (m) => [m[3] - m[0] / 2, m[3] + m[0] / 2, m[11] - m[10] / 2, m[11] + m[10] / 2];
        check(low && near(extent(low.matrix), [-3.5, 3.5, -Math.max(3, reach), 3.5], 1e-6) && high && near(extent(high.matrix), [-3.5, 3.5, -3, 3.5], 1e-6),
          `${what}: TPU holder 7 mm wide, reaching ${reach} mm forward to the top plate (got ${low && extent(low.matrix)}, ${high && extent(high.matrix)})`);
        const moved = call('antennaPieces', antenna, TILT, wheelbase, pairLean, 9.5) || [];
        check(moved[0] && near(extent(moved[0].matrix), [-3.5, 3.5, -(reach + 9.5), 3.5], 1e-6) && same(moved.slice(1), pieces.slice(1)),
          `${what}: 9.5 mm behind a pack the holder reaches 9.5 mm further forward, the rest stays`);
      }
    }
  }
  const whip = (call('antennaPieces', { count: 1, lengthMm: 30, cap: 'whip' }, TILT, 65) || []).filter((p) => p.kind === 'cylinder').map((p) => [p.name, p.matrix[0]]);
  check(same(whip, [['sma', 3.6], ['sleeve', 3], ['stalk', 2], ['tip', 1.6]]), `whip: SMA 3.6 mm, sleeve 3 mm, stalk 2 mm, tip 1.6 mm thick (got ${JSON.stringify(whip)})`);
  check(call('antennaOffset', 65) === 0 && call('antennaOffset', 500) === 0, 'pair from one point: no offset to the sides');
  check(call('reachMm', 65) === 0.12 * 65 && call('reachMm', 225) === 16, 'holder reach: 0.12 × wheelbase, at most 16 mm');
  const light = A ? A.ANTENNA_COLORS.capLight : -1;
  const red = A ? A.ANTENNA_COLORS.cap : -2;
  check(['whip', 'pagoda'].every((cap) => call('capColor', { cap }) === light) && ['stubby', 'lollipop', 'patch'].every((cap) => call('capColor', { cap }) === red),
    'cap colour: light for whip and pagoda, red for the others');
  const pieces = call('antennaPieces', { count: 1, lengthMm: 138, cap: 'pagoda' }, TILT, 300) || [];
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
        { urlPattern: '*/assets/data/configurator/models/*/battery/*', requestStage: 'Response' },
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
      { lang: 'de', frame: 'justmoreparts:tp_2_x', vtx: 'propwash:digital_hd', battery: 'propwash:b1s_300_hv', viewport: { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false } },
    ];
    for (const { lang, frame, vtx, battery, viewport } of LOADS) {
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
      const preset = catalog.presets.find((p) => p.build.frame === frame && (p.id.startsWith('propwash:') || nsOf(frame) !== 'propwash'));
      const build = { ...(preset ? catalog.presetBuild(preset.id) : base), frame, video: vtx, accessories: {}, ...(battery ? { battery } : {}) };
      const framePart = catalog.part(frame);
      const behind = gameBehind(framePart, catalog.part(build.battery), frameLayout(framePart, catalog, render), rawRear.get(build.battery));
      const holderAt = anchorOf(frame).pos;
      const expectedAt = [holderAt[0], holderAt[1], holderAt[2] + behind];
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

      const spec = exportAntenna(fixtureVideos.find((p) => p.id === vtx));
      const pieces = await evaluate('window.__viewer.current().assembly.pieces');
      const piece = pieces.find((p) => p.role === 'antenna');
      check(rawRear.has(build.battery) && (frame.startsWith('propwash:') ? behind === 0 : behind > 4), `${label}: pack ${build.battery} ${behind} mm past the holder`);
      check(piece && piece.id === vtx && piece.procedural === 'antenna' && near(piece.position, expectedAt, 1e-4) && Math.abs(piece.behindPack - behind) < 1e-4
        && piece.tilt === TILT && !piece.tiltX
        && piece.antenna.count === spec.count && piece.antenna.cap === spec.cap && piece.antenna.lengthMm === Math.min(spec.lengthMm, anchorOf(frame).max_length_mm)
        && piece.pairLean === anchorOf(frame).pair_lean_deg, `${label}: antenna piece at the holder of the frame (got ${JSON.stringify(piece)})`);
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
