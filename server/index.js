/* BroadRoads game server: static client + REST auth API + WebSocket game gateway. */
import http from 'node:http';
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
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.glb': 'model/gltf-binary', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
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
  for (const k of ['queueBotWait', 'selectTime']) if (cfg[k] !== undefined) hubConfig[k] = cfg[k];
  const hub = new Hub({ store, config: hubConfig, log });
  hub.start();

  const authLimiter = new RateLimiter(20, 10 * 60 * 1000);
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
      const acc = await store.createAccount(username, hashPassword(password));
      if (!acc) return json(res, 409, { error: 'That username is taken.' }, cors);
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
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : audio ? 'public, max-age=86400' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(target).pipe(res);
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const p = url.pathname;
      if (p.startsWith('/api/')) {
        const cors = corsHeaders(req);
        if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
        if (p === '/api/health') {
          return json(res, 200, {
            ok: true, game: 'broadroads', protocol: PROTOCOL_VERSION, online: hub.sessions.size,
            matches: hub.matches.size, tickMs: Math.round(hub.stats.tickMs * 100) / 100, uptime: Math.round((Date.now() - startedAt) / 1000),
          }, cors);
        }
        if (p === '/api/auth/register' && req.method === 'POST') return await handleAuth(req, res, 'register');
        if (p === '/api/auth/login' && req.method === 'POST') return await handleAuth(req, res, 'login');
        if (p === '/api/leaderboard') return json(res, 200, { kind: url.searchParams.get('kind') || 'rating', rows: await hub.leaderboard(url.searchParams.get('kind') || 'rating') }, cors);
        if (p === '/api/stats') return json(res, 200, { online: hub.sessions.size, matches: hub.matches.size, ...(await store.counts()) }, cors);
        return json(res, 404, { error: 'Not found' }, cors);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
      serveStatic(req, res, p);
    } catch (err) {
      log.error('HTTP error', err);
      if (!res.headersSent) json(res, 500, { error: 'Server error' });
      else res.end();
    }
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    const origin = req.headers.origin;
    if (url.pathname !== '/ws' || (origin && !cfg.allowedOrigins.includes(origin) && !sameHost(origin, req.headers.host))) {
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
    ws.on('pong', () => { ws.isAlive = true; });
    const send = msg => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
    const authTimer = setTimeout(() => { if (!session) ws.close(4001, 'auth timeout'); }, 10000);

    ws.on('message', async raw => {
      const now = Date.now();
      if (now - windowStart > 1000) { windowStart = now; msgCount = 0; }
      if (++msgCount > 120) return; // drop floods
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (!session) {
        if (msg.t !== 'auth' || session === undefined) return;
        const tok = verifyToken(secret, msg.token);
        if (!tok) { send({ t: 'authFail', error: 'Session expired. Please log in again.' }); ws.close(4003, 'bad token'); return; }
        clearTimeout(authTimer);
        session = undefined; // authenticating
        const s = await hub.connect({ accountId: tok.a, name: tok.n, send, meta: { ip: clientIp(req) } });
        s.close = () => ws.close(4000, 'replaced');
        session = s;
        if (ws.readyState !== 1) hub.disconnect(s);
        return;
      }
      try { hub.handle(session, msg); } catch (err) { log.error('handle error', msg && msg.t, err); }
    });

    ws.on('close', () => {
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
  }

  return { server, hub, store, stop, port: address.port, config: cfg };
}

function sameHost(origin, host) {
  try { return new URL(origin).host === host; } catch { return false; }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const app = await startServer();
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => {
      console.info(`${sig} received, saving players and shutting down…`);
      await app.stop();
      process.exit(0);
    });
  }
}
