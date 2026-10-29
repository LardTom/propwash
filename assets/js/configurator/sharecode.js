// Share codes: the entry point that reads PW1, PW2, PW3 and the old PWD1 codes of the drone editor and writes PW3
// (ShareFormat of Propwash 0.6.0), the PW1 codec (pw1.md of Propwash, revision 1.2, frozen): the reader of Propwash
// (share.legacy.Pw1Reader) and the encoder of Just More Parts 1.0 (only for the tests), and the PWD1 reader
// (creative.CreativeShareCode, share.CreativeShare: pw3.md 7.1). PW2 lives in sharecode2.js, PW3 in sharecode3.js.
// Uncompressed PW1 codes are byte-identical to the mod's; compressed codes too, because the vendored deflate is a zlib
// port (level 9, raw).
//
// Content shape used by encode() and returned by decode():
//   {
//     build: { frame, stack, motor, prop, video, battery, accessories: { top?, bottom?, front? } },   // part ids
//     paint: { <slot>: '#rrggbb' } | null,      // encode also accepts 0xRRGGBB numbers
//     tune:  { <flight or camera key>: number } | null,   // float32 values, keys sorted
//     osd:   { version, json } | null,
//     name:  string | null,
//     creative: { base: { frame?, stack?, motor?, prop?, battery? }, values: { <key>: number } } | null,  // PW3 3.1
//   }
// creative: the values of a creative drone (drone editor of the game; sharecode3.js normalizeCreative), written as the
// PW3 layer CREATIVE; an old PWD1 code reads as the Flight School's freestyle drone with the creative flight controller
// and its values (sharecode3.js PWD1_BUILD), like in the mod.
// Parts the reader cannot resolve keep the mod's marker ids: 'pw1.unknown.<n>:<path>' (PW1 namespace number n),
// 'pw2.unknown:<kind>.<n>' (PW2 table number n) and 'pw3.unknown:<namespace>/<kind>/<n>' (sharecode3.js); displayId()
// shows them as '?…'. PW3 needs the parts tables of the installed namespaces (createShareTables in sharecode3.js, the
// catalog builds them from the web export); without tables every part is written by name.

import { crc32 } from './crc32.js?v=62ad0fa2';
import { inflateRaw } from './inflate.js?v=08050593';
import { TUNE_KEYS, tuneIndex, isSharedKey } from './tune.js?v=f4084d0e';
import { deflateRaw } from '../../vendor/pako/deflate.js';
import { encodePw2, parsePw2, PW2_FORMAT } from './sharecode2.js?v=024bd980';
import {
  encodePw3, parsePw3, createShareTables, ShareError, unknownMarker, base62Only, displayId, PW3_FORMAT, PW3_PREFIX, splitId as idParts,
  normalizeCreative, PWD1_BUILD,
} from './sharecode3.js?v=024bd980';

export { displayId, createShareTables, frozenTables, ShareError, PW3_FORMAT, PW3_PREFIX } from './sharecode3.js?v=024bd980';

/** Format of new codes. Decoding reads PW1, PW2 and PW3; the site writes PW3 only (Propwash 0.6.0). */
export const SHARE_FORMAT = 'PW3';

export const FORMAT = 'PW1';
export const PREFIX = 'PW1-';
export const REVISION = '1.2';
export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const GROUP_LENGTH = 5;
export const LAYERS = Object.freeze(['parts', 'paint', 'tune', 'osd', 'name']);
export const NAMESPACES = Object.freeze(['', 'propwash', 'justmoreparts']);
export const ACCESSORY_SLOTS = Object.freeze(['top', 'bottom', 'front']);
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
  'UNSUPPORTED_VERSION', 'TOO_LARGE', 'CORRUPT', 'OTHER_CODE', 'NOT_CONVERTIBLE', 'UNKNOWN_ENTRIES']);
/** Other codes of Propwash that are no share codes (ShareFormat.TUNE_PRESET). */
export const OTHER_CODES = Object.freeze(['PWT1']);
/** Codes of the drone editor up to Propwash 0.5.x (ShareFormat.DRONE_EDITOR): read and converted since PW3 revision 3.1. */
export const DRONE_EDITOR = 'PWD1';
export const PWD1_PREFIX = 'PWD1-';
const PWD1_MAX_CODE_CHARS = 4096;
const PWD1_MAX_TEXT_BYTES = 16384;
const PART_KINDS = Object.freeze(['frame', 'stack', 'motor', 'prop', 'video', 'battery', 'accessory']);
const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const FRAME_VERSION = 1;
const FLAG_DEFLATE = 1;
const PAINT_SLOT_BITS = 16;
const HARD_INPUT_LIMIT = 65536;
const TWO_31 = 2147483648;
const UNKNOWN_ID = /^pw1\.unknown\.(\d{1,10}):(.+)$/;

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
export function utf8Encode(text) {
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

/** Namespace number of an id read from an unknown PW1 namespace ('pw1.unknown.<ns>:<path>'), else -1. */
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

export class Fail {
  constructor(status) {
    this.status = status;
    this.shareFail = true;
  }
}

/** A Fail of any copy of this module (the tests load the modules with and without the cache-busting stamps). */
const isFail = (e) => !!(e && e.shareFail === true);

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
  const creative = content.creative == null ? null : normalizeCreative(content.creative);
  return { build, paint, tune, osd, name, creative };
}

/** Layers a (normalised) content fills. */
export function contentLayers(content) {
  const layers = ['parts'];
  if (content.paint) layers.push('paint');
  if (content.tune) layers.push('tune');
  if (content.osd) layers.push('osd');
  if (content.name) layers.push('name');
  if (content.creative) layers.push('creative');
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
 * Encodes content as a share code in SHARE_FORMAT (or the given format).
 * @param {object} content see the shape at the top of this file (normalised first)
 * @param {{format?: 'PW3' | 'PW2' | 'PW1', tables?: object, info?: 'AUTO' | 'ALWAYS' | 'NEVER', carry?: Map,
 *   compression?: 'auto' | 'never' | 'always'}} [options] tables, info and carry only apply to PW3 (sharecode3.js
 *   encodePw3), compression only to PW1 (PW2 and PW3 deflate the OSD layout by themselves when that is shorter); PW1
 *   and PW2 are written only for the tests
 * @returns {string} 'PW3-…', 'PW2…' or 'PW1-XXXXX-…'
 * @throws {ShareError|Error} for content the mod could not encode
 */
export function encode(content, { format = SHARE_FORMAT, tables = null, info = 'AUTO', carry = null, compression = 'auto' } = {}) {
  const normal = normalizeContent(content);
  if (format === PW3_FORMAT) return encodePw3(normal, tables || noTables(), { info, carry });
  if (format === PW2_FORMAT) return encodePw2(normal);
  if (format !== FORMAT) throw new Error(`unknown share code format: ${format}`);
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
    return `pw1.unknown.${ns}:${path}`;
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

// Tables of a reader without any parts table (lazy: sharecode3.js may not be evaluated yet while the modules load).
let emptyTables = null;
const noTables = () => emptyTables || (emptyTables = createShareTables());

function failed(status, format = '') {
  return {
    status, ok: false, format, content: null, layers: [], namespaces: [], unknownParts: [], wrongKind: [], renamed: [], skipped: [],
    inactiveParts: [], carry: new Map(),
  };
}

/** ShareFormat.compact: the text without blanks (Character.isWhitespace or isSpaceChar). */
export function compact(code) {
  return String(code).replace(INPUT_SPACE, '');
}

function withoutDashes(text, from) {
  return text.slice(from).replace(/-/g, '');
}

// 'PW4…' and later: a code from a newer version.
function newerFormat(upper) {
  const m = /^PW([0-9]{1,3})/.exec(upper);
  return !!m && Number(m[1]) > 3;
}

/**
 * ShareFormat.detect: what a text is, before reading it: {status ('OK', 'EMPTY', 'TOO_LONG', 'OTHER_CODE',
 * 'UNSUPPORTED_VERSION', 'INVALID_PREFIX'), format ('PW1', 'PW2', 'PW3', 'PWT1', 'PWD1' or ''), symbols (the body)}.
 * A bare Base62 body counts as PW3.
 */
export function detect(code) {
  if (code == null) return { status: 'EMPTY', format: '', symbols: '' };
  const input = String(code);
  if (input.length > HARD_INPUT_LIMIT) return { status: 'TOO_LONG', format: '', symbols: '' };
  const text = compact(input);
  if (!text) return { status: 'EMPTY', format: '', symbols: '' };
  if (text.length > LIMITS.inputChars) return { status: 'TOO_LONG', format: '', symbols: '' };
  const upper = text.toUpperCase();
  if (upper.startsWith(PW3_FORMAT)) return { status: 'OK', format: PW3_FORMAT, symbols: withoutDashes(text, PW3_FORMAT.length) };
  if (upper.startsWith(PW2_FORMAT)) return { status: 'OK', format: PW2_FORMAT, symbols: withoutDashes(text, PW2_FORMAT.length) };
  if (upper.startsWith(FORMAT)) return { status: 'OK', format: FORMAT, symbols: withoutDashes(upper, FORMAT.length) };
  for (const other of OTHER_CODES) if (upper.startsWith(other)) return { status: 'OTHER_CODE', format: other, symbols: '' };
  if (upper.startsWith(DRONE_EDITOR)) return { status: 'OK', format: DRONE_EDITOR, symbols: text };
  if (newerFormat(upper)) return { status: 'UNSUPPORTED_VERSION', format: '', symbols: '' };
  if (base62Only(text)) return { status: 'OK', format: PW3_FORMAT, symbols: text };
  return { status: 'INVALID_PREFIX', format: '', symbols: '' };
}

/**
 * Decodes a share code (tolerant: whitespace, dashes, a bare PW3 body; PW1 also lower case and O/I/L). Never throws.
 * @param {string} code
 * @param {{tables?: object, renames?: boolean}} [options] tables: what the reader knows (sharecode3.js
 *   createShareTables: parts tables, directory, versions and the part lookup); renames: follow replaced_by of
 *   deprecated table entries (ShareFormat.decode)
 * @returns {{status: string, ok: boolean, format: string, content: object|null, layers: string[],
 *   namespaces: object[], unknownParts: string[], wrongKind: string[], renamed: {from: string, to: string}[],
 *   skipped: string[], inactiveParts: string[], carry: Map}} namespaces: PW3 only, one report per namespace of the
 *   code as in the golden files (index, namespace, short_id, table, checksum, min_version, name, link_type, link,
 *   installed_version, result, used); carry: the heads to write unknown parts back (encode's carry)
 */
export function decode(code, { tables = null, renames = true } = {}) {
  const t = tables || noTables();
  const detected = detect(code);
  if (detected.status !== 'OK') return failed(detected.status, detected.format);
  const whole = compact(code);
  const result = decodeDetected(detected, t, renames);
  if (!result.ok && detected.symbols !== whole && base62Only(whole)) {
    const bare = decodeDetected({ status: 'OK', format: PW3_FORMAT, symbols: whole }, t, renames);
    if (bare.ok) return bare;
  }
  if (!result.ok && detected.format === PW3_FORMAT && detected.symbols === whole) return failed('INVALID_PREFIX');
  return result;
}

function decodeDetected(detected, tables, renames) {
  try {
    if (detected.format === PW3_FORMAT) {
      const { parsed, reports, carry } = parsePw3(detected.symbols, tables);
      return finish(parsed, PW3_FORMAT, tables, reports, carry, true);
    }
    if (detected.format === PW2_FORMAT) return finish(parsePw2(detected.symbols), PW2_FORMAT, tables, [], new Map(), renames);
    if (detected.format === DRONE_EDITOR) return finish(readPwd1(detected.symbols), DRONE_EDITOR, tables, [], new Map(), renames);
    return finish(readPw1(detected.symbols), FORMAT, tables, [], new Map(), renames);
  } catch (e) {
    if (isFail(e)) return failed(e.status, detected.format);
    return failed('CORRUPT', detected.format);
  }
}

function readPw1(symbols) {
  const frame = base32Decode(symbols);
  if (frame.length > LIMITS.frameBytes) throw new Fail('TOO_LARGE');
  if (frame.length < LIMITS.minFrameBytes) throw new Fail('TRUNCATED');
  const bodyEnd = frame.length - 4;
  const stored = ((frame[bodyEnd] << 24) | (frame[bodyEnd + 1] << 16) | (frame[bodyEnd + 2] << 8) | frame[bodyEnd + 3]) >>> 0;
  if (crc32(frame, 0, bodyEnd) !== stored) throw new Fail('CHECKSUM');
  if (frame[0] !== FRAME_VERSION || (frame[1] & ~FLAG_DEFLATE) !== 0) throw new Fail('UNSUPPORTED_VERSION');
  let data = frame.slice(2, bodyEnd);
  if (frame[1] & FLAG_DEFLATE) {
    const inflated = inflateRaw(data, LIMITS.payloadBytes);
    if (!inflated.bytes) throw new Fail(inflated.status);
    data = inflated.bytes;
  } else if (data.length > LIMITS.payloadBytes) {
    throw new Fail('TOO_LARGE');
  }
  return parse(data);
}

function parse(data) {
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
  return parsed;
}

// ---------------------------------------------------------------------------------------------------------------
// PWD1: codes of the drone editor up to Propwash 0.5.x ('PWD1-' + Base64url of a raw deflate stream of the lines
// 'base.<kind>=<part>' and '<key>=<number>'; creative-drone.md and pw3.md 7.1 of Propwash). Read exactly like
// CreativeShareCode.decode: Java's URL-safe Base64, a complete deflate stream without the extra input byte (data after
// its end is ignored), at most 16 KiB of text decoded like new String(bytes, UTF_8), Double.parseDouble and the limits
// of CreativeSpec. Anything the mod rejects is CORRUPT.

/** Base64.getUrlDecoder().decode(text) of Java: the bytes, or null where Java throws. */
function base64Url(text) {
  const length = text.length;
  if (length === 1) return null;
  const out = [];
  let bits = 0;
  let shift = 18;
  let at = 0;
  while (at < length) {
    const c = text[at++];
    const value = BASE64URL.indexOf(c);
    if (value < 0) {
      if (c !== '=') return null;
      if ((shift === 6 && (at === length || text[at++] !== '=')) || shift === 18) return null;
      break;
    }
    bits |= value << shift;
    shift -= 6;
    if (shift < 0) {
      out.push((bits >> 16) & 0xff, (bits >> 8) & 0xff, bits & 0xff);
      shift = 18;
      bits = 0;
    }
  }
  if (shift === 6) out.push((bits >> 16) & 0xff);
  else if (shift === 0) out.push((bits >> 16) & 0xff, (bits >> 8) & 0xff);
  else if (shift === 12) return null;
  return at < length ? null : Uint8Array.from(out);
}

/** new String(bytes, UTF_8) of Java: malformed input becomes U+FFFD as the JDK counts it (String.decodeUTF8_UTF16). */
function javaUtf8(bytes) {
  const REPL = '\uFFFD';
  const cont = (b) => (b & 0xc0) === 0x80;
  const length = bytes.length;
  let out = '';
  let at = 0;
  while (at < length) {
    const b1 = bytes[at++];
    if (b1 < 0x80) {
      out += String.fromCharCode(b1);
    } else if (b1 >= 0xc2 && b1 <= 0xdf) {
      if (at >= length) {
        out += REPL;
        break;
      }
      const b2 = bytes[at++];
      if (cont(b2)) {
        out += String.fromCharCode(((b1 & 0x1f) << 6) | (b2 & 0x3f));
      } else {
        out += REPL;
        at--;
      }
    } else if (b1 >= 0xe0 && b1 <= 0xef) {
      if (at + 1 < length) {
        const b2 = bytes[at++];
        const b3 = bytes[at++];
        if ((b1 === 0xe0 && (b2 & 0xe0) === 0x80) || !cont(b2) || !cont(b3)) {
          out += REPL;
          at -= 2;
          if (!((b1 === 0xe0 && (b2 & 0xe0) === 0x80) || !cont(b2))) at++;
        } else {
          const c = ((b1 & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f);
          out += c >= 0xd800 && c <= 0xdfff ? REPL : String.fromCharCode(c);
        }
        continue;
      }
      out += REPL;
      if (at < length && ((b1 === 0xe0 && (bytes[at] & 0xe0) === 0x80) || !cont(bytes[at]))) continue;
      break;
    } else if (b1 >= 0xf0 && b1 <= 0xf7) {
      if (at + 2 < length) {
        const b2 = bytes[at++];
        const b3 = bytes[at++];
        const b4 = bytes[at++];
        const uc = ((b1 & 0x07) << 18) | ((b2 & 0x3f) << 12) | ((b3 & 0x3f) << 6) | (b4 & 0x3f);
        if (!cont(b2) || !cont(b3) || !cont(b4) || uc < 0x10000 || uc > 0x10ffff) {
          out += REPL;
          at -= 3;
          if (!(b1 > 0xf4 || (b1 === 0xf0 && (b2 < 0x90 || b2 > 0xbf)) || (b1 === 0xf4 && (b2 & 0xf0) !== 0x80) || !cont(b2))) at += cont(b3) ? 2 : 1;
        } else {
          out += String.fromCodePoint(uc);
        }
        continue;
      }
      if (b1 > 0xf4 || (at < length && ((b1 === 0xf0 && (bytes[at] < 0x90 || bytes[at] > 0xbf)) || (b1 === 0xf4 && (bytes[at] & 0xf0) !== 0x80) || !cont(bytes[at])))) {
        out += REPL;
        continue;
      }
      at++;
      out += REPL;
      if (at < length && !cont(bytes[at])) continue;
      break;
    } else {
      out += REPL;
    }
  }
  return out;
}

const JAVA_DECIMAL = /^[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?[fFdD]?$/;
const JAVA_HEX = /^([+-])?0[xX](?:([0-9a-fA-F]+)\.?|([0-9a-fA-F]*)\.([0-9a-fA-F]+))[pP]([+-])?([0-9]+)[fFdD]?$/;

/** m · 2^e (m a positive BigInt) as the nearest double, ties to even, with subnormals and overflow to Infinity. */
function binaryDouble(m, e) {
  const length = m.toString(2).length;
  const top = length - 1 + e;
  if (top > 1023) return Infinity;
  if (top < -1075) return 0;
  const lsb = Math.max(top - 52, -1074);
  const shift = lsb - e;
  let q;
  if (shift > 0) {
    const s = BigInt(shift);
    q = m >> s;
    const rest = m - (q << s);
    const half = 1n << (s - 1n);
    if (rest > half || (rest === half && (q & 1n) === 1n)) q += 1n;
  } else {
    q = m << BigInt(-shift);
  }
  return Number(q) * 2 ** lsb;
}

/** Double.parseDouble of Java: the number (also NaN and ±Infinity), or null where Java throws NumberFormatException. */
export function javaParseDouble(input) {
  const text = String(input).replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '');
  if (/^[+-]?NaN$/.test(text)) return NaN;
  if (/^[+-]?Infinity$/.test(text)) return text[0] === '-' ? -Infinity : Infinity;
  const hex = JAVA_HEX.exec(text);
  if (hex) {
    const fraction = hex[2] !== undefined ? '' : hex[4];
    const digits = `${hex[2] !== undefined ? hex[2] : hex[3]}${fraction}`.replace(/^0+/, '');
    let value = 0;
    if (digits) {
      const power = hex[6].replace(/^0+/, '') || '0';
      const exponent = power.length > 12 ? Infinity : Number(power);
      value = binaryDouble(BigInt(`0x${digits}`), (hex[5] === '-' ? -exponent : exponent) - 4 * fraction.length);
    }
    return hex[1] === '-' ? -value : value;
  }
  if (!JAVA_DECIMAL.test(text)) return null;
  return Number(text.replace(/[fFdD]$/, ''));
}

/**
 * The creative values of a PWD1 code ({base, values} like sharecode3.js normalizeCreative), or null where the mod
 * rejects the code (CreativeShareCode.decode).
 */
export function decodePwd1(code) {
  if (code == null) return null;
  const trimmed = javaStrip(String(code));
  if (trimmed.length > PWD1_MAX_CODE_CHARS || trimmed.length < PWD1_PREFIX.length) return null;
  for (let i = 0; i < PWD1_PREFIX.length; i++) if (trimmed[i].toUpperCase() !== PWD1_PREFIX[i]) return null;
  const packed = base64Url(trimmed.slice(PWD1_PREFIX.length).replace(/[ \t\n\x0B\f\r]/g, ''));
  if (!packed) return null;
  const inflated = inflateRaw(packed, PWD1_MAX_TEXT_BYTES, undefined, { pad: false, trailing: true });
  if (!inflated.bytes) return null;
  const base = {};
  const values = new Map();
  for (const line of javaUtf8(inflated.bytes).split('\n')) {
    if (!javaStrip(line)) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) return null;
    const key = javaStrip(line.slice(0, eq));
    const value = javaStrip(line.slice(eq + 1));
    if (key.startsWith('base.')) {
      const kind = key.slice('base.'.length).toLowerCase();
      if (PART_KINDS.includes(kind) && value) base[kind] = value.toLowerCase();
      continue;
    }
    const number = javaParseDouble(value);
    if (number === null) return null;
    if (Number.isFinite(number)) values.set(key, number);
  }
  const plain = Object.create(null);
  for (const [key, number] of values) plain[key] = number;
  return normalizeCreative({ base, values: plain });
}

/** A PWD1 code as parsed content (CreativeShare.readPwd1): the Flight School's freestyle drone with the creative flight controller and the values. */
function readPwd1(code) {
  const creative = decodePwd1(code);
  if (!creative) throw new Fail('CORRUPT');
  return {
    layers: ['parts', 'creative'], skipped: [], parts: BUILD_FIELDS.map((field) => PWD1_BUILD[field]), accessories: {}, paint: null, tune: null,
    osd: null, name: null, creative,
  };
}

// Renames, unknown, wrong-kind and inactive parts and the result object, shared by PW1, PW2, PW3 and PWD1 (ShareFormat.finish).
function finish(parsed, format, tables, reports, carry, renames) {
  if (!parsed.parts) throw new Fail('CORRUPT');

  const renamed = new Map();
  const rename = (id) => {
    if (!renames || unknownMarker(id)) return id;
    const resolved = tables.replacement(id);
    if (resolved !== id && !renamed.has(id)) renamed.set(id, { from: id, to: resolved });
    return resolved;
  };
  const ids = parsed.parts.map(rename);
  const build = {};
  BUILD_FIELDS.forEach((field, i) => {
    build[field] = ids[i];
  });
  build.accessories = {};
  for (const slot of ACCESSORY_SLOTS) {
    if (slot in parsed.accessories) build.accessories[slot] = rename(parsed.accessories[slot]);
  }

  const unknown = [];
  const wrong = [];
  const inactive = [];
  const add = (list, id) => {
    if (!list.includes(id)) list.push(id);
  };
  const classify = (id, expected) => {
    if (unknownMarker(id)) {
      add(unknown, id);
      return;
    }
    const kind = tables.kind(id);
    if (!kind) add(unknown, id);
    else if (kind !== expected) add(wrong, id);
    else if (!tables.active(id)) add(inactive, id);
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
  let tune = null;
  if (parsed.tune) {
    tune = {};
    for (const key of Object.keys(parsed.tune)) if (isSharedKey(key)) tune[key] = parsed.tune[key];
  }

  return {
    status: 'OK',
    ok: true,
    format,
    content: { build, paint, tune, osd: parsed.osd, name: parsed.name, creative: parsed.creative || null },
    layers: parsed.layers,
    namespaces: reports,
    unknownParts: unknown,
    wrongKind: wrong,
    renamed: [...renamed.values()],
    skipped: parsed.skipped,
    inactiveParts: inactive,
    carry,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Conversion (ShareConvert)

/** Why a part of an old code cannot become PW3 (ShareConvert.notConvertible), or null. */
function notConvertible(id) {
  const [namespace, path] = idParts(id);
  if (namespace === 'pw2.unknown') return `pw2_unknown:${path}`;
  if (namespace.startsWith('pw1.unknown.')) return `pw1_unknown:${namespace.slice('pw1.unknown.'.length)}`;
  if (namespace.startsWith('pw3.')) return `reserved_namespace:${namespace}`;
  return null;
}

/**
 * ShareConvert.toPw3: a PW1, PW2 or PWD1 code as PW3 with the frozen data only (sharecode3.js frozenTables: the
 * Propwash table and the tables of the add-on directory, no versions, no add-on info), so the result depends on the old
 * code alone and equals the mod's byte for byte; a PWD1 code keeps its creative values. A PW3 code comes back as
 * 'PW3-<body>'.
 * @returns {{status: string, format: string, code: string|null, reason: string|null, converted: boolean}}
 */
export function convert(code, frozen) {
  const detected = detect(code);
  const result = (status, format, out = null, reason = null) => ({ status, format, code: out, reason, converted: status === 'OK' && format !== PW3_FORMAT });
  if (detected.status !== 'OK') return result(detected.status, detected.format);
  const decoded = decode(code, { tables: frozen, renames: false });
  if (!decoded.ok) return result(decoded.status, decoded.format);
  if (decoded.format === PW3_FORMAT) {
    const body = decode(PW3_PREFIX + detected.symbols, { tables: frozen, renames: false }).ok ? detected.symbols : compact(code);
    return result('OK', PW3_FORMAT, PW3_PREFIX + body);
  }
  const b = decoded.content.build;
  for (const id of [...BUILD_FIELDS.map((f) => b[f]), ...ACCESSORY_SLOTS.filter((s) => b.accessories[s] != null).map((s) => b.accessories[s])]) {
    const reason = notConvertible(id);
    if (reason) return result('NOT_CONVERTIBLE', decoded.format, null, reason);
  }
  try {
    return result('OK', decoded.format, encode(decoded.content, { format: PW3_FORMAT, tables: frozen, info: 'NEVER' }));
  } catch (e) {
    if (e && e.shareError === true) return result('NOT_CONVERTIBLE', decoded.format, null, e.key);
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Links

/** Format of a code: 'PW3', 'PW2', 'PW1' or 'PWD1' by its prefix (a bare body counts as PW3), '' for anything else. */
export function formatOf(code) {
  const d = detect(code);
  return ['PW1', 'PW2', 'PW3', DRONE_EDITOR].includes(d.format) ? d.format : '';
}

/** Share link for a code: '<page>#PW3-…' (old links: '#PW2…', '#PW1-…'). */
export function shareLink(code, pageUrl) {
  const base = String(pageUrl).split('#')[0];
  return `${base}#${code}`;
}

/** The code in a location hash ('#PW3-…', '#PW2…', '#PW1-…' or '#PWD1-…', also URL-encoded and in lower case), or null. */
export function codeFromHash(hash) {
  if (!hash) return null;
  let text = String(hash).replace(/^#/, '');
  try {
    text = decodeURIComponent(text);
  } catch {
    return null;
  }
  text = text.trim();
  return /^pw(?:[123]|d1)/i.test(text) ? text : null;
}
