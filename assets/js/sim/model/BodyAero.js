// Port of de.lardtom.propwash.sim.BodyAero (1:1).
import { SimMath } from './SimMath.js?v=44da8aea';

export class BodyAero {
  fx = 0.0;
  fy = 0.0;
  fz = 0.0;

  // Java overloads:
  //   drag(AirframeSpec p, double rho, double scale, double ux, double uy, double uz, double h)                    -> topScale 1.0
  //   drag(AirframeSpec p, double rho, double scale, double ux, double uy, double uz, double h, double topScale)
  drag(p, rho, scale, ux, uy, uz, h, topScale) {
    if (arguments.length === 7) {
      this.drag(p, rho, scale, ux, uy, uz, h, 1.0);
      return;
    }
    const speed = SimMath.hypot3(ux, uy, uz);
    const k = 0.5 * rho * p.dragCoefficient * scale * speed;
    const hm = h / p.massKg;
    const kx = k * p.areaX;
    const ky = k * p.areaY * topScale;
    const kz = k * p.areaZ;
    this.fx = -kx * ux / (1.0 + hm * kx);
    this.fy = -ky * uy / (1.0 + hm * ky);
    this.fz = -kz * uz / (1.0 + hm * kz);
  }
}
