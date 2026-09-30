#!/usr/bin/env node
// Tests the configurator core (assets/js/configurator/) against the mod's exported results.
//
//   node tools/test-configurator.mjs [--export <web-export dir>] [--quiet]
//
// 1. PW1 test vectors (tools/fixtures/sharecode-vectors.json, copied from the web export): every vector must decode
//    to the exported status, layers, content, skipped entries, unknown/wrong-kind parts, and re-encode byte-identically
//    (uncompressed and compressed); the compatibility check and all analysis figures must match the mod's.
// 2. Presets in the catalog: share code, check and analysis; flight tune defaults of every preset (tune.json#defaults),
//    normalisation and edits of the tune; paint swatches and random paint schemes round-trip through the share code.
// 3. Tolerant decoding and error statuses (spelling variants, damaged and hostile codes).
// 4. If the web export is available (default ../propwash-justmoreparts/release/1.0.1/web-export or JMP_WEB_EXPORT):
//    the one-part-swapped analysis variants of every preset (analysis/<preset>.json).
// Exit code 0 only if every check passes.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCatalog } from '../assets/js/configurator/data.js';
import * as share from '../assets/js/configurator/sharecode.js';
import { STAT_KEYS } from '../assets/js/configurator/analysis.js';
import { TUNE_PARAMS, sanitizeTuneValue } from '../assets/js/configurator/tuning.js';
import { PAINT_SWATCHES, swatchOf, randomPaint } from '../assets/js/configurator/paint.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const quiet = argv.includes('--quiet');

// Analysis numbers must match to this relative (or absolute, near zero) tolerance. The port keeps the mod's operation
// order, so the numbers normally match bit for bit; the tolerance only absorbs last-digit differences of sin/cos/pow.
const REL_TOL = 1e-9;
const ABS_TOL = 1e-9;

const catalog = createCatalog(JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/data/configurator/catalog.json'), 'utf8')));
const vectors = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures/sharecode-vectors.json'), 'utf8'));

let passed = 0;
let failed = 0;
const failures = [];
const stats = { analysisValues: 0, exactValues: 0, maxRel: 0, maxRelAt: '' };

function ok(cond, what) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(what);
    if (!quiet) console.log(`  FAIL ${what}`);
  }
  return cond;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function sameNumber(actual, expected, where) {
  if (expected === null) return ok(actual === null || Number.isNaN(actual), `${where}: expected no value, got ${actual}`);
  if (typeof actual !== 'number' || Number.isNaN(actual)) return ok(false, `${where}: expected ${expected}, got ${actual}`);
  stats.analysisValues++;
  if (actual === expected) {
    stats.exactValues++;
    return ok(true, where);
  }
  const diff = Math.abs(actual - expected);
  const rel = diff / Math.max(Math.abs(expected), 1e-300);
  if (rel > stats.maxRel) {
    stats.maxRel = rel;
    stats.maxRelAt = `${where} (${actual} vs ${expected})`;
  }
  return ok(diff <= ABS_TOL || rel <= REL_TOL, `${where}: ${actual} vs ${expected} (rel ${rel.toExponential(2)})`);
}

function compareAnalysis(actual, expected, where) {
  if (expected === null) return ok(actual === null, `${where}: analysis expected null`);
  if (!ok(actual !== null, `${where}: analysis missing`)) return false;
  let good = true;
  for (const key of STAT_KEYS) good = sameNumber(actual[key], expected[key], `${where}.${key}`) && good;
  good = ok(same(actual.warnings, expected.warnings), `${where}.warnings ${JSON.stringify(actual.warnings)} vs ${JSON.stringify(expected.warnings)}`) && good;
  return good;
}

function compareCheck(actual, expected, where) {
  if (expected === null) return true;
  return ok(same(actual.problems, expected.problems) && same(actual.warnings, expected.warnings),
    `${where}: check ${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`);
}

function compareTune(actual, expected, where) {
  if (expected === null || actual === null) return ok(actual === expected, `${where}: tune ${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`);
  const ak = Object.keys(actual);
  const ek = Object.keys(expected);
  if (!ok(same(ak, ek), `${where}: tune keys ${ak} vs ${ek}`)) return false;
  // Exported values are float32 written as their shortest decimal form.
  return ok(ek.every((k) => Object.is(actual[k], Math.fround(expected[k]))), `${where}: tune values ${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`);
}

function compareContent(actual, expected, where) {
  if (expected === null) return ok(actual === null, `${where}: content expected null`);
  if (!ok(actual !== null, `${where}: content missing`)) return false;
  let good = ok(same(actual.build, expected.build), `${where}: build ${JSON.stringify(actual.build)} vs ${JSON.stringify(expected.build)}`);
  good = ok(same(actual.paint, expected.paint), `${where}: paint ${JSON.stringify(actual.paint)} vs ${JSON.stringify(expected.paint)}`) && good;
  good = compareTune(actual.tune, expected.tune, where) && good;
  good = ok(same(actual.osd, expected.osd), `${where}: osd`) && good;
  good = ok(actual.name === expected.name, `${where}: name ${actual.name} vs ${expected.name}`) && good;
  return good;
}

// ---------------------------------------------------------------------------------------------------------------
console.log(`Catalog: ${catalog.parts.length} parts, ${catalog.presets.length} presets (${catalog.source.generator}, PW1 ${catalog.source.sharecode.revision})`);

// 1. Test vectors
let vectorPass = 0;
let byteIdentical = 0;
let byteTotal = 0;
let analysed = 0;
for (const v of vectors) {
  const before = failed;
  const d = catalog.decode(v.code);
  ok(d.status === v.status, `${v.name}: status ${d.status} vs ${v.status}`);
  ok(same(d.layers, v.layers), `${v.name}: layers ${d.layers} vs ${v.layers}`);
  ok(same(d.skipped, v.skipped), `${v.name}: skipped ${d.skipped} vs ${v.skipped}`);
  ok(same(d.unknownParts, v.unknown_parts), `${v.name}: unknown parts ${d.unknownParts} vs ${v.unknown_parts}`);
  ok(same(d.wrongKind, v.wrong_kind), `${v.name}: wrong kind ${d.wrongKind} vs ${v.wrong_kind}`);
  ok(same(d.renamed, v.renamed), `${v.name}: renamed`);
  compareContent(d.content, v.decoded, v.name);

  if (d.ok) {
    // Encoding: every vector except the hand-crafted E (it carries entries a PW1 encoder never writes) must come
    // out byte-identical in its compression mode; E must at least survive a round trip.
    const again = share.encode(d.content, { compression: v.compression });
    if (v.skipped.length === 0) {
      byteTotal++;
      if (ok(again === v.code, `${v.name}: re-encoded ${again} vs ${v.code}`)) byteIdentical++;
    }
    const round = catalog.decode(again);
    compareContent(round.content, v.decoded, `${v.name} (round trip)`);
    for (const mode of ['never', 'always', 'auto']) {
      const code = share.encode(d.content, { compression: mode });
      compareContent(catalog.decode(code).content, v.decoded, `${v.name} (${mode})`);
    }
    // Tolerant input: lower case, blanks and line breaks, no dashes, O/I/L look-alikes.
    const body = v.code.slice(share.PREFIX.length).toLowerCase().replace(/-/g, ' ').replace(/(.{17})/g, '$1\n ')
      .replace(/0/g, 'o').replace(/1/g, 'l');
    const tolerant = `  pw1 ${body}\t`;
    compareContent(catalog.decode(tolerant).content, v.decoded, `${v.name} (tolerant input)`);
  }
  if (v.check) compareCheck(catalog.check(v.decoded.build), v.check, v.name);
  if (v.analysis) {
    analysed++;
    compareAnalysis(catalog.analyze(v.decoded.build), v.analysis, v.name);
  } else if (d.ok && v.unknown_parts.length === 0 && v.wrong_kind.length === 0) {
    ok(catalog.analyze(d.content.build) === null, `${v.name}: analysis should be null`);
  }
  if (d.ok && v.unknown_parts.length) {
    ok(catalog.analyze(d.content.build) === null, `${v.name}: analysis must be null with unknown parts`);
    ok(same(catalog.check(d.content.build).problems, ['missing_part']), `${v.name}: missing_part expected`);
  }
  if (failed === before) vectorPass++;
}
console.log(`Vectors: ${vectorPass}/${vectors.length} fully passed, ${byteIdentical}/${byteTotal} re-encoded byte-identically, ${analysed} analyses compared`);

// 2. Presets
let presetPass = 0;
for (const preset of catalog.presets) {
  const before = failed;
  const content = catalog.presetContent(preset.id);
  ok(share.encode(content) === preset.sharecode, `preset ${preset.id}: share code`);
  compareCheck(catalog.check(content.build), preset.check, `preset ${preset.id}`);
  compareAnalysis(catalog.analyze(content.build), preset.analysis, `preset ${preset.id}`);
  if (failed === before) presetPass++;
}
console.log(`Presets: ${presetPass}/${catalog.presets.length} (share code, check, analysis)`);

// 2b. Flight tune defaults per preset (tune.json#defaults) and stored preset tunes as fixed points of normalisation
{
  const before = failed;
  let values = 0;
  for (const preset of catalog.presets) {
    const expected = catalog.tune.defaults[preset.id];
    if (!ok(expected, `tune defaults for ${preset.id}`)) continue;
    const got = catalog.defaultTune(preset.build);
    ok(same(Object.keys(got), Object.keys(expected).sort()), `${preset.id}: default tune keys`);
    for (const key of Object.keys(expected)) {
      values++;
      ok(Object.is(got[key], Math.fround(expected[key])), `${preset.id}: default ${key} ${got[key]} vs ${expected[key]}`);
    }
    const stored = Object.fromEntries(Object.entries(preset.tune).filter(([key]) => key in TUNE_PARAMS));
    const normal = catalog.normalizeTune(stored, preset.build);
    ok(same(Object.keys(normal), Object.keys(stored).sort()) && Object.keys(stored).every((k) => Object.is(normal[k], Math.fround(stored[k]))),
      `${preset.id}: stored tune is normalised`);
    ok(same(catalog.normalizeTune(catalog.effectiveTune(stored, preset.build), preset.build), normal), `${preset.id}: effective -> normalize`);
  }
  const build = catalog.preset('propwash:freestyle').build;
  const manual = catalog.applyTuneEdit({}, { 'pid.roll.p': 50 }, build);
  ok(manual['pid.source'] === 1 && manual['pid.roll.p'] === 50 && Object.keys(manual).length === 13, 'editing a PID switches to manual');
  ok(same(catalog.applyTuneEdit(manual, { 'pid.source': 0 }, build), {}), 'switching back to derived drops manual PIDs');
  ok(same(catalog.applyTuneEdit({}, { 'rates.roll.rcRate': 1.2 }, build), { 'rates.roll.rcRate': Math.fround(1.2) }), 'rate edit stored');
  ok(sanitizeTuneValue('filters.dtermLpf2Hz', 7) === 0 && sanitizeTuneValue('rates.roll.rcRate', 1.234) === 1.23
    && sanitizeTuneValue('pid.tpaMode', 5) === 1, 'editor sanitising');
  console.log(`Tune defaults: ${values} values of ${catalog.presets.length} presets ${failed === before ? 'identical' : 'FAILED'}, normalisation and edits ${failed === before ? 'passed' : 'FAILED'}`);
}

// 2c. Paint swatches (PaintSwatch): a swatch paints its RGB value, so its code equals the one of the same custom colour
{
  const before = failed;
  ok(PAINT_SWATCHES.length === 21 && PAINT_SWATCHES.filter((s) => s.finish).map((s) => s.key).join() === 'carbon,gunmetal,aluminium,gold,copper',
    'paint swatches: 16 dyes, then the 5 finishes');
  const base = catalog.presetContent(catalog.presets[0].id);
  for (const swatch of PAINT_SWATCHES) {
    const paint = Object.fromEntries(share.PAINT_SLOTS.map((slot) => [slot, swatch.hex]));
    const code = share.encode({ ...base, paint });
    const back = share.decode(code);
    ok(back.ok && same(back.content.paint, paint), `swatch ${swatch.key}: paint round-trips through the share code`);
    ok(code === share.encode({ ...base, paint: Object.fromEntries(share.PAINT_SLOTS.map((slot) => [slot, `#${swatch.rgb.toString(16).padStart(6, '0').toUpperCase()}`])) }),
      `swatch ${swatch.key}: same code as the custom colour`);
    ok(swatchOf(swatch.hex) === swatch && swatchOf(swatch.rgb) === swatch, `swatch ${swatch.key}: byColor`);
  }
  console.log(`Paint swatches: ${PAINT_SWATCHES.length} ${failed === before ? 'round-trip through the share code' : 'FAILED'}`);
}

// 2d. Random paint schemes: every slot painted with a swatch or a tone of the scheme's accent, valid RGB, round trip
{
  const before = failed;
  let seed = 20260930;
  const random = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let x = Math.imul(seed ^ (seed >>> 15), seed | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 2 ** 32;
  };
  const base = catalog.presetContent(catalog.presets[0].id);
  const seen = new Set();
  const runs = 400;
  let customs = 0;
  let alternating = 0;
  for (let i = 0; i < runs; i++) {
    const slots = i % 5 === 4 ? share.PAINT_SLOTS.filter((s) => !['accessories', 'antenna'].includes(s)) : share.PAINT_SLOTS;
    const paint = randomPaint(slots, random);
    seen.add(JSON.stringify(paint));
    ok(same(Object.keys(paint), [...slots]), `random paint ${i}: exactly the given slots`);
    ok(Object.values(paint).every((c) => /^#[0-9a-f]{6}$/.test(c)), `random paint ${i}: '#rrggbb' colours`);
    const custom = Object.values(paint).filter((c) => !swatchOf(c));
    customs += custom.length ? 1 : 0;
    ok(custom.length <= 1, `random paint ${i}: at most one custom tone`);
    ok(paint.prop_fl === paint.prop_fr && paint.prop_rl === paint.prop_rr, `random paint ${i}: props in front/rear pairs`);
    if (paint.prop_fl !== paint.prop_rl) alternating++;
    const back = share.decode(share.encode({ ...base, paint }));
    ok(back.ok && same(back.content.paint, paint), `random paint ${i}: round-trips through the share code`);
  }
  ok(seen.size > runs * 0.9, `random paint: schemes differ (${seen.size} of ${runs})`);
  ok(customs > 0 && customs < runs * 0.35, `random paint: custom tones are the exception (${customs} of ${runs})`);
  ok(alternating > runs * 0.25 && alternating < runs * 0.75, `random paint: props sometimes alike, sometimes front/rear (${alternating} of ${runs})`);
  console.log(`Random paint: ${runs} schemes ${failed === before ? `valid and round-trip (${seen.size} different, ${alternating} front/rear, ${customs} with a custom tone)` : 'FAILED'}`);
}

// 3. Tolerant decoding and error statuses
{
  const before = failed;
  const a = vectors.find((v) => v.name === 'A_parts_only');
  const expectStatus = (code, status, what) => ok(catalog.decode(code).status === status, `status ${what}: ${catalog.decode(code).status} vs ${status}`);
  expectStatus('', 'EMPTY', 'empty');
  expectStatus('  \n\t ', 'EMPTY', 'blank');
  expectStatus(null, 'EMPTY', 'null');
  expectStatus('XW1-04002', 'INVALID_PREFIX', 'wrong prefix');
  expectStatus('hello', 'INVALID_PREFIX', 'text');
  expectStatus('PW1-04002-GR1U', 'BAD_CHARACTER', 'U');
  expectStatus('PW1-04002-GR1*', 'BAD_CHARACTER', 'star');
  expectStatus('PW1-' + '0'.repeat(4001), 'TOO_LONG', 'over 4000 characters');
  expectStatus('PW1-00000', 'TRUNCATED', 'short frame');
  expectStatus(a.code.slice(0, -6), 'CHECKSUM', 'cut code');
  expectStatus(vectors.find((v) => v.name === 'F_checksum_error').code, 'CHECKSUM', 'vector F');
  expectStatus('PW1' + a.code.slice(4), 'OK', 'no dash after prefix');
  expectStatus(`  ${a.code.replace(/-/g, ' ')}  `, 'OK', 'no-break spaces');
  expectStatus(a.code.toLowerCase(), 'OK', 'lower case');
  // Frame with a wrong version byte / reserved flag (valid CRC) and hostile payloads.
  const frameCode = (bytes) => {
    const crc = crcOf(bytes);
    return share.PREFIX + share.group(share.base32Encode([...bytes, crc >>> 24, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255]));
  };
  expectStatus(frameCode([2, 0, 1, 0]), 'UNSUPPORTED_VERSION', 'frame version 2');
  expectStatus(frameCode([1, 2, 1, 0]), 'UNSUPPORTED_VERSION', 'reserved flag');
  expectStatus(frameCode([1, 0, 0, 0]), 'CORRUPT', 'no PARTS layer');
  expectStatus(frameCode([1, 0, 1, 5, 1]), 'TRUNCATED', 'block longer than payload');
  expectStatus(frameCode([1, 0, 0x81, 0x80, 0x80, 0x80, 0x80, 0x01]), 'CORRUPT', 'varint over 5 bytes');
  expectStatus(frameCode([1, 1, 0xff, 0xff, 0xff]), 'CORRUPT', 'bad DEFLATE stream');
  expectStatus(frameCode([1, 1, 0x03, 0x00, 0x00]), 'CORRUPT', 'DEFLATE with trailing bytes');
  // Base32 padding bits must be zero.
  const aSymbols = a.code.slice(4).replace(/-/g, '');
  const last = share.ALPHABET.indexOf(aSymbols[aSymbols.length - 1]);
  const paddingBits = (aSymbols.length * 5) % 8;
  if (paddingBits > 0) {
    const bad = aSymbols.slice(0, -1) + share.ALPHABET[last | 1];
    expectStatus('PW1-' + bad, (last & 1) === 0 ? 'CORRUPT' : 'OK', 'non-zero padding bits');
  }
  // Compressed payload that inflates past 16384 bytes.
  const big = { build: vectors[0].decoded.build, name: 'x', osd: { version: 1, json: 'a'.repeat(8192) } };
  ok(catalog.decode(share.encode(big, { compression: 'always' })).status === 'OK', 'large OSD round trip');
  // Unknown namespace number is kept when re-encoding.
  const foreign = share.encode({ build: { ...vectors[0].decoded.build, frame: '?7:mystery_frame' } }, { compression: 'never' });
  const fd = catalog.decode(foreign);
  ok(fd.ok && fd.content.build.frame === '?7:mystery_frame' && same(fd.skipped, ['namespace:7']) && same(fd.unknownParts, ['?7:mystery_frame']),
    'unknown namespace number');
  ok(share.encode(fd.content, { compression: 'never' }) === foreign, 'unknown namespace re-encoded identically');
  // Wrong kind: a motor id in the frame field.
  const wrong = catalog.decode(share.encode({ build: { ...vectors[0].decoded.build, frame: 'propwash:m2207_1750' } }));
  ok(same(wrong.wrongKind, ['propwash:m2207_1750']) && wrong.unknownParts.length === 0, 'wrong kind reported');
  // -0.0 and non-scalable values travel raw, values stay float32.
  const tuned = catalog.decode(share.encode({ build: vectors[0].decoded.build, tune: { 'pid.roll.p': -0, 'rates.roll.rcRate': 1 / 3 } }));
  ok(Object.is(tuned.content.tune['pid.roll.p'], -0) && tuned.content.tune['rates.roll.rcRate'] === Math.fround(1 / 3), 'raw float32 tune values');
  // Non-flight keys are dropped on encode.
  const noVtx = catalog.decode(share.encode({ build: vectors[0].decoded.build, tune: { 'vtx.channel': 3, 'camera.uptiltDeg': 20, 'pid.airmode': 1 } }));
  ok(same(Object.keys(noVtx.content.tune), ['pid.airmode']), 'only flight keys encoded');
  // Name is stripped, empty name and empty paint are dropped.
  const named = catalog.decode(share.encode({ build: vectors[0].decoded.build, name: '  Hallo Welt  ', paint: {} }));
  ok(named.content.name === 'Hallo Welt' && same(named.layers, ['parts', 'name']), 'name strip, empty paint dropped');
  // Share links.
  ok(share.codeFromHash('#' + encodeURIComponent(a.code)) === a.code && share.codeFromHash('#foo') === null, 'share link hash');
  ok(share.shareLink(a.code, 'https://example.org/propwash/configurator/#old') === `https://example.org/propwash/configurator/#${a.code}`, 'share link');
  console.log(`Decoder edge cases: ${failed === before ? 'all passed' : 'FAILED'}`);
}

function crcOf(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

// 4. Analysis variants from the web export (optional)
{
  const i = argv.indexOf('--export');
  const dir = i >= 0 && argv[i + 1] ? path.resolve(argv[i + 1])
    : process.env.JMP_WEB_EXPORT ? path.resolve(process.env.JMP_WEB_EXPORT)
      : path.resolve(ROOT, '../propwash-justmoreparts/release/1.0.1/web-export');
  const analysisDir = path.join(dir, 'analysis');
  if (fs.existsSync(analysisDir)) {
    const before = failed;
    let count = 0;
    for (const preset of catalog.presets) {
      const [ns, p] = preset.id.split(':');
      const file = path.join(analysisDir, ns, `${p}.json`);
      if (!ok(fs.existsSync(file), `analysis file for ${preset.id}`)) continue;
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const variant of data.variants) {
        const build = catalog.presetBuild(preset.id);
        if (variant.category === 'accessory') build.accessories[catalog.part(variant.id).data.slot] = variant.id;
        else build[variant.category] = variant.id;
        const where = `${preset.id} + ${variant.id}`;
        compareCheck(catalog.check(build), variant.check, where);
        compareAnalysis(catalog.analyze(build), variant.analysis, where);
        count++;
      }
    }
    console.log(`Analysis variants (web export): ${count} builds, ${failed === before ? 'all passed' : 'FAILED'}`);
  } else {
    console.log('Analysis variants: web export not found, skipped (use --export <dir> or JMP_WEB_EXPORT)');
  }
}

console.log(`Analysis figures: ${stats.analysisValues} compared, ${stats.exactValues} bit-identical, max relative deviation ${stats.maxRel.toExponential(2)}${stats.maxRel ? ` at ${stats.maxRelAt}` : ''}`);
console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}: ${passed} checks passed, ${failed} failed`);
if (failed && quiet) for (const f of failures.slice(0, 40)) console.log(`  ${f}`);
process.exit(failed === 0 ? 0 : 1);
