#!/usr/bin/env node
// Builds the lean configurator catalog from the web export of Propwash (format 2, Propwash 0.6.0 and later), made
// with the add-ons installed (`/propwash webexport all`: Just More Parts, Camera Drones, Mob Defense).
//
//   node tools/build-configurator-data.mjs [--export <web-export dir> …] [--mods <jar or folder> …] [--goldens <dir>]
//                                         [--propwash-jar <jar>]
//
// Add-on sources: one export with every add-on (runWebExport of Propwash with the add-on jars in mods/), or several
// exports, e.g. one per add-on (`--export` repeated, or JMP_WEB_EXPORT with paths separated like PATH). The first
// export that has base/ gives rules, paint, tune, the share-code spec and the vectors; every namespace comes from the
// first export that has it (Propwash first, then the add-ons in the order of the exports). Default: the newest
// web-export of the sibling checkouts ../propwash-justmoreparts/release/<version>/, ../propwash-camera/release/<version>/
// and ../propwash-mobdefense/release/<version>/ that exist. --mods (or PROPWASH_WEB_EXPORT_MODS) names the add-on
// jars (or folders with them, the folder given to runWebExport): their metadata gives each namespace its homepage,
// the address a PW3 code names for an add-on that is not in the directory, like the game (ModMeta). --goldens (or
// PROPWASH_SHARECODE_GOLDENS) names the folder with the share-code golden files of Propwash
// (common/src/test/resources/sharecode/); they are copied unchanged, so the mod's JUnit tests and
// tools/test-configurator.mjs check the very same files. --propwash-jar (or PROPWASH_JAR) names the jar of the Propwash
// release of the export: the parts of the game that exist only in creative mode (the creative flight controller), which
// the web export leaves out, are read from it with the configurator's jar reader (addon-catalog.js readAddon, as
// tools/test-jar-loader.mjs holds it against the game) and go into the catalog marked creative_only: true.
//
// Writes:
//   assets/data/configurator/catalog.json      everything the configurator needs at runtime: the parts, presets,
//                                              chemistries and mounts of every namespace of the export(s), rules,
//                                              paint, tune, the FPV layout data of every drone_layout.json, and for
//                                              share codes the parts table of every namespace and the add-on directory
//   tools/fixtures/pw3-export-vectors.json     the PW3 vectors of the exports (base/sharecode/vectors.json of each, every
//                                              name once): a code per
//                                              preset (parts only, and with paint and tune), with check and analysis
//   tools/fixtures/sharecode/*.json            the golden files of Propwash (only with --goldens)
//
// Only data from the web export is used (and the metadata of the jars). Model and texture files are referenced by
// their export paths below the namespace folder (model.drone / model.variants / model.textures); worn, damaged and
// broken variants are dropped because the configurator only shows new parts.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jarMeta, readAddon } from '../assets/js/configurator/addon-catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const RELEASES = path.resolve(ROOT, '../propwash-justmoreparts/release');
const ADDON_RELEASES = ['../propwash-camera/release', '../propwash-mobdefense/release'].map((d) => path.resolve(ROOT, d));
const CATEGORIES = ['frame', 'stack', 'motor', 'prop', 'video', 'battery', 'accessory'];
export const GOLDEN_FILES = ['pw1-vectors.json', 'pw2-vectors.json', 'pw3-vectors.json', 'pw3-conversions.json', 'tablechecksum-vectors.json',
  'propwash-baseline.json', 'directory-baseline.json', 'pw3-creative-vectors.json'];

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

/** Newest release of a sibling checkout that carries a web export (<releases>/<version>/web-export), or null. */
function newestIn(releases) {
  let versions = [];
  try {
    versions = fs.readdirSync(releases).filter((v) => /^\d+(\.\d+)*$/.test(v)
      && fs.existsSync(path.join(releases, v, 'web-export', 'manifest.json')));
  } catch {
    versions = [];
  }
  versions.sort(compareVersions);
  return versions.length ? path.join(releases, versions[versions.length - 1], 'web-export') : null;
}

/** Newest release of the Just More Parts checkout that carries a web export (release/<version>/web-export). */
export function newestExport() {
  return newestIn(RELEASES) || path.join(RELEASES, '1.2.0', 'web-export');
}

function argValues(argv, name) {
  const out = [];
  argv.forEach((a, i) => {
    if (a === name && argv[i + 1]) out.push(path.resolve(argv[i + 1]));
  });
  return out;
}

/** The web exports to read, first the one with base/ (see the header). */
export function exportDirs(argv = process.argv.slice(2)) {
  const given = argValues(argv, '--export');
  if (given.length) return given;
  if (process.env.JMP_WEB_EXPORT) return process.env.JMP_WEB_EXPORT.split(path.delimiter).filter(Boolean).map((d) => path.resolve(d));
  return [newestExport(), ...ADDON_RELEASES.map(newestIn).filter(Boolean)];
}

/** The first web export (the one with base/ when the defaults are used). */
export function exportDir(argv = process.argv.slice(2)) {
  return exportDirs(argv)[0];
}

function argValue(argv, name, env) {
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1]) return path.resolve(argv[i + 1]);
  return env && process.env[env] ? path.resolve(process.env[env]) : null;
}

function read(dir, file) {
  return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
}

const propwashFirst = (list) => [...list].sort((a, b) => (a === 'propwash' ? -1 : b === 'propwash' ? 1 : 0));

/** Manifest of a format-2 export and its namespaces, Propwash first (the base), then the add-ons in export order. */
export function readExport(dir) {
  const manifest = read(dir, 'manifest.json');
  if (manifest.format !== 2) throw new Error(`web export format ${manifest.format}, expected 2 (Propwash 0.6.0 or later)`);
  return { manifest, namespaces: propwashFirst(manifest.namespaces) };
}

/**
 * Several exports read as one: manifest and base/ of the first export with base/ (needBase false: else of the first
 * export, for the model files, which need no base/), every namespace from the first export that has it ({manifest, base, namespaces, dirOf(ns), sources}); sources names each export by its generator,
 * time and namespaces (no local paths).
 */
export function readExports(dirs, { needBase = true } = {}) {
  const list = (Array.isArray(dirs) ? dirs : [dirs]).map((dir) => ({ dir, ...readExport(dir) }));
  if (!list.length) throw new Error('no web export given');
  const withBase = list.find((e) => e.manifest.base !== false && fs.existsSync(path.join(e.dir, 'base', 'rules.json'))) || (needBase ? null : list[0]);
  if (!withBase) throw new Error('no web export with base/ (export all or propwash)');
  const owner = new Map();
  for (const e of [withBase, ...list.filter((x) => x !== withBase)]) for (const ns of e.namespaces) if (!owner.has(ns)) owner.set(ns, e);
  const mods = {};
  for (const [ns, e] of owner) mods[ns] = (e.manifest.mods || {})[ns] ?? null;
  return {
    manifest: withBase.manifest,
    base: withBase.dir,
    namespaces: propwashFirst([...owner.keys()]),
    dirOf: (ns) => owner.get(ns).dir,
    mods: Object.fromEntries(Object.entries(mods).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
    sources: list.map((e) => ({
      generator: e.manifest.generator, generated_at: e.manifest.generated_at,
      namespaces: e.namespaces.filter((ns) => owner.get(ns) === e),
    })).filter((s) => s.namespaces.length),
  };
}

/** The jars named by --mods / PROPWASH_WEB_EXPORT_MODS (files or folders of jars), sorted by path. */
export function modJars(argv = process.argv.slice(2)) {
  const given = argValues(argv, '--mods');
  const from = given.length ? given
    : (process.env.PROPWASH_WEB_EXPORT_MODS || '').split(path.delimiter).filter(Boolean).map((d) => path.resolve(d));
  const out = [];
  for (const entry of from) {
    if (fs.statSync(entry).isDirectory()) {
      for (const f of fs.readdirSync(entry).sort()) if (f.endsWith('.jar')) out.push(path.join(entry, f));
    } else {
      out.push(entry);
    }
  }
  return out;
}

/** Metadata of the add-on jars by mod id ({id, name, version, homepage}), read like the game reads ModMeta. */
export function modMetas(jars) {
  const out = {};
  for (const file of jars) {
    const bytes = fs.readFileSync(file);
    const meta = jarMeta(new Uint8Array(bytes));
    if (meta && meta.id && !(meta.id in out)) {
      out[meta.id] = { id: meta.id, name: meta.name, version: meta.version, homepage: meta.homepage, file: path.basename(file),
        sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
    }
  }
  return out;
}

/** The jar of Propwash named by --propwash-jar / PROPWASH_JAR, or null. */
export function propwashJar(argv = process.argv.slice(2)) {
  return argValue(argv, '--propwash-jar', 'PROPWASH_JAR');
}

/**
 * The parts of the game that exist only in creative mode (CREATIVE_ONLY: the creative flight controller), read from
 * Propwash's jar like the configurator's jar reader reads it: {parts: catalog entries (creative_only: true), models: Map
 * id → model file (with models: true), defaultColors, jar: {mod, version, file, sha256}}.
 */
export function creativeParts(file, { models = false } = {}) {
  const bytes = new Uint8Array(fs.readFileSync(file));
  const r = readAddon(bytes, { builtin: true, fileName: path.basename(file), models });
  if (!r.ok) throw new Error(`${file}: ${r.problems.map((p) => p.code).join(', ')}`);
  if (r.mod.id !== 'propwash') throw new Error(`${file}: the jar is ${r.mod.id}, not Propwash`);
  const parts = r.fragment.parts.filter((p) => p.creative_only);
  const ids = new Set(parts.map((p) => p.id));
  return {
    parts,
    models: new Map([...(r.models || new Map())].filter(([id]) => ids.has(id))),
    defaultColors: Object.fromEntries(Object.entries(r.fragment.default_colors).filter(([id]) => ids.has(id))),
    jar: { mod: r.mod.id, version: r.mod.version, file: path.basename(file), sha256: crypto.createHash('sha256').update(bytes).digest('hex') },
  };
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
  return Object.fromEntries(Object.entries(values || {}).filter(([key]) => flight.includes(tuneGroup(key))));
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
  out.paint = p.paint ? { slots: p.paint.slots, paintable_model: p.paint.paintable_model } : { slots: [], paintable_model: false };
  const m = p.model || {};
  out.model = {
    kind: m.kind,
    drone: m.drone || null,
    variants: (m.variants || []).filter((v) => !DROP_VARIANT.test(v)),
    textures: (m.textures || []).filter((t) => !DROP_VARIANT.test(t)),
  };
  return out;
}

// FpvLayoutData.parse of Propwash 0.4.0: motor seats and frame motor positions of assets/<namespace>/drone_layout.json,
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

/** The drone_layout.json of every namespace folder (format 2: <ns>/assets/<ns>/drone_layout.json). */
export function layoutFiles(dir, namespaces) {
  const out = {};
  const dirOf = typeof dir === 'function' ? dir : () => dir;
  for (const ns of namespaces) {
    const assets = path.join(dirOf(ns), ns, 'assets');
    if (!fs.existsSync(assets)) continue;
    for (const owner of fs.readdirSync(assets).sort()) {
      const file = path.join(assets, owner, 'drone_layout.json');
      if (!fs.existsSync(file) || owner in out) continue;
      let json = null;
      try {
        json = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch {
        json = null;
      }
      out[owner] = json;
    }
  }
  return out;
}

/** Texts of the mod's language files (en_us, de_de) for a translation key, or null. */
function langText(lang, key) {
  const en = lang.en_us[key];
  const de = lang.de_de[key];
  if (en == null && de == null) return null;
  return { de_de: de ?? en, en_us: en ?? de };
}

const partOrder = (a, b) => (CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category))
  || (a.basics.sort - b.basics.sort) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The add-on directory of the export without the part names of its tables (the catalog names every loaded part). */
function compactDirectory(directory) {
  return {
    format: directory.format,
    source: directory.source,
    addons: (directory.addons || []).map((a) => {
      const out = { ...a };
      if (a.table) {
        out.table = { ...a.table, parts: Object.fromEntries(Object.entries(a.table.parts || {}).map(([kind, entries]) => [kind,
          entries.map(({ name, ...rest }) => rest)])) };
      }
      return out;
    }),
  };
}

/**
 * The catalog of one or several web exports (readExports); metas: the add-on jars' metadata by mod id (modMetas),
 * for the homepage of every namespace; creative: the creative-only parts of Propwash's jar (creativeParts), or null.
 */
export function buildCatalog(dirs, { metas = {}, creative = null } = {}) {
  const exp = readExports(dirs);
  const { manifest, namespaces, dirOf } = exp;
  const dir = exp.base;
  const rules = read(dir, 'base/rules.json');
  const paint = read(dir, 'base/paint.json');
  const tune = read(dir, 'base/tune.json');
  const spec = read(dir, 'base/sharecode/spec.json');
  const lang = { en_us: {}, de_de: {} };
  const parts = [];
  const presets = [];
  const chemistries = new Map();
  const mounts = {};
  const tables = {};
  const info = [];
  for (const ns of namespaces) {
    const at = dirOf(ns);
    const nsManifest = read(at, `${ns}/manifest.json`);
    for (const l of ['en_us', 'de_de']) {
      const file = path.join(at, ns, 'lang', `${l}.json`);
      if (fs.existsSync(file)) Object.assign(lang[l], JSON.parse(fs.readFileSync(file, 'utf8')));
    }
    parts.push(...read(at, `${ns}/parts.json`));
    presets.push(...read(at, `${ns}/presets.json`));
    for (const c of read(at, `${ns}/chemistries.json`)) if (!chemistries.has(c.id)) chemistries.set(c.id, c);
    for (const [kind, list] of Object.entries(read(at, `${ns}/mounts.json`))) {
      mounts[kind] = mounts[kind] || {};
      for (const m of list) if (!(m.id in mounts[kind])) mounts[kind][m.id] = m.name;
    }
    if (fs.existsSync(path.join(at, ns, 'share_table.json'))) tables[ns] = read(at, `${ns}/share_table.json`);
    const meta = metas[ns] && metas[ns].version === nsManifest.mod.version ? metas[ns] : null;
    info.push({
      namespace: ns,
      name: nsManifest.mod.name,
      version: nsManifest.mod.version,
      short_id: nsManifest.short_id ?? null,
      table_source: nsManifest.table_source ?? null,
      table_entries: nsManifest.table_entries ?? 0,
      table_crc: nsManifest.table_crc ?? null,
      requires: nsManifest.requires || {},
      homepage: meta ? meta.homepage ?? null : null,
    });
  }
  parts.sort(partOrder);

  const defaultColors = {};
  for (const p of parts) if (p.paint && p.paint.default_colors && Object.keys(p.paint.default_colors).length) defaultColors[p.id] = p.paint.default_colors;
  if (creative && creative.jar.version !== exp.mods.propwash) {
    throw new Error(`--propwash-jar is Propwash ${creative.jar.version}, the export has ${exp.mods.propwash}`);
  }
  const catalogParts = parts.map(part);
  for (const p of creative ? creative.parts : []) {
    if (catalogParts.some((x) => x.id === p.id)) throw new Error(`${p.id}: already in the export`);
    catalogParts.push(p);
    if (creative.defaultColors[p.id]) defaultColors[p.id] = creative.defaultColors[p.id];
  }
  catalogParts.sort(partOrder);

  const layouts = {};
  for (const [owner, json] of Object.entries(layoutFiles(dirOf, namespaces))) layouts[owner] = fpvLayout(json, owner);

  return {
    format: 2,
    source: {
      web_export_format: manifest.format,
      generator: manifest.generator,
      generated_at: manifest.generated_at,
      minecraft: manifest.minecraft,
      mods: exp.mods,
      propwash_api: manifest.propwash_api,
      sharecode: manifest.sharecode,
      fingerprint: manifest.fingerprint,
      counts: manifest.counts,
      sources: exp.sources,
      jars: Object.values(metas).filter((m) => exp.namespaces.includes(m.id)).sort((a, b) => (a.id < b.id ? -1 : 1))
        .map((m) => ({ mod: m.id, version: m.version, file: m.file, sha256: m.sha256, used: m.version === exp.mods[m.id] })),
      ...(creative ? { creative: { ...creative.jar, parts: creative.parts.map((p) => p.id) } } : {}),
    },
    namespaces: info,
    categories: CATEGORIES,
    parts: catalogParts,
    chemistries: [...chemistries.values()].map(({ used_by, ...c }) => c),
    mounts,
    rules,
    paint: { slots: paint.slots, default_colors: defaultColors },
    tune: {
      groups: tune.groups,
      group_names: tune.group_names,
      pw1_keys: tune.pw1_keys,
      defaults: Object.fromEntries(presets.map((p) => [p.id, flightOnly(p.default_tune, tune.groups.flight)])),
    },
    fpv: { layouts },
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
      format: spec.code_format,
      prefix: spec.prefix,
      revision: spec.revision,
      reads: manifest.sharecode && manifest.sharecode.reads,
      layers: spec.layers.map((l) => ({ bit: l.bit, key: l.key, default: l.default, name: langText(lang, l.translation_key) })),
      statuses: spec.statuses.map((s) => ({ key: s.key, text: langText(lang, s.translation_key) })),
      namespace_results: spec.namespace_results.map((key) => ({ key, text: langText(lang, `propwash.share.namespace.${key.toLowerCase()}`) })),
      limits: spec.limits,
      tables,
      directory: compactDirectory(spec.directory),
    },
  };
}

/** Copies the golden files of Propwash into tools/fixtures/sharecode/ (unchanged). */
export function copyGoldens(from) {
  const to = path.join(ROOT, 'tools/fixtures/sharecode');
  fs.mkdirSync(to, { recursive: true });
  for (const file of GOLDEN_FILES) fs.copyFileSync(path.join(from, file), path.join(to, file));
  return to;
}

function main() {
  const argv = process.argv.slice(2);
  const dirs = exportDirs(argv);
  const missing = dirs.filter((dir) => !fs.existsSync(path.join(dir, 'manifest.json')));
  if (missing.length) {
    console.error(`web export not found in ${missing.map((d) => path.relative(ROOT, d) || d).join(', ')} (use --export <dir> or JMP_WEB_EXPORT)`);
    process.exit(1);
  }
  const metas = modMetas(modJars(argv));
  const jar = propwashJar(argv);
  const creative = jar ? creativeParts(jar) : null;
  const catalog = buildCatalog(dirs, { metas, creative });
  for (const n of catalog.namespaces) {
    const meta = metas[n.namespace];
    if (meta && meta.version !== n.version) console.warn(`warning: ${meta.file} is ${n.namespace} ${meta.version}, the export has ${n.version} – its homepage is not used`);
  }
  const outDir = path.join(ROOT, 'assets/data/configurator');
  fs.mkdirSync(outDir, { recursive: true });
  const text = JSON.stringify(catalog);
  fs.writeFileSync(path.join(outDir, 'catalog.json'), text + '\n');

  const fixtures = path.join(ROOT, 'tools/fixtures');
  fs.mkdirSync(fixtures, { recursive: true });
  // The vectors of every export with base/ (the game writes them with that export's add-ons installed), each once;
  // a vector of the same name must be the same in every export.
  const vectors = [];
  const byName = new Map();
  for (const dir of dirs) {
    if (!fs.existsSync(path.join(dir, 'base', 'sharecode', 'vectors.json'))) continue;
    for (const v of read(dir, 'base/sharecode/vectors.json')) {
      const seen = byName.get(v.name);
      if (seen) {
        if (seen.code !== v.code) throw new Error(`vector ${v.name}: ${seen.code} in one export, ${v.code} in ${dir}`);
        continue;
      }
      byName.set(v.name, v);
      vectors.push(v);
    }
  }
  fs.writeFileSync(path.join(fixtures, 'pw3-export-vectors.json'), JSON.stringify(vectors, null, 1) + '\n');

  console.log(`catalog.json: ${catalog.parts.length} parts, ${catalog.presets.length} presets, namespaces ${catalog.namespaces.map((n) => `${n.namespace} ${n.version}${n.homepage ? ` (${n.homepage})` : ''}`).join(', ')}, ${(text.length / 1024).toFixed(1)} KiB`);
  if (creative) console.log(`creative only, from ${creative.jar.file} (Propwash ${creative.jar.version}): ${creative.parts.map((p) => p.id).join(', ')}`);
  else console.warn('warning: no --propwash-jar – the catalog has no creative-only parts (creative flight controller)');
  console.log(`sources: ${catalog.source.sources.map((x) => `${x.generator} ${x.generated_at} [${x.namespaces.join(', ')}]`).join('; ')}`);
  console.log(`pw3-export-vectors.json: ${vectors.length} vectors`);
  const goldens = argValue(argv, '--goldens', 'PROPWASH_SHARECODE_GOLDENS');
  if (goldens) console.log(`golden files copied to ${path.relative(ROOT, copyGoldens(goldens))}: ${GOLDEN_FILES.join(', ')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
