// FPV simulator page: flies the drone of a configurator share code (sim/#PW2… or #PW1-…, else the default preset) on the
// training map with Propwash's flight model (model/, a port of the mod's sim package), its tune (rates, PIDs, filters,
// camera angle) and the pilot's radio, gamepad or keyboard.

import { loadCatalog } from '../configurator/data.js?v=f1d2acbd';
import { codeFromHash } from '../configurator/sharecode.js?v=024bd980';
import { droneUptilt } from '../configurator/fpv.js?v=76cdbbe6';
import { AirframeSpec } from './model/AirframeSpec.js?v=0d4a93ac';
import { FlightControllerConfig } from './model/FlightControllerConfig.js?v=d9c99f71';
import { SimTuning } from './model/SimTuning.js?v=30961ab0';
import { DroneSim } from './model/DroneSim.js?v=523318a3';
import { StabMode } from './model/StabMode.js?v=ef37a80a';
import { ArmBlocker } from './model/ArmBlocker.js?v=3bfdfa7f';
import { SimEventType } from './model/SimEventType.js?v=e546d059';
import { parseGlb, VoxelWorld } from './world.js?v=3d604f11';
import { Flight } from './flight.js?v=a29918a7';
import { SimScene } from './scene.js?v=05eee6eb';
import { Osd } from './osd.js?v=eac48f7a';
import { PilotInputSource } from './input.js?v=4b632cf7';
import { ControllerSetup } from './setup.js?v=16d6d233';
import { loadDroneModel } from './drone-model.js?v=c6ea11cb';
import { DroneAudio } from './audio.js?v=707480ba';
import { BatteryState } from './model/BatteryState.js?v=de4ddff2';
import { t, lang, loadTexts } from './i18n.js?v=ce7dd41e';

const MAP_URL = new URL('../../data/sim/map.glb', import.meta.url);
const DEFAULT_PRESET = 'justmoreparts:deadcat5_6s';
// Start pad: open floor at the north end of the map, facing south down the course (heading 0 = +z).
const SPAWN = { x: -2.5, z: -50.0, heading: 0.0 };
const VIEWS = ['fpv', 'los'];
const BUILD_FIELDS = ['frame', 'stack', 'motor', 'prop', 'video', 'battery'];

const $ = (sel) => document.querySelector(sel);

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function loadingText(text) {
  const node = $('[data-loading]');
  if (node) node.textContent = text;
}

/** The drone to fly: decoded share code from the address, else the default preset. */
function droneContent(catalog) {
  const code = codeFromHash(location.hash);
  let notice = null;
  if (code) {
    const result = catalog.decode(code);
    if (result.ok) return { content: result.content, code, notice };
    notice = t('ui.badCode');
  }
  const id = catalog.presetContent(DEFAULT_PRESET) ? DEFAULT_PRESET : catalog.presets[0].id;
  const content = catalog.presetContent(id);
  content.name = catalog.presetName(id, lang() === 'de' ? 'de_de' : 'en_us');
  return { content, code: null, notice };
}

/** Craft name for the OSD: the drone's own name, else the name of the preset it is, else its frame. */
function craftName(catalog, content) {
  const key = lang() === 'de' ? 'de_de' : 'en_us';
  if (content.name && content.name.trim()) return content.name.trim();
  const accessories = (b) => JSON.stringify(Object.entries(b.accessories || {}).sort());
  const same = (a, b) => BUILD_FIELDS.every((f) => a[f] === b[f]) && accessories(a) === accessories(b);
  const preset = catalog.presets.find((p) => same(p.build, content.build));
  return preset ? catalog.presetName(preset.id, key) : catalog.partName(content.build.frame, key);
}

function buildSim(catalog, content) {
  const build = content.build;
  const airframe = AirframeSpec.fromBuild(build, catalog);
  if (!airframe) return null;
  const tune = catalog.effectiveTune(content.tune || {}, build);
  const config = FlightControllerConfig.fromTune(tune, airframe);
  const tuning = new SimTuning();
  // A crash does not disarm the drone in the simulator.
  tuning.crashDisarm = false;
  const sim = new DroneSim(airframe, config, tuning, (Date.now() & 0x7fffffff) | 1);
  const view = catalog.cameraView(build);
  const rig = view ? view.rig : null;
  const uptilt = rig ? droneUptilt(rig.range, content.tune || {}) : 25;
  return { sim, airframe, rig, uptilt, build };
}

// The note about the physics (sim/index.html, [data-about]): open at the start, closed with its button, Escape or the
// first arming (it never covers a flight), opened again with "Physics" in the bar.
const about = {
  panel: null,
  button: null,
  set(open) {
    if (!this.panel) return;
    this.panel.hidden = !open;
    this.button.setAttribute('aria-expanded', String(open));
  },
};

// The hints under the bar sit below it however many rows it wraps into (narrow screens).
function trackBarHeight() {
  const bar = $('.sim__bar');
  const sim = $('.sim');
  if (!bar || !sim) return;
  const update = () => sim.style.setProperty('--bar-h', `${Math.ceil(bar.getBoundingClientRect().height)}px`);
  update();
  if (typeof ResizeObserver === 'function') new ResizeObserver(update).observe(bar);
  else window.addEventListener('resize', update);
}

function wireAbout() {
  about.panel = $('[data-about]');
  about.button = $('[data-open-about]');
  if (!about.panel || !about.button) return;
  about.set(true);
  about.button.addEventListener('click', () => about.set(about.panel.hidden));
  $('[data-about-close]').addEventListener('click', () => {
    about.set(false);
    about.button.focus();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !about.panel.hidden && !document.querySelector('dialog[open]')) about.set(false);
  });
}

async function boot() {
  try {
    await loadTexts();
  } catch {
    // A translated page without its texts shows the English ones.
  }
  wireAbout();
  trackBarHeight();
  if (!webglAvailable()) {
    loadingText(t('ui.noWebgl'));
    return;
  }
  let catalog;
  let primitives;
  try {
    const [c, buffer] = await Promise.all([
      loadCatalog(),
      fetch(MAP_URL).then((r) => {
        if (!r.ok) throw new Error(`map ${r.status}`);
        return r.arrayBuffer();
      }),
    ]);
    catalog = c;
    primitives = parseGlb(buffer).primitives;
  } catch (e) {
    console.error(e);
    loadingText(t('ui.loadFailed'));
    return;
  }

  let { content, code, notice } = droneContent(catalog);
  let made = null;
  try {
    made = buildSim(catalog, content);
  } catch (e) {
    console.error(e);
  }
  if (!made) {
    notice = t('ui.cannotFly');
    content = catalog.presetContent(DEFAULT_PRESET) || catalog.presetContent(catalog.presets[0].id);
    made = buildSim(catalog, content);
  }
  const { sim, airframe, rig, uptilt, build } = made;
  const world = new VoxelWorld(primitives);
  const flight = new Flight(sim, world);
  const spawnBottom = world.surfaceBelow(SPAWN.x, world.max[1] + 5, SPAWN.z);
  const spawn = { x: SPAWN.x, y: spawnBottom, z: SPAWN.z, heading: SPAWN.heading };
  // Line-of-sight pilot: a few metres behind the start pad.
  const home = { x: spawn.x, y: spawnBottom, z: spawn.z - 4.0 };
  flight.place(spawn.x, spawn.y, spawn.z, spawn.heading);

  const stage = $('[data-stage]');
  const scene = new SimScene(stage, {
    world, primitives, airframe, rig, uptiltDeg: uptilt, prop: catalog.part(build.prop), paint: content.paint || {},
  });
  const osd = new Osd($('[data-osd]'));
  const input = new PilotInputSource();
  const setup = new ControllerSetup($('[data-setup]'), input);
  loadDroneModel(build, content.paint || {}, catalog).then((group) => {
    if (group) scene.setModel(group);
  }).catch((e) => console.error(e));

  // Motor sound (the mod's synth) and beeps. The page tries to start the sound at once; browsers often hold it back until
  // the first click or key press on the page (radio and gamepad input does not count), so any click or key starts it,
  // a click on "Sound" while it waits starts it instead of switching it off, and a hint says so until it plays. The
  // sound switch and the volume are remembered in the browser.
  const audio = new DroneAudio(airframe);
  let soundOn = true;
  let volume = 1.0;
  try {
    soundOn = localStorage.getItem('propwash-sim-sound') !== 'off';
    const stored = Number(localStorage.getItem('propwash-sim-volume'));
    if (localStorage.getItem('propwash-sim-volume') != null && Number.isFinite(stored)) volume = Math.max(0, Math.min(1, stored));
  } catch { /* storage unavailable */ }
  const store = (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch { /* storage unavailable */ }
  };
  const soundButton = $('[data-sound]');
  const volumeSlider = $('[data-volume]');
  const soundHint = $('[data-sound-hint]');
  // Sound wanted but the browser has not let it play yet.
  const soundWaiting = () => soundOn && !(audio.ctx && audio.ctx.state === 'running');
  let shownWaiting = null;
  const showWaiting = () => {
    const waiting = soundWaiting() && !document.hidden;
    if (waiting === shownWaiting) return;
    shownWaiting = waiting;
    soundButton.classList.toggle('is-waiting', waiting);
    soundHint.hidden = !waiting;
  };
  const showSound = () => {
    soundButton.setAttribute('aria-pressed', String(soundOn));
    volumeSlider.value = String(Math.round(volume * 100));
    volumeSlider.style.setProperty('--fill', `${Math.round(volume * 100)}%`);
    volumeSlider.classList.toggle('is-off', !soundOn);
    showWaiting();
  };
  let watchedContext = null;
  const startAudio = () => {
    if (!soundOn) return;
    audio.start().then(showWaiting).catch((e) => console.error(e));
    if (audio.ctx && audio.ctx !== watchedContext) {
      watchedContext = audio.ctx;
      watchedContext.addEventListener('statechange', showWaiting);
    }
  };
  showSound();
  soundButton.addEventListener('click', () => {
    if (soundWaiting()) {
      // Waiting for the browser: this click starts the sound, it does not switch it off.
      startAudio();
      return;
    }
    soundOn = !soundOn;
    store('propwash-sim-sound', soundOn ? 'on' : 'off');
    showSound();
    if (soundOn) startAudio();
  });
  volumeSlider.addEventListener('input', () => {
    volume = Number(volumeSlider.value) / 100;
    // Turning the volume up switches the sound on again.
    if (volume > 0 && !soundOn) {
      soundOn = true;
      store('propwash-sim-sound', 'on');
      audio.start().catch((e) => console.error(e));
    }
    store('propwash-sim-volume', String(volume));
    showSound();
  });
  // Let go of the slider: the arrow keys fly the drone again instead of moving it.
  volumeSlider.addEventListener('change', () => volumeSlider.blur());
  // Any click, tap or key on the page lets the browser play sound (the sound button handles its own clicks).
  const gesture = (e) => {
    if (e.target && e.target.closest && e.target.closest('[data-sound]')) return;
    startAudio();
  };
  for (const type of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(type, gesture, true);
  startAudio();
  let lowBeepAt = 0;

  const name = craftName(catalog, content);
  $('[data-drone-name]').textContent = name;
  const back = $('[data-back]');
  if (code) back.href = `../configurator/#${code}`;
  if (notice) {
    const n = $('[data-notice]');
    n.textContent = notice;
    n.hidden = false;
    setTimeout(() => { n.hidden = true; }, 8000);
  }

  // State shown on the OSD
  const state = {
    flightTime: 0,
    message: '',
    messageUntil: 0,
    messageColor: '#fff',
    view: 'fpv',
    paused: false,
  };
  const say = (text, seconds = 1.6, color = '#fff') => {
    state.message = text;
    state.messageUntil = performance.now() / 1000 + seconds;
    state.messageColor = color;
  };

  const setView = (v) => {
    state.view = v;
    scene.setView(v);
    for (const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view === v));
  };
  // After a reset or flip the drone arms again as soon as the throttle is low while the arm switch stays on (no need to
  // flip the switch off and on); the keyboard's throttle goes back to zero.
  let rearm = false;
  const afterPlace = () => {
    rearm = true;
    input.kb.throttle = 0;
  };
  const resetDrone = () => {
    flight.place(spawn.x, spawn.y, spawn.z, spawn.heading, { rearm: true });
    sim.setBatteryCharge(1.0);
    state.flightTime = 0;
    afterPlace();
    say(t('msg.reset'));
  };
  const flipUpright = () => {
    if (sim.arming.armed) return;
    const b = sim.body;
    const heading = b.headingRad();
    const ground = world.surfaceBelow(flight.x, flight.y + 0.5, flight.z);
    flight.place(flight.x, Number.isFinite(ground) ? ground + 0.02 : flight.bottom() + 0.2, flight.z,
      Number.isFinite(heading) ? heading : 0, { rearm: true });
    afterPlace();
  };

  for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => setView(b.dataset.view));
  $('[data-reset]').addEventListener('click', resetDrone);
  $('[data-open-setup]').addEventListener('click', () => setup.open());
  $('[data-setup-close]').addEventListener('click', () => $('[data-setup]').close());
  const help = $('[data-help]');
  $('[data-open-help]').addEventListener('click', () => help.showModal());
  $('[data-help-close]').addEventListener('click', () => help.close());
  window.addEventListener('keydown', (e) => {
    if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.code === 'KeyC' && !e.repeat) setView(VIEWS[(VIEWS.indexOf(state.view) + 1) % VIEWS.length]);
    if (e.code === 'F1' || (e.code === 'Slash' && e.shiftKey)) {
      e.preventDefault();
      if (help.open) help.close(); else help.showModal();
    }
  });
  window.addEventListener('gamepadconnected', () => updateDevice());
  window.addEventListener('gamepaddisconnected', () => updateDevice());
  const deviceChip = $('[data-device]');
  let lastDevice = '';
  function updateDevice(device) {
    const d = device || input.device;
    if (!d) return;
    const label = d.kind === 'keyboard' ? t('device.keyboard') : `${t(d.kind === 'radio' ? 'device.radio' : 'device.gamepad')}: ${d.id.replace(/\s*\(.*\)\s*$/, '')}`;
    if (label !== lastDevice) {
      deviceChip.textContent = label;
      lastDevice = label;
    }
  }

  // For debugging in the browser console.
  window.propwashSim = { sim, flight, world, scene, input, airframe, audio };
  $('[data-loading]').remove();
  document.body.classList.add('is-ready');
  setView('fpv');

  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    const paused = document.hidden || $('[data-setup]').open;
    const armed = sim.arming.armed;
    const read = input.update(dt, armed);
    updateDevice(read.device);
    if (!paused) {
      // Reset and flip first, so this frame's arm switch already goes through the re-arm gate below.
      if (read.actions.has('reset')) resetDrone();
      if (read.actions.has('flip')) flipUpright();
      const pi = flight.input;
      pi.roll = read.sticks.roll;
      pi.pitch = read.sticks.pitch;
      pi.yaw = read.sticks.yaw;
      pi.throttle = read.sticks.throttle;
      pi.mode = StabMode[read.mode] || StabMode.ACRO;
      let armSwitch = read.armSwitch;
      if (rearm) {
        if (!read.armSwitch || sim.arming.armed) rearm = false;
        else if (read.sticks.throttle > sim.config.armThrottleMax) armSwitch = false;
      }
      pi.armSwitch = armSwitch;
      pi.linkOk = true;
      const events = flight.frame(dt);
      for (const e of events) {
        const type = e.type;
        if (type === SimEventType.CRASH) say(t('msg.crash'), 1.8, '#ff5a3c');
        else if (type === SimEventType.ARMED) say(t('msg.armed'), 1.0);
        if (type === SimEventType.ARMED) about.set(false);
        else if (type === SimEventType.ARM_BLOCKED) say(t('msg.blocked'), 1.6, '#ffbb00');
        if (type === SimEventType.ARMED) audio.event('arm');
        else if (type === SimEventType.DISARMED) audio.event('disarm');
        else if (type === SimEventType.CRASH || type === SimEventType.ESC_BURNED) audio.event('crash');
        else if (type === SimEventType.BATTERY_LOW || type === SimEventType.BATTERY_CRITICAL || type === SimEventType.PACK_DEPLETED) {
          audio.event('low_battery');
          lowBeepAt = now;
        }
      }
      if (sim.arming.armed) state.flightTime += dt;
      // Like the mod: the low battery beep repeats while armed, every 3 s when low, every second when critical or empty.
      const battery = sim.batteryState;
      if (sim.arming.armed && battery !== BatteryState.OK) {
        const every = battery === BatteryState.LOW ? 3000 : 1000;
        if (now - lowBeepAt >= every) {
          audio.event('low_battery');
          lowBeepAt = now;
        }
      }
    }
    // Square curve: the slider follows perceived loudness, the lower half stays usable.
    audio.setVolume(paused || !soundOn ? 0 : volume * volume);
    showWaiting();
    audio.update(sim, state.view === 'fpv' ? { fpv: true } : { fpv: false, x: home.x, y: home.y + 1.62, z: home.z });
    document.body.classList.toggle('is-armed', sim.arming.armed);
    const tm = sim.telemetry;
    const rpmMax = airframe.omegaMax * 60 / (2 * Math.PI);
    const rpm = Array.from(tm.motorRpm, (r) => (rpmMax > 0 ? Math.min(1, Math.abs(r) / rpmMax) : 0));
    const o = flight.result.orientation;
    scene.render({ x: flight.x, y: flight.y, z: flight.z }, { x: o.x, y: o.y, z: o.z, w: o.w }, rpm, dt, home);
    const blockers = [];
    if (!sim.arming.armed) {
      for (const b of ArmBlocker.values()) if (b.isSet(tm.armBlockers)) blockers.push(b.name);
    }
    osd.draw({
      telemetry: tm,
      armed: sim.arming.armed,
      mode: tm.mode ? tm.mode.name : 'ACRO',
      blockers,
      flightTime: state.flightTime,
      message: state.message,
      messageUntil: state.messageUntil,
      messageColor: state.messageColor,
      now: now / 1000,
      altitude: flight.bottom() - spawn.y,
      crosshair: state.view === 'fpv',
      craftName: name,
    });
    requestAnimationFrame(frame);
  };
  // The first frame needs the orientation of a step; run one empty step.
  flight.frame(0);
  requestAnimationFrame(frame);
}

boot();
