/* The shared MMO overworld ("The Broadroads") and PvP arena maps. */
import { RNG } from './rng.js';
import { TILE, TileMap, circleBlocked } from './tiles.js';

export const WORLD_SEED = 20240917;
export const WORLD_SIZE = 168;

export const NPC_TYPES = {
  merchant: { name: 'Mira the Merchant', title: 'Potions & Gear', icon: '💰', color: '#fbbf24' },
  blacksmith: { name: 'Dorran Ironhand', title: 'Gear Refinery', icon: '⚒️', color: '#f97316' },
  arena: { name: 'Warden Kael', title: 'PvP Arena', icon: '⚔️', color: '#ef4444' },
  dungeon: { name: 'Seer Ilya', title: 'Dungeon Gate', icon: '🌀', color: '#a855f7' },
  trainer: { name: 'Master Oren', title: 'Class Trainer', icon: '📜', color: '#22c55e' },
  board: { name: 'Hall of Legends', title: 'Leaderboards', icon: '🏆', color: '#eab308' },
};

// Zones by distance from the town centre.
export const ZONES = [
  { id: 'town', name: 'Broadroads Town', maxR: 18, safe: true },
  { id: 'meadow', name: 'Whisperwind Meadows', maxR: 42, levels: [1, 5], pool: ['slime', 'wolf', 'bat'] },
  { id: 'barrows', name: 'Ashen Barrows', maxR: 60, levels: [6, 12], pool: ['skeleton', 'archer', 'wolf', 'bat'] },
  { id: 'wastes', name: 'Voidscar Wastes', maxR: 999, levels: [13, 22], pool: ['brute', 'shaman', 'archer', 'golem'] },
];

export function zoneAt(x, y) {
  const c = WORLD_SIZE / 2;
  const d = Math.max(Math.abs(x - c), Math.abs(y - c));
  return ZONES.find(z => d <= z.maxR) || ZONES[ZONES.length - 1];
}

function blob(map, rng, cx, cy, radius, tile, canPlace) {
  for (let y = Math.floor(cy - radius - 2); y <= cy + radius + 2; y++) {
    for (let x = Math.floor(cx - radius - 2); x <= cx + radius + 2; x++) {
      const d = Math.hypot(x - cx, y - cy) + (rng.float() - 0.5) * 2.2;
      if (d <= radius && canPlace(x, y)) map.set(x, y, tile);
    }
  }
}

export function generateWorld(seed = WORLD_SEED) {
  const rng = new RNG(seed);
  const S = WORLD_SIZE;
  const c = S / 2;
  const map = new TileMap(S, S);
  map.fill(0, 0, S - 1, S - 1, TILE.GRASS);

  const T = 17; // town half-size
  const inTown = (x, y) => Math.abs(x - c) <= T + 1 && Math.abs(y - c) <= T + 1;
  const reserved = new Set();
  const reserve = (x, y, r) => {
    for (let yy = Math.floor(y - r); yy <= y + r; yy++)
      for (let xx = Math.floor(x - r); xx <= x + r; xx++) reserved.add(xx + yy * S);
  };

  // The broad roads: 4-wide roads from each town gate to the world edge.
  const ROAD_HALF = 2;
  for (let i = 4; i < S - 4; i++) {
    for (let k = -ROAD_HALF; k < ROAD_HALF; k++) {
      map.set(c + k, i, TILE.ROAD);
      map.set(i, c + k, TILE.ROAD);
    }
  }
  // Ring road around the town and a second outer ring.
  for (const R of [T + 6, 50]) {
    for (let i = -R; i <= R; i++) {
      for (let k = 0; k < 3; k++) {
        map.set(c + i, c - R + k, TILE.ROAD); map.set(c + i, c + R - k, TILE.ROAD);
        map.set(c - R + k, c + i, TILE.ROAD); map.set(c + R - k, c + i, TILE.ROAD);
      }
    }
  }

  // Lakes (never on roads); roads that cross water become bridges.
  const lakes = [[c + 32, c - 32, 7], [c - 36, c + 30, 8], [c - 30, c - 64, 6], [c + 62, c + 40, 7]];
  for (const [lx, ly, lr] of lakes) {
    blob(map, rng, lx, ly, lr, TILE.WATER, (x, y) => map.get(x, y) === TILE.GRASS);
  }

  // Town: plaza, walls with four gates.
  map.fill(c - T, c - T, c + T, c + T, TILE.PLAZA);
  for (let i = -T - 1; i <= T + 1; i++) {
    for (const [x, y] of [[c + i, c - T - 1], [c + i, c + T + 1], [c - T - 1, c + i], [c + T + 1, c + i]]) {
      if (Math.abs(i) > 3) map.set(x, y, TILE.WALL);
      else map.set(x, y, TILE.ROAD);
    }
  }
  for (let i = -T; i <= T; i++) {
    for (let k = -ROAD_HALF; k < ROAD_HALF; k++) { map.set(c + k, c + i, TILE.ROAD); map.set(c + i, c + k, TILE.ROAD); }
  }
  // Fountain in the middle of town.
  map.fill(c - 2, c - 2, c + 1, c + 1, TILE.WATER);

  const npcs = [
    { id: 'npc_merchant', type: 'merchant', x: c - 9.5, y: c - 8.5 },
    { id: 'npc_blacksmith', type: 'blacksmith', x: c + 9.5, y: c - 8.5 },
    { id: 'npc_arena', type: 'arena', x: c + 9.5, y: c + 8.5 },
    { id: 'npc_dungeon', type: 'dungeon', x: c - 9.5, y: c + 8.5 },
    { id: 'npc_trainer', type: 'trainer', x: c - 13.5, y: c + 0.5 },
    { id: 'npc_board', type: 'board', x: c + 13.5, y: c + 0.5 },
  ].map(n => ({ ...n, ...NPC_TYPES[n.type] }));
  // Stalls under the NPCs.
  for (const n of npcs) map.fill(Math.floor(n.x) - 1, Math.floor(n.y) - 1, Math.floor(n.x) + 1, Math.floor(n.y) + 1, TILE.RUG);

  // World boss arena in the far south-east.
  const bossSpot = { x: c + 64, y: c + 64 };
  blob(map, rng, bossSpot.x, bossSpot.y, 11, TILE.SAND, () => true);
  reserve(bossSpot.x, bossSpot.y, 12);

  // Monster camps.
  const camps = [];
  for (let tries = 0; tries < 800 && camps.length < 34; tries++) {
    const x = rng.int(10, S - 11) + 0.5, y = rng.int(10, S - 11) + 0.5;
    const zone = zoneAt(x, y);
    if (zone.safe) continue;
    if (Math.max(Math.abs(x - c), Math.abs(y - c)) < T + 10) continue;
    if (camps.some(k => Math.hypot(k.x - x, k.y - y) < 14)) continue;
    if (Math.hypot(x - bossSpot.x, y - bossSpot.y) < 18) continue;
    if (Math.abs(x - c) < 7 || Math.abs(y - c) < 7) continue; // keep off the broad roads
    if (map.get(Math.floor(x), Math.floor(y)) !== TILE.GRASS) continue;
    const level = rng.int(zone.levels[0], zone.levels[1]);
    camps.push({ x, y, zone: zone.id, level, pool: zone.pool, count: rng.int(3, 5), radius: 4 });
    blob(map, rng, x, y, 4, TILE.SAND, (xx, yy) => map.get(xx, yy) === TILE.GRASS);
    reserve(x, y, 5);
  }

  // Forest clusters and rocks.
  for (let k = 0; k < 140; k++) {
    const x = rng.int(4, S - 5), y = rng.int(4, S - 5);
    if (inTown(x, y) || Math.max(Math.abs(x - c), Math.abs(y - c)) < T + 9) continue;
    const r = rng.range(1.5, 4.5);
    blob(map, rng, x, y, r, rng.chance(0.85) ? TILE.TREE : TILE.ROCK,
      (xx, yy) => map.get(xx, yy) === TILE.GRASS && !reserved.has(xx + yy * S));
  }
  // Thick forest border.
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const edge = Math.min(x, y, S - 1 - x, S - 1 - y);
      if (edge < 3 || (edge < 6 && rng.chance(0.5))) map.set(x, y, TILE.TREE);
    }
  }

  return {
    map,
    spawn: { x: c + 0.5, y: c + 5.5 },
    town: { x0: c - T, y0: c - T, x1: c + T + 1, y1: c + T + 1 },
    npcs,
    camps,
    bossSpot,
  };
}

export function isInTown(world, x, y) {
  const t = world.town;
  return x >= t.x0 && x <= t.x1 && y >= t.y0 && y <= t.y1;
}

/* ---------------- PvP arenas ---------------- */
export const ARENA_MAPS = ['colosseum', 'ruins'];

export function generateArena(variant = 'colosseum') {
  const W = 40, H = 30;
  const map = new TileMap(W, H);
  map.fill(0, 0, W - 1, H - 1, TILE.WALL);
  map.fill(2, 2, W - 3, H - 3, TILE.SAND);
  const pillar = (x, y) => map.fill(x, y, x + 1, y + 1, TILE.PILLAR);
  if (variant === 'colosseum') {
    for (const [x, y] of [[12, 7], [26, 7], [12, 21], [26, 21], [19, 14]]) pillar(x, y);
    map.fill(17, 4, 22, 4, TILE.PILLAR);
    map.fill(17, 25, 22, 25, TILE.PILLAR);
  } else {
    for (const [x, y] of [[9, 9], [9, 19], [29, 9], [29, 19], [16, 13], [22, 15]]) pillar(x, y);
    map.fill(19, 3, 20, 8, TILE.ROCK);
    map.fill(19, 21, 20, 26, TILE.ROCK);
    map.fill(14, 13, 15, 16, TILE.WATER);
    map.fill(24, 13, 25, 16, TILE.WATER);
  }
  map.fill(3, 12, 6, 17, TILE.RUG);
  map.fill(W - 7, 12, W - 4, 17, TILE.RUG);
  const spawnsA = [[4.5, 13.5], [4.5, 15.5], [5.5, 14.5], [3.5, 12.5], [3.5, 16.5]].map(([x, y]) => ({ x, y }));
  const spawnsB = spawnsA.map(p => ({ x: W - p.x, y: p.y }));
  // FFA spawns: clear points on a few rings around the centre, greedily spread apart.
  const candidates = [];
  for (const [rx, ry, off] of [[13, 8, 0], [15, 11, Math.PI / 8], [9, 6, Math.PI / 8], [16, 6, 0]]) {
    for (let i = 0; i < 8; i++) {
      const a = off + (i / 8) * Math.PI * 2;
      const x = W / 2 + Math.cos(a) * rx, y = H / 2 + Math.sin(a) * ry;
      if (!circleBlocked(map, x, y, 0.9)) candidates.push({ x, y });
    }
  }
  const ffa = [candidates[0]];
  while (ffa.length < 8 && ffa.length < candidates.length) {
    let best = null, bd = -1;
    for (const c of candidates) {
      const d = Math.min(...ffa.map(f => Math.hypot(f.x - c.x, f.y - c.y)));
      if (d > bd) { bd = d; best = c; }
    }
    ffa.push(best);
  }
  return { map, variant, spawnsA, spawnsB, ffa };
}
