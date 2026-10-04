import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Hub } from '../shared/hub.js';
import { MemoryStore } from '../shared/memoryStore.js';

function makeHub(config = {}) {
  return new Hub({ store: new MemoryStore(), config: { queueBotWait: 2, selectTime: 2, ...config }, log: { error() {}, log() {}, info() {} } });
}
async function join(hub, name) {
  const inbox = [];
  const s = await hub.connect({ accountId: name.toLowerCase(), name, send: m => inbox.push(m) });
  s.inbox = inbox;
  s.last = t => [...inbox].reverse().find(m => m.t === t);
  return s;
}
const ticks = (hub, n) => { for (let i = 0; i < n; i++) hub.tick(); };

describe('lobby', () => {
  test('connect sends champions, items, profile and lobby state', async () => {
    const hub = makeHub();
    const a = await join(hub, 'Alice');
    const hello = a.last('hello');
    assert.equal(hello.champions.length, 10);
    assert.ok(hello.items.bloodthirster);
    assert.equal(a.last('profile').profile.rating, 1000);
    assert.equal(a.last('lobby').state, 'lobby');
  });

  test('practice: champion select with bots, lock in, match starts', async () => {
    const hub = makeHub();
    const a = await join(hub, 'Alice');
    hub.handle(a, { t: 'queue', mode: 'practice', difficulty: 'hard' });
    const sel = a.last('select').select;
    assert.equal(sel.players.length, 10);
    assert.equal(sel.players.filter(p => p.bot).length, 9);
    hub.handle(a, { t: 'pick', champ: 'nyra' });
    hub.handle(a, { t: 'csumm', spell: 'barrier' });
    hub.handle(a, { t: 'lock' });
    ticks(hub, 50);
    const m = a.last('match');
    assert.ok(m, 'match started');
    assert.equal(m.mode, 'practice');
    assert.equal(m.players.find(p => p.id === m.you).champ, 'nyra');
    const blueChamps = m.players.filter(p => p.team === 'blue').map(p => p.champ);
    assert.equal(new Set(blueChamps).size, 5, 'no duplicate champions on a team');
    ticks(hub, 10);
    const snap = a.last('s');
    assert.equal(snap.me.sm.f, 'barrier');
    assert.ok(a.last('score'));
  });

  test('unpicked players get a champion when the timer runs out', async () => {
    const hub = makeHub();
    const a = await join(hub, 'Alice');
    hub.handle(a, { t: 'queue', mode: 'practice' });
    ticks(hub, 60);
    assert.ok(a.last('match'));
  });

  test('match commands reach the hero', async () => {
    const hub = makeHub();
    const a = await join(hub, 'Alice');
    hub.handle(a, { t: 'queue', mode: 'practice' });
    ticks(hub, 60);
    hub.handle(a, { t: 'buy', item: 'longsword' });
    hub.handle(a, { t: 'lvl', sl: 'q' });
    ticks(hub, 2);
    const me = a.last('s').me;
    assert.ok(me.it.some(i => i && i.id === 'longsword'));
    assert.equal(me.rk.q, 1);
    hub.handle(a, { t: 'chat', ch: 'team', text: 'hello team' });
    assert.equal(a.last('chat').text, 'hello team');
  });

  test('custom room: create, join by code, switch team, fill, start', async () => {
    const hub = makeHub();
    const a = await join(hub, 'Alice'), b = await join(hub, 'Bob');
    hub.handle(a, { t: 'room', op: 'create' });
    const code = a.last('lobby').room.code;
    assert.match(code, /^\d{6}$/);
    hub.handle(b, { t: 'room', op: 'join', code });
    hub.handle(b, { t: 'room', op: 'team', team: 'red' });
    const room = a.last('lobby').room;
    assert.equal(room.red.filter(Boolean)[0].name, 'Bob');
    hub.handle(b, { t: 'room', op: 'start' });
    assert.ok(!b.last('select'), 'only the host can start');
    hub.handle(a, { t: 'room', op: 'bot', team: 'blue', slot: 1 });
    hub.handle(a, { t: 'room', op: 'start' });
    const sel = a.last('select').select;
    assert.equal(sel.players.length, 3, 'two humans + one bot');
    ticks(hub, 60);
    assert.equal(a.view.match, b.view.match);
    assert.notEqual(a.view.team, b.view.team);
    hub.handle(a, { t: 'chat', ch: 'all', text: 'gl hf' });
    assert.equal(b.last('chat').text, 'gl hf');
    hub.handle(a, { t: 'chat', ch: 'team', text: 'secret' });
    assert.notEqual(b.last('chat').text, 'secret', 'team chat stays on the team');
  });

  test('ranked queue: two parties of humans fill with bots and stay unranked', async () => {
    const hub = makeHub();
    const a = await join(hub, 'Alice'), b = await join(hub, 'Bob');
    hub.handle(a, { t: 'party', op: 'invite', name: 'Bob' });
    hub.handle(b, { t: 'party', op: 'accept', party: b.last('invite').party });
    hub.handle(b, { t: 'queue', mode: 'ranked' });
    assert.ok(!hub.queue.length, 'only the leader can queue');
    hub.handle(a, { t: 'queue', mode: 'ranked' });
    assert.equal(hub.queue[0].sessions.length, 2);
    ticks(hub, 20 * 3);
    const sel = a.last('select').select;
    assert.equal(sel.ranked, false, 'bots present → unranked');
    assert.equal(sel.players.find(p => p.name === 'Bob').team, sel.players.find(p => p.name === 'Alice').team, 'party on one team');
  });

  test('ten humans make a ranked match and results update ratings', async () => {
    const hub = makeHub({ queueBotWait: 999 });
    const ss = [];
    for (let i = 0; i < 10; i++) ss.push(await join(hub, `Player${i}`));
    for (const s of ss) hub.handle(s, { t: 'queue', mode: 'ranked' });
    ticks(hub, 25);
    assert.ok(ss.every(s => s.last('select')?.select.ranked));
    ticks(hub, 60);
    const match = ss[0].view.match;
    assert.ok(match.ranked);
    match.end('blue', 'test');
    const winner = ss.find(s => s.view.team === 'blue'), loser = ss.find(s => s.view.team === 'red');
    assert.ok(winner.profile.rating > 1000 && loser.profile.rating < 1000);
    assert.equal(winner.last('end').result.winner, 'blue');
    assert.equal(winner.profile.wins, 1);
    assert.equal(loser.profile.history[0].win, false);
    ticks(hub, 20 * 15);
    assert.equal(winner.last('lobby').state, 'lobby', 'back to lobby after the match');
  });

  test('disconnect hands the hero to a bot; reconnecting resumes control', async () => {
    const hub = makeHub();
    const a = await join(hub, 'Alice');
    hub.handle(a, { t: 'queue', mode: 'practice' });
    ticks(hub, 60);
    const { match, heroId } = a.view;
    await hub.disconnect(a);
    const h = match.get(heroId);
    assert.ok(h.bot && !h.session);
    ticks(hub, 20);
    const a2 = await join(hub, 'Alice');
    assert.equal(a2.view.heroId, heroId);
    assert.equal(h.session, a2);
    assert.equal(h.bot, null);
  });

  test('abandon returns to the lobby with a rejoin option', async () => {
    const hub = makeHub();
    const a = await join(hub, 'Alice');
    hub.handle(a, { t: 'queue', mode: 'practice' });
    ticks(hub, 60);
    hub.handle(a, { t: 'abandon' });
    assert.equal(a.view, null);
    assert.equal(a.last('lobby').rejoin, true);
    hub.handle(a, { t: 'rejoin' });
    assert.ok(a.view);
  });

  test('matches with nobody connected are closed after a grace period', async () => {
    const hub = makeHub({ unattendedLimit: 5 });
    const a = await join(hub, 'Alice');
    hub.handle(a, { t: 'queue', mode: 'practice' });
    ticks(hub, 60);
    assert.equal(hub.matches.size, 1);
    hub.handle(a, { t: 'abandon' });
    ticks(hub, 20 * 3);
    assert.equal(hub.matches.size, 1, 'still running during the grace period');
    ticks(hub, 20 * 3);
    assert.equal(hub.matches.size, 0, 'closed');
    hub.handle(a, { t: 'rejoin' });
    assert.equal(a.view, null);
  });

  test('leaderboards and who list', async () => {
    const hub = makeHub();
    const a = await join(hub, 'Alice'), b = await join(hub, 'Bob');
    b.profile.rating = 1200;
    const lb = await hub.leaderboard('rating');
    assert.equal(lb[0].name, 'Bob');
    hub.handle(a, { t: 'who' });
    assert.equal(a.last('who').total, 2);
  });
});
