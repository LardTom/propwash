// Roadmap data (assets/data/roadmap.json): loading, status counts and the validation used by the page and by
// tools/test-roadmap.mjs. The page renders whatever the file holds, so a release only edits the JSON.

export const ROADMAP_URL = new URL('../../data/roadmap.json', import.meta.url);
export const LANGS = Object.freeze(['en', 'de']);
export const STATUSES = Object.freeze(['done', 'progress', 'planned', 'idea']);
export const HORIZONS = Object.freeze(['released', 'now', 'next', 'later', 'ideas']);

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/;
const TITLE_MAX = 48;
const TEXT_MAX = 130;
// No dates on the roadmap: years (also inside full dates), quarters and month names are rejected ("May" is left out,
// it is also a word).
const DATE_RES = [
  /\b20\d\d\b/,
  /\bQ[1-4]\b/,
  /\b(?:January|February|March|April|June|July|August|September|October|November|December)\b/,
  /\b(?:Januar|Februar|März|Mai|Juni|Juli|Oktober|Dezember)\b/
];

/** Fetches the roadmap JSON (same origin). */
export function loadRoadmap(url = ROADMAP_URL) {
  return fetch(url, { credentials: 'same-origin' }).then((res) => {
    if (!res.ok) throw new Error(`roadmap: HTTP ${res.status}`);
    return res.json();
  });
}

/** Counts the items of a group (or any item list) per status. */
export function tally(items) {
  const count = { total: 0, done: 0, progress: 0, planned: 0, idea: 0 };
  for (const item of items || []) {
    count.total++;
    if (Object.prototype.hasOwnProperty.call(count, item.status) && item.status !== 'total') count[item.status]++;
  }
  return count;
}

/** All items of the roadmap in page order. */
export function allItems(roadmap) {
  const out = [];
  for (const horizon of roadmap?.horizons || []) {
    for (const group of horizon.groups || []) out.push(...(group.items || []));
  }
  return out;
}

/** The release that is being built: the first versioned group of the "now" horizon, or null. */
export function currentRelease(roadmap) {
  const now = (roadmap?.horizons || []).find((h) => h.id === 'now');
  return now?.groups?.find((g) => g.version && g.items?.length) || null;
}

function compareVersions(a, b) {
  const pa = VERSION_RE.exec(a).slice(1).map(Number);
  const pb = VERSION_RE.exec(b).slice(1).map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

/**
 * Checks the roadmap and returns a list of problems (empty when valid).
 * `icons`: optional set of icon names the page's sprite provides.
 */
export function validateRoadmap(data, { icons = null } = {}) {
  const errors = [];
  const err = (where, msg) => errors.push(`${where}: ${msg}`);

  function text(value, where, { required = true, max = 0 } = {}) {
    if (value === undefined && !required) return;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      err(where, 'needs an object with "en" and "de" texts');
      return;
    }
    for (const key of Object.keys(value)) if (!LANGS.includes(key)) err(where, `unknown language "${key}"`);
    for (const lang of LANGS) {
      const s = value[lang];
      const at = `${where}.${lang}`;
      if (typeof s !== 'string' || !s.trim()) { err(at, 'missing text'); continue; }
      if (s !== s.trim() || /\s{2,}/.test(s)) err(at, 'stray whitespace');
      if (/[<>]/.test(s)) err(at, 'no HTML in texts');
      if (max && s.length > max) err(at, `too long (${s.length} > ${max} characters)`);
      for (const re of DATE_RES) if (re.test(s)) err(at, `looks like a date (${re.exec(s)[0]}) – the roadmap has no dates`);
    }
  }

  function link(value, where) {
    if (value === undefined) return;
    if (!value || typeof value !== 'object') { err(where, 'needs href and label'); return; }
    const href = value.href;
    if (typeof href !== 'string' || !(/^https:\/\/[^\s"'<>]+$/.test(href) || /^(?:\.\.?\/|\/)[^\s"'<>:]*$/.test(href))) {
      err(`${where}.href`, 'must be an https:// address or a relative path');
    }
    text(value.label, `${where}.label`, { max: 40 });
  }

  if (!data || typeof data !== 'object') return ['roadmap: not an object'];
  if (data.schema !== 1) err('schema', 'must be 1');
  if (!Array.isArray(data.horizons) || !data.horizons.length) {
    err('horizons', 'needs at least one horizon');
    return errors;
  }

  const ids = new Set();
  const versions = new Set();
  let lastHorizon = -1;
  data.horizons.forEach((horizon, h) => {
    const hw = `horizons[${h}]${horizon?.id ? ` (${horizon.id})` : ''}`;
    const order = HORIZONS.indexOf(horizon?.id);
    if (order < 0) err(hw, `id must be one of ${HORIZONS.join(', ')}`);
    else if (order <= lastHorizon) err(hw, `horizons must be unique and in the order ${HORIZONS.join(', ')}`);
    else lastHorizon = order;
    if (icons && !icons.has(horizon?.icon)) err(`${hw}.icon`, `unknown icon "${horizon?.icon}"`);
    text(horizon?.label, `${hw}.label`, { max: 24 });
    text(horizon?.title, `${hw}.title`, { max: 40 });
    text(horizon?.intro, `${hw}.intro`, { required: false, max: 160 });
    link(horizon?.link, `${hw}.link`);
    if (!Array.isArray(horizon?.groups)) { err(`${hw}.groups`, 'must be a list'); return; }

    let lastVersion = null;
    horizon.groups.forEach((group, g) => {
      const gw = `${hw}.groups[${g}]${group?.version ? ` (${group.version})` : ''}`;
      if (group?.version !== undefined) {
        if (typeof group.version !== 'string' || !VERSION_RE.test(group.version)) err(`${gw}.version`, 'must look like 1.2.3');
        else if (versions.has(group.version)) err(`${gw}.version`, 'appears twice');
        else {
          versions.add(group.version);
          if (horizon.id === 'released' && lastVersion && compareVersions(group.version, lastVersion) >= 0) {
            err(`${gw}.version`, 'released versions go newest first');
          }
          lastVersion = group.version;
        }
      } else if (horizon.id === 'released') {
        err(gw, 'released groups need a version');
      }
      text(group?.title, `${gw}.title`, { required: false, max: 40 });
      link(group?.link, `${gw}.link`);
      if (!Array.isArray(group?.items) || !group.items.length) { err(`${gw}.items`, 'needs at least one item'); return; }

      group.items.forEach((item, i) => {
        const iw = `${gw}.items[${i}]${item?.id ? ` (${item.id})` : ''}`;
        if (typeof item?.id !== 'string' || !ID_RE.test(item.id)) err(`${iw}.id`, 'must be lower-case words joined by "-"');
        else if (ids.has(item.id)) err(`${iw}.id`, 'appears twice');
        else ids.add(item.id);
        if (!STATUSES.includes(item?.status)) err(`${iw}.status`, `must be one of ${STATUSES.join(', ')}`);
        else if (horizon.id === 'released' && item.status !== 'done') err(`${iw}.status`, 'released items are done');
        else if (horizon.id === 'ideas' && item.status !== 'idea') err(`${iw}.status`, 'items under ideas have the status idea');
        else if (horizon.id !== 'ideas' && item.status === 'idea') err(`${iw}.status`, 'ideas belong under the ideas horizon');
        if (typeof item?.icon !== 'string' || (icons && !icons.has(item.icon))) err(`${iw}.icon`, `unknown icon "${item?.icon}"`);
        text(item?.title, `${iw}.title`, { max: TITLE_MAX });
        text(item?.text, `${iw}.text`, { max: TEXT_MAX });
        link(item?.link, `${iw}.link`);
        for (const key of Object.keys(item || {})) {
          if (!['id', 'icon', 'status', 'title', 'text', 'link'].includes(key)) err(iw, `unknown field "${key}"`);
        }
      });
    });
  });
  return errors;
}
