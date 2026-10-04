# ⚔️ BroadRoads

**A free 5v5 MOBA in your browser**, inspired by League of Legends, Mobile Legends: Bang Bang and Dota.
Play at **[broadroads.com](https://broadroads.com)**.

Pick a champion, push three lanes, farm the jungle, slay the Drake and the Void Lord, and destroy the enemy Nexus.
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

Every match goes **Champion Select** (40 s, no duplicate champions per team, pick a second summoner spell)
→ **Match** → **Results** (KDA, CS, gold, damage, MVP, rating change, profile XP).
If you disconnect or leave, a bot takes over your champion, and you can **reconnect** from the lobby.

## 🗺️ The Rift

- **Three lanes** (top, mid, bot), each with outer, inner and inhibitor towers, plus an inhibitor. The Nexus is guarded by two Nexus towers.
  Structures must fall in order, abilities don't damage structures, and structures take reduced damage without a minion escort.
- **Minion waves** every 28 s (melee, caster, siege every third wave). Destroying an inhibitor spawns **super minions** in that lane until it respawns.
- **Jungle**: Ancient Golem (**blue buff**: ability haste and mana regen), Crimson Brute (**red buff**: burning, slowing attacks), wolves, raptors, Gromp and krugs.
  Smite carriers deal bonus damage to monsters.
- **Elder Drake** in the bot river: each kill gives the team a permanent +6% damage, stacking.
  **Void Lord** in the top river: +30 AD and +50 AP to living team members, faster recall, and empowered nearby minions.
- **Fog of war** (server-side, so it can't be map-hacked), **bushes** that hide units, and **wards** (T).
- **Fountain**: heals and lets you shop. It shoots enemies who come too close.

## 🧙 Champions

| Champion | Role | Kit highlights |
| --- | --- | --- |
| 🪨 **Garrok** | Tank | Seismic Shard slow-steal, armor-scaling slam, Unstoppable Force knock-up charge |
| ✨ **Lyra** | Mage | Light Binding root, team shields, slowing Lucent Singularity, map-wide Final Spark |
| 🗡️ **Kaelen** | Assassin | Piercing shuriken, shadow dash, Death Mark execute based on missing health |
| 🏹 **Vex** | Marksman | Frost-slow attacks, Volley, Tumble, map-crossing stun arrow |
| 🪓 **Thorne** | Fighter | Bleed stacks, healing Decimate, Apprehend pull, true-damage Guillotine that resets on kills |
| 🌙 **Mira** | Support | Starcall, ally heals, silencing Equinox, global Wish heal |
| 🔥 **Zarak** | Mage | Pyromania stun every 4th spell, fireball, flame cone, Infernus field |
| 🎯 **Nyra** | Marksman | Longest range, headshots, Yordle traps, Calibrum net, Ace in the Hole snipe |
| 🐂 **Brakka** | Tank / Support | Pulverize knock-up, Headbutt, team-heal roar, Unbreakable damage reduction |
| 🌪️ **Rook** | Fighter | Whirlwind, Cleaving Throw, Leap Strike, missing-health Soul Wrath |

Levels go 1–18 with one ability point per level; R unlocks at 6, 11 and 16.
Stats include AD, AP, armor, MR, attack speed, crit, ability haste, lifesteal, armor and magic penetration, and tenacity.
Damage is physical, magic or true, with LoL-style resistances.

**Items**: 35 items with a recipe system (owned components are discounted), boots tiers, potions and item passives
(Thornmail, Sunfire burn, Rylai slow, Deathcap AP amp, Infinity crit, Spirit Visage heal amp).
**Summoner spells**: Flash, plus Heal, Ignite, Smite, Ghost or Barrier.

## 🕹️ Controls

| Action | Desktop (LoL-style) | Phone (MLBB-style) |
| --- | --- | --- |
| Move / attack | Right-click (hold to keep moving); right-click an enemy to attack | Joystick + ⚔️ button (auto-targets) |
| Attack-move / stop | A / S | — |
| Abilities | Q W E R quick-cast at cursor; Ctrl+Q/W/E/R or **+** to level up | Q W E R buttons (auto-aim) |
| Summoners | D / F | D / F buttons |
| Items · ward · recall · shop | 1–6 · T · B · P | Bar buttons |
| Camera | Space (center), Y (lock/unlock, edge-pan), wheel (zoom), click the minimap | Locked follow |
| Scoreboard · ping · chat | Tab · Alt+click · Enter (team), `/all` (all chat), `/ff` (surrender after 10:00) | — |

## 🤖 Bots

Bots play the same game with the same commands a player has. They:

- level abilities, shop their champion's build and last-hit in lane;
- respect tower aggro, retreat and recall when low, and trade or all-in based on the odds;
- jungle with smite, rally for Drake and Void Lord, defend the base, and group up late in the game.

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

The end-to-end test drives two browsers through the full flow:

- registering, lobby chat, a party invite, every lobby tab, and a custom room joined by code;
- champion select;
- in the match: team chat, the shop, ability level-up, movement, the scoreboard, and leaving and rejoining;
- offline practice.

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

Point the DNS A records of `broadroads.com` and `www` at the server. With `DATABASE_URL` set (Neon or any Postgres),
profiles are stored in `br_accounts` / `br_characters`. Accounts from the original site's `broadroads_users` table are
imported on first login. Without it, a JSON file in `DATA_DIR` is used.

Configuration lives in [`.env.example`](.env.example).

## 🏗️ Architecture

```
shared/                 runs on the server AND in the browser (offline mode)
  hub.js                lobby: sessions, parties, ranked queue, custom rooms, champion select,
                        matches, reconnect, results/Elo, chat, leaderboards
  moba/match.js         authoritative 20 Hz match: structures, minions, jungle, epics, heroes,
                        orders, auto-attacks, abilities, CC, damage, gold/XP, shop, summoners,
                        recall, vision & bushes, announcements, per-team snapshots
  moba/champions.js     10 champions (passives + Q/W/E/R)
  moba/items.js         items, recipes, summoner spells
  moba/bot.js           hero AI
  moba/map.js           the Rift (mirrored 3-lane map)
  moba/pathfind.js      A* + path smoothing
server/                 HTTP + WebSocket gateway, scrypt auth, HMAC tokens, rate limits,
                        JSON-file or PostgreSQL storage, graceful shutdown
client/                 Three.js renderer (chunk-culled terrain, procedural models, fog of war, FX),
                        LoL/MLBB controls, HUD, minimap, shop, lobby, champion select
```

The server is authoritative for everything. Clients send orders (move, attack, cast at a point) and receive only
what their team can see.
