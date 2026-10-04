/* Client-side mirror of the current instance, built from server snapshots. */
import { TileMap } from '../../shared/tiles.js';
import { F } from '../../shared/constants.js';

export class ClientWorld {
  constructor() {
    this.zone = null;
    this.map = null;
    this.entities = new Map();
    this.youId = null;
    this.me = null;
    this.meta = {};
    this.time = 0;
    this.listeners = { add: [], remove: [], fx: [] };
  }

  on(type, fn) { this.listeners[type].push(fn); }

  setZone(zone, youId) {
    for (const e of this.entities.values()) this.listeners.remove.forEach(fn => fn(e));
    this.entities.clear();
    this.zone = zone;
    this.map = TileMap.fromJSON(zone.map);
    this.youId = youId;
    this.me = null;
    this.meta = zone.meta || {};
  }

  you() { return this.entities.get(this.youId); }

  applySnapshot(s) {
    if (s.a) {
      for (const d of s.a) {
        const prev = this.entities.get(d.i);
        const e = {
          ...d,
          id: d.i,
          kind: d.k,
          tx: d.x, ty: d.y, tf: d.f,
          x: prev ? prev.x : d.x, y: prev ? prev.y : d.y, f: prev ? prev.f : d.f,
          hp: d.hp, fl: d.fl,
          born: performance.now(),
          moving: 0,
          view: prev ? prev.view : null,
        };
        if (prev) this.listeners.remove.forEach(fn => fn(prev, true));
        e.view = null;
        this.entities.set(d.i, e);
        this.listeners.add.forEach(fn => fn(e));
      }
    }
    if (s.u) {
      for (const [id, x, y, f, hp, fl] of s.u) {
        const e = this.entities.get(id);
        if (!e) continue;
        e.tx = x; e.ty = y; e.tf = f;
        if (hp < e.hp && e.kind !== 'loot') e.hitT = performance.now();
        e.hp = hp; e.fl = fl;
      }
    }
    if (s.r) {
      for (const id of s.r) {
        const e = this.entities.get(id);
        if (!e) continue;
        this.entities.delete(id);
        this.listeners.remove.forEach(fn => fn(e));
      }
    }
    if (s.me) this.me = s.me;
    if (s.fx) for (const ev of s.fx) this.listeners.fx.forEach(fn => fn(ev));
    this.time = s.time;
  }

  update(dt, predictedSelf) {
    const k = 1 - Math.exp(-dt * 14);
    for (const e of this.entities.values()) {
      if (e.kind === 'proj') {
        e.x += e.vx * dt; e.y += e.vy * dt;
        continue;
      }
      if (e.kind === 'aoe') {
        e.life -= dt;
        if (e.s === 'ring') e.rad = Math.min(e.mr, e.rad + e.sp * dt);
        continue;
      }
      if (e.id === this.youId && predictedSelf) {
        e.x = predictedSelf.x; e.y = predictedSelf.y;
        e.f = e.tf;
        e.moving = predictedSelf.moving;
        continue;
      }
      const dx = e.tx - e.x, dy = e.ty - e.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 36) { e.x = e.tx; e.y = e.ty; } else { e.x += dx * k; e.y += dy * k; }
      e.moving = Math.min(1, Math.sqrt(d2) * 6);
      let df = e.tf - e.f;
      while (df > Math.PI) df -= Math.PI * 2;
      while (df < -Math.PI) df += Math.PI * 2;
      e.f += df * Math.min(1, dt * 16);
    }
  }

  is(e, flag) { return (e.fl & flag) !== 0; }
  dead(e) { return (e.fl & F.DEAD) !== 0; }
  hostile(e) { return (e.fl & F.HOSTILE) !== 0; }
}
