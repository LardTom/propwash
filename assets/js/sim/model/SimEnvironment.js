// Port of de.lardtom.propwash.sim.SimEnvironment (1:1, with the support grid of Propwash 0.6.0: heights of the
// ground under a 5 × 5 grid across the hitbox and under the stand points of accessories, filled by the pilot loop).
import { AirframeSpec } from './AirframeSpec.js?v=cfbc2e85';
import { Fluid } from './Fluid.js?v=3fdbbd97';
import { SnagField } from './SnagField.js?v=9acc5e95';

export class SimEnvironment {
  static SUPPORT_SIDE = 5;
  static SUPPORT_CELLS = SimEnvironment.SUPPORT_SIDE * SimEnvironment.SUPPORT_SIDE;
  static SUPPORT_RANGE = 0.5;
  static SUPPORT_RIM = 1.0E-6;
  static POINT_SUPPORT = AirframeSpec.ACCESSORY_POINTS + AirframeSpec.STAND_LEGS;

  groundDistance = Infinity;
  solidDistance = NaN;
  windX = 0.0;
  windY = 0.0;
  windZ = 0.0;
  gustIntensity = 0.0;
  airDensity = 1.225;
  ambientTempC = 20.0;
  fluid = Fluid.NONE;
  skyView = 1.0;
  snag = new SnagField();
  waterSurface = -Infinity;
  support = new Float64Array(SimEnvironment.SUPPORT_CELLS);
  supportX = 0.0;
  supportZ = 0.0;
  supportSpacing = 0.0;
  pointSupport = new Float64Array(SimEnvironment.POINT_SUPPORT);
  pointX = new Float64Array(SimEnvironment.POINT_SUPPORT);
  pointZ = new Float64Array(SimEnvironment.POINT_SUPPORT);
  pointCount = 0;

  static supportSpacing(width) {
    return Math.max(0.0, width - 2.0 * SimEnvironment.SUPPORT_RIM) / (SimEnvironment.SUPPORT_SIDE - 1);
  }

  static supportOffset(index, spacing) {
    // SUPPORT_SIDE / 2 is integer division in Java.
    return (index - (SimEnvironment.SUPPORT_SIDE >> 1)) * spacing;
  }

  static supportCell(ix, iz) {
    return iz * SimEnvironment.SUPPORT_SIDE + ix;
  }

  clearSupport() {
    this.supportSpacing = 0.0;
    this.support.fill(NaN);
    this.pointCount = 0;
  }

  copyTo(dst) {
    dst.groundDistance = this.groundDistance;
    dst.solidDistance = this.solidDistance;
    dst.windX = this.windX;
    dst.windY = this.windY;
    dst.windZ = this.windZ;
    dst.gustIntensity = this.gustIntensity;
    dst.airDensity = this.airDensity;
    dst.ambientTempC = this.ambientTempC;
    dst.fluid = this.fluid;
    dst.skyView = this.skyView;
    this.snag.copyTo(dst.snag);
    dst.waterSurface = this.waterSurface;
    dst.support.set(this.support);
    dst.supportX = this.supportX;
    dst.supportZ = this.supportZ;
    dst.supportSpacing = this.supportSpacing;
    dst.pointSupport.set(this.pointSupport);
    dst.pointX.set(this.pointX);
    dst.pointZ.set(this.pointZ);
    dst.pointCount = this.pointCount;
  }
}
