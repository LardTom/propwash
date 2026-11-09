// The parts reader of Propwash in the browser: a port of parts/PartJson.java (with JsonFields, BundledParts and the
// checks of the part records in api/part) of Propwash 0.6.0. A part file of an add-on jar
// (data/<namespace>/propwash_parts/<kind>/<path>.json) becomes the same definition the mod builds from it – every
// default and every derived value – or is rejected with the same kind of error. Nothing here runs code from a jar;
// the files are plain JSON.
//
//   const { definition, errors, warnings } = decodePart('motor', 'justmoreparts:m0702_23000', text);
//   const { parts, chemistries, errors, warnings } = bundledParts(files, modId);   // files: Map path → text
//
// Definitions are plain objects with the record components of the Java types (camelCase), optional values as
// null; Vec3Mm is [x, y, z]. tools/test-jar-loader.mjs holds the result of every part of Propwash and Just More Parts
// against the web export of the game, field by field.

export const FORMAT = 1;
export const FOLDER = 'propwash_parts';
export const CHEMISTRY = 'chemistry';
export const ORDER = Object.freeze([CHEMISTRY, 'frame', 'stack', 'motor', 'prop', 'video', 'battery', 'accessory']);
export const KINDS = Object.freeze(['frame', 'stack', 'motor', 'prop', 'video', 'battery', 'accessory']);
export const ARM_KEYS = Object.freeze(['front_left', 'front_right', 'rear_left', 'rear_right']);
export const DEFAULT_NAMESPACE = 'propwash';
export const DEFAULT_SORT_ORDER = 1000;
export const MAX_KEY_LENGTH = 128;

export const ROLES = Object.freeze(['whoop', 'toothpick', 'cinewhoop', 'freestyle', 'race', 'long_range', 'cinelifter', 'x_class']);
export const SHAPES = Object.freeze(['true_x', 'stretched_x', 'squashed_x', 'deadcat', 'h_frame', 'custom']);
export const SLOTS = Object.freeze(['top', 'bottom', 'front']);
export const LINKS = Object.freeze(['analog', 'digital']);
export const SPINS = Object.freeze(['cw', 'ccw']);
export const RARITIES = Object.freeze(['common', 'uncommon', 'rare', 'epic']);
export const MATERIALS = Object.freeze({
  polycarbonate: { stiffness: 1.0, durability: 1.0 },
  glass_fiber_nylon: { stiffness: 1.2, durability: 0.8 },
  carbon_fiber_nylon: { stiffness: 1.4, durability: 0.9 },
  carbon: { stiffness: 2.2, durability: 1.4 },
});
export const PROPS_IN = Object.freeze(['cw', 'ccw', 'ccw', 'cw']);
export const SOC_GRID = Object.freeze([0.0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]);
export const MASS_SPLIT_OPEN = Object.freeze({ arms: 0.60, plate: 0.40, duct: 0.0 });
export const MASS_SPLIT_DUCTED = Object.freeze({ arms: 0.20, plate: 0.30, duct: 0.50 });
export const THERMAL_DEFAULT = Object.freeze({
  heatCapacityJPerK: null, coolingWPerK: null, coolingWPerKPerRadS: null, derateStartC: 130.0, maxTempC: 150.0, wearPerSecondAtMax: 0.002,
});
export const PROP_UNIVERSAL = 'propwash:universal';
export const LIPO = 'propwash:lipo';
export const DEFAULT_CAMERA_TILT = 20.0;
export const MAX_PROP_MM = 400;
export const MAX_LEDS = 64;
export const MIN_LED_PATH_POINTS = 2;
export const MAX_LED_PATH_POINTS = 256;
export const MAX_LED_PATH_MM = 500.0;
export const MAX_MUZZLE_OUTSIDE_MM = 20.0;
export const MAX_VTX_LEVELS = 8;
export const DEFAULT_ANTENNA_TILT = 45.0;
export const CAPS = Object.freeze(['whip', 'stubby', 'lollipop', 'pagoda', 'patch']);
export const MAX_ANTENNA_COUNT = 2;
export const NO_ANTENNA = 'none';
export const MIN_ANTENNA_LENGTH_MM = 10.0;
export const MAX_ANTENNA_LENGTH_MM = 250.0;
const INT_MIN = -2147483648;
const INT_MAX = 2147483647;

/** The error of a record check (IllegalArgumentException in the mod). */
class Invalid extends Error {}
const fail = (message) => {
  throw new Invalid(message);
};

// ---------------------------------------------------------------------------------------------------------------
// Identifiers (net.minecraft.resources.Identifier)

const NAMESPACE_CHARS = /^[a-z0-9_.-]*$/;
const PATH_CHARS = /^[a-z0-9_.\-/]*$/;

/** 'namespace:path' when both parts are valid, else null (Identifier.tryBuild). */
export function tryBuild(namespace, path) {
  return NAMESPACE_CHARS.test(namespace) && PATH_CHARS.test(path) ? `${namespace}:${path}` : null;
}

/** Identifier.tryParse: 'a:b' (no colon or a leading colon = minecraft), else null. */
export function tryParse(text) {
  const colon = text.indexOf(':');
  if (colon < 0) return tryBuild('minecraft', text);
  return tryBuild(colon === 0 ? 'minecraft' : text.slice(0, colon), text.slice(colon + 1));
}

/** JsonFields.parseId: lower case only, without a namespace the part belongs to propwash. */
export function parseId(text) {
  if (typeof text !== 'string' || text === '' || text.toLowerCase() !== text) return null;
  return text.includes(':') ? tryParse(text) : tryBuild(DEFAULT_NAMESPACE, text);
}

export function splitId(id) {
  const colon = id.indexOf(':');
  return colon < 0 ? ['minecraft', id] : [id.slice(0, colon), id.slice(colon + 1)];
}

/** Identifier.compareTo of Minecraft: the path first, then the namespace. */
export function idCompare(a, b) {
  const [na, pa] = splitId(a);
  const [nb, pb] = splitId(b);
  const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
  return cmp(pa, pb) || cmp(na, nb);
}

// ---------------------------------------------------------------------------------------------------------------
// Problems and fields (PartDataProblems, JsonFields)

function problemList(file) {
  return {
    file,
    errors: [],
    warnings: [],
    error(at, message) {
      this.errors.push(at ? `${at}: ${message}` : message);
    },
    warning(at, message) {
      this.warnings.push(at ? `${at}: ${message}` : message);
    },
    hasErrors() {
      return this.errors.length > 0;
    },
  };
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const show = (v) => JSON.stringify(v);

/** JsonFields.number: a finite JSON number, else null. */
export function number(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** JsonFields.integer: a whole JSON number in the int range, else null. */
export function integer(value) {
  const d = number(value);
  if (d === null || !Number.isInteger(d) || d < INT_MIN || d > INT_MAX) return null;
  return d;
}

/** JsonFields.numbers: an array of exactly `size` finite numbers, else null. */
export function numbers(value, size) {
  if (!Array.isArray(value) || value.length !== size) return null;
  const out = [];
  for (const v of value) {
    const n = number(v);
    if (n === null) return null;
    out.push(n);
  }
  return out;
}

class Fields {
  constructor(json, path, problems) {
    this.json = json;
    this.path = path;
    this.problems = problems;
    this.used = new Set();
  }

  at(key) {
    return this.path ? `${this.path}.${key}` : key;
  }

  has(key) {
    return Object.prototype.hasOwnProperty.call(this.json, key) && this.json[key] !== null;
  }

  error(key, message) {
    this.problems.error(this.at(key), message);
  }

  take(key) {
    this.used.add(key);
    const v = Object.prototype.hasOwnProperty.call(this.json, key) ? this.json[key] : null;
    return v === null || v === undefined ? null : v;
  }

  missing(key) {
    this.error(key, 'Pflichtfeld fehlt');
  }

  optDouble(key) {
    const v = this.take(key);
    if (v === null) return null;
    const n = number(v);
    if (n === null) this.error(key, `Zahl erwartet, gefunden: ${show(v)}`);
    return n;
  }

  requireDouble(key) {
    if (!this.has(key)) {
      this.take(key);
      this.missing(key);
      return NaN;
    }
    const n = this.optDouble(key);
    return n === null ? NaN : n;
  }

  doubleOr(key, fallback) {
    const n = this.optDouble(key);
    return n === null ? fallback : n;
  }

  optInt(key) {
    const v = this.take(key);
    if (v === null) return null;
    const n = integer(v);
    if (n === null) this.error(key, `ganze Zahl erwartet, gefunden: ${show(v)}`);
    return n;
  }

  requireInt(key) {
    if (!this.has(key)) {
      this.take(key);
      this.missing(key);
      return 0;
    }
    const n = this.optInt(key);
    return n === null ? 0 : n;
  }

  intOr(key, fallback) {
    const n = this.optInt(key);
    return n === null ? fallback : n;
  }

  boolOr(key, fallback) {
    const v = this.take(key);
    if (v === null) return fallback;
    if (typeof v === 'boolean') return v;
    this.error(key, `true oder false erwartet, gefunden: ${show(v)}`);
    return fallback;
  }

  optBool(key) {
    if (!this.has(key)) {
      this.take(key);
      return null;
    }
    return this.boolOr(key, false);
  }

  optString(key) {
    const v = this.take(key);
    if (v === null) return null;
    if (typeof v === 'string') return v;
    this.error(key, `Text erwartet, gefunden: ${show(v)}`);
    return null;
  }

  requireString(key) {
    if (!this.has(key)) {
      this.take(key);
      this.missing(key);
      return '';
    }
    const s = this.optString(key);
    return s === null ? '' : s;
  }

  optId(key) {
    const text = this.optString(key);
    if (text === null) return null;
    const id = parseId(text);
    if (id === null) this.error(key, `ungültige Id "${text}"`);
    return id;
  }

  requireId(key) {
    if (!this.has(key)) {
      this.take(key);
      this.missing(key);
      return null;
    }
    return this.optId(key);
  }

  requireIdList(key) {
    const v = this.take(key);
    if (v === null) {
      this.missing(key);
      return [];
    }
    const items = Array.isArray(v) ? v : [v];
    if (!items.length) this.error(key, 'mindestens eine Id erwartet');
    return this.ids(key, v, items);
  }

  optIdList(key) {
    const v = this.take(key);
    if (v === null) return [];
    return this.ids(key, v, Array.isArray(v) ? v : [v]);
  }

  ids(key, v, items) {
    const out = [];
    items.forEach((item, i) => {
      const where = Array.isArray(v) ? `${key}[${i}]` : key;
      if (typeof item !== 'string') {
        this.error(where, `Id als Text erwartet, gefunden: ${show(item)}`);
        return;
      }
      const id = parseId(item);
      if (id === null) this.error(where, `ungültige Id "${item}"`);
      else out.push(id);
    });
    return out;
  }

  enumList(key, allowed) {
    const v = this.take(key);
    if (v === null) return [];
    const items = Array.isArray(v) ? v : [v];
    const out = [];
    for (const item of items) {
      const value = typeof item === 'string' ? byKey(allowed, item) : null;
      if (value === null) this.error(key, `unbekannter Wert ${show(item)}, erlaubt: ${allowed.join(', ')}`);
      else out.push(value);
    }
    return out;
  }

  optEnum(key, allowed, lookup = byKey) {
    const text = this.optString(key);
    if (text === null) return null;
    const value = lookup(allowed, text);
    if (value === null) this.error(key, `unbekannter Wert "${text}", erlaubt: ${allowed.join(', ')}`);
    return value;
  }

  requireEnum(key, allowed) {
    if (!this.has(key)) {
      this.take(key);
      this.missing(key);
      return null;
    }
    return this.optEnum(key, allowed);
  }

  optObject(key) {
    const v = this.take(key);
    if (v === null) return null;
    if (!isObject(v)) {
      this.error(key, `Objekt erwartet, gefunden: ${show(v)}`);
      return null;
    }
    return new Fields(v, this.at(key), this.problems);
  }

  requireObject(key) {
    if (!this.has(key)) {
      this.take(key);
      this.missing(key);
      return null;
    }
    return this.optObject(key);
  }

  raw(key) {
    return this.take(key);
  }

  optVector(key, size) {
    const v = this.take(key);
    if (v === null) return null;
    const values = numbers(v, size);
    if (values === null) this.error(key, `${size} Zahlen erwartet, gefunden: ${show(v)}`);
    return values;
  }

  requireVector(key, size) {
    if (!this.has(key)) {
      this.take(key);
      this.missing(key);
      return null;
    }
    return this.optVector(key, size);
  }

  optRange(key) {
    const v = this.take(key);
    if (v === null) return null;
    const single = integer(v);
    if (single !== null) return [single, single];
    const values = numbers(v, 2);
    if (values === null || !Number.isInteger(values[0]) || !Number.isInteger(values[1])) {
      this.error(key, `[min, max] als ganze Zahlen erwartet, gefunden: ${show(v)}`);
      return null;
    }
    return [toInt(values[0]), toInt(values[1])];
  }

  requireRange(key) {
    if (!this.has(key)) {
      this.take(key);
      this.missing(key);
      return null;
    }
    return this.optRange(key);
  }

  optIntList(key) {
    const v = this.take(key);
    if (v === null) return null;
    if (!Array.isArray(v)) {
      this.error(key, `Liste ganzer Zahlen erwartet, gefunden: ${show(v)}`);
      return null;
    }
    const out = [];
    for (const item of v) {
      const n = integer(item);
      if (n === null) {
        this.error(key, `Liste ganzer Zahlen erwartet, gefunden: ${show(v)}`);
        return null;
      }
      out.push(n);
    }
    return out;
  }

  finish() {
    const unknown = Object.keys(this.json).filter((k) => !this.used.has(k)).sort();
    for (const key of unknown) this.problems.warning(this.at(key), 'unbekanntes Feld wird ignoriert');
  }
}

/** (int) cast of a whole double, saturating like Java. */
function toInt(d) {
  if (Number.isNaN(d)) return 0;
  return Math.max(INT_MIN, Math.min(INT_MAX, Math.trunc(d)));
}

/** Enum.byKey: lower-cased key among the allowed keys, else null. */
function byKey(allowed, key) {
  const wanted = String(key).toLowerCase();
  return allowed.includes(wanted) ? wanted : null;
}

/** Rarity has no lower-casing (Rarity.getSerializedName). */
function exactKey(allowed, key) {
  return allowed.includes(key) ? key : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Java helpers

/** Double.parseDouble for the stator label digits (decimal only; hex floats and the like are not stator labels). */
function javaParseDouble(text) {
  const t = text.trim();
  if (!/^[+-]?(NaN|Infinity|((\d+\.?\d*|\.\d+)([eE][+-]?\d+)?)[fFdD]?)$/.test(t)) return null;
  return Number(t.replace(/[fFdD]$/, ''));
}

/** MotorDefinition.parseStatorLabel: '0702' → [7, 2], else 22 × 7 mm. */
export function parseStatorLabel(label) {
  if (label == null || label.length < 3) return [22.0, 7.0];
  const diameter = javaParseDouble(label.slice(0, 2));
  const height = javaParseDouble(label.slice(2));
  if (diameter !== null && height !== null && diameter > 0 && height > 0 && Number.isFinite(diameter) && Number.isFinite(height)) {
    return [diameter, height];
  }
  return [22.0, 7.0];
}

/** PartJson.parseColor: '#rrggbb' or 'rrggbb' → int, else null. */
export function parseColor(text) {
  const hex = text.startsWith('#') ? text.slice(1) : text;
  if (hex.length !== 6 || !/^[+-]?[0-9a-fA-F]+$/.test(hex)) return null;
  return Number.parseInt(hex, 16);
}

const finite = Number.isFinite;

function vec(x, y, z) {
  if (!finite(x) || !finite(y) || !finite(z)) fail(`Position muss endlich sein: ${x}, ${y}, ${z}`);
  return [x, y, z];
}

// ---------------------------------------------------------------------------------------------------------------
// Basics (PartBasics, PartVisual, RecycleYield)

function readBasics(f) {
  const mass = f.requireDouble('mass_g');
  const stackSize = f.intOr('stack_size', 0);
  const sortOrder = f.intOr('sort', DEFAULT_SORT_ORDER);
  const creative = f.boolOr('creative', true);
  const durability = f.optDouble('durability');
  const recycle = readRecycle(f);
  const visualFields = f.optObject('visual');
  const visual = visualFields ? readVisual(visualFields) : { accentRgb: null, renderModel: null };
  const rarity = f.optEnum('rarity', RARITIES, exactKey);
  return { mass, stackSize, sortOrder, creative, durability, recycle, visual, rarity };
}

function readRecycle(f) {
  const v = f.raw('recycle');
  if (v === null) return null;
  if (v === 'none') return { item: 'minecraft:air', count: 0 };
  if (!isObject(v)) {
    f.error('recycle', `"none" oder {"item": …, "count": …} erwartet, gefunden: ${show(v)}`);
    return null;
  }
  const y = new Fields(v, f.at('recycle'), f.problems);
  const item = y.requireId('item');
  const count = y.intOr('count', 1);
  y.finish();
  if (item === null) return null;
  if (count < 0 || count > 64) {
    f.error('recycle', `Recycling-Menge muss zwischen 0 und 64 liegen: ${count}`);
    return null;
  }
  return { item, count };
}

function readVisual(f) {
  let accent = null;
  const text = f.optString('accent');
  if (text !== null) {
    accent = parseColor(text);
    if (accent === null) f.error('accent', `Farbe als "#rrggbb" erwartet, gefunden: "${text}"`);
  }
  const model = f.optId('render_model');
  f.finish();
  return { accentRgb: accent, renderModel: model };
}

function resolveBasics(b, defaultDurability) {
  const durability = b.durability === null ? defaultDurability : b.durability;
  if (!finite(b.mass) || b.mass <= 0 || b.mass > 20000) fail(`Masse muss größer als 0 und höchstens 20000 g sein: ${b.mass}`);
  if (b.stackSize < 0 || b.stackSize > 99) fail(`Stapelgröße muss zwischen 0 (Standard) und 99 liegen: ${b.stackSize}`);
  if (!finite(durability) || durability <= 0 || durability > 100) fail(`Haltbarkeit muss größer als 0 und höchstens 100 sein: ${durability}`);
  if (b.visual.accentRgb !== null && (b.visual.accentRgb & 0xff000000) !== 0) fail('Akzentfarbe ist RGB ohne Alpha');
  return {
    massGrams: b.mass,
    stackSize: b.stackSize,
    sortOrder: b.sortOrder,
    creativeListed: b.creative,
    durability,
    recycle: b.recycle,
    visual: { accentRgb: b.visual.accentRgb, renderModel: b.visual.renderModel },
    rarity: b.rarity,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Frames (FrameDefinition, AirframeGeometry, FrameAero, DuctSpec, MassSplit, BatteryFitRule, AnchorSpec, MotorArm)

export const defaultBatteryOnTop = (wheelbase) => wheelbase >= 100;
export const defaultBatteryPlateMm = (wheelbase) => (defaultBatteryOnTop(wheelbase) ? 0.13 * wheelbase : -0.05 * wheelbase);
export const defaultElectronicsMm = (wheelbase) => 0.05 * wheelbase;

/** MotorArm.trueX: four arms on the diagonals of the wheelbase. */
export function trueX(wheelbase, y) {
  const s = wheelbase / (2.0 * Math.sqrt(2.0));
  return [
    { position: [-s, y, -s], spin: PROPS_IN[0] }, { position: [s, y, -s], spin: PROPS_IN[1] },
    { position: [-s, y, s], spin: PROPS_IN[2] }, { position: [s, y, s], spin: PROPS_IN[3] },
  ];
}

function readArms(arms) {
  const out = [];
  ARM_KEYS.forEach((key, i) => {
    const arm = arms.requireObject(key);
    if (arm === null) return;
    const pos = arm.requireVector('pos', 3);
    const spin = arm.optEnum('spin', SPINS, exactKey) ?? PROPS_IN[i];
    arm.finish();
    if (pos !== null) out.push({ position: vec(pos[0], pos[1], pos[2]), spin });
  });
  arms.finish();
  return out;
}

function readDuct(v, parent) {
  if (typeof v === 'boolean') return v ? { thrustGain: null, clearanceMm: null, translationalLiftGain: null, washLoss: null, washNoise: null, restitution: null, friction: null } : null;
  if (!isObject(v)) {
    parent.error('duct', `Objekt erwartet, gefunden: ${show(v)}`);
    return null;
  }
  const f = new Fields(v, parent.at('duct'), parent.problems);
  const duct = {
    thrustGain: f.optDouble('thrust_gain'),
    clearanceMm: f.optDouble('clearance_mm'),
    translationalLiftGain: f.optDouble('translational_lift_gain'),
    washLoss: f.optDouble('wash_loss'),
    washNoise: f.optDouble('wash_noise'),
    restitution: f.optDouble('restitution'),
    friction: f.optDouble('friction'),
  };
  f.finish();
  try {
    const range = (value, min, max, name) => {
      if (value !== null && !(value >= min && value <= max)) fail(`${name} muss zwischen ${min} und ${max} liegen: ${value}`);
    };
    range(duct.thrustGain, 0.5, 2.0, 'Schubgewinn');
    range(duct.clearanceMm, 0.0, 50.0, 'Spaltmaß');
    range(duct.translationalLiftGain, 0.0, 1.0, 'Translationsauftrieb');
    range(duct.washLoss, 0.0, 1.0, 'Propwash-Verlust');
    range(duct.washNoise, 0.0, 1.0, 'Propwash-Rauschen');
    range(duct.restitution, 0.0, 0.95, 'Rückprall');
    range(duct.friction, 0.0, 2.0, 'Reibung');
    return duct;
  } catch (e) {
    if (!(e instanceof Invalid)) throw e;
    parent.error('duct', e.message);
    return null;
  }
}

function massSplit(arms, plate, duct) {
  if (!(arms >= 0 && arms <= 1 && plate >= 0 && plate <= 1 && duct >= 0 && duct <= 1)) {
    fail(`Massenanteile müssen zwischen 0 und 1 liegen: ${arms}, ${plate}, ${duct}`);
  }
  if (Math.abs(arms + plate + duct - 1.0) > 0.001) fail(`Massenanteile müssen zusammen 1 ergeben: ${arms + plate + duct}`);
  return { arms, plate, duct };
}

function anchorSpec(x, y, z, tilt, length) {
  if (!finite(x) || !finite(y) || !finite(z)) fail('Anker-Position muss endlich sein');
  if (!(tilt >= -45.0 && tilt <= 90.0)) fail(`Anker-Neigung muss zwischen -45.0 und 90.0 Grad liegen: ${tilt}`);
  if (!(length >= 0 && length <= 2000)) fail(`Anker-Länge muss zwischen 0 und 2000 mm liegen: ${length}`);
  return { x, y, z, tiltDeg: tilt, lengthMm: length };
}

function batteryFitRule(minCells, maxCells, maxMass, preferredCells, preferredCapacity) {
  if (minCells < 1 || maxCells < minCells || maxCells > 16) fail(`Zellbereich ungültig: ${minCells}–${maxCells}`);
  if (!(maxMass > 0 && maxMass <= 20000)) fail(`Höchstmasse des Akkus ungültig: ${maxMass}`);
  if (preferredCells < minCells || preferredCells > maxCells) fail(`Bevorzugte Mindestzellen außerhalb des Bereichs: ${preferredCells}`);
  if (preferredCapacity < 0) fail(`Bevorzugte Mindestkapazität darf nicht negativ sein: ${preferredCapacity}`);
  return { minCells, maxCells, maxMassGrams: maxMass, preferredMinCells: preferredCells, preferredMinCapacityMah: preferredCapacity };
}

/** The ordered, de-duplicated mount list of a frame (FrameDefinition.orderedCopy). */
function orderedCopy(values, what) {
  if (!values || !values.length) fail(`${what} dürfen nicht leer sein`);
  return [...new Set(values)];
}

function frame(id, basics, f) {
  const b = {
    role: 'freestyle', shape: 'true_x', wheelbase: -1, minProp: 0, maxProp: -1, motorMounts: [], stackMounts: [], accessoryMounts: [],
    arms: [], batteryOnTop: null, batteryPlate: null, electronics: null, camera: null, cameraTilt: DEFAULT_CAMERA_TILT,
    centerOfMass: [0.0, 0.0, 0.0], massSplit: null, anchors: {}, antennaAnchor: null, frontal: -1.0, drag: -1.0, side: null, top: null,
    duct: null, impactTolerance: 8.0, batteryFit: null,
  };
  const role = f.optEnum('role', ROLES);
  if (role !== null) b.role = role;
  const shape = f.optEnum('shape', SHAPES);
  if (shape !== null) b.shape = shape;
  const wheelbase = f.requireInt('wheelbase_mm');
  b.wheelbase = wheelbase;
  const range = f.has('props_mm');
  const max = f.has('max_prop_mm');
  if (range && max) f.error('props_mm', 'entweder props_mm oder max_prop_mm angeben, nicht beides');
  if (range) {
    const p = f.optRange('props_mm');
    if (p !== null) [b.minProp, b.maxProp] = p;
  } else if (max) {
    b.maxProp = f.requireInt('max_prop_mm');
  } else {
    f.error('max_prop_mm', 'Pflichtfeld fehlt (oder props_mm: [min, max])');
  }
  for (const m of f.requireIdList('motor_mounts')) if (!b.motorMounts.includes(m)) b.motorMounts.push(m);
  for (const m of f.requireIdList('stack_mounts')) if (!b.stackMounts.includes(m)) b.stackMounts.push(m);
  for (const s of f.enumList('accessory_mounts', SLOTS)) if (!b.accessoryMounts.includes(s)) b.accessoryMounts.push(s);
  const arms = f.optObject('arms');
  if (arms) b.arms = readArms(arms);
  const battery = f.optObject('battery');
  if (battery) {
    const onTopValue = battery.optBool('on_top');
    const onTop = onTopValue === null ? defaultBatteryOnTop(wheelbase) : onTopValue;
    const plateValue = battery.optDouble('plate_mm');
    const plate = plateValue === null ? (onTop ? 0.13 * wheelbase : -0.05 * wheelbase) : plateValue;
    battery.finish();
    b.batteryOnTop = onTop;
    b.batteryPlate = plate;
  }
  const electronics = f.optDouble('electronics_mm');
  if (electronics !== null) b.electronics = electronics;
  const camera = f.optObject('camera');
  if (camera) {
    const pos = camera.optVector('pos', 3);
    if (pos !== null) b.camera = vec(pos[0], pos[1], pos[2]);
    const tilt = camera.optDouble('tilt_deg');
    if (tilt !== null) b.cameraTilt = tilt;
    camera.finish();
  }
  const com = f.optVector('center_of_mass_mm', 3);
  if (com !== null) b.centerOfMass = vec(com[0], com[1], com[2]);
  const split = f.optObject('mass_split');
  if (split) {
    const a = split.requireDouble('arms');
    const p = split.requireDouble('plate');
    const d = split.doubleOr('duct', 0.0);
    split.finish();
    if (!f.problems.hasErrors()) b.massSplit = massSplit(a, p, d);
  }
  const anchors = f.optObject('accessory_anchors');
  if (anchors) {
    for (const slot of SLOTS) {
      const anchor = anchors.optObject(slot);
      if (!anchor) continue;
      const pos = anchor.requireVector('pos', 3);
      const tilt = anchor.doubleOr('tilt_deg', 0.0);
      const length = anchor.doubleOr('length_mm', 0.0);
      anchor.finish();
      if (pos !== null) b.anchors[slot] = anchorSpec(pos[0], pos[1], pos[2], tilt, length);
    }
    anchors.finish();
  }
  // The frame's antenna holder (Propwash 0.6.0, FrameDefinition.Builder#antennaAnchor).
  const antennaAnchor = f.optObject('antenna_anchor');
  if (antennaAnchor) {
    const pos = antennaAnchor.requireVector('pos', 3);
    const tilt = antennaAnchor.doubleOr('tilt_deg', DEFAULT_ANTENNA_TILT);
    antennaAnchor.finish();
    if (pos !== null) b.antennaAnchor = anchorSpec(pos[0], pos[1], pos[2], tilt, 0.0);
  }
  const aero = f.requireObject('aero');
  if (aero) {
    const frontal = aero.requireDouble('frontal_area_m2');
    const drag = aero.requireDouble('drag_coefficient');
    const side = aero.optDouble('side_area_m2');
    if (side !== null) b.side = side;
    const top = aero.optDouble('top_area_m2');
    if (top !== null) b.top = top;
    aero.finish();
    b.frontal = frontal;
    b.drag = drag;
  }
  const ductRaw = f.raw('duct');
  if (ductRaw !== null) {
    const duct = readDuct(ductRaw, f);
    if (duct) b.duct = duct;
  }
  const impact = f.optDouble('impact_tolerance');
  if (impact !== null) b.impactTolerance = impact;
  const fit = f.requireObject('battery_fit');
  if (fit) {
    const cells = fit.requireRange('cells');
    const maxMass = fit.requireDouble('max_mass_g');
    const preferredCells = fit.intOr('preferred_min_cells', cells === null ? 1 : cells[0]);
    const preferredCapacity = fit.intOr('preferred_min_capacity_mah', 0);
    fit.finish();
    if (cells !== null && !f.problems.hasErrors()) {
      try {
        b.batteryFit = batteryFitRule(cells[0], cells[1], maxMass, preferredCells, preferredCapacity);
      } catch (e) {
        if (!(e instanceof Invalid)) throw e;
        f.error('battery_fit', e.message);
      }
    }
  }
  if (f.problems.hasErrors()) return null;
  return buildFrame(id, resolveBasics(basics, 1.0), b);
}

function buildFrame(id, basics, b) {
  if (b.wheelbase < 0 || b.maxProp < 0) fail(`${id}: Radstand und größter Propeller sind Pflicht`);
  if (b.frontal < 0 || b.drag < 0) fail(`${id}: Stirnfläche und Widerstandsbeiwert sind Pflicht`);
  if (b.batteryFit === null) fail(`${id}: Akku-Regel (battery_fit) ist Pflicht`);
  const onTop = b.batteryOnTop !== null ? b.batteryOnTop : defaultBatteryOnTop(b.wheelbase);
  const plate = b.batteryPlate !== null ? b.batteryPlate : defaultBatteryPlateMm(b.wheelbase);
  const electronics = b.electronics !== null ? b.electronics : defaultElectronicsMm(b.wheelbase);
  const split = b.massSplit !== null ? b.massSplit : b.duct !== null ? { ...MASS_SPLIT_DUCTED } : { ...MASS_SPLIT_OPEN };
  if (b.arms.length && b.arms.length !== 4) {
    fail(`Ein Rahmen hat genau 4 Arme (vorne links, vorne rechts, hinten links, hinten rechts): ${b.arms.length}`);
  }
  if (!finite(plate) || !finite(electronics)) fail('Akkuplatte und Elektronikhöhe müssen endlich sein');
  if (!(b.cameraTilt >= 0.0 && b.cameraTilt <= 80.0)) fail(`Kamerawinkel muss zwischen 0.0 und 80.0 Grad liegen: ${b.cameraTilt}`);
  const anchors = {};
  for (const slot of SLOTS) if (b.anchors[slot]) anchors[slot] = b.anchors[slot];
  const geometry = {
    arms: b.arms, batteryOnTop: onTop, batteryPlateMm: plate, electronicsMm: electronics, cameraMm: b.camera, cameraTiltDeg: b.cameraTilt,
    frameCenterOfMassMm: b.centerOfMass, massSplit: split, accessoryAnchors: anchors, antennaAnchor: b.antennaAnchor,
  };
  if (!(b.frontal > 0 && b.frontal <= 2.0)) fail(`Stirnfläche muss größer als 0 und höchstens 2 m² sein: ${b.frontal}`);
  if (!(b.drag > 0 && b.drag <= 3.0)) fail(`Widerstandsbeiwert muss größer als 0 und höchstens 3 sein: ${b.drag}`);
  for (const [value, name] of [[b.side, 'Seitenfläche'], [b.top, 'Draufsichtfläche']]) {
    if (value !== null && !(value > 0 && value <= 5.0)) fail(`${name} muss größer als 0 und höchstens 5 m² sein: ${value}`);
  }
  const aero = { frontalAreaM2: b.frontal, dragCoefficient: b.drag, sideAreaM2: b.side, topAreaM2: b.top };
  if (b.wheelbase < 20 || b.wheelbase > 2000) fail(`${id}: Radstand muss zwischen 20 und 2000 mm liegen: ${b.wheelbase}`);
  if (b.minProp < 0 || b.maxProp < 10 || b.minProp > b.maxProp || b.maxProp > MAX_PROP_MM) {
    fail(`${id}: Propellerbereich ungültig: ${b.minProp}–${b.maxProp} mm`);
  }
  const motorMounts = orderedCopy(b.motorMounts, `${id}: Motorhalterungen`);
  const stackMounts = orderedCopy(b.stackMounts, `${id}: Stack-Halterungen`);
  const accessoryMounts = SLOTS.filter((s) => b.accessoryMounts.includes(s));
  for (const slot of Object.keys(anchors)) {
    if (!accessoryMounts.includes(slot)) fail(`${id}: Zubehör-Anker für ${slot} ohne passende Zubehör-Halterung`);
  }
  if (!(b.impactTolerance > 0 && b.impactTolerance <= 100)) {
    fail(`${id}: Aufprall-Toleranz muss größer als 0 und höchstens 100 m/s sein: ${b.impactTolerance}`);
  }
  return {
    kind: 'frame', id, basics, role: b.role, shape: b.shape, wheelbaseMm: b.wheelbase, minPropMm: b.minProp, maxPropMm: b.maxProp,
    motorMounts, stackMounts, accessoryMounts, geometry, aero, duct: b.duct, impactTolerance: b.impactTolerance, batteryFit: b.batteryFit,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Stacks, motors, props, batteries, video, accessories

function stack(id, basics, f) {
  const mount = f.requireId('mount');
  const continuous = f.requireDouble('esc_continuous_a');
  const cells = f.requireRange('cells');
  const allInOne = f.boolOr('all_in_one', false);
  const burst = f.optDouble('esc_burst_a');
  const resistance = f.optDouble('esc_resistance_ohm');
  const brownout = f.optDouble('brownout_v');
  const board = f.optDouble('board_size_mm');
  if (f.problems.hasErrors()) return null;
  const resolved = resolveBasics(basics, 1.0);
  if (mount === null || continuous < 0 || cells[0] < 0) fail(`${id}: Masse, Halterung, ESC-Dauerstrom und Zellbereich sind Pflicht`);
  if (!(continuous > 0 && continuous <= 500)) fail(`${id}: ESC-Dauerstrom muss größer als 0 und höchstens 500 A sein: ${continuous}`);
  if (cells[0] < 1 || cells[1] < cells[0] || cells[1] > 16) fail(`${id}: Zellbereich ungültig: ${cells[0]}–${cells[1]}`);
  if (burst !== null && burst < continuous) fail(`${id}: ESC-Spitzenstrom kleiner als Dauerstrom`);
  if (resistance !== null && !(resistance > 0 && resistance < 1)) fail(`${id}: ESC-Widerstand ungültig: ${resistance}`);
  if (brownout !== null && !(brownout > 0 && brownout < 20)) fail(`${id}: Brownout-Spannung ungültig: ${brownout}`);
  if (board !== null && !(board >= 10 && board <= 120)) fail(`${id}: Platinengröße ungültig: ${board}`);
  return {
    kind: 'stack', id, basics: resolved, mount, escContinuousAmps: continuous, minCells: cells[0], maxCells: cells[1], allInOne,
    escBurstAmps: burst, escResistanceOhm: resistance, brownoutVoltage: brownout, boardSizeMm: board,
  };
}

function motorThermal(capacity, cooling, coolingSpeed, derate, maxTemp, wear) {
  const positive = (value, max, name) => {
    if (value !== null && !(value > 0 && value <= max)) fail(`${name} muss größer als 0 und höchstens ${max} sein: ${value}`);
  };
  positive(capacity, 100000.0, 'Wärmekapazität');
  positive(cooling, 100.0, 'Kühlung');
  positive(coolingSpeed, 1.0, 'drehzahlabhängige Kühlung');
  if (!(derate >= 40 && derate < maxTemp && maxTemp <= 300)) {
    fail(`Temperaturgrenzen ungültig: Leistungsverlust ab ${derate} °C, starker Verschleiß ab ${maxTemp} °C`);
  }
  if (!(wear >= 0 && wear <= 1)) fail(`Hitzeverschleiß muss zwischen 0 und 1 pro Sekunde liegen: ${wear}`);
  return { heatCapacityJPerK: capacity, coolingWPerK: cooling, coolingWPerKPerRadS: coolingSpeed, derateStartC: derate, maxTempC: maxTemp, wearPerSecondAtMax: wear };
}

function motor(id, basics, f) {
  const stator = f.requireString('stator');
  const statorMm = f.optVector('stator_mm', 2);
  const kv = f.requireInt('kv');
  const mount = f.requireId('mount');
  const current = f.requireDouble('max_current_a');
  const resistance = f.requireDouble('resistance_ohm');
  const cells = f.requireRange('cells');
  const propMount = f.optId('prop_mount');
  let thermal = { ...THERMAL_DEFAULT };
  const t = f.optObject('thermal');
  if (t) {
    const capacity = t.optDouble('heat_capacity_j_per_k');
    const cooling = t.optDouble('cooling_w_per_k');
    const coolingSpeed = t.optDouble('cooling_w_per_k_per_rad_s');
    const derate = t.doubleOr('derate_start_c', THERMAL_DEFAULT.derateStartC);
    const maxTemp = t.doubleOr('max_temp_c', THERMAL_DEFAULT.maxTempC);
    const wear = t.doubleOr('wear_per_s_at_max', THERMAL_DEFAULT.wearPerSecondAtMax);
    t.finish();
    try {
      thermal = motorThermal(capacity, cooling, coolingSpeed, derate, maxTemp, wear);
    } catch (e) {
      if (!(e instanceof Invalid)) throw e;
      f.error('thermal', e.message);
    }
  }
  if (f.problems.hasErrors()) return null;
  const resolved = resolveBasics(basics, 1.0);
  if (stator === null || kv < 0 || mount === null || current < 0 || resistance < 0 || cells[0] < 0) {
    fail(`${id}: Masse, Stator, KV, Halterung, Höchststrom, Widerstand und Zellbereich sind Pflicht`);
  }
  let [diameter, height] = statorMm || [-1.0, -1.0];
  if (diameter < 0 || height < 0) [diameter, height] = parseStatorLabel(stator);
  if (stator.trim() === '' || stator.length > 16) fail(`${id}: Stator-Bezeichnung fehlt oder ist zu lang`);
  if (!(diameter >= 3 && diameter <= 120 && height >= 0.5 && height <= 60)) fail(`${id}: Statormaße ungültig: ${diameter} × ${height} mm`);
  if (kv < 50 || kv > 100000) fail(`${id}: KV muss zwischen 50 und 100000 liegen: ${kv}`);
  if (!(current > 0 && current <= 500)) fail(`${id}: Höchststrom ungültig: ${current}`);
  if (!(resistance > 0 && resistance < 10)) fail(`${id}: Wicklungswiderstand ungültig: ${resistance}`);
  if (cells[0] < 1 || cells[1] < cells[0] || cells[1] > 16) fail(`${id}: Zellbereich ungültig: ${cells[0]}–${cells[1]}`);
  return {
    kind: 'motor', id, basics: resolved, statorLabel: stator, statorDiameterMm: diameter, statorHeightMm: height, kv, mount,
    maxCurrentAmps: current, resistanceOhm: resistance, minCells: cells[0], maxCells: cells[1], propMount: propMount ?? PROP_UNIVERSAL, thermal,
  };
}

function prop(id, basics, f) {
  const diameter = f.requireInt('diameter_mm');
  const pitch = f.requireDouble('pitch_in');
  const blades = f.requireInt('blades');
  const ct = f.requireDouble('ct');
  const cp = f.requireDouble('cp');
  const material = f.optEnum('material', Object.keys(MATERIALS)) ?? 'polycarbonate';
  const stiffness = f.optDouble('stiffness');
  const mount = f.optId('mount');
  const reverse = f.optDouble('reverse_thrust');
  if (f.problems.hasErrors()) return null;
  const resolved = resolveBasics(basics, MATERIALS[material].durability);
  if (diameter < 0 || blades < 0 || ct < 0 || cp < 0) fail(`${id}: Masse, Größe, Blattzahl und Beiwerte sind Pflicht`);
  const stiff = stiffness === null ? MATERIALS[material].stiffness : stiffness;
  if (diameter < 10 || diameter > MAX_PROP_MM) fail(`${id}: Propellerdurchmesser muss zwischen 10 und ${MAX_PROP_MM} mm liegen: ${diameter}`);
  if (!(pitch > 0 && pitch <= 12)) fail(`${id}: Steigung ungültig: ${pitch}`);
  if (blades < 2 || blades > 8) fail(`${id}: Blattzahl muss zwischen 2 und 8 liegen: ${blades}`);
  if (!(ct > 0 && ct < 1 && cp > 0 && cp < 1)) fail(`${id}: Schub- und Leistungsbeiwert müssen zwischen 0 und 1 liegen`);
  if (!(stiff > 0 && stiff <= 10)) fail(`${id}: Steifigkeit muss größer als 0 und höchstens 10 sein: ${stiff}`);
  if (reverse !== null && !(reverse >= 0.2 && reverse <= 1.0)) fail(`${id}: Umkehrschub muss zwischen 0.2 und 1.0 liegen: ${reverse}`);
  return {
    kind: 'prop', id, basics: resolved, diameterMm: diameter, pitchInch: pitch, blades, thrustCoefficient: ct, powerCoefficient: cp,
    material, stiffness: stiff, mount: mount ?? PROP_UNIVERSAL, reverseThrust: reverse,
  };
}

function battery(id, basics, f) {
  const cells = f.requireInt('cells');
  const capacity = f.requireInt('capacity_mah');
  const resistance = f.requireDouble('cell_resistance_ohm');
  const cRating = f.requireInt('c_rating');
  const chemistry = f.optId('chemistry') ?? LIPO;
  const pack = f.optVector('pack_mm', 3);
  const connector = f.optString('connector') ?? '';
  if (f.problems.hasErrors()) return null;
  const resolved = resolveBasics(basics, 1.0);
  if (cells < 0 || capacity < 0 || resistance < 0 || cRating < 0) fail(`${id}: Masse, Zellzahl, Kapazität, Innenwiderstand und C-Rate sind Pflicht`);
  let packSize = null;
  if (pack !== null) {
    const [l, w, h] = pack;
    if (!(l > 1 && l <= 500 && w > 1 && w <= 500 && h > 1 && h <= 500)) fail(`Akkumaße ungültig: ${l} × ${w} × ${h} mm`);
    packSize = { lengthMm: l, widthMm: w, heightMm: h };
  }
  if (cells < 1 || cells > 12) fail(`${id}: Zellzahl muss zwischen 1 und 12 liegen: ${cells}`);
  if (capacity < 50 || capacity > 50000) fail(`${id}: Kapazität muss zwischen 50 und 50000 mAh liegen: ${capacity}`);
  if (!(resistance > 0 && resistance < 1)) fail(`${id}: Innenwiderstand je Zelle ungültig: ${resistance}`);
  if (cRating < 1 || cRating > 300) fail(`${id}: C-Rate muss zwischen 1 und 300 liegen: ${cRating}`);
  if (connector.length > 16) fail(`${id}: Stecker-Bezeichnung zu lang`);
  return {
    kind: 'battery', id, basics: resolved, cells, capacityMah: capacity, cellResistanceOhm: resistance, cRating, chemistry, packSize, connector,
  };
}

/** BatteryDefinition.maxContinuousCurrent. */
export const maxContinuousCurrent = (b) => (b.cRating * b.capacityMah) / 1000.0;

function video(id, basics, f) {
  const link = f.requireEnum('link', LINKS);
  const latency = f.requireInt('latency_ms');
  const range = f.requireInt('range_blocks');
  const quality = f.requireDouble('image_quality');
  const width = f.optDouble('camera_width_mm');
  const fov = f.optDouble('camera_fov_deg');
  const power = f.intOr('vtx_power_mw', 0);
  const watts = f.optDouble('power_w');
  const levels = f.optIntList('vtx_levels_mw') ?? [];
  const antenna = videoAntennaOf(f);
  if (f.problems.hasErrors()) return null;
  const resolved = resolveBasics(basics, 1.0);
  if (link === null || latency < 0 || range < 0 || quality < 0) fail(`${id}: Masse, System, Latenz, Reichweite und Bildqualität sind Pflicht`);
  const cameraWidth = width === null ? 19.0 : width;
  if (latency < 1 || latency > 500) fail(`${id}: Latenz muss zwischen 1 und 500 ms liegen: ${latency}`);
  if (range < 16 || range > 20000) fail(`${id}: Reichweite muss zwischen 16 und 20000 Blöcken liegen: ${range}`);
  if (!(quality > 0 && quality <= 1)) fail(`${id}: Bildqualität muss größer als 0 und höchstens 1 sein: ${quality}`);
  if (!(cameraWidth >= 8 && cameraWidth <= 40)) fail(`${id}: Kamerabreite muss zwischen 8 und 40 mm liegen: ${cameraWidth}`);
  if (fov !== null && !(fov >= 60 && fov <= 180)) fail(`${id}: Kamera-Sichtfeld muss zwischen 60 und 180 Grad liegen: ${fov}`);
  if (power < 0 || power > 10000) fail(`${id}: Sendeleistung ungültig: ${power}`);
  if (watts !== null && !(watts >= 0.1 && watts <= 60)) fail(`${id}: Leistungsaufnahme muss zwischen 0,1 und 60 W liegen: ${watts}`);
  if (levels.length) {
    if (power <= 0) fail(`${id}: Leistungsstufen brauchen eine Sendeleistung (vtx_power_mw)`);
    if (levels.length > MAX_VTX_LEVELS) fail(`${id}: höchstens ${MAX_VTX_LEVELS} Leistungsstufen: ${levels}`);
    let previous = 0;
    for (const level of levels) {
      if (level <= previous || level > 10000) fail(`${id}: Leistungsstufen müssen aufsteigend zwischen 1 und 10000 mW liegen: ${levels}`);
      previous = level;
    }
    if (!levels.includes(power)) fail(`${id}: Leistungsstufen müssen die Sendeleistung ${power} mW enthalten: ${levels}`);
  }
  return {
    kind: 'video', id, basics: resolved, link, latencyMs: latency, rangeBlocks: range, imageQuality: quality, cameraWidthMm: cameraWidth,
    cameraFovDeg: fov, vtxPowerMw: power, powerW: watts, vtxLevelsMw: levels, antenna,
  };
}

/**
 * VideoAntenna: one or two antennas of 10 to 250 mm with a cap; count 0 is none (VideoAntenna.none(): length 0, cap
 * whip, whatever was given).
 */
function videoAntenna(count, lengthMm, cap) {
  if (count === 0) return { count: 0, lengthMm: 0.0, cap: 'whip' };
  if (count < 0 || count > MAX_ANTENNA_COUNT) fail(`Antennen-Anzahl muss 0 (keine), 1 oder ${MAX_ANTENNA_COUNT} sein: ${count}`);
  if (!(lengthMm >= MIN_ANTENNA_LENGTH_MM && lengthMm <= MAX_ANTENNA_LENGTH_MM)) {
    fail(`Antennen-Länge muss zwischen ${MIN_ANTENNA_LENGTH_MM.toFixed(1)} und ${MAX_ANTENNA_LENGTH_MM.toFixed(1)} mm liegen: ${lengthMm}`);
  }
  return { count, lengthMm, cap };
}

/**
 * PartJson.videoAntenna: "antenna": "none" (no external antennas), an object (readAntenna), any other text an error;
 * null without the field or with an error.
 */
function videoAntennaOf(f) {
  const raw = f.raw('antenna');
  if (typeof raw === 'string') {
    if (raw === NO_ANTENNA) return videoAntenna(0, 0.0, 'whip');
    f.error('antenna', `"${NO_ANTENNA}" oder Objekt erwartet, gefunden: ${show(raw)}`);
    return null;
  }
  const fields = f.optObject('antenna');
  return fields ? readAntenna(fields) : null;
}

/** PartJson.antenna: the VTX's own antennas (count 1 by default), null with an error in the part. */
function readAntenna(a) {
  const count = a.intOr('count', 1);
  const length = a.requireDouble('length_mm');
  const cap = a.requireEnum('cap', CAPS);
  a.finish();
  if (cap === null || a.problems.hasErrors()) return null;
  return videoAntenna(count, length, cap);
}

function readLedPath(f, v) {
  const size = Array.isArray(v) ? v.length : -1;
  if (!Array.isArray(v) || size < MIN_LED_PATH_POINTS || size > MAX_LED_PATH_POINTS) {
    const found = size < 0 ? show(v) : `${size}${size === 1 ? ' Punkt' : ' Punkte'}`;
    f.error('led_path', `Liste mit ${MIN_LED_PATH_POINTS} bis ${MAX_LED_PATH_POINTS} Punkten [x, y, z] in mm erwartet, gefunden: ${found}`);
    return [];
  }
  const out = [];
  for (let i = 0; i < v.length; i++) {
    const values = numbers(v[i], 3);
    if (values === null) {
      f.error('led_path', `Punkt ${i + 1}: [x, y, z] mit 3 endlichen Zahlen erwartet, gefunden: ${show(v[i])}`);
      return [];
    }
    out.push(values);
  }
  return out;
}

function sensorInches(f) {
  const v = f.raw('sensor_in');
  if (v === null) {
    f.error('sensor_in', 'Pflichtfeld fehlt');
    return NaN;
  }
  const n = number(v);
  if (n !== null) return n;
  if (typeof v === 'string') {
    const text = v.trim();
    if (text.startsWith('1/')) {
      const divisor = javaParseDouble(text.slice(2));
      if (divisor !== null && divisor > 0 && Number.isFinite(divisor)) return 1.0 / divisor;
    }
  }
  f.error('sensor_in', `Zahl oder Bruch wie "1/2.8" erwartet, gefunden: ${show(v)}`);
  return NaN;
}

function actionCam(f) {
  const height = f.requireInt('max_height');
  const fps = f.requireInt('max_fps');
  const stabilization = f.boolOr('stabilization', false);
  const levelling = f.boolOr('horizon_levelling', false);
  const ownBattery = f.doubleOr('own_battery_wh', 0.0);
  const record = f.requireDouble('record_w');
  const maxRecordValue = f.optDouble('max_record_w');
  const maxRecord = maxRecordValue === null ? record : maxRecordValue;
  const fov = f.requireDouble('fov_deg');
  const quality = f.requireDouble('image_quality');
  const noise = f.requireDouble('low_light_noise');
  const sensor = sensorInches(f);
  f.finish();
  if (f.problems.hasErrors()) return null;
  try {
    if (![720, 1080, 1440, 2160].includes(height)) fail(`Höchstauflösung muss 720, 1080, 1440 oder 2160 sein: ${height}`);
    if (fps !== 30 && fps !== 60) fail(`Bildrate muss 30 oder 60 sein: ${fps}`);
    if (!(ownBattery >= 0 && ownBattery <= 100 && record > 0 && maxRecord >= record && maxRecord <= 50)) fail('Energiewerte der Action-Cam ungültig');
    if (!(fov >= 60 && fov <= 180 && quality > 0 && quality <= 1 && noise >= 0 && noise <= 1 && sensor > 0 && sensor <= 2)) {
      fail('Bildwerte der Action-Cam ungültig');
    }
  } catch (e) {
    if (!(e instanceof Invalid)) throw e;
    f.error('', e.message);
    return null;
  }
  return {
    maxHeight: height, maxFps: fps, stabilization, horizonLevelling: levelling, ownBatteryWh: ownBattery, recordWatts: record,
    maxRecordWatts: maxRecord, fovDegrees: fov, imageQuality: quality, lowLightNoise: noise, sensorInches: sensor,
  };
}

function checkedLedPath(id, path, leds) {
  if (!path || !path.length) return [];
  if (path.length < MIN_LED_PATH_POINTS || path.length > MAX_LED_PATH_POINTS) {
    fail(`${id}: led_path braucht ${MIN_LED_PATH_POINTS} bis ${MAX_LED_PATH_POINTS} Punkte, hat ${path.length}`);
  }
  if (leds <= 0) fail(`${id}: led_path ohne LEDs (leds ist 0)`);
  let length = 0;
  path.forEach((p, i) => {
    if (Math.abs(p[0]) > MAX_LED_PATH_MM || Math.abs(p[1]) > MAX_LED_PATH_MM || Math.abs(p[2]) > MAX_LED_PATH_MM) {
      fail(`${id}: led_path, Punkt ${i + 1} liegt außerhalb von ±${MAX_LED_PATH_MM} mm: [${p.join(', ')}]`);
    }
    if (i > 0) {
      const q = path[i - 1];
      length += Math.sqrt((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2);
    }
  });
  if (!(length > 0)) fail(`${id}: led_path hat die Länge 0 (alle Punkte gleich)`);
  return path.map((p) => [...p]);
}

function accessory(id, basics, f) {
  const slot = f.requireEnum('slot', SLOTS);
  const size = f.requireVector('size_mm', 3);
  const watts = f.doubleOr('flight_battery_w', 0.0);
  const frontal = f.doubleOr('frontal_area_m2', 0.0);
  const leds = f.intOr('leds', 0);
  const lens = [0.0, 0.0];
  const lensFields = f.optObject('lens');
  if (lensFields) {
    lens[0] = lensFields.doubleOr('x_mm', 0.0);
    lens[1] = lensFields.doubleOr('length_mm', 0.0);
    lensFields.finish();
  }
  const camFields = f.optObject('action_cam');
  const camera = camFields ? actionCam(camFields) : null;
  const ledRaw = f.raw('led_path');
  const ledPath = ledRaw === null ? [] : readLedPath(f, ledRaw);
  const hangsStraight = f.boolOr('hangs_straight', false);
  const muzzle = f.optVector('muzzle_mm', 3);
  const frames = f.optIdList('frames');
  const recess = f.doubleOr('recess_mm', 0.0);
  const drop = f.doubleOr('drop_mm', 0.0);
  if (f.problems.hasErrors()) return null;
  const resolved = resolveBasics(basics, 1.0);
  if (slot === null || size[0] < 0) fail(`${id}: Masse, Halterung und Maße sind Pflicht`);
  const [width, height, depth] = size;
  const path = checkedLedPath(id, ledPath.map((p) => vec(p[0], p[1], p[2])), leds);
  if (!(width > 0 && width <= 500 && height > 0 && height <= 500 && depth > 0 && depth <= 500)) fail(`${id}: Zubehörmaße ungültig`);
  if (!(recess >= 0 && recess <= depth)) fail(`${id}: recess_mm muss zwischen 0 und der Tiefe ${depth} mm liegen: ${recess}`);
  if (!(drop >= 0 && drop <= height)) fail(`${id}: drop_mm muss zwischen 0 und der Höhe ${height} mm liegen: ${drop}`);
  if (!(watts >= 0 && watts <= 200)) fail(`${id}: Leistungsaufnahme ungültig: ${watts}`);
  if (!(frontal >= 0 && frontal <= 0.5)) fail(`${id}: Stirnfläche ungültig: ${frontal}`);
  if (leds < 0 || leds > MAX_LEDS) fail(`${id}: LED-Anzahl muss zwischen 0 und ${MAX_LEDS} liegen: ${leds}`);
  if (camera && slot !== 'top' && slot !== 'front') fail(`${id}: Action-Cams sitzen oben oder vorn`);
  if (!finite(lens[0]) || !(lens[1] >= 0 && lens[1] <= 100)) fail(`${id}: Objektivlage ungültig`);
  let muzzleMm = null;
  if (muzzle !== null) {
    muzzleMm = vec(muzzle[0], muzzle[1], muzzle[2]);
    const m = MAX_MUZZLE_OUTSIDE_MM;
    if (Math.abs(muzzleMm[0]) > width / 2 + m || Math.abs(muzzleMm[1]) > height / 2 + m || muzzleMm[2] < -m || muzzleMm[2] > depth + m) {
      fail(`${id}: muzzle_mm [${muzzleMm.join(', ')}] liegt mehr als ${m} mm außerhalb der Box`);
    }
  }
  return {
    kind: 'accessory', id, basics: resolved, slot, widthMm: width, heightMm: height, depthMm: depth, flightBatteryWatts: watts,
    frontalAreaM2: frontal, ledCount: leds, actionCam: camera, lensXMm: lens[0], lensLengthMm: lens[1], ledPathMm: path, hangsStraight,
    muzzleMm, frames: [...new Set(frames)].sort(idCompare), recessMm: recess, dropMm: drop,
  };
}

const DECODERS = { frame, stack, motor, prop, video, battery, accessory };

// ---------------------------------------------------------------------------------------------------------------
// Entry points (PartJson.parse/decode/decodeChemistry, BundledParts.load)

function messageOf(e) {
  return e && e.message ? e.message : String(e);
}

/** PartJson.parse: the text as a JSON object, else null with an error. */
export function parseJson(text, problems) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (e) {
    problems.error('', `ungültiges JSON: ${messageOf(e)}`);
    return null;
  }
  if (!isObject(value)) {
    problems.error('', 'JSON-Objekt erwartet');
    return null;
  }
  return value;
}

function checkFormat(f) {
  const format = f.optInt('format');
  if (format !== null && (format < 1 || format > FORMAT)) {
    f.error('format', `Format ${format} wird nicht unterstützt (diese Propwash-Version liest bis Format ${FORMAT}; Propwash aktualisieren)`);
  }
}

/** PartJson.decode of a parsed object: {definition | null, errors, warnings}. */
export function decodeObject(kind, id, json, file = id) {
  const problems = problemList(file);
  const decoder = DECODERS[kind];
  if (!decoder) {
    problems.error('', `unbekannte Kategorie "${kind}"`);
    return { definition: null, errors: problems.errors, warnings: problems.warnings };
  }
  const f = new Fields(json, '', problems);
  checkFormat(f);
  const basics = readBasics(f);
  let definition = null;
  try {
    definition = decoder(id, basics, f);
  } catch (e) {
    if (!problems.hasErrors()) problems.error('', messageOf(e));
    definition = null;
  }
  f.finish();
  return { definition: problems.hasErrors() ? null : definition, errors: problems.errors, warnings: problems.warnings };
}

/** A part file's text → {definition | null, errors, warnings}. */
export function decodePart(kind, id, text, file = id) {
  const problems = problemList(file);
  const json = parseJson(text, problems);
  if (json === null) return { definition: null, errors: problems.errors, warnings: problems.warnings };
  return decodeObject(kind, id, json, file);
}

/** PartJson.decodeChemistry of a file's text → {chemistry | null, errors, warnings}. */
export function decodeChemistry(id, text, file = id) {
  const problems = problemList(file);
  const json = parseJson(text, problems);
  if (json === null) return { chemistry: null, errors: problems.errors, warnings: problems.warnings };
  const f = new Fields(json, '', problems);
  checkFormat(f);
  const full = f.requireDouble('full_v');
  const nominal = f.requireDouble('nominal_v');
  const empty = f.requireDouble('empty_v');
  const cutoff = f.requireDouble('cutoff_v');
  const storage = f.requireDouble('storage_v');
  const density = f.requireDouble('density_g_cm3');
  const shape = f.requireVector('ocv_shape', SOC_GRID.length);
  const usable = f.optDouble('usable_fraction');
  f.finish();
  if (problems.hasErrors()) return { chemistry: null, errors: problems.errors, warnings: problems.warnings };
  try {
    if (!(cutoff > 0.5 && cutoff <= empty && empty < nominal && nominal < full && full <= 5.0)) {
      fail(`${id}: Zellspannungen müssen Abschalt ≤ Leer < Nenn < Voll ≤ 5 V erfüllen`);
    }
    if (!(storage >= empty && storage <= full)) fail(`${id}: Lagerspannung außerhalb des Bereichs: ${storage}`);
    if (!(density > 0.5 && density < 10)) fail(`${id}: Dichte ungültig: ${density}`);
    let previous = -1.0;
    for (const value of shape) {
      if (!(value >= previous && value >= 0 && value <= 1)) fail(`${id}: Spannungskurve muss von 0 bis 1 monoton steigen`);
      previous = value;
    }
    if (shape[0] !== 0.0 || shape[shape.length - 1] !== 1.0) fail(`${id}: Spannungskurve muss bei 0 beginnen und bei 1 enden`);
    if (usable !== null && !(usable >= 0.5 && usable <= 1.0)) fail(`${id}: Nutzbarer Anteil muss zwischen 0,5 und 1 liegen: ${usable}`);
  } catch (e) {
    problems.error('', messageOf(e));
    return { chemistry: null, errors: problems.errors, warnings: problems.warnings };
  }
  return {
    chemistry: {
      id, fullCellVoltage: full, nominalCellVoltage: nominal, emptyCellVoltage: empty, cutoffCellVoltage: cutoff, storageCellVoltage: storage,
      densityGramsPerCm3: density, ocvShape: shape, usableFraction: usable,
    },
    errors: problems.errors,
    warnings: problems.warnings,
  };
}

/** CellChemistry.landingCellVoltage. */
export const landingCellVoltage = (c) => 0.5 * (c.emptyCellVoltage + c.cutoffCellVoltage);

/** CellChemistry.effectiveUsableFraction. */
export function effectiveUsableFraction(c) {
  if (c.usableFraction !== null) return c.usableFraction;
  if (c.emptyCellVoltage < 3.25) return 0.88;
  return c.fullCellVoltage >= 4.3 ? 0.85 : 0.8;
}

/** The part file path data/<ns>/propwash_parts/<kind>/<path>.json as {namespace, category, path, order}, or a reason. */
export function partPath(file) {
  const segments = file.split('/');
  if (segments.length < 4 || segments[0] !== 'data' || segments[2] !== FOLDER || !file.endsWith('.json')) return null;
  const namespace = segments[1];
  if (segments.length !== 5) {
    return { error: `${file} – Bauteil-Dateien liegen direkt in data/<namensraum>/${FOLDER}/<kategorie>/, ohne Unterordner`, namespace };
  }
  const category = segments[3];
  const order = ORDER.indexOf(category);
  if (order < 0) return { error: `${file} – unbekannte Kategorie "${category}", erlaubt: ${ORDER.join(', ')}`, namespace };
  const name = segments[4].slice(0, -'.json'.length);
  const id = tryBuild(namespace, name);
  if (id === null) return { error: `${file} – ungültiger Dateiname für eine Id: ${namespace}:${name}`, namespace };
  return { namespace, category, order, id };
}

/** PartIndex.validateId: foreign namespaces only, a flat path, at most 128 characters. */
function validateId(id, what, propwash) {
  const [namespace, path] = splitId(id);
  if (!propwash && namespace === DEFAULT_NAMESPACE) {
    return `${id} (${what}): der Namensraum ${DEFAULT_NAMESPACE} ist Propwash vorbehalten`;
  }
  if (!/^[a-z0-9_.-]+$/.test(path)) return `${what} ${id}: Der Pfad darf nur a–z, 0–9, _, . und - enthalten (keine Unterordner mit /)`;
  if (id.length > MAX_KEY_LENGTH) return `${what} ${id}: Id ist länger als ${MAX_KEY_LENGTH} Zeichen`;
  return null;
}

/**
 * BundledParts.load: every part and chemistry file of a mod (files: Map or object path → text), in the mod's order
 * (chemistry, frame, stack, …, each by path). As in the game, one broken file fails the whole mod: then `parts` and
 * `chemistries` are empty and `errors` says why. For Propwash itself (builtin) its own namespace is read like the
 * built-in parts (BuiltinParts).
 */
export function bundledParts(files, modId) {
  const entries = [];
  const errors = [];
  const warnings = [];
  const propwash = modId === DEFAULT_NAMESPACE;
  const list = files instanceof Map ? [...files.entries()] : Object.entries(files);
  for (const [file, text] of list) {
    const p = partPath(file);
    if (p === null) continue;
    if (p.error) {
      errors.push(p.error);
      continue;
    }
    entries.push({ ...p, file, text });
  }
  entries.sort((a, b) => (a.order - b.order) || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  const parts = [];
  const chemistries = [];
  const seen = new Set();
  for (const e of entries) {
    const result = e.order === 0 ? decodeChemistry(e.id, e.text, e.file) : decodePart(e.category, e.id, e.text, e.file);
    errors.push(...result.errors.map((m) => `${e.file} – ${m}`));
    warnings.push(...result.warnings.map((m) => `${e.file} – ${m}`));
    const item = e.order === 0 ? result.chemistry : result.definition;
    if (!item) continue;
    const refused = validateId(e.id, e.order === 0 ? 'Zellchemie' : 'Bauteil', propwash);
    if (refused) {
      errors.push(`${e.file} – ${refused}`);
      continue;
    }
    if (seen.has(e.id)) {
      errors.push(`${e.file} – ${e.id} ist schon angemeldet`);
      continue;
    }
    seen.add(e.id);
    (e.order === 0 ? chemistries : parts).push(item);
  }
  if (errors.length) return { parts: [], chemistries: [], errors, warnings, files: entries.length };
  return { parts, chemistries, errors, warnings, files: entries.length };
}
