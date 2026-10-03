// Reads the public surface of Java source files: package, imports, types (class, interface, record, enum), record
// components, enum constants and the public members with their signatures. Method bodies and initializers are skipped,
// so this is not a Java parser in general, only enough for the API package of Propwash (Java 25, Mojang names, no
// comments in the mod code; comments are skipped anyway).

const KINDS = new Set(['class', 'interface', 'enum', 'record']);
const MODIFIERS = new Set(['public', 'protected', 'private', 'static', 'final', 'abstract', 'default', 'sealed',
  'synchronized', 'native', 'transient', 'volatile', 'strictfp']);
const OBJECT_METHODS = new Set(['toString', 'equals', 'hashCode']);

export function tokenize(text) {
  const tokens = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f') { i++; continue; }
    if (c === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') i++; continue; }
    if (c === '/' && text[i + 1] === '*') { const end = text.indexOf('*/', i + 2); i = end < 0 ? n : end + 2; continue; }
    if (c === '"' && text.startsWith('"""', i)) {
      let j = i + 3;
      while (j < n && !(text.startsWith('"""', j) && text[j - 1] !== '\\')) j++;
      tokens.push({ t: 'str', v: text.slice(i, j + 3) });
      i = j + 3;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && text[j] !== c) { if (text[j] === '\\') j++; j++; }
      tokens.push({ t: c === '"' ? 'str' : 'chr', v: text.slice(i, j + 1) });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_$]/.test(text[j])) j++;
      tokens.push({ t: 'id', v: text.slice(i, j) });
      i = j;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(text[i + 1] || ''))) {
      let j = i + 1;
      while (j < n && /[0-9A-Za-z_.]/.test(text[j])) {
        if ((text[j] === 'e' || text[j] === 'E') && (text[j + 1] === '-' || text[j + 1] === '+')) j++;
        j++;
      }
      tokens.push({ t: 'num', v: text.slice(i, j) });
      i = j;
      continue;
    }
    if (text.startsWith('...', i)) { tokens.push({ t: 'op', v: '...' }); i += 3; continue; }
    if (text.startsWith('::', i) || text.startsWith('->', i)) { tokens.push({ t: 'op', v: text.slice(i, i + 2) }); i += 2; continue; }
    tokens.push({ t: 'op', v: c });
    i++;
  }
  return tokens;
}

function isKeywordBeforeAngle(v) {
  return MODIFIERS.has(v) || v === ',' || v === '(';
}

export function joinTokens(tokens) {
  let out = '';
  let prev = null;
  for (const tok of tokens) {
    const v = tok.v;
    let space = prev !== null;
    if (prev !== null) {
      const p = prev.v;
      if ([',', ')', ']', '.', '...', '>', ';'].includes(v)) space = false;
      else if (['(', '[', '.', '<', '@'].includes(p)) space = false;
      else if (v === '(' || v === '[') space = false;
      else if (v === '<') space = isKeywordBeforeAngle(p);
      if (v === '...' ) space = false;
      if (p === '...') space = true;
      if (p === ',') space = true;
    }
    out += (space ? ' ' : '') + v;
    prev = tok;
  }
  return out;
}

class Cursor {
  constructor(tokens) { this.tokens = tokens; this.i = 0; }
  peek(k = 0) { return this.tokens[this.i + k]; }
  next() { return this.tokens[this.i++]; }
  done() { return this.i >= this.tokens.length; }
  is(v, k = 0) { const t = this.peek(k); return !!t && t.v === v; }
  expect(v) {
    const t = this.next();
    if (!t || t.v !== v) throw new Error(`erwartet "${v}", gefunden "${t ? t.v : 'Dateiende'}" bei Token ${this.i}`);
    return t;
  }
  balanced(open, close) {
    const start = this.i;
    this.expect(open);
    let depth = 1;
    while (depth > 0) {
      const t = this.next();
      if (!t) throw new Error(`"${close}" fehlt`);
      if (t.v === open) depth++;
      else if (t.v === close) depth--;
    }
    return this.tokens.slice(start, this.i);
  }
}

function readAnnotation(cur) {
  const start = cur.i;
  cur.expect('@');
  cur.next();
  while (cur.is('.')) { cur.next(); cur.next(); }
  if (cur.is('(')) cur.balanced('(', ')');
  return joinTokens(cur.tokens.slice(start, cur.i));
}

function readModifiers(cur) {
  const modifiers = [];
  const annotations = [];
  for (;;) {
    const t = cur.peek();
    if (!t) break;
    if (t.v === '@' && !(cur.peek(1) && cur.peek(1).v === 'interface')) { annotations.push(readAnnotation(cur)); continue; }
    if (t.v === 'non' && cur.is('-', 1) && cur.is('sealed', 2)) { cur.next(); cur.next(); cur.next(); modifiers.push('non-sealed'); continue; }
    if (t.t === 'id' && MODIFIERS.has(t.v)) {
      if (t.v === 'sealed' && !(cur.peek(1) && (cur.peek(1).t === 'id'))) break;
      modifiers.push(cur.next().v);
      continue;
    }
    break;
  }
  return { modifiers, annotations };
}

function readTypeParams(cur) {
  if (!cur.is('<')) return '';
  const start = cur.i;
  let depth = 0;
  do {
    const t = cur.next();
    if (t.v === '<') depth++;
    else if (t.v === '>') depth--;
  } while (depth > 0);
  return joinTokens(cur.tokens.slice(start, cur.i));
}

function skipInitializer(cur) {
  let depth = 0;
  for (;;) {
    const t = cur.next();
    if (!t) throw new Error('Initialisierer ohne ";"');
    if (t.v === '(' || t.v === '{' || t.v === '[') depth++;
    else if (t.v === ')' || t.v === '}' || t.v === ']') depth--;
    else if (t.v === ';' && depth === 0) return;
  }
}

function literalText(tokens) {
  if (tokens.length === 1 && ['str', 'chr', 'num'].includes(tokens[0].t)) return tokens[0].v;
  if (tokens.length === 2 && tokens[0].v === '-' && tokens[1].t === 'num') return '-' + tokens[1].v;
  if (tokens.length === 1 && ['true', 'false', 'null'].includes(tokens[0].v)) return tokens[0].v;
  return null;
}

function parseEnumConstants(cur) {
  const constants = [];
  for (;;) {
    while (cur.is('@')) readAnnotation(cur);
    if (cur.is(';')) { cur.next(); break; }
    if (cur.is('}')) break;
    const name = cur.next().v;
    let args = [];
    if (cur.is('(')) {
      const toks = cur.balanced('(', ')').slice(1, -1);
      let depth = 0;
      let current = [];
      for (const t of toks) {
        if (t.v === '(' || t.v === '{' || t.v === '[') depth++;
        if (t.v === ')' || t.v === '}' || t.v === ']') depth--;
        if (t.v === ',' && depth === 0) { args.push(current); current = []; continue; }
        current.push(t);
      }
      if (current.length) args.push(current);
      args = args.map((a) => literalText(a) ?? joinTokens(a));
    }
    if (cur.is('{')) cur.balanced('{', '}');
    constants.push({ name, args });
    if (cur.is(',')) { cur.next(); continue; }
    if (cur.is(';')) { cur.next(); break; }
    if (cur.is('}')) break;
  }
  return constants;
}

function visible(kind, modifiers) {
  if (modifiers.includes('private')) return false;
  if (kind === 'interface') return true;
  return modifiers.includes('public') || modifiers.includes('protected');
}

function parseType(cur, outerKind, mods) {
  let kind = cur.next().v;
  if (kind === '@') { cur.next(); kind = 'annotation'; }
  const name = cur.next().v;
  const typeParams = readTypeParams(cur);
  let components = '';
  let componentList = [];
  if (kind === 'record') {
    const toks = cur.balanced('(', ')');
    components = joinTokens(toks);
    componentList = splitParams(toks.slice(1, -1));
  }
  const clauses = {};
  let clause = null;
  let clauseTokens = [];
  while (!cur.is('{')) {
    const t = cur.next();
    if (['extends', 'implements', 'permits'].includes(t.v)) {
      if (clause) clauses[clause] = joinTokens(clauseTokens);
      clause = t.v;
      clauseTokens = [];
    } else {
      clauseTokens.push(t);
    }
  }
  if (clause) clauses[clause] = joinTokens(clauseTokens);
  cur.expect('{');
  const type = {
    name, kind, modifiers: mods.modifiers, annotations: mods.annotations, typeParams, components, componentList,
    extends: clauses.extends || '', implements: clauses.implements || '', permits: clauses.permits || '',
    constants: [], members: [], types: [],
  };
  if (kind === 'enum') type.constants = parseEnumConstants(cur);
  parseBody(cur, type);
  return type;
}

function splitParams(tokens) {
  const params = [];
  let depth = 0;
  let current = [];
  for (const t of tokens) {
    if (t.v === '<' || t.v === '(') depth++;
    if (t.v === '>' || t.v === ')') depth--;
    if (t.v === ',' && depth === 0) { params.push(current); current = []; continue; }
    current.push(t);
  }
  if (current.length) params.push(current);
  return params.map((p) => {
    const text = joinTokens(p);
    const last = p[p.length - 1];
    return { name: last ? last.v : '', text };
  });
}

function parseBody(cur, type) {
  for (;;) {
    const t = cur.peek();
    if (!t) throw new Error(`"}" fehlt am Ende von ${type.name}`);
    if (t.v === '}') { cur.next(); return; }
    if (t.v === ';') { cur.next(); continue; }
    const mods = readModifiers(cur);
    const head = cur.peek();
    if (head.v === '{') { cur.balanced('{', '}'); continue; }
    if (KINDS.has(head.v) || (head.v === '@' && cur.is('interface', 1))) {
      const nested = parseType(cur, type.kind, mods);
      if (visible(type.kind, mods.modifiers)) type.types.push(nested);
      continue;
    }
    if (type.kind === 'record' && head.v === type.name && cur.is('{', 1)) {
      cur.next();
      cur.balanced('{', '}');
      continue;
    }
    const start = cur.i;
    let member = null;
    for (;;) {
      const x = cur.peek();
      if (!x) throw new Error(`Mitglied ohne Ende in ${type.name}`);
      if (x.v === '<') { readTypeParams(cur); continue; }
      if (x.v === '(') {
        const nameTok = cur.tokens[cur.i - 1];
        const headTokens = cur.tokens.slice(start, cur.i);
        const params = cur.balanced('(', ')');
        while (!cur.is('{') && !cur.is(';')) cur.next();
        const throwsTokens = [];
        if (cur.is('{')) cur.balanced('{', '}'); else cur.next();
        const isCtor = nameTok.v === type.name && headTokens.length === 1;
        const paramList = splitParams(params.slice(1, -1));
        member = {
          kind: isCtor ? 'constructor' : 'method',
          name: nameTok.v,
          modifiers: mods.modifiers,
          annotations: mods.annotations,
          returns: isCtor ? '' : joinTokens(headTokens.slice(0, -1)),
          params: paramList.map((p) => p.text),
          signature: joinTokens([...headTokens, ...params, ...throwsTokens]),
        };
        break;
      }
      if (x.v === '=' || x.v === ';') {
        const declTokens = cur.tokens.slice(start, cur.i);
        let value = null;
        if (x.v === '=') {
          cur.next();
          const valueStart = cur.i;
          skipInitializer(cur);
          value = literalText(cur.tokens.slice(valueStart, cur.i - 1));
        } else {
          cur.next();
        }
        const nameTok = declTokens[declTokens.length - 1];
        member = {
          kind: 'field',
          name: nameTok.v,
          modifiers: mods.modifiers,
          annotations: mods.annotations,
          returns: joinTokens(declTokens.slice(0, -1)),
          value,
          signature: joinTokens(declTokens) + (value !== null ? ' = ' + value : ''),
        };
        break;
      }
      cur.next();
    }
    if (!member) continue;
    const isInterface = type.kind === 'interface';
    const memberVisible = isInterface ? !member.modifiers.includes('private') : visible(type.kind, member.modifiers);
    if (!memberVisible) continue;
    if (member.annotations.includes('@Override') && (OBJECT_METHODS.has(member.name) || member.name === 'compareTo')) continue;
    type.members.push(member);
  }
}

export function parseJava(text) {
  const cur = new Cursor(tokenize(text));
  const unit = { package: '', imports: [], types: [] };
  while (!cur.done()) {
    if (cur.is('package')) {
      cur.next();
      const start = cur.i;
      while (!cur.is(';')) cur.next();
      unit.package = joinTokens(cur.tokens.slice(start, cur.i));
      cur.next();
      continue;
    }
    if (cur.is('import')) {
      cur.next();
      const isStatic = cur.is('static');
      if (isStatic) cur.next();
      const start = cur.i;
      while (!cur.is(';')) cur.next();
      unit.imports.push({ name: joinTokens(cur.tokens.slice(start, cur.i)), static: isStatic });
      cur.next();
      continue;
    }
    if (cur.is(';')) { cur.next(); continue; }
    const mods = readModifiers(cur);
    const type = parseType(cur, null, mods);
    unit.types.push(type);
  }
  return unit;
}

export function memberDisplay(member, ownerKind) {
  const mods = member.modifiers.filter((m) => {
    if (m === 'public') return false;
    if (m === 'final' && member.kind !== 'field') return false;
    if (ownerKind === 'interface' && m === 'abstract') return false;
    return true;
  });
  const anns = member.annotations.filter((a) => a !== '@Override' && a !== '@FunctionalInterface');
  const prefix = [...anns, ...mods].join(' ');
  return (prefix ? prefix + ' ' : '') + member.signature;
}
