import { SimMath } from './SimMath.js?v=44da8aea';
import { AxisPid } from './AxisPid.js?v=45d30e7c';
import { PidProfile } from './PidProfile.js?v=92830202';
import { FilterSettings } from './FilterSettings.js?v=3ec8b75c';
import { PidLoopRate } from './PidLoopRate.js?v=2a3568bc';
import { PidSource } from './PidSource.js?v=bf62fdc1';
import { OperatingPoints } from './OperatingPoints.js?v=0990bf11';

// DroneSim is not part of this port batch; only its PHYSICS_HZ constant is needed here (Java: DroneSim.PHYSICS_HZ = 2000).
const DroneSim = { PHYSICS_HZ: 2000 };

// java.lang.Math.round(double): half up, NaN -> 0.
const javaRound = (x) => (Number.isNaN(x) ? 0 : Math.floor(x + 0.5));

// Java string concatenation of a double (Double.toString): whole numbers keep a ".0" ("250.0").
const javaDoubleString = (v) => (Number.isInteger(v) && Math.abs(v) < 1.0e7 ? v.toFixed(1) : String(v));

// Port of the record PidAutoTune.Derived (record accessors -> plain fields: v.roll instead of v.roll()).
export class Derived {
  constructor(roll, pitch, yaw, angleStrength, tpaBreakpoint, airmodeStartPercent, itermRelaxCutoffHz, crossover) {
    this.roll = roll;
    this.pitch = pitch;
    this.yaw = yaw;
    this.angleStrength = angleStrength;
    this.tpaBreakpoint = tpaBreakpoint;
    this.airmodeStartPercent = airmodeStartPercent;
    this.itermRelaxCutoffHz = itermRelaxCutoffHz;
    this.crossover = crossover;
    Object.freeze(this);
  }
}

// Port of de.lardtom.propwash.sim.PidAutoTune
// The private record Key(buildKey, loop, gyroLpfHz) used as cache key is a composite string key here (PidAutoTune.key).
export class PidAutoTune {
  static P_SCALE = 0.032029e-3;
  static I_SCALE = 0.244381e-3;
  static D_SCALE = 0.000529e-3;
  static MAX_CROSSOVER = 150.0;
  static DEAD_TIME_FACTOR = 0.40;
  static MOTOR_FACTOR = 4.0;
  static DEFAULT_FF = 120.0;
  static RELAX_REFERENCE_HZ = 15.0;

  static CACHE = new Map();

  static key(buildKey, loop, gyroLpfHz) {
    return buildKey + '\u0000' + loop.name + '\u0000' + (Object.is(gyroLpfHz, -0) ? '-0' : String(gyroLpfHz));
  }

  static filtersKey(filters) {
    const f = filters == null ? new FilterSettings() : filters;
    const loop = f.pidLoop == null ? PidLoopRate.HZ_2000 : f.pidLoop;
    return loop.name + '@' + javaDoubleString(f.gyroLpfHz);
  }

  static isCurrent(params, filters, pid) {
    return pid != null && params.buildKey === pid.derivedForBuild && PidAutoTune.filtersKey(filters) === pid.derivedForFilters;
  }

  static derive(params, filters, base) {
    const f = filters == null ? new FilterSettings() : filters;
    const loop = f.pidLoop == null ? PidLoopRate.HZ_2000 : f.pidLoop;
    const k = PidAutoTune.key(params.buildKey, loop, f.gyroLpfHz);
    let v = PidAutoTune.CACHE.get(k);
    if (v === undefined) {
      v = PidAutoTune.compute(params, loop, f.gyroLpfHz);
      PidAutoTune.CACHE.set(k, v);
    }
    const out = base == null ? new PidProfile() : base.copy();
    out.roll = v.roll.copy();
    out.pitch = v.pitch.copy();
    out.yaw = v.yaw.copy();
    out.angleStrength = v.angleStrength;
    out.tpaBreakpoint = v.tpaBreakpoint;
    out.airmodeStartThrottlePercent = v.airmodeStartPercent;
    out.itermRelaxCutoffHz = v.itermRelaxCutoffHz;
    out.source = PidSource.DERIVED;
    out.derivedForBuild = params.buildKey;
    out.derivedForFilters = PidAutoTune.filtersKey(f);
    return out;
  }

  static deadTime(loop, gyroLpfHz) {
    const gyro = gyroLpfHz > 0.0 ? 1.0 / (SimMath.TWO_PI * gyroLpfHz) : 0.0;
    return 1.5 / loop.hz() + 0.5 / DroneSim.PHYSICS_HZ + gyro;
  }

  static crossover(params, loop, gyroLpfHz) {
    return Math.min(PidAutoTune.MAX_CROSSOVER,
      Math.min(PidAutoTune.DEAD_TIME_FACTOR / PidAutoTune.deadTime(loop, gyroLpfHz), PidAutoTune.MOTOR_FACTOR / params.motorTau));
  }

  static compute(params, loop, gyroLpfHz) {
    const wc = PidAutoTune.crossover(params, loop, gyroLpfHz);
    const roll = PidAutoTune.rollPitchRate(wc, params.authorityRoll, params.motorTau);
    const pitch = PidAutoTune.rollPitchRate(wc, params.authorityPitch, params.motorTau);
    const kpYaw = Math.min(2.0 * wc / params.authorityYawInstant, 40.0 / params.authorityYawSteady);
    const yaw = new AxisPid(PidAutoTune.toP(kpYaw), PidAutoTune.toI(10.0 * kpYaw), 0.0, PidAutoTune.DEFAULT_FF);
    const angleStrength = SimMath.clamp(javaRound(10.0 * wc / 14.0), 20.0, 120.0);
    const hoverHalf = OperatingPoints.hoverStick(params, 0.5);
    const hoverFull = OperatingPoints.hoverStick(params, 1.0);
    let tpa = Math.min(0.9, Math.max(0.35, hoverHalf + 0.15));
    if (!Number.isFinite(tpa)) {
      tpa = 0.9;
    }
    tpa = javaRound(tpa * 100.0) / 100.0;
    const airmode = Number.isFinite(hoverFull) ? SimMath.clamp(javaRound(90.0 * hoverFull), 10.0, 25.0) : 25.0;
    const ratio = wc / PidAutoTune.MAX_CROSSOVER;
    const relax = SimMath.clamp(javaRound(PidAutoTune.RELAX_REFERENCE_HZ * ratio * ratio), 3.0, PidAutoTune.RELAX_REFERENCE_HZ);
    return new Derived(roll, pitch, yaw, angleStrength, tpa, airmode, relax, wc);
  }

  static rollPitchRate(wc, authority, tau) {
    const kp = wc / authority;
    const kd = kp * Math.min(tau, 0.040);
    const ki = kp * SimMath.clamp(0.06 * wc, 4.0, 12.0);
    return new AxisPid(PidAutoTune.toP(kp), PidAutoTune.toI(ki), PidAutoTune.toD(kd), PidAutoTune.DEFAULT_FF);
  }

  static toP(kp) {
    return SimMath.clamp(javaRound(kp / (PidAutoTune.P_SCALE * SimMath.DEG)), 5.0, 200.0);
  }

  static toI(ki) {
    return SimMath.clamp(javaRound(ki / (PidAutoTune.I_SCALE * SimMath.DEG)), 5.0, 250.0);
  }

  static toD(kd) {
    return SimMath.clamp(javaRound(kd / (PidAutoTune.D_SCALE * SimMath.DEG)), 0.0, 150.0);
  }
}

PidAutoTune.Derived = Derived;
