// Port of de.lardtom.propwash.sim.GroundEffect (1:1).
import { ModelConstants } from './ModelConstants.js?v=760466ce';

export class GroundEffect {
  static factor(radius, height, spacing) {
    if (!(height < Infinity)) {
      return 1.0;
    }
    const z = Math.max(height, 0.5 * radius);
    const r2 = radius * radius;
    const a = radius / (4.0 * z);
    const d2 = spacing * spacing;
    const z2 = 4.0 * z * z;
    const t1 = d2 + z2;
    const t2 = 2.0 * d2 + z2;
    const den = 1.0 - a * a - r2 * z / Math.sqrt(t1 * t1 * t1) - 0.5 * r2 * z / Math.sqrt(t2 * t2 * t2);
    if (den <= 1.0 / ModelConstants.GE_CAP) {
      return ModelConstants.GE_CAP;
    }
    return 1.0 / den;
  }
}
