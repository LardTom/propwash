// The flying field: loads the map (a glTF binary exported from a Minecraft schematic, 1 unit = 1 m, Y up) and builds
// the voxel grid the flight model collides with, like the mod's rescue flight does with blocks (rescue.VoxelFlight).
//
// The map's faces are all axis-aligned and sit on a half-metre grid (full blocks plus half-block details), so the grid
// has 0.5 m cells. Every face marks the cell right behind it as solid (a solid shell; the inside of thick walls stays
// empty, which the drone never reaches because it is stopped at the shell).

export const CELL = 0.5;

/** Parses a .glb into { primitives: [{ positions, normals, indices, color, name }] } (positions in metres, world space). */
export function parseGlb(buffer) {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('map: not a glTF binary');
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < buffer.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, length)));
    else if (type === 0x004e4942) bin = buffer.slice(start, start + length);
    offset = start + length;
  }
  if (!json || !bin) throw new Error('map: missing glTF chunks');
  const COMPONENTS = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  const SIZES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const accessor = (index) => {
    const a = json.accessors[index];
    const v = json.bufferViews[a.bufferView];
    const Type = COMPONENTS[a.componentType];
    const n = SIZES[a.type];
    const byteOffset = (v.byteOffset || 0) + (a.byteOffset || 0);
    const stride = v.byteStride || 0;
    if (stride && stride !== n * Type.BYTES_PER_ELEMENT) {
      const out = new Type(a.count * n);
      const src = new DataView(bin);
      for (let i = 0; i < a.count; i++) {
        for (let k = 0; k < n; k++) {
          const at = byteOffset + i * stride + k * Type.BYTES_PER_ELEMENT;
          out[i * n + k] = Type === Float32Array ? src.getFloat32(at, true) : Type === Uint32Array ? src.getUint32(at, true)
            : Type === Uint16Array ? src.getUint16(at, true) : src.getUint8(at);
        }
      }
      return out;
    }
    return new Type(bin.slice(byteOffset, byteOffset + a.count * n * Type.BYTES_PER_ELEMENT));
  };

  // Node transforms (translation, rotation, scale) applied to the vertices.
  const primitives = [];
  const visit = (nodeIndex, parent) => {
    const node = json.nodes[nodeIndex];
    const m = multiply(parent, nodeMatrix(node));
    if (node.mesh != null) {
      for (const p of json.meshes[node.mesh].primitives) {
        if (p.mode != null && p.mode !== 4) continue;
        const raw = accessor(p.attributes.POSITION);
        const positions = new Float32Array(raw.length);
        for (let i = 0; i < raw.length; i += 3) {
          const [x, y, z] = transform(m, raw[i], raw[i + 1], raw[i + 2], 1);
          positions[i] = x;
          positions[i + 1] = y;
          positions[i + 2] = z;
        }
        let normals = null;
        if (p.attributes.NORMAL != null) {
          const rawN = accessor(p.attributes.NORMAL);
          normals = new Float32Array(rawN.length);
          for (let i = 0; i < rawN.length; i += 3) {
            const [x, y, z] = transform(m, rawN[i], rawN[i + 1], rawN[i + 2], 0);
            const l = Math.hypot(x, y, z) || 1;
            normals[i] = x / l;
            normals[i + 1] = y / l;
            normals[i + 2] = z / l;
          }
        }
        const indices = p.indices != null ? Uint32Array.from(accessor(p.indices))
          : Uint32Array.from({ length: positions.length / 3 }, (_, i) => i);
        const material = p.material != null ? json.materials[p.material] : null;
        const factor = material?.pbrMetallicRoughness?.baseColorFactor || [0.8, 0.8, 0.8, 1];
        primitives.push({ positions, normals, indices, color: factor.slice(0, 3), name: material?.name || '' });
      }
    }
    for (const child of node.children || []) visit(child, m);
  };
  const scene = json.scenes[json.scene || 0];
  for (const root of scene.nodes) visit(root, IDENTITY);
  return { primitives };
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function nodeMatrix(node) {
  if (node.matrix) return node.matrix.slice();
  const [tx, ty, tz] = node.translation || [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale || [1, 1, 1];
  const xx = qx * qx; const yy = qy * qy; const zz = qz * qz;
  const xy = qx * qy; const xz = qx * qz; const yz = qy * qz;
  const wx = qw * qx; const wy = qw * qy; const wz = qw * qz;
  // Column-major like glTF.
  return [
    (1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0,
    2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0,
    2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

function multiply(a, b) {
  const out = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

function transform(m, x, y, z, w) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12] * w,
    m[1] * x + m[5] * y + m[9] * z + m[13] * w,
    m[2] * x + m[6] * y + m[10] * z + m[14] * w,
  ];
}

/**
 * Solid cells of the map on a CELL grid aligned to the map's own block grid.
 * World position of cell (i, j, k): origin + (i, j, k) * CELL … + CELL.
 */
export class VoxelWorld {
  constructor(primitives, cell = CELL) {
    this.cell = cell;
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];
    for (const p of primitives) {
      for (let i = 0; i < p.positions.length; i += 3) {
        for (let a = 0; a < 3; a++) {
          min[a] = Math.min(min[a], p.positions[i + a]);
          max[a] = Math.max(max[a], p.positions[i + a]);
        }
      }
    }
    // The grid phase is the map's block grid: every vertex sits on a multiple of the cell from the minimum corner.
    const pad = 2;
    this.origin = min.map((v) => v - pad * cell);
    this.size = min.map((v, a) => Math.ceil((max[a] - v) / cell) + 2 * pad);
    this.min = min;
    this.max = max;
    const [nx, ny, nz] = this.size;
    this.cells = new Uint8Array(nx * ny * nz);
    for (const p of primitives) this.addShell(p);
    this.floorY = min[1];
    this.baseTop = this.commonTop();
    this.baseCell = Math.round((this.baseTop - this.origin[1]) / cell);
  }

  /** Most common height of the highest solid surface over the map's columns (the floor the map stands on). */
  commonTop() {
    const [nx, ny, nz] = this.size;
    const counts = new Map();
    for (let i = 0; i < nx; i++) {
      for (let k = 0; k < nz; k++) {
        for (let j = ny - 1; j >= 0; j--) {
          if (this.cells[this.index(i, j, k)]) {
            counts.set(j, (counts.get(j) || 0) + 1);
            break;
          }
        }
      }
    }
    let best = 0;
    let top = 0;
    for (const [j, n] of counts) {
      if (n > best) {
        best = n;
        top = j;
      }
    }
    return this.origin[1] + (top + 1) * this.cell;
  }

  index(i, j, k) {
    return (j * this.size[2] + k) * this.size[0] + i;
  }

  /** Marks the cells behind each face (the solid side of the surface). */
  addShell(p) {
    const pos = p.positions;
    const idx = p.indices;
    const c = this.cell;
    const o = this.origin;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3;
      const b = idx[t + 1] * 3;
      const d = idx[t + 2] * 3;
      const ax = pos[a]; const ay = pos[a + 1]; const az = pos[a + 2];
      const bx = pos[b]; const by = pos[b + 1]; const bz = pos[b + 2];
      const dx = pos[d]; const dy = pos[d + 1]; const dz = pos[d + 2];
      // Face normal from the winding (counter-clockwise front faces, like glTF).
      const ux = bx - ax; const uy = by - ay; const uz = bz - az;
      const vx = dx - ax; const vy = dy - ay; const vz = dz - az;
      const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      const axis = Math.abs(n[0]) > Math.abs(n[1]) ? (Math.abs(n[0]) > Math.abs(n[2]) ? 0 : 2) : (Math.abs(n[1]) > Math.abs(n[2]) ? 1 : 2);
      if (Math.abs(n[axis]) < 1e-9) continue;
      const sign = Math.sign(n[axis]);
      const a1 = (axis + 1) % 3;
      const a2 = (axis + 2) % 3;
      const P = [[ax, ay, az], [bx, by, bz], [dx, dy, dz]];
      const plane = (P[0][axis] + P[1][axis] + P[2][axis]) / 3;
      // Cell layer behind the face: the face plane is a cell boundary.
      const layer = Math.round((plane - o[axis]) / c) + (sign > 0 ? -1 : 0);
      const lo1 = Math.min(P[0][a1], P[1][a1], P[2][a1]);
      const hi1 = Math.max(P[0][a1], P[1][a1], P[2][a1]);
      const lo2 = Math.min(P[0][a2], P[1][a2], P[2][a2]);
      const hi2 = Math.max(P[0][a2], P[1][a2], P[2][a2]);
      const i0 = Math.floor((lo1 - o[a1]) / c + 1e-6);
      const i1 = Math.ceil((hi1 - o[a1]) / c - 1e-6) - 1;
      const j0 = Math.floor((lo2 - o[a2]) / c + 1e-6);
      const j1 = Math.ceil((hi2 - o[a2]) / c - 1e-6) - 1;
      const cell = [0, 0, 0];
      cell[axis] = layer;
      for (let i = i0; i <= i1; i++) {
        const s = o[a1] + (i + 0.5) * c;
        for (let j = j0; j <= j1; j++) {
          const r = o[a2] + (j + 0.5) * c;
          if (!inTriangle(s, r, P, a1, a2)) continue;
          cell[a1] = i;
          cell[a2] = j;
          this.set(cell[0], cell[1], cell[2]);
        }
      }
    }
  }

  set(i, j, k) {
    const [nx, ny, nz] = this.size;
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return;
    this.cells[this.index(i, j, k)] = 1;
  }

  /** Solid cell? Around the map the ground continues at the map's floor level; below the grid everything is solid. */
  solid(i, j, k) {
    const [nx, ny, nz] = this.size;
    if (j < 0) return true;
    if (i < 0 || k < 0 || i >= nx || k >= nz) return j < this.baseCell;
    if (j >= ny) return false;
    if (this.cells[this.index(i, j, k)] === 1) return true;
    // The padding ring around the map's own footprint is open ground too.
    const x = this.origin[0] + (i + 0.5) * this.cell;
    const z = this.origin[2] + (k + 0.5) * this.cell;
    if (x < this.min[0] || x > this.max[0] || z < this.min[2] || z > this.max[2]) return j < this.baseCell;
    return false;
  }

  cellOf(axis, v) {
    return Math.floor((v - this.origin[axis]) / this.cell);
  }

  /** Distance from (x, y, z) straight down to the first solid cell top, Infinity beyond `range`. */
  groundDistance(x, y, z, range) {
    const i = this.cellOf(0, x);
    const k = this.cellOf(2, z);
    const top = this.cellOf(1, y);
    const end = this.cellOf(1, y - range);
    for (let j = top; j >= end; j--) {
      if (this.solid(i, j, k)) {
        const d = y - (this.origin[1] + (j + 1) * this.cell);
        return d <= range ? Math.max(0.0, d) : Infinity;
      }
    }
    return Infinity;
  }

  /** Height of the highest solid surface below (x, z) at or under y, -Infinity if none. */
  surfaceBelow(x, y, z) {
    const d = this.groundDistance(x, y, z, 1000);
    return Number.isFinite(d) ? y - d : -Infinity;
  }

  /** Number of solid cells (for checks). */
  count() {
    let n = 0;
    for (const v of this.cells) n += v;
    return n;
  }
}

function inTriangle(s, r, P, a1, a2) {
  const x0 = P[0][a1]; const y0 = P[0][a2];
  const x1 = P[1][a1]; const y1 = P[1][a2];
  const x2 = P[2][a1]; const y2 = P[2][a2];
  const d1 = (s - x1) * (y0 - y1) - (x0 - x1) * (r - y1);
  const d2 = (s - x2) * (y1 - y2) - (x1 - x2) * (r - y2);
  const d3 = (s - x0) * (y2 - y0) - (x2 - x0) * (r - y0);
  const neg = d1 < -1e-9 || d2 < -1e-9 || d3 < -1e-9;
  const pos = d1 > 1e-9 || d2 > 1e-9 || d3 > 1e-9;
  return !(neg && pos);
}
