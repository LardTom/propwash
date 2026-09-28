(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reduceMotion = !!(motionQuery && motionQuery.matches);

  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
  function lang() { return root.lang === 'de' ? 'de' : 'en'; }
  function localText(el) {
    if (!el) return '';
    var span = el.querySelector('[lang="' + lang() + '"]');
    return (span || el).textContent.replace(/\s+/g, ' ').trim();
  }

  var uid = 0;
  function nextId(prefix) { uid += 1; return prefix + '-' + uid; }

  function eagerLoad(scope) {
    $$('img[loading="lazy"]', scope).forEach(function (img) { img.loading = 'eager'; });
  }

  function preloadNear(el, margin) {
    if (!('IntersectionObserver' in window)) { eagerLoad(el); return; }
    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      eagerLoad(el);
      io.disconnect();
    }, { rootMargin: (margin || 400) + 'px 0px' });
    io.observe(el);
  }

  function flashStatic(screen) {
    if (reduceMotion || !screen) return;
    screen.classList.remove('is-switching');
    void screen.offsetWidth;
    screen.classList.add('is-switching');
    window.setTimeout(function () { screen.classList.remove('is-switching'); }, 360);
  }

  /* ---------- Language ---------- */

  var META = {
    en: {
      title: 'Propwash FPV – Real FPV drone racing in Minecraft',
      description: 'Propwash FPV is an FPV drone racing and freestyle mod for Minecraft 26.3 on Fabric and NeoForge: build quadcopters from real parts, fly them with your RC transmitter, a gamepad or the keyboard and race through gates. Coming soon to Modrinth.'
    },
    de: {
      title: 'Propwash FPV – Echtes FPV-Drohnenrennen in Minecraft',
      description: 'Propwash FPV ist eine FPV-Drohnen-Mod für Minecraft 26.3 mit Fabric und NeoForge: Quadcopter aus realen Teilen bauen, mit Funke, Gamepad oder Tastatur fliegen und durch Renn-Gates jagen. Bald auf Modrinth.'
    }
  };
  var I18N_ATTRS = ['alt', 'aria-label', 'title'];

  function applyLang(next, persist) {
    root.lang = next;
    $$('[data-de-alt], [data-de-aria-label], [data-de-title]').forEach(function (el) {
      I18N_ATTRS.forEach(function (attr) {
        var de = el.getAttribute('data-de-' + attr);
        if (de === null) return;
        var enKey = 'data-en-' + attr;
        if (!el.hasAttribute(enKey)) el.setAttribute(enKey, el.getAttribute(attr) || '');
        el.setAttribute(attr, next === 'de' ? de : el.getAttribute(enKey));
      });
    });
    doc.title = META[next].title;
    var desc = $('meta[name="description"]');
    if (desc) desc.setAttribute('content', META[next].description);
    $$('[data-set-lang]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-set-lang') === next));
    });
    if (persist) {
      try { window.localStorage.setItem('propwash-lang', next); } catch (e) { /* storage unavailable */ }
    }
    doc.dispatchEvent(new CustomEvent('propwash:lang'));
  }

  $$('[data-set-lang]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      applyLang(btn.getAttribute('data-set-lang'), true);
    });
  });
  applyLang(lang(), false);

  /* ---------- Image switchers ---------- */

  $$('[data-tabs]').forEach(function (wrap) {
    var buttons = $$('.tabs button', wrap);
    var panels = $$('.shot > img', wrap);
    if (!buttons.length || buttons.length !== panels.length) return;
    var shot = $('.shot', wrap);
    if (!shot.id) shot.id = nextId('view');
    preloadNear(wrap);
    buttons.forEach(function (btn, i) {
      btn.setAttribute('aria-controls', shot.id);
      btn.addEventListener('click', function () { select(i); });
      btn.addEventListener('keydown', function (e) {
        var to = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = (i + 1) % buttons.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = (i - 1 + buttons.length) % buttons.length;
        else if (e.key === 'Home') to = 0;
        else if (e.key === 'End') to = buttons.length - 1;
        if (to === null) return;
        e.preventDefault();
        buttons[to].focus();
      });
    });
    function select(i) {
      buttons.forEach(function (b, j) {
        b.setAttribute('aria-pressed', String(i === j));
        panels[j].hidden = i !== j;
      });
    }
  });

  /* ---------- Hero feed ---------- */

  (function heroFeed() {
    var feed = $('[data-feed]');
    if (!feed) return;
    var screen = $('.feed__screen', feed);
    var imgs = $$('.feed__img', feed);
    var titles = $$('[data-feed-title]', feed);
    var indexEl = $('[data-feed-index]', feed);
    var nextBtn = $('[data-feed-next]', feed);
    var voltsEl = $('[data-bat-volts]', feed);
    var levelEl = $('[data-bat-level]', feed);
    var timeEl = $('[data-fly-time]', feed);
    var bars = $$('[data-link-bars] i', feed);
    var barsWrap = $('[data-link-bars]', feed);
    var current = 0;
    var visible = true;
    var hovered = false;
    var seconds = 0;
    var FULL = 25.2;
    var EMPTY = 21.6;
    var CYCLE = 200;
    var autoTimer = null;
    var tickTimer = null;

    function show(i, fromUser) {
      current = (i + imgs.length) % imgs.length;
      flashStatic(screen);
      imgs.forEach(function (img, j) { img.classList.toggle('is-active', j === current); });
      titles.forEach(function (t, j) { t.hidden = j !== current; });
      if (indexEl) indexEl.textContent = String(current + 1);
      if (fromUser) restartAuto();
    }

    function setLink(n) {
      bars.forEach(function (b, j) { b.classList.toggle('on', j < n); });
      if (barsWrap) barsWrap.classList.toggle('is-weak', n <= 3);
    }

    function render() {
      var t = seconds % CYCLE;
      var volts = FULL - (FULL - 22.4) * (t / CYCLE) - (t % 9 === 4 ? 0.3 : 0);
      var lvl = Math.max(0, Math.min(1, (volts - EMPTY) / (FULL - EMPTY)));
      if (voltsEl) voltsEl.textContent = volts.toFixed(1) + 'V';
      if (levelEl) {
        levelEl.style.setProperty('--lvl', Math.round(lvl * 100) + '%');
        levelEl.parentNode.classList.toggle('is-low', lvl < 0.35);
      }
      if (timeEl) {
        var m = Math.floor(t / 60);
        var s = t % 60;
        timeEl.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
      }
    }

    function tick() {
      seconds += 1;
      render();
      var r = Math.random();
      setLink(r > 0.9 ? 3 : r > 0.55 ? 4 : 5);
    }

    function running() { return visible && !doc.hidden && !reduceMotion; }

    function restartAuto() {
      window.clearInterval(autoTimer);
      autoTimer = null;
      if (running()) {
        autoTimer = window.setInterval(function () {
          if (!hovered) show(current + 1, false);
        }, 6500);
      }
    }

    function restartTick() {
      window.clearInterval(tickTimer);
      tickTimer = null;
      if (running()) tickTimer = window.setInterval(tick, 1000);
    }

    function refresh() { restartAuto(); restartTick(); }

    if (nextBtn) nextBtn.addEventListener('click', function () { show(current + 1, true); });
    feed.addEventListener('mouseenter', function () { hovered = true; });
    feed.addEventListener('mouseleave', function () { hovered = false; });
    feed.addEventListener('focusin', function () { hovered = true; });
    feed.addEventListener('focusout', function () { hovered = false; });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        refresh();
      }, { threshold: 0.15 }).observe(feed);
    }
    doc.addEventListener('visibilitychange', refresh);
    if (motionQuery && motionQuery.addEventListener) {
      motionQuery.addEventListener('change', function (e) { reduceMotion = e.matches; refresh(); });
    }

    render();
    setLink(5);
    refresh();
  })();

  /* ---------- Step gates light up ---------- */

  (function steps() {
    var items = $$('[data-step]');
    if (!items.length || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        items.forEach(function (el) { el.classList.toggle('is-next', el === entry.target); });
      });
    }, { rootMargin: '-40% 0px -50% 0px' });
    items.forEach(function (el) { io.observe(el); });
  })();

  /* ---------- Video lab ---------- */

  (function videoLab() {
    var lab = $('[data-vlab]');
    if (!lab) return;
    var screen = $('.feed__screen', lab);
    var sets = {};
    $$('.vlab__set', lab).forEach(function (s) { sets[s.getAttribute('data-system')] = s; });
    var range = $('[data-vlab-range]', lab);
    var modeBtns = $$('[data-vlab-mode]', lab);
    var tickGroups = {};
    $$('[data-vlab-ticks]', lab).forEach(function (g) { tickGroups[g.getAttribute('data-vlab-ticks')] = g; });
    var notes = $$('[data-vnote]', lab);
    var bars = $$('[data-vlab-bars] i', lab);
    var barsWrap = $('[data-vlab-bars]', lab);
    var systemEl = $('[data-vlab-system]', lab);
    var stageNameEl = $('[data-vlab-stage-name]', lab);
    var ends = {};
    $$('[data-vlab-ends]', lab).forEach(function (e) { ends[e.getAttribute('data-vlab-ends')] = e; });
    var BARS = { analog: [4, 3, 1, 0], digital: [5, 2] };
    var mode = 'analog';
    var stage = 0;
    var loaded = false;

    function loadAll() {
      if (loaded) return;
      loaded = true;
      eagerLoad(lab);
    }

    function imgsOf(m) { return $$('.feed__img', sets[m]); }
    function ticksOf(m) { return $$('button', tickGroups[m]); }

    function setStage(s, animate) {
      var imgs = imgsOf(mode);
      stage = Math.max(0, Math.min(imgs.length - 1, s));
      if (animate) flashStatic(screen);
      imgs.forEach(function (img, i) { img.classList.toggle('is-active', i === stage); });
      var ticks = ticksOf(mode);
      ticks.forEach(function (b, i) { b.setAttribute('aria-pressed', String(i === stage)); });
      var name = localText(ticks[stage]);
      if (range) {
        range.value = String(stage);
        var max = Number(range.max) || 1;
        range.style.setProperty('--fill', (stage / max) * 100 + '%');
        range.setAttribute('aria-valuetext', name);
      }
      if (stageNameEl) stageNameEl.textContent = name;
      var n = BARS[mode][stage];
      bars.forEach(function (b, i) { b.classList.toggle('on', i < n); });
      if (barsWrap) {
        barsWrap.classList.toggle('is-weak', n > 0 && n <= 2);
        barsWrap.classList.toggle('is-lost', n === 0);
      }
    }

    function setMode(m, animate) {
      if (!sets[m]) return;
      loadAll();
      mode = m;
      Object.keys(sets).forEach(function (k) {
        sets[k].hidden = k !== m;
        if (tickGroups[k]) tickGroups[k].hidden = k !== m;
        if (ends[k]) ends[k].hidden = k !== m;
      });
      modeBtns.forEach(function (b) {
        var on = b.getAttribute('data-vlab-mode') === m;
        b.setAttribute('aria-checked', String(on));
        b.tabIndex = on ? 0 : -1;
      });
      notes.forEach(function (nEl) { nEl.classList.toggle('is-active', nEl.getAttribute('data-vnote') === m); });
      if (systemEl) systemEl.textContent = m === 'analog' ? 'ANALOG' : 'DIGITAL';
      if (range) range.max = String(imgsOf(m).length - 1);
      setStage(0, animate);
    }

    if (range) {
      range.addEventListener('input', function () {
        loadAll();
        setStage(Number(range.value), true);
      });
    }
    Object.keys(tickGroups).forEach(function (k) {
      ticksOf(k).forEach(function (b, i) {
        b.addEventListener('click', function () {
          loadAll();
          setStage(i, true);
        });
      });
    });
    modeBtns.forEach(function (b, i) {
      b.addEventListener('click', function () { setMode(b.getAttribute('data-vlab-mode'), true); });
      b.addEventListener('keydown', function (e) {
        if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].indexOf(e.key) === -1) return;
        e.preventDefault();
        var step = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : -1;
        var target = modeBtns[(i + step + modeBtns.length) % modeBtns.length];
        target.focus();
        setMode(target.getAttribute('data-vlab-mode'), true);
      });
    });

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) { loadAll(); io.disconnect(); }
      }, { rootMargin: '600px 0px' });
      io.observe(lab);
    } else {
      loadAll();
    }

    doc.addEventListener('propwash:lang', function () { setStage(stage, false); });
    setMode('analog', false);
  })();

  /* ---------- Headlight toggle ---------- */

  $$('[data-headlight]').forEach(function (tile) {
    var btn = $('[data-headlight-toggle]', tile);
    var on = $('.headlight-on', tile);
    var off = $('.headlight-off', tile);
    if (!btn || !on || !off) return;
    preloadNear(tile);
    btn.addEventListener('click', function () {
      var next = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', String(next));
      on.hidden = !next;
      off.hidden = next;
    });
  });

  /* ---------- Lightbox ---------- */

  (function lightbox() {
    var dlg = $('[data-lightbox]');
    if (!dlg || typeof dlg.showModal !== 'function') return;
    var img = $('[data-lightbox-img]', dlg);
    var caption = $('[data-lightbox-caption]', dlg);
    var count = $('[data-lightbox-count]', dlg);
    var stage = $('.lightbox__stage', dlg);
    var closeBtn = $('[data-lightbox-close]', dlg);
    var items = [];
    var index = 0;
    var trigger = null;
    var startX = null;
    var startY = null;
    var swiped = false;

    function pad(n) { return (n < 10 ? '0' : '') + n; }

    function zoomSrc(el) {
      var direct = el.getAttribute('data-zoom-src');
      if (direct) return direct;
      var best = null;
      var bestW = 0;
      (el.getAttribute('srcset') || '').split(',').forEach(function (part) {
        var bits = part.trim().split(/\s+/);
        var w = parseInt(bits[1], 10) || 0;
        if (bits[0] && w >= bestW) { best = bits[0]; bestW = w; }
      });
      return best || el.getAttribute('src');
    }

    function render() {
      var item = items[index];
      var text = item.thumb ? item.thumb.alt : '';
      img.classList.remove('is-in');
      img.src = item.src;
      img.alt = text;
      void img.offsetWidth;
      img.classList.add('is-in');
      caption.textContent = text;
      count.textContent = pad(index + 1) + ' / ' + pad(items.length);
      dlg.classList.toggle('is-single', items.length < 2);
      if (items.length < 2) return;
      [index - 1, index + 1].forEach(function (k) {
        var pre = new Image();
        pre.src = items[(k + items.length) % items.length].src;
      });
    }

    function go(step) {
      if (items.length < 2) return;
      index = (index + step + items.length) % items.length;
      render();
    }

    function open(list, i, from) {
      items = list;
      index = i;
      trigger = from;
      render();
      if (!dlg.open) dlg.showModal();
      root.classList.add('lightbox-open');
      if (closeBtn) closeBtn.focus();
    }

    var links = $$('[data-gallery] a');
    var galleryItems = links.map(function (link) {
      return { src: link.getAttribute('href'), thumb: $('img', link) };
    });
    links.forEach(function (link, i) {
      link.addEventListener('click', function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        open(galleryItems, i, link);
      });
    });

    var ZOOM_LABEL = { en: 'Enlarge screenshot', de: 'Screenshot vergrößern' };
    var ZOOM_ICON = '<svg aria-hidden="true" viewBox="0 0 16 16"><path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9"/></svg>';

    $$('main .shot, main .bento__item').forEach(function (host) {
      if (host.closest('[data-feed], [data-vlab]')) return;
      var imgs = Array.prototype.filter.call(host.children, function (el) { return el.tagName === 'IMG'; });
      if (!imgs.length) return;
      var btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'zoom-btn';
      btn.setAttribute('data-en-aria-label', ZOOM_LABEL.en);
      btn.setAttribute('data-de-aria-label', ZOOM_LABEL.de);
      btn.setAttribute('aria-label', ZOOM_LABEL[lang()]);
      btn.innerHTML = ZOOM_ICON;
      host.classList.add('zoom-host');
      host.appendChild(btn);

      function openHost() {
        var start = 0;
        var list = imgs.map(function (el, j) {
          if (!el.hidden) start = j;
          return { src: zoomSrc(el), thumb: el };
        });
        open(list, start, btn);
      }

      btn.addEventListener('click', openHost);
      imgs.forEach(function (el) {
        el.classList.add('zoomable');
        el.addEventListener('click', openHost);
      });
    });

    $('[data-lightbox-prev]', dlg).addEventListener('click', function () { go(-1); });
    $('[data-lightbox-next]', dlg).addEventListener('click', function () { go(1); });
    if (closeBtn) closeBtn.addEventListener('click', function () { dlg.close(); });

    dlg.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    });

    dlg.addEventListener('click', function (e) {
      if (swiped) { swiped = false; return; }
      if (e.target === dlg || e.target === stage) dlg.close();
    });

    dlg.addEventListener('close', function () {
      root.classList.remove('lightbox-open');
      if (trigger) trigger.focus();
    });

    stage.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;
      startX = e.clientX;
      startY = e.clientY;
    });
    stage.addEventListener('pointerup', function (e) {
      if (startX === null) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      startX = null;
      if (items.length > 1 && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        swiped = true;
        window.setTimeout(function () { swiped = false; }, 400);
        go(dx < 0 ? 1 : -1);
      }
    });
    stage.addEventListener('pointercancel', function () { startX = null; });

    doc.addEventListener('propwash:lang', function () {
      if (!dlg.open || !items[index] || !items[index].thumb) return;
      img.alt = items[index].thumb.alt;
      caption.textContent = img.alt;
    });
  })();
})();
