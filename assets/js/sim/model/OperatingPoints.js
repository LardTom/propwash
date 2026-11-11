// Port of de.lardtom.propwash.sim.OperatingPoints (1:1). OperatingPoints.Point is exported and attached as a static.
// StrictMath.exp/pow are the fdlibm port (StrictMath.js); StrictMath.sin/cos of the level-flight points (top speed and
// cruise of the analysis, not used in flight) stay Math.sin/cos, which may differ in the last bit.
import { CellCurve } from './CellCurve.js?v=0c22cd1a';
import { ModelConstants } from './ModelConstants.js?v=760466ce';
import { PowerSystem } from './PowerSystem.js?v=047f5bd2';
import { RotorAero } from './RotorAero.js?v=22dc31b6';
import { StrictMath } from './StrictMath.js?v=e765e983';
import { Thermal } from './Thermal.js?v=4b9beec5';

// java.lang.Math.toRadians multiplies by this constant.
const DEGREES_TO_RADIANS = 0.017453292519943295;

export class Point {
  busVoltage = 0.0;
  duty = 0.0;
  omega = 0.0;
  phaseCurrent = 0.0;
  batteryCurrent = 0.0;
  thrustPerMotor = 0.0;
  feasible = false;
}

export class OperatingPoints {
  static MOTOR_STEPS = 60;
  static BUS_STEPS = 50;
  static HOVER_STEPS = 100;
  static THRUST_STEPS = 40;
  static SPEED_STEPS = 50;
  static TILT_STEPS = 40;
  static MAX_TILT = 89.0 * DEGREES_TO_RADIANS;
  static MAX_SPEED = 150.0;
  static INSTANT = 0;
  static SUSTAINED = 1;
  static STEADY = 2;
  static HEAT_SEGMENTS = 40;

  static Point = Point;

  static emf(p, soc) {
    return p.cells * CellCurve.ocv(p.chemistry, soc);
  }

  static lowSoc(soc) {
    const x = Math.min(1.0, Math.max(0.0, ModelConstants.LOW_SOC_KNEE - soc) / ModelConstants.LOW_SOC_KNEE);
    return StrictMath.pow(x, ModelConstants.LOW_SOC_EXPONENT);
  }

  static rateFactor(p, batteryCurrent) {
    return 1.0 + ModelConstants.C_RATE_PENALTY * Math.max(0.0, batteryCurrent / p.continuousCurrent - 1.0);
  }

  static internalResistance(p, batteryCurrent, soc) {
    const low = 1.0 + ModelConstants.LOW_SOC_OHMIC_GAIN * OperatingPoints.lowSoc(soc);
    return p.packResistance * (OperatingPoints.rateFactor(p, batteryCurrent) - ModelConstants.SAG_FAST_FRACTION) * low;
  }

  static fastResistance(p, soc) {
    return ModelConstants.SAG_FAST_FRACTION * p.packResistance * (1.0 + ModelConstants.LOW_SOC_FAST_GAIN * OperatingPoints.lowSoc(soc));
  }

  static slowResistance(p, soc) {
    return p.polarizationResistance * (1.0 + ModelConstants.LOW_SOC_SLOW_GAIN * OperatingPoints.lowSoc(soc));
  }

  static sustainedResistance(p, batteryCurrent, soc) {
    const low = OperatingPoints.lowSoc(soc);
    return p.packResistance * OperatingPoints.rateFactor(p, batteryCurrent) * (1.0 + ModelConstants.LOW_SOC_OHMIC_GAIN * low)
      + ModelConstants.SAG_FAST_FRACTION * p.packResistance * (ModelConstants.LOW_SOC_FAST_GAIN - ModelConstants.LOW_SOC_OHMIC_GAIN) * low;
  }

  static dcResistance(p, batteryCurrent, soc) {
    return OperatingPoints.sustainedResistance(p, batteryCurrent, soc) + OperatingPoints.slowResistance(p, soc);
  }

  static currentLimit(p, busVoltage, omega) {
    return Math.min(p.escCurrentLimit,
      PowerSystem.inputLimitedCurrent(p.phaseResistance, p.kt * omega, busVoltage, p.escInputLimit));
  }

  static phaseCurrent(p, duty, busVoltage, omega) {
    return Math.min((duty * busVoltage - p.kt * omega) / p.phaseResistance, OperatingPoints.currentLimit(p, busVoltage, omega));
  }

  static motorInputCurrent(p, busVoltage, omega, current) {
    return (p.phaseResistance * current + p.kt * omega) * current / busVoltage;
  }

  static motorOmega(p, duty, busVoltage, axialSpeed, rhoRatio) {
    if (OperatingPoints.motorBalance(p, duty, busVoltage, axialSpeed, rhoRatio, 0.0) <= 0.0) {
      return 0.0;
    }
    let lo = 0.0;
    let hi = p.omegaMax;
    for (let k = 0; k < OperatingPoints.MOTOR_STEPS; k++) {
      const mid = 0.5 * (lo + hi);
      if (OperatingPoints.motorBalance(p, duty, busVoltage, axialSpeed, rhoRatio, mid) > 0.0) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return 0.5 * (lo + hi);
  }

  static motorBalance(p, duty, busVoltage, axialSpeed, rhoRatio, omega) {
    const current = OperatingPoints.phaseCurrent(p, duty, busVoltage, omega);
    return p.kt * (current - p.idleCurrent) - RotorAero.airTorque(p, omega, axialSpeed, rhoRatio);
  }

  // Java overloads:
  //   uniformDuty(AirframeSpec p, double duty, double soc, boolean polarized, double axialSpeed, double crossSpeed, Point out)
  //       -> fixedPolarization 0.0
  //   uniformDuty(AirframeSpec p, double duty, double soc, boolean polarized, double fixedPolarization, double axialSpeed,
  //               double crossSpeed, Point out)
  static uniformDuty(p, duty, soc, polarized, fixedPolarization, axialSpeed, crossSpeed, out) {
    if (arguments.length === 7) {
      // (p, duty, soc, polarized, axialSpeed, crossSpeed, out): the last three arguments sit one slot earlier
      const axial = arguments[4];
      const cross = arguments[5];
      const point = arguments[6];
      OperatingPoints.uniformDuty(p, duty, soc, polarized, 0.0, axial, cross, point);
      return;
    }
    const e = OperatingPoints.emf(p, soc);
    let lo = 0.05 * e;
    let hi = e;
    for (let k = 0; k < OperatingPoints.BUS_STEPS; k++) {
      const mid = 0.5 * (lo + hi);
      const omega = OperatingPoints.motorOmega(p, duty, mid, axialSpeed, 1.0);
      const current = OperatingPoints.phaseCurrent(p, duty, mid, omega);
      const iBat = 4.0 * OperatingPoints.motorInputCurrent(p, mid, omega, current) + p.auxPower / mid;
      const r = OperatingPoints.sustainedResistance(p, iBat, soc);
      const vPol = polarized ? OperatingPoints.slowResistance(p, soc) * iBat : fixedPolarization;
      if (e - vPol - r * iBat - mid > 0.0) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    const v = 0.5 * (lo + hi);
    const omega = OperatingPoints.motorOmega(p, duty, v, axialSpeed, 1.0);
    const current = OperatingPoints.phaseCurrent(p, duty, v, omega);
    out.busVoltage = v;
    out.duty = duty;
    out.omega = omega;
    out.phaseCurrent = current;
    out.batteryCurrent = 4.0 * OperatingPoints.motorInputCurrent(p, v, omega, current) + p.auxPower / v;
    out.thrustPerMotor = RotorAero.thrust(p, omega, axialSpeed, crossSpeed, 1.0, 1.0);
    out.feasible = true;
  }

  static steadyMotor(p, omega, current, soc, polarized, fixedPolarization, sag, out) {
    OperatingPoints.loadedMotor(p, omega, current, soc, polarized ? OperatingPoints.STEADY : OperatingPoints.SUSTAINED,
      fixedPolarization, sag, out);
  }

  static loadedMotor(p, omega, current, soc, load, fixedPolarization, sag, out) {
    const rested = PowerSystem.restingSoc(soc, sag);
    const e = OperatingPoints.emf(p, rested);
    const drive = p.phaseResistance * current + p.kt * omega;
    let v = e;
    for (let k = 0; k < OperatingPoints.HOVER_STEPS; k++) {
      const vv = Math.max(v, 0.05 * e);
      const duty = drive / vv;
      const iBat = 4.0 * duty * current + p.auxPower / vv;
      const r = load === OperatingPoints.INSTANT
        ? OperatingPoints.internalResistance(p, iBat, rested)
        : OperatingPoints.sustainedResistance(p, iBat, rested);
      const vPol = load === OperatingPoints.STEADY ? OperatingPoints.slowResistance(p, rested) * iBat : fixedPolarization;
      v = 0.5 * v + 0.5 * (e - vPol - r * iBat);
    }
    v = Math.max(v, 0.05 * e);
    const duty = drive / v;
    out.busVoltage = v;
    out.duty = duty;
    out.omega = omega;
    out.phaseCurrent = current;
    out.batteryCurrent = 4.0 * duty * current + p.auxPower / v;
    out.thrustPerMotor = p.kThrust * p.ductGain * omega * omega;
    out.feasible = duty <= 1.0 && current <= OperatingPoints.currentLimit(p, v, omega) + 1e-9;
  }

  // Java overloads:
  //   hoverCurrent(AirframeSpec p)
  //   hoverCurrent(AirframeSpec p, double gravityScale)
  static hoverCurrent(p, gravityScale) {
    if (arguments.length === 1) {
      return p.kTorque * p.hoverOmega * p.hoverOmega / p.kt + p.idleCurrent;
    }
    return p.kTorque * p.hoverOmega * p.hoverOmega * gravityScale / p.kt + p.idleCurrent;
  }

  static hover(p, soc, polarized, fixedPolarization, sag, out) {
    OperatingPoints.steadyMotor(p, p.hoverOmega, OperatingPoints.hoverCurrent(p), soc, polarized, fixedPolarization, sag, out);
  }

  static hoverStick(p, soc) {
    const pt = new Point();
    OperatingPoints.hover(p, soc, true, 0.0, true, pt);
    return (pt.duty - ModelConstants.IDLE_REFERENCE) / (1.0 - ModelConstants.IDLE_REFERENCE);
  }

  static omegaForThrust(p, thrust, axialSpeed, crossSpeed) {
    if (thrust <= 0.0) {
      return 0.0;
    }
    let lo = 0.0;
    let hi = 2.0 * p.omegaMax;
    for (let k = 0; k < OperatingPoints.THRUST_STEPS; k++) {
      const mid = 0.5 * (lo + hi);
      if (RotorAero.thrust(p, mid, axialSpeed, crossSpeed, 1.0, 1.0) < thrust) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return 0.5 * (lo + hi);
  }

  static bodyDragY(p, speed, tilt) {
    return 0.5 * ModelConstants.RHO0 * p.dragCoefficient * p.areaY * speed * speed * Math.sin(tilt);
  }

  static bodyDragZ(p, speed, tilt) {
    return 0.5 * ModelConstants.RHO0 * p.dragCoefficient * p.areaZ * speed * speed * Math.cos(tilt);
  }

  static requiredThrust(p, speed, tilt) {
    return p.massKg * ModelConstants.G * Math.cos(tilt) + OperatingPoints.bodyDragY(p, speed, tilt);
  }

  static levelFlightOmega(p, speed, tilt) {
    const sin = Math.sin(tilt);
    const cos = Math.cos(tilt);
    return OperatingPoints.omegaForThrust(p, OperatingPoints.requiredThrust(p, speed, tilt) / 4.0, speed * sin, speed * cos);
  }

  static forwardBalance(p, speed, tilt) {
    const sin = Math.sin(tilt);
    const cos = Math.cos(tilt);
    const total = OperatingPoints.requiredThrust(p, speed, tilt);
    const omega = OperatingPoints.omegaForThrust(p, total / 4.0, speed * sin, speed * cos);
    const h = RotorAero.hForceMagnitude(total, speed * cos, omega, p.propRadius);
    return p.massKg * ModelConstants.G * sin - h - OperatingPoints.bodyDragZ(p, speed, tilt);
  }

  static speedAtTilt(p, tilt) {
    if (tilt <= 0.0) {
      return 0.0;
    }
    let lo = 0.0;
    let hi = OperatingPoints.MAX_SPEED;
    if (OperatingPoints.forwardBalance(p, hi, tilt) > 0.0) {
      return hi;
    }
    for (let k = 0; k < OperatingPoints.SPEED_STEPS; k++) {
      const mid = 0.5 * (lo + hi);
      if (OperatingPoints.forwardBalance(p, mid, tilt) > 0.0) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return 0.5 * (lo + hi);
  }

  static fullThrust(p, speed, tilt, soc, scratch) {
    const sin = Math.sin(tilt);
    const cos = Math.cos(tilt);
    OperatingPoints.uniformDuty(p, 1.0, soc, true, speed * sin, speed * cos, scratch);
    return 4.0 * scratch.thrustPerMotor;
  }

  static topSpeedTilt(p, soc) {
    const scratch = new Point();
    if (OperatingPoints.fullThrust(p, 0.0, 0.0, soc, scratch) < OperatingPoints.requiredThrust(p, 0.0, 0.0)) {
      return 0.0;
    }
    let lo = 0.0;
    let hi = OperatingPoints.MAX_TILT;
    for (let k = 0; k < OperatingPoints.TILT_STEPS; k++) {
      const mid = 0.5 * (lo + hi);
      const v = OperatingPoints.speedAtTilt(p, mid);
      if (OperatingPoints.requiredThrust(p, v, mid) <= OperatingPoints.fullThrust(p, v, mid, soc, scratch)) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return lo;
  }

  static tiltForSpeed(p, speed, maxTilt) {
    let lo = 0.0;
    let hi = maxTilt;
    for (let k = 0; k < OperatingPoints.TILT_STEPS; k++) {
      const mid = 0.5 * (lo + hi);
      if (OperatingPoints.speedAtTilt(p, mid) < speed) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return 0.5 * (lo + hi);
  }

  static flightTimeMinutes(p, omega, current) {
    const pt = new Point();
    const capacity = p.capacityMah;
    const limit = 0.8 * capacity;
    let used = 0.0;
    for (let second = 0; second < 360000; second++) {
      const soc = 1.0 - used / capacity;
      OperatingPoints.steadyMotor(p, omega, current, soc, true, 0.0, true, pt);
      const step = Math.max(pt.batteryCurrent, 1e-6) / 3.6;
      if (used + step >= limit) {
        return (second + (limit - used) / step) / 60.0;
      }
      used += step;
    }
    return 6000.0;
  }

  static fullThrottleMotorTemp(p, ambient) {
    return OperatingPoints.heatRun(p, ambient, true);
  }

  static hoverMotorTemp(p, ambient) {
    return OperatingPoints.heatRun(p, ambient, false);
  }

  static heatRun(p, ambient, full) {
    const pt = new Point();
    let temp = ambient;
    let max = ambient;
    const current = OperatingPoints.hoverCurrent(p);
    for (let k = 0; k < OperatingPoints.HEAT_SEGMENTS; k++) {
      const soc = 1.0 - (k + 0.5) / OperatingPoints.HEAT_SEGMENTS;
      if (full) {
        OperatingPoints.uniformDuty(p, 1.0, soc, true, 0.0, 0.0, pt);
      } else {
        OperatingPoints.steadyMotor(p, p.hoverOmega, current, soc, true, 0.0, true, pt);
      }
      const seconds = p.capacityMah / OperatingPoints.HEAT_SEGMENTS * 3.6 / Math.max(pt.batteryCurrent, 1e-3);
      const power = Thermal.motorLoss(p, pt.phaseCurrent, pt.omega, p.motorResistance);
      const g = Thermal.motorCooling(p, pt.omega);
      const inf = ambient + power / g;
      temp = inf + (temp - inf) * StrictMath.exp(-seconds * g / p.motorHeatCapacity);
      if (!Number.isFinite(temp)) {
        return NaN;
      }
      max = Math.max(max, temp);
    }
    return max;
  }
}
