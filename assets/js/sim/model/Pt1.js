import { SimMath } from './SimMath.js?v=44da8aea';

// Port of de.lardtom.propwash.sim.Pt1
export class Pt1 {
  gain = 1.0;
  state = 0.0;

  configure(cutoffHz, dt) {
    this.gain = SimMath.pt1Gain(cutoffHz, dt);
  }

  apply(input) {
    this.state += this.gain * (input - this.state);
    return this.state;
  }

  value() {
    return this.state;
  }

  reset(value) {
    this.state = value;
  }
}
