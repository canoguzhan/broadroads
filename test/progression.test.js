import test from 'node:test';
import assert from 'node:assert/strict';
import { newProfile } from '../shared/moba/profile.js';
import { ensureQuests, questProgress, claimQuest, QUESTS, DAILY_COUNT, buySkin, equipSkin, ownsSkin, equippedSkin, avatarUnlocked, avatarOf, DEFAULT_AVATAR, SKINS } from '../shared/moba/progression.js';

const result = (o = {}) => ({ win: true, kills: 5, deaths: 2, assists: 6, cs: 80, dmg: 9000, healed: 500, gold: 9000, ...o });

test('daily quests: three distinct quests per day, stable within a day, new the next day', () => {
  const p = newProfile('Ayla');
  const day1 = Date.UTC(2026, 9, 5, 10);
  assert.equal(ensureQuests(p, day1), true);
  assert.equal(p.quests.list.length, DAILY_COUNT);
  assert.equal(new Set(p.quests.list.map(q => q.id)).size, DAILY_COUNT);
  const ids = p.quests.list.map(q => q.id).join();
  assert.equal(ensureQuests(p, day1 + 3600000), false, 'same day keeps the quests');
  assert.equal(p.quests.list.map(q => q.id).join(), ids);
  ensureQuests(p, day1 + 86400000);
  assert.notEqual(p.quests.day, '2026-10-05');
});

test('quest progress from match results, capped at the goal; tutorial does not count', () => {
  const p = newProfile('Brom');
  ensureQuests(p);
  p.quests.list = [{ id: 'takedowns', n: 0, claimed: false }, { id: 'play', n: 0, claimed: false }, { id: 'win', n: 0, claimed: false }];
  questProgress(p, result(), 'tutorial');
  assert.deepEqual(p.quests.list.map(q => q.n), [0, 0, 0]);
  questProgress(p, result(), 'practice');
  assert.deepEqual(p.quests.list.map(q => q.n), [10, 1, 1]);
  questProgress(p, result(), 'ranked');
  assert.equal(p.quests.list[0].n, QUESTS.takedowns.goal);
  assert.equal(p.quests.list[1].n, 2);
});

test('claiming pays shards once, only when complete', () => {
  const p = newProfile('Cora');
  ensureQuests(p);
  p.quests.list = [{ id: 'win', n: 0, claimed: false }, { id: 'play', n: 2, claimed: false }, { id: 'cs', n: 5, claimed: false }];
  const start = p.shards;
  assert.equal(claimQuest(p, 'win'), 0);
  assert.equal(claimQuest(p, 'play'), QUESTS.play.reward);
  assert.equal(p.shards, start + QUESTS.play.reward);
  assert.equal(claimQuest(p, 'play'), 0, 'no double claim');
  assert.equal(claimQuest(p, 'nope'), 0);
});

test('skins: buy with shards, equip only owned ones', () => {
  const p = newProfile('Dax');
  p.shards = SKINS.frost.price - 1;
  assert.equal(buySkin(p, 'thorne', 'frost'), 'Not enough shards.');
  p.shards += 1;
  assert.equal(buySkin(p, 'thorne', 'frost'), null);
  assert.equal(p.shards, 0);
  assert.ok(ownsSkin(p, 'thorne', 'frost'));
  assert.equal(equippedSkin(p, 'thorne'), 'frost');
  assert.notEqual(buySkin(p, 'thorne', 'frost'), null, 'cannot buy twice');
  assert.notEqual(equipSkin(p, 'lyra', 'frost'), null, 'skins are per champion');
  assert.equal(equipSkin(p, 'thorne', 'base'), null);
  assert.equal(equippedSkin(p, 'thorne'), 'base');
  assert.notEqual(buySkin(p, 'nobody', 'frost'), null);
});

test('profile pictures unlock by champion played or account level', () => {
  const p = newProfile('Eve');
  assert.equal(avatarOf(p), DEFAULT_AVATAR);
  assert.equal(avatarUnlocked(p, 'portrait/lyra'), false);
  p.champs.lyra = { games: 1, wins: 0 };
  assert.equal(avatarUnlocked(p, 'portrait/lyra'), true);
  assert.equal(avatarUnlocked(p, 'portrait/mob_wyrm'), false);
  p.level = 15;
  assert.equal(avatarUnlocked(p, 'portrait/mob_wyrm'), true);
  p.avatar = 'portrait/mob_titan';
  assert.equal(avatarOf(p), DEFAULT_AVATAR, 'locked choice falls back');
});
