# ⚔️ BroadRoads

**An online action RPG in your browser — shared MMO world, solo & party dungeons, and ranked PvP arenas.**
Play at **[broadroads.com](https://broadroads.com)**.

BroadRoads runs on an authoritative Node.js game server with a Three.js client. Every mode — the open world,
dungeons and the arena — runs on the same simulation, so every ability, item and rule behaves identically
everywhere. When no server is reachable the browser runs that same simulation locally, so the game is always
playable offline.

---

## 🎮 Game modes

| Mode | What it is |
| --- | --- |
| **🌍 MMO World** | A shared overworld ("The Broadroads") with a safe town at its centre. Up to 60 players per shard; new shards open automatically and parties are kept together. Monster camps get stronger the farther you travel from town (Whisperwind Meadows → Ashen Barrows → Voidscar Wastes). The **Broadroad Behemoth** world boss awakens in the south-east every 15 minutes and is announced server-wide. |
| **🗡️ Solo Dungeon** | Endless procedurally generated floors, scaled for one player. A **guardian boss** waits every 5 floors (Bone Colossus, Void Overlord, Lich Queen) and seals the stairs until defeated. Defeated guardians unlock checkpoints (floors 6, 11, 16…). Falling ends the run. |
| **👥 Party Dungeon** | The same dungeons for parties of up to 4. Monsters scale with party size, loot is personal, and downed allies are revived by standing next to them (3 s). |
| **⚔️ PvP Arena** | **Duel 1v1** (best of three), **Team Battle 3v3** (first to 15 kills) and **Free-for-All** (first to 10). Elo-rated matchmaking with a widening rating window; parties queue together for team battles. Quiet queues fill with AI bots (unranked). **Practice vs Bots** starts instantly, and **/duel name** challenges anyone online. If a player disconnects mid-match, the AI takes over their hero. |

## 🧙 Heroes

Three archetypes, each with five abilities. Names follow the **monthly season** (e.g. October's *Crypt Reaper*,
*Grave Marksman* and *Necro Caster*) — 36 seasonal classes in all. You can retrain at the class trainer at any time
without losing your level or gear.

| | Paladin (Tank / Melee) | Gunner (Ranged) | Arcanist (Caster / Support) |
| --- | --- | --- | --- |
| **LMB** | Cleave (arc) | Bolt | Arc Spark (chains) |
| **Space** | Charge | Roll | Blink |
| **Q** | Shield Bash (stun) | Piercing Lance | Frost Nova (slow) |
| **E** | Bulwark (−50% damage, taunt) | Scatter Volley | Mending Light (group heal) |
| **R** | Seasonal ultimate (shockwave) | Orbital Barrage | Singularity (vortex) |

Levels go up to 50. Gear comes in five rarities (Common → Legendary) with random affixes: attack, armor,
health, mana, crit, speed, cooldown reduction, lifesteal and regen.

## 🏘️ Town

| NPC | Service |
| --- | --- |
| 💰 Mira the Merchant | Potions, rotating gear stock, sell loot |
| ⚒️ Dorran Ironhand | **Gear Refinery** — combine two materials (Pyrite, Aether, Titanium, Catalyst) into Rare–Legendary gear. The 10 recipes carry over from the original game. |
| 🌀 Seer Ilya | Dungeon gate (solo or party, checkpoint floors) |
| ⚔️ Warden Kael | Arena queues, practice matches and ratings |
| 📜 Master Oren | Class trainer |
| 🏆 Hall of Legends | Leaderboards: level, deepest floor, duel, team and FFA ratings, monster kills |

## 🕹️ Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Move | WASD / arrows | Left joystick |
| Aim | Mouse | Auto-aim at the nearest enemy |
| Attack | Left click (hold) | ⚔️ |
| Dash | Space / Shift / Right click | 💨 |
| Abilities | Q · E · R | Q · E · R |
| Potions | 1 · 2 | Action bar |
| Interact | F, or click an NPC, portal or chest | ✋ |
| Panels | I inventory · C character · P social · L leaderboard · M map · H help · Tab scoreboard · Esc settings | Menu buttons |
| Chat | Enter (`/help`: `/w name`, `/p`, `/world`, `/invite`, `/leave`, `/kick`, `/duel`, `/who`) | Chat box |

---

## 🚀 Running locally

Requires **Node.js 20+**.

```bash
npm install
npm run dev          # game server on :8080 + Vite client on http://localhost:5173
```

Production-style:

```bash
npm run build        # builds the client into dist/
npm start            # serves dist/ + API + WebSocket on http://localhost:8080
```

### Tests

```bash
npm test                                     # 46 unit + integration tests (simulation, every mode, server, auth)
npx playwright install chromium && npm run build && npm run test:e2e   # real-browser end-to-end test
```

The end-to-end test drives two browsers through registering, meeting in town, UI chat, a party invite, a party
dungeon, the arena, every panel and matchmaking, then plays offline mode with save persistence. Screenshots are
written to `e2e-screenshots/`.

## 🌐 Deploying to broadroads.com

The game needs a long-running server for WebSockets, so the backend cannot run on Vercel serverless.
Any small VPS works: 1 vCPU and 1 GB RAM comfortably hosts a few hundred players.

### Option A — Docker + Caddy (recommended)

1. Point the DNS **A records** for `broadroads.com` and `www.broadroads.com` at your server's IP.
   Today they point at Vercel.
2. On the server:
   ```bash
   git clone https://github.com/canoguzhan/broadroads.git && cd broadroads
   cp .env.example .env        # set TOKEN_SECRET (and DATABASE_URL if you use Postgres)
   docker compose up -d --build
   ```
Caddy fetches and renews HTTPS certificates automatically and proxies HTTP and WebSocket traffic to the game.
Saves live in the `game-data` volume, or in Postgres when `DATABASE_URL` is set.

### Option B — Keep the site on Vercel, game server elsewhere

The repo still deploys to Vercel as a static site (`vercel.json`). Without a game server it falls back to offline
mode automatically. To enable online play:

1. Run the server (Option A, or `deploy/broadroads.service` + `deploy/nginx.conf`) at e.g. `play.broadroads.com`.
2. In Vercel, set the env var `VITE_SERVER_URL=https://play.broadroads.com` and redeploy.
3. Keep `https://broadroads.com` in the server's `ALLOWED_ORIGINS` (it is in the default list).

### Configuration

See [`.env.example`](.env.example): `PORT`, `TOKEN_SECRET`, `DATA_DIR`, `DATABASE_URL`, `ALLOWED_ORIGINS`,
`WORLD_BOSS_INTERVAL`, `WORLD_BOSS_FIRST`, `QUEUE_BOT_WAIT`, `VITE_SERVER_URL`.

**Database:** with `DATABASE_URL` set (Neon, Supabase, RDS, local Postgres) the server creates the `br_accounts` and
`br_characters` tables. Accounts from the previous Vercel API's `broadroads_users` table are imported on first login,
and their passwords are re-hashed with scrypt.

---

## 🏗️ Architecture

```
shared/            Runs on server AND in the browser (offline mode)
  hub.js           Sessions, instance routing, inventory/shop/crafting, chat, parties,
                   dungeon entry, arena matchmaking (Elo), duels, persistence, leaderboards
  sim/instance.js  Authoritative 20 Hz simulation: movement, combat, projectiles, AoE, buffs,
                   loot, rewards, revives, per-viewer snapshots with interest management
  sim/world.js     MMO shard: safe town, NPCs, respawning camps, world boss
  sim/dungeonInstance.js  Solo/party dungeon runs, floors, guardians, chests, wipes
  sim/arena.js     Duel / 3v3 / FFA rules, bots, Elo, AI takeover on disconnect
  sim/ai.js        Monster & boss AI (flow-field pathing, telegraphed attacks, boss patterns)
  sim/bot.js       Player-like AI for arena bots and disconnected heroes
  sim/abilities.js All 15 abilities + potions
  dungeon.js · worldmap.js · items.js · classes.js · monsters.js · tiles.js · themes.js
server/            Node HTTP + WebSocket gateway, scrypt auth, HMAC tokens, rate limits,
                   JSON-file or PostgreSQL storage, graceful shutdown (saves everyone)
client/            Three.js renderer (instanced, chunk-culled terrain; procedural models; FX),
                   client-side prediction with server reconciliation, HUD, panels, chat,
                   touch controls, offline transport, synthesized audio
```

The server is authoritative for movement, damage, loot and economy. Clients only send inputs (movement vector,
aim, ability casts), so speed hacks and fake damage are not possible. Input floods, chat spam and auth brute-forcing
are rate-limited, and all player text is rendered as plain text.
