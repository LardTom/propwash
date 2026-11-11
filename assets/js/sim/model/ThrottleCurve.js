import { SimMath } from './SimMath.js?v=44da8aea';
import { ThrottleLimitType } from './ThrottleLimitType.js?v=ed56c82e';

// Port of de.lardtom.propwash.sim.ThrottleCurve
export class ThrottleCurve {
  static BISECTION_STEPS = 40;

  static apply(p, stick) {
    const t = SimMath.clamp01(SimMath.finiteOr(stick, 0.0));
    const m = p.throttleMid;
    const e = p.throttleExpo;
    const delta = t - m;
    const y = delta > 0.0 ? 1.0 - m : (delta < 0.0 ? m : 1.0);
    const shaped = m + delta * (1.0 - e + e * delta * delta / (y * y));
    const limit = p.throttleLimitPercent / 100.0;
    const type = p.throttleLimitType == null ? ThrottleLimitType.OFF : p.throttleLimitType;
    let out;
    switch (type) {
      case ThrottleLimitType.OFF:
        out = shaped;
        break;
      case ThrottleLimitType.SCALE:
        out = shaped * limit;
        break;
      case ThrottleLimitType.CLIP:
        out = Math.min(shaped, limit);
        break;
      default:
        throw new Error('Unknown throttle limit type ' + type);
    }
    return SimMath.clamp01(out);
  }

  static inverse(p, throttle) {
    const target = SimMath.finiteOr(throttle, 0.0);
    if (target <= ThrottleCurve.apply(p, 0.0)) {
      return 0.0;
    }
    if (target >= ThrottleCurve.apply(p, 1.0)) {
      return 1.0;
    }
    let lo = 0.0;
    let hi = 1.0;
    for (let k = 0; k < ThrottleCurve.BISECTION_STEPS; k++) {
      const mid = 0.5 * (lo + hi);
      if (ThrottleCurve.apply(p, mid) < target) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return SimMath.clamp01(0.5 * (lo + hi));
  }
}
