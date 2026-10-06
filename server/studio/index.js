/* BroadRoads social studio (social.broadroads.com): an admin-only page that runs the
   highlights pipeline (pipeline.js) on demand or on an autopilot schedule and publishes the
   results to YouTube. Listens on 127.0.0.1 (Caddy terminates TLS in front of it).
   Env: STUDIO_TOKEN or ADMIN_TOKEN (login), STUDIO_SECRET or TOKEN_SECRET (cookie/token
   signing), ELEVENLABS_API_KEY, YOUTUBE_CLIENT_ID/YOUTUBE_CLIENT_SECRET, optional
   ANTHROPIC_API_KEY, STUDIO_PORT (8090), STUDIO_DIR, STUDIO_PUBLIC_URL, GAME_URL. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { makeAuth, SECURITY_HEADERS } from './auth.js';
import { Episode, Pipeline } from './pipeline.js';
import { YouTube } from './youtube.js';
import { Voice, DEFAULT_VOICE } from './voice.js';
import { startRenderHost } from './renderhost.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
if (fs.existsSync(path.join(ROOT, '.env')) && typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(path.join(ROOT, '.env')); } catch (err) { console.warn('Could not read .env:', err.message); }
}
const env = process.env;

export const DEFAULT_SETTINGS = {
  autopilot: false, everyHours: 24, autoUpload: false, privacy: 'private', fights: 3, fps: 30, quality: 'medium',
  voiceId: DEFAULT_VOICE, useClaude: true, synthetic: false, renderWorkers: 2, busyMatches: 8, keepEpisodes: 14,
};
const PRIVACY = ['public', 'unlisted', 'private'];

export function cleanSettings(cur, patch) {
  const s = { ...cur };
  const num = (k, lo, hi) => { if (patch[k] !== undefined) { const v = Number(patch[k]); if (Number.isFinite(v)) s[k] = Math.max(lo, Math.min(hi, Math.round(v))); } };
  const bool = k => { if (patch[k] !== undefined) s[k] = !!patch[k]; };
  bool('autopilot'); bool('autoUpload'); bool('useClaude'); bool('synthetic');
  num('everyHours', 1, 168); num('fights', 1, 5); num('fps', 24, 60); num('renderWorkers', 1, 4); num('busyMatches', 1, 100); num('keepEpisodes', 3, 100);
  if (PRIVACY.includes(patch.privacy)) s.privacy = patch.privacy;
  if (['low', 'medium', 'high'].includes(patch.quality)) s.quality = patch.quality;
  if (typeof patch.voiceId === 'string' && /^[A-Za-z0-9]{10,40}$/.test(patch.voiceId)) s.voiceId = patch.voiceId;
  return s;
}

export async function startStudio(opts = {}) {
  const cfg = {
    port: Number(opts.port ?? env.STUDIO_PORT ?? 8090),
    host: opts.host || env.STUDIO_HOST || '127.0.0.1',
    dir: path.resolve(opts.dir || env.STUDIO_DIR || path.join(env.DATA_DIR || path.join(ROOT, 'data'), 'studio')),
    staticDir: path.resolve(opts.staticDir || env.STATIC_DIR || path.join(ROOT, 'dist')),
    publicUrl: (opts.publicUrl || env.STUDIO_PUBLIC_URL || 'https://social.broadroads.com').replace(/\/$/, ''),
    token: opts.token ?? (env.STUDIO_TOKEN || env.ADMIN_TOKEN || ''),
    secret: opts.secret ?? (env.STUDIO_SECRET || env.TOKEN_SECRET || ''),
    gameUrl: env.GAME_URL || 'http://127.0.0.1:8080',
  };
  const secure = cfg.publicUrl.startsWith('https://');
  const auth = makeAuth({ token: cfg.token, secret: cfg.secret, secure });
  const sealSecret = cfg.secret || cfg.token;
  for (const d of ['episodes', 'voice-cache', 'music']) fs.mkdirSync(path.join(cfg.dir, d), { recursive: true });
  const epRoot = path.join(cfg.dir, 'episodes');
  const settingsFile = path.join(cfg.dir, 'settings.json');
  let settings = { ...DEFAULT_SETTINGS };
  try { settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsFile, 'utf8')) }; } catch { /* first run */ }
  const saveSettings = () => fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 1));

  const youtube = new YouTube({
    clientId: env.YOUTUBE_CLIENT_ID || env.GOOGLE_CLIENT_ID || '', clientSecret: env.YOUTUBE_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: `${cfg.publicUrl}/oauth/youtube/callback`, tokenFile: path.join(cfg.dir, 'youtube.token'), secret: sealSecret,
  });
  const host = await startRenderHost({
    staticDir: cfg.staticDir,
    replayFile: id => {
      const m = /^(\d{8})([a-z0-9]{5})f(\d)$/.exec(id);
      if (!m) return null;
      const f = path.join(epRoot, `${m[1]}-${m[2]}`, 'replays', `${id}.ndjson.gz`);
      return fs.existsSync(f) ? f : null;
    },
  });
  const pipeline = new Pipeline({ root: epRoot, staticDir: cfg.staticDir, host, voiceCache: path.join(cfg.dir, 'voice-cache'), musicDir: path.join(cfg.dir, 'music'), youtube, env });

  /* ---------------- episodes and the job queue ---------------- */
  const episodeDir = id => (/^\d{8}-[a-z0-9]{5}$/.test(id) ? path.join(epRoot, id) : null);
  const loadEp = id => { const d = episodeDir(id); return d && fs.existsSync(path.join(d, 'episode.json')) ? Episode.load(d) : null; };
  const listEps = () => fs.readdirSync(epRoot).filter(n => episodeDir(n) && fs.existsSync(path.join(epRoot, n, 'episode.json'))).sort().reverse();
  const queue = []; // { id, upload }
  let current = null; // { id, ctrl }
  let lastAuto = Number(fs.existsSync(path.join(cfg.dir, 'last-auto')) ? fs.readFileSync(path.join(cfg.dir, 'last-auto'), 'utf8') : 0) || 0;

  function enqueue(id, upload) {
    if (current?.id === id || queue.some(q => q.id === id)) return false;
    queue.push({ id, upload });
    setImmediate(next);
    return true;
  }

  async function next() {
    if (current || !queue.length) return;
    const job = queue.shift();
    const ep = loadEp(job.id);
    if (!ep) return next();
    const ctrl = new AbortController();
    current = { id: job.id, ctrl };
    try {
      if (job.upload === 'only') await pipeline.upload(ep, ctrl.signal);
      else await pipeline.run(ep, { signal: ctrl.signal, upload: job.upload ?? ep.data.settings.autoUpload });
    } catch (err) {
      console.error(`studio: episode ${job.id} failed:`, err.message);
      if (ep.data.status === 'uploading') { ep.data.status = 'failed'; ep.save(); }
    } finally {
      current = null;
      prune();
      setImmediate(next);
    }
  }

  function prune() {
    // Keep the newest episodes' files; older ones are deleted (published ones keep their record).
    for (const id of listEps().slice(settings.keepEpisodes)) {
      const ep = loadEp(id);
      if (!ep || ['running', 'uploading', 'queued'].includes(ep.data.status)) continue;
      for (const f of fs.readdirSync(ep.dir)) if (f !== 'episode.json') fs.rmSync(path.join(ep.dir, f), { recursive: true, force: true });
      if (!ep.data.pruned) { ep.data.pruned = true; ep.save(); }
    }
  }

  // Episodes interrupted by a restart (e.g. a deploy) resume where they stopped; they upload
  // afterwards only when the autopilot would have.
  for (const id of listEps().reverse()) {
    const ep = loadEp(id);
    if (['running', 'queued', 'uploading'].includes(ep.data.status)) {
      ep.data.status = 'queued'; ep.data.error = null; ep.log('Interrupted by a restart; resuming.');
      enqueue(id, settings.autopilot ? ep.data.settings.autoUpload : false);
    }
  }

  async function gameBusy() {
    try {
      const r = await fetch(`${cfg.gameUrl}/api/stats`, { signal: AbortSignal.timeout(3000) });
      const j = await r.json();
      return (j.matches || 0) >= settings.busyMatches;
    } catch { return false; }
  }

  const autoTimer = setInterval(async () => {
    if (!settings.autopilot || current || queue.length) return;
    if (Date.now() - lastAuto < settings.everyHours * 3600e3) return;
    if (await gameBusy()) return; // live games come first; try again in a minute
    lastAuto = Date.now();
    fs.writeFileSync(path.join(cfg.dir, 'last-auto'), String(lastAuto));
    const ep = Episode.create(epRoot, settings);
    ep.log('Started by the autopilot.');
    enqueue(ep.data.id, settings.autoUpload);
  }, 60e3);
  autoTimer.unref();

  /* ---------------- HTTP ---------------- */
  const pub = path.join(HERE, 'public');
  const send = (res, status, body, headers = {}) => { res.writeHead(status, { ...SECURITY_HEADERS, ...headers }); res.end(body); };
  const json = (res, status, obj, headers = {}) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  const clientIp = req => {
    const xff = (req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
    const sock = req.socket.remoteAddress || '';
    return (sock === '127.0.0.1' || sock === '::1' || sock === '::ffff:127.0.0.1') && xff.length ? xff[xff.length - 1] : sock;
  };
  const readBody = req => new Promise((ok, fail) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => { size += c.length; if (size > 65536) { fail(Object.assign(new Error('Body too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { ok(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { fail(Object.assign(new Error('Bad JSON'), { status: 400 })); } });
    req.on('error', fail);
  });
  const file = (res, name, type) => send(res, 200, fs.readFileSync(path.join(pub, name)), { 'Content-Type': type });

  function summary(ep) {
    const d = ep.data;
    return {
      id: d.id, status: d.status, stage: d.stage, progress: d.progress, error: d.error, createdAt: d.createdAt, publishedAt: d.publishedAt || null, pruned: !!d.pruned,
      title: d.main?.meta?.title || null, duration: d.main?.duration || null, fights: d.fights.length, uploads: d.uploads,
      match: d.summary ? { minutes: Math.round(d.summary.duration / 60), kills: d.summary.kills, winner: d.summary.winner } : null,
    };
  }
  function detail(ep) {
    const d = ep.data;
    return {
      ...summary(ep), log: d.log.slice(-120), settings: d.settings, summary: d.summary, main: d.main || null,
      fights: d.fights.map(f => ({ n: f.n, start: f.start, end: f.end, kills: f.kills, score: f.score, facts: f.facts || null, short: f.short || null, lines: (f.lines || []).map(l => ({ start: l.start, text: l.text })) })),
    };
  }

  function serveMedia(req, res, id, name) {
    const dir = episodeDir(id);
    if (!dir || !/^(episode|short\d|fight\d|thumb|intro|outro|fight\d-peak)\.(mp4|jpg)$/.test(name)) return send(res, 404, 'Not found');
    const f = path.join(dir, name);
    if (!fs.existsSync(f)) return send(res, 404, 'Not found');
    const size = fs.statSync(f).size;
    const type = name.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg';
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    const headers = { ...SECURITY_HEADERS, 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=300' };
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start >= size || start > end) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
      return fs.createReadStream(f, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...headers, 'Content-Length': size });
    fs.createReadStream(f).pipe(res);
  }

  const oauthCookie = 'studio_oauth';
  async function handle(req, res) {
    const url = new URL(req.url, cfg.publicUrl);
    const p = url.pathname;
    const method = req.method;
    if (p === '/healthz') return json(res, 200, { ok: true });
    if (p === '/login' && method === 'GET') return file(res, 'login.html', 'text/html; charset=utf-8');
    if (p === '/login.js') return file(res, 'login.js', 'text/javascript; charset=utf-8');
    if (p === '/studio.css') return file(res, 'studio.css', 'text/css; charset=utf-8');
    if (p === '/api/login' && method === 'POST') {
      if (!auth.sameOrigin(req, cfg.publicUrl)) return json(res, 403, { error: 'Forbidden' });
      const body = await readBody(req);
      const r = auth.login(clientIp(req), body.token);
      if (!r.ok) {
        console.warn(`studio: failed login from ${clientIp(req)}`);
        return json(res, r.status, { error: r.error }, r.retryAfter ? { 'Retry-After': String(r.retryAfter) } : {});
      }
      return json(res, 200, { ok: true }, { 'Set-Cookie': r.cookie });
    }
    // OAuth callback: arrives as a cross-site navigation from Google, so the Strict session
    // cookie isn't sent; the signed, short-lived state cookie set by /oauth/youtube/start is.
    if (p === '/oauth/youtube/callback' && method === 'GET') {
      const state = url.searchParams.get('state') || '';
      const cookie = (req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith(`${oauthCookie}=`))?.slice(oauthCookie.length + 1) || '';
      const [nonce, exp, sig] = cookie.split('.');
      const valid = nonce && sig && Number(exp) > Date.now() && auth.same(auth.hmac(`${nonce}.${exp}`), sig) && auth.same(state, nonce);
      const clear = `${oauthCookie}=; Path=/oauth/youtube; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
      let msg = 'connected';
      if (!valid) msg = 'state';
      else if (url.searchParams.get('error')) msg = 'denied';
      else {
        try { await youtube.exchange(url.searchParams.get('code') || ''); } catch (err) { console.error('studio: youtube connect failed', err.message); msg = 'failed'; }
      }
      // A same-site hop back to the studio so the session cookie is sent again.
      return send(res, 200, `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/?youtube=${msg}"><title>Studio</title><a href="/?youtube=${msg}">Continue</a>`, { 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': clear });
    }

    const s = auth.session(req);
    if (!s) {
      if (p.startsWith('/api/') || p.startsWith('/media/')) return json(res, 401, { error: 'Sign in first' });
      return send(res, 302, '', { Location: '/login' });
    }
    if (method !== 'GET' && method !== 'HEAD' && !auth.sameOrigin(req, cfg.publicUrl)) return json(res, 403, { error: 'Forbidden' });

    if (p === '/' && method === 'GET') return file(res, 'studio.html', 'text/html; charset=utf-8');
    if (p === '/studio.js') return file(res, 'studio.js', 'text/javascript; charset=utf-8');
    const media = /^\/media\/([0-9a-z-]+)\/([a-z0-9.-]+)$/.exec(p);
    if (media && method === 'GET') return serveMedia(req, res, media[1], media[2]);
    if (p === '/oauth/youtube/start' && method === 'GET') {
      if (!youtube.configured) return send(res, 302, '', { Location: '/?youtube=unconfigured' });
      const nonce = crypto.randomBytes(18).toString('base64url');
      const exp = Date.now() + 10 * 60e3;
      const c = `${oauthCookie}=${nonce}.${exp}.${auth.hmac(`${nonce}.${exp}`)}; Path=/oauth/youtube; HttpOnly; SameSite=Lax; Max-Age=600${secure ? '; Secure' : ''}`;
      return send(res, 302, '', { Location: youtube.authUrl(nonce), 'Set-Cookie': c });
    }
    if (p === '/api/logout' && method === 'POST') return json(res, 200, { ok: true }, { 'Set-Cookie': auth.logoutCookie() });
    if (p === '/api/logout-all' && method === 'POST') { auth.signOutEveryone(); return json(res, 200, { ok: true }, { 'Set-Cookie': auth.logoutCookie() }); }
    if (p === '/api/state' && method === 'GET') {
      let channel = null;
      if (youtube.connected) channel = youtube.saved()?.channel || null;
      return json(res, 200, {
        settings, running: current ? current.id : null, queue: queue.map(q => q.id),
        autopilot: { enabled: settings.autopilot, next: settings.autopilot ? Math.max(Date.now(), lastAuto + settings.everyHours * 3600e3) : null },
        youtube: { configured: youtube.configured, connected: youtube.connected, channel, redirectUri: youtube.redirectUri },
        keys: { elevenlabs: !!env.ELEVENLABS_API_KEY, anthropic: !!env.ANTHROPIC_API_KEY },
        episodes: listEps().slice(0, 40).map(id => summary(loadEp(id))),
      });
    }
    if (p === '/api/settings' && method === 'POST') {
      settings = cleanSettings(settings, await readBody(req));
      saveSettings();
      return json(res, 200, { settings });
    }
    if (p === '/api/voices' && method === 'GET') {
      try { return json(res, 200, { voices: await new Voice({ apiKey: env.ELEVENLABS_API_KEY, cacheDir: path.join(cfg.dir, 'voice-cache') }).voices() }); } catch (err) { return json(res, 502, { error: err.message }); }
    }
    if (p === '/api/youtube/disconnect' && method === 'POST') { youtube.disconnect(); return json(res, 200, { ok: true }); }
    if (p === '/api/episodes' && method === 'POST') {
      const body = await readBody(req);
      const ep = Episode.create(epRoot, settings);
      ep.log('Started from the studio page.');
      enqueue(ep.data.id, body.upload === true ? true : body.upload === false ? false : settings.autoUpload);
      return json(res, 200, { id: ep.data.id });
    }
    const em = /^\/api\/episodes\/(\d{8}-[a-z0-9]{5})(?:\/(run|upload|cancel|meta))?$/.exec(p);
    if (em) {
      const ep = loadEp(em[1]);
      if (!ep) return json(res, 404, { error: 'No such episode' });
      const action = em[2];
      if (!action && method === 'GET') return json(res, 200, detail(ep));
      if (!action && method === 'DELETE') {
        if (current?.id === ep.data.id) return json(res, 409, { error: 'Cancel it first' });
        const qi = queue.findIndex(q => q.id === ep.data.id);
        if (qi >= 0) queue.splice(qi, 1);
        fs.rmSync(ep.dir, { recursive: true, force: true });
        return json(res, 200, { ok: true });
      }
      if (action === 'run' && method === 'POST') { if (ep.data.pruned) return json(res, 409, { error: 'Its files were cleaned up' }); ep.data.status = 'queued'; ep.save(); enqueue(ep.data.id, false); return json(res, 200, { ok: true }); }
      if (action === 'upload' && method === 'POST') {
        if (!ep.data.edited) return json(res, 409, { error: 'The videos are not ready yet' });
        if (!youtube.connected) return json(res, 409, { error: 'Connect YouTube first' });
        enqueue(ep.data.id, 'only');
        return json(res, 200, { ok: true });
      }
      if (action === 'cancel' && method === 'POST') {
        if (current?.id === ep.data.id) current.ctrl.abort();
        const qi = queue.findIndex(q => q.id === ep.data.id);
        if (qi >= 0) { queue.splice(qi, 1); ep.data.status = 'cancelled'; ep.save(); }
        return json(res, 200, { ok: true });
      }
      if (action === 'meta' && method === 'POST') {
        const body = await readBody(req);
        const fix = (m, patch) => {
          if (typeof patch?.title === 'string' && patch.title.trim()) m.title = patch.title.trim().slice(0, 100);
          if (typeof patch?.description === 'string') m.description = patch.description.slice(0, 4900);
          if (Array.isArray(patch?.tags)) m.tags = patch.tags.map(String).map(t => t.trim()).filter(Boolean).slice(0, 40);
        };
        if (body.main && ep.data.main && !ep.data.uploads.main) fix(ep.data.main.meta, body.main);
        for (const [n, patch] of Object.entries(body.shorts || {})) {
          const f = ep.data.fights.find(x => x.n === Number(n));
          if (f?.short && !ep.data.uploads.shorts?.[n]) fix(f.short.meta, patch);
        }
        ep.save();
        return json(res, 200, detail(ep));
      }
    }
    return json(res, 404, { error: 'Not found' });
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch(err => {
      if (!res.headersSent) json(res, err.status || 500, { error: err.status ? err.message : 'Server error' });
      if (!err.status) console.error('studio:', err);
    });
  });
  await new Promise(r => server.listen(cfg.port, cfg.host, r));
  console.log(`studio listening on http://${cfg.host}:${server.address().port} (public ${cfg.publicUrl})`);
  return {
    server, cfg, pipeline, enqueue, port: server.address().port,
    async close() { clearInterval(autoTimer); current?.ctrl.abort(); await new Promise(r => server.close(r)); await host.close(); },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startStudio().catch(err => { console.error(err.message); process.exit(1); });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(0));
}
