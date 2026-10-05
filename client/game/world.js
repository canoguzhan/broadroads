/* Client-side mirror of the match, built from server snapshots. */
import { F } from '../../shared/constants.js';

// Other units are drawn this far in the past, interpolating between the last
// two server positions (snapshots arrive at 10 Hz).
const INTERP_DELAY = 110;
const now = () => performance.now();

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

  setMatch(valley, youId, team) {
    for (const e of this.entities.values()) this.listeners.remove.forEach(fn => fn(e));
    this.entities.clear();
    this.valley = valley;
    this.map = valley.map;
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
        const t = now();
        // Start the next leg from wherever the unit is drawn now (no backward jumps).
        e.p0 = { x: e.x, y: e.y, t: Math.max(e.p1 ? e.p1.t : 0, t - INTERP_DELAY) };
        e.p1 = { x: u[1], y: u[2], t };
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
    if (s.me) { this.me = { ...this.me, ...s.me }; if (s.me.dr) this.recap = s.me.dr; } // self state arrives as deltas // the death recap arrives once per death
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
      const ox = e.x, oy = e.y;
      const dx = e.tx - e.x, dy = e.ty - e.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 49) { e.x = e.tx; e.y = e.ty; e.p0 = e.p1 = null; } // blink / respawn: snap
      else if (e.id === this.youId) this.updateYou(e, dt, k);
      else if (e.p0 && e.p1) {
        const rt = now() - INTERP_DELAY;
        const a = e.p1.t > e.p0.t ? Math.max(0, Math.min(1, (rt - e.p0.t) / (e.p1.t - e.p0.t))) : 1;
        e.x = e.p0.x + (e.p1.x - e.p0.x) * a;
        e.y = e.p0.y + (e.p1.y - e.p0.y) * a;
      } else { e.x += dx * k; e.y += dy * k; }
      const step = Math.hypot(e.x - ox, e.y - oy);
      e.moving = Math.min(1, (dt > 0 ? step / dt : 0) * 0.35 + (e.id === this.youId ? 0 : Math.sqrt(d2) * 2));
      let df = e.tf - e.f;
      while (df > Math.PI) df -= Math.PI * 2;
      while (df < -Math.PI) df += Math.PI * 2;
      e.f += df * Math.min(1, dt * 16);
    }
  }

  /** Movement prediction: the client moves its own champion right away
      toward the clicked point (or joystick direction), then reconciles softly
      with the server's position (hard correction past 3 units). */
  predictMove(x, y) { this.predict = { x, y, until: now() + 1200 }; }
  predictDir(mx, my) { this.predict = mx || my ? { dx: mx, dy: my, until: now() + 250 } : null; }

  updateYou(e, dt, k) {
    const p = this.predict, me = this.me;
    const blocked = !me || me.dead || (e.fl & (F.STUN | F.ROOT | F.AIRBORNE | F.DEAD)) || (e.fl & 32768) || (e.fl & 512);
    if (p && !blocked && now() < p.until) {
      let dx, dy;
      if (p.dx !== undefined) { dx = p.dx; dy = p.dy; } else { dx = p.x - e.x; dy = p.y - e.y; }
      const d = Math.hypot(dx, dy);
      if (p.dx === undefined && d < 0.15) this.predict = null;
      else if (d > 0) {
        const stepLen = Math.min(p.dx === undefined ? d : Infinity, (me.st?.ms || 3.5) * dt);
        e.x += (dx / d) * stepLen; e.y += (dy / d) * stepLen;
        e.tf = Math.atan2(dy, dx);
      }
      // Soft pull toward the server so small differences (walls, paths) dissolve.
      const ex = e.tx - e.x, ey = e.ty - e.y;
      if (ex * ex + ey * ey > 9) { e.x += ex * k; e.y += ey * k; }
      else { const s = Math.min(1, dt * 2.5); e.x += ex * s; e.y += ey * s; }
      return;
    }
    if (p && now() >= p.until) this.predict = null;
    e.x += (e.tx - e.x) * k; e.y += (e.ty - e.y) * k;
  }

  dead(e) { return (e.fl & F.DEAD) !== 0; }
}
