// Build compatibility check, a port of Propwash 0.4.0 BuildAccess#check (DroneBuild problems/warnings,
// BatteryFit), in the form of the web export's rules.json.
//
// Result: { unknownParts, problems, warnings } with issue keys in Propwash's order.
// Unknown ids (not in the catalog, or a part of another category in that field) stop the check with the
// problem 'missing_part' (rules.json gate); an accessory in a slot it does not fit stops it with 'accessory_mount'.

export const PROBLEM_ORDER = Object.freeze(['missing_part', 'motor_mount', 'prop_too_large', 'prop_too_small', 'prop_mount',
  'stack_mount', 'battery_frame', 'accessory_mount']);
export const WARNING_ORDER = Object.freeze(['motor_overvoltage', 'motor_undervoltage', 'stack_voltage', 'esc_undersized',
  'battery_weak', 'battery_undersized']);

export const MOTOR_COUNT = 4;
export const ESC_MARGIN = 1.15;
export const BATTERY_MARGIN = 1.3;
export const UNIVERSAL_PROP_MOUNT = 'propwash:universal';

const FIELDS = ['frame', 'stack', 'motor', 'prop', 'video', 'battery'];

/**
 * Resolves the part objects of a build. Returns { parts, unknown, misplaced } where parts has frame … battery and
 * accessories { top?, bottom? } as catalog part objects, unknown lists the ids that are missing or in the wrong
 * field, misplaced is true when an accessory sits in a slot it does not fit.
 */
export function resolveBuild(build, catalog) {
  const unknown = [];
  const parts = { accessories: {} };
  for (const field of FIELDS) {
    const part = catalog.part(build[field]);
    if (!part || part.category !== field) unknown.push(build[field]);
    else parts[field] = part;
  }
  let misplaced = false;
  const accessories = build.accessories || {};
  for (const slot of ['top', 'bottom']) {
    const id = accessories[slot];
    if (id == null) continue;
    const part = catalog.part(id);
    if (!part || part.category !== 'accessory') {
      unknown.push(id);
    } else {
      parts.accessories[slot] = part;
      if (part.data.slot !== slot) misplaced = true;
    }
  }
  return { parts, unknown, misplaced };
}

/** BatteryFit.check: 'ok', 'weak', 'cells_low', 'cells_high' or 'too_heavy'. */
export function batteryFit(frame, battery) {
  const fit = frame.data.battery_fit;
  const cells = battery.data.cells;
  if (cells < fit.cells[0]) return 'cells_low';
  if (cells > fit.cells[1]) return 'cells_high';
  if (battery.basics.mass_g > fit.max_mass_g) return 'too_heavy';
  if (cells < fit.preferred_min_cells) return 'weak';
  if (battery.data.capacity_mah < fit.preferred_min_capacity_mah) return 'weak';
  return 'ok';
}

/** Maximum continuous battery current in A (c_rating × capacity). */
export function batteryContinuousCurrent(battery) {
  return (battery.data.c_rating * battery.data.capacity_mah) / 1000.0;
}

export function propFits(motorPropMount, propMount) {
  return motorPropMount === UNIVERSAL_PROP_MOUNT || propMount === UNIVERSAL_PROP_MOUNT || motorPropMount === propMount;
}

/**
 * Checks a build against the catalog.
 * @param {{frame, stack, motor, prop, video, battery, accessories?}} build part ids
 * @param {object} catalog from data.js
 * @returns {{unknownParts: string[], problems: string[], warnings: string[]}}
 */
export function check(build, catalog) {
  const { parts, unknown, misplaced } = resolveBuild(build, catalog);
  if (unknown.length) return { unknownParts: unknown, problems: ['missing_part'], warnings: [] };
  if (misplaced) return { unknownParts: [], problems: ['accessory_mount'], warnings: [] };
  const { frame, stack, motor, prop, battery } = parts;
  const f = frame.data;
  const problems = [];
  if (!f.motor_mounts.includes(motor.data.mount)) problems.push('motor_mount');
  if (prop.data.diameter_mm > f.props_mm[1]) problems.push('prop_too_large');
  if (prop.data.diameter_mm < f.props_mm[0]) problems.push('prop_too_small');
  if (!propFits(motor.data.prop_mount, prop.data.mount)) problems.push('prop_mount');
  if (!f.stack_mounts.includes(stack.data.mount)) problems.push('stack_mount');
  const fit = batteryFit(frame, battery);
  if (fit !== 'ok' && fit !== 'weak') problems.push('battery_frame');
  for (const slot of Object.keys(parts.accessories)) {
    if (!f.accessory_mounts.includes(slot)) {
      problems.push('accessory_mount');
      break;
    }
  }

  const warnings = [];
  const cells = battery.data.cells;
  if (cells > motor.data.cells[1]) warnings.push('motor_overvoltage');
  if (cells < motor.data.cells[0]) warnings.push('motor_undervoltage');
  if (cells > stack.data.cells[1] || cells < stack.data.cells[0]) warnings.push('stack_voltage');
  if (motor.data.max_current_a > stack.data.esc_continuous_a * ESC_MARGIN) warnings.push('esc_undersized');
  if (motor.data.max_current_a * MOTOR_COUNT > batteryContinuousCurrent(battery) * BATTERY_MARGIN) warnings.push('battery_weak');
  if (fit === 'weak') warnings.push('battery_undersized');
  return { unknownParts: [], problems, warnings };
}
