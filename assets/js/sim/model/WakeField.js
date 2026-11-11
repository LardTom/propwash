// Port of de.lardtom.propwash.sim.WakeField (1:1).
import { ModelConstants } from './ModelConstants.js?v=760466ce';
import { SimMath } from './SimMath.js?v=44da8aea';

export class WakeField {
  static CAPACITY = 32;
  static EMIT_INTERVAL = 80;
  static MIN_AGE = 0.15;
  static VELOCITY_TAU = 0.8;
  static STRENGTH_TAU = 1.2;
  static GROWTH = 0.8;
  static DISCARD = 0.03;

  cx = new Float64Array(WakeField.CAPACITY);
  cy = new Float64Array(WakeField.CAPACITY);
  cz = new Float64Array(WakeField.CAPACITY);
  vx = new Float64Array(WakeField.CAPACITY);
  vy = new Float64Array(WakeField.CAPACITY);
  vz = new Float64Array(WakeField.CAPACITY);
  strength = new Float64Array(WakeField.CAPACITY);
  radius0 = new Float64Array(WakeField.CAPACITY);
  age = new Float64Array(WakeField.CAPACITY);
  slotSeq = new Float64Array(WakeField.CAPACITY);
  alive = new Array(WakeField.CAPACITY).fill(false);
  sequence = 0;
  velocityDecay = 1.0;
  strengthDecay = 1.0;
  updateDt = 0.0;

  configure(updateDt) {
    this.updateDt = updateDt;
    this.velocityDecay = Math.exp(-updateDt / WakeField.VELOCITY_TAU);
    this.strengthDecay = Math.exp(-updateDt / WakeField.STRENGTH_TAU);
  }

  reset() {
    for (let k = 0; k < WakeField.CAPACITY; k++) {
      this.alive[k] = false;
      this.slotSeq[k] = -10;
    }
    this.sequence = 0;
  }

  aliveCount() {
    let n = 0;
    for (let k = 0; k < WakeField.CAPACITY; k++) {
      if (this.alive[k]) {
        n++;
      }
    }
    return n;
  }

  emit(enabled, p, rho, px, py, pz, ux, uy, uz, windX, windY, windZ, totalThrust, meanAxial) {
    const seq = this.sequence++;
    const slot = Math.trunc(seq % WakeField.CAPACITY);
    this.slotSeq[slot] = seq;
    const weight = p.massKg * ModelConstants.G;
    if (!enabled || totalThrust <= 0.15 * weight) {
      this.alive[slot] = false;
      return;
    }
    const vc = Math.max(0.0, meanAxial);
    const induced = -vc / 2.0 + Math.sqrt(vc * vc / 4.0 + totalThrust / (8.0 * rho * p.discArea));
    const offset = 0.5 * p.propDiameter;
    this.cx[slot] = px - offset * ux;
    this.cy[slot] = py - offset * uy;
    this.cz[slot] = pz - offset * uz;
    this.vx[slot] = windX - 2.0 * induced * ux;
    this.vy[slot] = windY - 2.0 * induced * uy;
    this.vz[slot] = windZ - 2.0 * induced * uz;
    this.strength[slot] = SimMath.clamp(totalThrust / weight, 0.0, 2.0) / 2.0;
    this.radius0[slot] = p.motorOffset + p.propRadius;
    this.age[slot] = 0.0;
    this.alive[slot] = true;
  }

  advance(windX, windY, windZ) {
    const dt = this.updateDt;
    for (let k = 0; k < WakeField.CAPACITY; k++) {
      if (!this.alive[k]) {
        continue;
      }
      this.cx[k] += this.vx[k] * dt;
      this.cy[k] += this.vy[k] * dt;
      this.cz[k] += this.vz[k] * dt;
      this.vx[k] = windX + (this.vx[k] - windX) * this.velocityDecay;
      this.vy[k] = windY + (this.vy[k] - windY) * this.velocityDecay;
      this.vz[k] = windZ + (this.vz[k] - windZ) * this.velocityDecay;
      this.age[k] += dt;
      this.strength[k] *= this.strengthDecay;
      if (this.strength[k] < WakeField.DISCARD) {
        this.alive[k] = false;
      }
    }
  }

  shift(dx, dy, dz) {
    for (let k = 0; k < WakeField.CAPACITY; k++) {
      this.cx[k] += dx;
      this.cy[k] += dy;
      this.cz[k] += dz;
    }
  }

  usable(k) {
    return this.alive[k] && this.age[k] >= WakeField.MIN_AGE;
  }

  query(px, py, pz, dvx, dvy, dvz, ux, uy, uz, vh) {
    let best = 0.0;
    for (let a = 0; a < WakeField.CAPACITY; a++) {
      if (!this.usable(a)) {
        continue;
      }
      let b = (a + 1) % WakeField.CAPACITY;
      const pair = this.usable(b) && this.slotSeq[b] === this.slotSeq[a] + 1;
      if (!pair) {
        b = a;
      }
      const ex = this.cx[b] - this.cx[a];
      const ey = this.cy[b] - this.cy[a];
      const ez = this.cz[b] - this.cz[a];
      const len2 = ex * ex + ey * ey + ez * ez;
      let t = 0.0;
      if (len2 > 1e-12) {
        t = SimMath.clamp01(((px - this.cx[a]) * ex + (py - this.cy[a]) * ey + (pz - this.cz[a]) * ez) / len2);
      }
      const qx = px - (this.cx[a] + t * ex);
      const qy = py - (this.cy[a] + t * ey);
      const qz = pz - (this.cz[a] + t * ez);
      const dist = Math.sqrt(qx * qx + qy * qy + qz * qz);
      const r = this.radius0[a] * (1.0 + WakeField.GROWTH * this.age[a]) * (1.0 - t)
        + this.radius0[b] * (1.0 + WakeField.GROWTH * this.age[b]) * t;
      const st = this.strength[a] * (1.0 - t) + this.strength[b] * t;
      const overlap = 1.0 - SimMath.smoothstep(0.6 * r, 1.3 * r, dist);
      if (overlap <= 0.0) {
        continue;
      }
      const wx = this.vx[a] * (1.0 - t) + this.vx[b] * t;
      const wy = this.vy[a] * (1.0 - t) + this.vy[b] * t;
      const wz = this.vz[a] * (1.0 - t) + this.vz[b] * t;
      const rel = ((wx - dvx) * ux + (wy - dvy) * uy + (wz - dvz) * uz) / (0.5 * vh);
      const gamma = 0.25 + 0.75 * SimMath.clamp01(rel);
      const w = st * overlap * gamma;
      if (w > best) {
        best = w;
      }
    }
    return best;
  }
}
