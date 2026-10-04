/* Multi-source Dijkstra map toward the nearest player, so monsters can route
   around walls without per-monster A*. Limited to a radius around players. */
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export class FlowField {
  constructor(map, maxDist = 32) {
    this.map = map;
    this.maxDist = maxDist;
    this.dist = new Uint16Array(map.w * map.h);
    this.stamp = new Uint32Array(map.w * map.h);
    this.gen = 0;
    this.queue = new Int32Array(map.w * map.h);
  }

  rebuild(sources) {
    const { map, dist, stamp, queue } = this;
    this.gen++;
    const gen = this.gen;
    let head = 0, tail = 0;
    for (const s of sources) {
      const x = Math.floor(s.x), y = Math.floor(s.y);
      if (!map.inBounds(x, y)) continue;
      const i = x + y * map.w;
      if (stamp[i] === gen) continue;
      stamp[i] = gen; dist[i] = 0; queue[tail++] = i;
    }
    while (head < tail) {
      const i = queue[head++];
      const d = dist[i];
      if (d >= this.maxDist) continue;
      const x = i % map.w, y = (i - x) / map.w;
      for (let k = 0; k < 4; k++) {
        const nx = x + DIRS[k][0], ny = y + DIRS[k][1];
        if (!map.walkable(nx, ny)) continue;
        const ni = nx + ny * map.w;
        if (stamp[ni] === gen) continue;
        stamp[ni] = gen; dist[ni] = d + 1; queue[tail++] = ni;
      }
    }
  }

  valueAt(x, y) {
    const i = x + y * this.map.w;
    return this.stamp[i] === this.gen ? this.dist[i] : 65535;
  }

  /** Returns the centre of the best neighbouring tile to step toward, or null. */
  next(px, py) {
    const x = Math.floor(px), y = Math.floor(py);
    if (!this.map.inBounds(x, y)) return null;
    let best = this.valueAt(x, y), bx = -1, by = -1;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!this.map.walkable(nx, ny)) continue;
      if (dx && dy && (!this.map.walkable(x + dx, y) || !this.map.walkable(x, y + dy))) continue;
      const v = this.valueAt(nx, ny);
      if (v < best) { best = v; bx = nx; by = ny; }
    }
    return bx < 0 ? null : [bx + 0.5, by + 0.5];
  }
}
