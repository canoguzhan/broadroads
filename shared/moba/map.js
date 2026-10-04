/* The Rift: a mirrored three-lane MOBA map. Blue base bottom-left, red base
   top-right. The map is symmetric across the top-left → bottom-right
   diagonal (x, y) ↔ (y, x), which is also where the river runs. */
import { TILE, TileMap } from '../tiles.js';
import { RNG } from '../rng.js';

export const MAP_SIZE = 150;
export const LANES = ['top', 'mid', 'bot'];
export const TEAMS = ['blue', 'red'];
export const enemyOf = t => (t === 'blue' ? 'red' : 'blue');

const mirror = p => ({ ...p, x: p.y, y: p.x });

// Blue-side layout (all points have y > x, i.e. below the diagonal).
const BLUE = {
  fountain: { x: 12, y: 138 },
  nexus: { x: 26, y: 124 },
  towers: [
    { lane: 'top', tier: 1, x: 16.5, y: 48 }, { lane: 'top', tier: 2, x: 16.5, y: 78 }, { lane: 'top', tier: 3, x: 16.5, y: 103 },
    { lane: 'mid', tier: 1, x: 60.5, y: 89.5 }, { lane: 'mid', tier: 2, x: 50.5, y: 99.5 }, { lane: 'mid', tier: 3, x: 42.5, y: 107.5 },
    { lane: 'bot', tier: 1, x: 102, y: 133.5 }, { lane: 'bot', tier: 2, x: 72, y: 133.5 }, { lane: 'bot', tier: 3, x: 47, y: 133.5 },
    { lane: 'base', tier: 4, x: 32, y: 119 }, { lane: 'base', tier: 4, x: 31, y: 129 },
  ],
  inhibitors: [
    { lane: 'top', x: 16.5, y: 112 },
    { lane: 'mid', x: 36.5, y: 113.5 },
    { lane: 'bot', x: 38, y: 133.5 },
  ],
  camps: [
    { id: 'blueBuff', type: 'ancient', x: 32, y: 72, buff: 'blue' },
    { id: 'wolves', type: 'wolves', x: 34, y: 94 },
    { id: 'raptors', type: 'raptors', x: 50, y: 66 },
    { id: 'redBuff', type: 'brute', x: 78, y: 113, buff: 'red' },
    { id: 'gromp', type: 'gromp', x: 60, y: 106 },
    { id: 'krugs', type: 'krugs', x: 100, y: 120 },
  ],
};

// Minion paths for the blue team; red paths are the mirrored reverse.
const BLUE_PATHS = {
  top: [[22, 118], [16.5, 104], [16.5, 24], [24, 16.5], [104, 16.5], [118, 22], [124, 26]],
  mid: [[30, 120], [120, 30], [124, 26]],
  bot: [[30, 128], [38, 133.5], [126, 133.5], [133.5, 126], [133.5, 38], [128, 30], [124, 26]],
};

export const EPIC = {
  dragon: { x: 110, y: 110 },
  baron: { x: 40, y: 40 },
};

function carveDisc(map, cx, cy, r, tile, only) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r) continue;
      if (only && !only.includes(map.get(x, y))) continue;
      map.set(x, y, tile);
    }
  }
}

function carveLine(map, ax, ay, bx, by, r, tile, only) {
  const len = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(len / 0.5));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    carveDisc(map, ax + (bx - ax) * t, ay + (by - ay) * t, r, tile, only);
  }
}

export function generateRift() {
  const S = MAP_SIZE;
  const map = new TileMap(S, S);
  map.fill(0, 0, S - 1, S - 1, TILE.TREE);
  const rng = new RNG(424242);

  // River along the diagonal (shallow water, walkable).
  carveLine(map, 18, 18, 132, 132, 4.5, TILE.RIVER);
  // Jungle floor paths between camps (blue half; mirrored later).
  const J = TILE.GRASS;
  const paths = [
    [17, 72, 32, 72], [32, 72, 50, 66], [50, 66, 60, 58], [32, 72, 34, 94], [34, 94, 17, 94], [34, 94, 48, 102],
    [50, 66, 66, 84], [60, 106, 56, 94], [60, 106, 78, 113], [78, 113, 78, 133], [78, 113, 100, 120],
    [100, 120, 100, 133], [78, 113, 94, 92], [100, 120, 112, 104], [28, 50, 38, 42], [28, 50, 17, 50],
  ];
  for (const [ax, ay, bx, by] of paths) carveLine(map, ax, ay, bx, by, 1.9, J, [TILE.TREE]);
  for (const c of BLUE.camps) carveDisc(map, c.x, c.y, 4.2, J, [TILE.TREE]);
  // Epic monster pits on the river.
  carveDisc(map, EPIC.dragon.x, EPIC.dragon.y, 7, TILE.RIVER);
  carveDisc(map, EPIC.baron.x, EPIC.baron.y, 7, TILE.RIVER);

  // Lanes.
  const L = TILE.ROAD;
  for (const lane of LANES) {
    const pts = BLUE_PATHS[lane];
    for (let i = 0; i < pts.length - 1; i++) carveLine(map, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 3.6, L);
  }

  // Blue base plaza and fountain.
  for (let y = 108; y <= 146; y++) {
    for (let x = 4; x <= 42; x++) {
      if (x + (146 - y) > 64) continue; // round off the inner corner
      map.set(x, y, TILE.PLAZA);
    }
  }
  carveDisc(map, BLUE.fountain.x, BLUE.fountain.y, 6, TILE.RUG);

  // Bushes (blue half), only on open ground.
  const bushes = [
    [10, 60, 3, 6], [20, 86, 2, 5], [10, 118, 3, 4], [44, 76, 4, 3], [56, 100, 4, 3], [66, 80, 3, 3],
    [74, 124, 5, 2], [90, 138, 6, 2], [118, 138, 6, 2], [86, 102, 4, 3], [26, 60, 3, 3], [48, 56, 3, 3],
    [104, 112, 3, 3],
  ];
  for (const [bx, by, w, h] of bushes) {
    for (let y = by; y < by + h; y++) for (let x = bx; x < bx + w; x++) {
      if (y > x && [TILE.ROAD, TILE.GRASS, TILE.RIVER, TILE.PLAZA].includes(map.get(x, y))) map.set(x, y, TILE.BUSH);
    }
  }

  // Mirror the blue half onto the red half.
  for (let y = 0; y < S; y++) for (let x = y + 1; x < S; x++) map.set(x, y, map.get(y, x));
  // Solid border.
  for (let i = 0; i < S; i++) for (let k = 0; k < 3; k++) {
    map.set(i, k, TILE.TREE); map.set(k, i, TILE.TREE); map.set(i, S - 1 - k, TILE.TREE); map.set(S - 1 - k, i, TILE.TREE);
  }

  // Bush regions: connected components of bush tiles.
  const bushId = new Int16Array(S * S).fill(-1);
  let nextBush = 0;
  for (let i = 0; i < S * S; i++) {
    if (map.tiles[i] !== TILE.BUSH || bushId[i] >= 0) continue;
    const q = [i];
    bushId[i] = nextBush;
    while (q.length) {
      const j = q.pop();
      const x = j % S, y = (j / S) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = (x + dx) + (y + dy) * S;
        if (map.get(x + dx, y + dy) === TILE.BUSH && bushId[n] < 0) { bushId[n] = nextBush; q.push(n); }
      }
    }
    nextBush++;
  }

  const teams = {
    blue: { ...BLUE, paths: {} },
    red: {
      fountain: mirror(BLUE.fountain),
      nexus: mirror(BLUE.nexus),
      towers: BLUE.towers.map(mirror),
      inhibitors: BLUE.inhibitors.map(mirror),
      camps: BLUE.camps.map(c => ({ ...mirror(c), id: `${c.id}R` })),
      paths: {},
    },
  };
  for (const lane of LANES) {
    teams.blue.paths[lane] = BLUE_PATHS[lane].map(([x, y]) => ({ x, y }));
    teams.red.paths[lane] = BLUE_PATHS[lane].map(([x, y]) => ({ x: y, y: x }));
  }
  // Decoration seeds for the renderer.
  void rng;
  return { map, size: S, teams, epic: EPIC, bushId, bushCount: nextBush };
}

let cached = null;
export function getRift() {
  if (!cached) cached = generateRift();
  return cached;
}

export function bushAt(rift, x, y) {
  const tx = Math.floor(x), ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= rift.size || ty >= rift.size) return -1;
  return rift.bushId[tx + ty * rift.size];
}
