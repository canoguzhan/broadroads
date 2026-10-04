/* Lobby + match server core. Transport-agnostic: wrapped by the Node server
   (WebSockets + database) and by the browser for offline play vs AI. */
import { TICK, CHAT_MAX, PROTOCOL_VERSION } from './constants.js';
import { Match, CFG } from './moba/match.js';
import { CHAMPIONS, CHAMPION_IDS, championInfo } from './moba/champions.js';
import { ITEMS, SPELLS, SECOND_SPELLS } from './moba/items.js';
import { makeBrain } from './moba/bot.js';
import { newProfile, normalizeProfile, profileXpNeeded, leaderboardRow } from './moba/profile.js';
import { RNG } from './rng.js';

const ROLES = ['top', 'jungle', 'mid', 'bot', 'support'];
const BOT_NAMES = ['Nyx', 'Talon', 'Ember', 'Sable', 'Quill', 'Onyx', 'Wren', 'Cinder', 'Jinx', 'Halcyon', 'Drift', 'Mirth', 'Pyre', 'Lark', 'Zephyr', 'Orrin', 'Kestrel', 'Morrow', 'Basil', 'Corvo'];
const PARTY_MAX = 5;
const SELECT_TIME = 40;
const MATCH_CMDS = new Set(['mv', 'dir', 'stop', 'cast', 'summ', 'lvl', 'buy', 'sell', 'use', 'recall', 'ward']);

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clean = s => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, CHAT_MAX);

export { leaderboardRow };

export class Hub {
  constructor({ store, config = {}, log = console, offline = false } = {}) {
    this.store = store;
    this.log = log;
    this.offline = offline;
    this.config = { queueBotWait: offline ? 0 : 25, autosave: 60, selectTime: SELECT_TIME, ...config };
    this.sessions = new Map();
    this.byName = new Map();
    this.byAccount = new Map();
    this.parties = new Map();
    this.rooms = new Map();
    this.queue = [];
    this.selects = new Map();
    this.matches = new Map();
    this.activeByAccount = new Map(); // accountId -> { match, heroId }
    this.rng = new RNG(Date.now() & 0xffffffff);
    this.time = 0;
    this.nextId = 1;
    this.timers = { queue: 0, score: 0, party: 0 };
    this.interval = null;
    this.stats = { ticks: 0, tickMs: 0 };
  }

  start() {
    if (this.interval) return;
    let last = Date.now(), acc = 0;
    this.interval = setInterval(() => {
      const now = Date.now();
      acc += Math.min(250, now - last);
      last = now;
      while (acc >= TICK * 1000) { acc -= TICK * 1000; this.tick(); }
    }, Math.floor(TICK * 500));
  }

  stop() { clearInterval(this.interval); this.interval = null; }

  /* ================= sessions ================= */
  async connect({ accountId, name, send, meta = {} }) {
    const existing = this.byAccount.get(accountId);
    if (existing) {
      existing.send({ t: 'kicked', reason: 'Logged in from another location.' });
      await this.disconnect(existing);
      if (existing.close) existing.close();
    }
    const session = { id: this.nextId++, accountId, name, send, profile: null, partyId: null, invites: new Set(), state: 'lobby', roomCode: null, chatBudget: 5, lastChat: 0, view: null, meta };
    this.sessions.set(session.id, session);
    this.byName.set(name.toLowerCase(), session);
    this.byAccount.set(accountId, session);
    let data = null;
    try { data = await this.store.getCharacter(accountId); } catch (err) { this.log.error('load profile failed', err); }
    if (!this.sessions.has(session.id)) return session;
    session.profile = normalizeProfile(name, data);
    send({
      t: 'hello', v: PROTOCOL_VERSION, name, offline: this.offline,
      champions: CHAMPION_IDS.map(championInfo), items: ITEMS, spells: SPELLS, second: SECOND_SPELLS,
    });
    send({ t: 'profile', profile: session.profile });
    // Rejoin a running match.
    const active = this.activeByAccount.get(accountId);
    if (active && !active.match.ended) this.attachToMatch(session, active.match, active.heroId);
    else {
      for (const party of this.parties.values()) if (party.members.includes(name)) { session.partyId = party.id; break; }
      this.sendLobby(session);
      this.updateParty(session.partyId);
    }
    return session;
  }

  async disconnect(session) {
    if (!this.sessions.has(session.id)) return;
    this.sessions.delete(session.id);
    if (this.byName.get(session.name.toLowerCase()) === session) this.byName.delete(session.name.toLowerCase());
    if (this.byAccount.get(session.accountId) === session) this.byAccount.delete(session.accountId);
    this.leaveQueue(session, true);
    if (session.roomCode) this.roomOp(session, { op: 'leave' });
    for (const sel of this.selects.values()) {
      const p = sel.players.find(x => x.session === session);
      if (p) { p.session = null; p.bot = true; p.wasHuman = true; }
    }
    const active = this.activeByAccount.get(session.accountId);
    if (active) {
      const h = active.match.get(active.heroId);
      if (h && h.session === session) {
        h.session = null;
        h.wasHuman = true;
        h.bot = makeBrain({ role: h.botRole || guessRole(h.champ), skill: 0.7 });
        h.ver++;
      }
    }
    if (session.partyId) {
      const party = this.parties.get(session.partyId);
      if (party && !party.members.some(n => this.byName.has(n.toLowerCase()))) this.parties.delete(party.id);
      else this.updateParty(session.partyId);
    }
    await this.saveProfile(session);
  }

  async saveProfile(session) {
    if (!session.profile) return;
    try { await this.store.saveCharacter(session.accountId, session.profile); } catch (err) { this.log.error('save failed', session.name, err); }
  }

  notice(session, text, kind = 'info') { if (session) session.send({ t: 'notice', text, kind }); }

  sendLobby(session) {
    session.state = 'lobby';
    const active = this.activeByAccount.get(session.accountId);
    session.send({ t: 'lobby', state: 'lobby', queue: this.queueInfo(session), room: session.roomCode ? this.roomInfo(this.rooms.get(session.roomCode)) : null, rejoin: !!(active && !active.match.ended) });
  }

  /* ================= tick ================= */
  tick() {
    const t0 = Date.now();
    const dt = TICK;
    this.time += dt;
    for (const sel of [...this.selects.values()]) this.updateSelect(sel);
    for (const m of [...this.matches.values()]) {
      m.update(dt);
      for (const h of m.heroes) {
        if (!h.session || h.session.view?.match !== m) continue;
        h.session.send(m.snapshotFor(h.session.view));
      }
      m.flushFx();
      if (m.ended && m.endT <= -6) this.closeMatch(m);
      // Matches nobody is connected to are shut down after a grace period (players can rejoin before then).
      else if (!m.ended) {
        m.unattended = m.heroes.some(h => h.session) ? 0 : (m.unattended || 0) + dt;
        if (m.unattended > (this.config.unattendedLimit ?? 180)) this.closeMatch(m);
      }
    }
    this.timers.score -= dt;
    if (this.timers.score <= 0) {
      this.timers.score = 1;
      for (const m of this.matches.values()) {
        const sb = m.scoreboard();
        for (const h of m.heroes) if (h.session && h.session.view?.match === m) h.session.send({ t: 'score', score: sb });
      }
    }
    this.timers.queue -= dt;
    if (this.timers.queue <= 0) { this.timers.queue = 1; this.processQueue(); }
    this.timers.party -= dt;
    if (this.timers.party <= 0) { this.timers.party = 3; for (const id of this.parties.keys()) this.updateParty(id); }
    this.stats.ticks++;
    this.stats.tickMs = this.stats.tickMs * 0.95 + (Date.now() - t0) * 0.05;
  }

  /* ================= messages ================= */
  handle(session, msg) {
    if (!msg || typeof msg.t !== 'string' || !session.profile) return;
    if (msg.t === 'lb' || msg.t === 'who' || msg.t === 'prof') {
      const now = Date.now();
      session.lastQuery = session.lastQuery || {};
      if (now - (session.lastQuery[msg.t] || 0) < 500) return;
      session.lastQuery[msg.t] = now;
    }
    if (MATCH_CMDS.has(msg.t)) {
      const v = session.view;
      if (!v) return;
      return v.match.command(v.match.get(v.heroId), msg);
    }
    switch (msg.t) {
      case 'mping': { const v = session.view; if (v) v.match.command(v.match.get(v.heroId), { ...msg, t: 'ping' }); return; }
      case 'ff': { const v = session.view; if (v) { const ok = v.match.surrenderVote(v.match.get(v.heroId), !!msg.yes); if (!ok) this.matchChat(v.match, null, `${session.name} voted to surrender${v.match.time < CFG.surrenderAfter ? ' (available after 10:00)' : ''}.`, v.team); } return; }
      case 'queue': return this.joinQueue(session, msg);
      case 'cancel': return this.leaveQueue(session);
      case 'room': return this.roomOp(session, msg);
      case 'pick': case 'csumm': case 'lock': return this.selectOp(session, msg);
      case 'party': return this.partyOp(session, msg);
      case 'chat': return this.chat(session, msg);
      case 'who': return this.who(session);
      case 'lb': return this.sendLeaderboard(session, msg.kind);
      case 'prof': return this.sendProfile(session, msg.name);
      case 'leave': if (session.view && session.view.match.ended) { this.detach(session); this.sendLobby(session); } return;
      case 'abandon': {
        // Leave a running match: the AI takes over, and the player can rejoin from the lobby.
        const v = session.view;
        if (!v || v.match.ended) return;
        const h = v.match.get(v.heroId);
        if (h) { h.session = null; h.wasHuman = true; h.bot = makeBrain({ role: h.botRole || guessRole(h.champ), skill: 0.7 }); h.ver++; }
        session.view = null;
        return this.sendLobby(session);
      }
      case 'rejoin': {
        const active = this.activeByAccount.get(session.accountId);
        if (active && !active.match.ended && !session.view) this.attachToMatch(session, active.match, active.heroId);
        return;
      }
      case 'ping': return session.send({ t: 'pong', c: msg.c });
      default:
    }
  }

  /* ================= chat & social ================= */
  chat(session, msg) {
    const text = clean(msg.text);
    if (!text) return;
    const now = Date.now();
    session.chatBudget = Math.min(5, session.chatBudget + (now - session.lastChat) / 1500);
    session.lastChat = now;
    if (session.chatBudget < 1) return this.notice(session, 'You are sending messages too fast.', 'warn');
    session.chatBudget--;
    const out = { t: 'chat', ch: msg.ch, from: session.name, text };
    const v = session.view;
    switch (msg.ch) {
      case 'team': case 'all':
        if (!v) return this.notice(session, 'You are not in a match.', 'warn');
        out.team = v.team;
        out.champ = v.match.get(v.heroId)?.champ;
        for (const h of v.match.heroes) if (h.session && (msg.ch === 'all' || h.team === v.team)) h.session.send(out);
        return;
      case 'party': {
        const party = this.parties.get(session.partyId);
        if (!party) return this.notice(session, 'You are not in a party.', 'warn');
        for (const n of party.members) this.byName.get(n.toLowerCase())?.send(out);
        return;
      }
      case 'whisper': {
        const target = this.byName.get(clean(msg.to).toLowerCase());
        if (!target) return this.notice(session, `${clean(msg.to)} is not online.`, 'warn');
        target.send({ ...out, to: target.name });
        session.send({ ...out, to: target.name });
        return;
      }
      default: // lobby / global
        out.ch = 'global';
        for (const s of this.sessions.values()) if (!s.view) s.send(out);
    }
  }

  matchChat(match, from, text, team = null) {
    for (const h of match.heroes) if (h.session && (!team || h.team === team)) h.session.send({ t: 'chat', ch: 'system', from: from || '', text });
  }

  who(session) {
    const list = [...this.sessions.values()].filter(s => s.profile).map(s => ({ name: s.name, level: s.profile.level, rating: s.profile.rating, state: s.view ? 'In game' : s.state === 'select' ? 'Champion select' : s.state === 'queue' ? 'In queue' : 'Lobby', party: !!s.partyId }));
    list.sort((a, b) => b.rating - a.rating);
    session.send({ t: 'who', list: list.slice(0, 200), total: list.length });
  }

  async leaderboard(kind = 'rating', limit = 25) {
    if (!['rating', 'wins', 'level', 'kills'].includes(kind)) kind = 'rating';
    let rows = [];
    try { rows = await this.store.leaderboard(kind, 50); } catch (err) { this.log.error('leaderboard failed', err); }
    const byName = new Map(rows.filter(r => r.name).map(r => [r.name.toLowerCase(), r]));
    for (const s of this.sessions.values()) if (s.profile) byName.set(s.name.toLowerCase(), leaderboardRow(s.profile, kind));
    return [...byName.values()].sort((a, b) => b.value - a.value).slice(0, limit);
  }

  async sendLeaderboard(session, kind) { session.send({ t: 'lb', kind: kind || 'rating', rows: await this.leaderboard(kind) }); }

  sendProfile(session, name) {
    const s = name ? this.byName.get(clean(name).toLowerCase()) : session;
    if (!s) return this.notice(session, 'That player is not online.', 'warn');
    session.send({ t: 'prof', profile: s.profile });
  }

  /* ================= parties ================= */
  partyOp(session, msg) {
    const name = clean(msg.name);
    switch (msg.op) {
      case 'invite': {
        const target = this.byName.get(name.toLowerCase());
        if (!target || target === session) return this.notice(session, `${name} is not online.`, 'warn');
        if (target.partyId) return this.notice(session, `${target.name} is already in a party.`, 'warn');
        let party = this.parties.get(session.partyId);
        if (!party) { party = { id: `p${this.nextId++}`, leader: session.name, members: [session.name] }; this.parties.set(party.id, party); session.partyId = party.id; }
        if (party.leader !== session.name) return this.notice(session, 'Only the party leader can invite.', 'warn');
        if (party.members.length >= PARTY_MAX) return this.notice(session, 'Your party is full.', 'warn');
        target.invites.add(party.id);
        target.send({ t: 'invite', from: session.name, party: party.id });
        this.notice(session, `Invited ${target.name}.`);
        return this.updateParty(party.id);
      }
      case 'accept': {
        const party = this.parties.get(msg.party);
        if (!party || !session.invites.has(party.id)) return this.notice(session, 'That invite has expired.', 'warn');
        if (party.members.length >= PARTY_MAX) return this.notice(session, 'That party is full.', 'warn');
        if (session.partyId) this.partyOp(session, { op: 'leave' });
        session.invites.delete(party.id);
        party.members.push(session.name);
        session.partyId = party.id;
        this.leaveQueue(session, true);
        return this.updateParty(party.id);
      }
      case 'decline': session.invites.delete(msg.party); return;
      case 'leave': return this.removeFromParty(session.name, session.partyId);
      case 'kick': {
        const party = this.parties.get(session.partyId);
        if (party && party.leader === session.name) { const m = party.members.find(x => x.toLowerCase() === name.toLowerCase()); if (m && m !== session.name) this.removeFromParty(m, party.id); }
        return;
      }
      default:
    }
  }

  removeFromParty(name, partyId) {
    const party = this.parties.get(partyId);
    if (!party) return;
    party.members = party.members.filter(m => m !== name);
    const s = this.byName.get(name.toLowerCase());
    if (s) { s.partyId = null; s.send({ t: 'party', party: null }); this.leaveQueue(s, true); }
    if (party.members.length <= 1) {
      for (const m of party.members) { const ms = this.byName.get(m.toLowerCase()); if (ms) { ms.partyId = null; ms.send({ t: 'party', party: null }); } }
      this.parties.delete(party.id);
      return;
    }
    if (party.leader === name) party.leader = party.members[0];
    this.updateParty(party.id);
  }

  updateParty(partyId) {
    const party = this.parties.get(partyId);
    if (!party) return;
    const members = party.members.map(n => { const s = this.byName.get(n.toLowerCase()); return { name: n, online: !!s, level: s?.profile?.level, rating: s?.profile?.rating, state: s ? (s.view ? 'In game' : s.state) : 'Offline' }; });
    for (const n of party.members) this.byName.get(n.toLowerCase())?.send({ t: 'party', party: { id: party.id, leader: party.leader, members } });
  }

  partySessions(session) {
    const party = this.parties.get(session.partyId);
    if (!party) return [session];
    return party.members.map(n => this.byName.get(n.toLowerCase())).filter(s => s && s.profile && !s.view);
  }

  /* ================= queue ================= */
  queueInfo(session) {
    const e = this.queue.find(q => q.sessions.includes(session));
    return e ? { mode: e.mode, since: Math.floor(this.time - e.t), size: e.sessions.length } : null;
  }

  joinQueue(session, msg) {
    if (session.view || session.state === 'select') return;
    const mode = msg.mode === 'practice' ? 'practice' : 'ranked';
    const party = this.parties.get(session.partyId);
    if (party && party.leader !== session.name) return this.notice(session, 'Only the party leader can start matchmaking.', 'warn');
    const group = this.partySessions(session);
    for (const s of group) this.leaveQueue(s, true);
    if (session.roomCode) this.roomOp(session, { op: 'leave' });
    if (mode === 'practice' || this.offline) {
      const difficulty = ['easy', 'normal', 'hard'].includes(msg.difficulty) ? msg.difficulty : 'normal';
      return this.startSelect({ blue: group, red: [] }, { mode: 'practice', ranked: false, difficulty });
    }
    const rating = group.reduce((a, s) => a + s.profile.rating, 0) / group.length;
    const entry = { mode, sessions: group, t: this.time, rating };
    this.queue.push(entry);
    for (const s of group) { s.state = 'queue'; s.send({ t: 'lobby', state: 'queue', queue: this.queueInfo(s) }); }
  }

  leaveQueue(session, silent = false) {
    const i = this.queue.findIndex(e => e.sessions.includes(session));
    if (i < 0) return;
    const [entry] = this.queue.splice(i, 1);
    for (const s of entry.sessions) { if (s.state === 'queue') s.state = 'lobby'; if (this.sessions.has(s.id)) this.sendLobby(s); if (!silent && s !== session) this.notice(s, `${session.name} left the queue.`, 'warn'); }
  }

  processQueue() {
    this.queue = this.queue.filter(e => e.sessions.every(s => this.sessions.has(s.id) && !s.view));
    for (const e of this.queue) for (const s of e.sessions) s.send({ t: 'lobby', state: 'queue', queue: this.queueInfo(s) });
    if (!this.queue.length) return;
    const humans = this.queue.reduce((a, e) => a + e.sessions.length, 0);
    const oldest = Math.max(...this.queue.map(e => this.time - e.t));
    if (humans < 10 && oldest < this.config.queueBotWait) return;
    // Bin-pack groups (sorted by rating) into two teams of five.
    const sides = { blue: [], red: [] };
    const used = [];
    const entries = [...this.queue].sort((a, b) => b.sessions.length - a.sessions.length || b.rating - a.rating);
    for (const e of entries) {
      const rb = sides.blue.reduce((a, s) => a + s.profile.rating, 0), rr = sides.red.reduce((a, s) => a + s.profile.rating, 0);
      const order = (sides.blue.length < sides.red.length || (sides.blue.length === sides.red.length && rb <= rr)) ? ['blue', 'red'] : ['red', 'blue'];
      const side = order.find(t => sides[t].length + e.sessions.length <= 5);
      if (!side) continue;
      sides[side].push(...e.sessions);
      used.push(e);
      if (sides.blue.length + sides.red.length >= 10) break;
    }
    const full = sides.blue.length === 5 && sides.red.length === 5;
    if (!full && oldest < this.config.queueBotWait) return;
    this.queue = this.queue.filter(e => !used.includes(e));
    this.startSelect(sides, { mode: 'ranked', ranked: full, difficulty: 'normal' });
  }

  /* ================= custom rooms ================= */
  roomInfo(room) {
    if (!room) return null;
    const slot = s => (s === 'bot' ? { bot: true, name: 'Bot' } : s ? { name: s.name, level: s.profile.level } : null);
    return { code: room.code, host: room.host.name, blue: room.blue.map(slot), red: room.red.map(slot), difficulty: room.difficulty };
  }

  broadcastRoom(room) {
    const info = this.roomInfo(room);
    for (const s of [...room.blue, ...room.red]) if (s && s !== 'bot') s.send({ t: 'lobby', state: 'room', room: info });
  }

  roomOp(session, msg) {
    const room = session.roomCode ? this.rooms.get(session.roomCode) : null;
    switch (msg.op) {
      case 'create': {
        if (session.view) return;
        if (room) this.roomOp(session, { op: 'leave' });
        this.leaveQueue(session, true);
        let code;
        do { code = String(this.rng.int(100000, 999999)); } while (this.rooms.has(code));
        const r = { code, host: session, blue: [session, null, null, null, null], red: [null, null, null, null, null], difficulty: 'normal' };
        this.rooms.set(code, r);
        session.roomCode = code;
        session.state = 'room';
        return this.broadcastRoom(r);
      }
      case 'join': {
        const r = this.rooms.get(clean(msg.code).replace(/\D/g, ''));
        if (!r) return this.notice(session, 'No room with that code.', 'warn');
        if (room) this.roomOp(session, { op: 'leave' });
        this.leaveQueue(session, true);
        const team = r.blue.includes(null) ? 'blue' : r.red.includes(null) ? 'red' : null;
        if (!team) return this.notice(session, 'That room is full.', 'warn');
        r[team][r[team].indexOf(null)] = session;
        session.roomCode = r.code;
        session.state = 'room';
        return this.broadcastRoom(r);
      }
      case 'leave': {
        if (!room) return;
        for (const t of ['blue', 'red']) room[t] = room[t].map(s => (s === session ? null : s));
        session.roomCode = null;
        if (room.host === session) {
          const next = [...room.blue, ...room.red].find(s => s && s !== 'bot');
          if (!next) { this.rooms.delete(room.code); this.sendLobby(session); return; }
          room.host = next;
        }
        this.broadcastRoom(room);
        if (this.sessions.has(session.id)) this.sendLobby(session);
        return;
      }
      case 'team': {
        if (!room) return;
        const team = msg.team === 'red' ? 'red' : 'blue';
        const free = room[team].indexOf(null);
        if (free < 0) return;
        for (const t of ['blue', 'red']) room[t] = room[t].map(s => (s === session ? null : s));
        room[team][free] = session;
        return this.broadcastRoom(room);
      }
      case 'bot': {
        if (!room || room.host !== session) return;
        const team = msg.team === 'red' ? 'red' : 'blue';
        const i = num(msg.slot, -1);
        if (i < 0 || i > 4) return;
        if (room[team][i] === null) room[team][i] = 'bot';
        else if (room[team][i] === 'bot') room[team][i] = null;
        return this.broadcastRoom(room);
      }
      case 'fill': {
        if (!room || room.host !== session) return;
        for (const t of ['blue', 'red']) room[t] = room[t].map(s => s || 'bot');
        return this.broadcastRoom(room);
      }
      case 'difficulty':
        if (room && room.host === session && ['easy', 'normal', 'hard'].includes(msg.difficulty)) { room.difficulty = msg.difficulty; this.broadcastRoom(room); }
        return;
      case 'start': {
        if (!room || room.host !== session) return;
        const sides = { blue: room.blue.filter(s => s && s !== 'bot'), red: room.red.filter(s => s && s !== 'bot') };
        const bots = { blue: room.blue.filter(s => s === 'bot').length, red: room.red.filter(s => s === 'bot').length };
        if (!sides.blue.length && !sides.red.length) return;
        this.rooms.delete(room.code);
        for (const s of [...sides.blue, ...sides.red]) s.roomCode = null;
        return this.startSelect(sides, { mode: 'custom', ranked: false, difficulty: room.difficulty, bots });
      }
      default:
    }
  }

  /* ================= champion select ================= */
  startSelect(sides, opts) {
    const id = `s${this.nextId++}`;
    const players = [];
    const used = new Set();
    for (const team of ['blue', 'red']) {
      for (const s of sides[team]) { s.state = 'select'; players.push({ key: s.accountId, name: s.name, team, session: s, champ: null, summ: 'mend', locked: false, bot: false }); used.add(s.name); }
      const botCount = opts.bots ? opts.bots[team] : 5 - sides[team].length;
      for (let i = 0; i < botCount; i++) {
        let name;
        do { name = `${this.rng.pick(BOT_NAMES)}Bot`; } while (used.has(name));
        used.add(name);
        players.push({ key: `bot:${id}:${team}${i}`, name, team, session: null, champ: null, summ: 'mend', locked: false, bot: true });
      }
    }
    const sel = { id, players, opts, endsAt: this.time + (this.config.selectTime ?? SELECT_TIME), started: false };
    this.selects.set(id, sel);
    this.broadcastSelect(sel);
    return sel;
  }

  selectInfo(sel, viewer) {
    return {
      id: sel.id, mode: sel.opts.mode, ranked: sel.opts.ranked, timeLeft: Math.max(0, Math.ceil(sel.endsAt - this.time)),
      players: sel.players.map(p => ({ name: p.name, team: p.team, bot: p.bot, champ: p.team === viewer.team || p.locked ? p.champ : null, summ: p.team === viewer.team ? p.summ : null, locked: p.locked, you: p === viewer })),
    };
  }

  broadcastSelect(sel) {
    for (const p of sel.players) if (p.session) p.session.send({ t: 'select', select: this.selectInfo(sel, p) });
  }

  selectOp(session, msg) {
    const sel = [...this.selects.values()].find(s => s.players.some(p => p.session === session));
    if (!sel) return;
    const p = sel.players.find(x => x.session === session);
    if (p.locked) return;
    if (msg.t === 'pick') {
      if (!CHAMPIONS[msg.champ]) return;
      if (sel.players.some(o => o !== p && o.team === p.team && o.champ === msg.champ)) return this.notice(session, 'A teammate already picked that champion.', 'warn');
      p.champ = msg.champ;
    } else if (msg.t === 'csumm') {
      if (SECOND_SPELLS.includes(msg.spell)) p.summ = msg.spell;
    } else if (msg.t === 'lock') {
      if (!p.champ) return this.notice(session, 'Pick a champion first.', 'warn');
      p.locked = true;
    }
    this.broadcastSelect(sel);
    if (sel.players.filter(x => x.session).every(x => x.locked)) sel.endsAt = Math.min(sel.endsAt, this.time + 2);
  }

  updateSelect(sel) {
    if (sel.started) return;
    if (!sel.players.some(p => p.session) && !sel.players.some(p => p.wasHuman)) { this.selects.delete(sel.id); return; }
    const remaining = Math.ceil(sel.endsAt - this.time);
    if (remaining !== sel.lastBroadcast) { sel.lastBroadcast = remaining; this.broadcastSelect(sel); }
    if (this.time < sel.endsAt) return;
    sel.started = true;
    this.selects.delete(sel.id);
    // Assign champions & roles for anyone who did not pick.
    for (const team of ['blue', 'red']) {
      const tp = sel.players.filter(p => p.team === team);
      const taken = new Set(tp.map(p => p.champ).filter(Boolean));
      const rolesLeft = [...ROLES];
      for (const p of tp.filter(x => x.champ)) { const r = guessRole(p.champ, rolesLeft); p.role = r; rolesLeft.splice(rolesLeft.indexOf(r), 1); }
      for (const p of tp.filter(x => !x.champ)) {
        const role = rolesLeft.shift() || 'mid';
        const options = CHAMPION_IDS.filter(c => !taken.has(c) && CHAMPIONS[c].roles.includes(role));
        const pool = options.length ? options : CHAMPION_IDS.filter(c => !taken.has(c));
        p.champ = this.rng.pick(pool);
        p.role = role;
        taken.add(p.champ);
      }
      for (const p of tp) {
        if (p.bot) p.summ = p.role === 'jungle' ? 'strike' : p.role === 'support' ? 'scorch' : this.rng.pick(['mend', 'bulwark', 'haste', 'mend']);
        p.locked = true;
      }
    }
    this.startMatch(sel);
  }

  /* ================= matches ================= */
  startMatch(sel) {
    const id = `m${this.nextId++}`;
    const skill = { easy: 0.45, normal: 0.7, hard: 0.92 }[sel.opts.difficulty] ?? 0.7;
    const players = sel.players.map(p => ({ key: p.key, name: p.name, team: p.team, champ: p.champ, spell: p.summ, bot: !p.session, role: p.role, skill, session: p.session }));
    const match = new Match({
      id, mode: sel.opts.mode, ranked: sel.opts.ranked, players,
      hooks: { end: (m, result) => this.onMatchEnd(m, result), feed: () => {} },
    });
    for (const h of match.heroes) if (h.bot) h.bot.skill = skill;
    this.matches.set(id, match);
    for (const h of match.heroes) {
      if (h.session) { this.activeByAccount.set(h.session.accountId, { match, heroId: h.id }); this.attachToMatch(h.session, match, h.id); }
      else if (h.key && !h.key.startsWith('bot:')) this.activeByAccount.set(h.key, { match, heroId: h.id });
    }
    return match;
  }

  attachToMatch(session, match, heroId) {
    const h = match.get(heroId);
    if (!h) return;
    if (h.bot && h.wasHuman) { h.bot = null; h.ver++; }
    h.session = session;
    session.view = { match, heroId, team: h.team, known: new Map() };
    session.state = 'game';
    session.send({
      t: 'match', id: match.id, mode: match.mode, ranked: match.ranked, you: heroId, team: h.team, time: match.time,
      players: match.heroes.map(x => ({ id: x.id, name: x.name, champ: x.champ, team: x.team, bot: !x.session })),
    });
    session.send({ t: 'score', score: match.scoreboard() });
  }

  detach(session) {
    if (session.view) {
      const h = session.view.match.get(session.view.heroId);
      if (h && h.session === session) h.session = null;
    }
    session.view = null;
  }

  onMatchEnd(match, result) {
    const humans = result.players.filter(p => !p.key.startsWith('bot:'));
    const hasBots = result.players.some(p => p.key.startsWith('bot:'));
    const rated = match.ranked && !hasBots;
    const avg = team => { const ps = result.players.filter(p => p.team === team); return ps.reduce((a, p) => a + (this.ratingOf(p.key) ?? 1000), 0) / ps.length; };
    const rb = avg('blue'), rr = avg('red');
    for (const p of humans) {
      const mine = p.team === 'blue' ? rb : rr, theirs = p.team === 'blue' ? rr : rb;
      const exp = 1 / (1 + Math.pow(10, (theirs - mine) / 400));
      const delta = rated ? Math.round(32 * ((p.win ? 1 : 0) - exp)) : 0;
      const xp = (p.win ? 150 : 90) + p.kills * 10 + p.assists * 5 + (match.mode === 'practice' ? -40 : 0);
      this.applyResult(p.key, prof => {
        prof.games++;
        if (p.win) prof.wins++; else prof.losses++;
        prof.kills += p.kills; prof.deaths += p.deaths; prof.assists += p.assists;
        if (rated) prof.rating = Math.max(0, prof.rating + delta);
        prof.xp += xp;
        while (prof.xp >= profileXpNeeded(prof.level)) { prof.xp -= profileXpNeeded(prof.level); prof.level++; }
        const c = prof.champs[p.champ] || { games: 0, wins: 0 };
        c.games++; if (p.win) c.wins++;
        prof.champs[p.champ] = c;
        prof.history.unshift({ at: Date.now(), champ: p.champ, win: p.win, k: p.kills, d: p.deaths, a: p.assists, mode: match.mode, dur: result.duration, delta });
        prof.history = prof.history.slice(0, 20);
      }, { result, delta, xp, rated, you: p.id });
    }
  }

  ratingOf(key) {
    const s = this.byAccount.get(key);
    return s && s.profile ? s.profile.rating : null;
  }

  async applyResult(accountId, fn, payload) {
    const s = this.byAccount.get(accountId);
    if (s && s.profile) {
      fn(s.profile);
      s.send({ t: 'end', ...payload, profile: s.profile });
      return this.saveProfile(s);
    }
    try {
      const prof = normalizeProfile('?', await this.store.getCharacter(accountId));
      fn(prof);
      await this.store.saveCharacter(accountId, prof);
    } catch (err) { this.log.error('offline result failed', err); }
  }

  closeMatch(match) {
    this.matches.delete(match.id);
    for (const h of match.heroes) {
      const key = h.key;
      if (this.activeByAccount.get(key)?.match === match) this.activeByAccount.delete(key);
      const s = h.session;
      if (s && s.view?.match === match) { s.view = null; this.sendLobby(s); }
    }
  }
}

export function guessRole(champ, available = ROLES) {
  const c = CHAMPIONS[champ];
  if (!c) return available[0] || 'mid';
  return c.roles.find(r => available.includes(r)) || available[0] || c.roles[0];
}
