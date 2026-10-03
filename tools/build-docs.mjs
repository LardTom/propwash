#!/usr/bin/env node
// Builds the documentation under docs/ (propwashfpv.com/docs) from a Propwash checkout.
//
//   node tools/build-docs.mjs [--propwash <dir>] [--gamerules <file>] [--version <x.y.z>] [--images] [--render-only]
//
// 1. Extract (skipped with --render-only): reads the Propwash sources, resources and language files of <dir>
//    (default: PROPWASH_SRC, or the folder "propwash" next to this repository) and the world-rules export
//    (default: <dir>/build/web-export/gamerules.json, written by tools/export_rules.sh in the Propwash repository) and
//    writes tools/docs/data/*.json. --version overrides the mod version from gradle.properties (only for previews of a
//    release that has not been versioned yet).
// 2. Images (--images): converts the in-game screenshots the pages use from <dir>/docs/screenshots to WebP
//    (assets/img/docs/, 800 and 1600 px wide, needs cwebp).
// 3. Render: writes docs/**/index.html (and docs/gamerules/gamerules.json) from tools/docs/data and the texts in
//    tools/docs/pages/; the header navigation is the one of index.html (rebuild after changing it there). Rendering only needs the data files, so the pages can be rebuilt without a Propwash checkout.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extractAll } from './docs/extract.mjs';
import { page, PAGES, L } from './docs/html.mjs';
import indexPage from './docs/pages/index.mjs';
import guidePage from './docs/pages/guide.mjs';
import gamerulesPage from './docs/pages/gamerules.mjs';
import apiPage from './docs/pages/api.mjs';
import referencePage from './docs/pages/reference.mjs';
import partsFormatPage from './docs/pages/parts-format.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'tools/docs/data');
const DATA_FILES = ['meta', 'api', 'parts', 'controls', 'server', 'gamerules', 'images'];

export const IMAGES = {
  world_rules: { src: 'configurator_world_rules.png', name: 'world-rules-tab' },
  receiver_wizard: { src: 'receiver_wizard_check.png', name: 'receiver-wizard-check' },
};
const SIZES = [800, 1600];

const BUILDERS = {
  overview: indexPage,
  guide: guidePage,
  gamerules: gamerulesPage,
  api: apiPage,
  reference: referencePage,
  'parts-format': partsFormatPage,
};

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export function defaultPropwashDir() {
  if (process.env.PROPWASH_SRC) return path.resolve(process.env.PROPWASH_SRC);
  const candidates = [path.resolve(ROOT, '..', 'propwash')];
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: ROOT, encoding: 'utf8' }).trim();
    candidates.push(path.resolve(path.dirname(common), '..', 'propwash'));
  } catch (e) { /* not a git checkout */ }
  return candidates.find((c) => fs.existsSync(path.join(c, 'gradle.properties'))) || candidates[0];
}

export function loadData() {
  const data = {};
  for (const name of DATA_FILES) {
    const file = path.join(DATA_DIR, `${name}.json`);
    if (!fs.existsSync(file)) throw new Error(`${path.relative(ROOT, file)} fehlt – zuerst mit einem Propwash-Quellbaum extrahieren`);
    data[name] = JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return data;
}

function writeData(extracted, images) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const all = { ...extracted, images };
  for (const name of DATA_FILES) {
    if (all[name] === undefined) continue;
    fs.writeFileSync(path.join(DATA_DIR, `${name}.json`), JSON.stringify(all[name], null, 2) + '\n');
  }
}

function pngSize(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('ascii', 1, 4) !== 'PNG') throw new Error(`${file} ist kein PNG`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function buildImages(propwash) {
  const out = {};
  const dir = path.join(ROOT, 'assets/img/docs');
  fs.mkdirSync(dir, { recursive: true });
  for (const [key, img] of Object.entries(IMAGES)) {
    const src = path.join(propwash, 'docs/screenshots', img.src);
    if (!fs.existsSync(src)) throw new Error(`Bildschirmfoto fehlt: docs/screenshots/${img.src}`);
    const size = pngSize(src);
    for (const w of SIZES) {
      const target = path.join(dir, `${img.name}-${w}.webp`);
      const h = Math.round(w * size.height / size.width);
      execFileSync('cwebp', ['-quiet', '-q', '82', '-m', '6', '-metadata', 'none', '-resize', String(w), String(h), src, '-o', target]);
    }
    out[key] = { name: img.name, src: img.src, width: size.width, height: size.height, small: SIZES[0], large: SIZES[1] };
  }
  return out;
}

export function renderAll(data, nav = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')) {
  const files = {};
  const meta = `Propwash ${data.meta.propwash} · Minecraft ${data.meta.minecraft} · Fabric &amp; NeoForge · API ${data.meta.api} · ${L('protocol', 'Protokoll')} ${data.meta.protocol}`;
  for (const p of PAGES) {
    const depth = p.path.split('/').filter(Boolean).length;
    const prefix = '../'.repeat(depth);
    const built = BUILDERS[p.id]({ data, prefix, images: data.images });
    files[`${p.path}index.html`] = page({ ...built, id: p.id, prefix, meta, nav });
    for (const [name, content] of Object.entries(built.extraFiles || {})) files[`${p.path}${name}`] = content;
  }
  return files;
}

function main() {
  const renderOnly = process.argv.includes('--render-only');
  if (!renderOnly) {
    const propwash = path.resolve(arg('--propwash') || defaultPropwashDir());
    const gamerules = path.resolve(arg('--gamerules') || path.join(propwash, 'build/web-export/gamerules.json'));
    if (!fs.existsSync(gamerules)) {
      throw new Error(`Welt-Regeln-Export fehlt: ${gamerules}\n  im Propwash-Repository zuerst tools/export_rules.sh ausführen (oder --gamerules <datei>)`);
    }
    const extracted = extractAll(propwash, { gamerules, version: arg('--version') });
    let images;
    if (process.argv.includes('--images')) images = buildImages(propwash);
    else if (fs.existsSync(path.join(DATA_DIR, 'images.json'))) images = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'images.json'), 'utf8'));
    else images = buildImages(propwash);
    writeData(extracted, images);
    console.log(`Daten aus Propwash ${extracted.meta.propwash} (API ${extracted.meta.api}, Protokoll ${extracted.meta.protocol}, ${extracted.gamerules.rules.length} Welt-Regeln)`);
  }
  const files = renderAll(loadData());
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  console.log(`${Object.keys(files).length} Dateien unter docs/ geschrieben`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
