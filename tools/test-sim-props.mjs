#!/usr/bin/env node
// Props of the FPV simulator (sim/) against Propwash 0.6.0:
//   Node, against the mod's formulas (re-written here from the Java classes):
//   - motor output per prop: |rpm| / maximum rpm of its own motor, as a byte, 0 while disarmed (PilotSession#writeEntity,
//     StateValidation.packMotors); the slot → flight-model motor map agrees with the flight model's motor positions and
//     spins and with the frame layout (DroneLayoutTest) for every preset
//   - rotor angle per 20 Hz tick (QuadcopterEntity#tickClientVisuals: idle 0.9, full 3.2 rad per tick, 35 % response,
//     snap below 0.001, direction +1 counter-clockwise) interpolated with the partial tick, bit for bit over a random
//     flight; blur above the threshold 0.12 only while armed (DroneVisuals#propBlur)
//   - size and position: hubs = motor + prop height (FpvRig hubs), on the flight model's motors relative to the lens
//     (FpvArmsTest#hubsSitOnTheMotorsOfTheFlightModel), the "_ccw" model on counter-clockwise slots; every prop has a
//     blur model centred on the hub with the prop's radius, its disc texture translucent ("tl")
//   - colour: blur disc colour (FpvProps.blurRgb: paint of the slot, else the model's prop channel) and the blur model's
//     tints (paint per prop slot, default tints like the export's "_blur_paint" definitions)
//   - FPV geometry (FpvPropGeometryTest, FpvArmsTest): camera axis, pushScale, clipping, the freestyle's front props at
//     the edge of a 130° image and not at 60°, a deadcat's props never in view, nearScale 1…12 for every preset, arms
//     zone and attached motors, every motor of a preset on an arm
//   Chrome (sim page, 1280 × 720 and 390 × 844): the switch "Props" (on by default, stored, both ways), the drone armed
//   with throttle: props visible in line of sight and FPV (pixels with and without), turning in each motor's direction,
//   blur model while spinning, blades again after disarming; the cinewhoop's ducts in FPV with and without the props;
//   nothing on a deadcat; no console errors.
//
//   node tools/test-sim-props.mjs [--no-browser] [--chrome <path>] [--shots <dir>] [--export <web export> …] [--verbose]
//
// --shots writes the screenshots (sim-props-fpv.png, sim-props-los.png, sim-props-fpv-390.png) to a folder.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, CHROME, serve, launch, cdp, sleep } from './headless-chrome.mjs';
import { createCatalog } from '../assets/js/configurator/data.js';
import { assemble } from '../assets/js/configurator/assembly.js';
import { channelTint, rgbOf, paintTints } from '../assets/js/configurator/paint.js';
import { exportDirs } from './build-configurator-data.mjs';
import { AirframeSpec } from '../assets/js/sim/model/AirframeSpec.js';
import { discColor } from '../assets/js/configurator/viewer.js';
import { droneModel } from '../assets/js/sim/drone-model.js';
import { PropView } from '../assets/js/sim/prop-view.js';
import {
  PropSpin, packedOutput, slotOutputs, propBlur, spinDirection, SLOT_SIM_MOTOR, PROPS_IN_CCW, PROP_BLUR_THRESHOLD,
  TICK_SECONDS,
} from '../assets/js/sim/prop-spin.js';
import {
  FpvPropGeometry, FpvArmZone, FpvGuardZone, pushScale, clipPolygon, lensPolygon, toCamera, CLIP_DEPTH_MM,
  MAX_NEAR_SCALE,
} from '../assets/js/sim/fpv-props.js';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const verbose = process.argv.includes('--verbose');
const BROWSER = !process.argv.includes('--no-browser');
const SHOTS = arg('--shots', null);

let checks = 0;
const failures = [];
function check(ok, message) {
  checks++;
  if (!ok) failures.push(message);
  else if (verbose) console.log(`  ok  ${message}`);
  return ok;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const catalog = createCatalog(JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/data/configurator/catalog.json'), 'utf8')));
const render = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/data/configurator/render.json'), 'utf8'));
const models = new Map();
function model(id) {
  if (!render.models.includes(id)) return null;
  if (!models.has(id)) {
    const [ns, p] = id.split(':');
    models.set(id, JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/data/configurator/models', ns, catalog.category(id), `${p}.json`), 'utf8')));
  }
  return models.get(id);
}
const env = { catalog, render, model };
const f32 = Math.fround;

// ---------------------------------------------------------------------------------------------------------------
// The mod's formulas, written again from the Java sources (independent of assets/js/sim/prop-spin.js)

// StateValidation.unit / toByte / unpackMotor
const modPacked = (v) => ((Math.round(f32((Number.isNaN(v) ? 0 : Math.max(0, Math.min(1, v))) * 255)) & 0xff)) / 255;
// QuadcopterEntity: PROP_SPIN by motor index, slot → motor by DroneLayout.motorForSlot (SLOT_BY_MOTOR = RR, FR, RL, FL)
const SLOT_BY_MOTOR = [3, 1, 2, 0];
const motorForSlot = (slot) => SLOT_BY_MOTOR.indexOf(slot);
const PROP_SPIN = [-1, 1, 1, -1];
class ModRotors {
  constructor() {
    this.rotorAngle = [0, 0, 0, 0];
    this.prevPropAngle = [0, 0, 0, 0];
    this.propSpeed = [0, 0, 0, 0];
  }

  // tickClientVisuals with the outputs per motor index
  tick(armed, motorOutput) {
    for (let i = 0; i < 4; i++) {
      // float arithmetic: 0.9F + (3.2F - 0.9F) * output, speed += (target - speed) * 0.35F, snap below 1.0E-3F
      const target = armed ? f32(f32(0.9) + f32(f32(f32(3.2) - f32(0.9)) * f32(motorOutput[i]))) : 0;
      this.propSpeed[i] = f32(this.propSpeed[i] + f32(f32(target - this.propSpeed[i]) * f32(0.35)));
      if (Math.abs(this.propSpeed[i]) < f32(1.0e-3)) this.propSpeed[i] = 0;
      this.prevPropAngle[i] = this.rotorAngle[i];
      this.rotorAngle[i] = f32(this.rotorAngle[i] + f32(PROP_SPIN[i] * this.propSpeed[i]));
      if (Math.abs(this.rotorAngle[i]) > 1000) {
        const twoPi = f32(Math.PI * 2);
        const shift = f32(twoPi * Math.round(f32(this.rotorAngle[i] / twoPi)));
        this.rotorAngle[i] = f32(this.rotorAngle[i] - shift);
        this.prevPropAngle[i] = f32(this.prevPropAngle[i] - shift);
      }
    }
  }

  angle(motor, partial) {
    return this.prevPropAngle[motor] + partial * (this.rotorAngle[motor] - this.prevPropAngle[motor]);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Node: motor outputs, rotor angles, direction, blur

check(PROP_BLUR_THRESHOLD === 0.12 && TICK_SECONDS === 0.05, 'blur threshold 0.12 (DroneRenderConfig) and 20 ticks per second');
for (const v of [0, 1e-4, 0.002, 0.12, 0.1216, 0.5, 0.999, 1, 1.4, -0.3, NaN]) {
  check(packedOutput(v) === modPacked(v), `packed output ${v}: ${packedOutput(v)} ≠ ${modPacked(v)}`);
}
{
  const rpm = [1000, -2000, 3000, 4000];
  const out = slotOutputs(rpm, 8000, true);
  for (let slot = 0; slot < 4; slot++) {
    const motor = SLOT_SIM_MOTOR[slot];
    check(out[slot] === modPacked(Math.abs(rpm[motor]) / 8000), `slot ${slot} takes the rpm of flight-model motor ${motor}`);
  }
  check(slotOutputs(rpm, 8000, false).every((v) => v === 0), 'disarmed: every motor output 0 (PilotSession packs 0)');
  check(slotOutputs([NaN, 1, 1, 1], 0, true).every((v) => v === 0), 'no maximum rpm: outputs 0');
}
check(JSON.stringify(SLOT_SIM_MOTOR) === JSON.stringify([0, 1, 2, 3].map(motorForSlot)), 'slot → motor like DroneLayout.motorForSlot');
check(JSON.stringify(PROPS_IN_CCW.map(spinDirection)) === JSON.stringify([0, 1, 2, 3].map((slot) => PROP_SPIN[motorForSlot(slot)])),
  'props in: front left and rear right clockwise (−1), front right and rear left counter-clockwise (+1), like PROP_SPIN');
check(!propBlur(true, 0.12) && propBlur(true, 31 / 255) && !propBlur(false, 1) && !propBlur(true, 0),
  'blur only while armed and above 0.12 (strictly)');

{
  // A random flight: outputs per slot, arming on and off, frames of 1…100 ms; angles bit for bit like the mod.
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const spin = new PropSpin(PROPS_IN_CCW);
  const mod = new ModRotors();
  let elapsed = 0;
  let worst = 0;
  let blurOk = true;
  let frames = 0;
  for (let i = 0; i < 4000; i++) {
    const armed = i < 3000 ? (i % 900) < 820 : false;
    const outputs = [0, 1, 2, 3].map(() => (armed ? modPacked(Math.min(1, Math.max(0, 0.25 + 0.6 * Math.sin(i / 60 + rnd()) * rnd()))) : 0));
    const dt = 0.001 + rnd() * 0.099;
    spin.update(dt, outputs, armed);
    elapsed += dt;
    // The mod: one tick per 50 ms with this frame's outputs per motor (motorForSlot), partial tick for the frame.
    const byMotor = [0, 0, 0, 0];
    for (let slot = 0; slot < 4; slot++) byMotor[motorForSlot(slot)] = outputs[slot];
    while (elapsed >= 0.05) {
      elapsed -= 0.05;
      mod.tick(armed, byMotor);
    }
    const partial = Math.max(0, Math.min(1, elapsed / 0.05));
    for (let slot = 0; slot < 4; slot++) {
      worst = Math.max(worst, Math.abs(spin.angle(slot) - mod.angle(motorForSlot(slot), partial)));
      blurOk = blurOk && spin.blur(slot) === (armed && outputs[slot] > 0.12);
    }
    frames++;
  }
  check(worst < 1e-6, `rotor angles like QuadcopterEntity over ${frames} frames (largest difference ${worst})`);
  check(blurOk, 'blur per slot like DroneVisuals#propBlur over the flight');
  check(spin.speed.every((v) => v === 0), 'after disarming the props stop (speed snaps to 0)');
}
{
  // Speeds: idle 0.9 rad per tick (18 rad/s), full 3.2 rad per tick (64 rad/s); direction of every slot.
  const spin = new PropSpin(PROPS_IN_CCW);
  for (let i = 0; i < 60; i++) spin.update(0.05, [0, 0, 1, 1], true);
  check(near(spin.speed[0], 0.9, 1e-4) && near(spin.speed[1], 0.9, 1e-4), `idle speed 0.9 rad/tick (${spin.speed[0]})`);
  check(near(spin.speed[2], 3.2, 1e-4) && near(spin.speed[3], 3.2, 1e-4), `full speed 3.2 rad/tick (${spin.speed[2]})`);
  const a = [0, 1, 2, 3].map((s) => spin.angle(s));
  spin.update(0.1, [0, 0, 1, 1], true);
  const d = [0, 1, 2, 3].map((s) => spin.angle(s) - a[s]);
  check(d[0] < 0 && d[1] > 0 && d[2] > 0 && d[3] < 0, `directions FL −, FR +, RL +, RR − (${d.map((v) => v.toFixed(2)).join(', ')})`);
  check(near(Math.abs(d[3]), 6.4, 1e-3), `two ticks at full speed turn 6.4 rad (${d[3]})`);
  const before = spin.angle(0);
  spin.update(0.025, [0, 0, 0, 0], true);
  check(near(spin.angle(0) - before, -0.45, 1e-4), `half a tick: interpolated half way (${spin.angle(0) - before})`);
}

// ---------------------------------------------------------------------------------------------------------------
// Node: position, direction per preset, size and colour

const ARM_KEYS = ['front_left', 'front_right', 'rear_left', 'rear_right'];
let presetsChecked = 0;
for (const preset of catalog.presets) {
  const build = catalog.presetBuild(preset.id);
  const a = assemble(build, env);
  const airframe = AirframeSpec.fromBuild(build, catalog);
  const view = catalog.cameraView(build);
  if (!check(!!a.layout && !!airframe && !!view, `${preset.id}: layout, flight model and camera`)) continue;
  const rig = view.rig;
  const props = a.pieces.filter((p) => p.role === 'prop');
  check(props.length === 4, `${preset.id}: four props`);
  const propModel = model(build.prop);
  for (let slot = 0; slot < 4; slot++) {
    const motor = SLOT_SIM_MOTOR[slot];
    const piece = props.find((p) => p.slot === slot);
    // DroneLayoutTest: slot ↔ motor positions and spins of the flight model
    check(Math.sign(-airframe.motorX(motor)) === Math.sign(a.layout.motors[slot][0]) && Math.sign(-airframe.motorZ(motor)) === Math.sign(a.layout.motors[slot][2]),
      `${preset.id} slot ${slot}: flight-model motor ${motor} on the same side`);
    check((airframe.spin(motor) > 0) === a.layout.ccw[slot], `${preset.id} slot ${slot}: spin of the flight model = frame layout`);
    check(piece.variant === (a.layout.ccw[slot] && propModel.variants.ccw ? 'ccw' : 'base'), `${preset.id} slot ${slot}: "_ccw" model on a counter-clockwise slot`);
    // Hub = motor + prop height = FpvRig hub; on the flight model's motor relative to the lens (FpvArmsTest, 0.6 mm)
    const hub = piece.position;
    check(hub.every((v, i) => near(v, rig.hubs[slot][i], 1e-3)), `${preset.id} slot ${slot}: hub ${hub} = FpvRig hub ${rig.hubs[slot]}`);
    check(near(-(airframe.motorX(motor) + airframe.lensRight) * 1000, a.layout.motors[slot][0] - rig.lens[0], 0.6)
      && near(-(airframe.motorZ(motor) - airframe.lensForward) * 1000, a.layout.motors[slot][2] - rig.lens[2], 0.6),
    `${preset.id} slot ${slot}: hub on the flight model's motor seen from the lens`);
  }
  presetsChecked++;
}
check(presetsChecked === catalog.presets.length && presetsChecked >= 31, `every preset checked (${presetsChecked})`);

// Blur models of every prop: centred on the hub, the prop's radius, translucent disc, paint like the blades.
const exports = exportDirs(process.argv.slice(2).filter((a) => a !== '--no-browser' && a !== '--verbose')).filter((d) => d && fs.existsSync(d));
let blurModels = 0;
let tintsCompared = 0;
for (const part of catalog.parts.filter((p) => p.category === 'prop')) {
  const m = model(part.id);
  if (!check(!!m, `${part.id}: model file`)) continue;
  const blur = m.variants.blur;
  if (!check(!!blur && Array.isArray(blur.tl) && blur.tl.length === 1, `${part.id}: blur model with one translucent texture`)) continue;
  blurModels++;
  const radius = part.data.diameter_mm / 2;
  const box = blur.box;
  const [cx, cz] = [((box[0] + box[3]) / 2 - 8) * 8, ((box[2] + box[5]) / 2 - 8) * 8];
  const discRadius = ((box[3] - box[0]) / 2) * 8;
  check(near(cx, 0, 0.05) && near(cz, 0, 0.05), `${part.id}: blur disc centred on the hub (${cx}, ${cz})`);
  check(near(discRadius, radius, Math.max(1.5, radius * 0.02)), `${part.id}: blur disc radius ${discRadius} mm ≈ prop radius ${radius} mm`);
  check(Array.isArray(blur.ftex) && blur.ftex.includes(blur.tl[0]) && blur.ftex.some((t) => !blur.tl.includes(t)), `${part.id}: translucent disc and solid hub`);
  const paint = m.variants.paint;
  const blurPaint = m.variants.blur_paint;
  if (paint) {
    // A two-tone prop ("_bi") has two prop groups on its blades and one on its blur model: the first one.
    check(!!blurPaint && blurPaint.of === 'blur' && blurPaint.groups.length >= 1 && blurPaint.groups.every(([channel]) => channel === 'prop')
      && JSON.stringify(blurPaint.groups[0]) === JSON.stringify(paint.groups[0]), `${part.id}: blur paint model in the blades' prop channel`);
    const painted = { prop_fl: '#ff0000', prop_rr: '#123456' };
    for (let slot = 0; slot < 4; slot++) {
      const a = paintTints(blurPaint.groups, painted, slot, render.channels);
      const b = paintTints(paint.groups, painted, slot, render.channels);
      check(a === null ? b === null : a[0] === b[0], `${part.id} slot ${slot}: blur tint = blade tint`);
    }
    const tint = paintTints(blurPaint.groups, painted, 0, render.channels);
    check(tint && tint[0] === channelTint(0xff0000, render.channels.prop), `${part.id}: blur model of the front left prop in its paint`);
    // Default tints like the export's "_blur_paint" render definition.
    const dir = exports.find((d) => fs.existsSync(path.join(d, part.id.split(':')[0], part.model.drone)));
    if (dir) {
      const def = JSON.parse(fs.readFileSync(path.join(dir, part.id.split(':')[0], part.model.drone.replace(/\.json$/, '_blur_paint.json')), 'utf8')).model;
      const expected = def.tints.map((t) => t.default);
      const actual = blurPaint.groups.map(([channel, base]) => channelTint(rgbOf(base), render.channels[channel]));
      check(JSON.stringify(expected) === JSON.stringify(actual), `${part.id}: blur tints ${actual} ≠ export ${expected}`);
      tintsCompared++;
    }
  }
}
check(blurModels === catalog.parts.filter((p) => p.category === 'prop').length, `every prop has a blur model (${blurModels})`);

// Disc colour (FpvProps.blurRgb): paint of the slot, else the model's prop channel, else the accent / material colour.
{
  for (const preset of catalog.presets) {
    const prop = catalog.part(catalog.presetBuild(preset.id).prop);
    const m = model(prop.id);
    const group = m.variants.paint && m.variants.paint.groups.find(([channel]) => channel === 'prop');
    const paint = { prop_fr: '#00ff00' };
    check(discColor(prop, m, paint, 1) === 0x00ff00, `${preset.id}: disc of the front right prop in its paint`);
    if (group) check(discColor(prop, m, paint, 0) === rgbOf(group[1]), `${preset.id}: unpainted disc in the model's prop colour ${group[1]}`);
  }
  check(discColor({ basics: { accent: '#112233' }, data: { material: 'carbon' } }, null, {}, 0) === 0x112233, 'disc without paint groups: accent colour');
  check(discColor({ basics: {}, data: { material: 'carbon' } }, null, {}, 0) === 0x2b2c31, 'disc without accent: colour of the material (carbon)');
  check(discColor({ basics: {}, data: { material: 'polycarbonate' } }, null, {}, 0) === 0xe4e4ea, 'disc of any other material: 0xe4e4ea');
}

// ---------------------------------------------------------------------------------------------------------------
// Node: FPV geometry (FpvPropGeometry, FpvArmZone, FpvGuardZone, FpvProps clipping)

const DEG = Math.PI / 180;
const tanHalf = (deg) => Math.tan(Math.max(1, Math.min(179, deg)) * DEG / 2);
const verticalOf = (h, aspect = 16 / 9) => 2 * Math.atan(Math.tan(h * DEG / 2) / aspect) / DEG;
{
  // FpvPropGeometryTest#cameraAxisMapsToScreenCentre
  const lens = [0, 20, -50];
  const ahead = toCamera(lens, 30, 0, 20 + 100 * Math.sin(30 * DEG), -50 - 100 * Math.cos(30 * DEG));
  check(near(ahead[0], 0, 1e-4) && near(ahead[1], 0, 1e-3) && near(ahead[2], -100, 1e-3), `camera axis to the image centre (${ahead})`);
  check(toCamera(lens, 30, 0, 20, -150)[1] < 0, 'with uptilt the point ahead at lens height lies below the centre');
  // pushScale
  check(pushScale(100, 1) === 1 && pushScale(10, 12) === 12, 'pushScale: far vertices keep nearScale');
  check(near(pushScale(2, 12) * 2, 52 + 3 * 24 / 55, 1e-9), 'pushScale: a near vertex to 52…55 mm');
  check(near(pushScale(0, 5) * 1e-4, 52, 1e-9), 'pushScale: a vertex at the lens to 52 mm');
  // clipping at 0.25 mm with interpolated attributes
  const clipped = clipPolygon([[0, 0, 0, -1, 0], [1, 0, 0, 1, 10], [1, 1, 0, 1, 10], [0, 1, 0, -1, 0]]);
  check(clipped.length === 4 && clipped.every((v) => v[3] >= CLIP_DEPTH_MM - 1e-12) && near(clipped[0][4], 6.25, 1e-9),
    `clip at ${CLIP_DEPTH_MM} mm interpolates position and attributes`);
  check(lensPolygon([[0, 0, 10], [1, 0, 10], [1, 1, 10]], [0, 0, 0], 0, 1).length === 0, 'a polygon behind the lens is dropped');
  const pushed = lensPolygon([[0, 0, -10], [10, 0, -10], [10, 10, -10]], [0, 0, 0], 0, 2);
  check(pushed.length === 3 && pushed.every((v) => near(-v[2], 52 + 3 * 20 / 55, 1e-6)), 'a polygon 10 mm ahead pushed to its pushScale depth');
}

function presetGeometry(presetId, { arms = false } = {}) {
  const build = catalog.presetBuild(presetId);
  const a = assemble(build, env);
  const rig = catalog.cameraView(build).rig;
  const hubs = a.pieces.filter((p) => p.role === 'prop').sort((x, y) => x.slot - y.slot).map((p) => p.position);
  const prop = catalog.part(build.prop);
  const armPolys = arms ? [[-20, -3, -20, -80, -3, -80, -82, -3, -78, -22, -3, -18]] : [];
  return new FpvPropGeometry(hubs, prop.data.diameter_mm / 2, rig.lens, rig.tilt, [], armPolys);
}
{
  // FpvPropGeometryTest#freestylePropsShowAtTheEdgeOfAWideDigitalImage, #deadcatKeepsPropsOutOfView
  const g = presetGeometry('propwash:freestyle');
  const any = (geo, deg) => [0, 1, 2, 3].some((slot) => geo.visible(slot, tanHalf(deg), tanHalf(verticalOf(deg))));
  check(any(g, 130), 'freestyle: props at the edge of a 130° image');
  check(!g.visible(2, tanHalf(130), tanHalf(verticalOf(130))), 'freestyle: no rear prop in view');
  check(!any(g, 60), 'freestyle: no prop at 60°');
  check(g.nearScale >= 1 && g.nearScale <= MAX_NEAR_SCALE, `freestyle: nearScale ${g.nearScale}`);
  const dead = presetGeometry('justmoreparts:deadcat5_6s');
  check(!any(dead, 160), 'deadcat: no prop in view even at 160°');
  // FpvArmsTest#armsLeaveTheNearScaleAlone
  check(presetGeometry('propwash:racer', { arms: true }).nearScale === presetGeometry('propwash:racer').nearScale, 'arms leave nearScale alone');
  for (const preset of catalog.presets) {
    const geo = presetGeometry(preset.id);
    check(Number.isFinite(geo.nearScale) && geo.nearScale >= 1 && geo.nearScale <= MAX_NEAR_SCALE, `${preset.id}: nearScale ${geo.nearScale} in 1…12`);
  }
  // FpvArmsTest#visibilitySeesAQuadThatCrossesTheViewWithoutACornerInIt
  const hubs = [[-500, 0, 0], [500, 0, 0], [-500, 0, 500], [500, 0, 500]];
  const quad = (pts) => new FpvPropGeometry(hubs, 10, [0, 0, 0], 0, [], [pts]).armsVisible(1, 1);
  check(quad([-400, -2, -100, 400, -2, -100, 400, 2, -100, -400, 2, -100]), 'a face across the view is visible');
  check(!quad([300, -2, -100, 400, -2, -100, 400, 2, -100, 300, 2, -100]), 'a face beside the view is not');
  check(!quad([-400, -2, 100, 400, -2, 100, 400, 2, 100, -400, 2, 100]), 'a face behind the lens is not');
  // FpvArmsTest#zoneJudgesBodyPartsByGeometry, #motorWithoutAnyQuadNearItIsNotAttached
  const motors = [[-80, 0, -80], [80, 0, -80], [-80, 0, 80], [80, 0, 80]];
  const zone = new FpvArmZone(motors, null);
  check(zone.contains([-20, -3, -20, -80, -3, -80, -82, -3, -78, -22, -3, -18]), 'arm zone: an arm');
  check(!zone.contains([-16, -3, -50, 16, -3, -50, 16, -3, 50, -16, -3, 50]), 'arm zone: not the plate across the middle');
  check(!zone.contains([-12, -3, -30, -12, 20, -30, -12, 20, -50, -12, -3, -50]), 'arm zone: not a wall above the motors');
  check(!zone.contains([-12, -3, -30, -14, -3, -30, -14, -3, -50, -12, -3, -50]), 'arm zone: not a part close to the middle');
  check(!zone.contains([NaN, -3, -20, -80, -3, -80, -82, -3, -78, -22, -3, -18]), 'arm zone: NaN');
  check(zone.attached([]).every((v) => !v), 'no faces: no motor attached');
  check(JSON.stringify(zone.attached([[-20, -3, -20, -80, -3, -80, -82, -3, -78, -22, -3, -18]])) === JSON.stringify([true, false, false, false]),
    'an arm only at motor 0: only that motor attached');
  // FpvGuardZone: a ring of at least 5 equal faces about a motor axis
  const guard = FpvGuardZone.of(true, motors, 76);
  check(!FpvGuardZone.of(false, motors, 76) && near(guard.innerRadius, 38 * 0.97, 1e-9) && near(guard.outerRadius, 38 + 7.6, 1e-9), 'duct zone: radii 0.97 r … r + max(6, 0.2 r)');
  const ring = (n) => Array.from({ length: n }, (_, i) => {
    const a0 = (i / 12) * 2 * Math.PI;
    const a1 = ((i + 1) / 12) * 2 * Math.PI;
    const r = 40;
    return [-80 + r * Math.cos(a0), 0, -80 + r * Math.sin(a0), -80 + r * Math.cos(a1), 0, -80 + r * Math.sin(a1),
      -80 + r * Math.cos(a1), 10, -80 + r * Math.sin(a1), -80 + r * Math.cos(a0), 10, -80 + r * Math.sin(a0)];
  });
  check(guard.select(ring(12)).every(Boolean), 'duct zone: a ring of 12 equal faces is a duct');
  check(!guard.select(ring(4)).some(Boolean), 'duct zone: 4 faces are not');
}

// The meshes of the simulator for every preset, built in Node (no textures needed): every motor hangs on an arm of its
// frame model (FpvArmsTest#everyMotorOfAShippedFrameHangsOnAnArm), blades and blur model per slot with the slot's paint,
// the camera pass clipped and pushed out to at least 52 mm (FpvProps#emitClipped), duct rings only on ducted frames.
globalThis.Image ??= class { set src(v) { void v; } };
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {} }) }) };
let meshPresets = 0;
for (const preset of catalog.presets) {
  const build = catalog.presetBuild(preset.id);
  const parts = [build.frame, build.stack, build.motor, build.prop, build.video, build.battery, ...Object.values(build.accessories || {})];
  const loaded = new Map(parts.filter((id) => id && model(id)).map((id) => [id, model(id)]));
  const paint = { prop_fl: '#ff0000' };
  const group = droneModel(build, paint, catalog, render, loaded);
  const rig = catalog.cameraView(build).rig;
  const view = new PropView({ airframe: AirframeSpec.fromBuild(build, catalog), rig, uptiltDeg: rig.tilt, prop: catalog.part(build.prop), paint });
  view.setModel(group);
  const st = view.fpvState();
  const label = preset.id;
  check(st.built && st.attached.length === 4 && st.attached.every(Boolean), `${label}: every motor hangs on an arm (${st.attached})`);
  check(st.armPolygons > 0, `${label}: arm faces found (${st.armPolygons})`);
  const ducted = !!catalog.part(build.frame).derived.ducted;
  check(ducted === (st.ductPolygons > 0), `${label}: duct rings ${ducted ? 'found' : 'only on ducted frames'} (${st.ductPolygons})`);
  const d = group.userData.drone;
  for (let slot = 0; slot < 4; slot++) {
    const p = d.props[slot];
    const translucent = p.blur.filter((m) => m.userData.translucent);
    check(p.blades.length > 0 && translucent.length === 1 && translucent[0].material.transparent && !translucent[0].material.depthWrite
      && p.blur.some((m) => !m.userData.translucent), `${label} slot ${slot}: blades, translucent blur disc and solid hub`);
    check(d.fpv[slot].center.length > 0 && d.fpv[slot].center.every((m) => !m.userData.translucent), `${label} slot ${slot}: FPV draws the blur model's solid middle only`);
    // Painted slot: the "_blur_paint" model tinted with the paint (DroneVisuals#paint); unpainted: the plain blur model.
    const tint = translucent[0].material.uniforms.tints.value[0];
    const tints = paintTints(model(build.prop).variants.blur_paint.groups, paint, slot, render.channels);
    const want = tints ? tints[0] : 0xffffff;
    check(near(tint.x * 255, (want >> 16) & 255, 1e-3) && near(tint.y * 255, (want >> 8) & 255, 1e-3) && near(tint.z * 255, want & 255, 1e-3)
      && (slot === 0) === !!tints, `${label} slot ${slot}: blur model ${slot === 0 ? "in the slot's prop paint" : 'unpainted'}`);
    check(p.blades.every((m) => m.position.toArray().every((v, i) => near(v, p.hub[i], 1e-9))), `${label} slot ${slot}: blades at the hub`);
  }
  // Camera pass: every vertex of arms, motors, ducts and discs at least 52 mm from the lens along the view (pushed).
  const t = rig.tilt * DEG;
  let nearest = Infinity;
  for (const g of [view.armsGroup, view.ductsGroup, view.discGroup]) {
    for (const mesh of g.children) {
      const pos = mesh.geometry.attributes.position;
      if (!pos) continue;
      for (let i = 0; i < pos.count; i++) nearest = Math.min(nearest, pos.getY(i) * Math.sin(t) - pos.getZ(i) * Math.cos(t));
    }
  }
  check(nearest >= 52 - 1e-3, `${label}: camera pass pushed out to ≥ 52 mm (nearest ${nearest.toFixed(2)} mm)`);
  view.dispose();
  meshPresets++;
}

console.log(`Node: ${presetsChecked} presets (${meshPresets} with meshes), ${blurModels} blur models, ${tintsCompared} blur tints compared with the export`);

// ---------------------------------------------------------------------------------------------------------------
// Chrome

function presetCode(id) {
  return catalog.encode({ build: catalog.presetBuild(id), paint: null, tune: null, osd: null, name: null });
}

async function browserChecks() {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-simprops-'));
  const { child, ws } = await launch(arg('--chrome', CHROME), profile);
  const browser = cdp(ws);
  const errors = [];
  try {
    await browser.ready;
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => browser.send(method, params, sessionId);
    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.exception?.description || r.exceptionDetails.text}: ${expression.slice(0, 120)}`);
      return r.result.value;
    };
    browser.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error' || p.type === 'assert') errors.push(`console.${p.type}: ${p.args.map((a) => a.value ?? a.description).join(' ')}`);
    });
    browser.on('Runtime.exceptionThrown', (p) => errors.push(`exception: ${p.exceptionDetails.exception?.description || p.exceptionDetails.text}`));
    browser.on('Log.entryAdded', (p) => {
      if (p.entry.level === 'error' && !/favicon/.test(p.entry.url || '')) errors.push(`log: ${p.entry.text} ${p.entry.url || ''}`);
    });
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Page.enable');
    await send('Page.bringToFront');
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('propwash-lang', 'en'); } catch (e) {}" });

    const DESKTOP = { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false };
    const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true };
    // A new page load every time (another share code alone would only change the address' fragment).
    const open = async (hash, metrics) => {
      await send('Emulation.setDeviceMetricsOverride', metrics);
      await send('Page.navigate', { url: 'about:blank' });
      await sleep(100);
      await send('Page.navigate', { url: `${base}/sim/${hash ? `#${hash}` : ''}` });
      await sleep(300);
      for (let i = 0; i < 150; i++) {
        if (await evaluate("document.body.classList.contains('is-ready') && !!window.propwashSim && window.propwashSim.scene.hasModel").catch(() => false)) return true;
        await sleep(200);
      }
      return false;
    };
    // In CSS pixels (390 × 844 on the phone, 1280 × 720 on the desktop).
    const shot = async (name, metrics) => {
      if (!SHOTS) return;
      const clip = { x: 0, y: 0, width: metrics.width, height: metrics.height, scale: 1 / metrics.deviceScaleFactor };
      const { data } = await send('Page.captureScreenshot', { format: 'png', clip });
      fs.mkdirSync(SHOTS, { recursive: true });
      fs.writeFileSync(path.join(SHOTS, name), Buffer.from(data, 'base64'));
    };
    const key = async (code, k) => {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: k });
      await sleep(60);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k });
    };
    // Wind off, the drone 0.7 m in front of the pilot (line of sight), armed, holding an altitude on the keyboard throttle.
    const hover = async (altitude) => {
      await evaluate(`(() => { const s = window.propwashSim; const f = s.flight; f.wind = false;
        const g = s.world.surfaceBelow(f.x, f.bottom() + 0.5, f.z); window.__ground = g;
        f.place(f.x, g + 0.02, f.z - 3.3, 0, { rearm: true }); return true; })()`);
      await evaluate(`(() => { const s = window.propwashSim; const target = window.__ground + ${altitude};
        let last = s.flight.bottom(); let i = 0.25; clearInterval(window.__hold);
        window.__hold = setInterval(() => { const y = s.flight.bottom(); const vy = (y - last) / 0.05; last = y;
          if (!s.sim.arming.armed) return; const e = target - y; i = Math.max(0, Math.min(0.8, i + e * 0.01));
          s.input.kb.throttle = Math.max(0, Math.min(1, i + 0.25 * e - 0.12 * vy)); }, 50); return true; })()`);
      await key('KeyZ', 'z');
    };
    // Pixels of the current view drawn twice in one go: as it is and after `change` (an expression), then `undo`.
    const pixelDiff = (change, undo, pose) => evaluate(`(() => {
      const s = window.propwashSim.scene;
      const pose = () => { ${pose} };
      pose();
      const a = s.readPixels();
      ${change};
      pose();
      const b = s.readPixels();
      ${undo};
      pose();
      let n = 0;
      for (let i = 0; i < a.pixels.length; i += 4) {
        if (Math.abs(a.pixels[i] - b.pixels[i]) + Math.abs(a.pixels[i + 1] - b.pixels[i + 1]) + Math.abs(a.pixels[i + 2] - b.pixels[i + 2]) > 6) n++;
      }
      return { changed: n, total: a.width * a.height };
    })()`);
    const FPV_POSE = 's.props.poseFpv(s.fpvCamera, s.drone.quaternion)';
    const LOS_POSE = 's.props.poseLineOfSight()';  // the undo of a change in line of sight
    const state = () => evaluate(`(() => { const s = window.propwashSim; const p = s.scene.props;
      return { armed: s.sim.arming.armed, outputs: p.outputs.slice(), angles: [0, 1, 2, 3].map((k) => p.angle(k)),
        blur: [0, 1, 2, 3].map((k) => p.blur(k)), fpv: p.fpvState(), view: s.scene.view,
        los: p.drone.props.map((x) => ({ blades: x.blades.every((m) => m.visible), blur: x.blur.length > 0 && x.blur.every((m) => m.visible),
          rot: x.blades[0].rotation.y, rotBlur: x.blur.length ? x.blur[0].rotation.y : null })),
        rpm: Array.from(s.sim.telemetry.motorRpm), rpmMax: s.airframe.omegaMax * 60 / (2 * Math.PI) }; })()`);
    const setView = (v) => evaluate(`(document.querySelector('[data-view=${v}]').click(), true)`);

    // --- Freestyle 5″, desktop
    check(await open(presetCode('propwash:freestyle'), DESKTOP), 'freestyle: simulator ready with the block model');
    const button = await evaluate(`(() => { const b = document.querySelector('[data-fpv-props]'); if (!b) return null;
      const r = b.getBoundingClientRect(); return { pressed: b.getAttribute('aria-pressed'), text: b.textContent, title: b.title,
      inViews: !!b.closest('.sim__views'), visible: r.width > 0 && r.right <= innerWidth && r.bottom <= innerHeight }; })()`);
    check(!!button && button.pressed === 'true' && button.text === 'Props' && button.inViews && button.visible && /FPV/.test(button.title),
      `switch "Props" next to the camera buttons, on by default (${JSON.stringify(button)})`);
    let s = await state();
    check(!s.armed && s.blur.every((b) => !b) && s.los.every((p) => p.blades && !p.blur), 'disarmed: still blades, no blur model');
    check(s.fpv.built && s.fpv.attached.every(Boolean) && s.fpv.armPolygons > 0, `FPV: every motor on an arm (${s.fpv.armPolygons} arm faces)`);
    check(s.fpv.shown[0] && s.fpv.shown[1] && !s.fpv.shown[2] && !s.fpv.shown[3], `FPV: the front props at the image edge, not the rear (${s.fpv.shown})`);
    check(s.fpv.discs.every((d) => !d), 'FPV: no blur discs while disarmed');
    let diff = await pixelDiff('s.setFpvProps(false)', 's.setFpvProps(true)', FPV_POSE);
    check(diff.changed > diff.total * 0.01, `FPV, disarmed: the still blades are in the image (${diff.changed} of ${diff.total} pixels)`);

    await hover(1.1);
    await sleep(3500);
    s = await state();
    check(s.armed, 'armed with Z');
    const expected = [0, 1, 2, 3].map((slot) => modPacked(Math.min(1, Math.abs(s.rpm[SLOT_SIM_MOTOR[slot]]) / s.rpmMax)));
    check(s.outputs.every((o, slot) => near(o, expected[slot], 1 / 255 + 1e-9)), `motor outputs of each slot's own motor (${s.outputs.map((v) => v.toFixed(3))})`);
    check(s.outputs.every((o) => o > PROP_BLUR_THRESHOLD) && s.blur.every(Boolean), 'hovering: every prop above the blur threshold');
    const a0 = s.angles;
    await sleep(400);
    s = await state();
    const turned = s.angles.map((v, slot) => v - a0[slot]);
    check(turned[0] < -1 && turned[1] > 1 && turned[2] > 1 && turned[3] < -1,
      `props turn: front left and rear right clockwise, front right and rear left counter-clockwise (${turned.map((v) => v.toFixed(1))} rad in 0.4 s)`);
    check(s.fpv.discs[0] && s.fpv.discs[1] && !s.fpv.discs[2] && !s.fpv.discs[3], `FPV: blur discs of the front props (${s.fpv.discs})`);
    diff = await pixelDiff('s.setFpvProps(false)', 's.setFpvProps(true)', FPV_POSE);
    check(diff.changed > diff.total * 0.01, `FPV, spinning: blur discs in the image (${diff.changed} of ${diff.total} pixels)`);
    await shot('sim-props-fpv.png', DESKTOP);

    // The switch: off hides them and is stored, on brings them back.
    await evaluate("(document.querySelector('[data-fpv-props]').click(), true)");
    await sleep(150);
    const off = await evaluate(`({ pressed: document.querySelector('[data-fpv-props]').getAttribute('aria-pressed'), stored: localStorage.getItem('propwash-sim-fpv-props'),
      fpv: window.propwashSim.scene.props.fpvState() })`);
    check(off.pressed === 'false' && off.stored === 'off' && off.fpv.shown.every((v) => !v) && off.fpv.discs.every((v) => !v) && !off.fpv.arms,
      `switch off: no props, discs, motors or arms in FPV, stored (${JSON.stringify(off)})`);
    await evaluate("(document.querySelector('[data-fpv-props]').click(), true)");
    await sleep(150);
    const on = await evaluate(`({ pressed: document.querySelector('[data-fpv-props]').getAttribute('aria-pressed'), stored: localStorage.getItem('propwash-sim-fpv-props'),
      fpv: window.propwashSim.scene.props.fpvState() })`);
    check(on.pressed === 'true' && on.stored === 'on' && on.fpv.shown[0] && on.fpv.discs[0], 'switch on again: props back');

    // Line of sight: blur models turning with the rotor angle.
    await setView('los');
    await sleep(500);
    s = await state();
    check(s.view === 'los' && !s.fpv.built === false && s.los.every((p) => p.blur && !p.blades), 'line of sight: blur models instead of the blades while spinning');
    check(s.los.every((p, slot) => near(p.rotBlur, s.angles[slot], 0.5)), 'line of sight: blur models turned by the rotor angle');
    diff = await pixelDiff('for (const p of s.props.drone.props) for (const m of [...p.blades, ...p.blur]) m.visible = false', LOS_POSE, '');
    check(diff.changed > 200, `line of sight: the blur models are in the image (${diff.changed} pixels)`);
    await shot('sim-props-los.png', DESKTOP);

    // Disarm: blades again at once, the props run down and stop.
    await key('KeyZ', 'z');
    await sleep(250);
    s = await state();
    check(!s.armed && s.blur.every((b) => !b) && s.los.every((p) => p.blades && !p.blur), 'disarmed: blades again');
    await sleep(1500);
    const stop = await state();
    await sleep(300);
    const still = await state();
    check(still.angles.every((v, slot) => v === stop.angles[slot]), 'disarmed: the props stop');
    check(still.los.every((p, slot) => near(p.rot, still.angles[slot], 1e-6)), 'line of sight: blades at their rotor angle');
    await evaluate('clearInterval(window.__hold), true');

    // --- Cinewhoop: ducts in FPV with and without the props
    check(await open(presetCode('propwash:cinewhoop'), DESKTOP), 'cinewhoop: simulator ready');
    s = await state();
    check(s.fpv.ducts && s.fpv.ductPolygons > 0, `cinewhoop: duct rings in FPV (${s.fpv.ductPolygons} faces)`);
    await evaluate("(document.querySelector('[data-fpv-props]').click(), true)");
    await sleep(150);
    s = await state();
    check(s.fpv.ducts && s.fpv.shown.every((v) => !v), 'cinewhoop: props off, ducts stay ("Ducts in FPV view")');
    check(await evaluate("document.querySelector('[data-fpv-props]').getAttribute('aria-pressed')") === 'false', 'the setting is kept after a reload of another drone');
    await evaluate("(document.querySelector('[data-fpv-props]').click(), true)");

    // --- Deadcat (default drone): nothing in view
    check(await open('', DESKTOP), 'deadcat (default): simulator ready');
    s = await state();
    check(s.fpv.built && s.fpv.shown.every((v) => !v) && !s.fpv.arms, `deadcat: no props, motors or arms in FPV (${JSON.stringify(s.fpv)})`);

    // --- Phone
    check(await open(presetCode('propwash:freestyle'), PHONE), 'phone: simulator ready');
    const phoneButton = await evaluate(`(() => { const r = document.querySelector('[data-fpv-props]').getBoundingClientRect();
      return { right: r.right, bottom: r.bottom, w: innerWidth, sx: document.documentElement.scrollWidth }; })()`);
    check(phoneButton.right <= phoneButton.w && phoneButton.bottom < 120, `phone: the switch fits in the bar (${JSON.stringify(phoneButton)})`);
    await hover(1.25);
    await sleep(3000);
    s = await state();
    check(s.armed && s.blur.every(Boolean) && s.fpv.discs[0] && s.fpv.discs[1], 'phone: spinning props in FPV');
    diff = await pixelDiff('s.setFpvProps(false)', 's.setFpvProps(true)', FPV_POSE);
    check(diff.changed > diff.total * 0.002, `phone: blur discs in the image (${diff.changed} of ${diff.total} pixels)`);
    await shot('sim-props-fpv-390.png', PHONE);
    await evaluate('clearInterval(window.__hold), true');

    check(errors.length === 0, `no console errors:\n    ${errors.join('\n    ')}`);
  } finally {
    browser.close();
    child.kill();
    server.close();
    await sleep(300);
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch { /* Chrome still closing */ }
  }
}

if (BROWSER) await browserChecks();

if (failures.length) {
  console.error(`FAIL: ${failures.length} of ${checks} checks`);
  for (const f of failures.slice(0, 40)) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`PASS: ${checks} checks`);
