/* Shop items. `cost` is the total price; buying an item that has components in
   your inventory consumes them and discounts their cost (recipe system). */

export const ITEMS = {
  // ---- consumables ----
  potion: { name: 'Healing Draught', icon: '🧪', cost: 50, cat: 'consumable', stats: {}, consumable: true, stack: 5, desc: 'Restores 150 health over 12s.' },

  // ---- basic ----
  blade: { name: 'Iron Blade', icon: '🗡️', cost: 350, cat: 'basic', stats: { ad: 10 } },
  tome: { name: 'Apprentice Tome', icon: '📕', cost: 435, cat: 'basic', stats: { ap: 20 } },
  vest: { name: 'Padded Vest', icon: '🧥', cost: 300, cat: 'basic', stats: { armor: 15 } },
  veil: { name: 'Warding Veil', icon: '🧣', cost: 450, cat: 'basic', stats: { mr: 25 } },
  heartgem: { name: 'Heartgem', icon: '❤️', cost: 400, cat: 'basic', stats: { hp: 150 } },
  managem: { name: 'Manastone', icon: '🔷', cost: 350, cat: 'basic', stats: { mp: 250 } },
  knife: { name: 'Quick Knife', icon: '🔪', cost: 300, cat: 'basic', stats: { as: 12 } },
  boots: { name: 'Traveler\'s Boots', icon: '👢', cost: 300, cat: 'boots', stats: { ms: 0.35 }, boots: true },
  warpick: { name: 'War Pick', icon: '⛏️', cost: 875, cat: 'basic', stats: { ad: 25 } },
  wand: { name: 'Ember Wand', icon: '🪄', cost: 850, cat: 'basic', stats: { ap: 40 } },
  girdle: { name: 'Titan Girdle', icon: '🎗️', cost: 900, cat: 'basic', stats: { hp: 350 } },
  feather: { name: 'Swift Feather', icon: '🪶', cost: 600, cat: 'basic', stats: { crit: 15 } },

  // ---- boots ----
  windboots: { name: 'Windrunner Boots', icon: '🥾', cost: 900, cat: 'boots', from: ['boots'], stats: { ms: 0.9 }, boots: true },
  ironboots: { name: 'Ironshod Boots', icon: '🛡️', cost: 1100, cat: 'boots', from: ['boots', 'vest'], stats: { ms: 0.65, armor: 20 }, boots: true },
  warboots: { name: 'Steadfast Boots', icon: '🦶', cost: 1100, cat: 'boots', from: ['boots', 'veil'], stats: { ms: 0.65, mr: 25, tenacity: 30 }, boots: true },
  spellboots: { name: 'Spellweaver Shoes', icon: '🪄', cost: 1100, cat: 'boots', from: ['boots'], stats: { ms: 0.65, magicPen: 15 }, boots: true },
  sageboots: { name: 'Sage\'s Sandals', icon: '⏳', cost: 950, cat: 'boots', from: ['boots'], stats: { ms: 0.65, haste: 20 }, boots: true },
  rushboots: { name: 'Rusher\'s Boots', icon: '💨', cost: 1100, cat: 'boots', from: ['boots', 'knife'], stats: { ms: 0.65, as: 30 }, boots: true },

  // ---- attack ----
  vampblade: { name: 'Crimson Fang', icon: '🩸', cost: 3400, cat: 'attack', from: ['warpick', 'blade', 'feather'], stats: { ad: 55, lifesteal: 18, crit: 15 } },
  starblade: { name: 'Starforged Edge', icon: '🌟', cost: 3400, cat: 'attack', from: ['warpick', 'warpick', 'feather'], stats: { ad: 65, crit: 25 }, passive: 'Critical strikes deal 40% more damage.', critBonus: 0.4 },
  galebow: { name: 'Galecaller Bow', icon: '🏹', cost: 2600, cat: 'attack', from: ['knife', 'knife', 'feather'], stats: { as: 40, crit: 25, msPct: 7 } },
  cleaver: { name: 'Rending Cleaver', icon: '🪓', cost: 3000, cat: 'attack', from: ['warpick', 'heartgem'], stats: { ad: 40, hp: 300, haste: 20 } },
  maul: { name: 'Executioner\'s Maul', icon: '🔨', cost: 3100, cat: 'attack', from: ['warpick', 'heartgem'], stats: { ad: 50, hp: 250 }, passive: 'Deals 12% more damage to champions below 40% health.', executioner: 0.12 },
  piercer: { name: 'Armorbreaker', icon: '⚔️', cost: 3000, cat: 'attack', from: ['warpick', 'blade'], stats: { ad: 45, armorPen: 30 } },

  // ---- magic ----
  crown: { name: 'Archmage\'s Crown', icon: '🎩', cost: 3600, cat: 'magic', from: ['wand', 'wand'], stats: { ap: 120 }, passive: 'Increases ability power by 35%.', apMult: 0.35 },
  nullstaff: { name: 'Nullstaff', icon: '🕳️', cost: 3000, cat: 'magic', from: ['wand', 'tome'], stats: { ap: 70, magicPenPct: 40 } },
  frostorb: { name: 'Frostbound Orb', icon: '❄️', cost: 2900, cat: 'magic', from: ['wand', 'heartgem'], stats: { ap: 80, hp: 300 }, passive: 'Ability damage slows enemies by 20% for 1s.', abilitySlow: true },
  stormrod: { name: 'Stormcaller Rod', icon: '⚡', cost: 2800, cat: 'magic', from: ['wand', 'tome'], stats: { ap: 75, msPct: 6, haste: 15 } },
  lifeorb: { name: 'Lifeweaver Orb', icon: '🌱', cost: 2500, cat: 'magic', from: ['tome', 'heartgem'], stats: { ap: 50, hp: 200, haste: 15, mpRegen: 1.5 }, passive: 'Your heals and shields on allies are 20% stronger.', healPower: 0.2 },
  codex: { name: 'Scholar\'s Codex', icon: '📘', cost: 3000, cat: 'magic', from: ['tome', 'managem', 'tome'], stats: { ap: 60, haste: 25, mp: 400 } },

  // ---- defense ----
  spikeplate: { name: 'Spiked Plate', icon: '🌵', cost: 2700, cat: 'defense', from: ['vest', 'girdle'], stats: { armor: 70, hp: 350 }, passive: 'Reflects magic damage to attackers who hit you with basic attacks.', thorns: true },
  grovecharm: { name: 'Grove Charm', icon: '💚', cost: 2900, cat: 'defense', from: ['veil', 'girdle'], stats: { hp: 450, mr: 50, hpRegen: 2, haste: 10 }, passive: 'Increases healing and shielding received by 25%.', healAmp: 0.25 },
  wardenmail: { name: 'Warden\'s Mail', icon: '🛡️', cost: 2800, cat: 'defense', from: ['vest', 'veil'], stats: { armor: 45, mr: 40, hp: 200, tenacity: 20 } },
  colossus: { name: 'Colossus Heart', icon: '💗', cost: 3000, cat: 'defense', from: ['girdle', 'heartgem', 'heartgem'], stats: { hp: 800, hpRegen: 4 } },
  emberplate: { name: 'Emberplate Aegis', icon: '🔥', cost: 2800, cat: 'defense', from: ['vest', 'girdle'], stats: { hp: 450, armor: 40 }, passive: 'Burns nearby enemies for magic damage every second.', burnAura: true },
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

export const SPELLS = {
  blink: { name: 'Blink', icon: '✨', cd: 150, desc: 'Teleports a short distance toward your cursor.' },
  mend: { name: 'Mend', icon: '💚', cd: 120, desc: 'Heals you and the most injured nearby ally, and grants a burst of movement speed.' },
  scorch: { name: 'Scorch', icon: '🔥', cd: 120, desc: 'Sets an enemy champion ablaze for true damage over 5s and reduces their healing.' },
  strike: { name: 'Hunter\'s Strike', icon: '⚡', cd: 45, desc: 'Deals heavy true damage to a monster or minion. Carry it to hunt in the jungle.' },
  haste: { name: 'Haste', icon: '👻', cd: 120, desc: 'Gain 40% movement speed for 8s.' },
  bulwark: { name: 'Bulwark', icon: '🛡️', cd: 120, desc: 'Shields yourself for 2.5s.' },
};
export const SECOND_SPELLS = ['mend', 'scorch', 'strike', 'haste', 'bulwark'];
