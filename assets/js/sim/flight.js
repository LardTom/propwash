// Runs the ported flight model (model/DroneSim.js) in the voxel world, the way Propwash's pilot session does in Minecraft
// (drone.client.PilotSession of Propwash 0.6.0: environment probes, frame slicing, entity move with block collision,
// afterMove report) with the block clipping of rescue.VoxelFlight, generalised to the map's cells (world.cell, 0.5 m):
// - the support grid under the drone (drone.DroneGround#fillSupport/fillPoints): ground heights of 5 × 5 columns across
//   the hitbox and under accessory stands, so the drone tips over edges;
// - the surface of the touched cells (drone.SurfaceMaterials#fill): the map is concrete (Minecraft friction 0.6f), a
//   world may answer surface(i, j, k) with another SurfaceResponse; sticky blocks (honey) do not exist in the map;
// - pushing the drone out of cells it is stuck in (drone.Depenetration#escape).
// Left out: entity colliders (other drones, boats), soft ground (snow), fluids, collision flags of add-ons (ghost).
// The stand points are turned with the sim's double-precision rotation (the mod turns the entity's float quaternion).

import { DroneSim } from './model/DroneSim.js?v=6c89bd62';
import { PilotInput } from './model/PilotInput.js?v=d7d531ac';
import { SimEnvironment } from './model/SimEnvironment.js?v=7adb2a2f';
import { StepResult } from './model/StepResult.js?v=786e7d96';
import { MoveReport } from './model/MoveReport.js?v=b44086c1';
import { StabMode } from './model/StabMode.js?v=ef37a80a';
import { SurfaceResponse } from './model/SurfaceResponse.js?v=bc7fb0a6';
import { AirframeSpec } from './model/AirframeSpec.js?v=d12a0862';

const EPS = 1e-7;
// PilotSession
const SLICE_DISTANCE = 0.5;
const MAX_SLICES = 4;
const GROUND_PROBE = 5.0;
const SOLID_PROBE = 1.0;
const HIT_EPSILON = 1.0e-7;
const SUPPORT_PROBE = 0.05;
const MAX_FRAME_SECONDS = 0.05;
// DroneGround
const SUPPORT_START = 0.01;
const TALL_SHAPE_REACH = 1;
// VoxelShape#clip: the start is tested a thousandth of the ray inside.
const CLIP_INSIDE = 0.001;
// SurfaceMaterials
const BELOW_REACH = 1.0;
const FACE_REACH = 0.25;
const INSIDE = 1.0e-3;
const EDGE = 1.0e-7;
const OBLIQUE_AXIS = 0.35;
// Block.getFriction() of concrete: the float 0.6f.
const CONCRETE = SurfaceResponse.normal(Math.fround(0.6));
// Depenetration
const DEPEN_TOLERANCE = 1.0e-3;
const DEPEN_REACH = 1.5;
const DEPEN_CLEARANCE = 1.0e-4;
const DEPEN_MAX_CELLS = 4096;
const DEPEN_TIE = 1.0e-6;
const DIRECTIONS = [[0.0, 1.0, 0.0], [1.0, 0.0, 0.0], [-1.0, 0.0, 0.0], [0.0, 0.0, 1.0], [0.0, 0.0, -1.0], [0.0, -1.0, 0.0]];
// WindModel (overworld, clear weather)
const CALM_SPEED = 1.2;
const REFERENCE_HEIGHT = 10.0;
const PROFILE_EXPONENT = 0.14;
const CALM_GUSTS = 0.12;

export class Flight {
  /**
   * @param {DroneSim} sim
   * @param {import('./world.js?v=3d604f11').VoxelWorld} world
   */
  constructor(sim, world) {
    this.sim = sim;
    this.world = world;
    this.input = new PilotInput();
    this.input.mode = StabMode.ACRO;
    this.input.linkOk = true;
    this.env = new SimEnvironment();
    this.result = new StepResult();
    this.report = new MoveReport();
    const p = sim.params;
    this.halfWidth = 0.5 * p.hitboxWidth;
    this.height = p.hitboxHeight;
    this.foot = p.hitboxFootOffset;
    this.min = [0, 0, 0];
    this.max = [0, 0, 0];
    this.cell = [0, 0, 0];
    this.x = 0;
    this.y = 0; // centre of mass (the sim's position), like VoxelFlight
    this.z = 0;
    this.time = 0;
    // true: the overworld wind of a clear day (WindModel); false: calm; {x, y, z, gusts}: a fixed wind (for tests).
    this.wind = true;
    this.events = [];
    this.ambientTempC = 20.0;
    this.mix = new SurfaceResponse.Mix();
  }

  /**
   * Puts the drone with the bottom of its box at (x, bottom, z), level, heading in radians (0 = +Z). Like the game, an arm
   * switch that is already on must be switched off first; with rearm the next "on" counts as switching it on (the page
   * holds the switch back until the throttle is low).
   */
  place(bottomX, bottomY, bottomZ, headingRad, { rearm = false } = {}) {
    this.x = bottomX;
    this.y = bottomY - this.foot;
    this.z = bottomZ;
    this.sim.reset(this.x, this.y, this.z, headingRad);
    if (rearm) {
      this.sim.arming.pendingSwitchCheck = false;
      this.sim.arming.switchNeedsReset = false;
      this.sim.arming.lastSwitch = false;
    } else {
      this.sim.requireArmSwitchReset();
    }
  }

  bottom() {
    return this.y + this.foot;
  }

  /** One rendered frame: environment, input, sliced physics steps with block collision. Returns the sim events. */
  frame(seconds) {
    const sim = this.sim;
    const dt = Math.max(0, Math.min(MAX_FRAME_SECONDS, seconds));
    this.time += dt;
    this.fillEnvironment();
    const speed = sim.telemetry.speed;
    const slices = Number.isFinite(speed) ? Math.max(1, Math.min(MAX_SLICES, Math.ceil(speed * dt / SLICE_DISTANCE))) : 1;
    const events = [];
    let remaining = dt;
    for (let i = 0; i < slices; i++) {
      const part = i === slices - 1 ? remaining : dt / slices;
      remaining -= part;
      sim.step(part, this.input, this.env, this.result);
      this.move(this.result.dx, this.result.dy, this.result.dz);
      const q = sim.events;
      for (let k = 0; k < q.size(); k++) events.push({ type: q.type(k), time: q.time(k), value: q.value(k), motor: q.motor(k) });
    }
    return events;
  }

  fillEnvironment() {
    const env = this.env;
    const x = this.x;
    const y = this.y;
    const z = this.z;
    env.groundDistance = this.world.groundDistance(x, y, z, GROUND_PROBE);
    env.solidDistance = env.groundDistance < SOLID_PROBE ? this.world.groundDistance(x, y, z, SOLID_PROBE) : Infinity;
    env.airDensity = 1.225;
    env.ambientTempC = this.ambientTempC;
    env.skyView = 1.0;
    if (this.wind && typeof this.wind === 'object') {
      env.windX = this.wind.x;
      env.windY = this.wind.y;
      env.windZ = this.wind.z;
      env.gustIntensity = this.wind.gusts;
    } else if (this.wind) {
      const height = Number.isFinite(env.groundDistance) ? env.groundDistance : Math.max(REFERENCE_HEIGHT, y - this.world.floorY);
      const profile = Math.pow(Math.max(0.5, Math.min(60.0, height)) / REFERENCE_HEIGHT, PROFILE_EXPONENT);
      const speed = CALM_SPEED * profile;
      const ticks = 6000 + this.time * 20.0;
      const angle = ticks / 24000.0 * Math.PI * 1.4 + 0.35 * Math.sin(ticks / 3100.0);
      env.windX = Math.cos(angle) * speed;
      env.windY = 0.0;
      env.windZ = Math.sin(angle) * speed;
      env.gustIntensity = CALM_GUSTS;
    } else {
      env.windX = 0.0;
      env.windY = 0.0;
      env.windZ = 0.0;
      env.gustIntensity = 0.0;
    }
    const near = env.groundDistance < SOLID_PROBE || this.sim.telemetry.grounded;
    if (near) {
      this.fillSupport(x, y + this.foot, z, 2.0 * this.halfWidth, env);
      this.fillPoints(x, y + this.foot, z, env);
    } else {
      env.clearSupport();
    }
  }

  /** DroneGround#fillSupport: ground heights of the 5 × 5 columns across the hitbox, half a metre down from its bottom. */
  fillSupport(x, bottom, z, width, env) {
    const side = SimEnvironment.SUPPORT_SIDE;
    const spacing = SimEnvironment.supportSpacing(width);
    const start = bottom + SUPPORT_START;
    const range = SimEnvironment.SUPPORT_RANGE;
    env.supportSpacing = spacing;
    env.supportX = x;
    env.supportZ = z;
    for (let iz = 0; iz < side; iz++) {
      for (let ix = 0; ix < side; ix++) {
        const cx = x + SimEnvironment.supportOffset(ix, spacing);
        const cz = z + SimEnvironment.supportOffset(iz, spacing);
        env.support[SimEnvironment.supportCell(ix, iz)] = this.blockTop(cx, start, cz, range);
      }
    }
  }

  /** DroneGround#fillPoints: the ground under the stand points of accessories that reach below the hull. */
  fillPoints(x, bottom, z, env) {
    const p = this.sim.params;
    const count = Math.min(p.standPointCount(), SimEnvironment.POINT_SUPPORT);
    env.pointCount = 0;
    if (count <= 0 || !(env.supportSpacing > 0.0)) return;
    const b = this.sim.body;
    const start = bottom + SUPPORT_START;
    const range = SimEnvironment.SUPPORT_RANGE;
    for (let j = 0; j < count; j++) {
      const k = AirframeSpec.ACCESSORY_GROUND + j;
      const gx = p.groundX(k);
      const gy = p.groundY(k);
      const gz = p.groundZ(k);
      env.pointX[j] = x + (b.r00 * gx + b.r01 * gy + b.r02 * gz);
      env.pointZ[j] = z + (b.r20 * gx + b.r21 * gy + b.r22 * gz);
    }
    for (let j = 0; j < count; j++) env.pointSupport[j] = this.blockTop(env.pointX[j], start, env.pointZ[j], range);
    env.pointCount = count;
  }

  /**
   * DroneGround#blockTop on the cells: the highest cell top a ray from start down by range meets, -Infinity if none,
   * NaN if the ray starts inside a cell.
   */
  blockTop(x, start, z, range) {
    const w = this.world;
    const c = w.cell;
    const i = w.cellOf(0, x);
    const k = w.cellOf(2, z);
    const inside = start - CLIP_INSIDE * range;
    const lowest = w.cellOf(1, start - range) - TALL_SHAPE_REACH;
    let best = -Infinity;
    for (let j = w.cellOf(1, start); j >= lowest; j--) {
      if (!w.solid(i, j, k)) continue;
      const floor = w.origin[1] + j * c;
      const top = floor + c;
      if (inside >= floor && inside < top) return NaN;
      if (top <= start && top >= start - range) best = Math.max(best, top);
    }
    return best;
  }

  move(dx, dy, dz) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz)) {
      dx = 0.0;
      dy = 0.0;
      dz = 0.0;
    }
    this.escape();
    this.updateBox();
    const ay = this.clip(1, dy);
    this.y += ay;
    this.updateBox();
    let ax;
    let az;
    if (Math.abs(dx) >= Math.abs(dz)) {
      ax = this.clip(0, dx);
      this.x += ax;
      this.updateBox();
      az = this.clip(2, dz);
      this.z += az;
    } else {
      az = this.clip(2, dz);
      this.z += az;
      this.updateBox();
      ax = this.clip(0, dx);
      this.x += ax;
    }
    const r = this.report;
    r.clear();
    r.requestedX = dx;
    r.requestedY = dy;
    r.requestedZ = dz;
    r.actualX = ax;
    r.actualY = ay;
    r.actualZ = az;
    r.hitX = Math.abs(ax - dx) > HIT_EPSILON;
    r.hitY = Math.abs(ay - dy) > HIT_EPSILON;
    r.hitZ = Math.abs(az - dz) > HIT_EPSILON;
    const t = this.sim.telemetry;
    this.updateBox();
    if (r.hitX || r.hitY || r.hitZ || r.obliqueContact() || t.grounded || Number.isFinite(this.env.solidDistance)) {
      this.fillSurface(r, t.grounded);
    }
    if (t.grounded || t.sleeping) {
      r.supportGap = -this.clip(1, -SUPPORT_PROBE);
    }
    this.sim.afterMove(r);
  }

  /** SurfaceMaterials#fill: the surface with the largest contact area on the sides the move hit (below when resting). */
  fillSurface(r, grounded) {
    const sx = surfaceSide(r.hitX, r.requestedX, r.contactNormalX);
    let sy = surfaceSide(r.hitY, r.requestedY, r.contactNormalY);
    const sz = surfaceSide(r.hitZ, r.requestedZ, r.contactNormalZ);
    if (sy === 0.0 && (grounded || (sx === 0.0 && sz === 0.0))) sy = -1.0;
    const mix = this.mix;
    mix.clear();
    this.face(mix, 0, sx, FACE_REACH);
    this.face(mix, 1, sy, sy < 0.0 ? BELOW_REACH : FACE_REACH);
    this.face(mix, 2, sz, FACE_REACH);
    const response = mix.result();
    if (response != null) response.writeTo(r);
  }

  face(mix, axis, side, reach) {
    if (side === 0.0 || !Number.isFinite(side)) return;
    const w = this.world;
    const c = w.cell;
    const o = w.origin;
    const u = (axis + 1) % 3;
    const v = (axis + 2) % 3;
    const outward = side > 0.0;
    const plane = outward ? this.max[axis] : this.min[axis];
    const first = w.cellOf(axis, outward ? plane - INSIDE : plane + INSIDE);
    const last = w.cellOf(axis, outward ? plane + reach : plane - reach);
    const step = outward ? 1 : -1;
    const cell = this.cell;
    for (let i = w.cellOf(u, this.min[u] + EDGE); i <= w.cellOf(u, this.max[u] - EDGE); i++) {
      const du = Math.min(this.max[u], o[u] + (i + 1) * c) - Math.max(this.min[u], o[u] + i * c);
      for (let j = w.cellOf(v, this.min[v] + EDGE); j <= w.cellOf(v, this.max[v] - EDGE); j++) {
        const dv = Math.min(this.max[v], o[v] + (j + 1) * c) - Math.max(this.min[v], o[v] + j * c);
        if (!(du > 0.0) || !(dv > 0.0)) continue;
        cell[u] = i;
        cell[v] = j;
        for (let k = first; outward ? k <= last : k >= last; k += step) {
          cell[axis] = k;
          if (!w.solid(cell[0], cell[1], cell[2])) continue;
          const near = o[axis] + (outward ? k : k + 1) * c;
          const touching = outward ? near >= plane - INSIDE && near <= plane + reach : near <= plane + INSIDE && near >= plane - reach;
          if (!touching) continue;
          const response = w.surface ? w.surface(cell[0], cell[1], cell[2]) : null;
          mix.add(response || CONCRETE, du * dv);
          break;
        }
      }
    }
  }

  /** Depenetration#escape: a drone stuck in cells moves out along the shortest of six directions (at most 1.5 m). */
  escape() {
    const sim = this.sim;
    if (sim.telemetry.sleeping) return;
    this.updateBox();
    const box = [this.min[0], this.min[1], this.min[2], this.max[0], this.max[1], this.max[2]];
    const out = this.resolveOut(box);
    if (out == null) return;
    this.x += out[0];
    this.y += out[1];
    this.z += out[2];
    sim.pushOut(out[0], out[1], out[2]);
  }

  resolveOut(box) {
    if (box.some((v) => Number.isNaN(v))) return null;
    const core = inflate(box, -DEPEN_TOLERANCE);
    const touched = [];
    if (!this.collectCells(core, touched) || free(core, touched)) return null;
    const solids = [];
    if (!this.collectCells(inflate(box, DEPEN_REACH), solids)) return null;
    const inside = solids.filter((solid) => intersects(solid, core));
    let best = null;
    let bestDistance = Infinity;
    for (const direction of DIRECTIONS) {
      const distance = exitDistance(box, direction, DEPEN_REACH, solids, inside);
      if (distance < bestDistance - DEPEN_TIE) {
        bestDistance = distance;
        best = direction;
      }
    }
    return best == null ? null : [best[0] * bestDistance, best[1] * bestDistance, best[2] * bestDistance];
  }

  /** Depenetration#collect on the cells: the solid cells that intersect the area, false if the area is too large. */
  collectCells(area, out) {
    const w = this.world;
    const c = w.cell;
    const o = w.origin;
    const lo = [w.cellOf(0, area[0]), w.cellOf(1, area[1]), w.cellOf(2, area[2])];
    const hi = [w.cellOf(0, area[3]), w.cellOf(1, area[4]), w.cellOf(2, area[5])];
    if ((hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1) > DEPEN_MAX_CELLS) return false;
    for (let i = lo[0]; i <= hi[0]; i++) {
      for (let k = lo[2]; k <= hi[2]; k++) {
        for (let j = lo[1]; j <= hi[1]; j++) {
          if (!w.solid(i, j, k)) continue;
          const cellBox = [o[0] + i * c, o[1] + j * c, o[2] + k * c, o[0] + (i + 1) * c, o[1] + (j + 1) * c, o[2] + (k + 1) * c];
          if (intersects(cellBox, area)) out.push(cellBox);
        }
      }
    }
    return true;
  }

  updateBox() {
    const bottom = this.y + this.foot;
    this.min[0] = this.x - this.halfWidth;
    this.min[1] = bottom;
    this.min[2] = this.z - this.halfWidth;
    this.max[0] = this.x + this.halfWidth;
    this.max[1] = bottom + this.height;
    this.max[2] = this.z + this.halfWidth;
  }

  /** How far the box can move along an axis before it touches a solid cell (VoxelFlight.clip on the world's grid). */
  clip(axis, d) {
    if (d === 0.0 || !Number.isFinite(d)) return 0.0;
    const w = this.world;
    const c = w.cell;
    const o = w.origin;
    const a1 = (axis + 1) % 3;
    const a2 = (axis + 2) % 3;
    const lo1 = Math.floor((this.min[a1] - o[a1]) / c + EPS);
    const hi1 = Math.floor((this.max[a1] - o[a1]) / c - EPS);
    const lo2 = Math.floor((this.min[a2] - o[a2]) / c + EPS);
    const hi2 = Math.floor((this.max[a2] - o[a2]) / c - EPS);
    if (d > 0.0) {
      const maxCell = (this.max[axis] - o[axis]) / c;
      const start = Math.ceil(maxCell - EPS);
      const end = Math.ceil((this.max[axis] + d - o[axis]) / c) - 1;
      for (let k = start; k <= end; k++) {
        if (this.slabSolid(axis, k, a1, lo1, hi1, a2, lo2, hi2)) {
          return Math.max(0.0, Math.min(d, o[axis] + k * c - this.max[axis]));
        }
      }
      return d;
    }
    const minCell = (this.min[axis] - o[axis]) / c;
    const start = Math.floor(minCell + EPS) - 1;
    const end = Math.floor((this.min[axis] + d - o[axis]) / c);
    for (let k = start; k >= end; k--) {
      if (this.slabSolid(axis, k, a1, lo1, hi1, a2, lo2, hi2)) {
        return Math.min(0.0, Math.max(d, o[axis] + (k + 1) * c - this.min[axis]));
      }
    }
    return d;
  }

  slabSolid(axis, k, a1, lo1, hi1, a2, lo2, hi2) {
    const cell = this.cell;
    cell[axis] = k;
    for (let i = lo1; i <= hi1; i++) {
      cell[a1] = i;
      for (let j = lo2; j <= hi2; j++) {
        cell[a2] = j;
        if (this.world.solid(cell[0], cell[1], cell[2])) return true;
      }
    }
    return false;
  }
}

/** SurfaceMaterials#side */
function surfaceSide(hit, requested, normal) {
  if (hit && requested !== 0.0) return Math.sign(requested);
  if (Number.isFinite(normal) && Math.abs(normal) > OBLIQUE_AXIS) return -Math.sign(normal);
  return 0.0;
}

// Boxes are [minX, minY, minZ, maxX, maxY, maxZ] (Minecraft's AABB).
function inflate(b, d) {
  return [b[0] - d, b[1] - d, b[2] - d, b[3] + d, b[4] + d, b[5] + d];
}

function intersects(a, b) {
  return a[0] < b[3] && a[3] > b[0] && a[1] < b[4] && a[4] > b[1] && a[2] < b[5] && a[5] > b[2];
}

function free(box, solids) {
  for (const solid of solids) if (intersects(solid, box)) return false;
  return true;
}

/** AABB#move then AABB#expandTowards: the box swept along shift. */
function swept(box, shift) {
  const out = box.slice();
  for (let a = 0; a < 3; a++) {
    if (shift[a] < 0.0) out[a] += shift[a];
    else if (shift[a] > 0.0) out[a + 3] += shift[a];
  }
  return out;
}

/** Depenetration#clearing */
function clearing(box, d, solid) {
  if (d[0] > 0.0) return solid[3] - box[0];
  if (d[0] < 0.0) return box[3] - solid[0];
  if (d[1] > 0.0) return solid[4] - box[1];
  if (d[1] < 0.0) return box[4] - solid[1];
  if (d[2] > 0.0) return solid[5] - box[2];
  return box[5] - solid[2];
}

/** Depenetration#exit: the shortest step along direction after which the box is free, without crossing new solids. */
function exitDistance(box, direction, limit, solids, inside) {
  const steps = [];
  for (const solid of solids) {
    const step = clearing(box, direction, solid);
    if (step > 0.0 && step + DEPEN_CLEARANCE <= limit) steps.push(step + DEPEN_CLEARANCE);
  }
  steps.sort((a, b) => a - b);
  for (const step of steps) {
    const shift = [direction[0] * step, direction[1] * step, direction[2] * step];
    const moved = [box[0] + shift[0], box[1] + shift[1], box[2] + shift[2], box[3] + shift[0], box[4] + shift[1], box[5] + shift[2]];
    if (!free(moved, solids)) continue;
    const path = inflate(swept(box, shift), -DEPEN_TOLERANCE);
    for (const solid of solids) {
      if (intersects(solid, path) && !inside.includes(solid)) return Infinity;
    }
    return step;
  }
  return Infinity;
}
