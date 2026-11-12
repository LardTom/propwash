#!/usr/bin/env node
// The link previews (og:image, twitter:image) of every page, owner finding OF-7: 1200 × 630 JPEG with the Propwash
// logo, the wordmark and the brand colors (the brand kit, brand/; style of the listing banners) over a shader shot of
// the community spawn at dusk, one picture per kind of page with its title.
//
//   node tools/build-og-images.mjs              # assets/img/og-*.jpg in headless Chrome, then the <head> of every page
//   node tools/build-og-images.mjs --meta       # only the <head> tags of the hand-written pages (no Chrome)
//   node tools/build-og-images.mjs --check      # lists pages whose tags are out of date, writes nothing
//   node tools/build-og-images.mjs --background <png>   # cut the background anew from a 2560 × 1440 shot
//   node tools/build-og-images.mjs --sheet <png>        # also a contact sheet of all variants (for a look)
//
// The background is tools/og/server-spawn-abend-1600.jpg, cut from server-spawn-abend.png of the 0.6.0 shots
// (Iris + Complementary, community spawn). The fonts are the site's own (assets/fonts/), the logo is
// assets/brand/propwash-logo-512.webp. The docs pages take their tags from tools/docs/html.mjs (ogFor), the others get
// them here. tools/test-links.mjs checks that every page points to the picture of its kind and that it is 1200 × 630.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { OG_VARIANTS, ogFor, ogTags, OG_SIZE } from './og-meta.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BACKGROUND = 'tools/og/server-spawn-abend-1600.jpg';
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CSS = `
@font-face{font-family:PWSaira;src:url('/assets/fonts/saira-var.woff2') format('woff2');font-weight:100 900;font-stretch:50% 125%}
@font-face{font-family:PWMono;src:url('/assets/fonts/jetbrains-mono-var.woff2') format('woff2');font-weight:100 800}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1200px;height:630px;background:#141414;-webkit-font-smoothing:antialiased;overflow:hidden}
.c{position:relative;width:1200px;height:630px;overflow:hidden;background:#141414;font-family:PWSaira;color:#f2f2f2}
.bg{position:absolute;left:-40px;top:-14px;width:1280px;height:auto;filter:saturate(1.12) contrast(1.06) brightness(1.18)}
.shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(20,20,20,.86) 0%,rgba(20,20,20,.55) 34%,rgba(20,20,20,.12) 62%,rgba(20,20,20,0) 100%)}
.shade2{position:absolute;inset:0;background:linear-gradient(0deg,rgba(14,14,14,.95) 0%,rgba(14,14,14,.78) 30%,rgba(14,14,14,.15) 58%,rgba(14,14,14,0) 72%,rgba(14,14,14,.35) 100%)}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,187,0,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(255,187,0,.07) 1px,transparent 1px);background-size:40px 40px;-webkit-mask-image:linear-gradient(0deg,#000 0%,#000 30%,transparent 62%)}
.scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.14) 0 1px,transparent 1px 3px)}
.corner{position:absolute;width:38px;height:38px;border-color:#ffbb00;border-style:solid}
.tl{top:26px;left:26px;border-width:4px 0 0 4px}.tr{top:26px;right:26px;border-width:4px 4px 0 0}
.bl{bottom:26px;left:26px;border-width:0 0 4px 4px}.br{bottom:26px;right:26px;border-width:0 4px 4px 0}
.osd{position:absolute;font:600 20px PWMono;color:rgba(255,255,255,.9);letter-spacing:.05em;text-shadow:0 1px 3px rgba(0,0,0,.85)}
.txt{position:absolute;left:70px;top:258px;width:760px}
.kind{display:inline-block;font:800 20px PWMono;letter-spacing:.14em;padding:7px 14px;border-radius:8px;background:#ffbb00;color:#141414;margin-bottom:16px}
.title{font-weight:780;font-stretch:108%;font-size:56px;line-height:1.03;letter-spacing:-.005em;text-shadow:0 4px 24px rgba(0,0,0,.7)}
.title.long{font-size:48px}
.brand{position:absolute;left:70px;bottom:62px;display:flex;align-items:center;gap:20px}
.logo{width:96px;height:96px;border-radius:20px;box-shadow:0 12px 36px rgba(0,0,0,.6),0 0 0 2px rgba(255,255,255,.06)}
.word{font-weight:850;font-stretch:118%;font-size:50px;line-height:.95;letter-spacing:.01em;text-transform:uppercase;text-shadow:0 4px 22px rgba(0,0,0,.55)}
.word span{color:#ffbb00}
.eye{margin-top:8px;font:700 16px PWMono;letter-spacing:.2em;color:#ffbb00}
.foot{position:absolute;right:70px;bottom:62px;display:flex;flex-direction:column;align-items:flex-end;gap:10px;font:700 19px PWMono;letter-spacing:.06em;color:#e2e2e2;text-shadow:0 1px 3px rgba(0,0,0,.8)}
.chip{padding:5px 12px;border-radius:7px;background:#ffbb00;color:#141414;text-shadow:none}
`;

function card(v) {
  return `<div class="c">
<img class="bg" src="/${BACKGROUND}" alt="">
<div class="shade"></div><div class="shade2"></div><div class="grid"></div><div class="scan"></div>
<div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
<div class="osd" style="top:42px;left:82px">LQ 100&nbsp;&nbsp;VID 100</div>
<div class="osd" style="top:74px;left:82px;color:#ffbb00">ACRO</div>
<div class="osd" style="top:42px;right:82px">25.2V</div>
<div class="osd" style="top:74px;right:82px">FLY 01:24</div>
<div class="txt">${v.kind ? `<div class="kind">${esc(v.kind)}</div>` : ''}<div class="title${v.title.length > 34 ? ' long' : ''}">${esc(v.title)}</div></div>
<div class="brand"><img class="logo" src="/assets/brand/propwash-logo-512.webp" alt="">
<div><div class="word">Propwash <span>FPV</span></div><div class="eye">MINECRAFT 26.3 · FABRIC &amp; NEOFORGE</div></div></div>
<div class="foot"><span class="chip">v0.6.0</span><span>propwashfpv.com</span></div>
</div>`;
}

async function renderImages() {
  const { serve, launch, cdp, CHROME, sleep } = await import('./headless-chrome.mjs');
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-og-'));
  const { child, ws } = await launch(arg('--chrome') || CHROME, profile);
  const browser = cdp(ws);
  const written = [];
  try {
    await browser.ready;
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => browser.send(method, params, sessionId);
    const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: OG_SIZE.width, height: OG_SIZE.height, deviceScaleFactor: 1, mobile: false });
    for (const v of OG_VARIANTS) {
      await send('Page.navigate', { url: `${base}/robots.txt` });
      await sleep(300);
      const { frameTree } = await send('Page.getFrameTree');
      await send('Page.setDocumentContent', { frameId: frameTree.frame.id, html: `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${card(v)}</body></html>` });
      await evaluate("Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode().catch(() => null))]).then(() => document.fonts.check('850 50px PWSaira'))");
      await sleep(200);
      const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, ...OG_SIZE, scale: 1 } });
      const png = path.join(profile, `${v.file}.png`);
      fs.writeFileSync(png, Buffer.from(shot.data, 'base64'));
      const target = path.join(ROOT, 'assets/img', v.file);
      execFileSync('magick', [png, '-strip', '-interlace', 'Plane', '-sampling-factor', '4:2:0', '-quality', '86', target]);
      written.push(target);
      console.log(`assets/img/${v.file}  ${OG_SIZE.width} × ${OG_SIZE.height}  ${Math.round(fs.statSync(target).size / 1024)} KB`);
    }
  } finally {
    browser.close();
    child.kill();
    server.close();
    await sleep(300);
    fs.rmSync(profile, { recursive: true, force: true });
  }
  const sheet = arg('--sheet');
  if (sheet) {
    execFileSync('magick', ['montage', ...written, '-tile', '2x', '-geometry', '600x315+8+8', '-background', '#0e0e0e', sheet]);
    console.log(`contact sheet: ${sheet}`);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The <head> of the hand-written pages: og:image and twitter:image of their kind, size, type and description of the
// picture, and the twitter texts the same as the og texts.

const SKIP = new Set(['node_modules', 'tools', 'assets', 'docs', '.git', '.claude']);
export function handPages(dir = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (e.name.startsWith('.') || (dir === '' && SKIP.has(e.name))) continue;
      out.push(...handPages(path.posix.join(dir, e.name)));
    } else if (e.name === 'index.html') out.push(path.posix.join(dir, e.name));
  }
  return out.sort();
}

const META_LINE = /^<meta (?:property="og:image(?::[a-z]+)?"|name="twitter:(?:card|title|description|image|image:alt)")[^>]*>\n/gm;

/** The head of a hand-written page with the tags of its kind (between og:description and the icons). */
export function withOgTags(page, html) {
  const title = (/<meta property="og:title" content="([^"]*)">/.exec(html) || [])[1];
  const description = (/<meta property="og:description" content="([^"]*)">/.exec(html) || [])[1];
  if (!title || !description) throw new Error(`${page}: og:title and og:description needed`);
  const cleaned = html.replace(META_LINE, '');
  const anchor = /<meta property="og:description" content="[^"]*">\n/.exec(cleaned);
  const tags = ogTags(ogFor(page), { title, description, raw: true });
  return cleaned.slice(0, anchor.index + anchor[0].length) + tags + cleaned.slice(anchor.index + anchor[0].length);
}

function meta(check) {
  const stale = [];
  for (const page of handPages()) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    if (!html.includes('<meta property="og:description"')) continue;
    const wanted = withOgTags(page, html);
    if (wanted !== html) stale.push(page);
    if (!check && wanted !== html) fs.writeFileSync(path.join(ROOT, page), wanted);
  }
  return stale;
}

async function main() {
  const bg = arg('--background');
  if (bg) {
    execFileSync('magick', [bg, '-resize', '1600x', '-strip', '-quality', '88', path.join(ROOT, BACKGROUND)]);
    console.log(`${BACKGROUND} from ${bg}`);
  }
  if (process.argv.includes('--check')) {
    const stale = meta(true);
    if (stale.length) {
      console.log(`og: out of date, run node tools/build-og-images.mjs --meta: ${stale.join(', ')}`);
      process.exit(1);
    }
    console.log('og: every hand-written page has the tags of its kind');
    return;
  }
  if (!process.argv.includes('--meta')) await renderImages();
  const stale = meta(false);
  console.log(stale.length ? `og: tags written into ${stale.join(', ')}` : 'og: every hand-written page is up to date');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
