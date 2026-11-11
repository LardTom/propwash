// Port of de.lardtom.propwash.sim.HullContact (1:1). StrictMath.tanh -> Math.tanh (may differ in the last bit).
import { AirframeSpec } from './AirframeSpec.js?v=4131aebb';

export class HullContact {
  static STATIC_SINK = 0.002;
  static DAMPING_RATIO = 1.0;
  static SLIP_SPEED = 0.05;
  static ROLLING_DAMPING = 0.02;

  fx = 0.0;
  fy = 0.0;
  fz = 0.0;
  tx = 0.0;
  ty = 0.0;
  tz = 0.0;
  normal = 0.0;
  points = 0;

  clear() {
    this.fx = 0.0;
    this.fy = 0.0;
    this.fz = 0.0;
    this.tx = 0.0;
    this.ty = 0.0;
    this.tz = 0.0;
    this.normal = 0.0;
    this.points = 0;
  }

  static lowest(p, b) {
    let low = Infinity;
    for (let k = 0; k < AirframeSpec.HULL_POINTS; k++) {
      low = Math.min(low, b.r10 * p.hullX(k) + b.r11 * p.hullY(k) + b.r12 * p.hullZ(k));
    }
    return low;
  }

  solve(p, b, groundY, mu, gravity) {
    this.clear();
    const m = p.massKg;
    const k = m * gravity / HullContact.STATIC_SINK;
    const c = 2.0 * HullContact.DAMPING_RATIO * Math.sqrt(k * m);
    for (let i = 0; i < AirframeSpec.HULL_POINTS; i++) {
      const hx = p.hullX(i);
      const hy = p.hullY(i);
      const hz = p.hullZ(i);
      const rx = b.r00 * hx + b.r01 * hy + b.r02 * hz;
      const ry = b.r10 * hx + b.r11 * hy + b.r12 * hz;
      const rz = b.r20 * hx + b.r21 * hy + b.r22 * hz;
      const depth = groundY - (b.py + ry);
      if (depth <= 0.0) {
        continue;
      }
      const vx = b.vx + b.wwy * rz - b.wwz * ry;
      const vy = b.vy + b.wwz * rx - b.wwx * rz;
      const vz = b.vz + b.wwx * ry - b.wwy * rx;
      const n = k * depth - c * vy;
      if (n <= 0.0) {
        continue;
      }
      const slide = Math.sqrt(vx * vx + vz * vz);
      let gx = 0.0;
      let gz = 0.0;
      if (slide > 1e-9) {
        const f = mu * n * Math.tanh(slide / HullContact.SLIP_SPEED) / slide;
        gx = -f * vx;
        gz = -f * vz;
      }
      this.fx += gx;
      this.fy += n;
      this.fz += gz;
      this.tx += ry * gz - rz * n;
      this.ty += rz * gx - rx * gz;
      this.tz += rx * n - ry * gx;
      this.normal += n;
      this.points++;
    }
    if (this.points > 0) {
      const roll = HullContact.ROLLING_DAMPING * this.normal * p.motorOffset;
      this.tx -= roll * b.wwx;
      this.ty -= roll * b.wwy;
      this.tz -= roll * b.wwz;
    }
  }
}
