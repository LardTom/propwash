#!/usr/bin/env node
// Tests the flight model of the FPV simulator (assets/js/sim/model/, the JS port of de.lardtom.propwash.sim, and the
// pilot loop assets/js/sim/flight.js) against the compiled classes of Propwash 0.6.0, without Java: the vectors in
// tools/fixtures/sim/ were made with the classes of the release jar by node tools/build-sim-vectors.mjs.
//
//   node tools/test-sim-model.mjs [--quiet] [--vectors <file of build-sim-vectors.mjs --out>]
//
// 1. Constants of DroneSim/FlightController that the JVM computes with Math.cos/Math.exp, bit for bit.
// 2. StrictMath.pow of the derivation of the built-in parts against JS Math.pow (analysis.js derives with Math.pow): the
//    known exceptions must be the only ones, one ulp each: 0.076^5 (rotor torque constant kTorque of the 76 mm prop
//    p3_3b; the same holds for 152 mm add-on props) and (m / 33 g)^(2/3) of the 9 g and 47 g motors (m0802_22000,
//    m2807_1300: motor cooling size factor motorCoolingScale). Where a check below says "with the jar's pow", Math.pow
//    returns the jar's value for exactly these inputs.
// 3. The mod's AirframeGoldenTest (tools/fixtures/sim/airframe_golden.txt, unchanged copy of the mod's file): every
//    frame/motor/prop group of the built-in parts (every stack, video and battery, compatible or not) hashes like in
//    the mod with the jar's pow; without it exactly the groups of the 76/152 mm props differ. (The 24 analysis groups
//    hash BuildAnalysis, which analysis.js and tools/test-configurator.mjs cover; the driver reproduces all 202.)
// 4. Every field of AirframeSpec for the presets, accessory variants and drones of the drone editor (creative = the
//    flight build with its edited parts as the jar's web export data, the inertia override and the hash of the values),
//    bit for bit; without a hash the build key ends in a 16-digit hash of the flight parts.
// 5. Flights through flight.js in box worlds (arming, hover, flips, full throttle, crashes on the ground and into walls
//    without disarm, idle on the ground, prop contact, tipping over a ledge, crash disarm, ESC heat on the bench): the
//    state of every frame (position, velocity, attitude, motors, currents, temperatures, limits, prop contact, contact
//    authority, counters, events) hashed like the driver, compared once a second, bit for bit.
// Exit code 0 only if every check passes.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCatalog } from '../assets/js/configurator/data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The modules of the simulator import each other with ?v= stamps (tools/stamp-assets.mjs); a module imported without
// its stamp would be a second copy with its own enum constants (StabMode.ANGLE !== StabMode.ANGLE). So everything is
// imported under the specifier flight.js and the model use.
function stamped(file, name) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const m = source.match(new RegExp(`from '(\\.[^']*/${name}\\.js(?:\\?v=[0-9a-f]+)?)'`));
  if (!m) throw new Error(`${file} does not import ${name}`);
  return import(new URL(m[1], pathToFileURL(path.join(ROOT, file))).href);
}
const { Flight } = await import('../assets/js/sim/flight.js');
const { DroneSim } = await stamped('assets/js/sim/flight.js', 'DroneSim');
const { StabMode } = await stamped('assets/js/sim/flight.js', 'StabMode');
const { AirframeSpec } = await stamped('assets/js/sim/model/DroneSim.js', 'AirframeSpec');
const { FlightController } = await stamped('assets/js/sim/model/DroneSim.js', 'FlightController');
const { FlightControllerConfig } = await stamped('assets/js/sim/model/DroneSim.js', 'FlightControllerConfig');
const { SimTuning } = await stamped('assets/js/sim/model/DroneSim.js', 'SimTuning');
const QUIET = process.argv.includes('--quiet');
const VECTORS_ARG = process.argv.indexOf('--vectors');
const VECTORS = JSON.parse(fs.readFileSync(VECTORS_ARG >= 0 ? process.argv[VECTORS_ARG + 1]
  : path.join(ROOT, 'tools/fixtures/sim/sim-vectors.json'), 'utf8'));
const GOLDEN = fs.readFileSync(path.join(ROOT, 'tools/fixtures/sim/airframe_golden.txt'), 'utf8');
const CATALOG_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/data/configurator/catalog.json'), 'utf8'));

let checks = 0;
const failures = [];
function check(ok, message) {
  checks++;
  if (!ok) failures.push(message);
  return ok;
}
const log = (...a) => {
  if (!QUIET) console.log(...a);
};

// ---------------------------------------------------------------------------------------------------------------
// Bits

const view = new DataView(new ArrayBuffer(8));
/** Long.toHexString(Double.doubleToRawLongBits(v)) */
function hex(v) {
  view.setFloat64(0, v);
  return view.getBigUint64(0).toString(16);
}
function fromHex(h) {
  view.setBigUint64(0, BigInt(`0x${h}`));
  return view.getFloat64(0);
}
/** Distance in units in the last place of two doubles of the same sign. */
function ulps(a, b) {
  view.setFloat64(0, a);
  const x = view.getBigInt64(0);
  view.setFloat64(0, b);
  const y = view.getBigInt64(0);
  const d = x - y;
  return d < 0n ? -d : d;
}

// ---------------------------------------------------------------------------------------------------------------
// 1. Constants

const JS_CONSTANTS = {
  'FlightController.KNOCKED_UP': FlightController.KNOCKED_UP,
  'FlightController.LYING_UP': FlightController.LYING_UP,
  'DroneSim.STICKY_STEP': DroneSim.STICKY_STEP,
  'DroneSim.PROP_CONTACT_ON': DroneSim.PROP_CONTACT_ON,
  'DroneSim.PROP_CONTACT_OFF': DroneSim.PROP_CONTACT_OFF,
};
for (const [name, bits] of Object.entries(VECTORS.constants)) {
  check(hex(JS_CONSTANTS[name]) === bits, `constant ${name}: ${hex(JS_CONSTANTS[name])} instead of ${bits}`);
}

// ---------------------------------------------------------------------------------------------------------------
// 2. pow

const REAL_POW = Math.pow;
const JAR_POW = new Map();
const powDiffers = [];
for (const [x, y, r] of VECTORS.pow) {
  const a = fromHex(x);
  const b = fromHex(y);
  JAR_POW.set(`${x}/${y}`, fromHex(r));
  const js = REAL_POW(a, b);
  if (hex(js) !== r) powDiffers.push({ x: a, y: b, js, jar: fromHex(r), ulps: ulps(js, fromHex(r)) });
}
// The known exceptions of the port, one ulp each. Anything else is a new deviation.
const KNOWN_POW = new Set(['0.076/5', '0.2727272727272727/0.6666666666666666', '1.4242424242424243/0.6666666666666666']);
for (const d of powDiffers) {
  check(KNOWN_POW.has(`${d.x}/${d.y}`) && d.ulps === 1n,
    `Math.pow(${d.x}, ${d.y}) = ${d.js} differs from StrictMath.pow = ${d.jar} by ${d.ulps} ulp (not the known exception)`);
}
check(powDiffers.length === KNOWN_POW.size, `Math.pow differs from StrictMath.pow for ${powDiffers.length} inputs, expected ${KNOWN_POW.size}`);
log(`pow: ${VECTORS.pow.length} inputs, JS differs for ${powDiffers.map((d) => `${d.x}^${d.y} (${d.ulps} ulp)`).join(', ')}`);

/** Runs fn with Math.pow returning the jar's StrictMath.pow for the inputs of the table. */
function withJarPow(fn) {
  Math.pow = (x, y) => {
    const v = JAR_POW.get(`${hex(x)}/${hex(y)}`);
    return v !== undefined ? v : REAL_POW(x, y);
  };
  try {
    return fn();
  } finally {
    Math.pow = REAL_POW;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 3. AirframeGoldenTest

const GOLDEN_FIELDS = ['buildKey', 'buildable', 'massKg', 'armLength', 'motorOffset', 'propDiameter', 'propRadius', 'discArea',
  'propPitch', 'ducted', 'comHeight', 'rotorPlaneOffset', 'inertiaXx', 'inertiaYy', 'inertiaZz', 'kv', 'kt', 'motorResistance',
  'escResistance', 'phaseResistance', 'idleCurrent', 'escCurrentLimit', 'escInputLimit', 'rotorInertia', 'rotorInertiaEff',
  'omegaMax', 'hoverOmega', 'motorTauPhys', 'motorTau', 'kThrust', 'kTorque', 'ductGain', 'zeroThrustPerOmega',
  'translationalLiftGain', 'hoverInducedVelocity', 'washNoiseHz', 'cells', 'capacityMah', 'chemistry', 'packResistance',
  'polarizationResistance', 'continuousCurrent', 'fullPackVoltage', 'auxPower', 'accessoryPower', 'accessoryMassKg',
  'brownoutVoltage', 'areaX', 'areaY', 'areaZ', 'dragCoefficient', 'rotationalDamping', 'impactTolerance', 'restitution',
  'friction', 'hitboxWidth', 'hitboxHeight', 'hitboxFootOffset', 'authorityRoll', 'authorityPitch', 'authorityYawSteady',
  'authorityYawInstant', 'hoverVoltage', 'lensRight', 'lensUp', 'lensForward', 'washLoss', 'washNoise', 'motorMassKg',
  'stackMassKg', 'motorX', 'motorY', 'motorZ', 'spin', 'hullX', 'hullY', 'hullZ'];
// Java field types from the dumps of the driver: a number is a Java int, a string a double (its bits).
const JAVA_TYPES = VECTORS.airframes[0].expected.fields;
const keyOf = (id) => (id.startsWith('propwash:') ? id.slice('propwash:'.length) : id);
/** The JS value of a Java field of AirframeSpec (private arrays and counters are stored as _name, see AirframeSpec.js). */
const jsField = (spec, name) => (Object.prototype.hasOwnProperty.call(spec, name) ? spec[name] : spec[`_${name}`]);

function goldenDump(spec) {
  let out = '';
  for (const name of GOLDEN_FIELDS) {
    const v = jsField(spec, name);
    out += `${name}=`;
    if (name === 'chemistry') out += VECTORS.builtins.chemistry[v.id];
    else if (name === 'spin') out += `[${Array.from(v).join(', ')}]`;
    else if (typeof v === 'object' && v.length !== undefined) out += Array.from(v, (d) => `${hex(d)},`).join('');
    else if (typeof v === 'number' && typeof JAVA_TYPES[name] === 'string') out += hex(v);
    else out += String(v);
    out += ';';
  }
  return `${out}\n`;
}
const sha24 = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 24);

function goldenGroups() {
  const catalog = createCatalog(CATALOG_JSON);
  const b = VECTORS.builtins;
  const out = new Map();
  for (const frame of b.frame) {
    for (const motor of b.motor) {
      for (const prop of b.prop) {
        let dump = '';
        for (const stack of b.stack) {
          for (const video of b.video) {
            for (const battery of b.battery) {
              dump += goldenDump(AirframeSpec.fromBuild({ frame, stack, motor, prop, video, battery, accessories: {} }, catalog));
            }
          }
        }
        out.set(`${keyOf(frame)}/${keyOf(motor)}/${keyOf(prop)}`, { hash: sha24(dump), prop });
      }
    }
  }
  return out;
}

const expectedGolden = new Map(GOLDEN.split('\n').filter((l) => l.trim()).map((l) => l.trim().split(/\s+/)));
const plainGroups = goldenGroups();
const jarGroups = withJarPow(goldenGroups);
const POW_PROPS = new Set(VECTORS.builtins.prop.filter((id) => {
  const part = createCatalog(CATALOG_JSON).part(id);
  return powDiffers.some((d) => d.x === part.data.diameter_mm / 1000.0);
}));
/** True if JS Math.pow differs from the jar for an input of this build (prop diameter, motor size factor). */
function usesPowInput(build) {
  const catalog = createCatalog(CATALOG_JSON);
  const prop = catalog.part(build.prop);
  const motor = catalog.part(build.motor);
  return powDiffers.some((d) => d.x === prop.data.diameter_mm / 1000.0 || d.x === motor.basics.mass_g / 33.0);
}
let goldenMatched = 0;
let goldenPlain = 0;
const plainDiffer = [];
for (const [key, { hash, prop }] of jarGroups) {
  const expected = expectedGolden.get(key);
  check(expected != null, `golden: group ${key} missing in airframe_golden.txt`);
  if (check(hash === expected, `golden: group ${key} hashes to ${hash} instead of ${expected} (with the jar's pow)`)) goldenMatched++;
  const plain = plainGroups.get(key).hash;
  if (plain === expected) goldenPlain++;
  else plainDiffer.push(key);
  check(plain === expected || POW_PROPS.has(prop), `golden: group ${key} differs with JS Math.pow though its prop is not 76/152 mm`);
}
const airframeGroups = [...expectedGolden.keys()].filter((k) => !k.startsWith('analysis:'));
check(jarGroups.size === airframeGroups.length, `golden: ${jarGroups.size} groups computed, the file has ${airframeGroups.length}`);
log(`golden: ${goldenMatched}/${airframeGroups.length} airframe groups bit-identical with the jar's pow, ${goldenPlain} with JS Math.pow `
  + `(${plainDiffer.length} groups of the props ${[...POW_PROPS].map(keyOf).join(', ')} differ in kTorque and what follows from it)`);

// ---------------------------------------------------------------------------------------------------------------
// 4. AirframeSpec fields

/** A catalog entry from the web export data of an edited part (catalog-build.js catalogPart), names from the base part. */
function catalogEntry(exported, base) {
  const b = exported.basics;
  return {
    id: exported.id,
    category: exported.category,
    builtin: base ? base.builtin : true,
    name: base ? base.name : { en_us: exported.id },
    basics: { mass_g: b.mass_g, sort: b.sort, creative: b.creative, durability: b.durability, accent: b.accent },
    data: exported.data,
    derived: exported.derived,
  };
}

/** The `creative` argument of AirframeSpec.of/fromBuild for an edited drone of the vectors. */
function creativeOf(flight, catalog, { hash = true } = {}) {
  const parts = new Map(flight.parts.map((p) => [p.id, catalogEntry(p, catalog.part(p.id))]));
  // Same interface as the catalog: the edited parts of the flight build, everything else from the catalog.
  const flightCatalog = Object.assign(Object.create(catalog), { part: (id) => parts.get(id) || catalog.part(id) });
  return {
    build: flight.build,
    catalog: flightCatalog,
    inertia: flight.inertia ? flight.inertia.map(fromHex) : null,
    ...(hash ? { hash: flight.hash } : {}),
  };
}

function specOf(entry, catalog, options) {
  const creative = entry.expected.flight ? creativeOf(entry.expected.flight, catalog, options) : null;
  return AirframeSpec.fromBuild(entry.build, catalog, creative);
}

/** Compares every Java field; returns the differences as text. */
function compareFields(spec, fields) {
  const diffs = [];
  for (const [name, expected] of Object.entries(fields)) {
    const v = jsField(spec, name);
    if (v === undefined) {
      diffs.push(`${name} missing`);
      continue;
    }
    if (typeof expected === 'string' && /^[0-9a-f]+$/.test(expected) && typeof v === 'number') {
      if (hex(v) !== expected) diffs.push(`${name} ${v} instead of ${fromHex(expected)} (${ulps(v, fromHex(expected))} ulp)`);
    } else if (Array.isArray(expected)) {
      const got = Array.from(v);
      for (let i = 0; i < expected.length; i++) {
        const e = expected[i];
        const g = got[i];
        const same = typeof e === 'string' ? hex(g) === e : g === e;
        if (!same) diffs.push(`${name}[${i}] ${g} instead of ${typeof e === 'string' ? fromHex(e) : e}`);
      }
    } else if (name === 'chemistry') {
      if (v.id !== expected) diffs.push(`chemistry ${v.id} instead of ${expected}`);
    } else if (name === 'role') {
      if (String(v).toUpperCase() !== expected) diffs.push(`role ${v} instead of ${expected}`);
    } else if (v !== expected) {
      diffs.push(`${name} ${v} instead of ${expected}`);
    }
  }
  return diffs;
}

const usesPowProp = (entry) => usesPowInput(entry.build);
for (const entry of VECTORS.airframes) {
  const fields = entry.expected.fields;
  const diffs = withJarPow(() => compareFields(specOf(entry, createCatalog(CATALOG_JSON)), fields));
  check(diffs.length === 0, `airframe ${entry.name}: ${diffs.slice(0, 6).join('; ')}`);
  const plain = compareFields(specOf(entry, createCatalog(CATALOG_JSON)), fields);
  check(plain.length === 0 || usesPowProp(entry), `airframe ${entry.name} differs with JS Math.pow: ${plain.slice(0, 4).join('; ')}`);
  checks += Object.keys(fields).length - 1;
  if (entry.expected.flight) {
    const spec = specOf(entry, createCatalog(CATALOG_JSON), { hash: false });
    const key = fields.buildKey;
    const prefix = key.slice(0, key.lastIndexOf('/') + 1);
    check(spec.buildKey.startsWith(prefix) && /^[0-9a-f]{16}$/.test(spec.buildKey.slice(prefix.length)),
      `airframe ${entry.name}: build key without hash ${spec.buildKey}, expected ${prefix}<16 hex digits>`);
    const other = specOf({ ...entry, expected: { flight: { ...entry.expected.flight, inertia: null } } }, createCatalog(CATALOG_JSON),
      { hash: false });
    check(other.buildKey !== spec.buildKey || entry.expected.flight.inertia == null,
      `airframe ${entry.name}: the default hash does not see the inertia override`);
  }
}
log(`airframes: ${VECTORS.airframes.length} (${VECTORS.airframes.filter((a) => a.expected.flight).length} drones of the drone editor), every field`);

// ---------------------------------------------------------------------------------------------------------------
// 5. Flights

/** A box world for flight.js (the interface of world.js VoxelWorld): solid below row 0 and in the boxes. */
function boxWorld(w) {
  return {
    cell: w.cell,
    origin: w.origin,
    floorY: 0.0,
    solid(i, j, k) {
      if (j < 0) return true;
      for (const b of w.boxes) if (i >= b[0] && i <= b[3] && j >= b[1] && j <= b[4] && k >= b[2] && k <= b[5]) return true;
      return false;
    },
    cellOf(axis, v) {
      return Math.floor((v - this.origin[axis]) / this.cell);
    },
    groundDistance(x, y, z, range) {
      const i = this.cellOf(0, x);
      const k = this.cellOf(2, z);
      const top = this.cellOf(1, y);
      const end = this.cellOf(1, y - range);
      for (let j = top; j >= end; j--) {
        if (this.solid(i, j, k)) {
          const d = y - (this.origin[1] + (j + 1) * this.cell);
          return d <= range ? Math.max(0.0, d) : Infinity;
        }
      }
      return Infinity;
    },
  };
}

const STATE_NAMES = ['x', 'y', 'z', 'result.dx', 'result.dy', 'result.dz', 'result.qx', 'result.qy', 'result.qz', 'result.qw',
  'px', 'py', 'pz', 'vx', 'vy', 'vz', 'qw', 'qx', 'qy', 'qz', 'lx', 'ly', 'lz',
  ...[0, 1, 2, 3].flatMap((i) => ['omega', 'current', 'duty', 'propContact', 'motorTemp', 'escTemp', 'limit', 'torque'].map((n) => `${n}[${i}]`)),
  'busVoltage', 'soc', 'packSoc', 'fc.contactAuthority', 'fc.restS', 'fc.contactIdleS', 'fc.knocked', 'fc.contactHeld', 'armed',
  'grounded', 'sleeping', 'crashCount', 'impactCount', 'propStrikeCount', 'motorHot', 'escDerating', 'autoArmPending',
  'lastImpactSpeed', 'hoverThrottleStick', 'groundedFrames', 'edgeActive', 'pushOuts', 'substeps', 'events'];

/** SimVectors.state: the state of a frame. */
function stateOf(flight, events) {
  const s = flight.sim;
  const r = flight.result;
  const b = s.body;
  const pw = s.power;
  const th = s.thermal;
  const v = [flight.x, flight.y, flight.z, r.dx, r.dy, r.dz, r.orientation.x, r.orientation.y, r.orientation.z, r.orientation.w,
    b.px, b.py, b.pz, b.vx, b.vy, b.vz, b.qw, b.qx, b.qy, b.qz, b.lx, b.ly, b.lz].map(hex);
  for (let i = 0; i < 4; i++) {
    v.push(hex(pw.omega[i]), hex(pw.current[i]), hex(s.dutyCur[i]), hex(s.propContact[i]), hex(th.motorTemp[i]), hex(th.escTemp[i]),
      hex(th.limit[i]), hex(th.torque[i]));
  }
  v.push(hex(pw.busVoltage), hex(pw.soc), hex(pw.packSoc));
  const fc = s.fc;
  v.push(hex(fc.contactAuthority), hex(fc.restS), hex(fc.contactIdleS), String(fc.knocked), String(fc.contactHeld));
  const t = s.telemetry;
  v.push(String(t.armed), String(t.grounded), String(t.sleeping), String(t.crashCount), String(t.impactCount), String(t.propStrikeCount),
    String(t.motorHot), String(t.escDerating), String(t.autoArmPending), hex(t.lastImpactSpeed), hex(t.hoverThrottleStick),
    String(s.groundedFrames), String(s.edgeActive), String(s.pushOuts()), String(r.substeps),
    events.map((e) => `${e.type.name}@${hex(e.time)},${hex(e.value)},${e.motor}`).join(';'));
  return v;
}

function segmentValue(seg, key, hover) {
  if (!(key in seg)) return 0.0;
  const e = seg[key];
  return typeof e === 'object' ? hover + e.hover : e;
}

/** Flies a flight of the vectors; returns { ok, frames, firstDiff, maxUlps, summary }. */
function fly(f, entry, jarPow) {
  const run = () => {
    const catalog = createCatalog(CATALOG_JSON);
    const spec = specOf(entry, catalog);
    const tuning = new SimTuning();
    for (const [k, v] of Object.entries(f.tuning || {})) tuning[k] = v;
    const sim = new DroneSim(spec, new FlightControllerConfig(), tuning, f.seed);
    const flight = new Flight(sim, boxWorld(f.world));
    flight.wind = f.wind ? { ...f.wind } : false;
    if (f.ambient != null) flight.ambientTempC = f.ambient;
    flight.place(f.place[0], f.place[1], f.place[2], f.place[3]);
    if (f.poseLocked) sim.poseLocked = true;
    const frames = Math.round(f.seconds * f.fps);
    const hash = crypto.createHash('sha256');
    const checkpoints = f.expected.checkpoints;
    let next = 0;
    const out = { frames, matched: 0, firstDiff: null, maxUlps: 0n, field: null, final: null };
    const seen = { edge: 0, knocked: 0, minAuthority: 1.0, propContact: 0.0, crashes: 0, escDerate: 0, motorHot: 0 };
    for (let k = 0; k < frames; k++) {
      const t = k / f.fps;
      const seg = f.segments.find((s) => t < s.until) || f.segments[f.segments.length - 1];
      const hover = sim.telemetry.hoverThrottleStick;
      const input = flight.input;
      input.roll = segmentValue(seg, 'roll', hover);
      input.pitch = segmentValue(seg, 'pitch', hover);
      input.yaw = segmentValue(seg, 'yaw', hover);
      input.throttle = segmentValue(seg, 'throttle', hover);
      input.armSwitch = seg.arm === true;
      input.mode = seg.mode ? StabMode.valueOf(seg.mode) : StabMode.ACRO;
      const events = flight.frame(1.0 / f.fps);
      const state = stateOf(flight, events);
      if (sim.edgeActive) seen.edge++;
      if (sim.fc.knocked) seen.knocked++;
      seen.minAuthority = Math.min(seen.minAuthority, sim.fc.contactAuthority);
      seen.propContact = Math.max(seen.propContact, ...sim.propContact);
      for (const e of events) {
        if (e.type.name === 'CRASH') seen.crashes++;
        if (e.type.name === 'ESC_DERATE' && e.value > 0.5) seen.escDerate++;
        if (e.type.name === 'MOTOR_HOT' && e.value > 0.5) seen.motorHot++;
      }
      hash.update(`${state.join(',')}\n`, 'utf8');
      const cp = checkpoints[next];
      if (cp && cp.frame === k) {
        next++;
        const h = hash.copy().digest('hex').slice(0, 24);
        if (h === cp.hash) {
          out.matched++;
        } else if (out.firstDiff == null) {
          out.firstDiff = k;
          out.fields = [];
          for (let i = 0; i < state.length; i++) {
            if (state[i] === cp.state[i]) continue;
            out.fields.push(STATE_NAMES[i]);
            if (/^[0-9a-f]+$/.test(cp.state[i]) && /^[0-9a-f]+$/.test(state[i]) && i < STATE_NAMES.length - 1) {
              const u = ulps(fromHex(state[i]), fromHex(cp.state[i]));
              if (u > out.maxUlps) {
                out.maxUlps = u;
                out.field = `${STATE_NAMES[i]} ${fromHex(state[i])} vs ${fromHex(cp.state[i])}`;
              }
            } else if (out.field == null) {
              out.field = `${STATE_NAMES[i]} ${state[i].slice(0, 80)} vs ${cp.state[i].slice(0, 80)}`;
            }
          }
        }
      }
      if (k === frames - 1) {
        out.final = {
          armed: sim.telemetry.armed, crashes: sim.telemetry.crashCount, strikes: sim.telemetry.propStrikeCount,
          escMax: Math.max(...sim.thermal.escTemp), motorMax: Math.max(...sim.thermal.motorTemp), limit: Math.min(...sim.thermal.limit), seen,
        };
      }
    }
    out.checkpoints = checkpoints.length;
    return out;
  };
  return jarPow ? withJarPow(run) : run();
}

let flownFrames = 0;
for (const f of VECTORS.flights) {
  const entry = VECTORS.airframes.find((a) => a.name === f.airframe);
  const pow = usesPowProp(entry);
  const r = fly(f, entry, pow);
  flownFrames += r.frames;
  checks += r.checkpoints - 1;
  check(r.matched === r.checkpoints, `flight ${f.name}: ${r.matched}/${r.checkpoints} seconds bit-identical, first difference at frame `
    + `${r.firstDiff} (${r.field}; differing: ${(r.fields || []).join(' ')})`);
  let note = '';
  if (pow) {
    const plain = fly(f, entry, false);
    note = plain.firstDiff == null ? ', identical with JS Math.pow too'
      : `, with JS Math.pow from frame ${plain.firstDiff} (largest deviation ${plain.field})`;
  }
  const fin = r.final;
  const seen = fin.seen;
  log(`flight ${f.name}: ${r.matched}/${r.checkpoints} s bit-identical${pow ? ' with the jar\'s pow' : ''}${note}; `
    + `${seen.crashes} crashes, ${fin.strikes} prop strikes, prop contact up to ${seen.propContact.toFixed(2)}, knocked ${seen.knocked} `
    + `frames, contact authority down to ${seen.minAuthority.toFixed(2)}, edge ${seen.edge} frames, ESC derate ${seen.escDerate}, `
    + `motor hot ${seen.motorHot}, end ${fin.armed ? 'armed' : 'disarmed'} with ESC ${fin.escMax.toFixed(1)} °C (limit ${fin.limit.toFixed(2)}), `
    + `motor ${fin.motorMax.toFixed(1)} °C`);
}

// ---------------------------------------------------------------------------------------------------------------

if (failures.length) {
  for (const f of failures.slice(0, 40)) console.error(`FAIL ${f}`);
  if (failures.length > 40) console.error(`… and ${failures.length - 40} more`);
  console.error(`FAIL: ${failures.length} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`PASS: ${checks} checks – flight model against the classes of ${VECTORS.source.jar} (golden ${goldenMatched} groups, `
  + `${VECTORS.airframes.length} airframes, ${VECTORS.flights.length} flights with ${flownFrames} frames)`);
