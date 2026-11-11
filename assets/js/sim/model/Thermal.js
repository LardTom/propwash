// Port of de.lardtom.propwash.sim.Thermal (1:1).
import { AirframeSpec } from './AirframeSpec.js?v=0d4a93ac';
import { SimMath } from './SimMath.js?v=44da8aea';

export class Thermal {
  static MOTOR_HEAT_CAPACITY = 0.5;
  static ESC_HEAT_CAPACITY = 0.3;
  static OVERHEAT_C = 150.0;
  static HYSTERESIS_C = 10.0;
  static COPPER_TEMPCO = 0.00393;
  static MOTOR_CONDUCTANCE_BASE = 0.075;
  static MOTOR_CONDUCTANCE_PER_OMEGA = 1.5e-4;
  static MIN_POWER_LIMIT = 0.2;
  static WEAR_EVENT_STEP = 0.002;

  motorTemp = new Float64Array(AirframeSpec.MOTORS);
  escTemp = new Float64Array(AirframeSpec.MOTORS);
  overheated = new Array(AirframeSpec.MOTORS).fill(false);
  derating = new Array(AirframeSpec.MOTORS).fill(false);
  limit = Float64Array.of(1.0, 1.0, 1.0, 1.0);
  wear = new Float64Array(AirframeSpec.MOTORS);

  reset(ambient) {
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      this.motorTemp[i] = ambient;
      this.escTemp[i] = ambient;
      this.overheated[i] = false;
      this.derating[i] = false;
      this.limit[i] = 1.0;
      this.wear[i] = 0.0;
    }
  }

  advance(p, power, ambient, dt, effects) {
    const stackGrams = Math.max(p.stackMassKg * 1000.0, 0.5);
    const motorC = p.motorHeatCapacity;
    const escC = Thermal.ESC_HEAT_CAPACITY * stackGrams / 4.0;
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      const w = Math.abs(power.omega[i]);
      const current = power.current[i];
      const motorR = effects ? this.motorResistance(p, i) : p.motorResistance;
      const pm = current * current * motorR + p.kt * p.idleCurrent * w;
      const gm = (p.motorCoolingBase + p.motorCoolingPerOmega * w) * p.motorCoolingScale;
      const infM = ambient + pm / gm;
      this.motorTemp[i] = SimMath.clamp(infM + (this.motorTemp[i] - infM) * Math.exp(-dt * gm / motorC), -40.0, 250.0);
      const pe = current * current * p.escResistance;
      const ge = 0.02 * (stackGrams / 18.0) * (1.0 + w / p.hoverOmega);
      const infE = ambient + pe / ge;
      this.escTemp[i] = SimMath.clamp(infE + (this.escTemp[i] - infE) * Math.exp(-dt * ge / escC), -40.0, 250.0);
    }
  }

  motorResistance(p, i) {
    return p.motorResistance * (1.0 + Thermal.COPPER_TEMPCO * (this.motorTemp[i] - 25.0));
  }

  static excess(p, temperature) {
    return (temperature - p.motorDerateStartC) / (p.motorMaxTempC - p.motorDerateStartC);
  }

  static powerLimit(p, temperature) {
    const x = Thermal.excess(p, temperature);
    if (!(x > 0.0)) {
      return 1.0;
    }
    return 1.0 - (1.0 - Thermal.MIN_POWER_LIMIT) * Math.min(1.0, x);
  }

  static wearRate(p, temperature) {
    const x = Thermal.excess(p, temperature);
    if (!(x > 0.0)) {
      return 0.0;
    }
    const c = Math.min(1.0, x);
    return p.motorHeatWearPerSecond * c * c;
  }

  clearLimits() {
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      this.limit[i] = 1.0;
      this.derating[i] = false;
    }
  }
}
