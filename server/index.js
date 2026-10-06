/* BroadRoads game server: static client + REST auth API + WebSocket game gateway. */
import http from 'node:http';
import { accountRoutes } from './accounts.js';
import { fileAnalytics } from './analytics.js';
import { encodeSnapshot } from '../shared/protocol.js';
import { CHAMPION_IDS, championInfo } from '../shared/moba/champions.js';
import { ITEMS, SPELLS, SECOND_SPELLS } from '../shared/moba/items.js';
import { Monitor } from './monitor.js';
import { devConsole, API_CATALOG } from './devconsole.js';
import { Usage, routeKey } from './usage.js';
import { fileReplays } from './replays.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Hub } from '../shared/hub.js';
import { NAME_RE, PROTOCOL_VERSION } from '../shared/constants.js';
import { hashPassword, verifyPassword, isLegacyHash, signToken, verifyToken } from './auth.js';
import { FileStore } from './store/file.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Load .env when present (variables already set in the environment win).
if (fs.existsSync(path.join(ROOT, '.env')) && typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(path.join(ROOT, '.env')); } catch (err) { console.warn('Could not read .env:', err.message); }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.glb': 'model/gltf-binary', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json', '.mp4': 'video/mp4',
};

export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT) || 8080,
    host: env.HOST || '0.0.0.0',
    dataDir: path.resolve(env.DATA_DIR || path.join(ROOT, 'data')),
    staticDir: path.resolve(env.STATIC_DIR || path.join(ROOT, 'dist')),
    databaseUrl: env.DATABASE_URL || env.POSTGRES_URL || '',
    tokenSecret: env.TOKEN_SECRET || '',
    allowedOrigins: (env.ALLOWED_ORIGINS || 'https://broadroads.com,https://www.broadroads.com,http://localhost:5173,http://localhost:8080,http://127.0.0.1:5173,http://127.0.0.1:8080')
      .split(',').map(s => s.trim()).filter(Boolean),
    selectTime: env.SELECT_TIME ? Number(env.SELECT_TIME) : undefined,
    queueBotWait: env.QUEUE_BOT_WAIT ? Number(env.QUEUE_BOT_WAIT) : undefined,
    quiet: env.QUIET === '1',
    adminToken: env.ADMIN_TOKEN || '',
    maxMatches: Number(env.MAX_MATCHES) || 20,
    maxPlayers: Number(env.MAX_PLAYERS) || 400,
    alertWebhook: env.ALERT_WEBHOOK || '',
  };
}

async function createStore(cfg) {
  if (cfg.databaseUrl) {
    const { PgStore } = await import('./store/pg.js');
    return new PgStore(cfg.databaseUrl).init();
  }
  return new FileStore(cfg.dataDir).init();
}

function loadSecret(cfg) {
  if (cfg.tokenSecret) return cfg.tokenSecret;
  // Persist a generated secret so tokens survive restarts.
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  const file = path.join(cfg.dataDir, '.token-secret');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = crypto.randomBytes(48).toString('base64url');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

class RateLimiter {
  constructor(limit, windowMs) { this.limit = limit; this.windowMs = windowMs; this.hits = new Map(); }
  allow(key) {
    const now = Date.now();
    const h = this.hits.get(key);
    if (!h || now - h.start > this.windowMs) { this.hits.set(key, { start: now, n: 1 }); return true; }
    h.n++;
    return h.n <= this.limit;
  }
  sweep() {
    const now = Date.now();
    for (const [k, h] of this.hits) if (now - h.start > this.windowMs) this.hits.delete(k);
  }
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (typeof fwd === 'string' && fwd.split(',')[0].trim()) || req.socket.remoteAddress || '?';
}

function readBody(req, max = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > max) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); } catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

export async function startServer(overrides = {}) {
  const cfg = { ...loadConfig(), ...overrides };
  const log = cfg.quiet ? { log() {}, info() {}, warn() {}, error: console.error } : console;
  const store = overrides.store || await createStore(cfg);
  const secret = loadSecret(cfg);
  const hubConfig = {};
  for (const k of ['queueBotWait', 'selectTime', 'maxMatches', 'maxPlayers']) if (cfg[k] !== undefined) hubConfig[k] = cfg[k];
  const replays = fileReplays(cfg.dataDir);
  const analytics = fileAnalytics(cfg.dataDir, log);
  // Static game data for logged-out replay viewers (shared links).
  const gameData = { champions: CHAMPION_IDS.map(championInfo), items: ITEMS, spells: SPELLS, second: SECOND_SPELLS };
  const hub = new Hub({ store, config: hubConfig, log, replays, analytics });
  const monitor = new Monitor({ dataDir: cfg.dataDir, log, webhook: cfg.alertWebhook, hub });
  hub.onError = (where, err) => monitor.serverError(where, err);
  // Player reports: appended to data/reports.ndjson, the latest 200 kept for /admin.
  const reports = [];
  const reportFile = path.join(cfg.dataDir, 'reports.ndjson');
  try { for (const line of fs.readFileSync(reportFile, 'utf8').trim().split('\n').slice(-200)) if (line) reports.push(JSON.parse(line)); } catch { /* none yet */ }
  hub.reportSink = r => { reports.push(r); if (reports.length > 200) reports.shift(); fs.appendFile(reportFile, JSON.stringify(r) + '\n', () => {}); };
  hub.onTick = ms => monitor.noteTick(ms);
  hub.start();
  monitor.started();
  const usage = new Usage();
  const knownApi = new Set(API_CATALOG.map(r => r.path));
  let wss = null;
  const dev = devConsole({ cfg, root: ROOT, hub, store, monitor, analytics, usage, reports, wsClients: () => wss.clients.size, secret, log, clientIp });
  const adminPage = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'admin.html'));
  const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

  const authLimiter = new RateLimiter(20, 10 * 60 * 1000);
  let accountRoute = null; // set after json/readBody exist
  const sweep = setInterval(() => authLimiter.sweep(), 60 * 1000);
  const startedAt = Date.now();

  const json = (res, status, data, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
    res.end(JSON.stringify(data));
  };

  const corsHeaders = req => {
    const origin = req.headers.origin;
    if (origin && cfg.allowedOrigins.includes(origin)) {
      return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
    }
    return {};
  };

  async function handleAuth(req, res, mode) {
    const cors = corsHeaders(req);
    if (!authLimiter.allow(clientIp(req))) return json(res, 429, { error: 'Too many attempts. Try again in a few minutes.' }, cors);
    let body;
    try { body = await readBody(req); } catch { return json(res, 413, { error: 'Request too large' }, cors); }
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    if (!NAME_RE.test(username)) return json(res, 400, { error: 'Username must be 3-16 letters, numbers or _ and start with a letter.' }, cors);
    if (password.length < 6 || password.length > 128) return json(res, 400, { error: 'Password must be 6-128 characters.' }, cors);
    if (mode === 'register') {
      const email = String(body.email || '').trim().toLowerCase();
      if (email && !/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/.test(email)) return json(res, 400, { error: 'That email address does not look right.' }, cors);
      if (email && store.findAccountBy && await store.findAccountBy('email', email)) return json(res, 409, { error: 'That email is already used by another account.' }, cors);
      const acc = await store.createAccount(username, hashPassword(password));
      if (!acc) return json(res, 409, { error: 'That username is taken.' }, cors);
      if (email && store.updateAccountMeta) await store.updateAccountMeta(acc.id, { email });
      return json(res, 200, { token: signToken(secret, { a: acc.id, n: acc.username }), username: acc.username }, cors);
    }
    const acc = await store.findAccount(username);
    if (!acc || !verifyPassword(password, acc.passwordHash)) return json(res, 401, { error: 'Wrong username or password.' }, cors);
    if (isLegacyHash(acc.passwordHash)) await store.updatePasswordHash(acc.id, hashPassword(password));
    return json(res, 200, { token: signToken(secret, { a: acc.id, n: acc.username }), username: acc.username }, cors);
  }

  function serveStatic(req, res, pathname) {
    let rel = decodeURIComponent(pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.normalize(path.join(cfg.staticDir, rel));
    if (!file.startsWith(cfg.staticDir)) { res.writeHead(403); return res.end(); }
    let target = file;
    const index = path.join(cfg.staticDir, 'index.html');
    if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      if (path.extname(rel) && target !== index) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
      target = index; // SPA fallback
    }
    if (!fs.existsSync(target)) {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      return res.end('Client not built. Run `npm run build`.');
    }
    const ext = path.extname(target);
    const immutable = target.includes(`${path.sep}assets${path.sep}`);
    const audio = (target.includes(`${path.sep}sfx${path.sep}`) && ext === '.mp3') || ext === '.glb'; // .glb URLs carry ?v=
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : audio || ext === '.mp4' ? 'public, max-age=86400' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Accept-Ranges': 'bytes',
    };
    // Byte ranges: Safari only plays video that can be fetched in pieces.
    const size = fs.statSync(target).size;
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start >= size || start > end) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(target, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...headers, 'Content-Length': size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(target).pipe(res);
  }

  const server = http.createServer(async (req, res) => {
    const t0 = performance.now(), sent0 = req.socket.bytesWritten;
    try {
      const url = new URL(req.url, 'http://localhost');
      const p = url.pathname;
      if (dev.owns(req)) {
        res.on('finish', () => usage.http(req.method, `dev console`, res.statusCode, performance.now() - t0, req.socket.bytesWritten - sent0));
        return await dev.handle(req, res, url);
      }
      res.on('finish', () => usage.http(req.method, routeKey(p, knownApi), res.statusCode, performance.now() - t0, req.socket.bytesWritten - sent0));
      const rp = /^\/replays\/([a-z0-9]+)\.ndjson$/.exec(p);
      if (rp) {
        const file = replays.file(rp[1]);
        if (!file) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Content-Encoding': 'gzip', 'Cache-Control': 'public, max-age=86400' });
        return fs.createReadStream(file).pipe(res);
      }
      if (p === '/admin') {
        if (!cfg.adminToken) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
        return res.end(adminPage);
      }
      if (p.startsWith('/api/')) {
        const cors = corsHeaders(req);
        if (p === '/api/client-error' && req.method === 'POST') {
          let body;
          try { body = await readBody(req, 8 * 1024); } catch { return json(res, 400, { ok: false }, cors); }
          monitor.clientError(clientIp(req), body || {});
          return json(res, 200, { ok: true }, cors);
        }
        if (p === '/api/admin/metrics') {
          if (!cfg.adminToken || !safeEqual(req.headers['x-admin-token'] || '', cfg.adminToken)) return json(res, 401, { error: 'Unauthorized' });
          return json(res, 200, { metrics: monitor.metrics(), server: monitor.server, client: monitor.client, analytics: analytics.report(14), reports: [...reports].reverse() });
        }
        if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
        if (p === '/api/health') {
          return json(res, 200, {
            ok: true, game: 'broadroads', protocol: PROTOCOL_VERSION, online: hub.sessions.size, full: hub.isFull(), busy: !hub.canStartMatch(),
            matches: hub.matches.size, tickMs: Math.round(hub.stats.tickMs * 100) / 100, uptime: Math.round((Date.now() - startedAt) / 1000),
          }, cors);
        }
        accountRoute ||= accountRoutes({ cfg, store, secret, log, json, readBody, limiter: authLimiter, clientIp });
        if (await accountRoute(req, res, p, url, cors)) return;
        if (p === '/api/auth/register' && req.method === 'POST') return await handleAuth(req, res, 'register');
        if (p === '/api/auth/login' && req.method === 'POST') return await handleAuth(req, res, 'login');
        if (p === '/api/leaderboard') return json(res, 200, { kind: url.searchParams.get('kind') || 'rating', rows: await hub.leaderboard(url.searchParams.get('kind') || 'rating') }, cors);
        if (p === '/api/gamedata') return json(res, 200, gameData, { ...cors, 'Cache-Control': 'public, max-age=3600' });
        if (p === '/api/stats') return json(res, 200, { online: hub.sessions.size, matches: hub.matches.size, ...(await store.counts()) }, cors);
        return json(res, 404, { error: 'Not found' }, cors);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
      // Shared replay links get their own link preview (title/description).
      const rid = (p === '/' || p === '/index.html') && url.searchParams.get('replay');
      if (rid && /^[a-z0-9]{6,24}$/.test(rid)) {
        const meta = replays.meta(rid);
        const index = path.join(cfg.staticDir, 'index.html');
        if (meta && fs.existsSync(index)) {
          const best = [...(meta.highlights || [])].sort((a, b) => b.score - a.score)[0];
          const champ = best && best.champ ? `${best.champ[0].toUpperCase()}${best.champ.slice(1)}: ` : '';
          const title = `${best ? `${champ}${best.label}` : 'Match replay'} — BroadRoads`;
          const desc = `Watch this ${meta.mode} match on BroadRoads (${meta.kills.blue}–${meta.kills.red}, ${Math.round(meta.duration / 60)} min). Free 5v5 MOBA in your browser.`;
          const esc = t => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
          const html = fs.readFileSync(index, 'utf8')
            .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
            .replace(/(property="og:title" content=")[^"]*/, `$1${esc(title)}`).replace(/(name="twitter:title" content=")[^"]*/, `$1${esc(title)}`)
            .replace(/(property="og:description" content=")[^"]*/, `$1${esc(desc)}`).replace(/(name="twitter:description" content=")[^"]*/, `$1${esc(desc)}`);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
          return res.end(html);
        }
      }
      serveStatic(req, res, p);
    } catch (err) {
      log.error('HTTP error', err);
      if (!res.headersSent) json(res, 500, { error: 'Server error' });
      else res.end();
    }
  });

  // permessage-deflate: ~55% smaller frames; context takeover keeps the dictionary between snapshots.
  wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024, perMessageDeflate: { threshold: 128, zlibDeflateOptions: { level: 4, memLevel: 7 }, concurrencyLimit: 4 } });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    const origin = req.headers.origin;
    if (url.pathname !== '/ws' || dev.owns(req) || (origin && !cfg.allowedOrigins.includes(origin) && !sameHost(origin, req.headers.host))) {
      usage.ws.refused++;
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws, req) => {
    let session = null;
    let msgCount = 0;
    let windowStart = Date.now();
    ws.isAlive = true;
    usage.ws.opened++;
    ws.on('pong', () => { ws.isAlive = true; });
    // Snapshots go out as compact binary frames; everything else as JSON text.
    const send = msg => {
      if (ws.readyState !== 1) return;
      // A slow link skips a movement frame rather than queueing it.
      if (ws.bufferedAmount > 512 * 1024 && msg.t === 's' && !msg.fx) { usage.ws.skipped++; return; }
      const data = msg.t === 's' ? encodeSnapshot(msg) : JSON.stringify(msg);
      usage.wsMessageOut(data.length);
      ws.send(data);
    };
    const authTimer = setTimeout(() => { if (!session) ws.close(4001, 'auth timeout'); }, 10000);

    ws.on('message', async raw => {
      const now = Date.now();
      if (now - windowStart > 1000) { windowStart = now; msgCount = 0; }
      usage.wsMessageIn(raw.length);
      if (++msgCount > 120) { usage.ws.flooded++; return; } // drop floods
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (!session) {
        if (msg.t !== 'auth' || session === undefined) return;
        const tok = verifyToken(secret, msg.token);
        if (!tok) { usage.ws.authFailed++; send({ t: 'authFail', error: 'Session expired. Please log in again.' }); ws.close(4003, 'bad token'); return; }
        if (hub.isFull() && !hub.byAccount.has(tok.a) && !hub.activeByAccount.has(tok.a)) { ws.close(4005, 'server full'); return; } // players in a match can always come back
        clearTimeout(authTimer);
        session = undefined; // authenticating
        const s = await hub.connect({ accountId: tok.a, name: tok.n, send, meta: { ip: clientIp(req) } });
        s.close = () => ws.close(4000, 'replaced');
        session = s;
        usage.ws.authed++;
        if (ws.readyState !== 1) hub.disconnect(s);
        return;
      }
      try { hub.handle(session, msg); } catch (err) { log.error('handle error', msg && msg.t, err); }
    });

    ws.on('close', code => {
      usage.wsClosed(code);
      clearTimeout(authTimer);
      if (session) hub.disconnect(session);
    });
    ws.on('error', () => {});
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);

  await new Promise(resolve => server.listen(cfg.port, cfg.host, resolve));
  const address = server.address();
  log.info(`BroadRoads server listening on http://${cfg.host}:${address.port} (${cfg.databaseUrl ? 'postgres' : 'file store at ' + cfg.dataDir})`);

  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    clearInterval(heartbeat);
    clearInterval(sweep);
    hub.stop();
    for (const s of [...hub.sessions.values()]) await hub.disconnect(s);
    for (const ws of wss.clients) ws.close(1001, 'server shutting down');
    await new Promise(r => server.close(r));
    if (store.close) await store.close();
    monitor.shutdown();
    analytics.flush();
  }

  return { server, hub, store, stop, port: address.port, config: cfg, monitor, usage };
}

function sameHost(origin, host) {
  try { return new URL(origin).host === host; } catch { return false; }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const app = await startServer();
  // Crashes are logged (and alerted) before exiting; systemd restarts the server.
  process.on('uncaughtException', err => { console.error('uncaught exception', err); app.monitor.serverError('uncaught exception', err); process.exit(1); });
  process.on('unhandledRejection', err => { console.error('unhandled rejection', err); app.monitor.serverError('unhandled rejection', err); });
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => {
      console.info(`${sig} received, saving players and shutting down…`);
      await app.stop();
      process.exit(0);
    });
  }
}
