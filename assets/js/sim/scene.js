// The simulator's 3D view (three.js): the map with Minecraft's block shading and concrete texture, the ground and sky
// around it, the drone with the configurator's block models (like the mod's drone renderer: model pivot at the centre of
// mass, comHeight above the frame origin) and two cameras – FPV from the drone's lens (like Propwash's FpvView: body
// orientation turned 180° about its up axis, lens offset right/up/−forward, camera uptilt about the lens' x axis,
// horizontal FOV of the video unit on a 16:9 image, the own drone hidden; its props, motors and arms in the camera's own
// pass like FpvProps, see prop-view.js) and line of sight from a pilot standing behind the start pad. The props turn
// with the rotor speed of their motor and show their blur model when spinning (prop-view.js, prop-spin.js); until the
// block models are loaded (or without render data) translucent blur discs stand in for them.

import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, BufferGeometry, BufferAttribute, ShaderMaterial, Vector3,
} from '../../vendor/three/three.min.js';
import { verticalFov, discCenter, ASPECT as FPV_ASPECT, SLOTS } from '../configurator/fpv.js?v=76cdbbe6';
import { rgbOf, shade, slotOf } from '../configurator/paint.js?v=ed26e8eb';
import { FpvEyeGuard, VANILLA_NEAR } from './eye.js?v=2df6b5d1';
import { PropView } from './prop-view.js?v=3d6048f4';

const DEG = Math.PI / 180;
const SKY = [0.47, 0.65, 1.0];
const FOG_NEAR = 80;
const FOG_FAR = 600;
// Beyond the fog everything is sky colour; a short far plane keeps the depth buffer precise (no flicker from high up).
const FAR = 1000;
const GROUND_SIZE = 2000;
// Minecraft's face shading (top, bottom, north/south, east/west).
const FACE_SHADE = { up: 1.0, down: 0.5, z: 0.8, x: 0.6 };
// Average colours of the concrete textures (sRGB).
const BLOCK_COLORS = [
  ['light_gray_concrete', '#7d7d73'],
  ['gray_concrete', '#36393d'],
  ['yellow_concrete', '#f1af15'],
  ['white_concrete', '#cfd5d6'],
  ['black_concrete', '#080a0f'],
  ['red_concrete', '#8e2121'],
  ['orange_concrete', '#e06101'],
  ['blue_concrete', '#2d2f8f'],
  ['lime_concrete', '#5ea918'],
];
const GRASS = [0.37, 0.6, 0.22];
// Blur discs like FpvProps (viewer.js): three bands from the hub to the tip.
const BLUR_SEGMENTS = 48;
const BLUR_BANDS = [[null, 0.6, 0x58, 0x4c], [0.6, 0.85, 0x4c, 0x40], [0.85, 1.0, 0x40, 0x1c]];
const BLUR_SHADE = 0.85;
const PROP_MATERIAL_COLOR = { carbon: 0x2b2c31, carbon_fiber_nylon: 0x3a3c42, glass_fiber_nylon: 0x5c6068 };
const PROP_DEFAULT_COLOR = 0xe4e4ea;

const BLOCK_VERTEX = /* glsl */ `
attribute vec3 color;
varying vec3 vColor;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vColor = color;
  vNormal = normal;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

// Concrete: flat colour per block with a faint 16×16 texel grain, a dark seam between blocks, fog with distance.
const BLOCK_FRAGMENT = /* glsl */ `
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
uniform vec3 gridOrigin;
uniform float seam;
varying vec3 vColor;
varying vec3 vWorld;
varying vec3 vNormal;
float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
void main() {
  vec3 g = vWorld - gridOrigin;
  vec3 n = abs(vNormal);
  vec2 uv = n.y > 0.5 ? g.xz : (n.x > 0.5 ? g.zy : g.xy);
  vec2 f = fract(uv);
  float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
  float px = fwidth(uv.x) + fwidth(uv.y);
  float line = (1.0 - smoothstep(0.0, max(0.02, px * 1.2), edge)) * (1.0 - smoothstep(0.15, 0.5, px));
  vec3 block = floor(g - vNormal * 0.01);
  float b = hash(block + 0.37);
  vec2 texel = floor(f * 16.0);
  float t = hash(vec3(texel, block.x * 3.1 + block.y * 1.7 + block.z));
  float grain = mix(0.965 + 0.07 * t, 1.0, smoothstep(0.5, 2.0, px * 16.0));
  vec3 c = vColor * (0.955 + 0.06 * b) * grain * (1.0 - seam * line);
  // Distance per pixel: the ground's quads are hundreds of metres wide, an interpolated distance would fog them away.
  float fog = smoothstep(fogNear, fogFar, length(vWorld - cameraPosition));
  gl_FragColor = vec4(mix(c, fogColor, fog), 1.0);
}`;

const DISC_VERTEX = /* glsl */ `
attribute vec4 rgba;
varying vec4 vColor;
void main() {
  vColor = rgba;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const DISC_FRAGMENT = /* glsl */ `
varying vec4 vColor;
uniform float strength;
void main() {
  gl_FragColor = vec4(vColor.rgb, vColor.a * strength);
}`;

function hexRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

function linearToSrgb(c) {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function blockColor(primitive) {
  const name = primitive.name.toLowerCase();
  for (const [key, hex] of BLOCK_COLORS) {
    if (name.includes(key) && !(key === 'gray_concrete' && name.includes('light_gray'))) return hexRgb(hex);
  }
  return primitive.color.map(linearToSrgb);
}

function faceShade(nx, ny, nz) {
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const az = Math.abs(nz);
  if (ay >= ax && ay >= az) return ny > 0 ? FACE_SHADE.up : FACE_SHADE.down;
  return az >= ax ? FACE_SHADE.z : FACE_SHADE.x;
}

/** Geometry of the map: flat-shaded faces with the block colour × Minecraft's face shading per vertex. */
function mapGeometry(primitives) {
  const positions = [];
  const normals = [];
  const colors = [];
  for (const p of primitives) {
    const base = blockColor(p);
    const idx = p.indices;
    const pos = p.positions;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3;
      const b = idx[t + 1] * 3;
      const c = idx[t + 2] * 3;
      const ux = pos[b] - pos[a]; const uy = pos[b + 1] - pos[a + 1]; const uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a]; const vy = pos[c + 1] - pos[a + 1]; const vz = pos[c + 2] - pos[a + 2];
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      const s = faceShade(nx, ny, nz);
      for (const v of [a, b, c]) {
        positions.push(pos[v], pos[v + 1], pos[v + 2]);
        normals.push(nx, ny, nz);
        colors.push(base[0] * s, base[1] * s, base[2] * s);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  return g;
}

/**
 * Grass around the map at its floor level: four quads framing the map's footprint, so no ground lies under the map's
 * own floor (two surfaces 2 cm apart flickered in the distance).
 */
function groundGeometry(world, size) {
  const y = world.baseTop;
  const [x0, z0] = [world.min[0], world.min[2]];
  const [x1, z1] = [world.max[0], world.max[2]];
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const X0 = cx - size / 2;
  const X1 = cx + size / 2;
  const Z0 = cz - size / 2;
  const Z1 = cz + size / 2;
  const rects = [[X0, Z0, X1, z0], [X0, z1, X1, Z1], [X0, z0, x0, z1], [x1, z0, X1, z1]];
  const positions = [];
  const index = [];
  for (const [a, b, c, d] of rects) {
    const base = positions.length / 3;
    positions.push(a, y, b, a, y, d, c, y, d, c, y, b);
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const n = positions.length / 3;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(n * 3).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(n * 3).map((_, i) => GRASS[i % 3]), 3));
  g.setIndex(index);
  return g;
}

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

export class SimScene {
  /**
   * @param {HTMLElement} container
   * @param {object} options { world, primitives, airframe (AirframeSpec), rig (fpv rig), prop (catalog part), paint, uptiltDeg }
   */
  constructor(container, options) {
    this.container = container;
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x78a7ff, 1);
    container.append(this.renderer.domElement);
    this.scene = new Scene();
    this.view = 'fpv';
    this.world = options.world;
    const fogUniforms = () => ({
      fogColor: { value: SKY },
      fogNear: { value: FOG_NEAR },
      fogFar: { value: FOG_FAR },
    });
    // Block seams sit on whole metres from the map's own corner.
    const gridOrigin = [this.world.min[0], this.world.min[1], this.world.min[2]];
    this.blockMaterial = new ShaderMaterial({
      vertexShader: BLOCK_VERTEX,
      fragmentShader: BLOCK_FRAGMENT,
      uniforms: { ...fogUniforms(), gridOrigin: { value: gridOrigin }, seam: { value: 0.16 } },
    });
    this.groundMaterial = new ShaderMaterial({
      vertexShader: BLOCK_VERTEX,
      fragmentShader: BLOCK_FRAGMENT,
      uniforms: { ...fogUniforms(), gridOrigin: { value: gridOrigin }, seam: { value: 0.07 } },
    });
    this.scene.add(new Mesh(mapGeometry(options.primitives), this.blockMaterial));
    this.scene.add(new Mesh(groundGeometry(this.world, GROUND_SIZE), this.groundMaterial));

    // Drone: render frame = sim body turned 180° about its up axis, at the centre of mass. The block model (millimetres,
    // frame origin) hangs below it by comHeight, like the mod's renderer pivots it about (0, comHeight, 0).
    this.drone = new Group();
    this.drone.matrixAutoUpdate = false;
    this.scene.add(this.drone);
    this.model = new Group();
    this.model.scale.setScalar(0.001);
    this.model.position.set(0, -options.airframe.comHeight, 0);
    this.drone.add(this.model);
    this.discMaterial = new ShaderMaterial({
      vertexShader: DISC_VERTEX, fragmentShader: DISC_FRAGMENT, transparent: true, depthWrite: false, side: 2,
      uniforms: { strength: { value: 1.0 } },
    });
    this.airframe = options.airframe;
    this.rig = options.rig;
    this.buildDiscs(options);
    this.hasModel = false;
    this.props = new PropView({
      airframe: options.airframe, rig: options.rig, uptiltDeg: options.uptiltDeg, frame: options.frame, prop: options.prop,
      paint: options.paint, propsInFpv: options.propsInFpv,
    });
    this.scene.add(this.props.fpvGroup);

    this.fpvCamera = new PerspectiveCamera(70, 16 / 9, VANILLA_NEAR, FAR);
    this.eyeGuard = new FpvEyeGuard(this.world);
    this.losCamera = new PerspectiveCamera(55, 16 / 9, 0.05, FAR);
    this.uptiltDeg = options.uptiltDeg;
    this.fovDeg = options.rig ? options.rig.fov : 120;
    this.resize();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
  }

  /** Puts the drone's block model (a Group in millimetres, see drone-model.js) in place of the props-only drone. */
  setModel(group) {
    this.model.clear();
    this.model.add(group);
    this.props.setModel(group);
    this.hasModel = !!(group.userData.drone && group.userData.drone.props.length);
  }

  /** Setting "Props in FPV view" (FpvProps, on by default): props, motors and arms in the FPV image. */
  setFpvProps(on) {
    this.props.setPropsInFpv(on);
  }

  buildDiscs(options) {
    const p = this.airframe;
    const rig = this.rig;
    const prop = options.prop;
    const paint = options.paint || {};
    this.discs = new Group();
    const comMm = p.comHeight * 1000.0;
    const color = (slot) => {
      const painted = paint[slotOf('prop', slot)];
      if (painted) return rgbOf(painted);
      if (prop && prop.basics && prop.basics.accent) return rgbOf(prop.basics.accent);
      return (prop && PROP_MATERIAL_COLOR[prop.data.material]) || PROP_DEFAULT_COLOR;
    };
    for (let slot = 0; slot < SLOTS; slot++) {
      let center;
      let radius;
      let hub;
      if (rig) {
        const c = discCenter(rig, slot);
        center = [c[0] / 1000, (c[1] - comMm) / 1000, c[2] / 1000];
        radius = rig.radius / 1000;
        hub = rig.hubRadius / 1000;
      } else {
        center = [-p.motorX(slot), p.motorY(slot) + 0.01, -p.motorZ(slot)];
        radius = p.propRadius;
        hub = radius * 0.15;
      }
      this.discs.add(new Mesh(discGeometry(center, hub, radius, shade(color(slot), BLUR_SHADE)), this.discMaterial));
    }
    this.drone.add(this.discs);
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.width = w;
    this.height = h;
    // The FPV image keeps the game's horizontal field of view; wider windows show more, never a squeezed image.
    const aspect = w / h;
    this.fpvCamera.aspect = aspect;
    this.fpvCamera.fov = this.fpvVerticalFov(aspect);
    this.fpvCamera.updateProjectionMatrix();
    this.losCamera.aspect = aspect;
    this.losCamera.updateProjectionMatrix();
  }

  fpvVerticalFov(aspect) {
    // Vertical FOV of the 16:9 image; a narrower window keeps it and crops the sides.
    const v = verticalFov(this.fovDeg, FPV_ASPECT);
    return aspect >= FPV_ASPECT ? v : 2 * Math.atan(Math.tan(this.fovDeg * DEG / 2) / aspect) / DEG;
  }

  setUptilt(deg) {
    this.uptiltDeg = deg;
    this.props.setTilt(deg);
  }

  setView(view) {
    this.view = view;
  }

  /**
   * Shows the parts for the view: the block model in line of sight (the props turned and blurred by prop-view.js), the
   * camera pass in FPV (the game hides the own drone there). Without the block model the blur discs stand in: always in
   * FPV, in line of sight while a prop blurs.
   */
  showParts(fpv) {
    this.model.visible = !fpv;
    if (this.hasModel) {
      this.discs.visible = false;
      return;
    }
    let blur = false;
    for (let slot = 0; slot < SLOTS; slot++) blur = blur || this.props.blur(slot);
    this.discs.visible = fpv || blur;
  }

  /**
   * Draws a frame.
   * @param {{x, y, z}} com centre of mass (world)
   * @param {{x, y, z, w}} q sim body orientation
   * @param {number[]} rpmFraction four 0..1 rotor speeds (|rpm| / maximum rpm, flight-model motor order)
   * @param {number} dt seconds since the last frame
   * @param {{x, y, z}} home the line-of-sight pilot position
   * @param {boolean} [armed] the drone is armed (props spin up and blur only while armed); default: any rotor turns
   */
  render(com, q, rpmFraction, dt, home, armed = rpmFraction.some((r) => r > 0)) {
    // Render orientation = sim orientation ⊗ rotation of π about y (x 0, y 1, z 0, w 0) = (−qz, qw, qx, −qy).
    this.drone.quaternion.set(-q.z, q.w, q.x, -q.y);
    this.drone.position.set(com.x, com.y, com.z);
    this.drone.updateMatrix();
    this.drone.updateMatrixWorld(true);
    this.props.update(dt, rpmFraction, armed);
    const spin = rpmFraction.reduce((a, b) => a + b, 0) / 4;
    this.discMaterial.uniforms.strength.value = Math.min(1, 0.25 + spin * 1.5);

    let camera;
    if (this.view === 'fpv') {
      camera = this.fpvCamera;
      const p = this.airframe;
      const lens = new Vector3(p.lensRight, p.lensUp, -p.lensForward).applyQuaternion(this.drone.quaternion);
      camera.quaternion.copy(this.drone.quaternion);
      camera.rotateX(this.uptiltDeg * DEG);
      // FpvEyeGuard: never look out of the inside of a block.
      const eye = { x: com.x + lens.x, y: com.y + lens.y, z: com.z + lens.z };
      const f = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const u = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      const l = new Vector3(-1, 0, 0).applyQuaternion(camera.quaternion);
      const near = this.eyeGuard.apply(eye, com, f, u, l, camera.fov, camera.aspect);
      camera.position.set(eye.x, eye.y, eye.z);
      if (Math.abs(camera.near - near) > 1e-6) {
        camera.near = near;
        camera.updateProjectionMatrix();
      }
      this.showParts(true);
      this.props.poseFpv(camera, this.drone.quaternion);
    } else {
      camera = this.losCamera;
      this.showParts(false);
      this.props.poseLineOfSight();
      camera.position.set(home.x, home.y + 1.62, home.z);
      camera.lookAt(com.x, com.y, com.z);
      const d = Math.hypot(com.x - home.x, com.y - home.y - 1.62, com.z - home.z);
      camera.fov = Math.max(12, Math.min(70, 2 * Math.atan(3.5 / Math.max(d, 0.1)) / DEG));
      camera.updateProjectionMatrix();
    }
    this.renderer.render(this.scene, camera);
  }

  /**
   * Draws the last frame again and reads the canvas (tests): { width, height, pixels (RGBA, bottom row first) }.
   */
  readPixels() {
    const camera = this.view === 'fpv' ? this.fpvCamera : this.losCamera;
    this.renderer.render(this.scene, camera);
    const gl = this.renderer.getContext();
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return { width, height, pixels };
  }

  dispose() {
    window.removeEventListener('resize', this.onResize);
    this.props.dispose();
    this.renderer.dispose();
  }
}
