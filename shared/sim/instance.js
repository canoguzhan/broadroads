/* Base simulation instance. World shards, dungeons and arenas extend this. */
import { RNG } from '../rng.js';
import { clamp, dist, dist2, normalize } from '../math.js';
import { moveCircle, findFreeSpot, circleBlocked } from '../tiles.js';
import { ARCHETYPES, computeStats } from '../classes.js';
import { MONSTERS, scaleMonster } from '../monsters.js';
import { generateItem, rollMaterial, rollRarity, INVENTORY_SIZE, MAX_POTIONS, RARITIES } from '../items.js';
import { F, OUT_OF_COMBAT, PVP_DAMAGE, PVP_HEAL, TICK, VIEW_RADIUS, PICKUP_RANGE, REVIVE_RANGE, REVIVE_TIME } from '../constants.js';
import { tryCast } from './abilities.js';
import { updateMonster } from './ai.js';
import { botThink } from './bot.js';
import { FlowField } from './flow.js';

const r2 = v => Math.round(v * 100) / 100;

export class Instance {
  constructor(hub, opts) {
    this.hub = hub;
    this.id = opts.id;
    this.kind = opts.kind;
    this.name = opts.name;
    this.map = opts.map;
    this.theme = opts.theme;
    this.decor = opts.decor || {};
    this.rng = new RNG(opts.seed ?? Math.floor(Math.random() * 2 ** 31));
    this.entities = new Map();
    this.sessions = new Set();
    this.fx = [];
    this.time = 0;
    this.nextId = 1;
    this.allowPotions = true;
    this.viewRadius = VIEW_RADIUS;
    this.flow = new FlowField(this.map);
    this.flowTimer = 0;
    this.emptySince = null;
    this.closed = false;
  }

  /* ---------- bookkeeping ---------- */
  newId() { return this.nextId++; }
  add(e) { e.id = e.id || this.newId(); e.ver = 1; this.entities.set(e.id, e); return e; }
  remove(e) { this.entities.delete(e.id); e.removed = true; }
  get(id) { return this.entities.get(id); }
  emit(ev) { this.fx.push(ev); }
  *combatants() {
    for (const e of this.entities.values()) if (e.kind === 'player' || e.kind === 'monster') yield e;
  }
  players() {
    const out = [];
    for (const e of this.entities.values()) if (e.kind === 'player') out.push(e);
    return out;
  }
  humanPlayers() { return this.players().filter(p => p.session); }

  zoneInfo() {
    return {
      id: this.id,
      kind: this.kind,
      name: this.name,
      theme: this.theme,
      map: this.map.toJSON(),
      decor: this.decor,
      meta: this.meta(),
    };
  }
  meta() { return {}; }

  /* ---------- rules (overridden by subclasses) ---------- */
  hostile(a, b) {
    if (!a || !b || a === b || a.id === b.id) return false;
    if (a.team === b.team) return false;
    if (a.kind === 'player' && b.kind === 'player') return this.pvpAllowed(a, b);
    return true;
  }
  pvpAllowed() { return false; }
  combatAllowed() { return true; }
  onPlayerDeath() {}
  onMonsterDeath() {}
  onUpdate() {}
  onInteract() {}
  respawnDelay() { return 5; }

  /* ---------- players ---------- */
  createPlayer(session, x, y, team = 'players') {
    const char = session.char;
    const stats = computeStats(char);
    const [sx, sy] = findFreeSpot(this.map, x, y, ARCHETYPES[char.cls].radius);
    const p = this.add({
      kind: 'player',
      name: char.name,
      cls: char.cls,
      level: char.level,
      char,
      session,
      x: sx, y: sy,
      r: ARCHETYPES[char.cls].radius,
      facing: 0,
      team,
      stats,
      hp: stats.maxHp,
      mp: stats.maxMp,
      cd: { primary: 0, dash: 0, q: 0, e: 0, r: 0 },
      potCd: 0,
      buffs: [],
      input: { mx: 0, my: 0, ax: sx + 1, ay: sy, attack: false },
      inputQueue: [],
      lastSeq: 0,
      dashT: 0, dashVx: 0, dashVy: 0,
      kx: 0, ky: 0,
      dead: false,
      deadT: 0,
      lastHitT: -99,
      revive: 0,
      bot: null,
      kills: 0, deaths: 0, damageDone: 0,
    });
    if (session) {
      session.ent = p;
      session.instance = this;
      session.known = new Map();
    }
    return p;
  }

  addSession(session, x, y, team) {
    this.sessions.add(session);
    this.emptySince = null;
    const p = this.createPlayer(session, x, y, team);
    session.send({ t: 'zone', zone: this.zoneInfo(), you: p.id });
    this.onJoin(p);
    return p;
  }
  onJoin() {}

  removeSession(session) {
    this.sessions.delete(session);
    const p = session.ent;
    if (p && this.entities.get(p.id) === p) {
      this.onLeave(p);
      this.remove(p);
    }
    for (const e of this.entities.values()) if (e.kind === 'loot' && e.owner === p?.id) this.remove(e);
    session.ent = null;
    session.instance = null;
    if (this.sessions.size === 0) this.emptySince = this.time;
  }
  onLeave() {}

  refreshPlayerStats(p) {
    const hpPct = p.hp / p.stats.maxHp;
    p.stats = computeStats(p.char);
    p.level = p.char.level;
    p.cls = p.char.cls;
    p.hp = Math.max(1, Math.round(p.stats.maxHp * hpPct));
    p.mp = Math.min(p.mp, p.stats.maxMp);
    p.ver++;
  }

  revivePlayer(p, x, y, hpPct = 1) {
    p.dead = false;
    p.hp = Math.round(p.stats.maxHp * hpPct);
    p.mp = Math.max(p.mp, p.stats.maxMp * hpPct);
    p.buffs = [];
    p.revive = 0;
    p.dashT = 0; p.kx = 0; p.ky = 0;
    if (x !== undefined) {
      const [fx, fy] = findFreeSpot(this.map, x, y, p.r);
      p.x = fx; p.y = fy;
    }
    p.inputQueue.length = 0;
    this.emit({ e: 'revive', id: p.id, x: p.x, y: p.y });
  }

  teleport(p, x, y) {
    const [fx, fy] = findFreeSpot(this.map, x, y, p.r);
    p.x = fx; p.y = fy;
    p.inputQueue.length = 0;
    p.dashT = 0;
    if (p.session) p.session.send({ t: 'tp', x: fx, y: fy });
  }

  markCharDirty(p) { if (p.session) p.session.charDirty = true; }

  /* ---------- buffs ---------- */
  addBuff(e, k, t, v = 0) {
    if (e.dead) return;
    if ((k === 'stun' || k === 'slow') && this.hasBuff(e, 'invuln')) return;
    if (k === 'stun' && e.boss) t *= 0.3;
    const b = e.buffs.find(x => x.k === k);
    if (b) { b.t = Math.max(b.t, t); b.v = Math.max(b.v, v); } else e.buffs.push({ k, t, v });
  }
  hasBuff(e, k) { return e.buffs.some(b => b.k === k); }
  buffVal(e, k) { const b = e.buffs.find(x => x.k === k); return b ? b.v : 0; }

  knockback(e, vx, vy) {
    if (e.boss || e.dead) return;
    const scale = e.kind === 'monster' && e.def.ai === 'brute' ? 0.5 : 1;
    e.kx += vx * scale; e.ky += vy * scale;
  }

  /* ---------- combat ---------- */
  damage(src, tgt, amount, opts = {}) {
    if (!tgt || tgt.dead || this.hasBuff(tgt, 'invuln')) return 0;
    if (src && !this.hostile(src, tgt)) return 0;
    if (tgt.kind === 'player' && !this.combatAllowed(tgt)) return 0;
    const armor = tgt.kind === 'player' ? tgt.stats.armor : tgt.armor;
    const lvl = src ? src.level || 1 : 1;
    let dmg = amount * (1 - armor / (armor + 40 + 6 * lvl));
    if (this.hasBuff(tgt, 'guard')) dmg *= 0.5;
    if (src && src.kind === 'player' && tgt.kind === 'player') dmg *= PVP_DAMAGE;
    dmg = Math.max(1, Math.round(dmg));
    tgt.hp -= dmg;
    tgt.lastHitT = this.time;
    if (src) {
      src.lastHitT = this.time;
      if (src.kind === 'player') {
        src.damageDone += dmg;
        if (src.stats.lifesteal > 0) this.heal(src, src, dmg * src.stats.lifesteal, { quiet: true });
      }
    }
    if (tgt.kind === 'monster' && src) {
      const owner = src.kind === 'player' ? src : null;
      if (owner) tgt.dmgBy.set(owner.id, (tgt.dmgBy.get(owner.id) || 0) + dmg);
      if (!tgt.target || (!tgt.tauntT && this.rng.chance(0.08))) tgt.target = src.id;
    }
    this.emit({ e: 'dmg', id: tgt.id, v: dmg, c: opts.crit ? 1 : 0, x: tgt.x, y: tgt.y, s: src ? src.id : 0 });
    if (tgt.hp <= 0) {
      tgt.hp = 0;
      this.kill(tgt, src);
    }
    return dmg;
  }

  heal(src, tgt, amount, opts = {}) {
    if (!tgt || tgt.dead) return 0;
    const max = tgt.kind === 'player' ? tgt.stats.maxHp : tgt.maxHp;
    if (src && src !== tgt && src.kind === 'player' && this.kind === 'arena') amount *= PVP_HEAL;
    const before = tgt.hp;
    tgt.hp = Math.min(max, tgt.hp + amount);
    const v = Math.round(tgt.hp - before);
    if (v > 0 && !opts.quiet) this.emit({ e: 'heal', id: tgt.id, v, x: tgt.x, y: tgt.y });
    return v;
  }

  kill(tgt, src) {
    tgt.dead = true;
    tgt.deadT = this.time;
    tgt.buffs = [];
    tgt.dashT = 0;
    this.emit({ e: 'death', id: tgt.id, x: tgt.x, y: tgt.y, k: tgt.kind });
    if (tgt.kind === 'monster') {
      this.rewardKill(tgt, src);
      this.onMonsterDeath(tgt, src);
    } else if (tgt.kind === 'player') {
      tgt.deaths++;
      tgt.revive = 0;
      const killer = src && src.kind === 'player' ? src : null;
      if (killer && killer !== tgt) killer.kills++;
      this.onPlayerDeath(tgt, src);
    }
  }

  /* ---------- monsters ---------- */
  spawnMonster(type, level, x, y, opts = {}) {
    const def = MONSTERS[type];
    if (!def) throw new Error(`unknown monster ${type}`);
    const sc = scaleMonster(def, level, { elite: opts.elite, playerCount: opts.playerCount || 1 });
    const r = def.r * (opts.elite ? 1.25 : 1);
    const [sx, sy] = findFreeSpot(this.map, x, y, r);
    return this.add({
      kind: 'monster',
      type,
      def,
      name: (opts.elite ? 'Elite ' : '') + def.name,
      level,
      elite: !!opts.elite,
      boss: !!def.boss,
      x: sx, y: sy, r,
      facing: this.rng.range(-Math.PI, Math.PI),
      team: 'monsters',
      hp: sc.maxHp, maxHp: sc.maxHp,
      dmg: sc.dmg, armor: sc.armor, xp: sc.xp, gold: sc.gold,
      speed: def.speed,
      home: { x: sx, y: sy },
      target: null,
      tauntT: 0,
      atkT: this.rng.range(0.3, 1.0),
      specialT: 3,
      summonT: def.summonCd || 0,
      windupT: 0,
      windup: null,
      wanderT: this.rng.range(1, 4),
      wx: sx, wy: sy,
      buffs: [],
      kx: 0, ky: 0,
      dmgBy: new Map(),
      dead: false,
      deadT: 0,
      summoned: !!opts.summoned,
      spawnRef: opts.spawnRef || null,
      patternIdx: 0,
    });
  }

  rewardKill(m, src) {
    const eligible = [];
    for (const p of this.players()) {
      if (!p.char || !p.session) continue;
      if (m.dmgBy.has(p.id) || dist(p.x, p.y, m.x, m.y) < 30) eligible.push(p);
    }
    if (!eligible.length && src && src.kind === 'player') eligible.push(src);
    const share = eligible.length > 1 ? 0.75 : 1;
    for (const p of eligible) {
      const diff = p.level - m.level;
      const penalty = diff > 5 ? Math.max(0.1, 1 - 0.15 * (diff - 5)) : 1;
      const xp = Math.max(1, Math.round(m.xp * share * penalty * (m.summoned ? 0.3 : 1)));
      const gold = Math.round(m.gold * this.rng.range(0.8, 1.2) * (m.summoned ? 0.3 : 1));
      this.hub.grantXp(p, xp);
      this.hub.grantGold(p, gold);
      p.char.stats.kills++;
      if (m.boss) p.char.stats.bossKills++;
      this.emit({ e: 'reward', id: p.id, to: p.id, xp, gold, x: m.x, y: m.y });
      if (!m.summoned) this.rollLoot(p, m);
    }
  }

  rollLoot(p, m) {
    const luck = (this.lootLuck || 0) + (m.elite ? 2 : 0) + (m.boss ? 4 : 0);
    const drops = [];
    const itemChance = m.boss ? 1 : m.elite ? 0.6 : 0.11;
    const itemCount = m.boss ? (m.def.worldBoss ? 3 : 2) : 1;
    for (let i = 0; i < itemCount; i++) {
      if (this.rng.chance(itemChance)) {
        const rarity = rollRarity(this.rng, luck);
        drops.push({ type: 'item', item: generateItem(this.rng, { ilvl: m.level, rarity, cls: p.cls }) });
      }
    }
    if (this.rng.chance(m.boss ? 1 : m.elite ? 0.7 : 0.22)) {
      drops.push({ type: 'mat', mat: rollMaterial(this.rng, luck), n: m.boss ? 4 : m.elite ? 2 : 1 });
    }
    if (this.rng.chance(m.boss ? 1 : 0.05)) drops.push({ type: 'potion', pot: this.rng.chance(0.6) ? 'hp' : 'mp', n: 1 });
    drops.forEach((d, i) => this.dropLoot(p, m.x, m.y, d, i));
  }

  dropLoot(owner, x, y, loot, i = 0) {
    const a = this.rng.range(0, Math.PI * 2);
    const rr = 0.6 + i * 0.35;
    let lx = x + Math.cos(a) * rr, ly = y + Math.sin(a) * rr;
    if (circleBlocked(this.map, lx, ly, 0.2)) { lx = x; ly = y; }
    return this.add({ kind: 'loot', owner: owner.id, x: lx, y: ly, r: 0.3, facing: 0, loot, life: 90, warned: false });
  }

  /* ---------- projectiles & AoE ---------- */
  spawnProjectile(src, o) {
    const speed = o.speed;
    const r = o.r || 0.25;
    const sx = src.x + Math.cos(o.angle) * (src.r * 0.6);
    const sy = src.y + Math.sin(o.angle) * (src.r * 0.6);
    const dmg = o.dmg !== undefined ? { amount: o.dmg, crit: false } : null;
    return this.add({
      kind: 'proj',
      style: o.style,
      owner: src.id,
      ownerRef: src,
      team: src.team,
      x: sx, y: sy, r,
      facing: o.angle,
      vx: Math.cos(o.angle) * speed,
      vy: Math.sin(o.angle) * speed,
      life: o.range / speed,
      dmgMult: o.dmgMult || 1,
      fixed: dmg,
      pierce: !!o.pierce,
      chain: o.chain || 0,
      splash: o.splash || 0,
      slow: o.slow || 0,
      hit: new Set(),
    });
  }

  spawnAoe(src, o) {
    return this.add({
      kind: 'aoe',
      style: o.style,
      owner: src ? src.id : 0,
      ownerRef: src,
      team: src ? src.team : 'monsters',
      x: o.x, y: o.y, r: o.radius,
      facing: 0,
      radius: o.radius,
      life: o.life,
      maxLife: o.life,
      tickEvery: o.tickEvery || 0,
      tickT: o.tickEvery || 0,
      dmgMult: o.dmgMult || 0,
      fixed: o.dmg || 0,
      pull: o.pull || 0,
      speed: o.speed || 0,
      maxRadius: o.maxRadius || o.radius,
      hit: new Set(),
      slow: o.slow || 0,
      stun: o.stun || 0,
    });
  }

  updateProjectile(pr, dt) {
    const total = Math.hypot(pr.vx, pr.vy) * dt;
    const steps = Math.max(1, Math.ceil(total / 0.35));
    const sx = pr.vx * dt / steps, sy = pr.vy * dt / steps;
    for (let s = 0; s < steps; s++) {
      pr.x += sx; pr.y += sy;
      if (!this.map.shootable(Math.floor(pr.x), Math.floor(pr.y))) { this.endProjectile(pr); return; }
      for (const e of this.combatants()) {
        if (e.dead || pr.hit.has(e.id)) continue;
        if (!this.hostile(pr.ownerRef, e)) continue;
        if (dist2(pr.x, pr.y, e.x, e.y) > (e.r + pr.r) ** 2) continue;
        pr.hit.add(e.id);
        this.projectileHit(pr, e);
        if (!pr.pierce) { this.endProjectile(pr, true); return; }
      }
    }
    pr.life -= dt;
    if (pr.life <= 0) this.endProjectile(pr);
  }

  projectileHit(pr, e) {
    const src = pr.ownerRef;
    let amount, crit = false;
    if (pr.fixed) amount = pr.fixed.amount;
    else if (src.stats) {
      crit = Math.random() < src.stats.crit;
      amount = src.stats.atk * pr.dmgMult * (0.9 + Math.random() * 0.2) * (crit ? src.stats.critMult : 1);
    } else amount = src.dmg * pr.dmgMult;
    this.damage(src, e, amount, { crit });
    if (pr.slow) this.addBuff(e, 'slow', 1.5, pr.slow);
    if (pr.chain > 0) {
      let best = null, bd = 5 * 5;
      for (const o of this.combatants()) {
        if (o.dead || o === e || pr.hit.has(o.id) || !this.hostile(src, o)) continue;
        const d = dist2(e.x, e.y, o.x, o.y);
        if (d < bd) { bd = d; best = o; }
      }
      if (best) {
        this.damage(src, best, amount * 0.6, {});
        this.emit({ e: 'chain', x: e.x, y: e.y, x2: best.x, y2: best.y });
      }
    }
  }

  endProjectile(pr, hitSomething = false) {
    if (pr.splash) {
      for (const e of this.combatants()) {
        if (e.dead || pr.hit.has(e.id) || !this.hostile(pr.ownerRef, e)) continue;
        if (dist(pr.x, pr.y, e.x, e.y) <= pr.splash + e.r) this.projectileHit({ ...pr, chain: 0, splash: 0 }, e);
      }
    }
    this.emit({ e: 'impact', x: pr.x, y: pr.y, s: pr.style, h: hitSomething ? 1 : 0 });
    this.remove(pr);
  }

  aoeDamage(aoe, x, y, radius, mult) {
    const src = aoe.ownerRef;
    for (const e of this.combatants()) {
      if (e.dead || !this.hostile(src, e)) continue;
      if (dist(x, y, e.x, e.y) > radius + e.r) continue;
      let amount = aoe.fixed;
      let crit = false;
      if (!amount && src && src.stats) {
        crit = Math.random() < src.stats.crit;
        amount = src.stats.atk * mult * (crit ? src.stats.critMult : 1);
      } else if (!amount && src) amount = src.dmg * mult;
      this.damage(src, e, amount, { crit });
      if (aoe.slow) this.addBuff(e, 'slow', 2, aoe.slow);
      if (aoe.stun) this.addBuff(e, 'stun', aoe.stun);
    }
  }

  updateAoe(a, dt) {
    a.life -= dt;
    const src = a.ownerRef;
    if (a.style === 'vortex') {
      for (const e of this.combatants()) {
        if (e.dead || !this.hostile(src, e) || e.boss) continue;
        const d = dist(a.x, a.y, e.x, e.y);
        if (d < a.radius + e.r && d > 0.4) {
          const [nx, ny] = normalize(a.x - e.x, a.y - e.y);
          moveCircle(this.map, e, nx * a.pull * dt, ny * a.pull * dt);
        }
      }
    }
    if (a.tickEvery) {
      a.tickT -= dt;
      while (a.tickT <= 0 && a.life > -dt) {
        a.tickT += a.tickEvery;
        if (a.style === 'barrage') {
          const ang = this.rng.range(0, Math.PI * 2), rr = Math.sqrt(this.rng.float()) * a.radius;
          const ix = a.x + Math.cos(ang) * rr, iy = a.y + Math.sin(ang) * rr;
          this.aoeDamage(a, ix, iy, 1.6, a.dmgMult);
          this.emit({ e: 'boom', x: ix, y: iy, r: 1.6 });
        } else {
          this.aoeDamage(a, a.x, a.y, a.radius, a.dmgMult);
        }
      }
    }
    if (a.style === 'ring') {
      // Expanding shockwave ring: hits targets as the edge passes over them.
      a.radius = Math.min(a.maxRadius, a.radius + a.speed * dt);
      for (const e of this.combatants()) {
        if (e.dead || a.hit.has(e.id) || !this.hostile(src, e)) continue;
        const d = dist(a.x, a.y, e.x, e.y);
        if (Math.abs(d - a.radius) < 0.7 + e.r) {
          a.hit.add(e.id);
          this.damage(src, e, a.fixed || (src ? src.dmg : 10), {});
        }
      }
      if (a.radius >= a.maxRadius) a.life = 0;
    }
    if (a.life <= 0) {
      if (a.style === 'telegraph') {
        this.aoeDamage(a, a.x, a.y, a.radius, a.dmgMult || 1);
        this.emit({ e: 'boom', x: a.x, y: a.y, r: a.radius, big: 1 });
      }
      this.remove(a);
    }
  }

  /* ---------- per-tick update ---------- */
  applyInput(p, inp, dt) {
    p.input.mx = inp.mx; p.input.my = inp.my;
    if (Number.isFinite(inp.ax)) { p.input.ax = inp.ax; p.input.ay = inp.ay; }
    p.input.attack = !!inp.attack;
    if (inp.seq) p.lastSeq = inp.seq;
    if (p.dead || p.dashT > 0 || this.hasBuff(p, 'stun')) return;
    const [mx, my] = normalize(inp.mx, inp.my);
    if (!mx && !my) return;
    moveCircle(this.map, p, mx * this.moveSpeed(p) * dt, my * this.moveSpeed(p) * dt);
  }

  moveSpeed(e) {
    let s = e.kind === 'player' ? e.stats.speed : e.speed;
    if (this.hasBuff(e, 'slow')) s *= 1 - this.buffVal(e, 'slow');
    if (this.hasBuff(e, 'guard')) s *= 0.8;
    return s;
  }

  updatePlayer(p, dt) {
    if (p.bot) {
      botThink(this, p, dt);
      this.applyInput(p, p.input, dt);
    } else {
      // Consume buffered inputs: one per tick, catching up if the client is ahead.
      const q = p.inputQueue;
      const n = q.length > 6 ? q.length - 2 : q.length > 1 ? 2 : q.length;
      for (let i = 0; i < n; i++) this.applyInput(p, q.shift(), dt);
    }
    for (const k in p.cd) if (p.cd[k] > 0) p.cd[k] = Math.max(0, p.cd[k] - dt);
    if (p.potCd > 0) p.potCd = Math.max(0, p.potCd - dt);
    if (p.dead) return;
    if (p.dashT > 0) {
      const step = Math.min(dt, p.dashT);
      moveCircle(this.map, p, p.dashVx * step, p.dashVy * step);
      p.dashT -= step;
    }
    if (p.input.ax !== undefined && !p.dashT) p.facing = Math.atan2(p.input.ay - p.y, p.input.ax - p.x);
    if (p.input.attack && p.cd.primary <= 0) tryCast(this, p, 'primary', p.input.ax, p.input.ay);

    // Regeneration: fast out of combat, slow in combat.
    const ooc = this.time - p.lastHitT > OUT_OF_COMBAT;
    const hpRegen = (ooc ? p.stats.maxHp * 0.04 : p.stats.maxHp * 0.004) + p.stats.regen;
    p.hp = Math.min(p.stats.maxHp, p.hp + hpRegen * dt);
    p.mp = Math.min(p.stats.maxMp, p.mp + (3 + p.stats.maxMp * (ooc ? 0.05 : 0.02)) * dt);

    // Loot pickup.
    for (const l of this.entities.values()) {
      if (l.kind !== 'loot' || l.owner !== p.id) continue;
      if (dist2(p.x, p.y, l.x, l.y) > PICKUP_RANGE * PICKUP_RANGE) continue;
      this.pickup(p, l);
    }
  }

  pickup(p, l) {
    const c = p.char;
    const loot = l.loot;
    if (loot.type === 'item') {
      if (c.inventory.length >= INVENTORY_SIZE) {
        if (!l.warned) { l.warned = true; this.hub.notice(p.session, 'Inventory full!', 'warn'); }
        return;
      }
      c.inventory.push(loot.item);
      this.emit({ e: 'pickup', to: p.id, id: p.id, x: l.x, y: l.y, n: loot.item.name, ra: loot.item.rarity });
    } else if (loot.type === 'mat') {
      c.materials[loot.mat] = (c.materials[loot.mat] || 0) + loot.n;
      this.emit({ e: 'pickup', to: p.id, id: p.id, x: l.x, y: l.y, n: `${loot.n}× ${loot.mat}`, ra: 'mat' });
    } else if (loot.type === 'potion') {
      c.potions[loot.pot] = Math.min(MAX_POTIONS, (c.potions[loot.pot] || 0) + loot.n);
      this.emit({ e: 'pickup', to: p.id, id: p.id, x: l.x, y: l.y, n: loot.pot === 'hp' ? 'Health Potion' : 'Mana Potion', ra: 'potion' });
    }
    this.markCharDirty(p);
    this.remove(l);
  }

  updateBuffs(e, dt) {
    if (!e.buffs.length) return;
    for (const b of e.buffs) b.t -= dt;
    e.buffs = e.buffs.filter(b => b.t > 0);
  }

  updateKnockback(e, dt) {
    if (!e.kx && !e.ky) return;
    moveCircle(this.map, e, e.kx * dt, e.ky * dt);
    const decay = Math.pow(0.002, dt);
    e.kx *= decay; e.ky *= decay;
    if (Math.abs(e.kx) < 0.05 && Math.abs(e.ky) < 0.05) { e.kx = 0; e.ky = 0; }
  }

  updateRevives(dt) {
    // Downed allies are revived by standing next to them (co-op revive circle).
    for (const p of this.players()) {
      if (!p.dead || !this.allowRevive) continue;
      const helper = this.players().find(o => !o.dead && o !== p && !this.hostile(o, p) && dist(o.x, o.y, p.x, p.y) <= REVIVE_RANGE);
      if (helper) {
        p.revive += dt;
        if (p.revive >= REVIVE_TIME) {
          this.revivePlayer(p, p.x, p.y, 0.5);
          this.hub.notice(p.session, `${helper.name} revived you!`, 'good');
        }
      } else if (p.revive > 0) p.revive = Math.max(0, p.revive - dt * 0.5);
    }
  }

  update(dt) {
    this.time += dt;
    this.flowTimer -= dt;
    if (this.flowTimer <= 0) {
      this.flowTimer = 0.3;
      this.flow.rebuild(this.players().filter(p => !p.dead && this.combatAllowed(p)));
    }
    for (const e of [...this.entities.values()]) {
      if (e.removed) continue;
      switch (e.kind) {
        case 'player':
          this.updatePlayer(e, dt);
          break;
        case 'monster':
          if (!e.dead) updateMonster(this, e, dt);
          else if (this.time - e.deadT > 2) this.remove(e);
          break;
        case 'proj':
          this.updateProjectile(e, dt);
          continue;
        case 'aoe':
          this.updateAoe(e, dt);
          continue;
        case 'loot':
          e.life -= dt;
          if (e.life <= 0) this.remove(e);
          continue;
        default:
          continue;
      }
      if (!e.removed && !e.dead) {
        this.updateBuffs(e, dt);
        this.updateKnockback(e, dt);
        if (e.tauntT > 0) e.tauntT -= dt;
      }
    }
    this.updateRevives(dt);
    this.onUpdate(dt);
  }

  /* ---------- networking ---------- */
  flagsFor(e, viewer) {
    let f = 0;
    if (e.dead) f |= F.DEAD;
    if (e.buffs) {
      for (const b of e.buffs) {
        if (b.k === 'stun') f |= F.STUN;
        else if (b.k === 'slow') f |= F.SLOW;
        else if (b.k === 'guard') f |= F.GUARD;
        else if (b.k === 'invuln') f |= F.INVULN;
      }
    }
    if (e.dashT > 0) f |= F.DASH;
    if (e.windupT > 0) f |= F.WINDUP;
    if (e.kind === 'player' && (e.bot || !e.session)) f |= F.BOT;
    if (viewer && (e.kind === 'player' || e.kind === 'monster' || e.kind === 'aoe' || e.kind === 'proj')) {
      const ref = e.kind === 'aoe' || e.kind === 'proj' ? (e.ownerRef || { team: e.team, kind: 'monster' }) : e;
      if (this.hostile(viewer, ref)) f |= F.HOSTILE;
    }
    if (e.open) f |= F.OPEN;
    if (e.revive > 0) f |= F.REVIVING;
    if (viewer && e.kind === 'player' && e !== viewer && viewer.session && e.session && viewer.session.partyId && viewer.session.partyId === e.session.partyId) f |= F.PARTY;
    return f;
  }

  describe(e) {
    const base = { i: e.id, k: e.kind, x: r2(e.x), y: r2(e.y), f: r2(e.facing), r: e.r };
    switch (e.kind) {
      case 'player':
        return { ...base, n: e.name, c: e.cls, l: e.level, mh: e.stats.maxHp, tm: e.team, eq: gearLook(e.char) };
      case 'monster':
        return { ...base, t: e.type, n: e.name, l: e.level, mh: e.maxHp, el: e.elite ? 1 : 0, b: e.boss ? 1 : 0 };
      case 'proj':
        return { ...base, s: e.style, vx: r2(e.vx), vy: r2(e.vy), o: e.owner };
      case 'aoe':
        return { ...base, s: e.style, rad: e.radius, life: r2(e.life), ml: e.maxLife, o: e.owner, mr: e.maxRadius, sp: e.speed };
      case 'loot': {
        const l = e.loot;
        if (l.type === 'item') return { ...base, lt: 'item', ra: l.item.rarity, ic: l.item.icon, n: l.item.name };
        if (l.type === 'mat') return { ...base, lt: 'mat', ra: 'mat', m: l.mat, n: l.mat };
        return { ...base, lt: 'potion', ra: 'potion', m: l.pot, n: l.pot === 'hp' ? 'Health Potion' : 'Mana Potion' };
      }
      case 'npc':
        return { ...base, t: e.type, n: e.name, ti: e.title, ic: e.icon, col: e.color };
      case 'portal':
        return { ...base, t: e.type, n: e.label };
      case 'chest':
        return { ...base };
      default:
        return base;
    }
  }

  visibleTo(e, viewer) {
    if (e.kind === 'loot') return e.owner === viewer.id;
    return true;
  }

  snapshotFor(session) {
    const me = session.ent;
    if (!me) return null;
    const known = session.known;
    const add = [], upd = [], seen = new Set();
    const vr2 = this.viewRadius * this.viewRadius;
    for (const e of this.entities.values()) {
      if (!this.visibleTo(e, me)) continue;
      if (e !== me && e.kind !== 'npc' && e.kind !== 'portal' && dist2(e.x, e.y, me.x, me.y) > vr2) continue;
      seen.add(e.id);
      const hp = e.kind === 'player' || e.kind === 'monster' ? Math.ceil(e.hp) : 0;
      const flags = this.flagsFor(e, me);
      const k = known.get(e.id);
      if (!k || k.ver !== e.ver) {
        const d = this.describe(e);
        d.hp = hp; d.fl = flags;
        add.push(d);
        known.set(e.id, { ver: e.ver, x: e.x, y: e.y, f: e.facing, hp, fl: flags });
        continue;
      }
      if (e.kind === 'proj') continue; // clients extrapolate projectiles
      if (k.x !== e.x || k.y !== e.y || k.f !== e.facing || k.hp !== hp || k.fl !== flags) {
        upd.push([e.id, r2(e.x), r2(e.y), r2(e.facing), hp, flags]);
        k.x = e.x; k.y = e.y; k.f = e.facing; k.hp = hp; k.fl = flags;
      }
    }
    const rem = [];
    for (const id of known.keys()) if (!seen.has(id)) { rem.push(id); known.delete(id); }

    const fx = [];
    for (const ev of this.fx) {
      if (ev.to !== undefined && ev.to !== me.id) continue;
      if (ev.x !== undefined && dist2(ev.x, ev.y, me.x, me.y) > vr2) continue;
      fx.push(ev);
    }
    const snap = { t: 's', time: r2(this.time), me: this.selfState(me) };
    if (add.length) snap.a = add;
    if (upd.length) snap.u = upd;
    if (rem.length) snap.r = rem;
    if (fx.length) snap.fx = fx;
    return snap;
  }

  selfState(p) {
    return {
      id: p.id,
      hp: Math.ceil(p.hp), mhp: p.stats.maxHp,
      mp: Math.floor(p.mp), mmp: p.stats.maxMp,
      cd: [p.cd.primary, p.cd.dash, p.cd.q, p.cd.e, p.cd.r].map(r2),
      pot: r2(p.potCd),
      spd: r2(this.moveSpeed(p)),
      ack: p.lastSeq,
      x: r2(p.x), y: r2(p.y),
      dead: p.dead ? 1 : 0,
      rt: p.dead ? r2(Math.max(0, (p.respawnAt || 0) - this.time)) : 0,
      rv: r2(p.revive),
      dash: p.dashT > 0 ? 1 : 0,
      st: this.hasBuff(p, 'stun') ? 1 : 0,
      safe: this.combatAllowed(p) ? 0 : 1,
      b: p.buffs.map(b => [b.k, r2(b.t)]),
    };
  }

  flushFx() { this.fx.length = 0; }
}

function gearLook(char) {
  const out = {};
  if (!char) return out;
  for (const [slot, it] of Object.entries(char.equipment || {})) if (it) out[slot] = it.rarity;
  return out;
}

export function rarityColor(r) { return (RARITIES[r] || RARITIES.common).color; }
export { TICK, clamp };
