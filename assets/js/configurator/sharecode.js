// PW1 share codes: encoder and tolerant decoder, a port of the codec in "Propwash: Just More Parts"
// (spec: sharecode.md revision 1.2). Uncompressed codes are byte-identical to the mod's; compressed codes too,
// because the vendored deflate is a zlib port (level 9, raw).
//
// Content shape used by encode() and returned by decode():
//   {
//     build: { frame, stack, motor, prop, video, battery, accessories: { top?, bottom? } },   // part ids
//     paint: { <slot>: '#rrggbb' } | null,      // encode also accepts 0xRRGGBB numbers
//     tune:  { <flight or camera key>: number } | null,   // float32 values, keys sorted
//     osd:   { version, json } | null,
//     name:  string | null,
//   }
// Ids from a namespace number this decoder does not know appear as '?<ns>:<path>' and are written back with the
// same number.

import { crc32 } from './crc32.js';
import { inflateRaw } from './inflate.js';
import { TUNE_KEYS, tuneIndex, isSharedKey } from './tune.js';
import { deflateRaw } from '../../vendor/pako/deflate.js';

export const FORMAT = 'PW1';
export const PREFIX = 'PW1-';
export const REVISION = '1.2';
export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const GROUP_LENGTH = 5;
export const LAYERS = Object.freeze(['parts', 'paint', 'tune', 'osd', 'name']);
export const NAMESPACES = Object.freeze(['', 'propwash', 'justmoreparts']);
export const ACCESSORY_SLOTS = Object.freeze(['top', 'bottom']);
export const PAINT_SLOTS = Object.freeze(['frame', 'tpu', 'motors', 'prop_fl', 'prop_fr', 'prop_rl', 'prop_rr', 'stack', 'battery',
  'camera', 'antenna', 'accessories']);
export const BUILD_FIELDS = Object.freeze(['frame', 'stack', 'motor', 'prop', 'video', 'battery']);
export const LIMITS = Object.freeze({
  inputChars: 4000,
  frameBytes: 2500,
  minFrameBytes: 7,
  payloadBytes: 16384,
  tuneEntries: 256,
  tuneKeyChars: 64,
  osdChars: 8192,
  nameChars: 48,
  pathChars: 128,
  namespaceChars: 64,
});
export const STATUSES = Object.freeze(['OK', 'EMPTY', 'INVALID_PREFIX', 'BAD_CHARACTER', 'TOO_LONG', 'TRUNCATED', 'CHECKSUM',
  'UNSUPPORTED_VERSION', 'TOO_LARGE', 'CORRUPT']);

const FRAME_VERSION = 1;
const FLAG_DEFLATE = 1;
const PAINT_SLOT_BITS = 16;
const HARD_INPUT_LIMIT = 65536;
const TWO_31 = 2147483648;
const UNKNOWN_ID = /^\?(\d{1,10}):(.+)$/;

// ---------------------------------------------------------------------------------------------------------------
// Text helpers with Java semantics

// Character.isWhitespace(c): Unicode space separators except the no-break spaces, plus the ASCII controls below.
function isJavaWhitespace(ch) {
  return /[\t\n\u000B\f\r\u001C-\u001F\p{Zl}\p{Zp}]/u.test(ch) || (/\p{Zs}/u.test(ch) && !/[   ]/.test(ch));
}

// Character.isWhitespace(c) || Character.isSpaceChar(c): what the decoder drops from the input.
const INPUT_SPACE = /[\t\n\u000B\f\r\u001C-\u001F\p{Zs}\p{Zl}\p{Zp}]/gu;

/** String#strip() in Java. */
export function javaStrip(text) {
  let start = 0;
  let end = text.length;
  while (start < end && isJavaWhitespace(text[start])) start++;
  while (end > start && isJavaWhitespace(text[end - 1])) end--;
  return text.slice(start, end);
}

// String#getBytes(UTF_8): unpaired surrogates become '?'.
function utf8Encode(text) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    let c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const d = text.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      }
    }
    if (c >= 0xd800 && c <= 0xdfff) {
      out.push(0x3f);
    } else if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    } else if (c < 0x10000) {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    } else {
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
  }
  return out;
}

const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

function onlyIdChars(text) {
  return /^[a-z0-9_.-]*$/.test(text);
}

export function validPath(path) {
  return typeof path === 'string' && path.length >= 1 && path.length <= LIMITS.pathChars && onlyIdChars(path);
}

export function validNamespace(namespace) {
  return typeof namespace === 'string' && namespace.length >= 1 && namespace.length <= LIMITS.namespaceChars
    && onlyIdChars(namespace) && namespace !== '..';
}

/** Namespace number of an id read from an unknown namespace ('?<ns>:<path>'), else -1. */
export function unknownNamespaceIndex(id) {
  const m = UNKNOWN_ID.exec(id);
  if (!m) return -1;
  const ns = Number(m[1]);
  return ns >= NAMESPACES.length && ns <= 0xffffffff ? ns : -1;
}

function splitId(id) {
  if (typeof id !== 'string') throw new Error(`part id expected: ${id}`);
  const colon = id.indexOf(':');
  return colon < 0 ? ['minecraft', id] : [id.slice(0, colon), id.slice(colon + 1)];
}

// ---------------------------------------------------------------------------------------------------------------
// Bytes

class Writer {
  constructor() {
    this.bytes = [];
  }

  u8(v) {
    this.bytes.push(v & 0xff);
    return this;
  }

  u16(v) {
    return this.u8(v >>> 8).u8(v);
  }

  u32(v) {
    return this.u8(v >>> 24).u8(v >>> 16).u8(v >>> 8).u8(v);
  }

  varint(value) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new Error(`varint out of range: ${value}`);
    let rest = value;
    for (;;) {
      const b = rest % 128;
      rest = Math.floor(rest / 128);
      if (rest !== 0) {
        this.bytes.push(b | 0x80);
      } else {
        this.bytes.push(b);
        return this;
      }
    }
  }

  zigzag(q) {
    return this.varint(q >= 0 ? 2 * q : -2 * q - 1);
  }

  f32(value) {
    const view = new DataView(new ArrayBuffer(4));
    view.setFloat32(0, value);
    for (let i = 0; i < 4; i++) this.bytes.push(view.getUint8(i));
    return this;
  }

  str(text) {
    const data = utf8Encode(text);
    this.varint(data.length);
    for (const b of data) this.bytes.push(b);
    return this;
  }

  raw(data) {
    for (const b of data) this.bytes.push(b);
    return this;
  }

  block(data) {
    this.varint(data.length);
    return this.raw(data);
  }
}

class Fail {
  constructor(status) {
    this.status = status;
  }
}

class Reader {
  constructor(data, start = 0, end = data.length) {
    this.data = data;
    this.pos = start;
    this.end = end;
  }

  remaining() {
    return this.end - this.pos;
  }

  atEnd() {
    return this.pos === this.end;
  }

  u8() {
    if (this.pos >= this.end) throw new Fail('TRUNCATED');
    return this.data[this.pos++];
  }

  u16() {
    return (this.u8() << 8) | this.u8();
  }

  varint() {
    let value = 0;
    let scale = 1;
    for (let i = 0; i < 5; i++) {
      const b = this.u8();
      value += (b & 0x7f) * scale;
      scale *= 128;
      if ((b & 0x80) === 0) {
        if (value > 0xffffffff) throw new Fail('CORRUPT');
        return value;
      }
    }
    throw new Fail('CORRUPT');
  }

  zigzag() {
    const raw = this.varint();
    return raw % 2 === 0 ? raw / 2 : -(raw + 1) / 2;
  }

  f32() {
    const view = new DataView(new ArrayBuffer(4));
    for (let i = 0; i < 4; i++) view.setUint8(i, this.u8());
    return view.getFloat32(0);
  }

  length() {
    const length = this.varint();
    if (length > this.remaining()) throw new Fail('TRUNCATED');
    return length;
  }

  block() {
    const length = this.length();
    const inner = new Reader(this.data, this.pos, this.pos + length);
    this.pos += length;
    return inner;
  }

  str() {
    const length = this.length();
    let text;
    try {
      text = UTF8.decode(this.data.subarray(this.pos, this.pos + length));
    } catch {
      throw new Fail('CORRUPT');
    }
    this.pos += length;
    return text;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Base32 (Crockford alphabet, MSB first, 5-character groups)

export function base32Encode(bytes) {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const b of bytes) {
    buffer = (buffer << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(buffer >>> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET[(buffer << (5 - bits)) & 31];
  return out;
}

export function group(symbols) {
  const parts = [];
  for (let i = 0; i < symbols.length; i += GROUP_LENGTH) parts.push(symbols.slice(i, i + GROUP_LENGTH));
  return parts.join('-');
}

const VALUES = (() => {
  const values = new Int8Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) values[ALPHABET.charCodeAt(i)] = i;
  values['O'.charCodeAt(0)] = 0;
  values['I'.charCodeAt(0)] = 1;
  values['L'.charCodeAt(0)] = 1;
  return values;
})();

function base32Decode(symbols) {
  const out = new Uint8Array(Math.floor((symbols.length * 5) / 8));
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (let i = 0; i < symbols.length; i++) {
    const c = symbols.charCodeAt(i);
    const value = c < 128 ? VALUES[c] : -1;
    if (value < 0) throw new Fail('BAD_CHARACTER');
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out[index++] = (buffer >>> bits) & 0xff;
      buffer &= (1 << bits) - 1;
    }
  }
  if (buffer !== 0) throw new Fail('CORRUPT');
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Content normalisation (ShareContent)

function colorValue(value, slot) {
  let rgb;
  if (typeof value === 'number') {
    rgb = value;
  } else if (typeof value === 'string' && /^#?[0-9a-fA-F]{6}$/.test(value)) {
    rgb = parseInt(value.replace('#', ''), 16);
  } else {
    throw new Error(`paint colour must be #rrggbb: ${slot}=${value}`);
  }
  if (!Number.isInteger(rgb) || rgb < 0 || rgb > 0xffffff) throw new Error(`paint colour is RGB without alpha: ${slot}`);
  return rgb;
}

export function hexColor(rgb) {
  return '#' + rgb.toString(16).padStart(6, '0');
}

/**
 * Normalises content like the mod's ShareContent: empty paint and an empty or blank name are dropped, the tune keeps
 * only flight keys and the camera angle (float32 values), the name is stripped. Throws Error for content the mod could not encode.
 */
export function normalizeContent(content) {
  if (!content || !content.build) throw new Error('content.build is required');
  const b = content.build;
  const build = {};
  for (const field of BUILD_FIELDS) {
    if (typeof b[field] !== 'string') throw new Error(`build.${field} is required`);
    build[field] = b[field];
  }
  build.accessories = {};
  for (const [slot, id] of Object.entries(b.accessories || {})) {
    if (id == null) continue;
    if (!ACCESSORY_SLOTS.includes(slot)) throw new Error(`accessory slot without PW1 number: ${slot}`);
  }
  for (const slot of ACCESSORY_SLOTS) {
    if (b.accessories && b.accessories[slot] != null) build.accessories[slot] = b.accessories[slot];
  }

  let paint = null;
  if (content.paint) {
    const colors = {};
    for (const slot of Object.keys(content.paint)) {
      if (!PAINT_SLOTS.includes(slot)) throw new Error(`unknown paint slot: ${slot}`);
    }
    for (const slot of PAINT_SLOTS) {
      const value = content.paint[slot];
      if (value != null) colors[slot] = hexColor(colorValue(value, slot));
    }
    if (Object.keys(colors).length) paint = colors;
  }

  let tune = null;
  if (content.tune) {
    tune = {};
    const keys = Object.keys(content.tune).sort();
    for (const key of keys) {
      const value = content.tune[key];
      if (key.length === 0 || key.length > LIMITS.tuneKeyChars) throw new Error(`tune key must have 1-64 characters: ${key}`);
      if (typeof value !== 'number' || !Number.isFinite(Math.fround(value))) throw new Error(`tune value must be finite: ${key}`);
      if (isSharedKey(key)) tune[key] = Math.fround(value);
    }
    if (keys.length > LIMITS.tuneEntries) throw new Error(`at most ${LIMITS.tuneEntries} tune values`);
  }

  let osd = null;
  if (content.osd) {
    const { version, json } = content.osd;
    if (!Number.isInteger(version) || version < 1 || version > 0x7fffffff) throw new Error('OSD schema version must be at least 1');
    if (typeof json !== 'string' || json.length > LIMITS.osdChars) throw new Error('OSD JSON too long');
    osd = { version, json };
  }

  let name = null;
  if (typeof content.name === 'string') {
    const stripped = javaStrip(content.name);
    if (stripped.length > LIMITS.nameChars) throw new Error(`name has at most ${LIMITS.nameChars} characters`);
    if (stripped) name = stripped;
  }
  return { build, paint, tune, osd, name };
}

/** Layers a (normalised) content fills. */
export function contentLayers(content) {
  const layers = ['parts'];
  if (content.paint) layers.push('paint');
  if (content.tune) layers.push('tune');
  if (content.osd) layers.push('osd');
  if (content.name) layers.push('name');
  return layers;
}

// ---------------------------------------------------------------------------------------------------------------
// Encoding

function writeRef(out, id) {
  const unknown = unknownNamespaceIndex(id);
  if (unknown >= 0) {
    const path = id.slice(id.indexOf(':') + 1);
    if (!validPath(path)) throw new Error(`part id not PW1-safe: ${id}`);
    out.varint(unknown).str(path);
    return;
  }
  const [namespace, path] = splitId(id);
  if (!validPath(path)) throw new Error(`part id not PW1-safe: ${id}`);
  const index = NAMESPACES.indexOf(namespace);
  if (index > 0) {
    out.varint(index).str(path);
    return;
  }
  if (!validNamespace(namespace)) throw new Error(`namespace not PW1-safe: ${id}`);
  out.varint(0).str(namespace).str(path);
}

// Math.round-based scaling exactly like ShareCodec.scaled(float): q or null for "write raw float32".
function scaled(value) {
  if (!Number.isFinite(value)) return null;
  const product = value * 1000.0;
  if (Math.abs(product) >= 2147483647.5) return null;
  const q = Math.round(product) + 0; // + 0 turns -0 into 0 like Java's long
  if (Math.abs(q) >= TWO_31) return null;
  return Object.is(Math.fround(q / 1000.0), value) ? q : null;
}

function payload(content) {
  let mask = 1;
  const blocks = [];
  const parts = new Writer();
  for (const field of BUILD_FIELDS) writeRef(parts, content.build[field]);
  const used = ACCESSORY_SLOTS.filter((slot) => content.build.accessories[slot] != null);
  parts.u8(used.length);
  for (const slot of used) {
    parts.u8(ACCESSORY_SLOTS.indexOf(slot));
    writeRef(parts, content.build.accessories[slot]);
  }
  blocks.push(parts.bytes);

  if (content.paint) {
    mask |= 2;
    let bits = 0;
    const colors = new Writer();
    PAINT_SLOTS.forEach((slot, i) => {
      const value = content.paint[slot];
      if (value == null) return;
      bits |= 1 << i;
      const rgb = colorValue(value, slot);
      colors.u8(rgb >>> 16).u8(rgb >>> 8).u8(rgb);
    });
    blocks.push(new Writer().u16(bits).raw(colors.bytes).bytes);
  }

  if (content.tune) {
    mask |= 4;
    const entries = Object.keys(content.tune)
      .filter(isSharedKey)
      .map((key) => ({ key, index: tuneIndex(key), value: Math.fround(content.tune[key]) }));
    entries.sort((a, b) => {
      const ia = a.index === 0 ? Infinity : a.index;
      const ib = b.index === 0 ? Infinity : b.index;
      if (ia !== ib) return ia - ib;
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    });
    const out = new Writer().varint(entries.length);
    for (const { key, index, value } of entries) {
      const q = scaled(value);
      out.varint(index * 2 + (q === null ? 1 : 0));
      if (index === 0) out.str(key);
      if (q === null) out.f32(value);
      else out.zigzag(q);
    }
    blocks.push(out.bytes);
  }

  if (content.osd) {
    mask |= 8;
    blocks.push(new Writer().varint(content.osd.version).str(content.osd.json).bytes);
  }

  if (content.name) {
    mask |= 16;
    blocks.push(new Writer().str(content.name).bytes);
  }

  const out = new Writer().varint(mask);
  for (const block of blocks) out.block(block);
  return Uint8Array.from(out.bytes);
}

/**
 * Encodes content as a PW1 share code.
 * @param {object} content see the shape at the top of this file (normalised first)
 * @param {{compression?: 'auto' | 'never' | 'always'}} [options]
 * @returns {string} 'PW1-XXXXX-…'
 */
export function encode(content, { compression = 'auto' } = {}) {
  const normal = normalizeContent(content);
  const data = payload(normal);
  let stored = data;
  let flags = 0;
  if (compression !== 'never') {
    const packed = deflateRaw(data);
    if (compression === 'always' || packed.length < data.length) {
      stored = packed;
      flags = FLAG_DEFLATE;
    }
  }
  const frame = new Uint8Array(stored.length + 6);
  frame[0] = FRAME_VERSION;
  frame[1] = flags;
  frame.set(stored, 2);
  const crc = crc32(frame, 0, stored.length + 2);
  const end = stored.length + 2;
  frame[end] = crc >>> 24;
  frame[end + 1] = (crc >>> 16) & 0xff;
  frame[end + 2] = (crc >>> 8) & 0xff;
  frame[end + 3] = crc & 0xff;
  return PREFIX + group(base32Encode(frame));
}

/** Short enough for the mod's import field (4000 characters). */
export function fits(code) {
  return typeof code === 'string' && code.length <= LIMITS.inputChars;
}

// ---------------------------------------------------------------------------------------------------------------
// Decoding

function readRef(r, parsed) {
  const ns = r.varint();
  let namespace = null;
  if (ns === 0) {
    namespace = r.str();
    if (!validNamespace(namespace)) throw new Fail('CORRUPT');
  } else if (ns < NAMESPACES.length) {
    namespace = NAMESPACES[ns];
  }
  const path = r.str();
  if (!validPath(path)) throw new Fail('CORRUPT');
  if (namespace === null) {
    const marker = `namespace:${ns}`;
    if (!parsed.skipped.includes(marker)) parsed.skipped.push(marker);
    return `?${ns}:${path}`;
  }
  return `${namespace}:${path}`;
}

function readParts(r, parsed) {
  const ids = [];
  for (let i = 0; i < BUILD_FIELDS.length; i++) ids.push(readRef(r, parsed));
  const accessories = {};
  const count = r.u8();
  for (let i = 0; i < count; i++) {
    const slot = r.u8();
    const id = readRef(r, parsed);
    if (slot >= ACCESSORY_SLOTS.length) {
      parsed.skipped.push(`accessory_slot:${slot}`);
      continue;
    }
    const key = ACCESSORY_SLOTS[slot];
    if (key in accessories) parsed.skipped.push(`accessory_slot_duplicate:${slot}`);
    accessories[key] = id;
  }
  parsed.parts = ids;
  parsed.accessories = accessories;
}

function readPaint(r, parsed) {
  const bits = r.u16();
  const colors = {};
  for (let i = 0; i < PAINT_SLOT_BITS; i++) {
    if ((bits & (1 << i)) === 0) continue;
    const rgb = (r.u8() << 16) | (r.u8() << 8) | r.u8();
    if (i < PAINT_SLOTS.length) colors[PAINT_SLOTS[i]] = rgb;
    else parsed.skipped.push(`paint_slot:${i}`);
  }
  parsed.paint = colors;
}

function readTune(r, parsed) {
  const count = r.varint();
  if (count > LIMITS.tuneEntries) throw new Fail('CORRUPT');
  const values = new Map();
  for (let i = 0; i < count; i++) {
    const head = r.varint();
    const index = Math.floor(head / 2);
    const raw = head % 2 === 1;
    let key;
    if (index === 0) {
      key = r.str();
      if (key.length === 0 || key.length > LIMITS.tuneKeyChars) throw new Fail('CORRUPT');
    } else {
      key = index <= TUNE_KEYS.length ? TUNE_KEYS[index - 1] : null;
    }
    const value = raw ? r.f32() : Math.fround(r.zigzag() / 1000.0);
    if (!Number.isFinite(value)) throw new Fail('CORRUPT');
    if (key === null) {
      parsed.skipped.push(`tune_index:${index}`);
      continue;
    }
    if (!isSharedKey(key)) {
      parsed.skipped.push(`tune_key:${key}`);
      continue;
    }
    if (values.has(key)) parsed.skipped.push(`tune_duplicate:${key}`);
    values.set(key, value);
  }
  const tune = {};
  for (const key of [...values.keys()].sort()) tune[key] = values.get(key);
  parsed.tune = tune;
}

function readOsd(r, parsed) {
  const version = r.varint();
  const json = r.str();
  if (version < 1 || version > 0x7fffffff || json.length > LIMITS.osdChars) throw new Fail('CORRUPT');
  parsed.osd = { version, json };
}

function readName(r, parsed) {
  const name = javaStrip(r.str());
  if (name.length === 0 || name.length > LIMITS.nameChars) throw new Fail('CORRUPT');
  parsed.name = name;
}

const READERS = [readParts, readPaint, readTune, readOsd, readName];

function resolveAlias(id, aliases) {
  let current = id;
  for (let i = 0; i < 8; i++) {
    const next = aliases.get(current);
    if (next == null || next === current) return current;
    current = next;
  }
  return current;
}

function failed(status) {
  return { status, ok: false, content: null, layers: [], unknownParts: [], wrongKind: [], renamed: [], skipped: [] };
}

function toAliasMap(aliases) {
  if (!aliases) return new Map();
  if (aliases instanceof Map) return aliases;
  if (Array.isArray(aliases)) return new Map(aliases.map((a) => [a.from, a.to]));
  return new Map(Object.entries(aliases));
}

/**
 * Decodes a share code (tolerant: whitespace, lower case, O/I/L and missing dashes are fine). Never throws.
 * @param {string} code
 * @param {{lookup?: (id: string) => string | null, aliases?: Map|Array|object}} [options]
 *   lookup returns the category of a known part id ('frame', 'motor', …) or null; aliases are old id → new id.
 * @returns {{status: string, ok: boolean, content: object|null, layers: string[], unknownParts: string[],
 *   wrongKind: string[], renamed: {from: string, to: string}[], skipped: string[]}}
 */
export function decode(code, { lookup = () => null, aliases = null } = {}) {
  try {
    return decodeChecked(code, lookup, toAliasMap(aliases));
  } catch (e) {
    if (e instanceof Fail) return failed(e.status);
    return failed('CORRUPT');
  }
}

function decodeChecked(code, lookup, aliases) {
  if (code == null) return failed('EMPTY');
  const input = String(code);
  if (input.length > HARD_INPUT_LIMIT) return failed('TOO_LONG');
  const s = input.replace(INPUT_SPACE, '').toUpperCase();
  if (!s) return failed('EMPTY');
  if (s.length > LIMITS.inputChars) return failed('TOO_LONG');
  if (!s.startsWith(FORMAT)) return failed('INVALID_PREFIX');
  const frame = base32Decode(s.slice(FORMAT.length).replace(/-/g, ''));
  if (frame.length > LIMITS.frameBytes) return failed('TOO_LARGE');
  if (frame.length < LIMITS.minFrameBytes) return failed('TRUNCATED');
  const bodyEnd = frame.length - 4;
  const stored = ((frame[bodyEnd] << 24) | (frame[bodyEnd + 1] << 16) | (frame[bodyEnd + 2] << 8) | frame[bodyEnd + 3]) >>> 0;
  if (crc32(frame, 0, bodyEnd) !== stored) return failed('CHECKSUM');
  if (frame[0] !== FRAME_VERSION || (frame[1] & ~FLAG_DEFLATE) !== 0) return failed('UNSUPPORTED_VERSION');
  let data = frame.slice(2, bodyEnd);
  if (frame[1] & FLAG_DEFLATE) {
    const inflated = inflateRaw(data, LIMITS.payloadBytes);
    if (!inflated.bytes) return failed(inflated.status);
    data = inflated.bytes;
  } else if (data.length > LIMITS.payloadBytes) {
    return failed('TOO_LARGE');
  }
  return parse(data, lookup, aliases);
}

function parse(data, lookup, aliases) {
  const reader = new Reader(data);
  const mask = reader.varint();
  if ((mask & 1) === 0) throw new Fail('CORRUPT');
  const parsed = { layers: [], skipped: [], parts: null, accessories: {}, paint: null, tune: null, osd: null, name: null };
  for (let bit = 0; bit < 32; bit++) {
    if (((mask >>> bit) & 1) === 0) continue;
    const block = reader.block();
    if (bit >= LAYERS.length) {
      parsed.skipped.push(`layer:${bit}`);
      continue;
    }
    parsed.layers.push(LAYERS[bit]);
    READERS[bit](block, parsed);
    if (!block.atEnd()) throw new Fail('CORRUPT');
  }
  if (!reader.atEnd()) throw new Fail('CORRUPT');
  if (!parsed.parts) throw new Fail('CORRUPT');

  const renamed = new Map();
  const alias = (id) => {
    if (unknownNamespaceIndex(id) >= 0) return id;
    const resolved = resolveAlias(id, aliases);
    if (resolved !== id && !renamed.has(id)) renamed.set(id, { from: id, to: resolved });
    return resolved;
  };
  const ids = parsed.parts.map(alias);
  const build = {};
  BUILD_FIELDS.forEach((field, i) => {
    build[field] = ids[i];
  });
  build.accessories = {};
  for (const slot of ACCESSORY_SLOTS) {
    if (slot in parsed.accessories) build.accessories[slot] = alias(parsed.accessories[slot]);
  }

  const unknown = [];
  const wrong = [];
  const classify = (id, expected) => {
    if (unknownNamespaceIndex(id) >= 0) {
      if (!unknown.includes(id)) unknown.push(id);
      return;
    }
    let kind = null;
    try {
      kind = lookup(id) || null;
    } catch {
      kind = null;
    }
    if (!kind) {
      if (!unknown.includes(id)) unknown.push(id);
    } else if (kind !== expected) {
      if (!wrong.includes(id)) wrong.push(id);
    }
  };
  BUILD_FIELDS.forEach((field) => classify(build[field], field));
  for (const slot of ACCESSORY_SLOTS) {
    if (build.accessories[slot] != null) classify(build.accessories[slot], 'accessory');
  }

  let paint = null;
  if (parsed.paint) {
    const colors = {};
    for (const slot of PAINT_SLOTS) if (slot in parsed.paint) colors[slot] = hexColor(parsed.paint[slot]);
    // An empty PAINT block means "original colours" (ShareContent drops it).
    if (Object.keys(colors).length) paint = colors;
  }

  return {
    status: 'OK',
    ok: true,
    content: { build, paint, tune: parsed.tune, osd: parsed.osd, name: parsed.name },
    layers: parsed.layers,
    unknownParts: unknown,
    wrongKind: wrong,
    renamed: [...renamed.values()],
    skipped: parsed.skipped,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Links

/** Share link for a code: '<page>#PW1-…'. */
export function shareLink(code, pageUrl) {
  const base = String(pageUrl).split('#')[0];
  return `${base}#${code}`;
}

/** The code in a location hash ('#PW1-…', also URL-encoded or lower case), or null. */
export function codeFromHash(hash) {
  if (!hash) return null;
  let text = String(hash).replace(/^#/, '');
  try {
    text = decodeURIComponent(text);
  } catch {
    return null;
  }
  text = text.trim();
  return /^pw1/i.test(text) ? text : null;
}
