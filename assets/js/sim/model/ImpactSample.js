// Port of de.lardtom.propwash.sim.ImpactSample (1:1).
//
// Java record ImpactSample(float speed, float tangential, float normalX, float normalY, float normalZ, int contacts,
// int struck, float strikeSpin): the components are private fields (here `_name`, since a JS field would hide the
// accessor) read through the accessors `speed()`, `tangential()`, … The float components are rounded with
// Math.fround like Java's float storage; float arithmetic in sanitized() rounds every operation to float.
import { AirframeSpec } from './AirframeSpec.js?v=840a3158';

const f32 = Math.fround;

export class ImpactSample {
  static MAX_SPEED = 150.0;
  static MAX_SPIN = 3.0;
  static CONTACT_MASK = (1 << AirframeSpec.HULL_POINTS) - 1;
  static STRUCK_MASK = (1 << AirframeSpec.MOTORS) - 1;
  static HULL_TIP = 0;
  static HULL_MOTOR = 4;
  static HULL_BATTERY_FRONT = 8;
  static HULL_BATTERY_BACK = 9;
  static HULL_ELECTRONICS = 10;
  static HULL_BOTTOM = 11;

  constructor(speed, tangential, normalX, normalY, normalZ, contacts, struck, strikeSpin) {
    this._speed = f32(speed);
    this._tangential = f32(tangential);
    this._normalX = f32(normalX);
    this._normalY = f32(normalY);
    this._normalZ = f32(normalZ);
    this._contacts = contacts | 0;
    this._struck = struck | 0;
    this._strikeSpin = f32(strikeSpin);
  }

  speed() {
    return this._speed;
  }

  tangential() {
    return this._tangential;
  }

  normalX() {
    return this._normalX;
  }

  normalY() {
    return this._normalY;
  }

  normalZ() {
    return this._normalZ;
  }

  contacts() {
    return this._contacts;
  }

  // Java: int struck() (record accessor, the mask) and boolean struck(int motor); dispatched on arguments.length.
  struck(motor) {
    if (arguments.length === 0) {
      return this._struck;
    }
    return (this._struck & (1 << motor)) !== 0;
  }

  strikeSpin() {
    return this._strikeSpin;
  }

  sanitized() {
    let nx = ImpactSample.finite(this._normalX);
    let ny = ImpactSample.finite(this._normalY);
    let nz = ImpactSample.finite(this._normalZ);
    const length = f32(Math.sqrt(f32(f32(f32(nx * nx) + f32(ny * ny)) + f32(nz * nz))));
    if (length > f32(1.0E-4)) {
      nx = f32(nx / length);
      ny = f32(ny / length);
      nz = f32(nz / length);
    } else {
      nx = 0.0;
      ny = 1.0;
      nz = 0.0;
    }
    return new ImpactSample(ImpactSample.clamp(this._speed, ImpactSample.MAX_SPEED), ImpactSample.clamp(this._tangential, ImpactSample.MAX_SPEED),
      nx, ny, nz, this._contacts & ImpactSample.CONTACT_MASK, this._struck & ImpactSample.STRUCK_MASK,
      ImpactSample.clamp(this._strikeSpin, ImpactSample.MAX_SPIN));
  }

  touches(hullPoint) {
    return (this._contacts & (1 << hullPoint)) !== 0;
  }

  static finite(value) {
    return Number.isFinite(value) ? value : 0.0;
  }

  static clamp(value, max) {
    if (!Number.isFinite(value) || value < 0.0) {
      return 0.0;
    }
    return Math.min(value, max);
  }

  // Java record equals/hashCode/toString are not ported; toString kept for debugging.
  toString() {
    return `ImpactSample[speed=${this._speed}, tangential=${this._tangential}, normalX=${this._normalX}, normalY=${this._normalY}, `
      + `normalZ=${this._normalZ}, contacts=${this._contacts}, struck=${this._struck}, strikeSpin=${this._strikeSpin}]`;
  }
}
