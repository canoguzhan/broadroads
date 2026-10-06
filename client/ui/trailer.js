/* Landing page trailer: the muted trailer loop plays behind the hero (over
   the still image, which stays as the fallback), and "Watch the trailer"
   opens the full cut with sound. Skipped with reduced motion or data saver,
   and nothing shows if the trailer files aren't there. */
import { h } from './dom.js';

const BASE = `${import.meta.env.BASE_URL || '/'}trailer/`;

export function initTrailer(hero) {
  const bg = hero.querySelector('.ld-hero-bg');
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches || navigator.connection?.saveData;
  if (bg && !calm) {
    const v = h('video.ld-hero-video', { muted: true, loop: true, playsInline: true, autoplay: true, preload: 'auto', 'aria-hidden': 'true', poster: `${BASE}poster.jpg` });
    v.defaultMuted = true; // iOS needs the attribute form to allow autoplay
    v.setAttribute('muted', '');
    v.addEventListener('playing', () => v.classList.add('on'), { once: true });
    v.addEventListener('error', () => v.remove(), { once: true });
    v.append(h('source', { src: `${BASE}bg.mp4`, type: 'video/mp4' }));
    v.querySelector('source').addEventListener('error', () => v.remove(), { once: true });
    bg.append(v);
    v.play?.().catch(() => { /* autoplay blocked: the still image stays */ });
  }
  const ctas = hero.querySelector('.ld-ctas');
  if (!ctas) return;
  fetch(`${BASE}broadroads-trailer.mp4`, { method: 'HEAD' }).then(r => {
    if (!r.ok) return;
    ctas.after(h('button.ld-watch', { type: 'button', onclick: open }, h('span.ld-watch-ic', { text: '▶' }), 'Watch the trailer'));
  }).catch(() => {});
}

function open() {
  const video = h('video', { controls: true, autoplay: true, playsInline: true, src: `${BASE}broadroads-trailer.mp4`, poster: `${BASE}poster.jpg` });
  const close = () => { video.pause(); wrap.remove(); document.removeEventListener('keydown', esc); };
  const esc = e => { if (e.key === 'Escape') close(); };
  const wrap = h('div.trailer-modal', { onclick: e => { if (e.target === wrap) close(); } },
    h('div.trailer-box', {}, video, h('button.trailer-close', { type: 'button', 'aria-label': 'Close', onclick: close }, '✕')));
  document.addEventListener('keydown', esc);
  document.body.append(wrap);
}
