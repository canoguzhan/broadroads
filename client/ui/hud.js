/* MOBA heads-up display. */
import { h, $, clear, timeStr } from './dom.js';
import { TILE } from '../../shared/tiles.js';
import { F } from '../../shared/constants.js';
import { canRankUp, MAX_RANK } from '../../shared/moba/champions.js';
import { pic, setPic, champKey, abilityKey, canvasImage } from './icons.js';
import { nextBuy } from './build.js';

const SLOT_KEYS = { q: 'Q', w: 'W', e: 'E', r: 'R' };
const MONSTER_PORTRAIT = { mossback: 'mob_mossback', brute: 'mob_brute', stonehulk: 'mob_stonehulk', pebblet: 'mob_stonehulk', wolf: 'mob_wolf', pup: 'mob_wolf', duskwing: 'mob_bat', duskling: 'mob_bat', bogtoad: 'mob_toad', wyrm: 'mob_wyrm', titan: 'mob_titan' };
const MINI = { [TILE.TREE]: '#14200f', [TILE.ROAD]: '#8a7756', [TILE.GRASS]: '#33502a', [TILE.RIVER]: '#2a6a8a', [TILE.PLAZA]: '#5f6370', [TILE.RUG]: '#808594', [TILE.BUSH]: '#2c5a22' };
export const TEAM_CSS = { blue: '#3b82f6', red: '#ef4444', neutral: '#d4d4d4' };

export class Hud {
  constructor(game) {
    this.game = game;
    this.root = $('#hud');
    this.miniT = 0;
    this.build();
  }

  build() {
    const g = this.game;
    clear(this.root);
    this.root.hidden = false;
    // Top: score.
    this.scoreEl = h('div.m-score', {}, h('span.ms-blue'), h('span.ms-time'), h('span.ms-red'));
    this.objEl = h('div.m-obj');
    this.root.append(h('div.m-top', {}, this.scoreEl, this.objEl));
    // Top-left: ally frames.
    this.teamEl = h('div.m-team');
    this.root.append(this.teamEl);
    // Top-right: personal stats.
    this.kdaEl = h('div.m-kda');
    this.root.append(h('div.m-tr', {}, this.kdaEl, h('div.m-menu', {},
      h('button.icon-btn', { title: 'Shop (P)', onclick: () => g.panels.toggle('shop') }, pic('misc/shop', '🛒')),
      h('button.icon-btn', { title: 'Emotes & quick chat (G)', onclick: () => g.emotes?.toggle() }, '😊'),
      h('button.icon-btn', { title: 'Scoreboard (Tab)', onclick: () => g.panels.toggle('score') }, '📊'),
      h('button.icon-btn', { title: 'Camera lock (Y)', onclick: () => g.toggleLock() }, '🎥'),
      h('button.icon-btn', { title: 'Settings (Esc)', onclick: () => g.panels.toggle('settings') }, '⚙️'))));
    this.feedEl = h('div.m-feed');
    this.root.append(this.feedEl);

    // Bottom: champion bar.
    this.portrait = h('div.mb-portrait', {}, h('div.mb-icon'), h('div.mb-level'));
    this.xpRing = h('div.mb-xp');
    this.statsEl = h('div.mb-stats');
    this.abil = {};
    const abilRow = h('div.mb-abils');
    this.passiveEl = h('div.mb-passive');
    abilRow.append(this.passiveEl);
    for (const s of ['q', 'w', 'e', 'r']) {
      const up = h('button.mb-up', { title: `Level up (Ctrl+${SLOT_KEYS[s]})`, onclick: ev => { ev.stopPropagation(); g.send({ t: 'lvl', sl: s }); g.sfxSkill(); } }, '+');
      const el = h('div.mb-slot', { onclick: () => g.castKey(s), onmouseenter: ev => this.abilityTip(ev, s), onmouseleave: () => g.ui.hideTip() },
        h('div.mb-ic'), h('div.mb-cd'), h('div.mb-cdt'), h('div.mb-key', { text: SLOT_KEYS[s] }), h('div.mb-mana'), h('div.mb-pips'), up);
      this.abil[s] = { el, up, cd: el.querySelector('.mb-cd'), cdt: el.querySelector('.mb-cdt'), pips: el.querySelector('.mb-pips'), mana: el.querySelector('.mb-mana') };
      abilRow.append(el);
    }
    this.summ = {};
    const summRow = h('div.mb-summs');
    for (const k of ['d', 'f']) {
      const el = h('div.mb-slot.small', { onclick: () => g.castKey(k), onmouseenter: ev => this.summTip(ev, k), onmouseleave: () => g.ui.hideTip() }, h('div.mb-ic'), h('div.mb-cd'), h('div.mb-cdt'), h('div.mb-key', { text: k.toUpperCase() }));
      this.summ[k] = { el, cd: el.querySelector('.mb-cd'), cdt: el.querySelector('.mb-cdt') };
      summRow.append(el);
    }
    this.hpBar = h('div.mb-bar.hp', {}, h('div.mb-fill'), h('div.mb-shield'), h('span.mb-text'));
    this.mpBar = h('div.mb-bar.mp', {}, h('div.mb-fill'), h('span.mb-text'));
    this.itemEls = [];
    const items = h('div.mb-items');
    for (let i = 0; i < 6; i++) {
      const el = h('div.mb-item', { onclick: () => g.send({ t: 'use', slot: i }), onmouseenter: ev => this.itemTip(ev, i), onmouseleave: () => g.ui.hideTip() }, h('span.mb-iic'), h('span.mb-ik', { text: i + 1 }), h('span.mb-in'));
      this.itemEls.push(el);
      items.append(el);
    }
    this.wardEl = h('div.mb-item.ward', { title: 'Ward (T)', onclick: () => g.castKey('ward') }, h('span.mb-iic', {}, pic('misc/ward', '👁️')), h('span.mb-ik', { text: 'T' }), h('span.mb-in'));
    items.append(this.wardEl);
    this.goldEl = h('button.mb-gold', { onclick: () => g.panels.toggle('shop'), title: 'Shop (P)' });
    // One-click "buy the next item in my build".
    this.nextEl = h('button.mb-next', { onclick: () => this.buyNext(), onmouseenter: ev => this.next && g.ui.showTip(ev.currentTarget, g.panels.itemTooltip(this.next.id)), onmouseleave: () => g.ui.hideTip() },
      h('span.mn-ic'), h('span.mn-txt'));
    this.recallBtn = h('button.mb-recall', { onclick: () => g.send({ t: 'recall' }), title: 'Return home (B)' }, '🏠');
    this.root.append(h('div.m-bottom', {},
      this.statsEl,
      h('div.mb-left', {}, this.portrait, this.xpRing),
      h('div.mb-center', {}, h('div.mb-row', {}, abilRow, summRow), this.hpBar, this.mpBar),
      h('div.mb-right', {}, items, h('div.mb-goldrow', {}, this.nextEl, this.goldEl, this.recallBtn))));

    // Minimap.
    this.mini = h('canvas.m-mini', { width: 220, height: 220 });
    this.mini.addEventListener('mousedown', e => this.miniClick(e));
    this.mini.addEventListener('mousemove', e => { if (e.buttons === 1) this.miniClick(e); });
    this.mini.addEventListener('contextmenu', e => e.preventDefault());
    this.root.append(h('div.m-minimap', {}, this.mini));

    this.annEl = h('div.m-ann');
    this.deathEl = h('div.m-death', { hidden: true },
      h('div.md-ring'),
      h('div.md-label', { text: 'Respawning' }),
      h('div.md-tip'));
    this.deathEl.querySelector('.md-ring').innerHTML = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" class="md-bg"/><circle cx="50" cy="50" r="44" class="md-fg" pathLength="100"/></svg><b class="md-n"></b>';
    this.recapEl = h('div.m-recap', { hidden: true });
    this.recallEl = h('div.m-recall', { hidden: true }, h('div.mr-fill'), h('span', { text: 'Returning home…' }));
    this.root.append(this.annEl, this.deathEl, this.recapEl, this.recallEl);
    this.chatRoot = h('div.m-chat');
    this.root.append(this.chatRoot);
    if (g.input.isTouch) this.buildTouch();
  }

  buildTouch() {
    const g = this.game;
    const knob = h('div.joy-knob');
    const base = h('div.joy-base', {}, knob);
    g.input.bindJoystick(base, knob);
    const btn = (label, cls, down, up) => {
      const b = h(`button.touch-btn.${cls}`, {}, h('span.tb-ic', { text: label }), h('span.tb-cd'));
      b.addEventListener('touchstart', e => { e.preventDefault(); down(); }, { passive: false });
      if (up) b.addEventListener('touchend', e => { e.preventDefault(); up(); });
      return b;
    };
    // Abilities: tap to auto-target, or drag to aim (range ring + marker), release to cast.
    const aimBtn = (slot, cls) => {
      const b = h(`button.touch-btn.${cls}`, {}, h('span.tb-ic', { text: slot.toUpperCase() }), h('span.tb-cd'));
      if (slot !== 'd' && slot !== 'f') {
        // Level-up badge (phones have no ability bar with + buttons).
        const up = h('span.tb-up', { hidden: true, text: '+' });
        up.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); g.send({ t: 'lvl', sl: slot }); g.sfxSkill(); }, { passive: false });
        b.append(up);
      }
      let id = null, sx = 0, sy = 0, aim = null;
      const range = () => (slot === 'd' || slot === 'f' ? 6 : g.myChamp()?.abilities[slot]?.range || 6);
      const point = t => {
        const you = g.world.you();
        if (!you) return null;
        const dx = t.clientX - sx, dy = t.clientY - sy, d = Math.hypot(dx, dy);
        if (d < 14) return null;
        // Screen-space drag mapped onto the ground around the champion (camera looks north).
        const k = Math.min(1, d / 70) * range();
        return { x: you.x + (dx / d) * k, y: you.y + (dy / d) * k };
      };
      b.addEventListener('touchstart', e => {
        e.preventDefault();
        const t = e.changedTouches[0]; id = t.identifier; sx = t.clientX; sy = t.clientY; aim = null;
        const you = g.world.you();
        if (you) g.renderer.showRange(you.x, you.y, range());
      }, { passive: false });
      b.addEventListener('touchmove', e => {
        for (const t of e.changedTouches) if (t.identifier === id) { aim = point(t); g.renderer.showAim(aim); e.preventDefault(); }
      }, { passive: false });
      const end = e => {
        for (const t of e.changedTouches) if (t.identifier === id) {
          id = null;
          g.renderer.showRange(0, 0, 0); g.renderer.showAim(null);
          if (e.type === 'touchend') g.castKey(slot, aim);
        }
      };
      b.addEventListener('touchend', end);
      b.addEventListener('touchcancel', end);
      return b;
    };
    this.touchBtns = { q: aimBtn('q', 'tb-q'), w: aimBtn('w', 'tb-w'), e: aimBtn('e', 'tb-e'), r: aimBtn('r', 'tb-r'), d: aimBtn('d', 'tb-d'), f: aimBtn('f', 'tb-f') };
    this.root.append(h('div.touch-controls', {}, base, h('div.touch-cluster.moba', {},
      btn('⚔️', 'tb-attack', () => { g.input.touch.attack = true; }, () => { g.input.touch.attack = false; }),
      ...Object.values(this.touchBtns))));
    this.root.classList.add('touch');
  }

  /* ---------------- tooltips ---------------- */
  abilityTip(ev, s) {
    const info = this.game.myChamp();
    if (!info) return;
    const a = info.abilities[s];
    const rank = this.game.world.me?.rk[s] || 0;
    this.game.ui.showTip(ev.currentTarget, h('div', {},
      h('div.tip-title', {}, h('span.tip-ic', {}, pic(abilityKey(info.id, s), a.icon)), a.name),
      h('div.tip-sub', { text: `Rank ${rank}/${MAX_RANK[s]} · Cooldown ${a.cd.join('/')}s${a.mana.some(Boolean) ? ` · Mana ${a.mana.join('/')}` : ''}${a.range ? ` · Range ${a.range}` : ''}` }),
      h('div.tip-desc', { text: a.desc })));
  }

  summTip(ev, k) {
    const sp = this.game.world.me?.sm?.[k];
    const d = this.game.data.spells[sp];
    if (!d) return;
    this.game.ui.showTip(ev.currentTarget, h('div', {}, h('div.tip-title', {}, h('span.tip-ic', {}, pic(`spell/${sp}`, d.icon)), d.name), h('div.tip-sub', { text: `Cooldown ${d.cd}s` }), h('div.tip-desc', { text: d.desc })));
  }

  itemTip(ev, i) {
    const it = this.game.world.me?.it?.[i];
    if (!it) return;
    this.game.ui.showTip(ev.currentTarget, this.game.panels.itemTooltip(it.id, true));
  }

  /* ---------------- per-frame ---------------- */
  setChampion(info) {
    if (this.touchBtns) for (const s of ['q', 'w', 'e', 'r']) setPic(this.touchBtns[s].querySelector('.tb-ic'), abilityKey(info.id, s), s.toUpperCase());
    setPic(this.portrait.querySelector('.mb-icon'), champKey(info.id), info.icon);
    setPic(this.passiveEl, `passive/${info.id}`, '◆');
    this.passiveEl.title = `${info.passive.name}: ${info.passive.desc}`;
    for (const s of ['q', 'w', 'e', 'r']) setPic(this.abil[s].el.querySelector('.mb-ic'), abilityKey(info.id, s), info.abilities[s].icon);
  }

  updateSelf(me) {
    const g = this.game;
    if (!me) return;
    const info = g.myChamp();
    this.portrait.querySelector('.mb-level').textContent = me.lv;
    this.xpRing.style.setProperty('--xp', `${me.xpn ? (me.xp / me.xpn) * 360 : 360}deg`);
    const hpPct = Math.max(0, me.hp / me.mhp);
    const total = me.mhp + me.sh;
    this.hpBar.querySelector('.mb-fill').style.width = `${(me.hp / total) * 100}%`;
    this.hpBar.querySelector('.mb-shield').style.left = `${(me.hp / total) * 100}%`;
    this.hpBar.querySelector('.mb-shield').style.width = `${(me.sh / total) * 100}%`;
    this.hpBar.querySelector('.mb-text').textContent = `${me.hp} / ${me.mhp}${me.sh ? ` (+${me.sh})` : ''}`;
    this.hpBar.classList.toggle('low', hpPct < 0.3);
    this.mpBar.querySelector('.mb-fill').style.width = `${me.mmp ? (me.mp / me.mmp) * 100 : 0}%`;
    this.mpBar.querySelector('.mb-text').textContent = `${me.mp} / ${me.mmp}`;
    const st = me.st;
    const statsHtml = `⚔️${st.ad} 🔮${st.ap} 🛡️${st.ar} 🌀${st.mr} ⚡${st.as} 👟${Math.round(st.ms * 70)} 🎯${st.cr}% ⏳${st.ha}`;
    if (this.statsEl.textContent !== statsHtml) this.statsEl.textContent = statsHtml;
    for (const s of ['q', 'w', 'e', 'r']) {
      const a = this.abil[s];
      const rank = me.rk[s];
      const left = me.cd[s];
      const max = me.cdm[s] || 1;
      a.el.classList.toggle('locked', rank === 0);
      if (left > 0.05) { a.cd.style.background = `conic-gradient(rgba(0,0,0,0.75) ${(left / max) * 360}deg, transparent 0deg)`; a.cdt.textContent = left >= 1 ? Math.ceil(left) : left.toFixed(1); }
      else if (a.cdt.textContent) { a.cd.style.background = ''; a.cdt.textContent = ''; }
      const cost = info && rank ? info.abilities[s].mana[Math.min(info.abilities[s].mana.length - 1, rank - 1)] : 0;
      a.mana.textContent = cost ? cost : '';
      a.el.classList.toggle('nomana', rank > 0 && me.mp < cost);
      const pipKey = `${rank}/${MAX_RANK[s]}`;
      if (a.pips._k !== pipKey) { a.pips._k = pipKey; a.pips.innerHTML = ''; for (let i = 0; i < MAX_RANK[s]; i++) a.pips.append(h(`i${i < rank ? '.on' : ''}`)); }
      a.up.hidden = !canRankUp({ points: me.pts, ranks: me.rk, level: me.lv }, s);
    }
    if (this.touchBtns) {
      for (const k of ['q', 'w', 'e', 'r', 'd', 'f']) {
        const b = this.touchBtns[k], left = me.cd[k] || 0;
        b.classList.toggle('locked', (k in me.rk) && me.rk[k] === 0);
        const txt = left > 0.05 ? (left >= 1 ? Math.ceil(left) : left.toFixed(1)) : '';
        const cd = b.querySelector('.tb-cd'); if (cd.textContent !== String(txt)) cd.textContent = txt;
        b.classList.toggle('cooling', !!txt);
        const up = b.querySelector('.tb-up');
        if (up) up.hidden = !canRankUp({ points: me.pts, ranks: me.rk, level: me.lv }, k);
        if ((k === 'd' || k === 'f') && me.sm[k]) setPic(b.querySelector('.tb-ic'), `spell/${me.sm[k]}`, k.toUpperCase());
      }
    }
    for (const k of ['d', 'f']) {
      const sm = this.summ[k];
      const sp = g.data.spells[me.sm[k]];
      setPic(sm.el.querySelector('.mb-ic'), sp ? `spell/${me.sm[k]}` : null, sp ? sp.icon : '?');
      const left = me.cd[k], max = me.cdm[k] || (sp ? sp.cd : 1);
      if (left > 0.05) { sm.cd.style.background = `conic-gradient(rgba(0,0,0,0.75) ${(left / max) * 360}deg, transparent 0deg)`; sm.cdt.textContent = Math.ceil(left); }
      else if (sm.cdt.textContent) { sm.cd.style.background = ''; sm.cdt.textContent = ''; }
    }
    const itemsKey = JSON.stringify(me.it);
    if (this._items !== itemsKey) {
      this._items = itemsKey;
      me.it.forEach((it, i) => {
        const el = this.itemEls[i];
        setPic(el.querySelector('.mb-iic'), it ? `item/${it.id}` : null, it ? g.data.items[it.id].icon : '');
        el.querySelector('.mb-in').textContent = it && it.n > 1 ? it.n : '';
        el.classList.toggle('empty', !it);
      });
    }
    this.wardEl.querySelector('.mb-in').textContent = me.wd;
    this.wardEl.classList.toggle('empty', me.wd <= 0);
    const gold = `🪙 ${me.g}`;
    if (this.goldEl.textContent !== gold) this.goldEl.textContent = gold;
    this.goldEl.classList.toggle('canshop', !!me.shop);
    const nb = nextBuy(g.myChampId(), me.it, me.g);
    const nbKey = nb ? `${nb.id}|${nb.price}|${me.shop}|${me.g >= nb.price}` : 'none';
    if (this._next !== nbKey) {
      this._next = nbKey;
      this.next = nb;
      this.nextEl.hidden = !nb;
      if (nb) {
        setPic(this.nextEl.querySelector('.mn-ic'), `item/${nb.id}`, g.data.items[nb.id].icon);
        this.nextEl.querySelector('.mn-txt').textContent = `${nb.price}`;
        this.nextEl.title = `Next in your build: ${g.data.items[nb.id].name}${nb.id !== nb.target ? ` (toward ${g.data.items[nb.target].name})` : ''}`;
        this.nextEl.classList.toggle('ready', !!me.shop && me.g >= nb.price);
      }
    }
    const kda = `⚔️ ${me.k} / ${me.d} / ${me.a}   🗡️ ${me.cs} CS`;
    if (this.kdaEl.textContent !== kda) this.kdaEl.textContent = kda;
    // Death & recall.
    this.updateDeath(me);
    this.updateRecap(me.dead ? g.world.recap : null);
    document.body.classList.toggle('is-dead', !!me.dead);
    this.recallEl.hidden = !me.rc;
    if (me.rc) this.recallEl.querySelector('.mr-fill').style.width = `${me.rc * 100}%`;
  }

  /** Respawn countdown ring with a tip that fits how you died. */
  updateDeath(me) {
    const el = this.deathEl;
    if (!me.dead) { el.hidden = true; this._deathMax = 0; return; }
    if (el.hidden || !this._deathMax) {
      el.hidden = false;
      this._deathMax = Math.max(1, me.rs);
      el.querySelector('.md-tip').textContent = pickTip(this.game.world.recap, this._lastTip);
      this._lastTip = el.querySelector('.md-tip').textContent;
    }
    const n = Math.ceil(me.rs);
    if (n !== this._deathN) { this._deathN = n; el.querySelector('.md-n').textContent = n; el.classList.toggle('md-soon', n <= 3); }
    el.querySelector('.md-fg').style.strokeDashoffset = `${100 - Math.min(1, me.rs / this._deathMax) * 100}`;
  }

  /** Death recap: who killed you and where the damage came from. */
  updateRecap(rc) {
    if (rc === this._recap) return;
    this._recap = rc;
    this.recapEl.hidden = !rc;
    this.recapEl.classList.remove('collapsed');
    clearTimeout(this.recapT);
    if (!rc) return;
    this.recapEl.onclick = () => this.recapEl.classList.toggle('collapsed');
    if (this.game.input.isTouch) this.recapT = setTimeout(() => this.recapEl.classList.add('collapsed'), 6000);
    const g = this.game, enemy = g.world.team === 'blue' ? 'red' : 'blue';
    const iconOf = r => r.k === 'hero' ? pic(champKey(r.c), g.champInfo[r.c]?.icon || '?')
      : r.k === 'tower' ? pic('misc/tower', '🏰')
      : r.k === 'minion' ? pic(`portrait/minion_melee_${enemy}`, '👾')
      : r.k === 'monster' ? pic(`portrait/${MONSTER_PORTRAIT[r.m] || ''}`, '🐺') : document.createTextNode('?');
    const max = Math.max(1, ...rc.rows.map(r => r.v));
    this.recapEl.replaceChildren(
      h('div.rc-head', {},
        rc.by ? h('span.rc-by', {}, h('span.rc-ic', {}, pic(champKey(rc.by.c), g.champInfo[rc.by.c]?.icon || '?')), h('span', {}, 'Killed by ', h('b', { text: rc.by.n }))) : h('span.rc-by', { text: 'You were slain' }),
        h('span.rc-total', { text: `${rc.total} damage in the last 15s` })),
      ...rc.rows.map(r => h('div.rc-row', {},
        h('span.rc-ic', {}, iconOf(r)),
        h('div.rc-mid', {},
          h('div.rc-name', {}, h('b', { text: r.n }), r.l ? h('span.muted', { text: ` · ${r.l}` }) : null),
          h('div.rc-bar', { style: { width: `${(r.v / max) * 100}%` } },
            r.p ? h('i.rc-p', { style: { flex: r.p } }) : null, r.m ? h('i.rc-m', { style: { flex: r.m } }) : null, r.tr ? h('i.rc-t', { style: { flex: r.tr } }) : null)),
        h('span.rc-v', { text: r.v }))),
      h('div.rc-legend', {}, h('i.rc-p'), 'Physical', h('i.rc-m'), 'Magic', h('i.rc-t'), 'True'));
  }

  buyNext() {
    const me = this.game.world.me;
    if (!this.next || !me) return;
    if (me.shop && me.g >= this.next.price) this.game.send({ t: 'buy', item: this.next.id });
    else this.game.panels.toggle('shop');
  }

  setScore(sc) {
    const g = this.game;
    this.scoreEl.querySelector('.ms-blue').textContent = `${sc.kills.blue}`;
    this.scoreEl.querySelector('.ms-red').textContent = `${sc.kills.red}`;
    this.scoreEl.querySelector('.ms-time').textContent = timeStr(sc.time);
    const titan = g.match.mode === 'skirmish' || g.match.mode === 'brawl' ? '' : `   👾 ${sc.titanIn ? timeStr(sc.titanIn) : 'up'}`; // no Titan in Skirmish
    this.objEl.textContent = `🏰 ${sc.towers.blue}–${sc.towers.red}   🐉 ${sc.wyrms.blue}–${sc.wyrms.red}${sc.wyrmIn ? ` (${timeStr(sc.wyrmIn)})` : ' (up)'}${titan}`;
    clear(this.teamEl);
    for (const p of sc.players.filter(p => p.tm === g.world.team && p.id !== g.world.youId)) {
      const e = g.world.entities.get(p.id);
      const pct = e && !p.dead ? Math.max(0, e.hp / e.mh) * 100 : 0;
      const info = g.champInfo[p.c];
      this.teamEl.append(h(`div.m-ally${p.dead ? '.dead' : ''}${g.camFocusId === p.id ? '.focused' : ''}`, { title: `${p.name} — click to watch`, dataset: { id: p.id }, onclick: () => g.setCamFocus(p.id) },
        h('div.ma-icon', {}, pic(champKey(p.c), info ? info.icon : '?'), h('span.ma-lvl', { text: p.l })),
        h('div.ma-mid', {}, h('span.ma-name', { text: p.name, translate: 'no' }), h('div.ma-bar', {}, h('div.ma-fill', { style: { width: `${pct}%` } }))),
        p.dead ? h('div.ma-rs', { text: p.rs }) : null));
    }
  }

  markFocused(id) { for (const el of this.teamEl.children) el.classList.toggle('focused', Number(el.dataset.id) === id); }

  feed(killer, victim, assists) {
    const g = this.game;
    const ci = id => { const p = g.players.get(id); return p ? pic(champKey(p.champ), g.champInfo[p.champ]?.icon || '?') : pic('misc/kill', '☠️'); };
    const team = id => g.players.get(id)?.team;
    const row = h(`div.feed-row.${team(killer) === g.world.team ? 'ally' : team(killer) ? 'enemy' : 'neutral'}`, {},
      h('span.fr-c', {}, killer ? ci(killer) : pic('misc/tower', '🏰')), h('span.fr-x', { text: assists && assists.length ? `+${assists.length} ⚔️` : '⚔️' }), h('span.fr-c', {}, ci(victim)));
    this.feedEl.prepend(row);
    while (this.feedEl.children.length > 6) this.feedEl.lastChild.remove();
    setTimeout(() => row.remove(), 9000);
  }

  announce(text, kind) {
    const el = h(`div.ann.k-${kind}`, { text });
    this.annEl.append(el);
    while (this.annEl.children.length > 3) this.annEl.firstChild.remove();
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3800);
  }

  /* ---------------- minimap ---------------- */
  buildMiniBase(valley) {
    const c = document.createElement('canvas');
    c.width = valley.size; c.height = valley.size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(valley.size, valley.size);
    const cache = {};
    for (let y = 0; y < valley.size; y++) for (let x = 0; x < valley.size; x++) {
      const t = valley.map.get(x, y);
      const hex = MINI[t] || '#000';
      const col = cache[hex] || (cache[hex] = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]);
      const i = (y * valley.size + x) * 4;
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.miniBase = c;
  }

  miniClick(e) {
    const g = this.game;
    const r = this.mini.getBoundingClientRect();
    const S = g.world.valley.size;
    const x = (e.clientX - r.left) / r.width * S, y = (e.clientY - r.top) / r.height * S;
    if (e.button === 2) { g.send({ t: 'mv', x, y }); g.renderer.showMoveMarker(x, y); return; }
    if (e.altKey) { g.send({ t: 'mping', x, y, k: 'go' }); return; }
    g.renderer.locked = false;
    g.renderer.camTarget.x = x; g.renderer.camTarget.z = y;
  }

  drawMinimap(dt) {
    this.miniT -= dt;
    if (this.miniT > 0) return;
    this.miniT = 0.12;
    const g = this.game, w = g.world;
    if (!w.valley) return;
    if (!this.miniBase) this.buildMiniBase(w.valley);
    const ctx = this.mini.getContext('2d');
    const W = this.mini.width, S = w.valley.size, k = W / S;
    ctx.drawImage(this.miniBase, 0, 0, W, W);
    // Fog of war.
    if (g.renderer.fogCanvas) { ctx.globalAlpha = 0.45; ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(invertFog(g.renderer.fogCanvas), 0, 0, W, W); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    for (const e of w.entities.values()) {
      if (e.fl & F.DEAD) continue;
      const x = e.x * k, y = e.y * k;
      ctx.fillStyle = TEAM_CSS[e.tm] || '#ccc';
      switch (e.kind) {
        case 'tower': ctx.fillRect(x - 3.5, y - 3.5, 7, 7); ctx.strokeStyle = '#000'; ctx.strokeRect(x - 3.5, y - 3.5, 7, 7); break;
        case 'spire': ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); break;
        case 'core': ctx.beginPath(); ctx.arc(x, y, 6.5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.stroke(); break;
        case 'minion': ctx.fillRect(x - 1, y - 1, 2.5, 2.5); break;
        case 'monster': ctx.fillStyle = e.ep ? '#c084fc' : '#facc15'; ctx.beginPath(); ctx.arc(x, y, e.ep ? 5 : 2.5, 0, Math.PI * 2); ctx.fill(); break;
        case 'ward': ctx.fillStyle = '#fde047'; ctx.fillRect(x - 1.5, y - 1.5, 3, 3); break;
        default:
      }
    }
    for (const e of w.entities.values()) {
      if (e.kind !== 'hero' || (e.fl & F.DEAD)) continue;
      const x = e.x * k, y = e.y * k;
      const r = e.id === w.youId ? 7.5 : 6.5;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = TEAM_CSS[e.tm];
      ctx.fill();
      const img = canvasImage(champKey(e.c));
      if (img && img.complete && img.naturalWidth) {
        ctx.save(); ctx.beginPath(); ctx.arc(x, y, r - 1, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(img, x - r, y - r, r * 2, r * 2); ctx.restore();
      } else {
        ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(g.champInfo[e.c]?.icon || '', x, y + 0.5);
      }
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = e.id === w.youId ? '#facc15' : TEAM_CSS[e.tm];
      ctx.stroke();
    }
    for (const p of g.pings) {
      ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x * k, p.y * k, 4 + (1 - p.t / 3) * 8, 0, Math.PI * 2); ctx.stroke();
      if (p.k === 'missing') { ctx.fillStyle = p.color; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', p.x * k, p.y * k); }
    }
    // Camera frustum.
    const vb = g.renderer.viewBounds();
    if (vb.length === 4) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1;
      ctx.beginPath(); vb.forEach((p, i) => (i ? ctx.lineTo(p.x * k, p.y * k) : ctx.moveTo(p.x * k, p.y * k))); ctx.closePath(); ctx.stroke();
    }
  }
}

let invCanvas = null;
function invertFog(src) {
  // Fog canvas is white where fogged; turn it into a darkening mask for the minimap.
  if (!invCanvas) { invCanvas = document.createElement('canvas'); invCanvas.width = src.width; invCanvas.height = src.height; }
  const ctx = invCanvas.getContext('2d');
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, src.width, src.height);
  ctx.globalCompositeOperation = 'difference';
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  return invCanvas;
}

const TIPS = {
  tower: ['Towers hit hard. Let your minions walk in first so the tower targets them.',
    'A tower switches to you when you hit an enemy hero under it.'],
  gank: ['When enemies go missing from the map, play closer to your tower.',
    'Place a ward (T) in the river to see ganks coming.',
    'Ping enemies who leave your lane so your team is ready.'],
  monster: ['Jungle camps hit back. Clear them with high health or with a teammate.'],
  general: ['Last-hit minions for gold: a gold outline marks the ones you can finish.',
    'Hold Space to snap the camera back to your hero.',
    'The shop is open while you are dead. Spend your gold now.',
    'Your ultimate unlocks at level 6. Fights go better when it is ready.',
    'Objectives win games. After a kill, push a tower or take a camp.',
    'Recall (B) when you are low instead of staying for one more minion.',
    'Hold an ability key to preview its range and shape before you cast.',
    'Dying gives the enemy gold. Sometimes walking away is the best play.'],
};

/** A tip for this death: about towers, ganks or monsters when that is what killed you. */
function pickTip(rc, last) {
  const top = rc?.rows?.length ? rc.rows.reduce((a, b) => (b.v > a.v ? b : a)) : null;
  const heroes = rc?.rows?.filter(r => r.k === 'hero').length || 0;
  const pool = top?.k === 'tower' ? TIPS.tower : top?.k === 'monster' ? TIPS.monster
    : heroes >= 2 && Math.random() < 0.6 ? TIPS.gank : TIPS.general;
  const options = pool.filter(t => t !== last);
  return options[Math.floor(Math.random() * options.length)] || pool[0];
}
