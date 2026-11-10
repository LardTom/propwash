#!/usr/bin/env node
// Checks the 3D data of the configurator's drone viewer:
//   - every part with a model has a model file with geometry and PNG textures
//   - paint tints: PaintChannel.tint(base) of every tint group equals the default tint of the "_paint" render
//     definition in the web export (only when the export is available)
//   - every preset and every frame assembles with finite positions; built-in frames use drone_layout.json
//   - frame models are drawn at real size: they reach their motor positions (render "transformation" baked in)
//   - batteries under a frame (on_top false) hang from the battery point: top of the pack at the point (the strap of an
//     "_under" model up to 4 mm through the plate), bottom below the battery plate, the "_under" model where the pack
//     has one (DroneAssembly.batteryPart)
//   - picking in the 3D view: every placed piece belongs to a part category, and its paint slots (per tint group and
//     its main slot) are slots the build's paint panel shows; the clicks themselves: tools/test-configurator-pick.mjs
//   - battery plugged in, plugs hidden (Propwash 0.6.0, PowerLead / PlugMask): for every valid combination of a frame,
//     battery and stack with models no plug and no lead – the mounted stack without its two pigtails, the battery
//     without its socket, the two leads in front of it and what lies behind the pack's rear face (balance lead and
//     plug), the pack drawn, no extra piece; the hidden part of the 1300 and of the whoop battery with the numbers of
//     the mod's PlugAnchorsTest; the fallbacks (no mounted variant, no socket) draw stack and battery as before
//   - recessed accessories (Propwash 0.6.0, recess_mm and drop_mm, finding AUTO60-1): on every frame and mount the body
//     sits at AccessoryAnchor#modelOrigin (anchor plus [0, −drop, recess] turned by the tilt), not at the anchor; the
//     top mount's base, tilt and stretch stay; the analysis moves the box like the game; the jar path reads and exports
//     both fields like PartJson and PartData
//   - VTX antennas (Propwash 0.6.0): every frame has an antenna holder; a VTX whose model lists the faces of its antenna
//     elements (or a VTX without a model) adds one antenna piece drawn from shapes (category video, paint slot
//     antenna), a VTX model of older data (antennas in the model) none; the rest: tools/test-configurator-antenna.mjs
//
//   node tools/test-configurator-render.mjs [--export <web-export dir>]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCatalog } from '../assets/js/configurator/data.js';
import {
  assemble, frameLayout, proceduralFrame, proceduralAccessoryBase, pieceCategory, SLOTS, MM_PER_MODEL_UNIT, PROP_SLOTS, batteryBelow,
  antennaMask,
} from '../assets/js/configurator/assembly.js';
import { batteryFit } from '../assets/js/configurator/rules.js';
import { channelTint, rgbOf, paintTints, paintDefaults, paintAvailable, groupsOf, pieceSlots } from '../assets/js/configurator/paint.js';
import { PAINT_SLOTS } from '../assets/js/configurator/sharecode.js';
import { exportDir } from './build-configurator-data.mjs';
import { decodePart } from '../assets/js/configurator/partjson.js';
import { exportData } from '../assets/js/configurator/catalog-build.js';
import { airframe } from '../assets/js/configurator/analysis.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'assets/data/configurator');
const catalog = createCatalog(JSON.parse(fs.readFileSync(path.join(DATA, 'catalog.json'), 'utf8')));
const render = JSON.parse(fs.readFileSync(path.join(DATA, 'render.json'), 'utf8'));

let checks = 0;
const failures = [];
function check(ok, message) {
  checks++;
  if (!ok) failures.push(message);
  return !!ok;
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
if (fs.existsSync(path.join(dir, 'manifest.json')) && JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).format === 2) {
  let compared = 0;
  for (const part of catalog.parts) {
    const model = models.get(part.id);
    if (!model) continue;
    for (const [plain, painted] of [['', 'paint'], ['_ccw', 'ccw_paint']]) {
      const v = model.variants[painted];
      if (!v) continue;
      const def = JSON.parse(fs.readFileSync(path.join(dir, part.id.split(':')[0], part.model.drone.replace(/\.json$/, `${plain}_paint.json`)), 'utf8')).model;
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
const PICK_CATEGORIES = ['frame', 'stack', 'motor', 'prop', 'video', 'battery', 'accessory'];
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
  check(finiteVec(layout.battery) && finiteVec(layout.video) && finiteVec(layout.stack) && finiteVec(layout.antenna) && Number.isFinite(layout.antennaTilt),
    `${frame.id}: mount points`);
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

// Accessories for the front mount (add-ons like a gimbal or a dispenser mount): drawn at the frame's front anchor,
// without a base and unstretched (DroneAssembly, AccessoryAnchor.fallback FRONT: 0, 0, -0.3 × wheelbase, no tilt), and
// counted by the flight analysis like the game's ParamDerivation (every mount: mass, power, frontal area, inertia).
{
  const json = JSON.parse(fs.readFileSync(path.join(DATA, 'catalog.json'), 'utf8'));
  const gripper = json.parts.find((p) => p.id === 'propwash:gripper');
  const front = { ...gripper, id: 'propwash:front_test', data: { ...gripper.data, slot: 'front' } };
  json.parts.push(front);
  const withFront = createCatalog(json);
  const fenv = { catalog: withFront, render, model: (id) => models.get(id === front.id ? gripper.id : id) || null };
  let frames = 0;
  for (const frame of withFront.partsIn('frame').filter((f) => f.data.accessory_mounts.includes('front'))) {
    frames++;
    const build = { ...withFront.presetBuild('propwash:freestyle'), frame: frame.id, accessories: { front: front.id } };
    const a = assemble(build, fenv);
    const piece = a.pieces.find((x) => x.role === 'accessory' && x.mount === 'front');
    const anchor = frameLayout(frame, withFront, render).accessories.front;
    check(!!piece && JSON.stringify(piece.position) === JSON.stringify(anchor.position), `${frame.id}: front accessory at the front anchor (${piece && piece.position} / ${anchor.position})`);
    check(!!piece && piece.stretchX === 1 && piece.tiltX === anchor.tilt, `${frame.id}: front accessory unstretched with the anchor's tilt`);
    check(!a.pieces.some((x) => x.role === 'accessory_base' && x.mount === 'front'), `${frame.id}: no base on the front mount`);
    const without = withFront.analyze({ ...build, accessories: {} });
    const loaded = withFront.analyze(build);
    check(!!without && !!loaded && Math.abs(loaded.mass_grams - without.mass_grams - front.basics.mass_g) < 1e-9,
      `${frame.id}: the flight analysis weighs the front accessory (${loaded && loaded.mass_grams} g = ${without && without.mass_grams} g + ${front.basics.mass_g} g)`);
    check(!!without && !!loaded && Math.abs(loaded.avionics_power_w - without.avionics_power_w - front.data.flight_battery_w) < 1e-9,
      `${frame.id}: the flight analysis counts the power of the front accessory (${loaded && loaded.avionics_power_w} W)`);
  }
  check(frames > 0, `frames with a front mount (${frames})`);
  const plain = withFront.partsIn('frame').find((f) => !(f.data.accessory_anchors && f.data.accessory_anchors.front));
  const bare = { ...plain, data: { ...plain.data, accessory_anchors: {}, accessory_mounts: ['front'] } };
  const fallback = frameLayout(bare, withFront, null).accessories.front;
  const wb = bare.data.wheelbase_mm;
  check(fallback && JSON.stringify(fallback.position) === JSON.stringify([0, 0, -0.3 * wb]) && fallback.tilt === 0 && fallback.length === 0,
    `front anchor without a table: 0, 0, -0.3 × wheelbase, no tilt (${fallback && JSON.stringify(fallback)})`);
}

// Recessed accessories (Propwash 0.6.0, recess_mm and drop_mm of an accessory, finding AUTO60-1): the box sits that far
// behind the anchor and that far lower (AccessoryType#boxMinMm/boxMaxMm), the body is drawn at AccessoryAnchor#modelOrigin
// – the anchor plus [0, −drop, recess] turned by the anchor's tilt – instead of at the anchor in front of the nose; the
// base of the top mount stays at the anchor, tilt and stretch stay. The flight analysis moves the box with it (the same
// figures as the plain accessory on an anchor moved to that origin). The jar path reads both fields like PartJson (0 up
// to the depth or the height, else the game's refusal, never an unknown field) and exports them like PartData (only
// when not 0, after everything else).
{
  const RECESS = 58;
  const DROP = 1.5;
  const near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  const nearVec = (a, b) => Array.isArray(a) && a.length === b.length && a.every((v, i) => near(v, b[i]));
  const origin = (pos, tilt, recess, drop) => {
    const t = tilt * Math.PI / 180;
    return [pos[0], pos[1] + (-drop * Math.cos(t) - recess * Math.sin(t)), pos[2] + (-drop * Math.sin(t) + recess * Math.cos(t))];
  };
  const json = JSON.parse(fs.readFileSync(path.join(DATA, 'catalog.json'), 'utf8'));
  const gripper = json.parts.find((p) => p.id === 'propwash:gripper');
  const { hangs_straight: _straight, ...tiltedData } = gripper.data;
  const testPart = (id, slot, size, extra) => ({ ...gripper, id, builtin: false, data: { ...tiltedData, slot, size_mm: size, ...extra } });
  const shifted = { front: [RECESS, DROP], top: [12, 4], bottom: [30, 5] };
  const sizes = { front: [62, 58, 64], top: [30, 22, 70], bottom: [24, 18, 90] };
  for (const slot of ['front', 'top', 'bottom']) {
    json.parts.push(testPart(`recesstest:${slot}`, slot, sizes[slot], { recess_mm: shifted[slot][0], drop_mm: shifted[slot][1] }));
    json.parts.push(testPart(`recesstest:${slot}_plain`, slot, sizes[slot], {}));
  }
  const rc = createCatalog(json);
  const renv = { catalog: rc, render, model: (id) => models.get(id.startsWith('recesstest:') ? gripper.id : id) || null };
  const placed = { front: 0, top: 0, bottom: 0 };
  for (const frame of rc.partsIn('frame')) {
    const layout = frameLayout(frame, rc, render);
    for (const slot of frame.data.accessory_mounts) {
      const build = { ...rc.presetBuild('propwash:freestyle'), frame: frame.id, accessories: { [slot]: `recesstest:${slot}` } };
      const a = assemble(build, renv);
      const piece = a.pieces.find((x) => x.role === 'accessory' && x.mount === slot);
      const plain = assemble({ ...build, accessories: { [slot]: `recesstest:${slot}_plain` } }, renv).pieces.find((x) => x.role === 'accessory' && x.mount === slot);
      const anchor = layout.accessories[slot];
      const expected = origin(anchor.position, anchor.tilt, ...shifted[slot]);
      check(!!piece && nearVec(piece.position, expected),
        `${frame.id}: ${slot} accessory with recess_mm ${shifted[slot][0]} and drop_mm ${shifted[slot][1]} at AccessoryAnchor#modelOrigin ${JSON.stringify(expected)}, not at ${JSON.stringify(piece && piece.position)}`);
      check(!!plain && JSON.stringify(plain.position) === JSON.stringify(anchor.position), `${frame.id}: ${slot} accessory without the fields at the anchor`);
      check(!!piece && !!plain && piece.tiltX === plain.tiltX && piece.stretchX === plain.stretchX, `${frame.id}: ${slot} recessed accessory keeps tilt and stretch`);
      if (slot === 'top') {
        const base = a.pieces.find((x) => x.role === 'accessory_base' && x.mount === 'top');
        check(!!base && JSON.stringify(base.position) === JSON.stringify(anchor.position), `${frame.id}: the top mount's base stays at the anchor`);
      }
      placed[slot]++;
    }
  }
  check(placed.front > 0 && placed.top > 0 && placed.bottom > 0, `frames with each mount (${JSON.stringify(placed)})`);

  let analysed = 0;
  for (const frame of rc.partsIn('frame').filter((f) => f.data.accessory_mounts.includes('front'))) {
    const build = { ...rc.presetBuild('propwash:freestyle'), frame: frame.id, accessories: { front: 'recesstest:front' } };
    const plainBuild = { ...build, accessories: { front: 'recesstest:front_plain' } };
    const spec = frame.data.accessory_anchors && frame.data.accessory_anchors.front;
    const pos = spec ? spec.pos : [0, 0, -0.3 * frame.data.wheelbase_mm];
    const tilt = spec ? spec.tilt_deg : 0;
    const moved = JSON.parse(JSON.stringify(json));
    const movedFrame = moved.parts.find((p) => p.id === frame.id);
    movedFrame.data.accessory_anchors = { ...(movedFrame.data.accessory_anchors || {}),
      front: { pos: origin(pos, tilt, RECESS, DROP), tilt_deg: tilt, length_mm: spec ? spec.length_mm : 0 } };
    const recessed = airframe(build, rc);
    const atAnchor = airframe(plainBuild, rc);
    const atOrigin = airframe(plainBuild, createCatalog(moved));
    if (!recessed || !atOrigin || !atAnchor) {
      check(false, `${frame.id}: analysis with the recessed front accessory`);
      continue;
    }
    const keys = Object.keys(atOrigin).filter((k) => typeof atOrigin[k] === 'number');
    const off = keys.filter((k) => !near(recessed[k], atOrigin[k]));
    check(!off.length, `${frame.id}: the analysis moves the recessed box like the game (${off.slice(0, 4).map((k) => `${k} ${recessed[k]} ≠ ${atOrigin[k]}`).join(', ')})`);
    check(!near(atAnchor.inertiaXx, atOrigin.inertiaXx), `${frame.id}: recess and drop change the inertia (${atAnchor.inertiaXx} / ${atOrigin.inertiaXx})`);
    analysed++;
  }
  check(analysed > 0, `analyses with a recessed front accessory (${analysed})`);

  const file = { format: 1, mass_g: 150.0, slot: 'front', size_mm: [62.0, 58.0, 64.0], flight_battery_w: 1.2, frontal_area_m2: 0.0036, sort: 0 };
  const read = (extra) => decodePart('accessory', 'recesstest:dispenser', JSON.stringify({ ...file, ...extra }));
  const r = read({ recess_mm: RECESS, drop_mm: DROP });
  check(!!r.definition && r.definition.recessMm === RECESS && r.definition.dropMm === DROP, `partjson: recess_mm and drop_mm read (${r.definition && [r.definition.recessMm, r.definition.dropMm]})`);
  check(!r.warnings.some((w) => w.includes('recess_mm') || w.includes('drop_mm')), `partjson: recess_mm and drop_mm are no unknown fields (${r.warnings.join(' | ')})`);
  const out = r.definition ? exportData(r.definition) : {};
  const keys = Object.keys(out);
  check(out.recess_mm === RECESS && out.drop_mm === DROP && keys.indexOf('recess_mm') === keys.length - 2 && keys.indexOf('drop_mm') === keys.length - 1,
    `jar export: recess_mm and drop_mm last, like PartData (${keys.join(', ')})`);
  const none = read({});
  check(!!none.definition && none.definition.recessMm === 0 && none.definition.dropMm === 0 && !('recess_mm' in exportData(none.definition)) && !('drop_mm' in exportData(none.definition)),
    'partjson: without the fields 0, the export without them');
  const recessOnly = read({ recess_mm: 23 });
  check(!!recessOnly.definition && 'recess_mm' in exportData(recessOnly.definition) && !('drop_mm' in exportData(recessOnly.definition)), 'jar export: only the field that is set');
  const deep = read({ recess_mm: 70 });
  check(deep.definition === null && deep.errors.some((e) => e.includes('recess_mm muss zwischen 0 und der Tiefe 64')), `partjson: recess_mm beyond the depth refused (${deep.errors[0] || 'no error'})`);
  const low = read({ drop_mm: -1 });
  check(low.definition === null && low.errors.some((e) => e.includes('drop_mm muss zwischen 0 und der Höhe 58')), `partjson: a negative drop_mm refused (${low.errors[0] || 'no error'})`);
  const text = read({ recess_mm: 'far' });
  check(text.definition === null && text.errors.some((e) => e.includes('recess_mm')), `partjson: recess_mm as text refused (${text.errors[0] || 'no error'})`);
  const fromJar = createCatalog({ ...json, parts: [...json.parts, testPart('recesstest:jar', 'front', [62, 58, 64], r.definition ? exportData(r.definition) : {})] });
  const jarEnv = { catalog: fromJar, render, model: () => null };
  const fs5 = fromJar.part('propwash:freestyle_5');
  const jarPiece = assemble({ ...fromJar.presetBuild('propwash:freestyle'), accessories: { front: 'recesstest:jar' } }, jarEnv).pieces.find((x) => x.role === 'accessory');
  const fs5Anchor = frameLayout(fs5, fromJar, render).accessories.front;
  check(!!jarPiece && nearVec(jarPiece.position, origin(fs5Anchor.position, fs5Anchor.tilt, RECESS, DROP)),
    `jar part with recess_mm on freestyle_5: ${JSON.stringify(jarPiece && jarPiece.position)} behind the anchor ${JSON.stringify(fs5Anchor.position)}`);
}

// Straight-hanging accessories (Propwash 0.6.0, hangs_straight in the web export since FBW-1, finding G-AUTO60-1-1): the
// gripper and every accessory with hangs_straight hang without the mount's tilt (AccessoryAnchor#tiltFor 0) and are not
// stretched to the anchor length (#stretch 1.0); an accessory with an LED path is not stretched either. recess_mm and
// drop_mm turn with that tilt (#modelOrigin). The flight analysis takes the same box (#centerOf, the size with #stretch):
// on freestyle_5 the gripper below gives the game's inertiaXx 0.0015485 and authorityPitch 1819.1. The jar path exports
// hangs_straight like PartData (only when true, last).
{
  const near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  const nearVec = (a, b) => Array.isArray(a) && a.length === b.length && a.every((v, i) => near(v, b[i]));
  const json = JSON.parse(fs.readFileSync(path.join(DATA, 'catalog.json'), 'utf8'));
  const gripper = json.parts.find((p) => p.id === 'propwash:gripper');
  check(!!gripper && gripper.data.hangs_straight === true, `catalog: the gripper carries hangs_straight like the web export of Propwash (${gripper && JSON.stringify(gripper.data.hangs_straight)})`);

  const live = { ...catalog.presetBuild('propwash:freestyle'), accessories: { bottom: 'propwash:gripper' } };
  const livePiece = assemble(live, env).pieces.find((x) => x.role === 'accessory' && x.mount === 'bottom');
  check(live.frame === 'propwash:freestyle_5' && !!livePiece && livePiece.tiltX === 0 && livePiece.stretchX === 1,
    `freestyle_5 with the gripper below: tiltX 0 and stretchX 1.0 like the game (${livePiece && [livePiece.tiltX, livePiece.stretchX]})`);
  const liveAir = airframe(live, catalog);
  check(!!liveAir && Math.abs(liveAir.inertiaXx - 0.0015485) < 5e-8 && Math.abs(liveAir.authorityPitch - 1819.1) < 0.05,
    `freestyle_5 with the gripper below: inertiaXx 0.0015485 and authorityPitch 1819.1 like the game (${liveAir && [liveAir.inertiaXx, liveAir.authorityPitch]})`);

  const { hangs_straight: _straight, ...tiltedData } = gripper.data;
  const testPart = (id, extra) => ({ ...gripper, id, builtin: false, data: { ...tiltedData, size_mm: [24, 18, 40], ...extra } });
  json.parts.push(testPart('hangtest:straight', { hangs_straight: true, recess_mm: 6, drop_mm: 2 }));
  json.parts.push(testPart('hangtest:plain', { recess_mm: 6, drop_mm: 2 }));
  json.parts.push(testPart('hangtest:leds', { leds: 2, led_path: [[-10, -2, 0], [10, -2, 0]] }));
  const hc = createCatalog(json);
  const henv = { catalog: hc, render, model: () => null };
  let placed = 0;
  let analysed = 0;
  for (const frame of hc.partsIn('frame').filter((f) => f.data.accessory_mounts.includes('bottom'))) {
    const layout = frameLayout(frame, hc, render);
    const anchor = layout.accessories.bottom;
    const build = (id) => ({ ...hc.presetBuild('propwash:freestyle'), frame: frame.id, accessories: { bottom: id } });
    const piece = (id) => assemble(build(id), henv).pieces.find((x) => x.role === 'accessory' && x.mount === 'bottom');
    const straight = piece('hangtest:straight');
    const plain = piece('hangtest:plain');
    const leds = piece('hangtest:leds');
    const p = anchor.position;
    check(!!straight && straight.tiltX === 0 && straight.stretchX === 1 && nearVec(straight.position, [p[0], p[1] - 2, p[2] + 6]),
      `${frame.id}: hangs_straight below without tilt and stretch, recess and drop not turned (${straight && JSON.stringify([straight.tiltX, straight.stretchX, straight.position])})`);
    check(!!plain && plain.tiltX === anchor.tilt, `${frame.id}: an accessory without hangs_straight keeps the tilt ${anchor.tilt} (${plain && plain.tiltX})`);
    check(!!leds && leds.stretchX === 1 && leds.tiltX === anchor.tilt, `${frame.id}: an accessory with an LED path is not stretched (${leds && [leds.tiltX, leds.stretchX]})`);
    placed++;

    const spec = frame.data.accessory_anchors && frame.data.accessory_anchors.bottom;
    const wheelbase = frame.data.wheelbase_mm;
    const pos = spec ? spec.pos : [0, -3, -0.25 * wheelbase];
    const tilt = spec ? spec.tilt_deg : 30;
    const length = spec ? spec.length_mm : 0.15 * wheelbase;
    const flat = JSON.parse(JSON.stringify(json));
    const flatFrame = flat.parts.find((x) => x.id === frame.id);
    flatFrame.data.accessory_anchors = { ...(flatFrame.data.accessory_anchors || {}), bottom: { pos, tilt_deg: 0, length_mm: 0 } };
    const unstretched = JSON.parse(JSON.stringify(json));
    const unstretchedFrame = unstretched.parts.find((x) => x.id === frame.id);
    unstretchedFrame.data.accessory_anchors = { ...(unstretchedFrame.data.accessory_anchors || {}), bottom: { pos, tilt_deg: tilt, length_mm: 0 } };
    const pairs = [
      ['hangs_straight', airframe(build('hangtest:straight'), hc), airframe(build('hangtest:plain'), createCatalog(flat))],
      ['LED path', airframe(build('hangtest:leds'), hc), airframe(build('hangtest:leds'), createCatalog(unstretched))],
    ];
    for (const [what, got, want] of pairs) {
      if (!got || !want) {
        check(false, `${frame.id}: analysis with the ${what} accessory below`);
        continue;
      }
      const keys = Object.keys(want).filter((k) => typeof want[k] === 'number');
      const off = keys.filter((k) => !near(got[k], want[k]));
      check(!off.length, `${frame.id}: the analysis takes the ${what} accessory like the game (${off.slice(0, 4).map((k) => `${k} ${got[k]} ≠ ${want[k]}`).join(', ')})`);
    }
    if (length > 0 && tilt !== 0) {
      const tilted = airframe(build('hangtest:plain'), hc);
      const straightAir = airframe(build('hangtest:straight'), hc);
      check(!!tilted && !!straightAir && !near(tilted.inertiaXx, straightAir.inertiaXx), `${frame.id}: hangs_straight changes the inertia (${tilted && tilted.inertiaXx} / ${straightAir && straightAir.inertiaXx})`);
    }
    analysed++;
  }
  check(placed > 0 && analysed > 0, `frames with a bottom mount (${placed})`);

  const file = { format: 1, mass_g: 20.0, slot: 'bottom', size_mm: [24.0, 20.0, 22.0], flight_battery_w: 0.3, frontal_area_m2: 0.0004, sort: 0 };
  const read = (extra) => decodePart('accessory', 'hangtest:claw', JSON.stringify({ ...file, ...extra }));
  const yes = read({ hangs_straight: true, recess_mm: 4 });
  const out = yes.definition ? exportData(yes.definition) : {};
  const keys = Object.keys(out);
  check(out.hangs_straight === true && keys.indexOf('hangs_straight') === keys.length - 1 && keys.indexOf('recess_mm') === keys.length - 2,
    `jar export: hangs_straight true last, after recess_mm, like PartData (${keys.join(', ')})`);
  const no = read({ hangs_straight: false });
  check(!!no.definition && !('hangs_straight' in exportData(no.definition)), 'jar export: hangs_straight only when true');
  const jarCatalog = createCatalog({ ...json, parts: [...json.parts, testPart('hangtest:jar', out)] });
  const jarPiece = assemble({ ...jarCatalog.presetBuild('propwash:freestyle'), accessories: { bottom: 'hangtest:jar' } }, { catalog: jarCatalog, render, model: () => null })
    .pieces.find((x) => x.role === 'accessory');
  check(!!jarPiece && jarPiece.tiltX === 0 && jarPiece.stretchX === 1, `jar part with hangs_straight on freestyle_5 hangs straight (${jarPiece && [jarPiece.tiltX, jarPiece.stretchX]})`);
}

for (const preset of catalog.presets) {
  const build = catalog.presetBuild(preset.id);
  build.accessories = {};
  for (const acc of catalog.partsIn('accessory')) {
    if (catalog.part(build.frame).data.accessory_mounts.includes(acc.data.slot)) build.accessories[acc.data.slot] = acc.id;
  }
  const a = assemble(build, env);
  check(a.missing.length === 0 && a.layout, `${preset.id}: assembles`);
  const antenna = antennaMask(models.get(build.video) || null) === null ? 0 : 1;
  const expected = 1 + 3 + 8 + antenna + Object.keys(build.accessories).length + (build.accessories.top ? 1 : 0);
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
  // Picking: what a click on each piece selects.
  for (const piece of a.pieces) {
    const label = `${preset.id}: pick ${piece.role} ${piece.id}`;
    check(PICK_CATEGORIES.includes(pieceCategory(piece)), `${label}: category ${pieceCategory(piece)}`);
    const { groups, main } = pieceSlots(piece, groupsOf(piece, modelOf(piece.id), render));
    check(main !== null && available.has(main) && groups.every((slot) => available.has(slot)), `${label}: paint slots ${main} / ${groups}`);
    if (piece.role === 'prop') check(main === PROP_SLOTS[piece.slot], `${label}: prop paint slot ${main} at position ${piece.slot}`);
    if (piece.role === 'video') check(main === 'camera', `${label}: video paints the camera slot, not ${main}`);
    if (piece.role === 'antenna') check(main === 'antenna' && pieceCategory(piece) === 'video', `${label}: the antenna paints the antenna slot, not ${main}`);
  }
}
check(pieceCategory({ role: 'accessory_base', mount: 'top' }) === 'accessory', 'top mount base belongs to the accessories');
check(pieceSlots({ role: 'accessory_base' }, [['tpu', '#d6333a']]).main === 'tpu', 'top mount base paints TPU');
check(pieceSlots({ role: 'accessory' }, [['tpu', '#000000'], ['accessory', '#111111']]).main === 'accessories', 'accessory with TPU parts paints the accessory slot');
check(pieceSlots({ role: 'prop', paintPosition: 3 }, [['prop', '#000000']]).groups[0] === 'prop_rr', 'rear right prop paints prop_rr');
check(pieceSlots({ role: 'frame' }, null).main === null, 'a frame without tint groups cannot be painted');

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

// Batteries under the frame: every frame with on_top false and every battery with a model.
{
  const base = catalog.presetBuild('propwash:freestyle');
  let hanging = 0;
  let under = 0;
  for (const frame of catalog.partsIn('frame')) {
    if (!batteryBelow(frame)) continue;
    const layout = frameLayout(frame, catalog, render);
    const plate = frame.data.battery.plate_mm;
    for (const battery of catalog.partsIn('battery')) {
      const model = models.get(battery.id);
      if (!model) continue;
      const piece = assemble({ ...base, frame: frame.id, battery: battery.id }, env).pieces.find((p) => p.role === 'battery');
      const variant = piece && model.variants[piece.variant || 'base'];
      if (!piece || !variant || !variant.box) {
        check(false, `${battery.id} on ${frame.id}: no battery piece with a model box`);
        continue;
      }
      const top = (variant.box[4] - 8) * MM_PER_MODEL_UNIT + piece.position[1];
      const bottom = (variant.box[1] - 8) * MM_PER_MODEL_UNIT + piece.position[1];
      const label = `${battery.id} on ${frame.id} (${piece.variant || 'base'})`;
      // "_under" models: the strap runs up through the battery plate, at most 4 mm (RaceBatteryAssetsTest).
      const reach = piece.variant === 'under' ? 4.01 : 1.01;
      check(top <= layout.battery[1] + reach, `${label}: model reaches ${(top - layout.battery[1]).toFixed(1)} mm above the battery point ${layout.battery[1]}`);
      check(bottom < plate, `${label}: bottom of the pack ${bottom.toFixed(1)} mm not below the battery plate ${plate} mm`);
      check(!model.variants.under || piece.variant === 'under', `${label}: "_under" model not used`);
      hanging++;
      if (piece.variant === 'under') under++;
    }
  }
  check(hanging > 0 && under > 0, `batteries under the frame: ${hanging} builds, ${under} with an "_under" model`);
  console.log(`Batteries under the frame: ${hanging} builds, ${under} with the "_under" model`);
}

// Battery plugged in, plugs hidden: every valid combination of frame, battery and stack with models.
{
  // Box of a compact element in mm around the model point, corners rotated X, then Y, then Z (like the asset kit).
  const elementBox = (el) => {
    const rot = el[6];
    const r = Math.PI / 180;
    const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const x of [el[0], el[3]]) for (const y of [el[1], el[4]]) for (const z of [el[2], el[5]]) {
      let p = [x, y, z];
      if (rot) {
        let [px, py, pz] = [x - rot[0], y - rot[1], z - rot[2]];
        [py, pz] = [py * Math.cos(rot[3] * r) - pz * Math.sin(rot[3] * r), py * Math.sin(rot[3] * r) + pz * Math.cos(rot[3] * r)];
        [px, pz] = [px * Math.cos(rot[4] * r) + pz * Math.sin(rot[4] * r), -px * Math.sin(rot[4] * r) + pz * Math.cos(rot[4] * r)];
        [px, py] = [px * Math.cos(rot[5] * r) - py * Math.sin(rot[5] * r), px * Math.sin(rot[5] * r) + py * Math.cos(rot[5] * r)];
        p = [px + rot[0], py + rot[1], pz + rot[2]];
      }
      p.forEach((v, i) => {
        box[i] = Math.min(box[i], (v - 8) * MM_PER_MODEL_UNIT);
        box[i + 3] = Math.max(box[i + 3], (v - 8) * MM_PER_MODEL_UNIT);
      });
    }
    return box;
  };
  const elementsOf = (model, name) => {
    const v = model.variants[name];
    return (v.of ? model.variants[v.of] : v).el;
  };
  const within = (b, outer) => outer && [0, 1, 2].every((i) => b[i] >= outer[i] - 0.01 && b[i + 3] <= outer[i + 3] + 0.01);
  const unionOf = (boxes) => boxes.reduce((h, b) => [Math.min(h[0], b[0]), Math.min(h[1], b[1]), Math.min(h[2], b[2]), Math.max(h[3], b[3]),
    Math.max(h[4], b[4]), Math.max(h[5], b[5])]);
  const volume = (b) => (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]);
  let combos = 0;
  let fallbacks = 0;
  const hiddenCounts = {};
  for (const frame of catalog.partsIn('frame').filter((f) => models.has(f.id))) {
    const preset = catalog.presets.find((p) => catalog.part(p.build.frame).data.role === frame.data.role) || catalog.presets[0];
    for (const battery of catalog.partsIn('battery').filter((b) => models.has(b.id) && ['ok', 'weak'].includes(batteryFit(frame, b)))) {
      for (const stack of catalog.partsIn('stack').filter((st) => models.has(st.id) && frame.data.stack_mounts.includes(st.data.mount))) {
        const build = { ...catalog.presetBuild(preset.id), frame: frame.id, battery: battery.id, stack: stack.id, accessories: {} };
        const label = `${frame.id} + ${battery.id} + ${stack.id}`;
        const a = assemble(build, env);
        const stackPiece = a.pieces.find((p) => p.role === 'stack');
        const batteryPiece = a.pieces.find((p) => p.role === 'battery');
        check(!a.pieces.some((p) => p.procedural && !['frame', 'accessory_base', 'antenna'].includes(p.procedural)), `${label}: no extra piece`);
        const stackModel = models.get(stack.id);
        const batteryModel = models.get(battery.id);
        const mounted = stackModel.variants.mounted;
        const variantName = batteryPiece.variant || 'base';
        const socket = batteryModel.variants[variantName].socket;
        if (!mounted || !mounted.pigtail || !socket) {
          check(!a.plugsHidden && !stackPiece.variant && !stackPiece.hide && !batteryPiece.hide, `${label}: drawn as before without a mounted stack or socket`);
          fallbacks++;
          continue;
        }
        combos++;
        if (!check(a.plugsHidden && stackPiece.variant === 'mounted' && Array.isArray(stackPiece.hide) && Array.isArray(batteryPiece.hide),
          `${label}: plugs hidden, mounted stack`)) continue;
        const stackBoxes = elementsOf(stackModel, 'mounted').map(elementBox);
        const ends = stackPiece.hide.map((i) => stackBoxes[i][5]).sort((x, y) => x - y);
        check(stackPiece.hide.length === 2 && ends.every((z, i) => Math.abs(z - [...mounted.pigtail].map((l) => l[2]).sort((x, y) => x - y)[i]) < 0.01),
          `${label}: the two pigtails left out (${stackPiece.hide})`);
        const boxes = elementsOf(batteryModel, variantName).map(elementBox);
        const hidden = batteryPiece.hide.map((i) => boxes[i]);
        const inSocket = hidden.filter((b) => within(b, socket.body) || within(b, socket.grip)).length;
        const leads = hidden.filter((b) => !within(b, socket.body) && Math.abs(b[5] - socket.body[2]) < 0.01);
        const packRear = Math.min(...leads.map((b) => b[2]));
        const behind = boxes.filter((b) => b[2] >= packRear - 0.01).length;
        check(leads.length === 2 && inSocket >= 1 && behind === hidden.length, `${label}: socket (${inSocket}), two leads (${leads.length}) and `
          + `everything behind the pack face (${behind}) left out, ${hidden.length} in all`);
        check(Math.abs(unionOf(hidden)[5] - socket.body[5]) < 0.01, `${label}: hidden part ends at the socket face`);
        const biggest = boxes.reduce((best, b, i) => (volume(b) > volume(boxes[best]) ? i : best), 0);
        check(!batteryPiece.hide.includes(biggest), `${label}: the pack is drawn`);
        hiddenCounts[hidden.length] = (hiddenCounts[hidden.length] || 0) + 1;
      }
    }
  }
  check(combos > 200, `combinations with hidden plugs: ${combos}`);
  // The mod's PlugAnchorsTest: the hidden part of the 1300 runs from the pack (78 mm) to the socket face.
  const near = (a, b) => Math.abs(a - b) < 1e-3;
  const freestyle = catalog.presetBuild('propwash:freestyle');
  const fs5 = assemble({ ...freestyle, battery: 'propwash:b6s_1300', accessories: {} }, env);
  const hide1300 = fs5.pieces.find((p) => p.role === 'battery').hide || [];
  const h1300 = hide1300.length ? unionOf(hide1300.map((i) => elementBox(models.get('propwash:b6s_1300').variants.base.el[i]))) : null;
  check(hide1300.length === 6 && near(h1300[0], -8) && near(h1300[3], 14.5) && near(h1300[2], 39) && near(h1300[5], 68.5) && near(h1300[1], 26)
    && h1300[4] <= 34.8 + 1e-3, `1300: connector, grip, two leads, balance lead and plug from 39 to 68.5 mm (${hide1300.length}: ${h1300})`);
  const whoop = assemble({ ...catalog.presetBuild('propwash:whoop'), accessories: {} }, env);
  check(whoop.plugsHidden && (whoop.pieces.find((p) => p.role === 'battery').hide || []).length === 3, 'whoop: BT2.0 socket and two leads left out');
  // Fallbacks: drawn as before.
  const noMount = { ...env, model: (id) => (id === freestyle.stack ? { ...models.get(id), variants: { ...models.get(id).variants, mounted: undefined } } : env.model(id)) };
  const fa = assemble(freestyle, noMount);
  check(!fa.plugsHidden && !fa.pieces.find((p) => p.role === 'stack').variant && !fa.pieces.find((p) => p.role === 'battery').hide,
    'fallback: stack without a mounted variant keeps both plugs');
  const noSocket = { ...env, model: (id) => (id === freestyle.battery ? { ...models.get(id), variants: { ...models.get(id).variants, base: { ...models.get(id).variants.base, socket: undefined } } } : env.model(id)) };
  check(!assemble(freestyle, noSocket).plugsHidden, 'fallback: battery without a socket');
  const noFrame = { ...env, model: (id) => (id === freestyle.frame ? null : env.model(id)) };
  check(assemble(freestyle, noFrame).plugsHidden, 'a frame drawn from its measurements does not matter');
  console.log(`Battery plugged in, plugs hidden: ${combos} combinations of frame, battery and stack (hidden battery elements ${JSON.stringify(hiddenCounts)}), ${fallbacks} drawn as before`);
}

// Unknown parts are left out, not drawn.
const unknown = { ...catalog.presetBuild('propwash:freestyle'), motor: 'pw1.unknown.7:mystery_motor' };
const u = assemble(unknown, env);
check(u.missing.includes('pw1.unknown.7:mystery_motor') && !u.pieces.some((p) => p.role === 'motor'), 'unknown motor is left out');
check(assemble({ ...unknown, frame: 'other:frame' }, env).layout === null, 'unknown frame gives no layout');

if (failures.length) {
  console.error(failures.slice(0, 40).join('\n'));
  console.error(`FAIL: ${failures.length} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`PASS: ${checks} checks`);
