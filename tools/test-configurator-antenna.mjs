#!/usr/bin/env node
// VTX antennas at the rear of the frame (Propwash 0.6.0: models video/<vtx>_antenna and _antenna_paint, the anchor
// "antenna" of a frame in drone_layout.json, DroneLayout#antenna, DroneAssembly#antenna, PaintPicker):
//   - tools/build-configurator-models.mjs on tools/fixtures/antenna-export (a web export of format 2 cut down to the four
//     core VTX, the files of Propwash c0d4a159f as /propwash webexport writes them) gives every core VTX the variants
//     antenna and antenna_paint (the paint group antenna with the mod's base colour, the default tint of the
//     "_antenna_paint" render definition) next to its video model without an antenna group, and render.json the frames'
//     antenna anchors
//   - the jar path (catalog-build.js: AssetIndex and the model files in the browser) gives the same variant list, textures
//     and colours as the export and the same model files as the build tool
//   - assembly: every frame of the catalog with every core VTX has exactly one antenna piece – role antenna, the VTX's
//     id, part category video, variant antenna, not turned by the camera angle, behind the video unit – at the frame's
//     anchor in drone_layout.json (the mod's values, whoop 0/23.2/9.2 to long range 0/32.5/62) or else at
//     DroneLayout.defaultAntenna (centre; the battery plate, or for a pack under the frame the electronics + 8 mm and at
//     least the lens height; 0.21 × wheelbase to the rear), also for an anchor that is no point; none for a VTX without
//     "_antenna" (older exports, add-on VTX) or without a model, so those are drawn as before
//   - paint: the antenna slot's default colour comes from the antenna model, the slot is offered, a pick on the antenna
//     paints it, a colour on it alone switches the antenna to its paint model; the video unit keeps the camera slot
//   - headless Chrome, English and German, 1280 and 390 px, with the fixture's models and anchors on their way to the
//     page (one core VTX per load): the antenna is drawn at its anchor, a hover and a click on it pick “Video” in the
//     parts tab and the antenna slot in the paint tab, and the camera preview hides it like the video unit
//
//   node tools/test-configurator-antenna.mjs [--no-browser] [--shots <dir>] [--chrome <path>]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, CHROME, serve, launch, cdp, sleep } from './headless-chrome.mjs';
import { createCatalog } from '../assets/js/configurator/data.js';
import { assemble, frameLayout, pieceCategory } from '../assets/js/configurator/assembly.js';
import { resources, modelOf, partModel, hex } from '../assets/js/configurator/catalog-build.js';
import { paintDefaults, paintAvailable, paintTints, groupsOf, pieceSlots, channelTint, rgbOf } from '../assets/js/configurator/paint.js';
import { PAINT_SLOTS } from '../assets/js/configurator/sharecode.js';
import { entry } from '../assets/js/configurator/i18n.js';

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
};
const BROWSER = !argv.includes('--no-browser');
const SHOTS = arg('--shots') ? path.resolve(arg('--shots')) : null;

let checks = 0;
const failures = [];
function check(ok, message) {
  checks++;
  if (!ok) failures.push(message);
  return !!ok;
}
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const near = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

const FIXTURE = path.join(ROOT, 'tools/fixtures/antenna-export');
const FIXTURE_ASSETS = path.join(FIXTURE, 'propwash');
const VTX = ['propwash:analog_nano', 'propwash:analog_race', 'propwash:digital_lite', 'propwash:digital_hd'];
// F-ANTENNA-1: the anchors of the core frames in drone_layout.json (x/y/z in mm).
const CORE_ANCHORS = {
  'propwash:whoop_65': [0, 23.2, 9.2], 'propwash:cinewhoop_3': [0, 24, 34], 'propwash:freestyle_5': [0, 28.5, 50],
  'propwash:race_5': [0, 20, 44], 'propwash:long_range_7': [0, 32.5, 62],
};
const fixtureParts = readJson(path.join(FIXTURE_ASSETS, 'parts.json'));
const fixturePaint = readJson(path.join(FIXTURE_ASSETS, 'assets/propwash/drone_paint.json'));
const fixtureLayout = readJson(path.join(FIXTURE_ASSETS, 'assets/propwash/drone_layout.json'));
const local = (id) => id.split(':')[1];
const paintGroups = (key) => fixturePaint.models[key].map((g) => [g.channel, g.base]);

// ---------------------------------------------------------------------------------------------------------------
// The build tool on the fixture export

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-antenna-'));
execFileSync(process.execPath, [path.join(ROOT, 'tools/build-configurator-models.mjs'), '--export', FIXTURE, '--out', out], { stdio: 'pipe' });
const built = readJson(path.join(out, 'render.json'));
const builtModel = (id) => {
  const file = path.join(out, 'models', 'propwash', 'video', `${local(id)}.json`);
  return fs.existsSync(file) ? readJson(file) : null;
};

for (const id of VTX) {
  const m = builtModel(id);
  if (!check(m, `${id}: model file built from the export`)) continue;
  const v = m.variants;
  const source = readJson(path.join(FIXTURE_ASSETS, `assets/propwash/models/part/video/${local(id)}_antenna.json`));
  check(v.antenna && Array.isArray(v.antenna.el) && v.antenna.el.length === source.elements.length && v.antenna.box.every(Number.isFinite),
    `${id}: variant antenna with the ${source.elements.length} elements of ${local(id)}_antenna (got ${v.antenna ? v.antenna.el.length : 'none'})`);
  check(v.antenna && !v.antenna.groups, `${id}: the plain antenna variant carries no paint groups`);
  check(v.antenna_paint && v.antenna_paint.of === 'antenna' && same(v.antenna_paint.groups, paintGroups(`video/${local(id)}_antenna`)),
    `${id}: variant antenna_paint drawn from antenna with the paint groups ${JSON.stringify(paintGroups(`video/${local(id)}_antenna`))} (got ${JSON.stringify(v.antenna_paint && v.antenna_paint.groups)})`);
  check(v.antenna_paint && v.antenna_paint.tint.every((t) => t === -1 || t === 0), `${id}: antenna_paint tints only its antenna group`);
  check(v.paint && same(v.paint.groups, paintGroups(`video/${local(id)}`)) && v.paint.groups.every(([channel]) => channel === 'camera'),
    `${id}: the video model paints the camera only (got ${JSON.stringify(v.paint && v.paint.groups)})`);
  const def = readJson(path.join(FIXTURE_ASSETS, `assets/propwash/items/drone_render/video/${local(id)}_antenna_paint.json`)).model;
  const tints = v.antenna_paint ? v.antenna_paint.groups.map(([channel, base]) => channelTint(rgbOf(base), built.channels[channel])) : null;
  check(same(tints, def.tints.map((t) => t.default)), `${id}: antenna tints ${tints} = default tints of the export ${def.tints.map((t) => t.default)}`);
}
for (const [key, entryOf] of Object.entries(fixtureLayout.frames)) {
  check(same(built.layouts[`propwash:${key}`].antenna, entryOf.antenna), `render.json: antenna anchor of ${key} from drone_layout.json`);
}
for (const [id, anchor] of Object.entries(CORE_ANCHORS)) check(same(built.layouts[id].antenna, anchor), `render.json: ${id} antenna at ${anchor}`);

// ---------------------------------------------------------------------------------------------------------------
// The jar path: the same files read in the browser (catalog-build.js)

{
  const files = new Map();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, e.name);
      if (e.isDirectory()) walk(file);
      else files.set(path.relative(FIXTURE_ASSETS, file).split(path.sep).join('/'), new Uint8Array(fs.readFileSync(file)));
    }
  };
  walk(path.join(FIXTURE_ASSETS, 'assets'));
  const res = resources(files);
  for (const p of fixtureParts) {
    const m = modelOf({ id: p.id, kind: p.category, basics: { visual: { renderModel: null } } }, res);
    check(same(m.variants, p.model.variants), `jar path ${p.id}: variants ${JSON.stringify(m.variants)} as the export`);
    check(same(m.textures, p.model.textures), `jar path ${p.id}: textures as the export`);
    check(m.paintable === p.paint.paintable_model, `jar path ${p.id}: paintable as the export`);
    const colors = Object.fromEntries(Object.entries(m.baseColors).map(([slot, rgb]) => [slot, hex(rgb)]));
    check(same(colors, p.paint.default_colors), `jar path ${p.id}: colours ${JSON.stringify(colors)} as the export ${JSON.stringify(p.paint.default_colors)}`);
    let model = null;
    try {
      model = partModel(p, res);
    } catch (e) {
      check(false, `jar path ${p.id}: model file (${e.message})`);
    }
    const file = path.join(out, 'models', 'propwash', 'video', `${local(p.id)}.json`);
    check(model && fs.existsSync(file) && `${JSON.stringify(model)}\n` === fs.readFileSync(file, 'utf8'), `jar path ${p.id}: model file byte for byte as the build tool's`);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Assembly and paint with the site's catalog, the fixture's anchors and models

const catalog = createCatalog(readJson(path.join(ROOT, 'assets/data/configurator/catalog.json')));
const siteRender = readJson(path.join(ROOT, 'assets/data/configurator/render.json'));
const render = { ...siteRender, layouts: { ...siteRender.layouts, ...built.layouts } };
const siteModels = new Map();
const siteModel = (id) => {
  if (!siteModels.has(id)) {
    const part = catalog.part(id);
    const file = part && path.join(ROOT, 'assets/data/configurator/models', id.split(':')[0], part.category, `${local(id)}.json`);
    siteModels.set(id, file && fs.existsSync(file) ? readJson(file) : null);
  }
  return siteModels.get(id);
};
const fixtureModels = new Map(VTX.map((id) => [id, builtModel(id)]));
const env = { catalog, render, model: (id) => (fixtureModels.has(id) ? fixtureModels.get(id) : siteModel(id)) };
const oldEnv = { catalog, render: siteRender, model: siteModel };

/** DroneLayout.defaultAntenna of Propwash: centre, plate or electronics + 8 mm (at least the lens), 0.21 × wheelbase back. */
function defaultAntenna(frame) {
  const d = frame.data;
  const lens = d.camera && d.camera.pos;
  const top = d.battery.on_top ? d.battery.plate_mm : Math.max(d.electronics_mm + 8, lens ? lens[1] : 0);
  return [0, top, 0.21 * d.wheelbase_mm];
}

const base = catalog.presetBuild('propwash:freestyle');
let combos = 0;
let fallbacks = 0;
for (const frame of catalog.partsIn('frame')) {
  const fromFile = render.layouts[frame.id] && render.layouts[frame.id].antenna;
  const expected = fromFile || defaultAntenna(frame);
  const layout = frameLayout(frame, catalog, render);
  check(near(layout.antenna, expected), `${frame.id}: layout antenna ${layout.antenna} = ${fromFile ? 'drone_layout.json' : 'defaultAntenna'} ${expected}`);
  if (!fromFile) fallbacks++;
  for (const id of VTX) {
    const label = `${frame.id} + ${id}`;
    const build = { ...base, frame: frame.id, video: id, accessories: {} };
    const a = assemble(build, env);
    const antennas = a.pieces.filter((p) => p.role === 'antenna');
    if (!check(antennas.length === 1, `${label}: one antenna piece (got ${antennas.length})`)) continue;
    const piece = antennas[0];
    const video = a.pieces.find((p) => p.role === 'video');
    check(piece.id === id && piece.variant === 'antenna' && pieceCategory(piece) === 'video', `${label}: antenna of the VTX, variant antenna, category video`);
    check(near(piece.position, expected), `${label}: antenna at ${piece.position}, expected ${expected}`);
    check(!piece.tiltX && !piece.spinY && !piece.stretchX, `${label}: antenna not turned by the camera angle (tilt ${piece.tiltX})`);
    check(video && piece.position[2] > video.position[2], `${label}: antenna behind the video unit (z ${piece.position[2]} > ${video && video.position[2]})`);
    const old = assemble(build, oldEnv);
    check(!old.pieces.some((p) => p.role === 'antenna') && old.pieces.length === a.pieces.length - 1,
      `${label}: an older export (antennas in the video model) draws no extra antenna`);
    combos++;
  }
}
check(fallbacks > 0 && fallbacks === catalog.partsIn('frame').length - Object.keys(CORE_ANCHORS).length, `frames on the fallback anchor: ${fallbacks}`);

// The anchor of drone_layout.json must be a point [x, y, z] (DroneLayoutParser.optionalVector), else the fallback.
{
  const frame = catalog.part('propwash:freestyle_5');
  const fallback = defaultAntenna(frame);
  for (const bad of ['x', [1, 2], [0, 'a', 3], [0, 3000, 1], null]) {
    const layouts = { ...render.layouts, [frame.id]: { ...render.layouts[frame.id], antenna: bad } };
    check(near(frameLayout(frame, catalog, { ...render, layouts }).antenna, fallback), `anchor ${JSON.stringify(bad)}: fallback ${fallback}`);
  }
  check(near(frameLayout(frame, catalog, siteRender).antenna, fallback), 'drone_layout.json without an anchor (older export): fallback');
}

// Add-on VTX without "_antenna" and a VTX without a model: no antenna piece.
for (const video of catalog.partsIn('video').filter((v) => !VTX.includes(v.id))) {
  const a = assemble({ ...base, video: video.id, accessories: {} }, env);
  check(!a.pieces.some((p) => p.role === 'antenna'), `${video.id}: no "_antenna", no antenna piece`);
}
{
  const noModel = { ...env, model: (id) => (id === 'propwash:digital_hd' ? null : env.model(id)) };
  check(!assemble({ ...base, video: 'propwash:digital_hd', accessories: {} }, noModel).pieces.some((p) => p.role === 'antenna'), 'VTX without a model: no antenna piece');
}

// Paint.
for (const id of VTX) {
  const label = `freestyle + ${id}`;
  const a = assemble({ ...base, video: id, accessories: {} }, env);
  const modelOfPiece = (pid) => env.model(pid);
  const defaults = paintDefaults(a.pieces, modelOfPiece, render);
  const antennaBase = fixturePaint.models[`video/${local(id)}_antenna`][0].base;
  check(defaults.antenna === antennaBase, `${label}: default antenna colour ${defaults.antenna} = ${antennaBase}`);
  check(defaults.camera === fixturePaint.models[`video/${local(id)}`][0].base, `${label}: default camera colour ${defaults.camera}`);
  const available = paintAvailable(a.pieces, modelOfPiece, render, PAINT_SLOTS);
  check(available.has('antenna') && available.has('camera'), `${label}: antenna and camera slots offered`);
  const piece = a.pieces.find((p) => p.role === 'antenna');
  const video = a.pieces.find((p) => p.role === 'video');
  if (!piece) continue;
  const slots = pieceSlots(piece, groupsOf(piece, env.model(id), render));
  check(slots.main === 'antenna' && slots.groups.length > 0 && slots.groups.every((s) => s === 'antenna'), `${label}: a pick on the antenna paints the antenna slot (${JSON.stringify(slots)})`);
  const videoSlots = pieceSlots(video, groupsOf(video, env.model(id), render));
  check(videoSlots.main === 'camera' && !videoSlots.groups.includes('antenna'), `${label}: the video unit paints the camera slot (${JSON.stringify(videoSlots)})`);
  const groups = groupsOf(piece, env.model(id), render);
  const painted = paintTints(groups, { antenna: '#123456' }, 0, render.channels);
  check(painted && painted.every((t) => t === channelTint(0x123456, render.channels.antenna)), `${label}: antenna colour tints the antenna model`);
  check(paintTints(groups, { camera: '#ff0000' }, 0, render.channels) === null, `${label}: a camera colour leaves the antenna on its plain model`);
}
console.log(`assembly: ${combos} frame and VTX combinations, ${fallbacks} frames on the fallback anchor`);

// ---------------------------------------------------------------------------------------------------------------
// Headless Chrome

const VIEWS = [[], [['ArrowLeft', 26]], [['ArrowLeft', 13], ['ArrowDown', 6]], [['ArrowRight', 26]], [['ArrowLeft', 26], ['ArrowDown', 11]], [['ArrowUp', 8]]];

async function browserChecks() {
  const server = await serve();
  const site = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-antenna-chrome-'));
  const { child, ws } = await launch(arg('--chrome') || CHROME, profile);
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
      if (p.type === 'error' || p.type === 'assert') errors.push(`console.${p.type}: ${p.args.map((x) => x.value ?? x.description).join(' ')}`);
    });
    browser.on('Runtime.exceptionThrown', (p) => errors.push(`exception: ${p.exceptionDetails.exception?.description || p.exceptionDetails.text}`));
    // The fixture's anchors and VTX models on their way to the page.
    browser.on('Fetch.requestPaused', async (p) => {
      try {
        let text;
        if (/\/render\.json(\?|$)/.test(p.request.url)) {
          const { body, base64Encoded } = await send('Fetch.getResponseBody', { requestId: p.requestId });
          const json = JSON.parse(base64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body);
          json.layouts = { ...json.layouts, ...built.layouts };
          text = JSON.stringify(json);
        } else {
          const id = `propwash:${decodeURIComponent(new URL(p.request.url).pathname.split('/').pop()).replace(/\.json$/, '')}`;
          text = fixtureModels.has(id) ? JSON.stringify(fixtureModels.get(id)) : null;
        }
        if (text === null) {
          await send('Fetch.continueRequest', { requestId: p.requestId });
          return;
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
    await send('Page.enable');
    await send('Page.bringToFront');
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await send('Fetch.enable', {
      patterns: [
        { urlPattern: '*/assets/data/configurator/render.json*', requestStage: 'Response' },
        { urlPattern: '*/assets/data/configurator/models/propwash/video/*', requestStage: 'Response' },
      ],
    });
    let langScript = null;

    const viewerToTop = () => evaluate("(document.querySelector('[data-viewer]').scrollIntoView({ block: 'start', behavior: 'instant' }), scrollBy({ top: -70, behavior: 'instant' }), true)");
    const canvasRect = () => evaluate(`(() => {
      const r = document.querySelector('[data-viewer-canvas] canvas').getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    })()`);
    const ui = () => evaluate(`(() => {
      const label = document.querySelector('[data-pick-label]');
      const slot = document.querySelector('[data-slots] .slot.is-active');
      return {
        category: slot ? slot.dataset.cat : null,
        targets: [...document.querySelectorAll('[data-paint-row].is-target')].map((r) => r.dataset.paintRow),
        label: label.hidden ? null : { kind: label.querySelector('.viewer__pick-kind')?.textContent || '', name: label.querySelector('.viewer__pick-name')?.textContent || '' },
      };
    })()`);
    const mouse = (type, x, y, pressed) => send('Input.dispatchMouseEvent', {
      type, x, y, button: type === 'mouseMoved' && !pressed ? 'none' : 'left', buttons: pressed ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1, pointerType: 'mouse',
    });
    const touch = (type, points) => send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], i) => ({ x, y, id: i, radiusX: 4, radiusY: 4, force: 1 })) });
    const setTab = (tab) => evaluate(`(document.querySelector('#tab-${tab}').click(), true)`);
    const turn = (view) => evaluate(`(() => {
      const canvas = document.querySelector('[data-viewer-canvas] canvas');
      const press = (key, n) => { for (let i = 0; i < n; i++) canvas.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); };
      press('0', 1);
      ${view.map(([key, n]) => `press('${key}', ${n});`).join('\n')}
      return true;
    })()`);

    /** Canvas point of the antenna (a pick of category video with the antenna slot) in the first view that shows it. */
    async function antennaPoint() {
      for (const view of VIEWS) {
        await turn(view);
        await sleep(150);
        await viewerToTop();
        const p = (await evaluate('window.__viewer.pickPoints()')).find((x) => x.category === 'video' && x.paintSlot === 'antenna');
        if (p) {
          const r = await canvasRect();
          const vp = await evaluate('({ w: innerWidth, h: innerHeight })');
          const at = { x: r.x + p.x, y: r.y + p.y };
          if (at.x > 0 && at.y > 0 && at.x < vp.w && at.y < vp.h) return at;
        }
      }
      return null;
    }

    async function tap(at, viewport) {
      if (viewport.mobile) {
        await touch('touchStart', [[at.x, at.y]]);
        await sleep(40);
        await touch('touchEnd', []);
      } else {
        await mouse('mouseMoved', at.x, at.y, false);
        await sleep(160);
        await mouse('mousePressed', at.x, at.y, true);
        await mouse('mouseReleased', at.x, at.y, false);
      }
      await sleep(150);
    }

    const LOADS = [
      { lang: 'en', vtx: 'propwash:digital_hd', viewport: { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false } },
      { lang: 'en', vtx: 'propwash:analog_race', viewport: { width: 390, height: 844, deviceScaleFactor: 3, mobile: true } },
      { lang: 'de', vtx: 'propwash:digital_lite', viewport: { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false } },
      { lang: 'de', vtx: 'propwash:analog_nano', viewport: { width: 390, height: 844, deviceScaleFactor: 3, mobile: true } },
    ];
    for (const { lang, vtx, viewport } of LOADS) {
      const label = `${lang} ${viewport.width} px ${vtx}`;
      const at = lang === 'de' ? 1 : 0;
      if (langScript) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: langScript });
      ({ identifier: langScript } = await send('Page.addScriptToEvaluateOnNewDocument', {
        source: `try { localStorage.setItem('propwash-lang', '${lang}'); } catch (e) {} document.addEventListener('propwash:viewer', (e) => { window.__viewer = e.detail; });`,
      }));
      await send('Emulation.setDeviceMetricsOverride', viewport);
      await send('Emulation.setTouchEmulationEnabled', { enabled: viewport.mobile, maxTouchPoints: viewport.mobile ? 5 : 1 });
      await send('Page.navigate', { url: 'about:blank' });
      await sleep(100);
      const code = catalog.encode({ build: { ...base, video: vtx, accessories: {} }, paint: null, tune: null, osd: null, name: null });
      await send('Page.navigate', { url: `${site}/configurator/#${code}` });
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
      await sleep(600);
      await viewerToTop();

      const piece = await evaluate("window.__viewer.current().assembly.pieces.find((p) => p.role === 'antenna') || null");
      check(piece && piece.id === vtx && piece.variant === 'antenna' && near(piece.position, CORE_ANCHORS['propwash:freestyle_5']) && !piece.tiltX,
        `${label}: antenna piece at the anchor of freestyle_5 (got ${JSON.stringify(piece)})`);
      const meshes = () => evaluate('window.__viewer.highlights()');
      let drawn = (await meshes()).filter((h) => h.role === 'antenna');
      check(drawn.length === 1 && drawn[0].category === 'video' && drawn[0].visible === true, `${label}: one antenna mesh drawn (${JSON.stringify(drawn)})`);

      await setTab('parts');
      let point = await antennaPoint();
      if (check(point, `${label}: the antenna is in sight and pickable`)) {
        await evaluate(`(document.querySelector('[data-slots] [data-cat="frame"]').click(), true)`);
        await viewerToTop();
        point = await antennaPoint();
        if (!viewport.mobile) {
          await mouse('mouseMoved', point.x, point.y, false);
          await sleep(160);
          const s = await ui();
          check(s.label && s.label.kind.trim() === entry('categories.video')[at] && s.label.name.trim() === catalog.partName(vtx, lang),
            `${label}: hover on the antenna names “${entry('categories.video')[at]} / ${catalog.partName(vtx, lang)}” (got ${JSON.stringify(s.label)})`);
        }
        await tap(point, viewport);
        check((await ui()).category === 'video', `${label}: a click on the antenna opens the video parts (got ${(await ui()).category})`);
        await setTab('paint');
        await viewerToTop();
        point = await antennaPoint();
        if (check(point, `${label}: the antenna is pickable in the paint tab`)) {
          if (!viewport.mobile) {
            await mouse('mouseMoved', point.x, point.y, false);
            await sleep(160);
            const s = await ui();
            check(s.label && s.label.kind.trim() === catalog.paintSlotName('antenna', lang), `${label}: hover on the antenna names the slot “${catalog.paintSlotName('antenna', lang)}” (got ${JSON.stringify(s.label)})`);
          }
          await tap(point, viewport);
          const s = await ui();
          check(s.targets.length === 1 && s.targets[0] === 'antenna', `${label}: a click on the antenna targets the antenna paint row (got ${s.targets})`);
        }
      }
      await turn([]);
      await viewerToTop();
      await sleep(150);
      if (SHOTS) {
        fs.mkdirSync(SHOTS, { recursive: true });
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(SHOTS, `antenna-${lang}-${viewport.width}-${local(vtx)}.png`), Buffer.from(shot.data, 'base64'));
      }

      await evaluate('(window.__viewer.setCamera({ on: true, frame: true }), true)');
      await sleep(150);
      drawn = await meshes();
      check(drawn.some((h) => h.role === 'antenna') && drawn.filter((h) => h.role === 'antenna' || h.role === 'video').every((h) => h.visible === false)
        && drawn.some((h) => h.role === 'frame' && h.visible === true), `${label}: the camera preview hides antenna and video unit, the frame stays (${JSON.stringify(drawn.map((h) => [h.role, h.visible]))})`);
      await evaluate('(window.__viewer.setCamera({ on: false }), true)');
      await sleep(100);
      drawn = (await meshes()).filter((h) => h.role === 'antenna');
      check(drawn.length === 1 && drawn[0].visible === true, `${label}: back in 3D the antenna is drawn again`);
      check(!errors.length, `${label}: no console errors (${errors.splice(0).join(' | ')})`);
    }
  } finally {
    browser.close();
    child.kill();
    server.close();
    await sleep(300);
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {
      // Chrome may still write into its profile while it shuts down; the temporary folder stays then.
    }
  }
}

if (BROWSER) {
  try {
    await browserChecks();
  } catch (e) {
    check(false, `headless Chrome: ${e.stack || e.message}`);
  }
}
fs.rmSync(out, { recursive: true, force: true });

if (failures.length) {
  console.error(failures.join('\n'));
  console.error(`FAIL: antenna: ${failures.length} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`PASS: antenna: ${checks} checks passed (4 core VTX, ${combos} frame and VTX combinations${BROWSER ? ', en/de at 1280/390 px' : ''})`);
