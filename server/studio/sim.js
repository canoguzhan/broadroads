/* Simulates a full 5v5 bot match headlessly and cuts it into fights worth broadcasting.
   The match is deterministic for a seed (the match RNG plus Math.random, which the bots use,
   is swapped for a seeded generator), so it runs twice:
     1. fast, recording only events, to find the fights;
     2. again from the same seed, recording a replay (and a camera track) for each fight
        window only — full 30-minute replays would be tens of megabytes each.
   Runs inside a worker thread (simworker.js) so the studio's web server stays responsive. */
import { Match } from '../../shared/moba/match.js';
import { Recorder } from '../../shared/moba/recorder.js';
import { CHAMPIONS, CHAMPION_IDS } from '../../shared/moba/champions.js';
import { mulberry32 } from '../../shared/rng.js';

const DT = 0.05;
const ROLES = ['top', 'jungle', 'mid', 'bot', 'support'];
const NAMES = ['Nyx', 'Talon', 'Ember', 'Sable', 'Quill', 'Onyx', 'Wren', 'Cinder', 'Jinx', 'Halcyon', 'Drift', 'Mirth', 'Pyre', 'Lark', 'Zephyr', 'Orrin', 'Kestrel', 'Morrow', 'Basil', 'Corvo'];
// How much each announcer moment adds to a fight's score.
const ANN_SCORE = { multi2: 3, multi3: 6, multi4: 9, multi5: 14, team_wipe: 8, first_strike: 2, streak_end: 3, wyrm: 4, titan: 6, tower: 1.5, spire: 2.5, core: 6 };
export const PRE_ROLL = 8; // seconds of build-up kept before a fight's first kill
export const POST_ROLL = 4;
export const TAIL = 7; // extra replay recorded after a fight so commentary can finish over it

/** Runs fn with Math.random seeded (restored afterwards). */
const realRandom = Math.random;
function seeded(seed, fn) {
  Math.random = mulberry32(seed ^ 0x5bd1e995);
  try { return fn(); } finally { Math.random = realRandom; }
}

/** The ten players for a seed: random champions, roles and bot skill. */
export function lineup(seed) {
  const rnd = mulberry32(seed);
  const ids = [...CHAMPION_IDS].sort(() => rnd() - 0.5).sort(() => rnd() - 0.5);
  const names = [...NAMES].sort(() => rnd() - 0.5);
  return ids.slice(0, 10).map((c, i) => ({
    key: `bot:${i}`, name: `${names[i]}Bot`, team: i < 5 ? 'blue' : 'red', champ: c, summ: 'mend', bot: true,
    role: ROLES[i % 5], skill: Math.round((0.72 + rnd() * 0.24) * 100) / 100,
  }));
}

function newMatch(seed, onEnd) {
  return new Match({ id: `studio-${seed}`, mode: 'practice', players: lineup(seed), seed, hooks: { end: (m, res) => onEnd(res) } });
}

const heroById = m => new Map(m.heroes.map(h => [h.id, h]));

/** Turns one tick's effects into compact events (champion names instead of ids). */
function collect(m, byId, out) {
  const t = Math.round(m.time * 100) / 100;
  const champ = id => byId.get(id)?.champ || null;
  for (const f of m.fx) {
    switch (f.e) {
      case 'dmg': {
        const s = byId.get(f.s), v = byId.get(f.id);
        if (s && v && s.team !== v.team) out.push({ t, e: 'hit', s: s.champ, v: v.champ, n: f.v, x: Math.round(f.x), y: Math.round(f.y), hp: Math.round((v.hp / v.maxHp) * 100) });
        break;
      }
      case 'kill': out.push({ t, e: 'kill', k: champ(f.k), v: champ(f.v), a: (f.a || []).map(champ).filter(Boolean), team: byId.get(f.v)?.team === 'blue' ? 'red' : 'blue' }); break;
      case 'cast': if (byId.has(f.id)) out.push({ t, e: 'cast', c: f.c, sl: f.sl, x: Math.round(f.x), y: Math.round(f.y) }); break;
      case 'summ': if (byId.has(f.id)) out.push({ t, e: 'summ', c: champ(f.id), k: f.k }); break;
      case 'death': if (f.k === 'tower' || f.k === 'spire' || f.k === 'core') out.push({ t, e: 'structure', k: f.k, x: Math.round(f.x), y: Math.round(f.y) }); break;
      case 'ann': if (f.key && !f.priv) out.push({ t, e: 'ann', key: f.key, team: f.team, killer: f.killer, victim: f.victim, text: f.text }); break;
      default:
    }
  }
}

/** Groups kills into fights and scores them. Exported for tests. */
export function findFights(events, { duration, maxLen = 52 } = {}) {
  const kills = events.filter(e => e.e === 'kill');
  const groups = [];
  for (const k of kills) {
    const g = groups[groups.length - 1];
    if (g && k.t - g.last <= 12 && k.t - g.first <= maxLen - PRE_ROLL - POST_ROLL) { g.kills.push(k); g.last = k.t; } else groups.push({ first: k.t, last: k.t, kills: [k] });
  }
  return groups.map(g => {
    // Build-up: back to the first champion damage of this skirmish (at most PRE_ROLL + 6 s).
    const hits = events.filter(e => e.e === 'hit' && e.t >= g.first - PRE_ROLL - 6 && e.t <= g.last);
    const firstHit = hits.length ? hits[0].t : g.first;
    const start = Math.max(1, Math.min(g.first - 3, Math.max(firstHit - 2, g.first - PRE_ROLL)));
    const end = Math.min(duration ?? Infinity, g.last + POST_ROLL);
    const inWin = events.filter(e => e.t >= start && e.t <= end);
    const anns = inWin.filter(e => e.e === 'ann' && ANN_SCORE[e.key]);
    const champs = new Set();
    for (const e of inWin) if (e.e === 'hit') { champs.add(e.s); champs.add(e.v); }
    const damage = inWin.filter(e => e.e === 'hit').reduce((a, e) => a + e.n, 0);
    const ults = inWin.filter(e => e.e === 'cast' && e.sl === 'r').length;
    const score = g.kills.length * 3 + anns.reduce((a, e) => a + ANN_SCORE[e.key], 0) + champs.size * 0.6 + ults * 0.8 + Math.min(6, damage / 2500);
    const best = anns.sort((a, b) => ANN_SCORE[b.key] - ANN_SCORE[a.key])[0];
    return { start: Math.round(start * 10) / 10, end: Math.round(end * 10) / 10, kills: g.kills.length, champs: [...champs], ults, damage, score: Math.round(score * 10) / 10, best: best ? best.key : g.kills.length > 1 ? 'skirmish' : 'pick' };
  });
}

/** Picks the n best fights that don't overlap, in match order. */
export function pickFights(fights, n) {
  const chosen = [];
  for (const f of [...fights].sort((a, b) => b.score - a.score)) {
    if (chosen.length >= n) break;
    if (f.end - f.start < 10) continue;
    if (chosen.some(c => f.start < c.end + 3 && c.start < f.end + 3)) continue;
    chosen.push(f);
  }
  return chosen.sort((a, b) => a.start - b.start);
}

/** Where the camera should look: the centroid of champions fighting near the action. */
function focusPoint(m, prev) {
  const now = m.time;
  const fighting = m.heroes.filter(h => !h.dead && ([...h.lastHitBy.values()].some(t => now - t < 2.5) || m.heroes.some(o => o.team !== h.team && o.lastHitBy.has(h.id) && now - o.lastHitBy.get(h.id) < 2.5)));
  if (!fighting.length) return prev;
  // Keep the camera on the biggest cluster (ignore a lone duel across the map).
  let best = null, bn = 0;
  for (const a of fighting) {
    const near = fighting.filter(b => Math.hypot(a.x - b.x, a.y - b.y) < 16);
    const score = near.length + (prev ? Math.max(0, 1 - Math.hypot(a.x - prev.x, a.y - prev.y) / 30) * 0.5 : 0);
    if (score > bn) { bn = score; best = near; }
  }
  return { x: best.reduce((s, h) => s + h.x, 0) / best.length, y: best.reduce((s, h) => s + h.y, 0) / best.length };
}

/**
 * Simulates the match for `seed` and returns { summary, fights } where each fight carries its
 * events, camera track and replay ({ header, lines }) ready to save.
 */
export function simulate({ seed, fights: wanted = 3, maxMinutes = 40, progress = () => {} }) {
  return seeded(seed, () => {
    // Pass 1: events only.
    let result = null;
    let m = newMatch(seed, r => { result = r; });
    let byId = heroById(m);
    const events = [];
    const limit = maxMinutes * 60 / DT;
    for (let i = 0; i < limit && !result; i++) {
      m.update(DT);
      collect(m, byId, events);
      m.fx.length = 0;
      if (i % 2400 === 0) progress({ pass: 1, minute: Math.floor(m.time / 60) });
    }
    const duration = result ? result.duration : m.time;
    const summary = {
      seed, duration: Math.round(duration), winner: result?.winner || null, kills: { ...m.kills },
      players: m.heroes.map(h => ({ champ: h.champ, name: CHAMPIONS[h.champ].name, title: CHAMPIONS[h.champ].title, role: CHAMPIONS[h.champ].role, team: h.team, k: h.kills, d: h.deaths, a: h.assists })),
    };
    const all = findFights(events, { duration });
    const chosen = pickFights(all, wanted);
    if (!chosen.length) return { summary, fights: [] };

    // Pass 2: same seed, record each chosen window.
    Math.random = mulberry32(seed ^ 0x5bd1e995);
    result = null;
    m = newMatch(seed, r => { result = r; });
    byId = heroById(m);
    const out = chosen.map((f, i) => ({ ...f, n: i + 1, events: [], track: [], rec: null, before: null }));
    // Recorder.finish() draws a random replay id: keep that off the seeded stream.
    const finish = (rec, res) => { const seededRandom = Math.random; Math.random = realRandom; try { return rec.finish(res); } finally { Math.random = seededRandom; } };
    const stopAt = Math.min(duration, out[out.length - 1].end + TAIL);
    for (let i = 0; i < limit && !result && m.time < stopAt; i++) {
      m.update(DT);
      const t = m.time;
      for (const f of out) {
        if (!f.rec && t >= f.start - 1) {
          f.rec = new Recorder(m);
          f.before = { blue: m.kills.blue, red: m.kills.red, towers: { ...m.towersDown } };
          f.rec.push({ t: 'score', score: m.scoreboard(), time: Math.round(t * 100) / 100 });
          f.cam = focusPoint(m, null) || { x: m.heroes[0].x, y: m.heroes[0].y };
          f.lastTrack = -1;
          f.lastScore = -1;
        }
        if (f.rec && !f.done) {
          f.rec.capture();
          if (t >= f.start - 0.5 && t <= f.end + TAIL) collect(m, byId, f.events);
          if (Math.floor(t) !== f.lastScore) { f.lastScore = Math.floor(t); f.rec.push({ t: 'score', score: m.scoreboard(), time: Math.round(t * 100) / 100 }); }
          if (t - f.lastTrack >= 0.25) {
            f.lastTrack = t;
            const real = focusPoint(m, f.cam);
            if (real) f.cam = real;
            f.track.push({ t: Math.round(t * 100) / 100, x: Math.round(f.cam.x * 10) / 10, y: Math.round(f.cam.y * 10) / 10, real: !!real });
          }
          if (t >= f.end + TAIL) {
            f.done = true;
            const { header, lines } = finish(f.rec, { duration: Math.round((f.end + TAIL) * 10) / 10, winner: null, kills: { ...m.kills } });
            f.replay = { header, lines };
            f.rec = null;
          }
        }
      }
      m.fx.length = 0;
      if (i % 2400 === 0) progress({ pass: 2, minute: Math.floor(t / 60) });
    }
    for (const f of out) {
      if (!f.replay && f.rec) {
        const { header, lines } = finish(f.rec, { duration: Math.round(m.time * 10) / 10, winner: null, kills: { ...m.kills } });
        f.replay = { header, lines };
      }
      f.replayEnd = f.replay ? f.replay.header.duration : f.end;
      // Before the first clash there is no fight to look at: open on where it will happen.
      const firstReal = f.track.find(p => p.real);
      if (firstReal) for (const p of f.track) { if (p.real) break; p.x = firstReal.x; p.y = firstReal.y; }
      for (const p of f.track) delete p.real;
      f.after = { blue: f.before.blue + f.events.filter(e => e.e === 'kill' && e.t <= f.end && e.team === 'blue').length, red: f.before.red + f.events.filter(e => e.e === 'kill' && e.t <= f.end && e.team === 'red').length };
      // Determinism check: the recorded window should contain the kills pass 1 saw.
      f.matched = f.events.filter(e => e.e === 'kill' && e.t >= f.start && e.t <= f.end).length;
      delete f.rec; delete f.done; delete f.cam; delete f.lastTrack; delete f.lastScore;
    }
    return { summary, fights: out.filter(f => f.replay && f.matched > 0) };
  });
}
