import { SimMath } from './SimMath.js?v=44da8aea';
import { RateProfile } from './RateProfile.js?v=ac659388';
import { PidProfile } from './PidProfile.js?v=92830202';
import { FilterSettings } from './FilterSettings.js?v=3ec8b75c';
import { HoldSettings } from './HoldSettings.js?v=5aca210a';
import { PidAutoTune } from './PidAutoTune.js?v=5cb0e123';
import { PidSource } from './PidSource.js?v=bf62fdc1';
import { RatesType } from './RatesType.js?v=a3ff710e';
import { ItermRelaxMode } from './ItermRelaxMode.js?v=2be3e748';
import { TpaMode } from './TpaMode.js?v=9b682a25';
import { ThrottleLimitType } from './ThrottleLimitType.js?v=ed56c82e';
import { PidLoopRate } from './PidLoopRate.js?v=2a3568bc';

// Port of de.lardtom.propwash.sim.FlightControllerConfig, plus fromTune() (not in the Java class; see below).
export class FlightControllerConfig {
  static DEADBAND_3D = 0.05;
  static ARM_ANGLE_MIN = 0.0;
  static ARM_ANGLE_MAX = 180.0;
  static ARM_ANGLE_DEFAULT = 25.0;

  version = 1;
  rates = new RateProfile();
  pid = new PidProfile();
  filters = new FilterSettings();
  hold = new HoldSettings();
  armMaxTiltDeg = FlightControllerConfig.ARM_ANGLE_DEFAULT;
  armThrottleMax = 0.05;
  failsafeDelayS = 0.3;
  failsafeLandingS = 1.5;
  deadband3d = FlightControllerConfig.DEADBAND_3D;

  static defaultsFor(params) {
    const c = new FlightControllerConfig();
    c.pid = PidAutoTune.derive(params, c.filters, c.pid);
    return c;
  }

  copy() {
    const c = new FlightControllerConfig();
    c.version = this.version;
    c.rates = this.rates == null ? null : this.rates.copy();
    c.pid = this.pid == null ? null : this.pid.copy();
    c.filters = this.filters == null ? null : this.filters.copy();
    c.hold = this.hold == null ? null : this.hold.copy();
    c.armMaxTiltDeg = this.armMaxTiltDeg;
    c.armThrottleMax = this.armThrottleMax;
    c.failsafeDelayS = this.failsafeDelayS;
    c.failsafeLandingS = this.failsafeLandingS;
    c.deadband3d = this.deadband3d;
    return c;
  }

  sanitize() {
    if (this.version <= 0) {
      this.version = 1;
    }
    if (this.rates == null) {
      this.rates = new RateProfile();
    }
    if (this.pid == null) {
      this.pid = new PidProfile();
    }
    if (this.filters == null) {
      this.filters = new FilterSettings();
    }
    if (this.hold == null) {
      this.hold = new HoldSettings();
    }
    this.rates.sanitize();
    this.pid.sanitize();
    this.filters.sanitize();
    this.hold.sanitize();
    this.armMaxTiltDeg = SimMath.sanitize(this.armMaxTiltDeg, FlightControllerConfig.ARM_ANGLE_MIN, FlightControllerConfig.ARM_ANGLE_MAX,
      FlightControllerConfig.ARM_ANGLE_DEFAULT);
    this.armThrottleMax = SimMath.sanitize(this.armThrottleMax, 0, 0.3, 0.05);
    this.failsafeDelayS = SimMath.sanitize(this.failsafeDelayS, 0.05, 10, 0.3);
    this.failsafeLandingS = SimMath.sanitize(this.failsafeLandingS, 0, 60, 1.5);
    this.deadband3d = SimMath.sanitize(this.deadband3d, 0.0, 0.2, FlightControllerConfig.DEADBAND_3D);
  }

  /**
   * Not in the Java class: builds a sanitized config from a flat tune map (the configurator's effective flight tune,
   * keys like 'rates.roll.rcRate', 'pid.source', 'filters.pidLoop'), following the mod's TuneMapping.toConfig
   * (de.lardtom.propwash.drone.TuneMapping): same keys, same order, values widened from float (Math.fround), enum
   * indices rounded and clamped, pid.armMaxAngleDeg -> armMaxTiltDeg, pid.source 1 -> PidSource.CUSTOM (without
   * pid.source, any pid.<axis>.<term> key means CUSTOM). Missing or non-finite keys keep the Java defaults.
   *
   * @param {object} tune flat { key: number } map
   * @param {object} [params] AirframeSpec. When given, this is exactly TuneMapping.toConfig: PIDs are derived with
   *   PidAutoTune after the filters are applied, pid.<axis>.* keys only count for CUSTOM, and derivedForBuild is
   *   stamped so DroneSim.applyConfig does not re-derive (and overwrite a tuned angleStrength / tpaBreakpoint).
   *   Without it nothing can be derived, so the tune's pid.<axis>.* values (which an effective tune carries for the
   *   derived source too) are applied for both sources; derivedForBuild stays '' and airmodeStartThrottlePercent /
   *   itermRelaxCutoffHz keep their defaults until something calls PidAutoTune.derive.
   */
  static fromTune(tune, params) {
    const t = tune == null ? {} : tune;
    const config = new FlightControllerConfig();
    for (const [key, entry] of TUNE_ENTRIES) {
      if (key.startsWith('filters.')) {
        applyTune(config, t, key, entry);
      }
    }
    config.filters.sanitize();
    if (params != null) {
      config.pid = PidAutoTune.derive(params, config.filters, config.pid);
    }
    const custom = tuneSourceOf(t) === PidSource.CUSTOM;
    for (const [key, entry] of TUNE_ENTRIES) {
      if (key.startsWith('filters.') || key === TUNE_PID_SOURCE) {
        continue;
      }
      if (!custom && params != null && TUNE_PID_AXIS_KEYS.includes(key)) {
        continue;
      }
      applyTune(config, t, key, entry);
    }
    config.pid.source = custom ? PidSource.CUSTOM : PidSource.DERIVED;
    if (params != null) {
      config.pid.derivedForBuild = params.buildKey;
    }
    config.sanitize();
    return config;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// TuneMapping (flight part), used by fromTune.

const TUNE_PID_SOURCE = 'pid.source';
const TUNE_AXES = ['roll', 'pitch', 'yaw'];
const TUNE_PID_AXIS_KEYS = TUNE_AXES.flatMap((axis) => ['p', 'i', 'd', 'ff'].map((term) => 'pid.' + axis + '.' + term));

// java.lang.Math.round(double): half up, NaN -> 0.
const javaRound = (x) => (Number.isNaN(x) ? 0 : Math.floor(x + 0.5));

// TuneMapping.enumValue
function tuneEnumValue(values, raw) {
  let index = javaRound(raw);
  if (index < 0) {
    index = 0;
  } else if (index >= values.length) {
    index = values.length - 1;
  }
  return values[index];
}

// TuneMapping.sourceOf
function tuneSourceOf(tune) {
  const source = tune[TUNE_PID_SOURCE];
  if (source != null) {
    return tuneEnumValue(PidSource.values(), source);
  }
  for (const key of TUNE_PID_AXIS_KEYS) {
    if (key in tune) {
      return PidSource.CUSTOM;
    }
  }
  return PidSource.DERIVED;
}

// TuneMapping.apply: the mod's tune values are Float, widened to double by the setter.
function applyTune(config, tune, key, setter) {
  const value = tune[key];
  if (value != null && Number.isFinite(value)) {
    setter(config, Math.fround(value));
  }
}

// TuneMapping.buildEntries (setters only), in the Java LinkedHashMap order.
const TUNE_ENTRIES = (() => {
  const m = new Map();
  const number = (key, setter) => m.set(key, setter);
  const enumEntry = (key, values, setter) => m.set(key, (c, v) => setter(c, tuneEnumValue(values, v)));
  enumEntry('rates.type', RatesType.values(), (c, v) => { c.rates.type = v; });
  for (const axis of TUNE_AXES) {
    const p = 'rates.' + axis + '.';
    for (const field of ['rcRate', 'superRate', 'rcExpo', 'centerRateDps', 'maxRateDps', 'actualExpo']) {
      number(p + field, (c, v) => { c.rates[axis][field] = v; });
    }
  }
  number('rates.rcDeadband', (c, v) => { c.rates.rcDeadband = v; });
  number('rates.yawDeadband', (c, v) => { c.rates.yawDeadband = v; });
  enumEntry(TUNE_PID_SOURCE, PidSource.values(), (c, v) => { c.pid.source = v; });
  for (const axis of TUNE_AXES) {
    const p = 'pid.' + axis + '.';
    for (const term of ['p', 'i', 'd', 'ff']) {
      number(p + term, (c, v) => { c.pid[axis][term] = v; });
    }
  }
  number('pid.angleStrength', (c, v) => { c.pid.angleStrength = v; });
  number('pid.angleLimitDeg', (c, v) => { c.pid.angleLimitDeg = v; });
  number('pid.horizonStrength', (c, v) => { c.pid.horizonStrength = v; });
  enumEntry('pid.itermRelax', ItermRelaxMode.values(), (c, v) => { c.pid.itermRelax = v; });
  number('pid.antiGravityGain', (c, v) => { c.pid.antiGravityGain = v; });
  enumEntry('pid.tpaMode', TpaMode.values(), (c, v) => { c.pid.tpaMode = v; });
  number('pid.tpaRatePercent', (c, v) => { c.pid.tpaRatePercent = v; });
  number('pid.tpaBreakpoint', (c, v) => { c.pid.tpaBreakpoint = v; });
  number('pid.airmode', (c, v) => { c.pid.airmode = v >= 0.5; });
  number('pid.motorIdlePercent', (c, v) => { c.pid.motorIdlePercent = v; });
  number('pid.throttleMid', (c, v) => { c.pid.throttleMid = v; });
  number('pid.throttleExpo', (c, v) => { c.pid.throttleExpo = v; });
  enumEntry('pid.throttleLimitType', ThrottleLimitType.values(), (c, v) => { c.pid.throttleLimitType = v; });
  number('pid.throttleLimitPercent', (c, v) => { c.pid.throttleLimitPercent = v; });
  number('pid.thrustLinearPercent', (c, v) => { c.pid.thrustLinearPercent = v; });
  number('pid.vbatSagCompensationPercent', (c, v) => { c.pid.vbatSagCompensationPercent = v; });
  number('pid.armMaxAngleDeg', (c, v) => { c.armMaxTiltDeg = v; });
  number('hold.altP', (c, v) => { c.hold.altP = v; });
  number('hold.altI', (c, v) => { c.hold.altI = v; });
  number('hold.altD', (c, v) => { c.hold.altD = v; });
  number('hold.climbRateCms', (c, v) => { c.hold.climbRateCms = v; });
  number('hold.throttleDeadbandPercent', (c, v) => { c.hold.throttleDeadbandPercent = v; });
  number('hold.midThrottle', (c, v) => { c.hold.midThrottle = v >= 0.5; });
  number('hold.posP', (c, v) => { c.hold.posP = v; });
  number('hold.posI', (c, v) => { c.hold.posI = v; });
  number('hold.posD', (c, v) => { c.hold.posD = v; });
  number('hold.posMaxAngleDeg', (c, v) => { c.hold.posMaxAngleDeg = v; });
  number('hold.stickDeadbandPercent', (c, v) => { c.hold.stickDeadbandPercent = v; });
  number('hold.minSatellites', (c, v) => { c.hold.minSatellites = v; });
  enumEntry('filters.pidLoop', PidLoopRate.values(), (c, v) => { c.filters.pidLoop = v; });
  number('filters.gyroLpfHz', (c, v) => { c.filters.gyroLpfHz = v; });
  number('filters.dtermLpf1Hz', (c, v) => { c.filters.dtermLpf1Hz = v; });
  number('filters.dtermLpf2Hz', (c, v) => { c.filters.dtermLpf2Hz = v; });
  number('filters.rcSmoothingHz', (c, v) => { c.filters.rcSmoothingHz = v; });
  return m;
})();
