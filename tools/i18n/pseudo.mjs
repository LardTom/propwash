// Pseudo translations for the layout test (tools/test-layout.mjs) before the dictionaries exist: the English text
// with the letters of the language (Latin-1 accents for es/fr/pt-br, Latin Extended-A for pl, Cyrillic for ru) and
// as much longer as real translations run (20 to 30 %). Markup, entities, numbers and the terms that stay English
// are kept, so the pages break, wrap and overflow like translated ones would.

const MAPS = {
  latin1: { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', n: 'ñ', c: 'ç', y: 'ý', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú', N: 'Ñ', C: 'Ç' },
  pl: { a: 'ą', e: 'ę', l: 'ł', z: 'ż', s: 'ś', c: 'ć', n: 'ń', o: 'ó', A: 'Ą', E: 'Ę', L: 'Ł', Z: 'Ż', S: 'Ś', C: 'Ć', N: 'Ń', O: 'Ó' },
  ru: {
    a: 'а', b: 'б', c: 'ц', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'х', i: 'и', j: 'й', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о',
    p: 'п', q: 'щ', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', w: 'ш', x: 'ж', y: 'ы', z: 'з',
    A: 'А', B: 'Б', C: 'Ц', D: 'Д', E: 'Е', F: 'Ф', G: 'Г', H: 'Х', I: 'И', J: 'Й', K: 'К', L: 'Л', M: 'М', N: 'Н', O: 'О',
    P: 'П', Q: 'Щ', R: 'Р', S: 'С', T: 'Т', U: 'У', V: 'В', W: 'Ш', X: 'Ж', Y: 'Ы', Z: 'З',
  },
};
const SETTINGS = {
  es: { map: 'latin1', grow: 0.2, filler: 'aeo' },
  fr: { map: 'latin1', grow: 0.2, filler: 'eau' },
  'pt-br': { map: 'latin1', grow: 0.2, filler: 'aoe' },
  pl: { map: 'pl', grow: 0.3, filler: 'zcy' },
  ru: { map: 'ru', grow: 0.3, filler: 'oei' },
};

function word(w, s, map) {
  let out = '';
  for (const ch of w) out += map[ch] || ch;
  const extra = Math.round(w.length * s.grow);
  for (let i = 0; i < extra; i++) {
    const ch = s.filler[i % s.filler.length];
    out += map[ch] || ch;
  }
  return out;
}

function text(t, s, map, keep) {
  return t.replace(/&[a-zA-Z#0-9]+;|[A-Za-z][A-Za-z'’]*/g, (w) => {
    if (w.startsWith('&') || keep.has(w)) return w;
    return word(w, s, map);
  });
}

/**
 * Pseudo translation of an English text (HTML fragment) into a language code. keep: words that stay as they are
 * (glossary terms, single words of terms that stay English).
 */
export function pseudo(source, code, keep = new Set()) {
  const s = SETTINGS[code];
  if (!s) throw new Error(`pseudo: unknown language ${code}`);
  const map = MAPS[s.map];
  let verbatim = 0;
  return String(source).split(/(<[^>]*>)/).map((part, i) => {
    if (i % 2) {
      const m = /^<(\/?)(code|kbd|pre|samp)\b/i.exec(part);
      if (m) verbatim += m[1] ? -1 : 1;
      return part;
    }
    return verbatim > 0 ? part : text(part, s, map, keep);
  }).join('');
}
