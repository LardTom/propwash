// Converter of old share codes (the page /convert/ and the configurator): finds every PW1, PW2 and PW3 code in any text,
// e.g. a whole Discord post, converts PW1 and PW2 to PW3 like the mod (ShareConvert, sharecode.js convert), checks PW3
// codes, and puts the new codes in place of the old ones. Runs in the browser only; nothing is sent anywhere.

/** At most this many codes per pass (website design 0.6.0, 3.5.3). */
export const MAX_CODES = 100;

// A code in running text: the prefix (any case), optionally a dash, then Base62/Base32 symbols, dashes between groups
// (PW1 writes groups of five). Letters or digits right before or after it mean it is part of a longer word.
const CODE = /(?<![0-9A-Za-z])(PW[123]-?[0-9A-Za-z]+(?:-[0-9A-Za-z]+)*)(?![0-9A-Za-z])/gi;

/**
 * Every share code in a text, in order: {code, start, end, format} with format 'PW1', 'PW2' or 'PW3' (from the
 * prefix; the reader decides whether it is valid). Codes inside links (configurator/#PW2…) count too.
 */
export function findCodes(text) {
  const out = [];
  if (typeof text !== 'string') return out;
  for (const m of text.matchAll(CODE)) {
    const code = m[1].replace(/-+$/, '');
    out.push({ code, start: m.index, end: m.index + code.length, format: code.slice(0, 3).toUpperCase() });
  }
  return out;
}

/**
 * Outcome of one code: kind 'converted' (old code, new PW3 code in code), 'pw3' (already PW3 and readable),
 * 'unknown' (readable, but with parts this site does not know, e.g. of an add-on that is not loaded), 'not_convertible'
 * (reason), 'damaged' (status of the reader: CHECKSUM, TRUNCATED, …); plus the drone's name, frame and class.
 */
export function convertCode(code, catalog) {
  const format = code.slice(0, 3).toUpperCase();
  const result = { from: code, format, kind: 'damaged', status: 'CORRUPT', code: null, reason: null, name: null, frame: null, role: null,
    unknown: [], missing: [], namespaces: [] };
  const conversion = catalog.convert(code);
  result.status = conversion.status;
  if (conversion.status === 'NOT_CONVERTIBLE') {
    result.kind = 'not_convertible';
    result.reason = conversion.reason;
  }
  if (conversion.status !== 'OK') {
    const old = catalog.decode(code);
    if (old.ok) describe(result, old, catalog);
    return result;
  }
  result.code = conversion.code;
  const decoded = catalog.decode(conversion.code);
  if (!decoded.ok) {
    result.kind = 'damaged';
    result.status = decoded.status;
    return result;
  }
  describe(result, decoded, catalog);
  result.kind = result.unknown.length ? 'unknown' : conversion.converted ? 'converted' : 'pw3';
  return result;
}

function describe(result, decoded, catalog) {
  const build = decoded.content.build;
  result.name = decoded.content.name;
  const frame = catalog.part(build.frame);
  result.frame = build.frame;
  result.role = frame && frame.category === 'frame' ? frame.data.role : null;
  result.unknown = [...decoded.unknownParts, ...decoded.wrongKind];
  result.namespaces = decoded.namespaces;
  result.missing = decoded.namespaces.filter((n) => n.result !== 'MATCH' && n.result !== 'NO_TABLE');
}

/**
 * Converts every code of a text (at most MAX_CODES, the rest stays as it is): {text (the text with every converted
 * code in place of the old one), codes (one result per distinct code, in order of appearance, with count), found
 * (all codes in the text), skipped (codes beyond MAX_CODES)}.
 */
export function convertText(text, catalog) {
  const found = findCodes(text);
  const handled = found.slice(0, MAX_CODES);
  const byCode = new Map();
  for (const f of handled) {
    if (!byCode.has(f.code)) byCode.set(f.code, { ...convertCode(f.code, catalog), count: 0 });
    byCode.get(f.code).count++;
  }
  let out = '';
  let at = 0;
  for (const f of handled) {
    const r = byCode.get(f.code);
    out += text.slice(at, f.start) + (r.code && r.kind !== 'damaged' ? r.code : f.code);
    at = f.end;
  }
  out += text.slice(at);
  return { text: out, codes: [...byCode.values()], found: found.length, skipped: Math.max(0, found.length - MAX_CODES) };
}
