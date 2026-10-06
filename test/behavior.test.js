import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hub } from '../shared/hub.js';
import { MemoryStore } from '../shared/memoryStore.js';
import { filterChat } from '../shared/chatfilter.js';

const mkHub = () => new Hub({ store: new MemoryStore(), config: { selectTime: 1 }, log: { error() {}, log() {}, info() {} } });
async function join(hub, n) { const inbox = []; const s = await hub.connect({ accountId: n, name: n, send: m => inbox.push(m) }); s.inbox = inbox; s.last = t => [...inbox].reverse().find(m => m.t === t); return s; }

test('AFK: warned at 90s, AI takes over at 120s in games with other people; rejoin resets', async () => {
  const hub = mkHub();
  const a = await join(hub, 'Active'), b = await join(hub, 'Idle');
  hub.handle(a, { t: 'room', op: 'create' });
  hub.handle(b, { t: 'room', op: 'join', code: a.roomCode });
  hub.handle(a, { t: 'room', op: 'fill' });
  hub.handle(a, { t: 'room', op: 'start' });
  for (let i = 0; i < 60; i++) hub.tick();
  const m = a.view.match;
  for (let i = 0; i < 20 * 95; i++) { hub.handle(a, { t: 'stop' }); hub.tick(); }
  assert.match(b.inbox.filter(x => x.t === 'notice').pop().text, /still there/);
  assert.ok(!a.inbox.some(x => x.t === 'notice' && /still there/.test(x.text)), 'active player not warned');
  for (let i = 0; i < 20 * 30; i++) { hub.handle(a, { t: 'stop' }); hub.tick(); }
  const hb = m.heroes.find(h => h.name === 'Idle');
  assert.ok(hb.bot && !hb.session && hb.afk, 'AI took over');
  assert.equal(b.view, null);
  hub.handle(b, { t: 'rejoin' });
  assert.equal(hb.session, b);
  assert.equal(hb.idleT, 0);
});

test('reports are rate-limited and deduplicated; chat is filtered', async () => {
  const hub = mkHub();
  const got = [];
  hub.reportSink = r => got.push(r);
  const a = await join(hub, 'Reporter'), b = await join(hub, 'Rude');
  hub.handle(a, { t: 'report', name: 'Rude', reason: 'abuse', match: 'm1' });
  hub.handle(a, { t: 'report', name: 'Rude', reason: 'abuse', match: 'm1' });
  hub.handle(a, { t: 'report', name: 'Reporter', reason: 'abuse' });
  assert.equal(got.length, 1);
  assert.equal(got[0].reason, 'abuse');
  hub.handle(b, { t: 'chat', ch: 'global', text: 'you are a fucking noob' });
  assert.equal(a.last('chat').text, 'you are a ******* noob');
  assert.equal(filterChat('good game, well played'), 'good game, well played');
});
