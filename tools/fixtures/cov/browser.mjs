// Shared parts of the coverage tests tools/test-cov-*.mjs: a counter of checks (with locked checks that only report),
// and headless Chrome pages with key, tap and click input, clipboard, request log and console errors.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, CHROME, serve, launch, cdp, sleep } from '../../headless-chrome.mjs';

export { ROOT, CHROME, sleep };

export const VIEWPORTS = {
  1280: { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false },
  390: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
  360: { width: 360, height: 780, deviceScaleFactor: 2, mobile: true },
};

export const CFG_READY = `(() => {
  const cfg = document.querySelector('[data-cfg]');
  return !!(cfg && cfg.getAttribute('aria-busy') === 'false' && document.querySelector('[data-addon-bar]') && document.querySelector('[data-code]').textContent);
})()`;
export const CV_READY = "document.querySelector('[data-cv]')?.getAttribute('aria-busy') === 'false'";

export function arg(name, env) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  return env && process.env[env] ? process.env[env] : null;
}

export const flag = (name) => process.argv.slice(2).includes(name);

export function counter(name) {
  let checks = 0;
  const failures = [];
  const locked = [];
  const notes = [];
  const unlock = String(process.env.COV_UNLOCK || '').split(',').map((s) => s.trim()).filter(Boolean);
  const check = (ok, message) => {
    checks++;
    if (!ok) failures.push(message);
    return !!ok;
  };
  const lock = (id, ok, message) => {
    if (unlock.includes(id) || unlock.includes('all')) return check(ok, `${id}: ${message}`);
    locked.push({ id, ok: !!ok, message });
    return !!ok;
  };
  const note = (text) => {
    if (!notes.includes(text)) notes.push(text);
  };
  const finish = (summary) => {
    for (const n of notes) console.log(`note: ${n}`);
    for (const l of locked) console.log(`locked ${l.id}: ${l.ok ? 'passes now – free it' : 'still red'} – ${l.message}`);
    if (failures.length) {
      console.error(failures.slice(0, 80).join('\n'));
      console.error(`FAIL: ${name}: ${failures.length} of ${checks} checks failed`);
      process.exit(1);
    }
    console.log(`PASS: ${name}: ${checks} checks passed${summary ? ` (${summary})` : ''}`);
  };
  return { check, lock, note, finish, get checks() { return checks; } };
}

export const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
export const readJson = (rel) => JSON.parse(read(rel));

const COPY_RECORDER = `(() => {
  window.__copies = [];
  const c = navigator.clipboard;
  if (c) {
    const writeText = c.writeText.bind(c);
    c.writeText = (text) => { window.__copies.push(String(text)); return writeText(text); };
  }
  const exec = document.execCommand.bind(document);
  document.execCommand = (cmd, ...rest) => {
    if (String(cmd).toLowerCase() === 'copy') {
      const a = document.activeElement;
      const sel = a && 'value' in a ? a.value.slice(a.selectionStart, a.selectionEnd) : String(getSelection());
      window.__copies.push(sel);
    }
    return exec(cmd, ...rest);
  };
})();`;

export async function startBrowser({ chrome = arg('--chrome') || CHROME } = {}) {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-cov-'));
  const { child, ws } = await launch(chrome, profile);
  const browser = cdp(ws);
  await browser.ready;
  const sessions = new Map();
  const route = (method, pick) => browser.on(method, (p, sessionId) => {
    const s = sessions.get(sessionId);
    if (s) pick(s, p);
  });
  route('Runtime.consoleAPICalled', (s, p) => {
    if (p.type === 'error' || p.type === 'assert') s.errors.push(`console.${p.type}: ${p.args.map((a) => a.value ?? a.description).join(' ')}`);
  });
  route('Runtime.exceptionThrown', (s, p) => s.errors.push(`exception: ${p.exceptionDetails.exception?.description || p.exceptionDetails.text}`));
  route('Log.entryAdded', (s, p) => {
    if (p.entry.level === 'error' && !/favicon/.test(p.entry.url || '')) s.errors.push(`log: ${p.entry.text} ${p.entry.url || ''}`);
  });
  route('Network.requestWillBeSent', (s, p) => s.requests.push(p.request.url));

  async function page({ lang = 'en' } = {}) {
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
    const s = { errors: [], requests: [], lang, width: 1280 };
    sessions.set(sessionId, s);
    const send = (method, params) => browser.send(method, params, sessionId);
    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
      if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.exception?.description || r.exceptionDetails.text}: ${expression.slice(0, 200)}`);
      return r.result.value;
    };
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Page.enable');
    await send('Network.enable');
    await send('DOM.enable');
    await send('Page.bringToFront');
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await browser.send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: base }).catch(() => {});
    await send('Page.addScriptToEvaluateOnNewDocument', { source: COPY_RECORDER });

    async function viewport(width) {
      s.width = width;
      const v = VIEWPORTS[width] || { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 };
      await send('Emulation.setDeviceMetricsOverride', v);
      await send('Emulation.setTouchEmulationEnabled', { enabled: v.mobile, maxTouchPoints: v.mobile ? 5 : 1 });
    }
    async function waitFor(expression, label, ms = 30000) {
      const start = Date.now();
      while (!(await evaluate(expression))) {
        if (Date.now() - start > ms) throw new Error(`${label}: not ready within ${ms / 1000} s`);
        await sleep(120);
      }
    }
    async function open(url, { width = s.width, lang: language = s.lang, ready = 'true', blank = true } = {}) {
      s.lang = language;
      await viewport(width);
      if (blank) {
        await send('Page.navigate', { url: 'about:blank' });
        await sleep(60);
      }
      const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', {
        source: `try { localStorage.setItem('propwash-lang', '${language}'); } catch (e) {}`,
      });
      await send('Page.navigate', { url: url.startsWith('http') ? url : `${base}${url}` });
      await waitFor(ready, url);
      await send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
      await evaluate('document.fonts.ready.then(() => true)');
      await sleep(300);
    }
    async function reload(ready) {
      await send('Page.reload', { ignoreCache: false });
      await sleep(200);
      await waitFor(ready, 'reload');
      await sleep(300);
    }
    const KEYS = { Tab: 9, Escape: 27, Enter: 13 };
    async function key(name, { shift = false } = {}) {
      const common = { key: name, code: name, windowsVirtualKeyCode: KEYS[name], nativeVirtualKeyCode: KEYS[name], modifiers: shift ? 8 : 0 };
      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...common });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
      await sleep(80);
    }
    async function tap(x, y) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, radiusX: 2, radiusY: 2, force: 1, id: 1 }] });
      await sleep(40);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(250);
    }
    async function click(x, y) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      await sleep(150);
    }
    async function center(selector) {
      return evaluate(`(() => {
        const n = document.querySelector(${JSON.stringify(selector)});
        if (!n) return null;
        n.scrollIntoView({ block: 'center', behavior: 'instant' });
        const r = n.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()`);
    }
    async function setFile(selector, file) {
      const { root } = await send('DOM.getDocument', { depth: 1 });
      const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector });
      await send('DOM.setFileInputFiles', { nodeId, files: [file] });
    }
    async function offline(on) {
      await send('Network.emulateNetworkConditions', { offline: on, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    }
    const clipboard = () => evaluate('navigator.clipboard.readText().catch((e) => "ERROR " + e.message)');
    const copies = () => evaluate('window.__copies ? window.__copies.slice() : []');
    async function shot(file, { full = false } = {}) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      let params = { format: 'png' };
      if (full) {
        const size = await evaluate('({ w: document.documentElement.clientWidth, h: document.documentElement.scrollHeight })');
        params = { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: size.w, height: Math.min(size.h, 9000), scale: 1 } };
      }
      const r = await send('Page.captureScreenshot', params);
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    }
    async function close() {
      sessions.delete(sessionId);
      await browser.send('Target.closeTarget', { targetId }).catch(() => {});
    }
    return { targetId, sessionId, send, evaluate, viewport, waitFor, open, reload, key, tap, click, center, setFile, offline, clipboard, copies, shot, close,
      errors: s.errors, requests: s.requests, base };
  }

  async function close() {
    browser.close();
    child.kill();
    server.close();
    await sleep(400);
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  return { base, page, close };
}

export function setInput(selector, value) {
  return `(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    input.value = ${JSON.stringify(value)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`;
}
