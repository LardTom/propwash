(function () {
  'use strict';

  var doc = document;

  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }

  /* ---------- Docs menu: folded on narrow screens ---------- */

  var fold = doc.querySelector('[data-docs-menu]');
  var wide = window.matchMedia ? window.matchMedia('(min-width: 1000px)') : null;
  function syncFold() {
    if (!fold) return;
    if (wide && wide.matches) fold.open = true;
    else fold.open = false;
  }
  syncFold();
  if (wide && wide.addEventListener) wide.addEventListener('change', syncFold);
  if (fold) {
    $$('a', fold).forEach(function (a) {
      a.addEventListener('click', function () { if (!(wide && wide.matches)) fold.open = false; });
    });
  }

  /* ---------- Copy buttons ---------- */

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var area = doc.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      doc.body.appendChild(area);
      area.select();
      try { doc.execCommand('copy') ? resolve() : reject(); } catch (e) { reject(e); }
      doc.body.removeChild(area);
    });
  }

  $$('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var box = btn.closest('[data-code]');
      var code = box && box.querySelector('pre code');
      if (!code) return;
      copyText(code.textContent).then(function () {
        btn.classList.add('is-done');
        window.setTimeout(function () { btn.classList.remove('is-done'); }, 1400);
      }, function () {});
    });
  });

  /* ---------- Current section in the menu ---------- */

  var links = $$('.docs-menu__toc a');
  if (!links.length || !('IntersectionObserver' in window)) return;
  var byId = {};
  links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
  var headings = Object.keys(byId).map(function (id) { return doc.getElementById(id); }).filter(Boolean);
  var visible = {};
  function update() {
    var current = null;
    for (var i = 0; i < headings.length; i++) {
      if (visible[headings[i].id]) { current = headings[i].id; break; }
    }
    if (!current) return;
    links.forEach(function (a) { a.classList.toggle('is-active', a === byId[current]); });
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { visible[e.target.id] = e.isIntersecting; });
    update();
  }, { rootMargin: '-70px 0px -60% 0px' });
  headings.forEach(function (h) { io.observe(h); });
})();
