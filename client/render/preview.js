/* 3D champion preview for champion select and the lobby's Champions tab:
   the rigged model on a glowing pedestal, idling and slowly turning
   (drag to rotate), with a cast/attack flourish on pick and lock-in.
   One shared canvas; it only renders while attached to the page. */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadModel, modelsEnabled } from './assetModels.js';
import { h } from '../ui/dom.js';
import { pic, champKey } from '../ui/icons.js';

const RIG_YAW = -Math.PI / 2;

class ChampionPreview {
  constructor() {
    this.el = h('div.champ-preview');
    this.canvas = h('canvas');
    this.fallback = h('div.cp-fallback');
    this.el.append(this.canvas, this.fallback);
    this.id = null;
    this.spin = 0.35;
    this.drag = null;
    this.canvas.addEventListener('pointerdown', e => { this.drag = { x: e.clientX, spin: this.spin }; this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointermove', e => { if (this.drag) this.spin = this.drag.spin + (e.clientX - this.drag.x) * 0.012; });
    this.canvas.addEventListener('pointerup', () => { this.drag = null; this.idleT = 0; });
  }

  init() {
    if (this.renderer) return true;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    } catch { return false; }
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x404a60, 2));
    const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(2, 4, 4); this.scene.add(key);
    this.rim = new THREE.DirectionalLight(0x9ec5ff, 2.4); this.rim.position.set(-3, 2.5, -3); this.scene.add(this.rim);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
    this.camera.position.set(0, 1.3, 5.4);
    this.camera.lookAt(0, 1.05, 0);
    // Pedestal: a glowing ring and soft disc in the champion's accent colour.
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xd4af37, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.05, 64), this.ringMat);
    ring.rotation.x = -Math.PI / 2;
    this.discMat = new THREE.MeshBasicMaterial({ color: 0xd4af37, transparent: true, opacity: 0.18, side: THREE.DoubleSide });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.95, 48), this.discMat);
    disc.rotation.x = -Math.PI / 2;
    this.scene.add(ring, disc);
    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    this.clock = new THREE.Clock();
    new ResizeObserver(() => this.resize()).observe(this.el);
    return true;
  }

  resize() {
    const w = this.el.clientWidth, hgt = this.el.clientHeight;
    if (!w || !hgt || !this.renderer) return;
    this.renderer.setSize(w, hgt, false);
    this.camera.aspect = w / hgt;
    this.camera.updateProjectionMatrix();
  }

  /** Shows a champion; info gives its accent colour and portrait fallback. */
  show(id, info) {
    if (id === this.id) return;
    this.id = id;
    this.fallback.replaceChildren(pic(champKey(id), info?.icon || ''));
    const use3d = modelsEnabled() && this.init();
    this.el.classList.toggle('flat', !use3d);
    if (!use3d) return;
    if (info) { this.ringMat.color.setHex(info.accent); this.discMat.color.setHex(info.accent); this.rim.color.setHex(info.accent).lerp(new THREE.Color(0xffffff), 0.4); }
    loadModel(id).then(gltf => {
      if (this.id !== id) return;
      if (!gltf) { this.el.classList.add('flat'); return; }
      this.el.classList.remove('flat');
      this.holder.clear();
      const model = cloneSkinned(gltf.scene);
      model.rotation.y = gltf.userData.yaw ?? RIG_YAW;
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const s = 2.2 / Math.max(0.01, box.max.y - box.min.y);
      model.scale.setScalar(s);
      model.position.y = -box.min.y * s;
      model.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
      this.holder.add(model);
      this.mixer = new THREE.AnimationMixer(model);
      this.actions = Object.fromEntries(gltf.animations.map(c => [c.name, this.mixer.clipAction(c)]));
      this.current = null;
      this.play('idle');
      this.flourish('cast');
      this.loop();
    });
  }

  play(name, once = false) {
    const next = this.actions?.[name] || this.actions?.idle;
    if (!next) return;
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.play();
    if (this.current && this.current !== next) this.current.crossFadeTo(next, 0.25, false);
    this.current = next;
    if (once) {
      clearTimeout(this.backT);
      this.backT = setTimeout(() => this.play('idle'), Math.min(2200, next.getClip().duration * 1000 - 150));
    }
  }

  /** One-shot showcase animation (cast on pick, attack on lock-in). */
  flourish(name) { if (this.actions?.[name]) this.play(name, true); }

  /** Returns the element to place in the page (re-attaching is fine). */
  mount() { if (this.renderer) requestAnimationFrame(() => { this.resize(); this.loop(); }); return this.el; }

  loop() {
    if (this.running || !this.renderer) return;
    this.running = true;
    const tick = () => {
      if (!this.el.isConnected) { this.running = false; return; }
      const dt = Math.min(0.05, this.clock.getDelta());
      if (!this.drag) this.spin += dt * 0.25;
      this.holder.rotation.y = this.spin;
      this.mixer?.update(dt);
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(tick);
    };
    this.clock.getDelta();
    requestAnimationFrame(tick);
  }
}

export const championPreview = new ChampionPreview();
