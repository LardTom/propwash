#!/usr/bin/env node
// Checks the 3D data of the configurator's drone viewer:
//   - every part with a model has a model file with geometry and PNG textures
//   - paint tints: PaintChannel.tint(base) of every tint group equals the default tint of the "_paint" render
//     definition in the web export (only when the export is available)
//   - every preset and every frame assembles with finite positions; built-in frames use drone_layout.json
//   - frame models are drawn at real size: they reach their motor positions (render "transformation" baked in)
//
//   node tools/test-configurator-render.mjs [--export <web-export dir>]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCatalog } from '../assets/js/configurator/data.js';
import { assemble, frameLayout, proceduralFrame, proceduralAccessoryBase, SLOTS } from '../assets/js/configurator/assembly.js';
import { channelTint, rgbOf, paintTints, paintDefaults, paintAvailable } from '../assets/js/configurator/paint.js';
import { PAINT_SLOTS } from '../assets/js/configurator/sharecode.js';
import { exportDir } from './build-configurator-data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'assets/data/configurator');
const catalog = createCatalog(JSON.parse(fs.readFileSync(path.join(DATA, 'catalog.json'), 'utf8')));
const render = JSON.parse(fs.readFileSync(path.join(DATA, 'render.json'), 'utf8'));

let checks = 0;
const failures = [];
function check(ok, message) {
  checks++;
  if (!ok) failures.push(message);
}

// Models
const models = new Map();
for (const part of catalog.parts) {
  const [ns, p] = part.id.split(':');
  const file = path.join(DATA, 'models', ns, part.category, `${p}.json`);
  const listed = render.models.includes(part.id);
  if (part.model.kind !== 'model') {
    check(!listed && !fs.existsSync(file), `${part.id}: procedural part must not have a model file`);
    continue;
  }
  check(listed, `${part.id}: missing in render.json models`);
  if (!fs.existsSync(file)) {
    failures.push(`${part.id}: model file missing`);
    continue;
  }
  const model = JSON.parse(fs.readFileSync(file, 'utf8'));
  models.set(part.id, model);
  check(model.format === 1 && model.id === part.id, `${part.id}: bad header`);
  const base = model.variants.base;
  check(base && base.el.length > 0 && base.box.every(Number.isFinite), `${part.id}: base geometry`);
  for (const [name, v] of Object.entries(model.variants)) {
    check(typeof model.tex[v.tex] === 'string' && model.tex[v.tex].startsWith('data:image/png;base64,iVBORw0KGgo'), `${part.id}/${name}: PNG texture`);
    if (v.of) {
      const faces = model.variants[v.of].el.reduce((n, e) => n + e[7].filter(Boolean).length, 0);
      check(v.tint.length === faces, `${part.id}/${name}: one tint index per face`);
      check(v.groups && v.tint.every((t) => t < v.groups.length), `${part.id}/${name}: tint index within the groups`);
    }
  }
  if (part.category === 'prop') check(!!model.variants.ccw, `${part.id}: counter-clockwise model`);
  check(!!model.variants.paint === !!part.paint.paintable_model, `${part.id}: paint variant matches paintable_model`);
}

// Tints against the export's "_paint" render definitions (default tint = PaintChannel.tint(base)).
const dir = exportDir();
if (fs.existsSync(path.join(dir, 'manifest.json'))) {
  let compared = 0;
  for (const part of catalog.parts) {
    const model = models.get(part.id);
    if (!model) continue;
    for (const [plain, painted] of [['', 'paint'], ['_ccw', 'ccw_paint']]) {
      const v = model.variants[painted];
      if (!v) continue;
      const def = JSON.parse(fs.readFileSync(path.join(dir, part.model.drone.replace(/\.json$/, `${plain}_paint.json`)), 'utf8')).model;
      const expected = def.tints.map((t) => t.default);
      const actual = v.groups.map(([channel, base]) => channelTint(rgbOf(base), render.channels[channel]));
      check(JSON.stringify(expected) === JSON.stringify(actual), `${part.id}/${painted}: tints ${actual} ≠ export ${expected}`);
      compared++;
    }
  }
  console.log(`tints compared with the export: ${compared} paint models`);
} else {
  console.log('web export not found: tint comparison skipped');
}

const env = { catalog, render, model: (id) => models.get(id) || null };
const finiteVec = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);

// Built-in frames: layout from drone_layout.json.
for (const [id, entry] of Object.entries(render.layouts)) {
  const layout = frameLayout(catalog.part(id), catalog, render);
  check(layout.fromFile && JSON.stringify(layout.motors) === JSON.stringify(entry.motors), `${id}: motors from drone_layout.json`);
  check(layout.cameraTilt === entry.camera_tilt_default, `${id}: camera tilt from drone_layout.json`);
}

// Every frame with every accessory, and every preset.
for (const frame of catalog.partsIn('frame')) {
  const layout = frameLayout(frame, catalog, render);
  check(layout.motors.length === SLOTS && layout.motors.every(finiteVec), `${frame.id}: motors`);
  check(finiteVec(layout.battery) && finiteVec(layout.video) && finiteVec(layout.stack), `${frame.id}: mount points`);
  for (const mount of frame.data.accessory_mounts) check(finiteVec(layout.accessories[mount].position), `${frame.id}: ${mount} anchor`);
  if (frame.model.kind !== 'model') {
    const shapes = proceduralFrame(frame, layout, catalog);
    check(shapes.length > 4 && shapes.every((s) => finiteVec(s.center) && s.size.every((n) => Number.isFinite(n) && n > 0)), `${frame.id}: procedural shape`);
  } else if (models.has(frame.id)) {
    // Real size (render definitions with a "transformation" are baked): the frame model reaches its motor positions.
    const box = models.get(frame.id).variants.base.box;
    const reach = (lo, hi) => Math.max(Math.abs(lo - 8), Math.abs(hi - 8)) * 8;
    for (const [axis, lo, hi] of [[0, box[0], box[3]], [2, box[2], box[5]]]) {
      const motor = Math.max(...layout.motors.map((m) => Math.abs(m[axis])));
      const ratio = reach(lo, hi) / motor;
      check(ratio >= 0.95 && ratio <= 2.5, `${frame.id}: model reaches ${ratio.toFixed(2)}× the motor distance on ${axis ? 'z' : 'x'}`);
    }
  }
}
check(proceduralAccessoryBase(0xd6333a).length === 8, 'top mount base shape');

for (const preset of catalog.presets) {
  const build = catalog.presetBuild(preset.id);
  build.accessories = {};
  for (const acc of catalog.partsIn('accessory')) {
    if (catalog.part(build.frame).data.accessory_mounts.includes(acc.data.slot)) build.accessories[acc.data.slot] = acc.id;
  }
  const a = assemble(build, env);
  check(a.missing.length === 0 && a.layout, `${preset.id}: assembles`);
  const expected = 1 + 3 + 8 + Object.keys(build.accessories).length + (build.accessories.top ? 1 : 0);
  check(a.pieces.length === expected, `${preset.id}: ${a.pieces.length} pieces, expected ${expected}`);
  check(a.pieces.every((p) => finiteVec(p.position)), `${preset.id}: finite positions`);
  const props = a.pieces.filter((p) => p.role === 'prop');
  const motors = a.pieces.filter((p) => p.role === 'motor');
  check(props.every((p, i) => p.position[1] > motors[i].position[1]), `${preset.id}: props above the motors`);
  check(props.filter((p) => p.counterClockwise).length === 2, `${preset.id}: two counter-clockwise props`);
  const modelOf = (id) => models.get(id) || null;
  const defaults = paintDefaults(a.pieces, modelOf, render);
  const available = paintAvailable(a.pieces, modelOf, render, PAINT_SLOTS);
  check(available.has('motors') && available.has('prop_fl'), `${preset.id}: paintable motors and props`);
  check(Object.values(defaults).every((c) => /^#[0-9a-f]{6}$/.test(c)), `${preset.id}: default colours`);
  const prop = models.get(build.prop);
  const tints = paintTints(prop.variants.paint.groups, { prop_fr: '#ff0000' }, 0, render.channels);
  check(tints === null, `${preset.id}: front-left prop unpainted when only front-right is painted`);
}

// The camera preview draws the FPV rig of the analysis (fpv.js); its hubs must sit where the drone renderer puts the
// props, for every frame with every preset's other parts (built-in layouts, arms, motor seats).
{
  let rigs = 0;
  let worst = 0;
  for (const preset of catalog.presets) {
    for (const frame of catalog.partsIn('frame')) {
      const build = { ...catalog.presetBuild(preset.id), frame: frame.id, accessories: {} };
      const view = catalog.cameraView(build);
      if (!view) continue;
      const a = assemble(build, env);
      const props = a.pieces.filter((p) => p.role === 'prop');
      rigs++;
      props.forEach((p, slot) => {
        const hub = view.rig.hubs[slot];
        const d = Math.max(...hub.map((v, k) => Math.abs(v - p.position[k])));
        worst = Math.max(worst, d);
        check(d < 1e-3, `${preset.id} on ${frame.id}: FPV hub ${slot} ${hub} vs prop ${p.position}`);
      });
      check(view.uptilt_deg === Math.fround(a.cameraTilt), `${preset.id} on ${frame.id}: uptilt ${view.uptilt_deg} vs ${a.cameraTilt}`);
    }
  }
  console.log(`FPV rig: ${rigs} builds, prop hubs within ${worst.toExponential(1)} mm of the drone renderer's props`);
}

// Unknown parts are left out, not drawn.
const unknown = { ...catalog.presetBuild('propwash:freestyle'), motor: '?7:mystery_motor' };
const u = assemble(unknown, env);
check(u.missing.includes('?7:mystery_motor') && !u.pieces.some((p) => p.role === 'motor'), 'unknown motor is left out');
check(assemble({ ...unknown, frame: 'other:frame' }, env).layout === null, 'unknown frame gives no layout');

if (failures.length) {
  console.error(failures.slice(0, 40).join('\n'));
  console.error(`FAIL: ${failures.length} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`PASS: ${checks} checks`);
