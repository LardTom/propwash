#!/usr/bin/env node
// The license page of the docs (owner finding OF-6): docs/license/ explains in plain words what the licenses of
// Propwash FPV and its official add-ons allow. Binding are LICENSE, LICENSE-MIT and NOTICE; the page says so.
//   - held against the license texts of Propwash (--propwash, PROPWASH_SRC or the folder propwash next to this
//     repository) and Just More Parts (--jmp, JMP_SRC or propwash-justmoreparts-public / propwash-justmoreparts):
//     the Required Notice line of every NOTICE, the additional permissions of LICENSE (the page names exactly those,
//     with their numbers: a further one in LICENSE fails until the page has it, none that LICENSE doesn’t have), the
//     12 months of the exit clause, the versions the terms apply to, and the “fine” and “not fine” of the rules for
//     add-ons (ADDONS.md)
//   - the page says that it is no legal advice and that the license texts are binding, in English and German, and
//     links LICENSE, LICENSE-MIT and NOTICE of all four projects at the source addresses of platforms.json
//   - linked from the docs menu, the docs overview, the FAQ question faq-license, /addons/ and every add-on page;
//     translated like the other docs pages for players
//   - no “–” or “—” in its text
//
//   node tools/test-license.mjs [--propwash <dir>] [--jmp <dir>]

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PAGES as DOC_PAGES, SOURCES } from './docs/html.mjs';
import { PERMISSIONS } from './docs/pages/license.mjs';
import { PAGES as I18N_PAGES } from './i18n/pages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let checks = 0;
const failures = [];
const notes = [];
function check(ok, message) {
  checks++;
  if (!ok) failures.push(message);
  return !!ok;
}
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
};
// Next to the main checkout of this repository, also when this is a worktree of it.
let home = path.resolve(ROOT, '..');
try {
  home = path.resolve(path.dirname(path.resolve(ROOT, execFileSync('git', ['-C', ROOT, 'rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim())), '..');
} catch {
  // no git
}
const repo = (flag, env, names) => [arg(flag), process.env[env], ...names.map((n) => path.join(home, n))].find((d) => d && fs.existsSync(path.join(d, 'LICENSE')));
const PW = repo('--propwash', 'PROPWASH_SRC', ['propwash']);
const JMP = repo('--jmp', 'JMP_SRC', ['propwash-justmoreparts-public', 'propwash-justmoreparts']);

const FILE = 'docs/license/index.html';
check(fs.existsSync(path.join(ROOT, FILE)), `${FILE} exists (node tools/build-docs.mjs --render-only)`);
const html = fs.existsSync(path.join(ROOT, FILE)) ? read(FILE) : '';
const main = (/<main[\s\S]*<\/main>/.exec(html) || [''])[0].replace(/<nav class="docs-nav[\s\S]*?<\/nav>/g, '');
const text = (lang) => [...main.matchAll(new RegExp(`<([a-z0-9]+)[^>]*lang="${lang}"[^>]*>([\\s\\S]*?)</\\1>`, 'g'))]
  .map((m) => m[2].replace(/<[^>]+>/g, '')).join(' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
const en = text('en');
const de = text('de');

// 1. Says what it is.
check(/not legal advice/.test(en) && /only the license texts are binding/.test(en), 'English: no legal advice, only the license texts are binding');
check(/keine Rechtsberatung/.test(de) && /Verbindlich sind allein die Lizenztexte/.test(de), 'German: keine Rechtsberatung, verbindlich sind allein die Lizenztexte');
check(!/[–—]/.test(main.replace(/<[^>]+>/g, '')), 'no “–” or “—” in the text of the page');

// 2. Against the license texts.
function permissionsOf(license) {
  const block = (/ADDITIONAL PERMISSIONS\n([\s\S]*?)\n-{20,}/.exec(license) || [])[1] || '';
  return [...block.matchAll(/^(\d+)\. ([A-Z][^.]+)\./gm)].map((m) => ({ number: Number(m[1]), title: m[2].trim() }));
}
for (const [name, dir] of [['Propwash', PW], ['Just More Parts', JMP]]) {
  if (!dir) {
    notes.push(`no checkout of ${name} (--${name === 'Propwash' ? 'propwash' : 'jmp'}): its license texts are not compared`);
    continue;
  }
  const license = fs.readFileSync(path.join(dir, 'LICENSE'), 'utf8');
  const notice = fs.readFileSync(path.join(dir, 'NOTICE'), 'utf8');
  const required = (/^Required Notice: .+$/m.exec(notice) || [''])[0];
  check(required && html.includes(required), `${name}: the page quotes the Required Notice of NOTICE (“${required}”)`);
  const found = permissionsOf(license);
  check(found.length === PERMISSIONS.length && found.every((p, i) => PERMISSIONS[i].number === p.number && PERMISSIONS[i].title.en === p.title),
    `${name}: the page names exactly the additional permissions of LICENSE (${found.map((p) => `${p.number}. ${p.title}`).join(', ')})`);
  check(/PolyForm Shield License 1\.0\.0/.test(license) && /12 consecutive months/.test(license), `${name}: LICENSE is PolyForm Shield 1.0.0 with an exit clause of 12 months`);
  check(/MIT License/.test(fs.readFileSync(path.join(dir, 'LICENSE-MIT'), 'utf8')), `${name}: LICENSE-MIT is the MIT License`);
  if (name === 'Propwash') {
    check(/from version 0\.5\.0 on/.test(license) && /0\.5\.0/.test(en) && /0\.5\.0/.test(de), 'Propwash: the terms apply from 0.5.0 on, and the page says so');
    check(/reserved for Propwash/.test(notice) && /namespace <code>propwash<\/code>|Namensraum <code>propwash<\/code>/.test(main), 'Propwash: the reserved namespace of NOTICE');
    const addons = path.join(dir, 'ADDONS.md');
    if (fs.existsSync(addons)) {
      const rules = fs.readFileSync(addons, 'utf8');
      for (const [rule, inEn, inDe] of [
        ['copying core code into your add-on', /Copying core code/, /Kern-Code kopieren/],
        ['shipping Propwash inside your jar', /Shipping Propwash or Just More Parts inside your own jar/, /Propwash oder Just More Parts in dein eigenes Jar packen/],
        ['building a competing drone mod from Propwash', /competing drone mod/, /konkurrierende Drohnen-Mod/],
        ['your own license for your own code', /Your own license for your own code/, /Eigene Lizenz für eigenen Code/],
        ['using the API', /use the add-on API/, /die Add-on-API nutzen/],
      ]) {
        check(rules.includes(rule) && inEn.test(en) && inDe.test(de), `ADDONS.md “${rule}”: on the page in English and German`);
      }
    }
  } else {
    check(/from the first version published after 1\.0\.0 on/.test(license) && /after 1\.0\.0/.test(en) && /nach 1\.0\.0/.test(de), 'Just More Parts: the terms apply after 1.0.0, and the page says so');
  }
}
for (const [what, inEn, inDe] of [
  ['modpacks with the unchanged release files', /unchanged release files/, /unveränderten Release-Dateien/],
  ['not as an alternative download', /in place of the official pages/, /anstelle der offiziellen Seiten/],
  ['videos and streams', /videos, streams/, /Videos, Streams/],
  ['servers', /own server/, /eigenen Server/],
  ['the exit clause: 12 months, MIT, cannot be taken back', /12 months in a row[\s\S]*MIT License[\s\S]*cannot be taken back/, /12 Monate am Stück[\s\S]*MIT-Lizenz[\s\S]*nicht zurückgenommen/],
  ['publishing a fork as your own mod', /Publishing a fork as your own mod/, /Einen Fork als eigene Mod veröffentlichen/],
]) check(inEn.test(en) && inDe.test(de), `the page explains ${what} in English and German`);

// 3. The binding texts of all four projects, at the source addresses of platforms.json.
const platforms = JSON.parse(read('assets/data/platforms.json'));
for (const [key, url] of Object.entries(platforms.source)) {
  check(SOURCES[key] === url, `SOURCES.${key} of tools/docs/html.mjs is ${url}`);
  for (const f of ['LICENSE', 'LICENSE-MIT', 'NOTICE']) check(html.includes(`href="${url}/blob/main/${f}"`), `the page links ${f} of ${key}`);
}

// 4. Linked from everywhere it belongs, translated.
check(DOC_PAGES.some((p) => p.path === 'docs/license/' && p.group), 'the docs menu has the page');
check(read('docs/index.html').includes('href="license/"') || read('docs/index.html').includes('href="../docs/license/"'), 'the docs overview links the page');
const faq = (/<details id="faq-license">[\s\S]*?<\/details>/.exec(read('index.html')) || [''])[0];
check(faq.includes('href="docs/license/"'), 'the FAQ question faq-license links the page');
check(read('addons/index.html').includes('href="../docs/license/"'), '/addons/ links the page');
for (const p of ['addons/just-more-parts/index.html', 'addons/camera-drones/index.html', 'addons/mob-defense/index.html']) {
  check(read(p).includes('href="../../docs/license/"'), `${p} links the page`);
}
check(I18N_PAGES.some((p) => p.file === FILE), 'the page is translated like the other docs pages for players (tools/i18n/pages.mjs)');

for (const n of notes) console.log(`note: ${n}`);
if (failures.length) {
  for (const f of failures) console.log(`  FAIL ${f}`);
  console.log(`license: ${failures.length} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`license: ${checks} checks passed (${PERMISSIONS.length} additional permissions, Propwash ${PW ? path.basename(PW) : 'not compared'}, Just More Parts ${JMP ? path.basename(JMP) : 'not compared'})`);
