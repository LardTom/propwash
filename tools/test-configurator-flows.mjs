#!/usr/bin/env node
// The share-code flows of Propwash 0.6.0 in headless Chrome, English and German, 390 and 1280 px wide:
//   - /convert/: a post with several old codes (and a configurator link) is converted in place – the result field is
//     exactly convert.js's text, one list row per code with a working "Open in the configurator" link; the status
//     line counts them; no sideways scrolling
//   - configurator/#PW2…: an old link loads the build, the address switches to the PW3 code of the conversion, the
//     banner says so and offers "Copy PW3"; pasting an old code into the import field does the same
//   - figure explanations: hover, keyboard focus and a tap on the info button open the text with the class range,
//     Escape closes it; every figure of the analysis has one
//   - builds for beginners: three cards with picture, figures and buttons, "Load" loads the preset
//   - battery plugged in: the default preset is drawn with the mounted stack and without plugs and leads
//   - no console errors or uncaught exceptions
//
//   node tools/test-configurator-flows.mjs [--post <text file>] [--shots <dir>] [--chrome <path>]
//
// --post: the post to convert (a real Discord post stays outside the repository); without it a post is made from the
// golden PW1 and PW2 codes. --shots: screenshots of every page, width and language go there (for reviewers).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, CHROME, serve, launch, cdp, sleep } from './headless-chrome.mjs';
import { createCatalog } from '../assets/js/configurator/data.js';
import { convertText } from '../assets/js/configurator/convert.js';
import { entry } from '../assets/js/configurator/i18n.js';

const catalog = createCatalog(JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/data/configurator/catalog.json'), 'utf8')));
const conversions = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures/sharecode/pw3-conversions.json'), 'utf8')).vectors;

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
const text = (key, lang) => entry(key)[lang === 'de' ? 1 : 0];

function defaultPost() {
  const pick = (name) => conversions.find((v) => v.name === name).from;
  const pw2 = pick('PW2/preset/justmoreparts:bash5_6s/preset');
  const pw2b = pick('PW2/preset/propwash:whoop/actual_name');
  const pw1 = pick('PW1/preset/propwash:freestyle/parts');
  return [
    'My 5″ basher, flies great!',
    `Code: ${pw2}`,
    '',
    `Whoop for indoors: ${pw2b}`,
    `Old link: https://propwashfpv.com/configurator/#${pw1}`,
    'Have fun flying!',
  ].join('\n');
}

async function main() {
  const postFile = arg('--post');
  const post = postFile ? fs.readFileSync(postFile, 'utf8') : defaultPost();
  const expected = convertText(post, catalog);
  check(expected.found >= 3 && expected.codes.some((c) => c.kind === 'converted'), `the post holds several old codes (${expected.found})`);
  const shots = arg('--shots');
  if (shots) fs.mkdirSync(shots, { recursive: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-flows-'));
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
    await send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: base }).catch(() => {});

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
      return !!(cfg && cfg.getAttribute('aria-busy') === 'false' && v && v.current() && v.current().assembly.pieces.length);
    })()`;

    for (const lang of ['en', 'de']) {
      language = lang;
      for (const width of [1280, 390]) {
        const tag = `${lang}-${width}`;
        // ---- /convert/ ----
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
          outputHidden: document.querySelector('[data-cv-output]').hidden,
          rows: [...document.querySelectorAll('[data-cv-codes] > li')].map((li) => ({
            kind: li.className, badge: li.querySelector('.cv-code__badge').textContent,
            open: li.querySelector('a.btn') ? li.querySelector('a.btn').getAttribute('href') : null,
          })),
          status: document.querySelector('[data-cv-status]').textContent,
          lang: document.documentElement.lang,
        }))()`);
        check(cv.lang === lang, `convert ${tag}: page language ${cv.lang}`);
        check(!cv.outputHidden && cv.result === expected.text, `convert ${tag}: converted text in the result field`);
        check(cv.rows.length === expected.codes.length, `convert ${tag}: ${cv.rows.length} rows for ${expected.codes.length} codes`);
        expected.codes.forEach((c, i) => {
          const row = cv.rows[i] || {};
          check(String(row.kind).includes(`is-${c.kind}`) && row.badge === text(`convert.status.${c.kind}`, lang), `convert ${tag}: row ${i} ${row.badge}`);
          if (c.code && c.kind !== 'damaged') check(row.open && row.open.endsWith(`/configurator/#${c.code}`), `convert ${tag}: row ${i} opens ${c.code}`);
        });
        check(cv.status.length > 10, `convert ${tag}: status line "${cv.status}"`);
        await noSideways(`convert ${tag}`, width);
        await shot(`convert-${tag}`);
        // "Open in the configurator" of the first converted code.
        const first = expected.codes.find((c) => c.kind === 'converted');
        if (width === 1280 && first) {
          await open(`${base}/configurator/#${first.code}`, width, `configurator from the converter ${tag}`, cfgReady);
          const hash = await evaluate('location.hash');
          check(hash === `#${first.code}`, `configurator ${tag}: opened with ${hash}`);
          check(await evaluate('!document.querySelector(".banner.is-bad")'), `configurator ${tag}: the PW3 code loads`);
        }

        // ---- configurator/#PW2… ----
        const old = expected.codes.find((c) => c.kind === 'converted' && c.format === 'PW2') || first;
        await open(`${base}/configurator/#${old.from}`, width, `old link ${tag}`, cfgReady);
        const link = await evaluate(`(() => {
          const banner = document.querySelector('.banner');
          return { hash: location.hash, banner: banner ? banner.textContent : '', copy: banner ? [...banner.querySelectorAll('button')].map((b) => b.textContent) : [],
            code: document.querySelector('[data-code]').textContent, plugsHidden: window.__viewer.current().assembly.plugsHidden };
        })()`);
        check(link.hash === `#${old.code}`, `old link ${tag}: address switched to ${link.hash} (want #${old.code})`);
        check(link.banner.includes(text('convert.converted', lang).replace('{format}', old.format)), `old link ${tag}: banner “${link.banner}”`);
        check(link.copy.includes(text('convert.copyPw3', lang)), `old link ${tag}: “Copy PW3” button (${link.copy})`);
        check(link.code.startsWith('PW3-'), `old link ${tag}: share box shows a PW3 code (${link.code})`);
        await noSideways(`old link ${tag}`, width);
        await shot(`configurator-old-link-${tag}`);

        // ---- Figure explanations ----
        const help = await evaluate(`(async () => {
          const buttons = [...document.querySelectorAll('[data-stats] [data-stat-help]')];
          const b = document.querySelector('[data-stats] [data-stat-help="thrust_to_weight"]');
          b.scrollIntoView({ block: 'center', behavior: 'instant' });
          b.focus();
          await new Promise((r) => setTimeout(r, 120));
          const tip = document.querySelector('[data-stat-tip]');
          const shown = !tip.hidden ? tip.textContent : null;
          const described = document.getElementById(b.getAttribute('aria-describedby'))?.textContent || '';
          b.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          await new Promise((r) => setTimeout(r, 60));
          const closed = tip.hidden;
          return { count: buttons.length, shown, described, closed, keys: [...document.querySelectorAll('[data-keystats] [data-stat-help]')].length };
        })()`);
        check(help.count === 20 && help.keys === 5, `stat help ${tag}: ${help.count} figures and ${help.keys} key figures with an info button`);
        check(help.shown && help.shown.includes(text('statHelp.thrust_to_weight', lang).slice(0, 30)), `stat help ${tag}: focus opens the text (${help.shown})`);
        check(help.described.includes(text('statHelp.thrust_to_weight', lang).slice(0, 30)), `stat help ${tag}: aria-describedby carries the text`);
        check(help.closed, `stat help ${tag}: Escape closes it`);
        // A tap or click pins it open.
        const pinned = await evaluate(`(async () => {
          const b = document.querySelector('[data-stats] [data-stat-help="hover_throttle_percent"]');
          b.click();
          await new Promise((r) => setTimeout(r, 80));
          const tip = document.querySelector('[data-stat-tip]');
          const r = tip.getBoundingClientRect();
          return { open: !tip.hidden, inside: r.left >= 0 && r.right <= innerWidth, text: tip.textContent };
        })()`);
        check(pinned.open && pinned.inside, `stat help ${tag}: a tap opens it inside the window`);
        await shot(`configurator-stat-help-${tag}`);
        await evaluate("(document.querySelector('[data-stat-tip]').hidden = true, true)");

        // ---- Builds for beginners ----
        const cards = await evaluate(`(() => [...document.querySelectorAll('[data-beginner] .beginner__card')].map((c) => ({
          name: c.querySelector('.beginner__name').textContent, img: c.querySelector('img').complete && c.querySelector('img').naturalWidth > 0,
          buttons: c.querySelectorAll('button').length })))()`);
        check(cards.length === 3 && cards.every((c) => c.img && c.buttons === 2), `beginner ${tag}: three cards with picture and buttons (${JSON.stringify(cards)})`);
        await evaluate("(document.querySelector('[data-beginner] .beginner__card button').click(), true)");
        await sleep(400);
        check(await evaluate("document.querySelector('[data-preset]').value === 'propwash:whoop'"), `beginner ${tag}: “Load” loads the whoop`);
        await noSideways(`beginner ${tag}`, width);
      }
      // ---- Pasting an old code into the import field ----
      language = lang;
      await open(`${base}/configurator/`, 1280, `paste ${lang}`, cfgReady);
      const pasted = conversions.find((v) => v.name === 'PW1/preset/justmoreparts:race5_4s/preset');
      await evaluate(`(() => {
        const input = document.querySelector('[data-import]');
        input.value = ${JSON.stringify(pasted.from)};
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`);
      await sleep(900);
      const after = await evaluate("({ hash: location.hash, banner: document.querySelector('.banner')?.textContent || '' })");
      check(after.hash === `#${pasted.pw3}`, `paste ${lang}: address ${after.hash} (want #${pasted.pw3})`);
      check(after.banner.includes(text('convert.converted', lang).replace('{format}', 'PW1')), `paste ${lang}: banner “${after.banner}”`);
      const plugged = await evaluate("({ hidden: window.__viewer.current().assembly.plugsHidden, leads: window.__viewer.current().assembly.pieces.filter((p) => p.role === 'power_lead').length })");
      check(plugged.hidden === true && plugged.leads === 0, `paste ${lang}: the battery is plugged in, plugs and leads hidden (${JSON.stringify(plugged)})`);
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
  console.log(`flows: ${checks} checks passed (converter with ${expected.found} codes, old link, pasted code, figure explanations, builds for beginners; `
    + `en/de at 1280 and 390 px)${shots ? `; screenshots in ${shots}` : ''}`);
}

main().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
