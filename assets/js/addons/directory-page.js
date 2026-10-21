// The page /addons/: the filter by kind (parts, game modes, accessories, tools). Without JavaScript every add-on is
// shown; the cards and their texts are written by tools/build-addons.mjs.

const filter = document.querySelector('[data-addons-filter]');
const none = document.querySelector('[data-addons-none]');
const cards = [...document.querySelectorAll('[data-addons-cards] [data-kinds]')];

function show(kind) {
  let visible = 0;
  for (const card of cards) {
    const on = kind === 'all' || card.dataset.kinds.split(' ').includes(kind);
    card.hidden = !on;
    if (on) visible++;
  }
  for (const button of filter.querySelectorAll('[data-kind]')) button.setAttribute('aria-pressed', String(button.dataset.kind === kind));
  if (none) none.hidden = visible > 0 || kind === 'all';
}

if (filter) {
  filter.addEventListener('click', (e) => {
    const button = e.target.closest('[data-kind]');
    if (button) show(button.dataset.kind);
  });
  const wanted = new URLSearchParams(location.search).get('kind');
  if (wanted && filter.querySelector(`[data-kind="${CSS.escape(wanted)}"]`)) show(wanted);
}
