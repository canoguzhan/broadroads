/* AI brain for player-type entities: arena fill-in bots and disconnected
   players whose hero is taken over by the AI. Produces the same inputs and
   casts a human client would. */
import { dist, normalize } from '../math.js';
import { lineOfSight } from '../tiles.js';
import { tryCast, usePotion } from './abilities.js';

const PREFERRED_RANGE = { paladin: 1.6, gunner: 8, arcanist: 7 };

export function makeBotBrain(skill = 0.7) {
  return { skill, strafe: Math.random() < 0.5 ? 1 : -1, strafeT: 0, retarget: 0, target: null, think: 0 };
}

function nearestHostile(inst, p) {
  let best = null, bd = Infinity;
  for (const e of inst.combatants()) {
    if (e.dead || !inst.hostile(p, e)) continue;
    const d = dist(p.x, p.y, e.x, e.y);
    const score = d - (e.kind === 'player' ? 2 : 0) + (e.hp / (e.maxHp || e.stats?.maxHp || 1)) * 3;
    if (score < bd) { bd = score; best = e; }
  }
  return best;
}

export function botThink(inst, p, dt) {
  const b = p.bot;
  const inp = p.input;
  inp.attack = false;
  inp.mx = 0; inp.my = 0;
  if (p.dead) return;

  b.think -= dt;
  b.strafeT -= dt;
  if (b.strafeT <= 0) { b.strafeT = 0.8 + Math.random() * 1.6; b.strafe = -b.strafe; }

  b.retarget -= dt;
  let t = b.target ? inst.get(b.target) : null;
  if (!t || t.dead || b.retarget <= 0) {
    b.retarget = 1.0;
    t = nearestHostile(inst, p);
    b.target = t ? t.id : null;
  }

  const hpPct = p.hp / p.stats.maxHp;
  if (hpPct < 0.35 && inst.allowPotions && p.char.potions.hp > 0) usePotion(inst, p, 'hp');

  // Support: arcanists heal hurt allies.
  if (p.cls === 'arcanist' && p.cd.e <= 0) {
    for (const a of inst.players()) {
      if (!a.dead && !inst.hostile(p, a) && a.hp / a.stats.maxHp < 0.6 && dist(p.x, p.y, a.x, a.y) < 6) {
        tryCast(inst, p, 'e');
        break;
      }
    }
  }

  if (!t) {
    // Wander toward the middle of the map.
    const [mx, my] = normalize(inst.map.w / 2 - p.x, inst.map.h / 2 - p.y);
    if (dist(p.x, p.y, inst.map.w / 2, inst.map.h / 2) > 4) { inp.mx = mx; inp.my = my; }
    return;
  }

  const d = dist(p.x, p.y, t.x, t.y);
  const los = lineOfSight(inst.map, p.x, p.y, t.x, t.y);
  // Aim with slight inaccuracy that shrinks with skill; lead moving targets a little.
  const err = (1 - b.skill) * 1.2;
  inp.ax = t.x + (Math.random() - 0.5) * err;
  inp.ay = t.y + (Math.random() - 0.5) * err;

  const want = PREFERRED_RANGE[p.cls] || 3;
  const [tx, ty] = normalize(t.x - p.x, t.y - p.y);
  if (!los) {
    // Circle around cover.
    inp.mx = tx - ty * b.strafe * 0.8; inp.my = ty + tx * b.strafe * 0.8;
  } else if (d > want + 1) {
    inp.mx = tx + -ty * b.strafe * 0.3; inp.my = ty + tx * b.strafe * 0.3;
  } else if (d < want - 1.5 && p.cls !== 'paladin') {
    inp.mx = -tx - ty * b.strafe * 0.5; inp.my = -ty + tx * b.strafe * 0.5;
  } else {
    inp.mx = -ty * b.strafe; inp.my = tx * b.strafe;
  }

  const inRange = p.cls === 'paladin' ? d < 2.6 + t.r : d < 13 && los;
  if (inRange) inp.attack = true;

  if (b.think > 0) return;
  b.think = 0.25 + (1 - b.skill) * 0.5;
  const roll = Math.random();
  switch (p.cls) {
    case 'paladin':
      if (d > 5 && d < 9 && p.cd.dash <= 0) tryCast(inst, p, 'dash', t.x, t.y);
      if (d < 3 && roll < 0.5) tryCast(inst, p, 'q', t.x, t.y);
      if (hpPct < 0.6 && d < 4) tryCast(inst, p, 'e', t.x, t.y);
      if (d < 5 && roll < 0.35) tryCast(inst, p, 'r', t.x, t.y);
      break;
    case 'gunner':
      if (d < 3.5 && p.cd.dash <= 0) {
        inp.mx = -tx; inp.my = -ty;
        tryCast(inst, p, 'dash', t.x, t.y);
      }
      if (los && d < 16 && roll < 0.5) tryCast(inst, p, 'q', t.x, t.y);
      if (los && d < 8 && roll < 0.5) tryCast(inst, p, 'e', t.x, t.y);
      if (d < 13 && roll < 0.3) tryCast(inst, p, 'r', t.x, t.y);
      break;
    case 'arcanist':
      if (d < 3 && p.cd.dash <= 0) tryCast(inst, p, 'dash', p.x - tx * 6, p.y - ty * 6);
      if (d < 4.5 && roll < 0.6) tryCast(inst, p, 'q', t.x, t.y);
      if (d < 11 && roll < 0.3) tryCast(inst, p, 'r', t.x, t.y);
      break;
  }
}
