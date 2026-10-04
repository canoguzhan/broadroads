/* Builds the 3D terrain for a zone from its tile map. Ground is a single plane
   with a baked canvas texture; walls, trees, rocks and pillars are instanced. */
import * as THREE from 'three';
import { TILE } from '../../shared/tiles.js';
import { mulberry32 } from '../../shared/rng.js';

const PX = 12; // texture pixels per tile

function hex(c) { return '#' + new THREE.Color(c).getHexString(); }

function palette(kind, theme) {
  const t = new THREE.Color(theme.arenaColor);
  const accent = new THREE.Color(theme.primaryHex);
  const mix = (base, amt = 0.25) => hex(new THREE.Color(base).lerp(t, amt));
  if (kind === 'dungeon') {
    return {
      [TILE.FLOOR]: mix(0x5a5366, 0.3), [TILE.RUG]: hex(new THREE.Color(0x4a2030).lerp(accent, 0.12)),
      [TILE.WALL]: '#18151d', [TILE.PILLAR]: mix(0x2e2a36, 0.3), [TILE.VOID]: '#050407',
    };
  }
  if (kind === 'arena') {
    return {
      [TILE.SAND]: mix(0xb39a68, 0.18), [TILE.RUG]: hex(new THREE.Color(0x3b5b9a).lerp(accent, 0.2)),
      [TILE.WALL]: '#2a2420', [TILE.PILLAR]: '#5a5048', [TILE.ROCK]: '#5a5048', [TILE.WATER]: '#235a86',
    };
  }
  return {
    [TILE.GRASS]: mix(0x3f6b2e, 0.12), [TILE.ROAD]: '#8a7556', [TILE.PLAZA]: '#8f877a', [TILE.SAND]: '#b39a62',
    [TILE.WATER]: '#24557e', [TILE.RUG]: hex(new THREE.Color(0x6b2430).lerp(accent, 0.2)), [TILE.WALL]: '#6c6458',
    [TILE.TREE]: '#2b4a22', [TILE.ROCK]: '#4c5a3c', [TILE.BRIDGE]: '#7a5a38', [TILE.VOID]: '#1c2a16',
  };
}

function bakeGround(map, kind, theme) {
  const canvas = document.createElement('canvas');
  canvas.width = map.w * PX;
  canvas.height = map.h * PX;
  const ctx = canvas.getContext('2d');
  const pal = palette(kind, theme);
  const rand = mulberry32(map.w * 31 + map.h);
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const t = map.get(x, y);
      const base = new THREE.Color(pal[t] || pal[TILE.FLOOR] || pal[TILE.GRASS] || '#333');
      if (t !== TILE.VOID && t !== TILE.WALL) base.offsetHSL(0, 0, (rand() - 0.5) * 0.08);
      ctx.fillStyle = '#' + base.getHexString();
      ctx.fillRect(x * PX, y * PX, PX, PX);
      // Surface detail.
      if (t === TILE.GRASS) {
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = rand() < 0.5 ? 'rgba(120,170,70,0.25)' : 'rgba(20,40,10,0.25)';
          ctx.fillRect(x * PX + rand() * PX, y * PX + rand() * PX, 1.5, 3);
        }
        if (rand() < 0.04) {
          ctx.fillStyle = ['#e5d36b', '#e88aa8', '#a7c8f2'][Math.floor(rand() * 3)];
          ctx.fillRect(x * PX + rand() * PX, y * PX + rand() * PX, 2, 2);
        }
      } else if (t === TILE.FLOOR || t === TILE.PLAZA || t === TILE.ROAD) {
        ctx.strokeStyle = t === TILE.FLOOR ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.09)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x * PX + 0.5, y * PX + 0.5, PX - 1, PX - 1);
        if (rand() < 0.15) {
          ctx.fillStyle = 'rgba(0,0,0,0.15)';
          ctx.fillRect(x * PX + rand() * PX, y * PX + rand() * PX, 3, 2);
        }
      } else if (t === TILE.SAND) {
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = 'rgba(255,240,200,0.15)';
          ctx.fillRect(x * PX + rand() * PX, y * PX + rand() * PX, 1, 1);
        }
      } else if (t === TILE.RUG) {
        ctx.strokeStyle = 'rgba(255,215,120,0.12)';
        ctx.strokeRect(x * PX + 2.5, y * PX + 2.5, PX - 5, PX - 5);
      }
      // Ambient occlusion next to blocking tiles.
      if (map.walkable(x, y)) {
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        if (!map.walkable(x, y - 1) && map.get(x, y - 1) !== TILE.WATER) ctx.fillRect(x * PX, y * PX, PX, 3);
        if (!map.walkable(x - 1, y) && map.get(x - 1, y) !== TILE.WATER) ctx.fillRect(x * PX, y * PX, 3, PX);
        if (!map.walkable(x + 1, y) && map.get(x + 1, y) !== TILE.WATER) ctx.fillRect(x * PX + PX - 3, y * PX, 3, PX);
        if (!map.walkable(x, y + 1) && map.get(x, y + 1) !== TILE.WATER) ctx.fillRect(x * PX, y * PX + PX - 3, PX, 3);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return { tex, canvas };
}

function edgeTile(map, x, y, t) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (map.get(x + dx, y + dy) !== t) return true;
  return false;
}

const CHUNK = 16;

/** Splits instances into spatial chunks so the camera frustum can cull them. */
function chunked(group, list, geometry, material, place, opts = {}) {
  const buckets = new Map();
  for (const item of list) {
    const key = `${Math.floor(item[0] / CHUNK)},${Math.floor(item[1] / CHUNK)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  }
  const meshes = [];
  for (const items of buckets.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    items.forEach((item, i) => place(mesh, i, item));
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = !!opts.castShadow;
    mesh.receiveShadow = !!opts.receiveShadow;
    group.add(mesh);
    meshes.push(mesh);
  }
  return meshes;
}

export function buildTerrain(zone, map, theme, quality) {
  const group = new THREE.Group();
  const kind = zone.kind;
  const rand = mulberry32(map.w * 977 + map.h * 13 + zone.name.length);
  const { tex, canvas } = bakeGround(map, kind, theme);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(map.w, map.h),
    new THREE.MeshLambertMaterial({ map: tex }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(map.w / 2, 0, map.h / 2);
  ground.receiveShadow = true;
  group.add(ground);

  const lists = { wall: [], tree: [], rock: [], pillar: [], water: [] };
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const t = map.get(x, y);
      if (t === TILE.WALL) {
        // Only walls that border open ground are visible.
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (map.walkable(x + dx, y + dy) || map.get(x + dx, y + dy) === TILE.WATER) { near = true; break; }
        if (near) lists.wall.push([x, y]);
      } else if (t === TILE.TREE) {
        if (edgeTile(map, x, y, TILE.TREE) || rand() < (quality === 'low' ? 0.08 : 0.22)) lists.tree.push([x, y]);
      } else if (t === TILE.ROCK) lists.rock.push([x, y]);
      else if (t === TILE.PILLAR) lists.pillar.push([x, y]);
      else if (t === TILE.WATER) lists.water.push([x, y]);
    }
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const col = new THREE.Color();

  // Walls.
  if (lists.wall.length) {
    const height = kind === 'dungeon' ? 1.5 : kind === 'arena' ? 1.3 : 2.4;
    const wallColor = kind === 'dungeon' ? new THREE.Color(0x6a6278).lerp(new THREE.Color(theme.arenaColor), 0.25) : kind === 'arena' ? new THREE.Color(0x6b5d4f) : new THREE.Color(0x8c8273);
    const geo = new THREE.BoxGeometry(1, height, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    chunked(group, lists.wall, geo, mat, (mesh, i, [x, y]) => {
      const hh = height * (0.92 + rand() * 0.16);
      m4.compose(p.set(x + 0.5, hh / 2, y + 0.5), q.identity(), s.set(1, hh / height, 1));
      mesh.setMatrixAt(i, m4);
      col.copy(wallColor).offsetHSL(0, 0, (rand() - 0.5) * 0.08);
      mesh.setColorAt(i, col);
    }, { castShadow: quality !== 'low', receiveShadow: true });
    // Glowing trim on dungeon walls.
    if (kind === 'dungeon') {
      chunked(group, lists.wall, new THREE.BoxGeometry(1.02, 0.08, 1.02), new THREE.MeshBasicMaterial({ color: theme.primaryHex, transparent: true, opacity: 0.35 }),
        (mesh, i, [x, y]) => { m4.compose(p.set(x + 0.5, height + 0.04, y + 0.5), q.identity(), s.set(1, 1, 1)); mesh.setMatrixAt(i, m4); });
    }
  }

  // Trees: trunk + two stacked canopy cones.
  if (lists.tree.length) {
    const leaf = new THREE.Color(0x2f6b2a).lerp(new THREE.Color(theme.secondaryHex), 0.12);
    // Pre-roll per-tree variation so the three parts of a tree line up.
    const trees = lists.tree.map(([x, y]) => {
      const sc = 0.8 + rand() * 0.6;
      const c = leaf.clone().offsetHSL((rand() - 0.5) * 0.04, 0, (rand() - 0.5) * 0.12);
      return [x, y, sc, x + 0.5 + (rand() - 0.5) * 0.4, y + 0.5 + (rand() - 0.5) * 0.4, rand() * Math.PI, c];
    });
    const yAxis = new THREE.Vector3(0, 1, 0);
    const part = (h, colorFn) => (mesh, i, [, , sc, ox, oy, rot, c]) => {
      q.setFromAxisAngle(yAxis, rot);
      m4.compose(p.set(ox, h * sc, oy), q, s.set(sc, sc, sc));
      mesh.setMatrixAt(i, m4);
      if (colorFn) mesh.setColorAt(i, colorFn(c));
    };
    const shadow = { castShadow: quality === 'high' };
    chunked(group, trees, new THREE.CylinderGeometry(0.12, 0.18, 1, 5), new THREE.MeshLambertMaterial({ color: 0x5a3d24 }), part(0.5), shadow);
    const leafMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    chunked(group, trees, new THREE.ConeGeometry(0.75, 1.6, 7), leafMat, part(1.5, c => c), shadow);
    chunked(group, trees, new THREE.ConeGeometry(0.55, 1.2, 7), leafMat, part(2.3, c => col.copy(c).offsetHSL(0, 0, 0.05)), shadow);
  }

  if (lists.rock.length) {
    chunked(group, lists.rock, new THREE.DodecahedronGeometry(0.6, 0), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), (mesh, i, [x, y]) => {
      const sc = 0.8 + rand() * 0.5;
      q.setFromEuler(new THREE.Euler(rand(), rand() * 3, rand()));
      m4.compose(p.set(x + 0.5, 0.35 * sc, y + 0.5), q, s.set(sc, sc * 0.8, sc));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, col.set(0x76726a).offsetHSL(0, 0, (rand() - 0.5) * 0.15));
    }, { castShadow: quality !== 'low' });
  }

  if (lists.pillar.length) {
    const pil = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.5, 2.6, 10), new THREE.MeshStandardMaterial({ color: kind === 'dungeon' ? 0x4a4356 : 0x8b7b66, roughness: 0.8 }), lists.pillar.length);
    lists.pillar.forEach(([x, y], i) => { m4.compose(p.set(x + 0.5, 1.3, y + 0.5), q.identity(), s.set(1, 1, 1)); pil.setMatrixAt(i, m4); });
    pil.castShadow = quality !== 'low';
    group.add(pil);
  }

  let water = null;
  if (lists.water.length) {
    water = new THREE.MeshStandardMaterial({ color: 0x3a8fd0, transparent: true, opacity: 0.55, roughness: 0.15, metalness: 0.3, emissive: 0x0a3050 });
    const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    chunked(group, lists.water, new THREE.PlaneGeometry(1, 1), water, (mesh, i, [x, y]) => {
      m4.compose(p.set(x + 0.5, 0.04, y + 0.5), flat, s.set(1, 1, 1));
      mesh.setMatrixAt(i, m4);
    });
  }

  // Dungeon torches with glow sprites; the renderer assigns a few real lights to the nearest ones.
  const torches = [];
  if (zone.decor && zone.decor.torches) {
    const glowTex = makeGlowTexture();
    for (const t of zone.decor.torches) {
      const tg = new THREE.Group();
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 5), new THREE.MeshStandardMaterial({ color: 0x3b2a1a }));
      stick.position.y = 1.3;
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
      flame.position.y = 1.7;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff9a3c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.set(1.8, 1.8, 1);
      glow.position.y = 1.7;
      tg.add(stick, flame, glow);
      tg.position.set(t.x, 0, t.y);
      group.add(tg);
      torches.push({ x: t.x, y: t.y, flame, glow });
    }
  }

  if (kind === 'world' && zone.decor && zone.decor.town) {
    const t = zone.decor.town;
    const cx = (t.x0 + t.x1) / 2, cz = (t.y0 + t.y1) / 2;
    const stone = new THREE.MeshStandardMaterial({ color: 0xb8ad99, roughness: 0.8 });
    const basin = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.3, 8, 32), stone);
    basin.rotation.x = Math.PI / 2;
    basin.position.set(cx, 0.3, cz);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.4, 10), stone);
    column.position.set(cx, 1.2, cz);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), new THREE.MeshBasicMaterial({ color: theme.primaryHex }));
    orb.position.set(cx, 2.8, cz);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture(), color: theme.primaryHex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.set(4, 4, 1);
    halo.position.copy(orb.position);
    basin.castShadow = column.castShadow = quality !== 'low';
    group.add(basin, column, orb, halo);
  }

  return { group, water, torches, minimapCanvas: canvas };
}

let glowTexture = null;
export function makeGlowTexture() {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glowTexture = new THREE.CanvasTexture(c);
  return glowTexture;
}
