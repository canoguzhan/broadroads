/* Privacy-friendly analytics: daily aggregate counters only (no per-player
   event log, nothing sent to third parties). Stored as one JSON file per day
   in <dataDir>/analytics. Covers the player funnel (new players, tutorial,
   first/second game, next-day return) and balance (champion, item and
   keystone win rates). */
import fs from 'node:fs';
import path from 'node:path';

const day = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const blank = date => ({
  date, players: 0, newPlayers: 0, tutorialStart: 0, tutorialDone: 0, firstGame: 0, secondGame: 0, d1Return: 0,
  matches: {}, champs: {}, items: {}, keystones: {},
});

export function fileAnalytics(dataDir, log = console) {
  const dir = path.join(dataDir, 'analytics');
  fs.mkdirSync(dir, { recursive: true });
  const cache = new Map(); // date -> { data, seen: Set, dirty }
  const fileOf = d => path.join(dir, `${d}.json`);
  const get = d => {
    if (!cache.has(d)) {
      let data = blank(d);
      try { data = { ...data, ...JSON.parse(fs.readFileSync(fileOf(d), 'utf8')) }; } catch { /* new day */ }
      cache.set(d, { data, seen: new Set(data._seen || []), dirty: false });
    }
    return cache.get(d);
  };
  const bump = (d, fn) => { const e = get(d); fn(e.data, e); e.dirty = true; };

  function flush() {
    for (const [d, e] of cache) {
      if (!e.dirty) continue;
      e.data._seen = [...e.seen]; // daily-unique player counting (hashed ids, kept one day)
      try { fs.writeFileSync(fileOf(d), JSON.stringify(e.data)); e.dirty = false; } catch (err) { log.error('analytics write failed', err.message); }
      if (d !== day()) cache.delete(d);
    }
  }
  const timer = setInterval(flush, 60e3);
  timer.unref();

  // Daily-unique counting without storing account ids in the clear.
  const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(36); };

  return {
    flush,
    event(name, data = {}) {
      const today = day();
      switch (name) {
        case 'login': bump(today, (x, e) => {
          const k = hash(data.accountId);
          if (!e.seen.has(k)) { e.seen.add(k); x.players++; }
          if (data.isNew) x.newPlayers++;
        }); break;
        case 'd1Return': bump(day(data.createdAt), y => { y.d1Return++; }); break; // credited to the day they joined
        case 'tutorialStart': bump(today, x => { x.tutorialStart++; }); break;
        case 'tutorialDone': bump(today, x => { x.tutorialDone++; }); break;
        case 'firstGame': bump(today, x => { x.firstGame++; }); break;
        case 'secondGame': bump(today, x => { x.secondGame++; }); break;
        case 'match': bump(today, x => {
          const { mode, result } = data;
          x.matches[mode] = (x.matches[mode] || 0) + 1;
          if (mode === 'tutorial') return;
          for (const p of result.players) {
            const human = !p.key.startsWith('bot:');
            const c = x.champs[p.champ] || (x.champs[p.champ] = { g: 0, w: 0, k: 0, d: 0, a: 0, dmg: 0, gold: 0, hg: 0, hw: 0 });
            c.g++; if (p.win) c.w++;
            c.k += p.kills; c.d += p.deaths; c.a += p.assists; c.dmg += p.dmg; c.gold += p.gold;
            if (human) { c.hg++; if (p.win) c.hw++; }
            for (const id of new Set(p.items.filter(Boolean))) { const it = x.items[id] || (x.items[id] = { g: 0, w: 0 }); it.g++; if (p.win) it.w++; }
            if (p.keystone) { const ks = x.keystones[p.keystone] || (x.keystones[p.keystone] = { g: 0, w: 0 }); ks.g++; if (p.win) ks.w++; }
          }
        }); break;
        default:
      }
    },
    /** Last `days` days, newest first (for the admin page). */
    report(days = 14) {
      flush();
      const out = [];
      for (let i = 0; i < days; i++) {
        const d = day(Date.now() - i * 86400e3);
        const { _seen, ...data } = get(d).data;
        out.push(data);
      }
      return out;
    },
  };
}
