#!/usr/bin/env node
// The pictures of the builds for beginners (assets/data/configurator/beginner/*.webp) show what the configurator draws
// today: every preset of beginner.json is drawn again exactly like tools/build-configurator-beginner.mjs does it
// (configurator/#<PW3 code> in headless Chrome, the viewer's snapshot centred on 960 × 600, cwebp to 480 × 300) and
// compared with the committed picture, both decoded with dwebp:
//   - the committed picture exists, is 480 × 300 and has a transparent background
//   - no area of the drone differs: a group of touching pixels that differ clearly (a part drawn or left out, for
//     example the plug and lead of the battery that Propwash 0.6.0 hides while the battery sits) fails the test;
//     single scattered pixels at edges are noise of the encoder
// Run node tools/build-configurator-beginner.mjs when this fails because a preset or the drone renderer changed.
//
//   node tools/test-beginner-images.mjs [--chrome <path>]
//
// Needs Google Chrome, cwebp and dwebp.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, CHROME, serve, launch, cdp, sleep } from './headless-chrome.mjs';
import { counter } from './fixtures/cov/browser.mjs';
import { createCatalog } from '../assets/js/configurator/data.js';

const DATA = path.join(ROOT, 'assets/data/configurator');
const WIDTH = 480;
const HEIGHT = 300;
const PIXEL_DIFF = 48;
const MAX_AREA = 24;

const { check, finish } = counter('beginner images');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function readPam(file) {
  const buf = fs.readFileSync(file);
  const end = buf.indexOf('ENDHDR\n');
  const head = buf.subarray(0, end).toString('latin1');
  const field = (name) => Number((new RegExp(`${name} (\\d+)`).exec(head) || [])[1]);
  return { width: field('WIDTH'), height: field('HEIGHT'), depth: field('DEPTH'), data: buf.subarray(end + 7) };
}

function decode(webp, dir, name) {
  const pam = path.join(dir, `${name}.pam`);
  execFileSync('dwebp', ['-quiet', '-pam', webp, '-o', pam]);
  return readPam(pam);
}

function compare(a, b) {
  const n = a.width * a.height;
  const differs = new Uint8Array(n);
  let count = 0;
  let opaque = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (a.data[o + 3] > 0 || b.data[o + 3] > 0) opaque++;
    let d = Math.abs(a.data[o + 3] - b.data[o + 3]);
    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(a.data[o + c] * a.data[o + 3] - b.data[o + c] * b.data[o + 3]) / 255);
    if (d > PIXEL_DIFF) { differs[i] = 1; count++; }
  }
  let largest = 0;
  let where = null;
  const seen = new Uint8Array(n);
  const stack = [];
  for (let i = 0; i < n; i++) {
    if (!differs[i] || seen[i]) continue;
    let size = 0;
    let x0 = Infinity; let y0 = Infinity; let x1 = -1; let y1 = -1;
    seen[i] = 1;
    stack.push(i);
    while (stack.length) {
      const p = stack.pop();
      size++;
      const x = p % a.width;
      const y = (p - x) / a.width;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= a.width || ny >= a.height) continue;
        const q = ny * a.width + nx;
        if (differs[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    if (size > largest) { largest = size; where = `x ${x0}–${x1}, y ${y0}–${y1}`; }
  }
  return { count, opaque, largest, where };
}

async function main() {
  const catalog = createCatalog(JSON.parse(fs.readFileSync(path.join(DATA, 'catalog.json'), 'utf8')));
  const beginner = JSON.parse(fs.readFileSync(path.join(DATA, 'beginner.json'), 'utf8'));
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-beginner-test-'));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-beginner-cmp-'));
  const { child, ws } = await launch(arg('--chrome', CHROME), profile);
  const browser = cdp(ws);
  const summary = [];
  try {
    await browser.ready;
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => browser.send(method, params, sessionId);
    const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: "try { localStorage.setItem('propwash-lang', 'en'); } catch (e) {} document.addEventListener('propwash:viewer', (e) => { window.__viewer = e.detail; });",
    });
    check(beginner.builds.length > 0, 'beginner.json lists builds');
    for (const build of beginner.builds) {
      const name = path.basename(build.image, '.webp');
      const committed = path.join(DATA, build.image);
      if (!check(fs.existsSync(committed), `${build.image}: picture missing`)) continue;
      const code = catalog.encode(catalog.presetContent(build.preset));
      await send('Page.navigate', { url: `${base}/configurator/#${code}` });
      const start = Date.now();
      while (!(await evaluate('!!(window.__viewer && window.__viewer.current() && document.querySelector("[data-viewer-canvas] canvas"))'))) {
        if (Date.now() - start > 30000) throw new Error(`${build.preset}: the 3D view did not start within 30 s`);
        await sleep(250);
      }
      await sleep(2500);
      const data = await evaluate(`(() => {
        const shot = window.__viewer.snapshot({ maxWidth: ${WIDTH * 2}, maxHeight: ${HEIGHT * 2}, pad: 0.04 });
        if (!shot) return null;
        const out = document.createElement('canvas');
        out.width = ${WIDTH * 2};
        out.height = ${HEIGHT * 2};
        out.getContext('2d').drawImage(shot, Math.round((out.width - shot.width) / 2), Math.round((out.height - shot.height) / 2));
        return out.toDataURL('image/png');
      })()`);
      if (!check(data, `${build.preset}: nothing drawn`)) continue;
      const png = path.join(work, `${name}.png`);
      const fresh = path.join(work, `${name}.webp`);
      fs.writeFileSync(png, Buffer.from(data.split(',')[1], 'base64'));
      execFileSync('cwebp', ['-quiet', '-q', '86', '-alpha_q', '100', '-m', '6', '-metadata', 'none', '-resize', String(WIDTH), String(HEIGHT), png, '-o', fresh]);
      const now = decode(fresh, work, `${name}-fresh`);
      const old = decode(committed, work, `${name}-committed`);
      check(old.width === WIDTH && old.height === HEIGHT && old.depth === 4, `${build.image}: ${old.width} × ${old.height} × ${old.depth}, expected ${WIDTH} × ${HEIGHT} with alpha`);
      if (old.width !== now.width || old.height !== now.height) continue;
      const corners = [0, WIDTH - 1, (HEIGHT - 1) * WIDTH, HEIGHT * WIDTH - 1].map((i) => old.data[i * 4 + 3]);
      check(corners.every((a) => a === 0), `${build.image}: background not transparent (alpha in the corners ${corners.join(', ')})`);
      const diff = compare(old, now);
      check(diff.largest <= MAX_AREA, `${build.image}: differs from a fresh render of ${build.preset} in an area of ${diff.largest} pixels (${diff.where}; `
        + `${diff.count} of ${diff.opaque} drawn pixels differ) – run node tools/build-configurator-beginner.mjs`);
      summary.push(`${name} ${diff.count}/${diff.opaque} px, largest area ${diff.largest}`);
    }
  } finally {
    browser.close();
    child.kill();
    server.close();
    await sleep(300);
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  finish(summary.join('; '));
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
