// Port of de.lardtom.propwash.sim.CollisionSolver (1:1).
import { AirframeSpec } from './AirframeSpec.js?v=0d4a93ac';
import { HullShape } from './HullShape.js?v=5524a7b9';
import { ModelConstants } from './ModelConstants.js?v=760466ce';
import { SimMath } from './SimMath.js?v=44da8aea';

export class CollisionSolver {
  static MAX_RATE_CHANGE = 30.0;
  static STRIKE_OMEGA_FRACTION = 0.3;
  static STRIKE_REMAINING = 0.2;
  static STRIKE_YAW_TRANSFER = 0.8;
  static STRIKE_NORMAL_LIMIT = 0.7;

  hull = new HullShape();
  struck = new Array(AirframeSpec.MOTORS).fill(false);
  struckRpm = new Float64Array(AirframeSpec.MOTORS);
  resolved = false;
  impactSpeed = 0.0;
  tangentialSpeed = 0.0;
  normalImpulse = 0.0;

  invInertiaWorldX = 0.0;
  invInertiaWorldY = 0.0;
  invInertiaWorldZ = 0.0;

  applyInverseInertia(b, x, y, z) {
    const bx = (b.r00 * x + b.r10 * y + b.r20 * z) / b.ixx;
    const by = (b.r01 * x + b.r11 * y + b.r21 * z) / b.iyy;
    const bz = (b.r02 * x + b.r12 * y + b.r22 * z) / b.izz;
    this.invInertiaWorldX = b.r00 * bx + b.r01 * by + b.r02 * bz;
    this.invInertiaWorldY = b.r10 * bx + b.r11 * by + b.r12 * bz;
    this.invInertiaWorldZ = b.r20 * bx + b.r21 * by + b.r22 * bz;
  }

  effectiveMass(b, rx, ry, rz, nx, ny, nz) {
    const cx = ry * nz - rz * ny;
    const cy = rz * nx - rx * nz;
    const cz = rx * ny - ry * nx;
    this.applyInverseInertia(b, cx, cy, cz);
    const ix = this.invInertiaWorldX;
    const iy = this.invInertiaWorldY;
    const iz = this.invInertiaWorldZ;
    const kx = iy * rz - iz * ry;
    const ky = iz * rx - ix * rz;
    const kz = ix * ry - iy * rx;
    return 1.0 / b.mass + nx * kx + ny * ky + nz * kz;
  }

  resolve(p, b, power, tuning, spinSign, nx, ny, nz, grip, restitution, approachLimit) {
    this.resolved = false;
    this.impactSpeed = 0.0;
    this.tangentialSpeed = 0.0;
    this.normalImpulse = 0.0;
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      this.struck[i] = false;
      this.struckRpm[i] = 0.0;
    }
    b.updateDerived();
    this.hull.update(p, b);
    this.hull.contact(nx, ny, nz);
    const rx = this.hull.contactX;
    const ry = this.hull.contactY;
    const rz = this.hull.contactZ;
    let vcx = b.vx + (b.wwy * rz - b.wwz * ry);
    let vcy = b.vy + (b.wwz * rx - b.wwx * rz);
    let vcz = b.vz + (b.wwx * ry - b.wwy * rx);
    const vn = vcx * nx + vcy * ny + vcz * nz;
    if (vn >= 0.0) {
      return;
    }
    const vDotN = b.vx * nx + b.vy * ny + b.vz * nz;
    this.impactSpeed = -vDotN;
    const tx0 = b.vx - vDotN * nx;
    const ty0 = b.vy - vDotN * ny;
    const tz0 = b.vz - vDotN * nz;
    this.tangentialSpeed = Math.sqrt(tx0 * tx0 + ty0 * ty0 + tz0 * tz0);
    const e0 = restitution >= 0.0 ? restitution : p.restitution;
    const vcr = p.impactTolerance * tuning.crashSpeedScale;
    const speed = Math.min(-vn, approachLimit);
    const e = speed < ModelConstants.BOUNCE_MIN ? 0.0
      : SimMath.clamp(e0 * tuning.restitutionScale * (1.0 - 0.6 * SimMath.smoothstep(0.3 * vcr, vcr, speed)), 0.0,
        ModelConstants.RESTITUTION_MAX);
    const oldWx = b.wbx;
    const oldWy = b.wby;
    const oldWz = b.wbz;
    const kn = this.effectiveMass(b, rx, ry, rz, nx, ny, nz);
    const jn = -(1.0 + e) * vn / kn;
    this.applyImpulse(b, rx, ry, rz, jn * nx, jn * ny, jn * nz);
    this.normalImpulse = jn;
    const mu = p.friction * Math.max(0.0, grip);
    vcx = b.vx + (b.wwy * rz - b.wwz * ry);
    vcy = b.vy + (b.wwz * rx - b.wwx * rz);
    vcz = b.vz + (b.wwx * ry - b.wwy * rx);
    const vn2 = vcx * nx + vcy * ny + vcz * nz;
    const vtx = vcx - vn2 * nx;
    const vty = vcy - vn2 * ny;
    const vtz = vcz - vn2 * nz;
    const vt = Math.sqrt(vtx * vtx + vty * vty + vtz * vtz);
    if (vt > 1e-6 && mu > 0.0) {
      const tx = vtx / vt;
      const ty = vty / vt;
      const tz = vtz / vt;
      const kt = this.effectiveMass(b, rx, ry, rz, tx, ty, tz);
      const jt = Math.min(mu * jn, vt / kt);
      this.applyImpulse(b, rx, ry, rz, -jt * tx, -jt * ty, -jt * tz);
    }
    if (!p.ducted && tuning.propStrikes) {
      const normalBodyY = b.r01 * nx + b.r11 * ny + b.r21 * nz;
      if (normalBodyY < CollisionSolver.STRIKE_NORMAL_LIMIT) {
        for (let i = 0; i < AirframeSpec.MOTORS; i++) {
          const w = power.omega[i];
          if (this.hull.inContact[i] && Math.abs(w) > CollisionSolver.STRIKE_OMEGA_FRACTION * p.hoverOmega) {
            this.struck[i] = true;
            this.struckRpm[i] = Math.abs(w) * 60.0 / SimMath.TWO_PI;
            power.omega[i] = CollisionSolver.STRIKE_REMAINING * w;
            const dl = -spinSign * p.spin(i) * p.rotorInertiaEff * CollisionSolver.STRIKE_YAW_TRANSFER * w;
            b.lx += dl * b.r01;
            b.ly += dl * b.r11;
            b.lz += dl * b.r21;
          }
        }
        b.updateRates();
      }
    }
    const dx = b.wbx - oldWx;
    const dy = b.wby - oldWy;
    const dz = b.wbz - oldWz;
    const dw = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dw > CollisionSolver.MAX_RATE_CHANGE) {
      const s = CollisionSolver.MAX_RATE_CHANGE / dw;
      b.setBodyRates(oldWx + dx * s, oldWy + dy * s, oldWz + dz * s);
    }
    this.resolved = true;
  }

  applyImpulse(b, rx, ry, rz, jx, jy, jz) {
    const m = b.mass;
    b.vx += jx / m;
    b.vy += jy / m;
    b.vz += jz / m;
    b.lx += ry * jz - rz * jy;
    b.ly += rz * jx - rx * jz;
    b.lz += rx * jy - ry * jx;
    b.updateRates();
  }
}
