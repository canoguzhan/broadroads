import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { startServer } from '../server/index.js';
import { routeKey, Usage } from '../server/usage.js';

const TOKEN = 'dev-token-0123456789abcdef';
const SECRET = 'token-secret-should-never-leak';
const HOOK = 'https://hooks.example.com/super-secret-path';
let app, dataDir;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'br-dev-'));
  app = await startServer({ port: 0, host: '127.0.0.1', dataDir, staticDir: path.join(dataDir, 'nodist'), quiet: true, databaseUrl: '', adminToken: TOKEN, tokenSecret: SECRET, alertWebhook: HOOK, dev: { devHost: 'dev.test', probe: false } });
});

after(async () => {
  await app.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

/** A raw request with a chosen Host header (fetch cannot set Host). */
function req(p, { method = 'GET', host = 'dev.test', headers = {}, body = null, ip = '10.0.0.1' } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: app.port, path: p, method, headers: { Host: host, 'X-Forwarded-For': ip, ...headers } }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}
const login = (token, ip, headers = {}) => req('/login', { method: 'POST', ip, body: `token=${encodeURIComponent(token)}`, headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://dev.test', ...headers } });
const cookieOf = r => String(r.headers['set-cookie'] || '').split(';')[0];

test('the dev host serves only the console, with security headers', async () => {
  const page = await req('/');
  assert.equal(page.status, 200);
  assert.match(page.body, /Access token/);
  assert.doesNotMatch(page.body, /app\.js/, 'dashboard code is not sent before sign-in');
  assert.match(page.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal(page.headers['x-frame-options'], 'DENY');
  assert.equal(page.headers['cache-control'], 'no-store');
  assert.match(page.headers['x-robots-tag'], /noindex/);
  assert.equal((await req('/api/health')).status, 401, 'game API is not reachable on the dev host');
  assert.equal((await req('/api/overview')).status, 401);
  assert.equal((await req('/app.js')).status, 404);
  // The game host never serves the console.
  const game = await req('/api/overview', { host: '127.0.0.1' });
  assert.equal(game.status, 404);
});

test('sign-in sets a hardened cookie and unlocks the overview', async () => {
  const bad = await login('wrong', '10.0.0.2');
  assert.equal(bad.status, 401);
  assert.equal(bad.headers['set-cookie'], undefined);
  const ok = await login(TOKEN, '10.0.0.2');
  assert.equal(ok.status, 303);
  const set = String(ok.headers['set-cookie']);
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) assert.ok(set.includes(flag), flag);
  assert.ok(set.startsWith('__Host-br_dev='));
  const cookie = cookieOf(ok);
  assert.match((await req('/', { headers: { Cookie: cookie } })).body, /app\.js/);
  assert.equal((await req('/app.js', { headers: { Cookie: cookie } })).status, 200);
  const ov = await req('/api/overview', { headers: { Cookie: cookie } });
  assert.equal(ov.status, 200);
  const d = JSON.parse(ov.body);
  for (const k of ['process', 'monitor', 'game', 'database', 'settings', 'api', 'analytics', 'errors', 'access', 'integrations', 'storage']) assert.ok(k in d, k);
  assert.ok(d.api.catalog.some(r => r.path === '/api/health'));
  assert.ok(d.access.some(a => a.event === 'signed in'));
  // No secret ever reaches the page.
  for (const secret of [TOKEN, SECRET, 'super-secret-path']) assert.ok(!ov.body.includes(secret), `leaked ${secret}`);
  assert.ok(d.integrations.find(i => i.name === 'Alert webhook').detail.includes('hooks.example.com'));
  // A forged or game-signed cookie does not work.
  assert.equal((await req('/api/overview', { headers: { Cookie: `${cookie}x` } })).status, 401);
});

test('cross-site sign-in posts are refused', async () => {
  const r = await login(TOKEN, '10.0.0.3', { Origin: 'https://evil.example' });
  assert.equal(r.status, 403);
  assert.equal((await login(TOKEN, '10.0.0.3', { 'Sec-Fetch-Site': 'cross-site', Origin: 'null' })).status, 403);
  // Browsers may send "Origin: null" on same-site form posts; Sec-Fetch-Site decides.
  assert.equal((await login(TOKEN, '10.0.0.3', { 'Sec-Fetch-Site': 'same-origin', Origin: 'null' })).status, 303);
});

test('repeated failures lock the IP out', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await login('nope', '10.0.0.4')).status, 401);
  const locked = await login(TOKEN, '10.0.0.4');
  assert.equal(locked.status, 429, 'even the right token is refused while locked');
  assert.equal((await login(TOKEN, '10.0.0.5')).status, 303, 'other IPs are unaffected');
});

test('WebSocket upgrades are refused on the dev host', async () => {
  const r = await req('/ws', { headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==' } }).catch(() => ({ status: 0 }));
  assert.notEqual(r.status, 101);
});

test('API usage is counted per route', async () => {
  await fetch(`http://127.0.0.1:${app.port}/api/health`);
  await fetch(`http://127.0.0.1:${app.port}/api/nope`);
  const snap = app.usage.snapshot();
  const health = snap.routes.find(r => r.route === '/api/health');
  assert.ok(health.n >= 1 && health.s2 >= 1);
  assert.ok(snap.routes.find(r => r.route === '/api/* (unknown)').s4 >= 1);
  assert.equal(snap.timeline.length, 60);
});

test('route keys stay bounded', () => {
  assert.equal(routeKey('/replays/abc123.ndjson'), '/replays/:id.ndjson');
  assert.equal(routeKey('/models/x/y.glb'), '/models/*');
  assert.equal(routeKey('/wp-admin/install.php'), 'static (other)');
  assert.equal(routeKey('/api/auth/oauth/google/callback'), '/api/auth/oauth/google/callback');
  const u = new Usage();
  for (let i = 0; i < 500; i++) u.http('GET', `/r${i}`, 200, 1, 10);
  assert.ok(u.routes.size <= 151);
});
