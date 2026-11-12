// Which link preview (og:image) a page gets, and the tags that point to it (owner finding OF-7). Shared by
// tools/build-og-images.mjs (pictures and the hand-written pages), tools/docs/html.mjs (docs pages) and
// tools/test-links.mjs. The texts on the pictures are English; the alt texts are translated like every meta text.

export const SITE = 'https://propwashfpv.com/';
export const OG_SIZE = { width: 1200, height: 630 };

export const OG_VARIANTS = [
  { id: 'default', file: 'og-image.jpg', kind: null, title: 'Real FPV drone racing in Minecraft',
    alt: 'Propwash FPV: logo and wordmark over the community spawn at dusk, with the line “Real FPV drone racing in Minecraft”' },
  { id: 'docs', file: 'og-docs.jpg', kind: 'DOCS', title: 'Player guide, world rules and add-on API',
    alt: 'Propwash FPV docs: logo and wordmark over the community spawn at dusk, with the line “Player guide, world rules and add-on API”' },
  { id: 'addons', file: 'og-addons.jpg', kind: 'ADD-ONS', title: 'Just More Parts, Camera Drones and Mob Defense',
    alt: 'Propwash FPV add-ons: logo and wordmark over the community spawn at dusk, with the line “Just More Parts, Camera Drones and Mob Defense”' },
  { id: 'configurator', file: 'og-configurator.jpg', kind: 'CONFIGURATOR', title: 'Build your drone in the browser',
    alt: 'Propwash FPV configurator: logo and wordmark over the community spawn at dusk, with the line “Build your drone in the browser”' },
  { id: 'sim', file: 'og-sim.jpg', kind: 'FPV SIMULATOR', title: 'Fly your drone in the browser',
    alt: 'Propwash FPV simulator: logo and wordmark over the community spawn at dusk, with the line “Fly your drone in the browser”' },
  { id: 'changelog', file: 'og-changelog.jpg', kind: 'CHANGELOG', title: 'Every release, point by point',
    alt: 'Propwash FPV changelog: logo and wordmark over the community spawn at dusk, with the line “Every release, point by point”' },
];

const LANG_DIR = /^(?:es|fr|pt-br|pl|ru)\//;

/** The variant of a page, by its file or address below the site root (docs/guide/index.html, addons/, …). */
export function ogFor(page) {
  const p = String(page).replace(/^\/+/, '').replace(LANG_DIR, '').replace(/index\.html$/, '');
  const id = p.startsWith('docs/') ? 'docs'
    : p.startsWith('addons/') ? 'addons'
      : p.startsWith('configurator/') ? 'configurator'
        : p.startsWith('sim/') ? 'sim'
          : p.startsWith('changelog/') ? 'changelog'
            : 'default';
  return OG_VARIANTS.find((v) => v.id === id);
}

const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The tags after og:description: the picture with type, size and description, and the twitter card with the same
 * title, description and picture. title and description are given as they stand in the page (raw: already escaped).
 */
export function ogTags(variant, { title, description, raw = false }) {
  const t = raw ? title : attr(title);
  const d = raw ? description : attr(description);
  const url = `${SITE}assets/img/${variant.file}`;
  return [
    `<meta property="og:image" content="${url}">`,
    '<meta property="og:image:type" content="image/jpeg">',
    `<meta property="og:image:width" content="${OG_SIZE.width}">`,
    `<meta property="og:image:height" content="${OG_SIZE.height}">`,
    `<meta property="og:image:alt" content="${attr(variant.alt)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${t}">`,
    `<meta name="twitter:description" content="${d}">`,
    `<meta name="twitter:image" content="${url}">`,
    `<meta name="twitter:image:alt" content="${attr(variant.alt)}">`,
  ].join('\n') + '\n';
}
