// Flight tune of a build: defaults, effective values, normalisation and editing, a port of Propwash 0.4.0
// TuneMapping (flight keys only) with the PID auto-tune (PidAutoTune) that derives PIDs from the build.
//
// A "stored" tune (what the mod keeps on the drone and puts in a share code) only holds values that differ from the
// build's defaults. The PID axis values (pid.<axis>.p/i/d/ff) only count when pid.source is 1 (manual); with 0
// (derived) the flight model derives them from the build.
//
// All values are float32 like in the mod. Keys outside the flight groups (hold, camera, led, vtx) are ignored.

import { airframe, hoverStick } from './analysis.js';
import { tuneGroup, isFlightKey } from './tune.js';
import { CAMERA_UPTILT } from './fpv.js';

const AXES = ['roll', 'pitch', 'yaw'];
const TERMS = ['p', 'i', 'd', 'ff'];
export const PID_SOURCE = 'pid.source';
export const PID_AXIS_KEYS = Object.freeze(AXES.flatMap((axis) => TERMS.map((term) => `pid.${axis}.${term}`)));
export const PID_SOURCE_DERIVED = 0;
export const PID_SOURCE_MANUAL = 1;

const EPSILON = 1.0e-4;
const PHYSICS_HZ = 2000;
const DEG = 180.0 / Math.PI;
const TWO_PI = 2.0 * Math.PI;

// ---------------------------------------------------------------------------------------------------------------
// Editor parameters of the mod's configurator (TuneKeys / TuneParam): range, step, decimals, unit, options.

const number = (min, max, step, decimals, unit = '', displayScale = 1.0) => ({ kind: 'number', min, max, step, decimals, displayScale, unit, allowOff: false });
const filter = (min, max, step) => ({ kind: 'number', min, max, step, decimals: 0, displayScale: 1.0, unit: 'Hz', allowOff: true });
const choice = (options) => ({ kind: 'enum', min: 0, max: options.length - 1, step: 1, decimals: 0, displayScale: 1.0, unit: '', options, allowOff: false });
const toggle = () => ({ kind: 'bool', min: 0, max: 1, step: 1, decimals: 0, displayScale: 1.0, unit: '', allowOff: false });

/** Enum option keys by tune key (value = index). */
export const TUNE_OPTIONS = Object.freeze({
  'rates.type': ['betaflight', 'actual'],
  'pid.source': ['derived', 'manual'],
  'pid.itermRelax': ['off', 'rp', 'rpy'],
  'pid.tpaMode': ['d', 'pd'],
  'pid.throttleLimitType': ['off', 'scale', 'clip'],
  'filters.pidLoop': ['hz_2000', 'hz_1000', 'hz_500'],
});

/** Editor parameters of every flight tune key, in the order of the mod's configurator. */
export const TUNE_PARAMS = Object.freeze((() => {
  const p = {};
  p['rates.type'] = choice(TUNE_OPTIONS['rates.type']);
  for (const axis of AXES) {
    p[`rates.${axis}.rcRate`] = number(0.01, 2.55, 0.01, 2);
    p[`rates.${axis}.superRate`] = number(0.0, 0.99, 0.01, 2);
    p[`rates.${axis}.rcExpo`] = number(0.0, 1.0, 0.01, 2);
    p[`rates.${axis}.centerRateDps`] = number(10.0, 1998.0, 5.0, 0, '°/s');
    p[`rates.${axis}.maxRateDps`] = number(10.0, 1998.0, 10.0, 0, '°/s');
    p[`rates.${axis}.actualExpo`] = number(0.0, 1.0, 0.01, 2);
  }
  p['rates.rcDeadband'] = number(0.0, 0.2, 0.005, 1, '%', 100.0);
  p['rates.yawDeadband'] = number(0.0, 0.2, 0.005, 1, '%', 100.0);
  p['pid.source'] = choice(TUNE_OPTIONS['pid.source']);
  for (const axis of AXES) {
    p[`pid.${axis}.p`] = number(0, 250, 1, 0);
    p[`pid.${axis}.i`] = number(0, 250, 1, 0);
    p[`pid.${axis}.d`] = number(0, 200, 1, 0);
    p[`pid.${axis}.ff`] = number(0, 500, 1, 0);
  }
  p['pid.angleStrength'] = number(0, 200, 1, 0);
  p['pid.angleLimitDeg'] = number(10, 85, 1, 0, '°');
  p['pid.horizonStrength'] = number(0, 200, 1, 0);
  p['pid.itermRelax'] = choice(TUNE_OPTIONS['pid.itermRelax']);
  p['pid.antiGravityGain'] = number(0, 250, 1, 0);
  p['pid.tpaMode'] = choice(TUNE_OPTIONS['pid.tpaMode']);
  p['pid.tpaRatePercent'] = number(0, 100, 1, 0, '%');
  p['pid.tpaBreakpoint'] = number(0.0, 0.95, 0.01, 0, '%', 100.0);
  p['pid.airmode'] = toggle();
  p['pid.motorIdlePercent'] = number(0, 20, 0.1, 1, '%');
  p['pid.throttleMid'] = number(0.05, 0.95, 0.01, 2);
  p['pid.throttleExpo'] = number(0.0, 1.0, 0.01, 2);
  p['pid.throttleLimitType'] = choice(TUNE_OPTIONS['pid.throttleLimitType']);
  p['pid.throttleLimitPercent'] = number(25, 100, 1, 0, '%');
  p['pid.thrustLinearPercent'] = number(0, 100, 1, 0, '%');
  p['pid.vbatSagCompensationPercent'] = number(0, 100, 1, 0, '%');
  p['filters.pidLoop'] = choice(TUNE_OPTIONS['filters.pidLoop']);
  p['filters.gyroLpfHz'] = filter(20, 1000, 5);
  p['filters.dtermLpf1Hz'] = filter(20, 1000, 5);
  p['filters.dtermLpf2Hz'] = filter(20, 1000, 5);
  p['filters.rcSmoothingHz'] = filter(5, 200, 1);
  for (const [key, param] of Object.entries(p)) {
    param.key = key;
    param.group = tuneGroup(key);
    Object.freeze(param);
  }
  return p;
})());

/** Flight tune keys in the configurator's order. */
export const TUNE_PARAM_KEYS = Object.freeze(Object.keys(TUNE_PARAMS));

/** Snaps a value to the editor's range and step like the mod's configurator (TuneParam.sanitize). */
export function sanitizeTuneValue(key, value) {
  const p = TUNE_PARAMS[key];
  if (!p) return value;
  if (!Number.isFinite(value)) return p.min;
  if (p.kind !== 'number') return Math.max(p.min, Math.min(p.max, rint(value)));
  if (p.allowOff && value < p.min - p.step * 0.5) return 0.0;
  const clamped = Math.max(p.min, Math.min(p.max, value));
  const steps = rint((clamped - p.min) / p.step);
  const snapped = p.min + steps * p.step;
  const f = Math.pow(10, p.decimals + 3);
  const rounded = rint(snapped * f) / f;
  return Math.max(p.min, Math.min(p.max, rounded));
}

// Math.rint: round half to even.
function rint(x) {
  if (!Number.isFinite(x)) return x;
  const r = Math.round(x);
  return r - x === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

// java.lang.Math.round(double) (NaN -> 0).
function javaRound(x) {
  return Number.isNaN(x) ? 0 : Math.round(x);
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const sanitize = (v, lo, hi, fallback) => (Number.isNaN(v) ? fallback : clamp(v, lo, hi));
const sanitizeFilterHz = (v, lo, hi, fallback) => (Number.isNaN(v) ? fallback : v <= 0.0 ? 0.0 : clamp(v, lo, hi));

// ---------------------------------------------------------------------------------------------------------------
// Flight controller configuration (FlightControllerConfig with RateProfile, PidProfile, FilterSettings)

const axisPid = (p, i, d, ff) => ({ p, i, d, ff });
const DEFAULT_PID = { roll: axisPid(42, 49, 31, 120), pitch: axisPid(43, 51, 32, 120), yaw: axisPid(51, 67, 0, 120) };

function newConfig() {
  const curve = () => ({ rcRate: 1.0, superRate: 0.7, rcExpo: 0.0, centerRateDps: 70.0, maxRateDps: 670.0, actualExpo: 0.0 });
  return {
    rates: { type: 1, roll: curve(), pitch: curve(), yaw: curve(), rcDeadband: 0.0, yawDeadband: 0.0 },
    pid: {
      source: 0,
      roll: { ...DEFAULT_PID.roll },
      pitch: { ...DEFAULT_PID.pitch },
      yaw: { ...DEFAULT_PID.yaw },
      angleStrength: 107,
      angleLimitDeg: 60,
      horizonStrength: 50,
      itermRelax: 1,
      antiGravityGain: 80,
      tpaMode: 0,
      tpaRatePercent: 65,
      tpaBreakpoint: 0.35,
      airmode: true,
      motorIdlePercent: 5.5,
      thrustLinearPercent: 0,
      vbatSagCompensationPercent: 0,
      throttleMid: 0.5,
      throttleExpo: 0.0,
      throttleLimitType: 0,
      throttleLimitPercent: 100,
    },
    filters: { pidLoop: 0, gyroLpfHz: 250, dtermLpf1Hz: 100, dtermLpf2Hz: 0, rcSmoothingHz: 40 },
  };
}

function sanitizeFilters(f) {
  f.gyroLpfHz = sanitizeFilterHz(f.gyroLpfHz, 20, 1000, 250);
  f.dtermLpf1Hz = sanitizeFilterHz(f.dtermLpf1Hz, 20, 1000, 100);
  f.dtermLpf2Hz = sanitizeFilterHz(f.dtermLpf2Hz, 20, 1000, 0);
  f.rcSmoothingHz = sanitizeFilterHz(f.rcSmoothingHz, 5, 200, 40);
}

function sanitizeConfig(c) {
  for (const axis of AXES) {
    const r = c.rates[axis];
    r.rcRate = sanitize(r.rcRate, 0.01, 2.55, 1.0);
    r.superRate = sanitize(r.superRate, 0.0, 0.99, 0.7);
    r.rcExpo = sanitize(r.rcExpo, 0.0, 1.0, 0.0);
    r.centerRateDps = sanitize(r.centerRateDps, 10.0, 1998.0, 70.0);
    r.maxRateDps = sanitize(r.maxRateDps, r.centerRateDps, 1998.0, Math.max(670.0, r.centerRateDps));
    r.actualExpo = sanitize(r.actualExpo, 0.0, 1.0, 0.0);
  }
  c.rates.rcDeadband = sanitize(c.rates.rcDeadband, 0.0, 0.2, 0.0);
  c.rates.yawDeadband = sanitize(c.rates.yawDeadband, 0.0, 0.2, 0.0);
  const p = c.pid;
  for (const axis of AXES) {
    const a = p[axis];
    const d = DEFAULT_PID[axis];
    a.p = sanitize(a.p, 0.0, 250.0, d.p);
    a.i = sanitize(a.i, 0.0, 250.0, d.i);
    a.d = sanitize(a.d, 0.0, 200.0, d.d);
    a.ff = sanitize(a.ff, 0.0, 500.0, d.ff);
  }
  p.angleStrength = sanitize(p.angleStrength, 0, 200, 107);
  p.angleLimitDeg = sanitize(p.angleLimitDeg, 10, 85, 60);
  p.horizonStrength = sanitize(p.horizonStrength, 0, 200, 50);
  p.antiGravityGain = sanitize(p.antiGravityGain, 0, 250, 80);
  p.tpaRatePercent = sanitize(p.tpaRatePercent, 0, 100, 65);
  p.tpaBreakpoint = sanitize(p.tpaBreakpoint, 0, 0.95, 0.35);
  p.motorIdlePercent = sanitize(p.motorIdlePercent, 0, 20, 5.5);
  p.thrustLinearPercent = sanitize(p.thrustLinearPercent, 0, 100, 0);
  p.vbatSagCompensationPercent = sanitize(p.vbatSagCompensationPercent, 0, 100, 0);
  p.throttleMid = sanitize(p.throttleMid, 0.05, 0.95, 0.5);
  p.throttleExpo = sanitize(p.throttleExpo, 0, 1, 0.0);
  p.throttleLimitPercent = sanitize(p.throttleLimitPercent, 25, 100, 100);
  sanitizeFilters(c.filters);
}

// Accessors of every flight key: [get(config), set(config, value)].
const ENTRIES = (() => {
  const e = new Map();
  const enumEntry = (key, count, get, set) => e.set(key, [get, (c, v) => set(c, enumValue(count, v))]);
  const num = (key, get, set) => e.set(key, [get, set]);
  enumEntry('rates.type', 2, (c) => c.rates.type, (c, v) => { c.rates.type = v; });
  for (const axis of AXES) {
    for (const field of ['rcRate', 'superRate', 'rcExpo', 'centerRateDps', 'maxRateDps', 'actualExpo']) {
      num(`rates.${axis}.${field}`, (c) => c.rates[axis][field], (c, v) => { c.rates[axis][field] = v; });
    }
  }
  num('rates.rcDeadband', (c) => c.rates.rcDeadband, (c, v) => { c.rates.rcDeadband = v; });
  num('rates.yawDeadband', (c) => c.rates.yawDeadband, (c, v) => { c.rates.yawDeadband = v; });
  enumEntry(PID_SOURCE, 2, (c) => c.pid.source, (c, v) => { c.pid.source = v; });
  for (const axis of AXES) {
    for (const term of TERMS) num(`pid.${axis}.${term}`, (c) => c.pid[axis][term], (c, v) => { c.pid[axis][term] = v; });
  }
  num('pid.angleStrength', (c) => c.pid.angleStrength, (c, v) => { c.pid.angleStrength = v; });
  num('pid.angleLimitDeg', (c) => c.pid.angleLimitDeg, (c, v) => { c.pid.angleLimitDeg = v; });
  num('pid.horizonStrength', (c) => c.pid.horizonStrength, (c, v) => { c.pid.horizonStrength = v; });
  enumEntry('pid.itermRelax', 3, (c) => c.pid.itermRelax, (c, v) => { c.pid.itermRelax = v; });
  num('pid.antiGravityGain', (c) => c.pid.antiGravityGain, (c, v) => { c.pid.antiGravityGain = v; });
  enumEntry('pid.tpaMode', 2, (c) => c.pid.tpaMode, (c, v) => { c.pid.tpaMode = v; });
  num('pid.tpaRatePercent', (c) => c.pid.tpaRatePercent, (c, v) => { c.pid.tpaRatePercent = v; });
  num('pid.tpaBreakpoint', (c) => c.pid.tpaBreakpoint, (c, v) => { c.pid.tpaBreakpoint = v; });
  e.set('pid.airmode', [(c) => (c.pid.airmode ? 1.0 : 0.0), (c, v) => { c.pid.airmode = v >= 0.5; }]);
  num('pid.motorIdlePercent', (c) => c.pid.motorIdlePercent, (c, v) => { c.pid.motorIdlePercent = v; });
  num('pid.throttleMid', (c) => c.pid.throttleMid, (c, v) => { c.pid.throttleMid = v; });
  num('pid.throttleExpo', (c) => c.pid.throttleExpo, (c, v) => { c.pid.throttleExpo = v; });
  enumEntry('pid.throttleLimitType', 3, (c) => c.pid.throttleLimitType, (c, v) => { c.pid.throttleLimitType = v; });
  num('pid.throttleLimitPercent', (c) => c.pid.throttleLimitPercent, (c, v) => { c.pid.throttleLimitPercent = v; });
  num('pid.thrustLinearPercent', (c) => c.pid.thrustLinearPercent, (c, v) => { c.pid.thrustLinearPercent = v; });
  num('pid.vbatSagCompensationPercent', (c) => c.pid.vbatSagCompensationPercent, (c, v) => { c.pid.vbatSagCompensationPercent = v; });
  enumEntry('filters.pidLoop', 3, (c) => c.filters.pidLoop, (c, v) => { c.filters.pidLoop = v; });
  num('filters.gyroLpfHz', (c) => c.filters.gyroLpfHz, (c, v) => { c.filters.gyroLpfHz = v; });
  num('filters.dtermLpf1Hz', (c) => c.filters.dtermLpf1Hz, (c, v) => { c.filters.dtermLpf1Hz = v; });
  num('filters.dtermLpf2Hz', (c) => c.filters.dtermLpf2Hz, (c, v) => { c.filters.dtermLpf2Hz = v; });
  num('filters.rcSmoothingHz', (c) => c.filters.rcSmoothingHz, (c, v) => { c.filters.rcSmoothingHz = v; });
  return e;
})();

function enumValue(count, raw) {
  let index = javaRound(raw);
  if (index < 0) index = 0;
  else if (index >= count) index = count - 1;
  return index;
}

// ---------------------------------------------------------------------------------------------------------------
// PID auto-tune (PidAutoTune)

const P_SCALE = 0.032029e-3;
const I_SCALE = 0.244381e-3;
const D_SCALE = 0.000529e-3;
const MAX_CROSSOVER = 150.0;
const DEAD_TIME_FACTOR = 0.4;
const MOTOR_FACTOR = 4.0;
const DEFAULT_FF = 120.0;
const LOOP_DIVIDER = [1, 2, 4];

const toP = (kp) => clamp(javaRound(kp / (P_SCALE * DEG)), 5.0, 200.0);
const toI = (ki) => clamp(javaRound(ki / (I_SCALE * DEG)), 5.0, 250.0);
const toD = (kd) => clamp(javaRound(kd / (D_SCALE * DEG)), 0.0, 150.0);

function rollPitchRate(wc, authority, tau) {
  const kp = wc / authority;
  const kd = kp * Math.min(tau, 0.04);
  const ki = kp * clamp(0.06 * wc, 4.0, 12.0);
  return axisPid(toP(kp), toI(ki), toD(kd), DEFAULT_FF);
}

function derivePid(params, filters, base) {
  const loopHz = PHYSICS_HZ / LOOP_DIVIDER[filters.pidLoop];
  const gyro = filters.gyroLpfHz > 0.0 ? 1.0 / (TWO_PI * filters.gyroLpfHz) : 0.0;
  const deadTime = 1.5 / loopHz + 0.5 / PHYSICS_HZ + gyro;
  const wc = Math.min(MAX_CROSSOVER, Math.min(DEAD_TIME_FACTOR / deadTime, MOTOR_FACTOR / params.motorTau));
  const roll = rollPitchRate(wc, params.authorityRoll, params.motorTau);
  const pitch = rollPitchRate(wc, params.authorityPitch, params.motorTau);
  const kpYaw = Math.min(2.0 * wc / params.authorityYawInstant, 40.0 / params.authorityYawSteady);
  const yaw = axisPid(toP(kpYaw), toI(10.0 * kpYaw), 0.0, DEFAULT_FF);
  const angleStrength = clamp(javaRound(10.0 * wc / 14.0), 20.0, 120.0);
  const hoverHalf = hoverStick(params, 0.5);
  let tpa = Math.min(0.9, Math.max(0.35, hoverHalf + 0.15));
  if (!Number.isFinite(tpa)) tpa = 0.9;
  tpa = javaRound(tpa * 100.0) / 100.0;
  return { ...base, roll, pitch, yaw, angleStrength, tpaBreakpoint: tpa, source: 0 };
}

// ---------------------------------------------------------------------------------------------------------------
// TuneMapping

/** Manual PIDs? pid.source when present, else manual as soon as any PID axis value is stored. */
export function tuneSourceOf(tune) {
  const source = tune[PID_SOURCE];
  if (source != null) return enumValue(2, source);
  return PID_AXIS_KEYS.some((key) => key in tune) ? PID_SOURCE_MANUAL : PID_SOURCE_DERIVED;
}

function applyValue(config, tune, key) {
  const value = tune[key];
  if (value != null && Number.isFinite(value)) ENTRIES.get(key)[1](config, Math.fround(value));
}

function toConfig(tune, params) {
  const config = newConfig();
  for (const key of ENTRIES.keys()) if (key.startsWith('filters.')) applyValue(config, tune, key);
  sanitizeFilters(config.filters);
  config.pid = derivePid(params, config.filters, config.pid);
  const custom = tuneSourceOf(tune) === PID_SOURCE_MANUAL;
  for (const key of ENTRIES.keys()) {
    if (key.startsWith('filters.') || key === PID_SOURCE) continue;
    if (!custom && PID_AXIS_KEYS.includes(key)) continue;
    applyValue(config, tune, key);
  }
  config.pid.source = custom ? PID_SOURCE_MANUAL : PID_SOURCE_DERIVED;
  sanitizeConfig(config);
  return config;
}

function fromConfig(config) {
  const out = {};
  for (const key of [...ENTRIES.keys()].sort()) out[key] = Math.fround(ENTRIES.get(key)[0](config));
  return out;
}

function same(a, b) {
  return Math.abs(Math.fround(a - b)) <= EPSILON * Math.max(1.0, Math.abs(b));
}

function paramsOf(build, catalog) {
  const params = airframe(build, catalog);
  if (!params) throw new Error('tune: build has unknown parts');
  return params;
}

function flightTune(tune) {
  const out = {};
  for (const [key, value] of Object.entries(tune || {})) if (isFlightKey(key)) out[key] = value;
  return out;
}

/**
 * Full default flight tune of a build (TuneMapping.defaults), keys sorted. Throws for builds with unknown parts.
 * @param {object} build part ids
 * @param {object} catalog from data.js
 */
export function defaultTune(build, catalog) {
  return fromConfig(toConfig({}, paramsOf(build, catalog)));
}

/** Every flight value the drone flies with for a stored tune (TuneMapping.effective, flight keys). */
export function effectiveTune(stored, build, catalog) {
  return fromConfig(toConfig(flightTune(stored), paramsOf(build, catalog)));
}

function normalizeWith(tune, params, base) {
  const config = toConfig(tune, params);
  const full = fromConfig(config);
  const custom = config.pid.source === PID_SOURCE_MANUAL;
  const out = {};
  for (const key of Object.keys(full)) {
    const pidKey = key === PID_SOURCE || PID_AXIS_KEYS.includes(key);
    if ((custom && pidKey) || !same(full[key], base[key])) out[key] = full[key];
  }
  return out;
}

/** The drone's own camera angle travels with the stored tune untouched (TuneMapping keeps camera.uptiltDeg). */
function keepCamera(out, source) {
  const value = source ? source[CAMERA_UPTILT] : undefined;
  if (typeof value === 'number' && Number.isFinite(value)) out[CAMERA_UPTILT] = Math.fround(value);
  return out;
}

/** Stored form of a tune: only values that differ from the build's defaults (TuneMapping.normalize, flight keys), plus
 * the drone's camera angle. */
export function normalizeTune(tune, build, catalog) {
  const params = paramsOf(build, catalog);
  return keepCamera(normalizeWith(flightTune(tune), params, fromConfig(toConfig({}, params))), tune);
}

/**
 * Applies an edit like the mod's configurator (TuneMapping.applyEdit): changing a PID axis value switches the PID
 * source to manual, switching the source back to derived drops the manual PIDs. Returns the new stored tune.
 * @param {object} stored current stored tune
 * @param {object} edited edited values (any subset of flight keys, typically all values shown in the editor)
 */
export function applyTuneEdit(stored, edited, build, catalog) {
  const params = paramsOf(build, catalog);
  const before = fromConfig(toConfig(flightTune(stored), params));
  const merged = {};
  for (const [key, value] of Object.entries(edited || {})) {
    if (value != null && Number.isFinite(value) && ENTRIES.has(key)) merged[key] = Math.fround(value);
  }
  let axisPresent = false;
  let axisChanged = false;
  for (const key of PID_AXIS_KEYS) {
    if (key in merged) {
      axisPresent = true;
      axisChanged = axisChanged || !same(merged[key], before[key]);
    }
  }
  const requested = merged[PID_SOURCE];
  const sourceSwitched = requested != null && enumValue(2, requested) !== tuneSourceOf(before);
  if (!sourceSwitched && axisChanged) merged[PID_SOURCE] = PID_SOURCE_MANUAL;
  else if (requested == null) merged[PID_SOURCE] = axisPresent ? before[PID_SOURCE] : PID_SOURCE_DERIVED;
  if (tuneSourceOf(merged) === PID_SOURCE_MANUAL) {
    for (const key of PID_AXIS_KEYS) if (!(key in merged)) merged[key] = before[key];
  }
  return keepCamera(normalizeWith(merged, params, fromConfig(toConfig({}, params))), stored);
}
