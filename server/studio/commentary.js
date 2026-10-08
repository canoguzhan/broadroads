/* Play-by-play commentary for a fight: short caster lines anchored to match times.
   The built-in writer turns the fight's events (engages, ultimates, kills, multi-kills,
   objectives) into varied lines; when GEMINI_API_KEY is set, gemini.js can write them
   instead and this is the fallback. Lines carry an ElevenLabs v4 delivery tag ([excited]…)
   that the voice step speaks but never shows in captions. */
import { CHAMPIONS } from '../../shared/moba/champions.js';
import { mulberry32, hashString } from '../../shared/rng.js';
import { LINES, LEAD, TEAM, LANGS, fill } from './i18n.js';

export const name = c => CHAMPIONS[c]?.name || c;
const ability = (c, sl) => CHAMPIONS[c]?.abilities?.[sl]?.name || null;

function picker(seed) {
  const rnd = mulberry32(hashString(String(seed)));
  return list => Math.floor(rnd() * list.length);
}

const T = LINES;

const tagFor = kind => ({ open: '[intrigued]', engage: '[excited]', ult: '[excited]', flash: '[excited]', kill: '[excited]', killAssist: '[excited]', killTower: '[laughs]', lowSurvive: '[tense]', multi: '[shouting]', team_wipe: '[shouting]', first_strike: '[excited]', streak_end: '[shouting]', objective: '[excited]', close: '[excited]' }[kind] || '[excited]');

/** Builds the line list. ctx: { summary } from the simulation. Returns [{ at, text, kind, priority, maxDelay }]. */
export function writeCommentary(fight, ctx = {}) {
  const pick = picker(`${ctx.summary?.seed}:${fight.n}`);
  const ev = fight.events.filter(e => e.t >= fight.start - 0.5 && e.t <= fight.end + 1);
  const lines = [];
  // One template per line, filled in every language: the English one is spoken, the others
  // are its captions. vars.team is a team code; vars.lead a { team, w, l } or { n } score.
  const add = (at, kind, tpls, vars, priority, maxDelay = 2.2) => {
    const tpl = tpls[pick(tpls)];
    const text = {};
    for (const lang of Object.keys(LANGS)) {
      const v = { ...vars };
      if (vars.team) v.team = TEAM[vars.team]?.[lang] || '';
      if (vars.lead) v.lead = vars.lead.n !== undefined ? fill(LEAD.even[lang], vars.lead, lang) : fill(LEAD.ahead[lang], { ...vars.lead, team: TEAM[vars.lead.team][lang] }, lang);
      text[lang] = fill(tpl[lang] || tpl.en, v, lang);
    }
    const { en, ...i18n } = text;
    lines.push({ at: Math.round(at * 100) / 100, kind, text: `${tagFor(kind)} ${en}`, i18n, priority, maxDelay });
  };

  // Opening: who is around, and the score.
  const hits = ev.filter(e => e.e === 'hit');
  const early = [...new Set(hits.slice(0, 12).flatMap(e => [e.s, e.v]))];
  const a = early[0] || fight.champs[0], b = early.find(c => c !== a) || fight.champs[1] || a;
  const s = fight.before || { blue: 0, red: 0 };
  const lead = s.blue === s.red ? { n: s.blue } : { team: s.blue > s.red ? 'blue' : 'red', w: Math.max(s.blue, s.red), l: Math.min(s.blue, s.red) };
  add(fight.start + 0.3, 'open', T.open, { min: Math.floor(fight.start / 60), lead, a: name(a), b: name(b) }, 3, 1.5);

  // The engage: the first ultimate, blink or champion hit.
  const firstHit = hits[0];
  const firstUlt = ev.find(e => e.e === 'cast' && e.sl === 'r');
  if (firstHit && (!firstUlt || firstUlt.t - firstHit.t > 1.5)) add(firstHit.t, 'engage', T.engage, { c: name(firstHit.s) }, 2, 1.2);
  const ultsSaid = new Set();
  for (const e of ev) {
    if (e.e === 'cast' && e.sl === 'r' && !ultsSaid.has(e.c)) {
      ultsSaid.add(e.c);
      const ab = ability(e.c, 'r');
      if (ab) add(e.t, 'ult', T.ult, { c: name(e.c), ab }, 4, 1.4);
    }
    if (e.e === 'summ' && e.k === 'blink' && ultsSaid.size < 2) add(e.t, 'flash', T.flash, { c: name(e.c) }, 1, 0.8);
  }
  // Kills and announcer moments (a multi-kill line replaces the plain kill line it belongs to).
  const anns = ev.filter(e => e.e === 'ann');
  for (const k of ev.filter(e => e.e === 'kill')) {
    const multi = anns.find(x => /^multi\d$/.test(x.key) && Math.abs(x.t - k.t) < 0.2 && x.killer === k.k);
    if (multi) { add(k.t, 'multi', T[multi.key], { k: name(k.k) }, 9, 1.2); continue; }
    if (!k.k) add(k.t, 'killTower', T.killTower, { v: name(k.v) }, 5, 1.6);
    else if (k.a.length) add(k.t, 'killAssist', T.killAssist, { k: name(k.k), v: name(k.v), a: name(k.a[0]) }, 6, 1.8);
    else add(k.t, 'kill', T.kill, { k: name(k.k), v: name(k.v) }, 6, 1.8);
  }
  for (const x of anns) {
    const vars = { team: x.team || 'none', k: x.killer ? name(x.killer) : '' };
    if (x.key === 'team_wipe') add(x.t + 0.4, 'team_wipe', T.team_wipe, vars, 10, 2);
    else if (x.key === 'first_strike') add(x.t + 0.1, 'first_strike', T.first_strike, vars, 5, 2);
    else if (x.key === 'streak_end') add(x.t + 0.2, 'streak_end', T.streak_end, vars, 7, 2);
    else if (['wyrm', 'titan', 'tower', 'spire'].includes(x.key)) add(x.t, 'objective', T[x.key], vars, x.key === 'titan' || x.key === 'wyrm' ? 8 : 5, 2.2);
  }
  // A champion clinging to life (no kill right after).
  const kills = ev.filter(e => e.e === 'kill');
  const scare = hits.find(e => e.hp > 0 && e.hp < 12 && !kills.some(k => k.v === e.v && k.t >= e.t && k.t - e.t < 4));
  if (scare) add(scare.t, 'lowSurvive', T.lowSurvive, { c: name(scare.v) }, 2, 0.8);

  // The closer: the fight's result.
  const won = { blue: kills.filter(k => k.t <= fight.end && k.team === 'blue').length, red: kills.filter(k => k.t <= fight.end && k.team === 'red').length };
  const winner = won.blue === won.red ? null : won.blue > won.red ? 'blue' : 'red';
  const w = winner ? won[winner] : won.blue, l = winner ? won[winner === 'blue' ? 'red' : 'blue'] : won.red;
  const tpl = !winner ? T.closeEven : l === 0 && w >= 3 ? T.closeStomp : T.closeWin;
  const lastKill = kills.length ? kills[kills.length - 1].t : fight.end - 2;
  add(Math.max(lastKill + 1.6, fight.end - 1.5), 'close', tpl, { team: winner || undefined, w, l }, 8, 4);
  lines.sort((x, y) => x.at - y.at);
  return lines;
}

/** Strips delivery tags ([excited]) for captions and titles. */
export const spoken = text => text.replace(/\[[^\]]*\]\s*/g, '').trim();

/**
 * Places voiced lines on the timeline without overlaps: each starts at its moment or right
 * after the previous one; a line that would land too late is dropped unless it matters more
 * than what's already scheduled. lines need { at, dur, priority, maxDelay }. Returns kept lines with `start`.
 */
export function schedule(lines, { gap = 0.15, until = Infinity } = {}) {
  const sorted = [...lines].sort((a, b) => a.at - b.at || b.priority - a.priority);
  const kept = [];
  let free = -Infinity;
  for (const l of sorted) {
    const start = Math.max(l.at, free + gap);
    if (start - l.at > l.maxDelay) {
      // Too late: replace the previous line if this one matters more and it would fit in its slot.
      const prev = kept[kept.length - 1];
      if (prev && l.priority > prev.priority + 2 && l.at - prev.at < 2.5) {
        kept.pop();
        const s2 = Math.max(l.at, (kept.length ? kept[kept.length - 1].start + kept[kept.length - 1].dur : -Infinity) + gap);
        if (s2 - l.at <= l.maxDelay && s2 + l.dur <= until) { kept.push({ ...l, start: s2 }); free = s2 + l.dur; continue; }
        kept.push(prev);
      }
      continue;
    }
    if (start + l.dur > until) continue;
    kept.push({ ...l, start });
    free = start + l.dur;
  }
  return kept;
}
