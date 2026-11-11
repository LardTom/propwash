import { SimMath } from './SimMath.js?v=44da8aea';

// java.lang.Math.round(double): half up, NaN -> 0.
const javaRound = (x) => (Number.isNaN(x) ? 0 : Math.floor(x + 0.5));

// Port of de.lardtom.propwash.sim.HoldSettings
export class HoldSettings {
  altP = 50;
  altI = 30;
  altD = 40;
  climbRateCms = 150;
  throttleDeadbandPercent = 10;
  midThrottle = false;
  posP = 30;
  posI = 20;
  posD = 40;
  posMaxAngleDeg = 20;
  stickDeadbandPercent = 8;
  minSatellites = 8;

  copy() {
    const c = new HoldSettings();
    c.altP = this.altP;
    c.altI = this.altI;
    c.altD = this.altD;
    c.climbRateCms = this.climbRateCms;
    c.throttleDeadbandPercent = this.throttleDeadbandPercent;
    c.midThrottle = this.midThrottle;
    c.posP = this.posP;
    c.posI = this.posI;
    c.posD = this.posD;
    c.posMaxAngleDeg = this.posMaxAngleDeg;
    c.stickDeadbandPercent = this.stickDeadbandPercent;
    c.minSatellites = this.minSatellites;
    return c;
  }

  sanitize() {
    this.altP = SimMath.sanitize(this.altP, 0, 200, 50);
    this.altI = SimMath.sanitize(this.altI, 0, 200, 30);
    this.altD = SimMath.sanitize(this.altD, 0, 200, 40);
    this.climbRateCms = SimMath.sanitize(this.climbRateCms, 20, 1000, 150);
    this.throttleDeadbandPercent = SimMath.sanitize(this.throttleDeadbandPercent, 2, 40, 10);
    this.posP = SimMath.sanitize(this.posP, 0, 200, 30);
    this.posI = SimMath.sanitize(this.posI, 0, 200, 20);
    this.posD = SimMath.sanitize(this.posD, 0, 200, 40);
    this.posMaxAngleDeg = SimMath.sanitize(this.posMaxAngleDeg, 5, 45, 20);
    this.stickDeadbandPercent = SimMath.sanitize(this.stickDeadbandPercent, 2, 30, 8);
    this.minSatellites = javaRound(SimMath.sanitize(this.minSatellites, 5, 12, 8));
  }
}
