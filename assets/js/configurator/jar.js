// Reads an add-on jar (a ZIP file) in the browser, only in memory: the central directory, then single entries on
// demand, decompressed with the configurator's inflate.js. Nothing is uploaded, stored or executed. Hard limits keep a
// hostile file harmless (website design 0.6.0, 3.5.4; share codes PW3, 3.16): the whole jar, the number of entries,
// every entry's size and compression ratio, JSON and texture sizes, the total unpacked. Names with "..", absolute
// paths or backslashes are skipped. Every refusal is a JarError with a code the page turns into a sentence.
//
//   const jar = openJar(bytes);          // throws JarError: jar.too_big, jar.not_zip, jar.too_many_entries, …
//   jar.has('fabric.mod.json'); const bytes = jar.read('fabric.mod.json');   // throws JarError per entry

import { inflateRaw } from './inflate.js?v=08050593';
import { crc32 } from './crc32.js?v=62ad0fa2';

const MiB = 1024 * 1024;
export const JAR_LIMITS = Object.freeze({
  jarBytes: 64 * MiB,
  entries: 20000,
  entryBytes: 16 * MiB,
  jsonBytes: 2 * MiB,
  textureBytes: 4 * MiB,
  textureEdge: 1024,
  totalBytes: 128 * MiB,
  ratio: 100,
});

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const ZIP64_LOCATOR = 0x07064b50;

/** A refusal: `code` names the reason (texts in the page's i18n), `args` the numbers or the entry. */
export class JarError extends Error {
  constructor(code, args = {}) {
    super(`${code} ${JSON.stringify(args)}`);
    this.code = code;
    this.args = args;
    this.jarError = true;
  }
}

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const utf8 = new TextDecoder('utf-8');

/** A safe entry name: relative, no "..", "." or empty segments, no backslash, no drive letter. */
export function safeName(name) {
  if (!name || name.startsWith('/') || name.includes('\\') || /^[A-Za-z]:/.test(name) || name.includes('\u0000')) return false;
  const segments = name.split('/');
  if (segments[segments.length - 1] === '') segments.pop();
  return segments.length > 0 && segments.every((s) => s !== '' && s !== '.' && s !== '..');
}

function findEnd(bytes) {
  const min = Math.max(0, bytes.length - 22 - 0xffff);
  for (let i = bytes.length - 22; i >= min; i--) {
    if (u32(bytes, i) === EOCD && i + 22 + u16(bytes, i + 20) <= bytes.length) return i;
  }
  return -1;
}

/**
 * Opens a jar: reads its central directory and checks the limits. Returns {entries, names, has, read, size,
 * skipped, problems}. `read(name)` decompresses one entry (cached) and throws a JarError when that entry breaks a
 * limit, is damaged or uses a method other than stored/deflate.
 */
export function openJar(input, limits = JAR_LIMITS) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length > limits.jarBytes) throw new JarError('jar.too_big', { bytes: bytes.length, limit: limits.jarBytes });
  if (bytes.length < 22) throw new JarError('jar.not_zip');
  const end = findEnd(bytes);
  if (end < 0) throw new JarError('jar.not_zip');
  const total = u16(bytes, end + 10);
  const cdSize = u32(bytes, end + 12);
  const cdOffset = u32(bytes, end + 16);
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff || (end >= 20 && u32(bytes, end - 20) === ZIP64_LOCATOR)) {
    throw new JarError('jar.zip64');
  }
  if (u16(bytes, end + 4) !== 0 || u16(bytes, end + 6) !== 0 || u16(bytes, end + 8) !== total) throw new JarError('jar.broken');
  if (total > limits.entries) throw new JarError('jar.too_many_entries', { entries: total, limit: limits.entries });
  if (cdOffset + cdSize > end) throw new JarError('jar.broken');
  const entries = [];
  const names = new Map();
  const skipped = [];
  let p = cdOffset;
  for (let i = 0; i < total; i++) {
    if (p + 46 > end || u32(bytes, p) !== CENTRAL) throw new JarError('jar.broken');
    const flags = u16(bytes, p + 8);
    const method = u16(bytes, p + 10);
    const crc = u32(bytes, p + 16);
    const compressed = u32(bytes, p + 20);
    const size = u32(bytes, p + 24);
    const nameLength = u16(bytes, p + 28);
    const extraLength = u16(bytes, p + 30);
    const commentLength = u16(bytes, p + 32);
    const local = u32(bytes, p + 42);
    if (p + 46 + nameLength + extraLength + commentLength > end) throw new JarError('jar.broken');
    const name = utf8.decode(bytes.subarray(p + 46, p + 46 + nameLength));
    p += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith('/')) continue;
    if (!safeName(name)) {
      skipped.push(name);
      continue;
    }
    if (names.has(name)) continue;
    const entry = { name, flags, method, crc, compressed, size, local };
    entries.push(entry);
    names.set(name, entry);
  }
  const cache = new Map();
  let unpacked = 0;
  const problems = skipped.length ? [{ level: 'warning', code: 'jar.unsafe_paths', args: { count: skipped.length, name: skipped[0] } }] : [];

  function read(name, { maxBytes = limits.entryBytes } = {}) {
    if (cache.has(name)) return cache.get(name);
    const e = names.get(name);
    if (!e) return null;
    if (e.flags & 1) throw new JarError('jar.encrypted', { name });
    if (e.method !== 0 && e.method !== 8) throw new JarError('jar.method', { name, method: e.method });
    if (e.size > maxBytes) throw new JarError('jar.entry_too_big', { name, bytes: e.size, limit: maxBytes });
    if (e.size > 0 && (e.compressed === 0 || e.size / e.compressed > limits.ratio)) {
      throw new JarError('jar.ratio', { name, ratio: e.compressed ? Math.round(e.size / e.compressed) : Infinity, limit: limits.ratio });
    }
    if (unpacked + e.size > limits.totalBytes) throw new JarError('jar.total_too_big', { limit: limits.totalBytes });
    const o = e.local;
    if (o + 30 > bytes.length || u32(bytes, o) !== LOCAL) throw new JarError('jar.corrupt', { name });
    const start = o + 30 + u16(bytes, o + 26) + u16(bytes, o + 28);
    if (start + e.compressed > bytes.length) throw new JarError('jar.corrupt', { name });
    const data = bytes.subarray(start, start + e.compressed);
    let out;
    if (e.method === 0) {
      if (e.compressed !== e.size) throw new JarError('jar.corrupt', { name });
      out = data.slice();
    } else {
      const r = inflateRaw(data, e.size);
      if (!r.bytes) throw new JarError(r.status === 'TOO_LARGE' ? 'jar.ratio' : 'jar.corrupt', { name, limit: limits.ratio });
      out = r.bytes;
    }
    if (out.length !== e.size || (crc32(out, 0, out.length) >>> 0) !== e.crc) throw new JarError('jar.corrupt', { name });
    unpacked += out.length;
    cache.set(name, out);
    return out;
  }

  return {
    bytes: bytes.length,
    entries,
    names,
    skipped,
    problems,
    has: (name) => names.has(name),
    list: () => [...names.keys()],
    read,
    unpacked: () => unpacked,
  };
}

/** Width and height of a PNG from its header, or null when the bytes are no PNG. */
export function pngSize(bytes) {
  if (!bytes || bytes.length < 24) return null;
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((v, i) => bytes[i] === v)) return null;
  if (String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]) !== 'IHDR') return null;
  const be = (o) => ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
  return { width: be(16), height: be(20) };
}

/**
 * Reads a JSON entry (at most JAR_LIMITS.jsonBytes) as text, or null when the jar lacks it. Throws a JarError when
 * the entry breaks a limit.
 */
export function readText(jar, name, limits = JAR_LIMITS) {
  const data = jar.read(name, { maxBytes: limits.jsonBytes });
  return data == null ? null : utf8.decode(data);
}

/** Reads a texture (at most 4 MiB, a PNG of at most 1024 px per edge), or throws a JarError. */
export function readTexture(jar, name, limits = JAR_LIMITS) {
  const data = jar.read(name, { maxBytes: limits.textureBytes });
  if (data == null) return null;
  const size = pngSize(data);
  if (!size) throw new JarError('jar.not_png', { name });
  if (size.width > limits.textureEdge || size.height > limits.textureEdge) {
    throw new JarError('jar.texture_too_big', { name, width: size.width, height: size.height, limit: limits.textureEdge });
  }
  return data;
}
