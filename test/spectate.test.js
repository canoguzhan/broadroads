import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hub } from '../shared/hub.js';
import { MemoryStore } from '../shared/memoryStore.js';

function memoryReplays() {
  const items = [];
  return {
    items,
    async save(header, lines) { items.unshift({ header, lines }); },
    async list() { return items.map(i => ({ id: i.header.id, duration: i.header.duration })); },
    async load(id) { return items.find(i => i.header.id === id) || null; },
  };
}
async function join(hub, name) {
  const inbox = [];
  const s = await hub.connect({ accountId: name.toLowerCase(), name, send: m => inbox.push(m) });
  s.inbox = inbox;
  s.last = t => [...inbox].reverse().find(m => m.t === t);
  return s;
}
const ticks = (hub, n) => { for (let i = 0; i < n; i++) hub.tick(); };

test('spectators see live matches with full vision, cannot command, and replays are saved', async () => {
  const replays = memoryReplays();
  const hub = new Hub({ store: new MemoryStore(), config: { queueBotWait: 2, selectTime: 2 }, log: { error() {}, log() {}, info() {} }, replays });
  const a = await join(hub, 'Alice');
  hub.handle(a, { t: 'queue', mode: 'practice' });
  ticks(hub, 60);
  const m = a.last('match');
  assert.ok(m, 'match started');
  ticks(hub, 20);

  const b = await join(hub, 'Bob');
  hub.handle(b, { t: 'live' });
  const live = b.last('live').list;
  assert.equal(live.length, 1);
  hub.handle(b, { t: 'spectate', id: live[0].id });
  const sm = b.last('match');
  assert.equal(sm.spectator, true);
  assert.equal(sm.you, null);
  ticks(hub, 5);
  const heroes = b.inbox.filter(x => x.t === 's').flatMap(s => s.a || []).filter(e => e.k === 'hero');
  assert.equal(new Set(heroes.map(e => e.i)).size, 10, 'spectator sees all ten champions');
  assert.ok(!b.inbox.filter(x => x.t === 's').some(s => s.me), 'no private self state for spectators');

  // Spectator commands are ignored (no hero to move).
  hub.handle(b, { t: 'mv', x: 10, y: 10 });
  hub.handle(b, { t: 'abandon' });
  assert.equal(b.last('lobby').state, 'lobby', 'abandon just leaves');

  // End the match: a replay is recorded and saved.
  const match = [...hub.matches.values()][0];
  match.end('blue', 'test');
  ticks(hub, 10);
  await new Promise(r => setTimeout(r, 3300));
  assert.equal(replays.items.length, 1);
  const rep = replays.items[0];
  assert.equal(rep.header.players.length, 10);
  assert.ok(rep.lines.length > 20, 'frames recorded');
  const frames = rep.lines.map(l => JSON.parse(l));
  assert.ok(frames.some(f => f.t === 's' && f.a && f.a.some(e => e.k === 'hero')));
  assert.ok(frames.some(f => f.t === 'score'));
  hub.handle(a, { t: 'replays' });
  await new Promise(r => setTimeout(r, 10));
  assert.equal(a.last('replays').list.length, 1);
  hub.handle(a, { t: 'replay', id: rep.header.id });
  await new Promise(r => setTimeout(r, 10));
  assert.equal(a.last('replay').header.id, rep.header.id);
});
