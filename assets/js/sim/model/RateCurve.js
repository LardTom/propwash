import { SimMath } from './SimMath.js?v=44da8aea';

// Port of de.lardtom.propwash.sim.RateCurve
export class RateCurve {
  rcRate = 1.0;
  superRate = 0.70;
  rcExpo = 0.0;
  centerRateDps = 70.0;
  maxRateDps = 670.0;
  actualExpo = 0.0;

  copy() {
    const c = new RateCurve();
    c.rcRate = this.rcRate;
    c.superRate = this.superRate;
    c.rcExpo = this.rcExpo;
    c.centerRateDps = this.centerRateDps;
    c.maxRateDps = this.maxRateDps;
    c.actualExpo = this.actualExpo;
    return c;
  }

  sanitize() {
    this.rcRate = SimMath.sanitize(this.rcRate, 0.01, 2.55, 1.0);
    this.superRate = SimMath.sanitize(this.superRate, 0.0, 0.99, 0.70);
    this.rcExpo = SimMath.sanitize(this.rcExpo, 0.0, 1.0, 0.0);
    this.centerRateDps = SimMath.sanitize(this.centerRateDps, 10.0, 1998.0, 70.0);
    this.maxRateDps = SimMath.sanitize(this.maxRateDps, this.centerRateDps, 1998.0, Math.max(670.0, this.centerRateDps));
    this.actualExpo = SimMath.sanitize(this.actualExpo, 0.0, 1.0, 0.0);
  }
}
