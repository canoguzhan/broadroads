/* Monster & boss definitions. Stats are for level 1 and scale with level. */

export const MONSTERS = {
  slime: { name: 'Void Slime', ai: 'melee', hp: 42, dmg: 7, speed: 2.6, r: 0.55, range: 1.1, atkCd: 1.2, xp: 10, gold: 3, aggro: 8 },
  bat: { name: 'Gloom Bat', ai: 'melee', hp: 24, dmg: 5, speed: 5.0, r: 0.4, range: 0.9, atkCd: 0.9, xp: 8, gold: 2, aggro: 10, erratic: true },
  wolf: { name: 'Dire Wolf', ai: 'melee', hp: 50, dmg: 9, speed: 4.6, r: 0.55, range: 1.2, atkCd: 1.0, xp: 13, gold: 3, aggro: 9 },
  skeleton: { name: 'Skeleton Warrior', ai: 'melee', hp: 60, dmg: 10, speed: 3.4, r: 0.5, range: 1.3, atkCd: 1.1, xp: 14, gold: 4, aggro: 9 },
  archer: { name: 'Bone Archer', ai: 'ranged', hp: 45, dmg: 9, speed: 3.2, r: 0.5, range: 9, keep: 6, atkCd: 1.8, projSpeed: 11, xp: 15, gold: 4, aggro: 11 },
  brute: { name: 'Orc Brute', ai: 'brute', hp: 150, dmg: 22, speed: 3.0, r: 0.85, range: 2.4, atkCd: 2.4, windup: 0.7, xp: 32, gold: 9, aggro: 9 },
  shaman: { name: 'Void Shaman', ai: 'caster', hp: 75, dmg: 11, speed: 3.0, r: 0.5, range: 8, keep: 6, atkCd: 2.2, projSpeed: 9, summon: 'skeleton', summonCd: 9, xp: 28, gold: 8, aggro: 10 },
  golem: { name: 'Rune Golem', ai: 'brute', hp: 320, dmg: 28, speed: 2.4, r: 1.0, range: 3.0, atkCd: 3.0, windup: 0.9, xp: 60, gold: 18, aggro: 8 },
  // Bosses
  colossus: { name: 'Bone Colossus', ai: 'boss', boss: true, hp: 1400, dmg: 26, speed: 3.2, r: 1.4, range: 2.8, atkCd: 1.6, xp: 400, gold: 120, aggro: 18, pattern: ['slam', 'charge', 'summon'] },
  overlord: { name: 'Void Overlord', ai: 'boss', boss: true, hp: 1800, dmg: 24, speed: 2.8, r: 1.5, range: 10, atkCd: 1.4, xp: 520, gold: 160, aggro: 20, projSpeed: 10, pattern: ['burst', 'rings', 'slam', 'summon'] },
  lich: { name: 'Lich Queen', ai: 'boss', boss: true, hp: 1600, dmg: 22, speed: 3.0, r: 1.2, range: 11, atkCd: 1.2, xp: 480, gold: 150, aggro: 20, projSpeed: 12, pattern: ['burst', 'nova', 'summon', 'blink'] },
  behemoth: { name: 'Broadroad Behemoth', ai: 'boss', boss: true, worldBoss: true, hp: 9000, dmg: 34, speed: 2.6, r: 2.2, range: 3.5, atkCd: 1.8, xp: 1600, gold: 600, aggro: 16, projSpeed: 9, pattern: ['slam', 'rings', 'burst', 'charge', 'summon'] },
};

export const BOSS_ROTATION = ['colossus', 'overlord', 'lich'];

export function scaleMonster(def, level, { elite = false, playerCount = 1 } = {}) {
  const lv = Math.max(1, level) - 1;
  const groupHp = 1 + Math.max(0, playerCount - 1) * (def.boss ? 0.7 : 0.45);
  const eliteMul = elite ? 2.6 : 1;
  return {
    maxHp: Math.round(def.hp * (1 + lv * 0.3) * groupHp * eliteMul),
    dmg: def.dmg * (1 + lv * 0.21) * (elite ? 1.4 : 1),
    armor: 2 + lv * 1.4 + (elite ? 6 : 0),
    xp: Math.round(def.xp * (1 + lv * 0.25) * (elite ? 3 : 1)),
    gold: Math.round(def.gold * (1 + lv * 0.15) * (elite ? 3 : 1)),
  };
}

export const DUNGEON_POOLS = [
  // by depth band
  ['slime', 'bat', 'skeleton'],
  ['skeleton', 'archer', 'bat', 'slime'],
  ['skeleton', 'archer', 'brute', 'shaman'],
  ['archer', 'brute', 'shaman', 'golem', 'skeleton'],
];
