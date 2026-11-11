import { SimMath } from './SimMath.js?v=44da8aea';
import { Pt1 } from './Pt1.js?v=afe0b0dc';
import { FcAxes } from './FcAxes.js?v=3da14453';
import { StrictMath } from './StrictMath.js?v=e765e983';

// Port of de.lardtom.propwash.sim.AttitudeController
// StrictMath.atan2 is the fdlibm port of StrictMath.js (bit-identical to the JVM).
export class AttitudeController {
  ffPitch = new Pt1();
  ffRoll = new Pt1();
  prevRollTarget = 0.0;
  prevPitchTarget = 0.0;
  primed = false;
  lastTwistCos = 1.0;
  lastTwistSin = 0.0;

  errorBodyX = 0.0;
  errorBodyZ = 0.0;
  errorDeg = 0.0;

  configure(ffHz, dt) {
    this.ffPitch.configure(ffHz, dt);
    this.ffRoll.configure(ffHz, dt);
  }

  reset() {
    this.primed = false;
    this.ffPitch.reset(0.0);
    this.ffRoll.reset(0.0);
    this.errorBodyX = 0.0;
    this.errorBodyZ = 0.0;
    this.errorDeg = 0.0;
  }

  static twistHeading(b, fallback) {
    const n = b.qy * b.qy + b.qw * b.qw;
    if (n < 1e-12) {
      return fallback;
    }
    return SimMath.wrapPi(2.0 * StrictMath.atan2(b.qy, b.qw));
  }

  levelError(b, rollTargetDeg, pitchTargetDeg) {
    const phi = rollTargetDeg * SimMath.RAD;
    const theta = pitchTargetDeg * SimMath.RAD;
    let hx;
    let hy;
    let hz;
    if (phi === 0.0 && theta === 0.0) {
      hx = 0.0;
      hy = 1.0;
      hz = 0.0;
    } else {
      const cp = SimMath.cos(phi);
      hx = -SimMath.sin(phi);
      hy = cp * SimMath.cos(theta);
      hz = cp * SimMath.sin(theta);
    }
    let tx;
    const ty = hy;
    let tz;
    if (hx === 0.0 && hz === 0.0) {
      tx = 0.0;
      tz = 0.0;
    } else {
      const n = b.qw * b.qw + b.qy * b.qy;
      if (n >= 1e-12) {
        this.lastTwistCos = (b.qw * b.qw - b.qy * b.qy) / n;
        this.lastTwistSin = 2.0 * b.qw * b.qy / n;
      }
      const c = this.lastTwistCos;
      const s = this.lastTwistSin;
      tx = c * hx + s * hz;
      tz = -s * hx + c * hz;
    }
    const ux = b.r01;
    const uy = b.r11;
    const uz = b.r21;
    const cx = uy * tz - uz * ty;
    const cy = uz * tx - ux * tz;
    const cz = ux * ty - uy * tx;
    const cn = Math.sqrt(cx * cx + cy * cy + cz * cz);
    const dot = ux * tx + uy * ty + uz * tz;
    const alpha = StrictMath.atan2(cn, dot);
    let ex;
    let ey;
    let ez;
    if (cn > 1e-9) {
      const k = alpha / cn;
      ex = cx * k;
      ey = cy * k;
      ez = cz * k;
    } else if (dot < 0.0) {
      ex = b.r02 * Math.PI;
      ey = b.r12 * Math.PI;
      ez = b.r22 * Math.PI;
    } else {
      ex = 0.0;
      ey = 0.0;
      ez = 0.0;
    }
    this.errorBodyX = b.r00 * ex + b.r10 * ey + b.r20 * ez;
    this.errorBodyZ = b.r02 * ex + b.r12 * ey + b.r22 * ez;
    this.errorDeg = alpha * SimMath.DEG;
  }

  angle(b, stickRoll, stickPitch, yawRateDps, pid, dt, sp) {
    const rollTarget = stickRoll * pid.angleLimitDeg;
    const pitchTarget = stickPitch * pid.angleLimitDeg;
    if (!this.primed) {
      this.prevRollTarget = rollTarget;
      this.prevPitchTarget = pitchTarget;
      this.primed = true;
    }
    const dRoll = this.ffRoll.apply((rollTarget - this.prevRollTarget) / dt);
    const dPitch = this.ffPitch.apply((pitchTarget - this.prevPitchTarget) / dt);
    this.prevRollTarget = rollTarget;
    this.prevPitchTarget = pitchTarget;
    this.levelError(b, rollTarget, pitchTarget);
    const ka = pid.angleStrength / 10.0;
    const ffScale = pid.angleFeedforwardPercent / 100.0;
    const yaw = -yawRateDps * SimMath.RAD;
    const k = pid.angleEarthRefPercent / 100.0;
    let wx = ka * this.errorBodyX + ffScale * dPitch * SimMath.RAD + k * b.r10 * yaw;
    const wy = k * b.r11 * yaw + (1.0 - k) * yaw;
    let wz = ka * this.errorBodyZ + ffScale * dRoll * SimMath.RAD + k * b.r12 * yaw;
    const limit = pid.angleMaxRateDps * SimMath.RAD;
    wx = SimMath.clamp(wx, -limit, limit);
    wz = SimMath.clamp(wz, -limit, limit);
    sp[FcAxes.ROLL] = FcAxes.rollDps(wz);
    sp[FcAxes.PITCH] = FcAxes.pitchDps(wx);
    sp[FcAxes.YAW] = FcAxes.yawDps(wy);
  }

  horizon(b, stickRoll, stickPitch, pid, sp) {
    this.primed = false;
    this.levelError(b, stickRoll * pid.angleLimitDeg, stickPitch * pid.angleLimitDeg);
    const stick = Math.max(Math.abs(stickRoll), Math.abs(stickPitch));
    const tiltDeg = b.tiltRad() * SimMath.DEG;
    const w = (pid.horizonStrength / 100.0)
      * SimMath.clamp01(1.0 - stick / (pid.horizonStickTransitionPercent / 100.0))
      * SimMath.clamp01(1.0 - tiltDeg / pid.horizonLimitDeg);
    const ka = pid.angleStrength / 10.0;
    sp[FcAxes.ROLL] += w * ka * FcAxes.rollDps(this.errorBodyZ);
    sp[FcAxes.PITCH] += w * ka * FcAxes.pitchDps(this.errorBodyX);
  }
}
