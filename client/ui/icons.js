/* Real images for the UI: champion/creature portraits rendered from the 3D
   models (scripts/render-portraits.mjs) and generated item, spell, ability
   and interface icons (scripts/generate-icons.mjs). Anything without an
   image falls back to its emoji.
   Keys: 'portrait/<id>', 'item/<id>', 'spell/<id>', 'ability/<champ>_<q|w|e|r>',
   'passive/<champ>', 'misc/<id>'. */
import { h } from './dom.js';

const BASE = import.meta.env.BASE_URL || '/';
const have = new Set();
const list = url => fetch(url).then(r => (r.ok ? r.json() : [])).catch(() => []);

export const iconsReady = Promise.all([
  list(`${BASE}icons/manifest.json`).then(l => l.forEach(k => have.add(k))),
  list(`${BASE}portraits/manifest.json`).then(l => l.forEach(id => have.add(`portrait/${id}`))),
]);

export function iconUrl(key) {
  if (!key || !have.has(key)) return null;
  return key.startsWith('portrait/') ? `${BASE}portraits/${key.slice(9)}.webp` : `${BASE}icons/${key}.webp`;
}

/** An <img> for the key, or the emoji fallback as text. */
export function pic(key, fallback = '') {
  const url = iconUrl(key);
  return url ? h('img.pic', { src: url, alt: '', draggable: 'false' }) : document.createTextNode(fallback);
}

/** Replaces an element's content with the key's image (or emoji), skipping no-op updates. */
export function setPic(el, key, fallback = '') {
  const want = `${key}|${fallback}`;
  if (el._pic === want) return;
  el._pic = want;
  el.replaceChildren(pic(key, fallback));
}

export const champKey = id => `portrait/${id}`;
export const abilityKey = (champ, slot) => `ability/${champ}_${slot}`;

// Decoded images for canvas drawing (minimap).
const images = new Map();
export function canvasImage(key) {
  if (images.has(key)) return images.get(key);
  const url = iconUrl(key);
  if (!url) return null;
  const img = new Image();
  img.src = url;
  images.set(key, img);
  return img;
}
