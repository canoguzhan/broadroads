/* YouTube metadata for an episode and its shorts: titles, descriptions (with chapters),
   tags, the hook shown in a short's first seconds and the thumbnail text. Built from the fight
   facts; claude.js can replace these with model-written ones (same shape). */
import { mulberry32, hashString } from '../../shared/rng.js';
import { name } from './commentary.js';

export const SITE = 'https://broadroads.com';
const BASE_TAGS = ['BroadRoads', 'MOBA', 'browser game', 'free to play', '5v5', 'gaming', 'highlights', 'teamfight', 'esports', 'game commentary', 'MOBA gameplay', 'browser MOBA', 'play free online'];
const BIG = { multi5: 'TOTAL TAKEDOWN', multi4: 'QUADRA TAKEDOWN', multi3: 'TRIPLE TAKEDOWN', team_wipe: 'TEAM WIPE', multi2: 'DOUBLE TAKEDOWN', titan: 'ABYSS TITAN FIGHT', wyrm: 'EMBER WYRM FIGHT', streak_end: 'SHUTDOWN', spire: 'SPIRE SIEGE', tower: 'TOWER DIVE', first_strike: 'FIRST BLOOD', skirmish: 'TEAMFIGHT', pick: 'OUTPLAYED' };
const RANK = ['multi5', 'multi4', 'multi3', 'team_wipe', 'titan', 'multi2', 'wyrm', 'streak_end', 'spire', 'tower', 'first_strike', 'skirmish', 'pick'];

const clip = (s, n) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);
const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** The facts a title can lean on: the star, the moment, the scoreline of the fight. */
export function fightFacts(f) {
  const anns = f.events.filter(e => e.e === 'ann');
  const kills = f.events.filter(e => e.e === 'kill' && e.t <= f.end);
  const best = RANK.find(k => anns.some(a => a.key === k)) || f.best || 'skirmish';
  const star = anns.find(a => a.key === best)?.killer || (() => {
    const c = new Map();
    for (const k of kills) if (k.k) c.set(k.k, (c.get(k.k) || 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || f.champs[0];
  })();
  const won = { blue: kills.filter(k => k.team === 'blue').length, red: kills.filter(k => k.team === 'red').length };
  const winner = won.blue === won.red ? null : won.blue > won.red ? 'blue' : 'red';
  return { best, moment: BIG[best] || 'TEAMFIGHT', star, starName: name(star), kills: kills.length, won, winner, at: f.start, champs: f.champs.map(name) };
}

const TITLES = {
  multi5: ['{star} gets a TOTAL TAKEDOWN 😱', 'This {star} play is UNREAL (all 5!)', 'FIVE for {star}?! Insane BroadRoads teamfight'],
  multi4: ['{star} with a QUADRA in this teamfight 🔥', '4 kills in seconds — {star} goes off', 'This {star} quadra is filthy'],
  multi3: ['{star} TRIPLE TAKEDOWN — nobody survives', 'Triple kill {star} turns the whole fight', '{star} just deleted three people 💀'],
  team_wipe: ['TEAM WIPE! {winner} leaves nobody standing', 'They all died. Every single one.', 'The cleanest ACE you\'ll see today'],
  titan: ['The Abyss Titan fight that decided everything', 'Titan fight goes horribly wrong 😳'],
  wyrm: ['Ember Wyrm fight turns into chaos', 'They fought over the Wyrm… and this happened'],
  multi2: ['{star} double takedown out of nowhere', '{star} wins the 2v2 like it\'s nothing', 'Did {star} just do that?!'],
  streak_end: ['SHUTDOWN! {star} ends the streak', 'That streak was not going to last…'],
  default: ['This {kills}-kill teamfight is pure chaos', '{star} goes all in and THIS happens', 'Wait for the end of this fight 😳', '{won} teamfight — who wins?'],
};
const HOOKS = {
  multi5: ['Watch {star} take ALL FIVE', 'wait for it… 5 kills'], multi4: ['{star} is about to go OFF', 'count the kills 👀'],
  multi3: ['{star} is about to delete 3 people', 'wait for the triple 💀'], team_wipe: ['nobody survives this', 'watch the whole team vanish'],
  titan: ['the titan fight from hell', 'who gets the titan?'], wyrm: ['wyrm fight goes wrong', 'who steals the wyrm?'],
  multi2: ['{star} makes it look easy', 'watch {star} here'], default: ['wait for the end 😳', 'this fight is CHAOS', 'who wins this?'],
};

function pickFrom(seed) {
  const rnd = mulberry32(hashString(String(seed)));
  return list => list[Math.floor(rnd() * list.length)];
}
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');

function vars(x) {
  return { star: x.starName, kills: x.kills, winner: x.winner ? (x.winner === 'blue' ? 'Blue' : 'Red') : 'one team', won: `${Math.max(x.won.blue, x.won.red)}-for-${Math.min(x.won.blue, x.won.red)}` };
}

/** Metadata for one short. */
export function shortMeta(f, { seed, mainUrl } = {}) {
  const x = fightFacts(f);
  const pick = pickFrom(`${seed}:${f.n}:short`);
  const title = clip(`${fill(pick(TITLES[x.best] || TITLES.default), vars(x))} #Shorts`, 100);
  // Shown on screen by headless Chromium, which has no color emoji font.
  const hook = fill(pick(HOOKS[x.best] || HOOKS.default), vars(x)).replace(/\p{Extended_Pictographic}\uFE0F?/gu, '').trim();
  const champTags = [...new Set(x.champs)].map(c => `${c} BroadRoads`);
  const description = [
    `${x.moment} — ${x.starName} and ${x.champs.filter(c => c !== x.starName).slice(0, 3).join(', ')} in a ${x.kills}-kill fight at ${mmss(f.start)}.`,
    mainUrl ? `Full match highlights: ${mainUrl}` : '',
    `Play BroadRoads free in your browser: ${SITE}`,
    '',
    'Commentary voiced with AI (ElevenLabs) over real BroadRoads gameplay (bot match).',
    '',
    '#Shorts #BroadRoads #MOBA #gaming',
  ].filter((l, i, a) => l || a[i - 1]).join('\n');
  return { title, description, tags: tagList([...champTags, x.moment.toLowerCase(), 'shorts', 'gaming shorts']), hook, thumbText: x.moment };
}

/** Metadata for the full episode (all fights), with chapters. */
export function episodeMeta({ fights, summary, chapters, seed }) {
  const facts = fights.map(fightFacts);
  const top = [...facts].sort((a, b) => RANK.indexOf(a.best) - RANK.indexOf(b.best))[0];
  const pick = pickFrom(`${seed}:main`);
  const total = facts.reduce((a, x) => a + x.kills, 0);
  const n = fights.length;
  const t = pick(n === 1 ? [
    `${top.starName}'s ${top.moment.toLowerCase()} — ${total}-kill BroadRoads fight`,
    `${top.moment}! ${top.starName} takes over this BroadRoads teamfight`,
    `This BroadRoads teamfight had EVERYTHING (${top.moment.toLowerCase()})`,
  ] : [
    `${top.starName}'s ${top.moment.toLowerCase()} + ${n - 1} more insane fight${n > 2 ? 's' : ''} | BroadRoads`,
    `${top.moment}! ${n} wild teamfights from one BroadRoads match`,
    `${total} kills, ${n} fights, one ${top.moment.toLowerCase()} — BroadRoads highlights`,
    `This BroadRoads match had EVERYTHING (${top.moment.toLowerCase()})`,
  ]);
  const winner = summary.winner ? `${summary.winner === 'blue' ? 'Blue' : 'Red'} won ${Math.max(summary.kills.blue, summary.kills.red)}–${Math.min(summary.kills.blue, summary.kills.red)} in ${Math.round(summary.duration / 60)} minutes.` : '';
  const lineup = team => summary.players.filter(p => p.team === team).map(p => p.name).join(', ');
  const description = [
    `${n === 1 ? 'The best fight' : 'The best fights'} from one BroadRoads 5v5 match, with live commentary. ${winner}`,
    '',
    ...chapters.map(c => `${mmss(c.at)} ${c.label}`),
    '',
    `🔵 Blue: ${lineup('blue')}`,
    `🔴 Red: ${lineup('red')}`,
    '',
    `▶ Play BroadRoads free in your browser — no download: ${SITE}`,
    '',
    'Gameplay is a real BroadRoads match between AI-controlled champions, recorded from the in-game spectator. Commentary is voiced with AI (ElevenLabs).',
    '',
    '#BroadRoads #MOBA #gaming',
  ].join('\n');
  const champs = [...new Set(summary.players.map(p => p.name))];
  return { title: clip(t, 100), description, tags: tagList([...champs.map(c => `${c} BroadRoads`), ...facts.map(x => x.moment.toLowerCase())]), thumbText: top.moment, thumbStar: top.star };
}

/** YouTube allows 500 characters of tags in total. */
export function tagList(extra) {
  const out = [];
  let len = 0;
  for (const t of [...BASE_TAGS, ...extra]) {
    const tag = t.replace(/[<>,]/g, '').trim();
    if (!tag || out.some(o => o.toLowerCase() === tag.toLowerCase())) continue;
    const cost = tag.length + (tag.includes(' ') ? 2 : 0) + (out.length ? 1 : 0);
    if (len + cost > 480) break;
    out.push(tag);
    len += cost;
  }
  return out;
}
