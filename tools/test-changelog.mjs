#!/usr/bin/env node
// Checks the changelog page and its generated data (assets/data/changelog.json, written by tools/build-changelog.mjs):
//   - the data passes the page's own validation (assets/js/changelog/data.js): both products, versions newest first,
//     anchors product-x.y.z, known sections in page order, English and German for every title and entry, inline
//     Markdown that parses, links https:// or relative, no HTML
//   - the validator itself rejects broken copies (order, missing German, unclosed Markdown, javascript: links, …)
//   - every German text of tools/changelog/de.json is still used, German uses real umlauts
//   - when the Propwash and Just More Parts repositories are next to this one (or PROPWASH_SRC / JMP_SRC are set): the
//     data equals a fresh build from CHANGELOG.md at the recorded refs, and no newer release tag is missing
//   - the page loads its script, styles and data; every page links to it in the main navigation and the footer;
//     the released groups of the roadmap link to their changelog anchor
//   - no local paths, no term of the local denylist (as test-docs), no foreign hosts
//
//   node tools/test-changelog.mjs

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateChangelog, parseInline, plainText, CHANGELOG_URL, KINDS, tally } from '../assets/js/changelog/data.js';
import {
  PRODUCTS, buildChangelog, defaultRepo, loadTranslations, parseChangelog, releaseTags, serialize, unusedTranslations
} from './build-changelog.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let checks = 0;
const failures = [];
const notes = [];
function check(ok, message) {
  checks++;
  if (!ok) failures.push(message);
}

const raw = read('assets/data/changelog.json');
const data = JSON.parse(raw);
const de = loadTranslations();

// 1. The data
const problems = validateChangelog(data);
check(problems.length === 0, `assets/data/changelog.json:\n    ${problems.slice(0, 40).join('\n    ')}${problems.length > 40 ? `\n    … ${problems.length - 40} more` : ''}`);
check(fileURLToPath(CHANGELOG_URL) === path.join(ROOT, 'assets/data/changelog.json'), `CHANGELOG_URL points to ${CHANGELOG_URL}`);
check(raw === serialize(data), 'assets/data/changelog.json is formatted like the generator writes it');
check(JSON.stringify(data.products.map((p) => p.id)) === JSON.stringify(PRODUCTS.map((p) => p.id)), `products are ${PRODUCTS.map((p) => p.id).join(', ')} in this order`);
for (const p of data.products) {
  check(p.releases.length > 0, `${p.id}: has releases`);
  check(/^v\d+\.\d+\.\d+$/.test(p.source.ref) || p.source.ref === 'main', `${p.id}: read from a release tag (or main), not "${p.source.ref}"`);
  if (/^v\d+\.\d+\.\d+$/.test(p.source.ref)) check(p.releases[0].version === p.source.ref.slice(1), `${p.id}: newest release ${p.releases[0].version} matches the tag ${p.source.ref}`);
}
const propwash = data.products.find((p) => p.id === 'propwash');
for (const v of ['0.3.2', '0.4.0']) {
  check(propwash?.releases.some((r) => r.version === v), `propwash ${v} is on the page`);
}
for (const v of ['0.1.0', '0.2.0', '0.2.1', '0.3.0', '0.3.1']) {
  check(!propwash?.releases.some((r) => r.version === v), `propwash ${v} is internal and not on the page`);
}
check(data.products.find((p) => p.id === 'jmp')?.releases.some((r) => r.version === '1.0.0'), 'jmp 1.0.0 is on the page');

// Every highlight names its point in bold first, like the player changelog style.
for (const p of data.products) {
  for (const r of p.releases) {
    for (const s of r.sections) {
      if (s.kind !== 'highlights') continue;
      s.items.forEach((item, i) => {
        for (const lang of ['en', 'de']) {
          const first = parseInline(item[lang] || '').nodes[0];
          check(first?.t === 'strong', `${p.id} ${r.version} highlight ${i + 1} (${lang}) starts with its name in **bold**`);
        }
      });
    }
  }
}

// 2. The validator catches mistakes
const broken = [
  ['versions out of order', (d) => { d.products[0].releases.reverse(); }, 'newest first'],
  ['wrong anchor', (d) => { d.products[0].releases[0].id = 'propwash-latest'; }, 'must be "propwash-'],
  ['missing German entry', (d) => { d.products[0].releases[0].sections[0].items[0].de = null; }, 'missing German text'],
  ['missing German title', (d) => { delete d.products[0].releases[0].title.de; }, 'missing German text'],
  ['unclosed bold', (d) => { d.products[0].releases[0].sections[0].items[0].en = '**Bold without end'; }, 'unclosed **'],
  ['unclosed code', (d) => { d.products[0].releases[0].sections[0].items[0].en = 'Press `M to open'; }, 'unclosed `'],
  ['javascript link', (d) => { d.products[0].releases[0].sections[0].items[0].en = '[x](javascript:alert(1))'; }, 'https:// address'],
  ['HTML', (d) => { d.products[0].releases[0].sections[0].items[0].de = '<b>fett</b>'; }, 'no HTML'],
  ['unknown section', (d) => { d.products[0].releases[0].sections[0].kind = 'misc'; }, 'must be one of'],
  ['sections out of order', (d) => { d.products[0].releases[0].sections.reverse(); }, 'in the order'],
  ['empty section', (d) => { d.products[0].releases[0].sections[0].items = []; }, 'needs at least one entry'],
  ['bad version', (d) => { d.products[0].releases[0].version = 'v0.5'; }, 'must look like 1.2.3'],
  ['Markdown in a title', (d) => { d.products[0].releases[0].title.en = '**Big** release'; }, 'no Markdown in titles']
];
for (const [what, mutate, expected] of broken) {
  const copy = structuredClone(data);
  mutate(copy);
  const errs = validateChangelog(copy);
  check(errs.some((e) => e.includes(expected)), `validator misses: ${what} (got ${errs.length ? errs.slice(0, 3).join(' | ') : 'no error'})`);
}

// The parser of CHANGELOG.md
const sample = `# Changelog\n\nIntro text.\n\n## [Unreleased]\n### New\n- Not yet.\n\n## [1.1.0] — second\n\n### Fixed\n- A fix\n  over two lines.\n### Highlights\n- **Big:** thing.\n\n## [1.0.0] — first\n### New\n- One.\n`;
const parsed = parseChangelog(sample, 'sample');
check(parsed.length === 2 && parsed[0].version === '1.1.0' && parsed[1].version === '1.0.0', 'parser: skips [Unreleased], newest first');
check(parsed[0].sections.map((s) => s.kind).join() === 'highlights,fixed', 'parser: sections in page order');
check(parsed[0].sections[1].items[0] === 'A fix over two lines.', 'parser: joins continuation lines');
for (const [what, text, expected] of [
  ['unknown section', '## [1.0.0] — x\n### Misc\n- a\n', 'unknown section'],
  ['bullet outside a section', '## [1.0.0] — x\n- a\n', 'outside'],
  ['stray text', '## [1.0.0] — x\n### New\n- a\nSome paragraph.\n', 'unexpected text'],
  ['missing title', '## [1.0.0]\n### New\n- a\n', 'needs a title']
]) {
  let message = '';
  try { parseChangelog(text, 'sample'); } catch (e) { message = e.message; }
  check(message.includes(expected), `parser rejects ${what} (got "${message || 'nothing'}")`);
}

// 3. German texts
const used = new Set();
for (const p of data.products) {
  for (const r of p.releases) {
    const texts = de[p.id]?.[r.version] || {};
    const raws = [r.title.en, ...r.sections.flatMap((s) => s.items.map((i) => i.en))];
    for (const english of Object.keys(texts)) {
      if (raws.includes(english) || raws.some((x) => x.toLowerCase() === english.toLowerCase())) used.add(`${p.id}|${r.version}|${english}`);
    }
  }
}
const leftovers = unusedTranslations(de, data.products, used);
check(!leftovers.length, `tools/changelog/de.json: German texts no release uses any more – remove them:\n    ${leftovers.map((u) => `${u.product} ${u.version}: ${u.text}`).join('\n    ')}`);
const UMLAUT_SUBSTITUTES = /\b(fuer|ueber|koennen|koennte|moeglich|waehrend|waehlen|aendern|Aenderung|Groesse|groesser|muessen|muesst|zurueck|Schluessel|hoechstens|naechste|spaeter|Haelfte|Gelaende|heisst|Strasse|schliesslich|gruen|Faelle|Laenge|Hoehe|natuerlich|uebernehmen|Uebersicht)\b/;
const germanTexts = data.products.flatMap((p) => [p.tagline.de, ...p.releases.flatMap((r) => [r.title.de, ...r.sections.flatMap((s) => s.items.map((i) => i.de))])]);
const substitutes = [...new Set(germanTexts.map((t) => t?.match(UMLAUT_SUBSTITUTES)?.[0]).filter(Boolean))];
check(!substitutes.length, `German texts use real umlauts (${substitutes.join(', ')})`);
const englishInGerman = data.products.flatMap((p) => p.releases.flatMap((r) => r.sections.flatMap((s) => s.items
  .filter((i) => i.de === i.en && /\b(the|and|with|now|no longer)\b/.test(plainText(parseInline(i.en).nodes)))
  .map((i) => `${p.id} ${r.version}: ${i.en.slice(0, 60)}`))));
check(!englishInGerman.length, `German texts are translated, not copied:\n    ${englishInGerman.join('\n    ')}`);

// 4. Up to date with the changelogs in git (skipped when the repositories are not here)
const sources = [];
for (const meta of PRODUCTS) {
  const dir = process.env[meta.env] || defaultRepo(meta.folder);
  const product = data.products.find((p) => p.id === meta.id);
  if (!dir || !product) { notes.push(`${meta.name}: repository not found, freshness not checked (set ${meta.env})`); continue; }
  sources.push({ meta, dir, ref: product.source.ref });
  const newest = releaseTags(dir)[0];
  if (newest && /^v\d+\.\d+\.\d+$/.test(product.source.ref)) {
    check(newest === product.source.ref, `${meta.name}: newest release tag is ${newest}, the page shows ${product.source.ref} – run node tools/build-changelog.mjs`);
  }
}
if (sources.length === PRODUCTS.length) {
  try {
    const fresh = buildChangelog(sources, de);
    check(serialize(fresh.data) === raw, 'assets/data/changelog.json equals a fresh build from CHANGELOG.md at the recorded refs – run node tools/build-changelog.mjs (never edit the JSON by hand)');
    check(!fresh.missing.length, `entries without German text in tools/changelog/de.json:\n    ${fresh.missing.map((m) => `${m.product} ${m.version}: ${m.text}`).join('\n    ')}`);
  } catch (e) {
    check(false, `rebuilding from the changelogs failed: ${e.message}`);
  }
}

// 5. The page and its links
const page = read('changelog/index.html');
check(page.includes('src="../assets/js/changelog/view.js"'), 'changelog/index.html loads assets/js/changelog/view.js');
check(page.includes('href="../assets/css/changelog.css"'), 'changelog/index.html loads assets/css/changelog.css');
check(page.includes('href="../assets/data/changelog.json"'), 'changelog/index.html preloads assets/data/changelog.json');
check(/data-cl-root/.test(page) && /data-cl-tally/.test(page) && /data-cl-latest/.test(page) && /data-cl-status/.test(page), 'changelog/index.html has the render targets');
const view = read('assets/js/changelog/view.js');
const icons = new Set([...page.matchAll(/<symbol id="ri-([a-z0-9-]+)"/g)].map((m) => m[1]));
const usedIcons = new Set([...view.matchAll(/icon\('([a-z0-9-]+)'/g)].map((m) => m[1]));
for (const m of view.matchAll(/^\s+(?:highlights|new|improved|fixed|compatibility|'known-issues'): '([a-z0-9-]+)'/gm)) usedIcons.add(m[1]);
for (const m of view.matchAll(/productIcon: \{([^}]+)\}/g)) for (const n of m[1].matchAll(/'([a-z0-9-]+)'/g)) usedIcons.add(n[1]);
const missingIcons = [...usedIcons].filter((n) => !icons.has(n));
check(!missingIcons.length, `changelog/index.html: sprite has every icon the page uses (${missingIcons.join(', ')})`);
for (const kind of KINDS) check(view.includes(kind.includes('-') ? `'${kind}'` : `${kind}:`), `view.js has a label and icon for the section "${kind}"`);

function htmlPages(dir) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...htmlPages(rel));
    else if (entry.name === 'index.html') out.push(rel);
  }
  return out;
}
const pages = ['index.html', 'configurator/index.html', 'roadmap/index.html', 'changelog/index.html', ...htmlPages('docs')];
for (const file of pages) {
  const html = read(file);
  const depth = file.split('/').length - 1;
  const href = file === 'changelog/index.html' ? './' : `${'../'.repeat(depth)}changelog/`;
  const nav = /<nav class="site-nav"[\s\S]*?<\/nav>/.exec(html)?.[0] || '';
  const footer = /<p class="site-footer__links">[\s\S]*?<\/p>/.exec(html)?.[0] || '';
  check(nav.includes(`href="${href}"`), `${file}: main navigation links to the changelog (${href})`);
  check(footer.includes(`href="${href}">Changelog</a>`), `${file}: footer links to the changelog (${href})`);
}
check(/<a href="\.\/" aria-current="page">Changelog<\/a>/.test(page), 'changelog/index.html marks itself as the current page');

const anchors = new Set(data.products.flatMap((p) => [p.id, ...p.releases.map((r) => r.id)]));
const roadmap = JSON.parse(read('assets/data/roadmap.json'));
for (const horizon of roadmap.horizons) {
  if (horizon.id !== 'released') continue;
  for (const group of horizon.groups) {
    const expected = `../changelog/#propwash-${group.version}`;
    check(group.link?.href === expected, `roadmap ${group.version}: links to its changelog (${expected})`);
    check(anchors.has(`propwash-${group.version}`), `roadmap ${group.version}: the changelog has the anchor propwash-${group.version}`);
  }
}
for (const horizon of roadmap.horizons) {
  for (const group of horizon.groups) {
    for (const link of [group.link, ...group.items.map((i) => i.link)]) {
      const m = /^\.\.\/changelog\/#(.+)$/.exec(link?.href || '');
      if (m) check(anchors.has(m[1]), `roadmap: changelog anchor #${m[1]} exists`);
    }
  }
}

// 6. Privacy and hosts
const HOSTS = new Set(['propwashfpv.com', 'discord.gg', 'www.curseforge.com', 'modrinth.com', 'www.w3.org', 'github.com']);
const LOCAL_PATHS = [/\/Users\//, /[A-Za-z]:\\Users/, /\/home\/[a-z]/];
const DENYLIST_FILE = process.env.PROPWASH_EXPORT_DENYLIST || path.join(os.homedir(), '.config', 'propwash', 'public-export-denylist.txt');
const DENYLIST = fs.existsSync(DENYLIST_FILE)
  ? fs.readFileSync(DENYLIST_FILE, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.toLowerCase())
  : [];
check(DENYLIST.length > 0, 'denylist present and not empty (PROPWASH_EXPORT_DENYLIST or ~/.config/propwash/public-export-denylist.txt)');
const scanned = ['assets/data/changelog.json', 'tools/changelog/de.json', 'changelog/index.html', 'assets/js/changelog/view.js',
  'assets/js/changelog/data.js', 'assets/css/changelog.css', 'tools/build-changelog.mjs', 'tools/test-changelog.mjs'];
for (const file of scanned) {
  const content = read(file);
  const lower = content.toLowerCase();
  const hits = [
    ...LOCAL_PATHS.filter((re) => re.test(content)).map(String),
    ...DENYLIST.map((term, i) => (lower.includes(term) ? `denylist term ${i + 1}` : null)).filter(Boolean)
  ];
  check(!hits.length, `${file}: no local paths and no denylist term (${hits.join(', ')})`);
  if (file.startsWith('tools/')) continue;
  const foreign = [...content.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase()).filter((h) => !HOSTS.has(h));
  check(foreign.length === 0, `${file}: other hosts ${[...new Set(foreign)].join(', ')}`);
}
check(!/<script[^>]+src="https?:|rel="stylesheet"[^>]+href="https?:/.test(page), 'changelog/index.html: no external scripts or styles');

if (failures.length) {
  console.log(`changelog: ${failures.length} of ${checks} checks FAILED`);
  for (const f of failures) console.log(`  FAIL ${f}`);
  for (const n of notes) console.log(`  note ${n}`);
  process.exit(1);
}
const count = tally(data.products.flatMap((p) => p.releases));
for (const n of notes) console.log(`note: ${n}`);
console.log(`changelog: ${checks} checks passed (${data.products.map((p) => `${p.short} ${p.releases.length} releases from ${p.source.ref}`).join(', ')}; ${count.entries} entries + ${count.highlights} highlights, all in English and German)`);
