/* ElevenLabs voice for the commentator: text-to-speech with character timestamps, turned
   into word timings for the burned-in captions. Results are cached by text + voice. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DEFAULT_VOICE = 'IKne3meq5aSn9XLyUdCD'; // "Charlie — Deep, Confident, Energetic"
const API = 'https://api.elevenlabs.io';

/**
 * Word timings from ElevenLabs' character alignment, skipping delivery tags ([excited]).
 * Exported for tests. Returns [{ w, s, e }] in seconds from the start of the clip.
 */
export function wordsFromAlignment(al) {
  const chars = al?.characters || [];
  const st = al?.character_start_times_seconds || [];
  const en = al?.character_end_times_seconds || [];
  const words = [];
  let cur = null, inTag = false;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === '[') { inTag = true; continue; }
    if (inTag) { if (ch === ']') inTag = false; continue; }
    if (/\s/.test(ch)) { if (cur) { words.push(cur); cur = null; } continue; }
    if (!cur) cur = { w: '', s: st[i], e: en[i] };
    cur.w += ch;
    cur.e = en[i];
  }
  if (cur) words.push(cur);
  return words.filter(w => /[\p{L}\p{N}]/u.test(w.w)).map(w => ({ w: w.w, s: Math.round(w.s * 1000) / 1000, e: Math.round(w.e * 1000) / 1000 }));
}

export class Voice {
  constructor({ apiKey, cacheDir, voiceId = DEFAULT_VOICE, model = 'eleven_v4', fetchImpl = fetch }) {
    this.apiKey = apiKey;
    this.cacheDir = cacheDir;
    this.voiceId = voiceId || DEFAULT_VOICE;
    this.model = model;
    this.fetch = fetchImpl;
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  /** Speaks a line → { file (mp3), words, dur }. */
  async say(text, { style = 0.55 } = {}) {
    if (!this.apiKey) throw new Error('ELEVENLABS_API_KEY is not set');
    const key = crypto.createHash('sha256').update(`${this.voiceId}|${this.model}|${style}|${text}`).digest('hex').slice(0, 24);
    const mp3 = path.join(this.cacheDir, `${key}.mp3`);
    const meta = path.join(this.cacheDir, `${key}.json`);
    if (fs.existsSync(mp3) && fs.existsSync(meta)) return { file: mp3, ...JSON.parse(fs.readFileSync(meta, 'utf8')) };
    let res, lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await this.fetch(`${API}/v1/text-to-speech/${this.voiceId}/with-timestamps?output_format=mp3_44100_192`, {
        method: 'POST',
        headers: { 'xi-api-key': this.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model_id: this.model, voice_settings: { stability: 0.4, similarity_boost: 0.8, style, use_speaker_boost: true } }),
      });
      if (res.ok) break;
      lastErr = `${res.status} ${(await res.text()).slice(0, 300)}`;
      if (res.status !== 429 && res.status < 500) break;
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
    if (!res.ok) throw new Error(`ElevenLabs TTS failed: ${lastErr}`);
    const j = await res.json();
    const audio = Buffer.from(j.audio_base64, 'base64');
    const al = j.alignment || j.normalized_alignment;
    const words = wordsFromAlignment(al);
    const ends = al?.character_end_times_seconds || [];
    const dur = Math.round((ends.length ? ends[ends.length - 1] : words.at(-1)?.e || 1) * 1000) / 1000;
    fs.writeFileSync(mp3, audio);
    fs.writeFileSync(meta, JSON.stringify({ words, dur, text }));
    return { file: mp3, words, dur, text };
  }

  async voices() {
    const r = await this.fetch(`${API}/v1/voices`, { headers: { 'xi-api-key': this.apiKey } });
    if (!r.ok) throw new Error(`ElevenLabs voices: ${r.status}`);
    return (await r.json()).voices.map(v => ({ id: v.voice_id, name: v.name, category: v.category }));
  }
}

/**
 * Groups spoken words into caption chunks (a few words each, broken at punctuation),
 * offset to match time. Returns [{ start, end, words: [{ w, s, e }] }].
 */
export function captionChunks(lineStart, words, maxWords = 4) {
  const chunks = [];
  let cur = [];
  const flush = () => { if (cur.length) chunks.push({ start: cur[0].s, end: cur[cur.length - 1].e, words: cur }); cur = []; };
  for (const w of words) {
    cur.push({ w: w.w, s: Math.round((lineStart + w.s) * 1000) / 1000, e: Math.round((lineStart + w.e) * 1000) / 1000 });
    if (cur.length >= maxWords || /[.!?,—]$/.test(w.w)) flush();
  }
  flush();
  // Hold each chunk until the next starts (no flicker between words of one sentence).
  for (let i = 0; i < chunks.length - 1; i++) if (chunks[i + 1].start - chunks[i].end < 0.6) chunks[i].end = chunks[i + 1].start - 0.01;
  return chunks;
}
