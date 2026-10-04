/* Deterministic seeded RNG shared by server, client and tests. */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class RNG {
  constructor(seed = Date.now()) {
    this.seed = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
    this.next = mulberry32(this.seed);
  }
  float() { return this.next(); }
  range(min, max) { return min + this.next() * (max - min); }
  int(min, max) { return Math.floor(min + this.next() * (max - min + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  weighted(entries) {
    // entries: [[value, weight], ...]
    let total = 0;
    for (const [, w] of entries) total += w;
    let roll = this.next() * total;
    for (const [v, w] of entries) {
      roll -= w;
      if (roll <= 0) return v;
    }
    return entries[entries.length - 1][0];
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

export const sharedRng = new RNG((Date.now() ^ 0x5bd1e995) >>> 0);
