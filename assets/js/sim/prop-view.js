// The props of the simulator's drone, drawn like Propwash 0.6.0 (three.js part; the rules are in prop-spin.js and
// fpv-props.js, the meshes come from drone-model.js):
//
// - Line of sight (DroneVisuals#submit): every prop turns with its rotor angle about its hub; an armed prop above the
//   blur threshold shows its blur model (translucent disc in the slot's prop paint, solid hub and nut) instead of the
//   blades. A prop without a blur model gets the procedural blur disc instead.
// - FPV (FpvProps, FpvPropPass, setting "Props in FPV view", on by default): the own drone is hidden; the camera's own
//   pass draws, relative to the lens and turned back by the uptilt, the props of the attached slots that reach into the
//   image (blades, or the blur disc plus the blur model's solid middle, turning with the rotor angle; scaled about the
//   lens by nearScale), the frame's arms and the motors of those slots, and with "Ducts in FPV view" (on, the game's
//   default) the duct rings of a ducted frame (clipped at 0.25 mm and pushed out to 52…55 mm, pushScale). It shares the
//   world's depth, so a block in front of the lens still covers them.
//
// Units: the camera pass works in millimetres (drone frame: x right, y up, −z front), placed at the camera with the
// drone's render orientation and scaled by 0.001.

import { Group, Mesh, BufferGeometry, BufferAttribute, ShaderMaterial, Vector3 } from '../../vendor/three/three.min.js';
import { discGeometry, discColor } from '../configurator/viewer.js?v=d03840d8';
import { shade } from '../configurator/paint.js?v=ed26e8eb';
import { PropSpin, SLOTS, SLOT_SIM_MOTOR, PROPS_IN_CCW, packedOutput } from './prop-spin.js?v=9659ba54';
import { FpvPropGeometry, FpvArmZone, FpvGuardZone, lensPolygon, viewTangents } from './fpv-props.js?v=83d63f01';

const BLUR_SHADE = 0.85;
// localStorage key of the setting "Props in FPV view" ('on' / 'off'; the game's default is on).
export const FPV_PROPS_KEY = 'propwash-sim-fpv-props';

const DISC_VERTEX = /* glsl */ `
attribute vec4 rgba;
varying vec4 vColor;
void main() {
  vColor = rgba;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const DISC_FRAGMENT = /* glsl */ `
varying vec4 vColor;
void main() {
  gl_FragColor = vColor;
}`;

/** The polygons of an indexed geometry drawn as triangle fans (block faces, shapes, disc bands): vertex index lists. */
export function polygonsOf(geometry) {
  const index = geometry.index ? geometry.index.array : Array.from({ length: geometry.attributes.position.count }, (_, i) => i);
  const out = [];
  let current = null;
  for (let t = 0; t + 2 < index.length; t += 3) {
    const [a, b, c] = [index[t], index[t + 1], index[t + 2]];
    if (current && current[0] === a && current[current.length - 1] === b) current.push(c);
    else {
      current = [a, b, c];
      out.push(current);
    }
  }
  return out;
}

/** The polygons of a mesh in the drone's frame (its matrix applied): [{ mesh, vertices, xyz }]. */
function meshPolygons(mesh) {
  mesh.updateMatrix();
  const pos = mesh.geometry.attributes.position;
  const v = new Vector3();
  return polygonsOf(mesh.geometry).map((vertices) => {
    const xyz = [];
    for (const i of vertices) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrix);
      xyz.push(v.x, v.y, v.z);
    }
    return { mesh, vertices, xyz };
  });
}

/**
 * One non-indexed geometry per material from polygons in the drone's frame, lens-relative, clipped and pushed
 * (FpvProps#emitGuards / #emitAtLens): every attribute of the source is kept, normals turned with the source mesh.
 */
function lensMeshes(polygons, lens, tilt, nearScale) {
  const byMaterial = new Map();
  for (const p of polygons) {
    const geometry = p.mesh.geometry;
    const names = Object.keys(geometry.attributes).filter((n) => n !== 'position');
    const n = new Vector3();
    const vertices = p.vertices.map((vi, k) => {
      const out = [p.xyz[k * 3], p.xyz[k * 3 + 1], p.xyz[k * 3 + 2]];
      for (const name of names) {
        const a = geometry.attributes[name];
        if (name === 'normal') {
          // Parts are placed by position and turns only (frame and motors), so the matrix turns the normal as it is.
          n.fromBufferAttribute(a, vi).transformDirection(p.mesh.matrix);
          out.push(n.x, n.y, n.z);
        } else for (let c = 0; c < a.itemSize; c++) out.push(a.array[vi * a.itemSize + c]);
      }
      return out;
    });
    const clipped = lensPolygon(vertices, lens, tilt, nearScale);
    if (clipped.length < 3) continue;
    let entry = byMaterial.get(p.mesh.material);
    if (!entry) {
      entry = { names, sizes: names.map((name) => geometry.attributes[name].itemSize), position: [], data: names.map(() => []) };
      byMaterial.set(p.mesh.material, entry);
    }
    const emit = (v) => {
      entry.position.push(v[0], v[1], v[2]);
      let at = 4;
      entry.sizes.forEach((size, i) => {
        for (let c = 0; c < size; c++) entry.data[i].push(v[at + c]);
        at += size;
      });
    };
    for (let i = 1; i + 1 < clipped.length; i++) {
      emit(clipped[0]);
      emit(clipped[i]);
      emit(clipped[i + 1]);
    }
  }
  const meshes = [];
  for (const [material, entry] of byMaterial) {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(entry.position), 3));
    entry.names.forEach((name, i) => g.setAttribute(name, new BufferAttribute(new Float32Array(entry.data[i]), entry.sizes[i])));
    const mesh = new Mesh(g, material);
    mesh.userData.dispose = true;
    mesh.frustumCulled = false;
    meshes.push(mesh);
  }
  return meshes;
}

export class PropView {
  /**
   * @param {object} options { airframe (AirframeSpec), rig (fpv.js rig or null), uptiltDeg, frame (catalog part),
   *   prop (catalog part), paint, propsInFpv (default true), ductsInFpv (default true) }
   */
  constructor(options) {
    this.airframe = options.airframe;
    this.rig = options.rig || null;
    this.tilt = options.uptiltDeg;
    this.frame = options.frame || null;
    this.prop = options.prop || null;
    this.paint = options.paint || {};
    this.propsInFpv = options.propsInFpv !== false;
    this.ductsInFpv = options.ductsInFpv !== false;
    // Spin direction per slot: the flight model's motor spin (+1 counter-clockwise), the same the frame's layout gives.
    const ccw = Array.from({ length: SLOTS }, (_, slot) => {
      const motor = SLOT_SIM_MOTOR[slot];
      return this.airframe && typeof this.airframe.spin === 'function' ? this.airframe.spin(motor) > 0 : PROPS_IN_CCW[slot];
    });
    this.spin = new PropSpin(ccw);
    this.outputs = new Array(SLOTS).fill(0);
    this.drone = null;
    this.geometry = null;
    this.discMaterial = new ShaderMaterial({
      vertexShader: DISC_VERTEX, fragmentShader: DISC_FRAGMENT, transparent: true, depthWrite: false, side: 2,
    });
    // Camera pass: a group at the camera with the drone's orientation, millimetres.
    this.fpvGroup = new Group();
    this.fpvGroup.matrixAutoUpdate = false;
    this.fpvGroup.visible = false;
    this.armsGroup = new Group();
    this.ductsGroup = new Group();
    this.discGroup = new Group();
    this.propRoot = new Group();
    this.propRoot.matrixAutoUpdate = false;
    this.fpvGroup.add(this.ductsGroup, this.armsGroup, this.discGroup, this.propRoot);
    this.fpvSlots = [];
    this.discs = [];
    this.unit = new Vector3(0.001, 0.001, 0.001);
  }

  /** The lens in the frame's millimetres (FpvRig.lens), else from the flight model's lens above the centre of mass. */
  lensMm() {
    if (this.rig && this.rig.lens) return this.rig.lens.slice(0, 3);
    const p = this.airframe;
    return [p.lensRight * 1000, (p.lensUp + p.comHeight) * 1000, -p.lensForward * 1000];
  }

  /** Takes the drone's meshes (group.userData.drone of drone-model.js) and builds the camera pass. */
  setModel(group) {
    this.drone = group && group.userData ? group.userData.drone || null : null;
    this.build();
  }

  setTilt(deg) {
    if (deg === this.tilt) return;
    this.tilt = deg;
    this.build();
  }

  setPropsInFpv(on) {
    this.propsInFpv = !!on;
  }

  clearFpv() {
    for (const g of [this.armsGroup, this.ductsGroup, this.discGroup]) {
      for (const child of [...g.children]) {
        g.remove(child);
        if (child.userData.dispose) child.geometry.dispose();
      }
    }
    this.propRoot.clear();
    this.fpvSlots = [];
    this.discs = [];
    this.geometry = null;
  }

  /** FpvProps.compute and the meshes of the camera pass for the current uptilt. */
  build() {
    this.clearFpv();
    const d = this.drone;
    if (!d || !d.props.length) return;
    const prop = this.prop || (d.prop && d.prop.part) || null;
    if (!prop) return;
    const layout = d.assembly.layout;
    const motors = layout.motors.map((m) => m.slice(0, 3));
    const lens = this.lensMm();
    const radius = prop.data.diameter_mm * 0.5;
    const hubs = Array.from({ length: SLOTS }, (_, slot) => (d.props[slot] ? d.props[slot].hub : (this.rig ? this.rig.hubs[slot] : motors[slot])));
    const frame = this.frame || d.framePart || null;
    const ducted = !!(frame && frame.derived && frame.derived.ducted);
    const maxProp = frame && frame.data && Array.isArray(frame.data.props_mm) ? frame.data.props_mm[1] : 0;
    const guardZone = FpvGuardZone.of(ducted, motors, maxProp);
    const armZone = new FpvArmZone(motors, guardZone);
    const framePolys = d.frame.flatMap(meshPolygons);
    // FpvGuards#arms: faces of the arm zone, without the duct rings among them; the motors of every slot.
    const armCandidates = framePolys.filter((p) => armZone.contains(p.xyz));
    const armSelected = armZone.select(armCandidates.map((p) => p.xyz));
    const arms = armCandidates.filter((_, i) => armSelected[i]);
    const attached = armZone.attached(arms.map((p) => p.xyz));
    const motorPolys = d.motors.map((list) => list.flatMap(meshPolygons));
    // FpvGuards#mesh: the duct rings of a ducted frame.
    let guards = [];
    if (guardZone && this.ductsInFpv) {
      const candidates = framePolys.filter((p) => guardZone.contains(p.xyz));
      const selected = guardZone.select(candidates.map((p) => p.xyz));
      guards = candidates.filter((_, i) => selected[i]);
    }
    const guardPoints = guards.flatMap((p) => p.xyz);
    const armQuads = [...arms, ...motorPolys.flat()].map((p) => p.xyz);
    const geometry = new FpvPropGeometry(hubs, radius, lens, this.tilt, guardPoints, armQuads, attached);
    this.geometry = geometry;
    this.attachedSlots = attached;
    this.armPolygons = arms.length;
    this.guardPolygons = guards.length;
    const near = geometry.nearScale;

    for (const mesh of lensMeshes([...arms, ...motorPolys.flatMap((list, slot) => (attached[slot] ? list : []))], lens, this.tilt, near)) {
      this.armsGroup.add(mesh);
    }
    for (const mesh of lensMeshes(guards, lens, this.tilt, near)) this.ductsGroup.add(mesh);

    // Blur discs (FpvProps.buildBlur) at the hub, lifted by 0.55 × the hub height.
    const lift = this.rig ? this.rig.discLift : 0;
    const hubRadius = this.rig ? this.rig.hubRadius : radius * 0.15;
    const model = d.prop ? d.prop.model : null;
    for (let slot = 0; slot < SLOTS; slot++) {
      const hub = hubs[slot];
      const rgb = shade(discColor(prop, model, this.paint, slot), BLUR_SHADE);
      const source = new Mesh(discGeometry([hub[0], hub[1] + lift, hub[2]], hubRadius, radius, rgb), this.discMaterial);
      const [disc] = lensMeshes(meshPolygons(source), lens, this.tilt, near);
      source.geometry.dispose();
      const mesh = disc || new Mesh(new BufferGeometry(), this.discMaterial);
      mesh.visible = false;
      mesh.renderOrder = 1;
      this.discGroup.add(mesh);
      this.discs.push(mesh);
    }

    // Blades and blur middle, scaled about the lens by nearScale (FpvProps#draw).
    // scale(near) · translate(−lens)
    this.propRoot.matrix.makeScale(near, near, near).setPosition(-lens[0] * near, -lens[1] * near, -lens[2] * near);
    for (let slot = 0; slot < SLOTS; slot++) {
      const g = new Group();
      const hub = hubs[slot];
      g.position.set(hub[0], hub[1], hub[2]);
      const set = d.fpv[slot] || { blades: [], center: [] };
      for (const m of set.blades) g.add(m);
      for (const m of set.center) g.add(m);
      g.visible = false;
      this.propRoot.add(g);
      this.fpvSlots.push({ group: g, blades: set.blades, center: set.center });
    }
  }

  /**
   * One frame: rotor speeds (share of the maximum per flight-model motor) and arming → motor outputs, angles and blur.
   * @param {number} dt seconds
   * @param {ArrayLike<number>} rpmFraction per flight-model motor, 0..1
   * @param {boolean} armed
   */
  update(dt, rpmFraction, armed) {
    for (let slot = 0; slot < SLOTS; slot++) {
      const share = rpmFraction ? rpmFraction[SLOT_SIM_MOTOR[slot]] : 0;
      this.outputs[slot] = armed ? packedOutput(Number.isFinite(share) ? share : 0) : 0;
    }
    this.spin.update(dt, this.outputs, armed);
  }

  angle(slot) {
    return this.spin.angle(slot);
  }

  blur(slot) {
    return this.spin.blur(slot);
  }

  /** Line of sight: blades or blur model per slot, turned by the rotor angle. */
  poseLineOfSight() {
    this.fpvGroup.visible = false;
    const d = this.drone;
    if (!d) return;
    for (let slot = 0; slot < SLOTS; slot++) {
      const p = d.props[slot];
      if (!p) continue;
      const angle = this.angle(slot);
      const blur = this.blur(slot) && p.blur.length > 0;
      for (const m of p.blades) {
        m.rotation.y = angle;
        m.visible = !blur;
      }
      for (const m of p.blur) {
        m.rotation.y = angle;
        m.visible = blur;
      }
    }
  }

  /**
   * FPV: the camera pass at the camera (position, view angles) with the drone's render orientation.
   * @param {import('three').PerspectiveCamera} camera
   * @param {import('three').Quaternion} orientation the drone's render orientation
   */
  poseFpv(camera, orientation) {
    const g = this.geometry;
    this.fpvGroup.visible = !!g;
    if (!g) return;
    this.fpvGroup.matrix.compose(camera.position, orientation, this.unit);
    this.fpvGroup.matrixWorldNeedsUpdate = true;
    const { tanX, tanY } = viewTangents(camera.fov, camera.aspect);
    this.lastTangents = { tanX, tanY };
    for (let slot = 0; slot < SLOTS; slot++) {
      const s = this.fpvSlots[slot];
      const shows = this.propsInFpv && g.shows(slot, tanX, tanY);
      const blur = this.blur(slot);
      s.group.visible = shows;
      s.group.rotation.y = this.angle(slot);
      for (const m of s.blades) m.visible = !blur;
      for (const m of s.center) m.visible = blur;
      this.discs[slot].visible = shows && blur;
    }
    this.armsGroup.visible = this.propsInFpv && this.armsGroup.children.length > 0 && g.armsVisible(tanX, tanY);
    this.ductsGroup.visible = this.ductsInFpv && this.ductsGroup.children.length > 0 && g.guardsVisible(tanX, tanY);
  }

  /** What the camera pass shows now (tests and the browser console). */
  fpvState() {
    const g = this.geometry;
    return {
      built: !!g,
      nearScale: g ? g.nearScale : null,
      attached: g ? this.attachedSlots.slice() : [],
      shown: this.fpvSlots.map((s) => s.group.visible),
      discs: this.discs.map((m) => m.visible),
      arms: this.armsGroup.visible,
      armPolygons: this.armPolygons || 0,
      ducts: this.ductsGroup.visible,
      ductPolygons: this.guardPolygons || 0,
    };
  }

  dispose() {
    this.clearFpv();
    this.discMaterial.dispose();
  }
}
