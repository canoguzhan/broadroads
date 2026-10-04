/* Keyboard, mouse and touch input. Movement/aim are polled each tick; discrete
   actions are dispatched through onAction(name). */

const KEYMAP = {
  KeyQ: 'q', KeyE: 'e', KeyR: 'r', Space: 'dash', ShiftLeft: 'dash', ShiftRight: 'dash',
  Digit1: 'potHp', Digit2: 'potMp', KeyF: 'interact',
  KeyI: 'inventory', KeyB: 'inventory', KeyC: 'character', KeyP: 'social', KeyO: 'social', KeyL: 'leaderboard',
  KeyH: 'help', KeyM: 'map', Tab: 'scoreboard', Enter: 'chat', Slash: 'chatCommand', Escape: 'escape',
};

export class Input {
  constructor(canvas, onAction) {
    this.canvas = canvas;
    this.onAction = onAction;
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, left: false, inside: false };
    this.touch = { active: false, mx: 0, my: 0, attack: false };
    this.enabled = true;
    this.isTouch = matchMedia('(pointer: coarse)').matches;

    this.listeners = [];
    const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); this.listeners.push([target, type, fn, opts]); };
    on(window, 'keydown', e => this.keydown(e));
    on(window, 'keyup', e => this.keys.delete(e.code));
    on(window, 'blur', () => { this.keys.clear(); this.mouse.left = false; });
    on(canvas, 'mousemove', e => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.inside = true; });
    on(canvas, 'mouseleave', () => { this.mouse.inside = false; });
    on(canvas, 'mousedown', e => {
      if (!this.enabled) return;
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      if (e.button === 0) { this.mouse.left = true; this.onAction('click', e); }
      if (e.button === 2) this.onAction('dash');
    });
    on(window, 'mouseup', e => { if (e.button === 0) this.mouse.left = false; });
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
    if (this.typing()) {
      if (e.code === 'Escape') { document.activeElement.blur(); this.onAction('chatBlur'); }
      return;
    }
    const action = KEYMAP[e.code];
    if (action === 'scoreboard' || action === 'chat' || action === 'chatCommand' || e.code === 'Space') e.preventDefault();
    if (!this.enabled) return;
    if (!e.repeat || action === undefined) this.keys.add(e.code);
    if (action && !e.repeat) this.onAction(action, e);
  }

  /** Movement vector in world space (W = north = -y). */
  move() {
    if (!this.enabled || this.typing()) return { mx: 0, my: 0 };
    if (this.touch.active) return { mx: this.touch.mx, my: this.touch.my };
    const k = this.keys;
    let mx = 0, my = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) my -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) my += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    return { mx, my };
  }

  attacking() { return this.enabled && (this.mouse.left || this.touch.attack); }

  /** Virtual joystick for touch screens. */
  bindJoystick(base, knob) {
    let id = null, cx = 0, cy = 0;
    const R = 50;
    const start = e => {
      const t = e.changedTouches[0];
      id = t.identifier;
      const r = base.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      this.touch.active = true;
      moveTo(t);
      e.preventDefault();
    };
    const moveTo = t => {
      let dx = t.clientX - cx, dy = t.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = dx / d * R; dy = dy / d * R; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.touch.mx = d > 8 ? dx / R : 0;
      this.touch.my = d > 8 ? dy / R : 0;
    };
    const move = e => { for (const t of e.changedTouches) if (t.identifier === id) { moveTo(t); e.preventDefault(); } };
    const end = e => {
      for (const t of e.changedTouches) {
        if (t.identifier !== id) continue;
        id = null;
        this.touch.active = false; this.touch.mx = 0; this.touch.my = 0;
        knob.style.transform = '';
      }
    };
    base.addEventListener('touchstart', start, { passive: false });
    base.addEventListener('touchmove', move, { passive: false });
    base.addEventListener('touchend', end);
    base.addEventListener('touchcancel', end);
  }
}
