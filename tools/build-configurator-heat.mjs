#!/usr/bin/env node
// Writes the heat figures of the game (Propwash 0.6.0 and later) into tools/fixtures/heat-vectors.json for
// tools/test-configurator.mjs, read from a web export in format 2 (Propwash 0.6.0).
//
//   node tools/build-configurator-heat.mjs --export <web-export dir>     (or JMP_WEB_EXPORT)
//
// 0.6.0 changed the workbench heat model (20 °C instead of 25 °C, motor cooling by the bell size, eddy-current losses,
// the ESC heats up and its temperature counts for the heat warning) and nothing else of the analysis. catalog.json
// still comes from the format-1 export of Propwash 0.5.2, so the heat figures of the game are kept here until the
// catalog is built from a 0.6.0 export: every preset of the export, every one-part-swapped variant of its analysis files
// and every share-code vector with an analysis, each with the three motor temperatures and the warnings, plus the
// thermal data of every motor and the text of the heat warning. Both are also written into
// assets/data/configurator/catalog.json (0.6.0 gave the 1404 4600 KV motor of the Cinewhoop and the 1505 3600 KV motor
// of Just More Parts their own cooling and the warning a new text); everything else of the catalog stays as it is.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportDir } from './build-configurator-data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tools/fixtures/heat-vectors.json');
const CATALOG = path.join(ROOT, 'assets/data/configurator/catalog.json');

export const HEAT_KEYS = Object.freeze(['sustained_motor_temp_c', 'motor_temp_minute_c', 'mixed_motor_temp_c']);

const read = (dir, file) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));

/** True if version a (e.g. "0.6.0-dev.5") is at least b ("0.6.0"); pre-release suffixes are ignored. */
export function atLeast(a, b) {
  const x = String(a || '0').split('-')[0].split('.').map((n) => Number.parseInt(n, 10) || 0);
  const y = String(b).split('-')[0].split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d > 0;
  }
  return true;
}

const buildKey = (b) => JSON.stringify({ ...b, accessories: Object.fromEntries(Object.entries(b.accessories || {}).sort()) },
  ['frame', 'stack', 'motor', 'prop', 'video', 'battery', 'accessories', 'top', 'bottom']);

const heatOf = (a) => HEAT_KEYS.map((k) => a[k]);

export function buildHeat(dir) {
  const manifest = read(dir, 'manifest.json');
  if (manifest.format !== 2) throw new Error(`web export format ${manifest.format}, expected 2 (Propwash 0.6.0)`);
  if (!atLeast(manifest.propwash, '0.6.0')) throw new Error(`web export of Propwash ${manifest.propwash}, expected 0.6.0 or later`);
  const parts = new Map();
  const presets = [];
  const files = [];
  for (const ns of manifest.namespaces) {
    for (const p of read(dir, `${ns}/parts.json`)) parts.set(p.id, p);
    for (const p of read(dir, `${ns}/presets.json`)) presets.push(p);
    const analysisDir = path.join(dir, ns, 'analysis');
    if (fs.existsSync(analysisDir)) {
      for (const f of fs.readdirSync(analysisDir).filter((x) => x.endsWith('.json')).sort()) files.push(read(analysisDir, f));
    }
  }
  presets.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const seen = new Map();
  const remember = (build, analysis, where) => {
    const key = buildKey(build);
    const known = seen.get(key);
    if (known && JSON.stringify(known.a) !== JSON.stringify(analysis)) throw new Error(`${where}: other analysis than ${known.where}`);
    if (!known) seen.set(key, { a: analysis, where });
  };

  const groups = [];
  for (const preset of presets) {
    if (!preset.analysis) continue;
    remember(preset.build, preset.analysis, preset.id);
    const group = { id: preset.id, build: preset.build, heat: heatOf(preset.analysis), warnings: preset.analysis.warnings, variants: [] };
    const file = files.find((f) => f.preset === preset.id);
    for (const v of file ? file.variants : []) {
      if (!v.analysis) continue;
      const build = structuredClone(preset.build);
      if (v.category === 'accessory') build.accessories[parts.get(v.id).data.slot] = v.id;
      else build[v.category] = v.id;
      remember(build, v.analysis, `${preset.id} + ${v.id}`);
      group.variants.push([v.category, v.id, ...heatOf(v.analysis), v.analysis.warnings]);
    }
    groups.push(group);
  }

  const builds = [];
  for (const v of read(dir, 'base/sharecode/vectors.json')) {
    if (!v.analysis || !v.decoded) continue;
    const known = seen.has(buildKey(v.decoded.build));
    remember(v.decoded.build, v.analysis, v.name);
    if (!known) builds.push({ name: v.name, build: v.decoded.build, heat: heatOf(v.analysis), warnings: v.analysis.warnings });
  }

  const motors = {};
  for (const p of [...parts.values()].filter((x) => x.category === 'motor').sort((a, b) => (a.id < b.id ? -1 : 1))) motors[p.id] = p.data.thermal;
  const warning = read(dir, 'base/rules.json').analysis_warnings.find((w) => w.key === 'motor_thermal');

  return {
    source: {
      web_export_format: manifest.format,
      generator: manifest.generator,
      generated_at: manifest.generated_at,
      mods: manifest.mods,
      propwash_api: manifest.propwash_api,
      fingerprint: manifest.fingerprint,
    },
    keys: HEAT_KEYS,
    motor_thermal: warning ? warning.text : null,
    motors,
    presets: groups,
    builds,
  };
}

/** One preset group, vector and motor per line, so a new export shows as a readable diff. */
export function formatHeat(heat) {
  const j = JSON.stringify;
  const lines = ['{'];
  lines.push(` "source": ${j(heat.source)},`);
  lines.push(` "keys": ${j(heat.keys)},`);
  lines.push(` "motor_thermal": ${j(heat.motor_thermal)},`);
  lines.push(' "motors": {');
  const motors = Object.entries(heat.motors);
  motors.forEach(([id, t], i) => lines.push(`  ${j(id)}: ${j(t)}${i < motors.length - 1 ? ',' : ''}`));
  lines.push(' },');
  lines.push(' "presets": [');
  heat.presets.forEach((g, i) => {
    lines.push(`  {"id": ${j(g.id)}, "build": ${j(g.build)}, "heat": ${j(g.heat)}, "warnings": ${j(g.warnings)}, "variants": [`);
    g.variants.forEach((v, k) => lines.push(`   ${j(v)}${k < g.variants.length - 1 ? ',' : ''}`));
    lines.push(`  ]}${i < heat.presets.length - 1 ? ',' : ''}`);
  });
  lines.push(' ],');
  lines.push(' "builds": [');
  heat.builds.forEach((b, i) => lines.push(`  ${j(b)}${i < heat.builds.length - 1 ? ',' : ''}`));
  lines.push(' ]');
  lines.push('}');
  return lines.join('\n') + '\n';
}

/** Takes the thermal data of every motor and the text of the heat warning into the catalog; returns what changed. */
export function refreshCatalog(catalog, heat) {
  const changed = [];
  for (const part of catalog.parts) {
    const thermal = part.category === 'motor' ? heat.motors[part.id] : null;
    if (thermal && JSON.stringify(part.data.thermal) !== JSON.stringify(thermal)) {
      part.data.thermal = thermal;
      changed.push(part.id);
    }
  }
  const warning = catalog.rules.analysis_warnings.find((w) => w.key === 'motor_thermal');
  if (warning && heat.motor_thermal && JSON.stringify(warning.text) !== JSON.stringify(heat.motor_thermal)) {
    warning.text = heat.motor_thermal;
    changed.push('analysis_warnings.motor_thermal');
  }
  return changed;
}

function main() {
  const dir = exportDir();
  if (!fs.existsSync(path.join(dir, 'manifest.json'))) {
    console.error(`web export not found in ${dir} (use --export <dir> or JMP_WEB_EXPORT)`);
    process.exit(1);
  }
  const heat = buildHeat(dir);
  fs.writeFileSync(OUT, formatHeat(heat));
  const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  const changed = refreshCatalog(catalog, heat);
  if (changed.length) fs.writeFileSync(CATALOG, JSON.stringify(catalog) + '\n');
  const variants = heat.presets.reduce((n, g) => n + g.variants.length, 0);
  console.log(`heat-vectors.json: ${heat.presets.length} presets, ${variants} variants, ${heat.builds.length} other builds, `
    + `${Object.keys(heat.motors).length} motors (${heat.source.generator}, ${heat.source.generated_at})`);
  console.log(`catalog.json: ${changed.length ? `heat data taken over (${changed.join(', ')})` : 'heat data already current'}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
