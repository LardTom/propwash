// Port of de.lardtom.propwash.sim.SimEnvironment (1:1).
import { Fluid } from './Fluid.js?v=3fdbbd97';
import { SnagField } from './SnagField.js?v=1e0820a8';

export class SimEnvironment {
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
  }
}
