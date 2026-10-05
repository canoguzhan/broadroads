/* Keystones: one pre-match choice that shapes how a champion fights. */
export const KEYSTONES = {
  warpath: { name: 'Warpath', icon: '⚔️', desc: 'Damaging enemy champions stacks up to 5 times (4s): +2% damage per stack.' },
  starfall: { name: 'Starfall', icon: '🌠', desc: 'Damaging a champion with an ability calls down a star for bonus magic damage (8s cooldown).' },
  ironroot: { name: 'Ironroot', icon: '🌳', desc: '+6% max health. Dropping below 35% health grants a shield worth 15% max health (45s cooldown).' },
  swiftwind: { name: 'Swiftwind', icon: '🍃', desc: '+5% movement speed, and +12% more after 3s without taking damage.' },
};
export const KEYSTONE_IDS = Object.keys(KEYSTONES);
// Default for players who don't pick (and for bots), by champion role.
export const defaultKeystone = role => ({ Tank: 'ironroot', Support: 'ironroot', Mage: 'starfall', Marksman: 'warpath', Assassin: 'warpath', Fighter: 'warpath' }[role] || 'warpath');

/** Hooks called by the match. */
export function keystoneOnAdd(m, h) {
  if (h.keystone === 'ironroot') m.addBuff(h, { id: 'ks_ironroot', dur: Infinity, stats: { hpPct: 6 } });
  if (h.keystone === 'swiftwind') m.addBuff(h, { id: 'ks_swift', dur: Infinity, stats: { msPct: 5 } });
}

export function keystoneTick(m, h) {
  if (h.keystone === 'swiftwind' && m.time - h.lastDamagedT > 3 && !m.hasBuff(h, 'ks_swiftfree')) m.addBuff(h, { id: 'ks_swiftfree', dur: 0.5, stats: { msPct: 12 } });
}

/** After a champion (src) damages another champion (tgt). */
export function keystoneOnHit(m, src, tgt, opts) {
  if (src.keystone === 'warpath') {
    const b = m.getBuff(src, 'ks_warpath');
    const stacks = Math.min(5, ((b && b.stacks) || 0) + (b && m.time - (b.at || 0) < 0.4 ? 0 : 1)); // at most one stack per 0.4s
    m.addBuff(src, { id: 'ks_warpath', dur: 4, stacks, at: m.time, stats: { dmgBonus: 2 * stacks } });
  }
  if (src.keystone === 'starfall' && opts.ability && !opts.keystone && !m.hasBuff(src, 'ks_starcd')) {
    m.addBuff(src, { id: 'ks_starcd', dur: 8 });
    const bonusAd = src.stats.ad - src.baseStats.ad;
    m.area(src, { x: tgt.x, y: tgt.y, radius: 0.1, dur: 0.5, style: 'none', onEnd: () => {
      if (tgt.dead) return;
      m.damage(src, tgt, 30 + 8 * src.level + 0.3 * src.stats.ap + 0.2 * bonusAd, 'magic', { keystone: true });
      m.emit({ e: 'boom', x: tgt.x, y: tgt.y, r: 1.2, c: 'star' });
    } });
  }
  if (tgt.keystone === 'ironroot' && tgt.hp > 0 && tgt.hp < tgt.maxHp * 0.35 && !m.hasBuff(tgt, 'ks_ironcd')) {
    m.addBuff(tgt, { id: 'ks_ironcd', dur: 45 });
    m.shield(tgt, tgt.maxHp * 0.15, 3);
  }
}
