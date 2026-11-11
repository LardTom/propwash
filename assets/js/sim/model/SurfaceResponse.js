// Port of de.lardtom.propwash.sim.SurfaceResponse (1:1, Propwash 0.6.0): how a block surface answers a hit (restitution,
// grip, share of the impact that counts as damage). The record's accessors restitution() / grip() / impactScale() are
// fields here, equals() compares the three values like the record does.
import { SimMath } from './SimMath.js?v=44da8aea';

export class SurfaceResponse {
  static DRONE_RESTITUTION = -1.0;
  static MIN_GRIP = 0.05;
  static MAX_GRIP = 1.5;

  constructor(restitution, grip, impactScale) {
    this.restitution = restitution;
    this.grip = grip;
    this.impactScale = impactScale;
    Object.freeze(this);
  }

  static normal(friction) {
    return new SurfaceResponse(SurfaceResponse.DRONE_RESTITUTION, SurfaceResponse.gripOf(friction), 1.0);
  }

  static gripOf(friction) {
    return Math.max(SurfaceResponse.MIN_GRIP, Math.min(SurfaceResponse.MAX_GRIP, (1.0 - friction) / 0.4));
  }

  // The static impactScale(double) of the Java record (the instance value is the field impactScale).
  static impactScaleOf(value) {
    return SimMath.sanitize(value, 0.0, 1.0, 1.0);
  }

  writeTo(report) {
    report.surfaceRestitution = this.restitution;
    report.surfaceGrip = this.grip;
    report.surfaceImpactScale = this.impactScale;
  }

  softerThan(other) {
    const a = SurfaceResponse.impactScaleOf(this.impactScale);
    const b = SurfaceResponse.impactScaleOf(other.impactScale);
    if (a !== b) {
      return a < b;
    }
    return bounceRank(this.restitution) < bounceRank(other.restitution);
  }

  /** Record equality: Double.compare of every component (NaN equals NaN, -0 differs from 0). */
  equals(other) {
    return other instanceof SurfaceResponse && Object.is(this.restitution, other.restitution) && Object.is(this.grip, other.grip)
      && Object.is(this.impactScale, other.impactScale);
  }
}

function bounceRank(restitution) {
  return Number.isNaN(restitution) || restitution < 0.0 ? Infinity : restitution;
}

SurfaceResponse.NORMAL = new SurfaceResponse(SurfaceResponse.DRONE_RESTITUTION, 1.0, 1.0);
SurfaceResponse.BOUNCY = new SurfaceResponse(0.8, 1.0, 0.0);
SurfaceResponse.CUSHION = new SurfaceResponse(0.05, 1.5, 0.0);
SurfaceResponse.STICKY = new SurfaceResponse(0.0, 1.5, 0.0);

/** SurfaceResponse.Mix: the surface kind with the largest contact area (ties: the softer one). */
export class Mix {
  static KINDS = 8;
  static TIE = 1.0E-9;

  kinds = new Array(Mix.KINDS).fill(null);
  areas = new Float64Array(Mix.KINDS);
  count = 0;

  clear() {
    for (let i = 0; i < this.count; i++) {
      this.kinds[i] = null;
    }
    this.count = 0;
  }

  isEmpty() {
    return this.count === 0;
  }

  add(response, area) {
    if (response == null || !(area > 0.0) || area === Infinity) {
      return;
    }
    for (let i = 0; i < this.count; i++) {
      if (this.kinds[i].equals(response)) {
        this.areas[i] += area;
        return;
      }
    }
    if (this.count < Mix.KINDS) {
      this.kinds[this.count] = response;
      this.areas[this.count] = area;
      this.count++;
    }
  }

  result() {
    let best = null;
    let bestArea = 0.0;
    for (let i = 0; i < this.count; i++) {
      const area = this.areas[i];
      const kind = this.kinds[i];
      if (best == null || area > bestArea + Mix.TIE || area >= bestArea - Mix.TIE && kind.softerThan(best)) {
        best = kind;
        bestArea = Math.max(bestArea, area);
      }
    }
    return best;
  }
}
SurfaceResponse.Mix = Mix;
