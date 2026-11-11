// Port of de.lardtom.propwash.sim.FrameGeometry (1:1).
//
// Java record FrameGeometry(boolean batteryOnTop, double batteryPlateY, double electronicsY): the components are
// private fields (here `_name`, since a JS field would hide the accessor) read through the accessors `name()`.
// FrameType is not ported: `of(frame)` takes the configurator catalog frame part (frame.data.battery.on_top,
// frame.data.battery.plate_mm, frame.data.electronics_mm, i.e. AirframeGeometry batteryOnTop/batteryPlateMm/electronicsMm).

export class FrameGeometry {
  constructor(batteryOnTop, batteryPlateY, electronicsY) {
    this._batteryOnTop = batteryOnTop;
    this._batteryPlateY = batteryPlateY;
    this._electronicsY = electronicsY;
  }

  static of(frame) {
    const g = frame.data;
    return new FrameGeometry(g.battery.on_top, g.battery.plate_mm / 1000.0, g.electronics_mm / 1000.0);
  }

  batteryOnTop() {
    return this._batteryOnTop;
  }

  batteryPlateY() {
    return this._batteryPlateY;
  }

  electronicsY() {
    return this._electronicsY;
  }
}
