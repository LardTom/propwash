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
//   - the creative flight controller in the part picker (Stack): badge “Creative”, fits every frame, the note with the
//     rules of the game; picked, the tab “Drone Editor” shows up and the share code carries the layer “Creative
//     values” like the game's; taken out again, the tab goes and the code has no creative values (put back, they return)
//   - the drone editor: groups and keys of the mod, a value of its own (highlighted, in the code, in the key figures
//     like analysis.js computes them), clamped to the mod's range with a note, back to the base value with ↺, with
//     Enter and Escape on the keyboard, a right-click and a tap on +; a preset as template computes exactly like the
//     preset; the notes of CreativeCheck; the camera uptilt 0–80° (also the FPV view's slider), in the code's tune
//   - every share code the page writes for a creative drone reads back to the same content and is written again byte
//     for byte (the PW3 codec of the mod, tools/test-configurator.mjs)
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
import { analyze } from '../assets/js/configurator/analysis.js';
import { templateOf, CREATIVE_FC } from '../assets/js/configurator/creative.js';

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
// Numbers as the page shows them (i18n.js num).
const fmt = (value, decimals, lang) => new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
const FIGURES = ['mass_grams', 'thrust_to_weight', 'hover_throttle_percent', 'top_speed_kmh', 'mixed_flight_time_min', 'full_throttle_current_a'];
const figureTexts = (a, lang) => FIGURES.map((key) => {
  const [, , unit, decimals] = entry(`stats.${key}`);
  return Number.isFinite(a[key]) ? `${fmt(a[key], decimals, lang)}${unit.startsWith(':') ? unit : `\u00A0${unit}`}` : '';
});
/** The content of a code as the page encodes it again: the same code (a code the page writes reads back unchanged). */
const roundTrip = (code) => {
  const d = catalog.decode(code);
  return d.ok && catalog.encode(d.content) === code ? d : null;
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
    const code = () => evaluate("document.querySelector('[data-code]').textContent");
    const click = (selector) => evaluate(`(() => { const n = document.querySelector(${JSON.stringify(selector)}); if (n) n.click(); return !!n; })()`);
    const setField = (id, value, how = 'change') => evaluate(`(() => {
      const n = document.getElementById(${JSON.stringify(id)});
      if (!n) return false;
      n.focus();
      n.value = ${JSON.stringify(String(value))};
      n.dispatchEvent(new Event('input', { bubbles: true }));
      if (${JSON.stringify(how)} === 'change') n.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    const editorState = () => evaluate(`(() => {
      const tab = document.querySelector('#tab-creative');
      const row = (key) => document.querySelector('[data-ce-row="' + key + '"]');
      const input = (key) => row(key) && row(key).querySelector('[data-ce-key]');
      const panel = document.querySelector('#panel-creative');
      return {
        tab: !!tab && !tab.hidden, selected: !!tab && tab.getAttribute('aria-selected') === 'true', panelShown: !!panel && !panel.hidden,
        groups: [...document.querySelectorAll('#panel-creative .ce-group legend')].map((l) => l.textContent),
        rows: [...document.querySelectorAll('#panel-creative [data-ce-row]')].map((r) => r.dataset.ceRow),
        kv: input('motor.kv') ? input('motor.kv').value : null, kvOwn: !!row('motor.kv') && row('motor.kv').classList.contains('is-changed'),
        kvReset: !!row('motor.kv') && !row('motor.kv').querySelector('[data-ce-reset]').disabled,
        rollAuto: !!row('inertia.roll') && !row('inertia.roll').querySelector('.ce-auto').hidden,
        status: (document.querySelector('[data-ce-status]') || {}).textContent || '',
        note: (document.querySelector('[data-ce-note="motor.kv"]') || {}).textContent || '',
        figures: [...document.querySelectorAll('[data-ce-figures] dd')].map((d) => d.textContent),
        notes: [...document.querySelectorAll('[data-ce-notes] li')].map((d) => d.textContent),
        tilt: input('camera.uptiltDeg') ? input('camera.uptiltDeg').value : null,
        fpvMax: document.querySelector('[data-fpv-tilt]').max,
        bases: [...document.querySelectorAll('[data-ce-base]')].map((s) => s.value),
        layer: !!document.querySelector('[data-layer="creative"]'),
        sw: document.documentElement.scrollWidth,
      };
    })()`);
    async function pick(category, id) {
      await click(`[data-slots] [data-cat="${category}"]`);
      await sleep(250);
      await evaluate(`(() => { const n = [...document.querySelectorAll('#list-${category} [role="option"]')].find((o) => o.dataset.id === ${JSON.stringify(id)}); if (n) n.click(); return !!n; })()`);
      await sleep(400);
    }
    const pickStack = (id) => pick('stack', id);
    /** The share code of the page: reads back to the same content and is written again byte for byte. */
    async function codeCheck(label, test) {
      const c = await code();
      const d = roundTrip(c);
      check(d, `${label}: the code ${c} reads back and is written again byte for byte`);
      if (d && test) check(test(d.content), `${label}: content of the code ${JSON.stringify(d.content.creative)} ${JSON.stringify(d.content.build)}`);
      return d;
    }

    async function editorFlow(lang, width, tag) {
      const preset = 'propwash:freestyle';
      const pb = catalog.presetBuild(preset);
      await open(`${base}/configurator/#${catalog.encode(catalog.presetContent(preset))}`, width, `editor ${tag}`, cfgReady);
      // The creative FC in the picker: badge, fit, note
      await click('[data-slots] [data-cat="stack"]');
      await sleep(250);
      const option = await evaluate(`(() => {
        const n = [...document.querySelectorAll('#list-stack [role="option"]')].find((o) => o.dataset.id === ${JSON.stringify(CREATIVE_FC)});
        return n ? { cls: n.className, badge: (n.querySelector('.badge--creative') || {}).textContent || '', title: (n.querySelector('.badge--creative') || {}).title || '' } : null;
      })()`);
      check(option && option.badge === text('creative.badge', lang) && option.title === text('creative.badgeLong', lang) && option.cls.includes('is-ok'),
        `editor ${tag}: the creative FC in the stack list with its badge, fitting (${JSON.stringify(option)})`);
      let e = await editorState();
      check(!e.tab, `editor ${tag}: no drone editor without the creative FC`);
      await pickStack(CREATIVE_FC);
      e = await editorState();
      const pickNote = await evaluate("(document.querySelector('.ce-pick-note') || {}).textContent || ''");
      check(pickNote.includes(text('creative.note', lang)), `editor ${tag}: the picker names the rules of the creative FC (“${pickNote}”)`);
      check(e.tab && !e.selected && e.layer, `editor ${tag}: the tab “Drone Editor” and the layer “Creative values” show up (${JSON.stringify({ tab: e.tab, layer: e.layer })})`);
      const installed = { ...pb, stack: CREATIVE_FC, accessories: { ...pb.accessories } };
      await codeCheck(`editor ${tag} creative FC`, (c) => c.build.stack === CREATIVE_FC && c.creative && !Object.keys(c.creative.values).length && !Object.keys(c.creative.base).length);
      // The editor
      await click('#tab-creative');
      await sleep(300);
      e = await editorState();
      check(e.selected && e.panelShown, `editor ${tag}: the tab opens`);
      check(e.groups.length === 8 && e.groups[0] === text('creative.group.mass', lang) && e.groups[7] === text('creative.group.camera', lang), `editor ${tag}: the mod's groups ${e.groups}`);
      check(e.rows.length === 45 + 1 + 5, `editor ${tag}: 45 values, the camera uptilt and 5 base parts (${e.rows.length})`);
      check(e.kv === '1750' && !e.kvOwn && !e.kvReset && e.rollAuto, `editor ${tag}: base value 1750 KV, the inertia automatic (${JSON.stringify({ kv: e.kv, own: e.kvOwn, auto: e.rollAuto })})`);
      check(JSON.stringify(e.figures) === JSON.stringify(figureTexts(analyze(installed, catalog, { base: {}, values: {} }), lang)), `editor ${tag}: key figures ${e.figures}`);
      check(e.fpvMax === '80', `editor ${tag}: the camera angle of a creative drone goes up to 80° (${e.fpvMax})`);
      // A value of its own
      await setField('ce-motor-kv', 2600);
      await sleep(250);
      e = await editorState();
      let want = analyze(installed, catalog, { base: {}, values: { 'motor.kv': 2600 } });
      check(e.kv === '2600' && e.kvOwn && e.kvReset && e.rollAuto, `editor ${tag}: KV of its own, highlighted (${JSON.stringify({ kv: e.kv, own: e.kvOwn })})`);
      check(JSON.stringify(e.figures) === JSON.stringify(figureTexts(want, lang)), `editor ${tag}: key figures with 2600 KV ${e.figures} vs ${figureTexts(want, lang)}`);
      await codeCheck(`editor ${tag} 2600 KV`, (c) => c.creative.values['motor.kv'] === 2600 && Object.keys(c.creative.values).length === 1);
      // Clamped with a note
      await setField('ce-motor-kv', 99999);
      await sleep(250);
      e = await editorState();
      const clamped = text('creative.clamped', lang, { name: text('creative.param.motor.kv', lang), value: `${fmt(60000, 0, lang)} KV` });
      check(e.kv === '60000' && e.status === clamped && e.note === clamped, `editor ${tag}: clamped to the mod's range with a note (“${e.status}”, field ${e.kv})`);
      await codeCheck(`editor ${tag} clamped`, (c) => c.creative.values['motor.kv'] === 60000);
      // Back to the base value
      await click('[data-ce-reset="motor.kv"]');
      await sleep(250);
      e = await editorState();
      check(e.kv === '1750' && !e.kvOwn, `editor ${tag}: ↺ goes back to the base value (${e.kv})`);
      await codeCheck(`editor ${tag} reset`, (c) => !('motor.kv' in c.creative.values));
      // Keyboard: Enter commits, Escape takes the typing back
      await setField('ce-motor-kv', 2200, 'input');
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await sleep(250);
      e = await editorState();
      check(e.kv === '2200' && e.kvOwn, `editor ${tag}: Enter commits a typed value (${e.kv})`);
      await setField('ce-motor-kv', 3333, 'input');
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await sleep(250);
      e = await editorState();
      check(e.kv === '2200', `editor ${tag}: Escape takes the typing back (${e.kv})`);
      // + by touch (390 px) or mouse, right-click back to the base (1280 px)
      const plus = await evaluate(`(() => { const b = document.querySelector('[data-ce-step="1"][data-ce-for="motor.kv"]'); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await sleep(150);
      if (VIEWPORTS[width].mobile) {
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: plus.x, y: plus.y }] });
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: plus.x, y: plus.y, button: 'left', clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: plus.x, y: plus.y, button: 'left', clickCount: 1 });
      }
      await sleep(300);
      e = await editorState();
      check(e.kv === '2210', `editor ${tag}: ${VIEWPORTS[width].mobile ? 'a tap' : 'a click'} on + adds a step of 10 KV (${e.kv})`);
      if (!VIEWPORTS[width].mobile) {
        const label = await evaluate(`(() => { const l = document.querySelector('[data-ce-row="motor.kv"] .tune__label'); const r = l.getBoundingClientRect(); return { x: r.left + 8, y: r.top + r.height / 2 }; })()`);
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: label.x, y: label.y, button: 'right', clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: label.x, y: label.y, button: 'right', clickCount: 1 });
        await sleep(300);
        e = await editorState();
        check(e.kv === '1750' && !e.kvOwn, `editor ${tag}: a right-click goes back to the base value (${e.kv})`);
      } else {
        await click('[data-ce-reset="motor.kv"]');
        await sleep(200);
      }
      // A preset as template computes exactly like the preset (with the preset's video system: it is never a base part)
      const racer = catalog.presetBuild('propwash:racer');
      await click('#tab-parts');
      await pick('video', racer.video);
      await click('#tab-creative');
      await sleep(200);
      await evaluate(`(() => { const s = document.querySelector('[data-ce-template]'); s.value = 'propwash:racer'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
      await click('[data-ce-load]');
      await sleep(300);
      e = await editorState();
      const viaTemplate = analyze({ ...installed, video: racer.video }, catalog, templateOf(racer));
      const plain = analyze(racer, catalog);
      check(['mass_grams', 'thrust_to_weight', 'hover_throttle_percent', 'top_speed_kmh', 'mixed_flight_time_min', 'full_throttle_current_a'].every((k) => Object.is(viaTemplate[k], plain[k])),
        `editor ${tag}: the racer as template computes exactly like the racer preset`);
      check(JSON.stringify(e.figures) === JSON.stringify(figureTexts(plain, lang)) && e.status === text('creative.template.loaded', lang, { name: catalog.presetName('propwash:racer', lang) }),
        `editor ${tag}: template loaded, the figures of the racer ${e.figures} (“${e.status}”)`);
      check(JSON.stringify(e.bases) === JSON.stringify(['race_5', 'stack_30', 'm2306_1860', 'p51_29_3b', 'b6s_1100']), `editor ${tag}: base parts of the racer ${e.bases}`);
      await codeCheck(`editor ${tag} template`, (c) => c.creative.base.frame === 'race_5' && c.creative.base.motor === 'm2306_1860' && !Object.keys(c.creative.values).length);
      // CreativeCheck: inertia far below the automatic value
      await setField('ce-inertia-roll', 1);
      await sleep(250);
      e = await editorState();
      check(e.notes.includes(text('creative.warning.inertia_low', lang)), `editor ${tag}: the note on a very low inertia (${e.notes})`);
      // Camera uptilt 0–80°
      await setField('ce-camera-uptiltDeg', 75);
      await sleep(250);
      e = await editorState();
      check(e.tilt === '75', `editor ${tag}: camera uptilt 75° (${e.tilt})`);
      await codeCheck(`editor ${tag} uptilt`, (c) => c.tune && c.tune['camera.uptiltDeg'] === 75 && c.creative.values['inertia.roll'] === 1);
      await noSideways(`editor ${tag}`, width);
      await shot(`creative-editor-${tag}`);
      // Taken out, the values stay with the controller; put back, they return
      await click('#tab-parts');
      await pickStack('propwash:stack_30');
      e = await editorState();
      check(!e.tab && !e.layer, `editor ${tag}: another stack, no drone editor and no creative layer`);
      await codeCheck(`editor ${tag} stack 30`, (c) => c.creative === null && c.build.stack === 'propwash:stack_30' && c.tune['camera.uptiltDeg'] === 50);
      await pickStack(CREATIVE_FC);
      await codeCheck(`editor ${tag} back`, (c) => c.creative && c.creative.base.frame === 'race_5' && c.creative.values['inertia.roll'] === 1);
      await noSideways(`editor ${tag} back`, width);
    }

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
        check(s.checks.includes(text('creative.checks', lang)) && s.checks.includes(text('creative.openEditor', lang)), `creative link ${tag}: check list names the creative drone (“${s.checks}”)`);
        check(s.buttons.includes(text('creative.openEditor', lang)), `creative link ${tag}: the banner leads to the drone editor (${s.buttons})`);
        {
          // The page rates the creative drone like analysis.js with its values (the keystats of the 3D view).
          const want = analyze(C1.content.build, catalog, C1.creative);
          const keystats = await evaluate("[...document.querySelectorAll('[data-keystats] dd')].map((d) => d.textContent)");
          check(want && keystats.some((x) => x.includes(fmt(want.thrust_to_weight, 1, lang))) && keystats.some((x) => x.includes(fmt(want.mass_grams, 1, lang))),
            `creative link ${tag}: key figures with the creative values ${keystats} (thrust/weight ${want && want.thrust_to_weight})`);
        }
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

        // ---- the drone editor ----
        await editorFlow(lang, width, tag);

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
    console.log(`PASS: ${checks} checks: PWD1 and creative PW3 codes in the converter and the configurator, the creative flight controller in the picker and its drone editor, English and German, 390 and 1280 px`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
