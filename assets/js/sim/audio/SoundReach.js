// Port of de.lardtom.propwash.audio.SoundReach (record): how loud a build is and how far it carries (blocks = metres).
//
// Differences forced by the browser (everything else is 1:1): of/derive take the AirframeSpec instead of the DroneBuild,
// plus the build's MotorTimbre (MotorTimbre.of needs the BuildAnalysis numbers, which audio.js supplies). Record
// components are accessor methods (r.levelDb(), r.hoverRangeBlocks(), ...); the static levelDb(power, mach) lives on the
// class, the accessor on the instance, as in Java. Plain doubles.

// AirframeSpec.MOTORS (not imported, to keep the worklet's module graph free of the flight model)
const AIRFRAME_MOTORS = 4;
const SPEED_OF_SOUND = 343.0;
const ABSORPTION_8K_DB_PER_M = 0.117;
const ABSORPTION_SLOPE = 1.8;
const CUTOFF_DROP_DB = 3.0;
const MIN_AMPLITUDE = 1.0e-4;
const CACHE = new WeakMap();

export class SoundReach {
  static REFERENCE_LEVEL_DB = 80.0;
  static REFERENCE_POWER_W = 60.0;
  static REFERENCE_TIP_MACH = 0.21;
  static REFERENCE_PROP_MM = 130.0;
  static MACH_EXPONENT = 3.0;
  static SIZE_SLOPE_DB = 18.0;
  static ROTOR_SHARE = 0.5;
  static ROTOR_BAND_DB = 1.0;
  static THRESHOLD_DB = 43.0;
  static NEAR_BLOCKS = 3.0;
  static FADE_START = 0.5;
  static THROTTLE_EXPONENT = 0.5;
  static MIN_RANGE_BLOCKS = 4.0;
  static MAX_RANGE_BLOCKS = 160.0;
  static CLOSE_CUTOFF_HZ = 14_000.0;
  static FAR_CUTOFF_HZ = 1_800.0;

  constructor(shaftPowerW, tipMach, propDiameterMm, rotorLevelDb, levelDb, hoverRangeBlocks, hoverAmplitude) {
    this.shaftPowerW = () => shaftPowerW;
    this.tipMach = () => tipMach;
    this.propDiameterMm = () => propDiameterMm;
    this.rotorLevelDb = () => rotorLevelDb;
    this.levelDb = () => levelDb;
    this.hoverRangeBlocks = () => hoverRangeBlocks;
    this.hoverAmplitude = () => hoverAmplitude;
  }

  static REFERENCE = SoundReach.fromRotor(SoundReach.REFERENCE_POWER_W, SoundReach.REFERENCE_TIP_MACH,
    SoundReach.REFERENCE_PROP_MM, SoundReach.amplitude(10_500.0, 34_000.0, 0.23));

  /** SoundReach.of(build): cached per airframe; null -> REFERENCE, a failing derivation -> REFERENCE. */
  static of(p, timbre) {
    if (p == null) {
      return SoundReach.REFERENCE;
    }
    const cached = CACHE.get(p);
    if (cached != null) {
      return cached;
    }
    let derived;
    try {
      derived = SoundReach.derive(p, timbre);
    } catch (e) {
      derived = SoundReach.REFERENCE;
    }
    CACHE.set(p, derived);
    return derived;
  }

  static derive(p, timbre) {
    const spec = p;
    const omega = spec.hoverOmega;
    const power = AIRFRAME_MOTORS * spec.kTorque * omega * omega * omega;
    const mach = omega * spec.propRadius / SPEED_OF_SOUND;
    if (!Number.isFinite(power) || power <= 0.0 || !Number.isFinite(mach) || mach <= 0.0) {
      return SoundReach.REFERENCE;
    }
    const hoverAmplitude = SoundReach.amplitude(timbre.hoverRpm(), timbre.maxRpm(), timbre.hoverOutput());
    return SoundReach.fromRotor(power, mach, spec.propDiameter * 1000.0, hoverAmplitude);
  }

  static fromRotor(shaftPowerW, tipMach, propDiameterMm, hoverAmplitude) {
    const rotor = SoundReach.levelDb(shaftPowerW, tipMach);
    const diameter = Number.isFinite(propDiameterMm) && propDiameterMm > 1.0 ? propDiameterMm : SoundReach.REFERENCE_PROP_MM;
    const level = SoundReach.sizedLevelDb(rotor, diameter);
    const amplitude = Number.isFinite(hoverAmplitude) && hoverAmplitude > MIN_AMPLITUDE ? hoverAmplitude : MIN_AMPLITUDE;
    return new SoundReach(shaftPowerW, tipMach, diameter, rotor, level, SoundReach.rangeForLevel(level), amplitude);
  }

  static sizeLevelDb(propDiameterMm) {
    const diameter = Number.isFinite(propDiameterMm) && propDiameterMm > 1.0 ? propDiameterMm : SoundReach.REFERENCE_PROP_MM;
    return SoundReach.REFERENCE_LEVEL_DB + SoundReach.SIZE_SLOPE_DB * Math.log10(diameter / SoundReach.REFERENCE_PROP_MM);
  }

  static sizedLevelDb(rotorLevelDb, propDiameterMm) {
    const size = SoundReach.sizeLevelDb(propDiameterMm);
    const rotor = Number.isFinite(rotorLevelDb) ? rotorLevelDb : size;
    return size + SoundReach.clamp(SoundReach.ROTOR_SHARE * (rotor - size), -SoundReach.ROTOR_BAND_DB, SoundReach.ROTOR_BAND_DB);
  }

  static levelDb(shaftPowerW, tipMach) {
    const power = Number.isFinite(shaftPowerW) && shaftPowerW > 1.0e-6 ? shaftPowerW : 1.0e-6;
    const mach = Number.isFinite(tipMach) && tipMach > 1.0e-4 ? tipMach : 1.0e-4;
    return SoundReach.REFERENCE_LEVEL_DB + 10.0 * Math.log10(power / SoundReach.REFERENCE_POWER_W)
      + 10.0 * SoundReach.MACH_EXPONENT * Math.log10(mach / SoundReach.REFERENCE_TIP_MACH);
  }

  static levelAt(levelDb, distance) {
    return levelDb - 20.0 * Math.log10(Math.max(1.0, distance));
  }

  static rangeForLevel(levelDb) {
    return Math.pow(10.0, (levelDb - SoundReach.THRESHOLD_DB) / 20.0);
  }

  rangeBlocks(amplitude) {
    const a = Number.isFinite(amplitude) && amplitude > 0.0 ? amplitude : 0.0;
    const scaled = this.hoverRangeBlocks() * Math.pow(a / this.hoverAmplitude(), SoundReach.THROTTLE_EXPONENT);
    return SoundReach.clamp(scaled, SoundReach.MIN_RANGE_BLOCKS, SoundReach.MAX_RANGE_BLOCKS);
  }

  hoverRange() {
    return SoundReach.clamp(this.hoverRangeBlocks(), SoundReach.MIN_RANGE_BLOCKS, SoundReach.MAX_RANGE_BLOCKS);
  }

  static amplitude(rpm, maxRpm, load) {
    const fraction = Number.isFinite(rpm) && rpm > 0.0 ? Math.min(1.0, rpm / Math.max(1000.0, maxRpm)) : 0.0;
    const l = Number.isFinite(load) ? SoundReach.clamp(load, 0.0, 1.0) : 0.0;
    return Math.pow(fraction, 0.6) * (0.6 + 0.4 * l);
  }

  static attenuation(distance, range) {
    if (!Number.isFinite(distance) || !Number.isFinite(range) || range <= 0.0) {
      return 0.0;
    }
    const d = Math.max(0.0, distance);
    if (d >= range) {
      return 0.0;
    }
    const near = d <= SoundReach.NEAR_BLOCKS ? 1.0 : SoundReach.NEAR_BLOCKS / d;
    const x = d / range;
    if (x <= SoundReach.FADE_START) {
      return near;
    }
    const t = (x - SoundReach.FADE_START) / (1.0 - SoundReach.FADE_START);
    return near * (1.0 - t * t * (3.0 - 2.0 * t));
  }

  static airCutoffHz(distance) {
    if (!Number.isFinite(distance) || distance <= 1.0) {
      return SoundReach.CLOSE_CUTOFF_HZ;
    }
    const ratio = CUTOFF_DROP_DB / (ABSORPTION_8K_DB_PER_M * distance);
    return SoundReach.clamp(8_000.0 * Math.pow(ratio, 1.0 / ABSORPTION_SLOPE), SoundReach.FAR_CUTOFF_HZ, SoundReach.CLOSE_CUTOFF_HZ);
  }

  static clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }
}
