// Keeps the FPV camera out of blocks, a port of Propwash's drone.client.EyeClearance and FpvEyeGuard: when the lens (or
// the near plane of the view) would be inside a block, the eye moves to the nearest free spot that the drone's centre
// of mass can see, at most MAX_SHIFT away, and the near plane shrinks down to MIN_NEAR when space is tight.

export const VANILLA_NEAR = 0.05;
export const MIN_NEAR = 0.01;
const MARGIN = 0.002;
const MAX_SHIFT = 0.6;
const MAX_AXES = 26;
const VALUES_PER_AXIS = 8;
const PULL_STEPS = 8;
const STEP_OUT = 1.0e-6;
const MAX_CANDIDATES = VALUES_PER_AXIS * VALUES_PER_AXIS * VALUES_PER_AXIS + PULL_STEPS;
const MAX_BLOCKS = 4096;

export class EyeClearance {
  constructor() {
    this.axes = new Float64Array(MAX_AXES * 3);
    this.low = new Float64Array(MAX_AXES);
    this.high = new Float64Array(MAX_AXES);
    this.axisCount = 0;
    this.boxes = new Float64Array(6 * 32);
    this.boxCount = 0;
    this.corners = new Float64Array(12);
    this.edges = new Float64Array(18);
    this.values = [new Float64Array(2 * 256 + 1), new Float64Array(2 * 256 + 1), new Float64Array(2 * 256 + 1)];
    this.valueCount = new Int32Array(3);
    this.candidates = new Float64Array(3 * MAX_CANDIDATES);
    this.order = [];
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.near = VANILLA_NEAR;
    this.moved = false;
    this.shortened = false;
  }

  view(fx, fy, fz, ux, uy, uz, lx, ly, lz, tanX, tanY) {
    const corners = this.corners;
    for (let i = 0; i < 4; i++) {
      const sx = (i === 0 || i === 3 ? 1.0 : -1.0) * tanX;
      const sy = (i < 2 ? 1.0 : -1.0) * tanY;
      corners[3 * i] = fx + sx * lx + sy * ux;
      corners[3 * i + 1] = fy + sx * ly + sy * uy;
      corners[3 * i + 2] = fz + sx * lz + sy * uz;
    }
    this.axisCount = 0;
    this.addAxis(1.0, 0.0, 0.0, corners);
    this.addAxis(0.0, 1.0, 0.0, corners);
    this.addAxis(0.0, 0.0, 1.0, corners);
    this.addAxis(fx, fy, fz, corners);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      this.addCross(corners[3 * i], corners[3 * i + 1], corners[3 * i + 2], corners[3 * j], corners[3 * j + 1], corners[3 * j + 2], corners);
    }
    const edges = this.edges;
    edges[0] = lx; edges[1] = ly; edges[2] = lz;
    edges[3] = ux; edges[4] = uy; edges[5] = uz;
    edges.set(corners, 6);
    for (let k = 0; k < 3; k++) {
      const ex = k === 0 ? 1.0 : 0.0;
      const ey = k === 1 ? 1.0 : 0.0;
      const ez = k === 2 ? 1.0 : 0.0;
      for (let e = 0; e < 6; e++) this.addCross(ex, ey, ez, edges[3 * e], edges[3 * e + 1], edges[3 * e + 2], corners);
    }
  }

  addCross(ax, ay, az, bx, by, bz, corners) {
    this.addAxis(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx, corners);
  }

  addAxis(ax, ay, az, corners) {
    const length = Math.sqrt(ax * ax + ay * ay + az * az);
    if (length < 1.0e-9 || this.axisCount >= MAX_AXES) return;
    ax /= length;
    ay /= length;
    az /= length;
    let lo = 0.0;
    let hi = 0.0;
    for (let i = 0; i < 4; i++) {
      const d = corners[3 * i] * ax + corners[3 * i + 1] * ay + corners[3 * i + 2] * az;
      lo = Math.min(lo, d);
      hi = Math.max(hi, d);
    }
    const a = this.axisCount++;
    this.axes[3 * a] = ax;
    this.axes[3 * a + 1] = ay;
    this.axes[3 * a + 2] = az;
    this.low[a] = lo;
    this.high[a] = hi;
  }

  clearBoxes() {
    this.boxCount = 0;
  }

  addBox(minX, minY, minZ, maxX, maxY, maxZ) {
    if (!(maxX > minX && maxY > minY && maxZ > minZ)) return;
    if (6 * (this.boxCount + 1) > this.boxes.length) {
      const grown = new Float64Array(this.boxes.length * 2);
      grown.set(this.boxes);
      this.boxes = grown;
    }
    const o = 6 * this.boxCount++;
    const b = this.boxes;
    b[o] = minX; b[o + 1] = minY; b[o + 2] = minZ;
    b[o + 3] = maxX; b[o + 4] = maxY; b[o + 5] = maxZ;
  }

  clearNear(px, py, pz) {
    let best = Infinity;
    for (let b = 0; b < this.boxCount && best > 0.0; b++) best = Math.min(best, this.clearNearBox(px, py, pz, b));
    return best;
  }

  clearNearBox(px, py, pz, b) {
    const o = 6 * b;
    const bx = this.boxes;
    const cx = 0.5 * (bx[o] + bx[o + 3]);
    const cy = 0.5 * (bx[o + 1] + bx[o + 4]);
    const cz = 0.5 * (bx[o + 2] + bx[o + 5]);
    const hx = 0.5 * (bx[o + 3] - bx[o]) + MARGIN;
    const hy = 0.5 * (bx[o + 4] - bx[o + 1]) + MARGIN;
    const hz = 0.5 * (bx[o + 5] - bx[o + 2]) + MARGIN;
    let allowed = 0.0;
    for (let a = 0; a < this.axisCount; a++) {
      const ax = this.axes[3 * a];
      const ay = this.axes[3 * a + 1];
      const az = this.axes[3 * a + 2];
      const center = cx * ax + cy * ay + cz * az;
      const radius = hx * Math.abs(ax) + hy * Math.abs(ay) + hz * Math.abs(az);
      const s = px * ax + py * ay + pz * az;
      let gap;
      if (s <= center - radius) gap = this.high[a] > 0.0 ? (center - radius - s) / this.high[a] : Infinity;
      else if (s >= center + radius) gap = this.low[a] < 0.0 ? (s - center - radius) / -this.low[a] : Infinity;
      else gap = 0.0;
      if (gap > allowed) {
        allowed = gap;
        if (allowed === Infinity) break;
      }
    }
    return allowed;
  }

  sightBlocked(ax, ay, az, px, py, pz) {
    const dx = px - ax;
    const dy = py - ay;
    const dz = pz - az;
    const bx = this.boxes;
    for (let b = 0; b < this.boxCount; b++) {
      const o = 6 * b;
      if (ax >= bx[o] && ax <= bx[o + 3] && ay >= bx[o + 1] && ay <= bx[o + 4] && az >= bx[o + 2] && az <= bx[o + 5]) continue;
      let enter = 0.0;
      let exit = 1.0;
      let hit = true;
      for (let k = 0; k < 3 && hit; k++) {
        const start = k === 0 ? ax : k === 1 ? ay : az;
        const delta = k === 0 ? dx : k === 1 ? dy : dz;
        const min = bx[o + k];
        const max = bx[o + 3 + k];
        if (Math.abs(delta) < 1.0e-12) {
          hit = start > min && start < max;
        } else {
          const t0 = (min - start) / delta;
          const t1 = (max - start) / delta;
          enter = Math.max(enter, Math.min(t0, t1));
          exit = Math.min(exit, Math.max(t0, t1));
          hit = enter < exit;
        }
      }
      if (hit) return true;
    }
    return false;
  }

  /** @param {(minX, minY, minZ, maxX, maxY, maxZ, sink) => void} collect adds the solid boxes in the region */
  resolve(ex, ey, ez, ax, ay, az, preferredNear, minNear, collect) {
    const wanted = Math.max(preferredNear, 0.0);
    const least = Math.min(Math.max(minNear, 0.0), wanted);
    const reach = this.reach(wanted);
    this.clearBoxes();
    collect(Math.min(ex - reach, ax - MARGIN), Math.min(ey - reach, ay - MARGIN), Math.min(ez - reach, az - MARGIN),
      Math.max(ex + reach, ax + MARGIN), Math.max(ey + reach, ay + MARGIN), Math.max(ez + reach, az + MARGIN), this);
    const anchorFree = this.clearNear(ax, ay, az) > 0.0;
    if (anchorFree && this.keepEye(ex, ey, ez, ax, ay, az, wanted, least)) return this.shortened;
    const wide = MAX_SHIFT + reach;
    this.clearBoxes();
    collect(Math.min(ex, ax) - wide, Math.min(ey, ay) - wide, Math.min(ez, az) - wide,
      Math.max(ex, ax) + wide, Math.max(ey, ay) + wide, Math.max(ez, az) + wide, this);
    let sx = ax;
    let sy = ay;
    let sz = az;
    if (!anchorFree) {
      const count = this.gatherCandidates(ax, ay, az, ax, ay, az, 0.0);
      for (let i = 0; i < count; i++) {
        const c = this.order[i].c;
        if (this.clearNear(this.candidates[3 * c], this.candidates[3 * c + 1], this.candidates[3 * c + 2]) > 0.0) {
          sx = this.candidates[3 * c];
          sy = this.candidates[3 * c + 1];
          sz = this.candidates[3 * c + 2];
          break;
        }
      }
      if (this.keepEye(ex, ey, ez, sx, sy, sz, wanted, least)) return this.shortened;
    }
    const count = this.gatherCandidates(ex, ey, ez, sx, sy, sz, least);
    for (let i = 0; i < count; i++) {
      const c = this.order[i].c;
      const cx = this.candidates[3 * c];
      const cy = this.candidates[3 * c + 1];
      const cz = this.candidates[3 * c + 2];
      const room = this.clearNear(cx, cy, cz);
      if (room >= least && room > 0.0 && !this.sightBlocked(sx, sy, sz, cx, cy, cz)) {
        this.accept(cx, cy, cz, Math.min(room, wanted), true, room < wanted);
        return true;
      }
    }
    const room = this.clearNear(sx, sy, sz);
    this.accept(sx, sy, sz, Math.max(least, Math.min(room, wanted)), true, true);
    return true;
  }

  keepEye(ex, ey, ez, sx, sy, sz, wanted, least) {
    const free = this.clearNear(ex, ey, ez);
    if (free <= 0.0 || free < least || this.sightBlocked(sx, sy, sz, ex, ey, ez)) return false;
    this.accept(ex, ey, ez, Math.min(free, wanted), false, free < wanted);
    return true;
  }

  reach(nearDistance) {
    let extent = 0.0;
    for (let k = 0; k < 3; k++) extent = Math.max(extent, Math.max(-this.low[k], this.high[k]));
    return nearDistance * extent + MARGIN + STEP_OUT;
  }

  gatherCandidates(ex, ey, ez, ax, ay, az, least) {
    const eye = [ex, ey, ez];
    for (let k = 0; k < 3; k++) {
      const list = this.values[k];
      let n = 0;
      list[n++] = eye[k];
      for (let b = 0; b < this.boxCount; b++) {
        const min = this.boxes[6 * b + k] - MARGIN - least * this.high[k] - STEP_OUT;
        const max = this.boxes[6 * b + 3 + k] + MARGIN - least * this.low[k] + STEP_OUT;
        n = this.offer(list, n, eye[k], min);
        n = this.offer(list, n, eye[k], max);
      }
      this.valueCount[k] = Math.min(n, VALUES_PER_AXIS);
      sortByDistance(list, n, eye[k]);
    }
    this.order.length = 0;
    let count = 0;
    for (let i = 0; i < this.valueCount[0]; i++) {
      for (let j = 0; j < this.valueCount[1]; j++) {
        for (let k = 0; k < this.valueCount[2]; k++) count = this.add(count, this.values[0][i], this.values[1][j], this.values[2][k], ex, ey, ez);
      }
    }
    for (let s = 1; s <= PULL_STEPS; s++) {
      const t = s / PULL_STEPS;
      count = this.add(count, ex + t * (ax - ex), ey + t * (ay - ey), ez + t * (az - ez), ex, ey, ez);
    }
    this.order.sort((a, b) => a.d - b.d || a.c - b.c);
    return count;
  }

  offer(list, n, origin, value) {
    if (Math.abs(value - origin) > MAX_SHIFT || n >= list.length) return n;
    for (let i = 0; i < n; i++) if (Math.abs(list[i] - value) < 1.0e-9) return n;
    list[n] = value;
    return n + 1;
  }

  add(count, cx, cy, cz, ex, ey, ez) {
    if (count >= MAX_CANDIDATES) return count;
    this.candidates[3 * count] = cx;
    this.candidates[3 * count + 1] = cy;
    this.candidates[3 * count + 2] = cz;
    const dx = cx - ex;
    const dy = cy - ey;
    const dz = cz - ez;
    this.order.push({ d: dx * dx + dy * dy + dz * dz, c: count });
    return count + 1;
  }

  accept(px, py, pz, nearDistance, shifted, shorter) {
    this.x = px;
    this.y = py;
    this.z = pz;
    this.near = nearDistance;
    this.moved = shifted;
    this.shortened = shorter;
  }
}

function sortByDistance(list, n, origin) {
  for (let i = 1; i < n; i++) {
    const v = list[i];
    const d = Math.abs(v - origin);
    let j = i - 1;
    while (j >= 0 && Math.abs(list[j] - origin) > d) {
      list[j + 1] = list[j];
      j--;
    }
    list[j + 1] = v;
  }
}

/** FpvEyeGuard on the voxel world: moves `eye` ({x, y, z}) out of blocks; returns the near plane distance. */
export class FpvEyeGuard {
  constructor(world) {
    this.world = world;
    this.clearance = new EyeClearance();
    this.collect = (minX, minY, minZ, maxX, maxY, maxZ, sink) => {
      const w = this.world;
      const c = w.cell;
      const o = w.origin;
      const i0 = Math.floor((minX - o[0]) / c) - 1;
      const j0 = Math.floor((minY - o[1]) / c) - 1;
      const k0 = Math.floor((minZ - o[2]) / c) - 1;
      const i1 = Math.floor((maxX - o[0]) / c);
      const j1 = Math.floor((maxY - o[1]) / c);
      const k1 = Math.floor((maxZ - o[2]) / c);
      const volume = (i1 - i0 + 1) * (j1 - j0 + 1) * (k1 - k0 + 1);
      if (volume <= 0 || volume > MAX_BLOCKS) return;
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          for (let k = k0; k <= k1; k++) {
            if (!w.solid(i, j, k)) continue;
            sink.addBox(o[0] + i * c, o[1] + j * c, o[2] + k * c, o[0] + (i + 1) * c, o[1] + (j + 1) * c, o[2] + (k + 1) * c);
          }
        }
      }
    };
  }

  /**
   * @param {{x,y,z}} eye camera position, moved in place
   * @param {{x,y,z}} anchor drone centre of mass
   * @param {{x,y,z}} f forward, u up, l left (unit vectors of the camera)
   */
  apply(eye, anchor, f, u, l, verticalFovDeg, aspect) {
    const tanY = Math.tan(Math.min(179, Math.max(1, verticalFovDeg)) * Math.PI / 360);
    const tanX = tanY * (aspect > 1e-3 && Number.isFinite(aspect) ? aspect : 16 / 9);
    const c = this.clearance;
    c.view(f.x, f.y, f.z, u.x, u.y, u.z, l.x, l.y, l.z, tanX, tanY);
    c.resolve(eye.x, eye.y, eye.z, anchor.x, anchor.y, anchor.z, VANILLA_NEAR, MIN_NEAR, this.collect);
    eye.x = c.x;
    eye.y = c.y;
    eye.z = c.z;
    return c.near;
  }
}
