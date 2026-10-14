#!/usr/bin/env node
// Checks the main navigation and the footer links of every page (tools/site-nav.mjs):
//   - every page carries exactly the navigation and footer links tools/site-nav.mjs gives for it (hand-written pages:
//     node tools/build-nav.mjs, docs pages: node tools/build-docs.mjs --render-only), and no page is left out
//   - every entry of the "Features" menu points to a section of the landing page, the menu button controls the menu,
//     the menu button of the header controls the navigation
//   - the landing page keeps the anchors older links use, and shows the configurator three times: in the header, in
//     the hero and in its own section with the picture from tools/build-configurator-shot.mjs
//   - main.js switches between the small-screen menu and the header bar at the same width as the styles
//
//   node tools/test-nav.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteNav, siteFooterLinks, FEATURES, NAV_PATTERN, FOOTER_PATTERN } from './site-nav.mjs';
import { HAND_PAGES } from './build-nav.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let checks = 0;
const failures = [];
function check(ok, message) {
  checks++;
  if (!ok) failures.push(message);
}

function findPages(dir = '') {
  const out = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name.startsWith('.') || ['assets', 'tools', 'node_modules'].includes(entry.name)) continue;
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findPages(rel));
    else if (entry.name === 'index.html') out.push(rel);
  }
  return out.sort();
}

// 1. Every page has the current navigation and footer links.
const known = new Map(HAND_PAGES.map(([file, prefix, current]) => [file, { prefix, current }]));
const pages = findPages();
for (const file of pages) {
  let spec = known.get(file);
  if (!spec && file.startsWith('docs/')) {
    const depth = file.split('/').length - 1;
    spec = { prefix: '../'.repeat(depth), current: file === 'docs/index.html' ? 'docs' : 'docs-sub' };
  }
  check(!!spec, `${file}: page unknown to tools/build-nav.mjs (add it to HAND_PAGES)`);
  if (!spec) continue;
  const html = read(file);
  const navs = html.match(new RegExp(NAV_PATTERN.source, 'gm')) || [];
  check(navs.length === 1, `${file}: ${navs.length} main navigations, expected 1`);
  const fix = file.startsWith('docs/') ? 'node tools/build-docs.mjs --render-only' : 'node tools/build-nav.mjs';
  check(navs[0] === siteNav(spec.prefix, spec.current), `${file}: navigation is not the one of tools/site-nav.mjs (${fix})`);
  check((html.match(FOOTER_PATTERN) || [])[0] === siteFooterLinks(spec.prefix, spec.current), `${file}: footer links are not the ones of tools/site-nav.mjs (${fix})`);
  check(/<button type="button" class="nav-toggle needs-js" aria-expanded="false" aria-controls="site-nav"/.test(html), `${file}: menu button controls #site-nav`);
  const nav = navs[0] || '';
  for (const m of nav.matchAll(/aria-controls="([^"]+)"/g)) check(nav.includes(`id="${m[1]}"`), `${file}: menu button controls #${m[1]}, which is not in the navigation`);
  check((nav.match(/class="site-nav__cta"/g) || []).length === 1, `${file}: one configurator button in the navigation`);
}
check(pages.length >= HAND_PAGES.length, 'all hand-written pages found');

// 2. The landing page: sections of the "Features" menu, old anchors, the configurator.
const home = read('index.html');
const ids = new Set([...home.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
for (const f of FEATURES) check(ids.has(f.href.slice(1)), `index.html: no section ${f.href} for the menu entry "${f.title.en}"`);
for (const id of ['top', 'new', 'how', 'learn', 'configurator', 'flight', 'video', 'racing', 'survival', 'extras', 'gallery', 'faq', 'download', 'release', 'community', 'source']) {
  check(ids.has(id), `index.html: anchor #${id} is gone (links from Discord, the changelog or older pages use it)`);
}
const hero = /<section class="hero"[\s\S]*?<\/section>/.exec(home)?.[0] || '';
check(/<a class="btn btn--config" href="configurator\/">/.test(hero), 'index.html: the hero links to the configurator');
const teaser = /<section class="section section--config" id="configurator"[\s\S]*?<\/section>/.exec(home)?.[0] || '';
check(/href="configurator\/"/.test(teaser), 'index.html: the configurator section links to the configurator');
for (const m of teaser.matchAll(/(?:src|srcset)="([^"]+)"/g)) {
  for (const part of m[1].split(',')) {
    const file = part.trim().split(/\s+/)[0];
    check(fs.existsSync(path.join(ROOT, file)), `index.html: configurator picture ${file} missing (node tools/build-configurator-shot.mjs)`);
  }
}
check(/configurator-preview-\d+\.webp/.test(teaser), 'index.html: the configurator section shows the configurator picture');
const sections = [...home.matchAll(/<section class="[^"]*" id="([^"]+)"/g)].map((m) => m[1]);
const order = FEATURES.map((f) => f.href.slice(1)).filter((id) => sections.includes(id));
check(order.join() === sections.filter((id) => order.includes(id)).join(), `index.html: the "Features" menu lists the sections in page order (${sections.join(', ')})`);

// 3. Same breakpoint in the script and the styles.
const css = read('assets/css/style.css');
const js = read('assets/js/main.js');
const cssWide = /@media \(min-width: (\d+)px\) \{\n  \.site-nav \{\n    display: flex;/.exec(css)?.[1];
const cssNarrow = /@media \(max-width: (\d+)px\) \{\n  \.site-nav\.is-open \{/.exec(css)?.[1];
const jsWide = /\(function navMenu\(\) \{[\s\S]*?matchMedia\('\(min-width: (\d+)px\)'\)/.exec(js)?.[1];
check(!!cssWide && !!jsWide && cssWide === jsWide, `main.js switches the menu at ${jsWide} px, the styles at ${cssWide} px`);
check(!!cssNarrow && Number(cssNarrow) + 1 === Number(cssWide), `small-screen menu up to ${cssNarrow} px, header bar from ${cssWide} px`);
const toggleHidden = /@media \(min-width: (\d+)px\) \{\n  \.nav-toggle \{\n    display: none;/.exec(css)?.[1];
check(toggleHidden === cssWide, `the menu button hides at ${toggleHidden} px, the header bar starts at ${cssWide} px`);

if (failures.length) {
  console.log(`nav: ${failures.length} of ${checks} checks FAILED`);
  for (const f of failures) console.log(`  FAIL ${f}`);
  process.exit(1);
}
console.log(`nav: ${checks} checks passed (${pages.length} pages, ${FEATURES.length} sections in the "Features" menu)`);
