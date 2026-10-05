/* 3D terrain for the Valley: baked ground texture plus instanced forest,
   bushes and river water, chunked so the camera can cull off-screen parts. */
import * as THREE from 'three';
import { TILE } from '../../shared/tiles.js';
import { mulberry32 } from '../../shared/rng.js';
import { makeGlowTexture } from './glow.js';

const PX = 10;
const CHUNK = 16;
export const TEAM_HEX = { blue: 0x3b82f6, red: 0xef4444, neutral: 0xa3a3a3 };

function chunked(group, list, geometry, material, place, opts = {}) {
  const buckets = new Map();
  for (const item of list) {
    const key = `${Math.floor(item[0] / CHUNK)},${Math.floor(item[1] / CHUNK)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  }
  for (const items of buckets.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    items.forEach((item, i) => place(mesh, i, item));
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = !!opts.castShadow;
    mesh.receiveShadow = !!opts.receiveShadow;
    group.add(mesh);
  }
}

const COLORS = {
  [TILE.TREE]: '#1b2a16', [TILE.ROAD]: '#7a6a50', [TILE.GRASS]: '#3a5a2a', [TILE.RIVER]: '#2a5a72',
  [TILE.PLAZA]: '#6f7380', [TILE.RUG]: '#5b6170', [TILE.BUSH]: '#2f5f24',
};

function baseTint(x, y, size) {
  if (x < 48 && y > size - 48) return new THREE.Color(0x3b5b9a);
  if (y < 48 && x > size - 48) return new THREE.Color(0x9a3b3b);
  return null;
}

function noiseCanvas(n, rand) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(n, n);
  for (let i = 0; i < n * n; i++) { const v = 90 + rand() * 76; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  return c;
}

function bakeGround(map, size) {
  const W = map.w * PX, H = map.h * PX;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const rand = mulberry32(1337);
  const c = new THREE.Color();
  // One pixel per tile, upscaled with smoothing so tile types blend softly.
  const small = document.createElement('canvas');
  small.width = map.w; small.height = map.h;
  const sctx = small.getContext('2d');
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const t = map.get(x, y);
      c.set(t === TILE.BUSH ? COLORS[TILE.GRASS] : COLORS[t] || '#222');
      const tint = baseTint(x, y, size);
      if (tint && (t === TILE.PLAZA || t === TILE.RUG)) c.lerp(tint, 0.25);
      c.offsetHSL(0, 0, (rand() - 0.5) * 0.04);
      sctx.fillStyle = '#' + c.getHexString();
      sctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, 0, 0, W, H);
  // Large and small scale colour noise for a painted look.
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.35;
  ctx.drawImage(noiseCanvas(48, rand), 0, 0, W, H);
  ctx.globalAlpha = 0.25;
  const fine = noiseCanvas(256, rand);
  for (let y = 0; y < H; y += 512) for (let x = 0; x < W; x += 512) ctx.drawImage(fine, x, y, 512, 512);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  // Details are batched into a few paths: one fill/stroke per colour is far
  // cheaper than thousands of individual canvas calls.
  const paths = { pebbleLight: new Path2D(), pebbleDark: new Path2D(), bladeLight: new Path2D(), bladeDark: new Path2D(), flags: new Path2D(), flagShine: new Path2D() };
  const flowers = [];
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const t = map.get(x, y);
      const X = x * PX, Y = y * PX;
      if (t === TILE.ROAD) {
        for (let i = 0; i < 3; i++) if (rand() < 0.5) {
          const px = X + rand() * PX, py = Y + rand() * PX, rx = 1 + rand() * 1.6;
          const path = rand() < 0.5 ? paths.pebbleLight : paths.pebbleDark;
          path.moveTo(px + rx, py); path.ellipse(px, py, rx, 0.8 + rand(), 0, 0, Math.PI * 2);
        }
      } else if (t === TILE.GRASS || t === TILE.BUSH) {
        for (let i = 0; i < 5; i++) {
          const gx = X + rand() * PX, gy = Y + rand() * PX;
          const path = rand() < 0.55 ? paths.bladeLight : paths.bladeDark;
          path.moveTo(gx, gy); path.lineTo(gx + (rand() - 0.5) * 1.5, gy - 2 - rand() * 2);
        }
        if (t === TILE.GRASS && rand() < 0.015) flowers.push([X + rand() * PX, Y + rand() * PX, Math.floor(rand() * 3)]);
      } else if (t === TILE.PLAZA || t === TILE.RUG) {
        const off = (y % 2) * PX / 2; // staggered flagstones
        paths.flags.rect(X + 0.5 - off, Y + 0.5, PX - 1, PX - 1);
        if (rand() < 0.2) paths.flagShine.rect(X + 1, Y + 1, PX - 2, PX - 2);
      }
    }
  }
  ctx.fillStyle = 'rgba(255,240,210,0.13)'; ctx.fill(paths.pebbleLight);
  ctx.fillStyle = 'rgba(40,30,20,0.14)'; ctx.fill(paths.pebbleDark);
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = 'rgba(140,200,80,0.28)'; ctx.stroke(paths.bladeLight);
  ctx.strokeStyle = 'rgba(10,35,10,0.3)'; ctx.stroke(paths.bladeDark);
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = 'rgba(0,0,0,0.13)'; ctx.stroke(paths.flags);
  ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill(paths.flagShine);
  for (const [fx, fy, k] of flowers) { ctx.fillStyle = ['#f9e27a', '#f4f4f5', '#c4b5fd'][k]; ctx.fillRect(fx, fy, 1.4, 1.4); }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, canvas };
}

/* Animated river: one plane over the whole map, masked to river tiles,
   with scrolling ripples, depth tint, sun glints and foam at the banks. */
function buildWater(map) {
  const S = 4;
  const mask = document.createElement('canvas');
  mask.width = map.w * S; mask.height = map.h * S;
  // One pixel per tile, then a single blurred upscale (a filter on every
  // fillRect is very slow).
  const tiles = document.createElement('canvas');
  tiles.width = map.w; tiles.height = map.h;
  const tctx = tiles.getContext('2d');
  tctx.fillStyle = '#000'; tctx.fillRect(0, 0, map.w, map.h);
  tctx.fillStyle = '#fff';
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) if (map.get(x, y) === TILE.RIVER) tctx.fillRect(x, y, 1, 1);
  const mctx = mask.getContext('2d');
  mctx.imageSmoothingEnabled = true;
  mctx.filter = 'blur(3px)';
  mctx.drawImage(tiles, 0, 0, mask.width, mask.height);
  const maskTex = new THREE.CanvasTexture(mask);
  maskTex.colorSpace = THREE.NoColorSpace;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uMask: { value: maskTex }, uSize: { value: new THREE.Vector2(map.w, map.h) } },
    vertexShader: `varying vec2 vUv; varying vec3 vPos;
      void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vPos = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime; uniform sampler2D uMask; uniform vec2 uSize; varying vec2 vUv; varying vec3 vPos;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        float m = texture2D(uMask, vUv).r; // CanvasTexture flipY matches the plane's UVs
        if (m < 0.02) discard;
        vec2 p = vPos.xz;
        float n = noise(p * 0.9 + vec2(uTime * 0.35, uTime * 0.2)) * 0.6 + noise(p * 2.3 - vec2(uTime * 0.5, -uTime * 0.3)) * 0.4;
        vec3 deep = vec3(0.07, 0.30, 0.42), shallow = vec3(0.22, 0.62, 0.70);
        vec3 col = mix(shallow, deep, smoothstep(0.35, 1.0, m));
        col += vec3(0.10, 0.16, 0.18) * smoothstep(0.55, 0.95, n);           // ripple highlights
        col += vec3(0.9) * pow(smoothstep(0.78, 1.0, n), 6.0) * 0.6;           // sun glints
        float foam = smoothstep(0.55, 0.25, m) * (0.6 + 0.4 * noise(p * 3.0 + uTime));
        col = mix(col, vec3(0.85, 0.95, 1.0), foam * 0.7);
        gl_FragColor = vec4(col, smoothstep(0.02, 0.3, m) * 0.82);
      }`,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(map.w, map.h), mat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(map.w / 2, 0.06, map.h / 2);
  plane.renderOrder = 1;
  return { plane, mat };
}

export function buildValley(valley, quality) {
  const map = valley.map;
  const group = new THREE.Group();
  const { tex, canvas } = bakeGround(map, valley.size);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(map.w, map.h), new THREE.MeshLambertMaterial({ map: tex }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(map.w / 2, 0, map.h / 2);
  ground.receiveShadow = true;
  group.add(ground);

  const rand = mulberry32(99);
  const trees = [], bushes = [];
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    const t = map.get(x, y);
    if (t === TILE.TREE) {
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) if (map.walkable(x + dx, y + dy)) { edge = true; break; }
      if (edge || rand() < (quality === 'low' ? 0.12 : 0.3)) trees.push([x, y, edge]);
    } else if (t === TILE.BUSH) bushes.push([x, y]);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  const yAxis = new THREE.Vector3(0, 1, 0);

  const leaf = new THREE.Color(0x2c5a26);
  const treeData = trees.map(([x, y, edge]) => [x, y, 0.85 + rand() * 0.7, x + 0.5 + (rand() - 0.5) * 0.4, y + 0.5 + (rand() - 0.5) * 0.4, rand() * Math.PI, leaf.clone().offsetHSL((rand() - 0.5) * 0.05, 0, (rand() - 0.5) * 0.12), edge]);
  const part = (h, colorFn) => (mesh, i, [, , sc, ox, oy, rot, c]) => {
    q.setFromAxisAngle(yAxis, rot);
    m4.compose(p.set(ox, h * sc, oy), q, s.set(sc, sc, sc));
    mesh.setMatrixAt(i, m4);
    if (colorFn) mesh.setColorAt(i, colorFn(c));
  };
  const shadow = { castShadow: quality === 'high' };
  const treeGroup = new THREE.Group(), bushGroup = new THREE.Group(), fountainGroup = new THREE.Group();
  group.add(treeGroup, bushGroup, fountainGroup);
  chunked(treeGroup, treeData, new THREE.CylinderGeometry(0.12, 0.18, 1, 5), new THREE.MeshLambertMaterial({ color: 0x4a3420 }), part(0.5), shadow);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  chunked(treeGroup, treeData, new THREE.ConeGeometry(0.85, 1.7, 7), leafMat, part(1.6, c => c), shadow);
  chunked(treeGroup, treeData, new THREE.ConeGeometry(0.62, 1.3, 7), leafMat, part(2.5, c => col.copy(c).offsetHSL(0, 0, 0.05)), shadow);

  // Bushes: clumps of tall grass.
  const bushMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const bushData = bushes.map(([x, y]) => [x, y, rand(), rand()]);
  chunked(bushGroup, bushData, new THREE.IcosahedronGeometry(0.62, 0), bushMat, (mesh, i, [x, y, r1, r2]) => {
    q.setFromAxisAngle(yAxis, r1 * 6);
    m4.compose(p.set(x + 0.5, 0.35, y + 0.5), q, s.set(1 + r2 * 0.3, 0.75 + r1 * 0.3, 1 + r2 * 0.3));
    mesh.setMatrixAt(i, m4);
    mesh.setColorAt(i, col.set(0x3f7f2e).offsetHSL(0, 0, (r2 - 0.5) * 0.1));
  });

  const water = buildWater(map);
  group.add(water.plane);

  // Fountain platforms.
  for (const team of ['blue', 'red']) {
    const f = valley.teams[team].fountain;
    const ring = new THREE.Mesh(new THREE.RingGeometry(5.5, 6.2, 48), new THREE.MeshBasicMaterial({ color: TEAM_HEX[team], transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(f.x, 0.06, f.y);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture(), color: TEAM_HEX[team], transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(4, 4, 1);
    glow.position.set(f.x, 3.2, f.y);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 3, 8), new THREE.MeshStandardMaterial({ color: 0xc8c2b4, roughness: 0.6 }));
    pillar.position.set(f.x, 1.5, f.y);
    group.add(ring, glow);
    fountainGroup.add(pillar);
  }
  return { group, water: water.mat, treeGroup, bushGroup, fountainGroup, treeData, bushData, quality, minimapCanvas: canvas };
}

/* ---------------- Tripo prop models ---------------- */
// Bakes a GLB's meshes into normalized geometry: centred, base at y=0,
// `size` tall (or wide when byWidth). Returns [{ geometry, material }].
function propParts(gltf, size, byWidth = false) {
  gltf.scene.updateMatrixWorld(true);
  const parts = [];
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    const src = o.material;
    parts.push({ geometry: g, material: new THREE.MeshLambertMaterial({ map: src.map || null, color: src.map ? 0xffffff : src.color }) });
  });
  if (!parts.length) return null;
  const box = new THREE.Box3();
  for (const p of parts) { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox); }
  const ext = box.getSize(new THREE.Vector3());
  const k = size / Math.max(0.01, byWidth ? Math.max(ext.x, ext.z) : ext.y);
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  for (const p of parts) { p.geometry.translate(-cx, -box.min.y, -cz); p.geometry.scale(k, k, k); }
  return parts;
}

function clearGroup(g) {
  for (const c of [...g.children]) { g.remove(c); c.traverse(o => { if (o.isInstancedMesh) o.dispose(); if (o.geometry) o.geometry.dispose(); }); }
}

/** Swaps procedural trees, bushes and fountain pillars for Tripo models as they load. */
export function upgradeValley(terrain, valley, loadModel) {
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const shadow = { castShadow: terrain.quality === 'high' };

  // Low quality keeps the cheap cone forest (model trees are ~2k triangles each).
  if (terrain.quality !== 'low') Promise.all(['tree_pine', 'tree_oak', 'tree_fir'].map(loadModel)).then(models => {
    const variants = models.filter(Boolean).map(g => propParts(g, 2.9)).filter(Boolean);
    if (!variants.length || !terrain.group.parent) return;
    clearGroup(terrain.treeGroup);
    // Model trees are ~2k triangles and bigger than the cones, so use fewer:
    // every other forest-edge tile, and a sparse scattering inside.
    const high = terrain.quality === 'high';
    const placed = terrain.treeData.filter(([x, y, , , , , , edge]) => {
      const h = (x * 73856093 ^ y * 19349663) >>> 0;
      return edge ? h % (high ? 2 : 3) === 0 : h % (high ? 8 : 16) === 0;
    });
    variants.forEach((parts, vi) => {
      const items = placed.filter(([x, y]) => ((x * 7 + y * 13) % variants.length) === vi);
      for (const part of parts) {
        chunked(terrain.treeGroup, items, part.geometry, part.material, (mesh, i, [, , sc, ox, oy, rot, c, edge]) => {
          q.setFromAxisAngle(yAxis, rot);
          m4.compose(p.set(ox, 0, oy), q, s.setScalar(edge ? Math.min(sc, 1.15) * 0.85 : sc * 1.3)); // edge trees stay small so they don't hide paths and camps
          mesh.setMatrixAt(i, m4);
          mesh.setColorAt(i, col.setScalar(0.82).lerp(c, 0.15));
        }, shadow);
      }
    });
  });

  if (terrain.quality !== 'low') loadModel('bush').then(gltf => {
    const parts = gltf && propParts(gltf, 1.6, true);
    if (!parts || !terrain.group.parent) return;
    clearGroup(terrain.bushGroup);
    for (const part of parts) {
      chunked(terrain.bushGroup, terrain.bushData, part.geometry, part.material, (mesh, i, [x, y, r1, r2]) => {
        q.setFromAxisAngle(yAxis, r1 * 6);
        m4.compose(p.set(x + 0.5, 0, y + 0.5), q, s.setScalar(0.9 + r2 * 0.3));
        mesh.setMatrixAt(i, m4);
      });
    }
  });

  for (const team of ['blue', 'red']) {
    loadModel(`fountain_${team}`).then(gltf => {
      if (!gltf || !terrain.group.parent) return;
      const model = gltf.scene.clone();
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model), ext = box.getSize(new THREE.Vector3());
      const k = 7 / Math.max(ext.x, ext.z);
      model.scale.set(k, k * 0.7, k);
      const f = valley.teams[team].fountain;
      // Sits behind the spawn point, toward the base corner, so champions aren't hidden inside it.
      const back = team === 'blue' ? [-3.2, 3.2] : [3.2, -3.2];
      model.position.set(f.x + back[0] - (box.min.x + box.max.x) / 2 * k, -box.min.y * k * 0.7, f.y + back[1] - (box.min.z + box.max.z) / 2 * k);
      model.traverse(o => { if (o.isMesh) o.receiveShadow = o.castShadow = true; });
      // Only this team's pillar is replaced.
      const pillar = terrain.fountainGroup.children.find(c => Math.abs(c.position.x - f.x) < 0.1 && Math.abs(c.position.z - f.y) < 0.1);
      if (pillar) pillar.visible = false;
      terrain.fountainGroup.add(model);
    });
  }
}
