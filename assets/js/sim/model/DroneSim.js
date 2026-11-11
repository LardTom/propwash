// Port of de.lardtom.propwash.sim.DroneSim (Propwash FPV 0.6.0): the 2 kHz flight model that steps rigid body, motors,
// ESCs, battery, rotor aerodynamics, flight controller and ground contact, and reacts to the moves the world allows
// (afterMove). Same field and method names as the Java; the conventions are at the top of AirframeSpec.js (fields
// that share their name with an accessor are stored as _name: _stickySides, _ghost, _pushOuts). StrictMath is the
// fdlibm port of StrictMath.js. tools/test-sim-model.mjs flies it against the classes of the release, bit for bit.
//
// With 0.6.0: crashes without disarm (props touching ground or walls lose thrust, the flight controller holds still
// and gives up authority when the drone lies or was knocked over at idle), the support grid under the drone
// (GroundSupport: ground and hull points over lower or higher ground, tipping over edges, accessory stands), surfaces
// (bouncy, cushion and sticky blocks, damage scale), pass-through moves (ghost), depenetration (pushOut), arming again
// after a reset (homeReset, autoArm), the ESC heat of the board size with its power limit and the motor torque loss
// when hot.
//
// Left out on purpose (not needed in the browser simulator, the code paths stay switched off as in a plain flight):
// GPS/altitude hold (NavHold, with its compass error and the settled hold of a takeover, settleForTakeover), flight
// assists, operator and add-on axes and force providers (API), external pushes/impulses, cobweb snag, breaking through
// blocks, water/waterproof drones, turtle mode (and its floor and lifting onto the hull), 3D mode (reversible motors),
// part wear (pristine), the FC sample listener and snapshot sync (only the rollback used by the fault handler is kept).

import { AirframeSpec } from './AirframeSpec.js?v=d12a0862';
import { FlightControllerConfig } from './FlightControllerConfig.js?v=aa2f34ca';
import { SimTuning } from './SimTuning.js?v=30961ab0';
import { RigidBody } from './RigidBody.js?v=4c63c124';
import { PowerSystem } from './PowerSystem.js?v=047f5bd2';
import { FlightController } from './FlightController.js?v=e066025f';
import { GyroModel } from './GyroModel.js?v=03b65824';
import { PropWash } from './PropWash.js?v=65b3153b';
import { WakeField } from './WakeField.js?v=0669fab4';
import { Gusts } from './Gusts.js?v=b0ab9beb';
import { Thermal } from './Thermal.js?v=4b9beec5';
import { BodyAero } from './BodyAero.js?v=0daf7225';
import { CollisionSolver } from './CollisionSolver.js?v=f8f98c10';
import { GroundSolver } from './GroundSolver.js?v=d2c6f4fb';
import { Arming } from './Arming.js?v=3b6dd6c4';
import { SimRandom } from './SimRandom.js?v=99061467';
import { Telemetry } from './Telemetry.js?v=79ff5f8e';
import { EventQueue } from './EventQueue.js?v=be78f801';
import { ImpactLog } from './ImpactLog.js?v=355ebf1a';
import { PilotInput } from './PilotInput.js?v=d7d531ac';
import { SimEnvironment } from './SimEnvironment.js?v=7adb2a2f';
import { OperatingPoints } from './OperatingPoints.js?v=047f5bd2';
import { Pt1 } from './Pt1.js?v=afe0b0dc';
import { BatteryAlarm } from './BatteryAlarm.js?v=e883ec27';
import { ModelConstants } from './ModelConstants.js?v=760466ce';
import { SimMath } from './SimMath.js?v=44da8aea';
import { RotorAero } from './RotorAero.js?v=22dc31b6';
import { GroundEffect } from './GroundEffect.js?v=e1f30152';
import { EnergyModel } from './EnergyModel.js?v=047f5bd2';
import { CellCurve } from './CellCurve.js?v=0c22cd1a';
import { ThrottleCurve } from './ThrottleCurve.js?v=6243615e';
import { RcProcessor } from './RcProcessor.js?v=6af61b2c';
import { PidAutoTune } from './PidAutoTune.js?v=abfbecf6';
import { StabMode } from './StabMode.js?v=ef37a80a';
import { PidSource } from './PidSource.js?v=bf62fdc1';
import { DisarmReason } from './DisarmReason.js?v=b5a5924f';
import { Fluid } from './Fluid.js?v=3fdbbd97';
import { BatteryState } from './BatteryState.js?v=de4ddff2';
import { HoldMode } from './HoldMode.js?v=b25be63f';
import { SimEventType } from './SimEventType.js?v=7000a262';
import { ArmBlocker } from './ArmBlocker.js?v=3bfdfa7f';
import { GroundSupport } from './GroundSupport.js?v=69373285';
import { SurfaceResponse } from './SurfaceResponse.js?v=bc7fb0a6';
import { MoveReport } from './MoveReport.js?v=b44086c1';
import { StrictMath } from './StrictMath.js?v=e765e983';

const javaRound = (x) => (Number.isNaN(x) ? 0 : Math.floor(x + 0.5));

/** The physical state the fault handler rolls back to (SimSnapshot, physical part only). */
class Rollback {
  constructor() {
    this.rotorOmega = new Float64Array(AirframeSpec.MOTORS);
    this.motorTempC = new Float64Array(AirframeSpec.MOTORS);
    this.escTempC = new Float64Array(AirframeSpec.MOTORS);
  }
}

export class DroneSim {
  static PHYSICS_HZ = 2000;
  static SUBSTEP_NANOS = 500000;
  static MAX_SUBSTEPS = 100;
  static MAX_FRAME_DT = 0.05;
  static H = 1.0 / DroneSim.PHYSICS_HZ;
  static MAX_FRAME_NANOS = 50000000;
  static MAX_DT_NANOS = 200000000;
  static SLOW_DIVIDER = 8;
  static HOVER_ESTIMATE_DIVIDER = 200;
  static SLOW_DT = DroneSim.SLOW_DIVIDER * DroneSim.H;
  static BROWNOUT_SUBSTEPS = 10;
  static BROWNOUT_RELEASE = 1.05;
  static SLEEP_SUBSTEPS = 1000;
  static WARN_SLOW_STEPS = 500;
  static ESC_EVENT_SUBSTEPS = 1000;
  static SLEEP_SPEED = 0.05;
  static SLEEP_RATE = 0.1;
  static PLANE_RANGE = 1.0;
  static BOX_TOLERANCE = 1.0e-6;
  static RESTING_TOLERANCE = 0.002;
  static WAKE_THRESHOLD = 0.02;
  static SUPPORT_TOLERANCE = 0.002;
  static MAX_FAULTS_PER_SECOND = 3;
  static CONTACT_MEMORY_FRAMES = 2;
  static OBLIQUE_SAME_CONTACT = 0.95;
  static OBLIQUE_GROUND = 0.7;
  static IMPACT_RECORD_SPEED = 1.0;
  static STICKY_DRAG = 18.0;
  static STICKY_STEP = (1.0 - StrictMath.exp(-DroneSim.STICKY_DRAG * DroneSim.H)) / DroneSim.H;
  static STICKY_HOLD = 4.0;
  static STICKY_SECONDS = 1.0;
  static EDGE_SLIDE = 0.25;
  static PROP_CONTACT_THRUST = 0.1;
  static PROP_CONTACT_ON_S = 0.01;
  static PROP_CONTACT_OFF_S = 0.1;
  static PROP_CONTACT_ON = 1.0 - StrictMath.exp(-DroneSim.H / DroneSim.PROP_CONTACT_ON_S);
  static PROP_CONTACT_OFF = 1.0 - StrictMath.exp(-DroneSim.H / DroneSim.PROP_CONTACT_OFF_S);
  static PROP_CONTACT_MIN = 1.0E-3;
  static PROP_CONTACT_GAP = 0.003;

  /**
   * @param {AirframeSpec} params
   * @param {FlightControllerConfig} config
   * @param {SimTuning} tuning
   * @param {number} seed
   */
  constructor(params, config, tuning, seed) {
    const M = AirframeSpec.MOTORS;
    this.body = new RigidBody();
    this.power = new PowerSystem();
    this.fc = new FlightController();
    this.gyroModel = new GyroModel();
    this.wash = new PropWash();
    this.wake = new WakeField();
    this.gusts = new Gusts();
    this.thermal = new Thermal();
    this.bodyAero = new BodyAero();
    this.collision = new CollisionSolver();
    this.ground = new GroundSolver();
    this.arming = new Arming();
    this.support = new GroundSupport();
    this.rng = new SimRandom(seed);
    this.telemetry = new Telemetry();
    this.events = new EventQueue();
    this.impacts = new ImpactLog();
    this.rollback = new Rollback();
    this.input = new PilotInput();
    this.env = new SimEnvironment();
    this.hoverPoint = new OperatingPoints.Point();

    this.dutyCur = new Float64Array(M);
    this.dutyNext = new Float64Array(M);
    this.lambda = new Float64Array(M);
    this.axial = new Float64Array(M);
    this.crossX = new Float64Array(M);
    this.crossZ = new Float64Array(M);
    this.cross = new Float64Array(M);
    this.thrust = new Float64Array(M);
    this.prevThrust = new Float64Array(M);
    this.groundFactor = new Float64Array(M);
    this.escEventCooldown = new Float64Array(M);
    this.wearThrust = Float64Array.of(1.0, 1.0, 1.0, 1.0);
    this.motorDead = new Array(M).fill(false);
    this.propContact = new Float64Array(M);
    this.groundProps = 0;
    this.wallProps = 0;
    this.fluidThrust = Float64Array.of(1.0, 1.0, 1.0, 1.0);
    this.hardwareFault = false;
    this.escBurned = false;
    this.wearVibration = 0.0;
    this.wearGyroNoise = 0.0;

    this.fromRoll = 0.0;
    this.fromPitch = 0.0;
    this.fromYaw = 0.0;
    this.fromThrottle = 0.0;
    this.appliedRoll = 0.0;
    this.appliedPitch = 0.0;
    this.appliedYaw = 0.0;
    this.appliedThrottle = 0.0;
    this.rampInitialized = false;

    this.accumulatorNanos = 0;
    this.substepCount = 0;
    this.fcTick = 0;
    this.time = 0.0;
    this.frameStartY = 0.0;
    this.visX = 0.0;
    this.visY = 0.0;
    this.visZ = 0.0;

    this.sleeping = false;
    this.sleepCounter = 0;
    this.groundedFrames = 0;
    this.contactFrames = new Int32Array(3);
    this.contactSign = new Float64Array(3);
    this.obliqueFrames = 0;
    this.obliqueX = 0.0;
    this.obliqueY = 0.0;
    this.obliqueZ = 0.0;
    this.frameStartVx = 0.0;
    this.frameStartVy = 0.0;
    this.frameStartVz = 0.0;
    this.groundHeight = 0.0;
    this.groundGrip = 1.0;
    this.groundBounce = -1.0;
    this.groundImpact = 1.0;
    this._stickySides = 0;
    this.stickyPull = 0.0;
    this.contactScale = 1.0;
    this.normalForce = 0.0;
    this.planeValid = false;
    this.planeY = 0.0;
    this.rayFloor = -Infinity;
    this.edgeActive = false;
    this.edgeAx = 0.0;
    this.edgeAz = 0.0;
    this.edgeTx = 0.0;
    this.edgeTz = 0.0;
    this._ghost = false;
    this.frameTouch = false;
    this.frameApproach = 0.0;
    this.frameTangential = 0.0;
    this.frameImpulse = 0.0;
    this.frameContacts = 0;
    this.frameStruck = 0;
    this.frameStruckRpm = new Float64Array(M);

    this.brownoutCounter = 0;
    this.brownoutLatched = false;
    this.lowAlarm = new BatteryAlarm();
    this.criticalAlarm = new BatteryAlarm();
    this.emptyFired = false;
    this.batteryState = BatteryState.OK;
    this.cellFilter = new Pt1();
    this.gLoadFilter = new Pt1();
    this.washFilter = new Pt1();
    this.gLoadMax = 0.0;
    this.specificX = 0.0;
    this.specificY = 0.0;
    this.specificZ = 0.0;
    this.totalThrust = 0.0;
    this.maxGroundFactor = 1.0;
    this.wakeWeight = 0.0;
    this.spinSign = 1.0;
    this.hoverStick = 0.0;
    this.windX = 0.0;
    this.windY = 0.0;
    this.windZ = 0.0;
    this.faults = 0;
    this.crashCount = 0;
    this.impactCount = 0;
    this.propStrikeCount = 0;
    this._pushOuts = 0;
    this.lastImpactSpeed = 0.0;
    this.faultWindowStart = -Infinity;
    this.faultsInWindow = 0;
    this.poseLocked = false;
    this.frameAborted = false;
    this.activeFilters = null;
    this.filtersPending = false;
    this.videoPowerDeltaW = 0.0;

    this.tuning = tuning == null ? new SimTuning() : tuning.copy();
    this.tuning.sanitize();
    this.gravity = this.tuning.gravity();
    this.applyParams(params);
    this.power.setStateOfCharge(1.0);
    this.applyConfig(config);
    this.reset(0.0, 0.0, 0.0, 0.0);
  }

  applyParams(p) {
    const H = DroneSim.H;
    this.params = p;
    this.body.configure(p.massKg, p.inertiaXx, p.inertiaYy, p.inertiaZz);
    this.power.configure(p, H);
    this.wash.configure(p, H);
    this.gusts.configure(DroneSim.SLOW_DT);
    this.wake.configure(DroneSim.SLOW_DT);
    this.gyroModel.configure(H);
    this.cellFilter.configure(1.0, DroneSim.SLOW_DT);
    this.gLoadFilter.configure(20.0, H);
    this.washFilter.configure(10.0, H);
  }

  applyConfig(source) {
    const c = source == null ? new FlightControllerConfig() : source.copy();
    c.sanitize();
    if (c.pid.source === PidSource.DERIVED && !PidAutoTune.isCurrent(this.params, c.filters, c.pid)) {
      c.pid = PidAutoTune.derive(this.params, c.filters, c.pid);
    }
    this.config = c;
    this.spinSign = c.pid.propsOut ? -1.0 : 1.0;
    if (this.activeFilters == null || !this.arming.armed) {
      this.activeFilters = c.filters.copy();
      this.filtersPending = false;
      this.fc.configure(this.params, c, this.activeFilters);
    } else {
      this.filtersPending = !c.filters.sameAs(this.activeFilters);
      let live = c;
      if (this.filtersPending && c.pid.source === PidSource.DERIVED) {
        live = c.copy();
        live.pid = PidAutoTune.derive(this.params, this.activeFilters, c.pid);
      }
      this.fc.updateProfiles(live);
    }
  }

  setConfig(config) {
    this.applyConfig(config);
    this.updateHoverEstimate();
  }

  reset(x, y, z, headingRad) {
    const b = this.body;
    b.px = SimMath.finiteOr(x, 0.0);
    b.py = SimMath.finiteOr(y, 0.0);
    b.pz = SimMath.finiteOr(z, 0.0);
    b.vx = 0.0;
    b.vy = 0.0;
    b.vz = 0.0;
    b.lx = 0.0;
    b.ly = 0.0;
    b.lz = 0.0;
    b.setUpright(SimMath.finiteOr(headingRad, 0.0));
    this.power.stopRotors();
    this.arming.reset();
    this.clearDuties();
    this.clearTransientState();
    this.thermal.reset(this.env.ambientTempC);
    this.power.torqueScale.set(this.thermal.torque);
    this.fc.reset(this.gyroModel.raw, this.power.busVoltage, 0.0, 0.0, 0.0, 0.0);
    this.accumulatorNanos = 0;
    this.rampInitialized = false;
    this.appliedRoll = 0.0;
    this.appliedPitch = 0.0;
    this.appliedYaw = 0.0;
    this.appliedThrottle = 0.0;
    this.visX = b.px;
    this.visY = b.py;
    this.visZ = b.pz;
    this.frameStartY = b.py;
    this.groundedFrames = 0;
    this.clearContacts();
    this.sleeping = false;
    this.sleepCounter = 0;
    this.brownoutCounter = 0;
    this.brownoutLatched = false;
    this.arming.crashCooldownSubsteps = 0;
    this.arming.rebootSubsteps = 0;
    for (let i = 0; i < AirframeSpec.MOTORS; i++) this.escEventCooldown[i] = 0;
    this.gLoadMax = 0.0;
    this.updateHoverEstimate();
    this.fillTelemetry(0);
  }

  clearTransientState() {
    this.wash.reset();
    this.wake.reset();
    this.gusts.reset();
    this.gyroModel.reset();
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      this.prevThrust[i] = 0.0;
      this.thrust[i] = 0.0;
      this.groundFactor[i] = 1.0;
    }
    this.gLoadFilter.reset(0.0);
    this.washFilter.reset(0.0);
    this.wakeWeight = 0.0;
    this.totalThrust = 0.0;
    this.maxGroundFactor = 1.0;
    this.specificX = 0.0;
    this.specificY = 0.0;
    this.specificZ = 0.0;
    this.normalForce = 0.0;
    this.windX = 0.0;
    this.windY = 0.0;
    this.windZ = 0.0;
  }

  clearContacts() {
    for (let a = 0; a < 3; a++) {
      this.contactFrames[a] = 0;
      this.contactSign[a] = 0.0;
    }
    this.obliqueFrames = 0;
    this.planeValid = false;
    this.ground.forget();
    this.edgeActive = false;
    this._stickySides = 0;
    this.stickyPull = 0.0;
    this.groundProps = 0;
    this.wallProps = 0;
    for (let i = 0; i < AirframeSpec.MOTORS; i++) this.propContact[i] = 0.0;
    this.clearFrameContacts();
  }

  clearFrameContacts() {
    this.frameTouch = false;
    this.frameApproach = 0.0;
    this.frameTangential = 0.0;
    this.frameImpulse = 0.0;
    this.frameContacts = 0;
    this.frameStruck = 0;
    for (let i = 0; i < AirframeSpec.MOTORS; i++) this.frameStruckRpm[i] = 0.0;
  }

  choosePlane() {
    let plane = this.groundedFrames > 0 ? this.groundHeight : -Infinity;
    const distance = this.env.solidDistance;
    this.rayFloor = -Infinity;
    if (distance < Infinity) {
      this.rayFloor = this.visY - distance;
      plane = Math.max(plane, this.rayFloor);
    }
    this.planeY = plane;
    this.planeValid = !this._ghost && plane > -Infinity && this.body.py - plane < DroneSim.PLANE_RANGE;
    if (!this.planeValid) this.ground.forget();
  }

  noteContact(p, t, b, gs) {
    this.frameTouch = true;
    this.frameImpulse = Math.max(this.frameImpulse, gs.normalImpulse);
    if (gs.newContacts === 0) return;
    if (gs.approachSpeed >= this.frameApproach) {
      this.frameApproach = gs.approachSpeed;
      this.frameTangential = gs.tangentialSpeed;
    }
    this.frameContacts |= gs.touchMask;
    if (p.ducted || !t.propStrikes || b.r11 >= CollisionSolver.STRIKE_NORMAL_LIMIT) return;
    let struck = false;
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      const w = this.power.omega[i];
      if ((gs.newContacts & (1 << i)) !== 0 && Math.abs(w) > CollisionSolver.STRIKE_OMEGA_FRACTION * p.hoverOmega) {
        this.frameStruck |= 1 << i;
        this.frameStruckRpm[i] = Math.max(this.frameStruckRpm[i], Math.abs(w) * 60.0 / SimMath.TWO_PI);
        this.power.omega[i] = CollisionSolver.STRIKE_REMAINING * w;
        const dl = -this.spinSign * p.spin(i) * p.rotorInertiaEff * CollisionSolver.STRIKE_YAW_TRANSFER * w;
        b.lx += dl * b.r01;
        b.ly += dl * b.r11;
        b.lz += dl * b.r21;
        struck = true;
      }
    }
    if (struck) b.updateRates();
  }

  groundImpulse(p, b, plane, grip, restitution, impactScale) {
    const gs = this.ground;
    const t = this.tuning;
    const bounce = (restitution >= 0.0 ? restitution : p.restitution) * t.restitutionScale;
    const soft = (restitution >= 0.0 ? restitution : Math.min(p.restitution, ModelConstants.RESTITUTION_BATTERY)) * t.restitutionScale;
    b.updateDerived();
    const crashSpeed = DroneSim.lossSpeed(p.impactTolerance * t.crashSpeedScale, impactScale);
    const planes = this.support.groundPlanes(p, b, plane, this.support.overhang(b, plane));
    if (!gs.solve(p, b, plane, planes, DroneSim.H, p.friction * grip, bounce, soft, crashSpeed, false, b.vx, b.vy, b.vz, b.lx, b.ly, b.lz)) {
      return false;
    }
    b.vx = gs.vx;
    b.vy = gs.vy;
    b.vz = gs.vz;
    b.lx = gs.lx;
    b.ly = gs.ly;
    b.lz = gs.lz;
    b.updateRates();
    this.noteContact(p, t, b, gs);
    return true;
  }

  static hullMask(groundMask) {
    const n = AirframeSpec.HULL_POINTS;
    let mask = groundMask & ((1 << n) - 1);
    for (let c = 0; c < 4; c++) {
      if ((groundMask & (1 << (n + c))) !== 0) mask |= (c & 2) === 0 ? 1 << 9 : 1 << 8;
      if ((groundMask & (1 << (n + 4 + c))) !== 0) mask |= 1 << (4 + c);
    }
    return mask;
  }

  setBatteryCharge(chargeFraction) {
    this.power.setStateOfCharge(chargeFraction);
    this.brownoutCounter = 0;
    this.brownoutLatched = false;
    this.clearBatteryAlarms();
    this.power.extraPower = this.extraPower(this.params);
    this.power.fullLoad = EnergyModel.fullLoad(this.params, this.power.omega, this.arming.armed);
    this.cellFilter.reset(this.power.packVoltage(this.tuning.batterySag) / this.params.cells);
    this.updateHoverEstimate();
    this.fillTelemetry(0);
  }

  extraPower(p) {
    const extra = EnergyModel.extraPower(p, this.power.omega, this.arming.armed);
    return this.videoPowerDeltaW === 0.0 ? extra : extra + this.videoPowerDeltaW;
  }

  setTuning(tuning) {
    const t = tuning == null ? new SimTuning() : tuning.copy();
    t.sanitize();
    this.tuning = t;
    const g = t.gravity();
    if (g !== this.gravity) {
      this.gravity = g;
      this.updateHoverEstimate();
    }
  }

  stickySides() {
    return this._stickySides;
  }

  stickyHold() {
    return (this._stickySides & MoveReport.STICKY_FLOOR) !== 0 && this.groundedFrames > 0
      ? DroneSim.STICKY_HOLD * (1.0 - this.stickyPull / DroneSim.STICKY_SECONDS) : 0.0;
  }

  buildable() {
    return this.tuning.partCompatibility ? this.params.buildable : this.params.assemblable;
  }

  /**
   * Advances the simulation by a frame (DroneSim.step(double, …)).
   * @param {number} frameDtSeconds
   * @param {PilotInput} input
   * @param {SimEnvironment} env
   * @param {StepResult} out
   */
  step(frameDtSeconds, input, env, out) {
    this.events.clear();
    this.impacts.clear();
    const dt = Number.isFinite(frameDtSeconds) && frameDtSeconds >= 0.0 ? frameDtSeconds : 0.0;
    const nanos = javaRound(Math.min(dt, DroneSim.MAX_DT_NANOS * 1e-9) * 1e9);
    this.advance(nanos, dt, input, env, out);
  }

  advance(frameNanos, originalDt, inp, environment, out) {
    let nanos = frameNanos;
    if (nanos > DroneSim.MAX_FRAME_NANOS) {
      this.emit(SimEventType.FRAME_HITCH, originalDt, -1);
      nanos = DroneSim.MAX_FRAME_NANOS;
    }
    this.sanitizeInput(inp);
    this.sanitizeEnvironment(environment);
    this.support.load(this.env);
    this.accumulatorNanos += nanos;
    let n = Math.trunc(this.accumulatorNanos / DroneSim.SUBSTEP_NANOS);
    if (n > DroneSim.MAX_SUBSTEPS) {
      n = DroneSim.MAX_SUBSTEPS;
      this.accumulatorNanos = 0;
    } else {
      this.accumulatorNanos -= n * DroneSim.SUBSTEP_NANOS;
    }
    const substeps = n;
    this.copyRollback();
    const pi = this.input;
    if (!this.rampInitialized) {
      this.appliedRoll = pi.roll;
      this.appliedPitch = pi.pitch;
      this.appliedYaw = pi.yaw;
      this.appliedThrottle = pi.throttle;
      this.rampInitialized = true;
    }
    this.fromRoll = this.appliedRoll;
    this.fromPitch = this.appliedPitch;
    this.fromYaw = this.appliedYaw;
    this.fromThrottle = this.appliedThrottle;
    this.frameArming();
    this.clearFrameContacts();
    this.choosePlane();
    this.frameStartY = this.body.py;
    this.frameStartVx = this.body.vx;
    this.frameStartVy = this.body.vy;
    this.frameStartVz = this.body.vz;
    this.frameAborted = false;
    for (let k = 0; k < substeps; k++) {
      this.substep(k, substeps);
      if (this.frameAborted) break;
    }
    this.finishFrame(substeps, out);
  }

  sanitizeInput(inp) {
    const d = this.input;
    if (inp == null) {
      d.roll = 0.0;
      d.pitch = 0.0;
      d.yaw = 0.0;
      d.throttle = 0.0;
      d.mode = StabMode.ACRO;
      d.armSwitch = false;
      d.linkOk = true;
      d.altHold = false;
      d.posHold = false;
      d.mode3d = false;
      d.turtle = false;
      d.actions = 0;
      return;
    }
    d.roll = SimMath.clamp(SimMath.finiteOr(inp.roll, 0.0), -1.0, 1.0);
    d.pitch = SimMath.clamp(SimMath.finiteOr(inp.pitch, 0.0), -1.0, 1.0);
    d.yaw = SimMath.clamp(SimMath.finiteOr(inp.yaw, 0.0), -1.0, 1.0);
    d.throttle = SimMath.clamp01(SimMath.finiteOr(inp.throttle, 0.0));
    d.mode = inp.mode == null ? StabMode.ACRO : inp.mode;
    d.armSwitch = !!inp.armSwitch;
    d.linkOk = inp.linkOk !== false;
    // Not supported in the browser simulator: holds, 3D, turtle.
    d.altHold = false;
    d.posHold = false;
    d.mode3d = false;
    d.turtle = false;
    d.actions = (inp.actions | 0) & 0xF;
  }

  sanitizeEnvironment(e) {
    const d = this.env;
    if (e == null) {
      d.groundDistance = Infinity;
      d.solidDistance = Infinity;
      d.windX = 0.0;
      d.windY = 0.0;
      d.windZ = 0.0;
      d.gustIntensity = 0.0;
      d.airDensity = ModelConstants.RHO0;
      d.ambientTempC = 20.0;
      d.fluid = Fluid.NONE;
      d.skyView = 1.0;
      d.waterSurface = -Infinity;
      d.clearSupport();
      return;
    }
    d.groundDistance = Number.isNaN(e.groundDistance) ? Infinity : Math.max(0.0, e.groundDistance);
    d.solidDistance = Number.isNaN(e.solidDistance) ? d.groundDistance : Math.max(0.0, e.solidDistance);
    d.windX = SimMath.clamp(SimMath.finiteOr(e.windX, 0.0), -100.0, 100.0);
    d.windY = SimMath.clamp(SimMath.finiteOr(e.windY, 0.0), -100.0, 100.0);
    d.windZ = SimMath.clamp(SimMath.finiteOr(e.windZ, 0.0), -100.0, 100.0);
    d.gustIntensity = SimMath.sanitize(e.gustIntensity, 0.0, 1.0, 0.0);
    d.airDensity = SimMath.sanitize(e.airDensity, 0.3, 1.5, ModelConstants.RHO0);
    d.ambientTempC = SimMath.sanitize(e.ambientTempC, -40.0, 60.0, 20.0);
    d.fluid = Fluid.NONE;
    d.skyView = SimMath.sanitize(e.skyView, 0.0, 1.0, 1.0);
    d.waterSurface = -Infinity;
    GroundSupport.sanitize(e, d);
  }

  frameArming() {
    const a = this.arming;
    const inp = this.input;
    const switchOn = inp.armSwitch;
    let conditions = Arming.conditions(inp, this.config, this.body.tiltRad() * SimMath.DEG, this.power.soc, this.buildable(),
      a.crashCooldownSubsteps > 0, a.rebootSubsteps > 0, Fluid.NONE, this.hardwareFault || this.escBurned);
    if (a.pendingSwitchCheck) {
      a.pendingSwitchCheck = false;
      if (switchOn && !a.armed && !a.autoArm) {
        a.switchNeedsReset = true;
        this.emit(SimEventType.ARM_BLOCKED, conditions | ArmBlocker.ARM_SWITCH_NOT_RESET.bit(), -1);
      }
      a.lastSwitch = switchOn;
    }
    if (!switchOn) a.switchNeedsReset = false;
    if (!switchOn || a.armed) a.autoArm = false;
    const rising = switchOn && !a.lastSwitch;
    const auto = !rising && a.autoArm && !a.armed && (conditions & Arming.AUTO_ARM_WAIT) === 0;
    if (a.armed) {
      if (!switchOn) this.disarm(DisarmReason.SWITCH);
    } else if (rising || auto) {
      a.autoArm = false;
      let mask = conditions | (a.switchNeedsReset ? ArmBlocker.ARM_SWITCH_NOT_RESET.bit() : 0);
      if (mask === 0 && this.tuning.escOvervoltage && this.params.escOvervoltage) {
        this.escBurned = true;
        this.emit(SimEventType.ESC_BURNED, this.params.cells, -1);
        conditions |= ArmBlocker.HARDWARE_FAULT.bit();
        mask = conditions;
      }
      if (mask === 0) {
        a.turtle = false;
        this.arm();
        a.autoArmed = auto;
      } else {
        this.emit(SimEventType.ARM_BLOCKED, mask, -1);
        a.switchNeedsReset = true;
      }
    }
    a.lastSwitch = switchOn;
    a.blockers = conditions | (a.switchNeedsReset && switchOn && !a.armed ? ArmBlocker.ARM_SWITCH_NOT_RESET.bit() : 0);
  }

  arm() {
    this.arming.armed = true;
    this.arming.failsafeStage = 0;
    this.arming.landingSubsteps = 0;
    this.gyroModel.measure(this.body.wbx, this.body.wby, this.body.wbz);
    this.fc.reset(this.gyroModel.raw, this.power.busVoltage, this.appliedRoll, this.appliedPitch, this.appliedYaw,
      this.appliedThrottle);
    this.gLoadMax = 0.0;
    this.arming.turtleDone = false;
    this.wakeUp();
    this.emit(SimEventType.ARMED, 0.0, -1);
  }

  disarm(reason) {
    const a = this.arming;
    if (!a.armed) return;
    a.armed = false;
    a.autoArmed = false;
    a.turtle = false;
    a.turtleDone = false;
    a.lastDisarmReason = reason;
    a.failsafeStage = reason === DisarmReason.FAILSAFE ? 2 : 0;
    a.landingSubsteps = 0;
    if (reason !== DisarmReason.SWITCH && this.input.armSwitch) a.switchNeedsReset = true;
    if (reason === DisarmReason.CRASH) a.crashCooldownSubsteps = javaRound(Arming.CRASH_COOLDOWN_S * DroneSim.PHYSICS_HZ);
    this.clearDuties();
    if (this.filtersPending) {
      this.filtersPending = false;
      this.activeFilters = this.config.filters.copy();
      this.fc.configure(this.params, this.config, this.activeFilters);
    }
    this.fc.reset(this.gyroModel.raw, this.power.busVoltage, this.appliedRoll, this.appliedPitch, this.appliedYaw,
      this.appliedThrottle);
    this.emit(SimEventType.DISARMED, reason.ordinal, -1);
  }

  clearDuties() {
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      this.dutyCur[i] = 0.0;
      this.dutyNext[i] = 0.0;
    }
  }

  forceDisarm(reason) {
    this.disarm(reason == null || reason === DisarmReason.NONE ? DisarmReason.FORCED : reason);
  }

  requireArmSwitchReset() {
    if (!this.arming.armed) {
      this.arming.pendingSwitchCheck = true;
      this.arming.autoArm = false;
    }
  }

  homeReset(autoArm) {
    this.disarm(DisarmReason.FORCED);
    this.requireArmSwitchReset();
    if (autoArm) {
      this.arming.switchNeedsReset = false;
      this.arming.autoArm = true;
    }
  }

  cancelAutoArm() {
    this.arming.autoArm = false;
  }

  autoArmPending() {
    return this.arming.autoArm && !this.arming.armed;
  }

  autoArmed() {
    return this.arming.armed && this.arming.autoArmed;
  }

  wakeUp() {
    this.sleeping = false;
    this.sleepCounter = 0;
  }

  emit(type, value, motor) {
    this.events.add(type, this.time, value, motor);
  }

  substep(k, n) {
    const b = this.body;
    const p = this.params;
    const t = this.tuning;
    const a = this.arming;
    const h = DroneSim.H;
    const frac = (k + 1) / n;
    const inp = this.input;
    this.appliedRoll = this.fromRoll + (inp.roll - this.fromRoll) * frac;
    this.appliedPitch = this.fromPitch + (inp.pitch - this.fromPitch) * frac;
    this.appliedYaw = this.fromYaw + (inp.yaw - this.fromYaw) * frac;
    this.appliedThrottle = this.fromThrottle + (inp.throttle - this.fromThrottle) * frac;

    if (a.crashCooldownSubsteps > 0) a.crashCooldownSubsteps--;
    if (a.rebootSubsteps > 0) a.rebootSubsteps--;
    this.failsafeTick();

    const washOn = t.propWash && t.propWashScale > 0.0;
    const washNoise = p.washNoise * t.turbulenceScale;
    if (washOn && washNoise > 0.0) this.wash.advanceNoise(this.rng);
    this.gyroModel.sample(this.rng, b.wbx, b.wby, b.wbz, t.gyroNoiseDps + this.wearGyroNoise,
      t.gyroVibrationDps, this.power.omega, p.hoverOmega, this.washFilter.value(), this.fc.divider);

    if (this.fcTick++ % this.fc.divider === 0) {
      let r = this.appliedRoll;
      let pt = this.appliedPitch;
      let y = this.appliedYaw;
      let thr = this.appliedThrottle;
      let mode = inp.mode;
      if (a.failsafeStage === 1) {
        r = 0.0;
        pt = 0.0;
        y = 0.0;
        thr = Math.max(0.0, this.hoverStick - 0.05);
        mode = StabMode.ANGLE;
      }
      const fcArmed = a.armed;
      this.fc.contact = this.touchingBlocks();
      this.fc.update(r, pt, y, thr, mode, fcArmed, b, this.gyroModel.raw, this.power.busVoltage);
      if (this.fc.airmodeJustLatched) this.emit(SimEventType.AIRMODE_ACTIVE, 0.0, -1);
      for (let i = 0; i < AirframeSpec.MOTORS; i++) {
        const duty = a.armed && !this.motorDead[i] ? this.fc.duty[i] : 0.0;
        const limit = this.thermal.limit[i];
        if (duty < 0.0) this.dutyNext[i] = limit < 1.0 ? Math.max(duty, -limit) : duty;
        else this.dutyNext[i] = limit < 1.0 ? Math.min(duty, limit) : duty;
      }
    }
    this.power.reversible = false;

    const rho = this.env.airDensity;
    const rhoRatio = rho / ModelConstants.RHO0;
    this.windX = t.windScale * this.env.windX + this.gusts.x;
    this.windY = t.windScale * this.env.windY + this.gusts.y;
    this.windZ = t.windScale * this.env.windZ + this.gusts.z;
    const ax = b.vx - this.windX;
    const ay = b.vy - this.windY;
    const az = b.vz - this.windZ;
    const ubx = b.r00 * ax + b.r10 * ay + b.r20 * az;
    const uby = b.r01 * ax + b.r11 * ay + b.r21 * az;
    const ubz = b.r02 * ax + b.r12 * ay + b.r22 * az;
    const wbx = b.wbx;
    const wby = b.wby;
    const wbz = b.wbz;
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      const rx = p.motorX(i);
      const ry = p.motorY(i);
      const rz = p.motorZ(i);
      const uix = ubx + (wby * rz - wbz * ry);
      const uiy = uby + (wbz * rx - wbx * rz);
      const uiz = ubz + (wbx * ry - wby * rx);
      this.axial[i] = uiy;
      this.crossX[i] = uix;
      this.crossZ[i] = uiz;
      this.cross[i] = Math.sqrt(uix * uix + uiz * uiz);
      this.lambda[i] = RotorAero.inflowRatio(uiy, p.zeroThrustPerOmega, this.power.omega[i]);
    }

    const active = a.armed;
    this.power.solveBus(this.dutyCur, active, t.batterySag);
    this.power.stepRotors(h, this.lambda, rhoRatio, active);
    if (active && this.power.anyLimited) {
      for (let i = 0; i < AirframeSpec.MOTORS; i++) {
        if (this.power.atHardLimit(i) && this.escEventCooldown[i] === 0) {
          this.emit(SimEventType.ESC_CURRENT_LIMIT, this.power.current[i], i);
          this.escEventCooldown[i] = DroneSim.ESC_EVENT_SUBSTEPS;
        }
      }
    }
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      if (this.escEventCooldown[i] > 0) this.escEventCooldown[i]--;
    }

    const upY = b.r11;
    const groundOn = t.groundEffect && upY > ModelConstants.GE_MIN_UP && this.env.groundDistance < Infinity;
    const dyFrame = b.py - this.frameStartY;
    const spacing = p.motorSpacing;
    let maxGe = 1.0;
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      let f = 1.0;
      if (groundOn) {
        const height = this.env.groundDistance - dyFrame + (b.r10 * p.motorX(i) + b.r11 * p.motorY(i) + b.r12 * p.motorZ(i));
        f = 1.0 + t.groundEffectScale * (GroundEffect.factor(p.propRadius, height, spacing) - 1.0);
      }
      this.groundFactor[i] = f;
      maxGe = Math.max(maxGe, f);
    }
    this.maxGroundFactor = maxGe;

    this.updatePropContact(p, t, a, b);
    const hoverThrust = p.hoverThrust();
    let fx = 0.0;
    let fy = 0.0;
    let fz = 0.0;
    let tx = 0.0;
    let ty = 0.0;
    let tz = 0.0;
    let sumThrust = 0.0;
    let rotorMomentum = 0.0;
    const thrustScale = 1.0;
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      const w = this.power.omega[i];
      const lam = this.lambda[i];
      let fw = 1.0;
      if (washOn) {
        const vrs = PropWash.vortexRingWeight(this.prevThrust[i], hoverThrust, this.axial[i], this.cross[i], rho,
          p.discArea, p.ductGain);
        fw = this.wash.factor(i, vrs, t.wakeField ? this.wakeWeight : 0.0, t.propWashScale, p.washLoss, washNoise);
      } else {
        this.wash.weight[i] = 0.0;
        this.wash.vrs[i] = 0.0;
      }
      const tl = RotorAero.translationalLiftFactor(this.cross[i], p.hoverInducedVelocity, p.translationalLiftGain,
        t.translationalLiftScale);
      const axialFactor = RotorAero.axialThrustFactor(p, lam, w, this.cross[i]);
      let ti = thrustScale * p.kThrust * rhoRatio * RotorAero.ductFactor(p.ducted, p.ductGain, lam) * axialFactor
        * tl * this.groundFactor[i] * Math.max(0.0, fw) * w * w * this.wearThrust[i] * this.fluidThrust[i];
      if (p.propFlex !== 0.0) ti *= RotorAero.flexFactor(p, w);
      if (this.propContact[i] > 0.0) ti *= 1.0 - (1.0 - DroneSim.PROP_CONTACT_THRUST) * this.propContact[i];
      this.thrust[i] = ti;
      this.prevThrust[i] = Number.isFinite(ti) ? ti : 0.0;
      sumThrust += ti;
      let hx = 0.0;
      let hz = 0.0;
      if (this.cross[i] > 1e-9) {
        const hk = -ModelConstants.KAPPA_H * ti / (w * p.propRadius + ModelConstants.H_TIP_OFFSET);
        hx = hk * this.crossX[i];
        hz = hk * this.crossZ[i];
      }
      fx += hx;
      fy += ti;
      fz += hz;
      const rx = p.motorX(i);
      const ry = p.motorY(i);
      const rz = p.motorZ(i);
      tx += ry * hz - rz * ti;
      ty += rz * hx - rx * hz;
      tz += rx * ti - ry * hx;
      const spin = this.spinSign * p.spin(i);
      ty -= spin * this.power.reactionTorque[i];
      rotorMomentum += spin * p.rotorInertiaEff * w;
    }
    this.totalThrust = sumThrust;
    tx += wbz * rotorMomentum;
    tz -= wbx * rotorMomentum;
    const crot = p.rotationalDamping * rhoRatio;
    tx -= crot * wbx * Math.abs(wbx);
    ty -= crot * wby * Math.abs(wby);
    tz -= crot * wbz * Math.abs(wbz);
    this.bodyAero.drag(p, rho, t.dragScale, ubx, uby, ubz, h, DroneSim.descentTopScale(p, rho, uby, sumThrust));
    fx += this.bodyAero.fx;
    fy += this.bodyAero.fy;
    fz += this.bodyAero.fz;

    const m = p.massKg;
    const g = this.gravity;
    const fwx = b.r00 * fx + b.r01 * fy + b.r02 * fz;
    const fwy = b.r10 * fx + b.r11 * fy + b.r12 * fz;
    const fwz = b.r20 * fx + b.r21 * fy + b.r22 * fz;
    let accX = fwx / m;
    let accY = fwy / m - g;
    const buoyancy = 0.0;
    let accZ = fwz / m;
    let twx = b.r00 * tx + b.r01 * ty + b.r02 * tz;
    let twy = b.r10 * tx + b.r11 * ty + b.r12 * tz;
    let twz = b.r20 * tx + b.r21 * ty + b.r22 * tz;

    this.normalForce = 0.0;
    let contactX = 0.0;
    let contactY = 0.0;
    let contactZ = 0.0;
    const boxResting = this.groundedFrames > 0 && b.py <= this.groundHeight - p.hitboxFootOffset + DroneSim.BOX_TOLERANCE;
    // Turtle mode is not ported: hullGround and turtleHeld of the Java are always false.
    const resting = this.groundedFrames > 0 && (boxResting || this.planeValid);
    const edge = resting && !this.sleeping && !this.poseLocked && this.support.overhang(b, this.groundHeight);
    this.edgeActive = edge;
    let stickX = 0.0;
    let stickY = 0.0;
    let stickZ = 0.0;
    let adhesion = 0.0;
    if (this._stickySides !== 0 && !this.sleeping && !this.poseLocked) {
      stickX = -b.vx * DroneSim.STICKY_STEP;
      stickY = -b.vy * DroneSim.STICKY_STEP;
      stickZ = -b.vz * DroneSim.STICKY_STEP;
      if ((this._stickySides & MoveReport.STICKY_FLOOR) !== 0 && this.groundedFrames > 0) {
        const pulling = sumThrust * b.r11 + buoyancy > m * g;
        this.stickyPull = SimMath.clamp(this.stickyPull + (pulling ? h : -h), 0.0, DroneSim.STICKY_SECONDS);
        adhesion = m * DroneSim.STICKY_HOLD * g * (1.0 - this.stickyPull / DroneSim.STICKY_SECONDS);
        stickY -= adhesion / m;
      } else {
        this.stickyPull = 0.0;
      }
      accX += stickX;
      accY += stickY;
      accZ += stickZ;
      twx -= b.lx * DroneSim.STICKY_STEP;
      twy -= b.ly * DroneSim.STICKY_STEP;
      twz -= b.lz * DroneSim.STICKY_STEP;
    } else {
      this.stickyPull = 0.0;
    }
    this.groundProps = 0;
    if (this.planeValid && !this.sleeping && !this.poseLocked) {
      const gs = this.ground;
      let plane = this.planeY;
      if (boxResting) plane = Math.max(plane, b.py + gs.lowest(p, b));
      const bounce = (this.groundBounce >= 0.0 ? this.groundBounce : p.restitution) * t.restitutionScale;
      const soft = (this.groundBounce >= 0.0 ? this.groundBounce : Math.min(p.restitution, ModelConstants.RESTITUTION_BATTERY))
        * t.restitutionScale;
      const crashSpeed = DroneSim.lossSpeed(p.impactTolerance * t.crashSpeedScale, this.groundImpact);
      const touched = gs.solve(p, b, plane, this.support.groundPlanes(p, b, plane, edge), h, p.friction * this.groundGrip, bounce,
        soft, crashSpeed, true,
        b.vx + h * accX, b.vy + h * accY, b.vz + h * accZ, b.lx + h * twx, b.ly + h * twy, b.lz + h * twz);
      for (let i = 0; i < AirframeSpec.MOTORS; i++) {
        if (gs.depth[i] > -DroneSim.PROP_CONTACT_GAP) this.groundProps |= 1 << i;
      }
      if (touched) {
        contactX = gs.impulseX / h;
        contactY = gs.impulseY / h;
        contactZ = gs.impulseZ / h;
        accX += contactX / m;
        accY += contactY / m;
        accZ += contactZ / m;
        twx += gs.angularX / h;
        twy += gs.angularY / h;
        twz += gs.angularZ / h;
        this.normalForce = gs.normalImpulse / h;
        this.noteContact(p, t, b, gs);
      }
    }
    if (boxResting && !this.sleeping) {
      if (b.vy <= 0.0) {
        const load = Math.max(0.0, m * g + adhesion - sumThrust * b.r11 - buoyancy) - this.normalForce;
        b.vy = 0.0;
        if (accY < 0.0) accY = 0.0;
        const vxz = Math.sqrt(b.vx * b.vx + b.vz * b.vz);
        if (!edge && load > 0.0 && vxz > 0.0) {
          const dv = Math.min(vxz, p.friction * this.groundGrip * load / m * h);
          b.vx -= dv * b.vx / vxz;
          b.vz -= dv * b.vz / vxz;
        }
        if (load > 0.0) {
          contactY += load;
          this.normalForce += load;
        }
        if (edge && load > 0.0) {
          this.edgeSupport(p, b, load);
          accX += this.edgeAx;
          accZ += this.edgeAz;
          twx += this.edgeTx;
          twz += this.edgeTz;
        }
      }
    }

    if (this._stickySides !== 0) {
      contactX += m * stickX;
      contactY += m * stickY;
      contactZ += m * stickZ;
    }

    this.specificX = fx / m + (b.r00 * contactX + b.r10 * contactY + b.r20 * contactZ) / m;
    this.specificY = fy / m + (b.r01 * contactX + b.r11 * contactY + b.r21 * contactZ) / m;
    this.specificZ = fz / m + (b.r02 * contactX + b.r12 * contactY + b.r22 * contactZ) / m;

    if (!this.sleeping && !this.poseLocked) {
      b.integrate(h, accX, accY, accZ, twx, twy, twz);
    } else if (this.poseLocked) {
      b.vx = 0.0;
      b.vy = 0.0;
      b.vz = 0.0;
      b.lx = 0.0;
      b.ly = 0.0;
      b.lz = 0.0;
      b.updateRates();
    }

    this.power.integrateBattery(h, t.infiniteBattery, t.batteryScale);
    if (this.power.busVoltage < p.brownoutVoltage || this.power.packSoc <= ModelConstants.SOC_MIN) {
      this.brownoutCounter++;
      if (this.brownoutCounter > DroneSim.BROWNOUT_SUBSTEPS) {
        this.brownoutCounter = 0;
        if (!this.brownoutLatched || a.armed) this.emit(SimEventType.BROWNOUT, this.power.busVoltage, -1);
        this.brownoutLatched = true;
        this.disarm(DisarmReason.BROWNOUT);
        a.rebootSubsteps = Math.max(a.rebootSubsteps, javaRound(Arming.REBOOT_S * DroneSim.PHYSICS_HZ));
      }
    } else {
      this.brownoutCounter = 0;
      if (this.brownoutLatched && this.power.busVoltage > DroneSim.BROWNOUT_RELEASE * p.brownoutVoltage) this.brownoutLatched = false;
    }

    this.time += h;
    this.substepCount++;
    if (this.substepCount % DroneSim.SLOW_DIVIDER === 0) this.slowTick();
    if (this.substepCount % DroneSim.HOVER_ESTIMATE_DIVIDER === 0) this.updateHoverEstimate();

    this.gLoadFilter.apply(this.specificY);
    this.washFilter.apply(this.wash.maxOf());
    const gTotal = SimMath.hypot3(this.specificX, this.specificY, this.specificZ) / ModelConstants.G;
    if (a.armed && gTotal > this.gLoadMax) this.gLoadMax = gTotal;
    this.updateSleep();

    const check = b.px + b.py + b.pz + b.vx + b.vy + b.vz + b.lx + b.ly + b.lz + b.qw + b.qx + b.qy + b.qz
      + this.power.busVoltage + this.power.omega[0] + this.power.omega[1] + this.power.omega[2] + this.power.omega[3];
    if (!Number.isFinite(check)) {
      this.handleFault();
      return;
    }
    this.dutyCur.set(this.dutyNext);
  }

  updatePropContact(p, t, a, b) {
    const able = a.armed && !a.turtle && !p.ducted;
    const ground = b.r11 < CollisionSolver.STRIKE_NORMAL_LIMIT;
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      let c = this.propContact[i];
      if (able && ((ground && (this.groundProps & (1 << i)) !== 0) || (this.wallProps & (1 << i)) !== 0)) {
        c += (1.0 - c) * DroneSim.PROP_CONTACT_ON;
      } else if (c > 0.0) {
        c -= c * DroneSim.PROP_CONTACT_OFF;
        if (c < DroneSim.PROP_CONTACT_MIN) c = 0.0;
      }
      this.propContact[i] = c;
    }
  }

  notePropContact(b, nx, ny, nz) {
    if (b.r01 * nx + b.r11 * ny + b.r21 * nz >= CollisionSolver.STRIKE_NORMAL_LIMIT) return;
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      if (this.collision.hull.inContact[i]) this.wallProps |= 1 << i;
    }
  }

  touchingBlocks() {
    return this.groundedFrames > 0 || this.ground.touchMask !== 0 || this.contactFrames[0] > 0 || this.contactFrames[1] > 0
      || this.contactFrames[2] > 0 || this.obliqueFrames > 0;
  }

  edgeSupport(p, b, load) {
    const s = this.support;
    const rx = s.edgeX - b.px;
    const ry = s.edgeLevel - b.py;
    const rz = s.edgeZ - b.pz;
    const reach = Math.sqrt(rx * rx + rz * rz);
    this.edgeAx = 0.0;
    this.edgeAz = 0.0;
    this.edgeTx = 0.0;
    this.edgeTz = 0.0;
    if (!(reach > 1.0E-9)) return;
    const ux = -rx / reach;
    const uz = -rz / reach;
    const ax = -uz;
    const az = ux;
    const ex = ax * b.r00 + az * b.r20;
    const ey = ax * b.r01 + az * b.r21;
    const ez = ax * b.r02 + az * b.r22;
    const inertia = ex * ex * b.ixx + ey * ey * b.iyy + ez * ez * b.izz;
    const pivot = inertia / (inertia + p.massKg * (rx * rx + ry * ry + rz * rz));
    this.edgeTx = -rz * load * pivot;
    this.edgeTz = rx * load * pivot;
    const side = b.r11 >= 0.0 ? 1.0 : -1.0;
    const tip = Math.max(0.0, side * (b.r01 * ux + b.r21 * uz));
    const push = load / p.massKg * (DroneSim.EDGE_SLIDE + tip);
    this.edgeAx = push * ux;
    this.edgeAz = push * uz;
  }

  static undeadband(stick, band) {
    if (band <= 0.0 || stick === 0.0) return stick;
    return Math.sign(stick) * Math.min(1.0, band + Math.abs(stick) * (1.0 - band));
  }

  failsafeTick() {
    const a = this.arming;
    if (!this.input.linkOk) {
      a.linkLostSubsteps++;
    } else {
      a.linkLostSubsteps = 0;
      if (a.failsafeStage === 1) {
        a.failsafeStage = 0;
        a.landingSubsteps = 0;
      } else if (a.failsafeStage === 2 && !a.armed) {
        a.failsafeStage = 0;
      }
    }
    const delay = javaRound(this.config.failsafeDelayS * DroneSim.PHYSICS_HZ);
    if (a.armed && a.failsafeStage === 0 && a.linkLostSubsteps > delay) {
      a.failsafeStage = 1;
      a.landingSubsteps = 0;
      this.emit(SimEventType.FAILSAFE, 1.0, -1);
    }
    if (a.failsafeStage === 1) {
      a.landingSubsteps++;
      if (a.landingSubsteps >= javaRound(this.config.failsafeLandingS * DroneSim.PHYSICS_HZ)) {
        this.emit(SimEventType.FAILSAFE, 2.0, -1);
        this.disarm(DisarmReason.FAILSAFE);
        a.failsafeStage = 2;
      }
    }
  }

  slowTick() {
    const p = this.params;
    const t = this.tuning;
    const b = this.body;
    this.gusts.advance(this.rng, this.env.gustIntensity,
      SimMath.hypot3(this.env.windX, this.env.windY, this.env.windZ), t.windScale * t.turbulenceScale);
    const wakeOn = t.wakeField && t.propWash;
    if (wakeOn) {
      this.wake.advance(this.windX, this.windY, this.windZ);
      if (this.substepCount % WakeField.EMIT_INTERVAL === 0) {
        const meanAxial = 0.25 * (this.axial[0] + this.axial[1] + this.axial[2] + this.axial[3]);
        this.wake.emit(true, p, this.env.airDensity, b.px, b.py, b.pz, b.r01, b.r11, b.r21, this.windX, this.windY,
          this.windZ, this.totalThrust, meanAxial);
      }
      this.wakeWeight = this.wake.query(b.px, b.py, b.pz, b.vx, b.vy, b.vz, b.r01, b.r11, b.r21, p.hoverInducedVelocity);
    } else {
      this.wakeWeight = 0.0;
    }
    const airspeed = SimMath.hypot3(b.vx - this.windX, b.vy - this.windY, b.vz - this.windZ);
    this.thermal.advance(p, this.power, this.env.ambientTempC, airspeed, DroneSim.SLOW_DT, t.thermalEffects);
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      const temp = this.thermal.motorTemp[i];
      if (!this.thermal.overheated[i] && temp > p.motorMaxTempC) {
        this.thermal.overheated[i] = true;
        this.emit(SimEventType.MOTOR_OVERHEAT, temp, i);
      } else if (this.thermal.overheated[i] && temp < p.motorMaxTempC - Thermal.HYSTERESIS_C) {
        this.thermal.overheated[i] = false;
      }
      this.power.resistance[i] = t.thermalEffects ? this.thermal.motorResistance(p, i) + p.escResistance : p.phaseResistance;
      this.thermalLimits(p, t, i, temp);
    }
    this.power.extraPower = this.extraPower(p);
    this.power.fullLoad = EnergyModel.fullLoad(p, this.power.omega, this.arming.armed);
    const cell = this.cellFilter.apply(this.power.packVoltage(t.batterySag) / p.cells);
    if (t.infiniteBattery) {
      this.clearBatteryAlarms();
      return;
    }
    const resting = CellCurve.ocv(p.chemistry, PowerSystem.restingSoc(this.power.packSoc, t.batterySag));
    if (this.lowAlarm.update(cell, resting, p.chemistry.emptyCellVoltage, DroneSim.WARN_SLOW_STEPS)) {
      this.emit(SimEventType.BATTERY_LOW, cell, -1);
    }
    if (this.criticalAlarm.update(cell, resting, p.chemistry.cutoffCellVoltage, DroneSim.WARN_SLOW_STEPS)) {
      this.emit(SimEventType.BATTERY_CRITICAL, cell, -1);
    }
    if (!this.emptyFired && this.power.packSoc <= 0.0) {
      this.emptyFired = true;
      this.emit(SimEventType.PACK_DEPLETED, cell, -1);
    }
    this.batteryState = this.emptyFired ? BatteryState.EMPTY
      : this.criticalAlarm.active() ? BatteryState.CRITICAL
        : this.lowAlarm.active() ? BatteryState.LOW : BatteryState.OK;
  }

  thermalLimits(p, t, i, temp) {
    const th = this.thermal;
    if (!t.thermalLimits) {
      th.limit[i] = 1.0;
      th.torque[i] = 1.0;
      this.power.torqueScale[i] = 1.0;
      if (th.escDerating[i]) {
        th.escDerating[i] = false;
        this.emit(SimEventType.ESC_DERATE, 0.0, i);
      }
      if (th.motorHot[i]) {
        th.motorHot[i] = false;
        this.emit(SimEventType.MOTOR_HOT, 0.0, i);
      }
      return;
    }
    const esc = th.escTemp[i];
    th.limit[i] = Thermal.escPowerLimit(esc);
    if (!th.escDerating[i] && esc > Thermal.ESC_LIMIT_C) {
      th.escDerating[i] = true;
      this.emit(SimEventType.ESC_DERATE, 1.0, i);
    } else if (th.escDerating[i] && esc < Thermal.ESC_LIMIT_C - Thermal.HYSTERESIS_C) {
      th.escDerating[i] = false;
      this.emit(SimEventType.ESC_DERATE, 0.0, i);
    }
    th.torque[i] = Thermal.torqueFactor(p, temp);
    this.power.torqueScale[i] = th.torque[i];
    if (!th.motorHot[i] && temp > p.motorDerateStartC) {
      th.motorHot[i] = true;
      this.emit(SimEventType.MOTOR_HOT, 1.0, i);
    } else if (th.motorHot[i] && temp < p.motorDerateStartC - Thermal.HYSTERESIS_C) {
      th.motorHot[i] = false;
      this.emit(SimEventType.MOTOR_HOT, 0.0, i);
    }
    const rate = Thermal.wearRate(p, temp);
    if (rate > 0.0) {
      th.wear[i] += rate * DroneSim.SLOW_DT;
      if (th.wear[i] >= Thermal.WEAR_EVENT_STEP) {
        this.emit(SimEventType.MOTOR_THERMAL_WEAR, th.wear[i], i);
        th.wear[i] = 0.0;
      }
    }
  }

  clearBatteryAlarms() {
    this.lowAlarm.reset();
    this.criticalAlarm.reset();
    this.emptyFired = false;
    this.batteryState = BatteryState.OK;
  }

  static descentTopScale(p, rho, axialSpeed, totalThrust) {
    if (!(axialSpeed < 0.0)) return 1.0;
    const induced = Math.sqrt(Math.max(totalThrust, 0.0) / AirframeSpec.MOTORS / (2.0 * rho * p.discArea * p.ductGain));
    const windmill = induced > 1e-6
      ? SimMath.smoothstep(ModelConstants.WINDMILL_SINK_LOW, ModelConstants.WINDMILL_SINK_HIGH, -axialSpeed / induced) : 1.0;
    return 1.0 - ModelConstants.BLADE_DRAG_SHARE * (1.0 - windmill);
  }

  updateHoverEstimate() {
    const p = this.params;
    const rhoRatio = this.env.airDensity / ModelConstants.RHO0;
    const scale = this.tuning.gravityScale;
    const omega = p.hoverOmega * Math.sqrt(scale) / Math.sqrt(rhoRatio);
    const current = OperatingPoints.hoverCurrent(p, scale);
    OperatingPoints.loadedMotor(p, omega, current, this.power.soc, OperatingPoints.INSTANT, this.power.transientVoltage(),
      this.tuning.batterySag, this.hoverPoint);
    const output = this.fc.outputForDuty(this.hoverPoint.duty, this.hoverPoint.busVoltage);
    this.hoverStick = ThrottleCurve.inverse(this.fc.pid(), SimMath.clamp01(output));
  }

  updateSleep() {
    const b = this.body;
    if (this.sleeping) return;
    const calm = !this.arming.armed && this.groundedFrames > 0 && this.tuning.sleepEnabled
      && b.vx * b.vx + b.vy * b.vy + b.vz * b.vz < DroneSim.SLEEP_SPEED * DroneSim.SLEEP_SPEED
      && b.wbx * b.wbx + b.wby * b.wby + b.wbz * b.wbz < DroneSim.SLEEP_RATE * DroneSim.SLEEP_RATE;
    if (calm) {
      this.sleepCounter++;
      if (this.sleepCounter >= DroneSim.SLEEP_SUBSTEPS) {
        this.sleeping = true;
        b.vx = 0.0;
        b.vy = 0.0;
        b.vz = 0.0;
        b.lx = 0.0;
        b.ly = 0.0;
        b.lz = 0.0;
        b.updateRates();
      }
    } else {
      this.sleepCounter = 0;
    }
  }

  copyRollback() {
    const b = this.body;
    const d = this.rollback;
    d.px = b.px; d.py = b.py; d.pz = b.pz;
    d.vx = b.vx; d.vy = b.vy; d.vz = b.vz;
    d.qw = b.qw; d.qx = b.qx; d.qy = b.qy; d.qz = b.qz;
    d.lx = b.lx; d.ly = b.ly; d.lz = b.lz;
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      d.rotorOmega[i] = this.power.omega[i];
      d.motorTempC[i] = this.thermal.motorTemp[i];
      d.escTempC[i] = this.thermal.escTemp[i];
    }
    d.soc = this.power.soc;
    d.mAhUsed = this.power.mAhUsed;
    d.lastBusVoltage = this.power.lastBusVoltage;
    d.packSoc = this.power.packSoc;
    d.packMahUsed = this.power.packMah;
    d.sleeping = this.sleeping;
    d.groundedFrames = this.groundedFrames;
  }

  restoreRollback() {
    const b = this.body;
    const s = this.rollback;
    b.px = s.px; b.py = s.py; b.pz = s.pz;
    b.vx = s.vx; b.vy = s.vy; b.vz = s.vz;
    b.qw = s.qw; b.qx = s.qx; b.qy = s.qy; b.qz = s.qz;
    b.lx = s.lx; b.ly = s.ly; b.lz = s.lz;
    const norm = Math.sqrt(b.qw * b.qw + b.qx * b.qx + b.qy * b.qy + b.qz * b.qz);
    if (norm > 1e-9 && Number.isFinite(norm)) {
      b.qw /= norm; b.qx /= norm; b.qy /= norm; b.qz /= norm;
    }
    b.updateDerived();
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      this.power.omega[i] = SimMath.clamp(s.rotorOmega[i], -this.params.omegaMax, this.params.omegaMax);
      this.thermal.motorTemp[i] = s.motorTempC[i];
      this.thermal.escTemp[i] = s.escTempC[i];
    }
    this.power.soc = s.soc;
    this.power.mAhUsed = s.mAhUsed;
    this.power.lastBusVoltage = s.lastBusVoltage;
    this.power.busVoltage = s.lastBusVoltage;
    this.power.packSoc = s.packSoc;
    this.power.packMah = s.packMahUsed;
    this.sleeping = s.sleeping;
    this.groundedFrames = s.groundedFrames;
  }

  handleFault() {
    this.restoreRollback();
    const b = this.body;
    b.vx = 0.0; b.vy = 0.0; b.vz = 0.0;
    b.lx = 0.0; b.ly = 0.0; b.lz = 0.0;
    if (!Number.isFinite(b.px + b.py + b.pz)) {
      b.px = SimMath.finiteOr(this.visX, 0.0);
      b.py = SimMath.finiteOr(this.visY, 0.0);
      b.pz = SimMath.finiteOr(this.visZ, 0.0);
    }
    if (!Number.isFinite(b.qw + b.qx + b.qy + b.qz)) b.setUpright(0.0);
    b.updateDerived();
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      if (!Number.isFinite(this.power.omega[i])) this.power.omega[i] = 0.0;
      if (!Number.isFinite(this.thermal.motorTemp[i] + this.thermal.escTemp[i])) {
        this.thermal.motorTemp[i] = this.env.ambientTempC;
        this.thermal.escTemp[i] = this.env.ambientTempC;
      }
      this.power.resistance[i] = this.tuning.thermalEffects
        ? this.thermal.motorResistance(this.params, i) + this.params.escResistance : this.params.phaseResistance;
    }
    if (!Number.isFinite(this.power.lastBusVoltage + this.power.soc + this.power.mAhUsed + this.power.transientVoltage()
      + this.power.heatCurrent)) {
      this.power.setStateOfCharge(Math.max(0.0, SimMath.finiteOr(this.power.soc, 1.0)));
    }
    if (!Number.isFinite(this.power.packSoc + this.power.packMah + this.power.packCurrent + this.power.extraPower)) {
      const pack = Math.max(0.0, SimMath.finiteOr(this.power.packSoc, this.power.soc));
      this.power.packSoc = pack;
      this.power.packMah = (1.0 - pack) * this.params.capacityMah;
      this.power.packCurrent = 0.0;
      this.power.extraPower = 0.0;
      this.power.fullLoad = 0.0;
    }
    this.clearTransientState();
    this.cellFilter.reset(this.power.busVoltage / this.params.cells);
    this.faults++;
    if (this.time - this.faultWindowStart > 1.0) {
      this.faultWindowStart = this.time;
      this.faultsInWindow = 0;
    }
    this.faultsInWindow++;
    this.emit(SimEventType.SIM_FAULT, 0.0, -1);
    this.disarm(DisarmReason.SIM_FAULT);
    this.clearDuties();
    if (this.faultsInWindow > DroneSim.MAX_FAULTS_PER_SECOND) {
      const heading = b.headingRad();
      b.setUpright(Number.isFinite(heading) ? heading : 0.0);
      this.power.stopRotors();
      this.faultsInWindow = 0;
    }
    this.fc.reset(this.gyroModel.raw, this.power.busVoltage, this.appliedRoll, this.appliedPitch, this.appliedYaw,
      this.appliedThrottle);
    this.updateHoverEstimate();
    this.frameAborted = true;
  }

  finishFrame(substeps, out) {
    const b = this.body;
    const tau = this.accumulatorNanos * 1e-9;
    let visX = b.px + b.vx * tau;
    let visY = b.py + b.vy * tau;
    let visZ = b.pz + b.vz * tau;
    if (this.sleeping || this.poseLocked) {
      visX = b.px;
      visY = b.py;
      visZ = b.pz;
    }
    if (out != null) {
      out.dx = visX - this.visX;
      out.dy = visY - this.visY;
      out.dz = visZ - this.visZ;
      const rate = SimMath.hypot3(b.wwx, b.wwy, b.wwz);
      const theta = rate * tau;
      let qw = b.qw;
      let qx = b.qx;
      let qy = b.qy;
      let qz = b.qz;
      if (theta > 1e-12 && !this.sleeping) {
        const s = SimMath.sin(0.5 * theta) / rate;
        const dw = SimMath.cos(0.5 * theta);
        const dx = s * b.wwx;
        const dy = s * b.wwy;
        const dz = s * b.wwz;
        qw = dw * b.qw - dx * b.qx - dy * b.qy - dz * b.qz;
        qx = dw * b.qx + dx * b.qw + dy * b.qz - dz * b.qy;
        qy = dw * b.qy - dx * b.qz + dy * b.qw + dz * b.qx;
        qz = dw * b.qz + dx * b.qy - dy * b.qx + dz * b.qw;
      }
      out.orientation.set(qx, qy, qz, qw);
      out.substeps = substeps;
      out.armed = this.arming.armed;
      out.sleeping = this.sleeping;
    }
    this.visX = visX;
    this.visY = visY;
    this.visZ = visZ;
    this.fillTelemetry(substeps);
  }

  /** The world moved the drone (clipped by blocks): contacts, impacts, grounding (DroneSim.afterMove). */
  afterMove(report) {
    if (report == null) return;
    const cx = report.actualX - report.requestedX;
    const cy = report.actualY - report.requestedY;
    const cz = report.actualZ - report.requestedZ;
    if (!Number.isFinite(report.requestedX) || !Number.isFinite(report.requestedY) || !Number.isFinite(report.requestedZ)
      || !Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cz)) {
      this.faults++;
      this.telemetry.faults = this.faults;
      return;
    }
    const b = this.body;
    const p = this.params;
    b.px += cx;
    b.py += cy;
    b.pz += cz;
    this.visX += cx;
    this.visY += cy;
    this.visZ += cz;
    this._ghost = report.ghost;
    if (this._ghost) {
      this.passThrough(b);
      return;
    }
    this._stickySides = report.stickySides & MoveReport.STICKY_ALL;
    this.wallProps = 0;
    const grip = SimMath.sanitize(report.surfaceGrip, 0.0, 4.0, 1.0);
    const supportKnown = !Number.isNaN(report.supportGap);
    const lift = this.planeValid ? Math.max(0.0, this.visY + p.hitboxFootOffset - this.planeY) : 0.0;
    const floorAtHull = this.planeValid && Math.abs(this.rayFloor - (this.visY + p.hitboxFootOffset)) <= DroneSim.SUPPORT_TOLERANCE;
    const unsupported = supportKnown && !floorAtHull && report.supportGap > lift + DroneSim.SUPPORT_TOLERANCE;
    const restitution = Number.isNaN(report.surfaceRestitution) || report.surfaceRestitution < 0.0 ? -1.0
      : Math.min(report.surfaceRestitution, 1.0);
    const scale = SurfaceResponse.impactScaleOf(report.surfaceImpactScale);
    const crashSpeed = p.impactTolerance * this.tuning.crashSpeedScale;
    this.contactScale = scale;
    let hitGround = false;
    let boxGround = false;
    let groundImpact = 0.0;
    const wasGrounded = this.groundedFrames > 0;
    let ax = this.axisSpeed(report.hitX, report.requestedX, report.impactVelocityX, b.vx);
    let ay = this.axisSpeed(report.hitY, report.requestedY, report.impactVelocityY, b.vy);
    let az = this.axisSpeed(report.hitZ, report.requestedZ, report.impactVelocityZ, b.vz);
    let touched = 0;
    for (let pass = 0; pass < 3; pass++) {
      let axis = -1;
      let best = -1.0;
      if (ax > best) { best = ax; axis = 0; }
      if (ay > best) { best = ay; axis = 1; }
      if (az > best) { best = az; axis = 2; }
      if (axis < 0 || best < 0.0) break;
      let requested;
      let impact;
      if (axis === 0) {
        ax = -1.0;
        requested = report.requestedX;
        impact = report.impactVelocityX;
      } else if (axis === 1) {
        ay = -1.0;
        requested = report.requestedY;
        impact = report.impactVelocityY;
      } else {
        az = -1.0;
        requested = report.requestedZ;
        impact = report.impactVelocityZ;
      }
      const sign = -Math.sign(requested);
      const nx = axis === 0 ? sign : 0.0;
      const ny = axis === 1 ? sign : 0.0;
      const nz = axis === 2 ? sign : 0.0;
      let approach = Infinity;
      if (this.contactFrames[axis] > 0 && this.contactSign[axis] === sign) {
        const startNormal = axis === 0 ? this.frameStartVx : (axis === 1 ? this.frameStartVy : this.frameStartVz);
        approach = Math.max(0.0, -sign * startNormal);
      }
      touched |= 1 << axis;
      this.contactSign[axis] = sign;
      let saved = 0.0;
      const useImpact = Number.isFinite(impact);
      if (useImpact) {
        if (axis === 0) { saved = b.vx; b.vx = impact; } else if (axis === 1) { saved = b.vy; b.vy = impact; } else { saved = b.vz; b.vz = impact; }
      }
      if (ny > 0.0) {
        const pushed = this.groundImpulse(p, b, this.visY + p.hitboxFootOffset, grip, restitution, scale);
        if (useImpact && !pushed) b.vy = saved;
        hitGround = true;
        boxGround = true;
        this.groundGrip = grip;
        this.groundBounce = restitution;
        this.groundImpact = scale;
        continue;
      }
      this.collision.resolve(p, b, this.power, this.tuning, this.spinSign, nx, ny, nz, grip, restitution,
        DroneSim.lossApproach(approach, crashSpeed, scale));
      this.notePropContact(b, nx, ny, nz);
      if (useImpact && !this.collision.resolved) {
        if (axis === 0) b.vx = saved; else if (axis === 1) b.vy = saved; else b.vz = saved;
      }
      if (this.collision.resolved) {
        this.classifyImpact(Math.min(this.collision.impactSpeed, approach), nx, ny, nz);
        if (Math.abs(this.collision.normalImpulse) > 0.05 * p.massKg) this.wakeUp();
      }
    }
    for (let a = 0; a < 3; a++) {
      if ((touched & (1 << a)) !== 0) this.contactFrames[a] = DroneSim.CONTACT_MEMORY_FRAMES;
      else if (this.contactFrames[a] > 0) this.contactFrames[a]--;
    }
    if (report.obliqueContact()) {
      const length = Math.sqrt(report.contactNormalX * report.contactNormalX + report.contactNormalY * report.contactNormalY
        + report.contactNormalZ * report.contactNormalZ);
      if (length > 1.0e-6) {
        const nx = report.contactNormalX / length;
        const ny = report.contactNormalY / length;
        const nz = report.contactNormalZ / length;
        let approach = Infinity;
        if (this.obliqueFrames > 0 && nx * this.obliqueX + ny * this.obliqueY + nz * this.obliqueZ > DroneSim.OBLIQUE_SAME_CONTACT) {
          approach = Math.max(0.0, -(nx * this.frameStartVx + ny * this.frameStartVy + nz * this.frameStartVz));
        }
        this.obliqueFrames = DroneSim.CONTACT_MEMORY_FRAMES;
        this.obliqueX = nx;
        this.obliqueY = ny;
        this.obliqueZ = nz;
        this.collision.resolve(p, b, this.power, this.tuning, this.spinSign, nx, ny, nz, grip, restitution,
          DroneSim.lossApproach(approach, crashSpeed, scale));
        this.notePropContact(b, nx, ny, nz);
        if (ny > DroneSim.OBLIQUE_GROUND) {
          hitGround = true;
          groundImpact = Math.max(groundImpact, this.collision.impactSpeed);
        }
        if (this.collision.resolved) {
          this.classifyImpact(Math.min(this.collision.impactSpeed, approach), nx, ny, nz);
          if (Math.abs(this.collision.normalImpulse) > 0.05 * p.massKg) this.wakeUp();
        }
      }
    } else if (this.obliqueFrames > 0) {
      this.obliqueFrames--;
    }
    if (this.frameContacts !== 0 || this.frameStruck !== 0) {
      this.classify(this.frameApproach, this.frameTangential, DroneSim.hullMask(this.frameContacts), this.frameStruck,
        this.frameStruckRpm, 0.0, 1.0, 0.0);
      if (this.frameImpulse > 0.05 * p.massKg) this.wakeUp();
    }
    if (this.frameTouch && this.planeValid && !boxGround) {
      if (unsupported) {
        this.leaveGround(b);
      } else {
        hitGround = true;
        groundImpact = Math.max(groundImpact, this.frameApproach);
        if (this.groundedFrames === 0) this.groundHeight = this.planeY;
      }
    }
    if (boxGround) groundImpact = Math.max(groundImpact, this.frameApproach);
    this.clearFrameContacts();
    if (hitGround) {
      this.groundedFrames = 2;
      if (boxGround) this.groundHeight = this.visY + p.hitboxFootOffset;
      this.groundGrip = grip;
      this.groundBounce = restitution;
      this.groundImpact = scale;
      if (!wasGrounded && groundImpact < 1.5 && b.tiltRad() * SimMath.DEG < 30.0) this.emit(SimEventType.LANDED, -groundImpact, -1);
    } else if (!this.sleeping && this.groundedFrames > 0) {
      const resting = Math.abs(this.visY + p.hitboxFootOffset - this.groundHeight) < DroneSim.RESTING_TOLERANCE && b.vy <= 1e-6;
      if (resting && !unsupported) {
        this.groundedFrames = 2;
      } else if (resting) {
        this.leaveGround(b);
      } else {
        this.groundedFrames--;
        if (this.groundedFrames === 0) this.emit(SimEventType.TAKEOFF, b.vy, -1);
      }
    }
    if (!hitGround && touched === 0 && !report.obliqueContact()) {
      this.groundGrip = grip;
      this.groundBounce = restitution;
      this.groundImpact = scale;
    }
    if (this.sleeping) {
      const clearance = this.env.solidDistance + this.ground.lowest(p, b);
      if (unsupported) {
        this.wakeUp();
        this.leaveGround(b);
      } else if (!supportKnown && clearance > DroneSim.WAKE_THRESHOLD) {
        this.wakeUp();
      }
    }
    this.fillTelemetry(this.telemetry.substeps);
  }

  passThrough(b) {
    this.clearContacts();
    this.leaveGround(b);
    if (this.sleeping) this.wakeUp();
    this.fillTelemetry(this.telemetry.substeps);
  }

  ghost() {
    return this._ghost;
  }

  static lossSpeed(crashSpeed, impactScale) {
    if (impactScale >= 1.0) return crashSpeed;
    return impactScale > 0.0 ? crashSpeed / impactScale : Number.MAX_VALUE;
  }

  static lossApproach(approach, crashSpeed, impactScale) {
    if (impactScale >= 1.0) return approach;
    return Math.min(approach, Math.max(ModelConstants.BOUNCE_MIN, impactScale * crashSpeed));
  }

  leaveGround(b) {
    if (this.groundedFrames > 0) {
      this.groundedFrames = 0;
      this.emit(SimEventType.TAKEOFF, b.vy, -1);
    }
  }

  axisSpeed(hit, requested, impact, velocity) {
    if (!hit || requested === 0.0) return -1.0;
    return Math.abs(Number.isFinite(impact) ? impact : velocity);
  }

  classifyImpact(v, nx, ny, nz) {
    const c = this.collision;
    let struck = 0;
    for (let i = 0; i < AirframeSpec.MOTORS; i++) if (c.struck[i]) struck |= 1 << i;
    let contacts = 0;
    for (let k = 0; k < AirframeSpec.HULL_POINTS; k++) if (c.hull.inContact[k]) contacts |= 1 << k;
    this.classify(v, c.tangentialSpeed, contacts, struck, c.struckRpm, nx, ny, nz);
  }

  classify(v, tangential, contacts, struck, struckRpm, nx, ny, nz) {
    const scale = this.contactScale;
    if (scale < 1.0) {
      v *= scale;
      tangential *= scale;
      if (!(scale > 0.0)) struck = 0;
    }
    const vcr = this.params.impactTolerance * this.tuning.crashSpeedScale;
    this.recordImpact(v, tangential, contacts, struck, struckRpm, nx, ny, nz);
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      if ((struck & (1 << i)) !== 0) {
        this.propStrikeCount++;
        this.emit(SimEventType.PROP_STRIKE, struckRpm[i], i);
      }
    }
    if (v >= 1.0) this.lastImpactSpeed = v;
    const crash = v >= vcr || (tangential >= 1.5 * vcr && v >= 0.5);
    if (crash || v >= 1.0) this.impactCount++;
    if (crash) {
      this.crashCount++;
      this.lastImpactSpeed = Math.max(this.lastImpactSpeed, v);
      this.emit(SimEventType.CRASH, v, -1);
      if (this.arming.armed && this.tuning.crashDisarm) this.disarm(DisarmReason.CRASH);
    } else if (v >= 0.5 * vcr) {
      this.emit(SimEventType.HARD_IMPACT, v, -1);
    } else if (v >= 1.0) {
      this.emit(SimEventType.BUMP, v, -1);
    }
  }

  recordImpact(v, tangential, contacts, struck, struckRpm, nx, ny, nz) {
    let spin = 0.0;
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      if ((struck & (1 << i)) !== 0) spin = Math.max(spin, struckRpm[i] * SimMath.TWO_PI / 60.0 / this.params.hoverOmega);
    }
    if (v < DroneSim.IMPACT_RECORD_SPEED && struck === 0) return;
    const b = this.body;
    const bx = b.r00 * nx + b.r10 * ny + b.r20 * nz;
    const by = b.r01 * nx + b.r11 * ny + b.r21 * nz;
    const bz = b.r02 * nx + b.r12 * ny + b.r22 * nz;
    this.impacts.add(v, tangential, bx, by, bz, contacts, struck, spin);
  }

  teleport(x, y, z, keepVelocity) {
    if (!Number.isFinite(x + y + z)) return;
    const b = this.body;
    const dx = x - b.px;
    const dy = y - b.py;
    const dz = z - b.pz;
    this.wake.shift(dx, dy, dz);
    b.px = x;
    b.py = y;
    b.pz = z;
    if (!keepVelocity) {
      b.vx = 0.0;
      b.vy = 0.0;
      b.vz = 0.0;
      b.lx = 0.0;
      b.ly = 0.0;
      b.lz = 0.0;
      b.updateRates();
    }
    this.visX = x;
    this.visY = y;
    this.visZ = z;
    this.frameStartY = y;
    this.groundedFrames = 0;
    this.clearContacts();
    this.wakeUp();
  }

  pushOut(dx, dy, dz) {
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!Number.isFinite(length) || length <= 0.0) return;
    const b = this.body;
    this.wake.shift(dx, dy, dz);
    b.px += dx;
    b.py += dy;
    b.pz += dz;
    this.visX += dx;
    this.visY += dy;
    this.visZ += dz;
    this.frameStartY += dy;
    const nx = dx / length;
    const ny = dy / length;
    const nz = dz / length;
    const inward = b.vx * nx + b.vy * ny + b.vz * nz;
    if (inward < 0.0) {
      b.vx -= inward * nx;
      b.vy -= inward * ny;
      b.vz -= inward * nz;
    }
    this.groundedFrames = 0;
    this.clearContacts();
    this._pushOuts++;
    this.wakeUp();
  }

  pushOuts() {
    return this._pushOuts;
  }

  pendingNanos() {
    return this.accumulatorNanos;
  }

  lowestPointOffset() {
    return this.ground.lowest(this.params, this.body);
  }

  fillTelemetry(substeps) {
    const tm = this.telemetry;
    const b = this.body;
    const p = this.params;
    const pw = this.power;
    tm.time = this.time;
    tm.substeps = substeps;
    tm.armBlockers = this.arming.blockers;
    tm.autoArmPending = this.arming.autoArm && !this.arming.armed;
    tm.failsafeStage = this.arming.failsafeStage;
    tm.faults = this.faults;
    tm.crashCount = this.crashCount;
    tm.impactCount = this.impactCount;
    tm.propStrikeCount = this.propStrikeCount;
    tm.armed = this.arming.armed;
    tm.airmodeActive = this.arming.armed && this.fc.pid().airmode && this.fc.airmodeLatched;
    tm.grounded = this.groundedFrames > 0;
    tm.sleeping = this.sleeping;
    tm.motorSaturated = this.arming.armed && this.fc.mixer.saturated;
    tm.inGroundEffect = this.maxGroundFactor > 1.02;
    tm.mode = this.arming.failsafeStage === 1 ? StabMode.ANGLE : this.input.mode;
    tm.mode3d = false;
    tm.turtle = false;
    tm.waterproof = false;
    tm.submerged = 0.0;
    tm.lastDisarmReason = this.arming.lastDisarmReason;
    tm.batteryState = this.batteryState;
    let sumThrust = 0.0;
    let maxVrs = 0.0;
    let motorHot = false;
    let escDerating = false;
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      tm.motorRpm[i] = pw.omega[i] * 60.0 / SimMath.TWO_PI;
      tm.motorOutput[i] = this.arming.armed ? this.fc.motorOutput[i] : 0.0;
      tm.motorDuty[i] = this.dutyCur[i];
      tm.motorCurrentA[i] = pw.current[i];
      tm.motorThrustN[i] = this.thrust[i];
      tm.motorTempC[i] = this.thermal.motorTemp[i];
      tm.escTempC[i] = this.thermal.escTemp[i];
      tm.motorPowerLimit[i] = this.thermal.limit[i];
      motorHot = motorHot || this.thermal.motorHot[i];
      escDerating = escDerating || this.thermal.escDerating[i];
      sumThrust += this.thrust[i];
      maxVrs = Math.max(maxVrs, this.wash.vrs[i]);
    }
    tm.motorHot = motorHot;
    tm.escDerating = escDerating;
    tm.escBurned = this.escBurned;
    tm.totalCurrentA = pw.batteryCurrent;
    tm.packVoltage = pw.busVoltage;
    tm.cellVoltage = pw.busVoltage / p.cells;
    tm.cellVoltageResting = CellCurve.ocv(p.chemistry, PowerSystem.restingSoc(pw.soc, this.tuning.batterySag));
    tm.mAhUsed = pw.mAhUsed;
    tm.chargeFraction = Math.max(0.0, pw.soc);
    tm.powerW = pw.busVoltage * pw.batteryCurrent;
    const packVolts = pw.packVoltage(this.tuning.batterySag);
    tm.batteryCurrentA = pw.packCurrent;
    tm.batteryVoltage = packVolts;
    tm.batteryCellVoltage = packVolts / p.cells;
    tm.batteryCellResting = CellCurve.ocv(p.chemistry, PowerSystem.restingSoc(pw.packSoc, this.tuning.batterySag));
    tm.batteryMahUsed = pw.packMah;
    tm.batteryCharge = Math.max(0.0, pw.packSoc);
    tm.batteryPowerW = packVolts * pw.packCurrent;
    tm.propWash = this.washFilter.value();
    tm.propWashVrs = maxVrs;
    tm.propWashWake = this.wakeWeight;
    tm.groundEffectFactor = this.maxGroundFactor;
    tm.totalThrustN = sumThrust;
    tm.thrustToWeight = sumThrust / (p.massKg * SimTuning.referenceGravity(this.gravity));
    tm.gLoad = this.gLoadFilter.value() / ModelConstants.G;
    tm.gLoadTotal = SimMath.hypot3(this.specificX, this.specificY, this.specificZ) / ModelConstants.G;
    tm.gLoadMax = this.gLoadMax;
    tm.speed = SimMath.hypot3(b.vx, b.vy, b.vz);
    tm.airspeed = SimMath.hypot3(b.vx - this.windX, b.vy - this.windY, b.vz - this.windZ);
    tm.verticalSpeed = b.vy;
    tm.heightAboveGround = this.env.groundDistance - (b.py - this.frameStartY) + p.hitboxFootOffset;
    tm.rollDeg = StrictMath.asin(SimMath.clamp(b.r10, -1.0, 1.0)) * SimMath.DEG;
    tm.pitchDeg = StrictMath.asin(SimMath.clamp(-b.r12, -1.0, 1.0)) * SimMath.DEG;
    tm.headingDeg = b.headingRad() * SimMath.DEG;
    tm.tiltDeg = b.tiltRad() * SimMath.DEG;
    for (let a = 0; a < 3; a++) {
      const c = this.fc.axes[a];
      tm.gyroDps[a] = this.fc.gyro[a];
      tm.setpointDps[a] = this.fc.setpoint[a];
      tm.pTerm[a] = c.pOut * 1000.0;
      tm.iTerm[a] = c.iTerm * 1000.0;
      tm.dTerm[a] = c.dOut * 1000.0;
      tm.fTerm[a] = c.fOut * 1000.0;
    }
    tm.throttleOut = this.arming.armed ? this.fc.signedThrottleOut() : 0.0;
    tm.hoverThrottleStick = this.hoverStick;
    tm.attitudeErrorDeg = this.fc.attitude.errorDeg;
    tm.lastImpactSpeed = this.lastImpactSpeed;
    tm.vibration = 0.0;
    tm.holdMode = HoldMode.OFF;
  }
}

// RcProcessor is imported so the deadband helpers stay reachable for the page (publishFcSample is not ported).
export { RcProcessor };
