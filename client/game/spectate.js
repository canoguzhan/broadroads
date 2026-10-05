/* Spectating and replays: a bar with both teams' champions (click to follow,
   again for a free camera), the leave button and, for replays, playback
   controls. ReplayPlayer feeds a recorded snapshot stream into the Game at
   the chosen speed and supports seeking. */
import { h, timeStr } from '../ui/dom.js';
import { pic, champKey } from '../ui/icons.js';

export class SpectatorBar {
  constructor(game) {
    this.game = game;
    const g = game;
    const team = t => h(`div.sp-team.${t}`, {}, ...[...g.players.values()].filter(p => p.team === t).map(p =>
      h('button.sp-champ', { title: `${p.name} (${g.champInfo[p.champ]?.name || p.champ})`, dataset: { id: p.id }, onclick: () => this.follow(p.id) }, pic(champKey(p.champ), g.champInfo[p.champ]?.icon || '?'))));
    this.label = h('div.sp-label', { text: g.match.replay ? 'Replay' : 'Spectating' });
    this.controls = h('div.sp-controls');
    this.el = h('div.spectator-bar', {}, team('blue'), h('div.sp-mid', {}, this.label, this.controls,
      h('button.btn.btn-sm', { onclick: () => g.quit() }, g.match.replay ? 'Exit replay' : 'Stop watching')), team('red'));
    g.hud.root.append(this.el);
    g.hud.root.classList.add('spectating');
  }

  follow(id) {
    const g = this.game;
    g.followId = g.followId === id ? null : id;
    g.renderer.locked = !!g.followId;
    for (const b of this.el.querySelectorAll('.sp-champ')) b.classList.toggle('active', Number(b.dataset.id) === g.followId);
  }

  destroy() { this.el.remove(); this.game.hud.root.classList.remove('spectating'); }
}

export class ReplayPlayer {
  constructor(game, header, lines) {
    this.game = game;
    this.header = header;
    this.frames = [];
    for (const line of lines) {
      if (!line) continue;
      try { const m = JSON.parse(line); this.frames.push(m); } catch { /* skip a damaged line */ }
    }
    this.duration = header.duration || (this.frames.length ? this.frames[this.frames.length - 1].time || 0 : 0);
    this.clock = 0;
    this.i = 0;
    this.speed = 1;
    this.playing = true;
    this.buildControls();
  }

  buildControls() {
    const c = this.game.spectator.controls;
    this.playBtn = h('button.btn.btn-sm', { onclick: () => this.toggle() }, '⏸');
    this.slider = h('input.sp-seek', { type: 'range', min: 0, max: Math.max(1, Math.round(this.duration)), value: 0, step: 1 });
    this.slider.addEventListener('input', () => this.seek(Number(this.slider.value)));
    this.timeEl = h('span.sp-time');
    const speed = h('select.sp-speed', {}, ...[0.5, 1, 2, 4, 8].map(s => h('option', { value: s, text: `${s}×` })));
    speed.value = '1';
    speed.addEventListener('change', () => { this.speed = Number(speed.value); });
    c.append(this.playBtn, this.slider, this.timeEl, speed);
  }

  toggle() {
    if (!this.playing && this.clock >= this.duration) this.seek(0);
    this.playing = !this.playing;
    this.playBtn.textContent = this.playing ? '⏸' : '▶';
  }

  /** Delivers every frame up to the replay clock. */
  dispatch(quiet) {
    const g = this.game;
    g.muteFx = quiet;
    while (this.i < this.frames.length && (this.frames[this.i].time ?? 0) <= this.clock) g.onMessage(this.frames[this.i++]);
    g.muteFx = false;
  }

  update(dt) {
    if (this.playing) {
      this.clock = Math.min(this.duration, this.clock + dt * this.speed);
      this.dispatch(this.speed > 4);
      if (this.clock >= this.duration && this.i >= this.frames.length) { this.playing = false; this.playBtn.textContent = '↺'; this.game.ui.toast('Replay finished'); }
    }
    if (document.activeElement !== this.slider) this.slider.value = Math.round(this.clock);
    const label = `${timeStr(this.clock)} / ${timeStr(this.duration)}`;
    if (this.timeEl.textContent !== label) this.timeEl.textContent = label;
  }

  /** Jumps to a time: going back rebuilds the world from the start, quietly. */
  seek(t) {
    const g = this.game;
    if (t < this.clock) {
      g.world.setMatch(g.world.valley, null, 'spectator');
      g.renderer.fx.clear();
      this.i = 0;
    }
    this.clock = t;
    this.dispatch(true);
  }
}
