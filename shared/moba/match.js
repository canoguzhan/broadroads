/* Authoritative 5v5 MOBA match simulation. */
import { getValley, enemyOf, LANES, bushAt } from './map.js';
import { KEYSTONES, defaultKeystone, keystoneOnAdd, keystoneTick, keystoneOnHit } from './keystones.js';
import { selfDelta } from '../protocol.js';
export const EMOTES = ['dance', 'cheer', 'laugh'];
import { CHAMPIONS, SLOTS, MAX_LEVEL, XP_TO_LEVEL, canRankUp, bonusAd } from './champions.js';
import { ITEMS, INV_SLOTS, START_GOLD, SELL_RATIO, SPELLS, priceFor } from './items.js';
import { Pathfinder } from './pathfind.js';
import { moveCircle, findFreeSpot, castWalk, circleBlocked } from '../tiles.js';
import { dist, dist2, normalize, angleDiff } from '../math.js';
import { RNG } from '../rng.js';
import { botThink, makeBrain } from './bot.js';

export const CFG = {
  minionFirst: 20,
  waveEvery: 28,
  passiveGoldStart: 60,
  passiveGold: 2.4,
  passiveXp: 1.2,
  recallTime: 6,
  campFirst: 75,
  wyrmFirst: 150,
  wyrmRespawn: 240,
  titanFirst: 540,
  titanRespawn: 300,
  spireRespawn: 240,
  fountainRadius: 7.5,
  shopRadius: 9,
  heroSight: 11,
  minionSight: 7,
  towerSight: 9.5,
  wardSight: 8,
  assistWindow: 10,
  surrenderAfter: 600,
};

const MINIONS = {
  melee: { hp: 470, ad: 13, as: 1.2, range: 1.0, ms: 3.6, armor: 0, mr: 0, r: 0.45, gold: 20, xp: 58, ranged: false },
  caster: { hp: 290, ad: 23, as: 0.67, range: 5, ms: 3.6, armor: 0, mr: 0, r: 0.4, gold: 15, xp: 29, ranged: true },
  siege: { hp: 900, ad: 42, as: 0.5, range: 6.5, ms: 3.6, armor: 30, mr: 0, r: 0.6, gold: 45, xp: 92, ranged: true },
  super: { hp: 1500, ad: 90, as: 0.85, range: 1.3, ms: 3.8, armor: 30, mr: -30, r: 0.7, gold: 40, xp: 97, ranged: false },
};

const MONSTERS = {
  mossback: { name: 'Mossback Golem', hp: 1400, ad: 40, as: 0.6, range: 1.8, armor: 20, mr: 20, r: 1.0, gold: 90, xp: 120, model: 'golem', buff: 'blue' },
  brute: { name: 'Ironhide Brute', hp: 1400, ad: 44, as: 0.6, range: 1.8, armor: 20, mr: 20, r: 1.0, gold: 90, xp: 120, model: 'brute', buff: 'red' },
  wolf: { name: 'Alpha Howler', hp: 900, ad: 28, as: 0.8, range: 1.5, armor: 10, mr: 0, r: 0.7, gold: 55, xp: 70, model: 'wolf' },
  pup: { name: 'Howler Pup', hp: 300, ad: 12, as: 0.8, range: 1.2, armor: 0, mr: 0, r: 0.5, gold: 15, xp: 25, model: 'wolf', small: true },
  duskwing: { name: 'Duskwing Matriarch', hp: 700, ad: 22, as: 0.9, range: 1.4, armor: 15, mr: 0, r: 0.6, gold: 45, xp: 50, model: 'bat' },
  duskling: { name: 'Duskwing', hp: 180, ad: 8, as: 0.9, range: 1.1, armor: 0, mr: 0, r: 0.4, gold: 12, xp: 15, model: 'bat', small: true },
  bogtoad: { name: 'Bogtoad', hp: 1100, ad: 42, as: 0.7, range: 4, armor: 0, mr: -10, r: 0.9, gold: 75, xp: 95, model: 'slime', ranged: true },
  stonehulk: { name: 'Stonehulk', hp: 900, ad: 38, as: 0.6, range: 1.6, armor: 25, mr: 0, r: 0.9, gold: 60, xp: 80, model: 'golem' },
  pebblet: { name: 'Pebblet', hp: 400, ad: 16, as: 0.6, range: 1.3, armor: 10, mr: 0, r: 0.6, gold: 20, xp: 25, model: 'golem', small: true },
  wyrm: { name: 'Ember Wyrm', hp: 3500, ad: 100, as: 0.5, range: 3, armor: 30, mr: 30, r: 1.6, gold: 25, xp: 200, model: 'wyrm', epic: true },
  titan: { name: 'Abyss Titan', hp: 9000, ad: 160, as: 0.4, range: 4, armor: 60, mr: 60, r: 2.2, gold: 300, xp: 600, model: 'overlord', epic: true },
};
const CAMP_UNITS = {
  mossback: ['mossback'], brute: ['brute'], wolves: ['wolf', 'pup', 'pup'], duskwings: ['duskwing', 'duskling', 'duskling', 'duskling'],
  bogtoad: ['bogtoad'], stonehulks: ['stonehulk', 'pebblet'],
};

const TOWER = {
  1: { hp: 3000, ad: 155, armor: 50 }, 2: { hp: 3300, ad: 170, armor: 55 }, 3: { hp: 3500, ad: 180, armor: 55 }, 4: { hp: 2700, ad: 170, armor: 55 },
};

const SPREE = { 3: 'is heating up!', 4: 'is on fire!', 5: 'is relentless!', 6: 'is overwhelming!', 7: 'is mythic!', 8: 'is beyond legend!' };
const MULTI = { 2: 'Double Takedown', 3: 'Triple Takedown', 4: 'Quad Takedown', 5: 'TOTAL TAKEDOWN' };

const r2 = v => Math.round(v * 100) / 100;

export class Match {
  constructor({ id, mode = 'ranked', ranked = false, players, seed, hooks = {} }) {
    this.id = id;
    this.mode = mode;
    this.ranked = ranked;
    this.hooks = hooks;
    this.valley = getValley();
    // Skirmish: 3v3 on the middle lane only, faster economy and weaker structures (~10 minutes).
    // Brawl is Skirmish's 5v5 sibling: same one-lane rules, random champions.
    this.skirmish = mode === 'skirmish' || mode === 'brawl';
    this.lanes = this.skirmish ? ['mid'] : LANES;
    this.goldMul = this.skirmish ? 1.7 : 1;
    this.xpMul = this.skirmish ? 1.6 : 1;
    this.map = this.valley.map;
    this.pf = new Pathfinder(this.map);
    this.rng = new RNG(seed ?? (Math.random() * 2 ** 31) | 0);
    this.entities = new Map();
    this.heroes = [];
    this.nextId = 1;
    this.time = 0;
    this.fx = [];
    this.waveT = this.skirmish ? 10 : CFG.minionFirst;
    this.wave = 0;
    this.spawnQueue = [];
    this.kills = { blue: 0, red: 0 };
    this.towersDown = { blue: 0, red: 0 };
    this.wyrms = { blue: 0, red: 0 };
    this.titans = { blue: 0, red: 0 };
    this.firstBlood = false;
    this.ended = false;
    this.winner = null;
    this.surrender = { blue: new Set(), red: new Set() };
    this.visT = 0;
    this.buildStructures();
    this.camps = [];
    for (const team of ['blue', 'red']) for (const c of this.valley.teams[team].camps) this.camps.push({ ...c, side: team, units: [], respawnAt: this.skirmish ? 40 : CFG.campFirst });
    this.epics = {
      wyrm: { pos: this.valley.epic.wyrm, unit: null, respawnAt: CFG.wyrmFirst },
      titan: { pos: this.valley.epic.titan, unit: null, respawnAt: this.skirmish ? Infinity : CFG.titanFirst },
    };
    for (const p of players) this.addHero(p);
  }

  /* ================= setup ================= */
  newId() { return this.nextId++; }
  add(e) { e.id = this.newId(); e.ver = 1; e.buffs = e.buffs || []; e.shields = e.shields || []; this.entities.set(e.id, e); return e; }
  remove(e) { this.entities.delete(e.id); e.removed = true; }
  get(id) { return this.entities.get(id); }
  emit(ev) { this.fx.push(ev); }

  buildStructures() {
    this.structures = { blue: [], red: [] };
    for (const team of ['blue', 'red']) {
      const T = this.valley.teams[team];
      const k = this.skirmish ? 0.38 : 1;
      for (const t of T.towers) {
        if (!this.lanes.includes(t.lane) && t.lane !== 'base') continue;
        const st = TOWER[t.tier];
        this.structures[team].push(this.add({ kind: 'tower', team, lane: t.lane, tier: t.tier, x: t.x, y: t.y, r: 1.0, facing: 0, hp: st.hp * k, maxHp: st.hp * k, armor: st.armor, mr: st.armor, ad: st.ad, as: 0.83, range: 7.5, atkT: 0, target: null, ramp: 0, sight: CFG.towerSight }));
      }
      for (const i of T.spires) {
        if (!this.lanes.includes(i.lane)) continue;
        this.structures[team].push(this.add({ kind: 'spire', team, lane: i.lane, x: i.x, y: i.y, r: 1.3, facing: 0, hp: 2200 * k, maxHp: 2200 * k, armor: 20, mr: 20, respawnAt: 0, sight: 7 }));
      }
      this.structures[team].push(this.add({ kind: 'core', team, x: T.core.x, y: T.core.y, r: 2.2, facing: 0, hp: 4500 * k, maxHp: 4500 * k, armor: 0, mr: 0, sight: 8 }));
    }
  }

  addHero(p) {
    const c = CHAMPIONS[p.champ];
    const T = this.valley.teams[p.team];
    const idx = this.heroes.filter(h => h.team === p.team).length;
    const a = (idx / 5) * Math.PI * 0.6 + (p.team === 'blue' ? -Math.PI / 2 : Math.PI / 2) + 0.2;
    const sx = T.fountain.x + Math.cos(a) * 3, sy = T.fountain.y + Math.sin(a) * 3;
    const h = this.add({
      kind: 'hero', key: p.key, name: p.name, team: p.team, champ: c.id, skin: p.skin || 'base', c, x: sx, y: sy, r: 0.6, facing: p.team === 'blue' ? -Math.PI / 4 : Math.PI * 0.75,
      spawn: { x: sx, y: sy },
      level: 1, xp: 0, gold: START_GOLD, goldEarned: START_GOLD, points: 1,
      ranks: { q: 0, w: 0, e: 0, r: 0 },
      cd: { q: 0, w: 0, e: 0, r: 0, d: 0, f: 0 },
      spells: { d: 'blink', f: SPELLS[p.spell] ? p.spell : 'mend' },
      items: Array(INV_SLOTS).fill(null),
      wards: 2, wardT: 0,
      order: { type: 'idle' }, path: [], pathT: 0, dir: { mx: 0, my: 0 }, atkKey: false,
      atkT: 0, windup: null, dash: null, disp: null, recall: null, pendingCast: null,
      dead: false, respawnAt: 0, kills: 0, deaths: 0, assists: 0, cs: 0, streak: 0, multi: { n: 0, t: -99 },
      dmgToHeroes: 0, dmgTaken: 0, healed: 0, recent: [], recap: null, lastHitBy: new Map(), callHelpT: -99, lastDamagedT: -99,
      session: p.session || null, bot: p.bot ? makeBrain(p) : null, botRole: p.role || null,
      sight: CFG.heroSight, passiveShieldT: 0,
    });
    h.keystone = KEYSTONES[p.keystone] ? p.keystone : defaultKeystone(c.role);
    keystoneOnAdd(this, h);
    this.recompute(h); h.hp = h.maxHp;
    if (this.skirmish) { h.gold = h.goldEarned = 1200; h.level = 3; h.points = 3; h.xp = XP_TO_LEVEL[3]; this.recompute(h); h.hp = h.maxHp; h.mp = h.maxMp; }
    this.heroes.push(h);
    this.recompute(h, true);
    h.hp = h.maxHp; h.mp = h.maxMp;
    return h;
  }

  /* ================= stats ================= */
  recompute(h, init = false) {
    const c = h.c.base;
    const lv = h.level - 1;
    const prevMax = h.maxHp || 0, prevMp = h.maxMp || 0;
    const s = {
      maxHp: c.hp + c.hpG * lv, maxMp: c.mp + c.mpG * lv, ad: c.ad + c.adG * lv, ap: 0,
      armor: c.armor + c.armorG * lv, mr: c.mr + c.mrG * lv, asBonus: c.asG * lv, crit: 0, critBonus: 0,
      msFlat: 0, msPct: 0, haste: 0, lifesteal: 0, armorPen: 0, magicPen: 0, magicPenPct: 0,
      hpRegen: c.hpRegen, mpRegen: c.mpRegen, tenacity: 0, apMult: 0, healAmp: 0, healPower: 0, executioner: 0, dmgBonus: 0, hpPct: 0, dmgReduce: 0, slow: 0,
      thorns: false, burnAura: false, abilitySlow: false, range: h.c.range,
    };
    h.baseStats = { ad: s.ad };
    for (const it of h.items) {
      if (!it) continue;
      const d = ITEMS[it.id];
      const st = d.stats;
      s.ad += st.ad || 0; s.ap += st.ap || 0; s.maxHp += st.hp || 0; s.maxMp += st.mp || 0;
      s.armor += st.armor || 0; s.mr += st.mr || 0; s.asBonus += st.as || 0; s.crit += st.crit || 0;
      s.msFlat += st.ms || 0; s.msPct += st.msPct || 0; s.haste += st.haste || 0; s.lifesteal += st.lifesteal || 0;
      s.armorPen = Math.max(s.armorPen, st.armorPen || 0); s.magicPen += st.magicPen || 0; s.magicPenPct = Math.max(s.magicPenPct, st.magicPenPct || 0);
      s.hpRegen += st.hpRegen || 0; s.mpRegen += st.mpRegen || 0; s.tenacity = Math.max(s.tenacity, st.tenacity || 0);
      if (d.critBonus) s.critBonus += d.critBonus;
      if (d.apMult) s.apMult += d.apMult;
      if (d.healAmp) s.healAmp += d.healAmp;
      if (d.healPower) s.healPower += d.healPower;
      if (d.executioner) s.executioner = Math.max(s.executioner, d.executioner);
      if (d.thorns) s.thorns = true;
      if (d.burnAura) s.burnAura = true;
      if (d.abilitySlow) s.abilitySlow = true;
    }
    for (const b of h.buffs) {
      const st = b.stats;
      if (!st) continue;
      s.ad += st.ad || 0; s.ap += st.ap || 0; s.armor += st.armor || 0; s.mr += st.mr || 0;
      s.asBonus += st.as || 0; s.msPct += st.msPct || 0; s.lifesteal += st.lifesteal || 0; s.haste += st.haste || 0;
      s.mpRegen += st.mpRegen || 0; s.hpRegen += st.hpRegen || 0;
      s.dmgReduce = Math.max(s.dmgReduce, st.dmgReduce || 0);
      s.dmgBonus += st.dmgBonus || 0; s.hpPct += st.hpPct || 0; s.msFlat += st.ms || 0;
      if (st.slow) s.slow = Math.max(s.slow, st.slow);
    }
    const dr = this.wyrms[h.team] || 0;
    s.ad *= 1 + dr * 0.06; s.ap *= 1 + dr * 0.06;
    s.ap *= 1 + s.apMult;
    s.maxHp *= 1 + s.hpPct / 100;
    s.as = Math.min(2.5, h.c.base.as * (1 + s.asBonus / 100));
    s.ms = Math.max(2, (c.ms + s.msFlat) * (1 + s.msPct / 100) * (1 - Math.min(0.9, s.slow)));
    s.crit = Math.min(100, s.crit);
    h.stats = s;
    h.maxHp = Math.round(s.maxHp);
    h.maxMp = Math.round(s.maxMp);
    if (!init) {
      if (h.maxHp > prevMax) h.hp += h.maxHp - prevMax;
      if (h.maxMp > prevMp) h.mp += h.maxMp - prevMp;
      h.hp = Math.min(h.hp, h.maxHp); h.mp = Math.min(h.mp, h.maxMp);
      if (h.maxHp !== prevMax) h.ver++;
    }
  }

  unitStat(u, k) {
    if (u.kind === 'hero') return u.stats[k];
    return u[k] || 0;
  }

  /* ================= queries ================= */
  units() {
    const out = [];
    for (const e of this.entities.values()) if ((e.kind === 'hero' || e.kind === 'minion' || e.kind === 'monster' || e.kind === 'ward') && !e.dead) out.push(e);
    return out;
  }

  targetable(u) {
    if (!u || u.dead || u.removed) return false;
    if (this.hasFlag(u, 'untargetable')) return false;
    return true;
  }

  enemiesNear(team, x, y, r, opts = {}) {
    const out = [];
    for (const e of this.entities.values()) {
      if (e.dead || e.removed || e.team === team) continue;
      if (e.kind !== 'hero' && e.kind !== 'minion' && e.kind !== 'monster') { if (!(opts.structures && (e.kind === 'tower' || e.kind === 'spire' || e.kind === 'core'))) continue; }
      if (opts.heroes && e.kind !== 'hero') continue;
      if (this.hasFlag(e, 'untargetable')) continue;
      if (dist2(x, y, e.x, e.y) <= (r + e.r) * (r + e.r)) out.push(e);
    }
    return out;
  }

  enemiesInCone(team, x, y, a, range, half) {
    return this.enemiesNear(team, x, y, range).filter(e => {
      const d = dist(x, y, e.x, e.y);
      return d < e.r + 0.5 || Math.abs(angleDiff(a, Math.atan2(e.y - y, e.x - x))) <= half;
    });
  }

  alliesNear(team, x, y, r, opts = {}) {
    const out = [];
    for (const e of this.entities.values()) {
      if (e.dead || e.removed || e.team !== team) continue;
      if (e.kind !== 'hero' && (opts.heroes || e.kind !== 'minion')) continue;
      if (dist2(x, y, e.x, e.y) <= (r + e.r) * (r + e.r)) out.push(e);
    }
    return out;
  }

  /* ================= buffs & CC ================= */
  addBuff(u, b) {
    if (!u || u.dead) return;
    const existing = u.buffs.findIndex(x => x.id === b.id);
    const buff = { ...b, t: b.dur, tickT: b.tickEvery || 0 };
    if (existing >= 0) u.buffs[existing] = buff; else u.buffs.push(buff);
    if (u.kind === 'hero' && b.stats) this.recompute(u);
    return buff;
  }
  getBuff(u, id) { return u.buffs.find(b => b.id === id); }
  hasBuff(u, id) { return u.buffs.some(b => b.id === id); }
  removeBuff(u, id) {
    const before = u.buffs.length;
    u.buffs = u.buffs.filter(b => b.id !== id);
    if (u.kind === 'hero' && before !== u.buffs.length) this.recompute(u);
  }
  hasFlag(u, f) { return u.buffs.some(b => b.flags && b.flags[f]); }

  cc(u, kind, dur, val, src) {
    if (!u || u.dead || u.kind === 'tower' || u.kind === 'spire' || u.kind === 'core' || u.kind === 'ward') return;
    if (u.kind === 'monster' && u.def.epic && kind !== 'slow') return;
    if (this.hasFlag(u, 'unstoppable') || this.hasFlag(u, 'untargetable')) return;
    const ten = u.kind === 'hero' ? u.stats.tenacity / 100 : 0;
    if (kind !== 'knockup' && kind !== 'knockback' && kind !== 'pull') dur *= 1 - ten;
    switch (kind) {
      case 'slow': this.addBuff(u, { id: `slow${src ? src.id : 0}`, dur, stats: { slow: val }, cc: 'slow' }); break;
      case 'stun': this.addBuff(u, { id: 'stun', dur: Math.max(dur, this.getBuff(u, 'stun')?.t || 0), flags: { stun: true }, cc: 'stun' }); break;
      case 'knockup': this.addBuff(u, { id: 'knockup', dur, flags: { stun: true, airborne: true }, cc: 'knockup' }); break;
      case 'root': this.addBuff(u, { id: 'root', dur, flags: { root: true }, cc: 'root' }); break;
      case 'silence': this.addBuff(u, { id: 'silence', dur, flags: { silence: true }, cc: 'silence' }); break;
      case 'knockback':
      case 'pull': {
        let [nx, ny] = normalize(u.x - src.x, u.y - src.y);
        if (!nx && !ny) nx = 1;
        let d = val;
        if (kind === 'pull') { nx = -nx; ny = -ny; d = Math.min(val, Math.max(0, dist(u.x, u.y, src.x, src.y) - 1.2)); }
        u.disp = { vx: nx * d / dur, vy: ny * d / dur, t: dur };
        this.addBuff(u, { id: 'displaced', dur, flags: { stun: true }, cc: 'knockup' });
        break;
      }
      default:
    }
    if (u.kind === 'hero') { u.recall = null; if (kind !== 'slow') { u.windup = null; } }
    if (kind !== 'slow') this.emit({ e: 'cc', id: u.id, k: kind, d: r2(dur) });
  }

  cleanse(u) {
    u.buffs = u.buffs.filter(b => !b.cc);
    u.disp = null;
    if (u.kind === 'hero') this.recompute(u);
  }

  reveal(u, dur) { this.addBuff(u, { id: 'revealed', dur, flags: { revealed: true } }); }

  canAct(u) { return !this.hasFlag(u, 'stun'); }
  canMove(u) { return !this.hasFlag(u, 'stun') && !this.hasFlag(u, 'root'); }
  canCast(u) { return !this.hasFlag(u, 'stun') && !this.hasFlag(u, 'silence'); }

  /* ================= damage ================= */
  structureProtected(s) {
    const own = this.structures[s.team];
    if (s.kind === 'tower') {
      if (s.tier === 1) return false;
      if (s.tier === 4) return !own.some(o => o.kind === 'spire' && o.dead);
      return own.some(o => o.kind === 'tower' && o.lane === s.lane && o.tier < s.tier && !o.dead);
    }
    if (s.kind === 'spire') return own.some(o => o.kind === 'tower' && o.lane === s.lane && !o.dead);
    if (s.kind === 'core') return own.some(o => o.kind === 'tower' && o.tier === 4 && !o.dead);
    return false;
  }

  heroOf(src) {
    if (!src) return null;
    if (src.kind === 'hero') return src;
    if (src.ownerHero) return this.get(src.ownerHero);
    return null;
  }

  damage(src, tgt, amount, type = 'physical', opts = {}) {
    if (!tgt || tgt.dead || tgt.removed || this.ended) return 0;
    if (this.hasFlag(tgt, 'untargetable') || this.hasFlag(tgt, 'invulnerable')) return 0;
    const isStructure = tgt.kind === 'tower' || tgt.kind === 'spire' || tgt.kind === 'core';
    if (isStructure && this.skirmish && this.time > 720) amount *= tgt.kind === 'core' ? 2 : 1.5; // Skirmish sudden death (after 12:00)
    if (isStructure) {
      if (opts.ability || this.structureProtected(tgt)) return 0;
      // Structures take less damage when the attacker has no minion escort (anti-backdoor).
      if (src && src.kind === 'hero' && tgt.kind !== 'core' && !this.alliesNear(src.team, tgt.x, tgt.y, 9).some(m => m.kind === 'minion')) amount *= 0.66;
    }
    if (src && src.team === tgt.team) return 0;
    let res = 0;
    if (type === 'physical') {
      res = this.unitStat(tgt, 'armor');
      if (src && src.kind === 'hero') res *= 1 - src.stats.armorPen / 100;
    } else if (type === 'magic') {
      res = this.unitStat(tgt, 'mr');
      if (src && src.kind === 'hero') res = res * (1 - src.stats.magicPenPct / 100) - src.stats.magicPen;
    }
    let dmg = type === 'true' ? amount : amount * (res >= 0 ? 100 / (100 + res) : 2 - 100 / (100 - res));
    if (tgt.kind === 'hero' && tgt.stats.dmgReduce) dmg *= 1 - tgt.stats.dmgReduce / 100;
    const srcHero = src && src.kind === 'hero' ? src : null;
    if (srcHero && tgt.kind === 'hero') {
      if (srcHero.stats.executioner && tgt.hp < tgt.maxHp * 0.4) dmg *= 1 + srcHero.stats.executioner;
      if (srcHero.stats.dmgBonus) dmg *= 1 + srcHero.stats.dmgBonus / 100;
    }
    if (tgt.kind === 'minion' && tgt.empowered) dmg *= 0.5;
    // Junglers (Hunter's Strike carriers) deal more to monsters and take less from them.
    if (tgt.kind === 'monster' && src && src.kind === 'hero' && (src.spells.d === 'strike' || src.spells.f === 'strike')) dmg *= 1.5;
    if (src && src.kind === 'monster' && tgt.kind === 'hero' && (tgt.spells.d === 'strike' || tgt.spells.f === 'strike')) dmg *= 0.7;
    if (src && src.kind === 'minion' && src.empowered) dmg *= 1.5;
    dmg = Math.max(0, dmg);
    // Shields absorb first.
    let absorbed = 0;
    for (const s of tgt.shields) {
      if (dmg <= 0) break;
      const a = Math.min(s.amt, dmg);
      s.amt -= a; dmg -= a; absorbed += a;
    }
    tgt.shields = tgt.shields.filter(s => s.amt > 0.5);
    tgt.hp -= dmg;
    const total = dmg + absorbed;
    const hero = this.heroOf(src);
    if (tgt.kind === 'hero') {
      tgt.dmgTaken += total;
      if (total >= 1) this.recordDamage(tgt, src, opts, type, total);
      tgt.lastDamagedT = this.time;
      tgt.recall = null;
      if (hero) tgt.lastHitBy.set(hero.id, this.time);
      if (hero && src.kind === 'hero') hero.callHelpT = this.time;
      for (const b of tgt.buffs) if (b.onDamaged) b.onDamaged(src);
      if (opts.attack && tgt.stats.thorns && src && src.kind === 'hero' && !opts.reflect) this.damage(tgt, src, 15 + tgt.stats.armor * 0.12, 'magic', { reflect: true });
    }
    if (hero) {
      if (tgt.kind === 'hero') hero.dmgToHeroes += total;
      if (opts.attack && hero.stats.lifesteal && src === hero) this.heal(hero, hero, total * hero.stats.lifesteal / 100, { quiet: true });
      if (opts.ability && hero.stats.abilitySlow && !opts.reflect) this.cc(tgt, 'slow', 1, 0.2, hero);
      if (opts.ability && hero.c.onAbilityHit && !opts.noPassive) hero.c.onAbilityHit(this, hero, tgt);
      if (bushAt(this.valley, hero.x, hero.y) >= 0) this.reveal(hero, 1);
    }
    if (tgt.kind === 'monster' && src) this.monsterAggro(tgt, src);
    if (srcHero && tgt.kind === 'hero' && total >= 1 && srcHero.team !== tgt.team) keystoneOnHit(this, srcHero, tgt, opts);
    if (total >= 1) this.emit({ e: 'dmg', id: tgt.id, v: Math.round(total), t: type[0], c: opts.crit ? 1 : 0, s: src ? src.id : 0, x: tgt.x, y: tgt.y });
    if (tgt.hp <= 0) { tgt.hp = 0; this.kill(tgt, src); }
    return total;
  }

  heal(src, tgt, amount, opts = {}) {
    if (!tgt || tgt.dead) return 0;
    if (tgt.kind === 'hero') amount *= 1 + tgt.stats.healAmp;
    if (src && src !== tgt && src.kind === 'hero' && src.stats.healPower) amount *= 1 + src.stats.healPower;
    if (this.hasBuff(tgt, 'grievous')) amount *= 0.6;
    const before = tgt.hp;
    tgt.hp = Math.min(tgt.maxHp, tgt.hp + amount);
    const v = tgt.hp - before;
    if (src && src.kind === 'hero') src.healed += v;
    if (v >= 2 && !opts.quiet) this.emit({ e: 'heal', id: tgt.id, v: Math.round(v), x: tgt.x, y: tgt.y });
    return v;
  }

  shield(tgt, amount, dur) {
    if (!tgt || tgt.dead) return;
    if (tgt.kind === 'hero') amount *= 1 + tgt.stats.healAmp;
    const by = this.caster;
    if (by && by !== tgt && by.stats.healPower) amount *= 1 + by.stats.healPower;
    tgt.shields.push({ amt: amount, t: dur });
    this.emit({ e: 'shield', id: tgt.id, x: tgt.x, y: tgt.y });
  }

  /* ================= kills & rewards ================= */
  addGold(h, g) { if (h) { g *= this.goldMul; h.gold += g; h.goldEarned += g; } }

  addXp(h, xp) {
    if (!h || h.level >= MAX_LEVEL) return;
    h.xp += xp * this.xpMul;
    let up = false;
    while (h.level < MAX_LEVEL && h.xp >= XP_TO_LEVEL[h.level + 1]) { h.level++; h.points++; up = true; }
    if (up) {
      const hpPct = h.hp / h.maxHp;
      this.recompute(h);
      h.hp = Math.max(h.hp, h.maxHp * hpPct);
      h.ver++;
      this.emit({ e: 'levelup', id: h.id, x: h.x, y: h.y, l: h.level });
    }
  }

  shareXp(team, x, y, amount, killer) {
    const near = this.heroes.filter(h => h.team === team && !h.dead && dist(h.x, h.y, x, y) <= 13);
    if (killer && killer.team === team && !near.includes(killer) && !killer.dead) near.push(killer);
    if (!near.length) return;
    const each = amount * (1 + 0.15 * (near.length - 1)) / near.length;
    for (const h of near) this.addXp(h, each);
  }

  /* Death recap: damage a champion took in the last 15s, grouped by source. */
  recordDamage(tgt, src, opts, type, total) {
    const hero = this.heroOf(src);
    let key, info;
    if (src && src.kind === 'hero') { key = `${src.id}:${opts.ability ? 'a' : opts.attack ? 'b' : 'o'}`; info = { k: 'hero', c: src.champ, n: src.name, l: opts.ability ? 'Abilities' : opts.attack ? 'Basic attacks' : 'Effects' }; }
    else if (src && (src.kind === 'tower' || src.kind === 'spire' || src.kind === 'core')) { key = 'tower'; info = { k: 'tower', n: 'Tower', l: 'Tower shots' }; }
    else if (src && src.kind === 'minion') { key = 'minion'; info = { k: 'minion', n: 'Minions', l: 'Attacks' }; }
    else if (src && src.kind === 'monster') { key = `mon:${src.mtype}`; info = { k: 'monster', n: src.name, l: 'Attacks', m: src.mtype }; }
    else if (hero) { key = `${hero.id}:o`; info = { k: 'hero', c: hero.champ, n: hero.name, l: 'Effects' }; }
    else { key = 'other'; info = { k: 'other', n: 'Unknown', l: '' }; }
    tgt.recent.push({ t: this.time, key, info, type: type[0], v: total });
    while (tgt.recent.length && this.time - tgt.recent[0].t > 15) tgt.recent.shift();
  }

  deathRecap(tgt, killer) {
    const rows = new Map();
    for (const r of tgt.recent) {
      if (this.time - r.t > 15) continue;
      const row = rows.get(r.key) || { ...r.info, v: 0, p: 0, m: 0, tr: 0 };
      row.v += r.v;
      if (r.type === 'p') row.p += r.v; else if (r.type === 'm') row.m += r.v; else row.tr += r.v;
      rows.set(r.key, row);
    }
    tgt.recent = [];
    const list = [...rows.values()].sort((a, b) => b.v - a.v).slice(0, 6).map(r => ({ ...r, v: Math.round(r.v), p: Math.round(r.p), m: Math.round(r.m), tr: Math.round(r.tr) }));
    return { by: killer ? { n: killer.name, c: killer.champ } : null, total: list.reduce((a, r) => a + r.v, 0), rows: list, at: Math.round(this.time) };
  }

  kill(tgt, src) {
    if (tgt.dead) return;
    tgt.dead = true;
    tgt.deadT = this.time;
    tgt.disp = null; tgt.dash = null;
    let killer = this.heroOf(src);
    if (!killer && tgt.kind === 'hero') {
      // Credit the champion who last damaged the victim within the assist window.
      let best = null, bt = -1;
      for (const [hid, t] of tgt.lastHitBy) if (this.time - t <= CFG.assistWindow && t > bt) { bt = t; best = this.get(hid); }
      killer = best;
    }
    this.emit({ e: 'death', id: tgt.id, x: tgt.x, y: tgt.y, k: tgt.kind });
    if (tgt.kind === 'hero') tgt.recap = this.deathRecap(tgt, killer);
    switch (tgt.kind) {
      case 'hero': return this.heroKilled(tgt, killer, src);
      case 'minion': {
        if (killer && killer.team !== tgt.team) {
          this.addGold(killer, tgt.gold);
          killer.cs++;
          this.emit({ e: 'gold', to: killer.id, v: tgt.gold, x: tgt.x, y: tgt.y });
        }
        this.shareXp(enemyOf(tgt.team), tgt.x, tgt.y, tgt.xp, killer);
        return;
      }
      case 'monster': return this.monsterKilled(tgt, killer);
      case 'ward': return;
      case 'tower': case 'spire': case 'core': return this.structureKilled(tgt, killer, src);
      default:
    }
  }

  heroKilled(v, killer, src) {
    v.deaths++;
    v.recall = null; v.windup = null; v.pendingCast = null; v.path = []; v.order = { type: 'idle' };
    v.buffs = v.buffs.filter(b => b.dur === Infinity); // keystone effects survive death
    v.shields = [];
    this.recompute(v);
    const respawn = Math.min(40, 5 + v.level * 1.8 + Math.max(0, this.time / 60 - 12) * 0.8);
    v.respawnAt = this.time + respawn * (this.skirmish ? 0.6 : 1);
    const team = enemyOf(v.team);
    this.kills[team]++;
    const assisters = this.heroes.filter(h => h.team === team && h !== killer && [...v.lastHitBy].some(([id, t]) => id === h.id && this.time - t <= CFG.assistWindow));
    let bounty = 300;
    if (!this.firstBlood) { bounty += 100; this.firstBlood = true; this.announce('First Strike!', 'kill', { killer, victim: v, key: 'first_strike' }); }
    if (v.streak >= 3) { const sd = Math.min(500, 100 * (v.streak - 2)); bounty += sd; this.announce(`${killer ? killer.name : 'The enemy'} ended ${v.name}'s streak!`, 'kill', { key: 'streak_end' }); }
    if (killer && killer.kind === 'hero') {
      killer.kills++;
      killer.streak++;
      this.addGold(killer, bounty);
      this.emit({ e: 'gold', to: killer.id, v: bounty, x: v.x, y: v.y });
      if (this.time - killer.multi.t <= 10) killer.multi.n++; else killer.multi.n = 1;
      killer.multi.t = this.time;
      if (MULTI[killer.multi.n]) this.announce(`${killer.name} — ${MULTI[killer.multi.n]}!`, 'multi', { killer, victim: v, key: `multi${killer.multi.n}` });
      else if (SPREE[Math.min(8, killer.streak)] && killer.streak >= 3) this.announce(`${killer.name} ${SPREE[Math.min(8, killer.streak)]}`, 'spree', { killer, key: `streak${Math.min(8, killer.streak)}` });
    }
    const assistGold = assisters.length ? Math.floor(bounty * 0.5 / assisters.length) : 0;
    for (const a of assisters) { a.assists++; this.addGold(a, assistGold); }
    const xp = 60 + 40 * v.level;
    const near = [killer, ...assisters].filter(h => h && h.kind === 'hero');
    for (const h of near) this.addXp(h, xp / Math.max(1, near.length) * (near.length > 1 ? 1.2 : 1));
    v.streak = 0;
    v.lastHitBy.clear();
    this.emit({ e: 'kill', k: killer ? killer.id : 0, v: v.id, a: assisters.map(a => a.id) });
    if (this.hooks.feed) this.hooks.feed(this, killer, v, assisters);
    if (this.heroes.filter(h => h.team === v.team).every(h => h.dead)) this.announce(`TEAM WIPE! ${team === 'blue' ? 'Blue' : 'Red'} team defeated every enemy!`, 'ace', { team, key: 'team_wipe' });
    v.x = v.spawn.x; v.y = v.spawn.y;
  }

  structureKilled(s, killer) {
    const team = enemyOf(s.team);
    if (s.kind === 'tower') {
      this.towersDown[team]++;
      for (const h of this.heroes) if (h.team === team) { this.addGold(h, 150); this.addXp(h, 50); }
      this.announce(`${team === 'blue' ? 'Blue' : 'Red'} team destroyed a ${s.lane === 'base' ? 'core' : s.lane} tower!`, 'tower', { team, key: 'tower' });
    } else if (s.kind === 'spire') {
      s.respawnAt = this.skirmish ? Infinity : this.time + CFG.spireRespawn; // Skirmish spires stay down
      for (const h of this.heroes) if (h.team === team) this.addGold(h, 50);
      this.announce(`${team === 'blue' ? 'Blue' : 'Red'} team destroyed the ${s.lane} spire! Juggernaut minions incoming.`, 'spire', { team, key: 'spire' });
    } else if (s.kind === 'core') {
      this.end(team, 'core');
    }
    s.ver++;
    void killer;
  }

  /* ================= structures ================= */
  updateTower(t, dt) {
    if (t.dead) return;
    t.atkT -= dt;
    const range = t.range;
    const inRange = u => u && !u.dead && !u.removed && u.team !== t.team && this.targetable(u) && dist(t.x, t.y, u.x, u.y) <= range + u.r && (u.kind === 'hero' || u.kind === 'minion') && this.visibleTo(u, t.team);
    let tgt = t.target ? this.get(t.target) : null;
    if (!inRange(tgt)) { tgt = null; t.ramp = 0; }
    // Call for help: a champion who attacks an allied champion near the tower becomes the target.
    if (!tgt || tgt.kind === 'minion') {
      for (const h of this.heroes) {
        if (h.team === t.team || !inRange(h)) continue;
        if (this.time - h.callHelpT < 2 && this.heroes.some(a => a.team === t.team && !a.dead && dist(a.x, a.y, t.x, t.y) <= range + 2 && this.time - a.lastDamagedT < 2 && a.lastHitBy.get(h.id) >= this.time - 2)) {
          tgt = h; t.ramp = 0; break;
        }
      }
    }
    if (!tgt) {
      let best = null, bd = Infinity;
      for (const e of this.entities.values()) {
        if (e.kind !== 'minion' || !inRange(e)) continue;
        const d = dist2(t.x, t.y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) for (const h of this.heroes) { if (!inRange(h)) continue; const d = dist2(t.x, t.y, h.x, h.y); if (d < bd) { bd = d; best = h; } }
      tgt = best;
    }
    t.target = tgt ? tgt.id : null;
    if (tgt && t.atkT <= 0) {
      t.atkT = 1 / t.as;
      const minutes = this.time / 60;
      this.emit({ e: 'tshot', id: t.id, x: t.x, y: t.y });
      this.projectile(t, tgt, { speed: 16, style: 'tower', onHit: u => {
        if (u.kind === 'minion') {
          const pct = u.mtype === 'melee' ? 0.45 : u.mtype === 'caster' ? 0.7 : u.mtype === 'siege' ? 0.14 : 0.08;
          this.damage(t, u, u.maxHp * pct, 'true');
        } else {
          this.damage(t, u, t.ad * (1 + minutes * 0.03) * (1 + 0.4 * Math.min(3, t.ramp)), 'physical');
          t.ramp++;
        }
      } });
    }
  }

  /* ================= minions ================= */
  spawnWave() {
    this.wave++;
    const scale = Math.floor(this.time / 90);
    for (const team of ['blue', 'red']) {
      for (const lane of this.lanes) {
        const types = ['melee', 'melee', 'melee'];
        if (this.wave % 3 === 0) types.push('siege');
        types.push('caster', 'caster', 'caster');
        if (this.skirmish && this.time > 600) types.push('super'); // Skirmish sudden death: juggernauts every wave after 10:00
        const enemySpiresDown = this.structures[enemyOf(team)].filter(s => s.kind === 'spire' && s.dead);
        if (enemySpiresDown.some(s => s.lane === lane)) {
          const si = types.indexOf('siege');
          if (si >= 0) types[si] = 'super'; else types.splice(3, 0, 'super');
          if (enemySpiresDown.length === 3) types.push('super');
        }
        types.forEach((mtype, i) => this.spawnQueue.push({ at: this.time + i * 0.7, team, lane, mtype, scale }));
      }
    }
    this.spawnQueue.sort((a, b) => a.at - b.at);
  }

  spawnMinion({ team, lane, mtype, scale }) {
    const d = MINIONS[mtype];
    const path = this.valley.teams[team].paths[lane];
    const p0 = path[0];
    const hp = d.hp + scale * (mtype === 'caster' ? 12 : 22);
    return this.add({
      kind: 'minion', mtype, team, lane, path, wp: 1, x: p0.x + this.rng.range(-0.5, 0.5), y: p0.y + this.rng.range(-0.5, 0.5), r: d.r, facing: 0,
      hp, maxHp: hp, ad: d.ad + scale * (mtype === 'caster' ? 1.5 : 1), as: d.as, range: d.range, ms: d.ms, armor: d.armor, mr: d.mr, ranged: d.ranged,
      gold: d.gold + Math.floor(scale * 0.5), xp: d.xp, atkT: 0, target: null, thinkT: this.rng.range(0, 0.25), sight: CFG.minionSight,
    });
  }

  updateMinion(m, dt) {
    m.atkT -= dt;
    m.thinkT -= dt;
    const titan = this.heroes.some(h => h.team === m.team && !h.dead && this.hasBuff(h, 'titan') && dist(h.x, h.y, m.x, m.y) < 10);
    m.empowered = titan;
    if (this.hasFlag(m, 'stun')) return this.applyDisp(m, dt);
    let tgt = m.target ? this.get(m.target) : null;
    const valid = u => u && !u.dead && !u.removed && u.team !== m.team && this.targetable(u) && (u.kind === 'tower' || u.kind === 'spire' || u.kind === 'core' ? !this.structureProtected(u) || u.kind === 'tower' : true) && this.visibleTo(u, m.team);
    if (!valid(tgt) || dist(m.x, m.y, tgt.x, tgt.y) > 8) tgt = null;
    if (m.thinkT <= 0) {
      m.thinkT = 0.3;
      const acq = 6.5;
      let best = null, bs = Infinity;
      for (const e of this.entities.values()) {
        if (e.team === m.team || e.dead || e.removed) continue;
        if (!['hero', 'minion', 'tower', 'spire', 'core', 'ward'].includes(e.kind)) continue;
        if (!valid(e)) continue;
        const d = dist(m.x, m.y, e.x, e.y) - e.r;
        if (d > acq) continue;
        let pri;
        if (e.kind === 'hero') pri = this.time - e.callHelpT < 2 && this.heroes.some(a => a.team === m.team && a.lastHitBy.get(e.id) >= this.time - 2 && dist(a.x, a.y, m.x, m.y) < 9) ? 0 : 3;
        else if (e.kind === 'minion') pri = 1;
        else if (e.kind === 'ward') pri = 4;
        else pri = this.structureProtected(e) ? 9 : 2;
        if (pri === 9) continue;
        const score = pri * 100 + d;
        if (score < bs) { bs = score; best = e; }
      }
      if (best && (!tgt || (best.kind === 'hero' && bs < 100))) tgt = best;
      if (!tgt) tgt = best;
    }
    m.target = tgt ? tgt.id : null;
    if (tgt) {
      const d = dist(m.x, m.y, tgt.x, tgt.y);
      if (d <= m.range + m.r + tgt.r) {
        m.facing = Math.atan2(tgt.y - m.y, tgt.x - m.x);
        if (m.atkT <= 0) {
          m.atkT = 1 / m.as;
          if (m.ranged) this.projectile(m, tgt, { speed: 14, style: m.mtype === 'siege' ? 'cannon' : 'minion', onHit: u => this.damage(m, u, m.ad, 'physical', { attack: true }) });
          else { this.damage(m, tgt, m.ad, 'physical', { attack: true }); this.emit({ e: 'atk', id: m.id }); }
        }
      } else this.stepUnit(m, tgt.x, tgt.y, m.ms, dt);
    } else {
      const wp = m.path[Math.min(m.wp, m.path.length - 1)];
      if (dist(m.x, m.y, wp.x, wp.y) < 2 && m.wp < m.path.length - 1) m.wp++;
      this.stepUnit(m, wp.x, wp.y, m.ms, dt);
    }
    // Separation.
    for (const o of this.entities.values()) {
      if (o === m || o.kind !== 'minion' || o.dead) continue;
      const dx = m.x - o.x, dy = m.y - o.y, min = m.r + o.r;
      const dd = dx * dx + dy * dy;
      if (dd > 0.0001 && dd < min * min) {
        const d = Math.sqrt(dd), push = (min - d) * 0.5;
        moveCircle(this.map, m, dx / d * push, dy / d * push);
      }
    }
  }

  stepUnit(u, tx, ty, speed, dt) {
    const [nx, ny] = normalize(tx - u.x, ty - u.y);
    if (!nx && !ny) return;
    const step = Math.min(speed * dt, dist(u.x, u.y, tx, ty));
    moveCircle(this.map, u, nx * step, ny * step);
    u.facing = Math.atan2(ny, nx);
  }

  applyDisp(u, dt) {
    if (!u.disp) return;
    const s = Math.min(dt, u.disp.t);
    moveCircle(this.map, u, u.disp.vx * s, u.disp.vy * s);
    u.disp.t -= s;
    if (u.disp.t <= 0) u.disp = null;
  }

  /* ================= jungle ================= */
  spawnCamp(camp) {
    const minutes = this.time / 60;
    camp.units = CAMP_UNITS[camp.type].map((type, i) => {
      const a = (i / CAMP_UNITS[camp.type].length) * Math.PI * 2;
      const off = i === 0 ? 0 : 1.6;
      return this.spawnMonster(type, camp.x + Math.cos(a) * off, camp.y + Math.sin(a) * off, minutes, camp);
    });
  }

  spawnMonster(type, x, y, minutes, camp = null) {
    const d = MONSTERS[type];
    const scale = 1 + minutes * (d.epic ? 0.07 : 0.05);
    const [sx, sy] = findFreeSpot(this.map, x, y, d.r);
    return this.add({
      kind: 'monster', mtype: type, def: d, name: d.name, team: 'neutral', x: sx, y: sy, r: d.r, facing: Math.PI / 2,
      hp: Math.round(d.hp * scale), maxHp: Math.round(d.hp * scale), ad: d.ad * scale, as: d.as, range: d.range, armor: d.armor, mr: d.mr,
      ms: 4.2, home: { x: sx, y: sy }, target: null, atkT: 0, specialT: 6, camp, ranged: !!d.ranged,
      gold: d.gold, xp: Math.round(d.xp * (1 + minutes * 0.04)), sight: 0,
    });
  }

  monsterAggro(m, src) {
    const hero = src.kind === 'hero' ? src : null;
    if (!hero) return;
    if (!m.target) m.target = hero.id;
    // The whole camp joins in.
    if (m.camp) for (const u of m.camp.units) if (!u.dead && !u.target) u.target = hero.id;
  }

  updateMonster(m, dt) {
    m.atkT -= dt;
    m.specialT -= dt;
    if (this.hasFlag(m, 'stun')) return this.applyDisp(m, dt);
    let t = m.target ? this.get(m.target) : null;
    const fromHome = dist(m.x, m.y, m.home.x, m.home.y);
    if (!t || t.dead || t.removed || fromHome > (m.def.epic ? 11 : 8.5) || dist(t.x, t.y, m.home.x, m.home.y) > (m.def.epic ? 14 : 11)) {
      m.target = null;
      t = null;
      if (fromHome > 0.5) { this.stepUnit(m, m.home.x, m.home.y, m.ms * 1.5, dt); m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.3 * dt); }
      else m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.1 * dt);
      return;
    }
    const d = dist(m.x, m.y, t.x, t.y);
    if (m.def.epic && m.specialT <= 0) {
      m.specialT = m.mtype === 'titan' ? 7 : 6;
      const radius = m.mtype === 'titan' ? 5 : 4.5;
      this.area(m, { x: m.x, y: m.y, radius, dur: 1.0, style: 'telegraph', hostileTo: 'all', onEnd: a => {
        for (const e of this.entities.values()) {
          if ((e.kind !== 'hero' && e.kind !== 'minion') || e.dead || dist(e.x, e.y, a.x, a.y) > a.radius + e.r) continue;
          this.damage(m, e, m.ad * 1.4, 'magic');
          if (m.mtype === 'titan') this.cc(e, 'knockback', 0.3, 3, m);
        }
        this.emit({ e: 'boom', x: a.x, y: a.y, r: a.radius, c: m.mtype === 'titan' ? 'void' : 'fire' });
      } });
    }
    if (d <= m.range + m.r + t.r) {
      m.facing = Math.atan2(t.y - m.y, t.x - m.x);
      if (m.atkT <= 0) {
        m.atkT = 1 / m.as;
        if (m.ranged) this.projectile(m, t, { speed: 12, style: 'orb', onHit: u => this.damage(m, u, m.ad, 'physical') });
        else { this.damage(m, t, m.ad, 'physical'); this.emit({ e: 'atk', id: m.id }); }
      }
    } else this.stepUnit(m, t.x, t.y, m.ms, dt);
  }

  monsterKilled(m, killer) {
    if (!killer) return;
    const team = killer.team;
    this.addGold(killer, m.gold);
    killer.cs += m.def.small ? 1 : 2;
    this.emit({ e: 'gold', to: killer.id, v: m.gold, x: m.x, y: m.y });
    this.shareXp(team, m.x, m.y, m.xp, killer);
    if (m.def.buff === 'blue') {
      this.addBuff(killer, { id: 'sageBuff', dur: 90, stats: { haste: 15, mpRegen: 6 } });
      this.announce(`${killer.name} took the Sage's Insight buff`, 'buff', { team, private: true });
    } else if (m.def.buff === 'red') {
      this.addBuff(killer, { id: 'brandBuff', dur: 90, stats: { hpRegen: 3 }, onAttack: u => { this.addBuff(u, { id: 'brandBurn', dur: 3, tickEvery: 1, onTick: () => this.damage(killer, u, 6 + 2 * killer.level, 'true'), stats: u.kind === 'hero' ? { slow: 0.1 } : undefined }); } });
    }
    if (m.mtype === 'wyrm') {
      this.wyrms[team] = Math.min(4, this.wyrms[team] + 1);
      for (const h of this.heroes) if (h.team === team) { this.addGold(h, 25); this.recompute(h); }
      this.epics.wyrm.unit = null;
      this.epics.wyrm.respawnAt = this.time + CFG.wyrmRespawn;
      this.announce(`${team === 'blue' ? 'Blue' : 'Red'} team slew the Ember Wyrm! (+${this.wyrms[team] * 6}% damage)`, 'epic', { team, key: 'wyrm' });
    } else if (m.mtype === 'titan') {
      for (const h of this.heroes) if (h.team === team && !h.dead) { this.addGold(h, 300); this.addBuff(h, { id: 'titan', dur: 150, stats: { ad: 30, ap: 50 } }); }
      this.titans[team]++;
      this.epics.titan.unit = null;
      this.epics.titan.respawnAt = this.time + CFG.titanRespawn;
      this.announce(`${team === 'blue' ? 'Blue' : 'Red'} team slew the Abyss Titan! Minions empowered.`, 'epic', { team, key: 'titan' });
    }
    if (m.camp && m.camp.units.every(u => u.dead)) m.camp.respawnAt = this.time + (m.camp.buff ? 150 : 110);
  }

  /* ================= projectiles & areas ================= */
  projectile(src, tgt, o) {
    return this.add({ kind: 'proj', homing: true, team: src.team, src, ownerHero: src.kind === 'hero' ? src.id : null, x: src.x, y: src.y, r: 0.2, facing: 0, target: tgt.id, speed: o.speed, onHit: o.onHit, style: o.style });
  }

  homing(src, tgt, o) { return this.projectile(src, tgt, o); }

  skillshot(src, o) {
    const sx = src.x + Math.cos(o.angle) * src.r, sy = src.y + Math.sin(o.angle) * src.r;
    return this.add({ kind: 'proj', homing: false, team: src.team, src, ownerHero: src.kind === 'hero' ? src.id : null, x: sx, y: sy, r: o.width / 2, facing: o.angle, angle: o.angle,
      vx: Math.cos(o.angle) * o.speed, vy: Math.sin(o.angle) * o.speed, speed: o.speed, range: o.range, traveled: 0, pierce: !!o.pierce, heroesOnly: !!o.heroesOnly,
      onHit: o.onHit, hit: new Set(), style: o.style, done: false });
  }

  beam(src, o) {
    const len = o.length;
    const x2 = src.x + Math.cos(o.angle) * len, y2 = src.y + Math.sin(o.angle) * len;
    const sx = src.x, sy = src.y;
    return this.area(src, { x: (sx + x2) / 2, y: (sy + y2) / 2, radius: len / 2, dur: o.delay, style: `beam:${o.style}`, angle: o.angle, length: len, width: o.width, onEnd: () => {
      for (const e of this.enemiesNear(src.team, (sx + x2) / 2, (sy + y2) / 2, len / 2 + 1)) {
        // distance from segment
        const t = Math.max(0, Math.min(1, ((e.x - sx) * (x2 - sx) + (e.y - sy) * (y2 - sy)) / (len * len)));
        const px = sx + (x2 - sx) * t, py = sy + (y2 - sy) * t;
        if (dist(e.x, e.y, px, py) <= o.width / 2 + e.r) o.onHit(e);
      }
      this.emit({ e: 'beam', x: sx, y: sy, x2, y2, w: o.width, c: o.style });
    } });
  }

  area(src, o) {
    return this.add({ kind: 'area', team: src.team, src, ownerHero: src.kind === 'hero' ? src.id : null, x: o.x, y: o.y, r: o.radius, radius: o.radius, facing: o.angle || 0,
      dur: o.dur, life: o.dur, tickEvery: o.tickEvery || 0, tickT: o.tickEvery || 0, onTick: o.onTick, onEnd: o.onEnd, onStart: o.onStart, follow: o.follow,
      style: o.style, length: o.length, width: o.width, started: false });
  }

  trap(src, o) {
    const mine = [...this.entities.values()].filter(e => e.kind === 'trap' && e.src === src);
    if (mine.length >= (o.max || 3)) this.remove(mine[0]);
    return this.add({ kind: 'trap', team: src.team, src, ownerHero: src.id, x: o.x, y: o.y, r: o.radius, facing: 0, life: o.life, onTrigger: o.onTrigger, armT: 0.8 });
  }

  dash(u, tx, ty, speed, o = {}) {
    const d = dist(u.x, u.y, tx, ty);
    u.dash = { tx, ty, speed, t: d / speed + 0.05, onEnd: o.onEnd, stopAt: o.stopAt || 0, target: o.stopAt ? this.closestTo(tx, ty) : null };
    if (o.unstoppable) this.addBuff(u, { id: 'unstoppable', dur: d / speed + 0.1, flags: { unstoppable: true } });
    u.windup = null; u.recall = null; u.path = [];
    this.emit({ e: 'dash', id: u.id, x: u.x, y: u.y });
  }

  closestTo(x, y) {
    let best = null, bd = 1.5;
    for (const e of this.entities.values()) if ((e.kind === 'hero' || e.kind === 'minion' || e.kind === 'monster') && !e.dead) { const d = dist(x, y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
    return best;
  }

  blink(u, x, y) {
    const [fx, fy] = findFreeSpot(this.map, x, y, u.r);
    this.emit({ e: 'blink', id: u.id, x: u.x, y: u.y, x2: fx, y2: fy });
    u.x = fx; u.y = fy;
    u.path = []; u.windup = null;
  }

  resetAttack(h) { h.atkT = 0; }

  updateProjectile(p, dt) {
    if (p.homing) {
      const t = this.get(p.target);
      if (!t || t.dead || t.removed) { this.remove(p); return; }
      const d = dist(p.x, p.y, t.x, t.y);
      const step = p.speed * dt;
      p.facing = Math.atan2(t.y - p.y, t.x - p.x);
      if (d <= step + t.r) {
        this.remove(p);
        if (!this.hasFlag(t, 'untargetable')) p.onHit(t);
        return;
      }
      p.x += Math.cos(p.facing) * step; p.y += Math.sin(p.facing) * step;
      return;
    }
    const total = p.speed * dt;
    const steps = Math.max(1, Math.ceil(total / 0.4));
    for (let s = 0; s < steps; s++) {
      const sx = p.vx * dt / steps, sy = p.vy * dt / steps;
      p.x += sx; p.y += sy;
      p.traveled += total / steps;
      for (const e of this.entities.values()) {
        if (e.dead || e.removed || e.team === p.team || p.hit.has(e.id)) continue;
        if (e.kind !== 'hero' && (p.heroesOnly || (e.kind !== 'minion' && e.kind !== 'monster'))) continue;
        if (this.hasFlag(e, 'untargetable')) continue;
        if (dist2(p.x, p.y, e.x, e.y) > (e.r + p.r) ** 2) continue;
        p.hit.add(e.id);
        p.onHit(e, p);
        if (!p.pierce) p.done = true;
        if (p.done) break;
      }
      if (p.done || p.traveled >= p.range || !this.map.inBounds(Math.floor(p.x), Math.floor(p.y))) {
        this.emit({ e: 'impact', x: p.x, y: p.y, s: p.style });
        this.remove(p);
        return;
      }
    }
  }

  updateArea(a, dt) {
    if (a.follow) { if (a.follow.dead) { this.remove(a); return; } a.x = a.follow.x; a.y = a.follow.y; }
    if (!a.started) { a.started = true; if (a.onStart) a.onStart(a); }
    a.life -= dt;
    if (a.tickEvery && a.onTick) {
      a.tickT -= dt;
      while (a.tickT <= 0 && a.life > -dt) { a.tickT += a.tickEvery; a.onTick(a); }
    }
    if (a.life <= 0) { this.remove(a); if (a.onEnd) a.onEnd(a); }
  }

  updateTrap(t, dt) {
    t.life -= dt; t.armT -= dt;
    if (t.life <= 0) return this.remove(t);
    if (t.armT > 0) return;
    for (const h of this.heroes) {
      if (h.team === t.team || h.dead || dist(h.x, h.y, t.x, t.y) > t.r + h.r) continue;
      t.onTrigger(h);
      this.emit({ e: 'trap', x: t.x, y: t.y });
      this.remove(t);
      return;
    }
  }

  /* ================= heroes ================= */
  inFountain(h) { const f = this.valley.teams[h.team].fountain; return dist(h.x, h.y, f.x, f.y) <= CFG.fountainRadius; }
  canShop(h) { const f = this.valley.teams[h.team].fountain; return h.dead || dist(h.x, h.y, f.x, f.y) <= CFG.shopRadius; }

  setOrder(h, order) {
    if (h.dead) return;
    h.order = order;
    h.pendingCast = null;
    h.recall = null;
    if (order.type === 'move' || order.type === 'amove') {
      h.windup = null;
      if (this.time - h.pathT > 0.1 || !h.path.length) {
        h.pathT = this.time;
        h.path = this.pf.find(h.x, h.y, order.x, order.y, h.r);
      } else h.path = [{ x: order.x, y: order.y }];
    }
  }

  attackRange(h, t) { return h.stats.range + h.r + t.r; }

  /** Auto-attack logic. Returns true if attacking (in range). */
  tryAttack(h, t) {
    if (!t || !this.targetable(t) || !this.visibleTo(t, h.team)) return false;
    const d = dist(h.x, h.y, t.x, t.y);
    if (d > this.attackRange(h, t)) return false;
    h.facing = Math.atan2(t.y - h.y, t.x - h.x);
    if (!h.windup && h.atkT <= 0 && this.canAct(h)) {
      h.windup = { t: Math.min(0.25, 0.3 / h.stats.as), target: t.id };
      h.atkT = 1 / h.stats.as;
    }
    return true;
  }

  attackLand(h, t) {
    h.recall = null;
    const crit = this.rng.float() * 100 < h.stats.crit;
    let amount = h.stats.ad * (crit ? 1.75 + h.stats.critBonus : 1);
    const isStructure = t.kind === 'tower' || t.kind === 'spire' || t.kind === 'core';
    const hit = () => {
      if (t.dead || t.removed) return;
      this.damage(h, t, amount, 'physical', { attack: true, crit });
      if (isStructure) return;
      for (const b of [...h.buffs]) {
        if (b.bonusOnHit) {
          this.damage(h, t, b.bonusOnHit.amount, b.bonusOnHit.type || 'physical', { noPassive: true });
          if (b.bonusOnHit.slow) this.cc(t, 'slow', 1, b.bonusOnHit.slow, h);
        }
        if (b.onAttack) b.onAttack(t);
        if (b.consumeOnAttack) this.removeBuff(h, b.id);
      }
      if (h.c.onAttackHit && !t.dead) h.c.onAttackHit(this, h, t);
    };
    if (h.c.ranged) { this.projectile(h, t, { speed: h.c.projSpeed, style: `aa:${h.champ}`, onHit: hit }); this.emit({ e: 'atk', id: h.id }); }
    else { hit(); this.emit({ e: 'atk', id: h.id }); }
  }

  updateHero(h, dt) {
    for (const k in h.cd) if (h.cd[k] > 0) h.cd[k] = Math.max(0, h.cd[k] - dt);
    if (h.dead) {
      if (this.time >= h.respawnAt) this.respawn(h);
      return;
    }
    if (h.bot) botThink(this, h, dt);
    if (h.c.tick) h.c.tick(this, h, dt);
    if (h.keystone) keystoneTick(this, h);
    // Regeneration and fountain.
    const inF = this.inFountain(h);
    h.hp = Math.min(h.maxHp, h.hp + (h.stats.hpRegen + (inF ? h.maxHp * 0.12 : 0)) * dt);
    h.mp = Math.min(h.maxMp, h.mp + (h.stats.mpRegen + (inF ? h.maxMp * 0.12 : 0)) * dt);
    if (h.wards < 2) { h.wardT -= dt; if (h.wardT <= 0) { h.wards++; h.wardT = 90; } }
    // Garrok passive.
    if (h.champ === 'garrok' && this.time - h.lastDamagedT > 9 && !h.shields.some(s => s.passive)) h.shields.push({ amt: h.maxHp * 0.1, t: 9999, passive: true });
    // Burn aura.
    if (h.stats.burnAura) { h.burnT = (h.burnT || 0) - dt; if (h.burnT <= 0) { h.burnT = 1; for (const e of this.enemiesNear(h.team, h.x, h.y, 3)) this.damage(h, e, 12 + h.level * 1.5, 'magic'); } }
    // Enemy fountain laser.
    const ef = this.valley.teams[enemyOf(h.team)].fountain;
    if (dist(h.x, h.y, ef.x, ef.y) < CFG.fountainRadius + 1.5) this.damage(null, h, 900 * dt, 'true');

    h.atkT -= dt;
    // Displacement / dash.
    if (h.disp) { this.applyDisp(h, dt); return; }
    if (h.dash) {
      const D = h.dash;
      const tgt = D.target;
      const tx = tgt && !tgt.dead ? tgt.x : D.tx, ty = tgt && !tgt.dead ? tgt.y : D.ty;
      const d = dist(h.x, h.y, tx, ty);
      const step = D.speed * dt;
      D.t -= dt;
      if (d <= step + D.stopAt || D.t <= 0) {
        if (!D.stopAt) moveCircle(this.map, h, (tx - h.x), (ty - h.y));
        h.dash = null;
        if (D.onEnd) D.onEnd();
      } else {
        const blocked = moveCircle(this.map, h, (tx - h.x) / d * step, (ty - h.y) / d * step);
        if (blocked && D.t < d / D.speed - 0.1) { /* slide along walls */ }
      }
      return;
    }
    // Return-home channel.
    if (h.recall) {
      h.recall.t -= dt;
      if (h.recall.t <= 0) {
        h.recall = null;
        this.emit({ e: 'recall', id: h.id, x: h.x, y: h.y });
        const f = this.valley.teams[h.team].fountain;
        h.x = f.x + this.rng.range(-1.5, 1.5); h.y = f.y + this.rng.range(-1.5, 1.5);
        h.path = []; h.order = { type: 'idle' };
      }
      return;
    }
    // Attack windup.
    if (h.windup) {
      h.windup.t -= dt;
      if (h.windup.t <= 0) {
        const t = this.get(h.windup.target);
        h.windup = null;
        if (t && this.targetable(t) && dist(h.x, h.y, t.x, t.y) <= this.attackRange(h, t) + 1) this.attackLand(h, t);
      }
      return;
    }
    if (!this.canAct(h)) return;

    // Pending unit-targeted cast: walk into range then cast.
    if (h.pendingCast) {
      const pc = h.pendingCast;
      const u = this.get(pc.unit);
      if (!u || u.dead || !this.visibleTo(u, h.team)) h.pendingCast = null;
      else if (dist(h.x, h.y, u.x, u.y) <= pc.range + u.r + h.r) { h.pendingCast = null; this.castNow(h, pc.slot, { x: u.x, y: u.y, unit: u }, pc.spell); }
      else { this.moveToward(h, u.x, u.y, dt); return; }
    }

    const o = h.order;
    const dir = h.dir;
    if ((dir.mx || dir.my) && this.canMove(h)) {
      h.order = { type: 'idle' };
      h.path = [];
      const [nx, ny] = normalize(dir.mx, dir.my);
      moveCircle(this.map, h, nx * h.stats.ms * dt, ny * h.stats.ms * dt);
      h.facing = Math.atan2(ny, nx);
      h.moving = true;
      return;
    }
    if (h.atkKey) {
      // Basic-attack button (touch controls): attack the best nearby target.
      const t = this.autoTarget(h, this.attackRange(h, { r: 0.6 }) + 2.5);
      if (t) { h.order = { type: 'attack', target: t.id }; }
    }
    switch (o.type) {
      case 'move':
        if (!this.followPath(h, dt)) h.order = { type: 'idle' };
        break;
      case 'attack': {
        const t = this.get(o.target);
        if (!t || !this.targetable(t) || t.team === h.team || !this.visibleTo(t, h.team)) { h.order = { type: 'idle' }; break; }
        if (!this.tryAttack(h, t)) this.moveToward(h, t.x, t.y, dt);
        break;
      }
      case 'amove': {
        const t = this.autoTarget(h, 6);
        if (t) { h.order = { type: 'attack', target: t.id }; break; }
        if (!this.followPath(h, dt)) h.order = { type: 'idle' };
        break;
      }
      case 'idle':
      default: {
        // Idle units retaliate against nearby enemies in range (but never chase).
        const t = this.autoTarget(h, this.attackRange(h, { r: 0.6 }));
        if (t && (t.kind !== 'hero' || this.time - h.lastDamagedT < 3 || h.bot)) this.tryAttack(h, t);
      }
    }
  }

  moveToward(h, x, y, dt) {
    if (!this.canMove(h)) return;
    if (!h.chase || this.time - h.chase.t > 0.4 || dist(h.chase.x, h.chase.y, x, y) > 2) {
      h.chase = { t: this.time, x, y };
      h.path = this.pf.find(h.x, h.y, x, y, h.r);
    }
    this.followPath(h, dt);
  }

  followPath(h, dt) {
    if (!this.canMove(h)) return true;
    let budget = h.stats.ms * dt;
    while (budget > 0 && h.path.length) {
      const wp = h.path[0];
      const d = dist(h.x, h.y, wp.x, wp.y);
      if (d < 0.05) { h.path.shift(); continue; }
      const step = Math.min(budget, d);
      const bx = h.x, by = h.y;
      moveCircle(this.map, h, (wp.x - h.x) / d * step, (wp.y - h.y) / d * step);
      h.facing = Math.atan2(wp.y - by, wp.x - bx);
      const moved = dist(bx, by, h.x, h.y);
      budget -= step;
      if (moved < step * 0.2) { h.path.shift(); break; }
      if (step >= d) h.path.shift();
    }
    h.moving = h.path.length > 0;
    return h.path.length > 0;
  }

  autoTarget(h, range) {
    let best = null, bs = Infinity;
    for (const e of this.entities.values()) {
      if (e.team === h.team || e.dead || e.removed) continue;
      if (!['hero', 'minion', 'monster', 'tower', 'spire', 'core', 'ward'].includes(e.kind)) continue;
      if (!this.targetable(e) || !this.visibleTo(e, h.team)) continue;
      if ((e.kind === 'tower' || e.kind === 'spire' || e.kind === 'core') && this.structureProtected(e)) continue;
      const d = dist(h.x, h.y, e.x, e.y) - e.r;
      if (d > range) continue;
      const pri = e.kind === 'hero' ? 0 : e.kind === 'minion' || e.kind === 'monster' ? 10 : 20;
      const score = pri + d + (e.kind === 'minion' ? (e.hp / e.maxHp) * 2 : 0);
      if (score < bs) { bs = score; best = e; }
    }
    return best;
  }

  respawn(h) {
    h.dead = false;
    h.x = h.spawn.x; h.y = h.spawn.y;
    h.hp = h.maxHp; h.mp = h.maxMp;
    h.order = { type: 'idle' }; h.path = [];
    h.ver++;
    this.emit({ e: 'respawn', id: h.id, x: h.x, y: h.y });
  }

  /* ================= commands ================= */
  command(h, msg) {
    if (!h || this.ended) return;
    const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    switch (msg.t) {
      case 'emote': {
        // Cosmetic only: everyone who can see the champion plays the animation.
        if (h.dead || !EMOTES.includes(msg.k) || this.time - (h.emoteT ?? -9) < 2.5) return;
        h.emoteT = this.time;
        this.emit({ e: 'emote', id: h.id, k: msg.k });
        return;
      }
      case 'mv': {
        const x = num(msg.x, h.x), y = num(msg.y, h.y);
        if (msg.a) return this.setOrder(h, { type: 'amove', x, y });
        // Right-clicking an enemy attacks it.
        if (msg.id) { const u = this.get(msg.id); if (u && u.team !== h.team && this.targetable(u)) { h.order = { type: 'attack', target: u.id }; h.pendingCast = null; h.recall = null; return; } }
        return this.setOrder(h, { type: 'move', x, y });
      }
      case 'dir': h.dir = { mx: Math.max(-1, Math.min(1, num(msg.mx))), my: Math.max(-1, Math.min(1, num(msg.my))) }; h.atkKey = !!msg.at; if (h.dir.mx || h.dir.my) h.recall = null; return;
      case 'stop': h.order = { type: 'idle' }; h.path = []; h.pendingCast = null; return;
      case 'cast': return this.cast(h, msg.sl, { x: num(msg.x, h.x), y: num(msg.y, h.y), id: msg.id });
      case 'summ': return this.cast(h, msg.k === 'f' ? 'f' : 'd', { x: num(msg.x, h.x), y: num(msg.y, h.y), id: msg.id }, true);
      case 'lvl': if (SLOTS.includes(msg.sl) && canRankUp(h, msg.sl)) { h.ranks[msg.sl]++; h.points--; h.ver++; } return;
      case 'buy': return this.buy(h, msg.item);
      case 'sell': return this.sell(h, num(msg.slot, -1) | 0);
      case 'use': return this.useItem(h, num(msg.slot, -1) | 0);
      case 'recall':
        if (h.dead || h.recall || this.inFountain(h)) return;
        h.recall = { t: this.hasBuff(h, 'titan') ? 3 : CFG.recallTime, max: this.hasBuff(h, 'titan') ? 3 : CFG.recallTime };
        h.order = { type: 'idle' }; h.path = []; h.dir = { mx: 0, my: 0 };
        this.emit({ e: 'recallStart', id: h.id, x: h.x, y: h.y });
        return;
      case 'ward': {
        if (h.dead || h.wards <= 0) return;
        const x = num(msg.x, h.x), y = num(msg.y, h.y);
        if (dist(h.x, h.y, x, y) > 6.5 || !this.map.walkableAt(x, y)) return;
        h.wards--;
        if (h.wardT <= 0) h.wardT = 90;
        this.add({ kind: 'ward', team: h.team, ownerHero: h.id, x, y, r: 0.35, facing: 0, hp: 3, maxHp: 3, armor: 0, mr: 0, life: 90, sight: CFG.wardSight });
        this.emit({ e: 'ward', x, y, team: h.team });
        return;
      }
      case 'ping': this.emit({ e: 'ping', x: num(msg.x), y: num(msg.y), k: ['go', 'danger', 'help', 'omw'].includes(msg.k) ? msg.k : 'go', team: h.team, id: h.id }); return;
      default:
    }
  }

  cast(h, slot, t, spell = false) {
    if (h.dead || !this.canCast(h)) return;
    if (spell) {
      const spell = h.spells[slot];
      if (!spell || h.cd[slot] > 0) return;
      const target = t.id ? this.get(t.id) : null;
      if ((spell === 'scorch' || spell === 'strike')) {
        const range = spell === 'scorch' ? 6 : 5;
        const valid = u => u && !u.dead && u.team !== h.team && (spell === 'scorch' ? u.kind === 'hero' : u.kind === 'monster' || u.kind === 'minion');
        let u = valid(target) ? target : null;
        if (!u) {
          let bd = range + 3;
          for (const e of this.entities.values()) if (valid(e) && this.visibleTo(e, h.team)) { const d = dist(t.x, t.y, e.x, e.y); if (d < bd) { bd = d; u = e; } }
        }
        if (!u) return;
        if (dist(h.x, h.y, u.x, u.y) > range + u.r + h.r) { h.pendingCast = { slot, unit: u.id, range, spell: true }; return; }
        return this.castNow(h, slot, { x: u.x, y: u.y, unit: u }, true);
      }
      return this.castNow(h, slot, t, true);
    }
    if (!SLOTS.includes(slot)) return;
    const a = h.c.abilities[slot];
    const rank = h.ranks[slot];
    if (rank <= 0 || h.cd[slot] > 0) return;
    const mana = a.mana[Math.min(a.mana.length - 1, rank - 1)];
    if (h.mp < mana) return this.emit({ e: 'nomana', to: h.id });
    if (a.target === 'enemy' || a.target === 'enemyHero' || a.target === 'ally') {
      let u = t.id ? this.get(t.id) : null;
      const valid = x => x && !x.dead && this.targetable(x) && this.visibleTo(x, h.team) && (a.target === 'ally' ? x.team === h.team && x.kind === 'hero' && x !== h : x.team !== h.team && (a.target === 'enemyHero' ? x.kind === 'hero' : ['hero', 'minion', 'monster'].includes(x.kind)));
      if (!valid(u)) {
        // Smart targeting: nearest valid unit to the cursor.
        u = null;
        let bd = 3.5;
        for (const e of this.entities.values()) { if (!valid(e)) continue; const d = dist(t.x, t.y, e.x, e.y); if (d < bd) { bd = d; u = e; } }
      }
      if (!u) return;
      if (dist(h.x, h.y, u.x, u.y) > a.range + u.r + h.r) { h.pendingCast = { slot, unit: u.id, range: a.range }; h.order = { type: 'idle' }; return; }
      return this.castNow(h, slot, { x: u.x, y: u.y, unit: u });
    }
    return this.castNow(h, slot, t);
  }

  castNow(h, slot, t, spell = false) {
    h.recall = null;
    if (spell) return this.castSpell(h, slot, t);
    const a = h.c.abilities[slot];
    const rank = h.ranks[slot];
    const mana = a.mana[Math.min(a.mana.length - 1, rank - 1)];
    if (h.mp < mana || h.cd[slot] > 0) return;
    if ((a.target === 'point' || a.target === 'direction') && a.range) {
      const d = dist(h.x, h.y, t.x, t.y);
      if (a.target === 'point' && d > a.range) { const k = a.range / d; t = { x: h.x + (t.x - h.x) * k, y: h.y + (t.y - h.y) * k }; }
      if (d < 0.1) t = { x: h.x + Math.cos(h.facing), y: h.y + Math.sin(h.facing) };
    }
    h.mp -= mana;
    const cd = a.cd[Math.min(a.cd.length - 1, rank - 1)];
    h.cd[slot] = cd * 100 / (100 + h.stats.haste);
    h.cdMax = h.cdMax || {};
    h.cdMax[slot] = h.cd[slot];
    if (t.x !== undefined && (t.x !== h.x || t.y !== h.y)) h.facing = Math.atan2(t.y - h.y, t.x - h.x);
    this.caster = h; // heal/shield power of the caster applies to what this cast gives allies
    try { a.cast(this, h, rank, t); } finally { this.caster = null; }
    this.emit({ e: 'cast', id: h.id, sl: slot, x: h.x, y: h.y, c: h.champ });
  }

  castSpell(h, slot, t) {
    const spell = h.spells[slot];
    const def = SPELLS[spell];
    h.cd[slot] = def.cd;
    h.cdMax = h.cdMax || {};
    h.cdMax[slot] = def.cd;
    switch (spell) {
      case 'blink': {
        const a = Math.atan2(t.y - h.y, t.x - h.x);
        const d = Math.min(4.5, dist(h.x, h.y, t.x, t.y)) || 4.5;
        const [nx, ny] = castWalk(this.map, h.x, h.y, a, d, h.r);
        this.blink(h, nx, ny);
        break;
      }
      case 'mend': {
        const amt = 80 + 20 * h.level;
        this.heal(h, h, amt);
        const ally = this.alliesNear(h.team, h.x, h.y, 8, { heroes: true }).filter(a => a !== h).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        if (ally) { this.heal(h, ally, amt); this.addBuff(ally, { id: 'healHaste', dur: 1, stats: { msPct: 30 } }); }
        this.addBuff(h, { id: 'healHaste', dur: 1, stats: { msPct: 30 } });
        break;
      }
      case 'scorch': {
        const u = t.unit;
        this.addBuff(u, { id: 'scorch', dur: 5, tickEvery: 1, onTick: () => this.damage(h, u, (50 + 20 * h.level) / 5, 'true') });
        this.addBuff(u, { id: 'grievous', dur: 5 });
        break;
      }
      case 'strike': this.damage(h, t.unit, 450 + 30 * h.level, 'true'); this.emit({ e: 'strike', x: t.unit.x, y: t.unit.y }); break;
      case 'haste': this.addBuff(h, { id: 'haste', dur: 8, stats: { msPct: 40 } }); break;
      case 'bulwark': this.shield(h, 100 + 25 * h.level, 2.5); break;
      default:
    }
    this.emit({ e: 'summ', id: h.id, k: spell, x: h.x, y: h.y });
  }

  buy(h, itemId) {
    const item = ITEMS[itemId];
    if (!item || !this.canShop(h)) return;
    if (item.consumable) {
      const slot = h.items.findIndex(it => it && it.id === itemId && it.n < item.stack);
      if (h.gold < item.cost) return;
      if (slot >= 0) { h.items[slot].n++; h.gold -= item.cost; h.ver++; return; }
      const free = h.items.indexOf(null);
      if (free < 0) return;
      h.items[free] = { id: itemId, n: 1 };
      h.gold -= item.cost;
      h.ver++;
      return;
    }
    const { price, consume } = priceFor(itemId, h.items);
    if (h.gold < price) return;
    if (item.boots && h.items.some((it, i) => it && ITEMS[it.id].boots && !consume.includes(i))) return;
    const after = h.items.map((it, i) => (consume.includes(i) ? null : it));
    const free = after.indexOf(null);
    if (free < 0) return;
    after[free] = { id: itemId, n: 1 };
    h.items = after;
    h.gold -= price;
    this.recompute(h);
    h.ver++;
    this.emit({ e: 'buy', to: h.id, item: itemId });
  }

  sell(h, slot) {
    if (!this.canShop(h)) return;
    const it = h.items[slot];
    if (!it) return;
    h.gold += Math.floor(ITEMS[it.id].cost * SELL_RATIO * (it.n || 1));
    h.items[slot] = null;
    this.recompute(h);
    h.ver++;
  }

  useItem(h, slot) {
    const it = h.items[slot];
    if (!it || h.dead) return;
    if (it.id === 'potion') {
      if (this.hasBuff(h, 'potion')) return;
      this.emit({ e: 'potion', to: h.id, id: h.id });
      this.addBuff(h, { id: 'potion', dur: 12, tickEvery: 0.5, onTick: () => this.heal(h, h, 150 / 24, { quiet: true }) });
      it.n--;
      if (it.n <= 0) h.items[slot] = null;
      h.ver++;
    }
  }

  /* ================= vision ================= */
  updateVision() {
    const sources = { blue: [], red: [] };
    for (const e of this.entities.values()) {
      if (e.dead || !e.sight || (e.team !== 'blue' && e.team !== 'red')) continue;
      sources[e.team].push(e);
    }
    for (const team of ['blue', 'red']) {
      const f = this.valley.teams[team].fountain;
      sources[team].push({ x: f.x, y: f.y, sight: 12 });
    }
    for (const e of this.entities.values()) {
      if (e.kind === 'tower' || e.kind === 'spire' || e.kind === 'core') { e.vis = { blue: true, red: true }; continue; }
      const vis = { blue: e.team === 'blue', red: e.team === 'red' };
      const revealed = this.hasFlag(e, 'revealed');
      const bush = bushAt(this.valley, e.x, e.y);
      for (const team of ['blue', 'red']) {
        if (vis[team]) continue;
        if (e.kind === 'trap') continue; // traps are invisible to enemies
        if (revealed) { vis[team] = true; continue; }
        for (const s of sources[team]) {
          const d2 = (s.x - e.x) ** 2 + (s.y - e.y) ** 2;
          if (d2 > s.sight * s.sight) continue;
          if (bush >= 0 && d2 > 2.2 * 2.2 && bushAt(this.valley, s.x, s.y) !== bush) continue;
          vis[team] = true;
          break;
        }
      }
      e.vis = vis;
    }
  }

  /** This tick's effect events a viewer may see. */
  fxFor(team, heroId) {
    const all = team === 'spectator';
    const fx = [];
    for (const ev of this.fx) {
      if (ev.to !== undefined && ev.to !== heroId) continue;
      if (ev.team && ev.e === 'ping' && ev.team !== team) continue;
      if (ev.e === 'ann' && ev.priv && ev.team !== team) continue;
      if (!all && ev.id && ev.e !== 'kill' && ev.e !== 'ann') { const src = this.get(ev.id); if (src && src.team !== team && src.vis && !src.vis[team]) continue; }
      fx.push(ev);
    }
    return fx;
  }

  visibleTo(e, team) {
    if (!e.vis) return true;
    return team === 'neutral' || e.vis[team];
  }

  /* ================= main loop ================= */
  update(dt) {
    if (this.ended) { this.endT -= dt; return; }
    this.time += dt;
    // Passive gold & xp.
    if (this.time > CFG.passiveGoldStart) for (const h of this.heroes) { this.addGold(h, CFG.passiveGold * dt); this.addXp(h, CFG.passiveXp * dt); }
    // Waves.
    this.waveT -= dt;
    if (this.waveT <= 0) { this.waveT = this.skirmish ? 20 : CFG.waveEvery; this.spawnWave(); }
    while (this.spawnQueue.length && this.spawnQueue[0].at <= this.time) this.spawnMinion(this.spawnQueue.shift());
    // Camps & epics.
    for (const c of this.camps) if (c.respawnAt && this.time >= c.respawnAt) { c.respawnAt = 0; this.spawnCamp(c); }
    for (const [k, ep] of Object.entries(this.epics)) {
      if (!ep.unit && ep.respawnAt && this.time >= ep.respawnAt) {
        ep.respawnAt = 0;
        ep.unit = this.spawnMonster(k, ep.pos.x, ep.pos.y, this.time / 60);
        this.announce(k === 'wyrm' ? 'The Ember Wyrm has spawned in the bottom river!' : 'The Abyss Titan has awoken in the top river!', 'epicSpawn', { key: `${k}_spawn` });
      }
    }
    // Spire respawns.
    for (const team of ['blue', 'red']) for (const s of this.structures[team]) {
      if (s.kind === 'spire' && s.dead && s.respawnAt && this.time >= s.respawnAt) {
        s.dead = false; s.hp = s.maxHp; s.respawnAt = 0; s.ver++;
        this.announce(`The ${team} ${s.lane} spire has respawned.`, 'spire', { key: 'spire_restored' });
      }
    }
    this.visT -= dt;
    if (this.visT <= 0) { this.visT = 0.1; this.updateVision(); }

    for (const e of [...this.entities.values()]) {
      if (e.removed) continue;
      // Buff timers.
      if (e.buffs.length) {
        let changed = false;
        for (const b of e.buffs) {
          b.t -= dt;
          if (b.tickEvery && b.onTick) { b.tickT -= dt; while (b.tickT <= 0 && b.t > -dt) { b.tickT += b.tickEvery; if (!e.dead) b.onTick(); } }
        }
        const expired = e.buffs.filter(b => b.t <= 0);
        if (expired.length) {
          e.buffs = e.buffs.filter(b => b.t > 0);
          changed = expired.some(b => b.stats);
          for (const b of expired) if (b.onExpire) b.onExpire();
          if (changed && e.kind === 'hero') this.recompute(e);
        }
      }
      if (e.shields && e.shields.length) { for (const s of e.shields) s.t -= dt; e.shields = e.shields.filter(s => s.t > 0 && s.amt > 0.5); }
      switch (e.kind) {
        case 'hero': this.updateHero(e, dt); break;
        case 'minion': if (!e.dead) this.updateMinion(e, dt); else if (this.time - e.deadT > 1) this.remove(e); break;
        case 'monster': if (!e.dead) this.updateMonster(e, dt); else if (this.time - e.deadT > 1.5) this.remove(e); break;
        case 'tower': this.updateTower(e, dt); break;
        case 'proj': this.updateProjectile(e, dt); break;
        case 'area': this.updateArea(e, dt); break;
        case 'trap': this.updateTrap(e, dt); break;
        case 'ward': e.life -= dt; if (e.life <= 0 || e.dead) this.remove(e); break;
        default:
      }
    }
  }

  announce(text, kind, extra = {}) {
    this.emit({ e: 'ann', text, k: kind, key: extra.key || null, team: extra.team || null, killer: extra.killer ? extra.killer.champ : null, victim: extra.victim ? extra.victim.champ : null, priv: !!extra.private });
  }

  surrenderVote(h, yes) {
    if (this.time < (this.skirmish ? 300 : CFG.surrenderAfter) || this.ended) return false;
    const set = this.surrender[h.team];
    if (yes) set.add(h.id); else set.delete(h.id);
    const humans = this.heroes.filter(x => x.team === h.team && x.session);
    if (humans.length && humans.every(x => set.has(x.id))) { this.end(enemyOf(h.team), 'surrender'); return true; }
    return false;
  }

  end(winner, reason) {
    if (this.ended) return;
    this.ended = true;
    this.winner = winner;
    this.endT = 8;
    this.announce(`${winner === 'blue' ? 'Blue' : 'Red'} team wins!`, 'victory', { team: winner });
    const players = this.heroes.map(h => ({
      id: h.id, key: h.key, name: h.name, champ: h.champ, team: h.team, bot: !h.session && !!h.bot && !h.wasHuman,
      level: h.level, kills: h.kills, deaths: h.deaths, assists: h.assists, cs: h.cs, gold: Math.round(h.goldEarned),
      dmg: Math.round(h.dmgToHeroes), healed: Math.round(h.healed), items: h.items.map(it => (it ? it.id : null)), keystone: h.keystone, win: h.team === winner,
    }));
    // MVP: best KDA-weighted score on the winning team.
    let mvp = null, best = -1;
    for (const p of players) { const s = (p.kills * 3 + p.assists * 1.5 - p.deaths) + p.dmg / 1000 + (p.win ? 5 : 0); if (s > best) { best = s; mvp = p.id; } }
    this.result = { winner, reason, duration: Math.round(this.time), players, mvp, kills: this.kills, towers: this.towersDown };
    if (this.hooks.end) this.hooks.end(this, this.result);
  }

  /* ================= networking ================= */
  flags(e, team) {
    let f = 0;
    if (e.dead) f |= 1;
    for (const b of e.buffs) {
      if (!b.flags && !b.cc) continue;
      if (b.flags?.airborne) f |= 64;
      else if (b.flags?.stun) f |= 2;
      if (b.flags?.root) f |= 4;
      if (b.cc === 'slow') f |= 8;
      if (b.flags?.silence) f |= 16;
      if (b.flags?.untargetable) f |= 32;
      if (b.flags?.unstoppable) f |= 128;
    }
    if (e.shields && e.shields.some(s => !s.passive)) f |= 256;
    if (e.recall) f |= 512;
    if ((e.kind === 'tower' || e.kind === 'spire' || e.kind === 'core') && this.structureProtected(e)) f |= 1024;
    if (e.kind === 'hero' && bushAt(this.valley, e.x, e.y) >= 0) f |= 2048;
    if (e.kind === 'hero' && (e.bot || !e.session)) f |= 4096;
    if (this.hasBuff(e, 'titan')) f |= 8192;
    if (e.windup) f |= 16384;
    if (e.dash || e.disp) f |= 32768;
    void team;
    return f;
  }

  describe(e) {
    const base = { i: e.id, k: e.kind, tm: e.team, x: r2(e.x), y: r2(e.y), f: r2(e.facing), r: e.r };
    switch (e.kind) {
      case 'hero': return { ...base, c: e.champ, n: e.name, l: e.level, mh: e.maxHp, mm: e.maxMp, eq: e.items.filter(Boolean).length };
      case 'minion': return { ...base, t: e.mtype, mh: e.maxHp };
      case 'monster': return { ...base, t: e.mtype, md: e.def.model, n: e.name, mh: e.maxHp, ep: e.def.epic ? 1 : 0, sm: e.def.small ? 1 : 0 };
      case 'tower': return { ...base, t: e.tier, ln: e.lane, mh: e.maxHp };
      case 'spire': case 'core': return { ...base, mh: e.maxHp };
      case 'ward': return { ...base, mh: 3 };
      case 'trap': return { ...base };
      case 'proj': return { ...base, s: e.style, h: e.homing ? 1 : 0, vx: e.homing ? 0 : r2(e.vx), vy: e.homing ? 0 : r2(e.vy), tg: e.homing ? e.target : 0, sp: e.speed };
      case 'area': return { ...base, s: e.style, rad: e.radius, life: r2(e.life), dur: e.dur, len: e.length || 0, w: e.width || 0, fo: e.follow ? e.follow.id : 0 };
      default: return base;
    }
  }

  snapshotFor(view) {
    const { team, heroId, known } = view;
    const all = team === 'spectator'; // spectators and replays see everything
    const add = [], upd = [], seen = new Set();
    // Far-away units (outside the screen) update every other snapshot.
    const n = view.n = (view.n || 0) + 1;
    const eye = !all && heroId ? this.get(heroId) : null;
    for (const e of this.entities.values()) {
      const structure = e.kind === 'tower' || e.kind === 'spire' || e.kind === 'core';
      if (!all && !structure && e.team !== team && e.vis && !e.vis[team]) continue;
      if (!all && e.kind === 'trap' && e.team !== team) continue;
      if (e.kind === 'hero' && e.dead && e.id !== heroId) continue;
      seen.add(e.id);
      const hp = e.hp !== undefined ? Math.ceil(e.hp) : 0;
      const fl = this.flags(e, team);
      const k = known.get(e.id);
      if (!k || k.ver !== e.ver) {
        const d = this.describe(e);
        d.hp = hp; d.fl = fl;
        if (e.kind === 'hero') d.mp = Math.floor(e.mp);
        add.push(d);
        known.set(e.id, { ver: e.ver, x: e.x, y: e.y, f: e.facing, hp, fl, mp: e.mp | 0 });
        continue;
      }
      if (e.kind === 'proj' && !e.homing) continue;
      if (eye && e.id !== heroId && ((n + e.id) & 1) && Math.abs(e.x - eye.x) + Math.abs(e.y - eye.y) > 40) continue;
      const mp = e.kind === 'hero' ? Math.floor(e.mp) : 0;
      if (k.x !== e.x || k.y !== e.y || k.f !== e.facing || k.hp !== hp || k.fl !== fl || k.mp !== mp) {
        const u = [e.id, r2(e.x), r2(e.y), r2(e.facing), hp, fl];
        if (e.kind === 'hero') u.push(mp);
        upd.push(u);
        k.x = e.x; k.y = e.y; k.f = e.facing; k.hp = hp; k.fl = fl; k.mp = mp;
      }
    }
    const rem = [];
    for (const id of known.keys()) if (!seen.has(id)) { rem.push(id); known.delete(id); }
    const fx = this.fxFor(team, heroId);
    const s = { t: 's', time: r2(this.time) };
    const me = this.get(heroId);
    if (me) {
      // Only changed fields; the client merges them (the first send is complete).
      const d = selfDelta(view.meCache || (view.meCache = {}), this.selfState(me));
      if (d) s.me = d;
    }
    if (add.length) s.a = add;
    if (upd.length) s.u = upd;
    if (rem.length) s.r = rem;
    if (fx.length) s.fx = fx;
    return s;
  }

  selfState(h) {
    const st = h.stats;
    return {
      id: h.id, hp: Math.ceil(h.hp), mhp: h.maxHp, mp: Math.floor(h.mp), mmp: h.maxMp,
      sh: Math.round(h.shields.reduce((a, s) => a + s.amt, 0)),
      lv: h.level, xp: Math.floor(h.xp - XP_TO_LEVEL[h.level]), xpn: h.level >= MAX_LEVEL ? 0 : XP_TO_LEVEL[h.level + 1] - XP_TO_LEVEL[h.level],
      g: Math.floor(h.gold), pts: h.points, rk: h.ranks,
      cd: { q: r2(h.cd.q), w: r2(h.cd.w), e: r2(h.cd.e), r: r2(h.cd.r), d: r2(h.cd.d), f: r2(h.cd.f) },
      cdm: h.cdMax || {},
      it: h.items, wd: h.wards, wdt: r2(h.wardT), sm: h.spells,
      st: { ad: Math.round(st.ad), ap: Math.round(st.ap), ar: Math.round(st.armor), mr: Math.round(st.mr), as: r2(st.as), ms: r2(st.ms), cr: Math.round(st.crit), ha: Math.round(st.haste), rg: st.range },
      k: h.kills, d: h.deaths, a: h.assists, cs: h.cs,
      dead: h.dead ? 1 : 0, rs: h.dead ? r2(h.respawnAt - this.time) : 0, dr: h.dead && h.recap && h.recapSent !== h.deadT ? ((h.recapSent = h.deadT), h.recap) : undefined, // once per death
      rc: h.recall ? r2(1 - h.recall.t / h.recall.max) : 0,
      shop: this.canShop(h) ? 1 : 0,
      b: h.buffs.filter(b => b.dur >= 1 && b.dur !== Infinity && !b.id.startsWith('slow')).map(b => [b.id, Math.ceil(b.t)]),
      ord: h.order.type === 'move' || h.order.type === 'amove' ? [r2(h.order.x), r2(h.order.y)] : null,
      tg: h.order.type === 'attack' ? h.order.target : 0,
    };
  }

  scoreboard() {
    return {
      time: Math.floor(this.time), kills: this.kills, towers: this.towersDown, wyrms: this.wyrms, titans: this.titans,
      wyrmIn: this.epics.wyrm.unit ? 0 : Math.max(0, Math.ceil(this.epics.wyrm.respawnAt - this.time)),
      titanIn: this.epics.titan.unit ? 0 : Math.max(0, Math.ceil(this.epics.titan.respawnAt - this.time)),
      players: this.heroes.map(h => ({
        id: h.id, name: h.name, c: h.champ, tm: h.team, l: h.level, k: h.kills, d: h.deaths, a: h.assists, cs: h.cs,
        it: h.items.map(it => (it ? it.id : null)), dead: h.dead ? 1 : 0, rs: h.dead ? Math.ceil(h.respawnAt - this.time) : 0,
        bot: h.session ? 0 : 1, sm: h.spells,
      })),
      winner: this.winner,
    };
  }

  flushFx() { this.fx.length = 0; }
}

export { MINIONS, MONSTERS, bonusAd, ITEMS };
