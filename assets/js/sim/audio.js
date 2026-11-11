// Drone sound of the FPV simulator: Propwash's procedural motor voice (audio/, a port of the mod's audio package,
// rendered in audio-worklet.js) plus the mod's beep samples (assets/data/sim/sounds/).
//
// The voice logic is the mod's client glue for one drone: DroneVoice (what the game feeds the synth), MotorVoices
// (20 Hz tick + per-frame update, listener velocity), BeepPlayer (samples, merge windows, volumes) and the AudioConfig
// defaults (motor volume 0.8, beep volume 0.7, doppler on). What the listener hears:
// - Pilot in the goggles ({ fpv: true }, DroneVoice pilotView): the synth reads the flight model's telemetry every frame
//   (motorRpm, motor current / max current as load, propWash, airspeed / 45 m/s as airflow, crash and prop-strike thumps),
//   12 ms rpm smoothing, onboard rumble and wind, no doppler, no distance loss, gain 0.85 × timbre loudness.
// - Pilot on the ground ({ fpv: false, x, y, z }): like any other player hearing a drone. The synth gets the rpm the
//   other clients see (each motor's |rpm| / max rpm, sent as one byte per motor at 20 Hz, mapped back to rpm through
//   MotorTimbre.rpmForOutput with spin-up/spin-down lag) and output as load, prop wash only when sinking into it,
//   no wind; doppler from the drone's and listener's velocity; level fades with SoundReach.attenuation over the build's
//   throttle-dependent reach; high frequencies roll off with distance (SoundReach.airCutoffHz).
// Not ported: the sample fallback voice (motor_loop.ogg, used by the mod when no streaming channel is free), voice
// budgets between several drones, /stopsound, the locator beeper, and 3D panning (the listener has no orientation; the
// voice is mono).
//
// Usage: new DroneAudio(airframe); call start() from a user gesture (click/key/gamepad button), then update(sim, listener)
// every rendered frame and event(name) for 'arm' | 'disarm' | 'crash' | 'low_battery'. Without AudioContext/AudioWorklet
// everything is a silent no-op.

import { MotorControl } from './audio/MotorControl.js?v=e5eb5688';
import { MotorTimbre } from './audio/MotorTimbre.js?v=d8807f99';
import { SoundReach } from './audio/SoundReach.js?v=fa418e95';
import { OperatingPoints } from './model/OperatingPoints.js?v=047f5bd2';
import { ModelConstants } from './model/ModelConstants.js?v=760466ce';
import { PROCESSOR_NAME, WORKLET_URL } from './audio-worklet.js?v=63c26855';

const SOUND_DIR = new URL('../../data/sim/sounds/', import.meta.url);

// AudioConfig defaults
const MOTOR_VOLUME = 0.8;
const BEEP_VOLUME = 0.7;
const DOPPLER = true;

// DroneVoice
const TICK_SECONDS = 0.05;
const SPIN_UP_TAU = 0.06;
const ARMED_SPIN_DOWN_TAU = 0.09;
const FREEWHEEL_TAU = 0.3;
const STOPPED_RPM = 60.0;
const PILOT_GAIN = 0.85;
const CLOSE_BRIGHTNESS_HZ = 14_000.0;
const RESTART_WINDOW_TICKS = 200;
const MAX_RESTARTS = 4;
const SPEED_OF_SOUND = 343.0;
const FULL_AIRFLOW_SPEED = 45.0;
const UNDERWATER_BRIGHTNESS_HZ = 900.0;
const UNDERWATER_GAIN = 0.45;
const WASH_HORIZONTAL_SPEED = 8.0;
const KEEP_RANGE_FACTOR = 1.15;
const KEEP_RANGE_BLOCKS = 4.0;
const MOTORS = MotorControl.MOTORS;
// MotorVoices: at most this many 20 Hz ticks are caught up per frame (the rest of a long stall is dropped)
const MAX_TICKS_PER_FRAME = 4;

// BeepPlayer: event -> sample, merge window (s), base volume
const BEEPS = {
  arm: { file: 'beep_arm.ogg', merge: 0.25, volume: 0.7 },
  disarm: { file: 'beep_disarm.ogg', merge: 0.25, volume: 0.7 },
  low_battery: { file: 'beep_low_battery.ogg', merge: 0.4, volume: 0.8 },
  crash: { file: 'crash.ogg', merge: 0.3, volume: 1.0 },
};

const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));
const nowSeconds = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

/** The two numbers MotorTimbre.derive reads from BuildAnalysis, computed like BuildAnalysis.compute. */
function buildAnalysis(p) {
  const weight = p.massKg * ModelConstants.G;
  const full = new OperatingPoints.Point();
  OperatingPoints.uniformDuty(p, 1.0, 1.0, false, 0.0, 0.0, full);
  const tw = 4.0 * full.thrustPerMotor / weight;
  const hoverHalf = new OperatingPoints.Point();
  OperatingPoints.hover(p, 0.5, true, 0.0, true, hoverHalf);
  const hoverStick = (hoverHalf.duty - ModelConstants.IDLE_REFERENCE) / (1.0 - ModelConstants.IDLE_REFERENCE);
  const canHover = tw >= 1.15 && hoverStick <= 1.0 && hoverHalf.feasible;
  const hoverPercent = canHover ? 100.0 * hoverStick : NaN;
  return { thrustToWeight: () => tw, hoverThrottlePercent: () => hoverPercent };
}

/** StateValidation.packMotors/unpackMotor: the byte per motor the entity syncs to other clients. */
function syncedOutput(value) {
  const unit = Number.isFinite(value) ? clamp(value, 0.0, 1.0) : 0.0;
  return Math.floor(unit * 255.0 + 0.5) / 255.0;
}

/** Port of client.DroneVoice for the one drone of the simulator (synth voice only). */
class DroneVoice {
  constructor(timbre, reach, seed, rpmMax, sink) {
    this.control = new MotorControl();
    this.timbre = timbre;
    this.reach = reach;
    this.seed = seed;
    this.rpmMax = rpmMax;
    this.sink = sink;
    this.synth = false;
    this.synthPilotView = false;
    this.failed = false;
    this.pilotView = false;
    this.releasing = false;
    this.synthRetryTick = 0;
    this.restartWindowStart = 0;
    this.restartCount = 0;
    this.spinRpm = new Float64Array(MOTORS);
    this.outputs = new Float64Array(MOTORS);
    this.armed = false;
    this.underwater = false;
    this.x = 0.0;
    this.y = 0.0;
    this.z = 0.0;
    this.velX = 0.0;
    this.velY = 0.0;
    this.velZ = 0.0;
    this.doppler = 1.0;
    this.distance = 0.0;
    this.range = SoundReach.MIN_RANGE_BLOCKS;
    this.baseGain = 0.0;
    this.distanceGain = 1.0;
    this.seenCrashes = -1;
    this.seenStrikes = -1;
  }

  /** DroneVoice.observe (entity tick). The sim's body velocity stands in for the mod's 20 Hz position difference. */
  observe(sim) {
    const b = sim.body;
    const t = sim.telemetry;
    this.x = b.px;
    this.y = b.py;
    this.z = b.pz;
    let vx = Number.isFinite(b.vx) ? b.vx : 0.0;
    let vy = Number.isFinite(b.vy) ? b.vy : 0.0;
    let vz = Number.isFinite(b.vz) ? b.vz : 0.0;
    if (vx * vx + vy * vy + vz * vz > 200.0 * 200.0) {
      vx = 0.0;
      vy = 0.0;
      vz = 0.0;
    }
    this.velX += 0.5 * (vx - this.velX);
    this.velY += 0.5 * (vy - this.velY);
    this.velZ += 0.5 * (vz - this.velZ);
    this.armed = !!t.armed;
    this.underwater = t.submerged > 0.0;
    // PilotSession.writeEntity: |rpm| / max rpm per motor, 0 while disarmed; QuadcopterEntity.motorOutput(m) unpacks it.
    for (let m = 0; m < MOTORS; m++) {
      const rpm = t.motorRpm[m];
      const out = this.rpmMax > 0.0 && Number.isFinite(rpm) ? Math.abs(rpm) / this.rpmMax : 0.0;
      this.outputs[m] = t.armed ? syncedOutput(out) : 0.0;
    }
  }

  updateTargets(pilotView, sim, listenerX, listenerY, listenerZ, listenerVx, listenerVy, listenerVz) {
    this.pilotView = pilotView;
    const dx = listenerX - this.x;
    const dy = listenerY - this.y;
    const dz = listenerZ - this.z;
    this.distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (pilotView && sim != null) {
      this.readTelemetry(sim.telemetry);
      this.control.setSmoothingSeconds(0.012);
    } else {
      this.spinModel();
      this.control.setAirflow(pilotView ? clamp(Math.sqrt(this.velX * this.velX + this.velY * this.velY + this.velZ * this.velZ)
        / FULL_AIRFLOW_SPEED, 0.0, 1.0) : 0.0);
      this.control.setSmoothingSeconds(0.05);
    }
    if (pilotView || !DOPPLER || this.distance < 0.5) {
      this.doppler += 0.5 * (1.0 - this.doppler);
    } else {
      const inv = 1.0 / this.distance;
      const nx = dx * inv;
      const ny = dy * inv;
      const nz = dz * inv;
      const sourceToward = clamp(this.velX * nx + this.velY * ny + this.velZ * nz, -250.0, 250.0);
      const listenerAway = clamp(listenerVx * nx + listenerVy * ny + listenerVz * nz, -250.0, 250.0);
      const factor = (SPEED_OF_SOUND - listenerAway) / (SPEED_OF_SOUND - sourceToward);
      this.doppler += 0.35 * (clamp(factor, 0.7, 1.4) - this.doppler);
    }
    this.range = pilotView ? SoundReach.MAX_RANGE_BLOCKS : this.reach.rangeBlocks(this.amplitude());
    let brightness = pilotView ? CLOSE_BRIGHTNESS_HZ : Math.min(CLOSE_BRIGHTNESS_HZ, SoundReach.airCutoffHz(this.distance));
    let gain = MOTOR_VOLUME * this.timbre.loudness() * (pilotView ? PILOT_GAIN : 1.0);
    if (this.underwater) {
      brightness = Math.min(brightness, UNDERWATER_BRIGHTNESS_HZ);
      gain *= UNDERWATER_GAIN;
    }
    this.baseGain = gain;
    this.distanceGain = pilotView ? 1.0 : SoundReach.attenuation(this.distance, this.range);
    this.control.setDoppler(this.doppler);
    this.control.setBrightnessHz(brightness);
    this.control.setGain(pilotView ? gain : gain * this.distanceGain);
    this.control.setOnboard(pilotView);
    this.control.setActive(!this.releasing);
    this.publish();
  }

  amplitude() {
    let sum = 0.0;
    for (let m = 0; m < MOTORS; m++) {
      sum += SoundReach.amplitude(this.control.rpm(m), this.timbre.maxRpm(), this.control.load(m));
    }
    return sum / MOTORS;
  }

  spinModel() {
    let sum = 0.0;
    for (let m = 0; m < MOTORS; m++) {
      const output = Math.max(0.0, Math.min(1.0, this.outputs[m]));
      const target = this.armed ? this.timbre.rpmForOutput(output) : 0.0;
      const tau = target > this.spinRpm[m] ? SPIN_UP_TAU : (this.armed ? ARMED_SPIN_DOWN_TAU : FREEWHEEL_TAU);
      const k = 1.0 - Math.exp(-TICK_SECONDS / tau);
      this.spinRpm[m] += k * (target - this.spinRpm[m]);
      if (!this.armed && this.spinRpm[m] < STOPPED_RPM) {
        this.spinRpm[m] = 0.0;
      }
      const load = this.armed ? output : 0.0;
      this.control.setMotor(m, this.spinRpm[m], load);
      sum += load;
    }
    const horizontal = Math.sqrt(this.velX * this.velX + this.velZ * this.velZ);
    const sink = clamp((-this.velY - 2.0) / 6.0, 0.0, 1.0) * clamp(1.0 - horizontal / WASH_HORIZONTAL_SPEED, 0.0, 1.0);
    this.control.setWash(sink * clamp(sum / MOTORS * 2.5, 0.0, 1.0));
  }

  readTelemetry(t) {
    const maxCurrent = this.timbre.maxCurrentA();
    for (let m = 0; m < MOTORS; m++) {
      const rpm = t.motorRpm[m];
      this.spinRpm[m] = Number.isFinite(rpm) ? Math.abs(rpm) : 0.0;
      this.control.setMotor(m, this.spinRpm[m], Math.abs(t.motorCurrentA[m]) / maxCurrent);
    }
    this.control.setWash(t.propWash);
    this.control.setAirflow(Number.isFinite(t.airspeed) ? clamp(t.airspeed / FULL_AIRFLOW_SPEED, 0.0, 1.0) : 0.0);
    this.armed = this.armed || !!t.armed;
    if (this.seenStrikes >= 0 && t.propStrikeCount !== this.seenStrikes) {
      this.control.impulse(0.55);
    }
    if (this.seenCrashes >= 0 && t.crashCount !== this.seenCrashes) {
      this.control.impulse(1.0);
    }
    this.seenStrikes = t.propStrikeCount;
    this.seenCrashes = t.crashCount;
  }

  pushPilotTelemetry(t) {
    this.readTelemetry(t);
    this.publish();
  }

  wantsSound() {
    if (this.pilotView) {
      return this.armed || this.maxSpin() > STOPPED_RPM;
    }
    if (!this.armed && this.maxSpin() <= STOPPED_RPM) {
      return false;
    }
    const keep = !this.synth ? this.range : this.range * KEEP_RANGE_FACTOR + KEEP_RANGE_BLOCKS;
    return this.distance <= keep;
  }

  maxSpin() {
    let max = 0.0;
    for (let m = 0; m < MOTORS; m++) {
      max = Math.max(max, this.spinRpm[m]);
    }
    return max;
  }

  /** DroneVoice.apply with Kind SYNTH (want) or NONE (!want); there is no sample voice to fall back to. */
  apply(want, tick) {
    if (!want) {
      this.release();
      return;
    }
    if (this.releasing) {
      this.releasing = false;
      this.control.setActive(true);
      this.publish();
    }
    if (this.synth && this.synthPilotView !== this.pilotView) {
      this.stopInstances();
    }
    if (this.synth && !this.failed) {
      return;
    }
    if (this.synth && !this.noteRestart(tick)) {
      this.synthRetryTick = tick + 600;
      this.stopInstances();
      return;
    }
    this.stopInstances();
    this.startSynth(tick);
  }

  noteRestart(tick) {
    if (tick - this.restartWindowStart > RESTART_WINDOW_TICKS) {
      this.restartWindowStart = tick;
      this.restartCount = 0;
    }
    this.restartCount++;
    return this.restartCount <= MAX_RESTARTS;
  }

  startSynth(tick) {
    if (tick < this.synthRetryTick) {
      return false;
    }
    this.control.setActive(true);
    this.publish();
    this.sink.startSynth(this.seed);
    this.synth = true;
    this.synthPilotView = this.pilotView;
    this.failed = false;
    return true;
  }

  /** DroneVoice.frame: distance fade of a voice heard from outside, every rendered frame. */
  frame(px, py, pz, lx, ly, lz) {
    if (this.pilotView || !this.synth) {
      return;
    }
    if (!this.releasing) {
      const dx = lx - px;
      const dy = ly - py;
      const dz = lz - pz;
      const gain = SoundReach.attenuation(Math.sqrt(dx * dx + dy * dy + dz * dz), this.range);
      if (gain !== this.distanceGain) {
        this.distanceGain = gain;
        this.control.setGain(this.baseGain * gain);
        this.publish();
      }
    }
  }

  release() {
    if (!this.synth) {
      this.releasing = false;
      return;
    }
    if (!this.releasing) {
      this.releasing = true;
      this.control.setActive(false);
      this.publish();
      return;
    }
    this.stopInstances();
    this.releasing = false;
  }

  stopInstances() {
    if (this.synth) {
      this.sink.stopSynth();
    }
    this.synth = false;
  }

  publish() {
    this.control.publish();
    this.sink.dirty = true;
  }
}

export class DroneAudio {
  /** @param {import('./model/AirframeSpec.js?v=d12a0862').AirframeSpec} airframe */
  constructor(airframe) {
    this.airframe = airframe;
    let timbre = MotorTimbre.DEFAULT;
    let reach = SoundReach.REFERENCE;
    try {
      let analysis = null;
      try {
        analysis = buildAnalysis(airframe);
      } catch (e) {
        analysis = null;
      }
      timbre = MotorTimbre.of(airframe, analysis);
      reach = SoundReach.of(airframe, timbre);
    } catch (e) {
      timbre = MotorTimbre.DEFAULT;
      reach = SoundReach.REFERENCE;
    }
    this.timbre = timbre;
    this.reach = reach;
    const rpmMax = airframe && Number.isFinite(airframe.omegaMax) ? airframe.omegaMax * 60.0 / (2.0 * Math.PI) : 0.0;
    const seed = Math.floor(Math.random() * 0x7fffffff) | 1;
    this.dirty = false;
    this.voice = new DroneVoice(timbre, reach, seed, rpmMax, this);
    this.volume = 1.0;
    this.ctx = null;
    this.master = null;
    this.node = null;
    this.samples = new Map();
    this.lastBeep = new Map();
    this.ready = null;
    this.tick = 0;
    this.tickClock = 0.0;
    this.lastUpdate = -1.0;
    this.listenerKnown = false;
    this.listenerX = 0.0;
    this.listenerY = 0.0;
    this.listenerZ = 0.0;
    this.listenerVx = 0.0;
    this.listenerVy = 0.0;
    this.listenerVz = 0.0;
    this.warned = false;
    this.onVisibility = () => this.visibilityChanged();
  }

  /** Creates the AudioContext, the motor worklet and loads the beep samples. Call from a user gesture; repeat calls resume. */
  start() {
    if (this.ctx) {
      this.resume();
      return this.ready;
    }
    const AC = typeof globalThis !== 'undefined' ? (globalThis.AudioContext || globalThis.webkitAudioContext) : null;
    if (typeof AC !== 'function') {
      return Promise.resolve();
    }
    let ctx = null;
    try {
      ctx = new AC({ latencyHint: 'interactive', sampleRate: 48000 });
    } catch (e) {
      try {
        ctx = new AC();
      } catch (e2) {
        this.warn('no AudioContext', e2);
        return Promise.resolve();
      }
    }
    this.ctx = ctx;
    try {
      this.master = ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(ctx.destination);
    } catch (e) {
      this.warn('audio graph', e);
      this.closeContext();
      return Promise.resolve();
    }
    this.resume();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibility);
    }
    this.ready = this.setup(ctx).catch((e) => this.warn('audio setup', e));
    return this.ready;
  }

  async setup(ctx) {
    const samples = this.loadSamples(ctx);
    await this.loadWorklet(ctx);
    await samples;
  }

  async loadWorklet(ctx) {
    if (!ctx.audioWorklet || typeof AudioWorkletNode !== 'function') {
      return;
    }
    try {
      await ctx.audioWorklet.addModule(WORKLET_URL);
      if (ctx !== this.ctx) {
        return;
      }
      const node = new AudioWorkletNode(ctx, PROCESSOR_NAME, {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: { timbre: MotorTimbre.COMPONENTS.map((k) => this.timbre[k]()) },
      });
      node.port.onmessage = (e) => this.workletMessage(e.data);
      node.onprocessorerror = () => this.workletMessage({ type: 'error', message: 'processorerror' });
      node.connect(this.master);
      this.node = node;
      this.voice.synth = false;
      this.dirty = true;
    } catch (e) {
      this.warn('motor worklet', e);
    }
  }

  loadSamples(ctx) {
    const jobs = Object.entries(BEEPS).map(([name, beep]) => fetch(new URL(beep.file, SOUND_DIR))
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${beep.file} ${r.status}`))))
      .then((data) => new Promise((resolve, reject) => {
        const p = ctx.decodeAudioData(data, resolve, reject);
        if (p && typeof p.then === 'function') p.then(resolve, reject);
      }))
      .then((buffer) => {
        if (ctx === this.ctx) this.samples.set(name, buffer);
      })
      .catch((e) => this.warn(`sample ${beep.file}`, e)));
    return Promise.all(jobs);
  }

  workletMessage(msg) {
    if (msg && msg.type === 'error') {
      this.voice.failed = true;
      this.warn('motor synth', msg.message);
    }
  }

  /** 0..1 master volume of motors and beeps; 0 mutes. */
  setVolume(v) {
    this.volume = Number.isFinite(v) ? clamp(v, 0.0, 1.0) : 0.0;
    if (this.master && this.ctx) {
      try {
        this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.03);
      } catch (e) {
        this.master.gain.value = this.volume;
      }
    }
  }

  /**
   * Every rendered frame, after the sim stepped.
   * @param {import('./model/DroneSim.js?v=6c89bd62').DroneSim} sim
   * @param {{fpv: boolean, x?: number, y?: number, z?: number}} listener
   */
  update(sim, listener) {
    if (!this.node || !sim) {
      return;
    }
    try {
      const now = nowSeconds();
      const dt = this.lastUpdate < 0.0 ? TICK_SECONDS : clamp(now - this.lastUpdate, 0.0, 1.0);
      this.lastUpdate = now;
      this.tickClock += dt;
      let ticks = 0;
      while (this.tickClock >= TICK_SECONDS && ticks < MAX_TICKS_PER_FRAME) {
        this.tickClock -= TICK_SECONDS;
        ticks++;
        this.tickVoice(sim, listener);
      }
      if (this.tickClock >= TICK_SECONDS) {
        this.tickClock = 0.0;
      }
      this.frameVoice(sim, listener);
      this.flush();
    } catch (e) {
      this.warn('audio update', e);
    }
  }

  /** MotorVoices.onDroneTick + tickVoices for the one drone. */
  tickVoice(sim, listener) {
    const voice = this.voice;
    voice.observe(sim);
    const pilotView = !!(listener && listener.fpv);
    this.updateListener(pilotView, listener, voice);
    voice.updateTargets(pilotView, pilotView ? sim : null, this.listenerX, this.listenerY, this.listenerZ,
      this.listenerVx, this.listenerVy, this.listenerVz);
    const want = voice.wantsSound() && this.tick >= voice.synthRetryTick;
    voice.apply(want, this.tick);
    this.tick++;
  }

  /** MotorVoices.updateListener: listener position and its smoothed velocity (the goggles sit on the drone). */
  updateListener(pilotView, listener, voice) {
    let x = voice.x;
    let y = voice.y;
    let z = voice.z;
    if (!pilotView && listener && Number.isFinite(listener.x) && Number.isFinite(listener.y) && Number.isFinite(listener.z)) {
      x = listener.x;
      y = listener.y;
      z = listener.z;
    }
    if (this.listenerKnown) {
      let vx = (x - this.listenerX) / TICK_SECONDS;
      let vy = (y - this.listenerY) / TICK_SECONDS;
      let vz = (z - this.listenerZ) / TICK_SECONDS;
      if (vx * vx + vy * vy + vz * vz > 150.0 * 150.0) {
        vx = 0.0;
        vy = 0.0;
        vz = 0.0;
      }
      this.listenerVx += 0.5 * (vx - this.listenerVx);
      this.listenerVy += 0.5 * (vy - this.listenerVy);
      this.listenerVz += 0.5 * (vz - this.listenerVz);
    }
    this.listenerX = x;
    this.listenerY = y;
    this.listenerZ = z;
    this.listenerKnown = true;
  }

  /** MotorVoices.frameVoices: pilot telemetry every frame, or the distance fade for a listener outside. */
  frameVoice(sim, listener) {
    const voice = this.voice;
    if (!voice.synth) {
      return;
    }
    if (voice.pilotView) {
      if (listener && listener.fpv) {
        voice.pushPilotTelemetry(sim.telemetry);
      }
      return;
    }
    if (listener && Number.isFinite(listener.x) && Number.isFinite(listener.y) && Number.isFinite(listener.z)) {
      const b = sim.body;
      voice.frame(b.px, b.py, b.pz, listener.x, listener.y, listener.z);
    }
  }

  /** Sends the published MotorControl to the worklet (once per frame at most). */
  flush() {
    if (!this.dirty || !this.node) {
      return;
    }
    this.dirty = false;
    const c = this.voice.control;
    this.node.port.postMessage({
      type: 'control',
      rpm: Array.from(c._rpm),
      load: Array.from(c._load),
      wash: c.wash(),
      airflow: c.airflow(),
      doppler: c.doppler(),
      gain: c.gain(),
      brightnessHz: c.brightnessHz(),
      smoothingSeconds: c.smoothingSeconds(),
      active: c.active(),
      onboard: c.onboard(),
      impulseCount: c.impulseCount(),
      impulseStrength: c.impulseStrength(),
    });
  }

  // Sink of DroneVoice: a started sound is a fresh MotorSynth in the worklet, primed with the control published before.
  startSynth(seed) {
    if (!this.node) return;
    this.flush();
    this.node.port.postMessage({ type: 'start', seed });
  }

  stopSynth() {
    if (!this.node) return;
    this.node.port.postMessage({ type: 'stop' });
  }

  /** Plays the mod's sample for 'arm' | 'disarm' | 'crash' | 'low_battery' (BeepPlayer: UI sound, merge window). */
  event(name) {
    const beep = BEEPS[name];
    if (!beep || !this.ctx || !this.master) {
      return;
    }
    try {
      const now = nowSeconds();
      const last = this.lastBeep.get(name);
      if (last !== undefined && now - last < beep.merge) {
        return;
      }
      const buffer = this.samples.get(name);
      if (!buffer) {
        return;
      }
      this.lastBeep.set(name, now);
      const volume = BEEP_VOLUME * beep.volume;
      if (volume <= 0.001) {
        return;
      }
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      const gain = this.ctx.createGain();
      gain.gain.value = Math.min(1.0, volume);
      source.connect(gain);
      gain.connect(this.master);
      source.onended = () => {
        try {
          source.disconnect();
          gain.disconnect();
        } catch (e) {
          // already gone
        }
      };
      source.start();
    } catch (e) {
      this.warn('beep', e);
    }
  }

  /** Stops all sound and releases the AudioContext; start() may be called again afterwards. */
  stop() {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
    if (this.node) {
      try {
        this.node.port.postMessage({ type: 'dispose' });
        this.node.port.onmessage = null;
        this.node.disconnect();
      } catch (e) {
        // already gone
      }
    }
    this.node = null;
    this.closeContext();
    this.samples.clear();
    this.lastBeep.clear();
    this.ready = null;
    this.voice.synth = false;
    this.voice.releasing = false;
    this.lastUpdate = -1.0;
    this.tickClock = 0.0;
    this.listenerKnown = false;
    this.dirty = false;
  }

  closeContext() {
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    if (ctx) {
      try {
        const p = ctx.close();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (e) {
        // already closed
      }
    }
  }

  resume() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'suspended' || (typeof document !== 'undefined' && document.hidden)) {
      return;
    }
    try {
      const p = ctx.resume();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) {
      // not allowed yet: the next start() from a gesture resumes
    }
  }

  visibilityChanged() {
    const ctx = this.ctx;
    if (!ctx) return;
    if (document.hidden) {
      try {
        const p = ctx.suspend();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (e) {
        // ignore
      }
    } else {
      this.resume();
    }
  }

  warn(what, e) {
    if (this.warned) return;
    this.warned = true;
    if (typeof console !== 'undefined') console.warn(`Propwash audio: ${what}:`, e);
  }
}
