/* Client-side mirror of the match, built from server snapshots. */
import { F } from '../../shared/constants.js';

export class ClientWorld {
  constructor() {
    this.entities = new Map();
    this.youId = null;
    this.team = null;
    this.me = null;
    this.score = null;
    this.time = 0;
    this.listeners = { add: [], remove: [], fx: [] };
  }

  on(type, fn) { this.listeners[type].push(fn); }

  setMatch(rift, youId, team) {
    for (const e of this.entities.values()) this.listeners.remove.forEach(fn => fn(e));
    this.entities.clear();
    this.rift = rift;
    this.map = rift.map;
    this.youId = youId;
    this.team = team;
    this.me = null;
  }

  you() { return this.entities.get(this.youId); }

  applySnapshot(s) {
    if (s.a) {
      for (const d of s.a) {
        const prev = this.entities.get(d.i);
        const e = { ...d, id: d.i, kind: d.k, tx: d.x, ty: d.y, tf: d.f, x: prev ? prev.x : d.x, y: prev ? prev.y : d.y, f: prev ? prev.f : d.f, moving: 0 };
        if (prev) this.listeners.remove.forEach(fn => fn(prev, true));
        this.entities.set(d.i, e);
        this.listeners.add.forEach(fn => fn(e));
      }
    }
    if (s.u) {
      for (const u of s.u) {
        const e = this.entities.get(u[0]);
        if (!e) continue;
        e.tx = u[1]; e.ty = u[2]; e.tf = u[3];
        if (u[4] < e.hp && e.kind !== 'proj') e.hitT = performance.now();
        e.hp = u[4]; e.fl = u[5];
        if (u.length > 6) e.mp = u[6];
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

  update(dt) {
    const k = 1 - Math.exp(-dt * 15);
    for (const e of this.entities.values()) {
      if (e.kind === 'proj') {
        if (e.h) {
          const t = this.entities.get(e.tg);
          if (t) {
            const dx = t.x - e.x, dy = t.y - e.y, d = Math.hypot(dx, dy);
            if (d > 0.05) { const step = Math.min(d, e.sp * dt); e.x += dx / d * step; e.y += dy / d * step; e.f = Math.atan2(dy, dx); }
          }
        } else { e.x += e.vx * dt; e.y += e.vy * dt; }
        continue;
      }
      if (e.kind === 'area') {
        e.life -= dt;
        if (e.fo) { const t = this.entities.get(e.fo); if (t) { e.x = t.x; e.y = t.y; } }
        continue;
      }
      const dx = e.tx - e.x, dy = e.ty - e.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 49) { e.x = e.tx; e.y = e.ty; } else { e.x += dx * k; e.y += dy * k; }
      e.moving = Math.min(1, Math.sqrt(d2) * 6);
      let df = e.tf - e.f;
      while (df > Math.PI) df -= Math.PI * 2;
      while (df < -Math.PI) df += Math.PI * 2;
      e.f += df * Math.min(1, dt * 16);
    }
  }

  dead(e) { return (e.fl & F.DEAD) !== 0; }
}
