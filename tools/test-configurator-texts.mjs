#!/usr/bin/env node
// Texts of the web configurator agree with the data it shows and the model it calculates with (findings AUTO9-1 and
// AUTO9-2, from G-P1-V12-4):
//   - part help of the motors in catalog.json describes the heat model of Propwash 0.6.0: no motor throttles or
//     derates any more (only the ESC throttles back), a temperature from which a motor loses power is its
//     thermal.derate_start_c, and a temperature after one minute, e.g. “(81 °C after 1 min)”, is what the analysis
//     beside it calculates for the presets with that motor (in ducts: on a ducted frame), the same as the game's
//     figure in tools/fixtures/heat-vectors.json
//   - the parts of an add-on carry the names and help of the hosted export of the same add-on version under
//     assets/data/addons/<namespace>/<version>/, so the catalog never keeps the texts of an older export
//   - every dictionary that translates a motor help line with a temperature keeps its numbers
//   - the configurator page names the export its data come from: the intro of the flight analysis and “About this
//     page” name the Propwash version of catalog.source, “About this page” also the version of Just More Parts, and
//     no other version of either appears on the page; the intro names the reference temperature of analysis.js
//   - every dictionary that translates the intro or “About this page” keeps these versions and the temperature
//
//   node tools/test-configurator-texts.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCatalog } from '../assets/js/configurator/data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readJson = (rel) => JSON.parse(read(rel));
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

let checks = 0;
const failures = [];
const notes = [];
const check = (ok, message) => {
  checks++;
  if (!ok) failures.push(message);
  return !!ok;
};

const json = readJson('assets/data/configurator/catalog.json');
const catalog = createCatalog(json);
const partById = new Map(json.parts.map((p) => [p.id, p]));
const motors = json.parts.filter((p) => p.category === 'motor');
const release = (v) => String(v || '').split('-')[0];
const helpLines = (help) => [help.summary, ...(help.what || []), ...(help.use || [])].filter((s) => typeof s === 'string');

const OLD_MODEL = {
  en_us: [/(?<!full[ -])\bthrottl\w*/i, /\bderat\w*/i],
  de_de: [/drossel\w*/i],
};
const DERATE = { en_us: /\bfrom (\d+) °C/g, de_de: /\bab (\d+) °C/g };
const MINUTE = { en_us: /\((\d+) °C after 1 min\)/g, de_de: /\((\d+) °C nach 1 min\)/g };
const DUCT = { en_us: /\bducts?\b/i, de_de: /\bDuct/ };

let helpChecked = 0;
let minuteClaims = 0;
let derateClaims = 0;
const heatVectors = exists('tools/fixtures/heat-vectors.json') ? readJson('tools/fixtures/heat-vectors.json') : null;
const gameMinute = new Map();
if (heatVectors) {
  const at = heatVectors.keys.indexOf('motor_temp_minute_c');
  for (const g of heatVectors.presets) gameMinute.set(g.id, g.heat[at]);
}

for (const motor of motors) {
  const thermal = motor.data && motor.data.thermal;
  for (const [lang, help] of Object.entries(motor.help || {})) {
    if (!OLD_MODEL[lang]) continue;
    for (const line of helpLines(help)) {
      helpChecked++;
      for (const re of OLD_MODEL[lang]) {
        const m = re.exec(line);
        check(!m, `${motor.id} ${lang}: help describes the heat model before Propwash 0.6.0 (“${line}”), only the ESC throttles back now`);
      }
      for (const m of line.matchAll(DERATE[lang])) {
        derateClaims++;
        check(thermal && Number(m[1]) === thermal.derate_start_c,
          `${motor.id} ${lang}: “${line}” names ${m[1]} °C, thermal.derate_start_c is ${thermal && thermal.derate_start_c}`);
      }
      for (const m of line.matchAll(MINUTE[lang])) {
        minuteClaims++;
        const claimed = Number(m[1]);
        const ducted = DUCT[lang].test(line);
        const presets = json.presets.filter((p) => p.build.motor === motor.id
          && (!ducted || (partById.get(p.build.frame) && partById.get(p.build.frame).data.duct)));
        check(presets.length > 0, `${motor.id} ${lang}: “${line}” – no preset with this motor${ducted ? ' on a ducted frame' : ''} to check it against`);
        for (const preset of presets) {
          const a = catalog.analyze(preset.build);
          const shown = a && a.motor_temp_minute_c;
          check(Number.isFinite(shown) && Math.round(shown) === claimed,
            `${motor.id} ${lang}: “${line}” says ${claimed} °C, the analysis of ${preset.id} beside it calculates ${Number.isFinite(shown) ? shown.toFixed(1) : shown} °C`);
          if (gameMinute.has(preset.id)) {
            const game = gameMinute.get(preset.id);
            check(Math.round(game) === claimed, `${motor.id} ${lang}: “${line}” says ${claimed} °C, the game gives ${game.toFixed(1)} °C for ${preset.id} (heat-vectors.json)`);
          }
        }
      }
    }
  }
}
check(helpChecked > 0, 'catalog.json has motors with help texts');

let hostedParts = 0;
for (const [ns, version] of Object.entries((json.source && json.source.mods) || {})) {
  if (ns === 'propwash') continue;
  const dir = `assets/data/addons/${ns}/${release(version)}`;
  if (!exists(`${dir}/parts.json`)) {
    notes.push(`no hosted export ${dir}/parts.json to compare the texts of ${ns} ${version} with`);
    continue;
  }
  const manifest = readJson(`${dir}/manifest.json`);
  check(release(manifest.mod && manifest.mod.version) === release(version),
    `${dir}: hosted export of ${ns} ${manifest.mod && manifest.mod.version}, the catalog comes from ${version}`);
  for (const hosted of readJson(`${dir}/parts.json`)) {
    hostedParts++;
    const part = partById.get(hosted.id);
    if (!check(part, `${hosted.id}: in the hosted export of ${ns} ${version}, missing in catalog.json`)) continue;
    check(JSON.stringify(part.name) === JSON.stringify(hosted.name), `${hosted.id}: name in catalog.json differs from the hosted export of ${ns} ${version}`);
    for (const lang of new Set([...Object.keys(part.help || {}), ...Object.keys(hosted.help || {})])) {
      const mine = (part.help || {})[lang];
      const theirs = (hosted.help || {})[lang];
      if (JSON.stringify(mine) === JSON.stringify(theirs)) {
        check(true);
        continue;
      }
      const x = mine ? helpLines(mine) : [];
      const y = theirs ? helpLines(theirs) : [];
      let at = x.findIndex((line, i) => line !== y[i]);
      if (at < 0) at = x.length;
      check(false, `${hosted.id} ${lang}: help in catalog.json differs from the hosted export of ${ns} ${version} (“${x[at] ?? '–'}” instead of “${y[at] ?? '–'}”)`);
    }
  }
}

const dictDir = path.join(ROOT, 'tools/i18n/dict');
const dicts = fs.existsSync(dictDir)
  ? fs.readdirSync(dictDir).filter((f) => f.endsWith('.json')).sort().map((f) => [f.replace(/\.json$/, ''), JSON.parse(fs.readFileSync(path.join(dictDir, f), 'utf8')).entries || {}])
  : [];
const translation = (entries, key) => {
  const v = Object.prototype.hasOwnProperty.call(entries, key) ? entries[key] : null;
  return typeof v === 'string' ? v : v && typeof v.text === 'string' ? v.text : null;
};
const temperatures = (s) => [...s.replace(/&nbsp;| | /g, ' ').matchAll(/(\d+(?:[.,]\d+)?) ?°C/g)].map((m) => m[1].replace(',', '.'));
let translatedHelp = 0;
for (const motor of motors) {
  for (const line of helpLines((motor.help || {}).en_us || {})) {
    const temps = temperatures(line);
    if (!temps.length) continue;
    for (const [code, entries] of dicts) {
      const t = translation(entries, line);
      if (t === null) continue;
      translatedHelp++;
      const got = temperatures(t);
      check(temps.every((x) => got.includes(x)), `${code}.json: translation of “${line}” keeps ${temps.map((x) => `${x} °C`).join(', ')} (“${t}”)`);
    }
  }
}

const html = read('configurator/index.html');
const plain = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const pw = release(json.source && json.source.mods && json.source.mods.propwash);
const jmp = release(json.source && json.source.mods && json.source.mods.justmoreparts);
const ambient = (/REFERENCE_AMBIENT_C\s*=\s*([\d.]+)/.exec(read('assets/js/configurator/analysis.js')) || [])[1];
check(pw, 'catalog.json: source.mods names the Propwash version of its export');
check(ambient, 'analysis.js: REFERENCE_AMBIENT_C');
const ambientText = `${Number(ambient)} °C`;

const analysisCard = /<section class="cfg-card cfg-analysis"[\s\S]*?<\/section>/.exec(html)?.[0] || '';
const about = /<section class="wrap cfg-about"[\s\S]*?<\/section>/.exec(html)?.[0] || '';
check(analysisCard, 'configurator/index.html: the card of the flight analysis');
check(about, 'configurator/index.html: the section “About this page”');
const paragraphs = (section, cls, lang) => [...section.matchAll(new RegExp(`<p${cls ? ` class="${cls}"` : ''} lang="${lang}">([\\s\\S]*?)</p>`, 'g'))].map((m) => m[1]);
const pageTexts = [];
for (const lang of ['en', 'de']) {
  const intro = paragraphs(analysisCard, 'cfg-card__intro', lang);
  const aboutText = paragraphs(about, null, lang);
  check(intro.length === 1, `configurator/index.html: one intro of the flight analysis in ${lang}`);
  check(aboutText.length >= 1, `configurator/index.html: “About this page” in ${lang}`);
  const introPlain = plain(intro.join(' '));
  const aboutPlain = plain(aboutText.join(' '));
  check(introPlain.includes(`Propwash ${pw}`), `${lang}: the intro of the flight analysis names Propwash ${pw}, the version of the export (“${introPlain.slice(0, 100)}…”)`);
  check(introPlain.includes(ambientText), `${lang}: the intro of the flight analysis names ${ambientText}, the temperature analysis.js calculates with`);
  check(aboutPlain.includes(`Propwash ${pw}`), `${lang}: “About this page” names Propwash ${pw} as the source of the data (“${aboutPlain.slice(0, 120)}…”)`);
  if (jmp) check(aboutPlain.includes(`Just More Parts ${jmp}`), `${lang}: “About this page” names Just More Parts ${jmp} as the source of the data`);
  pageTexts.push(...intro, ...aboutText);
}
const page = plain(html);
for (const m of page.matchAll(/\bPropwash(?: FPV)? (\d+\.\d+\.\d+)/g)) check(m[1] === pw, `configurator/index.html names “${m[0]}”, the data come from Propwash ${pw}`);
if (jmp) for (const m of page.matchAll(/\bJust More Parts (\d+\.\d+\.\d+)/g)) check(m[1] === jmp, `configurator/index.html names “${m[0]}”, the data come from Just More Parts ${jmp}`);

let translatedPage = 0;
for (const text of pageTexts) {
  const key = text.trim();
  const needs = [...new Set([...plain(key).matchAll(/\b(?:Propwash|Just More Parts) \d+\.\d+\.\d+/g)].map((m) => m[0]))];
  const temps = temperatures(key);
  for (const [code, entries] of dicts) {
    const t = Object.entries(entries).find(([k]) => plain(k) === plain(key));
    if (!t) continue;
    translatedPage++;
    const value = typeof t[1] === 'string' ? t[1] : t[1] && t[1].text;
    const tp = plain(value || '');
    for (const n of needs) check(tp.includes(n), `${code}.json: translation of “${plain(key).slice(0, 60)}…” keeps ${n}`);
    check(temps.every((x) => temperatures(value || '').includes(x)), `${code}.json: translation of “${plain(key).slice(0, 60)}…” keeps ${temps.map((x) => `${x} °C`).join(', ')}`);
  }
}

for (const n of notes) console.log(`note: ${n}`);
const summary = `${motors.length} motors, ${helpChecked} help lines, ${derateClaims} derating and ${minuteClaims} one-minute temperatures, `
  + `${hostedParts} parts of hosted exports, ${translatedHelp} translated help lines, ${translatedPage} translated page texts`;
if (failures.length) {
  console.error(failures.slice(0, 80).join('\n'));
  console.error(`FAIL: configurator texts: ${failures.length} of ${checks} checks failed (${summary})`);
  process.exit(1);
}
console.log(`PASS: configurator texts: ${checks} checks passed (${summary})`);
