/* Developer console served on its own host (DEV_HOST, default dev.broadroads.com):
   every service and API with its settings, usage and statistics.

   Security:
   - That host serves nothing else (no game client, no API, no WebSocket).
   - Sign-in with DEV_TOKEN (falls back to ADMIN_TOKEN); without either the host
     answers 404. Optional DEV_ALLOW_IPS restricts it to listed client IPs.
   - The session is an HMAC-signed __Host- cookie (HttpOnly, Secure,
     SameSite=Strict, 8 hours) under a key derived for this console only, and
     it is tied to the current token, so rotating the token signs everyone out.
   - Failed sign-ins are rate limited per IP and globally, logged, and alerted.
   - The dashboard's HTML/JS is only sent to signed-in sessions; a strict CSP,
     frame-ancestors 'none', noindex and no-store on every response.
   - Secrets are never sent: settings show "set"/"not set" or only a host name. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import tls from 'node:tls';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { signToken, verifyToken } from './auth.js';

const SESSION_TTL = 8 * 3600;
const COOKIE = '__Host-br_dev';
const PAGE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'devconsole');

/** Every HTTP endpoint the game server exposes (the dev console's API catalog). */
export const API_CATALOG = [
  { method: 'GET', path: '/api/health', auth: 'public', limit: '—', desc: 'Liveness for the watchdog and autodeploy: online count, matches, tick time, uptime.' },
  { method: 'GET', path: '/api/stats', auth: 'public', limit: '—', desc: 'Landing-page counters: players online, live matches, accounts.' },
  { method: 'GET', path: '/api/gamedata', auth: 'public', limit: '—', desc: 'Champions, items and summoner spells (cached 1 h).' },
  { method: 'GET', path: '/api/leaderboard', auth: 'public', limit: '—', desc: 'Top players by ?kind= rating | wins | level.' },
  { method: 'POST', path: '/api/auth/register', auth: 'public', limit: '20 / 10 min / IP', desc: 'Create an account (username, password, optional email).' },
  { method: 'POST', path: '/api/auth/login', auth: 'public', limit: '20 / 10 min / IP', desc: 'Password sign-in; returns a 30-day session token.' },
  { method: 'GET', path: '/api/auth/providers', auth: 'public', limit: '—', desc: 'Which sign-in methods are configured (Google, Discord, email).' },
  { method: 'POST', path: '/api/auth/forgot', auth: 'public', limit: '20 / 10 min / IP', desc: 'Email a password-reset link.' },
  { method: 'POST', path: '/api/auth/reset', auth: 'reset token', limit: '20 / 10 min / IP', desc: 'Set a new password from a reset link.' },
  { method: 'GET', path: '/api/auth/oauth/google/start', auth: 'public', limit: '—', desc: 'Begin Google sign-in (signed state).' },
  { method: 'GET', path: '/api/auth/oauth/google/callback', auth: 'OAuth state', limit: '—', desc: 'Google sign-in return.' },
  { method: 'GET', path: '/api/auth/oauth/discord/start', auth: 'public', limit: '—', desc: 'Begin Discord sign-in (signed state).' },
  { method: 'GET', path: '/api/auth/oauth/discord/callback', auth: 'OAuth state', limit: '—', desc: 'Discord sign-in return.' },
  { method: 'GET', path: '/api/account', auth: 'player token', limit: '—', desc: 'Account details (email, linked providers).' },
  { method: 'POST', path: '/api/account/email', auth: 'player token', limit: '20 / 10 min / IP', desc: 'Add or change the account email.' },
  { method: 'POST', path: '/api/client-error', auth: 'public', limit: '20 / min / IP', desc: 'Browser error reports (monitoring).' },
  { method: 'GET', path: '/api/admin/metrics', auth: 'admin token', limit: '—', desc: 'Data for the legacy /admin page.' },
  { method: 'GET', path: '/replays/:id.ndjson', auth: 'public', limit: '—', desc: 'Gzipped replay stream for spectating and share links.' },
  { method: 'GET', path: '/admin', auth: 'admin token', limit: '—', desc: 'Legacy admin page.' },
  { method: 'WS', path: '/ws', auth: 'player token', limit: '120 msg / s, 8 KB / msg', desc: 'Game gateway: lobby, queue, matches (binary snapshots).' },
];

/** Environment variables BroadRoads reads, and whether each is a secret. */
const ENV_VARS = [
  ['PORT'], ['HOST'], ['NODE_ENV'], ['DATA_DIR'], ['STATIC_DIR'], ['PUBLIC_URL'], ['ALLOWED_ORIGINS'],
  ['DATABASE_URL', 'url'], ['POSTGRES_URL', 'url'], ['TOKEN_SECRET', 'secret'], ['ADMIN_TOKEN', 'secret'], ['DEV_TOKEN', 'secret'],
  ['DEV_HOST'], ['DEV_ALLOW_IPS'], ['MAX_MATCHES'], ['MAX_PLAYERS'], ['SELECT_TIME'], ['QUEUE_BOT_WAIT'], ['QUIET'],
  ['ALERT_WEBHOOK', 'url'], ['SMTP_URL', 'url'], ['MAIL_FROM'], ['GOOGLE_CLIENT_ID'], ['GOOGLE_CLIENT_SECRET', 'secret'],
  ['DISCORD_CLIENT_ID'], ['DISCORD_CLIENT_SECRET', 'secret'], ['BACKUP_DIR'],
];

const SYSTEMD_UNITS = ['broadroads.service', 'caddy.service', 'broadroads-watchdog.timer', 'broadroads-watchdog.service',
  'broadroads-autodeploy.timer', 'broadroads-autodeploy.service', 'broadroads-backup.timer', 'broadroads-backup.service'];

const hostOf = u => { try { return new URL(u).hostname || 'set'; } catch { return 'set'; } };
const redact = (value, kind) => {
  if (!value) return { set: false };
  if (kind === 'secret') return { set: true, value: `•••• (${value.length} chars)` };
  if (kind === 'url') return { set: true, value: `•••• host ${hostOf(value)}` };
  return { set: true, value };
};

/** Caches an async producer for `ms`; failures are cached too (as { error }). */
function cached(ms, fn) {
  let at = 0, value = null, pending = null;
  return async () => {
    if (Date.now() - at < ms && value) return value;
    pending ||= fn().then(v => v, err => ({ error: String(err?.message || err) })).then(v => { value = v; at = Date.now(); pending = null; return v; });
    return pending;
  };
}

function run(cmd, args, timeout = 3000) {
  return new Promise(resolve => execFile(cmd, args, { timeout }, (err, stdout) => resolve(err ? null : String(stdout))));
}

function dirStats(dir) {
  let files = 0, bytes = 0, newest = 0;
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (e.isFile()) { const s = fs.statSync(f); files++; bytes += s.size; newest = Math.max(newest, s.mtimeMs); }
    }
  };
  try { walk(dir); } catch { return null; }
  return { files, bytes, newest };
}

function gitCommit(root) {
  try {
    const head = fs.readFileSync(path.join(root, '.git', 'HEAD'), 'utf8').trim();
    if (!head.startsWith('ref: ')) return { sha: head };
    const ref = head.slice(5);
    const loose = path.join(root, '.git', ref);
    if (fs.existsSync(loose)) return { ref, sha: fs.readFileSync(loose, 'utf8').trim() };
    const packed = fs.readFileSync(path.join(root, '.git', 'packed-refs'), 'utf8').split('\n').find(l => l.endsWith(` ${ref}`));
    return { ref, sha: packed ? packed.split(' ')[0] : null };
  } catch { return null; }
}

function certExpiry(host) {
  return new Promise(resolve => {
    const sock = tls.connect({ host, port: 443, servername: host, timeout: 4000 }, () => {
      const c = sock.getPeerCertificate();
      resolve({ host, ok: sock.authorized, validTo: c?.valid_to ? Date.parse(c.valid_to) : null, issuer: c?.issuer?.O || c?.issuer?.CN || '' });
      sock.end();
    });
    sock.on('error', err => resolve({ host, ok: false, error: err.message }));
    sock.on('timeout', () => { sock.destroy(); resolve({ host, ok: false, error: 'timeout' }); });
  });
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function readForm(req, max = 4096) {
  return new Promise(resolve => {
    let size = 0;
    const chunks = [];
    req.on('data', c => { size += c.length; if (size > max) { req.destroy(); resolve(null); } else chunks.push(c); });
    req.on('end', () => resolve(new URLSearchParams(Buffer.concat(chunks).toString())));
    req.on('error', () => resolve(null));
  });
}

export function loadDevConfig(env = process.env) {
  return {
    devHost: (env.DEV_HOST || 'dev.broadroads.com').toLowerCase(),
    devToken: env.DEV_TOKEN || env.ADMIN_TOKEN || '',
    devAllowIps: (env.DEV_ALLOW_IPS || '').split(',').map(s => s.trim()).filter(Boolean),
    publicHost: hostOf(env.PUBLIC_URL || 'https://broadroads.com'),
    probe: env.NODE_ENV === 'production', // systemd, TLS and backup probes (prod VM only)
    backupDir: env.BACKUP_DIR || '/var/backups/broadroads',
    autodeployDir: '/var/lib/broadroads-autodeploy',
  };
}

export function devConsole({ cfg, env = process.env, root, hub, store, monitor, analytics, usage, reports, wsClients, secret, log, clientIp }) {
  const dev = { ...loadDevConfig(env), ...(cfg.dev || {}) };
  if (!dev.devToken) dev.devToken = cfg.adminToken || '';
  const key = crypto.createHmac('sha256', secret).update('br-dev-console').digest('base64url');
  const fingerprint = () => crypto.createHash('sha256').update(dev.devToken).digest('base64url').slice(0, 16);
  const safeEqual = (a, b) => {
    const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(x, y);
  };

  // Sign-in throttling: 5 failures per IP per 15 minutes, 30 failures overall per 15 minutes.
  const failures = new Map();
  let globalFails = [];
  const recentFails = ip => { const now = Date.now(); if (failures.size > 5000) failures.clear(); const list = (failures.get(ip) || []).filter(t => now - t < 900e3); failures.set(ip, list); return list; };
  const locked = ip => { globalFails = globalFails.filter(t => Date.now() - t < 900e3); return recentFails(ip).length >= 5 || globalFails.length >= 30; };

  // Access log: data/logs/dev-access.ndjson, the latest 50 kept in memory.
  const accessFile = path.join(cfg.dataDir, 'logs', 'dev-access.ndjson');
  const access = [];
  try { for (const l of fs.readFileSync(accessFile, 'utf8').trim().split('\n').slice(-50)) if (l) access.push(JSON.parse(l)); } catch { /* none yet */ }
  const audit = (req, event) => {
    const e = { at: Date.now(), event, ip: clientIp(req), ua: String(req.headers['user-agent'] || '').slice(0, 160) };
    access.push(e); if (access.length > 50) access.shift();
    fs.mkdir(path.dirname(accessFile), { recursive: true }, () => fs.appendFile(accessFile, JSON.stringify(e) + '\n', () => {}));
  };

  const session = req => {
    const tok = verifyToken(key, parseCookies(req)[COOKIE]);
    return tok && tok.dev === 1 && tok.k === fingerprint() ? tok : null;
  };

  const SECURITY = {
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow',
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  };
  const send = (res, status, type, body, headers = {}) => { res.writeHead(status, { ...SECURITY, 'Content-Type': type, ...headers }); res.end(body); };
  const page = name => fs.readFileSync(path.join(PAGE_DIR, name));
  // CSRF: browsers send Sec-Fetch-Site; older ones an Origin. Clients sending neither (curl) are not browsers.
  const sameOrigin = req => {
    const site = req.headers['sec-fetch-site'], o = req.headers.origin;
    if (site) return site === 'same-origin';
    if (!o) return true;
    try { return new URL(o).host.toLowerCase() === String(req.headers.host).toLowerCase(); } catch { return false; }
  };

  /* ---------------- data collectors ---------------- */
  let cpuLast = { at: process.hrtime.bigint(), usage: process.cpuUsage() };
  const cpuPercent = () => {
    const now = process.hrtime.bigint(), u = process.cpuUsage();
    const wall = Number(now - cpuLast.at) / 1e3; // µs
    const used = (u.user - cpuLast.usage.user) + (u.system - cpuLast.usage.system);
    cpuLast = { at: now, usage: u };
    return wall > 0 ? Math.round((used / wall) * 1000) / 10 : 0;
  };

  const systemd = cached(15e3, async () => {
    if (!dev.probe) return [];
    const out = await run('systemctl', ['show', ...SYSTEMD_UNITS, '--no-pager', '-p', 'Id,Description,ActiveState,SubState,Result,ActiveEnterTimestamp,NRestarts,MemoryCurrent,LastTriggerUSec,NextElapseUSecRealtime']);
    if (!out) return [];
    return out.trim().split(/\n\n+/).map(block => Object.fromEntries(block.split('\n').map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })));
  });

  const certs = cached(6 * 3600e3, async () => (dev.probe ? Promise.all([dev.publicHost, dev.devHost].map(certExpiry)) : []));

  const database = cached(30e3, async () => {
    const url = cfg.databaseUrl;
    const counts = await store.counts().catch(err => ({ error: err.message }));
    if (!store.pool) {
      const file = path.join(cfg.dataDir, 'broadroads.json');
      return { kind: 'file', path: cfg.dataDir, counts, sizeBytes: fs.existsSync(file) ? fs.statSync(file).size : null };
    }
    const t = performance.now();
    await store.pool.query('SELECT 1');
    const pingMs = Math.round((performance.now() - t) * 10) / 10;
    const { rows } = await store.pool.query(`SELECT relname AS table, n_live_tup::int AS rows, pg_total_relation_size(relid)::bigint AS bytes,
      seq_scan::bigint AS seq, idx_scan::bigint AS idx, n_tup_ins::bigint AS ins, n_tup_upd::bigint AS upd, n_tup_del::bigint AS del
      FROM pg_stat_user_tables ORDER BY relname`);
    const size = await store.pool.query('SELECT pg_database_size(current_database())::bigint AS bytes, version() AS version');
    let u = null; try { u = new URL(url); } catch { /* unparsable */ }
    return {
      kind: 'postgres', host: u?.hostname || '?', database: u?.pathname.slice(1) || '?', pingMs, counts,
      pool: { max: store.pool.options?.max, total: store.pool.totalCount, idle: store.pool.idleCount, waiting: store.pool.waitingCount },
      sizeBytes: Number(size.rows[0].bytes), version: String(size.rows[0].version).split(' on ')[0],
      tables: rows.map(r => ({ ...r, bytes: Number(r.bytes), seq: Number(r.seq), idx: Number(r.idx), ins: Number(r.ins), upd: Number(r.upd), del: Number(r.del) })),
    };
  });

  const storage = cached(60e3, async () => {
    let disk = null;
    try { const s = fs.statfsSync(cfg.dataDir); disk = { total: s.blocks * s.bsize, free: s.bavail * s.bsize }; } catch { /* unsupported */ }
    const backups = (() => {
      try {
        const days = fs.readdirSync(dev.backupDir).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();
        const latest = days[0];
        let summary = null;
        try { summary = JSON.parse(fs.readFileSync(path.join(dev.backupDir, latest, 'summary.json'), 'utf8')); } catch { /* none */ }
        return { dir: dev.backupDir, count: days.length, latest, summary, ...dirStats(dev.backupDir), latestFiles: latest ? fs.readdirSync(path.join(dev.backupDir, latest)).map(f => ({ name: f, bytes: fs.statSync(path.join(dev.backupDir, latest, f)).size })) : [] };
      } catch { return null; }
    })();
    const deploys = (() => {
      try {
        const history = fs.readFileSync(path.join(dev.autodeployDir, 'history'), 'utf8').trim().split('\n').slice(-10).reverse().map(l => { const [at, sha] = l.split(' '); return { at, sha }; });
        let bad = [];
        try { bad = fs.readFileSync(path.join(dev.autodeployDir, 'bad'), 'utf8').trim().split('\n').filter(Boolean); } catch { /* none */ }
        return { history, bad };
      } catch { return null; }
    })();
    return {
      disk, backups, deploys,
      replays: (() => { const st = dirStats(path.join(cfg.dataDir, 'replays')); if (st) try { st.files = fs.readdirSync(path.join(cfg.dataDir, 'replays')).filter(f => f.endsWith('.ndjson.gz')).length; } catch { /* gone */ } return st; })(),
      analytics: dirStats(path.join(cfg.dataDir, 'analytics')),
      logs: dirStats(path.join(cfg.dataDir, 'logs')),
      static: dirStats(cfg.staticDir),
    };
  });

  function settings() {
    const fromEnvFile = (() => { try { return fs.readFileSync(path.join(root, '.env'), 'utf8').split('\n').map(l => l.match(/^\s*([A-Z0-9_]+)\s*=/)?.[1]).filter(Boolean); } catch { return []; } })();
    const known = new Set(ENV_VARS.map(v => v[0]));
    const vars = ENV_VARS.map(([name, kind]) => ({ name, ...redact(env[name], kind) }));
    for (const name of fromEnvFile) if (!known.has(name)) vars.push({ name, ...redact(env[name], 'secret'), note: 'not read by the server' });
    const effective = {
      port: cfg.port, host: cfg.host, dataDir: cfg.dataDir, staticDir: cfg.staticDir, store: cfg.databaseUrl ? 'postgres' : 'file',
      allowedOrigins: cfg.allowedOrigins.join(', '), maxMatches: cfg.maxMatches, maxPlayers: cfg.maxPlayers,
      tokenSecret: cfg.tokenSecret ? 'from TOKEN_SECRET' : 'generated (data/.token-secret)', adminPage: cfg.adminToken ? 'enabled' : 'disabled',
      devHost: dev.devHost, devAllowIps: dev.devAllowIps.join(', ') || 'any', devSession: `${SESSION_TTL / 3600} h`,
    };
    return { env: vars, effective, hub: hub.config };
  }

  function integrations() {
    const oauth = p => !!(env[`${p}_CLIENT_ID`] && env[`${p}_CLIENT_SECRET`]);
    return [
      { name: 'PostgreSQL (Neon)', on: !!cfg.databaseUrl, detail: cfg.databaseUrl ? `host ${hostOf(cfg.databaseUrl)}` : 'using the file store' },
      { name: 'Email (SMTP)', on: !!env.SMTP_URL, detail: env.SMTP_URL ? `host ${hostOf(env.SMTP_URL)}, from ${env.MAIL_FROM || 'no-reply@…'}` : 'password-reset mails are only logged' },
      { name: 'Google sign-in', on: oauth('GOOGLE'), detail: oauth('GOOGLE') ? 'client id + secret set' : 'GOOGLE_CLIENT_ID / _SECRET missing' },
      { name: 'Discord sign-in', on: oauth('DISCORD'), detail: oauth('DISCORD') ? 'client id + secret set' : 'DISCORD_CLIENT_ID / _SECRET missing' },
      { name: 'Alert webhook', on: !!cfg.alertWebhook, detail: cfg.alertWebhook ? `posts to ${hostOf(cfg.alertWebhook)}` : 'crash/spike alerts are not sent' },
      { name: 'Legacy /admin page', on: !!cfg.adminToken, detail: cfg.adminToken ? 'ADMIN_TOKEN set' : 'disabled' },
    ];
  }

  function game() {
    const matches = [...hub.matches.entries()].map(([id, m]) => {
      const heroes = m.heroes || [];
      return {
        id, mode: m.mode, ranked: !!m.ranked, time: Math.round(m.time || 0), ended: !!m.ended,
        humans: heroes.filter(h => h.key && !String(h.key).startsWith('bot:')).length, bots: heroes.filter(h => String(h.key || '').startsWith('bot:')).length,
        spectators: m.spectators?.size || 0, kills: m.kills || null,
      };
    });
    const states = {};
    for (const s of hub.sessions.values()) states[s.state] = (states[s.state] || 0) + 1;
    return {
      online: hub.sessions.size, states, parties: hub.parties.size, rooms: hub.rooms.size, queue: hub.queue.length, selects: hub.selects.size,
      matches, ticks: hub.stats.ticks, tickMs: Math.round(hub.stats.tickMs * 100) / 100,
      capacity: { maxMatches: hub.config.maxMatches ?? cfg.maxMatches, maxPlayers: hub.config.maxPlayers ?? cfg.maxPlayers, full: hub.isFull(), canStartMatch: hub.canStartMatch() },
      wsClients: wsClients(),
    };
  }

  async function overview() {
    const mem = process.memoryUsage();
    const [db, units, tlsCerts, disk] = await Promise.all([database(), systemd(), certs(), storage()]);
    return {
      at: Date.now(),
      process: {
        pid: process.pid, node: process.version, platform: `${os.type()} ${os.release()}`, hostname: os.hostname(), commit: gitCommit(root),
        uptime: Math.round(process.uptime()), cpuPercent: cpuPercent(), cpus: os.cpus().length, load: os.loadavg().map(n => Math.round(n * 100) / 100),
        memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, external: mem.external, systemTotal: os.totalmem(), systemFree: os.freemem() },
      },
      monitor: monitor.metrics(),
      game: game(),
      database: db,
      systemd: units,
      certs: tlsCerts,
      storage: disk,
      integrations: integrations(),
      settings: settings(),
      api: { catalog: API_CATALOG, usage: usage.snapshot() },
      analytics: analytics.report(30),
      errors: { server: monitor.server.slice(0, 50), client: monitor.client.slice(0, 50) },
      reports: [...reports].reverse().slice(0, 100),
      access: [...access].reverse(),
    };
  }

  /* ---------------- routing ---------------- */
  return {
    /** True when this request is for the dev console's host. */
    owns(req) {
      return String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '') === dev.devHost;
    },

    async handle(req, res, url) {
      const p = url.pathname;
      if (!dev.devToken || (dev.devAllowIps.length && !dev.devAllowIps.includes(clientIp(req)))) return send(res, 404, 'text/plain', 'Not found');
      if (p === '/robots.txt') return send(res, 200, 'text/plain', 'User-agent: *\nDisallow: /\n');

      if (p === '/login' && req.method === 'POST') {
        const ip = clientIp(req);
        if (!sameOrigin(req)) return send(res, 403, 'text/plain', 'Forbidden');
        if (locked(ip)) { audit(req, 'locked'); return send(res, 429, 'text/html; charset=utf-8', page('login.html').toString().replace('<!--msg-->', '<p class="err">Too many attempts. Try again in 15 minutes.</p>'), { 'Retry-After': '900' }); }
        const form = await readForm(req);
        const token = form?.get('token') || '';
        if (!token || !safeEqual(token, dev.devToken)) {
          recentFails(ip).push(Date.now()); globalFails.push(Date.now());
          audit(req, 'login failed');
          if (recentFails(ip).length >= 5) monitor.alert('devlogin', `⚠️ BroadRoads dev console: repeated failed sign-ins from ${ip}.`);
          return send(res, 401, 'text/html; charset=utf-8', page('login.html').toString().replace('<!--msg-->', '<p class="err">That token is not right.</p>'));
        }
        failures.delete(ip);
        audit(req, 'signed in');
        const cookie = signToken(key, { dev: 1, k: fingerprint() }, SESSION_TTL);
        return send(res, 303, 'text/plain', '', { Location: '/', 'Set-Cookie': `${COOKIE}=${cookie}; Path=/; Max-Age=${SESSION_TTL}; HttpOnly; Secure; SameSite=Strict` });
      }

      if (p === '/logout' && req.method === 'POST') {
        if (!sameOrigin(req)) return send(res, 403, 'text/plain', 'Forbidden');
        if (session(req)) audit(req, 'signed out');
        return send(res, 303, 'text/plain', '', { Location: '/', 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict` });
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'text/plain', 'Method not allowed');
      const authed = session(req);
      if (p === '/') return send(res, 200, 'text/html; charset=utf-8', authed ? page('index.html') : page('login.html'));
      if (p === '/login.css') return send(res, 200, 'text/css; charset=utf-8', page('login.css'));
      if (!authed) return p.startsWith('/api/') ? send(res, 401, 'application/json', '{"error":"Sign in first"}') : send(res, 404, 'text/plain', 'Not found');
      if (p === '/app.js') return send(res, 200, 'text/javascript; charset=utf-8', page('app.js'));
      if (p === '/app.css') return send(res, 200, 'text/css; charset=utf-8', page('app.css'));
      if (p === '/api/overview') {
        try { return send(res, 200, 'application/json', JSON.stringify(await overview())); } catch (err) { log.error('dev console overview', err); return send(res, 500, 'application/json', '{"error":"overview failed"}'); }
      }
      return send(res, 404, 'text/plain', 'Not found');
    },
  };
}
