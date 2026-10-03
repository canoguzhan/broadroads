/* 12 Monthly Themes & 36 Hero Classes */
    const MONTHLY_THEMES = [
      {
        id: 'january', month: 0, monthName: 'January', name: 'Frostforge Citadel', icon: '❄️',
        desc: 'Glacial Ice, Frozen Obsidian & Blizzard Rime',
        primary: '#00f0ff', secondary: '#38bdf8', accent: '#f0f9ff',
        bgDark: '#040a14', bgCard: 'rgba(6, 18, 36, 0.92)', borderColor: 'rgba(0, 240, 255, 0.45)',
        primaryHex: 0x00f0ff, secondaryHex: 0x38bdf8, accentHex: 0xf0f9ff,
        fogColor: 0x040a14, ambientColor: 0x1e3a5f, sunColor: 0xd0f0fd, arenaColor: 0x0a192f, dustHex: 0xa5f3fc,
        classes: [
          { id: 'paladin', type: 'melee', name: 'Frost Paladin', icon: '🛡️', desc: 'Glacial Greatblade & Permafrost Shield. Slowing ice sweeps.', special: 'Glacial Cataclysm', specialDesc: 'Radial ground freeze shockwave shattering nearby foes.' },
          { id: 'gunner', type: 'ranged', name: 'Cryo Gunslinger', icon: '🏹', desc: 'Dual Frostfire Blasters. Piercing sub-zero lances.', special: 'Blizzard Barrage', specialDesc: 'Calls down homing frost rockets raining from orbit.' },
          { id: 'arcanist', type: 'magic', name: 'Blizzard Archon', icon: '🔮', desc: 'Orb of Absolute Zero. Chaining frost sparks and freezing nova.', special: 'Zero-Point Singularity', specialDesc: 'Summons a sub-zero vortex that pulls and chills all horrors.' }
        ]
      },
      {
        id: 'february', month: 1, monthName: 'February', name: 'Obsidian Netherforge', icon: '🌋',
        desc: 'Molten Magma, Ruby Lava & Scorched Earth',
        primary: '#ff334b', secondary: '#ff7700', accent: '#ffd166',
        bgDark: '#120508', bgCard: 'rgba(32, 10, 16, 0.92)', borderColor: 'rgba(255, 51, 75, 0.45)',
        primaryHex: 0xff334b, secondaryHex: 0xff7700, accentHex: 0xffd166,
        fogColor: 0x120508, ambientColor: 0x4a121a, sunColor: 0xffedd5, arenaColor: 0x220c11, dustHex: 0xfca5a5,
        classes: [
          { id: 'paladin', type: 'melee', name: 'Magma Juggernaut', icon: '🛡️', desc: 'Molten Cleaver & Pyre Shield. Flaming sweeping swings.', special: 'Eruption Slam', specialDesc: 'Ground eruption blasting magma shockwaves in all directions.' },
          { id: 'gunner', type: 'ranged', name: 'Pyre Commando', icon: '🏹', desc: 'Dual Flamethrower Cannons. Incendiary plasma rounds.', special: 'Meteor Rain', specialDesc: 'Orbital artillery rain of molten meteorites.' },
          { id: 'arcanist', type: 'magic', name: 'Infernal Warlock', icon: '🔮', desc: 'Nether Crystal Core. Hellfire arcs and burn embers.', special: 'Hellfire Chasm', specialDesc: 'Summons a fiery demonic chasm pulling in horrors.' }
        ]
      },
      {
        id: 'march', month: 2, monthName: 'March', name: 'Verdant Overgrowth', icon: '🌿',
        desc: 'Bioluminescent Flora, Toxic Spores & Emerald Jungle',
        primary: '#10b981', secondary: '#84cc16', accent: '#ecfccb',
        bgDark: '#03140e', bgCard: 'rgba(6, 32, 22, 0.92)', borderColor: 'rgba(16, 185, 129, 0.45)',
        primaryHex: 0x10b981, secondaryHex: 0x84cc16, accentHex: 0xecfccb,
        fogColor: 0x03140e, ambientColor: 0x064e3b, sunColor: 0xdcfce7, arenaColor: 0x06281c, dustHex: 0x6ee7b7,
        classes: [
          { id: 'paladin', type: 'melee', name: 'Thorn Vanguard', icon: '🛡️', desc: 'Briar Greatblade & Living Bark Aegis. Piercing flora slashes.', special: 'Tanglewood Burst', specialDesc: 'Erupts thorny vines that cleave surrounding threats.' },
          { id: 'gunner', type: 'ranged', name: 'Spore Ranger', icon: '🏹', desc: 'Dual Toxic Dart Blasters. Rapid poison flechettes.', special: 'Cluster Pod Barrage', specialDesc: 'Fires explosive bio-spore pods covering the arena.' },
          { id: 'arcanist', type: 'magic', name: 'Verdant Druid', icon: '🔮', desc: 'Seed of Gaia. Bouncing floral sparks and bio-shocks.', special: 'Grave Root Singularity', specialDesc: 'Roots all foes toward a dense vegetative gravitational well.' }
        ]
      },
      {
        id: 'april', month: 3, monthName: 'April', name: 'Tempest Sky Bastion', icon: '⚡',
        desc: 'Lightning Thunderstorms, Electric Violet & High Voltage',
        primary: '#818cf8', secondary: '#38bdf8', accent: '#facc15',
        bgDark: '#080b18', bgCard: 'rgba(16, 20, 48, 0.92)', borderColor: 'rgba(129, 140, 248, 0.45)',
        primaryHex: 0x818cf8, secondaryHex: 0x38bdf8, accentHex: 0xfacc15,
        fogColor: 0x080b18, ambientColor: 0x1e1b4b, sunColor: 0xe0e7ff, arenaColor: 0x11162e, dustHex: 0xa5b4fc,
        classes: [
          { id: 'paladin', type: 'melee', name: 'Thunder Vanguard', icon: '🛡️', desc: 'Storm Hammer & Volt Buckler. Electrified sweeps and shockwaves.', special: 'Thunderclap Nova', specialDesc: 'Calls down a colossal lightning strike discharging across arena.' },
          { id: 'gunner', type: 'ranged', name: 'Railgun Striker', icon: '🏹', desc: 'Dual High-Voltage Rifles. Piercing lightning beams.', special: 'Ion Cannon Strike', specialDesc: 'Rains charged orbital ion missiles that detonate on impact.' },
          { id: 'arcanist', type: 'magic', name: 'Tempest Invoker', icon: '🔮', desc: 'Tesla Core. Chaining arc lightning and ball shocks.', special: 'Plasma Storm Vortex', specialDesc: 'Forms an electrified cyclone dragging enemies into high voltage.' }
        ]
      },
      {
        id: 'may', month: 4, monthName: 'May', name: 'Gilded Solstice', icon: '☀️',
        desc: 'Radiant Sun, Golden Dunes & Ancient Sand Temple',
        primary: '#f59e0b', secondary: '#fbbf24', accent: '#fffbeb',
        bgDark: '#140d04', bgCard: 'rgba(36, 24, 8, 0.92)', borderColor: 'rgba(245, 158, 11, 0.45)',
        primaryHex: 0xf59e0b, secondaryHex: 0xfbbf24, accentHex: 0xfffbeb,
        fogColor: 0x140d04, ambientColor: 0x451a03, sunColor: 0xfef3c7, arenaColor: 0x291a07, dustHex: 0xfcd34d,
        classes: [
          { id: 'paladin', type: 'melee', name: 'Sun Templar', icon: '🛡️', desc: 'Solar Greatsword & Dawn Guard. Searing golden sweeps.', special: 'Supernova Flare', specialDesc: 'Radial burst of blinding radiant sunlight burning hordes.' },
          { id: 'gunner', type: 'ranged', name: 'Desert Gunslinger', icon: '🏹', desc: 'Dual Golden Revolvers. Ricocheting solar rounds.', special: 'Solar Flare Cascade', specialDesc: 'Unleashes a barrage of homing solar rays from heavens.' },
          { id: 'arcanist', type: 'magic', name: 'Dawn Oracle', icon: '🔮', desc: 'Sun Prism. Radiant light sparks that illuminate and pierce.', special: 'Corona Singularity', specialDesc: 'Creates a miniature golden star pulling in all enemies.' }
        ]
      },
      {
        id: 'june', month: 5, monthName: 'June', name: 'Abyssal Trench', icon: '🌊',
        desc: 'Deep Bioluminescent Ocean, Mariana Trench & Coral',
        primary: '#06b6d4', secondary: '#14b8a6', accent: '#cffafe',
        bgDark: '#031018', bgCard: 'rgba(4, 28, 40, 0.92)', borderColor: 'rgba(6, 182, 212, 0.45)',
        primaryHex: 0x06b6d4, secondaryHex: 0x14b8a6, accentHex: 0xcffafe,
        fogColor: 0x031018, ambientColor: 0x083344, sunColor: 0xccfbf1, arenaColor: 0x062230, dustHex: 0x67e8f9,
        classes: [
          { id: 'paladin', type: 'melee', name: 'Trench Berserker', icon: '🛡️', desc: 'Coral Glaive & Leviathan Carapace. Sweeping tidal crescents.', special: 'Tidal Shockwave', specialDesc: 'Erupts a high-pressure geyser shockwave across the arena.' },
          { id: 'gunner', type: 'ranged', name: 'Harpoon Commando', icon: '🏹', desc: 'Twin Pneumatic Harpoon Launchers. Hydro darts.', special: 'Torpedo Salvo', specialDesc: 'Launches a cluster of homing acoustic torpedoes.' },
          { id: 'arcanist', type: 'magic', name: 'Siren Weaver', icon: '🔮', desc: 'Pearl of the Abyss. Bouncing whirlpool orbs and water arcs.', special: 'Abyssal Maelstrom', specialDesc: 'Creates an inescapable whirlpool drowning nearby horrors.' }
        ]
      },
      {
        id: 'july', month: 6, monthName: 'July', name: 'Astral Starlight', icon: '✨',
        desc: 'Deep Cosmic Void, Nebula Magenta & Stardust',
        primary: '#a855f7', secondary: '#ec4899', accent: '#fdf4ff',
        bgDark: '#0a0414', bgCard: 'rgba(24, 10, 40, 0.92)', borderColor: 'rgba(168, 85, 247, 0.45)',
        primaryHex: 0xa855f7, secondaryHex: 0xec4899, accentHex: 0xfdf4ff,
        fogColor: 0x0a0414, ambientColor: 0x3b0764, sunColor: 0xfae8ff, arenaColor: 0x1a092c, dustHex: 0xd8b4fe,
        classes: [
          { id: 'paladin', type: 'melee', name: 'Nebula Knight', icon: '🛡️', desc: 'Starforged Blade & Astral Aegis. Sweeping cosmic stardust.', special: 'Galactic Supernova', specialDesc: 'Detonates a starcore shockwave obliterating nearby horrors.' },
          { id: 'gunner', type: 'ranged', name: 'Pulsar Gunner', icon: '🏹', desc: 'Twin Astral Blasters. High-frequency pulsar laser rays.', special: 'Comet Barrage', specialDesc: 'Calls down a constellation of flaming comets.' },
          { id: 'arcanist', type: 'magic', name: 'Void Seer', icon: '🔮', desc: 'Cosmic Singularity Stone. Star flurries and nebula sparks.', special: 'Event Horizon', specialDesc: 'Rips open a gravitational void pulling all matter into darkness.' }
        ]
      },
      {
        id: 'august', month: 7, monthName: 'August', name: 'Ironclad Wasteland', icon: '⚙️',
        desc: 'Heavy Industrial, Rust, Brass, Steam & Smog',
        primary: '#f97316', secondary: '#d97706', accent: '#fde047',
        bgDark: '#120e0a', bgCard: 'rgba(32, 22, 14, 0.92)', borderColor: 'rgba(249, 115, 22, 0.45)',
        primaryHex: 0xf97316, secondaryHex: 0xd97706, accentHex: 0xfde047,
        fogColor: 0x120e0a, ambientColor: 0x431407, sunColor: 0xffedd5, arenaColor: 0x241810, dustHex: 0xfdba74,
        classes: [
          { id: 'paladin', type: 'melee', name: 'Steel Bruiser', icon: '🛡️', desc: 'Steam Cleaver & Riveted Plating. Brutal heavy industrial slashes.', special: 'Overdrive Slam', specialDesc: 'Releases high-pressure steam boiler shockwaves.' },
          { id: 'gunner', type: 'ranged', name: 'Gatling Tech', icon: '🏹', desc: 'Dual Rotary Miniguns. Rapid-fire heavy brass rounds.', special: 'Artillery Strike', specialDesc: 'Calls an orbital barrage of explosive heavy mortar shells.' },
          { id: 'arcanist', type: 'magic', name: 'Spark Alchemist', icon: '🔮', desc: 'Voltaic Battery. Acid bolts and chemical galvanic sparks.', special: 'Chemical Rupture', specialDesc: 'Ignites a dense chemical vortex dissolving monster armor.' }
        ]
      },
      {
        id: 'september', month: 8, monthName: 'September', name: 'Spirit Twilight', icon: '🍂',
        desc: 'Autumn Foliage, Golden Leaves & Spirit Realm',
        primary: '#ea580c', secondary: '#ca8a04', accent: '#fed7aa',
        bgDark: '#12080a', bgCard: 'rgba(32, 16, 20, 0.92)', borderColor: 'rgba(234, 88, 12, 0.45)',
        primaryHex: 0xea580c, secondaryHex: 0xca8a04, accentHex: 0xfed7aa,
        fogColor: 0x12080a, ambientColor: 0x450a0a, sunColor: 0xfef08a, arenaColor: 0x241014, dustHex: 0xfba05e,
        classes: [
          { id: 'paladin', type: 'melee', name: 'Spirit Samurai', icon: '🛡️', desc: 'Autumn Katana & Spirit Barrier. Graceful spectral slashes.', special: 'Ghost Blade Whirl', specialDesc: 'Whirlwind of ghostly blades slicing through surrounding foes.' },
          { id: 'gunner', type: 'ranged', name: 'Wind Ranger', icon: '🏹', desc: 'Twin Gale Bows. Piercing razor wind feathers.', special: 'Typhoon Barrage', specialDesc: 'Summons a rain of gale arrows descending from autumn skies.' },
          { id: 'arcanist', type: 'magic', name: 'Ethereal Shaman', icon: '🔮', desc: 'Spirit Bell. Chaining spirit wisps and spectral sparks.', special: 'Ancestral Well', specialDesc: 'Opens an ancestral spirit well pulling and draining enemy life.' }
        ]
      },
      {
        id: 'october', month: 9, monthName: 'October', name: 'Hallowed Dusk', icon: '🎃',
        desc: 'Haunted Crypt, Gothic Violet & Eerie Ectoplasm',
        primary: '#8b5cf6', secondary: '#22c55e', accent: '#f97316',
        bgDark: '#080410', bgCard: 'rgba(20, 10, 34, 0.92)', borderColor: 'rgba(139, 92, 246, 0.45)',
        primaryHex: 0x8b5cf6, secondaryHex: 0x22c55e, accentHex: 0xf97316,
        fogColor: 0x080410, ambientColor: 0x2e1065, sunColor: 0xf3e8ff, arenaColor: 0x160c24, dustHex: 0xc4b5fd,
        classes: [
          { id: 'paladin', type: 'melee', name: 'Crypt Reaper', icon: '🛡️', desc: 'Heavy Bone Scythe & Tombstone Shield. Cursed sweeping harvests.', special: 'Reaper Cataclysm', specialDesc: 'Radial soul rupture tearing the lifeforce of surrounding horrors.' },
          { id: 'gunner', type: 'ranged', name: 'Grave Marksman', icon: '🏹', desc: 'Twin Bone Pistols. Ectoplasm rounds and ghost shots.', special: 'Spectral Volley', specialDesc: 'Unleashes ghost missiles screaming down upon the battlefield.' },
          { id: 'arcanist', type: 'magic', name: 'Necro Caster', icon: '🔮', desc: 'Skull Relic. Cursed soul flames and phantom sparks.', special: 'Nether Chasm Vortex', specialDesc: 'Summons a crypt maw pulling horrors into eternal darkness.' }
        ]
      },
      {
        id: 'november', month: 10, monthName: 'November', name: 'Chrono Clockwork', icon: '🕰️',
        desc: 'Antique Brass, Precision Gears & Steam Pipes',
        primary: '#d97706', secondary: '#06b6d4', accent: '#fef3c7',
        bgDark: '#100d08', bgCard: 'rgba(30, 22, 14, 0.92)', borderColor: 'rgba(217, 119, 6, 0.45)',
        primaryHex: 0xd97706, secondaryHex: 0x06b6d4, accentHex: 0xfef3c7,
        fogColor: 0x100d08, ambientColor: 0x3d2008, sunColor: 0xffedd5, arenaColor: 0x22170f, dustHex: 0xfcd34d,
        classes: [
          { id: 'paladin', type: 'melee', name: 'Clockwork Automaton', icon: '🛡️', desc: 'Gear Greatsword & Brass Buckler. High-torque gear sweeps.', special: 'Temporal Shockwave', specialDesc: 'Releases a temporal shockwave distorting space around enemies.' },
          { id: 'gunner', type: 'ranged', name: 'Steam Bombardier', icon: '🏹', desc: 'Dual Flintlock Canisters. High-velocity clockwork pellets.', special: 'Clockwork Salvo', specialDesc: 'Calls an orbital barrage of ticking time-bombs.' },
          { id: 'arcanist', type: 'magic', name: 'Chronomancer', icon: '🔮', desc: 'Hourglass Core. Temporal energy sparks and chronal rifts.', special: 'Time Warp Vortex', specialDesc: 'Creates a singularity that slows and crushes time around foes.' }
        ]
      },
      {
        id: 'december', month: 11, monthName: 'December', name: 'Aurora Solstice', icon: '🌌',
        desc: 'Aurora Borealis, Cosmic Emerald & Starlight',
        primary: '#10b981', secondary: '#06b6d4', accent: '#fbbf24',
        bgDark: '#031018', bgCard: 'rgba(6, 26, 36, 0.92)', borderColor: 'rgba(16, 185, 129, 0.45)',
        primaryHex: 0x10b981, secondaryHex: 0x06b6d4, accentHex: 0xfbbf24,
        fogColor: 0x031018, ambientColor: 0x064e3b, sunColor: 0xe0f2fe, arenaColor: 0x06202c, dustHex: 0x6ee7b7,
        classes: [
          { id: 'paladin', type: 'melee', name: 'Aurora Paladin', icon: '🛡️', desc: 'Radiant Northern Lights Blade & Solar Aegis. Prismatic sweeps.', special: 'Northern Lights Nova', specialDesc: 'Erupts an emerald aurora shockwave enveloping the arena.' },
          { id: 'gunner', type: 'ranged', name: 'Solstice Sniper', icon: '🏹', desc: 'Twin Crystal Blasters. Radiant star fragments.', special: 'Comet Salvo', specialDesc: 'Calls down sparkling comets raining cosmic starlight.' },
          { id: 'arcanist', type: 'magic', name: 'Starlight Weaver', icon: '🔮', desc: 'Prism of Heaven. Rainbow light rays and aurora sparks.', special: 'Borealis Singularity', specialDesc: 'Creates a shimmering celestial vortex pulling all creatures in.' }
        ]
      }
    ];


export { MONTHLY_THEMES };
window.MONTHLY_THEMES = MONTHLY_THEMES;

