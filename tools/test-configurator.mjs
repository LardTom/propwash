#!/usr/bin/env node
// Tests the configurator core (assets/js/configurator/) against the mod's own results.
//
//   node tools/test-configurator.mjs [--export <web-export dir>] [--quiet]
//
// Share codes (Propwash 0.6.0: the site writes PW3 and reads PW1, PW2, PW3; pw3.md of Propwash):
// 1. The golden files of Propwash (tools/fixtures/sharecode/, copied unchanged by tools/build-configurator-data.mjs
//    --goldens; the mod's JUnit tests check the very same files): every PW1 and PW2 vector reads to the mod's status,
//    layers, content and skipped entries and re-encodes byte-identically; every PW3 vector encodes byte-identically in
//    its context, reads to the mod's content, namespace reports, unknown parts and renames, and writes back unchanged
//    with its carry; every conversion PW1/PW2 → PW3 is byte-identical (status and reason too), idempotent and keeps
//    the build; the table checksum vectors; the frozen table orders (baselines) against the catalog's tables; the
//    creative values of PW3 revision 3.1 (pw3-creative-vectors.json: the layer CREATIVE, extension 0, written and read
//    byte-identically, and old PWD1 codes of the drone editor read and converted like the mod).
//    PROPWASH_SHARECODE_GOLDENS (or a sibling ../propwash checkout): the copies must equal the mod's files.
// 1f. PWD1 codes of the drone editor (tools/fixtures/pwd1-vectors.json, made with the mod's classes: CreativeShareCode
//    and ShareConvert): Base64url, raw deflate, number forms of Double.parseDouble, limits of CreativeSpec – status,
//    creative values and the PW3 conversion like the mod; random creative values written and read back bit for bit.
// 2. The PW3 vectors of the web export (tools/fixtures/pw3-export-vectors.json): the preset codes, read and written by
//    the catalog like the game with Just More Parts installed, with the compatibility check and the analysis.
// 3. The vectors of Just More Parts 1.1.1 (tools/fixtures/sharecode-vectors.json, frozen: PW1 and PW2 from the last
//    format-1 export): read like before, converted to PW3 with the same build; check and analysis of Propwash 0.5.2
//    compared without the heat model, the rest of the analysis is unchanged in 0.6.0.
// 4. Report vectors (tools/fixtures/report-vectors.json): codes from bug reports with their expected build, analysis
//    and FPV camera, e.g. the deadcat whose props the game showed while the configurator said 0.0 %; analysis_before
//    keeps the figures before a recalibration (the flight physics part must stay unchanged, the energy part must not).
// 5. Presets: PW3 share code, check and analysis of the export; tune defaults, paint swatches, random paint.
// 6. Tolerant reading and every status (PW1, PW2, PW3, other codes of Propwash, bare PW3 bodies), unknown parts that
//    travel on (PW1 namespace numbers, PW2 table numbers, PW3 numbers behind a table's end with their carry).
// 7. The converter (convert.js): codes found in running text and links, replaced in place, at most 100 per pass,
//    idempotent; PROPWASH_DISCORD_CODES: a local file of real codes (one per line, never in the repository) – each
//    converts and keeps its build.
// 8. Figure explanations (assets/data/configurator/stathelp.json, i18n.js statHelp): a text for every figure of the
//    analysis in English, German and every active language, a range for every class; builds for beginners
//    (beginner.json): Propwash presets without problems and warnings, every figure inside the range of its class.
// 9. If the web export is available (default: newest ../propwash-justmoreparts/release/<version>/web-export, or
//    JMP_WEB_EXPORT / --export): the PW3 and PW2 tables of its spec.json against the code, the one-part-swapped
//    analysis variants of every preset (<ns>/analysis/<preset>.json) and the FPV camera of every preset and variant.
// 10. Heat model of Propwash 0.6.0 (tools/fixtures/heat-vectors.json, node tools/build-configurator-heat.mjs from a
//    0.6.0 web export): the three motor temperatures and the warnings of every preset and variant of the game.
// Exit code 0 only if every check passes.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCatalog } from '../assets/js/configurator/data.js';
import * as share from '../assets/js/configurator/sharecode.js';
import * as pw2 from '../assets/js/configurator/sharecode2.js';
import * as pw3 from '../assets/js/configurator/sharecode3.js';
import { findCodes, convertText, MAX_CODES, codeAddons, withCodeAddons } from '../assets/js/configurator/convert.js';
import { PW2_PARTS, PW2_COLORS, PW2_OSD_DICTIONARY } from '../assets/js/configurator/sharecode2-tables.js';
import { STAT_KEYS } from '../assets/js/configurator/analysis.js';
import { occlusionPercent, cameraFov, mountRange, droneUptilt } from '../assets/js/configurator/fpv.js';
import { TUNE_PARAMS, sanitizeTuneValue } from '../assets/js/configurator/tuning.js';
import { PAINT_SWATCHES, swatchOf, randomPaint } from '../assets/js/configurator/paint.js';
import { entry } from '../assets/js/configurator/i18n.js';
import { normalize } from '../assets/js/i18n.js';
import { activeLanguages, loadDict } from './i18n/languages.mjs';
import { exportDir, readExport, GOLDEN_FILES } from './build-configurator-data.mjs';
import { HEAT_KEYS, atLeast } from './build-configurator-heat.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const quiet = argv.includes('--quiet');
const fixture = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures', file), 'utf8'));
const data = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/data/configurator', file), 'utf8'));

// Analysis numbers must match to this relative (or absolute, near zero) tolerance. The port keeps the mod's operation
// order, so the numbers normally match bit for bit; the tolerance only absorbs last-digit differences of sin/cos/pow.
const REL_TOL = 1e-9;
const ABS_TOL = 1e-9;

const catalog = createCatalog(data('catalog.json'));
const golden = Object.fromEntries(GOLDEN_FILES.map((f) => [f, fixture(`sharecode/${f}`)]));
const exportVectors = fixture('pw3-export-vectors.json');
const legacyVectors = fixture('sharecode-vectors.json');
const reportVectors = fixture('report-vectors.json');
const heatVectors = fixture('heat-vectors.json');
const pwd1Vectors = fixture('pwd1-vectors.json');
const statHelp = data('stathelp.json');
const beginner = data('beginner.json');
// Heat model of the game since Propwash 0.6.0; figures of older exports are compared without it.
const HEAT_SINCE = '0.6.0';
const catalogHeat = atLeast(catalog.source.mods.propwash, HEAT_SINCE);

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

const withoutHeat = (warnings) => warnings.filter((w) => w !== 'motor_thermal');

function compareAnalysis(actual, expected, where, heat = true) {
  if (expected === null) return ok(actual === null, `${where}: analysis expected null`);
  if (!ok(actual !== null, `${where}: analysis missing`)) return false;
  let good = true;
  for (const key of STAT_KEYS) {
    if (heat || !HEAT_KEYS.includes(key)) good = sameNumber(actual[key], expected[key], `${where}.${key}`) && good;
  }
  const a = heat ? actual.warnings : withoutHeat(actual.warnings);
  const e = heat ? expected.warnings : withoutHeat(expected.warnings);
  good = ok(same(a, e), `${where}.warnings ${JSON.stringify(a)} vs ${JSON.stringify(e)}`) && good;
  return good;
}

/** Motor temperatures and warnings of a build against the game's (heat-vectors.json). */
function compareHeat(actual, heat, warnings, where) {
  if (!ok(actual !== null, `${where}: analysis missing`)) return false;
  let good = true;
  HEAT_KEYS.forEach((key, i) => {
    good = sameNumber(actual[key], heat[i], `${where}.${key}`) && good;
  });
  good = ok(same(actual.warnings, warnings), `${where}.warnings ${JSON.stringify(actual.warnings)} vs ${JSON.stringify(warnings)}`) && good;
  return good;
}

/** FPV camera against the web export's camera_view (lens, uptilt and mount range, camera FOV, prop discs, props in view). */
function compareCameraView(actual, expected, where) {
  if (!expected) return true;
  if (!ok(actual !== null, `${where}: camera view missing`)) return false;
  let good = true;
  const num = (a, e, what) => {
    good = sameNumber(a, e, `${where}.camera_view.${what}`) && good;
  };
  for (let k = 0; k < 3; k++) num(actual.lens_mm[k], expected.lens_mm[k], `lens_mm[${k}]`);
  for (const key of ['uptilt_deg', 'horizontal_fov_deg', 'vertical_fov_deg', 'aspect', 'props_in_view_percent']) num(actual[key], expected[key], key);
  for (const key of ['uptilt_min_deg', 'uptilt_max_deg']) {
    if (expected[key] !== undefined) num(actual[key], expected[key], key);
  }
  good = ok(actual.projection === expected.projection, `${where}.camera_view.projection`) && good;
  good = ok(actual.props.length === expected.props.length, `${where}.camera_view.props length`) && good;
  expected.props.forEach((e, i) => {
    const a = actual.props[i] || { center_mm: [], radius_mm: NaN, hub_radius_mm: NaN };
    for (let k = 0; k < 3; k++) num(a.center_mm[k], e.center_mm[k], `props[${i}].center_mm[${k}]`);
    num(a.radius_mm, e.radius_mm, `props[${i}].radius_mm`);
    num(a.hub_radius_mm, e.hub_radius_mm, `props[${i}].hub_radius_mm`);
  });
  return good;
}

function compareCheck(actual, expected, where) {
  if (expected === null || expected === undefined) return true;
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

/** Creative values (CreativeSpec) against the mod's: base parts in the mod's order, every value bit for bit. */
function compareCreative(actual, expected, where) {
  if (expected == null) return ok(actual == null, `${where}: creative values expected none, got ${JSON.stringify(actual)}`);
  if (!ok(actual != null, `${where}: creative values missing`)) return false;
  let good = ok(same(Object.entries(actual.base), Object.entries(expected.base)), `${where}: base parts ${JSON.stringify(actual.base)} vs ${JSON.stringify(expected.base)}`);
  const keys = Object.keys(actual.values);
  const want = Object.keys(expected.values);
  good = ok(same([...keys].sort(), [...want].sort()), `${where}: value keys ${keys.join(',')} vs ${want.join(',')}`) && good;
  for (const key of want) good = ok(Object.is(actual.values[key], expected.values[key]), `${where}: ${key}=${actual.values[key]} vs ${expected.values[key]}`) && good;
  return good;
}

/** A code in every spelling the readers accept: blanks and line breaks, a lower-case prefix, dashes. */
function tolerantSpellings(code) {
  const out = [];
  const format = share.formatOf(code);
  if (format === 'PW1') {
    const body = code.slice(share.PREFIX.length).toLowerCase().replace(/-/g, ' ').replace(/(.{17})/g, '$1\n ')
      .replace(/0/g, 'o').replace(/1/g, 'l');
    out.push(`  pw1 ${body}\t`);
  } else if (format === 'PW2') {
    out.push(`  pw2-${code.slice(3).replace(/(.{17})/g, '$1\n ')}\t`);
  } else if (format === 'PW3') {
    const body = code.replace(/^PW3-?/i, '');
    out.push(`  pw3-${body.replace(/(.{7})/g, '$1-').replace(/-$/, '')}\n`, `PW3${body}`, body);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
console.log(`Catalog: ${catalog.parts.length} parts, ${catalog.presets.length} presets (${catalog.source.generator}; `
  + `${catalog.namespaces.map((n) => `${n.namespace} ${n.version}`).join(', ')}; new codes ${share.SHARE_FORMAT} ${pw3.PW3_REVISION})`);

// 1a. Golden PW1 and PW2 vectors of Propwash
{
  for (const file of ['pw1-vectors.json', 'pw2-vectors.json']) {
    const g = golden[file];
    let pass = 0;
    let byte = 0;
    let byteTotal = 0;
    for (const v of g.vectors) {
      const before = failed;
      const d = share.decode(v.code);
      ok(d.status === v.status, `${v.name}: status ${d.status} vs ${v.status}`);
      ok(d.status !== 'OK' || d.format === v.format, `${v.name}: format ${d.format} vs ${v.format}`);
      ok(same(d.layers, v.layers), `${v.name}: layers ${d.layers} vs ${v.layers}`);
      ok(same(d.skipped, v.skipped), `${v.name}: skipped ${d.skipped} vs ${v.skipped}`);
      compareContent(d.content, v.content, v.name);
      if (d.ok && v.skipped.length === 0) {
        byteTotal++;
        const modes = v.format === 'PW1' ? ['never', 'auto', 'always'] : ['auto'];
        const again = modes.map((compression) => share.encode(d.content, { format: v.format, compression }));
        if (ok(again.includes(v.code), `${v.name}: re-encoded ${again[0]} vs ${v.code}`)) byte++;
      }
      if (d.ok) {
        for (const spelling of tolerantSpellings(v.code)) compareContent(share.decode(spelling).content, v.content, `${v.name} (tolerant input)`);
      }
      if (failed === before) pass++;
    }
    console.log(`Golden ${g.code_format} (${file}): ${pass}/${g.vectors.length} read like the mod, ${byte}/${byteTotal} re-encoded byte-identically`);
  }
}

// Contexts of pw3-vectors.json: 'frozen' (the conversion's data: Propwash table and the directory's tables) and
// 'extra'/'extra_newer' (Propwash table and directory, every built-in part registered, a test add-on with a table,
// add-ons without one; Just More Parts missing).
const goldenPw3 = golden['pw3-vectors.json'];
const propwashTable = catalog.json.sharecode.tables.propwash;
const directory = catalog.json.sharecode.directory;
function goldenContext(name) {
  if (name === 'frozen') return pw3.frozenTables(propwashTable, directory);
  const c = goldenPw3.contexts[name];
  const kinds = new Map();
  if (c.registered_builtin) for (const [kind, list] of Object.entries(propwashTable.parts)) for (const e of list) kinds.set(`propwash:${e.id}`, kind);
  for (const [kind, list] of Object.entries(c.registered || {})) for (const id of list) kinds.set(id, kind);
  return pw3.createShareTables({ tables: [propwashTable, ...(c.tables || [])], directory, versions: c.versions || {}, mods: c.mods || {}, lookup: (id) => kinds.get(id) || null });
}

// 1b. Golden PW3 vectors
{
  let pass = 0;
  let encoded = 0;
  let carried = 0;
  for (const v of goldenPw3.vectors) {
    const before = failed;
    if (v.encode_content) {
      let code;
      try {
        code = share.encode(v.encode_content, { tables: goldenContext(v.encode_context) });
      } catch (e) {
        code = `error ${e.message}`;
      }
      if (ok(code === v.code, `${v.name}: encoded ${code} vs ${v.code}`)) encoded++;
    }
    const tables = goldenContext(v.decode_context);
    const d = share.decode(v.code, { tables });
    ok(d.status === v.status, `${v.name}: status ${d.status} vs ${v.status}`);
    ok(d.format === v.format, `${v.name}: format ${d.format} vs ${v.format}`);
    ok(same(d.layers, v.layers), `${v.name}: layers ${d.layers} vs ${v.layers}`);
    ok(same(d.skipped, v.skipped), `${v.name}: skipped ${d.skipped} vs ${v.skipped}`);
    ok(same(d.namespaces, v.namespaces), `${v.name}: namespaces ${JSON.stringify(d.namespaces)} vs ${JSON.stringify(v.namespaces)}`);
    ok(same(d.unknownParts, v.unknown_parts), `${v.name}: unknown parts ${d.unknownParts} vs ${v.unknown_parts}`);
    ok(same(d.renamed, v.renamed), `${v.name}: renamed ${JSON.stringify(d.renamed)}`);
    compareContent(d.content, v.content, v.name);
    if (d.ok && v.renamed.length === 0) {
      // Written back with the heads of the code (carry): the same code, also for parts behind a table's end (P6).
      let again;
      try {
        again = share.encode(d.content, { tables, carry: d.carry });
      } catch (e) {
        again = `error ${e.message}`;
      }
      const expected = v.code.startsWith('PW3-') ? v.code : `PW3-${v.code}`;
      if (ok(again === expected, `${v.name}: written back ${again} vs ${expected}`)) carried++;
    }
    if (failed === before) pass++;
  }
  // Without the carry, a code with a part behind a table's end can't be written (UNKNOWN_ENTRIES).
  const p6 = goldenPw3.vectors.find((v) => v.name.startsWith('P6_'));
  const d6 = share.decode(p6.code, { tables: goldenContext('extra') });
  let status = null;
  try {
    share.encode(d6.content, { tables: goldenContext('extra') });
  } catch (e) {
    status = e.status;
  }
  ok(status === 'UNKNOWN_ENTRIES', `P6 without carry: ${status} vs UNKNOWN_ENTRIES`);
  console.log(`Golden PW3 (pw3-vectors.json): ${pass}/${goldenPw3.vectors.length} read like the mod, ${encoded} encoded and ${carried} written back byte-identically`);
}

// 1c. Golden conversions PW1/PW2 → PW3, against the frozen context and the catalog's own conversion
{
  const g = golden['pw3-conversions.json'];
  const frozen = goldenContext('frozen');
  let pass = 0;
  let converted = 0;
  for (const v of g.vectors) {
    const before = failed;
    const r = share.convert(v.from, frozen);
    ok(r.status === v.status && r.code === v.pw3 && r.reason === v.reason, `${v.name}: ${r.status} ${r.code} ${r.reason} vs ${v.status} ${v.pw3} ${v.reason}`);
    const viaCatalog = catalog.convert(v.from);
    ok(viaCatalog.code === v.pw3 && viaCatalog.status === v.status, `${v.name}: catalog conversion ${viaCatalog.code}`);
    if (r.code) {
      converted++;
      ok(r.converted, `${v.name}: marked as converted`);
      const again = share.convert(r.code, frozen);
      ok(again.code === r.code && again.status === 'OK' && !again.converted, `${v.name}: converting the PW3 code again gives it back`);
      const old = share.decode(v.from, { tables: frozen, renames: false });
      const now = share.decode(r.code, { tables: frozen, renames: false });
      compareContent(now.content, old.content, `${v.name} (PW3 content)`);
    }
    if (failed === before) pass++;
  }
  console.log(`Golden conversions (pw3-conversions.json): ${pass}/${g.vectors.length} like the mod (${converted} converted byte-identically, idempotent, same content)`);
}

// 1e. Golden creative values (PW3 revision 3.1, extension 0) and PWD1 codes of the drone editor
{
  const g = golden['pw3-creative-vectors.json'];
  const frozen = goldenContext('frozen');
  let pass = 0;
  let encoded = 0;
  let converted = 0;
  ok(g.revision === pw3.PW3_REVISION, `creative vectors of revision ${g.revision}, the site writes ${pw3.PW3_REVISION}`);
  for (const v of g.vectors) {
    const before = failed;
    const code = v.code || v.from;
    const d = share.decode(code, { tables: frozen });
    ok(d.status === v.status, `${v.name}: status ${d.status} vs ${v.status}`);
    ok(d.format === (v.from ? 'PWD1' : 'PW3'), `${v.name}: format ${d.format}`);
    ok(same(d.layers, v.layers || ['parts', 'creative']), `${v.name}: layers ${d.layers}`);
    if (v.skipped) ok(same(d.skipped, v.skipped), `${v.name}: skipped ${d.skipped}`);
    compareContent(d.content, v.content, v.name);
    compareCreative(d.content && d.content.creative, v.creative, v.name);
    if (v.code) {
      let again;
      try {
        again = share.encode({ ...v.content, creative: v.creative }, { tables: frozen });
      } catch (e) {
        again = `error ${e.message}`;
      }
      if (ok(again === v.code, `${v.name}: encoded ${again} vs ${v.code}`)) encoded++;
      if (d.ok) ok(share.encode(d.content, { tables: frozen, carry: d.carry }) === v.code, `${v.name}: written back unchanged`);
      for (const spelling of tolerantSpellings(v.code)) compareCreative(share.decode(spelling, { tables: frozen }).content?.creative, v.creative, `${v.name} (tolerant input)`);
      ok(share.convert(v.code, frozen).code === v.code, `${v.name}: a PW3 code with creative values is only checked`);
    } else {
      const r = share.convert(v.from, frozen);
      ok(r.status === 'OK' && r.format === 'PWD1' && r.code === v.pw3 && r.converted, `${v.name}: converted ${r.status} ${r.format} ${r.code} vs ${v.pw3}`);
      ok(catalog.convert(v.from).code === v.pw3, `${v.name}: catalog conversion`);
      if (r.code) {
        converted++;
        const now = share.decode(r.code, { tables: frozen });
        ok(same(now.layers, ['parts', 'creative']) && now.format === 'PW3', `${v.name}: PW3 layers ${now.layers}`);
        compareContent(now.content, v.content, `${v.name} (PW3)`);
        compareCreative(now.content && now.content.creative, v.creative, `${v.name} (PW3)`);
        const again = share.convert(r.code, frozen);
        ok(again.code === r.code && !again.converted, `${v.name}: converting the PW3 code again gives it back`);
      }
    }
    if (failed === before) pass++;
  }
  console.log(`Golden creative values (pw3-creative-vectors.json): ${pass}/${g.vectors.length} like the mod (${encoded} written byte-identically, ${converted} PWD1 codes converted)`);
}

// 1f. PWD1 codes of the drone editor with every edge the mod's reader has (pwd1-vectors.json), random creative values
{
  const before = failed;
  const frozen = goldenContext('frozen');
  let pass = 0;
  for (const v of pwd1Vectors.vectors) {
    const start = failed;
    const d = share.decode(v.code, { tables: frozen });
    ok(d.status === v.status && d.format === v.format, `PWD1 ${v.name}: ${d.status} ${d.format} vs ${v.status} ${v.format}`);
    ok(same(d.layers, v.layers) && same(d.skipped, v.skipped), `PWD1 ${v.name}: layers ${d.layers}, skipped ${d.skipped}`);
    compareCreative(d.ok ? d.content.creative : null, v.creative, `PWD1 ${v.name}`);
    const r = share.convert(v.code, frozen);
    ok(r.status === v.convert_status && r.code === v.pw3 && r.reason === v.reason, `PWD1 ${v.name}: conversion ${r.status} ${r.code} vs ${v.convert_status} ${v.pw3}`);
    if (failed === start) pass++;
  }
  // Random creative values: decimal and raw numbers, table and text keys, base parts through a head and as text.
  let seed = 0x5eed1234;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return seed / 4294967296;
  };
  const view = new DataView(new ArrayBuffer(8));
  const randomNumber = () => {
    const pick = rand();
    if (pick < 0.3) return Math.round((rand() - 0.5) * 10 ** Math.floor(rand() * 7)) / 10 ** Math.floor(rand() * 4);
    if (pick < 0.5) return Number(((rand() - 0.5) * 1e4).toFixed(Math.floor(rand() * 16)));
    if (pick < 0.6) return [0, -0, 1, -1, 0.1, 1e-300, 5e-324, 1.7976931348623157e308, 2 ** 40, -(2 ** 40) + 1, 0.30000000000000004][Math.floor(rand() * 11)];
    for (;;) {
      view.setUint32(0, Math.floor(rand() * 4294967296));
      view.setUint32(4, Math.floor(rand() * 4294967296));
      const x = view.getFloat64(0);
      if (Number.isFinite(x)) return x;
    }
  };
  const tableKeys = pw3.CREATIVE_KEYS || ['frame.mass_g'];
  const baseKinds = pw3.CREATIVE_BASE_KINDS || ['frame'];
  const editorBuild = pw3.PWD1_BUILD || golden['pw3-creative-vectors.json'].vectors[0].content.build;
  const textKeys = ['future.lift', 'otheraddon:arm.length', 'größe', 'motor.kv2', 'a', 'x'.repeat(128)];
  const bases = ['whoop_65', 'justmoreparts:p13_2b', 'propwash:p51_3b', 'otheraddon:motor_x', 'b6s_1300', 'freestyle_5'];
  let roundTrips = 0;
  for (let i = 0; i < 3000; i++) {
    const values = {};
    const n = Math.floor(rand() * 12);
    for (let k = 0; k < n; k++) {
      const key = rand() < 0.75 ? tableKeys[Math.floor(rand() * tableKeys.length)] : textKeys[Math.floor(rand() * textKeys.length)];
      values[key] = randomNumber();
    }
    const base = {};
    for (const kind of baseKinds) if (rand() < 0.3) base[kind] = bases[Math.floor(rand() * bases.length)];
    const content = { build: { ...editorBuild, accessories: {} }, creative: { base, values } };
    let code;
    try {
      code = share.encode(content, { tables: frozen });
    } catch (e) {
      code = null;
      ok(false, `random creative ${i}: ${e.message}`);
      continue;
    }
    const d = share.decode(code, { tables: frozen });
    const want = { base: Object.fromEntries(baseKinds.filter((k) => k in base).map((k) => [k, base[k]])),
      values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v === 0 ? 0 : v])) };
    if (ok(d.ok && same(d.layers, ['parts', 'creative']), `random creative ${i}: ${d.status} ${d.layers}`) && compareCreative(d.content.creative, want, `random creative ${i}`)
      && ok(share.encode(d.content, { tables: frozen }) === code, `random creative ${i}: written back unchanged`)) roundTrips++;
  }
  // Codes without creative values stay byte-identical to revision 3.0; an empty creative layer is still a layer.
  const plain = share.encode({ build: { ...editorBuild, accessories: {} } }, { tables: frozen });
  ok(same(share.decode(plain, { tables: frozen }).layers, ['parts']) && share.decode(plain, { tables: frozen }).content.creative === null, 'no creative values: no layer');
  console.log(`PWD1 codes (pwd1-vectors.json): ${pass}/${pwd1Vectors.vectors.length} like the mod; ${roundTrips}/3000 random creative values `
    + `written and read back bit for bit${failed === before ? '' : ' – FAILED'}`);
}

// 1d. Table checksums and the frozen table orders
{
  const before = failed;
  const g = golden['tablechecksum-vectors.json'];
  for (const v of g.vectors) {
    const lines = v.lines.map((line) => {
      const [kind, number, ...rest] = line.split(':');
      return { kind, number: Number(number), path: rest.join(':') };
    });
    ok(pw3.tableChecksum(lines) === v.checksum, `table checksum ${v.name}: ${pw3.tableChecksum(lines)} vs ${v.checksum}`);
  }
  const order = (table) => Object.fromEntries(Object.entries(table.parts).map(([kind, list]) => [kind, list.map((e) => e.id)]));
  const frozenOrder = (file, ns) => golden[file].namespaces[ns];
  const startsWith = (actual, base) => Object.entries(base).every(([kind, ids]) => same((actual[kind] || []).slice(0, ids.length), ids));
  ok(startsWith(order(propwashTable), frozenOrder('propwash-baseline.json', 'propwash')), 'Propwash table: only appended to the frozen order');
  const jmp = directory.addons.find((a) => a.namespace === 'justmoreparts');
  ok(jmp && startsWith(order(jmp.table), frozenOrder('directory-baseline.json', 'justmoreparts')), 'directory table of Just More Parts: only appended to the frozen order');
  if (catalog.json.sharecode.tables.justmoreparts) {
    ok(startsWith(order(catalog.json.sharecode.tables.justmoreparts), frozenOrder('directory-baseline.json', 'justmoreparts')),
      'table of Just More Parts: only appended to the frozen order');
  }
  for (const ns of catalog.namespaces) {
    const table = catalog.json.sharecode.tables[ns.namespace];
    if (!table || !ns.table_crc) continue;
    const lines = [];
    for (const [kind, list] of Object.entries(table.parts)) list.forEach((e, i) => lines.push(`${kind}:${i + 1}:${e.id}\n`));
    const sorted = lines.map((l) => l.split(':')).sort((a, b) => (pw3.KINDS.indexOf(a[0]) - pw3.KINDS.indexOf(b[0])) || (a[1] - b[1])).map((p) => p.join(':'));
    const text = new TextEncoder().encode(sorted.join(''));
    let c = 0xffffffff;
    for (const b of text) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    ok(((c ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0') === ns.table_crc, `${ns.namespace}: table_crc of the export`);
  }
  // The copies equal the mod's golden files (when a Propwash checkout is at hand).
  const source = process.env.PROPWASH_SHARECODE_GOLDENS || path.resolve(ROOT, '../propwash/common/src/test/resources/sharecode');
  let compared = 0;
  if (fs.existsSync(path.join(source, 'pw3-vectors.json'))) {
    for (const f of GOLDEN_FILES) {
      ok(fs.readFileSync(path.join(source, f)).equals(fs.readFileSync(path.join(ROOT, 'tools/fixtures/sharecode', f))), `golden file ${f} equals the mod's`);
      compared++;
    }
  }
  console.log(`Table checksums and frozen orders: ${failed === before ? 'all like the mod' : 'FAILED'}`
    + `${compared ? `; ${compared} golden files byte-identical to ${path.relative(ROOT, source)}` : '; golden files not compared (no Propwash checkout, PROPWASH_SHARECODE_GOLDENS)'}`);
}

// 2. PW3 vectors of the web export (the presets, with check and analysis)
{
  let pass = 0;
  let analysed = 0;
  for (const v of exportVectors) {
    const before = failed;
    const d = catalog.decode(v.code);
    ok(d.status === v.status && d.format === v.format, `${v.name}: ${d.status} ${d.format}`);
    ok(same(d.layers, v.layers), `${v.name}: layers ${d.layers} vs ${v.layers}`);
    ok(same(d.skipped, v.skipped), `${v.name}: skipped`);
    ok(same(d.unknownParts, v.unknown_parts), `${v.name}: unknown parts ${d.unknownParts}`);
    ok(same(d.namespaces.map((n) => ({ key: n.namespace, short_id: n.short_id, table: n.table, min_version: n.min_version, result: n.result })), v.namespaces),
      `${v.name}: namespaces ${JSON.stringify(d.namespaces)}`);
    compareContent(d.content, v.decoded, v.name);
    if (d.ok) ok(catalog.encode(d.content) === v.code, `${v.name}: written ${catalog.encode(d.content)} vs ${v.code}`);
    if (v.check) compareCheck(catalog.check(v.decoded.build), v.check, v.name);
    if (v.analysis) {
      analysed++;
      compareAnalysis(catalog.analyze(v.decoded.build), v.analysis, v.name, catalogHeat);
    }
    if (failed === before) pass++;
  }
  console.log(`Export vectors (pw3-export-vectors.json): ${pass}/${exportVectors.length} read and written like the game, ${analysed} analyses compared`);
}

// 3. Vectors of Just More Parts 1.1.1 (PW1 and PW2 with check and analysis of Propwash 0.5.2)
// The export of 1.1.1 wrote a PW2 part number behind the table as '?<kind>.<n>'; the mod now says 'pw2.unknown:…'.
const legacyId = (id) => (/^\?[a-z]+\.\d+$/.test(id) ? `pw2.unknown:${id.slice(1)}` : id);
const legacyBuild = (b) => (b ? { ...Object.fromEntries(Object.entries(b).map(([k, v]) => [k, typeof v === 'string' ? legacyId(v) : v])), accessories: b.accessories } : b);
{
  let pass = 0;
  let byte = 0;
  let byteTotal = 0;
  let converted = 0;
  let analysed = 0;
  for (const v of legacyVectors) {
    const before = failed;
    const expected = v.decoded ? { ...v.decoded, build: legacyBuild(v.decoded.build) } : null;
    const d = catalog.decode(v.code);
    ok(d.status === v.status, `${v.name}: status ${d.status} vs ${v.status}`);
    ok(same(d.layers, v.layers), `${v.name}: layers ${d.layers} vs ${v.layers}`);
    ok(same(d.skipped, v.skipped), `${v.name}: skipped ${d.skipped} vs ${v.skipped}`);
    ok(same(d.unknownParts, v.unknown_parts.map(legacyId)), `${v.name}: unknown parts ${d.unknownParts} vs ${v.unknown_parts}`);
    ok(same(d.wrongKind, v.wrong_kind), `${v.name}: wrong kind ${d.wrongKind} vs ${v.wrong_kind}`);
    ok(same(d.renamed, v.renamed), `${v.name}: renamed`);
    compareContent(d.content, expected, v.name);
    if (d.ok && v.skipped.length === 0) {
      byteTotal++;
      if (ok(share.encode(d.content, { format: v.format || 'PW1', compression: v.compression || 'auto' }) === v.code, `${v.name}: re-encoded byte-identically`)) byte++;
    }
    if (d.ok) {
      const c = catalog.convert(v.code);
      if (c.status === 'OK') {
        converted++;
        const now = catalog.decode(c.code);
        ok(now.ok && same(now.content.build, d.content.build) && same(now.content.paint, d.content.paint) && same(now.content.name, d.content.name),
          `${v.name}: PW3 ${c.code} keeps the build`);
        ok(now.ok && same(now.unknownParts, d.unknownParts), `${v.name}: PW3 keeps the unknown parts`);
      } else {
        ok(c.status === 'NOT_CONVERTIBLE' && d.unknownParts.some((id) => id.startsWith('pw2.unknown:') || id.startsWith('pw1.unknown.')),
          `${v.name}: only hand-made unknown numbers stay unconverted (${c.status} ${c.reason})`);
      }
    }
    if (v.check) compareCheck(catalog.check(expected.build), v.check, v.name);
    if (v.analysis) {
      analysed++;
      compareAnalysis(catalog.analyze(expected.build), v.analysis, v.name, false);
    } else if (d.ok && v.unknown_parts.length === 0 && v.wrong_kind.length === 0) {
      ok(catalog.analyze(d.content.build) === null, `${v.name}: analysis should be null`);
    }
    if (d.ok && v.unknown_parts.length) {
      ok(catalog.analyze(d.content.build) === null, `${v.name}: analysis must be null with unknown parts`);
      ok(same(catalog.check(d.content.build).problems, ['missing_part']), `${v.name}: missing_part expected`);
    }
    if (failed === before) pass++;
  }
  console.log(`Just More Parts 1.1.1 vectors: ${pass}/${legacyVectors.length} fully passed, ${byte}/${byteTotal} re-encoded byte-identically, `
    + `${converted} converted to PW3 with the same build, ${analysed} analyses compared without the heat model of 0.5.2`);
}

// 4. Report vectors
{
  let pass = 0;
  for (const v of reportVectors) {
    const before = failed;
    const d = catalog.decode(v.code);
    ok(d.ok, `${v.name}: decodes (${d.status})`);
    if (d.ok) {
      ok(same(d.content.build, v.build), `${v.name}: build ${JSON.stringify(d.content.build)}`);
      ok(same(d.layers, v.layers), `${v.name}: layers ${d.layers}`);
      ok(share.encode(d.content, { format: share.formatOf(v.code) }) === v.code, `${v.name}: re-encoded byte-identically`);
      const c = catalog.convert(v.code);
      ok(c.status === 'OK' && same(catalog.decode(c.code).content.build, v.build), `${v.name}: PW3 ${c.code} with the same build`);
      if (v.preset) {
        ok(catalog.preset(v.preset) && share.encode(catalog.presetContent(v.preset), { format: share.formatOf(v.code) }) === v.code,
          `${v.name}: is preset ${v.preset}`);
      }
      const analysis = catalog.analyze(d.content.build);
      compareAnalysis(analysis, v.analysis, v.name);
      if (v.analysis_before && analysis) {
        // Recalibrated energy balance (Propwash 0.4.0): the flight physics stays bit-identical, only the energy
        // figures (flight times, pack currents, motor temperatures) change.
        // The top speed is left out since Propwash 0.5.0: the climb thrust after momentum theory moves it slightly.
        for (const key of ['mass_grams', 'thrust_to_weight', 'hover_throttle_percent', 'esc_load_percent',
          'motor_response_ms', 'crash_speed_ms', 'props_in_view_percent']) {
          sameNumber(analysis[key], v.analysis_before[key], `${v.name}: ${key} unchanged by the recalibration`);
        }
        for (const key of ['hover_flight_time_min', 'cruise_flight_time_min', 'full_throttle_current_a', 'sustained_motor_temp_c']) {
          ok(Math.abs(analysis[key] - v.analysis_before[key]) > 1e-6, `${v.name}: ${key} recalibrated (${analysis[key]} vs before ${v.analysis_before[key]})`);
        }
      }
      const view = catalog.cameraView(d.content.build);
      compareCameraView(view, v.camera_view, v.name);
      if (v.game && view) {
        // What the game rendered for this build: the analysis at the captured image size must match the counted
        // pixels, and the configurator must never say 0 % where the game shows props (the reported 0.0 %).
        const r = view.rig;
        const [w, h] = v.game.image;
        const percent = occlusionPercent(r, r.tilt, r.fov, w / h, h);
        ok(Math.abs(percent - v.game.analysis_percent) < 0.005, `${v.name}: ${percent.toFixed(3)} % at ${w} x ${h} vs game analysis ${v.game.analysis_percent} %`);
        ok(Math.abs(percent - v.game.rendered_percent) < 0.25, `${v.name}: ${percent.toFixed(3)} % vs rendered ${v.game.rendered_percent} %`);
        if (v.game.rendered_percent > 0) {
          const shown = catalog.analyze(d.content.build).props_in_view_percent;
          ok(shown >= 0.05 && shown > v.game.reported_percent, `${v.name}: shows ${shown.toFixed(2)} % while the game shows props (reported ${v.game.reported_percent} %)`);
          ok(view.props_in_view_percent >= 0.05, `${v.name}: camera preview ${view.props_in_view_percent.toFixed(2)} % while the game shows props`);
        }
      }
    }
    if (failed === before) pass++;
  }
  console.log(`Report vectors: ${pass}/${reportVectors.length} (decode, layers, build, re-encode, PW3, analysis, FPV camera, against the game's image)`);
}

// 5. Presets: PW3 share code, check and analysis of the export
{
  let presetPass = 0;
  for (const preset of catalog.presets) {
    const before = failed;
    const content = catalog.presetContent(preset.id);
    const code = catalog.encode(content);
    ok(code === preset.sharecode, `preset ${preset.id}: share code ${code} vs ${preset.sharecode}`);
    ok(share.formatOf(code) === 'PW3', `preset ${preset.id}: PW3`);
    compareContent(catalog.decode(code).content, catalog.decode(preset.sharecode).content, `preset ${preset.id}: PW3`);
    compareCheck(catalog.check(content.build), preset.check, `preset ${preset.id}`);
    compareAnalysis(catalog.analyze(content.build), preset.analysis, `preset ${preset.id}`, catalogHeat);
    if (failed === before) presetPass++;
  }
  console.log(`Presets: ${presetPass}/${catalog.presets.length} (PW3 share code, check, analysis)`);
}

// 5b. Camera: field of view from the camera in the video unit, uptilt range of the frame's camera mount (Propwash 0.4.0,
// FovMath.cameraHorizontalDegrees and CameraMount). The export's ranges must equal the frame-class rule of the port.
{
  const before = failed;
  let frames = 0;
  let videos = 0;
  for (const video of catalog.partsIn('video')) {
    const d = video.data;
    const expected = Number.isFinite(d.camera_fov_deg) ? Math.min(160, Math.max(60, d.camera_fov_deg)) : d.link === 'digital' ? 130 : 120;
    ok(cameraFov(video) === expected, `${video.id}: camera FOV ${cameraFov(video)} vs ${expected}`);
    ok(Number.isFinite(d.camera_fov_deg), `${video.id}: every video unit names its camera FOV`);
    videos++;
  }
  for (const frame of catalog.partsIn('frame')) {
    const camera = frame.data.camera || {};
    const range = mountRange(frame);
    const rule = mountRange({ data: { role: frame.data.role, camera: { tilt_deg: camera.tilt_deg } } });
    ok(Number.isFinite(camera.tilt_min_deg) && Number.isFinite(camera.tilt_max_deg), `${frame.id}: export names the camera mount range`);
    ok(range.min === rule.min && range.max === rule.max && range.standard === rule.standard,
      `${frame.id}: mount range ${range.min}–${range.max} vs frame class ${rule.min}–${rule.max}`);
    ok(range.min <= range.standard && range.standard <= range.max, `${frame.id}: default uptilt inside the mount`);
    ok(droneUptilt(range, {}) === range.standard, `${frame.id}: no own angle means the frame default`);
    ok(droneUptilt(range, { 'camera.uptiltDeg': 200 }) === range.max && droneUptilt(range, { 'camera.uptiltDeg': -5 }) === range.min,
      `${frame.id}: own angle clamped to the mount`);
    frames++;
  }
  for (const preset of catalog.presets) {
    const build = catalog.presetBuild(preset.id);
    const view = catalog.cameraView(build);
    if (!view) continue;
    ok(view.horizontal_fov_deg === cameraFov(catalog.part(build.video)), `${preset.id}: preview FOV is the camera's`);
    ok(view.uptilt_min_deg <= view.uptilt_deg && view.uptilt_deg <= view.uptilt_max_deg, `${preset.id}: uptilt inside the mount`);
  }
  console.log(`Camera: ${videos} video units with their FOV, ${frames} frames with their mount range, ${failed === before ? 'all passed' : 'FAILED'}`);
}

// 5c. Flight tune defaults per preset (tune.json#defaults) and stored preset tunes as fixed points of normalisation
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

// 5d. Paint swatches (PaintSwatch): a swatch paints its RGB value, so its code equals the one of the same custom colour
{
  const before = failed;
  ok(PAINT_SWATCHES.length === 21 && PAINT_SWATCHES.filter((s) => s.finish).map((s) => s.key).join() === 'carbon,gunmetal,aluminium,gold,copper',
    'paint swatches: 16 dyes, then the 5 finishes');
  const base = catalog.presetContent(catalog.presets[0].id);
  for (const swatch of PAINT_SWATCHES) {
    const paint = Object.fromEntries(share.PAINT_SLOTS.map((slot) => [slot, swatch.hex]));
    const code = catalog.encode({ ...base, paint });
    const back = catalog.decode(code);
    ok(back.ok && same(back.content.paint, paint), `swatch ${swatch.key}: paint round-trips through the share code`);
    ok(code === catalog.encode({ ...base, paint: Object.fromEntries(share.PAINT_SLOTS.map((slot) => [slot, `#${swatch.rgb.toString(16).padStart(6, '0').toUpperCase()}`])) }),
      `swatch ${swatch.key}: same code as the custom colour`);
    ok(swatchOf(swatch.hex) === swatch && swatchOf(swatch.rgb) === swatch, `swatch ${swatch.key}: byColor`);
  }
  console.log(`Paint swatches: ${PAINT_SWATCHES.length} ${failed === before ? 'round-trip through the share code' : 'FAILED'}`);
}

// 5e. Random paint schemes: every slot painted with a swatch or a tone of the scheme's accent, valid RGB, round trip
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
    const back = catalog.decode(catalog.encode({ ...base, paint }));
    ok(back.ok && same(back.content.paint, paint), `random paint ${i}: round-trips through the share code`);
  }
  ok(seen.size > runs * 0.9, `random paint: schemes differ (${seen.size} of ${runs})`);
  ok(customs > 0 && customs < runs * 0.35, `random paint: custom tones are the exception (${customs} of ${runs})`);
  ok(alternating > runs * 0.25 && alternating < runs * 0.75, `random paint: props sometimes alike, sometimes front/rear (${alternating} of ${runs})`);
  console.log(`Random paint: ${runs} schemes ${failed === before ? `valid and round-trip (${seen.size} different, ${alternating} front/rear, ${customs} with a custom tone)` : 'FAILED'}`);
}

function crcOf(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

// 6. Tolerant reading and error statuses
{
  const before = failed;
  const pw1Vectors = golden['pw1-vectors.json'].vectors;
  const pw2Vectors = golden['pw2-vectors.json'].vectors;
  const a = pw1Vectors.find((v) => v.name === 'A_parts_only');
  const p2 = pw2Vectors.find((v) => v.name === 'PW2_A_parts_only');
  const p1 = goldenPw3.vectors.find((v) => v.name.startsWith('P1_'));
  const expectStatus = (code, status, what) => ok(catalog.decode(code).status === status, `status ${what}: ${catalog.decode(code).status} vs ${status}`);
  expectStatus('', 'EMPTY', 'empty');
  expectStatus('  \n\t ', 'EMPTY', 'blank');
  expectStatus(null, 'EMPTY', 'null');
  expectStatus('XW1-04002', 'INVALID_PREFIX', 'wrong prefix');
  expectStatus('hello world', 'INVALID_PREFIX', 'text');
  expectStatus('PW1-04002-GR1U', 'BAD_CHARACTER', 'U');
  expectStatus('PW1-04002-GR1*', 'BAD_CHARACTER', 'star');
  expectStatus('PW1-' + '0'.repeat(4001), 'TOO_LONG', 'over 4000 characters');
  expectStatus('PW1-' + ' '.repeat(65537), 'TOO_LONG', 'over 65536 characters before the blanks go');
  expectStatus('PW1-00000', 'TRUNCATED', 'short frame');
  expectStatus(a.code.slice(0, -6), 'CHECKSUM', 'cut code');
  expectStatus(pw1Vectors.find((v) => v.name === 'F_checksum_error').code, 'CHECKSUM', 'vector F');
  expectStatus('PW1' + a.code.slice(4), 'OK', 'no dash after prefix');
  expectStatus(`  ${a.code.replace(/-/g, ' ')}  `, 'OK', 'no-break spaces');
  expectStatus(a.code.toLowerCase(), 'OK', 'lower case');
  // PW1 frame with a wrong version byte / reserved flag (valid CRC) and hostile payloads.
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
  // PW2
  expectStatus(p2.code, 'OK', 'PW2 vector A');
  expectStatus(`PW2-${p2.code.slice(3)}`, 'OK', 'PW2 with a dash');
  expectStatus('pw9-abc', 'UNSUPPORTED_VERSION', 'PW9');
  expectStatus('PW4-02lVAldkcxCBH', 'UNSUPPORTED_VERSION', 'PW4');
  expectStatus(`PWX${p2.code.slice(3)}`, 'INVALID_PREFIX', 'PWX');
  expectStatus(`${p2.code.slice(0, 8)}_${p2.code.slice(9)}`, 'BAD_CHARACTER', 'underscore in PW2');
  expectStatus('PW2', 'TRUNCATED', 'PW2 alone');
  expectStatus('PW20000', 'TRUNCATED', 'PW2 symbol count without byte length');
  expectStatus(`PW2${'z'.repeat(pw2.symbolsFor(5))}`, 'CORRUPT', 'PW2 number too large');
  expectStatus(`PW2${'0'.repeat(pw2.symbolsFor(2501))}`, 'TOO_LARGE', 'PW2 frame over 2500 bytes');
  ok(catalog.decode(p2.code.toLowerCase()).status !== 'OK', 'PW2 is case-sensitive');
  // PW3 (pw3.md 1): prefix in any case, dashes and blanks anywhere, a bare body; other codes of Propwash.
  expectStatus(p1.code, 'OK', 'PW3 vector P1');
  expectStatus(`pw3${p1.code.slice(4)}`, 'OK', 'PW3 lower case, no dash');
  expectStatus(` PW3-${p1.code.slice(4, 9)}-${p1.code.slice(9)} `, 'OK', 'PW3 in groups');
  expectStatus(p1.code.slice(4), 'OK', 'bare PW3 body');
  expectStatus(`${p1.code.slice(4, 10)}x${p1.code.slice(11)}`, 'INVALID_PREFIX', 'damaged bare body');
  expectStatus(`PW3-${p1.code.slice(4, 10)}#${p1.code.slice(11)}`, 'BAD_CHARACTER', 'PW3 with #');
  expectStatus('PW3-', 'TRUNCATED', 'PW3 alone');
  expectStatus(`PW3-${'0'.repeat(pw2.symbolsFor(2501))}`, 'TOO_LARGE', 'PW3 frame over 2500 bytes');
  expectStatus('PWT1-abc', 'OTHER_CODE', 'tuning preset code');
  ok(!share.OTHER_CODES.includes('PWD1'), 'drone editor codes are read (PW3 revision 3.1), not another kind of code');
  expectStatus('pwd1abc', 'CORRUPT', 'drone editor code without its dash');
  expectStatus('PWD1-abc', 'CORRUPT', 'damaged drone editor code');
  expectStatus('PWD1-AwA', 'OK', 'empty drone editor code');
  ok(catalog.decode('PWT1-abc').format === 'PWT1' && catalog.decode('PWD1-abc').format === 'PWD1', 'other codes name their kind');
  const editor = catalog.decode(golden['pw3-creative-vectors.json'].vectors.find((v) => v.name.startsWith('D1_')).from);
  ok(editor.ok && editor.format === 'PWD1' && editor.unknownParts.length === 0 && editor.content.build.stack === 'propwash:creative_fc',
    `a drone editor code opens with the creative flight controller, not as an unknown part (${editor.unknownParts})`);
  ok(share.formatOf(p1.code) === 'PW3' && share.formatOf(p1.code.slice(4)) === 'PW3' && share.formatOf(a.code) === 'PW1' && share.formatOf(p2.code) === 'PW2',
    'formatOf');
  // Compressed payload that inflates past 16384 bytes, and large OSD layouts in every format.
  const base = pw1Vectors[0].content.build;
  const big = { build: base, name: 'x', osd: { version: 1, json: 'a'.repeat(8192) } };
  ok(catalog.decode(share.encode(big, { format: 'PW1', compression: 'always' })).status === 'OK', 'large OSD round trip');
  ok(catalog.decode(share.encode(big, { format: 'PW2' })).status === 'OK', 'large OSD round trip (PW2)');
  ok(catalog.decode(catalog.encode(big)).status === 'OK', 'large OSD round trip (PW3)');
  // Unknown PW1 namespace number: kept when re-encoding, carried by PW2, not convertible to PW3.
  const mystery = 'pw1.unknown.7:mystery_frame';
  const foreign = share.encode({ build: { ...base, frame: mystery } }, { format: 'PW1', compression: 'never' });
  const fd = catalog.decode(foreign);
  ok(fd.ok && fd.content.build.frame === mystery && same(fd.skipped, ['namespace:7']) && same(fd.unknownParts, [mystery]), 'unknown namespace number');
  ok(share.encode(fd.content, { format: 'PW1', compression: 'never' }) === foreign, 'unknown namespace re-encoded identically');
  const foreign2 = catalog.decode(share.encode(fd.content, { format: 'PW2' }));
  ok(foreign2.ok && foreign2.content.build.frame === mystery && same(foreign2.unknownParts, [mystery]), 'unknown namespace carried by PW2');
  ok(same([catalog.convert(foreign).status, catalog.convert(foreign).reason], ['NOT_CONVERTIBLE', 'pw1_unknown:7']), 'unknown namespace not convertible');
  // Unknown PW2 part numbers of a newer table stay and travel on in PW2.
  const marker = { build: { ...base, frame: `pw2.unknown:frame.${PW2_PARTS.frame.length + 9}` } };
  const md = catalog.decode(share.encode(marker, { format: 'PW2' }));
  ok(md.ok && md.content.build.frame === marker.build.frame && same(md.unknownParts, [marker.build.frame])
    && same(md.skipped, [`part_index:frame.${PW2_PARTS.frame.length + 9}`]), 'unknown PW2 part number');
  let threw = false;
  try {
    share.encode({ build: { ...base, frame: 'pw2.unknown:frame.3' } }, { format: 'PW2' });
  } catch {
    threw = true;
  }
  ok(threw, 'PW2 refuses a marker for a known part number');
  // Wrong kind: a motor id in the frame field.
  const wrong = catalog.decode(catalog.encode({ build: { ...base, frame: 'propwash:m2207_1750' } }));
  ok(same(wrong.wrongKind, ['propwash:m2207_1750']) && wrong.unknownParts.length === 0, 'wrong kind reported');
  // A part of an add-on this page does not know: written by name, read back as unknown, the add-on reported missing.
  const addon = catalog.decode(catalog.encode({ build: { ...base, accessories: { top: 'otheraddon:x_cam' } } }));
  ok(addon.ok && same(addon.unknownParts, ['otheraddon:x_cam']) && addon.namespaces.some((n) => n.namespace === 'otheraddon' && n.result === 'MISSING'),
    'add-on part of a missing add-on');
  // -0.0 and non-scalable values travel raw, values stay float32.
  const tuned = catalog.decode(catalog.encode({ build: base, tune: { 'pid.roll.p': -0, 'rates.roll.rcRate': 1 / 3 } }));
  ok(Object.is(tuned.content.tune['pid.roll.p'], -0) && tuned.content.tune['rates.roll.rcRate'] === Math.fround(1 / 3), 'raw float32 tune values');
  // Keys outside the flight groups and the camera angle are dropped on encode; the camera angle travels.
  const noVtx = catalog.decode(catalog.encode({ build: base, tune: { 'vtx.channel': 3, 'camera.uptiltDeg': 20, 'led.mode': 2, 'pid.airmode': 1 } }));
  ok(same(Object.keys(noVtx.content.tune), ['camera.uptiltDeg', 'pid.airmode']), 'only flight keys and the camera angle encoded');
  ok(noVtx.content.tune['camera.uptiltDeg'] === 20, 'camera angle decoded');
  // Name is stripped, empty name and empty paint are dropped.
  const named = catalog.decode(catalog.encode({ build: base, name: '  Hallo Welt  ', paint: {} }));
  ok(named.content.name === 'Hallo Welt' && same(named.layers, ['parts', 'name']), 'name strip, empty paint dropped');
  // Share links.
  ok(share.codeFromHash('#' + encodeURIComponent(a.code)) === a.code && share.codeFromHash('#foo') === null, 'share link hash (PW1)');
  ok(share.codeFromHash('#' + p2.code) === p2.code && share.codeFromHash('#' + p1.code) === p1.code, 'share link hash (PW2, PW3)');
  ok(share.shareLink(p1.code, 'https://example.org/propwash/configurator/#old') === `https://example.org/propwash/configurator/#${p1.code}`, 'share link');
  // Never an exception: damaged and random input.
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  let calm = true;
  for (let i = 0; i < 3000; i++) {
    const src = [p1.code, p2.code, a.code][i % 3];
    const chars = [...src];
    const n = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) chars[Math.floor(rnd() * chars.length)] = pw2.BASE62[Math.floor(rnd() * 62)];
    try {
      const r = catalog.decode(chars.join(''));
      if (typeof r.status !== 'string') calm = false;
      catalog.convert(chars.join(''));
    } catch {
      calm = false;
    }
  }
  ok(calm, 'damaged codes never throw');
  console.log(`Decoder edge cases: ${failed === before ? 'all passed' : 'FAILED'}`);
}

// 7. The converter: codes in running text, replaced in place
{
  const before = failed;
  const pick = (name) => golden['pw3-conversions.json'].vectors.find((v) => v.name === name);
  const oldPw2 = pick('PW2/preset/justmoreparts:bash5_6s/preset') || golden['pw3-conversions.json'].vectors.find((v) => v.from_format === 'PW2' && v.pw3);
  const oldPw1 = pick('PW1/A_parts_only');
  const damaged = pick('PW2/PW2_F_checksum_error');
  const handMade = pick('PW2/PW2_E_tolerant_skips');
  const p1 = goldenPw3.vectors.find((v) => v.name.startsWith('P1_'));
  const post = [
    'My first 5″ build, flies great!',
    `Code: \`${oldPw2.from}\``,
    `Old link: https://propwashfpv.com/configurator/#${oldPw2.from}`,
    `PW1 version: ${oldPw1.from}`,
    `broken one: ${damaged.from} and a hand-made one (${handMade.from}).`,
    `Already new: ${p1.code} — have fun!`,
    'Not a code: aPW2xyz inside a word, xPW1-AAAAA.',
    'Hier mein PW3-Code und die PW2-Codes, siehe PW3-Sharecode-Format und PW1-Codes.',
  ].join('\n');
  const found = findCodes(post).filter((f) => !f.word);
  ok(same(found.map((f) => f.code), [oldPw2.from, oldPw2.from, oldPw1.from, damaged.from, handMade.from, p1.code]),
    `codes found in a post: ${found.map((f) => f.code).join(' ')}`);
  ok(same(findCodes(post).filter((f) => f.word).map((f) => f.code), ['PW2-Codes', 'PW3-Sharecode-Format', 'PW1-Codes']),
    'hyphenated words that start like a code are marked as words');
  const r = convertText(post, catalog);
  const expected = post.split(oldPw2.from).join(oldPw2.pw3).replace(oldPw1.from, oldPw1.pw3);
  ok(r.text === expected, `post converted in place:\n${r.text}`);
  ok(r.text.includes(`https://propwashfpv.com/configurator/#${oldPw2.pw3}`), 'a link becomes a PW3 link');
  const kinds = Object.fromEntries(r.codes.map((c) => [c.from, c.kind]));
  ok(kinds[oldPw2.from] === 'converted' && kinds[oldPw1.from] === 'converted' && kinds[damaged.from] === 'damaged'
    && kinds[handMade.from] === 'not_convertible' && kinds[p1.code] === 'pw3', `kinds ${JSON.stringify(kinds)}`);
  ok(r.codes.find((c) => c.from === oldPw2.from).count === 2, 'a code twice in the text counts twice');
  ok(r.codes.find((c) => c.from === damaged.from).status === 'CHECKSUM', 'damaged code keeps its status');
  ok(r.codes.find((c) => c.from === handMade.from).reason === 'pw2_unknown:frame.200', 'hand-made code: reason');
  const pw3Row = r.codes.find((c) => c.from === p1.code);
  ok(pw3Row.code === p1.code && pw3Row.role === 'freestyle' && pw3Row.frame === 'propwash:freestyle_5', 'PW3 code checked, with its class');
  const again = convertText(r.text, catalog);
  ok(again.text === r.text && again.codes.every((c) => c.kind !== 'converted'), 'converting the result again changes nothing');
  // At most MAX_CODES per pass.
  const many = Array.from({ length: MAX_CODES + 7 }, () => oldPw1.from).join('\n');
  const capped = convertText(many, catalog);
  ok(capped.found === MAX_CODES + 7 && capped.skipped === 7 && capped.text.split(oldPw1.pw3).length - 1 === MAX_CODES
    && capped.text.split(oldPw1.from).length - 1 === 7, `at most ${MAX_CODES} codes per pass`);
  ok(convertText('', catalog).found === 0 && convertText('no codes here', catalog).found === 0, 'text without codes');
  ok(convertText('Mein PW3-Code folgt, die alten PW2-Codes gelten weiter.', catalog).found === 0, 'words like “PW3-Code” are no codes');
  // Every golden code is found as exactly itself in running text (also those whose body happens to look like words).
  let goldenFound = 0;
  const allCodes = [...golden['pw1-vectors.json'].vectors, ...golden['pw2-vectors.json'].vectors, ...goldenPw3.vectors].map((v) => v.code)
    .filter((c) => /^PW[123]/.test(c));
  for (const code of allCodes) {
    const r = convertText(`Code: ${code}!`, catalog);
    const wanted = catalog.decode(code).ok || !findCodes(code)[0].word;
    if (ok(r.found === (wanted ? 1 : 0) && (!wanted || r.codes[0].from === code), `golden code found in text: ${code.slice(0, 20)}…`)) goldenFound++;
  }
  // Real codes (local file, never in the repository).
  const realFile = process.env.PROPWASH_DISCORD_CODES;
  let real = 0;
  if (realFile && fs.existsSync(realFile)) {
    for (const line of fs.readFileSync(realFile, 'utf8').split('\n')) {
      const code = line.split('\t')[0].trim();
      if (!code) continue;
      const c = catalog.convert(code);
      const oldBuild = catalog.decode(code).content;
      ok(c.status === 'OK' && oldBuild && same(catalog.decode(c.code).content.build, oldBuild.build) && catalog.decode(c.code).unknownParts.length === 0,
        `real code ${code.slice(0, 12)}…: ${c.status}`);
      real++;
    }
  }
  console.log(`Converter: ${failed === before ? `codes found (${goldenFound} golden codes in running text), converted in place, idempotent` : 'FAILED'}`
    + `${real ? `; ${real} real codes converted with the same build` : ''}`);
}

// 7a. PWD1 codes of the drone editor in running text: found, converted to PW3 with their creative values
{
  const before = failed;
  const creative = golden['pw3-creative-vectors.json'].vectors;
  const d1 = creative.find((v) => v.name.startsWith('D1_'));
  const d3 = creative.find((v) => v.name.startsWith('D3_'));
  const c1 = creative.find((v) => v.name.startsWith('C1_'));
  const post = [
    `My creative whoop: ${d1.from}`,
    `and the other one (${d3.from}).`,
    `Already new: ${c1.code}`,
    'Not a code: xPWD1-AwA, the PWD1-Code of the editor, PWD1- and PWD1-ab.',
  ].join('\n');
  const found = findCodes(post).filter((f) => !f.word);
  ok(same(found.map((f) => [f.code, f.format]), [[d1.from, 'PWD1'], [d3.from, 'PWD1'], [c1.code, 'PW3']]), `PWD1 codes found: ${found.map((f) => f.code).join(' ')}`);
  const r = convertText(post, catalog);
  ok(r.text === post.replace(d1.from, d1.pw3).replace(d3.from, d3.pw3), `PWD1 codes converted in place:\n${r.text}`);
  const rows = Object.fromEntries(r.codes.map((c) => [c.from, c]));
  ok(rows[d1.from] && rows[d1.from].kind === 'converted' && rows[d1.from].format === 'PWD1' && rows[d1.from].code === d1.pw3 && rows[d1.from].unknown.length === 0,
    `PWD1 row: ${JSON.stringify(rows[d1.from] && { kind: rows[d1.from].kind, format: rows[d1.from].format, unknown: rows[d1.from].unknown })}`);
  ok(rows[d1.from] && same(rows[d1.from].creative, { values: 3, base: 2 }) && rows[c1.code] && rows[c1.code].kind === 'pw3' && same(rows[c1.code].creative, { values: 3, base: 2 }),
    'converter rows count the creative values and base parts');
  ok(convertText(r.text, catalog).codes.every((c) => c.kind !== 'converted'), 'converting the result again changes nothing');
  ok(rows[d3.from] && rows[d3.from].creative && rows[d3.from].creative.values === 2, 'unknown creative keys travel on');
  const broken = convertText(`broken: ${d1.from.slice(0, 40)}`, catalog);
  ok(broken.codes.length === 1 && broken.codes[0].kind === 'damaged' && broken.codes[0].format === 'PWD1', 'a cut PWD1 code is damaged');
  console.log(`Converter, drone editor codes: ${failed === before ? 'PWD1 codes found in running text and converted to PW3 with their creative values' : 'FAILED'}`);
}

// 7b. Add-ons an opened PW3 code needs that this page has not loaded: written again with what the code says about them
{
  const before = failed;
  const tables = catalog.shareTables();
  const missing = (d) => d.namespaces.filter((n) => n.result === 'MISSING').map((n) => [n.namespace, n.min_version, n.name, n.link_type, n.link]);
  let kept = 0;
  const names = ['P4_', 'P5_', 'P8_', 'P9_'];
  for (const prefix of names) {
    const v = goldenPw3.vectors.find((x) => x.name.startsWith(prefix));
    const d = catalog.decode(v.code);
    const write = (content) => catalog.encode(content, { carry: d.carry, tables: withCodeAddons(tables, codeAddons(d.namespaces)) });
    ok(d.ok && missing(d).length === 1, `${v.name}: one add-on missing on this page (${JSON.stringify(missing(d))})`);
    if (ok(write(d.content) === v.code, `${v.name}: written again on this page ${write(d.content)} vs ${v.code}`)) kept++;
    const changed = catalog.decode(write({ ...d.content, name: 'Cov Kept' }));
    ok(changed.ok && changed.content.name === 'Cov Kept' && same(missing(changed), missing(d)),
      `${v.name}: a changed build still names ${JSON.stringify(missing(d))} (${JSON.stringify(missing(changed))})`);
  }
  const p4 = goldenPw3.vectors.find((x) => x.name.startsWith('P4_'));
  const d4 = catalog.decode(p4.code);
  ok(same([...codeAddons(d4.namespaces)], [['otheraddon', { version: '2.1.0', name: 'Other Addon', homepage: 'https://modrinth.com/mod/other-addon' }]]),
    `P4: the add-on of the code ${JSON.stringify([...codeAddons(d4.namespaces)])}`);
  const p9 = catalog.decode(goldenPw3.vectors.find((x) => x.name.startsWith('P9_')).code);
  ok(same([...codeAddons(p9.namespaces)], [['betaaddon', { version: '1.3.0-beta.1', name: 'Beta Addon', homepage: 'https://www.curseforge.com/minecraft/mc-mods/beta-addon' }]]),
    `P9: the add-on of the code ${JSON.stringify([...codeAddons(p9.namespaces)])}`);
  const p8 = catalog.decode(goldenPw3.vectors.find((x) => x.name.startsWith('P8_')).code);
  ok(same([...codeAddons(p8.namespaces)], [['freeaddon', { version: '0.3.0', name: 'Free Addon', homepage: 'https://example.org/free-addon' }]]),
    `P8: the add-on of the code ${JSON.stringify([...codeAddons(p8.namespaces)])}`);
  const stale = new Map([['otheraddon', { version: '9.9.9', name: 'Stale Name', homepage: null }]]);
  ok(share.encode(p4.encode_content, { tables: withCodeAddons(goldenContext('extra'), stale) }) === p4.code, 'a loaded add-on keeps the version and name of the page');
  ok(withCodeAddons(tables, new Map()) === tables && withCodeAddons(tables, null) === tables, 'no add-ons from a code: the tables as they are');
  ok(codeAddons(catalog.decode(goldenPw3.vectors.find((x) => x.name.startsWith('P1_')).code).namespaces).size === 0, 'a code without missing add-ons brings none along');
  console.log(`Add-ons of an opened code: ${failed === before ? `${kept}/${names.length} codes written again byte-identically, also after a change` : 'FAILED'}`);
}

// 8. Figure explanations and builds for beginners
{
  const before = failed;
  const classes = statHelp.classes;
  const roles = new Set(catalog.partsIn('frame').map((f) => f.data.role));
  ok(same([...roles].sort(), [...classes].sort()), `stathelp.json: the classes of the frames ${[...roles]}`);
  const languages = activeLanguages();
  for (const key of STAT_KEYS) {
    const text = entry(`statHelp.${key}`);
    ok(Array.isArray(text) && text[0] && text[1] && text[0] !== text[1], `statHelp.${key}: English and German text`);
    ok(Array.isArray(entry(`stats.${key}`)), `stats.${key}: label and unit`);
    for (const lang of languages) {
      const dict = loadDict(lang.code);
      ok(Array.isArray(text) && !!dict.entries[normalize(text[0])], `statHelp.${key}: ${lang.code} translation`);
    }
  }
  for (const [key, ranges] of Object.entries(statHelp.stats)) {
    ok(STAT_KEYS.includes(key), `stathelp.json: ${key} is a figure of the analysis`);
    for (const cls of classes) {
      const r = ranges[cls];
      ok(Array.isArray(r) && r.length === 2 && Number.isFinite(r[0]) && Number.isFinite(r[1]) && r[0] < r[1], `stathelp.json: ${key} range for ${cls}`);
    }
  }
  const inside = (value, range) => value >= range[0] - 1e-9 && value <= range[1] + 1e-9;
  ok(beginner.builds.length === 3, 'three builds for beginners');
  for (const b of beginner.builds) {
    const preset = catalog.preset(b.preset);
    if (!ok(preset, `${b.preset}: preset exists`)) continue;
    ok(b.preset.startsWith('propwash:'), `${b.preset}: runs without add-ons`);
    ok(Object.values(catalog.presetBuild(b.preset)).flat().every((id) => typeof id !== 'string' || id.startsWith('propwash:'))
      && Object.values(catalog.presetBuild(b.preset).accessories).every((id) => id.startsWith('propwash:')), `${b.preset}: only Propwash parts`);
    const check = catalog.check(preset.build);
    ok(check.problems.length === 0 && check.warnings.length === 0, `${b.preset}: no problems or warnings ${JSON.stringify(check)}`);
    const a = catalog.analyze(preset.build);
    ok(a && a.warnings.length === 0, `${b.preset}: analysis without warnings ${a && a.warnings}`);
    const role = catalog.part(preset.build.frame).data.role;
    for (const [key, ranges] of Object.entries(statHelp.stats)) {
      ok(a && inside(a[key], ranges[role]), `${b.preset}: ${key} ${a && a[key]} inside the ${role} range ${ranges[role]}`);
    }
    ok(fs.existsSync(path.join(ROOT, 'assets/data/configurator', b.image)), `${b.preset}: picture ${b.image}`);
    const text = entry(`beginner.${b.preset}`);
    ok(Array.isArray(text) && text[0] && text[1], `${b.preset}: text in English and German`);
    for (const lang of languages) ok(Array.isArray(text) && !!loadDict(lang.code).entries[normalize(text[0])], `${b.preset}: ${lang.code} translation`);
    ok(catalog.encode(catalog.presetContent(b.preset)) === preset.sharecode, `${b.preset}: code written now equals the export's`);
  }
  for (const key of beginner.figures) ok(STAT_KEYS.includes(key) && Array.isArray(entry(`keyStats.${key}`)), `beginner figure ${key}`);
  // How many presets lie inside the class ranges (information for whoever tunes the ranges).
  let total = 0;
  let outside = 0;
  for (const preset of catalog.presets) {
    const role = catalog.part(preset.build.frame).data.role;
    for (const [key, ranges] of Object.entries(statHelp.stats)) {
      total++;
      if (!inside(preset.analysis[key], ranges[role])) outside++;
    }
  }
  console.log(`Figure explanations: ${STAT_KEYS.length} figures in English, German${languages.length ? ` and ${languages.map((l) => l.code).join(', ')}` : ''}, `
    + `${Object.keys(statHelp.stats).length} with a range for ${classes.length} classes; builds for beginners ${failed === before ? 'without warnings and inside their class' : 'FAILED'}`
    + ` (all presets: ${total - outside}/${total} figures inside the range of their class)`);
}

// 9. Tables and analysis variants from the web export (optional)
{
  const dir = exportDir(argv);
  if (fs.existsSync(path.join(dir, 'manifest.json')) && JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).format === 2) {
    const { manifest, namespaces } = readExport(dir);
    const spec = JSON.parse(fs.readFileSync(path.join(dir, 'base/sharecode/spec.json'), 'utf8'));
    {
      const before = failed;
      const revisions = pw3.PW3_REVISIONS || [pw3.PW3_REVISION];
      ok(spec.code_format === pw3.PW3_FORMAT && spec.prefix === pw3.PW3_PREFIX && revisions.includes(spec.revision)
        && revisions.indexOf(spec.revision) <= revisions.indexOf(pw3.PW3_REVISION), `PW3 spec: format, prefix, revision ${spec.revision}`);
      if (spec.creative) {
        const c = spec.creative;
        const params = pw3.CREATIVE_PARAMS || {};
        const limits = pw3.CREATIVE_LIMITS || {};
        ok(c.extension === pw3.CREATIVE_EXTENSION && c.layer_bit === pw3.CREATIVE_LAYER_BIT && same(c.base_kinds, pw3.CREATIVE_BASE_KINDS)
          && same(c.keys, pw3.CREATIVE_KEYS) && c.pwd1_prefix === share.PWD1_PREFIX && same(c.pwd1_build, pw3.PWD1_BUILD), 'PW3 spec: creative values (revision 3.1)');
        ok(spec.params.creative_namespace === params.namespace && spec.params.creative_count === params.count
          && spec.params.creative_gap === params.gap && spec.params.creative_literal_count === params.literalCount
          && spec.params.creative_decimals === params.decimals && spec.params.creative_value === params.value, 'PW3 spec: creative Exp-Golomb parameters');
        ok(spec.limits.creative_values === limits.values && spec.limits.creative_key_chars === limits.keyChars
          && spec.limits.creative_decimals === limits.decimals && spec.limits.creative_mantissa_bits === limits.mantissaBits
          && spec.limits.extensions === pw3.PW3_LIMITS.extensions, 'PW3 spec: creative limits');
        const layer = spec.layers.find((l) => l.key === 'creative');
        ok(layer && layer.bit === pw3.CREATIVE_LAYER_BIT, 'PW3 spec: layer creative');
      }
      ok(spec.alphabet === pw2.BASE62 && spec.id_alphabet === pw3.ID_ALPHABET && spec.text_alphabet === pw2.TEXT_ALPHABET, 'PW3 spec: alphabets');
      const p = spec.params;
      ok(p.namespace_count === pw3.PW3_PARAMS.namespaceCount && p.short_id === pw3.PW3_PARAMS.shortId && p.part === pw3.PW3_PARAMS.part
        && p.id_text === pw3.PW3_PARAMS.idText && p.version === pw3.PW3_PARAMS.version && p.accessory_count === pw3.PW3_PARAMS.accessoryCount
        && p.accessory_slot === pw3.PW3_PARAMS.accessorySlot && p.table_checksum_bits === pw3.TABLE_CHECKSUM_BITS && p.color === pw2.PW2_PARAMS.color
        && p.paint_slots === pw2.PW2_PARAMS.paintSlots && p.tune_count === pw2.PW2_PARAMS.tuneCount && p.value === pw2.PW2_PARAMS.value
        && p.text === pw2.PW2_PARAMS.text && p.osd_bytes === pw2.PW2_PARAMS.osdBytes && p.extension_bits === pw2.PW2_PARAMS.extensionBits, 'PW3 spec: Exp-Golomb parameters');
      const l = spec.limits;
      ok(l.namespaces === pw3.PW3_LIMITS.namespaces && l.namespace_chars === pw3.PW3_LIMITS.namespaceChars && l.path_chars === pw3.PW3_LIMITS.pathChars
        && l.slug_chars === pw3.PW3_LIMITS.slugChars && l.link_chars === pw3.PW3_LIMITS.linkChars && l.frame_bytes === pw3.PW3_LIMITS.frameBytes
        && l.version_suffix_chars === pw3.PW3_LIMITS.versionSuffixChars && l.addon_name_chars === pw3.PW3_LIMITS.addonNameChars
        && l.accessories === pw3.PW3_LIMITS.accessories && l.input_chars === share.LIMITS.inputChars, 'PW3 spec: limits');
      ok(same(spec.kinds, pw3.KINDS) && same(spec.accessory_slots, share.ACCESSORY_SLOTS) && same(spec.paint_slots, share.PAINT_SLOTS), 'PW3 spec: kinds and slots');
      ok(same(spec.tune_keys, pw2.PW2_TUNE_KEYS), 'PW3 spec: tune keys');
      ok(same(spec.colors, PW2_COLORS.map((c) => '#' + c.toString(16).padStart(6, '0'))), 'PW3 spec: colour table');
      ok(same([...new TextEncoder().encode(spec.osd_dictionary)], [...PW2_OSD_DICTIONARY]), 'PW3 spec: OSD dictionary');
      ok(same(spec.propwash_table, catalog.json.sharecode.tables.propwash), 'PW3 spec: Propwash table as in the catalog');
      ok(same(spec.namespace_results, pw3.RESULTS), 'PW3 spec: namespace results');
      if (spec.pw2) {
        ok(same(spec.pw2.parts, PW2_PARTS), 'PW2 spec: part tables');
        ok(same(spec.pw2.tune_keys, pw2.PW2_TUNE_KEYS), 'PW2 spec: tune keys');
      }
      console.log(`PW3 and PW2 tables against the web export: ${failed === before ? 'identical' : 'FAILED'}`);
    }
    const before = failed;
    let count = 0;
    let cameraViews = 0;
    for (const ns of namespaces) {
      const presetsFile = JSON.parse(fs.readFileSync(path.join(dir, ns, 'presets.json'), 'utf8'));
      for (const exported of presetsFile) {
        const file = path.join(dir, ns, 'analysis', `${exported.id.split(':')[1]}.json`);
        if (!ok(fs.existsSync(file), `analysis file for ${exported.id}`)) continue;
        const analysis = JSON.parse(fs.readFileSync(file, 'utf8'));
        compareCameraView(catalog.cameraView(catalog.presetBuild(exported.id)), exported.camera_view, `preset ${exported.id}`);
        compareCameraView(catalog.cameraView(catalog.presetBuild(exported.id)), analysis.camera_view, `${exported.id} (analysis file)`);
        if (analysis.camera_view || exported.camera_view) cameraViews++;
        for (const variant of analysis.variants) {
          const build = catalog.presetBuild(exported.id);
          if (variant.category === 'accessory') build.accessories[catalog.part(variant.id).data.slot] = variant.id;
          else build[variant.category] = variant.id;
          const where = `${exported.id} + ${variant.id}`;
          compareCheck(catalog.check(build), variant.check, where);
          compareAnalysis(catalog.analyze(build), variant.analysis, where, atLeast(manifest.propwash, HEAT_SINCE));
          if (variant.camera_view) {
            compareCameraView(catalog.cameraView(build), variant.camera_view, where);
            cameraViews++;
          }
          count++;
        }
      }
    }
    console.log(`Analysis variants (web export ${manifest.generator}): ${count} builds, ${cameraViews} FPV cameras, ${failed === before ? 'all passed' : 'FAILED'}`);
  } else {
    console.log('Web export (format 2) not found: tables and analysis variants skipped (use --export <dir> or JMP_WEB_EXPORT)');
  }
}

// 10. Heat model of Propwash 0.6.0 against the game
{
  const before = failed;
  const src = heatVectors.source;
  ok(src.web_export_format === 2 && atLeast(src.mods.propwash, HEAT_SINCE), `heat vectors from a web export of Propwash ${HEAT_SINCE} or later (${src.generator})`);
  ok(same(heatVectors.keys, HEAT_KEYS), 'heat vectors: keys');
  const text = catalog.rules.analysis_warnings.find((w) => w.key === 'motor_thermal');
  ok(text && same(text.text, heatVectors.motor_thermal), `heat warning text of the game: ${text && JSON.stringify(text.text)}`);
  let motors = 0;
  for (const motor of catalog.partsIn('motor')) {
    const expected = heatVectors.motors[motor.id];
    if (!ok(expected, `${motor.id}: thermal data in the heat vectors`)) continue;
    ok(same(motor.data.thermal, expected), `${motor.id}: thermal data ${JSON.stringify(motor.data.thermal)} vs the game's ${JSON.stringify(expected)}`);
    motors++;
  }
  for (const preset of catalog.presets) {
    const group = heatVectors.presets.find((g) => g.id === preset.id);
    ok(group && same(group.build, catalog.presetBuild(preset.id)), `${preset.id}: preset in the heat vectors with the same build`);
  }
  let builds = 0;
  let hot = 0;
  let escOnly = 0;
  const count = (build, heat, warnings) => {
    builds++;
    if (!warnings.includes('motor_thermal')) return;
    hot++;
    if (!(heat[0] > heatVectors.motors[build.motor].derate_start_c)) escOnly++;
  };
  for (const group of heatVectors.presets) {
    compareHeat(catalog.analyze(group.build), group.heat, group.warnings, `heat ${group.id}`);
    count(group.build, group.heat, group.warnings);
    for (const [category, id, ...rest] of group.variants) {
      const build = structuredClone(group.build);
      if (category === 'accessory') build.accessories[catalog.part(id).data.slot] = id;
      else build[category] = id;
      const warnings = rest.pop();
      compareHeat(catalog.analyze(build), rest, warnings, `heat ${group.id} + ${id}`);
      count(build, rest, warnings);
    }
  }
  for (const b of heatVectors.builds) {
    compareHeat(catalog.analyze(b.build), b.heat, b.warnings, `heat ${b.name}`);
    count(b.build, b.heat, b.warnings);
  }
  ok(hot > 0 && escOnly > 0, `heat vectors cover the warning from the motors (${hot - escOnly}) and from the ESC alone (${escOnly})`);
  console.log(`Heat (${src.generator}, ${src.generated_at}): ${builds} builds, ${hot} with the heat warning (${escOnly} from the ESC alone), `
    + `${motors} motors, ${failed === before ? 'all like the game' : 'FAILED'}`);
}

console.log(`Analysis figures: ${stats.analysisValues} compared, ${stats.exactValues} bit-identical, max relative deviation ${stats.maxRel.toExponential(2)}${stats.maxRel ? ` at ${stats.maxRelAt}` : ''}`);
console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}: ${passed} checks passed, ${failed} failed`);
if (failed && quiet) for (const f of failures.slice(0, 40)) console.log(`  ${f}`);
process.exit(failed === 0 ? 0 : 1);
