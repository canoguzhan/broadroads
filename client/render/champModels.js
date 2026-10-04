/* Rigged champion models generated with Tripo3D (scripts/generate-champions.mjs
   → scripts/build-models.mjs). Each GLB carries idle/run/attack/cast/death
   clips. Champions without a model, or whose model hasn't loaded yet, keep
   their procedural body from mobaModels.js. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

const BASE = `${import.meta.env.BASE_URL || '/'}models/`;
const ONE_SHOT = { attack: 0.55, cast: 0.75 }; // seconds each one-shot clip is squeezed into
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();
let manifest = null;

function getManifest() {
  if (!manifest) manifest = fetch(`${BASE}manifest.json`).then(r => (r.ok ? r.json() : {})).catch(() => ({}));
  return manifest;
}

/** Starts loading the models for these champions; resolves to the GLTF (or null). */
export function loadChampModel(id) {
  if (!cache.has(id)) {
    cache.set(id, getManifest().then(m => {
      const entry = m[id];
      if (!entry) return null;
      return new Promise(resolve => loader.load(`${BASE}${entry.file}?v=${entry.v}`, resolve, undefined, err => { console.warn(`model ${id}:`, err.message || err); resolve(null); }));
    }));
  }
  return cache.get(id);
}

/** Replaces a procedural hero's body with the rigged model. height: world units. */
export function attachChampModel(view, gltf, height) {
  const model = cloneSkinned(gltf.scene);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const s = height / Math.max(0.01, box.max.y - box.min.y);
  model.scale.setScalar(s);
  model.position.y = -box.min.y * s;
  model.traverse(o => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.castShadow = true;
    o.frustumCulled = false;
    if (o.material.emissive) view.mats.push({ m: o.material, base: o.material.emissive.clone(), bi: o.material.emissiveIntensity });
  });
  view.parts.body.visible = false;
  view.root.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const clip of gltf.animations) {
    const a = mixer.clipAction(clip);
    if (ONE_SHOT[clip.name] || clip.name === 'death') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    if (ONE_SHOT[clip.name]) a.timeScale = clip.duration / ONE_SHOT[clip.name];
    actions[clip.name] = a;
  }
  view.anim = { model, mixer, actions, current: null, oneShotUntil: 0 };
  play(view.anim, 'idle', 0);
}

function play(anim, name, fade = 0.15, restart = false) {
  const next = anim.actions[name] || anim.actions.idle;
  if (!next || (anim.current === next && !restart)) return;
  const prev = anim.current;
  next.reset().setEffectiveWeight(1).play();
  if (prev && prev !== next) prev.crossFadeTo(next, fade, false);
  anim.current = next;
}

/** Per-frame state machine: death > attack/cast one-shot > run > idle. */
export function animateChamp(view, dead, moving, dt, now) {
  const anim = view.anim;
  if (dead) play(anim, 'death', 0.1);
  else if (view.oneShot) {
    const name = anim.actions[view.oneShot] ? view.oneShot : 'attack';
    if (anim.actions[name]) { play(anim, name, 0.08, true); anim.oneShotUntil = now + ONE_SHOT[name] * 1000; }
    view.oneShot = null;
  } else if (now >= anim.oneShotUntil) play(anim, moving ? 'run' : 'idle');
  anim.mixer.update(dt);
}
