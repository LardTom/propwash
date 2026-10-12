// Changelog data (assets/data/changelog.json, written by tools/build-changelog.mjs): loading, the inline Markdown of
// the entries and the validation used by the page and by tools/test-changelog.mjs. The page renders whatever the file
// holds, so a release only regenerates the JSON.

export const CHANGELOG_URL = new URL('../../data/changelog.json', import.meta.url);
export const LANGS = Object.freeze(['en', 'de']);
// Order on the page; the generator maps the "###" headings of CHANGELOG.md onto these.
export const KINDS = Object.freeze(['highlights', 'new', 'improved', 'fixed', 'compatibility', 'known-issues']);

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/;
const LINK_RE = /^\[([^\]\n]+)\]\(([^)\s]+)\)/;
const CODE_RE = /^`([^`\n]+)`/;

/** Fetches the changelog JSON (same origin). */
export function loadChangelog(url = CHANGELOG_URL) {
  return fetch(url, { credentials: 'same-origin' }).then((res) => {
    if (!res.ok) throw new Error(`changelog: HTTP ${res.status}`);
    return res.json();
  });
}

export function compareVersions(a, b) {
  const pa = VERSION_RE.exec(a).slice(1).map(Number);
  const pb = VERSION_RE.exec(b).slice(1).map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

export function isVersion(value) {
  return typeof value === 'string' && VERSION_RE.test(value);
}

/** Anchor of a release, e.g. propwash-0.5.0 – stable, so roadmap cards and posts can link to it. */
export function releaseId(productId, version) {
  return `${productId}-${version}`;
}

/** Links the entries may use: https:// addresses and paths relative to the site. */
export function isSafeHref(href) {
  return typeof href === 'string' && (/^https:\/\/[^\s"'<>]+$/.test(href) || /^(?:\.\.?\/|\/|#)[^\s"'<>:]*$/.test(href));
}

/**
 * Parses the inline Markdown of one entry: **strong**, *emphasis*, `code`, [text](link) and \-escapes.
 * Returns { nodes, errors }; nodes are { t: 'text'|'code', v } or { t: 'strong'|'em'|'link', c: nodes, href? }.
 */
export function parseInline(src) {
  const errors = [];
  let i = 0;

  function run(stop) {
    const out = [];
    let buf = '';
    const flush = () => {
      if (buf) out.push({ t: 'text', v: buf });
      buf = '';
    };
    while (i < src.length) {
      const ch = src[i];
      if (stop === '**' && src.startsWith('**', i)) { i += 2; flush(); return { out, closed: true }; }
      if (stop === '*' && ch === '*' && !src.startsWith('**', i)) { i += 1; flush(); return { out, closed: true }; }
      if (ch === '\\' && i + 1 < src.length && /[\\`*_[\]()#+\-.!]/.test(src[i + 1])) {
        buf += src[i + 1];
        i += 2;
        continue;
      }
      if (ch === '`') {
        const m = CODE_RE.exec(src.slice(i));
        if (!m) { errors.push(`unclosed \` at ${i + 1}`); buf += ch; i++; continue; }
        flush();
        out.push({ t: 'code', v: m[1] });
        i += m[0].length;
        continue;
      }
      if (ch === '[') {
        const m = LINK_RE.exec(src.slice(i));
        if (m) {
          flush();
          const inner = parseInline(m[1]);
          errors.push(...inner.errors);
          if (!isSafeHref(m[2])) errors.push(`link "${m[2]}" must be an https:// address or a relative path`);
          out.push({ t: 'link', href: m[2], c: inner.nodes });
          i += m[0].length;
          continue;
        }
      }
      if (src.startsWith('**', i)) {
        flush();
        i += 2;
        const inner = run('**');
        if (!inner.closed) errors.push('unclosed **');
        out.push({ t: 'strong', c: inner.out });
        continue;
      }
      if (ch === '*') {
        flush();
        i += 1;
        const inner = run('*');
        if (!inner.closed) errors.push('unclosed *');
        out.push({ t: 'em', c: inner.out });
        continue;
      }
      buf += ch;
      i++;
    }
    flush();
    return { out, closed: false };
  }

  const nodes = run(null).out;
  return { nodes, errors };
}

/** Plain text of parsed inline nodes (for counting, search and tests). */
export function plainText(nodes) {
  return nodes.map((n) => (n.c ? plainText(n.c) : n.v)).join('');
}

/** The text outside `code` spans; placeholders such as `pw_owner_<name>` may show angle brackets as code. */
export function proseText(nodes) {
  return nodes.map((n) => (n.c ? proseText(n.c) : n.t === 'code' ? '' : n.v)).join('');
}

/** Counts the entries per section kind (highlights excluded from the total, they repeat what the sections say). */
export function tally(releases) {
  const count = { releases: 0, entries: 0 };
  for (const kind of KINDS) count[kind] = 0;
  for (const release of releases || []) {
    count.releases++;
    for (const section of release.sections || []) {
      const n = (section.items || []).length;
      if (Object.prototype.hasOwnProperty.call(count, section.kind)) count[section.kind] += n;
      if (section.kind !== 'highlights') count.entries += n;
    }
  }
  return count;
}

/** Checks the changelog and returns a list of problems (empty when valid). */
export function validateChangelog(data) {
  const errors = [];
  const err = (where, msg) => errors.push(`${where}: ${msg}`);

  function text(value, where, { markdown = true } = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      err(where, 'needs an object with "en" and "de" texts');
      return;
    }
    for (const key of Object.keys(value)) if (!LANGS.includes(key)) err(where, `unknown language "${key}"`);
    for (const lang of LANGS) {
      const s = value[lang];
      const at = `${where}.${lang}`;
      if (typeof s !== 'string' || !s.trim()) {
        err(at, lang === 'de' ? 'missing German text (tools/changelog/de.json)' : 'missing text');
        continue;
      }
      if (s !== s.trim() || /\s{2,}/.test(s)) err(at, 'stray whitespace');
      if (markdown) {
        const parsed = parseInline(s);
        if (/[<>]/.test(proseText(parsed.nodes))) err(at, 'no HTML in texts');
        for (const e of parsed.errors) err(at, e);
        if (!plainText(parsed.nodes).trim()) err(at, 'empty text');
      } else if (/[<>]/.test(s)) {
        err(at, 'no HTML in texts');
      } else if (/[*`[\]]/.test(s)) {
        err(at, 'no Markdown in titles');
      }
    }
  }

  if (!data || typeof data !== 'object') return ['changelog: not an object'];
  if (data.schema !== 1) err('schema', 'must be 1');
  if (!Array.isArray(data.products) || !data.products.length) {
    err('products', 'needs at least one product');
    return errors;
  }

  const productIds = new Set();
  const anchors = new Set();
  data.products.forEach((product, p) => {
    const pw = `products[${p}]${product?.id ? ` (${product.id})` : ''}`;
    if (typeof product?.id !== 'string' || !ID_RE.test(product.id)) err(`${pw}.id`, 'must be lower-case words joined by "-"');
    else if (productIds.has(product.id)) err(`${pw}.id`, 'appears twice');
    else productIds.add(product.id);
    if (typeof product?.name !== 'string' || !product.name.trim()) err(`${pw}.name`, 'missing name');
    if (typeof product?.short !== 'string' || !product.short.trim()) err(`${pw}.short`, 'missing short name');
    text(product?.tagline, `${pw}.tagline`, { markdown: false });
    if (typeof product?.source?.ref !== 'string' || !product.source.ref) err(`${pw}.source.ref`, 'missing source ref');
    for (const key of Object.keys(product || {})) {
      if (!['id', 'name', 'short', 'tagline', 'source', 'releases'].includes(key)) err(pw, `unknown field "${key}"`);
    }
    if (!Array.isArray(product?.releases) || !product.releases.length) { err(`${pw}.releases`, 'needs at least one release'); return; }

    let last = null;
    product.releases.forEach((release, r) => {
      const rw = `${pw}.releases[${r}]${release?.version ? ` (${release.version})` : ''}`;
      if (!isVersion(release?.version)) err(`${rw}.version`, 'must look like 1.2.3');
      else {
        if (last && compareVersions(release.version, last) >= 0) err(`${rw}.version`, 'releases go newest first, each version once');
        last = release.version;
        if (release.id !== releaseId(product.id, release.version)) err(`${rw}.id`, `must be "${releaseId(product.id, release.version)}"`);
      }
      if (typeof release?.id === 'string') {
        if (anchors.has(release.id)) err(`${rw}.id`, 'appears twice');
        anchors.add(release.id);
      }
      text(release?.title, `${rw}.title`, { markdown: false });
      for (const key of Object.keys(release || {})) {
        if (!['version', 'id', 'title', 'sections'].includes(key)) err(rw, `unknown field "${key}"`);
      }
      if (!Array.isArray(release?.sections) || !release.sections.length) { err(`${rw}.sections`, 'needs at least one section'); return; }
      let lastKind = -1;
      release.sections.forEach((section, s) => {
        const sw = `${rw}.sections[${s}]${section?.kind ? ` (${section.kind})` : ''}`;
        const order = KINDS.indexOf(section?.kind);
        if (order < 0) err(`${sw}.kind`, `must be one of ${KINDS.join(', ')}`);
        else if (order <= lastKind) err(`${sw}.kind`, `each section once, in the order ${KINDS.join(', ')}`);
        else lastKind = order;
        if (!Array.isArray(section?.items) || !section.items.length) { err(`${sw}.items`, 'needs at least one entry'); return; }
        section.items.forEach((item, n) => text(item, `${sw}.items[${n}]`));
      });
    });
  });
  return errors;
}
