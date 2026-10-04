/* Short-lived visual effects. Each effect owns its meshes and disposes them. */
import * as THREE from 'three';
import { makeGlowTexture } from './terrain.js';

const ringGeo = new THREE.RingGeometry(0.9, 1.0, 64);
const discGeo = new THREE.CircleGeometry(1, 48);
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
}
