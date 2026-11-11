import { SimMath } from './SimMath.js?v=44da8aea';
import { Pt1 } from './Pt1.js?v=afe0b0dc';
import { PidAutoTune } from './PidAutoTune.js?v=7b785c0c';

// Port of de.lardtom.propwash.sim.AxisPidController
export class AxisPidController {
  relaxFilter = new Pt1();
  ffFilter = new Pt1();
  dFilter1 = new Pt1();
  dFilter2 = new Pt1();
  prevDGyro = 0.0;
  prevSpFf = 0.0;

  kp = 0.0;
  ki = 0.0;
  kd = 0.0;
  kf = 0.0;
  iTerm = 0.0;
  pOut = 0.0;
  dOut = 0.0;
  fOut = 0.0;
  sum = 0.0;
  output = 0.0;
  sumSaturated = false;

  configure(relaxHz, ffHz, d1Hz, d2Hz, dt) {
    this.relaxFilter.configure(relaxHz, dt);
    this.ffFilter.configure(ffHz, dt);
    this.dFilter1.configure(d1Hz, dt);
    this.dFilter2.configure(d2Hz, dt);
  }

  setGains(gains, authority) {
    this.kp = gains.p * PidAutoTune.P_SCALE;
    this.ki = gains.i * PidAutoTune.I_SCALE;
    this.kd = gains.d * PidAutoTune.D_SCALE;
    this.kf = authority > 0.0 ? (gains.ff / 100.0) * SimMath.RAD / authority : 0.0;
  }

  reset(gyro, setpoint) {
    this.relaxFilter.reset(setpoint);
    this.ffFilter.reset(0.0);
    this.dFilter1.reset(gyro);
    this.dFilter2.reset(gyro);
    this.prevDGyro = gyro;
    this.prevSpFf = 0.0;
    this.iTerm = 0.0;
    this.pOut = 0.0;
    this.dOut = 0.0;
    this.fOut = 0.0;
    this.sum = 0.0;
    this.output = 0.0;
    this.sumSaturated = false;
  }

  update(sp, spFf, gyro, dt, relaxOn, relaxThreshold, antiGravity, tpaP, tpaD, iActive, saturatedPrev, iLimit, sumLimit,
    maxRate, ffLimitFraction) {
    const err = sp - gyro;
    const relaxed = this.relaxFilter.apply(sp);
    const relax = relaxOn ? Math.max(0.0, 1.0 - Math.abs(sp - relaxed) / relaxThreshold) : 1.0;
    const dI = this.ki * err * relax * antiGravity * dt;
    let i = this.iTerm;
    if (!(saturatedPrev && Math.sign(dI) === Math.sign(i) && i !== 0.0)) {
      i = SimMath.clamp(i + dI, -iLimit, iLimit);
    }
    this.iTerm = iActive ? i : 0.0;
    this.pOut = this.kp * err * tpaP;
    const g = this.dFilter2.apply(this.dFilter1.apply(gyro));
    this.dOut = -this.kd * (g - this.prevDGyro) / dt * tpaD;
    this.prevDGyro = g;
    const spd = this.ffFilter.apply((spFf - this.prevSpFf) / dt);
    this.prevSpFf = spFf;
    let f = this.kf * spd;
    if (Math.sign(spd) === Math.sign(sp) && Math.abs(sp) > ffLimitFraction * maxRate && ffLimitFraction < 1.0) {
      f *= SimMath.clamp01((maxRate - Math.abs(sp)) / ((1.0 - ffLimitFraction) * maxRate));
    }
    this.fOut = f;
    const total = this.pOut + this.iTerm + this.dOut + this.fOut;
    this.sum = total;
    this.output = SimMath.clamp(total, -sumLimit, sumLimit);
    this.sumSaturated = Math.abs(total) >= sumLimit;
    return this.output;
  }
}
