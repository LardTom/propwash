// Port of de.lardtom.propwash.sim.BatteryAlarm (1:1; long counters are numbers).

export class BatteryAlarm {
  static HYSTERESIS_V = 0.1;

  below = 0;
  above = 0;
  // Java fields `active` / `latched`: renamed because JS fields would shadow the accessor methods of the same name.
  _active = false;
  _latched = false;

  update(cell, restingCell, threshold, steps) {
    if (cell < threshold) {
      this.below++;
      this.above = 0;
    } else {
      this.below = 0;
      this.above = cell > threshold + BatteryAlarm.HYSTERESIS_V ? this.above + 1 : 0;
    }
    if (!this._active) {
      if (this.below >= steps) {
        this._active = true;
        this.above = 0;
        this._latched = restingCell <= threshold + BatteryAlarm.HYSTERESIS_V;
        return true;
      }
      return false;
    }
    if (!this._latched && restingCell <= threshold + BatteryAlarm.HYSTERESIS_V) {
      this._latched = true;
    }
    if (!this._latched && this.above >= steps) {
      this._active = false;
      this.below = 0;
      this.above = 0;
    }
    return false;
  }

  active() {
    return this._active;
  }

  latched() {
    return this._latched;
  }

  reset() {
    this.below = 0;
    this.above = 0;
    this._active = false;
    this._latched = false;
  }
}
