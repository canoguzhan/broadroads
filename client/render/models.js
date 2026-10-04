/* Procedural low-poly models. Every model returns { root, parts } where
   parts holds the pieces the animator moves. */
import * as THREE from 'three';
import { makeGlowTexture } from './terrain.js';

const geoCache = new Map();
function geo(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.1, ...extra });
const basic = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, ...extra });

function mesh(g, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}

export const CLASS_COLORS = {
  paladin: { body: 0x9aa4b8, trim: 0xd4af37, cloth: 0x8b1e2d },
  gunner: { body: 0x5b6b4a, trim: 0xc9a227, cloth: 0x2e4057 },
  arcanist: { body: 0x4b3a78, trim: 0x7dd3fc, cloth: 0x2a1f4f },
};

export const RARITY_HEX = { common: 0xcbd5e1, uncommon: 0x4ade80, rare: 0x60a5fa, epic: 0xc084fc, legendary: 0xfb923c, mat: 0xfacc15, potion: 0xf43f5e };

function glowSprite(color, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.set(size, size, 1);
  return s;
}

/* ---------------- heroes ---------------- */
export function buildHero(cls, theme, gear = {}) {
  const c = CLASS_COLORS[cls] || CLASS_COLORS.paladin;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const armorColor = gear.armor ? new THREE.Color(RARITY_HEX[gear.armor]).lerp(new THREE.Color(c.body), 0.6) : new THREE.Color(c.body);
  const torso = mesh(geo('torso', () => new THREE.CylinderGeometry(0.28, 0.34, 0.75, 10)), std(armorColor, { metalness: cls === 'paladin' ? 0.5 : 0.15 }), 0, 0.85, 0);
  const belt = mesh(geo('belt', () => new THREE.CylinderGeometry(0.35, 0.35, 0.08, 10)), std(c.trim, { metalness: 0.6 }), 0, 0.55, 0);
  const legs = mesh(geo('legs', () => new THREE.CylinderGeometry(0.3, 0.22, 0.5, 10)), std(c.cloth), 0, 0.27, 0);
  const head = mesh(geo('head', () => new THREE.SphereGeometry(0.22, 14, 10)), std(0xe8c39e, { roughness: 0.9 }), 0, 1.42, 0);
  body.add(torso, belt, legs, head);

  if (cls === 'paladin') {
    const helm = mesh(geo('helm', () => new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)), std(0xb8c0cc, { metalness: 0.7, roughness: 0.3 }), 0, 1.45, 0);
    const plume = mesh(geo('plume', () => new THREE.ConeGeometry(0.06, 0.35, 6)), std(c.cloth), 0, 1.78, -0.05);
    const pauldL = mesh(geo('pauld', () => new THREE.SphereGeometry(0.16, 10, 8)), std(c.trim, { metalness: 0.7 }), -0.36, 1.12, 0);
    const pauldR = pauldL.clone(); pauldR.position.x = 0.36;
    body.add(helm, plume, pauldL, pauldR);
  } else if (cls === 'gunner') {
    const hat = mesh(geo('hat', () => new THREE.CylinderGeometry(0.34, 0.34, 0.05, 14)), std(0x4a3726), 0, 1.58, 0);
    const crown = mesh(geo('hatTop', () => new THREE.CylinderGeometry(0.17, 0.2, 0.22, 12)), std(0x4a3726), 0, 1.7, 0);
    const scarf = mesh(geo('scarf', () => new THREE.TorusGeometry(0.22, 0.06, 6, 12)), std(c.cloth), 0, 1.22, 0);
    scarf.rotation.x = Math.PI / 2;
    body.add(hat, crown, scarf);
  } else {
    const hood = mesh(geo('hood', () => new THREE.ConeGeometry(0.3, 0.6, 12)), std(c.cloth), 0, 1.62, 0);
    const robe = mesh(geo('robe', () => new THREE.ConeGeometry(0.42, 0.9, 12, 1, true)), std(c.cloth, { side: THREE.DoubleSide }), 0, 0.45, 0);
    body.add(hood, robe);
  }

  // Weapon hand pivots (animated on attack).
  const handR = new THREE.Group(); handR.position.set(0.4, 0.95, 0.05);
  const handL = new THREE.Group(); handL.position.set(-0.4, 0.95, 0.05);
  body.add(handR, handL);
  const weaponGlow = gear.weapon ? RARITY_HEX[gear.weapon] : theme.primaryHex;
  if (cls === 'paladin') {
    const blade = mesh(geo('blade', () => new THREE.BoxGeometry(0.08, 0.95, 0.03)), std(0xe5e7eb, { metalness: 0.9, roughness: 0.2, emissive: weaponGlow, emissiveIntensity: 0.25 }), 0, 0.55, 0);
    const guard = mesh(geo('guard', () => new THREE.BoxGeometry(0.3, 0.05, 0.06)), std(c.trim, { metalness: 0.8 }), 0, 0.08, 0);
    handR.add(blade, guard);
    handR.rotation.x = -0.4;
    const shield = mesh(geo('shield', () => new THREE.CylinderGeometry(0.32, 0.32, 0.06, 16)), std(c.cloth, { metalness: 0.3 }), 0, 0, 0.08);
    shield.rotation.x = Math.PI / 2;
    const boss = mesh(geo('shieldBoss', () => new THREE.SphereGeometry(0.09, 8, 6)), std(c.trim, { metalness: 0.9 }), 0, 0, 0.13);
    handL.add(shield, boss);
  } else if (cls === 'gunner') {
    for (const hand of [handR, handL]) {
      const gun = mesh(geo('gun', () => new THREE.BoxGeometry(0.1, 0.12, 0.45)), std(0x2b2b2b, { metalness: 0.8, roughness: 0.3 }), 0, 0, 0.22);
      const tip = mesh(geo('gunTip', () => new THREE.CylinderGeometry(0.04, 0.04, 0.1, 6)), basic(weaponGlow), 0, 0, 0.47);
      tip.rotation.x = Math.PI / 2;
      hand.add(gun, tip);
    }
  } else {
    const staff = mesh(geo('staff', () => new THREE.CylinderGeometry(0.035, 0.045, 1.5, 6)), std(0x5b3a1f), 0, 0.2, 0);
    const orb = mesh(geo('orb', () => new THREE.SphereGeometry(0.13, 14, 10)), basic(weaponGlow), 0, 0.98, 0);
    const og = glowSprite(weaponGlow, 0.9);
    og.position.y = 0.98;
    handR.add(staff, orb, og);
  }

  // Boots tint with gear rarity.
  if (gear.boots) {
    const boots = mesh(geo('boots', () => new THREE.CylinderGeometry(0.24, 0.26, 0.12, 10)), std(RARITY_HEX[gear.boots], { metalness: 0.4 }), 0, 0.06, 0);
    body.add(boots);
  }
  if (gear.relic) {
    const relic = glowSprite(RARITY_HEX[gear.relic], 0.5);
    relic.position.set(0, 1.0, 0.33);
    body.add(relic);
  }

  // Ground ring shows allegiance; colour is set by the view.
  const ring = new THREE.Mesh(geo('heroRing', () => new THREE.RingGeometry(0.55, 0.7, 28)), basic(0xffffff, { transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  root.add(ring);
  body.scale.setScalar(1.15);
  return { root, parts: { body, handR, handL, head, ring } };
}

/* ---------------- monsters ---------------- */
const MONSTER_BUILDERS = {
  slime(c) {
    const g = new THREE.Group();
    const b = mesh(geo('slime', () => new THREE.SphereGeometry(0.55, 16, 12)), std(c || 0x7c3aed, { transparent: true, opacity: 0.82, roughness: 0.2, emissive: 0x2e1065, emissiveIntensity: 0.6 }), 0, 0.45, 0);
    b.scale.y = 0.8;
    const eye1 = mesh(geo('eye', () => new THREE.SphereGeometry(0.08, 8, 6)), basic(0xffffff), -0.17, 0.62, 0.42);
    const eye2 = eye1.clone(); eye2.position.x = 0.17;
    g.add(b, eye1, eye2);
    return { g, bob: b };
  },
  bat() {
    const g = new THREE.Group();
    const b = mesh(geo('batBody', () => new THREE.SphereGeometry(0.25, 10, 8)), std(0x2d1b3d), 0, 1.3, 0);
    const wingGeo = geo('wing', () => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.7, 0.25); s.lineTo(0.55, -0.1); s.lineTo(0.3, 0.05); s.lineTo(0, -0.15); return new THREE.ShapeGeometry(s); });
    const wl = new THREE.Mesh(wingGeo, std(0x3b2352, { side: THREE.DoubleSide }));
    const wr = wl.clone(); wr.scale.x = -1;
    wl.position.set(0.15, 1.3, 0); wr.position.set(-0.15, 1.3, 0);
    wl.rotation.x = wr.rotation.x = -Math.PI / 2;
    const e1 = mesh(geo('eyeRed', () => new THREE.SphereGeometry(0.05, 6, 4)), basic(0xff2244), -0.09, 1.36, 0.2);
    const e2 = e1.clone(); e2.position.x = 0.09;
    g.add(b, wl, wr, e1, e2);
    return { g, wings: [wl, wr], bob: b };
  },
  wolf() {
    const g = new THREE.Group();
    const fur = std(0x6b6b74, { roughness: 1 });
    const b = mesh(geo('wolfBody', () => new THREE.BoxGeometry(0.5, 0.45, 1.0)), fur, 0, 0.6, 0);
    const h = mesh(geo('wolfHead', () => new THREE.BoxGeometry(0.38, 0.36, 0.45)), fur, 0, 0.82, 0.6);
    const snout = mesh(geo('wolfSnout', () => new THREE.BoxGeometry(0.2, 0.16, 0.25)), fur, 0, 0.74, 0.9);
    const e1 = mesh(geo('eyeY', () => new THREE.SphereGeometry(0.04, 6, 4)), basic(0xfde047), -0.1, 0.9, 0.83);
    const e2 = e1.clone(); e2.position.x = 0.1;
    const legs = [];
    for (const [x, z] of [[-0.18, 0.35], [0.18, 0.35], [-0.18, -0.35], [0.18, -0.35]]) {
      const l = mesh(geo('wolfLeg', () => new THREE.BoxGeometry(0.12, 0.4, 0.12)), fur, x, 0.2, z);
      legs.push(l); g.add(l);
    }
    const tail = mesh(geo('wolfTail', () => new THREE.ConeGeometry(0.08, 0.5, 6)), fur, 0, 0.75, -0.6);
    tail.rotation.x = -1.1;
    g.add(b, h, snout, e1, e2, tail);
    return { g, legs };
  },
  skeleton(c, bow = false) {
    const g = new THREE.Group();
    const bone = std(0xe7e2d3, { roughness: 0.6 });
    const ribs = mesh(geo('ribs', () => new THREE.CylinderGeometry(0.2, 0.15, 0.55, 8)), bone, 0, 0.95, 0);
    const pelvis = mesh(geo('pelvis', () => new THREE.BoxGeometry(0.3, 0.1, 0.15)), bone, 0, 0.62, 0);
    const skull = mesh(geo('skull', () => new THREE.SphereGeometry(0.2, 10, 8)), bone, 0, 1.4, 0);
    const e1 = mesh(geo('eyeGlow', () => new THREE.SphereGeometry(0.045, 6, 4)), basic(c || 0x22d3ee), -0.07, 1.42, 0.16);
    const e2 = e1.clone(); e2.position.x = 0.07;
    const legs = [];
    for (const x of [-0.1, 0.1]) { const l = mesh(geo('boneLeg', () => new THREE.CylinderGeometry(0.04, 0.04, 0.6, 5)), bone, x, 0.3, 0); legs.push(l); g.add(l); }
    const arm = new THREE.Group(); arm.position.set(0.28, 1.05, 0);
    const armBone = mesh(geo('boneArm', () => new THREE.CylinderGeometry(0.035, 0.035, 0.55, 5)), bone, 0, -0.25, 0);
    arm.add(armBone);
    if (bow) {
      const b = mesh(geo('bow', () => new THREE.TorusGeometry(0.4, 0.025, 4, 12, Math.PI)), std(0x6b4423), -0.28, 0.0, 0.25);
      b.rotation.set(0, Math.PI / 2, Math.PI / 2);
      g.add(b);
    } else {
      const sword = mesh(geo('rustBlade', () => new THREE.BoxGeometry(0.06, 0.65, 0.02)), std(0x8a8f99, { metalness: 0.7 }), 0, -0.6, 0.1);
      arm.add(sword);
    }
    g.add(ribs, pelvis, skull, e1, e2, arm);
    return { g, legs, arm };
  },
  brute() {
    const g = new THREE.Group();
    const skin = std(0x4d7c3a, { roughness: 0.9 });
    const b = mesh(geo('bruteBody', () => new THREE.BoxGeometry(1.1, 1.0, 0.75)), skin, 0, 1.05, 0);
    const belly = mesh(geo('bruteBelt', () => new THREE.BoxGeometry(1.15, 0.2, 0.8)), std(0x5b3a1f), 0, 0.6, 0);
    const h = mesh(geo('bruteHead', () => new THREE.BoxGeometry(0.5, 0.45, 0.45)), skin, 0, 1.75, 0.1);
    const t1 = mesh(geo('tusk', () => new THREE.ConeGeometry(0.05, 0.18, 5)), std(0xf5f0e1), -0.13, 1.6, 0.35);
    const t2 = t1.clone(); t2.position.x = 0.13;
    const legs = [];
    for (const x of [-0.3, 0.3]) { const l = mesh(geo('bruteLeg', () => new THREE.BoxGeometry(0.32, 0.55, 0.32)), std(0x3f2a18), x, 0.28, 0); legs.push(l); g.add(l); }
    const arm = new THREE.Group(); arm.position.set(0.7, 1.35, 0);
    const club = mesh(geo('club', () => new THREE.CylinderGeometry(0.1, 0.2, 1.2, 7)), std(0x5b3a1f), 0, -0.55, 0.25);
    club.rotation.x = 0.6;
    arm.add(club);
    g.add(b, belly, h, t1, t2, arm);
    return { g, legs, arm };
  },
  shaman() {
    const g = new THREE.Group();
    const robe = mesh(geo('shamanRobe', () => new THREE.ConeGeometry(0.5, 1.4, 10)), std(0x4c1d95), 0, 0.7, 0);
    const head = mesh(geo('shamanHead', () => new THREE.SphereGeometry(0.2, 10, 8)), std(0x6b8e5a), 0, 1.5, 0);
    const hood = mesh(geo('shamanHood', () => new THREE.ConeGeometry(0.26, 0.45, 10)), std(0x2e1065), 0, 1.68, 0);
    const orb = mesh(geo('shamanOrb', () => new THREE.SphereGeometry(0.14, 10, 8)), basic(0xa855f7), 0.45, 1.2, 0.2);
    const glow = glowSprite(0xa855f7, 1.1); glow.position.copy(orb.position);
    g.add(robe, head, hood, orb, glow);
    return { g, orb };
  },
  golem() {
    const g = new THREE.Group();
    const stone = std(0x6b6b6b, { roughness: 1, flatShading: true });
    const b = mesh(geo('golemBody', () => new THREE.DodecahedronGeometry(0.75, 0)), stone, 0, 1.3, 0);
    const h = mesh(geo('golemHead', () => new THREE.BoxGeometry(0.5, 0.4, 0.45)), stone, 0, 2.1, 0.1);
    const rune = mesh(geo('rune', () => new THREE.BoxGeometry(0.3, 0.3, 0.05)), basic(0x38bdf8), 0, 1.35, 0.7);
    const e1 = mesh(geo('golemEye', () => new THREE.BoxGeometry(0.1, 0.05, 0.05)), basic(0x38bdf8), -0.12, 2.12, 0.33);
    const e2 = e1.clone(); e2.position.x = 0.12;
    const legs = [];
    for (const x of [-0.35, 0.35]) { const l = mesh(geo('golemLeg', () => new THREE.BoxGeometry(0.4, 0.7, 0.4)), stone, x, 0.35, 0); legs.push(l); g.add(l); }
    const arm = new THREE.Group(); arm.position.set(0.85, 1.6, 0);
    arm.add(mesh(geo('golemArm', () => new THREE.BoxGeometry(0.38, 1.0, 0.38)), stone, 0, -0.45, 0));
    const arm2 = new THREE.Group(); arm2.position.set(-0.85, 1.6, 0);
    arm2.add(mesh(geo('golemArm', () => new THREE.BoxGeometry(0.38, 1.0, 0.38)), stone, 0, -0.45, 0));
    g.add(b, h, rune, e1, e2, arm, arm2);
    return { g, legs, arm };
  },
  colossus() {
    const s = MONSTER_BUILDERS.skeleton(0xff3b3b);
    s.g.scale.setScalar(2.6);
    const crown = mesh(geo('crown', () => new THREE.CylinderGeometry(0.22, 0.18, 0.12, 8, 1, true)), std(0xd4af37, { metalness: 0.9, side: THREE.DoubleSide }), 0, 1.58, 0);
    s.g.add(crown);
    return s;
  },
  overlord() {
    const g = new THREE.Group();
    const core = mesh(geo('ovCore', () => new THREE.IcosahedronGeometry(1.1, 1)), std(0x1e0b3a, { emissive: 0x7c3aed, emissiveIntensity: 0.6, flatShading: true }), 0, 2.4, 0);
    const eye = mesh(geo('ovEye', () => new THREE.SphereGeometry(0.35, 14, 10)), basic(0xff2a6d), 0, 2.5, 0.95);
    const glow = glowSprite(0x9333ea, 5); glow.position.y = 2.4;
    const shards = new THREE.Group(); shards.position.y = 2.4;
    for (let i = 0; i < 6; i++) {
      const sh = mesh(geo('shard', () => new THREE.OctahedronGeometry(0.3, 0)), std(0x6d28d9, { emissive: 0xa855f7, emissiveIntensity: 0.8 }), Math.cos(i) * 2, Math.sin(i * 2) * 0.4, Math.sin(i) * 2);
      sh.scale.y = 2;
      shards.add(sh);
    }
    const hornL = mesh(geo('horn', () => new THREE.ConeGeometry(0.2, 1.0, 6)), std(0x0f0f14), -0.6, 3.4, 0);
    hornL.rotation.z = 0.5;
    const hornR = hornL.clone(); hornR.position.x = 0.6; hornR.rotation.z = -0.5;
    g.add(core, eye, glow, shards, hornL, hornR);
    return { g, spin: shards, bob: core };
  },
  lich() {
    const g = new THREE.Group();
    const robe = mesh(geo('lichRobe', () => new THREE.ConeGeometry(0.9, 2.6, 12)), std(0x0f172a, { emissive: 0x0e7490, emissiveIntensity: 0.25 }), 0, 1.5, 0);
    const skull = mesh(geo('lichSkull', () => new THREE.SphereGeometry(0.38, 12, 10)), std(0xe2e8f0), 0, 3.05, 0);
    const crown = mesh(geo('lichCrown', () => new THREE.ConeGeometry(0.45, 0.6, 5, 1, true)), std(0x67e8f9, { emissive: 0x22d3ee, emissiveIntensity: 0.8, side: THREE.DoubleSide }), 0, 3.45, 0);
    const e1 = mesh(geo('eyeGlow', () => new THREE.SphereGeometry(0.045, 6, 4)), basic(0x22d3ee), -0.13, 3.08, 0.32);
    e1.scale.setScalar(2);
    const e2 = e1.clone(); e2.position.x = 0.13;
    const orbs = new THREE.Group(); orbs.position.y = 2;
    for (let i = 0; i < 3; i++) {
      const o = mesh(geo('lichOrb', () => new THREE.SphereGeometry(0.2, 10, 8)), basic(0x22d3ee), Math.cos(i * 2.1) * 1.4, 0, Math.sin(i * 2.1) * 1.4);
      const og = glowSprite(0x22d3ee, 1.2); og.position.copy(o.position);
      orbs.add(o, og);
    }
    g.add(robe, skull, crown, e1, e2, orbs);
    return { g, spin: orbs, bob: robe };
  },
  behemoth() {
    const g = new THREE.Group();
    const hide = std(0x4a2c2a, { roughness: 1, flatShading: true });
    const b = mesh(geo('behBody', () => new THREE.BoxGeometry(2.6, 2.0, 3.6)), hide, 0, 2.0, 0);
    const back = mesh(geo('behBack', () => new THREE.ConeGeometry(1.4, 1.6, 6)), std(0x2b1a19, { flatShading: true }), 0, 3.4, -0.3);
    const h = mesh(geo('behHead', () => new THREE.BoxGeometry(1.5, 1.3, 1.4)), hide, 0, 2.4, 2.3);
    const hornL = mesh(geo('behHorn', () => new THREE.ConeGeometry(0.22, 1.4, 6)), std(0xe7dcc0), -0.7, 3.3, 2.4);
    hornL.rotation.set(0.6, 0, 0.5);
    const hornR = hornL.clone(); hornR.position.x = 0.7; hornR.rotation.z = -0.5;
    const e1 = mesh(geo('behEye', () => new THREE.SphereGeometry(0.13, 8, 6)), basic(0xff7a00), -0.4, 2.6, 3.0);
    const e2 = e1.clone(); e2.position.x = 0.4;
    const legs = [];
    for (const [x, z] of [[-0.9, 1.1], [0.9, 1.1], [-0.9, -1.1], [0.9, -1.1]]) {
      const l = mesh(geo('behLeg', () => new THREE.BoxGeometry(0.7, 1.3, 0.7)), hide, x, 0.65, z);
      legs.push(l); g.add(l);
    }
    const lava = glowSprite(0xff5a1f, 3); lava.position.set(0, 3.6, -0.3);
    g.add(b, back, h, hornL, hornR, e1, e2, lava);
    return { g, legs };
  },
};
MONSTER_BUILDERS.archer = () => MONSTER_BUILDERS.skeleton(0xf97316, true);

export function buildMonster(type, elite) {
  const builder = MONSTER_BUILDERS[type] || MONSTER_BUILDERS.slime;
  const built = builder();
  const root = new THREE.Group();
  root.add(built.g);
  if (elite) {
    built.g.scale.multiplyScalar(1.25);
    const aura = new THREE.Mesh(geo('eliteRing', () => new THREE.RingGeometry(0.8, 1.05, 32)), basic(0xfacc15, { transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.04;
    root.add(aura);
    built.aura = aura;
  }
  return { root, parts: built };
}

/* ---------------- NPCs, loot, objects ---------------- */
export function buildNpc(type, color) {
  const root = new THREE.Group();
  const hero = buildHero(type === 'blacksmith' || type === 'arena' ? 'paladin' : type === 'merchant' ? 'gunner' : 'arcanist', { primaryHex: new THREE.Color(color).getHex() });
  hero.parts.ring.material.color.set(color);
  root.add(hero.root);
  // Market counter in front and a banner pole behind.
  const counter = mesh(geo('counter', () => new THREE.BoxGeometry(2.2, 0.7, 0.5)), std(0x6b4423, { roughness: 0.9 }), 0, 0.35, 1.1);
  const cloth = mesh(geo('counterCloth', () => new THREE.BoxGeometry(2.25, 0.12, 0.55)), std(color, { roughness: 0.8 }), 0, 0.72, 1.1);
  const pole = mesh(geo('pole', () => new THREE.CylinderGeometry(0.06, 0.06, 3.6, 6)), std(0x5b3a1f), -1.1, 1.8, -0.9);
  const flag = mesh(geo('flag', () => new THREE.BoxGeometry(0.9, 1.3, 0.04)), std(color, { emissive: color, emissiveIntensity: 0.25 }), -0.6, 2.9, -0.9);
  root.add(counter, cloth, pole, flag);
  const marker = glowSprite(color, 1.6);
  marker.position.y = 3.6;
  root.add(marker);
  return { root, parts: { ...hero.parts, marker } };
}

export function buildLoot(rarity, lootType) {
  const root = new THREE.Group();
  const color = RARITY_HEX[rarity] || 0xffffff;
  let gem;
  if (lootType === 'potion') {
    gem = mesh(geo('potion', () => new THREE.SphereGeometry(0.2, 10, 8)), std(color, { emissive: color, emissiveIntensity: 0.5, transparent: true, opacity: 0.9 }), 0, 0.45, 0);
  } else if (lootType === 'mat') {
    gem = mesh(geo('ore', () => new THREE.OctahedronGeometry(0.22, 0)), std(color, { emissive: color, emissiveIntensity: 0.6, flatShading: true }), 0, 0.45, 0);
  } else {
    gem = mesh(geo('lootBag', () => new THREE.BoxGeometry(0.35, 0.35, 0.35)), std(color, { emissive: color, emissiveIntensity: 0.45, metalness: 0.5 }), 0, 0.45, 0);
    gem.rotation.set(0.6, 0, 0.6);
  }
  const glow = glowSprite(color, rarity === 'legendary' || rarity === 'epic' ? 2.2 : 1.2);
  glow.position.y = 0.45;
  root.add(gem, glow);
  if (['rare', 'epic', 'legendary'].includes(rarity)) {
    const beam = new THREE.Mesh(geo('beam', () => new THREE.CylinderGeometry(0.08, 0.15, 6, 8, 1, true)), basic(color, { transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 3;
    root.add(beam);
  }
  return { root, parts: { gem } };
}

export function buildPortal(type, open) {
  const root = new THREE.Group();
  const color = type === 'exit' ? 0x38bdf8 : open ? 0xfacc15 : 0x64748b;
  const ring = mesh(geo('portalRing', () => new THREE.TorusGeometry(0.9, 0.12, 8, 28)), std(color, { emissive: color, emissiveIntensity: 0.7 }), 0, 1.1, 0);
  const disc = new THREE.Mesh(geo('portalDisc', () => new THREE.CircleGeometry(0.85, 28)), basic(color, { transparent: true, opacity: open ? 0.45 : 0.15, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  disc.position.y = 1.1;
  const base = new THREE.Mesh(geo('portalBase', () => new THREE.RingGeometry(0.6, 1.2, 32)), basic(color, { transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.04;
  const glow = glowSprite(color, 3);
  glow.position.y = 1.1;
  root.add(ring, disc, base, glow);
  if (type === 'stairs') {
    for (let i = 0; i < 4; i++) {
      const step = mesh(geo('step', () => new THREE.BoxGeometry(1.6, 0.12, 0.4)), std(0x3f3a46), 0, 0.06 - i * 0.01, -0.6 + i * 0.4);
      step.scale.x = 1 - i * 0.12;
      root.add(step);
    }
  }
  return { root, parts: { ring, disc, base, glow, color } };
}

export function buildChest(open) {
  const root = new THREE.Group();
  const wood = std(0x7a4b22, { roughness: 0.8 });
  const gold = std(0xd4af37, { metalness: 0.9, roughness: 0.3 });
  const box = mesh(geo('chestBox', () => new THREE.BoxGeometry(0.9, 0.5, 0.6)), wood, 0, 0.25, 0);
  const band = mesh(geo('chestBand', () => new THREE.BoxGeometry(0.92, 0.08, 0.62)), gold, 0, 0.35, 0);
  const lidPivot = new THREE.Group(); lidPivot.position.set(0, 0.5, -0.3);
  const lid = mesh(geo('chestLid', () => new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10, 1, false, 0, Math.PI)), wood, 0, 0, 0.3);
  lid.rotation.z = Math.PI / 2;
  lidPivot.add(lid);
  if (open) lidPivot.rotation.x = -1.9;
  const glow = glowSprite(0xfacc15, open ? 0.01 : 1.6);
  glow.position.y = 0.6;
  root.add(box, band, lidPivot, glow);
  return { root, parts: { lidPivot, glow } };
}

const PROJ_COLORS = { bolt: 0xfde047, lance: 0x67e8f9, spark: 0xc084fc, arrow: 0xf97316, orb: 0xa855f7, rocket: 0xfb923c };

export function buildProjectile(style, themeColor) {
  const root = new THREE.Group();
  const color = style === 'bolt' || style === 'spark' || style === 'lance' ? themeColor : PROJ_COLORS[style] || 0xffffff;
  const size = style === 'lance' ? 0.24 : style === 'orb' ? 0.22 : 0.14;
  const core = new THREE.Mesh(geo(`proj${size}`, () => new THREE.SphereGeometry(size, 10, 8)), basic(0xffffff));
  if (style === 'lance' || style === 'arrow' || style === 'bolt') core.scale.set(1, 1, 3);
  const glow = glowSprite(color, size * 9);
  root.add(core, glow);
  root.position.y = 1.0;
  return { root, parts: { core, glow } };
}

export function buildAoe(style, radius, hostile, themeColor) {
  const root = new THREE.Group();
  const color = hostile ? 0xef4444 : style === 'vortex' ? 0x9333ea : style === 'barrage' ? 0xfb923c : themeColor;
  const parts = {};
  if (style === 'ring') {
    const ring = new THREE.Mesh(geo('aoeRingWave', () => new THREE.RingGeometry(0.85, 1.0, 64)), basic(color, { transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    root.add(ring);
    parts.ring = ring;
  } else {
    const edge = new THREE.Mesh(geo('aoeEdge', () => new THREE.RingGeometry(0.94, 1.0, 64)), basic(color, { transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    edge.rotation.x = -Math.PI / 2;
    edge.position.y = 0.06;
    edge.scale.setScalar(radius);
    const fill = new THREE.Mesh(geo('aoeFill', () => new THREE.CircleGeometry(1, 48)), basic(color, { transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.05;
    fill.scale.setScalar(style === 'telegraph' ? 0.01 : radius);
    root.add(edge, fill);
    parts.edge = edge; parts.fill = fill;
    if (style === 'vortex') {
      const swirl = new THREE.Mesh(geo('swirl', () => new THREE.TorusKnotGeometry(0.5, 0.06, 64, 6, 2, 5)), basic(0xd8b4fe, { transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending }));
      swirl.position.y = 0.6;
      swirl.rotation.x = Math.PI / 2;
      swirl.scale.setScalar(radius * 0.6);
      const glow = glowSprite(0x9333ea, radius * 2.2);
      glow.position.y = 0.6;
      root.add(swirl, glow);
      parts.swirl = swirl;
    }
  }
  return { root, parts };
}
