/* Items, loot generation, refinery crafting and shop. */
import { RNG } from './rng.js';

export const INVENTORY_SIZE = 30;

export const RARITIES = {
  common: { id: 'common', name: 'Common', color: '#cbd5e1', mult: 1.0, affixes: 0, value: 1 },
  uncommon: { id: 'uncommon', name: 'Uncommon', color: '#4ade80', mult: 1.25, affixes: 1, value: 2 },
  rare: { id: 'rare', name: 'Rare', color: '#60a5fa', mult: 1.55, affixes: 2, value: 4 },
  epic: { id: 'epic', name: 'Epic', color: '#c084fc', mult: 1.9, affixes: 3, value: 8 },
  legendary: { id: 'legendary', name: 'Legendary', color: '#fb923c', mult: 2.4, affixes: 4, value: 16 },
};
export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export const MATERIALS = {
  pyrite: { id: 'pyrite', name: 'Pyrite', icon: '🔥', color: '#f97316' },
  aether: { id: 'aether', name: 'Aether', icon: '💨', color: '#38bdf8' },
  titanium: { id: 'titanium', name: 'Titanium', icon: '⛓️', color: '#94a3b8' },
  catalyst: { id: 'catalyst', name: 'Catalyst', icon: '💎', color: '#c084fc' },
};
export const MATERIAL_IDS = Object.keys(MATERIALS);

export const STAT_NAMES = {
  atk: 'Attack', armor: 'Armor', hp: 'Health', mp: 'Mana', crit: '% Crit',
  speed: '% Speed', cdr: '% Cooldown', lifesteal: '% Lifesteal', regen: 'HP/s Regen',
};

const BASES = {
  weapon: {
    paladin: ['Greatblade', 'Warhammer', 'Cleaver', 'Broadsword'],
    gunner: ['Blaster', 'Carbine', 'Repeater', 'Hand Cannon'],
    arcanist: ['Orb', 'Scepter', 'Focus Crystal', 'Runestaff'],
    icon: { paladin: '🗡️', gunner: '🔫', arcanist: '🔮' },
  },
  armor: { names: ['Cuirass', 'Hauberk', 'Plate', 'Brigandine', 'Robes'], icon: '🛡️' },
  boots: { names: ['Greaves', 'Treads', 'Sabatons', 'Striders'], icon: '🥾' },
  relic: { names: ['Amulet', 'Sigil', 'Charm', 'Talisman', 'Idol'], icon: '💍' },
};

const PREFIX = {
  atk: 'Savage', armor: 'Stalwart', hp: 'Vital', mp: 'Arcane', crit: 'Keen',
  speed: 'Swift', cdr: 'Timeless', lifesteal: 'Vampiric', regen: 'Mending',
};
const SUFFIX = ['of the Broadroads', 'of Embers', 'of the Deep', 'of Storms', 'of the Void', 'of Dawn', 'of Ruin', 'of the Wilds'];

// Per item-level affix rolls (before rarity multiplier).
const AFFIX_ROLL = {
  atk: l => 1.5 + l * 0.55,
  armor: l => 1.5 + l * 0.5,
  hp: l => 10 + l * 5,
  mp: l => 8 + l * 3,
  crit: () => 3,
  speed: () => 3,
  cdr: () => 3,
  lifesteal: () => 2,
  regen: l => 0.5 + l * 0.15,
};
const PCT_STATS = new Set(['crit', 'speed', 'cdr', 'lifesteal']);
const AFFIX_POOL = Object.keys(AFFIX_ROLL);

let itemCounter = 0;
export function newItemId(rng) {
  itemCounter = (itemCounter + 1) % 1e6;
  return `i${Date.now().toString(36)}${itemCounter.toString(36)}${Math.floor(rng.float() * 1e6).toString(36)}`;
}

function primaryStats(slot, ilvl, mult) {
  switch (slot) {
    case 'weapon': return { atk: Math.round((4 + ilvl * 1.6) * mult) };
    case 'armor': return { armor: Math.round((3 + ilvl * 1.1) * mult), hp: Math.round((15 + ilvl * 6) * mult) };
    case 'boots': return { speed: Math.round(Math.min(12, 4 + ilvl * 0.12) * mult), armor: Math.round((1 + ilvl * 0.4) * mult) };
    case 'relic': return { crit: Math.round(3 * mult), mp: Math.round((10 + ilvl * 3) * mult) };
    default: return {};
  }
}

export function rollRarity(rng, luck = 0) {
  // luck shifts weight toward higher rarities (floor depth, elites, bosses).
  return rng.weighted([
    ['common', Math.max(5, 55 - luck * 8)],
    ['uncommon', 28],
    ['rare', 12 + luck * 3],
    ['epic', 4 + luck * 2],
    ['legendary', 0.6 + luck * 0.8],
  ]);
}

export function generateItem(rng, { ilvl = 1, rarity, slot, cls = 'paladin' } = {}) {
  slot = slot || rng.pick(['weapon', 'armor', 'boots', 'relic']);
  rarity = rarity || rollRarity(rng);
  const r = RARITIES[rarity];
  const stats = primaryStats(slot, ilvl, r.mult);
  const affixes = rng.shuffle([...AFFIX_POOL]).slice(0, r.affixes);
  for (const a of affixes) {
    let v = AFFIX_ROLL[a](ilvl) * rng.range(0.8, 1.2) * r.mult;
    v = PCT_STATS.has(a) || a === 'regen' ? Math.round(v * 10) / 10 : Math.round(v);
    if (PCT_STATS.has(a)) v = Math.round(v);
    stats[a] = (stats[a] || 0) + Math.max(1, v);
  }
  let base, icon;
  if (slot === 'weapon') {
    base = rng.pick(BASES.weapon[cls] || BASES.weapon.paladin);
    icon = BASES.weapon.icon[cls] || '🗡️';
  } else {
    base = rng.pick(BASES[slot].names);
    icon = BASES[slot].icon;
  }
  let name = base;
  if (affixes.length) name = `${PREFIX[affixes[0]]} ${base}`;
  if (rarity === 'epic' || rarity === 'legendary') name += ' ' + rng.pick(SUFFIX);
  return {
    id: newItemId(rng),
    slot,
    name,
    icon,
    rarity,
    ilvl,
    cls: slot === 'weapon' ? cls : undefined,
    stats,
    value: Math.round((8 + ilvl * 3) * r.value),
  };
}

/* ---------------- Refinery (crafting) ---------------- */
// Recipes carried over from the original Gear Refinery.
export const RECIPES = {
  'pyrite+pyrite': { slot: 'weapon', name: 'Infernal Greataxe', tier: 1, bonus: { atk: 1.25, lifesteal: 3 }, icon: '🪓' },
  'aether+pyrite': { slot: 'boots', name: 'Zephyr Flame Greaves', tier: 1, bonus: { speed: 1.5, atk: 0.4 }, icon: '🥾' },
  'pyrite+titanium': { slot: 'weapon', name: 'Titanium Cleaver', tier: 1, bonus: { atk: 1.1, armor: 0.5 }, icon: '⚔️' },
  'catalyst+pyrite': { slot: 'weapon', name: 'Astral Sunblade', tier: 2, bonus: { atk: 1.35, crit: 8 }, icon: '🗡️' },
  'aether+aether': { slot: 'boots', name: 'Quicksilver Boots', tier: 1, bonus: { speed: 2.0, cdr: 4 }, icon: '🥾' },
  'aether+titanium': { slot: 'armor', name: 'Kinetic Bulwark', tier: 1, bonus: { hp: 1.3, armor: 1.0 }, icon: '🛡️' },
  'aether+catalyst': { slot: 'relic', name: 'Nova Chronometer', tier: 2, bonus: { cdr: 12, mp: 1.2 }, icon: '⌛' },
  'titanium+titanium': { slot: 'armor', name: 'Juggernaut Carapace', tier: 1, bonus: { hp: 1.5, armor: 1.4 }, icon: '🛡️' },
  'catalyst+titanium': { slot: 'armor', name: 'Voidforged Aegis', tier: 2, bonus: { hp: 1.4, armor: 1.2, regen: 4 }, icon: '🔰' },
  'catalyst+catalyst': { slot: 'relic', name: 'Eye of the Broadroads', tier: 2, bonus: { crit: 12, atk: 0.6 }, icon: '💍' },
};

export const MATERIALS_PER_SLOT = 3;

export function recipeKey(a, b) { return [a, b].sort().join('+'); }

export function craftCost(level) { return 25 + level * 6; }

export function craftItem(rng, a, b, level) {
  const recipe = RECIPES[recipeKey(a, b)];
  if (!recipe) return null;
  const rarity = recipe.tier === 2 ? (rng.chance(0.2) ? 'legendary' : 'epic') : (rng.chance(0.25) ? 'epic' : 'rare');
  const item = generateItem(rng, { ilvl: level + 2, rarity, slot: recipe.slot });
  const stats = { ...item.stats };
  for (const [k, v] of Object.entries(recipe.bonus)) {
    if (PCT_STATS.has(k) || k === 'regen') stats[k] = (stats[k] || 0) + v;
    else stats[k] = Math.round((stats[k] || primaryStats(recipe.slot, level, 1)[k] || (level + 4)) * v);
  }
  return { ...item, name: recipe.name, icon: recipe.icon, stats, crafted: true, value: item.value * 2 };
}

/* ---------------- Shop ---------------- */
export const POTIONS = {
  hp: { id: 'hp', name: 'Health Potion', icon: '❤️', price: 20, heal: 0.4 },
  mp: { id: 'mp', name: 'Mana Potion', icon: '💧', price: 20, heal: 0.5 },
};
export const MAX_POTIONS = 20;

export function shopStock(level, seed) {
  const rng = new RNG(seed);
  const items = [];
  for (const slot of ['weapon', 'armor', 'boots', 'relic']) {
    items.push(generateItem(rng, { ilvl: level, rarity: 'uncommon', slot }));
  }
  items.push(generateItem(rng, { ilvl: level, rarity: 'rare' }));
  return items.map(it => ({ ...it, price: it.value * 4 }));
}

export function sellPrice(item) { return item.value; }

/* ---------------- Loot tables ---------------- */
export function rollMaterial(rng, luck = 0) {
  return rng.weighted([['pyrite', 30], ['aether', 30], ['titanium', 28], ['catalyst', 8 + luck * 3]]);
}

export function itemScore(item) {
  if (!item) return 0;
  const s = item.stats || {};
  return (s.atk || 0) * 4 + (s.armor || 0) * 2 + (s.hp || 0) / 5 + (s.mp || 0) / 8 +
    (s.crit || 0) * 2 + (s.speed || 0) * 2 + (s.cdr || 0) * 2 + (s.lifesteal || 0) * 3 + (s.regen || 0) * 2;
}
