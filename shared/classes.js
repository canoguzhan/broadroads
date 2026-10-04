/* Hero archetypes, abilities, stats and progression. Seasonal names come from themes.js. */
import { MONTHLY_THEMES } from './themes.js';

export const MAX_LEVEL = 50;

export const ARCHETYPES = {
  paladin: {
    id: 'paladin', type: 'melee', role: 'Tank / Melee',
    base: { hp: 170, mp: 60, atk: 14, armor: 10, speed: 5.2 },
    growth: { hp: 22, mp: 4, atk: 2.6, armor: 1.3 },
    radius: 0.55,
  },
  gunner: {
    id: 'gunner', type: 'ranged', role: 'Ranged DPS',
    base: { hp: 125, mp: 80, atk: 13, armor: 5, speed: 5.6 },
    growth: { hp: 16, mp: 5, atk: 2.5, armor: 0.8 },
    radius: 0.5,
  },
  arcanist: {
    id: 'arcanist', type: 'magic', role: 'Caster / Support',
    base: { hp: 115, mp: 120, atk: 15, armor: 4, speed: 5.3 },
    growth: { hp: 14, mp: 8, atk: 2.8, armor: 0.7 },
    radius: 0.5,
  },
};

export const CLASS_IDS = Object.keys(ARCHETYPES);

// Ability slots: primary (LMB), dash (Shift/Space), q, e, r (ultimate).
export const ABILITIES = {
  paladin: {
    primary: { name: 'Cleave', cd: 0.55, mana: 0, range: 2.5, desc: 'Sweeping arc that hits every enemy in front of you.', icon: '⚔️' },
    dash: { name: 'Charge', cd: 4, mana: 0, range: 5, desc: 'Charge forward, briefly untouchable.', icon: '💨' },
    q: { name: 'Shield Bash', cd: 7, mana: 20, range: 3, desc: 'Bash a cone of enemies, stunning them.', icon: '🛡️' },
    e: { name: 'Bulwark', cd: 14, mana: 25, range: 7, desc: 'Take 50% less damage for 4s and taunt nearby monsters.', icon: '🏰' },
    r: { name: 'Cataclysm', cd: 30, mana: 50, range: 6, desc: 'Massive shockwave that damages and knocks back all nearby enemies.', icon: '💥' },
  },
  gunner: {
    primary: { name: 'Bolt', cd: 0.35, mana: 0, range: 14, desc: 'Fire a fast bolt.', icon: '🔫' },
    dash: { name: 'Roll', cd: 3.5, mana: 0, range: 5.5, desc: 'Roll in your movement direction.', icon: '💨' },
    q: { name: 'Piercing Lance', cd: 6, mana: 20, range: 18, desc: 'A heavy shot that pierces every enemy in a line.', icon: '🎯' },
    e: { name: 'Scatter Volley', cd: 9, mana: 25, range: 10, desc: 'Fire a fan of seven bolts.', icon: '🌠' },
    r: { name: 'Orbital Barrage', cd: 28, mana: 50, range: 14, desc: 'Rockets rain down on the target area.', icon: '🚀' },
  },
  arcanist: {
    primary: { name: 'Arc Spark', cd: 0.5, mana: 0, range: 12, desc: 'A spark that chains to a second enemy.', icon: '✨' },
    dash: { name: 'Blink', cd: 5, mana: 0, range: 6, desc: 'Teleport toward your cursor.', icon: '🌀' },
    q: { name: 'Frost Nova', cd: 8, mana: 25, range: 4.5, desc: 'Blast around you, damaging and slowing enemies.', icon: '❄️' },
    e: { name: 'Mending Light', cd: 12, mana: 35, range: 7, desc: 'Heal yourself and nearby allies.', icon: '💚' },
    r: { name: 'Singularity', cd: 30, mana: 60, range: 12, desc: 'A vortex that drags enemies in and shreds them.', icon: '🕳️' },
  },
};

export const SLOTS = ['primary', 'dash', 'q', 'e', 'r'];

export function currentTheme(date = new Date()) {
  return MONTHLY_THEMES[date.getMonth()] || MONTHLY_THEMES[0];
}

/** Seasonal flavour: e.g. 'Frost Paladin' and 'Glacial Cataclysm' in January. */
export function seasonalClass(clsId, theme = currentTheme()) {
  const c = theme.classes.find(k => k.id === clsId) || theme.classes[0];
  return { name: c.name, icon: c.icon, desc: c.desc, ultimate: c.special, ultimateDesc: c.specialDesc };
}

export function abilityInfo(clsId, slot, theme = currentTheme()) {
  const a = { ...ABILITIES[clsId][slot] };
  if (slot === 'r') {
    const s = seasonalClass(clsId, theme);
    a.name = s.ultimate;
  }
  return a;
}

export function xpToNext(level) {
  return Math.round(60 * Math.pow(level, 1.6));
}

export const GEAR_SLOTS = ['weapon', 'armor', 'boots', 'relic'];

export function computeStats(char) {
  const arch = ARCHETYPES[char.cls] || ARCHETYPES.paladin;
  const lv = char.level - 1;
  const s = {
    maxHp: arch.base.hp + arch.growth.hp * lv,
    maxMp: arch.base.mp + arch.growth.mp * lv,
    atk: arch.base.atk + arch.growth.atk * lv,
    armor: arch.base.armor + arch.growth.armor * lv,
    crit: 0.05,
    critMult: 1.6,
    speed: arch.base.speed,
    speedPct: 0,
    cdr: 0,
    lifesteal: 0,
    regen: 0,
  };
  const eq = char.equipment || {};
  for (const slot of GEAR_SLOTS) {
    const item = eq[slot];
    if (!item || !item.stats) continue;
    const st = item.stats;
    s.maxHp += st.hp || 0;
    s.maxMp += st.mp || 0;
    s.atk += st.atk || 0;
    s.armor += st.armor || 0;
    s.crit += (st.crit || 0) / 100;
    s.speedPct += st.speed || 0;
    s.cdr += (st.cdr || 0) / 100;
    s.lifesteal += (st.lifesteal || 0) / 100;
    s.regen += st.regen || 0;
  }
  s.crit = Math.min(0.6, s.crit);
  s.cdr = Math.min(0.4, s.cdr);
  s.lifesteal = Math.min(0.25, s.lifesteal);
  s.speed = arch.base.speed * (1 + Math.min(40, s.speedPct) / 100);
  s.maxHp = Math.round(s.maxHp);
  s.maxMp = Math.round(s.maxMp);
  s.atk = Math.round(s.atk * 10) / 10;
  s.armor = Math.round(s.armor * 10) / 10;
  s.power = Math.round(s.atk * 4 + s.armor * 2 + s.maxHp / 5 + s.crit * 200 + s.cdr * 200 + s.speedPct * 2);
  return s;
}

export function newCharacter(name, cls) {
  return {
    v: 1,
    name,
    cls,
    level: 1,
    xp: 0,
    gold: 100,
    materials: { pyrite: 0, aether: 0, titanium: 0, catalyst: 0 },
    potions: { hp: 5, mp: 3 },
    inventory: [],
    equipment: { weapon: null, armor: null, boots: null, relic: null },
    stats: { kills: 0, deaths: 0, bossKills: 0, pvpKills: 0, pvpDeaths: 0, deepestFloor: 0, dungeonsCleared: 0, playSeconds: 0 },
    rating: { duel: 1000, team: 1000, ffa: 1000 },
    pvp: { wins: 0, losses: 0 },
    createdAt: Date.now(),
  };
}

/** Upgrades old or partial save data to the current shape. */
export function normalizeCharacter(c) {
  const base = newCharacter(c.name, CLASS_IDS.includes(c.cls) ? c.cls : 'paladin');
  const out = { ...base, ...c };
  out.materials = { ...base.materials, ...(c.materials || {}) };
  out.potions = { ...base.potions, ...(c.potions || {}) };
  out.equipment = { ...base.equipment, ...(c.equipment || {}) };
  out.stats = { ...base.stats, ...(c.stats || {}) };
  out.rating = { ...base.rating, ...(c.rating || {}) };
  out.pvp = { ...base.pvp, ...(c.pvp || {}) };
  out.inventory = Array.isArray(c.inventory) ? c.inventory : [];
  out.level = Math.max(1, Math.min(MAX_LEVEL, out.level | 0));
  return out;
}
