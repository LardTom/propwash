#!/usr/bin/env node
// Takes the picture of the online configurator for the landing page (section #configurator): the 3D view with the
// flight figures below it, exactly as the page shows them.
//
//   node tools/build-configurator-shot.mjs [--code <share code>] [--zoom <steps>] [--chrome <path>] [--keep <file.png>]
//
// Serves this folder on a free local port, opens configurator/ (the default preset, or configurator/#<code>) in
// headless Chrome (English, reduced motion, so the drone does not turn and the view is the same every time), waits
// until the parts are loaded and the drone is drawn, and cuts out the 3D view and the flight figures below it at
// twice the CSS size. --zoom zooms in like the + key on the 3D view (default 2 steps). Target: assets/img/configurator-preview-<width>.webp
// for every width in WIDTHS. Needs Google Chrome and cwebp. --keep also writes the uncut PNG for checking.
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'img');
const NAME = 'configurator-preview';
const WIDTHS = [640, 1200];
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VIEWPORT = { width: 1440, height: 1000, deviceScaleFactor: 2 };

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain' };

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let file = path.join(ROOT, decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function launch(chrome, profile) {
  const child = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', '--lang=en-US', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  return new Promise((resolve, reject) => {
    let log = '';
    const timer = setTimeout(() => reject(new Error(`Chrome did not start:\n${log}`)), 20000);
    child.stderr.on('data', (d) => {
      log += d;
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(log);
      if (m) { clearTimeout(timer); resolve({ child, ws: m[1] }); }
    });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Chrome exited (${code}):\n${log}`)); });
  });
}

function cdp(url) {
  const socket = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (!msg.id || !pending.has(msg.id)) return;
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
    else resolve(msg.result);
  });
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('DevTools connection failed')), { once: true });
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    id += 1;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  return { ready, send, close: () => socket.close() };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const code = arg('--code');
  const zoom = Number(arg('--zoom', '2'));
  const chrome = arg('--chrome', CHROME);
  const keep = arg('--keep');
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-shot-'));
  const { child, ws } = await launch(chrome, profile);
  const browser = cdp(ws);
  try {
    await browser.ready;
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => browser.send(method, params, sessionId);
    const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
    await send('Page.enable');
    await send('Page.bringToFront');
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await send('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, mobile: false });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('propwash-lang', 'en'); } catch (e) {}" });
    await send('Page.navigate', { url: `${base}/configurator/${code ? `#${code}` : ''}` });
    const ready = `(() => {
      const stage = document.querySelector('[data-stage]');
      const cfg = document.querySelector('[data-cfg]');
      return !!(stage && !stage.hidden && cfg && cfg.getAttribute('aria-busy') !== 'true' && document.querySelector('[data-viewer-canvas] canvas'));
    })()`;
    const start = Date.now();
    while (!(await evaluate(ready))) {
      if (Date.now() - start > 30000) throw new Error('configurator did not finish loading within 30 s');
      await sleep(250);
    }
    await evaluate('document.fonts.ready.then(() => true)');
    await evaluate("document.querySelector('[data-viewer]').scrollIntoView({ block: 'center' }), true");
    await evaluate(`(() => {
      const canvas = document.querySelector('[data-viewer-canvas] canvas');
      for (let i = 0; i < ${zoom}; i++) canvas.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
      return true;
    })()`);
    await sleep(3000);
    const box = await evaluate(`(() => {
      const top = document.querySelector('[data-viewer]').getBoundingClientRect();
      const bottom = document.querySelector('[data-keystats]').getBoundingClientRect();
      return { x: top.left + scrollX, y: top.top + scrollY, width: top.width, height: bottom.bottom - top.top };
    })()`);
    const shot = await send('Page.captureScreenshot', { format: 'png', clip: { ...box, scale: 1 }, captureBeyondViewport: false });
    const png = path.join(profile, `${NAME}.png`);
    fs.writeFileSync(png, Buffer.from(shot.data, 'base64'));
    if (keep) fs.copyFileSync(png, keep);
    const full = { width: Math.round(box.width * VIEWPORT.deviceScaleFactor), height: Math.round(box.height * VIEWPORT.deviceScaleFactor) };
    for (const w of WIDTHS) {
      const h = Math.round(w * full.height / full.width);
      const target = path.join(OUT, `${NAME}-${w}.webp`);
      execFileSync('cwebp', ['-quiet', '-q', '84', '-m', '6', '-metadata', 'none', '-resize', String(w), String(h), png, '-o', target]);
      console.log(`${path.relative(ROOT, target)}  ${w} × ${h}`);
    }
  } finally {
    browser.close();
    child.kill();
    server.close();
    await sleep(300);
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
