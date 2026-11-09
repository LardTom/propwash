// An add-on jar as a piece of the configurator's catalog, read only in this browser tab (website design 0.6.0,
// 3.5.4 and 3.5.5; share codes PW3, 3.16). From the jar come only data files: the mod's metadata (fabric.mod.json or
// META-INF/neoforge.mods.toml), its part and chemistry files (read by partjson.js like the mod reads them), its PW3
// parts table, its language files, and the models, render definitions and textures its parts use. Java code is never
// read or run; parts an add-on registers only in Java have no file and show up as unknown with the hint that the
// add-on needs a web export.
//
//   const addon = readAddon(bytes, { base: catalog.json, fileName });
//   addon.ok → addon.fragment: {namespaces, parts, chemistries, mounts, tables, presets: [], paint, fpv}
//              addon.models: Map id → model file, addon.render: {channels, layouts, motor_seats, models}
//   addon.problems: [{level: 'error' | 'warning' | 'info', code, args}]  (texts: i18n.js, group addons)
//
// Node tools pass a Map of files instead of bytes (readAddon(files, …)) and get the same result.

import { openJar, readText, readTexture, JarError } from './jar.js?v=8440b18b';
import { bundledParts, splitId, partPath, DEFAULT_NAMESPACE } from './partjson.js?v=1061e25f';
import {
  resources, exportParts, exportChemistries, exportMounts, catalogPart, catalogOrder, partModel, renderAdditions, tableCrc, tableEntries,
  LANGUAGES,
} from './catalog-build.js?v=cbc9c81b';
import { parseTable } from './sharecode3.js?v=024bd980';

const TABLE = (ns) => `data/${ns}/propwash_share/table.json`;
const TOML_VALUE = /^\s*(\w+)\s*=\s*"([^"]*)"/;

/** A source of files: a jar (lazy, with limits) or a Map path → bytes (tools, tests). */
function sourceOf(input) {
  if (input instanceof Map) {
    return {
      jar: null,
      bytes: [...input.values()].reduce((n, v) => n + (v ? v.length : 0), 0),
      list: () => [...input.keys()],
      has: (path) => input.has(path),
      text: (path) => {
        const v = input.get(path);
        return v == null ? null : typeof v === 'string' ? v : new TextDecoder('utf-8').decode(v);
      },
      read: (path) => {
        const v = input.get(path);
        return v == null ? null : typeof v === 'string' ? new TextEncoder().encode(v) : v;
      },
      problems: [],
    };
  }
  const jar = openJar(input);
  return {
    jar,
    bytes: jar.bytes,
    list: jar.list,
    has: jar.has,
    text: (path) => readText(jar, path),
    read: (path) => (path.endsWith('.png') ? readTexture(jar, path) : jar.read(path, { maxBytes: 2 * 1024 * 1024 })),
    problems: [...jar.problems],
  };
}

function tomlMods(toml) {
  const mods = [];
  const deps = [];
  let section = null;
  let current = null;
  for (const raw of `${toml}\n[end]`.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('[')) {
      section = line;
      current = {};
      if (line === '[[mods]]') mods.push(current);
      else if (line.startsWith('[[dependencies.')) deps.push(current);
      continue;
    }
    const m = TOML_VALUE.exec(line);
    if (m && current) current[m[1]] = m[2];
    else if (current && /^\s*(\w+)\s*=\s*'([^']*)'/.test(line)) {
      const s = /^\s*(\w+)\s*=\s*'([^']*)'/.exec(line);
      current[s[1]] = s[2];
    }
  }
  return { mods, deps, section };
}

function manifestValue(text, key) {
  if (!text) return null;
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0 && line.slice(0, i).trim() === key) return line.slice(i + 1).trim();
  }
  return null;
}

/** modMeta of a jar (bytes) or a Map path → bytes, without reading its parts. */
export function jarMeta(input) {
  return modMeta(sourceOf(input));
}

/** The mod's id, name, version, homepage and required Propwash range from its metadata, or null. */
export function modMeta(source) {
  const fabricText = source.has('fabric.mod.json') ? source.text('fabric.mod.json') : null;
  if (fabricText) {
    let json = null;
    try {
      json = JSON.parse(fabricText);
    } catch {
      json = null;
    }
    if (json && typeof json.id === 'string') {
      const dep = json.depends && json.depends[DEFAULT_NAMESPACE];
      const range = Array.isArray(dep) ? dep.map(String).join(' || ') : typeof dep === 'string' ? dep : null;
      const contact = json.contact && typeof json.contact === 'object' ? json.contact : {};
      return {
        loader: 'fabric', id: json.id, name: typeof json.name === 'string' ? json.name : json.id,
        version: typeof json.version === 'string' ? json.version : null,
        homepage: typeof contact.homepage === 'string' ? contact.homepage : typeof contact.sources === 'string' ? contact.sources : null,
        requires: range ? { propwash: range } : {},
      };
    }
  }
  const tomlText = source.has('META-INF/neoforge.mods.toml') ? source.text('META-INF/neoforge.mods.toml') : null;
  if (tomlText) {
    const { mods, deps } = tomlMods(tomlText);
    const mod = mods[0];
    if (mod && mod.modId) {
      let version = mod.version || null;
      if (version && version.includes('${')) {
        const manifest = source.has('META-INF/MANIFEST.MF') ? source.text('META-INF/MANIFEST.MF') : null;
        version = manifestValue(manifest, 'Implementation-Version');
      }
      const dep = deps.find((d) => d.modId === DEFAULT_NAMESPACE && d.versionRange);
      return {
        loader: 'neoforge', id: mod.modId, name: mod.displayName || mod.modId, version, homepage: mod.displayURL || null,
        requires: dep ? { propwash: dep.versionRange } : {},
      };
    }
  }
  return null;
}

const problem = (level, code, args = {}) => ({ level, code, args });
const fromJarError = (e, level = 'error') => problem(level, e.code, e.args);

/** Texts of the base catalog for an add-on jar alone: the names of Propwash's mounts and chemistries. */
function baseFallback(base) {
  if (!base) return null;
  const texts = new Map();
  for (const [kind, names] of Object.entries(base.mounts || {})) {
    for (const [id, name] of Object.entries(names)) {
      const [ns, path] = splitId(id);
      const key = ns === DEFAULT_NAMESPACE ? `propwash.content.mount.${kind}.${path}` : `${ns}.mount.${kind}.${path}`;
      texts.set(key, name);
    }
  }
  for (const c of base.chemistries || []) {
    const [ns, path] = splitId(c.id);
    const key = ns === DEFAULT_NAMESPACE ? `propwash.content.tooltip.chemistry.${path}` : `${ns}.chemistry.${path}`;
    if (c.name) texts.set(key, c.name);
  }
  return (language, key) => {
    const t = texts.get(key);
    return t ? (t[language] ?? null) : null;
  };
}

/** Chemistry records (partjson.js form) of the base catalog's chemistries.json entries. */
function baseChemistries(base) {
  return ((base && base.chemistries) || []).map((c) => ({
    id: c.id, fullCellVoltage: c.full_v, nominalCellVoltage: c.nominal_v, emptyCellVoltage: c.empty_v, cutoffCellVoltage: c.cutoff_v,
    storageCellVoltage: c.storage_v, densityGramsPerCm3: c.density_g_cm3, ocvShape: c.ocv_shape, usableFraction: c.usable_fraction,
  }));
}

/**
 * Reads an add-on (jar bytes or a Map of files). Options: base – the configurator's catalog JSON (for the names and
 * chemistries of Propwash), fileName, builtin – read Propwash's own jar as the game reads its built-in parts (tools),
 * extra – further Maps of files that are installed alongside (tools: Propwash with an add-on, like the game),
 * models – build the viewer's model files (default true).
 * Never throws: everything that goes wrong is a problem; ok is false when nothing could be read.
 */
export function readAddon(input, { base = null, fileName = null, builtin = false, extra = [], models: withModels = true } = {}) {
  const problems = [];
  let source;
  try {
    source = sourceOf(input);
  } catch (e) {
    if (e && e.jarError) return { ok: false, problems: [fromJarError(e)], fileName };
    return { ok: false, problems: [problem('error', 'jar.broken')], fileName };
  }
  problems.push(...source.problems);
  const meta = modMeta(source);
  if (!meta) return { ok: false, problems: [...problems, problem('error', 'addon.not_a_mod')], fileName };
  if (meta.id === DEFAULT_NAMESPACE && !builtin) {
    return { ok: false, problems: [...problems, problem('info', 'addon.is_propwash', { version: meta.version })], fileName, mod: meta };
  }
  if (base && (base.namespaces || []).some((n) => n.namespace === meta.id && n.source !== 'local') && !builtin) {
    problems.push(problem('info', 'addon.replaces', { name: meta.name, version: meta.version }));
  }

  const partFiles = new Map();
  for (const path of source.list()) {
    const p = partPath(path);
    if (p === null) continue;
    try {
      const text = source.text(path);
      if (text != null) partFiles.set(path, text);
    } catch (e) {
      if (e && e.jarError) return { ok: false, problems: [...problems, fromJarError(e)], fileName, mod: meta };
      throw e;
    }
  }
  if (!partFiles.size) {
    return { ok: false, problems: [...problems, problem('error', 'addon.no_parts', { name: meta.name })], fileName, mod: meta };
  }
  const bundled = bundledParts(partFiles, builtin ? DEFAULT_NAMESPACE : meta.id);
  if (bundled.errors.length) {
    return {
      ok: false, fileName, mod: meta,
      problems: [...problems, problem('error', 'addon.part_errors', { count: bundled.errors.length, first: bundled.errors[0], all: bundled.errors })],
    };
  }
  if (bundled.warnings.length) problems.push(problem('info', 'addon.part_warnings', { count: bundled.warnings.length, first: bundled.warnings[0] }));

  let tableJson = null;
  let table = null;
  if (source.has(TABLE(meta.id))) {
    try {
      tableJson = JSON.parse(source.text(TABLE(meta.id)));
      table = parseTable(tableJson, meta.id);
    } catch (e) {
      if (e && e.jarError) problems.push(fromJarError(e, 'warning'));
      tableJson = null;
    }
    if (!table) {
      problems.push(problem('warning', 'addon.table_invalid'));
      tableJson = null;
    }
  } else {
    problems.push(problem('info', 'addon.no_table', { name: meta.name }));
  }

  const files = extra.length ? mergedSource(source, extra) : source;
  const res = resources(files, { fallback: baseFallback(base) });
  const chemistries = [...bundled.chemistries];
  for (const c of extra.length ? extraChemistries(extra) : baseChemistries(base)) if (!chemistries.some((x) => x.id === c.id)) chemistries.push(c);
  const chemistry = (id) => chemistries.find((c) => c.id === id) || null;
  const definitions = bundled.parts;
  const exported = exportParts(definitions, res, {
    builtin: (id) => builtin && splitId(id)[0] === DEFAULT_NAMESPACE,
    chemistry,
  });
  const namespaces = [...new Set(definitions.map((d) => splitId(d.id)[0]))].sort();
  const exportByNamespace = {};
  for (const ns of namespaces) {
    const own = definitions.filter((d) => splitId(d.id)[0] === ns);
    exportByNamespace[ns] = {
      parts: exported.filter((p) => splitId(p.id)[0] === ns),
      chemistries: exportChemistries(ns, own, chemistries, res),
      mounts: exportMounts(own, res),
    };
  }

  const known = new Set(definitions.map((d) => d.id));
  if (table) {
    const javaOnly = [];
    for (const [kind, entries] of Object.entries(table.parts)) {
      for (const e of entries) {
        const id = `${meta.id}:${e.id}`;
        if (!known.has(id) && !e.deprecated) javaOnly.push({ id, kind });
      }
    }
    if (javaOnly.length) problems.push(problem('warning', 'addon.java_parts', { count: javaOnly.length, first: javaOnly[0].id, ids: javaOnly.map((j) => j.id) }));
  }

  const modelFiles = new Map();
  const failed = [];
  if (withModels) {
    for (const p of exported) {
      try {
        const model = partModel(p, res);
        if (model) modelFiles.set(p.id, model);
      } catch (e) {
        failed.push({ id: p.id, message: e && e.message ? e.message : String(e) });
      }
    }
  }
  const readFailures = res.problems.filter((x) => x.error && x.error.jarError);
  for (const code of [...new Set(readFailures.map((x) => x.error.code))]) {
    const first = readFailures.find((x) => x.error.code === code);
    problems.push(problem('warning', code, { ...first.error.args, count: readFailures.filter((x) => x.error.code === code).length }));
  }
  if (failed.length) problems.push(problem('warning', 'addon.models_failed', { count: failed.length, first: failed[0].id, all: failed }));

  const render = renderAdditions(res);
  const catalogParts = exported.map(catalogPart).sort(catalogOrder);
  const defaultColors = {};
  for (const p of exported) if (p.paint && Object.keys(p.paint.default_colors).length) defaultColors[p.id] = p.paint.default_colors;
  const mounts = {};
  for (const { mounts: m } of Object.values(exportByNamespace)) {
    for (const [kind, list] of Object.entries(m)) {
      mounts[kind] = mounts[kind] || {};
      for (const entry of list) if (!(entry.id in mounts[kind])) mounts[kind][entry.id] = entry.name;
    }
  }
  const ownChemistries = [];
  for (const { chemistries: list } of Object.values(exportByNamespace)) {
    for (const c of list) if (!ownChemistries.some((o) => o.id === c.id)) ownChemistries.push(c);
  }
  const info = {
    namespace: meta.id,
    name: meta.name,
    version: meta.version,
    short_id: table && table.shortId ? table.shortId : null,
    table_source: table ? 'mod' : null,
    table_entries: tableEntries(tableJson),
    table_crc: tableJson ? tableCrc(tableJson) : null,
    requires: meta.requires,
    homepage: meta.homepage,
    source: 'local',
  };
  return {
    ok: true,
    fileName,
    bytes: source.bytes,
    mod: meta,
    problems,
    export: exportByNamespace,
    table: tableJson,
    fragment: {
      namespaces: [info],
      parts: catalogParts,
      chemistries: ownChemistries.map(({ used_by, ...c }) => c),
      mounts,
      tables: tableJson ? { [meta.id]: tableJson } : {},
      default_colors: defaultColors,
      fpv: render.fpv,
      presets: [],
    },
    models: modelFiles,
    render: { channels: render.channels, layouts: render.layouts, motor_seats: render.motor_seats, models: [...modelFiles.keys()] },
    counts: Object.fromEntries(['frame', 'stack', 'motor', 'prop', 'video', 'battery', 'accessory'].map((k) => [k, catalogParts.filter((p) => p.category === k).length])),
    languages: LANGUAGES,
  };
}

/** Several sources as one (the add-on first, then what is installed alongside), like the game's resource set. */
function mergedSource(primary, extra) {
  const others = extra.map((m) => sourceOf(m));
  const all = [primary, ...others];
  return {
    list: () => [...new Set(all.flatMap((s) => s.list()))],
    read: (path) => {
      for (const s of all) if (s.has(path)) return s.read(path);
      return null;
    },
  };
}

function extraChemistries(extra) {
  const out = [];
  for (const files of extra) {
    const s = sourceOf(files);
    const chem = new Map();
    for (const path of s.list()) {
      const p = partPath(path);
      if (p && !p.error && p.category === 'chemistry') chem.set(path, s.text(path));
    }
    out.push(...bundledParts(chem, DEFAULT_NAMESPACE).chemistries);
  }
  return out;
}

export { JarError };
