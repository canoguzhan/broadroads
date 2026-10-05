/* Shared soft glow texture for sprites. */
import * as THREE from 'three';

let glowTexture = null;
export function makeGlowTexture() {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glowTexture = new THREE.CanvasTexture(c);
  return glowTexture;
}

/* Procedural effect textures, generated once. */
const cache = new Map();
function canvasTexture(key, size, draw) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  cache.set(key, tex);
  return tex;
}

/** Four-point star spark. */
export const sparkTexture = () => canvasTexture('spark', 64, (g, s) => {
  const m = s / 2;
  const grd = g.createRadialGradient(m, m, 0, m, m, m * 0.35);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
  g.globalCompositeOperation = 'lighter';
  for (const [w, hgt] of [[s, 3], [3, s]]) {
    const l = g.createLinearGradient(m - w / 2, m - hgt / 2, m + w / 2, m + hgt / 2);
    l.addColorStop(0, 'rgba(255,255,255,0)'); l.addColorStop(0.5, 'rgba(255,255,255,0.9)'); l.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = l; g.fillRect(m - w / 2, m - hgt / 2, w, hgt);
  }
});

/** Soft, lumpy smoke puff. */
export const smokeTexture = () => canvasTexture('smoke', 64, (g, s) => {
  for (let i = 0; i < 9; i++) {
    const x = s / 2 + (Math.sin(i * 2.4) * s) / 6, y = s / 2 + (Math.cos(i * 1.7) * s) / 6, r = s * (0.18 + (i % 3) * 0.05);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
  }
});

/** Magic circle with runes, for casts and ability zones. */
export const runeTexture = () => canvasTexture('rune', 256, (g, s) => {
  const m = s / 2;
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 3; g.beginPath(); g.arc(m, m, m - 6, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 1.5; g.beginPath(); g.arc(m, m, m - 22, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(m, m, m * 0.45, 0, Math.PI * 2); g.stroke();
  // Two overlapping triangles (hexagram).
  for (const rot of [0, Math.PI]) {
    g.beginPath();
    for (let i = 0; i <= 3; i++) { const a = rot + (i * Math.PI * 2) / 3 - Math.PI / 2; const x = m + Math.cos(a) * (m - 24), y = m + Math.sin(a) * (m - 24); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }
  // Rune glyphs between the outer rings.
  g.lineWidth = 2;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, r = m - 14;
    g.save(); g.translate(m + Math.cos(a) * r, m + Math.sin(a) * r); g.rotate(a + Math.PI / 2);
    g.beginPath(); g.moveTo(-4, -4); g.lineTo(0, 4); g.lineTo(4, -4); if (i % 2) { g.moveTo(-4, 0); g.lineTo(4, 0); } g.stroke();
    g.restore();
  }
});

/** Vertical gradient for shockwave walls (bright at the base, fading up). */
export const wallTexture = () => canvasTexture('wall', 64, (g, s) => {
  const l = g.createLinearGradient(0, s, 0, 0);
  l.addColorStop(0, 'rgba(255,255,255,0.9)'); l.addColorStop(0.35, 'rgba(255,255,255,0.35)'); l.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = l; g.fillRect(0, 0, s, s);
});

/** Dark ground scorch decal. */
export const scorchTexture = () => canvasTexture('scorch', 128, (g, s) => {
  const m = s / 2;
  const grd = g.createRadialGradient(m, m, 0, m, m, m);
  grd.addColorStop(0, 'rgba(20,12,8,0.85)'); grd.addColorStop(0.6, 'rgba(25,15,10,0.5)'); grd.addColorStop(1, 'rgba(25,15,10,0)');
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + Math.sin(i) * 0.3;
    g.strokeStyle = 'rgba(15,8,5,0.5)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(m + Math.cos(a) * m * 0.3, m + Math.sin(a) * m * 0.3); g.lineTo(m + Math.cos(a) * m * (0.7 + (i % 3) * 0.1), m + Math.sin(a) * m * (0.7 + (i % 3) * 0.1)); g.stroke();
  }
});
