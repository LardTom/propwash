// 3D drone viewer of the configurator (three.js, WebGL). Draws the parts' Minecraft block models like the mod's drone
// renderer: model point (8, 8, 8) at the part position, 1 model unit = 8 mm, texture × tint × Minecraft's entity
// lighting (two fixed lights, 0.6 diffuse + 0.4 ambient), cutout alpha, nearest-neighbour textures.
//
// Camera preview: the FPV image like Propwash 0.4.0 draws it (FpvProps): a 16:9 rectilinear view from the lens with
// the drone's camera angle and the horizontal field of view of the video unit's camera, the own drone hidden except its props, spinning props as
// translucent blur discs (three bands from the hub to the blade tip) or still blades, over a sky and ground backdrop.

import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, BufferGeometry, BufferAttribute, ShaderMaterial, Texture,
  NearestFilter, LinearFilter, Vector3, Box3, Sphere, CanvasTexture, PlaneGeometry, MeshBasicMaterial, NoColorSpace,
  LinearSRGBColorSpace, OrbitControls,
} from '../../vendor/three/three.min.js';
import { assemble, proceduralFrame, proceduralAccessoryBase, MM_PER_MODEL_UNIT } from './assembly.js';
import { paintTints, groupsOf, rgbOf, slotOf, shade } from './paint.js';
import { discCenter, verticalFov, ASPECT as FPV_ASPECT, SLOTS } from './fpv.js';

const MAX_TINTS = 8;
const DEG = Math.PI / 180;
// Lighting.DIFFUSE_LIGHT_0 / _1 of Minecraft (world space).
const LIGHT0 = new Vector3(0.2, 1.0, -0.7).normalize();
const LIGHT1 = new Vector3(-0.2, 1.0, 0.7).normalize();
// Face order of the compact models and the vertices of each face (FaceInfo), as [x, y, z] picks of from/to.
const FACES = [
  { n: [0, -1, 0], v: [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]] }, // down
  { n: [0, 1, 0], v: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] }, // up
  { n: [0, 0, -1], v: [[1, 1, 0], [1, 0, 0], [0, 0, 0], [0, 1, 0]] }, // north
  { n: [0, 0, 1], v: [[0, 1, 1], [0, 0, 1], [1, 0, 1], [1, 1, 1]] }, // south
  { n: [-1, 0, 0], v: [[0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1]] }, // west
  { n: [1, 0, 0], v: [[1, 1, 1], [1, 0, 1], [1, 0, 0], [1, 1, 0]] }, // east
];
const UV_PICK = [[0, 1], [0, 3], [2, 3], [2, 1]];

const VERTEX = /* glsl */ `
attribute float tintIndex;
attribute vec3 baseColor;
uniform vec3 tints[${MAX_TINTS}];
varying vec2 vUv;
varying vec3 vColor;
varying vec3 vNormal;
void main() {
  vUv = uv;
  vec3 tint = vec3(1.0);
  int index = int(tintIndex + 0.5);
  if (tintIndex > -0.5) {
    for (int i = 0; i < ${MAX_TINTS}; i++) { if (i == index) tint = tints[i]; }
  }
  vColor = baseColor * tint;
  vNormal = normalize(transpose(inverse(mat3(modelMatrix))) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform vec3 light0;
uniform vec3 light1;
varying vec2 vUv;
varying vec3 vColor;
varying vec3 vNormal;
void main() {
  vec4 texel = texture2D(map, vUv);
  if (texel.a < 0.1) discard;
  vec3 n = normalize(vNormal);
  float light = min(1.0, (max(0.0, dot(light0, n)) + max(0.0, dot(light1, n))) * 0.6 + 0.4);
  gl_FragColor = vec4(texel.rgb * vColor * light, 1.0);
}`;

// FpvProps.buildBlur: bands [from, to] as share of the tip radius (null = hub), alpha at both edges; colour × 0.85.
const BLUR_SEGMENTS = 64;
const BLUR_SHADE = 0.85;
const BLUR_BANDS = [[null, 0.6, 0x58, 0x4c], [0.6, 0.85, 0x4c, 0x40], [0.85, 1.0, 0x40, 0x1c]];
// FallbackShapes.propColor by material when a prop has neither paint groups nor an accent colour.
const PROP_MATERIAL_COLOR = { carbon: 0x2b2c31, carbon_fiber_nylon: 0x3a3c42, glass_fiber_nylon: 0x5c6068 };
const PROP_DEFAULT_COLOR = 0xe4e4ea;
// Clip depth of the FPV props (FpvProps.CLIP_DEPTH_MM) as near plane.
const FPV_NEAR_MM = 0.25;
const FPV_FAR_MM = 8000;
const FPV_ALTITUDE_M = 2.5;

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

// Marked props: the disc area the props-in-view share counts, in the site's accent colour.
const MARK_FRAGMENT = /* glsl */ `
varying vec4 vColor;
void main() {
  gl_FragColor = vec4(1.0, 0.733, 0.0, 0.62);
}`;

// Backdrop of the camera preview: every pixel's view ray (camera looking along −z, tilted up around x) meets either the
// sky or a grass plane of 1 m blocks below the drone, fading into the horizon haze.
const BACKDROP_VERTEX = /* glsl */ `
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const BACKDROP_FRAGMENT = /* glsl */ `
uniform float tanH;
uniform float tanV;
uniform float tilt;
uniform float altitude;
varying vec2 vNdc;
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
void main() {
  float c = cos(tilt);
  float s = sin(tilt);
  vec3 cam = vec3(vNdc.x * tanH, vNdc.y * tanV, -1.0);
  vec3 dir = normalize(vec3(cam.x, cam.y * c - cam.z * s, cam.y * s + cam.z * c));
  vec3 haze = vec3(0.78, 0.85, 0.92);
  vec3 color;
  if (dir.y >= 0.0) {
    color = mix(haze, vec3(0.30, 0.50, 0.82), pow(dir.y, 0.6));
  } else {
    float t = altitude / -dir.y;
    vec2 p = dir.xz * t;
    float n = hash(floor(p));
    vec3 grass = mix(vec3(0.33, 0.52, 0.22), vec3(0.40, 0.60, 0.27), n);
    vec2 w = fwidth(p);
    vec2 g = abs(fract(p - 0.5) - 0.5) / max(w, vec2(1e-4));
    float line = (1.0 - min(min(g.x, g.y), 1.0)) * clamp(1.0 - 2.0 * max(w.x, w.y), 0.0, 1.0);
    grass *= 1.0 - 0.22 * line;
    color = mix(grass, haze, 1.0 - exp(-t * 0.015));
  }
  gl_FragColor = vec4(color, 1.0);
}`;

// ---------------------------------------------------------------------------------------------------------------
// Geometry

function rotationMatrix(ax, ay, az) {
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(ax * DEG), Math.sin(ax * DEG), Math.cos(ay * DEG), Math.sin(ay * DEG),
    Math.cos(az * DEG), Math.sin(az * DEG)];
  // Rz · Ry · Rx (X applied first), row-major.
  return [
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
    -sy, cy * sx, cy * cx,
  ];
}

const apply = (m, x, y, z) => [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];

/** BufferGeometry of compact model elements in millimetres around the model point (8, 8, 8). */
function modelGeometry(elements, tints) {
  const pos = [];
  const nor = [];
  const uvs = [];
  const tin = [];
  const index = [];
  let face = 0;
  for (const el of elements) {
    const from = el.slice(0, 3);
    const to = el.slice(3, 6);
    const rot = el[6];
    const m = rot ? rotationMatrix(rot[3], rot[4], rot[5]) : null;
    const faces = el[7];
    for (let f = 0; f < 6; f++) {
      const uv = faces[f];
      if (!uv) continue;
      const tint = tints ? tints[face] : -1;
      face++;
      const info = FACES[f];
      const normal = m ? apply(m, ...info.n) : info.n;
      const base = pos.length / 3;
      for (let v = 0; v < 4; v++) {
        let p = info.v[v].map((pick, axis) => (pick ? to[axis] : from[axis]));
        if (m) {
          const q = apply(m, p[0] - rot[0], p[1] - rot[1], p[2] - rot[2]);
          p = [q[0] + rot[0], q[1] + rot[1], q[2] + rot[2]];
        }
        pos.push((p[0] - 8) * MM_PER_MODEL_UNIT, (p[1] - 8) * MM_PER_MODEL_UNIT, (p[2] - 8) * MM_PER_MODEL_UNIT);
        nor.push(...normal);
        uvs.push(uv[UV_PICK[v][0]] / 16, uv[UV_PICK[v][1]] / 16);
        tin.push(tint);
      }
      index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  g.setAttribute('tintIndex', new BufferAttribute(new Float32Array(tin), 1));
  g.setAttribute('baseColor', new BufferAttribute(new Float32Array(tin.length * 3).fill(1), 3));
  g.setIndex(index);
  return g;
}

/** Geometry of box/cylinder primitives (FallbackShapes) with per-vertex colours. */
function shapeGeometry(shapes) {
  const pos = [];
  const nor = [];
  const col = [];
  const index = [];
  const push = (points, normal, color) => {
    const base = pos.length / 3;
    const rgb = [((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255];
    for (const p of points) {
      pos.push(...p);
      nor.push(...normal);
      col.push(...rgb);
    }
    for (let i = 1; i + 1 < points.length; i++) index.push(base, base + i, base + i + 1);
  };
  for (const s of shapes) {
    const [sx, sy, sz] = s.size;
    const ry = s.rotY || 0;
    const rz = s.rotZ || 0;
    const [cy, syn, cz, szn] = [Math.cos(ry), Math.sin(ry), Math.cos(rz), Math.sin(rz)];
    // Ry · Rz · scale, then translate.
    const tf = (x, y, z) => {
      let px = x * sx;
      let py = y * sy;
      const pz = z * sz;
      [px, py] = [px * cz - py * szn, px * szn + py * cz];
      return [px * cy + pz * syn + s.center[0], py + s.center[1], -px * syn + pz * cy + s.center[2]];
    };
    const tn = (x, y, z) => {
      let [nx, ny, nz] = [x / sx, y / sy, z / sz];
      [nx, ny] = [nx * cz - ny * szn, nx * szn + ny * cz];
      const out = [nx * cy + nz * syn, ny, -nx * syn + nz * cy];
      const len = Math.hypot(...out) || 1;
      return out.map((v) => v / len);
    };
    if (s.kind === 'box') {
      for (const f of FACES) {
        const pts = f.v.map((p) => tf(p[0] - 0.5, p[1] - 0.5, p[2] - 0.5));
        push(pts, tn(...f.n), s.color);
      }
    } else {
      const n = Math.max(3, s.segments || 12);
      for (let i = 0; i < n; i++) {
        const t0 = (2 * Math.PI * i) / n;
        const t1 = (2 * Math.PI * (i + 1)) / n;
        const [x0, z0, x1, z1] = [Math.cos(t0) * 0.5, -Math.sin(t0) * 0.5, Math.cos(t1) * 0.5, -Math.sin(t1) * 0.5];
        const mid = (t0 + t1) / 2;
        push([tf(x0, -0.5, z0), tf(x1, -0.5, z1), tf(x1, 0.5, z1), tf(x0, 0.5, z0)], tn(Math.cos(mid), 0, -Math.sin(mid)), s.color);
        push([tf(0, 0.5, 0), tf(x0, 0.5, z0), tf(x1, 0.5, z1)], tn(0, 1, 0), s.color);
        push([tf(0, -0.5, 0), tf(x1, -0.5, z1), tf(x0, -0.5, z0)], tn(0, -1, 0), s.color);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array((pos.length / 3) * 2).fill(0.5), 2));
  g.setAttribute('tintIndex', new BufferAttribute(new Float32Array(pos.length / 3).fill(-1), 1));
  g.setAttribute('baseColor', new BufferAttribute(new Float32Array(col), 3));
  g.setIndex(index);
  return g;
}

// ---------------------------------------------------------------------------------------------------------------
// Viewer

/** Blur disc of one prop (FpvProps.buildBlur) around its centre in the drone's frame, colour 0xRRGGBB. */
function discGeometry(center, hubRadius, radius, rgb) {
  const positions = [];
  const colors = [];
  const index = [];
  const r = ((rgb >> 16) & 255) / 255;
  const g = ((rgb >> 8) & 255) / 255;
  const b = (rgb & 255) / 255;
  for (const [from, to, innerAlpha, outerAlpha] of BLUR_BANDS) {
    const inner = from == null ? hubRadius : radius * from;
    const outer = radius * to;
    const base = positions.length / 3;
    for (let k = 0; k <= BLUR_SEGMENTS; k++) {
      const a = (k / BLUR_SEGMENTS) * Math.PI * 2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      positions.push(center[0] + inner * cos, center[1], center[2] + inner * sin, center[0] + outer * cos, center[1], center[2] + outer * sin);
      colors.push(r, g, b, innerAlpha / 255, r, g, b, outerAlpha / 255);
    }
    for (let k = 0; k < BLUR_SEGMENTS; k++) {
      const i = base + 2 * k;
      index.push(i, i + 1, i + 3, i, i + 3, i + 2);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('rgba', new BufferAttribute(new Float32Array(colors), 4));
  geometry.setIndex(index);
  return geometry;
}

/** FpvProps.blurRgb: the prop's paint at this position, else the prop channel of its model, else its accent colour. */
function discColor(prop, model, paint, slot) {
  const painted = paint && paint[slotOf('prop', slot)];
  if (painted) return rgbOf(painted);
  const groups = model && model.variants && model.variants.paint && model.variants.paint.groups;
  const group = groups && groups.find(([channel]) => channel === 'prop');
  if (group) return rgbOf(group[1]);
  if (prop.basics && prop.basics.accent) return rgbOf(prop.basics.accent);
  return PROP_MATERIAL_COLOR[prop.data.material] || PROP_DEFAULT_COLOR;
}

export function webglAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

/**
 * Creates the viewer in a container element.
 * @param {HTMLElement} container
 * @param {{catalog: object, render: object, loadModel: (id: string) => Promise<object|null>, autoRotate?: boolean,
 *   reducedMotion?: boolean}} options
 */
export function createViewer(container, options) {
  const { catalog, render } = options;
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.className = 'viewer__canvas';
  container.appendChild(canvas);

  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, 1, 20000);
  camera.position.set(-260, 190, -300);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !options.reducedMotion;
  controls.dampingFactor = 0.12;
  controls.enablePan = false;
  controls.rotateSpeed = 0.8;
  controls.autoRotate = !!options.autoRotate;
  controls.autoRotateSpeed = 1.6;
  controls.minPolarAngle = 0.05;
  controls.maxPolarAngle = Math.PI - 0.05;

  const droneGroup = new Group();
  scene.add(droneGroup);
  const discs = new Group();
  discs.visible = false;
  scene.add(discs);
  const discMaterial = new ShaderMaterial({ vertexShader: DISC_VERTEX, fragmentShader: DISC_FRAGMENT, transparent: true, depthWrite: false, side: 2 });
  const markMaterial = new ShaderMaterial({ vertexShader: DISC_VERTEX, fragmentShader: MARK_FRAGMENT, transparent: true, depthWrite: false, side: 2 });

  // Camera preview state: on, uptilt and camera FOV (degrees), spinning (blur discs) or still blades, frame shown,
  // discs marked.
  const fpv = { on: false, tilt: 0, fov: 120, spinning: true, frame: false, mark: false };
  const fpvCamera = new PerspectiveCamera(60, FPV_ASPECT, FPV_NEAR_MM, FPV_FAR_MM);
  const backdropMaterial = new ShaderMaterial({
    vertexShader: BACKDROP_VERTEX,
    fragmentShader: BACKDROP_FRAGMENT,
    uniforms: { tanH: { value: 1 }, tanV: { value: 1 }, tilt: { value: 0 }, altitude: { value: FPV_ALTITUDE_M } },
    depthTest: false,
    depthWrite: false,
  });
  const backdrop = new Scene();
  const backdropQuad = new Mesh(new PlaneGeometry(2, 2), backdropMaterial);
  backdropQuad.frustumCulled = false;
  backdrop.add(backdropQuad);

  // Soft ground shadow.
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const sctx = shadowCanvas.getContext('2d');
  const grad = sctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 128, 128);
  const shadowTexture = new CanvasTexture(shadowCanvas);
  shadowTexture.colorSpace = NoColorSpace;
  const shadow = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);

  const textureCache = new Map();
  const geometryCache = new Map();
  let white = null;
  let current = null;
  let generation = 0;
  let needsRender = true;
  let running = false;
  let visible = true;
  let fitted = false;
  let lastRadius = 0;
  let disposed = false;

  function texture(dataUrl) {
    let t = textureCache.get(dataUrl);
    if (!t) {
      const image = new Image();
      t = new Texture(image);
      t.magFilter = NearestFilter;
      t.minFilter = NearestFilter;
      t.generateMipmaps = false;
      t.colorSpace = NoColorSpace;
      t.flipY = false;
      image.onload = () => {
        t.needsUpdate = true;
        requestRender();
      };
      image.src = dataUrl;
      textureCache.set(dataUrl, t);
    }
    return t;
  }

  function whiteTexture() {
    if (!white) {
      const c = document.createElement('canvas');
      c.width = c.height = 2;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 2, 2);
      white = new CanvasTexture(c);
      white.colorSpace = NoColorSpace;
      white.magFilter = NearestFilter;
      white.minFilter = LinearFilter;
    }
    return white;
  }

  function material(map) {
    const tints = [];
    for (let i = 0; i < MAX_TINTS; i++) tints.push(new Vector3(1, 1, 1));
    return new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: { map: { value: map }, tints: { value: tints }, light0: { value: LIGHT0 }, light1: { value: LIGHT1 } },
    });
  }

  function geometryFor(model, id, variantName) {
    const key = `${id}#${variantName}`;
    let g = geometryCache.get(key);
    if (!g) {
      const variant = model.variants[variantName];
      const source = variant.of ? model.variants[variant.of] : variant;
      g = modelGeometry(source.el, variant.tint || null);
      geometryCache.set(key, g);
    }
    return g;
  }

  // One mesh per placed piece; painting swaps between the plain and the "_paint" model.
  function pieceMesh(piece, model, paint) {
    let mesh;
    if (piece.procedural === 'accessory_base') {
      const groups = groupsOf(piece, null, render) || [['tpu', '#262628']];
      const tpu = (paint && paint.tpu) || groups[0][1];
      mesh = new Mesh(shapeGeometry(proceduralAccessoryBase(rgbOf(tpu))), material(whiteTexture()));
      mesh.userData.dispose = true;
    } else if (piece.procedural === 'frame') {
      const frame = catalog.part(piece.id);
      mesh = new Mesh(shapeGeometry(proceduralFrame(frame, current.layout, catalog)), material(whiteTexture()));
      mesh.userData.dispose = true;
    } else {
      const plain = piece.variant === 'ccw' ? 'ccw' : 'base';
      const painted = plain === 'ccw' ? 'ccw_paint' : 'paint';
      const tints = model.variants[painted] ? paintTints(model.variants[painted].groups, paint, piece.paintPosition || 0, render.channels) : null;
      const name = tints ? painted : plain;
      const variant = model.variants[name];
      const mat = material(texture(model.tex[variant.tex]));
      if (tints) {
        tints.forEach((rgb, i) => {
          if (i < MAX_TINTS) mat.uniforms.tints.value[i].set(((rgb >> 16) & 255) / 255, ((rgb >> 8) & 255) / 255, (rgb & 255) / 255);
        });
      }
      mesh = new Mesh(geometryFor(model, piece.id, name), mat);
    }
    mesh.userData.role = piece.role;
    const [x, y, z] = piece.position;
    mesh.position.set(x, y, z);
    if (piece.tiltX) mesh.rotation.x = piece.tiltX * DEG;
    if (piece.spinY) mesh.rotation.y = piece.spinY;
    if (piece.stretchX && piece.stretchX !== 1) mesh.scale.set(piece.stretchX, 1, 1);
    return mesh;
  }

  function clearGroup() {
    for (const child of [...droneGroup.children]) {
      droneGroup.remove(child);
      child.material.dispose();
      if (child.userData.dispose) child.geometry.dispose();
    }
  }

  function rebuild(paint) {
    if (!current) return;
    clearGroup();
    for (const piece of current.assembly.pieces) {
      const model = current.models.get(piece.id);
      if (!model && !piece.procedural) continue;
      droneGroup.add(pieceMesh(piece, model, paint));
    }
    rebuildDiscs(paint);
    fpvVisibility();
    fit();
    requestRender();
  }

  function rebuildDiscs(paint) {
    for (const child of [...discs.children]) {
      discs.remove(child);
      child.geometry.dispose();
    }
    const view = current && current.camera;
    const prop = current && catalog.part(current.build.prop);
    if (!view || !prop) return;
    const rig = view.rig;
    const model = current.models.get(prop.id);
    for (let slot = 0; slot < SLOTS; slot++) {
      const rgb = shade(discColor(prop, model, paint, slot), BLUR_SHADE);
      discs.add(new Mesh(discGeometry(discCenter(rig, slot), rig.hubRadius, rig.radius, rgb), discMaterial));
    }
  }

  // In the game the own drone is hidden in FPV (QuadcopterRenderer) except its props; the frame is optional here.
  function fpvVisibility() {
    shadow.visible = !fpv.on;
    discs.visible = fpv.on && (fpv.spinning || fpv.mark);
    for (const disc of discs.children) disc.material = fpv.mark ? markMaterial : discMaterial;
    for (const child of droneGroup.children) {
      const role = child.userData.role;
      if (!fpv.on) child.visible = true;
      else if (role === 'prop') child.visible = !fpv.spinning;
      else if (role === 'video') child.visible = false;
      else child.visible = fpv.frame;
    }
  }

  // The 16:9 image, as large as fits into the canvas, centred.
  function fpvRect() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    let vw = w;
    let vh = w / FPV_ASPECT;
    if (vh > h) {
      vh = h;
      vw = h * FPV_ASPECT;
    }
    return { x: Math.round((w - vw) / 2), y: Math.round((h - vh) / 2), w: Math.round(vw), h: Math.round(vh), cw: w, ch: h };
  }

  function drawCamera() {
    const view = current && current.camera;
    const r = fpvRect();
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, r.cw, r.ch);
    renderer.clear();
    if (!view) return;
    const tanH = Math.tan((fpv.fov * DEG) / 2);
    fpvCamera.fov = verticalFov(fpv.fov, FPV_ASPECT);
    fpvCamera.aspect = FPV_ASPECT;
    fpvCamera.position.set(view.lens_mm[0], view.lens_mm[1], view.lens_mm[2]);
    fpvCamera.rotation.set(fpv.tilt * DEG, 0, 0);
    fpvCamera.updateProjectionMatrix();
    fpvCamera.updateMatrixWorld();
    backdropMaterial.uniforms.tanH.value = tanH;
    backdropMaterial.uniforms.tanV.value = tanH / FPV_ASPECT;
    backdropMaterial.uniforms.tilt.value = fpv.tilt * DEG;
    renderer.setViewport(r.x, r.y, r.w, r.h);
    renderer.setScissor(r.x, r.y, r.w, r.h);
    renderer.setScissorTest(true);
    renderer.autoClear = false;
    try {
      renderer.render(backdrop, fpvCamera);
      renderer.clearDepth();
      renderer.render(scene, fpvCamera);
    } finally {
      renderer.autoClear = true;
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, r.cw, r.ch);
    }
  }

  function draw() {
    if (fpv.on) drawCamera();
    else renderer.render(scene, camera);
  }

  function fit() {
    const box = new Box3().setFromObject(droneGroup);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new Sphere());
    const radius = Math.max(20, sphere.radius);
    const center = sphere.center;
    const size = box.getSize(new Vector3());
    shadow.position.set(center.x, box.min.y - 1, center.z);
    const spread = Math.max(size.x, size.z) * 1.25;
    shadow.scale.set(spread, spread, 1);
    const distance = (radius / Math.sin((camera.fov * DEG) / 2)) * 0.78;
    controls.minDistance = radius * 0.6;
    controls.maxDistance = radius * 7;
    camera.near = Math.max(0.5, radius / 50);
    camera.far = radius * 40;
    camera.updateProjectionMatrix();
    const changed = !fitted || Math.abs(radius - lastRadius) / lastRadius > 0.15;
    if (changed) {
      const dir = fitted ? camera.position.clone().sub(controls.target).normalize() : new Vector3(-0.62, 0.46, -0.64).normalize();
      controls.target.copy(center);
      camera.position.copy(center).add(dir.multiplyScalar(distance));
      fitted = true;
      lastRadius = radius;
    } else {
      controls.target.copy(center);
    }
    controls.update();
  }

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    requestRender();
  }

  function frame() {
    if (disposed) return;
    running = false;
    if (!visible) return;
    const orbiting = !fpv.on;
    const moving = orbiting && controls.update();
    if (needsRender || moving || (orbiting && controls.autoRotate)) {
      draw();
      needsRender = false;
    }
    if (orbiting && (controls.autoRotate || moving)) loop();
  }

  function loop() {
    if (!running && !disposed) {
      running = true;
      requestAnimationFrame(frame);
    }
  }

  function requestRender() {
    needsRender = true;
    loop();
  }

  controls.addEventListener('change', requestRender);
  controls.addEventListener('start', loop);

  const ro = new ResizeObserver(resize);
  ro.observe(container);
  const io = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible) requestRender();
  });
  io.observe(container);

  // Keyboard: arrows orbit, +/- zoom, 0 resets.
  canvas.tabIndex = 0;
  canvas.addEventListener('keydown', (e) => {
    if (fpv.on) return;
    const step = 0.12;
    const offset = camera.position.clone().sub(controls.target);
    let handled = true;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const angle = e.key === 'ArrowLeft' ? -step : step;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      offset.set(offset.x * cos - offset.z * sin, offset.y, offset.x * sin + offset.z * cos);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const r = offset.length();
      const polar = Math.acos(Math.max(-1, Math.min(1, offset.y / r)));
      const next = Math.max(controls.minPolarAngle, Math.min(controls.maxPolarAngle, polar + (e.key === 'ArrowUp' ? -step : step)));
      const flat = Math.hypot(offset.x, offset.z) || 1;
      const k = (r * Math.sin(next)) / flat;
      offset.set(offset.x * k, r * Math.cos(next), offset.z * k);
    } else if (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_') {
      const zoomIn = e.key === '+' || e.key === '=';
      const len = Math.max(controls.minDistance, Math.min(controls.maxDistance, offset.length() * (zoomIn ? 0.88 : 1.12)));
      offset.setLength(len);
    } else if (e.key === '0') {
      fitted = false;
      fit();
      requestRender();
      e.preventDefault();
      return;
    } else {
      handled = false;
    }
    if (handled) {
      e.preventDefault();
      camera.position.copy(controls.target).add(offset);
      controls.update();
      requestRender();
    }
  });

  resize();

  return {
    canvas,
    /** Shows a build ({build, paint}); resolves when its models are loaded and drawn. */
    async show(build, paint) {
      const token = ++generation;
      const ids = new Set([build.frame, build.stack, build.motor, build.prop, build.video, build.battery,
        ...Object.values(build.accessories || {})]);
      const known = [...ids].filter((id) => catalog.part(id));
      const models = new Map();
      await Promise.all(known.map((id) => options.loadModel(id).then((m) => {
        if (m) models.set(id, m);
      })));
      if (token !== generation || disposed) return null;
      const assembly = assemble(build, { catalog, render, model: (id) => models.get(id) || null });
      current = { build, models, assembly, layout: assembly.layout, camera: catalog.cameraView(build) };
      rebuild(paint);
      return current;
    },
    /**
     * Camera preview on or off and its settings: {on, tilt (uptilt °), fov (horizontal camera FOV °), spinning (blur
     * discs, else still blades), frame (draw the drone's own parts, which the game hides), mark (discs in the accent
     * colour: the area the props-in-view share counts)}.
     */
    setCamera(options) {
      Object.assign(fpv, options);
      controls.enabled = !fpv.on;
      fpvVisibility();
      requestRender();
      if (!fpv.on) loop();
    },
    camera: () => ({ ...fpv }),
    /** Repaints the current build. */
    paint(paint) {
      rebuild(paint);
    },
    /** Current assembly (pieces and loaded models) for the paint panel. */
    current: () => current,
    setAutoRotate(on) {
      controls.autoRotate = !!on;
      requestRender();
    },
    autoRotate: () => controls.autoRotate,
    /**
     * The drone alone on a transparent 2D canvas, from the current view direction, cropped to the drone plus pad
     * (share of its longer side) and as large as fits into maxWidth × maxHeight. Null when nothing is drawn.
     */
    snapshot({ maxWidth = 1600, maxHeight = 1600, pad = 0.05 } = {}) {
      const box = new Box3().setFromObject(droneGroup);
      if (box.isEmpty()) return null;
      const sphere = box.getBoundingSphere(new Sphere());
      const shot = camera.clone();
      const dir = camera.position.clone().sub(controls.target).normalize();
      const distance = Math.max(camera.position.distanceTo(controls.target), (sphere.radius / Math.sin((shot.fov * DEG) / 2)) * 1.02);
      shot.position.copy(sphere.center).add(dir.multiplyScalar(distance));
      shot.lookAt(sphere.center);
      shot.aspect = 1;
      shot.near = Math.max(0.5, distance - sphere.radius * 1.5);
      shot.far = distance + sphere.radius * 1.5;
      shot.updateProjectionMatrix();

      const ratio = renderer.getPixelRatio();
      const shadowVisible = shadow.visible;
      shadow.visible = false;
      renderer.setPixelRatio(1);
      const draw = (w, h) => {
        renderer.setSize(w, h, false);
        renderer.render(scene, shot);
        const out = document.createElement('canvas');
        out.width = w;
        out.height = h;
        out.getContext('2d').drawImage(canvas, 0, 0);
        return out;
      };
      let out = null;
      try {
        const probeSize = 640;
        const probe = draw(probeSize, probeSize);
        const data = probe.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, probeSize, probeSize).data;
        let x0 = probeSize;
        let y0 = probeSize;
        let x1 = -1;
        let y1 = -1;
        for (let y = 0; y < probeSize; y++) {
          for (let x = 0; x < probeSize; x++) {
            if (data[(y * probeSize + x) * 4 + 3] > 8) {
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
              if (y < y0) y0 = y;
              if (y > y1) y1 = y;
            }
          }
        }
        if (x1 >= 0) {
          const margin = Math.max(x1 - x0 + 1, y1 - y0 + 1) * pad + 1;
          const left = (x0 - margin) / probeSize;
          const top = (y0 - margin) / probeSize;
          const width = (x1 + 1 - x0 + 2 * margin) / probeSize;
          const height = (y1 + 1 - y0 + 2 * margin) / probeSize;
          const full = Math.min(maxWidth / width, maxHeight / height);
          const w = Math.max(1, Math.round(width * full));
          const h = Math.max(1, Math.round(height * full));
          shot.setViewOffset(full, full, left * full, top * full, w, h);
          out = draw(w, h);
        }
      } finally {
        shadow.visible = shadowVisible;
        renderer.setPixelRatio(ratio);
        resize();
        draw();
      }
      return out;
    },
    resetView() {
      fitted = false;
      fit();
      requestRender();
    },
    dispose() {
      disposed = true;
      ro.disconnect();
      io.disconnect();
      controls.dispose();
      clearGroup();
      for (const child of discs.children) child.geometry.dispose();
      discMaterial.dispose();
      markMaterial.dispose();
      backdropMaterial.dispose();
      backdropQuad.geometry.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
