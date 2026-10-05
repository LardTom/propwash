// Raw DEFLATE decoder (RFC 1951, no zlib header) for share codes (PW1 frames, PW2 OSD layouts with a preset dictionary).
//
// Behaves like the mod's use of java.util.zip.Inflater(nowrap = true): the input gets one extra zero byte, the
// output is capped, a stream that needs more input, carries data after its end or contains an invalid block is
// CORRUPT, more than `limit` bytes of output is TOO_LARGE. Never throws to the caller; returns
// { bytes } or { status }.

const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097,
  6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CLEN_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

class Failure {
  constructor(status) {
    this.status = status;
  }
}

const corrupt = () => new Failure('CORRUPT');
// The stream needs more input than the code carries (zlib would wait for more data; the mod treats that as CORRUPT,
// unless the output buffer was already full, then TOO_LARGE).
const needInput = () => new Failure('NEED_INPUT');

// Canonical Huffman code as count/symbol tables (zlib "puff" style). Rejects over-subscribed sets and, like zlib's
// inflate_table, incomplete sets unless the code is a single symbol of length 1 (allowed for literal/length and
// distance codes, not for the code-length code).
function huffman(lengths, offset, count, allowSingle) {
  const counts = new Uint16Array(16);
  for (let i = 0; i < count; i++) counts[lengths[offset + i]]++;
  let max = 15;
  while (max > 0 && counts[max] === 0) max--;
  const symbols = new Uint16Array(count);
  if (max === 0) return { counts, symbols, empty: true };
  let left = 1;
  for (let len = 1; len <= 15; len++) {
    left <<= 1;
    left -= counts[len];
    if (left < 0) throw corrupt();
  }
  if (left > 0 && (!allowSingle || max !== 1)) throw corrupt();
  const offs = new Uint16Array(16);
  for (let len = 1; len < 15; len++) offs[len + 1] = offs[len] + counts[len];
  for (let i = 0; i < count; i++) {
    const len = lengths[offset + i];
    if (len !== 0) symbols[offs[len]++] = i;
  }
  return { counts, symbols, empty: false };
}

const FIXED = (() => {
  // Symbols 286/287 and distance codes 30/31 are part of the fixed codes but invalid when they occur.
  const lengths = new Uint8Array(288 + 32);
  let i = 0;
  for (; i < 144; i++) lengths[i] = 8;
  for (; i < 256; i++) lengths[i] = 9;
  for (; i < 280; i++) lengths[i] = 7;
  for (; i < 288; i++) lengths[i] = 8;
  for (; i < 320; i++) lengths[i] = 5;
  return { lit: huffman(lengths, 0, 288, true), dist: huffman(lengths, 288, 32, true) };
})();

class BitReader {
  constructor(data) {
    this.data = data;
    this.pos = 0;
    this.bit = 0;
    this.bitCount = 0;
  }

  bits(need) {
    let value = this.bit;
    while (this.bitCount < need) {
      if (this.pos >= this.data.length) throw needInput();
      value |= this.data[this.pos++] << this.bitCount;
      this.bitCount += 8;
    }
    this.bit = value >>> need;
    this.bitCount -= need;
    return value & ((1 << need) - 1);
  }

  decode(h) {
    if (h.empty) throw corrupt();
    let code = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len <= 15; len++) {
      code |= this.bits(1);
      const count = h.counts[len];
      if (code - count < first) return h.symbols[index + (code - first)];
      index += count;
      first += count;
      first <<= 1;
      code <<= 1;
    }
    throw corrupt();
  }

  alignToByte() {
    this.bit = 0;
    this.bitCount = 0;
  }

  // Bytes the stream consumed (a partly used last byte counts as consumed, like zlib).
  consumed() {
    return this.pos;
  }
}

class Output {
  constructor(limit, dictionary) {
    this.limit = limit;
    this.buf = new Uint8Array(Math.min(limit + 1, 4096));
    this.length = 0;
    this.dictionary = dictionary;
  }

  // Byte d positions back: from the output, before that from the end of the preset dictionary.
  back(d) {
    if (d <= this.length) return this.buf[this.length - d];
    const at = this.dictionary.length - (d - this.length);
    if (at < 0) throw corrupt();
    return this.dictionary[at];
  }

  push(byte) {
    if (this.length > this.limit) throw new Failure('TOO_LARGE');
    if (this.length === this.buf.length) {
      const next = new Uint8Array(Math.min(this.buf.length * 2, this.limit + 1));
      next.set(this.buf);
      this.buf = next;
    }
    this.buf[this.length++] = byte;
  }
}

function inflateCodes(br, out, lit, dist) {
  for (;;) {
    const sym = br.decode(lit);
    if (sym < 256) {
      out.push(sym);
    } else if (sym === 256) {
      return;
    } else {
      const li = sym - 257;
      if (li >= 29) throw corrupt();
      const len = LENGTH_BASE[li] + br.bits(LENGTH_EXTRA[li]);
      const ds = br.decode(dist);
      if (ds >= 30) throw corrupt();
      const d = DIST_BASE[ds] + br.bits(DIST_EXTRA[ds]);
      if (d > out.length + out.dictionary.length) throw corrupt();
      for (let k = 0; k < len; k++) out.push(out.back(d));
    }
  }
}

function dynamicTables(br) {
  const nlen = br.bits(5) + 257;
  const ndist = br.bits(5) + 1;
  const ncode = br.bits(4) + 4;
  if (nlen > 286 || ndist > 30) throw corrupt();
  const lengths = new Uint8Array(320);
  for (let i = 0; i < ncode; i++) lengths[CLEN_ORDER[i]] = br.bits(3);
  const lencode = huffman(lengths, 0, 19, false);
  if (lencode.empty) throw corrupt();
  const all = new Uint8Array(nlen + ndist);
  let index = 0;
  while (index < nlen + ndist) {
    const sym = br.decode(lencode);
    if (sym < 16) {
      all[index++] = sym;
      continue;
    }
    let len = 0;
    let repeat;
    if (sym === 16) {
      if (index === 0) throw corrupt();
      len = all[index - 1];
      repeat = 3 + br.bits(2);
    } else if (sym === 17) {
      repeat = 3 + br.bits(3);
    } else {
      repeat = 11 + br.bits(7);
    }
    if (index + repeat > nlen + ndist) throw corrupt();
    while (repeat--) all[index++] = len;
  }
  if (all[256] === 0) throw corrupt();
  return { lit: huffman(all, 0, nlen, true), dist: huffman(all, nlen, ndist, true) };
}

/**
 * Inflates a raw DEFLATE stream.
 * @param {Uint8Array} data compressed bytes
 * @param {number} limit maximum output size
 * @param {Uint8Array} [dictionary] preset dictionary (zlib inflateSetDictionary; at most 32 KiB, used by PW2)
 * @returns {{bytes: Uint8Array} | {status: 'CORRUPT' | 'TOO_LARGE'}}
 */
export function inflateRaw(data, limit, dictionary = new Uint8Array(0)) {
  const input = new Uint8Array(data.length + 1);
  input.set(data);
  const br = new BitReader(input);
  const out = new Output(limit, dictionary);
  try {
    let last = 0;
    while (!last) {
      last = br.bits(1);
      const type = br.bits(2);
      if (type === 0) {
        br.alignToByte();
        if (br.pos + 4 > input.length) throw needInput();
        const len = input[br.pos] | (input[br.pos + 1] << 8);
        const nlen = input[br.pos + 2] | (input[br.pos + 3] << 8);
        br.pos += 4;
        if (len !== (~nlen & 0xffff)) throw corrupt();
        if (br.pos + len > input.length) {
          // zlib copies what it has before asking for more input; the output cap can still be hit first.
          for (let k = br.pos; k < input.length; k++) out.push(input[k]);
          throw needInput();
        }
        for (let k = 0; k < len; k++) out.push(input[br.pos + k]);
        br.pos += len;
      } else if (type === 1) {
        inflateCodes(br, out, FIXED.lit, FIXED.dist);
      } else if (type === 2) {
        const t = dynamicTables(br);
        inflateCodes(br, out, t.lit, t.dist);
      } else {
        throw corrupt();
      }
    }
    if (out.length > limit) return { status: 'TOO_LARGE' };
    if (input.length - br.consumed() > 1) return { status: 'CORRUPT' };
    return { bytes: out.buf.slice(0, out.length) };
  } catch (e) {
    if (e instanceof Failure) {
      if (e.status === 'NEED_INPUT') return { status: out.length > limit ? 'TOO_LARGE' : 'CORRUPT' };
      return { status: e.status };
    }
    return { status: 'CORRUPT' };
  }
}
