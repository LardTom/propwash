#!/usr/bin/env node
// Battery plugged in (Propwash 0.6.0, PowerLead / PlugMask): with the battery in, the drone shows no plugs and no leads.
// The plugged pair with a cable along the frame was dropped (finding PLUG-1); this test keeps the site in line:
//   - no page, data file, script, docs source, changelog translation, dictionary or README of the site still describes
//     the dropped pair (plug in the stack's or drone's plug, lead along the frame, one plugged pair, its colour)
//   - the page of Just More Parts, the changelog of Propwash 0.6.0 and the parts format say in English and German that
//     plugs and leads are hidden
//   - every dictionary of tools/i18n/dict translates every text about plugs that the site has, and keeps none it no
//     longer has
//   - the 3D data and both model builders (tools/build-configurator-models.mjs and the in-browser one in
//     assets/js/configurator/catalog-build.js) carry no anchor of the dropped cable route: no frame `rear`, no
//     `power_lead` in the frame layouts; the anchors in use (battery socket, stack pigtails) stay
//
//   node tools/test-plug-texts.mjs

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { counter, read, readJson, ROOT } from './fixtures/cov/browser.mjs';
import { partModel } from '../assets/js/configurator/catalog-build.js';
import * as catalogBuild from '../assets/js/configurator/catalog-build.js';
import * as modelBuild from './build-configurator-models.mjs';
import { extract } from './i18n/extract.mjs';
import { LANGUAGES, loadDict } from './i18n/languages.mjs';

const { check, finish } = counter('plug texts');

const OLD = [
  [/sits in the (?:stack|drone)[’']s plug/i, 'plug sits in the stack’s or drone’s plug'],
  [/lead along the frame/i, 'lead along the frame'],
  [/plugged (?:connector )?pair/i, 'plugged pair'],
  [/colour of the plugged/i, 'colour of the plugged pair'],
  [/the plugged battery lead/i, 'the plugged battery lead'],
  [/steckt der Akku-Stecker/, 'steckt der Akku-Stecker'],
  [/im Stecker des Stacks/, 'im Stecker des Stacks'],
  [/Kabel am Rahmen entlang/, 'Kabel am Rahmen entlang'],
  [/sitzt jetzt in der Buchse/, 'sitzt jetzt in der Buchse der Drohne'],
  [/gesteckte[ns]? (?:Stecker)?[Pp]aar/, 'gestecktes Paar'],
  [/Steckerpaar/, 'Steckerpaar'],
];

const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
const scanned = tracked.filter((f) => f.endsWith('.html')
  || (f.startsWith('assets/data/') && f.endsWith('.json') && !f.startsWith('assets/data/configurator/models/'))
  || (f.startsWith('assets/js/') && f.endsWith('.js'))
  || (f.startsWith('tools/docs/') && /\.(mjs|json)$/.test(f))
  || f === 'tools/changelog/de.json'
  || (f.startsWith('tools/i18n/dict/') && f.endsWith('.json'))
  || f === 'README.md');
let hits = 0;
for (const file of scanned) {
  const text = read(file);
  for (const [re, what] of OLD) {
    const m = re.exec(text);
    if (!check(!m, `${file}: still describes the dropped plugged pair (“${what}”: …${m ? text.slice(Math.max(0, m.index - 60), m.index + 80).replace(/\s+/g, ' ') : ''}…)`)) hits++;
  }
}

const plain = (html) => html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const jmp = read('addons/just-more-parts/index.html');
const item = (lang, label) => [...jmp.matchAll(new RegExp(`<li lang="${lang}">([\\s\\S]*?)</li>`, 'g'))].map((m) => plain(m[1])).find((s) => s.startsWith(label)) || '';
const jmpEn = item('en', 'Battery plugged in:');
const jmpDe = item('de', 'Akku gesteckt:');
check(/Propwash 0\.6\.0/.test(jmpEn) && /plugs and leads are hidden/.test(jmpEn) && /while the battery is in/.test(jmpEn) && /every frame/.test(jmpEn),
  `JMP page (en): plugs and leads hidden while the battery is in, on every frame (“${jmpEn}”)`);
check(/Propwash 0\.6\.0/.test(jmpDe) && /Stecker und Kabel ausgeblendet/.test(jmpDe) && /solange der Akku sitzt/.test(jmpDe) && /jedem Rahmen/.test(jmpDe),
  `JMP page (de): Stecker und Kabel ausgeblendet, solange der Akku sitzt, an jedem Rahmen (“${jmpDe}”)`);

const changelog = readJson('assets/data/changelog.json');
const release = changelog.products.find((p) => p.id === 'propwash')?.releases.find((r) => r.version === '0.6.0');
const entries = release ? release.sections.flatMap((s) => s.items) : [];
const plugEntry = entries.find((e) => /plugs or cables/.test(e.en || ''));
check(plugEntry && /^Plugged-in batteries no longer show plugs or cables:/.test(plugEntry.en) && /hides the battery's plug and leads and the stack's power leads/.test(plugEntry.en),
  `changelog Propwash 0.6.0 (en): plugged-in batteries no longer show plugs or cables (${plugEntry ? plugEntry.en : 'no such entry'})`);
check(plugEntry && /^Gesteckte Akkus zeigen keine Stecker und Kabel mehr:/.test(plugEntry.de || '') && /Stromkabel des Stacks aus/.test(plugEntry.de || ''),
  `changelog Propwash 0.6.0 (de): Gesteckte Akkus zeigen keine Stecker und Kabel mehr (${plugEntry ? plugEntry.de : 'no such entry'})`);

const format = read('docs/parts-format/index.html');
const span = (lang, label) => [...format.matchAll(new RegExp(`<span lang="${lang}">([\\s\\S]*?)</span>`, 'g'))].map((m) => plain(m[1])).find((s) => s.startsWith(label)) || '';
const fmtEn = span('en', 'Plugged batteries');
const fmtDe = span('de', 'Gesteckte Akkus');
check(/hides the plugs and leads/.test(fmtEn) && /balance_plug/.test(fmtEn) && /pigtail/.test(fmtEn) && /left out as well/.test(fmtEn) && /power_lead/.test(fmtEn),
  `parts format (en): Propwash hides the plugs and leads – connector, balance_plug, wire, pigtail; power_lead ignored (“${fmtEn}”)`);
check(/blendet Propwash Stecker und Kabel aus/.test(fmtDe) && /balance_plug/.test(fmtDe) && /pigtail/.test(fmtDe) && /fehlen ebenfalls/.test(fmtDe) && /power_lead/.test(fmtDe),
  `parts format (de): Propwash blendet Stecker und Kabel aus – connector, balance_plug, wire, pigtail; power_lead ignoriert (“${fmtDe}”)`);
const connectorRow = /<tr class="docs-field[^"]*" id="battery-connector">([\s\S]*?)<\/tr>/.exec(format);
check(connectorRow && /display only/.test(plain(connectorRow[1])) && /nur zur Anzeige/.test(plain(connectorRow[1])),
  `parts format: the battery's connector is display only, in English and German (${connectorRow ? plain(connectorRow[1]) : 'row #battery-connector missing'})`);

const { entries: texts } = extract();
const plugTexts = [...texts.keys()].filter((k) => /\bplug/i.test(k));
check(plugTexts.length > 0, 'the site has texts about plugs to translate');
for (const lang of LANGUAGES) {
  const dict = loadDict(lang.code).entries;
  const missing = plugTexts.filter((k) => !(typeof dict[k] === 'string' && dict[k].trim()));
  check(!missing.length, `tools/i18n/dict/${lang.code}.json: no translation of\n    ${missing.join('\n    ')}`);
  const stale = Object.keys(dict).filter((k) => /\bplug/i.test(k) && !texts.has(k));
  check(!stale.length, `tools/i18n/dict/${lang.code}.json: translations of texts the site no longer has – remove them:\n    ${stale.join('\n    ')}`);
}

const modelsDir = path.join(ROOT, 'assets/data/configurator/models');
const render = readJson('assets/data/configurator/render.json');
let frames = 0;
let sockets = 0;
let pigtails = 0;
const rears = [];
for (const id of render.models) {
  const [ns, local] = id.split(':');
  const dir = fs.readdirSync(modelsDir + '/' + ns).find((c) => fs.existsSync(path.join(modelsDir, ns, c, `${local}.json`)));
  const model = JSON.parse(fs.readFileSync(path.join(modelsDir, ns, dir, `${local}.json`), 'utf8'));
  if (dir === 'frame') frames++;
  for (const [name, v] of Object.entries(model.variants)) {
    if ('rear' in v) rears.push(`${id} ${name}`);
    if (v.socket) sockets++;
    if (v.pigtail) pigtails++;
  }
}
check(!rears.length, `model files: no frame rear any more (the dropped cable route), found in ${rears.length}: ${rears.slice(0, 8).join(', ')}${rears.length > 8 ? ' …' : ''}`);
check(frames > 0 && sockets > 0 && pigtails > 0, `model files: the anchors in use stay (${frames} frames, ${sockets} battery sockets, ${pigtails} stack pigtails)`);
const leads = Object.entries(render.layouts).filter(([, l]) => l && 'power_lead' in l).map(([k]) => k);
check(!leads.length, `render.json: no power_lead in the frame layouts (${leads.join(', ')})`);

for (const [label, mod] of [['catalog-build.js', catalogBuild], ['build-configurator-models.mjs', modelBuild]]) {
  check(!('bodyRearZ' in mod), `${label}: no bodyRearZ any more (rear of the frame for the dropped cable route)`);
  check(typeof mod.socketOf === 'function' && typeof mod.pigtailOf === 'function', `${label}: socketOf and pigtailOf stay`);
}
check(!/\.rear\s*=|rears/.test(read('tools/build-configurator-models.mjs')), 'build-configurator-models.mjs: writes and counts no frame rear');
check(!/power_lead|bend point/.test(read('tools/build-configurator-models.mjs')), 'build-configurator-models.mjs: no power_lead bend point in its description');

const files = new Map(Object.entries({
  'assets/x/items/drone_render/frame/f.json': JSON.stringify({ model: { type: 'minecraft:model', model: 'x:item/f' } }),
  'assets/x/models/item/f.json': JSON.stringify({ textures: { 0: 'x:item/f' }, elements: [{ name: 'plate', from: [4, 7, 2], to: [12, 8, 14], faces: { up: { uv: [0, 0, 8, 12], texture: '#0' } } }] }),
  'assets/x/textures/item/f.png': new Uint8Array([137, 80, 78, 71]),
}));
const frame = partModel({ id: 'x:f', category: 'frame', model: { kind: 'model', drone: 'assets/x/items/drone_render/frame/f.json', variants: [] } }, { has: (p) => files.has(p), get: (p) => files.get(p) });
check(frame && frame.variants.base && frame.variants.base.el && !('rear' in frame.variants.base), `catalog-build.js partModel: a frame from a jar gets no rear (${JSON.stringify(frame && frame.variants.base && Object.keys(frame.variants.base))})`);

finish(`${scanned.length} files without the dropped pair, ${plugTexts.length} texts about plugs in ${LANGUAGES.length} dictionaries, ${render.models.length} model files, ${frames} frames`);
