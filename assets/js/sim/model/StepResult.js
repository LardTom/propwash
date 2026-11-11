// Port of de.lardtom.propwash.sim.StepResult (1:1). The JOML Quaterniond is a plain {x, y, z, w} object with the
// set(x, y, z, w) method DroneSim calls.

export class StepResult {
  dx = 0.0;
  dy = 0.0;
  dz = 0.0;
  orientation = {
    x: 0.0,
    y: 0.0,
    z: 0.0,
    w: 1.0,
    set(x, y, z, w) {
      this.x = x;
      this.y = y;
      this.z = z;
      this.w = w;
      return this;
    },
  };
  substeps = 0;
  armed = false;
  sleeping = false;
}
