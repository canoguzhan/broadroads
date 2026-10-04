/* Heads-up display. */
import { h, $, clear, fmt, timeStr } from './dom.js';
import { abilityInfo, seasonalClass, xpToNext, MAX_LEVEL, SLOTS } from '../../shared/classes.js';
import { TILE } from '../../shared/tiles.js';
import { zoneAt } from '../../shared/worldmap.js';
import { F } from '../../shared/constants.js';
import { ARENA_MODES } from '../../shared/sim/arena.js';

const KEY_LABELS = { primary: 'LMB', dash: 'SPC', q: 'Q', e: 'E', r: 'R' };
export const CLASS_ICON = { paladin: '🛡️', gunner: '🏹', arcanist: '🔮' };

const MINI_COLORS = {
  [TILE.WALL]: '#5d564d', [TILE.FLOOR]: '#3d3846', [TILE.ROAD]: '#a08865', [TILE.GRASS]: '#3c6a2d', [TILE.WATER]: '#2d6aa0',
  [TILE.PLAZA]: '#9d9484', [TILE.BRIDGE]: '#7a5a38', [TILE.TREE]: '#1f3d19', [TILE.ROCK]: '#555', [TILE.PILLAR]: '#555', [TILE.SAND]: '#b9a06a', [TILE.RUG]: '#7a2a35',
};

export class Hud {
  constructor(game) {
    this.game = game;
    this.root = $('#hud');
    this.build();
    this.miniT = 0;
    this.explored = null;
    this.bigMap = false;
  }

  build() {
    const g = this.game;
    clear(this.root);
    // Player frame.
    this.pf = {
      portrait: h('div.pf-portrait'),
      name: h('div.pf-name'),
      level: h('div.pf-level'),
      hp: h('div.bar-fill.hp'), hpText: h('span.bar-text'),
      mp: h('div.bar-fill.mp'), mpText: h('span.bar-text'),
      xp: h('div.bar-fill.xp'), xpText: h('span.bar-text'),
      buffs: h('div.pf-buffs'),
      gold: h('div.pf-gold'),
    };
    const frame = h('div.player-frame', {},
      this.pf.portrait,
      h('div.pf-main', {},
        h('div.pf-head', {}, this.pf.name, this.pf.level),
        h('div.bar.bar-hp', {}, this.pf.hp, this.pf.hpText),
        h('div.bar.bar-mp', {}, this.pf.mp, this.pf.mpText),
        h('div.bar.bar-xp', {}, this.pf.xp, this.pf.xpText),
        h('div.pf-row', {}, this.pf.gold, this.pf.buffs)));
    this.partyEl = h('div.party-frames');
    this.root.append(h('div.hud-tl', {}, frame, this.partyEl));

    // Top centre: zone + bars.
    this.zoneName = h('div.zone-name');
    this.zoneSub = h('div.zone-sub');
    this.bossBar = h('div.boss-bar', { hidden: true }, h('div.boss-name'), h('div.boss-track', {}, h('div.boss-fill')), h('div.boss-text'));
    this.arenaBar = h('div.arena-bar', { hidden: true });
    this.root.append(h('div.hud-tc', {}, h('div.zone-banner', {}, this.zoneName, this.zoneSub), this.arenaBar, this.bossBar));

    // Top right: minimap + menu.
    this.mini = h('canvas.minimap', { width: 200, height: 200 });
    this.mini.addEventListener('click', () => this.toggleMap());
    const menu = h('div.menu-buttons', {},
      ...[['inventory', '🎒', 'Inventory (I)'], ['character', '👤', 'Character (C)'], ['social', '👥', 'Social & Party (P)'], ['leaderboard', '🏆', 'Leaderboards (L)'], ['help', '❔', 'Controls (H)'], ['settings', '⚙️', 'Settings (Esc)']]
        .map(([id, icon, title]) => h('button.icon-btn', { title, 'aria-label': title, onclick: () => g.panels.toggle(id) }, icon)));
    this.feedEl = h('div.kill-feed');
    this.root.append(h('div.hud-tr', {}, h('div.minimap-wrap', {}, this.mini, h('div.minimap-hint', { text: 'M: map' })), menu, this.feedEl));

    // Right: tracker.
    this.tracker = h('div.tracker');
    this.root.append(h('div.hud-r', {}, this.tracker));

    // Bottom centre: action bar.
    this.slots = {};
    const bar = h('div.action-bar');
    for (const slot of SLOTS) {
      const cd = h('div.slot-cd');
      const cdText = h('div.slot-cd-text');
      const el = h('button.slot', { 'data-slot': slot, onclick: () => g.cast(slot), onmouseenter: ev => this.slotTip(ev, slot), onmouseleave: () => g.ui.hideTip() },
        h('div.slot-icon'), cd, cdText, h('div.slot-key', { text: KEY_LABELS[slot] }), h('div.slot-mana'));
      this.slots[slot] = { el, cd, cdText };
      bar.append(el);
    }
    bar.append(h('div.bar-sep'));
    this.potEls = {};
    for (const [k, key, icon] of [['hp', '1', '❤️'], ['mp', '2', '💧']]) {
      const count = h('div.slot-count');
      const cd = h('div.slot-cd');
      const el = h('button.slot.slot-pot', { onclick: () => g.potion(k), title: k === 'hp' ? 'Health Potion (1)' : 'Mana Potion (2)' }, h('div.slot-icon', { text: icon }), cd, count, h('div.slot-key', { text: key }));
      this.potEls[k] = { el, count, cd };
      bar.append(el);
    }
    this.root.append(h('div.hud-bc', {}, bar));

    // Interaction prompt, death overlay, countdown.
    this.prompt = h('div.interact-prompt', { hidden: true });
    this.death = h('div.death-overlay', { hidden: true });
    this.countdown = h('div.countdown', { hidden: true });
    this.root.append(this.prompt, this.death, this.countdown);

    // Chat container (filled by Chat).
    this.chatRoot = h('div.hud-bl');
    this.root.append(this.chatRoot);

    // Touch controls.
    if (g.input.isTouch) this.buildTouch();
  }

  buildTouch() {
    const g = this.game;
    const knob = h('div.joy-knob');
    const base = h('div.joy-base', {}, knob);
    g.input.bindJoystick(base, knob);
    const btn = (label, cls, onDown, onUp) => {
      const b = h(`button.touch-btn.${cls}`, { text: label });
      b.addEventListener('touchstart', e => { e.preventDefault(); onDown(); }, { passive: false });
      if (onUp) b.addEventListener('touchend', e => { e.preventDefault(); onUp(); });
      return b;
    };
    const atk = btn('⚔️', 'tb-attack', () => { g.input.touch.attack = true; }, () => { g.input.touch.attack = false; });
    this.root.append(h('div.touch-controls', {}, base,
      h('div.touch-cluster', {}, atk, btn('💨', 'tb-dash', () => g.cast('dash')), btn('Q', 'tb-q', () => g.cast('q')), btn('E', 'tb-e', () => g.cast('e')), btn('R', 'tb-r', () => g.cast('r')), btn('✋', 'tb-use', () => g.interactNearest()))));
    this.root.classList.add('touch');
  }

  slotTip(ev, slot) {
    const c = this.game.char;
    if (!c) return;
    const a = abilityInfo(c.cls, slot, this.game.theme);
    this.game.ui.showTip(ev.currentTarget, h('div', {},
      h('div.tip-title', { text: `${a.icon} ${a.name}` }),
      h('div.tip-sub', { text: `${KEY_LABELS[slot]} · ${a.cd}s cooldown${a.mana ? ` · ${a.mana} mana` : ''}` }),
      h('div.tip-desc', { text: a.desc })));
  }

  setCharacter(c) {
    const sc = seasonalClass(c.cls, this.game.theme);
    this.pf.portrait.textContent = CLASS_ICON[c.cls];
    this.pf.name.textContent = c.name;
    this.pf.level.textContent = `Lv ${c.level} ${sc.name}`;
    const need = xpToNext(c.level);
    const pct = c.level >= MAX_LEVEL ? 100 : (c.xp / need) * 100;
    this.pf.xp.style.width = `${pct}%`;
    this.pf.xpText.textContent = c.level >= MAX_LEVEL ? 'MAX LEVEL' : `${fmt(c.xp)} / ${fmt(need)} XP`;
    this.pf.gold.textContent = `🪙 ${fmt(c.gold)}`;
    for (const slot of SLOTS) {
      const a = abilityInfo(c.cls, slot, this.game.theme);
      const s = this.slots[slot];
      s.el.querySelector('.slot-icon').textContent = a.icon;
      s.el.querySelector('.slot-mana').textContent = a.mana ? a.mana : '';
      s.mana = a.mana;
    }
    this.potEls.hp.count.textContent = c.potions.hp;
    this.potEls.mp.count.textContent = c.potions.mp;
  }

  updateSelf(me) {
    if (!me) return;
    const hpPct = Math.max(0, me.hp / me.mhp) * 100;
    this.pf.hp.style.width = `${hpPct}%`;
    this.pf.hpText.textContent = `${Math.max(0, me.hp)} / ${me.mhp}`;
    this.pf.mp.style.width = `${(me.mp / me.mmp) * 100}%`;
    this.pf.mpText.textContent = `${me.mp} / ${me.mmp}`;
    this.pf.hp.classList.toggle('low', hpPct < 30);
    const cdMax = this.game.cooldownMax || {};
    SLOTS.forEach((slot, i) => {
      const s = this.slots[slot];
      const left = me.cd[i];
      const max = cdMax[slot] || 1;
      if (left > 0.05) {
        s.cd.style.background = `conic-gradient(rgba(0,0,0,0.72) ${(left / max) * 360}deg, transparent 0deg)`;
        s.cdText.textContent = left >= 1 ? Math.ceil(left) : left.toFixed(1);
      } else if (s.cdText.textContent) {
        s.cd.style.background = '';
        s.cdText.textContent = '';
      }
      s.el.classList.toggle('no-mana', me.mp < (s.mana || 0));
    });
    for (const k of ['hp', 'mp']) {
      const p = this.potEls[k];
      p.cd.style.background = me.pot > 0 ? `conic-gradient(rgba(0,0,0,0.72) ${(me.pot / 8) * 360}deg, transparent 0deg)` : '';
    }
    const buffs = me.b.filter(([k]) => k !== 'invuln').map(([k, t]) => `${BUFF_ICONS[k] || '✨'}${Math.ceil(t)}`).join(' ');
    if (this.pf.buffs.textContent !== buffs) this.pf.buffs.textContent = buffs;
    this.updateDeath(me);
  }

  updateDeath(me) {
    const g = this.game;
    const kind = g.world.zone?.kind;
    if (!me.dead) { if (!this.death.hidden) this.death.hidden = true; return; }
    this.death.hidden = false;
    const key = `${kind}|${Math.ceil(me.rt)}|${Math.round(me.rv * 10)}|${g.world.meta?.phase}`;
    if (this.death._key === key) return;
    this.death._key = key;
    clear(this.death);
    if (kind === 'world') {
      this.death.append(h('h2', { text: 'You have fallen' }), h('p', { text: 'An ally can revive you by standing beside you.' }),
        h('button.btn.btn-primary', { disabled: me.rt > 0, onclick: () => g.send({ t: 'respawn' }) }, me.rt > 0 ? `Respawn in ${Math.ceil(me.rt)}` : 'Respawn in Town'));
    } else if (kind === 'dungeon') {
      this.death.append(h('h2', { text: 'You are down!' }),
        h('p', { text: g.world.meta?.mode === 'party' ? 'Stand-by allies can revive you — they need to stand next to you.' : 'Your solo run has ended.' }),
        me.rv > 0 ? h('div.revive-track', {}, h('div.revive-fill', { style: { width: `${(me.rv / 3) * 100}%` } })) : null,
        g.world.meta?.mode === 'party' ? h('button.btn', { onclick: () => g.send({ t: 'respawn' }) }, 'Return to Town') : h('p.muted', { text: 'Returning to town…' }));
    } else {
      this.death.append(h('h2', { text: 'Defeated' }), h('p', { text: me.rt > 0 ? `Respawning in ${Math.ceil(me.rt)}…` : 'Waiting for the next round…' }));
    }
  }

  setZone(zone) {
    this.explored = zone.kind === 'dungeon' ? new Uint8Array(zone.map.w * zone.map.h) : null;
    this.miniBase = null;
    this.zoneKind = zone.kind;
    this.zoneName.textContent = zone.name;
    this.zoneSub.textContent = '';
    this.bossBar.hidden = true;
    this.arenaBar.hidden = zone.kind !== 'arena';
    clear(this.feedEl);
  }

  updateZoneBanner(pos, me) {
    const z = this.game.world.zone;
    if (!z || z.kind !== 'world' || !pos) return;
    const zone = zoneAt(pos.x, pos.y);
    const name = zone.name;
    const sub = me && me.safe ? '🛡️ Safe Zone' : zone.levels ? `Monsters Lv ${zone.levels[0]}–${zone.levels[1]}` : '';
    if (this.zoneName.textContent !== name) {
      this.zoneName.textContent = name;
      this.zoneName.classList.remove('flash'); void this.zoneName.offsetWidth; this.zoneName.classList.add('flash');
    }
    if (this.zoneSub.textContent !== sub) this.zoneSub.textContent = sub;
  }

  setMeta(meta) {
    const g = this.game;
    const kind = g.world.zone?.kind;
    clear(this.tracker);
    if (kind === 'world') {
      const title = h('div.tr-title', { text: `🌍 Shard ${meta.shard} · ${meta.players} online here` });
      this.tracker.append(title);
      if (meta.boss) {
        this.showBoss('Broadroad Behemoth', meta.boss.hp, meta.boss.mhp);
        this.tracker.append(h('div.tr-line.tr-alert', { text: '🔥 World Boss active in the south-east wastes!' }));
      } else {
        this.bossBar.hidden = true;
        this.tracker.append(h('div.tr-line', { text: `🔥 World boss in ${timeStr(meta.bossIn)}` }));
      }
    } else if (kind === 'dungeon') {
      this.zoneName.textContent = `${meta.mode === 'solo' ? 'Solo' : 'Party'} Dungeon`;
      this.zoneSub.textContent = `Floor ${meta.floor}${meta.bossFloor ? ' · Guardian Floor' : ''}`;
      this.tracker.append(
        h('div.tr-title', { text: `🌀 Floor ${meta.floor}` }),
        h('div.tr-line', { text: `☠️ ${meta.left} monsters remain · ${meta.kills} slain` }),
        h('div.tr-line', { text: meta.stairsOpen ? '🪜 Stairs are open — find them to descend' : '🔒 Defeat the guardian to unseal the stairs' }),
        h('button.btn.btn-sm', { onclick: () => g.send({ t: 'dungeon', op: 'leave' }) }, 'Leave Dungeon'));
      if (meta.boss) this.showBoss(meta.boss.name, meta.boss.hp, meta.boss.mhp); else this.bossBar.hidden = true;
    } else if (kind === 'arena') {
      this.renderArena(meta);
    }
    if (g.queue && g.queue.state === 'searching') {
      this.tracker.append(h('div.tr-queue', {},
        h('span', { text: `⚔️ Searching: ${ARENA_MODES[g.queue.mode]?.name || g.queue.mode} · ${timeStr(g.queue.since || 0)}` }),
        h('button.btn.btn-sm', { onclick: () => g.send({ t: 'arena', op: 'cancel' }) }, 'Cancel')));
    }
  }

  renderArena(meta) {
    const g = this.game;
    clear(this.arenaBar);
    const cfg = ARENA_MODES[meta.mode];
    let score;
    if (meta.mode === 'duel') score = `${meta.roundWins.A} – ${meta.roundWins.B}`;
    else if (meta.mode === 'team') score = `${meta.scores.A} – ${meta.scores.B}`;
    else {
      const me = meta.board.find(r => r.id === g.world.youId);
      score = `${me ? me.kills : 0} / ${meta.killTarget} kills`;
    }
    this.arenaBar.append(
      h('div.ab-mode', { text: `${cfg.name}${meta.ranked ? ' · Ranked' : ''}` }),
      h('div.ab-score', {}, meta.mode !== 'ffa' ? h('span.team-a', { text: 'BLUE' }) : null, h('b', { text: score }), meta.mode !== 'ffa' ? h('span.team-b', { text: 'RED' }) : null),
      h('div.ab-time', { text: meta.mode === 'duel' ? `Round ${meta.round} · ${timeStr(meta.timeLeft)}` : timeStr(meta.timeLeft) }));
    this.countdown.hidden = !(meta.phase === 'prep' || meta.phase === 'roundEnd');
    if (!this.countdown.hidden) this.countdown.textContent = meta.phase === 'prep' ? (meta.phaseT > 0 ? meta.phaseT : 'FIGHT!') : `Round ${meta.round} over`;
    this.tracker.append(h('div.tr-title', { text: '⚔️ Scoreboard (Tab)' }), this.scoreTable(meta, false));
    if (meta.phase === 'end' || meta.result) this.countdown.hidden = true;
  }

  scoreTable(meta, full) {
    const g = this.game;
    const rows = [...meta.board].sort((a, b) => (a.team > b.team ? 1 : a.team < b.team ? -1 : 0) || b.kills - a.kills);
    return h(`table.score-table${full ? '.full' : ''}`, {},
      h('tr', {}, h('th', { text: 'Player' }), h('th', { text: 'K' }), h('th', { text: 'D' })),
      ...rows.map(r => h(`tr${r.id === g.world.youId ? '.me' : ''}${meta.mode !== 'ffa' ? `.t-${r.team}` : ''}`, {},
        h('td', { text: `${CLASS_ICON[r.cls] || ''} ${r.name}${r.bot ? ' 🤖' : ''}` }), h('td', { text: r.kills }), h('td', { text: r.deaths }))));
  }

  showBoss(name, hp, mhp) {
    this.bossBar.hidden = false;
    this.bossBar.querySelector('.boss-name').textContent = name;
    this.bossBar.querySelector('.boss-fill').style.width = `${Math.max(0, hp / mhp) * 100}%`;
    this.bossBar.querySelector('.boss-text').textContent = `${fmt(hp)} / ${fmt(mhp)}`;
  }

  setParty(party, youName) {
    clear(this.partyEl);
    if (!party) return;
    for (const m of party.members) {
      if (m.name === youName) continue;
      const pct = m.online ? Math.max(0, m.hp / m.mhp) * 100 : 0;
      this.partyEl.append(h(`div.party-member${m.online ? '' : '.offline'}${m.dead ? '.dead' : ''}`, { title: m.zone },
        h('div.pm-name', {}, party.leader === m.name ? '👑 ' : '', `${CLASS_ICON[m.cls] || ''} ${m.name}`, h('span.pm-lvl', { text: m.level ? ` ${m.level}` : '' })),
        h('div.bar.bar-hp.bar-sm', {}, h('div.bar-fill.hp', { style: { width: `${pct}%` } })),
        h('div.pm-zone', { text: m.online ? (m.dead ? '💀 Down' : m.zone) : 'Offline' })));
    }
  }

  setPrompt(text) {
    if (!text) { if (!this.prompt.hidden) this.prompt.hidden = true; return; }
    this.prompt.hidden = false;
    if (this.prompt.textContent !== text) this.prompt.textContent = text;
  }

  feed(k, v) {
    const row = h('div.feed-row', {}, h('b', { text: k }), ' ⚔️ ', h('span', { text: v }));
    this.feedEl.prepend(row);
    while (this.feedEl.children.length > 5) this.feedEl.lastChild.remove();
    setTimeout(() => row.remove(), 8000);
  }

  toggleMap() {
    this.bigMap = !this.bigMap;
    this.mini.classList.toggle('big', this.bigMap);
    this.mini.width = this.mini.height = this.bigMap ? 520 : 200;
    this.miniT = 0;
  }

  /* ---------------- minimap ---------------- */
  buildMiniBase(map) {
    const c = document.createElement('canvas');
    c.width = map.w; c.height = map.h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(map.w, map.h);
    const cache = {};
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        const t = map.get(x, y);
        const col = cache[t] || (cache[t] = hexToRgb(MINI_COLORS[t] || '#000'));
        const i = (y * map.w + x) * 4;
        img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2];
        img.data[i + 3] = t === TILE.VOID ? 0 : 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.miniBase = c;
    this.miniFog = this.explored ? document.createElement('canvas') : null;
    if (this.miniFog) {
      this.miniFog.width = map.w; this.miniFog.height = map.h;
      const f = this.miniFog.getContext('2d');
      f.fillStyle = '#000';
      f.fillRect(0, 0, map.w, map.h);
    }
  }

  revealAround(map, px, py) {
    if (!this.explored || !this.miniFog) return;
    const R = 9;
    const f = this.miniFog.getContext('2d');
    f.globalCompositeOperation = 'destination-out';
    for (let y = Math.floor(py - R); y <= py + R; y++) {
      for (let x = Math.floor(px - R); x <= px + R; x++) {
        if (!map.inBounds(x, y)) continue;
        const i = y * map.w + x;
        if (this.explored[i]) continue;
        if ((x - px) ** 2 + (y - py) ** 2 > R * R) continue;
        this.explored[i] = 1;
        f.fillRect(x, y, 1, 1);
      }
    }
    f.globalCompositeOperation = 'source-over';
  }

  drawMinimap(world, pos, dt) {
    this.miniT -= dt;
    if (this.miniT > 0 || !world.map || !pos) return;
    this.miniT = 0.15;
    const map = world.map;
    if (!this.miniBase) this.buildMiniBase(map);
    this.revealAround(map, pos.x, pos.y);
    const ctx = this.mini.getContext('2d');
    const W = this.mini.width;
    const zoneKind = world.zone.kind;
    // Tiles per minimap: the whole map when enlarged or small maps, a window otherwise.
    const span = this.bigMap || zoneKind === 'arena' ? Math.max(map.w, map.h) : zoneKind === 'dungeon' ? 56 : 64;
    const scale = W / span;
    const ox = this.bigMap || zoneKind === 'arena' ? 0 : pos.x - span / 2;
    const oy = this.bigMap || zoneKind === 'arena' ? 0 : pos.y - span / 2;
    ctx.fillStyle = '#07060a';
    ctx.fillRect(0, 0, W, W);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.miniBase, ox, oy, span, span, 0, 0, W, W);
    if (this.miniFog) ctx.drawImage(this.miniFog, ox, oy, span, span, 0, 0, W, W);
    const dot = (x, y, r, color, stroke) => {
      const sx = (x - ox) * scale, sy = (y - oy) * scale;
      if (sx < -5 || sy < -5 || sx > W + 5 || sy > W + 5) return;
      if (this.explored && !this.explored[Math.floor(y) * map.w + Math.floor(x)]) return;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
    };
    for (const e of world.entities.values()) {
      if (e.id === world.youId) continue;
      switch (e.kind) {
        case 'monster': if (!(e.fl & F.DEAD)) dot(e.x, e.y, e.b ? 6 : e.el ? 3.5 : 2.2, e.b ? '#ff2d55' : '#ef4444'); break;
        case 'player': dot(e.x, e.y, 3.5, e.fl & F.HOSTILE ? '#f43f5e' : e.fl & F.PARTY ? '#22c55e' : '#60a5fa', '#000'); break;
        case 'npc': dot(e.x, e.y, 4, '#facc15', '#000'); break;
        case 'portal': dot(e.x, e.y, 5, e.t === 'exit' ? '#38bdf8' : '#facc15', '#000'); break;
        case 'chest': if (!(e.fl & F.OPEN)) dot(e.x, e.y, 3, '#f59e0b'); break;
        case 'loot': dot(e.x, e.y, 2, '#fff'); break;
        default:
      }
    }
    if (zoneKind === 'world' && world.meta?.boss) dot(world.meta.boss.x, world.meta.boss.y, 7, '#ff2d55', '#fff');
    if (zoneKind === 'dungeon' && world.meta?.stairs) {
      const s = world.meta.stairs;
      if (this.explored[Math.floor(s.y) * map.w + Math.floor(s.x)]) dot(s.x, s.y, 5, '#facc15', '#000');
    }
    // Self arrow.
    const sx = (pos.x - ox) * scale, sy = (pos.y - oy) * scale;
    const you = world.you();
    const a = you ? you.f : 0;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(7, 0); ctx.lineTo(-5, -4.5); ctx.lineTo(-3, 0); ctx.lineTo(-5, 4.5); ctx.closePath();
    ctx.fillStyle = '#facc15';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.stroke();
    ctx.restore();
  }
}

const BUFF_ICONS = { stun: '💫', slow: '❄️', guard: '🛡️', haste: '⚡' };

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
