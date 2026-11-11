// Port of de.lardtom.propwash.sim.EventQueue (1:1).
// The private field `size` is stored as `_size` (a JS field would hide the method size()).
import { SimEventType } from './SimEventType.js?v=7000a262';

export class EventQueue {
  static CAPACITY = 32;
  static TYPES = SimEventType.values();

  types = new Int32Array(EventQueue.CAPACITY);
  times = new Float64Array(EventQueue.CAPACITY);
  values = new Float64Array(EventQueue.CAPACITY);
  motors = new Int32Array(EventQueue.CAPACITY);
  start = 0;
  _size = 0;
  overflow = 0;

  size() {
    return this._size;
  }

  type(index) {
    return EventQueue.TYPES[this.types[this.slot(index)]];
  }

  time(index) {
    return this.times[this.slot(index)];
  }

  value(index) {
    return this.values[this.slot(index)];
  }

  motor(index) {
    return this.motors[this.slot(index)];
  }

  overflowCount() {
    return this.overflow;
  }

  count(type) {
    let n = 0;
    for (let k = 0; k < this._size; k++) {
      if (this.type(k) === type) {
        n++;
      }
    }
    return n;
  }

  contains(type) {
    return this.count(type) > 0;
  }

  slot(index) {
    if (index < 0 || index >= this._size) {
      throw new RangeError(`Index out of range: ${index}`);
    }
    return (this.start + index) % EventQueue.CAPACITY;
  }

  clear() {
    this.start = 0;
    this._size = 0;
    this.overflow = 0;
  }

  add(type, time, value, motor) {
    let slot;
    if (this._size < EventQueue.CAPACITY) {
      slot = (this.start + this._size) % EventQueue.CAPACITY;
      this._size++;
    } else {
      slot = this.start;
      this.start = (this.start + 1) % EventQueue.CAPACITY;
      this.overflow++;
    }
    this.types[slot] = type.ordinal;
    this.times[slot] = time;
    this.values[slot] = value;
    this.motors[slot] = motor;
  }
}
