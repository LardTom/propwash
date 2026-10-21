#!/usr/bin/env node
// Coverage of the add-on directory (check plan 0.6.0, 3.6 no. 36 and 5.5 no. 37, 38, 39, 40):
//   - the Modrinth and CurseForge slugs of Propwash's directory copy (data/propwash/propwash_share/directory.json) give,
//     with the link prefixes of share/MissingAddons, the addresses of assets/data/platforms.json; --online: the
//     Modrinth API and the CurseForge page of each answer 200 with the add-on's title (only reads, no account)
//   - “Get your add-on listed” (id, English and German) names the Discord ticket and links the issue template; the
//     template under .github/ISSUE_TEMPLATE/ has namespace, name, license, links and wished short id
//   - “Show in the configurator” on the card of Just More Parts: the configurator loads with the add-on on, version as
//     listed, all its parts of the hosted export in the pickers, no console errors
//   - /addons/just-more-parts/: the part count is the one of the hosted parts.json, the new whoop motors are named,
//     “Propwash 0.6.0” is the requirement of registry.json, and it does not claim that 0.6.0 runs with 1.1
//   - nothing unreleased: registry.json lists only released add-ons; no page and, outside the roadmap, no link for
//     add-ons that are built next to this repository but not listed (their mod ids are read from those repositories)
//
//   node tools/test-cov-directory.mjs [--propwash-repo <dir>] [--jmp-jar <jar>] [--addon-repos <dir>,<dir>] [--online] [--no-browser]
//                                     [--chrome <path>]
//
// --propwash-repo (or PROPWASH_REPO): a Propwash checkout; --jmp-jar (or PROPWASH_JMP_JAR): the newest jar of Just More
// Parts, the page must be on its state; --addon-repos (or PROPWASH_ADDON_REPOS): add-on checkouts to
// take the unlisted mod ids from (default: the propwash-* folders next to this repository's main checkout).
// Checks of a known fault are locked (they print their state); COV_UNLOCK=<id>,… or all makes them count.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readAddon } from '../assets/js/configurator/addon-catalog.js';
import { startBrowser, counter, arg, flag, read, readJson, ROOT, CFG_READY, sleep } from './fixtures/cov/browser.mjs';

const { check, lock, note, finish } = counter('cov directory');
const platforms = readJson('assets/data/platforms.json');
const registry = readJson('assets/data/addons/registry.json');
const directory = readJson('assets/data/addons/directory.json');
const PW_REPO = arg('--propwash-repo', 'PROPWASH_REPO');
const JMP_JAR = arg('--jmp-jar', 'PROPWASH_JMP_JAR');
const plain = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const langParts = (html, lang) => [...html.matchAll(new RegExp(`<(p|span|li|h2|h3|div)[^>]*\\blang="${lang}"[^>]*>([\\s\\S]*?)</\\1>`, 'g'))].map((m) => plain(m[2])).join(' ');

function productOf(ns) {
  if (ns === registry.base.namespace) return platforms.products[registry.base.platforms];
  const a = registry.addons.find((x) => x.namespace === ns);
  return a ? platforms.products[a.platforms] : null;
}

async function slugs() {
  const urls = [];
  const site = directory.addons || directory.entries || [];
  for (const a of site) {
    const product = productOf(a.namespace);
    if (!product) continue;
    if (a.modrinth) check(`https://modrinth.com/mod/${a.modrinth}` === product.modrinth.url, `no. 36: site directory ${a.namespace} Modrinth ${a.modrinth}`);
    if (a.curseforge) check(`https://www.curseforge.com/minecraft/mc-mods/${a.curseforge}` === product.curseforge.url, `no. 36: site directory ${a.namespace} CurseForge ${a.curseforge}`);
  }
  if (!PW_REPO || !fs.existsSync(PW_REPO)) {
    note('no Propwash checkout (--propwash-repo / PROPWASH_REPO): its directory copy is not checked (no. 36)');
    return;
  }
  const copy = JSON.parse(fs.readFileSync(path.join(PW_REPO, 'common/src/main/resources/data/propwash/propwash_share/directory.json'), 'utf8'));
  const java = fs.readFileSync(path.join(PW_REPO, 'common/src/main/java/de/lardtom/propwash/share/MissingAddons.java'), 'utf8');
  const prefix = (name) => (new RegExp(`${name}\\s*=\\s*"([^"]+)"`).exec(java) || [])[1];
  const MODRINTH = prefix('MODRINTH');
  const CURSEFORGE = prefix('CURSEFORGE');
  check(MODRINTH && CURSEFORGE, `no. 36: MissingAddons has the link prefixes (${MODRINTH}, ${CURSEFORGE})`);
  for (const a of copy.addons) {
    const product = productOf(a.namespace);
    check(!!product, `no. 36: ${a.namespace} of Propwash's copy is a product of platforms.json`);
    if (!product) continue;
    check(`${MODRINTH}${a.modrinth}` === product.modrinth.url, `no. 36: “Open on Modrinth” of ${a.namespace} goes to ${MODRINTH}${a.modrinth} = ${product.modrinth.url}`);
    check(`${CURSEFORGE}${a.curseforge}` === product.curseforge.url, `no. 36: “Open on CurseForge” of ${a.namespace} goes to ${CURSEFORGE}${a.curseforge} = ${product.curseforge.url}`);
    urls.push({ ns: a.namespace, title: product.short, modrinth: a.modrinth, curseforge: `${CURSEFORGE}${a.curseforge}`, mrStatus: product.modrinth.status, cfStatus: product.curseforge.status });
  }
  if (!flag('--online')) return;
  for (const u of urls) {
    try {
      const r = await fetch(`https://api.modrinth.com/v2/project/${u.modrinth}`, { headers: { 'user-agent': 'propwash-site-tests' } });
      const body = r.ok ? await r.json() : null;
      if (r.status === 404 && u.mrStatus !== 'live') note(`no. 36 online: Modrinth ${u.modrinth} is not public yet (404, platforms.json: ${u.mrStatus})`);
      else check(r.status === 200 && body && String(body.title).toLowerCase().includes(u.title.toLowerCase()), `no. 36 online: Modrinth API ${u.modrinth}: ${r.status} “${body && body.title}”`);
      if (body && !String(body.title).includes(u.title)) note(`no. 36 online: Modrinth title “${body.title}” differs in case from “${u.title}”`);
    } catch (e) {
      check(false, `no. 36 online: Modrinth API ${u.modrinth}: ${e.message}`);
    }
    try {
      const r = await fetch(u.curseforge, { headers: { 'user-agent': 'Mozilla/5.0 propwash-site-tests' } });
      const html = await r.text();
      const title = (/<title>([^<]*)<\/title>/i.exec(html) || [])[1] || '';
      if (r.status === 404 && u.cfStatus !== 'live') note(`no. 36 online: ${u.curseforge} is not public yet (404, platforms.json: ${u.cfStatus})`);
      else check(r.status === 200 && title.toLowerCase().includes(u.title.toLowerCase()), `no. 36 online: ${u.curseforge}: ${r.status} “${title.slice(0, 80)}”`);
      if (r.status === 200 && !title.includes(u.title)) note(`no. 36 online: CurseForge title “${title.slice(0, 80)}” differs in case from “${u.title}”`);
    } catch (e) {
      check(false, `no. 36 online: ${u.curseforge}: ${e.message}`);
    }
  }
}

function listing() {
  const html = read('addons/index.html');
  const section = /<section[^>]*\bid="([^"]+)"[^>]*>(?:(?!<\/section>)[\s\S])*?(?:Add-on eintragen lassen|Get your add-on listed)[\s\S]*?<\/section>/.exec(html);
  check(section && section[1], `no. 37: “Add-on eintragen lassen” has an id (${section && section[1]})`);
  if (!section) return;
  const en = langParts(section[0], 'en');
  const de = langParts(section[0], 'de');
  check(en.includes('Get your add-on listed') && de.includes('Add-on eintragen lassen'), 'no. 37: heading in English and German');
  check(/ticket/i.test(en) && /Discord/.test(en) && /Ticket/.test(de) && /Discord/.test(de), 'no. 37: names the Discord ticket in English and German');
  check(/href="https:\/\/discord\.gg\/[^"]+"/.test(section[0]), 'no. 37: links the Discord');
  const fieldsEn = ['namespace', 'name', 'license', 'links', 'short id'];
  const fieldsDe = ['Namensraum', 'Namen', 'Lizenz', 'Links', 'Kurzkennung'];
  check(fieldsEn.every((f) => en.toLowerCase().includes(f)) && fieldsDe.every((f) => de.includes(f)), 'no. 37: lists namespace, name, license, links and short id in English and German');
  const dir = path.join(ROOT, '.github/ISSUE_TEMPLATE');
  const templates = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)) : [];
  const listingTpl = templates.find((f) => /^name:\s*Add-on listing\s*$/m.test(fs.readFileSync(path.join(dir, f), 'utf8')));
  check(!!listingTpl, `no. 37: the issue template “Add-on listing” exists (${templates})`);
  if (listingTpl) {
    const tpl = fs.readFileSync(path.join(dir, listingTpl), 'utf8');
    const ids = [...tpl.matchAll(/^\s*id:\s*([\w-]+)\s*$/gm)].map((m) => m[1]);
    for (const id of ['namespace', 'name', 'license', 'links', 'short-id']) check(ids.includes(id), `no. 37: the template asks for ${id} (${ids})`);
    for (const id of ['namespace', 'name', 'license', 'links']) check(new RegExp(`id: ${id}[\\s\\S]*?required: true`).test(tpl.split(/- type:/).find((b) => b.includes(`id: ${id}`)) || ''), `no. 37: ${id} is required`);
  }
  let repo = null;
  try {
    repo = /github\.com[/:]([^/]+\/[^/.]+)/.exec(execFileSync('git', ['-C', ROOT, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }))?.[1] || null;
  } catch {
    repo = null;
  }
  const links = [...section[0].matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  const issue = links.find((h) => /^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/new\b/.test(h) && (!listingTpl || h.includes(`template=${listingTpl}`) || h.includes(`template=${listingTpl.replace(/\.ya?ml$/, '')}`)));
  lock('cov-site-a-9', !!issue, `no. 37: the section links the issue template (${links.join(', ')})`);
  if (issue && repo) check(issue.includes(`github.com/${repo}/`), `no. 37: the issue link goes to this repository (${repo})`);
}

function jmpPage() {
  const html = read('addons/just-more-parts/index.html');
  const parts = readJson('assets/data/addons/justmoreparts/1.2.0/parts.json');
  const list = Array.isArray(parts) ? parts : parts.parts;
  const total = /data-addon-parts-total[^>]*>(\d+)</.exec(html);
  check(total && Number(total[1]) === list.length, `no. 39: the page says ${total && total[1]} parts, parts.json has ${list.length}`);
  const motors = list.filter((p) => /^justmoreparts:m0[78]02_/.test(p.id));
  check(motors.length >= 4, `no. 39: the hosted export has the new whoop motors m0702_*/m0802_* (${motors.map((m) => m.id)})`);
  const text = plain(html);
  for (const m of motors) check(text.includes(m.name.en_us) && text.includes(m.name.de_de), `no. 39: ${m.id} is named on the page (“${m.name.en_us}” / “${m.name.de_de}”)`);
  const jmp = registry.addons.find((a) => a.namespace === 'justmoreparts');
  const need = String(jmp.requires.propwash).replace(/^[>=~^ ]+/, '');
  check(text.includes(`Propwash ${need} or newer`) && text.includes(`Propwash ${need} oder neuer`), `no. 39: “Propwash ${need}” as in registry.json, English and German`);
  check(need === platforms.products.propwash.version, `no. 39: the requirement ${need} is the Propwash of platforms.json (${platforms.products.propwash.version})`);
  const old = /(?:starts|runs) with Just More Parts 1\.1|startet auch mit Just More Parts 1\.1|läuft (?:auch )?mit Just More Parts 1\.1/.exec(text);
  lock('cov-site-a-10', !old, `no. 39: the page does not say that Propwash 0.6.0 starts with Just More Parts 1.1 (“${old && text.slice(Math.max(0, old.index - 10), old.index + 140)}”)`);
  if (JMP_JAR && fs.existsSync(JMP_JAR)) {
    const jar = readAddon(new Uint8Array(fs.readFileSync(JMP_JAR)), { base: readJson('assets/data/configurator/catalog.json'), fileName: path.basename(JMP_JAR) });
    const jarMotors = jar.ok ? jar.fragment.parts.filter((p) => /^justmoreparts:m0[78]02_/.test(p.id)) : [];
    const missing = jarMotors.filter((m) => !text.includes(m.name.en_us));
    lock('cov-site-a-11', jar.ok && missing.length === 0 && Number(total && total[1]) === jar.fragment.parts.length,
      `no. 39: the page is on the state of ${path.basename(JMP_JAR)} (${jar.ok ? jar.fragment.parts.length : '?'} parts, page ${total && total[1]}; whoop motors not named: ${missing.map((m) => m.id).join(', ')})`);
  } else {
    note('no jar of Just More Parts (--jmp-jar / PROPWASH_JMP_JAR): the page is only held against the hosted export');
  }
  const hrefs = [...html.matchAll(/<a[^>]+href="(https?:[^"]+)"/g)].map((m) => m[1]);
  const downloads = hrefs.filter((h) => /download|releases|\.jar$/i.test(h) && !/curseforge\.com|modrinth\.com/.test(h));
  check(downloads.length === 0, `no. 39: no download outside CurseForge and Modrinth (${downloads})`);
}

function unlistedModIds() {
  const listed = new Set([registry.base.namespace, ...registry.addons.map((a) => a.namespace)]);
  let dirs = (arg('--addon-repos', 'PROPWASH_ADDON_REPOS') || '').split(',').filter(Boolean);
  if (!dirs.length) {
    try {
      const common = execFileSync('git', ['-C', ROOT, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
      const parent = path.dirname(path.dirname(common));
      dirs = fs.readdirSync(parent).filter((d) => d.startsWith('propwash-')).map((d) => path.join(parent, d));
    } catch {
      dirs = [];
    }
  }
  const out = [];
  for (const d of dirs) {
    const props = path.join(d, 'gradle.properties');
    if (!fs.existsSync(props)) continue;
    const text = fs.readFileSync(props, 'utf8');
    const id = (/^mod_id\s*=\s*(\S+)/m.exec(text) || [])[1];
    const name = (/^mod_name\s*=\s*(.+)$/m.exec(text) || [])[1];
    if (id && !listed.has(id)) out.push({ id, name: name ? name.trim() : null, repo: path.basename(d) });
  }
  return out;
}

function pages() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      if (e.name.startsWith('.') || ['tools', 'node_modules', 'assets'].includes(e.name)) continue;
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith('.html')) out.push(rel);
    }
  };
  walk('');
  return out;
}

function unreleased() {
  for (const a of registry.addons) {
    const product = platforms.products[a.platforms];
    check(a.status === 'listed' || a.status === 'withdrawn', `no. 40: ${a.namespace} has status ${a.status}`);
    check(Array.isArray(a.versions) && a.versions.length > 0 && a.versions.includes(a.web_export ? a.web_export.version : a.versions[0]), `no. 40: ${a.namespace} lists released versions (${a.versions})`);
    check(product && product.version && a.versions.includes(product.version) && ['live', 'review'].includes(product.curseforge.status) && ['live', 'review'].includes(product.modrinth.status),
      `no. 40: ${a.namespace} ${product && product.version} is released on CurseForge and Modrinth (${product && product.curseforge.status}/${product && product.modrinth.status})`);
    check(a.page && fs.existsSync(path.join(ROOT, a.page, 'index.html')), `no. 40: ${a.namespace} has its page ${a.page}`);
  }
  const folders = fs.readdirSync(path.join(ROOT, 'addons'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => `addons/${e.name}/`);
  const pagesOf = new Set(registry.addons.map((a) => a.page));
  for (const f of folders) check(pagesOf.has(f), `no. 40: addons folder ${f} belongs to a listed add-on`);
  check(!fs.existsSync(path.join(ROOT, 'addons/server')), 'no. 40: no /addons/server/');
  const hidden = unlistedModIds();
  if (!hidden.length) note('no. 40: no unlisted add-on checkout next to this repository (--addon-repos): only the registry and folders are checked');
  const all = pages();
  for (const h of hidden) {
    const slug = (h.name || h.id).toLowerCase().replace(/^propwash:\s*/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    check(!registry.addons.some((a) => a.namespace === h.id) && !(directory.addons || []).some((a) => a.namespace === h.id), `no. 40: unlisted add-on of ${h.repo} is not in registry.json or directory.json`);
    check(!folders.some((f) => f.includes(h.id) || f.includes(slug)), `no. 40: no addons folder for the add-on of ${h.repo}`);
    for (const page of all.filter((p) => !p.startsWith('roadmap/'))) {
      const html = read(page);
      const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((l) => l.includes(`addons/${h.id}`) || l.includes(`addons/${slug}`) || (l.includes('addons/') && (l.includes(h.id) || l.includes(slug))));
      check(links.length === 0, `no. 40: ${page} links no page of the add-on of ${h.repo} (${links})`);
    }
  }
  return hidden.length;
}

async function browser() {
  const parts = readJson('assets/data/addons/justmoreparts/1.2.0/parts.json');
  const list = Array.isArray(parts) ? parts : parts.parts;
  const jmp = registry.addons.find((a) => a.namespace === 'justmoreparts');
  const b = await startBrowser();
  try {
    for (const lang of ['en', 'de']) {
      for (const width of [1280, 390]) {
        const p = await b.page({ lang });
        await p.open('/addons/', { width, ready: "document.readyState === 'complete'" });
        const c = await p.center('[data-addon="justmoreparts"] a[href*="configurator/?addon="]');
        check(!!c, `no. 38 ${lang} ${width}: the card has “Show in the configurator”`);
        if (!c) continue;
        if (width === 390) await p.tap(c.x, c.y);
        else await p.click(c.x, c.y);
        await p.waitFor(`location.pathname.endsWith('/configurator/') && (${CFG_READY})`, `no. 38 ${lang}`);
        await sleep(500);
        const r = await p.evaluate(`(async () => {
          const row = document.querySelector('[data-addon-item="justmoreparts"]');
          const ids = new Set();
          for (const cat of ['frame', 'stack', 'motor', 'prop', 'video', 'battery', 'accessory']) {
            document.querySelector('[data-slots] [data-cat="' + cat + '"]').click();
            await new Promise((r) => setTimeout(r, 100));
            const all = document.querySelector('[data-picker] [data-cls="all"]');
            if (all && all.getAttribute('aria-pressed') !== 'true') { all.click(); await new Promise((r) => setTimeout(r, 100)); }
            for (const o of document.querySelectorAll('[data-picker] [role=option]')) if (o.dataset.id) ids.add(o.dataset.id);
          }
          return { search: location.search, on: row && row.querySelector('[role=switch]').getAttribute('aria-checked'), meta: row && row.querySelector('.addon-bar__meta').textContent,
            name: row && row.querySelector('.addon-bar__name').textContent, ids: [...ids].filter((id) => id.startsWith('justmoreparts:')),
            message: [...document.querySelectorAll('.addon-bar__message')].map((m) => m.textContent).join(' ') };
        })()`);
        check(r.search === '?addon=justmoreparts', `no. 38 ${lang} ${width}: the configurator opens with ${r.search}`);
        check(r.on === 'true' && r.meta && r.meta.includes(jmp.web_export.version), `no. 38 ${lang} ${width}: the bar shows ${r.name} ${jmp.web_export.version} on (${r.meta})`);
        const want = new Set(list.map((x) => x.id));
        check(r.ids.length === list.length && r.ids.every((id) => want.has(id)), `no. 38 ${lang} ${width}: ${r.ids.length} parts of Just More Parts in the pickers, parts.json has ${list.length}`);
        check(r.message.length > 0, `no. 38 ${lang} ${width}: the bar says the add-on is shown (“${r.message}”)`);
        check(p.errors.length === 0, `no. 38 ${lang} ${width}: no console errors (${p.errors.slice(0, 3).join(' | ')})`);
        await p.close();
      }
    }
  } finally {
    await b.close();
  }
}

async function main() {
  await slugs();
  listing();
  jmpPage();
  const hidden = unreleased();
  if (!flag('--no-browser')) await browser();
  finish(`${PW_REPO ? "Propwash's directory copy, " : ''}listing, page of Just More Parts, ${hidden} unlisted add-on checkout(s) as block list${flag('--online') ? ', online' : ''}`);
}

main().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
