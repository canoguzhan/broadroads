/* Champion roster. Each ability's cast(m, h, rank, t) uses the match API:
   m.damage, m.heal, m.shield, m.cc, m.addBuff, m.enemiesNear, m.alliesNear,
   m.skillshot, m.homing, m.area, m.dash, m.blink, m.emit.
   t = { x, y, unit } (point already clamped to range). */

const R = (arr, rank) => arr[Math.max(0, Math.min(arr.length - 1, rank - 1))];
export const bonusAd = h => h.stats.ad - h.baseStats.ad;
const dmg = (h, base, rank, r = {}) =>
  R(base, rank) + (r.ad || 0) * h.stats.ad + (r.bad || 0) * bonusAd(h) + (r.ap || 0) * h.stats.ap + (r.armor || 0) * h.stats.armor + (r.hp || 0) * h.stats.maxHp;
const ang = (h, t) => Math.atan2(t.y - h.y, t.x - h.x);

export const CHAMPIONS = {
  garrok: {
    id: 'garrok', name: 'Garrok', title: 'the Living Mountain', role: 'Tank', roles: ['top', 'support'], icon: '🪨', color: 0x8d7b68, accent: 0xf59e0b,
    ranged: false, range: 1.7, projSpeed: 0,
    base: { hp: 650, hpG: 105, mp: 280, mpG: 50, ad: 62, adG: 4, armor: 37, armorG: 4.5, mr: 32, mrG: 2, as: 0.66, asG: 3, ms: 5.0, hpRegen: 1.8, mpRegen: 1.4 },
    passive: { name: 'Granite Shield', desc: 'Gains a shield worth 10% max health after not taking damage for 9 seconds.' },
    abilities: {
      q: { name: 'Seismic Shard', icon: '🪨', desc: 'Hurls a shard at an enemy: magic damage and steals 25% movement speed for 2.5s.', cd: [8, 7.5, 7, 6.5, 6], mana: [60, 65, 70, 75, 80], range: 7, target: 'enemy',
        cast(m, h, rank, t) { m.homing(h, t.unit, { speed: 18, style: 'rock', onHit: u => { m.damage(h, u, dmg(h, [70, 115, 160, 205, 250], rank, { ap: 0.6 }), 'magic', { ability: true }); m.cc(u, 'slow', 2.5, 0.25, h); m.addBuff(h, { id: 'shardHaste', dur: 2.5, stats: { msPct: 25 } }); } }); } },
      w: { name: 'Thunderclap', icon: '⚡', desc: 'For 5s, attacks deal bonus magic damage to enemies around the target and grant 25 armor.', cd: [12, 11, 10, 9, 8], mana: [30], range: 0, target: 'self',
        cast(m, h, rank) { m.addBuff(h, { id: 'thunderclap', dur: 5, stats: { armor: 25 }, onAttack: (u) => { for (const e of m.enemiesNear(h.team, u.x, u.y, 2.5)) m.damage(h, e, dmg(h, [20, 35, 50, 65, 80], rank, { ap: 0.3, armor: 0.1 }), 'magic'); } }); m.emit({ e: 'buff', id: h.id, c: 'thunder' }); } },
      e: { name: 'Ground Slam', icon: '💥', desc: 'Slams the ground: magic damage around Garrok scaling with armor, slowing attack speed by 40%.', cd: [7, 6.5, 6, 5.5, 5], mana: [50, 55, 60, 65, 70], range: 3.5, target: 'self',
        cast(m, h, rank) { for (const e of m.enemiesNear(h.team, h.x, h.y, 3.5)) { m.damage(h, e, dmg(h, [60, 95, 130, 165, 200], rank, { ap: 0.4, armor: 0.3 }), 'magic', { ability: true }); m.addBuff(e, { id: 'slamSlow', dur: 3, stats: { as: -40 } }); } m.emit({ e: 'nova', x: h.x, y: h.y, r: 3.5, c: 'earth' }); } },
      r: { name: 'Unstoppable Force', icon: '🌋', desc: 'Charges to a location and knocks up all enemies there for 1.25s.', cd: [110, 95, 80], mana: [100], range: 9, target: 'point',
        cast(m, h, rank, t) { m.dash(h, t.x, t.y, 24, { unstoppable: true, onEnd: () => { for (const e of m.enemiesNear(h.team, h.x, h.y, 3.5)) { m.damage(h, e, dmg(h, [200, 300, 400], rank, { ap: 0.8 }), 'magic', { ability: true }); m.cc(e, 'knockup', 1.25, 0, h); } m.emit({ e: 'shock', x: h.x, y: h.y, r: 3.5, c: 'earth' }); } }); } },
    },
    bot: { build: ['greaves', 'sunfire', 'thornmail', 'visage', 'titan', 'frostorb'], q: 'poke', w: 'buff', e: 'melee', r: 'engage' },
  },

  lyra: {
    id: 'lyra', name: 'Lyra', title: 'the Lady of Luminosity', role: 'Mage', roles: ['mid', 'support'], icon: '✨', color: 0xf8fafc, accent: 0xfacc15,
    ranged: true, range: 5.5, projSpeed: 18,
    base: { hp: 520, hpG: 88, mp: 480, mpG: 23, ad: 54, adG: 3.3, armor: 21, armorG: 4.2, mr: 30, mrG: 1.3, as: 0.67, asG: 3, ms: 5.0, hpRegen: 1.1, mpRegen: 1.6 },
    passive: { name: 'Illumination', desc: 'Abilities mark enemies; Lyra\'s next attack on a marked enemy deals bonus magic damage.' },
    onAbilityHit(m, h, u) { m.addBuff(u, { id: 'illum', dur: 6, owner: h.id }); },
    onAttackHit(m, h, u) { if (m.hasBuff(u, 'illum')) { m.removeBuff(u, 'illum'); m.damage(h, u, 20 + 10 * h.level + 0.2 * h.stats.ap, 'magic'); m.emit({ e: 'flash', x: u.x, y: u.y, c: 'light' }); } },
    abilities: {
      q: { name: 'Light Binding', icon: '🔗', desc: 'A beam that roots up to two enemies for 1.75s.', cd: [11, 10.5, 10, 9.5, 9], mana: [50, 55, 60, 65, 70], range: 11, target: 'direction',
        cast(m, h, rank, t) { let hits = 0; m.skillshot(h, { angle: ang(h, t), speed: 22, range: 11, width: 0.75, style: 'light', pierce: true, onHit: (u, s) => { if (hits >= 2) { s.done = true; return; } hits++; m.damage(h, u, dmg(h, [80, 125, 170, 215, 260], rank, { ap: 0.6 }), 'magic', { ability: true }); m.cc(u, 'root', hits === 1 ? 1.75 : 1, 0, h); } }); } },
      w: { name: 'Prism Barrier', icon: '🛡️', desc: 'Shields Lyra and nearby allies.', cd: [14, 13, 12, 11, 10], mana: [60], range: 6, target: 'self',
        cast(m, h, rank) { for (const a of m.alliesNear(h.team, h.x, h.y, 6, { heroes: true })) m.shield(a, dmg(h, [45, 65, 85, 105, 125], rank, { ap: 0.35 }), 2.5); m.emit({ e: 'healfx', x: h.x, y: h.y, r: 6, c: 'light' }); } },
      e: { name: 'Lucent Singularity', icon: '🌟', desc: 'Creates a slowing zone that detonates after 1.5s for magic damage.', cd: [10, 9.5, 9, 8.5, 8], mana: [70, 80, 90, 100, 110], range: 10, target: 'point',
        cast(m, h, rank, t) { m.area(h, { x: t.x, y: t.y, radius: 3, dur: 1.5, style: 'lucent', tickEvery: 0.25, onTick: a => { for (const e of m.enemiesNear(h.team, a.x, a.y, a.radius)) m.cc(e, 'slow', 0.4, R([0.25, 0.3, 0.35, 0.4, 0.45], rank), h); }, onEnd: a => { for (const e of m.enemiesNear(h.team, a.x, a.y, a.radius)) m.damage(h, e, dmg(h, [70, 115, 160, 205, 250], rank, { ap: 0.7 }), 'magic', { ability: true }); m.emit({ e: 'boom', x: a.x, y: a.y, r: a.radius, c: 'light' }); } }); } },
      r: { name: 'Final Spark', icon: '🌈', desc: 'After 0.75s, fires a massive beam of light across the map.', cd: [80, 60, 40], mana: [100], range: 30, target: 'direction',
        cast(m, h, rank, t) { m.beam(h, { angle: ang(h, t), length: 30, width: 1.5, delay: 0.75, style: 'spark', onHit: u => m.damage(h, u, dmg(h, [300, 400, 500], rank, { ap: 1.0 }), 'magic', { ability: true }) }); } },
    },
    bot: { build: ['sorcboots', 'codex', 'archmage', 'voidscepter', 'frostorb', 'visage'], q: 'cc', w: 'shield', e: 'poke', r: 'poke' },
  },

  kaelen: {
    id: 'kaelen', name: 'Kaelen', title: 'the Shadow Blade', role: 'Assassin', roles: ['mid', 'jungle'], icon: '🗡️', color: 0x312e81, accent: 0xef4444,
    ranged: false, range: 1.7, projSpeed: 0,
    base: { hp: 580, hpG: 95, mp: 300, mpG: 40, ad: 64, adG: 3.6, armor: 32, armorG: 4.7, mr: 32, mrG: 2, as: 0.65, asG: 3.3, ms: 5.15, hpRegen: 1.6, mpRegen: 1.6 },
    passive: { name: 'Contempt for the Weak', desc: 'Attacks against enemies below 50% health deal bonus magic damage equal to 6% of their max health.' },
    onAttackHit(m, h, u) { if (u.hp < u.maxHp * 0.5 && u.kind === 'hero') m.damage(h, u, u.maxHp * 0.06, 'magic'); },
    abilities: {
      q: { name: 'Razor Shuriken', icon: '✴️', desc: 'Throws a shuriken that pierces all enemies in a line.', cd: [6, 5.5, 5, 4.5, 4], mana: [75, 70, 65, 60, 55], range: 9, target: 'direction',
        cast(m, h, rank, t) { m.skillshot(h, { angle: ang(h, t), speed: 24, range: 9, width: 0.6, pierce: true, style: 'shuriken', onHit: u => m.damage(h, u, dmg(h, [80, 115, 150, 185, 220], rank, { bad: 1.0 }), 'physical', { ability: true }) }); } },
      w: { name: 'Living Shadow', icon: '👤', desc: 'Dashes swiftly to a nearby location.', cd: [16, 14.5, 13, 11.5, 10], mana: [40], range: 6, target: 'point',
        cast(m, h, rank, t) { m.dash(h, t.x, t.y, 30, {}); m.addBuff(h, { id: 'shadowHaste', dur: 2, stats: { msPct: 20 } }); } },
      e: { name: 'Shadow Slash', icon: '🌀', desc: 'Slashes all enemies around Kaelen, slowing them.', cd: [5, 4.5, 4, 3.5, 3], mana: [50], range: 3, target: 'self',
        cast(m, h, rank) { for (const e of m.enemiesNear(h.team, h.x, h.y, 3)) { m.damage(h, e, dmg(h, [70, 90, 110, 130, 150], rank, { bad: 0.8 }), 'physical', { ability: true }); m.cc(e, 'slow', 1.5, 0.25, h); } m.emit({ e: 'nova', x: h.x, y: h.y, r: 3, c: 'shadow' }); } },
      r: { name: 'Death Mark', icon: '☠️', desc: 'Blinks behind an enemy champion and marks them. After 2s the mark detonates for damage increased by their missing health.', cd: [100, 80, 60], mana: [0], range: 6, target: 'enemyHero',
        cast(m, h, rank, t) { const u = t.unit; const a = Math.atan2(u.y - h.y, u.x - h.x); m.blink(h, u.x + Math.cos(a) * 1.2, u.y + Math.sin(a) * 1.2); m.addBuff(h, { id: 'untargetable', dur: 0.6, flags: { untargetable: true } }); m.addBuff(u, { id: 'deathMark', dur: 2, owner: h.id, onExpire: () => { if (!u.dead) { m.damage(h, u, dmg(h, [150, 250, 350], rank, { bad: 1.0 }) + (u.maxHp - u.hp) * 0.3, 'physical', { ability: true }); m.emit({ e: 'boom', x: u.x, y: u.y, r: 1.5, c: 'shadow' }); } } }); } },
    },
    bot: { build: ['ionian', 'cleaver', 'executioner', 'bloodthirster', 'infinity', 'visage'], q: 'poke', w: 'engage', e: 'melee', r: 'execute' },
  },

  vex: {
    id: 'vex', name: 'Vex', title: 'the Frost Archer', role: 'Marksman', roles: ['bot'], icon: '🏹', color: 0x60a5fa, accent: 0xe0f2fe,
    ranged: true, range: 6, projSpeed: 22,
    base: { hp: 560, hpG: 92, mp: 300, mpG: 33, ad: 59, adG: 3, armor: 26, armorG: 4.2, mr: 30, mrG: 1.3, as: 0.66, asG: 3.3, ms: 5.0, hpRegen: 1.3, mpRegen: 1.4 },
    passive: { name: 'Frost Shot', desc: 'Attacks slow the target by 20% for 1s.' },
    onAttackHit(m, h, u) { m.cc(u, 'slow', 1, 0.2, h); },
    abilities: {
      q: { name: 'Ranger\'s Focus', icon: '🎯', desc: 'Greatly increases attack speed for 4s.', cd: [12, 11, 10, 9, 8], mana: [30], range: 0, target: 'self',
        cast(m, h, rank) { m.addBuff(h, { id: 'focus', dur: 4, stats: { as: R([25, 35, 45, 55, 65], rank) } }); m.emit({ e: 'buff', id: h.id, c: 'frost' }); } },
      w: { name: 'Volley', icon: '🌨️', desc: 'Fires a cone of arrows that damage and slow.', cd: [14, 11.5, 9, 6.5, 4], mana: [70], range: 9, target: 'direction',
        cast(m, h, rank, t) { const hit = new Set(); const a0 = ang(h, t); for (let i = -3; i <= 3; i++) m.skillshot(h, { angle: a0 + i * 0.13, speed: 20, range: 9, width: 0.45, style: 'arrow', onHit: u => { if (hit.has(u.id)) return; hit.add(u.id); m.damage(h, u, dmg(h, [20, 35, 50, 65, 80], rank, { ad: 1.0 }), 'physical', { ability: true }); m.cc(u, 'slow', 2, 0.4, h); } }); } },
      e: { name: 'Tumble', icon: '💨', desc: 'Tumbles a short distance; the next attack deals bonus damage.', cd: [6, 5.5, 5, 4.5, 4], mana: [30], range: 3.5, target: 'point',
        cast(m, h, rank, t) { m.dash(h, t.x, t.y, 22, {}); m.addBuff(h, { id: 'tumble', dur: 3.5, consumeOnAttack: true, bonusOnHit: { amount: dmg(h, [20, 30, 40, 50, 60], rank, { ad: 0.5 }), type: 'physical' } }); } },
      r: { name: 'Crystal Arrow', icon: '❄️', desc: 'Fires a huge arrow across the map that stuns the first champion hit — longer the further it flew.', cd: [100, 85, 70], mana: [100], range: 45, target: 'direction',
        cast(m, h, rank, t) { m.skillshot(h, { angle: ang(h, t), speed: 18, range: 45, width: 1.1, heroesOnly: true, style: 'crystal', onHit: (u, s) => { s.done = true; const flown = Math.min(1, s.traveled / 25); m.damage(h, u, dmg(h, [200, 400, 600], rank, { ap: 1.0 }), 'magic', { ability: true }); m.cc(u, 'stun', 1.2 + 2.3 * flown, 0, h); for (const e of m.enemiesNear(h.team, u.x, u.y, 3)) if (e !== u) { m.damage(h, e, dmg(h, [100, 200, 300], rank, { ap: 0.5 }), 'magic'); m.cc(e, 'slow', 3, 0.5, h); } m.emit({ e: 'boom', x: u.x, y: u.y, r: 3, c: 'frost' }); } }); } },
    },
    bot: { build: ['berserker', 'stormbow', 'infinity', 'bloodthirster', 'executioner', 'visage'], q: 'buff', w: 'poke', e: 'escape', r: 'cc' },
  },

  thorne: {
    id: 'thorne', name: 'Thorne', title: 'the Hand of War', role: 'Fighter', roles: ['top', 'jungle'], icon: '🪓', color: 0x7f1d1d, accent: 0xdc2626,
    ranged: false, range: 1.8, projSpeed: 0,
    base: { hp: 650, hpG: 104, mp: 260, mpG: 38, ad: 64, adG: 5, armor: 36, armorG: 5.2, mr: 32, mrG: 2, as: 0.63, asG: 1, ms: 5.05, hpRegen: 2, mpRegen: 1.3 },
    passive: { name: 'Hemorrhage', desc: 'Attacks and abilities make enemies bleed for physical damage over 5s, stacking up to 5 times.' },
    onAttackHit(m, h, u) { thorneBleed(m, h, u); },
    onAbilityHit(m, h, u) { thorneBleed(m, h, u); },
    abilities: {
      q: { name: 'Decimate', icon: '🪓', desc: 'After a short windup, swings a huge axe around himself. Heals for each champion hit.', cd: [9, 8, 7, 6, 5], mana: [30], range: 4, target: 'self',
        cast(m, h, rank) { m.area(h, { x: h.x, y: h.y, follow: h, radius: 4, dur: 0.6, style: 'decimate', onEnd: a => { let champs = 0; for (const e of m.enemiesNear(h.team, h.x, h.y, 4)) { m.damage(h, e, dmg(h, [40, 75, 110, 145, 180], rank, { ad: 1.0 }), 'physical', { ability: true }); if (e.kind === 'hero') champs++; } if (champs) m.heal(h, h, (h.maxHp - h.hp) * 0.12 * Math.min(3, champs)); m.emit({ e: 'shock', x: h.x, y: h.y, r: 4, c: 'blood' }); } }); } },
      w: { name: 'Crippling Strike', icon: '🦴', desc: 'Next attack deals 50% more damage and slows the target by 60%.', cd: [7, 6.5, 6, 5.5, 5], mana: [30], range: 0, target: 'self',
        cast(m, h, rank) { m.resetAttack(h); m.addBuff(h, { id: 'cripple', dur: 4, consumeOnAttack: true, bonusOnHit: { amount: h.stats.ad * 0.5, type: 'physical', slow: 0.6 } }); } },
      e: { name: 'Apprehend', icon: '🪝', desc: 'Pulls enemies in a cone toward Thorne and slows them.', cd: [24, 21, 18, 15, 12], mana: [45], range: 5, target: 'direction',
        cast(m, h, rank, t) { const a = ang(h, t); for (const e of m.enemiesInCone(h.team, h.x, h.y, a, 5, 0.5)) { m.cc(e, 'pull', 0.25, 2.5, h); m.cc(e, 'slow', 1, 0.4, h); } m.emit({ e: 'cone', x: h.x, y: h.y, a, r: 5, c: 'blood' }); } },
      r: { name: 'Guillotine', icon: '⚔️', desc: 'Leaps at an enemy champion dealing true damage, increased per bleed stack. Resets on kill.', cd: [120, 100, 80], mana: [100], range: 4.5, target: 'enemyHero',
        cast(m, h, rank, t) { const u = t.unit; const stacks = (m.getBuff(u, 'bleed')?.stacks) || 0; m.blink(h, u.x - Math.cos(ang(h, u)) * 1.2, u.y - Math.sin(ang(h, u)) * 1.2); m.damage(h, u, dmg(h, [125, 250, 375], rank, { bad: 0.75 }) * (1 + 0.2 * stacks), 'true', { ability: true }); m.emit({ e: 'boom', x: u.x, y: u.y, r: 1.5, c: 'blood' }); if (u.dead) h.cd.r = 0; } },
    },
    bot: { build: ['greaves', 'cleaver', 'sunfire', 'visage', 'thornmail', 'titan'], q: 'melee', w: 'melee', e: 'engage', r: 'execute' },
  },

  mira: {
    id: 'mira', name: 'Mira', title: 'the Starchild', role: 'Support', roles: ['support', 'mid'], icon: '🌙', color: 0x7dd3fc, accent: 0xc4b5fd,
    ranged: true, range: 5.5, projSpeed: 16,
    base: { hp: 540, hpG: 90, mp: 425, mpG: 40, ad: 50, adG: 3, armor: 23, armorG: 4, mr: 30, mrG: 1.3, as: 0.63, asG: 2.1, ms: 5.05, hpRegen: 1.3, mpRegen: 2.2 },
    passive: { name: 'Salvation', desc: 'Moves 30% faster while an allied champion nearby is below 40% health.' },
    tick(m, h) { const near = m.alliesNear(h.team, h.x, h.y, 9, { heroes: true }).some(a => a !== h && a.hp < a.maxHp * 0.4); if (near && !m.hasBuff(h, 'salvation')) m.addBuff(h, { id: 'salvation', dur: 0.5, stats: { msPct: 30 } }); },
    abilities: {
      q: { name: 'Starcall', icon: '🌠', desc: 'Calls down a star: magic damage and slow. Heals Mira for each champion hit.', cd: [6, 5.5, 5, 4.5, 4], mana: [45, 50, 55, 60, 65], range: 8.5, target: 'point',
        cast(m, h, rank, t) { m.area(h, { x: t.x, y: t.y, radius: 2.3, dur: 0.45, style: 'star', onEnd: a => { let champs = 0; for (const e of m.enemiesNear(h.team, a.x, a.y, a.radius)) { m.damage(h, e, dmg(h, [70, 110, 150, 190, 230], rank, { ap: 0.35 }), 'magic', { ability: true }); m.cc(e, 'slow', 2, 0.3, h); if (e.kind === 'hero') champs++; } if (champs) m.heal(h, h, 30 + 10 * rank + 0.2 * h.stats.ap); m.emit({ e: 'boom', x: a.x, y: a.y, r: a.radius, c: 'star' }); } }); } },
      w: { name: 'Astral Infusion', icon: '💖', desc: 'Heals another allied champion.', cd: [5, 4.5, 4, 3.5, 3], mana: [40, 45, 50, 55, 60], range: 6, target: 'ally',
        cast(m, h, rank, t) { m.heal(h, t.unit, dmg(h, [80, 110, 140, 170, 200], rank, { ap: 0.6 })); m.emit({ e: 'healfx', x: t.unit.x, y: t.unit.y, r: 1.5, c: 'star' }); } },
      e: { name: 'Equinox', icon: '🔇', desc: 'Creates a zone that silences enemies, then roots those still inside after 1.5s.', cd: [20, 19, 18, 17, 16], mana: [70], range: 9, target: 'point',
        cast(m, h, rank, t) { m.area(h, { x: t.x, y: t.y, radius: 3, dur: 1.5, style: 'equinox', tickEvery: 0.25, onStart: a => { for (const e of m.enemiesNear(h.team, a.x, a.y, a.radius)) m.damage(h, e, dmg(h, [70, 110, 150, 190, 230], rank, { ap: 0.4 }), 'magic', { ability: true }); }, onTick: a => { for (const e of m.enemiesNear(h.team, a.x, a.y, a.radius)) m.cc(e, 'silence', 0.35, 0, h); }, onEnd: a => { for (const e of m.enemiesNear(h.team, a.x, a.y, a.radius)) m.cc(e, 'root', 1.5, 0, h); } }); } },
      r: { name: 'Wish', icon: '🙏', desc: 'Heals every allied champion, wherever they are.', cd: [130, 115, 100], mana: [100], range: 0, target: 'self',
        cast(m, h, rank) { for (const a of m.heroes) if (a.team === h.team && !a.dead) { m.heal(h, a, dmg(h, [150, 250, 350], rank, { ap: 0.55 })); m.emit({ e: 'healfx', x: a.x, y: a.y, r: 2, c: 'star' }); } } },
    },
    bot: { build: ['ionian', 'codex', 'visage', 'frostorb', 'archmage', 'titan'], q: 'poke', w: 'heal', e: 'cc', r: 'heal' },
  },

  zarak: {
    id: 'zarak', name: 'Zarak', title: 'the Ember Child', role: 'Mage', roles: ['mid', 'support'], icon: '🔥', color: 0xb91c1c, accent: 0xfb923c,
    ranged: true, range: 5.5, projSpeed: 16,
    base: { hp: 530, hpG: 90, mp: 420, mpG: 30, ad: 50, adG: 2.6, armor: 19, armorG: 4.2, mr: 30, mrG: 1.3, as: 0.58, asG: 1.4, ms: 5.0, hpRegen: 1.1, mpRegen: 1.6 },
    passive: { name: 'Pyromania', desc: 'Every 4th ability stuns all enemies it hits for 1.25s.' },
    abilities: {
      q: { name: 'Disintegrate', icon: '☄️', desc: 'Hurls a fireball at an enemy. Refunds half the cost on kill.', cd: [4, 4, 4, 4, 4], mana: [60, 65, 70, 75, 80], range: 6, target: 'enemy',
        cast(m, h, rank, t) { const stun = zarakStun(h); m.homing(h, t.unit, { speed: 16, style: 'fire', onHit: u => { m.damage(h, u, dmg(h, [80, 115, 150, 185, 220], rank, { ap: 0.8 }), 'magic', { ability: true }); if (stun) m.cc(u, 'stun', 1.25, 0, h); if (u.dead) h.mp = Math.min(h.maxMp, h.mp + 35); } }); } },
      w: { name: 'Incinerate', icon: '🔥', desc: 'Blasts a cone of fire.', cd: [8, 8, 8, 8, 8], mana: [70, 80, 90, 100, 110], range: 6, target: 'direction',
        cast(m, h, rank, t) { const stun = zarakStun(h); const a = ang(h, t); for (const e of m.enemiesInCone(h.team, h.x, h.y, a, 6, 0.45)) { m.damage(h, e, dmg(h, [70, 115, 160, 205, 250], rank, { ap: 0.85 }), 'magic', { ability: true }); if (stun) m.cc(e, 'stun', 1.25, 0, h); } m.emit({ e: 'cone', x: h.x, y: h.y, a, r: 6, c: 'fire' }); } },
      e: { name: 'Molten Shield', icon: '🛡️', desc: 'Shields Zarak and burns attackers. Counts toward Pyromania.', cd: [14, 13, 12, 11, 10], mana: [40], range: 0, target: 'self',
        cast(m, h, rank) { zarakStun(h, true); m.shield(h, dmg(h, [40, 90, 140, 190, 240], rank, { ap: 0.4 }), 3); m.addBuff(h, { id: 'molten', dur: 3, stats: { msPct: 15 }, onDamaged: src => { if (src && src.kind !== 'tower') m.damage(h, src, 20 + 10 * rank + 0.2 * h.stats.ap, 'magic'); } }); } },
      r: { name: 'Summon Infernus', icon: '🌋', desc: 'Calls down a pillar of fire, then leaves a burning field for 5s.', cd: [120, 100, 80], mana: [100], range: 7, target: 'point',
        cast(m, h, rank, t) { const stun = zarakStun(h); for (const e of m.enemiesNear(h.team, t.x, t.y, 3)) { m.damage(h, e, dmg(h, [150, 275, 400], rank, { ap: 0.75 }), 'magic', { ability: true }); if (stun) m.cc(e, 'stun', 1.25, 0, h); } m.emit({ e: 'shock', x: t.x, y: t.y, r: 3, c: 'fire' }); m.area(h, { x: t.x, y: t.y, radius: 3.5, dur: 5, style: 'inferno', tickEvery: 0.5, onTick: a => { for (const e of m.enemiesNear(h.team, a.x, a.y, a.radius)) m.damage(h, e, dmg(h, [20, 30, 40], rank, { ap: 0.1 }), 'magic'); } }); } },
    },
    bot: { build: ['sorcboots', 'voidscepter', 'archmage', 'codex', 'frostorb', 'visage'], q: 'poke', w: 'poke', e: 'shield', r: 'engage' },
  },

  nyra: {
    id: 'nyra', name: 'Nyra', title: 'the Sheriff of the Sands', role: 'Marksman', roles: ['bot'], icon: '🎯', color: 0x7c2d12, accent: 0xfbbf24,
    ranged: true, range: 7, projSpeed: 26,
    base: { hp: 540, hpG: 91, mp: 315, mpG: 40, ad: 60, adG: 3.4, armor: 26, armorG: 4.2, mr: 30, mrG: 1.3, as: 0.62, asG: 4, ms: 5.0, hpRegen: 1.3, mpRegen: 1.4 },
    passive: { name: 'Headshot', desc: 'Every 6th attack deals 60% bonus damage. Attacks on trapped or netted enemies are always headshots.' },
    onAttackHit(m, h, u) { h.headshot = (h.headshot || 0) + 1; if (h.headshot >= 6 || m.hasBuff(u, 'netted')) { h.headshot = 0; m.damage(h, u, h.stats.ad * 0.6, 'physical'); m.emit({ e: 'flash', x: u.x, y: u.y, c: 'gold' }); } },
    abilities: {
      q: { name: 'Piercing Shot', icon: '🔫', desc: 'After 0.6s, fires a long-range shot through all enemies in a line.', cd: [10, 9, 8, 7, 6], mana: [50, 60, 70, 80, 90], range: 12, target: 'direction',
        cast(m, h, rank, t) { m.beam(h, { angle: ang(h, t), length: 12, width: 0.9, delay: 0.6, style: 'shot', onHit: u => m.damage(h, u, dmg(h, [60, 105, 150, 195, 240], rank, { ad: 1.4 }), 'physical', { ability: true }) }); } },
      w: { name: 'Yordle Trap', icon: '🪤', desc: 'Places a trap that roots the first enemy champion to step on it.', cd: [16, 14, 12, 10, 8], mana: [20], range: 8, target: 'point',
        cast(m, h, rank, t) { m.trap(h, { x: t.x, y: t.y, radius: 0.9, life: 30, max: 3, onTrigger: u => { m.cc(u, 'root', 1.5, 0, h); m.addBuff(u, { id: 'netted', dur: 1.5 }); m.damage(h, u, dmg(h, [30, 70, 110, 150, 190], rank, { ad: 0.4 }), 'physical', { ability: true }); } }); } },
      e: { name: 'Calibrum Net', icon: '🕸️', desc: 'Fires a net that slows the target and knocks Nyra backward.', cd: [16, 14, 12, 10, 8], mana: [70], range: 8, target: 'direction',
        cast(m, h, rank, t) { const a = ang(h, t); m.skillshot(h, { angle: a, speed: 26, range: 8, width: 0.7, style: 'net', onHit: (u, s) => { s.done = true; m.damage(h, u, dmg(h, [70, 110, 150, 190, 230], rank, { ap: 0.8 }), 'magic', { ability: true }); m.cc(u, 'slow', 1, 0.5, h); m.addBuff(u, { id: 'netted', dur: 1 }); } }); m.dash(h, h.x - Math.cos(a) * 4, h.y - Math.sin(a) * 4, 22, {}); } },
      r: { name: 'Ace in the Hole', icon: '💀', desc: 'After 1s, fires a guaranteed shot at a distant enemy champion.', cd: [90, 75, 60], mana: [100], range: 25, target: 'enemyHero',
        cast(m, h, rank, t) { const u = t.unit; m.reveal(u, 3); m.area(h, { x: h.x, y: h.y, radius: 0.1, dur: 1, style: 'none', onEnd: () => { if (!u.dead) m.homing(h, u, { speed: 34, style: 'ace', onHit: v => m.damage(h, v, dmg(h, [300, 525, 750], rank, { bad: 2.0 }), 'physical', { ability: true }) }); } }); m.emit({ e: 'aim', id: h.id, to: u.id }); } },
    },
    bot: { build: ['berserker', 'infinity', 'stormbow', 'executioner', 'bloodthirster', 'visage'], q: 'poke', w: 'trap', e: 'escape', r: 'execute' },
  },

  brakka: {
    id: 'brakka', name: 'Brakka', title: 'the Minotaur', role: 'Tank', roles: ['support', 'top'], icon: '🐂', color: 0x57534e, accent: 0x22d3ee,
    ranged: false, range: 1.7, projSpeed: 0,
    base: { hp: 680, hpG: 106, mp: 350, mpG: 45, ad: 62, adG: 3.5, armor: 40, armorG: 4.7, mr: 32, mrG: 2, as: 0.63, asG: 2.1, ms: 4.95, hpRegen: 1.7, mpRegen: 1.6 },
    passive: { name: 'Trample', desc: 'Attacks also deal magic damage to enemies near the target.' },
    onAttackHit(m, h, u) { for (const e of m.enemiesNear(h.team, u.x, u.y, 2)) if (e !== u) m.damage(h, e, 15 + h.level * 2 + 0.1 * h.stats.ap, 'magic'); },
    abilities: {
      q: { name: 'Pulverize', icon: '🔨', desc: 'Smashes the ground, knocking up nearby enemies.', cd: [15, 14, 13, 12, 11], mana: [60, 65, 70, 75, 80], range: 3, target: 'self',
        cast(m, h, rank) { for (const e of m.enemiesNear(h.team, h.x, h.y, 3)) { m.damage(h, e, dmg(h, [60, 105, 150, 195, 240], rank, { ap: 0.5 }), 'magic', { ability: true }); m.cc(e, 'knockup', 0.9, 0, h); } m.emit({ e: 'shock', x: h.x, y: h.y, r: 3, c: 'earth' }); } },
      w: { name: 'Headbutt', icon: '🐃', desc: 'Rams an enemy, knocking them back.', cd: [14, 13, 12, 11, 10], mana: [40, 50, 60, 70, 80], range: 5, target: 'enemy',
        cast(m, h, rank, t) { const u = t.unit; m.dash(h, u.x, u.y, 24, { stopAt: 1.4, onEnd: () => { if (u.dead) return; m.damage(h, u, dmg(h, [55, 110, 165, 220, 275], rank, { ap: 0.7 }), 'magic', { ability: true }); m.cc(u, 'knockback', 0.3, 4, h); m.cc(u, 'stun', 0.5, 0, h); } }); } },
      e: { name: 'Battle Roar', icon: '📣', desc: 'Heals Brakka and nearby allies and grants them movement speed.', cd: [12, 11, 10, 9, 8], mana: [50], range: 6, target: 'self',
        cast(m, h, rank) { for (const a of m.alliesNear(h.team, h.x, h.y, 6, { heroes: true })) { m.heal(h, a, dmg(h, [30, 45, 60, 75, 90], rank, { ap: 0.2, hp: 0.02 })); m.addBuff(a, { id: 'roarHaste', dur: 2, stats: { msPct: 15 } }); } m.emit({ e: 'healfx', x: h.x, y: h.y, r: 6, c: 'nature' }); } },
      r: { name: 'Unbreakable Will', icon: '💪', desc: 'Removes all crowd control and reduces incoming damage by 50/60/70% for 7s.', cd: [100, 90, 80], mana: [100], range: 0, target: 'self',
        cast(m, h, rank) { m.cleanse(h); m.addBuff(h, { id: 'unbreakable', dur: 7, stats: { dmgReduce: R([50, 60, 70], rank) } }); m.emit({ e: 'buff', id: h.id, c: 'unbreakable' }); } },
    },
    bot: { build: ['treads', 'sunfire', 'visage', 'thornmail', 'titan', 'frostorb'], q: 'melee', w: 'engage', e: 'heal', r: 'defend' },
  },

  rook: {
    id: 'rook', name: 'Rook', title: 'the Bladestorm', role: 'Fighter', roles: ['jungle', 'top'], icon: '🌪️', color: 0x14532d, accent: 0x84cc16,
    ranged: false, range: 1.8, projSpeed: 0,
    base: { hp: 620, hpG: 100, mp: 300, mpG: 40, ad: 66, adG: 3.8, armor: 34, armorG: 4.4, mr: 32, mrG: 2, as: 0.68, asG: 2.5, ms: 5.1, hpRegen: 1.8, mpRegen: 1.3 },
    passive: { name: 'Battle Fury', desc: 'Below 50% health, gains 20% attack speed and 10% lifesteal.' },
    tick(m, h) { if (h.hp < h.maxHp * 0.5 && !m.hasBuff(h, 'fury')) m.addBuff(h, { id: 'fury', dur: 0.5, stats: { as: 20, lifesteal: 10 } }); },
    abilities: {
      q: { name: 'Whirlwind', icon: '🌪️', desc: 'Spins for 3s, repeatedly damaging nearby enemies while moving faster.', cd: [10, 9.5, 9, 8.5, 8], mana: [50], range: 2.6, target: 'self',
        cast(m, h, rank) { m.addBuff(h, { id: 'whirl', dur: 3, stats: { msPct: 15 } }); m.area(h, { x: h.x, y: h.y, follow: h, radius: 2.6, dur: 3, style: 'whirl', tickEvery: 0.4, onTick: a => { for (const e of m.enemiesNear(h.team, h.x, h.y, a.radius)) m.damage(h, e, dmg(h, [15, 25, 35, 45, 55], rank, { ad: 0.3 }), 'physical', { ability: true }); } }); } },
      w: { name: 'Cleaving Throw', icon: '🪓', desc: 'Throws an axe that pierces and slows enemies.', cd: [8, 7.5, 7, 6.5, 6], mana: [40], range: 9, target: 'direction',
        cast(m, h, rank, t) { m.skillshot(h, { angle: ang(h, t), speed: 20, range: 9, width: 0.7, pierce: true, style: 'axe', onHit: u => { m.damage(h, u, dmg(h, [70, 110, 150, 190, 230], rank, { bad: 0.9 }), 'physical', { ability: true }); m.cc(u, 'slow', 2, 0.3, h); } }); } },
      e: { name: 'Leap Strike', icon: '🦘', desc: 'Leaps to a location, damaging and slowing enemies where he lands.', cd: [12, 11, 10, 9, 8], mana: [50], range: 6.5, target: 'point',
        cast(m, h, rank, t) { m.dash(h, t.x, t.y, 20, { onEnd: () => { for (const e of m.enemiesNear(h.team, h.x, h.y, 2.2)) { m.damage(h, e, dmg(h, [60, 100, 140, 180, 220], rank, { bad: 0.6 }), 'physical', { ability: true }); m.cc(e, 'slow', 1, 0.5, h); } m.emit({ e: 'nova', x: h.x, y: h.y, r: 2.2, c: 'nature' }); } }); } },
      r: { name: 'Soul Wrath', icon: '💢', desc: 'Unleashes a shockwave dealing damage increased by enemies\' missing health and knocking them up.', cd: [90, 75, 60], mana: [100], range: 4, target: 'self',
        cast(m, h, rank) { m.area(h, { x: h.x, y: h.y, follow: h, radius: 4, dur: 0.5, style: 'wrath', onEnd: () => { for (const e of m.enemiesNear(h.team, h.x, h.y, 4)) { m.damage(h, e, dmg(h, [150, 250, 350], rank, { bad: 1.0 }) + (e.maxHp - e.hp) * 0.1, 'physical', { ability: true }); m.cc(e, 'knockup', 0.6, 0, h); } m.emit({ e: 'shock', x: h.x, y: h.y, r: 4, c: 'nature' }); } }); } },
    },
    bot: { build: ['berserker', 'cleaver', 'bloodthirster', 'visage', 'thornmail', 'infinity'], q: 'melee', w: 'poke', e: 'engage', r: 'melee' },
  },
};

function thorneBleed(m, h, u) {
  const b = m.getBuff(u, 'bleed');
  const stacks = Math.min(5, ((b && b.stacks) || 0) + 1);
  m.addBuff(u, { id: 'bleed', dur: 5, stacks, owner: h.id, tickEvery: 1, onTick: () => m.damage(h, u, (4 + 0.6 * h.level + 0.06 * bonusAd(h)) * stacks, 'physical') });
}

function zarakStun(h, countOnly = false) {
  h.pyro = (h.pyro || 0) + 1;
  if (h.pyro >= 4) { if (countOnly) { h.pyro = 3; return false; } h.pyro = 0; return true; }
  return false;
}

export const CHAMPION_IDS = Object.keys(CHAMPIONS);
export const SLOTS = ['q', 'w', 'e', 'r'];
export const MAX_RANK = { q: 5, w: 5, e: 5, r: 3 };
export const R_LEVELS = [6, 11, 16];
export const MAX_LEVEL = 18;

/** Cumulative XP needed to reach each level. */
export const XP_TO_LEVEL = (() => {
  const t = [0, 0];
  for (let l = 2; l <= MAX_LEVEL; l++) t[l] = t[l - 1] + 180 + 80 * (l - 2);
  return t;
})();

export function canRankUp(h, slot) {
  if (h.points <= 0) return false;
  const rank = h.ranks[slot];
  if (rank >= MAX_RANK[slot]) return false;
  if (slot === 'r') return h.level >= R_LEVELS[rank];
  return rank < Math.ceil(h.level / 2);
}

export function championInfo(id) {
  const c = CHAMPIONS[id];
  if (!c) return null;
  const abilities = {};
  for (const s of SLOTS) {
    const a = c.abilities[s];
    abilities[s] = { name: a.name, icon: a.icon, desc: a.desc, cd: a.cd, mana: a.mana, range: a.range, target: a.target };
  }
  return { id: c.id, name: c.name, title: c.title, role: c.role, roles: c.roles, icon: c.icon, ranged: c.ranged, range: c.range, passive: c.passive, abilities, color: c.color, accent: c.accent, base: c.base };
}
