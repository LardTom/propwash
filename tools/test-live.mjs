#!/usr/bin/env node
// Online checks after the upload and after going live (check plan 0.6.0, 5.9 no. 52 and 53). Only reads, no account.
//   - no. 52 order on the platforms: on Modrinth (API v2) every version of Just More Parts <version> requires
//     propwash-fpv, is published after Propwash <version> of the same loader, and both are listed; on CurseForge (API
//     v1, needs CURSEFORGE_API_KEY) every file of Just More Parts <version> has the relation “required” to Propwash, is
//     approved and later than the Propwash file of its loader
//   - no. 53 after going live: the landing page and /convert/ of the live site answer 200 with the cache-busting
//     stamps of this checkout (the release stand); every download button of platforms.json with status live answers
//     200 and the platform lists the version (Modrinth API, CurseForge API); then tools/test-links.mjs --online, every
//     external address answers
//
//   node tools/test-live.mjs [--live] [--site https://propwashfpv.com/] [--fixture good|bad]
//
// Without --live it is a dry run: the live site is this checkout on a local server, platforms.json is taken as if every
// platform were live, and the platforms answer from saved answers (tools/fixtures/cov/live/good.json); the broken
// answers of bad.json must give exactly the faults they list. The real run belongs to the release (R5/R6):
//   CURSEFORGE_API_KEY=… node tools/test-live.mjs --live

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { counter, arg, flag, read, readJson, ROOT } from './fixtures/cov/browser.mjs';
import { serveDirs } from './fixtures/cov/site-b.mjs';

const LIVE = flag('--live');
const SITE = (arg('--site') || 'https://propwashfpv.com/').replace(/\/?$/, '/');
const UA = { 'user-agent': 'propwash-site-tests (release check)' };
const STAMP = /(?:href|src)="[^"]*?(assets\/(?:css|js)\/[^"?]+)\?v=([0-9a-f]{8})"/g;

function fixtureFetch(file, base) {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures/cov/live', file), 'utf8'));
  return async (url, init = {}) => {
    if (url.startsWith(SITE)) return fetch(base + url.slice(SITE.length - 1), init);
    const r = data.responses[url];
    if (!r) return new Response('not in the saved answers', { status: 599 });
    return new Response(r.json !== undefined ? JSON.stringify(r.json) : r.text || '', { status: r.status, headers: { 'content-type': r.json !== undefined ? 'application/json' : 'text/html' } });
  };
}

async function getJson(get, url, headers = {}) {
  try {
    const res = await get(url, { headers: { ...UA, ...headers }, signal: AbortSignal.timeout(20000) });
    return { status: res.status, body: res.ok ? await res.json() : null };
  } catch (e) {
    return { status: 0, error: e.message, body: null };
  }
}

const loaderOf = (s) => (/neoforge/i.test(s) ? 'neoforge' : /fabric/i.test(s) ? 'fabric' : null);

async function modrinth(get, products, c) {
  const [pw, jmp] = products;
  const out = {};
  for (const p of products) {
    const slug = p.data.modrinth.url.split('/').pop();
    const project = await getJson(get, `https://api.modrinth.com/v2/project/${slug}`);
    const versions = await getJson(get, `https://api.modrinth.com/v2/project/${slug}/version`);
    c.check(project.status === 200 && project.body, `Modrinth ${p.short}: project ${slug} answers (${project.status})`);
    c.check(versions.status === 200 && Array.isArray(versions.body), `Modrinth ${p.short}: versions of ${slug} answer (${versions.status})`);
    out[p.key] = { slug, id: project.body && project.body.id, versions: (versions.body || []).filter((v) => String(v.version_number).split('+')[0] === p.data.version) };
    c.check(out[p.key].versions.length > 0, `Modrinth ${p.short}: lists version ${p.data.version} (${(versions.body || []).map((v) => v.version_number).slice(0, 4)})`);
    for (const v of out[p.key].versions) c.check(v.status === 'listed', `Modrinth ${p.short} ${v.version_number} is listed (${v.status})`);
  }
  if (!pw || !jmp || !out[pw.key].id) return out;
  for (const v of out[jmp.key].versions) {
    const dep = (v.dependencies || []).find((d) => d.project_id === out[pw.key].id);
    c.check(dep && dep.dependency_type === 'required', `Modrinth ${jmp.short} ${v.version_number} requires ${out[pw.key].slug} (${dep ? dep.dependency_type : 'no dependency'})`);
    const base = out[pw.key].versions.find((x) => loaderOf(x.version_number) === loaderOf(v.version_number)) || out[pw.key].versions[0];
    c.check(base && Date.parse(v.date_published) > Date.parse(base.date_published), `Modrinth ${jmp.short} ${v.version_number} is published after ${pw.short} ${base ? base.version_number : pw.data.version} (${v.date_published} / ${base && base.date_published})`);
  }
  return out;
}

async function curseforge(get, products, c, key) {
  if (!key) {
    c.note('no. 52/53: no CURSEFORGE_API_KEY – the CurseForge part is not checked (the download pages still are)');
    return null;
  }
  const [pw, jmp] = products;
  const out = {};
  for (const p of products) {
    const slug = p.data.curseforge.url.split('/').pop();
    const search = await getJson(get, `https://api.curseforge.com/v1/mods/search?gameId=432&classId=6&slug=${slug}`, { 'x-api-key': key });
    const mod = search.body && (search.body.data || []).find((m) => m.slug === slug);
    c.check(!!mod, `CurseForge ${p.short}: project ${slug} found (${search.status})`);
    if (!mod) continue;
    c.check(mod.links && mod.links.websiteUrl === p.data.curseforge.url, `CurseForge ${p.short}: the page is ${p.data.curseforge.url} (${mod.links && mod.links.websiteUrl})`);
    const files = await getJson(get, `https://api.curseforge.com/v1/mods/${mod.id}/files?pageSize=50`, { 'x-api-key': key });
    const mine = ((files.body && files.body.data) || []).filter((f) => new RegExp(`[-_]${p.data.version.replace(/\./g, '\\.')}\\.jar$`).test(f.fileName));
    c.check(mine.length > 0, `CurseForge ${p.short}: lists version ${p.data.version} (${((files.body && files.body.data) || []).map((f) => f.fileName).slice(0, 3)})`);
    out[p.key] = { id: mod.id, files: mine };
  }
  if (!pw || !jmp || !out[pw.key] || !out[jmp.key]) return out;
  for (const f of out[jmp.key].files) {
    const rel = (f.dependencies || []).find((d) => d.modId === out[pw.key].id);
    c.check(rel && rel.relationType === 3, `CurseForge ${jmp.short} ${f.fileName} requires ${pw.short} (relation ${rel ? rel.relationType : 'none'})`);
    c.check((f.fileStatus === 4 || f.fileStatus === 10) && f.isAvailable, `CurseForge ${jmp.short} ${f.fileName} is approved (status ${f.fileStatus}, available ${f.isAvailable})`);
    const base = out[pw.key].files.find((x) => loaderOf(x.fileName) === loaderOf(f.fileName));
    c.check(base && Date.parse(f.fileDate) > Date.parse(base.fileDate), `CurseForge ${jmp.short} ${f.fileName} comes after ${pw.short} ${base ? base.fileName : ''}`);
  }
  for (const f of out[pw.key].files) c.check((f.fileStatus === 4 || f.fileStatus === 10) && f.isAvailable, `CurseForge ${pw.short} ${f.fileName} is approved (status ${f.fileStatus})`);
  return out;
}

async function site(get, c) {
  for (const page of ['', 'convert/']) {
    const url = `${SITE}${page}`;
    let res;
    let html = '';
    try {
      res = await get(url, { headers: UA, signal: AbortSignal.timeout(20000) });
      html = await res.text();
    } catch (e) {
      res = { status: 0 };
    }
    c.check(res.status === 200, `site ${url} answers 200 (${res.status})`);
    const local = read(`${page}index.html`);
    const want = new Map([...local.matchAll(STAMP)].map((m) => [m[1], m[2]]));
    const got = new Map([...html.matchAll(STAMP)].map((m) => [m[1], m[2]]));
    const off = [...want].filter(([file, v]) => got.get(file) !== v).map(([file, v]) => `${file} ${got.get(file) || 'missing'} ≠ ${v}`);
    c.check(want.size > 0 && !off.length, `site ${url}: the stamps of the release stand (${want.size} files${off.length ? `; ${off.slice(0, 2).join('; ')}` : ''})`);
    if (page === 'convert/') c.check(/data-cv\b/.test(html), `site ${url}: the converter page`);
  }
}

async function downloads(get, products, c) {
  for (const p of products) {
    for (const k of ['curseforge', 'modrinth']) {
      const d = p.data[k];
      if (d.status !== 'live') continue;
      let status = 0;
      try {
        const res = await get(d.url, { headers: { 'user-agent': 'Mozilla/5.0 (release check)' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
        status = res.status;
      } catch {
        status = 0;
      }
      const name = k === 'curseforge' ? 'CurseForge' : 'Modrinth';
      if (status === 403 && k === 'curseforge') c.note(`download button ${p.short} on CurseForge: 403 for a script (the CurseForge API checks the files)`);
      else c.check(status === 200, `download button ${p.short} on ${name} answers 200 (${d.url}: ${status})`);
    }
  }
}

function linksOnline(c) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/test-links.mjs'), '--online'], { encoding: 'utf8', timeout: 300000 });
  c.check(r.status === 0, `tools/test-links.mjs --online passes its checks (exit ${r.status})`);
  const lines = (r.stdout || '').split('\n').filter((l) => / -> /.test(l));
  const bad = lines.filter((l) => !/ -> (2\d\d|3\d\d)\b/.test(l) && !/curseforge\.com.* -> 403/.test(l));
  c.check(lines.length > 0 && !bad.length, `every external address answers (${lines.length} addresses${bad.length ? `; ${bad.slice(0, 3).map((l) => l.trim()).join(' | ')}` : ''})`);
}

async function run({ get, platforms, key, label, links }) {
  const failures = [];
  const notes = [];
  let checks = 0;
  const c = {
    check: (ok, m) => { checks++; if (!ok) failures.push(m); return !!ok; },
    note: (m) => { if (!notes.includes(m)) notes.push(m); },
  };
  const products = Object.entries(platforms.products).map(([k, data]) => ({ key: k, data, short: data.short }));
  const live = products.filter((p) => ['curseforge', 'modrinth'].some((k) => p.data[k].status === 'live'));
  c.check(live.length === products.length, `${label}: platforms.json is on the release stand (every product live somewhere: ${live.map((p) => p.short).join(', ') || 'none'})`);
  await modrinth(get, products, c);
  await curseforge(get, products, c, key);
  await site(get, c);
  await downloads(get, products, c);
  if (links) linksOnline(c);
  return { failures, notes, checks };
}

async function main() {
  const out = counter('live');
  const platforms = readJson('assets/data/platforms.json');
  if (LIVE) {
    const r = await run({ get: fetch, platforms, key: process.env.CURSEFORGE_API_KEY || null, label: 'live', links: true });
    for (const n of r.notes) out.note(n);
    for (const f of r.failures) out.check(false, f);
    out.check(true, 'live run done');
    out.finish(`live: ${SITE}, Modrinth${process.env.CURSEFORGE_API_KEY ? ', CurseForge' : ''}, ${r.checks} checks with ${r.failures.length} faults`);
    return;
  }
  const { server, base } = await serveDirs([ROOT]);
  let summary = '';
  const released = structuredClone(platforms);
  for (const p of Object.values(released.products)) for (const k of ['curseforge', 'modrinth']) p[k].status = 'live';
  try {
    const good = await run({ get: fixtureFetch('good.json', base), platforms: released, key: 'saved-answers', label: 'dry run', links: false });
    for (const f of good.failures) out.check(false, `no. 52/53 dry run with the answers of a correct upload: ${f}`);
    out.check(!good.failures.length, `no. 52/53 dry run: ${good.checks} checks on the answers of a correct upload pass`);
    const badFile = JSON.parse(read('tools/fixtures/cov/live/bad.json'));
    const bad = await run({ get: fixtureFetch('bad.json', base), platforms: released, key: 'saved-answers', label: 'dry run', links: false });
    for (const e of badFile.expect) out.check(bad.failures.some((f) => f.startsWith(e)), `no. 52/53 dry run: the answers of a broken upload give “${e}”`);
    const extra = bad.failures.filter((f) => !badFile.expect.some((e) => f.startsWith(e)));
    out.check(!extra.length, `no. 52/53 dry run: nothing else is reported for the broken upload (${extra.slice(0, 3).join(' | ')})`);
    summary = `${good.checks} checks on a correct upload, ${badFile.expect.length} faults of a broken one found`;
    const pre = await run({ get: fixtureFetch('good.json', base), platforms, key: 'saved-answers', label: 'today', links: false });
    out.note(`no. 52/53: today platforms.json is ${pre.failures.some((f) => f.includes('release stand')) ? 'not yet on the release stand (review)' : 'on the release stand'}; the real run is CURSEFORGE_API_KEY=… node tools/test-live.mjs --live (R5/R6)`);
  } finally {
    server.close();
  }
  out.finish(`dry run on saved answers (tools/fixtures/cov/live/) and this checkout as the live site: ${summary}`);
}

main().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
