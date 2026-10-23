// The add-on bar of the configurator (website design 0.6.0, 3.5.4 and 3.5.5): the official add-ons of the directory
// with a switch each, and "Open add-on jar" (file dialog or drag and drop) for any other add-on. A jar is read only
// in this tab (addon-catalog.js): nothing is uploaded, stored or executed, and a reload forgets it. Every text from a
// jar is set as text, never as HTML.
//
//   mountAddonBar({ host, before, base, render, apply })   // ui.js, once the catalog is loaded
//   localModel(id)                                         // the model file of a part from a jar, or null
//   openJarPicker()                                        // the file dialog (from the "needs add-on" line)
//
// apply(catalogJson, renderJson, { reason }) gets the composed catalog whenever an add-on comes, goes or is switched.

import { readAddon } from '../configurator/addon-catalog.js?v=486b5c3a';
import { JAR_LIMITS } from '../configurator/jar.js?v=01790790';
import { composeCatalog, composeRender } from '../configurator/data.js?v=b9037dd0';
import { t, lang, num } from '../configurator/i18n.js?v=06e639ed';

const MiB = 1024 * 1024;
const local = [];
const off = new Set();
let ctx = null;
let counter = 0;

/** The model file of a part read from a jar (switched on), or null. */
export function localModel(id) {
  for (const entry of local) if (entry.on && entry.addon.models.has(id)) return entry.addon.models.get(id);
  return null;
}

/** Opens the file dialog of the add-on bar. */
export function openJarPicker() {
  if (ctx && ctx.input) ctx.input.click();
}

/** The add-ons the bar shows: [{namespace, name, version, parts, source, on, removable, key}]. */
export function addonRows() {
  if (!ctx) return [];
  const replaced = new Set(local.map((l) => l.addon.mod.id));
  const rows = [];
  for (const n of ctx.base.namespaces || []) {
    if (n.namespace === 'propwash' || replaced.has(n.namespace)) continue;
    rows.push({
      key: n.namespace, namespace: n.namespace, name: n.name, version: n.version, source: 'directory', on: !off.has(n.namespace), removable: false,
      parts: ctx.base.parts.filter((p) => p.id.startsWith(`${n.namespace}:`)).length,
    });
  }
  for (const l of local) {
    rows.push({
      key: l.key, namespace: l.addon.mod.id, name: l.addon.mod.name, version: l.addon.mod.version, source: 'local', on: l.on, removable: true,
      parts: l.addon.fragment.parts.length,
    });
  }
  return rows;
}

function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** The composed catalog and render data for the current switches. */
function composed() {
  const active = local.filter((l) => l.on);
  const fragments = active.map((l) => l.addon.fragment);
  const offList = [...off, ...local.filter((l) => !l.on).map((l) => l.addon.mod.id).filter((ns) => !active.some((a) => a.addon.mod.id === ns))];
  const json = composeCatalog(ctx.base, { fragments, off: offList });
  const render = composeRender(ctx.render, {
    renders: active.map((l) => l.addon.render), off: offList, replaced: active.map((l) => l.addon.mod.id),
  });
  return { json, render };
}

function update(reason) {
  const { json, render } = composed();
  ctx.apply(json, render, { reason });
  draw();
}

const mb = (bytes) => num(bytes / MiB, bytes / MiB < 10 ? 1 : 0);

/** The sentence of a problem of addon-catalog.js / jar.js. */
export function problemText(p) {
  const a = { ...p.args };
  if (a.limit != null && /too_big$|total_too_big|entry_too_big/.test(p.code)) a.limit = mb(a.limit);
  if (a.bytes != null) a.size = mb(a.bytes);
  const text = t(`addons.problems.${p.code}`, Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v == null ? '' : String(v)])));
  return text === `addons.problems.${p.code}` ? p.code : text;
}

function messages(list) {
  ctx.messages.replaceChildren(...list.map(([level, text]) => el('li', { class: `addon-bar__message addon-bar__message--${level}` }, text)));
}

function draw() {
  const rows = addonRows();
  ctx.list.replaceChildren(...rows.map((r) => {
    const label = t('addons.switchLabel', { name: r.name });
    const parts = t(r.parts === 1 ? 'addons.partsOne' : 'addons.parts', { n: r.parts });
    const item = el('li', { class: 'addon-bar__item', 'data-addon-item': r.namespace, 'data-addon-source': r.source },
      el('span', { class: 'addon-bar__name' }, r.name),
      el('span', { class: 'addon-bar__meta' },
        el('span', null, [r.version, parts].filter(Boolean).join(' · ')),
        el('span', { class: `addon-bar__source addon-bar__source--${r.source}` }, t(`addons.source.${r.source}`))),
      el('span', { class: 'addon-bar__controls' },
        el('button', {
          type: 'button', class: 'addon-bar__switch', role: 'switch', 'aria-checked': String(r.on), 'aria-label': label, title: label,
          'data-addon-switch': r.key,
          onclick: () => toggle(r),
        }, r.on ? t('addons.on') : t('addons.off')),
        r.removable ? el('button', {
          type: 'button', class: 'addon-bar__remove', 'aria-label': t('addons.removeLabel', { name: r.name }), 'data-addon-remove': r.key,
          onclick: () => remove(r.key),
        }, t('addons.remove')) : null));
    return item;
  }));
  ctx.list.hidden = !rows.length;
  ctx.openButton.lastChild.textContent = t('addons.open');
  ctx.hint.textContent = t('addons.local');
  ctx.title.textContent = t('addons.title');
  ctx.link.textContent = t('addons.directory');
  if (ctx.lastMessages) messages(ctx.lastMessages());
}

function toggle(row) {
  if (row.source === 'directory') {
    if (off.has(row.namespace)) off.delete(row.namespace);
    else off.add(row.namespace);
  } else {
    const entry = local.find((l) => l.key === row.key);
    if (entry) entry.on = !entry.on;
  }
  ctx.lastMessages = null;
  messages([]);
  update('switch');
}

function remove(key) {
  const i = local.findIndex((l) => l.key === key);
  if (i < 0) return;
  local.splice(i, 1);
  ctx.lastMessages = null;
  messages([]);
  update('remove');
}

/** Reads a dropped or chosen file; resolves to the result of readAddon. */
export async function loadJarFile(file) {
  const name = file.name || 'add-on.jar';
  if (file.size > JAR_LIMITS.jarBytes) {
    const problems = [{ level: 'error', code: 'jar.too_big', args: { bytes: file.size, limit: JAR_LIMITS.jarBytes } }];
    show(name, { ok: false, problems });
    return { ok: false, problems };
  }
  ctx.lastMessages = () => [['busy', t('addons.reading', { file: name })]];
  messages(ctx.lastMessages());
  ctx.root.setAttribute('aria-busy', 'true');
  await new Promise((r) => setTimeout(r, 30));
  let addon;
  try {
    addon = readAddon(new Uint8Array(await file.arrayBuffer()), { base: ctx.base, fileName: name });
  } catch {
    addon = { ok: false, problems: [{ level: 'error', code: 'jar.broken', args: {} }] };
  }
  ctx.root.removeAttribute('aria-busy');
  if (addon.ok) {
    const before = local.findIndex((l) => l.addon.mod.id === addon.mod.id);
    if (before >= 0) local.splice(before, 1);
    local.push({ key: `local-${++counter}`, addon, on: true });
    off.delete(addon.mod.id);
    update('jar');
  }
  show(name, addon);
  return addon;
}

function show(name, addon) {
  ctx.lastMessages = () => {
    const out = [];
    if (addon.ok) {
      const n = addon.fragment.parts.length;
      out.push(['info', t(n === 1 ? 'addons.loadedOne' : 'addons.loaded', { name: addon.mod.name, version: addon.mod.version || '', file: name, n })]);
    } else {
      out.push(['error', t('addons.failed', { file: name })]);
    }
    for (const p of addon.problems || []) out.push([p.level === 'info' ? 'info' : p.level, problemText(p)]);
    return out;
  };
  messages(ctx.lastMessages());
}

function wireDrop(target) {
  const has = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  target.addEventListener('dragover', (e) => {
    if (!has(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    ctx.root.classList.add('is-dragging');
  });
  target.addEventListener('dragleave', (e) => {
    if (e.target === target || !target.contains(e.relatedTarget)) ctx.root.classList.remove('is-dragging');
  });
  target.addEventListener('drop', (e) => {
    if (!has(e)) return;
    e.preventDefault();
    ctx.root.classList.remove('is-dragging');
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) loadJarFile(file);
  });
}

/**
 * Puts the bar into the page. options: host (the parts panel), before (the element the bar goes in front of), base
 * (catalog.json as loaded), render (render.json as loaded), apply(json, render, info), directoryUrl.
 */
export function mountAddonBar(options) {
  ctx = { ...options, lastMessages: null };
  const input = el('input', { type: 'file', accept: '.jar,.zip,application/java-archive,application/zip', class: 'addon-bar__file', tabindex: '-1', 'aria-hidden': 'true', 'data-addon-file': '' });
  const openButton = el('button', { type: 'button', class: 'btn btn--ghost btn--small', 'data-addon-open': '', onclick: () => input.click() },
    el('span', null, t('addons.open')));
  const title = el('h3', { class: 'addon-bar__title', id: 'addon-bar-title' }, t('addons.title'));
  const link = el('a', { href: options.directoryUrl || '../addons/' }, t('addons.directory'));
  const hint = el('span', { class: 'addon-bar__local', id: 'addon-bar-local' }, t('addons.local'));
  openButton.setAttribute('aria-describedby', 'addon-bar-local');
  const list = el('ul', { class: 'addon-bar__list', 'data-addon-list': '' });
  const box = el('ul', { class: 'addon-bar__messages', 'aria-live': 'polite', 'data-addon-messages': '' });
  const root = el('section', { class: 'addon-bar', id: 'addons', 'aria-labelledby': 'addon-bar-title', 'data-addon-bar': '' },
    el('div', { class: 'addon-bar__head' }, title, link),
    list,
    el('div', { class: 'addon-bar__open' }, openButton, input, hint),
    box);
  Object.assign(ctx, { input, openButton, title, link, hint, list, messages: box, root });
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (file) loadJarFile(file).finally(() => { input.value = ''; });
  });
  options.host.insertBefore(root, options.before || options.host.firstChild);
  wireDrop(root);
  if (options.host !== root) wireDrop(options.host);
  document.addEventListener('propwash:lang', draw);
  draw();
  const wanted = new URLSearchParams(location.search).get('addon');
  if (wanted) {
    const row = addonRows().find((r) => r.namespace === wanted);
    if (row) {
      if (!row.on) toggle(row);
      ctx.lastMessages = () => [['info', t('addons.shown', { name: row.name })]];
      messages(ctx.lastMessages());
      root.scrollIntoView({ block: 'start' });
    }
  }
  return { draw, rows: addonRows, load: loadJarFile, lang };
}
