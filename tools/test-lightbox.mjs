#!/usr/bin/env node
// The lightbox of the landing page (owner finding OF-9: “you only get out with Escape”): the screenshot viewer has one
// close button, top right, that is easy to see and to hit, and a click beside the picture closes it as well.
//   - index.html: exactly one [data-lightbox-close], a direct child of the dialog (not in the caption bar at the
//     bottom), with a visible label “Close” / „Schließen“
//   - headless Chrome at 1280 px, 1728 px Retina (2×), 2560 px and 390 px (touch, 3×), English and German, opened from
//     the zoom button of a picture (Freecam card) and from the gallery (its largest pictures):
//     the button is fully on screen in the top right corner, at least 44 × 44 px, not covered by anything and not
//     over the picture, in the accent colour (contrast to the dark viewer at least 3:1), focused when the viewer opens;
//     a click or tap on it closes the viewer and gives the focus back; a click or tap beside the picture closes it, a
//     click on the picture does not; Escape closes it; no script errors
//
//   node tools/test-lightbox.mjs [--no-browser]

import fs from 'node:fs';
import path from 'node:path';
import { counter, flag, startBrowser, ROOT, sleep } from './fixtures/cov/browser.mjs';

const { check, finish } = counter('lightbox');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// 1. The markup.
const dialog = (/<dialog class="lightbox"[\s\S]*?<\/dialog>/.exec(html) || [''])[0];
check(dialog, 'index.html has the lightbox dialog');
const closers = [...dialog.matchAll(/<button[^>]*data-lightbox-close[^>]*>[\s\S]*?<\/button>/g)].map((m) => m[0]);
check(closers.length === 1, `exactly one close button in the viewer (${closers.length})`);
const bar = (/<div class="lightbox__bar">[\s\S]*?<\/div>\s*<\/div>/.exec(dialog) || [''])[0];
check(bar && !bar.includes('data-lightbox-close'), 'the close button is not in the caption bar at the bottom');
check(closers[0] && /<span lang="en">Close<\/span>/.test(closers[0]) && /<span lang="de">Schließen<\/span>/.test(closers[0]),
  'the close button says “Close” / „Schließen“');

// 2. In the browser.
const VIEWS = [
  { name: '1280 px', width: 1280, height: 900, deviceScaleFactor: 1, mobile: false },
  { name: '1728 px Retina', width: 1728, height: 1000, deviceScaleFactor: 2, mobile: false },
  { name: '2560 px', width: 2560, height: 1440, deviceScaleFactor: 1, mobile: false },
  { name: '390 px', width: 390, height: 844, deviceScaleFactor: 3, mobile: true },
];

const STATE = `(() => {
  const d = document.querySelector('[data-lightbox]');
  const b = document.querySelector('[data-lightbox-close]');
  const img = document.querySelector('[data-lightbox-img]');
  const r = b.getBoundingClientRect();
  const i = img.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  const lum = (c) => {
    const v = (c.match(/[\\d.]+/g) || [0, 0, 0]).slice(0, 3).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const bg = lum(getComputedStyle(b).backgroundColor);
  const under = lum(getComputedStyle(d).backgroundColor);
  const contrast = (Math.max(bg, under) + 0.05) / (Math.min(bg, under) + 0.05);
  return {
    open: d.open, vw: innerWidth, vh: innerHeight,
    box: [r.left, r.top, r.width, r.height].map(Math.round),
    img: [i.left, i.top, i.width, i.height].map(Math.round),
    loaded: img.complete && img.naturalWidth > 1,
    hit: !!hit && (hit === b || b.contains(hit)),
    visible: getComputedStyle(b).visibility === 'visible' && getComputedStyle(b).display !== 'none' && Number(getComputedStyle(b).opacity) > 0.9,
    label: b.innerText.trim(),
    contrast: Math.round(contrast * 10) / 10,
    focused: document.activeElement === b,
    stage: (() => { const s = document.querySelector('.lightbox__stage').getBoundingClientRect(); return [s.left, s.top, s.width, s.height].map(Math.round); })(),
  };
})()`;

async function waitOpen(tab, open = true) {
  for (let i = 0; i < 40; i++) {
    const s = await tab.evaluate(STATE);
    if (s.open === open && (!open || s.loaded)) return s;
    await sleep(100);
  }
  return tab.evaluate(STATE);
}

async function press(tab, view, x, y) {
  if (view.mobile) await tab.tap(x, y);
  else await tab.click(x, y);
}

/** Opens the viewer from the zoom button of the Freecam card or from the last gallery picture; returns the state. */
async function openFrom(tab, view, from) {
  const selector = from === 'zoom' ? '#new .zoom-btn' : '[data-gallery] li:last-child a';
  const at = await tab.center(selector);
  if (!at) return null;
  await sleep(200);
  const again = await tab.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await press(tab, view, again.x, again.y);
  return waitOpen(tab, true);
}

if (!flag('--no-browser')) {
  const browser = await startBrowser();
  try {
    for (const view of VIEWS) {
      for (const lang of ['en', 'de']) {
        const where = `${lang} ${view.name}`;
        const tab = await browser.page({ lang });
        await tab.send('Emulation.setDeviceMetricsOverride', view);
        await tab.send('Emulation.setTouchEmulationEnabled', { enabled: view.mobile, maxTouchPoints: view.mobile ? 5 : 1 });
        await tab.open('/', { width: view.width, lang, ready: "document.readyState === 'complete'" });
        await tab.send('Emulation.setDeviceMetricsOverride', view);
        for (const from of ['zoom', 'gallery']) {
          const at = `${where}, ${from === 'zoom' ? 'zoom button of the Freecam card' : 'gallery'}`;
          let s = await openFrom(tab, view, from);
          if (!check(s && s.open, `${at}: the viewer opens`)) continue;
          const [x, y, w, h] = s.box;
          check(x >= 0 && y >= 0 && x + w <= s.vw && y + h <= s.vh, `${at}: the close button is fully on screen (${s.box.join(',')} in ${s.vw}×${s.vh})`);
          check(s.vw - (x + w) <= 32 && y <= 32, `${at}: the close button sits in the top right corner (${s.vw - (x + w)} px from the right, ${y} px from the top)`);
          check(w >= 44 && h >= 44, `${at}: the close button is at least 44 × 44 px (${w} × ${h})`);
          check(s.hit && s.visible, `${at}: the close button is visible and nothing covers it`);
          const [ix, iy, iw, ih] = s.img;
          check(x >= ix + iw || x + w <= ix || y >= iy + ih || y + h <= iy, `${at}: the close button is not over the picture (button ${s.box.join(',')}, picture ${s.img.join(',')})`);
          check(s.contrast >= 3, `${at}: the close button stands out from the viewer (contrast ${s.contrast}:1)`);
          check(s.label === (lang === 'de' ? 'Schließen' : 'Close') || s.label.toLowerCase() === (lang === 'de' ? 'schließen' : 'close'), `${at}: the button says ${lang === 'de' ? 'Schließen' : 'Close'} (“${s.label}”)`);
          check(s.focused, `${at}: the close button has the focus when the viewer opens`);
          await press(tab, view, x + w / 2, y + h / 2);
          s = await waitOpen(tab, false);
          check(!s.open, `${at}: ${view.mobile ? 'tapping' : 'clicking'} the close button closes the viewer`);
          const back = await tab.evaluate("document.activeElement && (document.activeElement.matches('.zoom-btn, [data-gallery] a') ? 'trigger' : document.activeElement.tagName)");
          check(back === 'trigger', `${at}: the focus goes back to what opened the viewer (${back})`);

          // Beside the picture: the widest free strip of the stage (left of, above or below the picture).
          s = await openFrom(tab, view, from);
          if (!check(s && s.open, `${at}: the viewer opens again`)) continue;
          const [sx, sy, sw, sh] = s.stage;
          const strips = [
            { size: s.img[0] - sx, x: sx + (s.img[0] - sx) / 2, y: s.img[1] + s.img[3] / 2 },
            { size: sy + sh - (s.img[1] + s.img[3]), x: s.img[0] + s.img[2] / 2, y: (s.img[1] + s.img[3] + sy + sh) / 2 },
            { size: s.img[1] - Math.max(sy, s.box[1] + s.box[3]), x: s.img[0] + 20, y: (s.img[1] + Math.max(sy, s.box[1] + s.box[3])) / 2 },
          ].sort((a, b) => b.size - a.size);
          check(strips[0].size >= 8, `${at}: there is room beside the picture (${strips[0].size} px)`);
          await press(tab, view, strips[0].x, strips[0].y);
          s = await waitOpen(tab, false);
          check(!s.open, `${at}: ${view.mobile ? 'a tap' : 'a click'} beside the picture closes the viewer (at ${Math.round(strips[0].x)},${Math.round(strips[0].y)})`);

          s = await openFrom(tab, view, from);
          if (!check(s && s.open, `${at}: the viewer opens a third time`)) continue;
          await press(tab, view, s.img[0] + s.img[2] / 2, s.img[1] + s.img[3] / 2);
          await sleep(200);
          s = await tab.evaluate(STATE);
          check(s.open, `${at}: ${view.mobile ? 'a tap' : 'a click'} on the picture keeps the viewer open`);
          await tab.key('Escape');
          s = await waitOpen(tab, false);
          check(!s.open, `${at}: Escape closes the viewer`);
        }
        check(!tab.errors.length, `${where}: no script errors (${tab.errors.slice(0, 3).join('; ')})`);
        await tab.close();
      }
    }
  } finally {
    await browser.close();
  }
}

finish(`one close button top right${flag('--no-browser') ? '' : ', in headless Chrome at 1280, 1728 (2×), 2560 and 390 px (touch), en/de: close button, click beside the picture, Escape'}`);
