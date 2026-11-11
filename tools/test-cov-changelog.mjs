#!/usr/bin/env node
// Coverage of the changelog and the texts of Just More Parts 1.2.0 (check plan 0.6.0, 5.7 no. 48 and 4.5 no. 34),
// English and German. The stand comes from assets/data/platforms.json: a live platform means the release stand.
//   - Propwash 0.6.0 and Just More Parts 1.2.0 in changelog.json: two or three highlights, the sections New, Improved,
//     Fixed and Compatibility (Just More Parts 1.2.0 fixes nothing, its CHANGELOG.md has no Fixed), and the pressure
//     plate entry of Propwash names bluepanee; before the release a version that is not in changelog.json yet is
//     looked up in the CHANGELOG.md of its integration branch and otherwise reported, from the release on it is required
//   - the first releases of the add-ons Camera Drones and Mob Defense (1.0.0, or the version of platforms.json once it
//     lists them) in changelog.json with their anchors: two or three highlights, New, For server owners and
//     Compatibility, German for every entry, and Compatibility names Propwash FPV 0.6.0 and add-on API 1.8
//   - Just More Parts 1.2.0 on /addons/just-more-parts/ and in its changelog entry: whoop motors, the preset “65 mm
//     race whoop”, plugged batteries, share codes through Propwash, “Propwash 0.6.0” as the requirement of
//     registry.json and what Propwash 0.6.0 does with Just More Parts 1.1 (it refuses it: breaks <1.2.0- in Propwash's
//     fabric.mod.json since 21.10. and its changelog; the check plan still says it runs, see the report)
//   - every part count equals the parts of the hosted web export of 1.2.0 (parts.json): registry.json, the page of Just
//     More Parts (total and per category), the landing page, the changelog entry, the README and docs/modrinth of Just
//     More Parts (read with git show from its integration branch)
//
//   node tools/test-cov-changelog.mjs [--stand pre|release] [--jmp-repo <dir>] [--jmp-ref <ref>]
//
// --jmp-repo (or JMP_SRC, default: the propwash-justmoreparts checkout next to this repository) and --jmp-ref (default
// integration-1.2.0, else the newest tag v1.2.0, else HEAD). Checks of a known fault are locked (they print their
// state); COV_UNLOCK=<id>,… or all makes them count.

import { counter, arg, read, readJson } from './fixtures/cov/browser.mjs';
import { langHtml, plain, gitShow, gitHasRef, siblingRepo } from './fixtures/cov/site-b.mjs';
import { parseChangelog } from './build-changelog.mjs';

const { check, note, finish } = counter('cov changelog');
const platforms = readJson('assets/data/platforms.json');
const changelog = readJson('assets/data/changelog.json');
const registry = readJson('assets/data/addons/registry.json');
const jmpEntry = registry.addons.find((a) => a.namespace === 'justmoreparts');
const PW = platforms.products.propwash.version;
const JMP = platforms.products.justmoreparts.version;
const live = ['curseforge', 'modrinth'].some((k) => platforms.products.propwash[k].status === 'live');
const STAND = arg('--stand') || (live ? 'release' : 'pre');
const exported = readJson(`${jmpEntry.web_export.path}parts.json`);
const PARTS = Array.isArray(exported) ? exported : exported.parts;
const N = PARTS.length;
const BY_CAT = PARTS.reduce((m, p) => ({ ...m, [p.category]: (m[p.category] || 0) + 1 }), {});
const CATEGORY_WORDS = {
  frame: [/^Frames?$/i, /^Rahmen$/], stack: [/^Stacks?( ?\/ ?AIOs?)?$/i, /^Stacks?( ?\/ ?AIOs?)?$/i], motor: [/^Motors?$/i, /^Motoren$/],
  prop: [/^(Props|Propellers?)$/i, /^(Props|Propeller)$/], video: [/^Video systems?$/i, /^Videosysteme?$/], battery: [/^Batteries$/i, /^Akkus$/],
};
const KINDS = ['highlights', 'new', 'improved', 'fixed', 'compatibility'];
const ADDON_KINDS = ['highlights', 'new', 'server-owners', 'compatibility'];

function releaseChecks(rel, label, { pressure = false, kinds: want = KINDS } = {}) {
  const kinds = rel.sections.map((s) => s.kind);
  const hl = rel.sections.find((s) => s.kind === 'highlights');
  check(!!hl && hl.items.length >= 2 && hl.items.length <= 3, `no. 48 ${label}: two or three highlights (${hl ? hl.items.length : 0})`);
  for (const k of want.slice(1)) check(kinds.includes(k), `no. 48 ${label}: section ${k} (${kinds.join(', ')})`);
  for (const s of rel.sections) for (const i of s.items) check(typeof i.en === 'string' && i.en && (i.de === undefined || typeof i.de === 'string'), `no. 48 ${label}: ${s.kind} entry with text`);
  if (pressure) {
    const plates = rel.sections.flatMap((s) => s.items).filter((i) => /pressure plate/i.test(i.en));
    check(plates.length >= 1, `no. 48 ${label}: an entry about pressure plates`);
    check(plates.some((i) => /bluepanee/.test(i.en) && /bluepanee/.test(i.de || '')), `no. 48 ${label}: the pressure plate entry names bluepanee in English and German`);
  }
}

function released(productId, version) {
  const p = changelog.products.find((x) => x.id === productId);
  return p ? p.releases.find((r) => r.version === version) || null : null;
}

function jmpRepo() {
  const repo = arg('--jmp-repo', 'JMP_SRC') || siblingRepo('propwash-justmoreparts');
  if (!repo) return null;
  const ref = arg('--jmp-ref') || (gitHasRef(repo, 'integration-1.2.0') ? 'integration-1.2.0' : gitHasRef(repo, `v${JMP}`) ? `v${JMP}` : 'HEAD');
  return { repo, ref };
}

function changelogs(jmp) {
  const pw = released('propwash', PW);
  check(!!pw, `no. 48: Propwash ${PW} is in changelog.json (anchor propwash-${PW})`);
  if (pw) {
    releaseChecks(pw, `Propwash ${PW}`, { pressure: true });
    for (const s of pw.sections) for (const i of s.items) check(typeof i.de === 'string' && i.de.trim(), `no. 48 Propwash ${PW}: German text of “${i.en.slice(0, 40)}”`);
  }
  const j = released('jmp', JMP);
  // Just More Parts 1.2.0 fixes nothing: its CHANGELOG.md has no Fixed section, and the page shows none either.
  const jmpKinds = JMP === '1.2.0' ? KINDS.filter((k) => k !== 'fixed') : KINDS;
  if (JMP === '1.2.0') note(`no. 48: Just More Parts ${JMP} has no section Fixed in its CHANGELOG.md, so none is required`);
  let source = null;
  if (j) {
    releaseChecks(j, `Just More Parts ${JMP}`, { kinds: jmpKinds });
    for (const s of j.sections) for (const i of s.items) check(typeof i.de === 'string' && i.de.trim(), `no. 48 Just More Parts ${JMP}: German text of “${i.en.slice(0, 40)}”`);
  } else if (jmp) {
    const md = gitShow(jmp.repo, jmp.ref, 'CHANGELOG.md');
    const rel = md ? parseChangelog(md, `CHANGELOG.md (${jmp.ref})`).find((r) => r.version === JMP) : null;
    if (rel) {
      source = rel;
      releaseChecks({ sections: rel.sections.map((s) => ({ kind: s.kind, items: s.items.map((en) => ({ en })) })) }, `Just More Parts ${JMP} (CHANGELOG.md of ${jmp.ref})`, { kinds: jmpKinds });
    }
  }
  if (!j) {
    const message = `no. 48: Just More Parts ${JMP} is in changelog.json (anchor jmp-${JMP})${source ? ' – its CHANGELOG.md has it, the page not yet' : ` – neither changelog.json nor CHANGELOG.md of ${jmp ? jmp.ref : 'Just More Parts'} has it yet`}`;
    if (STAND === 'release') check(false, message);
    else note(`${message} (pre-release stand; required from the release on)`);
  }
  return { j, source };
}

function addonChangelogs() {
  for (const [id, key, name] of [['camdrones', 'camdrones', 'Camera Drones'], ['mobdefense', 'mobdefense', 'Mob Defense']]) {
    const version = platforms.products[key]?.version || '1.0.0';
    if (!platforms.products[key]) note(`${name}: not in platforms.json yet, checked as ${version}`);
    const product = changelog.products.find((p) => p.id === id);
    check(!!product, `${name}: a product “${id}” in changelog.json (anchor #${id})`);
    const rel = released(id, version);
    check(!!rel, `${name} ${version} is in changelog.json (anchor ${id}-${version})`);
    if (!rel) continue;
    check(rel.id === `${id}-${version}`, `${name} ${version}: anchor ${id}-${version} (${rel.id})`);
    releaseChecks(rel, `${name} ${version}`, { kinds: ADDON_KINDS });
    for (const s of rel.sections) for (const i of s.items) check(typeof i.de === 'string' && i.de.trim(), `${name} ${version}: German text of “${i.en.slice(0, 40)}”`);
    const compat = rel.sections.find((s) => s.kind === 'compatibility');
    for (const lang of ['en', 'de']) {
      const text = compat ? compat.items.map((i) => i[lang] || '').join(' ') : '';
      check(/Propwash FPV 0\.6\.0/.test(text) && /API 1\.8/.test(text), `${name} ${version} (${lang}): Compatibility names Propwash FPV 0.6.0 and add-on API 1.8`);
    }
  }
}

function jmpTexts(entry) {
  const page = read(jmpEntry.page + 'index.html');
  const main = (/<main[\s\S]*<\/main>/.exec(page) || [''])[0];
  const want = {
    en: [[/whoop motors|motors of very high KV/i, 'whoop motors'], [/65\s*mm race whoop/i, 'the preset “65 mm race whoop”'], [/battery plug|plugged[ -]in/i, 'plugged batteries'],
      [/share codes (are now|from) Propwash|Propwash[’']s PW3 codes/i, 'share codes through Propwash'], [new RegExp(`needs Propwash ${jmpEntry.requires.propwash.replace(/\./g, '\\.')}`), `needs Propwash ${jmpEntry.requires.propwash}`]],
    de: [[/Renn-Whoop-Motoren|Motoren sehr hoher KV/, 'Whoop-Motoren'], [/65-mm-Renn-Whoop/, 'das Preset „65-mm-Renn-Whoop“'], [/Akku gesteckt|Akku-Stecker|gesteckte[rn]? Akku/, 'gesteckte Akkus'],
      [/Sharecodes von Propwash|PW3-Codes von Propwash/, 'Sharecodes über Propwash'], [new RegExp(`(braucht|Braucht) Propwash (ab )?${jmpEntry.requires.propwash.replace(/\./g, '\\.')}`), `braucht Propwash ${jmpEntry.requires.propwash}`]],
  };
  for (const lang of ['en', 'de']) {
    const text = plain(langHtml(main, lang));
    for (const [re, label] of want[lang]) check(re.test(text), `no. 34 /${jmpEntry.page} ${lang}: names ${label}`);
    const claims = lang === 'en' ? /(0\.6\.0|Propwash)[^.]*(runs|works) with (Just More Parts )?1\.1/i : /(0\.6\.0|Propwash)[^.]*(läuft|funktioniert)[^.]*mit (Just More Parts )?1\.1/i;
    check(!claims.test(text), `no. 34 /${jmpEntry.page} ${lang}: does not claim that Propwash ${PW} runs with Just More Parts 1.1`);
    const refuses = lang === 'en' ? /refuses Just More Parts 1\.1|with 1\.1 the game doesn[’']t start|update both together/ : /lehnt Just More Parts 1\.1 ab|mit 1\.1 startet das Spiel nicht|beide zusammen/;
    check(refuses.test(text), `no. 34 /${jmpEntry.page} ${lang}: says what Propwash ${PW} does with Just More Parts 1.1 (refuses it, update both)`);
  }
  check(jmpEntry.requires.propwash === PW, `no. 34: registry.json requires Propwash ${jmpEntry.requires.propwash} = ${PW}`);
  if (entry) {
    for (const lang of ['en', 'de']) {
      const text = entry.sections.flatMap((s) => s.items.map((i) => i[lang] || '')).join(' ');
      if (lang === 'de' && !text.trim()) continue;
      for (const [re, label] of want[lang].slice(0, 4)) check(re.test(text), `no. 34 changelog Just More Parts ${JMP} ${lang}: names ${label}`);
      check(new RegExp(`Propwash ${PW.replace(/\./g, '\\.')}`).test(text), `no. 34 changelog Just More Parts ${JMP} ${lang}: names Propwash ${PW} as the requirement`);
    }
  } else {
    note(`no. 34: the changelog entry of Just More Parts ${JMP} is not there yet, its texts are checked once it is`);
  }
}

function count(label, text, where, { atLeast = false } = {}) {
  const exact = [...text.matchAll(/(?<![\d.,])(\d{2,4})\s*(?:more\s+|weitere\s+)?(?:realistic\s+|real-world\s+|echte\s+|realistische\s+)?(?:drone\s+)?(?:parts|Teile|Drohnenteile)\b/gi)].map((m) => Number(m[1]));
  const rough = [...text.matchAll(/(?:more than|over|mehr als|über)\s+(\d{2,4})\s+(?:realistic\s+|realistische\s+|real-world\s+)?(?:parts|Teile)/gi)].map((m) => Number(m[1]));
  const exactOnly = exact.filter((n) => !rough.includes(n));
  for (const n of exactOnly) check(n === N, `no. 34 ${label}: part count ${n} = ${N} of parts.json (${where})`);
  for (const n of rough) check(n < N && N - n < 10, `no. 34 ${label}: “more than ${n}” fits ${N} parts of parts.json (${where})`);
  if (!atLeast) check(exactOnly.length + rough.length > 0, `no. 34 ${label}: names the part count (${where})`);
  return exactOnly.length + rough.length;
}

function categoryTable(label, md) {
  const rows = [...md.matchAll(/^\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|/gm)].map((m) => ({ name: m[1].trim(), n: Number(m[2]) }));
  for (const [cat, [en, de]] of Object.entries(CATEGORY_WORDS)) {
    const row = rows.find((r) => en.test(r.name) || de.test(r.name));
    if (row) check(row.n === BY_CAT[cat], `no. 34 ${label}: ${row.name} ${row.n} = ${BY_CAT[cat]} ${cat} parts of parts.json`);
    else check(false, `no. 34 ${label}: a row for ${cat} in the table`);
  }
}

function partCounts(jmp, entry) {
  const regText = JSON.stringify(jmpEntry);
  count('registry.json', plain(regText), 'card text', { atLeast: true });
  const page = read(jmpEntry.page + 'index.html');
  const total = Number((/data-addon-parts-total>(\d+)</.exec(page) || [])[1]);
  check(total === N, `no. 34 /${jmpEntry.page}: total ${total} = ${N} parts of parts.json`);
  const facts = plain(langHtml((/<dl[\s\S]*?<\/dl>/.exec(page) || [''])[0], 'en'));
  for (const [cat, n] of Object.entries(BY_CAT)) {
    const label = { frame: 'frames', stack: 'stacks', motor: 'motors', prop: 'props', video: 'video systems', battery: 'batteries' }[cat];
    check(new RegExp(`\\b${n}\\s+${label}\\b`).test(facts) || new RegExp(`\\b${n}\\s*${label}`).test(plain(page)), `no. 34 /${jmpEntry.page}: ${n} ${label} as in parts.json`);
  }
  const home = read('index.html');
  const addon = (/<div class="community" id="addon">[\s\S]*?<\/div>/.exec(home) || [''])[0];
  for (const lang of ['en', 'de']) count(`landing page ${lang}`, plain(langHtml(addon, lang)), 'add-on block');
  for (const lang of ['en', 'de']) count(`landing page ${lang}`, plain(langHtml(home, lang)), 'whole page', { atLeast: true });
  if (entry) {
    for (const lang of ['en', 'de']) count(`changelog Just More Parts ${JMP} ${lang}`, entry.sections.flatMap((s) => s.items.map((i) => i[lang] || '')).join(' '), 'entry', { atLeast: true });
  }
  if (!jmp) {
    note('no. 34: no checkout of Just More Parts (--jmp-repo / JMP_SRC): README and docs/modrinth not read');
    return;
  }
  const readme = gitShow(jmp.repo, jmp.ref, 'README.md');
  if (readme) {
    count(`README.md (${jmp.ref})`, readme, 'intro');
    categoryTable(`README.md (${jmp.ref})`, readme);
  } else check(false, `no. 34: README.md of Just More Parts (${jmp.ref}) readable`);
  for (const file of ['docs/modrinth/description.md', 'docs/modrinth/description_de.md', 'docs/modrinth/listing.md']) {
    const md = gitShow(jmp.repo, jmp.ref, file);
    if (!md) { note(`no. 34: ${file} not in ${jmp.ref}`); continue; }
    count(`${file} (${jmp.ref})`, md, 'text');
    if (file.startsWith('docs/modrinth/description')) categoryTable(`${file} (${jmp.ref})`, md);
  }
  note(`no. 34: Just More Parts texts read from ${jmp.ref}; ${N} parts in ${jmpEntry.web_export.path}parts.json`);
}

function main() {
  note(`stand: ${STAND} (Propwash ${PW}, Just More Parts ${JMP})`);
  const jmp = jmpRepo();
  const { j, source } = changelogs(jmp);
  addonChangelogs();
  const entry = j || (source ? { sections: source.sections.map((s) => ({ kind: s.kind, items: s.items.map((en) => ({ en })) })) } : null);
  jmpTexts(entry);
  partCounts(jmp, entry);
  finish(`${STAND} stand; Propwash ${PW}${j ? `, Just More Parts ${JMP}` : ''}, Camera Drones and Mob Defense; ${N} parts of Just More Parts ${JMP}`);
}

main();
