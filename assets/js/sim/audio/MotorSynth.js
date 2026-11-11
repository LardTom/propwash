// Port of de.lardtom.propwash.audio.MotorSynth (1:1): the procedural motor voice of one drone (4 rotors: blade-pass
// harmonics, rotor tone, electrical whine, band-passed air noise chopped by the blades, duct resonance, prop-wash rumble,
// onboard wind, crash thump; then air absorption low-pass, DC blocker, master fade and soft clip).
//
// Numbers: plain doubles where the Java uses float (the extra precision is inaudible; renders stay within float rounding
// of the Java). The xorshift noise is the Java int arithmetic exactly (Math.imul / | 0 / >>>), and white() rounds the
// int to float like the Java, so the noise sequence of a seed is bit-identical.
//
// Browser extension: an optional 4th constructor argument `sampleRate` (default SAMPLE_RATE = 48000, the mod's rate).
// The Java bakes 48 kHz into INV_RATE, HISS_COEFFICIENT and the filters; here those are per instance (invRate,
// hissCoefficient, sampleRate) so the synth still sounds the same if the browser's AudioContext runs at 44.1 kHz.
// The static INV_RATE / HISS_COEFFICIENT keep the Java's 48 kHz values.
// Fields whose Java name equals an accessor (timbre, peak, framesRendered) are stored as _name.

import { MotorControl } from './MotorControl.js?v=e5eb5688';
import { MotorTimbre } from './MotorTimbre.js?v=d8807f99';
import { StateVariableFilter } from './StateVariableFilter.js?v=58678239';
import { SynthMath } from './SynthMath.js?v=8d5555d8';

const SAMPLE_RATE = 48_000;
const MOTORS = MotorControl.MOTORS;
const MAX_HARMONICS = 8;
const BLOCK = 32;
const HARMONIC_CEILING_HZ = 16_500.0;
const HARMONIC_FADE_HZ = 4_500.0;
const MOTOR_MIX = 0.17;
const CHOP_DEPTH = 0.45;
const RUMBLE_SCALE = 9.0;
const IMPULSE_THUMP_HZ = 85.0;
const WANDER_DEPTH = 0.0025;
const WIND_GAIN = 0.55;
const ROTOR_MODULATION = 0.16;
const OUTSIDE_WASH_RUMBLE = 0.25;
const OUTPUT_GAIN = 2.0;
const ANTI_DENORMAL = 1.0e-18;
const WHITE_SCALE = 1.0 / 2_147_483_648.0;

export class MotorSynth {
  static SAMPLE_RATE = SAMPLE_RATE;
  static MOTORS = MOTORS;
  static MAX_HARMONICS = MAX_HARMONICS;
  static BLOCK = BLOCK;
  static INV_RATE = 1.0 / SAMPLE_RATE;
  static HARMONIC_CEILING_HZ = HARMONIC_CEILING_HZ;
  static HARMONIC_FADE_HZ = HARMONIC_FADE_HZ;
  static MOTOR_MIX = MOTOR_MIX;
  static CHOP_DEPTH = CHOP_DEPTH;
  static RUMBLE_SCALE = RUMBLE_SCALE;
  static IMPULSE_THUMP_HZ = IMPULSE_THUMP_HZ;
  static WANDER_DEPTH = WANDER_DEPTH;
  static WIND_GAIN = WIND_GAIN;
  static ROTOR_MODULATION = ROTOR_MODULATION;
  static OUTSIDE_WASH_RUMBLE = OUTSIDE_WASH_RUMBLE;
  static OUTPUT_GAIN = OUTPUT_GAIN;
  static ANTI_DENORMAL = ANTI_DENORMAL;
  static HISS_COEFFICIENT = SynthMath.onePoleCoefficient(5_500.0, SAMPLE_RATE);

  /**
   * @param {MotorTimbre|null} timbre
   * @param {MotorControl} control
   * @param {number|bigint} seed Java long; a Number is taken as an integer (low 53 bits), a BigInt as the 64-bit value
   * @param {number} [sampleRate] browser extension, default 48000
   */
  constructor(timbre, control, seed, sampleRate = SAMPLE_RATE) {
    const rate = Number.isFinite(sampleRate) && sampleRate >= 8000 ? sampleRate : SAMPLE_RATE;
    this.sampleRate = rate;
    this.invRate = 1.0 / rate;
    this.hissCoefficient = SynthMath.onePoleCoefficient(5_500.0, rate);

    this._timbre = timbre == null ? MotorTimbre.DEFAULT : timbre;
    this.control = control;
    this.air = new StateVariableFilter(rate);
    this.duct = new StateVariableFilter(rate);
    this.wind = new StateVariableFilter(rate);

    this.rotorPhase = new Float64Array(MOTORS);
    this.rpmSmooth = new Float64Array(MOTORS);
    this.gainSmooth = new Float64Array(MOTORS);
    this.loadSmooth = new Float64Array(MOTORS);
    this.detune = new Float64Array(MOTORS);
    this.wander = new Float64Array(MOTORS);
    this.harmonicAmp = new Float64Array(MOTORS * MAX_HARMONICS);
    this.jitter = new Float64Array(MOTORS * MAX_HARMONICS);
    this.harmonicCount = new Int32Array(MOTORS);
    this.motorGainTarget = new Float64Array(MOTORS);
    this.rotorAmp = new Float64Array(MOTORS);
    this.whineAmp = new Float64Array(MOTORS);
    this.whine2Amp = new Float64Array(MOTORS);
    this.commutationAmp = new Float64Array(MOTORS);

    this.targetRpm = new Float64Array(MOTORS);
    this.targetLoad = new Float64Array(MOTORS);
    this.targetWash = 0.0;
    this.targetAirflow = 0.0;
    this.targetDoppler = 1.0;
    this.targetGain = 0.0;
    this.targetBrightness = 18_000.0;
    this.targetActive = false;
    this.targetOnboard = true;
    this.rpmCoefficient = 0.0;
    this.seenImpulses = 0;

    this.dopplerSmooth = 1.0;
    this.washSmooth = 0.0;
    this.airflowSmooth = 0.0;
    this.gust = 0.0;
    this.masterSmooth = 0.0;
    this.brightnessSmooth = 18_000.0;
    this.absorbCoefficient = 1.0;
    this.absorbState = 0.0;
    this.rumbleCoefficient = 0.0;
    this.hissState = 0.0;
    this.rumble1 = 0.0;
    this.rumble2 = 0.0;
    this.dcIn = 0.0;
    this.dcOut = 0.0;
    this.impulseEnvelope = 0.0;
    this.impulseDecay = 0.0;
    this.impulsePhase = 0.0;
    this.noiseState = 0;
    this.primed = false;

    this.airLevel = 0.0;
    this.hissLevel = 0.0;
    this.ductLevel = 0.0;
    this.rumbleLevel = 0.0;
    this.windLevel = 0.0;
    this.gainSum = 0.0;
    this._peak = 0.0;
    this._framesRendered = 0;

    // int s = (int) (seed ^ (seed >>> 32)) * 0x9E3779B1;
    let lo;
    let hi;
    if (typeof seed === 'bigint') {
      lo = Number(BigInt.asIntN(32, seed));
      hi = Number(BigInt.asIntN(32, BigInt.asUintN(64, seed) >> 32n));
    } else {
      const n = Number.isFinite(seed) ? Math.trunc(seed) : 0;
      lo = n | 0;
      hi = Math.floor(n / 4294967296) | 0;
    }
    const s = Math.imul(lo ^ hi, 0x9E3779B1 | 0);
    this.noiseState = s === 0 ? 0x2545F491 : s;
    for (let m = 0; m < MOTORS; m++) {
      this.detune[m] = 1.0 + this._timbre.detuneSpread() * this.white();
      this.rotorPhase[m] = 0.5 * (this.white() + 1.0);
    }
    this.rumbleCoefficient = SynthMath.onePoleCoefficient(75.0, rate);
    this.impulseDecay = Math.exp(-1.0 / (0.045 * rate));
  }

  timbre() {
    return this._timbre;
  }

  peak() {
    return this._peak;
  }

  framesRendered() {
    return this._framesRendered;
  }

  // Java overloads:
  //   render(short[] out, int frames)  -> 16-bit PCM (here: an Int16Array)
  //   render(float[] out, int frames)  -> floats (here: a Float32Array / Float64Array / Array)
  render(out, frames) {
    this.pullTargets();
    const pcm = out instanceof Int16Array;
    let done = 0;
    while (done < frames) {
      const n = Math.min(BLOCK, frames - done);
      this.updateBlock(n);
      if (pcm) {
        for (let i = 0; i < n; i++) {
          out[done + i] = SynthMath.toPcm16(this.nextSample());
        }
      } else {
        for (let i = 0; i < n; i++) {
          out[done + i] = this.nextSample();
        }
      }
      done += n;
    }
    this._framesRendered += frames;
  }

  pullTargets() {
    const c = this.control;
    c.version();
    for (let m = 0; m < MOTORS; m++) {
      this.targetRpm[m] = c.rpm(m);
      this.targetLoad[m] = c.load(m);
    }
    this.targetWash = c.wash();
    this.targetAirflow = c.airflow();
    this.targetDoppler = c.doppler();
    this.targetGain = c.gain();
    this.targetBrightness = c.brightnessHz();
    this.targetActive = c.active();
    this.targetOnboard = c.onboard();
    this.rpmCoefficient = SynthMath.smoothingCoefficient(c.smoothingSeconds(), this.sampleRate);
    const impulses = c.impulseCount();
    if (impulses !== this.seenImpulses) {
      this.seenImpulses = impulses;
      if (this.primed) {
        this.impulseEnvelope = Math.max(this.impulseEnvelope, c.impulseStrength());
      }
    }
    if (!this.primed) {
      this.primed = true;
      for (let m = 0; m < MOTORS; m++) {
        this.rpmSmooth[m] = this.targetRpm[m];
        this.loadSmooth[m] = this.targetLoad[m];
      }
      this.dopplerSmooth = this.targetDoppler;
      this.washSmooth = this.targetWash;
      this.airflowSmooth = this.targetAirflow;
      this.brightnessSmooth = this.targetBrightness;
    }
  }

  updateBlock(frames) {
    const t = this._timbre;
    const blockFactor = frames * this.invRate;
    const slow = 1.0 - Math.exp(-blockFactor / 0.06);
    this.washSmooth += slow * (this.targetWash - this.washSmooth);
    this.airflowSmooth += slow * (this.targetAirflow - this.airflowSmooth);
    this.gust += 0.01 * (this.white() * 1.6 - this.gust);
    this.brightnessSmooth += slow * (this.targetBrightness - this.brightnessSmooth);
    this.absorbCoefficient = SynthMath.onePoleCoefficient(this.brightnessSmooth, this.sampleRate);
    const maxRpm = Math.max(1000.0, t.maxRpm());
    const wash = this.washSmooth;
    const jitterDepth = 0.10 + 0.65 * wash;
    const blades = t.blades();
    const harmonicTilt = t.harmonicTilt();
    const rotorGain = t.rotorGain();
    const polePairs = t.polePairs();
    const whineGain = t.whineGain();
    let loadSum = 0.0;
    let bladePassSum = 0.0;
    let gainTotal = 0.0;
    for (let m = 0; m < MOTORS; m++) {
      this.loadSmooth[m] += slow * (this.targetLoad[m] - this.loadSmooth[m]);
      this.wander[m] += 0.03 * (this.white() - this.wander[m]);
      const rpm = this.rpmSmooth[m];
      const fraction = Math.min(1.4, rpm / maxRpm);
      const load = this.loadSmooth[m];
      const motorGain = fraction <= 0.0 ? 0.0 : Math.pow(fraction, 0.6) * (0.6 + 0.4 * load);
      this.motorGainTarget[m] = motorGain;
      gainTotal += motorGain;
      loadSum += load;
      const rotorHz = rpm / 60.0 * this.dopplerSmooth;
      const bladeHz = rotorHz * blades;
      bladePassSum += bladeHz;
      const tilt = Math.max(0.35, harmonicTilt - 0.45 * load);
      const base = m * MAX_HARMONICS;
      let count = 0;
      let norm = 0.0;
      for (let h = 1; h <= MAX_HARMONICS; h++) {
        const hz = bladeHz * h;
        if (hz >= HARMONIC_CEILING_HZ) {
          break;
        }
        const fade = Math.min(1.0, (HARMONIC_CEILING_HZ - hz) / HARMONIC_FADE_HZ);
        const shape = Math.pow(h, -tilt);
        const idx = base + h - 1;
        this.jitter[idx] += 0.2 * (jitterDepth * this.white() - this.jitter[idx]);
        this.harmonicAmp[idx] = shape * fade * (1.0 + this.jitter[idx]);
        norm += shape;
        count = h;
      }
      if (norm > 0.0) {
        const inv = 1.0 / norm;
        for (let h = 0; h < count; h++) {
          this.harmonicAmp[base + h] *= inv;
        }
      }
      this.harmonicCount[m] = count;
      const rotorFade = rotorHz < 2.0 ? 0.0 : 1.0;
      this.rotorAmp[m] = rotorGain * rotorFade;
      const electricalHz = rotorHz * polePairs;
      const whineBase = whineGain * Math.sqrt(Math.min(1.0, fraction)) * (0.45 + 0.55 * load);
      this.whineAmp[m] = whineBase * MotorSynth.ceilingFade(electricalHz);
      this.whine2Amp[m] = 0.35 * whineBase * MotorSynth.ceilingFade(electricalHz * 2.0);
      this.commutationAmp[m] = 0.3 * whineBase * MotorSynth.ceilingFade(electricalHz * 6.0) * (1.0 - 0.6 * load);
    }
    const avgLoad = loadSum / MOTORS;
    const avgGain = gainTotal / MOTORS;
    const avgBladeHz = bladePassSum / MOTORS;
    this.air.setup(MotorSynth.clamp(avgBladeHz * 2.2, 250.0, 8_000.0), 0.55);
    if (t.ductGain() > 0.0) {
      const fraction = Math.min(1.0, avgBladeHz / Math.max(1.0, t.bladePassHz(maxRpm)));
      this.duct.setup(t.ductHz() * (0.9 + 0.25 * fraction), 5.0);
    }
    const loudness = Math.sqrt(avgGain);
    this.airLevel = t.noiseGain() * loudness * (0.45 + 0.55 * avgLoad);
    this.hissLevel = 0.5 * t.noiseGain() * loudness * avgLoad;
    this.ductLevel = t.ductGain() * loudness * (0.3 + 0.7 * avgLoad);
    if (this.targetOnboard) {
      this.rumbleLevel = t.rumbleGain() * loudness * (0.12 * avgLoad + 1.1 * wash) * RUMBLE_SCALE;
    } else {
      this.rumbleLevel = t.rumbleGain() * loudness * (OUTSIDE_WASH_RUMBLE * wash) * RUMBLE_SCALE;
    }
    const airflow = this.targetOnboard ? this.airflowSmooth : 0.0;
    this.windLevel = WIND_GAIN * airflow * airflow * (1.0 + 0.3 * this.gust);
    if (airflow > 0.001) {
      this.wind.setup(450.0 + 1_100.0 * airflow, 0.45);
    }
    this.dopplerStep(frames);
  }

  dopplerStep(frames) {
    const k = 1.0 - Math.exp(-(frames * this.invRate) / 0.05);
    this.dopplerSmooth += k * (this.targetDoppler - this.dopplerSmooth);
  }

  static ceilingFade(hz) {
    if (hz >= HARMONIC_CEILING_HZ) {
      return 0.0;
    }
    return Math.min(1.0, (HARMONIC_CEILING_HZ - hz) / HARMONIC_FADE_HZ);
  }

  nextSample() {
    const t = this._timbre;
    const blades = t.blades();
    const polePairs = t.polePairs();
    const rpmK = this.rpmCoefficient;
    const gainK = 0.004;
    const dop = this.dopplerSmooth;
    const invRate = this.invRate;
    const sinCycles = SynthMath.sinCycles;
    let motorSum = 0.0;
    let chop = 0.0;
    let gains = 0.0;
    for (let m = 0; m < MOTORS; m++) {
      this.rpmSmooth[m] += rpmK * (this.targetRpm[m] - this.rpmSmooth[m]);
      let g = this.gainSmooth[m] + gainK * (this.motorGainTarget[m] - this.gainSmooth[m]);
      if (g < 1.0e-9) {
        g = 0.0;
      }
      this.gainSmooth[m] = g;
      const increment = this.rpmSmooth[m] * dop * (this.detune[m] + WANDER_DEPTH * this.wander[m]) / 60.0 * invRate;
      let phase = this.rotorPhase[m] + increment;
      if (phase >= 1.0) {
        phase -= Math.trunc(phase);
      }
      this.rotorPhase[m] = phase;
      if (g <= 1.0e-5 && this.whineAmp[m] <= 1.0e-5) {
        continue;
      }
      const blade = phase * blades;
      const base = m * MAX_HARMONICS;
      const count = this.harmonicCount[m];
      const first = count > 0 ? sinCycles(blade) : 0.0;
      let tonal = count > 0 ? this.harmonicAmp[base] * first : 0.0;
      for (let h = 1; h < count; h++) {
        tonal += this.harmonicAmp[base + h] * sinCycles(blade * (h + 1));
      }
      const rotor = sinCycles(phase);
      tonal = tonal * (1.0 + ROTOR_MODULATION * rotor) + this.rotorAmp[m] * rotor;
      const electrical = phase * polePairs;
      const whine = this.whineAmp[m] * sinCycles(electrical)
        + this.whine2Amp[m] * sinCycles(electrical * 2.0)
        + this.commutationAmp[m] * sinCycles(electrical * 6.0);
      motorSum += g * tonal + whine;
      chop += g * first;
      gains += g;
    }
    this.gainSum = gains;
    const noise = this.white();
    this.air.process(noise);
    const chopMod = gains > 1.0e-4 ? 1.0 + CHOP_DEPTH * (chop / gains) : 1.0;
    this.hissState += this.hissCoefficient * (this.air.high() - this.hissState);
    const airOut = (this.air.band() * this.airLevel + this.hissState * this.hissLevel) * chopMod;
    let ductOut = 0.0;
    if (this.ductLevel > 0.0) {
      this.duct.process(noise);
      ductOut = this.duct.band() * this.ductLevel;
    }
    const rumbleNoise = this.white();
    this.rumble1 += this.rumbleCoefficient * (rumbleNoise - this.rumble1);
    this.rumble2 += this.rumbleCoefficient * (this.rumble1 - this.rumble2);
    const rumbleOut = this.rumble2 * this.rumbleLevel;
    let windOut = 0.0;
    if (this.windLevel > 1.0e-5) {
      this.wind.process(rumbleNoise);
      windOut = this.wind.band() * this.windLevel;
    }
    let impulseOut = 0.0;
    if (this.impulseEnvelope > 1.0e-4) {
      this.impulsePhase += IMPULSE_THUMP_HZ * invRate;
      if (this.impulsePhase >= 1.0) {
        this.impulsePhase -= 1.0;
      }
      impulseOut = this.impulseEnvelope * (0.7 * noise + 0.8 * sinCycles(this.impulsePhase));
      this.impulseEnvelope *= this.impulseDecay;
    } else {
      this.impulseEnvelope = 0.0;
    }
    const mix = MOTOR_MIX * motorSum + airOut + ductOut + rumbleOut + windOut + impulseOut + ANTI_DENORMAL;
    this.absorbState += this.absorbCoefficient * (mix - this.absorbState);
    const filtered = this.absorbState;
    const dc = filtered - this.dcIn + 0.9975 * this.dcOut;
    this.dcIn = filtered;
    const dcMagnitude = Math.abs(dc);
    this.dcOut = dcMagnitude < 1.0e4 && dcMagnitude > 1.0e-20 ? dc : 0.0;
    const masterTarget = this.targetActive ? this.targetGain : 0.0;
    this.masterSmooth += 0.0025 * (masterTarget - this.masterSmooth);
    if (this.masterSmooth < 1.0e-9) {
      this.masterSmooth = 0.0;
    }
    let out = SynthMath.softClip(OUTPUT_GAIN * this.dcOut * this.masterSmooth);
    if (out !== out) {
      out = 0.0;
      this.resetFilters();
    }
    const magnitude = Math.abs(out);
    if (magnitude > this._peak) {
      this._peak = magnitude;
    } else {
      this._peak = this._peak > 1.0e-9 ? this._peak * 0.99995 : 0.0;
    }
    return out;
  }

  resetFilters() {
    this.air.reset();
    this.duct.reset();
    this.wind.reset();
    this.absorbState = 0.0;
    this.hissState = 0.0;
    this.rumble1 = 0.0;
    this.rumble2 = 0.0;
    this.dcIn = 0.0;
    this.dcOut = 0.0;
    this.impulseEnvelope = 0.0;
  }

  white() {
    let s = this.noiseState;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.noiseState = s;
    return Math.fround(s) * WHITE_SCALE;
  }

  static clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }
}
