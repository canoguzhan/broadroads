/* Records a match for replays: a full-vision spectator snapshot stream at
   10 Hz (effects from skipped ticks are carried over) plus the scoreboard,
   as newline-delimited JSON. The first line is the replay header. */
const MAX_BYTES = 40e6;

export class Recorder {
  constructor(match) {
    this.match = match;
    this.view = { team: 'spectator', heroId: null, known: new Map() };
    this.lines = [];
    this.bytes = 0;
    this.ticks = 0;
    this.pendingFx = [];
  }

  /** Call once per tick, after the match update and before its effects are flushed. */
  capture() {
    const m = this.match;
    if (this.ticks++ % 2) { this.pendingFx.push(...m.fxFor('spectator', null)); return; }
    const s = m.snapshotFor(this.view);
    if (this.pendingFx.length) { s.fx = [...this.pendingFx, ...(s.fx || [])]; this.pendingFx = []; }
    this.push(s);
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
      players: m.heroes.map(h => ({ id: h.id, name: h.name, champ: h.champ, team: h.team, bot: !h.session && !h.wasHuman, skin: h.skin || 'base', k: h.kills, d: h.deaths, a: h.assists })),
    };
    return { header, lines: this.lines };
  }
}
