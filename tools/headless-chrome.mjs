// Headless Chrome for the tools that open the site in a real browser (tools/build-configurator-shot.mjs,
// tools/test-configurator-pick.mjs): a static server for this folder on a free local port, Chrome started with its
// DevTools port, and a minimal DevTools protocol client (no npm packages).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain' };

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Serves ROOT on 127.0.0.1 and a free port; resolves to the http.Server. */
export function serve() {
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

/** Starts headless Chrome with a fresh profile; resolves to {child, ws} (DevTools WebSocket URL of the browser). */
export function launch(chrome, profile, extraArgs = []) {
  const child = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', '--lang=en-US', ...extraArgs, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
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

/** DevTools protocol client: send(method, params, sessionId) → result; on(method, handler) for events. */
export function cdp(url) {
  const socket = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  const handlers = new Map();
  socket.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.method) {
      for (const handler of handlers.get(msg.method) || []) handler(msg.params, msg.sessionId);
      return;
    }
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
  const on = (method, handler) => {
    if (!handlers.has(method)) handlers.set(method, []);
    handlers.get(method).push(handler);
  };
  return { ready, send, on, close: () => socket.close() };
}
