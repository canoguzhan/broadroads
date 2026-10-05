/* MOBA input. Desktop: right-click movement and quick-cast abilities at the
   cursor (plus arrow-key movement). Touch: virtual joystick + buttons. */

const KEYS = {
  KeyQ: 'q', KeyW: 'w', KeyE: 'e', KeyR: 'r', KeyD: 'd', KeyF: 'f', KeyB: 'recall', KeyT: 'ward', KeyA: 'amove', KeyS: 'stop',
  KeyP: 'shop', Tab: 'score', Space: 'center', KeyY: 'lock', Enter: 'chat', Escape: 'escape', KeyC: 'stats',
  Digit1: 'item0', Digit2: 'item1', Digit3: 'item2', Digit4: 'item3', Digit5: 'item4', Digit6: 'item5', KeyH: 'help', KeyG: 'emotes',
};

export class Input {
  constructor(canvas, onAction) {
    this.canvas = canvas;
    this.onAction = onAction;
    this.keys = new Set();
    this.mouse = { x: innerWidth / 2, y: innerHeight / 2, right: false, inside: true };
    this.touch = { active: false, mx: 0, my: 0, attack: false };
    this.isTouch = matchMedia('(pointer: coarse)').matches;
    this.enabled = true;
    this.listeners = [];
    const on = (t, type, fn, opts) => { t.addEventListener(type, fn, opts); this.listeners.push([t, type, fn, opts]); };
    on(window, 'keydown', e => this.keydown(e));
    on(window, 'keyup', e => { this.keys.delete(e.code); const a = KEYS[e.code]; if (a === 'score' || a === 'center') this.onAction(`${a}Up`, e); });
    on(window, 'blur', () => { this.keys.clear(); this.mouse.right = false; });
    on(window, 'mousemove', e => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
    on(canvas, 'mouseenter', () => { this.mouse.inside = true; });
    on(canvas, 'mouseleave', () => { this.mouse.inside = false; });
    on(canvas, 'mousedown', e => {
      if (!this.enabled) return;
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      if (e.button === 2) { this.mouse.right = true; this.onAction('rclick', e); }
      if (e.button === 0) this.onAction(e.altKey ? 'ping' : 'lclick', e);
    });
    on(window, 'mouseup', e => { if (e.button === 2) this.mouse.right = false; });
    on(canvas, 'contextmenu', e => e.preventDefault());
    on(canvas, 'wheel', e => { e.preventDefault(); if (this.enabled) this.onAction('zoom', Math.sign(e.deltaY)); }, { passive: false });
  }

  destroy() {
    for (const [t, type, fn, opts] of this.listeners) t.removeEventListener(type, fn, opts);
    this.listeners = [];
    this.enabled = false;
  }

  typing() {
    const a = document.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT');
  }

  keydown(e) {
    if (this.typing()) { if (e.code === 'Escape') { document.activeElement.blur(); } return; }
    if (!this.enabled) return;
    if (e.code.startsWith('Arrow')) { this.keys.add(e.code); e.preventDefault(); return; }
    const a = KEYS[e.code];
    if (!a) return;
    if (a === 'score' || a === 'center' || a === 'chat' || e.ctrlKey) e.preventDefault();
    if (e.repeat && a !== 'center') return;
    this.keys.add(e.code);
    if (e.ctrlKey && ['q', 'w', 'e', 'r'].includes(a)) return this.onAction('level', a);
    this.onAction(a, e);
  }

  arrows() {
    if (this.touch.active) return { mx: this.touch.mx, my: this.touch.my };
    if (!this.enabled || this.typing()) return { mx: 0, my: 0 };
    let mx = 0, my = 0;
    if (this.keys.has('ArrowUp')) my -= 1;
    if (this.keys.has('ArrowDown')) my += 1;
    if (this.keys.has('ArrowLeft')) mx -= 1;
    if (this.keys.has('ArrowRight')) mx += 1;
    return { mx, my };
  }

  edgePan(w, h) {
    if (this.isTouch || !this.mouse.inside) return null;
    const m = 18;
    const x = this.mouse.x < m ? -1 : this.mouse.x > w - m ? 1 : 0;
    const y = this.mouse.y < m ? -1 : this.mouse.y > h - m ? 1 : 0;
    return x || y ? { x, y } : null;
  }

  bindJoystick(base, knob) {
    let id = null, cx = 0, cy = 0;
    const R = 50;
    const moveTo = t => {
      let dx = t.clientX - cx, dy = t.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = dx / d * R; dy = dy / d * R; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.touch.mx = d > 8 ? dx / R : 0;
      this.touch.my = d > 8 ? dy / R : 0;
    };
    base.addEventListener('touchstart', e => { const t = e.changedTouches[0]; id = t.identifier; const r = base.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; this.touch.active = true; moveTo(t); e.preventDefault(); }, { passive: false });
    base.addEventListener('touchmove', e => { for (const t of e.changedTouches) if (t.identifier === id) { moveTo(t); e.preventDefault(); } }, { passive: false });
    const end = e => { for (const t of e.changedTouches) if (t.identifier === id) { id = null; this.touch.active = false; this.touch.mx = 0; this.touch.my = 0; knob.style.transform = ''; } };
    base.addEventListener('touchend', end);
    base.addEventListener('touchcancel', end);
  }
}
