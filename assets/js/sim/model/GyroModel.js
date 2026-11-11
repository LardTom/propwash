import { SimMath } from './SimMath.js?v=44da8aea';
import { AirframeSpec } from './AirframeSpec.js?v=cfbc2e85';
import { FcAxes } from './FcAxes.js?v=3da14453';

// Port of de.lardtom.propwash.sim.GyroModel
export class GyroModel {
  static MOTOR_SHARE = Math.sqrt(2.0 / AirframeSpec.MOTORS);
  static YAW_COUPLING = 0.5;
  static TWO_PI = 2.0 * Math.PI;
  static GOLDEN_ANGLE = Math.PI * (3.0 - Math.sqrt(5.0));

  raw = new Float64Array(3);
  rotorAngle = new Float64Array(AirframeSpec.MOTORS);
  h = 0.0;

  configure(h) {
    this.h = h;
  }

  reset() {
    for (let a = 0; a < 3; a++) {
      this.raw[a] = 0.0;
    }
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      this.rotorAngle[i] = 0.0;
    }
  }

  measure(wbx, wby, wbz) {
    this.raw[FcAxes.ROLL] = FcAxes.rollDps(wbz);
    this.raw[FcAxes.PITCH] = FcAxes.pitchDps(wbx);
    this.raw[FcAxes.YAW] = FcAxes.yawDps(wby);
  }

  sample(rng, wbx, wby, wbz, noiseDps, vibrationDps, omega, hoverOmega, propWash, decimation) {
    this.measure(wbx, wby, wbz);
    if (noiseDps > 0.0) {
      for (let a = 0; a < 3; a++) {
        this.raw[a] += noiseDps * rng.gauss();
      }
    }
    const scale = vibrationDps > 0.0 && hoverOmega > 0.0 ? vibrationDps * GyroModel.MOTOR_SHARE * (1.0 + 3.0 * propWash) : 0.0;
    let roll = 0.0;
    let pitch = 0.0;
    let yaw = 0.0;
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      const w = Math.abs(omega[i]);
      if (!Number.isFinite(w)) {
        continue;
      }
      let angle = this.rotorAngle[i] + w * this.h;
      if (angle >= GyroModel.TWO_PI) {
        angle -= GyroModel.TWO_PI * Math.floor(angle / GyroModel.TWO_PI);
      }
      this.rotorAngle[i] = angle;
      if (scale === 0.0) {
        continue;
      }
      let gain = GyroModel.antiAliasGain(w, this.h);
      if (gain === 0.0) {
        continue;
      }
      gain *= GyroModel.decimationGain(w, this.h, decimation);
      const ratio = w / hoverOmega;
      const amp = scale * ratio * ratio * gain;
      const phase = angle + i * GyroModel.GOLDEN_ANGLE;
      const c = SimMath.cos(phase);
      const s = SimMath.sin(phase);
      roll += amp * c;
      pitch += amp * s;
      yaw += GyroModel.YAW_COUPLING * amp * (i % 2 === 0 ? c : -s);
    }
    this.raw[FcAxes.ROLL] += roll;
    this.raw[FcAxes.PITCH] += pitch;
    this.raw[FcAxes.YAW] += yaw;
  }

  static antiAliasGain(omega, h) {
    const x = Math.abs(omega) * h / Math.PI;
    if (!(x < 1.0)) {
      return 0.0;
    }
    const k = 1.0 - x * x;
    return k * k;
  }

  static decimationGain(omega, h, samples) {
    if (samples <= 1) {
      return 1.0;
    }
    const x = 0.5 * Math.abs(omega) * h;
    const den = samples * SimMath.sin(x);
    if (Math.abs(den) < 1.0E-12) {
      return 1.0;
    }
    return Math.min(1.0, Math.abs(SimMath.sin(samples * x) / den));
  }
}
