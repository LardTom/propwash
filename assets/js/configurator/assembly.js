// Where every part of a build sits on the drone, a port of Propwash 0.4.0's drone renderer layout (DroneLayout,
// DroneAssembly, AccessoryAnchor) working on the web export: drone_layout.json for the built-in frames (render.json),
// the frame geometry from parts.json for all others, and the motor seats for the prop height.
//
// All positions are millimetres in the drone's frame: x to the right, y up, z to the rear (the nose points to −z).
// A block model is drawn with its model point (8, 8, 8) at the part's position, 1 model unit = 8 mm.
//
// assemble(build, env) → { layout, cameraTilt, pieces } where each piece is
//   { role, id, slot?, position: [x, y, z], variant: 'base' | 'ccw', paintPosition, tiltX, spinY, stretchX, procedural? }
// env = { catalog, render, model(id) → loaded model JSON of a part or null }.

export const SLOTS = 4;
export const FRONT_LEFT = 0;
export const FRONT_RIGHT = 1;
export const REAR_LEFT = 2;
export const REAR_RIGHT = 3;
export const MM_PER_MODEL_UNIT = 8;
export const PROP_SLOTS = Object.freeze(['prop_fl', 'prop_fr', 'prop_rl', 'prop_rr']);

const PROPS_IN_CCW = [false, true, true, false];
const CAMERA_BEHIND_LENS_MM = 10;
// Preview rotor angles of the workbench preview (DroneVisuals.fillPreview).
const PREVIEW_ROTOR = (slot) => 0.35 + slot * 0.7;

const vec = (v) => [Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0];
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** Top of a model's bounding box in millimetres above its position, or NaN. */
export function modelTop(model, variant = 'base') {
  const v = model && model.variants && model.variants[variant];
  return v && v.box ? (v.box[4] - 8) * MM_PER_MODEL_UNIT : NaN;
}

function motorMountHeight(wheelbase) {
  if (wheelbase >= 200) return 3.0;
  return wheelbase >= 100 ? 2.5 : 1.5;
}

/** Motor of the first built-in preset with this frame (DroneLayout.typicalMotor), else the first that fits. */
export function typicalMotor(frame, catalog) {
  for (const preset of catalog.presets) {
    if (preset.id.startsWith('propwash:') && preset.build.frame === frame.id) return catalog.part(preset.build.motor);
  }
  for (const motor of catalog.partsIn('motor')) {
    if (frame.data.motor_mounts.includes(motor.data.mount)) return motor;
  }
  return catalog.part('propwash:m2207_1750');
}

export function defaultPropHeight(motor) {
  const stator = motor && motor.data && motor.data.stator_mm;
  const height = stator && finite(stator[1]) ? stator[1] : 7.0;
  return height + 6.0 + 3.0;
}

/** AccessoryAnchor.of(frame, mount): the frame's own anchor table, else the fallback from the wheelbase. */
export function accessoryAnchor(frame, mount) {
  const table = frame.data.accessory_anchors && frame.data.accessory_anchors[mount];
  if (table && table.pos) {
    return { position: vec(table.pos), tilt: table.tilt_deg || 0, length: table.length_mm || 0 };
  }
  const wb = frame.data.wheelbase_mm;
  return mount === 'top'
    ? { position: [0, 0.16 * wb, -0.23 * wb], tilt: 15, length: 0 }
    : { position: [0, -3, -0.25 * wb], tilt: 30, length: 0.15 * wb };
}

function defaultAccessories(frame) {
  const out = {};
  for (const mount of frame.data.accessory_mounts || []) out[mount] = accessoryAnchor(frame, mount);
  return out;
}

/** DroneLayout.fromDefinition: layout from the frame's geometry in parts.json. */
export function layoutFromDefinition(frame, catalog) {
  const d = frame.data;
  const wb = d.wheelbase_mm;
  const keys = ['front_left', 'front_right', 'rear_left', 'rear_right'];
  let motors;
  let ccw;
  let stackY;
  if (d.arms_explicit && d.arms) {
    motors = keys.map((k) => vec(d.arms[k].pos));
    ccw = keys.map((k) => d.arms[k].spin === 'ccw');
    stackY = Math.max(0, motors.reduce((sum, m) => sum + m[1], 0) / SLOTS);
  } else {
    const s = wb / (2 * Math.sqrt(2));
    const y = motorMountHeight(wb);
    motors = [[-s, y, -s], [s, y, -s], [-s, y, s], [s, y, s]];
    ccw = PROPS_IN_CCW.slice();
    stackY = y;
  }
  const plate = d.battery.plate_mm;
  const battery = d.battery.on_top ? [0, plate + 2, 0.04 * wb] : [0, plate - 7, 0];
  const lens = d.camera && d.camera.pos;
  const video = lens ? [lens[0], lens[1], lens[2] + CAMERA_BEHIND_LENS_MM] : [0, d.electronics_mm, -0.21 * wb];
  const propHeight = frame.builtin ? defaultPropHeight(typicalMotor(frame, catalog)) : NaN;
  return {
    motors, ccw, propHeight, stack: [0, stackY, 0], battery, video,
    cameraTilt: d.camera ? d.camera.tilt_deg : 20, fromFile: false, accessories: defaultAccessories(frame),
  };
}

function fileAnchor(entry) {
  if (!entry || !Array.isArray(entry.position)) return null;
  return { position: vec(entry.position), tilt: finite(entry.tilt) ? entry.tilt : 0, length: finite(entry.length) ? entry.length : 0 };
}

/** Layout of a frame: drone_layout.json entry (render.json) when there is one, else from the definition. */
export function frameLayout(frame, catalog, render) {
  const fallback = layoutFromDefinition(frame, catalog);
  const entry = render && render.layouts && render.layouts[frame.id];
  if (!entry) return fallback;
  const motors = Array.isArray(entry.motors) && entry.motors.length === SLOTS ? entry.motors.map(vec) : fallback.motors;
  let ccw = fallback.ccw;
  if (Array.isArray(entry.motor_spin) && entry.motor_spin.length === SLOTS) ccw = entry.motor_spin.map((s) => String(s).toLowerCase() === 'ccw');
  let propHeight = finite(entry.prop_height) && entry.prop_height >= 0 && entry.prop_height <= 200 ? entry.prop_height : NaN;
  let tilt = finite(entry.camera_tilt_default) ? entry.camera_tilt_default : fallback.cameraTilt;
  if (tilt < -30 || tilt > 80) tilt = fallback.cameraTilt;
  let accessories;
  if (entry.accessories && typeof entry.accessories === 'object') {
    accessories = {};
    for (const [mount, value] of Object.entries(entry.accessories)) {
      const anchor = fileAnchor(value) || fallback.accessories[mount];
      if (anchor) accessories[mount] = anchor;
    }
    if (!frame.builtin) {
      accessories = { ...fallback.accessories, ...accessories };
      for (const mount of Object.keys(accessories)) if (!frame.data.accessory_mounts.includes(mount)) delete accessories[mount];
    }
  } else {
    accessories = fallback.accessories;
  }
  return {
    motors,
    ccw,
    propHeight,
    stack: entry.stack ? vec(entry.stack) : fallback.stack,
    battery: entry.battery ? vec(entry.battery) : fallback.battery,
    video: entry.video ? vec(entry.video) : fallback.video,
    cameraTilt: tilt,
    fromFile: true,
    accessories,
  };
}

function motorSeat(render, motorId) {
  const seat = render && render.motor_seats ? render.motor_seats[motorId] : undefined;
  return finite(seat) ? seat : NaN;
}

/** DroneAssembly.propHeight: hub height above the motor position. */
export function propHeight(layout, frame, motor, env) {
  const { catalog, render, model } = env;
  if (finite(layout.propHeight)) {
    const seat = motorSeat(render, motor.id);
    const presetSeat = motorSeat(render, typicalMotor(frame, catalog).id);
    return finite(seat) && finite(presetSeat) ? layout.propHeight + seat - presetSeat : layout.propHeight;
  }
  const own = motorSeat(render, motor.id);
  if (finite(own)) return own;
  const top = modelTop(model(motor.id));
  if (finite(top) && top > 1 && top < 60) return top + 0.5;
  return defaultPropHeight(motor);
}

/** DroneAssembly.batteryPosition: batteries below a frame from the definition hang from the battery plate. */
export function batteryPosition(layout, frame, battery, env) {
  if (layout.fromFile || frame.builtin || !(layout.battery[1] < 0)) return layout.battery;
  let height = modelTop(env.model(battery.id));
  if (!finite(height)) height = Math.cbrt(battery.basics.mass_g / 2.1 / 2.86) * 10;
  return [layout.battery[0], frame.data.battery.plate_mm - Math.max(1, height), layout.battery[2]];
}

/**
 * Places every part of a build. Parts that are unknown to the catalog are left out (listed in `missing`).
 * @returns {{layout: object|null, cameraTilt: number, pieces: object[], missing: string[]}}
 */
export function assemble(build, env) {
  const { catalog } = env;
  const pieces = [];
  const missing = [];
  const get = (field) => {
    const part = catalog.part(build[field]);
    if (!part || part.category !== field) {
      missing.push(build[field]);
      return null;
    }
    return part;
  };
  const frame = get('frame');
  const stack = get('stack');
  const motor = get('motor');
  const prop = get('prop');
  const video = get('video');
  const battery = get('battery');
  if (!frame) return { layout: null, cameraTilt: 0, pieces, missing };
  const layout = frameLayout(frame, catalog, env.render);
  const hasModel = (part) => !!(part && env.model(part.id));

  pieces.push({ role: 'frame', id: frame.id, position: [0, 0, 0], procedural: hasModel(frame) ? null : 'frame' });
  if (stack) pieces.push({ role: 'stack', id: stack.id, position: layout.stack });
  if (battery) pieces.push({ role: 'battery', id: battery.id, position: batteryPosition(layout, frame, battery, env) });
  if (video) pieces.push({ role: 'video', id: video.id, position: layout.video, tiltX: layout.cameraTilt });

  const height = motor ? propHeight(layout, frame, motor, env) : defaultPropHeight(null);
  for (let slot = 0; slot < SLOTS; slot++) {
    const m = layout.motors[slot];
    if (motor) pieces.push({ role: 'motor', id: motor.id, slot, position: m });
    if (prop) {
      const propModel = env.model(prop.id);
      const ccw = layout.ccw[slot] && !!(propModel && propModel.variants && propModel.variants.ccw);
      pieces.push({
        role: 'prop', id: prop.id, slot, position: [m[0], m[1] + height, m[2]], variant: ccw ? 'ccw' : 'base',
        paintPosition: slot, spinY: PREVIEW_ROTOR(slot), counterClockwise: layout.ccw[slot],
      });
    }
  }

  for (const mount of ['top', 'bottom']) {
    const id = build.accessories && build.accessories[mount];
    if (id == null) continue;
    const type = catalog.part(id);
    if (!type || type.category !== 'accessory') {
      missing.push(id);
      continue;
    }
    const anchor = layout.accessories[mount] || accessoryAnchor(frame, mount);
    const width = type.data.size_mm ? type.data.size_mm[0] : 0;
    const stretch = type.data.slot === 'bottom' && anchor.length > 0 && width > 0 ? anchor.length / width : 1;
    if (mount === 'top') {
      pieces.push({ role: 'accessory_base', id: `mount_${mount}`, mount, position: anchor.position, procedural: 'accessory_base' });
    }
    pieces.push({ role: 'accessory', id, mount, position: anchor.position, tiltX: anchor.tilt, stretchX: stretch });
  }
  return { layout, cameraTilt: layout.cameraTilt, pieces, missing };
}

// ---------------------------------------------------------------------------------------------------------------
// Shapes drawn from the definition (FallbackShapes) for parts without a model: box and cylinder primitives in mm.
//   { kind: 'box' | 'cylinder', center: [x, y, z], size: [sx, sy, sz], rotY?, rotZ?, color: 0xRRGGBB, segments? }

const CARBON = 0x232327;
const STANDOFF = 0x8e5bd6;
const WHOOP_PLASTIC = 0x3d8fd6;
const DUCT_PLASTIC = 0x3a3a40;
const BRASS = 0xc9a94a;

const between = (x0, y0, z0, x1, y1, z1, color) => ({
  kind: 'box', center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], size: [Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)], color,
});

function armThickness(wb) {
  if (wb >= 600) return 6.0;
  return wb >= 200 ? 3.0 : wb >= 100 ? 2.5 : 1.5;
}

const armWidth = (wb) => Math.min(36, Math.max(4, 0.06 * wb));
const bodySpan = (wb) => (wb <= 300 ? wb : 300 + 0.3 * (wb - 300));

/** FallbackShapes.buildFrame for frames without a model (X-Class frames). */
export function proceduralFrame(frame, layout, catalog) {
  const d = frame.data;
  const wb = d.wheelbase_mm;
  const ducted = !!(frame.derived && frame.derived.ducted);
  const span = bodySpan(wb);
  const thick = armThickness(wb);
  const width = armWidth(wb);
  const body = ducted && wb < 100 ? WHOOP_PLASTIC : CARBON;
  const motorY = layout.motors.reduce((s, m) => s + m[1], 0) / SLOTS;
  const armTop = motorY;
  let armBottom = Math.min(0, motorY - thick);
  if (armTop - armBottom < 1) armBottom = armTop - thick;
  const armMid = (armTop + armBottom) / 2;
  const pad = Math.min(26, Math.max(3.5, 0.07 * wb));
  const out = [];
  const hFrame = d.shape === 'h_frame';
  if (hFrame) {
    const rails = [];
    for (let side = 0; side < 2; side++) {
      const f = layout.motors[side === 0 ? FRONT_LEFT : FRONT_RIGHT];
      const r = layout.motors[side === 0 ? REAR_LEFT : REAR_RIGHT];
      const dx = r[0] - f[0];
      const dz = r[2] - f[2];
      const length = Math.sqrt(dx * dx + dz * dz) + width * 0.7;
      out.push({ kind: 'box', center: [(f[0] + r[0]) / 2, armMid, (f[2] + r[2]) / 2], size: [width, armTop - armBottom, length], rotY: Math.atan2(dx, dz), color: body });
      rails.push((f[0] + r[0]) / 2);
    }
    const beam = Math.max(width, 0.12 * span);
    out.push(between(Math.min(rails[0], rails[1]), armBottom, -beam, Math.max(rails[0], rails[1]), armTop, beam, body));
  }
  for (const m of layout.motors) {
    const dist = Math.sqrt(m[0] * m[0] + m[2] * m[2]);
    if (dist < 1) continue;
    if (!hFrame) {
      const start = 0.12 * dist;
      const end = dist + width * 0.35;
      const mid = (start + end) / 2;
      out.push({ kind: 'box', center: [(m[0] / dist) * mid, armMid, (m[2] / dist) * mid], size: [width, armTop - armBottom, end - start], rotY: Math.atan2(m[0], m[2]), color: body });
    }
    out.push({ kind: 'cylinder', center: [m[0], armMid, m[2]], size: [pad * 2, armTop - armBottom, pad * 2], segments: 12, color: body });
  }
  if (ducted) {
    const maxProp = d.props_mm[1];
    const ring = maxProp / 2 + 1.5;
    const wall = Math.max(0.8, 0.02 * maxProp);
    const top = motorY + defaultPropHeight(typicalMotor(frame, catalog)) + 2;
    const segments = maxProp > 150 ? 28 : 18;
    const segLength = ((2 * Math.PI * ring) / segments) * 1.08;
    const duct = wb < 100 ? WHOOP_PLASTIC : DUCT_PLASTIC;
    for (const m of layout.motors) {
      for (let i = 0; i < segments; i++) {
        const a = (2 * Math.PI * i) / segments;
        out.push({ kind: 'box', center: [m[0] + Math.cos(a) * ring, (top + armBottom) / 2, m[2] - Math.sin(a) * ring], size: [wall, top - armBottom, segLength], rotY: a, color: duct });
      }
    }
    out.push(between(-0.24 * span, armBottom, -0.3 * span, 0.24 * span, armTop, 0.3 * span, body));
  } else {
    out.push(between(-0.12 * span, -2, -0.3 * span, 0.12 * span, 0, 0.3 * span, CARBON));
  }
  const battery = layout.battery;
  if (battery[1] > 8) {
    const plateTop = battery[1];
    const plateBottom = plateTop - 2;
    out.push(between(-0.09 * span, plateBottom, -0.24 * span, 0.09 * span, plateTop, 0.24 * span, CARBON));
    const sx = 0.07 * span;
    const sz = 0.16 * span;
    const standoffBottom = Math.max(0, armTop);
    for (let i = 0; i < 4; i++) {
      const x = (i & 1) === 0 ? -sx : sx;
      const z = (i & 2) === 0 ? -sz : sz;
      out.push({ kind: 'cylinder', center: [x, (standoffBottom + plateBottom) / 2, z], size: [5, plateBottom - standoffBottom, 5], segments: 8, color: STANDOFF });
    }
    const video = layout.video;
    const cageHeight = Math.max(8, video[1] + 10);
    const cageDepth = 0.16 * span;
    const cageX = Math.min(0.1 * span, 30);
    for (const side of [-1, 1]) {
      out.push(between(side * cageX - 1, 0, video[2] - cageDepth * 0.35, side * cageX + 1, cageHeight, video[2] + cageDepth * 0.65, CARBON));
    }
  }
  return out;
}

/** FallbackShapes.buildAccessoryBase (the top mount), with the TPU colour of the mount's paint group. */
export function proceduralAccessoryBase(tpuColor) {
  const out = [
    between(-14.6, -8.7, -8.0, 14.6, -6.0, 12.0, tpuColor),
    between(-14.6, -15.0, -5.0, -12.8, -8.7, 12.0, tpuColor),
    between(12.8, -15.0, -5.0, 14.6, -8.7, 12.0, tpuColor),
    between(-8.5, -6.0, -7.0, 8.5, -3.0, 7.0, tpuColor),
  ];
  for (const x of [-6, 0, 6]) out.push(between(x - 1.5, -3, -4.5, x + 1.5, 3, 4.5, tpuColor));
  out.push({ kind: 'cylinder', center: [10.5, 0, 0], size: [8.5, 4, 8.5], rotZ: Math.PI / 2, segments: 12, color: BRASS });
  return out;
}
