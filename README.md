# BROADROADS: Isometric Gear Refinery Arena ⚡

> **A bite-sized, single-screen 3D action game utilizing Three.js, optimized for mobile touch controls.**
> Survive waves of void horrors, harvest raw elemental minerals, and strike the runic anvil to forge upgraded armor, blades, and greaves in 3-minute combat loops.
> **Now supporting Single Player (Classic & Endless) and Serverless Online Co-op Multiplayer (WebRTC P2P)!**

---

## 🌟 Game Modes & Features

### 1. Game Modes
- ⚔️ **Single Player**:
  - **🏆 Classic Survival**: Survive 5 escalating waves culminating in the giant Forge Overlord boss showdown.
  - **♾️ Endless Horde**: Infinite scaling waves, recurring boss encounters every 5 rounds, and record-tracking for highest wave survived.
- 🌐 **Online Co-op Multiplayer (Peer-to-Peer WebRTC)**:
  - **Serverless P2P (PeerJS)**: Zero backend server needed. Runs free on static hosts (Vercel, GitHub Pages).
  - **4-Letter Room Codes**: Quick shareable code (e.g. `BR-7K9W`) or direct invite link (`?room=XXXX`).
  - **Real-Time Synchronization**: 25Hz low-latency player positions, rotations, attacks, animations, and shared enemy waves.
  - **Co-op Revive System**: When a teammate falls to 0 HP, they enter a downed state. Standing in their runic circle for 3 seconds channels celestial energy to revive them with 50% HP!

---

### 2. Hero Classes & Playstyles
Choose your hero class before entering the arena:
- 🛡️ **Runic Paladin**:
  - **Weapon**: Heavy Greatblade & Aegis Shield.
  - **Basic Attack**: 3-hit melee combo with sweeping energy crescent waves and a 360° whirlwind finisher.
  - **Special Skill**: `⚡ Cataclysm Nova` — radial ground slam shockwave that decimates surrounding hordes.
  - **Passive**: +25% Max HP & auto-recharging shield.
- 🏹 **Cyber Gunner**:
  - **Weapon**: Dual Plasma Blasters.
  - **Basic Attack**: Twin high-velocity piercing plasma bolts with long range.
  - **Special Skill**: `🚀 Orbital Barrage` — calls down 8 homing plasma missiles raining from orbit.
  - **Passive**: +30% Movement Speed & agile kiting.
- 🔮 **Void Arcanist**:
  - **Weapon**: Floating Cosmic Runic Orb.
  - **Basic Attack**: Volatile astral sparks that arc chain-lightning to secondary targets.
  - **Special Skill**: `🌌 Singularity Vortex` — summons a swirling gravitational black hole that pulls all enemies to its center, shredding them with crushing vortex damage.
  - **Passive**: +28% Critical Strike Chance & faster special meter charging.

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
