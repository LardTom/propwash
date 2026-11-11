// Port of de.lardtom.propwash.sim.SimMath (1:1).

// java.lang.Math.rint: round to the nearest integer, ties to even.
function rint(x) {
  const r = Math.round(x);
  return r - x === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

export class SimMath {
  static DEG = 180.0 / Math.PI;
  static RAD = Math.PI / 180.0;
  static TWO_PI = 2.0 * Math.PI;
  static HALF_PI = Math.PI / 2.0;
  static KERNEL_LIMIT = 0.7853981633974483;
  static HALF_PI_HI = 1.57079632673412561417e+00;
  static HALF_PI_LO = 6.07710050650619224932e-11;

  static clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  static clamp01(v) {
    return v < 0.0 ? 0.0 : (v > 1.0 ? 1.0 : v);
  }

  static sanitize(v, lo, hi, fallback) {
    if (Number.isNaN(v)) {
      return fallback;
    }
    return SimMath.clamp(v, lo, hi);
  }

  static sanitizeFilterHz(v, lo, hi, fallback) {
    if (Number.isNaN(v)) {
      return fallback;
    }
    if (v <= 0.0) {
      return 0.0;
    }
    return SimMath.clamp(v, lo, hi);
  }

  static finiteOr(v, fallback) {
    return Number.isFinite(v) ? v : fallback;
  }

  static smoothstep(edge0, edge1, x) {
    if (edge1 <= edge0) {
      return x < edge0 ? 0.0 : 1.0;
    }
    const t = SimMath.clamp01((x - edge0) / (edge1 - edge0));
    return t * t * (3.0 - 2.0 * t);
  }

  static smoothSign(v) {
    return v / (Math.abs(v) + 1.0);
  }

  static wrapPi(a) {
    if (!Number.isFinite(a)) {
      return 0.0;
    }
    let r = a % SimMath.TWO_PI;
    if (r > Math.PI) {
      r -= SimMath.TWO_PI;
    } else if (r <= -Math.PI) {
      r += SimMath.TWO_PI;
    }
    return r;
  }

  static pt1Gain(cutoffHz, dt) {
    if (cutoffHz <= 0.0 || dt <= 0.0) {
      return 1.0;
    }
    const rc = 1.0 / (SimMath.TWO_PI * cutoffHz);
    return dt / (dt + rc);
  }

  static sin(x) {
    if (Math.abs(x) < SimMath.KERNEL_LIMIT) {
      return SimMath.reducedSin(x);
    }
    const k = rint(x / SimMath.HALF_PI);
    const r = (x - k * SimMath.HALF_PI_HI) - k * SimMath.HALF_PI_LO;
    // (int) (((long) k) & 3L): the low two bits of the integer k (two's complement) = floorMod(k, 4)
    const q = ((k % 4) + 4) % 4;
    switch (q) {
      case 0:
        return SimMath.reducedSin(r);
      case 1:
        return SimMath.reducedCos(r);
      case 2:
        return -SimMath.reducedSin(r);
      default:
        return -SimMath.reducedCos(r);
    }
  }

  static cos(x) {
    if (Math.abs(x) < SimMath.KERNEL_LIMIT) {
      return SimMath.reducedCos(x);
    }
    const k = rint(x / SimMath.HALF_PI);
    const r = (x - k * SimMath.HALF_PI_HI) - k * SimMath.HALF_PI_LO;
    const q = ((k % 4) + 4) % 4;
    switch (q) {
      case 0:
        return SimMath.reducedCos(r);
      case 1:
        return -SimMath.reducedSin(r);
      case 2:
        return -SimMath.reducedCos(r);
      default:
        return SimMath.reducedSin(r);
    }
  }

  static reducedSin(r) {
    const r2 = r * r;
    let p = -1.0 / 121645100408832000.0;
    p = 1.0 / 355687428096000.0 + r2 * p;
    p = -1.0 / 1307674368000.0 + r2 * p;
    p = 1.0 / 6227020800.0 + r2 * p;
    p = -1.0 / 39916800.0 + r2 * p;
    p = 1.0 / 362880.0 + r2 * p;
    p = -1.0 / 5040.0 + r2 * p;
    p = 1.0 / 120.0 + r2 * p;
    p = -1.0 / 6.0 + r2 * p;
    return r + r * r2 * p;
  }

  static reducedCos(r) {
    const r2 = r * r;
    let p = -1.0 / 6402373705728000.0;
    p = 1.0 / 20922789888000.0 + r2 * p;
    p = -1.0 / 87178291200.0 + r2 * p;
    p = 1.0 / 479001600.0 + r2 * p;
    p = -1.0 / 3628800.0 + r2 * p;
    p = 1.0 / 40320.0 + r2 * p;
    p = -1.0 / 720.0 + r2 * p;
    p = 1.0 / 24.0 + r2 * p;
    p = -0.5 + r2 * p;
    return 1.0 + r2 * p;
  }

  static hypot3(x, y, z) {
    return Math.sqrt(x * x + y * y + z * z);
  }

  // a: 3x3 rows (arrays or Float64Arrays), b: length 3. Returns a Float64Array(3) or null (Java: double[] or null).
  static solve3(a, b) {
    const det = a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0])
      + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
    let scale = 0.0;
    for (const row of a) {
      for (const v of row) {
        scale = Math.max(scale, Math.abs(v));
      }
    }
    if (!Number.isFinite(det) || Math.abs(det) <= 1e-12 * scale * scale * scale) {
      return null;
    }
    const x = new Float64Array(3);
    for (let c = 0; c < 3; c++) {
      const m = [a[0].slice(), a[1].slice(), a[2].slice()];
      for (let r = 0; r < 3; r++) {
        m[r][c] = b[r];
      }
      const dc = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
        + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
      x[c] = dc / det;
    }
    return x;
  }
}
