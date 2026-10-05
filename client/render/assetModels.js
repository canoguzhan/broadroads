/* 3D assets generated with Tripo3D (scripts/generate-models.mjs →
   scripts/build-models.mjs, listed in public/models/manifest.json).
   Champions, minions and monsters get rigged models with an animation state
   machine; structures, props and flying/hopping creatures are static.
   Anything without a model, or whose model hasn't loaded yet, keeps its
   procedural look from mobaModels.js / valley.js. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

const BASE = `${import.meta.env.BASE_URL || '/'}models/`;
const ONE_SHOT = { attack: 0.55, cast: 0.75 }; // seconds each one-shot clip is squeezed into
const RIG_YAW = -Math.PI / 2; // Tripo rigs face 90° off the procedural models' forward (+Z)
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();
let manifest = null;
let enabled = true;

/** Settings toggle: when off, everything keeps its lightweight procedural look. */
export function setModelsEnabled(on) { enabled = on; }

function getManifest() {
  if (!manifest) manifest = fetch(`${BASE}manifest.json`).then(r => (r.ok ? r.json() : {})).catch(() => ({}));
  return manifest;
}

/** Loads (once) and resolves to the GLTF, or null if there is no model. */
export function loadModel(id) {
  if (!enabled) return Promise.resolve(null);
  if (!cache.has(id)) {
    cache.set(id, getManifest().then(m => {
      const entry = m[id];
      if (!entry) return null;
      return new Promise(resolve => loader.load(`${BASE}${entry.file}?v=${entry.v}`, g => { g.userData.yaw = entry.yaw; resolve(g); }, undefined, err => { console.warn(`model ${id}:`, err.message || err); resolve(null); }));
    }));
  }
  return cache.get(id);
}

/* ---------------- which model an entity uses ---------------- */
const MONSTER_ASSET = {
  mossback: ['mob_mossback', 2.6], brute: ['mob_brute', 2.6], stonehulk: ['mob_stonehulk', 2.0], pebblet: ['mob_stonehulk', 2.0],
  wolf: ['mob_wolf', 1.5], pup: ['mob_wolf', 1.5], duskwing: ['mob_bat', 1.3], duskling: ['mob_bat', 1.3],
  bogtoad: ['mob_toad', 1.5], wyrm: ['mob_wyrm', 3.4], titan: ['mob_titan', 4.6],
};
// How static creatures move: hover (bat), hop (toad), stride (wolf, wyrm, siege cart).
const STATIC_MOTION = { duskwing: 'hover', duskling: 'hover', bogtoad: 'hop' };
const MINION_HEIGHT = { melee: 1.15, caster: 1.15, super: 1.9, siege: 1.3 };
const STRUCTURE_HEIGHT = { tower: 5.6, spire: 3.2, core: 6 };

/** [assetId, height in world units] for an entity, or null. */
export function assetFor(e, heroHeight) {
  switch (e.kind) {
    case 'hero': return [e.c, heroHeight];
    case 'minion': return MINION_HEIGHT[e.t] ? [`minion_${e.t}_${e.tm}`, MINION_HEIGHT[e.t]] : null;
    case 'monster': return MONSTER_ASSET[e.t] || null;
    case 'tower': case 'spire': case 'core': return [`${e.kind}_${e.tm === 'red' ? 'red' : 'blue'}`, STRUCTURE_HEIGHT[e.kind]];
    default: return null;
  }
}

function fit(model, height) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const s = height / Math.max(0.01, box.max.y - box.min.y);
  model.scale.setScalar(s);
  model.position.y = -box.min.y * s;
}

function adopt(view, model) {
  model.traverse(o => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.castShadow = true;
    o.frustumCulled = false;
    if (o.material.emissive) view.mats.push({ m: o.material, base: o.material.emissive.clone(), bi: o.material.emissiveIntensity });
  });
  // Hide the procedural body; keep the selection ring and glow sprites (team colour).
  for (const c of view.root.children) if (c !== view.parts.ring && !c.isSprite) c.visible = false;
  view.root.add(model);
}

/** Replaces a procedural entity with its Tripo model. */
export function attachModel(view, gltf, height) {
  const animated = gltf.animations.length > 0;
  const model = animated ? cloneSkinned(gltf.scene) : gltf.scene.clone();
  model.rotation.y = gltf.userData.yaw ?? (animated ? RIG_YAW : 0);
  fit(model, height);
  adopt(view, model);
  view.model = model;
  view.modelY = model.position.y;
  if (!animated) return;
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const clip of gltf.animations) {
    const a = mixer.clipAction(clip);
    if (ONE_SHOT[clip.name] || clip.name === 'death') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    if (ONE_SHOT[clip.name]) a.timeScale = clip.duration / ONE_SHOT[clip.name];
    actions[clip.name] = a;
  }
  view.anim = { model, mixer, actions, current: null, oneShotUntil: 0 };
  play(view.anim, actions.idle ? 'idle' : 'run', 0);
  if (!actions.idle) actions.run.timeScale = 0;
}

function play(anim, name, fade = 0.15, restart = false) {
  const next = anim.actions[name] || anim.actions.idle || anim.actions.run;
  if (!next || (anim.current === next && !restart)) return;
  const prev = anim.current;
  next.reset().setEffectiveWeight(1).play();
  if (prev && prev !== next) prev.crossFadeTo(next, fade, false);
  anim.current = next;
}

/** Per-frame update for a unit with a model: death > attack/cast > run > idle.
    Missing clips fall back to procedural motion (lunge, hover, hop). */
export function animateModel(view, e, dead, moving, dt, now) {
  const anim = view.anim, model = view.model;
  const lunge = view.attackT > 0 ? Math.sin(view.attackT * Math.PI) : 0;
  if (anim) {
    if (dead) play(anim, 'death', 0.1);
    else if (view.oneShot) {
      const name = anim.actions[view.oneShot] ? view.oneShot : 'attack';
      if (anim.actions[name]) { play(anim, name, 0.08, true); anim.oneShotUntil = now + ONE_SHOT[name] * 1000; }
      view.oneShot = null;
    } else if (now >= anim.oneShotUntil) {
      if (!anim.actions.idle) anim.actions.run.timeScale = moving ? 1 : 0; // walk-only rigs freeze when standing
      play(anim, moving ? 'run' : 'idle');
    }
    if (!anim.actions.attack) model.position.z = lunge * 0.35;
    anim.mixer.update(dt);
  } else {
    view.oneShot = null;
    const t = view.phase;
    const style = STATIC_MOTION[e.t] || 'stride';
    const step = moving ? Math.abs(Math.sin(t * (style === 'hop' ? 6 : 9))) : 0;
    let y = 0;
    if (style === 'hover') y = 0.9 + Math.sin(t * 3) * 0.15;
    else if (style === 'hop') y = step * 0.4;
    else if (style === 'stride') y = step * 0.06 + Math.sin(t * 1.6) * 0.02; // breathing when idle
    model.position.y = view.modelY + y;
    model.position.z = lunge * (e.t === 'wyrm' ? 0.8 : 0.4);
    model.rotation.x = style === 'hop' ? -step * 0.15 : style === 'stride' && moving ? Math.sin(t * 9) * 0.03 : 0;
  }
  if (view.attackT > 0) view.attackT = Math.max(0, view.attackT - dt * 4);
}

/** Death animation for units removed from the world (minions, monsters). */
export function animateDying(view, dt) {
  const anim = view.anim;
  if (!anim) return false;
  if (anim.current !== anim.actions.death && anim.actions.death) { anim.actions.death.timeScale = 2.5; play(anim, 'death', 0.08); }
  anim.mixer.update(dt);
  return !!anim.actions.death;
}
