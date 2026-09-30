// Catalog of all parts (Propwash + Just More Parts) for the configurator, built from the mod's web export by
// tools/build-configurator-data.mjs. loadCatalog() fetches assets/data/configurator/catalog.json (same origin, no
// external requests); createCatalog() wraps already parsed JSON (used by the node tests).

import { check as checkBuild } from './rules.js';
import { analyze as analyzeBuild } from './analysis.js';
import { encode as encodeCode, decode as decodeCode, hexColor } from './sharecode.js';
import { flightOnly } from './tune.js';
import { defaultTune, effectiveTune, normalizeTune, applyTuneEdit } from './tuning.js';

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
  if (!json || json.format !== 1) throw new Error(`catalog: unsupported format ${json && json.format}`);
  const byId = new Map(json.parts.map((p) => [p.id, p]));
  const byCategory = new Map(CATEGORIES.map((c) => [c, []]));
  for (const p of json.parts) (byCategory.get(p.category) || byCategory.set(p.category, []).get(p.category)).push(p);
  const chemistries = new Map(json.chemistries.map((c) => [c.id, c]));
  const presets = new Map(json.presets.map((p) => [p.id, p]));
  const statuses = new Map(json.sharecode.statuses.map((s) => [s.key, s.text]));
  const rules = new Map(json.rules.rules.map((r) => [r.key, r]));
  const analysisWarnings = new Map(json.rules.analysis_warnings.map((w) => [w.key, w.text]));
  const paintSlots = new Map(json.paint.slots.map((s) => [s.key, s]));
  const aliases = new Map((json.sharecode.aliases || []).map((a) => [a.from, a.to]));

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

    /** Part object by id, or null. */
    part: (id) => byId.get(id) || null,
    /** Category of a part id, or null (lookup for the share code decoder). */
    category: (id) => (byId.get(id) || {}).category || null,
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
    /** Full default flight tune of a build (tuning.js); throws for unknown parts. */
    defaultTune: (build) => defaultTune(build, catalog),
    /** Every flight value the build flies with for a stored tune. */
    effectiveTune: (stored, build) => effectiveTune(stored, build, catalog),
    /** Stored form of a tune: only values that differ from the build's defaults. */
    normalizeTune: (tune, build) => normalizeTune(tune, build, catalog),
    /** Applies edited values like the mod's configurator and returns the new stored tune. */
    applyTuneEdit: (stored, edited, build) => applyTuneEdit(stored, edited, build, catalog),
    /** Share code of a content object (sharecode.js). */
    encode: (content, options) => encodeCode(content, options),
    /** Tolerant share code decoding with this catalog's part lookup and alias table. */
    decode: (code) => decodeCode(code, { lookup: catalog.category, aliases }),

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
        tune: flightOnly(p.tune),
        osd: null,
        name: null,
      };
    },
  };
  return catalog;
}

export { hexColor };
