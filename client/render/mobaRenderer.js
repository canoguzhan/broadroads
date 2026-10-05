/* Three.js scene for a MOBA match: terrain, entities, fog of war, FX, camera. */
import * as THREE from 'three';
import { buildValley, upgradeValley, TEAM_HEX } from './valley.js';
import { buildChampion, buildMinion, buildTower, buildSpire, buildCore, buildWard, buildTrap, buildMobaMonster, buildMobaProjectile, buildMobaArea } from './mobaModels.js';
import { FxSystem } from './fx.js';
import { loadModel, assetFor, attachModel, animateModel, animateDying } from './assetModels.js';
import { F } from '../../shared/constants.js';

const SIGHT = { hero: 11, minion: 7, tower: 9.5, ward: 8, spire: 7, core: 8 };
const FX_COLORS = { earth: 0xd6a35c, light: 0xfef08a, shadow: 0x7c3aed, frost: 0x93c5fd, blood: 0xdc2626, star: 0x7dd3fc, fire: 0xf97316, nature: 0x84cc16, void: 0xa855f7, gold: 0xfbbf24, thunder: 0xfacc15, unbreakable: 0x22d3ee };

export class MobaRenderer {
  constructor(canvas, quality = 'medium') {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1410);
    this.scene.fog = new THREE.Fog(0x0b1410, 55, 110);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 400);
    this.camTarget = new THREE.Vector3(20, 0, 130);
    this.zoom = 1;
    this.locked = true;
    this.shakeAmt = 0;
    this.time = 0;
    this.fx = new FxSystem(this.scene);
    this.views = new Map();
    this.dying = [];
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.tmp = new THREE.Vector3();
    this.hemi = new THREE.HemisphereLight(0xdfe9ff, 0x2a3a20, 1.5);
    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
    this.sun.shadow.camera.left = -30; this.sun.shadow.camera.right = 30; this.sun.shadow.camera.top = 30; this.sun.shadow.camera.bottom = -30;
    this.sun.shadow.camera.far = 90;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.rangeRing = new THREE.Mesh(new THREE.RingGeometry(0.97, 1.0, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    this.rangeRing.rotation.x = -Math.PI / 2;
    this.rangeRing.position.y = 0.1;
    this.rangeRing.visible = false;
    this.scene.add(this.rangeRing);
    this.moveMarker = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.45, 24), new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    this.moveMarker.rotation.x = -Math.PI / 2;
    this.moveMarker.position.y = 0.1;
    this.moveMarker.visible = false;
    this.scene.add(this.moveMarker);
    // Touch drag-to-aim target marker.
    this.aimMarker = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.8, 32), new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    this.aimMarker.rotation.x = -Math.PI / 2;
    this.aimMarker.position.y = 0.12;
    this.aimMarker.visible = false;
    this.scene.add(this.aimMarker);
    this.setQuality(quality);
    this.resize();
  }

  setQuality(q) {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(q === 'low' ? Math.min(1, dpr) * 0.8 : q === 'medium' ? Math.min(1.5, dpr) : Math.min(2, dpr));
    this.renderer.shadowMap.enabled = q !== 'low';
    this.sun.castShadow = q !== 'low';
    this.sun.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.fx.setQuality(q);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.width = w; this.height = h;
  }

  setMatch(valley, team, champInfo) {
    this.clear();
    this.valley = valley;
    this.team = team;
    this.champInfo = champInfo;
    this.terrain = buildValley(valley, this.quality);
    this.scene.add(this.terrain.group);
    upgradeValley(this.terrain, valley, loadModel);
    // Fog of war overlay above the terrain.
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = valley.size; this.fogCanvas.height = valley.size;
    this.fogTex = new THREE.CanvasTexture(this.fogCanvas);
    this.fogTex.magFilter = THREE.LinearFilter;
    this.fogTex.minFilter = THREE.LinearFilter;
    const fogMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.62, alphaMap: this.fogTex, depthWrite: false });
    this.fogMesh = new THREE.Mesh(new THREE.PlaneGeometry(valley.size, valley.size), fogMat);
    this.fogMesh.rotation.x = -Math.PI / 2;
    this.fogMesh.position.set(valley.size / 2, 2.9, valley.size / 2);
    this.fogMesh.renderOrder = 5;
    this.scene.add(this.fogMesh);
    this.fogT = 0;
    const f = team === 'spectator' ? { x: valley.size / 2, y: valley.size / 2 } : valley.teams[team].fountain;
    this.camTarget.set(f.x, 0, f.y);
  }

  clear() {
    for (const v of this.views.values()) this.disposeView(v);
    this.views.clear();
    for (const d of this.dying) this.disposeView(d.view);
    this.dying = [];
    this.fx.clear();
    if (this.terrain) { this.scene.remove(this.terrain.group); this.terrain.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); this.terrain = null; }
    if (this.fogMesh) { this.scene.remove(this.fogMesh); this.fogMesh.material.dispose(); this.fogTex.dispose(); this.fogMesh = null; }
  }

  disposeView(v) { this.scene.remove(v.root); v.root.traverse(o => { if (o.material) o.material.dispose(); }); }

  /* ---------------- entities ---------------- */
  addEntity(e) {
    let built;
    switch (e.kind) {
      case 'hero': built = buildChampion(e.c, this.champInfo[e.c] || { color: 0x888888, accent: 0xffffff }, e.tm); break;
      case 'minion': built = buildMinion(e.t, e.tm); break;
      case 'tower': built = buildTower(e.tm, e.t); break;
      case 'spire': built = buildSpire(e.tm); break;
      case 'core': built = buildCore(e.tm); break;
      case 'ward': built = buildWard(e.tm); break;
      case 'trap': built = buildTrap(); break;
      case 'monster': built = buildMobaMonster(e.md, e.sm, e.ep); break;
      case 'proj': {
        const owner = this.world && this.world.entities.get(e.o);
        built = buildMobaProjectile(e.s, e.tm, owner && owner.kind === 'hero' ? (this.champInfo[owner.c] || {}).accent : this.champColorFromStyle(e.s));
        break;
      }
      case 'area': built = buildMobaArea(e.s, e.rad, e.len, e.w, e.tm !== this.team); break;
      default: return;
    }
    const v = { root: built.root, parts: built.parts, kind: e.kind, phase: Math.random() * 10, attackT: 0, mats: [], spin: built.spin, color: built.color, fiery: built.fiery };
    if (e.kind === 'hero' || e.kind === 'minion' || e.kind === 'monster') built.root.traverse(o => { if (o.material && o.material.emissive) v.mats.push({ m: o.material, base: o.material.emissive.clone(), bi: o.material.emissiveIntensity }); });
    if (e.kind === 'hero' && built.parts.ring) built.parts.ring.material.color.set(e.id === this.youId ? 0xfacc15 : this.team === 'spectator' ? TEAM_HEX[e.tm] : e.tm === this.team ? 0x3b82f6 : 0xef4444);
    built.root.position.set(e.x, 0, e.y);
    if (e.kind === 'area' && e.s.startsWith('beam:')) built.root.rotation.y = -e.f + Math.PI / 2;
    this.scene.add(built.root);
    this.views.set(e.id, v);
    const asset = assetFor(e, e.kind === 'hero' ? 1.9 * (built.parts.body.scale.x / 1.15) : 0);
    const skin = e.kind === 'hero' && this.skins ? this.skins.get(e.id) : null;
    if (asset) loadModel(asset[0]).then(gltf => { if (gltf && this.views.get(e.id) === v) attachModel(v, gltf, asset[1], skin); });
  }

  champColorFromStyle(style) {
    if (style && style.startsWith('aa:')) { const c = this.champInfo[style.slice(3)]; return c ? c.accent : 0xffffff; }
    return null;
  }

  removeEntity(e, replaced) {
    const v = this.views.get(e.id);
    if (!v) return;
    if (e.kind === 'proj' && !replaced) this.fx.impact(v.root.position.x, v.root.position.z, { y: v.root.position.y, color: v.color || 0xffffff, big: v.fiery });
    this.views.delete(e.id);
    if (!replaced && (e.kind === 'minion' || e.kind === 'monster') && (e.fl & F.DEAD)) this.dying.push({ view: v, t: 0 });
    else if (!replaced && (e.kind === 'minion' || e.kind === 'monster') && e.hp <= 0) this.dying.push({ view: v, t: 0 });
    else this.disposeView(v);
  }

  trigger(id, kind = 'attack') { const v = this.views.get(id); if (v) { v.attackT = 1; v.oneShot = kind; } }

  update(world, dt) {
    const now = performance.now();
    for (const e of world.entities.values()) {
      const v = this.views.get(e.id);
      if (!v) continue;
      v.phase += dt;
      const root = v.root;
      const dead = (e.fl & F.DEAD) !== 0;
      switch (e.kind) {
        case 'hero': case 'minion': case 'monster': {
          root.position.set(e.x, (e.fl & F.AIRBORNE) ? 0.8 + Math.sin(v.phase * 8) * 0.1 : 0, e.y);
          root.rotation.y = Math.PI / 2 - e.f;
          if (v.model) animateModel(v, e, dead, e.moving > 0.2, dt, now);
          else this.animateProcedural(v, e, dead, dt);
          if (v.parts.ring) { v.parts.ring.material.opacity = dead ? 0.15 : 0.75; v.parts.ring.visible = !(e.fl & F.BUSH) || e.tm === this.team; }
          this.status(v, e, now);
          // Allies in a bush render translucent (stealthed) for their own team.
          const inBush = (e.fl & F.BUSH) && e.tm === this.team;
          if (inBush !== v.bushed) {
            v.bushed = inBush;
            root.traverse(o => {
              if (!o.material || o === v.bubble) return;
              const ud = o.material.userData;
              if (ud.o === undefined) { ud.o = o.material.opacity; ud.t = o.material.transparent; }
              o.material.transparent = inBush || ud.t;
              o.material.opacity = inBush ? 0.55 : ud.o;
            });
          }
          break;
        }
        case 'tower': case 'spire': case 'core':
          root.position.set(e.x, dead ? -1.5 : 0, e.y);
          if (v.parts.crystal) { v.parts.crystal.rotation.y += dt; v.parts.crystal.visible = !dead; }
          if (v.parts.glow) v.parts.glow.visible = !dead;
          if (v.parts.shards) v.parts.shards.rotation.y += dt * 0.5;
          if (v.parts.ring) v.parts.ring.rotation.z += dt;
          break;
        case 'ward': case 'trap':
          root.position.set(e.x, 0, e.y);
          break;
        case 'proj':
          root.position.set(e.x, 1.1, e.y);
          root.rotation.y = Math.PI / 2 - e.f;
          if (v.spin) v.parts.core.rotation.y += dt * 20;
          v.trailT = (v.trailT || 0) - dt;
          if (v.trailT <= 0) { v.trailT = 0.025; this.fx.trail(e.x, 1.1, e.y, v.color || 0xffffff, v.fiery ? 0.8 : 0.5); if (v.fiery && Math.random() < 0.3) this.fx.smoke(e.x, e.y, { count: 1, radius: 0.3, life: 0.6 }); }
          break;
        case 'area': {
          root.position.set(e.x, 0, e.y);
          const p = v.parts;
          const prog = 1 - Math.max(0, e.life) / Math.max(0.01, e.dur);
          if (p.fill && (e.s === 'telegraph' || e.s === 'reap' || e.s === 'wrath' || e.s === 'star')) { p.fill.scale.setScalar(Math.max(0.01, e.rad * prog)); p.fill.material.opacity = 0.2 + prog * 0.35; }
          if (p.edge && e.s === 'whirl') p.edge.rotation.z += dt * 10;
          if (p.plane) p.plane.material.opacity = 0.15 + prog * 0.45;
          if (p.glow) p.glow.material.opacity = 0.4 + Math.sin(v.phase * 8) * 0.2;
          if (p.rune) p.rune.rotation.z += dt * 0.8;
          break;
        }
        default:
      }
    }
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.t += dt;
      if (animateDying(d.view, dt)) {
        // Rigged units play their death clip, then sink.
        if (d.t > 0.9) d.view.root.position.y -= dt * 1.5;
        if (d.t < 1.6) continue;
        this.disposeView(d.view); this.dying.splice(i, 1); continue;
      }
      d.view.root.position.y -= dt;
      d.view.root.scale.multiplyScalar(1 - dt * 0.9);
      if (d.t > 0.9) { this.disposeView(d.view); this.dying.splice(i, 1); }
    }
  }

  animateProcedural(v, e, dead, dt) {
    const body = v.parts.body;
    if (body) {
      body.rotation.x = THREE.MathUtils.lerp(body.rotation.x, dead ? -Math.PI / 2 : 0, dt * 8);
      if (!dead) body.position.y = e.moving > 0.2 ? Math.abs(Math.sin(v.phase * 11)) * 0.08 : 0;
    }
    if (v.parts.legs) v.parts.legs.forEach((l, i) => { l.rotation.x = e.moving > 0.2 ? Math.sin(v.phase * 10 + i * Math.PI) * 0.5 : 0; });
    if (v.parts.wings) { const a = Math.sin(v.phase * (e.kind === 'monster' && e.md === 'wyrm' ? 4 : 20)) * 0.6; v.parts.wings[0].rotation.y = a; v.parts.wings[1].rotation.y = -a; }
    if (v.parts.spin) v.parts.spin.rotation.y += dt * 1.5;
    if (v.parts.handR) {
      if (v.attackT > 0) { v.attackT = Math.max(0, v.attackT - dt * 5); v.parts.handR.rotation.y = -Math.sin(v.attackT * Math.PI) * 1.6; }
      else v.parts.handR.rotation.y = THREE.MathUtils.lerp(v.parts.handR.rotation.y, 0, dt * 10);
    }
    if (v.parts.arm && v.attackT > 0) { v.attackT = Math.max(0, v.attackT - dt * 4); v.parts.arm.rotation.x = -Math.sin(v.attackT * Math.PI) * 1.4; }
  }

  status(v, e, now) {
    const flash = e.hitT && now - e.hitT < 100;
    if (flash !== v.flashing) {
      v.flashing = flash;
      for (const m of v.mats) { if (flash) { m.m.emissive.set(0xffffff); m.m.emissiveIntensity = 0.8; } else { m.m.emissive.copy(m.base); m.m.emissiveIntensity = m.bi; } }
    }
    const stunned = (e.fl & (F.STUN | F.AIRBORNE)) !== 0;
    if (stunned && !v.stars) {
      v.stars = new THREE.Group();
      for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.15), new THREE.MeshBasicMaterial({ color: 0xfde047 })); s.position.set(Math.cos(i * 2.1) * 0.4, 0, Math.sin(i * 2.1) * 0.4); v.stars.add(s); }
      v.stars.position.y = e.kind === 'monster' && e.ep ? 4.5 : e.kind === 'hero' ? 2.6 : 2.3;
      v.root.add(v.stars);
    }
    if (v.stars) { v.stars.visible = stunned; v.stars.rotation.y += 0.15; }
    const shield = (e.fl & F.SHIELD) !== 0;
    if (shield && !v.bubble) {
      v.bubble = new THREE.Mesh(new THREE.SphereGeometry(1.0, 16, 12), new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }));
      v.bubble.position.y = 1;
      v.root.add(v.bubble);
    }
    if (v.bubble) v.bubble.visible = shield;
    const rooted = (e.fl & F.ROOT) !== 0;
    if (rooted && !v.roots) {
      v.roots = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.08, 6, 16), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
      v.roots.rotation.x = Math.PI / 2;
      v.roots.position.y = 0.2;
      v.root.add(v.roots);
    }
    if (v.roots) v.roots.visible = rooted;
    const recall = (e.fl & F.RECALL) !== 0;
    if (recall && !v.recallFx) {
      v.recallFx = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 3, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.25, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      v.recallFx.position.y = 1.5;
      v.root.add(v.recallFx);
    }
    if (v.recallFx) { v.recallFx.visible = recall; v.recallFx.rotation.y += 0.05; }
    const titan = (e.fl & F.TITAN) !== 0;
    if (titan && !v.titan) { v.titan = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.85, 24), new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.8, side: THREE.DoubleSide })); v.titan.rotation.x = -Math.PI / 2; v.titan.position.y = 0.05; v.root.add(v.titan); }
    if (v.titan) v.titan.visible = titan;
  }

  /* ---------------- fog ---------------- */
  updateFog(world, dt) {
    if (!this.fogCanvas) return;
    if (this.team === 'spectator') { this.fogMesh.visible = false; return; } // spectators and replays see everything
    this.fogT -= dt;
    if (this.fogT > 0) return;
    this.fogT = 0.15;
    const ctx = this.fogCanvas.getContext('2d');
    const S = this.valley.size;
    // Grayscale map read through alphaMap's green channel: white = fogged, black = visible.
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, S, S);
    const circle = (x, y, r) => {
      const g = ctx.createRadialGradient(x, y, r * 0.7, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    };
    for (const e of world.entities.values()) {
      if (e.tm !== this.team || (e.fl & F.DEAD)) continue;
      const r = SIGHT[e.kind];
      if (r) circle(e.x, e.y, r);
    }
    const f = this.valley.teams[this.team].fountain;
    circle(f.x, f.y, 12);
    this.fogTex.needsUpdate = true;
    this.fogImage = ctx;
  }

  /* ---------------- FX ---------------- */
  handleFx(ev, world) {
    const fx = this.fx;
    const c = FX_COLORS[ev.c] || 0xffffff;
    const ent = ev.id ? world.entities.get(ev.id) : null;
    switch (ev.e) {
      case 'atk': this.trigger(ev.id); break;
      case 'emote': { const v = this.views.get(ev.id); if (v) v.emote = { k: ev.k, until: performance.now() + (ev.k === 'dance' ? 8000 : 3800) }; break; }
      case 'cast': {
        this.trigger(ev.id, 'cast');
        const accent = (this.champInfo[ev.c] || {}).accent || 0xffffff, ult = ev.sl === 'r';
        const x = ent ? ent.x : ev.x, y = ent ? ent.y : ev.y;
        fx.runes(x, y, { color: accent, radius: ult ? 2.4 : 1.4, life: ult ? 1 : 0.6, spin: ult ? 3 : 2 });
        fx.glow(x, y, { color: accent, size: ult ? 3.5 : 2, life: 0.3 });
        fx.sparks(x, y, { y: 1.2, color: accent, count: ult ? 16 : 6, speed: 3, life: 0.5 });
        if (ult) { fx.shockwave(x, y, { color: accent, radius: 2.5, height: 2, life: 0.5 }); if (ev.id === this.youId) this.shake(0.15); }
        break;
      }
      case 'nova': fx.ring(ev.x, ev.y, { color: c, radius: ev.r, life: 0.45 }); fx.disc(ev.x, ev.y, { color: c, radius: ev.r, opacity: 0.35 }); fx.shockwave(ev.x, ev.y, { color: c, radius: ev.r, height: 1.2 }); fx.sparks(ev.x, ev.y, { y: 0.8, color: c, count: 18, speed: ev.r * 3 }); break;
      case 'shock': fx.ring(ev.x, ev.y, { color: c, radius: ev.r, life: 0.55 }); fx.disc(ev.x, ev.y, { color: c, radius: ev.r }); fx.shockwave(ev.x, ev.y, { color: c, radius: ev.r * 1.1, height: 2, life: 0.55 }); fx.sparks(ev.x, ev.y, { y: 0.5, color: c, count: 24, speed: 9, life: 0.6 }); fx.smoke(ev.x, ev.y, { count: 4, radius: ev.r * 0.5, color: 0x6b5a48 }); fx.scorch(ev.x, ev.y, ev.r * 0.7); this.shake(0.25); break;
      case 'boom': fx.blast(ev.x, ev.y, ev.r, c); break;
      case 'cone': {
        const steps = 6;
        for (let i = -steps; i <= steps; i++) { const a = ev.a + i * 0.08; fx.burst(ev.x + Math.cos(a) * ev.r * 0.6, ev.y + Math.sin(a) * ev.r * 0.6, { color: c, count: 3, speed: 3, life: 0.4 }); }
        fx.slash(ev.x, ev.y, ev.a, ev.r, c);
        break;
      }
      case 'beam': {
        fx.beam(ev.x, ev.y, ev.x2, ev.y2, { width: ev.w, color: ev.c === 'spark' ? 0xfef08a : 0xfbbf24, life: 0.45 });
        this.shake(0.2);
        break;
      }
      case 'healfx': fx.ring(ev.x, ev.y, { color: 0x4ade80, radius: ev.r, life: 0.6 }); fx.runes(ev.x, ev.y, { color: 0x4ade80, radius: ev.r, life: 0.9, spin: 1 }); fx.burst(ev.x, ev.y, { color: 0x86efac, count: 20, speed: 1.5, up: 3, gravity: -1.5, life: 1.1, size: 0.25 }); break;
      case 'heal': if (ent) { fx.burst(ent.x, ent.y, { color: 0x86efac, count: 10, speed: 0.8, up: 3, gravity: -1.5, life: 0.9, size: 0.22 }); fx.glow(ent.x, ent.y, { y: 1, color: 0x4ade80, size: 1.8, life: 0.4 }); } break;
      case 'shield': if (ent) fx.ring(ent.x, ent.y, { color: 0xe0f2fe, radius: 1.3, life: 0.4 }); break;
      case 'buff': if (ent) fx.pillar(ent.x, ent.y, c, 0.6, 3); break;
      case 'glint': fx.glow(ev.x, ev.y, { color: c, size: 2.5, life: 0.25 }); break;
      case 'dash': fx.burst(ev.x, ev.y, { color: 0xffffff, count: 8, speed: 2, up: 0.5, life: 0.35 }); break;
      case 'blink': fx.glow(ev.x, ev.y, { color: 0xfef9c3, size: 2.5, life: 0.3 }); fx.sparks(ev.x, ev.y, { color: 0xfef9c3, count: 10, speed: 3 }); fx.glow(ev.x2, ev.y2, { color: 0xfef9c3, size: 3, life: 0.35 }); fx.runes(ev.x2, ev.y2, { color: 0xfde68a, radius: 1, life: 0.4, spin: 4 }); fx.sparks(ev.x2, ev.y2, { color: 0xfef9c3, count: 12, speed: 4 }); break;
      case 'impact': fx.impact(ev.x, ev.y, { color: 0xffffff }); break;
      case 'death': fx.burst(ev.x, ev.y, { color: ev.k === 'hero' ? 0xef4444 : ev.k === 'tower' || ev.k === 'spire' || ev.k === 'core' ? 0xfbbf24 : 0x9ca3af, count: ev.k === 'hero' || ev.k === 'tower' ? 40 : 14, speed: 5, life: 0.9 }); if (ev.k === 'tower' || ev.k === 'core' || ev.k === 'spire') { fx.blast(ev.x, ev.y, 4, 0xfbbf24); fx.smoke(ev.x, ev.y, { count: 10, radius: 3, color: 0x57534e, life: 2.5 }); this.shake(0.6); } if (ev.k === 'hero') fx.sprite(ev.x, 1.2, ev.y, { color: 0xc4b5fd, size: 1.4, grow: 0.6, life: 1.6, rise: 2.2 }); break;
      case 'levelup': fx.pillar(ev.x, ev.y, 0xfacc15, 1, 5); break;
      case 'respawn': fx.pillar(ev.x, ev.y, 0x60a5fa, 0.8, 4); break;
      case 'recall': fx.pillar(ev.x, ev.y, 0x60a5fa, 0.6, 5); break;
      case 'ward': fx.ring(ev.x, ev.y, { color: TEAM_HEX[ev.team], radius: 1.2, life: 0.5 }); break;
      case 'trap': fx.burst(ev.x, ev.y, { color: 0xd6d3d1, count: 14, speed: 3 }); break;
      case 'strike': fx.pillar(ev.x, ev.y, 0xfacc15, 0.4, 6); break;
      case 'summ': if (ev.k === 'mend') fx.ring(ev.x, ev.y, { color: 0x4ade80, radius: 3, life: 0.5 }); else if (ev.k === 'haste') fx.burst(ev.x, ev.y, { color: 0xe5e7eb, count: 10 }); else if (ev.k === 'bulwark') fx.ring(ev.x, ev.y, { color: 0xfde68a, radius: 1.4, life: 0.5 }); break;
      case 'ping': {
        const color = ev.k === 'danger' ? 0xef4444 : ev.k === 'help' ? 0x3b82f6 : ev.k === 'omw' ? 0xfacc15 : 0x22c55e;
        fx.ring(ev.x, ev.y, { color, radius: 2.2, life: 1.2 }); fx.ring(ev.x, ev.y, { color, radius: 1.2, life: 0.9 });
        break;
      }
      case 'cc': if (ent && ev.k !== 'slow') fx.glow(ent.x, ent.y, { y: 2, color: 0xfde047, size: 1.4, life: 0.3 }); break;
      default:
    }
  }

  shake(a) { this.shakeAmt = Math.min(1, this.shakeAmt + a); }

  showAim(p) { this.aimMarker.visible = !!p; if (p) this.aimMarker.position.set(p.x, 0.12, p.y); }

  showMoveMarker(x, y, attack = false) {
    this.moveMarker.position.set(x, 0.1, y);
    this.moveMarker.material.color.set(attack ? 0xef4444 : 0x4ade80);
    this.moveMarker.visible = true;
    this.moveMarkerT = 0.5;
  }

  frame(dt, world, focus, edgePan) {
    this.time += dt;
    this.world = world;
    if (this.locked && focus) {
      this.camTarget.x = THREE.MathUtils.lerp(this.camTarget.x, focus.x, Math.min(1, dt * 8));
      this.camTarget.z = THREE.MathUtils.lerp(this.camTarget.z, focus.y, Math.min(1, dt * 8));
    } else if (edgePan) {
      this.camTarget.x = Math.max(0, Math.min(this.valley?.size || 150, this.camTarget.x + edgePan.x * dt * 40));
      this.camTarget.z = Math.max(0, Math.min(this.valley?.size || 150, this.camTarget.z + edgePan.y * dt * 40));
    }
    const d = 26 * this.zoom;
    let sx = 0, sy = 0;
    if (this.shakeAmt > 0) { sx = (Math.random() - 0.5) * this.shakeAmt * 0.5; sy = (Math.random() - 0.5) * this.shakeAmt * 0.5; this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.5); }
    this.camera.position.set(this.camTarget.x + sx, d * 0.9, this.camTarget.z + d * 0.48 + sy);
    this.camera.lookAt(this.camTarget.x + sx, 0, this.camTarget.z + sy);
    this.sun.position.set(this.camTarget.x - 12, 30, this.camTarget.z + 10);
    this.sun.target.position.copy(this.camTarget);
    if (this.terrain) this.terrain.water.uniforms.uTime.value = this.time;
    if (this.moveMarkerT > 0) { this.moveMarkerT -= dt; this.moveMarker.scale.setScalar(1 + (0.5 - this.moveMarkerT)); this.moveMarker.material.opacity = this.moveMarkerT * 2; if (this.moveMarkerT <= 0) this.moveMarker.visible = false; }
    this.update(world, dt);
    this.updateFog(world, dt);
    this.fx.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  showRange(x, y, r) {
    if (!r) { this.rangeRing.visible = false; return; }
    this.rangeRing.visible = true;
    this.rangeRing.position.set(x, 0.1, y);
    this.rangeRing.scale.setScalar(r);
  }

  pick(px, py) {
    const ndc = new THREE.Vector2((px / this.width) * 2 - 1, -(py / this.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return null;
    return { x: hit.x, y: hit.z };
  }

  project(x, y, h = 0) {
    this.tmp.set(x, h, y).project(this.camera);
    return { x: (this.tmp.x + 1) / 2 * this.width, y: (1 - this.tmp.y) / 2 * this.height, visible: this.tmp.z < 1 };
  }

  /** Ground rectangle currently in view (for the minimap). */
  viewBounds() {
    const corners = [[0, 0], [this.width, 0], [this.width, this.height], [0, this.height]].map(([x, y]) => this.pick(x, y)).filter(Boolean);
    return corners;
  }
}
