import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { startServer } from '../server/index.js';

test('email, password reset by link, and provider discovery', async () => {
  const mails = [];
  const origInfo = console.info;
  console.info = (...a) => { const s = a.join(' '); if (s.includes('[mail to')) mails.push(s); };
  const app = await startServer({ port: 0, host: '127.0.0.1', dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'br-acc-')), databaseUrl: '' });
  const B = `http://127.0.0.1:${app.port}`;
  const post = (p, body, headers = {}) => fetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, ...(await r.json()) }));
  try {
    const reg = await post('/api/auth/register', { username: 'Resetter', password: 'oldpass1', email: 'Resetter@Example.com' });
    assert.ok(reg.token);
    assert.equal((await post('/api/auth/register', { username: 'Other1', password: 'secret12', email: 'resetter@example.com' })).status, 409, 'email unique');
    const me = await (await fetch(B + '/api/account', { headers: { Authorization: `Bearer ${reg.token}` } })).json();
    assert.equal(me.email, 'resetter@example.com');
    assert.deepEqual(await (await fetch(B + '/api/auth/providers')).json(), { google: false, discord: false, email: false });

    assert.equal((await post('/api/auth/forgot', { login: 'nobody' })).ok, true, 'same answer for unknown accounts');
    assert.equal(mails.length, 0);
    await post('/api/auth/forgot', { login: 'resetter@example.com' });
    assert.equal(mails.length, 1);
    const token = /reset=([\w-]+)/.exec(mails[0])[1];
    assert.equal((await post('/api/auth/reset', { token: 'wrong', password: 'newpass1' })).status, 400);
    const done = await post('/api/auth/reset', { token, password: 'newpass1' });
    assert.equal(done.username, 'Resetter');
    assert.equal((await post('/api/auth/reset', { token, password: 'again123' })).status, 400, 'links work once');
    assert.equal((await post('/api/auth/login', { username: 'Resetter', password: 'oldpass1' })).status, 401);
    assert.ok((await post('/api/auth/login', { username: 'Resetter', password: 'newpass1' })).token);

    const set = await post('/api/account/email', { email: 'new@example.com' }, { Authorization: `Bearer ${reg.token}` });
    assert.equal(set.email, 'new@example.com');
    assert.equal((await fetch(B + '/api/auth/oauth/google/start')).status, 404, 'not configured');
  } finally { console.info = origInfo; await app.stop(); }
});
