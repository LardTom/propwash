import { SimMath } from './SimMath.js?v=44da8aea';
import { RatesType } from './RatesType.js?v=a3ff710e';
import { Axis } from './Axis.js?v=fcdd987b';
import { RateCurve } from './RateCurve.js?v=d453589b';

// Port of de.lardtom.propwash.sim.RateProfile
export class RateProfile {
  type = RatesType.ACTUAL;
  roll = new RateCurve();
  pitch = new RateCurve();
  yaw = new RateCurve();
  rcDeadband = 0.0;
  yawDeadband = 0.0;

  axis(axis) {
    switch (axis) {
      case Axis.ROLL:
        return this.roll;
      case Axis.PITCH:
        return this.pitch;
      case Axis.YAW:
        return this.yaw;
      default:
        throw new Error(`Unknown axis ${axis}`);
    }
  }

  copy() {
    const c = new RateProfile();
    c.type = this.type;
    c.roll = this.roll == null ? null : this.roll.copy();
    c.pitch = this.pitch == null ? null : this.pitch.copy();
    c.yaw = this.yaw == null ? null : this.yaw.copy();
    c.rcDeadband = this.rcDeadband;
    c.yawDeadband = this.yawDeadband;
    return c;
  }

  sanitize() {
    if (this.type == null) {
      this.type = RatesType.ACTUAL;
    }
    if (this.roll == null) {
      this.roll = new RateCurve();
    }
    if (this.pitch == null) {
      this.pitch = new RateCurve();
    }
    if (this.yaw == null) {
      this.yaw = new RateCurve();
    }
    this.roll.sanitize();
    this.pitch.sanitize();
    this.yaw.sanitize();
    this.rcDeadband = SimMath.sanitize(this.rcDeadband, 0.0, 0.2, 0.0);
    this.yawDeadband = SimMath.sanitize(this.yawDeadband, 0.0, 0.2, 0.0);
  }
}
