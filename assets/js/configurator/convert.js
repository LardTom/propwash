// Converter of old share codes (the page /convert/ and the configurator): finds every PW1, PW2 and PW3 code and every
// PWD1 code of the drone editor in any text, e.g. a whole Discord post, converts PW1, PW2 and PWD1 to PW3 like the mod
// (ShareConvert, sharecode.js convert; a PWD1 code keeps its creative values), checks PW3 codes, and puts the new codes
// in place of the old ones. Runs in the browser only; nothing is sent anywhere. Also the texts both pages show for a
// code: why it can't be converted, and the add-ons it needs with safe links.

import { t } from './i18n.js?v=530a1534';
import { decodePwd1, PWD1_PREFIX } from './sharecode.js?v=024bd980';
import { creativeCounts } from './sharecode3.js?v=024bd980';

/** At most this many codes per pass (website design 0.6.0, 3.5.3). */
export const MAX_CODES = 100;

// A code in running text: the prefix (any case), optionally a dash, then Base62/Base32 symbols, dashes between groups
// (PW1 writes groups of five). Letters or digits right before or after it mean it is part of a longer word.
const CODE = /(?<![0-9A-Za-z])(PW[123]-?[0-9A-Za-z]+(?:-[0-9A-Za-z]+)*)(?![0-9A-Za-z])/gi;
// Fewer symbols than the smallest frame (3 bytes) can't be a code.
const MIN_SYMBOLS = 5;
// A body made of words ("PW3-Code", "PW2-Codes", "PW3-Sharecode-Format"): capital letters only at the start of a run of
// small ones, no digits. Random code bodies look like that now and then too, so such a token only counts as a code when
// it reads as one (convertText).
const WORDS = /^(?:[A-Z]?[a-z]+)+$/;
// A PWD1 code of the drone editor: 'PWD1-' (any case) and Base64url (letters, digits, '-', '_'), not inside a word
// (letters, digits or '_' before it). Like the game's chat (ChatCodeFinder): dashes at the end belong to the code only
// if it reads with them; the shortest body is "AwA" (an empty deflate stream).
const PWD1 = /(?<![\p{L}\p{N}_])PWD1-([0-9A-Za-z_-]+)/giu;
const MIN_PWD1_SYMBOLS = 3;
const wordChar = (c) => c !== undefined && /[\p{L}\p{N}_]/u.test(c);

/** PWD1 codes of a text: {code, start, end, format: 'PWD1', word}. */
function findPwd1(text) {
  const out = [];
  for (const m of text.matchAll(PWD1)) {
    const start = m.index;
    const longest = start + m[0].length;
    let shortest = longest;
    while (shortest > start + PWD1_PREFIX.length + 1 && text[shortest - 1] === '-') shortest--;
    if (shortest - start - PWD1_PREFIX.length < MIN_PWD1_SYMBOLS) continue;
    let end = -1;
    for (let at = shortest; at <= longest; at++) {
      if (!wordChar(text[at]) && decodePwd1(text.slice(start, at))) {
        end = at;
        break;
      }
    }
    if (end < 0 && !wordChar(text[shortest])) end = shortest;
    if (end < 0) continue;
    const code = text.slice(start, end);
    out.push({ code, start, end, format: 'PWD1', word: WORDS.test(code.slice(PWD1_PREFIX.length)) });
  }
  return out;
}

/**
 * Every token of a text that looks like a share code, in order: {code, start, end, format, word} with format 'PW1',
 * 'PW2', 'PW3' or 'PWD1' (from the prefix; the reader decides whether it is valid) and word true for a token that could
 * just as well be a hyphenated word ("PW3-Code"). Codes inside links (configurator/#PW2…) count too.
 */
export function findCodes(text) {
  const out = [];
  if (typeof text !== 'string') return out;
  const editor = findPwd1(text);
  const inside = (at) => editor.some((e) => at >= e.start && at < e.end);
  for (const m of text.matchAll(CODE)) {
    const code = m[1];
    const body = code.slice(3).replace(/-/g, '');
    if (body.length < MIN_SYMBOLS || inside(m.index)) continue;
    out.push({ code, start: m.index, end: m.index + code.length, format: code.slice(0, 3).toUpperCase(), word: WORDS.test(body) });
  }
  return [...out, ...editor].sort((a, b) => a.start - b.start);
}

/** Why an old code can't become PW3 (ShareConvert reasons), as text. */
export function reasonText(reason) {
  const [kind, value] = String(reason || '').split(/:(.*)/s);
  if (kind === 'pw2_unknown') return t('convert.reasonPw2', { part: `?${value}` });
  if (kind === 'pw1_unknown') return t('convert.reasonPw1', { n: value });
  if (kind === 'reserved_namespace') return t('convert.reasonReserved', { ns: value });
  return t('convert.reasonOther');
}

/**
 * An add-on a PW3 code names that the page can't match (result MISSING, NEWER or MISMATCH): {text, links: [[label,
 * href]], free} or null. Links only to Modrinth and CurseForge projects (from the add-on directory, else from the
 * code) and, for a short id the page doesn't know, to the add-on directory; a free address from the code comes back
 * as text only (free), never as a link. addonsPage: address of the add-on directory page.
 */
export function addonNote(report, catalog, lang, addonsPage) {
  if (!['MISSING', 'NEWER', 'MISMATCH'].includes(report.result)) return null;
  const ns = report.namespace;
  const name = ns ? catalog.addonName(ns, lang, report.name) || ns : t('addons.number', { n: report.short_id });
  const version = report.min_version ? t('addons.from', { version: report.min_version }) : '';
  const loaded = ns && catalog.namespace(ns) ? catalog.namespace(ns).version : '';
  const key = report.result === 'MISMATCH' ? 'addons.mismatch' : report.result === 'NEWER' ? 'addons.newer' : 'addons.missing';
  const dir = ns ? catalog.directoryEntry(ns) : null;
  const modrinth = dir ? dir.modrinth : report.link_type === 1 ? report.link : null;
  const curseforge = dir ? dir.curseforge : report.link_type === 2 ? report.link : null;
  const links = [];
  if (modrinth) links.push(['Modrinth', `https://modrinth.com/mod/${modrinth}`]);
  if (curseforge) links.push(['CurseForge', `https://www.curseforge.com/minecraft/mc-mods/${curseforge}`]);
  if (!ns) links.push([t('addons.directory'), addonsPage]);
  const free = !dir && report.link_type === 3 && report.link ? t('addons.free', { link: report.link }) : null;
  return { text: t(key, { name, version, installed: loaded }).replace(/ {2,}/g, ' '), links, free };
}

const HOMEPAGES = { 1: 'https://modrinth.com/mod/', 2: 'https://www.curseforge.com/minecraft/mc-mods/', 3: 'https://' };

/**
 * The add-ons a decoded PW3 code needs that the page has not loaded (result MISSING), as the code describes them:
 * namespace → {version, name, homepage}. withCodeAddons writes them back into the codes of the build.
 */
export function codeAddons(reports) {
  const out = new Map();
  for (const r of reports || []) {
    if (r.result !== 'MISSING' || !r.namespace) continue;
    const homepage = r.link && HOMEPAGES[r.link_type] ? HOMEPAGES[r.link_type] + r.link : null;
    out.set(r.namespace, { version: r.min_version, name: r.name, homepage });
  }
  return out;
}

/**
 * Share tables for writing a build that holds parts of add-ons from codeAddons: for a namespace the tables don't have,
 * the version, name and link of the code, so the new code still says what the build needs (like the game, which
 * passes such a code on unchanged). A loaded add-on keeps the page's own data.
 */
export function withCodeAddons(tables, addons) {
  if (!addons || !addons.size) return tables;
  const remembered = (ns) => (addons.has(ns) && !tables.installed(ns) ? addons.get(ns) : null);
  return {
    ...tables,
    version: (ns) => (remembered(ns) ? remembered(ns).version : tables.version(ns)),
    mod: (ns) => (remembered(ns) && remembered(ns).name ? { name: remembered(ns).name, homepage: remembered(ns).homepage } : tables.mod(ns)),
  };
}

/**
 * Outcome of one code: kind 'converted' (old code, new PW3 code in code), 'pw3' (already PW3 and readable),
 * 'unknown' (readable, but with parts this site does not know, e.g. of an add-on that is not loaded), 'not_convertible'
 * (reason), 'damaged' (status of the reader: CHECKSUM, TRUNCATED, …); plus the drone's name, frame and class, and for a
 * creative drone the number of its own values and base parts (creative: {values, base}).
 */
export function convertCode(code, catalog) {
  const format = /^pwd1/i.test(code) ? 'PWD1' : code.slice(0, 3).toUpperCase();
  const result = { from: code, format, kind: 'damaged', status: 'CORRUPT', code: null, reason: null, name: null, frame: null, role: null,
    unknown: [], missing: [], namespaces: [], creative: null };
  const conversion = catalog.convert(code);
  result.status = conversion.status;
  if (conversion.status === 'NOT_CONVERTIBLE') {
    result.kind = 'not_convertible';
    result.reason = conversion.reason;
  }
  if (conversion.status !== 'OK') {
    const old = catalog.decode(code);
    if (old.ok) describe(result, old, catalog);
    return result;
  }
  result.code = conversion.code;
  const decoded = catalog.decode(conversion.code);
  if (!decoded.ok) {
    result.kind = 'damaged';
    result.status = decoded.status;
    return result;
  }
  describe(result, decoded, catalog);
  result.kind = result.unknown.length ? 'unknown' : conversion.converted ? 'converted' : 'pw3';
  return result;
}

function describe(result, decoded, catalog) {
  const build = decoded.content.build;
  result.name = decoded.content.name;
  const frame = catalog.part(build.frame);
  result.frame = build.frame;
  result.role = frame && frame.category === 'frame' ? frame.data.role : null;
  result.unknown = [...decoded.unknownParts, ...decoded.wrongKind];
  result.creative = creativeCounts(decoded.content.creative);
  result.namespaces = decoded.namespaces;
  result.missing = decoded.namespaces.filter((n) => n.result !== 'MATCH' && n.result !== 'NO_TABLE');
}

/**
 * Converts every code of a text (at most MAX_CODES, the rest stays as it is): {text (the text with every converted
 * code in place of the old one), codes (one result per distinct code, in order of appearance, with count), found
 * (all codes in the text), skipped (codes beyond MAX_CODES)}.
 */
export function convertText(text, catalog) {
  // A word like "PW3-Code" stays text unless it reads as a share code.
  const found = findCodes(text).filter((f) => !f.word || catalog.decode(f.code).ok);
  const handled = found.slice(0, MAX_CODES);
  const byCode = new Map();
  for (const f of handled) {
    if (!byCode.has(f.code)) byCode.set(f.code, { ...convertCode(f.code, catalog), count: 0 });
    byCode.get(f.code).count++;
  }
  let out = '';
  let at = 0;
  for (const f of handled) {
    const r = byCode.get(f.code);
    out += text.slice(at, f.start) + (r.code && r.kind !== 'damaged' ? r.code : f.code);
    at = f.end;
  }
  out += text.slice(at);
  return { text: out, codes: [...byCode.values()], found: found.length, skipped: Math.max(0, found.length - MAX_CODES) };
}
