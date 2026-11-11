import { SimMath } from './SimMath.js?v=44da8aea';
import { AirframeSpec } from './AirframeSpec.js?v=4131aebb';
import { StabMode } from './StabMode.js?v=ef37a80a';
import { TpaMode } from './TpaMode.js?v=9b682a25';
import { ItermRelaxMode } from './ItermRelaxMode.js?v=2be3e748';
import { FcAxes } from './FcAxes.js?v=3da14453';
import { Pt1 } from './Pt1.js?v=afe0b0dc';
import { RcProcessor } from './RcProcessor.js?v=6af61b2c';
import { AttitudeController } from './AttitudeController.js?v=76cd8769';
import { AxisPidController } from './AxisPidController.js?v=6dddd1b2';
import { Mixer } from './Mixer.js?v=55ac43b6';
import { RateCurves } from './RateCurves.js?v=13dd073e';
import { ThrottleCurve } from './ThrottleCurve.js?v=6243615e';
import { FlightControllerConfig } from './FlightControllerConfig.js?v=b91ceb9e';

// DroneSim is not part of this port batch; only its PHYSICS_HZ constant is needed here (Java: DroneSim.PHYSICS_HZ = 2000).
const DroneSim = { PHYSICS_HZ: 2000 };

// Port of de.lardtom.propwash.sim.FlightController
// The private Java fields `pid` and `rates` collide with the accessor methods pid() / rates() in JS, so the fields are
// spelled `_pid` and `_rates` here; every other member keeps its Java name.
export class FlightController {
  static ANTI_GRAVITY_HZ = 5.0;
  static SAG_FILTER_HZ = 1.0;
  static REVERSAL_ITERM_HOLD_S = 0.25;

  rc = new RcProcessor();
  attitude = new AttitudeController();
  axes = [new AxisPidController(), new AxisPidController(), new AxisPidController()];
  mixer = new Mixer();
  gyroFilter = [new Pt1(), new Pt1(), new Pt1()];
  antiGravityFilter = new Pt1();
  sagFilter = new Pt1();

  gyro = new Float64Array(3);
  setpoint = new Float64Array(3);
  setpointFf = new Float64Array(3);
  duty = new Float64Array(AirframeSpec.MOTORS);
  motorOutput = new Float64Array(AirframeSpec.MOTORS);

  params = null;
  filters = null;
  _rates = null;
  _pid = null;
  dt = 0.0;
  divider = 1;
  airmodeLatched = false;
  airmodeJustLatched = false;
  saturatedPrev = false;
  throttleOut = 0.0;
  activeMode = StabMode.ACRO;
  mode3dActive = false;
  direction3d = 1;
  reversalHoldS = 0.0;
  antiGravity3dPrimed = false;

  configure(params, config, filters) {
    this.params = params;
    this.filters = filters;
    this._rates = config.rates;
    this._pid = config.pid;
    this.divider = filters.pidLoop.divider();
    this.dt = this.divider / DroneSim.PHYSICS_HZ;
    this.rc.configure(filters.rcSmoothingHz, this.dt);
    this.attitude.configure(this._pid.feedforwardSmoothingHz, this.dt);
    for (let a = 0; a < 3; a++) {
      this.gyroFilter[a].configure(filters.gyroLpfHz, this.dt);
      this.axes[a].configure(this._pid.itermRelaxCutoffHz, this._pid.feedforwardSmoothingHz, filters.dtermLpf1Hz,
        filters.dtermLpf2Hz, this.dt);
    }
    this.antiGravityFilter.configure(FlightController.ANTI_GRAVITY_HZ, this.dt);
    this.sagFilter.configure(FlightController.SAG_FILTER_HZ, this.dt);
    this.applyGains();
  }

  applyGains() {
    this.axes[FcAxes.ROLL].setGains(this._pid.roll, this.params.authorityRoll);
    this.axes[FcAxes.PITCH].setGains(this._pid.pitch, this.params.authorityPitch);
    this.axes[FcAxes.YAW].setGains(this._pid.yaw, this.params.authorityYawInstant);
  }

  updateProfiles(config) {
    this._rates = config.rates;
    this._pid = config.pid;
    this.attitude.configure(this._pid.feedforwardSmoothingHz, this.dt);
    for (let a = 0; a < 3; a++) {
      this.axes[a].configure(this._pid.itermRelaxCutoffHz, this._pid.feedforwardSmoothingHz, this.filters.dtermLpf1Hz,
        this.filters.dtermLpf2Hz, this.dt);
    }
    this.applyGains();
  }

  reset(gyroRaw, busVoltage, r, p, y, t) {
    for (let a = 0; a < 3; a++) {
      this.gyroFilter[a].reset(gyroRaw[a]);
      this.gyro[a] = gyroRaw[a];
      this.axes[a].reset(gyroRaw[a], 0.0);
      this.setpoint[a] = 0.0;
      this.setpointFf[a] = 0.0;
    }
    this.rc.reset(r, p, y, t, this._rates, this._pid);
    this.attitude.reset();
    this.antiGravityFilter.reset(this.rc.throttleOut);
    this.sagFilter.reset(busVoltage);
    this.airmodeLatched = false;
    this.airmodeJustLatched = false;
    this.saturatedPrev = false;
    this.throttleOut = 0.0;
    this.mode3dActive = false;
    this.direction3d = 1;
    this.reversalHoldS = 0.0;
    this.antiGravity3dPrimed = false;
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      this.duty[i] = 0.0;
      this.motorOutput[i] = 0.0;
    }
  }

  // Java overloads, dispatched on arguments.length:
  //   update(r, p, y, t, mode, armed, body, gyroRaw, busVoltage)                     -> mode3d = false, deadband3d = DEADBAND_3D
  //   update(r, p, y, t, mode, armed, body, gyroRaw, busVoltage, mode3d, deadband3d)
  update(r, p, y, t, mode, armed, body, gyroRaw, busVoltage, mode3d, deadband3d) {
    if (arguments.length <= 9) {
      this.update(r, p, y, t, mode, armed, body, gyroRaw, busVoltage, false, FlightControllerConfig.DEADBAND_3D);
      return;
    }
    const pid = this._pid;
    const rates = this._rates;
    const dt = this.dt;
    this.rc.update(r, p, y, t, rates, pid);
    let thr = this.rc.throttleOut;
    if (mode3d) {
      thr = ThrottleCurve.apply(pid, this.magnitude3d(this.rc.throttleStick, deadband3d, armed));
    } else {
      this.direction3d = 1;
      this.reversalHoldS = 0.0;
      this.antiGravity3dPrimed = false;
    }
    this.mode3dActive = mode3d;
    const signed = mode3d && this.direction3d < 0 ? -thr : thr;
    for (let a = 0; a < 3; a++) {
      this.gyro[a] = this.gyroFilter[a].apply(gyroRaw[a]);
    }
    const busFiltered = this.sagFilter.apply(busVoltage);
    const rollStick = this.rc.rollOut;
    const pitchStick = this.rc.pitchOut;
    const yawStick = this.rc.yawOut;
    const type = rates.type;
    this.activeMode = mode;
    switch (mode) {
      case StabMode.ANGLE: {
        const yawRate = RateCurves.rateDps(type, rates.yaw, yawStick);
        this.attitude.angle(body, rollStick, pitchStick, yawRate, pid, dt, this.setpoint);
        this.setpointFf[FcAxes.ROLL] = 0.0;
        this.setpointFf[FcAxes.PITCH] = 0.0;
        this.setpointFf[FcAxes.YAW] = this.setpoint[FcAxes.YAW];
        break;
      }
      case StabMode.HORIZON: {
        this.setpoint[FcAxes.ROLL] = RateCurves.rateDps(type, rates.roll, rollStick);
        this.setpoint[FcAxes.PITCH] = RateCurves.rateDps(type, rates.pitch, pitchStick);
        this.setpoint[FcAxes.YAW] = RateCurves.rateDps(type, rates.yaw, yawStick);
        for (let a = 0; a < 3; a++) {
          this.setpointFf[a] = this.setpoint[a];
        }
        this.attitude.horizon(body, rollStick, pitchStick, pid, this.setpoint);
        break;
      }
      default: {
        this.setpoint[FcAxes.ROLL] = RateCurves.rateDps(type, rates.roll, rollStick);
        this.setpoint[FcAxes.PITCH] = RateCurves.rateDps(type, rates.pitch, pitchStick);
        this.setpoint[FcAxes.YAW] = RateCurves.rateDps(type, rates.yaw, yawStick);
        for (let a = 0; a < 3; a++) {
          this.setpointFf[a] = this.setpoint[a];
        }
        this.attitude.reset();
      }
    }

    this.airmodeJustLatched = false;
    if (armed && pid.airmode && !this.airmodeLatched && thr >= pid.airmodeStartThrottlePercent / 100.0) {
      this.airmodeLatched = true;
      this.airmodeJustLatched = true;
    }
    const airmodeActive = armed && pid.airmode && this.airmodeLatched;
    let iActive = armed && (pid.airmode ? this.airmodeLatched : thr > 0.05);
    let ag;
    if (mode3d) {
      if (this.reversalHoldS > 0.0) {
        this.reversalHoldS -= dt;
        iActive = false;
      }
      if (!this.antiGravity3dPrimed) {
        this.antiGravityFilter.reset(signed);
        this.antiGravity3dPrimed = true;
      }
      const agSigned = this.antiGravityFilter.apply(signed);
      ag = 1.0 + (pid.antiGravityGain / 20.0) * SimMath.clamp01(8.0 * Math.abs(signed - agSigned));
    } else {
      const agThr = this.antiGravityFilter.apply(thr);
      ag = 1.0 + (pid.antiGravityGain / 20.0) * SimMath.clamp01(8.0 * Math.abs(thr - agThr));
    }
    const tpa = 1.0 - (pid.tpaRatePercent / 100.0)
      * SimMath.clamp01((thr - pid.tpaBreakpoint) / Math.max(1e-6, 1.0 - pid.tpaBreakpoint));
    const tpaP = pid.tpaMode === TpaMode.PD ? tpa : 1.0;
    const iLimit = pid.itermLimit / 1000.0;
    const ffLimit = pid.ffMaxRateLimitPercent / 100.0;
    const relaxMode = pid.itermRelax;
    let anySumSat = false;
    for (let a = 0; a < 3; a++) {
      const yaw = a === FcAxes.YAW;
      const relaxOn = relaxMode === ItermRelaxMode.RPY || (relaxMode === ItermRelaxMode.RP && !yaw);
      const sumLimit = (yaw ? pid.pidSumLimitYaw : pid.pidSumLimit) / 1000.0;
      const axisRates = a === FcAxes.ROLL ? rates.roll : (a === FcAxes.PITCH ? rates.pitch : rates.yaw);
      const maxRate = Math.max(1.0, RateCurves.maxRateDps(type, axisRates));
      this.axes[a].update(this.setpoint[a], this.setpointFf[a], this.gyro[a], dt, relaxOn, pid.itermRelaxThresholdDps,
        yaw ? 1.0 : ag, tpaP, tpa, iActive, this.saturatedPrev, iLimit, sumLimit, maxRate, ffLimit);
      anySumSat = anySumSat || this.axes[a].sumSaturated;
    }
    const tl = pid.thrustLinearPercent / 100.0;
    const reversed = mode3d && this.direction3d < 0;
    if (reversed) {
      this.mixer.mix(this.params, -this.axes[FcAxes.ROLL].output, -this.axes[FcAxes.PITCH].output, -this.axes[FcAxes.YAW].output,
        FlightController.compensateThrustLinear(thr, tl), airmodeActive, pid.propsOut);
    } else {
      this.mixer.mix(this.params, this.axes[FcAxes.ROLL].output, this.axes[FcAxes.PITCH].output, this.axes[FcAxes.YAW].output,
        FlightController.compensateThrustLinear(thr, tl), airmodeActive, pid.propsOut);
    }
    this.saturatedPrev = anySumSat || this.mixer.saturated;
    this.throttleOut = this.mixer.throttle;
    const idle = pid.motorIdlePercent / 100.0;
    const range = (1.0 - idle) * (pid.motorOutputLimitPercent / 100.0) * (1.0 - this.sagAttenuation(busFiltered));
    for (let i = 0; i < AirframeSpec.MOTORS; i++) {
      const o = FlightController.linearizeThrust(this.mixer.output[i], tl);
      this.motorOutput[i] = o;
      if (reversed) {
        this.duty[i] = armed ? -(idle + range * o) : 0.0;
      } else {
        this.duty[i] = armed ? idle + range * o : 0.0;
      }
    }
  }

  magnitude3d(stick, deadband, armed) {
    const low = 0.5 - deadband;
    const high = 0.5 + deadband;
    const previous = this.direction3d;
    let magnitude;
    if (stick <= low) {
      this.direction3d = -1;
      magnitude = low > 0.0 ? (low - stick) / low : 1.0;
    } else if (stick >= high) {
      this.direction3d = 1;
      magnitude = high < 1.0 ? (stick - high) / (1.0 - high) : 1.0;
    } else {
      if (!armed) {
        this.direction3d = 1;
      }
      magnitude = 0.0;
    }
    if (armed && previous !== this.direction3d) {
      this.reversalHoldS = FlightController.REVERSAL_ITERM_HOLD_S;
    }
    return SimMath.clamp01(magnitude);
  }

  signedThrottleOut() {
    return this.mode3dActive && this.direction3d < 0 ? -this.throttleOut : this.throttleOut;
  }

  static compensateThrustLinear(throttle, tl) {
    return tl > 0.0 ? tl * throttle * throttle + (1.0 - tl) * throttle : throttle;
  }

  static linearizeThrust(output, tl) {
    if (tl <= 0.0) {
      return output;
    }
    const b = (1.0 - tl) / (2.0 * tl);
    return Math.sqrt(output / tl + b * b) - b;
  }

  sagAttenuation(busVoltage) {
    const comp = this._pid.vbatSagCompensationPercent / 100.0;
    if (comp <= 0.0 || !(busVoltage > 0.5)) {
      return 0.0;
    }
    const full = this.params.chemistry.fullCellVoltage;
    const span = full - this.params.chemistry.emptyCellVoltage;
    if (span <= 0.0) {
      return 0.0;
    }
    const goodness = SimMath.clamp01((busVoltage / this.params.cells - this.params.chemistry.emptyCellVoltage) / span);
    return comp * span / full * goodness;
  }

  outputForDuty(duty, busVoltage) {
    const pid = this._pid;
    const idle = pid.motorIdlePercent / 100.0;
    const range = (1.0 - idle) * (pid.motorOutputLimitPercent / 100.0) * (1.0 - this.sagAttenuation(busVoltage));
    return (duty - idle) / range;
  }

  pid() {
    return this._pid;
  }

  rates() {
    return this._rates;
  }
}
