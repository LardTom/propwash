// Port of de.lardtom.propwash.sim.GroundSupport (1:1, Propwash 0.6.0): the ground under the drone from the support grid
// of SimEnvironment (5 × 5 heights across the hitbox, plus the points under accessory stands). Ground contact points
// and hull points over a lower or higher column get their own plane, and a drone resting with its centre over an edge
// tips over it (overhang).
import { AirframeSpec } from './AirframeSpec.js?v=d12a0862';
import { GroundSolver } from './GroundSolver.js?v=d2c6f4fb';
import { SimEnvironment } from './SimEnvironment.js?v=7adb2a2f';
import { SimMath } from './SimMath.js?v=44da8aea';
import { StrictMath } from './StrictMath.js?v=e765e983';

export class GroundSupport {
  static SIDE = SimEnvironment.SUPPORT_SIDE;
  static CELLS = SimEnvironment.SUPPORT_CELLS;
  static MATCH = 0.03;
  static EDGE_DROP = 0.03;
  static MAX_SPACING = 1.0;

  height = new Float64Array(GroundSupport.CELLS);
  planes = new Float64Array(AirframeSpec.GROUND_POINTS);
  angles = new Float64Array(GroundSupport.CELLS);
  pointHeight = new Float64Array(SimEnvironment.POINT_SUPPORT);
  pointX = new Float64Array(SimEnvironment.POINT_SUPPORT);
  pointZ = new Float64Array(SimEnvironment.POINT_SUPPORT);
  points = 0;
  spacing = 0.0;
  originX = 0.0;
  originZ = 0.0;
  edgeX = 0.0;
  edgeZ = 0.0;
  edgeLevel = 0.0;

  static sanitize(src, dst) {
    const s = src.supportSpacing;
    if (!(s > 0.0) || !(s <= GroundSupport.MAX_SPACING) || !Number.isFinite(src.supportX) || !Number.isFinite(src.supportZ)) {
      dst.clearSupport();
      return;
    }
    dst.supportSpacing = s;
    dst.supportX = src.supportX;
    dst.supportZ = src.supportZ;
    for (let k = 0; k < GroundSupport.CELLS; k++) {
      const h = src.support[k];
      dst.support[k] = h === Infinity ? NaN : h;
    }
    const n = src.pointCount;
    dst.pointCount = 0;
    if (!(n > 0 && n <= SimEnvironment.POINT_SUPPORT)) {
      return;
    }
    for (let j = 0; j < n; j++) {
      const x = src.pointX[j];
      const z = src.pointZ[j];
      if (!Number.isFinite(x) || !Number.isFinite(z)) {
        return;
      }
      const h = src.pointSupport[j];
      dst.pointX[j] = x;
      dst.pointZ[j] = z;
      dst.pointSupport[j] = h === Infinity ? NaN : h;
    }
    dst.pointCount = n;
  }

  load(env) {
    this.spacing = env.supportSpacing;
    if (!(this.spacing > 0.0)) {
      return;
    }
    this.originX = env.supportX;
    this.originZ = env.supportZ;
    this.height.set(env.support.subarray(0, GroundSupport.CELLS));
    this.points = env.pointCount;
    for (let j = 0; j < this.points; j++) {
      this.pointHeight[j] = env.pointSupport[j];
      this.pointX[j] = env.pointX[j];
      this.pointZ[j] = env.pointZ[j];
    }
  }

  forget() {
    this.spacing = 0.0;
  }

  valid() {
    return this.spacing > 0.0;
  }

  at(x, z) {
    // Math.round (long) of the JVM: round half up like JS Math.round, NaN -> 0.
    const ix = javaRound((x - this.originX) / this.spacing) + (GroundSupport.SIDE >> 1);
    const iz = javaRound((z - this.originZ) / this.spacing) + (GroundSupport.SIDE >> 1);
    if (ix < -1 || ix > GroundSupport.SIDE || iz < -1 || iz > GroundSupport.SIDE) {
      return NaN;
    }
    const cx = Math.max(0, Math.min(GroundSupport.SIDE - 1, ix));
    const cz = Math.max(0, Math.min(GroundSupport.SIDE - 1, iz));
    return this.height[SimEnvironment.supportCell(cx, cz)];
  }

  under(point, x, z) {
    const near = 0.5 * this.spacing;
    if (point < this.points && Math.abs(x - this.pointX[point]) <= near && Math.abs(z - this.pointZ[point]) <= near) {
      return this.pointHeight[point];
    }
    return this.at(x, z);
  }

  static pick(plane, support) {
    if (Number.isNaN(support) || Math.abs(support - plane) <= GroundSupport.MATCH) {
      return plane;
    }
    return support;
  }

  groundPlanes(p, b, plane, overhang) {
    const corners = p.accessoryPointCount();
    if (!overhang && (corners === 0 || !this.valid())) {
      return null;
    }
    const first = overhang ? 0 : AirframeSpec.ACCESSORY_GROUND;
    this.planes.fill(plane, 0, first);
    const floor = b.py + p.hitboxFootOffset - SimEnvironment.SUPPORT_RANGE;
    for (let k = first; k < p.groundCount(); k++) {
      const x = b.px + b.r00 * p.groundX(k) + b.r01 * p.groundY(k) + b.r02 * p.groundZ(k);
      const y = b.py + b.r10 * p.groundX(k) + b.r11 * p.groundY(k) + b.r12 * p.groundZ(k);
      const z = b.pz + b.r20 * p.groundX(k) + b.r21 * p.groundY(k) + b.r22 * p.groundZ(k);
      let support = k < AirframeSpec.ACCESSORY_GROUND ? this.at(x, z) : this.under(k - AirframeSpec.ACCESSORY_GROUND, x, z);
      if (!overhang && support === -Infinity && y - GroundSolver.REACH < floor) {
        support = NaN;
      }
      this.planes[k] = GroundSupport.pick(plane, support);
    }
    if (corners > 0) {
      this.capStandLegs(p, corners);
    }
    return this.planes;
  }

  capStandLegs(p, corners) {
    const legs = AirframeSpec.ACCESSORY_GROUND + corners;
    if (legs >= p.groundCount()) {
      return;
    }
    const level = p.groundY(legs);
    let reach = -Infinity;
    for (let k = AirframeSpec.ACCESSORY_GROUND; k < legs; k++) {
      reach = Math.max(reach, this.planes[k] - (p.groundY(k) - level));
    }
    for (let k = legs; k < p.groundCount(); k++) {
      this.planes[k] = Math.min(this.planes[k], reach);
    }
  }

  hullPlanes(p, b, plane) {
    for (let k = 0; k < AirframeSpec.HULL_POINTS; k++) {
      const x = b.px + b.r00 * p.hullX(k) + b.r01 * p.hullY(k) + b.r02 * p.hullZ(k);
      const z = b.pz + b.r20 * p.hullX(k) + b.r21 * p.hullY(k) + b.r22 * p.hullZ(k);
      this.planes[k] = GroundSupport.pick(plane, this.at(x, z));
    }
    return this.planes;
  }

  overhang(b, level) {
    if (!this.valid()) {
      return false;
    }
    const under = this.at(b.px, b.pz);
    if (Number.isNaN(under) || under >= level - GroundSupport.EDGE_DROP) {
      return false;
    }
    const half = 0.5 * this.spacing;
    let best = Infinity;
    let n = 0;
    for (let iz = 0; iz < GroundSupport.SIDE; iz++) {
      for (let ix = 0; ix < GroundSupport.SIDE; ix++) {
        const h = this.height[SimEnvironment.supportCell(ix, iz)];
        if (!(h >= level - GroundSupport.EDGE_DROP) || !(h <= level + GroundSupport.MATCH)) {
          continue;
        }
        const cx = this.originX + SimEnvironment.supportOffset(ix, this.spacing);
        const cz = this.originZ + SimEnvironment.supportOffset(iz, this.spacing);
        const dx = cx - b.px;
        const dz = cz - b.pz;
        if (dx * dx + dz * dz < 1.0E-12) {
          return false;
        }
        this.angles[n++] = StrictMath.atan2(dz, dx);
        const ex = SimMath.clamp(b.px, cx - half, cx + half);
        const ez = SimMath.clamp(b.pz, cz - half, cz + half);
        const d = (ex - b.px) * (ex - b.px) + (ez - b.pz) * (ez - b.pz);
        if (d < best) {
          best = d;
          this.edgeX = ex;
          this.edgeZ = ez;
          this.edgeLevel = h;
        }
      }
    }
    if (!(best > 1.0E-12) || best === Infinity) {
      return false;
    }
    return !GroundSupport.surrounded(this.angles, n);
  }

  /** Arrays.sort(angles, 0, n) (a typed array sorts doubles in the same order, -0 before 0), then the largest gap. */
  static surrounded(angles, n) {
    if (n < 2) {
      return false;
    }
    angles.subarray(0, n).sort();
    let gap = angles[0] + 2.0 * Math.PI - angles[n - 1];
    for (let i = 1; i < n; i++) {
      gap = Math.max(gap, angles[i] - angles[i - 1]);
    }
    return gap <= Math.PI + 1.0E-9;
  }
}

function javaRound(x) {
  return Number.isNaN(x) ? 0 : Math.round(x);
}
