#!/usr/bin/env node
// A web export (format 2, like `/propwash webexport`) of one add-on namespace, read from the add-on's jar by the
// configurator's own jar reader (assets/js/configurator/addon-catalog.js, held against the game's export by
// tools/test-jar-loader.mjs). For an add-on whose release brings no format-2 export of Propwash: Mob Defense 1.0.0
// ships its own export (format 1, raw part files), so the release data of the site take its namespace from the jar.
//
//   node tools/build-addon-export.mjs --jar <add-on jar> --out <folder> [--propwash <version>]
//
// Writes <folder>/manifest.json (format 2, base false, the one namespace) and <folder>/<namespace>/ with manifest.json,
// parts.json, chemistries.json, mounts.json, presets.json, share_table.json, lang/ and assets/<namespace>/ (the jar's
// models, item definitions, textures, drone_layout.json and drone_paint.json). Pass the folder to
// tools/build-configurator-data.mjs and tools/build-configurator-models.mjs as one more --export after the exports of
// Propwash; the base/ of Propwash's export stays the base.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportFromJar } from './build-addons.mjs';
import { openJar } from '../assets/js/configurator/jar.js';
import { jarMeta } from '../assets/js/configurator/addon-catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = path.join(ROOT, 'assets/data/configurator/catalog.json');
const ASSET_PARTS = /^assets\/([a-z0-9_.-]+)\/(drone_layout\.json|drone_paint\.json|items\/.+|models\/.+|textures\/.+|lang\/(?:en_us|de_de)\.json)$/;

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

export async function addonExport(jarFile, outDir, { propwash = null } = {}) {
  const bytes = new Uint8Array(fs.readFileSync(jarFile));
  const base = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  const jar = openJar(bytes);
  const meta = jarMeta(bytes);
  const namespace = meta ? meta.id : null;
  if (!namespace) throw new Error(`${jarFile}: no mod id in the jar`);
  const { manifest, files } = exportFromJar(namespace, meta.version, bytes, path.basename(jarFile), base);
  fs.rmSync(outDir, { recursive: true, force: true });
  const nsDir = path.join(outDir, namespace);
  fs.mkdirSync(nsDir, { recursive: true });
  const write = (file, value) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === 'string' || value instanceof Uint8Array ? value : `${JSON.stringify(value, null, 2)}\n`);
  };
  for (const [name, value] of Object.entries(files)) write(path.join(nsDir, name), value);
  write(path.join(nsDir, 'presets.json'), []);
  let assets = 0;
  for (const name of jar.list()) {
    const m = ASSET_PARTS.exec(name);
    if (!m || m[1] !== namespace) continue;
    const data = jar.read(name);
    if (m[2].startsWith('lang/')) write(path.join(nsDir, m[2]), data);
    else {
      write(path.join(nsDir, name), data);
      assets++;
    }
  }
  const nsManifest = { ...manifest, files: [...manifest.files, 'presets.json'].sort() };
  delete nsManifest.listed_as;
  write(path.join(nsDir, 'manifest.json'), nsManifest);
  const requires = String((manifest.requires || {}).propwash || '').replace(/^>=/, '').replace(/-$/, '');
  write(path.join(outDir, 'manifest.json'), {
    format: 2,
    generated_at: new Date(fs.statSync(jarFile).mtimeMs).toISOString().replace(/\.\d+Z$/, 'Z'),
    generator: `${namespace} ${meta.version} (tools/build-addon-export.mjs, read from ${path.basename(jarFile)})`,
    propwash: propwash || requires || null,
    base: false,
    namespaces: [namespace],
    mods: { [namespace]: meta.version },
    counts: { namespaces: 1, parts: files['parts.json'].length, presets: 0, asset_files: assets },
  });
  return { namespace, version: meta.version, parts: files['parts.json'].length, assets };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const jarFile = arg('--jar');
  const out = arg('--out');
  if (!jarFile || !out) {
    console.error('usage: node tools/build-addon-export.mjs --jar <add-on jar> --out <folder> [--propwash <version>]');
    process.exit(2);
  }
  const r = await addonExport(path.resolve(jarFile), path.resolve(out), { propwash: arg('--propwash') });
  console.log(`build-addon-export: ${r.namespace} ${r.version}: ${r.parts} parts, ${r.assets} asset files → ${out}`);
}
