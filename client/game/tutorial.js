/* Guided first match: a step list shown over a tutorial-mode match (enemy
   champions stay home). Each step completes from the world state or from
   match events; markers and HUD highlights show where to look. */
import { h } from '../ui/dom.js';
import { getValley } from '../../shared/moba/map.js';
import { sfx } from '../audio/sfx.js';

const DONE_KEY = 'broadroads_tutorial_done';
export const tutorialDone = () => { try { return localStorage.getItem(DONE_KEY) === '1'; } catch { return false; } };

export class Tutorial {
  constructor(game) {
    this.game = game;
    const team = game.world.team, valley = getValley();
    const mid = valley.teams[team].towers.find(t => t.lane === 'mid' && t.tier === 1);
    this.lanePoint = { x: mid.x + (team === 'blue' ? 6 : -6), y: mid.y + (team === 'blue' ? -6 : 6) };
    const enemy = team === 'blue' ? 'red' : 'blue';
    this.enemyTower = valley.teams[enemy].towers.find(t => t.lane === 'mid' && t.tier === 1);
    this.steps = [
      { text: 'Welcome to the Valley! Right-click on the ground to move your champion.', hint: 'On a phone, use the joystick.', check: s => s.moved > 6 },
      { text: "You're at your base, the only place you can shop. Press P and buy a Healing Draught: double-click it (or pick any item).", highlight: '.mb-gold', check: s => s.items > 0 },
      { text: 'Learn your first ability: press Ctrl+Q, or click a glowing + above your abilities.', highlight: '.mb-up:not([hidden])', check: s => s.ranks >= 1 },
      { text: 'Head to the middle lane. Follow the golden marker on the ground and on your minimap.', marker: () => this.lanePoint, check: s => s.distLane < 9 },
      { text: 'Use your ability on the enemy minions: point your cursor at them and press the ability key (Q, W or E).', highlight: '.mb-abils .mb-slot:not(.locked)', check: s => s.casts > 0 || s.stepTime > 60 },
      { text: 'Attack enemy minions when their health is low to earn gold: last-hit 3 of them.', progress: s => `${Math.min(3, s.cs - this.cs0)} / 3`, check: s => s.cs - this.cs0 >= 3, enter: s => { this.cs0 = s.cs; } },
      { text: 'Enemy towers hit hard. Let your minions walk in first, then right-click the tower to damage it.', marker: () => this.enemyTower, check: s => s.towerHit || s.stepTime > 75 },
      { text: 'Press B to return home. Stand still while it channels; at your fountain you heal and can shop.', highlight: '.mb-recall', check: s => s.atBase && s.stepTime > 2 },
      { text: "Tutorial complete! You know the basics: move, items, abilities, last-hitting, towers and returning home. Try Practice vs AI next, then Ranked when you're ready.", final: true },
    ];
    this.i = 0;
    this.stepTime = 0;
    this.casts = 0;
    this.towerHit = false;
    this.cs0 = 0;
    this.start = null;
    this.markerT = 0;
    this.el = h('div.tutorial', {},
      h('div.tut-head', {}, h('span.tut-badge', { text: 'Tutorial' }), this.countEl = h('span.tut-count'), h('button.tut-skip', { onclick: () => this.finish(true) }, 'Skip tutorial')),
      this.textEl = h('div.tut-text'),
      this.progressEl = h('div.tut-progress'),
      this.actionsEl = h('div.tut-actions'));
    game.hud.root.append(this.el);
    this.show();
  }

  state() {
    const g = this.game, me = g.world.me, you = g.world.you();
    if (!me || !you) return null;
    if (!this.start) this.start = { x: you.x, y: you.y };
    return {
      moved: Math.hypot(you.x - this.start.x, you.y - this.start.y),
      ranks: Object.values(me.rk || {}).reduce((a, b) => a + b, 0),
      casts: this.casts,
      items: (me.it || []).filter(Boolean).length,
      distLane: Math.hypot(you.x - this.lanePoint.x, you.y - this.lanePoint.y),
      cs: me.cs || 0,
      towerHit: this.towerHit,
      atBase: !!me.shop,
      stepTime: this.stepTime,
    };
  }

  onEvent(ev) {
    const you = this.game.world.youId;
    if (ev.e === 'cast' && ev.id === you) this.casts++;
    if (ev.e === 'dmg' && ev.s === you) {
      const t = this.game.world.entities.get(ev.id);
      if (t && t.kind === 'tower') this.towerHit = true;
    }
  }

  update(dt) {
    if (this.closed) return;
    const step = this.steps[this.i];
    this.stepTime += dt;
    const s = this.state();
    if (!s) return;
    if (step.progress) this.progressEl.textContent = step.progress(s);
    if (step.marker) {
      this.markerT -= dt;
      if (this.markerT <= 0) {
        this.markerT = 1.6;
        const p = step.marker();
        this.game.renderer.fx.ring(p.x, p.y, { color: 0xfacc15, radius: 3, life: 1.4 });
        this.game.renderer.fx.pillar(p.x, p.y, 0xfacc15, 0.9, 4);
        this.game.pings.push({ x: p.x, y: p.y, t: 1.6, color: '#facc15' });
      }
    }
    if (!step.final && step.check(s)) this.next();
  }

  next() {
    this.i++;
    this.stepTime = 0;
    sfx.play('ui_notify', { late: true });
    this.show();
  }

  show() {
    const step = this.steps[this.i];
    document.querySelectorAll('.tut-highlight').forEach(e => e.classList.remove('tut-highlight'));
    if (step.enter) { const s = this.state(); if (s) step.enter(s); }
    this.countEl.textContent = step.final ? '' : `Step ${this.i + 1} of ${this.steps.length - 1}`;
    this.textEl.textContent = step.text;
    this.progressEl.textContent = step.hint || '';
    this.actionsEl.replaceChildren();
    if (step.highlight) setTimeout(() => document.querySelectorAll(step.highlight).forEach(e => e.classList.add('tut-highlight')), 50);
    if (step.final) {
      this.el.classList.add('done');
      try { localStorage.setItem(DONE_KEY, '1'); } catch { /* ignore */ }
      this.game.send({ t: 'track', ev: 'tutorialDone' });
      sfx.play('victory', { late: true });
      this.actionsEl.append(
        h('button.btn.btn-primary', { onclick: () => this.game.quit() }, 'Back to the lobby'),
        h('button.btn', { onclick: () => this.close() }, 'Keep playing'));
    }
  }

  finish(skipped) {
    if (skipped) { try { localStorage.setItem(DONE_KEY, '1'); } catch { /* ignore */ } }
    this.close();
  }

  close() {
    this.closed = true;
    document.querySelectorAll('.tut-highlight').forEach(e => e.classList.remove('tut-highlight'));
    this.el.remove();
  }
}
