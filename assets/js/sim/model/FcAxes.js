import { SimMath } from './SimMath.js?v=44da8aea';

// Port of de.lardtom.propwash.sim.FcAxes
export class FcAxes {
  static ROLL = 0;
  static PITCH = 1;
  static YAW = 2;

  static rollDps(bodyZ) {
    return bodyZ * SimMath.DEG;
  }

  static pitchDps(bodyX) {
    return bodyX * SimMath.DEG;
  }

  static yawDps(bodyY) {
    return -bodyY * SimMath.DEG;
  }
}
