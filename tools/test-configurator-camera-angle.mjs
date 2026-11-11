#!/usr/bin/env node
// The camera angle of the FPV camera preview looks the same at every angle (headless Chrome, English and German, 390
// and 1280 px wide). Before, the frame's default angle (30° on the 5″ freestyle frame) showed a note twice as long as
// any other angle, so the panel grew by two lines and the figures below it jumped while the slider passed the default.
//   - for presets with different camera mounts (freestyle 0–50°, race, whoop, long range), every angle of the mount:
//     the note under the slider has the same text, font size and height, the panel the same height, and the figures
//     below the panel stay where they are
//   - the note names the frame's default angle and the field of view of the camera, the reset button and the
//     highlighted angle still tell an own angle from the default
//   - no console errors or uncaught exceptions
//
//   node tools/test-configurator-camera-angle.mjs [--shots <dir>] [--chrome <path>]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, CHROME, serve, launch, cdp, sleep } from './headless-chrome.mjs';
import { createCatalog } from '../assets/js/configurator/data.js';

const catalog = createCatalog(JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/data/configurator/catalog.json'), 'utf8')));

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

const VIEWPORTS = {
  1280: { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false },
  390: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
};

// Presets with different camera mounts; the first is the page's default drone.
function presetCodes() {
  const wanted = ['freestyle', 'race', 'whoop', 'long'];
  const out = [];
  for (const word of wanted) {
    const preset = catalog.presets.find((p) => p.id.includes(word) && !out.some((o) => o.id === p.id));
    if (!preset) continue;
    out.push({ id: preset.id, code: catalog.encode({ build: preset.build, paint: null, tune: null, osd: null, name: null }) });
  }
  return out;
}

async function main() {
  const shots = arg('--shots');
  if (shots) fs.mkdirSync(shots, { recursive: true });
  const presets = presetCodes();
  check(presets.length >= 3, `three or more presets with a camera mount found (${presets.map((p) => p.id).join(', ')})`);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-camangle-'));
  const { child, ws } = await launch(arg('--chrome', CHROME), profile);
  const browser = cdp(ws);
  const errors = [];
  let angles = 0;
  try {
    await browser.ready;
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => browser.send(method, params, sessionId);
    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text}: ${expression.slice(0, 160)}`);
      return r.result.value;
    };
    browser.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error' || p.type === 'assert') errors.push(`console.${p.type}: ${p.args.map((a) => a.value ?? a.description).join(' ')}`);
    });
    browser.on('Runtime.exceptionThrown', (p) => errors.push(`exception: ${p.exceptionDetails.exception?.description || p.exceptionDetails.text}`));
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

    for (const language of ['en', 'de']) {
      for (const width of [1280, 390]) {
        for (const preset of presets) {
          const label = `${preset.id} ${language} ${width} px`;
          await send('Emulation.setDeviceMetricsOverride', VIEWPORTS[width]);
          await send('Page.navigate', { url: 'about:blank' });
          await sleep(80);
          const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', {
            source: `try { localStorage.setItem('propwash-lang', '${language}'); } catch (e) {}`,
          });
          await send('Page.navigate', { url: `${base}/configurator/?view=camera#${preset.code}` });
          const start = Date.now();
          while (!(await evaluate(`(() => { const cfg = document.querySelector('[data-cfg]'); const i = document.querySelector('[data-fpv-tilt]'); return !!(cfg && cfg.getAttribute('aria-busy') === 'false' && i && !i.disabled); })()`))) {
            if (Date.now() - start > 30000) throw new Error(`${label}: page not ready within 30 s`);
            await sleep(200);
          }
          await send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
          await evaluate('document.fonts.ready.then(() => true)');
          await sleep(300);
          const range = await evaluate(`(() => { const i = document.querySelector('[data-fpv-tilt]'); return { min: +i.min, max: +i.max, value: +i.value }; })()`);
          const seen = [];
          for (let a = range.min; a <= range.max; a++) {
            const m = await evaluate(`(() => {
              const i = document.querySelector('[data-fpv-tilt]');
              i.value = '${a}';
              i.dispatchEvent(new Event('input', { bubbles: true }));
              i.dispatchEvent(new Event('change', { bubbles: true }));
              const note = document.querySelector('[data-fpv-note]');
              const panel = note.closest('.fpv');
              const next = panel.parentElement.querySelector('.stats') || panel.nextElementSibling;
              const css = getComputedStyle(note);
              return {
                angle: +i.value, text: note.textContent, size: css.fontSize, lineHeight: css.lineHeight,
                noteHeight: Math.round(note.getBoundingClientRect().height), panelHeight: Math.round(panel.getBoundingClientRect().height),
                below: next ? Math.round(next.getBoundingClientRect().top - panel.getBoundingClientRect().top) : null,
                own: document.querySelector('[data-fpv-tilt-out]').classList.contains('is-own'),
                reset: !document.querySelector('[data-fpv-reset]').disabled,
                out: document.querySelector('[data-fpv-tilt-out]').textContent,
              };
            })()`);
            seen.push(m);
            angles++;
          }
          const first = seen[0];
          const standard = range.value;
          for (const m of seen) {
            const where = `${label}, ${m.angle}°`;
            check(m.text === first.text, `${where}: the note says the same as at ${first.angle}° ("${m.text}" vs "${first.text}")`);
            check(m.size === first.size && m.lineHeight === first.lineHeight, `${where}: the note has the font of ${first.angle}° (${m.size}/${m.lineHeight} vs ${first.size}/${first.lineHeight})`);
            check(m.noteHeight === first.noteHeight, `${where}: the note is as high as at ${first.angle}° (${m.noteHeight} vs ${first.noteHeight} px)`);
            check(m.panelHeight === first.panelHeight, `${where}: the camera panel is as high as at ${first.angle}° (${m.panelHeight} vs ${first.panelHeight} px)`);
            check(m.below === first.below, `${where}: the figures below the panel stay in place (${m.below} vs ${first.below} px)`);
            check(m.own === (m.angle !== standard) && m.reset === (m.angle !== standard), `${where}: own angle marked and reset offered only away from the default ${standard}°`);
            check(m.out.startsWith(String(m.angle)), `${where}: the readout shows the angle (${m.out})`);
          }
          check(new RegExp(`${standard}\\s*°`).test(first.text), `${label}: the note names the frame's default angle ${standard}° ("${first.text}")`);
          if (shots && preset === presets[0]) {
            for (const a of [range.min, standard, Math.min(range.max, standard + 10)]) {
              await evaluate(`(() => { const i = document.querySelector('[data-fpv-tilt]'); i.value = '${a}'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('.fpv').scrollIntoView({ block: 'center' }); })()`);
              await sleep(200);
              const r = await evaluate(`(() => { const b = document.querySelector('.fpv').getBoundingClientRect(); return { x: Math.max(0, b.x - 8), y: Math.max(0, b.y + scrollY - 8), width: Math.min(document.documentElement.clientWidth, b.width + 16), height: b.height + 140 }; })()`);
              const img = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...r, scale: 1 } });
              fs.writeFileSync(path.join(shots, `camera-angle-${language}-${width}-${a}.png`), Buffer.from(img.data, 'base64'));
            }
          }
        }
      }
    }
  } finally {
    browser.close();
    child.kill();
    server.close();
    await new Promise((r) => child.once('exit', r));
    try {
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Chrome may still write into its profile while it shuts down; the temporary folder stays then.
    }
  }
  for (const e of errors) check(false, e);
  if (failures.length) {
    console.log(`FAIL: ${checks - failures.length}/${checks} checks passed`);
    for (const f of failures.slice(0, 40)) console.log(`  ${f}`);
    if (failures.length > 40) console.log(`  … and ${failures.length - 40} more`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${checks} checks – camera angle of the FPV preview, ${angles} angles of ${presets.length} camera mounts, English and German, 390 and 1280 px`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
