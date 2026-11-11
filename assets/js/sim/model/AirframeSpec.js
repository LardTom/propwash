// Port of de.lardtom.propwash.sim.AirframeSpec (1:1) and of the parts of sim.ParamDerivation the live simulation needs
// (Propwash 0.6.0).
//
// AirframeSpec.of(build, catalog[, creative]) / fromBuild(build, catalog[, creative]) derive the airframe of a
// configurator build ({frame, stack, motor, prop, video, battery, accessories: {top?, bottom?, front?}} part ids;
// catalog from configurator/data.js) like ParamDerivation.derive(DroneBuild); with `creative` like an edited drone of
// the drone editor, ParamDerivation.compute(source, flight, inertia) (see fromBuild). Everything
// assets/js/configurator/analysis.js already derives (mass, rotor constants, motor positions, inertia, lens, motor and
// ESC heat, energy factors, hover voltage, control authority, …; verified against the mod to the last digit) is taken
// from its airframe(); the rest is ported here from ParamDerivation.java: hull and ground points with the stand points
// of accessories that reach below the hull, hitbox, rotational damping, spin directions, throttle weights (mixer
// throttle column), motor spacing, restitution/friction, prop wash loss/noise, prop brittleness, reverse thrust/torque,
// brownout voltage, motor heat wear, camera tilt/FOV, the inertia override, build key and buildable/assemblable.
// tools/test-sim-model.mjs checks every field against the classes of the release (presets, accessory variants, drones
// of the drone editor) and the mod's AirframeGoldenTest: all groups match once Math.pow returns StrictMath.pow's value
// for three inputs of analysis.js, which are one ulp off fdlibm in JS: 0.076^5 (kTorque of 76 mm props, also 152 mm add-on
// props) and (m / 33 g)^(2/3) of the 9 g and 47 g motors (motorCoolingScale).
//
// Conventions of the port:
// - Private arrays whose Java name equals an accessor (motorX[] / motorX(i), spin[] / spin(i), groundCount /
//   groundCount(), …) are stored as `_name`; package-private fields (washLoss, washNoise, motorMassKg, stackMassKg)
//   keep their names.
// - chemistry is the catalog chemistry object with the Java-named fullCellVoltage / emptyCellVoltage / cutoffCellVoltage
//   added (see javaChemistry); role is the lower-case FrameRole key of analysis.js ('freestyle', 'race', …).
// - Extra (not in the Java class): fpv, the FPV rig of analysis.js/fpv.js, unchanged, for the renderer; parts, the
//   resolved catalog parts {frame, stack, motor, prop, video, battery, accessories: {top?, bottom?, front?}} of the
//   build (Java reaches them through spec.build: e.g. EnergyModel.videoSupplyW(p.build.video()) -> p.parts.video); for
//   a drone of the drone editor both are those of the flight build, `build` stays the built-in build like in the mod.
// - Part wear does not exist in the configurator: every build is derived pristine.

import { ModelConstants } from './ModelConstants.js?v=760466ce';
import { RotorAero } from './RotorAero.js?v=22dc31b6';
import { SimMath } from './SimMath.js?v=44da8aea';
import { PropFailure } from './PropFailure.js?v=35d07a01';
import { FrameGeometry } from './FrameGeometry.js?v=4d41b5f3';
import { airframe, anchorOf, accessoryBox, anchorToFrame, anchorStretch, tiltFor } from '../../configurator/analysis.js?v=f3f32120';
import { resolveBuild, check } from '../../configurator/rules.js?v=6634f777';
import { cameraFov } from '../../configurator/fpv.js?v=76cdbbe6';

const SQRT2 = Math.sqrt(2.0);
// ParamDerivation.MIN_THROTTLE_WEIGHT
const MIN_THROTTLE_WEIGHT = 0.2;
// ParamDerivation.ACCESSORY_STAND_MIN, FOOT_CORNERS
const ACCESSORY_STAND_MIN = 0.005;
const FOOT_CORNERS = 4;
// StackType.CREATIVE_FC: fits every frame (StackType#fits).
const CREATIVE_FC = 'propwash:creative_fc';
// PartWear.SIM_MOTOR_BY_POSITION: arm position (front left, front right, rear left, rear right) -> motor index.
const SIM_MOTOR_BY_POSITION = [3, 1, 2, 0];
const ARM_KEYS = ['front_left', 'front_right', 'rear_left', 'rear_right'];
// PartIndex.DEFAULT_NAMESPACE
const DEFAULT_NAMESPACE = 'propwash';
// AccessoryMount order of Accessories (EnumMap): TOP, BOTTOM, FRONT.
const ACCESSORY_SLOTS = ['top', 'bottom', 'front'];

export class AirframeSpec {
  static MOTORS = 4;
  static HULL_POINTS = 12;
  static ACCESSORY_GROUND = AirframeSpec.HULL_POINTS + 8;
  static ACCESSORY_POINTS = 8;
  static STAND_LEGS = AirframeSpec.MOTORS;
  static GROUND_POINTS = AirframeSpec.ACCESSORY_GROUND + AirframeSpec.ACCESSORY_POINTS + AirframeSpec.STAND_LEGS;
  static LEGACY_LENS_UP = 0.015;
  static LEGACY_LENS_FORWARD_FACTOR = 0.7;

  constructor(d) {
    this.build = d.build;
    this.buildKey = d.buildKey;
    this.buildable = d.buildable;
    this.assemblable = d.assemblable;
    this.massKg = d.massKg;
    this.armLength = d.armLength;
    this.motorOffset = d.motorOffset;
    this.motorSpacing = d.motorSpacing;
    this.propDiameter = d.propDiameter;
    this.propRadius = d.propRadius;
    this.discArea = d.discArea;
    this.propPitch = d.propPitch;
    this.ducted = d.ducted;
    this.comHeight = d.comHeight;
    this.comX = d.comX;
    this.comZ = d.comZ;
    this.rotorPlaneOffset = d.rotorPlaneOffset;
    this.inertiaXx = d.inertiaXx;
    this.inertiaYy = d.inertiaYy;
    this.inertiaZz = d.inertiaZz;
    this.kv = d.kv;
    this.kt = d.kt;
    this.motorResistance = d.motorResistance;
    this.escResistance = d.escResistance;
    this.phaseResistance = d.motorResistance + d.escResistance;
    this.idleCurrent = d.idleCurrent;
    this.escCurrentLimit = d.escCurrentLimit;
    this.escInputLimit = d.escInputLimit;
    this.rotorInertia = d.rotorInertia;
    this.rotorInertiaEff = d.rotorInertiaEff;
    this.omegaMax = d.omegaMax;
    this.hoverOmega = d.hoverOmega;
    this.motorTauPhys = d.motorTauPhys;
    this.motorTau = d.motorTau;
    this.kThrust = d.kThrust;
    this.kTorque = d.kTorque;
    this.ductGain = d.ductGain;
    this.ductClearance = d.ductClearance;
    this.zeroThrustPerOmega = d.zeroThrustPerOmega;
    this.inducedPerOmega = RotorAero.inducedPerOmega(d.kThrust, d.discArea);
    this.translationalLiftGain = d.translationalLiftGain;
    this.hoverInducedVelocity = d.hoverInducedVelocity;
    this.washNoiseHz = d.washNoiseHz;
    this.cells = d.cells;
    this.capacityMah = d.capacityMah;
    this.chemistry = d.chemistry;
    this.packResistance = d.packResistance;
    this.polarizationResistance = d.polarizationResistance;
    this.continuousCurrent = d.continuousCurrent;
    this.fullPackVoltage = d.fullPackVoltage;
    this.auxPower = d.auxPower;
    this.accessoryPower = d.accessoryPower;
    this.accessoryMassKg = d.accessoryMassKg;
    this.brownoutVoltage = d.brownoutVoltage;
    this.escMinCells = d.escMinCells;
    this.escMaxCells = d.escMaxCells;
    this.escOvervoltage = d.cells > d.escMaxCells;
    this.areaX = d.areaX;
    this.areaY = d.areaY;
    this.areaZ = d.areaZ;
    this.dragCoefficient = d.dragCoefficient;
    this.rotationalDamping = d.rotationalDamping;
    this.impactTolerance = d.impactTolerance;
    this.restitution = d.restitution;
    this.friction = d.friction;
    this.hitboxWidth = d.hitboxWidth;
    this.hitboxHeight = d.hitboxHeight;
    this.hitboxFootOffset = d.hitboxFootOffset;
    this.authorityRoll = d.authorityRoll;
    this.authorityPitch = d.authorityPitch;
    this.authorityYawSteady = d.authorityYawSteady;
    this.authorityYawInstant = d.authorityYawInstant;
    this.hoverVoltage = d.hoverVoltage;
    this.lensRight = d.lensRight;
    this.lensUp = d.lensUp;
    this.lensForward = d.lensForward;
    this.cameraTiltDeg = d.cameraTiltDeg;
    this.cameraFovDeg = d.cameraFovDeg;
    this.motorHeatCapacity = d.motorHeatCapacity;
    this.motorCoolingBase = d.motorCoolingBase;
    this.motorCoolingPerOmega = d.motorCoolingPerOmega;
    this.motorCoolingScale = d.motorCoolingScale;
    this.motorEddyLoss = d.motorEddyLoss;
    this.escCooling = d.escCooling;
    this.motorDerateStartC = d.motorDerateStartC;
    this.motorMaxTempC = d.motorMaxTempC;
    this.motorHeatWearPerSecond = d.motorHeatWearPerSecond;
    this.propStiffness = d.propStiffness;
    this.propFlex = d.propFlex;
    this.propBrittleness = d.propBrittleness;
    this.reverseThrust = d.reverseThrust;
    this.reverseTorque = d.reverseTorque;
    this.reversePitch = d.reversePitch;
    this.avionicsPower = d.avionicsPower;
    this.driveLossHover = d.driveLossHover;
    this.propFactor = d.propFactor;
    this.propFullFactor = d.propFullFactor;
    this.fullLoadOmega = d.fullLoadOmega;
    this.usableFraction = d.usableFraction;
    this.landingCellVoltage = d.landingCellVoltage;
    this.role = d.role;
    this.explicitArms = d.explicitArms;
    this.uniformThrottle = d.uniformThrottle;
    this.washLoss = d.washLoss;
    this.washNoise = d.washNoise;
    this.motorMassKg = d.motorMassKg;
    this.stackMassKg = d.stackMassKg;
    this._motorX = new Float64Array(AirframeSpec.MOTORS);
    this._motorY = new Float64Array(AirframeSpec.MOTORS);
    this._motorZ = new Float64Array(AirframeSpec.MOTORS);
    this._spin = new Int32Array(AirframeSpec.MOTORS);
    this._mixRoll = new Float64Array(AirframeSpec.MOTORS);
    this._mixPitch = new Float64Array(AirframeSpec.MOTORS);
    this._mixThrottle = new Float64Array(AirframeSpec.MOTORS);
    this._hullX = new Float64Array(AirframeSpec.HULL_POINTS);
    this._hullY = new Float64Array(AirframeSpec.HULL_POINTS);
    this._hullZ = new Float64Array(AirframeSpec.HULL_POINTS);
    this._groundX = new Float64Array(AirframeSpec.GROUND_POINTS);
    this._groundY = new Float64Array(AirframeSpec.GROUND_POINTS);
    this._groundZ = new Float64Array(AirframeSpec.GROUND_POINTS);
    this._motorX.set(d.motorX.subarray(0, AirframeSpec.MOTORS));
    this._motorY.set(d.motorY.subarray(0, AirframeSpec.MOTORS));
    this._motorZ.set(d.motorZ.subarray(0, AirframeSpec.MOTORS));
    this._spin.set(d.spin.subarray(0, AirframeSpec.MOTORS));
    this._mixRoll.set(d.mixRoll.subarray(0, AirframeSpec.MOTORS));
    this._mixPitch.set(d.mixPitch.subarray(0, AirframeSpec.MOTORS));
    this._mixThrottle.set(d.mixThrottle.subarray(0, AirframeSpec.MOTORS));
    this._hullX.set(d.hullX.subarray(0, AirframeSpec.HULL_POINTS));
    this._hullY.set(d.hullY.subarray(0, AirframeSpec.HULL_POINTS));
    this._hullZ.set(d.hullZ.subarray(0, AirframeSpec.HULL_POINTS));
    this._groundCount = d.groundCount;
    this.groundMask = d.groundMask;
    this.accessoryCorners = d.standCount;
    this._groundX.set(d.groundX.subarray(0, AirframeSpec.GROUND_POINTS));
    this._groundY.set(d.groundY.subarray(0, AirframeSpec.GROUND_POINTS));
    this._groundZ.set(d.groundZ.subarray(0, AirframeSpec.GROUND_POINTS));
    // Not in the Java class: the FPV rig of the configurator (fpv.js), for the renderer, and the resolved catalog parts.
    this.fpv = d.fpv;
    this.parts = d.parts;
  }

  /**
   * AirframeSpec.of(DroneBuild) / ParamDerivation.derive: cached per catalog and build (the spec is immutable).
   * Returns null if a part is unknown or an accessory sits in the wrong slot. With `creative` (see fromBuild) the drone
   * is derived like an edited build of the drone editor (ParamDerivation.computeEdited); such specs are not cached here
   * (the mod keeps the last 128 in an LRU).
   */
  static of(build, catalog, creative = null) {
    if (creative != null) return AirframeSpec.fromBuild(build, catalog, creative);
    let cache = DERIVED.get(catalog);
    if (!cache) {
      cache = new Map();
      DERIVED.set(catalog, cache);
    }
    const key = cacheKey(build);
    if (cache.has(key)) return cache.get(key);
    const spec = AirframeSpec.fromBuild(build, catalog);
    cache.set(key, spec);
    return spec;
  }

  /**
   * Derives a fresh AirframeSpec of a configurator build (ParamDerivation.compute), or null if it cannot be derived.
   *
   * creative (optional, a drone of the drone editor: ParamDerivation.compute(source, flight, inertia)):
   *   { build, catalog, inertia, hash? }
   *   - build: the flight build (DroneBuild.flight(), CreativeFlight#flight) as part ids like `build`;
   *   - catalog: the catalog that knows the parts of the flight build with their edited data (same interface as
   *     configurator/data.js; only part(id) and chemistry(id) are asked);
   *   - inertia: CreativeFlight#inertia in kg·m², in its order [roll, pitch, yaw] = [inertiaZz, inertiaXx, inertiaYy],
   *     NaN for an axis left automatic; or null for no override;
   *   - hash (optional): the last part of the build key (PartIndex.hashOf of the creative values in the mod); without it
   *     16 hex digits of a 64-bit FNV-1a hash of the flight parts and the inertia.
   *   `build` (with `catalog`) stays the built-in build: AirframeSpec.build, buildable/assemblable and the build key's
   *   "/creative/<stack>/<hash>" come from it (a part `catalog` does not know, like the creative flight controller, is
   *   looked up in creative.catalog); every physical value comes from the flight build, the inertia override is applied
   *   after the geometry and the control authority is computed with it. Without `creative` nothing changes.
   */
  static fromBuild(build, catalog, creative = null) {
    if (creative != null) {
      const flight = creative.build;
      const flightCatalog = creative.catalog;
      const { parts, unknown, misplaced } = resolveBuild(flight, flightCatalog);
      if (unknown.length || misplaced) return null;
      const derived = airframe(flight, flightCatalog);
      if (!derived) return null;
      return compute(build, parts, catalog, derived, creative);
    }
    const { parts, unknown, misplaced } = resolveBuild(build, catalog);
    if (unknown.length || misplaced) return null;
    const derived = airframe(build, catalog);
    if (!derived) return null;
    return compute(build, parts, catalog, derived, null);
  }

  static defaultBrownoutVoltage(escMinCells) {
    return escMinCells === 1 ? ModelConstants.BROWNOUT_1S : ModelConstants.BROWNOUT_MULTI;
  }

  static defaultSideAreaM2(frontalAreaM2) {
    return ModelConstants.SIDE_AREA * frontalAreaM2;
  }

  static defaultTopAreaM2(frontalAreaM2, ducted) {
    return (ducted ? ModelConstants.TOP_AREA_DUCT : ModelConstants.TOP_AREA_OPEN) * frontalAreaM2;
  }

  motorX(i) {
    return this._motorX[i];
  }

  motorY(i) {
    return this._motorY[i];
  }

  motorZ(i) {
    return this._motorZ[i];
  }

  spin(i) {
    return this._spin[i];
  }

  mixRoll(i) {
    return this._mixRoll[i];
  }

  mixPitch(i) {
    return this._mixPitch[i];
  }

  mixThrottle(i) {
    return this._mixThrottle[i];
  }

  mixYaw(i) {
    return this._spin[i];
  }

  hullCount() {
    return AirframeSpec.HULL_POINTS;
  }

  hullX(k) {
    return this._hullX[k];
  }

  hullY(k) {
    return this._hullY[k];
  }

  hullZ(k) {
    return this._hullZ[k];
  }

  groundCount() {
    return this._groundCount;
  }

  groundUsed(k) {
    return (this.groundMask & (1 << k)) !== 0;
  }

  groundX(k) {
    return this._groundX[k];
  }

  groundY(k) {
    return this._groundY[k];
  }

  groundZ(k) {
    return this._groundZ[k];
  }

  accessoryPointCount() {
    return this.accessoryCorners;
  }

  standPointCount() {
    return Math.max(0, this._groundCount - AirframeSpec.ACCESSORY_GROUND);
  }

  accessoryX(k) {
    return this._groundX[AirframeSpec.ACCESSORY_GROUND + k];
  }

  accessoryY(k) {
    return this._groundY[AirframeSpec.ACCESSORY_GROUND + k];
  }

  accessoryZ(k) {
    return this._groundZ[AirframeSpec.ACCESSORY_GROUND + k];
  }

  /** How far the accessory stands reach below the hitbox; orientation {x, y, z, w} (the Java takes a float Quaternionfc). */
  accessoryDepth(orientation) {
    const count = this.accessoryPointCount();
    if (count === 0) {
      return 0.0;
    }
    const qx = orientation.x;
    const qy = orientation.y;
    const qz = orientation.z;
    const qw = orientation.w;
    const ax = 2.0 * (qx * qy + qw * qz);
    const ay = 1.0 - 2.0 * (qx * qx + qz * qz);
    const az = 2.0 * (qy * qz - qw * qx);
    let lowest = Infinity;
    for (let k = 0; k < count; k++) {
      lowest = Math.min(lowest, -ax * this.accessoryX(k) + ay * this.accessoryY(k) - az * this.accessoryZ(k));
    }
    const depth = this.hitboxFootOffset - lowest;
    return Number.isFinite(depth) && depth > 0.0 ? depth : 0.0;
  }

  hullMotor(k) {
    return k < AirframeSpec.MOTORS ? k : -1;
  }

  hoverThrust() {
    return this.massKg * ModelConstants.G / AirframeSpec.MOTORS;
  }

  propwashNoiseFactor() {
    return this.propStiffness === 1.0 ? 1.0 : 1.0 / Math.sqrt(this.propStiffness);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// ParamDerivation

const DERIVED = new WeakMap();

function cacheKey(build) {
  const acc = build.accessories || {};
  return JSON.stringify([build.frame, build.stack, build.motor, build.prop, build.video, build.battery, acc.top ?? null, acc.bottom ?? null,
    acc.front ?? null]);
}

/** ParamDerivation.Draft */
export class Draft {
  build = null;
  buildKey = '';
  buildable = false;
  assemblable = false;
  massKg = 0.0;
  armLength = 0.0;
  motorOffset = 0.0;
  motorSpacing = 0.0;
  propDiameter = 0.0;
  propRadius = 0.0;
  discArea = 0.0;
  propPitch = 0.0;
  ducted = false;
  comHeight = 0.0;
  comX = 0.0;
  comZ = 0.0;
  rotorPlaneOffset = 0.0;
  inertiaXx = 0.0;
  inertiaYy = 0.0;
  inertiaZz = 0.0;
  kv = 0.0;
  kt = 0.0;
  motorResistance = 0.0;
  escResistance = 0.0;
  idleCurrent = 0.0;
  escCurrentLimit = 0.0;
  escInputLimit = 0.0;
  rotorInertia = 0.0;
  rotorInertiaEff = 0.0;
  omegaMax = 0.0;
  hoverOmega = 0.0;
  motorTauPhys = 0.0;
  motorTau = 0.0;
  kThrust = 0.0;
  kTorque = 0.0;
  ductGain = 0.0;
  ductClearance = 0.0;
  zeroThrustPerOmega = 0.0;
  translationalLiftGain = 0.0;
  hoverInducedVelocity = 0.0;
  washNoiseHz = 0.0;
  cells = 0;
  capacityMah = 0.0;
  chemistry = null;
  packResistance = 0.0;
  polarizationResistance = 0.0;
  continuousCurrent = 0.0;
  fullPackVoltage = 0.0;
  auxPower = 0.0;
  accessoryPower = 0.0;
  accessoryMassKg = 0.0;
  brownoutVoltage = 0.0;
  escMinCells = 0;
  escMaxCells = 0;
  areaX = 0.0;
  areaY = 0.0;
  areaZ = 0.0;
  dragCoefficient = 0.0;
  rotationalDamping = 0.0;
  impactTolerance = 0.0;
  restitution = 0.0;
  friction = 0.0;
  hitboxWidth = 0.0;
  hitboxHeight = 0.0;
  hitboxFootOffset = 0.0;
  authorityRoll = 0.0;
  authorityPitch = 0.0;
  authorityYawSteady = 0.0;
  authorityYawInstant = 0.0;
  hoverVoltage = 0.0;
  lensRight = 0.0;
  lensUp = 0.0;
  lensForward = 0.0;
  cameraTiltDeg = 0.0;
  cameraFovDeg = 0.0;
  washLoss = 0.0;
  washNoise = 0.0;
  motorMassKg = 0.0;
  stackMassKg = 0.0;
  motorHeatCapacity = 0.0;
  motorCoolingBase = 0.0;
  motorCoolingPerOmega = 0.0;
  motorCoolingScale = 0.0;
  motorEddyLoss = 0.0;
  escCooling = 0.0;
  motorDerateStartC = 0.0;
  motorMaxTempC = 0.0;
  motorHeatWearPerSecond = 0.0;
  propStiffness = 0.0;
  propFlex = 0.0;
  propBrittleness = 0.0;
  reverseThrust = 0.0;
  reverseTorque = 0.0;
  reversePitch = 0.0;
  avionicsPower = 0.0;
  driveLossHover = 0.0;
  propFactor = 0.0;
  propFullFactor = 0.0;
  fullLoadOmega = 0.0;
  usableFraction = 0.0;
  landingCellVoltage = 0.0;
  role = 'freestyle';
  explicitArms = false;
  uniformThrottle = true;
  motorX = new Float64Array(AirframeSpec.MOTORS);
  motorY = new Float64Array(AirframeSpec.MOTORS);
  motorZ = new Float64Array(AirframeSpec.MOTORS);
  spin = new Int32Array(AirframeSpec.MOTORS);
  mixRoll = new Float64Array(AirframeSpec.MOTORS);
  mixPitch = new Float64Array(AirframeSpec.MOTORS);
  mixThrottle = Float64Array.of(1.0, 1.0, 1.0, 1.0);
  hullX = new Float64Array(AirframeSpec.HULL_POINTS);
  hullY = new Float64Array(AirframeSpec.HULL_POINTS);
  hullZ = new Float64Array(AirframeSpec.HULL_POINTS);
  groundCount = 0;
  groundMask = 0;
  groundX = new Float64Array(AirframeSpec.GROUND_POINTS);
  groundY = new Float64Array(AirframeSpec.GROUND_POINTS);
  groundZ = new Float64Array(AirframeSpec.GROUND_POINTS);
  standCount = 0;
  standX = new Float64Array(AirframeSpec.ACCESSORY_POINTS);
  standY = new Float64Array(AirframeSpec.ACCESSORY_POINTS);
  standZ = new Float64Array(AirframeSpec.ACCESSORY_POINTS);
  // Not in the Java Draft: the FPV rig of analysis.js and the resolved catalog parts.
  fpv = null;
  parts = null;
}

/**
 * BatteryType.Chemistry: the catalog chemistry object (soc_grid, ocv_shape, full_v, empty_v, cutoff_v, …) with the
 * Java-named fullCellVoltage / emptyCellVoltage / cutoffCellVoltage. Added to the catalog object itself so a chemistry
 * keeps its identity (CellCurve caches per chemistry); a frozen object gets one cached copy instead.
 */
const CHEMISTRY_COPIES = new WeakMap();

export function javaChemistry(chem) {
  if (chem.fullCellVoltage === chem.full_v && chem.emptyCellVoltage === chem.empty_v && chem.cutoffCellVoltage === chem.cutoff_v) {
    return chem;
  }
  if (Object.isExtensible(chem)) {
    chem.fullCellVoltage = chem.full_v;
    chem.emptyCellVoltage = chem.empty_v;
    chem.cutoffCellVoltage = chem.cutoff_v;
    return chem;
  }
  let copy = CHEMISTRY_COPIES.get(chem);
  if (!copy) {
    copy = Object.freeze({ ...chem, fullCellVoltage: chem.full_v, emptyCellVoltage: chem.empty_v, cutoffCellVoltage: chem.cutoff_v });
    CHEMISTRY_COPIES.set(chem, copy);
  }
  return copy;
}

/** PartIndex.keyOf: the path for Propwash's own parts, else the full id. */
function keyOf(id) {
  const colon = id.indexOf(':');
  const namespace = colon >= 0 ? id.slice(0, colon) : 'minecraft';
  return namespace === DEFAULT_NAMESPACE ? id.slice(colon + 1) : id;
}

/**
 * DroneBuild.problems() of the built-in build: rules.js check(). The creative flight controller fits every frame
 * (StackType#fits) and is no part of the web catalog: problems() asks the stack for nothing else, so a build with it is
 * checked with the flight build's stack in its place and without stack_mount.
 */
function sourceProblems(source, catalog, creative) {
  const lookup = creative == null ? catalog : {
    part: (id) => catalog.part(id) || creative.catalog.part(id),
    chemistry: (id) => (catalog.chemistry && catalog.chemistry(id)) || creative.catalog.chemistry(id),
  };
  if (source.stack !== CREATIVE_FC) return check(source, lookup).problems;
  const stand = lookup.part(source.stack) || creative == null ? source : { ...source, stack: creative.build.stack };
  return check(stand, lookup).problems.filter((issue) => issue !== 'stack_mount');
}

/** 16 hex digits of the 64-bit FNV-1a hash of a string (UTF-16 code units). */
function fnv64(text) {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i++) {
    h ^= BigInt(text.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}

function creativeHash(parts, creative) {
  if (typeof creative.hash === 'string') return creative.hash;
  const slots = ACCESSORY_SLOTS.filter((slot) => parts.accessories[slot]);
  const data = (p) => [p.id, p.basics, p.data];
  const inertia = creative.inertia == null ? null : Array.from(creative.inertia, (v) => (Number.isNaN(v) ? 'auto' : v));
  return fnv64(JSON.stringify([data(parts.frame), data(parts.stack), data(parts.motor), data(parts.prop), data(parts.video),
    data(parts.battery), slots.map((slot) => data(parts.accessories[slot])), inertia]));
}

/**
 * ParamDerivation.compute(source, flight, inertia): `derived` is analysis.js's airframe() of the flight build, `parts`
 * its resolved parts; `source` and `catalog` the built-in build (the same build without `creative`).
 */
function compute(source, parts, catalog, derived, creative) {
  const d = new Draft();
  const { frame, stack, motor, prop, video, battery } = parts;
  const fd = frame.data;
  const md = motor.data;
  const pd = prop.data;
  const sd = stack.data;
  const bd = battery.data;
  d.build = source;
  d.parts = parts;
  const slots = ACCESSORY_SLOTS.filter((slot) => parts.accessories[slot]);
  const accessoriesKey = slots.map((slot) => `${slot}=${keyOf(parts.accessories[slot].id)}`).join('+');
  d.buildKey = keyOf(frame.id) + '/' + keyOf(stack.id) + '/' + keyOf(motor.id) + '/' + keyOf(prop.id) + '/' + keyOf(video.id) + '/'
    + keyOf(battery.id) + (slots.length === 0 ? '' : '/' + accessoriesKey)
    + (creative == null ? '' : '/creative/' + keyOf(source.stack) + '/' + creativeHash(parts, creative));
  // DroneBuild.buildable(): no problems; buildable(PartCompatibility.LIFTED): no problem that is not a compatibility
  // issue (only MISSING_PART, which a resolved build never has). Both of the built-in build.
  const problems = sourceProblems(source, catalog, creative);
  d.buildable = problems.length === 0;
  d.assemblable = problems.every((issue) => issue !== 'missing_part');

  // Reused from analysis.js (ParamDerivation.compute up to the operating points).
  d.massKg = derived.massKg;
  d.propDiameter = derived.propDiameter;
  d.propRadius = derived.propRadius;
  d.discArea = derived.discArea;
  d.propPitch = derived.propPitch;
  d.ducted = derived.ducted;
  d.ductClearance = derived.ductClearance;
  d.motorMassKg = derived.motorMassKg;
  d.kv = derived.kv;
  d.kt = derived.kt;
  d.motorResistance = derived.motorResistance;
  d.escResistance = derived.escResistance;
  d.idleCurrent = derived.idleCurrent;
  d.escCurrentLimit = derived.escCurrentLimit;
  d.escInputLimit = derived.escInputLimit;
  d.rotorInertia = derived.rotorInertia;
  d.omegaMax = derived.omegaMax;
  d.kThrust = derived.kThrust;
  d.kTorque = derived.kTorque;
  d.ductGain = derived.ductGain;
  d.hoverOmega = derived.hoverOmega;
  d.motorTauPhys = derived.motorTauPhys;
  d.rotorInertiaEff = derived.rotorInertiaEff;
  d.motorTau = derived.motorTau;
  d.zeroThrustPerOmega = derived.zeroThrustPerOmega;
  d.hoverInducedVelocity = derived.hoverInducedVelocity;
  d.translationalLiftGain = derived.translationalLiftGain;
  d.propStiffness = derived.propStiffness;
  d.propFlex = derived.propFlex;
  d.cells = derived.cells;
  d.capacityMah = derived.capacityMah;
  d.chemistry = javaChemistry(derived.chemistry);
  d.packResistance = derived.packResistance;
  d.polarizationResistance = derived.polarizationResistance;
  d.continuousCurrent = derived.continuousCurrent;
  d.fullPackVoltage = derived.fullPackVoltage;
  d.accessoryPower = derived.accessoryPower;
  d.auxPower = derived.auxPower;
  d.avionicsPower = derived.avionicsPower;
  d.driveLossHover = derived.driveLossHover;
  d.propFactor = derived.propFactor;
  d.propFullFactor = derived.propFullFactor;
  d.usableFraction = derived.usableFraction;
  d.landingCellVoltage = derived.landingCellVoltage;
  d.role = derived.role;
  d.escMinCells = derived.escMinCells;
  d.escMaxCells = derived.escMaxCells;
  d.motorHeatCapacity = derived.motorHeatCapacity;
  d.motorCoolingBase = derived.motorCoolingBase;
  d.motorCoolingPerOmega = derived.motorCoolingPerOmega;
  d.motorCoolingScale = derived.motorCoolingScale;
  d.motorEddyLoss = derived.motorEddyLoss;
  d.escCooling = derived.escCooling;
  d.motorDerateStartC = derived.motorDerateStartC;
  d.motorMaxTempC = derived.motorMaxTempC;
  d.areaZ = derived.areaZ;
  d.areaX = derived.areaX;
  d.areaY = derived.areaY;
  d.dragCoefficient = derived.dragCoefficient;
  d.impactTolerance = derived.impactTolerance;
  // legacy()/geometric() and lens()
  d.explicitArms = derived.explicitArms === true;
  d.armLength = derived.armLength;
  d.motorOffset = derived.motorOffset;
  d.comHeight = derived.comHeight;
  d.comX = derived.comX;
  d.comZ = derived.comZ;
  d.rotorPlaneOffset = derived.rotorPlaneOffset;
  d.inertiaXx = derived.inertiaXx;
  d.inertiaYy = derived.inertiaYy;
  d.inertiaZz = derived.inertiaZz;
  for (let i = 0; i < AirframeSpec.MOTORS; i++) {
    d.motorX[i] = derived.motorX[i];
    d.motorY[i] = derived.motorY[i];
    d.motorZ[i] = derived.motorZ[i];
    d.mixRoll[i] = derived.mixRoll[i];
    d.mixPitch[i] = derived.mixPitch[i];
  }
  d.lensRight = derived.lensRight;
  d.lensUp = derived.lensUp;
  d.lensForward = derived.lensForward;
  // Operating points and control authority (end of compute).
  d.hoverVoltage = derived.hoverVoltage;
  d.fullLoadOmega = derived.fullLoadOmega;
  d.authorityRoll = derived.authorityRoll;
  d.authorityPitch = derived.authorityPitch;
  d.authorityYawSteady = derived.authorityYawSteady;
  d.authorityYawInstant = derived.authorityYawInstant;
  d.fpv = derived.fpv;

  // Ported from ParamDerivation.compute: what analysis.js leaves out.
  const diameter = d.propDiameter;
  const duct = fd.duct || {};
  const geo = FrameGeometry.of(frame);
  let bh;
  let bw;
  let bl;
  if (bd.pack_mm) {
    bh = bd.pack_mm[2] / 1000.0;
    bw = bd.pack_mm[1] / 1000.0;
    bl = bd.pack_mm[0] / 1000.0;
  } else {
    const density = d.chemistry.density_g_cm3;
    const volumeCm3 = battery.basics.mass_g / density;
    // StrictMath.cbrt in the mod; Math.cbrt like analysis.js (may differ in the last bit; only parts without pack_mm).
    const heightCm = Math.cbrt(volumeCm3 / (ModelConstants.BATTERY_LENGTH * ModelConstants.BATTERY_WIDTH));
    bh = heightCm / 100.0;
    bw = ModelConstants.BATTERY_WIDTH * bh;
    bl = ModelConstants.BATTERY_LENGTH * bh;
  }
  const batteryY = geo.batteryOnTop() ? geo.batteryPlateY() + bh / 2.0 : geo.batteryPlateY() - bh / 2.0;
  const electronicsY = geo.electronicsY();
  d.stackMassKg = stack.basics.mass_g / 1000.0;

  let accessoryMassGrams = 0.0;
  let accessoryTop = -Infinity;
  let accessoryTopX = 0.0;
  let accessoryTopZ = 0.0;
  const accessoryFeet = [];
  for (const slot of slots) {
    const acc = parts.accessories[slot];
    accessoryFeet.push(slot !== 'top' ? feet(anchorCorners(frame, acc, slot)) : null);
    accessoryMassGrams += acc.basics.mass_g;
    if (slot === 'top') {
      for (const corner of anchorCorners(frame, acc, slot)) {
        if (corner[1] / 1000.0 > accessoryTop) {
          accessoryTop = corner[1] / 1000.0;
          accessoryTopX = -corner[0] / 1000.0;
          accessoryTopZ = -corner[2] / 1000.0;
        }
      }
    }
  }
  d.accessoryMassKg = accessoryMassGrams / 1000.0;

  d.washNoiseHz = 12.0 * Math.sqrt(0.127 / diameter);
  d.washLoss = d.ducted ? (duct.wash_loss != null ? duct.wash_loss : ModelConstants.WASH_LOSS_DUCT) : ModelConstants.WASH_LOSS_OPEN;
  const washNoise = d.ducted ? (duct.wash_noise != null ? duct.wash_noise : ModelConstants.WASH_NOISE_DUCT) : ModelConstants.WASH_NOISE_OPEN;
  const stiffness = pd.stiffness;
  d.washNoise = stiffness === 1.0 ? washNoise : washNoise / Math.sqrt(stiffness);
  d.propBrittleness = PropFailure.of(prop).brittleness();
  // PropDefinition.reverseThrust: the catalog carries no reverse_thrust, so the standard value unless one appears.
  const reverse = pd.reverse_thrust != null ? pd.reverse_thrust : ModelConstants.REVERSE_THRUST_STANDARD;
  d.reverseThrust = reverse;
  d.reverseTorque = ModelConstants.REVERSE_TORQUE_BASE + (1.0 - ModelConstants.REVERSE_TORQUE_BASE) * reverse;
  d.reversePitch = Math.sqrt(reverse);
  d.brownoutVoltage = sd.brownout_v != null ? sd.brownout_v
    : sd.cells[0] === 1 ? ModelConstants.BROWNOUT_1S : ModelConstants.BROWNOUT_MULTI;
  // thermal(): MotorThermal.wearPerSecondAtMax / PartBasics.durability
  d.motorHeatWearPerSecond = md.thermal.wear_per_s_at_max / motor.basics.durability;
  d.restitution = d.ducted ? (duct.restitution != null ? duct.restitution : ModelConstants.RESTITUTION_DUCT) : ModelConstants.RESTITUTION_OPEN;
  d.friction = d.ducted ? (duct.friction != null ? duct.friction : ModelConstants.FRICTION_DUCT) : ModelConstants.FRICTION_OPEN;
  d.cameraTiltDeg = fd.camera.tilt_deg;
  d.cameraFovDeg = cameraFov(video);

  const body = { batteryY, bw, bh, bl, electronicsY, accessoryTop, accessoryTopX, accessoryTopZ, accessoryFeet,
    batteryOnTop: geo.batteryOnTop() };
  if (fd.arms_explicit) {
    geometric(d, fd, body);
  } else {
    legacy(d, body);
  }
  const inertia = creative == null ? null : creative.inertia;
  if (inertia != null) {
    d.inertiaZz = Number.isNaN(inertia[0]) ? d.inertiaZz : inertia[0];
    d.inertiaXx = Number.isNaN(inertia[1]) ? d.inertiaXx : inertia[1];
    d.inertiaYy = Number.isNaN(inertia[2]) ? d.inertiaYy : inertia[2];
    authority(d);
  }
  return new AirframeSpec(d);
}

/**
 * The control authority at the end of ParamDerivation.compute, again with the overridden inertia (analysis.js computed
 * it with the automatic one). The hover operating point does not depend on the inertia, so its bus voltage is
 * analysis.js's hoverVoltage.
 */
function authority(d) {
  const kt = d.kt;
  const rm = d.motorResistance + d.escResistance;
  const kQ = d.kTorque;
  const omegaH = d.hoverOmega;
  const damping = kt * kt / rm + 2.0 * kQ * omegaH;
  const vh = d.hoverVoltage;
  const idle = ModelConstants.IDLE_REFERENCE;
  const dOmegaDDuty = (kt * vh / rm) / damping;
  const dThrustDOmega = 2.0 * d.kThrust * d.ductGain * omegaH;
  if (d.explicitArms) {
    const rollLever = lever(d.motorX, d.mixRoll, 1.0);
    const pitchLever = lever(d.motorZ, d.mixPitch, -1.0);
    d.authorityRoll = rollLever * dThrustDOmega * dOmegaDDuty * (1.0 - idle) / d.inertiaZz;
    d.authorityPitch = pitchLever * dThrustDOmega * dOmegaDDuty * (1.0 - idle) / d.inertiaXx;
  } else {
    const s = d.motorOffset;
    d.authorityRoll = 4.0 * s * dThrustDOmega * dOmegaDDuty * (1.0 - idle) / d.inertiaZz;
    d.authorityPitch = 4.0 * s * dThrustDOmega * dOmegaDDuty * (1.0 - idle) / d.inertiaXx;
  }
  d.authorityYawSteady = 4.0 * (2.0 * kQ * omegaH) * dOmegaDDuty * (1.0 - idle) / d.inertiaYy;
  d.authorityYawInstant = 4.0 * kt * vh * (1.0 - idle) / (rm * d.inertiaYy);
}

/** ParamDerivation.lever */
function lever(position, mix, sign) {
  let sum = 0.0;
  for (let i = 0; i < AirframeSpec.MOTORS; i++) sum += sign * position[i] * mix[i];
  return Math.max(sum, 1e-4);
}

/** Double.compare */
function doubleCompare(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  const x = Object.is(a, -0) ? -0.5 : Number.isNaN(a) ? 2 : 0;
  const y = Object.is(b, -0) ? -0.5 : Number.isNaN(b) ? 2 : 0;
  return x < y ? -1 : x > y ? 1 : 0;
}

/** ParamDerivation.feet: the four lowest corners of an accessory box (stable sort by height), in sim axes and metres. */
function feet(corners) {
  const order = corners.map((_, c) => c).sort((a, b) => doubleCompare(corners[a][1], corners[b][1]));
  const out = [];
  for (let c = 0; c < FOOT_CORNERS; c++) {
    const corner = corners[order[c]];
    out.push([-corner[0] / 1000.0, corner[1] / 1000.0, -corner[2] / 1000.0]);
  }
  return out;
}

/** ParamDerivation.standOnAccessories: the feet of accessories that reach below the hull stand on the ground. */
function standOnAccessories(d, body, cx, cy, cz, bottom) {
  d.standCount = 0;
  for (const f of body.accessoryFeet) {
    if (f == null || d.standCount + f.length > AirframeSpec.ACCESSORY_POINTS) continue;
    let lowest = Infinity;
    for (const foot of f) lowest = Math.min(lowest, foot[1] - cy);
    if (!(lowest < bottom - ACCESSORY_STAND_MIN)) continue;
    for (const foot of f) {
      d.standX[d.standCount] = foot[0] - cx;
      d.standY[d.standCount] = foot[1] - cy;
      d.standZ[d.standCount] = foot[2] - cz;
      d.standCount++;
    }
  }
}

/** AccessoryAnchor.corners(type) of an accessory on the frame (mm, frame coordinates), with tiltFor and stretch. */
function anchorCorners(frame, acc, slot) {
  const anchor = anchorOf(frame, slot);
  const box = accessoryBox(acc, slot);
  const stretch = anchorStretch(anchor, acc, slot);
  const tilt = tiltFor(anchor, acc);
  const out = [];
  for (let c = 0; c < 8; c++) {
    const lx = ((c & 1) === 0 ? box.min[0] : box.max[0]) * stretch;
    const ly = (c & 2) === 0 ? box.min[1] : box.max[1];
    const lz = (c & 4) === 0 ? box.min[2] : box.max[2];
    out.push(anchorToFrame(anchor, tilt, lx, ly, lz));
  }
  return out;
}

/**
 * ParamDerivation.legacy (true X from the wheelbase): what analysis.js leaves out – motor spacing, rotational damping,
 * spin directions, hull and ground points, hitbox. Centre of mass, rotor plane and inertia come from analysis.js; the
 * motor positions and mixer roll/pitch are set again exactly as the Java does (same values as analysis.js).
 */
function legacy(d, body) {
  const armLength = d.armLength;
  const s = d.motorOffset;
  d.motorSpacing = 2.0 * s;
  const radius = d.propRadius;
  const diameter = d.propDiameter;
  const bw = body.bw;
  const bh = body.bh;
  const bl = body.bl;
  const batteryY = body.batteryY;
  const electronicsY = body.electronicsY;
  const yCom = d.comHeight;
  const ym = d.rotorPlaneOffset;

  d.rotationalDamping = 0.5 * ModelConstants.RHO0 * d.dragCoefficient * d.areaY * armLength * armLength * armLength / 4.0;

  const sx = [-s, -s, s, s];
  const sz = [-s, s, -s, s];
  const spin = [-1, 1, 1, -1];
  const tipRadius = radius + (d.ducted ? d.ductClearance : 0.0);
  const tip = s + tipRadius / SQRT2;
  const bottom = -yCom - ModelConstants.HULL_MARGIN;
  for (let i = 0; i < AirframeSpec.MOTORS; i++) {
    d.motorX[i] = sx[i];
    d.motorY[i] = ym;
    d.motorZ[i] = sz[i];
    d.spin[i] = spin[i];
    d.mixRoll[i] = sx[i] / s;
    d.mixPitch[i] = -sz[i] / s;
    d.hullX[i] = Math.sign(sx[i]) * tip;
    d.hullY[i] = ym;
    d.hullZ[i] = Math.sign(sz[i]) * tip;
    d.hullX[4 + i] = sx[i];
    d.hullY[4 + i] = bottom;
    d.hullZ[4 + i] = sz[i];
  }
  const batteryFace = (body.batteryOnTop ? batteryY + bh / 2.0 : batteryY - bh / 2.0) - yCom;
  d.hullX[8] = 0.0;
  d.hullY[8] = batteryFace;
  d.hullZ[8] = bl / 2.0;
  d.hullX[9] = 0.0;
  d.hullY[9] = batteryFace;
  d.hullZ[9] = -bl / 2.0;
  if (body.batteryOnTop && body.accessoryTop - yCom > d.hullY[8]) {
    d.hullY[8] = body.accessoryTop - yCom;
    d.hullZ[8] = body.accessoryTopZ;
  }
  d.hullX[10] = 0.0;
  d.hullY[10] = electronicsY - yCom;
  d.hullZ[10] = 0.8 * s;
  d.hullX[11] = 0.0;
  d.hullY[11] = bottom;
  d.hullZ[11] = 0.0;
  standOnAccessories(d, body, 0.0, yCom, 0.0, bottom);
  groundPoints(d, 0.0, batteryFace, bw, bl, 0.0, d.ducted, bottom);
  let minY = Infinity;
  let maxY = -Infinity;
  for (let k = 0; k < AirframeSpec.HULL_POINTS; k++) {
    minY = Math.min(minY, d.hullY[k]);
    maxY = Math.max(maxY, d.hullY[k]);
  }
  d.hitboxWidth = 2.0 * s + diameter + (d.ducted ? 2.0 * d.ductClearance : 0.0);
  d.hitboxHeight = maxY - minY;
  d.hitboxFootOffset = minY;
}

/** ParamDerivation.Arms.of(geometry.arms()): arm positions in metres (sim axes) and spins per sim motor. */
function armsOf(fd) {
  const out = {
    x: new Float64Array(AirframeSpec.MOTORS),
    y: new Float64Array(AirframeSpec.MOTORS),
    z: new Float64Array(AirframeSpec.MOTORS),
    spin: new Int32Array(AirframeSpec.MOTORS),
  };
  for (let position = 0; position < ARM_KEYS.length; position++) {
    const arm = fd.arms[ARM_KEYS[position]];
    const motor = SIM_MOTOR_BY_POSITION[position];
    out.x[motor] = -arm.pos[0] / 1000.0;
    out.y[motor] = arm.pos[1] / 1000.0;
    out.z[motor] = -arm.pos[2] / 1000.0;
    out.spin[motor] = arm.spin === 'cw' ? -1 : 1;
  }
  return out;
}

/**
 * ParamDerivation.geometric (explicit arms): what analysis.js leaves out – spin directions, motor spacing, throttle
 * weights, rotational damping, hull and ground points, hitbox. Centre of mass, motor positions, mixer roll/pitch,
 * inertia and arm length come from analysis.js.
 */
function geometric(d, fd, body) {
  d.explicitArms = true;
  const arms = armsOf(fd);
  const cx = d.comX;
  const cy = d.comHeight;
  const cz = d.comZ;

  const px = new Float64Array(AirframeSpec.MOTORS);
  const pz = new Float64Array(AirframeSpec.MOTORS);
  let armLow = Infinity;
  for (let i = 0; i < AirframeSpec.MOTORS; i++) {
    px[i] = d.motorX[i];
    pz[i] = d.motorZ[i];
    d.spin[i] = arms.spin[i];
    armLow = Math.min(armLow, arms.y[i]);
  }
  let spacing = 0.0;
  for (let i = 0; i < AirframeSpec.MOTORS; i++) {
    let nearest = Infinity;
    for (let k = 0; k < AirframeSpec.MOTORS; k++) {
      if (k !== i) {
        const dx = px[i] - px[k];
        const dz = pz[i] - pz[k];
        nearest = Math.min(nearest, Math.sqrt(dx * dx + dz * dz));
      }
    }
    spacing += nearest;
  }
  d.motorSpacing = spacing / AirframeSpec.MOTORS;
  throttleWeights(d, px, pz);

  const l = d.armLength;
  d.rotationalDamping = 0.5 * ModelConstants.RHO0 * d.dragCoefficient * d.areaY * l * l * l / 4.0;

  const tipRadius = d.propRadius + (d.ducted ? d.ductClearance : 0.0);
  const bottom = armLow - cy - ModelConstants.HULL_MARGIN;
  let half = 0.0;
  let front = 0.0;
  for (let i = 0; i < AirframeSpec.MOTORS; i++) {
    const r = Math.sqrt(px[i] * px[i] + pz[i] * pz[i]);
    const ux = r > 1e-9 ? px[i] / r : 0.0;
    const uz = r > 1e-9 ? pz[i] / r : 1.0;
    d.hullX[i] = px[i] + tipRadius * ux;
    d.hullY[i] = d.motorY[i];
    d.hullZ[i] = pz[i] + tipRadius * uz;
    d.hullX[4 + i] = px[i];
    d.hullY[4 + i] = bottom;
    d.hullZ[4 + i] = pz[i];
    half = Math.max(half, Math.max(Math.abs(px[i]), Math.abs(pz[i])) + tipRadius);
    front = Math.max(front, pz[i]);
  }
  const batteryFace = (body.batteryOnTop ? body.batteryY + body.bh / 2.0 : body.batteryY - body.bh / 2.0) - cy;
  d.hullX[8] = -cx;
  d.hullY[8] = batteryFace;
  d.hullZ[8] = body.bl / 2.0 - cz;
  d.hullX[9] = -cx;
  d.hullY[9] = batteryFace;
  d.hullZ[9] = -body.bl / 2.0 - cz;
  if (body.batteryOnTop && body.accessoryTop - cy > d.hullY[8]) {
    d.hullX[8] = body.accessoryTopX - cx;
    d.hullY[8] = body.accessoryTop - cy;
    d.hullZ[8] = body.accessoryTopZ - cz;
  }
  const camera = fd.camera && fd.camera.pos;
  if (camera) {
    d.hullX[10] = -camera[0] / 1000.0 - cx;
    d.hullY[10] = camera[1] / 1000.0 - cy;
    d.hullZ[10] = -camera[2] / 1000.0 - cz;
  } else {
    d.hullX[10] = -cx;
    d.hullY[10] = body.electronicsY - cy;
    d.hullZ[10] = 0.8 * front;
  }
  d.hullX[11] = -cx;
  d.hullY[11] = bottom;
  d.hullZ[11] = -cz;
  standOnAccessories(d, body, cx, cy, cz, bottom);
  groundPoints(d, -cx, batteryFace, body.bw, body.bl, -cz, d.ducted, bottom);
  let minY = Infinity;
  let maxY = -Infinity;
  for (let k = 0; k < AirframeSpec.HULL_POINTS; k++) {
    minY = Math.min(minY, d.hullY[k]);
    maxY = Math.max(maxY, d.hullY[k]);
  }
  d.hitboxWidth = 2.0 * half;
  d.hitboxHeight = maxY - minY;
  d.hitboxFootOffset = minY;
}

/** ParamDerivation.groundPoints */
function groundPoints(d, x, face, width, length, z, ducted, bottom) {
  let n = AirframeSpec.HULL_POINTS;
  d.groundX.set(d.hullX.subarray(0, n));
  d.groundY.set(d.hullY.subarray(0, n));
  d.groundZ.set(d.hullZ.subarray(0, n));
  let mask = (1 << n) - 1;
  mask &= ~(1 << 11);
  for (let k = 8; k <= 9; k++) {
    if (d.hullY[k] === face) {
      mask &= ~(1 << k);
    }
  }
  for (let c = 0; c < 4; c++) {
    d.groundX[n] = x + ((c & 1) === 0 ? -0.5 : 0.5) * width;
    d.groundY[n] = face;
    d.groundZ[n] = z + ((c & 2) === 0 ? -0.5 : 0.5) * length;
    mask |= 1 << n;
    n++;
  }
  if (ducted) {
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      d.groundX[n] = d.hullX[i];
      d.groundY[n] = Math.min(bottom, d.hullY[i]);
      d.groundZ[n] = d.hullZ[i];
      mask |= 1 << n;
      if (d.groundY[n] <= d.hullY[4 + i]) {
        mask &= ~(1 << (4 + i));
      }
      n++;
    }
  }
  if (d.standCount > 0) {
    for (; n < AirframeSpec.ACCESSORY_GROUND; n++) {
      const copy = n - AirframeSpec.HULL_POINTS;
      d.groundX[n] = d.hullX[copy];
      d.groundY[n] = d.hullY[copy];
      d.groundZ[n] = d.hullZ[copy];
    }
    let plane = Infinity;
    for (let k = 0; k < d.standCount; k++) {
      d.groundX[n] = d.standX[k];
      d.groundY[n] = d.standY[k];
      d.groundZ[n] = d.standZ[k];
      plane = Math.min(plane, d.standY[k]);
      mask |= 1 << n;
      n++;
    }
    for (let i = 0; i < AirframeSpec.STAND_LEGS; i++) {
      const corner = ducted ? AirframeSpec.HULL_POINTS + 4 + i : 4 + i;
      d.groundX[n] = ducted ? d.groundX[corner] : d.hullX[corner];
      d.groundY[n] = plane;
      d.groundZ[n] = ducted ? d.groundZ[corner] : d.hullZ[corner];
      mask |= 1 << n;
      n++;
    }
  }
  d.groundCount = n;
  d.groundMask = mask;
}

/** ParamDerivation.throttleWeights */
function throttleWeights(d, px, pz) {
  const a = [px, pz, Float64Array.of(d.spin[0], d.spin[1], d.spin[2], d.spin[3])];
  const residual = new Float64Array(3);
  const gram = [new Float64Array(3), new Float64Array(3), new Float64Array(3)];
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      residual[r] += a[r][i];
    }
    for (let c = 0; c < 3; c++) {
      for (let i = 0; i < AirframeSpec.MOTORS; i++) {
        gram[r][c] += a[r][i] * a[c][i];
      }
    }
  }
  const lambda = SimMath.solve3(gram, residual);
  if (lambda == null) {
    return;
  }
  const thrust = new Float64Array(AirframeSpec.MOTORS);
  let max = 0.0;
  for (let i = 0; i < AirframeSpec.MOTORS; i++) {
    let correction = 0.0;
    for (let r = 0; r < 3; r++) {
      correction += a[r][i] * lambda[r];
    }
    thrust[i] = 1.0 - correction;
    max = Math.max(max, thrust[i]);
  }
  if (!(max > 0.0) || !Number.isFinite(max)) {
    return;
  }
  let uniform = true;
  for (let i = 0; i < AirframeSpec.MOTORS; i++) {
    const w = Math.sqrt(Math.max(MIN_THROTTLE_WEIGHT * MIN_THROTTLE_WEIGHT, thrust[i] / max));
    d.mixThrottle[i] = Math.min(1.0, w);
    uniform &&= Math.abs(d.mixThrottle[i] - 1.0) < 1e-9;
  }
  if (uniform) {
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      d.mixThrottle[i] = 1.0;
    }
  }
  d.uniformThrottle = uniform;
}
