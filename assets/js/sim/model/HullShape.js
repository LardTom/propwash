// Port of de.lardtom.propwash.sim.HullShape (1:1).
import { AirframeSpec } from './AirframeSpec.js?v=840a3158';

export class HullShape {
  static CONTACT_BAND = 0.003;

  wx = new Float64Array(AirframeSpec.HULL_POINTS);
  wy = new Float64Array(AirframeSpec.HULL_POINTS);
  wz = new Float64Array(AirframeSpec.HULL_POINTS);
  inContact = new Array(AirframeSpec.HULL_POINTS).fill(false);
  contactX = 0.0;
  contactY = 0.0;
  contactZ = 0.0;

  update(p, b) {
    for (let k = 0; k < AirframeSpec.HULL_POINTS; k++) {
      const x = p.hullX(k);
      const y = p.hullY(k);
      const z = p.hullZ(k);
      this.wx[k] = b.r00 * x + b.r01 * y + b.r02 * z;
      this.wy[k] = b.r10 * x + b.r11 * y + b.r12 * z;
      this.wz[k] = b.r20 * x + b.r21 * y + b.r22 * z;
    }
  }

  contact(nx, ny, nz) {
    let min = Infinity;
    for (let k = 0; k < AirframeSpec.HULL_POINTS; k++) {
      const d = this.wx[k] * nx + this.wy[k] * ny + this.wz[k] * nz;
      if (d < min) {
        min = d;
      }
    }
    let sx = 0.0;
    let sy = 0.0;
    let sz = 0.0;
    let count = 0;
    for (let k = 0; k < AirframeSpec.HULL_POINTS; k++) {
      const d = this.wx[k] * nx + this.wy[k] * ny + this.wz[k] * nz;
      const inside = d <= min + HullShape.CONTACT_BAND;
      this.inContact[k] = inside;
      if (inside) {
        sx += this.wx[k];
        sy += this.wy[k];
        sz += this.wz[k];
        count++;
      }
    }
    this.contactX = sx / count;
    this.contactY = sy / count;
    this.contactZ = sz / count;
  }
}
