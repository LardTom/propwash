// Port of de.lardtom.propwash.sim.RotorAero (1:1).
import { ModelConstants } from './ModelConstants.js?v=760466ce';
import { SimMath } from './SimMath.js?v=44da8aea';

export class RotorAero {
  static FLEX_LOSS = 0.04;
  static FLEX_LOAD_CAP = 4.0;

  static zeroThrustSpeed(zeroThrustPerOmega, omega) {
    return Math.max(ModelConstants.V0_MIN, zeroThrustPerOmega * omega);
  }

  static inflowRatio(axialSpeed, zeroThrustPerOmega, omega) {
    return axialSpeed / RotorAero.zeroThrustSpeed(zeroThrustPerOmega, omega);
  }

  static inducedPerOmega(kThrust, discArea) {
    return discArea > 0.0 && kThrust > 0.0 ? Math.sqrt(kThrust / (2.0 * ModelConstants.RHO0 * discArea)) : 0.0;
  }

  // Java overloads (dispatch: 1 argument, else on the type of the first argument):
  //   axialThrustFactor(double lambda)
  //   axialThrustFactor(AirframeSpec p, double lambda, double omega, double crossSpeed)
  //   axialThrustFactor(double lambda, double pitchSpeed, double inducedSpeed, double coupling)
  static axialThrustFactor(a, b, c, d) {
    if (arguments.length === 1) {
      const lambda = a;
      if (lambda >= 0.0) {
        return Math.max(0.0, 1.0 - lambda);
      }
      return 1.0 + ModelConstants.DESCENT_GAIN * Math.min(-lambda, ModelConstants.DESCENT_CAP);
    }
    if (typeof a === 'object' && a !== null) {
      const p = a;
      const lambda = b;
      const omega = c;
      const crossSpeed = d;
      const w = Math.abs(omega);
      return RotorAero.axialThrustFactor(lambda, RotorAero.zeroThrustSpeed(p.zeroThrustPerOmega, w), p.inducedPerOmega * w,
        RotorAero.inducedCoupling(crossSpeed, p.hoverInducedVelocity));
    }
    const lambda = a;
    const pitchSpeed = b;
    const inducedSpeed = c;
    const coupling = d;
    if (lambda <= 0.0 || lambda >= 1.0 || !(inducedSpeed > 0.0) || !(coupling > 0.0)) {
      return RotorAero.axialThrustFactor(lambda);
    }
    const r = pitchSpeed / inducedSpeed;
    if (!(r > ModelConstants.MOMENTUM_MIN_RATIO) || r > ModelConstants.MOMENTUM_MAX_RATIO) {
      return RotorAero.axialThrustFactor(lambda);
    }
    const linear = 1.0 - lambda;
    const k = 1.0 / (r - 1.0);
    const s = lambda * r;
    const bb = s + k;
    const cc = (r - s) * k;
    const u = 2.0 * cc / (bb + Math.sqrt(bb * bb + 4.0 * cc));
    const momentum = Math.max(0.0, (r - s - u) * k);
    return linear + coupling * (momentum - linear);
  }

  static inducedCoupling(crossSpeed, hoverInducedVelocity) {
    if (!(crossSpeed > 0.0)) {
      return 1.0;
    }
    if (!(hoverInducedVelocity > 0.0)) {
      return 0.0;
    }
    const mu = crossSpeed / hoverInducedVelocity;
    const mu2 = mu * mu;
    const q = Math.sqrt(mu2 * mu2 + 4.0);
    return 4.0 / (q * (q + mu2));
  }

  static torqueFactor(lambda) {
    if (lambda >= 0.0) {
      return Math.max(ModelConstants.Q_MIN, 1.0 - ModelConstants.Q_CLIMB * lambda);
    }
    return 1.0 + ModelConstants.Q_DESCENT * Math.min(-lambda, ModelConstants.DESCENT_CAP);
  }

  static ductFactor(ducted, gain, lambda) {
    if (!ducted) {
      return 1.0;
    }
    if (lambda <= 0.0) {
      return gain;
    }
    return 1.0 + (gain - 1.0) * SimMath.clamp01(1.0 - lambda / ModelConstants.DUCT_FADE);
  }

  static flexFactor(p, omega) {
    if (p.propFlex === 0.0) {
      return 1.0;
    }
    const load = omega / p.hoverOmega;
    const excess = Math.min(Math.max(0.0, load * load - 1.0), RotorAero.FLEX_LOAD_CAP);
    return 1.0 - RotorAero.FLEX_LOSS * p.propFlex * excess / RotorAero.FLEX_LOAD_CAP;
  }

  static translationalLiftFactor(crossSpeed, hoverInducedVelocity, gain, scale) {
    const mu = crossSpeed / hoverInducedVelocity;
    const mu2 = mu * mu;
    return 1.0 + scale * gain * mu2 / (1.0 + mu2);
  }

  static thrust(p, omega, axialSpeed, crossSpeed, rhoRatio, tlScale) {
    const lambda = RotorAero.inflowRatio(axialSpeed, p.zeroThrustPerOmega, omega);
    const t = p.kThrust * rhoRatio * RotorAero.ductFactor(p.ducted, p.ductGain, lambda) * RotorAero.axialThrustFactor(p, lambda, omega, crossSpeed)
      * RotorAero.translationalLiftFactor(crossSpeed, p.hoverInducedVelocity, p.translationalLiftGain, tlScale) * omega * omega;
    return p.propFlex === 0.0 ? t : t * RotorAero.flexFactor(p, omega);
  }

  static airTorque(p, omega, axialSpeed, rhoRatio) {
    const lambda = RotorAero.inflowRatio(axialSpeed, p.zeroThrustPerOmega, omega);
    return p.kTorque * rhoRatio * RotorAero.torqueFactor(lambda) * omega * omega;
  }

  static hForceMagnitude(thrust, crossSpeed, omega, radius) {
    return ModelConstants.KAPPA_H * thrust * crossSpeed / (omega * radius + ModelConstants.H_TIP_OFFSET);
  }
}
