/* In-match client controller. */
import { Pathfinder } from '../../shared/moba/pathfind.js';
import { ClientWorld } from './world.js';
import { isMuted } from '../ui/social.js';
import { canRankUp } from '../../shared/moba/champions.js';
import { SpectatorBar } from './spectate.js';
import { EmoteWheel, EMOTE_ICON } from './emotes.js';
import { Tutorial } from './tutorial.js';
import { setModelsEnabled, setLowDetail } from '../render/assetModels.js';
import { Labels } from '../ui/labels.js';
import { Hud } from '../ui/hud.js';
import { Panels } from '../ui/panels.js';
import { Chat } from '../ui/chat.js';
import { Input } from '../input.js';
import { sfx } from '../audio/sfx.js';
import { $ } from '../ui/dom.js';
import { getValley } from '../../shared/moba/map.js';
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
    this.world.setMatch(getValley(), match.you, match.team);
    this.renderer.setMatch(this.world.valley, match.team, this.champInfo);
    this.renderer.youId = match.you;
    this.renderer.skins = new Map(match.players.map(p => [p.id, p.skin]));
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
    if (match.mode === 'tutorial') this.tutorial = new Tutorial(this);
    this.spectating = !!match.spectator;
    if (!this.spectating) this.emotes = new EmoteWheel(this);
    if (this.spectating) { this.renderer.locked = false; this.spectator = new SpectatorBar(this); }
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
      case 'end': {
        this.endResult = m;
        this.panels.open('end');
        const win = m.result.winner === this.world.team;
        sfx.clearVoices();
        sfx.play(win ? 'victory' : 'defeat', { late: true });
        sfx.announce(win ? 'vo_victory' : 'vo_defeat', 10);
        break;
      }
      case 'chat':
        this.chat.add(m);
        if (m.from && m.from !== this.name) sfx.play('chat_msg', { gap: 0.3 });
        if (m.from && !isMuted(m.from)) for (const e of this.world.entities.values()) if (e.kind === 'hero' && e.n === m.from) { this.labels.bubble(e.id, m.text, m.ch); break; }
        break;
      case 'notice': this.ui.toast(m.text, m.kind); break;
      default:
    }
  }

  start() {
    sfx.playMusic('amb_valley');
    sfx.play('match_start', { late: true });
    sfx.announce('vo_welcome', 5);
    sfx.preload([...MATCH_SOUNDS, ...[...this.players.values()].flatMap(p => [`atk_${p.champ}`, ...['q', 'w', 'e', 'r'].flatMap(k => [`${p.champ}_${k}`, `${p.champ}_${k}_hit`])])]);
    this.running = true;
    this.last = performance.now();
    const loop = t => {
      if (!this.running) return;
      this.frameId = requestAnimationFrame(loop);
      const dt = Math.max(0, Math.min(0.1, (t - this.last) / 1000)); // rAF timestamps can precede performance.now() after a long block
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
    this.tutorial?.close();
    this.spectator?.destroy();
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
      if (!['hero', 'minion', 'monster', 'tower', 'spire', 'core', 'ward'].includes(e.kind) || (e.fl & F.DEAD)) continue;
      const p = this.renderer.project(e.x, e.y, e.kind === 'tower' || e.kind === 'core' ? 2.5 : 1);
      const d = Math.hypot(p.x - mx, p.y - my) - (e.kind === 'core' ? 30 : e.kind === 'tower' ? 18 : 0);
      if (d < bd) { bd = d; best = e; }
    }
    this.hover = best;
    const enemy = best && best.tm !== this.world.team;
    this.renderer.canvas.classList.toggle('cursor-attack', !!enemy);
  }

  frame(dt) {
    const w = this.world;
    this.tutorial?.update(dt);
    this.replay?.update(dt);
    this.autoLevel(dt);
    if (this.spectating) return this.spectatorFrame(dt);
    // Direct movement (arrow keys / joystick) and basic-attack button.
    const dir = this.input.arrows();
    const at = this.input.touch.attack;
    this.dirT -= dt;
    if (dir.mx !== this.lastDir.mx || dir.my !== this.lastDir.my || at !== this.lastDir.at || ((dir.mx || dir.my || at) && this.dirT <= 0)) {
      this.dirT = 0.2;
      this.lastDir = { ...dir, at };
      this.send({ t: 'dir', mx: dir.mx, my: dir.my, at });
    }
    if (dir.mx || dir.my) this.world.predictDir(dir.mx, dir.my);
    else if (this.world.predict && this.world.predict.dx !== undefined) this.world.predict = null;
    // Holding the right mouse button keeps moving toward the cursor.
    if (this.input.mouse.right) {
      this.rmbT -= dt;
      if (this.rmbT <= 0) { this.rmbT = 0.15; this.issueMove(false, true); }
    }
    w.update(dt);
    this.updateHover();
    const you = w.you();
    if (you) {
      sfx.listener = you;
      // Footsteps while our champion moves.
      this.stepT = (this.stepT || 0) - dt;
      if (you.moving > 0.3 && !(you.fl & F.DEAD) && this.stepT <= 0) {
        this.stepT = 0.34;
        this.stepN = ((this.stepN || 0) + 1) % 3;
        sfx.play(`step_${this.stepN + 1}`, { rate: 0.92 + Math.random() * 0.16, gap: 0.2 });
      }
    }
    if (w.time >= 20 && !this.minionsAnnounced) { this.minionsAnnounced = true; sfx.announce('vo_minions', 2); }
    // Camera: you, unless watching a teammate (clicked in the top-left) or, while dead, your killer.
    let focus = you;
    const dead = you && (you.fl & F.DEAD);
    if (dead && this.deathCamId) { const k = w.entities.get(this.deathCamId); if (k && !(k.fl & F.DEAD)) focus = k; }
    else if (!dead && this.deathCamId) this.deathCamId = null; // respawned: back to you
    if (this.camFocusId && !dead) { const t = w.entities.get(this.camFocusId); if (t) focus = t; else this.setCamFocus(null); }
    if (this.input.keys.has('Space') && you) { if (this.camFocusId) this.setCamFocus(null); focus = you; this.renderer.camTarget.x = you.x; this.renderer.camTarget.z = you.y; }
    this.renderer.forceFollow = focus !== you;
    const pan = this.renderer.locked || this.renderer.forceFollow ? null : this.input.edgePan(this.renderer.width, this.renderer.height);
    this.renderer.frame(dt, w, focus, pan);
    this.labels.update(w, this.renderer, dt);
    if (w.me) this.hud.updateSelf(w.me);
    for (const p of this.pings) p.t -= dt;
    this.pings = this.pings.filter(p => p.t > 0);
    this.hud.drawMinimap(dt);
    if (this.rangeT > 0) { this.rangeT -= dt; if (this.rangeT <= 0) this.renderer.showRange(0, 0, 0); else if (you && w.me) this.renderer.showRange(you.x, you.y, w.me.st.rg + 0.6); }
    this.fps = this.fps * 0.95 + (1 / Math.max(dt, 0.001)) * 0.05;
    // Slow device: suggest lighter settings once (after 12s under 25 fps).
    this.slowT = this.fps < 25 ? (this.slowT || 0) + dt : 0;
    if (this.slowT > 12 && !this.perfHinted) { this.perfHinted = true; this.perfHint(); }
    if (this.settings.showFps) this.fpsEl.textContent = `${Math.round(this.fps)} fps · ${this.app.offline ? 'offline' : `${this.app.ping} ms`}`;
    else if (this.fpsEl.textContent) this.fpsEl.textContent = '';
  }

  /* Spectating / replays: free camera (edge pan, minimap) or follow a champion. */
  spectatorFrame(dt) {
    const w = this.world;
    w.update(dt);
    const followed = this.followId ? w.entities.get(this.followId) : null;
    const pan = followed ? null : this.input.edgePan(this.renderer.width, this.renderer.height);
    sfx.listener = followed || { x: this.renderer.camTarget.x, y: this.renderer.camTarget.z };
    this.renderer.frame(dt, w, followed, pan);
    this.labels.update(w, this.renderer, dt);
    this.hud.drawMinimap(dt);
  }

  issueMove(attackMove = false, quiet = false) {
    const p = this.cursorWorld();
    const target = this.hover && this.hover.tm !== this.world.team ? this.hover : null;
    this.send({ t: 'mv', x: round2(p.x), y: round2(p.y), id: target ? target.id : undefined, a: attackMove ? 1 : 0 });
    // Start moving right away (attack orders stop short of the target, so only plain moves are predicted).
    if (!target && !attackMove) this.world.predictMove(p.x, p.y); else this.world.predict = null;
    if (!quiet) this.renderer.showMoveMarker(p.x, p.y, !!target || attackMove);
    // Trace the route (same pathfinder as the server) for plain moves.
    const me = this.world.you();
    if (!target && me) {
      this.pathfinder ||= new Pathfinder(this.world.map);
      const route = this.pathfinder.find(me.x, me.y, p.x, p.y);
      if (route.length) this.renderer.showPath([{ x: me.x, y: me.y }, ...route]); else this.renderer.clearPath();
    } else this.renderer.clearPath();
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
      // Champions first (the weakest within reach), then the nearest minion or monster.
      const s = (e.kind === 'hero' ? 0 : 100) + d + (e.kind === 'hero' && e.mh ? (e.hp / e.mh) * 6 : 0);
      if (s < bs) { bs = s; best = e; }
    }
    return best;
  }

  castKey(slot, aimed = null) {
    sfx.init();
    const you = this.world.you();
    let p, id;
    if (aimed) p = aimed; // touch drag-to-aim
    else if (this.input.isTouch && you) {
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
    if (me && me.rk[slot] === 0) {
      // Phones: tapping a locked ability learns it when a point is free.
      if (this.input.isTouch && canRankUp({ points: me.pts, ranks: me.rk, level: me.lv }, slot)) { this.send({ t: 'lvl', sl: slot }); this.sfxSkill(); return; }
      return this.ui.toast(this.input.isTouch ? 'Not learned yet: tap its gold + when you level up.' : 'Level this ability first (Ctrl + key or the + button).', 'warn', 1500);
    }
    if (this.input.isTouch) navigator.vibrate?.(12);
    // Play the cast animation immediately when the cast will succeed.
    const info = this.myChamp(), rank = me ? me.rk[slot] : 0;
    if (me && rank > 0 && (me.cd[slot] || 0) <= 0 && !me.dead && me.mp >= (info?.abilities[slot]?.mana[Math.min(info.abilities[slot].mana.length - 1, rank - 1)] || 0)) {
      this.renderer.trigger(this.world.youId, slot === 'r' ? 'ult' : 'cast');
      this.renderer.localCastAt = performance.now();
      this.world.predict = null;
    }
    this.send({ t: 'cast', sl: slot, x: round2(p.x), y: round2(p.y), id });
  }

  /** Watch a teammate (top-left frames): click again, press Space or pick yourself to come back. */
  setCamFocus(id) {
    this.camFocusId = id && id !== this.world.youId && this.camFocusId !== id ? id : null;
    this.hud.markFocused(this.camFocusId);
  }

  toggleLock(v) {
    this.renderer.locked = v === undefined ? !this.renderer.locked : v;
    this.settings.cameraLock = this.renderer.locked;
    this.app.saveSettings();
    this.ui.toast(this.renderer.locked ? 'Camera locked' : 'Camera unlocked — edge-pan or click the minimap', 'info', 1500);
  }

  action(a, ev) {
    sfx.init();
    if (this.spectating && !['score', 'scoreUp', 'zoom', 'escape', 'help', 'chat'].includes(a)) return; // watching: camera and panels only
    switch (a) {
      case 'rclick': this.rmbT = 0.15; return this.issueMove(false);
      case 'lclick': if (this.amovePending) { this.amovePending = false; this.issueMove(true); } return;
      case 'amove': this.issueMove(true); this.rangeT = 1.2; return;
      case 'stop': this.world.predict = null; return this.send({ t: 'stop' });
      case 'q': case 'w': case 'e': case 'r': case 'd': case 'f': case 'ward': return this.castKey(a);
      case 'level': this.sfxSkill(); return this.send({ t: 'lvl', sl: ev });
      case 'recall': return this.send({ t: 'recall' });
      case 'item0': case 'item1': case 'item2': case 'item3': case 'item4': case 'item5': return this.send({ t: 'use', slot: Number(a.slice(4)) });
      case 'shop': return this.panels.toggle('shop');
      case 'score': return this.panels.open('score');
      case 'scoreUp': if (this.panels.isOpen('score')) this.panels.close(); return;
      case 'lock': return this.toggleLock();
      case 'chat': return this.chat.focus();
      case 'help': return this.panels.toggle('help');
      case 'emotes': return this.emotes?.toggle();
      case 'ping': { const p = this.cursorWorld(); const k = ev.ctrlKey ? 'danger' : ev.shiftKey ? 'help' : 'go'; return this.send({ t: 'mping', x: round2(p.x), y: round2(p.y), k }); }
      case 'zoom': this.renderer.zoom = Math.max(0.65, Math.min(1.5, this.renderer.zoom + ev * 0.07)); return;
      case 'escape': if (this.panels.current && this.panels.current !== 'end') return this.panels.close(); return this.panels.open('settings');
      default:
    }
  }

  onFx(ev) {
    if (this.muteFx) return; // replay seeking
    this.tutorial?.onEvent(ev);
    const w = this.world;
    this.renderer.handleFx(ev, w);
    const you = w.youId;
    const ent = ev.id ? w.entities.get(ev.id) : null;
    const at = (key, opts) => (ent ? sfx.playAt(key, ent.x, ent.y, opts) : ev.x !== undefined ? sfx.playAt(key, ev.x, ev.y, opts) : sfx.play(key, opts));
    switch (ev.e) {
      case 'dmg': {
        const mine = ev.s === you, onMe = ev.id === you;
        const e = w.entities.get(ev.id);
        if (onMe) { this.labels.floatText(ev.x, ev.y, `-${ev.v}`, 'hurt'); sfx.play('hurt', { gap: 0.25, vol: Math.min(1, 0.4 + ev.v / 150) }); }
        else if (mine) {
          this.labels.floatText(ev.x, ev.y, ev.c ? `${ev.v}!` : `${ev.v}`, ev.c ? 'crit' : ev.t === 'm' ? 'magic' : ev.t === 't' ? 'true' : 'dmg', ev.c ? 1.3 : 1);
          sfx.play(ev.c ? 'hit_crit' : ev.t === 'm' ? 'hit_magic' : 'hit_physical', { gap: 0.08, vol: 0.8 });
        } else if (e && e.kind === 'hero') { this.labels.floatText(ev.x, ev.y, `${ev.v}`, 'other', 0.8); sfx.playAt(ev.t === 'm' ? 'hit_magic' : 'hit_physical', ev.x, ev.y, { gap: 0.12, vol: 0.5 }); }
        break;
      }
      case 'heal': if (ev.v >= 10) this.labels.floatText(ev.x, ev.y, `+${ev.v}`, 'heal'); break;
      case 'healfx': at('heal'); break;
      case 'shield': if (ev.id === you) sfx.play('shield', { gap: 0.3 }); break;
      case 'gold': this.labels.floatText(ev.x, ev.y, `+${ev.v}`, 'gold', 0.85); sfx.play('gold', { gap: 0.12 }); break;
      case 'levelup': {
        if (ev.id === you) sfx.play('levelup');
        const e = w.entities.get(ev.id);
        if (e) { e.l = ev.l; this.labels.levelChanged(e); }
        break;
      }
      case 'atk': {
        if (!ent) break;
        const key = ent.kind === 'hero' ? `atk_${ent.c}` : 'atk_sword'; // every champion has its own attack sound
        at(key, { gap: ent.kind === 'hero' ? 0.05 : 0.15, vol: ent.kind === 'hero' ? (ev.id === you ? 1 : 0.7) : 0.25, rate: ent.kind === 'minion' ? 1.2 : 0.95 + Math.random() * 0.1 });
        break;
      }
      case 'emote': this.labels.bubble(ev.id, EMOTE_ICON[ev.k] || '🙂'); at('ui_notify', { gap: 0.5, vol: 0.4 }); break;
      case 'cast':
        at(`${ev.c}_${ev.sl}`, { gap: 0.1, vol: ev.id === you ? 1 : 0.8 });
        if (ev.sl === 'r') this.champLine(ev.c, 'ult', ev.id, 0);
        break;
      case 'kill': if (ev.v === you && ev.k) { this.deathCamId = ev.k; this.setCamFocus(null); } break; // watch who killed you
      case 'summ': at(SPELL_SOUND[ev.k] || 'blink', { gap: 0.2 }); break;
      case 'boom': case 'shock': case 'nova': case 'beam':
        // Abilities whose payoff lands after the cast (zone explosions, beams) have their own impact sound.
        if (ev.ab) at(`${ev.ab}_hit`, { gap: 0.15, vol: 0.9, range: 30 });
        break;
      case 'dash': at('dash', { gap: 0.2, vol: 0.8 }); break;
      case 'blink': at('blink', { gap: 0.3 }); break;
      case 'cc': if (ev.id === you && ev.k !== 'slow') sfx.play('stun', { gap: 0.5 }); break;
      case 'tshot': at('tower_shot', { gap: 0.2 }); break;
      case 'potion': sfx.play('potion'); break;
      case 'ward': at('ward'); break;
      case 'trap': at('trap'); break;
      case 'death': {
        const key = { hero: 'death_hero', minion: 'death_minion', tower: 'tower_destroyed', spire: 'spire_destroyed', core: 'core_destroyed', monster: 'monster_roar' }[ev.k];
        if (key) sfx.playAt(key, ev.x, ev.y, { gap: ev.k === 'minion' ? 0.15 : 0.1, range: ev.k === 'tower' || ev.k === 'spire' || ev.k === 'core' ? 80 : 24 });
        break;
      }
      case 'buy': sfx.play('ui_buy'); this.panels.refresh(['shop']); break;
      case 'nomana': this.ui.toast('Not enough mana', 'warn', 900); break;
      case 'kill': {
        this.hud.feed(ev.k, ev.v, ev.a);
        const victim = this.players.get(ev.v);
        // The champions speak after the announcer's callout.
        const killer = this.players.get(ev.k);
        if (killer) this.champLine(killer.champ, 'kill', ev.k, 1300);
        if (victim && ev.v === you) this.champLine(victim.champ, 'death', ev.v, 1300);
        const line = ev.v === you ? 'vo_you_slain' : ev.k === you ? 'vo_you_killed' : victim && victim.team === w.team ? 'vo_ally_slain' : 'vo_enemy_slain';
        // Defer so a bigger callout from the same tick (first strike, multi-kill) can win.
        this.pendingKillLine = { key: line, priority: ev.v === you || ev.k === you ? 3 : 1 };
        setTimeout(() => { if (this.pendingKillLine) { sfx.announce(this.pendingKillLine.key, this.pendingKillLine.priority); this.pendingKillLine = null; } }, 60);
        break;
      }
      case 'ann': {
        this.hud.announce(ev.text, ev.k);
        this.chat.system(ev.text, 'event');
        const vo = this.announcerLine(ev);
        if (vo) { this.pendingKillLine = null; sfx.announce(vo.key, vo.priority); }
        if (ev.key === 'wyrm_spawn') sfx.play('wyrm_roar', { late: true });
        if (ev.key === 'titan_spawn') sfx.play('titan_roar', { late: true });
        break;
      }
      case 'ping': this.pings.push({ x: ev.x, y: ev.y, t: 3, color: PING_COLORS[ev.k] || '#22c55e' }); sfx.play(`ping_${ev.k}`, { gap: 0.3 }); break;
      case 'respawn': if (ev.id === you) sfx.play('respawn'); break;
      case 'recallStart': if (ev.id === you) this.recallSrc = sfx.play('recall_channel'); else at('recall_channel', { vol: 0.5 }); break;
      case 'recall': at('recall_done'); break;
      default:
    }
  }

  /** Maps a server announcement to an announcer voice line from this team's point of view. */
  announcerLine(ev) {
    const mine = ev.team === this.world.team;
    switch (ev.key) {
      case 'first_strike': return { key: 'vo_first_strike', priority: 6 };
      case 'streak_end': return { key: 'vo_streak_end', priority: 4 };
      case 'team_wipe': return { key: 'vo_team_wipe', priority: 7 };
      case 'tower': return { key: mine ? 'vo_enemy_tower' : 'vo_ally_tower', priority: 4 };
      case 'spire': return { key: mine ? 'vo_enemy_spire' : 'vo_ally_spire', priority: 5 };
      case 'spire_restored': return { key: 'vo_spire_restored', priority: 2 };
      case 'wyrm': return { key: mine ? 'vo_ally_wyrm' : 'vo_enemy_wyrm', priority: 5 };
      case 'titan': return { key: mine ? 'vo_ally_titan' : 'vo_enemy_titan', priority: 5 };
      case 'wyrm_spawn': return { key: 'vo_wyrm_spawn', priority: 3 };
      case 'titan_spawn': return { key: 'vo_titan_spawn', priority: 3 };
      default:
        if (ev.key && /^multi[2-5]$/.test(ev.key)) return { key: `vo_${ev.key}`, priority: 6 + Number(ev.key.slice(5)) / 10 };
        if (ev.key && /^streak[3-8]$/.test(ev.key)) return { key: `vo_${ev.key}`, priority: 4 };
        return null;
    }
  }

  sfxSkill() { if (this.world.me && this.world.me.pts > 0) sfx.play('ui_skill'); }

  near(ev) { const y = this.world.you(); return !y || ev.x === undefined || dist(y.x, y.y, ev.x, ev.y) < 18; }

  /** A champion voice line: full volume for your own champion, positional for others. */
  champLine(champ, kind, id, delay) {
    if (!champ) return;
    setTimeout(() => {
      const key = `cv_${champ}_${kind}`, opts = { bus: 'voice', gap: 1.5, late: true };
      if (id === this.world.youId) return sfx.play(key, opts);
      const e = this.world.entities.get(id);
      if (e) sfx.playAt(key, e.x, e.y, { ...opts, vol: 0.85, range: 30 });
    }, delay);
  }

  /** Auto-level (default on phones): ultimate first, then the lowest-ranked basic ability. */
  autoLevel(dt) {
    const me = this.world.me;
    const on = this.settings.autoLevel ?? this.input.isTouch;
    if (!on || !me || !me.pts || this.spectating) return;
    this.autoLvlT = (this.autoLvlT || 0) - dt;
    if (this.autoLvlT > 0) return;
    this.autoLvlT = 0.6;
    const st = { points: me.pts, ranks: me.rk, level: me.lv };
    const slot = canRankUp(st, 'r') ? 'r' : ['q', 'w', 'e'].filter(s => canRankUp(st, s)).sort((a, b) => me.rk[a] - me.rk[b])[0];
    if (slot) this.send({ t: 'lvl', sl: slot });
  }

  perfHint() {
    if (this.settings.models === false && this.settings.quality === 'low') return;
    this.ui.prompt('The game is running slowly on this device. Switch to lighter graphics (Low quality, simple models)?', () => {
      this.setSetting('quality', 'low');
      this.setSetting('models', false);
      this.ui.toast('Lighter graphics on. Detailed models return next match if you turn them back on in Settings.', 'info', 4500);
    }, null, 20);
  }

  setSetting(k, v) {
    this.settings[k] = v;
    this.app.saveSettings();
    if (k === 'quality') this.renderer.setQuality(v);
    if (k === 'models') setModelsEnabled(v);
    if (k === 'quality') setLowDetail(v === 'low' || this.input.isTouch);
    if (k === 'volume') sfx.setVolume(v);
    if (k === 'musicVolume') sfx.setMusicVolume(v);
  }

  /** Reconnected to the same match: rebuild the world from fresh snapshots, keep everything else. */
  resync(m) {
    this.match = m;
    this.players = new Map(m.players.map(p => [p.id, p]));
    this.world.setMatch(this.world.valley, m.you, m.team);
    this.world.predict = null;
  }

  quit() {
    if (this.match.replay) return this.app.endReplay();
    if (this.endResult || this.spectating) this.send({ t: 'leave' });
    else this.send({ t: 'abandon' });
  }
}

function round2(v) { return Math.round(v * 100) / 100; }

const SPELL_SOUND = { blink: 'blink', mend: 'heal', scorch: 'sp_scorch', strike: 'sp_strike', haste: 'sp_haste', bulwark: 'shield' };
const MATCH_SOUNDS = ['hurt', 'hit_physical', 'hit_magic', 'hit_crit', 'gold', 'atk_sword', 'death_minion', 'tower_shot', 'levelup', 'vo_minions', 'vo_ally_slain', 'vo_enemy_slain', 'vo_you_slain', 'vo_you_killed', 'vo_first_strike'];
