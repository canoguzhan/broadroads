/* Monster and boss AI. */
import { dist, normalize } from '../math.js';
import { moveCircle, lineOfSight } from '../tiles.js';

const LEASH = 24;

function validTarget(inst, m, t) {
  return t && !t.dead && !t.removed && inst.hostile(m, t) && inst.combatAllowed(t);
}

function acquireTarget(inst, m) {
  let best = null, bd = Infinity;
  for (const p of inst.players()) {
    if (!validTarget(inst, m, p)) continue;
    const d = dist(m.x, m.y, p.x, p.y);
    if (d > m.def.aggro) continue;
    if (d > m.def.aggro * 0.5 && !lineOfSight(inst.map, m.x, m.y, p.x, p.y)) continue;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function stepToward(inst, m, tx, ty, dt, speedMul = 1) {
  const speed = inst.moveSpeed(m) * speedMul;
  let gx = tx, gy = ty;
  if (!lineOfSight(inst.map, m.x, m.y, tx, ty)) {
    const n = inst.flow.next(m.x, m.y);
    if (n) { gx = n[0]; gy = n[1]; }
  }
  const [nx, ny] = normalize(gx - m.x, gy - m.y);
  if (nx || ny) {
    moveCircle(inst.map, m, nx * speed * dt, ny * speed * dt);
    m.facing = Math.atan2(ny, nx);
  }
}

function stepAway(inst, m, tx, ty, dt) {
  const [nx, ny] = normalize(m.x - tx, m.y - ty);
  moveCircle(inst.map, m, nx * inst.moveSpeed(m) * 0.8 * dt, ny * inst.moveSpeed(m) * 0.8 * dt);
}

function separate(inst, m, dt) {
  // Push monsters apart so packs do not stack into a single blob.
  for (const o of inst.entities.values()) {
    if (o === m || o.kind !== 'monster' || o.dead) continue;
    const dx = m.x - o.x, dy = m.y - o.y;
    const min = m.r + o.r;
    const d2 = dx * dx + dy * dy;
    if (d2 > 0.0001 && d2 < min * min) {
      const d = Math.sqrt(d2);
      const push = (min - d) * 0.5 * Math.min(1, dt * 10);
      moveCircle(inst.map, m, (dx / d) * push, (dy / d) * push);
    }
  }
}

function meleeHit(inst, m, t, mult = 1) {
  inst.damage(m, t, m.dmg * mult * (0.9 + Math.random() * 0.2), {});
  inst.emit({ e: 'mslash', id: m.id, x: m.x, y: m.y, a: m.facing });
}

function shoot(inst, m, t, spread = 0, count = 1, style = 'arrow') {
  const base = Math.atan2(t.y - m.y, t.x - m.x);
  for (let i = 0; i < count; i++) {
    const a = base + (count > 1 ? (i - (count - 1) / 2) * spread : 0);
    inst.spawnProjectile(m, { angle: a, speed: m.def.projSpeed || 10, range: (m.def.range || 8) + 4, dmg: m.dmg * 0.9, style, r: 0.3 });
  }
  m.facing = base;
}

function telegraph(inst, m, x, y, radius, delay, mult, extra = {}) {
  inst.spawnAoe(m, { style: 'telegraph', x, y, radius, life: delay, dmg: m.dmg * mult, ...extra });
}

function summon(inst, m, count, type = 'skeleton') {
  let alive = 0;
  for (const o of inst.entities.values()) if (o.kind === 'monster' && o.summoner === m.id && !o.dead) alive++;
  const n = Math.min(count, 4 - alive);
  for (let i = 0; i < n; i++) {
    const a = (i / Math.max(1, n)) * Math.PI * 2;
    const s = inst.spawnMonster(type, Math.max(1, m.level - 1), m.x + Math.cos(a) * 2, m.y + Math.sin(a) * 2, { summoned: true });
    s.summoner = m.id;
    s.target = m.target;
    s.home = { ...m.home };
  }
  if (n > 0) inst.emit({ e: 'summon', id: m.id, x: m.x, y: m.y });
}

function resolveWindup(inst, m) {
  const w = m.windup;
  m.windup = null;
  if (!w) return;
  if (w.kind === 'charge') {
    m.chargeT = 0.55;
    m.chargeVx = Math.cos(w.angle) * 17;
    m.chargeVy = Math.sin(w.angle) * 17;
    m.chargeHit = new Set();
  }
}

function bossPattern(inst, m, t) {
  const pattern = m.def.pattern;
  const move = pattern[m.patternIdx % pattern.length];
  m.patternIdx++;
  const enraged = m.hp < m.maxHp * 0.35;
  switch (move) {
    case 'slam':
      telegraph(inst, m, m.x, m.y, 4.5, enraged ? 0.8 : 1.1, 1.6, { stun: 0.6 });
      m.windupT = enraged ? 0.8 : 1.1;
      break;
    case 'charge': {
      const angle = Math.atan2(t.y - m.y, t.x - m.x);
      m.windup = { kind: 'charge', angle };
      m.windupT = 0.6;
      m.facing = angle;
      inst.emit({ e: 'charge', id: m.id, x: m.x, y: m.y, a: angle });
      break;
    }
    case 'summon':
      summon(inst, m, enraged ? 4 : 3, m.type === 'lich' ? 'archer' : m.type === 'behemoth' ? 'brute' : 'skeleton');
      break;
    case 'burst': {
      const n = enraged ? 20 : 14;
      for (let i = 0; i < n; i++) {
        inst.spawnProjectile(m, { angle: (i / n) * Math.PI * 2 + inst.time, speed: m.def.projSpeed || 9, range: 16, dmg: m.dmg * 0.7, style: 'orb', r: 0.35 });
      }
      inst.emit({ e: 'burst', id: m.id, x: m.x, y: m.y });
      break;
    }
    case 'rings':
      inst.spawnAoe(m, { style: 'ring', x: m.x, y: m.y, radius: 0.5, maxRadius: 15, speed: 7, life: 3, dmg: m.dmg * 0.9 });
      if (enraged) m.pendingRing = 0.9; // enraged bosses follow up with a second ring
      break;
    case 'nova':
      telegraph(inst, m, m.x, m.y, 6.5, 1.2, 1.4, { slow: 0.5 });
      m.windupT = 1.2;
      break;
    case 'blink': {
      const a = Math.random() * Math.PI * 2;
      const nx = t.x + Math.cos(a) * 6, ny = t.y + Math.sin(a) * 6;
      if (inst.map.walkable(Math.floor(nx), Math.floor(ny))) {
        inst.emit({ e: 'blink', id: m.id, x: m.x, y: m.y, x2: nx, y2: ny });
        m.x = nx; m.y = ny;
      }
      shoot(inst, m, t, 0.25, 5, 'orb');
      break;
    }
  }
}

export function updateMonster(inst, m, dt) {
  if (m.atkT > 0) m.atkT -= dt;
  if (m.specialT > 0) m.specialT -= dt;
  if (m.summonT > 0) m.summonT -= dt;
  if (m.pendingRing > 0) {
    m.pendingRing -= dt;
    if (m.pendingRing <= 0) inst.spawnAoe(m, { style: 'ring', x: m.x, y: m.y, radius: 0.5, maxRadius: 15, speed: 9, life: 3, dmg: m.dmg * 0.9 });
  }

  // Sleep when nobody is around (large world maps).
  if (inst.kind === 'world' && !m.target) {
    let near = false;
    for (const p of inst.players()) if (Math.abs(p.x - m.x) < 40 && Math.abs(p.y - m.y) < 40) { near = true; break; }
    if (!near) return;
  }

  if (inst.hasBuff(m, 'stun')) return;

  // Boss charge in progress.
  if (m.chargeT > 0) {
    m.chargeT -= dt;
    const hit = moveCircle(inst.map, m, m.chargeVx * dt, m.chargeVy * dt);
    for (const p of inst.players()) {
      if (p.dead || m.chargeHit.has(p.id) || !inst.hostile(m, p)) continue;
      if (dist(m.x, m.y, p.x, p.y) < m.r + p.r + 0.3) {
        m.chargeHit.add(p.id);
        inst.damage(m, p, m.dmg * 1.3, {});
        const [nx, ny] = normalize(p.x - m.x, p.y - m.y);
        inst.knockback(p, nx * 16, ny * 16);
      }
    }
    if (hit) m.chargeT = 0;
    return;
  }

  if (m.windupT > 0) {
    m.windupT -= dt;
    if (m.windupT <= 0) resolveWindup(inst, m);
    return;
  }

  let t = m.target ? inst.get(m.target) : null;
  if (m.tauntT > 0 && t && !t.dead) {
    // Taunted: stay on the taunter.
  } else if (!validTarget(inst, m, t)) {
    t = acquireTarget(inst, m);
    m.target = t ? t.id : null;
  }

  // Leash back home in the open world.
  if (inst.kind === 'world' && !m.boss) {
    const fromHome = dist(m.x, m.y, m.home.x, m.home.y);
    if (fromHome > LEASH || m.returning) {
      m.target = null;
      m.returning = fromHome > 1.5;
      if (m.returning) {
        stepToward(inst, m, m.home.x, m.home.y, dt, 1.5);
        m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.25 * dt);
        return;
      }
      m.hp = m.maxHp;
      m.dmgBy.clear();
    }
  }

  if (!t) {
    m.wanderT -= dt;
    if (m.wanderT <= 0) {
      m.wanderT = inst.rng.range(2, 5);
      m.wx = m.home.x + inst.rng.range(-3, 3);
      m.wy = m.home.y + inst.rng.range(-3, 3);
    }
    if (dist(m.x, m.y, m.wx, m.wy) > 0.5) stepToward(inst, m, m.wx, m.wy, dt, 0.4);
    separate(inst, m, dt);
    return;
  }

  const d = dist(m.x, m.y, t.x, t.y);
  const def = m.def;
  const reach = def.range + t.r;
  const los = d < 20 && lineOfSight(inst.map, m.x, m.y, t.x, t.y);

  switch (def.ai) {
    case 'melee': {
      if (d > reach * 0.9) {
        if (def.erratic) {
          const wob = Math.sin(inst.time * 6 + m.id) * 1.5;
          stepToward(inst, m, t.x + Math.cos(m.id) * wob, t.y + Math.sin(m.id) * wob, dt);
        } else stepToward(inst, m, t.x, t.y, dt);
      } else {
        m.facing = Math.atan2(t.y - m.y, t.x - m.x);
        if (m.atkT <= 0) { m.atkT = def.atkCd; meleeHit(inst, m, t); }
      }
      break;
    }
    case 'brute': {
      if (d > reach * 0.85) stepToward(inst, m, t.x, t.y, dt);
      else if (m.atkT <= 0) {
        m.atkT = def.atkCd;
        m.facing = Math.atan2(t.y - m.y, t.x - m.x);
        const fx = m.x + Math.cos(m.facing) * (def.range * 0.6);
        const fy = m.y + Math.sin(m.facing) * (def.range * 0.6);
        telegraph(inst, m, fx, fy, def.range * 0.75, def.windup, 1.0);
        m.windupT = def.windup;
      }
      break;
    }
    case 'ranged':
    case 'caster': {
      if (def.summon && m.summonT <= 0) { m.summonT = def.summonCd; summon(inst, m, 2, def.summon); }
      if (d < def.keep * 0.6) stepAway(inst, m, t.x, t.y, dt);
      else if (d > def.range || !los) stepToward(inst, m, t.x, t.y, dt);
      else {
        m.facing = Math.atan2(t.y - m.y, t.x - m.x);
        if (m.atkT <= 0) {
          m.atkT = def.atkCd;
          if (def.ai === 'caster') shoot(inst, m, t, 0.2, 3, 'orb');
          else shoot(inst, m, t, 0, 1, 'arrow');
        }
      }
      break;
    }
    case 'boss': {
      const enraged = m.hp < m.maxHp * 0.35;
      if (m.specialT <= 0) {
        m.specialT = enraged ? 3.5 : 5;
        bossPattern(inst, m, t);
        break;
      }
      if (d > m.r + t.r + 1.2) stepToward(inst, m, t.x, t.y, dt, enraged ? 1.25 : 1);
      if (m.atkT <= 0) {
        if (d <= m.r + t.r + 1.6) { m.atkT = def.atkCd * (enraged ? 0.7 : 1); meleeHit(inst, m, t, 1.0); }
        else if (def.projSpeed && los && d < 14) { m.atkT = def.atkCd * 1.4; shoot(inst, m, t, 0.18, 3, 'orb'); }
      }
      break;
    }
  }
  separate(inst, m, dt);
}
