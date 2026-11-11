import { SimMath } from './SimMath.js?v=44da8aea';
import { Pt2 } from './Pt2.js?v=dbce544f';
import { ThrottleCurve } from './ThrottleCurve.js?v=6243615e';

// Port of de.lardtom.propwash.sim.RcProcessor
export class RcProcessor {
  roll = new Pt2();
  pitch = new Pt2();
  yaw = new Pt2();
  throttle = new Pt2();

  rollOut = 0.0;
  pitchOut = 0.0;
  yawOut = 0.0;
  throttleStick = 0.0;
  throttleOut = 0.0;

  configure(cutoffHz, dt) {
    this.roll.configure(cutoffHz, dt);
    this.pitch.configure(cutoffHz, dt);
    this.yaw.configure(cutoffHz, dt);
    this.throttle.configure(cutoffHz, dt);
  }

  static deadband(x, band) {
    if (band <= 0.0) {
      return x;
    }
    const a = Math.abs(x) - band;
    if (a <= 0.0) {
      return 0.0;
    }
    return Math.sign(x) * a / (1.0 - band);
  }

  reset(r, p, y, t, rates, pid) {
    this.roll.reset(RcProcessor.deadband(r, rates.rcDeadband));
    this.pitch.reset(RcProcessor.deadband(p, rates.rcDeadband));
    this.yaw.reset(RcProcessor.deadband(y, rates.yawDeadband));
    this.throttle.reset(t);
    this.rollOut = this.roll.value();
    this.pitchOut = this.pitch.value();
    this.yawOut = this.yaw.value();
    this.throttleStick = t;
    this.throttleOut = ThrottleCurve.apply(pid, t);
  }

  update(r, p, y, t, rates, pid) {
    this.rollOut = SimMath.clamp(this.roll.apply(RcProcessor.deadband(r, rates.rcDeadband)), -1.0, 1.0);
    this.pitchOut = SimMath.clamp(this.pitch.apply(RcProcessor.deadband(p, rates.rcDeadband)), -1.0, 1.0);
    this.yawOut = SimMath.clamp(this.yaw.apply(RcProcessor.deadband(y, rates.yawDeadband)), -1.0, 1.0);
    this.throttleStick = SimMath.clamp01(this.throttle.apply(t));
    this.throttleOut = ThrottleCurve.apply(pid, this.throttleStick);
  }
}
