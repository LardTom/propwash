#!/usr/bin/env node
// The community server on the website (owner finding OF-5): players should see that there is a server.
//   - the landing page has its own section #server right after the hero: the address mc.propwashfpv.com, Fabric and
//     NeoForge, a button “Copy address” (only with JavaScript; without it the address stays plain text to select), the
//     Discord and pictures of the server (spawn, drones, shop, arena), each with a description in English and German
//   - only what is certain: no mod list, no versions and no Minecraft version in the section (the server itself
//     names what a player needs when they join), no Ko-fi anywhere on the site
//   - the hero and the Features menu point to #server, and so does every add-on page
//   - headless Chrome, en/de at 1280 px (click) and 390 px (tap): the button puts the address on the clipboard and
//     says so; the section fits the width
//
//   node tools/test-server.mjs [--no-browser]

import fs from 'node:fs';
import path from 'node:path';
import { FEATURES } from './site-nav.mjs';
import { counter, flag, startBrowser, ROOT } from './fixtures/cov/browser.mjs';

const { check, finish } = counter('server');
const ADDRESS = 'mc.propwashfpv.com';
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const html = read('index.html');
const said = (block, lang) => [...block.matchAll(new RegExp(`<([a-z0-9]+)[^>]*lang="${lang}"[^>]*>([\\s\\S]*?)</\\1>`, 'g'))]
  .map((m) => m[2].replace(/<[^>]+>/g, '')).join(' ').replace(/\s+/g, ' ');

// 1. The section and its place.
const sections = [...html.matchAll(/<section class="[^"]*" id="([a-z-]+)"/g)].map((m) => m[1]);
check(sections[0] === 'top' && sections[1] === 'server', `#server comes right after the hero (${sections.slice(0, 3).join(', ')})`);
const section = (/<section[^>]*id="server"[\s\S]*?<\/section>/.exec(html) || [''])[0];
check(section, 'index.html has the section #server');
const en = said(section, 'en');
const de = said(section, 'de');
check(section.includes(`>${ADDRESS}<`), `the address ${ADDRESS} stands as text`);
check(/Fabric/.test(en) && /NeoForge/.test(en) && /Fabric/.test(de) && /NeoForge/.test(de), 'Fabric and NeoForge in English and German');
const copy = /<button[^>]*data-copy-value="([^"]+)"[^>]*>/.exec(section);
check(copy && copy[1] === ADDRESS && /class="[^"]*needs-js/.test(copy[0]), `a button copies ${ADDRESS} (only with JavaScript)`);
check(/Copy address/.test(en) && /Adresse kopieren/.test(de), 'the button says “Copy address” / „Adresse kopieren“');
check(/href="https:\/\/discord\.gg\/[A-Za-z0-9]+"/.test(section), 'the section links the Discord');
const pictures = [...section.matchAll(/<img [^>]*src="assets\/img\/(server-[a-z-]+)-(?:800|1600)\.webp"[^>]*>/g)];
check(pictures.length >= 4, `pictures of the server (${pictures.map((m) => m[1]).join(', ')})`);
for (const m of pictures) {
  check(/ alt="[^"]{20,}"/.test(m[0]) && / data-de-alt="[^"]{20,}"/.test(m[0]), `${m[1]}: description in English and German`);
  check(fs.existsSync(path.join(ROOT, `assets/img/${m[1]}-800.webp`)) && fs.existsSync(path.join(ROOT, `assets/img/${m[1]}-1600.webp`)), `${m[1]}: 800 and 1600 px`);
}
check(pictures.some((m) => m[1] === 'server-spawn-portals') && /fetchpriority|loading="lazy"/.test(section), 'the spawn with its portals is the main picture');
const invented = [/\b26\.\d\b/, /\bMinecraft 1\.\d/, /Just More Parts|Camera Drones|Mob Defense/, /whitelist|Whitelist/, /\b\d+ (?:slots|players)\b/i, /\b0\.6\.0\b(?! you can| kannst)/];
for (const re of invented) check(!re.test(en) && !re.test(de), `nothing the server itself decides: ${re}`);

// 2. Pointers to the section.
check(/<section class="hero"[\s\S]*?href="#server"[\s\S]*?<\/section>/.test(html), 'the hero points to #server');
check(FEATURES.some((f) => f.href === '#server'), 'the Features menu has the community server');
check(FEATURES[0].href === '#server', 'the Features menu lists the server first, in the order of the page');
for (const page of ['addons/just-more-parts/index.html', 'addons/camera-drones/index.html', 'addons/mob-defense/index.html']) {
  check(read(page).includes('href="../../#server"'), `${page} points to the server`);
}
check(read('addons/index.html').includes('href="../#server"'), 'addons/index.html points to the server');

// 3. No Ko-fi on the site.
function pages(dir = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (e.name.startsWith('.') || ['node_modules', 'tools'].includes(e.name)) continue;
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...pages(rel));
    else if (/\.(html|json)$/.test(e.name)) out.push(rel);
  }
  return out;
}
const kofi = pages().filter((f) => /ko-fi/i.test(read(f)));
check(!kofi.length, `no Ko-fi on the site (${kofi.join(', ')})`);

// 4. In the browser.
if (!flag('--no-browser')) {
  const browser = await startBrowser();
  try {
    for (const lang of ['en', 'de']) {
      for (const width of [1280, 390]) {
        const tab = await browser.page({ lang });
        const where = `${lang} ${width} px`;
        await tab.open('/', { width, lang, ready: "document.readyState === 'complete'" });
        const box = await tab.evaluate(`(() => { const s = document.querySelector('#server'); const r = s.getBoundingClientRect(); return [window.innerWidth, Math.round(r.width), document.documentElement.scrollWidth]; })()`);
        check(box[1] <= box[0] + 1 && box[2] <= width + 1, `${where}: #server fits the width (${box.join(' / ')})`);
        const at = await tab.center('#server [data-copy-value]');
        if (!check(!!at, `${where}: the copy button is visible`)) { await tab.close?.(); continue; }
        const before = (await tab.copies()).length;
        if (width < 600) await tab.tap(at.x, at.y);
        else await tab.click(at.x, at.y);
        const copies = await tab.copies();
        check(copies.length === before + 1 && copies[copies.length - 1] === ADDRESS, `${where}: the button copies ${ADDRESS} (got ${copies.slice(before).join(', ') || 'nothing'})`);
        const state = await tab.evaluate(`(() => {
          const b = document.querySelector('#server [data-copy-value]');
          const done = b.querySelector('.server__copy-done');
          return { done: b.classList.contains('is-done') && getComputedStyle(done).display !== 'none', live: (document.querySelector('#server [data-copy-status]') || {}).textContent || '' };
        })()`);
        check(state.done, `${where}: the button shows that the address was copied`);
        check(state.live.includes(ADDRESS), `${where}: the status line for screen readers names the address (“${state.live}”)`);
        const shots = await tab.evaluate("[...document.querySelectorAll('#server img')].map((i) => { i.loading = 'eager'; return i.getAttribute('src'); })");
        check(shots.length >= 4, `${where}: ${shots.length} pictures in the section`);
        check(!tab.errors.length, `${where}: ${tab.errors.slice(0, 3).join('; ')}`);
      }
    }
  } finally {
    await browser.close();
  }
}

finish(`#server on the landing page, pointers from the hero, the Features menu and the add-on pages${flag('--no-browser') ? '' : ', copy button in headless Chrome (en/de, 1280/390 px)'}`);
