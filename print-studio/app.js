import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';

const $ = (id) => document.getElementById(id);

// ---------- 3D scene ----------
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f1115);
const camera = new THREE.PerspectiveCamera(40, 1, 1, 5000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.2));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(-120, 160, 200);
scene.add(key);
const rim = new THREE.DirectionalLight(0xffc28a, 0.8);
rim.position.set(150, -80, 120);
scene.add(rim);

// build plate
const plate = new THREE.Mesh(
  new THREE.PlaneGeometry(256, 256),
  new THREE.MeshStandardMaterial({ color: 0x1d2028, roughness: 0.9 })
);
plate.position.z = -0.05;
scene.add(plate);
const grid = new THREE.GridHelper(256, 16, 0x3a404d, 0x2a2f3a);
grid.rotation.x = Math.PI / 2;
scene.add(grid);
camera.up.set(0, 0, 1);

const matSolid = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.55, metalness: 0 });
const matLit = new THREE.MeshBasicMaterial({ vertexColors: true });
const matKeyBase = new THREE.MeshStandardMaterial({ color: 0xff8a3d, roughness: 0.5 });
const matKeyText = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.45 });

let model = new THREE.Group();
scene.add(model);
let mode = 'litho';
let backlit = false;
let fitDone = { litho: false, key: false };

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

function fitCamera(force) {
  if (!force && fitDone[mode]) return;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const r = Math.max(size.x, size.y) * 0.95 + 20;
  controls.target.copy(center);
  camera.position.set(center.x - r * 0.15, center.y - r * 1.05, center.z + r * 1.05);
  controls.update();
  fitDone[mode] = true;
}

function setModel(meshes) {
  scene.remove(model);
  model.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  model = new THREE.Group();
  meshes.forEach((m) => model.add(m));
  scene.add(model);
}

// ---------- Lithophane ----------
let srcImg = makeSampleImage();
const cropCanvas = $('crop');
const cropCtx = cropCanvas.getContext('2d');

function makeSampleImage() {
  const c = document.createElement('canvas');
  c.width = 800; c.height = 600;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 600);
  sky.addColorStop(0, '#0d1b3a'); sky.addColorStop(0.55, '#f0a060'); sky.addColorStop(1, '#ffe3b0');
  g.fillStyle = sky; g.fillRect(0, 0, 800, 600);
  g.fillStyle = '#fff6d8'; g.beginPath(); g.arc(560, 300, 70, 0, Math.PI * 2); g.fill();
  const layers = [['#3a3046', 330, 0.9], ['#241d30', 400, 1.3], ['#120e1a', 470, 1.8]];
  layers.forEach(([col, base, amp], k) => {
    g.fillStyle = col; g.beginPath(); g.moveTo(0, 600);
    for (let x = 0; x <= 800; x += 10) {
      const y = base - amp * (40 * Math.sin(x / 90 + k) + 25 * Math.sin(x / 37 + k * 2) + 15 * Math.sin(x / 13 + k));
      g.lineTo(x, y);
    }
    g.lineTo(800, 600); g.closePath(); g.fill();
  });
  g.fillStyle = '#ffffff'; g.font = 'bold 54px system-ui, sans-serif'; g.textAlign = 'center';
  g.fillText('YOUR PHOTO HERE', 400, 110);
  return c;
}

function cropRect() {
  const r = parseFloat($('ratio').value);
  const zoom = parseFloat($('zoom').value);
  const iw = srcImg.width, ih = srcImg.height;
  let cw, ch;
  if (iw / ih > r) { ch = ih; cw = ih * r; } else { cw = iw; ch = iw / r; }
  cw /= zoom; ch /= zoom;
  const maxX = (iw - cw) / 2, maxY = (ih - ch) / 2;
  const cx = iw / 2 + parseFloat($('offX').value) * maxX;
  const cy = ih / 2 + parseFloat($('offY').value) * maxY;
  return { x: cx - cw / 2, y: cy - ch / 2, w: cw, h: ch, r };
}

function drawCropPreview(rect) {
  cropCanvas.height = Math.round(cropCanvas.width / rect.r);
  cropCtx.drawImage(srcImg, rect.x, rect.y, rect.w, rect.h, 0, 0, cropCanvas.width, cropCanvas.height);
}

function buildLithophane() {
  const rect = cropRect();
  drawCropPreview(rect);
  const W = parseFloat($('width').value);
  const H = W / rect.r;
  const step = parseFloat($('res').value);
  const minT = parseFloat($('minT').value);
  const maxT = parseFloat($('maxT').value);
  const nx = Math.round(W / step) + 1;
  const ny = Math.round(H / step) + 1;
  const sx = W / (nx - 1), sy = H / (ny - 1);

  const s = document.createElement('canvas');
  s.width = nx; s.height = ny;
  const sc = s.getContext('2d', { willReadFrequently: true });
  sc.imageSmoothingQuality = 'high';
  sc.drawImage(srcImg, rect.x, rect.y, rect.w, rect.h, 0, 0, nx, ny);
  const px = sc.getImageData(0, 0, nx, ny).data;

  const fb = $('frame').checked ? Math.max(1, Math.round(3 / step)) : 0;
  const T = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const lum = (0.299 * px[k * 4] + 0.587 * px[k * 4 + 1] + 0.114 * px[k * 4 + 2]) / 255;
      const inFrame = i < fb || j < fb || i >= nx - fb || j >= ny - fb;
      T[k] = inFrame ? maxT : minT + (1 - lum) * (maxT - minT);
    }
  }

  // closed solid: top surface, flat bottom, four side walls
  const N = nx * ny;
  const pos = new Float32Array(N * 2 * 3);
  const col = new Float32Array(N * 2 * 3);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const x = i * sx - W / 2, y = (ny - 1 - j) * sy - H / 2;
      pos.set([x, y, T[k]], k * 3);
      pos.set([x, y, 0], (N + k) * 3);
      // light through the print: thin = bright
      const b = Math.pow(1 - (T[k] - minT) / (maxT - minT + 1e-6), 1.6);
      const c = [0.08 + 0.92 * b, 0.05 + 0.80 * b, 0.02 + 0.58 * b];
      col.set(c, k * 3); col.set(c, (N + k) * 3);
    }
  }
  const idx = [];
  const t = (i, j) => j * nx + i, bt = (i, j) => N + j * nx + i;
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      // y decreases with j, so these windings face +z on top and -z on the bottom
      idx.push(t(i, j), t(i, j + 1), t(i + 1, j), t(i + 1, j), t(i, j + 1), t(i + 1, j + 1));
      idx.push(bt(i, j), bt(i + 1, j), bt(i, j + 1), bt(i + 1, j), bt(i + 1, j + 1), bt(i, j + 1));
    }
  }
  for (let i = 0; i < nx - 1; i++) {
    // top edge (j = 0, +y side) and bottom edge (j = ny-1, -y side)
    idx.push(t(i, 0), t(i + 1, 0), bt(i, 0), t(i + 1, 0), bt(i + 1, 0), bt(i, 0));
    const J = ny - 1;
    idx.push(t(i, J), bt(i, J), t(i + 1, J), t(i + 1, J), bt(i, J), bt(i + 1, J));
  }
  for (let j = 0; j < ny - 1; j++) {
    // left edge (i = 0, -x side) and right edge (i = nx-1, +x side)
    idx.push(t(0, j), bt(0, j), t(0, j + 1), t(0, j + 1), bt(0, j), bt(0, j + 1));
    const I = nx - 1;
    idx.push(t(I, j), t(I, j + 1), bt(I, j), t(I, j + 1), bt(I, j + 1), bt(I, j));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  setModel([new THREE.Mesh(geo, backlit ? matLit : matSolid)]);
  scene.background = new THREE.Color(backlit ? 0x050608 : 0x0f1115);
  $('stats').textContent = `${W.toFixed(0)} × ${H.toFixed(0)} mm · ${minT}–${maxT} mm thick · ${(idx.length / 3).toLocaleString()} triangles`;
}

// ---------- Name keychain ----------
let font = null;
new FontLoader().load('./fonts/helvetiker_bold.typeface.json', (f) => { font = f; if (mode === 'key') rebuild(); });

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}

function buildKeychain() {
  if (!font) { $('stats').textContent = 'Loading font…'; return; }
  const name = ($('name').value || ' ').toUpperCase();
  const size = parseFloat($('txtH').value);
  const baseT = parseFloat($('baseT').value);
  const raise = parseFloat($('raise').value);
  const textGeo = new TextGeometry(name, { font, size, depth: raise + 0.05, curveSegments: 6, bevelEnabled: false });
  textGeo.computeBoundingBox();
  const bb = textGeo.boundingBox;
  const tw = bb.max.x - bb.min.x, th = bb.max.y - bb.min.y;
  const pad = 4, tab = $('loop').checked ? 12 : 0;
  const w = tw + pad * 2 + tab, h = Math.max(th + pad * 2, 14);
  const shape = roundedRect(w, h, Math.min(5, h / 2));
  if (tab) {
    const hole = new THREE.Path();
    hole.absarc(-w / 2 + 6.5, 0, 2.6, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  const baseGeo = new THREE.ExtrudeGeometry(shape, { depth: baseT, bevelEnabled: false, curveSegments: 24 });
  const tx = -w / 2 + tab + pad - bb.min.x;
  textGeo.translate(tx, -bb.min.y - th / 2, baseT - 0.05);
  setModel([new THREE.Mesh(baseGeo, matKeyBase), new THREE.Mesh(textGeo, matKeyText)]);
  scene.background = new THREE.Color(0x0f1115);
  $('stats').textContent = `${w.toFixed(0)} × ${h.toFixed(0)} mm · ${(baseT + raise).toFixed(1)} mm tall · tip: pause at ${baseT.toFixed(1)} mm to swap filament color`;
}

// ---------- UI ----------
function labels() {
  $('zoomV').textContent = parseFloat($('zoom').value).toFixed(2) + '×';
  $('widthV').textContent = $('width').value + ' mm';
  $('minTV').textContent = $('minT').value;
  $('maxTV').textContent = $('maxT').value;
  $('resV').textContent = $('res').value + ' mm';
  $('txtHV').textContent = $('txtH').value + ' mm';
  $('baseTV').textContent = $('baseT').value;
  $('raiseV').textContent = $('raise').value;
}

let pending = false;
function rebuild() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    labels();
    if (mode === 'litho') buildLithophane(); else buildKeychain();
    fitCamera(false);
  });
}

document.querySelectorAll('aside input, aside select').forEach((el) => el.addEventListener('input', rebuild));
$('photo').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const img = new Image();
  img.onload = () => { srcImg = img; $('zoom').value = 1; $('offX').value = 0; $('offY').value = 0; rebuild(); };
  img.src = URL.createObjectURL(f);
});

function setMode(m) {
  mode = m;
  $('tabLitho').classList.toggle('on', m === 'litho');
  $('tabKey').classList.toggle('on', m === 'key');
  $('paneLitho').classList.toggle('hidden', m !== 'litho');
  $('paneKey').classList.toggle('hidden', m !== 'key');
  $('lit').classList.toggle('hidden', m !== 'litho');
  rebuild();
}
$('tabLitho').onclick = () => setMode('litho');
$('tabKey').onclick = () => setMode('key');
$('lit').onclick = () => { backlit = !backlit; $('lit').classList.toggle('on', backlit); rebuild(); };
$('reset').onclick = () => fitCamera(true);

$('dl').onclick = () => {
  const data = new STLExporter().parse(model, { binary: true });
  const blob = new Blob([data], { type: 'model/stl' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = mode === 'litho' ? 'lithophane.stl' : `keychain-${($('name').value || 'name').toLowerCase()}.stl`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

resize();
rebuild();
(function loop() {
  requestAnimationFrame(loop);
  controls.update();
  renderer.render(scene, camera);
})();
window.__studio = { scene, setMode, getModel: () => model, STLExporter };
