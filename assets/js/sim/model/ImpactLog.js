// Port of de.lardtom.propwash.sim.ImpactLog (1:1). float[] -> Float32Array (stores Java float values).
// The private fields `size` and `dropped` are stored as `_size` / `_dropped` (a JS field would hide the methods).
import { ImpactSample } from './ImpactSample.js?v=2a782279';

export class ImpactLog {
  static CAPACITY = 16;

  speed = new Float32Array(ImpactLog.CAPACITY);
  tangential = new Float32Array(ImpactLog.CAPACITY);
  normalX = new Float32Array(ImpactLog.CAPACITY);
  normalY = new Float32Array(ImpactLog.CAPACITY);
  normalZ = new Float32Array(ImpactLog.CAPACITY);
  contacts = new Int32Array(ImpactLog.CAPACITY);
  struck = new Int32Array(ImpactLog.CAPACITY);
  strikeSpin = new Float32Array(ImpactLog.CAPACITY);
  _size = 0;
  _dropped = 0;

  size() {
    return this._size;
  }

  dropped() {
    return this._dropped;
  }

  get(index) {
    if (index < 0 || index >= this._size) {
      throw new RangeError(`Index out of range: ${index}`);
    }
    return new ImpactSample(this.speed[index], this.tangential[index], this.normalX[index], this.normalY[index], this.normalZ[index],
      this.contacts[index], this.struck[index], this.strikeSpin[index]);
  }

  strongest() {
    let max = 0.0;
    for (let i = 0; i < this._size; i++) {
      max = Math.max(max, this.speed[i]);
    }
    return max;
  }

  clear() {
    this._size = 0;
    this._dropped = 0;
  }

  add(speed, tangential, nx, ny, nz, contacts, struck, strikeSpin) {
    let slot = this._size;
    if (slot >= ImpactLog.CAPACITY) {
      let weakest = 0;
      for (let i = 1; i < ImpactLog.CAPACITY; i++) {
        if (this.speed[i] < this.speed[weakest]) {
          weakest = i;
        }
      }
      this._dropped++;
      if (this.speed[weakest] >= speed && struck === 0) {
        return;
      }
      slot = weakest;
    } else {
      this._size++;
    }
    this.speed[slot] = Math.fround(speed);
    this.tangential[slot] = Math.fround(tangential);
    this.normalX[slot] = Math.fround(nx);
    this.normalY[slot] = Math.fround(ny);
    this.normalZ[slot] = Math.fround(nz);
    this.contacts[slot] = contacts;
    this.struck[slot] = struck;
    this.strikeSpin[slot] = Math.fround(strikeSpin);
  }
}
