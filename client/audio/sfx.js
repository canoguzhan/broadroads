/* Audio engine for the sound pack in /sfx (generated with ElevenLabs, see
   scripts/generate-audio.mjs): lazy-loaded buffers, positional effects,
   a prioritized announcer queue and crossfaded music loops. */

const BASE = `${import.meta.env.BASE_URL || '/'}sfx/`;
const HEAR_RANGE = 24;

class Sfx {
  constructor() {
    this.ctx = null;
    this.manifest = null;
    this.buffers = new Map();
    this.loading = new Map();
    this.last = new Map();
    this.volume = 0.6;
    this.musicVolume = 0.4;
    this.listener = null;
    this.voiceQueue = [];
    this.voicePlaying = false;
    this.music = null;
    this.wantMusic = null;
    this.manifestPromise = fetch(`${BASE}manifest.json`).then(r => (r.ok ? r.json() : {})).catch(() => ({})).then(m => { this.manifest = m; return m; });
  }

  /** Must be called from a user gesture (browsers block audio until then). */
  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.buses = {};
      for (const k of ['sfx', 'voice', 'music']) { this.buses[k] = this.ctx.createGain(); this.buses[k].connect(this.master); }
      this.buses.music.gain.value = this.musicVolume;
      this.preload(['ui_click', 'ui_hover', 'ui_open', 'ui_close', 'ui_error', 'ui_notify', 'step_1', 'step_2', 'step_3']);
      if (this.wantMusic) this.playMusic(this.wantMusic);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  setMusicVolume(v) { this.musicVolume = v; if (this.buses) this.buses.music.gain.value = v; }

  async load(key) {
    if (this.buffers.has(key)) return this.buffers.get(key);
    if (this.loading.has(key)) return this.loading.get(key);
    const p = (async () => {
      const m = this.manifest || await this.manifestPromise;
      const entry = m[key];
      if (!entry || !this.ctx) return null;
      try {
        const res = await fetch(BASE + entry.file);
        const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        this.buffers.set(key, buf);
        return buf;
      } catch { return null; } finally { this.loading.delete(key); }
    })();
    this.loading.set(key, p);
    return p;
  }

  preload(keys) { for (const k of keys) this.load(k); }

  entry(key) { return this.manifest && this.manifest[key]; }

  /** Plays a sound. opts: vol, rate, pan, gap (min seconds between plays of this key), bus. */
  play(key, opts = {}) {
    if (!this.ctx || this.volume <= 0) return;
    const now = this.ctx.currentTime;
    const gap = opts.gap ?? 0.04;
    if (now - (this.last.get(key) || -9) < gap) return;
    this.last.set(key, now);
    const requested = performance.now();
    const go = buf => {
      if (!buf) return;
      if (performance.now() - requested > 400 && !opts.late) return; // stale: skip rather than play late
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = opts.rate || 1;
      const g = this.ctx.createGain();
      g.gain.value = (this.entry(key)?.vol ?? 0.6) * (opts.vol ?? 1);
      let node = g;
      if (opts.pan && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, opts.pan)); g.connect(p); node = p; }
      src.connect(g);
      const bus = opts.bus || (this.entry(key)?.kind === 'voice' ? 'voice' : 'sfx');
      node.connect(this.buses[bus] || this.buses.sfx);
      src.start();
      if (opts.onEnd) src.onended = opts.onEnd;
      return src;
    };
    const buf = this.buffers.get(key);
    if (buf) return go(buf);
    this.load(key).then(go);
  }

  /** Plays a sound at a world position, attenuated by distance to the listener. */
  playAt(key, x, y, opts = {}) {
    const l = this.listener;
    if (!l || x === undefined) return this.play(key, opts);
    const dx = x - l.x, dy = y - l.y;
    const d = Math.hypot(dx, dy);
    const range = opts.range || HEAR_RANGE;
    if (d > range) return;
    const fall = 1 - d / range;
    this.play(key, { ...opts, vol: (opts.vol ?? 1) * fall * fall, pan: dx / range });
  }

  /** Queues an announcer line; higher priority lines jump the queue. */
  announce(key, priority = 1) {
    if (!this.ctx) return;
    if (this.voiceQueue.length >= 3) this.voiceQueue = this.voiceQueue.filter(v => v.priority > priority);
    this.voiceQueue.push({ key, priority });
    this.voiceQueue.sort((a, b) => b.priority - a.priority);
    this.load(key);
    this.nextVoice();
  }

  nextVoice() {
    if (this.voicePlaying || !this.voiceQueue.length) return;
    const { key } = this.voiceQueue.shift();
    this.voicePlaying = true;
    this.load(key).then(buf => {
      if (!buf) { this.voicePlaying = false; return this.nextVoice(); }
      this.play(key, { late: true, gap: 0, bus: 'voice', onEnd: () => { setTimeout(() => { this.voicePlaying = false; this.nextVoice(); }, 250); } });
    });
  }

  clearVoices() { this.voiceQueue = []; }

  /** Crossfades to a looping music/ambience track (null to stop). */
  async playMusic(key) {
    this.wantMusic = key;
    if (!this.ctx) return;
    if (this.music && this.music.key === key) return;
    const old = this.music;
    this.music = null;
    if (old) { old.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.6); setTimeout(() => { try { old.src.stop(); } catch { /* already stopped */ } }, 3000); }
    if (!key) return;
    const buf = await this.load(key);
    if (!buf || this.wantMusic !== key) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(this.entry(key)?.vol ?? 0.3, this.ctx.currentTime, 0.8);
    src.connect(gain);
    gain.connect(this.buses.music);
    src.start();
    this.music = { key, src, gain };
  }
}

export const sfx = new Sfx();

// UI feedback for every button in the app.
let lastHover = null;
document.addEventListener('pointerdown', () => sfx.init(), { capture: true });
document.addEventListener('keydown', () => sfx.init(), { capture: true });
document.addEventListener('click', e => {
  const b = e.target.closest('button, .champ-card, .shop-card, .tab, .mb-slot, .mb-item, .room-slot');
  if (b && !b.disabled) sfx.play('ui_click', { gap: 0.05 });
}, { capture: true });
document.addEventListener('mouseover', e => {
  const b = e.target.closest('button, .champ-card, .shop-card, .tab');
  if (b && b !== lastHover && !b.disabled) sfx.play('ui_hover', { gap: 0.06 });
  lastHover = b;
});
