#!/usr/bin/env node
// Builds the lean configurator catalog from the "Propwash: Just More Parts" web export.
//
//   node tools/build-configurator-data.mjs [--export <web-export dir>]
//
// Default export location: the newest ../propwash-justmoreparts/release/<version>/web-export (sibling checkout),
// or the JMP_WEB_EXPORT environment variable.
//
// Writes:
//   assets/data/configurator/catalog.json   everything the configurator needs at runtime (incl. the FPV layout data
//                                           of every drone_layout.json for the camera rig of the analysis)
//   tools/fixtures/sharecode-vectors.json   the exported PW1 test vectors (used by tools/test-configurator.mjs)
//
// Only data from the web export is used. Model and texture files are referenced by their export paths
// (model.drone / model.variants / model.textures, relative to the export root); worn, damaged and broken
// variants are dropped because the configurator only shows new parts.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const RELEASES = path.resolve(ROOT, '../propwash-justmoreparts/release');

const versionParts = (v) => v.split('.').map((n) => Number.parseInt(n, 10) || 0);

function compareVersions(a, b) {
  const x = versionParts(a);
  const y = versionParts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
}

/** Newest release of the sibling checkout that carries a web export (release/<version>/web-export). */
export function newestExport() {
  let versions = [];
  try {
    versions = fs.readdirSync(RELEASES).filter((v) => /^\d+(\.\d+)*$/.test(v)
      && fs.existsSync(path.join(RELEASES, v, 'web-export', 'manifest.json')));
  } catch {
    versions = [];
  }
  versions.sort(compareVersions);
  return path.join(RELEASES, versions.length ? versions[versions.length - 1] : '1.0.4', 'web-export');
}

export function exportDir(argv = process.argv.slice(2)) {
  const i = argv.indexOf('--export');
  if (i >= 0 && argv[i + 1]) return path.resolve(argv[i + 1]);
  if (process.env.JMP_WEB_EXPORT) return path.resolve(process.env.JMP_WEB_EXPORT);
  return newestExport();
}

function read(dir, file) {
  return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
}

const DROP_VARIANT = /_(worn|damaged|broken)(_|\.json$|\.png$)/;

function compactHelp(help) {
  if (!help) return null;
  const out = {};
  for (const [lang, h] of Object.entries(help)) {
    if (!h) continue;
    const entry = {};
    if (h.summary) entry.summary = h.summary;
    if (h.what && h.what.length) entry.what = h.what;
    if (h.use && h.use.length) entry.use = h.use;
    if (Object.keys(entry).length) out[lang] = entry;
  }
  return Object.keys(out).length ? out : null;
}

// TuneGroup.of from the Propwash API: only these groups travel in a share code.
export function tuneGroup(key) {
  if (key.startsWith('rates.')) return 'rates';
  if (key.startsWith('filters.')) return 'filters';
  if (key.startsWith('hold.')) return 'hold';
  if (key.startsWith('camera.')) return 'camera';
  if (key.startsWith('led.')) return 'led';
  if (key.startsWith('vtx.')) return 'vtx';
  if (key.startsWith('pid.')) {
    if (key.endsWith('.ff')) return 'feedforward';
    if (key.startsWith('pid.tpa')) return 'tpa';
    if (key.startsWith('pid.throttle') || key === 'pid.motorIdlePercent' || key === 'pid.thrustLinearPercent'
      || key === 'pid.vbatSagCompensationPercent') return 'throttle';
    return 'pid';
  }
  return 'other';
}

function flightOnly(values, flight) {
  return Object.fromEntries(Object.entries(values).filter(([key]) => flight.includes(tuneGroup(key))));
}

function part(p) {
  const b = p.basics;
  const out = {
    id: p.id,
    category: p.category,
    builtin: p.builtin,
    name: p.name,
  };
  if (p.short_name) out.short_name = p.short_name;
  const help = compactHelp(p.help);
  if (help) out.help = help;
  out.basics = { mass_g: b.mass_g, sort: b.sort, creative: b.creative, durability: b.durability, accent: b.accent };
  if (b.render_model) out.basics.render_model = b.render_model;
  out.data = p.data;
  out.derived = p.derived;
  out.paint = p.paint;
  const m = p.model || {};
  out.model = {
    kind: m.kind,
    drone: m.drone || null,
    variants: (m.variants || []).filter((v) => !DROP_VARIANT.test(v)),
    textures: (m.textures || []).filter((t) => !DROP_VARIANT.test(t)),
  };
  return out;
}

// FpvLayoutData.parse of Propwash 0.4.1: motor seats and frame motor positions of assets/<namespace>/drone_layout.json,
// read as float like the mod (Gson getAsFloat) and with the same validity limits. Keys without a namespace belong to
// the file's namespace.
const f32 = Math.fround;
const MAX_ABS_MM = 2000;

function layoutId(key, namespace) {
  if (!key) return null;
  return key.includes(':') ? key : `${namespace}:${key}`;
}

function layoutVector(v) {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const out = [];
  for (const n of v) {
    if (typeof n !== 'number') return null;
    const x = f32(n);
    if (!Number.isFinite(x) || Math.abs(x) > MAX_ABS_MM) return null;
    out.push(x);
  }
  return out;
}

export function fpvLayout(json, namespace) {
  const seats = {};
  const frames = {};
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { seats, frames };
  if (json.motor_seat && typeof json.motor_seat === 'object' && !Array.isArray(json.motor_seat)) {
    for (const [key, value] of Object.entries(json.motor_seat)) {
      const id = layoutId(key, namespace);
      if (!id || typeof value !== 'number') continue;
      const seat = f32(value);
      if (Number.isFinite(seat) && seat > 0 && seat < 100) seats[id] = seat;
    }
  }
  if (json.frames && typeof json.frames === 'object' && !Array.isArray(json.frames)) {
    for (const [key, frame] of Object.entries(json.frames)) {
      const id = layoutId(key, namespace);
      if (!id || !frame || typeof frame !== 'object' || Array.isArray(frame)) continue;
      let motors = null;
      let valid = true;
      if (frame.motors !== undefined) {
        if (Array.isArray(frame.motors) && frame.motors.length === 4) {
          motors = frame.motors.map(layoutVector);
          valid = motors.every((m) => m !== null);
        } else {
          valid = false;
        }
      }
      let propHeight = null;
      if (typeof frame.prop_height === 'number') {
        const h = f32(frame.prop_height);
        if (Number.isFinite(h) && h >= 0 && h <= 200) propHeight = h;
      }
      frames[id] = { motors: valid ? motors : null, prop_height: propHeight, valid };
    }
  }
  return { seats, frames };
}

function fpvLayouts(dir) {
  const layouts = {};
  const assets = path.join(dir, 'assets');
  for (const namespace of fs.readdirSync(assets).sort()) {
    const file = path.join(assets, namespace, 'drone_layout.json');
    if (!fs.existsSync(file)) continue;
    let json = null;
    try {
      json = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      json = null;
    }
    layouts[namespace] = fpvLayout(json, namespace);
  }
  return layouts;
}

export function buildCatalog(dir) {
  const manifest = read(dir, 'manifest.json');
  if (manifest.format !== 1) throw new Error(`unsupported web-export format ${manifest.format}`);
  const parts = read(dir, 'parts.json');
  const chemistries = read(dir, 'chemistries.json');
  const mounts = read(dir, 'mounts.json');
  const rules = read(dir, 'rules.json');
  const paint = read(dir, 'paint.json');
  const tune = read(dir, 'tune.json');
  const presets = read(dir, 'presets.json');
  const spec = read(dir, 'sharecode/spec.json');

  const mountNames = {};
  for (const [kind, list] of Object.entries(mounts)) {
    mountNames[kind] = {};
    for (const m of list) mountNames[kind][m.id] = m.name;
  }

  return {
    format: 1,
    source: {
      web_export_format: manifest.format,
      generator: manifest.generator,
      generated_at: manifest.generated_at,
      minecraft: manifest.minecraft,
      mods: manifest.mods,
      propwash_api: manifest.propwash_api,
      sharecode: manifest.sharecode,
      fingerprint: manifest.fingerprint,
      counts: manifest.counts,
    },
    categories: ['frame', 'stack', 'motor', 'prop', 'video', 'battery', 'accessory'],
    parts: parts.map(part),
    chemistries: chemistries.map(({ used_by, ...c }) => c),
    mounts: mountNames,
    rules,
    paint,
    tune: {
      groups: tune.groups,
      group_names: tune.group_names,
      pw1_keys: tune.pw1_keys,
      defaults: Object.fromEntries(Object.entries(tune.defaults).map(([id, values]) => [id, flightOnly(values, tune.groups.flight)])),
    },
    fpv: { layouts: fpvLayouts(dir) },
    presets: presets.map((p) => ({
      id: p.id,
      name: p.name,
      creative: p.creative,
      build: p.build,
      paint: p.paint,
      tune: p.tune,
      sharecode: p.sharecode,
      check: p.check,
      analysis: p.analysis,
    })),
    sharecode: {
      format: spec.format,
      prefix: spec.prefix,
      revision: spec.revision,
      layers: spec.layers,
      statuses: spec.statuses,
      limits: spec.limits,
      aliases: spec.aliases,
    },
  };
}

function main() {
  const dir = exportDir();
  if (!fs.existsSync(path.join(dir, 'manifest.json'))) {
    console.error(`web export not found in ${path.relative(ROOT, dir) || dir} (use --export <dir> or JMP_WEB_EXPORT)`);
    process.exit(1);
  }
  const catalog = buildCatalog(dir);
  const outDir = path.join(ROOT, 'assets/data/configurator');
  fs.mkdirSync(outDir, { recursive: true });
  const text = JSON.stringify(catalog);
  fs.writeFileSync(path.join(outDir, 'catalog.json'), text + '\n');

  const fixtures = path.join(ROOT, 'tools/fixtures');
  fs.mkdirSync(fixtures, { recursive: true });
  const vectors = read(dir, 'sharecode/vectors.json');
  fs.writeFileSync(path.join(fixtures, 'sharecode-vectors.json'), JSON.stringify(vectors, null, 1) + '\n');

  console.log(`catalog.json: ${catalog.parts.length} parts, ${catalog.presets.length} presets, ${(text.length / 1024).toFixed(1)} KiB`);
  console.log(`sharecode-vectors.json: ${vectors.length} vectors`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
