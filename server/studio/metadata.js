/* YouTube metadata for an episode and its shorts: titles, descriptions (with chapters),
   tags, the hook shown in a short's first seconds and the thumbnail text, in English plus
   YouTube `localizations` for the other languages (i18n.js). Built from the fight facts;
   gemini.js can improve the English ones (same shape). */
import { mulberry32, hashString } from '../../shared/rng.js';
import { name } from './commentary.js';
import { LANGS, TEAM, MOMENTS, SHORT_TITLES, EPISODE_TITLES, DESC, LANG_TAGS, fill, tr } from './i18n.js';

export const SITE = 'https://broadroads.com';
const BASE_TAGS = ['BroadRoads', 'MOBA', 'browser game', 'free to play', '5v5', 'gaming', 'highlights', 'teamfight', 'esports', 'game commentary', 'MOBA gameplay', 'browser MOBA', 'play free online'];
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
  return { best, moment: (MOMENTS[best] || MOMENTS.skirmish).en, star, starName: name(star), kills: kills.length, won, winner, at: f.start, champs: f.champs.map(name) };
}

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
const strip = s => s.replace(/[<>]/g, '');
const langsOf = langs => ['en', ...(langs || []).filter(l => l !== 'en' && LANGS[l])];

function vars(x, lang) {
  const hi = Math.max(x.won.blue, x.won.red), lo = Math.min(x.won.blue, x.won.red);
  return { star: x.starName, kills: x.kills, winner: TEAM[x.winner || 'none'][lang], won: lang === 'en' ? `${hi}-for-${lo}` : `${hi}-${lo}`, moment: tr(MOMENTS[x.best] || MOMENTS.skirmish, lang) };
}

/** Adds the "full match" link to a short's description (after its first line). */
export function withMainUrl(description, lang, url) {
  if (!url || description.includes(url)) return description;
  const lines = description.split('\n');
  lines.splice(1, 0, fill(tr(DESC.full, lang), { url }, lang));
  return lines.join('\n');
}

function shortDescription(f, x, lang) {
  const others = x.champs.filter(c => c !== x.starName).slice(0, 3).join(', ');
  return [
    fill(tr(DESC.shortFacts, lang), { ...vars(x, lang), others, time: mmss(f.start) }, lang),
    fill(tr(DESC.ctaShort, lang), { site: SITE }, lang),
    '',
    tr(DESC.disclosureShort, lang),
    '',
    '#Shorts #BroadRoads #MOBA #gaming',
  ].join('\n');
}

/** Metadata for one short: English plus `localizations` for the other languages. */
export function shortMeta(f, { seed, langs } = {}) {
  const x = fightFacts(f);
  const pick = pickFrom(`${seed}:${f.n}:short`);
  const tpl = pick(SHORT_TITLES[x.best] || SHORT_TITLES.default);
  const title = l => strip(clip(`${fill(tr(tpl, l), vars(x, l), l)} #Shorts`, 100));
  // Shown on screen by headless Chromium, which has no color emoji font.
  const hook = fill(pick(HOOKS[x.best] || HOOKS.default), vars(x, 'en')).replace(/\p{Extended_Pictographic}️?/gu, '').trim();
  const champTags = [...new Set(x.champs)].map(c => `${c} BroadRoads`);
  const localizations = {};
  for (const l of langsOf(langs).slice(1)) localizations[l] = { title: title(l), description: shortDescription(f, x, l) };
  const extraTags = langsOf(langs).slice(1).flatMap(l => LANG_TAGS[l] || []);
  return { title: title('en'), description: shortDescription(f, x, 'en'), tags: tagList([...champTags, x.moment.toLowerCase(), 'shorts', 'gaming shorts', ...extraTags]), hook, thumbText: x.moment, localizations };
}

/**
 * Metadata for the full episode, with chapters. chapters: [{ at, kind: 'intro'|'fight'|'outro',
 * n?, fight? }] (labels are written per language).
 */
export function episodeMeta({ fights, summary, chapters, seed, langs }) {
  const facts = fights.map(fightFacts);
  const top = [...facts].sort((a, b) => RANK.indexOf(a.best) - RANK.indexOf(b.best))[0];
  const pick = pickFrom(`${seed}:main`);
  const total = facts.reduce((a, x) => a + x.kills, 0);
  const n = fights.length;
  const tpl = pick(n === 1 ? EPISODE_TITLES.one : EPISODE_TITLES.many.filter(t => !t.minFights || n >= t.minFights));
  const champs = [...new Set(summary.players.map(p => p.name))];
  const lineup = team => summary.players.filter(p => p.team === team).map(p => p.name).join(', ');
  const build = lang => {
    const v = { ...vars(top, lang), total, n, more: n - 1 };
    const title = strip(clip(fill(tr(tpl, lang), v, lang), 100));
    const won = summary.winner ? fill(tr(DESC.won, lang), { team: TEAM[summary.winner][lang], a: Math.max(summary.kills.blue, summary.kills.red), b: Math.min(summary.kills.blue, summary.kills.red), min: Math.round(summary.duration / 60) }, lang) : '';
    const label = c => {
      if (c.label && !c.kind) return c.label;
      if (c.kind === 'intro') return tr(DESC.intro, lang);
      if (c.kind === 'outro') return tr(DESC.outro, lang);
      const x = facts[c.n - 1];
      return fill(tr(DESC.chapter, lang), { n: c.n, star: x.starName, moment: tr(MOMENTS[x.best] || MOMENTS.skirmish, lang), time: mmss(fights[c.n - 1].start) }, lang);
    };
    const description = [
      `${tr(n === 1 ? DESC.bestOne : DESC.bestMany, lang)} ${won}`.trim(),
      '',
      ...chapters.map(c => `${mmss(c.at)} ${label(c)}`),
      '',
      fill(tr(DESC.blue, lang), { list: lineup('blue') }, lang),
      fill(tr(DESC.red, lang), { list: lineup('red') }, lang),
      '',
      fill(tr(DESC.cta, lang), { site: SITE }, lang),
      '',
      tr(DESC.disclosure, lang),
      '',
      '#BroadRoads #MOBA #gaming',
    ].join('\n');
    return { title, description };
  };
  const localizations = {};
  for (const l of langsOf(langs).slice(1)) localizations[l] = build(l);
  const extraTags = langsOf(langs).slice(1).flatMap(l => LANG_TAGS[l] || []);
  return { ...build('en'), tags: tagList([...champs.map(c => `${c} BroadRoads`), ...facts.map(x => x.moment.toLowerCase()), ...extraTags]), thumbText: top.moment, thumbStar: top.star, localizations };
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
