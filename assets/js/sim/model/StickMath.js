import { SimMath } from './SimMath.js?v=44da8aea';
import { RateCurves } from './RateCurves.js?v=13dd073e';
import { ThrottleCurve } from './ThrottleCurve.js?v=6243615e';

// Port of de.lardtom.propwash.sim.StickMath
export class StickMath {
  static angleToStick(angleDeg, pid) {
    return SimMath.clamp(SimMath.finiteOr(angleDeg, 0.0) / pid.angleLimitDeg, -1.0, 1.0);
  }

  static stickToAngle(stick, pid) {
    return SimMath.clamp(SimMath.finiteOr(stick, 0.0), -1.0, 1.0) * pid.angleLimitDeg;
  }

  static rateToStick(rateDps, rates, axis) {
    return RateCurves.stickFor(rates.type, rates.axis(axis), rateDps);
  }

  static throttleToStick(throttle, pid) {
    return ThrottleCurve.inverse(pid, throttle);
  }
}
