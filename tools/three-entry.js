// Entry of the trimmed three.js bundle in assets/vendor/three/three.min.js (only what the drone viewer uses).
// Rebuild (three.js and esbuild installed in a scratch folder, see README):
//   esbuild tools/three-entry.js --bundle --format=esm --minify --target=es2020 --legal-comments=none \
//     --banner:js="/* three.js r186 (MIT), trimmed bundle, see LICENSE */" --outfile=assets/vendor/three/three.min.js
export {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, BufferGeometry, BufferAttribute, ShaderMaterial, Texture,
  NearestFilter, LinearFilter, Vector3, Box3, Sphere, CanvasTexture, PlaneGeometry, MeshBasicMaterial, NoColorSpace,
  LinearSRGBColorSpace, SRGBColorSpace, MOUSE, TOUCH,
} from 'three';
export { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
