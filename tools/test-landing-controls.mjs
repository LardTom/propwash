#!/usr/bin/env node
// Walk-through of the landing page (owner finding OF-10: “I thought I could drag the slider and switch on the right”):
// everything on index.html that looks operable is clicked (1280 px, mouse, English) or tapped (390 px, touch,
// German) in headless Chrome, and each one has to do something.
//   - operable: links, buttons, summaries, inputs, elements with a widget role (button, radio, tab, switch, checkbox,
//     slider, menuitem) or a tabindex, and anything with the pointer cursor that is not inside one of these
//   - doing something: the page changes (attributes, text, elements), a dialog opens, the address or the scroll
//     position changes or something is copied; links that leave the page are only listed here (tools/test-links.mjs
//     checks where they lead) and the skip link is checked with the keyboard (it is only visible with focus)
//   - nothing may lie on top of a control where it is clicked; a radio that is already checked is clicked after its
//     neighbour; controls that are hidden in the start state (stage buttons of the other video system) are reached
//     after a reload in the state that shows them
//   - no script errors
//
//   node tools/test-landing-controls.mjs [--width 1280|390]

import { counter, startBrowser, sleep, arg } from './fixtures/cov/browser.mjs';

const { check, finish } = counter('landing-controls');

const VIEWS = [
  { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false, lang: 'en' },
  { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, lang: 'de' },
].filter((v) => !arg('--width') || String(v.width) === arg('--width'));

const TAG = `(() => {
  const roles = ['button', 'radio', 'tab', 'switch', 'checkbox', 'slider', 'menuitem', 'link'];
  const out = [];
  let n = 0;
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || cs.visibility === 'hidden' || el.closest('dialog:not([open])')) continue;
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    const native = ['a', 'button', 'input', 'select', 'textarea', 'summary'].includes(tag) && !(tag === 'a' && !el.hasAttribute('href'));
    const pointer = cs.cursor === 'pointer' && !(el.parentElement && getComputedStyle(el.parentElement).cursor === 'pointer');
    const focusable = el.hasAttribute('tabindex') && el.tabIndex >= 0;
    if (!(native || roles.includes(role) || pointer || focusable)) continue;
    if (!native && !roles.includes(role) && el.closest('a[href], button, summary, input, select, label')) continue;
    el.dataset.tour = String(++n);
    const name = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('alt') || el.value || '').trim().replace(/\\s+/g, ' ').slice(0, 50);
    out.push({ id: n, tag, role, name, href: el.getAttribute('href'), checked: el.getAttribute('aria-checked'), skip: el.classList.contains('skip'),
      where: (el.closest('section[id]') || {}).id || (el.closest('header') ? 'header' : el.closest('footer') ? 'footer' : 'page') });
  }
  return out;
})()`;

const PREPARE = (id) => `(() => {
  const el = document.querySelector('[data-tour="${id}"]');
  if (!el) return null;
  const open = document.querySelector('dialog[open]');
  if (open) open.close();
  el.scrollIntoView({ block: 'center', behavior: 'instant' });
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  window.__changes = 0;
  if (window.__mo) window.__mo.disconnect();
  window.__mo = new MutationObserver((list) => { for (const m of list) if (!(m.type === 'attributes' && m.attributeName === 'data-tour')) window.__changes++; });
  window.__mo.observe(document.documentElement, { attributes: true, childList: true, subtree: true, characterData: true });
  window.__before = { url: location.href, y: scrollY, copies: (window.__copies || []).length };
  const x = Math.min(Math.max(r.left + Math.min(r.width / 2, 40), 1), innerWidth - 2);
  const y = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 2);
  const hit = document.elementFromPoint(x, y);
  return { x, y, hit: !!hit && (hit === el || el.contains(hit)), on: hit ? hit.tagName.toLowerCase() + '.' + String(hit.className || '').slice(0, 40) : 'nothing' };
})()`;

const EFFECT = `(() => {
  const dialog = !!document.querySelector('dialog[open]');
  const out = { changes: window.__changes, dialog, url: location.href !== window.__before.url, scrolled: Math.abs(scrollY - window.__before.y) > 40,
    copied: (window.__copies || []).length > window.__before.copies };
  if (window.__mo) window.__mo.disconnect();
  if (dialog) document.querySelector('dialog[open]').close();
  return out;
})()`;

const LOAD = `(async () => {
  for (let y = 0; y < document.documentElement.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 25)); }
  scrollTo(0, 0);
  return true;
})()`;

const browser = await startBrowser();
try {
  for (const view of VIEWS) {
    const where = `${view.lang} ${view.width} px`;
    const tab = await browser.page({ lang: view.lang });
    const fresh = async () => {
      await tab.open('/', { width: view.width, lang: view.lang, ready: "document.readyState === 'complete'" });
      await tab.send('Emulation.setDeviceMetricsOverride', view);
      await tab.send('Emulation.setTouchEmulationEnabled', { enabled: view.mobile, maxTouchPoints: view.mobile ? 5 : 1 });
      await tab.evaluate(LOAD);
      await sleep(300);
      return tab.evaluate(TAG);
    };
    const list = await fresh();
    check(list.length > 100, `${where}: ${list.length} operable elements found`);
    let clicked = 0;
    let leaving = 0;
    for (const c of list) {
      const label = `${where}: ${c.where} ${c.tag}${c.role ? `[${c.role}]` : ''} “${c.name}”`;
      if (c.tag === 'a' && c.href && !c.href.startsWith('#')) { leaving++; continue; }
      if (c.skip) {
        await tab.evaluate(`document.querySelector('[data-tour="${c.id}"]').focus(), true`);
        await tab.key('Enter');
        const moved = await tab.evaluate("location.hash === '#main' || (document.activeElement && document.activeElement.closest('main') !== null)");
        check(moved, `${label}: Enter on the skip link goes to the content`);
        continue;
      }
      if (c.role === 'radio') {
        const isOn = await tab.evaluate(`document.querySelector('[data-tour="${c.id}"]')?.getAttribute('aria-checked') === 'true'`);
        if (isOn) {
          // Click a neighbour first, so that this radio has something to switch back.
          await tab.evaluate(`(() => { const el = document.querySelector('[data-tour="${c.id}"]'); const g = el.closest('[role="radiogroup"]'); const o = g && [...g.querySelectorAll('[role="radio"]')].find((r) => r !== el); if (o) o.click(); return true; })()`);
          await sleep(200);
        }
      }
      let at = await tab.evaluate(PREPARE(c.id));
      if (!at) {
        // Hidden in the current state (the stage buttons of the other video system): reload and try in the start state,
        // else switch the video system first.
        await fresh();
        at = await tab.evaluate(PREPARE(c.id));
        if (!at) {
          await tab.evaluate(`(() => { const el = document.querySelector('[data-tour="${c.id}"]'); const g = el && el.closest('[data-vlab-ticks]'); if (g) document.querySelector('.seg [data-vlab-mode="' + g.dataset.vlabTicks + '"]').click(); return true; })()`);
          await sleep(200);
          at = await tab.evaluate(PREPARE(c.id));
        }
      }
      if (!check(at, `${label}: can be reached`)) continue;
      check(at.hit, `${label}: nothing lies on top of it (${at.on})`);
      await sleep(120);
      await tab.evaluate('window.__changes = 0, true');
      if (view.mobile) await tab.tap(at.x, at.y);
      else await tab.click(at.x, at.y);
      await sleep(500);
      const eff = await tab.evaluate(EFFECT);
      check(eff.changes || eff.dialog || eff.url || eff.scrolled || eff.copied, `${label}: ${view.mobile ? 'a tap' : 'a click'} does something (${JSON.stringify(eff)})`);
      clicked++;
      const left = await tab.evaluate(`location.pathname !== '/' && location.pathname !== '/index.html'`);
      if (left) await fresh();
      await tab.key('Escape');
    }
    check(clicked > 80, `${where}: ${clicked} controls ${view.mobile ? 'tapped' : 'clicked'}, ${leaving} links that leave the page`);
    check(!tab.errors.length, `${where}: no script errors (${tab.errors.slice(0, 3).join('; ')})`);
    await tab.close();
  }
} finally {
  await browser.close();
}

finish(`every operable element on the landing page does something, ${VIEWS.map((v) => `${v.lang} ${v.width} px`).join(' and ')}`);
