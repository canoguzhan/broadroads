/* Ping wheel: hold V (or Alt + left mouse) and flick toward a ping; release sends it.
   A tap without moving sends the plain "go" ping where the wheel opened. */
import { h } from '../ui/dom.js';

export const PING_KINDS = [ // clockwise from the top
  { k: 'go', label: 'Attack', icon: '⚔️' },
  { k: 'omw', label: 'On my way', icon: '🏃' },
  { k: 'help', label: 'Need help', icon: '🛡️' },
  { k: 'missing', label: 'Enemy missing', icon: '❓' },
  { k: 'danger', label: 'Danger', icon: '⚠️' },
];
const DEAD_ZONE = 22;
const RADIUS = 62;

export class PingWheel {
  constructor(root, send) {
    this.send = send;
    this.el = h('div.ping-wheel', { hidden: true },
      ...PING_KINDS.map((p, i) => {
        const a = (i / PING_KINDS.length) * Math.PI * 2 - Math.PI / 2;
        return h(`div.pw-opt.pw-${p.k}`, { style: { transform: `translate(${Math.cos(a) * RADIUS}px, ${Math.sin(a) * RADIUS}px)` } }, h('span.pw-ic', { text: p.icon }));
      }),
      this.labelEl = h('div.pw-label'));
    root.append(this.el);
    this.onMove = e => this.move(e.clientX, e.clientY);
  }

  get open() { return !!this.at; }

  /** Opens at screen point (sx, sy); `world` is the map point the ping lands on. */
  start(sx, sy, world) {
    this.at = { sx, sy, world };
    this.pick = null;
    this.el.hidden = false;
    this.el.style.left = `${sx}px`;
    this.el.style.top = `${sy}px`;
    window.addEventListener('mousemove', this.onMove);
    this.move(sx, sy);
  }

  move(mx, my) {
    if (!this.at) return;
    const dx = mx - this.at.sx, dy = my - this.at.sy;
    let pick = null;
    if (Math.hypot(dx, dy) >= DEAD_ZONE) {
      const n = PING_KINDS.length;
      const a = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2 + Math.PI / n) % (Math.PI * 2);
      pick = PING_KINDS[Math.floor(a / (Math.PI * 2 / n)) % n];
    }
    this.pick = pick;
    for (const o of this.el.querySelectorAll('.pw-opt')) o.classList.toggle('on', !!pick && o.classList.contains(`pw-${pick.k}`));
    this.labelEl.textContent = pick ? pick.label : 'Ping';
  }

  /** Closes the wheel; sends the chosen ping unless cancelled. */
  end(cancel = false) {
    if (!this.at) return;
    const { world } = this.at;
    const k = this.pick?.k || 'go';
    this.at = null;
    this.el.hidden = true;
    window.removeEventListener('mousemove', this.onMove);
    if (!cancel && world) this.send(k, world);
  }

  destroy() { this.end(true); this.el.remove(); }
}
