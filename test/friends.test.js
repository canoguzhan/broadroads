import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hub } from '../shared/hub.js';
import { MemoryStore } from '../shared/memoryStore.js';

class AccountStore extends MemoryStore {
  constructor() { super(); this.accounts = new Map(); }
  addAccount(name) { this.accounts.set(name.toLowerCase(), { id: name.toLowerCase(), username: name }); }
  async findAccount(name) { return this.accounts.get(name.toLowerCase()) || null; }
}
async function join(hub, name) {
  const inbox = [];
  const s = await hub.connect({ accountId: name.toLowerCase(), name, send: m => inbox.push(m) });
  s.inbox = inbox;
  s.last = t => [...inbox].reverse().find(m => m.t === t);
  return s;
}
const flush = () => new Promise(r => setTimeout(r, 20));

test('friend requests, accept, online status, offline requests and removal', async () => {
  const store = new AccountStore();
  for (const n of ['Alice', 'Bob', 'Carol']) store.addAccount(n);
  const hub = new Hub({ store, config: {}, log: { error() {}, log() {}, info() {} } });
  const a = await join(hub, 'Alice'), b = await join(hub, 'Bob');

  hub.handle(a, { t: 'friend', op: 'add', name: 'bob' });
  await flush();
  assert.deepEqual(b.last('friends').reqs, ['Alice']);
  hub.handle(b, { t: 'friend', op: 'accept', name: 'Alice' });
  await flush();
  assert.deepEqual(a.profile.friends, ['Bob']);
  assert.deepEqual(b.profile.friends, ['Alice']);
  assert.equal(b.profile.friendReqs.length, 0);
  hub.handle(a, { t: 'friends' });
  assert.equal(a.last('friends').list[0].online, true);

  await hub.disconnect(b);
  assert.equal(a.last('friends').list[0].online, false, 'friends hear about disconnects');

  // Offline player: the request is saved to their stored profile.
  hub.handle(a, { t: 'friend', op: 'add', name: 'Carol' });
  await flush();
  assert.deepEqual((await store.getCharacter('carol')).friendReqs, ['Alice']);
  hub.handle(a, { t: 'friend', op: 'add', name: 'Nobody' });
  await flush();
  assert.match(a.last('notice').text, /no player/);

  hub.handle(a, { t: 'friend', op: 'remove', name: 'Bob' });
  await flush();
  assert.deepEqual(a.profile.friends, []);
  assert.deepEqual((await store.getCharacter('bob')).friends, []);
});

test('party members follow each other into custom rooms without accepting anything', async () => {
  const hub = new Hub({ store: new AccountStore(), config: {}, log: { error() {}, log() {}, info() {} } });
  const a = await join(hub, 'Alice'), b = await join(hub, 'Bob'), c = await join(hub, 'Cara');
  hub.handle(a, { t: 'party', op: 'invite', name: 'Bob' });
  hub.handle(b, { t: 'party', op: 'accept', party: a.partyId });
  hub.handle(a, { t: 'room', op: 'create' });
  const code = a.roomCode;
  assert.ok(code);
  assert.equal(b.roomCode, code, 'party member pulled into the room');
  assert.ok(hub.rooms.get(code).blue.includes(b), 'same team');
  // A third player joining the party later lands in the room too.
  hub.handle(a, { t: 'party', op: 'invite', name: 'Cara' });
  hub.handle(c, { t: 'party', op: 'accept', party: a.partyId });
  assert.equal(c.roomCode, code);
  // Joining someone else's room by code brings the whole party.
  const d = await join(hub, 'Dan');
  hub.handle(d, { t: 'room', op: 'create' });
  hub.handle(b, { t: 'room', op: 'join', code: d.roomCode });
  assert.equal(a.roomCode, d.roomCode);
  assert.equal(c.roomCode, d.roomCode);
});
