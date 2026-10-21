#!/usr/bin/env node
// Coverage of the web configurator (check plan 0.6.0, 3.9 no. 57, 63, 65, 66):
//   - a build with a changed part, paint, tuning and name: “Copy code” gives PW3-…, “Copy share link” …/configurator/#PW3-…
//     (read from the clipboard), and the link opened in a new tab shows the same build with parts, paint and tuning
//   - a code with a missing add-on (test code P4, “Other Addon” 2.1.0 with a Modrinth link): the line names the add-on
//     and its version, links only to Modrinth or CurseForge, offers “Open add-on jar”, the other parts are normal;
//     P8: the free address stays text; opening the code keeps what it says about the add-on, in the address, in
//     “Copy share link” and after a change to the build
//   - every copy and export way of the configurator and of /convert/ gives PW3, and no page script writes PW1 or PW2
//   - the text under the configurator names the versions of platforms.json and PW3, nowhere the texts of 0.5.0
//
//   node tools/test-cov-configurator.mjs [--no-browser] [--shots <dir>] [--chrome <path>]
//
// Checks of a known fault are locked (they print their state); COV_UNLOCK=<id>,… or all makes them count.

import fs from 'node:fs';
import path from 'node:path';
import { createCatalog } from '../assets/js/configurator/data.js';
import * as share from '../assets/js/configurator/sharecode.js';
import { convertText, findCodes } from '../assets/js/configurator/convert.js';
import { entry } from '../assets/js/configurator/i18n.js';
import { startBrowser, counter, arg, flag, read, readJson, ROOT, CFG_READY, CV_READY, setInput, sleep } from './fixtures/cov/browser.mjs';

const { check, lock, note, finish } = counter('cov configurator');
const catalog = createCatalog(readJson('assets/data/configurator/catalog.json'));
const platforms = readJson('assets/data/platforms.json');
const fixture = readJson('tools/fixtures/cov/codes.json');
const post = read('tools/fixtures/cov/post.txt');
const text = (key, lang) => entry(key)[lang === 'de' ? 1 : 0];
const SHOTS = arg('--shots');
const OTHER = { name: 'Other Addon', version: '2.1.0', modrinth: 'https://modrinth.com/mod/other-addon' };
const SAFE_HOSTS = ['modrinth.com', 'www.curseforge.com'];
const OTHER_HEAD = { name: OTHER.name, min: OTHER.version, type: 1, link: 'other-addon' };
const FREE_HEAD = { name: 'Free Addon', min: '0.3.0', type: 3, link: 'example.org/free-addon' };

function addonOf(code, namespace) {
  const d = catalog.decode(code);
  const n = d.ok ? d.namespaces.find((x) => x.namespace === namespace) : null;
  return n ? { name: n.name, min: n.min_version, type: n.link_type, link: n.link } : null;
}

function staticChecks() {
  check(share.SHARE_FORMAT === 'PW3', `no. 65: SHARE_FORMAT is ${share.SHARE_FORMAT}`);
  const source = read('assets/js/configurator/sharecode.js');
  check(/export function encode\(content, \{ format = SHARE_FORMAT/.test(source), 'no. 65: encode writes SHARE_FORMAT unless told otherwise');
  const pages = ['assets/js/configurator/ui.js', 'assets/js/configurator/convert-page.js', 'assets/js/configurator/convert.js',
    'assets/js/addons/configurator-addons.js', 'assets/js/addons/directory-page.js', 'assets/js/configurator/viewer.js'];
  const all = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory() && e.name !== 'vendor') walk(rel);
      else if (e.name.endsWith('.js')) all.push(rel);
    }
  };
  walk('assets/js');
  for (const file of all) {
    const src = read(file);
    const imports = [...src.matchAll(/(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => (m[1] || m[2]).replace(/\?.*$/, ''));
    const pw2 = imports.filter((i) => /sharecode2(-tables)?\.js$/.test(i));
    const codec = ['assets/js/configurator/sharecode.js', 'assets/js/configurator/sharecode2.js', 'assets/js/configurator/sharecode3.js'].includes(file);
    if (!codec) check(pw2.length === 0, `no. 65: ${file} imports nothing of the PW2 codec (${pw2.join(', ')})`);
    const writer = /\bimport\s*\{[^}]*\b(encodePw2|PW2_FORMAT)\b[^}]*\}\s*from/.exec(src);
    if (file !== 'assets/js/configurator/sharecode.js') check(!writer, `no. 65: ${file} does not import the PW2 writer (${writer && writer[1]})`);
  }
  for (const file of pages) {
    const src = read(file);
    check(!/encodePw2|encodePw1|PW2_FORMAT|['"]PW2['"]\s*\}|format:\s*['"]PW[12]/.test(src), `no. 65: ${file} asks for no PW1/PW2 code`);
    for (const m of src.matchAll(/\bencode\(([^;]*?)\)\s*[;,)]/g)) check(!/format\s*:/.test(m[1]) || /format\s*:\s*['"]PW3/.test(m[1]), `no. 65: ${file}: encode(${m[1].slice(0, 60)}) without an old format`);
  }
  for (const p of catalog.presets) check(catalog.encode(catalog.presetContent(p.id)).startsWith('PW3-'), `no. 65: preset ${p.id} is written as PW3`);

  const html = read('configurator/index.html');
  const about = /<section class="wrap cfg-about"[\s\S]*?<\/section>/.exec(html)?.[0] || '';
  const footer = /<footer class="site-footer">[\s\S]*?<\/footer>/.exec(html)?.[0] || '';
  const plain = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const pw = platforms.products.propwash;
  const jmp = platforms.products.justmoreparts;
  for (const lang of ['en', 'de']) {
    const para = plain([...about.matchAll(new RegExp(`<p lang="${lang}">([\\s\\S]*?)</p>`, 'g'))].map((m) => m[1]).join(' '));
    check(para.includes(`Propwash ${pw.version}`), `no. 66 ${lang}: the text under the configurator names Propwash ${pw.version} (“${para.slice(0, 90)}…”)`);
    check(para.includes(`${jmp.short} ${jmp.version}`), `no. 66 ${lang}: and ${jmp.short} ${jmp.version}`);
    check(/\bPW3\b/.test(para), `no. 66 ${lang}: and PW3`);
  }
  const OLD = [/1\.1\.0 (?:for|für) Propwash 0\.5\.0/, /format of the add-?on/i, /Format des Add-?ons/i, /Propwash 0\.5\.\d/, /Just More Parts 1\.1\.\d/, /data export of Just More Parts/i, /Datenexport von Just More Parts/i];
  for (const [label, part] of [['text under the configurator', about], ['footer', footer], ['whole configurator page', html], ['converter page', read('convert/index.html')]]) {
    const bad = OLD.filter((re) => re.test(plain(part)));
    check(bad.length === 0, `no. 66: ${label} without the texts of 0.5.0 (${bad.join(', ')})`);
  }
  const named = [...plain(footer).matchAll(/(Propwash(?: FPV)?|Just More Parts) (\d+\.\d+\.\d+)/g)];
  for (const m of named) check(m[2] === (m[1].startsWith('Just') ? jmp.version : pw.version), `no. 66: the footer names ${m[0]} as in platforms.json`);
  if (!named.length) note('no. 66: the footer of the configurator names no version (only the text under it does)');
}

async function browserTests() {
  const b = await startBrowser();
  const shot = async (p, name) => {
    if (SHOTS) await p.shot(path.join(SHOTS, `${name}.png`));
  };
  const clickOn = async (p, selector) => {
    const c = await p.center(selector);
    if (!c) throw new Error(`no element ${selector}`);
    await p.click(c.x, c.y);
  };
  try {
    for (const lang of ['en', 'de']) {
      const p = await b.page({ lang });
      await p.open('/configurator/', { width: 1280, ready: CFG_READY });
      await p.evaluate(`(() => { const s = document.querySelector('[data-preset]'); s.value = 'propwash:freestyle'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
      await sleep(500);
      await clickOn(p, '[data-slots] [data-cat="motor"]');
      await sleep(200);
      const motor = await p.evaluate("[...document.querySelectorAll('[data-picker] [role=option]')].find((o) => o.getAttribute('aria-selected') === 'false' && o.classList.contains('is-ok'))?.dataset.id");
      await clickOn(p, `[data-picker] [role=option][data-id="${motor}"]`);
      await sleep(300);
      await clickOn(p, '[data-tab="paint"]');
      await sleep(250);
      await clickOn(p, '[data-panel-paint] .swatches__dyes [role=radio][aria-checked="false"]');
      await sleep(250);
      await clickOn(p, '[data-tab="tune"]');
      await sleep(250);
      const tuned = await p.evaluate(`(() => {
        const n = document.querySelector('[data-panel-tune] .tune-num:not([disabled])');
        n.value = String(Number(n.value || n.min || 0) + Number(n.step || 1));
        n.dispatchEvent(new Event('input', { bubbles: true }));
        n.dispatchEvent(new Event('change', { bubbles: true }));
        return n.dataset.key;
      })()`);
      await p.evaluate(setInput('[data-name]', 'Cov Sharecode'));
      await sleep(300);
      for (const layer of ['paint', 'tune', 'name']) {
        if (await p.evaluate(`!!document.querySelector('[data-layer="${layer}"]') && !document.querySelector('[data-layer="${layer}"]').checked && !document.querySelector('[data-layer="${layer}"]').disabled`)) await clickOn(p, `[data-layer="${layer}"]`);
      }
      await sleep(400);
      await clickOn(p, '[data-copy-code]');
      await sleep(300);
      const code = await p.clipboard();
      await clickOn(p, '[data-copy-link]');
      await sleep(300);
      const link = await p.clipboard();
      const decoded = catalog.decode(code);
      check(code.startsWith('PW3-') && decoded.ok, `no. 57 ${lang}: “Copy code” gives a PW3 code (${code.slice(0, 30)})`);
      check(link === `${b.base}/configurator/#${code}`, `no. 57 ${lang}: the share link ends on /configurator/#PW3-… (${link.slice(0, 60)})`);
      check(['parts', 'paint', 'tune', 'name'].every((l) => decoded.layers.includes(l)), `no. 57 ${lang}: the code holds parts, paint, tuning and name (${decoded.layers})`);
      check(decoded.ok && decoded.content.build.motor === motor && decoded.content.name === 'Cov Sharecode' && decoded.content.tune && tuned in decoded.content.tune,
        `no. 57 ${lang}: the changed motor, the name and ${tuned} are in the code`);
      const before = await p.evaluate("[...document.querySelectorAll('[data-slots] .slot')].map((s) => s.textContent).join(' | ')");
      const q = await b.page({ lang });
      await q.open(link, { width: 1280, ready: CFG_READY });
      await sleep(400);
      const after = await q.evaluate(`({ code: document.querySelector('[data-code]').textContent, name: document.querySelector('[data-name]').value,
        slots: [...document.querySelectorAll('[data-slots] .slot')].map((s) => s.textContent).join(' | ') })`);
      check(after.code === code, `no. 57 ${lang}: the new tab writes the same code (${after.code.slice(0, 30)})`);
      check(after.name === 'Cov Sharecode' && after.slots === before, `no. 57 ${lang}: the new tab shows the same parts and name`);
      const reread = catalog.decode(after.code);
      check(reread.ok && JSON.stringify(reread.content.paint) === JSON.stringify(decoded.content.paint) && JSON.stringify(reread.content.tune) === JSON.stringify(decoded.content.tune),
        `no. 57 ${lang}: paint and tuning are the same`);
      check(q.errors.length === 0, `no. 57 ${lang}: no console errors in the new tab (${q.errors.slice(0, 3).join(' | ')})`);
      await q.close();

      const copies = [code, link];
      await clickOn(p, '[data-tab="parts"]');
      await sleep(200);
      await clickOn(p, '[data-beginner] .beginner__card .btn--ghost');
      await sleep(300);
      copies.push(await p.clipboard());
      await p.open(`/configurator/#${fixture.old[2].code}`, { width: 1280, ready: CFG_READY });
      await sleep(400);
      const pw3Button = await p.evaluate(`[...document.querySelectorAll('.banner button')].findIndex((x) => x.textContent === ${JSON.stringify(text('convert.copyPw3', lang))})`);
      check(pw3Button >= 0, `no. 65 ${lang}: an old link offers “${text('convert.copyPw3', lang)}”`);
      if (pw3Button >= 0) {
        await clickOn(p, `.banner button:nth-of-type(${pw3Button + 1})`);
        await sleep(300);
        copies.push(await p.clipboard());
      }
      copies.push(await p.evaluate('location.hash.slice(1)'));
      await clickOn(p, '[data-copy-code]');
      await sleep(250);
      copies.push(await p.clipboard());
      await clickOn(p, '[data-copy-link]');
      await sleep(250);
      copies.push(await p.clipboard());
      await p.open('/convert/', { width: 1280, ready: CV_READY });
      await p.evaluate(setInput('[data-cv-input]', post));
      await sleep(800);
      const rows = await p.evaluate("document.querySelectorAll('[data-cv-codes] > li .cv-code__actions button').length");
      for (let i = 1; i <= rows; i++) {
        await clickOn(p, `[data-cv-codes] > li:nth-child(${i}) .cv-code__actions button`);
        await sleep(200);
        copies.push(await p.clipboard());
      }
      await clickOn(p, '[data-cv-copy-all]');
      await sleep(250);
      const all = await p.clipboard();
      const recorded = await p.copies();
      for (const c of copies) {
        const found = findCodes(c.includes('#') ? c.slice(c.indexOf('#') + 1) : c);
        check(found.length === 1 && found[0].format === 'PW3' && catalog.decode(found[0].code).ok, `no. 65 ${lang}: copied “${c.slice(0, 50)}” is PW3`);
      }
      const inAll = findCodes(all);
      check(inAll.length === findCodes(post).length && inAll.every((f) => f.format === 'PW3'), `no. 65 ${lang}: “${text('convert.copyAll', lang)}” gives only PW3 codes (${inAll.map((f) => f.format)})`);
      check(all === convertText(post, catalog).text, `no. 65 ${lang}: “${text('convert.copyAll', lang)}” copies the converted post`);
      check(recorded.length >= 1 && recorded.every((r) => findCodes(r).every((f) => f.format === 'PW3' || post.includes(f.code))), `no. 65 ${lang}: no copy on /convert/ makes a new PW1/PW2 code`);
      check(p.errors.length === 0, `no. 65 ${lang}: no console errors (${p.errors.slice(0, 3).join(' | ')})`);
      await p.close();

      const m = await b.page({ lang });
      await m.open('/configurator/', { width: 1280, ready: CFG_READY });
      await m.evaluate(setInput('[data-import]', fixture.pw3.other_addon));
      await sleep(900);
      const p4 = await m.evaluate(`(() => {
        const box = document.querySelector('[data-import-result]');
        const line = box.querySelector('.addon-line');
        const jar = box.querySelector('.addon-line__jar');
        if (jar) jar.scrollIntoView({ block: 'center', behavior: 'instant' });
        const r = jar ? jar.getBoundingClientRect() : null;
        return {
          line: line ? line.textContent : '', links: [...box.querySelectorAll('a')].map((a) => a.href),
          jar: jar ? { text: jar.textContent, visible: !!jar.offsetParent && r.width > 0 && r.top >= 0 && r.bottom <= innerHeight } : null,
          slots: [...document.querySelectorAll('[data-slots] .slot')].map((s) => ({ cat: s.dataset.cat, bad: s.classList.contains('is-bad'), text: s.querySelector('.slot__value').textContent })),
          hash: location.hash.slice(1),
        };
      })()`);
      check(p4.line.includes(OTHER.name) && p4.line.includes(OTHER.version), `no. 63 ${lang}: the add-on line names ${OTHER.name} ${OTHER.version} (“${p4.line.slice(0, 80)}”)`);
      check(!/\baddons\.[a-z]+\b/.test(p4.line), `no. 63 ${lang}: the add-on line shows no bare text key (“${p4.line.slice(0, 60)}”)`);
      check(p4.links.includes(OTHER.modrinth), `no. 63 ${lang}: link to ${OTHER.modrinth} (${p4.links})`);
      check(p4.links.length > 0 && p4.links.every((h) => SAFE_HOSTS.includes(new URL(h).host)), `no. 63 ${lang}: links only to Modrinth and CurseForge (${p4.links})`);
      check(p4.jar && p4.jar.text === text('addons.open', lang) && p4.jar.visible, `no. 63 ${lang}: “${text('addons.open', lang)}” is visible (${JSON.stringify(p4.jar)})`);
      const others = p4.slots.filter((s) => s.cat !== 'frame' && s.cat !== 'accessory');
      check(others.length === 5 && others.every((s) => !s.bad && !s.text.includes(text('ui.unknownPart', lang))), `no. 63 ${lang}: the other parts are normal (${JSON.stringify(others.map((s) => s.text))})`);
      const frameSlot = p4.slots.find((s) => s.cat === 'frame');
      lock('cov-site-a-2', frameSlot && frameSlot.text.includes(OTHER.name), `no. 63 ${lang}: the frame row names the add-on it needs (“${frameSlot && frameSlot.text}”)`);
      const kept = catalog.decode(p4.hash);
      const ns = kept.ok ? kept.namespaces.find((n) => n.namespace === 'otheraddon') : null;
      check(ns && ns.name === OTHER.name && ns.min_version === OTHER.version && ns.link === 'other-addon', `no. 63 ${lang}: the address after opening P4 still says ${OTHER.name} ${OTHER.version} with its link (${p4.hash.slice(0, 40)}…: ${JSON.stringify(ns && { name: ns.name, min: ns.min_version, link: ns.link })})`);
      check(p4.hash === fixture.pw3.other_addon, `no. 63 ${lang}: the address after opening P4 is the opened code (${p4.hash.length} of ${fixture.pw3.other_addon.length} characters)`);
      await shot(m, `configurator-p4-${lang}`);
      await clickOn(m, '[data-copy-link]');
      await sleep(300);
      const p4link = await m.clipboard();
      const p4linked = p4link.includes('#') ? addonOf(p4link.slice(p4link.indexOf('#') + 1), 'otheraddon') : null;
      check(p4link === `${b.base}/configurator/#${fixture.pw3.other_addon}` && JSON.stringify(p4linked) === JSON.stringify(OTHER_HEAD),
        `no. 63 ${lang}: “${lang === 'de' ? 'Link kopieren' : 'Copy share link'}” after opening P4 passes on ${OTHER.name} ${OTHER.version} with its link (${p4link.slice(0, 70)}…: ${JSON.stringify(p4linked)})`);
      await m.evaluate(setInput('[data-name]', 'Cov P4'));
      await sleep(600);
      await clickOn(m, '[data-copy-code]');
      await sleep(300);
      const p4edited = await m.clipboard();
      const p4editedHash = await m.evaluate('location.hash.slice(1)');
      const p4editedBuild = catalog.decode(p4edited);
      check(p4editedBuild.ok && p4editedBuild.content.name === 'Cov P4' && p4editedHash === p4edited && JSON.stringify(addonOf(p4edited, 'otheraddon')) === JSON.stringify(OTHER_HEAD),
        `no. 63 ${lang}: after a change to the build opened from P4, code and address still say ${OTHER.name} ${OTHER.version} with its link (${p4edited.slice(0, 40)}…: ${JSON.stringify(addonOf(p4edited, 'otheraddon'))})`);

      await m.evaluate(setInput('[data-import]', fixture.pw3.free_addon));
      await sleep(900);
      const p8 = await m.evaluate(`(() => {
        const box = document.querySelector('[data-import-result]');
        return { text: box.textContent, links: [...document.querySelectorAll('a')].map((a) => a.href).filter((h) => /example\\.org/.test(h)),
          free: [...box.querySelectorAll('.addon-line__free')].map((n) => n.textContent) };
      })()`);
      check(p8.links.length === 0, `no. 63 P8 ${lang}: the free address is no link (${p8.links})`);
      check(p8.free.some((f) => f.includes('example.org/free-addon')) && p8.text.includes(lang === 'de' ? 'nur von Modrinth oder CurseForge' : 'only from Modrinth or CurseForge'),
        `no. 63 P8 ${lang}: the address stands as text with the hint on Modrinth and CurseForge (${JSON.stringify(p8.free)})`);
      await shot(m, `configurator-p8-${lang}`);
      const p8hash = await m.evaluate('location.hash.slice(1)');
      check(p8hash === fixture.pw3.free_addon && JSON.stringify(addonOf(p8hash, 'freeaddon')) === JSON.stringify(FREE_HEAD),
        `no. 63 P8 ${lang}: the address after opening P8 still says Free Addon 0.3.0 with its free address (${p8hash.slice(0, 40)}…: ${JSON.stringify(addonOf(p8hash, 'freeaddon'))})`);
      check(m.errors.length === 0, `no. 63 ${lang}: no console errors (${m.errors.slice(0, 3).join(' | ')})`);
      await m.close();

      const c = await b.page({ lang });
      await c.open('/convert/', { width: 1280, ready: CV_READY });
      await c.evaluate(setInput('[data-cv-input]', `Fremdes Add-on: ${fixture.pw3.other_addon}`));
      await sleep(800);
      const cvNote = await c.evaluate("[...document.querySelectorAll('[data-cv-codes] .cv-code__note')].map((n) => n.textContent).join(' | ')");
      check(cvNote.includes(OTHER.name) && cvNote.includes(OTHER.version), `no. 63 /convert/ ${lang}: the row names ${OTHER.name} ${OTHER.version} (“${cvNote.slice(0, 80)}”)`);
      await c.close();
    }
  } finally {
    await b.close();
  }
}

async function main() {
  staticChecks();
  if (!flag('--no-browser')) await browserTests();
  finish('PW3 from the web, missing add-on P4/P8, only PW3 copied, text under the configurator; en/de');
}

main().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
