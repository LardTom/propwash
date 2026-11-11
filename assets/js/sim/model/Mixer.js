import { SimMath } from './SimMath.js?v=44da8aea';
import { AirframeSpec } from './AirframeSpec.js?v=cfbc2e85';

// Port of de.lardtom.propwash.sim.Mixer
export class Mixer {
  authority = new Float64Array(AirframeSpec.MOTORS);
  output = new Float64Array(AirframeSpec.MOTORS);
  throttle = 0.0;
  saturated = false;

  mix(p, roll, pitch, yaw, thr, airmodeActive, propsOut) {
    const yawSign = propsOut ? -1.0 : 1.0;
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      const a = p.mixRoll(i) * roll + p.mixPitch(i) * pitch + yawSign * p.mixYaw(i) * yaw;
      this.authority[i] = a;
      min = Math.min(min, a);
      max = Math.max(max, a);
    }
    let sat = false;
    const range = max - min;
    if (range > 1.0) {
      for (let i = 0; i < AirframeSpec.MOTORS; i++) {
        this.authority[i] /= range;
      }
      min /= range;
      max /= range;
      sat = true;
    }
    if (!p.uniformThrottle) {
      this.mixWeighted(p, thr, airmodeActive, sat);
      return;
    }
    let t;
    if (airmodeActive) {
      t = SimMath.clamp(thr, -min, 1.0 - max);
    } else {
      t = thr > 0.5 ? Math.min(thr, 1.0 - max) : thr;
    }
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      let o = t + this.authority[i];
      if (o < 0.0 || o > 1.0) {
        sat = true;
        o = SimMath.clamp01(o);
      }
      this.output[i] = o;
    }
    this.throttle = t;
    this.saturated = sat;
  }

  mixWeighted(p, thr, airmodeActive, saturated) {
    let sat = saturated;
    let lower = -Infinity;
    let upper = Infinity;
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      const w = p.mixThrottle(i);
      lower = Math.max(lower, -this.authority[i] / w);
      upper = Math.min(upper, (1.0 - this.authority[i]) / w);
    }
    let t;
    if (airmodeActive) {
      t = lower > upper ? upper : SimMath.clamp(thr, lower, upper);
    } else {
      t = thr > 0.5 ? Math.min(thr, upper) : thr;
    }
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      let o = t * p.mixThrottle(i) + this.authority[i];
      if (o < 0.0 || o > 1.0) {
        sat = true;
        o = SimMath.clamp01(o);
      }
      this.output[i] = o;
    }
    this.throttle = t;
    this.saturated = sat;
  }
}
