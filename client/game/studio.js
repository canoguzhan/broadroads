/* Studio capture mode (?replay=<id>&t=<s>&studio=landscape|portrait), driven by the social
   studio's headless renderer (server/studio/render.js) through window.__studio:
   - a virtual clock: the rAF loop stops and every step() advances performance.now(),
     setTimeout and the replay by exactly one video frame, then renders once;
   - an auto-director camera that glides along the fight track computed by the simulation;
   - a broadcast overlay driven by the replay clock (score bar, kill feed, big callouts and
     word-by-word commentary captions);
   - a sound log instead of audio output: every game sound with its replay time, volume,
     rate and pan, so the pipeline can mix the real sound files into the video. */
import { sfx } from '../audio/sfx.js';
import { h } from '../ui/dom.js';

const CALLOUT = { multi2: 'DOUBLE TAKEDOWN', multi3: 'TRIPLE TAKEDOWN', multi4: 'QUADRA TAKEDOWN', multi5: 'PENTA TAKEDOWN', team_wipe: 'TEAM WIPE', first_strike: 'FIRST STRIKE', streak_end: 'SHUTDOWN', wyrm: 'EMBER WYRM SLAIN', titan: 'ABYSS TITAN SLAIN', tower: 'TOWER DOWN', spire: 'SPIRE DOWN' };

export function attachStudio(game, layout = 'landscape') {
  const realNow = performance.now.bind(performance);
  let vnow = realNow();
  performance.now = () => vnow;
  // Virtual one-shot timers (champion lines and announcer cues are delayed with setTimeout).
  const timers = [];
  let timerId = 1e6;
  const realSetTimeout = window.setTimeout.bind(window);
  window.setTimeout = (fn, ms = 0, ...args) => { const id = timerId++; timers.push({ id, at: vnow + Number(ms || 0), fn: () => fn(...args) }); return id; };
  const realClear = window.clearTimeout.bind(window);
  window.clearTimeout = id => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); else realClear(id); };
  const runTimers = () => {
    for (let guard = 0; guard < 100; guard++) {
      const i = timers.findIndex(t => t.at <= vnow);
      if (i < 0) return;
      const [t] = timers.splice(i, 1);
      try { t.fn(); } catch (err) { console.error(err); }
    }
  };

  game.running = false;
  cancelAnimationFrame(game.frameId);
  const replay = game.replay;
  replay.speed = 1;
  replay.playing = true;
  document.body.classList.add('studio', `studio-${layout}`);

  /* ---------- sound log ---------- */
  const sounds = [];
  const lastAt = new Map();
  const clock = () => replay.clock;
  sfx.play = (key, opts = {}) => {
    if (game.muteFx) return;
    const t = clock();
    const gap = opts.gap ?? 0.04;
    if (t - (lastAt.get(key) ?? -9) < gap) return;
    lastAt.set(key, t);
    const vol = (sfx.entry(key)?.vol ?? 0.6) * (opts.vol ?? 1);
    if (vol > 0.01) sounds.push({ k: key, t: Math.round(t * 1000) / 1000, v: Math.round(vol * 1000) / 1000, r: opts.rate || 1, p: Math.round((opts.pan || 0) * 100) / 100 });
  };
  sfx.announce = key => sfx.play(key, { gap: 0, vol: 0.9 });
  sfx.playMusic = () => {};

  /* ---------- overlay ---------- */
  const blueK = h('span.st-k.blue', { text: '0' });
  const redK = h('span.st-k.red', { text: '0' });
  const timeEl = h('span.st-time', { text: '0:00' });
  const feed = h('div.st-feed');
  const callout = h('div.st-callout');
  const caption = h('div.st-caption');
  const hook = h('div.st-hook');
  const tag = h('div.st-tag', { text: '' });
  const brand = h('div.st-brand', {}, h('b', { text: 'BROADROADS' }), h('span', { text: 'play free · broadroads.com' }));
  const root = h('div.studio-overlay', {}, h('div.st-score', {}, h('span.st-team.blue', { text: 'BLUE' }), blueK, timeEl, redK, h('span.st-team.red', { text: 'RED' })), brand, tag, feed, callout, caption, hook);
  document.body.append(root);

  const players = game.players; // id → { champ, team, name }
  const champName = id => { const p = players.get(id); return p ? game.champInfo[p.champ]?.name || p.champ : null; };
  const kills = { blue: 0, red: 0 };
  const feedItems = [];
  let call = null;
  game.world.on('fx', ev => {
    if (game.muteFx) return;
    if (ev.e === 'kill') {
      const v = players.get(ev.v);
      if (v) kills[v.team === 'blue' ? 'red' : 'blue']++;
      const k = players.get(ev.k);
      const row = h(`div.st-kill.${k ? k.team : v?.team === 'blue' ? 'red' : 'blue'}`, {},
        h('b', { text: champName(ev.k) || 'Tower' }), h('span', { text: ' ⚔ ' }), h('b.victim', { text: champName(ev.v) || '?' }));
      feed.prepend(row);
      feedItems.push({ el: row, until: clock() + 7 });
    }
    if (ev.e === 'ann' && CALLOUT[ev.key]) call = { text: CALLOUT[ev.key], at: clock(), team: ev.team || (ev.killer && [...players.values()].find(p => p.champ === ev.killer)?.team) || '' };
  });
  // Seeking already happened quietly: start the score from the replay's scoreboard if known.
  const sb = game.world.score;
  if (sb?.kills) { kills.blue = sb.kills.blue; kills.red = sb.kills.red; }

  let captions = [];
  let hookText = '', hookUntil = 0;
  let track = [];
  let zoom = layout === 'portrait' ? 1.05 : 0.92;
  const cam = { x: null, y: null };

  function trackAt(t) {
    if (!track.length) return null;
    if (t <= track[0].t) return track[0];
    for (let i = 1; i < track.length; i++) {
      const b = track[i];
      if (b.t >= t) { const a = track[i - 1]; const k = (t - a.t) / Math.max(0.001, b.t - a.t); return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }; }
    }
    return track[track.length - 1];
  }

  function drawOverlay(dt) {
    const t = clock();
    if (game.world.score?.kills) { kills.blue = Math.max(kills.blue, game.world.score.kills.blue); kills.red = Math.max(kills.red, game.world.score.kills.red); }
    blueK.textContent = kills.blue;
    redK.textContent = kills.red;
    timeEl.textContent = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    for (let i = feedItems.length - 1; i >= 0; i--) if (feedItems[i].until < t) { feedItems[i].el.remove(); feedItems.splice(i, 1); }
    // Callout: punch in, hold, fade (computed from the clock, not CSS animations).
    if (call && t - call.at < 2.6) {
      const a = t - call.at;
      const s = a < 0.18 ? 1.6 - (a / 0.18) * 0.6 : 1;
      callout.textContent = call.text;
      callout.className = `st-callout on ${call.team}`;
      callout.style.opacity = String(a > 2.1 ? Math.max(0, 1 - (a - 2.1) / 0.5) : 1);
      callout.style.transform = `translate(-50%, -50%) scale(${s})`;
    } else callout.className = 'st-callout';
    // Captions: the current chunk, the spoken word highlighted.
    const c = captions.find(x => t >= x.start && t <= x.end + 0.25);
    if (c) {
      if (caption.dataset.id !== String(c.start)) {
        caption.dataset.id = String(c.start);
        caption.replaceChildren(...c.words.map(w => h('span.st-w', { text: w.w })));
      }
      const spans = caption.children;
      c.words.forEach((w, i) => { spans[i].classList.toggle('now', t >= w.s && t < (c.words[i + 1]?.s ?? c.end + 0.25)); spans[i].classList.toggle('said', t >= w.s); });
      caption.classList.add('on');
    } else caption.classList.remove('on');
    // The opening hook (first seconds of a short): slides down, then fades.
    if (hookText && t < hookUntil) {
      const a = t - (hookUntil - hookLen);
      hook.textContent = hookText;
      hook.className = 'st-hook on';
      hook.style.opacity = String(Math.min(1, a / 0.25, (hookUntil - t) / 0.4));
      hook.style.transform = `translate(-50%, ${Math.max(0, 1 - a / 0.3) * -30}px)`;
    } else hook.className = 'st-hook';
    void dt;
  }
  let hookLen = 0;

  /* ---------- the director camera ---------- */
  function direct(dt) {
    const hint = trackAt(clock());
    if (!hint) return null;
    if (cam.x === null) { cam.x = hint.x; cam.y = hint.y; }
    const k = 1 - Math.exp(-dt * 2.2);
    cam.x += (hint.x - cam.x) * k;
    cam.y += (hint.y - cam.y) * k;
    return { x: cam.x, y: cam.y };
  }

  const r = game.renderer;
  window.__studio = {
    ready: true,
    layout,
    setup(opts = {}) {
      captions = opts.captions || [];
      track = opts.track || [];
      if (opts.zoom) zoom = opts.zoom;
      if (opts.tag) tag.textContent = opts.tag;
      hookText = opts.hook || '';
      hookLen = opts.hookUntil || 0;
      hookUntil = clock() + hookLen;
      tag.hidden = !opts.tag;
      r.zoom = zoom;
      cam.x = null;
      return true;
    },
    clock,
    /** Advances one video frame of dt seconds and renders it. */
    step(dt) {
      vnow += dt * 1000;
      runTimers();
      replay.update(dt);
      const w = game.world;
      w.update(dt);
      const focus = direct(dt);
      r.locked = true;
      sfx.listener = focus || { x: r.camTarget.x, y: r.camTarget.z };
      r.zoom = zoom;
      r.frame(dt, w, focus, null);
      game.labels.update(w, r, dt);
      if (layout === 'landscape') game.hud.drawMinimap(dt);
      drawOverlay(dt);
      return replay.clock;
    },
    sounds: () => sounds.splice(0),
    /** Renders the current moment again without advancing (warms up shaders and models). */
    warm() { const w = game.world; w.update(0.001); r.frame(0.001, w, direct(0.001), null); game.labels.update(w, r, 0.001); return true; },
    overlay(on) { root.hidden = !on; document.body.classList.toggle('studio-clean', !on); return true; },
    realSetTimeout,
  };
  return window.__studio;
}
