// What the other languages translate (website design 0.6.0, 3.2.4): the pages for players and the texts the
// scripts draw at runtime. The add-on developer docs (add-on API, API reference, parts format) and the legal pages
// stay English/German; links to them lead to the root version.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './languages.mjs';

// file, path below the root (the page's address), page key of tools/site-nav.mjs. "optional" pages come with other
// parts of 0.6.0 and are translated as soon as they exist.
export const PAGES = [
  { file: 'index.html', path: '', current: 'home' },
  { file: 'configurator/index.html', path: 'configurator/', current: 'configurator' },
  { file: 'convert/index.html', path: 'convert/', current: 'convert', optional: true },
  { file: 'addons/index.html', path: 'addons/', current: 'addons', optional: true },
  { file: 'addons/just-more-parts/index.html', path: 'addons/just-more-parts/', current: 'addons-sub', optional: true },
  { file: 'roadmap/index.html', path: 'roadmap/', current: 'roadmap' },
  { file: 'changelog/index.html', path: 'changelog/', current: 'changelog' },
  { file: 'docs/index.html', path: 'docs/', current: 'docs' },
  { file: 'docs/guide/index.html', path: 'docs/guide/', current: 'docs-sub' },
  { file: 'docs/gamerules/index.html', path: 'docs/gamerules/', current: 'docs-sub' },
  { file: 'docs/blackbox/index.html', path: 'docs/blackbox/', current: 'docs-sub' },
];

// Texts drawn by scripts: "pairs" = every {en, de} object of a JSON file, "catalog" = the part texts of the
// configurator catalog (not the part and preset names, they are item names in the game), "js" = { en: '…', de: '…' }
// literals in a script, "js-arrays" = ['English', 'Deutsch', …] arrays (configurator texts). "page" texts are put
// into every page of the language instead of assets/i18n/<lang>.json (main.js runs before any fetch).
export const RUNTIME = [
  { file: 'assets/data/roadmap.json', kind: 'pairs' },
  { file: 'assets/data/changelog.json', kind: 'pairs' },
  { file: 'assets/data/platforms.json', kind: 'pairs', optional: true },
  { file: 'addons/registry.json', kind: 'pairs', optional: true },
  { file: 'assets/data/addons/registry.json', kind: 'pairs', optional: true },
  { file: 'assets/data/configurator/catalog.json', kind: 'catalog' },
  { file: 'assets/js/configurator/i18n.js', kind: 'js-arrays' },
  { file: 'assets/js/roadmap/view.js', kind: 'js', optional: true },
  { file: 'assets/js/changelog/view.js', kind: 'js', optional: true },
  { file: 'assets/js/main.js', kind: 'js', page: true },
];

const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

/** The pages translated now (optional ones only if they exist). */
export function sourcePages() {
  return PAGES.filter((p) => !p.optional || exists(p.file)).map((p) => ({ ...p, prefix: '../'.repeat(p.path.split('/').length - 1) }));
}

/** The runtime sources there are now. */
export function runtimeSources() {
  return RUNTIME.filter((s) => !s.optional || exists(s.file));
}

/** Paths of the translated pages ('' for the landing page). */
export const translatedPaths = () => sourcePages().map((p) => p.path);
