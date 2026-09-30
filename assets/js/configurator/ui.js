// Page controller of the drone configurator: part pickers, paint, tune editor, OSD layer, stats, compatibility,
// share code (copy, link, import) and the 3D viewer. Everything runs in the browser; the only requests go to this
// site's own data files.

import { loadCatalog, localText } from './data.js';
import { shareLink, codeFromHash, PAINT_SLOTS } from './sharecode.js';
import { TUNE_PARAMS, PID_SOURCE, sanitizeTuneValue } from './tuning.js';
import { FLIGHT_GROUPS } from './tune.js';
import { STAT_KEYS } from './analysis.js';
import { batteryFit } from './rules.js';
import { assemble, PROP_SLOTS } from './assembly.js';
import { paintDefaults, paintAvailable } from './paint.js';
import { t, tk, entry, num, lang } from './i18n.js';

const RENDER_URL = new URL('../../data/configurator/render.json', import.meta.url);
const MODEL_ROOT = new URL('../../data/configurator/models/', import.meta.url);
const DEFAULT_PRESET = 'justmoreparts:deadcat5_6s';
const FIELDS = ['frame', 'stack', 'motor', 'prop', 'video', 'battery'];
const SLOT_CATEGORIES = [...FIELDS, 'accessory'];
const ROLE_ORDER = ['whoop', 'toothpick', 'cinewhoop', 'freestyle', 'race', 'long_range', 'x_class'];
const KEY_STATS = ['mass_grams', 'thrust_to_weight', 'hover_throttle_percent', 'hover_flight_time_min', 'top_speed_kmh'];
const OSD_PRESETS = ['minimal', 'standard', 'full', 'race'];
const AXES = ['roll', 'pitch', 'yaw'];
// Which part categories a build issue is about (for the fit badges of the pickers).
const INVOLVED = {
  missing_part: [], motor_mount: ['frame', 'motor'], prop_too_large: ['frame', 'prop'], prop_too_small: ['frame', 'prop'],
  prop_mount: ['motor', 'prop'], stack_mount: ['frame', 'stack'], battery_frame: ['frame', 'battery'], accessory_mount: ['frame', 'accessory'],
  motor_overvoltage: ['motor', 'battery'], motor_undervoltage: ['motor', 'battery'], stack_voltage: ['stack', 'battery'],
  esc_undersized: ['motor', 'stack'], battery_weak: ['motor', 'battery'], battery_undersized: ['frame', 'battery'],
};

const doc = document;
const root = doc.documentElement;
const $ = (sel, ctx = doc) => ctx.querySelector(sel);
const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

/** Small DOM builder: el('p', {class: 'x', onclick: fn}, 'text', child). Text is always set as text. */
function el(tag, attrs, ...children) {
  const node = doc.createElementNS(tag === 'svg' || attrs?.svg ? 'http://www.w3.org/2000/svg' : 'http://www.w3.org/1999/xhtml', tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false || key === 'svg') continue;
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : doc.createTextNode(String(child)));
  }
  return node;
}

const svgEl = (tag, attrs) => el(tag, { ...attrs, svg: true });

// ---------------------------------------------------------------------------------------------------------------
// State

let catalog = null;
let render = null;
let viewer = null;
const models = new Map();

const state = {
  build: null,
  paint: {},
  tune: {},
  name: '',
  layers: { paint: true, tune: true, osd: false, name: true },
  osd: { source: 'preset', preset: 'standard', imported: null },
  presetId: null,
  category: 'frame',
  tab: 'parts',
  filters: {},
  linkProps: true,
};

let derived = { check: null, analysis: null, defaults: null, effective: null, assembly: null, paintDefaults: {}, available: new Set() };
let lastHashCode = null;
let undoSnapshot = null;

function snapshot() {
  return JSON.stringify({ build: state.build, paint: state.paint, tune: state.tune, name: state.name, layers: state.layers, osd: state.osd, presetId: state.presetId });
}

function restore(json) {
  Object.assign(state, JSON.parse(json));
}

function loadModel(id) {
  if (!render || !render.models.includes(id)) return Promise.resolve(null);
  if (!models.has(id)) {
    const [ns, path] = id.split(':');
    const url = new URL(`${ns}/${catalog.category(id)}/${path}.json`, MODEL_ROOT);
    const request = fetch(url, { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);
    models.set(id, request);
    request.then((json) => {
      if (!json) models.delete(id);
    });
  }
  return models.get(id);
}

function buildIds(build) {
  return [...FIELDS.map((f) => build[f]), ...Object.values(build.accessories || {})];
}

const partOf = (id, category) => {
  const p = catalog.part(id);
  return p && (!category || p.category === category) ? p : null;
};

function knownBuild(build) {
  return FIELDS.every((f) => partOf(build[f], f)) && Object.values(build.accessories || {}).every((id) => partOf(id, 'accessory'));
}

// ---------------------------------------------------------------------------------------------------------------
// Derived values

function recompute() {
  const build = state.build;
  derived.check = catalog.check(build);
  derived.analysis = catalog.analyze(build);
  derived.defaults = null;
  derived.effective = null;
  if (knownBuild(build)) {
    try {
      derived.defaults = catalog.defaultTune(build);
      derived.effective = catalog.effectiveTune(state.tune, build);
    } catch {
      derived.defaults = null;
    }
  }
}

async function recomputePaintInfo() {
  const build = state.build;
  const loaded = new Map();
  await Promise.all(buildIds(build).filter((id) => catalog.part(id)).map((id) => loadModel(id).then((m) => m && loaded.set(id, m))));
  if (build !== state.build) return false;
  const modelOf = (id) => loaded.get(id) || null;
  const assembly = assemble(build, { catalog, render, model: modelOf });
  derived.assembly = assembly;
  derived.paintDefaults = { ...catalog.defaultPaint(build), ...paintDefaults(assembly.pieces, modelOf, render) };
  derived.available = paintAvailable(assembly.pieces, modelOf, render, PAINT_SLOTS);
  derived.proceduralFrame = assembly.pieces.some((p) => p.role === 'frame' && p.procedural);
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// Share code

function osdSpec() {
  if (state.osd.source === 'imported' && state.osd.imported) return state.osd.imported;
  return { version: 1, json: JSON.stringify({ v: 1, preset: state.osd.preset }) };
}

function content() {
  const paint = state.layers.paint && Object.keys(state.paint).length ? { ...state.paint } : null;
  const name = state.layers.name && state.name.trim() ? state.name.trim() : null;
  return {
    build: state.build,
    paint,
    tune: state.layers.tune ? { ...state.tune } : null,
    osd: state.layers.osd ? osdSpec() : null,
    name,
  };
}

function currentCode() {
  try {
    return { code: catalog.encode(content()), error: null };
  } catch (e) {
    return { code: null, error: e.message || String(e) };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Part classes (drone classes a part suits) for the class filter

const partRoles = new Map();

function computeRoles() {
  const frames = catalog.partsIn('frame');
  const rolesWhere = (test) => new Set(frames.filter(test).map((f) => f.data.role));
  for (const p of catalog.parts) {
    let roles;
    switch (p.category) {
      case 'frame': roles = new Set([p.data.role]); break;
      case 'motor': roles = rolesWhere((f) => f.data.motor_mounts.includes(p.data.mount)); break;
      case 'prop': roles = rolesWhere((f) => p.data.diameter_mm >= f.data.props_mm[0] && p.data.diameter_mm <= f.data.props_mm[1]); break;
      case 'stack': roles = rolesWhere((f) => f.data.stack_mounts.includes(p.data.mount)); break;
      case 'battery': roles = rolesWhere((f) => ['ok', 'weak'].includes(batteryFit(f, p))); break;
      case 'video': roles = new Set([p.data.link]); break;
      case 'accessory': roles = new Set([p.data.slot]); break;
      default: roles = new Set();
    }
    partRoles.set(p.id, roles);
  }
}

function classesOf(category) {
  const set = new Set();
  for (const p of catalog.partsIn(category)) for (const r of partRoles.get(p.id)) set.add(r);
  const order = category === 'video' ? ['analog', 'digital'] : category === 'accessory' ? ['top', 'bottom'] : ROLE_ORDER;
  return order.filter((r) => set.has(r));
}

/** Build with one part swapped in (accessories go into their own mount). */
function swapped(part) {
  const b = { ...state.build, accessories: { ...(state.build.accessories || {}) } };
  if (part.category === 'accessory') b.accessories[part.data.slot] = part.id;
  else b[part.category] = part.id;
  return b;
}

/** Fit of a part for the current build: {level: 'ok'|'warn'|'bad', issues: [key]}. */
function fitOf(part) {
  const result = catalog.check(swapped(part));
  const mine = (key) => (INVOLVED[key] || []).includes(part.category);
  const problems = result.problems.filter(mine);
  const warnings = result.warnings.filter(mine);
  return { level: problems.length ? 'bad' : warnings.length ? 'warn' : 'ok', issues: [...problems, ...warnings] };
}

function facts(p) {
  const d = p.data;
  const g = num(p.basics.mass_g, p.basics.mass_g < 10 ? 1 : 0) + ' g';
  switch (p.category) {
    case 'frame': return `${d.wheelbase_mm} mm · ${d.props_mm[0] ? `${d.props_mm[0]}–` : '≤ '}${d.props_mm[1]} mm ${t('ui.props')} · ${g}`;
    case 'stack': return `${d.cells[0] === d.cells[1] ? d.cells[0] : `${d.cells[0]}–${d.cells[1]}`}S · ${d.esc_continuous_a} A · ${g}`;
    case 'motor': return `${d.stator} · ${d.kv} KV · ${d.cells[0] === d.cells[1] ? d.cells[0] : `${d.cells[0]}–${d.cells[1]}`}S · ${g}`;
    case 'prop': return `${d.diameter_mm} mm (${num(p.derived.diameter_in, 1)}″) · ${d.blades} ${t('ui.blades')} · ${g}`;
    case 'video': return `${t(`roles.${d.link}`)} · ${d.latency_ms} ms · ${d.range_blocks} ${t('ui.blocks')}`;
    case 'battery': return `${d.cells}S · ${d.capacity_mah} mAh · ${d.c_rating}C · ${g}`;
    case 'accessory': return `${t(`mounts.${d.slot}`)} · ${g}`;
    default: return g;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Rendering: slots and picker

function slotRows() {
  const box = $('[data-slots]');
  box.replaceChildren();
  const issues = [...derived.check.problems, ...derived.check.warnings];
  for (const category of SLOT_CATEGORIES) {
    let value;
    let unknown = false;
    if (category === 'accessory') {
      const acc = state.build.accessories || {};
      const names = ['top', 'bottom'].filter((m) => acc[m]).map((m) => (catalog.part(acc[m]) ? catalog.partName(acc[m], lang()) : acc[m]));
      unknown = ['top', 'bottom'].some((m) => acc[m] && !partOf(acc[m], 'accessory'));
      value = names.length ? names.join(' + ') : t('ui.none');
    } else {
      const id = state.build[category];
      const p = partOf(id, category);
      unknown = !p;
      value = p ? catalog.shortName(id, lang()) : `${t('ui.unknownPart')}: ${id}`;
    }
    const related = issues.filter((k) => (INVOLVED[k] || []).includes(category));
    const bad = unknown || related.some((k) => catalog.issueKind(k) === 'problem');
    const warn = !bad && related.length > 0;
    box.append(el('button', {
      type: 'button',
      class: `slot${state.category === category ? ' is-active' : ''}${bad ? ' is-bad' : warn ? ' is-warn' : ''}`,
      'aria-pressed': String(state.category === category),
      'aria-controls': 'picker',
      dataset: { cat: category },
      onclick: () => {
        state.category = category;
        slotRows();
        picker();
        const again = $(`[data-slots] [data-cat="${category}"]`);
        if (again) again.focus();
      },
    },
    el('span', { class: 'slot__label' }, t(`categories.${category}`), bad || warn ? el('span', { class: 'slot__dot', 'aria-hidden': 'true' }) : null),
    el('span', { class: 'slot__value' }, value),
    bad || warn ? el('span', { class: 'visually-hidden' }, ` (${bad ? t('ui.problem') : t('ui.warning')})`) : null));
  }
}

function filterFor(category) {
  if (!state.filters[category]) state.filters[category] = { q: '', cls: 'auto', fits: false };
  return state.filters[category];
}

/** Class filter in effect: 'auto' follows the class of the current frame for the other categories. */
function classOf(category, filter) {
  if (filter.cls !== 'auto') return filter.cls;
  if (filter.q) return 'all';
  const frame = partOf(state.build.frame, 'frame');
  const role = frame && frame.data.role;
  return category !== 'frame' && role && classesOf(category).includes(role) ? role : 'all';
}

function matches(part, filter, cls) {
  if (cls !== 'all' && !partRoles.get(part.id).has(cls)) return false;
  if (filter.q) {
    const hay = [catalog.partName(part.id, 'en'), catalog.partName(part.id, 'de'), part.id, facts(part),
      localText(part.short_name, 'en'), (catalog.help(part.id, lang()) || {}).summary || ''].join(' ').toLowerCase();
    if (!filter.q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w))) return false;
  }
  return true;
}

let detailsOpen = false;

function helpBlock(part, compact, noSummary) {
  const help = catalog.help(part.id, lang());
  const box = el('div', { class: 'part-help' });
  if (help && help.summary && !noSummary) box.append(el('p', { class: 'part-help__summary' }, help.summary));
  const lines = help ? help.what : [];
  const list = el('ul', { class: 'part-help__list' });
  for (const line of lines) {
    const kind = /^\+/.test(line) ? 'pro' : /^[−–-]\s/.test(line) ? 'con' : 'fact';
    list.append(el('li', { class: `part-help__${kind}` }, kind === 'fact' ? line : line.replace(/^[+−–-]\s*/, '')));
  }
  if (!lines.length) list.append(el('li', { class: 'part-help__fact' }, facts(part)));
  box.append(list);
  if (!compact && help && help.use.length) box.append(el('ul', { class: 'part-help__use' }, help.use.map((u) => el('li', null, u))));
  return box;
}

function picker() {
  const box = $('[data-picker]');
  box.id = 'picker';
  const category = state.category;
  const filter = filterFor(category);
  const parts = catalog.partsIn(category);
  const current = category === 'accessory' ? null : partOf(state.build[category], category);
  const listId = `list-${category}`;

  const head = el('div', { class: 'picker__head' },
    el('h2', { class: 'picker__title', id: 'picker-title' }, t(`categoryPick.${category}`)));
  let selectedCard = null;
  if (current) {
    const help = catalog.help(current.id, lang());
    const more = help && (help.what.length || help.use.length);
    selectedCard = el('div', { class: 'picker__current' },
      el('p', { class: 'picker__current-label' }, t('ui.current')),
      el('p', { class: 'picker__current-name' }, catalog.partName(current.id, lang()),
        el('span', { class: `badge badge--${current.builtin ? 'pw' : 'jmp'}`, title: current.builtin ? t('ui.builtinLong') : t('ui.addonLong') },
          current.builtin ? t('ui.builtin') : t('ui.addon'))),
      el('p', { class: 'part-help__summary' }, (help && help.summary) || facts(current)),
      more ? el('details', { class: 'picker__more', open: detailsOpen || null, ontoggle: (e) => { detailsOpen = e.currentTarget.open; } },
        el('summary', null, t('ui.prosCons')), helpBlock(current, false, true)) : null);
  }

  const search = el('input', {
    class: 'field__control picker__search', type: 'search', value: filter.q, placeholder: t('ui.searchPlaceholder'),
    'aria-label': t('ui.search'), 'aria-controls': listId, autocomplete: 'off', spellcheck: 'false',
    oninput: (e) => {
      filter.q = e.target.value;
      renderList();
    },
  });
  const classes = classesOf(category);
  const chips = classes.length > 1 ? el('div', { class: 'chips', role: 'group', 'aria-label': t('ui.classFilter') },
    ['all', ...classes].map((cls) => el('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(classOf(category, filter) === cls), dataset: { cls },
      onclick: () => {
        filter.cls = cls;
        renderList();
      },
    }, cls === 'all' ? t('ui.all') : t(`roles.${cls}`)))) : null;
  const fits = el('label', { class: 'check' },
    el('input', { type: 'checkbox', checked: filter.fits || null, onchange: (e) => { filter.fits = e.target.checked; renderList(); } }),
    el('span', null, t('ui.fitsOnly')));
  const tools = el('div', { class: 'picker__tools' },
    el('div', { class: 'picker__search-wrap' }, svgEl('svg', { class: 'picker__search-icon', width: 16, height: 16, 'aria-hidden': 'true' }), search), chips, fits);
  tools.querySelector('.picker__search-icon').append(svgEl('use', { href: '#i-search' }));

  const list = el('div', { class: 'part-list', role: 'listbox', id: listId, 'aria-labelledby': 'picker-title' });
  const count = el('p', { class: 'picker__count', role: 'status' });

  function option(part, mount) {
    const selected = part ? (category === 'accessory' ? (state.build.accessories || {})[mount] === part.id : state.build[category] === part.id)
      : !(state.build.accessories || {})[mount];
    const fit = part ? fitOf(part) : { level: 'ok', issues: [] };
    const fitText = fit.level === 'bad' ? t('ui.noFit') : fit.level === 'warn' ? t('ui.fitsWarn') : t('ui.fits');
    const name = part ? catalog.partName(part.id, lang()) : `${t('ui.none')} (${t(`mounts.${mount}`)})`;
    const node = el('div', {
      class: `part${selected ? ' is-selected' : ''} is-${fit.level}`, role: 'option', 'aria-selected': String(selected), tabindex: '-1',
      dataset: { id: part ? part.id : '', mount: mount || '' },
    },
    el('span', { class: 'part__fit', 'aria-hidden': 'true' }),
    el('span', { class: 'part__main' },
      el('span', { class: 'part__name' }, name),
      part ? el('span', { class: 'part__facts' }, facts(part)) : null,
      fit.issues.length ? el('span', { class: 'part__issue', title: fit.issues.map((k) => catalog.issueText(k, lang())).join('\n') },
        catalog.issueText(fit.issues[0], lang()) + (fit.issues.length > 1 ? ` (+${fit.issues.length - 1})` : '')) : null),
    part ? el('span', { class: `badge badge--${part.builtin ? 'pw' : 'jmp'}`, title: part.builtin ? t('ui.builtinLong') : t('ui.addonLong') },
      part.builtin ? t('ui.builtin') : t('ui.addon')) : null,
    el('span', { class: 'visually-hidden' }, `, ${fitText}`));
    return { node, fit };
  }

  function renderList() {
    list.replaceChildren();
    let shown = 0;
    if (chips) for (const chip of chips.children) chip.setAttribute('aria-pressed', String(chip.dataset.cls === classOf(category, filter)));
    const groups = category === 'accessory' ? ['top', 'bottom'] : [null];
    for (const mount of groups) {
      const container = mount ? el('div', { role: 'group', 'aria-labelledby': `grp-${mount}`, class: 'part-group' },
        el('p', { class: 'part-group__title', id: `grp-${mount}`, role: 'presentation' }, t(`roles.${mount}`))) : list;
      if (mount) {
        list.append(container);
        container.append(option(null, mount).node);
      }
      for (const part of parts) {
        if (mount && part.data.slot !== mount) continue;
        if (!matches(part, filter, classOf(category, filter))) continue;
        const { node, fit } = option(part, mount);
        if (filter.fits && fit.level === 'bad') continue;
        container.append(node);
        shown++;
      }
    }
    count.textContent = shown ? '' : t('ui.noMatch');
    const options = [...list.querySelectorAll('[role="option"]')];
    const active = options.find((o) => o.getAttribute('aria-selected') === 'true') || options[0];
    if (active) active.tabIndex = 0;
  }

  function choose(node) {
    const id = node.dataset.id;
    const mount = node.dataset.mount;
    hideTip();
    const build = { ...state.build, accessories: { ...(state.build.accessories || {}) } };
    if (category === 'accessory') {
      if (id) build.accessories[catalog.part(id).data.slot] = id;
      else delete build.accessories[mount];
    } else {
      build[category] = id;
    }
    setBuild(build, { keepFocus: { category, id, mount } });
  }

  list.addEventListener('click', (e) => {
    const node = e.target.closest('[role="option"]');
    if (node) choose(node);
  });
  list.addEventListener('keydown', (e) => {
    const options = [...list.querySelectorAll('[role="option"]')];
    const i = options.indexOf(doc.activeElement);
    let next = null;
    if (e.key === 'ArrowDown') next = options[Math.min(options.length - 1, i + 1)];
    else if (e.key === 'ArrowUp') next = options[Math.max(0, i - 1)];
    else if (e.key === 'Home') next = options[0];
    else if (e.key === 'End') next = options[options.length - 1];
    else if ((e.key === 'Enter' || e.key === ' ') && i >= 0) {
      e.preventDefault();
      choose(options[i]);
      return;
    } else return;
    e.preventDefault();
    if (next) {
      options.forEach((o) => { o.tabIndex = -1; });
      next.tabIndex = 0;
      next.focus();
    }
  });
  list.addEventListener('focusin', (e) => {
    const node = e.target.closest('[role="option"]');
    if (node && node.dataset.id) showTip(node, catalog.part(node.dataset.id));
  });
  list.addEventListener('focusout', hideTip);
  list.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const node = e.target.closest('[role="option"]');
    if (node && node.dataset.id) showTip(node, catalog.part(node.dataset.id));
    else hideTip();
  });
  list.addEventListener('pointerleave', hideTip);

  box.replaceChildren(head, selectedCard || '', tools, count, list);
  renderList();
  list.scrollTop = listScroll[category] || 0;
  list.addEventListener('scroll', () => { listScroll[category] = list.scrollTop; }, { passive: true });
}

const listScroll = {};

// Floating part tip with pros/cons and what the part would change.
let tipTimer = 0;
let tipFor = null;

function showTip(node, part) {
  const tip = $('[data-tip]');
  if (!part || window.innerWidth < 900) return;
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => {
    tipFor = node;
    tip.replaceChildren(el('p', { class: 'part-tip__name' }, catalog.partName(part.id, lang())), helpBlock(part, true));
    const selected = part.category === 'accessory' ? (state.build.accessories || {})[part.data.slot] === part.id : state.build[part.category] === part.id;
    if (!selected && derived.analysis) {
      const after = catalog.analyze(swapped(part));
      if (after) {
        const rows = el('dl', { class: 'part-tip__delta' });
        for (const key of ['mass_grams', 'thrust_to_weight', 'hover_flight_time_min', 'top_speed_kmh']) {
          const [, , unit, decimals] = entry(`stats.${key}`);
          const before = derived.analysis[key];
          const value = after[key];
          const diff = value - before;
          const better = key === 'mass_grams' ? diff < 0 : diff > 0;
          rows.append(el('div', null, el('dt', null, t(`keyStats.${key}`)),
            el('dd', { class: Math.abs(diff) < 10 ** -decimals / 2 ? '' : better ? 'is-up' : 'is-down' },
              `${num(before, decimals)} → ${num(value, decimals)} ${unit}`)));
        }
        tip.append(el('p', { class: 'part-tip__label' }, t('ui.ifSwapped')), rows);
      }
    }
    tip.hidden = false;
    const r = node.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let left = r.right + 12;
    if (left + w > window.innerWidth - 8) left = Math.max(8, r.left - w - 12);
    const top = Math.min(Math.max(8, r.top + r.height / 2 - h / 2), window.innerHeight - h - 8);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }, 140);
}

function hideTip() {
  clearTimeout(tipTimer);
  tipFor = null;
  const tip = $('[data-tip]');
  if (tip) tip.hidden = true;
}

// ---------------------------------------------------------------------------------------------------------------
// Stats and checks

function statRow(key, analysis, cls) {
  const [, , unit, decimals] = entry(`stats.${key}`);
  const value = analysis ? analysis[key] : NaN;
  return el('div', { class: cls },
    el('dt', null, cls === 'keystat' ? t(`keyStats.${key}`).split('/').flatMap((w, i) => (i ? ['/', el('wbr'), w] : [w])) : t(`stats.${key}`)),
    el('dd', null, el('span', { class: 'stat__value' }, num(value, decimals)), Number.isFinite(value) ? el('span', { class: 'stat__unit' }, ` ${unit}`) : null));
}

function renderStats() {
  const a = derived.analysis;
  $('[data-keystats]').replaceChildren(...KEY_STATS.map((k) => statRow(k, a, 'keystat')));
  $('[data-stats]').replaceChildren(...STAT_KEYS.map((k) => statRow(k, a, 'stat')));
  const note = $('[data-stats-note]');
  note.textContent = a ? '' : t('ui.noAnalysis');
  note.hidden = !!a;
}

function renderChecks() {
  const box = $('[data-checks]');
  const c = derived.check;
  const a = derived.analysis;
  const flight = a ? a.warnings : [];
  const unknown = c.unknownParts || [];
  let level;
  let label;
  if (unknown.length) {
    level = 'bad';
    label = t('ui.statusUnknown');
  } else if (c.problems.length) {
    level = 'bad';
    label = t('ui.statusProblems');
  } else if (c.warnings.length || flight.length) {
    level = 'warn';
    label = t('ui.statusWarnings');
  } else {
    level = 'ok';
    label = t('ui.statusOk');
  }
  const list = el('ul', { class: 'checks__list' });
  if (unknown.length) list.append(el('li', { class: 'is-bad' }, t('ui.unknownExplain'), el('span', { class: 'mono' }, unknown.join(', '))));
  for (const k of c.problems) if (!(unknown.length && k === 'missing_part')) list.append(el('li', { class: 'is-bad' }, catalog.issueText(k, lang())));
  for (const k of c.warnings) list.append(el('li', { class: 'is-warn' }, catalog.issueText(k, lang())));
  for (const k of flight) list.append(el('li', { class: 'is-warn' }, el('span', { class: 'checks__tag' }, t('ui.flightWarning')), catalog.analysisWarningText(k, lang())));
  box.replaceChildren(el('p', { class: `checks__status is-${level}` }, el('span', { class: 'checks__led', 'aria-hidden': 'true' }), label), list.children.length ? list : '');
  if (list.children.length) list.addEventListener('scroll', checksScroll, { passive: true });
  checksScroll();
}

/** On wide screens the check list scrolls inside the sticky 3D panel: then it takes keyboard focus and fades out
    at the bottom while there is more below. */
function checksScroll() {
  const list = $('[data-checks] .checks__list');
  if (!list) return;
  const scrolls = list.scrollHeight > list.clientHeight + 1;
  list.classList.toggle('has-more', scrolls && list.scrollTop + list.clientHeight < list.scrollHeight - 2);
  if (scrolls) {
    list.tabIndex = 0;
    list.setAttribute('aria-label', t('ui.checksLabel'));
  } else {
    list.removeAttribute('tabindex');
    list.removeAttribute('aria-label');
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Paint panel

function renderPaint() {
  const panel = $('[data-panel-paint]');
  const slots = PAINT_SLOTS.filter((s) => derived.available.has(s) || state.paint[s]);
  const rows = el('div', { class: 'paint-rows' });
  for (const slot of slots) {
    const info = catalog.paintSlot(slot);
    const painted = state.paint[slot];
    const value = painted || derived.paintDefaults[slot] || '#808080';
    const id = `paint-${slot}`;
    const off = !derived.available.has(slot);
    const input = el('input', {
      type: 'color', id, class: 'paint-row__color', value,
      oninput: (e) => setPaint(slot, e.target.value, false),
      onchange: (e) => setPaint(slot, e.target.value, true),
    });
    rows.append(el('div', { class: `paint-row${painted ? ' is-painted' : ''}${off ? ' is-off' : ''}` },
      input,
      el('label', { for: id, class: 'paint-row__label' },
        el('span', { class: 'paint-row__name' }, catalog.paintSlotName(slot, lang())),
        el('span', { class: 'paint-row__hint' }, off ? t(slot === 'frame' && derived.proceduralFrame ? 'ui.paintHidden' : 'ui.notOnBuild')
          : localText(info && info.hint, lang()))),
      el('span', { class: 'paint-row__hex mono' }, value.toUpperCase(), el('span', { class: 'visually-hidden' }, ` (${painted ? t('ui.painted') : t('ui.original')})`)),
      el('button', {
        type: 'button', class: 'icon-btn icon-btn--small', title: t('ui.resetSlot'), 'aria-label': `${t('ui.resetSlot')}: ${catalog.paintSlotName(slot, lang())}`,
        disabled: painted ? null : true, onclick: () => setPaint(slot, null, true),
      }, useIcon('i-reset'))));
  }
  panel.replaceChildren(
    el('p', { class: 'panel-intro' }, t('ui.paintIntro')),
    derived.proceduralFrame ? el('p', { class: 'cfg-note' }, t('ui.procedural')) : '',
    el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: state.linkProps || null, onchange: (e) => { state.linkProps = e.target.checked; } }), el('span', null, t('ui.linkProps'))),
    rows,
    el('button', { type: 'button', class: 'btn btn--ghost btn--small', disabled: Object.keys(state.paint).length ? null : true, onclick: () => { state.paint = {}; afterPaint(true); renderPaint(); } }, t('ui.resetPaint')));
}

function useIcon(id) {
  const s = svgEl('svg', { width: 16, height: 16, 'aria-hidden': 'true' });
  s.append(svgEl('use', { href: `#${id}` }));
  return s;
}

let paintFrame = 0;

function setPaint(slot, color, commit) {
  const targets = state.linkProps && PROP_SLOTS.includes(slot) ? PROP_SLOTS : [slot];
  for (const s of targets) {
    if (color) state.paint[s] = color.toLowerCase();
    else delete state.paint[s];
  }
  if (!commit) {
    cancelAnimationFrame(paintFrame);
    paintFrame = requestAnimationFrame(() => viewer && viewer.paint(state.paint));
    for (const s of targets) {
      const row = $(`#paint-${s}`);
      if (row && s !== slot) row.value = color;
      const hex = row && row.parentNode.querySelector('.paint-row__hex');
      if (hex && color) hex.firstChild.textContent = color.toUpperCase();
    }
    return;
  }
  afterPaint(true);
  const focused = doc.activeElement && doc.activeElement.id;
  renderPaint();
  if (focused && $(`#${focused}`)) $(`#${focused}`).focus();
}

function afterPaint(persist) {
  syncPreset();
  if (viewer) viewer.paint(state.paint);
  renderShare();
  if (persist) scheduleHash();
}

// ---------------------------------------------------------------------------------------------------------------
// Tune panel

function displayOf(key, value) {
  const p = TUNE_PARAMS[key];
  return p.kind === 'number' ? Number((value * p.displayScale).toFixed(p.decimals)) : value;
}

function tuneLabel(key) {
  return tk('tune', key) || tk('tune', key.split('.').pop()) || key;
}

function control(key, labelText) {
  const p = TUNE_PARAMS[key];
  const id = `tune-${key.replace(/\./g, '-')}`;
  const value = derived.effective[key];
  const def = derived.defaults[key];
  const changed = isChanged(key);
  let input;
  if (p.kind === 'enum') {
    input = el('select', { id, class: 'field__control', dataset: { key } },
      p.options.map((o, i) => el('option', { value: String(i), selected: Math.round(value) === i || null }, t(`options.${o}`))));
  } else if (p.kind === 'bool') {
    input = el('input', { id, type: 'checkbox', class: 'tune-check', dataset: { key }, checked: value >= 0.5 || null });
  } else {
    input = el('input', {
      id, type: 'number', class: 'field__control tune-num', inputmode: 'decimal', dataset: { key },
      min: String(p.allowOff ? 0 : Number((p.min * p.displayScale).toFixed(p.decimals + 2))),
      max: String(Number((p.max * p.displayScale).toFixed(p.decimals + 2))),
      step: String(Number((p.step * p.displayScale).toFixed(6))),
      value: String(displayOf(key, value)),
    });
  }
  const unit = p.unit ? el('span', { class: 'tune__unit' }, p.unit + (p.allowOff ? ` · ${t('ui.offHint')}` : '')) : null;
  const defText = p.kind === 'enum' ? t(`options.${p.options[Math.round(def)]}`) : p.kind === 'bool' ? t(def >= 0.5 ? 'options.on' : 'options.off')
    : `${num(displayOf(key, def), p.decimals)}${p.unit ? ` ${p.unit}` : ''}`;
  return el('div', { class: `tune${changed ? ' is-changed' : ''}`, dataset: { row: key } },
    el('label', { for: id, class: 'tune__label' }, labelText || tuneLabel(key), changed ? changedMark() : null),
    el('div', { class: 'tune__input' }, input, unit),
    el('button', {
      type: 'button', class: 'icon-btn icon-btn--small tune__reset', disabled: changed ? null : true,
      title: `${t('ui.resetValue')} (${t('ui.defaultValue')}: ${defText})`, 'aria-label': `${t('ui.resetValue')}: ${labelText || tuneLabel(key)} (${defText})`,
      dataset: { reset: key },
    }, useIcon('i-reset')));
}

function renderTune() {
  const panel = $('[data-panel-tune]');
  if (!derived.effective) {
    panel.replaceChildren(el('p', { class: 'cfg-note' }, t('ui.tuneUnavailable')));
    return;
  }
  const e = derived.effective;
  const groups = {};
  for (const g of FLIGHT_GROUPS) groups[g] = el('fieldset', { class: `tune-group tune-group--${g}` }, el('legend', null, catalog.tuneGroupName(g, lang())));

  // Rates
  const actual = Math.round(e['rates.type']) === 1;
  groups.rates.append(control('rates.type'));
  const rateKeys = actual ? ['centerRateDps', 'maxRateDps', 'actualExpo'] : ['rcRate', 'superRate', 'rcExpo'];
  const table = el('div', { class: 'tune-table', role: 'group' });
  table.append(el('div', { class: 'tune-table__head', 'aria-hidden': 'true' }, el('span'), ...rateKeys.map((k) => el('span', null, t(`tune.${k}`)))));
  for (const axis of AXES) {
    table.append(el('div', { class: 'tune-table__row' }, el('span', { class: 'tune-table__axis' }, t(`axes.${axis}`)),
      ...rateKeys.map((k) => control(`rates.${axis}.${k}`, `${t(`axes.${axis}`)} · ${t(`tune.${k}`)}`))));
  }
  groups.rates.append(table, rateGraph(e, actual), control('rates.rcDeadband'), control('rates.yawDeadband'));

  // PID
  groups.pid.append(control(PID_SOURCE));
  if (Math.round(e[PID_SOURCE]) !== 1) groups.pid.append(el('p', { class: 'tune-note' }, t('ui.derivedNote')));
  const pidTable = el('div', { class: 'tune-table' });
  pidTable.append(el('div', { class: 'tune-table__head', 'aria-hidden': 'true' }, el('span'), el('span', null, 'P'), el('span', null, 'I'), el('span', null, 'D')));
  for (const axis of AXES) {
    pidTable.append(el('div', { class: 'tune-table__row' }, el('span', { class: 'tune-table__axis' }, t(`axes.${axis}`)),
      ...['p', 'i', 'd'].map((term) => control(`pid.${axis}.${term}`, `${t(`axes.${axis}`)} · ${term.toUpperCase()}`))));
  }
  groups.pid.append(pidTable);
  for (const k of ['pid.angleStrength', 'pid.angleLimitDeg', 'pid.horizonStrength', 'pid.itermRelax', 'pid.antiGravityGain', 'pid.airmode']) groups.pid.append(control(k));

  for (const axis of AXES) groups.feedforward.append(control(`pid.${axis}.ff`, `${t('tune.ff')} ${t(`axes.${axis}`)}`));
  for (const k of ['pid.tpaMode', 'pid.tpaRatePercent', 'pid.tpaBreakpoint']) groups.tpa.append(control(k));
  for (const k of ['filters.pidLoop', 'filters.gyroLpfHz', 'filters.dtermLpf1Hz', 'filters.dtermLpf2Hz', 'filters.rcSmoothingHz']) groups.filters.append(control(k));
  for (const k of ['pid.motorIdlePercent', 'pid.throttleMid', 'pid.throttleExpo', 'pid.throttleLimitType', 'pid.throttleLimitPercent', 'pid.thrustLinearPercent', 'pid.vbatSagCompensationPercent']) groups.throttle.append(control(k));
  groups.throttle.insertBefore(throttleGraph(e), groups.throttle.children[1]);

  const reset = el('button', {
    type: 'button', class: 'btn btn--ghost btn--small', 'data-reset-tune': '', disabled: Object.keys(state.tune).length ? null : true,
    onclick: () => {
      setTune({});
      const first = $('[data-panel-tune] [data-key]');
      if (first) first.focus();
    },
  }, t('ui.resetTune'));
  panel.replaceChildren(el('p', { class: 'panel-intro' }, t('ui.tuneIntro')), el('div', { class: 'tune-groups' }, ...FLIGHT_GROUPS.map((g) => groups[g])), reset);
}

function isChanged(key) {
  const value = derived.effective[key];
  const def = derived.defaults[key];
  return key in state.tune && Math.abs(value - def) > 1e-4 * Math.max(1, Math.abs(def));
}

function changedMark() {
  return el('span', { class: 'tune__mark', title: t('ui.changed') }, el('span', { class: 'visually-hidden' }, ` (${t('ui.changed')})`));
}

// Updates values, marks and graphs of the tune panel in place (keeps focus while tabbing through the fields).
function updateTune() {
  const e = derived.effective;
  for (const row of doc.querySelectorAll('[data-panel-tune] [data-row]')) {
    const key = row.dataset.row;
    const p = TUNE_PARAMS[key];
    const changed = isChanged(key);
    row.classList.toggle('is-changed', changed);
    const input = row.querySelector('[data-key]');
    if (input && input !== doc.activeElement) {
      if (p.kind === 'bool') input.checked = e[key] >= 0.5;
      else if (p.kind === 'enum') input.value = String(Math.round(e[key]));
      else input.value = String(displayOf(key, e[key]));
    }
    const label = row.querySelector('.tune__label');
    const mark = label.querySelector('.tune__mark');
    if (changed && !mark) label.append(changedMark());
    if (!changed && mark) mark.remove();
    row.querySelector('.tune__reset').disabled = !changed;
  }
  const rate = $('[data-rate-graph]');
  if (rate) rate.replaceWith(rateGraph(e, Math.round(e['rates.type']) === 1));
  const throttle = $('[data-throttle-graph]');
  if (throttle) throttle.replaceWith(throttleGraph(e));
  const all = $('[data-reset-tune]');
  if (all) all.disabled = !Object.keys(state.tune).length;
}

function setTune(stored, focusKey) {
  const before = derived.effective;
  state.tune = stored;
  state.layers.tune = true;
  syncPreset();
  recompute();
  const after = derived.effective;
  // Rates type and PID source change the layout of the panel; everything else is updated in place.
  const structural = !focusKey || !before || !after || Math.round(before['rates.type']) !== Math.round(after['rates.type'])
    || Math.round(before[PID_SOURCE]) !== Math.round(after[PID_SOURCE]);
  if (structural) renderTune();
  else updateTune();
  renderStats();
  renderShare();
  scheduleHash();
  if (structural && focusKey) {
    const target = $(`[data-key="${focusKey}"]`);
    if (target) target.focus();
  }
}

function onTuneInput(target, commit) {
  const key = target.dataset.key;
  if (!key || !derived.effective) return;
  const p = TUNE_PARAMS[key];
  let value;
  if (p.kind === 'bool') value = target.checked ? 1 : 0;
  else if (p.kind === 'enum') value = Number(target.value);
  else {
    const raw = parseFloat(String(target.value).replace(',', '.'));
    if (!Number.isFinite(raw)) return;
    value = raw / p.displayScale;
  }
  value = sanitizeTuneValue(key, value);
  if (!commit && p.kind === 'number') {
    // Live graph while typing, without re-rendering the inputs.
    const preview = { ...derived.effective, [key]: value };
    const actual = Math.round(preview['rates.type']) === 1;
    const g = $('[data-rate-graph]');
    if (g && key.startsWith('rates.')) g.replaceWith(rateGraph(preview, actual));
    const tg = $('[data-throttle-graph]');
    if (tg && key.startsWith('pid.throttle')) tg.replaceWith(throttleGraph(preview));
    return;
  }
  const edited = { ...derived.effective, [key]: value };
  setTune(catalog.applyTuneEdit(state.tune, edited, state.build), key);
}

function resetTuneKey(key) {
  const edited = { ...derived.effective, [key]: derived.defaults[key] };
  setTune(catalog.applyTuneEdit(state.tune, edited, state.build), key);
  const input = $(`[data-key="${key}"]`);
  if (input) input.focus();
}

function rateDps(type, r, x) {
  let rate;
  if (type === 0) {
    const a = Math.abs(x);
    const e = r.rcExpo;
    const xe = x * a * a * a * e + x * (1 - e);
    const rc = r.rcRate > 2 ? r.rcRate + 14.54 * (r.rcRate - 2) : r.rcRate;
    rate = 200 * rc * xe;
    if (r.superRate > 0) rate /= Math.min(1, Math.max(0.01, 1 - a * r.superRate));
  } else {
    const e = r.actualExpo;
    const x5 = x ** 5;
    rate = x * r.centerRateDps + Math.max(0, r.maxRateDps - r.centerRateDps) * Math.abs(x) * (x5 * e + x * (1 - e));
  }
  return Math.max(-1998, Math.min(1998, rate));
}

function graphFrame(width, height, label, attr) {
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, class: 'graph', role: 'img', 'aria-label': label, [attr]: '' });
  return svg;
}

function rateGraph(e, actual) {
  const W = 320;
  const H = 180;
  const pad = { l: 40, r: 10, t: 12, b: 26 };
  const type = actual ? 1 : 0;
  const curves = AXES.map((axis) => {
    const r = {};
    for (const k of ['rcRate', 'superRate', 'rcExpo', 'centerRateDps', 'maxRateDps', 'actualExpo']) r[k] = e[`rates.${axis}.${k}`];
    return { axis, r, max: rateDps(type, r, 1) };
  });
  const top = Math.max(200, ...curves.map((c) => c.max));
  const yMax = Math.ceil(top / 200) * 200;
  const X = (x) => pad.l + x * (W - pad.l - pad.r);
  const Y = (v) => H - pad.b - (v / yMax) * (H - pad.t - pad.b);
  const summary = curves.map((c) => `${t(`axes.${c.axis}`)} ${Math.round(c.max)} °/s`).join(', ');
  const svg = graphFrame(W, H, `${t('ui.rateGraph')}: ${summary}`, 'data-graph');
  for (let v = 0; v <= yMax; v += yMax / 4) {
    svg.append(svgEl('line', { x1: pad.l, x2: W - pad.r, y1: Y(v), y2: Y(v), class: 'graph__grid' }));
    const label = svgEl('text', { x: pad.l - 6, y: Y(v) + 4, class: 'graph__tick', 'text-anchor': 'end' });
    label.textContent = String(Math.round(v));
    svg.append(label);
  }
  for (const x of [0, 0.5, 1]) {
    const label = svgEl('text', { x: X(x), y: H - 8, class: 'graph__tick', 'text-anchor': x === 0 ? 'start' : x === 1 ? 'end' : 'middle' });
    label.textContent = `${Math.round(x * 100)} %`;
    svg.append(label);
  }
  const dead = e['rates.rcDeadband'];
  if (dead > 0) svg.append(svgEl('rect', { x: X(0), y: pad.t, width: X(dead) - X(0), height: H - pad.t - pad.b, class: 'graph__dead' }));
  curves.forEach((c, i) => {
    let d = '';
    for (let s = 0; s <= 60; s++) {
      const x = s / 60;
      d += `${s ? 'L' : 'M'}${X(x).toFixed(1)},${Y(rateDps(type, c.r, x)).toFixed(1)}`;
    }
    svg.append(svgEl('path', { d, class: `graph__line graph__line--${i}` }));
  });
  const legend = el('ul', { class: 'graph-legend' }, curves.map((c, i) => el('li', { class: `graph-legend__item graph-legend__item--${i}` },
    `${t(`axes.${c.axis}`)} `, el('strong', null, `${Math.round(c.max)} °/s`))));
  const wrap = el('figure', { class: 'graph-wrap', 'data-rate-graph': '' }, svg, el('figcaption', null, t('ui.rateGraph')), legend);
  return wrap;
}

function throttleOut(e, stick) {
  const m = e['pid.throttleMid'];
  const ex = e['pid.throttleExpo'];
  const delta = stick - m;
  const y = delta > 0 ? 1 - m : delta < 0 ? m : 1;
  const shaped = m + delta * (1 - ex + (ex * delta * delta) / (y * y));
  const limit = e['pid.throttleLimitPercent'] / 100;
  const type = Math.round(e['pid.throttleLimitType']);
  const out = type === 1 ? shaped * limit : type === 2 ? Math.min(shaped, limit) : shaped;
  return Math.max(0, Math.min(1, out));
}

function throttleGraph(e) {
  const W = 200;
  const H = 140;
  const pad = { l: 30, r: 8, t: 8, b: 22 };
  const X = (x) => pad.l + x * (W - pad.l - pad.r);
  const Y = (v) => H - pad.b - v * (H - pad.t - pad.b);
  const svg = graphFrame(W, H, t('ui.throttleGraph'), 'data-graph');
  for (const v of [0, 0.5, 1]) {
    svg.append(svgEl('line', { x1: pad.l, x2: W - pad.r, y1: Y(v), y2: Y(v), class: 'graph__grid' }));
    const label = svgEl('text', { x: pad.l - 5, y: Y(v) + 4, class: 'graph__tick', 'text-anchor': 'end' });
    label.textContent = `${v * 100}`;
    svg.append(label);
    const xl = svgEl('text', { x: X(v), y: H - 6, class: 'graph__tick', 'text-anchor': v === 0 ? 'start' : v === 1 ? 'end' : 'middle' });
    xl.textContent = `${v * 100}`;
    svg.append(xl);
  }
  svg.append(svgEl('line', { x1: X(0), y1: Y(0), x2: X(1), y2: Y(1), class: 'graph__ref' }));
  let d = '';
  for (let s = 0; s <= 50; s++) d += `${s ? 'L' : 'M'}${X(s / 50).toFixed(1)},${Y(throttleOut(e, s / 50)).toFixed(1)}`;
  svg.append(svgEl('path', { d, class: 'graph__line graph__line--0' }));
  return el('figure', { class: 'graph-wrap graph-wrap--small', 'data-throttle-graph': '' }, svg, el('figcaption', null, t('ui.throttleGraph')));
}

// ---------------------------------------------------------------------------------------------------------------
// OSD panel

function importedOsdInfo() {
  const osd = state.osd.imported;
  if (!osd) return '';
  try {
    const json = JSON.parse(osd.json);
    const preset = OSD_PRESETS.includes(json.preset) ? t(`osdPresets.${json.preset}`) : String(json.preset || '–');
    const count = json.elements ? Object.keys(json.elements).length : 0;
    return t(count === 1 ? 'ui.osdImportedInfoOne' : 'ui.osdImportedInfo', { preset, count });
  } catch {
    return '';
  }
}

function renderOsd() {
  const panel = $('[data-panel-osd]');
  const include = el('label', { class: 'check check--strong' },
    el('input', { type: 'checkbox', checked: state.layers.osd || null, onchange: (e) => { state.layers.osd = e.target.checked; renderOsd(); renderShare(); scheduleHash(); } }),
    el('span', null, t('ui.osdInclude')));
  const options = el('fieldset', { class: 'osd-options', disabled: state.layers.osd ? null : true },
    el('legend', { class: 'visually-hidden' }, 'OSD'));
  const radio = (value, title, desc) => {
    const id = `osd-${value}`;
    const checked = value === 'imported' ? state.osd.source === 'imported' : state.osd.source === 'preset' && state.osd.preset === value;
    return el('label', { class: `osd-option${checked ? ' is-checked' : ''}`, for: id },
      el('input', {
        type: 'radio', name: 'osd', id, value, checked: checked || null,
        onchange: () => {
          if (value === 'imported') state.osd.source = 'imported';
          else Object.assign(state.osd, { source: 'preset', preset: value });
          renderOsd();
          renderShare();
          scheduleHash();
          $(`#${id}`).focus();
        },
      }),
      el('span', { class: 'osd-option__text' }, el('strong', null, title), el('span', null, desc)),
      value === 'imported' ? null : osdPreview(value));
  };
  if (state.osd.imported) options.append(radio('imported', t('ui.osdImported'), importedOsdInfo()));
  for (const p of OSD_PRESETS) {
    const [en, de, den, dde] = entry(`osdPresets.${p}`);
    options.append(radio(p, lang() === 'de' ? de : en, lang() === 'de' ? dde : den));
  }
  panel.replaceChildren(el('p', { class: 'panel-intro' }, t('ui.osdIntro')), include, options, el('p', { class: 'tune-note' }, t('ui.osdPresetNote')));
}

// Tiny schematic of where each preset puts its elements (30 × 16 grid of the game's OSD, a few marks only).
const OSD_MARKS = {
  minimal: [[1, 1], [1, 2], [28, 2], [1, 14], [28, 14], [15, 3]],
  standard: [[1, 1], [1, 2], [13, 1], [28, 1], [1, 12], [1, 13], [1, 14], [5, 14], [28, 11], [28, 12], [28, 13], [28, 14], [15, 9], [15, 10]],
  full: [[1, 1], [1, 2], [13, 1], [28, 1], [1, 12], [1, 13], [1, 14], [5, 14], [28, 11], [28, 12], [28, 13], [28, 14], [15, 9], [8, 7], [22, 7], [15, 5], [9, 3], [21, 3], [1, 6], [1, 8], [28, 6], [28, 8]],
  race: [[1, 1], [1, 2], [1, 4], [28, 2], [28, 3], [28, 4], [28, 5], [15, 4], [15, 9], [15, 10], [1, 13], [1, 14], [28, 14]],
};

function osdPreview(preset) {
  const svg = svgEl('svg', { viewBox: '0 0 32 18', class: 'osd-preview', 'aria-hidden': 'true' });
  svg.append(svgEl('rect', { x: 0.5, y: 0.5, width: 31, height: 17, rx: 1.5, class: 'osd-preview__screen' }));
  svg.append(svgEl('path', { d: 'M14.5 9h3M16 7.5v3', class: 'osd-preview__cross' }));
  for (const [c, r] of OSD_MARKS[preset]) svg.append(svgEl('rect', { x: c + 0.3, y: r + 0.6, width: 2.4, height: 0.9, class: 'osd-preview__mark' }));
  return svg;
}

// ---------------------------------------------------------------------------------------------------------------
// Share panel

function renderLayers() {
  const box = $('[data-layers]');
  const legend = box.querySelector('legend');
  box.replaceChildren(legend);
  const hasPaint = Object.keys(state.paint).length > 0;
  const hasName = !!state.name.trim();
  const items = [
    ['parts', true, true, ''],
    ['paint', state.layers.paint, hasPaint, hasPaint ? '' : t('ui.layerNoPaint')],
    ['tune', state.layers.tune, true, ''],
    ['osd', state.layers.osd, true, state.layers.osd ? '' : t('ui.layerNoOsd')],
    ['name', state.layers.name, hasName, hasName ? '' : t('ui.layerNoName')],
  ];
  for (const [key, checked, enabled, note] of items) {
    box.append(el('label', { class: `check layer${enabled ? '' : ' is-off'}` },
      el('input', {
        type: 'checkbox', checked: (checked && enabled) || null, disabled: key === 'parts' || !enabled ? true : null,
        onchange: (e) => {
          state.layers[key] = e.target.checked;
          if (key === 'osd') renderOsd();
          renderShare();
          scheduleHash();
          const again = box.querySelector(`[data-layer="${key}"]`);
          if (again) again.focus();
        },
        dataset: { layer: key },
      }),
      el('span', null, t(`ui.layers.${key}`), note ? el('span', { class: 'layer__note' }, ` ${note}`) : null)));
  }
}

function renderShare() {
  renderLayers();
  const { code, error } = currentCode();
  const codeEl = $('[data-code]');
  const meta = $('[data-code-meta]');
  if (!code) {
    codeEl.textContent = '';
    meta.replaceChildren(el('span', { class: 'is-bad' }, t('ui.encodeFailed') + error));
    $('[data-copy-code]').disabled = true;
    $('[data-copy-link]').disabled = true;
    return;
  }
  codeEl.textContent = code;
  const layers = catalog.decode(code).layers.map((l) => t(`ui.layers.${l}`)).join(', ');
  meta.replaceChildren(
    el('span', null, t('ui.codeMeta', { n: code.length, layers })),
    el('span', { class: code.length <= 256 ? 'is-ok' : 'is-warn' }, code.length <= 256 ? t('ui.chatOk') : t('ui.chatLong')));
  $('[data-copy-code]').disabled = false;
  $('[data-copy-link]').disabled = false;
}

function pageUrl() {
  return location.href.split('#')[0];
}

async function copy(text, message) {
  const status = $('[data-copy-status]');
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    const area = el('textarea', { class: 'visually-hidden', readonly: true });
    area.value = text;
    doc.body.append(area);
    area.select();
    try {
      ok = doc.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
  }
  status.textContent = ok ? message : t('ui.copyFailed');
  status.className = `code__flash ${ok ? 'is-ok' : 'is-bad'}`;
  clearTimeout(copy.timer);
  copy.timer = setTimeout(() => { status.textContent = ''; }, 4000);
}

let hashTimer = 0;

function scheduleHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const { code } = currentCode();
    if (!code || code === lastHashCode) return;
    lastHashCode = code;
    history.replaceState(null, '', `#${code}`);
  }, 300);
}

// ---------------------------------------------------------------------------------------------------------------
// Import

/** What a decoded code brings along: [text, bad] per line (layers first). */
function importDetails(result) {
  const layers = result.layers.map((l) => t(`ui.layers.${l}`)).join(', ');
  const lines = [[t('ui.importLayers', { layers }), false]];
  if (result.unknownParts.length) lines.push([t('ui.importUnknown', { ids: result.unknownParts.join(', ') }), true]);
  if (result.wrongKind.length) lines.push([t('ui.wrongKindExplain') + result.wrongKind.join(', '), true]);
  if (result.renamed.length) lines.push([t('ui.importRenamed', { n: result.renamed.length }), false]);
  if (result.skipped.length) lines.push([t('ui.importSkipped', { n: result.skipped.length }), false]);
  return lines;
}

/** Result under the import field. It always describes what is in the field (links report in the banner). */
function importPreview(result) {
  const box = $('[data-import-result]');
  if (!result) {
    box.replaceChildren();
    return;
  }
  if (!result.ok) {
    box.replaceChildren(el('p', { class: 'import__status is-bad' }, catalog.statusText(result.status, lang())));
    return;
  }
  const [[layers], ...rest] = importDetails(result);
  box.replaceChildren(el('p', { class: 'import__status is-ok' }, `${catalog.statusText('OK', lang())} · ${layers}`),
    ...rest.map(([text, bad]) => el('p', { class: `import__line${bad ? ' is-bad' : ''}` }, text)));
}

/** Decoded content of the import field: a code or a whole share link. */
function decodeField(raw) {
  const code = raw.includes('#') ? codeFromHash(raw.slice(raw.indexOf('#'))) || raw : raw;
  return { code, result: catalog.decode(code) };
}

/** Banner for a build opened from a link: what it brought along, or why it could not be read. The import field
    shows an unreadable code so it can be fixed there; after a readable link it is emptied, so nothing stale stays. */
function linkResult(code, result) {
  const input = $('[data-import]');
  if (result.ok) {
    input.value = '';
    importPreview(null);
    const warn = result.unknownParts.length || result.wrongKind.length;
    banner(() => `${t('ui.linkLoaded')} ${importDetails(result).map(([text]) => text).join(' · ')}`, warn ? 'warn' : 'ok', false);
  } else {
    input.value = code;
    importPreview(result);
    banner(() => t('ui.badLink') + catalog.statusText(result.status, lang()), 'bad', false);
  }
}

function applyDecoded(result) {
  const c = result.content;
  state.build = { ...c.build, accessories: { ...(c.build.accessories || {}) } };
  state.paint = c.paint ? { ...c.paint } : {};
  state.tune = c.tune ? { ...c.tune } : {};
  state.name = c.name || '';
  state.layers = {
    paint: true,
    tune: result.layers.includes('tune'),
    osd: result.layers.includes('osd'),
    name: true,
  };
  state.osd = { ...state.osd, imported: c.osd || null, source: c.osd ? 'imported' : 'preset' };
  state.presetId = null;
}

let lastBanner = null;

/** Banner above the panel. message is text or a function giving the text (re-rendered on a language switch). */
function banner(message, level, withUndo) {
  const host = $('[data-banner]');
  host.replaceChildren();
  lastBanner = message ? { message, level, withUndo } : null;
  if (!message) return;
  host.append(el('p', { class: `banner is-${level}` },
    el('span', null, typeof message === 'function' ? message() : message),
    withUndo && undoSnapshot ? el('button', {
      type: 'button', class: 'banner__btn',
      onclick: () => {
        restore(undoSnapshot);
        undoSnapshot = null;
        $('[data-preset]').value = state.presetId || '';
        refreshAll();
        banner('');
      },
    }, t('ui.undo')) : null,
    el('button', { type: 'button', class: 'banner__btn banner__close', 'aria-label': t('ui.dismiss'), onclick: () => banner('') }, '×')));
}

function loadCode(code, source) {
  const result = catalog.decode(code);
  if (!result.ok) return result;
  undoSnapshot = snapshot();
  applyDecoded(result);
  $('[data-preset]').value = '';
  refreshAll();
  lastHashCode = null;
  scheduleHash();
  if (source === 'link') linkResult(code, result);
  else banner(() => t('ui.importLoaded'), result.unknownParts.length || result.wrongKind.length ? 'warn' : 'ok', true);
  return result;
}

// ---------------------------------------------------------------------------------------------------------------
// Presets

function presetSelect() {
  const select = $('[data-preset]');
  const value = select.value;
  select.replaceChildren(el('option', { value: '' }, t('ui.presetPlaceholder')));
  for (const [label, prefix] of [[t('ui.presetGroupPropwash'), 'propwash:'], [t('ui.presetGroupJmp'), 'justmoreparts:']]) {
    const group = el('optgroup', { label });
    for (const p of catalog.presets.filter((x) => x.id.startsWith(prefix))) group.append(el('option', { value: p.id }, catalog.presetName(p.id, lang())));
    select.append(group);
  }
  select.value = state.presetId || value || '';
}

function loadPreset(id, announce) {
  const c = catalog.presetContent(id);
  if (!c) return;
  if (announce) undoSnapshot = snapshot();
  state.build = c.build;
  state.paint = c.paint ? { ...c.paint } : {};
  state.tune = c.tune ? { ...c.tune } : {};
  state.name = '';
  state.presetId = id;
  state.layers = { ...state.layers, paint: true, tune: true, name: true };
  refreshAll();
  scheduleHash();
  if (announce) banner(() => t('ui.presetLoaded', { name: catalog.presetName(id, lang()) }), 'ok', true);
}

// ---------------------------------------------------------------------------------------------------------------
// Build changes and full refresh

let showToken = 0;

async function updateViewerAndPaint() {
  const token = ++showToken;
  const ok = await recomputePaintInfo();
  if (!ok || token !== showToken) return;
  if (state.tab === 'paint') renderPaint();
  if (viewer) {
    viewerName();
    const shown = await viewer.show(state.build, state.paint);
    if (shown && token === showToken) viewerNote(!shown.layout ? t('ui.noFrame') : '');
  }
}

/** Caption of the 3D view: the drone's name, else the preset it still is. */
function viewerName() {
  $('[data-viewer-name]').textContent = state.name.trim() || (state.presetId ? catalog.presetName(state.presetId, lang()) : '');
}

const canonical = (o) => JSON.stringify(Object.keys(o || {}).sort().map((k) => [k, o[k]]));

/** The page names a preset (select and 3D caption) only while parts, paint and tune still match it exactly. */
function syncPreset() {
  if (!state.presetId) return;
  const c = catalog.presetContent(state.presetId);
  const same = c && FIELDS.every((f) => c.build[f] === state.build[f])
    && canonical(c.build.accessories) === canonical(state.build.accessories)
    && canonical(c.paint) === canonical(state.paint)
    && canonical(c.tune) === canonical(state.tune);
  if (same) return;
  state.presetId = null;
  $('[data-preset]').value = '';
  viewerName();
}

function viewerNote(text) {
  const note = $('[data-viewer-fallback]');
  if (viewer) {
    note.textContent = text;
    note.hidden = !text;
  }
}

function setBuild(build, { keepFocus } = {}) {
  state.build = build;
  syncPreset();
  recompute();
  slotRows();
  picker();
  renderStats();
  renderChecks();
  renderTune();
  renderShare();
  scheduleHash();
  updateViewerAndPaint();
  if (keepFocus) {
    const { id, mount } = keepFocus;
    const node = [...doc.querySelectorAll('[role="option"]')].find((o) => o.dataset.id === (id || '') && (!mount || o.dataset.mount === mount));
    if (node) {
      doc.querySelectorAll('[role="option"]').forEach((o) => { o.tabIndex = -1; });
      node.tabIndex = 0;
      node.focus({ preventScroll: true });
    }
  }
}

function refreshAll() {
  recompute();
  $('[data-name]').value = state.name;
  $('[data-name]').placeholder = t('ui.namePlaceholder');
  presetSelect();
  slotRows();
  picker();
  renderStats();
  renderChecks();
  renderTune();
  renderOsd();
  renderShare();
  updateViewerAndPaint();
}

// ---------------------------------------------------------------------------------------------------------------
// Tabs

function selectTab(name, focus) {
  state.tab = name;
  for (const tab of doc.querySelectorAll('[data-tab]')) {
    const on = tab.dataset.tab === name;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    $(`#${tab.getAttribute('aria-controls')}`).hidden = !on;
    if (on && focus) tab.focus();
  }
  if (name === 'paint') renderPaint();
}

function wireTabs() {
  const tabs = [...doc.querySelectorAll('[data-tab]')];
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(tab.dataset.tab, false));
    tab.addEventListener('keydown', (e) => {
      let j = null;
      if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = tabs.length - 1;
      if (j === null) return;
      e.preventDefault();
      selectTab(tabs[j].dataset.tab, true);
    });
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Viewer

async function startViewer() {
  const host = $('[data-viewer-canvas]');
  const fallback = $('[data-viewer-fallback]');
  const button = $('[data-autorotate]');
  let mod;
  try {
    mod = await import('./viewer.js');
  } catch {
    fallback.textContent = t('ui.viewerFailed');
    fallback.hidden = false;
    return;
  }
  if (!mod.webglAvailable()) {
    fallback.textContent = t('ui.noWebgl');
    fallback.hidden = false;
    $('[data-viewer]').classList.add('is-fallback');
    return;
  }
  const paused = root.classList.contains('motion-paused');
  try {
    viewer = mod.createViewer(host, { catalog, render, loadModel, autoRotate: !reducedMotion && !paused, reducedMotion });
  } catch {
    fallback.textContent = t('ui.viewerFailed');
    fallback.hidden = false;
    return;
  }
  viewer.canvas.setAttribute('role', 'img');
  viewer.canvas.setAttribute('aria-label', t('ui.viewerLabel'));
  button.setAttribute('aria-pressed', String(viewer.autoRotate()));
  button.addEventListener('click', () => {
    viewer.setAutoRotate(!viewer.autoRotate());
    button.setAttribute('aria-pressed', String(viewer.autoRotate()));
  });
  $('[data-reset-view]').addEventListener('click', () => viewer.resetView());
  viewer.canvas.addEventListener('pointerdown', () => {
    if (viewer.autoRotate()) {
      viewer.setAutoRotate(false);
      button.setAttribute('aria-pressed', 'false');
    }
  });
  viewerName();
  const shown = await viewer.show(state.build, state.paint);
  if (shown) viewerNote(!shown.layout ? t('ui.noFrame') : '');
}

// ---------------------------------------------------------------------------------------------------------------
// Boot

async function boot() {
  const cfg = $('[data-cfg]');
  try {
    const [c, r] = await Promise.all([
      loadCatalog(),
      fetch(RENDER_URL, { credentials: 'same-origin' }).then((res) => {
        if (!res.ok) throw new Error(`render.json: HTTP ${res.status}`);
        return res.json();
      }),
    ]);
    catalog = c;
    render = r;
  } catch {
    $('[data-loading]').textContent = t('ui.loadFailed');
    return;
  }
  computeRoles();

  const panel = $('[data-panel]');
  panel.prepend(el('div', { class: 'banner-host', 'data-banner': '', 'aria-live': 'polite' }));

  let fromLink = null;
  const hashCode = codeFromHash(location.hash);
  if (hashCode) {
    fromLink = catalog.decode(hashCode);
    if (fromLink.ok) applyDecoded(fromLink);
  }
  if (!state.build) {
    const p = catalog.presetContent(DEFAULT_PRESET) ? DEFAULT_PRESET : catalog.presets[0].id;
    const c = catalog.presetContent(p);
    state.build = c.build;
    state.paint = c.paint ? { ...c.paint } : {};
    state.tune = c.tune ? { ...c.tune } : {};
    state.presetId = p;
  }

  $('[data-loading]').remove();
  $('[data-stage]').hidden = false;
  panel.hidden = false;
  cfg.setAttribute('aria-busy', 'false');

  wireTabs();
  wireEvents();
  refreshAll();
  if (fromLink) {
    if (fromLink.ok) lastHashCode = hashCode;
    linkResult(hashCode, fromLink);
  }
  startViewer();
}

function wireEvents() {
  $('[data-preset]').addEventListener('change', (e) => {
    if (e.target.value) loadPreset(e.target.value, true);
  });
  $('[data-goto-import]').addEventListener('click', (e) => {
    e.preventDefault();
    const input = $('[data-import]');
    input.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    input.focus({ preventScroll: true });
  });
  $('[data-name]').addEventListener('input', (e) => {
    state.name = e.target.value;
    viewerName();
    renderShare();
    scheduleHash();
  });
  const tunePanel = $('[data-panel-tune]');
  tunePanel.addEventListener('input', (e) => {
    if (e.target.matches('.tune-num')) onTuneInput(e.target, false);
  });
  tunePanel.addEventListener('change', (e) => {
    if (e.target.dataset.key) onTuneInput(e.target, true);
  });
  tunePanel.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-reset]');
    if (btn) resetTuneKey(btn.dataset.reset);
  });
  $('[data-copy-code]').addEventListener('click', () => {
    const { code } = currentCode();
    if (code) copy(code, t('ui.copied'));
  });
  $('[data-copy-link]').addEventListener('click', () => {
    const { code } = currentCode();
    if (code) copy(shareLink(code, pageUrl()), t('ui.linkCopied'));
  });
  const input = $('[data-import]');
  let importTimer = 0;
  const tryImport = () => {
    const raw = input.value.trim();
    if (!raw) {
      importPreview(null);
      return;
    }
    const { code, result } = decodeField(raw);
    importPreview(result);
    if (result.ok) {
      let again = null;
      try {
        again = catalog.encode(result.content);
      } catch {
        again = null;
      }
      if (again === null || again !== currentCode().code) loadCode(code, 'paste');
    }
  };
  input.addEventListener('input', () => {
    clearTimeout(importTimer);
    importTimer = setTimeout(tryImport, 250);
  });
  input.addEventListener('paste', () => setTimeout(tryImport, 0));
  window.addEventListener('hashchange', () => {
    const code = codeFromHash(location.hash);
    if (!code || code === lastHashCode) return;
    lastHashCode = code;
    const result = loadCode(code, 'link');
    if (!result.ok) linkResult(code, result);
  });
  doc.addEventListener('propwash:lang', () => {
    if (!catalog) return;
    if (viewer) viewer.canvas.setAttribute('aria-label', t('ui.viewerLabel'));
    refreshAll();
    if (state.tab === 'paint') renderPaint();
    const raw = $('[data-import]').value.trim();
    importPreview(raw ? decodeField(raw).result : null);
    if (lastBanner) banner(lastBanner.message, lastBanner.level, lastBanner.withUndo);
  });
  window.addEventListener('scroll', hideTip, { passive: true });
  if (window.ResizeObserver) new ResizeObserver(checksScroll).observe($('[data-checks]'));
  else window.addEventListener('resize', checksScroll);
}

boot();
