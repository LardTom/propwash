import { SimMath } from './SimMath.js?v=44da8aea';
import { Axis } from './Axis.js?v=fcdd987b';
import { AxisPid } from './AxisPid.js?v=45d30e7c';
import { PidSource } from './PidSource.js?v=bf62fdc1';
import { ItermRelaxMode } from './ItermRelaxMode.js?v=2be3e748';
import { TpaMode } from './TpaMode.js?v=9b682a25';
import { ThrottleLimitType } from './ThrottleLimitType.js?v=ed56c82e';

// Port of de.lardtom.propwash.sim.PidProfile
export class PidProfile {
  source = PidSource.DERIVED;
  derivedForBuild = '';
  derivedForFilters = '';
  roll = new AxisPid(42, 49, 31, 120);
  pitch = new AxisPid(43, 51, 32, 120);
  yaw = new AxisPid(51, 67, 0, 120);
  pidSumLimit = 500;
  pidSumLimitYaw = 400;
  itermLimit = 400;
  feedforwardSmoothingHz = 30;
  ffMaxRateLimitPercent = 90;
  angleStrength = 107;
  angleLimitDeg = 60;
  angleFeedforwardPercent = 100;
  angleMaxRateDps = 500;
  angleEarthRefPercent = 100;
  horizonStrength = 50;
  horizonStickTransitionPercent = 75;
  horizonLimitDeg = 135;
  itermRelax = ItermRelaxMode.RP;
  itermRelaxCutoffHz = 15;
  itermRelaxThresholdDps = 40;
  antiGravityGain = 80;
  tpaMode = TpaMode.D;
  tpaRatePercent = 65;
  tpaBreakpoint = 0.35;
  airmode = true;
  airmodeStartThrottlePercent = 25;
  motorIdlePercent = 5.5;
  thrustLinearPercent = 0;
  vbatSagCompensationPercent = 0;
  motorOutputLimitPercent = 100;
  propsOut = false;
  throttleMid = 0.5;
  throttleExpo = 0.0;
  throttleLimitType = ThrottleLimitType.OFF;
  throttleLimitPercent = 100;

  axis(axis) {
    switch (axis) {
      case Axis.ROLL:
        return this.roll;
      case Axis.PITCH:
        return this.pitch;
      case Axis.YAW:
        return this.yaw;
      default:
        throw new Error('Unknown axis ' + axis);
    }
  }

  copy() {
    const c = new PidProfile();
    c.source = this.source;
    c.derivedForBuild = this.derivedForBuild;
    c.derivedForFilters = this.derivedForFilters;
    c.roll = this.roll == null ? null : this.roll.copy();
    c.pitch = this.pitch == null ? null : this.pitch.copy();
    c.yaw = this.yaw == null ? null : this.yaw.copy();
    c.pidSumLimit = this.pidSumLimit;
    c.pidSumLimitYaw = this.pidSumLimitYaw;
    c.itermLimit = this.itermLimit;
    c.feedforwardSmoothingHz = this.feedforwardSmoothingHz;
    c.ffMaxRateLimitPercent = this.ffMaxRateLimitPercent;
    c.angleStrength = this.angleStrength;
    c.angleLimitDeg = this.angleLimitDeg;
    c.angleFeedforwardPercent = this.angleFeedforwardPercent;
    c.angleMaxRateDps = this.angleMaxRateDps;
    c.angleEarthRefPercent = this.angleEarthRefPercent;
    c.horizonStrength = this.horizonStrength;
    c.horizonStickTransitionPercent = this.horizonStickTransitionPercent;
    c.horizonLimitDeg = this.horizonLimitDeg;
    c.itermRelax = this.itermRelax;
    c.itermRelaxCutoffHz = this.itermRelaxCutoffHz;
    c.itermRelaxThresholdDps = this.itermRelaxThresholdDps;
    c.antiGravityGain = this.antiGravityGain;
    c.tpaMode = this.tpaMode;
    c.tpaRatePercent = this.tpaRatePercent;
    c.tpaBreakpoint = this.tpaBreakpoint;
    c.airmode = this.airmode;
    c.airmodeStartThrottlePercent = this.airmodeStartThrottlePercent;
    c.motorIdlePercent = this.motorIdlePercent;
    c.thrustLinearPercent = this.thrustLinearPercent;
    c.vbatSagCompensationPercent = this.vbatSagCompensationPercent;
    c.motorOutputLimitPercent = this.motorOutputLimitPercent;
    c.propsOut = this.propsOut;
    c.throttleMid = this.throttleMid;
    c.throttleExpo = this.throttleExpo;
    c.throttleLimitType = this.throttleLimitType;
    c.throttleLimitPercent = this.throttleLimitPercent;
    return c;
  }

  sanitize() {
    const d = PidProfile.DEFAULTS;
    if (this.source == null) {
      this.source = PidSource.DERIVED;
    }
    if (this.derivedForBuild == null) {
      this.derivedForBuild = '';
    }
    if (this.derivedForFilters == null) {
      this.derivedForFilters = '';
    }
    if (this.roll == null) {
      this.roll = d.roll.copy();
    }
    if (this.pitch == null) {
      this.pitch = d.pitch.copy();
    }
    if (this.yaw == null) {
      this.yaw = d.yaw.copy();
    }
    this.roll.sanitize(d.roll);
    this.pitch.sanitize(d.pitch);
    this.yaw.sanitize(d.yaw);
    this.pidSumLimit = SimMath.sanitize(this.pidSumLimit, 100, 1000, d.pidSumLimit);
    this.pidSumLimitYaw = SimMath.sanitize(this.pidSumLimitYaw, 100, 1000, d.pidSumLimitYaw);
    this.itermLimit = SimMath.sanitize(this.itermLimit, 0, 1000, d.itermLimit);
    this.feedforwardSmoothingHz = SimMath.sanitize(this.feedforwardSmoothingHz, 5, 200, d.feedforwardSmoothingHz);
    this.ffMaxRateLimitPercent = SimMath.sanitize(this.ffMaxRateLimitPercent, 0, 100, d.ffMaxRateLimitPercent);
    this.angleStrength = SimMath.sanitize(this.angleStrength, 0, 200, d.angleStrength);
    this.angleLimitDeg = SimMath.sanitize(this.angleLimitDeg, 10, 85, d.angleLimitDeg);
    this.angleFeedforwardPercent = SimMath.sanitize(this.angleFeedforwardPercent, 0, 200, d.angleFeedforwardPercent);
    this.angleMaxRateDps = SimMath.sanitize(this.angleMaxRateDps, 100, 1998, d.angleMaxRateDps);
    this.angleEarthRefPercent = SimMath.sanitize(this.angleEarthRefPercent, 0, 100, d.angleEarthRefPercent);
    this.horizonStrength = SimMath.sanitize(this.horizonStrength, 0, 200, d.horizonStrength);
    this.horizonStickTransitionPercent = SimMath.sanitize(this.horizonStickTransitionPercent, 10, 100, d.horizonStickTransitionPercent);
    this.horizonLimitDeg = SimMath.sanitize(this.horizonLimitDeg, 10, 180, d.horizonLimitDeg);
    if (this.itermRelax == null) {
      this.itermRelax = d.itermRelax;
    }
    this.itermRelaxCutoffHz = SimMath.sanitize(this.itermRelaxCutoffHz, 1, 50, d.itermRelaxCutoffHz);
    this.itermRelaxThresholdDps = SimMath.sanitize(this.itermRelaxThresholdDps, 5, 200, d.itermRelaxThresholdDps);
    this.antiGravityGain = SimMath.sanitize(this.antiGravityGain, 0, 250, d.antiGravityGain);
    if (this.tpaMode == null) {
      this.tpaMode = d.tpaMode;
    }
    this.tpaRatePercent = SimMath.sanitize(this.tpaRatePercent, 0, 100, d.tpaRatePercent);
    this.tpaBreakpoint = SimMath.sanitize(this.tpaBreakpoint, 0, 0.95, d.tpaBreakpoint);
    this.airmodeStartThrottlePercent = SimMath.sanitize(this.airmodeStartThrottlePercent, 0, 50, d.airmodeStartThrottlePercent);
    this.motorIdlePercent = SimMath.sanitize(this.motorIdlePercent, 0, 20, d.motorIdlePercent);
    this.thrustLinearPercent = SimMath.sanitize(this.thrustLinearPercent, 0, 100, d.thrustLinearPercent);
    this.vbatSagCompensationPercent = SimMath.sanitize(this.vbatSagCompensationPercent, 0, 100, d.vbatSagCompensationPercent);
    this.motorOutputLimitPercent = SimMath.sanitize(this.motorOutputLimitPercent, 25, 100, d.motorOutputLimitPercent);
    this.throttleMid = SimMath.sanitize(this.throttleMid, 0.05, 0.95, d.throttleMid);
    this.throttleExpo = SimMath.sanitize(this.throttleExpo, 0, 1, d.throttleExpo);
    if (this.throttleLimitType == null) {
      this.throttleLimitType = d.throttleLimitType;
    }
    this.throttleLimitPercent = SimMath.sanitize(this.throttleLimitPercent, 25, 100, d.throttleLimitPercent);
  }

  static DEFAULTS = new PidProfile();
}
