/* PvP arena matches: 1v1 duel (best of 3), 3v3 team deathmatch, free-for-all. */
import { Instance } from './instance.js';
import { generateArena, ARENA_MAPS } from '../worldmap.js';
import { newCharacter, CLASS_IDS, xpToNext } from '../classes.js';
import { generateItem } from '../items.js';
import { makeBotBrain } from './bot.js';
import { dist } from '../math.js';

export const ARENA_MODES = {
  duel: { name: 'Duel 1v1', size: 2, teams: 2, rounds: 3, roundTime: 90 },
  team: { name: 'Team Battle 3v3', size: 6, teams: 2, killTarget: 15, time: 300, respawn: 4 },
  ffa: { name: 'Free-for-All', size: 6, min: 4, teams: 0, killTarget: 10, time: 300, respawn: 3 },
};

const BOT_NAMES = ['Vex', 'Rook', 'Nyx', 'Talon', 'Ember', 'Sable', 'Quill', 'Onyx', 'Wren', 'Cinder', 'Jinx', 'Halcyon', 'Drift', 'Mirth', 'Pyre', 'Lark'];

export function makeBotChar(rng, level, cls, taken = new Set()) {
  cls = cls || rng.pick(CLASS_IDS);
  const free = BOT_NAMES.filter(n => !taken.has(`${n}Bot`));
  const c = newCharacter(`${rng.pick(free.length ? free : BOT_NAMES)}Bot`, cls);
  c.level = Math.max(1, level);
  c.xp = Math.floor(xpToNext(c.level) / 2);
  for (const slot of ['weapon', 'armor', 'boots', 'relic']) {
    c.equipment[slot] = generateItem(rng, { ilvl: c.level, rarity: rng.pick(['uncommon', 'rare', 'rare']), slot, cls });
  }
  c.potions = { hp: 0, mp: 0 };
  return c;
}

export function expectedScore(ra, rb) { return 1 / (1 + Math.pow(10, (rb - ra) / 400)); }

export class ArenaInstance extends Instance {
  constructor(hub, { id, mode, ranked, themeId, variant }) {
    variant = variant || ARENA_MAPS[Math.floor(Math.random() * ARENA_MAPS.length)];
    const arena = generateArena(variant);
    super(hub, { id, kind: 'arena', name: `${ARENA_MODES[mode].name}${ranked ? ' · Ranked' : ''}`, map: arena.map, theme: themeId });
    this.arena = arena;
    this.mode = mode;
    this.cfg = ARENA_MODES[mode];
    this.ranked = ranked;
    this.allowPotions = false;
    this.allowRevive = false;
    this.viewRadius = 60;
    this.phase = 'prep';
    this.phaseT = 5;
    this.timeLeft = this.cfg.roundTime || this.cfg.time;
    this.round = 1;
    this.scores = { A: 0, B: 0 };
    this.roundWins = { A: 0, B: 0 };
    this.entrants = new Map(); // entity id -> record for scoring even after leaving
    this.result = null;
    this.ffaSlot = 0;
  }

  spawnPoint(team) {
    if (this.mode === 'ffa') {
      // Pick the FFA spawn farthest from living enemies.
      let best = this.arena.ffa[0], bd = -1;
      for (const s of this.arena.ffa) {
        let nearest = Infinity;
        for (const p of this.players()) if (!p.dead) nearest = Math.min(nearest, dist(p.x, p.y, s.x, s.y));
        if (nearest > bd) { bd = nearest; best = s; }
      }
      return best;
    }
    const list = team === 'A' ? this.arena.spawnsA : this.arena.spawnsB;
    const used = this.players().filter(p => p.team === team).length;
    return list[used % list.length];
  }

  addEntrant(session, team) {
    const sp = this.spawnPoint(team);
    const p = this.addSession(session, sp.x, sp.y, this.mode === 'ffa' ? `ffa${session.id}` : team);
    p.homeTeam = this.mode === 'ffa' ? p.team : team;
    this.record(p, session.char);
    return p;
  }

  addBot(team, level, cls) {
    const char = makeBotChar(this.rng, level, cls, new Set(this.players().map(p => p.name)));
    const sp = this.spawnPoint(team);
    const fake = { char, send() {}, isBot: true };
    const p = this.createPlayer(fake, sp.x, sp.y, this.mode === 'ffa' ? `ffabot${this.nextId}` : team);
    p.session = null;
    p.bot = makeBotBrain(0.55 + Math.random() * 0.3);
    p.homeTeam = this.mode === 'ffa' ? p.team : team;
    p.facing = team === 'A' ? 0 : Math.PI;
    this.record(p, char);
    return p;
  }

  record(p, char) {
    this.entrants.set(p.id, {
      id: p.id, name: p.name, cls: p.cls, level: p.level, team: p.homeTeam, bot: !p.session,
      accountId: p.session ? p.session.accountId : null, kills: 0, deaths: 0, damage: 0, left: false,
      rating: char.rating ? char.rating[this.mode] : 1000,
    });
  }

  /** A disconnected player's hero is taken over by the AI until the match ends. */
  takeOverBySession(session) {
    const p = session.ent;
    if (!p) return;
    this.sessions.delete(session);
    p.session = null;
    p.bot = makeBotBrain(0.6);
    p.ver++;
    session.ent = null;
    session.instance = null;
    const rec = this.entrants.get(p.id);
    if (rec) rec.left = true;
    this.hub.instanceNotice(this, `${p.name} disconnected — the AI takes command of their hero.`, 'warn');
  }

  onLeave(p) {
    const rec = this.entrants.get(p.id);
    if (rec && this.phase !== 'end') rec.left = true;
  }

  pvpAllowed(a, b) { return this.phase === 'fight' && a.team !== b.team; }
  combatAllowed() { return this.phase === 'fight'; }

  hostile(a, b) {
    if (!a || !b || a === b || a.id === b.id) return false;
    if (a.team === b.team) return false;
    return this.phase === 'fight';
  }

  teamOf(p) { return p.homeTeam; }

  onPlayerDeath(p, killer) {
    const rec = this.entrants.get(p.id);
    if (rec) rec.deaths++;
    const kr = killer && killer.kind === 'player' ? this.entrants.get(killer.id) : null;
    if (kr && killer !== p) kr.kills++;
    if (p.session && p.char) { p.char.stats.pvpDeaths++; this.markCharDirty(p); }
    if (killer && killer.kind === 'player' && killer.char && killer.session) { killer.char.stats.pvpKills++; this.markCharDirty(killer); }
    this.emit({ e: 'kill', k: killer ? killer.name : '?', v: p.name, x: p.x, y: p.y, to: undefined });
    this.hub.instanceFeed(this, killer ? killer.name : 'The arena', p.name);

    if (this.mode === 'duel') {
      const alive = { A: 0, B: 0 };
      for (const q of this.players()) if (!q.dead) alive[q.homeTeam]++;
      if (alive.A === 0 || alive.B === 0) this.endRound(alive.A > 0 ? 'A' : alive.B > 0 ? 'B' : null);
      return;
    }
    if (this.mode === 'team' && killer && killer.kind === 'player' && killer !== p) {
      this.scores[killer.homeTeam]++;
      if (this.scores[killer.homeTeam] >= this.cfg.killTarget) return this.endMatch();
    }
    if (this.mode === 'ffa' && kr && kr.kills >= this.cfg.killTarget) return this.endMatch();
    p.respawnAt = this.time + this.cfg.respawn;
  }

  resetPlayers() {
    for (const p of this.players()) {
      const sp = this.mode === 'ffa' ? this.spawnPoint() : this.spawnPoint(p.homeTeam);
      this.revivePlayer(p, sp.x, sp.y, 1);
      p.mp = p.stats.maxMp;
      for (const k in p.cd) p.cd[k] = 0;
      if (p.session) p.session.send({ t: 'tp', x: p.x, y: p.y });
    }
  }

  endRound(winner) {
    if (winner) this.roundWins[winner]++;
    const need = Math.ceil(this.cfg.rounds / 2);
    if (this.roundWins.A >= need || this.roundWins.B >= need || this.round >= this.cfg.rounds) return this.endMatch();
    this.phase = 'roundEnd';
    this.phaseT = 3;
    this.hub.instanceNotice(this, winner ? `Round ${this.round} goes to ${this.teamLabel(winner)}!` : `Round ${this.round} is a draw!`, 'info');
  }

  teamLabel(team) {
    const names = this.players().filter(p => p.homeTeam === team).map(p => p.name);
    return names.join(' & ') || (team === 'A' ? 'Blue' : 'Red');
  }

  winnerTeams() {
    if (this.mode === 'duel') {
      if (this.roundWins.A === this.roundWins.B) {
        // Tie-break on remaining health.
        const hp = { A: 0, B: 0 };
        for (const p of this.players()) hp[p.homeTeam] += p.hp / p.stats.maxHp;
        if (hp.A === hp.B) return [];
        return [hp.A > hp.B ? 'A' : 'B'];
      }
      return [this.roundWins.A > this.roundWins.B ? 'A' : 'B'];
    }
    if (this.mode === 'team') {
      if (this.scores.A === this.scores.B) return [];
      return [this.scores.A > this.scores.B ? 'A' : 'B'];
    }
    // FFA: top killer(s) win.
    const recs = [...this.entrants.values()];
    const top = Math.max(...recs.map(r => r.kills));
    if (top <= 0) return [];
    return recs.filter(r => r.kills === top).map(r => `id:${r.id}`);
  }

  endMatch() {
    if (this.phase === 'end') return;
    this.phase = 'end';
    this.phaseT = 8;
    const winners = this.winnerTeams();
    const recs = [...this.entrants.values()];
    const hasBots = recs.some(r => r.bot);
    const rated = this.ranked && !hasBots;
    const isWinner = r => winners.includes(r.team) || winners.includes(`id:${r.id}`);

    // Elo: compare each human with the average of the opposition.
    const changes = new Map();
    if (rated) {
      for (const r of recs) {
        if (r.bot) continue;
        const opp = recs.filter(o => o !== r && (this.mode === 'ffa' || o.team !== r.team));
        if (!opp.length) continue;
        const oppRating = opp.reduce((s, o) => s + o.rating, 0) / opp.length;
        const exp = expectedScore(r.rating, oppRating);
        const score = winners.length === 0 ? 0.5 : isWinner(r) && !r.left ? 1 : 0;
        changes.set(r.id, Math.round(32 * (score - exp)));
      }
    }
    const scoreboard = recs.map(r => ({
      id: r.id, name: r.name, cls: r.cls, level: r.level, team: r.team, bot: r.bot,
      kills: r.kills, deaths: r.deaths, win: isWinner(r), left: r.left,
      rating: changes.has(r.id) ? r.rating + changes.get(r.id) : r.rating, delta: changes.get(r.id) || 0,
    }));

    for (const r of recs) {
      if (r.bot || !r.accountId) continue;
      const won = isWinner(r) && !r.left;
      const gold = (won ? 60 : 20) * (rated ? 1 : 0.5) + r.kills * 5;
      this.hub.applyArenaResult(r.accountId, {
        mode: this.mode, won, draw: winners.length === 0, rated, delta: changes.get(r.id) || 0, gold: Math.round(gold),
        scoreboard, winners, ranked: this.ranked,
      });
    }
    this.result = { winners, scoreboard, rated };
  }

  onUpdate(dt) {
    if (this.phase === 'prep' || this.phase === 'roundEnd') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        if (this.phase === 'roundEnd') {
          this.round++;
          this.resetPlayers();
          this.timeLeft = this.cfg.roundTime;
          this.phase = 'prep';
          this.phaseT = 3;
        } else {
          this.phase = 'fight';
          this.emit({ e: 'fight' });
        }
      }
      return;
    }
    if (this.phase === 'fight') {
      this.timeLeft -= dt;
      for (const p of this.players()) {
        if (p.dead && p.respawnAt && this.time >= p.respawnAt && this.mode !== 'duel') {
          const sp = this.mode === 'ffa' ? this.spawnPoint() : this.spawnPoint(p.homeTeam);
          p.respawnAt = 0;
          this.revivePlayer(p, sp.x, sp.y, 1);
          if (p.session) p.session.send({ t: 'tp', x: p.x, y: p.y });
        }
      }
      // A match with no humans left ends immediately.
      if (this.sessions.size === 0) return this.endMatch();
      // Opponents all gone: remaining side wins.
      if (this.mode !== 'ffa') {
        const teams = new Set(this.players().map(p => p.homeTeam));
        if (teams.size < 2) {
          if (this.mode === 'duel') { const w = [...teams][0]; this.roundWins[w] = Math.ceil(this.cfg.rounds / 2); }
          else { const w = [...teams][0]; this.scores[w] = Math.max(this.scores[w], (this.scores[w === 'A' ? 'B' : 'A'] || 0) + 1); }
          return this.endMatch();
        }
      }
      if (this.timeLeft <= 0) {
        if (this.mode === 'duel') {
          const hp = { A: 0, B: 0 };
          for (const p of this.players()) hp[p.homeTeam] += p.dead ? 0 : p.hp / p.stats.maxHp;
          this.endRound(hp.A === hp.B ? null : hp.A > hp.B ? 'A' : 'B');
        } else this.endMatch();
      }
      return;
    }
    if (this.phase === 'end') {
      this.phaseT -= dt;
      if (this.phaseT <= 0 && !this.closed) {
        this.closed = true;
        for (const s of [...this.sessions]) this.hub.returnToWorld(s);
      }
    }
  }

  dynamicMeta() {
    const board = [...this.entrants.values()].map(r => ({ id: r.id, name: r.name, team: r.team, kills: r.kills, deaths: r.deaths, bot: r.bot, cls: r.cls }));
    return {
      mode: this.mode,
      ranked: this.ranked,
      phase: this.phase,
      phaseT: Math.ceil(this.phaseT),
      timeLeft: Math.max(0, Math.ceil(this.timeLeft)),
      round: this.round,
      rounds: this.cfg.rounds || 0,
      scores: this.scores,
      roundWins: this.roundWins,
      killTarget: this.cfg.killTarget || 0,
      board,
      result: this.result,
    };
  }
}
