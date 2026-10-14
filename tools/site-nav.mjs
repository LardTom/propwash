// The main navigation of every page (the <nav class="site-nav"> in the header) and the link line of the footer,
// defined once.
//
// Hand-written pages get both from tools/build-nav.mjs, the docs pages from tools/docs/html.mjs; tools/test-nav.mjs
// checks that every page carries the current version. Structure: a "Features" menu with the sections of the landing
// page, then Docs, Changelog, Roadmap and Download, Discord (only in the small-screen menu) and the configurator as
// the highlighted button at the end.

export const DISCORD = 'https://discord.gg/bNhkSXYSgZ';
export const DISCORD_PATH = 'M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z';

// Sections of the landing page, in page order. Every href is an id in index.html (tools/test-nav.mjs checks it).
export const FEATURES = [
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
  { href: 'changelog/', label: { en: 'Changelog', de: 'Changelog' }, current: 'changelog' },
  { href: 'roadmap/', label: { en: 'Roadmap', de: 'Roadmap' }, current: 'roadmap' },
  { href: '#download', label: { en: 'Download', de: 'Download' } },
];

export const CONFIGURATOR = { href: 'configurator/', label: { en: 'Configurator', de: 'Konfigurator' } };

// The four-rotor mark of the configurator button (also used by the hero and the teaser on the landing page).
export const QUAD_ICON = '<svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" class="quad-icon"><path d="M6.2 6.2l7.6 7.6M13.8 6.2l-7.6 7.6"/><circle cx="5" cy="5" r="3"/><circle cx="15" cy="5" r="3"/><circle cx="5" cy="15" r="3"/><circle cx="15" cy="15" r="3"/><rect x="8" y="8" width="4" height="4" rx="1"/></svg>';

const CHEVRON = '<svg class="nav-group__chev" aria-hidden="true" viewBox="0 0 12 12" width="12" height="12"><path d="M2.5 4.5 6 8l3.5-3.5"/></svg>';

const label = (t) => (t.en === t.de ? t.en : `<span lang="en">${t.en}</span><span lang="de">${t.de}</span>`);

/**
 * The navigation for a page.
 * @param {string} prefix  path from the page to the site root ('' for index.html, '../' one level down, …)
 * @param {string|null} current  'home', 'configurator', 'docs', 'docs-sub' (a page below docs/), 'changelog',
 *   'roadmap', 'impressum' or 'datenschutz'
 */
export function siteNav(prefix, current) {
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
  return `    <nav class="site-nav" id="site-nav" aria-label="Main" data-de-aria-label="Hauptmenü">
      <div class="nav-group" data-nav-group>
        <button type="button" class="nav-group__toggle" aria-expanded="false" aria-controls="nav-features" data-nav-group-toggle>${label({ en: 'Features', de: 'Funktionen' })}${CHEVRON}</button>
        <ul class="nav-group__panel" id="nav-features">
${features}
        </ul>
      </div>
${links}
      <a class="site-nav__social" href="${DISCORD}" target="_blank" rel="noopener"><svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="${DISCORD_PATH}"/></svg> Discord</a>
      <a class="site-nav__cta" href="${href(CONFIGURATOR.href)}"${mark('configurator')}>${QUAD_ICON}${label(CONFIGURATOR.label)}</a>
    </nav>`;
}

export const NAV_PATTERN = /^[ \t]*<nav class="site-nav"[\s\S]*?<\/nav>/m;

export const CURSEFORGE = 'https://www.curseforge.com/minecraft/mc-mods/propwash-fpv';
export const MODRINTH = 'https://modrinth.com/mod/propwash-fpv';
export const SOURCE = 'https://github.com/LardTom/propwash-fpv';

/** The link line of the footer (same page keys as siteNav). */
export function siteFooterLinks(prefix, current) {
  const local = (h, key) => (current === key ? './' : `${prefix}${h}`);
  const ext = 'target="_blank" rel="noopener"';
  return [
    `<a href="${DISCORD}" ${ext}><svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="${DISCORD_PATH}"/></svg> Discord</a>`,
    `<a href="${CURSEFORGE}" ${ext}>CurseForge</a>`,
    `<a href="${MODRINTH}" ${ext}>Modrinth</a>`,
    `<a href="${local('configurator/', 'configurator')}">${label(CONFIGURATOR.label)}</a>`,
    `<a href="${local('docs/', 'docs')}">${label({ en: 'Docs', de: 'Doku' })}</a>`,
    `<a href="${local('changelog/', 'changelog')}">Changelog</a>`,
    `<a href="${local('roadmap/', 'roadmap')}">Roadmap</a>`,
    `<a href="${SOURCE}" ${ext}>${label({ en: 'Source code', de: 'Quellcode' })}</a>`,
    `<a href="${local('impressum/', 'impressum')}">${label({ en: 'Legal notice', de: 'Impressum' })}</a>`,
    `<a href="${local('datenschutz/', 'datenschutz')}">${label({ en: 'Privacy policy', de: 'Datenschutz' })}</a>`,
  ].join(' · ').replace(/^/, '<p class="site-footer__links">') + '</p>';
}

export const FOOTER_PATTERN = /<p class="site-footer__links">[\s\S]*?<\/p>/;
