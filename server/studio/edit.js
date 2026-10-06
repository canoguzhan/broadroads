/* Video editing with ffmpeg: fight audio mixes, muxing, the intro/outro cards, the episode
   cut (intro → fights → outro) and the thumbnail. */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ffmpeg } from './tools.js';
import { decode, Mix, thinSounds, writeWav } from './mixer.js';
import { renderCard } from './render.js';

export function run(args, { signal } = {}) {
  return ffmpeg().then(ff => new Promise((ok, fail) => {
    const p = spawn(ff, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', d => { err += d; });
    const abort = () => p.kill('SIGKILL');
    signal?.addEventListener('abort', abort, { once: true });
    p.on('close', code => { signal?.removeEventListener('abort', abort); return code === 0 ? ok() : fail(new Error(`ffmpeg: ${err.slice(-500)}`)); });
  }));
}

/** Seconds of a media file (from ffmpeg's report; ffprobe isn't shipped). */
export async function durationOf(file) {
  const ff = await ffmpeg();
  return new Promise(ok => {
    const p = spawn(ff, ['-hide_banner', '-i', file], { stdio: ['ignore', 'ignore', 'pipe'] });
    let out = '';
    p.stderr.on('data', d => { out += d; });
    p.on('close', () => { const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(out); ok(m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0); });
  });
}

const VIDEO = fps => ['-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', String(fps)];
const AUDIO = ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2'];
const LOUD = 'loudnorm=I=-14:TP=-1.5:LRA=11';

/**
 * Mixes a fight's soundtrack: the game's own sounds (from the render's log), the commentary
 * and a music bed. lines: [{ file, start }] in seconds from the clip start.
 */
export async function mixFight({ seconds, sounds, lines, sfxDir, manifest, music, file }) {
  const ff = await ffmpeg();
  const mix = new Mix(seconds);
  for (const s of thinSounds(sounds)) {
    const entry = manifest[s.k];
    if (!entry) continue;
    const pcm = await decode(ff, path.join(sfxDir, entry.file)).catch(() => null);
    if (pcm) mix.add(pcm, s.t, { gain: s.v * 0.9, pan: s.p * 0.7, rate: s.r || 1, bus: 'sfx' });
  }
  if (music && fs.existsSync(music)) mix.add(await decode(ff, music), 0, { gain: 0.32, bus: 'music', loop: true, fadeIn: 1.2, until: seconds });
  for (const l of lines) mix.add(await decode(ff, l.file), l.start, { gain: 1.25, bus: 'voice' });
  writeWav(file, mix);
  return file;
}

export function mux({ video, audio, out, fps, signal }) {
  return run(['-i', video, '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-af', LOUD, ...AUDIO, '-shortest', '-movflags', '+faststart', out], { signal });
}

/** A still card with sound as a video segment (fades in and out). */
export async function cardClip({ image, audio, seconds, out, fps, size, signal }) {
  const fade = `fade=t=in:st=0:d=0.4,fade=t=out:st=${Math.max(0, seconds - 0.5)}:d=0.5`;
  const zoom = `scale=${size.width * 1.06}:-2,zoompan=z='min(zoom+0.0006,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.ceil(seconds * fps)}:s=${size.width}x${size.height}:fps=${fps}`;
  await run(['-loop', '1', '-framerate', String(fps), '-t', String(seconds), '-i', image, '-i', audio,
    '-filter_complex', `[0:v]${zoom},${fade},format=yuv420p[v];[1:a]apad,atrim=0:${seconds},${LOUD}[a]`, '-map', '[v]', '-map', '[a]',
    ...VIDEO(fps), ...AUDIO, '-t', String(seconds), '-movflags', '+faststart', out], { signal });
  return out;
}

/** Joins segments (all the same size and rate) into one video, re-encoded for clean joins. */
export async function concat({ parts, out, fps, dir, signal }) {
  const list = path.join(dir, `concat-${path.basename(out)}.txt`);
  fs.writeFileSync(list, parts.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
  await run(['-f', 'concat', '-safe', '0', '-i', list, ...VIDEO(fps), ...AUDIO, '-movflags', '+faststart', out], { signal });
  fs.unlinkSync(list);
  return out;
}

/** Audio for a card: the caster's line over a music sting. */
export async function cardAudio({ seconds, line, music, file }) {
  const ff = await ffmpeg();
  const mix = new Mix(seconds);
  if (music && fs.existsSync(music)) mix.add(await decode(ff, music), 0, { gain: 0.4, bus: 'music', loop: true, fadeIn: 0.3, until: seconds });
  if (line) mix.add(await decode(ff, line.file), line.start, { gain: 1.25, bus: 'voice' });
  writeWav(file, mix, { duckMusic: 0.45 });
  return file;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dataUrl = (file, type) => (file && fs.existsSync(file) ? `data:${type};base64,${fs.readFileSync(file).toString('base64')}` : '');

function cardHtml({ width, height, bg, kicker, title, sub, portrait, variant }) {
  const big = variant === 'thumb';
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Outfit:wght@600;800;900&display=swap" rel="stylesheet">
<style>
html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:#0b0912;font-family:Outfit,system-ui,sans-serif;color:#fff}
.bg{position:absolute;inset:-30px;background:url(${bg}) center/cover;filter:${big ? 'saturate(1.25) contrast(1.08)' : 'blur(14px) brightness(.45) saturate(1.2)'}}
.shade{position:absolute;inset:0;background:${big ? 'linear-gradient(90deg,rgba(8,6,14,.88) 0%,rgba(8,6,14,.55) 45%,rgba(8,6,14,0) 70%)' : 'radial-gradient(ellipse at center,rgba(0,0,0,0) 0%,rgba(0,0,0,.6) 100%)'}}
.wrap{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:${big ? 'flex-start' : 'center'};text-align:${big ? 'left' : 'center'};padding:0 ${Math.round(width * 0.06)}px;gap:${Math.round(height * 0.02)}px}
.kicker{font-family:Cinzel,serif;font-weight:900;letter-spacing:.2em;color:#f3d27a;font-size:${Math.round(Math.min(width, height) * 0.045)}px;text-shadow:0 3px 10px #000}
.title{font-weight:900;line-height:1.02;font-size:${Math.round(Math.min(width, height) * (big ? 0.15 : 0.085))}px;text-transform:uppercase;max-width:${big ? 60 : 90}%;-webkit-text-stroke:${big ? 4 : 2}px #000;paint-order:stroke fill;text-shadow:0 8px 24px rgba(0,0,0,.9);${big ? 'color:#fde047' : ''}}
.sub{font-weight:800;font-size:${Math.round(Math.min(width, height) * 0.04)}px;opacity:.95;text-shadow:0 3px 10px #000}
.portrait{position:absolute;right:-2%;bottom:-6%;height:112%;filter:drop-shadow(0 0 40px rgba(243,210,122,.55)) drop-shadow(0 20px 30px #000)}
.url{position:absolute;bottom:${Math.round(height * 0.05)}px;left:0;right:0;text-align:center;font-weight:800;letter-spacing:.08em;color:#f3d27a;font-size:${Math.round(Math.min(width, height) * 0.035)}px}
</style></head><body><div class="bg"></div><div class="shade"></div>
${portrait ? `<img class="portrait" src="${portrait}">` : ''}
<div class="wrap">${kicker ? `<div class="kicker">${esc(kicker)}</div>` : ''}<div class="title">${esc(title)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>
${variant === 'thumb' ? '' : '<div class="url">PLAY FREE · BROADROADS.COM</div>'}
</body></html>`;
}

/** Renders a card image. kind: intro | outro | thumb. */
export function card({ kind, size, bgFile, title, kicker, sub, portraitFile, file }) {
  const html = cardHtml({ ...size, bg: dataUrl(bgFile, 'image/jpeg'), title, kicker, sub, portrait: dataUrl(portraitFile, 'image/webp'), variant: kind });
  return renderCard(html, { ...size, file });
}
