// Port of de.lardtom.propwash.sim.Gusts (1:1).

export class Gusts {
  static TAU = 1.2;

  x = 0.0;
  y = 0.0;
  z = 0.0;
  gain = 0.0;
  scale = 0.0;

  configure(updateDt) {
    this.gain = updateDt / (updateDt + Gusts.TAU);
    this.scale = Math.sqrt((2.0 - this.gain) / this.gain);
  }

  reset() {
    this.x = 0.0;
    this.y = 0.0;
    this.z = 0.0;
  }

  advance(rng, intensity, windSpeed, windScale) {
    const sigma = intensity * (0.5 + 0.3 * windSpeed) * windScale;
    let tx = 0.0;
    let ty = 0.0;
    let tz = 0.0;
    if (sigma > 0.0) {
      const s = sigma * this.scale;
      tx = s * rng.gauss();
      ty = 0.5 * s * rng.gauss();
      tz = s * rng.gauss();
    }
    this.x += this.gain * (tx - this.x);
    this.y += this.gain * (ty - this.y);
    this.z += this.gain * (tz - this.z);
  }
}
