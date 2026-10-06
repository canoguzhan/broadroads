/* Optional: Claude writes the commentary and the YouTube metadata (when ANTHROPIC_API_KEY is
   set and the studio setting is on). Every answer is validated and anything unusable falls back
   to the built-in templates, so the pipeline never depends on it. */
import { anthropic } from './tools.js';
import { CHAMPIONS } from '../../shared/moba/champions.js';

const MODEL = 'claude-opus-5-5';

let client = null;
async function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) { const Anthropic = await anthropic(); client = new Anthropic(); }
  return client;
}

async function ask(system, user, schema) {
  const c = await getClient();
  if (!c) return null;
  const res = await c.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content: user }],
  });
  if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') return null;
  const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
  try { return JSON.parse(text); } catch { return null; }
}

const champInfo = ids => Object.fromEntries([...new Set(ids)].filter(c => CHAMPIONS[c]).map(c => [c, { name: CHAMPIONS[c].name, title: CHAMPIONS[c].title, role: CHAMPIONS[c].role, ultimate: CHAMPIONS[c].abilities.r.name }]));

const CASTER = `You are the play-by-play caster for BroadRoads, a free 5v5 browser MOBA, voicing YouTube highlight videos.
Write short, punchy, hype lines like a top esports caster: react to what happens the moment it happens, name champions (never player names), call ultimates by name, build tension before the fight and land a verdict after it.
Each line is spoken by an ElevenLabs v4 voice: start it with one delivery tag in square brackets such as [excited], [shouting], [tense], [intrigued] or [laughs]. Keep lines to 3–12 words except the opener (up to 16). The caster speaks about 2.5 words per second, so leave room: lines usually sit 2+ seconds apart and must not describe events before they happen.
Only describe what the event log shows. No emojis, no hashtags, no profanity.`;

/** Commentary lines for a fight, or null. Lines: [{ at, text, priority }]. */
export async function claudeCommentary(fight, summary) {
  const events = fight.events
    .filter(e => e.e !== 'hit' || e.hp < 25)
    .map(e => ({ ...e, t: Math.round((e.t - fight.start) * 10) / 10 }))
    .slice(0, 160);
  const out = await ask(CASTER, JSON.stringify({
    task: 'Write the commentary for this fight. Times are seconds from the start of the clip.',
    clipLength: Math.round(fight.end - fight.start + 4),
    matchTimeAtStart: `${Math.floor(fight.start / 60)}:${String(Math.floor(fight.start % 60)).padStart(2, '0')}`,
    killsBefore: fight.before,
    champions: champInfo(fight.champs),
    events,
    eventKey: { hit: 'low-health hit (hp = victim % health after the hit)', kill: 'k killed v (a = assists, team = team that got the kill)', cast: 'ability cast, sl r = ultimate', summ: 'summoner spell', ann: 'announcer moment', structure: 'structure destroyed' },
  }), {
    type: 'object', additionalProperties: false, required: ['lines'],
    properties: { lines: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['at', 'text', 'priority'], properties: { at: { type: 'number' }, text: { type: 'string' }, priority: { type: 'integer' } } } } },
  });
  if (!out?.lines?.length) return null;
  const len = fight.end - fight.start + 6;
  const lines = out.lines
    .filter(l => typeof l.text === 'string' && l.text.length > 3 && l.text.length < 140 && l.at >= 0 && l.at < len)
    .map(l => ({ at: Math.round((fight.start + l.at) * 100) / 100, text: /^\[/.test(l.text) ? l.text : `[excited] ${l.text}`, kind: 'claude', priority: Math.max(1, Math.min(10, l.priority | 0)), maxDelay: 2 }));
  return lines.length >= 3 ? lines.sort((a, b) => a.at - b.at) : null;
}

const META_SYS = `You write YouTube titles, descriptions and tags for BroadRoads, a free 5v5 browser MOBA (https://broadroads.com).
Titles: curiosity and energy, under 70 characters, one emoji at most, no clickbait that the video doesn't deliver, no ALL-CAPS titles (a CAPS word or two is fine).
Descriptions: 2–4 short lines about what happens, then the call to action to play free at https://broadroads.com. Keep any chapter lines you are given exactly as they are.
Always keep the disclosure that the gameplay is an AI-controlled bot match and the commentary is AI-voiced.`;

/** Improves template metadata ({ title, description, tags, hook? }) or returns null. */
export async function claudeMetadata(kind, facts, draft) {
  const out = await ask(META_SYS, JSON.stringify({ kind, facts, draft, rules: kind === 'short' ? 'Vertical YouTube Short: the title must end with #Shorts; hook = 2–6 words shown on screen in the first 2 seconds.' : 'Long-form highlights video: keep the chapter list from the draft description verbatim.' }), {
    type: 'object', additionalProperties: false, required: ['title', 'description', 'tags', 'hook'],
    properties: { title: { type: 'string' }, description: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, hook: { type: 'string' } },
  });
  if (!out?.title || out.title.length > 100 || !out.description) return null;
  if (kind === 'short' && !/#shorts/i.test(out.title + out.description)) out.title = `${out.title.slice(0, 91)} #Shorts`;
  if (kind === 'main' && draft.chapters && !draft.chapters.every(c => out.description.includes(c))) return null;
  if (!out.description.includes('broadroads.com')) out.description += `\n\n▶ Play free: https://broadroads.com`;
  return { title: out.title, description: out.description.slice(0, 4900), tags: out.tags.slice(0, 30), hook: out.hook?.slice(0, 40) || draft.hook };
}
