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
| **🎓 Tutorial** | A guided first match: move, shop, learn and cast abilities, last-hit, push a tower and return home. Enemy champions stay home; the lobby highlights it for new players. |
| **⚡ Skirmish 3v3** | One lane, level 3 start, faster gold and waves, sudden death after 10:00. About 10 minutes; parties of up to 3. |
| **🥊 Brawl 5v5** | Featured mode: five against five on one lane with random champions (no duplicates per team), level 3 start, fighting from the first second. Bring your whole party. |
| **🏟️ Custom Game** | Create a room and share the 6-digit code. Pick teams, add bots per slot, choose bot difficulty, and start. |

Every match goes **Champion Select** (40 s, no duplicate champions per team, pick a second battle spell and a keystone)
→ **Match** → **Results** (KDA, CS, gold, damage, MVP, rating change, profile XP).
If you disconnect or leave, a bot takes over your champion, and you can **reconnect** from the lobby.

**Parties** move together: when the leader creates or joins a custom room, everyone in the party is brought into it automatically (on the same team when there is room).

**Ranked extras:** a ban phase before picks (each team votes; the most-voted champion is banned), **placements** (the first 5 games of a season move your rating twice as fast), and escalating queue lockouts (5 / 15 / 30 minutes) for dodging champion select, abandoning a ranked game or going AFK.

**Behavior:** players idle for 90 s get a warning and the AI takes over at 120 s. Chat is filtered (English, Turkish, Spanish), any player can be muted on your device, and reports (with reason and match) appear on the admin page.

## 🏅 Progression

- **Ranked tiers and seasons:** Bronze → Silver → Gold → Platinum → Diamond → Master → Champion (four divisions each). Seasons follow calendar quarters; at the end your rating is soft-reset halfway to 1000 and you earn shards for your peak tier (5+ ranked games).
- **Login streak** (7-day shard cycle) and **first win of the day** (+100 shards, +200 XP).
- **Friends:** requests (also to offline players), online status, one-click party invites, and watching a friend's match.
- **Daily quests:** three a day per player, for example "Win a game", "Last-hit 120 minions" or "Deal 15,000 damage to champions". Progress counts in every mode except the tutorial; claim each one for **shards** 💠.
- **Shards** also come from every game (+10, +25 more for a win) and every account level (+150). Spend them on skins.
- **Skins:** four colour variants per champion (Crimson, Frost, Shadow, Gilded). Preview them on the 3D model in the Champions tab and equip them per champion; everyone in the match sees them.
- **Profile pictures:** portraits rendered from the 3D models. Champions unlock by playing them; creatures (wolf, toad, Duskwing, Ember Wyrm, Abyss Titan and more) unlock by account level.
- **After you die**, a death recap shows the last 15 seconds of damage by source (champion abilities and attacks, towers, minions, monsters), split into physical, magic and true damage.

## 👀 Spectating and replays

- **Highlights:** multi-kills, team wipes, shutdowns and epic monster kills are marked on the replay's seek bar. The results screen offers **Watch replay** and **Share** (a link that opens the replay just before the best moment, no login needed, with its own link preview). Replays can be exported as a 12-second WebM clip.

- **Watch live:** the lobby lists running matches; spectators get full vision, a free camera (edge pan, minimap) and can follow any champion.
- **Replays:** every finished match (except tutorials) is recorded as a full-vision 10 Hz snapshot stream and kept on the server (the last 50, gzipped in `data/replays`, served at `/replays/<id>.ndjson`). Offline matches keep their last five replays in memory. Playback has pause, 0.5–8× speed and seeking.

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
| 🌊 **Thessa**, the Tidecaller | Mage | Tidal Lance · Riptide · Pearl Bubble · Tsunami |
| 🌳 **Borrin**, the Thornwarden | Tank | Bramble Lash · Barkskin · Briar Patch · Overgrowth |

Each champion also has a passive. Levels go 1–18 with one ability point per level; the ultimate unlocks at 6, 11 and 16.
Stats include attack, ability power, armor, magic resist, attack speed, crit, haste, lifesteal, armor and magic
penetration, and tenacity. Damage is physical, magic or true.

**Items**: 36 original items with a recipe system (owned components are discounted), boot upgrades, potions and
item passives (Spiked Plate, Emberplate Aegis, Frostbound Orb, Archmage's Crown, Starforged Edge, Grove Charm and more).

**Battle spells**: Blink, plus Mend, Scorch, Hunter's Strike, Haste or Bulwark.

**Keystones** (one per match, remembered per player): **Warpath** (stacking damage against champions), **Starfall** (abilities call down a star), **Ironroot** (bonus health and a low-health shield), **Swiftwind** (movement speed, more out of combat).

## 👤 Accounts, languages and the app

- **Password reset by email** and **Google / Discord sign-in** (also linkable from the Account card). Each switches on when configured: `SMTP_URL` + `MAIL_FROM`; `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`; `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET`. OAuth redirect URI: `https://broadroads.com/api/auth/oauth/<google|discord>/callback`. Without SMTP, reset links go to the server log.
- **Languages:** English, Türkçe and Español (picked from the browser, changeable from the landing page, lobby and settings), including the announcer voice. Strings live in `client/i18n/`; text is written in English and translated as it renders, so missing entries simply stay English (`?i18n-collect` lists them via `__i18nMisses()`).
- **Notifications** while the tab is in the background: match found, invites, friend requests, friends online, whispers.
- **Installable app:** web manifest, service worker (hashed assets and models cached on the device, offline shell) and an Install button. Phones and Low quality load simplified models (`*.lo.glb`, ~35% of the triangles) first.

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
- **Champion voices:** each champion has their own ElevenLabs voice with lines for lock-in, ultimate, kills and death.
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

## 🧍 3D models (Tripo3D)

Every unit, building and tree is a 3D model generated with the [Tripo3D](https://developers.tripo3d.ai) v3 API.
The 38 assets are listed with their prompts in `scripts/model-catalog.mjs`:

| Group | Assets | Animation |
| --- | --- | --- |
| Champions | all 10 | rigged: idle, run, attack, cast, death |
| Minions | melee, caster, juggernaut (one per team) | rigged: walk, attack, death |
| | siege cart (one per team) | static |
| Jungle | Mossback Golem, Ironhide Brute, Stonehulk, Abyss Titan | rigged: idle, walk, attack, death |
| | Howler (wolf), Ember Wyrm, Duskwing (bat), Bogtoad | static with procedural stride, hover or hop |
| Structures | towers, Spires, Cores, fountains (one per team) | static |
| Environment | pine, oak and fir trees, grass bushes | static, instanced across the map |

Portraits for the UI are rendered from the models (`node scripts/render-portraits.mjs`), and the 99 item, spell, ability and interface icons come from Tripo text-to-image, nine per 3×3 sheet, cropped automatically (`TRIPO_API_KEY=… node scripts/generate-icons.mjs`).

Terrain and water are procedural: a painted ground texture baked from the map, and an animated river shader with depth tint, ripples and foam.

```bash
TRIPO_API_KEY=your_key node scripts/generate-models.mjs --dry-run          # balance and cost per asset
TRIPO_API_KEY=your_key node scripts/generate-models.mjs minion tree_oak    # by group or id
node scripts/build-models.mjs                                             # pack into public/models
```

- **Generation** (`generate-models.mjs`): runs text-to-model; for rigged assets, also rig-check, rig, and one retarget per clip. Progress is saved, so reruns resume without paying twice.
- **Packing** (`build-models.mjs`): merges each asset's clips into one GLB and trims long attack combos to a single strike. It also pins root drift and simplifies meshes to their triangle budget, then compresses everything with WebP textures and meshopt.
- **In game:** anything without a model keeps its procedural look. Settings has a "Detailed 3D models" toggle for slow devices. Low quality keeps the cheap cone forest.

API credits are bought in the Tripo platform console. They are separate from Tripo Studio subscriptions.

## 🎬 Trailer (Higgsfield + ElevenLabs)

`scripts/trailer/make-trailer.mjs` builds the ~30 s trailer from the in-game champions:
champion portraits → photoreal 16:9 key frames (Higgsfield, Qwen Image 3 edit) → shots animated with
**Seedance 2.5** image-to-video → champion and narrator lines in each champion's voice (**ElevenLabs v4**),
a timed orchestral score (ElevenLabs Music) and sound effects → an ffmpeg cut with a title card.
It writes `public/trailer/broadroads-trailer.mp4` (full, with sound), `bg.mp4` (the muted landing-page loop) and `poster.jpg`;
every step is cached in `trailer-src/`, so re-runs only redo what changed.

```bash
# .env (git-ignored): HF_CREDENTIALS=<key id>:<key secret>  ELEVENLABS_API_KEY=...
FFMPEG=/path/to/ffmpeg node scripts/trailer/make-trailer.mjs        # or --only frames|shots|audio|cut
```
`scripts/higgsfield.mjs` is the shared Higgsfield client (official `@higgsfield/client` SDK plus uploads).

## 😊 Emotes and quick chat

Press **G** (or 😊) for the wheel: Dance, Cheer and Laugh play Tripo-animated emotes on your champion; quick chat sends "Good game!", "On my way!", "Careful!" and more.

## 📱 Phones

Touch controls show ability icons and cooldowns. Tap an ability to auto-target (weakest champion in range first), or drag from it to aim with a range ring and target marker. Level-up badges sit on the ability buttons. If the frame rate stays under 25, the game offers lighter graphics.

## 📡 Networking

- **Snapshots at 10 Hz** (the simulation still runs at 20 Hz). On the ticks in between, only effect events (hits, casts) are sent, so combat feedback stays immediate.
- **Binary snapshots** (`shared/protocol.js`): movement updates are 14–16 bytes each instead of ~35 bytes of JSON. Everything else stays JSON inside the same frame.
- **Self-state deltas:** your gold, cooldowns, items and stats are sent only when they change.
- **Distance throttling:** units far from your champion update every other snapshot.
- **permessage-deflate** WebSocket compression. Slow links skip movement frames instead of queueing them.
- **Result:** about 2.5 KB/s per player 6 minutes into a match, down from 44 KB/s.
- **Client:** other units are drawn ~110 ms in the past, interpolated between server positions. Your own champion moves instantly (prediction) and is reconciled with the server, and cast animations play immediately.
- **Reconnect:** dropped connections (including silent mobile drops, detected after 8 s) reconnect automatically for ~30 s and resume the same match in place.
- **Capacity:** new matches stop at `MAX_MATCHES` (default 20) or when the average tick exceeds 30 ms of its 50 ms budget. New logins stop at `MAX_PLAYERS` (default 400). Running matches, and players returning to them, are never refused. `/api/health` reports `full` and `busy`.

## 🩺 Monitoring

- Browser errors are reported to `/api/client-error` (deduplicated, rate-limited).
- Server errors, and any match whose simulation throws, are logged to `data/logs/errors.ndjson`. A crashing match is closed without taking down the server.
- `/admin` (set `ADMIN_TOKEN`) shows players online, matches, tick time, event-loop lag, memory and recent errors.
- Set `ALERT_WEBHOOK` (Discord/Slack) for crash and error-spike alerts.
- `deploy/broadroads-watchdog.timer` restarts the service if `/api/health` fails three checks in a row.
- The admin page also shows the **player funnel** (new players, tutorial started/finished, first and second game, next-day return), **champion, item and keystone win rates** (14 days) and player reports. Analytics are daily counters only, stored in `data/analytics`; nothing goes to third parties.

## 🤖 Bots

Bots play with the same commands a player has. They focus fire, peel for low teammates, retreat together and save ultimates for groups. They:

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

### Automatic deploys, backups and load tests

- **CI** (`.github/workflows/ci.yml`) runs the unit tests, the build and the browser test on every push.
- **Auto-deploy** (`deploy/broadroads-autodeploy.timer`, every 5 min): pulls `main` once every GitHub check on the new commit has passed, waits for live matches to end (up to 45 min), rebuilds, restarts and checks `/api/health`. If the server doesn't come up it rolls back and skips that commit. No secrets needed. Log: `journalctl -u broadroads-autodeploy`.
- **Backups** (`deploy/broadroads-backup.timer`, nightly 04:15): `scripts/backup.mjs` saves every `br_*` table and the data folder to `/var/backups/broadroads/<date>/`, keeping 14 days. `--restore <dir> --dry-run` checks a backup; `--restore <dir> --yes` restores it.
- **Load test** (`scripts/loadtest.mjs`): synthetic players that each start a match and move around, plus optional real headless browsers. Run it from another machine to include the network:
  ```bash
  node scripts/loadtest.mjs --url https://broadroads.com --clients 30 --duration 120 --browsers 2
  node scripts/loadtest.mjs --local --clients 60      # throwaway server on this machine
  ```
  It reports time to match, snapshot rate and gaps, ping and server tick time, and exits non-zero if play wasn't smooth.

```bash
sudo cp deploy/broadroads-{autodeploy,backup}.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now broadroads-autodeploy.timer broadroads-backup.timer
```

## 🏗️ Architecture

```
shared/                 runs on the server AND in the browser (offline mode)
  hub.js                lobby: sessions, parties, ranked queue, custom rooms, champion select,
                        matches, reconnect, results/Elo, chat, leaderboards
  moba/match.js         authoritative 20 Hz match simulation
  moba/champions.js     12 champions (passives + Q/W/E/R)
  moba/keystones.js     keystones
  moba/items.js         items, recipes, battle spells
  moba/bot.js           hero AI
  moba/map.js           the Valley (mirrored 3-lane map)
  moba/pathfind.js      A* + path smoothing
server/                 HTTP + WebSocket gateway, scrypt auth, HMAC tokens, rate limits, storage
client/                 Three.js renderer, controls, HUD, minimap, shop, lobby, champion select
```

All champions, abilities, items, spells, monsters, structures, the map and the art are original to BroadRoads.
