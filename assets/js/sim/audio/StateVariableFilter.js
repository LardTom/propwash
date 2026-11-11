// Port of de.lardtom.propwash.audio.StateVariableFilter (1:1): Cytomic/Simper trapezoidal SVF.
// Fields whose Java name equals an accessor (low/band/high) are stored as _low/_band/_high. Plain doubles.

export class StateVariableFilter {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.a1 = 0.0;
    this.a2 = 0.0;
    this.a3 = 0.0;
    this.k = 0.0;
    this.ic1 = 0.0;
    this.ic2 = 0.0;
    this._low = 0.0;
    this._band = 0.0;
    this._high = 0.0;
    this.setup(1000.0, 0.707);
  }

  setup(cutoffHz, q) {
    const fc = Math.max(10.0, Math.min(cutoffHz, this.sampleRate * 0.45));
    const g = Math.tan(Math.PI * fc / this.sampleRate);
    const kk = 1.0 / Math.max(0.1, q);
    const aa1 = 1.0 / (1.0 + g * (g + kk));
    const aa2 = g * aa1;
    this.k = kk;
    this.a1 = aa1;
    this.a2 = aa2;
    this.a3 = g * aa2;
  }

  process(input) {
    const v3 = input - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2.0 * v1 - this.ic1;
    this.ic2 = 2.0 * v2 - this.ic2;
    if (!(Math.abs(this.ic1) < 1.0e6) || !(Math.abs(this.ic2) < 1.0e6)) {
      this.ic1 = 0.0;
      this.ic2 = 0.0;
    }
    this._band = v1;
    this._low = v2;
    this._high = input - this.k * v1 - v2;
  }

  low() {
    return this._low;
  }

  band() {
    return this._band;
  }

  high() {
    return this._high;
  }

  reset() {
    this.ic1 = 0.0;
    this.ic2 = 0.0;
    this._low = 0.0;
    this._band = 0.0;
    this._high = 0.0;
  }
}
