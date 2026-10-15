#!/usr/bin/env node
// Picking in the configurator's 3D view, in headless Chrome (English, reduced motion, so nothing turns by itself):
//   - desktop (1280 × 900, mouse), several builds (presets and a build with both accessory mounts in use): for every
//     part category and accessory mount on the drone, the part's projected centre (or, when another part covers it,
//     the centre of a face of it that is in front) gets a hover – label with category and part name, pointer cursor,
//     the part drawn highlighted – and a click: the parts tab shows that category with its current part card focused
//     and in view. In the paint tab every paint slot on the drone the same way: label with the slot name, click marks
//     the slot's row as the target, focuses its swatches and scrolls it into view.
//   - a drag and a long press that start on a part select nothing; the FPV camera view picks the spinning prop discs
//   - a part without a paint model (removed from the model file on its way to the page) gives the "can't be painted"
//     hint instead of a paint target
//   - phone (390 × 844, touch): the hint fits beside the toolbar, a tap picks in both tabs, a one-finger drag and a
//     two-finger pinch do not, the page does not scroll sideways
//   - no console errors or uncaught exceptions anywhere
//
//   node tools/test-configurator-pick.mjs [--chrome <path>] [--verbose]
//
// The page hands its viewer to scripts with the document event "propwash:viewer"; its pickPoints() gives the canvas
// points to click.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, CHROME, serve, launch, cdp, sleep } from './headless-chrome.mjs';
import { createCatalog } from '../assets/js/configurator/data.js';
import { entry } from '../assets/js/configurator/i18n.js';

const catalog = createCatalog(JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/data/configurator/catalog.json'), 'utf8')));
const DESKTOP = { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false };
const PHONE = { width: 390, height: 844, deviceScaleFactor: 3, mobile: true };
const HOVER_WAIT_MS = 160;

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const verbose = process.argv.includes('--verbose');

let checks = 0;
const failures = [];
function check(ok, message) {
  checks++;
  if (!ok) failures.push(message);
  else if (verbose) console.log(`  ok  ${message}`);
}

const en = (key) => entry(key)[0];
const plain = (text) => String(text || '').replace(/\s+/g, ' ').trim();
const partName = (id) => plain(catalog.partName(id, 'en'));
const kindOf = (category, mount) => (category === 'accessory' && mount ? `${en('categories.accessory')} · ${en(`roles.${mount}`)}` : en(`categories.${category}`));
const groupKey = (p) => `${p.category}${p.mount ? `/${p.mount}` : ''}`;

/** Share code of a preset's parts with other accessories (mount → part id) and no paint. */
function codeWith(presetId, accessories) {
  const build = { ...catalog.presetBuild(presetId), accessories };
  return catalog.encode({ build, paint: null, tune: null, osd: null, name: null });
}

/** One point per key, the projected centre where it is in front, else the first face point found. */
function onePer(points, key) {
  const out = new Map();
  for (const p of points) {
    const k = key(p);
    if (!out.has(k) || (p.center && !out.get(k).center)) out.set(k, p);
  }
  return [...out.entries()];
}

async function main() {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-pick-'));
  const { child, ws } = await launch(arg('--chrome', CHROME), profile);
  const browser = cdp(ws);
  const errors = [];
  try {
    await browser.ready;
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => browser.send(method, params, sessionId);
    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text}: ${expression.slice(0, 120)}`);
      return r.result.value;
    };
    browser.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error' || p.type === 'assert') errors.push(`console.${p.type}: ${p.args.map((a) => a.value ?? a.description).join(' ')}`);
    });
    browser.on('Runtime.exceptionThrown', (p) => errors.push(`exception: ${p.exceptionDetails.exception?.description || p.exceptionDetails.text}`));
    browser.on('Log.entryAdded', (p) => {
      if (p.entry.level === 'error' && !/favicon/.test(p.entry.url || '')) errors.push(`log: ${p.entry.text} ${p.entry.url || ''}`);
    });

    // Model files on their way to the page: the battery named here loses its paint models (a part that can't be painted).
    let stripPaintOf = null;
    browser.on('Fetch.requestPaused', async (p) => {
      try {
        const { body, base64Encoded } = await send('Fetch.getResponseBody', { requestId: p.requestId });
        let text = base64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body;
        const model = JSON.parse(text);
        if (stripPaintOf && model.id === stripPaintOf) {
          for (const name of Object.keys(model.variants)) if (name === 'paint' || name.endsWith('_paint')) delete model.variants[name];
          text = JSON.stringify(model);
        }
        await send('Fetch.fulfillRequest', {
          requestId: p.requestId, responseCode: 200, body: Buffer.from(text).toString('base64'),
          responseHeaders: [{ name: 'content-type', value: 'application/json' }],
        });
      } catch (e) {
        errors.push(`fetch interception: ${e.message}`);
        await send('Fetch.continueRequest', { requestId: p.requestId }).catch(() => {});
      }
    });

    await send('Runtime.enable');
    await send('Log.enable');
    await send('Page.enable');
    await send('Page.bringToFront');
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: "try { localStorage.setItem('propwash-lang', 'en'); } catch (e) {} document.addEventListener('propwash:viewer', (e) => { window.__viewer = e.detail; });",
    });
    await send('Fetch.enable', { patterns: [{ urlPattern: '*/assets/data/configurator/models/*', requestStage: 'Response' }] });

    const canvasRect = () => evaluate(`(() => {
      const r = document.querySelector('[data-viewer-canvas] canvas').getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height, sx: scrollX, sy: scrollY };
    })()`);
    const viewerToTop = () => evaluate("(document.querySelector('[data-viewer]').scrollIntoView({ block: 'start', behavior: 'instant' }), scrollBy({ top: -70, behavior: 'instant' }), true)");
    const ui = () => evaluate(`(() => {
      const active = document.activeElement;
      const slot = document.querySelector('[data-slots] .slot.is-active');
      const targets = [...document.querySelectorAll('[data-paint-row].is-target')].map((r) => r.dataset.paintRow);
      const label = document.querySelector('[data-pick-label]');
      const hint = document.querySelector('[data-pick-hint]');
      const inView = (node) => {
        if (!node) return false;
        const r = node.getBoundingClientRect();
        const list = node.closest('.part-list');
        const l = list ? list.getBoundingClientRect() : { top: -1e9, bottom: 1e9 };
        const header = document.querySelector('.site-header').getBoundingClientRect().bottom;
        return r.top >= Math.max(header, l.top) - 1 && r.bottom <= Math.min(innerHeight, l.bottom) + 1;
      };
      const option = active && active.matches('[role="option"]') ? active : null;
      const row = active && active.closest('[data-paint-row]');
      return {
        category: slot ? slot.dataset.cat : null,
        option: option ? { id: option.dataset.id, mount: option.dataset.mount, selected: option.getAttribute('aria-selected') === 'true', inView: inView(option) } : null,
        targets,
        focusRow: row ? row.dataset.paintRow : null,
        focusRadio: !!(active && active.matches('[role="radio"]')),
        rowInView: targets.length ? inView(document.querySelector('[data-paint-row="' + targets[0] + '"]')) : false,
        label: label.hidden ? null : { kind: label.querySelector('.viewer__pick-kind')?.textContent || '', name: label.querySelector('.viewer__pick-name')?.textContent || '', note: label.querySelector('.viewer__pick-note')?.textContent || '' },
        cursor: document.querySelector('[data-viewer-canvas] canvas').style.cursor,
        hint: hint.hidden ? null : { text: hint.textContent, note: hint.classList.contains('is-note') },
      };
    })()`);
    const setCategory = (category) => evaluate(`(document.querySelector('[data-slots] [data-cat="${category}"]').click(), true)`);
    const setTab = (tab) => evaluate(`(document.querySelector('#tab-${tab}').click(), true)`);
    const mouse = (type, x, y, pressed) => send('Input.dispatchMouseEvent', {
      type, x, y, button: type === 'mouseMoved' && !pressed ? 'none' : 'left', buttons: pressed ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1, pointerType: 'mouse',
    });
    const touch = (type, points) => send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) });

    async function open(url, viewport, label) {
      await send('Emulation.setDeviceMetricsOverride', viewport);
      await send('Emulation.setTouchEmulationEnabled', { enabled: viewport.mobile, maxTouchPoints: viewport.mobile ? 5 : 1 });
      await send('Page.navigate', { url: 'about:blank' });
      await sleep(100);
      await send('Page.navigate', { url });
      const start = Date.now();
      while (!(await evaluate(`(() => {
        const cfg = document.querySelector('[data-cfg]');
        const v = window.__viewer;
        return !!(cfg && cfg.getAttribute('aria-busy') === 'false' && v && v.current() && v.current().assembly.pieces.length);
      })()`))) {
        if (Date.now() - start > 30000) throw new Error(`${label}: configurator did not finish loading within 30 s`);
        await sleep(200);
      }
      await evaluate('document.fonts.ready.then(() => true)');
      await sleep(700);
      await viewerToTop();
      await sleep(150);
    }

    /** Client point of a pick point; null when it is outside the window. */
    async function client(p) {
      const r = await canvasRect();
      const x = r.x + p.x;
      const y = r.y + p.y;
      const vp = await evaluate('({ w: innerWidth, h: innerHeight })');
      return x > 0 && y > 0 && x < vp.w && y < vp.h ? { x, y, px: x + r.sx, py: y + r.sy } : null;
    }

    async function hoverAway() {
      await mouse('mouseMoved', 2, 2, false);
      await sleep(HOVER_WAIT_MS);
    }

    // Views of the drone (keys on the canvas from the reset view): parts hidden in one view are picked in another.
    const VIEWS = [[], [['ArrowDown', 11]], [['ArrowLeft', 26]], [['ArrowLeft', 26], ['ArrowDown', 11]], [['ArrowRight', 13], ['ArrowUp', 5]]];
    async function turn(view) {
      await evaluate(`(() => {
        const canvas = document.querySelector('[data-viewer-canvas] canvas');
        const press = (key, n) => { for (let i = 0; i < n; i++) canvas.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); };
        press('0', 1);
        ${view.map(([key, n]) => `press('${key}', ${n});`).join('\n')}
        return true;
      })()`);
      await sleep(150);
    }

    /** Runs test(key, point) once for every key found in any view; checks that every wanted key was found. */
    async function inEveryView(label, wanted, keyOf, test) {
      const done = new Set();
      for (const view of VIEWS) {
        if ([...wanted].every((k) => done.has(k))) break;
        await turn(view);
        await viewerToTop();
        for (const [key, p] of onePer((await evaluate('window.__viewer.pickPoints()')).filter((pt) => keyOf(pt)), keyOf)) {
          if (done.has(key)) continue;
          done.add(key);
          await test(key, p);
        }
      }
      for (const k of wanted) check(done.has(k), `${label}: a visible point picks ${k}`);
      await turn([]);
      await hoverAway();
      return done;
    }

    // ---- Parts tab: every category and mount on the drone ----
    async function partsTab(label, build) {
      await setTab('parts');
      const wanted = ['frame', 'stack', 'motor', 'prop', 'video', 'battery', ...Object.keys(build.accessories || {}).map((m) => `accessory/${m}`)];
      return inEveryView(label, wanted, groupKey, async (key, p) => {
        await setCategory(p.category === 'frame' ? 'battery' : 'frame');
        await viewerToTop();
        await hoverAway();
        const at = await client(p);
        if (!at) {
          check(false, `${label}: ${key} point outside the window`);
          return;
        }
        const clip = { x: at.px - 6, y: at.py - 6, width: 12, height: 12, scale: 1 };
        const shotBefore = await send('Page.captureScreenshot', { format: 'png', clip });
        await mouse('mouseMoved', at.x, at.y, false);
        await sleep(HOVER_WAIT_MS);
        let s = await ui();
        const expectedId = p.category === 'accessory' ? build.accessories[p.mount] : build[p.category];
        check(s.label && plain(s.label.kind) === kindOf(p.category, p.mount) && plain(s.label.name) === partName(expectedId),
          `${label}: hover on ${key} shows “${kindOf(p.category, p.mount)} / ${partName(expectedId)}” (got ${JSON.stringify(s.label)})`);
        check(s.cursor === 'pointer', `${label}: pointer cursor over ${key}`);
        const shotHover = await send('Page.captureScreenshot', { format: 'png', clip });
        check(shotHover.data !== shotBefore.data, `${label}: ${key} drawn highlighted under the pointer`);
        await mouse('mousePressed', at.x, at.y, true);
        await mouse('mouseReleased', at.x, at.y, false);
        await sleep(120);
        s = await ui();
        check(s.category === p.category, `${label}: click on ${key} opens category ${p.category} (got ${s.category})`);
        check(s.option && s.option.selected && s.option.id === expectedId && (!p.mount || s.option.mount === p.mount),
          `${label}: click on ${key} focuses the current part card ${expectedId} (got ${JSON.stringify(s.option)})`);
        check(s.option && s.option.inView, `${label}: the focused ${key} card is scrolled into view`);
      });
    }

    // ---- Paint tab: every paint slot on the drone ----
    async function paintTab(label) {
      await setTab('paint');
      const rows = await evaluate("[...document.querySelectorAll('[data-paint-row]:not(.is-off)')].map((r) => r.dataset.paintRow)");
      return inEveryView(label, rows, (p) => p.paintSlot, async (slot, p) => {
        await viewerToTop();
        const at = await client(p);
        if (!at) {
          check(false, `${label}: ${slot} point outside the window`);
          return;
        }
        await mouse('mouseMoved', at.x, at.y, false);
        await sleep(HOVER_WAIT_MS);
        let s = await ui();
        const name = plain(catalog.paintSlotName(slot, 'en'));
        check(s.label && plain(s.label.kind) === name, `${label}: hover on paint slot ${slot} shows “${name}” (got ${JSON.stringify(s.label)})`);
        await mouse('mousePressed', at.x, at.y, true);
        await mouse('mouseReleased', at.x, at.y, false);
        await sleep(120);
        s = await ui();
        check(s.targets.length === 1 && s.targets[0] === slot, `${label}: click on ${slot} marks its paint row (got ${s.targets})`);
        check(s.focusRow === slot && s.focusRadio, `${label}: click on ${slot} focuses a swatch of its row (got ${s.focusRow})`);
        check(s.rowInView, `${label}: the ${slot} row is scrolled into view`);
      });
    }

    // ---- Drag and long press: no selection ----
    async function noSelectByDrag(label) {
      await setTab('parts');
      await viewerToTop();
      const before = await evaluate('window.__viewer.pickPoints()');
      const [key, p] = onePer(before, groupKey).find(([k]) => k === 'motor');
      await setCategory('frame');
      await viewerToTop();
      let at = await client(p);
      await mouse('mouseMoved', at.x, at.y, false);
      await mouse('mousePressed', at.x, at.y, true);
      for (let i = 1; i <= 6; i++) {
        await mouse('mouseMoved', at.x + i * 10, at.y + i * 3, true);
        await sleep(16);
      }
      await mouse('mouseReleased', at.x + 60, at.y + 18, false);
      await sleep(150);
      let s = await ui();
      check(s.category === 'frame', `${label}: a drag from ${key} selects nothing (category ${s.category})`);
      const turned = await evaluate('window.__viewer.pickPoints()');
      check(JSON.stringify(turned) !== JSON.stringify(before), `${label}: the drag turned the drone`);
      // Long press without moving.
      const again = onePer(turned, groupKey).find(([k]) => k === key);
      if (again) {
        await viewerToTop();
        at = await client(again[1]);
        await mouse('mouseMoved', at.x, at.y, false);
        await mouse('mousePressed', at.x, at.y, true);
        await sleep(700);
        await mouse('mouseReleased', at.x, at.y, false);
        await sleep(150);
        s = await ui();
        check(s.category === 'frame', `${label}: a long press on ${key} selects nothing (category ${s.category})`);
      }
      await turn([]);
      await hoverAway();
    }

    // ---- Desktop builds ----
    const builds = [
      { label: 'default preset', url: `${base}/configurator/`, build: catalog.presetBuild('justmoreparts:deadcat5_6s') },
      { label: 'freestyle + top and bottom accessories', code: codeWith('propwash:freestyle', { top: 'propwash:action_cam_light', bottom: 'propwash:led_strip' }) },
      { label: 'whoop + gripper', code: codeWith('propwash:whoop', { bottom: 'propwash:gripper' }) },
      { label: 'cinewhoop 3.5″', code: codeWith('justmoreparts:cinewhoop35_6s', {}) },
    ];
    for (const b of builds) {
      if (b.code) {
        b.url = `${base}/configurator/#${b.code}`;
        b.build = catalog.decode(b.code).content.build;
      }
      const frame = catalog.part(b.build.frame);
      for (const mount of Object.keys(b.build.accessories || {})) {
        check(frame.data.accessory_mounts.includes(mount), `${b.label}: frame has the ${mount} mount`);
      }
      await open(b.url, DESKTOP, b.label);
      const hint = (await ui()).hint;
      check(hint && hint.text === 'Click a part to select it', `${b.label}: hint in the parts tab (got ${JSON.stringify(hint)})`);
      const picked = await partsTab(b.label, b.build);
      const painted = await paintTab(b.label);
      check((await ui()).hint?.text === 'Click a part to paint it', `${b.label}: hint in the paint tab`);
      await noSelectByDrag(b.label);
      await setTab('tune');
      check((await ui()).hint === null, `${b.label}: no hint in the tuning tab`);
      await viewerToTop();
      const [, p] = onePer(await evaluate('window.__viewer.pickPoints()'), groupKey)[0];
      const at = await client(p);
      await mouse('mouseMoved', at.x, at.y, false);
      await sleep(HOVER_WAIT_MS);
      const s = await ui();
      check(s.label === null && s.cursor === '', `${b.label}: no hover label or pointer cursor in the tuning tab`);
      await hoverAway();
      console.log(`${b.label}: ${picked.size} categories/mounts and ${painted.size} paint slots picked (${[...painted].join(', ')})`);
    }

    // ---- FPV camera view: the spinning prop discs pick the props ----
    {
      const label = 'FPV camera';
      await open(`${base}/configurator/?view=camera#${codeWith('justmoreparts:cinewhoop35_6s', {})}`, DESKTOP, label);
      await setTab('parts');
      await setCategory('frame');
      await viewerToTop();
      const points = await evaluate('window.__viewer.pickPoints()');
      check(points.length > 0 && points.every((pt) => pt.category === 'prop'), `${label}: only the props can be picked (${points.map(groupKey)})`);
      const disc = points[0];
      if (disc) {
        const at = await client(disc);
        await mouse('mouseMoved', at.x, at.y, false);
        await mouse('mousePressed', at.x, at.y, true);
        await mouse('mouseReleased', at.x, at.y, false);
        await sleep(120);
        check((await ui()).category === 'prop', `${label}: click on a blur disc opens the props`);
        await setTab('paint');
        await viewerToTop();
        const at2 = await client(disc);
        await mouse('mouseMoved', at2.x, at2.y, false);
        await mouse('mousePressed', at2.x, at2.y, true);
        await mouse('mouseReleased', at2.x, at2.y, false);
        await sleep(120);
        const s = await ui();
        check(s.targets[0] === disc.paintSlot && /^prop_/.test(disc.paintSlot), `${label}: click on a blur disc targets its prop slot ${disc.paintSlot} (got ${s.targets})`);
      }
      await hoverAway();
    }

    // ---- A part that can't be painted ----
    {
      const label = 'battery without paint model';
      const build = catalog.presetBuild('propwash:freestyle');
      stripPaintOf = build.battery;
      await open(`${base}/configurator/#${codeWith('propwash:freestyle', {})}`, DESKTOP, label);
      await setTab('paint');
      await viewerToTop();
      const points = await evaluate('window.__viewer.pickPoints()');
      const battery = points.find((pt) => pt.category === 'battery');
      check(battery && battery.paintSlot === null, `${label}: the battery has no paint slot (got ${battery && battery.paintSlot})`);
      if (battery) {
        const at = await client(battery);
        await mouse('mouseMoved', at.x, at.y, false);
        await sleep(HOVER_WAIT_MS);
        let s = await ui();
        check(s.label && s.label.note === 'can’t be painted', `${label}: hover label says it can't be painted (got ${JSON.stringify(s.label)})`);
        await mouse('mousePressed', at.x, at.y, true);
        await mouse('mouseReleased', at.x, at.y, false);
        await sleep(120);
        s = await ui();
        check(s.hint && s.hint.note && plain(s.hint.text) === `${partName(build.battery)} can’t be painted.`, `${label}: click gives the hint (got ${JSON.stringify(s.hint)})`);
        check(s.targets.length === 0, `${label}: no paint row marked`);
      }
      stripPaintOf = null;
      await hoverAway();
    }

    // ---- Phone: taps pick, drags and pinches do not ----
    {
      const label = 'phone';
      const build = catalog.presetBuild('justmoreparts:deadcat5_6s');
      await open(`${base}/configurator/`, PHONE, label);
      let s = await ui();
      check(s.hint && s.hint.text === 'Tap a part to select it', `${label}: touch wording of the hint (got ${JSON.stringify(s.hint)})`);
      const layout = await evaluate(`(() => {
        const box = (sel) => {
          const r = document.querySelector(sel).getBoundingClientRect();
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        };
        return { hint: box('[data-pick-hint]'), canvas: box('[data-viewer-canvas] canvas'),
          others: ['.viewer__tools', '.viewer__modes', '[data-viewer-name]'].map(box), scrollWidth: document.documentElement.scrollWidth };
      })()`);
      const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const { hint: h, canvas: c } = layout;
      check(h.left >= c.left && h.right <= c.right && h.top >= c.top && h.bottom <= c.bottom && !layout.others.some((o) => overlaps(h, o)),
        `${label}: the hint sits in the view, clear of toolbar, view switch and name (${JSON.stringify(layout)})`);
      check(layout.scrollWidth <= PHONE.width, `${label}: no sideways scrolling (${layout.scrollWidth} px)`);
      const groups = onePer(await evaluate('window.__viewer.pickPoints()'), groupKey);
      for (const key of ['frame', 'motor', 'prop', 'battery']) {
        const entryFound = groups.find(([k]) => k === key);
        check(!!entryFound, `${label}: a visible point picks ${key}`);
        if (!entryFound) continue;
        const p = entryFound[1];
        await setCategory(key === 'frame' ? 'battery' : 'frame');
        await viewerToTop();
        const at = await client(p);
        await touch('touchStart', [[at.x, at.y]]);
        await touch('touchEnd', []);
        await sleep(150);
        s = await ui();
        check(s.category === p.category && s.option && s.option.id === build[p.category] && s.option.inView,
          `${label}: tap on ${key} opens its category with the current card in view (got ${s.category}, ${JSON.stringify(s.option)})`);
      }
      const used = await evaluate("getComputedStyle(document.querySelector('[data-pick-hint]')).opacity");
      check(Number(used) === 0, `${label}: the hint fades out after the first pick (opacity ${used})`);
      // One-finger drag and two-finger pinch on a part.
      const [, motor] = groups.find(([k]) => k === 'motor');
      for (const [kind, gesture] of [
        ['drag', async (at) => {
          await touch('touchStart', [[at.x, at.y]]);
          for (let i = 1; i <= 6; i++) { await touch('touchMove', [[at.x + i * 8, at.y + i * 2]]); await sleep(16); }
          await touch('touchEnd', []);
        }],
        ['pinch', async (at) => {
          await touch('touchStart', [[at.x, at.y]]);
          await touch('touchStart', [[at.x, at.y], [at.x + 40, at.y + 10]]);
          for (let i = 1; i <= 5; i++) { await touch('touchMove', [[at.x - i * 6, at.y], [at.x + 40 + i * 6, at.y + 10]]); await sleep(16); }
          await touch('touchEnd', [[at.x + 70, at.y + 10]]);
          await touch('touchEnd', []);
        }],
      ]) {
        await setCategory('frame');
        await viewerToTop();
        const at = await client(motor);
        await gesture(at);
        await sleep(200);
        s = await ui();
        check(s.category === 'frame', `${label}: a ${kind} on a motor selects nothing (category ${s.category})`);
      }
      // Paint tab: tap targets the slot.
      await setTab('paint');
      await viewerToTop();
      const slots = onePer((await evaluate('window.__viewer.pickPoints()')).filter((p) => p.paintSlot), (p) => p.paintSlot);
      for (const [slot, p] of slots.filter(([k]) => ['frame', 'motors', 'battery'].includes(k))) {
        await viewerToTop();
        const at = await client(p);
        await touch('touchStart', [[at.x, at.y]]);
        await touch('touchEnd', []);
        await sleep(150);
        s = await ui();
        check(s.targets[0] === slot && s.focusRow === slot && s.rowInView, `${label}: tap on ${slot} targets its paint row in view (got ${s.targets}, ${s.focusRow})`);
      }
      console.log(`${label}: ${groups.length} categories, ${slots.length} paint slots visible`);
    }
  } finally {
    browser.close();
    child.kill();
    server.close();
    await sleep(300);
    fs.rmSync(profile, { recursive: true, force: true });
  }
  for (const e of errors) failures.push(`page error: ${e}`);
  checks++;
  if (failures.length) {
    console.error(failures.slice(0, 60).join('\n'));
    console.error(`FAIL: ${failures.length} of ${checks} checks failed`);
    process.exit(1);
  }
  console.log(`PASS: ${checks} checks`);
}

main().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
