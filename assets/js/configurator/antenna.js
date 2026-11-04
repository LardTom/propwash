// VTX antennas of Propwash 0.6.0 in the browser: ports of build.AntennaRules, drone.client.render.AntennaGeometry and
// drone.client.render.AntennaMask, as of F-ANTENNA4-1.
//
// In the game the antennas are no part of the VTX model any more. The frame carries an antenna holder (antenna_anchor:
// position and tilt, else AntennaRules.fallbackAnchor right at the rear, 12 mm behind the top plate, tilt 45°), the VTX
// says what sits on it (antenna: count, length and cap, else derived from range, mass, video system, image quality and
// latency), cut to the frame's longest antenna (1.2 × wheelbase), and the renderer builds holder, SMA, sleeve, stalk
// and cap as shapes at the holder, never turned by the camera angle: one antenna in the middle straight up and back, a
// pair in a V from one point (15° each, narrower on small open frames). Elements whose name starts with "antenna" in a
// VTX model (add-on VTX) are left out where the drone is drawn (AntennaMask), so no antenna sits twice. A VTX without
// external antennas (VideoAntenna.none(), Propwash 0.6.0-rc.3: "antenna": "none" in its part file, count 0 in the web
// export) has neither antennas nor holder.
//
// All lengths are millimetres in the drone's frame (x to the right, y up, z to the rear), like assembly.js.
//
//   antennaKind(values) / derivedAntenna(values)   values: {rangeBlocks, massGrams, link, imageQuality, latencyMs, vtxPowerMw}
//   fallbackAnchor(values)                         values: {wheelbaseMm, batteryOnTop, batteryPlateMm, electronicsMm,
//                                                           cameraY (null without a camera position), ducted}
//   maxLengthMm(values) / pairLeanDeg(values)      the frame's longest antenna and the lean of each antenna of a pair
//   videoAntenna(part, frame?) / frameAntennaAnchor(part)
//                                                  the same from a catalog entry (parts.json data, the export's own
//                                                  antenna and antenna_anchor first; with a frame cut to its longest)
//   antennaPieces(antenna, tiltDeg, wheelbaseMm, pairLeanDeg?, behindPackMm?)
//                                                  the shapes of AntennaGeometry.pieces: {name, kind, matrix, segments, color}
//   antennaFaces(model)                            indices of the faces AntennaMask leaves out of a block model (counted
//                                                  like the compact model files: element by element, faces in the order
//                                                  down, up, north, south, west, east)

export const DEFAULT_ANTENNA_TILT = 45.0;
export const LONG_RANGE_BLOCKS = 700;
export const WHOOP_MAX_GRAMS = 6.0;
export const HD_MIN_QUALITY = 0.95;
export const RACE_MAX_LATENCY_MS = 16;
export const RACE_MIN_MM = 45.0;
export const RACE_MAX_MM = 60.0;
export const MAX_LENGTH_OF_WHEELBASE = 1.2;
export const PAIR_LEAN_DEG = 15.0;
export const MIN_PAIR_LEAN_DEG = 5.0;
export const NARROW_SPREAD_WHEELBASE_MM = 100.0;
export const FULL_SPREAD_WHEELBASE_MM = 200.0;
export const WHOOP_REAR_OF_WHEELBASE = 0.18;
export const REAR_OF_WHEELBASE = 0.22;
export const LARGE_WHEELBASE_MM = 300.0;
export const LARGE_REAR_GROWTH = 0.065;
export const BEHIND_PLATE_MM = 12.0;
export const ABOVE_ELECTRONICS = 2.4;
export const ABOVE_DUCTED_CAMERA_MM = 6.0;
export const CAPS = Object.freeze(['whip', 'stubby', 'lollipop', 'pagoda', 'patch']);
export const MAX_COUNT = 2;
export const NO_ANTENNA = 'none';
export const NONE = Object.freeze({ count: 0, lengthMm: 0.0, cap: 'whip' });
export const MIN_LENGTH_MM = 10.0;
export const MAX_LENGTH_MM = 250.0;

// AntennaGeometry: colours (FallbackShapes.ANTENNA and ANTENNA_CAP for stalk and cap) and sizes.
export const ANTENNA_COLORS = Object.freeze({
  stalk: 0x111111, sleeve: 0x202022, mount: 0x262628, sma: 0xb08d3c, cap: 0xc83232, capLight: 0xe4e4e2,
});
export const SINGLE_LEAN_DEG = 0.0;
export const V_LEAN_DEG = 15.0;
export const MAX_OFFSET_MM = 0.0;
export const OFFSET_OF_WHEELBASE = 0.06;
export const BASE_Y_MM = 0.8;
export const BASE_Z_MM = 0.5;
export const MOUNT_REACH_MM = 16.0;
export const MOUNT_REACH_OF_WHEELBASE = 0.12;
export const MOUNT_REAR_MM = 3.5;
export const SMA_MM = 3.0;

export const MASK_PREFIX = 'antenna';
const TOUCH_UNITS = 0.002;
const DIRS = ['down', 'up', 'north', 'south', 'west', 'east'];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const round1 = (mm) => Math.round(mm * 10.0) / 10.0;

// ---------------------------------------------------------------------------------------------------------------
// AntennaRules

/** AntennaRules.kind: long_range, whoop, hd, race or lite. */
export function antennaKind(v) {
  if (v.rangeBlocks >= LONG_RANGE_BLOCKS) return 'long_range';
  if (v.massGrams <= WHOOP_MAX_GRAMS) return 'whoop';
  if (v.link === 'digital' && v.imageQuality >= HD_MIN_QUALITY) return 'hd';
  if (v.link === 'analog' || v.latencyMs <= RACE_MAX_LATENCY_MS) return 'race';
  return 'lite';
}

/** AntennaRules.derived: {count, lengthMm, cap} from the VTX's own values. */
export function derivedAntenna(v) {
  const range = v.rangeBlocks;
  switch (antennaKind(v)) {
    case 'whoop': {
      const power = v.vtxPowerMw > 0 ? v.vtxPowerMw : 25;
      return { count: 1, lengthMm: 30.0 + 5.0 * clamp((power - 25) / 175.0, 0.0, 1.0), cap: 'whip' };
    }
    case 'race': return { count: 1, lengthMm: clamp(50.0 + (range - 380) / 14.0, RACE_MIN_MM, RACE_MAX_MM), cap: v.link === 'analog' ? 'lollipop' : 'stubby' };
    case 'lite': return { count: 1, lengthMm: 60.0, cap: 'lollipop' };
    case 'hd': return { count: 2, lengthMm: 90.0 + clamp((range - 520) / 13.0, 0.0, 10.0), cap: 'lollipop' };
    default: return {
      count: v.link === 'digital' ? 2 : 1, lengthMm: clamp(120.0 + (range - LONG_RANGE_BLOCKS) * 0.15, 120.0, 150.0), cap: 'pagoda',
    };
  }
}

/** VideoAntenna#isNone: no external antennas. */
export const isNoAntenna = (a) => !!a && a.count === 0;

/**
 * VideoAntenna: a valid antenna (1 or 2, 10 to 250 mm, a known cap), NONE for count 0 or "none" (length and cap without
 * meaning), else null.
 */
export function validAntenna(a) {
  if (a === NO_ANTENNA) return { ...NONE };
  if (!a || typeof a !== 'object') return null;
  const count = a.count;
  if (count === 0) return { ...NONE };
  const length = a.lengthMm !== undefined ? a.lengthMm : a.length_mm;
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) return null;
  if (!(finite(length) && length >= MIN_LENGTH_MM && length <= MAX_LENGTH_MM)) return null;
  if (!CAPS.includes(a.cap)) return null;
  return { count, lengthMm: length, cap: a.cap };
}

/** AntennaRules.maxLengthMm: the frame's longest antenna, 1.2 × wheelbase to half a millimetre, 10 to 250 mm. */
export function maxLengthMm(v) {
  const max = Math.round(MAX_LENGTH_OF_WHEELBASE * v.wheelbaseMm * 2.0) / 2.0;
  return clamp(max, MIN_LENGTH_MM, MAX_LENGTH_MM);
}

/**
 * AntennaRules.pairLeanDeg: the lean of each antenna of a pair – 15° on ducted frames and from 200 mm wheelbase,
 * narrower below (none of it at 100 mm, at least 5°), rounded to 0.1°.
 */
export function pairLeanDeg(v) {
  if (v.ducted || v.wheelbaseMm >= FULL_SPREAD_WHEELBASE_MM) return PAIR_LEAN_DEG;
  const share = (v.wheelbaseMm - NARROW_SPREAD_WHEELBASE_MM) / (FULL_SPREAD_WHEELBASE_MM - NARROW_SPREAD_WHEELBASE_MM);
  return Math.round(Math.max(MIN_PAIR_LEAN_DEG, PAIR_LEAN_DEG * share) * 10.0) / 10.0;
}

/** AntennaRules.antenna(video, frame): the antenna cut to the frame's longest antenna. */
export function fittedAntenna(antenna, maxMm) {
  return finite(maxMm) && antenna.lengthMm > maxMm ? { ...antenna, lengthMm: maxMm } : antenna;
}

/**
 * AntennaRules.fallbackAnchor: centre; on the battery plate (pack on top), else 2.4 × the electronics height and at
 * least the lens (+ 6 mm in a duct); 0.18 × wheelbase to the rear for a whoop (duct, pack below), else 12 mm behind
 * the top plate (0.22 × wheelbase up to 300 mm and flatter beyond); both rounded to 0.1 mm; tilt 45°.
 */
export function fallbackAnchor(v) {
  const wheelbase = v.wheelbaseMm;
  const whoop = !v.batteryOnTop && v.ducted;
  let z;
  if (whoop) z = WHOOP_REAR_OF_WHEELBASE * wheelbase;
  else if (wheelbase <= LARGE_WHEELBASE_MM) z = REAR_OF_WHEELBASE * wheelbase + BEHIND_PLATE_MM;
  else z = REAR_OF_WHEELBASE * LARGE_WHEELBASE_MM + LARGE_REAR_GROWTH * (wheelbase - LARGE_WHEELBASE_MM) + BEHIND_PLATE_MM;
  let y;
  if (v.batteryOnTop) {
    y = v.batteryPlateMm;
  } else {
    const camera = (finite(v.cameraY) ? v.cameraY : 0.0) + (v.ducted ? ABOVE_DUCTED_CAMERA_MM : 0.0);
    y = Math.max(ABOVE_ELECTRONICS * v.electronicsMm, camera);
  }
  return { x: 0.0, y: round1(y), z: round1(z), tiltDeg: DEFAULT_ANTENNA_TILT };
}

/** The values AntennaRules reads from a VTX, from a catalog entry (parts.json). */
export function videoValues(part) {
  const d = part.data || {};
  return {
    rangeBlocks: d.range_blocks, massGrams: part.basics ? part.basics.mass_g : NaN, link: d.link, imageQuality: d.image_quality,
    latencyMs: d.latency_ms, vtxPowerMw: d.vtx_power_mw || 0,
  };
}

/**
 * AntennaRules.antenna of a catalog entry: the export's antenna when it is valid (count 0: none), else derived; with
 * its kind. With a frame (AntennaRules.antenna(video, frame)) cut to the frame's longest antenna.
 */
export function videoAntenna(part, frame) {
  const values = videoValues(part);
  const own = validAntenna(part.data && part.data.antenna);
  const antenna = { ...(own || derivedAntenna(values)), kind: antennaKind(values) };
  return frame ? fittedAntenna(antenna, frameAntennaAnchor(frame).maxLengthMm) : antenna;
}

/** The values AntennaRules reads from a frame, from a catalog entry (parts.json). */
export function frameValues(part) {
  const d = part.data || {};
  const lens = d.camera && Array.isArray(d.camera.pos) ? d.camera.pos : null;
  return {
    wheelbaseMm: d.wheelbase_mm, batteryOnTop: !!(d.battery && d.battery.on_top), batteryPlateMm: d.battery ? d.battery.plate_mm : 0,
    electronicsMm: d.electronics_mm, cameraY: lens ? lens[1] : null, ducted: d.duct != null,
  };
}

/**
 * AntennaRules.anchor of a catalog entry: the export's antenna_anchor when it is valid, else the fallback; with the
 * frame's longest antenna and lean of a pair (max_length_mm and pair_lean_deg of the export, else from the frame).
 */
export function frameAntennaAnchor(part) {
  const a = part.data && part.data.antenna_anchor;
  const values = frameValues(part);
  const limits = {
    maxLengthMm: a && finite(a.max_length_mm) ? a.max_length_mm : maxLengthMm(values),
    pairLeanDeg: a && finite(a.pair_lean_deg) ? a.pair_lean_deg : pairLeanDeg(values),
  };
  if (a && Array.isArray(a.pos) && a.pos.length === 3 && a.pos.every(finite)) {
    return { position: a.pos.slice(), tilt: finite(a.tilt_deg) ? a.tilt_deg : DEFAULT_ANTENNA_TILT, explicit: a.explicit !== false, ...limits };
  }
  const f = fallbackAnchor(values);
  return { position: [f.x, f.y, f.z], tilt: f.tiltDeg, explicit: false, ...limits };
}

// ---------------------------------------------------------------------------------------------------------------
// AntennaGeometry (4 × 4 matrices row by row, applied to column vectors like JOML's Matrix4f)

function mul(a, b) {
  const out = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[r * 4 + k] * b[k * 4 + c];
      out[r * 4 + c] = s;
    }
  }
  return out;
}

const translation = (x, y, z) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1];
const scaling = (x, y, z) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];

function rotationX(deg) {
  const a = (deg * Math.PI) / 180;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1];
}

function rotationZ(deg) {
  const a = (deg * Math.PI) / 180;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** A point times a matrix (column vector, w = 1). */
export function transformPoint(m, x, y, z) {
  return [m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]];
}

/** AntennaGeometry.offsetMm: half the distance of a V pair; 0 since both antennas of a pair start from one point. */
export function antennaOffset(wheelbaseMm) {
  return Math.min(MAX_OFFSET_MM, OFFSET_OF_WHEELBASE * wheelbaseMm);
}

/** AntennaGeometry.reachMm: how far the holder reaches forward to the top plate, 0.12 × wheelbase, at most 16 mm. */
export function reachMm(wheelbaseMm) {
  return Math.min(MOUNT_REACH_MM, MOUNT_REACH_OF_WHEELBASE * wheelbaseMm);
}

function box(x0, y0, z0, x1, y1, z1) {
  return mul(translation((x0 + x1) * 0.5, (y0 + y1) * 0.5, (z0 + z1) * 0.5), scaling(x1 - x0, y1 - y0, z1 - z0));
}

function rod(out, name, frame, from, to, width, segments, color) {
  if (!(to > from)) return;
  out.push({ name, kind: 'cylinder', matrix: mul(mul(frame, translation(0, (from + to) * 0.5, 0)), scaling(width, to - from, width)), segments, color });
}

// AntennaGeometry.side: one antenna in the middle, a pair to the left and the right.
const side = (count, index) => (count === 1 ? 0.0 : (index === 0 ? -1.0 : 1.0));
const leanOf = (pairLeanDeg) => (finite(pairLeanDeg) ? pairLeanDeg : V_LEAN_DEG);

function antennaFrame(count, index, tiltDeg, offset, pairLean) {
  const s = side(count, index);
  const lean = count === 1 ? SINGLE_LEAN_DEG : leanOf(pairLean);
  return mul(mul(translation(s * offset, BASE_Y_MM, BASE_Z_MM), rotationX(tiltDeg)), rotationZ(-s * lean));
}

function whip(out, frame, antenna) {
  const C = ANTENNA_COLORS;
  const length = antenna.lengthMm;
  rod(out, 'sma', frame, -1.2, SMA_MM, 3.6, 8, C.sma);
  switch (antenna.cap) {
    case 'whip': {
      const sleeve = SMA_MM + 0.3 * length;
      const tip = 0.65 * length;
      rod(out, 'sleeve', frame, SMA_MM, sleeve, 3.0, 8, C.sleeve);
      rod(out, 'stalk', frame, sleeve, tip, 2.0, 6, C.stalk);
      rod(out, 'tip', frame, tip, length, 1.6, 6, C.capLight);
      break;
    }
    case 'stubby': {
      const top = length - 6.0;
      rod(out, 'stalk', frame, SMA_MM, top, 6.0, 10, C.stalk);
      rod(out, 'cap', frame, top, length, 5.2, 10, C.cap);
      break;
    }
    case 'lollipop': {
      const cap = Math.max(10.0, Math.min(15.0, 0.1 * length + 5.5));
      const sleeve = SMA_MM + 0.15 * length;
      const base = length - cap;
      rod(out, 'sleeve', frame, SMA_MM, sleeve, 4.4, 8, C.sleeve);
      rod(out, 'stalk', frame, sleeve, base, 2.8, 8, C.stalk);
      rod(out, 'cap', frame, base, base + 0.25 * cap, 0.7 * cap, 12, C.cap);
      rod(out, 'cap', frame, base + 0.25 * cap, base + 0.75 * cap, cap, 12, C.cap);
      rod(out, 'cap', frame, base + 0.75 * cap, length, 0.7 * cap, 12, C.cap);
      break;
    }
    case 'pagoda': {
      const core = length - 14.0;
      const sleeve = SMA_MM + 0.12 * length;
      rod(out, 'sleeve', frame, SMA_MM, sleeve, 4.6, 8, C.sleeve);
      rod(out, 'stalk', frame, sleeve, core, 3.2, 8, C.stalk);
      rod(out, 'core', frame, core, length, 6.0, 10, C.stalk);
      [19.0, 16.5, 14.0].forEach((width, d) => {
        const at = core + 2.0 + d * 4.5;
        rod(out, 'cap', frame, at, at + 2.6, width, 14, C.capLight);
      });
      break;
    }
    default: {
      const plate = length - 20.0;
      rod(out, 'stalk', frame, SMA_MM, plate, 3.0, 8, C.stalk);
      out.push({ name: 'cap', kind: 'box', matrix: mul(mul(frame, translation(0, plate + 10.0, 1.5)), scaling(20.0, 20.0, 3.5)), segments: 0, color: C.cap });
    }
  }
}

/**
 * AntennaGeometry.pieces / shape: the TPU holder (two boxes, the lower one reaching forward to the top plate, and by
 * behindPackMm further when the antenna sits behind an overhanging pack) and per antenna the SMA nut and the antenna
 * of its cap, tilted back by the holder's tilt – one antenna in the middle, a pair in a V from one point, each
 * leaning out by pairLeanDeg (15° by default) – around the holder at (0, 0, 0); none without external antennas.
 * matrix: the unit cube or cylinder (−0.5…0.5, cylinder along y) into the drone's millimetres.
 */
export function antennaPieces(antenna, tiltDeg, wheelbaseMm, pairLeanDeg, behindPackMm = 0) {
  const out = [];
  if (isNoAntenna(antenna)) return out;
  const offset = antennaOffset(wheelbaseMm);
  const reach = reachMm(wheelbaseMm) + Math.max(0.0, finite(behindPackMm) ? behindPackMm : 0.0);
  const half = (antenna.count === 1 ? 0.0 : offset) + 3.5;
  out.push({ name: 'mount', kind: 'box', matrix: box(-half, -6.0, -Math.max(3.0, reach), half, -2.6, MOUNT_REAR_MM), segments: 0, color: ANTENNA_COLORS.mount });
  out.push({ name: 'mount', kind: 'box', matrix: box(-half, -2.6, -3.0, half, -0.4, MOUNT_REAR_MM), segments: 0, color: ANTENNA_COLORS.mount });
  for (let i = 0; i < antenna.count; i++) whip(out, antennaFrame(antenna.count, i, tiltDeg, offset, pairLeanDeg), antenna);
  return out;
}

/** AntennaGeometry.capColor: the colour the antenna paint slot starts with (light whip tip and pagoda, else red). */
export function capColor(antenna) {
  return antenna.cap === 'whip' || antenna.cap === 'pagoda' ? ANTENNA_COLORS.capLight : ANTENNA_COLORS.cap;
}

/** AntennaGeometry.axis: direction of antenna number index from the holder. */
export function antennaAxis(antenna, tiltDeg, index, pairLeanDeg) {
  const m = antennaFrame(antenna.count, index, tiltDeg, 0, pairLeanDeg);
  return [m[1], m[5], m[9]];
}

/** The tip of antenna number index (the far end of its cap) relative to the holder. */
export function antennaTip(antenna, tiltDeg, wheelbaseMm, index, pairLeanDeg) {
  return transformPoint(antennaFrame(antenna.count, index, tiltDeg, antennaOffset(wheelbaseMm), pairLeanDeg), 0, antenna.lengthMm, 0);
}

/** DroneVisuals.paintShape: a painted antenna slot recolours the caps (both cap colours) of the antenna shapes. */
export function paintedAntenna(pieces, rgb) {
  if (rgb == null) return pieces;
  return pieces.map((p) => (p.color === ANTENNA_COLORS.cap || p.color === ANTENNA_COLORS.capLight ? { ...p, color: rgb & 0xffffff } : p));
}

// ---------------------------------------------------------------------------------------------------------------
// AntennaMask (in model units, on the block model JSON with its element names)

/** AntennaMask.isAntenna: an element whose name starts with "antenna" (any case). */
export const isAntennaElement = (name) => typeof name === 'string' && name.toLowerCase().startsWith(MASK_PREFIX);

function vector(v) {
  if (!Array.isArray(v) || v.length !== 3) return null;
  return v.every(finite) ? v.map(Number) : null;
}

const numberOf = (v) => (finite(v) ? v : 0);

// PlugAnchors.rotation: Rz · Ry · Rx of the element rotation (axis/angle or x/y/z), null for none (row by row, 3 × 3).
function rotationOf(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  let x = 0;
  let y = 0;
  let z = 0;
  if (typeof r.axis === 'string') {
    const angle = numberOf(r.angle);
    if (r.axis === 'x') x = angle;
    else if (r.axis === 'y') y = angle;
    else if (r.axis === 'z') z = angle;
    else return null;
  } else {
    x = numberOf(r.x);
    y = numberOf(r.y);
    z = numberOf(r.z);
  }
  if (x === 0 && y === 0 && z === 0) return null;
  const rad = Math.PI / 180;
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(x * rad), Math.sin(x * rad), Math.cos(y * rad), Math.sin(y * rad), Math.cos(z * rad), Math.sin(z * rad)];
  return [
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
    -sy, cy * sx, cy * cx,
  ];
}

// AntennaMask.Solid: the element's box with its rotation (origin, rescale), for the quads of its faces and the test
// whether a point lies inside.
function solidOf(e) {
  const from = vector(e.from);
  const to = vector(e.to);
  if (!from || !to) return null;
  const lo = from.map((v, i) => Math.min(v, to[i]));
  const hi = from.map((v, i) => Math.max(v, to[i]));
  const matrix = rotationOf(e.rotation);
  if (!matrix) return { lo, hi, matrix: null, origin: [0, 0, 0], rescale: [1, 1, 1] };
  const r = e.rotation;
  const origin = vector(r.origin) || [8, 8, 8];
  let rescale = [1, 1, 1];
  if (r.rescale === true && typeof r.axis === 'string' && finite(r.angle)) {
    const s = 1 / Math.cos((r.angle * Math.PI) / 180);
    if (r.axis === 'x') rescale = [1, s, s];
    else if (r.axis === 'y') rescale = [s, 1, s];
    else if (r.axis === 'z') rescale = [s, s, 1];
  }
  return { lo, hi, matrix, origin, rescale };
}

function contains(solid, p) {
  let q = p;
  if (solid.matrix) {
    const m = solid.matrix;
    const d = [0, 1, 2].map((i) => (p[i] - solid.origin[i]) / solid.rescale[i]);
    q = [0, 1, 2].map((i) => m[i] * d[0] + m[3 + i] * d[1] + m[6 + i] * d[2] + solid.origin[i]);
  }
  return [0, 1, 2].every((i) => q[i] >= solid.lo[i] - TOUCH_UNITS && q[i] <= solid.hi[i] + TOUCH_UNITS);
}

// The four corners of a face of the element as the game bakes them: rotated around the origin, then rescaled.
function faceCorners(solid, dir) {
  const { lo, hi } = solid;
  const pick = {
    down: [[lo[0], lo[1], lo[2]], [hi[0], lo[1], lo[2]], [hi[0], lo[1], hi[2]], [lo[0], lo[1], hi[2]]],
    up: [[lo[0], hi[1], lo[2]], [hi[0], hi[1], lo[2]], [hi[0], hi[1], hi[2]], [lo[0], hi[1], hi[2]]],
    north: [[lo[0], lo[1], lo[2]], [hi[0], lo[1], lo[2]], [hi[0], hi[1], lo[2]], [lo[0], hi[1], lo[2]]],
    south: [[lo[0], lo[1], hi[2]], [hi[0], lo[1], hi[2]], [hi[0], hi[1], hi[2]], [lo[0], hi[1], hi[2]]],
    west: [[lo[0], lo[1], lo[2]], [lo[0], hi[1], lo[2]], [lo[0], hi[1], hi[2]], [lo[0], lo[1], hi[2]]],
    east: [[hi[0], lo[1], lo[2]], [hi[0], hi[1], lo[2]], [hi[0], hi[1], hi[2]], [hi[0], lo[1], hi[2]]],
  }[dir];
  if (!solid.matrix) return pick;
  const m = solid.matrix;
  const o = solid.origin;
  return pick.map((p) => {
    const d = [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
    return [0, 1, 2].map((i) => (m[i * 3] * d[0] + m[i * 3 + 1] * d[1] + m[i * 3 + 2] * d[2]) * solid.rescale[i] + o[i]);
  });
}

const inAny = (solids, points) => solids.some((s) => points.every((p) => contains(s, p)));

/**
 * AntennaMask: the faces of a block model the game leaves out where the drone is drawn – every face that lies in an
 * "antenna…" element and not wholly in another element. Face indices count every face of every element in order
 * (down, up, north, south, west, east), as the compact model files do; [] for a model without antenna elements.
 */
export function antennaFaces(model) {
  const elements = model && Array.isArray(model.elements) ? model.elements : [];
  const antennas = [];
  const others = [];
  const solids = elements.map((e) => {
    const s = e && typeof e === 'object' ? solidOf(e) : null;
    if (s) (isAntennaElement(e.name) ? antennas : others).push(s);
    return s;
  });
  const out = [];
  if (!antennas.length) return out;
  let face = 0;
  elements.forEach((e, i) => {
    for (const dir of DIRS) {
      if (!(e && e.faces && e.faces[dir])) continue;
      const s = solids[i];
      if (s && isAntennaElement(e.name)) {
        const corners = faceCorners(s, dir);
        if (inAny(antennas, corners) && !inAny(others, corners)) out.push(face);
      }
      face++;
    }
  });
  return out;
}
