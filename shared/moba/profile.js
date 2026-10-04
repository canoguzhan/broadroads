/* Player profile (persisted per account). */

export function newProfile(name) {
  return {
    v: 3, name, level: 1, xp: 0, rating: 1000, games: 0, wins: 0, losses: 0,
    kills: 0, deaths: 0, assists: 0, champs: {}, history: [], createdAt: Date.now(),
  };
}

/** Accepts old RPG saves or partial data and returns a valid v3 profile. */
export function normalizeProfile(name, data) {
  if (!data || data.v !== 3) return newProfile(name);
  const base = newProfile(name);
  return { ...base, ...data, name, champs: { ...(data.champs || {}) }, history: Array.isArray(data.history) ? data.history.slice(0, 20) : [] };
}

export const profileXpNeeded = level => 400 + level * 150;

export function leaderboardRow(p, kind) {
  const prof = p && p.v === 3 ? p : newProfile(p ? p.name : '?');
  let value;
  switch (kind) {
    case 'wins': value = prof.wins; break;
    case 'level': value = prof.level * 1e6 + prof.xp; break;
    case 'kills': value = prof.kills; break;
    default: value = prof.rating;
  }
  return { name: prof.name, level: prof.level, rating: prof.rating, wins: prof.wins, losses: prof.losses, value };
}
