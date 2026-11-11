// Creative drones (creative flight controller and drone editor of Propwash 0.6.0): a port of creative.CreativeParam,
// CreativeSpec, CreativeFlight, CreativeLimits and CreativeCheck, and of the value logic of CreativeDraft. The physics
// stay the same: a creative drone flies the parts of its flight build, whose data carry the editor's values.
//
//   creativeFlight(build, creative, catalog) → { build, catalog, inertia }
//     build     the flight build: the base parts (spec.base, else the installed parts; never the video), each part
//               with a value written into its part data like PartJson.encode → patch → PartJson.decode, as a detached
//               part with the same id; the flight stack always takes 1–12S with the brownout rule of the mod
//     catalog   an object with the interface of data.js createCatalog whose part(id) gives the changed data
//     inertia   [xx, yy, zz] in kg·m² (pitch, yaw, roll; NaN = automatic), or null without an inertia value
//   For a build without the creative flight controller, or without values, build and catalog come back unchanged
//   (the same objects) and inertia is null – the drone flies exactly like that build (DroneBuild#flight).
//
// creative: { base: { frame?, stack?, motor?, prop?, battery? }, values: { <key>: number } } as in the share codes
// (sharecode3.js normalizeCreative); base keys like PartInfo#key (Propwash parts without namespace, add-on parts as
// "ns:path"). Values are in the units of the editor (g, mm, mΩ, cm², g·cm²) and are clamped where they are used.
// tools/test-creative-flight.mjs holds all of it against the mod's classes (tools/fixtures/creative-analysis-vectors.json).

import { normalizeCreative } from './sharecode3.js?v=024bd980';
import { decodeObject, trueX, ARM_KEYS, PROPS_IN, MASS_SPLIT_OPEN, MASS_SPLIT_DUCTED } from './partjson.js?v=1061e25f';
import { exportData, exportDerived } from './catalog-build.js?v=211c1389';
import { CREATIVE_FC } from './rules.js?v=26a8eb49';
import { cameraFov, UPTILT_MIN, UPTILT_MAX } from './fpv.js?v=76cdbbe6';
import { airframe as airframeOf, analyze as analyzeBuild } from './analysis.js?v=293f859b';

export { CREATIVE_FC };
export const STACK_MIN_CELLS = 1;
export const STACK_MAX_CELLS = 12;
export const GRAM_CM2_PER_KG_M2 = 1.0e7;
export const BASE_KINDS = Object.freeze(['frame', 'stack', 'motor', 'prop', 'battery']);
export const GROUPS = Object.freeze(['mass', 'geometry', 'props', 'motors', 'battery', 'esc', 'aero', 'camera']);
// CreativeCheck
export const INERTIA_LOW_FACTOR = 0.25;
export const INERTIA_HIGH_FACTOR = 4.0;
export const EXTREME_THRUST_TO_WEIGHT = 25.0;
/** StateValidation.PHYSICS_MAX_SPEED (m/s): the speed limit of the server. */
export const PHYSICS_MAX_SPEED = 150.0;
export const WARNINGS = Object.freeze(['props_overlap', 'inertia_low', 'inertia_high', 'extreme_thrust', 'over_server_speed']);
const BROWNOUT_1S = 2.9;
const BROWNOUT_MULTI = 5.5;

// CreativeParam: key, group, part (null: none), unit, min, max, step, decimals, kind.
const P = (key, group, part, unit, min, max, step, decimals, kind) => Object.freeze({ key, group, part, unit, min, max, step, decimals, kind });
export const PARAMS = Object.freeze([
  P('frame.mass_g', 'mass', 'frame', 'g', 1.0, 5000.0, 1.0, 1, 'number'),
  P('motor.mass_g', 'mass', 'motor', 'g', 0.5, 500.0, 0.5, 1, 'number'),
  P('prop.mass_g', 'mass', 'prop', 'g', 0.1, 200.0, 0.1, 2, 'number'),
  P('battery.mass_g', 'mass', 'battery', 'g', 5.0, 5000.0, 1.0, 1, 'number'),
  P('stack.mass_g', 'mass', 'stack', 'g', 0.5, 500.0, 0.5, 1, 'number'),
  P('video.mass_g', 'mass', 'video', 'g', 0.5, 500.0, 0.5, 1, 'number'),
  P('inertia.roll', 'mass', null, 'g·cm²', 1.0, 5.0e6, 1.0, 0, 'auto'),
  P('inertia.pitch', 'mass', null, 'g·cm²', 1.0, 5.0e6, 1.0, 0, 'auto'),
  P('inertia.yaw', 'mass', null, 'g·cm²', 1.0, 5.0e6, 1.0, 0, 'auto'),
  P('frame.wheelbase_mm', 'geometry', 'frame', 'mm', 40.0, 1500.0, 1.0, 0, 'integer'),
  P('arm.front_left.forward', 'geometry', 'frame', 'mm', 5.0, 1000.0, 1.0, 1, 'auto'),
  P('arm.front_left.right', 'geometry', 'frame', 'mm', -1000.0, -5.0, 1.0, 1, 'auto'),
  P('arm.front_left.up', 'geometry', 'frame', 'mm', -200.0, 200.0, 1.0, 1, 'auto'),
  P('arm.front_right.forward', 'geometry', 'frame', 'mm', 5.0, 1000.0, 1.0, 1, 'auto'),
  P('arm.front_right.right', 'geometry', 'frame', 'mm', 5.0, 1000.0, 1.0, 1, 'auto'),
  P('arm.front_right.up', 'geometry', 'frame', 'mm', -200.0, 200.0, 1.0, 1, 'auto'),
  P('arm.rear_left.forward', 'geometry', 'frame', 'mm', -1000.0, -5.0, 1.0, 1, 'auto'),
  P('arm.rear_left.right', 'geometry', 'frame', 'mm', -1000.0, -5.0, 1.0, 1, 'auto'),
  P('arm.rear_left.up', 'geometry', 'frame', 'mm', -200.0, 200.0, 1.0, 1, 'auto'),
  P('arm.rear_right.forward', 'geometry', 'frame', 'mm', -1000.0, -5.0, 1.0, 1, 'auto'),
  P('arm.rear_right.right', 'geometry', 'frame', 'mm', 5.0, 1000.0, 1.0, 1, 'auto'),
  P('arm.rear_right.up', 'geometry', 'frame', 'mm', -200.0, 200.0, 1.0, 1, 'auto'),
  P('prop.diameter_mm', 'props', 'prop', 'mm', 20.0, 400.0, 1.0, 0, 'integer'),
  P('prop.pitch_in', 'props', 'prop', '″', 0.5, 12.0, 0.1, 1, 'number'),
  P('prop.blades', 'props', 'prop', '', 2.0, 8.0, 1.0, 0, 'integer'),
  P('prop.ct', 'props', 'prop', '', 0.01, 0.4, 0.001, 3, 'number'),
  P('prop.cp', 'props', 'prop', '', 0.005, 0.4, 0.001, 3, 'number'),
  P('motor.kv', 'motors', 'motor', 'KV', 100.0, 60000.0, 10.0, 0, 'integer'),
  P('motor.resistance_mohm', 'motors', 'motor', 'mΩ', 5.0, 2000.0, 1.0, 0, 'number'),
  P('motor.max_current_a', 'motors', 'motor', 'A', 1.0, 200.0, 0.5, 1, 'number'),
  P('battery.cells', 'battery', 'battery', 'S', 1.0, 12.0, 1.0, 0, 'integer'),
  P('battery.capacity_mah', 'battery', 'battery', 'mAh', 50.0, 50000.0, 10.0, 0, 'integer'),
  P('battery.resistance_mohm', 'battery', 'battery', 'mΩ', 1.0, 500.0, 0.5, 1, 'number'),
  P('battery.c_rating', 'battery', 'battery', 'C', 1.0, 300.0, 1.0, 0, 'integer'),
  P('stack.esc_current_a', 'esc', 'stack', 'A', 1.0, 300.0, 1.0, 0, 'number'),
  P('frame.frontal_area_cm2', 'aero', 'frame', 'cm²', 5.0, 5000.0, 1.0, 0, 'number'),
  P('frame.drag_cd', 'aero', 'frame', '', 0.05, 3.0, 0.01, 2, 'number'),
  P('frame.side_area_cm2', 'aero', 'frame', 'cm²', 5.0, 20000.0, 1.0, 0, 'auto'),
  P('frame.top_area_cm2', 'aero', 'frame', 'cm²', 5.0, 20000.0, 1.0, 0, 'auto'),
  P('frame.ducts', 'aero', 'frame', '', 0.0, 1.0, 1.0, 0, 'toggle'),
  P('frame.impact_tolerance', 'aero', 'frame', 'm/s', 1.0, 100.0, 0.5, 1, 'number'),
  P('video.fov_deg', 'camera', 'video', '°', 60.0, 160.0, 1.0, 0, 'integer'),
  P('camera.forward', 'camera', 'frame', 'mm', -500.0, 500.0, 1.0, 1, 'auto'),
  P('camera.right', 'camera', 'frame', 'mm', -500.0, 500.0, 1.0, 1, 'auto'),
  P('camera.up', 'camera', 'frame', 'mm', -500.0, 500.0, 1.0, 1, 'auto'),
]);
const BY_KEY = new Map(PARAMS.map((p) => [p.key, p]));
const keyed = (keys) => Object.freeze(keys.map((k) => BY_KEY.get(k)));
export const INERTIA = keyed(['inertia.roll', 'inertia.pitch', 'inertia.yaw']);
export const ARMS = keyed(ARM_KEYS.flatMap((arm) => ['forward', 'right', 'up'].map((axis) => `arm.${arm}.${axis}`)));
export const CAMERA_POSITION = keyed(['camera.forward', 'camera.right', 'camera.up']);
const P_ = Object.fromEntries(PARAMS.map((p) => [p.key, p]));

/** CreativeParam.byKey: the parameter of a key, or null. */
export const param = (key) => BY_KEY.get(key) || null;
/** The parameters of a group in the editor's order (CreativeParam.grouped). */
export const grouped = (group) => PARAMS.filter((p) => p.group === group);
export const isAuto = (p) => p.kind === 'auto';
export const isToggle = (p) => p.kind === 'toggle';
export const isInteger = (p) => p.kind === 'integer' || p.kind === 'toggle';

/** java.lang.Math.rint: the nearest whole number, halves to the even one. */
export function rint(x) {
  if (!Number.isFinite(x)) return x;
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

/** CreativeParam#round: whole numbers for integer parameters, else decimals + 2 places; −0 becomes 0. */
export function round(p, value) {
  if (isInteger(p)) return rint(value);
  const scale = Math.pow(10.0, p.decimals + 2);
  const rounded = rint(value * scale) / scale;
  return rounded === 0 ? 0 : rounded;
}

/** CreativeParam#clamp. */
export const clamp = (p, value) => round(p, Math.max(p.min, Math.min(p.max, value)));
/** CreativeLimits.tolerance: how far a value may be from another and still be the same. */
export const tolerance = (p) => (isInteger(p) ? 0.5 : Math.pow(10.0, -p.decimals - 1));
/** CreativeParam#inRange. */
export const inRange = (p, value) => Number.isFinite(value) && value >= p.min && value <= p.max;

// ---------------------------------------------------------------------------------------------------------------
// The spec (CreativeSpec)

/** CreativeSpec with every entry of the editor's form: {base, values} (values without prototype), EMPTY for null. */
export function spec(creative) {
  return normalizeCreative(creative || { base: {}, values: {} });
}

const has = (s, p) => Object.prototype.hasOwnProperty.call(s.values, p.key);
const hasAny = (s, list) => list.some((p) => has(s, p));
const valueOf = (s, p) => (has(s, p) ? s.values[p.key] : undefined);
export const isEmpty = (s) => !s || (!Object.keys(s.base || {}).length && !Object.keys(s.values || {}).length);

/** CreativeSpec#without: the spec without the values of the given parameters. */
export function without(s, params) {
  const values = Object.create(null);
  for (const key of Object.keys(s.values)) if (!params.some((p) => p.key === key)) values[key] = s.values[key];
  return { base: { ...s.base }, values };
}

/** CreativeSpec#with: the spec with one value set. */
export function withValue(s, p, value) {
  return spec({ base: s.base, values: { ...s.values, [p.key]: value } });
}

/** CreativeSpec#withBase / withoutBase: the spec with a base part of a kind (key null: without). */
export function withBase(s, kind, key) {
  const base = { ...s.base };
  if (key == null) delete base[kind];
  else base[kind] = key;
  return spec({ base, values: s.values });
}

// ---------------------------------------------------------------------------------------------------------------
// Parts

/** DroneBuild#isCreative: the build has the creative flight controller as its stack. */
export const isCreative = (build) => !!build && build.stack === CREATIVE_FC;

/** PartInfo#key of a part id: Propwash parts without their namespace, add-on parts as "ns:path". */
export function partKey(id) {
  return String(id).startsWith('propwash:') ? String(id).slice('propwash:'.length) : String(id);
}

/** The part id of a key like PartIndex.byKey ("path" is a Propwash part). */
export function keyId(key) {
  return String(key).includes(':') ? String(key) : `propwash:${key}`;
}

/** CreativeFlight.lookup / CreativeLimits.part: the catalog part of a base key of a kind, or null. */
export function lookup(kind, key, catalog) {
  if (typeof key !== 'string' || !key) return null;
  const part = catalog.part(keyId(key));
  return part && part.category === kind ? part : null;
}

/** CreativeLimits.resolves. */
export const resolves = (kind, key, catalog) => BASE_KINDS.includes(kind) && lookup(kind, key, catalog) !== null;

/** CreativeFlight.base: the base parts {frame, stack, motor, prop, battery, video} (catalog parts; the video is always the installed one). */
export function baseParts(build, s, catalog) {
  const out = {};
  for (const kind of ['frame', 'stack', 'motor', 'prop', 'battery', 'video']) {
    const installed = catalog.part(build[kind]);
    const key = kind === 'video' ? undefined : s.base[kind];
    out[kind] = (key !== undefined && lookup(kind, key, catalog)) || installed;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Values (CreativeFlight.value / baseValue, CreativeDraft)

const airframeCache = new WeakMap();

/** AirframeSpec.of(build with the creative values): the derived airframe of analysis.js, cached per catalog. */
function airframe(build, s, catalog) {
  let cache = airframeCache.get(catalog);
  if (!cache) airframeCache.set(catalog, (cache = new Map()));
  const key = JSON.stringify([build, s]);
  if (cache.has(key)) return cache.get(key);
  const p = airframeOf(build, catalog, isEmpty(s) ? null : s);
  if (cache.size >= 64) cache.delete(cache.keys().next().value);
  cache.set(key, p);
  return p;
}

/** CreativeFlight.value: the value the drone flies with (its own value clamped, else the base or automatic value). */
export function value(build, creative, p, catalog) {
  const s = spec(creative);
  const v = valueOf(s, p);
  return v !== undefined ? clamp(p, v) : baseValue(build, s, p, catalog);
}

/** CreativeDraft#base: the value a parameter has without its own value (base or automatic value). */
export function baseOf(build, creative, p, catalog) {
  return baseValue(build, without(spec(creative), [p]), p, catalog);
}

/** CreativeFlight.baseValue. NaN when the build cannot be analysed (an automatic value needs the flight model). */
export function baseValue(build, creative, p, catalog) {
  const s = spec(creative);
  const base = baseParts(build, s, catalog);
  if (Object.values(base).some((part) => !part)) return NaN;
  const frame = base.frame.data;
  switch (p.key) {
    case 'frame.mass_g': return base.frame.basics.mass_g;
    case 'motor.mass_g': return base.motor.basics.mass_g;
    case 'prop.mass_g': return base.prop.basics.mass_g;
    case 'battery.mass_g': return base.battery.basics.mass_g;
    case 'stack.mass_g': return base.stack.basics.mass_g;
    case 'video.mass_g': return base.video.basics.mass_g;
    case 'inertia.roll': return autoInertia(build, s, catalog, 'inertiaZz');
    case 'inertia.pitch': return autoInertia(build, s, catalog, 'inertiaXx');
    case 'inertia.yaw': return autoInertia(build, s, catalog, 'inertiaYy');
    case 'frame.wheelbase_mm': return frame.wheelbase_mm;
    case 'prop.diameter_mm': return base.prop.data.diameter_mm;
    case 'prop.pitch_in': return base.prop.data.pitch_in;
    case 'prop.blades': return base.prop.data.blades;
    case 'prop.ct': return base.prop.data.ct;
    case 'prop.cp': return base.prop.data.cp;
    case 'motor.kv': return base.motor.data.kv;
    case 'motor.resistance_mohm': return base.motor.data.resistance_ohm * 1000.0;
    case 'motor.max_current_a': return base.motor.data.max_current_a;
    case 'battery.cells': return base.battery.data.cells;
    case 'battery.capacity_mah': return base.battery.data.capacity_mah;
    case 'battery.resistance_mohm': return base.battery.data.cell_resistance_ohm * 1000.0;
    case 'battery.c_rating': return base.battery.data.c_rating;
    case 'stack.esc_current_a': return base.stack.data.esc_continuous_a;
    case 'frame.frontal_area_cm2': return frame.aero.frontal_area_m2 * 1.0e4;
    case 'frame.drag_cd': return frame.aero.drag_coefficient;
    case 'frame.side_area_cm2': return frame.aero.side_area_m2 != null ? frame.aero.side_area_m2 * 1.0e4
      : 1.15 * (value(build, s, P_['frame.frontal_area_cm2'], catalog) / 1.0e4) * 1.0e4;
    case 'frame.top_area_cm2': return frame.aero.top_area_m2 != null ? frame.aero.top_area_m2 * 1.0e4
      : (value(build, s, P_['frame.ducts'], catalog) >= 0.5 ? 2.5 : 2.9) * (value(build, s, P_['frame.frontal_area_cm2'], catalog) / 1.0e4) * 1.0e4;
    case 'frame.ducts': return frame.duct != null ? 1.0 : 0.0;
    case 'frame.impact_tolerance': return frame.impact_tolerance;
    case 'video.fov_deg': return cameraFov(base.video);
    case 'camera.forward': case 'camera.right': case 'camera.up': {
      const auto = autoCamera(build, s, catalog);
      return clamp(p, auto[CAMERA_POSITION.indexOf(p)]);
    }
    default: {
      const index = ARMS.indexOf(p);
      if (index >= 0) return clamp(p, autoArms(base, s)[Math.floor(index / 3)][index % 3]);
      return NaN;
    }
  }
}

function autoInertia(build, s, catalog, field) {
  const p = airframe(build, without(s, INERTIA), catalog);
  return p ? p[field] * GRAM_CM2_PER_KG_M2 : NaN;
}

/** CreativeFlight.freeArms: a motor position of its own makes every arm free. */
export const freeArms = (s) => hasAny(spec(s), ARMS);

/** CreativeFlight.autoArms: [forward, right, up] in mm of the four arms from the base frame and the wheelbase. */
export function autoArms(base, s) {
  const frame = base.frame.data;
  const baseWheelbase = frame.wheelbase_mm;
  const v = valueOf(s, P_['frame.wheelbase_mm']);
  const wheelbase = Math.trunc(v !== undefined ? clamp(P_['frame.wheelbase_mm'], v) : baseWheelbase);
  let arms;
  let scale = 1.0;
  if (frame.arms_explicit) {
    arms = ARM_KEYS.map((k) => frame.arms[k].pos);
    scale = wheelbase / baseWheelbase;
  } else {
    arms = trueX(wheelbase, 0.0).map((a) => a.position);
  }
  return arms.map((pos) => [-pos[2] * scale, pos[0] * scale, pos[1]]);
}

/** CreativeFlight.autoCamera: [forward, right, up] in mm of the frame's camera, else of the flight model's lens. */
function autoCamera(build, s, catalog) {
  const camera = baseParts(build, s, catalog).frame.data.camera.pos;
  if (camera) return [-camera[2], camera[0], camera[1]];
  const p = airframe(build, without(s, CAMERA_POSITION), catalog);
  if (!p) return [NaN, NaN, NaN];
  return [(p.lensForward + p.comZ) * 1000.0, (p.lensRight - p.comX) * 1000.0, (p.lensUp + p.comHeight) * 1000.0];
}

/** CreativeFlight.inertia in the mod's order [roll, pitch, yaw] (kg·m², NaN = automatic), or null. */
function inertiaRpy(s) {
  if (!hasAny(s, INERTIA)) return null;
  return INERTIA.map((p) => (has(s, p) ? clamp(p, s.values[p.key]) / GRAM_CM2_PER_KG_M2 : NaN));
}

// ---------------------------------------------------------------------------------------------------------------
// The flight build (CreativeFlight.compute)

/** PartJson.encode of a catalog part: the part file the mod writes for its definition (catalog data hold every value). */
export function encodePart(part) {
  const d = part.data;
  const json = { format: 1, mass_g: part.basics.mass_g };
  switch (part.category) {
    case 'frame': encodeFrame(d, json); break;
    case 'stack':
      json.mount = d.mount;
      json.esc_continuous_a = d.esc_continuous_a;
      json.cells = [...d.cells];
      json.all_in_one = d.all_in_one;
      for (const k of ['esc_burst_a', 'esc_resistance_ohm', 'brownout_v', 'board_size_mm']) if (d[k] != null) json[k] = d[k];
      break;
    case 'motor': {
      json.stator = d.stator;
      json.stator_mm = [...d.stator_mm];
      json.kv = d.kv;
      json.mount = d.mount;
      json.max_current_a = d.max_current_a;
      json.resistance_ohm = d.resistance_ohm;
      json.cells = [...d.cells];
      if (d.prop_mount) json.prop_mount = d.prop_mount;
      if (d.thermal) {
        const thermal = {};
        for (const [k, v] of Object.entries(d.thermal)) if (v != null) thermal[k] = v;
        json.thermal = thermal;
      }
      break;
    }
    case 'prop':
      json.diameter_mm = d.diameter_mm;
      json.pitch_in = d.pitch_in;
      json.blades = d.blades;
      json.ct = d.ct;
      json.cp = d.cp;
      json.material = d.material;
      if (d.stiffness != null) json.stiffness = d.stiffness;
      if (d.mount) json.mount = d.mount;
      break;
    case 'battery':
      json.cells = d.cells;
      json.capacity_mah = d.capacity_mah;
      json.cell_resistance_ohm = d.cell_resistance_ohm;
      json.c_rating = d.c_rating;
      json.chemistry = d.chemistry;
      if (d.pack_mm) json.pack_mm = [...d.pack_mm];
      if (d.connector) json.connector = d.connector;
      break;
    case 'video':
      json.link = d.link;
      json.latency_ms = d.latency_ms;
      json.range_blocks = d.range_blocks;
      json.image_quality = d.image_quality;
      json.camera_width_mm = d.camera_width_mm;
      if (d.camera_fov_deg != null) json.camera_fov_deg = d.camera_fov_deg;
      if (d.vtx_power_mw) json.vtx_power_mw = d.vtx_power_mw;
      if (d.power_w != null) json.power_w = d.power_w;
      if (d.antenna && !d.antenna.derived) {
        json.antenna = d.antenna.count === 0 ? 'none' : { count: d.antenna.count, length_mm: d.antenna.length_mm, cap: d.antenna.cap };
      }
      break;
    default: break;
  }
  if (part.basics.sort != null && part.basics.sort !== 1000) json.sort = part.basics.sort;
  if (part.basics.creative === false) json.creative = false;
  return json;
}

const sameSplit = (a, b) => a.arms === b.arms && a.plate === b.plate && a.duct === b.duct;

function encodeFrame(d, json) {
  json.role = d.role;
  json.shape = d.shape;
  json.wheelbase_mm = d.wheelbase_mm;
  if (d.props_mm[0] === 0) json.max_prop_mm = d.props_mm[1];
  else json.props_mm = [...d.props_mm];
  json.motor_mounts = [...d.motor_mounts];
  json.stack_mounts = [...d.stack_mounts];
  if (d.accessory_mounts.length) json.accessory_mounts = [...d.accessory_mounts];
  if (d.arms_explicit) {
    json.arms = {};
    for (const k of ARM_KEYS) json.arms[k] = { pos: [...d.arms[k].pos], spin: d.arms[k].spin };
  }
  json.battery = { on_top: d.battery.on_top, plate_mm: d.battery.plate_mm };
  json.electronics_mm = d.electronics_mm;
  json.camera = {};
  if (d.camera.pos) json.camera.pos = [...d.camera.pos];
  json.camera.tilt_deg = d.camera.tilt_deg;
  const com = d.center_of_mass_mm || [0, 0, 0];
  if (com.some((v) => v !== 0)) json.center_of_mass_mm = [...com];
  if (d.mass_split && !sameSplit(d.mass_split, d.duct != null ? MASS_SPLIT_DUCTED : MASS_SPLIT_OPEN)) json.mass_split = { ...d.mass_split };
  const anchors = Object.entries(d.accessory_anchors || {});
  if (anchors.length) {
    json.accessory_anchors = {};
    for (const [slot, a] of anchors) json.accessory_anchors[slot] = { pos: [...a.pos], tilt_deg: a.tilt_deg, length_mm: a.length_mm };
  }
  if (d.antenna_anchor && d.antenna_anchor.explicit) json.antenna_anchor = { pos: [...d.antenna_anchor.pos], tilt_deg: d.antenna_anchor.tilt_deg };
  json.aero = { frontal_area_m2: d.aero.frontal_area_m2, drag_coefficient: d.aero.drag_coefficient };
  if (d.aero.side_area_m2 != null) json.aero.side_area_m2 = d.aero.side_area_m2;
  if (d.aero.top_area_m2 != null) json.aero.top_area_m2 = d.aero.top_area_m2;
  if (d.duct) {
    json.duct = {};
    for (const [k, v] of Object.entries(d.duct)) if (v != null) json.duct[k] = v;
  }
  json.impact_tolerance = d.impact_tolerance;
  const fit = d.battery_fit;
  json.battery_fit = { cells: [...fit.cells], max_mass_g: fit.max_mass_g, preferred_min_cells: fit.preferred_min_cells,
    preferred_min_capacity_mah: fit.preferred_min_capacity_mah };
}

function number(json, field, s, p, divisor) {
  if (has(s, p)) json[field] = clamp(p, s.values[p.key]) / divisor;
}

function integer(json, field, s, p) {
  if (has(s, p)) json[field] = Math.trunc(clamp(p, s.values[p.key]));
}

function object(json, field) {
  const v = json[field];
  if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  json[field] = {};
  return json[field];
}

function patchFrame(json, base, s, camera) {
  const frame = base.frame.data;
  number(json, 'mass_g', s, P_['frame.mass_g'], 1.0);
  integer(json, 'wheelbase_mm', s, P_['frame.wheelbase_mm']);
  const free = hasAny(s, ARMS);
  if (free || (frame.arms_explicit && has(s, P_['frame.wheelbase_mm']))) {
    const auto = autoArms(base, s);
    const arms = {};
    for (let i = 0; i < ARM_KEYS.length; i++) {
      const position = [0, 0, 0];
      for (let axis = 0; axis < 3; axis++) {
        const p = ARMS[i * 3 + axis];
        const v = free ? valueOf(s, p) : undefined;
        position[axis] = clamp(p, v !== undefined ? v : auto[i][axis]);
      }
      const spin = frame.arms_explicit ? frame.arms[ARM_KEYS[i]].spin : PROPS_IN[i];
      arms[ARM_KEYS[i]] = { pos: [position[1], position[2], -position[0]], spin };
    }
    json.arms = arms;
  }
  const aero = object(json, 'aero');
  number(aero, 'frontal_area_m2', s, P_['frame.frontal_area_cm2'], 1.0e4);
  number(aero, 'drag_coefficient', s, P_['frame.drag_cd'], 1.0);
  number(aero, 'side_area_m2', s, P_['frame.side_area_cm2'], 1.0e4);
  number(aero, 'top_area_m2', s, P_['frame.top_area_cm2'], 1.0e4);
  if (has(s, P_['frame.ducts'])) {
    const on = clamp(P_['frame.ducts'], s.values['frame.ducts']) >= 0.5;
    if (on && !('duct' in json)) json.duct = true;
    else if (!on) delete json.duct;
  }
  number(json, 'impact_tolerance', s, P_['frame.impact_tolerance'], 1.0);
  if (camera) {
    const position = CAMERA_POSITION.map((p, axis) => clamp(p, has(s, p) ? s.values[p.key] : camera[axis]));
    object(json, 'camera').pos = [position[1], position[2], -position[0]];
  }
}

const defaultBrownout = (minCells) => (minCells === 1 ? BROWNOUT_1S : BROWNOUT_MULTI);

function patchStack(json, stack, s, flightCells) {
  number(json, 'mass_g', s, P_['stack.mass_g'], 1.0);
  if (has(s, P_['stack.esc_current_a'])) {
    const continuous = clamp(P_['stack.esc_current_a'], s.values['stack.esc_current_a']);
    json.esc_continuous_a = continuous;
    const burst = stack.data.esc_burst_a;
    if (burst != null) json.esc_burst_a = Math.max(continuous, burst * continuous / stack.data.esc_continuous_a);
  }
  json.cells = [STACK_MIN_CELLS, STACK_MAX_CELLS];
  const brownout = stack.data.brownout_v != null ? stack.data.brownout_v : defaultBrownout(stack.data.cells[0]);
  json.brownout_v = Math.min(brownout, defaultBrownout(flightCells));
}

function patchMotor(json, s) {
  number(json, 'mass_g', s, P_['motor.mass_g'], 1.0);
  integer(json, 'kv', s, P_['motor.kv']);
  number(json, 'resistance_ohm', s, P_['motor.resistance_mohm'], 1.0e3);
  number(json, 'max_current_a', s, P_['motor.max_current_a'], 1.0);
}

function patchProp(json, s) {
  number(json, 'mass_g', s, P_['prop.mass_g'], 1.0);
  integer(json, 'diameter_mm', s, P_['prop.diameter_mm']);
  number(json, 'pitch_in', s, P_['prop.pitch_in'], 1.0);
  integer(json, 'blades', s, P_['prop.blades']);
  number(json, 'ct', s, P_['prop.ct'], 1.0);
  number(json, 'cp', s, P_['prop.cp'], 1.0);
}

function patchBattery(json, s) {
  number(json, 'mass_g', s, P_['battery.mass_g'], 1.0);
  integer(json, 'cells', s, P_['battery.cells']);
  integer(json, 'capacity_mah', s, P_['battery.capacity_mah']);
  number(json, 'cell_resistance_ohm', s, P_['battery.resistance_mohm'], 1.0e3);
  integer(json, 'c_rating', s, P_['battery.c_rating']);
}

function patchVideo(json, s) {
  number(json, 'mass_g', s, P_['video.mass_g'], 1.0);
  number(json, 'camera_fov_deg', s, P_['video.fov_deg'], 1.0);
}

const touches = (s, kind) => PARAMS.some((p) => p.part === kind && has(s, p));

/**
 * CreativeFlight.patched: the part with its data written as part file, changed and read back (PartJson.decode, the
 * checks of the part data apply), as a catalog entry with the same id; the part itself when nothing changes or the
 * values give no valid part.
 */
function patched(kind, part, needed, patcher, catalog) {
  if (!needed || !part) return part;
  const json = encodePart(part);
  patcher(json);
  const { definition } = decodeObject(kind, part.id, json, `creative:${part.id}`);
  if (!definition) return part;
  const chemistry = (id) => {
    const c = catalog.chemistry(id);
    return c ? { nominalCellVoltage: c.nominal_v } : null;
  };
  return {
    ...part,
    basics: { ...part.basics, mass_g: definition.basics.massGrams },
    data: exportData(definition),
    derived: exportDerived(definition, chemistry),
    creative_flight: true,
  };
}

/** The catalog with some parts replaced (data.js withParts; a plain wrapper for catalogs without it). */
function catalogWith(catalog, parts) {
  if (!parts.length) return catalog;
  if (typeof catalog.withParts === 'function') return catalog.withParts(parts);
  const byId = new Map(parts.map((p) => [p.id, p]));
  const out = Object.create(catalog);
  out.part = (id) => byId.get(id) || catalog.part(id);
  out.category = (id) => (byId.get(id) || catalog.part(id) || {}).category || null;
  out.partsIn = (category) => catalog.partsIn(category).map((p) => byId.get(p.id) || p);
  return out;
}

const flightCache = new WeakMap();

/**
 * The flight build of a creative drone (CreativeFlight#flight with DroneBuild#inertiaOverride): see the head of this
 * file. Build ids that the catalog does not know stay as they are (the analysis then has no figures).
 * @param {{frame, stack, motor, prop, video, battery, accessories?}} build installed part ids
 * @param {{base, values}|null} creative the creative values
 * @param {object} catalog data.js catalog
 * @returns {{build: object, catalog: object, inertia: number[]|null}}
 */
export function creativeFlight(build, creative, catalog) {
  const s = spec(creative);
  if (!isCreative(build) || isEmpty(s)) return { build, catalog, inertia: null };
  let cache = flightCache.get(catalog);
  if (!cache) flightCache.set(catalog, (cache = new Map()));
  const cacheKey = JSON.stringify([build, s]);
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const result = compute(build, s, catalog);
  if (cache.size >= 64) cache.delete(cache.keys().next().value);
  cache.set(cacheKey, result);
  return result;
}

function compute(build, s, catalog) {
  const base = baseParts(build, s, catalog);
  const rpy = inertiaRpy(s);
  const inertia = rpy ? [rpy[1], rpy[2], rpy[0]] : null;
  if (Object.values(base).some((part) => !part)) return { build, catalog, inertia };
  const camera = hasAny(s, CAMERA_POSITION) ? autoCamera(build, s, catalog) : null;
  const frame = patched('frame', base.frame, touches(s, 'frame'), (json) => patchFrame(json, base, s, camera), catalog);
  const cells = valueOf(s, P_['battery.cells']);
  const flightCells = cells !== undefined ? Math.trunc(clamp(P_['battery.cells'], cells)) : base.battery.data.cells;
  const fullRange = base.stack.data.cells[0] === STACK_MIN_CELLS && base.stack.data.cells[1] === STACK_MAX_CELLS;
  const stack = patched('stack', base.stack, touches(s, 'stack') || !fullRange, (json) => patchStack(json, base.stack, s, flightCells), catalog);
  const motor = patched('motor', base.motor, touches(s, 'motor'), (json) => patchMotor(json, s), catalog);
  const prop = patched('prop', base.prop, touches(s, 'prop'), (json) => patchProp(json, s), catalog);
  const battery = patched('battery', base.battery, touches(s, 'battery'), (json) => patchBattery(json, s), catalog);
  const video = patched('video', base.video, touches(s, 'video'), (json) => patchVideo(json, s), catalog);
  const parts = { frame, stack, motor, prop, video, battery };
  const flightBuild = { ...Object.fromEntries(Object.entries(parts).map(([k, part]) => [k, part.id])), accessories: { ...(build.accessories || {}) } };
  const changed = Object.entries(parts).filter(([k, part]) => part !== base[k]).map(([, part]) => part);
  return { build: flightBuild, catalog: catalogWith(catalog, changed), inertia };
}

// ---------------------------------------------------------------------------------------------------------------
// Limits (CreativeLimits) and notes (CreativeCheck)

/**
 * CreativeLimits.sanitize: clamps and rounds every value, drops unknown keys and base parts that do not resolve.
 * Returns {spec, notes: [{type: 'clamped'|'unknown_value'|'unknown_part', key, requested, applied}]}.
 */
export function sanitize(creative, catalog) {
  const s = spec(creative);
  const notes = [];
  const base = {};
  for (const kind of BASE_KINDS) {
    if (s.base[kind] === undefined) continue;
    if (resolves(kind, s.base[kind], catalog)) base[kind] = s.base[kind];
    else notes.push({ type: 'unknown_part', key: s.base[kind], requested: NaN, applied: NaN });
  }
  const values = {};
  for (const key of Object.keys(s.values)) {
    const p = param(key);
    const requested = s.values[key];
    if (!p) {
      notes.push({ type: 'unknown_value', key, requested, applied: NaN });
      continue;
    }
    const applied = clamp(p, requested);
    if (Math.abs(applied - requested) > tolerance(p)) notes.push({ type: 'clamped', key, param: p, requested, applied });
    values[key] = applied;
  }
  return { spec: spec({ base, values }), notes };
}

/**
 * CreativeDraft#set: the spec after setting a value from the editor – clamped (with a note), dropped when it equals the
 * base or automatic value. Returns {spec, note|null}.
 */
export function setValue(build, creative, p, requested, catalog) {
  const s = spec(creative);
  if (!Number.isFinite(requested)) return { spec: s, note: null };
  const applied = clamp(p, requested);
  const note = Math.abs(applied - requested) > tolerance(p) ? { type: 'clamped', key: p.key, param: p, requested, applied } : null;
  const base = baseOf(build, s, p, catalog);
  const next = Math.abs(applied - base) <= tolerance(p) ? without(s, [p]) : withValue(s, p, applied);
  return { spec: next, note };
}

/** CreativeDraft#basePart(kind, key): a base part that resolves; the installed part (or null) removes it. */
export function setBase(build, creative, kind, key, catalog) {
  const s = spec(creative);
  const installed = partKey(build[kind]);
  if (key == null || key === installed || keyId(key) === build[kind]) return withBase(s, kind, null);
  return resolves(kind, key, catalog) ? withBase(s, kind, key) : s;
}

/** CreativeDraft#basePart(kind): the base part key of a kind, if it resolves and is not the installed part. */
export function basePart(build, creative, kind, catalog) {
  const key = spec(creative).base[kind];
  return key !== undefined && resolves(kind, key, catalog) && keyId(key) !== build[kind] ? key : null;
}

/** CreativeDraft#load: a template (a preset's parts, a pasted code): sanitized, base parts equal to the installed ones dropped. */
export function load(build, template, catalog) {
  const result = sanitize(template, catalog);
  let s = result.spec;
  for (const kind of BASE_KINDS) if (s.base[kind] !== undefined && keyId(s.base[kind]) === build[kind]) s = withBase(s, kind, null);
  return { spec: s, notes: result.notes };
}

/** CreativeEditorTab.baseOf: the base parts of a preset build as a template. */
export function templateOf(presetBuild) {
  return spec({ base: Object.fromEntries(BASE_KINDS.map((kind) => [kind, partKey(presetBuild[kind])])), values: {} });
}

/**
 * CreativeCheck.check: the notes of the drone editor ('props_overlap', 'inertia_low', 'inertia_high',
 * 'extreme_thrust', 'over_server_speed'); analysis: the figures of analysis.js for the build (computed if missing).
 */
export function check(build, creative, catalog, analysis = undefined) {
  const s = spec(creative);
  const out = [];
  const p = airframe(build, s, catalog);
  const a = analysis === undefined ? analyzeBuild(build, catalog, s) : analysis;
  if (!p || !a) return out;
  if (p.propDiameter > p.motorSpacing + 1.0e-3) out.push('props_overlap');
  let low = false;
  let high = false;
  for (const ip of INERTIA) {
    if (!has(s, ip)) continue;
    const auto = baseValue(build, s, ip, catalog);
    const set = clamp(ip, s.values[ip.key]);
    low = low || set < INERTIA_LOW_FACTOR * auto;
    high = high || set > INERTIA_HIGH_FACTOR * auto;
  }
  if (low) out.push('inertia_low');
  if (high) out.push('inertia_high');
  if (a.thrust_to_weight > EXTREME_THRUST_TO_WEIGHT) out.push('extreme_thrust');
  if (a.top_speed_kmh > PHYSICS_MAX_SPEED * 3.6) out.push('over_server_speed');
  return out;
}

/** CameraMount.range(DroneBuild): a creative drone's camera tilts 0–80°, its standard stays the frame's. */
export function uptiltRange(range) {
  return { min: UPTILT_MIN, max: UPTILT_MAX, standard: range.standard };
}
