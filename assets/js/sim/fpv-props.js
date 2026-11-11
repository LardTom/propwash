// The own props in the FPV image like Propwash 0.6.0 draws them (setting "Props in FPV view", on by default, and
// "Ducts in FPV view", on by default), without three.js (Node can test it). Ports of FpvPropGeometry, FpvArmZone,
// FpvGuardZone and the clipping of FpvProps:
//
// - Everything is drawn in the camera's own pass, relative to the lens (FpvRig.lens, millimetres in the drone's frame)
//   and turned back by the camera uptilt: p − lens, depth = y·sin(tilt) − z·cos(tilt).
// - nearScale: the props, blades or blur hub, are scaled about the lens by 55 mm / the nearest depth of their disc
//   samples in an 85° cone (rim at 2.5 mm above the hub, half radius, the point towards the lens) and of the duct
//   points, 1…12, so nothing of them falls in front of the world's near plane and the image stays the same.
// - Blur discs, arms, motors and ducts are clipped at 0.25 mm depth and every vertex pushed out to at least 52…55 mm
//   (pushScale), so they also stay where they are in the image.
// - What is drawn: a prop of a slot whose motor hangs on an arm of the frame (attached) and whose disc reaches into the
//   image (visible, with the view's half angles + 5 %); spinning (blur) as the procedural blur disc (FpvProps.buildBlur)
//   plus the solid middle of its blur model (hub and nut, not the translucent disc), else the blades (its model); with
//   them the arms (the frame's faces below the motor tops, outside the middle and not part of a duct ring, FpvArmZone)
//   and the motors of the attached slots; the duct rings of a ducted frame (FpvGuardZone) with "Ducts in FPV view".
//
// Polygons are given as flat xyz arrays in millimetres in the drone's frame (x right, y up, −z front).

export const SLOTS = 4;
export const RIM_SAMPLES = 24;
export const INNER_SAMPLES = 12;
export const DISK_LIFT_MM = 2.5;
export const NEAR_TARGET_MM = 55.0;
export const MAX_NEAR_SCALE = 12.0;
export const MIN_DEPTH_MM = 1.0;
export const CONE_TAN = Math.fround(Math.tan(85 * Math.PI / 180));
export const NEAR_FLOOR_MM = 52.0;
export const CLIP_DEPTH_MM = 0.25;
// FpvProps: the view's half angles are widened by 5 % before the visibility test.
export const VIEW_MARGIN = 1.05;
// FpvArmZone
export const TOP_MARGIN_MM = 0.6;
export const CENTRE_TOLERANCE_MM = 3.0;
export const MIN_REACH = 0.5;
export const ATTACH_RADIUS = 0.25;
// FpvGuardZone
export const INNER_FACTOR = 0.97;
export const OUTER_MARGIN_MM = 6.0;
export const OUTER_MARGIN_FACTOR = 0.2;
export const MIN_COPIES = 5;
export const SIGNATURE_TOLERANCE_MM = 0.02;

const DEG = Math.PI / 180;
const ALL_ATTACHED = Object.freeze([true, true, true, true]);

/** Lens-relative camera coordinates of a point in the drone's frame (FpvPropGeometry#toCamera): [x, y, z], depth = −z. */
export function toCamera(lens, tiltDegrees, x, y, z, out = [0, 0, 0]) {
  const dx = x - lens[0];
  const dy = y - lens[1];
  const dz = z - lens[2];
  const t = -tiltDegrees * DEG;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  out[0] = dx;
  out[1] = dy * cos - dz * sin;
  out[2] = dy * sin + dz * cos;
  return out;
}

/** FpvPropGeometry.pushScale: the scale of a vertex at this depth (mm) so it lies at least 52…55 mm from the lens. */
export function pushScale(depthMm, nearScale) {
  const scale = Number.isFinite(nearScale) ? Math.max(1.0, nearScale) : 1.0;
  const scaled = depthMm * scale;
  if (scaled >= NEAR_TARGET_MM) return scale;
  const target = NEAR_FLOOR_MM + (NEAR_TARGET_MM - NEAR_FLOOR_MM) * Math.max(0.0, scaled) / NEAR_TARGET_MM;
  return target / Math.max(depthMm, 1.0e-4);
}

function inView(points, tanX, tanY) {
  for (let i = 0; i + 2 < points.length; i += 3) {
    const depth = -points[i + 2];
    if (depth > MIN_DEPTH_MM && Math.abs(points[i]) <= depth * tanX && Math.abs(points[i + 1]) <= depth * tanY) return true;
  }
  return false;
}

function inCone(x, y, z) {
  const depth = -z;
  return depth > MIN_DEPTH_MM && Math.abs(x) < depth * CONE_TAN && Math.abs(y) < depth * CONE_TAN;
}

/** FpvPropGeometry: disc samples, nearScale and the visibility tests of the four props, the arms and the ducts. */
export class FpvPropGeometry {
  /**
   * @param {number[][]} hubs prop hubs (mm, drone frame) per slot
   * @param {number} radiusMm prop radius
   * @param {number[]} lens lens (mm, drone frame)
   * @param {number} tiltDegrees camera uptilt
   * @param {number[]} guardPoints duct points (flat xyz, mm), empty without ducts
   * @param {number[][]} armPolygons arm and motor polygons (flat xyz each, mm)
   * @param {boolean[]} attached per slot
   */
  constructor(hubs, radiusMm, lens, tiltDegrees, guardPoints = [], armPolygons = [], attached = ALL_ATTACHED) {
    this.radius = Math.max(1.0, radiusMm);
    this.lens = lens.slice(0, 3);
    this.tilt = Number.isFinite(tiltDegrees) ? tiltDegrees : 0;
    this.hubs = hubs.map((h) => h.slice(0, 3));
    this.attachedSlots = attached.slice(0, SLOTS);
    this.samples = [];
    this.inner = [];
    let nearest = Infinity;
    const c = [0, 0, 0];
    for (let slot = 0; slot < SLOTS; slot++) {
      const hub = this.hubs[slot];
      const points = [];
      for (let i = 0; i <= RIM_SAMPLES; i++) {
        let x = hub[0];
        let z = hub[2];
        if (i < RIM_SAMPLES) {
          const a = (2 * Math.PI * i) / RIM_SAMPLES;
          x += Math.cos(a) * this.radius;
          z += Math.sin(a) * this.radius;
        }
        this.toCamera(x, hub[1] + DISK_LIFT_MM, z, c);
        points.push(c[0], c[1], c[2]);
        if (inCone(c[0], c[1], c[2])) nearest = Math.min(nearest, -c[2]);
      }
      this.samples.push(points);
      const inner = this.innerSamples(hub);
      this.inner.push(inner);
      for (let i = 0; i + 2 < inner.length; i += 3) if (inCone(inner[i], inner[i + 1], inner[i + 2])) nearest = Math.min(nearest, -inner[i + 2]);
    }
    this.guards = [];
    for (let i = 0; i + 2 < guardPoints.length; i += 3) {
      this.toCamera(guardPoints[i], guardPoints[i + 1], guardPoints[i + 2], c);
      this.guards.push(c[0], c[1], c[2]);
      if (inCone(c[0], c[1], c[2])) nearest = Math.min(nearest, -c[2]);
    }
    this.nearScale = Number.isFinite(nearest) ? Math.min(MAX_NEAR_SCALE, Math.max(1.0, NEAR_TARGET_MM / nearest)) : 1.0;
    this.arms = armPolygons.map((poly) => {
      const out = [];
      for (let i = 0; i + 2 < poly.length; i += 3) {
        this.toCamera(poly[i], poly[i + 1], poly[i + 2], c);
        out.push(c[0], c[1], c[2]);
      }
      return out;
    });
  }

  toCamera(x, y, z, out) {
    return toCamera(this.lens, this.tilt, x, y, z, out);
  }

  innerSamples(hub) {
    const points = [];
    const c = [0, 0, 0];
    const y = hub[1] + DISK_LIFT_MM;
    for (let i = 0; i < INNER_SAMPLES; i++) {
      const a = (2 * Math.PI * (i + 0.5)) / INNER_SAMPLES;
      this.toCamera(hub[0] + Math.cos(a) * this.radius * 0.5, y, hub[2] + Math.sin(a) * this.radius * 0.5, c);
      points.push(c[0], c[1], c[2]);
    }
    const dx = this.lens[0] - hub[0];
    const dz = this.lens[2] - hub[2];
    const distance = Math.hypot(dx, dz);
    const scale = distance > this.radius ? this.radius / distance : 1.0;
    this.toCamera(hub[0] + dx * scale, y, hub[2] + dz * scale, c);
    points.push(c[0], c[1], c[2]);
    return points;
  }

  attached(slot) {
    return this.attachedSlots[slot];
  }

  /** The disc of a slot reaches into a view with these half-angle tangents. */
  visible(slot, tanX, tanY) {
    return inView(this.samples[slot], tanX, tanY) || inView(this.inner[slot], tanX, tanY);
  }

  /** FpvProps#shows: attached and visible. */
  shows(slot, tanX, tanY) {
    return this.attached(slot) && this.visible(slot, tanX, tanY);
  }

  guardsVisible(tanX, tanY) {
    return inView(this.guards, tanX, tanY);
  }

  armsVisible(tanX, tanY) {
    return this.arms.some((poly) => polygonInView(poly, tanX, tanY));
  }
}

function polygonInView(points, tanX, tanY) {
  let behind = true;
  let left = true;
  let right = true;
  let below = true;
  let above = true;
  for (let i = 0; i + 2 < points.length; i += 3) {
    const x = points[i];
    const y = points[i + 1];
    const depth = -points[i + 2];
    behind = behind && depth <= MIN_DEPTH_MM;
    left = left && x < -depth * tanX;
    right = right && x > depth * tanX;
    below = below && y < -depth * tanY;
    above = above && y > depth * tanY;
  }
  return !(behind || left || right || below || above);
}

/** FpvGuardZone: the faces of a ducted frame's rings around the motor axes (clusters of at least 5 equal faces). */
export class FpvGuardZone {
  constructor(axisX, axisZ, propRadiusMm) {
    const radius = Math.max(1.0, propRadiusMm);
    this.axisX = axisX.slice();
    this.axisZ = axisZ.slice();
    this.innerRadius = radius * INNER_FACTOR;
    this.outerRadius = radius + Math.max(OUTER_MARGIN_MM, OUTER_MARGIN_FACTOR * radius);
  }

  /** FpvGuardZone.of: a zone for a ducted frame with motors and a largest prop, else null. */
  static of(ducted, motors, maxPropMm) {
    if (!ducted || !motors.length || !(maxPropMm > 0)) return null;
    return new FpvGuardZone(motors.map((m) => m[0]), motors.map((m) => m[2]), maxPropMm * 0.5);
  }

  around(axis, points) {
    const inner2 = this.innerRadius * this.innerRadius;
    const outer2 = this.outerRadius * this.outerRadius;
    if (points.length < 3) return false;
    for (let i = 0; i + 2 < points.length; i += 3) {
      const x = points[i];
      const z = points[i + 2];
      if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
      const dx = x - this.axisX[axis];
      const dz = z - this.axisZ[axis];
      const d2 = dx * dx + dz * dz;
      if (d2 < inner2 || d2 > outer2) return false;
    }
    return true;
  }

  axisOf(points) {
    for (let axis = 0; axis < this.axisX.length; axis++) if (this.around(axis, points)) return axis;
    return -1;
  }

  contains(points) {
    return this.axisOf(points) >= 0;
  }

  signature(axis, points) {
    let rMin = Infinity;
    let rMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;
    for (let i = 0; i + 2 < points.length; i += 3) {
      const r = Math.hypot(points[i] - this.axisX[axis], points[i + 2] - this.axisZ[axis]);
      rMin = Math.min(rMin, r);
      rMax = Math.max(rMax, r);
      yMin = Math.min(yMin, points[i + 1]);
      yMax = Math.max(yMax, points[i + 1]);
    }
    return [rMin, rMax, yMin, yMax];
  }

  /** Per polygon: part of a ring (a cluster of at least MIN_COPIES polygons with the same signature about one axis). */
  select(polygons) {
    const selected = new Array(polygons.length).fill(false);
    const clusters = [];
    polygons.forEach((points, q) => {
      const axis = this.axisOf(points);
      if (axis < 0) return;
      const sig = this.signature(axis, points);
      let cluster = clusters.find((c) => c.axis === axis && c.sig.every((v, i) => Math.abs(v - sig[i]) <= SIGNATURE_TOLERANCE_MM));
      if (!cluster) {
        cluster = { axis, sig, members: [] };
        clusters.push(cluster);
      }
      cluster.members.push(q);
    });
    for (const c of clusters) if (c.members.length >= MIN_COPIES) for (const q of c.members) selected[q] = true;
    return selected;
  }
}

/** FpvArmZone: the frame's arm faces (below the motor tops, not across the middle, reaching out) and attached motors. */
export class FpvArmZone {
  /** @param {number[][]} motors motor positions (mm) per slot; @param {FpvGuardZone|null} guards */
  constructor(motors, guards = null) {
    if (!motors.length) throw new Error('frame without motors');
    this.motorX = motors.map((m) => m[0]);
    this.motorZ = motors.map((m) => m[2]);
    this.top = Math.max(...motors.map((m) => m[1])) + TOP_MARGIN_MM;
    this.reach = Math.min(...motors.map((m) => Math.abs(m[0]))) * MIN_REACH;
    this.guards = guards;
  }

  contains(points) {
    if (points.length < 3) return false;
    let highest = -Infinity;
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i + 2 < points.length; i += 3) {
      const x = points[i];
      const y = points[i + 1];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(points[i + 2])) return false;
      highest = Math.max(highest, y);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
    const central = minX < -CENTRE_TOLERANCE_MM && maxX > CENTRE_TOLERANCE_MM;
    return highest <= this.top && !central && Math.max(Math.abs(minX), Math.abs(maxX)) >= this.reach;
  }

  /** Per polygon: an arm face (and not part of a duct ring). */
  select(polygons) {
    const rings = this.guards ? this.guards.select(polygons) : null;
    return polygons.map((points, q) => !(rings && rings[q]) && this.contains(points));
  }

  /** Per motor: an arm point lies within a quarter of the motor's distance from the middle. */
  attached(polygons) {
    return this.motorX.map((mx, motor) => {
      const radius = ATTACH_RADIUS * Math.hypot(mx, this.motorZ[motor]);
      const r2 = radius * radius;
      for (const points of polygons) {
        for (let p = 0; p + 2 < points.length; p += 3) {
          const dx = points[p] - mx;
          const dz = points[p + 2] - this.motorZ[motor];
          if (dx * dx + dz * dz <= r2) return true;
        }
      }
      return false;
    });
  }
}

/**
 * FpvProps#clip: the part of a polygon at or beyond CLIP_DEPTH_MM. Vertices are arrays whose index 3 is the depth; all
 * other entries (position, colour, uv …) are interpolated where an edge crosses the plane.
 */
export function clipPolygon(polygon) {
  const out = [];
  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i];
    const previous = polygon[(i + polygon.length - 1) % polygon.length];
    const currentIn = current[3] >= CLIP_DEPTH_MM;
    const previousIn = previous[3] >= CLIP_DEPTH_MM;
    if (currentIn !== previousIn) {
      const t = (CLIP_DEPTH_MM - previous[3]) / (current[3] - previous[3]);
      const cut = current.map((v, c) => previous[c] + t * (v - previous[c]));
      cut[3] = CLIP_DEPTH_MM;
      out.push(cut);
    }
    if (currentIn) out.push(current.slice());
  }
  return out;
}

/**
 * FpvProps#emitClipped for one polygon given in the drone's frame (mm): lens-relative, clipped at CLIP_DEPTH_MM, every
 * vertex pushed by pushScale. Vertices come as [x, y, z, ...attributes]; the result keeps the drone's axes (the camera
 * pass turns them with the drone) as [x, y, z, depth, ...attributes], ready to be drawn as a triangle fan.
 */
export function lensPolygon(vertices, lens, tiltDegrees, nearScale) {
  const t = tiltDegrees * DEG;
  const sin = Math.sin(t);
  const cos = Math.cos(t);
  const polygon = vertices.map((v) => {
    const x = v[0] - lens[0];
    const y = v[1] - lens[1];
    const z = v[2] - lens[2];
    return [x, y, z, y * sin - z * cos, ...v.slice(3)];
  });
  const clipped = clipPolygon(polygon);
  if (clipped.length < 3) return [];
  for (const v of clipped) {
    const s = pushScale(v[3], nearScale);
    v[0] *= s;
    v[1] *= s;
    v[2] *= s;
  }
  return clipped;
}

/** The horizontal and vertical half-angle tangents of a perspective view, widened like FpvProps (× 1.05). */
export function viewTangents(verticalFovDeg, aspect) {
  const tanY = Math.tan(verticalFovDeg * DEG / 2);
  return { tanX: tanY * aspect * VIEW_MARGIN, tanY: tanY * VIEW_MARGIN };
}
