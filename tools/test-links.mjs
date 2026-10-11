#!/usr/bin/env node
// Link check over every page of the site.
//
//   node tools/test-links.mjs [--external] [--online] [--write-sitemap]
//
// Always: every local link, picture, script, style and font of every page exists; every anchor exists on its target
// page (the anchors the changelog draws from its data count too); every page has a canonical address that matches
// its place; sitemap.xml lists exactly the pages; no picture in assets/img is left unused; links in the roadmap and
// changelog data resolve like links on the pages.
// --external lists every external address with the pages that use it. --online also requests each one and prints
// the answer (a check for the day of publishing; addresses under PENDING only work once the owner has published).
// --write-sitemap rewrites sitemap.xml from the pages found.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://propwashfpv.com/';
// Addresses that go live with the release: the public source repositories and the Modrinth pages in review.
export const PENDING = [
  'https://github.com/LardTom/propwash-fpv',
  'https://github.com/LardTom/propwash-justmoreparts',
  'https://modrinth.com/mod/propwash-fpv',
];
const SKIP_DIRS = new Set(['node_modules', 'tools', 'assets']);

const failures = [];
let checks = 0;
function check(ok, message) {
  checks++;
  if (!ok) failures.push(message);
}
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(ROOT, file));

function findPages(dir = '') {
  const pages = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || (dir === '' && SKIP_DIRS.has(entry.name))) continue;
      pages.push(...findPages(path.posix.join(dir, entry.name)));
    } else if (entry.name === 'index.html') {
      pages.push(path.posix.join(dir, 'index.html'));
    }
  }
  return pages.sort();
}

function decode(value) {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

// Everything a page points to: href, src, srcset, data-zoom-src, and the inline data the docs keep for copy buttons.
function references(html) {
  const refs = [];
  const body = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(pre|code)\b[\s\S]*?<\/\1>/g, '');
  for (const m of body.matchAll(/\s(href|src|data-zoom-src|poster)="([^"]*)"/g)) refs.push(decode(m[2]));
  for (const m of body.matchAll(/\ssrcset="([^"]*)"/g)) {
    for (const part of m[1].split(',')) {
      const url = part.trim().split(/\s+/)[0];
      if (url) refs.push(decode(url));
    }
  }
  return refs;
}

function idsOf(html) {
  return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
}

const pages = findPages();
const pageIds = new Map(pages.map((p) => [p, idsOf(read(p))]));

// Anchors the changelog page draws at runtime from its data.
const changelog = JSON.parse(read('assets/data/changelog.json'));
for (const product of changelog.products) {
  pageIds.get('changelog/index.html').add(product.id);
  for (const release of product.releases) pageIds.get('changelog/index.html').add(release.id);
}

const external = new Map();
const used = new Set();

function resolve(from, ref, where) {
  if (/^(mailto:|tel:|data:|javascript:)/i.test(ref)) {
    check(ref.startsWith('data:'), `${where}: unexpected address ${ref.slice(0, 40)}`);
    return;
  }
  if (/^https?:\/\//i.test(ref)) {
    check(ref.startsWith('https://'), `${where}: not https: ${ref}`);
    if (ref.startsWith(SITE)) {
      resolve('index.html', ref.slice(SITE.length) || './', `${where} (${ref})`);
      return;
    }
    if (!external.has(ref)) external.set(ref, new Set());
    external.get(ref).add(from);
    return;
  }
  check(!ref.startsWith('//') && !ref.startsWith('/'), `${where}: ${ref} must be relative, the site also runs under a sub-path`);
  const [rawPath, anchor] = ref.split('#');
  const clean = rawPath.split('?')[0];
  let target = clean === '' ? from : path.posix.normalize(path.posix.join(path.posix.dirname(from), clean));
  if (target.startsWith('..')) {
    check(false, `${where}: ${ref} leaves the site`);
    return;
  }
  target = target.replace(/\/$/, '');
  if (target === '.') target = '';
  if (target === '' || clean.endsWith('/') || (exists(target) && fs.statSync(path.join(ROOT, target)).isDirectory())) {
    check(clean.endsWith('/'), `${where}: ${ref} points to a folder without the closing slash`);
    target = path.posix.join(target, 'index.html');
  }
  check(exists(target), `${where}: ${ref} not found (${target})`);
  used.add(target);
  if (anchor !== undefined && anchor !== '' && exists(target) && target.endsWith('.html')) {
    const ids = pageIds.get(target) || idsOf(read(target));
    // The configurator keeps a drone in its address (#PW1-…, #PW2…), that is not an anchor.
    if (!(target === 'configurator/index.html' && /^PW[12]/.test(anchor))) {
      check(ids.has(anchor), `${where}: anchor #${anchor} is missing on ${target}`);
    }
  }
}

for (const page of pages) {
  const html = read(page);
  for (const ref of references(html)) resolve(page, ref, page);

  const canonical = (html.match(/<link rel="canonical" href="([^"]+)">/) || [])[1];
  const expected = SITE + page.replace(/index\.html$/, '');
  check(canonical === expected, `${page}: canonical is ${canonical || 'missing'}, expected ${expected}`);
  const ogUrl = (html.match(/<meta property="og:url" content="([^"]+)">/) || [])[1];
  check(ogUrl === expected, `${page}: og:url is ${ogUrl || 'missing'}, expected ${expected}`);
  check(/<meta property="og:image" content="https:\/\/propwashfpv\.com\/assets\/img\/og-image\.jpg">/.test(html), `${page}: og:image`);
  check(/<meta name="description" content="[^"]{50,}">/.test(html), `${page}: description`);
  check(/<title>[^<]{5,}<\/title>/.test(html), `${page}: title`);
}

// Links inside the data files of the roadmap and the changelog.
function dataLinks(file, page) {
  const text = read(file);
  for (const m of text.matchAll(/"href":\s*"([^"]+)"/g)) resolve(page, m[1], `${file} (as on ${page})`);
  for (const m of text.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) resolve(page, m[1], `${file} (as on ${page})`);
}
dataLinks('assets/data/roadmap.json', 'roadmap/index.html');
dataLinks('assets/data/changelog.json', 'changelog/index.html');

// Pictures and fonts the styles load.
for (const css of fs.readdirSync(path.join(ROOT, 'assets/css')).filter((f) => f.endsWith('.css'))) {
  const file = `assets/css/${css}`;
  for (const m of read(file).matchAll(/url\((['"]?)([^'")]+)\1\)/g)) {
    // url(%23n) is a filter reference inside an inline SVG, not a file.
    if (!m[2].startsWith('data:') && !m[2].startsWith('%23') && !m[2].startsWith('#')) resolve(file, m[2], file);
  }
}

// No picture of the landing page or the docs is left behind unused.
const scripts = fs.readdirSync(path.join(ROOT, 'assets/js')).filter((f) => f.endsWith('.js')).map((f) => read(`assets/js/${f}`)).join('\n');
for (const dir of ['assets/img', 'assets/img/docs']) {
  for (const f of fs.readdirSync(path.join(ROOT, dir))) {
    if (!/\.(webp|png|jpg)$/.test(f)) continue;
    const file = `${dir}/${f}`;
    const metaOnly = f === 'og-image.jpg';
    check(used.has(file) || metaOnly || scripts.includes(f), `${file}: not used by any page`);
  }
}

// Sitemap and robots.txt.
const sitemapWanted = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
  pages.map((p) => `  <url><loc>${SITE}${p.replace(/index\.html$/, '')}</loc></url>`).join('\n')}\n</urlset>\n`;
if (process.argv.includes('--write-sitemap')) {
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemapWanted);
  console.log(`sitemap.xml written (${pages.length} pages)`);
}
check(exists('sitemap.xml') && read('sitemap.xml') === sitemapWanted, 'sitemap.xml does not list exactly the pages: run node tools/test-links.mjs --write-sitemap');
check(exists('robots.txt') && read('robots.txt').includes(`Sitemap: ${SITE}sitemap.xml`), 'robots.txt names the sitemap');
check(exists('CNAME') && read('CNAME').trim() === 'propwashfpv.com', 'CNAME is propwashfpv.com');
check(exists('.nojekyll'), '.nojekyll is there');

const isPending = (url) => PENDING.some((p) => url === p || url.startsWith(`${p}/`));

if (process.argv.includes('--external') || process.argv.includes('--online')) {
  const online = process.argv.includes('--online');
  console.log(`External addresses (${external.size}):`);
  for (const url of [...external.keys()].sort()) {
    const where = [...external.get(url)].map((p) => p.replace(/index\.html$/, '') || '/').sort();
    let status = '';
    if (online) {
      try {
        const res = await fetch(url, { method: 'GET', redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (link check)' }, signal: AbortSignal.timeout(20000) });
        status = ` -> ${res.status}`;
      } catch (e) {
        status = ` -> ${e.name}`;
      }
    }
    console.log(`  ${isPending(url) ? '[after publishing] ' : ''}${url}${status}  (${where.length > 4 ? `${where.length} pages` : where.join(', ')})`);
  }
}

if (failures.length) {
  console.log(`links: ${failures.length} of ${checks} checks FAILED`);
  for (const f of failures.slice(0, 60)) console.log(`  FAIL ${f}`);
  process.exit(1);
}
const pending = [...external.keys()].filter(isPending).length;
console.log(`links: ${checks} checks passed (${pages.length} pages, ${used.size} local files, ${external.size} external addresses, ${pending} of them live only after publishing)`);
