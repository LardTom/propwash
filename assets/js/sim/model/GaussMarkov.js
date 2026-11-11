// Port of de.lardtom.propwash.sim.GaussMarkov (1:1).

export class GaussMarkov {
  phi = 0.0;
  drive = 0.0;
  value = 0.0;

  configure(tauSeconds, dt) {
    this.phi = Math.exp(-dt / Math.max(dt, tauSeconds));
    this.drive = Math.sqrt(Math.max(0.0, 1.0 - this.phi * this.phi));
  }

  randomize(rng) {
    this.value = rng.gauss();
  }

  advance(rng) {
    this.value = this.phi * this.value + this.drive * rng.gauss();
    return this.value;
  }
}
