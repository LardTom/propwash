import { StabMode } from './StabMode.js?v=ef37a80a';

// Port of de.lardtom.propwash.sim.PilotInput
export class PilotInput {
  roll = 0.0;
  pitch = 0.0;
  yaw = 0.0;
  throttle = 0.0;
  mode = StabMode.ACRO;
  armSwitch = false;
  linkOk = true;
  altHold = false;
  posHold = false;
  mode3d = false;
  turtle = false;
  actions = 0;

  copyTo(dst) {
    dst.roll = this.roll;
    dst.pitch = this.pitch;
    dst.yaw = this.yaw;
    dst.throttle = this.throttle;
    dst.mode = this.mode;
    dst.armSwitch = this.armSwitch;
    dst.linkOk = this.linkOk;
    dst.altHold = this.altHold;
    dst.posHold = this.posHold;
    dst.mode3d = this.mode3d;
    dst.turtle = this.turtle;
    dst.actions = this.actions;
  }
}
