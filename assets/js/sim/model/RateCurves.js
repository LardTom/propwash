import { SimMath } from './SimMath.js?v=44da8aea';
import { RatesType } from './RatesType.js?v=a3ff710e';

// Port of de.lardtom.propwash.sim.RateCurves
export class RateCurves {
  static RATE_LIMIT_DPS = 1998.0;
  static BISECTION_STEPS = 40;

  static rateDps(type, r, stick) {
    const x = SimMath.clamp(SimMath.finiteOr(stick, 0.0), -1.0, 1.0);
    let rate;
    if (type === RatesType.BETAFLIGHT) {
      const a = Math.abs(x);
      const e = r.rcExpo;
      const xe = x * a * a * a * e + x * (1.0 - e);
      const rc = r.rcRate > 2.0 ? r.rcRate + 14.54 * (r.rcRate - 2.0) : r.rcRate;
      rate = 200.0 * rc * xe;
      if (r.superRate > 0.0) {
        rate = rate / SimMath.clamp(1.0 - a * r.superRate, 0.01, 1.0);
      }
    } else {
      const e = r.actualExpo;
      const x5 = x * x * x * x * x;
      rate = x * r.centerRateDps + Math.max(0.0, r.maxRateDps - r.centerRateDps) * Math.abs(x) * (x5 * e + x * (1.0 - e));
    }
    return SimMath.clamp(rate, -RateCurves.RATE_LIMIT_DPS, RateCurves.RATE_LIMIT_DPS);
  }

  static maxRateDps(type, r) {
    return RateCurves.rateDps(type, r, 1.0);
  }

  static stickFor(type, r, rateDps) {
    const target = SimMath.finiteOr(rateDps, 0.0);
    let lo = -1.0;
    let hi = 1.0;
    if (target >= RateCurves.rateDps(type, r, hi)) {
      return hi;
    }
    if (target <= RateCurves.rateDps(type, r, lo)) {
      return lo;
    }
    for (let k = 0; k < RateCurves.BISECTION_STEPS; k++) {
      const mid = 0.5 * (lo + hi);
      if (RateCurves.rateDps(type, r, mid) < target) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return SimMath.clamp(0.5 * (lo + hi), -1.0, 1.0);
  }
}
