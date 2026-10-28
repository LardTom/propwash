#!/usr/bin/env node
// The brand kit page brand/ (propwashfpv.com/brand/): the kit for creators and what it holds.
//   - brand/index.html is a page of the site in English and German, in tools/build-nav.mjs (HAND_PAGES), in the pages
//     the other languages translate (tools/i18n/pages.mjs) and in sitemap.xml
//   - the download assets/brand/propwash-brand-kit.zip: a ZIP of about 3.7 MB with README.md, the logo from 32 to
//     1024 px and its previews, the colors as PNG, CSS and JSON, Barlow Condensed and JetBrains Mono each with OFL.txt
//     and the images; no __MACOSX, .DS_Store or ZIP inside; the page names its real size (English 3.7 MB, German 3,7 MB)
//   - colors: the page shows the palette of the kit (colors/propwash-colors.json, the table in README.md) in its order,
//     each color with name, hex value, use and a copy button for the hex value, the swatch drawn in that color
//   - logo preview on dark and on light, fonts Barlow Condensed and JetBrains Mono under the SIL Open Font License 1.1
//     with the OFL texts on the site, the usage rules and the Minecraft notice of the README in English and German
//   - only lardtom: neither the page nor the kit's README carries the name of the legal notice (impressum/)
//   - every text of the page and the footer link have a translation in the five dictionaries (same tags, numbers, code
//     spans and glossary terms), and the generated page of each language has them
//   - headless Chrome, en/de at 1280 and 390 px: every copy button puts its hex value on the clipboard and says so,
//     the download link answers with the ZIP, no console error, no request outside the site
//
//   node tools/test-brand.mjs [--no-browser]

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { HAND_PAGES } from './build-nav.mjs';
import { siteFooterLinks } from './site-nav.mjs';
import { PAGES } from './i18n/pages.mjs';
import { LANGUAGES, loadDict } from './i18n/languages.mjs';
import { pageTexts, navTexts } from './i18n/extract.mjs';
import { buildSite } from './i18n/build-i18n.mjs';
import { plain, tagSignature } from './i18n/html.mjs';
import { counter, flag, startBrowser, ROOT } from './fixtures/cov/browser.mjs';

const { check, finish } = counter('brand');
const PAGE = 'brand/index.html';
const KIT = 'assets/brand/propwash-brand-kit.zip';
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function unzip(file) {
  const buf = fs.readFileSync(file);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error(`${file}: no ZIP directory`);
  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error(`${file}: broken ZIP directory`);
    const method = buf.readUInt16LE(at + 10);
    const size = buf.readUInt32LE(at + 20);
    const nameLength = buf.readUInt16LE(at + 28);
    const extra = buf.readUInt16LE(at + 30);
    const comment = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLength);
    entries.set(name, () => {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      return method === 8 ? zlib.inflateRawSync(data) : Buffer.from(data);
    });
    at += 46 + nameLength + extra + comment;
  }
  return entries;
}

// 1. The page and where it is known.
check(exists(PAGE), `${PAGE} is there`);
check(HAND_PAGES.some(([file, prefix]) => file === PAGE && prefix === '../'), `${PAGE} is in HAND_PAGES of tools/build-nav.mjs`);
check(PAGES.some((p) => p.file === PAGE && p.path === 'brand/' && !p.optional), `${PAGE} is translated (tools/i18n/pages.mjs)`);
check(exists('sitemap.xml') && read('sitemap.xml').includes('<loc>https://propwashfpv.com/brand/</loc>'), 'sitemap.xml lists brand/');
const footer = siteFooterLinks('../', 'impressum');
check(/<a href="\.\.\/brand\/"><span lang="en">Brand kit<\/span><span lang="de">Presse &amp; Brand<\/span><\/a>/.test(footer), 'the footer links to brand/ as “Brand kit” / “Presse & Brand”');
check(/<a href="\.\/"><span lang="en">Brand kit<\/span>/.test(siteFooterLinks('../', 'brand')), 'on brand/ the footer link points to the page itself');

const html = exists(PAGE) ? read(PAGE) : '';
const body = html.slice(Math.max(0, html.indexOf('<body'))).replace(/<nav class="site-nav"[\s\S]*?<\/nav>/, '').replace(/<p class="site-footer__links">[\s\S]*?<\/p>/, '');
const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const textOf = (lang) => plain(body.replace(new RegExp(`<([a-z0-9]+)\\b[^>]*\\blang="${lang === 'en' ? 'de' : 'en'}"[^>]*>[\\s\\S]*?<\\/\\1>`, 'g'), ' '));
const en = textOf('en');
const de = textOf('de');

check(/<link rel="canonical" href="https:\/\/propwashfpv\.com\/brand\/">/.test(html), 'canonical address brand/');
check(/data-title-en="Brand kit – Propwash FPV"/.test(html) && /data-title-de="Brand-Kit – Propwash FPV"/.test(html), 'title in English and German');
check(/<link rel="stylesheet" href="\.\.\/assets\/css\/brand\.css\?v=[0-9a-f]{8}">/.test(html), 'the page loads brand.css');
check(/<script src="\.\.\/assets\/js\/brand\.js\?v=[0-9a-f]{8}" defer><\/script>/.test(html), 'the page loads brand.js');
for (const id of ['kit', 'logo', 'colors', 'fonts', 'rules']) check(ids.has(id), `section #${id}`);

// 2. The kit.
let entries = new Map();
let size = 0;
if (check(exists(KIT), `${KIT} is there`)) {
  size = fs.statSync(path.join(ROOT, KIT)).size;
  check(fs.readFileSync(path.join(ROOT, KIT)).subarray(0, 2).toString('latin1') === 'PK', `${KIT} is a ZIP`);
  check(size > 3.2e6 && size < 4.2e6, `${KIT}: about 3.7 MB (${size} bytes)`);
  try {
    entries = unzip(path.join(ROOT, KIT));
  } catch (e) {
    check(false, e.message);
  }
}
const names = [...entries.keys()];
const root = (names.find((n) => n.endsWith('README.md')) || '').replace(/README\.md$/, '');
const kitFile = (rel) => entries.get(root + rel);
const wanted = ['README.md', 'colors/propwash-colors.json', 'colors/propwash-colors.css', 'colors/propwash-palette.png',
  'fonts/BarlowCondensed/OFL.txt', 'fonts/BarlowCondensed/BarlowCondensed-BlackItalic.ttf', 'fonts/BarlowCondensed/BarlowCondensed-ExtraBoldItalic.ttf',
  'fonts/BarlowCondensed/BarlowCondensed-Bold.ttf', 'fonts/BarlowCondensed/BarlowCondensed-SemiBold.ttf', 'fonts/JetBrainsMono/OFL.txt',
  'logo/preview-on-dark.png', 'logo/preview-on-light.png', 'images/key-art-1200x630.jpg',
  ...[32, 64, 128, 256, 512, 1024].map((px) => `logo/propwash-logo-${px}.png`)];
for (const rel of wanted) check(!!kitFile(rel), `kit: ${rel}`);
check(names.some((n) => n.startsWith(`${root}fonts/JetBrainsMono/`) && n.endsWith('.ttf')), 'kit: JetBrains Mono font');
check(names.filter((n) => n.startsWith(`${root}images/`) && n.endsWith('.jpg')).length >= 5, 'kit: key art and in-game shots');
check(!names.some((n) => /(^|\/)(__MACOSX|\.DS_Store)(\/|$)|(^|\/)\._/.test(n)), 'kit: no __MACOSX or .DS_Store');
check(!names.some((n) => n.endsWith('.zip')), 'kit: no ZIP inside the ZIP');
check(!root || /^[\w-]+\/$/.test(root), `kit: one folder at the top (${root || 'none'})`);

const mb = (size / 1e6).toFixed(1);
check(en.includes(`ZIP · ${mb} MB`), `the page names the size in English: ZIP · ${mb} MB`);
check(de.includes(`ZIP · ${mb.replace('.', ',')} MB`), `the page names the size in German: ZIP · ${mb.replace('.', ',')} MB`);
const download = /<a class="btn btn--primary[^"]*" href="([^"]+)" download="propwash-brand-kit\.zip"/.exec(html);
check(download && download[1] === `../${KIT}`, 'download button to the kit');

const readme = kitFile('README.md') ? kitFile('README.md')().toString('utf8') : '';
let palette = [];
try {
  palette = kitFile('colors/propwash-colors.json') ? JSON.parse(kitFile('colors/propwash-colors.json')().toString('utf8')) : [];
} catch (e) {
  check(false, `kit: colors/propwash-colors.json: ${e.message}`);
}
check(palette.length === 10, `kit: 10 colors (${palette.length})`);
const readmeHex = [...(/## Colors[\s\S]*?\n## /.exec(readme)?.[0] || '').matchAll(/`(#[0-9A-F]{6})`/g)].map((m) => m[1]);
check(readmeHex.join() === palette.map((c) => c.hex).join(), `the README table has the colors of propwash-colors.json (${readmeHex.join(' ')})`);
const css = kitFile('colors/propwash-colors.css') ? kitFile('colors/propwash-colors.css')().toString('utf8') : '';
for (const c of palette) check(css.includes(`: ${c.hex};`), `propwash-colors.css has ${c.name} ${c.hex}`);

// 3. Colors on the page.
const swatches = [...html.matchAll(/<li class="brand-color" style="--swatch: (#[0-9A-F]{6})" data-color="(#[0-9A-F]{6})">([\s\S]*?)<\/li>/g)];
check(swatches.length === palette.length, `the page shows ${swatches.length} colors, the kit has ${palette.length}`);
palette.forEach((c, i) => {
  const s = swatches[i];
  if (!check(!!s, `color ${c.name} on the page`)) return;
  check(s[1] === c.hex && s[2] === c.hex, `color ${i + 1}: ${c.name} ${c.hex} in the kit's order (page: ${s[1]})`);
  check(s[3].includes(`<h3 class="brand-color__name">${c.name}</h3>`), `${c.name}: name`);
  check(s[3].includes(`<code class="brand-color__hex" id="hex-${c.hex.slice(1).toLowerCase()}">${c.hex}</code>`), `${c.name}: hex value ${c.hex}`);
  const rgb = [1, 3, 5].map((k) => parseInt(c.hex.slice(k, k + 2), 16)).join(', ');
  check(s[3].includes(`RGB ${rgb}`), `${c.name}: RGB ${rgb}`);
  check(s[3].includes(`<span lang="en">${c.use}</span>`), `${c.name}: use “${c.use}” as in the kit`);
  check(new RegExp(`<button type="button" class="brand-copy needs-js" id="copy-${c.hex.slice(1).toLowerCase()}" data-copy-value="${c.hex}" aria-labelledby="copy-${c.hex.slice(1).toLowerCase()} hex-${c.hex.slice(1).toLowerCase()}">`).test(s[3]), `${c.name}: copy button for ${c.hex}`);
});
check(/<p class="sr-only" role="status" data-brand-status><\/p>/.test(html), 'a status line announces the copy');

// 4. Logo, fonts, rules.
check(/<img src="\.\.\/assets\/brand\/propwash-logo-256\.webp" srcset="\.\.\/assets\/brand\/propwash-logo-256\.webp 256w, \.\.\/assets\/brand\/propwash-logo-512\.webp 512w"/.test(html), 'logo preview from assets/brand/');
check((html.match(/class="brand-logo brand-logo--(dark|light)"/g) || []).length === 2, 'logo preview on dark and on light');
for (const f of ['assets/brand/propwash-logo-256.webp', 'assets/brand/propwash-logo-512.webp']) check(exists(f), `${f} is there`);
for (const [font, ofl, kitOfl] of [['Barlow Condensed', 'OFL-BarlowCondensed.txt', 'fonts/BarlowCondensed/OFL.txt'], ['JetBrains Mono', 'OFL-JetBrainsMono.txt', 'fonts/JetBrainsMono/OFL.txt']]) {
  check(en.includes(font) && de.includes(font), `fonts: ${font}`);
  check(html.includes(`href="../assets/fonts/${ofl}"`) && exists(`assets/fonts/${ofl}`), `fonts: license text ${ofl} on the site`);
  if (font === 'Barlow Condensed' && kitFile(kitOfl)) check(exists(`assets/fonts/${ofl}`) && read(`assets/fonts/${ofl}`) === kitFile(kitOfl)().toString('utf8'), `${ofl} is the license of the kit`);
}
check(en.includes('SIL Open Font License 1.1') && de.includes('SIL Open Font License 1.1'), 'fonts: SIL Open Font License 1.1 in English and German');
for (const f of ['barlow-condensed-900-italic.woff2', 'barlow-condensed-800-italic.woff2']) check(exists(`assets/fonts/${f}`) && read('assets/css/brand.css').includes(`url("../fonts/${f}")`), `font sample ${f}`);
const RULES_EN = ['Propwash FPV is not an official Minecraft product and is not approved by or associated with Mojang or Microsoft. Minecraft is a trademark of Mojang AB.',
  'don’t sell merchandise with the logo', 'Leave some free space around it, at least 1/4 of its width.', 'Scaling is fine.', 'Not “PropWash”, “Prop Wash” or “Propwash mod FPV”.',
  'Propwash FPV is made by lardtom.'];
const RULES_DE = ['Propwash FPV ist kein offizielles Minecraft-Produkt und weder von Mojang oder Microsoft genehmigt noch mit Mojang oder Microsoft verbunden. Minecraft ist eine Marke von Mojang AB.',
  'verkaufe kein Merchandise mit dem Logo', 'Lass Platz um das Logo, mindestens 1/4 seiner Breite.', 'Skalieren ist erlaubt.', 'Nicht „PropWash“, „Prop Wash“ oder „Propwash mod FPV“.',
  'Propwash FPV ist von lardtom.'];
for (const r of RULES_EN) check(en.includes(r), `rules in English: ${r.slice(0, 60)}`);
for (const r of RULES_DE) check(de.includes(r), `rules in German: ${r.slice(0, 60)}`);
check(/href="https:\/\/discord\.gg\/[\w]+" target="_blank" rel="noopener">Discord<\/a>/.test(body), 'questions: link to the Discord');

// 5. Only lardtom.
const impressum = read('impressum/index.html');
const person = /<p lang="en">([^<(]+?) \(propwashfpv\)<br>/.exec(impressum)?.[1]?.trim();
if (check(!!person && /\S+ \S+/.test(person), 'the name of the legal notice is readable for the check')) {
  const parts = [person, person.split(' ').pop()].map((s) => s.toLowerCase());
  for (const [what, text] of [[PAGE, html], ['README.md of the kit', readme]]) {
    check(!parts.some((p) => text.toLowerCase().includes(p)), `${what}: no real name, only lardtom`);
    check(text.includes('lardtom'), `${what}: names lardtom`);
  }
}

// 6. Translations.
const texts = exists(PAGE) ? [...new Set([...pageTexts(html).texts.map((t) => t.key), ...navTexts('../', 'brand', [])])] : [];
check(texts.length > 40, `texts of the page found (${texts.length})`);
const footerKey = 'Brand kit';
check(texts.includes(footerKey), 'the footer link is among the texts');
const numbers = (t) => (plain(t).match(/\d+/g) || []).sort().join(' ');
const codes = (t) => [...t.matchAll(/<(code|kbd)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => m[2]).sort().join('|');
const KEEP = JSON.parse(read('tools/i18n/glossary.json')).keep;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const brandKeys = texts.filter((k) => !['Main', 'Features', 'Docs', 'Changelog', 'Roadmap', 'Download', 'Configurator', 'Source code', 'Legal notice', 'Privacy policy'].includes(k));
for (const l of LANGUAGES) {
  const dict = loadDict(l.code);
  const missing = texts.filter((k) => typeof dict.entries[k] !== 'string' || !dict.entries[k].trim());
  check(!missing.length, `${l.code}: ${missing.length} texts of the page without translation (first: ${missing[0]})`);
  for (const k of brandKeys) {
    const tr = dict.entries[k];
    if (typeof tr !== 'string') continue;
    const where = `${l.code} "${k.slice(0, 50)}"`;
    check(JSON.stringify(tagSignature(k)) === JSON.stringify(tagSignature(tr)), `${where}: tags or links differ`);
    check(numbers(k) === numbers(tr), `${where}: numbers differ (${numbers(k)} / ${numbers(tr)})`);
    check(codes(k) === codes(tr), `${where}: code spans differ`);
    for (const term of KEEP) if (new RegExp(`(?<![\\p{L}\\d])${esc(term)}(?![\\p{L}\\d])`, 'u').test(plain(k))) check(plain(tr).includes(term), `${where}: glossary term ${term} changed`);
    check(!plain(tr).toLowerCase().includes('lardtom') || plain(k).includes('lardtom'), `${where}: lardtom only where the English has it`);
  }
}
if (texts.length) {
  const { files } = buildSite({ languages: LANGUAGES, mode: 'strict' });
  for (const l of LANGUAGES) {
    const page = files.get(`${l.code}/${PAGE}`);
    if (!check(!!page, `${l.code}/${PAGE} is generated`)) continue;
    const dict = loadDict(l.code);
    check(!/<(span|p|h[1-6]|li|figcaption|strong|div) lang="(en|de)"/.test(page), `${l.code}/${PAGE}: no English/German pair left`);
    check(page.includes('href="../../assets/brand/propwash-brand-kit.zip"'), `${l.code}/${PAGE}: download from the site root`);
    const title = dict.entries['Brand kit'];
    check(!!title && page.includes(title), `${l.code}/${PAGE}: the footer link in the language (${title})`);
  }
}

// 7. In the browser.
if (!flag('--no-browser') && exists(PAGE)) {
  const browser = await startBrowser();
  try {
    for (const lang of ['en', 'de']) {
      for (const width of [1280, 390]) {
        const tab = await browser.page({ lang });
        const where = `${lang} ${width} px`;
        await tab.open('/brand/', { width, lang, ready: "document.readyState === 'complete'" });
        check(await tab.evaluate('document.documentElement.lang') === lang, `${where}: page language`);
        check(await tab.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), `${where}: no horizontal overflow`);
        for (const c of palette) {
          const id = `#copy-${c.hex.slice(1).toLowerCase()}`;
          const at = await tab.center(id);
          if (!check(!!at, `${where}: copy button ${c.hex}`)) continue;
          const before = (await tab.copies()).length;
          await tab.click(at.x, at.y);
          const copies = await tab.copies();
          check(copies.length === before + 1 && copies[copies.length - 1] === c.hex, `${where}: ${c.name} copies ${c.hex} (got ${copies.slice(before).join(', ') || 'nothing'})`);
          const state = await tab.evaluate(`(() => {
            const b = document.querySelector('${id}');
            const done = b.querySelector('.brand-copy__done');
            return { done: b.classList.contains('is-done') && getComputedStyle(done).display !== 'none', status: document.querySelector('[data-brand-status]').textContent };
          })()`);
          check(state.done, `${where}: ${c.hex} shows that it was copied`);
          check(state.status === `${lang === 'de' ? 'Kopiert' : 'Copied'}: ${c.hex}`, `${where}: status line “${state.status}”`);
        }
        const kit = await tab.evaluate(`(async () => {
          const a = document.querySelector('a[download]');
          const r = await fetch(a.href);
          const b = new Uint8Array(await r.arrayBuffer());
          return { ok: r.ok, size: b.length, pk: String.fromCharCode(b[0], b[1]) };
        })()`);
        check(kit.ok && kit.size === size && kit.pk === 'PK', `${where}: the download link answers with the kit (${kit.size} bytes)`);
        const logos = await tab.evaluate("[...document.querySelectorAll('.brand-logo img')].map((i) => i.complete && i.naturalWidth > 0)");
        check(logos.length === 2 && logos.every(Boolean), `${where}: logo preview loaded`);
        const sample = await tab.evaluate("document.fonts.check('900 italic 40px \"PW Barlow\"')");
        check(sample, `${where}: Barlow Condensed for the font sample loaded`);
        check(!tab.errors.length, `${where}: ${tab.errors.slice(0, 3).join('; ')}`);
        const outside = tab.requests.filter((u) => !u.startsWith(browser.base) && !u.startsWith('data:') && u !== 'about:blank');
        check(!outside.length, `${where}: requests outside the site: ${outside.slice(0, 3).join(', ')}`);
        await tab.close();
      }
    }
  } finally {
    await browser.close();
  }
}

finish(`${palette.length} colors, kit ${size} bytes with ${names.length} entries, ${texts.length} texts in ${LANGUAGES.length} languages`);
