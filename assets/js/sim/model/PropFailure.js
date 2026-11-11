// Port of de.lardtom.propwash.sim.PropFailure (1:1).
//
// Java record PropFailure(double brittleness, double shatter): the components are private fields (here `_name`, since a
// JS field would hide the accessor) read through the accessors `brittleness()` / `shatter()`. PropDefinition is not
// ported: `of(prop)` takes the configurator catalog prop part (prop.data.stiffness, prop.basics.durability).
import { javaEnum } from './Enum.js?v=d8aa4520';
import { SimMath } from './SimMath.js?v=44da8aea';

export const Mode = javaEnum(['BENDS', 'BENDS_OR_CRACKS', 'CRACKS', 'SHATTERS'], (c) => ({
  key() {
    return c.name.toLowerCase();
  },
}));

export class PropFailure {
  static DUCTILE_STIFFNESS = 0.95;
  static BRITTLE_STIFFNESS = 1.2;
  static SHATTER_FROM_STIFFNESS = 1.3;
  static SHATTER_FULL_STIFFNESS = 2.2;
  static MIXED_FROM = 0.3;
  static CRACKS_FROM = 0.7;
  static SHATTERS_FROM = 0.5;
  static Mode = Mode;
  static DUCTILE = new PropFailure(0.0, 0.0);

  constructor(brittleness, shatter) {
    this._brittleness = PropFailure.unit(brittleness);
    this._shatter = PropFailure.unit(shatter);
  }

  brittleness() {
    return this._brittleness;
  }

  shatter() {
    return this._shatter;
  }

  // Java: of(PropDefinition prop) and of(double stiffness, double durability); dispatched on arguments.length.
  static of(propOrStiffness, durability) {
    if (arguments.length === 1) {
      const prop = propOrStiffness;
      return PropFailure.of(prop.data.stiffness, prop.basics.durability);
    }
    const stiffness = propOrStiffness;
    if (!(stiffness > 0.0) || !Number.isFinite(stiffness)) {
      return PropFailure.DUCTILE;
    }
    const tough = Number.isFinite(durability) && durability > 0.0 ? Math.sqrt(durability) : 1.0;
    const shatter = SimMath.smoothstep(PropFailure.SHATTER_FROM_STIFFNESS, PropFailure.SHATTER_FULL_STIFFNESS, stiffness);
    const brittle = Math.max(shatter, SimMath.smoothstep(PropFailure.DUCTILE_STIFFNESS, PropFailure.BRITTLE_STIFFNESS, stiffness) / tough);
    return new PropFailure(brittle, shatter);
  }

  bendShare() {
    return 1.0 - this._brittleness;
  }

  crackShare() {
    return this._brittleness * (1.0 - this._shatter);
  }

  shatterShare() {
    return this._brittleness * this._shatter;
  }

  mode() {
    if (this.shatterShare() >= PropFailure.SHATTERS_FROM) {
      return Mode.SHATTERS;
    }
    if (this._brittleness >= PropFailure.CRACKS_FROM) {
      return Mode.CRACKS;
    }
    return this._brittleness >= PropFailure.MIXED_FROM ? Mode.BENDS_OR_CRACKS : Mode.BENDS;
  }

  static unit(value) {
    return Number.isFinite(value) ? Math.max(0.0, Math.min(1.0, value)) : 0.0;
  }
}
