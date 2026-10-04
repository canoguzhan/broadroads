/* 3D terrain for the Rift: baked ground texture plus instanced forest,
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

function bakeGround(map, size) {
  const canvas = document.createElement('canvas');
  canvas.width = map.w * PX; canvas.height = map.h * PX;
  const ctx = canvas.getContext('2d');
  const rand = mulberry32(1337);
  const c = new THREE.Color();
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const t = map.get(x, y);
      c.set(COLORS[t] || '#222');
      const tint = baseTint(x, y, size);
      if (tint && (t === TILE.PLAZA || t === TILE.RUG)) c.lerp(tint, 0.25);
      c.offsetHSL(0, 0, (rand() - 0.5) * 0.05);
      ctx.fillStyle = '#' + c.getHexString();
      ctx.fillRect(x * PX, y * PX, PX, PX);
      if (t === TILE.ROAD && rand() < 0.3) { ctx.fillStyle = 'rgba(255,240,210,0.12)'; ctx.fillRect(x * PX + rand() * PX, y * PX + rand() * PX, 2, 2); }
      if (t === TILE.GRASS || t === TILE.BUSH) for (let i = 0; i < 3; i++) { ctx.fillStyle = rand() < 0.5 ? 'rgba(120,180,70,0.25)' : 'rgba(10,30,10,0.25)'; ctx.fillRect(x * PX + rand() * PX, y * PX + rand() * PX, 1.5, 3); }
      if (t === TILE.PLAZA) { ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.strokeRect(x * PX + 0.5, y * PX + 0.5, PX - 1, PX - 1); }
      if (t === TILE.RIVER && rand() < 0.2) { ctx.fillStyle = 'rgba(180,230,255,0.15)'; ctx.fillRect(x * PX + rand() * PX, y * PX + rand() * PX, 3, 1); }
      // Soft edges where open ground meets forest.
      if (map.walkable(x, y)) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        if (!map.walkable(x, y - 1)) ctx.fillRect(x * PX, y * PX, PX, 2);
        if (!map.walkable(x - 1, y)) ctx.fillRect(x * PX, y * PX, 2, PX);
        if (!map.walkable(x + 1, y)) ctx.fillRect(x * PX + PX - 2, y * PX, 2, PX);
        if (!map.walkable(x, y + 1)) ctx.fillRect(x * PX, y * PX + PX - 2, PX, 2);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, canvas };
}

export function buildRift(rift, quality) {
  const map = rift.map;
  const group = new THREE.Group();
  const { tex, canvas } = bakeGround(map, rift.size);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(map.w, map.h), new THREE.MeshLambertMaterial({ map: tex }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(map.w / 2, 0, map.h / 2);
  ground.receiveShadow = true;
  group.add(ground);

  const rand = mulberry32(99);
  const trees = [], bushes = [], water = [];
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    const t = map.get(x, y);
    if (t === TILE.TREE) {
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) if (map.walkable(x + dx, y + dy)) { edge = true; break; }
      if (edge || rand() < (quality === 'low' ? 0.12 : 0.3)) trees.push([x, y]);
    } else if (t === TILE.BUSH) bushes.push([x, y]);
    else if (t === TILE.RIVER) water.push([x, y]);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  const yAxis = new THREE.Vector3(0, 1, 0);

  const leaf = new THREE.Color(0x2c5a26);
  const treeData = trees.map(([x, y]) => [x, y, 0.85 + rand() * 0.7, x + 0.5 + (rand() - 0.5) * 0.4, y + 0.5 + (rand() - 0.5) * 0.4, rand() * Math.PI, leaf.clone().offsetHSL((rand() - 0.5) * 0.05, 0, (rand() - 0.5) * 0.12)]);
  const part = (h, colorFn) => (mesh, i, [, , sc, ox, oy, rot, c]) => {
    q.setFromAxisAngle(yAxis, rot);
    m4.compose(p.set(ox, h * sc, oy), q, s.set(sc, sc, sc));
    mesh.setMatrixAt(i, m4);
    if (colorFn) mesh.setColorAt(i, colorFn(c));
  };
  const shadow = { castShadow: quality === 'high' };
  chunked(group, treeData, new THREE.CylinderGeometry(0.12, 0.18, 1, 5), new THREE.MeshLambertMaterial({ color: 0x4a3420 }), part(0.5), shadow);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  chunked(group, treeData, new THREE.ConeGeometry(0.85, 1.7, 7), leafMat, part(1.6, c => c), shadow);
  chunked(group, treeData, new THREE.ConeGeometry(0.62, 1.3, 7), leafMat, part(2.5, c => col.copy(c).offsetHSL(0, 0, 0.05)), shadow);

  // Bushes: clumps of tall grass.
  const bushMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  chunked(group, bushes.map(([x, y]) => [x, y, rand(), rand()]), new THREE.IcosahedronGeometry(0.62, 0), bushMat, (mesh, i, [x, y, r1, r2]) => {
    q.setFromAxisAngle(yAxis, r1 * 6);
    m4.compose(p.set(x + 0.5, 0.35, y + 0.5), q, s.set(1 + r2 * 0.3, 0.75 + r1 * 0.3, 1 + r2 * 0.3));
    mesh.setMatrixAt(i, m4);
    mesh.setColorAt(i, col.set(0x3f7f2e).offsetHSL(0, 0, (r2 - 0.5) * 0.1));
  });

  // River water surface.
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x3a8fc0, transparent: true, opacity: 0.45, roughness: 0.15, metalness: 0.3, emissive: 0x0a3050 });
  const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  chunked(group, water, new THREE.PlaneGeometry(1, 1), waterMat, (mesh, i, [x, y]) => { m4.compose(p.set(x + 0.5, 0.05, y + 0.5), flat, s.set(1, 1, 1)); mesh.setMatrixAt(i, m4); });

  // Fountain platforms.
  for (const team of ['blue', 'red']) {
    const f = rift.teams[team].fountain;
    const ring = new THREE.Mesh(new THREE.RingGeometry(5.5, 6.2, 48), new THREE.MeshBasicMaterial({ color: TEAM_HEX[team], transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(f.x, 0.06, f.y);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture(), color: TEAM_HEX[team], transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(4, 4, 1);
    glow.position.set(f.x, 3.2, f.y);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 3, 8), new THREE.MeshStandardMaterial({ color: 0xc8c2b4, roughness: 0.6 }));
    pillar.position.set(f.x, 1.5, f.y);
    group.add(ring, glow, pillar);
  }
  return { group, waterMat, minimapCanvas: canvas };
}
