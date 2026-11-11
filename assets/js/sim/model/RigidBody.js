// Port of de.lardtom.propwash.sim.RigidBody (1:1).
import { ModelConstants } from './ModelConstants.js?v=760466ce';
import { SimMath } from './SimMath.js?v=44da8aea';
import { StrictMath } from './StrictMath.js?v=e765e983';

export class RigidBody {
  static MIDPOINT_ITERATIONS = 2;

  px = 0.0;
  py = 0.0;
  pz = 0.0;
  vx = 0.0;
  vy = 0.0;
  vz = 0.0;
  qw = 1.0;
  qx = 0.0;
  qy = 0.0;
  qz = 0.0;
  lx = 0.0;
  ly = 0.0;
  lz = 0.0;

  r00 = 1.0;
  r01 = 0.0;
  r02 = 0.0;
  r10 = 0.0;
  r11 = 1.0;
  r12 = 0.0;
  r20 = 0.0;
  r21 = 0.0;
  r22 = 1.0;
  wbx = 0.0;
  wby = 0.0;
  wbz = 0.0;
  wwx = 0.0;
  wwy = 0.0;
  wwz = 0.0;

  midX = 0.0;
  midY = 0.0;
  midZ = 0.0;

  mass = 1.0;
  ixx = 1.0;
  iyy = 1.0;
  izz = 1.0;

  configure(mass, ixx, iyy, izz) {
    this.mass = mass;
    this.ixx = ixx;
    this.iyy = iyy;
    this.izz = izz;
    this.updateDerived();
  }

  setUpright(headingRad) {
    const half = 0.5 * headingRad;
    this.qw = SimMath.cos(half);
    this.qx = 0.0;
    this.qy = SimMath.sin(half);
    this.qz = 0.0;
    this.updateDerived();
  }

  updateRotation() {
    const w = this.qw;
    const x = this.qx;
    const y = this.qy;
    const z = this.qz;
    this.r00 = 1.0 - 2.0 * (y * y + z * z);
    this.r01 = 2.0 * (x * y - w * z);
    this.r02 = 2.0 * (x * z + w * y);
    this.r10 = 2.0 * (x * y + w * z);
    this.r11 = 1.0 - 2.0 * (x * x + z * z);
    this.r12 = 2.0 * (y * z - w * x);
    this.r20 = 2.0 * (x * z - w * y);
    this.r21 = 2.0 * (y * z + w * x);
    this.r22 = 1.0 - 2.0 * (x * x + y * y);
  }

  updateRates() {
    const bx = (this.r00 * this.lx + this.r10 * this.ly + this.r20 * this.lz) / this.ixx;
    const by = (this.r01 * this.lx + this.r11 * this.ly + this.r21 * this.lz) / this.iyy;
    const bz = (this.r02 * this.lx + this.r12 * this.ly + this.r22 * this.lz) / this.izz;
    this.wbx = bx;
    this.wby = by;
    this.wbz = bz;
    this.wwx = this.r00 * bx + this.r01 * by + this.r02 * bz;
    this.wwy = this.r10 * bx + this.r11 * by + this.r12 * bz;
    this.wwz = this.r20 * bx + this.r21 * by + this.r22 * bz;
  }

  updateDerived() {
    this.updateRotation();
    this.updateRates();
  }

  setBodyRates(bx, by, bz) {
    const lbx = this.ixx * bx;
    const lby = this.iyy * by;
    const lbz = this.izz * bz;
    this.lx = this.r00 * lbx + this.r01 * lby + this.r02 * lbz;
    this.ly = this.r10 * lbx + this.r11 * lby + this.r12 * lbz;
    this.lz = this.r20 * lbx + this.r21 * lby + this.r22 * lbz;
    this.updateRates();
  }

  integrate(h, ax, ay, az, tx, ty, tz) {
    this.vx += h * ax;
    this.vy += h * ay;
    this.vz += h * az;
    const speed2 = this.vx * this.vx + this.vy * this.vy + this.vz * this.vz;
    if (speed2 > ModelConstants.V_MAX * ModelConstants.V_MAX) {
      const s = ModelConstants.V_MAX / Math.sqrt(speed2);
      this.vx *= s;
      this.vy *= s;
      this.vz *= s;
    }
    this.px += h * this.vx;
    this.py += h * this.vy;
    this.pz += h * this.vz;
    this.lx += h * tx;
    this.ly += h * ty;
    this.lz += h * tz;
    this.updateRates();
    let wx = this.wwx;
    let wy = this.wwy;
    let wz = this.wwz;
    for (let k = 0; k < RigidBody.MIDPOINT_ITERATIONS; k++) {
      this.midpointRate(0.25 * h, wx, wy, wz);
      wx = this.midX;
      wy = this.midY;
      wz = this.midZ;
    }
    this.rotate(h, wx, wy, wz);
    this.updateDerived();
    this.clampRates();
  }

  midpointRate(halfH, wx, wy, wz) {
    const w = this.qw;
    const x = this.qx;
    const y = this.qy;
    const z = this.qz;
    const dx = halfH * wx;
    const dy = halfH * wy;
    const dz = halfH * wz;
    let mw = w - dx * x - dy * y - dz * z;
    let mx = x + dx * w + dy * z - dz * y;
    let my = y - dx * z + dy * w + dz * x;
    let mz = z + dx * y - dy * x + dz * w;
    const inv = 1.0 / Math.sqrt(mw * mw + mx * mx + my * my + mz * mz);
    mw *= inv;
    mx *= inv;
    my *= inv;
    mz *= inv;
    const a00 = 1.0 - 2.0 * (my * my + mz * mz);
    const a01 = 2.0 * (mx * my - mw * mz);
    const a02 = 2.0 * (mx * mz + mw * my);
    const a10 = 2.0 * (mx * my + mw * mz);
    const a11 = 1.0 - 2.0 * (mx * mx + mz * mz);
    const a12 = 2.0 * (my * mz - mw * mx);
    const a20 = 2.0 * (mx * mz - mw * my);
    const a21 = 2.0 * (my * mz + mw * mx);
    const a22 = 1.0 - 2.0 * (mx * mx + my * my);
    const bx = (a00 * this.lx + a10 * this.ly + a20 * this.lz) / this.ixx;
    const by = (a01 * this.lx + a11 * this.ly + a21 * this.lz) / this.iyy;
    const bz = (a02 * this.lx + a12 * this.ly + a22 * this.lz) / this.izz;
    this.midX = a00 * bx + a01 * by + a02 * bz;
    this.midY = a10 * bx + a11 * by + a12 * bz;
    this.midZ = a20 * bx + a21 * by + a22 * bz;
  }

  rotate(h, wx, wy, wz) {
    const rate = SimMath.hypot3(wx, wy, wz);
    const theta = rate * h;
    let dw;
    let dx;
    let dy;
    let dz;
    if (theta < 1e-9) {
      dw = 1.0;
      dx = 0.5 * h * wx;
      dy = 0.5 * h * wy;
      dz = 0.5 * h * wz;
    } else {
      const s = SimMath.sin(0.5 * theta) / rate;
      dw = SimMath.cos(0.5 * theta);
      dx = s * wx;
      dy = s * wy;
      dz = s * wz;
    }
    const w = this.qw;
    const x = this.qx;
    const y = this.qy;
    const z = this.qz;
    const nw = dw * w - dx * x - dy * y - dz * z;
    const nx = dw * x + dx * w + dy * z - dz * y;
    const ny = dw * y - dx * z + dy * w + dz * x;
    const nz = dw * z + dx * y - dy * x + dz * w;
    const norm = Math.sqrt(nw * nw + nx * nx + ny * ny + nz * nz);
    this.qw = nw / norm;
    this.qx = nx / norm;
    this.qy = ny / norm;
    this.qz = nz / norm;
  }

  clampRates() {
    const rate2 = this.wbx * this.wbx + this.wby * this.wby + this.wbz * this.wbz;
    if (rate2 > ModelConstants.OMEGA_BODY_MAX * ModelConstants.OMEGA_BODY_MAX) {
      const s = ModelConstants.OMEGA_BODY_MAX / Math.sqrt(rate2);
      this.lx *= s;
      this.ly *= s;
      this.lz *= s;
      this.updateRates();
    }
  }

  tiltRad() {
    return StrictMath.acos(SimMath.clamp(this.r11, -1.0, 1.0));
  }

  headingRad() {
    return StrictMath.atan2(this.r02, this.r22);
  }

  kineticEnergy() {
    const lin = 0.5 * this.mass * (this.vx * this.vx + this.vy * this.vy + this.vz * this.vz);
    const rot = 0.5 * (this.ixx * this.wbx * this.wbx + this.iyy * this.wby * this.wby + this.izz * this.wbz * this.wbz);
    return lin + rot;
  }
}
