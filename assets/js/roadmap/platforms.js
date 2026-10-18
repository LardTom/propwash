// Download platforms (assets/data/platforms.json): the only place for download targets and their review status.
// Downloads exist only on CurseForge and Modrinth; GitHub appears only as the small source-code icon. Shared by
// tools/build-platforms.mjs (buttons and status lines written into the landing page), the roadmap page (download
// buttons drawn at runtime) and tools/test-platforms.mjs.

export const PLATFORMS_URL = new URL('../../data/platforms.json', import.meta.url);
export const PLATFORMS = Object.freeze(['curseforge', 'modrinth']);
export const PLATFORM_NAMES = Object.freeze({ curseforge: 'CurseForge', modrinth: 'Modrinth' });
export const PLATFORM_PAGES = Object.freeze({
  curseforge: 'https://www.curseforge.com/minecraft/mc-mods/',
  modrinth: 'https://modrinth.com/mod/'
});
export const SOURCE_PREFIX = 'https://github.com/LardTom/';
export const STATUSES = Object.freeze(['live', 'review', 'pending']);
export const LANGS = Object.freeze(['en', 'de']);

const KEY_RE = /^[a-z0-9]+$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION_RE = /^\d+\.\d+\.\d+$/;
const PRODUCT_FIELDS = ['name', 'short', 'version', 'minecraft', ...PLATFORMS];
const LABELS = { live: ['platform'], review: ['platform'], pending: ['platforms'], and: ['a', 'b'], source: ['name'] };

/** Fetches platforms.json (same origin). */
export function loadPlatforms(url = PLATFORMS_URL) {
  return fetch(url, { credentials: 'same-origin' }).then((res) => {
    if (!res.ok) throw new Error(`platforms: HTTP ${res.status}`);
    return res.json();
  });
}

/** Replaces {name} placeholders. */
export function fillIn(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (m, key) => (Object.prototype.hasOwnProperty.call(values || {}, key) ? String(values[key]) : m));
}

/** Checks platforms.json and returns a list of problems (empty when valid). */
export function validatePlatforms(data) {
  const errors = [];
  const err = (where, msg) => errors.push(`${where}: ${msg}`);
  const pair = (value, where, placeholders = []) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) { err(where, 'needs an object with "en" and "de" texts'); return; }
    for (const key of Object.keys(value)) if (!LANGS.includes(key)) err(where, `unknown language "${key}"`);
    for (const lang of LANGS) {
      const s = value[lang];
      if (typeof s !== 'string' || !s.trim()) { err(`${where}.${lang}`, 'missing text'); continue; }
      if (/[<>]/.test(s)) err(`${where}.${lang}`, 'no HTML in texts');
      for (const p of placeholders) if (!s.includes(`{${p}}`)) err(`${where}.${lang}`, `needs the placeholder {${p}}`);
      if (/github/i.test(s)) err(`${where}.${lang}`, 'GitHub is no download platform');
    }
  };

  if (!data || typeof data !== 'object') return ['platforms: not an object'];
  if (data.schema !== 1) err('schema', 'must be 1');
  for (const key of Object.keys(data)) if (!['schema', 'products', 'source', 'labels'].includes(key)) err(key, 'unknown field');
  const products = data.products && typeof data.products === 'object' ? Object.entries(data.products) : [];
  if (!products.length) err('products', 'needs at least one product');
  for (const [key, product] of products) {
    const pw = `products.${key}`;
    if (!KEY_RE.test(key)) err(pw, 'key must be lower-case letters and digits');
    if (!product || typeof product !== 'object') { err(pw, 'must be an object'); continue; }
    for (const field of Object.keys(product)) {
      if (!PRODUCT_FIELDS.includes(field)) err(`${pw}.${field}`, `unknown field – downloads are only on ${PLATFORMS.map((p) => PLATFORM_NAMES[p]).join(' and ')}`);
    }
    for (const field of ['name', 'short']) if (typeof product[field] !== 'string' || !product[field].trim()) err(`${pw}.${field}`, 'missing');
    if (typeof product.version !== 'string' || !VERSION_RE.test(product.version)) err(`${pw}.version`, 'must look like 1.2.3');
    if (typeof product.minecraft !== 'string' || !/^\d+(?:\.\d+)+$/.test(product.minecraft)) err(`${pw}.minecraft`, 'must look like 26.3');
    for (const platform of PLATFORMS) {
      const entry = product[platform];
      const at = `${pw}.${platform}`;
      if (!entry || typeof entry !== 'object') { err(at, 'missing'); continue; }
      for (const field of Object.keys(entry)) if (!['url', 'status'].includes(field)) err(`${at}.${field}`, 'unknown field');
      const url = entry.url;
      if (typeof url !== 'string' || !url.startsWith(PLATFORM_PAGES[platform]) || !SLUG_RE.test(url.slice(PLATFORM_PAGES[platform].length))) {
        err(`${at}.url`, `must be ${PLATFORM_PAGES[platform]}<project>`);
      }
      if (!STATUSES.includes(entry.status)) err(`${at}.status`, `must be one of ${STATUSES.join(', ')}`);
    }
  }
  const productKeys = new Set(products.map(([key]) => key));
  if (!data.source || typeof data.source !== 'object') err('source', 'missing');
  else {
    for (const [key, url] of Object.entries(data.source)) {
      if (!productKeys.has(key)) err(`source.${key}`, 'no such product');
      if (typeof url !== 'string' || !url.startsWith(SOURCE_PREFIX) || !SLUG_RE.test(url.slice(SOURCE_PREFIX.length))) {
        err(`source.${key}`, `must be the repository address ${SOURCE_PREFIX}<repository> (no releases, no files)`);
      }
    }
  }
  const labels = data.labels;
  if (!labels || typeof labels !== 'object') err('labels', 'missing');
  else {
    for (const [key, placeholders] of Object.entries(LABELS)) pair(labels[key], `labels.${key}`, placeholders);
    if (!labels.status || typeof labels.status !== 'object') err('labels.status', 'missing');
    else for (const status of STATUSES) pair(labels.status[status], `labels.status.${status}`);
  }
  return errors;
}

/** "A", "A and B" or "A, B and C" in both languages. */
export function joinNames(data, names) {
  const out = {};
  for (const lang of LANGS) {
    if (names.length <= 1) out[lang] = names.join('');
    else out[lang] = fillIn(data.labels.and[lang], { a: names.slice(0, -1).join(', '), b: names[names.length - 1] });
  }
  return out;
}

/**
 * The download targets of a product in platform order: {platform, name, url, status, primary, label}. Pending
 * platforms have no url and no label of their own. The first live platform is the primary one; while none is live,
 * no button is primary (a version in review is no call to action).
 */
export function downloads(data, productKey) {
  const product = data.products[productKey];
  const list = PLATFORMS.map((platform) => {
    const entry = product[platform];
    const name = PLATFORM_NAMES[platform];
    const label = entry.status === 'pending' ? null : {
      en: fillIn(data.labels[entry.status].en, { platform: name }),
      de: fillIn(data.labels[entry.status].de, { platform: name })
    };
    return { platform, name, url: entry.status === 'pending' ? null : entry.url, status: entry.status, primary: false, label };
  });
  const primary = list.find((d) => d.status === 'live');
  if (primary) primary.primary = true;
  return list;
}

/** The text for the pending platforms of a product ({en, de}), or null if none is pending. */
export function pendingText(data, productKey) {
  const names = downloads(data, productKey).filter((d) => d.status === 'pending').map((d) => d.name);
  if (!names.length) return null;
  const joined = joinNames(data, names);
  return { en: fillIn(data.labels.pending.en, { platforms: joined.en }), de: fillIn(data.labels.pending.de, { platforms: joined.de }) };
}

/** The status line of a product: platforms grouped by status, e.g. "CurseForge and Modrinth: in review". */
export function statusText(data, productKey) {
  const list = downloads(data, productKey);
  const out = { en: [], de: [] };
  for (const status of STATUSES) {
    const names = list.filter((d) => d.status === status).map((d) => d.name);
    if (!names.length) continue;
    const joined = joinNames(data, names);
    for (const lang of LANGS) out[lang].push(`${joined[lang]}: ${data.labels.status[status][lang]}`);
  }
  return { en: out.en.join(' · '), de: out.de.join(' · ') };
}

/** True if any platform of the product is not live yet. */
export function waiting(data, productKey) {
  return downloads(data, productKey).some((d) => d.status !== 'live');
}

/** The address and label of a product's source code, or null. */
export function source(data, productKey) {
  const url = data.source?.[productKey];
  if (!url) return null;
  const name = data.products[productKey].name;
  return { url, label: { en: fillIn(data.labels.source.en, { name }), de: fillIn(data.labels.source.de, { name }) } };
}
