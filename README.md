# BROADROADS: Isometric Gear Refinery Arena ⚡

> **A bite-sized, single-screen 3D action RPG utilizing Three.js, optimized for mobile touch and desktop gameplay.**
> Survive escalating waves of void horrors, harvest raw elemental minerals, and forge upgraded armor, blades, and greaves in high-stakes 3-minute combat loops.
> **Featuring 12 Monthly Seasonal Themes, 36 Unique Hero Classes, and up to 4-Player Serverless Online Co-op (WebRTC P2P)!**

---

## 🌟 What's New & Core Features

### 1. 📅 12 Monthly Seasonal Themes & 36 Unique Hero Classes
BROADROADS moves beyond static neon styling with **12 complete monthly arena seasons**. Every month features tailored 3D lighting, custom ground palettes, ambient fog, dust motes, and **3 distinct thematic classes (Melee, Ranged, Magic)**:

| Month | Season Theme | 🛡️ Melee Class | 🏹 Ranged Class | 🔮 Magic Class |
| :--- | :--- | :--- | :--- | :--- |
| **January** | ❄️ Frostforge Citadel | **Frost Paladin** (`Glacial Cataclysm`) | **Cryo Gunslinger** (`Blizzard Barrage`) | **Blizzard Archon** (`Zero-Point Singularity`) |
| **February** | 🌋 Obsidian Netherforge | **Magma Juggernaut** (`Eruption Slam`) | **Pyre Commando** (`Meteor Rain`) | **Infernal Warlock** (`Hellfire Chasm`) |
| **March** | 🌿 Verdant Overgrowth | **Thorn Vanguard** (`Tanglewood Burst`) | **Spore Ranger** (`Cluster Pod Barrage`) | **Verdant Druid** (`Grave Root Singularity`) |
| **April** | ⚡ Tempest Sky Bastion | **Thunder Knight** (`Gigavolt Slam`) | **Storm Carbineer** (`Lightning Rocket Volley`) | **Tempestcaller** (`Storm Eye Vortex`) |
| **May** | 👑 Gilded Solstice Citadel | **Solar Champion** (`Supernova Burst`) | **Radiant Archer** (`Solar Flare Strike`) | **Aurelian Sage** (`Gravity Wells`) |
| **June** | 🌊 Abyssal Trench | **Tide Warden** (`Abyssal Wave Slam`) | **Harpooner** (`Depth Charge Torpedoes`) | **Siren Enchanter** (`Maelstrom Abyss`) |
| **July** | ✨ Astral Starlight Nexus | **Cosmic Knight** (`Supernova Blast`) | **Starlight Striker** (`Comet Volley`) | **Nebula Weaver** (`Singularity Rift`) |
| **August** | ⚙️ Ironclad Wasteland | **Steam Dreadnought** (`Quake Cleave`) | **Gatling Mech** (`Overcharged Salvo`) | **Scrap Alchemist** (`Magnetic Vortex`) |
| **September** | 🌸 Spirit Twilight Glen | **Moonlit Blade** (`Lunar Crescent`) | **Phantom Bowmaster** (`Ghost Spirit Missiles`) | **Spiritbinder** (`Soul Singularity`) |
| **October** | 🎃 Hallowed Dusk | **Pumpkin Slayer** (`Jack-O-Lantern Slam`) | **Grave Marksman** (`Bat Swarm Rockets`) | **Necromancer** (`Void Soul Well`) |
| **November** | 🕰️ Chrono Clockwork Vault | **Clockwork Sentinel** (`Time Rupture`) | **Steam Pulser** (`Temporal Rockets`) | **Chronomancer** (`Time Dilation Vortex`) |
| **December** | 🌌 Aurora Borealis Solstice | **Glacier Champion** (`Boreal Cataclysm`) | **Aurora Gunslinger** (`Prismatic Rocket Rain`) | **Celestial Mystic** (`Aurora Vortex Well`) |

Players can switch themes anytime using the seasonal dropdown menu in the start screen, or play the active calendar month automatically!

---

### 2. 🌐 Up to 4-Player Peer-to-Peer Co-op Multiplayer
- **Serverless WebRTC (PeerJS)**: Zero dedicated game server required! Runs entirely free on GitHub Pages and static web hosts.
- **4-Player Lobbies**: Star-Topology Host relay connects up to 4 players simultaneously with real-time slot roster tracking.
- **Pure Numeric Room Codes**: Generates clean numeric codes with no digit limit (e.g. `#748201`, `#4918234`), with direct invite URL support (`?room=748201`).
- **Synchronized Hit & Combat Visibility**:
  - All player attack swings, lasers, sparks, rockets, and ultimate vortexes are visible across all screens.
  - Every enemy strike broadcasts an authoritative `ENEMY_HIT` event showing the attacker's username, floating combat text (`CRIT! 84`), white damage flashes, and knockback!
- **Co-op Squad Revives**:
  - Downed teammates can crawl slowly while alive squadmates stand within their runic reviving circle to resurrect them with 50% HP.
  - Game Over triggers only when all connected squad members are downed.
- **Required Commander Usernames**:
  - Every player chooses a persistent Commander username (minimum 2 characters).
  - Floating 3D overhead nameplates display player names, live HP bars, downed warnings, and host crowns (`👑`).

---

### 3. ⚔️ Single Player Modes
- **🏆 Classic Survival**: 5 waves of escalating enemy counts culminating in the Overlord boss fight.
- **♾️ Endless Horde**: Uncapped scaling waves with recurring boss encounters every 5 rounds, tracking total kills, damage, and waves conquered.

---

## 🕹️ Controls Guide

| Action | Mobile (Touch) | Desktop (Mouse & Keyboard) |
| :--- | :--- | :--- |
| **Move** | Left virtual joystick | `W`, `A`, `S`, `D` or Arrow Keys |
| **Strike / Shoot** | Tap `⚔️ STRIKE` or tap canvas | `Space`, `F`, `J`, or Left Click |
| **Dash / Dodge** | Tap `💨 DASH` button | `Shift`, `K`, or Right Click |
| **Special Skill** | Tap `⚡ NOVA / BARRAGE / VORTEX` | `E`, `Q`, or `L` |
| **Auto-Attack** | Tap `🎯 AUTO` toggle | `C` or `R` |
| **Refinery Craft**| Tap mineral cards to insert | Tap/Click minerals + `🔨 STRIKE ANVIL` |

---

## 🔨 Refinery Crafting Recipes

| Combination | Crafted Upgrade | Stat Bonuses |
| :--- | :--- | :--- |
| **Pyrite + Pyrite** | 🔥 Infernal Greataxe | `+28 ATK & Flaming Slash` |
| **Pyrite + Aether** | 🥾 Zephyr Flame Greaves | `+25% SPD & Fire Trail` |
| **Pyrite + Titanium** | ⚔️ Titanium Cleaver | `+22 ATK & Heavy Impact` |
| **Pyrite + Catalyst** | 🗡️ Astral Sunblade | `+35 ATK & +15% CRIT` |
| **Aether + Aether** | 🥾 Quicksilver Boots | `+35% SPD & Fast Dash` |
| **Aether + Titanium** | 🛡️ Kinetic Bulwark | `+150 HP & Shield Deflection` |
| **Aether + Catalyst** | ⌛ Nova Chronometer | `+40% Nova Charge Rate` |
| **Titanium + Titanium** | 🛡️ Juggernaut Carapace | `+220 MAX HP & 25% Armor` |
| **Titanium + Catalyst** | 🔰 Voidforged Aegis | `+180 HP & Thorn Damage` |
| **Catalyst + Catalyst** | 💍 Eye of the Broadroads | `+25% CRIT & Nova Shockwave` |

---

## 🚀 Development & Deployment

```bash
# Install dependencies
npm install

# Start local dev server
npm run dev

# Build for production
npm run build
```
