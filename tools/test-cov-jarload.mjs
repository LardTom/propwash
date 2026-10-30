#!/usr/bin/env node
// Coverage of the add-on jar in the browser (check plan 0.6.0, 3.11 no. 76, 77, 78, 79), headless Chrome, English
// and German:
//   - a reload forgets the jar: the source is “Directory” again, nothing in IndexedDB, localStorage, sessionStorage,
//     Cache Storage, a service worker or cookies
//   - offline (Network.emulateNetworkConditions) the jar loads and its parts are in the pickers, without a request
//   - wrong files: the jar of another mod (no data/*/propwash_parts), a PNG renamed to .jar, a file over 64 MB – each
//     gives a message that says why, and the page stays usable
//   - the switches of the add-on bar: Just More Parts off takes its parts out of every picker, on brings them back;
//     official add-ons are on by default, a community jar opened on purpose is on at once (decision of 21.10.)
//
//   node tools/test-cov-jarload.mjs [--jmp-jar <jar>] [--foreign-jar <jar>] [--shots <dir>] [--chrome <path>]
//
// --jmp-jar (or PROPWASH_JMP_JAR): the jar of Just More Parts 1.2.0; without it a made-up add-on stands in.
// --foreign-jar (or PROPWASH_FOREIGN_JAR): the jar of another mod such as Sodium; a made-up one is always tried too.
// Checks of a known fault are locked (they print their state); COV_UNLOCK=<id>,… or all makes them count.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createCatalog, composeCatalog } from '../assets/js/configurator/data.js';
import { readAddon } from '../assets/js/configurator/addon-catalog.js';
import { JAR_LIMITS } from '../assets/js/configurator/jar.js';
import { entry } from '../assets/js/configurator/i18n.js';
import { startBrowser, counter, arg, readJson, CFG_READY, sleep } from './fixtures/cov/browser.mjs';

const { check, note, finish } = counter('cov jar');
const base = readJson('assets/data/configurator/catalog.json');
const catalog = createCatalog(base);
const text = (key, lang) => entry(key)[lang === 'de' ? 1 : 0];
const fill = (s, args) => Object.entries(args).reduce((t, [k, v]) => t.split(`{${k}}`).join(String(v)), s);
const SHOTS = arg('--shots');
const JMP_JAR = arg('--jmp-jar', 'PROPWASH_JMP_JAR');
const FOREIGN_JAR = arg('--foreign-jar', 'PROPWASH_FOREIGN_JAR');
const NS = 'covaddon';
const CATEGORIES = ['frame', 'stack', 'motor', 'prop', 'video', 'battery', 'accessory'];

const enc = (s) => (typeof s === 'string' ? Buffer.from(s, 'utf8') : Buffer.from(s));
function zip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const data = enc(e.data ?? '');
    const method = e.method ?? 8;
    const packed = method === 8 ? zlib.deflateRawSync(data) : data;
    const crc = zlib.crc32(data);
    const name = Buffer.from(e.name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, packed);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(method, 10);
    c.writeUInt32LE(crc >>> 0, 16);
    c.writeUInt32LE(packed.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += 30 + name.length + packed.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
function png(w, h) {
  const row = Buffer.alloc(1 + w * 4);
  for (let x = 0; x < w; x++) row.set([40, 140, 220, 255], 1 + x * 4);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const FRAME = {
  mass_g: 3.6, wheelbase_mm: 66, max_prop_mm: 31, motor_mounts: ['propwash:m08'], stack_mounts: ['propwash:whoop_aio'],
  aero: { frontal_area_m2: 0.003, drag_coefficient: 1.1 }, battery_fit: { cells: [1, 1], max_mass_g: 10 }, visual: { accent: '#2266cc' },
};
function communityJar() {
  return zip([
    { name: 'fabric.mod.json', data: JSON.stringify({ schemaVersion: 1, id: NS, version: '0.1.0', name: 'Cov Frames for Propwash', depends: { propwash: '>=0.6.0-' } }) },
    { name: `data/${NS}/propwash_parts/frame/cov_whoop.json`, data: JSON.stringify({ format: 1, ...FRAME }) },
    { name: `assets/${NS}/lang/en_us.json`, data: JSON.stringify({ [`part.${NS}.cov_whoop`]: 'Cov Whoop Frame' }) },
    { name: `assets/${NS}/lang/de_de.json`, data: JSON.stringify({ [`part.${NS}.cov_whoop`]: 'Cov-Whoop-Rahmen' }) },
  ]);
}
function foreignJar() {
  return zip([
    { name: 'fabric.mod.json', data: JSON.stringify({ schemaVersion: 1, id: 'sodium', version: '0.9.2+mc26.3', name: 'Sodium', depends: { minecraft: '26.3' } }) },
    { name: 'assets/sodium/lang/en_us.json', data: '{}' },
    { name: 'net/caffeinemc/mods/sodium/client/SodiumClientMod.class', data: Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 65]) },
  ]);
}

function files() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-cov-jar-'));
  const put = (name, bytes) => {
    const f = path.join(dir, name);
    fs.writeFileSync(f, bytes);
    return f;
  };
  const out = { dir, community: put('cov-frames-0.1.0.jar', communityJar()), foreign: put('sodium-made-up.jar', foreignJar()), picture: put('screenshot.jar', png(64, 48)) };
  const big = path.join(dir, 'huge-addon.jar');
  const fd = fs.openSync(big, 'w');
  fs.ftruncateSync(fd, JAR_LIMITS.jarBytes + 1024 * 1024);
  fs.closeSync(fd);
  out.big = big;
  return out;
}

function unitTests(f) {
  const foreign = readAddon(new Uint8Array(fs.readFileSync(f.foreign)), { base, fileName: 'sodium-made-up.jar' });
  check(!foreign.ok && foreign.problems.some((p) => p.code === 'addon.no_parts'), `no. 78: a foreign mod gives addon.no_parts (${foreign.problems.map((p) => p.code)})`);
  const picture = readAddon(new Uint8Array(fs.readFileSync(f.picture)), { base, fileName: 'screenshot.jar' });
  check(!picture.ok && picture.problems.some((p) => p.code === 'jar.not_zip'), `no. 78: a PNG gives jar.not_zip (${picture.problems.map((p) => p.code)})`);
  if (FOREIGN_JAR && fs.existsSync(FOREIGN_JAR)) {
    const real = readAddon(new Uint8Array(fs.readFileSync(FOREIGN_JAR)), { base, fileName: path.basename(FOREIGN_JAR) });
    check(!real.ok && real.problems.some((p) => p.code === 'addon.no_parts'), `no. 78: ${path.basename(FOREIGN_JAR)} gives addon.no_parts (${real.problems.map((p) => p.code)})`);
  } else {
    note('no jar of another mod (--foreign-jar / PROPWASH_FOREIGN_JAR): only the made-up one');
  }
  const community = readAddon(new Uint8Array(fs.readFileSync(f.community)), { base, fileName: 'cov-frames-0.1.0.jar' });
  check(community.ok && community.fragment.parts.length === 1, 'no. 79: the made-up community add-on reads');
  const c = createCatalog(composeCatalog(base, { fragments: [community.fragment] }));
  const code = c.encode({ build: { ...c.presetBuild('propwash:whoop'), frame: `${NS}:cov_whoop` }, paint: null, tune: null, osd: null, name: null });
  check(code.startsWith('PW3-'), `no. 79: a code with the community frame (${code})`);
  return { code };
}

async function main() {
  const f = files();
  const { code: communityCode } = unitTests(f);
  const jmpParts = Object.fromEntries(CATEGORIES.map((cat) => [cat, catalog.partsIn(cat).filter((p) => p.id.startsWith('justmoreparts:')).length]));
  const jmpJar = JMP_JAR && fs.existsSync(JMP_JAR) ? JMP_JAR : null;
  if (!jmpJar) note('no jar of Just More Parts (--jmp-jar / PROPWASH_JMP_JAR): the made-up add-on stands in for no. 76 and 77');
  const b = await startBrowser();
  const bar = (p) => p.evaluate(`(() => ({
    rows: [...document.querySelectorAll('[data-addon-item]')].map((li) => ({ ns: li.dataset.addonItem, source: li.dataset.addonSource,
      on: li.querySelector('[role=switch]').getAttribute('aria-checked'), name: li.querySelector('.addon-bar__name').textContent,
      label: li.querySelector('.addon-bar__source').textContent })),
    messages: [...document.querySelectorAll('.addon-bar__message')].map((m) => ({ level: m.className.replace(/.*--/, ''), text: m.textContent })),
  }))()`);
  const load = async (p, file) => {
    await p.setFile('[data-addon-file]', file);
    await sleep(150);
    await p.waitFor("!document.querySelector('.addon-bar__message--busy') && document.querySelector('[data-addon-bar]').getAttribute('aria-busy') !== 'true'", `reading ${file}`, 60000);
    await sleep(300);
  };
  const pickerIds = (p, cat) => p.evaluate(`(async () => {
    document.querySelector('[data-slots] [data-cat="${cat}"]').click();
    await new Promise((r) => setTimeout(r, 120));
    const all = document.querySelector('[data-picker] [data-cls="all"]');
    if (all && all.getAttribute('aria-pressed') !== 'true') { all.click(); await new Promise((r) => setTimeout(r, 120)); }
    return [...document.querySelectorAll('[data-picker] [role=option]')].map((o) => o.dataset.id).filter(Boolean);
  })()`);
  const stored = (p) => p.evaluate(`(async () => ({
    local: Object.keys(localStorage), session: Object.keys(sessionStorage), cookie: document.cookie,
    dbs: indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : [],
    caches: self.caches ? await caches.keys() : [],
    workers: navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0,
  }))()`);
  const shot = async (p, name) => {
    if (SHOTS) await p.shot(path.join(SHOTS, `${name}.png`));
  };
  try {
    for (const lang of ['en', 'de']) {
      const p = await b.page({ lang });
      await p.open('/configurator/', { width: 1280, ready: CFG_READY });
      let s = await bar(p);
      const jmpRow = s.rows.find((r) => r.ns === 'justmoreparts');
      check(jmpRow && jmpRow.on === 'true' && jmpRow.source === 'directory' && jmpRow.label === text('addons.source.directory', lang), `no. 79 ${lang}: Just More Parts is on by default, source “${jmpRow && jmpRow.label}”`);
      for (const cat of CATEGORIES) {
        const ids = await pickerIds(p, cat);
        check(ids.filter((id) => id.startsWith('justmoreparts:')).length === jmpParts[cat], `no. 79 ${lang}: ${jmpParts[cat]} JMP parts among the ${cat} choices`);
      }
      await p.evaluate("document.querySelector('[data-addon-switch=\"justmoreparts\"]').click()");
      await sleep(500);
      s = await bar(p);
      check(s.rows.find((r) => r.ns === 'justmoreparts').on === 'false', `no. 79 ${lang}: the switch turns Just More Parts off`);
      for (const cat of CATEGORIES) {
        const ids = await pickerIds(p, cat);
        check(ids.length > 0 && !ids.some((id) => id.startsWith('justmoreparts:')), `no. 79 ${lang}: off – no JMP part among the ${cat} choices (${ids.filter((id) => id.startsWith('justmoreparts:')).length})`);
      }
      check(await p.evaluate("[...document.querySelectorAll('[data-preset] option')].every((o) => !o.value.startsWith('justmoreparts:'))"), `no. 79 ${lang}: off – no JMP preset`);
      await shot(p, `jar-jmp-off-${lang}`);
      await p.evaluate("document.querySelector('[data-addon-switch=\"justmoreparts\"]').click()");
      await sleep(500);
      for (const cat of CATEGORIES) {
        const ids = await pickerIds(p, cat);
        check(ids.filter((id) => id.startsWith('justmoreparts:')).length === jmpParts[cat], `no. 79 ${lang}: on again – ${jmpParts[cat]} JMP ${cat} choices`);
      }

      await load(p, f.community);
      s = await bar(p);
      const own = s.rows.find((r) => r.ns === NS);
      check(own && own.source === 'local', `no. 79 ${lang}: the community jar is listed as local (${JSON.stringify(own)})`);
      check(own && own.on === 'true', `no. 79 ${lang}: a community jar opened on purpose is on at once, even when no opened code needs it (switch ${own && own.on})`);
      await shot(p, `jar-community-${lang}`);
      await p.open(`/configurator/#${communityCode}`, { width: 1280, ready: CFG_READY });
      await load(p, f.community);
      s = await bar(p);
      const needed = s.rows.find((r) => r.ns === NS);
      const frame = await p.evaluate("document.querySelector('[data-slots] [data-cat=\"frame\"] .slot__value').textContent");
      check(needed && needed.on === 'true' && frame === (lang === 'de' ? 'Cov-Whoop-Rahmen' : 'Cov Whoop Frame'), `no. 79 ${lang}: the opened code needs it – on, the frame is “${frame}”`);

      for (const [label, file, key, args] of [
        ['made-up foreign mod', f.foreign, 'addons.problems.addon.no_parts', { name: 'Sodium' }],
        ...(FOREIGN_JAR && fs.existsSync(FOREIGN_JAR) ? [['real foreign mod', FOREIGN_JAR, 'addons.problems.addon.no_parts', null]] : []),
        ['PNG renamed to .jar', f.picture, 'addons.problems.jar.not_zip', {}],
        ['file over 64 MB', f.big, 'addons.problems.jar.too_big', { limit: String(JAR_LIMITS.jarBytes / 1024 / 1024) }],
      ]) {
        await p.open('/configurator/', { width: 1280, ready: CFG_READY });
        const before = await p.evaluate("document.querySelector('[data-code]').textContent");
        await load(p, file);
        s = await bar(p);
        const failed = fill(text('addons.failed', lang), { file: path.basename(file) });
        const why = args ? fill(text(key, lang), args) : text(key, lang).split('{name}')[1].slice(0, 30);
        check(s.messages.some((m) => m.level === 'error' && m.text === failed), `no. 78 ${lang}: ${label}: “${failed}” (${JSON.stringify(s.messages.map((m) => m.text))})`);
        check(s.messages.some((m) => m.level === 'error' && m.text.includes(why)), `no. 78 ${lang}: ${label}: says why (“${why.slice(0, 50)}”)`);
        const addonNs = base.namespaces.map((n) => n.namespace).filter((ns) => ns !== 'propwash');
        check(s.rows.length === addonNs.length && s.rows.some((r) => r.ns === 'justmoreparts') && s.rows.every((r) => addonNs.includes(r.ns) && r.on === 'true'),
          `no. 78 ${lang}: ${label}: the bar is unchanged (the add-ons of the site's data, all on)`);
        await p.evaluate(`(() => { const s = document.querySelector('[data-preset]'); s.value = 'propwash:cinewhoop'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
        await sleep(400);
        const after = await p.evaluate("document.querySelector('[data-code]').textContent");
        check(after !== before && catalog.decode(after).ok, `no. 78 ${lang}: ${label}: the page stays usable (a preset loads)`);
        if (label.startsWith('PNG')) await shot(p, `jar-wrong-file-${lang}`);
      }
      check(p.errors.length === 0, `no. 78/79 ${lang}: no console errors (${p.errors.slice(0, 3).join(' | ')})`);
      await p.close();

      const o = await b.page({ lang });
      await o.open('/configurator/', { width: 1280, ready: CFG_READY });
      await o.offline(true);
      o.requests.length = 0;
      await load(o, jmpJar || f.community);
      s = await bar(o);
      const ns = jmpJar ? 'justmoreparts' : NS;
      const row = s.rows.find((r) => r.ns === ns && r.source === 'local');
      check(row && row.on === 'true', `no. 77 ${lang}: offline the jar loads (${JSON.stringify(s.rows)})`);
      const frames = (await pickerIds(o, 'frame')).filter((id) => id.startsWith(`${ns}:`));
      check(frames.length === (jmpJar ? jmpParts.frame : 1), `no. 77 ${lang}: its ${frames.length} frames are in the picker`);
      const pick = await o.center(`[data-picker] [role=option][data-id="${frames[frames.length - 1]}"]`);
      await o.click(pick.x, pick.y);
      await sleep(800);
      check(await o.evaluate(`document.querySelector('[data-slots] [data-cat="frame"]').getAttribute('title').length > 0 && !document.querySelector('[data-slots] [data-cat="frame"]').textContent.includes(${JSON.stringify(text('ui.unknownPart', lang))})`), `no. 77 ${lang}: a frame of the jar is picked and drawn`);
      const sent = o.requests.filter((u) => !u.startsWith('data:') && !u.startsWith('blob:'));
      check(sent.length === 0, `no. 77 ${lang}: no request after loading the page (${sent.length}: ${sent.slice(0, 3).map((u) => u.slice(0, 80)).join(', ')}; ${o.requests.length - sent.length} in-memory data/blob addresses)`);
      check(o.errors.length === 0, `no. 77 ${lang}: no console errors offline (${o.errors.slice(0, 3).join(' | ')})`);
      await shot(o, `jar-offline-${lang}`);
      await o.offline(false);

      await o.reload(CFG_READY);
      s = await bar(o);
      const st = await stored(o);
      const back = s.rows.find((r) => r.ns === 'justmoreparts');
      check(!s.rows.some((r) => r.source === 'local'), `no. 76 ${lang}: after a reload the jar is gone (${JSON.stringify(s.rows)})`);
      check(back && back.source === 'directory' && back.label === text('addons.source.directory', lang), `no. 76 ${lang}: source “${back && back.label}” again`);
      check(st.dbs.length === 0 && st.caches.length === 0 && st.workers === 0 && st.cookie === '', `no. 76 ${lang}: no IndexedDB, Cache Storage, service worker or cookie (${JSON.stringify(st)})`);
      check(st.local.every((k) => k.startsWith('propwash-') && !/jar|addon|part/i.test(k)) && st.session.every((k) => !/jar|addon|part/i.test(k)), `no. 76 ${lang}: localStorage and sessionStorage hold nothing of the jar (${JSON.stringify([st.local, st.session])})`);
      const values = await o.evaluate("[...Object.values(localStorage), ...Object.values(sessionStorage)].join(' ').length");
      check(values < 200, `no. 76 ${lang}: the stored values are small settings only (${values} characters)`);
      await o.close();
    }
  } finally {
    await b.close();
    fs.rmSync(f.dir, { recursive: true, force: true });
  }
  finish(`${jmpJar ? path.basename(jmpJar) : 'made-up add-on'}; foreign mod, PNG, ${JAR_LIMITS.jarBytes / 1024 / 1024 + 1} MB file; switches in ${CATEGORIES.length} categories; en/de`);
}

main().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
