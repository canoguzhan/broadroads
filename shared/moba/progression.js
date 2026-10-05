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

/* ---------------- daily bonuses ---------------- */
export const FIRST_WIN_SHARDS = 100, FIRST_WIN_XP = 200;
// Login streak rewards, day 1..7 (then it cycles).
export const STREAK_REWARDS = [25, 50, 75, 100, 150, 200, 300];
const yesterday = now => today(now - 86400000);

/** Daily login streak: call on login. Returns the shards granted today (0 if already counted). */
export function loginStreak(prof, now = Date.now()) {
  const day = today(now);
  if (prof.lastLogin === day) return 0;
  prof.streak = prof.lastLogin === yesterday(now) ? (prof.streak || 0) + 1 : 1;
  prof.lastLogin = day;
  const reward = STREAK_REWARDS[(prof.streak - 1) % STREAK_REWARDS.length];
  prof.shards = (prof.shards || 0) + reward;
  return reward;
}

export const firstWinAvailable = (prof, now = Date.now()) => prof.firstWinDay !== today(now);

/** First win of the day: call for a won (non-tutorial) game. Returns true when the bonus was granted. */
export function firstWin(prof, now = Date.now()) {
  if (!firstWinAvailable(prof, now)) return false;
  prof.firstWinDay = today(now);
  prof.shards = (prof.shards || 0) + FIRST_WIN_SHARDS;
  return true;
}

/* ---------------- ranked tiers and seasons ---------------- */
// Each tier spans 200 rating with four divisions (IV..I) of 50; Champion is open-ended.
export const TIERS = [
  { id: 'bronze', name: 'Bronze', min: 0, color: '#c0794a', reward: 100 },
  { id: 'silver', name: 'Silver', min: 900, color: '#c9d1d9', reward: 200 },
  { id: 'gold', name: 'Gold', min: 1100, color: '#f5c542', reward: 350 },
  { id: 'platinum', name: 'Platinum', min: 1300, color: '#4fd1c5', reward: 500 },
  { id: 'diamond', name: 'Diamond', min: 1500, color: '#7aa7ff', reward: 750 },
  { id: 'master', name: 'Master', min: 1700, color: '#c084fc', reward: 1000 },
  { id: 'champion', name: 'Champion', min: 1900, color: '#ff6b6b', reward: 1500 },
];
const DIVS = ['IV', 'III', 'II', 'I'];

export function tierOf(rating) {
  let t = TIERS[0];
  for (const x of TIERS) if (rating >= x.min) t = x;
  const next = TIERS[TIERS.indexOf(t) + 1];
  if (!next) return { ...t, div: '', label: t.name, progress: 1 };
  const span = next.min - (t.min || 700); // Bronze effectively starts at 700
  const into = Math.max(0, rating - (t.min || 700));
  const div = DIVS[Math.min(3, Math.floor((into / span) * 4))];
  return { ...t, div, label: `${t.name} ${div}`, progress: Math.min(1, into / span) };
}

// Seasons are calendar quarters; Season 1 is 2026 Q4 (launch).
export function seasonOf(now = Date.now()) {
  const d = new Date(now);
  const q = Math.floor(d.getUTCMonth() / 3);
  const number = (d.getUTCFullYear() - 2026) * 4 + q - 2;
  const end = Date.UTC(d.getUTCFullYear(), (q + 1) * 3, 1);
  return { id: `${d.getUTCFullYear()}-Q${q + 1}`, number: Math.max(1, number), endsAt: end };
}

/** Season rollover on login: archives the old season, pays its reward and soft-resets rating. */
export function seasonRollover(prof, now = Date.now()) {
  const s = seasonOf(now);
  if (!prof.season) { prof.season = s.id; prof.peakRating = prof.rating; prof.seasonGames = 0; return null; }
  if (prof.season === s.id) return null;
  const peak = tierOf(prof.peakRating || prof.rating);
  const played = (prof.seasonGames || 0) >= 5;
  const reward = played ? peak.reward : 0;
  prof.seasonHistory = [{ season: prof.season, peak: peak.label, tier: peak.id, games: prof.seasonGames || 0 }, ...(prof.seasonHistory || [])].slice(0, 12);
  prof.shards = (prof.shards || 0) + reward;
  prof.rating = Math.round(1000 + (prof.rating - 1000) / 2);
  prof.season = s.id;
  prof.peakRating = prof.rating;
  prof.seasonGames = 0;
  return { reward, peak: peak.label, played };
}

/** Rated game bookkeeping. */
export function rankedGame(prof) {
  prof.seasonGames = (prof.seasonGames || 0) + 1;
  prof.peakRating = Math.max(prof.peakRating || 0, prof.rating);
}
