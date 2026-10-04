/* Player abilities, shared by human players and arena bots. */
import { ABILITIES } from '../classes.js';
import { angleDiff, clamp, dist, normalize } from '../math.js';
import { castWalk } from '../tiles.js';
import { POTION_CD, PVP_CC } from '../constants.js';
import { POTIONS } from '../items.js';

export function rollDamage(src, mult) {
  const atk = src.stats ? src.stats.atk : src.dmg;
  const critChance = src.stats ? src.stats.crit : 0;
  const crit = Math.random() < critChance;
  const variance = 0.9 + Math.random() * 0.2;
  return { amount: atk * mult * variance * (crit ? src.stats.critMult : 1), crit };
}

function hostilesInRadius(inst, src, x, y, radius) {
  const out = [];
  for (const e of inst.combatants()) {
    if (e.dead || !inst.hostile(src, e)) continue;
    if (dist(x, y, e.x, e.y) <= radius + e.r) out.push(e);
  }
  return out;
}

function hostilesInCone(inst, src, range, halfAngle) {
  const out = [];
  for (const e of inst.combatants()) {
    if (e.dead || !inst.hostile(src, e)) continue;
    const d = dist(src.x, src.y, e.x, e.y);
    if (d > range + e.r) continue;
    const a = Math.atan2(e.y - src.y, e.x - src.x);
    if (d < e.r + src.r || Math.abs(angleDiff(src.facing, a)) <= halfAngle) out.push(e);
  }
  return out;
}

function ccScale(inst, src, tgt) {
  return src.kind === 'player' && tgt.kind === 'player' ? PVP_CC : 1;
}

function moveDir(p) {
  const [mx, my] = normalize(p.input.mx || 0, p.input.my || 0);
  if (mx || my) return Math.atan2(my, mx);
  return p.facing;
}

function startDash(inst, p, angle, distance, duration, invuln) {
  p.dashT = duration;
  p.dashVx = Math.cos(angle) * distance / duration;
  p.dashVy = Math.sin(angle) * distance / duration;
  if (invuln) inst.addBuff(p, 'invuln', invuln);
}

const HANDLERS = {
  paladin: {
    primary(inst, p) {
      const def = ABILITIES.paladin.primary;
      for (const e of hostilesInCone(inst, p, def.range, Math.PI / 3)) {
        const r = rollDamage(p, 1.0);
        inst.damage(p, e, r.amount, { crit: r.crit });
      }
      inst.emit({ e: 'slash', id: p.id, x: p.x, y: p.y, a: p.facing, r: def.range, c: 'paladin' });
    },
    dash(inst, p) {
      startDash(inst, p, moveDir(p), ABILITIES.paladin.dash.range, 0.22, 0.3);
      inst.emit({ e: 'dash', id: p.id, x: p.x, y: p.y, c: 'paladin' });
    },
    q(inst, p) {
      for (const e of hostilesInCone(inst, p, ABILITIES.paladin.q.range, Math.PI / 4)) {
        const r = rollDamage(p, 1.4);
        inst.damage(p, e, r.amount, { crit: r.crit });
        inst.addBuff(e, 'stun', 1.2 * ccScale(inst, p, e));
      }
      inst.emit({ e: 'bash', id: p.id, x: p.x, y: p.y, a: p.facing });
    },
    e(inst, p) {
      inst.addBuff(p, 'guard', 4);
      for (const m of inst.combatants()) {
        if (m.kind === 'monster' && !m.dead && inst.hostile(p, m) && dist(p.x, p.y, m.x, m.y) <= ABILITIES.paladin.e.range) {
          m.target = p.id;
          m.tauntT = 4;
        }
      }
      inst.emit({ e: 'guard', id: p.id, x: p.x, y: p.y });
    },
    r(inst, p) {
      const radius = ABILITIES.paladin.r.range;
      for (const e of hostilesInRadius(inst, p, p.x, p.y, radius)) {
        const r = rollDamage(p, 3.0);
        inst.damage(p, e, r.amount, { crit: r.crit });
        const [nx, ny] = normalize(e.x - p.x, e.y - p.y);
        inst.knockback(e, nx * 14, ny * 14);
      }
      inst.emit({ e: 'shock', id: p.id, x: p.x, y: p.y, r: radius, c: 'paladin' });
    },
  },
  gunner: {
    primary(inst, p) {
      inst.spawnProjectile(p, { angle: p.facing, speed: 24, range: 14, dmgMult: 0.9, style: 'bolt' });
      inst.emit({ e: 'shoot', id: p.id, x: p.x, y: p.y, c: 'gunner' });
    },
    dash(inst, p) {
      startDash(inst, p, moveDir(p), ABILITIES.gunner.dash.range, 0.24, 0.25);
      inst.emit({ e: 'dash', id: p.id, x: p.x, y: p.y, c: 'gunner' });
    },
    q(inst, p) {
      inst.spawnProjectile(p, { angle: p.facing, speed: 32, range: 18, dmgMult: 2.2, style: 'lance', pierce: true, r: 0.45 });
      inst.emit({ e: 'shoot', id: p.id, x: p.x, y: p.y, c: 'lance' });
    },
    e(inst, p) {
      for (let i = -3; i <= 3; i++) {
        inst.spawnProjectile(p, { angle: p.facing + i * 0.14, speed: 22, range: 10, dmgMult: 0.75, style: 'bolt' });
      }
      inst.emit({ e: 'shoot', id: p.id, x: p.x, y: p.y, c: 'volley' });
    },
    r(inst, p, ax, ay) {
      const [tx, ty] = clampAim(p, ax, ay, ABILITIES.gunner.r.range);
      inst.spawnAoe(p, { style: 'barrage', x: tx, y: ty, radius: 4, life: 2.2, tickEvery: 0.15, dmgMult: 0.9 });
      inst.emit({ e: 'cast', id: p.id, x: p.x, y: p.y, c: 'barrage' });
    },
  },
  arcanist: {
    primary(inst, p) {
      inst.spawnProjectile(p, { angle: p.facing, speed: 18, range: 12, dmgMult: 1.05, style: 'spark', chain: 1 });
      inst.emit({ e: 'shoot', id: p.id, x: p.x, y: p.y, c: 'arcanist' });
    },
    dash(inst, p, ax, ay) {
      const angle = Math.atan2(ay - p.y, ax - p.x);
      const d = Math.min(ABILITIES.arcanist.dash.range, dist(p.x, p.y, ax, ay));
      const fromX = p.x, fromY = p.y;
      const [nx, ny] = castWalk(inst.map, p.x, p.y, angle, Math.max(1, d), p.r);
      p.x = nx; p.y = ny;
      inst.addBuff(p, 'invuln', 0.15);
      inst.emit({ e: 'blink', id: p.id, x: fromX, y: fromY, x2: nx, y2: ny });
    },
    q(inst, p) {
      const radius = ABILITIES.arcanist.q.range;
      for (const e of hostilesInRadius(inst, p, p.x, p.y, radius)) {
        const r = rollDamage(p, 1.3);
        inst.damage(p, e, r.amount, { crit: r.crit });
        inst.addBuff(e, 'slow', 2.5 * ccScale(inst, p, e), 0.5);
      }
      inst.emit({ e: 'nova', id: p.id, x: p.x, y: p.y, r: radius });
    },
    e(inst, p) {
      const range = ABILITIES.arcanist.e.range;
      for (const a of inst.combatants()) {
        if (a.kind !== 'player' || a.dead || inst.hostile(p, a)) continue;
        if (dist(p.x, p.y, a.x, a.y) > range) continue;
        inst.heal(p, a, a.stats.maxHp * 0.22 + p.stats.atk * 1.6);
      }
      inst.emit({ e: 'healfx', id: p.id, x: p.x, y: p.y, r: range });
    },
    r(inst, p, ax, ay) {
      const [tx, ty] = clampAim(p, ax, ay, ABILITIES.arcanist.r.range);
      inst.spawnAoe(p, { style: 'vortex', x: tx, y: ty, radius: 5, life: 3, tickEvery: 0.25, dmgMult: 0.35, pull: 5 });
      inst.emit({ e: 'cast', id: p.id, x: p.x, y: p.y, c: 'vortex' });
    },
  },
};

function clampAim(p, ax, ay, range) {
  const d = dist(p.x, p.y, ax, ay);
  if (d <= range) return [ax, ay];
  const a = Math.atan2(ay - p.y, ax - p.x);
  return [p.x + Math.cos(a) * range, p.y + Math.sin(a) * range];
}

export function cooldownFor(p, slot) {
  const base = ABILITIES[p.cls][slot].cd;
  // Primary attack speed is not affected by cooldown reduction.
  return slot === 'primary' ? base : base * (1 - p.stats.cdr);
}

/** Attempts to cast an ability. Returns an error string or null on success. */
export function tryCast(inst, p, slot, ax, ay) {
  const def = ABILITIES[p.cls] && ABILITIES[p.cls][slot];
  if (!def) return 'unknown';
  if (p.dead) return 'dead';
  if (inst.hasBuff(p, 'stun')) return 'stunned';
  if (!inst.combatAllowed(p)) return 'safe';
  if (p.cd[slot] > 0) return 'cooldown';
  if (p.mp < def.mana) return 'mana';
  if (Number.isFinite(ax) && Number.isFinite(ay)) {
    p.facing = Math.atan2(ay - p.y, ax - p.x);
  } else {
    ax = p.x + Math.cos(p.facing) * 5;
    ay = p.y + Math.sin(p.facing) * 5;
  }
  p.mp -= def.mana;
  p.cd[slot] = cooldownFor(p, slot);
  HANDLERS[p.cls][slot](inst, p, ax, ay);
  return null;
}

export function usePotion(inst, p, kind) {
  const char = p.char;
  if (!char || !POTIONS[kind]) return 'unknown';
  if (p.dead) return 'dead';
  if (!inst.allowPotions) return 'Potions are disabled here';
  if (p.potCd > 0) return 'cooldown';
  if ((char.potions[kind] || 0) <= 0) return `No ${POTIONS[kind].name}s left`;
  char.potions[kind]--;
  p.potCd = POTION_CD;
  if (kind === 'hp') inst.heal(p, p, p.stats.maxHp * POTIONS.hp.heal, { potion: true });
  else {
    p.mp = clamp(p.mp + p.stats.maxMp * POTIONS.mp.heal, 0, p.stats.maxMp);
    inst.emit({ e: 'mana', id: p.id, x: p.x, y: p.y });
  }
  inst.markCharDirty(p);
  return null;
}
