// The drone's block model for the simulator: the same parts, positions, textures and paint as the configurator's 3D view
// (assembly.js places the parts, viewer.js's createPartMeshes builds the meshes). Millimetres, frame origin, x right,
// y up, nose towards −z.

import { Group } from '../../vendor/three/three.min.js';
import { assemble } from '../configurator/assembly.js?v=4c00d7c2';
import { createPartMeshes } from '../configurator/viewer.js?v=7b1420f0';

const RENDER_URL = new URL('../../data/configurator/render.json', import.meta.url);
const MODEL_ROOT = new URL('../../data/configurator/models/', import.meta.url);

async function fetchJson(url) {
  try {
    const res = await fetch(url, { credentials: 'same-origin' });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/**
 * Loads the models of a build's parts and assembles them; resolves to a Group (meshes carry userData.role: frame, stack,
 * video, motor, prop, battery, accessory, accessory_base) or null when the render data is missing.
 * @param {object} build part ids
 * @param {object} paint paint slots ('#rrggbb')
 * @param {object} catalog configurator catalog
 */
export async function loadDroneModel(build, paint, catalog) {
  const render = await fetchJson(RENDER_URL);
  if (!render) return null;
  const ids = [...new Set([build.frame, build.stack, build.motor, build.prop, build.video, build.battery,
    ...Object.values(build.accessories || {})])].filter((id) => id && catalog.part(id));
  const models = new Map();
  await Promise.all(ids.map(async (id) => {
    if (!render.models.includes(id)) return;
    const [ns, path] = id.split(':');
    const model = await fetchJson(new URL(`${ns}/${catalog.category(id)}/${path}.json`, MODEL_ROOT));
    if (model) models.set(id, model);
  }));
  const assembly = assemble(build, { catalog, render, model: (id) => models.get(id) || null });
  const meshes = createPartMeshes({ catalog, render });
  const group = new Group();
  for (const piece of assembly.pieces) {
    const model = models.get(piece.id) || null;
    if (!model && !piece.procedural) continue;
    for (const mesh of meshes.pieceMeshes(piece, model, paint || {}, assembly.layout)) group.add(mesh);
  }
  return group;
}
