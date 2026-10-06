/* Audio mixing in plain PCM: sounds are decoded once with ffmpeg (48 kHz stereo float) and
   summed into a buffer at their times with gain, pan and playback rate. The commentary ducks
   the music bed and the game sounds while the caster speaks. Output: a 16-bit WAV. */
import fs from 'node:fs';
import { spawn } from 'node:child_process';

export const RATE = 48000;
const cache = new Map();

export function decode(ff, file) {
  if (cache.has(file)) return cache.get(file);
  const p = new Promise((ok, fail) => {
    const proc = spawn(ff, ['-hide_banner', '-loglevel', 'error', '-i', file, '-f', 'f32le', '-ac', '2', '-ar', String(RATE), '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    let err = '';
    proc.stdout.on('data', d => chunks.push(d));
    proc.stderr.on('data', d => { err += d; });
    proc.on('close', code => {
      if (code !== 0) return fail(new Error(`decode ${file}: ${err.slice(-200)}`));
      const buf = Buffer.concat(chunks);
      ok(new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4)));
    });
  });
  cache.set(file, p);
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return p;
}

export class Mix {
  constructor(seconds) {
    this.frames = Math.ceil(seconds * RATE);
    this.bus = { sfx: new Float32Array(this.frames * 2), music: new Float32Array(this.frames * 2), voice: new Float32Array(this.frames * 2) };
  }

  /** Adds stereo PCM at a time (seconds). opts: gain, pan (-1..1), rate, bus, fadeIn, fadeOut, loop (fill to end). */
  add(pcm, at, { gain = 1, pan = 0, rate = 1, bus = 'sfx', loop = false, fadeIn = 0, fadeOut = 0, until = Infinity } = {}) {
    const out = this.bus[bus];
    const start = Math.round(at * RATE);
    const srcFrames = pcm.length / 2;
    if (!srcFrames) return;
    // Equal-power pan.
    const a = (Math.max(-1, Math.min(1, pan)) + 1) * Math.PI / 4;
    const gl = gain * Math.cos(a) * Math.SQRT2, gr = gain * Math.sin(a) * Math.SQRT2;
    const len = loop ? Math.min(this.frames, Math.round(until * RATE)) - start : Math.floor(srcFrames / rate);
    const fi = fadeIn * RATE, fo = fadeOut * RATE;
    for (let i = 0; i < len; i++) {
      const o = start + i;
      if (o < 0) continue;
      if (o >= this.frames) break;
      let pos = i * rate;
      if (loop) pos %= srcFrames;
      const j = Math.floor(pos), f = pos - j;
      const j2 = Math.min(srcFrames - 1, j + 1);
      const l = pcm[j * 2] * (1 - f) + pcm[j2 * 2] * f;
      const r = pcm[j * 2 + 1] * (1 - f) + pcm[j2 * 2 + 1] * f;
      let env = 1;
      if (fi && i < fi) env = i / fi;
      if (fo && len - i < fo) env = Math.min(env, (len - i) / fo);
      out[o * 2] += l * gl * env;
      out[o * 2 + 1] += r * gr * env;
    }
  }

  /** Sums the buses with ducking under the voice and a soft limiter; returns a WAV buffer. */
  master({ duckMusic = 0.35, duckSfx = 0.6, fadeOut = 0.6 } = {}) {
    const { sfx, music, voice } = this.bus;
    const n = this.frames;
    // Voice envelope (fast attack, slow release) drives the ducking.
    const env = new Float32Array(n);
    let e = 0;
    const att = 1 - Math.exp(-1 / (0.02 * RATE)), rel = 1 - Math.exp(-1 / (0.35 * RATE));
    for (let i = 0; i < n; i++) {
      const v = Math.max(Math.abs(voice[i * 2]), Math.abs(voice[i * 2 + 1])) > 0.01 ? 1 : 0;
      e += (v - e) * (v > e ? att : rel);
      env[i] = e;
    }
    const out = Buffer.alloc(44 + n * 4);
    const fo = fadeOut * RATE;
    for (let i = 0; i < n; i++) {
      const dm = 1 - (1 - duckMusic) * env[i], ds = 1 - (1 - duckSfx) * env[i];
      const fade = fo && n - i < fo ? (n - i) / fo : 1;
      for (let c = 0; c < 2; c++) {
        let x = (sfx[i * 2 + c] * ds + music[i * 2 + c] * dm + voice[i * 2 + c]) * fade;
        // Soft knee limiter above 0.8.
        const ax = Math.abs(x);
        if (ax > 0.8) x = Math.sign(x) * (0.8 + 0.2 * Math.tanh((ax - 0.8) / 0.2));
        out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x)) * 32767), 44 + (i * 2 + c) * 2);
      }
    }
    out.write('RIFF', 0); out.writeUInt32LE(36 + n * 4, 4); out.write('WAVE', 8); out.write('fmt ', 12);
    out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22); out.writeUInt32LE(RATE, 24);
    out.writeUInt32LE(RATE * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(n * 4, 40);
    return out;
  }
}

/** Game sounds worth keeping: drop near-silent ones and cap dense spam (e.g. 40 hits in a second). */
export function thinSounds(sounds, { maxPerSecond = 14, minVol = 0.02 } = {}) {
  const per = new Map();
  return sounds.filter(s => {
    if (s.v < minVol) return false;
    const sec = Math.floor(s.t);
    const n = per.get(sec) || 0;
    if (n >= maxPerSecond && s.v < 0.5) return false;
    per.set(sec, n + 1);
    return true;
  });
}

export const writeWav = (file, mix, opts) => fs.writeFileSync(file, mix.master(opts));
