/* Per-ability visual effects. Every champion ability ('garrok_q', …) gets its own look:
     proj()           the projectile mesh (+ trail colour/size, spin, own impact)
     area(r, len, w)  decoration added to its zone (with update(prog, dt))
     cast(k)          a flourish on the caster when it goes off
     on[event](k)     replaces the generic burst for that ability's effect events
                      (nova, shock, boom, beam, cone, healfx, buff, shield, dash, blink, impact, aim)
   The server tags events, projectiles and zones with `ab`; anything without an entry here
   falls back to the generic effects in mobaRenderer. `k` carries the effect system, the event,
   positions (x, y = caster or event point; tx, ty = target), the entity and shake(). */
import * as THREE from 'three';
import { makeGlowTexture } from './glow.js';

const TAU = Math.PI * 2;
const glowTex = makeGlowTexture();
const geoCache = new Map();
const g = (key, make) => { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); };
const add = THREE.AdditiveBlending;
const basic = (color, o = {}) => new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, ...o });
const lit = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...o });
const glowSprite = (color, size, opacity = 0.9) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, depthWrite: false, blending: add }));
  s.scale.setScalar(size);
  return s;
};
const rand = (a, b) => a + Math.random() * (b - a);

/* ---------------- building blocks ---------------- */

/** Spikes erupting from the ground in a ring or scattered disc (rock, ice, thorns, roots). */
function spikes(fx, x, z, { count = 10, radius = 3, color = 0x8d7b68, height = 1.6, life = 0.9, scatter = false, emissive = 0, thin = 0.22 } = {}) {
  const grp = new THREE.Group();
  const geo = g(`spike${thin}`, () => new THREE.ConeGeometry(thin, 1, 5));
  const mat = lit(color, { emissive, emissiveIntensity: emissive ? 0.8 : 0, flatShading: true });
  const n = Math.max(4, Math.round(count * fx.budget));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rand(-0.2, 0.2), d = scatter ? Math.sqrt(Math.random()) * radius : radius * rand(0.75, 1);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x + Math.cos(a) * d, 0, z + Math.sin(a) * d);
    m.rotation.set(rand(-0.35, 0.35), rand(0, TAU), rand(-0.35, 0.35));
    m.userData.h = height * rand(0.6, 1.2);
    grp.add(m);
  }
  fx.add(grp, life, (o, t) => {
    const up = t < 0.15 ? t / 0.15 : t > 0.75 ? Math.max(0, 1 - (t - 0.75) / 0.25) : 1;
    for (const m of o.children) { m.scale.set(1, Math.max(0.01, m.userData.h * up), 1); m.position.y = (m.userData.h * up) / 2 - 0.05; }
  });
}

/** Chunks of debris thrown up and falling back (rock, ice, bark). */
function debris(fx, x, z, { count = 10, color = 0x8d7b68, speed = 5, size = 0.22, life = 1, y = 0.4 } = {}) {
  const grp = new THREE.Group();
  const geo = g('chunk', () => new THREE.DodecahedronGeometry(1, 0));
  const mat = lit(color, { flatShading: true });
  const n = Math.max(3, Math.round(count * fx.budget));
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, mat);
    const a = rand(0, TAU), s = speed * rand(0.4, 1);
    m.position.set(x, y, z);
    m.scale.setScalar(size * rand(0.5, 1.3));
    m.userData.v = new THREE.Vector3(Math.cos(a) * s * 0.5, s * rand(0.6, 1.1), Math.sin(a) * s * 0.5);
    m.userData.r = new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8));
    grp.add(m);
  }
  fx.add(grp, life, (o, t, dt) => {
    for (const m of o.children) {
      const v = m.userData.v;
      v.y -= 18 * dt;
      m.position.addScaledVector(v, dt);
      if (m.position.y < 0.1) { m.position.y = 0.1; v.set(v.x * 0.5, Math.abs(v.y) * 0.25, v.z * 0.5); }
      m.rotation.x += m.userData.r.x * dt; m.rotation.y += m.userData.r.y * dt;
      if (t > 0.8) m.scale.multiplyScalar(0.9);
    }
  });
}

/** A jagged lightning bolt from the sky to (x, z). */
function bolt(fx, x, z, { color = 0xfde047, height = 9, life = 0.28, width = 2 } = {}) {
  const pts = [];
  const segs = 9;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    pts.push(new THREE.Vector3(x + (i && i < segs ? rand(-0.5, 0.5) : 0), height * (1 - t), z + (i && i < segs ? rand(-0.5, 0.5) : 0)));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, blending: add, linewidth: width }));
  line.userData.ownGeo = true;
  const grp = new THREE.Group();
  grp.add(line);
  const flash = glowSprite(color, 4);
  flash.position.set(x, 0.6, z);
  grp.add(flash);
  fx.add(grp, life, (o, t) => { line.material.opacity = t < 0.5 ? 1 : 1 - (t - 0.5) * 2; flash.material.opacity = 1 - t; line.visible = Math.random() > 0.15; });
}

/** Something streaking down from the sky (star, meteor) and landing at (x, z) after `delay`. */
function fallFrom(fx, x, z, { color = 0x7dd3fc, size = 0.6, delay = 0.5, height = 12, from = 4, core = 0xffffff, onLand } = {}) {
  const grp = new THREE.Group();
  const head = new THREE.Mesh(g('fallHead', () => new THREE.SphereGeometry(1, 12, 10)), basic(core, { blending: add }));
  head.scale.setScalar(size);
  const halo = glowSprite(color, size * 6);
  grp.add(head, halo);
  const sx = x - from, sz = z - from * 0.4;
  fx.add(grp, delay, (o, t) => {
    const k = t * t;
    o.position.set(sx + (x - sx) * k, height * (1 - k) + 0.5, sz + (z - sz) * k);
    fx.trail(o.position.x, o.position.y, o.position.z, color, size * 1.6);
    if (t >= 0.999 && !o.userData.landed) { o.userData.landed = true; onLand?.(); }
  });
  setTimeout(() => onLand && !grp.userData.landed && (grp.userData.landed = true, onLand()), delay * 1000 + 40);
}

/** A translucent dome (shield, bubble, eclipse, aegis). */
function dome(fx, x, z, { radius = 2, color = 0xfde68a, life = 0.8, opacity = 0.35, grow = true, y = 0, full = false } = {}) {
  const geo = g(full ? 'sphere' : 'dome', () => new THREE.SphereGeometry(1, 32, 16, 0, TAU, 0, full ? Math.PI : Math.PI / 2));
  const m = new THREE.Mesh(geo, basic(color, { opacity, blending: add, side: THREE.DoubleSide }));
  m.position.set(x, y, z);
  fx.add(m, life, (o, t) => {
    const s = grow ? radius * Math.min(1, 0.3 + t * 3) : radius;
    o.scale.setScalar(s);
    o.material.opacity = opacity * (t > 0.6 ? (1 - t) / 0.4 : 1);
  });
}

/** Particles spiralling inwards or upwards (whirlpool, frost aura, tornado). */
function swirl(fx, x, z, { color = 0x67e8f9, radius = 2.5, count = 24, life = 0.9, rise = 0, inward = true, size = 0.3, speed = 6 } = {}) {
  const grp = new THREE.Group();
  const n = Math.max(6, Math.round(count * fx.budget));
  for (let i = 0; i < n; i++) {
    const s = glowSprite(color, size, 0.95);
    s.userData = { a: (i / n) * TAU, r: radius * rand(0.6, 1), y: rand(0.1, 0.6) };
    grp.add(s);
  }
  fx.add(grp, life, (o, t) => {
    for (const s of o.children) {
      const d = s.userData;
      const rr = inward ? d.r * (1 - t * 0.9) : d.r * (0.4 + t * 0.6);
      const a = d.a + t * speed;
      s.position.set(x + Math.cos(a) * rr, d.y + rise * t, z + Math.sin(a) * rr);
      s.material.opacity = 1 - t * 0.8;
    }
  });
}

/** Expanding rings, one after another (war cry, sound waves). */
function waves(fx, x, z, { color = 0xf59e0b, radius = 5, count = 3, gap = 0.12, life = 0.6 } = {}) {
  for (let i = 0; i < count; i++) setTimeout(() => fx.ring(x, z, { color, radius, life, y: 0.4 + i * 0.25 }), i * gap * 1000);
}

/** A rolling wall of water along a line (Tsunami). */
function tidalWave(fx, x1, z1, x2, z2, { width = 3, color = 0x38bdf8, life = 1.1 } = {}) {
  const ang = Math.atan2(z2 - z1, x2 - x1);
  const grp = new THREE.Group();
  const wallGeo = g('waveWall', () => { const geo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true, -Math.PI / 2, Math.PI); geo.rotateZ(Math.PI / 2); return geo; });
  const wall = new THREE.Mesh(wallGeo, basic(color, { opacity: 0.55, side: THREE.DoubleSide }));
  wall.scale.set(1.6, width, 1.6);
  const foam = new THREE.Mesh(wallGeo, basic(0xe0f2fe, { opacity: 0.6, blending: add, side: THREE.DoubleSide }));
  foam.scale.set(1.75, width * 1.02, 1.75);
  grp.add(wall, foam);
  grp.rotation.y = -ang;
  const len = Math.hypot(x2 - x1, z2 - z1);
  fx.add(grp, life, (o, t) => {
    const d = len * t;
    o.position.set(x1 + Math.cos(ang) * d, 0, z1 + Math.sin(ang) * d);
    wall.material.opacity = 0.55 * (t > 0.8 ? (1 - t) / 0.2 : 1);
    foam.material.opacity = 0.6 * (t > 0.8 ? (1 - t) / 0.2 : 1);
    if (Math.random() < 0.6) fx.burst(o.position.x, o.position.z, { y: 1.8, color: 0xe0f2fe, count: 3, speed: 3, up: 3, life: 0.5, size: 0.2 });
  });
}

/** Flames leaping out in a cone (Flame Fan) or any particle cone. */
function cone(fx, x, z, angle, range, { color = 0xf97316, count = 26, spread = 0.6, size = 0.6, life = 0.55, smoke = 0 } = {}) {
  const n = Math.max(6, Math.round(count * fx.budget));
  const grp = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const s = glowSprite(i % 3 ? color : 0xfde68a, size * rand(0.7, 1.4), 0.95);
    s.userData = { a: angle + rand(-spread, spread), s: range * rand(0.7, 1.2), d: rand(0, 0.25) };
    grp.add(s);
  }
  fx.add(grp, life, (o, t) => {
    for (const s of o.children) {
      const d = s.userData, k = Math.max(0, t - d.d) / (1 - d.d);
      s.position.set(x + Math.cos(d.a) * d.s * k, 0.9 + k * 0.6, z + Math.sin(d.a) * d.s * k);
      s.material.opacity = 1 - k;
      s.scale.setScalar(s.scale.x * (1 + 0.02));
    }
  });
  if (smoke) fx.smoke(x + Math.cos(angle) * range * 0.6, z + Math.sin(angle) * range * 0.6, { count: smoke, radius: range * 0.3, color: 0x3f3f46, life: 1.2 });
}

/** Chains or links drawn between two points that snap tight then fade. */
function chain(fx, x1, z1, x2, z2, { color = 0xfde047, links = 12, life = 0.5, y = 1 } = {}) {
  const grp = new THREE.Group();
  const geo = g('link', () => new THREE.TorusGeometry(0.16, 0.05, 6, 12));
  const mat = basic(color, { blending: add, opacity: 1 });
  for (let i = 0; i <= links; i++) {
    const t = i / links, m = new THREE.Mesh(geo, mat);
    m.position.set(x1 + (x2 - x1) * t, y, z1 + (z2 - z1) * t);
    m.rotation.set(i % 2 ? Math.PI / 2 : 0, -Math.atan2(z2 - z1, x2 - x1), 0);
    grp.add(m);
  }
  fx.add(grp, life, (o, t) => { mat.opacity = 1 - t; });
}

/** A projectile-shaped flash: muzzle flash or launch puff. */
function flash(fx, x, z, color, size = 2.5, life = 0.15, y = 1.1) { fx.glow(x, z, { y, color, size, life }); }

/* ---------------- projectile meshes ---------------- */
const P = {
  rock() {
    const root = new THREE.Group();
    const rock = new THREE.Mesh(g('rockP', () => new THREE.DodecahedronGeometry(0.42, 0)), lit(0x8d7b68, { emissive: 0xff7a1a, emissiveIntensity: 0.15, flatShading: true }));
    root.add(rock, glowSprite(0xff9a3c, 1.6, 0.45));
    return { root, parts: { core: rock }, tumble: true, trail: [0xb08968, 0.7], smoke: 0x6b5a48, impact: (fx, x, z) => { debris(fx, x, z, { count: 10, color: 0x8d7b68, speed: 5 }); fx.smoke(x, z, { count: 4, radius: 0.8, color: 0x7c6a58 }); } };
  },
  lightChain() {
    const root = new THREE.Group();
    const geo = g('link', () => new THREE.TorusGeometry(0.16, 0.05, 6, 12));
    const mat = basic(0xfde047, { blending: add });
    for (let i = 0; i < 5; i++) { const l = new THREE.Mesh(geo, mat); l.position.z = -i * 0.26; l.rotation.set(0, i % 2 ? Math.PI / 2 : 0, 0); root.add(l); }
    root.add(glowSprite(0xfef08a, 2.4, 0.8));
    return { root, parts: {}, trail: [0xfef08a, 0.6], impact: (fx, x, z) => { fx.ring(x, z, { color: 0xfde047, radius: 1.4, life: 0.5, y: 0.3 }); fx.sparks(x, z, { color: 0xfef9c3, count: 10, speed: 4 }); } };
  },
  shuriken() {
    const root = new THREE.Group();
    const shape = new THREE.Shape();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU, r = i % 2 ? 0.12 : 0.5; i ? shape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : shape.moveTo(r, 0); }
    const star = new THREE.Mesh(g('shuri', () => new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false }).rotateX(Math.PI / 2)), new THREE.MeshStandardMaterial({ color: 0xd4d4d8, metalness: 0.9, roughness: 0.25, emissive: 0x6d28d9, emissiveIntensity: 0.3 }));
    root.add(star, glowSprite(0x8b5cf6, 1.4, 0.5));
    return { root, parts: { core: star }, spin: 26, trail: [0x7c3aed, 0.45] };
  },
  iceArrow() {
    const root = new THREE.Group();
    const shaft = new THREE.Mesh(g('shaft', () => new THREE.CylinderGeometry(0.03, 0.03, 1.1, 5).rotateX(Math.PI / 2)), lit(0xe2e8f0));
    const head = new THREE.Mesh(g('ahead', () => new THREE.ConeGeometry(0.1, 0.3, 6).rotateX(Math.PI / 2)), basic(0xbae6fd, { blending: add }));
    head.position.z = 0.65;
    const fl = new THREE.Mesh(g('fletch', () => new THREE.PlaneGeometry(0.22, 0.25)), basic(0x93c5fd, { side: THREE.DoubleSide, opacity: 0.9 }));
    fl.position.z = -0.5;
    root.add(shaft, head, fl, glowSprite(0x93c5fd, 1, 0.55));
    return { root, parts: {}, trail: [0xbae6fd, 0.35], impact: (fx, x, z) => fx.sparks(x, z, { color: 0xe0f2fe, count: 8, speed: 3 }) };
  },
  iceSpear() {
    const root = new THREE.Group();
    const spear = new THREE.Mesh(g('iceSpear', () => new THREE.ConeGeometry(0.32, 2.6, 6).rotateX(Math.PI / 2)), new THREE.MeshStandardMaterial({ color: 0xa5f3fc, emissive: 0x22d3ee, emissiveIntensity: 0.6, transparent: true, opacity: 0.9, roughness: 0.1, metalness: 0.2, flatShading: true }));
    root.add(spear, glowSprite(0x67e8f9, 4, 0.7));
    return { root, parts: { core: spear }, roll: 3, trail: [0xa5f3fc, 1.1], frost: true };
  },
  fireball() {
    const root = new THREE.Group();
    const core = new THREE.Mesh(g('fcore', () => new THREE.SphereGeometry(0.26, 12, 10)), basic(0xfff7ed, { blending: add }));
    const flames = [0, 1, 2].map(i => { const s = glowSprite(i ? 0xf97316 : 0xfbbf24, 1.6 - i * 0.3, 0.9); root.add(s); return s; });
    root.add(core);
    return { root, parts: { core }, flicker: flames, trail: [0xf97316, 0.9], smoke: 0x44403c, impact: (fx, x, z) => { fx.explosion(x, z, 1.2, 0xf97316); fx.burst(x, z, { color: 0xfbbf24, count: 14, speed: 4, life: 0.7 }); } };
  },
  bullet(color = 0xfde68a, len = 1.8) {
    const root = new THREE.Group();
    const tracer = new THREE.Mesh(g(`tracer${len}`, () => new THREE.CylinderGeometry(0.035, 0.01, len, 5).rotateX(Math.PI / 2).translate(0, 0, -len / 2)), basic(color, { blending: add }));
    root.add(tracer, glowSprite(color, 0.9, 0.9));
    return { root, parts: {}, trail: [color, 0.25] };
  },
  bola() {
    const root = new THREE.Group();
    const ballGeo = g('bolaBall', () => new THREE.SphereGeometry(0.14, 8, 6)), mat = lit(0x57534e);
    const a = new THREE.Mesh(ballGeo, mat), b = new THREE.Mesh(ballGeo, mat);
    a.position.x = 0.45; b.position.x = -0.45;
    const rope = new THREE.Mesh(g('rope', () => new THREE.CylinderGeometry(0.02, 0.02, 0.9, 4).rotateZ(Math.PI / 2)), lit(0xd6b98c));
    const spinner = new THREE.Group();
    spinner.add(a, b, rope);
    root.add(spinner);
    return { root, parts: { core: spinner }, spin: 14, trail: [0xd6d3d1, 0.3], impact: (fx, x, z) => { fx.ring(x, z, { color: 0xd6b98c, radius: 1.1, life: 0.6, y: 0.5 }); fx.burst(x, z, { color: 0xd6d3d1, count: 8, speed: 2 }); } };
  },
  handAxe(color = 0x84cc16) {
    const root = new THREE.Group();
    const spinner = new THREE.Group();
    const handle = new THREE.Mesh(g('axeHandle', () => new THREE.BoxGeometry(0.08, 0.08, 0.9)), lit(0x5b3a1e));
    const blade = new THREE.Mesh(g('axeBlade', () => new THREE.CylinderGeometry(0.32, 0.32, 0.05, 12, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2)), new THREE.MeshStandardMaterial({ color: 0xd4d4d8, metalness: 0.85, roughness: 0.3, emissive: color, emissiveIntensity: 0.25 }));
    blade.position.z = 0.4;
    spinner.add(handle, blade);
    root.add(spinner, glowSprite(color, 1.4, 0.4));
    return { root, parts: { core: spinner }, spinX: 18, trail: [color, 0.5] };
  },
  waterLance() {
    const root = new THREE.Group();
    const lance = new THREE.Mesh(g('lance', () => new THREE.ConeGeometry(0.22, 2, 10).rotateX(Math.PI / 2)), basic(0x38bdf8, { opacity: 0.75 }));
    const core = new THREE.Mesh(g('lanceCore', () => new THREE.ConeGeometry(0.1, 1.8, 8).rotateX(Math.PI / 2)), basic(0xe0f2fe, { blending: add }));
    root.add(lance, core, glowSprite(0x7dd3fc, 2.4, 0.6));
    return { root, parts: {}, trail: [0x7dd3fc, 0.8], droplets: true, impact: (fx, x, z) => { fx.burst(x, z, { color: 0xbae6fd, count: 18, speed: 4, up: 4, life: 0.7, size: 0.2 }); fx.ring(x, z, { color: 0x38bdf8, radius: 1.3, life: 0.5, y: 0.2 }); } };
  },
  vine() {
    const root = new THREE.Group();
    const vine = new THREE.Mesh(g('vine', () => new THREE.CylinderGeometry(0.07, 0.12, 1.6, 6).rotateX(Math.PI / 2)), lit(0x3f6212));
    root.add(vine);
    const thorn = g('thorn', () => new THREE.ConeGeometry(0.05, 0.22, 4));
    for (let i = 0; i < 6; i++) { const t = new THREE.Mesh(thorn, lit(0x854d0e)); t.position.set(Math.cos(i * 2) * 0.1, Math.sin(i * 2) * 0.1, -0.6 + i * 0.24); t.rotation.z = i * 2; root.add(t); }
    root.add(glowSprite(0x84cc16, 1.2, 0.35));
    return { root, parts: {}, wiggle: true, trail: [0x65a30d, 0.4], impact: (fx, x, z) => { spikes(fx, x, z, { count: 7, radius: 0.7, color: 0x4d7c0f, height: 1.1, life: 1.2, thin: 0.09 }); fx.burst(x, z, { color: 0x84cc16, count: 8, speed: 2 }); } };
  },
};

/* ---------------- per-ability effects ---------------- */
export const ABILITY_FX = {
  /* Garrok: earth */
  garrok_q: { proj: P.rock, cast: k => k.fx.burst(k.x, k.y, { color: 0xb08968, count: 6, speed: 2, life: 0.5 }) },
  garrok_w: { on: { buff: k => { for (let i = 0; i < 3; i++) setTimeout(() => bolt(k.fx, k.x + rand(-0.6, 0.6), k.y + rand(-0.6, 0.6), { color: 0xfde047 }), i * 90); k.fx.ring(k.x, k.y, { color: 0xfacc15, radius: 1.6, life: 0.4, y: 0.6 }); } } },
  garrok_e: { on: { nova: k => { spikes(k.fx, k.x, k.y, { count: 14, radius: k.ev.r * 0.8, height: 1.4 }); debris(k.fx, k.x, k.y, { count: 12 }); k.fx.shockwave(k.x, k.y, { color: 0xb08968, radius: k.ev.r, height: 0.8 }); k.fx.smoke(k.x, k.y, { count: 6, radius: k.ev.r * 0.6, color: 0x7c6a58 }); k.shake(0.2); } } },
  garrok_r: {
    on: { dash: k => k.fx.smoke(k.x, k.y, { count: 4, radius: 0.8, color: 0x7c6a58 }),
      shock: k => { spikes(k.fx, k.x, k.y, { count: 18, radius: k.ev.r, height: 2.2, scatter: true }); debris(k.fx, k.x, k.y, { count: 20, speed: 7, size: 0.3 }); k.fx.scorch(k.x, k.y, k.ev.r * 0.8); k.fx.shockwave(k.x, k.y, { color: 0xd6a35c, radius: k.ev.r * 1.2, height: 2 }); k.fx.smoke(k.x, k.y, { count: 10, radius: k.ev.r, color: 0x7c6a58, life: 1.6 }); k.shake(0.45); } },
  },

  /* Lyra: dawn light */
  lyra_q: { proj: P.lightChain, cast: k => flash(k.fx, k.x, k.y, 0xfde047, 2) },
  lyra_w: { on: { healfx: k => { dome(k.fx, k.x, k.y, { radius: 2.4, color: 0xfde68a, life: 0.9 }); swirl(k.fx, k.x, k.y, { color: 0xfef9c3, radius: 2.2, rise: 2.5, inward: false, count: 20 }); } } },
  lyra_e: {
    area: r => sunDisc(r),
    on: { boom: k => { k.fx.pillar(k.x, k.y, 0xfef08a, 0.6, 7); k.fx.blast(k.x, k.y, k.ev.r, 0xfde047); k.fx.sparks(k.x, k.y, { color: 0xfef9c3, count: 24, speed: 7 }); } },
  },
  lyra_r: {
    cast: k => swirl(k.fx, k.x, k.y, { color: 0xfef08a, radius: 3, count: 30, life: 0.75, rise: 1.2 }),
    on: { beam: k => { k.fx.beam(k.ev.x, k.ev.y, k.ev.x2, k.ev.y2, { width: k.ev.w * 1.4, color: 0xfde047, life: 0.7 }); k.fx.beam(k.ev.x, k.ev.y, k.ev.x2, k.ev.y2, { width: k.ev.w * 0.5, color: 0xffffff, life: 0.5 }); k.shake(0.25); } },
  },

  /* Kaelen: shadow */
  kaelen_q: { proj: P.shuriken },
  kaelen_w: { on: { dash: k => { k.fx.smoke(k.x, k.y, { count: 6, radius: 0.8, color: 0x2e1065, life: 0.9 }); k.fx.glow(k.x, k.y, { color: 0x7c3aed, size: 2.5, life: 0.3 }); } } },
  kaelen_e: { on: { nova: k => { for (let i = 0; i < 3; i++) k.fx.slash(k.x, k.y, (i / 3) * TAU + rand(0, 1), k.ev.r, 0xa78bfa); k.fx.smoke(k.x, k.y, { count: 5, radius: k.ev.r * 0.6, color: 0x1e1b4b }); k.fx.ring(k.x, k.y, { color: 0x7c3aed, radius: k.ev.r, life: 0.35 }); } } },
  kaelen_r: {
    on: { blink: k => { dome(k.fx, k.ev.x, k.ev.y, { radius: 1.2, color: 0x4c1d95, life: 0.5, opacity: 0.5, full: true }); k.fx.smoke(k.ev.x2, k.ev.y2, { count: 6, radius: 0.8, color: 0x2e1065 }); },
      boom: k => { dome(k.fx, k.x, k.y, { radius: k.ev.r, color: 0x6d28d9, life: 0.45, opacity: 0.45, full: true, grow: false }); k.fx.slash(k.x, k.y, Math.PI / 4, k.ev.r * 1.3, 0xc4b5fd); k.fx.slash(k.x, k.y, -Math.PI / 4, k.ev.r * 1.3, 0xc4b5fd); k.fx.sparks(k.x, k.y, { color: 0xa78bfa, count: 20, speed: 6 }); k.shake(0.2); } },
  },

  /* Hale: frost */
  hale_q: { on: { buff: k => { swirl(k.fx, k.x, k.y, { color: 0xbae6fd, radius: 1.3, count: 22, life: 1.2, rise: 2.2, inward: false, speed: 8 }); k.fx.ring(k.x, k.y, { color: 0x93c5fd, radius: 1.5, life: 0.5 }); } } },
  hale_w: { proj: P.iceArrow, cast: k => k.fx.burst(k.x, k.y, { color: 0xe0f2fe, count: 8, speed: 2, life: 0.4 }) },
  hale_e: { on: { dash: k => k.fx.burst(k.x, k.y, { color: 0xf1f5f9, count: 14, speed: 3, up: 2, life: 0.6, size: 0.2 }) } },
  hale_r: {
    proj: P.iceSpear,
    cast: k => flash(k.fx, k.x, k.y, 0x67e8f9, 3),
    on: { boom: k => { spikes(k.fx, k.x, k.y, { count: 12, radius: k.ev.r * 0.7, color: 0xa5f3fc, emissive: 0x0891b2, height: 1.8, scatter: true, life: 1.3 }); k.fx.ring(k.x, k.y, { color: 0x67e8f9, radius: k.ev.r, life: 0.6 }); k.fx.burst(k.x, k.y, { color: 0xf0f9ff, count: 22, speed: 5, up: 3, life: 0.9, size: 0.2 }); k.shake(0.2); } },
  },

  /* Thorne: iron and blood */
  thorne_q: {
    area: r => spinningBlades(r, 0xdc2626),
    on: { shock: k => { k.fx.slash(k.x, k.y, rand(0, TAU), k.ev.r, 0xef4444); k.fx.slash(k.x, k.y, rand(0, TAU), k.ev.r, 0x991b1b); k.fx.shockwave(k.x, k.y, { color: 0xdc2626, radius: k.ev.r, height: 1 }); k.fx.burst(k.x, k.y, { color: 0x991b1b, count: 18, speed: 5 }); } },
  },
  thorne_w: { on: { buff: k => { k.fx.glow(k.x, k.y, { y: 1.4, color: 0xef4444, size: 2.5, life: 0.35 }); k.fx.sparks(k.x, k.y, { y: 1.4, color: 0xfca5a5, count: 10, speed: 3 }); } } },
  thorne_e: { on: { cone: k => { for (let i = -1; i <= 1; i++) { const a = k.ev.a + i * 0.35; chain(k.fx, k.x, k.y, k.x + Math.cos(a) * k.ev.r, k.y + Math.sin(a) * k.ev.r, { color: 0x9ca3af, links: 14, life: 0.55 }); } k.fx.sparks(k.x, k.y, { color: 0xfca5a5, count: 10, speed: 4 }); } } },
  thorne_r: { on: { blink: k => k.fx.slash(k.ev.x2, k.ev.y2, rand(0, TAU), 2, 0xef4444),
    boom: k => { k.fx.slash(k.x, k.y, 0, k.ev.r * 1.4, 0xdc2626); k.fx.scorch(k.x, k.y, k.ev.r * 0.6); debris(k.fx, k.x, k.y, { count: 10, color: 0x57534e }); k.fx.shockwave(k.x, k.y, { color: 0x991b1b, radius: k.ev.r * 1.2, height: 1.5 }); k.shake(0.35); } } },

  /* Mira: moon and stars */
  mira_q: {
    area: (r, len, w, dur) => fallingStar(r, dur),
    on: { boom: k => { k.fx.sparks(k.x, k.y, { color: 0xe0f2fe, count: 26, speed: 6 }); k.fx.ring(k.x, k.y, { color: 0x7dd3fc, radius: k.ev.r, life: 0.5 }); k.fx.glow(k.x, k.y, { y: 0.5, color: 0xbae6fd, size: 4, life: 0.3 }); } },
  },
  mira_w: { on: { healfx: k => { k.fx.pillar(k.x, k.y, 0x7dd3fc, 0.9, 6); swirl(k.fx, k.x, k.y, { color: 0xe0f2fe, radius: 1.2, count: 16, rise: 2.5, inward: false, speed: 4 }); } } },
  mira_e: { area: r => eclipseDome(r) },
  mira_r: { on: { healfx: k => { k.fx.pillar(k.x, k.y, 0xbae6fd, 1.2, 10); k.fx.ring(k.x, k.y, { color: 0x7dd3fc, radius: 8, life: 1 }); swirl(k.fx, k.x, k.y, { color: 0xe0f2fe, radius: 4, count: 30, rise: 4, inward: true, life: 1.3 }); } } },

  /* Zarak: fire */
  zarak_q: { proj: P.fireball, cast: k => flash(k.fx, k.x, k.y, 0xf97316) },
  zarak_w: { on: { cone: k => { cone(k.fx, k.x, k.y, k.ev.a, k.ev.r, { color: 0xf97316, count: 30, spread: 0.55, smoke: 3 }); k.fx.scorch(k.x + Math.cos(k.ev.a) * k.ev.r * 0.6, k.y + Math.sin(k.ev.a) * k.ev.r * 0.6, 1.4, 2); } } },
  zarak_e: { cast: k => { swirl(k.fx, k.x, k.y, { color: 0xfb923c, radius: 1.4, count: 18, life: 1.6, rise: 0.8, inward: false, speed: 10, size: 0.4 }); dome(k.fx, k.x, k.y, { radius: 1.5, color: 0xf97316, life: 0.7, opacity: 0.25, full: true }); } },
  zarak_r: {
    area: r => flames(r),
    on: { shock: k => { fallFrom(k.fx, k.x, k.y, { color: 0xf97316, core: 0xfff7ed, size: 0.9, delay: 0.01, from: 0 }); k.fx.blast(k.x, k.y, k.ev.r, 0xf97316); debris(k.fx, k.x, k.y, { count: 14, color: 0x44403c, speed: 6 }); k.fx.scorch(k.x, k.y, k.ev.r, 5); k.fx.smoke(k.x, k.y, { count: 8, radius: k.ev.r, color: 0x292524, life: 2 }); k.shake(0.4); } },
    cast: k => k.tx !== undefined && fallFrom(k.fx, k.tx, k.ty, { color: 0xf97316, core: 0xfff7ed, size: 1, delay: 0.45, height: 16, from: 6 }),
  },

  /* Nyra: frontier steel */
  nyra_q: { proj: () => P.bullet(0xfde68a, 2.4), cast: k => { flash(k.fx, k.x, k.y, 0xfde68a, 2.4, 0.12); k.fx.smoke(k.x, k.y, { count: 2, radius: 0.3, color: 0xa8a29e, life: 0.8 }); } },
  nyra_w: { cast: k => k.tx !== undefined && k.fx.burst(k.tx, k.ty, { color: 0xa8a29e, count: 8, speed: 2, life: 0.5 }) },
  nyra_e: { proj: P.bola, cast: k => flash(k.fx, k.x, k.y, 0xfde68a, 1.6, 0.1) },
  nyra_r: {
    proj: () => P.bullet(0xfbbf24, 3.5),
    on: { aim: k => { const u = k.get(k.ev.to); if (u) reticle(k.fx, u.x, u.y); }, impact: k => { k.fx.sparks(k.x, k.y, { color: 0xfde68a, count: 14, speed: 6 }); k.shake(0.15); } },
  },

  /* Brakka: the herd */
  brakka_q: { on: { shock: k => { cracks(k.fx, k.x, k.y, k.ev.r); debris(k.fx, k.x, k.y, { count: 14, speed: 6 }); k.fx.shockwave(k.x, k.y, { color: 0xd6a35c, radius: k.ev.r, height: 1.2 }); k.fx.smoke(k.x, k.y, { count: 6, radius: k.ev.r * 0.6, color: 0x7c6a58 }); k.shake(0.3); } } },
  brakka_w: { on: { dash: k => { k.fx.smoke(k.x, k.y, { count: 5, radius: 0.7, color: 0x8b7355 }); k.fx.burst(k.x, k.y, { color: 0xd6a35c, count: 8, speed: 2 }); } } },
  brakka_e: { on: { healfx: k => { waves(k.fx, k.x, k.y, { color: 0xf59e0b, radius: k.ev.r, count: 3 }); k.fx.burst(k.x, k.y, { y: 2, color: 0x84cc16, count: 14, speed: 3, up: 2, life: 0.9 }); } } },
  brakka_r: { on: { buff: k => { dome(k.fx, k.x, k.y, { radius: 1.5, color: 0x67e8f9, life: 0.8, opacity: 0.4, full: true }); k.fx.sparks(k.x, k.y, { color: 0xe0f2fe, count: 18, speed: 5 }); k.fx.ring(k.x, k.y, { color: 0x22d3ee, radius: 2, life: 0.5 }); } } },

  /* Rook: storm */
  rook_q: { area: r => tornado(r, 0x86efac) },
  rook_w: { proj: () => P.handAxe(0x84cc16) },
  rook_e: { on: { dash: k => k.fx.burst(k.x, k.y, { color: 0xd1fae5, count: 10, speed: 3, up: 3 }),
    nova: k => { bolt(k.fx, k.x, k.y, { color: 0xbef264 }); k.fx.ring(k.x, k.y, { color: 0x84cc16, radius: k.ev.r, life: 0.4 }); k.fx.sparks(k.x, k.y, { color: 0xecfccb, count: 14, speed: 5 }); k.shake(0.15); } } },
  rook_r: {
    area: r => stormCloud(r),
    on: { shock: k => { for (let i = 0; i < 5; i++) setTimeout(() => bolt(k.fx, k.x + rand(-k.ev.r, k.ev.r) * 0.7, k.y + rand(-k.ev.r, k.ev.r) * 0.7, { color: i % 2 ? 0xbef264 : 0xffffff }), i * 50); k.fx.shockwave(k.x, k.y, { color: 0x84cc16, radius: k.ev.r, height: 2.2 }); k.shake(0.4); } },
  },

  /* Thessa: the tide */
  thessa_q: { proj: P.waterLance },
  thessa_w: {
    area: r => whirlpool(r),
    on: { nova: k => { swirl(k.fx, k.x, k.y, { color: 0x7dd3fc, radius: k.ev.r, count: 28, life: 0.6, inward: true, speed: 9 }); k.fx.burst(k.x, k.y, { color: 0xbae6fd, count: 20, speed: 3, up: 5, life: 0.8, size: 0.2 }); } },
  },
  thessa_e: { on: { shield: k => { if (k.ent) dome(k.fx, k.ent.x, k.ent.y, { radius: 1.3, color: 0xa5f3fc, life: 1.6, opacity: 0.35, full: true, y: 0.9 }); } } },
  thessa_r: { on: { beam: k => { tidalWave(k.fx, k.ev.x, k.ev.y, k.ev.x2, k.ev.y2, { width: k.ev.w * 1.1 }); k.shake(0.25); } } },

  /* Borrin: the forest */
  borrin_q: { proj: P.vine },
  borrin_w: { on: { buff: k => { debris(k.fx, k.x, k.y, { count: 8, color: 0x6b4423, speed: 2, size: 0.15, y: 1.2 }); dome(k.fx, k.x, k.y, { radius: 1.4, color: 0x84cc16, life: 0.6, opacity: 0.3, full: true }); k.fx.burst(k.x, k.y, { y: 1.5, color: 0x65a30d, count: 12, speed: 2, life: 0.9 }); } } },
  borrin_e: { area: r => briars(r) },
  borrin_r: {
    area: r => creepingRoots(r),
    on: { shock: k => { spikes(k.fx, k.x, k.y, { count: 22, radius: k.ev.r, color: 0x5b3a1e, height: 2.6, scatter: true, life: 2.1, thin: 0.16 }); spikes(k.fx, k.x, k.y, { count: 10, radius: k.ev.r * 0.9, color: 0x4d7c0f, height: 1.6, life: 2.1, thin: 0.1 }); k.fx.burst(k.x, k.y, { y: 1, color: 0x84cc16, count: 24, speed: 4, up: 3, life: 1.2 }); k.shake(0.3); } },
  },
};

/* ---------------- zone decorations (return { obj, update(prog, dt) }) ---------------- */
function sunDisc(r) {
  const obj = new THREE.Group();
  const disc = glowSprite(0xfef08a, r * 1.4, 0.55);
  disc.position.y = 0.6;
  const rays = new THREE.Mesh(g('rays', () => { const geo = new THREE.BufferGeometry(); const v = []; for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; v.push(0, 0, 0, Math.cos(a - 0.08), 0, Math.sin(a - 0.08), Math.cos(a + 0.08), 0, Math.sin(a + 0.08)); } geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); return geo; }), basic(0xfde68a, { opacity: 0.35, blending: add, side: THREE.DoubleSide }));
  rays.scale.setScalar(r);
  rays.position.y = 0.12;
  obj.add(disc, rays);
  return { obj, update: (p, dt) => { rays.rotation.y += dt * 0.8; disc.material.opacity = 0.35 + p * 0.5; } };
}
function eclipseDome(r) {
  const obj = new THREE.Group();
  const d = new THREE.Mesh(g('dome', () => new THREE.SphereGeometry(1, 32, 16, 0, TAU, 0, Math.PI / 2)), basic(0x1e1b4b, { opacity: 0.4, side: THREE.DoubleSide }));
  d.scale.setScalar(r);
  const rim = new THREE.Mesh(g('rim', () => new THREE.TorusGeometry(1, 0.03, 6, 64).rotateX(Math.PI / 2)), basic(0xe0e7ff, { blending: add, opacity: 0.9 }));
  rim.scale.setScalar(r);
  rim.position.y = 0.15;
  obj.add(d, rim);
  return { obj, update: (p) => { d.material.opacity = 0.25 + p * 0.25; rim.material.opacity = 0.5 + Math.sin(p * 30) * 0.3; } };
}
function fallingStar(r, dur = 0.8) {
  const obj = new THREE.Group();
  const star = glowSprite(0xe0f2fe, 1.6, 1);
  const tail = glowSprite(0x7dd3fc, 3, 0.6);
  obj.add(star, tail);
  return { obj, update: (p) => { const h = 12 * (1 - p); star.position.set(-3 * (1 - p), h + 0.5, -1.2 * (1 - p)); tail.position.set(-3.6 * (1 - p), h + 1.4, -1.5 * (1 - p)); } };
}
function flames(r) {
  const obj = new THREE.Group();
  const n = 14;
  for (let i = 0; i < n; i++) { const s = glowSprite(i % 2 ? 0xf97316 : 0xfbbf24, rand(0.8, 1.6), 0.8); const a = rand(0, TAU), d = Math.sqrt(Math.random()) * r * 0.9; s.position.set(Math.cos(a) * d, 0.4, Math.sin(a) * d); s.userData.ph = rand(0, 10); obj.add(s); }
  return { obj, update: (p, dt) => { for (const s of obj.children) { s.userData.ph += dt * 9; s.position.y = 0.4 + Math.abs(Math.sin(s.userData.ph)) * 0.6; s.material.opacity = 0.5 + Math.sin(s.userData.ph * 1.7) * 0.3; } } };
}
function spinningBlades(r, color) {
  const obj = new THREE.Group();
  for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(g('bladeArc', () => new THREE.RingGeometry(0.75, 1, 24, 1, 0, Math.PI * 0.6).rotateX(-Math.PI / 2)), basic(color, { opacity: 0.7, blending: add, side: THREE.DoubleSide })); b.scale.setScalar(r); b.position.y = 0.6; b.rotation.y = i * Math.PI; obj.add(b); }
  return { obj, update: (p, dt) => { obj.rotation.y -= dt * 14; } };
}
function tornado(r, color) {
  const obj = new THREE.Group();
  for (let i = 0; i < 4; i++) { const ring = new THREE.Mesh(g('tring', () => new THREE.TorusGeometry(1, 0.04, 4, 32).rotateX(Math.PI / 2)), basic(color, { opacity: 0.6, blending: add })); ring.position.y = 0.3 + i * 0.55; ring.scale.setScalar(r * (0.5 + i * 0.18)); obj.add(ring); }
  return { obj, update: (p, dt) => { obj.rotation.y += dt * 12; obj.children.forEach((c, i) => { c.position.y = 0.3 + i * 0.55 + Math.sin(p * 20 + i) * 0.1; }); } };
}
function stormCloud(r) {
  const obj = new THREE.Group();
  for (let i = 0; i < 7; i++) { const s = glowSprite(0x334155, r * rand(0.6, 0.9), 0.55); s.material.blending = THREE.NormalBlending; s.position.set(rand(-r, r) * 0.5, 4 + rand(0, 0.6), rand(-r, r) * 0.5); obj.add(s); }
  const flashS = glowSprite(0xecfccb, r * 1.5, 0);
  flashS.position.y = 4;
  obj.add(flashS);
  return { obj, update: (p, dt) => { obj.rotation.y += dt * 0.6; flashS.material.opacity = Math.random() < 0.08 ? 0.8 : flashS.material.opacity * 0.85; } };
}
function whirlpool(r) {
  const obj = new THREE.Group();
  const spiral = new THREE.Mesh(g('spiral', () => { const pts = []; for (let i = 0; i <= 120; i++) { const t = i / 120, a = t * TAU * 3; pts.push(new THREE.Vector3(Math.cos(a) * t, 0, Math.sin(a) * t)); } return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.025, 4); }), basic(0x7dd3fc, { opacity: 0.85, blending: add }));
  spiral.scale.setScalar(r);
  spiral.position.y = 0.12;
  obj.add(spiral);
  return { obj, update: (p, dt) => { spiral.rotation.y -= dt * (3 + p * 6); } };
}
function briars(r) {
  const obj = new THREE.Group();
  const geo = g('briar', () => new THREE.ConeGeometry(0.07, 0.6, 4)), mat = lit(0x3f6212, { flatShading: true });
  for (let i = 0; i < 26; i++) { const m = new THREE.Mesh(geo, mat); const a = rand(0, TAU), d = Math.sqrt(Math.random()) * r * 0.95; m.position.set(Math.cos(a) * d, 0.1, Math.sin(a) * d); m.rotation.set(rand(-0.5, 0.5), 0, rand(-0.5, 0.5)); m.userData.h = rand(0.6, 1.3); obj.add(m); }
  return { obj, update: (p) => { const k = Math.min(1, p * 6); for (const m of obj.children) { m.scale.set(1, Math.max(0.01, m.userData.h * k), 1); m.position.y = m.userData.h * k * 0.3; } } };
}
function creepingRoots(r) {
  const obj = new THREE.Group();
  for (let i = 0; i < 8; i++) { const root = new THREE.Mesh(g('rootLine', () => new THREE.CylinderGeometry(0.05, 0.1, 1, 5).rotateZ(Math.PI / 2).translate(0.5, 0, 0)), lit(0x5b3a1e)); root.rotation.y = (i / 8) * TAU + rand(-0.2, 0.2); root.position.y = 0.06; obj.add(root); }
  return { obj, update: (p) => { for (const c of obj.children) c.scale.set(Math.max(0.01, r * p), 1, 1); } };
}
function cracks(fx, x, z, r) {
  const grp = new THREE.Group();
  for (let i = 0; i < 9; i++) { const c = new THREE.Mesh(g('crack', () => new THREE.PlaneGeometry(1, 0.12).translate(0.5, 0, 0).rotateX(-Math.PI / 2)), basic(0x1c1917, { opacity: 0.85 })); c.rotation.y = (i / 9) * TAU + rand(-0.25, 0.25); c.position.set(x, 0.07, z); c.scale.set(r * rand(0.7, 1.1), 1, 1); grp.add(c); }
  fx.add(grp, 1.6, (o, t) => { for (const c of o.children) c.material.opacity = t > 0.6 ? (1 - t) / 0.4 * 0.85 : 0.85; });
}
function reticle(fx, x, z) {
  const grp = new THREE.Group();
  const ring = new THREE.Mesh(g('ret', () => new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2)), basic(0xef4444, { blending: add, side: THREE.DoubleSide }));
  const cross = new THREE.Mesh(g('cross', () => { const a = new THREE.PlaneGeometry(2.6, 0.06).rotateX(-Math.PI / 2), b = new THREE.PlaneGeometry(0.06, 2.6).rotateX(-Math.PI / 2); const geo = new THREE.BufferGeometry(); const pa = a.attributes.position.array, pb = b.attributes.position.array; const idx = [...a.index.array, ...[...b.index.array].map(i => i + 4)]; geo.setAttribute('position', new THREE.Float32BufferAttribute([...pa, ...pb], 3)); geo.setIndex(idx); return geo; }), basic(0xef4444, { blending: add, side: THREE.DoubleSide }));
  grp.add(ring, cross);
  grp.position.set(x, 0.15, z);
  fx.add(grp, 1.0, (o, t) => { const s = 2.2 - t * 1.2; o.scale.set(s, 1, s); o.rotation.y = t * 2; ring.material.opacity = cross.material.opacity = t > 0.85 ? (1 - t) / 0.15 : 1; });
}

/** Builds a projectile view for an ability, or null for the generic one. */
export function abilityProjectile(ab) {
  const spec = ab && ABILITY_FX[ab];
  if (!spec || !spec.proj) return null;
  const p = spec.proj();
  p.root.position.y = 1.1;
  return p;
}

/** Decoration for an ability's zone, or null. */
export function abilityArea(ab, radius, len, width, dur) {
  const spec = ab && ABILITY_FX[ab];
  return spec && spec.area ? spec.area(radius, len, width, dur) : null;
}

/** Plays the ability's own effect for an event; returns true if it replaced the generic one. */
export function abilityEvent(ev, k) {
  const spec = ev.ab && ABILITY_FX[ev.ab];
  const fn = spec && spec.on && spec.on[ev.e];
  if (!fn) return false;
  fn(k);
  return true;
}

/** Cast flourish; returns true if the ability has its own (the generic rune circle is skipped). */
export function abilityCast(ab, k) {
  const spec = ABILITY_FX[ab];
  if (!spec) return false;
  spec.cast?.(k);
  return true;
}

