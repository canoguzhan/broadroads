/* Game Config & Crafting Recipes */
    const GAME_CONFIG = {
      TOTAL_WAVES: 5,
      WAVE_DURATION: 30,
      REFINERY_DURATION: 25,
      ARENA_RADIUS: 14,
    };

    const RECIPES = {
      'pyrite+pyrite': { slot: 'weapon', name: 'Infernal Greataxe', tierBonus: 1, statText: '+28 ATK & Flaming Slash', icon: '🪓' },
      'aether+pyrite': { slot: 'boots', name: 'Zephyr Flame Greaves', tierBonus: 1, statText: '+25% SPD & Fire Trail', icon: '🥾' },
      'pyrite+titanium': { slot: 'weapon', name: 'Titanium Cleaver', tierBonus: 1, statText: '+22 ATK & Heavy Impact', icon: '⚔️' },
      'catalyst+pyrite': { slot: 'weapon', name: 'Astral Sunblade', tierBonus: 2, statText: '+35 ATK & +15% CRIT', icon: '🗡️' },
      'aether+aether': { slot: 'boots', name: 'Quicksilver Boots', tierBonus: 1, statText: '+35% SPD & Fast Dash', icon: '🥾' },
      'aether+titanium': { slot: 'armor', name: 'Kinetic Bulwark', tierBonus: 1, statText: '+150 HP & Shield Deflection', icon: '🛡️' },
      'aether+catalyst': { slot: 'relic', name: 'Nova Chronometer', tierBonus: 2, statText: '+40% Nova Charge Rate', icon: '⌛' },
      'titanium+titanium': { slot: 'armor', name: 'Juggernaut Carapace', tierBonus: 1, statText: '+220 MAX HP & 25% Armor', icon: '🛡️' },
      'catalyst+titanium': { slot: 'armor', name: 'Voidforged Aegis', tierBonus: 2, statText: '+180 HP & Thorn Damage', icon: '🔰' },
      'catalyst+catalyst': { slot: 'relic', name: 'Eye of the Broadroads', tierBonus: 2, statText: '+25% CRIT & Nova Shockwave', icon: '💍' }
    };


export { GAME_CONFIG, RECIPES };
window.GAME_CONFIG = GAME_CONFIG;
window.RECIPES = RECIPES;

