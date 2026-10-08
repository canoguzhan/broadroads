/* Overhead health bars, names, floating combat text and chat bubbles. */
import { h } from './dom.js';
import { F } from '../../shared/constants.js';

const HEIGHT = { hero: 2.7, minion: 1.5, tower: 6.2, spire: 3.2, core: 5.6, ward: 1.5 };
const MONSTER_H = { golem: 3, brute: 2.8, wolf: 1.8, bat: 2.2, slime: 1.6, wyrm: 4.2, overlord: 5.2 };

export class Labels {
  constructor(root) {
    this.root = root;
    this.items = new Map();
    this.floaters = [];
  }

  add(e, world) {
    if (!['hero', 'minion', 'tower', 'spire', 'core', 'monster', 'ward'].includes(e.kind)) return;
    const rel = e.id === world.youId ? 'self' : e.tm === world.team ? 'ally' : e.tm === 'neutral' ? 'neutral' : 'enemy';
    const fill = h('div.lb-fill');
    let el;
    if (e.kind === 'hero') {
      const mp = h('div.lb-mp-fill');
      el = h(`div.label.l-hero.${rel}`, {}, h('div.l-name', {}, h('span.l-lvl', { text: e.l }), ` ${e.n}`), h('div.lb', {}, fill, h('div.lb-ticks')), h('div.lb-mp', {}, mp));
      el._mp = mp;
    } else if (e.kind === 'monster') {
      el = h(`div.label.l-monster${e.ep ? '.epic' : ''}`, {}, e.ep ? h('div.l-name', { text: e.n }) : null, h('div.lb', {}, fill));
    } else {
      el = h(`div.label.l-${e.kind}.${rel}`, {}, h('div.lb', {}, fill));
    }
    el._fill = fill;
    el.style.display = 'none';
    this.root.append(el);
    this.items.set(e.id, { el, e });
  }

  remove(e) {
    const it = this.items.get(e.id);
    if (!it) return;
    it.el.remove();
    this.items.delete(e.id);
  }

  clear() {
    for (const it of this.items.values()) it.el.remove();
    this.items.clear();
    for (const f of this.floaters) f.el.remove();
    this.floaters = [];
  }

  update(world, renderer, dt) {
    const myAd = (world.me?.st?.ad || 0) * 0.93; // a little under, for minion armor
    for (const { el, e } of this.items.values()) {
      const dead = (e.fl & F.DEAD) !== 0;
      const hgt = e.kind === 'monster' ? (MONSTER_H[e.md] || 2) * (e.sm ? 0.65 : e.ep ? 1.2 : 1) : HEIGHT[e.kind] || 2;
      const p = renderer.project(e.x, e.y, hgt);
      const show = !dead && p.visible && p.x > -60 && p.y > -30 && p.x < renderer.width + 60 && p.y < renderer.height + 30 && (e.kind !== 'minion' || e.hp < e.mh || true);
      if (!show) { if (el.style.display !== 'none') el.style.display = 'none'; continue; }
      if (el.style.display === 'none') el.style.display = '';
      el.style.transform = `translate(${p.x | 0}px, ${p.y | 0}px) translate(-50%, -100%)`;
      const pct = Math.max(0, Math.min(1, e.hp / (e.mh || 1)));
      if (el._pct !== pct) { el._pct = pct; el._fill.style.width = `${pct * 100}%`; }
      if (el._mp && e.mm) { const mp = Math.max(0, Math.min(1, (e.mp ?? e.mm) / e.mm)); if (el._mpv !== mp) { el._mpv = mp; el._mp.style.width = `${mp * 100}%`; } }
      el.classList.toggle('protected', (e.fl & F.PROTECTED) !== 0);
      el.classList.toggle('recall', (e.fl & F.RECALL) !== 0);
      if (e.kind === 'minion' && e.tm !== world.team) el.classList.toggle('lasthit', myAd > 0 && e.hp <= myAd); // last-hit helper: one attack kills it
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      const p = renderer.project(f.x, f.y, 2.4 + f.t * 1.6);
      f.el.style.transform = `translate(${p.x | 0}px, ${p.y | 0}px) translate(-50%, -50%) scale(${f.scale * (f.t < 0.12 ? 1.4 - f.t * 3 : 1)})`;
      f.el.style.opacity = String(Math.max(0, 1 - Math.max(0, f.t - 0.6) / 0.5));
      if (f.t > 1.1) { f.el.remove(); this.floaters.splice(i, 1); }
    }
  }

  levelChanged(e) {
    const it = this.items.get(e.id);
    if (it) { const l = it.el.querySelector('.l-lvl'); if (l) l.textContent = e.l; }
  }

  floatText(x, y, text, kind = 'dmg', scale = 1) {
    if (this.floaters.length > 70) { const old = this.floaters.shift(); old.el.remove(); }
    const el = h(`div.floater.f-${kind}`, { text });
    this.root.append(el);
    this.floaters.push({ el, x: x + (Math.random() - 0.5) * 0.8, y, t: 0, scale });
  }

  bubble(id, text, channel = 'all') {
    const it = this.items.get(id);
    if (!it) return;
    if (it.bubble) { clearTimeout(it.bubble.timer); it.bubble.el.remove(); }
    const clipped = text.length > 90 ? text.slice(0, 87) + '…' : text;
    const el = h(`div.chat-bubble.cb-${channel}`, { text: clipped });
    it.el.prepend(el);
    const timer = setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 4500 + clipped.length * 40);
    it.bubble = { el, timer };
  }
}
