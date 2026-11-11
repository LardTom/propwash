#!/usr/bin/env node
// Layout of every translated page in every language and width, in headless Chrome (website design 0.6.0, 6.2).
//
//   node tools/test-layout.mjs [--widths 360,768,1100,1280] [--pages docs/,roadmap/] [--langs en,de,ru] [--keep]
//
// The pages are built into a temporary folder with tools/i18n/build-i18n.mjs: the English/German pages with the
// language menu of all five other languages, and the pages of those languages from their dictionaries – texts
// without a translation get a pseudo translation (tools/i18n/pseudo.mjs: their letters, 20 to 30 % longer), so the
// test works before the translations exist. Per page, language and width:
//   - no horizontal overflow, no button whose text is cut off or that sticks out of the window
//   - the header bar keeps its height and its parts (brand, navigation, Discord, EN/DE, menu button) do not overlap
//   - pages of the other languages: the banner sits right under the header, is fully visible, names the AI in the
//     language and leads to the same page in English and German
//   - headings, text, kickers and keys are drawn with the site's fonts only (Saira, JetBrains Mono, and Exo 2 for the
//     Cyrillic letters of the Russian pages), no system fallback (code spans follow the styles of their page)
// Also: the language menu opens inside the window (header bar and small-screen menu), EN/DE on a translated page
// leads to the English/German page and keeps the choice, the hint to a translation appears for a browser in that
// language. Screenshots of every page go into a temporary folder for the reviewers (its path is printed).

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { CHROME, launch, cdp, sleep } from './headless-chrome.mjs';
import { ROOT, LANGUAGES } from './i18n/languages.mjs';
import { buildSite } from './i18n/build-i18n.mjs';
import { APP_PAGES } from './build-nav.mjs';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
}
const WIDTHS = arg('--widths', '360,768,1100,1280').split(',').map(Number);
const ONLY_PAGES = arg('--pages', null)?.split(',').map((p) => (p === '/' ? '' : p));
const LANGS = arg('--langs', ['en', 'de', ...LANGUAGES.map((l) => l.code)].join(',')).split(',');
const HEIGHT = 900;
const APP_PATHS = APP_PAGES.map(([file]) => file.replace(/index\.html$/, ''));
const FONTS = { sans: /^Saira\b/, mono: /^JetBrains Mono\b/, cyrillic: /^Exo 2\b/ };

let checks = 0;
const failures = [];
function check(ok, message) {
  checks++;
  if (!ok) failures.push(message);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain', '.mp4': 'video/mp4' };

// Serves the preview folder first, the site itself for everything else.
function serve(dirs) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const rel = decodeURIComponent(url.pathname);
    for (const dir of dirs) {
      let file = path.join(dir, rel);
      if (!file.startsWith(dir)) break;
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) continue;
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
      return;
    }
    res.writeHead(404).end();
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// Runs in the page: overflow, cut-off buttons, header, banner. Returns plain data.
const MEASURE = String.raw`(() => {
  const vw = document.documentElement.clientWidth;
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const hidden = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || s.position === 'fixed') return true;
      if (s.clipPath === 'inset(50%)' || (s.position === 'absolute' && e.offsetWidth <= 1)) return true;
      if (e !== el && /(auto|scroll|hidden|clip)/.test(s.overflowX)) return true;
    }
    return false;
  };
  const name = (el) => {
    const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls + (text ? ' "' + text + '"' : '');
  };
  const out = { scrollWidth: document.documentElement.scrollWidth, vw, overflow: [], clipped: [], overlap: [], header: null, banner: null, lang: document.documentElement.lang, path: location.pathname + location.search };
  if (out.scrollWidth > vw + 1) {
    for (const el of document.querySelectorAll('body *')) {
      if (out.overflow.length >= 6) break;
      const r = el.getBoundingClientRect();
      if (r.width && r.right > vw + 1 && !hidden(el)) out.overflow.push(name(el) + ' right=' + Math.round(r.right));
    }
  }
  for (const el of document.querySelectorAll('button, .btn, .site-nav__cta, .nav-group__toggle, .lang-switch button, a[role="button"]')) {
    if (!visible(el) || hidden(el)) continue;
    const r = el.getBoundingClientRect();
    if (el.scrollWidth > el.clientWidth + 2) out.clipped.push(name(el) + ' text ' + el.scrollWidth + ' > box ' + el.clientWidth);
    else if (r.left < -1 || r.right > vw + 1) out.clipped.push(name(el) + ' outside the window (' + Math.round(r.left) + '..' + Math.round(r.right) + ')');
  }
  const header = document.querySelector('.site-header');
  const inner = header && header.querySelector('.site-header__inner');
  if (inner) {
    const parts = [...inner.children].filter((el) => visible(el) && !el.classList.contains('is-open'));
    const rects = parts.map((el) => [el, el.getBoundingClientRect()]);
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const [a, ra] = rects[i];
      const [b, rb] = rects[j];
      const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (w > 1 && h > 1) out.overlap.push(name(a) + ' / ' + name(b));
    }
    for (const el of inner.querySelectorAll('.site-nav > a, .site-nav .nav-group__toggle')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      const hr = header.getBoundingClientRect();
      if (r.top < hr.top - 1 || r.bottom > hr.bottom + 1) out.overlap.push(name(el) + ' leaves the header bar');
    }
    out.header = Math.round(header.getBoundingClientRect().height);
  }
  const banner = document.querySelector('.i18n-banner');
  if (banner) {
    const r = banner.getBoundingClientRect();
    const links = [...banner.querySelectorAll('a')].map((a) => ({ href: a.href, hreflang: a.getAttribute('hreflang') }));
    out.banner = {
      visible: visible(banner), top: Math.round(r.top), headerBottom: header ? Math.round(header.getBoundingClientRect().bottom) : null,
      right: Math.round(r.right), text: banner.textContent.replace(/\s+/g, ' ').trim(), lang: banner.getAttribute('lang'), links,
      after: banner.previousElementSibling === header,
      cut: [...banner.querySelectorAll('p, a, span')].some((el) => el.getBoundingClientRect().right > vw + 1),
    };
  }
  return out;
})()`;

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-layout-'));
  const preview = path.join(tmp, 'site');
  const shots = path.join(tmp, 'shots');
  fs.mkdirSync(shots, { recursive: true });
  const { files } = buildSite({ languages: LANGUAGES, mode: 'pseudo', withRoot: true });
  for (const [rel, content] of files) {
    const target = path.join(preview, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  const pagePaths = [...new Set([...files.keys()].filter((f) => f.startsWith(`${LANGUAGES[0].code}/`) && f.endsWith('index.html'))
    .map((f) => f.slice(LANGUAGES[0].code.length + 1).replace(/index\.html$/, '')))]
    .filter((p) => !ONLY_PAGES || ONLY_PAGES.includes(p));

  const server = await serve([preview, ROOT]);
  const base = `http://127.0.0.1:${server.address().port}/`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-layout-profile-'));
  const { child, ws } = await launch(arg('--chrome', CHROME), profile);
  const browser = cdp(ws);
  const errors = [];
  let loads = 0;
  try {
    await browser.ready;
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => browser.send(method, params, sessionId);
    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text}: ${expression.slice(0, 120)}`);
      return r.result.value;
    };
    browser.on('Runtime.exceptionThrown', (p) => errors.push(`exception: ${p.exceptionDetails.exception?.description || p.exceptionDetails.text}`));
    browser.on('Log.entryAdded', (p) => {
      if (p.entry.level === 'error' && !/favicon/.test(p.entry.url || '')) errors.push(`log: ${p.entry.text} ${p.entry.url || ''}`);
    });
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Page.enable');
    await send('DOM.enable');
    await send('CSS.enable');
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const ua = (await browser.send('Browser.getVersion')).userAgent.replace('HeadlessChrome', 'Chrome');

    async function open(url, width) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: HEIGHT, deviceScaleFactor: 1, mobile: width < 768 });
      await send('Page.navigate', { url: 'about:blank' });
      const loaded = new Promise((resolve) => {
        const done = (p, sid) => { if (sid === sessionId) resolve(); };
        browser.on('Page.loadEventFired', done);
      });
      await send('Page.navigate', { url });
      await Promise.race([loaded, sleep(20000)]);
      await evaluate('document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 250))).then(() => true)');
      loads++;
    }

    // The fonts the browser really drew a node with (CSS.getPlatformFontsForNode), by family.
    async function fontsOf(selector, limit = 4) {
      const { root } = await send('DOM.getDocument', { depth: 0 });
      const { nodeIds } = await send('DOM.querySelectorAll', { nodeId: root.nodeId, selector });
      const used = new Map();
      used.where = new Map();
      for (const nodeId of nodeIds.slice(0, limit)) {
        const { model } = await send('DOM.getBoxModel', { nodeId }).catch(() => ({ model: null }));
        if (!model) continue;
        const { fonts } = await send('CSS.getPlatformFontsForNode', { nodeId }).catch(() => ({ fonts: [] }));
        for (const f of fonts) {
          used.set(f.familyName, (used.get(f.familyName) || 0) + f.glyphCount);
          if (!used.where.has(f.familyName)) {
            const { outerHTML } = await send('DOM.getOuterHTML', { nodeId }).catch(() => ({ outerHTML: '' }));
            used.where.set(f.familyName, outerHTML.replace(/\s+/g, ' ').slice(0, 90));
          }
        }
      }
      return used;
    }

    const shot = async (file, clip) => {
      const { data } = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
    };

    for (const lang of LANGS) {
      const extra = LANGUAGES.find((l) => l.code === lang);
      for (const page of pagePaths) {
        const url = extra ? `${base}${lang}/${page}` : `${base}${page}?lang=${lang}`;
        const label = `${extra ? `${lang}/` : `${lang} `}${page || '(landing page)'}`;
        for (const width of WIDTHS) {
          await open(url, width);
          const m = await evaluate(MEASURE);
          const where = `${label} @${width}`;
          check(m.lang === (extra ? extra.hreflang : lang), `${where}: page language ${m.lang}`);
          check(m.scrollWidth <= m.vw + 1, `${where}: horizontal overflow ${m.scrollWidth} > ${m.vw} px (${m.overflow.join('; ')})`);
          check(!m.clipped.length, `${where}: ${m.clipped.slice(0, 3).join('; ')}`);
          // The simulator is an app page (tools/build-nav.mjs APP_PAGES): its own bar instead of the site header, the AI
          // banner inside the note about the physics, the OSD and the device line in JetBrains Mono on purpose.
          const app = APP_PATHS.includes(page);
          if (!app) {
            check(!m.overlap.length, `${where}: header ${m.overlap.slice(0, 3).join('; ')}`);
            check(m.header === 61, `${where}: header bar ${m.header} px high, expected 61`);
          } else {
            const bar = await evaluate("(() => { const b = document.querySelector('.sim__bar'); const r = b.getBoundingClientRect(); const right = Math.max(...[...b.querySelectorAll('button, a, input')].filter((x) => x.offsetParent).map((x) => x.getBoundingClientRect().right)); return { h: r.height, right, vw: document.documentElement.clientWidth }; })()");
            check(bar.h > 0 && bar.right <= bar.vw + 1, `${where}: the simulator's bar fits the width (${Math.round(bar.right)} of ${bar.vw} px)`);
          }
          if (extra && app) {
            const b = await evaluate("(() => { const n = document.querySelector('.sim__about .i18n-banner'); if (!n) return null; const r = n.getBoundingClientRect(); return { visible: r.height > 0 && r.width > 0, lang: n.getAttribute('lang'), text: n.textContent }; })()");
            check(!!b && b.visible && b.lang === extra.hreflang && b.text.includes(extra.drafts.AI), `${where}: AI banner in the note of the simulator (${JSON.stringify(b)})`);
          } else if (extra) {
            const b = m.banner;
            check(!!b && b.visible && b.after && Math.abs(b.top - b.headerBottom) <= 1 && !b.cut, `${where}: banner missing, cut off or not right under the header (${JSON.stringify(b && { top: b.top, header: b.headerBottom, after: b.after, cut: b.cut })})`);
            if (b) {
              const tag = extra.drafts.AI;
              check(b.lang === extra.hreflang && b.text.includes(tag), `${where}: banner in ${b.lang}, names ${tag}`);
              const target = (l) => b.links.find((x) => x.hreflang === l);
              for (const l of ['en', 'de']) {
                const link = target(l);
                const u = link && new URL(link.href);
                check(!!u && u.pathname === `/${page}` && u.search === `?lang=${l}`, `${where}: banner link ${l} leads to ${link ? link.href : 'nowhere'}, expected /${page}?lang=${l}`);
              }
            }
          } else {
            check(!m.banner, `${where}: banner on an English/German page`);
          }
          const sans = await fontsOf(app ? '.sim__about p, .sim-dialog p, .sim__btn' : 'h1, h2, h3, .site-nav > a, p');
          const mono = await fontsOf(app ? '.sim__about-title, .sim__device, kbd' : '.kicker, .mono, kbd', 40);
          const sansOk = (f) => FONTS.sans.test(f) || (lang === 'ru' && FONTS.cyrillic.test(f));
          for (const [family, glyphs] of sans) if (glyphs) check(sansOk(family), `${where}: headings or text drawn with ${family} (${glyphs} glyphs, ${sans.where.get(family)}), not with the site's fonts`);
          for (const [family, glyphs] of mono) if (glyphs) check(FONTS.mono.test(family) || sansOk(family), `${where}: monospaced text drawn with ${family} (${glyphs} glyphs, ${mono.where.get(family)})`);
          if (lang === 'ru' && !app) {
            const heads = await fontsOf('h1, h2', 6);
            const cyr = [...heads].filter(([f]) => FONTS.cyrillic.test(f)).reduce((n, [, g]) => n + g, 0);
            check(cyr > 0, `${where}: Cyrillic headings not drawn with Exo 2 (${[...heads].map(([f, g]) => `${f} ${g}`).join(', ')})`);
          }
          await shot(path.join(shots, lang, `${(page || 'home').replace(/\//g, '_')}${width}.png`));
          if (lang === 'ru' && (width === 360 || width === 1280)) {
            const r = await evaluate(`(() => { const h = document.querySelector('h1'); if (!h) return null; const b = h.getBoundingClientRect(); return { x: 0, y: Math.max(0, b.top - 8), width: ${width}, height: Math.min(${HEIGHT}, b.height + 16) }; })()`);
            if (r) await shot(path.join(shots, 'ru-headings', `${(page || 'home').replace(/\//g, '_')}${width}.png`), r);
          }
        }
      }
    }

    // Language menu: opens inside the window, in the header bar and in the small-screen menu.
    for (const [url, label] of [[`${base}?lang=en`, 'en'], [`${base}ru/`, 'ru/'], [`${base}pl/docs/guide/`, 'pl/docs/guide/']]) {
      for (const width of [360, 1280]) {
        await open(url, width);
        if (width < 1100 || await evaluate("document.documentElement.classList.contains('nav-folded')")) await evaluate("(document.querySelector('[data-nav-toggle]').click(), true)");
        await evaluate("(document.querySelector('[data-lang-menu] [data-nav-group-toggle]').click(), true)");
        await sleep(150);
        const menu = await evaluate(`(() => {
          const panel = document.querySelector('#nav-languages');
          const r = panel.getBoundingClientRect();
          const items = [...panel.querySelectorAll('a')].map((a) => { const b = a.getBoundingClientRect(); return { lang: a.getAttribute('data-lang-pick'), href: a.href, left: b.left, right: b.right, bottom: b.bottom, h: b.height }; });
          return { open: getComputedStyle(panel).display !== 'none' && r.height > 0, left: r.left, right: r.right, vw: document.documentElement.clientWidth, vh: innerHeight, items };
        })()`);
        const where = `language menu ${label} @${width}`;
        check(menu.open, `${where}: does not open`);
        check(menu.items.length === 2 + LANGUAGES.length, `${where}: ${menu.items.length} entries`);
        check(menu.items.every((i) => i.left >= -1 && i.right <= menu.vw + 1 && i.h >= 40), `${where}: entries outside the window or smaller than 40 px`);
        for (const i of menu.items) {
          const u = new URL(i.href);
          const pagePath = label.endsWith('/') ? label.slice(label.indexOf('/') + 1) : '';
          const expected = ['en', 'de'].includes(i.lang) ? `/${pagePath}?lang=${i.lang}` : `/${i.lang}/${pagePath}`;
          check(u.pathname + u.search === expected, `${where}: ${i.lang} leads to ${u.pathname}${u.search}, expected ${expected}`);
        }
        await shot(path.join(shots, 'menu', `${label.replace(/\//g, '_') || 'en'}${width}.png`));
      }
    }

    // EN/DE on a translated page: the English/German page in that language, the address without ?lang, the choice kept.
    await open(`${base}ru/roadmap/`, 1280);
    await evaluate("(document.querySelector('[data-set-lang=\"de\"]').click(), true)");
    await sleep(1500);
    const back = await evaluate("({ path: location.pathname + location.search, lang: document.documentElement.lang, stored: localStorage.getItem('propwash-lang') })");
    check(back.path === '/roadmap/' && back.lang === 'de' && back.stored === 'de', `DE on ru/roadmap/: got ${JSON.stringify(back)}`);

    // The hint to a translation, for a browser in French without a stored choice; closing it keeps the choice.
    await send('Emulation.setUserAgentOverride', { userAgent: ua, acceptLanguage: 'fr-FR,fr' });
    await open(`${base}docs/`, 1280);
    await evaluate("(localStorage.removeItem('propwash-lang'), true)");
    await open(`${base}docs/`, 1280);
    const hint = await evaluate(`(() => { const h = document.querySelector('.i18n-hint'); if (!h) return null; const a = h.querySelector('a'); return { lang: h.getAttribute('lang'), text: h.textContent.trim(), href: a && new URL(a.href).pathname, top: Math.round(h.getBoundingClientRect().top) }; })()`);
    check(!!hint && hint.lang === 'fr' && hint.href === '/fr/docs/' && hint.top === 61, `hint for a French browser on docs/: ${JSON.stringify(hint)}`);
    await shot(path.join(shots, 'menu', 'hint-fr1280.png'));
    await evaluate("(document.querySelector('.i18n-hint__close').click(), true)");
    await open(`${base}docs/`, 1280);
    check(await evaluate("!document.querySelector('.i18n-hint') && localStorage.getItem('propwash-lang') === 'en'"), 'the hint stays closed after closing it');
    await send('Emulation.setUserAgentOverride', { userAgent: ua, acceptLanguage: 'en-US,en' });
  } finally {
    browser.close();
    child.kill();
    server.close();
    await sleep(300);
    fs.rmSync(profile, { recursive: true, force: true });
    if (!process.argv.includes('--keep')) fs.rmSync(preview, { recursive: true, force: true });
  }
  for (const e of [...new Set(errors)]) failures.push(`page error: ${e}`);
  checks++;
  if (failures.length) {
    console.log(`layout: ${failures.length} of ${checks} checks FAILED`);
    for (const f of failures.slice(0, 80)) console.log(`  FAIL ${f}`);
    console.log(`screenshots: ${shots}`);
    process.exit(1);
  }
  console.log(`layout: ${checks} checks passed (${pagePaths.length} pages × ${LANGS.length} languages × ${WIDTHS.join('/')} px, ${loads} page loads); screenshots: ${shots}`);
}

main().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
