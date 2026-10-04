/* In-match client controller. */
import { ClientWorld } from './world.js';
import { Labels } from '../ui/labels.js';
import { Hud } from '../ui/hud.js';
import { Panels } from '../ui/panels.js';
import { Chat } from '../ui/chat.js';
import { Input } from '../input.js';
import { sound } from '../audio/sound.js';
import { $ } from '../ui/dom.js';
import { getRift } from '../../shared/moba/map.js';
import { F } from '../../shared/constants.js';
import { dist } from '../../shared/math.js';

const PING_COLORS = { go: '#22c55e', danger: '#ef4444', help: '#3b82f6', omw: '#facc15' };

export class Game {
  constructor({ app, renderer, settings, ui, data, match }) {
    this.app = app;
    this.renderer = renderer;
    this.settings = settings;
    this.ui = ui;
    this.data = data;
    this.match = match;
    this.champInfo = Object.fromEntries(data.champions.map(c => [c.id, c]));
    this.players = new Map(match.players.map(p => [p.id, p]));
    this.world = new ClientWorld();
    this.world.setMatch(getRift(), match.you, match.team);
    this.renderer.setMatch(this.world.rift, match.team, this.champInfo);
    this.renderer.youId = match.you;
    this.renderer.locked = settings.cameraLock !== false;
    this.pings = [];
    this.hover = null;
    this.lastDir = { mx: 0, my: 0, at: false };
    this.dirT = 0;
    this.rmbT = 0;
    this.fps = 60;
    this.running = false;
    this.endResult = null;

    this.input = new Input(renderer.canvas, (a, ev) => this.action(a, ev));
    this.labels = new Labels($('#labels'));
    this.hud = new Hud(this);
    this.panels = new Panels(this);
    this.chat = new Chat(this, this.hud.chatRoot, 'match');
    this.fpsEl = document.createElement('div');
    this.fpsEl.className = 'fps';
    this.hud.root.append(this.fpsEl);
    const mine = this.players.get(match.you);
    if (mine) this.hud.setChampion(this.champInfo[mine.champ]);

    this.world.on('add', e => { this.renderer.addEntity(e); this.labels.add(e, this.world); });
    this.world.on('remove', (e, replaced) => { this.renderer.removeEntity(e, replaced); this.labels.remove(e); });
    this.world.on('fx', ev => this.onFx(ev));
  }

  get name() { return this.app.name; }
  send(msg) { this.app.send(msg); }
  myChampId() { return this.players.get(this.world.youId)?.champ; }
  myChamp() { return this.champInfo[this.myChampId()]; }

  /* ---------------- server messages ---------------- */
  onMessage(m) {
    switch (m.t) {
      case 's': this.world.applySnapshot(m); break;
      case 'score': this.world.score = m.score; this.hud.setScore(m.score); this.panels.refresh(['score']); break;
      case 'end': this.endResult = m; this.panels.open('end'); (m.result.winner === this.world.team ? sound.playVictory() : sound.playDefeat()); break;
      case 'chat':
        this.chat.add(m);
        if (m.from) for (const e of this.world.entities.values()) if (e.kind === 'hero' && e.n === m.from) { this.labels.bubble(e.id, m.text, m.ch); break; }
        break;
      case 'notice': this.ui.toast(m.text, m.kind); break;
      default:
    }
  }

  start() {
    this.running = true;
    this.last = performance.now();
    const loop = t => {
      if (!this.running) return;
      this.frameId = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (t - this.last) / 1000);
      this.last = t;
      this.frame(dt);
    };
    this.frameId = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frameId);
    this.input.destroy();
  }

  destroy() {
    this.stop();
    this.labels.clear();
    this.renderer.clear();
    this.panels.close();
    this.chat.destroy();
    this.hud.root.hidden = true;
    this.hud.root.replaceChildren();
    document.body.classList.remove('is-dead');
  }

  /* ---------------- frame ---------------- */
  cursorWorld() { return this.renderer.pick(this.input.mouse.x, this.input.mouse.y) || { x: 0, y: 0 }; }

  updateHover() {
    const mx = this.input.mouse.x, my = this.input.mouse.y;
    let best = null, bd = 42;
    for (const e of this.world.entities.values()) {
      if (!['hero', 'minion', 'monster', 'tower', 'inhib', 'nexus', 'ward'].includes(e.kind) || (e.fl & F.DEAD)) continue;
      const p = this.renderer.project(e.x, e.y, e.kind === 'tower' || e.kind === 'nexus' ? 2.5 : 1);
      const d = Math.hypot(p.x - mx, p.y - my) - (e.kind === 'nexus' ? 30 : e.kind === 'tower' ? 18 : 0);
      if (d < bd) { bd = d; best = e; }
    }
    this.hover = best;
    const enemy = best && best.tm !== this.world.team;
    this.renderer.canvas.classList.toggle('cursor-attack', !!enemy);
  }

  frame(dt) {
    const w = this.world;
    // Direct movement (arrow keys / joystick) and basic-attack button.
    const dir = this.input.arrows();
    const at = this.input.touch.attack;
    this.dirT -= dt;
    if (dir.mx !== this.lastDir.mx || dir.my !== this.lastDir.my || at !== this.lastDir.at || ((dir.mx || dir.my || at) && this.dirT <= 0)) {
      this.dirT = 0.2;
      this.lastDir = { ...dir, at };
      this.send({ t: 'dir', mx: dir.mx, my: dir.my, at });
    }
    // Holding the right mouse button keeps moving toward the cursor.
    if (this.input.mouse.right) {
      this.rmbT -= dt;
      if (this.rmbT <= 0) { this.rmbT = 0.15; this.issueMove(false, true); }
    }
    w.update(dt);
    this.updateHover();
    const you = w.you();
    const focus = this.input.keys.has('Space') && you ? you : you;
    const pan = this.renderer.locked ? null : this.input.edgePan(this.renderer.width, this.renderer.height);
    if (this.input.keys.has('Space') && you) { this.renderer.camTarget.x = you.x; this.renderer.camTarget.z = you.y; }
    this.renderer.frame(dt, w, focus, pan);
    this.labels.update(w, this.renderer, dt);
    if (w.me) this.hud.updateSelf(w.me);
    for (const p of this.pings) p.t -= dt;
    this.pings = this.pings.filter(p => p.t > 0);
    this.hud.drawMinimap(dt);
    if (this.rangeT > 0) { this.rangeT -= dt; if (this.rangeT <= 0) this.renderer.showRange(0, 0, 0); else if (you && w.me) this.renderer.showRange(you.x, you.y, w.me.st.rg + 0.6); }
    this.fps = this.fps * 0.95 + (1 / Math.max(dt, 0.001)) * 0.05;
    if (this.settings.showFps) this.fpsEl.textContent = `${Math.round(this.fps)} fps · ${this.app.offline ? 'offline' : `${this.app.ping} ms`}`;
    else if (this.fpsEl.textContent) this.fpsEl.textContent = '';
  }

  issueMove(attackMove = false, quiet = false) {
    const p = this.cursorWorld();
    const target = this.hover && this.hover.tm !== this.world.team ? this.hover : null;
    this.send({ t: 'mv', x: round2(p.x), y: round2(p.y), id: target ? target.id : undefined, a: attackMove ? 1 : 0 });
    if (!quiet) this.renderer.showMoveMarker(p.x, p.y, !!target || attackMove);
  }

  /** Target for touch casting: nearest visible enemy (champions first). */
  autoTarget(range) {
    const you = this.world.you();
    if (!you) return null;
    let best = null, bs = Infinity;
    for (const e of this.world.entities.values()) {
      if (e.tm === this.world.team || (e.fl & F.DEAD) || !['hero', 'minion', 'monster'].includes(e.kind)) continue;
      const d = dist(you.x, you.y, e.x, e.y);
      if (d > range) continue;
      const s = (e.kind === 'hero' ? 0 : 100) + d;
      if (s < bs) { bs = s; best = e; }
    }
    return best;
  }

  castKey(slot) {
    sound.init();
    const you = this.world.you();
    let p, id;
    if (this.input.isTouch && you) {
      const info = this.myChamp();
      const range = slot === 'd' || slot === 'f' ? 6 : (info?.abilities[slot]?.range || 6) + 2;
      const t = this.autoTarget(Math.max(6, range));
      if (t) { p = { x: t.x, y: t.y }; id = t.id; }
      else { const d = this.input.touch; const a = d.mx || d.my ? Math.atan2(d.my, d.mx) : you.f; p = { x: you.x + Math.cos(a) * 5, y: you.y + Math.sin(a) * 5 }; }
    } else {
      p = this.cursorWorld();
      id = this.hover ? this.hover.id : undefined;
    }
    if (slot === 'ward') return this.send({ t: 'ward', x: round2(p.x), y: round2(p.y) });
    if (slot === 'd' || slot === 'f') return this.send({ t: 'summ', k: slot, x: round2(p.x), y: round2(p.y), id });
    const me = this.world.me;
    if (me && me.rk[slot] === 0) return this.ui.toast('Level this ability first (Ctrl + key or the + button).', 'warn', 1500);
    this.send({ t: 'cast', sl: slot, x: round2(p.x), y: round2(p.y), id });
  }

  toggleLock(v) {
    this.renderer.locked = v === undefined ? !this.renderer.locked : v;
    this.settings.cameraLock = this.renderer.locked;
    this.app.saveSettings();
    this.ui.toast(this.renderer.locked ? 'Camera locked' : 'Camera unlocked — edge-pan or click the minimap', 'info', 1500);
  }

  action(a, ev) {
    sound.init();
    switch (a) {
      case 'rclick': this.rmbT = 0.15; return this.issueMove(false);
      case 'lclick': if (this.amovePending) { this.amovePending = false; this.issueMove(true); } return;
      case 'amove': this.issueMove(true); this.rangeT = 1.2; return;
      case 'stop': return this.send({ t: 'stop' });
      case 'q': case 'w': case 'e': case 'r': case 'd': case 'f': case 'ward': return this.castKey(a);
      case 'level': return this.send({ t: 'lvl', sl: ev });
      case 'recall': return this.send({ t: 'recall' });
      case 'item0': case 'item1': case 'item2': case 'item3': case 'item4': case 'item5': return this.send({ t: 'use', slot: Number(a.slice(4)) });
      case 'shop': return this.panels.toggle('shop');
      case 'score': return this.panels.open('score');
      case 'scoreUp': if (this.panels.isOpen('score')) this.panels.close(); return;
      case 'lock': return this.toggleLock();
      case 'chat': return this.chat.focus();
      case 'help': return this.panels.toggle('help');
      case 'ping': { const p = this.cursorWorld(); const k = ev.ctrlKey ? 'danger' : ev.shiftKey ? 'help' : 'go'; return this.send({ t: 'mping', x: round2(p.x), y: round2(p.y), k }); }
      case 'zoom': this.renderer.zoom = Math.max(0.65, Math.min(1.5, this.renderer.zoom + ev * 0.07)); return;
      case 'escape': if (this.panels.current && this.panels.current !== 'end') return this.panels.close(); return this.panels.open('settings');
      default:
    }
  }

  onFx(ev) {
    const w = this.world;
    this.renderer.handleFx(ev, w);
    const you = w.youId;
    switch (ev.e) {
      case 'dmg': {
        const mine = ev.s === you, onMe = ev.id === you;
        const e = w.entities.get(ev.id);
        if (onMe) { this.labels.floatText(ev.x, ev.y, `-${ev.v}`, 'hurt'); if (ev.v > 60) sound.playHit(); }
        else if (mine) this.labels.floatText(ev.x, ev.y, ev.c ? `${ev.v}!` : `${ev.v}`, ev.c ? 'crit' : ev.t === 'm' ? 'magic' : ev.t === 't' ? 'true' : 'dmg', ev.c ? 1.3 : 1);
        else if (e && e.kind === 'hero') this.labels.floatText(ev.x, ev.y, `${ev.v}`, 'other', 0.8);
        break;
      }
      case 'heal': if (ev.v >= 10) this.labels.floatText(ev.x, ev.y, `+${ev.v}`, 'heal'); break;
      case 'gold': this.labels.floatText(ev.x, ev.y, `+${ev.v}`, 'gold', 0.85); sound.playPickup(); break;
      case 'levelup': if (ev.id === you) { sound.playFanfare(); } { const e = w.entities.get(ev.id); if (e) { e.l = ev.l; this.labels.levelChanged(e); } } break;
      case 'atk': if (ev.id === you) sound.playSlash(); break;
      case 'cast': if (ev.id === you) sound.playMagicSpark(); break;
      case 'shock': case 'boom': case 'nova': if (this.near(ev)) sound.playNova(); break;
      case 'buy': sound.playAnvilStrike(); this.panels.refresh(['shop']); break;
      case 'nomana': this.ui.toast('Not enough mana', 'warn', 900); break;
      case 'kill': this.hud.feed(ev.k, ev.v, ev.a); if (ev.k === you) sound.playVictory(); else if (ev.v === you) sound.playDefeat(); break;
      case 'ann': this.hud.announce(ev.text, ev.k); if (['kill', 'multi', 'ace', 'tower', 'inhib', 'epic', 'victory'].includes(ev.k)) sound.playFanfare(); this.chat.system(ev.text, 'event'); break;
      case 'ping': this.pings.push({ x: ev.x, y: ev.y, t: 3, color: PING_COLORS[ev.k] || '#22c55e' }); sound.playPickup(); break;
      case 'respawn': if (ev.id === you) sound.playReviveChime(); break;
      case 'recall': if (ev.id === you) sound.playReviveChime(); break;
      default:
    }
  }

  near(ev) { const y = this.world.you(); return !y || ev.x === undefined || dist(y.x, y.y, ev.x, ev.y) < 18; }

  setSetting(k, v) {
    this.settings[k] = v;
    this.app.saveSettings();
    if (k === 'quality') this.renderer.setQuality(v);
    if (k === 'volume') sound.setVolume(v);
  }

  quit() {
    if (this.endResult) this.send({ t: 'leave' });
    else this.send({ t: 'abandon' });
  }
}

function round2(v) { return Math.round(v * 100) / 100; }
