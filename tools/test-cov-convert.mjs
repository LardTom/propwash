#!/usr/bin/env node
// Coverage of the converter /convert/ (check plan 0.6.0, 3.5 no. 31 and 3.10 no. 69, 70, 72, 73, 74):
//   - real codes from the Discord (a local file, never in this repository): each converts on this site character for
//     character like Propwash's DiscordCodesTest wrote it (its realCodesOut file), alone, in one post and on the page
//   - a PW3 code in a post stays byte for byte, its row says “Already PW3”
//   - “Open in the configurator” of a row opens /configurator/#PW3-… with the build of the code
//   - offline after loading: the post converts and the page sends no request
//   - 120 codes: 100 converted and the note on the rest, under a second; a text without codes gives a note
//   - 360 and 390 px with a pasted post: no sideways scrolling, no cut-off button, “Copy” works
//
//   node tools/test-cov-convert.mjs [--codes <file>] [--codes-out <file>] [--shots <dir>] [--chrome <path>]
//
// --codes (or PROPWASH_SHARE_REALCODES / PROPWASH_DISCORD_CODES): the real codes, one per line, a tab may follow;
// --codes-out (or PROPWASH_SHARE_REALCODESOUT): the file DiscordCodesTest writes with -Dpropwash.share.realCodesOut.
// Without them that part is skipped.

import fs from 'node:fs';
import path from 'node:path';
import { createCatalog } from '../assets/js/configurator/data.js';
import { convertText, findCodes, MAX_CODES } from '../assets/js/configurator/convert.js';
import { entry } from '../assets/js/configurator/i18n.js';
import { startBrowser, counter, arg, readJson, read, CV_READY, CFG_READY, setInput, sleep } from './fixtures/cov/browser.mjs';

const { check, note, finish } = counter('cov convert');
const catalog = createCatalog(readJson('assets/data/configurator/catalog.json'));
const fixture = readJson('tools/fixtures/cov/codes.json');
const post = read('tools/fixtures/cov/post.txt');
const text = (key, lang) => entry(key)[lang === 'de' ? 1 : 0];
const SHOTS = arg('--shots');
const CODES = arg('--codes', 'PROPWASH_SHARE_REALCODES') || process.env.PROPWASH_DISCORD_CODES || null;
const CODES_OUT = arg('--codes-out', 'PROPWASH_SHARE_REALCODESOUT');

function realCodes() {
  if (!CODES || !fs.existsSync(CODES)) {
    note('no file of real codes (--codes / PROPWASH_SHARE_REALCODES): no. 31 skipped');
    return null;
  }
  const lines = fs.readFileSync(CODES, 'utf8').split(/\r?\n/).map((l) => l.split('\t')[0].trim()).filter(Boolean);
  let game = null;
  if (CODES_OUT && fs.existsSync(CODES_OUT)) {
    game = new Map(fs.readFileSync(CODES_OUT, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => l.split('\t')));
  } else {
    note('no realCodesOut file of DiscordCodesTest (--codes-out / PROPWASH_SHARE_REALCODESOUT): codes only checked for a conversion');
  }
  check(lines.length > 0, 'no. 31: the file holds codes');
  const out = [];
  for (const [i, code] of lines.entries()) {
    const c = catalog.convert(code);
    const want = game ? game.get(code) : undefined;
    check(c.status === 'OK' && c.code && c.code.startsWith('PW3-'), `no. 31: line ${i + 1} converts (${c.status} ${c.reason || ''})`);
    if (game) {
      check(want !== undefined, `no. 31: line ${i + 1} is in the game's output`);
      check(c.code === want, `no. 31: line ${i + 1}: site ${c.code} = game ${want}`);
    }
    out.push({ code, pw3: c.code, game: want });
  }
  const whole = convertText(fs.readFileSync(CODES, 'utf8'), catalog);
  for (const r of out) {
    const row = whole.codes.find((c) => c.from === r.code);
    check(row && row.code === r.pw3, `no. 31: ${r.code.slice(0, 12)}… converts the same inside the whole file`);
    check(whole.text.includes(r.pw3), `no. 31: ${r.pw3.slice(0, 12)}… replaces the old code in the text`);
  }
  return { lines: out, text: fs.readFileSync(CODES, 'utf8'), expected: whole, compared: !!game };
}

function unitTests() {
  const r = convertText(post, catalog);
  for (const o of fixture.old.filter((x) => post.includes(x.code))) {
    const row = r.codes.find((c) => c.from === o.code);
    check(row && row.kind === o.kind && row.code === o.pw3, `post: ${o.code.slice(0, 14)}… → ${row && row.code} (want ${o.pw3})`);
  }
  const lone = `Mein Build: ${fixture.pw3.freestyle} – viel Spaß`;
  const pw3 = convertText(lone, catalog);
  check(pw3.text === lone, 'no. 69: a post with only a PW3 code stays byte for byte');
  check(pw3.codes.length === 1 && pw3.codes[0].kind === 'pw3' && pw3.codes[0].code === fixture.pw3.freestyle, `no. 69: the PW3 code is checked (${pw3.codes[0] && pw3.codes[0].kind})`);
  const at = r.text.indexOf(fixture.pw3.freestyle, r.text.indexOf('Schon neu'));
  check(at >= 0 && r.text.slice(r.text.indexOf('Schon neu')) === post.slice(post.indexOf('Schon neu')), 'no. 69: inside a post with old codes the PW3 line stays unchanged');

  const line = `Build: ${fixture.old[0].code}`;
  const same = Array.from({ length: 120 }, () => line).join('\n');
  let start = performance.now();
  const many = convertText(same, catalog);
  let ms = performance.now() - start;
  check(many.found === 120 && many.skipped === 20, `no. 73: one code line 120 times: ${many.found} found, ${many.skipped} left (max ${MAX_CODES})`);
  check(many.codes.length === 1 && many.codes[0].count === 100, `no. 73: 100 of them converted (${many.codes[0] && many.codes[0].count})`);
  check(ms < 1000, `no. 73: 120 equal codes in ${ms.toFixed(0)} ms (< 1 s)`);
  const parts = catalog.partsIn('frame').slice(0, 5).map((f) => f.id);
  const distinct = [];
  for (let i = 0; i < 120; i++) {
    const build = { ...catalog.presetBuild('propwash:freestyle'), frame: parts[i % parts.length] };
    distinct.push(`#${i + 1}: ${catalog.encode({ build, paint: null, tune: null, osd: null, name: `Build ${i + 1}` })}`);
  }
  start = performance.now();
  const varied = convertText(distinct.join('\n'), catalog);
  ms = performance.now() - start;
  check(varied.found === 120 && varied.skipped === 20 && varied.codes.length === 100, `no. 73: 120 different codes: ${varied.codes.length} handled, ${varied.skipped} left`);
  check(ms < 1000, `no. 73: 120 different codes in ${ms.toFixed(0)} ms (< 1 s)`);
  const none = convertText('Hallo Welt, heute ganz ohne Code. PW3-Codes kommen morgen.', catalog);
  check(none.found === 0 && none.codes.length === 0 && none.text.startsWith('Hallo Welt'), 'no. 73: a text without codes gives no result and no error');
  return { many: same, varied: distinct.join('\n') };
}

async function browserTests(real, big) {
  const b = await startBrowser();
  const expected = convertText(post, catalog);
  const rows = (p) => p.evaluate(`(() => ({
    result: document.querySelector('[data-cv-result]').value,
    hidden: document.querySelector('[data-cv-output]').hidden,
    status: document.querySelector('[data-cv-status]').textContent,
    statusClass: document.querySelector('[data-cv-status]').className,
    rows: [...document.querySelectorAll('[data-cv-codes] > li')].map((li) => ({
      kind: li.className, badge: li.querySelector('.cv-code__badge').textContent,
      code: li.querySelector('.cv-code__row--new .cv-code__text') ? li.querySelector('.cv-code__row--new .cv-code__text').textContent : null,
      open: li.querySelector('a.btn') ? li.querySelector('a.btn').getAttribute('href') : null })),
  }))()`);
  const paste = async (p, value, wait = 700) => {
    await p.evaluate(setInput('[data-cv-input]', value));
    await sleep(wait);
  };
  try {
    for (const lang of ['en', 'de']) {
      const p = await b.page({ lang });
      await p.open('/convert/', { width: 1280, ready: CV_READY });

      await paste(p, `Mein Build: ${fixture.pw3.freestyle}`);
      let cv = await rows(p);
      check(cv.result === `Mein Build: ${fixture.pw3.freestyle}`, `no. 69 ${lang}: the result field is the post byte for byte`);
      check(cv.rows.length === 1 && cv.rows[0].kind.includes('is-pw3') && cv.rows[0].badge === text('convert.status.pw3', lang), `no. 69 ${lang}: row status “${cv.rows[0] && cv.rows[0].badge}”`);
      check(cv.rows[0] && cv.rows[0].code === fixture.pw3.freestyle, `no. 69 ${lang}: the row shows the same code`);

      if (real) {
        await paste(p, real.text, 900);
        cv = await rows(p);
        check(cv.result === real.expected.text, `no. 31 ${lang}: the page converts the file like convert.js`);
        for (const r of real.lines) {
          const row = cv.rows.find((x) => x.code === r.pw3);
          check(!!row, `no. 31 ${lang}: row with ${r.pw3.slice(0, 14)}…`);
          if (real.compared) check(row && row.code === r.game, `no. 31 ${lang}: page = game for ${r.code.slice(0, 14)}…`);
        }
      }

      await paste(p, big.many, 900);
      cv = await rows(p);
      check(cv.status.includes(text('convert.tooMany', lang).replace('{max}', String(MAX_CODES)).replace('{rest}', '20')), `no. 73 ${lang}: note on the codes beyond 100 (“${cv.status}”)`);
      check(cv.rows.length === 1, `no. 73 ${lang}: one row for the repeated code`);
      const timing = await p.evaluate(`(async () => {
        const input = document.querySelector('[data-cv-input]');
        const status = document.querySelector('[data-cv-status]');
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 400));
        input.value = ${JSON.stringify(big.varied)};
        const t0 = performance.now();
        input.dispatchEvent(new Event('input', { bubbles: true }));
        while (!document.querySelectorAll('[data-cv-codes] > li').length || document.querySelector('[data-cv-output]').hidden) {
          if (performance.now() - t0 > 5000) break;
          await new Promise((r) => setTimeout(r, 10));
        }
        return { ms: performance.now() - t0, rows: document.querySelectorAll('[data-cv-codes] > li').length, status: status.textContent };
      })()`);
      check(timing.rows === 100 && timing.ms - 200 < 1000, `no. 73 ${lang}: 120 different codes: ${timing.rows} rows in ${(timing.ms - 200).toFixed(0)} ms after the 200 ms pause`);
      await paste(p, 'Hallo Welt, heute ganz ohne Code.');
      cv = await rows(p);
      check(cv.status === text('convert.none', lang) && cv.statusClass.includes('is-warn') && cv.hidden, `no. 73 ${lang}: no codes – note “${cv.status}” (${cv.statusClass})`);

      await p.open('/convert/', { width: 1280, ready: CV_READY });
      p.requests.length = 0;
      await p.offline(true);
      await paste(p, post, 900);
      cv = await rows(p);
      check(cv.result === expected.text && cv.rows.length === expected.codes.length, `no. 72 ${lang}: offline the post converts (${cv.rows.length} rows)`);
      const copyAll = await p.center('[data-cv-copy-all]');
      await p.click(copyAll.x, copyAll.y);
      await sleep(300);
      check(p.requests.length === 0, `no. 72 ${lang}: no request after loading (${p.requests.slice(0, 4).join(', ')})`);
      await p.offline(false);

      await paste(p, post, 900);
      cv = await rows(p);
      const night = fixture.old.find((o) => o.name);
      const i = cv.rows.findIndex((r) => r.code === night.pw3);
      check(i >= 0 && cv.rows[i].open.endsWith(`/configurator/#${night.pw3}`), `no. 70 ${lang}: the row links to /configurator/#${night.pw3.slice(0, 12)}…`);
      const link = await p.center(`[data-cv-codes] > li:nth-child(${i + 1}) a.btn`);
      await p.click(link.x, link.y);
      await p.waitFor(`location.pathname.endsWith('/configurator/') && (${CFG_READY})`, `no. 70 ${lang}: configurator`);
      await sleep(700);
      const cfg = await p.evaluate(`({ hash: location.hash, code: document.querySelector('[data-code]').textContent, name: document.querySelector('[data-name]').value,
        bad: !!document.querySelector('.banner.is-bad') })`);
      const want = catalog.decode(night.pw3).content;
      check(cfg.hash === `#${night.pw3}`, `no. 70 ${lang}: address ${cfg.hash}`);
      check(cfg.name === want.name && !cfg.bad, `no. 70 ${lang}: the build “${cfg.name}” is loaded`);
      const shown = catalog.decode(cfg.code);
      check(shown.ok && JSON.stringify(shown.content.build) === JSON.stringify(want.build), `no. 70 ${lang}: the share box holds the same build`);
      check(p.errors.length === 0, `${lang}: no console errors (${p.errors.slice(0, 3).join(' | ')})`);
      await p.close();
    }

    for (const width of [360, 390]) {
      for (const lang of ['en', 'de']) {
        const p = await b.page({ lang });
        await p.open('/convert/', { width, ready: CV_READY });
        await paste(p, post, 900);
        const layout = await p.evaluate(`(() => {
          const vw = document.documentElement.clientWidth;
          const cut = [...document.querySelectorAll('[data-cv] button, [data-cv] a.btn')].filter((n) => n.offsetParent).map((n) => {
            const r = n.getBoundingClientRect();
            return { text: n.textContent.trim(), out: r.left < -0.5 || r.right > vw + 0.5, clipped: n.scrollWidth > n.clientWidth + 1 };
          }).filter((x) => x.out || x.clipped);
          return { scroll: document.documentElement.scrollWidth, vw, cut };
        })()`);
        check(layout.scroll <= width, `no. 74 ${width} ${lang}: no sideways scrolling (${layout.scroll} px)`);
        check(layout.cut.length === 0, `no. 74 ${width} ${lang}: no cut-off button (${JSON.stringify(layout.cut.slice(0, 3))})`);
        const copy = await p.center('[data-cv-codes] > li .cv-code__actions button');
        await p.tap(copy.x, copy.y);
        await sleep(300);
        const clip = await p.clipboard();
        check(clip === expected.codes.find((c) => c.code && c.kind !== 'damaged').code, `no. 74 ${width} ${lang}: a tap on “${text('convert.copy', lang)}” copies the PW3 code (${clip})`);
        if (SHOTS) {
          await p.evaluate("window.scrollTo(0, 0)");
          await p.shot(path.join(SHOTS, `convert-${width}-${lang}_01.png`));
          await p.evaluate("document.querySelector('[data-cv-codes]').scrollIntoView({ block: 'start', behavior: 'instant' })");
          await p.shot(path.join(SHOTS, `convert-${width}-${lang}_02.png`));
          await p.shot(path.join(SHOTS, `convert-${width}-${lang}_full.png`), { full: true });
        }
        check(p.errors.length === 0, `no. 74 ${width} ${lang}: no console errors (${p.errors.slice(0, 3).join(' | ')})`);
        await p.close();
      }
    }
  } finally {
    await b.close();
  }
}

async function main() {
  const real = realCodes();
  const big = unitTests();
  if (!process.argv.includes('--no-browser')) await browserTests(real, big);
  finish(`${real ? `${real.lines.length} real codes${real.compared ? ' compared with the game' : ''}` : 'no real codes'}; post with ${findCodes(post).length} codes; en/de`);
}

main().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
