# ⚔️ BroadRoads

**A free 5v5 MOBA in your browser.**
Play at **[broadroads.com](https://broadroads.com)**.

Pick a champion, push three lanes, hunt in the jungle, slay the Ember Wyrm and the Abyss Titan, and destroy the enemy Core.
Ranked matchmaking, custom games with friends, and practice against smart bots, on desktop or phone.

The game runs on an authoritative Node.js server with a Three.js client. When no server is reachable, the browser
runs the same simulation locally, so practice vs AI always works offline.

---

## 🎮 Modes

| Mode | Description |
| --- | --- |
| **⚔️ Ranked 5v5** | Elo matchmaking. Parties of up to five queue together and are kept on one team. If the queue is quiet, bots fill empty seats after a short wait (those games are unranked). |
| **🤖 Practice vs AI** | You and your party against bots, starting instantly. Easy / Normal / Hard difficulty. Works offline too. |
| **🏟️ Custom Game** | Create a room and share the 6-digit code. Pick teams, add bots per slot, choose bot difficulty, and start. |

Every match goes **Champion Select** (40 s, no duplicate champions per team, pick a second battle spell)
→ **Match** → **Results** (KDA, CS, gold, damage, MVP, rating change, profile XP).
If you disconnect or leave, a bot takes over your champion, and you can **reconnect** from the lobby.

## 🗺️ The Valley

- **Three lanes** (top, mid, bot), each with outer, inner and spire towers, plus a **Spire**. The **Core** is guarded by two Core towers.
  Structures must fall in order, abilities don't damage structures, and structures take reduced damage without a minion escort.
- **Minion waves** every 28 s (melee, caster, siege every third wave). Destroying a spire spawns **juggernaut minions** in that lane until it respawns.
- **Jungle**: Mossback Golem (**Sage's Insight**: haste and mana regen), Ironhide Brute (**Searing Brand**: burning, slowing attacks),
  Howlers, Duskwings, Bogtoad and Stonehulks. Champions carrying Hunter's Strike deal bonus damage to monsters.
- **Ember Wyrm** in the bottom river: each kill gives the team a permanent +6% damage, stacking.
  **Abyss Titan** in the top river: +30 attack and +50 ability power to living team members, faster return home, and empowered nearby minions.
- **Fog of war** (server-side, so it can't be map-hacked), **bushes** that hide units, and **wards** (T).
- **Fountain**: heals and lets you shop. It shoots enemies who come too close.

## 🧙 Champions

| Champion | Role | Abilities |
| --- | --- | --- |
| 🪨 **Garrok**, the Mountain Heart | Tank | Boulder Toss · Storm Fists · Quake Stomp · Avalanche Charge |
| ✨ **Lyra**, the Dawnweaver | Mage | Sunlit Chains · Aegis of Dawn · Solar Well · Daybreak Lance |
| 🗡️ **Kaelen**, the Veiled Knife | Assassin | Whirling Star · Veil Step · Night Cleave · Final Verdict |
| 🏹 **Hale**, the Winter Huntress | Marksman | Hunter's Rhythm · Hailstorm · Glide · Glacier Spear |
| 🪓 **Thorne**, the Iron Warlord | Fighter | Reaping Arc · Hamstring · Chain Hook · Executioner's Leap |
| 🌙 **Mira**, the Moonsinger | Support | Falling Star · Moonlit Blessing · Silent Eclipse · Lunar Hymn |
| 🔥 **Zarak**, the Cinder Prodigy | Mage | Firebolt · Flame Fan · Ember Ward · Meteor Fall |
| 🎯 **Nyra**, the Desert Marshal | Marksman | Longshot · Snare Trap · Bola Shot · Dead Eye |
| 🐂 **Brakka**, the Stampede | Tank / Support | Earthbreaker · Horn Charge · War Bellow · Iron Hide |
| 🌪️ **Rook**, the Storm Blade | Fighter | Cyclone · Axe Hurl · Skyfall Strike · Tempest Wrath |

Each champion also has a passive. Levels go 1–18 with one ability point per level; the ultimate unlocks at 6, 11 and 16.
Stats include attack, ability power, armor, magic resist, attack speed, crit, haste, lifesteal, armor and magic
penetration, and tenacity. Damage is physical, magic or true.

**Items**: 35 original items with a recipe system (owned components are discounted), boot upgrades, potions and
item passives (Spiked Plate, Emberplate Aegis, Frostbound Orb, Archmage's Crown, Starforged Edge, Grove Charm and more).

**Battle spells**: Blink, plus Mend, Scorch, Hunter's Strike, Haste or Bulwark.

## 🕹️ Controls

| Action | Desktop | Phone |
| --- | --- | --- |
| Move / attack | Right-click (hold to keep moving); right-click an enemy to attack | Joystick + ⚔️ button (auto-targets) |
| Attack-move / stop | A / S | — |
| Abilities | Q W E R cast at the cursor; Ctrl+Q/W/E/R or **+** to level up | Q W E R buttons (auto-aim) |
| Battle spells | D / F | D / F buttons |
| Items · ward · return home · shop | 1–6 · T · B · P | Bar buttons |
| Camera | Space (center), Y (lock/unlock, edge-pan), wheel (zoom), click the minimap | Locked follow |
| Scoreboard · ping · chat | Tab · Alt+click · Enter (team), `/all` (all chat), `/ff` (surrender after 10:00) | — |

## 🔊 Audio

All 135 sounds were generated with the [ElevenLabs](https://elevenlabs.io) API and are committed to `public/sfx/`:

- **UI sounds:** clicks, hovers, panels, shop, match found, lock-in.
- **Movement:** footsteps, dashes, blinks, returning home.
- **Combat:** attacks per champion style, hits, crits, deaths, towers and structures.
- **Abilities:** all 40 champion abilities and the battle spells.
- **Monsters:** roars for the Ember Wyrm and the Abyss Titan.
- **Other:** pings, victory and defeat stingers, lobby music, valley ambience.
- **Announcer:** a full voice pack ("Welcome to the Valley", "First strike!", "Triple takedown!", "Enemy spire destroyed", "Victory!" and more), resolved from your team's point of view.

To regenerate or add sounds, edit the lists in `scripts/generate-audio.mjs` and run:

```bash
ELEVENLABS_API_KEY=your_key node scripts/generate-audio.mjs          # only missing files
ELEVENLABS_API_KEY=your_key node scripts/generate-audio.mjs --force ui_click   # regenerate one
```

The client (`client/audio/sfx.js`):

- lazy-loads sounds and plays combat audio positionally (volume and stereo pan by distance from your champion);
- queues announcer lines by priority;
- crossfades music and ambience;
- has master and music volume controls in Settings.

## 🧍 3D champion models (Tripo3D)

`scripts/generate-champions.mjs` creates rigged, animated champions with the [Tripo3D](https://developers.tripo3d.ai) v3 API.
For each champion it runs text-to-model, rig-check and rig (biped), then one retarget per clip: idle, run, attack, cast and death.
That costs about 95 credits per champion. The script saves its progress, so reruns resume without paying twice.
`scripts/build-models.mjs` then merges the clips into one ~1 MB GLB per champion in `public/models/`, with WebP textures and meshopt compression.
In game, champions without a model keep their procedural look.

```bash
TRIPO_API_KEY=your_key node scripts/generate-champions.mjs --dry-run   # show balance and cost
TRIPO_API_KEY=your_key node scripts/generate-champions.mjs garrok      # one champion
node scripts/build-models.mjs                                         # merge + compress into public/models
```

API credits are bought in the Tripo platform console. They are separate from Tripo Studio subscriptions.

## 🤖 Bots

Bots play with the same commands a player has. They:

- level abilities, shop their champion's build and last-hit in lane;
- respect tower aggro, retreat and return home when low, and trade or all-in based on the odds;
- hunt jungle camps, rally for the Ember Wyrm and Abyss Titan, defend the base, and group up later in the game.

---

## 🚀 Running locally

Requires **Node.js 20+**.

```bash
npm install
npm run dev          # game server on :8080 + Vite client on http://localhost:5173
# or production-style:
npm run build && npm start     # http://localhost:8080
```

### Tests

```bash
npm test                                         # simulation, lobby and server tests
npx playwright install chromium && npm run build && npm run test:e2e   # real-browser end-to-end test
```

## 🌐 Deployment (broadroads.com)

The game needs a long-running server for WebSockets, so it runs on a VPS. Any 1 vCPU / 1 GB machine can host
several simultaneous matches.

**Docker + Caddy (automatic HTTPS):**
```bash
git clone https://github.com/canoguzhan/broadroads.git && cd broadroads
cp .env.example .env        # set TOKEN_SECRET and DATABASE_URL
docker compose up -d --build
```

**Without Docker:** `deploy/broadroads.service` (systemd) plus `deploy/Caddyfile` or `deploy/nginx.conf`.

Point the DNS A records of `broadroads.com` and `www` at the server. With `DATABASE_URL` set (any Postgres),
profiles are stored in `br_accounts` / `br_characters`. Without it, a JSON file in `DATA_DIR` is used.

## 🏗️ Architecture

```
shared/                 runs on the server AND in the browser (offline mode)
  hub.js                lobby: sessions, parties, ranked queue, custom rooms, champion select,
                        matches, reconnect, results/Elo, chat, leaderboards
  moba/match.js         authoritative 20 Hz match simulation
  moba/champions.js     10 champions (passives + Q/W/E/R)
  moba/items.js         items, recipes, battle spells
  moba/bot.js           hero AI
  moba/map.js           the Valley (mirrored 3-lane map)
  moba/pathfind.js      A* + path smoothing
server/                 HTTP + WebSocket gateway, scrypt auth, HMAC tokens, rate limits, storage
client/                 Three.js renderer, controls, HUD, minimap, shop, lobby, champion select
```

All champions, abilities, items, spells, monsters, structures, the map and the art are original to BroadRoads.
