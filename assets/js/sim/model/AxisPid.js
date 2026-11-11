import { SimMath } from './SimMath.js?v=44da8aea';

// Port of de.lardtom.propwash.sim.AxisPid
export class AxisPid {
  // Java constructors: AxisPid() (all 0) and AxisPid(p, i, d, ff); dispatched on arguments.length.
  constructor(p, i, d, ff) {
    if (arguments.length === 0) {
      this.p = 0.0;
      this.i = 0.0;
      this.d = 0.0;
      this.ff = 0.0;
    } else {
      this.p = p;
      this.i = i;
      this.d = d;
      this.ff = ff;
    }
  }

  copy() {
    return new AxisPid(this.p, this.i, this.d, this.ff);
  }

  sanitize(fallback) {
    this.p = SimMath.sanitize(this.p, 0.0, 250.0, fallback.p);
    this.i = SimMath.sanitize(this.i, 0.0, 250.0, fallback.i);
    this.d = SimMath.sanitize(this.d, 0.0, 200.0, fallback.d);
    this.ff = SimMath.sanitize(this.ff, 0.0, 500.0, fallback.ff);
  }
}
