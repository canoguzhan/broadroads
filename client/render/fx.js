/* Short-lived visual effects. Each effect owns its meshes and disposes them. */
import * as THREE from 'three';
import { makeGlowTexture, sparkTexture, smokeTexture, runeTexture, wallTexture, scorchTexture } from './glow.js';

const ringGeo = new THREE.RingGeometry(0.9, 1.0, 64);
const discGeo = new THREE.CircleGeometry(1, 48);
const planeGeo = new THREE.PlaneGeometry(1, 1);
const wallGeo = new THREE.CylinderGeometry(1, 1, 1, 40, 1, true);
const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
const arcGeoCache = new Map();

function arcGeo(range) {
  const key = Math.round(range * 10);
  if (!arcGeoCache.has(key)) arcGeoCache.set(key, new THREE.RingGeometry(range * 0.35, range, 24, 1, -Math.PI / 3, (Math.PI * 2) / 3));
  return arcGeoCache.get(key);
}

export class FxSystem {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.budget = 1;
  }

  setQuality(q) { this.budget = q === 'low' ? 0.4 : q === 'medium' ? 0.7 : 1; }

  add(obj, life, update) {
    this.scene.add(obj);
    this.items.push({ obj, life, max: life, update });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      const t = 1 - Math.max(0, it.life) / it.max;
      if (it.update) it.update(it.obj, t, dt);
      if (it.life <= 0) {
        this.scene.remove(it.obj);
        it.obj.traverse(o => {
          if (o.material) o.material.dispose();
          if (o.geometry && o.userData.ownGeo) o.geometry.dispose();
        });
        this.items.splice(i, 1);
      }
    }
  }

  clear() {
    for (const it of this.items) this.scene.remove(it.obj);
    this.items = [];
  }

  burst(x, z, { y = 0.8, color = 0xffffff, count = 16, speed = 4, life = 0.6, size = 0.18, gravity = 6, up = 2 } = {}) {
    count = Math.max(3, Math.round(count * this.budget));
    const pos = new Float32Array(count * 3);
    const vel = [];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8);
      vel.push([Math.cos(a) * s, up * (0.5 + Math.random()), Math.sin(a) * s]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color, size, map: makeGlowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(g, m);
    pts.userData.ownGeo = true;
    pts.frustumCulled = false;
    this.add(pts, life, (o, t, dt) => {
      const arr = o.geometry.attributes.position.array;
      for (let i = 0; i < count; i++) {
        vel[i][1] -= gravity * dt;
        arr[i * 3] += vel[i][0] * dt;
        arr[i * 3 + 1] = Math.max(0.05, arr[i * 3 + 1] + vel[i][1] * dt);
        arr[i * 3 + 2] += vel[i][2] * dt;
      }
      o.geometry.attributes.position.needsUpdate = true;
      o.material.opacity = 1 - t;
    });
  }

  ring(x, z, { color = 0xffffff, radius = 4, life = 0.5, y = 0.1, from = 0.2 } = {}) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    this.add(m, life, (o, t) => {
      const r = radius * (from + (1 - from) * Math.sin(t * Math.PI / 2));
      o.scale.setScalar(r);
      o.material.opacity = 1 - t;
    });
  }

  disc(x, z, { color = 0xffffff, radius = 4, life = 0.4, opacity = 0.5 } = {}) {
    const m = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.07, z);
    this.add(m, life, (o, t) => {
      o.scale.setScalar(radius * (0.3 + 0.7 * t));
      o.material.opacity = opacity * (1 - t);
    });
  }

  slash(x, z, angle, range, color = 0xffffff) {
    const m = new THREE.Mesh(arcGeo(range), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = -angle;
    m.position.set(x, 0.9, z);
    this.add(m, 0.22, (o, t) => {
      o.material.opacity = 0.85 * (1 - t);
      o.rotation.z = -angle + (t - 0.5) * 0.6;
    });
  }

  pillar(x, z, color = 0xfacc15, life = 1.2, height = 6) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, height, 20, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.userData.ownGeo = true;
    m.position.set(x, height / 2, z);
    this.add(m, life, (o, t) => {
      o.scale.set(1 + t, 1, 1 + t);
      o.material.opacity = 0.6 * (1 - t);
    });
    this.burst(x, z, { color, count: 30, speed: 3, up: 6, gravity: 2, life: 1.2 });
  }

  line(x1, z1, x2, z2, color = 0xc084fc, life = 0.25) {
    const pts = [];
    const n = 8;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const jitter = i === 0 || i === n ? 0 : (Math.random() - 0.5) * 0.6;
      pts.push(new THREE.Vector3(x1 + (x2 - x1) * t + jitter, 1 + Math.random() * 0.3, z1 + (z2 - z1) * t + jitter));
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending }));
    l.userData.ownGeo = true;
    this.add(l, life, (o, t) => { o.material.opacity = 1 - t; });
  }

  glow(x, z, { y = 1, color = 0xffffff, size = 3, life = 0.3 } = {}) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.position.set(x, y, z);
    this.add(s, life, (o, t) => {
      o.scale.setScalar(size * (0.5 + t));
      o.material.opacity = 1 - t;
    });
  }

  explosion(x, z, radius = 1.6, color = 0xfb923c) {
    this.glow(x, z, { y: 0.6, color, size: radius * 2.5, life: 0.35 });
    this.ring(x, z, { color, radius, life: 0.35 });
    this.burst(x, z, { color, count: 14, speed: radius * 3, life: 0.5, y: 0.4 });
  }

  /* ---------------- richer effects ---------------- */

  /** A soft additive sprite that grows and fades (fire puffs, flashes, trails). */
  sprite(x, y, z, { color = 0xffffff, size = 1, grow = 1, life = 0.3, tex = makeGlowTexture(), additive = true, opacity = 1, rise = 0, spin = 0 } = {}) {
    const m = new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, opacity, rotation: Math.random() * Math.PI * 2 });
    const sp = new THREE.Sprite(m);
    sp.position.set(x, y, z);
    sp.scale.setScalar(size);
    this.add(sp, life, (o, t, dt) => {
      o.scale.setScalar(size * (1 + (grow - 1) * t));
      o.position.y += rise * dt;
      o.material.rotation += spin * dt;
      o.material.opacity = opacity * (1 - t) * (1 - t * 0.3);
    });
  }

  /** Sparks: bright star points flung outward with gravity. */
  sparks(x, z, { y = 1, color = 0xffffff, count = 12, speed = 6, life = 0.45, size = 0.35 } = {}) {
    count = Math.max(3, Math.round(count * this.budget));
    const pos = new Float32Array(count * 3), vel = [];
    for (let i = 0; i < count; i++) {
      pos.set([x, y, z], i * 3);
      const a = Math.random() * Math.PI * 2, el = Math.random() * 1.2, sp = speed * (0.5 + Math.random() * 0.7);
      vel.push([Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp + 1.5, Math.sin(a) * Math.cos(el) * sp]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size, map: sparkTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.userData.ownGeo = true;
    pts.frustumCulled = false;
    this.add(pts, life, (o, t, dt) => {
      const arr = o.geometry.attributes.position.array;
      for (let i = 0; i < count; i++) {
        vel[i][1] -= 14 * dt;
        arr[i * 3] += vel[i][0] * dt; arr[i * 3 + 1] = Math.max(0.05, arr[i * 3 + 1] + vel[i][1] * dt); arr[i * 3 + 2] += vel[i][2] * dt;
      }
      o.geometry.attributes.position.needsUpdate = true;
      o.material.opacity = 1 - t;
    });
  }

  /** One trail puff behind a moving projectile. */
  trail(x, y, z, color, size = 0.5) {
    if (Math.random() > this.budget) return;
    this.sprite(x, y, z, { color, size, grow: 0.3, life: 0.28 });
  }

  /** Projectile / attack impact: flash, sparks and a small ring. */
  impact(x, z, { y = 1, color = 0xffffff, big = false } = {}) {
    this.sprite(x, y, z, { color: 0xffffff, size: big ? 2.2 : 1.2, grow: 1.6, life: 0.12 });
    this.sprite(x, y, z, { color, size: big ? 2.6 : 1.5, grow: 1.8, life: 0.25 });
    this.sparks(x, z, { y, color, count: big ? 14 : 7, speed: big ? 7 : 5, life: 0.35, size: big ? 0.45 : 0.32 });
  }

  /** Expanding translucent wall, for shockwaves and slams. */
  shockwave(x, z, { color = 0xffffff, radius = 4, height = 1.4, life = 0.45 } = {}) {
    const m = new THREE.Mesh(wallGeo, new THREE.MeshBasicMaterial({ map: wallTexture(), color, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.set(x, height / 2, z);
    this.add(m, life, (o, t) => {
      const r = radius * Math.sin(t * Math.PI / 2);
      o.scale.set(Math.max(0.01, r), height * (1 - t * 0.6), Math.max(0.01, r));
      o.position.y = o.scale.y / 2;
      o.material.opacity = 1 - t;
    });
  }

  /** Rotating rune circle on the ground. */
  runes(x, z, { color = 0xffffff, radius = 1.5, life = 0.8, spin = 1.5, y = 0.12 } = {}) {
    const m = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ map: runeTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    this.add(m, life, (o, t, dt) => {
      o.rotation.z += spin * dt;
      const s = radius * 2 * (t < 0.15 ? t / 0.15 : 1);
      o.scale.set(s, s, 1);
      o.material.opacity = t < 0.7 ? 1 : (1 - t) / 0.3;
    });
  }

  /** Scorch mark that lingers on the ground. */
  scorch(x, z, radius = 1.5, life = 3) {
    if (this.budget < 0.5) return;
    const m = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ map: scorchTexture(), transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.random() * Math.PI * 2;
    m.position.set(x, 0.065, z);
    m.scale.set(radius * 2, radius * 2, 1);
    this.add(m, life, (o, t) => { o.material.opacity = t < 0.7 ? 1 : (1 - t) / 0.3; });
  }

  /** Smoke puffs drifting up. */
  smoke(x, z, { count = 5, radius = 1, color = 0x444444, life = 1.2 } = {}) {
    count = Math.max(1, Math.round(count * this.budget));
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * radius;
      this.sprite(x + Math.cos(a) * r, 0.6 + Math.random() * 0.6, z + Math.sin(a) * r, { color, size: radius * 1.4, grow: 1.8, life: life * (0.7 + Math.random() * 0.5), tex: smokeTexture(), additive: false, opacity: 0.7, rise: 1.2, spin: 0.5 });
    }
  }

  /** A glowing beam between two points: hot core, wide glow and sparks along it. */
  beam(x1, z1, x2, z2, { width = 1, color = 0xfbbf24, life = 0.4, y = 1 } = {}) {
    const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz) || 0.01;
    const make = (radius, col, opacity) => {
      const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity }));
      m.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
      m.rotation.z = Math.PI / 2;
      m.rotation.y = -Math.atan2(dz, dx);
      m.scale.set(radius, len, radius);
      this.add(m, life, (o, t) => { o.scale.x = o.scale.z = radius * (1 - t * 0.7); o.material.opacity = opacity * (1 - t); });
    };
    make(width * 0.18, 0xffffff, 1);
    make(width * 0.5, color, 0.55);
    const n = Math.min(20, Math.ceil(len / 2));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.sprite(x1 + dx * t, y, z1 + dz * t, { color, size: width * 2.2, grow: 1.5, life: life * 0.9 });
    }
    this.sparks(x2, z2, { y, color, count: 10, speed: 6 });
  }

  /** Big fiery explosion: flash, fireballs, smoke, debris, shockwave and a scorch mark. */
  blast(x, z, radius = 2, color = 0xfb923c) {
    this.sprite(x, 1, z, { color: 0xffffff, size: radius * 2, grow: 1.5, life: 0.15 });
    for (let i = 0; i < Math.max(3, Math.round(6 * this.budget)); i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * radius * 0.5;
      this.sprite(x + Math.cos(a) * r, 0.6 + Math.random(), z + Math.sin(a) * r, { color, size: radius * 1.2, grow: 2, life: 0.45 + Math.random() * 0.2, rise: 1.5 });
    }
    this.shockwave(x, z, { color, radius: radius * 1.2, height: 1, life: 0.4 });
    this.ring(x, z, { color, radius: radius * 1.1, life: 0.4 });
    this.sparks(x, z, { y: 0.8, color, count: 16, speed: radius * 4, life: 0.6 });
    this.smoke(x, z, { count: 4, radius: radius * 0.7, color: 0x3a3330, life: 1.4 });
    this.scorch(x, z, radius * 0.9);
  }
}
