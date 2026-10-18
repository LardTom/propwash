#!/usr/bin/env node
// Writes the download buttons, status lines and source-code icons of the hand-written pages from
// assets/data/platforms.json, so they are right without JavaScript and never drift apart. Downloads only on
// CurseForge and Modrinth; GitHub only as the small source-code icon.
//
//   node tools/build-platforms.mjs           # rewrites every marked region that is out of date
//   node tools/build-platforms.mjs --check   # lists out-of-date regions, writes nothing (exit 1 if any)
//
// A region is a pair of comment lines around generated markup, the content is replaced on every run:
//
//   <!-- platforms:<kind> <product> -->
//   …
//   <!-- /platforms -->
//
// Kinds: hero (the one download button of the hero: "Download on …" for the first live platform, otherwise
// "Download" to #download), buttons (one button per platform – live: "Download on …", review: with a dot
// "… · in review", pending: one line "Coming to …" – and the source-code icon; the first product of platforms.json
// is the mod and gets the primary button, add-ons only plain ones), status (the status line with the
// version), faq-download (the answer of the FAQ "Where can I download it?"), source (the source-code icon alone).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePlatforms, downloads, pendingText, statusText, waiting, source, joinNames } from '../assets/js/roadmap/platforms.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = 'assets/data/platforms.json';
export const KINDS = Object.freeze(['hero', 'buttons', 'status', 'faq-download', 'source']);
export const REGION_RE = /^([ \t]*)<!-- platforms:([a-z-]+)(?: ([a-z0-9]+))? -->\n([\s\S]*?)^[ \t]*<!-- \/platforms -->/gm;
const SKIP_DIRS = new Set(['node_modules', 'tools', 'assets', 'docs']);

export const GITHUB_ICON = '<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.7 1.7.3 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3"/></svg>';
const DOT = '<span class="soon-dot" aria-hidden="true"></span>';
const EXT = 'target="_blank" rel="noopener"';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const bi = (t) => `<span lang="en">${esc(t.en)}</span><span lang="de">${esc(t.de)}</span>`;

export function readPlatforms(root = ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, DATA), 'utf8'));
}

/** The first product of platforms.json is the mod itself; the others are add-ons. */
const isMain = (data, product) => Object.keys(data.products)[0] === product;

function sourceIcon(data, product) {
  const s = source(data, product);
  if (!s) return null;
  return `<a class="btn btn--ghost btn--icon" href="${esc(s.url)}" ${EXT} aria-label="${esc(s.label.en)}" data-de-aria-label="${esc(s.label.de)}" title="${esc(s.label.en)}" data-de-title="${esc(s.label.de)}">${GITHUB_ICON}</a>`;
}

function hero(data, product) {
  const live = downloads(data, product).find((d) => d.status === 'live');
  if (live) return [`<a class="btn btn--primary" href="${esc(live.url)}" ${EXT}>${bi(live.label)}</a>`];
  return [`<a class="btn btn--primary" href="#download">${bi({ en: 'Download', de: 'Download' })}</a>`];
}

function buttons(data, product) {
  const lines = [];
  const short = data.products[product].short;
  for (const d of downloads(data, product)) {
    if (d.status === 'pending') continue;
    const aria = isMain(data, product) ? '' : ` aria-label="${esc(`${short}: ${d.label.en}`)}" data-de-aria-label="${esc(`${short}: ${d.label.de}`)}"`;
    lines.push(`<a class="btn btn--${d.primary && isMain(data, product) ? 'primary' : 'ghost'}" href="${esc(d.url)}" ${EXT}${aria}>${d.status === 'review' ? DOT : ''}${bi(d.label)}</a>`);
  }
  const pending = pendingText(data, product);
  if (pending) lines.push(`<span class="btn btn--ghost">${DOT}${bi(pending)}</span>`);
  const icon = sourceIcon(data, product);
  if (icon) lines.push(icon);
  return lines;
}

function status(data, product) {
  const p = data.products[product];
  const label = isMain(data, product) ? 'VERSION' : p.short.toUpperCase();
  return [`<p class="status">${waiting(data, product) ? DOT : ''}<span class="mono">${esc(label)} ${esc(p.version)}</span> ${bi(statusText(data, product))}</p>`];
}

function faqDownload(data, product) {
  const p = data.products[product];
  const list = downloads(data, product);
  const shown = list.filter((d) => d.status !== 'pending');
  const links = joinNames(data, shown.map((d) => `<a href="${esc(d.url)}" ${EXT}>${esc(d.name)}</a>`));
  const pending = pendingText(data, product);
  const later = pending ? { en: ` ${esc(pending.en)} later.`, de: ` ${esc(pending.de)} später.` } : { en: '', de: '' };
  if (!shown.length) {
    return [
      `<p lang="en">${esc(pending.en)}, for Minecraft ${esc(p.minecraft)} with Fabric and NeoForge.</p>`,
      `<p lang="de">${esc(pending.de)}, für Minecraft ${esc(p.minecraft)} mit Fabric und NeoForge.</p>`
    ];
  }
  return [
    `<p lang="en">On ${links.en}, for Minecraft ${esc(p.minecraft)} with Fabric and NeoForge; the current version is ${esc(p.version)}.${later.en} Every new version goes through the platforms’ manual review first, which can take a while&nbsp;– if it is not listed there yet, it is still in review.</p>`,
    `<p lang="de">Auf ${links.de}, für Minecraft ${esc(p.minecraft)} mit Fabric und NeoForge; aktuell ist Version ${esc(p.version)}.${later.de} Jede neue Version geht dort zuerst durch eine manuelle Prüfung, die eine Weile dauern kann&nbsp;– steht sie noch nicht dort, wird sie noch geprüft.</p>`
  ];
}

const RENDER = { hero, buttons, status, 'faq-download': faqDownload, source: (data, product) => [sourceIcon(data, product)] };

/** The generated lines of one region. */
export function regionLines(data, kind, product) {
  if (!KINDS.includes(kind)) throw new Error(`unknown region kind "${kind}" (${KINDS.join(', ')})`);
  if (!product || !data.products[product]) throw new Error(`region ${kind}: unknown product "${product}"`);
  if (kind === 'source' && !source(data, product)) throw new Error(`region source: no source address for "${product}"`);
  return RENDER[kind](data, product);
}

/** Every region of a page: {kind, product, indent, start, end, content}. */
export function regions(html) {
  const out = [];
  for (const m of html.matchAll(REGION_RE)) {
    out.push({ indent: m[1], kind: m[2], product: m[3] || null, content: m[4], start: m.index, end: m.index + m[0].length });
  }
  const opened = (html.match(/<!-- platforms:/g) || []).length;
  const closed = (html.match(/<!-- \/platforms -->/g) || []).length;
  if (opened !== out.length || closed !== out.length) throw new Error(`unbalanced platform markers (${opened} opened, ${closed} closed, ${out.length} regions)`);
  return out;
}

/** A page with every region rewritten. */
export function render(html, data) {
  let out = '';
  let at = 0;
  for (const r of regions(html)) {
    const lines = regionLines(data, r.kind, r.product).map((l) => `${r.indent}${l}`);
    const head = `${r.indent}<!-- platforms:${r.kind}${r.product ? ` ${r.product}` : ''} -->`;
    out += html.slice(at, r.start) + [head, ...lines, `${r.indent}<!-- /platforms -->`].join('\n');
    at = r.end;
  }
  return out + html.slice(at);
}

/** The hand-written pages that carry platform regions. */
export function pagesWithRegions(root = ROOT, dir = '') {
  const found = [];
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || (dir === '' && SKIP_DIRS.has(entry.name))) continue;
      found.push(...pagesWithRegions(root, path.posix.join(dir, entry.name)));
    } else if (entry.name === 'index.html') {
      const rel = path.posix.join(dir, entry.name);
      if (fs.readFileSync(path.join(root, rel), 'utf8').includes('<!-- platforms:')) found.push(rel);
    }
  }
  return found.sort();
}

/** Pages whose regions differ from platforms.json: [{page, html, wanted}]. */
export function outOfDate(root = ROOT) {
  const data = readPlatforms(root);
  const problems = validatePlatforms(data);
  if (problems.length) throw new Error(`${DATA}:\n  ${problems.join('\n  ')}`);
  const stale = [];
  for (const page of pagesWithRegions(root)) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    const wanted = render(html, data);
    if (wanted !== html) stale.push({ page, html, wanted });
  }
  return stale;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const stale = outOfDate();
    if (process.argv.includes('--check')) {
      if (stale.length) {
        console.log(`platforms: out of date, run node tools/build-platforms.mjs: ${stale.map((s) => s.page).join(', ')}`);
        process.exit(1);
      }
      console.log(`platforms: every page is up to date (${pagesWithRegions().join(', ')})`);
    } else {
      for (const s of stale) fs.writeFileSync(path.join(ROOT, s.page), s.wanted);
      console.log(stale.length ? `platforms: written ${stale.map((s) => s.page).join(', ')}` : 'platforms: every page is up to date');
    }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

