// Shared parts of the coverage tests of the landing page, languages, roadmap, docs, changelog, add-on jars and the
// live site (tools/test-faq.mjs, tools/test-cov-*.mjs, tools/test-live.mjs): reading parts of the hand-written and
// generated pages, a preview of the language trees in a temporary folder and a static server over several folders.

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from '../../headless-chrome.mjs';
import { parse, walk, attr, inner, plain, findPairs, decode } from '../../i18n/html.mjs';

export { parse, walk, attr, inner, plain, findPairs, decode };

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain',
  '.mp4': 'video/mp4', '.jar': 'application/java-archive' };

/** Element with this id: {el, html (outer), body (inner)} or null. */
export function byId(html, id, doc = parse(html)) {
  for (const el of walk(doc)) {
    if (attr(el, 'id') === id) return { el, html: html.slice(el.start, el.end), body: inner(html, el) };
  }
  return null;
}

/** Every element with lang="<lang>" (outside "keep" elements) of a fragment, inner HTML joined by a space. */
export function langHtml(fragment, lang) {
  const doc = parse(fragment);
  const { pairs } = findPairs(fragment, doc);
  return pairs.map((p) => inner(fragment, lang === 'de' ? p.de : p.en)).join(' ');
}

/** The answer paragraphs of a FAQ entry (<details id>) in one language: {question, answer (HTML), text}. */
export function faq(html, id, lang) {
  const d = byId(html, id);
  if (!d) return null;
  const doc = parse(d.html);
  const summary = [...walk(doc)].find((e) => e.name === 'summary');
  const question = summary ? plain(langHtml(d.html.slice(summary.start, summary.end), lang)) : '';
  const answer = [...walk(doc)].filter((e) => e.name === 'p' && attr(e, 'lang') === lang).map((e) => inner(d.html, e)).join(' ');
  return { question, answer, text: plain(answer), outer: d.html };
}

/**
 * A docs section: the heading with this id and everything up to the next heading of the same or a higher level
 * (h2 ends at the next h2, h3 at the next h2 or h3). {level, heading (HTML), html, en, de (plain text)} or null.
 */
export function docSection(html, id) {
  const m = new RegExp(`<h([1-6])[^>]*\\bid="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`).exec(html);
  if (!m) return null;
  const level = Number(m[1]);
  const start = m.index;
  const close = html.indexOf(`</h${level}>`, start);
  const rest = html.slice(close);
  const next = new RegExp(`<h[1-${level}][\\s>]`).exec(rest.slice(5));
  const end = next ? close + 5 + next.index : html.length;
  const part = html.slice(start, end);
  return { level, heading: html.slice(start, close + 5), html: part, en: plain(langHtml(part, 'en')), de: plain(langHtml(part, 'de')) };
}

/** Ids of every element of a page. */
export function ids(html) {
  return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
}

/** Whether a local link of a page (relative to its file) leads to a file of the site and its anchor exists. */
export function linkTarget(fromFile, href) {
  const [p, hash] = href.split('#');
  let target = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), p.split('?')[0] || path.posix.basename(fromFile)));
  if (p.endsWith('/') || p === '' && fromFile.endsWith('index.html')) target = p === '' ? fromFile : path.posix.join(target, 'index.html');
  const file = path.join(ROOT, target);
  const exists = fs.existsSync(file) && fs.statSync(file).isFile();
  const anchor = !hash || (exists && target.endsWith('.html') && ids(fs.readFileSync(file, 'utf8')).has(hash));
  return { target, exists, anchor, ok: exists && anchor };
}

/** Writes the files of tools/i18n/build-i18n.mjs buildSite() into a new temporary folder; returns its path. */
export async function buildPreview({ languages, mode = 'strict', withRoot = true } = {}) {
  const { buildSite } = await import('../../i18n/build-i18n.mjs');
  const { LANGUAGES } = await import('../../i18n/languages.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-cov-b-'));
  const { files, report } = buildSite({ languages: languages || LANGUAGES, mode, withRoot });
  for (const [rel, content] of files) {
    const target = path.join(dir, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return { dir, files, report };
}

/** Static server: the first folder that has the file answers (a preview folder first, then the site). */
export function serveDirs(dirs) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const rel = decodeURIComponent(url.pathname);
    for (const dir of dirs) {
      let file = path.join(dir, rel);
      if (!file.startsWith(dir)) break;
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) continue;
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
      return;
    }
    res.writeHead(404).end();
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` })));
}

/** git show <ref>:<file> in a repository, or null. */
export function gitShow(repo, ref, file) {
  try {
    return execFileSync('git', ['-C', repo, 'show', `${ref}:${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null;
  }
}

/** Whether a ref exists in a repository. */
export function gitHasRef(repo, ref) {
  try {
    execFileSync('git', ['-C', repo, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** A sibling repository of this site: next to this checkout or next to its main checkout (worktrees). */
export function siblingRepo(folder) {
  const candidates = [path.join(ROOT, '..', folder)];
  try {
    const common = execFileSync('git', ['-C', ROOT, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
    candidates.push(path.join(path.dirname(common), '..', folder));
  } catch {
    /* not a git checkout */
  }
  return candidates.map((d) => path.resolve(d)).find((d) => fs.existsSync(path.join(d, '.git'))) || null;
}

/**
 * Add-on checkouts next to this repository that are not in the site's registry (mod id and name from their
 * gradle.properties) and the newest Fabric jar of each. Nothing of them is written into this repository.
 */
export function unlistedAddons(listed, dirsArg) {
  let dirs = (dirsArg || '').split(',').filter(Boolean);
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
    const name = ((/^mod_name\s*=\s*(.+)$/m.exec(text) || [])[1] || '').trim();
    const version = ((/^(?:mod_)?version\s*=\s*(\S+)/m.exec(text) || [])[1] || '').trim();
    const propwash = ((/^propwash_version\s*=\s*(\S+)/m.exec(text) || [])[1] || '').trim();
    if (!id || listed.has(id)) continue;
    const libs = path.join(d, 'fabric/build/libs');
    const jars = fs.existsSync(libs) ? fs.readdirSync(libs).filter((f) => f.endsWith('.jar') && !f.endsWith('-sources.jar')).map((f) => path.join(libs, f)) : [];
    jars.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    out.push({ id, name, version, propwash, repo: d, jar: jars[0] || null });
  }
  return out;
}

/** Writes a text file only when its folder is given; returns the path or null. */
export function keep(dir, name, data) {
  if (!dir) return null;
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, data);
  return file;
}
