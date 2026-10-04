/* Toasts, tooltips and accept/decline prompts. */
import { h, $ } from './dom.js';
import { sfx } from '../audio/sfx.js';

export class UI {
  constructor() {
    this.toasts = $('#toasts');
    this.tip = $('#tooltip');
    this.prompts = h('div.prompts');
    document.body.append(this.prompts);
    this.recent = new Map();
  }

  toast(text, kind = 'info', ms = 3200) {
    // Collapse duplicates fired in quick succession.
    const now = Date.now();
    if (this.recent.get(text) > now - 1200) return;
    this.recent.set(text, now);
    sfx.play(kind === 'warn' || kind === 'bad' ? 'ui_error' : 'ui_notify', { gap: 0.25 });
    const el = h(`div.toast.t-${kind}`, { text });
    this.toasts.append(el);
    while (this.toasts.children.length > 5) this.toasts.firstChild.remove();
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 400);
  }

  banner(text, sub = '') {
    const el = h('div.big-banner', {}, h('div.bb-main', { text }), sub ? h('div.bb-sub', { text: sub }) : null);
    document.body.append(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3200);
  }

  showTip(anchor, content) {
    this.tip.replaceChildren(content);
    this.tip.hidden = false;
    const r = anchor.getBoundingClientRect();
    const tw = this.tip.offsetWidth, th = this.tip.offsetHeight;
    let x = r.right + 10, y = r.top;
    if (x + tw > window.innerWidth - 8) x = r.left - tw - 10;
    if (x < 8) x = Math.max(8, r.left);
    if (y + th > window.innerHeight - 8) y = window.innerHeight - th - 8;
    this.tip.style.left = `${Math.max(8, x)}px`;
    this.tip.style.top = `${Math.max(8, y)}px`;
  }

  hideTip() { this.tip.hidden = true; }

  prompt(text, onAccept, onDecline, seconds = 30) {
    let done = false;
    const close = () => { done = true; el.remove(); };
    const timer = h('div.prompt-timer');
    const el = h('div.prompt-card', {},
      h('p', { text }),
      timer,
      h('div.btn-row', {},
        h('button.btn.btn-primary', { onclick: () => { close(); onAccept(); } }, 'Accept'),
        h('button.btn', { onclick: () => { close(); onDecline && onDecline(); } }, 'Decline')));
    this.prompts.append(el);
    timer.style.animationDuration = `${seconds}s`;
    setTimeout(() => { if (!done) { close(); onDecline && onDecline(); } }, seconds * 1000);
  }
}
