// Port of de.lardtom.propwash.audio.MotorTimbre (record): the build-dependent voice of a drone's motors.
//
// Differences forced by the browser (everything else is 1:1):
// - There is no DroneBuild: derive/of take the AirframeSpec (model/AirframeSpec.js) whose `parts` carry the catalog
//   parts (motor kv / max_current_a / stator_mm, prop diameter_mm / blades, battery cells) and whose fields are what
//   AirframeSpec.of(build) gives the Java (omegaMax, hoverOmega, ducted).
// - BuildAnalysis is not ported, so the two numbers derive reads from it come in as a second argument shaped like the
//   record: { thrustToWeight(), hoverThrottlePercent() } (audio.js computes them like BuildAnalysis.compute does).
//   This keeps this file free of model imports, so the audio worklet can load it.
// - DEFAULT = derive(DroneBuild.FREESTYLE) is stored as the numbers that derivation gives (preset propwash:freestyle,
//   which is DroneBuild.FREESTYLE), since the worklet has no catalog.
// - COMPONENTS (JS only) lists the record components in order, to pass a timbre to the audio worklet as plain values.
// Record components are accessor methods (t.blades(), t.maxRpm(), ...), like the other record ports. Plain doubles.

const RAD_PER_SEC_TO_RPM = 60.0 / (2.0 * Math.PI);
const SMALLEST_PROP_MM = 31.0;
const LARGEST_PROP_MM = 178.0;
const X_CLASS_PROP_MM = 330.0;
const IDLE_FRACTION = 0.075;
const LIPO_FULL_CELL = 4.2;
const CACHE = new WeakMap();

export class MotorTimbre {
  static COMPONENTS = Object.freeze(['blades', 'polePairs', 'idleRpm', 'hoverRpm', 'maxRpm', 'hoverOutput', 'propDiameterM',
    'ducted', 'maxCurrentA', 'sizeClass', 'loudness', 'harmonicTilt', 'rotorGain', 'whineGain', 'noiseGain', 'rumbleGain',
    'ductGain', 'ductHz', 'detuneSpread']);

  constructor(blades, polePairs, idleRpm, hoverRpm, maxRpm, hoverOutput, propDiameterM, ducted, maxCurrentA, sizeClass,
    loudness, harmonicTilt, rotorGain, whineGain, noiseGain, rumbleGain, ductGain, ductHz, detuneSpread) {
    this.blades = () => blades;
    this.polePairs = () => polePairs;
    this.idleRpm = () => idleRpm;
    this.hoverRpm = () => hoverRpm;
    this.maxRpm = () => maxRpm;
    this.hoverOutput = () => hoverOutput;
    this.propDiameterM = () => propDiameterM;
    this.ducted = () => ducted;
    this.maxCurrentA = () => maxCurrentA;
    this.sizeClass = () => sizeClass;
    this.loudness = () => loudness;
    this.harmonicTilt = () => harmonicTilt;
    this.rotorGain = () => rotorGain;
    this.whineGain = () => whineGain;
    this.noiseGain = () => noiseGain;
    this.rumbleGain = () => rumbleGain;
    this.ductGain = () => ductGain;
    this.ductHz = () => ductHz;
    this.detuneSpread = () => detuneSpread;
  }

  /** derive(DroneBuild.FREESTYLE): FREESTYLE_5, STACK_30, M2207_1750, P51_3B, DIGITAL_HD, B6S_1300. */
  static DEFAULT = new MotorTimbre(3, 7, 3803.624999999999, 10509.274724228193, 34283.57070436218, 0.23426346362684355,
    0.13, false, 45, 0.673469387755102, 0.895978047856008, 1.3857142857142857, 0.11734693877551021, 0.18489795918367347,
    0.42204081632653057, 0.45040816326530614, 0.0, 1207.7464788732393, 0.0065);

  /** MotorTimbre.of(build): cached per airframe; null -> DEFAULT, a failing derivation -> DEFAULT. */
  static of(p, analysis) {
    if (p == null) {
      return MotorTimbre.DEFAULT;
    }
    const cached = CACHE.get(p);
    if (cached != null) {
      return cached;
    }
    let derived;
    try {
      derived = MotorTimbre.derive(p, analysis);
    } catch (e) {
      derived = MotorTimbre.DEFAULT;
    }
    CACHE.set(p, derived);
    return derived;
  }

  static derive(p, analysis) {
    const motor = p.parts.motor;
    const prop = p.parts.prop;
    const battery = p.parts.battery;
    const propDiameterMm = prop.data.diameter_mm;
    const propBlades = prop.data.blades;
    let unloadedRpm = motor.data.kv * Math.max(1, battery ? battery.data.cells : p.cells) * LIPO_FULL_CELL;
    let hoverRpm = NaN;
    let thrustToWeight = NaN;
    let hoverOutput = NaN;
    try {
      unloadedRpm = p.omegaMax * RAD_PER_SEC_TO_RPM;
      hoverRpm = p.hoverOmega * RAD_PER_SEC_TO_RPM;
      thrustToWeight = analysis.thrustToWeight();
      hoverOutput = analysis.hoverThrottlePercent() / 100.0;
    } catch (e) {
      hoverRpm = NaN;
    }
    const idleRpm = unloadedRpm * IDLE_FRACTION;
    let maxRpm;
    if (Number.isFinite(hoverRpm) && hoverRpm > idleRpm && Number.isFinite(thrustToWeight) && thrustToWeight > 1.0) {
      maxRpm = Math.min(unloadedRpm * 0.92, hoverRpm * Math.sqrt(thrustToWeight));
    } else {
      maxRpm = unloadedRpm * 0.7;
    }
    if (!Number.isFinite(hoverRpm) || hoverRpm <= idleRpm || hoverRpm >= maxRpm) {
      hoverRpm = idleRpm + 0.4 * (maxRpm - idleRpm);
    }
    if (!Number.isFinite(hoverOutput) || hoverOutput <= 0.02 || hoverOutput >= 0.98) {
      hoverOutput = 0.35;
    }
    let size = MotorTimbre.clamp((propDiameterMm - SMALLEST_PROP_MM) / (LARGEST_PROP_MM - SMALLEST_PROP_MM), 0.0, 1.0);
    const blades = Math.max(1, propBlades);
    const ducted = !!p.ducted;
    let loudness = 0.42 + 0.58 * Math.sqrt(size);
    let tilt = 1.15 + 0.28 * (3 - blades) + 0.35 * size;
    let rotor = 0.05 + 0.10 * size + (blades === 2 ? 0.06 : 0.0);
    let whine = 0.10 + 0.26 * (1.0 - size);
    const noise = 0.22 + 0.30 * size + (ducted ? 0.08 : 0.0);
    let rumble = 0.08 + 0.55 * size;
    const duct = ducted ? 0.30 : 0.0;
    const propDiameterMeters = propDiameterMm / 1000.0;
    const ductHz = MotorTimbre.clamp(343.0 / (2.0 * (propDiameterMeters + 0.012)), 800.0, 7000.0);
    const big = MotorTimbre.clamp((propDiameterMm - LARGEST_PROP_MM) / (X_CLASS_PROP_MM - LARGEST_PROP_MM), 0.0, 1.0);
    if (big > 0.0) {
      size += big;
      loudness += 0.25 * big;
      tilt += 0.35 * big;
      rotor += 0.04 * big;
      whine *= 1.0 - 0.5 * big;
      rumble += 0.35 * big;
    }
    return new MotorTimbre(blades, MotorTimbre.polePairs(motor), idleRpm, hoverRpm, maxRpm, hoverOutput, propDiameterMeters,
      ducted, Math.max(1.0, motor.data.max_current_a), size, loudness, tilt, rotor, whine, noise, rumble, duct, ductHz, 0.0065);
  }

  /** polePairs(MotorType): 7 pole pairs (12N14P) from an 18 mm stator up, else 6. `motor` is the catalog motor part. */
  static polePairs(motor) {
    return motor.data.stator_mm[0] >= 18.0 ? 7 : 6;
  }

  rpmForOutput(output) {
    const o = Number.isFinite(output) ? MotorTimbre.clamp(output, 0.0, 1.0) : 0.0;
    const hoverOutput = this.hoverOutput();
    const idleRpm = this.idleRpm();
    const hoverRpm = this.hoverRpm();
    if (o <= hoverOutput) {
      return idleRpm + (hoverRpm - idleRpm) * (o / hoverOutput);
    }
    return hoverRpm + (this.maxRpm() - hoverRpm) * ((o - hoverOutput) / (1.0 - hoverOutput));
  }

  bladePassHz(rpm) {
    return rpm / 60.0 * this.blades();
  }

  static clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }
}
