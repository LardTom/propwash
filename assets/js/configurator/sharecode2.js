// PW2 share codes: encoder and decoder, a port of Pw2Codec in "Propwash: Just More Parts" (spec: sharecode.md,
// PW2 revision 2.0). Every code is byte-identical to the mod's; the OSD layer uses the vendored zlib port (level 9,
// raw, preset dictionary) like java.util.zip.Deflater.
//
// Layout: 'PW2' + base62 of [bit stream, padded to whole bytes] + [low 16 bits of the CRC-32 of those bytes].
// The bit stream holds the layer flags, the parts as short table numbers (Exp-Golomb), the paint with a colour table
// and repeats, the tune as index gaps and decimal values, the OSD layout (deflated against the preset layouts) and
// the name. Content shape and decode result are the same as for PW1 (sharecode.js).

import { crc32 } from './crc32.js';
import { inflateRaw } from './inflate.js';
import { TUNE_KEYS as PW1_TUNE_KEYS, isSharedKey } from './tune.js';
import { deflateRaw } from '../../vendor/pako/deflate.js';
import { PW2_PARTS, PW2_COLORS, PW2_OSD_DICTIONARY } from './sharecode2-tables.js';
import {
  Fail, utf8Encode, javaStrip, validPath, validNamespace, unknownNamespaceIndex, LIMITS, ACCESSORY_SLOTS, PAINT_SLOTS,
  BUILD_FIELDS,
} from './sharecode.js';

export const PW2_FORMAT = 'PW2';
export const PW2_PREFIX = 'PW2';
export const PW2_REVISION = '2.0';
export const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const TEXT_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz -';
export const PW2_TUNE_KEYS = Object.freeze([...PW1_TUNE_KEYS, 'pid.armMaxAngleDeg']);
export const PW2_KINDS = Object.freeze(['frame', 'stack', 'motor', 'prop', 'video', 'battery', 'accessory']);
export const PW2_PARAMS = Object.freeze({
  part: 4, color: 5, paintSlots: 2, tuneCount: 2, tuneGap: 0, value: 7, text: 3, osdBytes: 8, extensionBits: 6,
});
const UNKNOWN_NAMESPACE = 'pw2.unknown';
const UNKNOWN_PART = /^\?(frame|stack|motor|prop|video|battery|accessory)\.([1-9][0-9]{0,9})$/;
const PW1_UNKNOWN_NAMESPACE = /^pw1\.unknown\.([0-9]{1,10})$/;
const CHECKSUM_BYTES = 2;
const MIN_FRAME_BYTES = 3;
const MAX_PAINT_SLOT_BITS = 64;
const MAX_ACCESSORIES = 255;
const MAX_EXTENSIONS = 32;
const FIRST_EXTENSION_LAYER = 5;
const SCALES = [1.0, 10.0, 100.0, 1000.0];
const TWO_31 = 2147483648;
const MAX_GOLOMB_ZEROS = 40;
const LOG2_62 = 5.954196310386876;
const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const TUNE_INDEX = new Map(PW2_TUNE_KEYS.map((key, i) => [key, i + 1]));
const COLOR_INDEX = new Map(PW2_COLORS.map((rgb, i) => [rgb, i]));
const PART_INDEX = Object.fromEntries(PW2_KINDS.map((kind) => [kind, new Map(PW2_PARTS[kind].map((id, i) => [id, i + 1]))]));

// ---------------------------------------------------------------------------------------------------------------
// Bits (MSB first)

class BitWriter {
  constructor() {
    this.bitsOut = [];
  }

  get length() {
    return this.bitsOut.length;
  }

  bit(value) {
    this.bitsOut.push(value ? 1 : 0);
    return this;
  }

  bits(value, count) {
    for (let i = count - 1; i >= 0; i--) this.bitsOut.push(Math.floor(value / 2 ** i) % 2);
    return this;
  }

  golomb(value, k) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`negative or fractional value: ${value}`);
    const shifted = value + 2 ** k;
    const width = bitLength(shifted);
    this.bits(0, width - k - 1);
    return this.bits(shifted, width);
  }

  bytes(values) {
    for (const b of values) this.bits(b, 8);
    return this;
  }

  toBytes() {
    const out = new Uint8Array(Math.ceil(this.bitsOut.length / 8));
    this.bitsOut.forEach((b, i) => {
      if (b) out[i >> 3] |= 0x80 >> (i & 7);
    });
    return out;
  }
}

function bitLength(value) {
  let n = 0;
  let v = value;
  while (v >= 1) {
    v = Math.floor(v / 2);
    n++;
  }
  return n;
}

function golombLength(value, k) {
  return 2 * bitLength(value + 2 ** k) - k - 1;
}

class BitReader {
  constructor(data, byteLength) {
    this.data = data;
    this.end = byteLength * 8;
    this.pos = 0;
  }

  remaining() {
    return this.end - this.pos;
  }

  bit() {
    if (this.pos >= this.end) throw new Fail('TRUNCATED');
    const value = (this.data[this.pos >> 3] >> (7 - (this.pos & 7))) & 1;
    this.pos++;
    return value === 1;
  }

  bits(count) {
    if (count > this.remaining()) throw new Fail('TRUNCATED');
    let value = 0;
    for (let i = 0; i < count; i++) value = value * 2 + (this.bit() ? 1 : 0);
    return value;
  }

  golomb(k) {
    let zeros = 0;
    while (!this.bit()) {
      zeros++;
      if (zeros > MAX_GOLOMB_ZEROS) throw new Fail('CORRUPT');
    }
    let shifted = 1;
    for (let i = 0; i < zeros + k; i++) shifted = shifted * 2 + (this.bit() ? 1 : 0);
    return shifted - 2 ** k;
  }

  golombInt(k, max) {
    const value = this.golomb(k);
    if (value > max) throw new Fail('CORRUPT');
    return value;
  }

  skip(count) {
    if (count > this.remaining()) throw new Fail('TRUNCATED');
    this.pos += count;
  }

  paddingOnly() {
    if (this.remaining() >= 8) return false;
    while (this.remaining() > 0) {
      if (this.bit()) return false;
    }
    return true;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Base62 (the whole frame as one big-endian number, fixed length per byte count)

const BIG62 = 62n;

export function symbolsFor(bytes) {
  const limit = 1n << BigInt(8 * bytes);
  let count = Math.ceil((bytes * 8) / LOG2_62);
  while (BIG62 ** BigInt(count) < limit) count++;
  while (count > 0 && BIG62 ** BigInt(count - 1) >= limit) count--;
  return count;
}

function bytesFor(symbols) {
  const guess = Math.floor((symbols * LOG2_62) / 8);
  for (let bytes = Math.max(0, guess - 1); bytes <= guess + 1; bytes++) {
    if (symbolsFor(bytes) === symbols) return bytes;
  }
  return -1;
}

export function base62Encode(bytes) {
  const count = symbolsFor(bytes.length);
  let value = 0n;
  for (const b of bytes) value = (value << 8n) | BigInt(b);
  const out = new Array(count);
  for (let at = count - 1; at >= 0; at--) {
    out[at] = BASE62[Number(value % BIG62)];
    value /= BIG62;
  }
  return out.join('');
}

const BASE62_VALUES = (() => {
  const values = new Int8Array(128).fill(-1);
  for (let i = 0; i < BASE62.length; i++) values[BASE62.charCodeAt(i)] = i;
  return values;
})();

function base62Decode(symbols) {
  for (let i = 0; i < symbols.length; i++) {
    const c = symbols.charCodeAt(i);
    if (c >= 128 || BASE62_VALUES[c] < 0) throw new Fail('BAD_CHARACTER');
  }
  const bytes = bytesFor(symbols.length);
  if (bytes < 0) throw new Fail('TRUNCATED');
  let value = 0n;
  for (let i = 0; i < symbols.length; i++) value = value * BIG62 + BigInt(BASE62_VALUES[symbols.charCodeAt(i)]);
  if (value >> BigInt(8 * bytes) !== 0n) throw new Fail('CORRUPT');
  const out = new Uint8Array(bytes);
  for (let i = bytes - 1; i >= 0; i--) {
    out[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Encoding

function checksum(bytes, length) {
  return crc32(bytes, 0, length) & 0xffff;
}

function textMode(text) {
  let table = true;
  let ascii = true;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (!TEXT_ALPHABET.includes(text[i])) table = false;
    if (c < 0x20 || c > 0x7e) ascii = false;
  }
  return table ? 0 : ascii ? 1 : 2;
}

function textBits(text) {
  const mode = textMode(text);
  if (mode === 0) return 1 + golombLength(text.length, PW2_PARAMS.text) + 6 * text.length;
  if (mode === 1) return 2 + golombLength(text.length, PW2_PARAMS.text) + 7 * text.length;
  const bytes = utf8Encode(text).length;
  return 2 + golombLength(bytes, PW2_PARAMS.text) + 8 * bytes;
}

function writeText(out, text) {
  const mode = textMode(text);
  if (mode === 0) {
    out.bits(0, 1).golomb(text.length, PW2_PARAMS.text);
    for (let i = 0; i < text.length; i++) out.bits(TEXT_ALPHABET.indexOf(text[i]), 6);
  } else if (mode === 1) {
    out.bits(2, 2).golomb(text.length, PW2_PARAMS.text);
    for (let i = 0; i < text.length; i++) out.bits(text.charCodeAt(i) - 0x20, 7);
  } else {
    const bytes = utf8Encode(text);
    out.bits(3, 2).golomb(bytes.length, PW2_PARAMS.text).bytes(bytes);
  }
}

function splitId(id) {
  if (typeof id !== 'string') throw new Error(`part id expected: ${id}`);
  const colon = id.indexOf(':');
  return colon < 0 ? ['minecraft', id] : [id.slice(0, colon), id.slice(colon + 1)];
}

function writeRef(out, kind, id) {
  const table = PW2_PARTS[kind];
  const marker = UNKNOWN_PART.exec(id);
  if (marker || (typeof id === 'string' && id.startsWith(`${UNKNOWN_NAMESPACE}:`))) {
    const value = marker && marker[1] === kind ? Number(marker[2]) : -1;
    if (value <= table.length || value > 0x7fffffff) throw new Error(`part id not PW2-safe: ${id}`);
    out.golomb(value, PW2_PARAMS.part);
    return;
  }
  const index = PART_INDEX[kind].get(id);
  if (index) {
    out.golomb(index, PW2_PARAMS.part);
    return;
  }
  let namespace;
  let path;
  const unknown = unknownNamespaceIndex(id);
  if (unknown >= 0) {
    namespace = `pw1.unknown.${unknown}`;
    path = id.slice(id.indexOf(':') + 1);
  } else {
    [namespace, path] = splitId(id);
  }
  if (!validPath(path)) throw new Error(`part id not PW2-safe: ${id}`);
  if (!validNamespace(namespace)) throw new Error(`namespace not PW2-safe: ${id}`);
  out.golomb(0, PW2_PARAMS.part);
  writeText(out, namespace);
  writeText(out, path);
}

function indexBits(count) {
  return count <= 1 ? 0 : bitLength(count - 1);
}

function writePaint(out, paint) {
  let length = 0;
  PAINT_SLOTS.forEach((slot, i) => {
    if (paint[slot] != null) length = i + 1;
  });
  out.golomb(length, PW2_PARAMS.paintSlots);
  for (let i = 0; i < length; i++) out.bit(paint[PAINT_SLOTS[i]] != null);
  const seen = [];
  for (let i = 0; i < length; i++) {
    const value = paint[PAINT_SLOTS[i]];
    if (value == null) continue;
    const rgb = colorOf(value);
    if (seen.length) {
      const at = seen.indexOf(rgb);
      out.bit(at < 0);
      if (at >= 0) {
        out.bits(at, indexBits(seen.length));
        continue;
      }
    }
    seen.push(rgb);
    const table = COLOR_INDEX.get(rgb);
    out.bit(table === undefined);
    if (table !== undefined) out.golomb(table, PW2_PARAMS.color);
    else out.bits(rgb, 24);
  }
}

function colorOf(value) {
  if (typeof value === 'number') return value & 0xffffff;
  return parseInt(String(value).replace('#', ''), 16) & 0xffffff;
}

// ShareCodec.scaled(value, scale): q or null.
function scaled(value, scale) {
  if (!Number.isFinite(value)) return null;
  const factor = SCALES[scale];
  const product = value * factor;
  if (Math.abs(product) >= 2147483647.5) return null;
  const q = Math.round(product) + 0;
  if (Math.abs(q) >= TWO_31) return null;
  return Object.is(Math.fround(q / factor), value) ? q : null;
}

function floatBits(value) {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value);
  return view.getUint32(0);
}

function bitsFloat(bits) {
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, bits);
  return view.getFloat32(0);
}

function writeValue(out, value, seen) {
  const raw = floatBits(value);
  const at = seen.indexOf(raw);
  if (at >= 0) {
    out.bits(0b110, 3);
    out.bits(at, indexBits(seen.length));
    return;
  }
  seen.push(raw);
  for (const scale of [0, 1, 2, 3]) {
    const q = scaled(value, scale);
    if (q === null) continue;
    if (scale === 0) out.bits(0b0, 1);
    else if (scale === 1) out.bits(0b1110, 4);
    else if (scale === 2) out.bits(0b10, 2);
    else out.bits(0b11110, 5);
    out.golomb(q >= 0 ? 2 * q : -2 * q - 1, PW2_PARAMS.value);
    return;
  }
  out.bits(0b11111, 5);
  out.bits(raw, 32);
}

function writeTune(out, tune) {
  const indexed = [];
  const literal = [];
  for (const key of Object.keys(tune)) {
    if (!isSharedKey(key)) continue;
    const entry = { key, index: TUNE_INDEX.get(key) || 0, value: Math.fround(tune[key]) };
    (entry.index > 0 ? indexed : literal).push(entry);
  }
  indexed.sort((a, b) => a.index - b.index);
  literal.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const seen = [];
  out.golomb(indexed.length, PW2_PARAMS.tuneCount);
  let previous = 0;
  for (const { index, value } of indexed) {
    out.golomb(index - previous - 1, PW2_PARAMS.tuneGap);
    previous = index;
    writeValue(out, value, seen);
  }
  out.golomb(literal.length, 0);
  for (const { key, value } of literal) {
    writeText(out, key);
    writeValue(out, value, seen);
  }
}

function writeOsd(out, osd) {
  out.golomb(osd.version - 1, 0);
  const text = Uint8Array.from(utf8Encode(osd.json));
  const packed = deflateRaw(text, PW2_OSD_DICTIONARY);
  const packedBits = golombLength(packed.length, PW2_PARAMS.osdBytes) + 8 * packed.length;
  if (packedBits < textBits(osd.json)) {
    out.bit(true);
    out.golomb(packed.length, PW2_PARAMS.osdBytes);
    out.bytes(packed);
  } else {
    out.bit(false);
    writeText(out, osd.json);
  }
}

/**
 * PW2 code of normalised content (sharecode.js normalizeContent).
 * @returns {string} 'PW2…'
 */
export function encodePw2(content) {
  const out = new BitWriter();
  out.bit(!!content.paint).bit(!!content.tune).bit(!!content.osd).bit(!!content.name).bit(false);
  const build = content.build;
  BUILD_FIELDS.forEach((field) => writeRef(out, field, build[field]));
  const used = ACCESSORY_SLOTS.filter((slot) => build.accessories[slot] != null);
  out.golomb(used.length, 0);
  for (const slot of used) {
    out.golomb(ACCESSORY_SLOTS.indexOf(slot), 0);
    writeRef(out, 'accessory', build.accessories[slot]);
  }
  if (content.paint) writePaint(out, content.paint);
  if (content.tune) writeTune(out, content.tune);
  if (content.osd) writeOsd(out, content.osd);
  if (content.name) writeText(out, content.name);
  const payload = out.toBytes();
  const frame = new Uint8Array(payload.length + CHECKSUM_BYTES);
  frame.set(payload);
  const check = checksum(payload, payload.length);
  frame[payload.length] = check >>> 8;
  frame[payload.length + 1] = check & 0xff;
  return PW2_PREFIX + base62Encode(frame);
}

// ---------------------------------------------------------------------------------------------------------------
// Decoding

function utf8(bytes) {
  try {
    return UTF8.decode(bytes);
  } catch {
    throw new Fail('CORRUPT');
  }
}

function readText(r, maxSymbols) {
  const mode = r.bit() ? (r.bit() ? 2 : 1) : 0;
  const width = mode === 0 ? 6 : mode === 1 ? 7 : 8;
  const count = r.golomb(PW2_PARAMS.text);
  if (count * width > r.remaining()) throw new Fail('TRUNCATED');
  if (count > maxSymbols * (mode === 2 ? 4 : 1)) throw new Fail('CORRUPT');
  if (mode === 2) {
    const bytes = new Uint8Array(count);
    for (let i = 0; i < count; i++) bytes[i] = r.bits(8);
    return utf8(bytes);
  }
  let out = '';
  for (let i = 0; i < count; i++) {
    const symbol = r.bits(width);
    if (mode === 0) {
      if (symbol >= TEXT_ALPHABET.length) throw new Fail('CORRUPT');
      out += TEXT_ALPHABET[symbol];
    } else {
      if (symbol > 0x7e - 0x20) throw new Fail('CORRUPT');
      out += String.fromCharCode(symbol + 0x20);
    }
  }
  return out;
}

function skipOnce(parsed, marker) {
  if (!parsed.skipped.includes(marker)) parsed.skipped.push(marker);
}

function readRef(r, kind, parsed) {
  const value = r.golombInt(PW2_PARAMS.part, 0x7fffffff);
  if (value === 0) {
    const namespace = readText(r, LIMITS.namespaceChars);
    const path = readText(r, LIMITS.pathChars);
    if (!validNamespace(namespace) || !validPath(path) || namespace === UNKNOWN_NAMESPACE) throw new Fail('CORRUPT');
    const pw1 = PW1_UNKNOWN_NAMESPACE.exec(namespace);
    if (pw1) {
      const ns = Number(pw1[1]);
      if (ns >= 3 && ns <= 0xffffffff) return `?${ns}:${path}`;
    }
    return `${namespace}:${path}`;
  }
  const table = PW2_PARTS[kind];
  if (value <= table.length) return table[value - 1];
  const path = `${kind}.${value}`;
  skipOnce(parsed, `part_index:${path}`);
  return `?${path}`;
}

function readParts(r, parsed) {
  const ids = [];
  for (let i = 0; i < BUILD_FIELDS.length; i++) ids.push(readRef(r, PW2_KINDS[i], parsed));
  const accessories = {};
  const count = r.golombInt(0, MAX_ACCESSORIES);
  for (let i = 0; i < count; i++) {
    const slot = r.golombInt(0, 0x7fffffff);
    const id = readRef(r, 'accessory', parsed);
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
  const length = r.golombInt(PW2_PARAMS.paintSlots, MAX_PAINT_SLOT_BITS);
  const present = [];
  for (let i = 0; i < length; i++) present.push(r.bit());
  const seen = [];
  const colors = {};
  for (let i = 0; i < length; i++) {
    if (!present[i]) continue;
    let rgb;
    if (seen.length && !r.bit()) {
      const at = r.bits(indexBits(seen.length));
      if (at >= seen.length) throw new Fail('CORRUPT');
      rgb = seen[at];
    } else {
      if (r.bit()) {
        rgb = r.bits(24);
      } else {
        const table = r.golombInt(PW2_PARAMS.color, 0x7fffffff);
        if (table >= PW2_COLORS.length) throw new Fail('CORRUPT');
        rgb = PW2_COLORS[table];
      }
      seen.push(rgb);
    }
    if (i < PAINT_SLOTS.length) colors[PAINT_SLOTS[i]] = rgb;
    else parsed.skipped.push(`paint_slot:${i}`);
  }
  parsed.paint = colors;
}

function readValue(r, seen) {
  let scale;
  if (!r.bit()) {
    scale = 0;
  } else if (!r.bit()) {
    scale = 2;
  } else if (!r.bit()) {
    if (!seen.length) throw new Fail('CORRUPT');
    const at = r.bits(indexBits(seen.length));
    if (at >= seen.length) throw new Fail('CORRUPT');
    return bitsFloat(seen[at]);
  } else if (!r.bit()) {
    scale = 1;
  } else if (!r.bit()) {
    scale = 3;
  } else {
    const raw = r.bits(32);
    const value = bitsFloat(raw);
    if (!Number.isFinite(value)) throw new Fail('CORRUPT');
    seen.push(raw);
    return value;
  }
  const zigzag = r.golomb(PW2_PARAMS.value);
  if (zigzag > 0xffffffff) throw new Fail('CORRUPT');
  const q = zigzag % 2 === 0 ? zigzag / 2 : -(zigzag + 1) / 2;
  const value = Math.fround(q / SCALES[scale]);
  seen.push(floatBits(value));
  return value;
}

function putTune(values, key, value, parsed) {
  if (!isSharedKey(key)) {
    parsed.skipped.push(`tune_key:${key}`);
    return;
  }
  if (values.has(key)) parsed.skipped.push(`tune_duplicate:${key}`);
  values.set(key, value);
}

function readTune(r, parsed) {
  const indexed = r.golombInt(PW2_PARAMS.tuneCount, LIMITS.tuneEntries);
  const values = new Map();
  const seen = [];
  let index = 0;
  for (let i = 0; i < indexed; i++) {
    index += r.golomb(PW2_PARAMS.tuneGap) + 1;
    if (index > 0x7fffffff) throw new Fail('CORRUPT');
    const value = readValue(r, seen);
    if (index > PW2_TUNE_KEYS.length) {
      parsed.skipped.push(`tune_index:${index}`);
      continue;
    }
    putTune(values, PW2_TUNE_KEYS[index - 1], value, parsed);
  }
  const literal = r.golombInt(0, LIMITS.tuneEntries - indexed);
  for (let i = 0; i < literal; i++) {
    const key = readText(r, LIMITS.tuneKeyChars);
    if (key.length === 0 || key.length > LIMITS.tuneKeyChars) throw new Fail('CORRUPT');
    putTune(values, key, readValue(r, seen), parsed);
  }
  const tune = {};
  for (const key of [...values.keys()].sort()) tune[key] = values.get(key);
  parsed.tune = tune;
}

function readOsd(r, parsed) {
  const version = r.golomb(0) + 1;
  if (version > 0x7fffffff) throw new Fail('CORRUPT');
  let json;
  if (r.bit()) {
    const length = r.golombInt(PW2_PARAMS.osdBytes, 0x7fffffff);
    if (8 * length > r.remaining()) throw new Fail('TRUNCATED');
    const packed = new Uint8Array(length);
    for (let i = 0; i < length; i++) packed[i] = r.bits(8);
    const inflated = inflateRaw(packed, LIMITS.payloadBytes, PW2_OSD_DICTIONARY);
    if (!inflated.bytes) throw new Fail(inflated.status);
    json = utf8(inflated.bytes);
  } else {
    json = readText(r, LIMITS.osdChars);
  }
  if (json.length > LIMITS.osdChars) throw new Fail('CORRUPT');
  parsed.osd = { version, json };
}

/**
 * Reads the symbols after 'PW2' (dashes and blanks already removed) into the parsed form that sharecode.js finishes
 * (aliases, unknown and wrong-kind parts). Throws Fail.
 */
export function parsePw2(symbols) {
  const frame = base62Decode(symbols);
  if (frame.length > LIMITS.frameBytes) throw new Fail('TOO_LARGE');
  if (frame.length < MIN_FRAME_BYTES) throw new Fail('TRUNCATED');
  const body = frame.length - CHECKSUM_BYTES;
  const stored = (frame[body] << 8) | frame[body + 1];
  if (checksum(frame, body) !== stored) throw new Fail('CHECKSUM');
  const r = new BitReader(frame, body);
  const hasPaint = r.bit();
  const hasTune = r.bit();
  const hasOsd = r.bit();
  const hasName = r.bit();
  const hasExtensions = r.bit();
  const parsed = { layers: ['parts'], skipped: [], parts: null, accessories: {}, paint: null, tune: null, osd: null, name: null };
  readParts(r, parsed);
  if (hasPaint) {
    parsed.layers.push('paint');
    readPaint(r, parsed);
  }
  if (hasTune) {
    parsed.layers.push('tune');
    readTune(r, parsed);
  }
  if (hasOsd) {
    parsed.layers.push('osd');
    readOsd(r, parsed);
  }
  if (hasName) {
    parsed.layers.push('name');
    const name = javaStrip(readText(r, LIMITS.nameChars * 4));
    if (name.length === 0 || name.length > LIMITS.nameChars) throw new Fail('CORRUPT');
    parsed.name = name;
  }
  if (hasExtensions) {
    const count = r.golombInt(0, MAX_EXTENSIONS);
    for (let i = 0; i < count; i++) {
      const layer = FIRST_EXTENSION_LAYER + r.golombInt(0, 1024);
      const bits = r.golomb(PW2_PARAMS.extensionBits);
      r.skip(bits);
      parsed.skipped.push(`layer:${layer}`);
    }
  }
  if (!r.paddingOnly()) throw new Fail('CORRUPT');
  return parsed;
}
