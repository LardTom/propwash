#!/usr/bin/env node
// The simulator page (sim/) in headless Chrome, English and German (and every generated language tree that has it),
// 1280 × 720 and 390 × 844:
//   - the note about the physics is open at the start: the physics are not 100 % the mod's, above all crashes, a crash
//     never disarms, the list of what is not included; no dash (– or —) in its English and German text
//   - “Got it” closes it, “Physics” in the bar opens it again (aria-expanded follows), Escape closes it, arming closes it
//   - the help names the difference (no crash disarm) and both the note and the help link the legal notice and the
//     privacy policy
//   - the bar fits the width (no button beyond the right edge), the sound hint sits below the bar
//   - on a translated page (/es/sim/, …): the banner of the AI translation inside the note, the page language, EN/DE
//     lead to the English/German page with the same drone
//   - no console errors or uncaught exceptions
//
//   node tools/test-sim-page.mjs [--shots <dir>] [--chrome <path>]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, CHROME, serve, launch, cdp, sleep } from './headless-chrome.mjs';

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
  1280: { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false },
  390: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
};
const TREES = ['es', 'fr', 'pt-br', 'pl', 'ru'].filter((l) => fs.existsSync(path.join(ROOT, l, 'sim/index.html')));

// The page's own text of the note (English and German), checked without a browser too.
const html = fs.readFileSync(path.join(ROOT, 'sim/index.html'), 'utf8');
const aboutHtml = /<aside class="sim__about"[\s\S]*?<\/aside>/.exec(html)?.[0] || '';
check(aboutHtml.length > 0, 'sim/index.html has the note about the physics (aside.sim__about)');
for (const lang of ['en', 'de']) {
  const texts = [...aboutHtml.matchAll(new RegExp(`<(?:p|span)[^>]*lang="${lang}"[^>]*>([\\s\\S]*?)<\\/(?:p|span)>`, 'g'))].map((m) => m[1].replace(/<[^>]+>/g, ''));
  check(texts.length >= 3, `note ${lang}: title, text and list (${texts.length})`);
  check(texts.every((t) => !/[–—]/.test(t)), `note ${lang}: no dash in the public text (${texts.find((t) => /[–—]/.test(t))})`);
}
check(!/A crash disarms it|Ein Crash entschärft sie, genau wie im Spiel/.test(html), 'the help no longer says a crash disarms like in the game');

async function main() {
  const shots = arg('--shots');
  if (shots) fs.mkdirSync(shots, { recursive: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-simpage-'));
  const { child, ws } = await launch(arg('--chrome', CHROME), profile, ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']);
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
    let where = '';
    browser.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error' || p.type === 'assert') errors.push(`${where}: console.${p.type}: ${p.args.map((a) => a.value ?? a.description).join(' ')}`);
    });
    browser.on('Runtime.exceptionThrown', (p) => errors.push(`${where}: exception: ${p.exceptionDetails.exception?.description || p.exceptionDetails.text}`));
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

    const open = async (url, width, language) => {
      await send('Emulation.setDeviceMetricsOverride', VIEWPORTS[width]);
      await send('Page.navigate', { url: 'about:blank' });
      await sleep(80);
      const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', {
        source: `try { localStorage.setItem('propwash-lang', '${language}'); } catch (e) {}`,
      });
      await send('Page.navigate', { url });
      const start = Date.now();
      while (!(await evaluate("!document.querySelector('[data-loading]') && !!document.querySelector('.sim__stage canvas')"))) {
        if (Date.now() - start > 40000) throw new Error(`${where}: simulator not ready within 40 s`);
        await sleep(250);
      }
      await send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
      await evaluate('document.fonts.ready.then(() => true)');
      await sleep(400);
    };
    const state = () => evaluate(`(() => {
      const about = document.querySelector('[data-about]');
      const button = document.querySelector('[data-open-about]');
      const bar = document.querySelector('.sim__bar').getBoundingClientRect();
      const right = Math.max(...[...document.querySelectorAll('.sim__bar button, .sim__bar a, .sim__bar input')].filter((b) => b.offsetParent).map((b) => b.getBoundingClientRect().right));
      const hint = document.querySelector('[data-sound-hint]');
      const r = about.getBoundingClientRect();
      return {
        open: !about.hidden, expanded: button.getAttribute('aria-expanded'), text: about.innerText.replace(/\\s+/g, ' '),
        legal: [...about.querySelectorAll('a')].map((a) => new URL(a.href).pathname),
        helpLegal: [...document.querySelectorAll('[data-help] a')].map((a) => new URL(a.href).pathname),
        help: document.querySelector('[data-help]').innerText.replace(/\\s+/g, ' '),
        banner: !!about.querySelector('.i18n-banner'), lang: document.documentElement.lang,
        right, width: document.documentElement.clientWidth, barBottom: bar.bottom,
        hintTop: hint && !hint.hidden ? hint.getBoundingClientRect().top : null,
        inside: r.left >= 0 && r.right <= document.documentElement.clientWidth + 0.5 && r.bottom <= window.innerHeight + 0.5,
      };
    })()`);

    const pages = [['en', 'sim/'], ['de', 'sim/'], ...TREES.map((l) => [l, `${l}/sim/`])];
    for (const [language, url] of pages) {
      for (const width of [1280, 390]) {
        where = `${url} ${language} ${width} px`;
        await open(`${base}/${url}#`, width, language === 'de' ? 'de' : 'en');
        let s = await state();
        check(s.open && s.expanded === 'true', `${where}: the note is open at the start (aria-expanded ${s.expanded})`);
        check(s.inside, `${where}: the note fits the window`);
        if (language === 'en') {
          check(/not 100\s?% the same as in the mod/.test(s.text) && /crash/.test(s.text) && /never disarms/.test(s.text), `${where}: the note says the physics are not 100 % the mod's, above all crashes, no crash disarm (${s.text})`);
          check(/Not included:.*GPS rescue.*altitude and position hold.*3D mode.*turtle mode.*water.*cobwebs.*breaking blocks.*wear.*flight assists of add-ons.*entities/.test(s.text), `${where}: the note lists what is not included`);
          check(/does not disarm it/.test(s.help), `${where}: the help says a crash does not disarm`);
        } else if (language === 'de') {
          check(/nicht zu 100\s?% der Mod/.test(s.text) && /Crash/.test(s.text) && /nie/.test(s.text), `${where}: Hinweis auf Deutsch (${s.text})`);
          check(/Nicht dabei:.*GPS-Rescue.*Höhe und Position halten.*3D-Modus.*Turtle-Modus.*Wasser.*Spinnweben.*Blöcke durchbrechen.*Verschleiß.*Flughilfen von Add-ons.*Entitys/.test(s.text), `${where}: Liste „Nicht dabei“`);
          check(/entschärft ein Crash sie nicht/.test(s.help), `${where}: die Hilfe sagt, dass ein Crash nicht entschärft`);
        } else {
          check(s.banner, `${where}: the banner of the AI translation sits in the note`);
          check(s.lang.toLowerCase().startsWith(language.split('-')[0]), `${where}: page language ${s.lang}`);
          check(!/not 100\s?% the same as in the mod/.test(s.text), `${where}: the note is translated (${s.text.slice(0, 80)})`);
        }
        check(s.legal.some((p) => p.endsWith('/impressum/')) && s.legal.some((p) => p.endsWith('/datenschutz/')), `${where}: the note links the legal notice and the privacy policy (${s.legal})`);
        check(s.helpLegal.some((p) => p.endsWith('/impressum/')) && s.helpLegal.some((p) => p.endsWith('/datenschutz/')), `${where}: the help links the legal notice and the privacy policy`);
        check(s.right <= s.width + 0.5, `${where}: the bar fits the width (right edge ${Math.round(s.right)} of ${s.width} px)`);
        if (s.hintTop !== null) check(s.hintTop >= s.barBottom - 0.5, `${where}: the sound hint sits below the bar (${Math.round(s.hintTop)} vs ${Math.round(s.barBottom)})`);
        if (shots) {
          const img = await send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(shots, `sim-${language}-${width}.png`), Buffer.from(img.data, 'base64'));
        }
        await evaluate("document.querySelector('[data-about-close]').click()");
        s = await state();
        check(!s.open && s.expanded === 'false', `${where}: “Got it” closes the note`);
        await evaluate("document.querySelector('[data-open-about]').click()");
        s = await state();
        check(s.open && s.expanded === 'true', `${where}: “Physics” opens the note again`);
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        s = await state();
        check(!s.open, `${where}: Escape closes the note`);
        if (width === 1280 && (language === 'en' || language === 'de')) {
          await evaluate("document.querySelector('[data-open-about]').click()");
          // Arm with the keyboard (Z, throttle down, level on the pad): the note gets out of the way.
          await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90 });
          await sleep(120);
          await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90 });
          const start = Date.now();
          while ((await state()).open && Date.now() - start < 4000) await sleep(150);
          s = await state();
          check(!s.open && s.expanded === 'false', `${where}: arming closes the note`);
        }
        if (language !== 'en' && language !== 'de' && width === 1280) {
          const target = await evaluate(`(() => { const b = document.querySelector('[data-set-lang="de"]'); let to = null; const orig = Object.getOwnPropertyDescriptor(Location.prototype, 'href'); try { b.click(); } catch (e) {} return location.href; })()`);
          await sleep(1500);
          const url2 = await evaluate('location.pathname + location.hash');
          check(/^\/sim\/#?/.test(url2) && (await evaluate('document.documentElement.lang')) === 'de', `${where}: DE opens the German page of the simulator (${target} → ${url2})`);
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
      // Chrome may still write into its profile while it shuts down.
    }
  }
  for (const e of errors) check(false, e);
  if (failures.length) {
    console.log(`FAIL: ${checks - failures.length}/${checks} checks passed`);
    for (const f of failures.slice(0, 40)) console.log(`  ${f}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${checks} checks – simulator page: note about the physics, help, legal links, bar; en, de${TREES.length ? `, ${TREES.join(', ')}` : ''} at 1280 and 390 px`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
