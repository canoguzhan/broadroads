/* 3D assets generated with Tripo3D (scripts/generate-models.mjs →
   scripts/build-models.mjs, listed in public/models/manifest.json).
   Champions, minions and monsters get rigged models with an animation state
   machine; structures, props and flying/hopping creatures are static.
   Anything without a model, or whose model hasn't loaded yet, keeps its
   procedural look from mobaModels.js / valley.js. */
import { applyLook } from './readability.js';
import { applyCreatureMotion } from './creatureMotion.js';
import { packInstalled } from './assetPack.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { F } from '../../shared/constants.js';
import { SKINS } from '../../shared/moba/progression.js';

const BASE = `${import.meta.env.BASE_URL || '/'}models/`;
// One-shot clips play faster than authored, within these bounds (seconds); each champion's
// clip keeps its own pacing (a quick jab stays quick, a big lift a little longer).
const ONE_SHOT = { attack: [0.45, 0.65], cast: [0.6, 1.0], ult: [0.7, 1.2] };
// Bones above the hips: a one-shot started while moving plays on these over the running legs.
const UPPER = /^(Waist|Spine|Neck|Head|[LR]_(Clavicle|Upperarm|Forearm|Hand))/;
const splitClip = (clip, upper, name) => new THREE.AnimationClip(name, clip.duration, clip.tracks.filter(t => UPPER.test(t.name.split('.')[0]) === upper));
const oneShotLen = clip => Math.min(ONE_SHOT[clip.name][1], Math.max(ONE_SHOT[clip.name][0], clip.duration / 2.2));
const RIG_YAW = -Math.PI / 2; // Tripo rigs face 90° off the procedural models' forward (+Z)
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();
let manifest = null;
let enabled = true;

/** Settings toggle: when off, everything keeps its lightweight procedural look. */
export function setModelsEnabled(on) { enabled = on; }
export const modelsEnabled = () => enabled;
let lowDetail = false;
/** Phones and Low quality load the lighter `.lo.glb` twins. */
export function setLowDetail(on) { lowDetail = on; }

function getManifest() {
  if (!manifest) manifest = fetch(`${BASE}manifest.json`).then(r => (r.ok ? r.json() : {})).catch(() => ({}));
  return manifest;
}

/** Loads (once) and resolves to the GLTF, or null if there is no model. */
/** A champion in a skin: the skin's own model when one exists ('garrok_frost'), otherwise the
    base model with the skin as a colour tint. Resolves to { gltf, tint }. */
export async function loadChampion(champ, skin) {
  if (skin && skin !== 'base' && (await getManifest())[`${champ}_${skin}`]) {
    const gltf = await loadModel(`${champ}_${skin}`);
    if (gltf) return { gltf, tint: 'base' };
  }
  return { gltf: await loadModel(champ), tint: skin };
}

export function loadModel(id) {
  if (!enabled) return Promise.resolve(null);
  if (!cache.has(id)) {
    cache.set(id, getManifest().then(m => {
      const entry = m[id];
      if (!entry) return null;
      return new Promise(resolve => loader.load(`${BASE}${lowDetail && entry.lo ? entry.lo : entry.file}?v=${entry.v}`, g => { g.userData.yaw = entry.yaw; resolve(g); }, undefined, err => { console.warn(`model ${id}:`, err.message || err); resolve(null); }));
    }));
  }
  return cache.get(id);
}

/* ---------------- preloading ---------------- */
// Models every match uses, fetched during champion select.
const COMMON = ['tower', 'spire', 'core', 'fountain'].flatMap(k => [`${k}_blue`, `${k}_red`])
  .concat(['melee', 'caster', 'super', 'siege'].flatMap(t => [`minion_${t}_blue`, `minion_${t}_red`]))
  .concat([...(packInstalled() ? ['hd_tree_oak', 'hd_tree_ancient', 'hd_tree_pine', 'hd_grass', 'hd_bush'] : []), 'mob_mossback', 'mob_brute', 'mob_stonehulk', 'mob_wolf', 'mob_bat', 'mob_toad', 'mob_wyrm', 'mob_titan']);
const queue = [];
let pumping = false;

/** Queues models to load one at a time (champions first), without blocking the page. */
export function preloadModels(ids, { common = false, first = false } = {}) {
  if (!enabled) return;
  const add = common ? [...ids, ...COMMON] : ids;
  for (const id of add) if (!cache.has(id) && !queue.includes(id)) first ? queue.unshift(id) : queue.push(id);
  if (pumping) return;
  pumping = true;
  (async () => {
    while (queue.length && enabled) {
      const id = queue.shift();
      if (!cache.has(id)) await loadModel(id);
      await new Promise(r => setTimeout(r, 30)); // let the page breathe between parses
    }
    pumping = false;
  })();
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

/** Champion skins: a colour tint (and glow) over the model's textures. Materials must already be per-instance. */
export function applySkin(model, skin) {
  const s = SKINS[skin];
  model.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const m = o.material;
    if (!m.userData.base) m.userData.base = { color: m.color.getHex(), emissive: m.emissive ? m.emissive.getHex() : 0, metalness: m.metalness, roughness: m.roughness };
    const b = m.userData.base;
    m.color.setHex(s ? s.tint : b.color);
    if (m.emissive) m.emissive.setHex(s ? s.emissive : b.emissive);
    if ('metalness' in m) { m.metalness = skin === 'gilded' ? 0.65 : b.metalness; m.roughness = skin === 'gilded' ? 0.35 : b.roughness; }
  });
}

function adopt(view, model, skin) {
  model.traverse(o => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.castShadow = true;
    o.frustumCulled = false;
  });
  if (skin && skin !== 'base') applySkin(model, skin);
  model.traverse(o => { if (o.isMesh && o.material.emissive) view.mats.push({ m: o.material, base: o.material.emissive.clone(), bi: o.material.emissiveIntensity }); });
  // Hide the procedural body; keep the selection ring and glow sprites (team colour).
  for (const c of view.root.children) if (c !== view.parts.ring && !c.isSprite) c.visible = false;
  view.root.add(model);
}

/** Replaces a procedural entity with its Tripo model. */
export function attachModel(view, gltf, height, skin, look, assetId) {
  const animated = gltf.animations.length > 0;
  const model = animated ? cloneSkinned(gltf.scene) : gltf.scene.clone();
  model.rotation.y = gltf.userData.yaw ?? (animated ? RIG_YAW : 0);
  fit(model, height);
  adopt(view, model, skin);
  if (!animated) view.creature = applyCreatureMotion(model, assetId); // before the look: its patch chains onto this one
  if (look) view.look = applyLook(model, look);
  view.model = model;
  view.modelY = model.position.y;
  if (!animated) return;
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const clip of gltf.animations) {
    const a = mixer.clipAction(clip);
    if (ONE_SHOT[clip.name] || clip.name === 'death' || clip.name === 'cheer' || clip.name === 'laugh') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    if (ONE_SHOT[clip.name]) { a.userData = { len: oneShotLen(clip) }; a.timeScale = clip.duration / a.userData.len; }
    actions[clip.name] = a;
    if (ONE_SHOT[clip.name]) { // upper-body copy for casting on the move
      const up = mixer.clipAction(splitClip(clip, true, `${clip.name}_upper`));
      up.setLoop(THREE.LoopOnce, 1); up.clampWhenFinished = true; up.timeScale = a.timeScale; up.userData = a.userData;
      actions[`${clip.name}_upper`] = up;
    }
  }
  if (actions.run) { const legs = mixer.clipAction(splitClip(actions.run.getClip(), false, 'run_lower')); actions.run_lower = legs; }
  view.anim = { model, mixer, actions, current: null, oneShotUntil: 0, layer: null };
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

/** Per-frame update for a unit with a model: death > stun > attack/cast > run > idle.
    Missing clips fall back to procedural motion (lunge, hover, hop, wobble). */
export function animateModel(view, e, dead, moving, dt, now) {
  const anim = view.anim, model = view.model;
  const lunge = view.attackT > 0 ? Math.sin(view.attackT * Math.PI) : 0;
  const stunned = !dead && (e.fl & F.STUN) !== 0;
  if (anim) {
    if (dead) play(anim, 'death', 0.1);
    else if (stunned && anim.actions.stun) { play(anim, 'stun', 0.12); view.oneShot = null; anim.oneShotUntil = 0; }
    else if (view.oneShot) {
      const name = anim.actions[view.oneShot] ? view.oneShot : view.oneShot === 'ult' && anim.actions.cast ? 'cast' : 'attack';
      const upper = anim.actions[`${name}_upper`];
      if (moving && upper && anim.actions.run_lower) {
        // On the move: legs keep running, the upper body plays the strike or cast.
        play(anim, 'run_lower', 0.1);
        if (anim.layer && anim.layer !== upper) anim.layer.fadeOut(0.08);
        upper.reset().setEffectiveWeight(1).fadeIn(0.06).play();
        anim.layer = upper;
        anim.layerUntil = now + (upper.userData?.len || 0.6) * 1000;
      } else if (anim.actions[name]) { play(anim, name, 0.08, true); anim.oneShotUntil = now + (anim.actions[name].userData?.len || 0.6) * 1000; }
      view.oneShot = null;
    } else if (anim.layer && now >= anim.layerUntil) {
      anim.layer.fadeOut(0.12); anim.layer = null;
      play(anim, moving ? 'run' : 'idle', 0.15);
    } else if (anim.layer) {
      // keep the legs running under the upper-body layer
    } else if (now >= anim.oneShotUntil) {
      if (!anim.actions.idle) anim.actions.run.timeScale = moving ? 1 : 0; // walk-only rigs freeze when standing
      // Emotes play while standing still; moving cancels them.
      if (view.emote && (moving || now > view.emote.until || !anim.actions[view.emote.k])) view.emote = null;
      play(anim, view.emote ? view.emote.k : moving ? 'run' : 'idle', 0.2);
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
    if (view.creature) { view.creature.uTime.value = t; view.creature.uMove.value += ((moving ? 1 : 0) - view.creature.uMove.value) * Math.min(1, dt * 6); view.creature.uAttack.value = lunge; }
    model.rotation.x = style === 'hop' ? -step * 0.15 : style === 'stride' && moving ? Math.sin(t * 9) * 0.03 : 0;
  }
  // Stun wobble for models without a stun clip, and a quick backward flinch when hit.
  model.rotation.z = stunned && !anim?.actions.stun ? Math.sin(view.phase * 9) * 0.1 : 0;
  const age = e.hitT ? now - e.hitT : 1e9;
  if (age < 160) model.rotation.x = (model.rotation.x || 0) * 0.5 - 0.14 * (1 - age / 160);
  else if (anim) model.rotation.x = 0;
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
