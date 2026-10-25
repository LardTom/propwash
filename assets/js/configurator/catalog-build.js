// What the web export of Propwash (format 2, /propwash webexport) makes of a mod's files, without the game: the
// entries of <namespace>/parts.json, chemistries.json and mounts.json (WebExport, PartData, AssetIndex and LangTable
// of Propwash 0.6.0), and from those the configurator's catalog entries and model files (the steps of
// tools/build-configurator-data.mjs and tools/build-configurator-models.mjs). No file system: the files come as a Map
// path → Uint8Array (a jar read by jar.js, or a folder read by a Node tool), so the browser and the tools compute
// alike. tools/test-jar-loader.mjs holds the result for the jars of Propwash and Just More Parts against the web
// export of the game and against the committed catalog and models.
//
//   const res = resources(files);                          // lang table, asset index, paint layers
//   const parts = exportParts(definitions, res, { chemistries });
//   const entry = catalogPart(parts[0]);                    // as in assets/data/configurator/catalog.json
//   const model = partModel(parts[0], res);                 // as in assets/data/configurator/models/…

import { crc32 } from './crc32.js?v=62ad0fa2';
import { KINDS, ARM_KEYS, trueX, maxContinuousCurrent, landingCellVoltage, effectiveUsableFraction, SOC_GRID, splitId, tryParse, idCompare } from './partjson.js?v=2c29ef2a';

export const LANGUAGES = Object.freeze(['de_de', 'en_us']);
export const NOMINAL_CELL_V = 3.7;
export const CREATIVE_ONLY = Object.freeze(['propwash:creative_fc']);
export const PROPWASH = 'propwash';
export const CHANNEL_SLOTS = Object.freeze({
  frame: ['frame'], tpu: ['tpu'], motor: ['motors'], prop: ['prop_fl', 'prop_fr', 'prop_rl', 'prop_rr'], stack: ['stack'], battery: ['battery'],
  camera: ['camera'], antenna: ['antenna'], accessory: ['accessories'],
});
export const ASSET_SUFFIXES = Object.freeze(['.json', '.png', '.mcmeta']);
const VARIANT = /^((_(worn|damaged|broken|ccw|blur|under|paint))*)\.json$/;
const UPTILT = Object.freeze({
  whoop: [10, 35], toothpick: [10, 40], cinewhoop: [0, 35], freestyle: [0, 50], race: [15, 70], long_range: [0, 40], cinelifter: [0, 30],
  x_class: [0, 50],
});

const utf8 = new TextDecoder('utf-8');
export const text = (bytes) => (bytes == null ? null : typeof bytes === 'string' ? bytes : utf8.decode(bytes));
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export { idCompare };
/** '#rrggbb' of an RGB int (ExportJson.hex). */
export const hex = (rgb) => `#${(rgb & 0xffffff).toString(16).padStart(6, '0')}`;

function parseJsonText(data) {
  try {
    return JSON.parse(text(data));
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Resources: language table (LangTable), asset index (AssetIndex), paint layers of drone_paint.json

/**
 * The resources of one or more mods as the export sees them. `source` is a Map path → bytes (or text) or a lazy
 * source {list(): paths, read(path): bytes} (a jar: an entry is only decompressed when it is used; a read that throws
 * counts as a missing file and is noted in `problems`). Only paths below assets/ are used. Language files are read in
 * path order, the first value of a key wins (LangTable.load); `fallback(language, key)` may give texts the files lack
 * (the base catalog's names of Propwash's mounts, for an add-on jar alone).
 */
export function resources(source, { fallback = null } = {}) {
  const lazy = !(source instanceof Map);
  const all = lazy ? source.list() : [...source.keys()];
  const sorted = all.filter((path) => path.startsWith('assets/') && ASSET_SUFFIXES.some((s) => path.endsWith(s))).sort(cmp);
  const present = new Set(sorted);
  const cache = new Map();
  const problems = [];
  const assets = {
    has: (path) => present.has(path),
    get(path) {
      if (!present.has(path)) return undefined;
      if (!lazy) return source.get(path);
      if (!cache.has(path)) {
        let data = null;
        try {
          data = source.read(path);
        } catch (e) {
          problems.push({ where: path, message: e && e.code ? e.code : String(e), error: e });
        }
        cache.set(path, data);
      }
      return cache.get(path);
    },
  };
  const lang = Object.fromEntries(LANGUAGES.map((l) => [l, new Map()]));
  for (const path of sorted) {
    const parts = path.split('/');
    if (parts.length !== 4 || parts[2] !== 'lang' || !parts[3].endsWith('.json')) continue;
    const target = lang[parts[3].slice(0, -5)];
    if (!target) continue;
    const json = parseJsonText(assets.get(path));
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      problems.push({ where: path, message: 'Sprachdatei nicht lesbar' });
      continue;
    }
    for (const [key, value] of Object.entries(json)) {
      if (value !== null && typeof value !== 'object' && !target.has(key)) target.set(key, String(value));
    }
  }
  const paint = new Map();
  for (const path of sorted) {
    const parts = path.split('/');
    if (parts.length !== 3 || parts[2] !== 'drone_paint.json') continue;
    const namespace = parts[1];
    const root = parseJsonText(assets.get(path));
    try {
      const models = root && root.models ? root.models : {};
      for (const [key, layers] of Object.entries(models)) {
        const id = key.includes(':') ? key : `${namespace}:${key}`;
        paint.set(id, layers.map((l) => ({ channel: String(l.channel), rgb: Number.parseInt(String(l.base).slice(1), 16) })));
      }
    } catch {
      problems.push({ where: path, message: 'drone_paint.json nicht lesbar' });
    }
  }
  const res = {
    source,
    sorted,
    problems,
    has: (path) => assets.has(path),
    get: (path) => assets.get(path),
    text(language, key) {
      const value = lang[language].get(key);
      if (value !== undefined) return value;
      const extra = fallback && fallback(language, key);
      return extra == null ? null : extra;
    },
    hasText: (key) => LANGUAGES.some((l) => res.text(l, key) !== null),
    both: (key) => Object.fromEntries(LANGUAGES.map((l) => [l, res.text(l, key)])),
    paint,
    models: new Map(),
    used: new Map(),
  };
  return res;
}

function follow(res, into, path, textures, visited, depth) {
  if (depth > 16 || visited.has(path)) return;
  visited.add(path);
  into.add(path);
  if (path.endsWith('.png')) {
    textures.push(path);
    if (res.has(`${path}.mcmeta`)) into.add(`${path}.mcmeta`);
    return;
  }
  const data = res.get(path);
  if (data == null) return;
  const root = parseJsonText(data);
  if (root === undefined) {
    res.problems.push({ where: path, message: 'JSON nicht lesbar' });
    return;
  }
  walk(res, into, root, path.includes('/models/'), textures, visited, depth, path);
}

function walk(res, into, element, model, textures, visited, depth, from) {
  if (Array.isArray(element)) {
    for (const child of element) walk(res, into, child, model, textures, visited, depth, from);
    return;
  }
  if (!element || typeof element !== 'object') return;
  for (const [key, value] of Object.entries(element)) {
    if (typeof value === 'string') {
      if ((!model && (key === 'model' || key === 'base')) || (model && key === 'parent')) {
        reference(res, into, value, 'models', '.json', textures, visited, depth, from);
      }
    } else if (model && key === 'textures' && value && typeof value === 'object' && !Array.isArray(value)) {
      for (const texture of Object.values(value)) {
        if (texture !== null && typeof texture !== 'object') {
          const t = String(texture);
          if (!t.startsWith('#')) reference(res, into, t, 'textures', '.png', textures, visited, depth, from);
        }
      }
    } else {
      walk(res, into, value, model, textures, visited, depth, from);
    }
  }
}

function reference(res, into, value, folder, suffix, textures, visited, depth, from) {
  const id = tryParse(value);
  if (id === null) return;
  const [namespace, path] = splitId(id);
  if (namespace === 'minecraft') return;
  const file = `assets/${namespace}/${folder}/${path}${suffix}`;
  if (!res.has(file)) {
    if (!path.startsWith('builtin/')) res.problems.push({ where: from, message: `Verweis ohne Datei: ${file}` });
    return;
  }
  follow(res, into, file, textures, visited, depth + 1);
}

function use(res, scope, path, textures) {
  if (!res.used.has(scope)) res.used.set(scope, new Set());
  follow(res, res.used.get(scope), path, textures, new Set(), 0);
}

/** AssetIndex.model: item icon, render definition with its variants, textures, paintability and base colours. */
export function modelOf(definition, res) {
  if (res.models.has(definition.id)) return res.models.get(definition.id);
  const [namespace, path] = splitId(definition.id);
  const scope = namespace;
  const category = definition.kind;
  const itemPath = `assets/${namespace}/items/${path}.json`;
  let item = null;
  const textures = [];
  if (res.has(itemPath)) {
    item = itemPath;
    use(res, scope, itemPath, textures);
  } else {
    res.problems.push({ where: definition.id, message: `Inventar-Symbol fehlt: ${itemPath}` });
  }
  const renderModel = definition.basics.visual.renderModel;
  let renderBase;
  if (renderModel) {
    const [mns, mpath] = splitId(renderModel);
    renderBase = `assets/${mns}/items/${mpath}`;
  } else {
    renderBase = `assets/${namespace}/items/drone_render/${category}/${path}`;
  }
  let drone = null;
  const variants = [];
  if (res.has(`${renderBase}.json`)) {
    drone = `${renderBase}.json`;
    use(res, scope, drone, textures);
    for (const file of res.sorted) {
      if (file.length <= renderBase.length + 1 || !file.startsWith(`${renderBase}_`)) continue;
      if (VARIANT.test(file.slice(renderBase.length))) {
        variants.push(file);
        use(res, scope, file, textures);
      }
    }
  }
  let paintKey;
  if (renderModel) {
    const [mns, mpath] = splitId(renderModel);
    paintKey = `${mns}:${mpath.startsWith('drone_render/') ? mpath.slice('drone_render/'.length) : mpath}`;
  } else {
    paintKey = `${namespace}:${category}/${path}`;
  }
  const layers = res.paint.get(paintKey) || [];
  const paintable = layers.length > 0 && res.has(`${renderBase}_paint.json`);
  const colors = {};
  for (const layer of layers) {
    for (const slot of CHANNEL_SLOTS[layer.channel] || []) if (!(slot in colors)) colors[slot] = layer.rgb;
  }
  const model = {
    kind: drone ? 'model' : 'procedural', item, drone, variants, textures: [...new Set(textures)].sort(cmp), paintable, baseColors: colors,
  };
  res.models.set(definition.id, model);
  return model;
}

/** The asset files a namespace's parts use (plus its drone_layout.json and drone_paint.json), sorted. */
export function usedAssets(res, namespace) {
  const out = new Set(res.used.get(namespace) || []);
  for (const name of ['drone_layout.json', 'drone_paint.json']) {
    const path = `assets/${namespace}/${name}`;
    if (res.has(path)) out.add(path);
  }
  return [...out].sort(cmp);
}

// ---------------------------------------------------------------------------------------------------------------
// parts.json entries (WebExport.partsJson, PartData)

export function paintSlots(kind) {
  switch (kind) {
    case 'frame': return ['frame', 'tpu'];
    case 'motor': return ['motors'];
    case 'prop': return ['prop_fl', 'prop_fr', 'prop_rl', 'prop_rr'];
    case 'stack': return ['stack'];
    case 'battery': return ['battery'];
    case 'video': return ['camera', 'antenna'];
    case 'accessory': return ['accessories'];
    default: return [];
  }
}

export function exportBasics(b) {
  let recycle = null;
  if (b.recycle) recycle = b.recycle.count === 0 ? 'none' : { item: b.recycle.item, count: b.recycle.count };
  return {
    mass_g: num(b.massGrams),
    stack_size: b.stackSize,
    sort: b.sortOrder,
    creative: b.creativeListed,
    durability: num(b.durability),
    recycle,
    accent: b.visual.accentRgb === null ? null : hex(b.visual.accentRgb),
    render_model: b.visual.renderModel,
  };
}

const armsOf = (frame) => (frame.geometry.arms.length ? frame.geometry.arms : trueX(frame.wheelbaseMm, 0.0));

/** PartData.shapeExtent. */
export function shapeExtent(frame) {
  const radius = frame.maxPropMm / 2.0;
  let minX = Number.MAX_VALUE;
  let maxX = -Number.MAX_VALUE;
  let minZ = Number.MAX_VALUE;
  let maxZ = -Number.MAX_VALUE;
  for (const arm of armsOf(frame)) {
    minX = Math.min(minX, arm.position[0] - radius);
    maxX = Math.max(maxX, arm.position[0] + radius);
    minZ = Math.min(minZ, arm.position[2] - radius);
    maxZ = Math.max(maxZ, arm.position[2] + radius);
  }
  return Math.max(maxX - minX, maxZ - minZ);
}

/** CameraMount.range of a frame: the role's uptilt range around the frame's standard angle (floats, like the mod). */
export function uptiltRange(frame) {
  const f = Math.fround;
  const standard = Math.max(0, Math.min(80, f(frame.geometry.cameraTiltDeg)));
  const role = UPTILT[frame.role];
  return { min: Math.min(f(role[0]), standard), max: Math.max(f(role[1]), standard), default: standard };
}

const nums = (...values) => values.map(num);

function frameData(frame) {
  const g = frame.geometry;
  const arms = {};
  armsOf(frame).forEach((arm, i) => {
    if (i < ARM_KEYS.length) arms[ARM_KEYS[i]] = { pos: nums(...arm.position), spin: arm.spin };
  });
  const range = uptiltRange(frame);
  const anchors = {};
  for (const [slot, a] of Object.entries(g.accessoryAnchors)) anchors[slot] = { pos: nums(a.x, a.y, a.z), tilt_deg: num(a.tiltDeg), length_mm: num(a.lengthMm) };
  const d = frame.duct;
  return {
    role: frame.role,
    shape: frame.shape,
    wheelbase_mm: frame.wheelbaseMm,
    props_mm: [frame.minPropMm, frame.maxPropMm],
    motor_mounts: [...frame.motorMounts].sort(cmp),
    stack_mounts: [...frame.stackMounts].sort(cmp),
    accessory_mounts: [...frame.accessoryMounts],
    arms,
    arms_explicit: g.arms.length > 0,
    battery: { on_top: g.batteryOnTop, plate_mm: num(g.batteryPlateMm) },
    electronics_mm: num(g.electronicsMm),
    camera: { pos: g.cameraMm ? nums(...g.cameraMm) : null, tilt_deg: num(g.cameraTiltDeg), tilt_min_deg: num(range.min), tilt_max_deg: num(range.max) },
    center_of_mass_mm: nums(...g.frameCenterOfMassMm),
    mass_split: { arms: num(g.massSplit.arms), plate: num(g.massSplit.plate), duct: num(g.massSplit.duct) },
    accessory_anchors: anchors,
    aero: {
      frontal_area_m2: num(frame.aero.frontalAreaM2), drag_coefficient: num(frame.aero.dragCoefficient), side_area_m2: num(frame.aero.sideAreaM2),
      top_area_m2: num(frame.aero.topAreaM2),
    },
    duct: d ? {
      thrust_gain: num(d.thrustGain), clearance_mm: num(d.clearanceMm), translational_lift_gain: num(d.translationalLiftGain), wash_loss: num(d.washLoss),
      wash_noise: num(d.washNoise), restitution: num(d.restitution), friction: num(d.friction),
    } : null,
    impact_tolerance: num(frame.impactTolerance),
    battery_fit: {
      cells: [frame.batteryFit.minCells, frame.batteryFit.maxCells], max_mass_g: num(frame.batteryFit.maxMassGrams),
      preferred_min_cells: frame.batteryFit.preferredMinCells, preferred_min_capacity_mah: frame.batteryFit.preferredMinCapacityMah,
    },
  };
}

/** PartData.data: the definition's values with every default filled in. */
export function exportData(def) {
  switch (def.kind) {
    case 'frame': return frameData(def);
    case 'stack': return {
      mount: def.mount, esc_continuous_a: num(def.escContinuousAmps), cells: [def.minCells, def.maxCells], all_in_one: def.allInOne,
      esc_burst_a: num(def.escBurstAmps), esc_resistance_ohm: num(def.escResistanceOhm), brownout_v: num(def.brownoutVoltage), board_size_mm: num(def.boardSizeMm),
    };
    case 'motor': return {
      stator: def.statorLabel, stator_mm: nums(def.statorDiameterMm, def.statorHeightMm), kv: def.kv, mount: def.mount, max_current_a: num(def.maxCurrentAmps),
      resistance_ohm: num(def.resistanceOhm), cells: [def.minCells, def.maxCells], prop_mount: def.propMount,
      thermal: {
        heat_capacity_j_per_k: num(def.thermal.heatCapacityJPerK), cooling_w_per_k: num(def.thermal.coolingWPerK),
        cooling_w_per_k_per_rad_s: num(def.thermal.coolingWPerKPerRadS), derate_start_c: num(def.thermal.derateStartC), max_temp_c: num(def.thermal.maxTempC),
        wear_per_s_at_max: num(def.thermal.wearPerSecondAtMax),
      },
    };
    case 'prop': return {
      diameter_mm: def.diameterMm, pitch_in: num(def.pitchInch), blades: def.blades, ct: num(def.thrustCoefficient), cp: num(def.powerCoefficient),
      material: def.material, stiffness: num(def.stiffness), mount: def.mount,
    };
    case 'battery': return {
      cells: def.cells, capacity_mah: def.capacityMah, cell_resistance_ohm: num(def.cellResistanceOhm), c_rating: def.cRating, chemistry: def.chemistry,
      pack_mm: def.packSize ? nums(def.packSize.lengthMm, def.packSize.widthMm, def.packSize.heightMm) : null, connector: def.connector,
    };
    case 'video': return {
      link: def.link, latency_ms: def.latencyMs, range_blocks: def.rangeBlocks, image_quality: num(def.imageQuality), camera_width_mm: num(def.cameraWidthMm),
      camera_fov_deg: num(def.cameraFovDeg), vtx_power_mw: def.vtxPowerMw, power_w: def.powerW === null ? null : num(def.powerW),
    };
    case 'accessory': {
      const c = def.actionCam;
      const out = {
        slot: def.slot, size_mm: nums(def.widthMm, def.heightMm, def.depthMm), flight_battery_w: num(def.flightBatteryWatts), frontal_area_m2: num(def.frontalAreaM2),
        leds: def.ledCount, lens: { x_mm: num(def.lensXMm), length_mm: num(def.lensLengthMm) },
        action_cam: c ? {
          max_height: c.maxHeight, max_fps: c.maxFps, stabilization: c.stabilization, horizon_levelling: c.horizonLevelling, own_battery_wh: num(c.ownBatteryWh),
          record_w: num(c.recordWatts), max_record_w: num(c.maxRecordWatts), fov_deg: num(c.fovDegrees), image_quality: num(c.imageQuality),
          low_light_noise: num(c.lowLightNoise), sensor_in: num(c.sensorInches),
        } : null,
        led_path: def.ledPathMm.map((p) => nums(...p)),
      };
      if (def.frames && def.frames.length) out.frames = [...def.frames];
      return out;
    }
    default: return {};
  }
}

/** PartData.derived; `chemistry(id)` gives the registered chemistries (for the battery's energy). */
export function exportDerived(def, chemistry) {
  switch (def.kind) {
    case 'frame': return {
      size_class_in: num(Math.round((def.maxPropMm / 25.4) * 2.0) / 2.0), ducted: def.duct !== null, shape_extent_mm: num(shapeExtent(def)),
    };
    case 'stack': return { max_power_w: num(def.escContinuousAmps * 4 * def.maxCells * NOMINAL_CELL_V) };
    case 'motor': return { no_load_rpm_per_cell_v: def.kv, max_power_w_at_nominal: num(def.maxCurrentAmps * def.maxCells * NOMINAL_CELL_V) };
    case 'prop': {
      const inches = def.diameterMm / 25.4;
      const radius = def.diameterMm / 2000.0;
      return { diameter_in: num(inches), disc_area_m2: num(Math.PI * radius * radius), pitch_to_diameter: num(def.pitchInch / inches) };
    }
    case 'battery': {
      const c = chemistry(def.chemistry);
      const nominal = c ? c.nominalCellVoltage : NaN;
      const energy = (def.cells * nominal * def.capacityMah) / 1000.0;
      return { energy_wh: num(energy), max_continuous_a: num(maxContinuousCurrent(def)), wh_per_kg: num(energy / (def.basics.massGrams / 1000.0)) };
    }
    default: return {};
  }
}

function help(res, prefix) {
  const out = {};
  for (const language of LANGUAGES) {
    const h = { summary: res.text(language, `${prefix}.summary`) };
    for (const block of ['what', 'use']) {
      const lines = [];
      for (let i = 1; i <= 8; i++) {
        const line = res.text(language, `${prefix}.${block}.${i}`);
        if (line !== null) lines.push(line);
      }
      h[block] = lines;
    }
    out[language] = h;
  }
  return out;
}

function defaultColors(def, model) {
  const colors = {};
  if (Object.keys(model.baseColors).length) {
    for (const slot of paintSlots(def.kind)) if (model.baseColors[slot] !== undefined) colors[slot] = hex(model.baseColors[slot]);
  } else if (def.basics.visual.accentRgb !== null) {
    for (const slot of paintSlots(def.kind)) colors[slot] = hex(def.basics.visual.accentRgb);
  }
  return colors;
}

/** WebExport.sortedParts: by kind, the sort order and the id. */
export const partSort = (a, b) => (KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind)) || (a.basics.sortOrder - b.basics.sortOrder) || cmp(a.id, b.id);

/**
 * The parts.json entries of the given definitions (one namespace or several), in the export's order.
 * options: builtin(id) – whether Propwash itself registers the part (default: the propwash namespace),
 * chemistry(id) – the registered chemistries for the battery energy.
 */
export function exportParts(definitions, res, { builtin = (id) => splitId(id)[0] === PROPWASH, chemistry = () => null } = {}) {
  const out = [];
  for (const def of definitions.filter((d) => !CREATIVE_ONLY.includes(d.id)).sort(partSort)) {
    const [namespace, path] = splitId(def.id);
    const isBuiltin = builtin(def.id);
    const entry = { id: def.id, category: def.kind, builtin: isBuiltin, name: res.both(`part.${namespace}.${path}`) };
    if (def.kind === 'frame') {
      const key = isBuiltin ? `propwash.content.frame_short.${path}` : `${namespace}.frame_short.${path}`;
      entry.short_name = res.hasText(key) ? res.both(key) : null;
    } else {
      entry.short_name = null;
    }
    entry.help = help(res, `${isBuiltin ? PROPWASH : namespace}.help.${path}`);
    entry.basics = exportBasics(def.basics);
    entry.data = exportData(def);
    entry.derived = exportDerived(def, chemistry);
    const model = modelOf(def, res);
    entry.paint = { slots: paintSlots(def.kind), paintable_model: model.paintable, default_colors: defaultColors(def, model) };
    entry.model = { kind: model.kind, item: model.item, drone: model.drone, variants: model.variants, textures: model.textures };
    out.push(entry);
  }
  return out;
}

/** The chemistries.json entries of a namespace: its own chemistries and those its batteries use (sorted by id). */
export function exportChemistries(namespace, definitions, chemistries, res) {
  const users = new Map();
  for (const def of definitions.filter((d) => !CREATIVE_ONLY.includes(d.id)).sort(partSort)) {
    if (def.kind !== 'battery') continue;
    if (!users.has(def.chemistry)) users.set(def.chemistry, []);
    users.get(def.chemistry).push(def.id);
  }
  return chemistries
    .filter((c) => splitId(c.id)[0] === namespace || users.has(c.id))
    .sort((a, b) => cmp(a.id, b.id))
    .map((c) => {
      const [ns, path] = splitId(c.id);
      const key = ns === PROPWASH ? `propwash.content.tooltip.chemistry.${path}` : `${ns}.chemistry.${path}`;
      return {
        id: c.id,
        name: res.both(key),
        full_v: num(c.fullCellVoltage),
        nominal_v: num(c.nominalCellVoltage),
        empty_v: num(c.emptyCellVoltage),
        cutoff_v: num(c.cutoffCellVoltage),
        storage_v: num(c.storageCellVoltage),
        density_g_cm3: num(c.densityGramsPerCm3),
        ocv_shape: c.ocvShape.map(num),
        usable_fraction: num(effectiveUsableFraction(c)),
        landing_v: num(landingCellVoltage(c)),
        soc_grid: SOC_GRID.map(num),
        used_by: users.get(c.id) || [],
      };
    });
}

/** The mounts.json of a namespace: every mount its frames, motors, stacks and props use, with name and users. */
export function exportMounts(definitions, res) {
  const lists = { motorFrames: new Map(), motorParts: new Map(), stackFrames: new Map(), stackParts: new Map(), propMotors: new Map(), propParts: new Map() };
  const add = (map, mount, id) => {
    if (!map.has(mount)) map.set(mount, []);
    map.get(mount).push(id);
  };
  for (const def of definitions.filter((d) => !CREATIVE_ONLY.includes(d.id)).sort(partSort)) {
    if (def.kind === 'frame') {
      def.motorMounts.forEach((m) => add(lists.motorFrames, m, def.id));
      def.stackMounts.forEach((m) => add(lists.stackFrames, m, def.id));
    } else if (def.kind === 'motor') {
      add(lists.motorParts, def.mount, def.id);
      add(lists.propMotors, def.propMount, def.id);
    } else if (def.kind === 'stack') {
      add(lists.stackParts, def.mount, def.id);
    } else if (def.kind === 'prop') {
      add(lists.propParts, def.mount, def.id);
    }
  }
  const list = (kind, holders, parts, holderName) => [...new Set([...holders.keys(), ...parts.keys()])].sort(idCompare).map((mount) => {
    const [ns, path] = splitId(mount);
    const key = ns === PROPWASH ? `propwash.content.mount.${kind}.${path}` : `${ns}.mount.${kind}.${path}`;
    return { id: mount, name: res.both(key), [holderName]: holders.get(mount) || [], parts: parts.get(mount) || [] };
  });
  return {
    motor: list('motor', lists.motorFrames, lists.motorParts, 'frames'),
    stack: list('stack', lists.stackFrames, lists.stackParts, 'frames'),
    prop: list('prop', lists.propMotors, lists.propParts, 'motors'),
  };
}

/** ShareExport.crc: the CRC-32 of every entry line of a parts table as 8 hex digits. */
export function tableCrc(table) {
  const lines = [];
  for (const kind of KINDS) {
    ((table && table.parts && table.parts[kind]) || []).forEach((e, i) => lines.push({ kind, number: i + 1, path: e.id }));
  }
  const unique = [];
  const seen = new Set();
  for (const l of lines) {
    const key = `${l.kind}:${l.number}:${l.path}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(l);
    }
  }
  unique.sort((a, b) => (KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind)) || (a.number - b.number) || cmp(a.path, b.path));
  const bytes = new TextEncoder().encode(unique.map((l) => `${l.kind}:${l.number}:${l.path}\n`).join(''));
  return (crc32(bytes, 0, bytes.length) >>> 0).toString(16).padStart(8, '0');
}

/** Number of entries of a parts table (ShareTable.totalEntries). */
export const tableEntries = (table) => KINDS.reduce((n, kind) => n + ((table && table.parts && table.parts[kind]) || []).length, 0);

// ---------------------------------------------------------------------------------------------------------------
// The configurator's catalog (tools/build-configurator-data.mjs)

export const CATALOG_KINDS = Object.freeze(['frame', 'stack', 'motor', 'prop', 'video', 'battery', 'accessory']);
const DROP_VARIANT = /_(worn|damaged|broken)(_|\.json$|\.png$)/;

export function compactHelp(h) {
  if (!h) return null;
  const out = {};
  for (const [lang, entry] of Object.entries(h)) {
    if (!entry) continue;
    const e = {};
    if (entry.summary) e.summary = entry.summary;
    if (entry.what && entry.what.length) e.what = entry.what;
    if (entry.use && entry.use.length) e.use = entry.use;
    if (Object.keys(e).length) out[lang] = e;
  }
  return Object.keys(out).length ? out : null;
}

/** A parts.json entry as the configurator's catalog keeps it. */
export function catalogPart(p) {
  const b = p.basics;
  const out = { id: p.id, category: p.category, builtin: p.builtin, name: p.name };
  if (p.short_name) out.short_name = p.short_name;
  const h = compactHelp(p.help);
  if (h) out.help = h;
  out.basics = { mass_g: b.mass_g, sort: b.sort, creative: b.creative, durability: b.durability, accent: b.accent };
  if (b.render_model) out.basics.render_model = b.render_model;
  out.data = p.data;
  out.derived = p.derived;
  out.paint = p.paint ? { slots: p.paint.slots, paintable_model: p.paint.paintable_model } : { slots: [], paintable_model: false };
  const m = p.model || {};
  out.model = {
    kind: m.kind,
    drone: m.drone || null,
    variants: (m.variants || []).filter((v) => !DROP_VARIANT.test(v)),
    textures: (m.textures || []).filter((t) => !DROP_VARIANT.test(t)),
  };
  return out;
}

/** The catalog's order of parts: category, sort order, id. */
export const catalogOrder = (a, b) => (CATALOG_KINDS.indexOf(a.category) - CATALOG_KINDS.indexOf(b.category)) || (a.basics.sort - b.basics.sort) || cmp(a.id, b.id);

// FpvLayoutData.parse of Propwash 0.4.0 (as tools/build-configurator-data.mjs): motor seats and frame motor positions
// of assets/<namespace>/drone_layout.json, read as float like the mod.
const f32 = Math.fround;
const MAX_ABS_MM = 2000;

function layoutId(key, namespace) {
  if (!key) return null;
  return key.includes(':') ? key : `${namespace}:${key}`;
}

function layoutVector(v) {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const out = [];
  for (const n of v) {
    if (typeof n !== 'number') return null;
    const x = f32(n);
    if (!Number.isFinite(x) || Math.abs(x) > MAX_ABS_MM) return null;
    out.push(x);
  }
  return out;
}

export function fpvLayout(json, namespace) {
  const seats = {};
  const frames = {};
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { seats, frames };
  if (json.motor_seat && typeof json.motor_seat === 'object' && !Array.isArray(json.motor_seat)) {
    for (const [key, value] of Object.entries(json.motor_seat)) {
      const id = layoutId(key, namespace);
      if (!id || typeof value !== 'number') continue;
      const seat = f32(value);
      if (Number.isFinite(seat) && seat > 0 && seat < 100) seats[id] = seat;
    }
  }
  if (json.frames && typeof json.frames === 'object' && !Array.isArray(json.frames)) {
    for (const [key, frame] of Object.entries(json.frames)) {
      const id = layoutId(key, namespace);
      if (!id || !frame || typeof frame !== 'object' || Array.isArray(frame)) continue;
      let motors = null;
      let valid = true;
      if (frame.motors !== undefined) {
        if (Array.isArray(frame.motors) && frame.motors.length === 4) {
          motors = frame.motors.map(layoutVector);
          valid = motors.every((m) => m !== null);
        } else {
          valid = false;
        }
      }
      let propHeight = null;
      if (typeof frame.prop_height === 'number') {
        const h = f32(frame.prop_height);
        if (Number.isFinite(h) && h >= 0 && h <= 200) propHeight = h;
      }
      frames[id] = { motors: valid ? motors : null, prop_height: propHeight, valid };
    }
  }
  return { seats, frames };
}

/** drone_layout.json and drone_paint.json of every namespace in the files: {layouts, paint} by owner namespace. */
export function layoutAndPaintFiles(res) {
  const layouts = {};
  const paint = {};
  for (const path of res.sorted) {
    const parts = path.split('/');
    if (parts.length !== 3) continue;
    if (parts[2] === 'drone_layout.json' && !(parts[1] in layouts)) layouts[parts[1]] = parseJsonText(res.get(path)) ?? null;
    if (parts[2] === 'drone_paint.json' && !(parts[1] in paint)) paint[parts[1]] = parseJsonText(res.get(path)) ?? null;
  }
  return { layouts, paint };
}

// ---------------------------------------------------------------------------------------------------------------
// Model files of the 3D viewer (tools/build-configurator-models.mjs)

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

function rotationOf(r) {
  if (!r) return 0;
  const o = r.origin.map(round);
  if (r.axis) {
    const a = round(r.angle);
    return [...o, r.axis === 'x' ? a : 0, r.axis === 'y' ? a : 0, r.axis === 'z' ? a : 0];
  }
  return [...o, round(r.x || 0), round(r.y || 0), round(r.z || 0)];
}

function corners(e) {
  const pts = [];
  for (const x of [e.from[0], e.to[0]]) for (const y of [e.from[1], e.to[1]]) for (const z of [e.from[2], e.to[2]]) pts.push([x, y, z]);
  const r = rotationOf(e.rotation);
  if (!r) return pts;
  const [ox, oy, oz, ax, ay, az] = r;
  const rad = Math.PI / 180;
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(ax * rad), Math.sin(ax * rad), Math.cos(ay * rad), Math.sin(ay * rad), Math.cos(az * rad), Math.sin(az * rad)];
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

const PLUG_ELEMENTS = new Set(['connector', 'connector_grip', 'bt_connector']);
const mm = (v) => (v - 8) * 8;

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

/** Base64 of bytes, in the browser and in Node. */
export function base64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * The viewer's model file of a parts.json entry ({format: 1, id, tex, variants}) from the mod's own files, or null
 * when the part has no render model. Like the game, a stack's "_mounted" variant (battery plugged in) comes from the
 * same files as its base model. Throws for a model the viewer cannot draw (as the build tool does).
 */
export function partModel(p, res, { textureBytes = (path) => res.get(path) } = {}) {
  const m = p.model || {};
  if (m.kind !== 'model' || !m.drone) return null;
  const match = /^assets\/([^/]+)\/items\/drone_render\/(.+)\.json$/.exec(m.drone);
  if (!match) throw new Error(`${p.id}: unexpected render definition ${m.drone}`);
  const [, ns, local] = match;
  const available = new Set([m.drone, ...(m.variants || [])]);
  const variantPath = (suffix) => `assets/${ns}/items/drone_render/${local}${suffix}.json`;
  const readJson = (path) => {
    const json = parseJsonText(res.get(path));
    if (json === undefined) throw new Error(`${path}: not readable`);
    return json;
  };
  const paintFile = (() => {
    const data = res.get(`assets/${ns}/drone_paint.json`);
    return data == null ? null : parseJsonText(data) ?? null;
  })();
  const tintGroups = (key) => {
    const groups = paintFile && paintFile.models && (paintFile.models[key] || paintFile.models[`${ns}:${key}`]);
    return groups ? groups.map((g) => [g.channel, g.base]) : null;
  };
  const textures = [];
  const textureIndex = (rel) => {
    let i = textures.indexOf(rel);
    if (i < 0) {
      textures.push(rel);
      i = textures.length - 1;
    }
    return i;
  };
  const variants = {};
  const raw = {};
  const add = (name, suffix, geometryOf, fallback = false) => {
    const def = variantPath(suffix);
    if (!available.has(def) && !(fallback && res.has(def))) return false;
    const definition = readJson(def).model;
    if (!definition || definition.type !== 'minecraft:model') throw new Error(`${def}: plain minecraft:model expected`);
    const modelRel = modelFile(definition.model);
    if (!res.has(modelRel)) throw new Error(`${def}: model ${definition.model} not found`);
    const transformed = applyTransform(readJson(modelRel), transformOf(definition.transformation, def), def);
    const model = compactModel(transformed, def);
    if (textureBytes(model.texture) == null) throw new Error(`${def}: texture ${model.texture} not found`);
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
    const groups = tintGroups(`${local}${geometryOf ? suffix.replace(/_paint$/, '') : suffix}`);
    if (groups) entry.groups = groups;
    variants[name] = entry;
    raw[name] = { elements: namedBoxes(transformed) };
    return true;
  };
  add('base', '', null);
  if (p.category === 'prop' && add('ccw', '_ccw', null)) add('ccw_paint', '_ccw_paint', 'ccw');
  if (p.category === 'battery' && add('under', '_under', null)) add('under_paint', '_under_paint', 'under');
  if (p.category === 'stack' && add('mounted', '_mounted', null, true)) {
    const pigtail = pigtailOf(raw.mounted.elements);
    if (pigtail) {
      variants.mounted.pigtail = pigtail;
      add('mounted_paint', '_mounted_paint', 'mounted', true);
    } else {
      delete variants.mounted;
    }
  }
  add('paint', '_paint', 'base');
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
      if (socket) variants[name].socket = socket;
    }
  }
  const tex = textures.map((rel) => `data:image/png;base64,${base64(textureBytes(rel))}`);
  return { format: 1, id: p.id, tex, variants };
}

/** render.json additions of a mod's files: frame layouts and motor seats (drone_layout.json), paint channels. */
export function renderAdditions(res) {
  const { layouts: layoutJson, paint } = layoutAndPaintFiles(res);
  const channels = {};
  for (const file of Object.values(paint)) if (file && file.channels) Object.assign(channels, file.channels);
  const layouts = {};
  const motorSeats = {};
  for (const [ns, file] of Object.entries(layoutJson)) {
    if (!file) continue;
    for (const [key, entry] of Object.entries(file.frames || {})) layouts[key.includes(':') ? key : `${ns}:${key}`] = entry;
    for (const [key, seat] of Object.entries(file.motor_seat || {})) motorSeats[key.includes(':') ? key : `${ns}:${key}`] = seat;
  }
  const fpv = {};
  for (const [owner, json] of Object.entries(layoutJson)) fpv[owner] = fpvLayout(json, owner);
  return { channels, layouts, motor_seats: motorSeats, fpv };
}
