#!/usr/bin/env node
// The add-on directory (website design 0.6.0, 3.6; share codes PW3, 3.16): hosted web exports, directory.json and the
// generated parts of /addons/ and the pages of the add-ons.
//
//   node tools/build-addons.mjs --jar justmoreparts=<jar>   # the hosted web export of the registry's version from the
//                                                          # published jar, then directory.json and the pages
//   node tools/build-addons.mjs                             # directory.json and the pages from the hosted data
//   node tools/build-addons.mjs --check                     # what is out of date (exit 1), writes nothing
//
// The hosted export of a version (assets/data/addons/<namespace>/<version>/: manifest.json, parts.json,
// chemistries.json, mounts.json, share_table.json) is made from the jar by the code of the configurator's jar loader
// (assets/js/configurator/addon-catalog.js): no game start, and tools/test-jar-loader.mjs holds that code against the
// web export of the game. The manifest keeps the jar's file name, size and SHA-256. A jar of a pre-release (for
// example 1.2.0-dev.1) may fill the folder of the coming release; tools/test-addons.mjs --release refuses that.
//
// Regions of the pages, written like the platform regions of tools/build-platforms.mjs:
//   <!-- addons:cards official|community -->   the cards of the listed add-ons (with their platform buttons)
//   <!-- addons:short-ids -->                  the allocation list of the short ids
//   <!-- addons:facts <namespace> -->          version, Propwash version, Minecraft, loaders, parts, license, short id
//   <!-- addons:new <namespace> -->            parts that came with the listed version (parts table, "since")
//   <!-- addons:parts <namespace> -->          every part by category
//   <!-- /addons -->

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readAddon } from '../assets/js/configurator/addon-catalog.js';
import { validateRegistry, buildDirectory, listed, slugs } from '../assets/js/configurator/directory.js';
import { render as renderPlatforms } from './build-platforms.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REGISTRY = 'assets/data/addons/registry.json';
export const DIRECTORY = 'assets/data/addons/directory.json';
export const PLATFORMS = 'assets/data/platforms.json';
export const CATALOG = 'assets/data/configurator/catalog.json';
export const PAGES = ['addons/index.html'];
export const REGION_RE = /^([ \t]*)<!-- addons:([a-z-]+)(?: ([a-z0-9_.-]+))? -->\n([\s\S]*?)^[ \t]*<!-- \/addons -->/gm;
export const CATEGORIES = ['frame', 'stack', 'motor', 'prop', 'video', 'battery', 'accessory'];
const CATEGORY = {
  frame: { en: 'Frames', de: 'Rahmen' }, stack: { en: 'Stacks', de: 'Stacks' }, motor: { en: 'Motors', de: 'Motoren' },
  prop: { en: 'Props', de: 'Props' }, video: { en: 'Video', de: 'Video' }, battery: { en: 'Batteries', de: 'Akkus' },
  accessory: { en: 'Accessories', de: 'Zubehör' },
};
const COUNTED = {
  frame: { en: 'frames', de: 'Rahmen' }, stack: { en: 'stacks', de: 'Stacks' }, motor: { en: 'motors', de: 'Motoren' },
  prop: { en: 'props', de: 'Props' }, video: { en: 'video systems', de: 'Videosysteme' }, battery: { en: 'batteries', de: 'Akkus' },
  accessory: { en: 'accessories', de: 'Zubehörteile' },
};
const KIND = {
  parts: { en: 'Parts', de: 'Teile' }, modes: { en: 'Game modes', de: 'Spielmodi' }, accessories: { en: 'Accessories', de: 'Zubehör' },
  tools: { en: 'Tools', de: 'Werkzeuge' },
};
const LICENSES = { 'PolyForm-Shield-1.0.0': 'PolyForm Shield 1.0.0', MIT: 'MIT' };

const read = (rel, root = ROOT) => fs.readFileSync(path.join(root, rel), 'utf8');
const readJson = (rel, root = ROOT) => JSON.parse(read(rel, root));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const bi = (t) => (t.en === t.de ? esc(t.en) : `<span lang="en">${esc(t.en)}</span><span lang="de">${esc(t.de)}</span>`);
const nameOf = (n) => ({ en: n.en_us ?? n.de_de ?? '', de: n.de_de ?? n.en_us ?? '' });
const json = (v) => `${JSON.stringify(v)}\n`;

/** The folder of a hosted version. */
export const versionDir = (namespace, version) => `assets/data/addons/${namespace}/${version}/`;

/** Every hosted version: {namespace: {version: manifest}}. */
export function hostedManifests(registry, root = ROOT) {
  const out = {};
  for (const a of registry.addons) {
    for (const v of a.versions || []) {
      const file = path.join(root, versionDir(a.namespace, v), 'manifest.json');
      if (!fs.existsSync(file)) continue;
      (out[a.namespace] = out[a.namespace] || {})[v] = JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  }
  return out;
}

/** The parts of a hosted version (parts.json of the folder), or []. */
export function hostedParts(namespace, version, root = ROOT) {
  const file = path.join(root, versionDir(namespace, version), 'parts.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
}

/** The files of a hosted version from a jar: {manifest, files: {name: content}} (the jar loader's export of the namespace). */
export function exportFromJar(namespace, version, bytes, fileName, base) {
  const addon = readAddon(bytes, { base, fileName, models: false });
  if (!addon.ok) throw new Error(`${fileName}: ${addon.problems.map((p) => `${p.code} ${JSON.stringify(p.args)}`).join('; ')}`);
  if (addon.mod.id !== namespace) throw new Error(`${fileName}: the jar is ${addon.mod.id}, not ${namespace}`);
  const ns = addon.export[namespace];
  if (!ns) throw new Error(`${fileName}: no parts in the namespace ${namespace}`);
  const others = Object.keys(addon.export).filter((n) => n !== namespace);
  if (others.length) throw new Error(`${fileName}: parts in other namespaces (${others.join(', ')}) – the directory hosts one namespace per add-on`);
  const info = addon.fragment.namespaces[0];
  const counts = Object.fromEntries(CATEGORIES.map((k) => [k, ns.parts.filter((p) => p.category === k).length]));
  counts.chemistry = ns.chemistries.length;
  const files = { 'parts.json': ns.parts, 'chemistries.json': ns.chemistries, 'mounts.json': ns.mounts };
  if (addon.table) files['share_table.json'] = addon.table;
  const manifest = {
    format: 2,
    namespace,
    listed_as: version,
    mod: { id: addon.mod.id, name: addon.mod.name, version: addon.mod.version },
    short_id: info.short_id,
    table_source: info.table_source,
    table_entries: info.table_entries,
    table_crc: info.table_crc,
    requires: info.requires,
    languages: ['de_de', 'en_us'],
    counts,
    jar: { file: fileName, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), loader: addon.mod.loader },
    generator: 'tools/build-addons.mjs (web export format 2, read from the jar like the configurator)',
    files: [...Object.keys(files), 'manifest.json'].sort(),
  };
  return { manifest, files, problems: addon.problems };
}

// ---------------------------------------------------------------------------------------------------------------
// Page regions

export function regions(html) {
  const out = [];
  for (const m of html.matchAll(REGION_RE)) out.push({ indent: m[1], kind: m[2], arg: m[3] || null, start: m.index, end: m.index + m[0].length });
  const opened = (html.match(/<!-- addons:/g) || []).length;
  const closed = (html.match(/<!-- \/addons -->/g) || []).length;
  if (opened !== out.length || closed !== out.length) throw new Error(`unbalanced add-on markers (${opened} opened, ${closed} closed)`);
  return out;
}

const total = (counts) => CATEGORIES.reduce((n, k) => n + (counts[k] || 0), 0);

function facts(ctx, a, prefix) {
  const m = ctx.hosted[a.namespace] && ctx.hosted[a.namespace][a.web_export ? a.web_export.version : a.versions[a.versions.length - 1]];
  const product = ctx.platforms.products[a.platforms];
  const version = a.versions[a.versions.length - 1];
  const rows = [
    [{ en: 'Version', de: 'Version' }, `<span class="mono">${esc(version)}</span>`],
    [{ en: 'Needs', de: 'Braucht' }, bi({ en: `Propwash ${a.requires.propwash} or newer`, de: `Propwash ${a.requires.propwash} oder neuer` })],
  ];
  if (prefix !== null) {
    rows.push([{ en: 'Minecraft', de: 'Minecraft' }, `${esc(product.minecraft)} <span class="addon-facts__soft">· Fabric · NeoForge</span>`]);
  }
  if (m) {
    const counts = m.counts;
    const detail = CATEGORIES.filter((k) => counts[k]).map((k) => `${counts[k]}&nbsp;${bi(COUNTED[k])}`).join(' · ');
    rows.push([{ en: 'Parts', de: 'Teile' }, `<span class="mono" data-addon-parts-total>${total(counts)}</span>${prefix !== null ? ` <span class="addon-facts__soft">(${detail})</span>` : ''}`]);
  }
  rows.push([{ en: 'Short id', de: 'Kurzkennung' }, `<span class="mono">${a.short_id}</span>`]);
  if (prefix !== null) rows.push([{ en: 'License', de: 'Lizenz' }, esc(LICENSES[a.license] || a.license)]);
  return [
    '<dl class="addon-facts">',
    ...rows.map(([dt, dd]) => `  <div><dt>${bi(dt)}</dt><dd>${dd}</dd></div>`),
    '</dl>',
  ];
}

function card(ctx, a, prefix) {
  const kinds = a.kinds.join(' ');
  const pageHref = prefix === '../' && a.page.startsWith('addons/') ? a.page.slice('addons/'.length) : `${prefix}${a.page}`;
  const badges = [
    a.official ? `<span class="addons-badge addons-badge--official">${bi({ en: 'Official', de: 'Offiziell' })}</span>`
      : `<span class="addons-badge addons-badge--checked">${bi({ en: 'Checked', de: 'Geprüft' })}</span>`,
    ...a.kinds.map((k) => `<span class="addons-badge">${bi(KIND[k])}</span>`),
  ];
  const actions = [`<!-- platforms:buttons ${a.platforms} -->`, '<!-- /platforms -->'];
  if (a.web_export) actions.push(`<a class="btn btn--ghost" href="${prefix}configurator/?addon=${esc(a.namespace)}">${bi({ en: 'Show in the configurator', de: 'Im Konfigurator zeigen' })}</a>`);
  actions.push(`<a class="btn btn--ghost" href="${esc(pageHref)}">${bi({ en: 'About the add-on', de: 'Mehr zum Add-on' })}</a>`);
  const lines = [
    `<li class="addon-card" id="addon-${esc(a.namespace)}" data-addon="${esc(a.namespace)}" data-kinds="${esc(kinds)}">`,
    '  <div class="addon-card__head">',
    `    <h3 class="addon-card__name"><a href="${esc(pageHref)}">${esc(a.name)}</a></h3>`,
    `    <p class="addon-card__badges">${badges.join(' ')}</p>`,
    '  </div>',
    `  <p class="addon-card__text" lang="en">${esc(a.text.en)}</p>`,
    `  <p class="addon-card__text" lang="de">${esc(a.text.de)}</p>`,
    ...facts(ctx, a, null).map((l) => `  ${l}`),
    '  <div class="addons-actions">',
    ...actions.map((l) => `    ${l}`),
    '  </div>',
    '</li>',
  ];
  return renderPlatforms(lines.join('\n'), ctx.platforms).split('\n');
}

function cards(ctx, which, prefix) {
  const list = listed(ctx.registry).filter((a) => (which === 'official' ? a.official : !a.official));
  if (!list.length) {
    return which === 'official' ? ['<p class="addons-empty">' + bi({ en: 'No official add-on is listed yet.', de: 'Noch ist kein offizielles Add-on eingetragen.' }) + '</p>']
      : [`<p class="addons-empty">${bi({ en: 'No community add-on is listed yet. Yours could be the first – see below how to get it listed.', de: 'Noch ist kein Add-on der Community eingetragen. Deins könnte das erste sein – unten steht, wie du es eintragen lässt.' })}</p>`];
  }
  return ['<ul class="addons-cards" data-addons-cards>', ...list.flatMap((a) => card(ctx, a, prefix).map((l) => `  ${l}`)), '</ul>'];
}

function shortIds(ctx) {
  const rows = [
    [1, 'propwash', esc(ctx.registry.base.name), bi({ en: 'Propwash itself', de: 'Propwash selbst' })],
    ...ctx.registry.addons.map((a) => [a.short_id, a.namespace, esc(a.name), a.status === 'listed' ? bi({ en: 'listed', de: 'eingetragen' }) : bi({ en: 'withdrawn', de: 'zurückgezogen' })]),
  ];
  return [
    '<div class="addons-table-wrap">',
    '  <table class="addons-table">',
    `    <thead><tr><th scope="col">${bi({ en: 'Short id', de: 'Kurzkennung' })}</th><th scope="col">${bi({ en: 'Namespace', de: 'Namensraum' })}</th><th scope="col">${bi({ en: 'Add-on', de: 'Add-on' })}</th><th scope="col">${bi({ en: 'Status', de: 'Status' })}</th></tr></thead>`,
    '    <tbody>',
    ...rows.map(([id, ns, name, status]) => `      <tr><td class="mono">${id}</td><td class="mono">${esc(ns)}</td><td>${name}</td><td>${status}</td></tr>`),
    '    </tbody>',
    '  </table>',
    '</div>',
  ];
}

function addonOf(ctx, namespace) {
  const a = ctx.registry.addons.find((x) => x.namespace === namespace);
  if (!a) throw new Error(`no add-on ${namespace} in ${REGISTRY}`);
  return a;
}

function newParts(ctx, a) {
  const version = a.versions[a.versions.length - 1];
  const parts = ctx.parts(a.namespace, version);
  const table = ctx.table(a.namespace, version);
  const fresh = [];
  for (const [kind, entries] of Object.entries((table && table.parts) || {})) {
    for (const e of entries) {
      if (e.since !== version) continue;
      const p = parts.find((x) => x.id === `${a.namespace}:${e.id}`);
      if (p) fresh.push(p);
      else fresh.push({ id: `${a.namespace}:${e.id}`, category: kind, name: { en_us: e.id, de_de: e.id } });
    }
  }
  if (!fresh.length) return [];
  return [
    `<p class="addons-note">${bi({ en: `${fresh.length} new ${fresh.length === 1 ? 'part' : 'parts'} in ${version}:`, de: `${fresh.length} ${fresh.length === 1 ? 'neues Teil' : 'neue Teile'} in ${version}:` })}</p>`,
    '<ul class="addons-list addons-list--parts">',
    ...fresh.map((p) => `  <li data-part="${esc(p.id)}">${bi(nameOf(p.name))}</li>`),
    '</ul>',
  ];
}

function partList(ctx, a) {
  const version = a.versions[a.versions.length - 1];
  const parts = ctx.parts(a.namespace, version);
  const out = [];
  for (const k of CATEGORIES) {
    const list = parts.filter((p) => p.category === k);
    if (!list.length) continue;
    out.push(`<details class="addon-parts" data-category="${k}">`);
    out.push(`  <summary>${bi(CATEGORY[k])} <span class="addon-parts__count">${list.length}</span></summary>`);
    out.push('  <ul class="addon-parts__list">');
    for (const p of list) out.push(`    <li data-part="${esc(p.id)}">${bi(nameOf(p.name))}</li>`);
    out.push('  </ul>');
    out.push('</details>');
  }
  return out;
}

/** The generated lines of one region. */
export function regionLines(ctx, kind, arg, prefix) {
  switch (kind) {
    case 'cards': return cards(ctx, arg, prefix);
    case 'short-ids': return shortIds(ctx);
    case 'facts': return facts(ctx, addonOf(ctx, arg), prefix);
    case 'new': return newParts(ctx, addonOf(ctx, arg));
    case 'parts': return partList(ctx, addonOf(ctx, arg));
    default: throw new Error(`unknown add-on region "${kind}"`);
  }
}

/** A page with every add-on region rewritten (prefix: the page's way to the site root). */
export function renderPage(html, ctx, prefix) {
  let out = '';
  let at = 0;
  for (const r of regions(html)) {
    const lines = regionLines(ctx, r.kind, r.arg, prefix).map((l) => `${r.indent}${l}`);
    const head = `${r.indent}<!-- addons:${r.kind}${r.arg ? ` ${r.arg}` : ''} -->`;
    out += html.slice(at, r.start) + [head, ...lines, `${r.indent}<!-- /addons -->`].join('\n');
    at = r.end;
  }
  return renderPlatforms(out + html.slice(at), ctx.platforms);
}

/** Everything the regions and directory.json are made from. */
export function context(root = ROOT) {
  const registry = readJson(REGISTRY, root);
  const platforms = readJson(PLATFORMS, root);
  const problems = validateRegistry(registry, platforms);
  if (problems.length) throw new Error(`${REGISTRY}:\n  ${problems.join('\n  ')}`);
  const hosted = hostedManifests(registry, root);
  const tableFile = (ns, v) => path.join(root, versionDir(ns, v), 'share_table.json');
  return {
    root,
    registry,
    platforms,
    hosted,
    parts: (ns, v) => hostedParts(ns, v, root),
    table: (ns, v) => (fs.existsSync(tableFile(ns, v)) ? JSON.parse(fs.readFileSync(tableFile(ns, v), 'utf8')) : null),
  };
}

/** The pages with add-on regions: the directory and every listed add-on's page. */
export function pages(ctx) {
  return [...new Set([...PAGES, ...listed(ctx.registry).map((a) => `${a.page}index.html`)])].filter((p) => fs.existsSync(path.join(ctx.root, p)));
}

const prefixOf = (page) => '../'.repeat(page.split('/').length - 1);

/** directory.json as it should be. */
export function directoryJson(ctx) {
  const catalog = readJson(CATALOG, ctx.root);
  const propwash = (catalog.namespaces || []).find((n) => n.namespace === 'propwash') || {};
  return buildDirectory(ctx.registry, ctx.platforms, ctx.hosted, propwash);
}

/** Files that differ from what the data say: [{file, wanted}]. */
export function outOfDate(root = ROOT) {
  const ctx = context(root);
  const stale = [];
  const dir = json(directoryJson(ctx));
  if (!fs.existsSync(path.join(root, DIRECTORY)) || read(DIRECTORY, root) !== dir) stale.push({ file: DIRECTORY, wanted: dir });
  for (const page of pages(ctx)) {
    const html = read(page, root);
    const wanted = renderPage(html, ctx, prefixOf(page));
    if (wanted !== html) stale.push({ file: page, wanted });
  }
  return stale;
}

function main() {
  const argv = process.argv.slice(2);
  const check = argv.includes('--check');
  const jars = [];
  argv.forEach((a, i) => {
    if (a === '--jar' && argv[i + 1]) {
      const [ns, file] = argv[i + 1].split('=');
      jars.push({ ns, file: path.resolve(file) });
    }
  });
  if (jars.length && check) throw new Error('--jar and --check do not go together');
  if (jars.length) {
    const registry = readJson(REGISTRY);
    const base = readJson(CATALOG);
    for (const { ns, file } of jars) {
      const a = registry.addons.find((x) => x.namespace === ns);
      if (!a || !a.web_export) throw new Error(`${ns}: no add-on with a web_export in ${REGISTRY}`);
      const bytes = fs.readFileSync(file);
      const { manifest, files, problems } = exportFromJar(ns, a.web_export.version, bytes, path.basename(file), base);
      const out = path.join(ROOT, a.web_export.path);
      fs.rmSync(out, { recursive: true, force: true });
      fs.mkdirSync(out, { recursive: true });
      for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(out, name), json(content));
      fs.writeFileSync(path.join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
      console.log(`${a.web_export.path}: ${manifest.mod.name} ${manifest.mod.version} as ${manifest.listed_as}, ${total(manifest.counts)} parts, `
        + `table ${manifest.table_entries} entries (${manifest.table_crc}), jar ${manifest.jar.file} ${manifest.jar.sha256.slice(0, 12)}…`
        + `${problems.length ? `; notes: ${problems.map((p) => p.code).join(', ')}` : ''}`);
      if (manifest.mod.version !== manifest.listed_as) console.log(`  note: built from ${manifest.mod.version}, listed as ${manifest.listed_as} – rebuild from the release jar before publishing`);
    }
  }
  const stale = outOfDate();
  if (check) {
    if (stale.length) {
      console.log(`add-ons: out of date, run node tools/build-addons.mjs: ${stale.map((s) => s.file).join(', ')}`);
      process.exit(1);
    }
    console.log('add-ons: directory.json and every page are up to date');
    return;
  }
  for (const s of stale) fs.writeFileSync(path.join(ROOT, s.file), s.wanted);
  console.log(stale.length ? `add-ons: written ${stale.map((s) => s.file).join(', ')}` : 'add-ons: everything is up to date');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

export { slugs };
