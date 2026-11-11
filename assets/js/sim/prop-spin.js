// Spinning props like Propwash 0.6.0 draws them, without three.js (Node can test it):
//
// - Motor output per prop: |rotor rpm| / maximum rpm (omegaMax) of that motor, only while armed, stored as a byte like
//   StateValidation.packMotors (PilotSession#writeEntity), so 0, 1/255 … 1.
// - Rotor angle (QuadcopterEntity#tickClientVisuals, 20 ticks per second): the spin speed in radians per tick follows
//   its target 0.9 + (3.2 − 0.9) · output while armed (0 disarmed) by 35 % per tick and snaps to 0 below 0.001; the
//   angle moves by direction · speed per tick, and the frame draws it interpolated between the last two ticks
//   (QuadcopterEntity#rotorAngle with the partial tick). Turn about the model's up axis: +1 is counter-clockwise seen
//   from above.
// - Direction per prop: the frame's spin of that motor (drone_layout.json motor_spin, the arms' "spin" of the frame, else
//   props in: front left and rear right clockwise, front right and rear left counter-clockwise), the same that picks the
//   prop's "_ccw" model and the flight model's yaw torque (AirframeSpec.spin). Every frame of Propwash and its add-ons
//   flies props in.
// - Blur (DroneVisuals#propBlur): an armed prop whose motor output lies above the blur threshold (DroneRenderConfig
//   propBlurThreshold, default 0.12, "Blur from throttle") is drawn with its blur model; the simulator has no part wear,
//   so no prop is broken.
//
// Props are numbered by their slot like assembly.js: 0 front left, 1 front right, 2 rear left, 3 rear right. The flight
// model (sim/model/) numbers its motors differently (AirframeSpec, PilotSession.LAYOUT_TO_SIM): SLOT_SIM_MOTOR maps a
// slot to its motor there. Note: Propwash 0.6.0 itself maps the packed outputs a second time (DroneVisuals#fillFromEntity
// with DroneLayout.motorForSlot), so in the game front left and rear right show each other's rotor speed (same spin
// direction, only the blur threshold and the speed differ); the simulator shows every prop with its own motor.

export const SLOTS = 4;
export const TICK_SECONDS = 0.05;
// QuadcopterEntity's float constants (radians per tick, share per tick).
export const PROP_IDLE_SPEED = Math.fround(0.9);
export const PROP_MAX_SPEED = Math.fround(3.2);
export const PROP_RESPONSE = Math.fround(0.35);
export const PROP_BLUR_THRESHOLD = 0.12;
// Slot (front left, front right, rear left, rear right) → motor of the flight model.
export const SLOT_SIM_MOTOR = Object.freeze([3, 1, 2, 0]);
// DroneLayout.PROPS_IN_CCW: the spin of a frame without its own (props in).
export const PROPS_IN_CCW = Object.freeze([false, true, true, false]);
// At most this many ticks per update (a long pause, a hidden tab): the props simply continue.
const MAX_TICKS = 10;
const TWO_PI = Math.fround(Math.PI * 2.0);
const SNAP = Math.fround(1.0e-3);
const f32 = Math.fround;

/** StateValidation.unit and toByte / unpackMotor: a share 0..1 rounded to a byte, NaN as 0. */
export function packedOutput(value) {
  const unit = Number.isNaN(value) ? 0 : Math.max(0, Math.min(1, value));
  return (Math.round(f32(unit * 255)) & 0xff) / 255;
}

/**
 * PilotSession#writeEntity: the motor output of every slot from the flight model's rotor speeds (rpm, sim motor order)
 * and its maximum rpm; all 0 while disarmed.
 */
export function slotOutputs(motorRpm, rpmMax, armed, out = new Array(SLOTS).fill(0)) {
  for (let slot = 0; slot < SLOTS; slot++) {
    const rpm = motorRpm[SLOT_SIM_MOTOR[slot]];
    const share = rpmMax > 0 && Number.isFinite(rpm) ? Math.abs(rpm) / rpmMax : 0;
    out[slot] = armed ? packedOutput(share) : 0;
  }
  return out;
}

/** DroneVisuals#propBlur for an intact prop: armed and the motor output above the threshold. */
export function propBlur(armed, output, threshold = PROP_BLUR_THRESHOLD) {
  return !!armed && output > threshold;
}

/** +1 counter-clockwise (seen from above, about +y), −1 clockwise. */
export function spinDirection(counterClockwise) {
  return counterClockwise ? 1 : -1;
}

/** QuadcopterEntity: the target spin speed in radians per tick. */
export function targetSpeed(armed, output) {
  return armed ? f32(PROP_IDLE_SPEED + f32(f32(PROP_MAX_SPEED - PROP_IDLE_SPEED) * f32(output))) : 0;
}

/** The four props' rotor angles, stepped in game ticks and interpolated in between. */
export class PropSpin {
  /** @param {boolean[]} counterClockwise spin per slot */
  constructor(counterClockwise = PROPS_IN_CCW) {
    this.direction = Array.from({ length: SLOTS }, (_, slot) => spinDirection(!!counterClockwise[slot]));
    this.speed = new Array(SLOTS).fill(0);
    this.angles = new Array(SLOTS).fill(0);
    this.previous = new Array(SLOTS).fill(0);
    this.outputs = new Array(SLOTS).fill(0);
    this.armed = false;
    this.elapsed = 0;
    this.ticks = 0;
  }

  /**
   * Advances by dt seconds with this frame's motor outputs (per slot, see slotOutputs) and arming state.
   * @returns {number} ticks run
   */
  update(dt, outputs, armed) {
    for (let slot = 0; slot < SLOTS; slot++) this.outputs[slot] = Number.isFinite(outputs[slot]) ? outputs[slot] : 0;
    this.armed = !!armed;
    this.elapsed += Math.max(0, Number.isFinite(dt) ? dt : 0);
    let ran = 0;
    while (this.elapsed >= TICK_SECONDS) {
      this.elapsed -= TICK_SECONDS;
      if (ran < MAX_TICKS) {
        this.tick();
        ran++;
      }
    }
    return ran;
  }

  /** One game tick (QuadcopterEntity#tickClientVisuals). */
  tick() {
    for (let i = 0; i < SLOTS; i++) {
      const target = targetSpeed(this.armed, this.outputs[i]);
      let speed = f32(this.speed[i] + f32(f32(target - this.speed[i]) * PROP_RESPONSE));
      if (Math.abs(speed) < SNAP) speed = 0;
      this.speed[i] = speed;
      this.previous[i] = this.angles[i];
      this.angles[i] = f32(this.angles[i] + f32(this.direction[i] * speed));
      if (Math.abs(this.angles[i]) > 1000.0) {
        const shift = f32(TWO_PI * Math.round(f32(this.angles[i] / TWO_PI)));
        this.angles[i] = f32(this.angles[i] - shift);
        this.previous[i] = f32(this.previous[i] - shift);
      }
    }
    this.ticks++;
  }

  /** Share of the running tick, 0..1 (the partial tick). */
  partial() {
    return Math.max(0, Math.min(1, this.elapsed / TICK_SECONDS));
  }

  /** The drawn rotor angle of a slot (radians, about +y): lerp between the last two ticks (Mth.lerp). */
  angle(slot) {
    const p = this.partial();
    return this.previous[slot] + p * (this.angles[slot] - this.previous[slot]);
  }

  /** Whether a slot draws its blur model. */
  blur(slot, threshold = PROP_BLUR_THRESHOLD) {
    return propBlur(this.armed, this.outputs[slot], threshold);
  }
}
