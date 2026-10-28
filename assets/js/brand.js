(function () {
  'use strict';

  var doc = document;
  var status = doc.querySelector('[data-brand-status]');

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

  function label(el) {
    if (!el) return '';
    var own = el.querySelector('[lang="' + doc.documentElement.lang + '"]');
    return (own || el).textContent.replace(/\s+/g, ' ').trim();
  }

  Array.prototype.forEach.call(doc.querySelectorAll('[data-copy-value]'), function (btn) {
    var timer = 0;
    btn.addEventListener('click', function () {
      var value = btn.getAttribute('data-copy-value');
      copyText(value).then(function () {
        btn.classList.add('is-done');
        if (status) status.textContent = label(btn.querySelector('.brand-copy__done')) + ': ' + value;
        window.clearTimeout(timer);
        timer = window.setTimeout(function () { btn.classList.remove('is-done'); }, 1600);
      }, function () {});
    });
  });
})();
