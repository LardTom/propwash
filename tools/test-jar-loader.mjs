#!/usr/bin/env node
// The add-on jar in the browser (website design 0.6.0, 3.5.4 and 6.2; share codes PW3, 6.5):
//   - the jar of Just More Parts (with and without Propwash beside it) gives the same parts.json, chemistries.json,
//     mounts.json and parts table as the web export of the game, part by part and field by field; the jar of
//     Propwash gives its own export just as well; from both come the very catalog entries, FPV layouts and viewer
//     model files the site has (byte for byte), and the hosted export of the directory is the same as well
//   - with the jar instead of the official Just More Parts, every PW3 vector of the export reads and writes the same
//   - the parts reader (partjson.js) fills every default like the mod, reads led_path (ledPathMm), refuses what the
//     mod refuses; Propwash's example add-on (devtest) reads without an error, with its LED path
//   - made-up jars: a zip bomb (declared and hidden), a too large texture, 20001 entries, a broken ZIP, a damaged
//     entry, a path with "..", an absolute path and a backslash, a jar over 64 MB, encryption, an unknown method, a
//     foreign mod without part files, a mod with parts only in Java, broken part files, parts in the namespace
//     propwash, HTML in a name: each gives a message instead of a crash, the rest loads
//   - headless Chrome, English and German, 390 and 1280 px: the add-on bar with “only local”, a jar through the file
//     input (parts in the pickers, no request leaves the page), the messages of a bad jar, switching Just More Parts
//     off and on, HTML in names stays text, a reload forgets the jar (nothing in localStorage, IndexedDB or cookies)
//
//   node tools/test-jar-loader.mjs [--jmp-jar <jar>] [--propwash-jar <jar>] [--export <web export>] [--propwash-repo <dir>]
//                                  [--no-browser] [--shots <dir>] [--chrome <path>]
//
// The jars and the export can also come from PROPWASH_JMP_JAR, PROPWASH_JAR, JMP_WEB_EXPORT and PROPWASH_REPO; the
// Propwash jar must be the build the export was made with. Without them only the made-up jars and the repository
// checks run.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readAddon, modMeta } from '../assets/js/configurator/addon-catalog.js';
import { openJar, JAR_LIMITS, safeName, pngSize } from '../assets/js/configurator/jar.js';
import { decodePart, bundledParts, parseStatorLabel } from '../assets/js/configurator/partjson.js';
import { composeCatalog, createCatalog } from '../assets/js/configurator/data.js';
import { ROOT, CHROME, serve, launch, cdp, sleep } from './headless-chrome.mjs';
import { entry } from '../assets/js/configurator/i18n.js';

const argv = process.argv.slice(2);
const arg = (name, env) => {
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1]) return path.resolve(argv[i + 1]);
  return env && process.env[env] ? path.resolve(process.env[env]) : null;
};
const JMP_JAR = arg('--jmp-jar', 'PROPWASH_JMP_JAR');
const PW_JAR = arg('--propwash-jar', 'PROPWASH_JAR');
const EXPORT = arg('--export', 'JMP_WEB_EXPORT');
const PW_REPO = arg('--propwash-repo', 'PROPWASH_REPO');
const SHOTS = arg('--shots');
const BROWSER = !argv.includes('--no-browser');

let checks = 0;
const failures = [];
const notes = [];
function check(ok, message) {
  checks++;
  if (!ok) failures.push(message);
  return !!ok;
}
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const catalog = readJson(path.join(ROOT, 'assets/data/configurator/catalog.json'));
const renderJson = readJson(path.join(ROOT, 'assets/data/configurator/render.json'));

/** First differences of two JSON values (=== on numbers, so 1.0 and 1 are the same). */
function diff(a, b, at = '', out = []) {
  if (out.length >= 8) return out;
  if (a === b) return out;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push(`${at}: ${a.length} vs ${b.length} entries`);
    else a.forEach((x, i) => diff(x, b[i], `${at}[${i}]`, out));
    return out;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(k in a)) out.push(`${at}.${k}: missing from the jar`);
      else if (!(k in b)) out.push(`${at}.${k}: not in the export`);
      else diff(a[k], b[k], `${at}.${k}`, out);
    }
    return out;
  }
  out.push(`${at}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  return out;
}

function sameParts(label, got, want) {
  check(got.length === want.length, `${label}: ${got.length} parts from the jar, ${want.length} in the export`);
  const byId = new Map(got.map((p) => [p.id, p]));
  let same = 0;
  for (const w of want) {
    const g = byId.get(w.id);
    if (!check(g, `${label}: ${w.id} missing from the jar`)) continue;
    const d = diff(g, w, w.id);
    if (check(!d.length, `${label}: ${d.join('; ')}`)) same++;
  }
  check(JSON.stringify(got.map((p) => p.id)) === JSON.stringify(want.map((p) => p.id)), `${label}: order of the parts as in the export`);
  return same;
}

// ---------------------------------------------------------------------------------------------------------------
// Made-up jars

const enc = (s) => (typeof s === 'string' ? Buffer.from(s, 'utf8') : Buffer.from(s));

/**
 * A ZIP file of entries {name, data, method (0 stored, 8 deflate), flags, size, crc, compressed (bytes to use)}. Fields
 * left out are filled in correctly; the others let a test lie in the headers.
 */
function zip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const data = enc(e.data ?? '');
    const method = e.method ?? 8;
    const packed = e.compressed ?? (method === 8 ? zlib.deflateRawSync(data) : data);
    const crc = e.crc ?? zlib.crc32(data);
    const size = e.size ?? data.length;
    const name = Buffer.from(e.name, 'utf8');
    const flags = e.flags ?? 0x0800;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, packed);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(flags, 8);
    c.writeUInt16LE(method, 10);
    c.writeUInt32LE(crc >>> 0, 16);
    c.writeUInt32LE(packed.length, 20);
    c.writeUInt32LE(size, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += 30 + name.length + packed.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, end]));
}

/** A real PNG of w × h pixels (one colour). */
function png(w, h, rgb = [200, 60, 40]) {
  const row = Buffer.alloc(1 + w * 4);
  for (let x = 0; x < w; x++) row.set([...rgb, 255], 1 + x * 4);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const NS = 'testaddon';
const fabric = (id = NS, extra = {}) => ({ name: 'fabric.mod.json', data: JSON.stringify({ schemaVersion: 1, id, version: '0.3.1', name: 'Test Add-on for Propwash', contact: { homepage: 'https://modrinth.com/mod/test-addon' }, depends: { propwash: '>=0.6.0-' }, ...extra }) });
const part = (kind, id, json, ns = NS) => ({ name: `data/${ns}/propwash_parts/${kind}/${id}.json`, data: JSON.stringify({ format: 1, ...json }) });
const FRAME = {
  mass_g: 3.4, wheelbase_mm: 65, max_prop_mm: 31, motor_mounts: ['propwash:m08'], stack_mounts: ['propwash:whoop_aio'],
  aero: { frontal_area_m2: 0.003, drag_coefficient: 1.1 }, battery_fit: { cells: [1, 1], max_mass_g: 10 }, visual: { accent: '#22aa44' },
};
const RING = { mass_g: 2.0, slot: 'bottom', size_mm: [30, 3, 30], leds: 12, led_path: [[10, -2, 0], [0, -2, 10], [-10, -2, 0], [0, -2, -10], [10, -2, 0]] };
const MODEL = (texture) => JSON.stringify({ textures: { tex: texture, particle: texture }, elements: [{ from: [6, 7, 6], to: [10, 8, 10], faces: Object.fromEntries(['down', 'up', 'north', 'south', 'west', 'east'].map((d) => [d, { uv: [0, 0, 4, 4], texture: '#tex' }])) }] });
function addonEntries({ frameName = 'Tiny Frame', frameNameDe = 'Winziger Rahmen', texture = png(16, 16) } = {}) {
  return [
    fabric(),
    part('frame', 'tiny_frame', FRAME),
    part('motor', 'fast_motor', { mass_g: 1.9, stator: '0702', kv: 31000, mount: 'propwash:m08', max_current_a: 4.2, resistance_ohm: 0.32, cells: [1, 1] }),
    part('prop', 'carbon_31', { mass_g: 0.4, diameter_mm: 31, pitch_in: 1.3, blades: 4, ct: 0.1, cp: 0.08, material: 'carbon' }),
    part('accessory', 'ring', RING),
    part('battery', 'b1s_ss', { mass_g: 7, cells: 1, capacity_mah: 300, cell_resistance_ohm: 0.04, c_rating: 40, chemistry: `${NS}:solid`, connector: 'BT2.0' }),
    part('chemistry', 'solid', { full_v: 4.4, nominal_v: 3.8, empty_v: 3.4, cutoff_v: 3.2, storage_v: 3.85, density_g_cm3: 2.1, ocv_shape: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1] }),
    { name: `data/${NS}/propwash_share/table.json`, data: JSON.stringify({ format: 1, namespace: NS, parts: { frame: [{ id: 'tiny_frame', since: '0.1.0' }], motor: [{ id: 'fast_motor', since: '0.1.0' }, { id: 'java_motor', since: '0.3.0' }] } }) },
    { name: `assets/${NS}/lang/en_us.json`, data: JSON.stringify({ [`part.${NS}.tiny_frame`]: frameName, [`${NS}.frame_short.tiny_frame`]: 'Tiny', [`${NS}.help.tiny_frame.summary`]: 'A tiny test frame', [`part.${NS}.ring`]: 'LED Ring', [`${NS}.chemistry.solid`]: 'Solid state' }) },
    { name: `assets/${NS}/lang/de_de.json`, data: JSON.stringify({ [`part.${NS}.tiny_frame`]: frameNameDe, [`part.${NS}.ring`]: 'LED-Ring' }) },
    { name: `assets/${NS}/items/tiny_frame.json`, data: JSON.stringify({ model: { type: 'minecraft:model', model: `${NS}:item/part/frame/tiny_frame` } }) },
    { name: `assets/${NS}/items/drone_render/frame/tiny_frame.json`, data: JSON.stringify({ model: { type: 'minecraft:model', model: `${NS}:item/part/frame/tiny_frame` } }) },
    { name: `assets/${NS}/models/item/part/frame/tiny_frame.json`, data: MODEL(`${NS}:item/part/frame/tiny_frame`) },
    { name: `assets/${NS}/textures/item/part/frame/tiny_frame.png`, data: texture, method: 0 },
    { name: 'de/test/Addon.class', data: Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 65]) },
  ];
}

function madeUpJars() {
  const jars = {};
  jars.good = zip(addonEntries());
  jars.html = zip(addonEntries({ frameName: '<img src=x onerror="window.__xss=1"><b>Bold</b>', frameNameDe: '<img src=x onerror="window.__xss=2"><b>Fett</b>' }));
  const bombText = ' '.repeat(1500000);
  jars.bomb = zip([fabric(), part('frame', 'tiny_frame', FRAME), { name: `data/${NS}/propwash_parts/motor/bomb.json`, data: bombText }]);
  const hidden = zlib.deflateRawSync(Buffer.alloc(3 * 1024 * 1024, 0x20));
  jars.hiddenBomb = zip([fabric(), part('frame', 'tiny_frame', FRAME), { name: `data/${NS}/propwash_parts/motor/hidden.json`, data: '{}', compressed: hidden, size: 40000, crc: 0 }]);
  jars.bigTexture = zip(addonEntries({ texture: png(2048, 2048) }));
  const many = [fabric(), part('frame', 'tiny_frame', FRAME)];
  for (let i = many.length; i < 20001; i++) many.push({ name: `assets/${NS}/filler/f${i}.txt`, data: '', method: 0 });
  jars.tooMany = zip(many);
  const good = jars.good;
  jars.truncated = good.slice(0, Math.floor(good.length * 0.6));
  jars.random = new Uint8Array(crypto.randomBytes(5000));
  const damaged = Buffer.from(good);
  const at = damaged.indexOf(Buffer.from(`data/${NS}/propwash_parts/frame/tiny_frame.json`)) + `data/${NS}/propwash_parts/frame/tiny_frame.json`.length + 3;
  damaged[at] ^= 0xff;
  jars.damaged = new Uint8Array(damaged);
  jars.paths = zip([...addonEntries(), { name: `data/${NS}/propwash_parts/frame/../../../evil.json`, data: '{}' }, { name: '/etc/evil.json', data: '{}' }, { name: 'data\\evil.json', data: '{}' }]);
  jars.encrypted = zip([fabric(), { ...part('frame', 'tiny_frame', FRAME), flags: 0x0801 }]);
  jars.method = zip([fabric(), { ...part('frame', 'tiny_frame', FRAME), method: 12, compressed: Buffer.from('BZh91AY&SY') }]);
  jars.foreign = zip([fabric('othermod'), { name: 'assets/othermod/lang/en_us.json', data: '{}' }, { name: 'de/other/Mod.class', data: 'x' }]);
  jars.javaOnly = zip([fabric(), { name: `data/${NS}/propwash_share/table.json`, data: JSON.stringify({ format: 1, namespace: NS, parts: { motor: [{ id: 'java_motor', since: '0.1.0' }] } }) }]);
  jars.notMod = zip([{ name: 'readme.txt', data: 'hello' }]);
  jars.brokenPart = zip([fabric(), part('frame', 'tiny_frame', { ...FRAME, wheelbase_mm: 5 }), { name: `data/${NS}/propwash_parts/motor/m.json`, data: '{"format": 1, "mass_g": ' }]);
  jars.reserved = zip([fabric(), part('frame', 'stolen', FRAME, 'propwash')]);
  jars.neoforge = zip([
    { name: 'META-INF/neoforge.mods.toml', data: `modLoader = "javafml"\n[[mods]]\nmodId = "${NS}"\nversion = "\${file.jarVersion}"\ndisplayName = "Test Add-on (NeoForge)"\n[[dependencies.${NS}]]\nmodId = "propwash"\nversionRange = "[0.6.0-alpha,)"\n` },
    { name: 'META-INF/MANIFEST.MF', data: 'Manifest-Version: 1.0\r\nImplementation-Version: 0.3.1-nf\r\n' },
    ...addonEntries().slice(1),
  ]);
  return jars;
}

const codes = (r) => (r.problems || []).map((p) => p.code);

function testMadeUp(jars) {
  const good = readAddon(jars.good, { base: catalog, fileName: 'good.jar' });
  if (check(good.ok, `made-up add-on: loads (${JSON.stringify(good.problems)})`)) {
    check(good.mod.id === NS && good.mod.version === '0.3.1' && good.mod.loader === 'fabric', `made-up add-on: metadata ${JSON.stringify(good.mod)}`);
    check(good.fragment.parts.length === 5, `made-up add-on: 5 parts (${good.fragment.parts.length})`);
    const exp = good.export[NS].parts;
    const frame = exp.find((p) => p.id === `${NS}:tiny_frame`);
    const s = 65 / (2 * Math.sqrt(2));
    check(frame && frame.data.arms.front_left.pos[0] === -s && frame.data.arms_explicit === false, 'made-up frame: true-X arms from the wheelbase');
    check(frame && frame.data.battery.on_top === false && frame.data.battery.plate_mm === -0.05 * 65 && frame.data.electronics_mm === 0.05 * 65, 'made-up frame: battery and electronics defaults');
    check(frame && frame.data.role === 'freestyle' && frame.data.camera.tilt_deg === 20 && frame.data.camera.tilt_min_deg === 0 && frame.data.camera.tilt_max_deg === 50, 'made-up frame: role, camera tilt and its range');
    check(frame && frame.data.mass_split.arms === 0.6 && frame.data.impact_tolerance === 8 && frame.derived.size_class_in === 1 && frame.derived.ducted === false, 'made-up frame: mass split, impact tolerance, size class');
    check(frame && frame.name.en_us === 'Tiny Frame' && frame.name.de_de === 'Winziger Rahmen' && frame.short_name.en_us === 'Tiny' && frame.help.en_us.summary === 'A tiny test frame', 'made-up frame: names and help from the language files');
    check(frame && frame.basics.accent === '#22aa44' && frame.paint.default_colors.frame === '#22aa44' && frame.model.kind === 'model', 'made-up frame: accent, paint and model');
    const motor = exp.find((p) => p.id === `${NS}:fast_motor`);
    check(motor && motor.data.stator_mm[0] === 7 && motor.data.stator_mm[1] === 2 && motor.data.thermal.derate_start_c === 130 && motor.data.prop_mount === 'propwash:universal', 'made-up motor: stator size from the label, thermal and prop mount defaults');
    const prop = exp.find((p) => p.id === `${NS}:carbon_31`);
    check(prop && prop.basics.durability === 1.4 && prop.data.stiffness === 2.2, 'made-up prop: durability and stiffness of the material');
    const ring = exp.find((p) => p.id === `${NS}:ring`);
    check(ring && JSON.stringify(ring.data.led_path) === JSON.stringify(RING.led_path) && ring.data.leds === 12, `made-up accessory: led_path read (${ring && JSON.stringify(ring.data.led_path)})`);
    const battery = exp.find((p) => p.id === `${NS}:b1s_ss`);
    check(battery && Math.abs(battery.derived.energy_wh - 1.14) < 1e-12 && battery.data.connector === 'BT2.0', `made-up battery: energy from its own chemistry (${battery && battery.derived.energy_wh})`);
    check(good.fragment.chemistries.some((c) => c.id === `${NS}:solid` && c.name.en_us === 'Solid state' && c.usable_fraction === 0.85), 'made-up chemistry: name and usable fraction');
    check(good.models.has(`${NS}:tiny_frame`) && good.models.get(`${NS}:tiny_frame`).tex[0].startsWith('data:image/png;base64,'), 'made-up frame: viewer model with its texture');
    check(codes(good).includes('addon.java_parts') && good.problems.find((p) => p.code === 'addon.java_parts').args.first === `${NS}:java_motor`, 'made-up add-on: a table entry without a file is named as Java-only');
    check(good.fragment.namespaces[0].short_id === null && good.fragment.namespaces[0].table_entries === 3 && good.fragment.namespaces[0].homepage === 'https://modrinth.com/mod/test-addon', 'made-up add-on: namespace info');
    const json = composeCatalog(catalog, { fragments: [good.fragment] });
    const c = createCatalog(json);
    check(c.part(`${NS}:tiny_frame`) && c.partsIn('frame').length === catalog.parts.filter((p) => p.category === 'frame').length + 1, 'made-up add-on: in the composed catalog');
    const build = { ...c.presetBuild('propwash:whoop'), frame: `${NS}:tiny_frame` };
    let code = null;
    try {
      code = c.encode({ build, paint: null, tune: null, osd: null, name: null });
    } catch (e) {
      code = String(e.message);
    }
    check(typeof code === 'string' && code.startsWith('PW3-'), `made-up add-on: a build with its frame gets a PW3 code (${code})`);
    const back = code && code.startsWith('PW3-') ? c.decode(code) : null;
    check(back && back.ok && back.content.build.frame === `${NS}:tiny_frame`, 'made-up add-on: the code reads back with its frame');
    const plain = createCatalog(catalog).decode(code);
    check(plain.ok && (plain.namespaces || []).some((n) => n.namespace === NS && n.result === 'MISSING'), 'made-up add-on: without the jar the code names the missing add-on');
  }
  const html = readAddon(jars.html, { base: catalog });
  check(html.ok && html.fragment.parts.find((p) => p.id === `${NS}:tiny_frame`).name.en_us.startsWith('<img'), 'HTML in a name stays the plain string');
  const nf = readAddon(jars.neoforge, { base: catalog });
  check(nf.ok && nf.mod.loader === 'neoforge' && nf.mod.version === '0.3.1-nf' && nf.mod.requires.propwash === '[0.6.0-alpha,)', `NeoForge metadata with the version from the manifest (${JSON.stringify(nf.mod)})`);

  const expect = (name, label, code, { ok = false, level = null } = {}) => {
    let r;
    try {
      r = readAddon(jars[name], { base: catalog, fileName: `${name}.jar` });
    } catch (e) {
      check(false, `${label}: throws ${e.message}`);
      return null;
    }
    const p = r.problems.find((x) => x.code === code);
    check(r.ok === ok && p && (!level || p.level === level), `${label}: ${code}${ok ? ' (the rest loads)' : ''} – got ok=${r.ok}, ${JSON.stringify(r.problems.map((x) => x.code))}`);
    check(p && entry(`addons.problems.${code}`), `${label}: a sentence for ${code} in i18n.js`);
    return r;
  };
  expect('bomb', 'zip bomb (ratio in the header)', 'jar.ratio');
  expect('hiddenBomb', 'zip bomb (hidden behind a small size)', 'jar.ratio');
  const big = expect('bigTexture', 'texture of 2048 px', 'jar.texture_too_big', { ok: true, level: 'warning' });
  check(big && !big.models.has(`${NS}:tiny_frame`) && big.fragment.parts.length === 5, 'texture of 2048 px: the part comes without its model');
  expect('tooMany', '20001 entries', 'jar.too_many_entries');
  check(['jar.not_zip', 'jar.broken'].includes(codes(readAddon(jars.truncated))[0]), `truncated ZIP: ${codes(readAddon(jars.truncated))}`);
  check(codes(readAddon(jars.random))[0] === 'jar.not_zip', 'random bytes: jar.not_zip');
  expect('damaged', 'damaged entry (CRC)', 'jar.corrupt');
  const paths = expect('paths', 'paths with "..", "/" and "\\"', 'jar.unsafe_paths', { ok: true, level: 'warning' });
  check(paths && paths.problems.find((p) => p.code === 'jar.unsafe_paths').args.count === 3, 'paths: three entries skipped');
  expect('encrypted', 'encrypted entry', 'jar.encrypted');
  expect('method', 'unknown compression method', 'jar.method');
  expect('foreign', 'foreign mod without part files', 'addon.no_parts');
  expect('javaOnly', 'parts only in Java', 'addon.no_parts');
  expect('notMod', 'ZIP without mod metadata', 'addon.not_a_mod');
  const broken = expect('brokenPart', 'broken part files', 'addon.part_errors');
  check(broken && broken.problems[0].args.count >= 2, 'broken part files: every error counted');
  expect('reserved', 'parts in the namespace propwash', 'addon.part_errors');
  const huge = readAddon(new Uint8Array(JAR_LIMITS.jarBytes + 1), {});
  check(!huge.ok && codes(huge)[0] === 'jar.too_big', 'a file over 64 MB: jar.too_big');

  check(!safeName('a/../b') && !safeName('/a') && !safeName('a\\b') && !safeName('C:/a') && safeName('data/x/y.json'), 'safe names');
  check(JSON.stringify(pngSize(png(3, 5))) === '{"width":3,"height":5}' && pngSize(new Uint8Array(30)) === null, 'PNG size from the header');
  check(JSON.stringify(parseStatorLabel('1404')) === '[14,4]' && JSON.stringify(parseStatorLabel('xx')) === '[22,7]' && JSON.stringify(parseStatorLabel('12025')) === '[12,25]', 'stator labels');
  const bad = (kind, json, what) => {
    const r = decodePart(kind, `${NS}:x`, JSON.stringify({ format: 1, ...json }));
    check(r.definition === null && r.errors.length, `partjson refuses ${what} (${r.errors[0] || 'no error'})`);
  };
  bad('frame', { ...FRAME, wheelbase_mm: 10 }, 'a wheelbase of 10 mm');
  bad('frame', { ...FRAME, mass_g: undefined }, 'a frame without mass');
  bad('frame', { ...FRAME, props_mm: [20, 31] }, 'props_mm and max_prop_mm together');
  bad('accessory', { ...RING, led_path: [[0, 0, 0]] }, 'an LED path of one point');
  bad('accessory', { ...RING, leds: 0 }, 'an LED path without LEDs');
  bad('accessory', { ...RING, led_path: [[1, 1, 1], [1, 1, 1]] }, 'an LED path of length 0');
  bad('accessory', { ...RING, led_path: [[0, 0, 0], [600, 0, 0]] }, 'an LED point outside ±500 mm');
  bad('motor', { mass_g: 2, stator: '0702', kv: 20, mount: 'propwash:m08', max_current_a: 3, resistance_ohm: 0.2, cells: [1, 1] }, 'a KV of 20');
  bad('prop', { mass_g: 1, diameter_mm: 31, pitch_in: 1, blades: 9, ct: 0.1, cp: 0.08 }, 'nine blades');
  bad('video', { mass_g: 3, link: 'laser', latency_ms: 10, range_blocks: 200, image_quality: 0.5 }, 'an unknown video link');
  bad('battery', { mass_g: 7, cells: 13, capacity_mah: 300, cell_resistance_ohm: 0.04, c_rating: 40 }, '13 cells');
  bad('stack', { mass_g: 3, mount: 'propwash:s20', esc_continuous_a: 30, esc_burst_a: 20, cells: [3, 6] }, 'a burst current below the continuous current');
  const warn = decodePart('accessory', `${NS}:x`, JSON.stringify({ format: 1, ...RING, colour: 'red' }));
  check(warn.definition && warn.warnings.some((w) => w.includes('colour')), 'partjson: an unknown field is only a warning');
  const future = decodePart('accessory', `${NS}:x`, JSON.stringify({ ...RING, format: 2 }));
  check(future.definition === null && future.errors[0].includes('Format 2'), 'partjson: a newer format is refused');
  check(modMeta({ has: () => false }) === null, 'no metadata, no mod');
}

// ---------------------------------------------------------------------------------------------------------------
// The real jars against the export

function testRealJars() {
  const exp = (ns, file) => (EXPORT && fs.existsSync(path.join(EXPORT, ns, file)) ? readJson(path.join(EXPORT, ns, file)) : null);
  const jmp = JMP_JAR && fs.existsSync(JMP_JAR) ? new Uint8Array(fs.readFileSync(JMP_JAR)) : null;
  const pw = PW_JAR && fs.existsSync(PW_JAR) ? new Uint8Array(fs.readFileSync(PW_JAR)) : null;
  if (!jmp) notes.push('no jar of Just More Parts (--jmp-jar / PROPWASH_JMP_JAR): its checks are skipped');
  if (!pw) notes.push('no jar of Propwash (--propwash-jar / PROPWASH_JAR): its checks are skipped');
  if (!EXPORT) notes.push('no web export (--export / JMP_WEB_EXPORT): the jars are only held against the site\'s data');
  const summary = [];
  const nsInfo = (ns) => (catalog.namespaces || []).find((n) => n.namespace === ns);
  const siteData = (label, r, ns) => {
    const parts = r.fragment.parts;
    const own = catalog.parts.filter((p) => p.id.startsWith(`${ns}:`));
    let same = 0;
    for (const p of own) {
      const g = parts.find((x) => x.id === p.id);
      if (check(g && JSON.stringify(g) === JSON.stringify(p), `${label}: catalog entry of ${p.id} as in catalog.json${g ? ` (${diff(g, p, p.id).join('; ')})` : ''}`)) same++;
    }
    check(parts.length === own.length, `${label}: ${parts.length} catalog entries, catalog.json has ${own.length}`);
    let models = 0;
    for (const [id, model] of r.models) {
      const p = parts.find((x) => x.id === id);
      const file = path.join(ROOT, 'assets/data/configurator/models', ns, p.category, `${id.split(':')[1]}.json`);
      if (check(fs.existsSync(file) && fs.readFileSync(file, 'utf8') === `${JSON.stringify(model)}\n`, `${label}: model file of ${id} byte for byte as on the site`)) models++;
    }
    check(models === renderJson.models.filter((id) => id.startsWith(`${ns}:`)).length, `${label}: ${models} model files, render.json lists ${renderJson.models.filter((id) => id.startsWith(`${ns}:`)).length}`);
    check(JSON.stringify(r.fragment.fpv[ns]) === JSON.stringify(catalog.fpv.layouts[ns]), `${label}: FPV layouts as in catalog.json`);
    for (const [key, value] of Object.entries(r.render.layouts)) check(JSON.stringify(renderJson.layouts[key]) === JSON.stringify(value), `${label}: frame layout ${key} as in render.json`);
    for (const [key, value] of Object.entries(r.render.motor_seats)) check(renderJson.motor_seats[key] === value, `${label}: motor seat ${key} as in render.json`);
    const info = r.fragment.namespaces[0];
    const want = nsInfo(ns);
    check(want && ['name', 'version', 'short_id', 'table_source', 'table_entries', 'table_crc'].every((k) => info[k] === want[k]) && JSON.stringify(info.requires) === JSON.stringify(want.requires),
      `${label}: namespace info ${JSON.stringify(info)} as in catalog.json`);
    check(JSON.stringify(r.table) === JSON.stringify(catalog.sharecode.tables[ns]), `${label}: parts table as in catalog.json`);
    summary.push(`${label}: ${same}/${own.length} catalog entries, ${models} models byte-identical`);
  };
  const againstExport = (label, r, ns) => {
    const parts = exp(ns, 'parts.json');
    if (!parts) return;
    const same = sameParts(`${label} parts.json`, r.export[ns].parts, parts);
    const chem = diff(r.export[ns].chemistries, exp(ns, 'chemistries.json'), 'chemistries');
    check(!chem.length, `${label} chemistries.json: ${chem.join('; ')}`);
    const mounts = diff(r.export[ns].mounts, exp(ns, 'mounts.json'), 'mounts');
    check(!mounts.length, `${label} mounts.json: ${mounts.join('; ')}`);
    const table = exp(ns, 'share_table.json');
    check(!table || JSON.stringify(r.table) === JSON.stringify(table), `${label}: parts table as share_table.json`);
    const manifest = exp(ns, 'manifest.json');
    if (manifest) {
      check(manifest.mod.version === r.mod.version && manifest.short_id === r.fragment.namespaces[0].short_id && manifest.table_crc === r.fragment.namespaces[0].table_crc
        && manifest.table_entries === r.fragment.namespaces[0].table_entries && JSON.stringify(manifest.requires) === JSON.stringify(r.mod.requires), `${label}: manifest of the namespace`);
      for (const k of ['frame', 'stack', 'motor', 'prop', 'video', 'battery', 'accessory', 'chemistry']) {
        const n = k === 'chemistry' ? r.export[ns].chemistries.length : r.export[ns].parts.filter((p) => p.category === k).length;
        check(manifest.counts[k] === n, `${label}: ${n} ${k} (export ${manifest.counts[k]})`);
      }
    }
    summary.push(`${label}: ${same}/${parts.length} parts field for field like the export`);
  };
  if (pw) {
    const r = readAddon(pw, { builtin: true, fileName: path.basename(PW_JAR) });
    if (check(r.ok, `Propwash jar: reads (${JSON.stringify(r.problems)})`)) {
      check(!r.problems.some((p) => p.level !== 'info'), `Propwash jar: no warnings (${JSON.stringify(r.problems)})`);
      againstExport('Propwash jar', r, 'propwash');
      siteData('Propwash jar', r, 'propwash');
      const led = r.export.propwash.parts.find((p) => p.category === 'accessory' && p.data.led_path);
      check(led, 'Propwash jar: accessories carry led_path');
    }
    check(!readAddon(pw, { base: catalog }).ok && codes(readAddon(pw, { base: catalog }))[0] === 'addon.is_propwash', 'Propwash jar in the page: “this is Propwash itself”');
  }
  if (jmp) {
    const alone = readAddon(jmp, { base: catalog, fileName: path.basename(JMP_JAR) });
    if (check(alone.ok, `JMP jar: reads (${JSON.stringify(alone.problems)})`)) {
      check(alone.problems.every((p) => p.code === 'addon.replaces'), `JMP jar: only the note that it replaces the directory's version (${JSON.stringify(alone.problems.map((p) => p.code))})`);
      againstExport('JMP jar alone (browser)', alone, 'justmoreparts');
      siteData('JMP jar', alone, 'justmoreparts');
      testCodes(alone);
      testHosted(alone, fs.readFileSync(JMP_JAR));
      const neo = JMP_JAR.replace('-fabric-', '-neoforge-');
      if (neo !== JMP_JAR && fs.existsSync(neo)) {
        const n = readAddon(new Uint8Array(fs.readFileSync(neo)), { base: catalog, models: false });
        check(n.ok && n.mod.loader === 'neoforge' && n.mod.version === alone.mod.version && JSON.stringify(n.export.justmoreparts.parts) === JSON.stringify(alone.export.justmoreparts.parts),
          'JMP NeoForge jar: the same parts as the Fabric jar');
        summary.push('JMP NeoForge jar: same parts as Fabric');
      }
    }
    if (pw) {
      const both = readAddon(jmp, { extra: [pw], models: false });
      if (check(both.ok, 'JMP jar with the Propwash jar beside it: reads')) againstExport('JMP jar with Propwash (game)', both, 'justmoreparts');
    }
  }
  return summary;
}

/** With the jar in place of the official Just More Parts, the PW3 vectors of the export read and write the same. */
function testCodes(alone) {
  const vectors = readJson(path.join(ROOT, 'tools/fixtures/pw3-export-vectors.json'));
  const official = createCatalog(catalog);
  const swapped = createCatalog(composeCatalog(catalog, { fragments: [alone.fragment] }));
  let same = 0;
  for (const v of vectors) {
    const a = official.decode(v.code);
    const b = swapped.decode(v.code);
    if (!b.ok) {
      check(!a.ok, `JMP jar instead of the official add-on: ${v.preset || v.code.slice(0, 20)} no longer reads`);
      continue;
    }
    let again = null;
    try {
      again = swapped.encode(b.content, { carry: b.carry });
    } catch (e) {
      again = e.message;
    }
    if (check(again === v.code && JSON.stringify(a.content.build) === JSON.stringify(b.content.build), `JMP jar: vector ${v.preset || v.code.slice(0, 24)} re-encodes the same`)) same++;
  }
  notes.push(`JMP jar instead of the official add-on: ${same}/${vectors.length} PW3 vectors read and write the same`);
}

/** The hosted export of the directory is what the jar gives (and its manifest names this jar). */
function testHosted(alone, bytes) {
  const dir = path.join(ROOT, 'assets/data/addons/justmoreparts');
  if (!fs.existsSync(dir)) return;
  for (const version of fs.readdirSync(dir)) {
    const m = readJson(path.join(dir, version, 'manifest.json'));
    if (m.jar.sha256 !== crypto.createHash('sha256').update(bytes).digest('hex')) {
      notes.push(`hosted ${version} was made from ${m.jar.file}, not from the given jar: compared by content only`);
    } else {
      check(m.jar.bytes === bytes.length, `hosted ${version}: size of the jar`);
    }
    if (m.mod.version !== alone.mod.version) continue;
    for (const [file, want] of [['parts.json', alone.export.justmoreparts.parts], ['chemistries.json', alone.export.justmoreparts.chemistries],
      ['mounts.json', alone.export.justmoreparts.mounts], ['share_table.json', alone.table]]) {
      const d = diff(want, readJson(path.join(dir, version, file)), file);
      check(!d.length, `hosted ${version}/${file} = the jar's: ${d.join('; ')}`);
    }
  }
}

/** Propwash's example add-on (devtest resources) as a jar: no error, the LED ring with its path. */
function testExample() {
  if (!PW_REPO) {
    notes.push('no Propwash checkout (--propwash-repo / PROPWASH_REPO): the example add-on is skipped');
    return;
  }
  const res = path.join(PW_REPO, 'common/src/devtest/resources');
  if (!fs.existsSync(path.join(res, 'data/propwash_example'))) {
    notes.push(`no example add-on in ${res}`);
    return;
  }
  const files = new Map([['fabric.mod.json', Buffer.from(JSON.stringify({ id: 'propwash_example', version: '1.0.0', name: 'Example Add-on' }))]]);
  const walkDir = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) walkDir(path.join(dir, e.name), r);
      else files.set(r.slice(1), fs.readFileSync(path.join(dir, e.name)));
    }
  };
  walkDir(path.join(res, 'data/propwash_example'), '/data/propwash_example');
  if (fs.existsSync(path.join(res, 'assets/propwash_example'))) walkDir(path.join(res, 'assets/propwash_example'), '/assets/propwash_example');
  const r = readAddon(files, { base: catalog, models: false });
  if (!check(r.ok, `example add-on: reads (${JSON.stringify(r.problems)})`)) return;
  const ring = r.export.propwash_example.parts.find((p) => p.id === 'propwash_example:led_ring');
  const raw = JSON.parse(files.get('data/propwash_example/propwash_parts/accessory/led_ring.json').toString('utf8'));
  check(ring && JSON.stringify(ring.data.led_path) === JSON.stringify(raw.led_path) && ring.data.leds === raw.leds, 'example add-on: the LED ring carries its led_path (ledPathMm)');
  const bundled = bundledParts(new Map([...files].filter(([k]) => k.startsWith('data/')).map(([k, v]) => [k, v.toString('utf8')])), 'propwash_example');
  check(!bundled.errors.length, `example add-on: no part errors (${bundled.errors[0] || ''})`);
  notes.push(`example add-on: ${r.fragment.parts.length} parts, ${r.fragment.chemistries.length} chemistries, led_ring with ${ring ? ring.data.led_path.length : 0} points`);
}

// ---------------------------------------------------------------------------------------------------------------
// Headless Chrome

const VIEWPORTS = { 1280: { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, 390: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true } };
const text = (key, lang) => entry(key)[lang === 'de' ? 1 : 0];

async function browserTests(jars) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-jars-'));
  const file = (name) => {
    const f = path.join(tmp, `${name}.jar`);
    fs.writeFileSync(f, jars[name]);
    return f;
  };
  const files = { good: file('good'), html: file('html'), bomb: file('bomb'), bigTexture: file('bigTexture'), paths: file('paths'), foreign: file('foreign') };
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-jar-chrome-'));
  const { child, ws } = await launch(arg('--chrome') || CHROME, profile);
  const browser = cdp(ws);
  const errors = [];
  const requests = [];
  try {
    await browser.ready;
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => browser.send(method, params, sessionId);
    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text}: ${expression.slice(0, 160)}`);
      return r.result.value;
    };
    browser.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error' || p.type === 'assert') errors.push(`console.${p.type}: ${p.args.map((a) => a.value ?? a.description).join(' ')}`);
    });
    browser.on('Runtime.exceptionThrown', (p) => errors.push(`exception: ${p.exceptionDetails.exception?.description || p.exceptionDetails.text}`));
    browser.on('Network.requestWillBeSent', (p) => requests.push(p.request.url));
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Network.enable');
    await send('DOM.enable');
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    let language = 'en';
    const ready = `(() => { const c = document.querySelector('[data-cfg]'); return !!(c && c.getAttribute('aria-busy') === 'false' && document.querySelector('[data-addon-bar]')); })()`;
    async function open(url, width) {
      await send('Emulation.setDeviceMetricsOverride', VIEWPORTS[width]);
      await send('Page.navigate', { url: 'about:blank' });
      await sleep(60);
      const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('propwash-lang', '${language}'); } catch (e) {}` });
      await send('Page.navigate', { url });
      const start = Date.now();
      while (!(await evaluate(ready))) {
        if (Date.now() - start > 30000) throw new Error(`${url}: not ready within 30 s`);
        await sleep(150);
      }
      await send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
      await sleep(300);
    }
    async function setFile(f) {
      const { root } = await send('DOM.getDocument', { depth: 1 });
      const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-addon-file]' });
      await send('DOM.setFileInputFiles', { nodeId, files: [f] });
      const start = Date.now();
      await sleep(100);
      while (await evaluate("!!document.querySelector('.addon-bar__message--busy') || document.querySelector('[data-addon-bar]').getAttribute('aria-busy') === 'true'")) {
        if (Date.now() - start > 30000) throw new Error(`${f}: still reading after 30 s`);
        await sleep(100);
      }
      await sleep(200);
    }
    const bar = () => evaluate(`(() => ({
      rows: [...document.querySelectorAll('[data-addon-item]')].map((li) => ({ ns: li.dataset.addonItem, source: li.dataset.addonSource,
        on: li.querySelector('[role=switch]').getAttribute('aria-checked'), name: li.querySelector('.addon-bar__name').textContent })),
      messages: [...document.querySelectorAll('.addon-bar__message')].map((m) => ({ level: m.className.replace(/.*--/, ''), text: m.textContent })),
      open: document.querySelector('[data-addon-open]').textContent,
      local: document.querySelector('.addon-bar__local').textContent,
    }))()`);
    const frames = (prefix) => evaluate(`(async () => {
      document.querySelector('[data-slots] [data-cat="frame"]').click();
      await new Promise((r) => setTimeout(r, 120));
      const all = document.querySelector('[data-picker] [data-cls="all"]');
      if (all) { all.click(); await new Promise((r) => setTimeout(r, 120)); }
      return [...document.querySelectorAll('[data-picker] [role=option]')].filter((o) => o.dataset.id.startsWith(${JSON.stringify(prefix)})).map((o) => ({ id: o.dataset.id, name: o.querySelector('.part__name').textContent }));
    })()`);
    async function shot(name) {
      if (!SHOTS) return;
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(r.data, 'base64'));
    }
    const noSideways = async (label, width) => {
      const w = await evaluate('document.documentElement.scrollWidth');
      check(w <= width, `${label}: no sideways scrolling (${w} px)`);
    };
    const jmpParts = catalog.parts.filter((p) => p.id.startsWith('justmoreparts:') && p.category === 'frame').length;

    for (const lang of ['en', 'de']) {
      language = lang;
      for (const width of [1280, 390]) {
        const tag = `${lang}-${width}`;
        await open(`${base}/configurator/`, width);
        let b = await bar();
        check(b.rows.length === 1 && b.rows[0].ns === 'justmoreparts' && b.rows[0].source === 'directory' && b.rows[0].on === 'true', `bar ${tag}: Just More Parts from the directory, on (${JSON.stringify(b.rows)})`);
        check(b.open === text('addons.open', lang) && b.local === text('addons.local', lang), `bar ${tag}: “${b.open}” with “${b.local}”`);
        await evaluate("document.querySelector('[data-addon-bar]').scrollIntoView({ block: 'start' })");
        await shot(`jar-bar-${tag}`);
        requests.length = 0;
        await setFile(files.good);
        b = await bar();
        check(b.rows.some((r) => r.ns === NS && r.source === 'local' && r.on === 'true'), `jar ${tag}: the made-up add-on is listed as local and on`);
        check(b.messages[0] && b.messages[0].text === text('addons.loaded', lang).replace('{name}', 'Test Add-on for Propwash').replace('{version}', '0.3.1').replace('{file}', 'good.jar').replace('{n}', '5'), `jar ${tag}: message “${b.messages[0] && b.messages[0].text}”`);
        check(b.messages.some((m) => m.level === 'warning' && m.text.includes(`${NS}:java_motor`)), `jar ${tag}: the Java-only part is named`);
        const own = await frames(`${NS}:`);
        check(own.length === 1 && own[0].name === (lang === 'de' ? 'Winziger Rahmen' : 'Tiny Frame'), `jar ${tag}: the frame of the jar in the picker (${JSON.stringify(own)})`);
        check(requests.filter((u) => !u.startsWith('data:') && !u.startsWith('blob:')).length === 0, `jar ${tag}: no request while reading the jar (${requests.slice(0, 3)})`);
        await evaluate("document.querySelector('[data-addon-bar]').scrollIntoView({ block: 'start' })");
        await shot(`jar-loaded-${tag}`);
        await noSideways(`jar ${tag}`, width);
        if (width === 1280) {
          await setFile(files.bomb);
          b = await bar();
          check(b.messages.some((m) => m.level === 'error' && m.text === text('addons.problems.jar.ratio', lang).replace('{name}', `data/${NS}/propwash_parts/motor/bomb.json`)), `zip bomb ${tag}: message (${JSON.stringify(b.messages)})`);
          check(b.rows.some((r) => r.ns === NS), `zip bomb ${tag}: the add-on loaded before stays`);
          await shot(`jar-bomb-${tag}`);
          await setFile(files.bigTexture);
          b = await bar();
          check(b.messages.some((m) => m.level === 'warning' && m.text.includes('2048')), `big texture ${tag}: message (${JSON.stringify(b.messages.map((m) => m.text))})`);
          await setFile(files.paths);
          b = await bar();
          check(b.messages.some((m) => m.level === 'warning' && m.text.includes('3')), `paths ${tag}: skipped entries named`);
          await setFile(files.foreign);
          b = await bar();
          check(b.messages.some((m) => m.level === 'error' && m.text.includes(lang === 'de' ? 'Web-Export' : 'web export')), `foreign mod ${tag}: needs a web export`);
          await setFile(files.html);
          const named = await frames(`${NS}:`);
          check(named.length === 1 && named[0].name.startsWith('<img') && (await evaluate('window.__xss === undefined && !document.querySelector("[data-picker] img[src=x]")')), `HTML in a name ${tag}: shown as text`);
          // Just More Parts off: its parts leave the pickers, the build falls back to a Propwash preset; on again.
          await evaluate("document.querySelector('[data-addon-switch=\"justmoreparts\"]').click()");
          await sleep(400);
          const offFrames = await frames('justmoreparts:');
          const banner = await evaluate("document.querySelector('.banner') ? document.querySelector('.banner').textContent : ''");
          check(offFrames.length === 0, `JMP off ${tag}: no JMP frame in the picker (${offFrames.length})`);
          check(banner.includes(text('addons.buildSwitched', lang).split('{name}')[0].slice(0, 30)), `JMP off ${tag}: banner “${banner}”`);
          check(await evaluate("document.querySelector('[data-code]').textContent.startsWith('PW3-')"), `JMP off ${tag}: the share box still has a code`);
          await shot(`jar-jmp-off-${tag}`);
          await evaluate("document.querySelector('[data-addon-switch=\"justmoreparts\"]').click()");
          await sleep(400);
          check((await frames('justmoreparts:')).length === jmpParts, `JMP on again ${tag}: ${jmpParts} JMP frames`);
          // A reload forgets the jar.
          await open(`${base}/configurator/`, width);
          b = await bar();
          const stored = await evaluate("(async () => ({ keys: Object.keys(localStorage), cookie: document.cookie, dbs: indexedDB.databases ? (await indexedDB.databases()).length : 0 }))()");
          check(!b.rows.some((r) => r.source === 'local'), `reload ${tag}: the jar is gone`);
          check(stored.cookie === '' && stored.dbs === 0 && stored.keys.every((k) => k.startsWith('propwash-')) && !stored.keys.some((k) => /jar|addon/i.test(k)), `reload ${tag}: nothing stored (${JSON.stringify(stored)})`);
          if (JMP_JAR && fs.existsSync(JMP_JAR)) {
            await setFile(JMP_JAR);
            b = await bar();
            const local = b.rows.find((r) => r.ns === 'justmoreparts');
            check(local && local.source === 'local' && b.rows.length === 1, `JMP jar ${tag}: replaces the directory's (${JSON.stringify(b.rows)})`);
            check((await frames('justmoreparts:')).length === jmpParts, `JMP jar ${tag}: ${jmpParts} frames`);
            check(await evaluate("(() => { const v = document.querySelector('[data-code]').textContent; return v.startsWith('PW3-'); })()"), `JMP jar ${tag}: the build keeps a code`);
            await shot(`jar-jmp-local-${tag}`);
          }
        }
      }
    }
    // The “needs add-on” line offers the jar.
    language = 'en';
    const good = readAddon(jars.good, { base: catalog });
    const c = createCatalog(composeCatalog(catalog, { fragments: [good.fragment] }));
    const code = c.encode({ build: { ...c.presetBuild('propwash:whoop'), frame: `${NS}:tiny_frame` }, paint: null, tune: null, osd: null, name: null });
    await open(`${base}/configurator/`, 1280);
    await evaluate(`(() => { const i = document.querySelector('[data-import]'); i.value = ${JSON.stringify(code)}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await sleep(700);
    const offer = await evaluate("[...document.querySelectorAll('.addon-line__jar')].map((b) => b.textContent)");
    check(offer.includes(text('addons.open', 'en')), `a code with a missing add-on offers “${text('addons.open', 'en')}” (${offer})`);
    check(errors.length === 0, `no console errors or exceptions: ${errors.slice(0, 5).join(' | ')}`);
  } finally {
    browser.close();
    child.kill();
    server.close();
    await sleep(500);
    try {
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      notes.push(`Chrome profile left in ${profile}`);
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function main() {
  const jars = madeUpJars();
  testMadeUp(jars);
  const summary = testRealJars();
  testExample();
  if (BROWSER) await browserTests(jars);
  else notes.push('headless Chrome skipped (--no-browser)');
  for (const line of summary) console.log(line);
  for (const n of notes) console.log(`note: ${n}`);
  if (failures.length) {
    for (const f of failures.slice(0, 60)) console.log(`  FAIL ${f}`);
    if (failures.length > 60) console.log(`  … and ${failures.length - 60} more`);
    console.log(`jar loader: ${checks - failures.length}/${checks} checks passed`);
    process.exit(1);
  }
  console.log(`PASS: jar loader: ${checks} checks passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
