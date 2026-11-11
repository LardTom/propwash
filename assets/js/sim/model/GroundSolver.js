// Port of de.lardtom.propwash.sim.GroundSolver (1:1).
import { AirframeSpec } from './AirframeSpec.js?v=259f604e';
import { ModelConstants } from './ModelConstants.js?v=760466ce';
import { SimMath } from './SimMath.js?v=44da8aea';
import { StrictMath } from './StrictMath.js?v=e765e983';

export class GroundSolver {
  static POINTS = AirframeSpec.GROUND_POINTS;
  static ITERATIONS = 64;
  static TOLERANCE = 1.0E-7;
  static IMPACT_TIME = 0.002;
  static LOSS_ONSET = 0.3;
  static LOSS_EXPONENT = 0.25;
  static DIG_GAIN = 4.0;
  static REACH = 0.02;
  static SLOP = 0.0005;
  static PUSH_RATE = 20.0;
  static PUSH_MAX = 0.3;

  rx = new Float64Array(GroundSolver.POINTS);
  ry = new Float64Array(GroundSolver.POINTS);
  rz = new Float64Array(GroundSolver.POINTS);
  target = new Float64Array(GroundSolver.POINTS);
  lambda = new Float64Array(GroundSolver.POINTS);
  frictionX = new Float64Array(GroundSolver.POINTS);
  frictionZ = new Float64Array(GroundSolver.POINTS);
  massN = new Float64Array(GroundSolver.POINTS);
  grip = new Float64Array(GroundSolver.POINTS);
  massX = new Float64Array(GroundSolver.POINTS);
  massZ = new Float64Array(GroundSolver.POINTS);
  active = new Array(GroundSolver.POINTS).fill(false);
  touching = new Array(GroundSolver.POINTS).fill(false);
  depth = new Float64Array(GroundSolver.POINTS);
  wasTouching = new Array(GroundSolver.POINTS).fill(false);
  warmN = new Float64Array(GroundSolver.POINTS);
  warmX = new Float64Array(GroundSolver.POINTS);
  warmZ = new Float64Array(GroundSolver.POINTS);

  vx = 0.0;
  vy = 0.0;
  vz = 0.0;
  lx = 0.0;
  ly = 0.0;
  lz = 0.0;
  wx = 0.0;
  wy = 0.0;
  wz = 0.0;
  ix = 0.0;
  iy = 0.0;
  iz = 0.0;

  impulseX = 0.0;
  impulseY = 0.0;
  impulseZ = 0.0;
  angularX = 0.0;
  angularY = 0.0;
  angularZ = 0.0;
  normalImpulse = 0.0;
  newContacts = 0;
  touchMask = 0;
  approachSpeed = 0.0;
  tangentialSpeed = 0.0;

  forget() {
    for (let k = 0; k < GroundSolver.POINTS; k++) {
      this.wasTouching[k] = false;
      this.touching[k] = false;
      this.warmN[k] = 0.0;
      this.warmX[k] = 0.0;
      this.warmZ[k] = 0.0;
    }
    this.touchMask = 0;
  }

  lowest(p, b) {
    let low = Infinity;
    for (let k = 0; k < p.groundCount(); k++) {
      low = Math.min(low, b.r10 * p.groundX(k) + b.r11 * p.groundY(k) + b.r12 * p.groundZ(k));
    }
    return low;
  }

  inverseInertia(b, x, y, z) {
    const bx = (b.r00 * x + b.r10 * y + b.r20 * z) / b.ixx;
    const by = (b.r01 * x + b.r11 * y + b.r21 * z) / b.iyy;
    const bz = (b.r02 * x + b.r12 * y + b.r22 * z) / b.izz;
    this.ix = b.r00 * bx + b.r01 * by + b.r02 * bz;
    this.iy = b.r10 * bx + b.r11 * by + b.r12 * bz;
    this.iz = b.r20 * bx + b.r21 * by + b.r22 * bz;
  }

  rates(b) {
    this.inverseInertia(b, this.lx, this.ly, this.lz);
    this.wx = this.ix;
    this.wy = this.iy;
    this.wz = this.iz;
  }

  push(b, k, jx, jy, jz) {
    const m = b.mass;
    this.vx += jx / m;
    this.vy += jy / m;
    this.vz += jz / m;
    const x = this.rx[k];
    const y = this.ry[k];
    const z = this.rz[k];
    this.lx += y * jz - z * jy;
    this.ly += z * jx - x * jz;
    this.lz += x * jy - y * jx;
    this.rates(b);
  }

  static restitution(base, speed, crashSpeed) {
    if (!(base > 0.0)) {
      return 0.0;
    }
    const onset = Math.max(GroundSolver.LOSS_ONSET * crashSpeed, ModelConstants.BOUNCE_MIN);
    const loss = speed > onset ? StrictMath.pow(speed / onset, -GroundSolver.LOSS_EXPONENT) : 1.0;
    return SimMath.clamp(base * loss, 0.0, ModelConstants.RESTITUTION_MAX);
  }

  static digs(k) {
    return k < AirframeSpec.HULL_POINTS && k !== 8 && k !== 9 && k !== 11;
  }

  static absorbs(k) {
    return k >= AirframeSpec.ACCESSORY_GROUND;
  }

  static soft(k) {
    return k === 8 || k === 9 || (k >= AirframeSpec.HULL_POINTS && k < AirframeSpec.HULL_POINTS + 4);
  }

  // Java overloads, dispatched on arguments.length:
  //   solve(p, b, plane, h, mu, bounce, softBounce, crashSpeed, substep, vx0, vy0, vz0, lx0, ly0, lz0)
  //   solve(p, b, plane, planes, h, mu, bounce, softBounce, crashSpeed, substep, vx0, vy0, vz0, lx0, ly0, lz0)
  solve(p, b, plane, planes, h, mu, bounce, softBounce, crashSpeed, substep, vx0, vy0, vz0, lx0, ly0, lz0) {
    if (arguments.length === 15) {
      // planes is h here, and so on: shift the arguments of the short form by one.
      return this.solve(p, b, plane, null, planes, h, mu, bounce, softBounce, crashSpeed, substep, vx0, vy0, vz0, lx0);
    }
    this.vx = vx0;
    this.vy = vy0;
    this.vz = vz0;
    this.lx = lx0;
    this.ly = ly0;
    this.lz = lz0;
    this.normalImpulse = 0.0;
    this.newContacts = 0;
    this.touchMask = 0;
    this.approachSpeed = 0.0;
    this.tangentialSpeed = 0.0;
    const m = b.mass;
    let any = false;
    const count = p.groundCount();
    this.rates(b);
    for (let k = 0; k < GroundSolver.POINTS; k++) {
      this.active[k] = false;
      this.lambda[k] = 0.0;
      this.frictionX[k] = 0.0;
      this.frictionZ[k] = 0.0;
      this.depth[k] = -Infinity;
    }
    for (let k = 0; k < count; k++) {
      if (!p.groundUsed(k)) {
        continue;
      }
      const x = b.r00 * p.groundX(k) + b.r01 * p.groundY(k) + b.r02 * p.groundZ(k);
      const y = b.r10 * p.groundX(k) + b.r11 * p.groundY(k) + b.r12 * p.groundZ(k);
      const z = b.r20 * p.groundX(k) + b.r21 * p.groundY(k) + b.r22 * p.groundZ(k);
      const depth = (planes == null ? plane : planes[k]) - (b.py + y);
      this.depth[k] = depth;
      if (!(depth > -GroundSolver.REACH)) {
        continue;
      }
      this.active[k] = true;
      any = true;
      this.rx[k] = x;
      this.ry[k] = y;
      this.rz[k] = z;
      this.inverseInertia(b, -z, 0.0, x);
      this.massN[k] = 1.0 / (1.0 / m + this.iz * x - this.ix * z);
      this.inverseInertia(b, 0.0, z, -y);
      this.massX[k] = 1.0 / (1.0 / m + this.iy * z - this.iz * y);
      this.inverseInertia(b, y, -x, 0.0);
      this.massZ[k] = 1.0 / (1.0 / m + this.ix * y - this.iy * x);
      const vn = this.vy + (this.wz * x - this.wx * z);
      let goal;
      if (depth < 0.0) {
        goal = depth / h;
      } else if (substep && depth > GroundSolver.SLOP) {
        goal = Math.min(GroundSolver.PUSH_MAX, GroundSolver.PUSH_RATE * (depth - GroundSolver.SLOP));
      } else {
        goal = 0.0;
      }
      const base = GroundSolver.absorbs(k) ? 0.0 : GroundSolver.soft(k) ? softBounce : bounce;
      if (!this.wasTouching[k]) {
        this.grip[k] = 1.0;
      }
      const arriving = depth >= 0.0 || vn * Math.max(h, GroundSolver.IMPACT_TIME) <= depth;
      if (arriving && !this.wasTouching[k] && vn < -ModelConstants.BOUNCE_MIN) {
        const speed = -vn;
        const e = GroundSolver.restitution(base, speed, crashSpeed);
        goal = Math.max(goal, e * speed);
        if (GroundSolver.digs(k)) {
          this.grip[k] = Math.max(this.grip[k],
            1.0 + GroundSolver.DIG_GAIN * SimMath.smoothstep(GroundSolver.LOSS_ONSET * crashSpeed, crashSpeed, speed));
        }
      }
      this.target[k] = goal;
    }
    if (!any) {
      this.forget();
      return false;
    }
    const startVy = this.vy;
    const startT = Math.sqrt(this.vx * this.vx + this.vz * this.vz);
    if (substep) {
      for (let k = 0; k < count; k++) {
        if (this.active[k] && this.wasTouching[k] && this.warmN[k] > 0.0) {
          this.lambda[k] = this.warmN[k];
          this.frictionX[k] = this.warmX[k];
          this.frictionZ[k] = this.warmZ[k];
          this.push(b, k, this.warmX[k], this.warmN[k], this.warmZ[k]);
        }
      }
    }
    const tolerance = GroundSolver.TOLERANCE * m;
    for (let it = 0; it < GroundSolver.ITERATIONS; it++) {
      let change = 0.0;
      for (let n = 0; n < count; n++) {
        const k = (it & 1) === 0 ? n : count - 1 - n;
        if (!this.active[k]) {
          continue;
        }
        const x = this.rx[k];
        const y = this.ry[k];
        const z = this.rz[k];
        const vn = this.vy + (this.wz * x - this.wx * z);
        const next = Math.max(0.0, this.lambda[k] + (this.target[k] - vn) * this.massN[k]);
        const dn = next - this.lambda[k];
        this.lambda[k] = next;
        if (dn !== 0.0) {
          this.push(b, k, 0.0, dn, 0.0);
          change = Math.max(change, Math.abs(dn));
        }
        const limit = this.grip[k] * mu * next;
        const fx = this.frictionX[k];
        const fz = this.frictionZ[k];
        let nx = 0.0;
        let nz = 0.0;
        if (limit > 0.0) {
          const ux = this.vx + (this.wy * z - this.wz * y);
          const uz = this.vz + (this.wx * y - this.wy * x);
          nx = fx - ux * this.massX[k];
          nz = fz - uz * this.massZ[k];
          const size = Math.sqrt(nx * nx + nz * nz);
          if (size > limit) {
            nx *= limit / size;
            nz *= limit / size;
          }
        }
        if (nx !== fx || nz !== fz) {
          this.frictionX[k] = nx;
          this.frictionZ[k] = nz;
          this.push(b, k, nx - fx, 0.0, nz - fz);
          change = Math.max(change, Math.max(Math.abs(nx - fx), Math.abs(nz - fz)));
        }
      }
      if (change < tolerance) {
        break;
      }
    }
    let total = 0.0;
    for (let k = 0; k < GroundSolver.POINTS; k++) {
      const touch = this.active[k] && this.lambda[k] > 0.0;
      if (touch) {
        total += this.lambda[k];
        this.touchMask |= 1 << k;
        if (!this.wasTouching[k]) {
          this.newContacts |= 1 << k;
        }
      }
      this.touching[k] = touch;
      this.wasTouching[k] = touch;
      if (substep) {
        this.warmN[k] = touch ? this.lambda[k] : 0.0;
        this.warmX[k] = touch ? this.frictionX[k] : 0.0;
        this.warmZ[k] = touch ? this.frictionZ[k] : 0.0;
      }
    }
    this.normalImpulse = total;
    if (this.newContacts !== 0) {
      this.approachSpeed = Math.max(0.0, -startVy);
      this.tangentialSpeed = startT;
    }
    this.impulseX = (this.vx - vx0) * m;
    this.impulseY = (this.vy - vy0) * m;
    this.impulseZ = (this.vz - vz0) * m;
    this.angularX = this.lx - lx0;
    this.angularY = this.ly - ly0;
    this.angularZ = this.lz - lz0;
    return total > 0.0;
  }
}
