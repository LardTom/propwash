// FPV camera of a build, a port of Propwash 0.4.0 sim.FpvRig and sim.CameraOcclusion: the lens, the uptilt, the four
// prop discs exactly as the game's FPV renderer draws them, and the share of the 16:9 image the discs cover
// ("props in the camera view").
//
// All positions are millimetres in the drone's frame like parts.json and the web export's camera_view: x to the right,
// y up, −z to the front. The camera looks along −z, tilted up by the uptilt around the x axis; a point p becomes
// d = p − lens, camera coordinates (x, y·cos t + z·sin t, −y·sin t + z·cos t), image point x/depth, y'/depth with
// depth = −z' (rectilinear projection).
//
// rig(parts, airframe, catalog) → { lens, tilt, range, hubs[4], discLift, radius, hubRadius, fov }
// occlusionPercent(rig, tiltDeg?, fovDeg?, aspect?, rows?) → percent of the image covered by the discs
// cameraView(rig) → the web export's camera_view object (lens_mm, uptilt_deg and its range, horizontal/vertical FOV,
// aspect, props, percent)
//
// The field of view comes from the camera in the video unit (camera_fov_deg, horizontal), as in the game since
// Propwash 0.4.0 (FovMath.cameraHorizontalDegrees); the uptilt belongs to the drone (tune key camera.uptiltDeg) and stays
// inside the frame's camera mount (CameraMount.range).

export const SLOTS = 4;
export const ASPECT = 16.0 / 9.0;
export const ROWS = 1080;
export const BLUR_LIFT_FACTOR = 0.55;
export const UPTILT_MIN = 0.0;
export const UPTILT_MAX = 80.0;
export const FOV_MIN = 60;
export const FOV_MAX = 160;
export const CAMERA_UPTILT = 'camera.uptiltDeg';
const DEFAULT_FOV_DEG = 120.0;
const MIN_DEPTH_MM = 0.25;
const DEFAULT_NAMESPACE = 'propwash';
// FovMath.defaultHorizontalDegrees: the field of view of a video unit without camera_fov_deg, per video link.
const SYSTEM_FOV = Object.freeze({ analog: 120, digital: 130, creative: 120 });
// CameraMount.roleRange: what the camera mount of a frame class allows (min, max), always widened to the frame default.
const MOUNT_RANGE = Object.freeze({
  whoop: [10, 35], toothpick: [10, 40], cinewhoop: [0, 35], freestyle: [0, 50], race: [15, 70], long_range: [0, 40],
  cinelifter: [0, 30], x_class: [0, 50],
});
const ARM_KEYS = ['front_left', 'front_right', 'rear_left', 'rear_right'];

const f32 = Math.fround;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
// java.lang.Math.toRadians / toDegrees multiply by these constants.
const DEGREES_TO_RADIANS = 0.017453292519943295;
const RADIANS_TO_DEGREES = 57.29577951308232;
const toRadians = (deg) => deg * DEGREES_TO_RADIANS;

const namespaceOf = (id) => (id.includes(':') ? id.slice(0, id.indexOf(':')) : 'minecraft');

/** TuneMapping.clampUptilt: 0–80°, as float. */
export function clampUptilt(value) {
  const v = f32(value);
  if (!Number.isFinite(v)) return UPTILT_MIN;
  return Math.max(UPTILT_MIN, Math.min(UPTILT_MAX, v));
}

/** FovMath.cameraHorizontalDegrees: the camera's horizontal FOV of a video part, else the default of its link, 60–160°. */
export function cameraFov(video) {
  const d = video && video.data ? video.data : {};
  const fov = finite(d.camera_fov_deg) ? d.camera_fov_deg : SYSTEM_FOV[d.link] || SYSTEM_FOV.analog;
  return Math.max(FOV_MIN, Math.min(FOV_MAX, fov));
}

/**
 * CameraMount.range: the uptilt range of the frame's camera mount { min, max, standard } – from the web export
 * (frame.data.camera.tilt_min_deg/tilt_max_deg) or, without it, from the frame class like the mod.
 */
export function mountRange(frame) {
  const camera = (frame && frame.data && frame.data.camera) || {};
  const standard = clampUptilt(camera.tilt_deg);
  if (finite(camera.tilt_min_deg) && finite(camera.tilt_max_deg)) {
    return { min: f32(camera.tilt_min_deg), max: f32(camera.tilt_max_deg), standard };
  }
  const role = MOUNT_RANGE[frame && frame.data ? frame.data.role : null] || MOUNT_RANGE.freestyle;
  return { min: Math.min(role[0], standard), max: Math.max(role[1], standard), standard };
}

/** CameraMount.uptilt: the drone's own uptilt from its tune (camera.uptiltDeg) inside the mount, else the default. */
export function droneUptilt(range, tune) {
  const value = tune ? tune[CAMERA_UPTILT] : undefined;
  if (!finite(value)) return range.standard;
  return Math.max(range.min, Math.min(range.max, f32(value)));
}

/** FovMath.verticalFromHorizontal without the float cast (CameraView#verticalFovDeg). */
export function verticalFov(horizontalDeg, aspect = ASPECT) {
  return Math.atan(Math.tan(toRadians(horizontalDeg) / 2.0) / aspect) * 2.0 * RADIANS_TO_DEGREES;
}

/** FpvLayoutData.view: the drone_layout.json data of Propwash first, then of the other namespaces in sorted order. */
function layoutView(catalog, namespaces) {
  const layouts = (catalog.fpv && catalog.fpv.layouts) || {};
  const others = [...new Set(namespaces)].filter((ns) => ns !== DEFAULT_NAMESPACE).sort();
  const seats = new Map();
  const frames = new Map();
  for (const ns of [DEFAULT_NAMESPACE, ...others]) {
    const source = layouts[ns];
    if (!source) continue;
    for (const [id, seat] of Object.entries(source.seats || {})) seats.set(id, seat);
    for (const [id, frame] of Object.entries(source.frames || {})) frames.set(id, frame);
  }
  return {
    seat: (id) => (seats.has(id) ? seats.get(id) : NaN),
    frame: (id) => frames.get(id) || null,
  };
}

/** FpvRig.typicalMotor: motor of the first built-in preset with this frame, else the first motor that fits. */
export function typicalMotor(frame, catalog) {
  for (const preset of catalog.presets) {
    if (preset.id.startsWith(`${DEFAULT_NAMESPACE}:`) && preset.build.frame === frame.id) return catalog.part(preset.build.motor);
  }
  for (const motor of catalog.partsIn('motor')) {
    if (frame.data.motor_mounts.includes(motor.data.mount)) return motor;
  }
  return catalog.part('propwash:m2207_1750');
}

function motorMountHeight(wheelbase) {
  if (wheelbase >= 200) return f32(3.0);
  return wheelbase >= 100 ? f32(2.5) : f32(1.5);
}

/** FpvRig.defaultSeatMm: stator height + 9 mm (float). */
export function defaultSeat(motor) {
  return f32(f32(f32(motor.data.stator_mm[1]) + 6.0) + 3.0);
}

const hubHeight = (prop) => (prop.data.diameter_mm < 50 ? 3.0 : 5.0);
const hubDiameter = (prop) => Math.max(4.0, f32(f32(0.09) * prop.data.diameter_mm));

/** FpvRig.propHeightMm: hub height above the motor position. */
function propHeight(layoutPropHeight, seat, presetSeat, motor) {
  if (finite(layoutPropHeight)) {
    if (finite(seat) && finite(presetSeat)) return f32(f32(f32(layoutPropHeight) + f32(seat)) - f32(presetSeat));
    return layoutPropHeight;
  }
  if (finite(seat)) return seat;
  return defaultSeat(motor);
}

/** FpvRig.definitionMotors: the frame's own arms, else the square of the wheelbase. */
function definitionMotors(frame) {
  const d = frame.data;
  if (d.arms_explicit && d.arms) return ARM_KEYS.map((k) => d.arms[k].pos.map((v) => f32(v)));
  const s = f32(d.wheelbase_mm / (2.0 * Math.sqrt(2.0)));
  const y = motorMountHeight(d.wheelbase_mm);
  return [[-s, y, -s], [s, y, -s], [-s, y, s], [s, y, s]];
}

/**
 * FpvRig.lens: the frame's camera position, else the lens of the flight model above the centre of mass
 * (airframe = the analysis' derived airframe: comHeight, hitboxFootOffset, lensRight/Up/Forward in metres).
 */
function lens(frame, airframe) {
  const pos = frame.data.camera && frame.data.camera.pos;
  if (pos) return [f32(pos[0]), f32(pos[1]), f32(pos[2])];
  let com = f32(airframe.comHeight * 1000.0);
  const foot = f32(-airframe.hitboxFootOffset);
  if (!Number.isFinite(com) || !Number.isFinite(foot) || foot < 0.0) com = Math.max(4.0, f32(f32(0.06) * frame.data.wheelbase_mm));
  return [f32(airframe.lensRight * 1000.0), f32(com + f32(airframe.lensUp * 1000.0)), f32(-airframe.lensForward * 1000.0)];
}

/**
 * The FPV rig of a resolved build ({frame, motor, prop, video, …} catalog parts) and its derived airframe.
 * @returns {{lens: number[], tilt: number, range: {min: number, max: number, standard: number}, hubs: number[][], discLift: number, radius: number, hubRadius: number, fov: number}}
 */
export function rig(parts, airframe, catalog) {
  const { frame, motor, prop, video } = parts;
  const typical = typicalMotor(frame, catalog);
  const view = layoutView(catalog, [namespaceOf(frame.id), namespaceOf(motor.id), namespaceOf(typical.id)]);
  const entry = view.frame(frame.id);
  let motors;
  let layoutPropHeight;
  if (entry && entry.valid && (entry.motors || !frame.builtin)) {
    motors = entry.motors || definitionMotors(frame);
    layoutPropHeight = entry.prop_height == null ? NaN : entry.prop_height;
  } else {
    motors = definitionMotors(frame);
    layoutPropHeight = frame.builtin ? defaultSeat(typical) : NaN;
  }
  const height = propHeight(layoutPropHeight, view.seat(motor.id), view.seat(typical.id), motor);
  const hubs = motors.map((m) => [m[0], f32(m[1] + height), m[2]]);
  const radius = prop.data.diameter_mm * 0.5;
  const range = mountRange(frame);
  return {
    lens: lens(frame, airframe),
    tilt: range.standard,
    range,
    hubs,
    discLift: hubHeight(prop) * BLUR_LIFT_FACTOR,
    radius,
    hubRadius: Math.min(hubDiameter(prop) * 0.5, radius),
    fov: cameraFov(video),
  };
}

/** Centre of the blur disc of a slot (hub + disc lift). */
export function discCenter(r, slot) {
  const hub = r.hubs[slot];
  return [hub[0], hub[1] + r.discLift, hub[2]];
}

// ---------------------------------------------------------------------------------------------------------------
// CameraOcclusion: exact row-by-row integration. Each image row is a plane through the lens; it cuts every disc in a
// chord of equal depth whose x interval is projected exactly, and the intervals of a row are united.

function rowIntervals(c, ny, nz, v, outer, inner, tanH, from, to, n) {
  const nn = 1.0 + v * v;
  const nN = ny + v * nz;
  const det = nn - nN * nN;
  if (Math.abs(nz - v * ny) < 1.0e-12 || Math.abs(det) < 1.0e-15) return n;
  const nc = c[1] * ny + c[2] * nz;
  const a = -nN * nc / det;
  const b = nn * nc / det;
  const depth = -(a * v + b * nz);
  if (depth < MIN_DEPTH_MM) return n;
  const wy = a + b * ny - c[1];
  const wz = a * v + b * nz - c[2];
  const side = wy * wy + wz * wz;
  const outerChord = outer * outer - side;
  if (outerChord <= 0.0) return n;
  const half = Math.sqrt(outerChord);
  const innerChord = inner * inner - side;
  if (innerChord > 0.0) {
    const hole = Math.sqrt(innerChord);
    n = interval(c[0] - half, c[0] - hole, depth, tanH, from, to, n);
    return interval(c[0] + hole, c[0] + half, depth, tanH, from, to, n);
  }
  return interval(c[0] - half, c[0] + half, depth, tanH, from, to, n);
}

function interval(x0, x1, depth, tanH, from, to, n) {
  const lo = Math.max(x0 / depth, -tanH);
  const hi = Math.min(x1 / depth, tanH);
  if (hi > lo) {
    from[n] = lo;
    to[n] = hi;
    return n + 1;
  }
  return n;
}

function union(from, to, n) {
  if (n === 0) return 0.0;
  if (n === 1) return to[0] - from[0];
  const order = [];
  for (let i = 0; i < n; i++) order.push(i);
  order.sort((x, y) => from[x] - from[y]);
  let total = 0.0;
  let lo = from[order[0]];
  let hi = to[order[0]];
  for (let k = 1; k < n; k++) {
    const i = order[k];
    if (from[i] > hi) {
      total += hi - lo;
      lo = from[i];
      hi = to[i];
    } else {
      hi = Math.max(hi, to[i]);
    }
  }
  return total + hi - lo;
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** CameraOcclusion.percent: share of the image (in %) the prop discs cover, by default with the rig's own camera. */
export function occlusionPercent(r, tiltDeg = r.tilt, horizontalFovDeg = r.fov, aspect = ASPECT, rows = ROWS) {
  const fov = Number.isFinite(horizontalFovDeg) ? clamp(horizontalFovDeg, 1.0, 179.0) : DEFAULT_FOV_DEG;
  const ratio = Number.isFinite(aspect) && aspect > 1.0e-3 ? aspect : ASPECT;
  const count = Math.max(1, rows);
  const tanH = Math.tan(toRadians(fov) / 2.0);
  const tanV = tanH / ratio;
  const tilt = toRadians(Number.isFinite(tiltDeg) ? tiltDeg : 0.0);
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const centers = [];
  for (let i = 0; i < SLOTS; i++) {
    const c = discCenter(r, i);
    const dx = c[0] - r.lens[0];
    const dy = c[1] - r.lens[1];
    const dz = c[2] - r.lens[2];
    centers.push([dx, dy * cos + dz * sin, -dy * sin + dz * cos]);
  }
  const ny = cos;
  const nz = -sin;
  const from = new Float64Array(4 * SLOTS);
  const to = new Float64Array(4 * SLOTS);
  let covered = 0.0;
  for (let row = 0; row < count; row++) {
    const v = (1.0 - 2.0 * (row + 0.5) / count) * tanV;
    let n = 0;
    for (const c of centers) n = rowIntervals(c, ny, nz, v, r.radius, r.hubRadius, tanH, from, to, n);
    covered += union(from, to, n) / (2.0 * tanH);
  }
  return 100.0 * covered / count;
}

/** The web export's camera_view (BuildAccess#cameraView) of a rig. */
export function cameraView(r, percent = occlusionPercent(r)) {
  const props = [];
  for (let slot = 0; slot < SLOTS; slot++) props.push({ center_mm: discCenter(r, slot), radius_mm: r.radius, hub_radius_mm: r.hubRadius });
  return {
    lens_mm: r.lens.slice(),
    uptilt_deg: r.tilt,
    uptilt_min_deg: r.range ? r.range.min : UPTILT_MIN,
    uptilt_max_deg: r.range ? r.range.max : UPTILT_MAX,
    horizontal_fov_deg: r.fov,
    vertical_fov_deg: verticalFov(r.fov, ASPECT),
    aspect: ASPECT,
    projection: 'rectilinear',
    props,
    props_in_view_percent: percent,
  };
}
