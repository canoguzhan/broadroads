/* Shop items. `cost` is the total price; buying an item that has components in
   your inventory consumes them and discounts their cost (recipe system). */

export const ITEMS = {
  // ---- consumables ----
  potion: { name: 'Health Potion', icon: '🧪', cost: 50, cat: 'consumable', stats: {}, consumable: true, stack: 5, desc: 'Restores 150 health over 12s.' },

  // ---- basic ----
  longsword: { name: 'Long Sword', icon: '🗡️', cost: 350, cat: 'basic', stats: { ad: 10 } },
  tome: { name: 'Amplifying Tome', icon: '📕', cost: 435, cat: 'basic', stats: { ap: 20 } },
  cloth: { name: 'Cloth Armor', icon: '🧥', cost: 300, cat: 'basic', stats: { armor: 15 } },
  cloak: { name: 'Null-Magic Mantle', icon: '🧣', cost: 450, cat: 'basic', stats: { mr: 25 } },
  ruby: { name: 'Ruby Crystal', icon: '❤️', cost: 400, cat: 'basic', stats: { hp: 150 } },
  sapphire: { name: 'Sapphire Crystal', icon: '🔷', cost: 350, cat: 'basic', stats: { mp: 250 } },
  dagger: { name: 'Dagger', icon: '🔪', cost: 300, cat: 'basic', stats: { as: 12 } },
  boots: { name: 'Boots', icon: '👢', cost: 300, cat: 'boots', stats: { ms: 0.35 }, boots: true },
  pickaxe: { name: 'Pickaxe', icon: '⛏️', cost: 875, cat: 'basic', stats: { ad: 25 } },
  rod: { name: 'Blasting Wand', icon: '🪄', cost: 850, cat: 'basic', stats: { ap: 40 } },
  belt: { name: 'Giant\'s Belt', icon: '🎗️', cost: 900, cat: 'basic', stats: { hp: 350 } },
  feather: { name: 'Cloak of Agility', icon: '🪶', cost: 600, cat: 'basic', stats: { crit: 15 } },

  // ---- boots ----
  swift: { name: 'Swiftness Boots', icon: '🥾', cost: 900, cat: 'boots', from: ['boots'], stats: { ms: 0.9 }, boots: true },
  greaves: { name: 'Plated Steelcaps', icon: '🛡️', cost: 1100, cat: 'boots', from: ['boots', 'cloth'], stats: { ms: 0.65, armor: 20 }, boots: true },
  treads: { name: 'Mercury\'s Treads', icon: '🦶', cost: 1100, cat: 'boots', from: ['boots', 'cloak'], stats: { ms: 0.65, mr: 25, tenacity: 30 }, boots: true },
  sorcboots: { name: 'Sorcerer\'s Shoes', icon: '🪄', cost: 1100, cat: 'boots', from: ['boots'], stats: { ms: 0.65, magicPen: 15 }, boots: true },
  ionian: { name: 'Ionian Boots', icon: '⏳', cost: 950, cat: 'boots', from: ['boots'], stats: { ms: 0.65, haste: 20 }, boots: true },
  berserker: { name: 'Berserker\'s Greaves', icon: '💨', cost: 1100, cat: 'boots', from: ['boots', 'dagger'], stats: { ms: 0.65, as: 30 }, boots: true },

  // ---- attack ----
  bloodthirster: { name: 'Bloodthirster', icon: '🩸', cost: 3400, cat: 'attack', from: ['pickaxe', 'longsword', 'feather'], stats: { ad: 55, lifesteal: 18, crit: 15 } },
  infinity: { name: 'Infinity Edge', icon: '🌟', cost: 3400, cat: 'attack', from: ['pickaxe', 'pickaxe', 'feather'], stats: { ad: 65, crit: 25 }, passive: 'Critical strikes deal 40% more damage.', critBonus: 0.4 },
  stormbow: { name: 'Stormrazor Bow', icon: '🏹', cost: 2600, cat: 'attack', from: ['dagger', 'dagger', 'feather'], stats: { as: 40, crit: 25, msPct: 7 } },
  cleaver: { name: 'Black Cleaver', icon: '🪓', cost: 3000, cat: 'attack', from: ['pickaxe', 'ruby'], stats: { ad: 40, hp: 300, haste: 20 } },
  executioner: { name: 'Lord Dominik\'s Regards', icon: '⚔️', cost: 3000, cat: 'attack', from: ['pickaxe', 'longsword'], stats: { ad: 45, armorPen: 30 } },

  // ---- magic ----
  archmage: { name: 'Rabadon\'s Deathcap', icon: '🎩', cost: 3600, cat: 'magic', from: ['rod', 'rod'], stats: { ap: 120 }, passive: 'Increases ability power by 35%.', apMult: 0.35 },
  voidscepter: { name: 'Void Staff', icon: '🕳️', cost: 3000, cat: 'magic', from: ['rod', 'tome'], stats: { ap: 70, magicPenPct: 40 } },
  frostorb: { name: 'Rylai\'s Scepter', icon: '❄️', cost: 2900, cat: 'magic', from: ['rod', 'ruby'], stats: { ap: 80, hp: 300 }, passive: 'Ability damage slows enemies by 20% for 1s.', abilitySlow: true },
  codex: { name: 'Arcane Codex', icon: '📘', cost: 3000, cat: 'magic', from: ['tome', 'sapphire', 'tome'], stats: { ap: 60, haste: 25, mp: 400 } },

  // ---- defense ----
  thornmail: { name: 'Thornmail', icon: '🌵', cost: 2700, cat: 'defense', from: ['cloth', 'belt'], stats: { armor: 70, hp: 350 }, passive: 'Reflects magic damage to attackers who hit you with basic attacks.', thorns: true },
  visage: { name: 'Spirit Visage', icon: '💚', cost: 2900, cat: 'defense', from: ['cloak', 'belt'], stats: { hp: 450, mr: 50, hpRegen: 2, haste: 10 }, passive: 'Increases healing and shielding received by 25%.', healAmp: 0.25 },
  titan: { name: 'Heartsteel', icon: '💗', cost: 3000, cat: 'defense', from: ['belt', 'ruby', 'ruby'], stats: { hp: 800, hpRegen: 4 } },
  sunfire: { name: 'Sunfire Aegis', icon: '🔥', cost: 2800, cat: 'defense', from: ['cloth', 'belt'], stats: { hp: 450, armor: 40 }, passive: 'Burns nearby enemies for magic damage every second.', burnAura: true },
};

export const ITEM_IDS = Object.keys(ITEMS);
export const INV_SLOTS = 6;
export const START_GOLD = 500;
export const SELL_RATIO = 0.7;

/** Price after discounting owned components (recursively). Returns { price, consume: [slotIndex...] }. */
export function priceFor(itemId, inventory) {
  const item = ITEMS[itemId];
  if (!item) return null;
  const available = inventory.map((it, i) => (it ? { id: it.id, i } : null)).filter(Boolean);
  const consume = [];
  let discount = 0;
  const take = id => {
    const k = available.findIndex(a => a.id === id && !consume.includes(a.i));
    if (k >= 0) { consume.push(available[k].i); discount += ITEMS[id].cost; return true; }
    return false;
  };
  const walk = id => {
    for (const c of ITEMS[id].from || []) if (!take(c)) walk(c);
  };
  walk(itemId);
  return { price: item.cost - discount, consume };
}

export const SUMMONERS = {
  flash: { name: 'Flash', icon: '✨', cd: 150, desc: 'Teleports a short distance toward your cursor.' },
  heal: { name: 'Heal', icon: '💚', cd: 120, desc: 'Heals you and the most injured nearby ally, and grants movement speed.' },
  ignite: { name: 'Ignite', icon: '🔥', cd: 120, desc: 'Burns an enemy champion for true damage over 5s and cuts their healing.' },
  smite: { name: 'Smite', icon: '⚡', cd: 45, desc: 'Deals heavy true damage to a monster or minion. Needed for jungling.' },
  ghost: { name: 'Ghost', icon: '👻', cd: 120, desc: 'Gain 40% movement speed for 8s.' },
  barrier: { name: 'Barrier', icon: '🛡️', cd: 120, desc: 'Shields yourself for 2.5s.' },
};
export const SECOND_SUMMONERS = ['heal', 'ignite', 'smite', 'ghost', 'barrier'];
