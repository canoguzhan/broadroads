import { test, before, after } from 'node:test';
import { decodeSnapshot } from '../shared/protocol.js';
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
  app = await startServer({ port: 0, host: '127.0.0.1', dataDir, staticDir: path.join(dataDir, 'nodist'), quiet: true, databaseUrl: '', selectTime: 3 });
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
  ws.on('message', (d, binary) => {
    const m = binary ? decodeSnapshot(d) : JSON.parse(d);
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

test('two players chat in the lobby, make a custom room and play the same match', async () => {
  const tA = (await (await post('/api/auth/register', { username: 'Ayla', password: 'secret123' })).json()).token;
  const tB = (await (await post('/api/auth/register', { username: 'Brom', password: 'secret123' })).json()).token;
  const a = await client(tA);
  const b = await client(tB);
  const hello = await a.wait(m => m.t === 'hello');
  assert.equal(hello.champions.length, 12);
  await a.wait(m => m.t === 'lobby');
  await b.wait(m => m.t === 'lobby');

  a.send({ t: 'chat', ch: 'global', text: 'anyone up for a game?' });
  const said = await b.wait(m => m.t === 'chat' && m.text === 'anyone up for a game?');
  assert.equal(said.from, 'Ayla');

  a.send({ t: 'room', op: 'create' });
  const room = await a.wait(m => m.t === 'lobby' && m.state === 'room');
  b.send({ t: 'room', op: 'join', code: room.room.code });
  await a.wait(m => m.t === 'lobby' && m.room && m.room.blue.filter(Boolean).length + m.room.red.filter(Boolean).length === 2);
  a.send({ t: 'room', op: 'start' });
  await a.wait(m => m.t === 'select');
  a.send({ t: 'pick', champ: 'lyra' });
  b.send({ t: 'pick', champ: 'hale' });
  a.send({ t: 'lock' });
  b.send({ t: 'lock' });
  const ma = await a.wait(m => m.t === 'match', 15000);
  const mb = await b.wait(m => m.t === 'match', 15000);
  assert.equal(ma.id, mb.id);
  assert.equal(ma.players.find(p => p.id === ma.you).champ, 'lyra');
  const snap = await a.wait(m => m.t === 's' && m.me);
  assert.equal(snap.me.lv, 1);
  a.send({ t: 'lvl', sl: 'q' });
  await a.wait(m => m.t === 's' && m.me && m.me.rk.q === 1);

  const lb = await (await fetch(base + '/api/leaderboard?kind=rating')).json();
  assert.ok(lb.rows.some(r => r.name === 'Ayla'));
  await a.close();
  await b.close();
});

test('profiles are saved and survive a server restart', async () => {
  const token = (await (await post('/api/auth/register', { username: 'Persist', password: 'secret123' })).json()).token;
  let c = await client(token);
  const p1 = await c.wait(m => m.t === 'profile');
  assert.equal(p1.profile.name, 'Persist');
  await c.close();
  await new Promise(r => setTimeout(r, 200));
  await app.stop();
  app = await startServer({ port: 0, host: '127.0.0.1', dataDir, staticDir: path.join(dataDir, 'nodist'), quiet: true, databaseUrl: '' });
  base = `http://127.0.0.1:${app.port}`;
  c = await client(token);
  const p2 = await c.wait(m => m.t === 'profile');
  assert.equal(p2.profile.name, 'Persist');
  assert.equal(p2.profile.v, 3);
  await c.close();
});

test('missing client build gives a helpful message', async () => {
  const r = await fetch(base + '/');
  assert.equal(r.status, 503);
  assert.match(await r.text(), /npm run build/);
  const t = await fetch(base + '/../../etc/passwd');
  assert.notEqual(t.status, 200);
});

test('static files support byte ranges (video playback in Safari)', async () => {
  const dir = path.join(dataDir, 'nodist', 'trailer');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'nodist', 'index.html'), '<!doctype html>');
  fs.writeFileSync(path.join(dir, 'bg.mp4'), Buffer.from('0123456789'));
  const full = await fetch(`${base}/trailer/bg.mp4`);
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('content-type'), 'video/mp4');
  assert.equal(full.headers.get('accept-ranges'), 'bytes');
  const part = await fetch(`${base}/trailer/bg.mp4`, { headers: { Range: 'bytes=2-5' } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(await part.text(), '2345');
  const tail = await fetch(`${base}/trailer/bg.mp4`, { headers: { Range: 'bytes=-3' } });
  assert.equal(await tail.text(), '789');
  const bad = await fetch(`${base}/trailer/bg.mp4`, { headers: { Range: 'bytes=20-' } });
  assert.equal(bad.status, 416);
  fs.rmSync(path.join(dataDir, 'nodist'), { recursive: true, force: true });
});
