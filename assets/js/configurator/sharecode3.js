// PW3 share codes (pw3.md of Propwash, PW3 revision 3.0): a port of Pw3Codec with IdText, TableChecksum,
// ShareVersion, Pw3Carry, ShareTables, AddonDirectory and ShareConvert of Propwash 0.6.0. Every code is byte-identical
// to the mod's (tools/test-configurator.mjs checks the golden files of Propwash). The layers paint, tune, OSD and name
// are the ones of PW2 (sharecode2.js), bit for bit.
//
// Layout: 'PW3-' + base62 of [bit stream, padded to whole bytes] + [low 16 bits of the CRC-32 of those bytes]. The
// stream names every namespace (= mod id) of the parts once – by the short id of the official add-on directory or as
// text – with a 10-bit checksum of the table entries it uses, the minimum version and, for add-ons the directory does
// not know, their name and link; every part is then a number in its namespace's parts table, or its path as text.
//
// Part ids the reader cannot resolve stay in the build as 'pw3.unknown:<namespace>/<kind>/<number>' (or
// '…/0/<path>' under an unknown short id 'pw3.short.<n>'); re-encoding writes them back unchanged with the head of
// their namespace from the decoded code (carry).

import { crc32 } from './crc32.js?v=62ad0fa2';
import {
  BitWriter, golombLength, writeText, readText, writePaint, writeTune, writeOsd, indexBits, frameOf, openFrame, base62Encode,
  readLayers, skipOnce, BASE62,
} from './sharecode2.js?v=594888f1';
import { Fail, ACCESSORY_SLOTS, BUILD_FIELDS, utf8Encode, javaStrip } from './sharecode.js?v=594888f1';

export const PW3_FORMAT = 'PW3';
export const PW3_PREFIX = 'PW3-';
export const PW3_REVISION = '3.0';
export const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789_.-/';
export const UNKNOWN_NAMESPACE = 'pw3.unknown';
export const RESERVED_PREFIX = 'pw3.';
export const SHORT_KEY_PREFIX = 'pw3.short.';
export const PROPWASH = 'propwash';
export const PROPWASH_SHORT_ID = 1;
export const KINDS = Object.freeze(['frame', 'stack', 'motor', 'prop', 'video', 'battery', 'accessory']);
export const LINK_NONE = 0;
export const LINK_MODRINTH = 1;
export const LINK_CURSEFORGE = 2;
export const LINK_HTTPS = 3;
export const RESULTS = Object.freeze(['MATCH', 'MISMATCH', 'NEWER', 'MISSING', 'NO_TABLE']);
export const PW3_PARAMS = Object.freeze({ namespaceCount: 0, shortId: 1, part: 3, idText: 3, version: 0, accessoryCount: 0, accessorySlot: 0 });
export const PW3_LIMITS = Object.freeze({
  namespaces: 16, namespaceChars: 64, pathChars: 128, slugChars: 64, linkChars: 200, versionSuffixChars: 32, addonNameChars: 48,
  accessories: 255, frameBytes: 2500,
});
export const TABLE_CHECKSUM_BITS = 10;
const MAX_NUMBER = 0x7fffffff;
const MAX_CHAIN = 8;
const UNSAFE_ID_CHAR = /[^a-z0-9_.-]/;

/** A share-code error with the status and the translation key of the mod (ShareException). */
export class ShareError extends Error {
  constructor(status, key, args = []) {
    super(`${key} ${JSON.stringify(args)}`);
    this.status = status;
    this.key = key;
    this.args = args;
    this.shareError = true;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Ids

/** Namespace and path of an id like Identifier (no colon: 'minecraft'). */
export function splitId(id) {
  const text = String(id);
  const colon = text.indexOf(':');
  return colon < 0 ? ['minecraft', text] : [text.slice(0, colon), text.slice(colon + 1)];
}

const onlyChars = (text, slash) => !(slash ? /[^a-z0-9_.\-/]/ : UNSAFE_ID_CHAR).test(text);

export function validNamespace(namespace) {
  return typeof namespace === 'string' && namespace.length >= 1 && namespace.length <= PW3_LIMITS.namespaceChars
    && onlyChars(namespace, false) && namespace !== '.' && namespace !== '..';
}

export function writableNamespace(namespace) {
  return validNamespace(namespace) && !namespace.startsWith(RESERVED_PREFIX) && namespace !== 'pw2.unknown' && !namespace.startsWith('pw1.unknown.');
}

export function validPath(path) {
  return typeof path === 'string' && path.length >= 1 && path.length <= PW3_LIMITS.pathChars && onlyChars(path, true);
}

export function validSlug(slug) {
  return typeof slug === 'string' && slug.length >= 1 && slug.length <= PW3_LIMITS.slugChars && onlyChars(slug, false);
}

/** IdText.encodable. */
export function encodable(text, max) {
  if (typeof text !== 'string' || text.length === 0 || text.length > max) return false;
  for (const c of text) if (!ID_ALPHABET.includes(c)) return false;
  return true;
}

function writeIdText(out, text, max) {
  if (!encodable(text, max)) throw new ShareError('CORRUPT', 'propwash.share.error.part_id', [String(text)]);
  out.golomb(text.length - 1, PW3_PARAMS.idText);
  for (const c of text) out.bits(ID_ALPHABET.indexOf(c), 6);
}

function readIdText(r, max) {
  const length = r.golomb(PW3_PARAMS.idText) + 1;
  if (length * 6 > r.remaining()) throw new Fail('TRUNCATED');
  if (length > max) throw new Fail('CORRUPT');
  let out = '';
  for (let i = 0; i < length; i++) {
    const symbol = r.bits(6);
    if (symbol >= ID_ALPHABET.length) throw new Fail('CORRUPT');
    out += ID_ALPHABET[symbol];
  }
  return out;
}

/** 'pw3.unknown:<key>/<kind>/<number>' or, without a number, '…/0/<path>' (Pw3Codec.unknownId). */
export function unknownId(key, kind, number, path) {
  return `${UNKNOWN_NAMESPACE}:${key}/${kind}/${number > 0 ? number : `0/${path}`}`;
}

/** Java's String.split(regex, limit) for a plain separator. */
function splitLimit(text, separator, limit) {
  const out = [];
  let rest = text;
  while (out.length < limit - 1) {
    const at = rest.indexOf(separator);
    if (at < 0) break;
    out.push(rest.slice(0, at));
    rest = rest.slice(at + separator.length);
  }
  out.push(rest);
  return out;
}

/** {key, kind, number, path} of a 'pw3.unknown:…' id, else null (Pw3Codec.parseUnknown). */
export function parseUnknown(id) {
  const [namespace, path] = splitId(id);
  if (namespace !== UNKNOWN_NAMESPACE) return null;
  const parts = splitLimit(path, '/', 4);
  if (parts.length < 3) return null;
  const kind = parts[1];
  if (!KINDS.includes(kind) || !validNamespace(parts[0])) return null;
  if (parts.length === 3) {
    const digits = parts[2];
    if (!/^[1-9][0-9]{0,9}$/.test(digits)) return null;
    const number = Number(digits);
    return number <= MAX_NUMBER ? { key: parts[0], kind, number, path: null } : null;
  }
  if (parts[2] !== '0' || !validPath(parts[3])) return null;
  return { key: parts[0], kind, number: 0, path: parts[3] };
}

/** Pw3Codec.unknownMarker: a part the reader could not resolve (PW3, PW2 or PW1 marker). */
export function unknownMarker(id) {
  const [namespace] = splitId(id);
  return namespace === UNKNOWN_NAMESPACE || namespace === 'pw2.unknown' || namespace.startsWith('pw1.unknown.');
}

/** Pw3Codec.display: '?<kind>.<number>' for an unresolved part, else the id. */
export function displayId(id) {
  const unknown = parseUnknown(id);
  if (unknown) return `?${unknown.kind}.${unknown.number > 0 ? unknown.number : unknown.path}`;
  const [namespace, path] = splitId(id);
  if (namespace === 'pw2.unknown') return `?${path}`;
  if (namespace.startsWith('pw1.unknown.')) return `?${namespace.slice('pw1.unknown.'.length)}:${path}`;
  return String(id);
}

// ---------------------------------------------------------------------------------------------------------------
// Versions (ShareVersion)

export function validSuffix(suffix) {
  return typeof suffix === 'string' && suffix.length >= 1 && suffix.length <= PW3_LIMITS.versionSuffixChars && /^[A-Za-z0-9.-]+$/.test(suffix);
}

/** {major, minor, patch, suffix} of '1.2.3', '1.2.3-beta.1' or '1.2.3+build', else null. */
export function parseVersion(text) {
  if (text == null) return null;
  let rest = javaStrip(String(text));
  const plus = rest.indexOf('+');
  if (plus >= 0) rest = rest.slice(0, plus);
  let suffix = null;
  const dash = rest.indexOf('-');
  if (dash >= 0) {
    suffix = rest.slice(dash + 1);
    rest = rest.slice(0, dash);
    if (!validSuffix(suffix)) return null;
  }
  const parts = rest.split('.');
  if (parts.length !== 3) return null;
  const numbers = [];
  for (const p of parts) {
    if (!/^[0-9]{1,10}$/.test(p)) return null;
    const n = Number(p);
    if (n > MAX_NUMBER) return null;
    numbers.push(n);
  }
  return { major: numbers[0], minor: numbers[1], patch: numbers[2], suffix: suffix || null };
}

export function compareVersions(a, b) {
  return (a.major - b.major) || (a.minor - b.minor) || (a.patch - b.patch)
    || ((a.suffix == null ? 1 : 0) - (b.suffix == null ? 1 : 0))
    || ((a.suffix || '') < (b.suffix || '') ? -1 : (a.suffix || '') > (b.suffix || '') ? 1 : 0);
}

export const versionText = (v) => (v ? `${v.major}.${v.minor}.${v.patch}${v.suffix ? `-${v.suffix}` : ''}` : null);

// ---------------------------------------------------------------------------------------------------------------
// Table checksum (TableChecksum)

/** Lower 10 bits of the CRC-32 over the sorted, de-duplicated lines '<kind>:<number>:<path>\n'. */
export function tableChecksum(lines) {
  const unique = [];
  const seen = new Set();
  for (const l of lines) {
    const key = `${l.kind}:${l.number}:${l.path}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(l);
    }
  }
  unique.sort((a, b) => (KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind)) || (a.number - b.number) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const text = unique.map((l) => `${l.kind}:${l.number}:${l.path}\n`).join('');
  const bytes = Uint8Array.from(utf8Encode(text));
  return crc32(bytes, 0, bytes.length) & ((1 << TABLE_CHECKSUM_BITS) - 1);
}

// ---------------------------------------------------------------------------------------------------------------
// Tables (ShareTableJson, ShareTable, AddonDirectory, ShareTables)

/** A parts table (table.json, format 1) as {namespace, shortId, parts: {kind: [entry…]}} with lookups, or null. */
export function parseTable(json, expectedNamespace = null) {
  if (!json || typeof json !== 'object' || json.format !== 1) return null;
  const namespace = typeof json.namespace === 'string' ? json.namespace : '';
  if (!validNamespace(namespace) || (expectedNamespace != null && expectedNamespace !== namespace)) return null;
  const shortId = Number.isInteger(json.short_id) && json.short_id >= 1 ? json.short_id : null;
  const parts = {};
  for (const [kind, list] of Object.entries(json.parts || {})) {
    if (!KINDS.includes(kind) || !Array.isArray(list)) continue;
    parts[kind] = list.map((e, i) => {
      if (!e || typeof e !== 'object') return { id: `invalid.${i}`, since: '0.0.0' };
      const id = typeof e.id === 'string' && validPath(e.id) && !e.id.includes('/') ? e.id : `invalid.${i}`;
      const since = typeof e.since === 'string' && parseVersion(e.since) ? e.since : '0.0.0';
      const full = (v) => (typeof v === 'string' && v.includes(':') ? v : null);
      return {
        id, since,
        deprecated: typeof e.deprecated === 'string' && e.deprecated ? e.deprecated : null,
        replacedBy: full(e.replaced_by),
        fallback: full(e.fallback),
        names: e.name && typeof e.name === 'object' ? e.name : null,
      };
    });
  }
  const entries = (kind) => parts[kind] || [];
  return {
    namespace,
    shortId,
    parts,
    entries,
    number(kind, path) {
      const list = entries(kind);
      for (let i = 0; i < list.length; i++) if (list[i].id === path) return i + 1;
      return 0;
    },
    entry(kind, number) {
      const list = entries(kind);
      return number >= 1 && number <= list.length ? list[number - 1] : null;
    },
    find(id) {
      const [ns, path] = splitId(id);
      if (ns !== namespace) return null;
      for (const kind of KINDS) {
        const n = this.number(kind, path);
        if (n > 0) return { kind, number: n, entry: entries(kind)[n - 1] };
      }
      return null;
    },
  };
}

/** The official add-on directory (directory.json, format 1) as a list of add-ons with their tables. */
export function parseDirectory(json) {
  const addons = [];
  if (json && json.format === 1 && Array.isArray(json.addons)) {
    for (const a of json.addons) {
      if (!a || typeof a !== 'object' || !validNamespace(a.namespace) || !(Number.isInteger(a.short_id) && a.short_id >= 1)) continue;
      addons.push({
        namespace: a.namespace,
        shortId: a.short_id,
        name: a.name && typeof a.name === 'object' ? a.name : {},
        modrinth: validSlug(a.modrinth) ? a.modrinth : null,
        curseforge: validSlug(a.curseforge) ? a.curseforge : null,
        version: typeof a.version === 'string' && a.version ? a.version : null,
        table: a.table ? parseTable(a.table, a.namespace) : null,
      });
    }
  }
  return {
    addons,
    byNamespace: (ns) => addons.find((a) => a.namespace === ns) || null,
    byShortId: (s) => addons.find((a) => a.shortId === s) || null,
  };
}

/**
 * What the codec knows (ShareTables): installed parts tables (array of table.json objects), the add-on directory,
 * installed versions and mod metadata ({name, homepage}) per namespace, a part lookup (id → kind or null; active(id))
 * and whether this is the frozen context of the conversion.
 */
export function createShareTables({ tables = [], directory = null, versions = {}, mods = {}, lookup = null, active = null, frozen = false } = {}) {
  const installed = new Map();
  for (const json of Array.isArray(tables) ? tables : Object.values(tables)) {
    const table = json && json.entries ? json : parseTable(json);
    if (table) installed.set(table.namespace, table);
  }
  const dir = directory && directory.addons && directory.byNamespace ? directory : parseDirectory(directory);
  const namespaceOfShort = new Map([[PROPWASH_SHORT_ID, PROPWASH]]);
  const shortOfNamespace = new Map([[PROPWASH, PROPWASH_SHORT_ID]]);
  for (const addon of dir.addons) {
    const owner = namespaceOfShort.get(addon.shortId);
    if (owner != null && owner !== addon.namespace) continue;
    if (shortOfNamespace.has(addon.namespace) && shortOfNamespace.get(addon.namespace) !== addon.shortId) continue;
    namespaceOfShort.set(addon.shortId, addon.namespace);
    shortOfNamespace.set(addon.namespace, addon.shortId);
  }
  const claims = new Map();
  for (const table of installed.values()) {
    if (table.shortId == null) continue;
    if (shortOfNamespace.has(table.namespace) || namespaceOfShort.has(table.shortId)) continue;
    if (!claims.has(table.shortId)) claims.set(table.shortId, []);
    claims.get(table.shortId).push(table.namespace);
  }
  for (const [shortId, owners] of [...claims.entries()].sort((a, b) => a[0] - b[0])) {
    if (owners.length === 1) {
      namespaceOfShort.set(shortId, owners[0]);
      shortOfNamespace.set(owners[0], shortId);
    }
  }
  const kindOf = (id) => {
    try {
      return lookup ? lookup(id) || null : null;
    } catch {
      return null;
    }
  };
  const t = {
    frozen,
    directory: dir,
    installedTables: installed,
    table: (ns) => installed.get(ns) || (dir.byNamespace(ns) && dir.byNamespace(ns).table) || null,
    installed: (ns) => ns === PROPWASH || installed.has(ns) || Object.prototype.hasOwnProperty.call(versions, ns),
    version: (ns) => (Object.prototype.hasOwnProperty.call(versions, ns) ? versions[ns] : null),
    mod: (ns) => (Object.prototype.hasOwnProperty.call(mods, ns) ? mods[ns] : null),
    namespaceOfShort: (s) => namespaceOfShort.get(s) || null,
    shortIdOf: (ns) => shortOfNamespace.get(ns) || 0,
    kind: kindOf,
    active: (id) => {
      try {
        return active ? active(id) !== false : true;
      } catch {
        return true;
      }
    },
    registered: (id) => kindOf(id) != null,
    entry: (id) => {
      const table = t.table(splitId(id)[0]);
      return table ? table.find(id) : null;
    },
    replacement(id) {
      let current = id;
      const seen = new Set();
      for (let i = 0; i < MAX_CHAIN && !seen.has(current); i++) {
        seen.add(current);
        if (t.registered(current)) return current;
        const located = t.entry(current);
        if (!located || !located.entry.deprecated || !located.entry.replacedBy) return current;
        current = located.entry.replacedBy;
      }
      return current;
    },
  };
  return t;
}

/** ShareTables.frozen: the conversion's context – the Propwash table and the tables of the directory, nothing installed besides. */
export function frozenTables(propwashTable, directory) {
  const dir = parseDirectory(directory);
  const tables = [propwashTable];
  for (const addon of dir.addons) if (addon.namespace !== PROPWASH && addon.table) tables.push(addon.table);
  return createShareTables({ tables, directory: dir, frozen: true });
}

// ---------------------------------------------------------------------------------------------------------------
// Encoding (Pw3Codec.encode)

/** Name and link of an add-on from its metadata ({name, homepage}), as the code's info, or null (Pw3Codec.info). */
export function infoOf(meta) {
  if (!meta) return null;
  let name = typeof meta.name === 'string' ? javaStrip(meta.name) : '';
  if (name.length > PW3_LIMITS.addonNameChars) name = javaStrip(name.slice(0, PW3_LIMITS.addonNameChars));
  if (!name) return null;
  const link = linkOf(meta.homepage);
  return { name, linkType: link.type, link: link.value };
}

/** Link type and value of a mod's homepage (Pw3Codec.link). */
export function linkOf(homepage) {
  if (typeof homepage !== 'string' || !javaStrip(homepage)) return { type: LINK_NONE, value: null };
  const url = javaStrip(homepage);
  const lower = url.toLowerCase();
  const slug = (rest) => {
    let end = rest.length;
    for (const stop of ['/', '?', '#']) {
      const at = rest.indexOf(stop);
      if (at >= 0 && at < end) end = at;
    }
    return rest.slice(0, end);
  };
  for (const prefix of ['https://modrinth.com/mod/', 'https://www.modrinth.com/mod/']) {
    if (lower.startsWith(prefix)) {
      const s = slug(lower.slice(prefix.length));
      if (validSlug(s)) return { type: LINK_MODRINTH, value: s };
    }
  }
  for (const prefix of ['https://www.curseforge.com/minecraft/mc-mods/', 'https://curseforge.com/minecraft/mc-mods/']) {
    if (lower.startsWith(prefix)) {
      const s = slug(lower.slice(prefix.length));
      if (validSlug(s)) return { type: LINK_CURSEFORGE, value: s };
    }
  }
  if (lower.startsWith('https://')) {
    const rest = url.slice('https://'.length);
    if (printableLink(rest)) return { type: LINK_HTTPS, value: rest };
  }
  return { type: LINK_NONE, value: null };
}

export function printableLink(text) {
  if (typeof text !== 'string' || text.length === 0 || text.length > PW3_LIMITS.linkChars) return false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x21 || c > 0x7e) return false;
  }
  return true;
}

/** Pw3Codec.refs: the six fields, then the accessories in slot order, each {position, kind, id}. */
function refsOf(build) {
  const refs = BUILD_FIELDS.map((field) => ({ position: field, kind: field, id: build[field] }));
  for (const slot of ACCESSORY_SLOTS) {
    const id = build.accessories && build.accessories[slot];
    if (id != null) refs.push({ position: `accessory:${slot}`, kind: 'accessory', id });
  }
  return refs;
}

/** Pw3Codec.keyOf: the namespace key of a part id; throws ShareError. */
function keyOf(id) {
  const [namespace] = splitId(id);
  if (namespace === UNKNOWN_NAMESPACE) {
    const unknown = parseUnknown(id);
    if (!unknown) throw new ShareError('CORRUPT', 'propwash.share.error.part_id', [id]);
    return unknown.key;
  }
  if (namespace === 'pw2.unknown' || namespace.startsWith('pw1.unknown.')) {
    throw new ShareError('NOT_CONVERTIBLE', 'propwash.share.error.legacy_unknown', [id]);
  }
  if (namespace !== PROPWASH && (!writableNamespace(namespace) || !encodable(namespace, PW3_LIMITS.namespaceChars))) {
    throw new ShareError('CORRUPT', 'propwash.share.error.namespace', [id]);
  }
  return namespace;
}

const valueText = (position, value) => `${position}=${value.number}${value.path == null ? '' : `/${value.path}`}`;

function carriedHead(key, group, tables, carry, values) {
  const head = carry && carry.get(key);
  if (!head) throw new ShareError('UNKNOWN_ENTRIES', 'propwash.share.error.unknown_entries', [key]);
  const now = [];
  const local = new Map();
  const table = head.hasTable && head.namespace ? tables.table(head.namespace) : null;
  for (const ref of group) {
    let value;
    const unknown = parseUnknown(ref.id);
    if (unknown) {
      if (unknown.kind !== ref.kind) throw new ShareError('UNKNOWN_ENTRIES', 'propwash.share.error.unknown_entries', [key]);
      value = { number: unknown.number, path: unknown.path };
    } else if (!head.hasTable) {
      value = { number: 0, path: splitId(ref.id)[1] };
    } else {
      const path = splitId(ref.id)[1];
      const number = table ? table.number(ref.kind, path) : 0;
      value = number > 0 ? { number, path: null } : { number: 0, path };
    }
    if (!head.hasTable && value.number > 0) throw new ShareError('UNKNOWN_ENTRIES', 'propwash.share.error.unknown_entries', [key]);
    local.set(ref.position, value);
    now.push(valueText(ref.position, value));
  }
  if (JSON.stringify(now) !== JSON.stringify(head.refs)) throw new ShareError('UNKNOWN_ENTRIES', 'propwash.share.error.unknown_entries', [key]);
  for (const [k, v] of local) values.set(k, v);
  return { shortId: head.shortId, namespace: head.namespace, hasTable: head.hasTable, checksum: head.checksum, version: head.version, info: head.info };
}

function freshHead(namespace, group, tables, info, values) {
  const shortId = namespace === PROPWASH ? PROPWASH_SHORT_ID : tables.shortIdOf(namespace);
  const table = tables.table(namespace);
  const lines = [];
  let since = null;
  for (const ref of group) {
    const path = splitId(ref.id)[1];
    const number = table ? table.number(ref.kind, path) : 0;
    if (number > 0) {
      values.set(ref.position, { number, path: null });
      lines.push({ kind: ref.kind, number, path });
      const entrySince = parseVersion(table.entries(ref.kind)[number - 1].since);
      if (entrySince && (!since || compareVersions(entrySince, since) > 0)) since = entrySince;
    } else {
      if (!encodable(path, PW3_LIMITS.pathChars) || !validPath(path)) throw new ShareError('CORRUPT', 'propwash.share.error.part_id', [ref.id]);
      values.set(ref.position, { number: 0, path });
    }
  }
  let version = since;
  if (!version && !tables.frozen) version = parseVersion(tables.version(namespace));
  const wanted = info === 'ALWAYS' ? true : info === 'NEVER' ? false : !tables.directory.byNamespace(namespace) && namespace !== PROPWASH;
  const headInfo = wanted && !tables.frozen ? infoOf(tables.mod(namespace)) : null;
  const checksum = table ? tableChecksum(lines) : 0;
  return { shortId, namespace: shortId === 0 ? namespace : null, hasTable: !!table, checksum, version, info: headInfo };
}

function writeHead(out, head) {
  out.golomb(head.shortId, PW3_PARAMS.shortId);
  if (head.shortId === 0) writeIdText(out, head.namespace, PW3_LIMITS.namespaceChars);
  out.bit(head.hasTable);
  if (head.hasTable) out.bits(head.checksum & ((1 << TABLE_CHECKSUM_BITS) - 1), TABLE_CHECKSUM_BITS);
  out.bit(!!head.version);
  if (head.version) {
    out.golomb(head.version.major, PW3_PARAMS.version).golomb(head.version.minor, PW3_PARAMS.version).golomb(head.version.patch, PW3_PARAMS.version);
    out.bit(!!head.version.suffix);
    if (head.version.suffix) writeText(out, head.version.suffix);
  }
  out.bit(!!head.info);
  if (head.info) {
    writeText(out, head.info.name);
    const type = head.info.link != null ? head.info.linkType : LINK_NONE;
    out.bits(type, 2);
    if (type === LINK_MODRINTH || type === LINK_CURSEFORGE) writeIdText(out, head.info.link, PW3_LIMITS.slugChars);
    else if (type === LINK_HTTPS) writeText(out, head.info.link);
  }
}

/**
 * PW3 code of normalised content (sharecode.js normalizeContent) with the given tables; info: 'AUTO' (name and link of
 * add-ons the directory does not know), 'ALWAYS' or 'NEVER'; carry: the heads of a decoded code for its unknown parts.
 * Throws ShareError when the content cannot be written.
 * @returns {string} 'PW3-…'
 */
export function encodePw3(content, tables, { info = 'AUTO', carry = null } = {}) {
  const refs = refsOf(content.build);
  const groups = new Map();
  for (const ref of refs) {
    const key = keyOf(ref.id);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ref);
  }
  if (groups.size > PW3_LIMITS.namespaces) throw new ShareError('TOO_LARGE', 'propwash.share.error.too_many_namespaces', [groups.size, PW3_LIMITS.namespaces]);
  const keys = [...groups.keys()];
  const heads = [];
  const values = new Map();
  for (const key of keys) {
    const group = groups.get(key);
    const carried = group.some((ref) => splitId(ref.id)[0] === UNKNOWN_NAMESPACE);
    heads.push(carried ? carriedHead(key, group, tables, carry, values) : freshHead(key, group, tables, info, values));
  }
  const out = new BitWriter();
  out.bit(!!content.paint).bit(!!content.tune).bit(!!content.osd).bit(!!content.name).bit(false);
  out.golomb(heads.length - 1, PW3_PARAMS.namespaceCount);
  for (const head of heads) writeHead(out, head);
  const bits = indexBits(heads.length);
  const writeRef = (ref) => {
    const index = keys.indexOf(keyOf(ref.id));
    out.bits(index, bits);
    const value = values.get(ref.position);
    if (heads[index].hasTable) {
      out.golomb(value.number, PW3_PARAMS.part);
      if (value.number === 0) writeIdText(out, value.path, PW3_LIMITS.pathChars);
    } else {
      writeIdText(out, value.path, PW3_LIMITS.pathChars);
    }
  };
  for (let i = 0; i < 6; i++) writeRef(refs[i]);
  out.golomb(refs.length - 6, PW3_PARAMS.accessoryCount);
  for (let i = 6; i < refs.length; i++) {
    out.golomb(ACCESSORY_SLOTS.indexOf(refs[i].position.slice('accessory:'.length)), PW3_PARAMS.accessorySlot);
    writeRef(refs[i]);
  }
  if (content.paint) writePaint(out, content.paint);
  if (content.tune) writeTune(out, content.tune);
  if (content.osd) writeOsd(out, content.osd);
  if (content.name) writeText(out, content.name);
  const frame = frameOf(out.toBytes());
  if (frame.length > PW3_LIMITS.frameBytes) throw new ShareError('TOO_LARGE', 'propwash.share.error.too_large', [frame.length, PW3_LIMITS.frameBytes]);
  return PW3_PREFIX + base62Encode(frame);
}

/** Bits of a text as writeText writes it (for length estimates). */
export function idTextBits(text) {
  return golombLength(text.length - 1, PW3_PARAMS.idText) + 6 * text.length;
}

// ---------------------------------------------------------------------------------------------------------------
// Decoding (Pw3Codec.decode)

function readHead(r, tables) {
  const shortId = r.golomb(PW3_PARAMS.shortId);
  if (shortId > MAX_NUMBER) throw new Fail('CORRUPT');
  let namespace;
  if (shortId === 0) {
    const text = readIdText(r, PW3_LIMITS.namespaceChars);
    if (!writableNamespace(text) || text === PROPWASH) throw new Fail('CORRUPT');
    namespace = text;
  } else {
    namespace = tables.namespaceOfShort(shortId);
  }
  const hasTable = r.bit();
  const checksum = hasTable ? r.bits(TABLE_CHECKSUM_BITS) : 0;
  let version = null;
  if (r.bit()) {
    const major = r.golomb(PW3_PARAMS.version);
    const minor = r.golomb(PW3_PARAMS.version);
    const patch = r.golomb(PW3_PARAMS.version);
    if (major > MAX_NUMBER || minor > MAX_NUMBER || patch > MAX_NUMBER) throw new Fail('CORRUPT');
    let suffix = null;
    if (r.bit()) {
      const text = readText(r, PW3_LIMITS.versionSuffixChars);
      if (!validSuffix(text)) throw new Fail('CORRUPT');
      suffix = text;
    }
    version = { major, minor, patch, suffix };
  }
  let info = null;
  if (r.bit()) {
    const name = readText(r, PW3_LIMITS.addonNameChars);
    if (!javaStrip(name) || name.length > PW3_LIMITS.addonNameChars) throw new Fail('CORRUPT');
    const type = r.bits(2);
    let link = null;
    if (type === LINK_MODRINTH || type === LINK_CURSEFORGE) {
      const slug = readIdText(r, PW3_LIMITS.slugChars);
      if (!validSlug(slug)) throw new Fail('CORRUPT');
      link = slug;
    } else if (type === LINK_HTTPS) {
      const text = readText(r, PW3_LIMITS.linkChars);
      if (!printableLink(text)) throw new Fail('CORRUPT');
      link = text;
    }
    info = { name, linkType: type, link };
  }
  return { shortId, namespace, hasTable, checksum, version, info, key: namespace || `${SHORT_KEY_PREFIX}${shortId}` };
}

function readRef(r, position, kind, heads, bits) {
  const index = r.bits(bits);
  if (index >= heads.length) throw new Fail('CORRUPT');
  if (heads[index].hasTable) {
    const number = r.golombInt(PW3_PARAMS.part, MAX_NUMBER);
    if (number > 0) return { position, kind, head: index, number, path: null };
  }
  const path = readIdText(r, PW3_LIMITS.pathChars);
  if (!validPath(path)) throw new Fail('CORRUPT');
  return { position, kind, head: index, number: 0, path };
}

function resolve(ref, head, tables, parsed) {
  if (!head.namespace) return unknownId(head.key, ref.kind, ref.number, ref.path);
  if (ref.number === 0) return `${head.namespace}:${ref.path}`;
  const table = tables.table(head.namespace);
  const entry = table && table.entry(ref.kind, ref.number);
  if (entry) return `${head.namespace}:${entry.id}`;
  skipOnce(parsed, `part_index:${head.namespace}/${ref.kind}.${ref.number}`);
  return unknownId(head.namespace, ref.kind, ref.number, null);
}

function report(index, head, refs, tables, used) {
  const installedVersion = head.namespace ? tables.version(head.namespace) : null;
  let result;
  if (!head.namespace || !tables.installed(head.namespace)) {
    result = 'MISSING';
  } else if (!head.hasTable) {
    result = 'NO_TABLE';
  } else {
    const table = tables.table(head.namespace);
    const lines = [];
    let newer = !table;
    for (const ref of refs) {
      if (ref.head === index && ref.number > 0 && table) {
        const entry = table.entry(ref.kind, ref.number);
        if (!entry) newer = true;
        else lines.push({ kind: ref.kind, number: ref.number, path: entry.id });
      }
    }
    result = newer ? 'NEWER' : tableChecksum(lines) === head.checksum ? 'MATCH' : 'MISMATCH';
  }
  return {
    index,
    namespace: head.namespace,
    short_id: head.shortId,
    table: head.hasTable,
    checksum: head.hasTable ? head.checksum : null,
    min_version: versionText(head.version),
    name: head.info ? head.info.name : null,
    link_type: head.info ? head.info.linkType : LINK_NONE,
    link: head.info ? head.info.link : null,
    installed_version: installedVersion,
    result,
    used,
  };
}

const positionOf = (ref) => {
  if (ref.kind !== 'accessory') return ref.position;
  const slot = Number(ref.position.slice('accessory:'.length));
  return slot < ACCESSORY_SLOTS.length ? `accessory:${ACCESSORY_SLOTS[slot]}` : ref.position;
};

/**
 * Reads the Base62 symbols of a PW3 code (without prefix and dashes) into the parsed form that sharecode.js finishes
 * like PW1 and PW2, plus the reports per namespace and the carry for re-encoding. Throws Fail.
 */
export function parsePw3(symbols, tables) {
  const r = openFrame(symbols);
  const has = { paint: r.bit(), tune: r.bit(), osd: r.bit(), name: r.bit(), extensions: r.bit() };
  const count = r.golombInt(PW3_PARAMS.namespaceCount, PW3_LIMITS.namespaces - 1) + 1;
  const heads = [];
  const keys = [];
  for (let i = 0; i < count; i++) {
    const head = readHead(r, tables);
    if (keys.includes(head.key)) throw new Fail('CORRUPT');
    keys.push(head.key);
    heads.push(head);
  }
  const bits = indexBits(count);
  const refs = [];
  for (let i = 0; i < 6; i++) refs.push(readRef(r, BUILD_FIELDS[i], BUILD_FIELDS[i], heads, bits));
  const accessories = r.golombInt(PW3_PARAMS.accessoryCount, PW3_LIMITS.accessories);
  const slots = [];
  for (let i = 0; i < accessories; i++) {
    const slot = r.golombInt(PW3_PARAMS.accessorySlot, MAX_NUMBER);
    slots.push(slot);
    refs.push(readRef(r, `accessory:${slot}`, 'accessory', heads, bits));
  }
  const parsed = { layers: ['parts'], skipped: [], parts: null, accessories: {}, paint: null, tune: null, osd: null, name: null };
  readLayers(r, parsed, has);
  const used = new Array(count).fill(false);
  const ids = refs.map((ref) => {
    used[ref.head] = true;
    return resolve(ref, heads[ref.head], tables, parsed);
  });
  parsed.parts = ids.slice(0, 6);
  for (let i = 0; i < accessories; i++) {
    const slot = slots[i];
    if (slot >= ACCESSORY_SLOTS.length) {
      parsed.skipped.push(`accessory_slot:${slot}`);
      continue;
    }
    const key = ACCESSORY_SLOTS[slot];
    if (key in parsed.accessories) parsed.skipped.push(`accessory_slot_duplicate:${slot}`);
    parsed.accessories[key] = ids[6 + i];
  }
  const reports = [];
  const carry = new Map();
  for (let h = 0; h < count; h++) {
    const head = heads[h];
    if (!used[h]) parsed.skipped.push(`namespace_unused:${h}`);
    reports.push(report(h, head, refs, tables, used[h]));
    let unknown = false;
    const texts = [];
    refs.forEach((ref, i) => {
      if (ref.head !== h) return;
      if (splitId(ids[i])[0] === UNKNOWN_NAMESPACE) unknown = true;
      texts.push(valueText(positionOf(ref), ref));
    });
    if (unknown) {
      carry.set(head.key, {
        shortId: head.shortId, namespace: head.namespace, hasTable: head.hasTable, checksum: head.checksum, version: head.version, info: head.info,
        refs: texts,
      });
    }
  }
  return { parsed, reports, carry };
}

/** True if the text is a bare Base62 body (what a double click selects of 'PW3-…'). */
export function base62Only(text) {
  if (!text) return false;
  for (const c of text) if (!BASE62.includes(c)) return false;
  return true;
}
