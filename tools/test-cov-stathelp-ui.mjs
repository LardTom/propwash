#!/usr/bin/env node
// Coverage of the figure explanations and the builds for beginners in the configurator (check plan 0.6.0, 5.3 no. 17,
// 18, 19, 21), in headless Chrome, English and German:
//   - 1280 px: Tab reaches every info button; the explanation shows, aria-expanded is true, it lies inside the window,
//     Escape closes it and nothing stays on top; 390 px with touch: a tap opens it, a second tap or a tap beside closes it
//   - the class range follows the frame: whoop preset, then a 5″ freestyle frame, then a frame of every class; the
//     expected ranges come from assets/data/configurator/stathelp.json
//   - a whoop with the heaviest battery: the figures outside the range get the quiet mark, the list of the
//     compatibility check stays what rules.js says, no figure gets an error style
//   - “Recommended for beginners” above the parts: three cards in the order of beginner.json with a loaded picture,
//     figures, short text, “Load” and “Copy code”; the Angle sentence links to the Flight School, the target exists
//
//   node tools/test-cov-stathelp-ui.mjs [--shots <dir>] [--chrome <path>]

import path from 'node:path';
import { createCatalog } from '../assets/js/configurator/data.js';
import { entry } from '../assets/js/configurator/i18n.js';
import { startBrowser, counter, arg, read, readJson, CFG_READY, sleep } from './fixtures/cov/browser.mjs';

const { check, note, finish } = counter('cov stat help');
const catalog = createCatalog(readJson('assets/data/configurator/catalog.json'));
const statHelp = readJson('assets/data/configurator/stathelp.json');
const beginner = readJson('assets/data/configurator/beginner.json');
const text = (key, lang) => entry(key)[lang === 'de' ? 1 : 0];
const SHOTS = arg('--shots');
const PLAN = { whoop: [3.5, 7], freestyle: [10, 15] };

const fmt = (v, lang) => {
  const d = Number.isInteger(v) ? 0 : 1;
  return new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
};
function rangeLine(key, cls, lang) {
  const [, , unit] = entry(`stats.${key}`);
  const r = statHelp.stats[key][cls];
  const u = unit.startsWith(':') ? unit : ` ${unit}`;
  return text('ui.statRange', lang).replace('{class}', text(`roles.${cls}`, lang)).replace('{range}', `${fmt(r[0], lang)}–${fmt(r[1], lang)}${u}`);
}
const norm = (s) => String(s).replace(/[  ]/g, ' ');

function heavyBuilds() {
  const whoop = catalog.presetBuild('propwash:whoop');
  const range = (k) => statHelp.stats[k].whoop;
  const outside = (a) => Object.keys(statHelp.stats).filter((k) => {
    const d = entry(`stats.${k}`)[3];
    const slack = 0.5 * 10 ** -d;
    return Number.isFinite(a[k]) && (a[k] < range(k)[0] - slack || a[k] > range(k)[1] + slack);
  });
  const batteries = catalog.partsIn('battery').slice().sort((x, y) => y.basics.mass_g - x.basics.mass_g);
  const heaviest = batteries[0];
  const build = { ...whoop, battery: heaviest.id };
  const fitting = batteries.find((bat) => {
    const b = { ...whoop, battery: bat.id };
    const c = catalog.check(b);
    const a = catalog.analyze(b);
    return !c.problems.length && !c.warnings.length && a && !a.warnings.length && outside(a).length;
  });
  const out = [{ label: `heaviest battery ${heaviest.id} (${heaviest.basics.mass_g} g)`, build }];
  if (fitting) out.push({ label: `heaviest fitting battery outside a range ${fitting.id} (${fitting.basics.mass_g} g)`, build: { ...whoop, battery: fitting.id } });
  for (const o of out) {
    o.check = catalog.check(o.build);
    o.analysis = catalog.analyze(o.build);
    o.outside = o.analysis ? outside(o.analysis) : [];
    o.code = catalog.encode({ build: o.build, paint: null, tune: null, osd: null, name: null });
    check(o.analysis && o.outside.length > 0, `no. 19: ${o.label}: some figure lies outside the whoop range (${o.outside})`);
  }
  return out;
}

async function main() {
  const heavy = heavyBuilds();
  const b = await startBrowser();
  const shot = async (p, name) => {
    if (SHOTS) await p.shot(path.join(SHOTS, `${name}.png`));
  };
  const tipState = (p, sel) => p.evaluate(`(() => {
    const b = document.querySelector(${JSON.stringify(sel)});
    const tip = document.querySelector('[data-stat-tip]');
    const r = tip.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    return { open: !tip.hidden, exp: b.getAttribute('aria-expanded'), text: tip.textContent,
      inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, rect: [r.left, r.top, r.right, r.bottom].map(Math.round),
      center: [cx, cy] };
  })()`);
  const covered = (p, [x, y]) => p.evaluate(`(() => { const n = document.elementFromPoint(${x}, ${y}); return !!(n && n.closest('[data-stat-tip]')); })()`);
  const setPreset = (p, id) => p.evaluate(`(() => { const s = document.querySelector('[data-preset]'); s.value = ${JSON.stringify(id)}; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  const pickFrame = async (p, id) => {
    const slot = await p.center('[data-slots] [data-cat="frame"]');
    await p.click(slot.x, slot.y);
    await sleep(200);
    const opt = await p.center(`[data-picker] [role=option][data-id="${id}"]`);
    if (!opt) throw new Error(`frame ${id} not in the picker`);
    await p.click(opt.x, opt.y);
    await sleep(400);
  };
  try {
    for (const lang of ['en', 'de']) {
      const p = await b.page({ lang });
      await p.open('/configurator/', { width: 1280, ready: CFG_READY });
      const buttons = await p.evaluate("[...document.querySelectorAll('[data-stat-help]')].map((x) => ({ key: x.dataset.statHelp, box: x.closest('[data-keystats]') ? 'keystats' : 'stats' }))");
      check(buttons.length === 25, `no. 17 ${lang}: ${buttons.length} info buttons (5 key figures and 20 figures)`);
      let reached = 0;
      for (const box of ['keystats', 'stats']) {
        const list = buttons.filter((x) => x.box === box);
        await p.evaluate(`(document.querySelector('[data-${box}] [data-stat-help]').focus(), true)`);
        await p.key('Tab', { shift: true });
        await p.key('Tab');
        for (const [i, btn] of list.entries()) {
          const sel = `[data-${box}] [data-stat-help="${btn.key}"]`;
          const focused = await p.evaluate(`document.activeElement === document.querySelector(${JSON.stringify(sel)})`);
          const s = await tipState(p, sel);
          const want = text(`statHelp.${btn.key}`, lang);
          const ok = focused && s.open && s.exp === 'true' && norm(s.text).startsWith(norm(want).slice(0, 40)) && s.inside;
          check(ok, `no. 17 ${lang}: Tab ${i + 1} in ${box} → ${btn.key}: focus ${focused}, open ${s.open}, aria-expanded ${s.exp}, inside ${s.inside} ${s.rect}`);
          if (ok) reached++;
          await p.key('Escape');
          const after = await tipState(p, sel);
          check(!after.open && after.exp === 'false' && !(await covered(p, s.center)), `no. 17 ${lang}: Escape closes ${btn.key} and nothing stays on top`);
          check(await p.evaluate(`document.activeElement === document.querySelector(${JSON.stringify(sel)})`), `no. 17 ${lang}: the focus stays on ${btn.key} after Escape`);
          await p.key('Tab');
        }
      }
      check(reached === 25, `no. 17 ${lang}: ${reached} of 25 explanations by keyboard`);

      await setPreset(p, 'propwash:whoop');
      await sleep(500);
      const whoopLine = rangeLine('thrust_to_weight', 'whoop', lang);
      const tw = '[data-stats] [data-stat-help="thrust_to_weight"]';
      const twc = await p.center(tw);
      await p.click(twc.x, twc.y);
      let s = await tipState(p, tw);
      check(s.open && norm(s.text).includes(norm(whoopLine)), `no. 18 ${lang}: whoop: “${norm(whoopLine)}” in the explanation (${norm(s.text).slice(-60)})`);
      if (statHelp.stats.thrust_to_weight.whoop.join() !== PLAN.whoop.join()) note(`no. 18: stathelp.json gives whoops ${statHelp.stats.thrust_to_weight.whoop.join('–')}, the check plan says about ${PLAN.whoop.join('–')}`);
      await shot(p, `stathelp-whoop-${lang}`);
      await p.key('Escape');
      const fs5 = catalog.partsIn('frame').find((f) => f.data.role === 'freestyle' && f.builtin);
      await pickFrame(p, fs5.id);
      const fsLine = rangeLine('thrust_to_weight', 'freestyle', lang);
      const twc2 = await p.center(tw);
      await p.click(twc2.x, twc2.y);
      s = await tipState(p, tw);
      check(s.open && norm(s.text).includes(norm(fsLine)), `no. 18 ${lang}: ${fs5.id}: “${norm(fsLine)}” (${norm(s.text).slice(-60)})`);
      if (statHelp.stats.thrust_to_weight.freestyle.join() !== PLAN.freestyle.join()) note(`no. 18: stathelp.json gives 5″ freestyle ${statHelp.stats.thrust_to_weight.freestyle.join('–')}, the check plan says about ${PLAN.freestyle.join('–')}`);
      await shot(p, `stathelp-freestyle-${lang}`);
      await p.key('Escape');
      for (const cls of statHelp.classes) {
        const frame = catalog.partsIn('frame').find((f) => f.data.role === cls);
        if (!frame) {
          check(false, `no. 18: a frame of the class ${cls}`);
          continue;
        }
        await pickFrame(p, frame.id);
        const lines = await p.evaluate("Object.fromEntries([...document.querySelectorAll('[data-stats] [data-stat-help]')].map((x) => [x.dataset.statHelp, document.getElementById(x.getAttribute('aria-describedby')).textContent]))");
        for (const key of Object.keys(statHelp.stats)) {
          check(lines[key] && norm(lines[key]).includes(norm(rangeLine(key, cls, lang))), `no. 18 ${lang}: ${cls} (${frame.id}) ${key}: “${norm(rangeLine(key, cls, lang))}”`);
        }
      }

      for (const h of heavy) {
        await p.open(`/configurator/#${h.code}`, { width: 1280, ready: CFG_READY });
        await sleep(500);
        const ui = await p.evaluate(`(() => ({
          rows: Object.fromEntries([...document.querySelectorAll('[data-stats] > div')].map((d) => [d.querySelector('[data-stat-help]').dataset.statHelp,
            { cls: d.className, mark: !!d.querySelector('.stat__odd'), color: getComputedStyle(d.querySelector('.stat__value')).color }])),
          checks: [...document.querySelectorAll('[data-checks] li')].map((li) => li.textContent),
          status: document.querySelector('[data-checks] .checks__status').className,
        }))()`);
        const expectChecks = [...h.check.problems.map((k) => catalog.issueText(k, lang)), ...h.check.warnings.map((k) => catalog.issueText(k, lang)),
          ...h.analysis.warnings.map((k) => text('ui.flightWarning', lang) + catalog.analysisWarningText(k, lang))];
        check(JSON.stringify(ui.checks) === JSON.stringify(expectChecks), `no. 19 ${lang}: ${h.label}: the check list is the one of rules.js (${ui.checks.length} vs ${expectChecks.length})`);
        check(!ui.checks.some((c) => c.includes(text('ui.statOutside', lang)) || c.includes(text('ui.statOutsideLong', lang).slice(0, 20))), `no. 19 ${lang}: ${h.label}: no range note in the check list`);
        const plain = Object.entries(ui.rows).filter(([k]) => !h.outside.includes(k)).map(([, r]) => r.color);
        for (const key of h.outside) {
          const r = ui.rows[key];
          if (!r) continue;
          check(r.cls.includes('is-odd') && r.mark, `no. 19 ${lang}: ${h.label}: ${key} has the quiet mark (${r.cls})`);
          check(!/is-(bad|error|problem|warn)\b/.test(r.cls) && plain.includes(r.color), `no. 19 ${lang}: ${h.label}: ${key} in no error style (${r.cls}, ${r.color})`);
        }
        const key = h.outside.find((k) => ui.rows[k]);
        if (key) {
          const sel = `[data-stats] [data-stat-help="${key}"]`;
          const c = await p.center(sel);
          await p.click(c.x, c.y);
          const t = await tipState(p, sel);
          check(t.open && norm(t.text).includes(norm(text('ui.statOutsideLong', lang).replace('{class}', text('roles.whoop', lang)))), `no. 19 ${lang}: ${h.label}: the explanation of ${key} says “not an error”`);
          await shot(p, `stathelp-outside-${h.build.battery.replace(':', '_')}-${lang}`);
          await p.key('Escape');
        }
      }

      await p.open('/configurator/', { width: 1280, ready: CFG_READY });
      const bar = await p.evaluate(`(() => {
        const box = document.querySelector('[data-beginner]');
        const slots = document.querySelector('[data-slots]');
        const a = box.querySelector('.beginner__hint a');
        return {
          visible: !box.hidden, above: box.compareDocumentPosition(slots) & Node.DOCUMENT_POSITION_FOLLOWING && box.getBoundingClientRect().bottom <= slots.getBoundingClientRect().top + 1,
          title: box.querySelector('.beginner__title').textContent, hint: box.querySelector('.beginner__hint').textContent, href: a ? a.href : null,
          cards: [...box.querySelectorAll('.beginner__card')].map((c) => ({
            name: c.querySelector('.beginner__name').textContent, text: c.querySelector('.beginner__text').textContent,
            img: c.querySelector('img').complete && c.querySelector('img').naturalWidth > 0, src: c.querySelector('img').getAttribute('src'),
            figures: [...c.querySelectorAll('.beginner__figures dt')].length, values: [...c.querySelectorAll('.beginner__figures dd')].map((d) => d.textContent),
            buttons: [...c.querySelectorAll('button')].map((x) => x.textContent.trim()),
          })),
        };
      })()`);
      check(bar.visible && bar.above, `no. 21 ${lang}: the bar stands above the parts`);
      check(bar.title === text('beginner.title', lang), `no. 21 ${lang}: title “${bar.title}”`);
      check(bar.cards.length === 3, `no. 21 ${lang}: exactly three cards (${bar.cards.length})`);
      beginner.builds.forEach((build, i) => {
        const c = bar.cards[i] || {};
        check(c.name === catalog.presetName(build.preset, lang), `no. 21 ${lang}: card ${i + 1} is ${build.preset} (${c.name})`);
        check(c.img && c.src && c.src.endsWith(build.image.replace(/^.*\//, '')), `no. 21 ${lang}: card ${i + 1} has its picture loaded (${c.src})`);
        check(c.figures === beginner.figures.length && c.values && c.values.every((v) => /\d/.test(v)), `no. 21 ${lang}: card ${i + 1} has ${beginner.figures.length} figures (${c.values})`);
        check(c.text === text(`beginner.${build.preset}`, lang), `no. 21 ${lang}: card ${i + 1} short text`);
        check(JSON.stringify(c.buttons) === JSON.stringify([text('beginner.load', lang), text('beginner.copy', lang)]), `no. 21 ${lang}: card ${i + 1} buttons ${JSON.stringify(c.buttons)}`);
      });
      check(['Whoop', 'Cinewhoop', 'Freestyle'].every((w, i) => (bar.cards[i] || {}).name && bar.cards[i].name.toLowerCase().includes(w.toLowerCase())), `no. 21 ${lang}: order whoop, cinewhoop, freestyle`);
      check(bar.hint.includes(text('beginner.angle', lang)) && bar.hint.includes(text('beginner.school', lang)), `no. 21 ${lang}: the Angle sentence “${bar.hint}”`);
      const target = bar.href ? new URL(bar.href) : null;
      check(target && target.pathname === '/' && target.hash === beginner.school, `no. 21 ${lang}: the sentence links to the Flight School (${bar.href})`);
      const landing = read('index.html');
      const id = beginner.school.slice(1);
      const at = landing.indexOf(`id="${id}"`);
      check(at > 0 && /Flight School|Flugschule/.test(landing.slice(at, at + 4000)), `no. 21: the target #${id} exists on the start page and is about the Flight School`);
      for (const [i, build] of beginner.builds.entries()) {
        const c = await p.center(`[data-beginner] .beginner__card:nth-child(${i + 1}) .btn--ghost`);
        await p.click(c.x, c.y);
        await sleep(250);
        const clip = await p.clipboard();
        const d = catalog.decode(clip);
        check(clip.startsWith('PW3-') && d.ok && JSON.stringify(d.content.build) === JSON.stringify(catalog.presetBuild(build.preset)), `no. 21 ${lang}: “${text('beginner.copy', lang)}” of card ${i + 1} copies its PW3 code (${clip})`);
        check(d.ok && d.namespaces.every((n) => n.namespace === 'propwash'), `no. 21 ${lang}: the code of card ${i + 1} needs no add-on`);
      }
      await shot(p, `beginner-${lang}`);
      check(p.errors.length === 0, `${lang}: no console errors at 1280 px (${p.errors.slice(0, 3).join(' | ')})`);
      await p.close();

      const m = await b.page({ lang });
      await m.open('/configurator/', { width: 390, ready: CFG_READY });
      const keys = lang === 'en' ? buttons : buttons.filter((x, i) => i % 5 === 0);
      for (const btn of keys) {
        const sel = `[data-${btn.box}] [data-stat-help="${btn.key}"]`;
        let c = await m.center(sel);
        await m.tap(c.x, c.y);
        const s1 = await tipState(m, sel);
        check(s1.open && s1.exp === 'true' && s1.inside, `no. 17 390 ${lang}: a tap opens ${btn.box}/${btn.key} inside the window (${s1.rect})`);
        c = await m.center(sel);
        await m.tap(c.x, c.y);
        const s2 = await tipState(m, sel);
        check(!s2.open && s2.exp === 'false' && !(await covered(m, s1.center)), `no. 17 390 ${lang}: a second tap closes ${btn.key}, nothing stays on top`);
        c = await m.center(sel);
        await m.tap(c.x, c.y);
        const s3 = await tipState(m, sel);
        const away = await m.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).closest('div').querySelector('dd').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
        await m.tap(away.x, away.y);
        const s4 = await tipState(m, sel);
        check(s3.open && !s4.open && s4.exp === 'false' && !(await covered(m, s3.center)), `no. 17 390 ${lang}: a tap beside closes ${btn.key}`);
      }
      const t1 = await m.center('[data-stats] [data-stat-help="thrust_to_weight"]');
      await m.tap(t1.x, t1.y);
      await shot(m, `stathelp-390-${lang}`);
      check(m.errors.length === 0, `${lang}: no console errors at 390 px (${m.errors.slice(0, 3).join(' | ')})`);
      await m.close();
    }
  } finally {
    await b.close();
  }
  finish(`25 info buttons by keyboard and touch, ranges of ${statHelp.classes.length} classes, ${heavy.length} heavy whoops, 3 builds for beginners; en/de`);
}

main().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
