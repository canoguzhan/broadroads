/* Emote wheel (G or the 😊 button): champion emotes and quick chat lines. */
import { h } from '../ui/dom.js';

export const EMOTE_ICON = { dance: '💃', cheer: '🎉', laugh: '😂' };
const ENTRIES = [
  { emote: 'dance', label: 'Dance' },
  { emote: 'cheer', label: 'Cheer' },
  { emote: 'laugh', label: 'Laugh' },
  { chat: 'Good game!', ch: 'all', icon: '🤝' },
  { chat: 'Well played!', ch: 'all', icon: '👏' },
  { chat: 'On my way!', ch: 'team', icon: '🏃' },
  { chat: 'Careful!', ch: 'team', icon: '⚠️' },
  { chat: 'Thanks!', ch: 'team', icon: '🙏' },
];

export class EmoteWheel {
  constructor(game) {
    this.game = game;
    this.el = h('div.emote-wheel', { hidden: true },
      ...ENTRIES.map((e, i) => {
        const a = (i / ENTRIES.length) * Math.PI * 2 - Math.PI / 2;
        return h('button.ew-item', {
          style: { left: `${50 + Math.cos(a) * 38}%`, top: `${50 + Math.sin(a) * 38}%` },
          onclick: () => this.pick(e),
        }, h('span.ew-ic', { text: e.emote ? EMOTE_ICON[e.emote] : e.icon }), h('span.ew-label', { text: e.label || e.chat }));
      }),
      h('button.ew-close', { onclick: () => this.close(), 'aria-label': 'Close' }, '✕'));
    game.hud.root.append(this.el);
  }

  toggle() { if (this.el.hidden) this.open(); else this.close(); }
  open() { this.el.hidden = false; }
  close() { this.el.hidden = true; }

  pick(e) {
    const g = this.game;
    if (e.emote) g.send({ t: 'emote', k: e.emote });
    else g.send({ t: 'chat', ch: e.ch, text: e.chat });
    this.close();
  }
}
