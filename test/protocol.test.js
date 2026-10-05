import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeSnapshot, decodeSnapshot, selfDelta } from '../shared/protocol.js';
import { Hub } from '../shared/hub.js';
import { MemoryStore } from '../shared/memoryStore.js';

test('binary snapshots round-trip with small quantization error', () => {
  const s = { t: 's', time: 123.45, me: { id: 7, g: 500 }, a: [{ i: 9, k: 'minion' }], r: [3], fx: [{ e: 'dmg', v: 40 }],
    u: [[7, 12.34, 138.07, -1.2, 640, 4096, 280], [123456, 75.5, 0, 3.14159, 9000, 1 | 2048]] };
  const bin = encodeSnapshot(s);
  const d = decodeSnapshot(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
  assert.deepEqual({ ...d, u: undefined }, { ...s, u: undefined });
  assert.equal(d.u.length, 2);
  const [a, b] = d.u;
  assert.equal(a[0], 7); assert.ok(Math.abs(a[1] - 12.34) < 0.006); assert.ok(Math.abs(a[2] - 138.07) < 0.006);
  assert.ok(Math.abs(Math.atan2(Math.sin(a[3] - -1.2), Math.cos(a[3] - -1.2))) < 0.001, 'facing wraps');
  assert.deepEqual(a.slice(4), [640, 4096, 280]);
  assert.equal(b.length, 6, 'no mp for non-champions');
  assert.equal(b[0], 123456); assert.equal(b[4], 9000);
  const json = JSON.stringify(s.u).length;
  assert.ok(bin.length < JSON.stringify(s).length, 'binary is smaller');
  assert.ok(30 < json);
});

test('self delta sends only changed fields, including in-place array edits', () => {
  const cache = {};
  const items = [null, null];
  const first = selfDelta(cache, { id: 1, g: 500, it: items, cd: { q: 0 } });
  assert.deepEqual(Object.keys(first).sort(), ['cd', 'g', 'id', 'it']);
  assert.equal(selfDelta(cache, { id: 1, g: 500, it: items, cd: { q: 0 } }), null, 'nothing changed');
  items[0] = { id: 'blade' }; // the server mutates its arrays in place
  const d = selfDelta(cache, { id: 1, g: 150, it: items, cd: { q: 0 } });
  assert.deepEqual(Object.keys(d).sort(), ['g', 'id', 'it']);
  assert.equal(d.it[0].id, 'blade');
});

test('players get full snapshots at 10 Hz and effect-only messages in between', async () => {
  const hub = new Hub({ store: new MemoryStore(), config: { selectTime: 1 }, log: { error() {}, log() {}, info() {} } });
  const inbox = [];
  const s = await hub.connect({ accountId: 'a', name: 'A', send: m => inbox.push(m) });
  hub.handle(s, { t: 'queue', mode: 'practice' });
  for (let i = 0; i < 60; i++) hub.tick();
  for (let i = 0; i < 400; i++) hub.tick();
  inbox.length = 0;
  for (let i = 0; i < 200; i++) hub.tick(); // 10 seconds
  const snaps = inbox.filter(m => m.t === 's');
  const full = snaps.filter(m => m.u || m.a || m.r || m.me);
  assert.ok(full.length >= 95 && full.length <= 101, `about 100 full snapshots in 10s (got ${full.length})`);
  assert.ok(snaps.filter(m => !full.includes(m)).every(m => m.fx && m.fx.length), 'in-between messages carry only effects');
});

test('capacity: new matches stop at the cap, running ones are untouched', async () => {
  const hub = new Hub({ store: new MemoryStore(), config: { selectTime: 1, maxMatches: 1 }, log: { error() {}, log() {}, info() {} } });
  const join = async n => { const inbox = []; const s = await hub.connect({ accountId: n, name: n, send: m => inbox.push(m) }); s.inbox = inbox; return s; };
  const a = await join('A'), b = await join('B');
  hub.handle(a, { t: 'queue', mode: 'practice' });
  hub.handle(b, { t: 'queue', mode: 'practice' });
  assert.equal(hub.selects.size + hub.matches.size, 1);
  assert.match(b.inbox.filter(m => m.t === 'notice').pop().text, /busy/);
  for (let i = 0; i < 60; i++) hub.tick();
  assert.equal(hub.matches.size, 1, 'the first match runs');
});
