// Page /convert/: paste any text (a whole Discord post) and every PW1, PW2 and PWD1 code in it becomes PW3 in place,
// links included; PW3 codes are only checked. The same modules as the configurator (catalog, share codes, convert.js), no 3D
// view. Everything runs in the browser; the only request goes to this site's catalog.

import { loadCatalog } from './data.js?v=29d694bf';
import { convertText, reasonText, addonNote, MAX_CODES } from './convert.js?v=031da610';
import { displayId } from './sharecode.js?v=024bd980';
import { t, lang, tr, loadTexts, pageHref } from './i18n.js?v=582a6e40';

const doc = document;
const $ = (sel, ctx = doc) => ctx.querySelector(sel);

/** Small DOM builder: text is always set as text, never as markup (the codes and names come from pasted text). */
function el(tag, attrs, ...children) {
  const node = doc.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
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

let catalog = null;
let last = null;

async function copy(text, message) {
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
  const status = $('[data-cv-flash]');
  status.textContent = ok ? message : t('ui.copyFailed');
  status.className = `cv__flash ${ok ? 'is-ok' : 'is-bad'}`;
  clearTimeout(copy.timer);
  copy.timer = setTimeout(() => { status.textContent = ''; }, 4000);
}

/** Add-ons of a PW3 code this page cannot match, as lines with safe links (Modrinth/CurseForge only). */
function addonLines(r) {
  const out = [];
  for (const report of r.missing) {
    const note = addonNote(report, catalog, lang(), pageHref('addons/'));
    if (!note) continue;
    const line = el('p', { class: 'cv-code__note' }, note.text,
      ...note.links.flatMap(([label, href]) => [' ', el('a', { href, target: '_blank', rel: 'noopener noreferrer' }, label)]));
    if (note.free) line.append(' ', el('span', { class: 'addon-line__free' }, note.free));
    out.push(line);
  }
  return out;
}

function codeItem(r, index) {
  const title = r.name || t('convert.unnamed');
  const frame = r.frame ? (catalog.part(r.frame) ? catalog.shortName(r.frame, lang()) : displayId(r.frame)) : null;
  const meta = [r.role ? t(`roles.${r.role}`) : null, frame || (r.kind !== 'damaged' ? t('convert.unknownFrame') : null),
    r.count > 1 ? t('convert.times', { n: r.count }) : null].filter(Boolean).join(' · ');
  const item = el('li', { class: `cv-code is-${r.kind}` },
    el('div', { class: 'cv-code__head' },
      el('span', { class: 'cv-code__badge' }, t(`convert.status.${r.kind}`)),
      el('span', { class: 'cv-code__name' }, title),
      meta ? el('span', { class: 'cv-code__meta' }, meta) : null),
    el('p', { class: 'cv-code__row' }, el('span', { class: 'cv-code__label' }, t('convert.old')), el('span', { class: 'cv-code__text mono' }, r.from)));
  if (r.code && r.kind !== 'damaged') {
    item.append(el('p', { class: 'cv-code__row cv-code__row--new' },
      el('span', { class: 'cv-code__label' }, t('convert.code')),
      el('span', { class: 'cv-code__text mono' }, r.code)));
    item.append(el('div', { class: 'cv-code__actions' },
      el('button', { type: 'button', class: 'btn btn--primary btn--small', 'aria-label': t('convert.copyLabel', { n: index + 1 }), onclick: () => copy(r.code, t('convert.pw3Copied')) },
        t('convert.copy')),
      el('a', { class: 'btn btn--ghost btn--small', href: `${pageHref('configurator/')}#${r.code}` }, t('convert.open'))));
  }
  if (r.kind === 'not_convertible') item.append(el('p', { class: 'cv-code__note is-bad' }, t('convert.notConvertible', { reason: reasonText(r.reason) })));
  else if (r.kind === 'damaged') item.append(el('p', { class: 'cv-code__note is-bad' }, tr(catalog.statusText(r.status, lang()))));
  if (r.creative) item.append(el('p', { class: 'cv-code__note' }, t('ui.importCreative', r.creative)));
  if (r.unknown.length) item.append(el('p', { class: 'cv-code__note is-bad' }, t('ui.importUnknown', { ids: r.unknown.map(displayId).join(', ') })));
  item.append(...addonLines(r));
  return item;
}

function show() {
  const input = $('[data-cv-input]');
  const status = $('[data-cv-status]');
  const output = $('[data-cv-output]');
  const list = $('[data-cv-list]');
  const text = input.value;
  if (!catalog || !text.trim()) {
    last = null;
    status.textContent = '';
    output.hidden = true;
    list.hidden = true;
    return;
  }
  last = convertText(text, catalog);
  const { codes, found, skipped } = last;
  if (!found) {
    status.textContent = t('convert.none');
    status.className = 'cv__status is-warn';
    output.hidden = true;
    list.hidden = true;
    return;
  }
  const count = (kind) => codes.filter((c) => c.kind === kind).reduce((n, c) => n + c.count, 0);
  const handled = Math.min(found, MAX_CODES);
  const converted = count('converted');
  const pw3 = count('pw3');
  status.textContent = handled === 1 ? `${t('convert.summaryOne')} ${t(`convert.status.${codes[0].kind}`)}.`
    : t('convert.summary', { n: handled, converted, pw3, problems: handled - converted - pw3 });
  if (skipped) status.textContent += ` ${t('convert.tooMany', { max: MAX_CODES, rest: skipped })}`;
  status.className = `cv__status ${handled - converted - pw3 || skipped ? 'is-warn' : 'is-ok'}`;
  $('[data-cv-result]').value = last.text;
  output.hidden = false;
  $('[data-cv-codes]').replaceChildren(...codes.map(codeItem));
  list.hidden = false;
}

async function boot() {
  const input = $('[data-cv-input]');
  let timer = 0;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(show, 200);
  });
  $('[data-cv-copy-all]').addEventListener('click', () => {
    if (last) copy(last.text, t('convert.copiedAll'));
  });
  doc.addEventListener('propwash:lang', show);
  try {
    [catalog] = await Promise.all([loadCatalog(), loadTexts()]);
  } catch {
    const status = $('[data-cv-status]');
    status.textContent = t('convert.loadFailed');
    status.className = 'cv__status is-bad';
    return;
  }
  $('[data-cv]').setAttribute('aria-busy', 'false');
  show();
}

boot();
