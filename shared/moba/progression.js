/* Account progression: daily quests, shards (the reward currency), level
   rewards, champion skins (colour variants of the 3D models) and profile
   pictures. Shared so the client can show the same definitions. */
import { CHAMPION_IDS } from './champions.js';

/* ---------------- daily quests ---------------- */
// progress(p): how much one match result adds. Practice counts; the tutorial doesn't.
export const QUESTS = {
  win: { text: 'Win a game', goal: 1, reward: 150, progress: p => (p.win ? 1 : 0) },
  play: { text: 'Play 2 games', goal: 2, reward: 100, progress: () => 1 },
  takedowns: { text: 'Get 10 takedowns (kills + assists)', goal: 10, reward: 120, progress: p => p.kills + p.assists },
  cs: { text: 'Last-hit 120 minions', goal: 120, reward: 120, progress: p => p.cs },
  damage: { text: 'Deal 15,000 damage to champions', goal: 15000, reward: 150, progress: p => p.dmg },
  heal: { text: 'Heal or shield 3,000 health', goal: 3000, reward: 120, progress: p => p.healed },
  gold: { text: 'Earn 20,000 gold', goal: 20000, reward: 120, progress: p => p.gold },
  survive: { text: 'Finish a game with 3 deaths or fewer', goal: 1, reward: 100, progress: p => (p.deaths <= 3 ? 1 : 0) },
};
const QUEST_IDS = Object.keys(QUESTS);
export const DAILY_COUNT = 3;

export const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

function hash(str) { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

/** Makes sure the profile has today's quests (three per day, picked per player). */
export function ensureQuests(prof, now = Date.now()) {
  const day = today(now);
  if (prof.quests && prof.quests.day === day) return false;
  const pool = [...QUEST_IDS];
  const list = [];
  let h = hash(`${prof.name}:${day}`);
  while (list.length < DAILY_COUNT && pool.length) {
    const id = pool.splice(h % pool.length, 1)[0];
    h = hash(`${h}`);
    list.push({ id, n: 0, claimed: false });
  }
  prof.quests = { day, list };
  return true;
}

/** Adds one match result to today's quest progress. */
export function questProgress(prof, p, mode) {
  if (mode === 'tutorial') return;
  ensureQuests(prof);
  for (const q of prof.quests.list) {
    const def = QUESTS[q.id];
    if (def && !q.claimed) q.n = Math.min(def.goal, q.n + def.progress(p));
  }
}

export function claimQuest(prof, id) {
  ensureQuests(prof);
  const q = prof.quests.list.find(x => x.id === id);
  const def = q && QUESTS[q.id];
  if (!def || q.claimed || q.n < def.goal) return 0;
  q.claimed = true;
  prof.shards = (prof.shards || 0) + def.reward;
  return def.reward;
}

/* ---------------- shards from games and levels ---------------- */
export const SHARDS_PER_WIN = 25, SHARDS_PER_GAME = 10, SHARDS_PER_LEVEL = 150;

/* ---------------- skins ---------------- */
// Colour variants applied as a tint to the champion's textured model.
export const SKINS = {
  crimson: { name: 'Crimson', price: 400, tint: 0xff8a80, emissive: 0x3a0505 },
  frost: { name: 'Frost', price: 400, tint: 0x9cc8ff, emissive: 0x06223a },
  shadow: { name: 'Shadow', price: 600, tint: 0x8f7fb8, emissive: 0x1a0830 },
  gilded: { name: 'Gilded', price: 900, tint: 0xffd97a, emissive: 0x2a1c00 },
};
export const skinKey = (champ, skin) => `${champ}:${skin}`;
export const ownsSkin = (prof, champ, skin) => !skin || skin === 'base' || (prof.skins || []).includes(skinKey(champ, skin));
export const equippedSkin = (prof, champ) => (prof && prof.equipped && prof.equipped[champ]) || 'base';

export function buySkin(prof, champ, skin) {
  const s = SKINS[skin];
  if (!s || !CHAMPION_IDS.includes(champ) || ownsSkin(prof, champ, skin)) return 'Not available.';
  if ((prof.shards || 0) < s.price) return 'Not enough shards.';
  prof.shards -= s.price;
  prof.skins = [...(prof.skins || []), skinKey(champ, skin)];
  prof.equipped = { ...(prof.equipped || {}), [champ]: skin };
  return null;
}

export function equipSkin(prof, champ, skin) {
  if (!CHAMPION_IDS.includes(champ) || (skin !== 'base' && !SKINS[skin]) || !ownsSkin(prof, champ, skin)) return 'You do not own that skin.';
  prof.equipped = { ...(prof.equipped || {}), [champ]: skin };
  return null;
}

/* ---------------- profile pictures ---------------- */
// Champion portraits unlock by playing the champion; creature portraits by account level.
export const AVATARS = [
  ...CHAMPION_IDS.map(id => ({ id: `portrait/${id}`, champ: id, need: `Play a game as this champion` })),
  { id: 'portrait/minion_melee_blue', level: 1, need: 'Starter' },
  { id: 'portrait/minion_caster_red', level: 1, need: 'Starter' },
  { id: 'portrait/mob_wolf', level: 2, need: 'Reach level 2' },
  { id: 'portrait/mob_toad', level: 3, need: 'Reach level 3' },
  { id: 'portrait/mob_bat', level: 4, need: 'Reach level 4' },
  { id: 'portrait/mob_stonehulk', level: 5, need: 'Reach level 5' },
  { id: 'portrait/minion_super_red', level: 6, need: 'Reach level 6' },
  { id: 'portrait/mob_mossback', level: 8, need: 'Reach level 8' },
  { id: 'portrait/mob_brute', level: 10, need: 'Reach level 10' },
  { id: 'portrait/mob_wyrm', level: 15, need: 'Reach level 15' },
  { id: 'portrait/mob_titan', level: 20, need: 'Reach level 20' },
];

export function avatarUnlocked(prof, id) {
  const a = AVATARS.find(x => x.id === id);
  if (!a) return false;
  if (a.champ) return !!(prof.champs && prof.champs[a.champ]);
  return (prof.level || 1) >= a.level;
}

export const DEFAULT_AVATAR = 'portrait/minion_melee_blue';
export const avatarOf = prof => (prof && prof.avatar && avatarUnlocked(prof, prof.avatar) ? prof.avatar : DEFAULT_AVATAR);
