/* Three.js scene management: terrain, entity views, lighting, camera and FX. */
import * as THREE from 'three';
import { buildTerrain } from './terrain.js';
import { buildHero, buildMonster, buildNpc, buildLoot, buildPortal, buildChest, buildProjectile, buildAoe } from './models.js';
import { FxSystem } from './fx.js';
import { F } from '../../shared/constants.js';

const UP = new THREE.Vector3(0, 1, 0);

export class GameRenderer {
  constructor(canvas, quality = 'medium') {
    this.canvas = canvas;
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 300);
    this.zoom = 1;
    this.camTarget = new THREE.Vector3();
    this.shakeAmt = 0;
    this.fx = new FxSystem(this.scene);
    this.views = new Map();
    this.dying = [];
    this.terrain = null;
    this.theme = null;
    this.themeColor = 0xffffff;
    this.time = 0;
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(UP, 0);
    this.tmpV = new THREE.Vector3();

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x334422, 1.2);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.shadow.camera.left = -28; this.sun.shadow.camera.right = 28;
    this.sun.shadow.camera.top = 28; this.sun.shadow.camera.bottom = -28;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 80;
    this.sun.shadow.bias = -0.0005;
    this.heroLight = new THREE.PointLight(0xffd9a0, 0, 20, 1.4);
    this.torchLights = Array.from({ length: 4 }, () => new THREE.PointLight(0xff9a3c, 0, 12, 1.8));
    this.scene.add(this.hemi, this.sun, this.sun.target, this.heroLight, ...this.torchLights);
    this.setQuality(quality);
    this.resize();
  }

  setQuality(q) {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(q === 'low' ? Math.min(1, dpr) * 0.8 : q === 'medium' ? Math.min(1.5, dpr) : Math.min(2, dpr));
    this.renderer.shadowMap.enabled = q !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.sun.castShadow = q !== 'low';
    const size = q === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(size, size);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.fx.setQuality(q);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.width = w; this.height = h;
  }

  /* ---------------- zone ---------------- */
  setZone(zone, map, theme) {
    this.clearViews();
    this.fx.clear();
    if (this.terrain) {
      this.scene.remove(this.terrain.group);
      this.terrain.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
    }
    this.theme = theme;
    this.themeColor = theme.primaryHex;
    this.zoneKind = zone.kind;
    this.terrain = buildTerrain(zone, map, theme, this.quality);
    this.scene.add(this.terrain.group);

    const fogColor = new THREE.Color(theme.fogColor);
    if (zone.kind === 'dungeon') {
      this.scene.background = new THREE.Color(0x050407);
      this.scene.fog = new THREE.Fog(0x050407, 34, 58);
      this.hemi.color.set(new THREE.Color(theme.ambientColor).lerp(new THREE.Color(0xb0b0d0), 0.55));
      this.hemi.groundColor.set(0x1a1622);
      this.hemi.intensity = 1.7;
      this.sun.intensity = 0.6;
      this.sun.color.set(new THREE.Color(theme.primaryHex).lerp(new THREE.Color(0xffffff), 0.5));
      this.heroLight.intensity = 45;
      this.heroLight.color.set(0xffe2b8);
    } else if (zone.kind === 'arena') {
      this.scene.background = fogColor.clone().lerp(new THREE.Color(0x000000), 0.3);
      this.scene.fog = new THREE.Fog(this.scene.background, 50, 100);
      this.hemi.color.set(0xfff1dc);
      this.hemi.groundColor.set(new THREE.Color(theme.ambientColor));
      this.hemi.intensity = 1.3;
      this.sun.intensity = 2.0;
      this.sun.color.set(0xffe7c2);
      this.heroLight.intensity = 0;
    } else {
      const sky = new THREE.Color(0x9cc6e8).lerp(new THREE.Color(theme.sunColor), 0.25);
      this.scene.background = sky;
      this.scene.fog = new THREE.Fog(sky, 45, 90);
      this.hemi.color.set(sky);
      this.hemi.groundColor.set(0x3a4a2a);
      this.hemi.intensity = 1.5;
      this.sun.intensity = 2.6;
      this.sun.color.set(new THREE.Color(0xfff4e0).lerp(new THREE.Color(theme.sunColor), 0.3));
      this.heroLight.intensity = 0;
    }
    for (const l of this.torchLights) { l.intensity = 0; l.visible = this.terrain.torches.length > 0; }
    // Lights that are off are removed from shaders entirely: much cheaper per pixel.
    this.heroLight.visible = this.heroLight.intensity > 0;
  }

  clearViews() {
    for (const v of this.views.values()) this.disposeView(v);
    this.views.clear();
    for (const d of this.dying) this.disposeView(d.view);
    this.dying = [];
  }

  disposeView(v) {
    this.scene.remove(v.root);
    v.root.traverse(o => { if (o.material) o.material.dispose(); });
  }

  /* ---------------- views ---------------- */
  allegianceColor(e, youId) {
    if (e.id === youId) return 0xfacc15;
    if (e.fl & F.HOSTILE) return 0xef4444;
    if (e.fl & F.PARTY) return 0x22c55e;
    return 0x60a5fa;
  }

  addEntity(e, youId) {
    let built;
    switch (e.kind) {
      case 'player': built = buildHero(e.c, this.theme, e.eq || {}); break;
      case 'monster': built = buildMonster(e.t, e.el); break;
      case 'npc': built = buildNpc(e.t, e.col); break;
      case 'loot': built = buildLoot(e.ra, e.lt); break;
      case 'portal': built = buildPortal(e.t, e.t === 'exit' || (e.fl & F.OPEN) !== 0); break;
      case 'chest': built = buildChest((e.fl & F.OPEN) !== 0); break;
      case 'proj': built = buildProjectile(e.s, this.themeColor); break;
      case 'aoe': built = buildAoe(e.s, e.rad, (e.fl & F.HOSTILE) !== 0, this.themeColor); break;
      default: return;
    }
    const view = { root: built.root, parts: built.parts, kind: e.kind, attackT: 0, phase: Math.random() * 10, mats: [] };
    if (e.kind === 'player' || e.kind === 'monster') {
      built.root.traverse(o => { if (o.material && o.material.emissive) view.mats.push({ m: o.material, base: o.material.emissive.clone(), bi: o.material.emissiveIntensity }); });
    }
    if (e.kind === 'player' && built.parts.ring) built.parts.ring.material.color.set(this.allegianceColor(e, youId));
    built.root.position.set(e.x, 0, e.y);
    this.scene.add(built.root);
    this.views.set(e.id, view);
    e.view = view;
  }

  removeEntity(e, replaced = false) {
    const v = this.views.get(e.id);
    if (!v) return;
    this.views.delete(e.id);
    if (!replaced && (e.kind === 'monster' || e.kind === 'player')) {
      this.dying.push({ view: v, t: 0 });
    } else {
      this.disposeView(v);
    }
  }

  trigger(id, what) {
    const v = this.views.get(id);
    if (v) v[what] = 1;
  }

  updateViews(world, dt) {
    const now = performance.now();
    const youId = world.youId;
    for (const e of world.entities.values()) {
      const v = this.views.get(e.id);
      if (!v) continue;
      const root = v.root;
      v.phase += dt;
      switch (e.kind) {
        case 'player': {
          root.position.set(e.x, 0, e.y);
          root.rotation.y = Math.PI / 2 - e.f;
          const p = v.parts;
          const dead = (e.fl & F.DEAD) !== 0;
          p.body.rotation.x = THREE.MathUtils.lerp(p.body.rotation.x, dead ? -Math.PI / 2 : 0, dt * 8);
          p.body.position.y = dead ? 0.25 : (e.moving > 0.2 ? Math.abs(Math.sin(v.phase * 11)) * 0.09 : 0);
          if (v.attackT > 0) {
            v.attackT = Math.max(0, v.attackT - dt * 5);
            p.handR.rotation.y = -Math.sin(v.attackT * Math.PI) * 1.6;
            p.handR.rotation.z = Math.sin(v.attackT * Math.PI) * 0.6;
          } else {
            p.handR.rotation.y = THREE.MathUtils.lerp(p.handR.rotation.y, 0, dt * 10);
            p.handR.rotation.z = THREE.MathUtils.lerp(p.handR.rotation.z, 0, dt * 10);
          }
          p.ring.material.color.set(this.allegianceColor(e, youId));
          p.ring.material.opacity = dead ? 0.25 : 0.75;
          this.statusEffects(v, e, now);
          break;
        }
        case 'monster': {
          root.position.set(e.x, 0, e.y);
          root.rotation.y = Math.PI / 2 - e.f;
          const p = v.parts;
          const dead = (e.fl & F.DEAD) !== 0;
          const sp = v.phase * (e.moving > 0.2 ? 10 : 2);
          if (p.legs) p.legs.forEach((l, i) => { l.rotation.x = e.moving > 0.2 ? Math.sin(sp + i * Math.PI) * 0.5 : 0; });
          if (p.wings) { const a = Math.sin(v.phase * 22) * 0.7; p.wings[0].rotation.y = a; p.wings[1].rotation.y = -a; }
          if (p.bob) p.bob.position.y = (p.bob.userData.baseY ??= p.bob.position.y) + Math.sin(v.phase * 3) * (e.t === 'slime' ? 0.05 : 0.15);
          if (e.t === 'slime' && p.bob) p.bob.scale.set(1 + Math.sin(v.phase * 6) * 0.08, 0.8 - Math.sin(v.phase * 6) * 0.08, 1 + Math.sin(v.phase * 6) * 0.08);
          if (p.spin) p.spin.rotation.y += dt * 1.5;
          if (p.aura) p.aura.rotation.z += dt;
          if (p.arm) {
            if ((e.fl & F.WINDUP) !== 0) p.arm.rotation.x = THREE.MathUtils.lerp(p.arm.rotation.x, -2.4, dt * 6);
            else if (v.attackT > 0) { v.attackT = Math.max(0, v.attackT - dt * 4); p.arm.rotation.x = -Math.sin(v.attackT * Math.PI) * 1.6; }
            else p.arm.rotation.x = THREE.MathUtils.lerp(p.arm.rotation.x, 0, dt * 6);
          }
          if (dead) root.position.y = -Math.min(1.5, (now - (e.deadAt ||= now)) / 1000);
          this.statusEffects(v, e, now);
          break;
        }
        case 'npc':
          root.position.set(e.x, 0, e.y);
          if (v.parts.marker) v.parts.marker.material.opacity = 0.6 + Math.sin(v.phase * 3) * 0.3;
          if (v.parts.body) v.parts.body.position.y = Math.sin(v.phase * 1.5) * 0.03;
          break;
        case 'loot':
          root.position.set(e.x, Math.sin(v.phase * 3) * 0.1, e.y);
          v.parts.gem.rotation.y += dt * 2;
          break;
        case 'portal':
          root.position.set(e.x, 0, e.y);
          v.parts.disc.rotation.z += dt * 2;
          v.parts.ring.rotation.z -= dt * 0.5;
          v.parts.glow.material.opacity = 0.6 + Math.sin(v.phase * 2) * 0.3;
          break;
        case 'chest':
          root.position.set(e.x, 0, e.y);
          break;
        case 'proj':
          root.position.set(e.x, 1, e.y);
          root.rotation.y = Math.atan2(e.vx, e.vy);
          break;
        case 'aoe': {
          root.position.set(e.x, 0, e.y);
          const p = v.parts;
          const prog = 1 - Math.max(0, e.life) / Math.max(0.01, e.ml);
          if (e.s === 'telegraph' && p.fill) { p.fill.scale.setScalar(Math.max(0.01, e.rad * prog)); p.fill.material.opacity = 0.2 + prog * 0.35; }
          if (e.s === 'ring' && p.ring) { p.ring.scale.setScalar(e.rad); p.ring.material.opacity = 0.9 * (1 - e.rad / Math.max(1, e.mr)); }
          if (p.swirl) p.swirl.rotation.z += dt * 6;
          if (p.edge && e.s !== 'telegraph') p.edge.material.opacity = 0.5 + Math.sin(v.phase * 8) * 0.3;
          break;
        }
        default:
      }
    }
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.t += dt;
      d.view.root.position.y -= dt * 0.8;
      d.view.root.scale.multiplyScalar(1 - dt * 0.8);
      if (d.t > 0.9) { this.disposeView(d.view); this.dying.splice(i, 1); }
    }
  }

  statusEffects(v, e, now) {
    const flash = e.hitT && now - e.hitT < 110;
    if (flash !== v.flashing) {
      v.flashing = flash;
      for (const m of v.mats) {
        if (flash) { m.m.emissive.set(0xffffff); m.m.emissiveIntensity = 0.9; }
        else { m.m.emissive.copy(m.base); m.m.emissiveIntensity = m.bi; }
      }
    }
    const stunned = (e.fl & F.STUN) !== 0;
    if (stunned && !v.stars) {
      v.stars = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), new THREE.MeshBasicMaterial({ color: 0xfde047 }));
        s.position.set(Math.cos(i * 2.1) * 0.4, 0, Math.sin(i * 2.1) * 0.4);
        v.stars.add(s);
      }
      v.stars.position.y = (e.kind === 'monster' && e.b ? 4 : 2);
      v.root.add(v.stars);
    }
    if (v.stars) { v.stars.visible = stunned; v.stars.rotation.y += 0.15; }
    const guard = (e.fl & F.GUARD) !== 0;
    if (guard && !v.bubble) {
      v.bubble = new THREE.Mesh(new THREE.SphereGeometry(1.05, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
      v.bubble.position.y = 0.9;
      v.root.add(v.bubble);
    }
    if (v.bubble) v.bubble.visible = guard;
    const slow = (e.fl & F.SLOW) !== 0;
    if (slow && !v.frost) {
      v.frost = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.8, 20), new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
      v.frost.rotation.x = -Math.PI / 2;
      v.frost.position.y = 0.06;
      v.root.add(v.frost);
    }
    if (v.frost) v.frost.visible = slow;
    const ghost = (e.fl & F.INVULN) !== 0 || (e.fl & F.DASH) !== 0;
    if (ghost !== v.ghost) {
      v.ghost = ghost;
      v.root.traverse(o => {
        if (!o.material || o === v.bubble || o === v.frost) return;
        if (o.material.userData.baseOpacity === undefined) o.material.userData.baseOpacity = o.material.opacity;
        o.material.transparent = ghost || o.material.userData.baseOpacity < 1;
        o.material.opacity = ghost ? 0.45 : o.material.userData.baseOpacity;
      });
    }
  }

  /* ---------------- FX from server events ---------------- */
  handleFx(ev, world) {
    const themeC = this.themeColor;
    const fx = this.fx;
    const ent = ev.id ? world.entities.get(ev.id) : null;
    switch (ev.e) {
      case 'slash': fx.slash(ev.x, ev.y, ev.a, ev.r, themeC); this.trigger(ev.id, 'attackT'); break;
      case 'mslash': this.trigger(ev.id, 'attackT'); break;
      case 'shoot': this.trigger(ev.id, 'attackT'); fx.glow(ev.x, ev.y, { color: themeC, size: 1.2, life: 0.12 }); break;
      case 'bash': fx.slash(ev.x, ev.y, ev.a, 3.2, 0xfacc15); fx.burst(ev.x + Math.cos(ev.a) * 1.8, ev.y + Math.sin(ev.a) * 1.8, { color: 0xfacc15, count: 12 }); this.trigger(ev.id, 'attackT'); break;
      case 'guard': fx.ring(ev.x, ev.y, { color: 0xfacc15, radius: 7, life: 0.6 }); break;
      case 'shock': fx.ring(ev.x, ev.y, { color: themeC, radius: ev.r, life: 0.55 }); fx.disc(ev.x, ev.y, { color: themeC, radius: ev.r }); fx.burst(ev.x, ev.y, { color: themeC, count: 40, speed: 9, life: 0.7 }); this.shake(0.5); break;
      case 'nova': fx.ring(ev.x, ev.y, { color: 0x7dd3fc, radius: ev.r, life: 0.45 }); fx.disc(ev.x, ev.y, { color: 0x7dd3fc, radius: ev.r, opacity: 0.4 }); fx.burst(ev.x, ev.y, { color: 0xe0f2fe, count: 30, speed: 7 }); break;
      case 'healfx': fx.ring(ev.x, ev.y, { color: 0x4ade80, radius: ev.r, life: 0.7 }); break;
      case 'heal': if (ent) fx.burst(ent.x, ent.y, { color: 0x4ade80, count: 10, speed: 1, up: 3, gravity: -1, life: 0.8 }); break;
      case 'mana': fx.burst(ev.x, ev.y, { color: 0x60a5fa, count: 12, speed: 1, up: 3, gravity: -1, life: 0.8 }); break;
      case 'dash': fx.burst(ev.x, ev.y, { color: 0xffffff, count: 10, speed: 2, up: 0.5, life: 0.4 }); break;
      case 'blink': fx.glow(ev.x, ev.y, { color: 0xc084fc, size: 3, life: 0.35 }); fx.glow(ev.x2, ev.y2, { color: 0xc084fc, size: 3, life: 0.35 }); fx.burst(ev.x2, ev.y2, { color: 0xc084fc, count: 14 }); break;
      case 'cast': fx.glow(ev.x, ev.y, { color: ev.c === 'vortex' ? 0x9333ea : 0xfb923c, size: 2.5, life: 0.3 }); break;
      case 'boom': fx.explosion(ev.x, ev.y, ev.r, ev.big ? 0xef4444 : 0xfb923c); if (ev.big) this.shake(0.35); break;
      case 'impact': fx.burst(ev.x, ev.y, { y: 1, color: ev.s === 'orb' || ev.s === 'arrow' ? 0xf97316 : themeC, count: ev.h ? 8 : 4, speed: 3, life: 0.3 }); break;
      case 'chain': fx.line(ev.x, ev.y, ev.x2, ev.y2, 0xc084fc); break;
      case 'death': fx.burst(ev.x, ev.y, { color: ev.k === 'player' ? 0xef4444 : 0x9ca3af, count: 22, speed: 4, life: 0.8 }); break;
      case 'levelup': fx.pillar(ev.x, ev.y, 0xfacc15); break;
      case 'revive': fx.pillar(ev.x, ev.y, 0x4ade80, 0.9, 4); break;
      case 'summon': fx.ring(ev.x, ev.y, { color: 0xa855f7, radius: 3, life: 0.6 }); fx.burst(ev.x, ev.y, { color: 0xa855f7, count: 20 }); break;
      case 'burst': fx.ring(ev.x, ev.y, { color: 0xa855f7, radius: 4, life: 0.4 }); break;
      case 'charge': fx.glow(ev.x, ev.y, { color: 0xef4444, size: 5, life: 0.6 }); break;
      case 'chest': fx.burst(ev.x, ev.y, { color: 0xfacc15, count: 30, speed: 3, up: 5, life: 1 }); break;
      case 'anvil': fx.burst(ev.x, ev.y, { color: 0xf97316, count: 30, speed: 4, up: 4, life: 0.8 }); break;
      case 'pickup': fx.glow(ev.x, ev.y, { color: 0xffffff, size: 1.5, life: 0.25 }); break;
      default:
    }
  }

  shake(a) { this.shakeAmt = Math.min(1, this.shakeAmt + a); }

  /* ---------------- frame ---------------- */
  frame(dt, world, focus) {
    this.time += dt;
    if (focus) {
      this.camTarget.x = THREE.MathUtils.lerp(this.camTarget.x, focus.x, Math.min(1, dt * 10));
      this.camTarget.z = THREE.MathUtils.lerp(this.camTarget.z, focus.y, Math.min(1, dt * 10));
    }
    const dist = 23 * this.zoom;
    let sx = 0, sy = 0;
    if (this.shakeAmt > 0) {
      sx = (Math.random() - 0.5) * this.shakeAmt * 0.6;
      sy = (Math.random() - 0.5) * this.shakeAmt * 0.6;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.5);
    }
    this.camera.position.set(this.camTarget.x + sx, dist * 0.82, this.camTarget.z + dist * 0.62 + sy);
    this.camera.lookAt(this.camTarget.x + sx, 0, this.camTarget.z + sy);

    this.sun.position.set(this.camTarget.x - 10, 24, this.camTarget.z + 8);
    this.sun.target.position.copy(this.camTarget);
    this.heroLight.position.set(this.camTarget.x, 3.2, this.camTarget.z);

    if (this.terrain) {
      if (this.terrain.water) this.terrain.water.emissiveIntensity = 0.8 + Math.sin(this.time * 1.5) * 0.25;
      const torches = this.terrain.torches;
      if (torches.length) {
        const cx = this.camTarget.x, cz = this.camTarget.z;
        const nearest = torches.map(t => [t, (t.x - cx) ** 2 + (t.y - cz) ** 2]).sort((a, b) => a[1] - b[1]).slice(0, this.torchLights.length);
        this.torchLights.forEach((l, i) => {
          const n = nearest[i];
          if (!n || n[1] > 30 * 30) { l.intensity = 0; return; }
          l.position.set(n[0].x, 1.8, n[0].y);
          l.intensity = 14 + Math.sin(this.time * 12 + i * 3) * 2.5;
        });
        for (const t of torches) t.glow.material.opacity = 0.75 + Math.sin(this.time * 10 + t.x) * 0.2;
      }
    }
    this.updateViews(world, dt);
    this.fx.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  /** Screen pixel → world ground point {x, y}. */
  pick(px, py) {
    const ndc = new THREE.Vector2((px / this.width) * 2 - 1, -(py / this.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return null;
    return { x: hit.x, y: hit.z };
  }

  /** World point → screen pixel. */
  project(x, y, h = 0) {
    this.tmpV.set(x, h, y).project(this.camera);
    return { x: (this.tmpV.x + 1) / 2 * this.width, y: (1 - this.tmpV.y) / 2 * this.height, visible: this.tmpV.z < 1 };
  }
}
