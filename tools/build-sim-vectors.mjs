#!/usr/bin/env node
// Writes the test vectors of the flight model (tools/fixtures/sim/sim-vectors.json) for tools/test-sim-model.mjs, computed
// with the compiled classes of a Propwash release by the Java driver tools/sim-java/ (see SimVectors.java there):
//
//   node tools/build-sim-vectors.mjs [--jar <propwash-fabric-….jar>] [--propwash <Propwash checkout>] [--java <JDK bin>]
//                                    [--every <frames>] [--out <file>]
//
// --jar defaults to PROPWASH_JAR or ../propwash/release/0.6.0/propwash-fpv/propwash-fabric-26.3-0.6.0.jar next to this
// repository (its SHA-256 must match the SHA256SUMS next to it); --propwash (PROPWASH_SRC, default ../propwash) is where
// the mod's golden file common/src/test/resources/de/lardtom/propwash/sim/airframe_golden.txt is copied from, unchanged,
// to tools/fixtures/sim/; --java (JAVA_BIN) the bin folder of a JDK 25 (default /opt/homebrew/opt/openjdk@25/bin, else
// java on the PATH). joml, gson, jspecify and slf4j-api come from the Gradle cache (~/.gradle/caches/modules-2).
// --every n writes the full state every n frames instead of once a second and --out another file: for hunting down a
// difference frame by frame (node tools/test-sim-model.mjs --vectors <file>), not for the repository.
//
// Nothing of Minecraft runs: the jar's classes are unpacked into a fresh temporary folder, the driver is compiled there
// with two small stand-ins for Minecraft value types (tools/sim-java/stub: Identifier and Rarity, which the built-in
// parts need to load), and the temporary folder is deleted afterwards. The vectors say which jar they came from.
//
// What the driver computes is described by SPEC below (the same file tells the test what to recompute): AirframeSpec
// of the presets, accessory variants and creative drones (all fields), and flights in box worlds: arming, hover, flips,
// full throttle, crashes on the ground and into walls without disarm, lying at idle, recovering, tipping over a ledge
// on accessory stands, a crash with crash disarm, and ESC heat at full throttle on the bench.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'tools/fixtures/sim');
const OUT = path.join(OUT_DIR, 'sim-vectors.json');
const JAVA_SRC = path.join(ROOT, 'tools/sim-java');
const GOLDEN = 'common/src/test/resources/de/lardtom/propwash/sim/airframe_golden.txt';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

// ---------------------------------------------------------------------------------------------------------------
// The spec: airframes and flights

const P = (path) => `propwash:${path}`;
const preset = (frame, stack, motor, prop, video, battery, accessories = {}) => ({
  frame: P(frame), stack: P(stack), motor: P(motor), prop: P(prop), video: P(video), battery: P(battery), accessories,
});
const WHOOP = preset('whoop_65', 'aio_whoop', 'm0802_22000', 'p31_4b', 'analog_nano', 'b1s_300_hv');
const CINEWHOOP = preset('cinewhoop_3', 'aio_20', 'm1404_4600', 'p3_3b', 'digital_lite', 'b4s_650');
const FREESTYLE = preset('freestyle_5', 'stack_30', 'm2207_1750', 'p51_3b', 'digital_hd', 'b6s_1300');
const RACER = preset('race_5', 'stack_30', 'm2306_1860', 'p51_29_3b', 'analog_race', 'b6s_1100');
const LONG_RANGE = preset('long_range_7', 'stack_30', 'm2807_1300', 'p7_2b', 'digital_hd', 'b6s_4000_lion');
const withAcc = (build, accessories) => ({ ...build, accessories });

export const AIRFRAMES = [
  { name: 'whoop', build: WHOOP },
  { name: 'cinewhoop', build: CINEWHOOP },
  { name: 'freestyle', build: FREESTYLE },
  { name: 'racer', build: RACER },
  { name: 'long_range', build: LONG_RANGE },
  { name: 'whoop+led', build: withAcc(WHOOP, { bottom: P('led_strip') }) },
  { name: 'freestyle+heavy', build: withAcc(FREESTYLE, { top: P('action_cam_heavy') }) },
  { name: 'freestyle+led', build: withAcc(FREESTYLE, { bottom: P('led_strip') }) },
  { name: 'freestyle+light+led', build: withAcc(FREESTYLE, { top: P('action_cam_light'), bottom: P('led_strip') }) },
  { name: 'racer+gripper', build: withAcc(RACER, { bottom: P('gripper') }) },
  { name: 'long_range+led', build: withAcc(LONG_RANGE, { bottom: P('led_strip') }) },
  { name: 'cinewhoop+led', build: withAcc(CINEWHOOP, { bottom: P('led_strip') }) },
  // Drones of the drone editor (creative flight controller): ParamDerivation.compute(source, flight, inertia).
  {
    name: 'creative:freestyle',
    build: { ...FREESTYLE, stack: P('creative_fc') },
    creative: { base: { stack: P('stack_30') }, values: { 'motor.kv': 2100, 'frame.mass_g': 140, 'prop.ct': 0.12, 'inertia.roll': 12000 } },
  },
  {
    name: 'creative:whoop',
    build: { ...WHOOP, stack: P('creative_fc') },
    creative: {
      values: { 'battery.cells': 2, 'frame.wheelbase_mm': 75, 'motor.mass_g': 2.5, 'inertia.roll': 400, 'inertia.pitch': 450, 'inertia.yaw': 700 },
    },
  },
  {
    name: 'creative:racer',
    build: withAcc({ ...RACER, stack: P('creative_fc') }, { bottom: P('led_strip') }),
    creative: {
      base: { stack: P('stack_30') },
      values: {
        'arm.front_left.forward': 90, 'arm.front_left.right': -110, 'arm.front_right.forward': 90, 'arm.front_right.right': 110,
        'arm.rear_left.forward': -80, 'arm.rear_left.right': -100, 'arm.rear_right.forward': -80, 'arm.rear_right.right': 100,
        'frame.ducts': 1, 'stack.esc_current_a': 25, 'battery.capacity_mah': 1500, 'inertia.yaw': 30000,
      },
    },
  },
];

// Worlds: solid below y = 0 (cell row j < 0) and boxes of cells [i0, j0, k0, i1, j1, k1] (inclusive), cells of 0.5 m.
const FLAT = { cell: 0.5, origin: [0.0, 0.0, 0.0], boxes: [] };
const WALLS = { cell: 0.5, origin: [0.0, 0.0, 0.0], boxes: [[-40, 0, 8, 40, 11, 9], [-40, 0, -10, 40, 11, -9], [8, 0, -40, 9, 11, 40], [-10, 0, -40, -9, 11, 40]] };
const LEDGE = { cell: 0.5, origin: [0.0, 0.0, 0.0], boxes: [[-8, 0, -8, -1, 1, 8]] };

const hover = (d) => ({ hover: d });
// Acro: arm, take off, flips on roll and pitch, yaw spin, full throttle, dive into the ground at zero throttle (a crash
// that does not disarm), lie there at idle, take off again, land, disarm.
const ACRO = [
  { until: 0.3, throttle: 0 },
  { until: 0.8, arm: true, throttle: 0 },
  { until: 1.8, arm: true, throttle: hover(0.15) },
  { until: 2.8, arm: true, throttle: hover(0.02) },
  { until: 3.15, arm: true, throttle: hover(0.05), roll: 1.0 },
  { until: 4.0, arm: true, throttle: hover(0.05) },
  { until: 4.4, arm: true, throttle: hover(0.05), pitch: 1.0 },
  { until: 5.2, arm: true, throttle: hover(0.02) },
  { until: 5.8, arm: true, throttle: hover(0.02), yaw: 0.8 },
  { until: 6.4, arm: true, throttle: 1.0 },
  { until: 7.6, arm: true, throttle: 0, pitch: -0.4 },
  { until: 9.4, arm: true, throttle: 0 },
  { until: 10.4, arm: true, throttle: hover(0.2) },
  { until: 11.4, arm: true, throttle: hover(-0.08) },
  { until: 12.0, throttle: 0 },
];
// Angle mode into the walls: take off, tilt forward and sideways at full lean, hit a wall, hang on it at idle, climb.
const WALL = [
  { until: 0.3, throttle: 0, mode: 'ANGLE' },
  { until: 0.6, arm: true, throttle: 0, mode: 'ANGLE' },
  { until: 1.6, arm: true, throttle: hover(0.12), mode: 'ANGLE' },
  { until: 4.6, arm: true, throttle: hover(0.08), pitch: 1.0, roll: 0.3, mode: 'ANGLE' },
  { until: 6.0, arm: true, throttle: 0, mode: 'ANGLE' },
  { until: 7.5, arm: true, throttle: hover(0.1), pitch: -0.5, mode: 'ANGLE' },
  { until: 8.0, throttle: 0, mode: 'ANGLE' },
];
// On the edge of a ledge: armed in the first frames, at idle the drone tips over the edge and falls, then takes off.
const EDGE = [
  { until: 0.007, throttle: 0 },
  { until: 2.5, arm: true, throttle: 0 },
  { until: 3.5, arm: true, throttle: hover(0.15), mode: 'ANGLE' },
  { until: 4.5, arm: true, throttle: hover(0.0), roll: -0.5, mode: 'ANGLE' },
  { until: 6.5, arm: true, throttle: hover(-0.06), mode: 'ANGLE' },
  { until: 7.0, throttle: 0 },
];
// On the bench (pose locked): full throttle until the ESCs derate and the motors run hot.
const BENCH = [
  { until: 0.3, throttle: 0 },
  { until: 0.6, arm: true, throttle: 0 },
  { until: 1000, arm: true, throttle: 1.0 },
];

const flight = (name, airframe, world, segments, seconds, extra = {}) => ({
  name, airframe, world, segments, seconds, fps: 144, every: 144, seed: 7, place: [0.0, 0.0, 0.0, 0.0],
  tuning: { crashDisarm: false }, ...extra,
});

export const FLIGHTS = [
  flight('whoop acro', 'whoop', FLAT, ACRO, 12),
  flight('cinewhoop acro', 'cinewhoop', FLAT, ACRO, 12),
  flight('freestyle acro, wind', 'freestyle', FLAT, ACRO, 12, { wind: { x: 3.0, y: 0.0, z: -1.5, gusts: 0.3 }, seed: 11 }),
  flight('racer walls', 'racer', WALLS, WALL, 8),
  flight('long range walls', 'long_range', WALLS, WALL, 8, { seed: 3 }),
  flight('freestyle heavy cam acro', 'freestyle+heavy', FLAT, ACRO, 12),
  flight('racer gripper ledge', 'racer+gripper', LEDGE, EDGE, 7, { place: [0.03, 1.0, 0.0, 0.0] }),
  flight('whoop ledge', 'whoop', LEDGE, EDGE, 7, { place: [0.01, 1.0, 0.0, 0.3] }),
  flight('freestyle crash disarm', 'freestyle', FLAT, ACRO, 12, { tuning: { crashDisarm: true } }),
  flight('creative freestyle acro', 'creative:freestyle', FLAT, ACRO, 12),
  flight('creative racer walls', 'creative:racer', WALLS, WALL, 8),
  flight('racer motor heat', 'racer', FLAT, BENCH, 45, { poseLocked: true, ambient: 45.0, tuning: { crashDisarm: false, infiniteBattery: true } }),
  flight('cinewhoop ESC heat', 'cinewhoop', FLAT, BENCH, 60, { poseLocked: true, ambient: 55.0, tuning: { crashDisarm: false, infiniteBattery: true } }),
];

// ---------------------------------------------------------------------------------------------------------------

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function newest(dir) {
  if (!fs.existsSync(dir)) return null;
  const versions = fs.readdirSync(dir).filter((v) => /^\d/.test(v))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  for (const version of versions.reverse()) {
    const base = path.join(dir, version);
    for (const hash of fs.readdirSync(base)) {
      for (const file of fs.readdirSync(path.join(base, hash))) {
        if (file.endsWith('.jar') && !file.includes('sources') && !file.includes('javadoc')) return path.join(base, hash, file);
      }
    }
  }
  return null;
}

function libraries() {
  const cache = path.join(os.homedir(), '.gradle/caches/modules-2/files-2.1');
  const libs = [['org.joml', 'joml'], ['com.google.code.gson', 'gson'], ['org.jspecify', 'jspecify'], ['org.slf4j', 'slf4j-api']]
    .map(([group, name]) => newest(path.join(cache, group, name)));
  if (libs.some((l) => l == null)) throw new Error(`missing libraries in ${cache} (joml, gson, jspecify, slf4j-api)`);
  return libs;
}

function javaBin() {
  const given = arg('--java', process.env.JAVA_BIN);
  if (given) return given;
  const brew = '/opt/homebrew/opt/openjdk@25/bin';
  return fs.existsSync(path.join(brew, 'java')) ? brew : '';
}

function javaFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...javaFiles(p));
    else if (entry.name.endsWith('.java')) out.push(p);
  }
  return out;
}

function main() {
  const propwash = path.resolve(arg('--propwash', process.env.PROPWASH_SRC || path.join(ROOT, '..', 'propwash')));
  const jar = path.resolve(arg('--jar', process.env.PROPWASH_JAR
    || path.join(propwash, 'release/0.6.0/propwash-fpv/propwash-fabric-26.3-0.6.0.jar')));
  const jarHash = sha256(jar);
  const sums = path.join(path.dirname(jar), 'SHA256SUMS');
  if (fs.existsSync(sums)) {
    const line = fs.readFileSync(sums, 'utf8').split('\n').find((l) => l.trim().endsWith(path.basename(jar)));
    if (!line || !line.startsWith(jarHash)) throw new Error(`${jar} does not match ${sums}`);
  }
  const golden = path.join(propwash, GOLDEN);
  if (!fs.existsSync(golden)) throw new Error(`no golden file at ${golden} (--propwash <checkout>)`);
  const bin = javaBin();
  const java = bin ? path.join(bin, 'java') : 'java';
  const javac = bin ? path.join(bin, 'javac') : 'javac';
  const libs = libraries();

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'propwash-sim-vectors-'));
  try {
    const classes = path.join(tmp, 'classes');
    const out = path.join(tmp, 'out');
    fs.mkdirSync(classes);
    fs.mkdirSync(out);
    execFileSync('unzip', ['-q', jar, 'de/lardtom/propwash/*', 'data/*', '-d', classes]);
    const cp = [out, classes, ...libs].join(path.delimiter);
    execFileSync(javac, ['-nowarn', '-d', out, '-cp', [classes, ...libs].join(path.delimiter),
      ...javaFiles(path.join(JAVA_SRC, 'stub')), ...javaFiles(path.join(JAVA_SRC, 'src'))], { stdio: 'inherit' });
    const every = arg('--every', null);
    const flights = every ? FLIGHTS.map((f) => ({ ...f, every: Number(every) })) : FLIGHTS;
    const specFile = path.join(tmp, 'spec.json');
    const resultFile = path.join(tmp, 'result.json');
    fs.writeFileSync(specFile, JSON.stringify({ airframes: AIRFRAMES, flights }));
    execFileSync(java, ['-cp', cp, 'de.lardtom.propwash.sim.SimVectors', specFile, resultFile, golden],
      { stdio: ['ignore', 'inherit', 'pipe'] });
    const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
    const version = spawnSync(java, ['-version'], { encoding: 'utf8' }).stderr;
    const g = result.golden;
    if (g.matched !== g.expected || g.computed !== g.expected) {
      throw new Error(`the jar's classes do not reproduce ${GOLDEN}: ${g.matched}/${g.expected} groups (${g.differ.join(', ')})`);
    }
    const target = path.resolve(arg('--out', OUT));
    if (target === OUT) {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.copyFileSync(golden, path.join(OUT_DIR, 'airframe_golden.txt'));
    }
    const vectors = {
      format: 1,
      source: {
        jar: path.basename(jar),
        sha256: jarHash,
        golden: GOLDEN,
        java: (String(version).match(/version "([^"]+)"/) || [])[1] || null,
        arch: process.arch,
      },
      constants: result.constants,
      pow: result.pow,
      builtins: result.builtins,
      golden: result.golden,
      airframes: AIRFRAMES.map((a, i) => ({ ...a, expected: result.airframes[i] })),
      flights: flights.map((f, i) => ({ ...f, expected: result.flights[i] })),
    };
    fs.writeFileSync(target, JSON.stringify(vectors) + '\n');
    const frames = result.flights.reduce((n, f) => n + f.frames, 0);
    console.log(`${path.relative(ROOT, target)}: ${AIRFRAMES.length} airframes, ${FLIGHTS.length} flights (${frames} frames), `
      + `golden ${g.matched}/${g.expected} with the classes of ${path.basename(jar)}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
