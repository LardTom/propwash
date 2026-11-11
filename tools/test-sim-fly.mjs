#!/usr/bin/env node
// “Fly” from the configurator into the simulator with the drones of Propwash 0.6.0 and its add-ons:
//   - node: every preset of the catalog (Propwash, Just More Parts 1.2.0 such as “Race Whoop 65 · 1S”, Camera Drones,
//     Mob Defense accessories) and every build of the game's share-code vectors (tools/fixtures/pw3-export-vectors.json,
//     the add-on vectors of sharecode-vectors.json) gives the simulator an airframe with finite values; the share code
//     the configurator hands over (paint, tune, name) reads back to the same build
//   - creative drones: the simulator's airframe of the 370 creative vectors of the release jar
//     (tools/fixtures/creative-analysis-vectors.json, AirframeSpec of CreativeFlight with ParamDerivation) equals the
//     mod's: numbers bit for bit or within 1e-14 (JavaScript's Math.pow in analysis.js is 1 ulp off at a few inputs),
//     the build key up to its hash (a cache key: FNV here, PartIndex.hashOf in the mod)
//   - headless Chrome: the configurator's “Fly” link carries the drone as it is (preset, a changed tune, paint and
//     name), the simulator opens that very drone without a notice, arms with the keyboard and climbs with throttle;
//     an old PW2 link and a PW3 code with a missing add-on still open; no console errors
//
//   node tools/test-sim-fly.mjs [--chrome <path>] [--no-browser]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, CHROME, serve, launch, cdp, sleep } from './headless-chrome.mjs';
import { createCatalog } from '../assets/js/configurator/data.js';
import { AirframeSpec } from '../assets/js/sim/model/AirframeSpec.js';
import { simAirframe } from '../assets/js/sim/creative-airframe.js';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

let checks = 0;
const failures = [];
function check(ok, message) {
  checks++;
  if (!ok) failures.push(message);
  return !!ok;
}

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const catalog = createCatalog(readJson('assets/data/configurator/catalog.json'));
const FIELDS = ['massKg', 'inertiaXx', 'inertiaYy', 'inertiaZz', 'kThrust', 'kTorque', 'omegaMax', 'hoverOmega', 'propRadius'];

// 1. Airframes of every preset and every build of the game's vectors.
const builds = new Map();
for (const p of catalog.presets) builds.set(`preset ${p.id}`, catalog.presetBuild(p.id));
for (const v of readJson('tools/fixtures/pw3-export-vectors.json')) if (v.decoded && v.decoded.build) builds.set(`vector ${v.name}`, v.decoded.build);
for (const v of readJson('tools/fixtures/sharecode-vectors.json').filter((x) => x.format === 'PW3')) builds.set(`vector ${v.name}`, v.decoded.build);
let airframes = 0;
for (const [name, build] of builds) {
  let a = null;
  try {
    a = AirframeSpec.fromBuild(build, catalog);
  } catch (e) {
    check(false, `${name}: AirframeSpec throws ${e.message}`);
    continue;
  }
  if (!check(!!a, `${name}: the simulator gets an airframe`)) continue;
  airframes++;
  for (const f of FIELDS) {
    const value = typeof a[f] === 'function' ? a[f]() : a[f];
    check(Number.isFinite(value) && value > 0, `${name}: ${f} finite and positive (${value})`);
  }
  check(Number.isFinite(a.comHeight), `${name}: comHeight finite (${a.comHeight})`);
}
check(catalog.presets.some((p) => p.id === 'justmoreparts:whoop65_race_1s'), 'the catalog has Just More Parts 1.2.0 “Race Whoop 65 · 1S”');

// 1b. Creative drones against the mod's AirframeSpec.
const creativeVectors = readJson('tools/fixtures/creative-analysis-vectors.json').vectors;
let creativeFields = 0;
let creativeExact = 0;
for (const v of creativeVectors) {
  const { airframe } = simAirframe(catalog, { build: v.build, creative: v.creative });
  if (!check(!!airframe, `creative ${v.name}: the simulator gets an airframe`)) continue;
  for (const [k, want] of Object.entries(v.airframe)) {
    let got = typeof airframe[k] === 'function' ? airframe[k]() : airframe[k];
    if (got === undefined) got = airframe[`_${k}`];
    if (typeof want === 'number') {
      creativeFields++;
      if (got === want) creativeExact++;
      else check(Math.abs(got - want) <= 1e-14 * Math.max(Math.abs(want), 1e-300), `creative ${v.name}: ${k} ${got} like the mod's ${want}`);
    } else if (k === 'buildKey') {
      const cut = (key) => String(key).replace(/\/[0-9a-f]{16}$/, '');
      check(cut(got) === cut(want), `creative ${v.name}: build key ${got} like the mod's ${want} (without the hash)`);
    } else if (typeof want === 'boolean') {
      check(got === want, `creative ${v.name}: ${k} ${got} like the mod's ${want}`);
    }
  }
}

// 2. The code the configurator hands over (flyCode in ui.js: build, paint, tune, no OSD, name) reads back to the drone.
for (const p of catalog.presets) {
  const content = catalog.presetContent(p.id);
  const code = catalog.encode({ build: content.build, paint: content.paint || null, tune: { ...(content.tune || {}) }, osd: null, name: 'Fly test' });
  const back = catalog.decode(code);
  check(back.ok && JSON.stringify(back.content.build) === JSON.stringify(content.build) && back.content.name === 'Fly test', `preset ${p.id}: the fly code reads back to the same build and name`);
}

async function browserPart() {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-simfly-'));
  const { child, ws } = await launch(arg('--chrome', CHROME), profile, ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']);
  const browser = cdp(ws);
  const errors = [];
  let where = '';
  try {
    await browser.ready;
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => browser.send(method, params, sessionId);
    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(`${where}: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}: ${expression.slice(0, 120)}`);
      return r.result.value;
    };
    browser.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error' || p.type === 'assert') errors.push(`${where}: console.${p.type}: ${p.args.map((a) => a.value ?? a.description).join(' ')}`);
    });
    browser.on('Runtime.exceptionThrown', (p) => errors.push(`${where}: exception: ${p.exceptionDetails.exception?.description || p.exceptionDetails.text}`));
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('propwash-lang', 'en'); } catch (e) {}" });
    const waitFor = async (expr, ms, what) => {
      const start = Date.now();
      while (!(await evaluate(expr))) {
        if (Date.now() - start > ms) throw new Error(`${where}: ${what} not within ${ms / 1000} s`);
        await sleep(200);
      }
    };
    const key = async (type, code, keyName, vk) => send('Input.dispatchKeyEvent', { type, code, key: keyName, windowsVirtualKeyCode: vk });

    const cases = [
      ['justmoreparts:whoop65_race_1s', null],
      ['propwash:freestyle', { 'pid.roll.p': 52 }],
      ['camdrones:tour', null],
      ['propwash:racer', null],
    ];
    for (const [id, tune] of cases) {
      where = `configurator ${id}`;
      const content = catalog.presetContent(id);
      const start = catalog.encode({ build: content.build, paint: content.paint || null, tune: { ...(content.tune || {}), ...(tune || {}) }, osd: null, name: `Fly ${id.split(':')[1]}` });
      await send('Page.navigate', { url: `${base}/configurator/#${start}` });
      await waitFor("(() => { const c = document.querySelector('[data-cfg]'); return !!(c && c.getAttribute('aria-busy') === 'false'); })()", 30000, 'configurator');
      const href = await evaluate("(() => { const a = document.querySelector('[data-fly]'); a.dispatchEvent(new Event('focus')); return a.getAttribute('href'); })()");
      const code = (href.split('#')[1] || '');
      const read = catalog.decode(code);
      check(href.startsWith('../sim/#PW3-') && read.ok, `${where}: “Fly” links the simulator with a PW3 code (${href.slice(0, 40)})`);
      check(read.ok && JSON.stringify(read.content.build) === JSON.stringify(content.build), `${where}: the code carries the build`);
      check(read.ok && read.content.name === `Fly ${id.split(':')[1]}`, `${where}: the code carries the name (${read.ok && read.content.name})`);
      if (tune) check(read.ok && Object.entries(tune).every(([k, v]) => read.content.tune[k] === v), `${where}: the code carries the changed tune (${JSON.stringify(read.ok && read.content.tune)})`);

      where = `sim ${id}`;
      await send('Page.navigate', { url: `${base}/sim/#${code}` });
      await waitFor('!!(window.propwashSim && document.body.classList.contains("is-ready"))', 40000, 'simulator');
      const s = await evaluate(`(() => {
        const n = document.querySelector('[data-notice]');
        const p = window.propwashSim;
        return { notice: n && !n.hidden ? n.textContent : null, name: document.querySelector('[data-drone-name]').textContent,
          mass: p.airframe.massKg, build: p.airframe.parts ? Object.fromEntries(['frame', 'stack', 'motor', 'prop', 'video', 'battery'].map((k) => [k, p.airframe.parts[k] && p.airframe.parts[k].id])) : null };
      })()`);
      check(!s.notice, `${where}: no notice (${s.notice})`);
      check(s.name.includes(id.split(':')[1].split('_')[0]) || s.name.includes('Fly'), `${where}: the bar names the drone (${s.name})`);
      const expectedBuild = Object.fromEntries(['frame', 'stack', 'motor', 'prop', 'video', 'battery'].map((k) => [k, content.build[k]]));
      if (s.build) check(JSON.stringify(s.build) === JSON.stringify(expectedBuild), `${where}: flies the build of the code (${JSON.stringify(s.build)})`);
      const expectedMass = AirframeSpec.fromBuild(content.build, catalog).massKg;
      check(Math.abs(s.mass - expectedMass) < 1e-12, `${where}: airframe mass ${s.mass} like the node port ${expectedMass}`);
      // Arm with Z (throttle down, level), then full throttle with W for a while: the drone climbs.
      await evaluate("document.querySelector('[data-about-close]') && document.querySelector('[data-about-close]').click()");
      const y0 = await evaluate('window.propwashSim.sim.body.py');
      await key('keyDown', 'KeyZ', 'z', 90);
      await sleep(150);
      await key('keyUp', 'KeyZ', 'z', 90);
      await waitFor('window.propwashSim.sim.arming.armed', 5000, 'arming');
      await key('keyDown', 'KeyW', 'w', 87);
      await sleep(1600);
      await key('keyUp', 'KeyW', 'w', 87);
      const y1 = await evaluate('window.propwashSim.sim.body.py');
      check(y1 - y0 > 0.3, `${where}: armed and climbed with throttle (${(y1 - y0).toFixed(2)} m)`);
    }

    where = 'sim with a creative drone (PW3 with creative values)';
    const creativeCode = readJson('tools/fixtures/sharecode/pw3-creative-vectors.json').vectors.find((v) => v.name.startsWith('C1_'));
    if (check(!!creativeCode, 'golden vector C1 of the creative share codes found')) {
      const decoded = catalog.decode(creativeCode.code);
      const want = simAirframe(catalog, decoded.content).airframe;
      await send('Page.navigate', { url: 'about:blank' });
      await sleep(100);
      await send('Page.navigate', { url: `${base}/sim/#${creativeCode.code}` });
      await waitFor('!!(window.propwashSim && document.body.classList.contains("is-ready"))', 40000, 'simulator');
      const got = await evaluate("(() => { const n = document.querySelector('[data-notice]'); return { notice: n && !n.hidden ? n.textContent : null, mass: window.propwashSim.airframe.massKg, ixx: window.propwashSim.airframe.inertiaXx, key: window.propwashSim.airframe.buildKey }; })()");
      check(!got.notice, `${where}: no notice (${got.notice})`);
      check(decoded.content.creative && got.mass === want.massKg && got.ixx === want.inertiaXx && got.key === want.buildKey, `${where}: flies the creative airframe (${got.key}, ${got.mass} kg)`);
    }

    where = 'sim with an old PW2 code';
    const pw2 = readJson('tools/fixtures/sharecode-vectors.json').find((v) => v.format === 'PW2' && v.status === 'OK');
    if (pw2) {
      await send('Page.navigate', { url: 'about:blank' });
      await sleep(100);
      await send('Page.navigate', { url: `${base}/sim/#${pw2.code}` });
      await waitFor('!!(window.propwashSim && document.body.classList.contains("is-ready"))', 40000, 'simulator');
      const notice = await evaluate("(() => { const n = document.querySelector('[data-notice]'); return n && !n.hidden ? n.textContent : null; })()");
      check(!notice || !/could not be read/.test(notice), `${where}: opens (${notice})`);
    }
  } finally {
    browser.close();
    child.kill();
    server.close();
    await new Promise((r) => child.once('exit', r));
    try {
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Chrome may still write into its profile while it shuts down.
    }
  }
  for (const e of errors) check(false, e);
}

if (!process.argv.includes('--no-browser')) await browserPart().catch((e) => check(false, e.message));
if (failures.length) {
  console.log(`FAIL: ${checks - failures.length}/${checks} checks passed`);
  for (const f of failures.slice(0, 40)) console.log(`  ${f}`);
  process.exitCode = 1;
} else {
  console.log(`PASS: ${checks} checks – “Fly”: ${airframes} airframes of presets and game vectors, ${creativeVectors.length} creative drones like the mod (${creativeExact} of ${creativeFields} numbers bit for bit), fly codes of ${catalog.presets.length} presets, configurator to simulator in Chrome`);
}
