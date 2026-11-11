// Port of de.lardtom.propwash.sim.Thermal (1:1, Propwash 0.6.0: ESC heat of the board size, eddy losses, airflow
// cooling, motor torque loss when hot, ESC power limit).
import { StrictMath } from './StrictMath.js?v=e765e983';
import { AirframeSpec } from './AirframeSpec.js?v=d12a0862';
import { SimMath } from './SimMath.js?v=44da8aea';

export class Thermal {
  static MOTOR_HEAT_CAPACITY = 0.5;
  static ESC_HEAT_CAPACITY = 0.5;
  static OVERHEAT_C = 150.0;
  static HYSTERESIS_C = 10.0;
  static COPPER_TEMPCO = 0.00393;
  static MOTOR_CONDUCTANCE_BASE = 0.1;
  static MOTOR_CONDUCTANCE_PER_SPEED = 0.0105;
  static BELL_RADIUS_PER_STATOR = 0.625;
  static MOTOR_EDDY_LOSS = 0.35;
  static ESC_CONDUCTANCE = 0.0275;
  static ESC_REFERENCE_BOARD_MM = 36.0;
  static ESC_REFERENCE_GRAMS = 18.0;
  static ESC_BOARD_WHOOP_MM = 25.5;
  static ESC_BOARD_20_MM = 26.0;
  static ESC_PROP_WASH = 0.2;
  static ESC_DUCTED = 0.6;
  static ESC_SWITCHING = 0.002;
  static ESC_LIMIT_C = 140.0;
  static ESC_DERATE_SPAN_K = 15.0;
  static ESC_MIN_POWER_LIMIT = 0.25;
  static MAX_TORQUE_LOSS = 0.1;
  static AIRFLOW_COOLING = 0.6;
  static AIRFLOW_REFERENCE_MS = 10.0;
  static WEAR_EVENT_STEP = 0.002;

  motorTemp = new Float64Array(AirframeSpec.MOTORS);
  escTemp = new Float64Array(AirframeSpec.MOTORS);
  overheated = new Array(AirframeSpec.MOTORS).fill(false);
  motorHot = new Array(AirframeSpec.MOTORS).fill(false);
  escDerating = new Array(AirframeSpec.MOTORS).fill(false);
  limit = Float64Array.of(1.0, 1.0, 1.0, 1.0);
  torque = Float64Array.of(1.0, 1.0, 1.0, 1.0);
  wear = new Float64Array(AirframeSpec.MOTORS);

  reset(ambient) {
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      this.motorTemp[i] = ambient;
      this.escTemp[i] = ambient;
      this.overheated[i] = false;
      this.motorHot[i] = false;
      this.escDerating[i] = false;
      this.limit[i] = 1.0;
      this.torque[i] = 1.0;
      this.wear[i] = 0.0;
    }
  }

  advance(p, power, ambient, airspeed, dt, effects) {
    const motorC = p.motorHeatCapacity;
    const escC = Thermal.escHeatCapacity(p);
    const air = Thermal.airflow(airspeed);
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      const w = Math.abs(power.omega[i]);
      const current = power.current[i];
      const pm = Thermal.motorLoss(p, current, w, effects ? this.motorResistance(p, i) : p.motorResistance);
      const gm = Thermal.motorCooling(p, w) * air;
      const infM = ambient + pm / gm;
      this.motorTemp[i] = SimMath.clamp(infM + (this.motorTemp[i] - infM) * StrictMath.exp(-dt * gm / motorC), -40.0, 250.0);
      const pe = Thermal.escLoss(p, current, power.busVoltage);
      const ge = Thermal.escCooling(p, w) * air;
      const infE = ambient + pe / ge;
      this.escTemp[i] = SimMath.clamp(infE + (this.escTemp[i] - infE) * StrictMath.exp(-dt * ge / escC), -40.0, 250.0);
    }
  }

  motorResistance(p, i) {
    return p.motorResistance * (1.0 + Thermal.COPPER_TEMPCO * (this.motorTemp[i] - 25.0));
  }

  static airflow(airspeed) {
    const v = airspeed > 0.0 ? airspeed : 0.0;
    return 1.0 + Thermal.AIRFLOW_COOLING * Math.sqrt(Math.min(v, 100.0) / Thermal.AIRFLOW_REFERENCE_MS);
  }

  static bellRadius(statorDiameterMeters) {
    return Thermal.BELL_RADIUS_PER_STATOR * statorDiameterMeters;
  }

  static eddyLoss(statorDiameterMeters, statorHeightMeters) {
    return Thermal.MOTOR_EDDY_LOSS * 0.25 * Math.PI * statorDiameterMeters * statorDiameterMeters * statorHeightMeters;
  }

  static motorLoss(p, current, omega, resistance) {
    const w = Math.abs(omega);
    return current * current * resistance + p.kt * p.idleCurrent * w + p.motorEddyLoss * w * w;
  }

  static motorCooling(p, omega) {
    return (p.motorCoolingBase + p.motorCoolingPerOmega * Math.abs(omega)) * p.motorCoolingScale;
  }

  static escLoss(p, current, busVoltage) {
    return current * current * p.escResistance + Thermal.ESC_SWITCHING * Math.max(busVoltage, 0.0) * Math.abs(current);
  }

  static escCooling(p, omega) {
    const wash = 1.0 + Thermal.ESC_PROP_WASH * Math.abs(omega) / p.hoverOmega;
    return p.escCooling * wash * (p.ducted ? Thermal.ESC_DUCTED : 1.0);
  }

  static escStillAir(boardMm) {
    const size = boardMm / Thermal.ESC_REFERENCE_BOARD_MM;
    return Thermal.ESC_CONDUCTANCE * size * size;
  }

  static boardFromMass(stackGrams) {
    return Thermal.ESC_REFERENCE_BOARD_MM * Math.cbrt(Math.max(stackGrams, 0.5) / Thermal.ESC_REFERENCE_GRAMS);
  }

  static escHeatCapacity(p) {
    return Thermal.ESC_HEAT_CAPACITY * Math.max(p.stackMassKg * 1000.0, 0.5) / 4.0;
  }

  static excess(p, temperature) {
    return (temperature - p.motorDerateStartC) / (p.motorMaxTempC - p.motorDerateStartC);
  }

  static torqueFactor(p, temperature) {
    const x = Thermal.excess(p, temperature);
    if (!(x > 0.0)) {
      return 1.0;
    }
    return 1.0 - Thermal.MAX_TORQUE_LOSS * Math.min(1.0, x);
  }

  static escPowerLimit(temperature) {
    const x = (temperature - Thermal.ESC_LIMIT_C) / Thermal.ESC_DERATE_SPAN_K;
    if (!(x > 0.0)) {
      return 1.0;
    }
    return 1.0 - (1.0 - Thermal.ESC_MIN_POWER_LIMIT) * Math.min(1.0, x);
  }

  static wearRate(p, temperature) {
    const x = Thermal.excess(p, temperature);
    if (!(x > 0.0)) {
      return 0.0;
    }
    const c = Math.min(1.0, x);
    return p.motorHeatWearPerSecond * c * c;
  }
}
