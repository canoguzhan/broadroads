# BROADROADS: Isometric Gear Refinery Arena ⚡

> **A bite-sized, single-screen 3D action game utilizing Three.js, optimized for mobile touch controls.**
> Survive intense waves of void horrors, harvest raw elemental minerals, and strike the runic anvil to forge upgraded armor, blades, and greaves in 3-minute combat loops.

---

## 🌟 Key Features

- **Isometric 3D Combat Arena**: Built with Three.js featuring dynamic lighting, soft shadows, particle bursts, screen shake, and floating combat text.
- **Mobile-First Touch Architecture**:
  - Virtual floating thumbstick for fluid 360° isometric movement.
  - Action buttons cluster: **STRIKE** (3-hit combo & whirlwind), **DASH** (with i-frames and speed burst), **NOVA** (screen-clearing runic burst), and **AUTO** (one-thumb auto-attack toggle).
- **The Runic Gear Refinery**:
  - Between waves, tap or drag raw mineral drops into the crucible slots.
  - Interactive recipe synthesis: Combine minerals (Flame Pyrite, Aether Shard, Titanium Ingot, Void Catalyst) into tiered equipment upgrades.
  - Real-time 3D hero model evolution: Weapons and effects dynamically transform upon forging.
  - One-tap **AUTO-FORGE** button for rapid 10-second mobile crafting between rounds.
- **5 Progressive Waves & Boss Battle**:
  - Wave 1: Void Crawlers (nimble swarmers).
  - Wave 2: Runic Brutes (armored behemoths).
  - Wave 3: Astral Sparkcasters (ranged plasma snipers).
  - Wave 4: Mixed elite vanguard.
  - Wave 5: **IGNIS REX - ANVIL OVERLORD** (massive boss with ground slams and phase bars).
- **Synthesized Audio Engine**:
  - 100% self-contained Web Audio API synthesizer. Zero external sound files or CDN audio latency.
  - Sword whooshes, hit crunches, crystal pickups, metallic anvil strikes, and fanfare chords.

---

## 🕹️ Controls

### Mobile (Touch)
- **Move**: Left thumb virtual joystick.
- **Strike**: Tap `⚔️ STRIKE` for 3-hit melee slash combo.
- **Dash**: Tap `💨 DASH` for dodge roll with invulnerability frames.
- **Runic Nova**: Tap `⚡ NOVA` when fully charged by combat hits.
- **Auto-Aim**: Tap `🎯 AUTO` to auto-target nearby threats.
- **Refinery**: Tap material cards to insert into the crucible, or hit `⚡ AUTO-FORGE`.

### Desktop (Keyboard & Mouse)
- **Move**: `W`, `A`, `S`, `D` or Arrow Keys.
- **Strike**: `Spacebar`, `F`, or Left Click.
- **Dash**: `Shift` or Right Click.
- **Nova Skill**: `E` or `Q`.

---

## 🔨 Refinery Crafting Recipes

| Combination | Crafted Gear | Stat Upgrades |
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

### Run Locally
```bash
npm install
npm run dev
```

### Production Build
```bash
npm run build
npm run preview
```

Deployable directly to **Vercel**, **Netlify**, or **GitHub Pages**.
