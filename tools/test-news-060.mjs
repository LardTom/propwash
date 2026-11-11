#!/usr/bin/env node
// What the site says about the last fix block of Propwash 0.6.0 (finding FB2S, owner 09.11.: publish 0.6.0 right
// after the rc.4 playtest), English and German, only what the merged code does:
//   - player guide (docs/guide/): a section for each new thing with its words from the game – laps the server doesn't
//     count (verdict in HUD and chat, pass zone warning with “Shorten to …”, /propwash race trim, floor arrows), the race
//     line per course in the course settings, replays recorded as video (“Record as video”, ffmpeg), sculk sensors with
//     the world rule “Drones trigger sculk”, bosses fighting drones with the world rule “Bosses fight drones” (new in the
//     release 0.6.0), zone outlines in flight (“With tool or in flight” as default), add-ons that
//     players don't need left out of the join overview, mixed servers (Fabric as server loader, NeoForge players on
//     Fabric servers, clean refusal on NeoForge servers), trick tutorials in the Freestyle tab, “Unlock all” in the
//     flight training and the advancement tab “Propwash FPV”; every picture of the guide exists
//   - world rules page: the rules drones_trigger_sculk and drones_boss_interactions with their anchors
//   - landing page: “What’s new” shows the cards of the fix block (trick tutorials, advancements, replays as video)
//     after the three of 0.6.0, the FAQ answers whether NeoForge and Fabric players can play together and links the
//     guide; the roadmap card of the camera drones names what its merged code does
//   - changelog page: the Propwash 0.6.0 entry carries the lines of CHANGELOG.md about NeoForge players on Fabric servers
//   - every translated language (tools/i18n/dict) has every text of the site: nothing missing, nothing stale
//
//   node tools/test-news-060.mjs

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { counter, read, readJson, ROOT } from './fixtures/cov/browser.mjs';
import { byId, docSection, faq, langHtml, plain, parse, walk, attr } from './fixtures/cov/site-b.mjs';

const { check, finish } = counter('news 0.6.0');
const guide = read('docs/guide/index.html');
const gamerules = read('docs/gamerules/index.html');
const home = read('index.html');

const GUIDE = [
  ['racing-verdict', {
    en: [/Lap 1 not counted/, /2 of 3 laps counted/, /Shorten to/, /\/propwash race trim/, /turn pole/, /floor arrows|arrows/i],
    de: [/Runde 1 nicht gewertet/, /2 von 3 Runden gewertet/, /Auf … kürzen/, /\/propwash race trim/, /Wende-Stange/, /Pfeile/],
  }],
  ['racing-edit', { en: [/Race line/, /Shown/, /Hidden/], de: [/Ideallinie/, /Sichtbar/, /Aus/] }],
  ['video-replay', { en: [/Record as video/, /ffmpeg/, /propwash_replay_/, /start and finish gate/], de: [/Als Video aufnehmen/, /ffmpeg/, /propwash_replay_/, /Start- und Ziel-Gate/] }],
  ['world-sculk', { en: [/Sculk sensors/, /warden/, /wool/, /Drones trigger sculk/], de: [/Sculk-Sensoren/, /Wärter/, /Wolle/, /Drohnen lösen Sculk aus/] }],
  ['world-bosses', {
    en: [/warden/, /sonic boom/, /darkness/, /ender dragon/, /wither/, /breeze/, /Bosses fight drones/, /every preset/],
    de: [/Wärter/, /Schallschlag/, /Dunkelheit/, /Enderdrache/, /Wither/, /Breeze/, /Bosse kämpfen gegen Drohnen/, /jeder Voreinstellung/],
  }],
  ['servers-zones', { en: [/With tool or in flight/, /Only with tool/, /Always/], de: [/Mit Werkzeug oder im Flug/, /Nur mit Werkzeug/, /Immer/] }],
  ['servers-addons', { en: [/propwash:client/, /left out/], de: [/propwash:client/, /fehlen in der Liste/] }],
  ['servers-mixed', { en: [/run Fabric on the server/, /Velocity/, /NeoForge players/, /This server runs NeoForge/, /\.optional\(\)/], de: [/nimm Fabric auf dem Server/, /Velocity/, /NeoForge-Spieler/, /Dieser Server läuft mit NeoForge/, /\.optional\(\)/] }],
  ['learn-tricks', { en: [/Freestyle/, /video tutorial/, /stick cam/, /slow motion 0\.5×/], de: [/Freestyle/, /Video-Tutorial/, /Stick-Cam/, /Zeitlupe 0,5×/] }],
  ['learn-training', { en: [/Unlock all/, /Really unlock all\?/, /no stars/, /Restore lesson order/], de: [/Alle freischalten/, /Wirklich alle freischalten\?/, /Sterne gibt es dafür nicht/, /Reihenfolge wieder einhalten/] }],
  ['learn-advancements', { en: [/Propwash FPV/, /27 advancements/, /Drones hit mobs and players/], de: [/Propwash FPV/, /27 Fortschritten/, /Drohnen treffen Lebewesen/] }],
];

for (const [id, want] of GUIDE) {
  const sec = docSection(guide, id);
  if (!check(!!sec, `docs/guide: section #${id} there`)) continue;
  for (const lang of ['en', 'de']) {
    for (const re of want[lang]) check(re.test(sec[lang]), `docs/guide #${id} (${lang}) says ${re}`);
  }
}
check(/href="\.\.\/\.\.\/docs\/gamerules\/#rule-drones_trigger_sculk"/.test(guide), 'docs/guide links the world rule drones_trigger_sculk');
check(/href="\.\.\/\.\.\/docs\/gamerules\/#rule-drones_boss_interactions"/.test(guide), 'docs/guide links the world rule drones_boss_interactions');
check(/id="servers-mixed"/.test(guide) && /href="#servers-mixed"/.test(guide), 'docs/guide: #servers-mixed in the table of contents');

for (const m of guide.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)) {
  const file = path.join(ROOT, 'docs/guide', m[1]);
  check(fs.existsSync(file), `docs/guide: picture ${m[1]} exists`);
}
for (const name of ['lap-verdict-hud', 'course-settings-race-line', 'replay-video-recording', 'zones-in-flight-fpv', 'trick-tutorial-player', 'advancements-tab']) {
  check(guide.includes(`assets/img/docs/${name}-800.webp`), `docs/guide shows ${name}`);
}

check(/id="rule-drones_trigger_sculk"/.test(gamerules), 'docs/gamerules: the rule drones_trigger_sculk');
check(/Drones trigger sculk/.test(gamerules) && /Drohnen lösen Sculk aus/.test(gamerules), 'docs/gamerules: its English and German name');
check(/id="rule-drones_boss_interactions"/.test(gamerules), 'docs/gamerules: the rule drones_boss_interactions');
check(/Bosses fight drones/.test(gamerules) && /Bosse kämpfen gegen Drohnen/.test(gamerules), 'docs/gamerules: Bosses fight drones in English and German');

const sec = byId(home, 'new');
if (check(!!sec, 'index.html: #new there')) {
  const doc = parse(sec.html);
  const titles = [...walk(doc)].filter((e) => e.name === 'h3').map((h) => sec.html.slice(h.start, h.end));
  const want = [
    { en: /^Trick tutorials$/, de: /^Trick-Tutorials$/ },
    { en: /^Advancements$/, de: /^Fortschritte$/ },
    { en: /^Replays as video$/, de: /^Replays als Video$/ },
  ];
  for (const w of want) {
    check(titles.some((t) => w.en.test(plain(langHtml(t, 'en'))) && w.de.test(plain(langHtml(t, 'de')))), `index.html #new: card ${w.en}`);
  }
  for (const img of [...walk(doc)].filter((e) => e.name === 'img')) {
    const src = attr(img, 'src');
    check(!!src && fs.existsSync(path.join(ROOT, src)), `index.html #new: picture ${src} exists`);
  }
}
for (const lang of ['en', 'de']) {
  const a = faq(home, 'faq-mixed-loaders', lang);
  if (!check(!!a, `index.html: FAQ #faq-mixed-loaders (${lang})`)) continue;
  check(/Fabric/.test(a.question) && /NeoForge/.test(a.question), `FAQ #faq-mixed-loaders (${lang}): asks about NeoForge and Fabric`);
  check(/docs\/guide\/#servers-mixed/.test(a.answer), `FAQ #faq-mixed-loaders (${lang}): links docs/guide/#servers-mixed`);
  check(lang === 'en' ? /Fabric server/.test(a.text) : /Fabric-Server/.test(a.text), `FAQ #faq-mixed-loaders (${lang}): recommends a Fabric server`);
}

const roadmap = readJson('assets/data/roadmap.json');
const camera = roadmap.horizons.flatMap((h) => h.groups.flatMap((g) => g.items)).find((i) => i.id === 'camera-drones');
check(!!camera && /world/.test(camera.text.en) && /Welt/.test(camera.text.de), 'roadmap: the camera drones say that the gimbal holds its direction in the world');

const changelog = readJson('assets/data/changelog.json');
const release = changelog.products.flatMap((p) => p.releases).find((r) => r.id === 'propwash-0.6.0');
const lines = release ? JSON.stringify(release) : '';
check(/NeoForge players can join Fabric servers/.test(lines), 'changelog: Propwash 0.6.0 names NeoForge players on Fabric servers');

const dicts = fs.readdirSync(path.join(ROOT, 'tools/i18n/dict')).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
check(dicts.length === 5, `five dictionaries (${dicts.join(', ')})`);
for (const lang of dicts) {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'tools/i18n/build-i18n.mjs'), '--missing', lang], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  const report = JSON.parse(out);
  check(report.missing.length === 0, `tools/i18n/dict/${lang}.json: ${report.missing.length} texts missing (${report.missing.slice(0, 3).map((m) => m.key.slice(0, 60)).join(' | ')})`);
  check(report.stale.length === 0, `tools/i18n/dict/${lang}.json: ${report.stale.length} stale texts (${report.stale.slice(0, 3).map((k) => k.slice(0, 60)).join(' | ')})`);
}

finish(`${GUIDE.length} guide sections, world rule, “What’s new”, FAQ, roadmap, changelog, ${dicts.length} dictionaries`);
