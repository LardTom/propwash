import { Pt1 } from './Pt1.js?v=afe0b0dc';

// Port of de.lardtom.propwash.sim.Pt2
export class Pt2 {
  static CASCADE_CORRECTION = 1.553774;

  first = new Pt1();
  second = new Pt1();
  bypass = true;

  configure(cutoffHz, dt) {
    this.bypass = cutoffHz <= 0.0;
    const f = cutoffHz * Pt2.CASCADE_CORRECTION;
    this.first.configure(f, dt);
    this.second.configure(f, dt);
  }

  apply(input) {
    if (this.bypass) {
      this.first.reset(input);
      this.second.reset(input);
      return input;
    }
    return this.second.apply(this.first.apply(input));
  }

  value() {
    return this.second.value();
  }

  reset(value) {
    this.first.reset(value);
    this.second.reset(value);
  }
}
