// Port of de.lardtom.propwash.sim.SimTuning (1:1).
import { ModelConstants } from './ModelConstants.js?v=760466ce';
import { SimMath } from './SimMath.js?v=44da8aea';

export class SimTuning {
  static GRAVITY_MIN = 0.0;
  static GRAVITY_MAX = 10.0;
  static GRAVITY_REFERENCE_MIN = 0.01;
  static BATTERY_SCALE_MIN = 0.01;
  static BATTERY_SCALE_MAX = 10.0;

  propWash = true;
  propWashScale = 1.0;
  turbulenceScale = 1.0;
  wakeField = true;
  groundEffect = true;
  groundEffectScale = 1.0;
  translationalLiftScale = 1.0;
  dragScale = 1.0;
  windScale = 1.0;
  batterySag = true;
  infiniteBattery = false;
  batteryScale = 1.0;
  crashDisarm = true;
  crashSpeedScale = 1.0;
  restitutionScale = 1.0;
  propStrikes = true;
  thermalEffects = false;
  thermalLimits = true;
  escOvervoltage = true;
  sleepEnabled = true;
  gyroNoiseDps = 0.2;
  gyroVibrationDps = 1.0;
  gravityScale = 1.0;
  partCompatibility = true;

  copy() {
    const c = new SimTuning();
    c.propWash = this.propWash;
    c.propWashScale = this.propWashScale;
    c.turbulenceScale = this.turbulenceScale;
    c.wakeField = this.wakeField;
    c.groundEffect = this.groundEffect;
    c.groundEffectScale = this.groundEffectScale;
    c.translationalLiftScale = this.translationalLiftScale;
    c.dragScale = this.dragScale;
    c.windScale = this.windScale;
    c.batterySag = this.batterySag;
    c.infiniteBattery = this.infiniteBattery;
    c.batteryScale = this.batteryScale;
    c.crashDisarm = this.crashDisarm;
    c.crashSpeedScale = this.crashSpeedScale;
    c.restitutionScale = this.restitutionScale;
    c.propStrikes = this.propStrikes;
    c.thermalEffects = this.thermalEffects;
    c.thermalLimits = this.thermalLimits;
    c.escOvervoltage = this.escOvervoltage;
    c.sleepEnabled = this.sleepEnabled;
    c.gyroNoiseDps = this.gyroNoiseDps;
    c.gyroVibrationDps = this.gyroVibrationDps;
    c.gravityScale = this.gravityScale;
    c.partCompatibility = this.partCompatibility;
    return c;
  }

  sanitize() {
    this.propWashScale = SimMath.sanitize(this.propWashScale, 0, 4, 1.0);
    this.turbulenceScale = SimMath.sanitize(this.turbulenceScale, 0, 4, 1.0);
    this.groundEffectScale = SimMath.sanitize(this.groundEffectScale, 0, 4, 1.0);
    this.translationalLiftScale = SimMath.sanitize(this.translationalLiftScale, 0, 4, 1.0);
    this.dragScale = SimMath.sanitize(this.dragScale, 0, 4, 1.0);
    this.windScale = SimMath.sanitize(this.windScale, 0, 4, 1.0);
    this.crashSpeedScale = SimMath.sanitize(this.crashSpeedScale, 0.25, 10, 1.0);
    this.restitutionScale = SimMath.sanitize(this.restitutionScale, 0, 4, 1.0);
    this.gyroNoiseDps = SimMath.sanitize(this.gyroNoiseDps, 0, 20, 0.2);
    this.gyroVibrationDps = SimMath.sanitize(this.gyroVibrationDps, 0, 20, 1.0);
    this.gravityScale = SimMath.sanitize(this.gravityScale, SimTuning.GRAVITY_MIN, SimTuning.GRAVITY_MAX, 1.0);
    this.batteryScale = SimMath.sanitize(this.batteryScale, SimTuning.BATTERY_SCALE_MIN, SimTuning.BATTERY_SCALE_MAX, 1.0);
  }

  gravity() {
    return ModelConstants.G * this.gravityScale;
  }

  static referenceGravity(gravity) {
    return Math.max(gravity, ModelConstants.G * SimTuning.GRAVITY_REFERENCE_MIN);
  }
}
