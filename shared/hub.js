/* Game hub: owns all instances and sessions. Transport-agnostic: the Node
   server wraps it with WebSockets + a database, the browser wraps it with an
   in-memory transport + localStorage for offline play. */
import { TICK, PARTY_MAX, WORLD_SHARD_CAP, CHAT_MAX, INTERACT_RANGE, PROTOCOL_VERSION } from './constants.js';
import { CLASS_IDS, MAX_LEVEL, xpToNext, newCharacter, normalizeCharacter, currentTheme, GEAR_SLOTS, computeStats } from './classes.js';
import { INVENTORY_SIZE, MAX_POTIONS, POTIONS, RECIPES, MATERIALS_PER_SLOT, craftCost, craftItem, recipeKey, shopStock, sellPrice, MATERIAL_IDS } from './items.js';
import { RNG } from './rng.js';
import { dist } from './math.js';
import { WorldInstance, getWorldData } from './sim/world.js';
import { DungeonInstance } from './sim/dungeonInstance.js';
import { ArenaInstance, ARENA_MODES } from './sim/arena.js';
import { tryCast, usePotion } from './sim/abilities.js';
import { BOSS_EVERY } from './dungeon.js';

const SLOTS = ['primary', 'dash', 'q', 'e', 'r'];
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clean = s => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, CHAT_MAX);

export function dungeonCheckpoints(deepest) {
  const out = [1];
  for (let f = BOSS_EVERY + 1; f <= Math.max(1, deepest); f += BOSS_EVERY) out.push(f);
  return out;
}

export class Hub {
  constructor({ store, config = {}, log = console, offline = false } = {}) {
    this.store = store;
    this.log = log;
    this.offline = offline;
    this.config = {
      worldBossInterval: 900,
      worldBossFirst: 240,
      autosave: 30,
      queueBotWait: offline ? 0 : 25,
      ...config,
    };
    this.sessions = new Map();
    this.byName = new Map();
    this.byAccount = new Map();
    this.instances = new Map();
    this.worlds = [];
    this.parties = new Map();
    this.queues = { duel: [], team: [], ffa: [] };
    this.duelRequests = new Map(); // target name -> { from, t }
    this.themeId = currentTheme().id;
    this.time = 0;
    this.nextSession = 1;
    this.nextInstance = 1;
    this.nextParty = 1;
    this.timers = { meta: 0, party: 0, queue: 0, save: 0, cleanup: 0 };
    this.rng = new RNG(Date.now() & 0xffffffff);
    this.interval = null;
    this.stats = { ticks: 0, tickMs: 0 };
  }

  start() {
    if (this.interval) return;
    let last = Date.now();
    let acc = 0;
    this.interval = setInterval(() => {
      const now = Date.now();
      acc += Math.min(250, now - last);
      last = now;
      // Fixed-step simulation, catching up if the timer fires late.
      while (acc >= TICK * 1000) { acc -= TICK * 1000; this.tick(); }
    }, Math.floor(TICK * 1000 / 2));
  }

  stop() {
    clearInterval(this.interval);
    this.interval = null;
  }

  /* ================= sessions ================= */
  async connect({ accountId, name, send, meta = {} }) {
    const existing = this.byAccount.get(accountId);
    if (existing) {
      existing.send({ t: 'kicked', reason: 'Logged in from another location.' });
      await this.disconnect(existing);
      if (existing.close) existing.close();
    }
    const session = {
      id: this.nextSession++,
      accountId,
      name,
      send,
      char: null,
      ent: null,
      instance: null,
      known: new Map(),
      charDirty: false,
      partyId: null,
      invites: new Set(),
      queue: null,
      lastChat: 0,
      chatBudget: 5,
      lastMeta: new Map(),
      connectedAt: Date.now(),
      meta,
    };
    this.sessions.set(session.id, session);
    this.byName.set(name.toLowerCase(), session);
    this.byAccount.set(accountId, session);

    let char = null;
    try { char = await this.store.getCharacter(accountId); } catch (err) { this.log.error('load character failed', err); }
    if (!this.sessions.has(session.id)) return session; // disconnected while loading
    send({ t: 'hello', v: PROTOCOL_VERSION, name, theme: this.themeId, offline: this.offline, classes: CLASS_IDS });
    if (char) {
      session.char = normalizeCharacter({ ...char, name });
      this.enterGame(session);
    } else {
      send({ t: 'needChar' });
    }
    return session;
  }

  enterGame(session) {
    session.send({ t: 'char', char: session.char });
    // Rejoin an existing party if one still lists this player.
    for (const party of this.parties.values()) {
      if (party.members.includes(session.name)) { session.partyId = party.id; break; }
    }
    this.joinWorld(session);
    this.updateParty(session.partyId);
    this.notice(session, `Welcome to BroadRoads, ${session.name}!`, 'good');
  }

  async disconnect(session) {
    if (!this.sessions.has(session.id)) return;
    this.sessions.delete(session.id);
    if (this.byName.get(session.name.toLowerCase()) === session) this.byName.delete(session.name.toLowerCase());
    if (this.byAccount.get(session.accountId) === session) this.byAccount.delete(session.accountId);
    this.leaveQueue(session, true);
    const inst = session.instance;
    if (inst) {
      if (inst instanceof ArenaInstance && inst.phase !== 'end') inst.takeOverBySession(session);
      else inst.removeSession(session);
    }
    if (session.partyId) {
      const party = this.parties.get(session.partyId);
      if (party && !party.members.some(n => this.byName.has(n.toLowerCase()))) this.parties.delete(party.id);
      else this.updateParty(session.partyId);
    }
    await this.saveChar(session);
  }

  async saveChar(session) {
    if (!session.char) return;
    session.char.savedAt = Date.now();
    try {
      await this.store.saveCharacter(session.accountId, session.char);
    } catch (err) {
      this.log.error('save failed', session.name, err);
    }
  }

  saveInstancePlayers(inst) {
    for (const s of inst.sessions) this.saveChar(s);
  }

  /* ================= instances ================= */
  registerInstance(inst) {
    this.instances.set(inst.id, inst);
    return inst;
  }

  pickWorld(session) {
    // Prefer the shard where party members are.
    if (session.partyId) {
      const party = this.parties.get(session.partyId);
      for (const n of party?.members || []) {
        const s = this.byName.get(n.toLowerCase());
        if (s && s !== session && s.instance instanceof WorldInstance && s.instance.sessions.size < WORLD_SHARD_CAP) return s.instance;
      }
    }
    let w = this.worlds.find(x => x.sessions.size < WORLD_SHARD_CAP);
    if (!w) {
      w = this.registerInstance(new WorldInstance(this, { shard: this.worlds.length + 1, themeId: this.themeId }));
      this.worlds.push(w);
    }
    return w;
  }

  joinWorld(session) {
    const w = this.pickWorld(session);
    const sp = getWorldData().spawn;
    w.addSession(session, sp.x + this.rng.range(-2, 2), sp.y + this.rng.range(-1, 1), 'players');
  }

  leaveInstance(session) {
    if (session.instance) session.instance.removeSession(session);
  }

  returnToWorld(session) {
    if (!session || !this.sessions.has(session.id)) return;
    this.leaveInstance(session);
    this.joinWorld(session);
    this.saveChar(session);
  }

  /* ================= tick ================= */
  tick() {
    const t0 = Date.now();
    const dt = TICK;
    this.time += dt;
    for (const inst of this.instances.values()) inst.update(dt);
    for (const inst of this.instances.values()) {
      for (const s of inst.sessions) {
        const snap = inst.snapshotFor(s);
        if (snap) s.send(snap);
      }
      inst.flushFx();
    }
    for (const s of this.sessions.values()) {
      if (s.charDirty && s.char) {
        s.charDirty = false;
        s.send({ t: 'char', char: s.char });
      }
    }
    this.timers.meta -= dt;
    if (this.timers.meta <= 0) { this.timers.meta = 0.25; this.sendMeta(); }
    this.timers.party -= dt;
    if (this.timers.party <= 0) { this.timers.party = 1; for (const id of this.parties.keys()) this.updateParty(id); }
    this.timers.queue -= dt;
    if (this.timers.queue <= 0) { this.timers.queue = 1; this.processQueues(); }
    this.timers.cleanup -= dt;
    if (this.timers.cleanup <= 0) { this.timers.cleanup = 5; this.cleanupInstances(); }
    this.timers.save -= dt;
    if (this.timers.save <= 0) {
      this.timers.save = this.config.autosave;
      for (const s of this.sessions.values()) {
        if (s.char) s.char.stats.playSeconds += this.config.autosave;
        this.saveChar(s);
      }
    }
    this.stats.ticks++;
    this.stats.tickMs = this.stats.tickMs * 0.95 + (Date.now() - t0) * 0.05;
  }

  sendMeta() {
    for (const inst of this.instances.values()) {
      if (!inst.dynamicMeta) continue;
      const meta = inst.dynamicMeta();
      const json = JSON.stringify(meta);
      for (const s of inst.sessions) {
        if (s.lastMeta.get(inst.id) === json) continue;
        s.lastMeta.set(inst.id, json);
        s.send({ t: 'meta', meta });
      }
    }
  }

  cleanupInstances() {
    for (const inst of [...this.instances.values()]) {
      if (inst instanceof WorldInstance) continue;
      const humans = inst.sessions.size;
      if (humans === 0 && inst.emptySince !== null && inst.time - inst.emptySince > 10) this.instances.delete(inst.id);
      else if (humans === 0 && inst.emptySince === null) inst.emptySince = inst.time;
    }
  }

  /* ================= messages ================= */
  handle(session, msg) {
    if (!msg || typeof msg.t !== 'string') return;
    if (!session.char) {
      if (msg.t === 'create') return this.createCharacter(session, msg);
      if (msg.t === 'ping') return session.send({ t: 'pong', c: msg.c });
      return;
    }
    const inst = session.instance;
    const p = session.ent;
    // Read-only queries hit storage or build large payloads: at most one per 500 ms each.
    if (msg.t === 'lb' || msg.t === 'who' || msg.t === 'npc') {
      const now = Date.now();
      const key = msg.t === 'npc' ? `npc:${msg.type}` : msg.t;
      session.lastQuery = session.lastQuery || {};
      if (now - (session.lastQuery[key] || 0) < 500) return;
      session.lastQuery[key] = now;
    }
    switch (msg.t) {
      case 'in': {
        if (!p || p.bot) return;
        if (p.inputQueue.length > 30) p.inputQueue.splice(0, p.inputQueue.length - 10);
        p.inputQueue.push({
          seq: num(msg.s) | 0,
          mx: Math.max(-1, Math.min(1, num(msg.mx))),
          my: Math.max(-1, Math.min(1, num(msg.my))),
          ax: num(msg.ax, p.x + 1),
          ay: num(msg.ay, p.y),
          attack: !!msg.at,
        });
        return;
      }
      case 'cast': {
        if (!p || !inst || !SLOTS.includes(msg.sl)) return;
        const err = tryCast(inst, p, msg.sl, num(msg.ax, NaN), num(msg.ay, NaN));
        if (err === 'mana') this.notice(session, 'Not enough mana', 'warn', true);
        else if (err === 'safe') this.notice(session, 'You cannot fight here', 'warn', true);
        return;
      }
      case 'pot': {
        if (!p || !inst) return;
        const err = usePotion(inst, p, msg.k);
        if (err && err !== 'cooldown' && err !== 'dead') this.notice(session, err, 'warn', true);
        return;
      }
      case 'interact': return this.interact(session, msg.id);
      case 'respawn': return this.respawn(session);
      case 'equip': return this.equip(session, msg.id);
      case 'unequip': return this.unequip(session, msg.slot);
      case 'sell': return this.sell(session, msg.id);
      case 'discard': return this.discard(session, msg.id);
      case 'buy': return this.buy(session, msg);
      case 'craft': return this.craft(session, msg.a, msg.b);
      case 'class': return this.changeClass(session, msg.cls);
      case 'chat': return this.chat(session, msg);
      case 'party': return this.partyOp(session, msg);
      case 'dungeon': return this.dungeonOp(session, msg);
      case 'arena': return this.arenaOp(session, msg);
      case 'duel': return this.duelOp(session, msg);
      case 'who': return this.who(session);
      case 'lb': return this.sendLeaderboard(session, msg.kind);
      case 'npc': return this.openNpc(session, msg.type, true);
      case 'ping': return session.send({ t: 'pong', c: msg.c });
      default:
    }
  }

  createCharacter(session, msg) {
    if (session.char) return;
    const cls = CLASS_IDS.includes(msg.cls) ? msg.cls : null;
    if (!cls) return this.notice(session, 'Choose a class', 'warn');
    session.char = newCharacter(session.name, cls);
    this.saveChar(session);
    this.enterGame(session);
  }

  notice(session, text, kind = 'info', quiet = false) {
    if (session) session.send({ t: 'notice', text, kind, quiet });
  }

  instanceNotice(inst, text, kind = 'info') {
    for (const s of inst.sessions) this.notice(s, text, kind);
  }

  instanceFeed(inst, killer, victim) {
    for (const s of inst.sessions) s.send({ t: 'feed', k: killer, v: victim });
  }

  announce(text, kind = 'event', inst = null) {
    const targets = inst ? inst.sessions : this.sessions.values();
    for (const s of targets) s.send({ t: 'chat', ch: 'system', from: '', text, kind });
  }

  /* ================= progression ================= */
  grantXp(p, xp) {
    const c = p.char;
    if (!c || !p.session) return;
    if (c.level >= MAX_LEVEL) return;
    c.xp += xp;
    let leveled = false;
    while (c.level < MAX_LEVEL && c.xp >= xpToNext(c.level)) {
      c.xp -= xpToNext(c.level);
      c.level++;
      leveled = true;
    }
    if (c.level >= MAX_LEVEL) c.xp = 0;
    if (leveled) {
      const inst = p.session.instance;
      inst.refreshPlayerStats(p);
      p.hp = p.stats.maxHp;
      p.mp = p.stats.maxMp;
      inst.emit({ e: 'levelup', id: p.id, x: p.x, y: p.y, l: c.level });
      this.notice(p.session, `Level up! You are now level ${c.level}.`, 'good');
      this.saveChar(p.session);
    }
    p.session.charDirty = true;
  }

  grantGold(p, gold) {
    if (!p.char || !p.session) return;
    p.char.gold += gold;
    p.session.charDirty = true;
  }

  async applyArenaResult(accountId, res) {
    const apply = c => {
      if (res.rated) c.rating[res.mode] = Math.max(0, (c.rating[res.mode] || 1000) + res.delta);
      if (!res.draw) { if (res.won) c.pvp.wins++; else c.pvp.losses++; }
      c.gold += res.gold;
    };
    const s = this.byAccount.get(accountId);
    if (s && s.char) {
      apply(s.char);
      s.charDirty = true;
      s.send({ t: 'result', kind: 'arena', ...res });
      this.saveChar(s);
      return;
    }
    try {
      const c = await this.store.getCharacter(accountId);
      if (c) { apply(normalizeCharacter(c)); await this.store.saveCharacter(accountId, normalizeCharacter(c)); }
    } catch (err) { this.log.error('offline arena result failed', err); }
  }

  /* ================= interaction ================= */
  interact(session, id) {
    const inst = session.instance, p = session.ent;
    if (!inst || !p || p.dead) return;
    const e = inst.get(num(id, -1));
    if (!e || !['npc', 'portal', 'chest'].includes(e.kind)) return;
    if (dist(p.x, p.y, e.x, e.y) > INTERACT_RANGE + e.r) return this.notice(session, 'Too far away', 'warn', true);
    inst.onInteract(p, e);
  }

  respawn(session) {
    const inst = session.instance, p = session.ent;
    if (!inst || !p || !p.dead) return;
    if (inst instanceof WorldInstance) inst.respawn(p);
    else if (inst instanceof DungeonInstance) this.returnToWorld(session);
  }

  npcNear(session, type) {
    const inst = session.instance, p = session.ent;
    if (!(inst instanceof WorldInstance) || !p) return false;
    for (const e of inst.entities.values()) {
      if (e.kind === 'npc' && e.type === type && dist(p.x, p.y, e.x, e.y) <= INTERACT_RANGE + 3) return true;
    }
    return false;
  }

  inTown(session) {
    const inst = session.instance, p = session.ent;
    return inst instanceof WorldInstance && p && !inst.combatAllowed(p);
  }

  openNpc(session, type, fromMenu = false) {
    if (!session) return;
    // Menus can also be opened anywhere in town (from the HUD) — not out in the wilds.
    if (fromMenu && !this.inTown(session) && !this.npcNear(session, type)) {
      return this.notice(session, 'Visit town to use this.', 'warn');
    }
    const c = session.char;
    let data = {};
    switch (type) {
      case 'merchant':
        data = { stock: this.getShop(session).stock, potions: POTIONS, maxPotions: MAX_POTIONS };
        break;
      case 'blacksmith':
        data = { recipes: RECIPES, cost: craftCost(c.level), per: MATERIALS_PER_SLOT };
        break;
      case 'arena':
        data = { modes: ARENA_MODES, rating: c.rating, pvp: c.pvp, queue: session.queue ? { mode: session.queue.mode, since: Math.floor(this.time - session.queue.t) } : null };
        break;
      case 'dungeon':
        data = { checkpoints: dungeonCheckpoints(c.stats.deepestFloor), deepest: c.stats.deepestFloor, partyId: session.partyId, leader: this.partyLeader(session) };
        break;
      case 'trainer':
        data = { classes: CLASS_IDS, current: c.cls };
        break;
      case 'board':
        this.sendLeaderboard(session, 'level');
        break;
      default:
        return;
    }
    session.send({ t: 'npc', type, data });
  }

  getShop(session) {
    const now = Date.now();
    if (!session.shop || session.shop.until < now || session.shop.level !== session.char.level) {
      session.shop = { stock: shopStock(session.char.level, ((now / 600000) | 0) ^ (session.id * 7919)), until: now + 600000, level: session.char.level };
    }
    return session.shop;
  }

  /* ================= inventory ================= */
  charChanged(session, statsChanged = false) {
    session.charDirty = true;
    if (statsChanged && session.ent && session.instance) session.instance.refreshPlayerStats(session.ent);
  }

  equip(session, id) {
    const c = session.char;
    const idx = c.inventory.findIndex(i => i.id === id);
    if (idx < 0) return;
    const item = c.inventory[idx];
    if (!GEAR_SLOTS.includes(item.slot)) return;
    const req = Math.max(1, item.ilvl - 3);
    if (c.level < req) return this.notice(session, `Requires level ${req}`, 'warn');
    if (session.instance instanceof ArenaInstance && session.instance.phase === 'fight') return this.notice(session, 'Cannot change gear during a match', 'warn');
    const prev = c.equipment[item.slot];
    c.equipment[item.slot] = item;
    c.inventory.splice(idx, 1);
    if (prev) c.inventory.splice(idx, 0, prev);
    this.charChanged(session, true);
  }

  unequip(session, slot) {
    const c = session.char;
    if (!GEAR_SLOTS.includes(slot) || !c.equipment[slot]) return;
    if (c.inventory.length >= INVENTORY_SIZE) return this.notice(session, 'Inventory full!', 'warn');
    if (session.instance instanceof ArenaInstance && session.instance.phase === 'fight') return this.notice(session, 'Cannot change gear during a match', 'warn');
    c.inventory.push(c.equipment[slot]);
    c.equipment[slot] = null;
    this.charChanged(session, true);
  }

  sell(session, id) {
    if (!this.npcNear(session, 'merchant') && !this.inTown(session)) return this.notice(session, 'Visit the merchant in town to sell.', 'warn');
    const c = session.char;
    const idx = c.inventory.findIndex(i => i.id === id);
    if (idx < 0) return;
    const [item] = c.inventory.splice(idx, 1);
    c.gold += sellPrice(item);
    this.notice(session, `Sold ${item.name} for ${sellPrice(item)} gold.`, 'good', true);
    this.charChanged(session);
  }

  discard(session, id) {
    const c = session.char;
    const idx = c.inventory.findIndex(i => i.id === id);
    if (idx >= 0) { c.inventory.splice(idx, 1); this.charChanged(session); }
  }

  buy(session, msg) {
    if (!this.npcNear(session, 'merchant') && !this.inTown(session)) return this.notice(session, 'Visit the merchant in town to buy.', 'warn');
    const c = session.char;
    if (msg.potion) {
      const pot = POTIONS[msg.potion];
      const n = Math.max(1, Math.min(10, num(msg.n, 1) | 0));
      if (!pot) return;
      const room = MAX_POTIONS - (c.potions[pot.id] || 0);
      const qty = Math.min(n, room);
      if (qty <= 0) return this.notice(session, `You can carry at most ${MAX_POTIONS}.`, 'warn');
      if (c.gold < pot.price * qty) return this.notice(session, 'Not enough gold', 'warn');
      c.gold -= pot.price * qty;
      c.potions[pot.id] = (c.potions[pot.id] || 0) + qty;
      this.charChanged(session);
      return;
    }
    const shop = this.getShop(session);
    const idx = shop.stock.findIndex(i => i.id === msg.id);
    if (idx < 0) return this.notice(session, 'That item is no longer for sale.', 'warn');
    const it = shop.stock[idx];
    if (c.gold < it.price) return this.notice(session, 'Not enough gold', 'warn');
    if (c.inventory.length >= INVENTORY_SIZE) return this.notice(session, 'Inventory full!', 'warn');
    c.gold -= it.price;
    const { price, ...item } = it;
    c.inventory.push(item);
    shop.stock.splice(idx, 1);
    this.charChanged(session);
    session.send({ t: 'npc', type: 'merchant', data: { stock: shop.stock, potions: POTIONS, maxPotions: MAX_POTIONS }, refresh: true });
  }

  craft(session, a, b) {
    if (!this.npcNear(session, 'blacksmith') && !this.inTown(session)) return this.notice(session, 'Visit the blacksmith in town to craft.', 'warn');
    if (!MATERIAL_IDS.includes(a) || !MATERIAL_IDS.includes(b)) return;
    const c = session.char;
    const need = {};
    need[a] = (need[a] || 0) + MATERIALS_PER_SLOT;
    need[b] = (need[b] || 0) + MATERIALS_PER_SLOT;
    for (const [m, n] of Object.entries(need)) if ((c.materials[m] || 0) < n) return this.notice(session, `Need ${n} ${m}`, 'warn');
    const cost = craftCost(c.level);
    if (c.gold < cost) return this.notice(session, 'Not enough gold', 'warn');
    if (c.inventory.length >= INVENTORY_SIZE) return this.notice(session, 'Inventory full!', 'warn');
    const item = craftItem(this.rng, a, b, c.level);
    if (!item) return;
    if (item.slot === 'weapon') item.cls = c.cls;
    for (const [m, n] of Object.entries(need)) c.materials[m] -= n;
    c.gold -= cost;
    c.inventory.push(item);
    this.charChanged(session);
    session.send({ t: 'crafted', item, recipe: recipeKey(a, b) });
    if (session.instance) session.instance.emit({ e: 'anvil', x: session.ent.x, y: session.ent.y });
  }

  changeClass(session, cls) {
    if (!CLASS_IDS.includes(cls)) return;
    if (!this.inTown(session)) return this.notice(session, 'Visit the trainer in town to change class.', 'warn');
    const c = session.char;
    if (c.cls === cls) return;
    c.cls = cls;
    const p = session.ent;
    const inst = session.instance;
    p.r = 0.5;
    inst.refreshPlayerStats(p);
    for (const k in p.cd) p.cd[k] = 0;
    this.charChanged(session);
    this.notice(session, 'Your training is complete. New abilities unlocked!', 'good');
    this.saveChar(session);
  }

  /* ================= chat & social ================= */
  chat(session, msg) {
    const text = clean(msg.text);
    if (!text) return;
    // Token bucket: 5 messages burst, refills 1 per 1.5s.
    const now = Date.now();
    session.chatBudget = Math.min(5, session.chatBudget + (now - session.lastChat) / 1500);
    session.lastChat = now;
    if (session.chatBudget < 1) return this.notice(session, 'You are sending messages too fast.', 'warn');
    session.chatBudget--;
    const out = { t: 'chat', ch: msg.ch, from: session.name, cls: session.char.cls, text };
    switch (msg.ch) {
      case 'say':
        if (session.instance) for (const s of session.instance.sessions) s.send(out);
        break;
      case 'world':
        for (const s of this.sessions.values()) if (s.char) s.send(out);
        break;
      case 'party': {
        const party = this.parties.get(session.partyId);
        if (!party) return this.notice(session, 'You are not in a party.', 'warn');
        for (const n of party.members) this.byName.get(n.toLowerCase())?.send(out);
        break;
      }
      case 'whisper': {
        const target = this.byName.get(clean(msg.to).toLowerCase());
        if (!target) return this.notice(session, `${clean(msg.to)} is not online.`, 'warn');
        target.send({ ...out, to: target.name });
        session.send({ ...out, to: target.name });
        break;
      }
      default:
    }
  }

  who(session) {
    const list = [];
    for (const s of this.sessions.values()) {
      if (!s.char) continue;
      list.push({ name: s.name, cls: s.char.cls, level: s.char.level, zone: s.instance ? s.instance.name : 'Loading', party: !!s.partyId });
    }
    list.sort((a, b) => b.level - a.level);
    session.send({ t: 'who', list: list.slice(0, 200), total: list.length });
  }

  async sendLeaderboard(session, kind = 'level') {
    const rows = await this.leaderboard(kind);
    session.send({ t: 'lb', kind, rows });
  }

  async leaderboard(kind = 'level', limit = 20) {
    const valid = ['level', 'floor', 'duel', 'team', 'ffa', 'kills'];
    if (!valid.includes(kind)) kind = 'level';
    let rows = [];
    try { rows = await this.store.leaderboard(kind, 50); } catch (err) { this.log.error('leaderboard failed', err); }
    const byName = new Map(rows.map(r => [r.name.toLowerCase(), r]));
    for (const s of this.sessions.values()) if (s.char) byName.set(s.name.toLowerCase(), leaderboardRow(s.char, kind));
    return [...byName.values()].sort((a, b) => b.value - a.value || b.level - a.level).slice(0, limit);
  }

  /* ================= parties ================= */
  partyLeader(session) {
    const p = this.parties.get(session.partyId);
    return p ? p.leader : null;
  }

  partyOp(session, msg) {
    const name = clean(msg.name);
    switch (msg.op) {
      case 'invite': {
        const target = this.byName.get(name.toLowerCase());
        if (!target || !target.char) return this.notice(session, `${name} is not online.`, 'warn');
        if (target === session) return;
        if (target.partyId) return this.notice(session, `${target.name} is already in a party.`, 'warn');
        let party = this.parties.get(session.partyId);
        if (!party) {
          party = { id: `p${this.nextParty++}`, leader: session.name, members: [session.name] };
          this.parties.set(party.id, party);
          session.partyId = party.id;
        }
        if (party.leader !== session.name) return this.notice(session, 'Only the party leader can invite.', 'warn');
        if (party.members.length >= PARTY_MAX) return this.notice(session, 'Your party is full.', 'warn');
        target.invites.add(party.id);
        target.send({ t: 'invite', from: session.name, party: party.id });
        this.notice(session, `Invited ${target.name} to your party.`, 'info');
        this.updateParty(party.id);
        return;
      }
      case 'accept': {
        const party = this.parties.get(msg.party);
        if (!party || !session.invites.has(party.id)) return this.notice(session, 'That invite has expired.', 'warn');
        if (session.partyId) this.partyOp(session, { op: 'leave' });
        if (party.members.length >= PARTY_MAX) return this.notice(session, 'That party is full.', 'warn');
        session.invites.delete(party.id);
        party.members.push(session.name);
        session.partyId = party.id;
        this.partyBroadcast(party, `${session.name} joined the party.`);
        this.updateParty(party.id);
        return;
      }
      case 'decline': {
        session.invites.delete(msg.party);
        const party = this.parties.get(msg.party);
        if (party) this.byName.get(party.leader.toLowerCase())?.send({ t: 'notice', text: `${session.name} declined your invite.`, kind: 'warn' });
        return;
      }
      case 'leave': return this.removeFromParty(session.name, session.partyId, 'left');
      case 'kick': {
        const party = this.parties.get(session.partyId);
        if (!party || party.leader !== session.name) return;
        const member = party.members.find(m => m.toLowerCase() === name.toLowerCase());
        if (member && member !== session.name) this.removeFromParty(member, party.id, 'was removed from');
        return;
      }
      case 'promote': {
        const party = this.parties.get(session.partyId);
        if (!party || party.leader !== session.name) return;
        const member = party.members.find(m => m.toLowerCase() === name.toLowerCase());
        if (member) { party.leader = member; this.partyBroadcast(party, `${member} is now the party leader.`); this.updateParty(party.id); }
        return;
      }
      default:
    }
  }

  removeFromParty(name, partyId, verb) {
    const party = this.parties.get(partyId);
    if (!party) return;
    party.members = party.members.filter(m => m !== name);
    const s = this.byName.get(name.toLowerCase());
    if (s) {
      s.partyId = null;
      s.send({ t: 'party', party: null });
      this.notice(s, `You ${verb === 'left' ? 'left' : 'were removed from'} the party.`, 'info');
    }
    if (party.members.length <= 1) {
      for (const m of party.members) {
        const ms = this.byName.get(m.toLowerCase());
        if (ms) { ms.partyId = null; ms.send({ t: 'party', party: null }); this.notice(ms, 'Your party has disbanded.', 'info'); }
      }
      this.parties.delete(party.id);
      return;
    }
    if (party.leader === name) party.leader = party.members[0];
    this.partyBroadcast(party, `${name} ${verb} the party.`);
    this.updateParty(party.id);
  }

  partyBroadcast(party, text) {
    for (const n of party.members) {
      const s = this.byName.get(n.toLowerCase());
      if (s) s.send({ t: 'chat', ch: 'party', from: '', text, kind: 'system' });
    }
  }

  updateParty(partyId) {
    const party = this.parties.get(partyId);
    if (!party) return;
    const members = party.members.map(n => {
      const s = this.byName.get(n.toLowerCase());
      const p = s?.ent;
      return {
        name: n,
        online: !!s,
        cls: s?.char?.cls,
        level: s?.char?.level,
        hp: p ? Math.ceil(p.hp) : 0,
        mhp: p ? p.stats.maxHp : 1,
        dead: p ? p.dead : false,
        zone: s?.instance ? s.instance.name : 'Offline',
        instance: s?.instance?.id || null,
        x: p ? Math.round(p.x) : 0,
        y: p ? Math.round(p.y) : 0,
      };
    });
    const out = { t: 'party', party: { id: party.id, leader: party.leader, members } };
    for (const n of party.members) this.byName.get(n.toLowerCase())?.send(out);
  }

  /* ================= dungeons ================= */
  dungeonOp(session, msg) {
    if (msg.op === 'leave') {
      if (session.instance instanceof DungeonInstance) this.returnToWorld(session);
      return;
    }
    if (msg.op !== 'enter') return;
    if (!this.inTown(session)) return this.notice(session, 'Speak to Seer Ilya in town to enter a dungeon.', 'warn');
    const mode = msg.mode === 'party' ? 'party' : 'solo';
    const c = session.char;
    let floor = num(msg.floor, 1) | 0;
    let members = [session];
    if (mode === 'party') {
      const party = this.parties.get(session.partyId);
      if (!party) return this.notice(session, 'You are not in a party. Invite friends first, or enter solo.', 'warn');
      if (party.leader !== session.name) return this.notice(session, 'Only the party leader can open the dungeon gate.', 'warn');
      members = party.members.map(n => this.byName.get(n.toLowerCase())).filter(s => s && s.char && !(s.instance instanceof ArenaInstance));
    }
    if (!dungeonCheckpoints(c.stats.deepestFloor).includes(floor)) floor = 1;
    for (const s of members) this.leaveQueue(s, true);
    const inst = this.registerInstance(new DungeonInstance(this, {
      id: `d${this.nextInstance++}`, mode, floor, seed: (this.rng.float() * 2 ** 31) | 0, themeId: this.themeId,
      partyId: mode === 'party' ? session.partyId : null, players: members.length,
    }));
    for (const s of members) {
      this.leaveInstance(s);
      inst.addSession(s, inst.gen.start.x + this.rng.range(-1, 1), inst.gen.start.y + this.rng.range(-1, 1), 'players');
      if (s !== session) this.notice(s, `${session.name} opened the dungeon gate — you have been pulled in!`, 'info');
    }
  }

  /* ================= arena & matchmaking ================= */
  arenaOp(session, msg) {
    const mode = ARENA_MODES[msg.mode] ? msg.mode : null;
    switch (msg.op) {
      case 'queue': {
        if (!mode) return;
        if (!(session.instance instanceof WorldInstance)) return this.notice(session, 'You can only queue from the world.', 'warn');
        if (session.queue) this.leaveQueue(session, true);
        let group = [session];
        if (mode === 'team' && session.partyId) {
          const party = this.parties.get(session.partyId);
          if (party.leader !== session.name) return this.notice(session, 'Only the party leader can queue the party.', 'warn');
          group = party.members.map(n => this.byName.get(n.toLowerCase())).filter(s => s && s.char && s.instance instanceof WorldInstance);
          if (group.length > 3) return this.notice(session, 'Team battles allow at most 3 players per side.', 'warn');
        }
        const rating = group.reduce((s, x) => s + x.char.rating[mode], 0) / group.length;
        const entry = { mode, sessions: group, t: this.time, rating };
        for (const s of group) {
          if (s.queue && s !== session) this.leaveQueue(s, true);
          s.queue = entry;
          s.send({ t: 'queue', mode, state: 'searching', since: 0 });
        }
        this.queues[mode].push(entry);
        return;
      }
      case 'cancel': return this.leaveQueue(session);
      case 'practice': {
        if (!mode) return;
        if (!(session.instance instanceof WorldInstance)) return this.notice(session, 'You can only start practice from the world.', 'warn');
        this.leaveQueue(session, true);
        this.startMatch(mode, [[session]], false, true);
        return;
      }
      case 'leave':
        if (session.instance instanceof ArenaInstance) this.returnToWorld(session);
        return;
      default:
    }
  }

  leaveQueue(session, silent = false) {
    const entry = session.queue;
    if (!entry) return;
    const q = this.queues[entry.mode];
    const i = q.indexOf(entry);
    if (i >= 0) q.splice(i, 1);
    for (const s of entry.sessions) {
      s.queue = null;
      s.send({ t: 'queue', mode: entry.mode, state: 'idle' });
      if (!silent && s !== session) this.notice(s, `${session.name} left the queue.`, 'warn');
    }
  }

  processQueues() {
    // Drop stale entries (disconnected or no longer in the world).
    for (const mode of Object.keys(this.queues)) {
      this.queues[mode] = this.queues[mode].filter(e => e.sessions.every(s => this.sessions.has(s.id) && s.instance instanceof WorldInstance && s.queue === e));
      for (const e of this.queues[mode]) for (const s of e.sessions) s.send({ t: 'queue', mode, state: 'searching', since: Math.floor(this.time - e.t) });
    }
    const botWait = this.config.queueBotWait;

    // Duel: pair by rating with a window that widens over time.
    const dq = this.queues.duel.sort((a, b) => a.rating - b.rating);
    for (let i = 0; i < dq.length - 1; i++) {
      const a = dq[i], b = dq[i + 1];
      const wait = Math.min(this.time - a.t, this.time - b.t);
      if (Math.abs(a.rating - b.rating) <= 100 + wait * 15) {
        dq.splice(i, 2);
        i--;
        this.startMatch('duel', [a.sessions, b.sessions], true);
      }
    }
    for (const e of [...dq]) {
      if (this.time - e.t >= botWait) { dq.splice(dq.indexOf(e), 1); this.startMatch('duel', [e.sessions], false); }
    }

    // Team: bin-pack groups into two sides of 3.
    const tq = this.queues.team;
    const humans = tq.reduce((s, e) => s + e.sessions.length, 0);
    const oldest = tq.length ? Math.max(...tq.map(e => this.time - e.t)) : 0;
    if (humans >= 6 || (humans > 0 && oldest >= botWait)) {
      const sides = [[], []];
      const used = [];
      for (const e of [...tq].sort((a, b) => b.sessions.length - a.sessions.length)) {
        const side = sides[0].length <= sides[1].length ? 0 : 1;
        if (sides[side].length + e.sessions.length <= 3) { sides[side].push(...e.sessions); used.push(e); }
        else if (sides[1 - side].length + e.sessions.length <= 3) { sides[1 - side].push(...e.sessions); used.push(e); }
      }
      const full = sides[0].length === 3 && sides[1].length === 3;
      if (full || oldest >= botWait) {
        for (const e of used) tq.splice(tq.indexOf(e), 1);
        this.startMatch('team', sides.filter(s => s.length), full);
      }
    }

    // FFA: up to 6.
    const fq = this.queues.ffa;
    const fh = fq.reduce((s, e) => s + e.sessions.length, 0);
    const fOld = fq.length ? Math.max(...fq.map(e => this.time - e.t)) : 0;
    if (fh >= 6 || (fh >= 1 && fOld >= botWait) || (fh >= 4 && fOld >= 15)) {
      const group = fq.splice(0, 6);
      this.startMatch('ffa', group.map(e => e.sessions), fh >= 4 && group.length >= 4);
    }
  }

  /** sides: array of arrays of sessions. Missing seats are filled with bots. */
  startMatch(mode, sides, ranked, practice = false) {
    const cfg = ARENA_MODES[mode];
    const inst = this.registerInstance(new ArenaInstance(this, { id: `a${this.nextInstance++}`, mode, ranked: ranked && !practice, themeId: this.themeId }));
    const all = sides.flat().filter(s => this.sessions.has(s.id) && s.char);
    const avgLevel = Math.round(all.reduce((x, s) => x + s.char.level, 0) / Math.max(1, all.length)) || 1;
    for (const s of all) { s.queue = null; s.send({ t: 'queue', mode, state: 'found' }); }
    if (mode === 'ffa') {
      for (const s of all) { this.leaveInstance(s); inst.addEntrant(s, 'F'); }
      const total = practice ? 6 : Math.max(cfg.min, Math.min(cfg.size, all.length < 2 ? 4 : all.length));
      for (let i = all.length; i < total; i++) inst.addBot('F', avgLevel);
    } else {
      const per = cfg.size / 2;
      const teams = ['A', 'B'];
      sides.slice(0, 2).forEach((side, i) => {
        for (const s of side) {
          if (!this.sessions.has(s.id) || !s.char) continue;
          this.leaveInstance(s);
          inst.addEntrant(s, teams[i]);
        }
      });
      for (const team of teams) {
        const have = inst.players().filter(p => p.homeTeam === team).length;
        for (let i = have; i < per; i++) inst.addBot(team, avgLevel);
      }
    }
    inst.hub.instanceNotice(inst, `${cfg.name} — get ready!`, 'info');
    return inst;
  }

  duelOp(session, msg) {
    const name = clean(msg.name);
    if (msg.op === 'request') {
      const target = this.byName.get(name.toLowerCase());
      if (!target || !target.char || target === session) return this.notice(session, `${name} is not online.`, 'warn');
      if (!(target.instance instanceof WorldInstance) || !(session.instance instanceof WorldInstance)) return this.notice(session, 'Both players must be in the world.', 'warn');
      this.duelRequests.set(target.name.toLowerCase(), { from: session.name, t: this.time });
      target.send({ t: 'duelReq', from: session.name });
      this.notice(session, `Duel challenge sent to ${target.name}.`, 'info');
    } else if (msg.op === 'accept' || msg.op === 'decline') {
      const req = this.duelRequests.get(session.name.toLowerCase());
      this.duelRequests.delete(session.name.toLowerCase());
      if (!req || this.time - req.t > 60) return this.notice(session, 'That challenge has expired.', 'warn');
      const from = this.byName.get(req.from.toLowerCase());
      if (!from) return this.notice(session, `${req.from} is no longer online.`, 'warn');
      if (msg.op === 'decline') return this.notice(from, `${session.name} declined your duel.`, 'warn');
      if (!(from.instance instanceof WorldInstance) || !(session.instance instanceof WorldInstance)) return this.notice(session, 'Both players must be in the world.', 'warn');
      this.leaveQueue(from, true); this.leaveQueue(session, true);
      this.startMatch('duel', [[from], [session]], false);
    }
  }
}

export function leaderboardRow(c, kind) {
  let value;
  switch (kind) {
    case 'floor': value = c.stats?.deepestFloor || 0; break;
    case 'duel': case 'team': case 'ffa': value = c.rating?.[kind] ?? 1000; break;
    case 'kills': value = c.stats?.kills || 0; break;
    default: value = (c.level || 1) * 1e7 + (c.xp || 0);
  }
  return { name: c.name, cls: c.cls, level: c.level, value, power: computeStats(c).power };
}
