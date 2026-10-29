// Catalog of all parts (Propwash + Just More Parts) for the configurator, built from the web export of Propwash
// (format 2) by tools/build-configurator-data.mjs. loadCatalog() fetches assets/data/configurator/catalog.json (same
// origin, no external requests); createCatalog() wraps already parsed JSON (used by the node tests). Share codes: the
// catalog reads PW1, PW2 and PW3 with the parts tables of its namespaces and the add-on directory of the export, writes
// PW3 like the game with these add-ons installed, and converts old codes with the frozen data like the mod.
// composeCatalog() and composeRender() put add-ons into the catalog (an add-on jar read in the browser,
// addon-catalog.js) or take them out (the switches of the add-on bar), like installing or removing the mod in the game.

import { check as checkBuild } from './rules.js?v=6634f777';
import { analyze as analyzeBuild, cameraView as cameraViewOf } from './analysis.js?v=373b0553';
import {
  encode as encodeCode, decode as decodeCode, convert as convertCode, hexColor, createShareTables, frozenTables, displayId,
} from './sharecode.js?v=024bd980';
import { sharedOnly } from './tune.js?v=f4084d0e';
import { defaultTune, effectiveTune, normalizeTune, applyTuneEdit } from './tuning.js?v=22940b30';
import { catalogOrder, CREATIVE_ONLY } from './catalog-build.js?v=6adaaa67';

export const CATALOG_URL = new URL('../../data/configurator/catalog.json', import.meta.url);
export const CATEGORIES = Object.freeze(['frame', 'stack', 'motor', 'prop', 'video', 'battery', 'accessory']);
export const BUILD_FIELDS = Object.freeze(['frame', 'stack', 'motor', 'prop', 'video', 'battery']);

/** 'de' / 'en' / 'de_de' / 'en_us' → key of the bilingual text objects in the catalog. */
export function langKey(lang) {
  return String(lang || 'en').toLowerCase().startsWith('de') ? 'de_de' : 'en_us';
}

/** Picks the language from a {de_de, en_us} text object (falls back to the other language). */
export function localText(text, lang) {
  if (text == null) return '';
  if (typeof text === 'string') return text;
  const key = langKey(lang);
  return text[key] ?? text.en_us ?? text.de_de ?? '';
}

let pending = null;

/** Fetches and wraps the catalog once. */
export function loadCatalog(url = CATALOG_URL) {
  if (!pending || url !== CATALOG_URL) {
    const request = fetch(url, { credentials: 'same-origin' })
      .then((res) => {
        if (!res.ok) throw new Error(`catalog: HTTP ${res.status}`);
        return res.json();
      })
      .then(createCatalog);
    if (url !== CATALOG_URL) return request;
    pending = request.catch((e) => {
      pending = null;
      throw e;
    });
  }
  return pending;
}

/**
 * Wraps the parsed catalog JSON with lookups and the core functions.
 * @param {object} json content of catalog.json
 */
export function createCatalog(json) {
  if (!json || json.format !== 2) throw new Error(`catalog: unsupported format ${json && json.format}`);
  const byId = new Map(json.parts.map((p) => [p.id, p]));
  const byCategory = new Map(CATEGORIES.map((c) => [c, []]));
  for (const p of json.parts) (byCategory.get(p.category) || byCategory.set(p.category, []).get(p.category)).push(p);
  const chemistries = new Map(json.chemistries.map((c) => [c.id, c]));
  const presets = new Map(json.presets.map((p) => [p.id, p]));
  const statuses = new Map(json.sharecode.statuses.map((s) => [s.key, s.text]));
  const rules = new Map(json.rules.rules.map((r) => [r.key, r]));
  const analysisWarnings = new Map(json.rules.analysis_warnings.map((w) => [w.key, w.text]));
  const paintSlots = new Map(json.paint.slots.map((s) => [s.key, s]));
  const results = new Map((json.sharecode.namespace_results || []).map((r) => [r.key, r.text]));
  const layerNames = new Map((json.sharecode.layers || []).map((l) => [l.key, l.name]));
  const namespaces = new Map((json.namespaces || []).map((n) => [n.namespace, n]));
  const versions = Object.fromEntries([...namespaces.values()].map((n) => [n.namespace, n.version]));
  // Add-ons read in the browser are not in the directory: their codes carry the mod's name and link, like the game's.
  const mods = Object.fromEntries([...namespaces.values()].filter((n) => n.source === 'local' && n.name)
    .map((n) => [n.namespace, { name: n.name, homepage: n.homepage || null }]));
  let shareTables = null;
  let frozen = null;
  // Parts of the game the web export leaves out (the creative flight controller): known to the share codes by their
  // kind in the Propwash table, so a code of a creative drone names them as what they are, not as unknown parts.
  const creativeOnly = new Map();
  for (const id of CREATIVE_ONLY) {
    const path = id.slice(id.indexOf(':') + 1);
    for (const [kind, list] of Object.entries(((json.sharecode.tables || {}).propwash || {}).parts || {})) {
      if (list.some((e) => e && e.id === path)) creativeOnly.set(id, kind);
    }
  }

  const catalog = {
    json,
    source: json.source,
    categories: CATEGORIES,
    parts: json.parts,
    presets: json.presets,
    rules: json.rules,
    paint: json.paint,
    tune: json.tune,
    mounts: json.mounts,
    sharecodeInfo: json.sharecode,
    fpv: json.fpv || { layouts: {} },

    /** Part object by id, or null. */
    part: (id) => byId.get(id) || null,
    /** Category of a part id, or null (lookup for the share code decoder). */
    category: (id) => (byId.get(id) || {}).category || null,
    /** True for a part of the game that only exists in creative mode and is not in this catalog (the creative flight controller). */
    creativeOnly: (id) => creativeOnly.has(id),
    /** All parts of a category in the mod's order. */
    partsIn: (category) => byCategory.get(category) || [],
    chemistry: (id) => chemistries.get(id) || null,
    preset: (id) => presets.get(id) || null,

    /** Localised part name; unknown ids are returned literally. */
    partName(id, lang) {
      const part = byId.get(id);
      return part ? localText(part.name, lang) : String(id);
    },
    /** Frame short name (or full name for other parts). */
    shortName(id, lang) {
      const part = byId.get(id);
      if (!part) return String(id);
      return localText(part.short_name || part.name, lang);
    },
    /** Help text of a part: { summary, what: [], use: [] } in the language, or null. */
    help(id, lang) {
      const part = byId.get(id);
      if (!part || !part.help) return null;
      const h = part.help[langKey(lang)] || part.help.en_us || part.help.de_de;
      return h ? { summary: h.summary || '', what: h.what || [], use: h.use || [] } : null;
    },
    mountName(kind, id, lang) {
      const names = json.mounts[kind] || {};
      return names[id] ? localText(names[id], lang) : String(id);
    },
    chemistryName(id, lang) {
      const c = chemistries.get(id);
      return c ? localText(c.name, lang) : String(id);
    },
    presetName(id, lang) {
      const p = presets.get(id);
      return p ? localText(p.name, lang) : String(id);
    },
    statusText: (status, lang) => localText(statuses.get(status), lang) || status,
    /** Text of a namespace result of a PW3 code (MATCH, MISMATCH, NEWER, MISSING, NO_TABLE). */
    resultText: (result, lang) => localText(results.get(result), lang) || result,
    /** Name of a share-code layer (parts, paint, tune, osd, name). */
    layerName: (key, lang) => localText(layerNames.get(key), lang) || key,
    /** The namespaces of the export: {namespace, name, version, short_id, table_crc, …}. */
    namespaces: [...namespaces.values()],
    /** Namespace of the export by id, or null. */
    namespace: (ns) => namespaces.get(ns) || null,
    /**
     * Name of an add-on for texts: the loaded export, else the add-on directory, else the code's own info; null when
     * nothing names it.
     */
    addonName(ns, lang, codeName = null) {
      if (namespaces.has(ns)) return namespaces.get(ns).name;
      const addon = ns && (json.sharecode.directory.addons || []).find((a) => a.namespace === ns);
      if (addon && addon.name) return localText(addon.name, lang);
      return codeName || null;
    },
    /** The directory entry of an add-on (namespace, short_id, name, modrinth, curseforge, version), or null. */
    directoryEntry: (ns) => (json.sharecode.directory.addons || []).find((a) => a.namespace === ns) || null,
    /** A part id as the page shows it: the part's name, or '?…' for a part a code could not resolve. */
    displayName(id, lang) {
      const part = byId.get(id);
      return part ? localText(part.name, lang) : displayId(id);
    },
    /** Text of a build problem/warning key (rules.json). */
    issueText: (key, lang) => (rules.has(key) ? localText(rules.get(key).text, lang) : key),
    /** 'problem' or 'warning'. */
    issueKind: (key) => (rules.has(key) ? rules.get(key).kind : 'warning'),
    /** Text of an analysis warning key (cannot_hover, …). */
    analysisWarningText: (key, lang) => localText(analysisWarnings.get(key), lang) || key,
    paintSlot: (key) => paintSlots.get(key) || null,
    paintSlotName: (key, lang) => (paintSlots.has(key) ? localText(paintSlots.get(key).name, lang) : key),
    tuneGroupName: (group, lang) => localText((json.tune.group_names || {})[group], lang) || group,

    /**
     * Original colours of a build per paint slot ('#rrggbb'), from paint.json#default_colors of the parts that
     * colour each slot. Slots without a known colour are missing.
     */
    defaultPaint(build) {
      const out = {};
      for (const slot of json.paint.slots) {
        for (const category of slot.categories) {
          const ids = category === 'accessory' ? Object.values(build.accessories || {}) : [build[category]];
          for (const id of ids) {
            const colors = json.paint.default_colors[id];
            if (colors && colors[slot.key] && !(slot.key in out)) out[slot.key] = colors[slot.key];
          }
        }
      }
      return out;
    },

    /** Stored tune defaults of a preset (flight keys only), or null. */
    presetTuneDefaults: (presetId) => (json.tune.defaults[presetId] ? { ...json.tune.defaults[presetId] } : null),

    /** Compatibility check (rules.js). */
    check: (build) => checkBuild(build, catalog),
    /** Flight analysis like the mod's workbench (analysis.js); null if a part is unknown. */
    analyze: (build) => analyzeBuild(build, catalog),
    /** FPV camera like the web export's camera_view, with the rig for the camera preview (fpv.js); null if unknown. */
    cameraView: (build) => cameraViewOf(build, catalog),
    /** Full default flight tune of a build (tuning.js); throws for unknown parts. */
    defaultTune: (build) => defaultTune(build, catalog),
    /** Every flight value the build flies with for a stored tune. */
    effectiveTune: (stored, build) => effectiveTune(stored, build, catalog),
    /** Stored form of a tune: only values that differ from the build's defaults. */
    normalizeTune: (tune, build) => normalizeTune(tune, build, catalog),
    /** Applies edited values like the mod's configurator and returns the new stored tune. */
    applyTuneEdit: (stored, edited, build) => applyTuneEdit(stored, edited, build, catalog),
    /** What the share codes of this catalog know: the parts tables, the directory, versions and the part lookup. */
    shareTables() {
      if (!shareTables) {
        shareTables = createShareTables({
          tables: Object.values(json.sharecode.tables || {}), directory: json.sharecode.directory, versions, mods,
          lookup: (id) => catalog.category(id) || creativeOnly.get(id) || null,
        });
      }
      return shareTables;
    },
    /** The frozen data of the conversion of old codes (the Propwash table and the tables of the directory). */
    frozenTables() {
      if (!frozen) frozen = frozenTables(json.sharecode.tables.propwash, json.sharecode.directory);
      return frozen;
    },
    /** PW3 share code of a content object (sharecode.js); options as for sharecode.js encode (format, carry). */
    encode: (content, options = {}) => encodeCode(content, { tables: catalog.shareTables(), ...options }),
    /** Tolerant share code decoding (PW1, PW2, PW3, PWD1) with this catalog's tables and part lookup. */
    decode: (code) => decodeCode(code, { tables: catalog.shareTables() }),
    /** An old code (PW1, PW2, PWD1) as PW3, byte for byte like the mod (ShareConvert); a PW3 code is only checked. */
    convert: (code) => convertCode(code, catalog.frozenTables()),

    /** Build of a preset as a fresh object. */
    presetBuild(presetId) {
      const p = presets.get(presetId);
      return p ? { ...p.build, accessories: { ...p.build.accessories } } : null;
    },
    /** Content of a preset (build, paint, tune) as the mod shares it. */
    presetContent(presetId) {
      const p = presets.get(presetId);
      if (!p) return null;
      return {
        build: catalog.presetBuild(presetId),
        paint: Object.keys(p.paint).length ? { ...p.paint } : null,
        tune: sharedOnly(p.tune),
        osd: null,
        name: null,
      };
    },
  };
  return catalog;
}

const namespaceOf = (id) => String(id).slice(0, Math.max(0, String(id).indexOf(':')));

/** The ids a preset's build uses. */
function presetIds(preset) {
  const b = preset.build || {};
  return [...BUILD_FIELDS.map((f) => b[f]), ...Object.values(b.accessories || {})].filter(Boolean);
}

/**
 * The catalog JSON with add-ons put in and taken out: `fragments` are pieces of catalogs (addon-catalog.js readAddon
 * → fragment; a fragment of a namespace the base already has replaces it), `off` the namespaces switched off. A
 * namespace that is off loses its parts, presets, chemistries, parts table and version, as if the mod were not
 * installed: codes with its parts then read as from a missing add-on. Propwash itself can not be switched off.
 */
export function composeCatalog(base, { fragments = [], off = [] } = {}) {
  const replaced = new Set(fragments.flatMap((f) => (f.namespaces || []).map((n) => n.namespace)));
  const gone = new Set([...off, ...replaced].filter((ns) => ns !== 'propwash'));
  const offSet = new Set(off.filter((ns) => ns !== 'propwash'));
  const keep = (id) => !gone.has(namespaceOf(id));
  const active = fragments.filter((f) => !(f.namespaces || []).some((n) => offSet.has(n.namespace)));
  const parts = [...base.parts.filter((p) => keep(p.id)), ...active.flatMap((f) => f.parts || [])].sort(catalogOrder);
  const ids = new Set(parts.map((p) => p.id));
  const chemistries = base.chemistries.filter((c) => keep(c.id));
  for (const f of active) for (const c of f.chemistries || []) if (!chemistries.some((x) => x.id === c.id)) chemistries.push(c);
  const mounts = {};
  for (const source of [base.mounts || {}, ...active.map((f) => f.mounts || {})]) {
    for (const [kind, names] of Object.entries(source)) {
      mounts[kind] = mounts[kind] || {};
      for (const [id, name] of Object.entries(names)) if (!(id in mounts[kind])) mounts[kind][id] = name;
    }
  }
  const presets = [...base.presets, ...active.flatMap((f) => f.presets || [])]
    .filter((p) => keep(p.id) && presetIds(p).every((id) => ids.has(id)));
  const defaultColors = Object.fromEntries(Object.entries(base.paint.default_colors || {}).filter(([id]) => keep(id)));
  for (const f of active) Object.assign(defaultColors, f.default_colors || {});
  const layouts = Object.fromEntries(Object.entries((base.fpv && base.fpv.layouts) || {}).filter(([ns]) => !gone.has(ns)));
  for (const f of active) Object.assign(layouts, (f.fpv) || {});
  const tables = Object.fromEntries(Object.entries(base.sharecode.tables || {}).filter(([ns]) => !gone.has(ns)));
  for (const f of active) Object.assign(tables, f.tables || {});
  return {
    ...base,
    namespaces: [...(base.namespaces || []).filter((n) => !gone.has(n.namespace)), ...active.flatMap((f) => f.namespaces || [])],
    parts,
    chemistries,
    mounts,
    presets,
    paint: { ...base.paint, default_colors: defaultColors },
    fpv: { ...(base.fpv || {}), layouts },
    sharecode: { ...base.sharecode, tables },
  };
}

/** render.json with the frame layouts, motor seats, paint channels and model list of the add-ons (as composeCatalog). */
export function composeRender(base, { renders = [], off = [], replaced = [] } = {}) {
  const gone = new Set([...off, ...replaced].filter((ns) => ns !== 'propwash'));
  const keep = (id) => !gone.has(namespaceOf(id));
  const layouts = Object.fromEntries(Object.entries(base.layouts || {}).filter(([id]) => keep(id)));
  const seats = Object.fromEntries(Object.entries(base.motor_seats || {}).filter(([id]) => keep(id)));
  const channels = { ...(base.channels || {}) };
  const models = (base.models || []).filter(keep);
  for (const r of renders) {
    Object.assign(layouts, r.layouts || {});
    Object.assign(seats, r.motor_seats || {});
    for (const [k, v] of Object.entries(r.channels || {})) if (!(k in channels)) channels[k] = v;
    for (const id of r.models || []) if (!models.includes(id)) models.push(id);
  }
  return { ...base, layouts, motor_seats: seats, channels, models };
}

export { hexColor };
