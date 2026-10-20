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
//   - battery plugged in (Propwash 0.6.0, PowerLeadRoute): for every valid combination of a frame, battery and stack
//     with models exactly one plugged pair, the mounted stack, both leads from the pigtail ends to the back of the
//     plug (ends exactly on the anchors; the design allows 0.5 model pixel), the plug on the socket and near the drone; the three reference
//     builds with the same numbers as the mod's PowerLeadRouteTest; the fallbacks (no mounted variant, no socket, a
//     frame drawn from its measurements) draw the stack as before
//
//   node tools/test-configurator-render.mjs [--export <web-export dir>]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCatalog } from '../assets/js/configurator/data.js';
import {
  assemble, frameLayout, proceduralFrame, proceduralAccessoryBase, pieceCategory, SLOTS, MM_PER_MODEL_UNIT, PROP_SLOTS, batteryBelow, plugFamily,
  plugShade, PLUG_COLORS, BEND_CLEARANCE_MM, PLUG_LENGTH_RATIO, MIN_PIECE_MM,
} from '../assets/js/configurator/assembly.js';
import { batteryFit } from '../assets/js/configurator/rules.js';
import { channelTint, rgbOf, paintTints, paintDefaults, paintAvailable, groupsOf, pieceSlots } from '../assets/js/configurator/paint.js';
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
  const plugged = a.pieces.some((p) => p.role === 'power_lead');
  const expected = 1 + 3 + 8 + Object.keys(build.accessories).length + (build.accessories.top ? 1 : 0) + (plugged ? 1 : 0);
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
    if (piece.role === 'power_lead') {
      check(pieceCategory(piece) === 'stack' && main === null && groups.length === 0, `${label}: the lead belongs to the stack and is not paintable`);
      continue;
    }
    check(main !== null && available.has(main) && groups.every((slot) => available.has(slot)), `${label}: paint slots ${main} / ${groups}`);
    if (piece.role === 'prop') check(main === PROP_SLOTS[piece.slot], `${label}: prop paint slot ${main} at position ${piece.slot}`);
    if (piece.role === 'video') check(main === 'camera', `${label}: video paints the camera slot, not ${main}`);
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

// Battery plugged in: every valid combination of frame, battery and stack with models.
{
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const boxOf = (piece) => {
    const model = models.get(piece.id);
    const v = model && model.variants[piece.variant || 'base'];
    if (!v || !v.box) return null;
    return [0, 1, 2, 3, 4, 5].map((i) => (v.box[i] - 8) * MM_PER_MODEL_UNIT + piece.position[i % 3]);
  };
  let combos = 0;
  let longest = 0;
  const families = { XT: 0, BT: 0 };
  for (const frame of catalog.partsIn('frame').filter((f) => models.has(f.id))) {
    const preset = catalog.presets.find((p) => catalog.part(p.build.frame).data.role === frame.data.role) || catalog.presets[0];
    for (const battery of catalog.partsIn('battery').filter((b) => models.has(b.id) && ['ok', 'weak'].includes(batteryFit(frame, b)))) {
      for (const stack of catalog.partsIn('stack').filter((st) => models.has(st.id) && frame.data.stack_mounts.includes(st.data.mount))) {
        const build = { ...catalog.presetBuild(preset.id), frame: frame.id, battery: battery.id, stack: stack.id, accessories: {} };
        const label = `${frame.id} + ${battery.id} + ${stack.id}`;
        const a = assemble(build, env);
        const leads = a.pieces.filter((p) => p.role === 'power_lead');
        const stackPiece = a.pieces.find((p) => p.role === 'stack');
        const batteryPiece = a.pieces.find((p) => p.role === 'battery');
        const mounted = models.get(stack.id).variants.mounted;
        const socket = models.get(battery.id).variants[batteryPiece.variant || 'base'].socket;
        if (!mounted || !socket) {
          check(leads.length === 0 && !stackPiece.variant, `${label}: drawn as before without a mounted stack or socket`);
          continue;
        }
        combos++;
        if (!check(leads.length === 1 && stackPiece.variant === 'mounted', `${label}: one plugged pair, mounted stack`)) continue;
        const route = leads[0].route;
        const family = plugFamily(battery.data.connector) || (socket.bt ? 'BT' : 'XT');
        families[family]++;
        const body = socket.body.map((v, i) => v + batteryPiece.position[i % 3]);
        check(route.plug[2] === body[5] && route.plug[0] === body[0] && route.plug[3] === body[3] && route.plug[1] === body[1] && route.plug[4] === body[4],
          `${label}: plug pushed onto the socket`);
        check(Math.abs(route.plugEndZ - (body[5] + PLUG_LENGTH_RATIO * (body[5] - body[2]))) < 1e-9, `${label}: plug length`);
        const plugs = route.pieces.filter((p) => ['seam', 'plug', 'grip'].includes(p.role));
        check(plugs.length === (family === 'XT' ? 3 : 2), `${label}: one plug (${plugs.length} pieces)`);
        check(route.pieces.find((p) => p.role === 'plug').color === PLUG_COLORS[family] && route.pieces[0].role === 'seam'
          && route.pieces[0].color === plugShade(PLUG_COLORS[family], 0.7), `${label}: colours of a ${family} plug`);
        check(route.wires.length === 2 && route.wires[0].red && !route.wires[1].red, `${label}: red and black lead`);
        const ends = mounted.pigtail.map((l) => [l[0] + stackPiece.position[0], l[1] + stackPiece.position[1], l[2] + stackPiece.position[2]]);
        route.wires.forEach((w, i) => {
          const first = w.segments[0][0];
          const last = w.segments[w.segments.length - 1][1];
          check(dist(first, ends[i]) < 1e-6, `${label}: lead ${i} starts on its pigtail end (${dist(first, ends[i])} mm)`);
          check(Math.abs(last[2] - route.plugEndZ) < 1e-9 && last[0] > route.plug[0] && last[0] < route.plug[3], `${label}: lead ${i} ends at the back of the plug`);
          check(w.segments.every(([p, q]) => dist(p, q) >= MIN_PIECE_MM), `${label}: no piece shorter than ${MIN_PIECE_MM} mm`);
          const length = w.segments.reduce((n, [p, q]) => n + dist(p, q), 0);
          longest = Math.max(longest, length);
          check(length < 400, `${label}: lead ${i} ${length.toFixed(1)} mm`);
        });
        check(route.wires[0].segments.at(-1)[1][0] < route.wires[1].segments.at(-1)[1][0], `${label}: red on the side of the red pigtail`);
        if (!a.layout.powerLeadBend) {
          check(route.bendZ >= route.plugEndZ + BEND_CLEARANCE_MM - 1e-9 && route.bendZ >= Math.max(ends[0][2], ends[1][2]) + BEND_CLEARANCE_MM - 1e-9,
            `${label}: bend behind the plug and the pigtails`);
        }
        check(route.pieces.every((p) => p.box[3] > p.box[0] && p.box[4] > p.box[1] && p.box[5] > p.box[2] && p.box.every(Number.isFinite)), `${label}: no empty piece`);
        // The plug sits at the drone: inside the box of frame and battery plus a margin.
        const hull = [boxOf(a.pieces.find((p) => p.role === 'frame')), boxOf(batteryPiece)].filter(Boolean)
          .reduce((h, b) => [Math.min(h[0], b[0]), Math.min(h[1], b[1]), Math.min(h[2], b[2]), Math.max(h[3], b[3]), Math.max(h[4], b[4]), Math.max(h[5], b[5])]);
        const margin = 20;
        check(route.plug[0] >= hull[0] - margin && route.plug[3] <= hull[3] + margin && route.plug[1] >= hull[1] - margin && route.plug[4] <= hull[4] + margin
          && route.plug[2] >= hull[2] - margin && route.plug[5] <= hull[5] + margin, `${label}: plug inside the drone's box plus ${margin} mm`);
      }
    }
  }
  check(combos > 200 && families.XT > 0 && families.BT > 0, `plugged combinations: ${combos} (${families.XT} XT, ${families.BT} BT)`);
  // The mod's reference builds (PowerLeadRouteTest): same numbers.
  const near = (a, b) => Math.abs(a - b) < 1e-3;
  const reference = [
    ['propwash:freestyle_5', 'propwash:b6s_1300', 'propwash:stack_30', [72.5, 15.5, 84.9, 87.9], [-8, 54.5, 72.5, 8, 62.5, 84.9], 3,
      [[-2.8, 6.2, 38], [-2.8, 6.2, 87.9], [-2.8, 58.5, 87.9], [-2.8, 58.5, 84.9]], [[2.8, 6.2, 38], [2.8, 6.2, 87.9], [2.8, 58.5, 87.9], [2.8, 58.5, 84.9]], 105.2],
    ['propwash:race_5', 'propwash:b6s_1100', 'propwash:aio_20', [70.5, 15.5, 82.9, 85.9], [-8, -10.8, 70.5, 8, -2.8, 82.9], 2,
      [[-2.2, 6, 25], [-2.2, 6, 85.9], [-2.2, -6.8, 85.9], [-2.2, -6.8, 82.9]], [[2.2, 6, 25], [2.2, 6, 85.9], [2.2, -6.8, 85.9], [2.2, -6.8, 82.9]], 76.7],
    ['propwash:whoop_65', 'propwash:b1s_300_hv', 'propwash:aio_whoop', [40.5, 5, 44.5, 47.5], [-3.2, -8.7, 40.5, 3.2, -4.2, 44.5], 1,
      [[-1.1, 2.5, 17.5], [-1.1, 2.5, 47.5], [-1.1, -6.45, 47.5], [-1.1, -6.45, 44.5]], [[1.1, 2.5, 17.5], [1.1, 2.5, 47.5], [1.1, -6.45, 47.5], [1.1, -6.45, 44.5]], 41.95],
  ];
  for (const [frame, battery, stack, zs, plug, diameter, red, black, length] of reference) {
    const build = { ...catalog.presetBuild('propwash:freestyle'), frame, battery, stack, accessories: {} };
    const lead = assemble(build, env).pieces.find((p) => p.role === 'power_lead');
    const label = `reference ${frame} + ${battery} + ${stack}`;
    if (!check(lead, `${label}: plugged`)) continue;
    const r = lead.route;
    check([r.socketZ, r.socketLength, r.plugEndZ, r.bendZ].every((v, i) => near(v, zs[i])), `${label}: socket, plug and bend ${[r.socketZ, r.socketLength, r.plugEndZ, r.bendZ]}`);
    check(r.plug.every((v, i) => near(v, plug[i])), `${label}: plug box ${r.plug}`);
    r.wires.forEach((w, i) => {
      const points = [w.segments[0][0], ...w.segments.map((sgm) => sgm[1])];
      const want = i === 0 ? red : black;
      check(w.diameter === diameter && points.length === want.length && points.every((p, k) => dist(p, want[k]) < 1e-3), `${label}: lead ${i} ${JSON.stringify(points)}`);
      check(near(w.segments.reduce((n, [p, q]) => n + dist(p, q), 0), length), `${label}: lead ${i} length`);
    });
    check(plugFamily(catalog.part(battery).data.connector) === null || battery !== 'propwash:b1s_300_hv', `${label}: family from the model`);
  }
  check(assemble({ ...catalog.presetBuild('propwash:whoop') }, env).pieces.find((p) => p.role === 'power_lead').route.pieces
    .find((p) => p.role === 'plug').color === PLUG_COLORS.BT, 'whoop: white BT2.0 pair');
  // Fallbacks: drawn as before.
  const freestyle = catalog.presetBuild('propwash:freestyle');
  const noMount = { ...env, model: (id) => (id === freestyle.stack ? { ...models.get(id), variants: { ...models.get(id).variants, mounted: undefined } } : env.model(id)) };
  const fa = assemble(freestyle, noMount);
  check(!fa.pieces.some((p) => p.role === 'power_lead') && !fa.pieces.find((p) => p.role === 'stack').variant, 'fallback: stack without a mounted variant');
  const noSocket = { ...env, model: (id) => (id === freestyle.battery ? { ...models.get(id), variants: { ...models.get(id).variants, base: { ...models.get(id).variants.base, socket: undefined } } } : env.model(id)) };
  check(!assemble(freestyle, noSocket).pieces.some((p) => p.role === 'power_lead'), 'fallback: battery without a socket');
  const noFrame = { ...env, model: (id) => (id === freestyle.frame ? null : env.model(id)) };
  check(!assemble(freestyle, noFrame).pieces.some((p) => p.role === 'power_lead'), 'fallback: frame drawn from its measurements');
  console.log(`Battery plugged in: ${combos} combinations of frame, battery and stack (${families.XT} XT, ${families.BT} BT), leads up to ${longest.toFixed(0)} mm, 3 reference builds like the mod`);
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
