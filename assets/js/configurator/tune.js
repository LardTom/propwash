// Flight-tune keys and groups, as in the Propwash API (TuneGroup) and the PW1 key table.

/** Groups that travel in a share code (TuneGroup.FLIGHT). */
export const FLIGHT_GROUPS = Object.freeze(['rates', 'pid', 'feedforward', 'tpa', 'filters', 'throttle']);

/** Groups that never travel in a share code. */
export const NEVER_GROUPS = Object.freeze(['hold', 'camera', 'led', 'vtx', 'other']);

/** PW1 tune key table: TUNE_KEYS[k - 1] is the key with table index k (1-based, append only). */
export const TUNE_KEYS = Object.freeze([
  'rates.type',
  'rates.roll.rcRate', 'rates.roll.superRate', 'rates.roll.rcExpo', 'rates.roll.centerRateDps', 'rates.roll.maxRateDps',
  'rates.roll.actualExpo',
  'rates.pitch.rcRate', 'rates.pitch.superRate', 'rates.pitch.rcExpo', 'rates.pitch.centerRateDps', 'rates.pitch.maxRateDps',
  'rates.pitch.actualExpo',
  'rates.yaw.rcRate', 'rates.yaw.superRate', 'rates.yaw.rcExpo', 'rates.yaw.centerRateDps', 'rates.yaw.maxRateDps',
  'rates.yaw.actualExpo',
  'rates.rcDeadband', 'rates.yawDeadband', 'pid.source',
  'pid.roll.p', 'pid.roll.i', 'pid.roll.d', 'pid.roll.ff',
  'pid.pitch.p', 'pid.pitch.i', 'pid.pitch.d', 'pid.pitch.ff',
  'pid.yaw.p', 'pid.yaw.i', 'pid.yaw.d', 'pid.yaw.ff',
  'pid.angleStrength', 'pid.angleLimitDeg', 'pid.horizonStrength', 'pid.itermRelax', 'pid.antiGravityGain', 'pid.airmode',
  'pid.tpaMode', 'pid.tpaRatePercent', 'pid.tpaBreakpoint', 'pid.motorIdlePercent', 'pid.throttleMid', 'pid.throttleExpo',
  'pid.throttleLimitType', 'pid.throttleLimitPercent', 'pid.thrustLinearPercent', 'pid.vbatSagCompensationPercent',
  'filters.pidLoop', 'filters.gyroLpfHz', 'filters.dtermLpf1Hz', 'filters.dtermLpf2Hz', 'filters.rcSmoothingHz',
]);

const INDEX = new Map(TUNE_KEYS.map((key, i) => [key, i + 1]));

/** Table index of a key (1-based), 0 when the key has no index and travels as a literal. */
export function tuneIndex(key) {
  return INDEX.get(key) || 0;
}

/** TuneGroup.of(key) in lower case. */
export function tuneGroup(key) {
  if (typeof key !== 'string') return 'other';
  if (key.startsWith('rates.')) return 'rates';
  if (key.startsWith('filters.')) return 'filters';
  if (key.startsWith('hold.')) return 'hold';
  if (key.startsWith('camera.')) return 'camera';
  if (key.startsWith('led.')) return 'led';
  if (key.startsWith('vtx.')) return 'vtx';
  if (key.startsWith('pid.')) {
    if (key.endsWith('.ff')) return 'feedforward';
    if (key.startsWith('pid.tpa')) return 'tpa';
    if (key.startsWith('pid.throttle') || key === 'pid.motorIdlePercent' || key === 'pid.thrustLinearPercent'
      || key === 'pid.vbatSagCompensationPercent') return 'throttle';
    return 'pid';
  }
  return 'other';
}

/** True if the key belongs to a flight group (the only keys a share code carries). */
export function isFlightKey(key) {
  return FLIGHT_GROUPS.includes(tuneGroup(key));
}

/** Only the flight keys of a tune object, values rounded to float32 like the mod stores them, keys sorted. */
export function flightOnly(tune) {
  const out = {};
  for (const key of Object.keys(tune || {}).sort()) {
    if (isFlightKey(key)) out[key] = Math.fround(tune[key]);
  }
  return out;
}
