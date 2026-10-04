/* Procedural dungeon floors: rooms + MST corridors, packs, chests, torches, boss rooms. */
import { RNG } from './rng.js';
import { TILE, TileMap } from './tiles.js';
import { DUNGEON_POOLS, BOSS_ROTATION } from './monsters.js';

export const BOSS_EVERY = 5;

export function isBossFloor(floor) { return floor % BOSS_EVERY === 0; }
export function floorLevel(floor) { return Math.max(1, Math.round(floor * 1.15)); }

function overlaps(a, b, gap) {
  return a.x - gap < b.x + b.w && a.x + a.w + gap > b.x && a.y - gap < b.y + b.h && a.y + a.h + gap > b.y;
}

function center(r) { return { x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) }; }

function carveCorridor(map, rng, a, b, width) {
  const ca = center(a), cb = center(b);
  const horizontalFirst = rng.chance(0.5);
  const carveH = (x0, x1, y) => {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
      for (let k = 0; k < width; k++) if (map.get(x, y + k) !== TILE.RUG) map.set(x, y + k, TILE.FLOOR);
  };
  const carveV = (y0, y1, x) => {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let k = 0; k < width; k++) if (map.get(x + k, y) !== TILE.RUG) map.set(x + k, y, TILE.FLOOR);
  };
  if (horizontalFirst) { carveH(ca.x, cb.x, ca.y); carveV(ca.y, cb.y, cb.x); }
  else { carveV(ca.y, cb.y, ca.x); carveH(ca.x, cb.x, cb.y); }
}

export function bfsDistances(map, sx, sy) {
  const d = new Int32Array(map.w * map.h).fill(-1);
  const q = [sx + sy * map.w];
  d[q[0]] = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi];
    const x = i % map.w, y = (i / map.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!map.walkable(nx, ny)) continue;
      const ni = nx + ny * map.w;
      if (d[ni] !== -1) continue;
      d[ni] = d[i] + 1;
      q.push(ni);
    }
  }
  return d;
}

export function generateDungeon(seed, floor) {
  const rng = new RNG(seed);
  const boss = isBossFloor(floor);
  const size = 64 + Math.min(32, floor * 2);
  const map = new TileMap(size, size);
  const targetRooms = Math.min(16, 8 + Math.floor(floor / 2));
  const rooms = [];

  // Boss floors reserve a large arena room first so it always fits.
  if (boss) {
    const w = 18, h = 16;
    rooms.push({ x: size - w - 4, y: size - h - 4, w, h, boss: true });
  }
  for (let tries = 0; tries < 400 && rooms.length < targetRooms; tries++) {
    const w = rng.int(7, 13), h = rng.int(7, 12);
    const r = { x: rng.int(2, size - w - 3), y: rng.int(2, size - h - 3), w, h };
    if (rooms.some(o => overlaps(o, r, 3))) continue;
    rooms.push(r);
  }
  // Start room: the room farthest from the boss room on boss floors, else the first room.
  if (boss) {
    const b = center(rooms[0]);
    let best = 1, bestD = -1;
    for (let i = 1; i < rooms.length; i++) {
      const c = center(rooms[i]);
      const dd = (c.x - b.x) ** 2 + (c.y - b.y) ** 2;
      if (dd > bestD) { bestD = dd; best = i; }
    }
    const bossRoom = rooms[0];
    const startRoom = rooms[best];
    rooms.splice(best, 1);
    rooms[0] = startRoom;
    rooms.push(bossRoom);
  }

  for (const r of rooms) map.fill(r.x, r.y, r.x + r.w - 1, r.y + r.h - 1, TILE.FLOOR);

  // Prim's MST over room centres + a few loops so the layout is not a pure tree.
  const inTree = new Set([0]);
  const edges = [];
  while (inTree.size < rooms.length) {
    let best = null;
    for (const i of inTree) {
      for (let j = 0; j < rooms.length; j++) {
        if (inTree.has(j)) continue;
        const a = center(rooms[i]), b = center(rooms[j]);
        const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        if (!best || d < best.d) best = { i, j, d };
      }
    }
    inTree.add(best.j);
    edges.push([best.i, best.j]);
  }
  const extra = Math.max(1, Math.floor(rooms.length / 5));
  for (let k = 0; k < extra; k++) {
    const i = rng.int(0, rooms.length - 1), j = rng.int(0, rooms.length - 1);
    if (i !== j) edges.push([i, j]);
  }
  for (const [i, j] of edges) carveCorridor(map, rng, rooms[i], rooms[j], rng.chance(0.3) ? 3 : 2);

  const start = rooms[0];
  map.fill(start.x + 1, start.y + 1, start.x + start.w - 2, start.y + start.h - 2, TILE.RUG);

  // Pillars inside larger rooms (never on room edges, so corridors stay open).
  for (let ri = 1; ri < rooms.length; ri++) {
    const r = rooms[ri];
    if (r.w < 10 || r.h < 9 || rng.chance(0.4)) continue;
    const c = center(r);
    for (const [px, py] of [[r.x + 2, r.y + 2], [r.x + r.w - 3, r.y + 2], [r.x + 2, r.y + r.h - 3], [r.x + r.w - 3, r.y + r.h - 3]]) {
      if (Math.abs(px - c.x) > 1 || Math.abs(py - c.y) > 1) map.set(px, py, TILE.PILLAR);
    }
  }

  // Walls around everything walkable.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (map.get(x, y) !== TILE.VOID) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++)
        for (let dx = -1; dx <= 1; dx++) if (map.walkable(x + dx, y + dy)) { near = true; break; }
      if (near) map.set(x, y, TILE.WALL);
    }
  }

  const sc = center(start);
  const dist = bfsDistances(map, sc.x, sc.y);

  // Stairs: in the boss room on boss floors, otherwise in the room farthest by walking distance.
  let stairsRoom;
  if (boss) stairsRoom = rooms[rooms.length - 1];
  else {
    let bestD = -1;
    for (let i = 1; i < rooms.length; i++) {
      const c = center(rooms[i]);
      const d = dist[c.x + c.y * size];
      if (d > bestD) { bestD = d; stairsRoom = rooms[i]; }
    }
  }
  const stc = center(stairsRoom);

  const level = floorLevel(floor);
  const band = Math.min(DUNGEON_POOLS.length - 1, Math.floor((floor - 1) / 4));
  const pool = DUNGEON_POOLS[band];
  const spawns = [];
  const chests = [];
  const freeSpot = (r, margin = 1) => {
    for (let t = 0; t < 30; t++) {
      const x = rng.int(r.x + margin, r.x + r.w - 1 - margin) + 0.5;
      const y = rng.int(r.y + margin, r.y + r.h - 1 - margin) + 0.5;
      if (map.walkable(Math.floor(x), Math.floor(y)) && Math.hypot(x - stc.x, y - stc.y) > 2) return { x, y };
    }
    return null;
  };
  for (let i = 1; i < rooms.length; i++) {
    const r = rooms[i];
    if (r.boss) continue;
    const count = rng.int(2, 4) + Math.min(4, Math.floor(floor / 3));
    for (let k = 0; k < count; k++) {
      const p = freeSpot(r);
      if (p) spawns.push({ type: rng.pick(pool), x: p.x, y: p.y, level, elite: false });
    }
    if (rng.chance(0.12 + Math.min(0.25, floor * 0.015))) {
      const p = freeSpot(r, 2);
      if (p) spawns.push({ type: rng.pick(pool), x: p.x, y: p.y, level, elite: true });
    }
    if (rng.chance(0.3)) {
      const p = freeSpot(r, 1);
      if (p) chests.push(p);
    }
  }
  let bossSpawn = null;
  if (boss) {
    const bossType = BOSS_ROTATION[(floor / BOSS_EVERY - 1) % BOSS_ROTATION.length];
    const br = rooms[rooms.length - 1];
    bossSpawn = { type: bossType, x: br.x + br.w / 2, y: br.y + 4.5, level: level + 1 };
  }

  // Torches on walls that touch room floor.
  const torches = [];
  for (const r of rooms) {
    const cands = [];
    for (let x = r.x; x < r.x + r.w; x++) {
      if (map.get(x, r.y - 1) === TILE.WALL) cands.push({ x: x + 0.5, y: r.y - 0.5 });
      if (map.get(x, r.y + r.h) === TILE.WALL) cands.push({ x: x + 0.5, y: r.y + r.h + 0.5 });
    }
    rng.shuffle(cands);
    torches.push(...cands.slice(0, 2));
  }

  return {
    floor,
    level,
    boss,
    map,
    rooms,
    start: { x: sc.x + 0.5, y: sc.y + 0.5 },
    exit: { x: start.x + 1.5, y: start.y + 1.5 },
    stairs: { x: stc.x + 0.5, y: stc.y + 0.5 },
    spawns,
    chests,
    torches,
    bossSpawn,
  };
}
