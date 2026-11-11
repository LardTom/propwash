// The drone editor of a creative drone in the configurator (tab “Drone Editor”, like CreativeEditorTab of Propwash
// 0.6.0): key figures and notes (CreativeCheck and the workbench's), templates (installed parts, every preset), the
// base parts, the values in the mod's groups (own values highlighted, automatic values marked “(auto)”, back to the
// base or automatic value with ↺ or a right-click, clamped to the mod's ranges with a note) and the camera uptilt
// 0–80°. The page (ui.js) owns the state; the editor reads it through ctx and hands every change back:
//
//   const editor = creativeEditor({ el, icon, catalog, build, creative, analysis, camera, tune, presets,
//                                   setCreative(spec), setUptilt(degrees), openTune() });
//   editor.wire(panel)     // the panel's events, once
//   editor.render(panel)   // builds the panel (a new build, the language)
//   editor.update()        // values, marks, figures and notes in place (keeps the focus)

import {
  PARAMS, GROUPS, BASE_KINDS, ARMS, param as paramOf, isAuto, isToggle, value as valueOf, baseOf, setValue, setBase, basePart,
  load, templateOf, check, spec as specOf, without, partKey,
} from './creative.js?v=6f4b7497';
import { t, num, lang, NB, entry } from './i18n.js?v=530a1534';
import { CAMERA_UPTILT, droneUptilt } from './fpv.js?v=76cdbbe6';

const FIGURES = ['mass_grams', 'thrust_to_weight', 'hover_throttle_percent', 'top_speed_kmh', 'mixed_flight_time_min', 'full_throttle_current_a'];
const ARM_NAMES = ['front_left', 'front_right', 'rear_left', 'rear_right'];
const AXES = ['forward', 'right', 'up'];
const idOf = (key) => `ce-${key.replace(/[^a-z0-9]+/gi, '-')}`;
const nameOf = (p) => t(`creative.param.${p.key}`);
/** The value as the input shows it: the parameter's decimals, no trailing zeros (input type=number). */
const shown = (p, v) => (Number.isFinite(v) ? String(Number(v.toFixed(p.decimals))) : '');
const withUnit = (p, v) => `${num(v, p.decimals)}${p.unit ? `${NB}${p.unit}` : ''}`;

export function creativeEditor(ctx) {
  const { el, icon } = ctx;
  let panel = null;
  let statusTimer = 0;
  // Inputs being typed in: update() leaves them alone until their change is committed.
  const typing = new Set();

  const current = () => specOf(ctx.creative());

  function flash(text, level = 'ok', key = null) {
    if (!panel) return;
    const status = panel.querySelector('[data-ce-status]');
    status.textContent = text;
    status.className = `ce-status is-${level}`;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      status.textContent = '';
      status.className = 'ce-status';
    }, 6000);
    for (const note of panel.querySelectorAll('[data-ce-note]')) note.textContent = note.dataset.ceNote === key ? text : '';
  }

  function commit(key, requested) {
    const p = paramOf(key);
    if (!p || !Number.isFinite(requested)) return;
    const { spec, note } = setValue(ctx.build(), current(), p, requested, ctx.catalog());
    ctx.setCreative(spec);
    if (note) flash(t('creative.clamped', { name: nameOf(p), value: withUnit(p, note.applied) }), 'warn', key);
    else flash('', 'ok');
  }

  function reset(key) {
    if (key === CAMERA_UPTILT) {
      const view = ctx.camera();
      if (view) ctx.setUptilt(view.rig.range.standard);
      return;
    }
    const s = current();
    if (key.startsWith('base:')) {
      ctx.setCreative(setBase(ctx.build(), s, key.slice(5), null, ctx.catalog()));
      return;
    }
    const p = paramOf(key);
    if (p && key in s.values) ctx.setCreative(without(s, [p]));
  }

  function tooltip(p) {
    return [t(`creative.tip.${p.key}`), t('creative.range', { min: num(p.min, p.decimals), max: num(p.max, p.decimals), unit: p.unit }).trim(),
      isAuto(p) ? t('creative.fromAuto') : t('creative.fromBase')].join('\n');
  }

  function resetButton(key, label) {
    return el('button', {
      type: 'button', class: 'icon-btn icon-btn--small tune__reset', disabled: true, dataset: { ceReset: key },
      'aria-label': t('creative.reset', { name: label }), title: t('creative.reset', { name: label }),
    }, icon('i-reset'));
  }

  /** A number field with its step buttons: − [value unit] +. */
  function numberField(key, p, label, describedBy, { min = p.min, max = p.max, step = p.step, steps = true } = {}) {
    const id = idOf(key);
    const input = el('input', {
      id, type: 'number', class: 'field__control', inputmode: 'decimal', min: String(min), max: String(max), step: String(step),
      dataset: { ceKey: key }, 'aria-describedby': describedBy || null,
    });
    const unit = p.unit ? el('span', { class: 'tune__unit', 'aria-hidden': 'true' }, p.unit) : null;
    const box = el('span', { class: `tune__input${unit ? ' has-unit' : ''}` }, input, unit);
    if (!steps) return box;
    const stepButton = (dir) => el('button', {
      type: 'button', class: 'ce-step', tabindex: '-1', dataset: { ceStep: String(dir), ceFor: key },
      'aria-label': t(dir < 0 ? 'creative.less' : 'creative.more', { name: label }),
    }, dir < 0 ? '−' : '+');
    return el('span', { class: 'ce-field' }, stepButton(-1), box, stepButton(1));
  }

  function paramRow(p) {
    const id = idOf(p.key);
    const desc = `${id}-desc`;
    const label = el('label', { for: id, class: 'tune__label', title: tooltip(p) },
      el('span', { class: 'ce-name' }, nameOf(p)), el('span', { class: 'ce-auto', hidden: true }, ' (auto)'),
      el('span', { class: 'tune__mark', hidden: true, title: t('creative.own') }, el('span', { class: 'visually-hidden' }, ` (${t('creative.own')})`)));
    const control = isToggle(p)
      ? el('span', { class: 'tune__input ce-toggle' }, el('input', { id, type: 'checkbox', class: 'tune-check', dataset: { ceKey: p.key }, 'aria-describedby': desc }))
      : numberField(p.key, p, nameOf(p), desc);
    return el('div', { class: 'tune ce-param', dataset: { ceRow: p.key } },
      label, control, resetButton(p.key, nameOf(p)),
      el('p', { class: 'ce-param__note', dataset: { ceNote: p.key }, 'aria-hidden': 'true' }),
      el('span', { id: desc, class: 'visually-hidden', dataset: { ceDesc: p.key } }, tooltip(p)));
  }

  function uptiltRow() {
    const p = { key: CAMERA_UPTILT, unit: '°', decimals: 0, min: 0, max: 80, step: 1 };
    const id = idOf(CAMERA_UPTILT);
    const label = t('creative.uptilt');
    return el('div', { class: 'tune ce-param', dataset: { ceRow: CAMERA_UPTILT } },
      el('label', { for: id, class: 'tune__label', title: t('creative.uptiltTip') }, el('span', { class: 'ce-name' }, label),
        el('span', { class: 'tune__mark', hidden: true, title: t('creative.own') }, el('span', { class: 'visually-hidden' }, ` (${t('creative.own')})`))),
      numberField(CAMERA_UPTILT, p, label, `${id}-desc`),
      resetButton(CAMERA_UPTILT, label),
      el('p', { class: 'ce-param__note', dataset: { ceNote: CAMERA_UPTILT }, 'aria-hidden': 'true' }),
      el('span', { id: `${id}-desc`, class: 'visually-hidden' }, t('creative.uptiltTip')));
  }

  function armsTable() {
    const table = el('div', { class: 'tune-table ce-arms', role: 'group', 'aria-label': t('creative.armsTitle') });
    table.append(el('p', { class: 'ce-arms__title' }, t('creative.armsTitle')),
      el('div', { class: 'tune-table__head', 'aria-hidden': 'true' }, el('span'), ...AXES.map((a) => el('span', null, t(`creative.axis.${a}`)))));
    ARM_NAMES.forEach((arm, i) => {
      const cells = AXES.map((axis, k) => {
        const p = ARMS[i * 3 + k];
        const id = idOf(p.key);
        return el('div', { class: 'tune ce-param ce-arm', dataset: { ceRow: p.key } },
          el('label', { for: id, class: 'tune__label', title: tooltip(p) }, nameOf(p)),
          numberField(p.key, p, nameOf(p), `${id}-desc`, { steps: false }),
          resetButton(p.key, nameOf(p)),
          el('span', { id: `${id}-desc`, class: 'visually-hidden', dataset: { ceDesc: p.key } }, tooltip(p)));
      });
      table.append(el('div', { class: 'tune-table__row' }, el('span', { class: 'tune-table__axis' }, t(`creative.arm.${arm}`)), ...cells));
    });
    table.append(el('p', { class: 'ce-param__note', dataset: { ceNote: 'arms' }, 'aria-hidden': 'true' }));
    return table;
  }

  function baseRow(kind) {
    const id = `ce-base-${kind}`;
    const build = ctx.build();
    const catalog = ctx.catalog();
    const select = el('select', { id, class: 'field__control', dataset: { ceBase: kind } },
      el('option', { value: '' }, t('creative.base.installed', { name: catalog.partName(build[kind], lang()) })),
      catalog.partsIn(kind).map((part) => el('option', { value: partKey(part.id) }, catalog.partName(part.id, lang()))));
    return el('div', { class: 'tune ce-param ce-base', dataset: { ceRow: `base:${kind}` } },
      el('label', { for: id, class: 'tune__label', title: t('creative.base.tip') }, el('span', { class: 'ce-name' }, t(`creative.base.${kind}`)),
        el('span', { class: 'tune__mark', hidden: true, title: t('creative.own') }, el('span', { class: 'visually-hidden' }, ` (${t('creative.own')})`))),
      el('span', { class: 'tune__input' }, select),
      resetButton(`base:${kind}`, t(`creative.base.${kind}`)));
  }

  function templates() {
    const select = el('select', { id: 'ce-template', class: 'field__control', dataset: { ceTemplate: '' } },
      el('option', { value: '' }, t('creative.template.installed')));
    for (const group of ctx.presets()) {
      select.append(el('optgroup', { label: group.label }, group.presets.map((p) => el('option', { value: p.id }, p.name))));
    }
    return el('fieldset', { class: 'tune-group ce-templates' }, el('legend', null, t('creative.section.template')),
      el('div', { class: 'ce-template' },
        el('label', { for: 'ce-template', class: 'tune__label' }, t('creative.template.choice')),
        select,
        el('button', { type: 'button', class: 'btn btn--primary btn--small', dataset: { ceLoad: '' } }, t('creative.template.load'))),
      el('p', { class: 'tune-note' }, t('creative.template.tip')),
      el('button', { type: 'button', class: 'btn btn--ghost btn--small ce-reset-all', dataset: { ceResetAll: '' } }, t('creative.template.resetAll')));
  }

  function render(host) {
    panel = host;
    typing.clear();
    const groups = GROUPS.map((group) => {
      const box = el('fieldset', { class: `tune-group ce-group ce-group--${group}` }, el('legend', null, t(`creative.group.${group}`)));
      if (group === 'camera') box.append(uptiltRow());
      for (const p of PARAMS) if (p.group === group && !ARMS.includes(p)) box.append(paramRow(p));
      if (group === 'geometry') box.append(armsTable());
      return box;
    });
    host.replaceChildren(
      el('p', { class: 'panel-intro' }, t('creative.intro')),
      el('p', { class: 'cfg-note ce-rules' }, t('creative.note')),
      el('p', { class: 'ce-status', role: 'status', 'aria-live': 'polite', dataset: { ceStatus: '' } }),
      el('div', { class: 'tune-groups' },
        el('fieldset', { class: 'tune-group ce-figures' }, el('legend', null, t('creative.section.stats')),
          el('dl', { class: 'ce-figures__list', dataset: { ceFigures: '' } }),
          el('p', { class: 'ce-figures__title' }, t('creative.section.notes')),
          el('ul', { class: 'ce-notes', dataset: { ceNotes: '' } })),
        templates(),
        el('fieldset', { class: 'tune-group' }, el('legend', null, t('creative.section.base')),
          el('p', { class: 'tune-note' }, t('creative.base.tip')), ...BASE_KINDS.map(baseRow)),
        ...groups,
        el('fieldset', { class: 'tune-group' }, el('legend', null, t('creative.section.flight')),
          el('p', { class: 'tune-note' }, t('creative.flightHint')),
          el('button', { type: 'button', class: 'btn btn--ghost btn--small ce-open-tune', dataset: { ceTune: '' } }, t('creative.openTune')))),
      el('p', { class: 'tune-note ce-hint' }, t('creative.resetHint')));
    update();
  }

  function setInput(input, text) {
    if (typing.has(input) || input.value === text) return;
    input.value = text;
  }

  function update() {
    if (!panel || !panel.isConnected) return;
    const build = ctx.build();
    const catalog = ctx.catalog();
    const s = current();
    for (const p of PARAMS) {
      const row = panel.querySelector(`[data-ce-row="${p.key}"]`);
      if (!row) continue;
      const own = p.key in s.values;
      const v = valueOf(build, s, p, catalog);
      const base = own ? baseOf(build, s, p, catalog) : v;
      row.classList.toggle('is-changed', own);
      const auto = row.querySelector('.ce-auto');
      if (auto) auto.hidden = !(isAuto(p) && !own);
      const mark = row.querySelector('.tune__mark');
      if (mark) mark.hidden = !own;
      const input = row.querySelector('[data-ce-key]');
      if (input.type === 'checkbox') input.checked = v >= 0.5;
      else setInput(input, shown(p, v));
      const button = row.querySelector('[data-ce-reset]');
      button.disabled = !own;
      const baseText = t(isAuto(p) ? 'creative.autoValue' : 'creative.baseValue', { value: isToggle(p) ? (base >= 0.5 ? '1' : '0') : withUnit(p, base) });
      button.title = `${t('creative.reset', { name: nameOf(p) })} (${baseText})`;
      const desc = row.querySelector('[data-ce-desc]');
      if (desc) desc.textContent = `${tooltip(p)}\n${baseText}`;
    }
    // Camera uptilt (the drone's tune, like the FPV view's slider)
    const view = ctx.camera();
    const tiltRow = panel.querySelector(`[data-ce-row="${CAMERA_UPTILT}"]`);
    if (tiltRow) {
      const input = tiltRow.querySelector('[data-ce-key]');
      const own = CAMERA_UPTILT in ctx.tune();
      input.disabled = !view;
      if (view) {
        input.min = String(view.rig.range.min);
        input.max = String(view.rig.range.max);
        setInput(input, String(droneUptilt(view.rig.range, ctx.tune())));
      }
      tiltRow.classList.toggle('is-changed', own);
      tiltRow.querySelector('.tune__mark').hidden = !own;
      tiltRow.querySelector('[data-ce-reset]').disabled = !own || !view;
    }
    // Base parts
    for (const kind of BASE_KINDS) {
      const row = panel.querySelector(`[data-ce-row="base:${kind}"]`);
      const key = basePart(build, s, kind, catalog);
      const select = row.querySelector('select');
      if (select !== document.activeElement || select.value !== (key || '')) select.value = key || '';
      row.classList.toggle('is-changed', !!key);
      row.querySelector('.tune__mark').hidden = !key;
      row.querySelector('[data-ce-reset]').disabled = !key;
    }
    panel.querySelector('[data-ce-reset-all]').disabled = !Object.keys(s.values).length && !Object.keys(s.base).length;
    // Key figures and notes
    const a = ctx.analysis();
    const figures = panel.querySelector('[data-ce-figures]');
    figures.replaceChildren(...FIGURES.map((key) => {
      const [, , unit, decimals] = entry(`stats.${key}`);
      const value = a ? a[key] : NaN;
      return el('div', { class: 'ce-figure' }, el('dt', null, Array.isArray(entry(`keyStats.${key}`)) ? t(`keyStats.${key}`) : t(`stats.${key}`)),
        el('dd', null, Number.isFinite(value) ? `${num(value, decimals)}${unit.startsWith(':') ? unit : `${NB}${unit}`}` : t('ui.noValue')));
    }));
    const lines = [];
    if (a) {
      for (const w of a.warnings) lines.push(catalog.analysisWarningText(w, lang()));
      for (const w of check(build, s, catalog, a)) lines.push(t(`creative.warning.${w}`));
    }
    const notes = panel.querySelector('[data-ce-notes]');
    notes.replaceChildren(...(lines.length ? lines.map((line) => el('li', { class: 'is-warn' }, line))
      : [el('li', { class: 'is-ok' }, a ? t('creative.warningsNone') : t('ui.noAnalysis'))]));
  }

  /** Wires the panel's events once (delegated, the panel is rebuilt by render). */
  function wire(host) {
    host.addEventListener('input', (e) => {
      if (e.target.matches('input[type="number"][data-ce-key]')) typing.add(e.target);
    });
    host.addEventListener('change', (e) => {
      const target = e.target;
      if (target.dataset.ceKey) {
        typing.delete(target);
        const key = target.dataset.ceKey;
        if (key === CAMERA_UPTILT) {
          const v = parseFloat(String(target.value).replace(',', '.'));
          if (Number.isFinite(v)) {
            const view = ctx.camera();
            const range = view ? view.rig.range : { min: 0, max: 80 };
            const clean = Math.max(range.min, Math.min(range.max, Math.round(v)));
            ctx.setUptilt(clean);
            if (clean !== Math.round(v)) flash(t('creative.clamped', { name: t('creative.uptilt'), value: `${num(clean, 0)}°` }), 'warn', CAMERA_UPTILT);
          }
          update();
          return;
        }
        if (target.type === 'checkbox') commit(key, target.checked ? 1 : 0);
        else {
          const v = parseFloat(String(target.value).replace(',', '.'));
          if (Number.isFinite(v)) commit(key, v);
          else update();
        }
      } else if (target.dataset.ceBase !== undefined) {
        ctx.setCreative(setBase(ctx.build(), current(), target.dataset.ceBase, target.value || null, ctx.catalog()));
      }
    });
    host.addEventListener('keydown', (e) => {
      const target = e.target;
      if (!target.matches || !target.matches('input[type="number"][data-ce-key]')) return;
      if (e.key === 'Escape' && typing.has(target)) {
        typing.delete(target);
        update();
        e.preventDefault();
      } else if (e.key === 'Enter') {
        target.dispatchEvent(new Event('change', { bubbles: true }));
        e.preventDefault();
      }
    });
    host.addEventListener('click', (e) => {
      const step = e.target.closest('[data-ce-step]');
      if (step) {
        const key = step.dataset.ceFor;
        const dir = Number(step.dataset.ceStep);
        if (key === CAMERA_UPTILT) {
          const view = ctx.camera();
          if (view) ctx.setUptilt(Math.max(view.rig.range.min, Math.min(view.rig.range.max, droneUptilt(view.rig.range, ctx.tune()) + dir)));
          update();
          return;
        }
        const p = paramOf(key);
        const multiple = e.shiftKey ? 10 : 1;
        commit(key, valueOf(ctx.build(), current(), p, ctx.catalog()) + dir * multiple * p.step);
        return;
      }
      const resetButton = e.target.closest('[data-ce-reset]');
      if (resetButton) {
        const key = resetButton.dataset.ceReset;
        reset(key);
        const input = panel.querySelector(`#${idOf(key.startsWith('base:') ? `base-${key.slice(5)}` : key)}`);
        if (input) input.focus();
        return;
      }
      if (e.target.closest('[data-ce-load]')) {
        const id = panel.querySelector('[data-ce-template]').value;
        const catalog = ctx.catalog();
        const template = id ? templateOf(catalog.presetBuild(id)) : specOf(null);
        const name = id ? catalog.presetName(id, lang()) : t('creative.template.installed');
        const result = load(ctx.build(), template, catalog);
        ctx.setCreative(result.spec);
        flash(result.notes.length ? t('creative.template.loadedNotes', { name, n: result.notes.length }) : t('creative.template.loaded', { name }),
          result.notes.length ? 'warn' : 'ok');
        return;
      }
      if (e.target.closest('[data-ce-reset-all]')) {
        ctx.setCreative(specOf(null));
        flash(t('creative.template.cleared'), 'ok');
        return;
      }
      if (e.target.closest('[data-ce-tune]')) ctx.openTune();
    });
    // Right-click on a value: back to the base or automatic value, like the mod's editor.
    host.addEventListener('contextmenu', (e) => {
      const row = e.target.closest('[data-ce-row]');
      if (!row || !row.classList.contains('is-changed')) return;
      e.preventDefault();
      reset(row.dataset.ceRow);
    });
  }

  return { render, update, wire };
}
