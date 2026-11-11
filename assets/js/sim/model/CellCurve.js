// Port of de.lardtom.propwash.sim.CellCurve.
// `chemistry` (Java BatteryType.Chemistry) is the configurator catalog chemistry object: CellChemistry.SOC_GRID ->
// chemistry.soc_grid, chemistry.definition().ocvShape() -> chemistry.ocv_shape, plus the Java-named voltages
// fullCellVoltage / emptyCellVoltage / cutoffCellVoltage (added by AirframeSpec.js). The Java caches the shape arrays
// per chemistry (SHAPES); the catalog arrays are read directly instead.
import { ModelConstants } from './ModelConstants.js?v=760466ce';
import { SimMath } from './SimMath.js?v=44da8aea';

export class CellCurve {
  // Java: private static final double[] SOC = toArray(CellChemistry.SOC_GRID)
  static socOf(chemistry) {
    return chemistry.soc_grid;
  }

  static shapeOf(chemistry) {
    return chemistry.ocv_shape;
  }

  static shape(chemistry, soc) {
    const SOC = CellCurve.socOf(chemistry);
    const u = CellCurve.shapeOf(chemistry);
    const s = SimMath.clamp01(soc);
    let i = 1;
    while (i < SOC.length - 1 && s > SOC[i]) {
      i++;
    }
    const t = (s - SOC[i - 1]) / (SOC[i] - SOC[i - 1]);
    return u[i - 1] + (u[i] - u[i - 1]) * t;
  }

  static ocv(chemistry, soc) {
    const full = chemistry.fullCellVoltage;
    const empty = chemistry.emptyCellVoltage;
    const cutoff = chemistry.cutoffCellVoltage;
    if (Number.isNaN(soc)) {
      return empty;
    }
    if (soc >= 0.0) {
      return empty + (full - empty) * CellCurve.shape(chemistry, soc);
    }
    const s = Math.max(soc, ModelConstants.SOC_MIN);
    if (s >= -0.05) {
      return empty + (cutoff - empty) * (s / -0.05);
    }
    return cutoff + (0.8 * cutoff - cutoff) * ((s + 0.05) / -0.05);
  }
}
