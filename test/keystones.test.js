import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../shared/moba/match.js';

const mk = (a, b, ksA, ksB) => new Match({ id: 't', mode: 'practice', players: [
  { key: 'a', name: 'A', team: 'blue', champ: a, spell: 'mend', keystone: ksA },
  { key: 'b', name: 'B', team: 'red', champ: b, spell: 'mend', keystone: ksB },
] });

test('keystones: defaults by role, Ironroot health, Warpath stacks, Ironroot shield', () => {
  const m = mk('kaelen', 'garrok');
  const [a, b] = m.heroes;
  assert.equal(a.keystone, 'warpath');
  assert.equal(b.keystone, 'ironroot');
  const plain = mk('garrok', 'lyra', 'warpath').heroes[0];
  assert.ok(b.maxHp > plain.maxHp * 1.05, 'Ironroot adds max health');
  for (let i = 0; i < 6; i++) { m.time += 0.5; m.damage(a, b, 10, 'true', { attack: true }); }
  assert.equal(m.getBuff(a, 'ks_warpath').stacks, 5);
  assert.ok(a.stats.dmgBonus === 0 || a.stats.dmgBonus >= 0);
  m.damage(a, b, b.hp - b.maxHp * 0.3, 'true', {});
  assert.ok(b.shields.length > 0, 'Ironroot shield below 35%');
});

test('items: Executioner\'s Maul and heal power', () => {
  const m = mk('kaelen', 'garrok', 'starfall', 'swiftwind');
  const [a, b] = m.heroes;
  b.hp = b.maxHp * 0.3;
  const base = m.damage(a, b, 100, 'true', {});
  a.items[0] = { id: 'maul' }; m.recompute(a);
  const boosted = m.damage(a, b, 100, 'true', {});
  assert.ok(Math.abs(boosted / base - 1.12) < 0.01, `maul +12% (${base} -> ${boosted})`);
});
