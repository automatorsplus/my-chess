/*
 * 3D pieces: Staunton-style pieces modelled with three.js (lathe-turned bodies,
 * a carved knight head), lit with a soft studio environment, and rendered once
 * into images that the board uses in place of the font glyphs. Rendering from
 * the same angle as the tilted board makes them stand up convincingly, and all
 * of the board's existing click, drag and animation code keeps working.
 *
 * This is an ES module, so it only runs when MyChess is served over http (the
 * launcher). Opened as a plain file, the board keeps its glyph pieces.
 */
import * as THREE from '../vendor/three/three.module.js';
import { RoomEnvironment } from '../vendor/three/RoomEnvironment.js';

const SIZE = 320; // sprite size in pixels
const ELEVATION = 30; // degrees above the board, matching the 3D view's tilt

// Material settings per piece set. `tex` names a style in js/textures.js whose piece textures are used.
const PIECE_STYLES = {
  wood: { tex: 'wood', white: { roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.35 }, black: { roughness: 0.62, clearcoat: 0.18, clearcoatRoughness: 0.5, specularIntensity: 0.5 } },
  walnut: { tex: 'walnut', white: { roughness: 0.48, clearcoat: 0.4, clearcoatRoughness: 0.3 }, black: { roughness: 0.6, clearcoat: 0.2, clearcoatRoughness: 0.45, specularIntensity: 0.5 } },
  ebony: { tex: 'ebony', white: { roughness: 0.3, clearcoat: 0.85, clearcoatRoughness: 0.12 }, black: { roughness: 0.26, clearcoat: 0.95, clearcoatRoughness: 0.1 } },
  marble: { tex: 'marble', white: { roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.06 }, black: { roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.05 } },
  metal: { tex: null, white: { color: '#dfe2e7', metalness: 1, roughness: 0.2 }, black: { color: '#3b3e45', metalness: 1, roughness: 0.28 } },
  tournament: { tex: null, white: { color: '#f3efe4', roughness: 0.36, clearcoat: 0.35 }, black: { color: '#232325', roughness: 0.32, clearcoat: 0.45 } },
};

let renderer = null, scene = null, camera = null;
const loader = new THREE.TextureLoader();
const geometryCache = new Map();

function setup() {
  const canvas = document.createElement('canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(-2.5, 4, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.9);
  rim.position.set(2.5, 2.5, -3);
  scene.add(rim);
  scene.add(new THREE.AmbientLight(0xffffff, 0.12));

  camera = new THREE.PerspectiveCamera(16, 1, 0.1, 50);
  const d = 4.15, a = THREE.MathUtils.degToRad(ELEVATION);
  camera.position.set(0, 0.5 + d * Math.sin(a), d * Math.cos(a));
  camera.lookAt(0, 0.47, 0);
}

// ------------------------------------------------------------------ geometry

const v = (pts) => pts.map(([r, y]) => new THREE.Vector2(r, y));
function arc(cx, cy, r, fromDeg, toDeg, steps) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = THREE.MathUtils.degToRad(fromDeg + (toDeg - fromDeg) * (i / steps));
    out.push([Math.max(0, cx + r * Math.cos(t)), cy + r * Math.sin(t)]);
  }
  return out;
}
const BASE = [[0, 0], [0.25, 0], [0.262, 0.012], [0.262, 0.045], [0.245, 0.06], [0.225, 0.07], [0.228, 0.085], [0.215, 0.1], [0.19, 0.115]];

const PROFILES = {
  p: [...BASE, [0.16, 0.13], [0.125, 0.155], [0.1, 0.19], [0.088, 0.24], [0.085, 0.27], [0.13, 0.285], [0.135, 0.3], [0.12, 0.312], [0.075, 0.322], ...arc(0, 0.4, 0.105, -45, 90, 16)],
  r: [...BASE, [0.17, 0.13], [0.15, 0.155], [0.14, 0.2], [0.135, 0.3], [0.14, 0.4], [0.15, 0.43], [0.175, 0.46], [0.19, 0.475], [0.19, 0.55], [0.155, 0.55], [0.155, 0.525], [0, 0.525]],
  b: [...BASE, [0.165, 0.13], [0.13, 0.16], [0.1, 0.21], [0.085, 0.3], [0.08, 0.38], [0.13, 0.405], [0.135, 0.42], [0.12, 0.432], [0.085, 0.44],
    [0.1, 0.47], [0.125, 0.52], [0.13, 0.56], [0.122, 0.6], [0.1, 0.645], [0.07, 0.68], [0.035, 0.705], [0.018, 0.712], ...arc(0, 0.745, 0.035, -60, 90, 10)],
  q: [...BASE, [0.17, 0.13], [0.135, 0.165], [0.105, 0.22], [0.09, 0.32], [0.085, 0.42], [0.095, 0.5], [0.15, 0.53], [0.155, 0.55], [0.135, 0.562], [0.1, 0.57],
    [0.105, 0.62], [0.13, 0.68], [0.155, 0.73], [0.16, 0.75], [0.14, 0.755], [0.09, 0.76], [0.07, 0.78], [0.05, 0.8], ...arc(0, 0.845, 0.045, -70, 90, 12)],
  k: [...BASE, [0.175, 0.13], [0.14, 0.165], [0.11, 0.22], [0.095, 0.34], [0.088, 0.46], [0.098, 0.55], [0.16, 0.585], [0.165, 0.605], [0.14, 0.615], [0.105, 0.625],
    [0.11, 0.68], [0.135, 0.75], [0.15, 0.8], [0.15, 0.815], [0.12, 0.82], [0.09, 0.835], [0.06, 0.85], [0, 0.86]],
  n: [...BASE, [0.17, 0.13], [0.16, 0.15], [0, 0.15]],
};

// The knight is sculpted rather than turned: a signed distance function (negative
// inside) built from smoothly blended shapes, with the mouth, nostrils and eye
// sockets carved out, turned into a mesh with surface nets. The head faces +x.
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);

// A cone with rounded ends from a (radius r1) to b (radius r2) (Inigo Quilez's sdRoundCone).
function roundCone(px, py, pz, ax, ay, az, bx, by, bz, r1, r2) {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const pax = px - ax, pay = py - ay, paz = pz - az;
  const y = pax * bax + pay * bay + paz * baz, z = y - l2;
  const qx = pax * l2 - bax * y, qy = pay * l2 - bay * y, qz = paz * l2 - baz * y;
  const x2 = qx * qx + qy * qy + qz * qz, y2 = y * y * l2, z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}
function ellipsoid(px, py, pz, cx, cy, cz, rx, ry, rz) {
  const x = (px - cx) / rx, y = (py - cy) / ry, z = (pz - cz) / rz;
  const k0 = Math.sqrt(x * x + y * y + z * z), k1 = Math.sqrt((x / rx) ** 2 + (y / ry) ** 2 + (z / rz) ** 2);
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : k0 * (k0 - 1) / k1; // at the very centre the formula is 0/0
}

// The crest of the neck, from the poll down to the base: the mane runs along it.
const CREST = [[-0.035, 0.8], [-0.09, 0.775], [-0.14, 0.725], [-0.18, 0.645], [-0.2, 0.55], [-0.205, 0.45], [-0.2, 0.35], [-0.19, 0.25]];

function knightSdf(x, y, z) {
  const W = 0.8; // the head and neck are narrower side to side than front to back
  const zs = z / W;
  // Neck: rises from the collar and leans back into the arched crest.
  let d = roundCone(x, y, zs, -0.03, 0.12, 0, -0.07, 0.5, 0, 0.165, 0.125);
  d = smin(d, roundCone(x, y, zs, -0.07, 0.5, 0, -0.04, 0.68, 0, 0.125, 0.1), 0.05);
  // Head: the skull behind the eyes, the long face tapering to the muzzle, and the cheek.
  d = smin(d, ellipsoid(x, y, zs, -0.005, 0.69, 0, 0.11, 0.1, 0.1), 0.05);
  d = smin(d, roundCone(x, y, zs, 0.04, 0.655, 0, 0.305, 0.478, 0, 0.098, 0.074), 0.06);
  d = smin(d, ellipsoid(x, y, zs, 0.06, 0.56, 0, 0.13, 0.11, 0.115), 0.06);
  // Chest: a little fullness at the front of the neck, above the collar.
  d = smin(d, ellipsoid(x, y, zs, 0.06, 0.24, 0, 0.1, 0.12, 0.13), 0.08);
  // Mouth: a slot cut into the end of the muzzle.
  const mx = x - 0.36, my = y - 0.44 - 0.12 * (x - 0.36);
  const slot = Math.max(Math.abs(my) - 0.008, -mx - 0.075);
  d = smax(d, -slot, 0.012);
  // Nostrils and eye sockets.
  for (const sz of [1, -1]) {
    d = smax(d, -(Math.hypot(x - 0.34, y - 0.512, z - sz * 0.056) - 0.018), 0.01);
    d = smax(d, -(Math.hypot(x - 0.13, y - 0.632, z - sz * 0.1) - 0.03), 0.015);
  }
  // Ears: pricked up, a little apart.
  for (const sz of [1, -1]) {
    d = smin(d, roundCone(x, y, z, -0.01, 0.76, sz * 0.04, 0.012, 0.875, sz * 0.055, 0.036, 0.01), 0.025);
  }
  // Mane: locks along the crest, a ridge whose height rises and falls.
  if (x < 0.02 && y > 0.2) {
    let best = 1, t = 0, acc = 0;
    for (let i = 0; i < CREST.length - 1; i++) {
      const [ax, ay] = CREST[i], [bx, by] = CREST[i + 1];
      const ex = bx - ax, ey = by - ay, len = Math.hypot(ex, ey);
      const h = Math.min(1, Math.max(0, ((x - ax) * ex + (y - ay) * ey) / (len * len)));
      const dd = Math.hypot(x - ax - ex * h, y - ay - ey * h);
      if (dd < best) { best = dd; t = acc + h * len; }
      acc += len;
    }
    // Each lock swells and then breaks off sharply, like carved scales, and they fade towards the base.
    const phase = (t / 0.062) % 1;
    const lock = Math.sin(phase * Math.PI * 0.5) ** 2;
    const fade = 1 - Math.min(1, Math.max(0, (t - 0.45) / 0.25));
    const r = 0.03 + 0.017 * lock * fade;
    d = smin(d, Math.hypot(best, z / 0.75) - r, 0.01);
  }
  return Math.max(d, 0.13 - y); // cut flat where it sits on the base
}

// Surface nets: one vertex per grid cell that the surface passes through, placed at
// the average of its edge crossings, and a quad for every grid edge that crosses it.
function surfaceNets(f, min, max, step) {
  const n = [0, 1, 2].map((a) => Math.ceil((max[a] - min[a]) / step) + 1);
  const [nx, ny, nz] = n;
  const field = new Float32Array(nx * ny * nz);
  const at = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    field[at(i, j, k)] = f(min[0] + i * step, min[1] + j * step, min[2] + k * step);
  }
  const corner = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cellIndex = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cell = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos = [];
  const val = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { val[c] = field[at(i + corner[c][0], j + corner[c][1], k + corner[c][2])]; if (val[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, count = 0;
    for (const [a, b] of edges) {
      if ((val[a] < 0) === (val[b] < 0)) continue;
      const t = val[a] / (val[a] - val[b]);
      sx += corner[a][0] + t * (corner[b][0] - corner[a][0]);
      sy += corner[a][1] + t * (corner[b][1] - corner[a][1]);
      sz += corner[a][2] + t * (corner[b][2] - corner[a][2]);
      count++;
    }
    cellIndex[cell(i, j, k)] = pos.length / 3;
    pos.push(min[0] + (i + sx / count) * step, min[1] + (j + sy / count) * step, min[2] + (k + sz / count) * step);
  }
  const index = [];
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) index.push(a, c, b, a, d, c); else index.push(a, b, c, a, c, d); };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const inside = field[at(i, j, k)] < 0;
    if (inside !== (field[at(i + 1, j, k)] < 0)) quad(cellIndex[cell(i, j - 1, k - 1)], cellIndex[cell(i, j, k - 1)], cellIndex[cell(i, j, k)], cellIndex[cell(i, j - 1, k)], !inside);
    if (inside !== (field[at(i, j + 1, k)] < 0)) quad(cellIndex[cell(i - 1, j, k - 1)], cellIndex[cell(i - 1, j, k)], cellIndex[cell(i, j, k)], cellIndex[cell(i, j, k - 1)], !inside);
    if (inside !== (field[at(i, j, k + 1)] < 0)) quad(cellIndex[cell(i - 1, j - 1, k)], cellIndex[cell(i, j - 1, k)], cellIndex[cell(i, j, k)], cellIndex[cell(i - 1, j, k)], !inside);
  }
  // Normals from the gradient of the distance function: smooth, with no seams.
  const nor = new Float32Array(pos.length), h = step * 0.5;
  for (let v = 0; v < pos.length; v += 3) {
    const [x, y, z] = [pos[v], pos[v + 1], pos[v + 2]];
    const gx = f(x + h, y, z) - f(x - h, y, z), gy = f(x, y + h, z) - f(x, y - h, z), gz = f(x, y, z + h) - f(x, y, z - h);
    const l = Math.hypot(gx, gy, gz) || 1;
    nor[v] = gx / l; nor[v + 1] = gy / l; nor[v + 2] = gz / l;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  // Wood grain runs up the piece, as on the turned pieces: wrap the texture around the y axis.
  const uv = new Float32Array((pos.length / 3) * 2);
  for (let v = 0, u = 0; v < pos.length; v += 3, u += 2) { uv[u] = Math.atan2(pos[v + 2], pos[v]) / (Math.PI * 2) + 0.5; uv[u + 1] = pos[v + 1]; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

const knightHead = () => surfaceNets(knightSdf, [-0.27, 0.12, -0.15], [0.4, 0.9, 0.15], 0.006);

function geometry(key, make) {
  if (!geometryCache.has(key)) geometryCache.set(key, make());
  return geometryCache.get(key);
}

function buildPiece(type, mat, dark) {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry(`lathe-${type}`, () => new THREE.LatheGeometry(v(PROFILES[type]), 72)), mat));
  if (type === 'r') {
    const merlon = geometry('merlon', () => new THREE.BoxGeometry(0.075, 0.065, 0.05));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const m = new THREE.Mesh(merlon, mat);
      m.position.set(Math.sin(a) * 0.172, 0.582, Math.cos(a) * 0.172);
      m.rotation.y = a;
      group.add(m);
    }
  } else if (type === 'b') {
    const slit = new THREE.Mesh(geometry('slit', () => new THREE.BoxGeometry(0.014, 0.17, 0.29)), dark);
    slit.position.set(0.02, 0.6, 0);
    slit.rotation.z = -0.65;
    group.add(slit);
  } else if (type === 'q') {
    const ball = geometry('crown-ball', () => new THREE.SphereGeometry(0.028, 20, 14));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const m = new THREE.Mesh(ball, mat);
      m.position.set(Math.sin(a) * 0.148, 0.77, Math.cos(a) * 0.148);
      group.add(m);
    }
  } else if (type === 'k') {
    const upright = new THREE.Mesh(geometry('cross-v', () => new THREE.BoxGeometry(0.045, 0.16, 0.045)), mat);
    upright.position.y = 0.94;
    const bar = new THREE.Mesh(geometry('cross-h', () => new THREE.BoxGeometry(0.13, 0.045, 0.045)), mat);
    bar.position.y = 0.955;
    group.add(upright, bar);
  } else if (type === 'n') {
    // The head is modelled a little large; scaled down on its base, it stands just below the bishop.
    const head = new THREE.Group();
    head.scale.setScalar(0.86);
    head.position.y = 0.13 * (1 - 0.86);
    head.add(new THREE.Mesh(geometry('knight-head', knightHead), mat));
    // Dark eyes set into the sockets.
    const eye = geometry('eye', () => new THREE.SphereGeometry(0.017, 16, 12));
    for (const side of [1, -1]) {
      const e = new THREE.Mesh(eye, dark);
      e.position.set(0.133, 0.632, side * 0.086);
      e.scale.set(1.25, 0.85, 0.7);
      head.add(e);
    }
    group.add(head);
    group.rotation.y = Math.PI + 0.35; // facing left, turned a little towards you
  }
  return group;
}

// ------------------------------------------------------------------ rendering

async function materials(styleName) {
  const st = PIECE_STYLES[styleName] || PIECE_STYLES.wood;
  const tex = st.tex && window.MyChessTextures ? window.MyChessTextures.get(st.tex) : null;
  const out = {};
  for (const side of ['white', 'black']) {
    const p = st[side];
    let map = null;
    if (tex) {
      map = await loader.loadAsync(tex[side]);
      map.colorSpace = THREE.SRGBColorSpace;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(2, 1);
    }
    out[side] = new THREE.MeshPhysicalMaterial({
      map,
      color: new THREE.Color(p.color || '#ffffff'),
      roughness: p.roughness ?? 0.4,
      metalness: p.metalness ?? 0,
      clearcoat: p.clearcoat ?? 0,
      clearcoatRoughness: p.clearcoatRoughness ?? 0.2,
      specularIntensity: p.specularIntensity ?? 1,
    });
  }
  return out;
}

// Resolves to { K, Q, R, B, N, P, k, q, r, b, n, p } -> PNG data URLs.
async function renderSet(styleName) {
  if (!renderer) setup();
  const mats = await materials(styleName);
  const dark = new THREE.MeshStandardMaterial({ color: 0x120a04, roughness: 0.85 });
  const out = {};
  for (const type of 'kqrbnp') {
    for (const side of ['white', 'black']) {
      const group = buildPiece(type, mats[side], dark);
      scene.add(group);
      renderer.render(scene, camera);
      out[side === 'white' ? type.toUpperCase() : type] = renderer.domElement.toDataURL('image/png');
      scene.remove(group);
    }
  }
  for (const m of Object.values(mats)) { if (m.map) m.map.dispose(); m.dispose(); }
  dark.dispose();
  return out;
}

// For tuning the models: one piece as a PNG data URL, turned by `turn` radians from its usual pose.
async function preview(type, styleName = 'wood', white = true, turn = 0) {
  if (!renderer) setup();
  const mats = await materials(styleName);
  const dark = new THREE.MeshStandardMaterial({ color: 0x120a04, roughness: 0.85 });
  const group = buildPiece(type, mats[white ? 'white' : 'black'], dark);
  group.rotation.y += turn;
  scene.add(group);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(group);
  for (const m of Object.values(mats)) { if (m.map) m.map.dispose(); m.dispose(); }
  dark.dispose();
  return url;
}

window.MyChessPieces3D = { renderSet, preview, styles: Object.keys(PIECE_STYLES) };
window.dispatchEvent(new Event('mychess:pieces3d'));
