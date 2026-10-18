// A small HTML reader for the site's own pages (no npm packages): elements with their offsets, so a page can be
// rewritten by replacing ranges. It expects well-formed pages (tools/test-docs.mjs checks the docs for that) and
// knows void elements, self-closing SVG elements, comments and raw text in <script>/<style>.

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title']);

export function decode(value) {
  return value
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
}

export function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Attributes of a start tag's source ("<a href=\"x\" hidden>") as [{name, value, start, end}] with offsets. */
export function parseAttrs(tag, offset = 0) {
  const out = [];
  const re = /\s([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  const body = tag.replace(/^<[^\s>\/]+/, (m) => ' '.repeat(m.length));
  let m;
  while ((m = re.exec(body))) {
    if (m[1] === '/') continue;
    const raw = m[2] ?? m[3] ?? m[4];
    out.push({ name: m[1].toLowerCase(), value: raw === undefined ? '' : decode(raw), raw: raw ?? null, start: offset + m.index, end: offset + m.index + m[0].length });
  }
  return out;
}

/**
 * The element tree of a page: {name, attrs, start, end, innerStart, innerEnd, children, parent}. The root is a
 * pseudo element over the whole document. Text is not kept as nodes; it lies between the children's ranges.
 */
export function parse(html) {
  const doc = { name: '#document', attrs: [], start: 0, end: html.length, innerStart: 0, innerEnd: html.length, children: [], parent: null };
  const stack = [doc];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[0].startsWith('<!')) continue;
    const top = stack[stack.length - 1];
    if (m[1]) {
      const name = m[1].toLowerCase();
      let i = stack.length - 1;
      while (i > 0 && stack[i].name !== name) i--;
      if (i === 0) continue;
      while (stack.length > i) {
        const el = stack.pop();
        el.innerEnd = m.index;
        el.end = stack.length === i ? m.index + m[0].length : m.index;
      }
      continue;
    }
    const name = m[2].toLowerCase();
    const el = { name, attrs: parseAttrs(m[0], m.index), start: m.index, end: m.index + m[0].length, innerStart: m.index + m[0].length, innerEnd: m.index + m[0].length, children: [], parent: top, tagEnd: m.index + m[0].length };
    top.children.push(el);
    if (VOID.has(name) || m[4] === '/') continue;
    if (RAW.has(name)) {
      const close = new RegExp(`</${name}\\s*>`, 'ig');
      close.lastIndex = re.lastIndex;
      const c = close.exec(html);
      const stop = c ? c.index : html.length;
      el.innerEnd = stop;
      el.end = c ? stop + c[0].length : html.length;
      re.lastIndex = el.end;
      continue;
    }
    stack.push(el);
  }
  while (stack.length > 1) {
    const el = stack.pop();
    el.innerEnd = html.length;
    el.end = html.length;
  }
  return doc;
}

export const attr = (el, name) => {
  const a = el.attrs.find((x) => x.name === name);
  return a ? a.value : null;
};
export const hasClass = (el, cls) => (attr(el, 'class') || '').split(/\s+/).includes(cls);

/** Every element of the tree in document order. */
export function* walk(node) {
  for (const child of node.children) {
    yield child;
    yield* walk(child);
  }
}

/**
 * The English/German pairs of a page: an element with lang="en" directly followed (only whitespace between) by an
 * element of the same name with lang="de". Elements with the class "keep" (the EN/DE switch) are not pairs. Returns
 * {pairs, single}: single = elements with lang="en"/"de" outside any pair and not inside one.
 */
export function findPairs(html, doc = parse(html), { skip = () => false } = {}) {
  const pairs = [];
  const single = [];
  const visit = (node) => {
    const kids = node.children;
    for (let i = 0; i < kids.length; i++) {
      const el = kids[i];
      if (skip(el)) continue;
      const lang = attr(el, 'lang');
      if ((lang === 'en' || lang === 'de') && el.name !== 'html' && !hasClass(el, 'keep')) {
        const next = kids[i + 1];
        if (lang === 'en' && next && next.name === el.name && attr(next, 'lang') === 'de' && !hasClass(next, 'keep') && !html.slice(el.end, next.start).trim()) {
          pairs.push({ en: el, de: next, start: el.start, end: next.end });
          i++;
          continue;
        }
        single.push(el);
        continue;
      }
      visit(el);
    }
  };
  visit(doc);
  return { pairs, single };
}

export const inner = (html, el) => html.slice(el.innerStart, el.innerEnd);

/** Applies [{start, end, text}] replacements (non-overlapping) to a string. */
export function splice(source, edits) {
  const sorted = [...edits].sort((a, b) => a.start - b.start);
  let out = '';
  let at = 0;
  for (const e of sorted) {
    if (e.start < at) throw new Error(`overlapping edits at ${e.start}`);
    out += source.slice(at, e.start) + e.text;
    at = e.end;
  }
  return out + source.slice(at);
}

/** The text of an HTML fragment (tags removed, entities decoded, whitespace collapsed). */
export function plain(fragment) {
  return decode(fragment.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** The tags of an HTML fragment as a sorted list of "name attr=value …" (the markup a translation has to keep). */
export function tagSignature(fragment) {
  const tags = [];
  for (const m of fragment.matchAll(/<(\/?)([a-zA-Z][\w:-]*)([^>]*)>/g)) {
    if (m[1]) { tags.push(`/${m[2].toLowerCase()}`); continue; }
    const attrs = parseAttrs(`<${m[2]}${m[3]}>`).filter((a) => !['alt', 'title', 'aria-label'].includes(a.name)).map((a) => `${a.name}=${a.value}`).sort();
    tags.push([m[2].toLowerCase(), ...attrs].join(' '));
  }
  return tags.sort();
}
