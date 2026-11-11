#!/usr/bin/env node
// Network protocol of the Propwash release the site describes (finding PROTO18-1): Propwash 0.6.0 got protocol 17 in its
// first commit, the release candidates rc.1 and rc.2 were published with it, rc.3 had 18 (personal rules, leaderboard
// rows with the server rules), rc.4 had 19 (the last fix block: lap verdicts, the race line per course, advancements,
// accessory sync with recessed accessories), and the release 0.6.0 has 20 (the pilot's own lap for replays and ghosts
// of the leaderboard, uploaded after the server asked for it). The site names the protocol of the release it describes
// everywhere:
//   - PROTOCOL below lists the network protocol of each Propwash release; the docs data (tools/docs/data/meta.json)
//     carries the one of its version
//   - when the Propwash repository is here (PROPWASH_SRC, otherwise next to this repository or its main checkout),
//     Constants.PROTOCOL_VERSION at the commit or tag the changelog page reads that release from is the same number
//   - every page under docs/ names only that number (rows of other API versions in the API history keep theirs), and so
//     do the changelog entries of that release in English and German
//   - every dictionary in tools/i18n/dict translates each text about the protocol with the numbers of the text and keeps
//     no text about the protocol the site no longer has
//
//   node tools/test-protocol-texts.mjs

import { execFileSync } from 'node:child_process';
import { counter, read, readJson, ROOT } from './fixtures/cov/browser.mjs';
import { defaultRepo } from './build-changelog.mjs';
import { extract } from './i18n/extract.mjs';
import { LANGUAGES, loadDict } from './i18n/languages.mjs';

const { check, note, finish } = counter('protocol texts');

const PROTOCOL = { '0.5.2': 16, '0.6.0': 20 };
const MENTION = /\b(?:[Nn]etwork protocol|Netzwerkprotokoll|Netzprotokoll|protocol|Protokoll)\s+(\d+)\b/g;
const plain = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const mentions = (text) => [...text.matchAll(MENTION)].map((m) => ({ number: Number(m[1]), where: text.slice(Math.max(0, m.index - 50), m.index + m[0].length + 10) }));

const meta = readJson('tools/docs/data/meta.json');
const expected = PROTOCOL[meta.propwash];
check(Number.isInteger(expected), `PROTOCOL has no network protocol for Propwash ${meta.propwash} (tools/docs/data/meta.json) – add it`);
check(meta.protocol === expected, `tools/docs/data/meta.json: protocol ${meta.protocol}, but Propwash ${meta.propwash} has network protocol ${expected}`);

const changelog = readJson('assets/data/changelog.json');
const propwash = changelog.products.find((p) => p.id === 'propwash');
const release = propwash?.releases.find((r) => r.version === meta.propwash);
check(release, `assets/data/changelog.json: Propwash ${meta.propwash} is on the changelog page`);

const repo = process.env.PROPWASH_SRC || defaultRepo('propwash');
let compared = 'not compared';
if (!repo) {
  note('Propwash repository not found, Constants.PROTOCOL_VERSION not compared (set PROPWASH_SRC)');
} else if (propwash?.releases[0]?.version !== meta.propwash) {
  note(`the changelog page reads Propwash ${propwash?.releases[0]?.version}, the docs describe ${meta.propwash}: Constants.PROTOCOL_VERSION not compared`);
} else {
  const ref = propwash.source.ref;
  let source = '';
  try {
    source = execFileSync('git', ['-C', repo, 'show', `${ref}:common/src/main/java/de/lardtom/propwash/Constants.java`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    source = '';
  }
  const m = /PROTOCOL_VERSION\s*=\s*(\d+)/.exec(source);
  check(m, `Propwash ${ref}: Constants.PROTOCOL_VERSION not readable in ${repo}`);
  if (m) {
    compared = `Constants.PROTOCOL_VERSION ${m[1]} at ${ref.slice(0, 12)}`;
    check(Number(m[1]) === expected, `Propwash ${meta.propwash} at ${ref} (source of the changelog page): Constants.PROTOCOL_VERSION is ${m[1]}, PROTOCOL says ${expected}`);
  }
}

const api = String(meta.api).split('.').slice(0, 2).join('.');
const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
const pages = tracked.filter((f) => f.startsWith('docs/') && f.endsWith('.html'));
let onPages = 0;
for (const file of pages) {
  const html = read(file).replace(/<tr><th scope="row"><code>(\d+\.\d+)<\/code><\/th>[\s\S]*?<\/tr>/g, (row, version) => (version === api ? row : ' '));
  for (const m of mentions(plain(html))) {
    onPages++;
    check(m.number === expected, `${file}: network protocol ${m.number} instead of ${expected} (…${m.where}…)`);
  }
}
check(onPages > 0, 'the pages under docs/ name the network protocol');

let inChangelog = 0;
for (const item of release ? release.sections.flatMap((s) => s.items) : []) {
  for (const lang of ['en', 'de']) {
    for (const m of mentions(item[lang] || '')) {
      inChangelog++;
      check(m.number === expected, `changelog Propwash ${meta.propwash} (${lang}): network protocol ${m.number} instead of ${expected} (…${m.where}…)`);
    }
  }
}
check(inChangelog >= 2, `changelog Propwash ${meta.propwash}: the compatibility entry names the network protocol in English and German (${inChangelog} mentions)`);

const { entries: texts } = extract();
const protocolTexts = [...texts.keys()].filter((k) => mentions(k).length);
check(protocolTexts.length > 0, 'the site has texts about the network protocol to translate');
for (const lang of LANGUAGES) {
  const dict = loadDict(lang.code).entries;
  for (const key of protocolTexts) {
    const value = dict[key];
    if (!check(typeof value === 'string' && value.trim(), `tools/i18n/dict/${lang.code}.json: no translation of “${key.slice(0, 140)}”`)) continue;
    for (const m of mentions(key)) {
      check(new RegExp(`(?<!\\d)${m.number}(?!\\d)`).test(value), `tools/i18n/dict/${lang.code}.json: the translation of “${m.where}” lacks the number ${m.number}`);
    }
  }
  const stale = Object.keys(dict).filter((k) => mentions(k).length && !texts.has(k));
  check(!stale.length, `tools/i18n/dict/${lang.code}.json: texts about the protocol the site no longer has – remove them:\n    ${stale.map((k) => k.slice(0, 140)).join('\n    ')}`);
}

finish(`Propwash ${meta.propwash}: network protocol ${expected}, ${compared}; ${pages.length} pages with ${onPages} mentions, ${inChangelog} in the changelog, ${protocolTexts.length} texts in ${LANGUAGES.length} dictionaries`);
