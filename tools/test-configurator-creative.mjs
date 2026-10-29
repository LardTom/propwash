#!/usr/bin/env node
// Creative drones on the website (PW3 revision 3.1 of Propwash 0.6.0) in headless Chrome, English and German, 390 and
// 1280 px wide:
//   - /convert/: a post with an old PWD1 code of the drone editor and a PW3 code with creative values – the PWD1 code
//     becomes the mod's PW3 code in place, its row says “Converted” and counts the creative values and base parts, the
//     PW3 code is only checked
//   - configurator/#PW3-… with creative values (golden vector C1 of Propwash): the build opens with the creative
//     flight controller (not as an unknown part), the banner and the check list name the creative drone, the share box
//     writes the very same code (values kept), the layer “Creative values” can be left out and taken back
//   - configurator/#PWD1-…: the old editor code opens, the address switches to its PW3 code with the creative values
//     and the banner offers “Copy PW3”; pasting the PWD1 code into the import field does the same
//   - no sideways scrolling, no console errors or uncaught exceptions
//
//   node tools/test-configurator-creative.mjs [--shots <dir>] [--chrome <path>]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, CHROME, serve, launch, cdp, sleep } from './headless-chrome.mjs';
import { createCatalog } from '../assets/js/configurator/data.js';
import { convertText } from '../assets/js/configurator/convert.js';
import { entry } from '../assets/js/configurator/i18n.js';

const catalog = createCatalog(JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/data/configurator/catalog.json'), 'utf8')));
const vectors = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures/sharecode/pw3-creative-vectors.json'), 'utf8')).vectors;
const C1 = vectors.find((v) => v.name.startsWith('C1_'));
const D1 = vectors.find((v) => v.name.startsWith('D1_'));

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

const VIEWPORTS = { 1280: { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, 390: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true } };
const text = (key, lang, vars) => {
  let out = (entry(key) || [key, key])[lang === 'de' ? 1 : 0];
  for (const [k, v] of Object.entries(vars || {})) out = out.replace(`{${k}}`, String(v));
  return out;
};

async function main() {
  const post = [`My creative whoop from the editor: ${D1.from}`, '', `New one with values: ${C1.code}`, 'Have fun!'].join('\n');
  const expected = convertText(post, catalog);
  const shots = arg('--shots');
  if (shots) fs.mkdirSync(shots, { recursive: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-creative-'));
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
      if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text}: ${expression.slice(0, 160)}`);
      return r.result.value;
    };
    browser.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error' || p.type === 'assert') errors.push(`console.${p.type}: ${p.args.map((a) => a.value ?? a.description).join(' ')}`);
    });
    browser.on('Runtime.exceptionThrown', (p) => errors.push(`exception: ${p.exceptionDetails.exception?.description || p.exceptionDetails.text}`));
    browser.on('Log.entryAdded', (p) => {
      if (p.entry.level === 'error' && !/favicon/.test(p.entry.url || '')) errors.push(`log: ${p.entry.text} ${p.entry.url || ''}`);
    });
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Page.enable');
    await send('Page.bringToFront');
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

    let language = 'en';
    async function open(url, width, label, ready) {
      await send('Emulation.setDeviceMetricsOverride', VIEWPORTS[width]);
      await send('Emulation.setTouchEmulationEnabled', { enabled: VIEWPORTS[width].mobile, maxTouchPoints: VIEWPORTS[width].mobile ? 5 : 1 });
      await send('Page.navigate', { url: 'about:blank' });
      await sleep(80);
      const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', {
        source: `try { localStorage.setItem('propwash-lang', '${language}'); } catch (e) {} document.addEventListener('propwash:viewer', (e) => { window.__viewer = e.detail; });`,
      });
      await send('Page.navigate', { url });
      const start = Date.now();
      while (!(await evaluate(ready))) {
        if (Date.now() - start > 30000) throw new Error(`${label}: page not ready within 30 s`);
        await sleep(200);
      }
      await send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
      await evaluate('document.fonts.ready.then(() => true)');
      await sleep(500);
    }
    async function shot(name) {
      if (!shots) return;
      const size = await evaluate('({ w: document.documentElement.clientWidth, h: document.documentElement.scrollHeight })');
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: size.w, height: Math.min(size.h, 9000), scale: 1 } });
      fs.writeFileSync(path.join(shots, `${name}.png`), Buffer.from(r.data, 'base64'));
    }
    const noSideways = async (label, width) => {
      const w = await evaluate('document.documentElement.scrollWidth');
      check(w <= width, `${label}: no sideways scrolling (${w} px)`);
    };
    const cfgReady = `(() => {
      const cfg = document.querySelector('[data-cfg]');
      const v = window.__viewer;
      return !!(cfg && cfg.getAttribute('aria-busy') === 'false' && v && v.current());
    })()`;
    const shareState = `(() => {
      const banner = document.querySelector('.banner');
      const layer = document.querySelector('[data-layer="creative"]');
      return {
        hash: location.hash, code: document.querySelector('[data-code]').textContent,
        banner: banner ? banner.textContent : '', bannerLevel: banner ? banner.className : '',
        buttons: banner ? [...banner.querySelectorAll('button')].map((b) => b.textContent) : [],
        checks: document.querySelector('[data-checks]').textContent,
        checksBad: !!document.querySelector('[data-checks] .checks__status.is-bad'),
        layer: layer ? { checked: layer.checked, disabled: layer.disabled, label: layer.closest('label').textContent } : null,
      };
    })()`;
    const creativeLine = (lang, v) => text('ui.importCreative', lang, { values: Object.keys(v.creative.values).length, base: Object.keys(v.creative.base).length });

    for (const lang of ['en', 'de']) {
      language = lang;
      for (const width of [1280, 390]) {
        const tag = `${lang}-${width}`;
        // ---- /convert/ with a PWD1 code and a PW3 code with creative values ----
        await open(`${base}/convert/`, width, `convert ${tag}`, "document.querySelector('[data-cv]')?.getAttribute('aria-busy') === 'false'");
        await evaluate(`(() => {
          const input = document.querySelector('[data-cv-input]');
          input.value = ${JSON.stringify(post)};
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        })()`);
        await sleep(600);
        const cv = await evaluate(`(() => ({
          result: document.querySelector('[data-cv-result]').value,
          rows: [...document.querySelectorAll('[data-cv-codes] > li')].map((li) => ({
            kind: li.className, badge: li.querySelector('.cv-code__badge').textContent, text: li.textContent,
            open: li.querySelector('a.btn') ? li.querySelector('a.btn').getAttribute('href') : null,
          })),
          status: document.querySelector('[data-cv-status]').textContent,
        }))()`);
        check(cv.result === post.replace(D1.from, D1.pw3) && cv.result === expected.text, `convert ${tag}: PWD1 code replaced by its PW3 code`);
        check(cv.rows.length === 2, `convert ${tag}: ${cv.rows.length} rows`);
        const [editorRow, pw3Row] = cv.rows;
        check(editorRow && editorRow.kind.includes('is-converted') && editorRow.badge === text('convert.status.converted', lang), `convert ${tag}: PWD1 row ${editorRow && editorRow.badge}`);
        check(editorRow && editorRow.text.includes(creativeLine(lang, D1)), `convert ${tag}: PWD1 row counts the creative values (${editorRow && editorRow.text})`);
        check(editorRow && editorRow.open && editorRow.open.endsWith(`/configurator/#${D1.pw3}`), `convert ${tag}: PWD1 row opens ${D1.pw3}`);
        check(pw3Row && pw3Row.kind.includes('is-pw3') && pw3Row.text.includes(creativeLine(lang, C1)), `convert ${tag}: PW3 row with creative values ${pw3Row && pw3Row.text}`);
        check(!cv.status.includes(text('convert.status.unknown', lang)), `convert ${tag}: status line without unknown parts “${cv.status}”`);
        await noSideways(`convert ${tag}`, width);
        await shot(`creative-convert-${tag}`);

        // ---- configurator/#PW3-… with creative values ----
        await open(`${base}/configurator/#${C1.code}`, width, `creative link ${tag}`, cfgReady);
        let s = await evaluate(shareState);
        check(s.hash === `#${C1.code}`, `creative link ${tag}: address ${s.hash}`);
        check(s.code === C1.code, `creative link ${tag}: share box keeps the creative values (${s.code})`);
        check(s.banner.includes(text('ui.layers.creative', lang)) && s.banner.includes(creativeLine(lang, C1)), `creative link ${tag}: banner “${s.banner}”`);
        check(!s.banner.includes(text('ui.importUnknown', lang, { ids: '' }).trim()), `creative link ${tag}: the creative FC is no unknown part (“${s.banner}”)`);
        check(s.checks.includes(text('ui.creativeExplain', lang)) && !s.checksBad, `creative link ${tag}: check list explains the creative drone (“${s.checks}”)`);
        check(s.layer && s.layer.checked && !s.layer.disabled && s.layer.label.includes(text('ui.layers.creative', lang)), `creative link ${tag}: layer box ${JSON.stringify(s.layer)}`);
        await noSideways(`creative link ${tag}`, width);
        await shot(`creative-link-${tag}`);
        if (width === 1280) {
          const without = catalog.encode({ ...C1.content, creative: null });
          await evaluate(`(() => { const c = document.querySelector('[data-layer="creative"]'); if (c) c.click(); return !!c; })()`);
          await sleep(300);
          s = await evaluate(shareState);
          check(s.code === without, `creative link ${tag}: without the layer the code has no creative values (${s.code})`);
          await evaluate(`(() => { const c = document.querySelector('[data-layer="creative"]'); if (c) c.click(); return !!c; })()`);
          await sleep(300);
          s = await evaluate(shareState);
          check(s.code === C1.code, `creative link ${tag}: the layer comes back (${s.code})`);
        }

        // ---- configurator/#PWD1-… ----
        await open(`${base}/configurator/#${D1.from}`, width, `PWD1 link ${tag}`, cfgReady);
        s = await evaluate(shareState);
        check(s.hash === `#${D1.pw3}`, `PWD1 link ${tag}: address switched to ${s.hash}`);
        check(s.code === D1.pw3, `PWD1 link ${tag}: share box ${s.code}`);
        check(s.banner.includes(text('convert.converted', lang, { format: 'PWD1' })) && s.buttons.includes(text('convert.copyPw3', lang)), `PWD1 link ${tag}: banner “${s.banner}” ${s.buttons}`);
        check(s.banner.includes(creativeLine(lang, D1)), `PWD1 link ${tag}: banner counts the creative values`);
        await noSideways(`PWD1 link ${tag}`, width);
        await shot(`creative-pwd1-link-${tag}`);

        // ---- PWD1 code pasted into the import field (over a preset) ----
        if (width === 1280) {
          await open(`${base}/configurator/`, width, `PWD1 paste ${tag}`, cfgReady);
          await evaluate(`(() => {
            const input = document.querySelector('[data-import]');
            input.value = ${JSON.stringify(D1.from)};
            input.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
          })()`);
          await sleep(900);
          s = await evaluate(shareState);
          check(s.code === D1.pw3 && s.hash === `#${D1.pw3}`, `PWD1 paste ${tag}: ${s.code} ${s.hash}`);
          const preview = await evaluate("document.querySelector('[data-import-result]').textContent");
          check(preview.includes(text('ui.layers.creative', lang)) && preview.includes(creativeLine(lang, D1)), `PWD1 paste ${tag}: preview “${preview}”`);
        }
      }
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
  for (const e of errors) check(false, e);
  if (failures.length) {
    console.log(`FAIL: ${checks - failures.length}/${checks} checks passed`);
    for (const f of failures) console.log(`  ${f}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${checks} checks – PWD1 and creative PW3 codes in the converter and the configurator, English and German, 390 and 1280 px`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
