// java.lang.StrictMath for the port: exp, atan, atan2, acos, asin and pow as the JVM computes them (fdlibm 5.3), bit
// for bit. The JS Math functions of the browsers are close but not the same (Math.atan2 differs for about 1 in 2000
// inputs, Math.pow for about 1 in 10; Math.exp only rarely, but it does on arm64), and the flight model of Propwash calls
// StrictMath where its results must not depend on the machine: prop wash, wake, heat and battery filters (exp), the
// attitude error of Angle/Horizon (atan2), tilt and heading (acos, atan2), the restitution of hard ground hits, drive
// losses and the battery at low charge (pow). Where the Java calls Math.exp (GaussMarkov, constants of DroneSim) the JVM
// on arm64 computes StrictMath.exp too. tools/test-sim-model.mjs checks the flights against the jar.
//
// Ported from fdlibm (netlib.org/fdlibm: e_exp.c, s_atan.c, e_atan2.c, e_acos.c, e_asin.c, e_pow.c):
// ====================================================
// Copyright (C) 1993, 2004 by Sun Microsystems, Inc. All rights reserved.
//
// Developed at SunSoft, a Sun Microsystems, Inc. business.
// Permission to use, copy, modify, and distribute this
// software is freely granted, provided that this notice
// is preserved.
// ====================================================

const F64 = new Float64Array(1);
const I32 = new Int32Array(F64.buffer);
const U32 = new Uint32Array(F64.buffer);
// Word order of a double in memory: the high word (sign, exponent, top of the mantissa) is the second on little-endian.
const HI = new Uint8Array(Uint32Array.of(1).buffer)[0] === 1 ? 1 : 0;
const LO = 1 - HI;

/** __HI(x): the high word, signed. */
function hi(x) {
  F64[0] = x;
  return I32[HI];
}
/** __LO(x): the low word, unsigned. */
function lo(x) {
  F64[0] = x;
  return U32[LO];
}
/** x with its low word set to 0 (__LO(x) = 0). */
function clearLo(x) {
  F64[0] = x;
  U32[LO] = 0;
  return F64[0];
}
/** x with its high word replaced (__HI(x) = h). */
function withHi(x, h) {
  F64[0] = x;
  I32[HI] = h;
  return F64[0];
}
/** The double of the words h (high) and 0 (low). */
function fromHi(h) {
  I32[HI] = h;
  U32[LO] = 0;
  return F64[0];
}

// ---------------------------------------------------------------------------------------------------------------
// exp

const O_THRESHOLD = 7.09782712893383973096e+02;
const U_THRESHOLD = -7.45133219101941108420e+02;
const LN2_HI = [6.93147180369123816490e-01, -6.93147180369123816490e-01];
const LN2_LO = [1.90821492927058770002e-10, -1.90821492927058770002e-10];
const HALF = [0.5, -0.5];
const INVLN2 = 1.44269504088896338700e+00;
const TWOM1000 = 9.33263618503218878990e-302;
const E1 = 1.66666666666666019037e-01;
const E2 = -2.77777777770155933842e-03;
const E3 = 6.61375632143793436117e-05;
const E4 = -1.65339022054652515390e-06;
const E5 = 4.13813679705723846039e-08;

function exp(x) {
  let hx = hi(x);
  const xsb = (hx >>> 31) & 1; // sign bit of x
  hx &= 0x7fffffff; // high word of |x|
  if (hx >= 0x40862E42) { // |x| >= 709.78...
    if (hx >= 0x7ff00000) {
      if (((hx & 0xfffff) | lo(x)) !== 0) return x + x; // NaN
      return xsb === 0 ? x : 0.0; // exp(+-inf) = {inf, 0}
    }
    if (x > O_THRESHOLD) return HUGE * HUGE; // overflow
    if (x < U_THRESHOLD) return TWOM1000 * TWOM1000; // underflow
  }
  let k = 0;
  let hiPart = 0.0;
  let loPart = 0.0;
  if (hx > 0x3fd62e42) { // |x| > 0.5 ln2
    if (hx < 0x3FF0A2B2) { // and |x| < 1.5 ln2
      hiPart = x - LN2_HI[xsb];
      loPart = LN2_LO[xsb];
      k = 1 - xsb - xsb;
    } else {
      k = Math.trunc(INVLN2 * x + HALF[xsb]);
      const t = k;
      hiPart = x - t * LN2_HI[0]; // t * ln2HI is exact here
      loPart = t * LN2_LO[0];
    }
    x = hiPart - loPart;
  } else if (hx < 0x3e300000) { // |x| < 2^-28
    return 1.0 + x;
  }
  const t = x * x;
  const c = x - t * (E1 + t * (E2 + t * (E3 + t * (E4 + t * E5))));
  if (k === 0) return 1.0 - ((x * c) / (c - 2.0) - x);
  const y = 1.0 - ((loPart - (x * c) / (2.0 - c)) - hiPart);
  if (k >= -1021) return withHi(y, (hi(y) + (k << 20)) | 0); // add k to y's exponent
  return withHi(y, (hi(y) + ((k + 1000) << 20)) | 0) * TWOM1000;
}

// ---------------------------------------------------------------------------------------------------------------
// atan, atan2

const ATAN_HI = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00];
const ATAN_LO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const AT = [3.33333333333329318027e-01, -1.99999999998764832476e-01, 1.42857142725034663711e-01, -1.11111104054623557880e-01,
  9.09088713343650656196e-02, -7.69187620504482999495e-02, 6.66107313738753120669e-02, -5.83357013379057348645e-02,
  4.97687799461593236017e-02, -3.65315727442169155270e-02, 1.62858201153657823623e-02];
const HUGE = 1.0e300;
const TINY = 1.0e-300;

function atan(x) {
  const hx = hi(x);
  const ix = hx & 0x7fffffff;
  let id;
  if (ix >= 0x44100000) { // |x| >= 2^66
    if (ix > 0x7ff00000 || (ix === 0x7ff00000 && lo(x) !== 0)) return x + x; // NaN
    return hx > 0 ? ATAN_HI[3] + ATAN_LO[3] : -ATAN_HI[3] - ATAN_LO[3];
  }
  if (ix < 0x3fdc0000) { // |x| < 0.4375
    if (ix < 0x3e200000) return x; // |x| < 2^-29
    id = -1;
  } else {
    x = Math.abs(x);
    if (ix < 0x3ff30000) { // |x| < 1.1875
      if (ix < 0x3fe60000) { // 7/16 <= |x| < 11/16
        id = 0;
        x = (2.0 * x - 1.0) / (2.0 + x);
      } else { // 11/16 <= |x| < 19/16
        id = 1;
        x = (x - 1.0) / (x + 1.0);
      }
    } else if (ix < 0x40038000) { // |x| < 2.4375
      id = 2;
      x = (x - 1.5) / (1.0 + 1.5 * x);
    } else { // 2.4375 <= |x| < 2^66
      id = 3;
      x = -1.0 / x;
    }
  }
  let z = x * x;
  const w = z * z;
  const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
  const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
  if (id < 0) return x - x * (s1 + s2);
  z = ATAN_HI[id] - ((x * (s1 + s2) - ATAN_LO[id]) - x);
  return hx < 0 ? -z : z;
}

const PI_O_4 = 7.8539816339744827900E-01;
const PI_O_2 = 1.5707963267948965580E+00;
const PI = 3.1415926535897931160E+00;
const PI_LO = 1.2246467991473531772E-16;

function atan2(y, x) {
  const hx = hi(x);
  const ix = hx & 0x7fffffff;
  const lx = lo(x);
  const hy = hi(y);
  const iy = hy & 0x7fffffff;
  const ly = lo(y);
  if (Number.isNaN(x) || Number.isNaN(y)) return x + y;
  if (((hx - 0x3ff00000) | lx) === 0) return atan(y); // x = 1.0
  const m = ((hy >> 31) & 1) | ((hx >> 30) & 2); // 2 * sign(x) + sign(y)
  if ((iy | ly) === 0) {
    switch (m) {
      case 0:
      case 1: return y; // atan(+-0, +anything) = +-0
      case 2: return PI + TINY; // atan(+0, -anything) = pi
      default: return -PI - TINY; // atan(-0, -anything) = -pi
    }
  }
  if ((ix | lx) === 0) return hy < 0 ? -PI_O_2 - TINY : PI_O_2 + TINY;
  if (ix === 0x7ff00000) {
    if (iy === 0x7ff00000) {
      switch (m) {
        case 0: return PI_O_4 + TINY;
        case 1: return -PI_O_4 - TINY;
        case 2: return 3.0 * PI_O_4 + TINY;
        default: return -3.0 * PI_O_4 - TINY;
      }
    }
    switch (m) {
      case 0: return 0.0;
      case 1: return -0.0;
      case 2: return PI + TINY;
      default: return -PI - TINY;
    }
  }
  if (iy === 0x7ff00000) return hy < 0 ? -PI_O_2 - TINY : PI_O_2 + TINY;
  const k = (iy - ix) >> 20;
  let z;
  if (k > 60) z = PI_O_2 + 0.5 * PI_LO; // |y/x| > 2^60
  else if (hx < 0 && k < -60) z = 0.0; // |y|/x < -2^60
  else z = atan(Math.abs(y / x));
  switch (m) {
    case 0: return z; // atan(+, +)
    case 1: return -z; // atan(-, +)
    case 2: return PI - (z - PI_LO); // atan(+, -)
    default: return (z - PI_LO) - PI; // atan(-, -)
  }
}

// ---------------------------------------------------------------------------------------------------------------
// acos, asin

const PIO2_HI = 1.57079632679489655800e+00;
const PIO2_LO = 6.12323399573676603587e-17;
const PIO4_HI = 7.85398163397448278999e-01;
const PS0 = 1.66666666666666657415e-01;
const PS1 = -3.25565818622400915405e-01;
const PS2 = 2.01212532134862925881e-01;
const PS3 = -4.00555345006794114027e-02;
const PS4 = 7.91534994289814532176e-04;
const PS5 = 3.47933107596021167570e-05;
const QS1 = -2.40339491173441421878e+00;
const QS2 = 2.02094576023350569471e+00;
const QS3 = -6.88283971605453293030e-01;
const QS4 = 7.70381505559019352791e-02;

function acos(x) {
  const hx = hi(x);
  const ix = hx & 0x7fffffff;
  if (ix >= 0x3ff00000) { // |x| >= 1
    if (((ix - 0x3ff00000) | lo(x)) === 0) return hx > 0 ? 0.0 : PI + 2.0 * PIO2_LO;
    return NaN;
  }
  if (ix < 0x3fe00000) { // |x| < 0.5
    if (ix <= 0x3c600000) return PIO2_HI + PIO2_LO; // |x| < 2^-57
    const z = x * x;
    const p = z * (PS0 + z * (PS1 + z * (PS2 + z * (PS3 + z * (PS4 + z * PS5)))));
    const q = 1.0 + z * (QS1 + z * (QS2 + z * (QS3 + z * QS4)));
    const r = p / q;
    return PIO2_HI - (x - (PIO2_LO - x * r));
  }
  if (hx < 0) { // x < -0.5
    const z = (1.0 + x) * 0.5;
    const p = z * (PS0 + z * (PS1 + z * (PS2 + z * (PS3 + z * (PS4 + z * PS5)))));
    const q = 1.0 + z * (QS1 + z * (QS2 + z * (QS3 + z * QS4)));
    const s = Math.sqrt(z);
    const r = p / q;
    const w = r * s - PIO2_LO;
    return PI - 2.0 * (s + w);
  }
  // x > 0.5
  const z = (1.0 - x) * 0.5;
  const s = Math.sqrt(z);
  const df = clearLo(s);
  const c = (z - df * df) / (s + df);
  const p = z * (PS0 + z * (PS1 + z * (PS2 + z * (PS3 + z * (PS4 + z * PS5)))));
  const q = 1.0 + z * (QS1 + z * (QS2 + z * (QS3 + z * QS4)));
  const r = p / q;
  const w = r * s + c;
  return 2.0 * (df + w);
}

function asin(x) {
  const hx = hi(x);
  const ix = hx & 0x7fffffff;
  if (ix >= 0x3ff00000) { // |x| >= 1
    if (((ix - 0x3ff00000) | lo(x)) === 0) return x * PIO2_HI + x * PIO2_LO;
    return NaN;
  }
  if (ix < 0x3fe00000) { // |x| < 0.5
    if (ix < 0x3e400000) return x; // |x| < 2^-27
    const t = x * x;
    const p = t * (PS0 + t * (PS1 + t * (PS2 + t * (PS3 + t * (PS4 + t * PS5)))));
    const q = 1.0 + t * (QS1 + t * (QS2 + t * (QS3 + t * QS4)));
    const w = p / q;
    return x + x * w;
  }
  const w0 = 1.0 - Math.abs(x);
  let t = w0 * 0.5;
  let p = t * (PS0 + t * (PS1 + t * (PS2 + t * (PS3 + t * (PS4 + t * PS5)))));
  let q = 1.0 + t * (QS1 + t * (QS2 + t * (QS3 + t * QS4)));
  const s = Math.sqrt(t);
  if (ix >= 0x3FEF3333) { // |x| > 0.975
    const w = p / q;
    t = PIO2_HI - (2.0 * (s + s * w) - PIO2_LO);
  } else {
    const w = clearLo(s);
    const c = (t - w * w) / (s + w);
    const r = p / q;
    p = 2.0 * s * r - (PIO2_LO - 2.0 * c);
    q = PIO4_HI - 2.0 * w;
    t = PIO4_HI - (p - q);
  }
  return hx > 0 ? t : -t;
}

// ---------------------------------------------------------------------------------------------------------------
// pow

const BP = [1.0, 1.5];
const DP_H = [0.0, 5.84962487220764160156e-01];
const DP_L = [0.0, 1.35003920212974897128e-08];
const TWO53 = 9007199254740992.0;
const L1 = 5.99999999999994648725e-01;
const L2 = 4.28571428578550184252e-01;
const L3 = 3.33333329818377432918e-01;
const L4 = 2.72728123808534006489e-01;
const L5 = 2.30660745775561754067e-01;
const L6 = 2.06975017800338417784e-01;
const P1 = 1.66666666666666019037e-01;
const P2 = -2.77777777770155933842e-03;
const P3 = 6.61375632143793436117e-05;
const P4 = -1.65339022054652515390e-06;
const P5 = 4.13813679705723846039e-08;
const LG2 = 6.93147180559945286227e-01;
const LG2_H = 6.93147182464599609375e-01;
const LG2_L = -1.90465429995776804525e-09;
const OVT = 8.0085662595372944372e-17;
const CP = 9.61796693925975554329e-01;
const CP_H = 9.61796700954437255859e-01;
const CP_L = -7.02846165095275826516e-09;
const IVLN2 = 1.44269504088896338700e+00;
const IVLN2_H = 1.44269502162933349609e+00;
const IVLN2_L = 1.92596299112661746887e-08;
const TWOM54 = 5.55111512312578270212e-17;

/** scalbn(z, n) for a result below the normal range: one rounding, like fdlibm. */
function scalbn(z, n) {
  const k = ((hi(z) & 0x7ff00000) >> 20) + n;
  if (k <= -54) return z < 0 ? -0.0 * TINY : 0.0 * TINY;
  return withHi(z, (hi(z) & 0x800fffff) | ((k + 54) << 20)) * TWOM54;
}

function pow(x, y) {
  const hx = hi(x);
  const lx = lo(x);
  const hy = hi(y);
  const ly = lo(y);
  let ix = hx & 0x7fffffff;
  const iy = hy & 0x7fffffff;
  if ((iy | ly) === 0) return 1.0; // x^0 = 1
  if (ix > 0x7ff00000 || (ix === 0x7ff00000 && lx !== 0) || iy > 0x7ff00000 || (iy === 0x7ff00000 && ly !== 0)) return x + y; // NaN

  // yisint = 0: y is not an integer, 1: odd, 2: even (only for x < 0)
  let yisint = 0;
  if (hx < 0) {
    if (iy >= 0x43400000) {
      yisint = 2;
    } else if (iy >= 0x3ff00000) {
      const k = (iy >> 20) - 0x3ff;
      if (k > 20) {
        const j = ly >>> (52 - k);
        if (((j << (52 - k)) >>> 0) === ly) yisint = 2 - (j & 1);
      } else if (ly === 0) {
        const j = iy >> (20 - k);
        if ((j << (20 - k)) === iy) yisint = 2 - (j & 1);
      }
    }
  }
  if (ly === 0) {
    if (iy === 0x7ff00000) { // y is +-inf
      if (((ix - 0x3ff00000) | lx) === 0) return y - y; // inf^+-1 is NaN
      if (ix >= 0x3ff00000) return hy >= 0 ? y : 0.0;
      return hy < 0 ? -y : 0.0;
    }
    if (iy === 0x3ff00000) return hy < 0 ? 1.0 / x : x; // y is +-1
    if (hy === 0x40000000) return x * x; // y is 2
    if (hy === 0x3fe00000 && hx >= 0) return Math.sqrt(x); // y is 0.5, x >= +0
  }
  let ax = Math.abs(x);
  if (lx === 0 && (ix === 0x7ff00000 || ix === 0 || ix === 0x3ff00000)) { // x is +-0, +-inf, +-1
    let z = ax;
    if (hy < 0) z = 1.0 / z;
    if (hx < 0) {
      if (((ix - 0x3ff00000) | yisint) === 0) z = NaN; // (-1)^non-int
      else if (yisint === 1) z = -z;
    }
    return z;
  }
  let n = (hx >> 31) + 1;
  if ((n | yisint) === 0) return NaN; // (x < 0)^(non-int)
  let s = 1.0;
  if ((n | (yisint - 1)) === 0) s = -1.0; // (-ve)^(odd int)

  let t1;
  let t2;
  if (iy > 0x41e00000) { // |y| > 2^31
    if (iy > 0x43f00000) { // |y| > 2^64, must over/underflow
      if (ix <= 0x3fefffff) return hy < 0 ? HUGE * HUGE : TINY * TINY;
      if (ix >= 0x3ff00000) return hy > 0 ? HUGE * HUGE : TINY * TINY;
    }
    if (ix < 0x3fefffff) return hy < 0 ? s * HUGE * HUGE : s * TINY * TINY;
    if (ix > 0x3ff00000) return hy > 0 ? s * HUGE * HUGE : s * TINY * TINY;
    // |1 - x| <= 2^-20: log(x) by x - x^2/2 + x^3/3 - x^4/4
    const t = ax - 1.0;
    const w = (t * t) * (0.5 - t * (0.3333333333333333333333 - t * 0.25));
    const u = IVLN2_H * t;
    const v = t * IVLN2_L - w * IVLN2;
    t1 = clearLo(u + v);
    t2 = v - (t1 - u);
  } else {
    n = 0;
    if (ix < 0x00100000) { // subnormal x
      ax *= TWO53;
      n -= 53;
      ix = hi(ax);
    }
    n += (ix >> 20) - 0x3ff;
    const j = ix & 0x000fffff;
    ix = j | 0x3ff00000; // normalize ix
    let k;
    if (j <= 0x3988E) {
      k = 0; // |x| < sqrt(3/2)
    } else if (j < 0xBB67A) {
      k = 1; // |x| < sqrt(3)
    } else {
      k = 0;
      n += 1;
      ix -= 0x00100000;
    }
    ax = withHi(ax, ix);
    // ss = s_h + s_l = (x - 1) / (x + 1) or (x - 1.5) / (x + 1.5)
    let u = ax - BP[k];
    let v = 1.0 / (ax + BP[k]);
    const ss = u * v;
    const sH = clearLo(ss);
    let tH = fromHi(((ix >> 1) | 0x20000000) + 0x00080000 + (k << 18));
    let tL = ax - (tH - BP[k]);
    const sL = v * ((u - sH * tH) - sH * tL);
    // log(ax)
    let s2 = ss * ss;
    let r = s2 * s2 * (L1 + s2 * (L2 + s2 * (L3 + s2 * (L4 + s2 * (L5 + s2 * L6)))));
    r += sL * (sH + ss);
    s2 = sH * sH;
    tH = clearLo(3.0 + s2 + r);
    tL = r - ((tH - 3.0) - s2);
    u = sH * tH;
    v = sL * tH + tL * ss;
    const pH = clearLo(u + v);
    const pL = v - (pH - u);
    const zH = CP_H * pH;
    const zL = CP_L * pH + pL * CP + DP_L[k];
    const t = n;
    t1 = clearLo(((zH + zL) + DP_H[k]) + t);
    t2 = zL - (((t1 - t) - DP_H[k]) - zH);
  }
  // (y1 + y2) * (t1 + t2)
  const y1 = clearLo(y);
  const pL = (y - y1) * t1 + y * t2;
  let pH = y1 * t1;
  let z = pL + pH;
  let j = hi(z);
  const i = lo(z) | 0;
  if (j >= 0x40900000) { // z >= 1024
    if (((j - 0x40900000) | i) !== 0) return s * HUGE * HUGE; // overflow
    if (pL + OVT > z - pH) return s * HUGE * HUGE;
  } else if ((j & 0x7fffffff) >= 0x4090cc00) { // z <= -1075
    if (((j - 0xc090cc00) | i) !== 0) return s * TINY * TINY; // underflow
    if (pL <= z - pH) return s * TINY * TINY;
  }
  // 2^(pH + pL)
  const ia = j & 0x7fffffff;
  let k = (ia >> 20) - 0x3ff;
  n = 0;
  if (ia > 0x3fe00000) { // |z| > 0.5: n = [z + 0.5]
    n = (j + (0x00100000 >> (k + 1))) | 0;
    k = ((n & 0x7fffffff) >> 20) - 0x3ff;
    const t = fromHi(n & ~(0x000fffff >> k));
    n = ((n & 0x000fffff) | 0x00100000) >> (20 - k);
    if (j < 0) n = -n;
    pH -= t;
  }
  const t = clearLo(pL + pH);
  const u = t * LG2_H;
  const v = (pL - (t - pH)) * LG2 + t * LG2_L;
  z = u + v;
  const w = v - (z - u);
  const tt = z * z;
  const tr = z - tt * (P1 + tt * (P2 + tt * (P3 + tt * (P4 + tt * P5))));
  const r = (z * tr) / (tr - 2.0) - (w + z * w);
  z = 1.0 - (r - z);
  j = (hi(z) + (n << 20)) | 0;
  if ((j >> 20) <= 0) z = scalbn(z, n); // subnormal output
  else z = withHi(z, j);
  return s * z;
}

export const StrictMath = Object.freeze({ exp, atan, atan2, acos, asin, pow });
