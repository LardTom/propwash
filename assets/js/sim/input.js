// Pilot input of the simulator: RC transmitters over USB (EdgeTX/OpenTX "USB Joystick (HID)"), gamepads and the keyboard,
// with the defaults of Propwash FPV (README "Controls" and "Radio, gamepad and keyboard setup"):
//   radio:    AETR channel order, AUX1 = arm, AUX2 = flight mode (low Acro, middle Horizon, high Angle), full-travel throttle
//   gamepad:  sticks of the stick mode (Mode 2: throttle and yaw left), throttle "upper half", right shoulder = arm,
//             left shoulder = angle on/off, Back = reset, left face button = flip upright
//   keyboard: W/S throttle, A/D yaw, arrows pitch/roll, Z arm, R cycle flight mode, Backspace reset, U flip upright;
//             starts in Angle mode; stick response 7/s, roll/pitch/yaw limit 0.6, throttle 0.5/s (down twice as fast)
//
// Sticks: roll, pitch, yaw in -1..1 (positive = right, nose down/forward, right), throttle 0..1.
// Profiles (channel axes, inversion, calibration, switches) are kept per device id in localStorage.

export const STICKS = Object.freeze(['throttle', 'yaw', 'pitch', 'roll']);
export const FUNCTIONS = Object.freeze(['arm', 'angle', 'horizon', 'reset', 'flip']);
const STORE_KEY = 'propwash-sim-input';
const KEYBOARD_ID = 'keyboard';

// Which stick sits where in each stick mode: [left horizontal, left vertical, right horizontal, right vertical].
export const STICK_MODES = Object.freeze({
  1: ['yaw', 'pitch', 'roll', 'throttle'],
  2: ['yaw', 'throttle', 'roll', 'pitch'],
  3: ['roll', 'pitch', 'yaw', 'throttle'],
  4: ['roll', 'throttle', 'yaw', 'pitch'],
});

const KEYBOARD = Object.freeze({ response: 7.0, rollPitchLimit: 0.6, yawLimit: 0.6, throttleRate: 0.5 });

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const data = raw ? JSON.parse(raw) : null;
    if (data && typeof data === 'object') return { stickMode: 2, device: null, profiles: {}, ...data };
  } catch { /* storage unavailable */ }
  return { stickMode: 2, device: null, profiles: {} };
}

function saveStore(store) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch { /* storage unavailable */ }
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** A gamepad that is not in the browser's standard layout and has at least five axes is treated as a radio. */
export function looksLikeRadio(gp) {
  return gp.mapping !== 'standard' && gp.axes.length >= 5;
}

/** Default profile of a device (radio: AETR + AUX1 arm + AUX2 mode; gamepad: stick mode layout). */
export function defaultProfile(gp, stickMode) {
  if (looksLikeRadio(gp)) {
    const ch = (axis, invert = false) => ({ axis, invert, min: -1, center: 0, max: 1 });
    return {
      kind: 'radio',
      throttleMode: 'full',
      channels: { roll: ch(0), pitch: ch(1), throttle: ch(2), yaw: ch(3) },
      switches: {
        arm: { type: 'axis', index: 4, from: 0.25, to: 1.01 },
        angle: { type: 'axis', index: 5, from: 0.5, to: 1.01 },
        horizon: { type: 'axis', index: 5, from: -0.5, to: 0.5 },
        reset: null,
        flip: null,
      },
      calibrated: false,
    };
  }
  const layout = STICK_MODES[stickMode] || STICK_MODES[2];
  const axisOf = (name) => layout.indexOf(name);
  // Standard mapping: axes 0/1 left stick x/y, 2/3 right stick x/y; y is -1 up, so the vertical sticks are inverted.
  const ch = (name) => {
    const axis = axisOf(name);
    return { axis, invert: axis === 1 || axis === 3, min: -1, center: 0, max: 1 };
  };
  return {
    kind: 'gamepad',
    throttleMode: 'upper',
    channels: { roll: ch('roll'), pitch: ch('pitch'), throttle: ch('throttle'), yaw: ch('yaw') },
    switches: {
      arm: { type: 'button', index: 5, toggle: true },
      angle: { type: 'button', index: 4, toggle: true },
      horizon: null,
      reset: { type: 'button', index: 8, toggle: false },
      flip: { type: 'button', index: 2, toggle: false },
    },
    calibrated: true,
  };
}

/** Calibrated channel value: -1..1 around the captured center (throttle: 0..1 over its full travel unless "upper"). */
export function channelValue(raw, ch) {
  let v;
  if (raw >= ch.center) v = ch.max - ch.center > 1e-3 ? (raw - ch.center) / (ch.max - ch.center) : 0;
  else v = ch.center - ch.min > 1e-3 ? (raw - ch.center) / (ch.center - ch.min) : 0;
  v = clamp(v, -1, 1);
  return ch.invert ? -v : v;
}

/** Raw throttle 0..1 over the whole travel min..max (radio throttle sticks rest at the bottom, not the center). */
export function throttleTravel(raw, ch) {
  const span = ch.max - ch.min;
  let v = span > 1e-3 ? (raw - ch.min) / span : 0;
  v = clamp(v, 0, 1);
  return ch.invert ? 1 - v : v;
}

export class PilotInputSource {
  constructor() {
    this.store = loadStore();
    this.keys = new Set();
    this.kb = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
    this.sticks = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
    this.armSwitch = false;
    this.mode = 'ACRO';
    this.keyboardMode = 'ANGLE';
    this.toggles = { arm: false, angle: false, horizon: false };
    this.lastButtons = {};
    this.events = [];
    this.device = null; // { id, kind, gamepad? }
    this.capture = null; // set by the setup wizard: raw readings are not turned into flight input
    this.onKeyDown = (e) => this.keyDown(e);
    this.onKeyUp = (e) => this.keys.delete(e.code);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => this.keys.clear());
  }

  get stickMode() {
    return this.store.stickMode || 2;
  }

  set stickMode(mode) {
    this.store.stickMode = mode;
    // Gamepad profiles follow the stick mode unless they were mapped by hand.
    for (const [id, p] of Object.entries(this.store.profiles)) {
      if (p.kind === 'gamepad' && !p.custom) delete this.store.profiles[id];
    }
    saveStore(this.store);
  }

  /** Connected controllers. */
  gamepads() {
    const list = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    return list.filter((gp) => gp.connected !== false);
  }

  profileFor(gp) {
    let p = this.store.profiles[gp.id];
    if (!p) p = defaultProfile(gp, this.stickMode);
    return p;
  }

  saveProfile(gp, profile) {
    this.store.profiles[gp.id] = profile;
    saveStore(this.store);
  }

  resetProfile(gp) {
    delete this.store.profiles[gp.id];
    saveStore(this.store);
  }

  /** Selects a device: KEYBOARD_ID or a gamepad id; null = automatic (last used controller, else keyboard). */
  select(id) {
    this.store.device = id;
    saveStore(this.store);
    this.toggles = { arm: false, angle: false, horizon: false };
    this.armSwitch = false;
  }

  activeGamepad() {
    const pads = this.gamepads();
    const wanted = this.store.device;
    if (wanted === KEYBOARD_ID) return null;
    if (wanted) {
      const gp = pads.find((p) => p.id === wanted);
      if (gp) return gp;
    }
    // Automatic: prefer a radio, then any gamepad.
    return pads.find(looksLikeRadio) || pads[0] || null;
  }

  keyDown(e) {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (!this.keys.has(e.code)) {
      if (e.code === 'KeyZ') this.events.push('kb-arm');
      if (e.code === 'KeyR') this.events.push('kb-mode');
      if (e.code === 'Numpad1') this.events.push('kb-acro');
      if (e.code === 'Numpad2') this.events.push('kb-angle');
      if (e.code === 'Numpad3') this.events.push('kb-horizon');
      if (e.code === 'Backspace') this.events.push('reset');
      if (e.code === 'KeyU') this.events.push('flip');
    }
    this.keys.add(e.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Backspace'].includes(e.code)) e.preventDefault();
  }

  dir(pos, neg) {
    return (this.keys.has(pos) ? 1 : 0) - (this.keys.has(neg) ? 1 : 0);
  }

  /**
   * Reads the active device. Returns { sticks, armSwitch, mode, actions: Set('reset'|'flip'), device }.
   * @param {number} dt seconds since the last call
   */
  update(dt, armed) {
    const actions = new Set();
    const gp = this.activeGamepad();
    const pending = this.events;
    this.events = [];
    for (const e of pending) {
      if (e === 'reset' || e === 'flip') actions.add(e);
    }
    if (gp && !this.capture) {
      this.device = { id: gp.id, kind: this.profileFor(gp).kind, gamepad: gp };
      this.readGamepad(gp, actions);
      // Keyboard switches still work alongside a controller.
      for (const e of pending) this.keyboardSwitch(e, true);
    } else {
      this.device = { id: KEYBOARD_ID, kind: 'keyboard' };
      for (const e of pending) this.keyboardSwitch(e, false);
      this.readKeyboard(dt, armed);
    }
    return { sticks: this.sticks, armSwitch: this.armSwitch, mode: this.mode, actions, device: this.device };
  }

  keyboardSwitch(e, withController) {
    if (e === 'kb-arm') {
      if (withController) this.toggles.arm = !this.toggles.arm;
      else this.armSwitch = !this.armSwitch;
    }
    const cycle = ['ACRO', 'ANGLE', 'HORIZON'];
    if (e === 'kb-mode') this.keyboardMode = cycle[(cycle.indexOf(this.keyboardMode) + 1) % 3];
    if (e === 'kb-acro') this.keyboardMode = 'ACRO';
    if (e === 'kb-angle') this.keyboardMode = 'ANGLE';
    if (e === 'kb-horizon') this.keyboardMode = 'HORIZON';
    if (e.startsWith('kb-') && e !== 'kb-arm') this.keyboardOverride = true;
  }

  readKeyboard(dt, armed) {
    const k = this.kb;
    const blend = 1.0 - Math.exp(-KEYBOARD.response * dt);
    const rollT = this.dir('ArrowRight', 'ArrowLeft') * KEYBOARD.rollPitchLimit;
    const pitchT = this.dir('ArrowUp', 'ArrowDown') * KEYBOARD.rollPitchLimit;
    const yawT = this.dir('KeyD', 'KeyA') * KEYBOARD.yawLimit;
    const thr = this.dir('KeyW', 'KeyS');
    k.roll += (rollT - k.roll) * blend;
    k.pitch += (pitchT - k.pitch) * blend;
    k.yaw += (yawT - k.yaw) * blend;
    const rate = thr < 0 ? KEYBOARD.throttleRate * 2 : KEYBOARD.throttleRate;
    k.throttle = clamp(k.throttle + thr * rate * dt, 0, 1);
    if (!armed && !this.armSwitch && thr === 0) k.throttle = Math.max(0, k.throttle - dt);
    const settle = (v) => (Math.abs(v) < 0.001 ? 0 : v);
    this.sticks = { roll: settle(k.roll), pitch: settle(k.pitch), yaw: settle(k.yaw), throttle: k.throttle };
    this.mode = this.keyboardMode;
  }

  /** Raw value of a switch source (true = active). */
  switchActive(gp, src, name) {
    if (!src) return name === 'arm' || name === 'angle' || name === 'horizon' ? this.toggles[name] : false;
    if (src.type === 'axis') {
      const v = gp.axes[src.index];
      return v != null && v >= src.from && v <= src.to;
    }
    const b = gp.buttons[src.index];
    const pressed = !!(b && (b.pressed || b.value > 0.5));
    const key = `${name}:${src.index}`;
    const was = !!this.lastButtons[key];
    this.lastButtons[key] = pressed;
    if (src.toggle) {
      if (pressed && !was) this.toggles[name] = !this.toggles[name];
      return this.toggles[name];
    }
    return pressed;
  }

  readGamepad(gp, actions) {
    const p = this.profileFor(gp);
    const read = (name) => {
      const ch = p.channels[name];
      const raw = ch && gp.axes[ch.axis] != null ? gp.axes[ch.axis] : 0;
      return ch ? channelValue(raw, ch) : 0;
    };
    const roll = read('roll');
    const pitch = read('pitch');
    const yaw = read('yaw');
    let throttle;
    const tch = p.channels.throttle;
    const traw = tch && gp.axes[tch.axis] != null ? gp.axes[tch.axis] : 0;
    if (p.throttleMode === 'upper') throttle = Math.max(0, channelValue(traw, tch));
    else throttle = throttleTravel(traw, tch);
    this.sticks = { roll, pitch, yaw, throttle };
    const s = p.switches;
    this.armSwitch = this.switchActive(gp, s.arm, 'arm') || (!s.arm && this.toggles.arm);
    const angle = this.switchActive(gp, s.angle, 'angle');
    const horizon = this.switchActive(gp, s.horizon, 'horizon');
    this.mode = angle ? 'ANGLE' : horizon ? 'HORIZON' : 'ACRO';
    if (this.keyboardOverride && !s.angle && !s.horizon) this.mode = this.keyboardMode;
    const was = this.lastActions || {};
    const now = {};
    for (const name of ['reset', 'flip']) {
      now[name] = this.switchActive(gp, s[name], name);
      if (now[name] && !was[name]) actions.add(name);
    }
    this.lastActions = now;
  }
}

export { KEYBOARD_ID };
