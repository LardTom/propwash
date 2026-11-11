// Port of de.lardtom.propwash.audio.SynthMath (1:1).
// Numbers: plain doubles (the Java casts to float only to store; the extra precision is inaudible). The sine table is a
// Float32Array like the Java float[].

const TABLE_BITS = 12;
const TABLE_SIZE = 1 << TABLE_BITS;
const SINE = new Float32Array(TABLE_SIZE + 1);
for (let i = 0; i <= TABLE_SIZE; i++) {
  SINE[i] = Math.sin(2.0 * Math.PI * i / TABLE_SIZE);
}

export class SynthMath {
  static TABLE_BITS = TABLE_BITS;
  static TABLE_SIZE = TABLE_SIZE;
  static SINE = SINE;

  /** sin(2π · cycles) from the interpolated table. */
  static sinCycles(cycles) {
    let fraction = cycles - Math.trunc(cycles);
    if (fraction < 0.0) {
      fraction += 1.0;
    }
    const position = fraction * TABLE_SIZE;
    let index = Math.trunc(position);
    if (index >= TABLE_SIZE) {
      index = TABLE_SIZE - 1;
    }
    const t = position - index;
    const a = SINE[index];
    return a + t * (SINE[index + 1] - a);
  }

  static softClip(x) {
    if (x >= 3.0) {
      return 1.0;
    }
    if (x <= -3.0) {
      return -1.0;
    }
    const x2 = x * x;
    const y = x * (27.0 + x2) / (27.0 + 9.0 * x2);
    return y > 1.0 ? 1.0 : (y < -1.0 ? -1.0 : y);
  }

  static onePoleCoefficient(cutoffHz, sampleRate) {
    const hz = Math.max(1.0, Math.min(cutoffHz, sampleRate * 0.45));
    return 1.0 - Math.exp(-2.0 * Math.PI * hz / sampleRate);
  }

  static smoothingCoefficient(seconds, sampleRate) {
    const s = Math.max(1.0e-4, seconds);
    return 1.0 - Math.exp(-1.0 / (s * sampleRate));
  }

  /** float sample -> 16-bit PCM value (Java short), clamped, NaN -> 0. */
  static toPcm16(sample) {
    let s = sample !== sample ? 0.0 : sample;
    if (s > 1.0) {
      s = 1.0;
    } else if (s < -1.0) {
      s = -1.0;
    }
    return Math.floor(s * 32767.0 + 0.5);
  }
}
