// Roadmap page (roadmap/index.html): renders assets/data/roadmap.json into horizon sections, release groups with a
// segmented progress ring, and item cards. Every text is written in both languages (lang="en"/"de" spans), so the
// site's language switch works without re-rendering. Texts go in via textContent only.

import { loadRoadmap, validateRoadmap, tally, allItems, currentRelease, STATUSES } from './data.js';

const doc = document;
const SVG_NS = 'http://www.w3.org/2000/svg';
const reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;

const UI = {
  status: {
    done: { en: 'Done', de: 'Fertig' },
    progress: { en: 'In progress', de: 'In Arbeit' },
    planned: { en: 'Planned', de: 'Geplant' },
    idea: { en: 'Idea', de: 'Idee' }
  },
  statusPlural: {
    done: { en: 'done', de: 'fertig' },
    progress: { en: 'in progress', de: 'in Arbeit' },
    planned: { en: 'planned', de: 'geplant' },
    idea: { en: 'ideas', de: 'Ideen' }
  },
  ringDone: { en: 'done', de: 'fertig' },
  ringOf: { en: (d, t) => `${d} of ${t} done`, de: (d, t) => `${d} von ${t} fertig` },
  ringMore: {
    progress: { en: (n) => `${n} in progress`, de: (n) => `${n} in Arbeit` },
    planned: { en: (n) => `${n} planned`, de: (n) => `${n} geplant` }
  },
  nowLive: { en: 'Now building', de: 'Im Bau' },
  nowJump: { en: 'What’s in it', de: 'Was drin ist' },
  older: { en: 'What was in it', de: 'Was drin war' },
  failed: {
    en: 'The roadmap couldn’t be loaded. Reload the page, or ask on the Discord what’s coming next.',
    de: 'Die Roadmap konnte nicht geladen werden. Lade die Seite neu oder frag auf dem Discord, was als Nächstes kommt.'
  }
};

function el(tag, attrs, ...children) {
  const node = doc.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'style') node.setAttribute('style', value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : doc.createTextNode(String(child)));
  }
  return node;
}

function svg(tag, attrs) {
  const node = doc.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs || {})) node.setAttribute(key, String(value));
  return node;
}

function icon(name, size = 20, cls = '') {
  const s = svg('svg', { class: `ri ${cls}`.trim(), width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false' });
  s.append(svg('use', { href: `#ri-${name}` }));
  return s;
}

/** Both languages of a {en, de} text (or of two functions' results) as lang spans. */
function bi(text) {
  const frag = doc.createDocumentFragment();
  frag.append(el('span', { lang: 'en' }, text?.en ?? ''), el('span', { lang: 'de' }, text?.de ?? ''));
  return frag;
}

function chip(status) {
  const mark = status === 'progress'
    ? el('span', { class: 'rm-chip__dot', 'aria-hidden': 'true' })
    : icon(status === 'done' ? 'check' : status === 'idea' ? 'spark' : 'circle', 12, 'rm-chip__icon');
  return el('span', { class: `rm-chip rm-chip--${status}` }, mark, bi(UI.status[status]));
}

function ringSummary(count) {
  const parts = (lang) => {
    const out = [UI.ringOf[lang](count.done, count.total)];
    for (const key of ['progress', 'planned']) if (count[key]) out.push(UI.ringMore[key][lang](count[key]));
    return out.join(', ');
  };
  return { en: parts('en'), de: parts('de') };
}

/** Segmented ring: one segment per item, ordered done → in progress → planned, so it fills clockwise. */
function ring(items, size) {
  const count = tally(items);
  const order = ['done', 'progress', 'planned', 'idea'];
  const statuses = items.map((i) => i.status).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const n = statuses.length;
  const r = 42;
  const gap = n > 1 ? Math.min(9, 90 / n) : 0;
  const graphic = svg('svg', { class: 'rm-ring__svg', viewBox: '0 0 100 100', width: size, height: size, 'aria-hidden': 'true', focusable: 'false' });
  graphic.append(svg('circle', { class: 'rm-ring__track', cx: 50, cy: 50, r }));
  statuses.forEach((status, i) => {
    let seg;
    if (n === 1) {
      seg = svg('circle', { cx: 50, cy: 50, r, transform: 'rotate(-90 50 50)' });
    } else {
      const a0 = (-90 + (i * 360) / n + gap / 2) * (Math.PI / 180);
      const a1 = (-90 + ((i + 1) * 360) / n - gap / 2) * (Math.PI / 180);
      const large = (360 / n - gap) > 180 ? 1 : 0;
      const p = (a) => `${(50 + r * Math.cos(a)).toFixed(3)} ${(50 + r * Math.sin(a)).toFixed(3)}`;
      seg = svg('path', { d: `M ${p(a0)} A ${r} ${r} 0 ${large} 1 ${p(a1)}` });
    }
    seg.setAttribute('class', `rm-ring__seg rm-ring__seg--${status}`);
    seg.setAttribute('pathLength', '1');
    seg.setAttribute('style', `--i:${i}`);
    graphic.append(seg);
  });
  const center = el('span', { class: 'rm-ring__center', 'aria-hidden': 'true' },
    el('span', { class: 'rm-ring__num' }, String(count.done), el('small', null, `/${count.total}`)),
    el('span', { class: 'rm-ring__label' }, bi(UI.ringDone)));
  const complete = count.total > 0 && count.done === count.total;
  return el('div', { class: `rm-ring${complete ? ' rm-ring--complete' : ''}`, style: `--size:${size}px` },
    graphic, center, el('span', { class: 'sr-only' }, bi(ringSummary(count))));
}

function linkButton(link, cls) {
  const external = /^https:/.test(link.href);
  return el('a', { class: cls, href: link.href, target: external ? '_blank' : null, rel: external ? 'noopener' : null },
    bi(link.label), icon('arrow-right', 14));
}

function card(item, index, headingTag) {
  return el('li', { class: `rm-card rm-card--${item.status} rm-reveal`, style: `--i:${Math.min(index, 8)}`, id: `item-${item.id}` },
    el('div', { class: 'rm-card__top' },
      el('span', { class: 'rm-card__icon' }, icon(item.icon, 22)),
      chip(item.status)),
    el(headingTag, { class: 'rm-card__title' }, bi(item.title)),
    el('p', { class: 'rm-card__text' }, bi(item.text)),
    item.link ? linkButton(item.link, 'rm-card__link') : null);
}

function groupHead(group, headingId) {
  const name = group.version
    ? el('h3', { class: 'rm-group__version', id: headingId }, el('span', { class: 'rm-group__brand' }, 'Propwash '), group.version)
    : el('h3', { class: 'rm-group__version rm-group__version--text', id: headingId }, bi(group.title));
  const showRing = group.items.length >= 2;
  const link = group.link;
  return el('div', { class: 'rm-group__head' },
    el('div', { class: 'rm-group__name' },
      name,
      group.version && group.title ? el('p', { class: 'rm-group__title' }, bi(group.title)) : null),
    showRing || link
      ? el('div', { class: 'rm-group__meta' },
        showRing ? ring(group.items, 64) : null,
        link ? linkButton(link, 'btn btn--ghost rm-group__link') : null)
      : null);
}

function group(groupData, horizon, g) {
  const headed = Boolean(groupData.version || groupData.title);
  const headingId = headed ? `rm-${horizon.id}-${g}` : null;
  const grid = el('ul', { class: 'rm-grid', role: 'list' },
    groupData.items.map((item, i) => card(item, i, headed ? 'h4' : 'h3')));
  const cls = `rm-group${headed ? '' : ' rm-group--plain'}`;
  const span = Math.min(groupData.items.length, 3);
  if (horizon.id === 'released' && g > 0) {
    const count = tally(groupData.items);
    return el('details', { class: `${cls} rm-group--older`, 'data-span': 3 },
      el('summary', { class: 'rm-older' },
        el('span', { class: 'rm-older__version' }, el('span', { class: 'rm-group__brand' }, 'Propwash '), groupData.version || bi(groupData.title)),
        groupData.version && groupData.title ? el('span', { class: 'rm-older__title' }, bi(groupData.title)) : null,
        el('span', { class: 'rm-older__count' }, bi(ringSummary(count))),
        el('span', { class: 'rm-group__more' }, bi(UI.older), icon('chevron', 14))),
      grid,
      groupData.link ? el('div', { class: 'rm-older__foot' }, linkButton(groupData.link, 'btn btn--ghost rm-group__link')) : null);
  }
  return el('article', { class: cls, 'aria-labelledby': headingId, 'data-span': span }, headed ? groupHead(groupData, headingId) : null, grid);
}

function horizonSection(horizon, index) {
  const titleId = `rm-${horizon.id}-title`;
  const tone = index % 2 === 0 ? ' rm-horizon--panel' : '';
  const items = horizon.groups.reduce((n, g) => n + g.items.length, 0);
  const compact = items <= 2 && horizon.groups.length === 1 ? ' rm-horizon--compact' : '';
  return el('section', { class: `rm-horizon rm-horizon--${horizon.id}${tone}${compact}`, id: horizon.id, 'aria-labelledby': titleId },
    el('div', { class: 'wrap' },
      el('header', { class: 'rm-horizon__head' },
        el('span', { class: 'rm-horizon__badge', 'aria-hidden': 'true' }, icon(horizon.icon, 26)),
        el('div', { class: 'rm-horizon__words' },
          el('p', { class: 'kicker rm-horizon__label' }, bi(horizon.label)),
          el('h2', { id: titleId }, bi(horizon.title)),
          horizon.intro ? el('p', { class: 'section__intro' }, bi(horizon.intro)) : null,
          horizon.link ? linkButton(horizon.link, 'btn btn--ghost rm-horizon__link') : null)),
      el('div', { class: 'rm-groups' }, horizon.groups.map((g, i) => group(g, horizon, i)))));
}

function renderTally(roadmap, host) {
  const count = tally(allItems(roadmap));
  host.replaceChildren(...STATUSES.filter((s) => count[s]).map((status) =>
    el('li', { class: `rm-tally__item rm-tally__item--${status}` },
      el('span', { class: 'rm-tally__num' }, String(count[status])),
      el('span', { class: 'rm-tally__label' }, bi(UI.statusPlural[status])))));
  host.hidden = false;
}

function renderJump(roadmap, host) {
  host.replaceChildren(...roadmap.horizons.filter((h) => h.groups.length).map((h) =>
    el('a', { href: `#${h.id}`, class: `rm-jump__link rm-jump__link--${h.id}` }, icon(h.icon, 16), bi(h.label))));
  host.hidden = false;
}

function renderCurrent(roadmap, host) {
  const release = currentRelease(roadmap);
  if (!release) { host.hidden = true; return; }
  const count = tally(release.items);
  host.replaceChildren(
    el('div', { class: 'rm-now__rim', 'aria-hidden': 'true' },
      el('span', { class: 'rm-now__live' }, el('i'), bi(UI.nowLive)),
      el('span', { class: 'rm-now__ch' }, 'PROPWASH')),
    el('div', { class: 'rm-now__body' },
      ring(release.items, 148),
      el('div', { class: 'rm-now__info' },
        el('p', { class: 'rm-now__version' }, release.version),
        release.title ? el('p', { class: 'rm-now__title' }, bi(release.title)) : null,
        el('ul', { class: 'rm-now__legend', role: 'list' },
          ['done', 'progress', 'planned'].filter((s) => s === 'done' || count[s]).map((s) => el('li', { class: `rm-now__key rm-now__key--${s}` },
            el('b', null, String(count[s])), ' ', bi(UI.statusPlural[s])))),
        el('a', { class: 'btn btn--ghost rm-now__jump', href: '#now' }, bi(UI.nowJump), icon('arrow-down', 14)))),
    el('span', { class: 'rm-now__corners', 'aria-hidden': 'true' }));
  host.hidden = false;
}

function reveal(scope) {
  const targets = Array.from(scope.querySelectorAll('.rm-reveal, .rm-ring'));
  if (reduceMotion || !('IntersectionObserver' in window)) {
    targets.forEach((t) => t.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.12 });
  targets.forEach((t) => io.observe(t));
}

async function main() {
  const root = doc.querySelector('[data-rm-root]');
  const status = doc.querySelector('[data-rm-status]');
  if (!root) return;
  root.setAttribute('aria-busy', 'true');
  try {
    const roadmap = await loadRoadmap();
    const problems = validateRoadmap(roadmap);
    if (problems.length) console.warn('roadmap.json:', problems);
    const horizons = roadmap.horizons.filter((h) => Array.isArray(h.groups) && h.groups.length);
    const sections = horizons.map((h, i) => horizonSection(h, i));
    root.replaceChildren(...sections);
    root.classList.add('is-ready');
    const tallyHost = doc.querySelector('[data-rm-tally]');
    const jumpHost = doc.querySelector('[data-rm-jump]');
    const currentHost = doc.querySelector('[data-rm-current]');
    if (tallyHost) renderTally(roadmap, tallyHost);
    if (jumpHost) renderJump({ horizons }, jumpHost);
    if (currentHost) renderCurrent(roadmap, currentHost);
    reveal(doc);
    const target = location.hash && doc.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) target.scrollIntoView();
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
