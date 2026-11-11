// The drone's block model for the simulator: the same parts, positions, textures and paint as the configurator's 3D view
// (assembly.js places the parts, viewer.js's createPartMeshes builds the meshes). Millimetres, frame origin, x right,
// y up, nose towards −z.
//
// The props come twice per slot, like Propwash 0.6.0 draws them (DroneAssembly#prop and #blur): the blades (the "_ccw"
// model on a counter-clockwise slot) and the blur model (translucent disc and solid hub, painted with the slot's prop
// paint), each at the hub; prop-view.js turns them with the rotor angle and shows one of them. A third and fourth set
// of the same meshes is drawn in the camera's own pass of the FPV view (blades, and the blur model's solid middle).

import { Group } from '../../vendor/three/three.min.js';
import { assemble } from '../configurator/assembly.js?v=4c00d7c2';
import { createPartMeshes } from '../configurator/viewer.js?v=d03840d8';

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
 * Loads the models of a build's parts and assembles them; resolves to a Group or null when the render data is missing.
 * Meshes carry userData.role (frame, stack, video, antenna, motor, prop, battery, accessory, accessory_base), motors and
 * props also userData.slot, a prop's blur meshes userData.blur. group.userData.drone holds what prop-view.js needs:
 * { assembly, props: [{ hub, counterClockwise, blades, blur }] per slot, frame (meshes), motors (meshes per slot),
 * fpv: [{ blades, center }] per slot (own meshes for the camera pass), prop: { part, model }, framePart, paint }.
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
  return droneModel(build, paint, catalog, render, models);
}

/**
 * The drone's Group from loaded data (see loadDroneModel): render.json and the model files of its parts (id → model).
 * @param {object} build part ids
 * @param {object} paint paint slots
 * @param {object} catalog configurator catalog
 * @param {object} render render.json
 * @param {Map<string, object>} models
 */
export function droneModel(build, paint, catalog, render, models) {
  const assembly = assemble(build, { catalog, render, model: (id) => models.get(id) || null });
  const meshes = createPartMeshes({ catalog, render });
  const group = new Group();
  const drone = {
    assembly,
    props: [],
    frame: [],
    motors: [[], [], [], []],
    fpv: [],
    prop: build.prop ? { part: catalog.part(build.prop), model: models.get(build.prop) || null } : null,
    framePart: catalog.part(build.frame) || null,
    paint: paint || {},
  };
  const mark = (list, piece, extra = {}) => list.map((mesh) => {
    if (piece.slot != null) mesh.userData.slot = piece.slot;
    Object.assign(mesh.userData, extra);
    return mesh;
  });
  for (const piece of assembly.pieces) {
    const model = models.get(piece.id) || null;
    if (!model && !piece.procedural) continue;
    const list = mark(meshes.pieceMeshes(piece, model, paint || {}, assembly.layout), piece);
    for (const mesh of list) group.add(mesh);
    if (piece.role === 'frame') drone.frame.push(...list);
    if (piece.role === 'motor') drone.motors[piece.slot].push(...list);
    if (piece.role !== 'prop') continue;
    const slot = piece.slot;
    const hasBlur = !!(model && model.variants.blur);
    const blurPiece = { ...piece, variant: 'blur', spinY: 0 };
    const blur = hasBlur ? mark(meshes.pieceMeshes(blurPiece, model, paint || {}, assembly.layout), piece, { blur: true }) : [];
    for (const mesh of blur) {
      mesh.visible = false;
      group.add(mesh);
    }
    drone.props[slot] = { hub: piece.position.slice(), counterClockwise: !!piece.counterClockwise, blades: list, blur };
    // The camera pass draws its own meshes (same geometry and textures): blades, and the blur model's solid middle.
    const at = { ...piece, position: [0, 0, 0], spinY: 0 };
    drone.fpv[slot] = {
      blades: mark(meshes.pieceMeshes(at, model, paint || {}, assembly.layout), piece),
      center: hasBlur ? mark(meshes.pieceMeshes({ ...at, variant: 'blur' }, model, paint || {}, assembly.layout), piece, { blur: true })
        .filter((mesh) => !mesh.userData.translucent) : [],
    };
  }
  group.userData.drone = drone;
  return group;
}
