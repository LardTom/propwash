// Port of de.lardtom.propwash.sim.SnagField (1:1).
import { AirframeSpec } from './AirframeSpec.js?v=0d4a93ac';
import { SimMath } from './SimMath.js?v=44da8aea';

export class SnagField {
  static POINTS = AirframeSpec.MOTORS + 1;
  static CENTER = AirframeSpec.MOTORS;
  static MAX_LINEAR = 200.0;
  static MAX_QUADRATIC = 50.0;
  static MAX_HOLD = 50.0;
  static MAX_PROP_LOAD = 10.0;

  linear = new Float64Array(SnagField.POINTS);
  quadratic = new Float64Array(SnagField.POINTS);
  propLoad = new Float64Array(AirframeSpec.MOTORS);
  hold = 0.0;

  active() {
    if (this.hold > 0.0) {
      return true;
    }
    for (let i = 0; i < SnagField.POINTS; i++) {
      if (this.linear[i] > 0.0 || this.quadratic[i] > 0.0) {
        return true;
      }
    }
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      if (this.propLoad[i] > 0.0) {
        return true;
      }
    }
    return false;
  }

  clear() {
    this.linear.fill(0.0);
    this.quadratic.fill(0.0);
    this.propLoad.fill(0.0);
    this.hold = 0.0;
  }

  copyTo(dst) {
    dst.linear.set(this.linear.subarray(0, SnagField.POINTS));
    dst.quadratic.set(this.quadratic.subarray(0, SnagField.POINTS));
    dst.propLoad.set(this.propLoad.subarray(0, AirframeSpec.MOTORS));
    dst.hold = this.hold;
  }

  sanitizeFrom(src) {
    for (let i = 0; i < SnagField.POINTS; i++) {
      this.linear[i] = SimMath.sanitize(src.linear[i], 0.0, SnagField.MAX_LINEAR, 0.0);
      this.quadratic[i] = SimMath.sanitize(src.quadratic[i], 0.0, SnagField.MAX_QUADRATIC, 0.0);
    }
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      this.propLoad[i] = SimMath.sanitize(src.propLoad[i], 0.0, SnagField.MAX_PROP_LOAD, 0.0);
    }
    this.hold = SimMath.sanitize(src.hold, 0.0, SnagField.MAX_HOLD, 0.0);
  }
}
