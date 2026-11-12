#!/usr/bin/env node
// The video section of the landing page (#video, owner finding OF-10: “the elements are not interactive”):
//   - the signal slider follows the pointer: it runs from 0 to 100 without steps, the picture changes where the next
//     stage begins; drag with the mouse, with a finger and with the keyboard (arrows step a stage, Home/End go to the
//     ends) in both systems; aria-valuetext names the stage
//   - the cards ANALOG and DIGITAL on the right switch the system like the switch below the picture: a radio group
//     with one radio per card, Tab reaches the checked one, Space/Enter and the arrow keys switch, a click anywhere
//     on a card switches; the active card stands out (accent border and heading), both switches always agree
//   - the picture “Clean HD” is a clean digital picture, not the action cam's recording overlay
//   - headless Chrome at 1280 px, 1728 px Retina (2×) and 390 px (touch), English and German; no script errors
//
//   node tools/test-vlab.mjs [--no-browser]

import fs from 'node:fs';
import path from 'node:path';
import { counter, flag, startBrowser, ROOT, sleep } from './fixtures/cov/browser.mjs';

const { check, finish } = counter('vlab');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// 1. The markup.
const lab = (/<div class="vlab" data-vlab>[\s\S]*?<\/section>/.exec(html) || [''])[0];
check(lab, 'index.html has the video lab');
const range = (/<input[^>]*data-vlab-range[^>]*>/.exec(lab) || [''])[0];
check(/min="0"/.test(range) && /max="100"/.test(range), `the signal slider runs from 0 to 100 (${range})`);
check(!/step="(?!1"|any")/.test(range), 'the slider has no coarse steps');
const cards = (/<div class="vlab__systems"[^>]*>/.exec(lab) || [''])[0];
check(/role="radiogroup"/.test(cards) && /aria-label="Video system"/.test(cards) && /data-de-aria-label="Videosystem"/.test(cards),
  'the cards ANALOG and DIGITAL are a radio group “Video system” / „Videosystem“');
for (const mode of ['analog', 'digital']) {
  const radio = new RegExp(`<div class="vnote[^"]*" data-vnote="${mode}">\\s*<h3><button type="button" class="vnote__pick" role="radio" aria-checked="(true|false)" data-vlab-mode="${mode}"`).exec(lab);
  check(radio, `the ${mode} card has a radio button in its heading`);
}
const clean = (/<div class="vlab__set" data-system="digital"[^>]*>\s*<img [^>]*>/.exec(lab) || [''])[0];
check(clean && !/action-cam/.test(clean), 'the picture “Clean HD” is not the action cam recording (REC overlay)');
check(/src="assets\/img\/osd-flight-1600\.webp"/.test(clean), 'the picture “Clean HD” is the digital FPV picture osd-flight (VTX CH1, LQ/VID 100)');
check(/ alt="Digital video: [^"]{20,}"/.test(clean) && / data-de-alt="Digitales Video: [^"]{20,}"/.test(clean), 'the picture “Clean HD” has a description in English and German');

// 2. In the browser.
const VIEWS = [
  { name: '1280 px', width: 1280, height: 900, deviceScaleFactor: 1, mobile: false },
  { name: '1728 px Retina', width: 1728, height: 1000, deviceScaleFactor: 2, mobile: false },
  { name: '390 px', width: 390, height: 844, deviceScaleFactor: 3, mobile: true },
];

const STATE = `(() => {
  const lab = document.querySelector('[data-vlab]');
  const r = lab.querySelector('[data-vlab-range]');
  const set = [...lab.querySelectorAll('.vlab__set')].find((s) => !s.hidden);
  const imgs = [...set.querySelectorAll('.feed__img')];
  const radios = (sel) => [...lab.querySelectorAll(sel)].map((b) => ({ mode: b.dataset.vlabMode, checked: b.getAttribute('aria-checked'), tab: b.tabIndex }));
  const card = (m) => { const c = lab.querySelector('[data-vnote="' + m + '"]'); const s = getComputedStyle(c); return { active: c.classList.contains('is-active'), border: s.borderTopColor, head: getComputedStyle(c.querySelector('h3 button')).color }; };
  const b = r.getBoundingClientRect();
  return {
    system: set.dataset.system, value: Number(r.value), max: Number(r.max), stage: imgs.findIndex((i) => i.classList.contains('is-active')), stages: imgs.length,
    text: r.getAttribute('aria-valuetext'), pressed: [...lab.querySelectorAll('[data-vlab-ticks]:not([hidden]) button')].map((t) => t.getAttribute('aria-pressed')),
    seg: radios('.seg [data-vlab-mode]'), cards: radios('.vlab__systems [data-vlab-mode]'), analog: card('analog'), digital: card('digital'),
    box: [b.left, b.top, b.width, b.height], focus: document.activeElement === r ? 'range' : (document.activeElement && document.activeElement.dataset.vlabMode) || '',
  };
})()`;

async function drag(tab, view, from, to, box, steps = 12) {
  const y = box[1] + box[3] / 2;
  const x = (f) => box[0] + 11 + (box[2] - 22) * f;
  if (view.mobile) {
    await tab.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x(from), y, id: 1, radiusX: 2, radiusY: 2, force: 1 }] });
    for (let i = 1; i <= steps; i++) {
      await tab.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x(from + (to - from) * i / steps), y, id: 1, radiusX: 2, radiusY: 2, force: 1 }] });
      await sleep(16);
    }
    await tab.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await tab.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x(from), y });
    await tab.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x(from), y, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= steps; i++) {
      await tab.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x(from + (to - from) * i / steps), y, button: 'left', buttons: 1 });
      await sleep(16);
    }
    await tab.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x(to), y, button: 'left', buttons: 0, clickCount: 1 });
  }
  await sleep(250);
}

async function keys(tab, key, code = key) {
  const VK = { ArrowRight: 39, ArrowLeft: 37, ArrowUp: 38, ArrowDown: 40, Home: 36, End: 35, ' ': 32, Enter: 13, Tab: 9 };
  await tab.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: VK[key], nativeVirtualKeyCode: VK[key] });
  if (key === ' ' || key === 'Enter') await tab.send('Input.dispatchKeyEvent', { type: 'char', key, text: key === 'Enter' ? '\r' : ' ' });
  await tab.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: VK[key], nativeVirtualKeyCode: VK[key] });
  await sleep(120);
}

async function press(tab, view, sel, where = 'center') {
  const at = await tab.evaluate(`(() => {
    const n = document.querySelector(${JSON.stringify(sel)});
    n.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = n.getBoundingClientRect();
    return ${where === 'text' ? '{ x: r.left + r.width * 0.6, y: r.bottom - Math.min(14, r.height / 4) }' : '{ x: r.left + r.width / 2, y: r.top + r.height / 2 }'};
  })()`);
  await sleep(150);
  if (view.mobile) await tab.tap(at.x, at.y);
  else await tab.click(at.x, at.y);
  await sleep(150);
}

const agree = (s, mode) => s.system === mode && s.seg.every((r) => (r.mode === mode) === (r.checked === 'true'))
  && s.cards.every((r) => (r.mode === mode) === (r.checked === 'true')) && s[mode].active && !s[mode === 'analog' ? 'digital' : 'analog'].active;

if (!flag('--no-browser')) {
  const browser = await startBrowser();
  try {
    for (const view of VIEWS) {
      for (const lang of ['en', 'de']) {
        const where = `${lang} ${view.name}`;
        const tab = await browser.page({ lang });
        await tab.send('Emulation.setDeviceMetricsOverride', view);
        await tab.send('Emulation.setTouchEmulationEnabled', { enabled: view.mobile, maxTouchPoints: view.mobile ? 5 : 1 });
        await tab.open('/', { width: view.width, lang, ready: "document.readyState === 'complete'" });
        await tab.send('Emulation.setDeviceMetricsOverride', view);

        // Cards: a click on the text of a card switches the system; the switch below the picture follows.
        await press(tab, view, `[data-vnote="digital"] p[lang="${lang}"]`, 'text');
        let s = await tab.evaluate(STATE);
        check(agree(s, 'digital'), `${where}: ${view.mobile ? 'a tap' : 'a click'} on the DIGITAL card switches to digital (${s.system}, seg ${JSON.stringify(s.seg)}, cards ${JSON.stringify(s.cards)})`);
        check(s.digital.border !== s.analog.border && s.digital.head !== s.analog.head, `${where}: the active card stands out (border ${s.digital.border} vs ${s.analog.border})`);
        await press(tab, view, '[data-vnote="analog"]', 'center');
        s = await tab.evaluate(STATE);
        check(agree(s, 'analog'), `${where}: ${view.mobile ? 'a tap' : 'a click'} on the ANALOG card switches back to analog`);
        await press(tab, view, '.seg [data-vlab-mode="digital"]');
        s = await tab.evaluate(STATE);
        check(agree(s, 'digital'), `${where}: the switch below the picture switches the cards too`);
        await press(tab, view, '.seg [data-vlab-mode="analog"]');

        // Keyboard on the cards: Tab reaches the checked card, arrows and Space switch.
        if (!view.mobile) {
          await tab.evaluate("document.querySelector('.vlab__systems [aria-checked=\"true\"]').focus(), true");
          await keys(tab, 'ArrowDown');
          s = await tab.evaluate(STATE);
          check(agree(s, 'digital') && s.focus === 'digital', `${where}: arrow down on the cards switches to digital and moves the focus (${s.focus})`);
          check(s.cards.filter((r) => r.tab === 0).length === 1 && s.cards.find((r) => r.tab === 0).mode === 'digital', `${where}: only the checked card is in the tab order`);
          await keys(tab, 'ArrowUp');
          s = await tab.evaluate(STATE);
          check(agree(s, 'analog'), `${where}: arrow up switches back to analog`);
          await tab.evaluate("document.querySelector('.vlab__systems [data-vlab-mode=\"digital\"]').focus(), true");
          await keys(tab, ' ');
          s = await tab.evaluate(STATE);
          check(agree(s, 'digital'), `${where}: Space on the DIGITAL card switches to digital`);
          await tab.evaluate("document.querySelector('.vlab__systems [data-vlab-mode=\"analog\"]').focus(), true");
          await keys(tab, 'Enter');
          s = await tab.evaluate(STATE);
          check(agree(s, 'analog'), `${where}: Enter on the ANALOG card switches to analog`);
        }

        for (const mode of ['analog', 'digital']) {
          await press(tab, view, `.seg [data-vlab-mode="${mode}"]`);
          await tab.evaluate("document.querySelector('[data-vlab-range]').scrollIntoView({ block: 'center', behavior: 'instant' }), true");
          await sleep(200);
          s = await tab.evaluate(STATE);
          const last = s.stages - 1;
          check(s.value === 0 && s.stage === 0, `${where} ${mode}: starts at strong signal (value ${s.value}, stage ${s.stage})`);
          // Half way: the thumb follows the pointer instead of jumping back to the nearest step.
          await drag(tab, view, 0, 0.45, s.box);
          let t = await tab.evaluate(STATE);
          check(t.value >= 35 && t.value <= 55, `${where} ${mode}: dragging half way leaves the thumb half way (${t.value})`);
          check(t.stage === Math.min(last, Math.floor(t.value * s.stages / 100)), `${where} ${mode}: the picture is the stage under the thumb (${t.stage})`);
          await drag(tab, view, t.value / 100, 1, s.box);
          t = await tab.evaluate(STATE);
          check(t.value >= 97 && t.stage === last, `${where} ${mode}: dragging to the end shows the last stage (value ${t.value}, stage ${t.stage} of ${last})`);
          check(t.pressed[last] === 'true' && t.text && t.text.length > 2, `${where} ${mode}: the stage button and aria-valuetext follow (${t.text})`);
          await drag(tab, view, 1, 0, s.box);
          t = await tab.evaluate(STATE);
          check(t.value <= 3 && t.stage === 0, `${where} ${mode}: dragging back shows the first stage again (value ${t.value}, stage ${t.stage})`);
          // Keyboard.
          await tab.evaluate("document.querySelector('[data-vlab-range]').focus(), true");
          await keys(tab, 'ArrowRight');
          t = await tab.evaluate(STATE);
          check(t.stage === 1, `${where} ${mode}: arrow right goes one stage on (stage ${t.stage}, value ${t.value})`);
          await keys(tab, 'End');
          t = await tab.evaluate(STATE);
          check(t.stage === last && t.value === 100, `${where} ${mode}: End goes to the last stage (stage ${t.stage}, value ${t.value})`);
          await keys(tab, 'ArrowLeft');
          t = await tab.evaluate(STATE);
          check(t.stage === last - 1, `${where} ${mode}: arrow left goes one stage back (stage ${t.stage})`);
          await keys(tab, 'Home');
          t = await tab.evaluate(STATE);
          check(t.stage === 0 && t.value === 0, `${where} ${mode}: Home goes back to strong signal`);
          await keys(tab, 'ArrowLeft');
          t = await tab.evaluate(STATE);
          check(t.stage === 0 && t.value === 0, `${where} ${mode}: arrow left at the start stays there`);
          // Stage buttons put the thumb into their stage.
          await press(tab, view, `[data-vlab-ticks="${mode}"] button:last-child`);
          t = await tab.evaluate(STATE);
          check(t.stage === last && Math.min(last, Math.floor(t.value * s.stages / 100)) === last, `${where} ${mode}: the last stage button moves the thumb into its stage (value ${t.value})`);
        }
        check(!tab.errors.length, `${where}: no script errors (${tab.errors.slice(0, 3).join('; ')})`);
        await tab.close();
      }
    }
  } finally {
    await browser.close();
  }
}

finish(`slider without steps, cards as a radio group, clean digital picture${flag('--no-browser') ? '' : ', in headless Chrome at 1280, 1728 (2×) and 390 px (touch), en/de: mouse, touch and keyboard in both systems'}`);
