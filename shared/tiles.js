/* Tile map model, collision and line-of-sight shared by the server simulation
   and client-side movement prediction. 1 tile = 1 world unit. */
import { clamp } from './math.js';

export const TILE = {
  VOID: 0,
  WALL: 1,
  FLOOR: 2,
  ROAD: 3,
  GRASS: 4,
  WATER: 5,
  PLAZA: 6,
  BRIDGE: 7,
  TREE: 8,
  ROCK: 9,
  PILLAR: 10,
  SAND: 11,
  RUG: 12,
  RIVER: 13,
  BUSH: 14,
};

const WALKABLE = new Set([TILE.FLOOR, TILE.ROAD, TILE.GRASS, TILE.PLAZA, TILE.BRIDGE, TILE.SAND, TILE.RUG, TILE.RIVER, TILE.BUSH]);
// Water does not stop projectiles; walls, trees, rocks and pillars do.
const SHOOT_THROUGH = new Set([...WALKABLE, TILE.WATER]);

export function isWalkableTile(t) { return WALKABLE.has(t); }
export function isShootThroughTile(t) { return SHOOT_THROUGH.has(t); }

export class TileMap {
  constructor(w, h, tiles) {
    this.w = w;
    this.h = h;
    this.tiles = tiles || new Uint8Array(w * h);
  }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { return this.inBounds(x, y) ? this.tiles[y * this.w + x] : TILE.VOID; }
  set(x, y, t) { if (this.inBounds(x, y)) this.tiles[y * this.w + x] = t; }
  fill(x0, y0, x1, y1, t) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, t);
  }
  walkable(x, y) { return WALKABLE.has(this.get(x, y)); }
  shootable(x, y) { return SHOOT_THROUGH.has(this.get(x, y)); }
  walkableAt(px, py) { return this.walkable(Math.floor(px), Math.floor(py)); }
  toJSON() { return { w: this.w, h: this.h, tiles: encodeTiles(this.tiles) }; }
  static fromJSON(o) { return new TileMap(o.w, o.h, decodeTiles(o.tiles)); }
}

export function encodeTiles(bytes) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}

export function decodeTiles(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function circleBlocked(map, x, y, r) {
  const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
  const y0 = Math.floor(y - r), y1 = Math.floor(y + r);
  const r2 = r * r;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (map.walkable(tx, ty)) continue;
      const nx = clamp(x, tx, tx + 1);
      const ny = clamp(y, ty, ty + 1);
      if ((x - nx) * (x - nx) + (y - ny) * (y - ny) < r2) return true;
    }
  }
  return false;
}

/** Moves a circle {x, y, r} by (dx, dy) sliding along walls. Returns true if it collided. */
export function moveCircle(map, e, dx, dy) {
  const maxStep = Math.max(0.05, e.r * 0.5);
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / maxStep));
  const sx = dx / steps, sy = dy / steps;
  let hit = false;
  for (let i = 0; i < steps; i++) {
    if (sx !== 0) {
      if (!circleBlocked(map, e.x + sx, e.y, e.r)) e.x += sx; else hit = true;
    }
    if (sy !== 0) {
      if (!circleBlocked(map, e.x, e.y + sy, e.r)) e.y += sy; else hit = true;
    }
  }
  return hit;
}

/** True if a projectile could travel between the two points. */
export function lineOfSight(map, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  const steps = Math.ceil(len / 0.25);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (!map.shootable(Math.floor(ax + dx * t), Math.floor(ay + dy * t))) return false;
  }
  return true;
}

/** Furthest walkable point along a ray (used by blink/teleport). */
export function castWalk(map, x, y, angle, distance, r) {
  const step = 0.2;
  let cx = x, cy = y;
  for (let d = step; d <= distance; d += step) {
    const nx = x + Math.cos(angle) * d, ny = y + Math.sin(angle) * d;
    if (circleBlocked(map, nx, ny, r)) {
      if (!map.shootable(Math.floor(nx), Math.floor(ny))) break;
      continue; // hop over gaps such as water if there is ground behind it
    }
    cx = nx; cy = ny;
  }
  return [cx, cy];
}

/** Finds the nearest free spot to (x, y) for a circle of radius r. */
export function findFreeSpot(map, x, y, r, maxRadius = 6) {
  if (!circleBlocked(map, x, y, r)) return [x, y];
  for (let rad = 0.5; rad <= maxRadius; rad += 0.5) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const nx = x + Math.cos(a) * rad, ny = y + Math.sin(a) * rad;
      if (!circleBlocked(map, nx, ny, r)) return [nx, ny];
    }
  }
  return [x, y];
}
