// Controller setup dialog of the simulator: device, stick mode, channel map with detection, calibration, throttle mode,
// switch functions and live channel monitor. Works on the profiles of input.js (one per device, kept in localStorage).

import { STICKS, FUNCTIONS, STICK_MODES, KEYBOARD_ID, defaultProfile, channelValue, throttleTravel, looksLikeRadio } from './input.js?v=4b632cf7';
import { t } from './i18n.js?v=f01636b9';

function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

const clone = (o) => JSON.parse(JSON.stringify(o));

export class ControllerSetup {
  /**
   * @param {HTMLDialogElement} dialog
   * @param {import('./input.js?v=4b632cf7').PilotInputSource} input
   */
  constructor(dialog, input) {
    this.dialog = dialog;
    this.input = input;
    this.body = dialog.querySelector('[data-setup-body]');
    this.profile = null;
    this.gamepadId = null;
    this.task = null; // { kind: 'detect' | 'assign' | 'calibrate', … }
    this.raf = 0;
    dialog.addEventListener('close', () => this.stop());
  }

  open() {
    this.input.capture = true;
    this.selectDefault();
    this.render();
    if (!this.dialog.open) this.dialog.showModal();
    const loop = () => {
      this.tick();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.task = null;
    this.input.capture = null;
  }

  pad() {
    if (!this.gamepadId) return null;
    return this.input.gamepads().find((g) => g.id === this.gamepadId) || null;
  }

  selectDefault() {
    const wanted = this.input.store.device;
    const pads = this.input.gamepads();
    if (wanted === KEYBOARD_ID) {
      this.gamepadId = null;
    } else {
      const gp = (wanted && pads.find((p) => p.id === wanted)) || pads.find(looksLikeRadio) || pads[0] || null;
      this.gamepadId = gp ? gp.id : null;
    }
    const gp = this.pad();
    this.profile = gp ? clone(this.input.profileFor(gp)) : null;
  }

  save() {
    const gp = this.pad();
    if (gp && this.profile) {
      this.profile.custom = true;
      this.input.saveProfile(gp, this.profile);
    }
  }

  render() {
    const pads = this.input.gamepads();
    const gp = this.pad();
    const body = this.body;
    body.replaceChildren();

    // Device
    const device = el('select', {
      class: 'su-select',
      'aria-label': t('setup.device'),
      onchange: (e) => {
        const v = e.target.value;
        this.input.select(v === 'auto' ? null : v);
        this.gamepadId = v === KEYBOARD_ID || v === 'auto' ? null : v;
        if (v === 'auto') this.selectDefault();
        const pad = this.pad();
        this.profile = pad ? clone(this.input.profileFor(pad)) : null;
        this.render();
      },
    },
    el('option', { value: 'auto', selected: this.input.store.device == null }, t('setup.auto')),
    pads.map((p) => el('option', { value: p.id, selected: this.input.store.device === p.id }, `${looksLikeRadio(p) ? t('setup.radio') : t('setup.gamepad')}: ${p.id}`)),
    el('option', { value: KEYBOARD_ID, selected: this.input.store.device === KEYBOARD_ID }, t('setup.keyboard')));
    body.append(el('section', { class: 'su-sec' },
      el('h3', null, t('setup.device')),
      device,
      pads.length ? null : el('p', { class: 'su-note' }, t('setup.noPads'))));

    // Stick mode
    const modes = el('div', { class: 'su-modes', role: 'radiogroup', 'aria-label': t('setup.stickMode') });
    for (const m of [1, 2, 3, 4]) {
      const [lh, lv, rh, rv] = STICK_MODES[m];
      modes.append(el('label', { class: `su-mode${this.input.stickMode === m ? ' is-on' : ''}` },
        el('input', {
          type: 'radio', name: 'stickmode', value: String(m), checked: this.input.stickMode === m,
          onchange: () => {
            this.input.stickMode = m;
            const pad = this.pad();
            if (pad && this.profile && this.profile.kind === 'gamepad' && !this.profile.custom) this.profile = clone(defaultProfile(pad, m));
            this.render();
          },
        }),
        el('b', null, `Mode ${m}`),
        el('span', null, `${t(`stick.${lv}`)} / ${t(`stick.${lh}`)} · ${t(`stick.${rv}`)} / ${t(`stick.${rh}`)}`)));
    }
    body.append(el('section', { class: 'su-sec' }, el('h3', null, t('setup.stickMode')), modes,
      el('p', { class: 'su-note' }, t('setup.stickModeNote'))));

    if (!gp || !this.profile) {
      body.append(el('section', { class: 'su-sec' }, el('h3', null, t('setup.keyboard')), el('p', { class: 'su-note' }, t('setup.keyboardHelp'))));
      return;
    }
    const p = this.profile;

    // Live monitor
    this.bars = {};
    const monitor = el('div', { class: 'su-monitor' });
    for (const name of STICKS) {
      const fill = el('span', { class: 'su-bar__fill' });
      const val = el('span', { class: 'su-bar__val' }, '0');
      this.bars[name] = { fill, val };
      monitor.append(el('div', { class: 'su-bar' }, el('span', { class: 'su-bar__name' }, t(`stick.${name}`)), el('span', { class: 'su-bar__track' }, fill), val));
    }
    this.switchLeds = {};
    const leds = el('div', { class: 'su-leds' });
    for (const name of FUNCTIONS) {
      const led = el('span', { class: 'su-led' }, t(`fn.${name}`));
      this.switchLeds[name] = led;
      leds.append(led);
    }
    body.append(el('section', { class: 'su-sec' }, el('h3', null, t('setup.live')), monitor, leds));

    // Channels
    const rows = el('div', { class: 'su-grid' });
    for (const name of STICKS) {
      const ch = p.channels[name];
      const axisSel = el('select', {
        class: 'su-select su-select--small',
        'aria-label': `${t(`stick.${name}`)} ${t('setup.axis')}`,
        onchange: (e) => {
          ch.axis = Number(e.target.value);
          this.save();
        },
      }, gp.axes.map((_, i) => el('option', { value: String(i), selected: ch.axis === i }, `${t('setup.axis')} ${i + 1}`)));
      const inv = el('label', { class: 'su-check' }, el('input', {
        type: 'checkbox', checked: ch.invert,
        onchange: (e) => {
          ch.invert = e.target.checked;
          this.save();
        },
      }), t('setup.invert'));
      const detect = el('button', { class: 'su-btn', type: 'button', onclick: () => this.startDetect(name) }, t('setup.detect'));
      rows.append(el('span', { class: 'su-grid__name' }, t(`stick.${name}`)), axisSel, inv, detect);
    }
    const throttleMode = el('select', {
      class: 'su-select su-select--small',
      'aria-label': t('setup.throttleMode'),
      onchange: (e) => {
        p.throttleMode = e.target.value;
        this.save();
      },
    },
    el('option', { value: 'full', selected: p.throttleMode === 'full' }, t('setup.throttleFull')),
    el('option', { value: 'upper', selected: p.throttleMode === 'upper' }, t('setup.throttleUpper')));
    body.append(el('section', { class: 'su-sec' },
      el('h3', null, t('setup.channels')),
      rows,
      el('div', { class: 'su-row' }, el('span', null, t('setup.throttleMode')), throttleMode),
      el('div', { class: 'su-row' },
        el('button', { class: 'su-btn su-btn--accent', type: 'button', onclick: () => this.startCalibration() }, t('setup.calibrate')),
        el('span', { class: 'su-note' }, p.calibrated ? t('setup.calibrated') : t('setup.notCalibrated')))));

    // Switches
    const sw = el('div', { class: 'su-grid su-grid--switch' });
    for (const name of FUNCTIONS) {
      const src = p.switches[name];
      const desc = !src ? t('setup.unassigned')
        : src.type === 'axis' ? `${t('setup.axis')} ${src.index + 1}: ${src.from.toFixed(2)} … ${Math.min(1, src.to).toFixed(2)}`
          : `${t('setup.button')} ${src.index + 1}${src.toggle ? ` (${t('setup.toggle')})` : ''}`;
      sw.append(
        el('span', { class: 'su-grid__name' }, t(`fn.${name}`)),
        el('span', { class: 'su-grid__desc' }, desc),
        el('button', { class: 'su-btn', type: 'button', onclick: () => this.startAssign(name) }, t('setup.assign')),
        el('button', {
          class: 'su-btn su-btn--quiet', type: 'button',
          onclick: () => {
            p.switches[name] = null;
            this.save();
            this.render();
          },
        }, t('setup.clear')));
    }
    body.append(el('section', { class: 'su-sec' }, el('h3', null, t('setup.switches')), sw,
      el('p', { class: 'su-note' }, t('setup.switchNote'))));

    body.append(el('section', { class: 'su-sec su-sec--end' },
      el('button', {
        class: 'su-btn su-btn--quiet', type: 'button',
        onclick: () => {
          this.input.resetProfile(gp);
          this.profile = clone(this.input.profileFor(gp));
          this.render();
        },
      }, t('setup.defaults'))));

    this.prompt = el('div', { class: 'su-prompt', hidden: true, role: 'status', 'aria-live': 'polite' });
    body.prepend(this.prompt);
  }

  showPrompt(text, buttons = []) {
    if (!this.prompt) return;
    this.prompt.hidden = !text;
    this.prompt.replaceChildren(el('p', null, text), ...buttons);
  }

  snapshot(gp) {
    return { axes: gp.axes.slice(), buttons: gp.buttons.map((b) => b.pressed || b.value > 0.5) };
  }

  startDetect(stick) {
    const gp = this.pad();
    if (!gp) return;
    this.task = { kind: 'detect', stick, rest: this.snapshot(gp) };
    const where = stick === 'throttle' ? t('setup.pushThrottle') : t(`setup.push.${stick}`);
    this.showPrompt(where, [el('button', { class: 'su-btn su-btn--quiet', type: 'button', onclick: () => this.cancelTask() }, t('setup.cancel'))]);
  }

  startAssign(name) {
    const gp = this.pad();
    if (!gp) return;
    this.task = { kind: 'assign', name, rest: this.snapshot(gp) };
    this.showPrompt(t('setup.flip').replace('{fn}', t(`fn.${name}`)),
      [el('button', { class: 'su-btn su-btn--quiet', type: 'button', onclick: () => this.cancelTask() }, t('setup.cancel'))]);
  }

  startCalibration() {
    const gp = this.pad();
    if (!gp) return;
    this.task = { kind: 'calibrate', step: 'center' };
    this.showPrompt(t('setup.calCenter'), [
      el('button', { class: 'su-btn su-btn--accent', type: 'button', onclick: () => this.calibrationNext() }, t('setup.next')),
      el('button', { class: 'su-btn su-btn--quiet', type: 'button', onclick: () => this.cancelTask() }, t('setup.cancel')),
    ]);
  }

  calibrationNext() {
    const gp = this.pad();
    if (!gp || !this.task) return;
    if (this.task.step === 'center') {
      this.task = { kind: 'calibrate', step: 'range', center: gp.axes.slice(), min: gp.axes.slice(), max: gp.axes.slice() };
      this.showPrompt(t('setup.calRange'), [
        el('button', { class: 'su-btn su-btn--accent', type: 'button', onclick: () => this.calibrationNext() }, t('setup.done')),
        el('button', { class: 'su-btn su-btn--quiet', type: 'button', onclick: () => this.cancelTask() }, t('setup.cancel')),
      ]);
      return;
    }
    const { center, min, max } = this.task;
    for (const name of STICKS) {
      const ch = this.profile.channels[name];
      const a = ch.axis;
      if (max[a] - min[a] < 0.2) continue;
      ch.min = min[a];
      ch.max = max[a];
      ch.center = name === 'throttle' && this.profile.throttleMode === 'full' ? (min[a] + max[a]) / 2 : center[a];
    }
    this.profile.calibrated = true;
    this.save();
    this.task = null;
    this.render();
  }

  cancelTask() {
    this.task = null;
    this.showPrompt('');
  }

  tick() {
    const gp = this.pad();
    const p = this.profile;
    if (!gp || !p) return;
    // Live bars
    if (this.bars) {
      for (const name of STICKS) {
        const ch = p.channels[name];
        const raw = gp.axes[ch.axis] ?? 0;
        let v;
        if (name === 'throttle') v = p.throttleMode === 'upper' ? Math.max(0, channelValue(raw, ch)) : throttleTravel(raw, ch);
        else v = channelValue(raw, ch);
        const bar = this.bars[name];
        if (name === 'throttle') {
          bar.fill.style.left = '0%';
          bar.fill.style.width = `${v * 100}%`;
        } else {
          bar.fill.style.left = `${50 + Math.min(0, v) * 50}%`;
          bar.fill.style.width = `${Math.abs(v) * 50}%`;
        }
        bar.val.textContent = name === 'throttle' ? `${Math.round(v * 100)}%` : v.toFixed(2);
      }
      for (const name of FUNCTIONS) {
        const src = p.switches[name];
        let on = false;
        if (src && src.type === 'axis') on = gp.axes[src.index] >= src.from && gp.axes[src.index] <= src.to;
        else if (src) on = !!(gp.buttons[src.index] && (gp.buttons[src.index].pressed || gp.buttons[src.index].value > 0.5));
        this.switchLeds[name].classList.toggle('is-on', on);
      }
    }
    const task = this.task;
    if (!task) return;
    if (task.kind === 'detect') {
      let best = -1;
      let delta = 0;
      gp.axes.forEach((v, i) => {
        const d = v - task.rest.axes[i];
        if (Math.abs(d) > Math.abs(delta)) {
          delta = d;
          best = i;
        }
      });
      if (best >= 0 && Math.abs(delta) > 0.6) {
        const ch = p.channels[task.stick];
        ch.axis = best;
        // Pushed up/right must read positive.
        ch.invert = delta < 0;
        this.save();
        this.task = null;
        this.render();
      }
    } else if (task.kind === 'assign') {
      let found = null;
      gp.buttons.forEach((b, i) => {
        if (!found && (b.pressed || b.value > 0.5) && !task.rest.buttons[i]) found = { type: 'button', index: i, toggle: ['arm', 'angle', 'horizon'].includes(task.name) && !looksLikeRadio(gp) };
      });
      if (!found) {
        gp.axes.forEach((v, i) => {
          const used = STICKS.some((s) => p.channels[s].axis === i);
          if (found || used) return;
          if (Math.abs(v - task.rest.axes[i]) > 0.5) {
            const range = v > 0.33 ? [0.33, 1.01] : v < -0.33 ? [-1.01, -0.33] : [-0.33, 0.33];
            found = { type: 'axis', index: i, from: range[0], to: range[1] };
          }
        });
      }
      if (found) {
        p.switches[task.name] = found;
        this.save();
        this.task = null;
        this.render();
      }
    } else if (task.kind === 'calibrate' && task.step === 'range') {
      gp.axes.forEach((v, i) => {
        task.min[i] = Math.min(task.min[i], v);
        task.max[i] = Math.max(task.max[i], v);
      });
    }
  }
}
