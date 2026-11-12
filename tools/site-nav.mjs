// The main navigation of every page (the <nav class="site-nav"> in the header) and the link line of the footer,
// defined once.
//
// Hand-written pages get both from tools/build-nav.mjs, the docs pages from tools/docs/html.mjs; tools/test-nav.mjs
// checks that every page carries the current version. Structure: a "Features" menu with the sections of the landing
// page, then Docs, Changelog, Roadmap and Download, Discord (only in the small-screen menu), the configurator as
// the highlighted button and, once another language is active (tools/i18n/languages.json), the language menu.
// The pages of the other languages (tools/i18n/build-i18n.mjs) take the same navigation in their language.
// Also here: the head block of every page (siteHead: pw-root, hreflang alternates, i18n.css, the head script).

import { OFFICIAL, PHRASES, activeLanguages, alternateLinks, phrase } from './i18n/languages.mjs';
import { translatedPaths } from './i18n/pages.mjs';

export const DISCORD = 'https://discord.gg/bNhkSXYSgZ';
export const DISCORD_PATH = 'M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z';

// Sections of the landing page, in page order. Every href is an id in index.html (tools/test-nav.mjs checks it).
export const FEATURES = [
  { href: '#server', title: { en: 'Community server', de: 'Community-Server' },
    text: { en: 'mc.propwashfpv.com, with Fabric or NeoForge', de: 'mc.propwashfpv.com, mit Fabric oder NeoForge' } },
  { href: '#how', title: { en: 'Get started', de: 'Loslegen' },
    text: { en: 'Build, bind, fly and race in four steps', de: 'Bauen, binden, fliegen, rennen in vier Schritten' } },
  { href: '#new', title: { en: 'What’s new', de: 'Neuigkeiten' },
    text: { en: 'The highlights of the latest update', de: 'Die Highlights des neuesten Updates' } },
  { href: '#flight', title: { en: 'Flight &amp; tuning', de: 'Flug &amp; Tuning' },
    text: { en: 'Flight model, Betaflight-style tuning, radio or gamepad', de: 'Flugmodell, Tuning wie in Betaflight, Funke oder Gamepad' } },
  { href: '#video', title: { en: 'Video', de: 'Video' },
    text: { en: 'Analog or digital, and how the picture breaks up', de: 'Analog oder digital, und wie das Bild zerfällt' } },
  { href: '#racing', title: { en: 'Racing &amp; freestyle', de: 'Rennen &amp; Freestyle' },
    text: { en: 'Gates, ghosts, leaderboards and tricks', de: 'Gates, Geister, Bestenlisten und Tricks' } },
  { href: '#survival', title: { en: 'Survival', de: 'Überlebensmodus' },
    text: { en: 'Crafting, loot, batteries and part wear', de: 'Herstellen, Beute, Akkus und Verschleiß' } },
  { href: '#extras', title: { en: 'More details', de: 'Mehr Details' },
    text: { en: 'Lights, action cams, paint, sound and bandos', de: 'Licht, Action-Cams, Lack, Sound und Bandos' } },
  { href: '#gallery', title: { en: 'Screenshots', de: 'Screenshots' },
    text: { en: 'Straight from the game', de: 'Direkt aus dem Spiel' } },
  { href: '#faq', title: { en: 'FAQ', de: 'FAQ' },
    text: { en: 'Questions before take-off', de: 'Fragen vor dem Start' } },
];

// Plain links after the menu. "current" is the page key that marks the link as the current page.
export const LINKS = [
  { href: 'docs/', label: { en: 'Docs', de: 'Doku' }, current: 'docs' },
  { href: 'addons/', label: { en: 'Add-ons', de: 'Add-ons' }, current: 'addons' },
  { href: 'changelog/', label: { en: 'Changelog', de: 'Changelog' }, current: 'changelog' },
  { href: 'roadmap/', label: { en: 'Roadmap', de: 'Roadmap' }, current: 'roadmap' },
  { href: '#download', label: { en: 'Download', de: 'Download' } },
];

export const CONFIGURATOR = { href: 'configurator/', label: { en: 'Configurator', de: 'Konfigurator' } };

// The four-rotor mark of the configurator button (also used by the hero and the teaser on the landing page).
export const QUAD_ICON = '<svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" class="quad-icon"><path d="M6.2 6.2l7.6 7.6M13.8 6.2l-7.6 7.6"/><circle cx="5" cy="5" r="3"/><circle cx="15" cy="5" r="3"/><circle cx="5" cy="15" r="3"/><circle cx="15" cy="15" r="3"/><rect x="8" y="8" width="4" height="4" rx="1"/></svg>';

const CHEVRON = '<svg class="nav-group__chev" aria-hidden="true" viewBox="0 0 12 12" width="12" height="12"><path d="M2.5 4.5 6 8l3.5-3.5"/></svg>';

const GLOBE = '<svg class="i18n-globe" aria-hidden="true" viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="6.25"/><path d="M1.75 8h12.5M8 1.75c1.9 1.7 2.85 3.8 2.85 6.25S9.9 12.55 8 14.25M8 1.75C6.1 3.45 5.15 5.55 5.15 8S6.1 12.55 8 14.25"/></svg>';

// Paths of the pages with a fixed page key ('docs-sub' and 'addons-sub' stand for several pages).
const PAGE_PATHS = {
  home: '', configurator: 'configurator/', convert: 'convert/', addons: 'addons/', docs: 'docs/', changelog: 'changelog/',
  roadmap: 'roadmap/', impressum: 'impressum/', datenschutz: 'datenschutz/', brand: 'brand/',
};

const escapeAttr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Texts of the navigation: both languages as spans, or (pages of another language) the translation of the English.
function labeller(tr) {
  return (t) => (tr ? tr(t.en) : (t.en === t.de ? t.en : `<span lang="en">${t.en}</span><span lang="de">${t.de}</span>`));
}
function ariaLabel(t, tr) {
  return tr ? `aria-label="${escapeAttr(tr(t.en))}"` : `aria-label="${t.en}" data-de-aria-label="${t.de}"`;
}

// The language menu: English and German switch the page in place (?lang= without JavaScript), the other languages
// lead to the same page in their tree when it is translated, else to the tree's landing page.
function languageMenu(prefix, current, options, label) {
  const languages = options.languages ?? activeLanguages();
  if (!languages.length) return '';
  const pages = translatedPaths();
  const pagePath = options.path ?? PAGE_PATHS[current] ?? null;
  const here = pagePath !== null && pages.includes(pagePath) ? pagePath : '';
  const tag = (code) => `<span class="i18n-tag">${phrase(code, PHRASES.tag)}</span>`;
  const entry = (href, code, hreflang, name, extra = '') => `          <li><a class="keep" href="${href}" hreflang="${hreflang}" lang="${hreflang}" data-lang-pick="${code}"${options.lang === code ? ' aria-current="true"' : ''}${extra}><span class="nav-group__title">${name}</span></a></li>`;
  const items = [
    ...OFFICIAL.map((l) => entry(`?lang=${l.code}`, l.code, l.hreflang, l.name)),
    ...languages.map((l) => entry(`${prefix}${l.code}/${here}`, l.code, l.hreflang, `${l.name} ${tag(l.code)}`, options.lang ? ''
      : ` data-hint="${escapeAttr(phrase(l.code, PHRASES.hint) || '')}" data-hint-close="${escapeAttr(phrase(l.code, PHRASES.close) || '')}"`)),
  ];
  const paths = pages.map((p) => p || '/').join(' ');
  return `
      <div class="nav-group nav-group--lang" data-nav-group data-lang-menu data-i18n-pages="${paths}">
        <button type="button" class="nav-group__toggle" aria-expanded="false" aria-controls="nav-languages" data-nav-group-toggle>${GLOBE}<span class="i18n-menu__label">${label({ en: PHRASES.languages, de: 'Sprachen' })}</span>${CHEVRON}</button>
        <ul class="nav-group__panel" id="nav-languages">
${items.join('\n')}
        </ul>
      </div>`;
}

/**
 * The navigation for a page.
 * @param {string} prefix  path from the page to the site root ('' for index.html, '../' one level down, …)
 * @param {string|null} current  'home', 'configurator', 'docs', 'docs-sub' (a page below docs/), 'changelog',
 *   'roadmap', 'impressum', 'datenschutz' or 'brand'
 * @param {object} [options]  languages: the other languages in the language menu (default: the active ones of
 *   tools/i18n/languages.json, none = no menu); path: the page's path below the root, if the page key does not tell;
 *   lang + tr: the page is in that other language, tr(english) gives the translation of a text
 */
export function siteNav(prefix, current, options = {}) {
  const tr = options.tr || null;
  const label = labeller(tr);
  const href = (h) => {
    if (h.startsWith('#')) return current === 'home' ? h : `${prefix}${h}`;
    const here = (current === 'docs' && h === 'docs/') || (current === h.replace(/\/$/, ''));
    return here ? './' : `${prefix}${h}`;
  };
  const mark = (key) => {
    if (current === key) return ' aria-current="page"';
    if (current === 'docs-sub' && key === 'docs') return ' aria-current="true"';
    return '';
  };
  const features = FEATURES.map((f) => `          <li><a href="${href(f.href)}"><span class="nav-group__title">${label(f.title)}</span><span class="nav-group__text">${label(f.text)}</span></a></li>`).join('\n');
  const links = LINKS.map((l) => `      <a href="${href(l.href)}"${l.current ? mark(l.current) : ''}>${label(l.label)}</a>`).join('\n');
  return `    <nav class="site-nav" id="site-nav" ${ariaLabel({ en: 'Main', de: 'Hauptmenü' }, tr)}>
      <div class="nav-group" data-nav-group>
        <button type="button" class="nav-group__toggle" aria-expanded="false" aria-controls="nav-features" data-nav-group-toggle>${label({ en: 'Features', de: 'Funktionen' })}${CHEVRON}</button>
        <ul class="nav-group__panel" id="nav-features">
${features}
        </ul>
      </div>
${links}
      <a class="site-nav__social" href="${DISCORD}" target="_blank" rel="noopener"><svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="${DISCORD_PATH}"/></svg> Discord</a>
      <a class="site-nav__cta" href="${href(CONFIGURATOR.href)}"${mark('configurator')}>${QUAD_ICON}${label(CONFIGURATOR.label)}</a>${languageMenu(prefix, current, options, label)}
    </nav>`;
}

export const NAV_PATTERN = /^[ \t]*<nav class="site-nav"[\s\S]*?<\/nav>/m;

export const CURSEFORGE = 'https://www.curseforge.com/minecraft/mc-mods/propwash-fpv';
export const MODRINTH = 'https://modrinth.com/mod/propwash-fpv';
export const SOURCE = 'https://github.com/LardTom/propwash-fpv';

/** The link line of the footer (same page keys and options as siteNav). */
export function siteFooterLinks(prefix, current, options = {}) {
  const label = labeller(options.tr || null);
  const local = (h, key) => (current === key ? './' : `${prefix}${h}`);
  const ext = 'target="_blank" rel="noopener"';
  return [
    `<a href="${DISCORD}" ${ext}><svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="${DISCORD_PATH}"/></svg> Discord</a>`,
    `<a href="${CURSEFORGE}" ${ext}>CurseForge</a>`,
    `<a href="${MODRINTH}" ${ext}>Modrinth</a>`,
    `<a href="${local('configurator/', 'configurator')}">${label(CONFIGURATOR.label)}</a>`,
    `<a href="${local('docs/', 'docs')}">${label({ en: 'Docs', de: 'Doku' })}</a>`,
    `<a href="${local('changelog/', 'changelog')}">${label({ en: 'Changelog', de: 'Changelog' })}</a>`,
    `<a href="${local('roadmap/', 'roadmap')}">${label({ en: 'Roadmap', de: 'Roadmap' })}</a>`,
    `<a href="${SOURCE}" ${ext}>${label({ en: 'Source code', de: 'Quellcode' })}</a>`,
    `<a href="${local('brand/', 'brand')}">${label({ en: 'Brand kit', de: 'Presse &amp; Brand' })}</a>`,
    `<a href="${local('impressum/', 'impressum')}">${label({ en: 'Legal notice', de: 'Impressum' })}</a>`,
    `<a href="${local('datenschutz/', 'datenschutz')}">${label({ en: 'Privacy policy', de: 'Datenschutz' })}</a>`,
  ].join(' · ').replace(/^/, '<p class="site-footer__links">') + '</p>';
}

export const FOOTER_PATTERN = /<p class="site-footer__links">[\s\S]*?<\/p>/;

// The head script of the English/German pages: language from ?lang=en|de (links from the other languages; kept and
// removed from the address), else the stored choice, else the browser language; the motion switch.
export const HEAD_SCRIPT = `<script data-pw-head>
(function () {
  var d = document.documentElement, lang = null, q = /[?&]lang=(en|de)(?:&|$)/.exec(location.search);
  d.className = d.className.replace('no-js', 'js');
  try {
    if (q) localStorage.setItem('propwash-lang', q[1]);
    lang = localStorage.getItem('propwash-lang');
    if (localStorage.getItem('propwash-motion') === 'paused') d.className += ' motion-paused';
  } catch (e) {}
  if (q) {
    lang = q[1];
    try {
      var s = location.search.slice(1).split('&').filter(function (p) { return p && !/^lang=/.test(p); }).join('&');
      history.replaceState(history.state, '', location.pathname + (s ? '?' + s : '') + location.hash);
    } catch (e) {}
  }
  if (lang !== 'en' && lang !== 'de') {
    var langs = navigator.languages || [navigator.language || 'en'];
    lang = String(langs[0] || 'en').toLowerCase().indexOf('de') === 0 ? 'de' : 'en';
  }
  d.lang = lang;
})();
</script>`;

// The head script of the pages of the other languages (their language is fixed).
export const TREE_HEAD_SCRIPT = `<script data-pw-head>
(function () {
  var d = document.documentElement;
  d.className = d.className.replace('no-js', 'js');
  try {
    if (localStorage.getItem('propwash-motion') === 'paused') d.className += ' motion-paused';
  } catch (e) {}
})();
</script>`;

// The head block siteHead writes: an optional pw-root line, hreflang alternates and i18n.css, then the head script
// (also the plain <script> of pages from before the language support).
export const HEAD_PATTERN = /(?:<meta name="pw-root" content="[^"]*">\n)?(?:<link rel="alternate" hreflang="[^"]*" href="[^"]*">\n)*(?:<link rel="stylesheet" href="[^"]*assets\/css\/i18n\.css(?:\?v=[0-9a-f]{8})?">\n)?<script(?: data-pw-head)?>\n\(function \(\) \{\n  var d = document\.documentElement[\s\S]*?<\/script>/;

/**
 * The head block of an English/German page.
 * @param {string} prefix  path from the page to the site root
 * @param {string|null} pagePath  the page's path below the root ('' for the landing page)
 * @param {object} [options]  languages: the other languages (default: the active ones)
 */
export function siteHead(prefix, pagePath, options = {}) {
  const languages = options.languages ?? activeLanguages();
  const lines = [`<meta name="pw-root" content="${prefix || './'}">`];
  if (languages.length && pagePath !== null && translatedPaths().includes(pagePath)) lines.push(...alternateLinks(pagePath, languages));
  if (languages.length) lines.push(`<link rel="stylesheet" href="${prefix}assets/css/i18n.css">`);
  lines.push(HEAD_SCRIPT);
  return lines.join('\n');
}
