/* Hero bot AI. Issues the same commands a player would, via the match API. */
import { canRankUp, SLOTS } from './champions.js';
import { ITEMS, priceFor } from './items.js';
import { enemyOf } from './map.js';
import { dist } from '../math.js';

const ROLE_LANE = { top: 'top', mid: 'mid', bot: 'bot', support: 'bot', jungle: null };

export function makeBrain(p) {
  return { role: p.role || 'mid', thinkT: Math.random() * 0.3, skill: p.skill ?? 0.75, state: 'lane', recallWanted: false, buildIdx: 0, campIdx: 0, groupLane: 'mid' };
}

function levelUp(m, h) {
  const order = ['r', ...(h.c.bot.max || ['q', 'w', 'e'])];
  while (h.points > 0) {
    const slot = order.find(s => canRankUp(h, s)) || SLOTS.find(s => canRankUp(h, s));
    if (!slot) break;
    m.command(h, { t: 'lvl', sl: slot });
  }
}

function shop(m, h) {
  if (!m.canShop(h)) return;
  const build = h.c.bot.build;
  // First visit: starter items.
  if (!h.bot.started) {
    h.bot.started = true;
    m.command(h, { t: 'buy', item: h.c.base.ad > 60 || !h.c.ranged ? 'longsword' : 'tome' });
    m.command(h, { t: 'buy', item: 'potion' });
    m.command(h, { t: 'buy', item: 'potion' });
  }
  for (let guard = 0; guard < 8; guard++) {
    const owned = h.items.filter(Boolean).map(i => i.id);
    const next = build.find(id => !owned.includes(id));
    if (!next) break;
    // Buy the full item if affordable, otherwise a component toward it.
    const full = priceFor(next, h.items);
    let target = next;
    if (h.gold < full.price) {
      const comps = (ITEMS[next].from || []).filter(c => !owned.includes(c) || ITEMS[next].from.filter(x => x === c).length > owned.filter(x => x === c).length);
      const affordable = comps.map(c => ({ c, p: priceFor(c, h.items).price })).filter(o => o.p <= h.gold).sort((a, b) => b.p - a.p)[0];
      if (!affordable) break;
      target = affordable.c;
    }
    const before = h.gold;
    // Make room by selling leftover potions/starter items when full.
    if (!h.items.includes(null) && priceFor(target, h.items).consume.length === 0) {
      const junk = h.items.findIndex(it => it && (it.id === 'potion' || (ITEMS[it.id].cat === 'basic' && !build.some(b => (ITEMS[b].from || []).includes(it.id)))));
      if (junk >= 0) m.command(h, { t: 'sell', slot: junk });
    }
    m.command(h, { t: 'buy', item: target });
    if (h.gold === before) break;
  }
}

function visibleEnemies(m, h, range, kinds = ['hero']) {
  const out = [];
  for (const e of m.entities.values()) {
    if (e.team === h.team || e.dead || e.removed || !kinds.includes(e.kind)) continue;
    if (!m.visibleTo(e, h.team) || !m.targetable(e)) continue;
    if (dist(h.x, h.y, e.x, e.y) <= range) out.push(e);
  }
  return out;
}

function alliesNear(m, h, range) { return m.heroes.filter(a => a.team === h.team && !a.dead && a !== h && dist(a.x, a.y, h.x, h.y) <= range); }

function enemyTowerNear(m, h, x, y, extra = 0) {
  for (const t of m.structures[enemyOf(h.team)]) if (t.kind === 'tower' && !t.dead && dist(t.x, t.y, x, y) <= t.range + 1 + extra) return t;
  return null;
}

/** Distance along a lane path of the closest point to (x, y). */
function laneProgress(path, x, y) {
  let best = Infinity, prog = 0, acc = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / (len * len)));
    const px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t;
    const d = Math.hypot(x - px, y - py);
    if (d < best) { best = d; prog = acc + t * len; }
    acc += len;
  }
  return prog;
}

function laneFront(m, h, lane) {
  const path = m.rift.teams[h.team].paths[lane];
  // Hold point: just in front of our furthest living tower in that lane.
  const towers = m.structures[h.team].filter(t => t.kind === 'tower' && t.lane === lane && !t.dead).sort((a, b) => a.tier - b.tier);
  const t = towers[0] || m.structures[h.team].find(s => s.kind === 'nexus');
  const tp = laneProgress(path, t.x, t.y) + 3;
  // The allied minion furthest along the lane path.
  let best = null, bestP = -1;
  for (const e of m.entities.values()) {
    if (e.kind !== 'minion' || e.team !== h.team || e.lane !== lane || e.dead) continue;
    const p = laneProgress(path, e.x, e.y);
    if (p > bestP) { bestP = p; best = e; }
  }
  if (best && bestP >= tp - 4) return { x: best.x, y: best.y, minion: true, prog: bestP };
  const pt = pointAt(path, tp);
  return { x: pt.x, y: pt.y, minion: false, prog: tp };
}

function pointAt(path, prog) {
  let acc = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + len >= prog) { const t = (prog - acc) / len; return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
    acc += len;
  }
  return path[path.length - 1];
}

function castAt(m, h, slot, target) {
  const a = h.c.abilities[slot];
  m.command(h, { t: 'cast', sl: slot, x: target.x, y: target.y, id: target.id });
  void a;
}

function ready(m, h, slot) {
  const a = h.c.abilities[slot];
  const rank = h.ranks[slot];
  return rank > 0 && h.cd[slot] <= 0 && h.mp >= a.mana[Math.min(a.mana.length - 1, rank - 1)];
}

function useAbilities(m, h, target, mode) {
  const b = h.bot;
  if (Math.random() > b.skill + 0.15) return;
  const d = target ? dist(h.x, h.y, target.x, target.y) : Infinity;
  for (const slot of ['r', 'q', 'w', 'e']) {
    if (!ready(m, h, slot)) continue;
    const a = h.c.abilities[slot];
    const tag = h.c.bot[slot];
    const range = (a.range || 3) + (target ? target.r : 0);
    switch (tag) {
      case 'poke': case 'cc':
        if (target && target.kind === 'hero' && d <= range * 0.95) return castAt(m, h, slot, target);
        break;
      case 'engage':
        if (target && target.kind === 'hero' && mode === 'fight' && d <= range && d > 1.5) return castAt(m, h, slot, target);
        break;
      case 'execute':
        if (target && target.kind === 'hero' && d <= range && (target.hp / target.maxHp < (slot === 'r' ? 0.38 : 0.5))) return castAt(m, h, slot, target);
        break;
      case 'melee':
        if (target && d <= (a.range || 3) + target.r - 0.3) return castAt(m, h, slot, target);
        break;
      case 'buff':
        if (target && d <= h.stats.range + 1.5) return castAt(m, h, slot, target);
        break;
      case 'shield':
        if (h.hp < h.maxHp * 0.75 && visibleEnemies(m, h, 8).length) return castAt(m, h, slot, h);
        break;
      case 'defend':
        if (h.hp < h.maxHp * 0.5 && visibleEnemies(m, h, 6).length) return castAt(m, h, slot, h);
        break;
      case 'heal': {
        const hurt = m.heroes.filter(x => x.team === h.team && !x.dead && x.hp < x.maxHp * 0.6 && (slot === 'r' || dist(x.x, x.y, h.x, h.y) <= (a.range || 6)) && (a.target !== 'ally' || x !== h)).sort((p, q) => p.hp / p.maxHp - q.hp / q.maxHp)[0];
        if (hurt && (slot !== 'r' || hurt.hp < hurt.maxHp * 0.35)) return castAt(m, h, slot, hurt);
        break;
      }
      case 'escape':
        if (mode === 'retreat' && target && d < 6) { const f = m.rift.teams[h.team].fountain; return castAt(m, h, slot, { x: h.x + (f.x - h.x) * 0.1, y: h.y + (f.y - h.y) * 0.1 }); }
        if (mode === 'fight' && a.target === 'point' && target && d > h.stats.range && d < range + h.stats.range && target.hp < target.maxHp * 0.4) return castAt(m, h, slot, target);
        break;
      case 'trap':
        if (target && d <= range) return castAt(m, h, slot, target);
        break;
      default:
    }
  }
}

function summoners(m, h, target, mode) {
  for (const k of ['d', 'f']) {
    if (h.cd[k] > 0) continue;
    const sp = h.summoners[k];
    if (sp === 'flash' && mode === 'retreat' && h.hp < h.maxHp * 0.2 && target && dist(h.x, h.y, target.x, target.y) < 4) {
      const f = m.rift.teams[h.team].fountain;
      m.command(h, { t: 'summ', k, x: f.x, y: f.y });
    } else if (sp === 'heal' && h.hp < h.maxHp * 0.25 && target) m.command(h, { t: 'summ', k, x: h.x, y: h.y });
    else if (sp === 'barrier' && h.hp < h.maxHp * 0.25 && target) m.command(h, { t: 'summ', k, x: h.x, y: h.y });
    else if (sp === 'ignite' && target && target.kind === 'hero' && target.hp < target.maxHp * 0.3 && dist(h.x, h.y, target.x, target.y) < 6) m.command(h, { t: 'summ', k, x: target.x, y: target.y, id: target.id });
    else if (sp === 'ghost' && (mode === 'retreat' || mode === 'fight') && target && h.hp < h.maxHp * 0.4) m.command(h, { t: 'summ', k, x: h.x, y: h.y });
  }
}

function moveTo(m, h, x, y) {
  const o = h.order;
  if (o.type === 'move' && dist(o.x, o.y, x, y) < 1.5 && h.path.length) return;
  m.command(h, { t: 'mv', x, y });
}

function retreat(m, h, threat) {
  const f = m.rift.teams[h.team].fountain;
  if (!threat || dist(h.x, h.y, threat.x, threat.y) > 10) {
    if (!h.recall) m.command(h, { t: 'recall' });
    return;
  }
  useAbilities(m, h, threat, 'retreat');
  summoners(m, h, threat, 'retreat');
  moveTo(m, h, f.x, f.y);
}

function bestTarget(m, h, enemies) {
  let best = null, bs = Infinity;
  for (const e of enemies) {
    const s = (e.hp / e.maxHp) * 10 + dist(h.x, h.y, e.x, e.y) * 0.8 + (e.c.role === 'Tank' ? 3 : 0);
    if (s < bs) { bs = s; best = e; }
  }
  return best;
}

function lastHitTarget(m, h) {
  let best = null, bd = Infinity;
  const reach = h.stats.range + 4;
  for (const e of m.entities.values()) {
    if ((e.kind !== 'minion') || e.team === h.team || e.dead || !m.visibleTo(e, h.team)) continue;
    const d = dist(h.x, h.y, e.x, e.y);
    if (d > reach) continue;
    const killable = e.hp <= h.stats.ad * 100 / (100 + (e.armor || 0)) * 1.05;
    const score = (killable ? 0 : 50) + e.hp / 50 + d;
    if (score < bd) { bd = score; best = e; }
  }
  return best;
}

function jungleThink(m, h) {
  // Before camps spawn, wait at our blue buff.
  if (m.time < 75) {
    const c = m.camps.find(x => x.side === h.team && x.buff === 'blue');
    if (dist(h.x, h.y, c.x, c.y) > 3) moveTo(m, h, c.x, c.y);
    return true;
  }
  // Pick the nearest alive camp on our side (both sides after 8 minutes).
  const camps = m.camps.filter(c => c.units.some(u => !u.dead) && (c.side === h.team || m.time > 480));
  if (!camps.length) return false;
  camps.sort((a, b) => dist(h.x, h.y, a.x, a.y) - dist(h.x, h.y, b.x, b.y));
  const camp = camps[0];
  const unit = camp.units.filter(u => !u.dead).sort((a, b) => a.hp - b.hp)[0];
  if (!unit) return false;
  if (h.hp < h.maxHp * 0.35) return false;
  // Smite the big monster when it would die.
  const sk = h.summoners.d === 'smite' ? 'd' : h.summoners.f === 'smite' ? 'f' : null;
  const big = camp.units.find(u => !u.dead && !u.def.small);
  if (sk && h.cd[sk] <= 0 && big && big.hp <= 450 + 30 * h.level && dist(h.x, h.y, big.x, big.y) < 5) m.command(h, { t: 'summ', k: sk, x: big.x, y: big.y, id: big.id });
  // Monsters in fog cannot be targeted yet: walk to the camp first.
  if (!m.visibleTo(unit, h.team)) { moveTo(m, h, unit.x, unit.y); return true; }
  if (h.order.type !== 'attack' || h.order.target !== unit.id) m.command(h, { t: 'mv', x: unit.x, y: unit.y, id: unit.id });
  if (dist(h.x, h.y, unit.x, unit.y) < 4) for (const slot of ['q', 'w', 'e']) if (ready(m, h, slot) && h.mp > h.maxMp * 0.3 && ['melee', 'poke', 'buff'].includes(h.c.bot[slot])) castAt(m, h, slot, unit);
  return true;
}

function objectiveThink(m, h) {
  for (const k of ['dragon', 'baron']) {
    const u = m.epics[k].unit;
    if (!u || u.dead) continue;
    if (k === 'dragon' && m.time < 300) continue;
    if (k === 'baron' && m.time < 1080) continue;
    // Who takes part: dragon = jungle + bot lane (everyone late), baron = everyone.
    const role = h.bot.role;
    const joins = k === 'baron' || m.time > 1080 || role === 'jungle' || role === 'bot' || role === 'support';
    if (!joins || h.hp < h.maxHp * 0.55) continue;
    const allies = m.heroes.filter(a => a.team === h.team && !a.dead && a.hp > a.maxHp * 0.4 && dist(a.x, a.y, u.x, u.y) < 22);
    const enemiesNear = m.heroes.filter(e => e.team !== h.team && !e.dead && m.visibleTo(e, h.team) && dist(e.x, e.y, u.x, u.y) < 16);
    const need = k === 'baron' ? 4 : 2;
    const levelOk = h.level >= (k === 'baron' ? 11 : 6);
    if (!levelOk || enemiesNear.length > 1) continue;
    const jungler = m.heroes.find(a => a.team === h.team && a.bot && a.bot.role === 'jungle' && !a.dead);
    // Rally: jungler heads to the pit, others join when the jungler is on the way.
    if (allies.length < need) {
      if (role === 'jungle' || (jungler && dist(jungler.x, jungler.y, u.x, u.y) < 20)) { if (dist(h.x, h.y, u.x, u.y) > 7) { moveTo(m, h, u.x, u.y); return true; } return true; }
      continue;
    }
    const sk = h.summoners.d === 'smite' ? 'd' : h.summoners.f === 'smite' ? 'f' : null;
    if (sk && h.cd[sk] <= 0 && u.hp <= 450 + 30 * h.level && dist(h.x, h.y, u.x, u.y) < 5) m.command(h, { t: 'summ', k: sk, x: u.x, y: u.y, id: u.id });
    if (!m.visibleTo(u, h.team)) moveTo(m, h, u.x, u.y);
    else if (h.order.type !== 'attack' || h.order.target !== u.id) m.command(h, { t: 'mv', x: u.x, y: u.y, id: u.id });
    return true;
  }
  return false;
}

function defendBase(m, h) {
  for (const s of m.structures[h.team]) {
    if (s.dead || (s.kind === 'tower' && s.tier < 3)) continue;
    const threats = visibleEnemies(m, { ...h, x: s.x, y: s.y }, 10, ['hero', 'minion']);
    if (threats.length >= 3) { if (dist(h.x, h.y, s.x, s.y) > 6) m.command(h, { t: 'mv', x: s.x, y: s.y, a: true }); return true; }
  }
  return false;
}

export function botThink(m, h, dt) {
  const b = h.bot;
  b.thinkT -= dt;
  if (b.thinkT > 0) return;
  b.thinkT = 0.2 + (1 - b.skill) * 0.25;
  if (h.points > 0) levelUp(m, h);
  if (m.canShop(h)) shop(m, h);
  if (h.dead) return;
  if (h.recall) {
    const threat = visibleEnemies(m, h, 9)[0];
    if (!threat) return;
    m.command(h, { t: 'stop' });
  }
  // Rest at the fountain until healthy.
  if (m.inFountain(h) && (h.hp < h.maxHp * 0.9 || h.mp < h.maxMp * 0.6)) { m.command(h, { t: 'stop' }); return; }

  const enemies = visibleEnemies(m, h, 11);
  const allies = alliesNear(m, h, 10);
  const hpPct = h.hp / h.maxHp;
  const nearest = enemies.sort((a, c) => dist(h.x, h.y, a.x, a.y) - dist(h.x, h.y, c.x, c.y))[0];

  // Use potions.
  if (hpPct < 0.55 && !m.hasBuff(h, 'potion')) { const slot = h.items.findIndex(it => it && it.id === 'potion'); if (slot >= 0) m.command(h, { t: 'use', slot }); }

  // Tower aggro: get out.
  const tower = enemyTowerNear(m, h, h.x, h.y);
  if (tower && tower.target === h.id && hpPct < 0.95) {
    const target = bestTarget(m, h, enemies);
    const kill = target && target.hp < target.maxHp * 0.15 && dist(h.x, h.y, target.x, target.y) < h.stats.range + 1;
    if (!kill) { const f = m.rift.teams[h.team].fountain; moveTo(m, h, h.x + (f.x - h.x) * 0.15, h.y + (f.y - h.y) * 0.15); return; }
  }

  // Retreat when low or outnumbered.
  const outnumbered = enemies.length > allies.length + 1;
  if (hpPct < 0.28 || (hpPct < 0.45 && outnumbered) || (h.mp < h.maxMp * 0.1 && !nearest && h.c.base.mp > 0)) return retreat(m, h, nearest);
  // Go shopping with a full wallet when safe.
  if (h.gold > 1500 && !nearest && !m.inFountain(h)) { m.command(h, { t: 'recall' }); return; }

  if (defendBase(m, h)) return;

  // Fight visible enemy champions when the odds are reasonable.
  if (enemies.length) {
    const target = bestTarget(m, h, enemies);
    const myPower = (hpPct + 0.2) * (1 + allies.length * 0.9) * (h.level + 2);
    const theirPower = enemies.reduce((s, e) => s + (e.hp / e.maxHp + 0.2) * (e.level + 2), 0) / Math.max(1, enemies.length) * (enemies.length * 0.9 + 0.1);
    const underTheirTower = enemyTowerNear(m, h, target.x, target.y);
    const towerTankers = underTheirTower ? m.alliesNear(h.team, underTheirTower.x, underTheirTower.y, 8).filter(u => u.kind === 'minion').length : 1;
    const favorable = (myPower >= theirPower * 1.15 || target.hp < target.maxHp * 0.3) && (!underTheirTower || towerTankers >= 2 || target.hp < target.maxHp * 0.2);
    if (favorable) {
      useAbilities(m, h, target, 'fight');
      summoners(m, h, target, 'fight');
      if (h.order.type !== 'attack' || h.order.target !== target.id) m.command(h, { t: 'mv', x: target.x, y: target.y, id: target.id });
      return;
    }
    // Poke from range but keep distance.
    useAbilities(m, h, target, 'poke');
    if (dist(h.x, h.y, target.x, target.y) < target.stats.range + 2.5) {
      const f = m.rift.teams[h.team].fountain;
      moveTo(m, h, h.x + (f.x - h.x) * 0.08, h.y + (f.y - h.y) * 0.08);
      return;
    }
  }

  if (objectiveThink(m, h)) return;

  // Role logic.
  let lane = ROLE_LANE[b.role];
  if (b.role === 'jungle' && m.time < 900) {
    if (jungleThink(m, h)) return;
    if (hpPct < 0.5) return retreat(m, h, nearest);
    lane = 'mid';
  }
  if (m.time > 900) {
    // Late game: group in the lane closest to an enemy structure we can hit.
    const order = ['mid', 'bot', 'top'];
    b.groupLane = order.find(l => m.structures[enemyOf(h.team)].some(s => s.lane === l && !s.dead)) || 'mid';
    lane = b.groupLane;
  }
  if (b.role === 'support' && m.time < 900) {
    const carry = m.heroes.find(a => a.team === h.team && a !== h && !a.dead && a.bot && a.bot.role === 'bot') || m.heroes.find(a => a.team === h.team && a !== h && !a.dead && a.botRole === 'bot');
    if (carry && dist(carry.x, carry.y, h.x, h.y) > 4 && !m.inFountain(carry)) { moveTo(m, h, carry.x - 1, carry.y + 1); return; }
  }

  const front = laneFront(m, h, lane);
  // Attack enemy structures when minions are tanking.
  const struct = m.autoTarget({ ...h, x: h.x, y: h.y }, h.stats.range + 1.5);
  if (struct && (struct.kind === 'tower' || struct.kind === 'inhib' || struct.kind === 'nexus')) {
    const tankers = m.alliesNear(h.team, struct.x, struct.y, 8).filter(u => u.kind === 'minion').length;
    if (struct.kind !== 'tower' || tankers >= 1) { if (h.order.target !== struct.id) m.command(h, { t: 'mv', x: struct.x, y: struct.y, id: struct.id }); return; }
  }
  // Farm.
  const mt = lastHitTarget(m, h);
  if (mt && dist(front.x, front.y, h.x, h.y) < 12) {
    const towerOver = enemyTowerNear(m, h, mt.x, mt.y, 0);
    const safe = !towerOver || m.alliesNear(h.team, towerOver.x, towerOver.y, 8).some(u => u.kind === 'minion');
    if (safe) {
      const killable = mt.hp <= h.stats.ad * 1.05 * 100 / (100 + (mt.armor || 0));
      const pushing = m.time > 600 || b.role === 'jungle';
      if (killable || pushing || dist(h.x, h.y, mt.x, mt.y) > h.stats.range + 1) {
        if (h.order.type !== 'attack' || h.order.target !== mt.id) m.command(h, { t: 'mv', x: mt.x, y: mt.y, id: mt.id });
        return;
      }
      // Wait near the minion for the last hit.
      m.command(h, { t: 'stop' });
      return;
    }
  }
  // Walk to the lane front (slightly behind it).
  const own = m.rift.teams[h.team].nexus;
  const back = h.c.ranged ? 3.5 : 1.5;
  const [dx, dy] = [own.x - front.x, own.y - front.y];
  const dd = Math.hypot(dx, dy) || 1;
  let gx = front.x + dx / dd * back, gy = front.y + dy / dd * back;
  if (!front.minion && enemyTowerNear(m, h, gx, gy, 1)) { gx = front.x + dx / dd * 8; gy = front.y + dy / dd * 8; }
  if (dist(h.x, h.y, gx, gy) > 2) moveTo(m, h, gx, gy);
}
