/* A* on the tile grid (8-directional, no corner cutting) with string-pulling
   so units walk in straight lines where possible. */
import { circleBlocked } from '../tiles.js';

class Heap {
  constructor() { this.a = []; }
  push(n, f) {
    const a = this.a;
    a.push([f, n]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top[1];
  }
  get size() { return this.a.length; }
}

const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];

export class Pathfinder {
  constructor(map) {
    this.map = map;
    const n = map.w * map.h;
    this.g = new Float32Array(n);
    this.came = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.gen = 0;
    // Tiles too close to walls for a unit of radius ~0.6 to stand at the tile centre.
    this.tight = new Uint8Array(n);
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      if (!map.walkable(x, y)) { this.tight[x + y * map.w] = 2; continue; }
      if (circleBlocked(map, x + 0.5, y + 0.5, 0.55)) this.tight[x + y * map.w] = 1;
    }
  }

  nearestOpen(x, y) {
    const map = this.map;
    const tx = Math.floor(x), ty = Math.floor(y);
    if (map.walkable(tx, ty) && this.tight[tx + ty * map.w] === 0) return [tx, ty];
    for (let r = 1; r < 12; r++) {
      let best = null, bd = Infinity;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = tx + dx, ny = ty + dy;
        if (!map.walkable(nx, ny) || this.tight[nx + ny * map.w]) continue;
        const d = (nx + 0.5 - x) ** 2 + (ny + 0.5 - y) ** 2;
        if (d < bd) { bd = d; best = [nx, ny]; }
      }
      if (best) return best;
    }
    return null;
  }

  /** Returns a list of waypoints {x, y} from (sx, sy) to (tx, ty), or [] if unreachable. */
  find(sx, sy, tx, ty, radius = 0.6, maxNodes = 30000) {
    const map = this.map, W = map.w;
    if (this.walkLine(sx, sy, tx, ty, radius)) return [{ x: tx, y: ty }];
    const s = this.nearestOpen(sx, sy), t = this.nearestOpen(tx, ty);
    if (!s || !t) return [];
    const gen = ++this.gen;
    const start = s[0] + s[1] * W, goal = t[0] + t[1] * W;
    const heap = new Heap();
    const h = (x, y) => { const dx = Math.abs(x - t[0]), dy = Math.abs(y - t[1]); return Math.max(dx, dy) + 0.4142 * Math.min(dx, dy); };
    this.g[start] = 0; this.stamp[start] = gen; this.came[start] = -1;
    heap.push(start, h(s[0], s[1]));
    let found = false, expanded = 0;
    while (heap.size) {
      const cur = heap.pop();
      if (this.closed[cur] === gen) continue;
      this.closed[cur] = gen;
      if (cur === goal) { found = true; break; }
      if (++expanded > maxNodes) break;
      const cx = cur % W, cy = (cur - cx) / W;
      for (const [dx, dy, cost] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (!map.inBounds(nx, ny)) continue;
        const ni = nx + ny * W;
        if (this.tight[ni] === 2) continue;
        if (dx && dy && (this.tight[cx + dx + cy * W] === 2 || this.tight[cx + (cy + dy) * W] === 2)) continue;
        const ng = this.g[cur] + cost * (this.tight[ni] ? 3 : 1);
        if (this.stamp[ni] === gen && ng >= this.g[ni]) continue;
        this.stamp[ni] = gen; this.g[ni] = ng; this.came[ni] = cur;
        heap.push(ni, ng + h(nx, ny));
      }
    }
    if (!found) return [];
    const cells = [];
    for (let c = goal; c !== -1; c = this.came[c]) cells.push(c);
    cells.reverse();
    const pts = cells.map(c => ({ x: (c % W) + 0.5, y: Math.floor(c / W) + 0.5 }));
    pts[pts.length - 1] = { x: tx, y: ty };
    if (!map.walkableAt(tx, ty)) pts[pts.length - 1] = { x: t[0] + 0.5, y: t[1] + 0.5 };
    // String pulling.
    const out = [];
    let ax = sx, ay = sy, i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.walkLine(ax, ay, pts[j].x, pts[j].y, radius)) j--;
      out.push(pts[j]);
      ax = pts[j].x; ay = pts[j].y;
      i = j + 1;
    }
    return out;
  }

  walkLine(ax, ay, bx, by, radius) {
    const len = Math.hypot(bx - ax, by - ay);
    const steps = Math.ceil(len / 0.35);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (circleBlocked(this.map, ax + (bx - ax) * t, ay + (by - ay) * t, radius * 0.9)) return false;
    }
    return true;
  }
}
