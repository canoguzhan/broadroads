/* One "episode": simulate a match → pick fights → write and voice the commentary → render
   every fight (landscape for the episode, portrait for its short) → mix and cut → metadata →
   upload to YouTube. Each stage saves its results in the episode folder, so a failed or
   interrupted episode resumes where it stopped. */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { Worker } from 'node:worker_threads';
import { writeCommentary, schedule, spoken } from './commentary.js';
import { Voice, captionChunks } from './voice.js';
import { renderFight, SIZES } from './render.js';
import { mixFight, mux, cardClip, cardAudio, concat, card, durationOf } from './edit.js';
import { shortMeta, episodeMeta, fightFacts, tagList, withMainUrl } from './metadata.js';
import { claudeCommentary, claudeMetadata, claudeTranslate } from './claude.js';
import { isUploadLimit } from './youtube.js';
import { CARDS, NUMBER_WORDS, LANGS, EXTRA_LANGS, fill, tr } from './i18n.js';
import { toVtt, cuesFor } from './captions.js';

export const STAGES = ['simulate', 'script', 'render', 'edit', 'upload'];
const SHORT_MAX = 58;
const INTRO = 4.2, OUTRO = 5.5;

export class Episode {
  constructor(dir, data) { this.dir = dir; this.data = data; }

  static create(root, settings) {
    const id = `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 7)}`;
    const dir = path.join(root, id);
    fs.mkdirSync(path.join(dir, 'replays'), { recursive: true });
    const ep = new Episode(dir, { id, seed: (Math.random() * 2 ** 31) | 0, createdAt: Date.now(), status: 'queued', stage: null, progress: null, error: null, log: [], settings: { ...settings }, fights: [], uploads: {} });
    ep.save();
    return ep;
  }

  static load(dir) { return new Episode(dir, JSON.parse(fs.readFileSync(path.join(dir, 'episode.json'), 'utf8'))); }

  save() {
    const tmp = path.join(this.dir, 'episode.json.tmp');
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 1));
    fs.renameSync(tmp, path.join(this.dir, 'episode.json'));
  }

  file(name) { return path.join(this.dir, name); }
  log(msg) { this.data.log.push({ at: Date.now(), msg }); if (this.data.log.length > 400) this.data.log.splice(0, 100); this.save(); }
  progress(p) { this.data.progress = p; this.save(); }
}

/** Everything the pipeline needs from the studio (config, services). */
export class Pipeline {
  constructor({ root, staticDir, host, voiceCache, musicDir, youtube, env, log = console, uploadGate = null }) {
    Object.assign(this, { root, staticDir, host, voiceCache, musicDir, youtube, env, logger: log, uploadGate });
    this.manifest = JSON.parse(fs.readFileSync(path.join(staticDir, 'sfx', 'manifest.json'), 'utf8'));
  }

  voice(settings) { return new Voice({ apiKey: this.env.ELEVENLABS_API_KEY, cacheDir: this.voiceCache, voiceId: settings.voiceId }); }

  /** Runs (or resumes) an episode up to `until` (a stage name) — upload only when wanted. */
  async run(ep, { signal, upload = ep.data.settings.autoUpload } = {}) {
    const d = ep.data;
    d.status = 'running'; d.error = null; ep.save();
    try {
      if (!d.summary) await this.simulate(ep, signal);
      if (!d.fights.length) throw new Error('The match had no fights worth a video (try again)');
      if (!d.scripted) await this.script(ep, signal);
      if (!d.rendered) await this.render(ep, signal);
      if (!d.edited) await this.edit(ep, signal);
      d.status = 'ready'; d.stage = null; d.progress = null; ep.save();
      ep.log('Videos ready for review.');
      if (upload) await this.upload(ep, signal);
    } catch (err) {
      d.status = signal?.aborted ? 'cancelled' : 'failed';
      d.error = String(err.message || err).slice(0, 1000);
      d.progress = null;
      ep.log(`✖ ${d.error}`);
      throw err;
    }
  }

  stage(ep, name) { ep.data.stage = name; ep.data.progress = null; ep.log(`▶ ${name}`); }

  async simulate(ep, signal) {
    this.stage(ep, 'simulate');
    const d = ep.data;
    const res = await new Promise((ok, fail) => {
      const w = new Worker(new URL('./simworker.js', import.meta.url), { workerData: { seed: d.seed, fights: d.settings.fights || 3 }, resourceLimits: { maxOldGenerationSizeMb: 1536 } });
      const abort = () => { w.terminate(); fail(new Error('cancelled')); };
      signal?.addEventListener('abort', abort, { once: true });
      w.on('message', m => { if (m.progress) ep.progress({ label: `Simulating · pass ${m.progress.pass} · minute ${m.progress.minute}` }); if (m.result) ok(m.result); });
      w.on('error', fail);
      w.on('exit', code => { signal?.removeEventListener('abort', abort); if (code) fail(new Error(`simulation worker exited ${code}`)); });
    });
    for (const f of res.fights) {
      const id = `${d.id.replace(/[^a-z0-9]/g, '')}f${f.n}`;
      const header = { ...f.replay.header, id };
      const gz = zlib.gzipSync([JSON.stringify(header), ...f.replay.lines].join('\n'));
      fs.writeFileSync(path.join(ep.dir, 'replays', `${id}.ndjson.gz`), gz);
      f.replayId = id;
      delete f.replay;
    }
    d.summary = res.summary;
    d.fights = res.fights;
    ep.log(`Match simulated: ${Math.round(res.summary.duration / 60)} min, ${res.summary.kills.blue}–${res.summary.kills.red}, ${res.fights.length} fights picked (${res.fights.map(f => `${f.kills} kills @${Math.floor(f.start / 60)}:${String(Math.floor(f.start % 60)).padStart(2, '0')}`).join(', ')}).`);
  }

  async script(ep, signal) {
    this.stage(ep, 'script');
    const d = ep.data;
    const voice = this.voice(d.settings);
    const useClaude = d.settings.useClaude && this.env.ANTHROPIC_API_KEY;
    for (const f of d.fights) {
      if (signal?.aborted) throw new Error('cancelled');
      ep.progress({ label: `Commentary for fight ${f.n}/${d.fights.length}` });
      let lines = null;
      if (useClaude) lines = await claudeCommentary(f, d.summary).catch(err => { ep.log(`Claude commentary failed (${err.message}); using the built-in writer.`); return null; });
      if (lines) {
        // Claude wrote English only: translate the lines for the subtitles (English captions otherwise).
        const extra = languages(d).slice(1);
        const t = await claudeTranslate(lines.map(l => spoken(l.text)), extra).catch(() => null);
        if (t) lines.forEach((l, i) => { l.i18n = Object.fromEntries(extra.map(x => [x, t[x][i]])); });
        else ep.log(`Fight ${f.n}: commentary not translated; its subtitles in other languages use English.`);
      }
      if (!lines) lines = writeCommentary(f, { summary: d.summary });
      const voiced = [];
      for (const l of lines) {
        const v = await voice.say(l.text);
        voiced.push({ ...l, dur: v.dur, file: v.file, words: v.words });
      }
      const limit = Math.min(f.replayEnd - 0.3, f.start + SHORT_MAX);
      const kept = schedule(voiced, { until: limit });
      f.lines = kept.map(l => ({ at: l.at, start: Math.round(l.start * 1000) / 1000, dur: l.dur, text: l.text, i18n: l.i18n || null, file: path.basename(l.file), words: l.words }));
      f.renderEnd = Math.round(Math.min(limit, Math.max(f.end, ...kept.map(l => l.start + l.dur + 0.8))) * 100) / 100;
      f.captions = { landscape: kept.flatMap(l => captionChunks(l.start, l.words, 6)), portrait: kept.flatMap(l => captionChunks(l.start, l.words, 3)) };
      const facts = fightFacts(f);
      f.facts = facts;
      f.thumbAt = Math.min(f.renderEnd - 0.5, (f.events.find(e => e.e === 'ann' && e.key === facts.best)?.t ?? f.events.filter(e => e.e === 'kill').at(-1)?.t ?? f.end - 2) + 0.35);
      let meta = shortMeta(f, { seed: d.seed, langs: languages(d) });
      if (useClaude) meta = { ...meta, ...((await claudeMetadata('short', { ...facts, lines: f.lines.map(l => spoken(l.text)) }, meta).catch(() => null)) || {}) };
      meta.tags = tagList(meta.tags);
      f.short = { meta };
      ep.log(`Fight ${f.n}: ${f.lines.length} lines voiced, ${Math.round(f.renderEnd - f.start)} s. Short: “${meta.title}”`);
    }
    // Intro and outro lines for the episode.
    const top = d.fights.map(f => f.facts).sort((a, b) => b.kills - a.kills)[0];
    const n = d.fights.length;
    const cardText = (key, lang) => fill(tr(CARDS[key], lang), {
      what: n === 1 ? tr(CARDS.introOne, lang) : fill(tr(CARDS.introMany, lang), { n, nWord: NUMBER_WORDS[n] || n }, lang), star: top.starName,
    }, lang);
    const both = key => ({ text: cardText(key, 'en'), i18n: Object.fromEntries(EXTRA_LANGS.map(l => [l, cardText(key, l)])) });
    const introT = both('intro'), outroT = both('outro');
    const intro = await voice.say(`[excited] ${introT.text}`);
    const outro = await voice.say(`[excited] ${outroT.text}`);
    d.cards = { intro: { file: path.basename(intro.file), dur: intro.dur, ...introT }, outro: { file: path.basename(outro.file), dur: outro.dur, ...outroT } };
    d.scripted = true;
    ep.save();
  }

  async render(ep, signal) {
    this.stage(ep, 'render');
    const d = ep.data;
    const fps = d.settings.fps || 30;
    const jobs = [];
    for (const f of d.fights) {
      for (const layout of ['landscape', 'portrait']) {
        const out = ep.file(`fight${f.n}-${layout}.video.mp4`);
        if (f.renders?.[layout] && fs.existsSync(out)) continue;
        jobs.push({ f, layout, out });
      }
    }
    const status = {};
    const report = () => ep.progress({ label: 'Rendering', parts: Object.values(status) });
    const work = async ({ f, layout, out }) => {
      const key = `${f.n}-${layout}`;
      status[key] = { name: `Fight ${f.n} · ${layout}`, pct: 0 };
      report();
      const r = await renderFight({
        hostUrl: this.host.url, replayId: f.replayId, layout, start: f.start, end: f.renderEnd, fps, quality: d.settings.quality || 'medium',
        captions: f.captions[layout], track: f.track, tag: layout === 'landscape' ? `Fight ${f.n} · ${f.facts.moment}` : '',
        hook: layout === 'portrait' ? f.short.meta.hook : '', hookUntil: layout === 'portrait' ? 2.6 : 0,
        outFile: out, thumbAt: f.thumbAt, thumbFile: layout === 'landscape' ? ep.file(`fight${f.n}-peak.jpg`) : null, signal,
        onProgress: p => { if (p.total) { status[key] = { name: `Fight ${f.n} · ${layout}`, pct: Math.round((p.frame / p.total) * 100), eta: p.etaSec }; report(); } if (p.warn) ep.log(`Render warning (${key}): ${p.warn}`); },
      });
      fs.writeFileSync(ep.file(`fight${f.n}-${layout}.sounds.json`), JSON.stringify(r.sounds));
      f.renders = { ...f.renders, [layout]: { frames: r.frames } };
      status[key].pct = 100;
      ep.log(`Rendered fight ${f.n} (${layout}, ${r.frames} frames).`);
    };
    // Two browsers at a time (each uses several cores in SwiftShader).
    const parallel = Math.max(1, Number(d.settings.renderWorkers) || 2);
    const queue = [...jobs];
    await Promise.all(Array.from({ length: parallel }, async () => { while (queue.length) await work(queue.shift()); }));
    d.rendered = true;
    ep.save();
  }

  async music() {
    // A hype bed generated once with ElevenLabs Music (cached); the game's lobby music otherwise.
    const bed = path.join(this.musicDir, 'studio-bed.mp3');
    if (!fs.existsSync(bed) && this.env.ELEVENLABS_API_KEY && !this.musicTried) {
      this.musicTried = true;
      try {
        const r = await fetch('https://api.elevenlabs.io/v1/music', {
          method: 'POST', headers: { 'xi-api-key': this.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
          body: JSON.stringify({ model_id: 'music_v1', respect_sections_durations: true, composition_plan: {
            positive_global_styles: ['epic hybrid orchestral', 'esports highlight reel', 'driving drums', 'energetic', 'instrumental', 'loopable'],
            negative_global_styles: ['vocals', 'lyrics', 'lo-fi', 'ambient', 'slow'],
            sections: [
              { section_name: 'Build', positive_local_styles: ['pulsing synth bass', 'taiko', 'rising strings'], negative_local_styles: [], duration_ms: 15000, lines: [] },
              { section_name: 'Fight', positive_local_styles: ['full drums', 'brass stabs', 'intense'], negative_local_styles: [], duration_ms: 30000, lines: [] },
              { section_name: 'Loop back', positive_local_styles: ['same groove, steady', 'ends on the downbeat for a seamless loop'], negative_local_styles: ['fade out'], duration_ms: 15000, lines: [] },
            ] } }),
        });
        if (r.ok) { fs.mkdirSync(this.musicDir, { recursive: true }); fs.writeFileSync(bed, Buffer.from(await r.arrayBuffer())); this.logger.log('studio: generated the music bed'); } else this.logger.warn('studio: music generation failed', r.status);
      } catch (err) { this.logger.warn('studio: music generation failed', err.message); }
    }
    return fs.existsSync(bed) ? bed : path.join(this.staticDir, 'sfx', 'music_lobby.mp3');
  }

  async edit(ep, signal) {
    this.stage(ep, 'edit');
    const d = ep.data;
    const fps = d.settings.fps || 30;
    const music = await this.music();
    const sfxDir = path.join(this.staticDir, 'sfx');
    const vfile = name => path.join(this.voiceCache, name);
    for (const f of d.fights) {
      if (signal?.aborted) throw new Error('cancelled');
      ep.progress({ label: `Mixing fight ${f.n}` });
      const seconds = f.renderEnd - f.start;
      const lines = f.lines.map(l => ({ file: vfile(l.file), start: l.start - f.start }));
      for (const layout of ['landscape', 'portrait']) {
        const sounds = JSON.parse(fs.readFileSync(ep.file(`fight${f.n}-${layout}.sounds.json`), 'utf8'));
        const wav = ep.file(`fight${f.n}-${layout}.wav`);
        await mixFight({ seconds, sounds, lines, sfxDir, manifest: this.manifest, music, file: wav });
        const out = layout === 'landscape' ? ep.file(`fight${f.n}.mp4`) : ep.file(`short${f.n}.mp4`);
        await mux({ video: ep.file(`fight${f.n}-${layout}.video.mp4`), audio: wav, out, fps, signal });
        fs.unlinkSync(wav);
      }
      f.short.file = `short${f.n}.mp4`;
    }
    // Cards: intro over the best fight's peak frame, outro over the last fight's.
    const best = [...d.fights].sort((a, b) => b.score - a.score)[0];
    const L = SIZES.landscape;
    ep.progress({ label: 'Cards and the episode cut' });
    const pre = d.fights.map(f => fightFacts(f));
    const draft = episodeMeta({ fights: d.fights, summary: d.summary, chapters: [], seed: d.seed });
    await card({ kind: 'intro', size: L, bgFile: ep.file(`fight${best.n}-peak.jpg`), kicker: 'BROADROADS HIGHLIGHTS', title: draft.thumbText, sub: `${d.fights.length} fight${d.fights.length === 1 ? '' : 's'} · ${pre.reduce((a, x) => a + x.kills, 0)} kills · one match`, file: ep.file('intro.jpg') });
    await card({ kind: 'outro', size: L, bgFile: ep.file(`fight${d.fights.at(-1).n}-peak.jpg`), kicker: 'THANKS FOR WATCHING', title: 'Play free in your browser', sub: 'Subscribe for daily fights', file: ep.file('outro.jpg') });
    const introDur = Math.max(INTRO, d.cards.intro.dur + 0.8), outroDur = Math.max(OUTRO, d.cards.outro.dur + 1);
    await cardAudio({ seconds: introDur, line: { file: vfile(d.cards.intro.file), start: 0.35 }, music, file: ep.file('intro.wav') });
    await cardAudio({ seconds: outroDur, line: { file: vfile(d.cards.outro.file), start: 0.4 }, music, file: ep.file('outro.wav') });
    await cardClip({ image: ep.file('intro.jpg'), audio: ep.file('intro.wav'), seconds: introDur, out: ep.file('intro.mp4'), fps, size: L, signal });
    await cardClip({ image: ep.file('outro.jpg'), audio: ep.file('outro.wav'), seconds: outroDur, out: ep.file('outro.mp4'), fps, size: L, signal });
    // Chapters follow the cut.
    const chapters = [{ at: 0, kind: 'intro' }];
    const timeline = { intro: 0.35, fights: {}, outro: 0 };
    let t = introDur;
    for (const f of d.fights) {
      chapters.push({ at: Math.round(t), kind: 'fight', n: f.n });
      timeline.fights[f.n] = t;
      t += await durationOf(ep.file(`fight${f.n}.mp4`));
    }
    chapters.push({ at: Math.round(t), kind: 'outro' });
    timeline.outro = t + 0.4;
    d.timeline = timeline;
    await concat({ parts: [ep.file('intro.mp4'), ...d.fights.map(f => ep.file(`fight${f.n}.mp4`)), ep.file('outro.mp4')], out: ep.file('episode.mp4'), fps, dir: ep.dir, signal });
    // Thumbnail: the best moment, huge text, the star's portrait.
    let meta = episodeMeta({ fights: d.fights, summary: d.summary, chapters, seed: d.seed, langs: languages(d) });
    const portrait = path.join(this.staticDir, 'portraits', `${meta.thumbStar}.webp`);
    await card({ kind: 'thumb', size: { width: 1280, height: 720 }, bgFile: ep.file(`fight${best.n}-peak.jpg`), title: meta.thumbText, kicker: 'BROADROADS', portraitFile: fs.existsSync(portrait) ? portrait : null, file: ep.file('thumb.jpg') });
    if (d.settings.useClaude && this.env.ANTHROPIC_API_KEY) {
      const chapterLines = meta.description.split('\n').filter(l => /^\d+:\d\d /.test(l));
      const better = await claudeMetadata('main', { summary: d.summary, fights: d.fights.map(f => f.facts) }, { ...meta, chapters: chapterLines }).catch(() => null);
      if (better) meta = { ...meta, ...better };
    }
    meta.tags = tagList(meta.tags);
    d.main = { file: 'episode.mp4', thumb: 'thumb.jpg', meta, duration: Math.round(await durationOf(ep.file('episode.mp4'))) };
    this.writeCaptions(ep);
    for (const n of ['intro.wav', 'outro.wav']) fs.rmSync(ep.file(n), { force: true });
    d.edited = true;
    ep.save();
    ep.log(`Episode cut: ${d.main.duration} s, ${d.fights.length} shorts. Title: “${meta.title}”`);
  }

  /**
   * Uploads what's missing. When the daily budget is spent or YouTube refuses with its upload
   * limit, the episode waits ('waiting') and the studio retries it once uploads free up.
   */
  async upload(ep, signal) {
    try {
      await this.uploadAll(ep, signal);
    } catch (err) {
      if (!err.defer && !isUploadLimit(err)) throw err;
      if (!err.defer) this.uploadGate?.limitHit(err);
      const d = ep.data;
      const until = this.uploadGate?.pausedUntil();
      d.status = 'waiting'; d.stage = null; d.progress = null;
      d.error = `Waiting for YouTube's daily upload limit${until ? ` (next try after ${new Date(until).toISOString().slice(0, 16).replace('T', ' ')} UTC)` : ''}. It uploads automatically.`;
      ep.log(err.defer ? `⏸ ${d.error}` : `⏸ YouTube refused: ${err.message}. ${d.error}`);
    }
  }

  /** Subtitle files (WebVTT) for the episode and each short, one per language. */
  writeCaptions(ep) {
    const d = ep.data;
    if (!d.timeline || !d.fights.every(f => f.lines)) return;
    const langs = languages(d);
    const files = { main: {}, shorts: {} };
    const vfileLine = (c, at) => ({ ...c, dur: c.dur, start: at });
    for (const lang of langs) {
      const cues = [
        ...cuesFor([vfileLine(d.cards.intro, d.timeline.intro)], lang, l => l.start),
        ...d.fights.flatMap(f => cuesFor(f.lines, lang, l => d.timeline.fights[f.n] + (l.start - f.start))),
        ...cuesFor([vfileLine(d.cards.outro, d.timeline.outro)], lang, l => l.start),
      ];
      fs.writeFileSync(ep.file(`episode.${lang}.vtt`), toVtt(cues));
      files.main[lang] = `episode.${lang}.vtt`;
      for (const f of d.fights) {
        fs.writeFileSync(ep.file(`short${f.n}.${lang}.vtt`), toVtt(cuesFor(f.lines, lang, l => l.start - f.start)));
        (files.shorts[f.n] = files.shorts[f.n] || {})[lang] = `short${f.n}.${lang}.vtt`;
      }
    }
    d.captions = files;
    ep.save();
  }

  /** Uploads the caption tracks still missing on already-uploaded videos (as the settings ask). */
  async uploadCaptions(ep) {
    const d = ep.data;
    const mode = d.settings.captionsFor || 'episode';
    if (mode === 'none' || !d.captions) return;
    if (!this.youtube.canCaption) {
      if (!d.captionScopeNoted) { d.captionScopeNoted = true; ep.log('Subtitles not added: reconnect YouTube on the studio page to allow captions, then press "Add subtitles".'); ep.save(); }
      return;
    }
    d.uploads.captions = d.uploads.captions || {};
    const targets = [];
    if (d.uploads.main) targets.push({ key: 'main', id: d.uploads.main.id, files: d.captions.main });
    if (mode === 'all') for (const f of d.fights) if (d.uploads.shorts?.[f.n]) targets.push({ key: `short${f.n}`, id: d.uploads.shorts[f.n].id, files: d.captions.shorts[f.n] || {} });
    for (const t of targets) {
      const done = d.uploads.captions[t.key] = d.uploads.captions[t.key] || [];
      for (const [lang, file] of Object.entries(t.files)) {
        if (done.includes(lang) || !fs.existsSync(ep.file(file))) continue;
        ep.progress({ label: `Subtitles: ${t.key} · ${LANGS[lang]?.name || lang}` });
        try {
          await this.youtube.caption(t.id, LANGS[lang]?.yt || lang, LANGS[lang]?.name || lang, fs.readFileSync(ep.file(file), 'utf8'));
          done.push(lang);
          ep.save();
        } catch (err) {
          if (isUploadLimit(err)) throw err; // quota: wait like video uploads do
          ep.log(`Subtitle track not added (${t.key}, ${lang}): ${err.message}`);
        }
      }
    }
    const count = Object.values(d.uploads.captions).reduce((a, l) => a + l.length, 0);
    if (count) ep.log(`Subtitles on YouTube: ${count} track${count === 1 ? '' : 's'}.`);
  }

  gate() {
    const wait = this.uploadGate?.check();
    if (wait) throw Object.assign(new Error(wait), { defer: true });
  }

  async uploadAll(ep, signal) {
    const d = ep.data;
    if (!this.youtube.connected) throw new Error('YouTube is not connected — connect it on the studio page, then press Upload.');
    this.stage(ep, 'upload');
    d.status = 'uploading'; ep.save();
    const privacy = d.settings.privacy || 'public';
    if (!d.uploads.main) {
      this.gate();
      ep.progress({ label: 'Uploading the episode', pct: 0 });
      const r = await this.youtube.upload(ep.file(d.main.file), { ...d.main.meta, localizations: localized(d.main.meta, d), privacy, synthetic: d.settings.synthetic }, { signal, onProgress: p => ep.progress({ label: 'Uploading the episode', pct: Math.round(p * 100) }) });
      d.uploads.main = { id: r.id, url: r.url, at: Date.now(), privacy: r.status?.privacyStatus || privacy };
      ep.log(`⬆ Episode uploaded: ${r.url} (${d.uploads.main.privacy})`);
      try { await this.youtube.thumbnail(r.id, ep.file(d.main.thumb)); ep.log('Thumbnail set.'); } catch (err) { ep.log(`Thumbnail not set: ${err.message} (custom thumbnails need a verified channel)`); }
      ep.save();
    }
    d.uploads.shorts = d.uploads.shorts || {};
    for (const f of d.fights) {
      if (d.uploads.shorts[f.n]) continue;
      this.gate();
      const url = d.uploads.main.url;
      const loc = Object.fromEntries(Object.entries(localized(f.short.meta, d) || {}).map(([l, m]) => [l, { ...m, description: withMainUrl(m.description, l === 'pt-BR' ? 'pt' : l, url) }]));
      const meta = { ...f.short.meta, description: withMainUrl(f.short.meta.description, 'en', url), localizations: loc };
      ep.progress({ label: `Uploading short ${f.n}`, pct: 0 });
      const r = await this.youtube.upload(ep.file(f.short.file), { ...meta, privacy, synthetic: d.settings.synthetic }, { signal, onProgress: p => ep.progress({ label: `Uploading short ${f.n}`, pct: Math.round(p * 100) }) });
      d.uploads.shorts[f.n] = { id: r.id, url: `https://youtube.com/shorts/${r.id}`, at: Date.now() };
      ep.log(`⬆ Short ${f.n} uploaded: https://youtube.com/shorts/${r.id}`);
      ep.save();
    }
    await this.uploadCaptions(ep);
    d.status = 'published'; d.stage = null; d.progress = null; d.publishedAt = Date.now();
    ep.save();
  }
}

/** The episode's languages: English plus the extra ones chosen in the settings. */
export function languages(d) {
  const extra = Array.isArray(d.settings.languages) ? d.settings.languages : EXTRA_LANGS;
  return ['en', ...extra.filter(l => EXTRA_LANGS.includes(l))];
}

/** YouTube `localizations` (keyed by YouTube language codes) for the chosen languages. */
function localized(meta, d) {
  const out = {};
  for (const l of languages(d).slice(1)) if (meta.localizations?.[l]) out[LANGS[l].yt] = meta.localizations[l];
  return Object.keys(out).length ? out : null;
}
