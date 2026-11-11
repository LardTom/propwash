#!/usr/bin/env node
// Creative drones in the configurator against Propwash 0.6.0 (Node, no Chrome): assets/js/configurator/creative.js
// (CreativeParam, CreativeFlight, CreativeLimits, CreativeCheck, CreativeDraft) and analysis.js with creative values.
//
//   - tools/fixtures/creative-analysis-vectors.json, made with the classes of the release jar of Propwash 0.6.0
//     (tools/creative-java/CreativeVectors.java): the parameters (keys, groups, ranges, steps, kinds), and per build and
//     creative values the sanitized values and notes, every value and base value, the inertia, the flight build (base
//     parts, the part files of the changed parts, which parts stay the same), the airframe (AirframeSpec), the analysis
//     (BuildAnalysis), the editor's notes (CreativeCheck) and the camera range (CameraMount.range)
//   - the mod's JUnit expectations (CreativeFlightTest) on every preset of the site's catalog, add-ons included: a
//     preset as template flies bit for bit like the preset, values equal to the base change nothing, each value reaches
//     the flight model, free arms, the camera's automatic position keeps the lens
//   - creativeFlight(build, creative, catalog) → {build, catalog, inertia} as the simulator uses it
//   - the editor's logic (CreativeDraft): set, clamp with note, back to base, base parts, templates
//
//   node tools/test-creative-flight.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCatalog } from '../assets/js/configurator/data.js';
import { decodeObject } from '../assets/js/configurator/partjson.js';
import { exportData } from '../assets/js/configurator/catalog-build.js';
import { airframe, analyze, cameraView } from '../assets/js/configurator/analysis.js';
import * as creative from '../assets/js/configurator/creative.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = createCatalog(JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/data/configurator/catalog.json'), 'utf8')));
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures/creative-analysis-vectors.json'), 'utf8'));

let checks = 0;
const failures = [];
function ok(cond, message) {
  checks++;
  if (!cond) failures.push(message);
  return !!cond;
}

const num = (v) => (v === 'NaN' ? NaN : v === 'Infinity' ? Infinity : v === '-Infinity' ? -Infinity : v);
const stats = { compared: 0, exact: 0, maxRel: 0, maxAt: '' };
/** Same number like the mod: bit for bit, or within 1e-9 relative (the order of a few operations may differ). */
function close(a, b, where, rel = 1e-9) {
  a = num(a);
  b = num(b);
  stats.compared++;
  if (Object.is(a, b) || (a === b)) {
    stats.exact++;
    return true;
  }
  if (Number.isNaN(a) && Number.isNaN(b)) {
    stats.exact++;
    return true;
  }
  const d = Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-300);
  if (d > stats.maxRel) {
    stats.maxRel = d;
    stats.maxAt = where;
  }
  return d <= rel;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------------------------------------------------------
// 1. The parameters

ok(fixture.params.length === creative.PARAMS.length, `${creative.PARAMS.length} parameters, the mod has ${fixture.params.length}`);
for (const [i, want] of fixture.params.entries()) {
  const p = creative.PARAMS[i];
  ok(p && p.key === want.key && p.group === want.group && p.part === want.part && p.unit === want.unit && p.min === want.min && p.max === want.max
    && p.step === want.step && p.decimals === want.decimals && p.kind === want.kind.toLowerCase(), `parameter ${i}: ${JSON.stringify(p)} vs ${JSON.stringify(want)}`);
}
ok(same(creative.GROUPS, [...new Set(fixture.params.map((p) => p.group))]), 'groups in the mod\'s order');
console.log(`Parameters: ${creative.PARAMS.length} like CreativeParam (key, group, part, unit, range, step, decimals, kind)`);

// java.lang.Math.rint and CreativeParam#round
for (const [x, want] of [[2.5, 2], [3.5, 4], [-2.5, -2], [-3.5, -4], [0.5, 0], [1.5, 2], [-0.4, -0], [127.5, 128], [100.5, 100], [2.4999, 2]]) {
  ok(Object.is(creative.rint(x), want), `rint(${x}) = ${creative.rint(x)}, Java ${want}`);
}

// ---------------------------------------------------------------------------------------------------------------
// 2. The vectors of the mod

const ANALYSIS = {
  massGrams: 'mass_grams', thrustToWeight: 'thrust_to_weight', hoverThrottlePercent: 'hover_throttle_percent', hoverCurrentA: 'hover_current_a',
  hoverFlightTimeMin: 'hover_flight_time_min', cruiseFlightTimeMin: 'cruise_flight_time_min', mixedFlightTimeMin: 'mixed_flight_time_min',
  aggressiveFlightTimeMin: 'aggressive_flight_time_min', cruiseCurrentA: 'cruise_current_a', mixedCurrentA: 'mixed_current_a',
  cruiseSpeedKmh: 'cruise_speed_kmh', landingCellVoltage: 'landing_cell_voltage', avionicsPowerW: 'avionics_power_w',
  fullThrottleCurrentA: 'full_throttle_current_a', escLoadPercent: 'esc_load_percent', batteryLoadPercent: 'battery_load_percent',
  topSpeedAcroKmh: 'top_speed_kmh', motorResponseMs: 'motor_response_ms', crashSpeedMs: 'crash_speed_ms', sustainedMotorTempC: 'sustained_motor_temp_c',
  motorTempMinuteC: 'motor_temp_minute_c', mixedMotorTempC: 'mixed_motor_temp_c', propsInViewPercent: 'props_in_view_percent',
  maxThrustPerMotorGrams: 'extra.max_thrust_per_motor_g', fullThrottleCellVoltage: 'extra.full_throttle_cell_voltage',
  topSpeedAngleKmh: 'extra.top_speed_angle_kmh',
};
const analysisValue = (a, key) => (key.startsWith('extra.') ? a.extra[key.slice(6)] : a[key]);
// AirframeSpec fields the site's airframe carries under the same name (others are not part of the port).
const NOT_COMPARED = new Set(['buildKey', 'buildable', 'assemblable']);
const kinds = ['frame', 'stack', 'motor', 'prop', 'battery', 'video'];
const counts = { vectors: 0, sanitize: 0, values: 0, flight: 0, parts: 0, airframe: 0, analysis: 0, warnings: 0, camera: 0, skippedFields: new Set() };

for (const v of fixture.vectors) {
  const where = v.name;
  if (v.error) {
    ok(false, `${where}: the mod could not compute it (${v.error})`);
    continue;
  }
  counts.vectors++;
  const build = { ...v.build, accessories: { ...(v.build.accessories || {}) } };
  const spec = v.creative;

  // CreativeLimits.sanitize
  const s = creative.sanitize(spec, catalog);
  const wantNotes = v.sanitized.notes.map((n) => ({ type: n.type.toLowerCase(), key: n.key, requested: num(n.requested ?? NaN), applied: num(n.applied ?? NaN) }));
  const gotNotes = s.notes.map((n) => ({ type: n.type, key: n.key, requested: n.requested, applied: n.applied }));
  if (ok(same(s.spec.base, v.sanitized.spec.base) && same({ ...s.spec.values }, v.sanitized.spec.values)
    && gotNotes.length === wantNotes.length && gotNotes.every((n, i) => n.type === wantNotes[i].type && n.key === wantNotes[i].key
      && (Object.is(n.requested, wantNotes[i].requested) || n.requested === wantNotes[i].requested) && (Object.is(n.applied, wantNotes[i].applied) || n.applied === wantNotes[i].applied)),
  `${where}: sanitize ${JSON.stringify(s.spec)} ${JSON.stringify(gotNotes)} vs ${JSON.stringify(v.sanitized)}`)) counts.sanitize++;

  // CreativeFlight.value / CreativeDraft#base
  let allValues = true;
  for (const p of creative.PARAMS) {
    allValues = ok(close(creative.value(build, spec, p, catalog), v.value[p.key], `${where} value ${p.key}`, 1e-9), `${where}: value ${p.key} ${creative.value(build, spec, p, catalog)} vs ${v.value[p.key]}`) && allValues;
    allValues = ok(close(creative.baseOf(build, spec, p, catalog), v.base[p.key], `${where} base ${p.key}`, 1e-9), `${where}: base ${p.key} ${creative.baseOf(build, spec, p, catalog)} vs ${v.base[p.key]}`) && allValues;
  }
  if (allValues) counts.values++;

  // CreativeFlight#flight and the inertia (the mod's order roll, pitch, yaw; creativeFlight gives xx, yy, zz)
  const flight = creative.creativeFlight(build, spec, catalog);
  const rpy = v.inertia ? v.inertia.map(num) : null;
  const want = rpy ? [rpy[1], rpy[2], rpy[0]] : null;
  ok(want === null ? flight.inertia === null : flight.inertia && flight.inertia.every((x, i) => Object.is(x, want[i]) || x === want[i]),
    `${where}: inertia ${JSON.stringify(flight.inertia)} vs [xx, yy, zz] ${JSON.stringify(want)}`);
  let flightOk = true;
  for (const kind of kinds) {
    const id = flight.build[kind];
    flightOk = ok(id === creative.keyId(v.flight.ids[kind]), `${where}: flight ${kind} ${id} vs ${v.flight.ids[kind]}`) && flightOk;
    const part = flight.catalog.part(id);
    if (v.flight.same.includes(kind)) {
      flightOk = ok(part === catalog.part(id), `${where}: flight ${kind} stays the same part`) && flightOk;
    } else {
      const decoded = decodeObject(kind, id, v.flight[kind]).definition;
      flightOk = ok(decoded && part && part !== catalog.part(id) && same(part.data, exportData(decoded)) && part.basics.mass_g === decoded.basics.massGrams,
        `${where}: flight ${kind} data like the mod's part file ${JSON.stringify(part && part.data)} vs ${JSON.stringify(decoded && exportData(decoded))}`) && flightOk;
      // The part file the site writes reads back to the same part (PartJson.encode → decode).
      const again = decodeObject(kind, id, creative.encodePart(part)).definition;
      flightOk = ok(again && same(exportData(again), part.data), `${where}: flight ${kind} written and read back unchanged`) && flightOk;
      counts.parts++;
    }
  }
  ok(same(flight.build.accessories, build.accessories), `${where}: accessories of the flight build`);
  if (flightOk) counts.flight++;

  // AirframeSpec
  const p = airframe(build, catalog, spec);
  if (ok(p, `${where}: airframe`)) {
    let all = true;
    for (const [key, value] of Object.entries(v.airframe)) {
      if (NOT_COMPARED.has(key)) continue;
      if (!(key in p)) {
        counts.skippedFields.add(key);
        continue;
      }
      if (Array.isArray(value)) {
        if (key === 'spin') continue;
        for (let i = 0; i < value.length; i++) all = ok(close(p[key][i], value[i], `${where} airframe ${key}[${i}]`), `${where}: airframe ${key}[${i}] ${p[key][i]} vs ${value[i]}`) && all;
      } else if (typeof value === 'boolean' || typeof value === 'string') {
        all = ok(p[key] === value, `${where}: airframe ${key} ${p[key]} vs ${value}`) && all;
      } else {
        all = ok(close(p[key], value, `${where} airframe ${key}`), `${where}: airframe ${key} ${p[key]} vs ${value}`) && all;
      }
    }
    if (all) counts.airframe++;
  }

  // BuildAnalysis
  const a = analyze(build, catalog, spec);
  if (ok(a, `${where}: analysis`)) {
    let all = true;
    for (const [javaKey, key] of Object.entries(ANALYSIS)) {
      all = ok(close(analysisValue(a, key), v.analysis[javaKey], `${where} ${key}`), `${where}: ${key} ${analysisValue(a, key)} vs ${v.analysis[javaKey]}`) && all;
    }
    all = ok(same(a.warnings, v.analysis.warnings.map((w) => w.toLowerCase())), `${where}: analysis warnings ${a.warnings} vs ${v.analysis.warnings}`) && all;
    if (all) counts.analysis++;
    // CreativeCheck
    if (ok(same(creative.check(build, spec, catalog, a), v.creative_warnings.map((w) => w.toLowerCase())), `${where}: notes ${creative.check(build, spec, catalog, a)} vs ${v.creative_warnings}`)) counts.warnings++;
  }

  // CameraMount.range(DroneBuild)
  const cam = cameraView(build, catalog, spec);
  if (ok(cam && cam.uptilt_min_deg === v.uptilt.min && cam.uptilt_max_deg === v.uptilt.max && cam.rig.range.standard === v.uptilt.default,
    `${where}: camera range ${cam && [cam.uptilt_min_deg, cam.uptilt_max_deg, cam.rig.range.standard]} vs ${JSON.stringify(v.uptilt)}`)) counts.camera++;

  // The preset as template: like the preset itself (the mod's reference)
  if (v.preset_reference) {
    const ref = v.preset_reference;
    const refBuild = { ...ref.build, accessories: { ...(ref.build.accessories || {}) } };
    const plain = airframe(refBuild, catalog);
    let all = true;
    for (const [key, value] of Object.entries(ref.airframe)) {
      if (NOT_COMPARED.has(key) || !(key in plain) || Array.isArray(value) || typeof value !== 'number') continue;
      all = ok(close(plain[key], value, `${where} reference ${key}`), `${where}: the preset's airframe ${key} ${plain[key]} vs ${value}`) && all;
    }
    ok(all, `${where}: the preset itself like the mod`);
  }
}
console.log(`Mod vectors (creative-analysis-vectors.json, ${fixture.vectors.length}): sanitize ${counts.sanitize}, values and base values ${counts.values}, `
  + `flight builds ${counts.flight} (${counts.parts} changed parts like the mod's part files), airframe ${counts.airframe}, analysis ${counts.analysis}, `
  + `notes ${counts.warnings}, camera range ${counts.camera}`);
console.log(`  numbers: ${stats.compared} compared, ${stats.exact} bit-identical, max relative deviation ${stats.maxRel.toExponential(2)}${stats.maxRel ? ` at ${stats.maxAt}` : ''}`);
console.log(`  AirframeSpec fields the site's analysis does not carry: ${[...counts.skippedFields].sort().join(', ') || 'none'}`);

// ---------------------------------------------------------------------------------------------------------------
// 3. CreativeFlightTest on every preset of the site's catalog (add-ons included)

const NOT_PHYSICS = new Set(['build', 'buildKey', 'buildable', 'assemblable', 'escMinCells', 'escMaxCells', 'escOvervoltage', 'fpv', 'escLoadCurrent']);
/** assertSamePhysics: every number bit for bit (rel 0), or within rel (for the comparisons the mod does not make). */
function samePhysics(expected, actual, where, rel = 0) {
  let all = true;
  const eqNum = (a, b) => Object.is(a, b) || (rel > 0 && typeof a === 'number' && Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b)));
  for (const key of Object.keys(expected)) {
    if (NOT_PHYSICS.has(key)) continue;
    const a = expected[key];
    const b = actual[key];
    const eq = Array.isArray(a) ? a.length === b.length && a.every((x, i) => eqNum(x, b[i])) : typeof a === 'object' && a !== null ? same(a, b) : eqNum(a, b);
    all = ok(eq, `${where}: ${key} ${JSON.stringify(a)} vs ${JSON.stringify(b)}`) && all;
  }
  return all;
}
const creativeOf = (b) => ({ ...b, stack: creative.CREATIVE_FC, accessories: { ...(b.accessories || {}) } });
const ANALYSIS_KEYS = Object.keys(analyze(catalog.presetBuild(catalog.presets[0].id), catalog)).filter((k) => !['warnings', 'extra', 'esc_load_percent', 'props_in_view_percent'].includes(k));
let templates = 0;
let baseSame = 0;
let baseSameOwn = 0;
let effects = 0;
let lensKept = 0;
const whoop = catalog.presetBuild('propwash:whoop');
for (const preset of catalog.presets) {
  const pb = catalog.presetBuild(preset.id);
  // templateOfAPresetFliesExactlyLikeThePreset: on the whoop's parts with the creative FC and the preset's video
  const installed = { ...whoop, stack: creative.CREATIVE_FC, video: pb.video, accessories: { ...pb.accessories } };
  const template = creative.templateOf(pb);
  const expected = airframe(pb, catalog);
  const actual = airframe(installed, catalog, template);
  const flight = creative.creativeFlight(installed, template, catalog);
  if (ok(expected && actual, `${preset.id}: airframes`) && samePhysics(expected, actual, `${preset.id} as template`)
    && ok(actual.escMinCells === 1 && actual.escMaxCells === 12, `${preset.id} as template: flight stack 1–12S`)
    && ok(flight.build.stack === pb.stack && flight.catalog.part(pb.stack) !== catalog.part(pb.stack) && flight.catalog.part(pb.frame) === catalog.part(pb.frame),
      `${preset.id} as template: only the stack is a detached part`)) {
    const pa = analyze(pb, catalog);
    const ta = analyze(installed, catalog, template);
    if (ok(ANALYSIS_KEYS.every((k) => Object.is(pa[k], ta[k])) && same(pa.warnings.filter((w) => w !== 'props_in_view' && w !== 'esc_overvoltage'), ta.warnings.filter((w) => w !== 'props_in_view')),
      `${preset.id} as template: figures like the preset ${ANALYSIS_KEYS.filter((k) => !Object.is(pa[k], ta[k]))}`)) templates++;
  }
  // valuesEqualToTheBaseChangeNothing: bit for bit on Propwash's presets (the mod tests the racer); a value in mΩ of an
  // add-on part may come back one bit off after mΩ → Ω (0.0929 Ω → 92.89999999999999 mΩ → 0.09290000000000001 Ω), in
  // the game alike (the editor drops a value equal to the base, so it never flies so).
  const plain = creativeOf(pb);
  const values = {};
  for (const p of creative.PARAMS) if (!creative.isAuto(p)) values[p.key] = creative.baseValue(plain, null, p, catalog);
  const own = preset.id.startsWith('propwash:');
  if (samePhysics(airframe(plain, catalog), airframe(plain, catalog, { base: {}, values }), `${preset.id}: values equal to the base`, own ? 0 : 1e-12)) {
    baseSame++;
    if (own) baseSameOwn++;
  }
  // cameraAutoPositionKeepsTheLens
  const camValues = {};
  for (const p of creative.CAMERA_POSITION) camValues[p.key] = creative.baseValue(plain, null, p, catalog);
  const before = airframe(plain, catalog);
  const after = airframe(plain, catalog, { base: {}, values: camValues });
  if (ok(Math.abs(before.lensForward - after.lensForward) <= 1e-4 && Math.abs(before.lensUp - after.lensUp) <= 1e-4 && Math.abs(before.lensRight - after.lensRight) <= 1e-4,
    `${preset.id}: the camera's automatic position keeps the lens`)) lensKept++;
}
// everyParameterReachesTheFlightModel, freeArmsMoveTheMotors (the 5″ freestyle preset with the creative FC)
{
  const plain = creativeOf(catalog.presetBuild('propwash:freestyle'));
  const before = airframe(plain, catalog);
  const effectsList = [['frame.mass_g', 1.5, 'massKg'], ['motor.mass_g', 1.5, 'massKg'], ['prop.mass_g', 1.5, 'rotorInertia'], ['battery.mass_g', 1.5, 'massKg'],
    ['stack.mass_g', 1.5, 'massKg'], ['video.mass_g', 1.5, 'massKg'], ['frame.wheelbase_mm', 1.3, 'armLength'], ['prop.diameter_mm', 1.2, 'propDiameter'],
    ['prop.pitch_in', 1.2, 'propPitch'], ['prop.ct', 1.2, 'kThrust'], ['prop.cp', 1.2, 'kTorque'], ['motor.kv', 1.2, 'kv'], ['motor.resistance_mohm', 1.5, 'motorResistance'],
    ['motor.max_current_a', 1.5, 'idleCurrent'], ['battery.cells', 0.5, (q) => -q.cells], ['battery.capacity_mah', 1.5, 'capacityMah'],
    ['battery.resistance_mohm', 1.5, 'packResistance'], ['battery.c_rating', 1.5, 'continuousCurrent'], ['stack.esc_current_a', 1.5, 'escCurrentLimit'],
    ['frame.frontal_area_cm2', 1.5, 'areaZ'], ['frame.drag_cd', 1.5, 'dragCoefficient'], ['frame.side_area_cm2', 1.5, 'areaX'], ['frame.top_area_cm2', 1.5, 'areaY'],
    ['frame.impact_tolerance', 1.5, 'impactTolerance'], ['inertia.roll', 2.0, 'inertiaZz'], ['inertia.pitch', 2.0, 'inertiaXx'], ['inertia.yaw', 2.0, 'inertiaYy'],
    ['camera.forward', 1.5, 'lensForward'], ['camera.up', 1.5, 'lensUp']];
  for (const [key, factor, field] of effectsList) {
    const p = creative.param(key);
    const base = creative.baseValue(plain, null, p, catalog);
    const target = creative.clamp(p, base * factor);
    const after = airframe(plain, catalog, { base: {}, values: { [key]: target } });
    const f = typeof field === 'function' ? field : (q) => q[field];
    if (ok(base !== target && creative.value(plain, { base: {}, values: { [key]: target } }, p, catalog) === target && f(after) > f(before), `${key} reaches the flight model (${f(before)} → ${f(after)})`)) effects++;
  }
  const fov = cameraView(plain, catalog, { base: {}, values: { 'video.fov_deg': 100 } });
  ok(fov && fov.horizontal_fov_deg === cameraView(plain, catalog).horizontal_fov_deg, 'the camera occlusion keeps the installed camera (FpvRig.of(build))');
  const blades = creative.creativeFlight(plain, { base: {}, values: { 'prop.blades': 5 } }, catalog);
  ok(blades.catalog.part(blades.build.prop).data.blades === 5, 'blades reach the flight prop');
  ok(airframe(plain, catalog, { base: {}, values: { 'frame.ducts': 1 } }).ducted && !before.ducted, 'ducts on');
  ok(!airframe(creativeOf(catalog.presetBuild('propwash:whoop')), catalog, { base: {}, values: { 'frame.ducts': 0 } }).ducted, 'ducts off on the whoop');
  const roll = creative.rint(2.0 * before.inertiaZz * creative.GRAM_CM2_PER_KG_M2);
  const inertia = airframe(plain, catalog, { base: {}, values: { 'inertia.roll': roll } });
  ok(Math.abs(inertia.inertiaZz - roll / creative.GRAM_CM2_PER_KG_M2) <= 1e-15 && inertia.inertiaXx === before.inertiaXx && inertia.authorityRoll < before.authorityRoll, 'inertia roll');
  const arms = {};
  for (const p of creative.ARMS) {
    const base = creative.baseValue(plain, null, p, catalog);
    arms[p.key] = p.key.endsWith('.up') ? base : base * 1.5;
  }
  const free = airframe(plain, catalog, { base: {}, values: arms });
  ok(free.explicitArms && Math.abs(free.armLength - 1.5 * before.armLength) <= 1e-3 && free.inertiaZz > before.inertiaZz, 'free arms move the motors');
  const stretched = airframe(plain, catalog, { base: {}, values: { ...arms, 'arm.front_left.forward': 300, 'arm.front_right.forward': 300 } });
  ok(stretched.inertiaXx > free.inertiaXx && Math.abs(stretched.comZ) > 1e-3, 'stretched arms');
}
console.log(`CreativeFlightTest on ${catalog.presets.length} presets of the catalog: preset as template ${templates}/${catalog.presets.length} bit for bit `
  + `(airframe and figures), values equal to the base ${baseSame}/${catalog.presets.length} (Propwash's ${baseSameOwn} bit for bit, add-ons within 1e-12), lens kept ${lensKept}/${catalog.presets.length}, ${effects}/29 values reach the flight model`);

// ---------------------------------------------------------------------------------------------------------------
// 4. creativeFlight for the simulator, the editor's logic

{
  const plain = creativeOf(catalog.presetBuild('propwash:freestyle'));
  const normal = catalog.presetBuild('propwash:freestyle');
  const f0 = creative.creativeFlight(normal, { base: {}, values: { 'motor.kv': 2600 } }, catalog);
  ok(f0.build === normal && f0.catalog === catalog && f0.inertia === null, 'creativeFlight: values count only with the creative FC');
  const f1 = creative.creativeFlight(plain, null, catalog);
  ok(f1.build === plain && f1.catalog === catalog && f1.inertia === null, 'creativeFlight: no values, the same build and catalog');
  const f2 = creative.creativeFlight(plain, { base: { frame: 'whoop_65' }, values: { 'motor.kv': 2600, 'inertia.yaw': 30000 } }, catalog);
  ok(f2.build.frame === 'propwash:whoop_65' && f2.build.video === plain.video && f2.catalog.part(plain.motor).data.kv === 2600 && catalog.part(plain.motor).data.kv === 1750,
    'creativeFlight: base frame, KV in the flight catalog only');
  ok(f2.inertia && Number.isNaN(f2.inertia[0]) && f2.inertia[1] === 30000 / 1e7 && Number.isNaN(f2.inertia[2]), `creativeFlight: inertia [xx, yy, zz] ${f2.inertia}`);
  ok(typeof f2.catalog.analyze === 'function' && f2.catalog.analyze(f2.build) && typeof f2.catalog.partsIn === 'function' && f2.catalog.chemistry('propwash:lipo'),
    'creativeFlight: the flight catalog has the interface of createCatalog');
  ok(creative.creativeFlight(plain, { base: { frame: 'whoop_65' }, values: { 'motor.kv': 2600, 'inertia.yaw': 30000 } }, catalog) === f2, 'creativeFlight: cached per build and values');

  // CreativeDraft#set: clamp with a note, back to the base drops the value
  let r = creative.setValue(plain, null, creative.param('motor.kv'), 99999, catalog);
  ok(r.spec.values['motor.kv'] === 60000 && r.note && r.note.applied === 60000 && r.note.requested === 99999, 'set: clamped with a note');
  r = creative.setValue(plain, r.spec, creative.param('motor.kv'), 1750, catalog);
  ok(!('motor.kv' in r.spec.values) && !r.note, 'set: the base value drops the own value');
  r = creative.setValue(plain, null, creative.param('prop.blades'), 3.4, catalog);
  ok(!('prop.blades' in r.spec.values) && !r.note, 'set: 3.4 blades are the base 3');
  r = creative.setValue(plain, null, creative.param('inertia.roll'), 20000, catalog);
  ok(r.spec.values['inertia.roll'] === 20000, 'set: an automatic value of its own');
  // base parts
  let s = creative.setBase(plain, null, 'frame', 'race_5', catalog);
  ok(s.base.frame === 'race_5' && creative.basePart(plain, s, 'frame', catalog) === 'race_5', 'base part set');
  s = creative.setBase(plain, s, 'frame', 'freestyle_5', catalog);
  ok(!('frame' in s.base), 'base part = installed part removes it');
  s = creative.setBase(plain, s, 'frame', 'nope', catalog);
  ok(!('frame' in s.base), 'an unknown base part is not taken');
  s = creative.setBase(plain, s, 'prop', 'justmoreparts:p31_14_3b_bi', catalog);
  ok(s.base.prop === 'justmoreparts:p31_14_3b_bi' && creative.baseParts(plain, s, catalog).prop.id === 'justmoreparts:p31_14_3b_bi', 'an add-on part as base');
  // load a template
  const loaded = creative.load(plain, { base: { frame: 'freestyle_5', motor: 'm2306_1860' }, values: { 'motor.kv': 1e9, 'laser.power': 3 } }, catalog);
  ok(same(loaded.spec.base, { motor: 'm2306_1860' }) && loaded.spec.values['motor.kv'] === 60000 && loaded.notes.length === 2, `load: ${JSON.stringify(loaded)}`);
  // CameraMount.range: 0–80° only for creative drones
  ok(cameraView(plain, catalog).uptilt_max_deg === 80 && cameraView(normal, catalog).uptilt_max_deg === 50, 'camera 0–80° with the creative FC');
  // the creative FC in the catalog
  const fc = catalog.part(creative.CREATIVE_FC);
  ok(fc && fc.creative_only && catalog.creativeOnly(creative.CREATIVE_FC) && !catalog.creativeOnly('propwash:stack_30'), 'the creative FC is in the catalog, marked creative only');
  ok(fc && fc.data.cells[0] === 1 && fc.data.cells[1] === 12, 'the creative FC takes 1–12S');
  let fits = 0;
  for (const frame of catalog.partsIn('frame')) {
    const c = catalog.check({ ...plain, frame: frame.id });
    if (ok(!c.problems.includes('stack_mount') && !c.unknownParts.length, `the creative FC fits ${frame.id}`)) fits++;
  }
  console.log(`creativeFlight and the editor: values only with the creative FC, flight catalog, inertia [xx, yy, zz], set/clamp/base, templates; the creative FC fits ${fits}/${catalog.partsIn('frame').length} frames`);
}

if (failures.length) {
  console.log(`FAIL: ${checks - failures.length}/${checks} checks passed`);
  for (const f of failures.slice(0, 60)) console.log(`  ${f}`);
  if (failures.length > 60) console.log(`  … ${failures.length - 60} more`);
  process.exitCode = 1;
} else {
  console.log(`PASS: ${checks} checks`);
}
