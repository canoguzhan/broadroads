/* Records a match for replays: a full-vision spectator snapshot stream at
   10 Hz (effects from skipped ticks are carried over) plus the scoreboard,
   as newline-delimited JSON. The first line is the replay header. */
const MAX_BYTES = 40e6;
// Highlight moments from announcer events: score decides the 'best moment'.
const HIGHLIGHTS = { multi2: [2, 'Double takedown'], multi3: [4, 'Triple takedown'], multi4: [6, 'Quadra takedown'], multi5: [9, 'PENTA TAKEDOWN'], team_wipe: [5, 'Team wipe'], first_strike: [1.5, 'First strike'], titan: [4, 'Abyss Titan slain'], wyrm: [2.5, 'Ember Wyrm slain'], streak_end: [2, 'Shutdown'] };

export class Recorder {
  constructor(match) {
    this.match = match;
    this.view = { team: 'spectator', heroId: null, known: new Map() };
    this.lines = [];
    this.bytes = 0;
    this.ticks = 0;
    this.pendingFx = [];
    this.highlights = [];
  }

  /** Call once per tick, after the match update and before its effects are flushed. */
  capture() {
    const m = this.match;
    for (const ev of m.fx) if (ev.e === 'ann' && HIGHLIGHTS[ev.key]) this.note(ev);
    if (this.ticks++ % 2) { this.pendingFx.push(...m.fxFor('spectator', null)); return; }
    const s = m.snapshotFor(this.view);
    if (this.pendingFx.length) { s.fx = [...this.pendingFx, ...(s.fx || [])]; this.pendingFx = []; }
    this.push(s);
  }

  note(ev) {
    const [score, label] = HIGHLIGHTS[ev.key];
    const t = Math.round(this.match.time * 10) / 10;
    // Merge with a moment a few seconds earlier (a triple supersedes the double just before it).
    const prev = this.highlights.find(h => t - h.t < 8 && (h.champ === ev.killer || !ev.killer));
    if (prev) { if (score > prev.score) Object.assign(prev, { score, label, key: ev.key }); return; }
    this.highlights.push({ t, score, label, key: ev.key, champ: ev.killer || null, team: ev.team || null, text: String(ev.text || '').slice(0, 80) });
  }

  push(msg) {
    if (this.bytes > MAX_BYTES) return; // very long matches stop recording rather than eating memory
    const line = JSON.stringify(msg);
    this.bytes += line.length;
    this.lines.push(line);
  }

  /** Header + frames, ready to store. */
  finish(result) {
    const m = this.match;
    const header = {
      t: 'replay', v: 1, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: Date.now(),
      mode: m.mode, ranked: m.ranked, duration: result.duration, winner: result.winner, kills: result.kills,
      highlights: [...this.highlights].sort((a, b) => b.score - a.score).slice(0, 5).sort((a, b) => a.t - b.t),
      players: m.heroes.map(h => ({ id: h.id, name: h.name, champ: h.champ, team: h.team, bot: !h.session && !h.wasHuman, skin: h.skin || 'base', k: h.kills, d: h.deaths, a: h.assists })),
    };
    return { header, lines: this.lines };
  }
}
