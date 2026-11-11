// Port of de.lardtom.propwash.audio.MotorControl (1:1): the parameter block the game thread writes and the synth reads.
// In the browser one instance lives on the main thread (written by audio.js like DroneVoice writes it) and one in the
// audio worklet (audio-worklet.js copies each published snapshot into it). Fields whose Java name equals an accessor are
// stored as _name. The Java float fields are plain doubles here.

export class MotorControl {
  static MOTORS = 4;
  static MAX_RPM = 200_000.0;

  constructor() {
    this._rpm = new Float64Array(MotorControl.MOTORS);
    this._load = new Float64Array(MotorControl.MOTORS);
    this._wash = 0.0;
    this._airflow = 0.0;
    this._doppler = 1.0;
    this._gain = 0.0;
    this._brightnessHz = 14_000.0;
    this._smoothingSeconds = 0.03;
    this._active = true;
    this._onboard = true;
    this._impulseCount = 0;
    this._impulseStrength = 0.0;
    this._version = 0;
  }

  setMotor(motor, rpm, load) {
    if (motor < 0 || motor >= MotorControl.MOTORS) {
      return;
    }
    this._rpm[motor] = MotorControl.sanitize(rpm, 0.0, MotorControl.MAX_RPM);
    this._load[motor] = MotorControl.sanitize(load, 0.0, 1.0);
  }

  setWash(wash) {
    this._wash = MotorControl.sanitize(wash, 0.0, 1.0);
  }

  setAirflow(airflow) {
    this._airflow = MotorControl.sanitize(airflow, 0.0, 1.0);
  }

  setDoppler(factor) {
    this._doppler = Number.isFinite(factor) ? MotorControl.sanitize(factor, 0.5, 2.0) : 1.0;
  }

  setGain(gain) {
    this._gain = MotorControl.sanitize(gain, 0.0, 2.0);
  }

  setBrightnessHz(hz) {
    this._brightnessHz = MotorControl.sanitize(hz, 200.0, 20_000.0);
  }

  setSmoothingSeconds(seconds) {
    this._smoothingSeconds = MotorControl.sanitize(seconds, 0.001, 0.5);
  }

  setActive(active) {
    this._active = active;
  }

  setOnboard(onboard) {
    this._onboard = onboard;
  }

  impulse(strength) {
    this._impulseStrength = MotorControl.sanitize(strength, 0.0, 1.0);
    this._impulseCount = (this._impulseCount + 1) | 0;
  }

  publish() {
    this._version = (this._version + 1) | 0;
  }

  version() {
    return this._version;
  }

  rpm(motor) {
    return this._rpm[motor];
  }

  load(motor) {
    return this._load[motor];
  }

  wash() {
    return this._wash;
  }

  airflow() {
    return this._airflow;
  }

  doppler() {
    return this._doppler;
  }

  gain() {
    return this._gain;
  }

  brightnessHz() {
    return this._brightnessHz;
  }

  smoothingSeconds() {
    return this._smoothingSeconds;
  }

  active() {
    return this._active;
  }

  onboard() {
    return this._onboard;
  }

  impulseCount() {
    return this._impulseCount;
  }

  impulseStrength() {
    return this._impulseStrength;
  }

  maxRpm() {
    let max = 0.0;
    for (let i = 0; i < MotorControl.MOTORS; i++) {
      max = Math.max(max, this._rpm[i]);
    }
    return max;
  }

  static sanitize(value, lo, hi) {
    if (!Number.isFinite(value)) {
      return lo;
    }
    return value < lo ? lo : (value > hi ? hi : value);
  }
}
