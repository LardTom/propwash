#!/usr/bin/env node
// Coverage of add-ons that are not listed yet in the web configurator (check plan 0.6.0, 7.20 no. 139–141, 8.14 no. 152)
// and of the network side of the jar reader and the converter (5.7 no. 49), headless Chrome at 390 and 1280 px,
// English and German. The add-ons are the add-on checkouts for Propwash 0.6.0 next to this repository that registry.json
// does not list (mod id, name and the newest Fabric jar come from those checkouts at run time; nothing of them is
// written into this repository), or the jars given with --addon-jars.
//   - no. 139: every part of the jar's parts table that has a part file shows up after “Open add-on jar” with its name,
//     its model and its mass (accessories under their mount, those for the front mount too, and one of them picked);
//     a part the add-on registers only in code (a copy of the jar without one part file) gives the note that the add-on
//     needs a web export and shows up as unknown in a code
//   - no. 140: a fresh page, a share code with a part of the add-on pasted: “Needs <add-on> …” with the button to open
//     the jar; the jar opened through that button's file input: the build is complete (the code is written by the
//     site's PW3 writer from the jar, byte for byte the game's; --addon-code takes a code from the game instead)
//   - no. 49: opening the jar and converting a post on /convert/ send no request off the site
//   - no. 141 and 152 (only with --addon-release, after the add-on is released and listed): the entry on /addons/ with
//     short text, version and downloads only from CurseForge and Modrinth, the add-on page (downloads only there), the
//     configurator has its parts without a jar; an add-on with world rules: their table from the hosted web export, a
//     mob table and the three questions of its FAQ; an add-on with a flight planner: the sections getting started,
//     flight modes, flight planner and two pilots and the three questions of its FAQ (the questions come from the
//     add-on's own docs). Without the switch a dry run: the add-ons are not listed yet, and the release checks pass on
//     the page of Just More Parts.
//
//   node tools/test-cov-addon-jars.mjs [--addon-jars <jar>,…] [--addon-repos <dir>,…] [--addon-code <code>] [--addon-release]
//                                      [--no-browser] [--shots <dir>] [--chrome <path>]
//
// --addon-jars (or PROPWASH_ADDON_JARS), --addon-repos (or PROPWASH_ADDON_REPOS, default: the propwash-* folders next to
// this repository's main checkout), --addon-code (or PROPWASH_ADDON_CODE). Checks of a known fault are locked (they
// print their state); COV_UNLOCK=<id>,… or all makes them count.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createCatalog, composeCatalog } from '../assets/js/configurator/data.js';
import { readAddon } from '../assets/js/configurator/addon-catalog.js';
import { openJar, JAR_LIMITS } from '../assets/js/configurator/jar.js';
import { entry } from '../assets/js/configurator/i18n.js';
import { startBrowser, counter, arg, flag, read, readJson, ROOT, sleep, CFG_READY, CV_READY, setInput } from './fixtures/cov/browser.mjs';
import { unlistedAddons, langHtml, plain, byId } from './fixtures/cov/site-b.mjs';

const { check, lock, note, finish } = counter('cov addon jars');
const base = readJson('assets/data/configurator/catalog.json');
const registry = readJson('assets/data/addons/registry.json');
const platforms = readJson('assets/data/platforms.json');
const LANGS = ['en', 'de'];
const WIDTHS = [1280, 390];
const SHOTS = arg('--shots');
const text = (key, lang) => entry(key)[lang === 'de' ? 1 : 0];
const fill = (s, args) => Object.entries(args).reduce((t, [k, v]) => t.split(`{${k}}`).join(String(v)), s);
const listed = new Set([registry.base.namespace, ...registry.addons.map((a) => a.namespace)]);
const SAFE_HOSTS = ['modrinth.com', 'www.curseforge.com', 'curseforge.com'];

function zip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const data = Buffer.from(e.data);
    const packed = zlib.deflateRawSync(data);
    const crc = zlib.crc32(data);
    const name = Buffer.from(e.name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
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
    c.writeUInt16LE(8, 10);
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

/** A copy of a jar without the part file of one table entry (as if the add-on registered that part only in code). */
function withoutPartFile(jarFile, ns, partPath, dir) {
  const jar = openJar(new Uint8Array(fs.readFileSync(jarFile)), { ...JAR_LIMITS, entryBytes: 2 ** 30, totalBytes: 2 ** 33, ratio: 1e9 });
  const drop = new RegExp(`^data/${ns}/propwash_parts/[^/]+/${partPath}\\.json$`);
  const keep = jar.list().filter((n) => !drop.test(n) && (/^(fabric\.mod\.json|META-INF\/neoforge\.mods\.toml)$/.test(n) || n.startsWith(`data/${ns}/`) || n.startsWith(`assets/${ns}/`)));
  const file = path.join(dir, `${path.basename(jarFile, '.jar')}-code-only.jar`);
  fs.writeFileSync(file, zip(keep.map((name) => ({ name, data: jar.read(name, { maxBytes: 2 ** 30 }) }))));
  return file;
}

function addons() {
  const given = (arg('--addon-jars', 'PROPWASH_ADDON_JARS') || '').split(',').filter(Boolean);
  if (given.length) {
    return given.map((jar) => {
      const a = readAddon(new Uint8Array(fs.readFileSync(jar)), { base, fileName: path.basename(jar) });
      return { id: a.mod && a.mod.id, name: a.mod && a.mod.name, version: a.mod && a.mod.version, repo: null, jar };
    }).filter((a) => a.id && !listed.has(a.id));
  }
  const all = unlistedAddons(listed, arg('--addon-repos', 'PROPWASH_ADDON_REPOS'));
  const older = all.filter((a) => !/^0\.6\./.test(a.propwash || ''));
  if (older.length) note(`${older.length} unlisted add-on checkout(s) built for an older Propwash left out`);
  return all.filter((a) => /^0\.6\./.test(a.propwash || ''));
}

function unit(addon, dir) {
  const bytes = new Uint8Array(fs.readFileSync(addon.jar));
  const a = readAddon(bytes, { base, fileName: path.basename(addon.jar) });
  const label = `the add-on of ${addon.repo ? path.basename(addon.repo) : path.basename(addon.jar)}`;
  check(a.ok && !a.problems.some((p) => p.level === 'error'), `no. 139 ${label}: the jar reads (${a.problems.map((p) => p.code)})`);
  if (!a.ok) return null;
  const files = a.fragment.parts.filter((p) => p.id.startsWith(`${addon.id}:`));
  const table = Object.values((a.table && a.table.parts) || {}).flat().map((e) => `${addon.id}:${e.id}`);
  const codeOnly = table.filter((id) => !files.some((p) => p.id === id));
  check(files.length > 0 && files.length === table.length - codeOnly.length, `no. 139 ${label}: ${files.length} parts with a file, ${table.length} in its parts table`);
  note(`no. 139 ${label}: ${files.length} parts (${Object.entries(a.counts).filter(([, n]) => n).map(([c, n]) => `${n} ${c}`).join(', ')}), ${codeOnly.length} only in code`);
  for (const p of files) {
    check(p.name && p.name.en_us && p.name.de_de, `no. 139 ${label}: ${p.id} has a name in English and German`);
    check(a.models && a.models.has && a.models.has(p.id), `no. 139 ${label}: ${p.id} has its model`);
    check(p.basics && p.basics.mass_g > 0, `no. 139 ${label}: ${p.id} has its mass (${p.basics && p.basics.mass_g} g)`);
  }
  const victim = files[files.length - 1];
  const variant = withoutPartFile(addon.jar, addon.id, victim.id.split(':')[1], dir);
  const v = readAddon(new Uint8Array(fs.readFileSync(variant)), { base, fileName: path.basename(variant) });
  const java = v.problems.find((p) => p.code === 'addon.java_parts');
  check(!!java && java.args && Number(java.args.count) === 1, `no. 139 ${label}: a part only in code gives addon.java_parts (${v.problems.map((p) => `${p.code} ${JSON.stringify(p.args)}`)})`);
  for (const lang of LANGS) check(/needs a web export|braucht einen Web-Export/.test(text('addons.problems.addon.java_parts', lang)), `no. 139 ${lang}: its text says the add-on needs a web export`);
  const catalog = createCatalog(composeCatalog(base, { fragments: [a.fragment] }));
  const inCode = codePartsOf(files);
  const code = arg('--addon-code', 'PROPWASH_ADDON_CODE') || encodeWith(catalog, inCode);
  const decoded = catalog.decode(code);
  check(decoded.ok && decoded.namespaces.some((n) => n.namespace === addon.id && n.used), `no. 140 ${label}: the code carries the add-on (${code.slice(0, 24)}…)`);
  const plainCatalog = createCatalog(base);
  const missing = plainCatalog.decode(code);
  check(missing.ok && missing.unknownParts.length > 0, `no. 140 ${label}: without the jar the code has unknown parts (${missing.ok && missing.unknownParts.length})`);
  const victimCode = encodeWith(catalog, [victim]);
  return { a, files, codeOnly, victim, variant, code, victimCode, label, inCode: inCode.map((x) => x.id) };
}

/** One part per category and mount, so a code can carry them all at once. */
function codePartsOf(parts) {
  const seen = new Set();
  return parts.filter((p) => {
    const key = p.category === 'accessory' ? `accessory:${(p.data && p.data.slot) || 'front'}` : p.category;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function encodeWith(catalog, parts) {
  const build = catalog.presetBuild('propwash:freestyle');
  build.accessories = { ...(build.accessories || {}) };
  for (const p of parts) {
    if (p.category === 'accessory') build.accessories[p.data && p.data.slot ? p.data.slot : 'front'] = p.id;
    else build[p.category] = p.id;
  }
  return catalog.encode({ build, paint: null, tune: null, osd: null, name: null });
}

const BAR = `(() => ({
  rows: [...document.querySelectorAll('[data-addon-item]')].map((li) => ({ ns: li.dataset.addonItem, source: li.dataset.addonSource,
    on: li.querySelector('[role=switch]') ? li.querySelector('[role=switch]').getAttribute('aria-checked') : null })),
  messages: [...document.querySelectorAll('.addon-bar__message')].map((m) => ({ level: m.className.replace(/.*--/, ''), text: m.textContent })),
}))()`;

async function loadJar(p, file) {
  await p.setFile('[data-addon-file]', file);
  await sleep(150);
  await p.waitFor("!document.querySelector('.addon-bar__message--busy') && document.querySelector('[data-addon-bar]').getAttribute('aria-busy') !== 'true'", `reading ${file}`, 60000);
  await sleep(400);
}

const pickerOptions = (p, cat) => p.evaluate(`(async () => {
  document.querySelector('[data-slots] [data-cat="${cat}"]').click();
  await new Promise((r) => setTimeout(r, 150));
  const all = document.querySelector('[data-picker] [data-cls="all"]');
  if (all && all.getAttribute('aria-pressed') !== 'true') { all.click(); await new Promise((r) => setTimeout(r, 150)); }
  return [...document.querySelectorAll('[data-picker] [role=option]')].map((o) => ({ id: o.dataset.id, mount: o.dataset.mount, text: o.innerText.replace(/\\s+/g, ' ').trim(),
    badge: o.querySelector('.badge') ? { text: o.querySelector('.badge').textContent, title: o.querySelector('.badge').title } : null }));
})()`);

const slots = (p) => p.evaluate(`[...document.querySelectorAll('[data-slots] .slot')].map((s) => ({ cat: s.dataset.cat, bad: s.classList.contains('is-bad'), text: s.querySelector('.slot__value').textContent.trim() }))`);

const offSite = (base, urls) => urls.filter((u) => !u.startsWith('data:') && !u.startsWith('blob:') && !u.startsWith(base));

async function browser(found) {
  const b = await startBrowser();
  let loads = 0;
  const front = [];
  const lost = [];
  const named = [];
  const badges = [];
  try {
    for (const { addon, u } of found) {
      for (const lang of LANGS) {
        for (const width of WIDTHS) {
          const where = `${u.label} ${lang} ${width} px`;
          const p = await b.page({ lang });
          await p.open('/configurator/', { width, lang, ready: CFG_READY });
          loads++;
          p.requests.length = 0;
          await loadJar(p, addon.jar);
          const bar = await p.evaluate(BAR);
          const row = bar.rows.find((r) => r.ns === addon.id);
          check(row && row.source === 'local' && row.on === 'true', `no. 139 ${where}: the jar is in the add-on bar, local and on (${JSON.stringify(row)})`);
          const loaded = fill(text(u.files.length === 1 ? 'addons.loadedOne' : 'addons.loaded', lang), { name: u.a.mod.name, version: u.a.mod.version, file: path.basename(addon.jar), n: u.files.length });
          check(bar.messages.some((m) => m.text === loaded), `no. 139 ${where}: “${loaded}” (${bar.messages.map((m) => m.text).join(' | ')})`);
          check(!bar.messages.some((m) => m.level === 'error' || /without their model|ohne ihr Modell/.test(m.text)), `no. 139 ${where}: no error and no part without its model`);
          check(offSite(p.base, p.requests).length === 0, `no. 49 ${where}: opening the jar sends no request off the site (${offSite(p.base, p.requests).slice(0, 2)})`);
          for (const cat of [...new Set(u.files.map((f) => f.category))]) {
            const options = await pickerOptions(p, cat);
            for (const f of u.files.filter((x) => x.category === cat)) {
              const o = options.find((x) => x.id === f.id);
              const name = lang === 'de' ? f.name.de_de : f.name.en_us;
              if (f.category === 'accessory' && f.data && f.data.slot === 'front') {
                if (!o || o.mount !== 'front') front.push(`${f.id} (${lang} ${width}${o ? `, under ${o.mount}` : ''})`);
                if (!o) continue;
              }
              check(!!o && o.text.includes(name), `no. 139 ${where}: ${f.id} among the ${cat} choices with its name “${name}” (${o && o.text.slice(0, 60)})`);
              if (o && o.badge) badges.push({ where, id: f.id, ...o.badge });
              const builtinMass = options.filter((x) => x.id && x.id.startsWith('propwash:')).some((x) => /\d\s?g\b/.test(x.text));
              if (!builtinMass) { note(`no. 139: the ${cat} choices show no mass, not even for Propwash's own parts – the mass of ${cat} parts is checked in the jar only`); continue; }
              const masses = o ? [...o.text.matchAll(/(\d[\d.,]*)\s?g\b/g)].map((m) => Number(lang === 'de' ? m[1].replace(/\./g, '').replace(',', '.') : m[1].replace(/,/g, ''))) : [];
              check(masses.some((g) => Math.abs(g - f.basics.mass_g) <= 0.05 + f.basics.mass_g * 0.001), `no. 139 ${where}: ${f.id} with its mass ${f.basics.mass_g} g (${o && o.text.slice(0, 80)})`);
            }
          }
          const pick = u.files.find((f) => !(f.category === 'accessory' && f.data && f.data.slot === 'front'));
          if (pick) {
            await pickerOptions(p, pick.category);
            const at = await p.center(`[data-picker] [role=option][data-id="${pick.id}"]`);
            if (at) {
              if (width < 600) await p.tap(at.x, at.y);
              else await p.click(at.x, at.y);
              await sleep(900);
            }
            const s = await slots(p);
            const slot = s.find((x) => x.cat === pick.category);
            const pickName = lang === 'de' ? pick.name.de_de : pick.name.en_us;
            check(!!slot && (slot.text.includes(pickName) || slot.text.includes(lang === 'de' ? (pick.short_name || pick.name).de_de : (pick.short_name || pick.name).en_us)), `no. 139 ${where}: ${pick.id} picked, the slot names it (${JSON.stringify(slot)})`);
            check(await p.evaluate("!!document.querySelector('canvas')") && !(await p.evaluate("[...document.querySelectorAll('.addon-bar__message')].some((m) => /without their model|ohne ihr Modell/.test(m.textContent))")), `no. 139 ${where}: the 3D view draws it with its model`);
          }
          const frontPart = u.files.find((f) => f.category === 'accessory' && f.data && f.data.slot === 'front');
          if (frontPart) {
            await pickerOptions(p, 'accessory');
            const at = await p.center(`[data-picker] [role=option][data-id="${frontPart.id}"]`);
            if (at) {
              if (width < 600) await p.tap(at.x, at.y);
              else await p.click(at.x, at.y);
              await sleep(900);
            }
            const acc = (await slots(p)).find((x) => x.cat === 'accessory');
            const frontName = lang === 'de' ? frontPart.name.de_de : frontPart.name.en_us;
            if (!acc || !acc.text.includes(frontName)) front.push(`${frontPart.id} picked, the accessory slot does not name it (${lang} ${width}: ${acc && acc.text})`);
          }
          if (SHOTS) await p.shot(path.join(SHOTS, `addon-jar-${u.files.length}-${lang}-${width}.png`));
          check(p.errors.length === 0, `no. 139 ${where}: no console errors (${p.errors.slice(0, 2).join(' | ')})`);
          await p.close();

          const v = await b.page({ lang });
          await v.open('/configurator/', { width, lang, ready: CFG_READY });
          loads++;
          await loadJar(v, u.variant);
          const vb = await v.evaluate(BAR);
          const javaText = fill(text('addons.problems.addon.java_parts', lang), { count: 1, first: u.victim.id }).split('(')[0].trim();
          check(vb.messages.some((m) => m.text.includes(javaText) && /web export|Web-Export/.test(m.text)), `no. 139 ${where}: a part only in code – “${javaText} … needs a web export” (${vb.messages.map((m) => m.text.slice(0, 80)).join(' | ')})`);
          await v.evaluate(setInput('[data-import]', u.victimCode));
          await sleep(900);
          const vs = await slots(v);
          const victimSlot = vs.find((x) => x.cat === u.victim.category);
          check(!!victimSlot && victimSlot.bad && !victimSlot.text.includes(lang === 'de' ? u.victim.name.de_de : u.victim.name.en_us), `no. 139 ${where}: that part shows up as unknown in a code (${JSON.stringify(victimSlot)})`);
          await v.close();

          const f = await b.page({ lang });
          await f.open('/configurator/', { width, lang, ready: CFG_READY });
          loads++;
          await f.evaluate(setInput('[data-import]', u.code));
          await sleep(900);
          const needs = await f.evaluate(`(() => {
            const box = document.querySelector('[data-import-result]');
            const line = box && box.querySelector('.addon-line');
            const jar = box && box.querySelector('.addon-line__jar');
            if (jar) jar.scrollIntoView({ block: 'center', behavior: 'instant' });
            const r = jar ? jar.getBoundingClientRect() : null;
            return { line: line ? line.textContent : '', links: box ? [...box.querySelectorAll('a')].map((a) => a.href) : [], jar: jar ? { text: jar.textContent, visible: jar.checkVisibility() && r.width > 0 && r.top >= 0 && r.bottom <= innerHeight, x: r.left + r.width / 2, y: r.top + r.height / 2 } : null };
          })()`);
          const needWord = lang === 'de' ? 'Braucht' : 'Needs';
          check(needs.line.startsWith(needWord) && (needs.line.includes(u.a.mod.name) || needs.line.includes(addon.id)), `no. 140 ${where}: “${needWord} <add-on> …” (“${needs.line.slice(0, 90)}”)`);
          check(needs.links.every((h) => SAFE_HOSTS.includes(new URL(h).host)), `no. 140 ${where}: links only to Modrinth and CurseForge (${needs.links})`);
          check(!!needs.jar && needs.jar.text === text('addons.open', lang) && needs.jar.visible, `no. 140 ${where}: the button “${text('addons.open', lang)}” is offered (${JSON.stringify(needs.jar && { text: needs.jar.text, visible: needs.jar.visible })})`);
          const before = await slots(f);
          const codeParts = u.files.filter((x) => u.inCode.includes(x.id));
          check(before.some((x) => x.bad), `no. 140 ${where}: before the jar the add-on part is unknown (${JSON.stringify(before.filter((x) => x.bad))})`);
          if (needs.jar) {
            await f.evaluate("(window.__jarDialog = 0, document.querySelector('[data-addon-file]').addEventListener('click', () => { window.__jarDialog++; }), true)");
            if (width < 600) await f.tap(needs.jar.x, needs.jar.y);
            else await f.click(needs.jar.x, needs.jar.y);
            await sleep(200);
            check(await f.evaluate('window.__jarDialog === 1'), `no. 140 ${where}: the button opens the file dialog of the add-on bar`);
          }
          f.requests.length = 0;
          await loadJar(f, addon.jar);
          const after = await slots(f);
          const complete = after.length > 0 && after.every((x) => !x.bad && !x.text.includes(text('ui.unknownPart', lang)));
          const kept = codeParts.every((part) => after.some((x) => x.text.includes(lang === 'de' ? part.name.de_de : part.name.en_us) || x.text.includes(lang === 'de' ? (part.short_name || part.name).de_de : (part.short_name || part.name).en_us)));
          if (!complete || !kept) lost.push(`${where}: ${after.map((x) => `${x.cat}=${x.text}`).join(', ').slice(0, 160)}`);
          named.push(kept);
          check(offSite(f.base, f.requests).length === 0, `no. 49 ${where}: opening the jar for a code sends no request off the site`);
          check(f.errors.length === 0, `no. 140 ${where}: no console errors (${f.errors.slice(0, 2).join(' | ')})`);
          if (SHOTS) await f.shot(path.join(SHOTS, `addon-code-${lang}-${width}.png`));
          await f.close();
        }
      }
    }
    if (found.length) {
      check(!front.length, `no. 139: accessories for the front mount are among the accessory choices under the front mount and can be picked – missing: ${front.slice(0, 4).join(', ')}${front.length > 4 ? ` … (${front.length})` : ''}`);
      const jmpLabel = badges.filter((x) => /\bJMP\b|Just More Parts/.test(`${x.text} ${x.title}`));
      lock('cov-site-b-15', !jmpLabel.length, `no. 139: the badge of a part of another add-on does not call it Just More Parts – ${jmpLabel.length} of ${badges.length} choices say “${jmpLabel[0] ? `${jmpLabel[0].text}” / “${jmpLabel[0].title}` : ''}” (first: ${jmpLabel[0] ? `${jmpLabel[0].id}, ${jmpLabel[0].where}` : ''})`);
      lock('cov-site-b-14', !lost.length, `no. 140: after opening the jar the build of the code is complete, its add-on parts in place – ${lost.length} of ${named.length} cases lose the build (first: ${lost[0] || ''})`);
    }
    for (const lang of LANGS) {
      const p = await b.page({ lang });
      await p.open('/convert/', { width: 1280, lang, ready: CV_READY });
      loads++;
      p.requests.length = 0;
      await p.evaluate(setInput('[data-cv-input]', read('tools/fixtures/cov/post.txt')));
      await sleep(1000);
      const rows = await p.evaluate("document.querySelectorAll('[data-cv-codes] li').length");
      check(rows >= 4, `no. 49 /convert/ ${lang}: the post is converted (${rows} codes)`);
      check(offSite(p.base, p.requests).length === 0, `no. 49 /convert/ ${lang}: converting sends no request off the site (${offSite(p.base, p.requests).slice(0, 2)}; ${p.requests.length} requests in all)`);
      await p.close();
    }
  } finally {
    await b.close();
  }
  return loads;
}

// no. 141 and 152 -----------------------------------------------------------------------------------------------------
function faqOf(addon) {
  if (!addon.repo) return null;
  const docs = path.join(addon.repo, 'docs');
  const guide = path.join(docs, 'guide.md');
  const guideDe = path.join(docs, 'guide.de.md');
  if (fs.existsSync(guide)) {
    const q = (file) => {
      const md = fs.readFileSync(file, 'utf8');
      const faq = md.split(/^## /m).find((s) => /^(FAQ|Häufige Fragen)/.test(s)) || '';
      return [...faq.matchAll(/^\*\*(.+?\?)\*\*/gm)].map((m) => m[1]);
    };
    const headings = (file) => [...fs.readFileSync(file, 'utf8').matchAll(/^##+ (.+)$/gm)].map((m) => m[1].trim());
    return { kind: 'planner', en: q(guide), de: fs.existsSync(guideDe) ? q(guideDe) : [], headings: { en: headings(guide), de: fs.existsSync(guideDe) ? headings(guideDe) : [] } };
  }
  const design = path.join(docs, 'design.md');
  if (fs.existsSync(design)) {
    const md = fs.readFileSync(design, 'utf8');
    const faq = (/FAQ \(([^)]*)\)/.exec(md.replace(/\n\s*/g, ' ')) || [])[1] || '';
    return { kind: 'rules', en: [], de: [...faq.matchAll(/„([^“]+)“/g)].map((m) => m[1]), headings: { en: [], de: [] } };
  }
  return null;
}

const SECTIONS = { en: [/getting started/i, /flight modes/i, /flight planner/i, /two pilots/i], de: [/erste schritte/i, /flugmodi/i, /flugplaner/i, /zwei piloten/i] };

function releaseProblems(ns) {
  const problems = [];
  const fail = (ok, m) => { if (!ok) problems.push(m); };
  const entryOf = registry.addons.find((a) => a.namespace === ns);
  fail(!!entryOf && entryOf.status === 'listed', `${ns} is listed in registry.json`);
  if (!entryOf) return problems;
  const product = platforms.products[entryOf.platforms];
  fail(!!product && product.version && entryOf.versions.includes(product.version), `version ${product && product.version} of platforms.json is a released version`);
  const dir = read('addons/index.html');
  const card = byId(dir, `addon-${ns}`) || { html: ((new RegExp(`<[^>]+data-addon="${ns}"[\\s\\S]*?</article>`).exec(dir)) || [''])[0] };
  fail(!!card.html, `the card of ${ns} on /addons/`);
  for (const lang of LANGS) fail(plain(langHtml(card.html, lang)).length > 40, `the card has a short text in ${lang}`);
  fail(card.html.includes(product ? product.version : '§'), `the card names version ${product && product.version}`);
  const hrefs = [...card.html.matchAll(/href="(https?:[^"]+)"/g)].map((m) => m[1]);
  fail(hrefs.length > 0 && hrefs.every((h) => SAFE_HOSTS.includes(new URL(h).host) || /github\.com/.test(h) && !/releases|download/i.test(h)), `the card's downloads only from CurseForge and Modrinth (${hrefs})`);
  const pageFile = path.join(ROOT, entryOf.page, 'index.html');
  fail(fs.existsSync(pageFile), `the page ${entryOf.page}`);
  if (fs.existsSync(pageFile)) {
    const page = fs.readFileSync(pageFile, 'utf8');
    const links = [...page.matchAll(/href="(https?:[^"]+)"/g)].map((m) => m[1]).filter((h) => /download|\.jar$|releases/i.test(h) || /curseforge|modrinth/.test(h));
    fail(links.every((h) => SAFE_HOSTS.includes(new URL(h).host)), `the page's downloads only from CurseForge and Modrinth (${links})`);
  }
  fail(!!entryOf.web_export && fs.existsSync(path.join(ROOT, entryOf.web_export.path, 'parts.json')), `a hosted web export, so the configurator has the parts without a jar`);
  return problems;
}

function specificProblems(addon, faq) {
  const problems = [];
  const entryOf = registry.addons.find((a) => a.namespace === addon.id);
  const page = entryOf && fs.existsSync(path.join(ROOT, entryOf.page, 'index.html')) ? fs.readFileSync(path.join(ROOT, entryOf.page, 'index.html'), 'utf8') : '';
  const main = (/<main[\s\S]*<\/main>/.exec(page) || [''])[0];
  for (const lang of LANGS) {
    const t = plain(langHtml(main, lang));
    for (const q of faq[lang] || []) if (!t.includes(q)) problems.push(`FAQ ${lang}: “${q}”`);
  }
  if (faq.kind === 'rules') {
    const rulesFile = entryOf && entryOf.web_export ? path.join(ROOT, entryOf.web_export.path, 'rules.json') : null;
    const rules = rulesFile && fs.existsSync(rulesFile) ? JSON.parse(fs.readFileSync(rulesFile, 'utf8')).rules || [] : [];
    if (!rules.length) problems.push('rules.json of the hosted web export');
    for (const r of rules) if (!main.includes(r.id.split(':').pop())) problems.push(`world rule ${r.id} in the table`);
    if (!/<table[\s\S]*?\bMob\b[\s\S]*?<\/table>/.test(main)) problems.push('a mob table');
  } else {
    for (const lang of LANGS) for (const re of SECTIONS[lang]) if (!re.test(plain(langHtml(main, lang)))) problems.push(`section ${re} in ${lang}`);
  }
  return problems;
}

function release(found) {
  const RELEASE = flag('--addon-release');
  for (const { addon } of found) {
    const faq = faqOf(addon);
    const label = `the add-on of ${addon.repo ? path.basename(addon.repo) : path.basename(addon.jar)}`;
    const no = faq && faq.kind === 'planner' ? '152' : '141';
    if (!RELEASE) {
      check(!listed.has(addon.id) && !fs.existsSync(path.join(ROOT, 'addons', addon.id)), `no. ${no} dry run ${label}: not released, so not listed and no page yet`);
      if (faq) note(`no. ${no} ${label}: at its release the page needs the ${faq.kind === 'rules' ? 'world-rule table from the hosted web export, a mob table' : 'sections getting started, flight modes, flight planner, two pilots'} and the FAQ ${[...(faq.de || []), ...(faq.en || [])].map((q) => `“${q}”`).join(', ')}`);
      continue;
    }
    const general = releaseProblems(addon.id);
    check(!general.length, `no. ${no} ${label}: listed and on the site – ${general.join('; ')}`);
    const specific = faq ? specificProblems(addon, faq) : ['no docs in the add-on repository to take the FAQ from'];
    check(!specific.length, `no. ${no} ${label}: page content – missing ${specific.join('; ')}`);
  }
  if (!RELEASE) {
    const jmp = releaseProblems('justmoreparts');
    check(!jmp.length, `no. 141/152 dry run: the release checks pass on the page of Just More Parts (${jmp.join('; ')})`);
  }
}

async function main() {
  const found = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-cov-addon-'));
  try {
    const list = addons().filter((a) => a.jar && fs.existsSync(a.jar));
    if (!list.length) note('no add-on jar next to this repository (--addon-jars / --addon-repos): no. 139, 140 and the jar part of no. 49 skipped');
    for (const addon of list) {
      note(`add-on of ${addon.repo ? path.basename(addon.repo) : '--addon-jars'}: ${path.basename(addon.jar)} (${new Date(fs.statSync(addon.jar).mtimeMs).toISOString().slice(0, 16)})`);
      const u = unit(addon, dir);
      if (u) found.push({ addon, u });
    }
    release(found);
    let loads = 0;
    if (flag('--no-browser')) note('--no-browser: the headless part skipped');
    else loads = await browser(found);
    finish(`${found.length} unlisted add-on jar(s); ${flag('--addon-release') ? 'release checks' : 'release checks as a dry run'}${loads ? `; ${loads} page loads at 390/1280 px` : ''}; en/de`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
