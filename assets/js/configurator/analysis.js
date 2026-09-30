// Flight analysis of a build, a port of Propwash 0.4.0 BuildAccess#analyze (BuildStats): airframe derivation,
// steady operating points of motors and battery, top speed, flight times, motor heating and camera occlusion.
// Only the parts of the model that BuildStats needs are ported; every formula keeps the mod's operation order so
// the numbers match the mod's (the web export's test vectors) to the last digits.
//
// analyze(build, catalog) returns null when a part is unknown or an accessory sits in the wrong slot, else
//   { mass_grams, thrust_to_weight, hover_throttle_percent, hover_flight_time_min, cruise_flight_time_min,
//     top_speed_kmh, full_throttle_current_a, esc_load_percent, battery_load_percent, motor_response_ms,
//     crash_speed_ms, sustained_motor_temp_c, props_in_view_percent, warnings }
// NaN (e.g. hover values of a build that cannot hover) means "no value".

import { resolveBuild, batteryContinuousCurrent } from './rules.js';

// ---------------------------------------------------------------------------------------------------------------
// Constants of the model

const G = 9.81;
const RHO0 = 1.225;
const DUCT_GAIN = 1.15;
const DUCT_FADE = 0.4;
const ZERO_LIFT_PITCH = 0.2;
const V0_MIN = 1.0;
const DESCENT_GAIN = 0.5;
const DESCENT_CAP = 0.6;
const Q_CLIMB = 0.6;
const Q_MIN = 0.05;
const Q_DESCENT = 0.3;
const K_TL_OPEN = 0.12;
const K_TL_DUCT = 0.06;
const KAPPA_H = 1.0;
const H_TIP_OFFSET = 5.0;
const SIDE_AREA = 1.15;
const TOP_AREA_OPEN = 2.9;
const TOP_AREA_DUCT = 2.5;
const I0_FRACTION = 0.03;
const ESC_R_BASE = 0.003;
const ESC_R_PER_A = 0.15;
const ESC_BURST = 1.3;
const ESC_INPUT_LIMIT = 0.8;
const PROP_J = 0.25;
const BELL_J = 0.3;
const BELL_EXTRA = 0.0025;
const ROTOR_PLANE_EXTRA = 0.008;
const OMEGA_MAX_FACTOR = 1.15;
const MOTOR_TAU_MAX = 0.04;
const WIRING_R = 0.003;
const POL_FRACTION = 0.5;
const C_RATE_PENALTY = 0.5;
const LOW_SOC_GAIN = 1.0;
const LOW_SOC_KNEE = 0.25;
const AUX_BASE_W = 0.6;
const AUX_PER_GRAM_W = 0.3;
const BATTERY_LENGTH = 2.2;
const BATTERY_WIDTH = 1.3;
const BATTERY_VOLUME_RATIO = BATTERY_LENGTH * BATTERY_WIDTH;
const DUCT_CLEARANCE = 0.003;
const IDLE_REFERENCE = 0.055;
const SOC_MIN = -0.1;

const MOTOR_HEAT_CAPACITY = 0.5;
const MOTOR_CONDUCTANCE_BASE = 0.075;
const MOTOR_CONDUCTANCE_PER_OMEGA = 1.5e-4;

const FLEX_LOSS = 0.04;
const FLEX_LOAD_CAP = 4.0;

const PLATE_FRACTION = 0.8;
const LEGACY_LENS_UP = 0.015;
const LEGACY_LENS_FORWARD_FACTOR = 0.7;
const SQRT2 = Math.sqrt(2.0);
const MOTORS = 4;
// PartWear.SIM_MOTOR_BY_POSITION: arm position (front left, front right, rear left, rear right) -> motor index.
const SIM_MOTOR_BY_POSITION = [3, 1, 2, 0];
const ARM_KEYS = ['front_left', 'front_right', 'rear_left', 'rear_right'];

const HINGE_CLEARANCE_MM = 5.0;
const DEFAULT_FOV_DEG = 120.0;
const ASPECT = 16.0 / 9.0;
const COLUMNS = 96;
const ROWS = 54;

const MOTOR_STEPS = 60;
const BUS_STEPS = 50;
const HOVER_STEPS = 100;
const THRUST_STEPS = 40;
const SPEED_STEPS = 50;
const TILT_STEPS = 40;
const HEAT_SEGMENTS = 40;
const MAX_SPEED = 150.0;

// java.lang.Math.toRadians multiplies by this constant.
const DEGREES_TO_RADIANS = 0.017453292519943295;
const toRadians = (deg) => deg * DEGREES_TO_RADIANS;
const MAX_TILT = toRadians(89.0);
const DEFAULT_ANGLE_LIMIT = toRadians(60.0);
const TOP_SPEED_SOC = 0.8;
const REFERENCE_AMBIENT_C = 25.0;
const PROPS_IN_VIEW_WARNING = 20.0;

/** Analysis warnings in Propwash's order (BuildWarning). */
export const ANALYSIS_WARNINGS = Object.freeze(['cannot_hover', 'underpowered', 'sluggish_motors', 'heavy_sag',
  'esc_current_limited', 'battery_overload', 'motor_thermal', 'props_in_view', 'esc_overvoltage']);

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v) => (v < 0.0 ? 0.0 : v > 1.0 ? 1.0 : v);

// ---------------------------------------------------------------------------------------------------------------
// Battery cell curve

function cellShape(chem, soc) {
  const grid = chem.soc_grid;
  const u = chem.ocv_shape;
  const s = clamp01(soc);
  let i = 1;
  while (i < grid.length - 1 && s > grid[i]) i++;
  const t = (s - grid[i - 1]) / (grid[i] - grid[i - 1]);
  return u[i - 1] + (u[i] - u[i - 1]) * t;
}

function cellOcv(chem, soc) {
  const full = chem.full_v;
  const empty = chem.empty_v;
  const cutoff = chem.cutoff_v;
  if (Number.isNaN(soc)) return empty;
  if (soc >= 0.0) return empty + (full - empty) * cellShape(chem, soc);
  const s = Math.max(soc, SOC_MIN);
  if (s >= -0.05) return empty + (cutoff - empty) * (s / -0.05);
  return cutoff + (0.8 * cutoff - cutoff) * ((s + 0.05) / -0.05);
}

// ---------------------------------------------------------------------------------------------------------------
// Accessories on their anchors

function anchorOf(frame, slot) {
  const spec = frame.data.accessory_anchors && frame.data.accessory_anchors[slot];
  if (spec) return { x: spec.pos[0], y: spec.pos[1], z: spec.pos[2], tilt: spec.tilt_deg, length: spec.length_mm };
  const wheelbase = frame.data.wheelbase_mm;
  if (slot === 'top') return { x: 0.0, y: 0.16 * wheelbase, z: -0.23 * wheelbase, tilt: 15.0, length: 0.0 };
  return { x: 0.0, y: -3.0, z: -0.25 * wheelbase, tilt: 30.0, length: 0.15 * wheelbase };
}

function anchorToFrame(anchor, lx, ly, lz) {
  const tilt = toRadians(anchor.tilt);
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  return [anchor.x + lx, anchor.y + (ly * cos - lz * sin), anchor.z + (ly * sin + lz * cos)];
}

function accessoryBox(acc, slot) {
  const [w, h, d] = acc.data.size_mm;
  if (slot === 'top') return { min: [-w / 2.0, HINGE_CLEARANCE_MM, -d / 2.0], max: [w / 2.0, HINGE_CLEARANCE_MM + h, d / 2.0] };
  return { min: [-w / 2.0, -h, -d / 2.0], max: [w / 2.0, 0.0, d / 2.0] };
}

function anchorStretch(anchor, acc, slot) {
  const width = acc.data.size_mm[0];
  if (slot === 'bottom' && anchor.length > 0.0 && width > 0.0) return anchor.length / width;
  return 1.0;
}

// ---------------------------------------------------------------------------------------------------------------
// Airframe (ParamDerivation) without the parts only the live simulation needs (hull, hitbox, drag of the body)

function deriveAirframe(parts, catalog) {
  const { frame, stack, motor, prop, video, battery } = parts;
  const fd = frame.data;
  const md = motor.data;
  const pd = prop.data;
  const sd = stack.data;
  const bd = battery.data;
  const chem = catalog.chemistry(bd.chemistry);
  if (!chem) return null;
  const slots = ['top', 'bottom'].filter((slot) => parts.accessories[slot]);

  let accessoryMassGrams = 0.0;
  let accessoryWatts = 0.0;
  let accessoryArea = 0.0;
  for (const slot of slots) {
    const acc = parts.accessories[slot];
    accessoryMassGrams += acc.basics.mass_g;
    accessoryWatts += acc.data.flight_battery_w;
    accessoryArea += acc.data.frontal_area_m2;
  }

  const totalGrams = frame.basics.mass_g + stack.basics.mass_g + video.basics.mass_g + battery.basics.mass_g
    + MOTORS * (motor.basics.mass_g + prop.basics.mass_g) + accessoryMassGrams;
  const p = {};
  const m = totalGrams / 1000.0;
  p.massKg = m;
  const diameter = pd.diameter_mm / 1000.0;
  const radius = diameter / 2.0;
  const area = Math.PI * radius * radius;
  p.propDiameter = diameter;
  p.propRadius = radius;
  p.discArea = area;
  p.propPitch = pd.pitch_in * 0.0254;
  const ducted = fd.duct != null;
  p.ducted = ducted;
  const duct = fd.duct || {};
  p.ductClearance = duct.clearance_mm != null ? duct.clearance_mm / 1000.0 : DUCT_CLEARANCE;
  const statorDiameter = md.stator_mm[0] / 1000.0;
  const statorHeight = md.stator_mm[1] / 1000.0;
  const rotorY = statorHeight + ROTOR_PLANE_EXTRA;

  const batteryOnTop = fd.battery.on_top;
  const batteryPlateY = fd.battery.plate_mm / 1000.0;
  const electronicsY = fd.electronics_mm / 1000.0;
  const batteryMass = battery.basics.mass_g / 1000.0;
  let bh;
  let bw;
  let bl;
  if (bd.pack_mm) {
    bh = bd.pack_mm[2] / 1000.0;
    bw = bd.pack_mm[1] / 1000.0;
    bl = bd.pack_mm[0] / 1000.0;
  } else {
    const volumeCm3 = battery.basics.mass_g / chem.density_g_cm3;
    const heightCm = Math.cbrt(volumeCm3 / BATTERY_VOLUME_RATIO);
    bh = heightCm / 100.0;
    bw = BATTERY_WIDTH * bh;
    bl = BATTERY_LENGTH * bh;
  }
  const batteryY = batteryOnTop ? batteryPlateY + bh / 2.0 : batteryPlateY - bh / 2.0;
  const electronicsMass = (stack.basics.mass_g + video.basics.mass_g) / 1000.0;
  const motorMass = motor.basics.mass_g / 1000.0;
  const propMass = prop.basics.mass_g / 1000.0;
  const frameMass = frame.basics.mass_g / 1000.0;
  p.motorMassKg = motorMass;

  const accessoryMass = [];
  const accessoryCenter = [];
  const accessorySize = [];
  let accessoryMoment = 0.0;
  for (const slot of slots) {
    const acc = parts.accessories[slot];
    const anchor = anchorOf(frame, slot);
    const box = accessoryBox(acc, slot);
    const local = [(box.min[0] + box.max[0]) / 2.0, (box.min[1] + box.max[1]) / 2.0, (box.min[2] + box.max[2]) / 2.0];
    const center = anchorToFrame(anchor, local[0], local[1], local[2]);
    const mass = acc.basics.mass_g / 1000.0;
    const c = [-center[0] / 1000.0, center[1] / 1000.0, -center[2] / 1000.0];
    accessoryMass.push(mass);
    accessoryCenter.push(c);
    const [w, h, d] = acc.data.size_mm;
    accessorySize.push([w * anchorStretch(anchor, acc, slot) / 1000.0, h / 1000.0, d / 1000.0]);
    accessoryMoment += mass * c[1];
  }

  const kv = md.kv * 2.0 * Math.PI / 60.0;
  const kt = 1.0 / kv;
  const escCurrentPerMotor = sd.esc_continuous_a;
  const escR = sd.esc_resistance_ohm != null ? sd.esc_resistance_ohm : ESC_R_BASE + ESC_R_PER_A / escCurrentPerMotor;
  const rm = md.resistance_ohm + escR;
  p.kv = kv;
  p.kt = kt;
  p.motorResistance = md.resistance_ohm;
  p.escResistance = escR;
  p.phaseResistance = md.resistance_ohm + escR;
  p.idleCurrent = I0_FRACTION * md.max_current_a;
  p.escCurrentLimit = sd.esc_burst_a != null ? sd.esc_burst_a : ESC_BURST * escCurrentPerMotor;
  p.escInputLimit = ESC_INPUT_LIMIT * escCurrentPerMotor;
  p.escCurrentPerMotor = escCurrentPerMotor;
  const bell = statorDiameter / 2.0 + BELL_EXTRA;
  const j = PROP_J * propMass * radius * radius + BELL_J * motorMass * bell * bell;
  p.rotorInertia = j;
  p.omegaMax = OMEGA_MAX_FACTOR * kv * bd.cells * chem.full_v;

  const kT = pd.ct * RHO0 * Math.pow(diameter, 4) / (4.0 * Math.PI * Math.PI);
  const kQ = pd.cp * RHO0 * Math.pow(diameter, 5) / (8.0 * Math.PI * Math.PI * Math.PI);
  const ductGain = ducted ? (duct.thrust_gain != null ? duct.thrust_gain : DUCT_GAIN) : 1.0;
  p.kThrust = kT;
  p.kTorque = kQ;
  p.ductGain = ductGain;
  const weight = m * G;
  const omegaH = Math.sqrt(weight / (4.0 * kT * ductGain));
  p.hoverOmega = omegaH;
  const damping = kt * kt / rm + 2.0 * kQ * omegaH;
  const tauPhys = j / damping;
  const jEff = j * Math.min(1.0, MOTOR_TAU_MAX / tauPhys);
  p.motorTauPhys = tauPhys;
  p.rotorInertiaEff = jEff;
  p.motorTau = jEff / damping;
  p.zeroThrustPerOmega = (p.propPitch + ZERO_LIFT_PITCH * diameter) / (2.0 * Math.PI);
  p.hoverInducedVelocity = Math.sqrt(weight / (8.0 * RHO0 * area * ductGain));
  p.translationalLiftGain = ducted ? (duct.translational_lift_gain != null ? duct.translational_lift_gain : K_TL_DUCT) : K_TL_OPEN;
  const stiffness = pd.stiffness;
  p.propStiffness = stiffness;
  p.propFlex = stiffness === 1.0 ? 0.0 : 1.0 / stiffness - 1.0;

  p.cells = bd.cells;
  p.capacityMah = bd.capacity_mah;
  p.chemistry = chem;
  p.packResistance = bd.cells * bd.cell_resistance_ohm + WIRING_R;
  p.polarizationResistance = POL_FRACTION * p.packResistance;
  p.continuousCurrent = batteryContinuousCurrent(battery);
  p.fullPackVoltage = bd.cells * chem.full_v;
  p.accessoryPower = accessoryWatts;
  p.auxPower = AUX_BASE_W + AUX_PER_GRAM_W * video.basics.mass_g + p.accessoryPower;
  p.escMinCells = sd.cells[0];
  p.escMaxCells = sd.cells[1];
  p.escOvervoltage = bd.cells > sd.cells[1];

  thermal(p, motor);

  const az = fd.aero.frontal_area_m2 + accessoryArea;
  p.areaZ = az;
  const topFactor = ducted ? TOP_AREA_DUCT : TOP_AREA_OPEN;
  p.areaX = fd.aero.side_area_m2 != null ? fd.aero.side_area_m2 + SIDE_AREA * accessoryArea : SIDE_AREA * az;
  p.areaY = fd.aero.top_area_m2 != null ? fd.aero.top_area_m2 + topFactor * accessoryArea : topFactor * az;
  p.dragCoefficient = fd.aero.drag_coefficient;
  p.impactTolerance = fd.impact_tolerance;
  p.cameraTiltDeg = fd.camera.tilt_deg;
  p.cameraFovDeg = video.data.camera_fov_deg != null ? video.data.camera_fov_deg : DEFAULT_FOV_DEG;

  const body = { batteryMass, batteryY, bw, bh, bl, electronicsMass, electronicsY, motorMass, propMass, frameMass, rotorY,
    accessoryMass, accessoryCenter, accessorySize, accessoryMoment, massSplit: fd.mass_split };
  p.rm = rm;
  p.damping = damping;
  p.motorX = [0, 0, 0, 0];
  p.motorY = [0, 0, 0, 0];
  p.motorZ = [0, 0, 0, 0];
  p.mixRoll = [0, 0, 0, 0];
  p.mixPitch = [0, 0, 0, 0];
  p.comX = 0.0;
  p.comZ = 0.0;
  if (fd.arms_explicit) geometric(p, fd, body);
  else legacy(p, fd, body);
  lens(p, fd);
  return p;
}

function thermal(p, motor) {
  const t = motor.data.thermal;
  const motorGrams = p.motorMassKg * 1000.0;
  p.motorHeatCapacity = t.heat_capacity_j_per_k != null ? t.heat_capacity_j_per_k : MOTOR_HEAT_CAPACITY * motorGrams;
  const sizeFactor = Math.pow(motorGrams / 33.0, 2.0 / 3.0);
  const baseSet = t.cooling_w_per_k != null;
  const omegaSet = t.cooling_w_per_k_per_rad_s != null;
  if (!baseSet && !omegaSet) {
    p.motorCoolingBase = MOTOR_CONDUCTANCE_BASE;
    p.motorCoolingPerOmega = MOTOR_CONDUCTANCE_PER_OMEGA;
    p.motorCoolingScale = sizeFactor;
  } else {
    p.motorCoolingBase = baseSet ? t.cooling_w_per_k : MOTOR_CONDUCTANCE_BASE * sizeFactor;
    p.motorCoolingPerOmega = omegaSet ? t.cooling_w_per_k_per_rad_s : MOTOR_CONDUCTANCE_PER_OMEGA * sizeFactor;
    p.motorCoolingScale = 1.0;
  }
  p.motorDerateStartC = t.derate_start_c;
  p.motorMaxTempC = t.max_temp_c;
}

// Frames without explicit arms: true X from the wheelbase.
function legacy(p, fd, body) {
  const m = p.massKg;
  const armLength = fd.wheelbase_mm / 2000.0;
  const s = armLength / SQRT2;
  p.armLength = armLength;
  p.motorOffset = s;
  const rotorY = body.rotorY;
  const yCom = (body.batteryMass * body.batteryY + body.electronicsMass * body.electronicsY + 4.0 * body.motorMass * rotorY / 2.0
    + 4.0 * body.propMass * rotorY + body.accessoryMoment) / m;
  const ym = rotorY - yCom;
  p.comHeight = yCom;
  p.rotorPlaneOffset = ym;

  const { motorMass, propMass, frameMass, bw, bh, bl, batteryMass, electronicsMass } = body;
  let ixx = 0.0;
  let iyy = 0.0;
  const yMot = rotorY / 2.0 - yCom;
  ixx += 4.0 * motorMass * (s * s + yMot * yMot);
  iyy += 8.0 * motorMass * s * s;
  ixx += 4.0 * propMass * (s * s + ym * ym);
  iyy += 8.0 * propMass * s * s;
  const split = body.massSplit;
  const ma = split.arms * frameMass;
  const mp = split.plate * frameMass;
  const mr = split.duct * frameMass;
  const plate = PLATE_FRACTION * armLength;
  const yc2 = yCom * yCom;
  ixx += ma * (armLength * armLength / 6.0 + yc2);
  iyy += ma * armLength * armLength / 3.0;
  ixx += mp * (plate * plate / 12.0 + yc2);
  iyy += mp * plate * plate / 6.0;
  if (mr > 0.0) {
    const rd = p.propRadius + p.ductClearance;
    ixx += mr * (s * s + rd * rd / 2.0 + yc2);
    iyy += mr * (2.0 * s * s + rd * rd);
  }
  let izz = ixx;
  const yb = body.batteryY - yCom;
  ixx += batteryMass * ((bh * bh + bl * bl) / 12.0 + yb * yb);
  iyy += batteryMass * (bw * bw + bl * bl) / 12.0;
  izz += batteryMass * ((bw * bw + bh * bh) / 12.0 + yb * yb);
  const ye = body.electronicsY - yCom;
  ixx += electronicsMass * ye * ye;
  izz += electronicsMass * ye * ye;
  for (let k = 0; k < body.accessoryMass.length; k++) {
    const mk = body.accessoryMass[k];
    const xa = body.accessoryCenter[k][0];
    const ya = body.accessoryCenter[k][1] - yCom;
    const za = body.accessoryCenter[k][2];
    const wa = body.accessorySize[k][0];
    const ha = body.accessorySize[k][1];
    const da = body.accessorySize[k][2];
    ixx += mk * ((ha * ha + da * da) / 12.0 + ya * ya + za * za);
    iyy += mk * ((wa * wa + da * da) / 12.0 + xa * xa + za * za);
    izz += mk * ((wa * wa + ha * ha) / 12.0 + xa * xa + ya * ya);
  }
  p.inertiaXx = ixx;
  p.inertiaYy = iyy;
  p.inertiaZz = izz;

  const sx = [-s, -s, s, s];
  const sz = [-s, s, -s, s];
  for (let i = 0; i < MOTORS; i++) {
    p.motorX[i] = sx[i];
    p.motorY[i] = ym;
    p.motorZ[i] = sz[i];
    p.mixRoll[i] = sx[i] / s;
    p.mixPitch[i] = -sz[i] / s;
  }
}

// Moments of inertia of point masses, rods, boxes and rings (ParamDerivation.Inertia).
class Inertia {
  constructor() {
    this.xx = 0.0;
    this.yy = 0.0;
    this.zz = 0.0;
  }

  point(m, x, y, z) {
    this.xx += m * (y * y + z * z);
    this.yy += m * (x * x + z * z);
    this.zz += m * (x * x + y * y);
  }

  rod(m, ax, ay, az, bx, by, bz) {
    const x2 = (ax * ax + ax * bx + bx * bx) / 3.0;
    const y2 = (ay * ay + ay * by + by * by) / 3.0;
    const z2 = (az * az + az * bz + bz * bz) / 3.0;
    this.xx += m * (y2 + z2);
    this.yy += m * (x2 + z2);
    this.zz += m * (x2 + y2);
  }

  box(m, sx, sy, sz, x, y, z) {
    this.xx += m * ((sy * sy + sz * sz) / 12.0 + y * y + z * z);
    this.yy += m * ((sx * sx + sz * sz) / 12.0 + x * x + z * z);
    this.zz += m * ((sx * sx + sy * sy) / 12.0 + x * x + y * y);
  }

  ring(m, r, x, y, z) {
    this.xx += m * (r * r / 2.0 + y * y + z * z);
    this.yy += m * (r * r + x * x + z * z);
    this.zz += m * (r * r / 2.0 + x * x + y * y);
  }
}

// Frames with explicit arm positions.
function geometric(p, fd, body) {
  p.explicitArms = true;
  const ax = [0, 0, 0, 0];
  const ay = [0, 0, 0, 0];
  const azz = [0, 0, 0, 0];
  ARM_KEYS.forEach((key, position) => {
    const arm = fd.arms[key];
    const motor = SIM_MOTOR_BY_POSITION[position];
    ax[motor] = -arm.pos[0] / 1000.0;
    ay[motor] = arm.pos[1] / 1000.0;
    azz[motor] = -arm.pos[2] / 1000.0;
  });
  const m = p.massKg;
  const rotorY = body.rotorY;
  const com = fd.center_of_mass_mm;
  const fx = -com[0] / 1000.0;
  const fy = com[1] / 1000.0;
  const fz = -com[2] / 1000.0;

  let mx = body.frameMass * fx;
  let my = body.frameMass * fy + body.batteryMass * body.batteryY + body.electronicsMass * body.electronicsY;
  let mz = body.frameMass * fz;
  for (let i = 0; i < MOTORS; i++) {
    mx += (body.motorMass + body.propMass) * ax[i];
    my += body.motorMass * (ay[i] + rotorY / 2.0) + body.propMass * (ay[i] + rotorY);
    mz += (body.motorMass + body.propMass) * azz[i];
  }
  for (let k = 0; k < body.accessoryMass.length; k++) {
    mx += body.accessoryMass[k] * body.accessoryCenter[k][0];
    my += body.accessoryMass[k] * body.accessoryCenter[k][1];
    mz += body.accessoryMass[k] * body.accessoryCenter[k][2];
  }
  const cx = mx / m;
  const cy = my / m;
  const cz = mz / m;
  p.comX = cx;
  p.comZ = cz;
  p.comHeight = cy;

  const px = [0, 0, 0, 0];
  const pz = [0, 0, 0, 0];
  let maxX = 0.0;
  let maxZ = 0.0;
  let offset = 0.0;
  let reach = 0.0;
  let rotorPlane = 0.0;
  for (let i = 0; i < MOTORS; i++) {
    px[i] = ax[i] - cx;
    pz[i] = azz[i] - cz;
    p.motorX[i] = px[i];
    p.motorY[i] = ay[i] + rotorY - cy;
    p.motorZ[i] = pz[i];
    maxX = Math.max(maxX, Math.abs(px[i]));
    maxZ = Math.max(maxZ, Math.abs(pz[i]));
    offset += 0.5 * (Math.abs(px[i]) + Math.abs(pz[i]));
    reach += Math.sqrt(px[i] * px[i] + pz[i] * pz[i]);
    rotorPlane += p.motorY[i];
  }
  p.motorOffset = offset / MOTORS;
  p.armLength = reach / MOTORS;
  p.rotorPlaneOffset = rotorPlane / MOTORS;
  for (let i = 0; i < MOTORS; i++) {
    p.mixRoll[i] = maxX > 1e-6 ? px[i] / maxX : 0.0;
    p.mixPitch[i] = maxZ > 1e-6 ? -pz[i] / maxZ : 0.0;
  }

  const inertia = new Inertia();
  for (let i = 0; i < MOTORS; i++) {
    inertia.point(body.motorMass, px[i], ay[i] + rotorY / 2.0 - cy, pz[i]);
    inertia.point(body.propMass, px[i], ay[i] + rotorY - cy, pz[i]);
  }
  const split = body.massSplit;
  const ma = split.arms * body.frameMass / MOTORS;
  const mp = split.plate * body.frameMass;
  const mr = split.duct * body.frameMass / MOTORS;
  let minX = Infinity;
  let maxXf = -Infinity;
  let minZ = Infinity;
  let maxZf = -Infinity;
  for (let i = 0; i < MOTORS; i++) {
    inertia.rod(ma, -cx, -cy, -cz, px[i], ay[i] - cy, pz[i]);
    minX = Math.min(minX, ax[i]);
    maxXf = Math.max(maxXf, ax[i]);
    minZ = Math.min(minZ, azz[i]);
    maxZf = Math.max(maxZf, azz[i]);
  }
  const plateX = PLATE_FRACTION / SQRT2 * (maxXf - minX);
  const plateZ = PLATE_FRACTION / SQRT2 * (maxZf - minZ);
  inertia.box(mp, plateX, 0.0, plateZ, 0.5 * (minX + maxXf) - cx, -cy, 0.5 * (minZ + maxZf) - cz);
  const rd = p.propRadius + p.ductClearance;
  if (mr > 0.0) {
    for (let i = 0; i < MOTORS; i++) inertia.ring(mr, rd, px[i], ay[i] - cy, pz[i]);
  }
  inertia.box(body.batteryMass, body.bw, body.bh, body.bl, -cx, body.batteryY - cy, -cz);
  inertia.point(body.electronicsMass, -cx, body.electronicsY - cy, -cz);
  for (let k = 0; k < body.accessoryMass.length; k++) {
    const c = body.accessoryCenter[k];
    const size = body.accessorySize[k];
    inertia.box(body.accessoryMass[k], size[0], size[1], size[2], c[0] - cx, c[1] - cy, c[2] - cz);
  }
  p.inertiaXx = inertia.xx;
  p.inertiaYy = inertia.yy;
  p.inertiaZz = inertia.zz;
}

function lever(position, mix, sign) {
  let sum = 0.0;
  for (let i = 0; i < MOTORS; i++) sum += sign * position[i] * mix[i];
  return Math.max(sum, 1e-4);
}

// Control authority of the airframe (end of ParamDerivation.compute), used by the PID auto-tune.
function authority(p) {
  const hoverPoint = newPoint();
  hover(p, 0.5, true, 0.0, true, hoverPoint);
  const vh = hoverPoint.busVoltage;
  const idle = IDLE_REFERENCE;
  const dOmegaDDuty = (p.kt * vh / p.rm) / p.damping;
  const dThrustDOmega = 2.0 * p.kThrust * p.ductGain * p.hoverOmega;
  if (p.explicitArms) {
    const rollLever = lever(p.motorX, p.mixRoll, 1.0);
    const pitchLever = lever(p.motorZ, p.mixPitch, -1.0);
    p.authorityRoll = rollLever * dThrustDOmega * dOmegaDDuty * (1.0 - idle) / p.inertiaZz;
    p.authorityPitch = pitchLever * dThrustDOmega * dOmegaDDuty * (1.0 - idle) / p.inertiaXx;
  } else {
    const s = p.motorOffset;
    p.authorityRoll = 4.0 * s * dThrustDOmega * dOmegaDDuty * (1.0 - idle) / p.inertiaZz;
    p.authorityPitch = 4.0 * s * dThrustDOmega * dOmegaDDuty * (1.0 - idle) / p.inertiaXx;
  }
  p.authorityYawSteady = 4.0 * (2.0 * p.kTorque * p.hoverOmega) * dOmegaDDuty * (1.0 - idle) / p.inertiaYy;
  p.authorityYawInstant = 4.0 * p.kt * vh * (1.0 - idle) / (p.rm * p.inertiaYy);
  p.hoverVoltage = vh;
  return p;
}

function lens(p, fd) {
  const camera = fd.camera.pos;
  if (camera) {
    p.lensRight = camera[0] / 1000.0 + p.comX;
    p.lensUp = camera[1] / 1000.0 - p.comHeight;
    p.lensForward = -camera[2] / 1000.0 - p.comZ;
  } else if (p.explicitArms) {
    let front = 0.0;
    for (let i = 0; i < MOTORS; i++) front = Math.max(front, p.motorZ[i]);
    p.lensRight = p.comX;
    p.lensUp = LEGACY_LENS_UP;
    p.lensForward = front * LEGACY_LENS_FORWARD_FACTOR;
  } else {
    p.lensRight = 0.0;
    p.lensUp = LEGACY_LENS_UP;
    p.lensForward = p.motorOffset * LEGACY_LENS_FORWARD_FACTOR;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Rotor aerodynamics

function axialThrustFactor(lambda) {
  if (lambda >= 0.0) return Math.max(0.0, 1.0 - lambda);
  return 1.0 + DESCENT_GAIN * Math.min(-lambda, DESCENT_CAP);
}

function torqueFactor(lambda) {
  if (lambda >= 0.0) return Math.max(Q_MIN, 1.0 - Q_CLIMB * lambda);
  return 1.0 + Q_DESCENT * Math.min(-lambda, DESCENT_CAP);
}

function ductFactor(ducted, gain, lambda) {
  if (!ducted) return 1.0;
  if (lambda <= 0.0) return gain;
  return 1.0 + (gain - 1.0) * clamp01(1.0 - lambda / DUCT_FADE);
}

function flexFactor(p, omega) {
  if (p.propFlex === 0.0) return 1.0;
  const load = omega / p.hoverOmega;
  const excess = Math.min(Math.max(0.0, load * load - 1.0), FLEX_LOAD_CAP);
  return 1.0 - FLEX_LOSS * p.propFlex * excess / FLEX_LOAD_CAP;
}

function inflowRatio(axialSpeed, zeroThrustPerOmega, omega) {
  return axialSpeed / Math.max(V0_MIN, zeroThrustPerOmega * omega);
}

function translationalLiftFactor(crossSpeed, hoverInducedVelocity, gain, scale) {
  const mu = crossSpeed / hoverInducedVelocity;
  const mu2 = mu * mu;
  return 1.0 + scale * gain * mu2 / (1.0 + mu2);
}

function thrust(p, omega, axialSpeed, crossSpeed, rhoRatio, tlScale) {
  const lambda = inflowRatio(axialSpeed, p.zeroThrustPerOmega, omega);
  const t = p.kThrust * rhoRatio * ductFactor(p.ducted, p.ductGain, lambda) * axialThrustFactor(lambda)
    * translationalLiftFactor(crossSpeed, p.hoverInducedVelocity, p.translationalLiftGain, tlScale) * omega * omega;
  return p.propFlex === 0.0 ? t : t * flexFactor(p, omega);
}

function airTorque(p, omega, axialSpeed, rhoRatio) {
  const lambda = inflowRatio(axialSpeed, p.zeroThrustPerOmega, omega);
  return p.kTorque * rhoRatio * torqueFactor(lambda) * omega * omega;
}

function hForceMagnitude(t, crossSpeed, omega, radius) {
  return KAPPA_H * t * crossSpeed / (omega * radius + H_TIP_OFFSET);
}

// ---------------------------------------------------------------------------------------------------------------
// Operating points

function newPoint() {
  return { busVoltage: 0, duty: 0, omega: 0, phaseCurrent: 0, batteryCurrent: 0, thrustPerMotor: 0, feasible: false };
}

function emf(p, soc) {
  return p.cells * cellOcv(p.chemistry, soc);
}

function internalResistance(p, batteryCurrent, soc) {
  const rate = 1.0 + C_RATE_PENALTY * Math.max(0.0, batteryCurrent / p.continuousCurrent - 1.0);
  const low = 1.0 + LOW_SOC_GAIN * Math.max(0.0, LOW_SOC_KNEE - soc) / LOW_SOC_KNEE;
  return p.packResistance * rate * low;
}

function inputLimitedCurrent(r, backEmf, busVoltage, inputLimit) {
  if (!(busVoltage > 0.0) || !(inputLimit > 0.0)) return 0.0;
  const e = Math.max(0.0, backEmf);
  return 2.0 * busVoltage * inputLimit / (e + Math.sqrt(e * e + 4.0 * r * busVoltage * inputLimit));
}

function currentLimit(p, busVoltage, omega) {
  return Math.min(p.escCurrentLimit, inputLimitedCurrent(p.phaseResistance, p.kt * omega, busVoltage, p.escInputLimit));
}

function phaseCurrent(p, duty, busVoltage, omega) {
  return Math.min((duty * busVoltage - p.kt * omega) / p.phaseResistance, currentLimit(p, busVoltage, omega));
}

function motorInputCurrent(p, busVoltage, omega, current) {
  return (p.phaseResistance * current + p.kt * omega) * current / busVoltage;
}

function motorBalance(p, duty, busVoltage, axialSpeed, rhoRatio, omega) {
  const current = phaseCurrent(p, duty, busVoltage, omega);
  return p.kt * (current - p.idleCurrent) - airTorque(p, omega, axialSpeed, rhoRatio);
}

function motorOmega(p, duty, busVoltage, axialSpeed, rhoRatio) {
  if (motorBalance(p, duty, busVoltage, axialSpeed, rhoRatio, 0.0) <= 0.0) return 0.0;
  let lo = 0.0;
  let hi = p.omegaMax;
  for (let k = 0; k < MOTOR_STEPS; k++) {
    const mid = 0.5 * (lo + hi);
    if (motorBalance(p, duty, busVoltage, axialSpeed, rhoRatio, mid) > 0.0) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

function uniformDuty(p, duty, soc, polarized, axialSpeed, crossSpeed, out, fixedPolarization = 0.0) {
  const e = emf(p, soc);
  let lo = 0.05 * e;
  let hi = e;
  for (let k = 0; k < BUS_STEPS; k++) {
    const mid = 0.5 * (lo + hi);
    const omega = motorOmega(p, duty, mid, axialSpeed, 1.0);
    const current = phaseCurrent(p, duty, mid, omega);
    const iBat = 4.0 * motorInputCurrent(p, mid, omega, current) + p.auxPower / mid;
    const r = internalResistance(p, iBat, soc);
    const vPol = polarized ? p.polarizationResistance * iBat : fixedPolarization;
    if (e - vPol - r * iBat - mid > 0.0) lo = mid;
    else hi = mid;
  }
  const v = 0.5 * (lo + hi);
  const omega = motorOmega(p, duty, v, axialSpeed, 1.0);
  const current = phaseCurrent(p, duty, v, omega);
  out.busVoltage = v;
  out.duty = duty;
  out.omega = omega;
  out.phaseCurrent = current;
  out.batteryCurrent = 4.0 * motorInputCurrent(p, v, omega, current) + p.auxPower / v;
  out.thrustPerMotor = thrust(p, omega, axialSpeed, crossSpeed, 1.0, 1.0);
  out.feasible = true;
}

function steadyMotor(p, omega, current, soc, polarized, fixedPolarization, sag, out) {
  const e = emf(p, sag ? soc : 1.0);
  const drive = p.phaseResistance * current + p.kt * omega;
  let v = e;
  for (let k = 0; k < HOVER_STEPS; k++) {
    const vv = Math.max(v, 0.05 * e);
    const duty = drive / vv;
    const iBat = 4.0 * duty * current + p.auxPower / vv;
    const r = internalResistance(p, iBat, soc);
    const vPol = polarized ? p.polarizationResistance * iBat : fixedPolarization;
    v = 0.5 * v + 0.5 * (e - vPol - r * iBat);
  }
  v = Math.max(v, 0.05 * e);
  const duty = drive / v;
  out.busVoltage = v;
  out.duty = duty;
  out.omega = omega;
  out.phaseCurrent = current;
  out.batteryCurrent = 4.0 * duty * current + p.auxPower / v;
  out.thrustPerMotor = p.kThrust * p.ductGain * omega * omega;
  out.feasible = duty <= 1.0 && current <= currentLimit(p, v, omega) + 1e-9;
}

function hoverCurrent(p) {
  return p.kTorque * p.hoverOmega * p.hoverOmega / p.kt + p.idleCurrent;
}

function hover(p, soc, polarized, fixedPolarization, sag, out) {
  steadyMotor(p, p.hoverOmega, hoverCurrent(p), soc, polarized, fixedPolarization, sag, out);
}

function omegaForThrust(p, t, axialSpeed, crossSpeed) {
  if (t <= 0.0) return 0.0;
  let lo = 0.0;
  let hi = 2.0 * p.omegaMax;
  for (let k = 0; k < THRUST_STEPS; k++) {
    const mid = 0.5 * (lo + hi);
    if (thrust(p, mid, axialSpeed, crossSpeed, 1.0, 1.0) < t) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

function bodyDragY(p, speed, tilt) {
  return 0.5 * RHO0 * p.dragCoefficient * p.areaY * speed * speed * Math.sin(tilt);
}

function bodyDragZ(p, speed, tilt) {
  return 0.5 * RHO0 * p.dragCoefficient * p.areaZ * speed * speed * Math.cos(tilt);
}

function requiredThrust(p, speed, tilt) {
  return p.massKg * G * Math.cos(tilt) + bodyDragY(p, speed, tilt);
}

function levelFlightOmega(p, speed, tilt) {
  const sin = Math.sin(tilt);
  const cos = Math.cos(tilt);
  return omegaForThrust(p, requiredThrust(p, speed, tilt) / 4.0, speed * sin, speed * cos);
}

function forwardBalance(p, speed, tilt) {
  const sin = Math.sin(tilt);
  const cos = Math.cos(tilt);
  const total = requiredThrust(p, speed, tilt);
  const omega = omegaForThrust(p, total / 4.0, speed * sin, speed * cos);
  const h = hForceMagnitude(total, speed * cos, omega, p.propRadius);
  return p.massKg * G * sin - h - bodyDragZ(p, speed, tilt);
}

function speedAtTilt(p, tilt) {
  if (tilt <= 0.0) return 0.0;
  let lo = 0.0;
  let hi = MAX_SPEED;
  if (forwardBalance(p, hi, tilt) > 0.0) return hi;
  for (let k = 0; k < SPEED_STEPS; k++) {
    const mid = 0.5 * (lo + hi);
    if (forwardBalance(p, mid, tilt) > 0.0) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

function fullThrust(p, speed, tilt, soc, scratch) {
  const sin = Math.sin(tilt);
  const cos = Math.cos(tilt);
  uniformDuty(p, 1.0, soc, true, speed * sin, speed * cos, scratch);
  return 4.0 * scratch.thrustPerMotor;
}

function topSpeedTilt(p, soc) {
  const scratch = newPoint();
  if (fullThrust(p, 0.0, 0.0, soc, scratch) < requiredThrust(p, 0.0, 0.0)) return 0.0;
  let lo = 0.0;
  let hi = MAX_TILT;
  for (let k = 0; k < TILT_STEPS; k++) {
    const mid = 0.5 * (lo + hi);
    const v = speedAtTilt(p, mid);
    if (requiredThrust(p, v, mid) <= fullThrust(p, v, mid, soc, scratch)) lo = mid;
    else hi = mid;
  }
  return lo;
}

function tiltForSpeed(p, speed, maxTilt) {
  let lo = 0.0;
  let hi = maxTilt;
  for (let k = 0; k < TILT_STEPS; k++) {
    const mid = 0.5 * (lo + hi);
    if (speedAtTilt(p, mid) < speed) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

function flightTimeMinutes(p, omega, current) {
  const pt = newPoint();
  const capacity = p.capacityMah;
  const limit = 0.8 * capacity;
  let used = 0.0;
  for (let second = 0; second < 360000; second++) {
    const soc = 1.0 - used / capacity;
    steadyMotor(p, omega, current, soc, true, 0.0, true, pt);
    const step = Math.max(pt.batteryCurrent, 1e-6) / 3.6;
    if (used + step >= limit) return (second + (limit - used) / step) / 60.0;
    used += step;
  }
  return 6000.0;
}

function fullThrottleMotorTemp(p, ambient) {
  const pt = newPoint();
  let temp = ambient;
  let max = ambient;
  for (let k = 0; k < HEAT_SEGMENTS; k++) {
    const soc = 1.0 - (k + 0.5) / HEAT_SEGMENTS;
    uniformDuty(p, 1.0, soc, true, 0.0, 0.0, pt);
    const seconds = p.capacityMah / HEAT_SEGMENTS * 3.6 / Math.max(pt.batteryCurrent, 1e-3);
    const power = pt.phaseCurrent * pt.phaseCurrent * p.motorResistance + p.kt * p.idleCurrent * pt.omega;
    const g = (p.motorCoolingBase + p.motorCoolingPerOmega * pt.omega) * p.motorCoolingScale;
    const inf = ambient + power / g;
    temp = inf + (temp - inf) * Math.exp(-seconds * g / p.motorHeatCapacity);
    if (!Number.isFinite(temp)) return NaN;
    max = Math.max(max, temp);
  }
  return max;
}

// ---------------------------------------------------------------------------------------------------------------
// Camera occlusion: share of the FPV image covered by prop discs

function propsInViewPercent(p) {
  const fovDeg = Number.isFinite(p.cameraFovDeg) ? clamp(p.cameraFovDeg, 30.0, 170.0) : DEFAULT_FOV_DEG;
  const tilt = toRadians(Number.isFinite(p.cameraTiltDeg) ? p.cameraTiltDeg : 0.0);
  const tanH = Math.tan(toRadians(fovDeg) / 2.0);
  const tanV = tanH / ASPECT;
  const sin = Math.sin(tilt);
  const cos = Math.cos(tilt);
  const lx = -p.lensRight;
  const ly = p.lensUp;
  const lz = p.lensForward;
  const r2 = p.propRadius * p.propRadius;
  let hits = 0;
  for (let row = 0; row < ROWS; row++) {
    const b = (1.0 - 2.0 * (row + 0.5) / ROWS) * tanV;
    for (let col = 0; col < COLUMNS; col++) {
      const a = (2.0 * (col + 0.5) / COLUMNS - 1.0) * tanH;
      const dx = -a;
      const dy = sin + b * cos;
      const dz = cos - b * sin;
      if (Math.abs(dy) < 1e-9) continue;
      for (let i = 0; i < MOTORS; i++) {
        const t = (p.motorY[i] - ly) / dy;
        if (t <= 0.0) continue;
        const ex = lx + t * dx - p.motorX[i];
        const ez = lz + t * dz - p.motorZ[i];
        if (ex * ex + ez * ez <= r2) {
          hits++;
          break;
        }
      }
    }
  }
  return 100.0 * hits / (ROWS * COLUMNS);
}

// ---------------------------------------------------------------------------------------------------------------
// BuildAnalysis

function compute(p) {
  const warnings = new Set();
  const weight = p.massKg * G;

  const full = newPoint();
  uniformDuty(p, 1.0, 1.0, false, 0.0, 0.0, full);
  const maxThrust = full.thrustPerMotor;
  const tw = 4.0 * maxThrust / weight;

  const hoverHalf = newPoint();
  hover(p, 0.5, true, 0.0, true, hoverHalf);
  const hoverStick = (hoverHalf.duty - IDLE_REFERENCE) / (1.0 - IDLE_REFERENCE);
  const hoverFull = newPoint();
  hover(p, 1.0, true, 0.0, true, hoverFull);
  const canHover = tw >= 1.15 && hoverStick <= 1.0 && hoverHalf.feasible;
  if (!canHover) warnings.add('cannot_hover');
  if (tw < 2.0) warnings.add('underpowered');
  if (p.motorTauPhys > 0.06) warnings.add('sluggish_motors');
  const fullCell = full.busVoltage / p.cells;
  if (fullCell < p.chemistry.cutoff_v) warnings.add('heavy_sag');
  if (full.phaseCurrent >= currentLimit(p, full.busVoltage, full.omega) - 1e-9) warnings.add('esc_current_limited');
  if (full.batteryCurrent > 1.3 * p.continuousCurrent) warnings.add('battery_overload');

  const hoverPercent = canHover ? 100.0 * hoverStick : NaN;
  const hoverCurrentA = canHover ? hoverFull.batteryCurrent : NaN;
  const hoverTime = canHover ? flightTimeMinutes(p, p.hoverOmega, hoverCurrent(p)) : NaN;

  const topTilt = canHover ? topSpeedTilt(p, TOP_SPEED_SOC) : 0.0;
  const topSpeed = topTilt > 0.0 ? speedAtTilt(p, topTilt) : 0.0;
  const angleTilt = Math.min(DEFAULT_ANGLE_LIMIT, topTilt);
  const angleSpeed = angleTilt > 0.0 ? speedAtTilt(p, angleTilt) : 0.0;

  let cruiseTime = hoverTime;
  if (canHover && topSpeed > 0.0) {
    const cruiseSpeed = 0.5 * topSpeed;
    const tilt = tiltForSpeed(p, cruiseSpeed, topTilt);
    const speed = speedAtTilt(p, tilt);
    const omega = levelFlightOmega(p, speed, tilt);
    const axial = speed * Math.sin(tilt);
    const current = airTorque(p, omega, axial, 1.0) / p.kt + p.idleCurrent;
    cruiseTime = flightTimeMinutes(p, omega, current);
  }

  const motorTemp = fullThrottleMotorTemp(p, REFERENCE_AMBIENT_C);
  if (motorTemp > p.motorDerateStartC) warnings.add('motor_thermal');
  const propsInView = propsInViewPercent(p);
  if (propsInView > PROPS_IN_VIEW_WARNING) warnings.add('props_in_view');
  if (p.escOvervoltage) warnings.add('esc_overvoltage');

  return {
    mass_grams: p.massKg * 1000.0,
    thrust_to_weight: tw,
    hover_throttle_percent: hoverPercent,
    hover_flight_time_min: hoverTime,
    cruise_flight_time_min: cruiseTime,
    top_speed_kmh: topSpeed * 3.6,
    full_throttle_current_a: full.batteryCurrent,
    esc_load_percent: 100.0 * full.phaseCurrent / p.escCurrentPerMotor,
    battery_load_percent: 100.0 * full.batteryCurrent / p.continuousCurrent,
    motor_response_ms: p.motorTauPhys * 1000.0,
    crash_speed_ms: p.impactTolerance,
    sustained_motor_temp_c: motorTemp,
    props_in_view_percent: propsInView,
    warnings: ANALYSIS_WARNINGS.filter((w) => warnings.has(w)),
    // Extra values of the mod's BuildAnalysis that BuildStats does not carry:
    extra: {
      max_thrust_per_motor_g: maxThrust / G * 1000.0,
      hover_current_a: hoverCurrentA,
      full_throttle_cell_voltage: fullCell,
      top_speed_angle_kmh: angleSpeed * 3.6,
      hover_omega_rad_s: p.hoverOmega,
      max_omega_rad_s: full.omega,
    },
  };
}

/**
 * Derived airframe parameters of a build (mass, rotor constants, motor positions, inertia, control authority, …),
 * or null if the build cannot be analysed. Used by the tune defaults.
 */
export function airframe(build, catalog) {
  const { parts, unknown, misplaced } = resolveBuild(build, catalog);
  if (unknown.length || misplaced) return null;
  const p = deriveAirframe(parts, catalog);
  return p ? authority(p) : null;
}

/** OperatingPoints.hoverStick: hover throttle (0–1 of the stick above idle) at a state of charge. */
export function hoverStick(p, soc) {
  const pt = newPoint();
  hover(p, soc, true, 0.0, true, pt);
  return (pt.duty - IDLE_REFERENCE) / (1.0 - IDLE_REFERENCE);
}

/** The key figures of BuildStats in the mod's order (without warnings). */
export const STAT_KEYS = Object.freeze(['mass_grams', 'thrust_to_weight', 'hover_throttle_percent', 'hover_flight_time_min',
  'cruise_flight_time_min', 'top_speed_kmh', 'full_throttle_current_a', 'esc_load_percent', 'battery_load_percent',
  'motor_response_ms', 'crash_speed_ms', 'sustained_motor_temp_c', 'props_in_view_percent']);

/**
 * Analyses a build like the mod's workbench.
 * @param {{frame, stack, motor, prop, video, battery, accessories?}} build part ids
 * @param {object} catalog from data.js
 * @returns {object|null} BuildStats as described at the top of this file, null if the build cannot be analysed
 */
export function analyze(build, catalog) {
  const { parts, unknown, misplaced } = resolveBuild(build, catalog);
  if (unknown.length || misplaced) return null;
  const p = deriveAirframe(parts, catalog);
  if (!p) return null;
  return compute(p);
}
