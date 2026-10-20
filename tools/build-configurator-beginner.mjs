#!/usr/bin/env node
// Takes the pictures of the builds for beginners (assets/data/configurator/beginner.json): every preset in the
// configurator's 3D view, drawn like the picture export "Drone as PNG" (the drone alone, transparent, always from the
// same angle), centred on a 16:10 canvas.
//
//   node tools/build-configurator-beginner.mjs [--chrome <path>]
//
// Serves this folder on a free local port and opens configurator/#<PW3 code of the preset> in headless Chrome
// (English, reduced motion). Target: assets/data/configurator/<image of the build> as WebP (WIDTH × HEIGHT, alpha).
// Needs Google Chrome and cwebp. Run it again when a beginner preset or the drone renderer changes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, CHROME, serve, launch, cdp, sleep } from './headless-chrome.mjs';
import { createCatalog } from '../assets/js/configurator/data.js';

const DATA = path.join(ROOT, 'assets/data/configurator');
const WIDTH = 480;
const HEIGHT = 300;

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function main() {
  const catalog = createCatalog(JSON.parse(fs.readFileSync(path.join(DATA, 'catalog.json'), 'utf8')));
  const beginner = JSON.parse(fs.readFileSync(path.join(DATA, 'beginner.json'), 'utf8'));
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-beginner-'));
  const { child, ws } = await launch(arg('--chrome', CHROME), profile);
  const browser = cdp(ws);
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
    for (const build of beginner.builds) {
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
      if (!data) throw new Error(`${build.preset}: nothing drawn`);
      const png = path.join(profile, 'shot.png');
      fs.writeFileSync(png, Buffer.from(data.split(',')[1], 'base64'));
      const target = path.join(DATA, build.image);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      execFileSync('cwebp', ['-quiet', '-q', '86', '-alpha_q', '100', '-m', '6', '-metadata', 'none', '-resize', String(WIDTH), String(HEIGHT), png, '-o', target]);
      console.log(`${path.relative(ROOT, target)}  ${WIDTH} × ${HEIGHT}  (${build.preset}, ${code})`);
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
