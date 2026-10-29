#!/usr/bin/env node
// Builds the 3D data of the configurator's drone viewer from the web export of Propwash (format 2).
//
//   node tools/build-configurator-models.mjs [--export <web-export dir>] [--resources <mod resources dir> …] [--out <dir>]
//
// Same export location rules as tools/build-configurator-data.mjs (sibling checkout, JMP_WEB_EXPORT or --export).
// --out writes render.json and models/ to another folder instead of assets/data/configurator (for tests).
//
// Writes:
//   assets/data/configurator/render.json                        frame layouts (drone_layout.json), motor seats, paint
//                                                               channel references, accessory base tints
//   assets/data/configurator/models/<ns>/<category>/<path>.json one file per part with a model: the block-model
//                                                               elements in a compact form plus the textures as
//                                                               data URLs (base, paint, ccw, battery under and stack
//                                                               mounted variants) and the plug anchors (see below)
//
// Only files from the web export are used, with one exception: a stack's "_mounted" variant (battery plugged in,
// Propwash 0.6.0) that the export lacks is taken from a mod's resource folder given with --resources (a folder with
// assets/<namespace>/…, e.g. common/src/main/resources of Propwash or Just More Parts; PROPWASH_MOD_RESOURCES may list
// several, separated like PATH) – and only if that folder's render definition and model of the stack's base variant
// are byte-identical to the export's, the way the game only plugs a stack whose "_mounted" comes from the same pack as
// its base model. The block models keep Minecraft's model units (0–16 per model block); worn, damaged, broken and blur
// variants are left out because the configurator shows new parts at rest. A render definition may carry a vanilla
// "transformation" (JMP X-Class frames: the model is shrunk to fit the −16…32 model limit and scaled back to real
// size); it is baked into the element coordinates here.
//
// Plug anchors (battery plugged in, like PlugAnchors in Propwash), in millimetres around the part's position, measured
// in the drawn space (after the transformation): every battery variant gets `socket` (the box of its connector or
// bt_connector elements, the box of connector_grip, bt for a BT2.0 socket) and the stack's mounted variant `pigtail`
// (the two pigtail ends: red first, [x, y, end z, diameter]). With them assets/js/configurator/assembly.js finds the
// elements a plugged-in battery hides, as the compact models carry no element names.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportDir, readExport } from './build-configurator-data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets/data/configurator');
const DIRS = ['down', 'up', 'north', 'south', 'west', 'east'];

const round = (v) => Math.round(v * 10000) / 10000;

function modelFile(id) {
  const colon = id.indexOf(':');
  const ns = colon < 0 ? 'minecraft' : id.slice(0, colon);
  return `assets/${ns}/models/${id.slice(colon + 1)}.json`;
}

function textureFile(ref) {
  const id = typeof ref === 'string' ? ref : ref && ref.sprite;
  if (!id) throw new Error(`texture reference expected: ${JSON.stringify(ref)}`);
  const colon = id.indexOf(':');
  const ns = colon < 0 ? 'minecraft' : id.slice(0, colon);
  return `assets/${ns}/textures/${id.slice(colon + 1)}.png`;
}

// Euler angles (degrees, applied X then Y then Z like the mod's asset kit) of an element rotation.
function rotationOf(r) {
  if (!r) return 0;
  const o = r.origin.map(round);
  if (r.axis) {
    const a = round(r.angle);
    return [...o, r.axis === 'x' ? a : 0, r.axis === 'y' ? a : 0, r.axis === 'z' ? a : 0];
  }
  return [...o, round(r.x || 0), round(r.y || 0), round(r.z || 0)];
}

// Element corners after rotation, in model units (for the bounding box and the plug anchors).
function corners(e) {
  const pts = [];
  for (const x of [e.from[0], e.to[0]]) for (const y of [e.from[1], e.to[1]]) for (const z of [e.from[2], e.to[2]]) pts.push([x, y, z]);
  const r = rotationOf(e.rotation);
  if (!r) return pts;
  const [ox, oy, oz, ax, ay, az] = r;
  const rad = Math.PI / 180;
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(ax * rad), Math.sin(ax * rad), Math.cos(ay * rad), Math.sin(ay * rad),
    Math.cos(az * rad), Math.sin(az * rad)];
  return pts.map(([x, y, z]) => {
    let px = x - ox;
    let py = y - oy;
    let pz = z - oz;
    [py, pz] = [py * cx - pz * sx, py * sx + pz * cx];
    [px, pz] = [px * cy + pz * sy, -px * sy + pz * cy];
    [px, py] = [px * cz - py * sz, px * sz + py * cz];
    return [px + ox, py + oy, pz + oz];
  });
}

const IDENTITY_QUATERNION = [0, 0, 0, 1];

// Vanilla item transformation (translation, left_rotation, scale, right_rotation) applied in model space 0…1, i.e.
// p' = 16·translation + scale·p in model units. Only rotation-free transformations with a positive scale are baked;
// a non-uniform scale is only allowed for models without rotated elements.
function transformOf(t, where) {
  if (t == null) return null;
  if (Array.isArray(t) || typeof t !== 'object') throw new Error(`${where}: only the object form of "transformation" is supported`);
  for (const key of ['left_rotation', 'right_rotation']) {
    const q = t[key] == null ? IDENTITY_QUATERNION : t[key];
    if (!Array.isArray(q) || q.length !== 4 || q.some((v, i) => Math.abs(v - IDENTITY_QUATERNION[i]) > 1e-9)) {
      throw new Error(`${where}: "transformation.${key}" other than identity is not supported`);
    }
  }
  const scale = t.scale == null ? [1, 1, 1] : t.scale;
  const translation = t.translation == null ? [0, 0, 0] : t.translation;
  if (!Array.isArray(scale) || scale.length !== 3 || !scale.every((v) => Number.isFinite(v) && v > 0)) {
    throw new Error(`${where}: "transformation.scale" must be three positive numbers`);
  }
  if (!Array.isArray(translation) || translation.length !== 3 || !translation.every(Number.isFinite)) {
    throw new Error(`${where}: "transformation.translation" must be three numbers`);
  }
  if (scale.every((v) => v === 1) && translation.every((v) => v === 0)) return null;
  return { scale, offset: translation.map((v) => v * 16) };
}

function applyTransform(model, transform, where) {
  if (!transform) return model;
  const { scale, offset } = transform;
  const uniform = scale[0] === scale[1] && scale[1] === scale[2];
  const point = (p) => p.map((v, i) => offset[i] + scale[i] * v);
  const elements = (model.elements || []).map((e) => {
    if (e.rotation && !uniform) throw new Error(`${where}: non-uniform scale on a rotated element`);
    const out = { ...e, from: point(e.from), to: point(e.to) };
    if (e.rotation) out.rotation = { ...e.rotation, origin: point(e.rotation.origin) };
    return out;
  });
  return { ...model, elements };
}

function compactModel(model, where) {
  const textures = Object.entries(model.textures || {}).filter(([k]) => k !== 'particle');
  if (textures.length !== 1) throw new Error(`${where}: exactly one texture expected, found ${textures.length}`);
  const key = `#${textures[0][0]}`;
  const elements = [];
  const tints = [];
  const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const e of model.elements || []) {
    const faces = DIRS.map((dir) => {
      const f = e.faces && e.faces[dir];
      if (!f) return 0;
      if (f.texture !== key) throw new Error(`${where}: face texture ${f.texture} is not ${key}`);
      if (f.rotation) throw new Error(`${where}: UV rotation is not supported`);
      if (!f.uv) throw new Error(`${where}: face without uv`);
      tints.push(f.tintindex == null ? -1 : f.tintindex);
      return f.uv.map(round);
    });
    elements.push([...e.from.map(round), ...e.to.map(round), rotationOf(e.rotation), faces]);
    for (const p of corners(e)) {
      for (let i = 0; i < 3; i++) {
        box[i] = Math.min(box[i], p[i]);
        box[i + 3] = Math.max(box[i + 3], p[i]);
      }
    }
  }
  return { texture: textureFile(textures[0][1]), elements, tints, box: box.map(round) };
}

// ---------------------------------------------------------------------------------------------------------------
// Plug anchors (PlugAnchors): named element boxes in millimetres around the model point (8, 8, 8)

const PLUG_ELEMENTS = new Set(['connector', 'connector_grip', 'bt_connector']);
const mm = (v) => (v - 8) * 8;

/** Every element with its name and the box of its (rotated, transformed) corners in millimetres. */
export function namedBoxes(model) {
  return (model.elements || []).map((e) => {
    const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const p of corners(e)) {
      for (let i = 0; i < 3; i++) {
        box[i] = Math.min(box[i], mm(p[i]));
        box[i + 3] = Math.max(box[i + 3], mm(p[i]));
      }
    }
    return { name: typeof e.name === 'string' ? e.name : '', box };
  });
}

const union = (a, b) => (a ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[3], b[3]), Math.max(a[4], b[4]), Math.max(a[5], b[5])] : b.slice());

/** PlugAnchors.socket: the battery's socket (connector or bt_connector, and connector_grip), or null. */
export function socketOf(elements) {
  let body = null;
  let grip = null;
  let bt = false;
  for (const { name, box } of elements) {
    if (name === 'connector') body = union(body, box);
    else if (name === 'bt_connector') {
      body = union(body, box);
      bt = true;
    } else if (name === 'connector_grip') grip = union(grip, box);
  }
  if (!body || !(body[3] - body[0] > 0 && body[4] - body[1] > 0 && body[5] - body[2] > 0)) return null;
  return { body: body.map(round), grip: grip ? grip.map(round) : null, bt };
}

/** PlugAnchors.pigtail: the two pigtail ends of a mounted stack ([x, y, end z, diameter], red = smaller x first), or null. */
export function pigtailOf(elements) {
  if (elements.some((e) => PLUG_ELEMENTS.has(e.name))) return null;
  const leads = [];
  for (const { name, box } of elements) {
    if (name !== 'pigtail') continue;
    const diameter = Math.min(box[3] - box[0], box[4] - box[1]);
    if (!(diameter > 0)) return null;
    leads.push([(box[0] + box[3]) / 2, (box[1] + box[4]) / 2, box[5], diameter]);
  }
  if (leads.length !== 2) return null;
  const [first, second] = leads;
  return (second[0] < first[0] ? [second, first] : [first, second]).map((lead) => lead.map(round));
}

// ---------------------------------------------------------------------------------------------------------------

function resourceDirs(argv) {
  const out = [];
  argv.forEach((a, i) => {
    if (a === '--resources' && argv[i + 1]) out.push(path.resolve(argv[i + 1]));
  });
  if (process.env.PROPWASH_MOD_RESOURCES) out.push(...process.env.PROPWASH_MOD_RESOURCES.split(path.delimiter).filter(Boolean).map((d) => path.resolve(d)));
  return out;
}

function outDir(argv) {
  const i = argv.indexOf('--out');
  return i >= 0 && argv[i + 1] ? path.resolve(argv[i + 1]) : OUT;
}

function main() {
  const argv = process.argv.slice(2);
  const dir = exportDir(argv);
  const out = outDir(argv);
  const { manifest, namespaces } = readExport(dir);
  const resources = resourceDirs(argv);
  const parts = [];
  for (const ns of namespaces) for (const p of JSON.parse(fs.readFileSync(path.join(dir, ns, 'parts.json'), 'utf8'))) parts.push(p);

  const paintFiles = {};
  const layoutFiles = {};
  for (const ns of namespaces) {
    const assets = path.join(dir, ns, 'assets');
    if (!fs.existsSync(assets)) continue;
    for (const owner of fs.readdirSync(assets).sort()) {
      const paint = path.join(assets, owner, 'drone_paint.json');
      const layout = path.join(assets, owner, 'drone_layout.json');
      if (fs.existsSync(paint) && !(owner in paintFiles)) paintFiles[owner] = JSON.parse(fs.readFileSync(paint, 'utf8'));
      if (fs.existsSync(layout) && !(owner in layoutFiles)) layoutFiles[owner] = JSON.parse(fs.readFileSync(layout, 'utf8'));
    }
  }

  const channels = {};
  for (const file of Object.values(paintFiles)) Object.assign(channels, file.channels || {});

  // Paint tint groups of a render model ('<category>/<key>' in the namespace's drone_paint.json).
  function tintGroups(ns, local) {
    const file = paintFiles[ns];
    const groups = file && file.models && (file.models[local] || file.models[`${ns}:${local}`]);
    return groups ? groups.map((g) => [g.channel, g.base]) : null;
  }

  // A file of the export below the part's namespace folder, or (fallback) of a resource folder: {file, from}.
  const exportPath = (scope, rel) => path.join(dir, scope, rel);
  function locate(scope, rel, fallback) {
    const own = exportPath(scope, rel);
    if (fs.existsSync(own)) return { file: own, from: 'export' };
    if (fallback) {
      for (const res of resources) {
        const file = path.join(res, rel);
        if (fs.existsSync(file)) return { file, from: res };
      }
    }
    return null;
  }
  const readAt = (where) => JSON.parse(fs.readFileSync(where.file, 'utf8'));
  const sameBytes = (a, b) => !!a && !!b && fs.readFileSync(a).equals(fs.readFileSync(b));

  // Render definition of an export path, e.g. assets/propwash/items/drone_render/prop/p31_4b.json.
  function renderModel(where, defPath) {
    const def = readAt(where).model;
    if (!def || def.type !== 'minecraft:model') throw new Error(`${defPath}: plain minecraft:model expected`);
    return { model: def.model, transform: transformOf(def.transformation, defPath) };
  }

  const outModels = path.join(out, 'models');
  fs.rmSync(outModels, { recursive: true, force: true });
  let files = 0;
  let bytes = 0;
  const withModel = [];
  const counts = { sockets: 0, mounted: 0, mountedFromResources: 0, mountedMissing: [] };
  for (const p of parts) {
    const m = p.model || {};
    if (m.kind !== 'model' || !m.drone) continue;
    const scope = p.id.slice(0, p.id.indexOf(':'));
    const defPath = m.drone;
    const match = /^assets\/([^/]+)\/items\/drone_render\/(.+)\.json$/.exec(defPath);
    if (!match) throw new Error(`${p.id}: unexpected render definition ${defPath}`);
    const [, ns, local] = match;
    const available = new Set([defPath, ...(m.variants || [])]);
    const variantPath = (suffix) => `assets/${ns}/items/drone_render/${local}${suffix}.json`;

    const textures = [];
    const textureIndex = (file) => {
      let i = textures.findIndex((t) => t.rel === file.rel);
      if (i < 0) {
        textures.push(file);
        i = textures.length - 1;
      }
      return i;
    };

    const variants = {};
    const raw = {};
    const add = (name, suffix, geometryOf, fallback = false) => {
      const def = variantPath(suffix);
      let where = available.has(def) ? { file: exportPath(scope, def), from: 'export' } : null;
      if (!where && fallback) {
        where = locate(scope, def, true);
        if (where && where.from === 'export') where = null;
      }
      if (!where) return false;
      const render = renderModel(where, def);
      const modelRel = modelFile(render.model);
      const modelAt = where.from === 'export' ? { file: exportPath(scope, modelRel), from: 'export' } : locate(scope, modelRel, true);
      if (!modelAt) throw new Error(`${def}: model ${render.model} not found`);
      const transformed = applyTransform(readAt(modelAt), render.transform, def);
      const model = compactModel(transformed, def);
      const texture = locate(scope, model.texture, where.from !== 'export');
      if (!texture) throw new Error(`${def}: texture ${model.texture} not found`);
      const entry = { tex: textureIndex({ rel: model.texture, file: texture.file }) };
      if (geometryOf) {
        const base = variants[geometryOf];
        if (JSON.stringify(base.el) !== JSON.stringify(model.elements)) throw new Error(`${def}: geometry differs from ${geometryOf}`);
        entry.of = geometryOf;
        entry.tint = model.tints;
      } else {
        if (model.tints.some((t) => t !== -1)) throw new Error(`${def}: unpainted model with tint indices`);
        entry.el = model.elements;
        entry.box = model.box;
      }
      const groups = tintGroups(ns, `${local}${geometryOf ? suffix.replace(/_paint$/, '') : suffix}`);
      if (groups) entry.groups = groups;
      variants[name] = entry;
      raw[name] = { elements: namedBoxes(transformed), where, model: modelAt, def };
      return true;
    };

    add('base', '', null);
    if (p.category === 'prop' && add('ccw', '_ccw', null)) add('ccw_paint', '_ccw_paint', 'ccw');
    if (p.category === 'battery' && add('under', '_under', null)) add('under_paint', '_under_paint', 'under');
    if (p.category === 'stack') {
      // Battery plugged in: the stack drawn without its own plug ("_mounted"), the same pack as the base variant only.
      const fromExport = available.has(variantPath('_mounted'));
      if (add('mounted', '_mounted', null, true)) {
        const r = raw.mounted;
        const sameSource = r.where.from === 'export'
          || (sameBytes(raw.base.where.file, path.join(r.where.from, raw.base.def)) && sameBytes(raw.base.model.file, path.join(r.where.from, path.relative(path.join(dir, scope), raw.base.model.file))));
        const pigtail = sameSource ? pigtailOf(r.elements) : null;
        if (pigtail) {
          variants.mounted.pigtail = pigtail;
          add('mounted_paint', '_mounted_paint', 'mounted', !fromExport);
          counts.mounted++;
          if (r.where.from !== 'export') counts.mountedFromResources++;
        } else {
          delete variants.mounted;
          counts.mountedMissing.push(`${p.id} (${sameSource ? 'no pigtail pair' : 'other source than the base model'})`);
        }
      } else {
        counts.mountedMissing.push(`${p.id} (no _mounted)`);
      }
    }
    add('paint', '_paint', 'base');
    // Paint groups belong to the unpainted model (DroneRenderResources#paintGroups); keep them on the paint entry.
    for (const [plain, painted] of [['base', 'paint'], ['ccw', 'ccw_paint'], ['under', 'under_paint'], ['mounted', 'mounted_paint']]) {
      if (variants[plain] && variants[plain].groups) {
        if (variants[painted]) variants[painted].groups = variants[plain].groups;
        delete variants[plain].groups;
      }
      if (variants[painted] && !variants[painted].groups) delete variants[painted];
    }
    if (p.category === 'battery') {
      for (const name of ['base', 'under']) {
        const socket = variants[name] && socketOf(raw[name].elements);
        if (socket) {
          variants[name].socket = socket;
          counts.sockets++;
        }
      }
    }

    const tex = textures.map((t) => `data:image/png;base64,${fs.readFileSync(t.file).toString('base64')}`);
    const out = { format: 1, id: p.id, tex, variants };
    const [pns, ppath] = p.id.split(':');
    const target = path.join(outModels, pns, p.category, `${ppath}.json`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const text = JSON.stringify(out);
    fs.writeFileSync(target, text + '\n');
    files++;
    bytes += text.length + 1;
    withModel.push(p.id);
  }

  // Frame layouts from drone_layout.json (keys resolved to full ids) and all motor seats.
  const layouts = {};
  const motorSeats = {};
  for (const [ns, file] of Object.entries(layoutFiles)) {
    for (const [key, entry] of Object.entries(file.frames || {})) layouts[key.includes(':') ? key : `${ns}:${key}`] = entry;
    for (const [key, seat] of Object.entries(file.motor_seat || {})) motorSeats[key.includes(':') ? key : `${ns}:${key}`] = seat;
  }

  // Accessory mounts with a base model (PartModel.base): only 'top' (accessory/mount_top in drone_paint.json).
  const accessoryBases = {};
  for (const [ns, file] of Object.entries(paintFiles)) {
    for (const [key, groups] of Object.entries(file.models || {})) {
      const m = /^accessory\/mount_([a-z]+)$/.exec(key);
      if (m && ns === 'propwash') accessoryBases[m[1]] = { groups: groups.map((g) => [g.channel, g.base]) };
    }
  }

  const render = {
    format: 1,
    source: { generated_at: manifest.generated_at, mods: manifest.mods, fingerprint: manifest.fingerprint },
    units: { mm_per_model_unit: 8, model_units_per_block: 16 },
    channels,
    layouts,
    motor_seats: motorSeats,
    accessory_bases: accessoryBases,
    models: withModel,
  };
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'render.json'), JSON.stringify(render) + '\n');
  console.log(`models: ${files} files, ${(bytes / 1024).toFixed(0)} KiB; render.json: ${Object.keys(layouts).length} layouts, `
    + `${Object.keys(motorSeats).length} motor seats`);
  console.log(`battery plugged in: ${counts.sockets} battery sockets, ${counts.mounted} mounted stacks`
    + `${counts.mountedFromResources ? ` (${counts.mountedFromResources} from the mod resources, the export lacks them)` : ''}`
    + `${counts.mountedMissing.length ? `; drawn unplugged: ${counts.mountedMissing.join(', ')}` : ''}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
