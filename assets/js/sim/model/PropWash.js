// Port of de.lardtom.propwash.sim.PropWash (1:1).
import { StrictMath } from './StrictMath.js?v=e765e983';
import { AirframeSpec } from './AirframeSpec.js?v=cfbc2e85';
import { ModelConstants } from './ModelConstants.js?v=760466ce';
import { SimMath } from './SimMath.js?v=44da8aea';

export class PropWash {
  noise = new Float64Array(AirframeSpec.MOTORS);
  weight = new Float64Array(AirframeSpec.MOTORS);
  vrs = new Float64Array(AirframeSpec.MOTORS);
  noiseGain = 0.0;
  noiseScale = 0.0;

  configure(p, h) {
    this.noiseGain = h / (h + 1.0 / (SimMath.TWO_PI * p.washNoiseHz));
    this.noiseScale = Math.sqrt((2.0 - this.noiseGain) / this.noiseGain);
  }

  reset() {
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      this.noise[i] = 0.0;
      this.weight[i] = 0.0;
      this.vrs[i] = 0.0;
    }
  }

  advanceNoise(rng) {
    const k = this.noiseGain;
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      this.noise[i] += k * (this.noiseScale * rng.gauss() - this.noise[i]);
    }
  }

  maxOf() {
    return Math.max(Math.max(this.weight[0], this.weight[1]), Math.max(this.weight[2], this.weight[3]));
  }

  static vortexRingWeight(previousThrust, hoverThrust, axialSpeed, crossSpeed, rho, area, ductGain) {
    const thrust = previousThrust > 1e-4 ? previousThrust : 1e-4;
    const vh = Math.sqrt(thrust / (2.0 * rho * area * ductGain));
    const sink = -axialSpeed / vh;
    const cross = crossSpeed / vh;
    const a = (sink - 1.0) / ModelConstants.WASH_SINK_WIDTH;
    const b = cross / ModelConstants.WASH_CROSS_WIDTH;
    const load = previousThrust > 0.0 ? Math.min(1.0, previousThrust / (0.25 * hoverThrust)) : 0.0;
    return StrictMath.exp(-(a * a) - b * b) * load;
  }

  factor(i, vrsWeight, wakeWeight, scale, loss, noiseAmp) {
    const w = SimMath.clamp01(scale * (1.0 - (1.0 - vrsWeight) * (1.0 - wakeWeight)));
    this.weight[i] = w;
    this.vrs[i] = vrsWeight;
    return (1.0 - loss * w) * (1.0 + noiseAmp * w * this.noise[i]);
  }
}
