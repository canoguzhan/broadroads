/* Closed captions (WebVTT) for the uploaded videos, one file per language. Timing comes from the
   spoken English line; the text is that line in the caption's language (commentary.js writes
   every line in all languages). A line without a translation falls back to English. */
import { spoken } from './commentary.js';

const MAX_LINE = 42; // characters per caption row; two rows per cue

const stamp = t => {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
};

/** Breaks text into rows of at most MAX_LINE characters (on spaces). */
export function wrap(text, max = MAX_LINE) {
  const rows = [];
  let cur = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (cur && (cur + ' ' + word).length > max) { rows.push(cur); cur = word; } else cur = cur ? `${cur} ${word}` : word;
  }
  if (cur) rows.push(cur);
  return rows;
}

/** The text of a voiced line in one language. */
export const lineText = (line, lang) => (lang === 'en' ? spoken(line.text) : line.i18n?.[lang] || spoken(line.text));

/**
 * cues: [{ start, end, text }] in seconds of the video. Long texts become several cues of two
 * rows, sharing the line's time by length. Returns the WebVTT file contents.
 */
export function toVtt(cues) {
  const out = ['WEBVTT', ''];
  for (const c of cues) {
    const rows = wrap(c.text);
    const groups = [];
    for (let i = 0; i < rows.length; i += 2) groups.push(rows.slice(i, i + 2));
    const total = groups.reduce((a, g) => a + g.join(' ').length, 0) || 1;
    let t = c.start;
    for (const g of groups) {
      const span = (c.end - c.start) * (g.join(' ').length / total);
      out.push(`${stamp(t)} --> ${stamp(t + span)}`, ...g, '');
      t += span;
    }
  }
  return out.join('\n');
}

/** Cues for lines placed on a video timeline: offset(line) → seconds where the line starts. */
export function cuesFor(lines, lang, offset) {
  return lines.map(l => ({ start: offset(l), end: offset(l) + l.dur, text: lineText(l, lang) })).filter(c => c.text && c.end > c.start);
}
