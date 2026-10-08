// HTML building blocks of the docs pages: the page frame (same header, language switch and footer as the rest of the
// site), the docs menu, bilingual text helpers, tables and highlighted code blocks.

export const DISCORD = 'https://discord.gg/bNhkSXYSgZ';
export const CURSEFORGE = 'https://www.curseforge.com/minecraft/mc-mods/propwash-fpv';
export const MODRINTH = 'https://modrinth.com/mod/propwash-fpv';

export const PAGES = [
  { path: 'docs/', id: 'overview', title: { en: 'Overview', de: 'Übersicht' } },
  { path: 'docs/guide/', id: 'guide', title: { en: 'Player guide', de: 'Spielerhandbuch' } },
  { path: 'docs/blackbox/', id: 'blackbox', title: { en: 'Blackbox tuning', de: 'Tuning mit der Blackbox' } },
  { path: 'docs/gamerules/', id: 'gamerules', title: { en: 'World rules', de: 'Welt-Regeln' } },
  { path: 'docs/api/', id: 'api', title: { en: 'Add-on API', de: 'Add-on-API' } },
  { path: 'docs/api/reference/', id: 'reference', title: { en: 'API reference', de: 'API-Referenz' } },
  { path: 'docs/parts-format/', id: 'parts-format', title: { en: 'Parts format (JSON)', de: 'Teile-Format (JSON)' } },
];

export function esc(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function check(en, de, where) {
  if (typeof en !== 'string' || typeof de !== 'string' || !en.trim() || !de.trim()) {
    throw new Error(`Text fehlt in einer Sprache: ${where || JSON.stringify([en, de]).slice(0, 120)}`);
  }
}

export function L(en, de) {
  if (en && typeof en === 'object') return L(en.en, en.de);
  check(en, de);
  if (en === de) return en;
  return `<span lang="en">${en}</span><span lang="de">${de}</span>`;
}

export function P(en, de, cls) {
  if (en && typeof en === 'object' && !Array.isArray(en)) return P(en.en, en.de, de);
  check(en, de);
  const c = cls ? ` class="${cls}"` : '';
  return `<p lang="en"${c}>${en}</p>\n<p lang="de"${c}>${de}</p>`;
}

export function block(tag, en, de, cls) {
  check(en, de);
  const c = cls ? ` class="${cls}"` : '';
  return `<${tag} lang="en"${c}>${en}</${tag}>\n<${tag} lang="de"${c}>${de}</${tag}>`;
}

export function list(items, ordered = false, cls) {
  const tag = ordered ? 'ol' : 'ul';
  const c = cls ? ` class="${cls}"` : '';
  return `<${tag}${c}>\n${items.map((it) => `<li>${Array.isArray(it) ? L(it[0], it[1]) : L(it)}</li>`).join('\n')}\n</${tag}>`;
}

export function note(en, de, kind = 'info') {
  check(en, de);
  return `<div class="docs-note docs-note--${kind}">${P(en, de)}</div>`;
}

export function h2(id, en, de) {
  return `<h2 id="${id}" class="docs-h2"><a class="docs-anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${L(en, de)}</h2>`;
}

export function h3(id, en, de) {
  return `<h3 id="${id}" class="docs-h3"><a class="docs-anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${L(en, de)}</h3>`;
}

export function section(id, title, body) {
  return `<section class="docs-section" aria-labelledby="${id}">\n${h2(id, title.en, title.de)}\n${body}\n</section>`;
}

export function table(headers, rows, cls = '') {
  const head = headers.map((h) => `<th scope="col">${Array.isArray(h) ? L(h[0], h[1]) : h}</th>`).join('');
  const body = rows.map((row) => {
    const attrs = row.attrs ? ' ' + row.attrs : '';
    const cells = (row.cells || row).map((c, i) => (i === 0 && row.header !== false ? `<th scope="row">${c}</th>` : `<td>${c}</td>`)).join('');
    return `<tr${attrs}>${cells}</tr>`;
  }).join('\n');
  return `<div class="docs-table-wrap" tabindex="0"><table class="docs-table ${cls}">\n<thead><tr>${head}</tr></thead>\n<tbody>\n${body}\n</tbody>\n</table></div>`;
}

export const mono = (s) => `<code>${esc(s)}</code>`;
export const kbd = (s) => (s ? `<kbd>${esc(s)}</kbd>` : '–');

const JAVA_KEYWORDS = new Set(('abstract boolean break byte case catch char class continue default do double else enum extends final '
  + 'finally float for if implements import instanceof int interface long new package private protected public record return short '
  + 'static super switch this throw throws try var void while true false null sealed permits yield').split(' '));

function highlightJava(src) {
  let out = '';
  const re = /("""[\s\S]*?"""|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(\/\/[^\n]*)|(@[A-Za-z]+)|\b([A-Za-z_][A-Za-z0-9_]*)\b|(\b\d[\d_]*(?:\.\d+)?(?:[eE][-+]?\d+)?[fFdDL]?\b)/g;
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    out += esc(src.slice(last, m.index));
    if (m[1]) out += `<span class="tk-s">${esc(m[1])}</span>`;
    else if (m[2]) out += `<span class="tk-c">${esc(m[2])}</span>`;
    else if (m[3]) out += `<span class="tk-a">${esc(m[3])}</span>`;
    else if (m[4]) out += JAVA_KEYWORDS.has(m[4]) ? `<span class="tk-k">${m[4]}</span>` : /^[A-Z]/.test(m[4]) ? `<span class="tk-t">${m[4]}</span>` : m[4];
    else if (m[5]) out += `<span class="tk-n">${esc(m[5])}</span>`;
    last = re.lastIndex;
  }
  return out + esc(src.slice(last));
}

function highlightJson(src) {
  let out = '';
  const re = /("(?:[^"\\\n]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\b\d+(?:\.\d+)?(?:[eE][-+]?\d+)?\b)/g;
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    out += esc(src.slice(last, m.index));
    if (m[1]) out += m[2] ? `<span class="tk-p">${esc(m[1])}</span>${esc(m[2])}` : `<span class="tk-s">${esc(m[1])}</span>`;
    else if (m[3]) out += `<span class="tk-k">${m[3]}</span>`;
    else if (m[4]) out += `<span class="tk-n">${m[4]}</span>`;
    last = re.lastIndex;
  }
  return out + esc(src.slice(last));
}

function highlightGroovy(src) {
  return highlightJava(src);
}

export function code(src, language, caption) {
  const text = src.replace(/^\n+|\s+$/g, '');
  const body = language === 'java' ? highlightJava(text)
    : language === 'json' ? highlightJson(text)
      : language === 'groovy' ? highlightGroovy(text)
        : esc(text);
  const label = { java: 'Java', json: 'JSON', groovy: 'Gradle', toml: 'TOML', text: 'Text', shell: 'Shell', chat: 'Chat', path: L('Path', 'Pfad') }[language] ?? language;
  const cap = caption ? `<span class="docs-code__caption">${caption}</span>` : '';
  return `<figure class="docs-code" data-code>\n<figcaption class="docs-code__bar"><span class="docs-code__lang">${label}</span>${cap}`
    + `<button type="button" class="docs-code__copy needs-js" data-copy><span lang="en">Copy</span><span lang="de">Kopieren</span></button></figcaption>\n`
    + `<pre><code>${body}</code></pre>\n</figure>`;
}

export function figure(prefix, img, alt, caption) {
  const src = `${prefix}assets/img/docs/${img.name}-${img.small}.webp`;
  const srcset = `${prefix}assets/img/docs/${img.name}-${img.small}.webp ${img.small}w, ${prefix}assets/img/docs/${img.name}-${img.large}.webp ${img.large}w`;
  const h = Math.round(img.small * img.height / img.width);
  return `<figure class="docs-figure">\n<div class="shot"><img src="${src}" srcset="${srcset}" sizes="(min-width: 1100px) 760px, 100vw" width="${img.small}" height="${h}" loading="lazy" decoding="async" alt="${esc(alt.en)}" data-de-alt="${esc(alt.de)}"></div>\n`
    + (caption ? `<figcaption>${L(caption.en, caption.de)}</figcaption>\n` : '') + '</figure>';
}

export function siteImage(prefix, name, sizes, alt, caption, dims) {
  const [small, large] = sizes;
  const h = Math.round(small * dims[1] / dims[0]);
  return `<figure class="docs-figure">\n<div class="shot"><img src="${prefix}assets/img/${name}-${small}.webp" srcset="${prefix}assets/img/${name}-${small}.webp ${small}w, ${prefix}assets/img/${name}-${large}.webp ${large}w" sizes="(min-width: 1100px) 760px, 100vw" width="${small}" height="${h}" loading="lazy" decoding="async" alt="${esc(alt.en)}" data-de-alt="${esc(alt.de)}"></div>\n`
    + (caption ? `<figcaption>${L(caption.en, caption.de)}</figcaption>\n` : '') + '</figure>';
}

const DISCORD_SYMBOL = '<symbol id="i-discord" viewBox="0 0 24 24"><path fill="currentColor" d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></symbol>';

function docsMenu(prefix, current, toc) {
  const items = PAGES.map((p) => {
    const here = p.id === current;
    const sub = here && toc.length
      ? `\n<ol class="docs-menu__toc">${toc.map((t) => `<li><a href="#${t.id}">${L(t.title.en, t.title.de)}</a></li>`).join('')}</ol>`
      : '';
    return `<li class="docs-menu__item${here ? ' is-current' : ''}${p.id === 'reference' ? ' docs-menu__item--sub' : ''}"><a href="${prefix}${p.path}"${here ? ' aria-current="page"' : ''}>${L(p.title.en, p.title.de)}</a>${sub}</li>`;
  }).join('\n');
  return `<nav class="docs-menu" aria-label="Documentation" data-de-aria-label="Dokumentation">
<details class="docs-menu__fold" data-docs-menu open>
<summary class="docs-menu__summary"><span lang="en">Docs menu</span><span lang="de">Doku-Menü</span></summary>
<ol class="docs-menu__list">
${items}
</ol>
</details>
</nav>`;
}

export function siteNav(prefix, nav) {
  const match = nav.match(/^[ \t]*<nav class="site-nav"[\s\S]*?<\/nav>/m);
  if (!match) throw new Error('index.html: <nav class="site-nav"> nicht gefunden');
  if (!/href="docs\/"/.test(match[0])) throw new Error('index.html: Navigation ohne Link auf docs/');
  return match[0]
    .replace(/href="([^"]*)"/g, (all, href) => (/^(https?:|mailto:)/.test(href) ? all : `href="${prefix}${href}"`))
    .replace(`href="${prefix}docs/"`, `href="${prefix}docs/" aria-current="page"`);
}

export function page({ id, prefix, title, description, kicker, heading, lead, toc, body, meta, nav }) {
  const t = (x) => esc(x);
  return `<!DOCTYPE html>
<html lang="en" class="no-js" data-title-en="${t(title.en)}" data-title-de="${t(title.de)}" data-description-en="${t(description.en)}" data-description-de="${t(description.de)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t(title.en)}</title>
<meta name="description" content="${t(description.en)}">
<meta name="theme-color" content="#1A1A1A">
<meta name="color-scheme" content="dark">
<meta name="referrer" content="no-referrer">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Propwash FPV">
<meta property="og:title" content="${t(title.en)}">
<meta property="og:description" content="${t(description.en)}">
<meta property="og:image" content="https://propwashfpv.com/assets/img/og-image.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://propwashfpv.com/assets/img/og-image.jpg">
<link rel="icon" type="image/png" sizes="32x32" href="${prefix}assets/img/favicon-32.png">
<link rel="apple-touch-icon" href="${prefix}assets/img/apple-touch-icon.png">
<link rel="stylesheet" href="${prefix}assets/css/style.css">
<link rel="stylesheet" href="${prefix}assets/css/docs.css">
<script>
(function () {
  var d = document.documentElement, lang = null;
  d.className = d.className.replace('no-js', 'js');
  try {
    lang = localStorage.getItem('propwash-lang');
    if (localStorage.getItem('propwash-motion') === 'paused') d.className += ' motion-paused';
  } catch (e) {}
  if (lang !== 'en' && lang !== 'de') {
    var langs = navigator.languages || [navigator.language || 'en'];
    lang = String(langs[0] || 'en').toLowerCase().indexOf('de') === 0 ? 'de' : 'en';
  }
  d.lang = lang;
})();
</script>
</head>
<body class="docs-page">
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  ${DISCORD_SYMBOL}
</svg>
<a class="skip" href="#main"><span lang="en">Skip to content</span><span lang="de">Zum Inhalt springen</span></a>

<header class="site-header">
  <div class="wrap site-header__inner">
    <a class="brand" href="${prefix}" aria-label="Propwash FPV – home page" data-de-aria-label="Propwash FPV – Startseite">
      <img src="${prefix}assets/img/logo-96.webp" width="36" height="36" alt="">
      <span class="brand__word">Propwash<span class="brand__fpv">FPV</span></span>
    </a>
${siteNav(prefix, nav)}
    <div class="social">
      <a class="social__link" href="${DISCORD}" target="_blank" rel="noopener" aria-label="Discord" title="Discord"><svg aria-hidden="true" width="20" height="20"><use href="#i-discord"/></svg></a>
    </div>
    <div class="lang-switch needs-js" role="group" aria-label="Language" data-de-aria-label="Sprache">
      <button type="button" data-set-lang="en" aria-pressed="true" lang="en" class="keep">EN</button>
      <button type="button" data-set-lang="de" aria-pressed="false" lang="de" class="keep">DE</button>
    </div>
    <button type="button" class="nav-toggle needs-js" aria-expanded="false" aria-controls="site-nav" aria-label="Menu" data-de-aria-label="Menü" data-nav-toggle>
      <svg aria-hidden="true" viewBox="0 0 20 20" width="20" height="20"><path class="nav-toggle__open" d="M3 5.5h14M3 10h14M3 14.5h14"/><path class="nav-toggle__close" d="M4.5 4.5l11 11m0-11-11 11"/></svg>
    </button>
  </div>
</header>

<main id="main">
  <header class="docs-hero">
    <div class="wrap docs-hero__inner">
      <p class="kicker">${kicker}</p>
      <h1 class="docs-title">${L(heading.en, heading.de)}</h1>
      ${P(lead.en, lead.de, 'docs-lead')}
      <p class="docs-meta">${meta}</p>
    </div>
  </header>
  <div class="wrap docs">
    ${docsMenu(prefix, id, toc)}
    <article class="docs-body">
${body}
    </article>
  </div>
</main>

<footer class="site-footer">
  <div class="wrap site-footer__inner">
    <div class="site-footer__brand">
      <img src="${prefix}assets/img/logo-96.webp" width="40" height="40" alt="" loading="lazy">
      <p><strong>Propwash FPV</strong> by lardtom</p>
      <p class="site-footer__links"><a href="${DISCORD}" target="_blank" rel="noopener"><svg aria-hidden="true" width="14" height="14"><use href="#i-discord"/></svg> Discord</a> · <a href="${CURSEFORGE}" target="_blank" rel="noopener">CurseForge</a> · <a href="${MODRINTH}" target="_blank" rel="noopener">Modrinth</a> · <a href="${prefix}roadmap/">Roadmap</a> · <a href="${prefix}changelog/">Changelog</a></p>
    </div>
    <div class="site-footer__legal">
      <p lang="en" class="keep legal-mc">Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.</p>
      <p lang="de" class="keep legal-mc">Kein offizielles Minecraft-Produkt. Nicht von Mojang oder Microsoft genehmigt oder mit Mojang oder Microsoft verbunden.</p>
      <p class="site-footer__small" lang="en">No cookies, no tracking&nbsp;– only your language choice is kept in your browser. These pages are generated from the Propwash source code of each release. Fonts: <a href="${prefix}assets/fonts/OFL-Saira.txt">Saira</a> and <a href="${prefix}assets/fonts/OFL-JetBrainsMono.txt">JetBrains Mono</a> (SIL Open Font License), served from this site.</p>
      <p class="site-footer__small" lang="de">Keine Cookies, kein Tracking&nbsp;– nur deine Sprachwahl bleibt in deinem Browser. Diese Seiten entstehen bei jeder Version aus dem Quellcode von Propwash. Schriften: <a href="${prefix}assets/fonts/OFL-Saira.txt">Saira</a> und <a href="${prefix}assets/fonts/OFL-JetBrainsMono.txt">JetBrains Mono</a> (SIL Open Font License), direkt von dieser Seite geladen.</p>
    </div>
    <a class="site-footer__top" href="#main"><span lang="en">Back to top</span><span lang="de">Nach oben</span></a>
  </div>
</footer>

<script src="${prefix}assets/js/main.js" defer></script>
<script src="${prefix}assets/js/docs.js" defer></script>
</body>
</html>
`;
}
