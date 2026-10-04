import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { startServer } from '../server/index.js';
import { signToken, verifyToken, hashPassword, verifyPassword } from '../server/auth.js';
import crypto from 'node:crypto';

let app, base, dataDir;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'br-test-'));
  app = await startServer({ port: 0, host: '127.0.0.1', dataDir, staticDir: path.join(dataDir, 'nodist'), quiet: true, databaseUrl: '' });
  base = `http://127.0.0.1:${app.port}`;
});

after(async () => {
  await app.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function client(token) {
  const ws = new WebSocket(`ws://127.0.0.1:${app.port}/ws`);
  const inbox = [];
  const waiters = [];
  ws.on('message', d => {
    const m = JSON.parse(d);
    inbox.push(m);
    for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); }
  });
  const c = {
    ws, inbox,
    send: m => ws.send(JSON.stringify(m)),
    wait: (pred, ms = 5000) => new Promise((resolve, reject) => {
      const found = inbox.find(pred);
      if (found) return resolve(found);
      const w = { pred, resolve };
      waiters.push(w);
      setTimeout(() => reject(new Error('timeout waiting for message')), ms);
    }),
    close: () => new Promise(r => { ws.once('close', r); ws.close(); }),
  };
  return new Promise((resolve, reject) => {
    ws.once('open', () => { c.send({ t: 'auth', token }); resolve(c); });
    ws.once('error', reject);
  });
}

test('password hashing and tokens', () => {
  const h = hashPassword('hunter22');
  assert.ok(h.startsWith('scrypt$'));
  assert.ok(verifyPassword('hunter22', h));
  assert.ok(!verifyPassword('hunter23', h));
  const legacy = crypto.createHash('sha256').update('oldpass').digest('hex');
  assert.ok(verifyPassword('oldpass', legacy), 'legacy sha256 hashes still verify');
  const tok = signToken('s3cret', { a: '1', n: 'Bob' });
  assert.equal(verifyToken('s3cret', tok).n, 'Bob');
  assert.equal(verifyToken('other', tok), null);
  assert.equal(verifyToken('s3cret', tok.slice(0, -2) + 'xx'), null);
  assert.equal(verifyToken('s3cret', signToken('s3cret', { a: '1' }, -10)), null, 'expired');
});

test('health endpoint', async () => {
  const r = await fetch(base + '/api/health');
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.game, 'broadroads');
});

test('register, login, validation and duplicate names', async () => {
  let r = await post('/api/auth/register', { username: 'Knight', password: 'secret123' });
  assert.equal(r.status, 200);
  const { token } = await r.json();
  assert.ok(token);
  r = await post('/api/auth/register', { username: 'knight', password: 'secret123' });
  assert.equal(r.status, 409, 'usernames are case-insensitive unique');
  r = await post('/api/auth/register', { username: 'x', password: 'secret123' });
  assert.equal(r.status, 400);
  r = await post('/api/auth/register', { username: 'Valid', password: '123' });
  assert.equal(r.status, 400);
  r = await post('/api/auth/login', { username: 'Knight', password: 'wrongpass' });
  assert.equal(r.status, 401);
  r = await post('/api/auth/login', { username: 'KNIGHT', password: 'secret123' });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).username, 'Knight');
});

test('websocket: bad tokens are rejected', async () => {
  const c = await client('nope');
  const m = await c.wait(x => x.t === 'authFail');
  assert.ok(m.error);
});

test('websocket: foreign origins are rejected', async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${app.port}/ws`, { headers: { Origin: 'https://evil.example' } });
  const err = await new Promise(resolve => { ws.on('error', resolve); ws.on('open', () => resolve(null)); });
  assert.ok(err, 'connection refused');
});

test('two players meet in the world, chat, party up and enter a dungeon together', async () => {
  const tA = (await (await post('/api/auth/register', { username: 'Ayla', password: 'secret123' })).json()).token;
  const tB = (await (await post('/api/auth/register', { username: 'Brom', password: 'secret123' })).json()).token;
  const a = await client(tA);
  const b = await client(tB);
  await a.wait(m => m.t === 'needChar');
  a.send({ t: 'create', cls: 'gunner' });
  await b.wait(m => m.t === 'needChar');
  b.send({ t: 'create', cls: 'arcanist' });
  await a.wait(m => m.t === 'zone' && m.zone.kind === 'world');
  await b.wait(m => m.t === 'zone');
  await a.wait(m => m.t === 's' && (m.a || []).some(e => e.k === 'player' && e.n === 'Brom'));

  // Movement is authoritative and acknowledged.
  const start = (await a.wait(m => m.t === 's' && m.me)).me;
  for (let i = 1; i <= 10; i++) a.send({ t: 'in', s: i, mx: 0, my: 1, ax: 0, ay: 0, at: false });
  const moved = await a.wait(m => m.t === 's' && m.me && m.me.ack === 10);
  assert.ok(moved.me.y > start.y + 1, `moved from ${start.y} to ${moved.me.y}`);

  a.send({ t: 'chat', ch: 'say', text: 'well met' });
  const said = await b.wait(m => m.t === 'chat' && m.text === 'well met');
  assert.equal(said.from, 'Ayla');

  a.send({ t: 'party', op: 'invite', name: 'Brom' });
  const inv = await b.wait(m => m.t === 'invite');
  b.send({ t: 'party', op: 'accept', party: inv.party });
  await a.wait(m => m.t === 'party' && m.party && m.party.members.length === 2);
  a.send({ t: 'dungeon', op: 'enter', mode: 'party' });
  const za = await a.wait(m => m.t === 'zone' && m.zone.kind === 'dungeon');
  const zb = await b.wait(m => m.t === 'zone' && m.zone.kind === 'dungeon');
  assert.equal(za.zone.id, zb.zone.id);

  // Leaderboard API includes online players.
  const lb = await (await fetch(base + '/api/leaderboard?kind=level')).json();
  assert.ok(lb.rows.some(r => r.name === 'Ayla'));

  await a.close();
  await b.close();
});

test('characters are saved and survive a server restart', async () => {
  const token = (await (await post('/api/auth/register', { username: 'Persist', password: 'secret123' })).json()).token;
  let c = await client(token);
  await c.wait(m => m.t === 'needChar');
  c.send({ t: 'create', cls: 'paladin' });
  await c.wait(m => m.t === 'char');
  c.send({ t: 'pot', k: 'hp' }); // no-op in town at full health, but exercises the path
  await c.close();
  await new Promise(r => setTimeout(r, 200));
  await app.stop();
  app = await startServer({ port: 0, host: '127.0.0.1', dataDir, staticDir: path.join(dataDir, 'nodist'), quiet: true, databaseUrl: '' });
  base = `http://127.0.0.1:${app.port}`;
  c = await client(token);
  const ch = await c.wait(m => m.t === 'char');
  assert.equal(ch.char.name, 'Persist');
  assert.equal(ch.char.cls, 'paladin');
  assert.ok(!c.inbox.some(m => m.t === 'needChar'));
  await c.close();
});

test('missing client build gives a helpful message', async () => {
  const r = await fetch(base + '/');
  assert.equal(r.status, 503);
  assert.match(await r.text(), /npm run build/);
  const t = await fetch(base + '/../../etc/passwd');
  assert.notEqual(t.status, 200);
});
