// Runs the ported flight model (model/DroneSim.js) in the voxel world, the way Propwash's pilot session does in Minecraft
// (drone.client.PilotSession: environment probes, frame slicing, entity move with block collision, afterMove report)
// with the block clipping of rescue.VoxelFlight, generalised to the map's 0.5 m cells.

import { DroneSim } from './model/DroneSim.js?v=dc95b3f1';
import { PilotInput } from './model/PilotInput.js?v=d7d531ac';
import { SimEnvironment } from './model/SimEnvironment.js?v=ac225747';
import { StepResult } from './model/StepResult.js?v=786e7d96';
import { MoveReport } from './model/MoveReport.js?v=79f0bfaa';
import { StabMode } from './model/StabMode.js?v=ef37a80a';

const EPS = 1e-7;
// PilotSession
const SLICE_DISTANCE = 0.5;
const MAX_SLICES = 4;
const GROUND_PROBE = 5.0;
const SOLID_PROBE = 1.0;
const HIT_EPSILON = 1.0e-7;
const SUPPORT_PROBE = 0.05;
const MAX_FRAME_SECONDS = 0.05;
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
    this.wind = true;
    this.events = [];
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
    env.ambientTempC = 20.0;
    env.skyView = 1.0;
    if (this.wind) {
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
  }

  move(dx, dy, dz) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz)) {
      dx = 0.0;
      dy = 0.0;
      dz = 0.0;
    }
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
    // Concrete: Minecraft friction 0.6 -> grip (1 - 0.6) / 0.4 = 1, no special restitution (PilotSession.fillSurface).
    if (r.hitX || r.hitY || r.hitZ || this.sim.telemetry.grounded) r.surfaceGrip = 1.0;
    const t = this.sim.telemetry;
    if (t.grounded || t.sleeping) {
      this.updateBox();
      r.supportGap = -this.clip(1, -SUPPORT_PROBE);
    }
    this.sim.afterMove(r);
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
