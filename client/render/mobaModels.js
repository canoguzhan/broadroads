/* Models for champions, minions, structures, wards, epic monsters, MOBA
   projectiles and ability areas. */
import * as THREE from 'three';
import { geo, std, basic, mesh, glowSprite, buildHero, buildMonster } from './models.js';
import { TEAM_HEX } from './rift.js';

const CHAMP_MODEL = {
  garrok: { cls: 'paladin', scale: 1.35 }, brakka: { cls: 'paladin', scale: 1.3, horns: true }, thorne: { cls: 'paladin', scale: 1.15 },
  rook: { cls: 'paladin', scale: 1.15 }, kaelen: { cls: 'paladin', scale: 1.0, hood: true }, lyra: { cls: 'arcanist', scale: 1.0 },
  mira: { cls: 'arcanist', scale: 1.0, halo: true }, zarak: { cls: 'arcanist', scale: 0.95 }, vex: { cls: 'gunner', scale: 1.0 }, nyra: { cls: 'gunner', scale: 1.0 },
};

export function buildChampion(id, info, team) {
  const m = CHAMP_MODEL[id] || { cls: 'paladin', scale: 1 };
  const colors = { body: info.color, trim: info.accent, cloth: TEAM_HEX[team] };
  const built = buildHero(m.cls, { primaryHex: info.accent }, {}, colors);
  const { body } = built.parts;
  body.scale.setScalar(1.15 * m.scale);
  if (m.horns) {
    for (const sx of [-1, 1]) {
      const horn = mesh(geo('mHorn', () => new THREE.ConeGeometry(0.07, 0.45, 6)), std(0xf5f0e1), 0.2 * sx, 1.65, 0.05);
      horn.rotation.z = -0.8 * sx;
      body.add(horn);
    }
  }
  if (m.hood) body.add(mesh(geo('mHood', () => new THREE.ConeGeometry(0.28, 0.5, 10)), std(0x111827), 0, 1.65, 0));
  if (m.halo) {
    const halo = mesh(geo('mHalo', () => new THREE.TorusGeometry(0.25, 0.03, 6, 20)), basic(info.accent), 0, 1.85, 0);
    halo.rotation.x = Math.PI / 2;
    body.add(halo);
  }
  return built;
}

export function buildMinion(type, team) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const tc = TEAM_HEX[team];
  const parts = { body };
  if (type === 'siege') {
    body.add(mesh(geo('cart', () => new THREE.BoxGeometry(0.9, 0.5, 1.1)), std(0x6b4423), 0, 0.45, 0));
    const barrel = mesh(geo('barrel', () => new THREE.CylinderGeometry(0.16, 0.2, 1.0, 10)), std(0x3f3f46, { metalness: 0.7 }), 0, 0.85, 0.25);
    barrel.rotation.x = Math.PI / 2 - 0.3;
    body.add(barrel);
    for (const [x, z] of [[-0.5, 0.35], [0.5, 0.35], [-0.5, -0.35], [0.5, -0.35]]) {
      const w = mesh(geo('wheel', () => new THREE.CylinderGeometry(0.22, 0.22, 0.1, 10)), std(0x292524), x, 0.22, z);
      w.rotation.z = Math.PI / 2;
      body.add(w);
    }
    body.add(mesh(geo('flagS', () => new THREE.BoxGeometry(0.05, 0.4, 0.3)), std(tc, { emissive: tc, emissiveIntensity: 0.3 }), 0.4, 1.0, -0.4));
  } else if (type === 'caster') {
    body.add(mesh(geo('robeC', () => new THREE.ConeGeometry(0.32, 0.8, 8)), std(tc), 0, 0.4, 0));
    body.add(mesh(geo('headC', () => new THREE.SphereGeometry(0.15, 8, 6)), std(0xd6b48c), 0, 0.92, 0));
    const orb = mesh(geo('orbC', () => new THREE.SphereGeometry(0.09, 8, 6)), basic(tc), 0.25, 0.7, 0.2);
    const og = glowSprite(tc, 0.6);
    og.position.copy(orb.position);
    body.add(orb, og);
  } else {
    const big = type === 'super';
    const s = big ? 1.6 : 1;
    body.add(mesh(geo('torsoM', () => new THREE.CylinderGeometry(0.2, 0.25, 0.5, 8)), std(tc, { metalness: 0.4 }), 0, 0.5, 0));
    body.add(mesh(geo('headM', () => new THREE.SphereGeometry(0.16, 8, 6)), std(0xb8c0cc, { metalness: 0.6 }), 0, 0.92, 0));
    body.add(mesh(geo('legsM', () => new THREE.CylinderGeometry(0.2, 0.15, 0.3, 8)), std(0x3f3f46), 0, 0.15, 0));
    const sword = mesh(geo('swordM', () => new THREE.BoxGeometry(0.05, 0.5, 0.03)), std(0xe5e7eb, { metalness: 0.8 }), 0.28, 0.6, 0.15);
    const shield = mesh(geo('shieldM', () => new THREE.CylinderGeometry(0.2, 0.2, 0.04, 10)), std(tc), -0.28, 0.55, 0.1);
    shield.rotation.z = Math.PI / 2;
    body.add(sword, shield);
    parts.arm = sword;
    body.scale.setScalar(s);
  }
  return { root, parts };
}

export function buildTower(team, tier) {
  const root = new THREE.Group();
  const tc = TEAM_HEX[team];
  const s = tier === 4 ? 0.85 : 1;
  const stone = std(0x9a948a, { roughness: 0.85 });
  root.add(mesh(geo('tBase', () => new THREE.CylinderGeometry(1.15, 1.35, 0.6, 10)), stone, 0, 0.3, 0));
  root.add(mesh(geo('tCol', () => new THREE.CylinderGeometry(0.65, 0.95, 3.4, 10)), stone, 0, 2.2, 0));
  root.add(mesh(geo('tCap', () => new THREE.CylinderGeometry(1.0, 0.7, 0.5, 10)), std(0x6b665e), 0, 4.1, 0));
  const ring = mesh(geo('tRing', () => new THREE.TorusGeometry(0.8, 0.08, 6, 24)), std(tc, { emissive: tc, emissiveIntensity: 0.6 }), 0, 3.2, 0);
  ring.rotation.x = Math.PI / 2;
  root.add(ring);
  const crystal = mesh(geo('tCrystal', () => new THREE.OctahedronGeometry(0.5, 0)), std(tc, { emissive: tc, emissiveIntensity: 0.9, flatShading: true }), 0, 5.0, 0);
  root.add(crystal);
  const glow = glowSprite(tc, 3.2);
  glow.position.y = 5.0;
  root.add(glow);
  root.scale.setScalar(s);
  return { root, parts: { crystal, glow } };
}

export function buildInhibitor(team) {
  const root = new THREE.Group();
  const tc = TEAM_HEX[team];
  root.add(mesh(geo('iBase', () => new THREE.CylinderGeometry(1.4, 1.6, 0.5, 12)), std(0x8a8478), 0, 0.25, 0));
  const crystal = mesh(geo('iCrystal', () => new THREE.IcosahedronGeometry(0.75, 0)), std(tc, { emissive: tc, emissiveIntensity: 0.8, flatShading: true, transparent: true, opacity: 0.9 }), 0, 1.7, 0);
  const ring = mesh(geo('iRing', () => new THREE.TorusGeometry(1.1, 0.07, 6, 28)), basic(tc), 0, 1.7, 0);
  const glow = glowSprite(tc, 4);
  glow.position.y = 1.7;
  root.add(crystal, ring, glow);
  return { root, parts: { crystal, ring, glow } };
}

export function buildNexus(team) {
  const root = new THREE.Group();
  const tc = TEAM_HEX[team];
  root.add(mesh(geo('nBase', () => new THREE.CylinderGeometry(2.6, 3.0, 0.8, 12)), std(0x8a8478), 0, 0.4, 0));
  root.add(mesh(geo('nStep', () => new THREE.CylinderGeometry(1.9, 2.3, 0.6, 12)), std(0x6f6a61), 0, 1.0, 0));
  const crystal = mesh(geo('nCrystal', () => new THREE.OctahedronGeometry(1.4, 0)), std(tc, { emissive: tc, emissiveIntensity: 0.9, flatShading: true }), 0, 3.0, 0);
  crystal.scale.y = 1.6;
  const shards = new THREE.Group();
  shards.position.y = 3;
  for (let i = 0; i < 5; i++) {
    const sh = mesh(geo('nShard', () => new THREE.OctahedronGeometry(0.3, 0)), std(tc, { emissive: tc, emissiveIntensity: 0.9 }), Math.cos(i * 1.26) * 2.3, Math.sin(i * 2) * 0.4, Math.sin(i * 1.26) * 2.3);
    sh.scale.y = 2;
    shards.add(sh);
  }
  const glow = glowSprite(tc, 8);
  glow.position.y = 3;
  root.add(crystal, shards, glow);
  return { root, parts: { crystal, shards, glow } };
}

export function buildWard(team) {
  const root = new THREE.Group();
  const tc = TEAM_HEX[team];
  root.add(mesh(geo('wStick', () => new THREE.CylinderGeometry(0.06, 0.1, 0.9, 6)), std(0x5b3a1f), 0, 0.45, 0));
  const eye = mesh(geo('wEye', () => new THREE.SphereGeometry(0.16, 10, 8)), basic(tc), 0, 1.0, 0);
  const glow = glowSprite(tc, 1.4);
  glow.position.y = 1.0;
  root.add(eye, glow);
  return { root, parts: { eye, glow } };
}

export function buildTrap() {
  const root = new THREE.Group();
  const jaw = mesh(geo('trap', () => new THREE.TorusGeometry(0.35, 0.06, 6, 16)), std(0x52525b, { metalness: 0.8 }), 0, 0.08, 0);
  jaw.rotation.x = Math.PI / 2;
  root.add(jaw);
  return { root, parts: {} };
}

function buildDragon() {
  const g = new THREE.Group();
  const scale = std(0xc2410c, { flatShading: true, roughness: 0.7 });
  const body = mesh(geo('dBody', () => new THREE.SphereGeometry(1.2, 12, 10)), scale, 0, 1.6, 0);
  body.scale.set(1, 0.8, 1.6);
  const neck = mesh(geo('dNeck', () => new THREE.CylinderGeometry(0.35, 0.5, 1.6, 8)), scale, 0, 2.4, 1.6);
  neck.rotation.x = 0.8;
  const head = mesh(geo('dHead', () => new THREE.BoxGeometry(0.7, 0.55, 1.1)), scale, 0, 3.0, 2.4);
  const eye1 = mesh(geo('dEye', () => new THREE.SphereGeometry(0.08, 6, 4)), basic(0xfde047), -0.22, 3.15, 2.85);
  const eye2 = eye1.clone(); eye2.position.x = 0.22;
  const tail = mesh(geo('dTail', () => new THREE.ConeGeometry(0.4, 2.4, 8)), scale, 0, 1.4, -2.3);
  tail.rotation.x = -Math.PI / 2;
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0); wingShape.lineTo(2.6, 0.8); wingShape.lineTo(2.2, -0.4); wingShape.lineTo(1.4, -0.1); wingShape.lineTo(0.8, -0.6); wingShape.lineTo(0, -0.3);
  const wingGeo = geo('dWing', () => new THREE.ShapeGeometry(wingShape));
  const wl = new THREE.Mesh(wingGeo, std(0x7c2d12, { side: THREE.DoubleSide }));
  const wr = wl.clone(); wr.scale.x = -1;
  wl.position.set(0.6, 2.1, 0); wr.position.set(-0.6, 2.1, 0);
  wl.rotation.x = wr.rotation.x = -Math.PI / 2;
  const glow = glowSprite(0xfb923c, 4);
  glow.position.y = 2;
  g.add(body, neck, head, eye1, eye2, tail, wl, wr, glow);
  return { g, wings: [wl, wr], bob: body };
}

const MONSTER_MODEL = { golem: 'golem', brute: 'brute', wolf: 'wolf', bat: 'bat', slime: 'slime', overlord: 'overlord' };

export function buildMobaMonster(model, small, epic) {
  if (model === 'dragon') {
    const built = buildDragon();
    const root = new THREE.Group();
    root.add(built.g);
    return { root, parts: built };
  }
  const built = buildMonster(MONSTER_MODEL[model] || 'slime', false);
  if (small) built.root.scale.setScalar(0.65);
  if (epic) built.root.scale.setScalar(1.2);
  return built;
}

const PROJ = {
  tower: [0, 0.35], minion: [0, 0.12], cannon: [0x27272a, 0.2], rock: [0x8d7b68, 0.3], light: [0xfef08a, 0.25], shuriken: [0xe5e7eb, 0.2],
  arrow: [0x93c5fd, 0.14], crystal: [0x67e8f9, 0.5], net: [0xd6d3d1, 0.3], fire: [0xf97316, 0.28], axe: [0x84cc16, 0.3], ace: [0xfbbf24, 0.22], orb: [0xa855f7, 0.25],
};

export function buildMobaProjectile(style, team, champColor) {
  const root = new THREE.Group();
  let [color, size] = PROJ[style] || [champColor || 0xffffff, 0.15];
  if (style.startsWith('aa:')) { color = champColor || 0xffffff; size = 0.14; }
  if (!color) color = TEAM_HEX[team] || 0xffffff;
  const core = new THREE.Mesh(geo(`p${size}`, () => new THREE.SphereGeometry(size, 10, 8)), basic(0xffffff));
  if (style === 'arrow' || style === 'crystal' || style === 'ace' || style.startsWith('aa:')) core.scale.set(1, 1, 2.5);
  if (style === 'shuriken' || style === 'axe') core.scale.set(1.6, 0.3, 1.6);
  const glow = glowSprite(color, size * 9);
  root.add(core, glow);
  root.position.y = 1.1;
  return { root, parts: { core, glow }, spin: style === 'shuriken' || style === 'axe' };
}

const AREA_COLORS = { telegraph: 0xef4444, lucent: 0xfef9c3, star: 0x7dd3fc, equinox: 0xa78bfa, inferno: 0xf97316, whirl: 0x84cc16, decimate: 0xdc2626, wrath: 0x22c55e };

export function buildMobaArea(style, radius, len, width, hostile) {
  const root = new THREE.Group();
  const parts = {};
  if (style === 'none') return { root, parts };
  if (style.startsWith('beam:')) {
    const color = style === 'beam:spark' ? 0xfef08a : 0xfbbf24;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, len), basic(color, { transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0.08;
    const holder = new THREE.Group();
    holder.add(plane);
    root.add(holder);
    parts.beam = holder; parts.plane = plane;
    return { root, parts };
  }
  const color = style === 'telegraph' ? 0xef4444 : AREA_COLORS[style] || (hostile ? 0xef4444 : 0x60a5fa);
  const edge = new THREE.Mesh(geo('aEdge', () => new THREE.RingGeometry(0.93, 1.0, 64)), basic(color, { transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
  edge.rotation.x = -Math.PI / 2;
  edge.position.y = 0.09;
  edge.scale.setScalar(radius);
  const fill = new THREE.Mesh(geo('aFill', () => new THREE.CircleGeometry(1, 48)), basic(color, { transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.08;
  fill.scale.setScalar(style === 'telegraph' || style === 'decimate' || style === 'wrath' || style === 'star' ? 0.01 : radius);
  root.add(edge, fill);
  parts.edge = edge; parts.fill = fill;
  if (style === 'inferno' || style === 'lucent' || style === 'equinox') {
    const glow = glowSprite(color, radius * 2);
    glow.position.y = 0.5;
    root.add(glow);
    parts.glow = glow;
  }
  return { root, parts };
}
