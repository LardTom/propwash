#!/usr/bin/env node
// The directory data behind share codes (share codes PW3, 3.6, 3.16 and 6.5):
//   - assets/data/addons/directory.json is what tools/build-addons.mjs makes of the registry, platforms.json and the
//     hosted exports; short ids are unique, 1 = propwash and 2 = justmoreparts are fixed, the Modrinth and CurseForge
//     slugs are the ones of assets/data/platforms.json
//   - the parts table of every hosted version: right namespace and short id, the manifest's checksum and size, "since"
//     never falling and never after the version itself; a newer version only appends to an older one, and a version
//     that was hosted at the last release (newest tag v*, else origin/main, or --against <ref>) keeps its entries
//   - the directory copy in Propwash (data/propwash/propwash_share/directory.json, from --propwash-repo or
//     PROPWASH_REPO) fits: the same add-ons with the same short ids, slugs as platforms.json, its tables are a start
//     of the hosted ones, its versions not newer than the listed ones; Propwash's tools/sharecode/sync_directory.py
//     reads this site's directory.json (with --jmp-jar: and the jar) and gives the same add-ons
//   - headless Chrome, English and German, 390 and 1280 px: /addons/ with the cards, the filter by kind, the
//     downloads (only CurseForge and Modrinth), “Show in the configurator” (the add-on bar shows the add-on on and
//     its parts are in the pickers) and the page of Just More Parts with its part list; no sideways scrolling
//
//   node tools/test-directory.mjs [--propwash-repo <dir>] [--jmp-jar <jar>] [--against <ref>] [--no-browser] [--shots <dir>] [--chrome <path>]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tableAppendOnly, slugs, listed, compareVersions } from '../assets/js/configurator/directory.js';
import { tableCrc, tableEntries } from '../assets/js/configurator/catalog-build.js';
import { parseDirectory } from '../assets/js/configurator/sharecode3.js';
import { context, directoryJson, versionDir, DIRECTORY } from './build-addons.mjs';
import { CHROME, serve, launch, cdp, sleep } from './headless-chrome.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name, env) => {
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  return env && process.env[env] ? process.env[env] : null;
};
const PW_REPO = arg('--propwash-repo', 'PROPWASH_REPO');
const JMP_JAR = arg('--jmp-jar', 'PROPWASH_JMP_JAR');
const SHOTS = arg('--shots');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let checks = 0;
const failures = [];
const notes = [];
function check(ok, message) {
  checks++;
  if (!ok) failures.push(message);
  return !!ok;
}

const ctx = context(ROOT);
const { registry, platforms, hosted } = ctx;
const directory = JSON.parse(read(DIRECTORY));

// 1. directory.json
check(JSON.stringify(directory) === JSON.stringify(directoryJson(ctx)), `${DIRECTORY} is out of date – run node tools/build-addons.mjs`);
check(directory.format === 1 && directory.source === 'propwashfpv.com/addons/', 'directory.json: format 1 from propwashfpv.com/addons/');
const ids = directory.addons.map((a) => a.short_id);
check(new Set(ids).size === ids.length, `short ids unique (${ids})`);
check(new Set(directory.addons.map((a) => a.namespace)).size === directory.addons.length, 'namespaces unique');
check(directory.addons[0].namespace === 'propwash' && directory.addons[0].short_id === 1, '1 = propwash');
check(directory.addons.some((a) => a.namespace === 'justmoreparts' && a.short_id === 2), '2 = justmoreparts');
const parsed = parseDirectory(directory);
check(parsed.addons.length === directory.addons.length, 'the share-code reader of the configurator takes every entry');
for (const a of directory.addons) {
  const product = a.namespace === 'propwash' ? registry.base.platforms : (registry.addons.find((x) => x.namespace === a.namespace) || {}).platforms;
  const s = slugs(platforms, product);
  check(a.modrinth === s.modrinth && a.curseforge === s.curseforge, `${a.namespace}: slugs ${a.modrinth}/${a.curseforge} = platforms.json (${s.modrinth}/${s.curseforge})`);
  check(Array.isArray(a.versions) && a.versions.length, `${a.namespace}: versions`);
}

// 2. Parts tables of the hosted versions.
const tableOf = (ns, v) => {
  const file = path.join(ROOT, versionDir(ns, v), 'share_table.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
};
for (const a of registry.addons) {
  const versions = (a.versions || []).filter((v) => hosted[a.namespace] && hosted[a.namespace][v]);
  for (const v of versions) {
    const m = hosted[a.namespace][v];
    const table = tableOf(a.namespace, v);
    if (!check(table, `${a.namespace} ${v}: parts table`)) continue;
    check(table.format === 1 && table.namespace === a.namespace && table.short_id === a.short_id, `${a.namespace} ${v}: table of ${table.namespace} with short id ${table.short_id}`);
    check(tableCrc(table) === m.table_crc && tableEntries(table) === m.table_entries, `${a.namespace} ${v}: checksum ${m.table_crc} and ${m.table_entries} entries`);
    const entry = directory.addons.find((x) => x.namespace === a.namespace).versions.find((x) => x.version === v);
    check(entry && entry.table_crc === m.table_crc && entry.catalog === versionDir(a.namespace, v), `${a.namespace} ${v}: directory.json names the table and the hosted data`);
    for (const [kind, entries] of Object.entries(table.parts)) {
      for (let i = 1; i < entries.length; i++) {
        check(compareVersions(entries[i - 1].since.split('-')[0], entries[i].since.split('-')[0]) <= 0, `${a.namespace} ${v} ${kind} #${i + 1}: since ${entries[i].since} after ${entries[i - 1].since}`);
      }
      for (const e of entries) check(compareVersions(e.since.split('-')[0], v) <= 0, `${a.namespace} ${v} ${kind} ${e.id}: since ${e.since} is after the version`);
    }
  }
  for (let i = 1; i < versions.length; i++) {
    const d = tableAppendOnly(tableOf(a.namespace, versions[i - 1]), tableOf(a.namespace, versions[i]));
    check(!d.length, `${a.namespace}: ${versions[i]} only appends to ${versions[i - 1]}: ${d.join('; ')}`);
  }
}
const synthetic = { format: 1, namespace: 'x', short_id: 2, parts: { motor: [{ id: 'a', since: '1.0.0' }, { id: 'b', since: '1.0.0' }] } };
check(!tableAppendOnly(synthetic, { ...synthetic, parts: { motor: [...synthetic.parts.motor, { id: 'c', since: '1.2.0' }] } }).length, 'table check: an appended entry is fine');
check(tableAppendOnly(synthetic, { ...synthetic, parts: { motor: [synthetic.parts.motor[1], synthetic.parts.motor[0]] } }).length > 0, 'table check: a renumbered entry is refused');
check(tableAppendOnly(synthetic, { ...synthetic, parts: { motor: [synthetic.parts.motor[0]] } }).length > 0, 'table check: a removed entry is refused');

// 3. Against the last release.
function git(args) {
  try {
    return execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}
const ref = arg('--against') || (git(['tag', '--list', 'v*', '--sort=-v:refname']) || '').split('\n').filter(Boolean)[0] || 'origin/main';
let compared = 0;
for (const a of registry.addons) {
  for (const v of a.versions || []) {
    const old = git(['show', `${ref}:${versionDir(a.namespace, v)}share_table.json`]);
    if (!old) continue;
    compared++;
    const d = tableAppendOnly(JSON.parse(old), tableOf(a.namespace, v));
    check(!d.length, `${a.namespace} ${v} against ${ref}: ${d.join('; ')}`);
  }
}
if (!compared) notes.push(`${ref} hosts no parts table yet – nothing to compare`);

// 4. Propwash's directory copy and its sync tool.
if (PW_REPO) {
  const copyFile = path.join(PW_REPO, 'common/src/main/resources/data/propwash/propwash_share/directory.json');
  if (check(fs.existsSync(copyFile), `Propwash's directory copy at ${copyFile}`)) {
    const copy = JSON.parse(fs.readFileSync(copyFile, 'utf8'));
    for (const c of copy.addons) {
      const ours = directory.addons.find((a) => a.namespace === c.namespace);
      if (!check(ours, `Propwash's copy names ${c.namespace}, the directory does not`)) continue;
      check(ours.short_id === c.short_id, `${c.namespace}: short id ${c.short_id} in Propwash, ${ours.short_id} here`);
      const product = c.namespace === 'propwash' ? registry.base.platforms : (registry.addons.find((x) => x.namespace === c.namespace) || {}).platforms;
      const s = slugs(platforms, product);
      check(c.modrinth === s.modrinth && c.curseforge === s.curseforge, `${c.namespace}: Propwash's slugs ${c.modrinth}/${c.curseforge} = platforms.json`);
      const newest = ours.versions[ours.versions.length - 1].version;
      check(!c.version || compareVersions(c.version.split('-')[0], newest) <= 0, `${c.namespace}: Propwash knows ${c.version}, the directory lists up to ${newest}`);
      if (c.table) {
        const hostedTable = tableOf(c.namespace, newest);
        if (check(hostedTable, `${c.namespace}: hosted table of ${newest}`)) {
          const strip = (t) => ({ ...t, parts: Object.fromEntries(Object.entries(t.parts).map(([k, list]) => [k, list.map(({ name, ...e }) => e)])) });
          const d = tableAppendOnly(strip(c.table), hostedTable);
          check(!d.length, `${c.namespace}: Propwash's table is a start of the hosted one: ${d.join('; ')}`);
        }
      }
    }
    for (const a of directory.addons) check(a.namespace === 'propwash' || copy.addons.some((c) => c.namespace === a.namespace) || !a.official, `${a.namespace}: official, but not in Propwash's copy yet`);
  }
  const tool = path.join(PW_REPO, 'tools/sharecode/sync_directory.py');
  if (fs.existsSync(tool)) {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pw-sync-')), 'directory.json');
    const args = [tool, '--site', path.join(ROOT, DIRECTORY), '--out', out, '--propwash-version', platforms.products.propwash.version];
    if (JMP_JAR && fs.existsSync(JMP_JAR)) args.push('--addon', `justmoreparts=${path.resolve(JMP_JAR)}`);
    let ran = false;
    try {
      execFileSync('python3', ['-I', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      ran = true;
    } catch (e) {
      check(false, `sync_directory.py with this site's directory.json: ${e.stderr || e.message}`);
    }
    if (ran) {
      const synced = JSON.parse(fs.readFileSync(out, 'utf8'));
      const official = directory.addons.filter((a) => a.official);
      check(JSON.stringify(synced.addons.map((a) => [a.namespace, a.short_id, a.modrinth, a.curseforge])) === JSON.stringify(official.map((a) => [a.namespace, a.short_id, a.modrinth, a.curseforge])),
        `sync_directory.py: the same official add-ons, short ids and slugs (${synced.addons.map((a) => `${a.namespace}=${a.short_id}`)})`);
      if (JMP_JAR) {
        const j = synced.addons.find((a) => a.namespace === 'justmoreparts');
        const hostedTable = tableOf('justmoreparts', registry.addons.find((a) => a.namespace === 'justmoreparts').versions.at(-1));
        const strip = (t) => Object.fromEntries(Object.entries(t.parts).map(([k, list]) => [k, list.map(({ name, ...e }) => e)]));
        check(j && j.table && JSON.stringify(strip(j.table)) === JSON.stringify(strip(hostedTable)), 'sync_directory.py with the jar: the same table as the hosted one');
      }
      notes.push(`sync_directory.py read this site's directory.json${JMP_JAR ? ' and the jar' : ''}: ${synced.addons.length} add-ons`);
    }
    fs.rmSync(path.dirname(out), { recursive: true, force: true });
  }
} else {
  notes.push('no Propwash checkout (--propwash-repo / PROPWASH_REPO): its directory copy and sync tool are not checked');
}

// 5. Headless Chrome.
const VIEWPORTS = { 1280: { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, 390: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true } };

async function browserTests() {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-dir-chrome-'));
  const { child, ws } = await launch(arg('--chrome') || CHROME, profile);
  const browser = cdp(ws);
  const errors = [];
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
    browser.on('Runtime.exceptionThrown', (p) => errors.push(`exception: ${p.exceptionDetails.exception?.description || p.exceptionDetails.text}`));
    browser.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error') errors.push(`console.error: ${p.args.map((a) => a.value ?? a.description).join(' ')}`);
    });
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    let language = 'en';
    async function open(url, width, ready) {
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
      await evaluate('document.fonts.ready.then(() => true)');
      await sleep(250);
    }
    async function shot(name) {
      if (!SHOTS) return;
      const size = await evaluate('({ w: document.documentElement.clientWidth, h: document.documentElement.scrollHeight })');
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: size.w, height: Math.min(size.h, 6000), scale: 1 } });
      fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(r.data, 'base64'));
    }
    const noSideways = async (label, width) => {
      const w = await evaluate('document.documentElement.scrollWidth');
      check(w <= width, `${label}: no sideways scrolling (${w} px)`);
    };
    const jmp = registry.addons.find((a) => a.namespace === 'justmoreparts');
    const jmpParts = JSON.parse(read(`${versionDir('justmoreparts', jmp.web_export.version)}parts.json`));
    const loaded = "document.readyState === 'complete'";
    for (const lang of ['en', 'de']) {
      language = lang;
      for (const width of [1280, 390]) {
        const tag = `${lang}-${width}`;
        await open(`${base}/addons/`, width, loaded);
        const page = await evaluate(`(() => ({
          lang: document.documentElement.lang,
          cards: [...document.querySelectorAll('[data-addons-cards] [data-addon]')].map((c) => ({ ns: c.dataset.addon, hidden: c.hidden, total: c.querySelector('[data-addon-parts-total]')?.textContent })),
          links: [...document.querySelectorAll('main a[href^="http"]')].map((a) => ({ href: a.href, text: a.textContent.trim(), label: a.getAttribute('aria-label') })),
          title: document.title,
          current: document.querySelector('.site-nav a[aria-current="page"]')?.getAttribute('href'),
        }))()`);
        check(page.lang === lang, `/addons/ ${tag}: language ${page.lang}`);
        check(page.cards.length === listed(registry).length && page.cards.every((c) => !c.hidden), `/addons/ ${tag}: ${page.cards.length} cards`);
        check(page.cards.find((c) => c.ns === 'justmoreparts')?.total === String(jmpParts.length), `/addons/ ${tag}: JMP card counts ${jmpParts.length} parts`);
        check(page.current === './', `/addons/ ${tag}: the navigation marks Add-ons (${page.current})`);
        for (const l of page.links) {
          const ok = /^https:\/\/(www\.curseforge\.com|modrinth\.com)\//.test(l.href) || (/^https:\/\/github\.com\/LardTom\//.test(l.href) && !l.text && l.label)
            || /^https:\/\/discord\.gg\//.test(l.href) || /^https:\/\/github\.com\/LardTom\/propwash\/issues\/new\?template=[\w.-]+$/.test(l.href);
          check(ok, `/addons/ ${tag}: link ${l.href} “${l.text}”`);
        }
        await shot(`addons-${tag}`);
        await noSideways(`/addons/ ${tag}`, width);
        const filtered = await evaluate(`(async () => {
          const pick = (k) => document.querySelector('[data-addons-filter] [data-kind="' + k + '"]').click();
          pick('modes'); await new Promise((r) => setTimeout(r, 60));
          const modes = { hidden: [...document.querySelectorAll('[data-addons-cards] [data-addon]')].every((c) => c.hidden), none: !document.querySelector('[data-addons-none]').hidden,
            pressed: document.querySelector('[data-kind="modes"]').getAttribute('aria-pressed') };
          pick('parts'); await new Promise((r) => setTimeout(r, 60));
          const parts = { shown: !document.querySelector('[data-addon="justmoreparts"]').hidden, none: !document.querySelector('[data-addons-none]').hidden };
          pick('all');
          return { modes, parts };
        })()`);
        check(filtered.modes.hidden && filtered.modes.none && filtered.modes.pressed === 'true', `/addons/ ${tag}: filter “game modes” hides Just More Parts and says so`);
        check(filtered.parts.shown && !filtered.parts.none, `/addons/ ${tag}: filter “parts” shows Just More Parts`);
        // “Show in the configurator”
        const href = await evaluate("document.querySelector('[data-addon=\"justmoreparts\"] a[href*=\"configurator/?addon=\"]').href");
        await open(href, width, `(() => { const c = document.querySelector('[data-cfg]'); return !!(c && c.getAttribute('aria-busy') === 'false' && document.querySelector('[data-addon-bar]')); })()`);
        const cfg = await evaluate(`(async () => {
          const row = document.querySelector('[data-addon-item="justmoreparts"]');
          document.querySelector('[data-slots] [data-cat="frame"]').click();
          await new Promise((r) => setTimeout(r, 120));
          const all = document.querySelector('[data-picker] [data-cls="all"]');
          if (all) { all.click(); await new Promise((r) => setTimeout(r, 120)); }
          return { on: row && row.querySelector('[role=switch]').getAttribute('aria-checked'), text: row && row.textContent,
            message: (document.querySelector('.addon-bar__message') || {}).textContent || '',
            frames: [...document.querySelectorAll('[data-picker] [role=option]')].filter((o) => o.dataset.id.startsWith('justmoreparts:')).length };
        })()`);
        const wantFrames = jmpParts.filter((p) => p.category === 'frame').length;
        check(cfg.on === 'true' && cfg.text.includes(jmp.name), `configurator ${tag}: the add-on bar shows ${jmp.name} on`);
        check(cfg.frames === wantFrames, `configurator ${tag}: ${cfg.frames} JMP frames in the picker, parts.json has ${wantFrames}`);
        check(cfg.message.length > 5, `configurator ${tag}: says the add-on is on (“${cfg.message}”)`);
        if (width === 1280) await shot(`addons-configurator-${tag}`);
        // The page of Just More Parts.
        await open(`${base}/${jmp.page}`, width, loaded);
        const sub = await evaluate(`(() => ({
          total: document.querySelector('[data-addon-parts-total]')?.textContent,
          listed: document.querySelectorAll('details.addon-parts [data-part]').length,
          groups: document.querySelectorAll('details.addon-parts').length,
          buttons: [...document.querySelectorAll('.addons-actions a.btn')].map((a) => a.href),
        }))()`);
        check(sub.total === String(jmpParts.length) && sub.listed === jmpParts.length, `JMP page ${tag}: ${sub.total} parts, ${sub.listed} listed`);
        check(sub.groups === new Set(jmpParts.map((p) => p.category)).size, `JMP page ${tag}: one list per category (${sub.groups})`);
        check(sub.buttons.some((h) => h.startsWith('https://www.curseforge.com/')) && sub.buttons.some((h) => h.startsWith('https://modrinth.com/')), `JMP page ${tag}: CurseForge and Modrinth buttons`);
        await evaluate("document.querySelector('details.addon-parts').open = true");
        await shot(`addons-jmp-${tag}`);
        await noSideways(`JMP page ${tag}`, width);
      }
    }
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
  }
}

async function main() {
  if (!argv.includes('--no-browser')) await browserTests();
  else notes.push('headless Chrome skipped (--no-browser)');
  for (const n of notes) console.log(`note: ${n}`);
  if (failures.length) {
    for (const f of failures.slice(0, 60)) console.log(`  FAIL ${f}`);
    console.log(`directory: ${checks - failures.length}/${checks} checks passed`);
    process.exit(1);
  }
  console.log(`PASS: directory: ${checks} checks passed (${directory.addons.map((a) => `${a.short_id} ${a.namespace}`).join(', ')})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
