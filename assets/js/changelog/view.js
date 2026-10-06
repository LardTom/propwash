// Changelog page (changelog/index.html): renders assets/data/changelog.json – a filter (all / one product), a version
// list with anchors, and one card per release with highlights and the sections New, Improved, Fixed, Compatibility and
// Known issues. Every text is written in both languages (lang="en"/"de" spans), so the site's language switch works
// without re-rendering. Texts go in via textContent only; the entries' inline Markdown is turned into elements.

import { loadChangelog, validateChangelog, parseInline, tally, KINDS } from './data.js';

const doc = document;
const SVG_NS = 'http://www.w3.org/2000/svg';
const SITE = 'https://propwashfpv.com/';
const wide = window.matchMedia ? window.matchMedia('(min-width: 1000px)') : null;
const reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;

const UI = {
  kinds: {
    highlights: { en: 'Highlights', de: 'Highlights' },
    new: { en: 'New', de: 'Neu' },
    improved: { en: 'Improved', de: 'Verbessert' },
    fixed: { en: 'Fixed', de: 'Behoben' },
    compatibility: { en: 'Compatibility', de: 'Kompatibilität' },
    'known-issues': { en: 'Known issues', de: 'Bekannte Probleme' }
  },
  icons: {
    highlights: 'spark',
    new: 'plus',
    improved: 'up',
    fixed: 'bug',
    compatibility: 'port',
    'known-issues': 'alert'
  },
  productIcon: { propwash: 'prop', jmp: 'puzzle' },
  all: { en: 'All', de: 'Alle' },
  show: { en: 'Show', de: 'Anzeigen' },
  versions: { en: 'Versions', de: 'Versionen' },
  latest: { en: 'Latest', de: 'Neueste' },
  latestPanel: { en: 'Latest releases', de: 'Neueste Versionen' },
  read: { en: 'Read the notes', de: 'Zu den Änderungen' },
  copy: { en: 'Copy link', de: 'Link kopieren' },
  copied: { en: 'Copied', de: 'Kopiert' },
  copyLabel: { en: (name) => `Copy link to ${name}`, de: (name) => `Link zu ${name} kopieren` },
  copiedLive: { en: (name) => `Link to ${name} copied`, de: (name) => `Link zu ${name} kopiert` },
  copyFailed: { en: 'The link is in the address bar now', de: 'Der Link steht jetzt in der Adresszeile' },
  releases: { en: (n) => `${n} ${n === 1 ? 'release' : 'releases'}`, de: (n) => `${n} ${n === 1 ? 'Version' : 'Versionen'}` },
  showing: {
    en: (n, what) => `Showing ${n} ${n === 1 ? 'release' : 'releases'} of ${what}`,
    de: (n, what) => `${n} ${n === 1 ? 'Version' : 'Versionen'} von ${what}`
  },
  everything: { en: 'all products', de: 'allen Produkten' },
  tally: {
    releases: { en: 'releases', de: 'Versionen' },
    new: { en: 'new', de: 'neu' },
    improved: { en: 'improved', de: 'verbessert' },
    fixed: { en: 'fixed', de: 'behoben' }
  },
  failed: {
    en: 'The changelog couldn’t be loaded. Reload the page, or ask on the Discord what changed.',
    de: 'Der Changelog konnte nicht geladen werden. Lade die Seite neu oder frag auf dem Discord, was sich geändert hat.'
  }
};

function el(tag, attrs, ...children) {
  const node = doc.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : doc.createTextNode(String(child)));
  }
  return node;
}

function icon(name, size = 16, cls = '') {
  const s = doc.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({ class: `ri ${cls}`.trim(), width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false' })) {
    s.setAttribute(k, String(v));
  }
  const use = doc.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#ri-${name}`);
  s.append(use);
  return s;
}

function bi(text) {
  const frag = doc.createDocumentFragment();
  frag.append(el('span', { lang: 'en' }, text?.en ?? ''), el('span', { lang: 'de' }, text?.de ?? ''));
  return frag;
}

function biFn(fn, ...args) {
  return { en: fn.en(...args), de: fn.de(...args) };
}

/** Links to propwashfpv.com stay on this copy of the site (also on the fallback address and in a local preview). */
function localHref(href) {
  if (href.startsWith(SITE)) return `../${href.slice(SITE.length)}`;
  return href;
}

function inline(nodes) {
  return nodes.map((n) => {
    switch (n.t) {
      case 'text': return doc.createTextNode(n.v);
      case 'code': return el('code', null, n.v);
      case 'strong': return el('strong', null, inline(n.c));
      case 'em': return el('em', null, inline(n.c));
      case 'link': {
        const href = localHref(n.href);
        const external = /^https:/.test(href);
        return el('a', { href, target: external ? '_blank' : null, rel: external ? 'noopener' : null }, inline(n.c));
      }
      default: return doc.createTextNode('');
    }
  });
}

/** One entry in both languages; without a German text the English one stands in (marked as English). */
function entry(item) {
  const en = el('span', { lang: 'en' }, inline(parseInline(item.en).nodes));
  const de = item.de
    ? el('span', { lang: 'de' }, inline(parseInline(item.de).nodes))
    : el('span', { lang: 'de' }, el('span', { lang: 'en', class: 'keep' }, inline(parseInline(item.en).nodes)));
  return [en, de];
}

function releaseName(product, release) {
  return `${product.name} ${release.version}`;
}

/* ---------- Release cards ---------- */

/** A highlight starts with its name in bold ("**Flight training:** …"); on the card the name is the title. */
function highlightNodes(text) {
  const nodes = parseInline(text).nodes;
  const first = nodes[0];
  if (first?.t !== 'strong') return inline(nodes);
  const lead = first.c.map((n, i) => (i === first.c.length - 1 && n.t === 'text' ? { ...n, v: n.v.replace(/:\s*$/, '') } : n));
  const rest = nodes.slice(1);
  if (rest[0]?.t === 'text') {
    const v = rest[0].v.replace(/^\s+/, '');
    rest[0] = { ...rest[0], v: v.charAt(0).toLocaleUpperCase() + v.slice(1) };
  }
  return [el('strong', { class: 'cl-highlight__lead' }, inline(lead)), ...inline(rest)];
}

function highlightEntry(item) {
  const en = el('span', { lang: 'en' }, highlightNodes(item.en));
  const de = item.de
    ? el('span', { lang: 'de' }, highlightNodes(item.de))
    : el('span', { lang: 'de' }, el('span', { lang: 'en', class: 'keep' }, highlightNodes(item.en)));
  return [en, de];
}

function highlights(section) {
  return el('div', { class: 'cl-section cl-section--highlights' },
    el('h4', { class: 'sr-only' }, bi(UI.kinds.highlights)),
    el('ul', { class: 'cl-highlights', role: 'list', 'data-count': section.items.length },
      section.items.map((item) => el('li', { class: 'cl-highlight' }, icon('spark', 16, 'cl-highlight__icon'), el('p', null, highlightEntry(item))))));
}

function section(sectionData, headingId) {
  return el('div', { class: `cl-section cl-section--${sectionData.kind}` },
    el('h4', { class: 'cl-section__title', id: headingId },
      el('span', { class: 'cl-section__icon' }, icon(UI.icons[sectionData.kind], 14)),
      el('span', { class: 'cl-section__name' }, bi(UI.kinds[sectionData.kind])),
      el('span', { class: 'cl-section__count' }, String(sectionData.items.length))),
    el('ul', { class: 'cl-list', role: 'list' }, sectionData.items.map((item) => el('li', null, entry(item)))));
}

function copyButton(product, release) {
  const name = releaseName(product, release);
  const label = biFn(UI.copyLabel, name);
  return el('button', {
    type: 'button',
    class: 'cl-copy',
    'data-copy-link': release.id,
    'data-name': name,
    'aria-label': label.en,
    'data-de-aria-label': label.de
  },
  icon('link', 15, 'cl-copy__icon'), icon('check', 15, 'cl-copy__done'),
  el('span', { class: 'cl-copy__text', 'aria-hidden': 'true' }, bi(UI.copy)),
  el('span', { class: 'cl-copy__text cl-copy__text--done', 'aria-hidden': 'true' }, bi(UI.copied)));
}

function releaseCard(product, release, index) {
  const titleId = `${release.id}-title`;
  const highlight = release.sections.find((s) => s.kind === 'highlights');
  const rest = release.sections.filter((s) => s.kind !== 'highlights');
  return el('article', { class: `cl-release cl-release--${product.id}`, id: release.id, 'aria-labelledby': titleId, 'data-product': product.id },
    el('header', { class: 'cl-release__head' },
      el('div', { class: 'cl-release__name' },
        el('p', { class: 'cl-release__brand', 'aria-hidden': 'true' }, product.name),
        el('div', { class: 'cl-release__line' },
          el('h3', { class: 'cl-release__heading', id: titleId },
            el('span', { class: 'sr-only' }, `${product.name} `),
            el('a', { class: 'cl-release__version', href: `#${release.id}` }, release.version)),
          index === 0 ? el('span', { class: 'cl-chip' }, bi(UI.latest)) : null),
        el('p', { class: 'cl-release__title' }, bi(release.title))),
      copyButton(product, release)),
    highlight ? highlights(highlight) : null,
    rest.length ? el('div', { class: 'cl-sections' }, rest.map((s) => section(s, `${release.id}-${s.kind}`))) : null);
}

function productSection(product) {
  const titleId = `${product.id}-title`;
  return el('section', { class: `cl-product cl-product--${product.id}`, id: product.id, 'aria-labelledby': titleId, 'data-product': product.id },
    el('header', { class: 'cl-product__head' },
      el('span', { class: 'cl-product__badge', 'aria-hidden': 'true' }, icon(UI.productIcon[product.id] || 'list', 22)),
      el('div', { class: 'cl-product__words' },
        el('h2', { class: 'cl-product__name', id: titleId }, product.name),
        el('p', { class: 'cl-product__meta' }, bi(product.tagline), el('span', { class: 'cl-product__sep', 'aria-hidden': 'true' }, ' · '), bi(biFn(UI.releases, product.releases.length))))),
    product.releases.map((r, i) => releaseCard(product, r, i)));
}

/* ---------- Side: filter and version list ---------- */

function filterBar(products) {
  const options = [{ id: 'all', label: UI.all }, ...products.map((p) => ({ id: p.id, label: { en: p.short, de: p.short } }))];
  return el('div', { class: 'cl-filter', role: 'group', 'aria-label': UI.show.en, 'data-de-aria-label': UI.show.de, 'data-cl-filter': true },
    options.map((o) => el('button', { type: 'button', class: `cl-filter__btn cl-filter__btn--${o.id}`, 'data-filter': o.id, 'aria-pressed': o.id === 'all' ? 'true' : 'false' }, bi(o.label))));
}

function toc(products) {
  const total = products.reduce((n, p) => n + p.releases.length, 0);
  const groups = products.map((p) => el('div', { class: `cl-toc__group cl-toc__group--${p.id}`, 'data-product': p.id },
    el('p', { class: 'cl-toc__product' }, el('a', { href: `#${p.id}` }, p.name)),
    el('ol', { class: 'cl-toc__list', role: 'list' },
      p.releases.map((r) => el('li', null,
        el('a', { href: `#${r.id}`, 'data-toc': r.id },
          el('span', { class: 'cl-toc__version' }, r.version),
          el('span', { class: 'cl-toc__title' }, bi(r.title))))))));
  return el('nav', { class: 'cl-toc', 'aria-label': UI.versions.en, 'data-de-aria-label': UI.versions.de },
    el('details', { class: 'cl-toc__fold', 'data-cl-fold': true },
      el('summary', { class: 'cl-toc__summary' },
        icon('list', 16), el('span', null, bi(UI.versions)), el('span', { class: 'cl-toc__total' }, String(total)), icon('chevron', 14, 'cl-toc__chevron')),
      el('div', { class: 'cl-toc__body' }, groups)));
}

/* ---------- Hero ---------- */

function renderTally(releases, host) {
  const count = tally(releases);
  const items = [
    ['releases', count.releases],
    ['new', count.new],
    ['improved', count.improved],
    ['fixed', count.fixed]
  ];
  host.replaceChildren(...items.map(([key, n]) => el('li', { class: `cl-tally__item cl-tally__item--${key}` },
    el('span', { class: 'cl-tally__num' }, String(n)),
    el('span', { class: 'cl-tally__label' }, bi(UI.tally[key])))));
  host.hidden = false;
}

function renderLatest(products, host) {
  host.replaceChildren(
    el('div', { class: 'cl-latest__rim', 'aria-hidden': 'true' }, el('span', { class: 'cl-latest__live' }, el('i'), bi(UI.latestPanel)), el('span', { class: 'cl-latest__ch' }, 'PROPWASH')),
    el('ul', { class: 'cl-latest__list', role: 'list' },
      products.map((p) => {
        const r = p.releases[0];
        return el('li', { class: `cl-latest__item cl-latest__item--${p.id}` },
          el('p', { class: 'cl-latest__product' }, p.name),
          el('p', { class: 'cl-latest__version' }, r.version),
          el('p', { class: 'cl-latest__title' }, bi(r.title)),
          el('a', { class: 'cl-latest__link', href: `#${r.id}` }, bi(UI.read), el('span', { class: 'sr-only' }, ` – ${releaseName(p, r)}`), icon('arrow-down', 14)));
      })),
    el('span', { class: 'cl-latest__corners', 'aria-hidden': 'true' }));
  host.hidden = false;
}

/* ---------- Behaviour ---------- */

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject) => {
    const area = el('textarea', { readonly: true, style: 'position:fixed;opacity:0' });
    area.value = text;
    doc.body.append(area);
    area.select();
    try {
      if (doc.execCommand('copy')) resolve();
      else reject(new Error('copy'));
    } catch (e) {
      reject(e);
    }
    area.remove();
  });
}

function announce(live, text) {
  live.replaceChildren(bi(text));
}

function setup(data, root) {
  const products = data.products;
  const all = products.flatMap((p) => p.releases);
  const live = el('p', { class: 'sr-only', 'aria-live': 'polite', 'data-cl-live': true });
  const filter = filterBar(products);
  const nav = toc(products);
  const feed = el('div', { class: 'cl-feed' }, live, products.map(productSection));
  const layout = el('div', { class: 'wrap cl-layout' }, el('aside', { class: 'cl-side' }, filter, nav), feed);
  root.replaceChildren(layout);
  root.classList.add('is-ready');

  const tallyHost = doc.querySelector('[data-cl-tally]');
  const latestHost = doc.querySelector('[data-cl-latest]');
  if (tallyHost) renderTally(all, tallyHost);
  if (latestHost) renderLatest(products, latestHost);

  let current = 'all';
  function applyFilter(id, quiet) {
    current = id;
    for (const btn of filter.querySelectorAll('[data-filter]')) btn.setAttribute('aria-pressed', String(btn.dataset.filter === id));
    for (const node of root.querySelectorAll('[data-product]')) {
      if (node.classList.contains('cl-release')) continue;
      node.hidden = id !== 'all' && node.dataset.product !== id;
    }
    const shown = id === 'all' ? all : products.find((p) => p.id === id).releases;
    if (tallyHost) renderTally(shown, tallyHost);
    requestMark();
    if (!quiet) {
      const what = id === 'all' ? UI.everything : { en: products.find((p) => p.id === id).name, de: products.find((p) => p.id === id).name };
      announce(live, { en: UI.showing.en(shown.length, what.en), de: UI.showing.de(shown.length, what.de) });
    }
  }
  filter.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filter]');
    if (btn) applyFilter(btn.dataset.filter, false);
  });

  // Version list: open beside the releases on wide screens, folded above them on narrow ones.
  const fold = nav.querySelector('[data-cl-fold]');
  function syncFold() { fold.open = !wide || wide.matches; }
  syncFold();
  if (wide && wide.addEventListener) wide.addEventListener('change', syncFold);
  nav.addEventListener('click', (e) => {
    if (e.target.closest('a') && wide && !wide.matches) fold.open = false;
  });

  // Copy link per release.
  feed.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-copy-link]');
    if (!btn) return;
    const id = btn.dataset.copyLink;
    const url = `${location.origin}${location.pathname}#${id}`;
    copyText(url).then(() => {
      btn.classList.add('is-done');
      announce(live, biFn(UI.copiedLive, btn.dataset.name));
      window.setTimeout(() => btn.classList.remove('is-done'), 1600);
    }, () => {
      history.replaceState(null, '', `#${id}`);
      announce(live, UI.copyFailed);
    });
  });

  // Current release in the version list: the last one whose top has passed the line below the header.
  const links = new Map([...nav.querySelectorAll('[data-toc]')].map((a) => [a.dataset.toc, a]));
  const articles = [...feed.querySelectorAll('.cl-release')];
  let ticking = false;
  function markCurrent() {
    ticking = false;
    const line = (parseFloat(getComputedStyle(doc.documentElement).scrollPaddingTop) || 80) + 40;
    let active = null;
    for (const article of articles) {
      if (article.offsetParent === null) continue;
      if (article.getBoundingClientRect().top <= line) active = article.id;
      else break;
    }
    if (!active) active = articles.find((a) => a.offsetParent !== null)?.id;
    for (const [id, a] of links) {
      a.classList.toggle('is-active', id === active);
      if (id === active) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    }
  }
  function requestMark() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(markCurrent);
  }
  window.addEventListener('scroll', requestMark, { passive: true });
  window.addEventListener('resize', requestMark, { passive: true });
  markCurrent();

  // Deep links (#propwash-0.4.0, #jmp-1.0.0, #jmp): show the product and scroll there.
  function goToHash(smooth) {
    const id = decodeURIComponent(location.hash.slice(1));
    const target = id && doc.getElementById(id);
    if (!target || !root.contains(target)) return;
    const product = target.closest('[data-product]')?.dataset.product;
    if (current !== 'all' && product && product !== current) applyFilter('all', true);
    for (const old of root.querySelectorAll('.cl-release.is-target')) old.classList.remove('is-target');
    if (target.classList.contains('cl-release')) target.classList.add('is-target');
    target.scrollIntoView({ behavior: smooth && !reduceMotion ? 'smooth' : 'auto', block: 'start' });
  }
  window.addEventListener('hashchange', () => goToHash(true));
  goToHash(false);
}

async function main() {
  const root = doc.querySelector('[data-cl-root]');
  const status = doc.querySelector('[data-cl-status]');
  if (!root) return;
  root.setAttribute('aria-busy', 'true');
  try {
    const data = await loadChangelog();
    const problems = validateChangelog(data);
    if (problems.length) console.warn('changelog.json:', problems);
    setup(data, root);
    // main.js translated the static attributes before this module ran; translate the new ones too.
    if (doc.documentElement.lang === 'de') {
      for (const node of root.querySelectorAll('[data-de-aria-label]')) {
        node.setAttribute('data-en-aria-label', node.getAttribute('aria-label') || '');
        node.setAttribute('aria-label', node.getAttribute('data-de-aria-label'));
      }
    }
  } catch (e) {
    console.error(e);
    if (status) {
      status.replaceChildren(bi(UI.failed));
      status.classList.add('is-error');
    }
  } finally {
    root.removeAttribute('aria-busy');
  }
}

main();
