// Port of de.lardtom.propwash.sim.PowerSystem (1:1).
import { AirframeSpec } from './AirframeSpec.js?v=4131aebb';
import { EnergyModel } from './EnergyModel.js?v=19504798';
import { ModelConstants } from './ModelConstants.js?v=760466ce';
import { OperatingPoints } from './OperatingPoints.js?v=19504798';
import { RotorAero } from './RotorAero.js?v=22dc31b6';
import { SimMath } from './SimMath.js?v=44da8aea';

export class PowerSystem {
  static MAX_PASSES = 6;
  static FREE = 0;
  static PHASE_LIMIT = 1;
  static INPUT_LIMIT = 2;
  static MIN_BUS_VOLTAGE = 1e-6;

  omega = new Float64Array(AirframeSpec.MOTORS);
  current = new Float64Array(AirframeSpec.MOTORS);
  airTorque = new Float64Array(AirframeSpec.MOTORS);
  reactionTorque = new Float64Array(AirframeSpec.MOTORS);
  resistance = new Float64Array(AirframeSpec.MOTORS);
  limited = new Array(AirframeSpec.MOTORS).fill(false);
  limit = new Float64Array(AirframeSpec.MOTORS);
  mode = new Int32Array(AirframeSpec.MOTORS);
  inputCurrent = new Float64Array(AirframeSpec.MOTORS);
  loadScale = Float64Array.of(1.0, 1.0, 1.0, 1.0);
  snagLoad = Float64Array.of(1.0, 1.0, 1.0, 1.0);
  fluidLoad = Float64Array.of(1.0, 1.0, 1.0, 1.0);
  driveSign = Float64Array.of(1.0, 1.0, 1.0, 1.0);
  batteryResistanceScale = 1.0;
  reversible = false;

  p = null;
  polarizationCoeff = 0.0;
  fastCoeff = 0.0;
  heatCoeff = 0.0;

  soc = 1.0;
  mAhUsed = 0.0;
  polarization = 0.0;
  fastPolarization = 0.0;
  resistanceSoc = 1.0;
  lastBatteryCurrent = 0.0;
  heatCurrent = 0.0;
  lastBusVoltage = 0.0;
  busVoltage = 0.0;
  batteryCurrent = 0.0;
  emf = 0.0;
  internalResistance = 0.0;
  anyLimited = false;
  stiffBus = false;
  extraPower = 0.0;
  fullLoad = 0.0;
  packSoc = 1.0;
  packMah = 0.0;
  packCurrent = 0.0;

  configure(params, h) {
    this.p = params;
    this.polarizationCoeff = 1.0 - Math.exp(-h / ModelConstants.POL_TAU);
    this.fastCoeff = 1.0 - Math.exp(-h / ModelConstants.SAG_FAST_TAU);
    this.heatCoeff = 1.0 - Math.exp(-h / ModelConstants.C_RATE_TAU);
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      this.resistance[i] = params.phaseResistance;
    }
  }

  setStateOfCharge(chargeFraction) {
    const c = SimMath.clamp01(SimMath.finiteOr(chargeFraction, 1.0));
    this.soc = c;
    this.mAhUsed = (1.0 - c) * this.p.capacityMah;
    this.polarization = 0.0;
    this.fastPolarization = 0.0;
    this.resistanceSoc = c;
    this.lastBatteryCurrent = 0.0;
    this.heatCurrent = 0.0;
    this.emf = OperatingPoints.emf(this.p, this.soc);
    this.lastBusVoltage = this.emf;
    this.busVoltage = this.emf;
    this.batteryCurrent = 0.0;
    this.packSoc = c;
    this.packMah = (1.0 - c) * this.p.capacityMah;
    this.packCurrent = 0.0;
  }

  keepCharge() {
    this.mAhUsed = (1.0 - this.soc) * this.p.capacityMah;
    this.packMah = (1.0 - this.packSoc) * this.p.capacityMah;
  }

  stopRotors() {
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      this.omega[i] = 0.0;
      this.current[i] = 0.0;
      this.airTorque[i] = 0.0;
      this.reactionTorque[i] = 0.0;
      this.limited[i] = false;
      this.mode[i] = PowerSystem.FREE;
      this.inputCurrent[i] = 0.0;
      this.driveSign[i] = 1.0;
    }
  }

  transientVoltage() {
    return this.polarization + this.fastPolarization;
  }

  static restingSoc(soc, sag) {
    return sag ? soc : 1.0;
  }

  static inputLimitedCurrent(r, backEmf, busVoltage, inputLimit) {
    if (!(busVoltage > 0.0) || !(inputLimit > 0.0)) {
      return 0.0;
    }
    const e = Math.max(0.0, backEmf);
    return 2.0 * busVoltage * inputLimit / (e + Math.sqrt(e * e + 4.0 * r * busVoltage * inputLimit));
  }

  solveBus(duty, active, sag) {
    const params = this.p;
    this.resistanceSoc = PowerSystem.restingSoc(this.soc, sag);
    const e = OperatingPoints.emf(params, this.resistanceSoc) - (this.stiffBus ? 0.0 : this.transientVoltage());
    const rInt = this.stiffBus ? 0.0
      : OperatingPoints.internalResistance(params, this.heatCurrent, this.resistanceSoc) * this.batteryResistanceScale;
    this.emf = e;
    this.internalResistance = rInt;
    const aux = params.auxPower / Math.max(this.lastBusVoltage, 1.0);
    const ke = params.kt;
    const inLimit = params.escInputLimit;
    let v;
    this.anyLimited = false;
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      this.limited[i] = false;
      this.mode[i] = PowerSystem.FREE;
      this.limit[i] = params.escCurrentLimit;
    }
    if (active) {
      v = e;
      for (let pass = 0; pass < PowerSystem.MAX_PASSES; pass++) {
        let fixed = aux;
        let power = 0.0;
        let freeEmf = 0.0;
        let freeSq = 0.0;
        for (let i = 0; i < AirframeSpec.MOTORS; i++) {
          const m = this.mode[i];
          if (m === PowerSystem.FREE) {
            const d = duty[i];
            freeEmf += d * ke * this.omega[i] / this.resistance[i];
            freeSq += d * d / this.resistance[i];
          } else if (m === PowerSystem.INPUT_LIMIT) {
            fixed += inLimit;
          } else {
            const c = this.current[i];
            power += (this.resistance[i] * c + ke * this.omega[i]) * c;
          }
        }
        v = PowerSystem.busRoot(1.0 + rInt * freeSq, e - rInt * fixed + rInt * freeEmf, rInt * power);
        let changed = false;
        for (let i = 0; i < AirframeSpec.MOTORS; i++) {
          const m = this.classify(i, duty[i], v, ke);
          if (m !== this.mode[i]) {
            changed = true;
          }
          this.mode[i] = m;
        }
        if (!changed) {
          break;
        }
      }
      const vMax = e + 0.1 * params.cells;
      if (!(v >= 0.0) || v > vMax) {
        v = SimMath.clamp(SimMath.finiteOr(v, 0.0), 0.0, vMax);
        for (let i = 0; i < AirframeSpec.MOTORS; i++) {
          this.mode[i] = this.classify(i, duty[i], v, ke);
        }
      }
      let total = aux;
      for (let i = 0; i < AirframeSpec.MOTORS; i++) {
        const c = this.current[i];
        let input;
        if (this.mode[i] === PowerSystem.FREE) {
          input = duty[i] * c;
        } else {
          input = v > PowerSystem.MIN_BUS_VOLTAGE ? (this.resistance[i] * c + ke * this.omega[i]) * c / v : 0.0;
        }
        this.inputCurrent[i] = input;
        this.limited[i] = this.mode[i] !== PowerSystem.FREE;
        this.anyLimited = this.anyLimited || this.limited[i];
        total += input;
      }
      this.batteryCurrent = total;
    } else {
      v = SimMath.clamp(e - rInt * aux, 0.0, e + 0.1 * params.cells);
      for (let i = 0; i < AirframeSpec.MOTORS; i++) {
        this.current[i] = 0.0;
        this.inputCurrent[i] = 0.0;
      }
      this.batteryCurrent = aux;
    }
    this.busVoltage = v;
  }

  static busRoot(a, b, q) {
    if (q === 0.0) {
      return b / a;
    }
    const disc = b * b - 4.0 * a * q;
    return disc >= 0.0 ? (b + Math.sqrt(disc)) / (2.0 * a) : b / (2.0 * a);
  }

  classify(i, duty, v, ke) {
    if (this.reversible) {
      return this.classifyReversible(i, duty, v, ke);
    }
    const params = this.p;
    const r = this.resistance[i];
    const backEmf = ke * this.omega[i];
    const c = (duty * v - backEmf) / r;
    const phaseLimit = params.escCurrentLimit;
    const inLimited = PowerSystem.inputLimitedCurrent(r, backEmf, v, params.escInputLimit);
    const lim = Math.min(phaseLimit, inLimited);
    this.limit[i] = lim;
    if (c > lim) {
      this.current[i] = lim;
      return inLimited < phaseLimit ? PowerSystem.INPUT_LIMIT : PowerSystem.PHASE_LIMIT;
    }
    if (c < -phaseLimit) {
      this.current[i] = -phaseLimit;
      return PowerSystem.PHASE_LIMIT;
    }
    this.current[i] = c;
    return PowerSystem.FREE;
  }

  classifyReversible(i, duty, v, ke) {
    const s = duty < 0.0 || duty === 0.0 && this.omega[i] < 0.0 ? -1.0 : 1.0;
    this.driveSign[i] = s;
    const params = this.p;
    const r = this.resistance[i];
    const backEmf = s * ke * this.omega[i];
    const c = (s * duty * v - backEmf) / r;
    const phaseLimit = params.escCurrentLimit;
    const inLimited = PowerSystem.inputLimitedCurrent(r, backEmf, v, params.escInputLimit);
    const lim = Math.min(phaseLimit, inLimited);
    this.limit[i] = lim;
    if (c > lim) {
      this.current[i] = s * lim;
      return inLimited < phaseLimit ? PowerSystem.INPUT_LIMIT : PowerSystem.PHASE_LIMIT;
    }
    if (c < -phaseLimit) {
      this.current[i] = -s * phaseLimit;
      return PowerSystem.PHASE_LIMIT;
    }
    this.current[i] = s * c;
    return PowerSystem.FREE;
  }

  atHardLimit(i) {
    return this.mode[i] === PowerSystem.PHASE_LIMIT;
  }

  stepRotors(h, lambda, rhoRatio, active) {
    if (this.reversible) {
      this.stepRotorsReversible(h, lambda, rhoRatio, active);
      return;
    }
    const params = this.p;
    const j = params.rotorInertiaEff;
    const kt = params.kt;
    const kq = params.kTorque * rhoRatio;
    const i0 = params.idleCurrent;
    const omegaMax = params.omegaMax;
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      const w = this.omega[i];
      let fq = RotorAero.torqueFactor(lambda[i]) * this.loadScale[i] * this.fluidLoad[i];
      if (this.snagLoad[i] !== 1.0) {
        fq *= this.snagLoad[i];
      }
      const q = kq * fq * w * w;
      let shaft;
      let slope;
      if (active) {
        shaft = kt * (this.current[i] - i0 * SimMath.smoothSign(w));
        let electrical;
        const m = this.mode[i];
        if (m === PowerSystem.FREE) {
          electrical = kt * kt / this.resistance[i];
        } else if (m === PowerSystem.INPUT_LIMIT) {
          const c = this.current[i];
          electrical = kt * kt * c / Math.max(2.0 * this.resistance[i] * c + kt * w, 1e-9);
        } else {
          electrical = 0.0;
        }
        slope = -(electrical + 2.0 * kq * fq * w) / j;
      } else {
        shaft = -kt * i0 * SimMath.smoothSign(w);
        slope = -2.0 * kq * fq * w / j;
      }
      const f = (shaft - q) / j;
      const next = SimMath.clamp(w + h * f / (1.0 - h * slope), 0.0, omegaMax);
      this.airTorque[i] = q;
      this.reactionTorque[i] = q + j * (next - w) / h;
      this.omega[i] = next;
    }
  }

  stepRotorsReversible(h, lambda, rhoRatio, active) {
    const params = this.p;
    const j = params.rotorInertiaEff;
    const kt = params.kt;
    const kq = params.kTorque * rhoRatio;
    const i0 = params.idleCurrent;
    const omegaMax = params.omegaMax;
    const sync = ModelConstants.STARTUP_OMEGA_FRACTION * omegaMax;
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      const w = this.omega[i];
      const aw = Math.abs(w);
      const kqDir = w < 0.0 ? kq * params.reverseTorque : kq;
      let fq = RotorAero.torqueFactor(lambda[i]) * this.loadScale[i] * this.fluidLoad[i];
      if (this.snagLoad[i] !== 1.0) {
        fq *= this.snagLoad[i];
      }
      const q = (w < 0.0 ? -1.0 : 1.0) * kqDir * fq * aw * aw;
      let shaft;
      let slope;
      if (active) {
        const startup = aw < sync ? ModelConstants.STARTUP_TORQUE + (1.0 - ModelConstants.STARTUP_TORQUE) * aw / sync : 1.0;
        shaft = startup * kt * this.current[i] - kt * i0 * SimMath.smoothSign(w);
        let electrical;
        const m = this.mode[i];
        if (m === PowerSystem.FREE) {
          electrical = kt * kt / this.resistance[i];
        } else if (m === PowerSystem.INPUT_LIMIT) {
          const s = this.driveSign[i];
          const c = s * this.current[i];
          electrical = kt * kt * c / Math.max(2.0 * this.resistance[i] * c + kt * s * w, 1e-9);
        } else {
          electrical = 0.0;
        }
        slope = -(startup * electrical + 2.0 * kqDir * fq * aw) / j;
      } else {
        shaft = -kt * i0 * SimMath.smoothSign(w);
        slope = -2.0 * kqDir * fq * aw / j;
      }
      const f = (shaft - q) / j;
      const next = SimMath.clamp(w + h * f / (1.0 - h * slope), -omegaMax, omegaMax);
      this.airTorque[i] = q;
      this.reactionTorque[i] = q + j * (next - w) / h;
      this.omega[i] = next;
    }
  }

  anyReversed() {
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      if (this.omega[i] < 0.0) {
        return true;
      }
    }
    return false;
  }

  // Java overloads:
  //   integrateBattery(double h, boolean infinite)                -> scale 1.0
  //   integrateBattery(double h, boolean infinite, double scale)
  integrateBattery(h, infinite, scale) {
    if (arguments.length === 2) {
      this.integrateBattery(h, infinite, 1.0);
      return;
    }
    this.mAhUsed += this.batteryCurrent * h / 3.6 / scale;
    if (!infinite) {
      this.soc = Math.max(ModelConstants.SOC_MIN, 1.0 - this.mAhUsed / this.p.capacityMah);
    }
    this.fastPolarization += (OperatingPoints.fastResistance(this.p, this.resistanceSoc) * this.batteryResistanceScale * this.batteryCurrent
      - this.fastPolarization) * this.fastCoeff;
    this.polarization += (OperatingPoints.slowResistance(this.p, this.resistanceSoc) * this.batteryCurrent - this.polarization)
      * this.polarizationCoeff;
    this.heatCurrent += (Math.abs(this.batteryCurrent) - this.heatCurrent) * this.heatCoeff;
    this.lastBatteryCurrent = this.batteryCurrent;
    this.lastBusVoltage = this.busVoltage;
    this.integratePack(h, infinite, scale);
  }

  integratePack(h, infinite, scale) {
    const params = this.p;
    const current = EnergyModel.packCurrent(params, this.batteryCurrent, this.busVoltage, this.extraPower, this.fullLoad);
    this.packCurrent = current;
    this.packMah += current * h / 3.6 / scale;
    if (!infinite) {
      this.packSoc = Math.max(ModelConstants.SOC_MIN, 1.0 - this.packMah / params.capacityMah);
    }
  }

  packVoltage(sag) {
    const params = this.p;
    const shift = OperatingPoints.emf(params, PowerSystem.restingSoc(this.soc, sag))
      - OperatingPoints.emf(params, PowerSystem.restingSoc(this.packSoc, sag));
    return Math.max(0.0, this.busVoltage - shift);
  }

  forceBatteryCurrent(amps, h, sag, infinite) {
    const params = this.p;
    this.resistanceSoc = PowerSystem.restingSoc(this.soc, sag);
    const e = OperatingPoints.emf(params, this.resistanceSoc) - this.transientVoltage();
    const rInt = OperatingPoints.internalResistance(params, amps, this.resistanceSoc) * this.batteryResistanceScale;
    this.emf = e;
    this.internalResistance = rInt;
    this.batteryCurrent = amps;
    this.busVoltage = e - rInt * amps;
    this.integrateBattery(h, infinite);
  }
}
