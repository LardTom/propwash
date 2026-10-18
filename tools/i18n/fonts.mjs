// The characters of a WOFF2 font (its cmap), read with Node's Brotli: no font tools needed for the tests.

import fs from 'node:fs';
import zlib from 'node:zlib';

const GLYF = 10;
const LOCA = 11;

function base128(buf, at) {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    const b = buf[at.i++];
    value = value * 128 + (b & 0x7f);
    if (!(b & 0x80)) return value;
  }
  throw new Error('woff2: bad UIntBase128');
}

/** The table data of a WOFF2 file by tag (only untransformed tables are usable, like cmap). */
export function woff2Tables(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error(`${file}: not a WOFF2 font`);
  const numTables = buf.readUInt16BE(12);
  const compressed = buf.readUInt32BE(20);
  const at = { i: 48 };
  const dir = [];
  for (let t = 0; t < numTables; t++) {
    const flags = buf[at.i++];
    const index = flags & 0x3f;
    const version = flags >> 6;
    let tag = String(index);
    if (index === 63) {
      tag = buf.toString('latin1', at.i, at.i + 4);
      at.i += 4;
    }
    const origLength = base128(buf, at);
    const transformed = index === GLYF || index === LOCA ? version === 0 : version !== 0;
    const length = transformed ? base128(buf, at) : origLength;
    dir.push({ index, tag, length, transformed });
  }
  const data = zlib.brotliDecompressSync(buf.subarray(at.i, at.i + compressed));
  const tables = new Map();
  let offset = 0;
  for (const t of dir) {
    tables.set(t.index === 0 ? 'cmap' : t.tag, { data: data.subarray(offset, offset + t.length), transformed: t.transformed });
    offset += t.length;
  }
  return tables;
}

/** The code points a WOFF2 font maps to a glyph. */
export function charsOf(file) {
  const cmap = woff2Tables(file).get('cmap').data;
  const records = cmap.readUInt16BE(2);
  const subtables = [];
  for (let r = 0; r < records; r++) {
    const platform = cmap.readUInt16BE(4 + r * 8);
    const encoding = cmap.readUInt16BE(6 + r * 8);
    const offset = cmap.readUInt32BE(8 + r * 8);
    subtables.push({ platform, encoding, offset, format: cmap.readUInt16BE(offset) });
  }
  const pick = subtables.find((s) => s.format === 12 && (s.platform === 3 || s.platform === 0))
    || subtables.find((s) => s.format === 4 && (s.platform === 3 || s.platform === 0));
  if (!pick) throw new Error(`${file}: no Unicode cmap`);
  const chars = new Set();
  const o = pick.offset;
  if (pick.format === 12) {
    const groups = cmap.readUInt32BE(o + 12);
    for (let g = 0; g < groups; g++) {
      const start = cmap.readUInt32BE(o + 16 + g * 12);
      const end = cmap.readUInt32BE(o + 20 + g * 12);
      for (let c = start; c <= end; c++) chars.add(c);
    }
    return chars;
  }
  const segs = cmap.readUInt16BE(o + 6) / 2;
  const ends = o + 14;
  const starts = ends + segs * 2 + 2;
  const deltas = starts + segs * 2;
  const ranges = deltas + segs * 2;
  for (let s = 0; s < segs; s++) {
    const end = cmap.readUInt16BE(ends + s * 2);
    const start = cmap.readUInt16BE(starts + s * 2);
    const delta = cmap.readInt16BE(deltas + s * 2);
    const rangeOffset = cmap.readUInt16BE(ranges + s * 2);
    for (let c = start; c <= end && c !== 0xffff; c++) {
      let glyph;
      if (rangeOffset === 0) glyph = (c + delta) & 0xffff;
      else {
        const g = cmap.readUInt16BE(ranges + s * 2 + rangeOffset + (c - start) * 2);
        glyph = g === 0 ? 0 : (g + delta) & 0xffff;
      }
      if (glyph) chars.add(c);
    }
  }
  return chars;
}
