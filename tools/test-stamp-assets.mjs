#!/usr/bin/env node
// Checks the cache-busting stamps (tools/stamp-assets.mjs):
//   - every href="…"/src="…" of a local assets/css/*.css or assets/js/**/*.js on every page carries the ?v=<hash>
//     of the file it currently points to (catches both a missing stamp and a stale one left over from before an edit)
//   - every ES module import between the configurator's, roadmap's and changelog's own scripts that points to
//     another local assets/js file carries the same current hash (a cached old module could otherwise break the
//     configurator even though the page and its entry script are fresh – see README "Cache busting")
//   - recomputing every hash from scratch would not change a single file (nothing was hand-edited since the last
//     node tools/stamp-assets.mjs)
//
//   node tools/test-stamp-assets.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROOT, CSS_DIR, JS_DIR, IMPORT_RE, DYNAMIC_IMPORT_RE, HTML_REF_RE, findHtmlPages, computePlan,
} from './stamp-assets.mjs';

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let checks = 0;
const failures = [];
function check(ok, message) {
  checks++;
  if (!ok) failures.push(message);
}

const plan = computePlan();
const { hashes } = plan;

function resolveLocal(fromDir, refPath) {
  if (/^https?:\/\//.test(refPath)) return null;
  const resolved = path.posix.normalize(path.posix.join(fromDir, refPath));
  return resolved.startsWith(`${CSS_DIR}/`) || resolved.startsWith(`${JS_DIR}/`) ? resolved : null;
}
function expectedHashOf(resolved) {
  return hashes.css.get(resolved) || hashes.js.get(resolved);
}
function isLineCommented(content, offset) {
  const lineStart = content.lastIndexOf('\n', offset - 1) + 1;
  return content.slice(lineStart, offset).includes('//');
}

// 1. Every page's href/src of a local .css/.js carries the current hash.
const pages = findHtmlPages();
check(pages.length > 0, 'pages found to check');
for (const page of pages) {
  const html = read(page);
  const dir = path.posix.dirname(page);
  for (const m of html.matchAll(HTML_REF_RE)) {
    const resolved = resolveLocal(dir, m[2]);
    if (!resolved) continue; // vendor, external, or not a hashed tree
    const expected = expectedHashOf(resolved);
    const got = m[0].match(/\?v=([0-9a-f]{8})/)?.[1];
    check(got === expected, `${page}: ${m[2]} should carry ?v=${expected} (${got ? `has ?v=${got}` : 'missing'})`);
  }
}

// 2. Every JS-to-JS import (static or dynamic) that points to another local assets/js file carries the current hash.
for (const file of hashes.jsFiles) {
  const content = read(file);
  const dir = path.posix.dirname(file);
  for (const re of [IMPORT_RE, DYNAMIC_IMPORT_RE]) {
    for (const m of content.matchAll(re)) {
      if (isLineCommented(content, m.index)) continue;
      const resolved = resolveLocal(dir, m[3]);
      if (!resolved || !resolved.startsWith(`${JS_DIR}/`)) continue; // vendor import: out of scope
      const expected = hashes.js.get(resolved);
      const got = m[0].match(/\?v=([0-9a-f]{8})/)?.[1];
      check(got === expected, `${file}: import of ${m[3]} should carry ?v=${expected} (${got ? `has ?v=${got}` : 'missing'})`);
    }
  }
}

// 3. Recomputing from scratch changes nothing (every stamp is up to date with the files' current content).
check(plan.jsChanges.length === 0, `assets/js not fully stamped, run node tools/stamp-assets.mjs:\n    ${plan.jsChanges.map((c) => c.file).join('\n    ')}`);
check(plan.htmlChanges.length === 0, `pages not fully stamped, run node tools/stamp-assets.mjs:\n    ${plan.htmlChanges.map((c) => c.file).join('\n    ')}`);

if (failures.length) {
  console.log(`stamp-assets: ${failures.length} of ${checks} checks FAILED`);
  for (const f of failures.slice(0, 60)) console.log(`  FAIL ${f}`);
  process.exit(1);
}
console.log(`stamp-assets: ${checks} checks passed (${hashes.jsFiles.length} scripts, ${hashes.cssFiles.length} styles, ${pages.length} pages)`);
