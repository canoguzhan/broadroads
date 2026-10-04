/* Game client controller: wires the connection, world model, renderer, input and UI. */
import { ClientWorld } from './world.js';
import { Predictor } from './predict.js';
import { Labels } from '../ui/labels.js';
import { Hud } from '../ui/hud.js';
import { Chat } from '../ui/chat.js';
import { Panels } from '../ui/panels.js';
import { Input } from '../input.js';
import { sound } from '../audio/sound.js';
import { $ } from '../ui/dom.js';
import { ABILITIES, ARCHETYPES, SLOTS } from '../../shared/classes.js';
import { MONTHLY_THEMES } from '../../shared/themes.js';
import { TICK, F, INTERACT_RANGE } from '../../shared/constants.js';
import { dist } from '../../shared/math.js';
import { RARITIES } from '../../shared/items.js';

const INTERACT_TEXT = {
  npc: e => `Talk to ${e.n} — ${e.ti}`,
  portal: e => (e.t === 'exit' ? 'Return to Town' : (e.fl & F.OPEN) ? e.n : 'Sealed — defeat the guardian'),
  chest: () => 'Open chest',
};

export class Game {
  constructor({ conn, name, offline, renderer, settings, ui, onExit, onNeedChar }) {
    this.conn = conn;
    this.name = name;
    this.offline = offline;
    this.renderer = renderer;
    this.settings = settings;
    this.ui = ui;
    this.onExit = onExit;
    this.onNeedChar = onNeedChar;
    this.world = new ClientWorld();
    this.predictor = new Predictor();
    this.char = null;
    this.party = null;
    this.queue = null;
    this.theme = MONTHLY_THEMES[new Date().getMonth()];
    this.cooldownMax = {};
    this.acc = 0;
    this.running = false;
    this.ping = 0;
    this.fps = 0;
    this.walkTarget = null;
    this.lastHitSound = 0;
    this.unsub = [];

    this.input = new Input(renderer.canvas, (a, ev) => this.action(a, ev));
    this.labels = new Labels($('#labels'));
    this.hud = new Hud(this);
    this.chat = new Chat(this, this.hud.chatRoot);
    this.panels = new Panels(this);
    this.fpsEl = document.createElement('div');
    this.fpsEl.className = 'fps';
    this.hud.root.append(this.fpsEl);

    this.world.on('add', e => { this.renderer.addEntity(e, this.world.youId); this.labels.add(e, this.world.youId); });
    this.world.on('remove', (e, replaced) => { this.renderer.removeEntity(e, replaced); this.labels.remove(e); });
    this.world.on('fx', ev => this.onFx(ev));
    this.bind();
  }

  send(msg) { this.conn.send(msg); }

  bind() {
    const c = this.conn;
    const on = (t, fn) => this.unsub.push(c.on(t, fn));
    on('hello', m => {
      this.theme = MONTHLY_THEMES.find(t => t.id === m.theme) || this.theme;
      applyThemeCss(this.theme);
    });
    on('needChar', () => this.onNeedChar(this));
    on('char', m => this.setChar(m.char));
    on('zone', m => this.setZone(m.zone, m.you));
    on('s', m => {
      this.world.applySnapshot(m);
      if (m.me && this.world.map) {
        const you = this.world.you();
        this.predictor.reconcile(this.world.map, m.me, you ? you.r : 0.5);
      }
    });
    on('meta', m => { this.world.meta = m.meta; this.hud.setMeta(m.meta); if (this.panels.isOpen('scoreboard')) this.panels.render(); });
    on('notice', m => {
      if (m.quiet) this.ui.toast(m.text, m.kind, 1500);
      else { this.ui.toast(m.text, m.kind); this.chat.system(m.text, m.kind); }
    });
    on('chat', m => {
      this.chat.add(m);
      // Public and party messages also pop up above the speaker's head if they are nearby.
      if (m.from && (m.ch === 'say' || m.ch === 'party' || m.ch === 'world')) {
        for (const e of this.world.entities.values()) {
          if (e.kind === 'player' && e.n === m.from) { this.labels.bubble(e.id, m.text, m.ch); break; }
        }
      }
    });
    on('party', m => {
      this.party = m.party;
      this.hud.setParty(m.party, this.name);
      this.panels.refresh(['social', 'dungeon']);
    });
    on('invite', m => this.ui.prompt(`${m.from} invites you to join their party.`,
      () => this.send({ t: 'party', op: 'accept', party: m.party }), () => this.send({ t: 'party', op: 'decline', party: m.party })));
    on('duelReq', m => this.ui.prompt(`⚔️ ${m.from} challenges you to a duel!`,
      () => this.send({ t: 'duel', op: 'accept' }), () => this.send({ t: 'duel', op: 'decline' })));
    on('npc', m => {
      if (m.type === 'board') return;
      if (m.refresh && !this.panels.isOpen(m.type)) { this.panels.data[m.type] = m.data; return; }
      this.panels.open(m.type, m.data);
      sound.playPickup();
    });
    on('lb', m => { this.panels.data.leaderboard = m; if (this.panels.isOpen('leaderboard')) this.panels.render(); else this.panels.open('leaderboard'); });
    on('who', m => { this.panels.data.social = m; this.panels.refresh(['social']); });
    on('queue', m => {
      const prev = this.queue;
      this.queue = m.state === 'idle' ? null : m;
      if (m.state === 'found') { this.ui.banner('MATCH FOUND', 'Entering the arena…'); sound.playFanfare(); this.panels.close(); }
      if (!prev && m.state === 'searching') this.ui.toast('Searching for a match…', 'info');
      this.hud.setMeta(this.world.meta || {});
      this.panels.refresh(['arena']);
    });
    on('result', m => {
      this.panels.open('result', m);
      if (m.kind === 'arena') (m.won ? sound.playVictory() : sound.playDefeat());
      else sound.playDefeat();
    });
    on('feed', m => this.hud.feed(m.k, m.v));
    on('tp', m => this.predictor.teleport(m.x, m.y));
    on('crafted', m => {
      sound.playAnvilStrike();
      const r = RARITIES[m.item.rarity];
      this.ui.banner(`${m.item.icon} ${m.item.name}`, `${r.name} item forged!`);
    });
    on('kicked', m => { this.kickedReason = m.reason; });
    on('pong', m => { this.ping = Math.round(performance.now() - m.c); });
    on('disconnect', m => {
      if (m.byUs) return;
      this.stop();
      this.onExit(this.kickedReason || 'Disconnected from the server.');
    });
  }

  setChar(c) {
    const first = !this.char;
    const prev = this.char;
    this.char = c;
    this.cooldownMax = {};
    const cdr = Math.min(0.4, Object.values(c.equipment).reduce((s, it) => s + ((it && it.stats.cdr) || 0), 0) / 100);
    for (const slot of SLOTS) this.cooldownMax[slot] = ABILITIES[c.cls][slot].cd * (slot === 'primary' ? 1 : 1 - cdr);
    this.hud.setCharacter(c);
    this.panels.refresh(['inventory', 'character', 'merchant', 'blacksmith', 'arena', 'trainer']);
    if (!first && prev && c.level > prev.level) { this.ui.banner('LEVEL UP!', `You reached level ${c.level}`); sound.playFanfare(); }
  }

  setZone(zone, you) {
    this.world.setZone(zone, you);
    this.labels.clear();
    this.renderer.setZone(zone, this.world.map, MONTHLY_THEMES.find(t => t.id === zone.theme) || this.theme);
    this.hud.setZone(zone);
    this.predictor.reset();
    this.walkTarget = null;
    if (zone.kind !== 'world') this.panels.close();
    $('#screen-loading').hidden = true;
    this.hud.root.hidden = false;
    if (zone.kind === 'dungeon') this.ui.banner(zone.name.split('·')[1]?.trim() || 'Dungeon', zone.name.split('·')[0].trim());
    else if (zone.kind === 'arena') this.ui.banner(zone.name, 'Prepare for battle');
    sound.playReviveChime();
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
    this.pingTimer = setInterval(() => this.send({ t: 'ping', c: performance.now() }), 3000);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frameId);
    clearInterval(this.pingTimer);
    this.unsub.forEach(u => u());
    this.input.destroy();
  }

  aimPoint() {
    const pos = this.predictor.render;
    if (this.input.isTouch || !this.input.mouse.inside) {
      // Auto-aim at the nearest hostile on touch screens.
      let best = null, bd = 14;
      for (const e of this.world.entities.values()) {
        if ((e.kind !== 'monster' && e.kind !== 'player') || !(e.fl & F.HOSTILE) || (e.fl & F.DEAD)) continue;
        const d = dist(pos.x, pos.y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) return { x: best.x, y: best.y };
      const you = this.world.you();
      const f = you ? you.f : 0;
      const mv = this.input.move();
      const a = mv.mx || mv.my ? Math.atan2(mv.my, mv.mx) : f;
      return { x: pos.x + Math.cos(a) * 5, y: pos.y + Math.sin(a) * 5 };
    }
    return this.renderer.pick(this.input.mouse.x, this.input.mouse.y) || { x: pos.x + 1, y: pos.y };
  }

  frame(dt) {
    const world = this.world;
    if (!world.map) { this.renderer.frame(dt, world, null); return; }
    // Fixed-rate input ticks matching the server simulation.
    this.acc += dt;
    let steps = 0;
    while (this.acc >= TICK && steps < 10) {
      this.acc -= TICK;
      steps++;
      let mv = this.input.move();
      if (this.walkTarget) mv = this.autoWalk(mv);
      const aim = this.aimPoint();
      const inp = this.predictor.step(world.map, mv, world.me);
      this.send({ t: 'in', s: inp.s, mx: mv.mx, my: mv.my, ax: round2(aim.x), ay: round2(aim.y), at: this.input.attacking() && !this.input.typing() });
    }
    if (this.acc > TICK * 10) this.acc = 0;
    const self = this.predictor.update(dt);
    world.update(dt, this.predictor.ready ? self : null);
    const focus = this.predictor.ready ? self : world.you();
    this.renderer.frame(dt, world, focus);
    this.labels.update(world, this.renderer, dt);
    if (world.me) this.hud.updateSelf(world.me);
    this.hud.drawMinimap(world, focus, dt);
    this.hud.updateZoneBanner(focus, world.me);
    this.updatePrompt(focus);
    this.fps = this.fps * 0.95 + (1 / Math.max(dt, 0.001)) * 0.05;
    if (this.settings.showFps) this.fpsEl.textContent = `${Math.round(this.fps)} fps · ${this.offline ? 'offline' : `${this.ping} ms`}`;
    else if (this.fpsEl.textContent) this.fpsEl.textContent = '';
  }

  nearestInteractable(pos) {
    let best = null, bd = Infinity;
    for (const e of this.world.entities.values()) {
      if (e.kind !== 'npc' && e.kind !== 'portal' && !(e.kind === 'chest' && !(e.fl & F.OPEN))) continue;
      const d = dist(pos.x, pos.y, e.x, e.y);
      if (d <= INTERACT_RANGE + e.r && d < bd) { bd = d; best = e; }
    }
    return best;
  }

  updatePrompt(pos) {
    if (!pos || (this.world.me && this.world.me.dead)) return this.hud.setPrompt(null);
    const e = this.nearestInteractable(pos);
    this.hud.setPrompt(e ? `[F]  ${INTERACT_TEXT[e.kind](e)}` : null);
  }

  interactNearest() {
    const e = this.nearestInteractable(this.predictor.render);
    if (e) this.send({ t: 'interact', id: e.id });
  }

  autoWalk(mv) {
    const t = this.world.entities.get(this.walkTarget);
    const pos = this.predictor.render;
    if (!t || mv.mx || mv.my) { this.walkTarget = null; return mv; }
    const d = dist(pos.x, pos.y, t.x, t.y);
    if (d <= INTERACT_RANGE + t.r - 0.6) {
      this.send({ t: 'interact', id: t.id });
      this.walkTarget = null;
      return { mx: 0, my: 0 };
    }
    return { mx: (t.x - pos.x) / d, my: (t.y - pos.y) / d };
  }

  clickEntity(ev) {
    // Screen-space hit test against interactable objects.
    let best = null, bd = 48;
    for (const e of this.world.entities.values()) {
      if (e.kind !== 'npc' && e.kind !== 'portal' && e.kind !== 'chest') continue;
      const p = this.renderer.project(e.x, e.y, 1);
      const d = Math.hypot(p.x - ev.clientX, p.y - ev.clientY);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  cast(slot) {
    if (!this.char || this.input.typing()) return;
    sound.init();
    const aim = this.aimPoint();
    this.send({ t: 'cast', sl: slot, ax: round2(aim.x), ay: round2(aim.y) });
  }

  potion(k) { this.send({ t: 'pot', k }); }

  action(a, ev) {
    sound.init();
    switch (a) {
      case 'q': case 'e': case 'r': case 'dash': return this.cast(a);
      case 'potHp': return this.potion('hp');
      case 'potMp': return this.potion('mp');
      case 'interact': return this.interactNearest();
      case 'click': {
        const e = this.clickEntity(ev);
        if (e) {
          const pos = this.predictor.render;
          if (dist(pos.x, pos.y, e.x, e.y) <= INTERACT_RANGE + e.r) this.send({ t: 'interact', id: e.id });
          else this.walkTarget = e.id;
          this.input.mouse.left = false; // do not swing at an NPC we clicked
        }
        return;
      }
      case 'inventory': case 'character': case 'social': case 'leaderboard': case 'help': return this.panels.toggle(a);
      case 'map': return this.hud.toggleMap();
      case 'scoreboard': return this.world.zone && this.world.zone.kind === 'arena' ? this.panels.toggle('scoreboard') : null;
      case 'chat': return this.chat.focus();
      case 'chatCommand': return this.chat.focus('/');
      case 'zoom': this.renderer.zoom = Math.max(0.6, Math.min(1.6, this.renderer.zoom + ev * 0.08)); return;
      case 'escape':
        if (this.panels.current) return this.panels.close();
        return this.panels.open('settings');
      default:
    }
  }

  onFx(ev) {
    const youId = this.world.youId;
    const now = performance.now();
    this.renderer.handleFx(ev, this.world);
    switch (ev.e) {
      case 'dmg': {
        const mine = ev.s === youId;
        const onMe = ev.id === youId;
        if (onMe) {
          this.labels.floatText(ev.x, ev.y, `-${ev.v}`, 'hurt');
          if (now - this.lastHitSound > 120) { sound.playHit(); this.lastHitSound = now; }
          if (ev.v > (this.world.me ? this.world.me.mhp * 0.12 : 50)) this.renderer.shake(0.25);
        } else if (mine) {
          this.labels.floatText(ev.x, ev.y, ev.c ? `${ev.v}!` : `${ev.v}`, ev.c ? 'crit' : 'dmg', ev.c ? 1.3 : 1);
        } else {
          this.labels.floatText(ev.x, ev.y, `${ev.v}`, 'other', 0.8);
        }
        break;
      }
      case 'heal': if (ev.v >= 3) this.labels.floatText(ev.x, ev.y, `+${ev.v}`, 'heal'); break;
      case 'reward':
        if (ev.xp) this.labels.floatText(ev.x, ev.y, `+${ev.xp} XP`, 'xp', 0.9);
        if (ev.gold) setTimeout(() => this.labels.floatText(ev.x, ev.y, `+${ev.gold} 🪙`, 'gold', 0.9), 150);
        break;
      case 'pickup':
        this.labels.floatText(ev.x, ev.y, ev.n, `loot-${ev.ra}`, 0.9);
        sound.playPickup();
        if (ev.ra === 'legendary' || ev.ra === 'epic') this.ui.toast(`You found ${ev.n}!`, 'good');
        break;
      case 'slash': if (ev.id === youId || this.near(ev)) sound.playSlash(); break;
      case 'shoot': if (ev.id === youId) (ev.c === 'arcanist' ? sound.playMagicSpark() : sound.playLaserShot()); break;
      case 'dash': case 'blink': if (ev.id === youId) sound.playDash(); break;
      case 'shock': case 'nova': case 'boom': if (this.near(ev)) sound.playNova(); break;
      case 'levelup': if (ev.id !== youId) this.labels.floatText(ev.x, ev.y, 'LEVEL UP!', 'xp', 1.2); break;
      case 'revive': if (ev.id === youId) sound.playReviveChime(); break;
      case 'chest': sound.playFanfare(); break;
      case 'anvil': break;
      case 'fight': this.ui.banner('FIGHT!'); sound.playFanfare(); break;
      default:
    }
  }

  near(ev) {
    const p = this.predictor.render;
    return ev.x === undefined || dist(p.x, p.y, ev.x, ev.y) < 16;
  }

  setSetting(k, v) {
    this.settings[k] = v;
    try { localStorage.setItem('broadroads_settings', JSON.stringify(this.settings)); } catch { /* ignore */ }
    if (k === 'quality') this.renderer.setQuality(v);
    if (k === 'volume') sound.setVolume(v);
  }

  logout() {
    this.stop();
    this.conn.close();
    this.onExit(null, true);
  }

  destroy() {
    this.stop();
    this.labels.clear();
    this.renderer.clearViews();
    this.panels.close();
    this.hud.root.hidden = true;
    this.hud.root.replaceChildren();
  }
}

function round2(v) { return Math.round(v * 100) / 100; }

export function applyThemeCss(theme) {
  const r = document.documentElement.style;
  r.setProperty('--accent', theme.primary);
  r.setProperty('--accent-2', theme.secondary);
  r.setProperty('--accent-3', theme.accent);
}

export { ARCHETYPES };
