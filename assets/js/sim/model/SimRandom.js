// Port of de.lardtom.propwash.sim.SimRandom: xorshift64* seeded through splitmix64, bit-identical to the Java.
// The 64-bit state lives in two unsigned 32-bit halves (stateHi, stateLo) so the hot path (nextDouble/gauss) needs
// no BigInt. The Java long API (constructor/setSeed/setState argument, state(), nextLong()) uses BigInt; seeds and
// states may also be given as integer numbers.

const SQRT3 = Math.sqrt(3.0);
const INV_2_53 = 1.0 / 9007199254740992.0; // 1.0 / (1L << 53)
const TWO_POW_21 = 2097152.0;
const DEFAULT_STATE = 0x2545F4914F6CDD1Dn;
const MUL_HI = 0x2545F491;
const MUL_LO = 0x4F6CDD1D;

// High 32 bits of the unsigned 32x32-bit product a * b.
function mulHi32(a, b) {
  const a0 = a & 0xffff;
  const a1 = a >>> 16;
  const b0 = b & 0xffff;
  const b1 = b >>> 16;
  const p00 = a0 * b0;
  const p01 = a0 * b1;
  const p10 = a1 * b0;
  const p11 = a1 * b1;
  const mid = (p00 >>> 16) + (p01 & 0xffff) + (p10 & 0xffff);
  return (p11 + (p01 >>> 16) + (p10 >>> 16) + (mid >>> 16)) >>> 0;
}

function toLong(v) {
  return typeof v === 'bigint' ? BigInt.asUintN(64, v) : BigInt.asUintN(64, BigInt(Math.trunc(v)));
}

export class SimRandom {
  static SQRT3 = SQRT3;
  static INV_2_53 = INV_2_53;

  // Java: private long state
  stateHi = 0;
  stateLo = 0;
  // the last nextLong() output, unsigned halves
  outHi = 0;
  outLo = 0;

  constructor(seed) {
    this.setSeed(seed);
  }

  setSeed(seed) {
    let s = toLong(seed) ^ 0x9E3779B97F4A7C15n;
    s = BigInt.asUintN(64, (s ^ (s >> 30n)) * 0xBF58476D1CE4E5B9n);
    s = BigInt.asUintN(64, (s ^ (s >> 27n)) * 0x94D049BB133111EBn);
    s ^= s >> 31n;
    this.setBits(s === 0n ? DEFAULT_STATE : s);
  }

  setBits(u) {
    this.stateHi = Number(u >> 32n);
    this.stateLo = Number(u & 0xffffffffn);
  }

  /** Java long state() as a signed 64-bit BigInt. */
  state() {
    return BigInt.asIntN(64, (BigInt(this.stateHi) << 32n) | BigInt(this.stateLo));
  }

  setState(state) {
    const s = toLong(state);
    this.setBits(s === 0n ? DEFAULT_STATE : s);
  }

  // One xorshift64* step; the output (x * 0x2545F4914F6CDD1DL) is left in outHi/outLo.
  next64() {
    let hi = this.stateHi;
    let lo = this.stateLo;
    // x ^= x >>> 12
    lo = (lo ^ ((lo >>> 12) | (hi << 20))) >>> 0;
    hi = (hi ^ (hi >>> 12)) >>> 0;
    // x ^= x << 25
    hi = (hi ^ ((hi << 25) | (lo >>> 7))) >>> 0;
    lo = (lo ^ (lo << 25)) >>> 0;
    // x ^= x >>> 27
    lo = (lo ^ ((lo >>> 27) | (hi << 5))) >>> 0;
    hi = (hi ^ (hi >>> 27)) >>> 0;
    this.stateHi = hi;
    this.stateLo = lo;
    // x * 0x2545F4914F6CDD1DL (low 64 bits)
    this.outLo = Math.imul(lo, MUL_LO) >>> 0;
    this.outHi = (mulHi32(lo, MUL_LO) + Math.imul(hi, MUL_LO) + Math.imul(lo, MUL_HI)) >>> 0;
  }

  /** Java long nextLong() as a signed 64-bit BigInt. */
  nextLong() {
    this.next64();
    return BigInt.asIntN(64, (BigInt(this.outHi) << 32n) | BigInt(this.outLo));
  }

  nextDouble() {
    this.next64();
    // (nextLong() >>> 11) * INV_2_53
    return (this.outHi * TWO_POW_21 + (this.outLo >>> 11)) * INV_2_53;
  }

  gauss() {
    return (this.nextDouble() + this.nextDouble() + this.nextDouble() + this.nextDouble() - 2.0) * SQRT3;
  }
}
