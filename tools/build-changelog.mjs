#!/usr/bin/env node
// Builds the changelog page data (assets/data/changelog.json, rendered by changelog/index.html) from the player-facing
// CHANGELOG.md of Propwash FPV and Propwash: Just More Parts, read from git – by default at the newest release tag
// (v<x.y.z>), so the page never shows notes of a release that is not tagged yet.
//
//   node tools/build-changelog.mjs [--propwash <dir>] [--propwash-ref <ref>] [--jmp <dir>] [--jmp-ref <ref>]
//                                  [--add-missing] [--check]
//
//   --propwash / --jmp     the repositories (default: PROPWASH_SRC / JMP_SRC, otherwise the folders "propwash" and
//                          "propwash-justmoreparts" next to this repository or next to its main checkout)
//   --propwash-ref / --jmp-ref
//                          tag, branch or commit to read CHANGELOG.md from (default: the newest v<x.y.z> tag)
//   --add-missing          adds every entry that has no German text yet to tools/changelog/de.json with an empty
//                          value, ready to be filled in
//   --check                writes nothing; exits with 1 when assets/data/changelog.json is not up to date
//
// CHANGELOG.md format: "## [x.y.z] — Title" per release (other "## [...]" headings such as [Unreleased] are skipped),
// "### Highlights|New|Improved|Fixed|Compatibility|Known issues" sections and "- " bullets with inline Markdown
// (**strong**, *emphasis*, `code`, [text](https://…)). Anything else inside a release stops the build with the line.
//
// German: tools/changelog/de.json maps the English source text of every title and bullet to its German text, per
// product and version. A bullet that repeats word for word in another release of the same product reuses its
// translation. tools/test-changelog.mjs fails while an entry has no German text or a German text is no longer used.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { KINDS, compareVersions, isVersion, releaseId } from '../assets/js/changelog/data.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_FILE = path.join(ROOT, 'assets/data/changelog.json');
export const DE_FILE = path.join(ROOT, 'tools/changelog/de.json');

export const PRODUCTS = [
  {
    id: 'propwash',
    name: 'Propwash FPV',
    short: 'Propwash',
    tagline: { en: 'The FPV drone mod for Minecraft', de: 'Die FPV-Drohnen-Mod für Minecraft' },
    folder: 'propwash',
    firstPublic: '0.3.2',
    env: 'PROPWASH_SRC',
    option: 'propwash'
  },
  {
    id: 'jmp',
    name: 'Propwash: Just More Parts',
    short: 'Just More Parts',
    tagline: { en: 'The add-on with real-world parts', de: 'Das Add-on mit echten Teilen' },
    folder: 'propwash-justmoreparts',
    env: 'JMP_SRC',
    option: 'jmp'
  }
];

const SECTION_KINDS = {
  highlights: 'highlights',
  new: 'new',
  improved: 'improved',
  fixed: 'fixed',
  compatibility: 'compatibility',
  'known issues': 'known-issues'
};

function git(dir, args) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function isRepo(dir) {
  try {
    git(dir, ['rev-parse', '--git-dir']);
    return true;
  } catch {
    return false;
  }
}

/** The folder of a sibling repository: next to this checkout, or next to the main checkout when this is a worktree. */
export function defaultRepo(folder) {
  const candidates = [path.join(ROOT, '..', folder)];
  try {
    const common = path.resolve(ROOT, git(ROOT, ['rev-parse', '--git-common-dir']).trim());
    candidates.push(path.join(path.dirname(common), '..', folder));
  } catch {
    /* not a git checkout */
  }
  return candidates.find((dir) => fs.existsSync(dir) && isRepo(dir)) || null;
}

/** Release tags v<x.y.z> of a repository, newest first. */
export function releaseTags(dir) {
  return git(dir, ['tag', '--list', 'v*'])
    .split('\n')
    .map((t) => t.trim())
    .filter((t) => /^v\d+\.\d+\.\d+$/.test(t))
    .sort((a, b) => compareVersions(b.slice(1), a.slice(1)));
}

export function readChangelog(dir, ref) {
  try {
    git(dir, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  } catch {
    throw new Error(`${path.basename(dir)}: unknown ref "${ref}"`);
  }
  return git(dir, ['show', `${ref}:CHANGELOG.md`]);
}

/**
 * Parses a player-facing CHANGELOG.md into releases with sections of raw (English, Markdown) entries.
 * `where` names the file in error messages.
 */
export function parseChangelog(markdown, where = 'CHANGELOG.md') {
  const releases = [];
  let release = null;
  let section = null;
  let skipping = false;
  const lines = markdown.split(/\r?\n/);
  lines.forEach((line, index) => {
    const at = `${where}:${index + 1}`;
    const h2 = /^##\s+\[([^\]]+)\]\s*(?:[—–-]\s*(.*?))?\s*$/.exec(line);
    if (h2) {
      section = null;
      if (!isVersion(h2[1])) {
        release = null;
        skipping = true;
        return;
      }
      skipping = false;
      if (releases.some((r) => r.version === h2[1])) throw new Error(`${at}: version ${h2[1]} appears twice`);
      if (!h2[2]) throw new Error(`${at}: "## [${h2[1]}]" needs a title after the dash`);
      release = { version: h2[1], title: h2[2], sections: [] };
      releases.push(release);
      return;
    }
    if (/^##\s/.test(line) || /^#\s/.test(line)) {
      if (release || skipping) throw new Error(`${at}: unexpected heading "${line}"`);
      return;
    }
    if (skipping) return;
    if (!release) return;
    const h3 = /^###\s+(.+?)\s*$/.exec(line);
    if (h3) {
      const kind = SECTION_KINDS[h3[1].toLowerCase()];
      if (!kind) throw new Error(`${at}: unknown section "${h3[1]}" – use ${Object.keys(SECTION_KINDS).map((k) => k[0].toUpperCase() + k.slice(1)).join(', ')}`);
      if (release.sections.some((s) => s.kind === kind)) throw new Error(`${at}: section "${h3[1]}" appears twice in ${release.version}`);
      section = { kind, items: [] };
      release.sections.push(section);
      return;
    }
    const bullet = /^[-*]\s+(.*\S)\s*$/.exec(line);
    if (bullet) {
      if (!section) throw new Error(`${at}: bullet outside a "###" section`);
      section.items.push(bullet[1]);
      return;
    }
    if (/^\s{2,}\S/.test(line) && section?.items.length) {
      section.items[section.items.length - 1] += ` ${line.trim()}`;
      return;
    }
    if (!line.trim()) return;
    throw new Error(`${at}: unexpected text in ${release.version}: "${line.slice(0, 60)}" – only "###" sections and "- " bullets`);
  });
  for (const r of releases) {
    if (!r.sections.length) throw new Error(`${where}: ${r.version} has no sections`);
    for (const s of r.sections) if (!s.items.length) throw new Error(`${where}: ${r.version} has an empty section ${s.kind}`);
    r.sections.sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind));
  }
  releases.sort((a, b) => compareVersions(b.version, a.version));
  return releases;
}

function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function loadTranslations(file = DE_FILE) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
}

/**
 * Turns parsed releases into the page data with German texts. Returns { product, missing, used } where missing lists
 * the entries without German text and used the de.json keys ("product|version|text") that were looked up.
 */
export function buildProduct(meta, releases, ref, de) {
  const own = de[meta.id] || {};
  const missing = [];
  const used = new Set();
  function german(version, english) {
    const exact = own[version]?.[english];
    if (typeof exact === 'string' && exact.trim()) {
      used.add(`${meta.id}|${version}|${english}`);
      return exact;
    }
    for (const [other, texts] of Object.entries(own)) {
      const value = texts?.[english];
      if (other !== version && typeof value === 'string' && value.trim()) {
        used.add(`${meta.id}|${other}|${english}`);
        return value;
      }
    }
    if (typeof exact === 'string') used.add(`${meta.id}|${version}|${english}`);
    missing.push({ product: meta.id, version, text: english });
    return null;
  }
  const product = {
    id: meta.id,
    name: meta.name,
    short: meta.short,
    tagline: meta.tagline,
    source: { ref },
    releases: releases.map((r) => ({
      version: r.version,
      id: releaseId(meta.id, r.version),
      title: { en: capitalize(r.title), de: german(r.version, r.title) },
      sections: r.sections.map((s) => ({
        kind: s.kind,
        items: s.items.map((item) => ({ en: item, de: german(r.version, item) }))
      }))
    }))
  };
  return { product, missing, used };
}

/** Keys of de.json that no release uses any more (left over after a changelog line changed). */
export function unusedTranslations(de, products, used) {
  const live = new Map();
  for (const p of products) for (const r of p.releases) live.set(`${p.id}|${r.version}`, r);
  const unused = [];
  for (const [productId, versions] of Object.entries(de)) {
    for (const [version, texts] of Object.entries(versions || {})) {
      for (const english of Object.keys(texts || {})) {
        if (!used.has(`${productId}|${version}|${english}`)) unused.push({ product: productId, version, text: english, release: live.has(`${productId}|${version}`) });
      }
    }
  }
  return unused;
}

export function resolveSources(options = {}) {
  return PRODUCTS.map((meta) => {
    const dir = options[meta.option] || process.env[meta.env] || defaultRepo(meta.folder);
    if (!dir || !isRepo(dir)) {
      throw new Error(`${meta.name}: repository not found – pass --${meta.option} <dir> or set ${meta.env}`);
    }
    const ref = options[`${meta.option}Ref`] || releaseTags(dir)[0];
    if (!ref) throw new Error(`${meta.name}: no release tag v<x.y.z> in ${path.basename(dir)} – pass --${meta.option}-ref <ref>`);
    return { meta, dir, ref };
  });
}

/** Reads both changelogs and returns { data, missing, unused, sources }. */
export function buildChangelog(sources, de = loadTranslations()) {
  const products = [];
  const missing = [];
  const used = new Set();
  for (const { meta, dir, ref } of sources) {
    const markdown = readChangelog(dir, ref);
    const releases = parseChangelog(markdown, `${meta.short} CHANGELOG.md@${ref}`)
      .filter((r) => !meta.firstPublic || compareVersions(r.version, meta.firstPublic) >= 0);
    if (!releases.length) throw new Error(`${meta.name}: CHANGELOG.md at ${ref} has no release`);
    const built = buildProduct(meta, releases, ref, de);
    products.push(built.product);
    missing.push(...built.missing);
    for (const key of built.used) used.add(key);
  }
  const data = { schema: 1, products };
  return { data, missing, unused: unusedTranslations(de, products, used) };
}

export function serialize(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

function addMissing(de, missing) {
  for (const { product, version, text } of missing) {
    de[product] ??= {};
    de[product][version] ??= {};
    if (!(text in de[product][version])) de[product][version][text] = '';
  }
  const sorted = {};
  for (const meta of PRODUCTS) {
    if (!de[meta.id]) continue;
    sorted[meta.id] = {};
    for (const version of Object.keys(de[meta.id]).sort((a, b) => compareVersions(b, a))) sorted[meta.id][version] = de[meta.id][version];
  }
  for (const key of Object.keys(de)) if (!sorted[key]) sorted[key] = de[key];
  fs.writeFileSync(DE_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new Error(`${arg} needs a value`);
      return argv[++i];
    };
    if (arg === '--propwash') options.propwash = path.resolve(value());
    else if (arg === '--jmp') options.jmp = path.resolve(value());
    else if (arg === '--propwash-ref') options.propwashRef = value();
    else if (arg === '--jmp-ref') options.jmpRef = value();
    else if (arg === '--add-missing') options.addMissing = true;
    else if (arg === '--check') options.check = true;
    else throw new Error(`unknown option ${arg}`);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const sources = resolveSources(options);
  const de = loadTranslations();
  const { data, missing, unused } = buildChangelog(sources, de);
  for (const p of data.products) {
    const counts = p.releases.map((r) => `${r.version} (${r.sections.reduce((n, s) => n + s.items.length, 0)})`).join(', ');
    console.log(`${p.name}: CHANGELOG.md at ${p.source.ref} – ${p.releases.length} releases: ${counts}`);
  }
  if (missing.length) {
    console.log(`\n${missing.length} entries without German text in tools/changelog/de.json:`);
    for (const m of missing) console.log(`  ${m.product} ${m.version}: ${m.text}`);
  }
  if (unused.length) {
    console.log(`\n${unused.length} German texts in tools/changelog/de.json that no release uses any more (remove them):`);
    for (const u of unused) console.log(`  ${u.product} ${u.version}${u.release ? '' : ' (release not in the changelog)'}: ${u.text}`);
  }
  if (options.addMissing && missing.length) {
    addMissing(de, missing);
    console.log(`\nadded ${missing.length} empty entries to tools/changelog/de.json – fill them in and run this again`);
  }
  const out = serialize(data);
  const current = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8') : '';
  if (options.check) {
    if (current !== out) {
      console.log('\nassets/data/changelog.json is NOT up to date – run node tools/build-changelog.mjs');
      process.exit(1);
    }
    console.log('\nassets/data/changelog.json is up to date');
    return;
  }
  if (current === out) console.log('\nassets/data/changelog.json unchanged');
  else {
    fs.writeFileSync(OUT_FILE, out);
    console.log('\nwrote assets/data/changelog.json');
  }
  if (missing.length) console.log('run node tools/test-changelog.mjs after adding the German texts');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(`build-changelog: ${e.message}`);
    process.exit(1);
  }
}
