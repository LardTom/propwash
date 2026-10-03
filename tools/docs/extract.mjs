// Reads a Propwash checkout (sources, resources, language files) and the world-rules export and writes the data the
// docs pages are rendered from (tools/docs/data/*.json). Everything here comes from the mod's code; the texts that
// explain it live in tools/docs/pages/.

import fs from 'node:fs';
import path from 'node:path';
import { parseJava, memberDisplay } from './java-api.mjs';

const JAVA = 'common/src/main/java/de/lardtom/propwash';
const RES = 'common/src/main/resources';
const LANG = 'common/src/lang';
const API_PACKAGE = 'de.lardtom.propwash.api';

const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (root, rel) => fs.existsSync(path.join(root, rel));

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
    .sort();
}

function properties(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_.]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function constant(text, name) {
  const m = text.match(new RegExp(`static final [A-Za-z<>]+ ${name}\\s*=\\s*("(?:[^"\\\\]|\\\\.)*"|[-0-9._]+)\\s*;`));
  if (!m) throw new Error(`Konstante ${name} nicht gefunden`);
  return m[1].startsWith('"') ? JSON.parse(m[1]) : Number(m[1].replace(/_/g, ''));
}

export function loadLang(root) {
  const lang = { en: {}, de: {} };
  const dir = path.join(root, LANG);
  for (const module of fs.readdirSync(dir).sort()) {
    for (const [code, file] of [['en', 'en_us.json'], ['de', 'de_de.json']]) {
      const p = path.join(dir, module, file);
      if (fs.existsSync(p)) Object.assign(lang[code], JSON.parse(fs.readFileSync(p, 'utf8')));
    }
  }
  return lang;
}

function both(lang, key, required = true) {
  const en = lang.en[key];
  const de = lang.de[key];
  if (required && (en === undefined || de === undefined)) throw new Error(`Sprachschlüssel fehlt: ${key}`);
  return en === undefined && de === undefined ? null : { en: en ?? null, de: de ?? null };
}

function trimType(type) {
  return {
    name: type.name,
    kind: type.kind,
    modifiers: type.modifiers.filter((m) => ['sealed', 'abstract', 'non-sealed'].includes(m)),
    typeParams: type.typeParams,
    components: type.componentList.map((c) => c.text),
    extends: type.extends,
    implements: type.implements,
    permits: type.permits,
    constants: type.constants.map((c) => {
      const key = c.args.find((a) => typeof a === 'string' && a.startsWith('"'));
      return key ? { name: c.name, key: JSON.parse(key) } : { name: c.name };
    }),
    members: type.members.map((m) => ({ kind: m.kind, name: m.name, static: m.modifiers.includes('static'), display: memberDisplay(m, type.kind) })),
    types: type.types.map(trimType),
  };
}

function typeText(type) {
  return [type.typeParams, type.components.join(' '), type.extends, type.implements, type.permits,
    ...type.members.map((m) => m.display), ...type.types.map(typeText)].join(' ');
}

export function extractApi(root) {
  const base = path.join(root, JAVA, 'api');
  const packages = new Map();
  const imports = new Map();
  for (const file of walk(base).filter((f) => f.endsWith('.java'))) {
    const unit = parseJava(fs.readFileSync(file, 'utf8'));
    if (!unit.package.startsWith(API_PACKAGE)) throw new Error(`${file}: Paket ${unit.package}`);
    if (!packages.has(unit.package)) packages.set(unit.package, []);
    for (const type of unit.types) {
      if (!type.modifiers.includes('public')) continue;
      const trimmed = trimType(type);
      trimmed.file = path.relative(root, file).split(path.sep).join('/');
      packages.get(unit.package).push(trimmed);
      for (const imp of unit.imports) {
        if (imp.static || !imp.name.startsWith('de.lardtom.propwash.') || imp.name.startsWith(API_PACKAGE + '.')) continue;
        const simple = imp.name.slice(imp.name.lastIndexOf('.') + 1);
        if (new RegExp(`\\b${simple}\\b`).test(typeText(trimmed))) {
          if (!imports.has(imp.name)) imports.set(imp.name, new Set());
          imports.get(imp.name).add(`${unit.package.slice(API_PACKAGE.length + 1) || ''}${unit.package === API_PACKAGE ? '' : '.'}${type.name}`.replace(/^\./, ''));
        }
      }
    }
  }
  const apiText = read(root, `${JAVA}/api/PropwashApi.java`);
  return {
    version: constant(apiText, 'API_VERSION'),
    packages: [...packages.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, types]) => ({
      name, types: types.sort((a, b) => a.name.localeCompare(b.name)),
    })),
    external: [...imports.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, users]) => ({ name, usedBy: [...users].sort() })),
  };
}

const KEY_CALL = /\.(require[A-Za-z]*|opt[A-Za-z]*|[a-z]+Or|has|raw|enumList)\("([a-z0-9_]+)"/g;
const METHOD_CATEGORY = {
  decodeChemistry: 'chemistry', format: 'common', basics: 'common', recycle: 'common', visual: 'common',
  frame: 'frame', arms: 'frame', duct: 'frame', stack: 'stack', motor: 'motor', prop: 'prop', battery: 'battery',
  video: 'video', accessory: 'accessory', actionCam: 'accessory', sensorInches: 'accessory',
};

export function partJsonKeys(text) {
  const methods = [...text.matchAll(/^    (?:public |private )?static [^=;\n]*?\b([a-zA-Z]+)\(/gm)];
  const keys = {};
  for (let i = 0; i < methods.length; i++) {
    const name = methods[i][1];
    const body = text.slice(methods[i].index, i + 1 < methods.length ? methods[i + 1].index : text.length);
    const found = [...body.matchAll(KEY_CALL)].map((m) => m[2]);
    if (!found.length) continue;
    const category = METHOD_CATEGORY[name];
    if (!category) throw new Error(`PartJson.${name} liest Felder, gehört aber zu keiner Kategorie (METHOD_CATEGORY ergänzen)`);
    keys[category] = [...new Set([...(keys[category] || []), ...found])];
  }
  for (const k of Object.keys(keys)) keys[k].sort();
  return keys;
}

function enumKeys(root, rel) {
  const unit = parseJava(read(root, rel));
  const find = (types) => types.flatMap((t) => [t, ...find(t.types)]);
  const out = {};
  for (const type of find(unit.types)) {
    if (type.kind !== 'enum') continue;
    out[type.name] = type.constants.map((c) => {
      const key = c.args.find((a) => typeof a === 'string' && a.startsWith('"'));
      return key ? JSON.parse(key) : c.name.toLowerCase();
    });
  }
  return out;
}

export function extractParts(root, lang) {
  const partJson = read(root, `${JAVA}/parts/PartJson.java`);
  const part = (name) => `${JAVA}/api/part/${name}.java`;
  const enums = {
    kind: enumKeys(root, part('PartKind')).PartKind,
    role: enumKeys(root, part('FrameRole')).FrameRole,
    shape: enumKeys(root, part('FrameShape')).FrameShape,
    material: enumKeys(root, part('PropMaterial')).PropMaterial,
    link: enumKeys(root, part('VideoLink')).VideoLink,
    slot: enumKeys(root, part('AccessorySlot')).AccessorySlot,
    spin: enumKeys(root, part('MotorArm')).Spin,
  };
  const armKeys = partJson.match(/ARM_KEYS = List\.of\(([^)]*)\)/)[1].match(/"([a-z_]+)"/g).map((s) => JSON.parse(s));
  const mountsText = read(root, part('Mounts'));
  const mounts = [...mountsText.matchAll(/static final Identifier ([A-Z0-9_]+) = id\("([a-z0-9_]+)"\)/g)]
    .map((m) => ({ constant: m[1], id: `propwash:${m[2]}`, kind: m[1].split('_')[0].toLowerCase() }));
  const builtinDir = path.join(root, RES, 'data/propwash/propwash_parts');
  const builtin = {};
  for (const category of [...enums.kind, 'chemistry']) {
    const dir = path.join(builtinDir, category);
    if (!fs.existsSync(dir)) continue;
    builtin[category] = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => {
      const id = f.slice(0, -5);
      const json = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const nameKey = category === 'chemistry' ? `propwash.chemistry.${id}` : `part.propwash.${id}`;
      return { id: `propwash:${id}`, name: both(lang, nameKey, category !== 'chemistry'), sort: json.sort ?? 1000 };
    }).sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id)).map(({ sort, ...rest }) => rest);
  }
  const pick = { frame: 'freestyle_5', stack: 'stack_30', motor: 'm2207_1750', prop: 'p51_3b', video: 'analog_race',
    battery: 'b6s_1300', accessory: 'action_cam_light', chemistry: 'lipo' };
  const examples = {};
  for (const [category, id] of Object.entries(pick)) {
    examples[category] = { id: `propwash:${id}`, json: read(root, `${RES}/data/propwash/propwash_parts/${category}/${id}.json`).trim() };
  }
  const exampleAddon = 'common/src/devtest/resources/data/propwash_example/propwash_parts/frame/deadcat_5.json';
  if (exists(root, exampleAddon)) examples.addon_frame = { id: 'propwash_example:deadcat_5', json: read(root, exampleAddon).trim() };
  return {
    format: constant(partJson, 'FORMAT'),
    keys: partJsonKeys(partJson),
    armKeys,
    enums,
    rarities: ['common', 'uncommon', 'rare', 'epic'],
    mounts,
    builtin,
    examples,
  };
}

const KEY_LABELS = {
  UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→', PERIOD: '.', COMMA: ',', BACKSPACE: 'Backspace', SPACE: 'Space',
  TAB: 'Tab', ENTER: 'Enter', RETURN: 'Enter', ESCAPE: 'Esc', MINUS: '-', EQUALS: '=', SEMICOLON: ';', APOSTROPHE: "'", SLASH: '/',
  BACKSLASH: '\\', GRAVE: '`', LBRACKET: '[', RBRACKET: ']', HOME: 'Home', END: 'End', INSERT: 'Insert', DELETE: 'Delete',
  PAGEUP: 'Page Up', PAGEDOWN: 'Page Down',
};

function keyLabel(constantName) {
  if (constantName === 'UNBOUND') return null;
  const name = constantName.replace(/^InputConstants\.KEY_/, '');
  if (/^[A-Z0-9]$/.test(name)) return name;
  if (/^F[0-9]{1,2}$/.test(name)) return name;
  const numpad = name.match(/^NUMPAD([0-9])$/);
  if (numpad) return `Numpad ${numpad[1]}`;
  if (KEY_LABELS[name]) return KEY_LABELS[name];
  throw new Error(`Taste ${constantName} ohne Beschriftung (KEY_LABELS ergänzen)`);
}

export function extractControls(root, lang) {
  const text = read(root, `${JAVA}/input/client/KeyDefaults.java`);
  const entries = [...text.matchAll(/static final Entry ([A-Z_0-9]+) = (own|other)\("([a-z_0-9]+)", ([A-Za-z_.0-9]+)(?:, (true|false))?\)/g)]
    .map((m) => ({ constant: m[1], own: m[2] === 'own', name: m[3], key: keyLabel(m[4]), flightStick: m[5] === 'true' }));
  if (!entries.length) throw new Error('KeyDefaults: keine Einträge gefunden');
  const shared = [...text.matchAll(/Set\.of\(([A-Z_]+)\.mappingName\(\), ([A-Z_]+)\.mappingName\(\)\)/g)].map((m) => [m[1], m[2]]);
  const keys = entries.filter((e) => e.name !== 'selftest').map((e) => ({
    name: e.name,
    key: e.key,
    flightStick: e.flightStick,
    title: both(lang, `key.propwash.${e.name}`),
    sharedWith: shared.flatMap((pair) => (pair.includes(e.constant) ? pair.filter((c) => c !== e.constant) : []))
      .map((c) => entries.find((x) => x.constant === c).name),
  }));
  const switchText = read(root, `${JAVA}/input/SwitchFunction.java`);
  const switchNames = switchText.match(/enum SwitchFunction \{([^;]*);/)[1].split(',').map((s) => s.trim()).filter(Boolean);
  const switches = switchNames.map((n) => ({ name: n.toLowerCase(), title: both(lang, `propwash.input.switch.${n.toLowerCase()}`) }));
  return { keys, switches };
}

function javaNumber(expr, constants) {
  const clean = expr.trim();
  if (/^-?[0-9][0-9_]*(\.[0-9_]+)?([eE][-+]?[0-9]+)?[dDfFlL]?$/.test(clean)) return Number(clean.replace(/[_dDfFlL]/g, ''));
  if (clean === 'true' || clean === 'false') return clean === 'true';
  if (constants.has(clean)) return constants.get(clean);
  return null;
}

export function extractServerConfig(root) {
  const rel = `${JAVA}/server/ServerRulesConfig.java`;
  const text = read(root, rel);
  const constants = new Map();
  const collect = (src, prefix) => {
    for (const m of src.matchAll(/static final (?:int|double|long|boolean) ([A-Z_0-9]+) = ([^;]+);/g)) {
      const v = javaNumber(m[2], constants);
      if (v !== null) { constants.set(m[1], v); if (prefix) constants.set(`${prefix}.${m[1]}`, v); }
    }
  };
  const budget = `${JAVA}/server/StreamBudget.java`;
  if (exists(root, budget)) collect(read(root, budget), 'StreamBudget');
  collect(text, '');
  const fields = [...text.matchAll(/^    public (int|double|boolean|String) ([a-zA-Z0-9]+) = ([^;]+);/gm)].map((m) => {
    const field = { name: m[2], type: m[1], default: javaNumber(m[3], constants) };
    const clamp = text.match(new RegExp(`config\\.${m[2]} = clamp\\(config\\.${m[2]}, ([^,]+), ([^,)]+(?:\\([^)]*\\))?)`));
    if (clamp) {
      field.min = javaNumber(clamp[1], constants);
      field.max = javaNumber(clamp[2], constants);
    }
    return field;
  });
  if (!fields.length) throw new Error('ServerRulesConfig: keine Felder gefunden');
  return { file: 'config/propwash/server.json', fields };
}

export function extractMeta(root, overrideVersion) {
  const props = properties(read(root, 'gradle.properties'));
  const constants = read(root, `${JAVA}/Constants.java`);
  return {
    propwash: overrideVersion || props.version,
    minecraft: props.minecraft_version,
    protocol: constant(constants, 'PROTOCOL_VERSION'),
    api: constant(read(root, `${JAVA}/api/PropwashApi.java`), 'API_VERSION'),
    partsFormat: constant(read(root, `${JAVA}/parts/PartJson.java`), 'FORMAT'),
  };
}

export function checkGamerules(data) {
  if (data.format !== 1) throw new Error(`gamerules.json: Format ${data.format} unbekannt`);
  for (const rule of data.rules) {
    for (const field of ['id', 'name', 'group', 'type', 'default', 'title', 'description', 'example']) {
      if (rule[field] === undefined) throw new Error(`gamerules.json: ${rule.id || '?'} ohne ${field}`);
    }
    for (const code of ['en', 'de']) {
      if (!rule.title[code] || !rule.description[code]) throw new Error(`gamerules.json: ${rule.id} ohne Text ${code}`);
    }
    if (!data.groups.some((g) => g.id === rule.group)) throw new Error(`gamerules.json: ${rule.id} in unbekannter Gruppe ${rule.group}`);
  }
  return data;
}

export function extractAll(root, { gamerules, version } = {}) {
  if (!exists(root, `${JAVA}/api/PropwashApi.java`)) throw new Error(`kein Propwash-Quellbaum: ${root}`);
  const lang = loadLang(root);
  const out = {
    meta: extractMeta(root, version),
    api: extractApi(root),
    parts: extractParts(root, lang),
    controls: extractControls(root, lang),
    server: extractServerConfig(root),
  };
  if (gamerules) {
    out.gamerules = checkGamerules(JSON.parse(fs.readFileSync(gamerules, 'utf8')));
    if (version) {
      out.gamerules.version = version;
    } else if (out.gamerules.version !== out.meta.propwash) {
      throw new Error(`Welt-Regeln-Export stammt aus Propwash ${out.gamerules.version}, der Quellbaum ist ${out.meta.propwash} – tools/export_rules.sh neu ausführen`);
    }
  }
  return out;
}
