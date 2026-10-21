#!/usr/bin/env node
// Readability of the figure explanations of the configurator (check plan 0.6.0, 5.3 no. 20): every explanation in
// i18n.js statHelp (a text for every figure of stathelp.json among them), English and German:
//   - Flesch Reading Ease (English) at least 50 per text and 60 over all; Flesch-Amstad (German) at least 30 per text
//     and 50 over all, first Wiener Sachtextformel at most 12 per text and 10 over all
//   - sentences of at most 22 words (“about 20”)
//   - FPV terms of tools/i18n/glossary.json only with an explanation in the same text: “TERM (…)”, “(TERM)”, “TERM – …”
//     or “TERM: …”
//   - no ae/oe/ue for ä/ö/ü in German
//   - every number with its unit (or as a ratio like 2:1)
// Whether a newcomer understands them stays a human check.
//
//   node tools/test-stathelp.mjs [--verbose]
//
// Checks of a known fault are locked (they print their state); COV_UNLOCK=<id>,… or all makes them count.

import { entry } from '../assets/js/configurator/i18n.js';
import { counter, flag, readJson } from './fixtures/cov/browser.mjs';

const { check, lock, note, finish } = counter('stat help texts');
const statHelp = readJson('assets/data/configurator/stathelp.json');
const glossary = readJson('tools/i18n/glossary.json');
const VERBOSE = flag('--verbose');
const LIMITS = { fre: 50, freAll: 60, amstad: 30, amstadAll: 50, wstf: 12, wstfAll: 10, words: 22 };
const NAMED = ['Schwebegas', 'Flugzeit gemischt', 'Landespannung je Zelle', 'Props im Kamerabild'];
const NOT_TERMS = new Set(['Propwash', 'Propwash FPV', 'Propwash: Just More Parts', 'Just More Parts', 'Minecraft', 'Fabric', 'NeoForge', 'CurseForge',
  'Modrinth', 'Discord', 'GitHub', 'Mojang', 'Microsoft', 'Iris', 'Betaflight', 'EdgeTX', 'OpenTX', 'ExpressLRS', 'DJI', 'Walksnail', 'HDZero',
  'Whoop', 'Toothpick', 'Cinewhoop', 'Freestyle', 'Long Range', 'X-Class', 'Deadcat', 'Sharecode', 'PW1', 'PW2', 'PW3', 'Mode 1', 'Mode 2', 'Mode 3', 'Mode 4']);
const TERMS = glossary.keep.filter((t) => !NOT_TERMS.has(t));
const UNITS = ['mAh', 'km/h', 'm/s', 'kHz', 'Hz', 'Wh', 'kg', 'mm', 'cm', 'ms', 'min', '°C', '°/s', '°', '″', '%', 'KV', 'px', 'V', 'A', 'W', 'g', 's', 'h', 'm', 'C', 'S'];
const LEGIT_UE = /(?:^|[^aeiouäöü])(?:que|qua)|[aeiouäöü]ue|aero|koeff|poet|israel|duell|\bsue|^neu|^treue|^bauer|^dauer|^steuer|feuer|aktuell|virtuell|manuell|individuell|eventuell|visuell/i;

const KNOWN = {
  'cov-site-a-6': ['cruise_flight_time_min de amstad', 'cruise_flight_time_min de wstf', 'avionics_power_w de wstf'],
  'cov-site-a-7': ['thrust_to_weight en words', 'thrust_to_weight de words'],
  'cov-site-a-8': ['landing_cell_voltage en terms', 'landing_cell_voltage de terms', 'full_throttle_current_a en terms', 'full_throttle_current_a de terms',
    'esc_load_percent en terms', 'esc_load_percent de terms', 'sustained_motor_temp_c en terms', 'sustained_motor_temp_c de terms',
    'mixed_motor_temp_c en terms', 'mixed_motor_temp_c de terms'],
};
function verify(tag, ok, message) {
  const id = Object.keys(KNOWN).find((k) => KNOWN[k].includes(tag));
  return id ? lock(id, ok, message) : check(ok, message);
}

const sentences = (t) => t.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
const words = (t) => (t.match(/[\p{L}\d][\p{L}\d'’./-]*/gu) || []).filter((w) => /\p{L}|\d/u.test(w));
const letters = (w) => w.replace(/[^\p{L}]/gu, '');

function syllablesEn(word) {
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return /\d/.test(word) ? 1 : 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const m = w.match(/[aeiouy]{1,2}/g);
  return m ? m.length : 1;
}
function syllablesDe(word) {
  const w = word.toLowerCase().replace(/[^a-zäöüß]/g, '');
  if (!w) return /\d/.test(word) ? 1 : 0;
  const m = w.match(/ei|ie|au|eu|äu|[aeiouäöüy]/g);
  return m ? m.length : 1;
}
function scores(text, lang) {
  const ss = sentences(text);
  const ws = words(text);
  const syl = ws.map(lang === 'de' ? syllablesDe : syllablesEn);
  const asl = ws.length / ss.length;
  const asw = syl.reduce((a, b) => a + b, 0) / ws.length;
  const out = { sentences: ss.length, words: ws.length, syllables: syl.reduce((a, b) => a + b, 0), longest: Math.max(...ss.map((s) => words(s).length)) };
  if (lang === 'en') out.fre = 206.835 - 1.015 * asl - 84.6 * asw;
  else {
    out.amstad = 180 - asl - 58.5 * asw;
    const pct = (f) => (100 * ws.filter(f).length) / ws.length;
    out.wstf = 0.1935 * pct((w, i) => syl[i] >= 3) + 0.1672 * asl + 0.1297 * pct((w) => letters(w).length > 6) - 0.0327 * pct((w) => syllablesDe(w) === 1) - 0.875;
  }
  return out;
}

function unexplained(text) {
  const out = [];
  for (const term of TERMS) {
    const re = new RegExp(`(?<![\\p{L}\\d])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\d])`, 'gu');
    for (const m of text.matchAll(re)) {
      const after = text.slice(m.index + term.length, m.index + term.length + 3);
      const before = text.slice(Math.max(0, m.index - 1), m.index);
      if (!/^\s?\(|^\s[–:]|^:/.test(after) && before !== '(') out.push(term);
    }
  }
  return [...new Set(out)];
}

function umlautFallbacks(text) {
  return words(text).filter((w) => /ae|oe|ue/i.test(w) && !LEGIT_UE.test(w.toLowerCase()) && !/^[A-Z0-9-]+$/.test(w));
}

function bareNumbers(text) {
  const out = [];
  const re = /(\d+(?:[.,]\d+)?)(?:\s?[–-]\s?\d+(?:[.,]\d+)?)?/g;
  for (const m of text.matchAll(re)) {
    const before = text.slice(Math.max(0, m.index - 1), m.index);
    if (before === ':' || /[\p{L}]/u.test(before)) continue;
    const rest = text.slice(m.index + m[0].length).replace(/^[   ]/, '');
    if (/^:\d/.test(rest)) continue;
    if (UNITS.some((u) => rest.startsWith(u) && !/^[\p{L}]/u.test(rest.slice(u.length)))) continue;
    if (/^[×x]\d/.test(rest)) continue;
    out.push(m[0] + rest.slice(0, 8));
  }
  return out;
}

function selfTest() {
  check(bareNumbers('Rund 25 Motoren und 3,3 V').length === 1 && bareNumbers('Um 2:1, 3–7:1, 10–15 ms, 20 °C, 5″, 0–5 %').length === 0, 'the number check finds a number without its unit');
  check(umlautFallbacks('Fuer die Gruesse ist es schoen').length === 3 && umlautFallbacks('Neue Steuerung, aktuelle Quelle').length === 0, 'the umlaut check finds ue/oe for ü/ö');
  check(unexplained('Der ESC regelt.').includes('ESC') && unexplained('Der ESC (Motorregler) regelt.').length === 0, 'the term check wants an explanation');
  const easy = scores('The cat sat on the mat. It was a good cat.', 'en').fre;
  const hard = scores('Notwithstanding considerable organisational heterogeneity, interdepartmental communication necessitates standardisation.', 'en').fre;
  check(easy > 90 && hard < 0, `Flesch Reading Ease tells easy (${easy.toFixed(0)}) from hard (${hard.toFixed(0)})`);
}

function main() {
  selfTest();
  const help = entry('statHelp');
  const labels = entry('stats');
  for (const key of Object.keys(statHelp.stats)) check(Array.isArray(help[key]) && help[key][0] && help[key][1], `stathelp.json ${key}: a text in English and German`);
  for (const name of NAMED) check(Object.keys(help).some((k) => labels[k] && labels[k][1].startsWith(name)), `the check plan's “${name}” has an explanation`);
  const corpus = { en: [], de: [] };
  const texts = Object.entries(help).flatMap(([key, [en, de]]) => [['en', key, en], ['de', key, de]]);
  for (const [lang, key, value] of texts) {
    corpus[lang].push(value);
    const s = scores(value, lang);
    if (VERBOSE) console.log(lang, key.padEnd(28), JSON.stringify(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Math.round(v * 10) / 10]))));
    const where = `${key} ${lang}`;
    if (lang === 'en') verify(`${where} fre`, s.fre >= LIMITS.fre, `${where}: Flesch Reading Ease ${s.fre.toFixed(0)} (at least ${LIMITS.fre})`);
    else {
      verify(`${where} amstad`, s.amstad >= LIMITS.amstad, `${where}: Flesch-Amstad ${s.amstad.toFixed(0)} (at least ${LIMITS.amstad})`);
      verify(`${where} wstf`, s.wstf <= LIMITS.wstf, `${where}: Wiener Sachtextformel ${s.wstf.toFixed(1)} (at most ${LIMITS.wstf})`);
    }
    verify(`${where} words`, s.longest <= LIMITS.words, `${where}: longest sentence ${s.longest} words (at most ${LIMITS.words})`);
    const terms = unexplained(value);
    verify(`${where} terms`, terms.length === 0, `${where}: FPV terms without an explanation: ${terms.join(', ')}`);
    if (lang === 'de') check(umlautFallbacks(value).length === 0, `${where}: ae/oe/ue instead of ä/ö/ü (${umlautFallbacks(value).join(', ')})`);
    const bare = bareNumbers(value);
    check(bare.length === 0, `${where}: numbers without a unit (${bare.join(' | ')})`);
  }
  for (const lang of ['en', 'de']) {
    const all = scores(corpus[lang].join(' '), lang);
    if (lang === 'en') check(all.fre >= LIMITS.freAll, `all English texts: Flesch Reading Ease ${all.fre.toFixed(1)} (at least ${LIMITS.freAll})`);
    else {
      check(all.amstad >= LIMITS.amstadAll, `all German texts: Flesch-Amstad ${all.amstad.toFixed(1)} (at least ${LIMITS.amstadAll})`);
      check(all.wstf <= LIMITS.wstfAll, `all German texts: Wiener Sachtextformel ${all.wstf.toFixed(1)} (at most ${LIMITS.wstfAll})`);
    }
    note(`${lang}: ${corpus[lang].length} texts, ${all.words} words, ${all.sentences} sentences, ${lang === 'en' ? `Flesch Reading Ease ${all.fre.toFixed(1)}` : `Flesch-Amstad ${all.amstad.toFixed(1)}, Wiener Sachtextformel ${all.wstf.toFixed(1)}`}`);
  }
  finish(`${Object.keys(help).length} explanations in English and German`);
}

main();
