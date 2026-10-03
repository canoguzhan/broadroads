# BROADROADS: Isometric Gear Refinery Arena ⚡

> **A bite-sized, single-screen 3D action RPG utilizing Three.js, optimized for mobile touch and desktop gameplay.**
> Survive escalating waves of void horrors, harvest raw elemental minerals, and forge upgraded armor, blades, and greaves in high-stakes 3-minute combat loops.
> **Featuring 12 Monthly Seasonal Themes, 36 Unique Hero Classes, and up to 4-Player Serverless Online Co-op (WebRTC P2P)!**

---

## 🌟 What's New & Core Features

### 1. 📅 Automatic Monthly Seasonal Themes & 36 Unique Hero Classes
BROADROADS moves beyond static neon styling with **12 complete monthly arena seasons**. The arena automatically synchronizes to the **current calendar month** (e.g. October Hallowed Dusk), featuring tailored 3D lighting, custom ground palettes, ambient fog, dust motes, and **3 distinct thematic classes (Melee, Ranged, Magic)**:

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
| **October** | 🎃 Hallowed Dusk | **Crypt Reaper** (`Reaper Cataclysm`) | **Grave Marksman** (`Spectral Volley`) | **Necro Caster** (`Nether Chasm Vortex`) |
| **November** | 🕰️ Chrono Clockwork Vault | **Clockwork Sentinel** (`Time Rupture`) | **Steam Pulser** (`Temporal Rockets`) | **Chronomancer** (`Time Dilation Vortex`) |
| **December** | 🌌 Aurora Borealis Solstice | **Glacier Champion** (`Boreal Cataclysm`) | **Aurora Gunslinger** (`Prismatic Rocket Rain`) | **Celestial Mystic** (`Aurora Vortex Well`) |

The active season is automatically locked and showcased via the non-editable seasonal badge in the main lobby.

---

### 2. 💻 Platform Adaptation & Desktop Shortcuts
- **Automatic Platform Detection**: Detects desktop vs mobile touch environments. On desktop, the virtual touch joystick is hidden and keybind badges (`[C]`, `[E]`, `[SHIFT]`, `[SPACE]`) are displayed on action buttons.
- **Desktop Keyboard Shortcuts**: Only desktop players can trigger keyboard shortcuts (`WASD`/Arrows to move, `Space`/`F`/`J` or Left Click to strike, `Shift`/`K` or Right Click to dash, `E`/`Q`/`L` for special skills, `C`/`R` for auto-attack, `Escape` to abandon match).
- **Quick How-To-Play Modal**: Desktop users are greeted with a quick controls modal on their first match, and can reopen it anytime during combat via the `⌨️ HELP` button in the top HUD.
- **Abandon / Exit Match**: Players can exit back to the lobby at any time using the `🚪 EXIT` button or pressing `Escape`.

---

### 3. 🌐 Up to 4-Player Peer-to-Peer Co-op Multiplayer
- **Serverless WebRTC (PeerJS)**: Zero dedicated game server required! Runs entirely free on GitHub Pages and static web hosts.
- **Host Launch & Guest Ready System**: Only the room host can launch the squad battle. Connected guests click `🔴 CLICK TO READY UP`. The launch button is disabled until all connected squadmates are ready, ensuring everyone simultaneously enters the arena!
- **AI Bot Compensation & Squad Poll Vote**:
  - If a player disconnects or exits during battle, an autonomous AI Bot immediately assumes command of their hero to keep fighting, attacking enemies, casting skills, and helping revive teammates.
  - A 15-second Squad Poll Vote (`🛑 End Match` vs `⚔️ Continue With AI`) triggers across remaining players. If ≥ 50% vote to end, the squad safely returns to the lobby; otherwise, the match continues with the AI bot.
- **Pure Numeric Room Codes**: Generates clean numeric codes with no digit limit (e.g. `#108562`), with direct invite URL support (`?room=108562`).
- **Synchronized Hit & Combat Visibility**:
  - All player attack swings, lasers, sparks, rockets, and ultimate vortexes are visible across all screens.
  - Every enemy strike broadcasts an authoritative `ENEMY_HIT` event showing the attacker's username, floating combat text (`CRIT! 84`), white damage flashes, and knockback!
- **Co-op Squad Revives**:
  - Downed teammates can crawl slowly while alive squadmates (or AI bots!) stand within their runic reviving circle to resurrect them with 50% HP.
  - Game Over triggers only when all connected squad members are downed.
- **Required Commander Usernames**:
  - Every player chooses a persistent Commander username displayed prominently in the top-left vitals bar and in 3D floating overhead nameplates.

---

### 4. ⚔️ Single Player Modes
- **🏆 Classic Survival**: 5 waves of escalating enemy counts culminating in the Overlord boss fight.
- **♾️ Endless Horde**: Uncapped scaling waves with recurring boss encounters every 5 rounds, tracking total kills, damage, and waves conquered.

---

## 🕹️ Controls Guide

| Action | Mobile (Touch) | Desktop (Mouse & Keyboard) |
| :--- | :--- | :--- |
| **Move** | Left virtual joystick | `W`, `A`, `S`, `D` or Arrow Keys |
| **Primary Strike / Shoot** | Tap `⚔️ STRIKE` or tap canvas | `Space` or Left Click |
| **Dash / Dodge** | Tap `💨 DASH` button | `H` or `Shift` |
| **Special Skill** | Tap `⚡ NOVA / BARRAGE / VORTEX` | `J` |
| **Ultimate** | Tap `👑 ULT` button | `K` |
| **Recall / Forge** | Tap `🌀 RECALL` button | `L` or `B` |
| **Auto-Attack** | Tap `🎯 AUTO` toggle | `C` or `F` |
| **Controls Help** | N/A (Touch UI) | `⌨️ HELP` in top HUD |
| **Exit Match** | Tap `🚪 EXIT` in top HUD | `🚪 EXIT` or `Escape` key |
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
