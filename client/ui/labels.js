/* DOM overlay for nameplates, health bars and floating combat text. */
import { h } from './dom.js';
import { F } from '../../shared/constants.js';

const HEIGHT = { player: 2.3, npc: 4.2, portal: 2.6, chest: 1.3, loot: 1.1 };
const MONSTER_HEIGHT = { slime: 1.4, bat: 2.0, wolf: 1.6, skeleton: 2.0, archer: 2.0, brute: 2.6, shaman: 2.2, golem: 3.0, colossus: 4.8, overlord: 4.6, lich: 4.4, behemoth: 5.2 };

export class Labels {
  constructor(root) {
    this.root = root;
    this.items = new Map();
    this.floaters = [];
  }

  add(e, youId) {
    if (!['player', 'monster', 'npc', 'portal', 'loot'].includes(e.kind)) return;
    let el;
    if (e.kind === 'npc') {
      el = h('div.nameplate.np-npc', {}, h('div.np-icon', { text: e.ic }), h('div.np-name', { text: e.n }), h('div.np-title', { text: e.ti }));
    } else if (e.kind === 'portal') {
      el = h('div.nameplate.np-portal', {}, h('div.np-name', { text: e.n }));
    } else if (e.kind === 'loot') {
      el = h(`div.nameplate.np-loot.r-${e.ra}`, {}, h('div.np-name', { text: e.lt === 'mat' ? `${e.n} ore` : e.n }));
    } else {
      const bar = h('div.np-fill');
      const isBoss = e.kind === 'monster' && e.b;
      el = h(`div.nameplate.np-${e.kind}${e.id === youId ? '.np-self' : ''}${e.el ? '.np-elite' : ''}${isBoss ? '.np-boss' : ''}`, {},
        h('div.np-name', {}, e.kind === 'player' ? `${e.n}` : e.n, h('span.np-lvl', { text: ` ${e.l}` })),
        h('div.np-bar', {}, bar));
      el._fill = bar;
    }
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
    for (const { el, e } of this.items.values()) {
      const height = e.kind === 'monster' ? (MONSTER_HEIGHT[e.t] || 2) * (e.el ? 1.25 : 1) : HEIGHT[e.kind] || 2;
      const p = renderer.project(e.x, e.y, height);
      const onScreen = p.visible && p.x > -80 && p.y > -40 && p.x < renderer.width + 80 && p.y < renderer.height + 40;
      const dead = (e.fl & F.DEAD) !== 0;
      if (!onScreen || (dead && e.kind === 'monster')) { if (el.style.display !== 'none') el.style.display = 'none'; continue; }
      if (el.style.display === 'none') el.style.display = '';
      el.style.transform = `translate(${p.x | 0}px, ${p.y | 0}px) translate(-50%, -100%)`;
      if (el._fill) {
        const pct = Math.max(0, Math.min(1, e.hp / (e.mh || 1)));
        if (el._pct !== pct) { el._pct = pct; el._fill.style.width = `${pct * 100}%`; }
        const cls = e.id === world.youId ? 'self' : (e.fl & F.HOSTILE) ? 'hostile' : (e.fl & F.PARTY) ? 'party' : 'friend';
        if (el._cls !== cls) { el.classList.remove('hostile', 'party', 'friend', 'self'); el.classList.add(cls); el._cls = cls; }
        el.classList.toggle('dead', dead);
      }
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      const p = renderer.project(f.x, f.y, 2 + f.t * 1.6);
      f.el.style.transform = `translate(${p.x | 0}px, ${p.y | 0}px) translate(-50%, -50%) scale(${f.scale * (f.t < 0.12 ? 1.4 - f.t * 3 : 1)})`;
      f.el.style.opacity = String(Math.max(0, 1 - Math.max(0, f.t - 0.6) / 0.5));
      if (f.t > 1.1) { f.el.remove(); this.floaters.splice(i, 1); }
    }
  }

  floatText(x, y, text, kind = 'dmg', scale = 1) {
    if (this.floaters.length > 80) { const old = this.floaters.shift(); old.el.remove(); }
    const el = h(`div.floater.f-${kind}`, { text });
    this.root.append(el);
    this.floaters.push({ el, x: x + (Math.random() - 0.5) * 0.8, y, t: 0, scale });
  }
}
