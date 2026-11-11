// Port of de.lardtom.propwash.sim.EnergyModel (1:1).
// - FrameRole is the lower-case role string of the configurator ('whoop', 'toothpick', 'cinewhoop', 'freestyle', 'race',
//   'long_range', 'cinelifter', 'x_class'); the Java switches are exhaustive, an unknown role throws like a Java null.
// - VideoType (videoSupplyW / standbyW / videoPower) is the configurator catalog video part: definition().powerW() ->
//   video.data.power_w (a number when present), vtxPowerMw() -> video.data.vtx_power_mw, link() == DIGITAL ->
//   video.data.link === 'digital', massGrams() -> video.basics.mass_g (as in analysis.js).
// - Nested types: Profile (enum), Mix / Flight / Heat (records: accessor methods cruise(), minutes(), ...), Points
//   (class) are exported and attached as statics.
// - StrictMath.exp/pow are the fdlibm port (StrictMath.js); StrictMath.log/sin of the prop tables and the cruise point
//   (analysis only, not used in flight) stay Math.log/sin, which may differ in the last bit.
import { AirframeSpec } from './AirframeSpec.js?v=d12a0862';
import { javaEnum } from './Enum.js?v=d8aa4520';
import { ModelConstants } from './ModelConstants.js?v=760466ce';
import { OperatingPoints } from './OperatingPoints.js?v=047f5bd2';
import { RotorAero } from './RotorAero.js?v=22dc31b6';
import { SimMath } from './SimMath.js?v=44da8aea';
import { StrictMath } from './StrictMath.js?v=e765e983';
import { Thermal } from './Thermal.js?v=4b9beec5';

export const Profile = javaEnum(['HOVER', 'CRUISE', 'MIXED', 'AGGRESSIVE']);

/** record Mix(double cruise, double punch, double idle, double punchThrust) */
export class Mix {
  constructor(cruise, punch, idle, punchThrust) {
    this.cruise = () => cruise;
    this.punch = () => punch;
    this.idle = () => idle;
    this.punchThrust = () => punchThrust;
    Object.freeze(this);
  }

  toString() {
    return `Mix[cruise=${this.cruise()}, punch=${this.punch()}, idle=${this.idle()}, punchThrust=${this.punchThrust()}]`;
  }
}

/** record Flight(double minutes, double averageCurrent, double landingCellVoltage, double motorTempC) */
export class Flight {
  constructor(minutes, averageCurrent, landingCellVoltage, motorTempC) {
    this.minutes = () => minutes;
    this.averageCurrent = () => averageCurrent;
    this.landingCellVoltage = () => landingCellVoltage;
    this.motorTempC = () => motorTempC;
    Object.freeze(this);
  }

  toString() {
    return `Flight[minutes=${this.minutes()}, averageCurrent=${this.averageCurrent()}, `
      + `landingCellVoltage=${this.landingCellVoltage()}, motorTempC=${this.motorTempC()}]`;
  }
}
Flight.NONE = new Flight(NaN, NaN, NaN, NaN);

/** record Heat(double minute, double sustained, double escSustained) */
export class Heat {
  constructor(minute, sustained, escSustained) {
    this.minute = () => minute;
    this.sustained = () => sustained;
    this.escSustained = () => escSustained;
    Object.freeze(this);
  }

  toString() {
    return `Heat[minute=${this.minute()}, sustained=${this.sustained()}, escSustained=${this.escSustained()}]`;
  }
}

export class EnergyModel {
  static AVIONICS_BASE_W = 0.6;
  static DRIVE_LOSS_W = 1.03;
  static DRIVE_LOSS_MASS_EXP = 0.5;
  static DRIVE_LOSS_SPEED_EXP = 1.0;
  static ANALOG_BASE_W = 1.2;
  static ANALOG_PER_RF_W = 4.3;
  static DIGITAL_BASE_W = 4.5;
  static DIGITAL_PER_GRAM_W = 0.1;
  static DIGITAL_PER_RF_W = 2.5;
  static DEFAULT_RF_MW = 200;
  static LOW_RATE_USABLE = 0.87;
  static LOW_RATE_PRACTICAL_C = 6.0;
  static PUNCH_STEPS = 24;
  static SEGMENTS = 24;
  static IDLE_SOC = 0.5;
  static MINUTE_S = 60.0;
  static HEAT_STEPS = 40;
  static PROP_SIZE_MM = Float64Array.of(31.0, 51.0, 76.0, 89.0, 102.0, 130.0, 178.0, 254.0, 330.0);
  static PROP_SIZE_FACTOR = Float64Array.of(0.84, 0.78, 0.72, 0.67, 0.80, 1.02, 1.0, 0.93, 0.93);
  static PROP_FULL_FACTOR = Float64Array.of(0.84, 1.05, 1.0, 1.0, 1.0, 1.02, 1.0, 0.93, 0.93);
  static BLADE_LOSS = 0.38;
  static BLADE_INTERFERENCE_MM = 45.0;
  static BLADE_INTERFERENCE_FADE_MM = 10.0;
  static WHOOP_SMALL_PROP_M = 0.035;

  static Profile = Profile;
  static Mix = Mix;
  static Flight = Flight;
  static Heat = Heat;
  // static Points: attached below the Points class

  static mix(p, profile) {
    const aggressive = profile === Profile.AGGRESSIVE;
    switch (p.role) {
      case 'whoop':
        return p.propDiameter <= EnergyModel.WHOOP_SMALL_PROP_M
          ? aggressive ? new Mix(0.46, 0.49, 0.05, 5.0) : new Mix(0.44, 0.37, 0.19, 5.0)
          : aggressive ? new Mix(0.50, 0.40, 0.10, 3.0) : new Mix(0.75, 0.20, 0.05, 3.0);
      case 'toothpick':
        return aggressive ? new Mix(0.65, 0.23, 0.12, 4.5) : new Mix(0.80, 0.12, 0.08, 4.0);
      case 'cinewhoop':
      case 'cinelifter':
        return aggressive ? new Mix(0.75, 0.17, 0.08, 3.5) : new Mix(0.83, 0.12, 0.05, 2.5);
      case 'freestyle':
        return aggressive ? new Mix(0.72, 0.14, 0.14, 7.0) : new Mix(0.80, 0.10, 0.10, 5.5);
      case 'race':
        return aggressive ? new Mix(0.50, 0.38, 0.12, 7.0) : new Mix(0.58, 0.30, 0.12, 6.5);
      case 'long_range':
        return aggressive ? new Mix(0.58, 0.32, 0.10, 5.0) : new Mix(0.66, 0.26, 0.08, 3.8);
      case 'x_class':
        return aggressive ? new Mix(0.45, 0.45, 0.10, 5.0) : new Mix(0.58, 0.34, 0.08, 4.2);
      default:
        throw new Error(`Unknown FrameRole ${p.role}`);
    }
  }

  static cruiseTopFraction(role) {
    switch (role) {
      case 'whoop':
      case 'long_range':
        return 0.55;
      case 'cinewhoop':
      case 'cinelifter':
      case 'x_class':
        return 0.5;
      case 'toothpick':
        return 0.45;
      case 'freestyle':
      case 'race':
        return 0.4;
      default:
        throw new Error(`Unknown FrameRole ${role}`);
    }
  }

  static cruiseSpeed(role) {
    switch (role) {
      case 'whoop':
        return 18.5 / 3.6;
      case 'toothpick':
        return 40.0 / 3.6;
      case 'cinewhoop':
      case 'cinelifter':
        return 30.0 / 3.6;
      case 'freestyle':
        return 55.0 / 3.6;
      case 'race':
        return 60.0 / 3.6;
      case 'long_range':
        return 63.0 / 3.6;
      case 'x_class':
        return 65.0 / 3.6;
      default:
        throw new Error(`Unknown FrameRole ${role}`);
    }
  }

  static videoSupplyW(video) {
    return EnergyModel.videoPower(video);
  }

  static standbyW(video) {
    return EnergyModel.AVIONICS_BASE_W + EnergyModel.videoPower(video);
  }

  static videoPower(video) {
    const d = video.data;
    if (typeof d.power_w === 'number') {
      return d.power_w;
    }
    const rf = (d.vtx_power_mw > 0 ? d.vtx_power_mw : EnergyModel.DEFAULT_RF_MW) / 1000.0;
    if (d.link === 'digital') {
      return EnergyModel.DIGITAL_BASE_W + EnergyModel.DIGITAL_PER_GRAM_W * video.basics.mass_g + EnergyModel.DIGITAL_PER_RF_W * rf;
    }
    return EnergyModel.ANALOG_BASE_W + EnergyModel.ANALOG_PER_RF_W * rf;
  }

  static sizeFactor(diameterMm) {
    return EnergyModel.interpolate(EnergyModel.PROP_SIZE_FACTOR, diameterMm);
  }

  static interpolate(table, diameterMm) {
    const d = EnergyModel.PROP_SIZE_MM;
    if (diameterMm <= d[0]) {
      return table[0];
    }
    for (let i = 1; i < d.length; i++) {
      if (diameterMm <= d[i]) {
        const t = Math.log(diameterMm / d[i - 1]) / Math.log(d[i] / d[i - 1]);
        return table[i - 1] + (table[i] - table[i - 1]) * t;
      }
    }
    return table[table.length - 1];
  }

  static bladeLoss(blades, diameterMm) {
    const small = SimMath.clamp01((EnergyModel.BLADE_INTERFERENCE_MM - diameterMm) / EnergyModel.BLADE_INTERFERENCE_FADE_MM);
    return EnergyModel.BLADE_LOSS * Math.max(0, blades - 3) * small;
  }

  static propFactor(diameterMm) {
    return EnergyModel.sizeFactor(diameterMm);
  }

  static propFullFactor(diameterMm) {
    return EnergyModel.interpolate(EnergyModel.PROP_FULL_FACTOR, diameterMm);
  }

  // Java overloads:
  //   fullLoad(AirframeSpec p, double omega)
  //   fullLoad(AirframeSpec p, double[] omega, boolean active)
  static fullLoad(p, omega, active) {
    if (arguments.length === 3) {
      if (!active) {
        return 0.0;
      }
      let sum = 0.0;
      for (let i = 0; i < AirframeSpec.MOTORS; i++) {
        sum += EnergyModel.fullLoad(p, omega[i]);
      }
      return sum / AirframeSpec.MOTORS;
    }
    const hover = p.hoverOmega * p.hoverOmega;
    const span = p.fullLoadOmega * p.fullLoadOmega - hover;
    if (!(span > 0.0)) {
      return Math.abs(omega) >= p.fullLoadOmega ? 1.0 : 0.0;
    }
    const x = SimMath.clamp01((omega * omega - hover) / span);
    return x * x;
  }

  static loadFactor(p, fullLoad) {
    return p.propFactor + (p.propFullFactor - p.propFactor) * fullLoad;
  }

  static driveLossAtHover(motorGrams, blades, diameterMm, shaftPowerHover) {
    return EnergyModel.DRIVE_LOSS_W * StrictMath.pow(Math.max(motorGrams, 0.1), EnergyModel.DRIVE_LOSS_MASS_EXP)
      + EnergyModel.bladeLoss(blades, diameterMm) * shaftPowerHover;
  }

  static driveLoss(p, omega) {
    const w = Math.abs(omega);
    if (!(w > 0.0)) {
      return 0.0;
    }
    return p.driveLossHover * StrictMath.pow(w / p.hoverOmega, EnergyModel.DRIVE_LOSS_SPEED_EXP);
  }

  static extraPower(p, omega, active) {
    let sum = p.avionicsPower - p.auxPower;
    if (active) {
      for (let i = 0; i < AirframeSpec.MOTORS; i++) {
        sum += EnergyModel.driveLoss(p, omega[i]);
      }
    }
    return sum;
  }

  static uniformExtraPower(p, omega) {
    return p.avionicsPower - p.auxPower + AirframeSpec.MOTORS * EnergyModel.driveLoss(p, omega);
  }

  // Java overloads:
  //   packCurrent(AirframeSpec p, double batteryCurrent, double busVoltage, double extraPower, double fullLoad)
  //   packCurrent(AirframeSpec p, OperatingPoints.Point pt)
  static packCurrent(p, batteryCurrent, busVoltage, extraPower, fullLoad) {
    if (arguments.length === 2) {
      const pt = batteryCurrent;
      return EnergyModel.packCurrent(p, pt.batteryCurrent, pt.busVoltage, EnergyModel.uniformExtraPower(p, pt.omega),
        EnergyModel.fullLoad(p, pt.omega));
    }
    const v = Math.max(busVoltage, 0.05 * p.fullPackVoltage);
    const motors = Math.max(0.0, batteryCurrent - p.auxPower / v);
    return Math.max(0.0, batteryCurrent + (EnergyModel.loadFactor(p, fullLoad) - 1.0) * motors + extraPower / v);
  }

  static loadedVoltage(p, soc, current) {
    const r = OperatingPoints.dcResistance(p, current, soc);
    return OperatingPoints.emf(p, soc) - r * current;
  }

  static motorHeat(p, pt) {
    return Thermal.motorLoss(p, pt.phaseCurrent, pt.omega, p.motorResistance);
  }

  static fly(pts, profile, ambient) {
    const p = pts.p;
    const capacity = p.capacityMah;
    const usable = p.usableFraction * capacity;
    const step = usable / EnergyModel.SEGMENTS;
    const landing = p.landingCellVoltage * p.cells;
    const cutoff = p.chemistry.cutoffCellVoltage * p.cells;
    let seconds = 0.0;
    let used = 0.0;
    let landed = NaN;
    let temp = ambient;
    const cooling = pts.cooling(profile);
    for (let k = 0; k < EnergyModel.SEGMENTS; k++) {
      const start = 1.0 - used / capacity;
      const end = 1.0 - (used + step) / capacity;
      pts.evaluate(profile, 0.5 * (start + end));
      const current = Math.max(pts.pack, 1e-6);
      const part = Math.min(
        EnergyModel.reach(EnergyModel.loadedVoltage(p, start, pts.calm), EnergyModel.loadedVoltage(p, end, pts.calm), landing),
        EnergyModel.reach(EnergyModel.loadedVoltage(p, start, pts.motion), EnergyModel.loadedVoltage(p, end, pts.motion), cutoff));
      const dt = part * step * 3.6 / current;
      const inf = ambient + pts.heat / cooling;
      temp = inf + (temp - inf) * StrictMath.exp(-dt * cooling / p.motorHeatCapacity);
      seconds += dt;
      used += part * step;
      landed = EnergyModel.loadedVoltage(p, 1.0 - used / capacity, pts.motion);
      if (part < 1.0) {
        break;
      }
    }
    if (Number.isNaN(landed)) {
      return Flight.NONE;
    }
    if (!(seconds > 0.0)) {
      return new Flight(0.0, pts.pack, landed / p.cells, ambient);
    }
    return new Flight(seconds / EnergyModel.MINUTE_S, used * 3.6 / seconds, landed / p.cells, temp);
  }

  static reach(start, end, limit) {
    if (end >= limit) {
      return 1.0;
    }
    if (start <= limit) {
      return 0.0;
    }
    return SimMath.clamp01((start - limit) / Math.max(start - end, 1e-9));
  }

  static fullThrottleMotorTemp(p, ambient, windowSeconds) {
    const pt = new OperatingPoints.Point();
    const capacity = p.capacityMah;
    let temp = ambient;
    let max = ambient;
    let esc = ambient;
    let escMax = ambient;
    const escC = Thermal.escHeatCapacity(p);
    let minute = NaN;
    let seconds = 0.0;
    const step = capacity / EnergyModel.HEAT_STEPS;
    for (let k = 0; k < EnergyModel.HEAT_STEPS; k++) {
      const soc = 1.0 - (k + 0.5) / EnergyModel.HEAT_STEPS;
      OperatingPoints.uniformDuty(p, 1.0, soc, true, 0.0, 0.0, pt);
      const current = Math.max(EnergyModel.packCurrent(p, pt), 1e-3);
      const dt = step * 3.6 / current;
      const power = EnergyModel.motorHeat(p, pt);
      const g = Thermal.motorCooling(p, pt.omega);
      const inf = ambient + power / g;
      if (Number.isNaN(minute) && seconds + dt >= windowSeconds) {
        const partial = inf + (temp - inf) * StrictMath.exp(-(windowSeconds - seconds) * g / p.motorHeatCapacity);
        minute = Math.max(max, partial);
      }
      temp = inf + (temp - inf) * StrictMath.exp(-dt * g / p.motorHeatCapacity);
      const ge = Thermal.escCooling(p, pt.omega);
      const infE = ambient + Thermal.escLoss(p, pt.phaseCurrent, pt.busVoltage) / ge;
      esc = infE + (esc - infE) * StrictMath.exp(-dt * ge / escC);
      if (!Number.isFinite(temp + esc)) {
        return new Heat(NaN, NaN, NaN);
      }
      max = Math.max(max, temp);
      escMax = Math.max(escMax, esc);
      seconds += dt;
    }
    return new Heat(Number.isNaN(minute) ? max : minute, max, escMax);
  }
}

/** EnergyModel.Points */
export class Points {
  p;
  cruiseOmega;
  cruiseCurrent;
  cruiseSpeed;
  scratch = new OperatingPoints.Point();
  pack = 0.0;
  motion = 0.0;
  calm = 0.0;
  heat = 0.0;
  escHeat = 0.0;
  idlePack = NaN;
  idleMotion = 0.0;
  idleHeat = 0.0;
  idleEscHeat = 0.0;

  constructor(p, topSpeed, topTilt) {
    this.p = p;
    if (topSpeed > 0.0 && topTilt > 0.0) {
      const target = Math.min(EnergyModel.cruiseSpeed(p.role), EnergyModel.cruiseTopFraction(p.role) * topSpeed);
      const tilt = OperatingPoints.tiltForSpeed(p, target, topTilt);
      const speed = OperatingPoints.speedAtTilt(p, tilt);
      const omega = OperatingPoints.levelFlightOmega(p, speed, tilt);
      this.cruiseOmega = omega;
      this.cruiseCurrent = RotorAero.airTorque(p, omega, speed * Math.sin(tilt), 1.0) / p.kt + p.idleCurrent;
      this.cruiseSpeed = speed;
    } else {
      this.cruiseOmega = p.hoverOmega;
      this.cruiseCurrent = OperatingPoints.hoverCurrent(p);
      this.cruiseSpeed = 0.0;
    }
  }

  hover(soc) {
    OperatingPoints.hover(this.p, soc, true, 0.0, true, this.scratch);
    return EnergyModel.packCurrent(this.p, this.scratch);
  }

  cruise(soc) {
    OperatingPoints.steadyMotor(this.p, this.cruiseOmega, this.cruiseCurrent, soc, true, 0.0, true, this.scratch);
    return EnergyModel.packCurrent(this.p, this.scratch);
  }

  full(soc) {
    OperatingPoints.uniformDuty(this.p, 1.0, soc, true, 0.0, 0.0, this.scratch);
    return EnergyModel.packCurrent(this.p, this.scratch);
  }

  punchPoint(thrustToWeight, soc) {
    const thrust = thrustToWeight * this.p.massKg * ModelConstants.G / AirframeSpec.MOTORS;
    const omega = OperatingPoints.omegaForThrust(this.p, thrust, 0.0, 0.0);
    const current = RotorAero.airTorque(this.p, omega, 0.0, 1.0) / this.p.kt + this.p.idleCurrent;
    OperatingPoints.steadyMotor(this.p, omega, current, soc, true, 0.0, true, this.scratch);
    if (!this.scratch.feasible) {
      OperatingPoints.uniformDuty(this.p, 1.0, soc, true, 0.0, 0.0, this.scratch);
    }
  }

  punchLimit(profile) {
    if (profile === Profile.MIXED) {
      return Math.min(this.p.continuousCurrent, EnergyModel.LOW_RATE_PRACTICAL_C * this.p.capacityMah / 1000.0);
    }
    return this.p.continuousCurrent;
  }

  punch(thrustToWeight, soc, profile) {
    this.punchPoint(thrustToWeight, soc);
    const current = EnergyModel.packCurrent(this.p, this.scratch);
    const limit = this.punchLimit(profile);
    if (this.p.usableFraction < EnergyModel.LOW_RATE_USABLE || current <= limit) {
      return current;
    }
    let lo = 1.0;
    let hi = thrustToWeight;
    for (let k = 0; k < EnergyModel.PUNCH_STEPS; k++) {
      const mid = 0.5 * (lo + hi);
      this.punchPoint(mid, soc);
      if (EnergyModel.packCurrent(this.p, this.scratch) > limit) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    this.punchPoint(lo, soc);
    return EnergyModel.packCurrent(this.p, this.scratch);
  }

  idle(soc) {
    OperatingPoints.uniformDuty(this.p, ModelConstants.IDLE_REFERENCE, soc, true, 0.0, 0.0, this.scratch);
    return EnergyModel.packCurrent(this.p, this.scratch);
  }

  add(weight, packCurrent) {
    this.pack += weight * packCurrent;
    this.motion += weight * this.scratch.batteryCurrent;
    this.heat += weight * EnergyModel.motorHeat(this.p, this.scratch);
    this.escHeat += weight * Thermal.escLoss(this.p, this.scratch.phaseCurrent, this.scratch.busVoltage);
  }

  evaluate(profile, soc) {
    this.single(profile, soc);
    if (profile === Profile.HOVER) {
      return;
    }
    const pack = this.pack;
    const motion = this.motion;
    const calm = this.calm;
    const heat = this.heat;
    const escHeat = this.escHeat;
    this.evaluate(Profile.values()[profile.ordinal - 1], soc);
    this.pack = Math.max(pack, this.pack);
    this.motion = Math.max(motion, this.motion);
    this.calm = Math.max(calm, this.calm);
    this.heat = Math.max(heat, this.heat);
    this.escHeat = Math.max(escHeat, this.escHeat);
  }

  single(profile, soc) {
    this.pack = 0.0;
    this.motion = 0.0;
    this.heat = 0.0;
    this.escHeat = 0.0;
    switch (profile) {
      case Profile.HOVER: {
        this.add(1.0, this.hover(soc));
        this.calm = this.scratch.batteryCurrent;
        break;
      }
      case Profile.CRUISE: {
        this.add(1.0, this.cruise(soc));
        this.calm = this.scratch.batteryCurrent;
        break;
      }
      default: {
        const m = EnergyModel.mix(this.p, profile);
        if (m.cruise() > 0.0) {
          this.add(m.cruise(), this.cruise(soc));
        }
        this.calm = this.scratch.batteryCurrent;
        if (m.punch() > 0.0) {
          this.add(m.punch(), this.punch(m.punchThrust(), soc, profile));
        }
        if (m.idle() > 0.0) {
          if (Number.isNaN(this.idlePack)) {
            this.idlePack = this.idle(EnergyModel.IDLE_SOC);
            this.idleMotion = this.scratch.batteryCurrent;
            this.idleHeat = EnergyModel.motorHeat(this.p, this.scratch);
            this.idleEscHeat = Thermal.escLoss(this.p, this.scratch.phaseCurrent, this.scratch.busVoltage);
          }
          this.pack += m.idle() * this.idlePack;
          this.motion += m.idle() * this.idleMotion;
          this.heat += m.idle() * this.idleHeat;
          this.escHeat += m.idle() * this.idleEscHeat;
        }
      }
    }
  }

  cooling(profile) {
    let omega;
    switch (profile) {
      case Profile.HOVER:
        omega = this.p.hoverOmega;
        break;
      case Profile.CRUISE:
        omega = this.cruiseOmega;
        break;
      case Profile.MIXED:
      case Profile.AGGRESSIVE: {
        const m = EnergyModel.mix(this.p, profile);
        omega = m.cruise() * this.cruiseOmega + (1.0 - m.cruise()) * this.p.hoverOmega;
        break;
      }
      default:
        throw new Error(`Unknown Profile ${profile}`);
    }
    const speed = profile === Profile.HOVER ? 0.0 : this.cruiseSpeed;
    return Thermal.motorCooling(this.p, omega) * Thermal.airflow(speed);
  }
}
EnergyModel.Points = Points;
