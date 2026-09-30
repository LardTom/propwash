#!/usr/bin/env node
// Builds the 3D data of the configurator's drone viewer from the "Propwash: Just More Parts" web export.
//
//   node tools/build-configurator-models.mjs [--export <web-export dir>]
//
// Same export location rules as tools/build-configurator-data.mjs (sibling checkout, JMP_WEB_EXPORT or --export).
//
// Writes:
//   assets/data/configurator/render.json                        frame layouts (drone_layout.json), motor seats,
//                                                               paint channel references, accessory base tints
//   assets/data/configurator/models/<ns>/<category>/<path>.json one file per part with a model: the block-model
//                                                               elements in a compact form plus the textures as
//                                                               data URLs (base, paint, ccw variants)
//
// Only files from the web export are used. The block models keep Minecraft's model units (0–16 per model block);
// worn, damaged, broken and blur variants are left out because the configurator shows new parts at rest.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportDir } from './build-configurator-data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets/data/configurator');
const DIRS = ['down', 'up', 'north', 'south', 'west', 'east'];

const round = (v) => Math.round(v * 10000) / 10000;

function readJson(dir, file) {
  return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
}

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

// Element corners after rotation, in model units (for the bounding box).
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

function main() {
  const dir = exportDir();
  const manifest = readJson(dir, 'manifest.json');
  if (manifest.format !== 1) throw new Error(`web export format ${manifest.format} not supported`);
  const parts = readJson(dir, 'parts.json');

  const paintFiles = {};
  const layoutFiles = {};
  for (const ns of fs.readdirSync(path.join(dir, 'assets'))) {
    const paint = path.join(dir, 'assets', ns, 'drone_paint.json');
    const layout = path.join(dir, 'assets', ns, 'drone_layout.json');
    if (fs.existsSync(paint)) paintFiles[ns] = JSON.parse(fs.readFileSync(paint, 'utf8'));
    if (fs.existsSync(layout)) layoutFiles[ns] = JSON.parse(fs.readFileSync(layout, 'utf8'));
  }

  const channels = {};
  for (const file of Object.values(paintFiles)) Object.assign(channels, file.channels || {});

  // Paint tint groups of a render model ('<category>/<key>' in the namespace's drone_paint.json).
  function tintGroups(ns, local) {
    const file = paintFiles[ns];
    const groups = file && file.models && (file.models[local] || file.models[`${ns}:${local}`]);
    return groups ? groups.map((g) => [g.channel, g.base]) : null;
  }

  // Render definitions of an export path, e.g. assets/propwash/items/drone_render/prop/p31_4b.json.
  function renderModel(defPath) {
    const def = readJson(dir, defPath).model;
    if (!def || def.type !== 'minecraft:model') throw new Error(`${defPath}: plain minecraft:model expected`);
    return def.model;
  }

  const outModels = path.join(OUT, 'models');
  fs.rmSync(outModels, { recursive: true, force: true });
  let files = 0;
  let bytes = 0;
  const withModel = [];
  for (const p of parts) {
    const m = p.model || {};
    if (m.kind !== 'model' || !m.drone) continue;
    const defPath = m.drone;
    const match = /^assets\/([^/]+)\/items\/drone_render\/(.+)\.json$/.exec(defPath);
    if (!match) throw new Error(`${p.id}: unexpected render definition ${defPath}`);
    const [, ns, local] = match;
    const available = new Set([defPath, ...(m.variants || [])]);
    const variantPath = (suffix) => `assets/${ns}/items/drone_render/${local}${suffix}.json`;

    const textures = [];
    const textureIndex = (file) => {
      let i = textures.indexOf(file);
      if (i < 0) {
        textures.push(file);
        i = textures.length - 1;
      }
      return i;
    };

    const variants = {};
    const add = (name, suffix, geometryOf) => {
      const def = variantPath(suffix);
      if (!available.has(def)) return false;
      const model = compactModel(readJson(dir, modelFile(renderModel(def))), def);
      const entry = { tex: textureIndex(model.texture) };
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
      return true;
    };

    add('base', '', null);
    if (p.category === 'prop' && add('ccw', '_ccw', null)) add('ccw_paint', '_ccw_paint', 'ccw');
    add('paint', '_paint', 'base');
    // Paint groups belong to the unpainted model (DroneRenderResources#paintGroups); keep them on the paint entry.
    for (const [plain, painted] of [['base', 'paint'], ['ccw', 'ccw_paint']]) {
      if (variants[plain] && variants[plain].groups) {
        if (variants[painted]) variants[painted].groups = variants[plain].groups;
        delete variants[plain].groups;
      }
      if (variants[painted] && !variants[painted].groups) delete variants[painted];
    }

    const tex = textures.map((file) => `data:image/png;base64,${fs.readFileSync(path.join(dir, file)).toString('base64')}`);
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
  fs.writeFileSync(path.join(OUT, 'render.json'), JSON.stringify(render) + '\n');
  console.log(`models: ${files} files, ${(bytes / 1024).toFixed(0)} KiB; render.json: ${Object.keys(layouts).length} layouts, `
    + `${Object.keys(motorSeats).length} motor seats`);
}

main();
