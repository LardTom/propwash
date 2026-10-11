#!/usr/bin/env node
// Cache busting: stamps every local reference to assets/css/*.css and assets/js/**/*.js – in every HTML page's
// <link>/<script> and in the ES module imports between the configurator's, roadmap's and changelog's own scripts –
// with ?v=<8 hex chars> derived from the referenced file's content, so a browser never combines a freshly deployed
// page (or a freshly deployed module) with a stale cached style sheet or script after an update.
//
//   node tools/stamp-assets.mjs          # restamp every page and script that is out of date
//   node tools/stamp-assets.mjs --check  # report what is out of date and exit 1, write nothing
//
// Hashing: every CSS file's hash is its own content. A JS file's hash also depends on the hash of every local
// module it imports (so a change inside a dependency still busts its importers' URLs), computed in dependency
// order (Tarjan's strongly-connected-components, so the one import cycle in the configurator – sharecode.js and
// sharecode2.js import each other – gets a single shared hash for both files instead of an unsolvable loop).
// Imports of assets/vendor/* (three.js, pako) are left alone: out of scope, pinned and rebuilt by hand (see README).
//
// Hook: tools/build-docs.mjs calls applyPlan(computePlan()) after writing docs/**/index.html, so regenerated pages
// keep current stamps automatically. After hand-editing any CSS/JS file or any of the other HTML pages, rerun this
// script before committing (tools/test-stamp-assets.mjs fails until then).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CSS_DIR = 'assets/css';
export const JS_DIR = 'assets/js';
const SKIP_HTML_DIRS = new Set(['node_modules', 'tools', 'assets']);

function sha8(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 8);
}

function listJsFiles(dir = JS_DIR) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsFiles(rel));
    else if (entry.name.endsWith('.js')) out.push(rel);
  }
  return out.sort();
}

function listCssFiles() {
  return fs.readdirSync(path.join(ROOT, CSS_DIR)).filter((f) => f.endsWith('.css')).map((f) => `${CSS_DIR}/${f}`).sort();
}

// Every local index.html under the site root (same walk as tools/test-links.mjs).
export function findHtmlPages(dir = '') {
  const pages = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || (dir === '' && SKIP_HTML_DIRS.has(entry.name))) continue;
      pages.push(...findHtmlPages(path.posix.join(dir, entry.name)));
    } else if (entry.name === 'index.html') {
      pages.push(path.posix.join(dir, 'index.html'));
    }
  }
  return pages.sort();
}

// A relative `from '…'` / `import('…')` specifier ending in .js, with an optional existing stamp (so rerunning is
// idempotent: the match always covers the whole old "path?v=hash", not just "path").
export const IMPORT_RE = /\bfrom(\s*)(['"])(\.\.?\/[^'"]+?\.js)(?:\?v=[0-9a-f]{8})?\2/g;
export const DYNAMIC_IMPORT_RE = /\bimport(\s*)\(\s*(['"])(\.\.?\/[^'"]+?\.js)(?:\?v=[0-9a-f]{8})?\2\s*\)/g;
// href="…" / src="…" ending in .css or .js, with an optional existing stamp, in an HTML page.
export const HTML_REF_RE = /(href|src)="([^"]+?\.(?:css|js))(?:\?v=[0-9a-f]{8})?"/g;

// Resolves a reference's path relative to the referencing file's directory; returns it only if it falls under
// assets/css or assets/js (the only trees this script stamps), otherwise null (vendor imports, external URLs, …).
function resolveLocal(fromDir, refPath) {
  if (/^https?:\/\//.test(refPath)) return null;
  const resolved = path.posix.normalize(path.posix.join(fromDir, refPath));
  return resolved.startsWith(`${CSS_DIR}/`) || resolved.startsWith(`${JS_DIR}/`) ? resolved : null;
}

// True if `offset` sits after a `//` that starts earlier on the same line (a commented-out example import, not
// real code – e.g. the usage example in the header comment of configurator/index.js).
function isLineCommented(content, offset) {
  const lineStart = content.lastIndexOf('\n', offset - 1) + 1;
  return content.slice(lineStart, offset).includes('//');
}

function localImportTargets(fileRel, content) {
  const dir = path.posix.dirname(fileRel);
  const targets = new Set();
  for (const re of [IMPORT_RE, DYNAMIC_IMPORT_RE]) {
    for (const m of content.matchAll(re)) {
      if (isLineCommented(content, m.index)) continue;
      const resolved = resolveLocal(dir, m[3]);
      if (resolved && resolved.startsWith(`${JS_DIR}/`)) targets.add(resolved);
    }
  }
  return targets;
}

// Tarjan's strongly-connected-components: returns the components in dependency order (a component's dependencies
// always appear before it), so hashes can be computed in a single left-to-right pass even across import cycles.
function stronglyConnectedComponents(nodes, edgesOf) {
  let counter = 0;
  const index = new Map();
  const lowlink = new Map();
  const onStack = new Set();
  const stack = [];
  const components = [];
  function visit(v) {
    index.set(v, counter);
    lowlink.set(v, counter);
    counter++;
    stack.push(v);
    onStack.add(v);
    for (const w of edgesOf(v)) {
      if (!index.has(w)) {
        visit(w);
        lowlink.set(v, Math.min(lowlink.get(v), lowlink.get(w)));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v), index.get(w)));
      }
    }
    if (lowlink.get(v) === index.get(v)) {
      const component = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      components.push(component);
    }
  }
  for (const v of nodes) if (!index.has(v)) visit(v);
  return components;
}

// Computes every CSS and JS file's current cache-busting hash, plus the JS content that carries it (every local
// import of another assets/js file stamped with that file's hash).
export function computeHashes() {
  const cssFiles = listCssFiles();
  const css = new Map(cssFiles.map((f) => [f, sha8(fs.readFileSync(path.join(ROOT, f), 'utf8'))]));

  const jsFiles = listJsFiles();
  const rawContent = new Map(jsFiles.map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]));
  const components = stronglyConnectedComponents(jsFiles, (f) => localImportTargets(f, rawContent.get(f)));

  const js = new Map();
  const jsContent = new Map();
  for (const component of components) {
    const members = new Set(component);
    const partials = new Map();
    for (const f of component) {
      const dir = path.posix.dirname(f);
      const stamp = (specPath) => {
        const resolved = resolveLocal(dir, specPath);
        if (!resolved || !resolved.startsWith(`${JS_DIR}/`)) return specPath; // vendor or out of scope: untouched
        if (js.has(resolved)) return `${specPath}?v=${js.get(resolved)}`;
        if (members.has(resolved)) return `${specPath}?v=@@SELF@@`; // same import cycle, resolved below
        throw new Error(`stamp-assets: ${f} depends on ${resolved}, which was not resolved before it (build graph bug)`);
      };
      let content = rawContent.get(f);
      content = content.replace(IMPORT_RE, (whole, ws, quote, specPath, offset, full) => (
        isLineCommented(full, offset) ? whole : `from${ws}${quote}${stamp(specPath)}${quote}`
      ));
      content = content.replace(DYNAMIC_IMPORT_RE, (whole, ws, quote, specPath, offset, full) => (
        isLineCommented(full, offset) ? whole : `import${ws}(${quote}${stamp(specPath)}${quote})`
      ));
      partials.set(f, content);
    }
    const selfReferential = component.length > 1 || partials.get(component[0]).includes('?v=@@SELF@@');
    const hash = selfReferential
      ? sha8([...component].sort().map((f) => `${f}\n${partials.get(f)}`).join('\u0000'))
      : sha8(partials.get(component[0]));
    for (const f of component) {
      js.set(f, hash);
      jsContent.set(f, partials.get(f).split('?v=@@SELF@@').join(`?v=${hash}`));
    }
  }
  return { css, js, jsContent, cssFiles, jsFiles };
}

// Stamps every href="…"/src="…" of a .css or .js under assets/css or assets/js in one HTML page's markup (used both
// for pages already on disk and for a generator's in-memory output before it is written or compared).
export function stampHtml(pageRelPath, html, hashes) {
  const dir = path.posix.dirname(pageRelPath);
  return html.replace(HTML_REF_RE, (whole, attr, refPath) => {
    const resolved = resolveLocal(dir, refPath);
    const hash = resolved && (hashes.css.get(resolved) || hashes.js.get(resolved));
    return hash ? `${attr}="${refPath}?v=${hash}"` : whole;
  });
}

// Everything that would change if applied now, without touching disk.
export function computePlan() {
  const hashes = computeHashes();
  const jsChanges = [];
  for (const f of hashes.jsFiles) {
    const current = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const next = hashes.jsContent.get(f);
    if (current !== next) jsChanges.push({ file: f, content: next });
  }
  const htmlChanges = [];
  for (const page of findHtmlPages()) {
    const current = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const next = stampHtml(page, current, hashes);
    if (current !== next) htmlChanges.push({ file: page, content: next });
  }
  return { hashes, jsChanges, htmlChanges };
}

// Writes every change of a plan to disk; returns how many files were touched.
export function applyPlan(plan) {
  for (const { file, content } of [...plan.jsChanges, ...plan.htmlChanges]) {
    fs.writeFileSync(path.join(ROOT, file), content);
  }
  return plan.jsChanges.length + plan.htmlChanges.length;
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const plan = computePlan();
  const changed = [...plan.jsChanges, ...plan.htmlChanges].map((c) => c.file);
  if (checkOnly) {
    if (changed.length) {
      console.log(`stamp-assets: ${changed.length} file(s) need a current ?v= stamp – run node tools/stamp-assets.mjs:`);
      for (const f of changed) console.log(`  ${f}`);
      process.exit(1);
    }
    console.log('stamp-assets: every reference already carries the current hash');
    return;
  }
  const n = applyPlan(plan);
  console.log(`stamp-assets: ${n} file(s) stamped (${plan.jsChanges.length} script(s), ${plan.htmlChanges.length} page(s)), ${plan.hashes.jsFiles.length} scripts and ${plan.hashes.cssFiles.length} styles hashed`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
