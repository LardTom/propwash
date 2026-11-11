import { ArmBlocker } from './ArmBlocker.js?v=3bfdfa7f';
import { DisarmReason } from './DisarmReason.js?v=b5a5924f';
import { Fluid } from './Fluid.js?v=3fdbbd97';

// Port of de.lardtom.propwash.sim.Arming
// The Java parameter name `in` (PilotInput) is a reserved word in JS and is spelled `in_` here.
export class Arming {
  static CRASH_COOLDOWN_S = 1.0;
  static REBOOT_S = 0.5;
  static BATTERY_EMPTY_SOC = 0.03;
  static AUTO_ARM_WAIT = ArmBlocker.THROTTLE_NOT_LOW.bit() | ArmBlocker.THROTTLE_NOT_CENTERED.bit() | ArmBlocker.CRASH_COOLDOWN.bit()
    | ArmBlocker.REBOOTING.bit() | ArmBlocker.TURTLE_AIRBORNE.bit();

  armed = false;
  lastSwitch = false;
  switchNeedsReset = false;
  pendingSwitchCheck = true;
  autoArm = false;
  autoArmed = false;
  crashCooldownSubsteps = 0;
  rebootSubsteps = 0;
  linkLostSubsteps = 0;
  landingSubsteps = 0;
  failsafeStage = 0;
  blockers = 0;
  turtle = false;
  turtleDone = false;
  lastDisarmReason = DisarmReason.NONE;

  reset() {
    this.armed = false;
    this.switchNeedsReset = false;
    this.pendingSwitchCheck = true;
    this.autoArm = false;
    this.autoArmed = false;
    this.linkLostSubsteps = 0;
    this.landingSubsteps = 0;
    this.failsafeStage = 0;
    this.turtle = false;
    this.turtleDone = false;
  }

  // Java overloads, dispatched on arguments.length:
  //   conditions(in, cfg, tiltDeg, soc, buildable, crashCooldown, rebooting, fluid)                -> hardwareFault = false
  //   conditions(in, cfg, tiltDeg, soc, buildable, crashCooldown, rebooting, fluid, hardwareFault)
  static conditions(in_, cfg, tiltDeg, soc, buildable, crashCooldown, rebooting, fluid, hardwareFault) {
    if (arguments.length <= 8) {
      return Arming.conditions(in_, cfg, tiltDeg, soc, buildable, crashCooldown, rebooting, fluid, false);
    }
    let mask = 0;
    if (in_.throttle > cfg.armThrottleMax) {
      mask |= ArmBlocker.THROTTLE_NOT_LOW.bit();
    }
    if (tiltDeg > cfg.armMaxTiltDeg) {
      mask |= ArmBlocker.TILTED.bit();
    }
    return mask | Arming.common(in_, soc, buildable, crashCooldown, rebooting, fluid, hardwareFault);
  }

  static conditions3d(in_, cfg, tiltDeg, soc, buildable, crashCooldown, rebooting, fluid, hardwareFault) {
    let mask = 0;
    if (Math.abs(in_.throttle - 0.5) > cfg.deadband3d) {
      mask |= ArmBlocker.THROTTLE_NOT_CENTERED.bit();
    }
    if (tiltDeg > cfg.armMaxTiltDeg && tiltDeg < 180.0 - cfg.armMaxTiltDeg) {
      mask |= ArmBlocker.TILTED.bit();
    }
    return mask | Arming.common(in_, soc, buildable, crashCooldown, rebooting, fluid, hardwareFault);
  }

  static conditionsTurtle(in_, cfg, soc, buildable, crashCooldown, rebooting, fluid, hardwareFault, resting) {
    let mask = 0;
    if (in_.mode3d) {
      if (Math.abs(in_.throttle - 0.5) > cfg.deadband3d) {
        mask |= ArmBlocker.THROTTLE_NOT_CENTERED.bit();
      }
    } else if (in_.throttle > cfg.armThrottleMax) {
      mask |= ArmBlocker.THROTTLE_NOT_LOW.bit();
    }
    if (!resting) {
      mask |= ArmBlocker.TURTLE_AIRBORNE.bit();
    }
    return mask | Arming.common(in_, soc, buildable, crashCooldown, rebooting, fluid, hardwareFault);
  }

  static common(in_, soc, buildable, crashCooldown, rebooting, fluid, hardwareFault) {
    let mask = 0;
    if (soc <= Arming.BATTERY_EMPTY_SOC) {
      mask |= ArmBlocker.PACK_DEPLETED.bit();
    }
    if (!buildable) {
      mask |= ArmBlocker.BUILD_INVALID.bit();
    }
    if (crashCooldown) {
      mask |= ArmBlocker.CRASH_COOLDOWN.bit();
    }
    if (!in_.linkOk) {
      mask |= ArmBlocker.FAILSAFE.bit();
    }
    if (rebooting) {
      mask |= ArmBlocker.REBOOTING.bit();
    }
    if (fluid !== Fluid.NONE) {
      mask |= ArmBlocker.IN_FLUID.bit();
    }
    if (hardwareFault) {
      mask |= ArmBlocker.HARDWARE_FAULT.bit();
    }
    return mask;
  }
}
