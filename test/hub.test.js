import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Hub, dungeonCheckpoints } from '../shared/hub.js';
import { MemoryStore } from '../shared/memoryStore.js';
import { WorldInstance, getWorldData } from '../shared/sim/world.js';
import { DungeonInstance } from '../shared/sim/dungeonInstance.js';
import { ArenaInstance } from '../shared/sim/arena.js';
import { generateItem } from '../shared/items.js';
import { RNG } from '../shared/rng.js';
import { xpToNext } from '../shared/classes.js';

function makeHub(config = {}) {
  return new Hub({ store: new MemoryStore(), config: { worldBossFirst: 9999, queueBotWait: 3, ...config }, log: { error() {}, log() {}, info() {} } });
}

async function join(hub, name, cls = 'paladin') {
  const inbox = [];
  const s = await hub.connect({ accountId: name.toLowerCase(), name, send: m => inbox.push(m) });
  s.inbox = inbox;
  s.last = t => [...inbox].reverse().find(m => m.t === t);
  s.all = t => inbox.filter(m => m.t === t);
  if (!s.char) hub.handle(s, { t: 'create', cls });
  return s;
}

const ticks = (hub, n) => { for (let i = 0; i < n; i++) hub.tick(); };
const nearNpc = (s, type) => {
  const npc = [...s.instance.entities.values()].find(e => e.kind === 'npc' && e.type === type);
  s.ent.x = npc.x; s.ent.y = npc.y + 1.5;
  return npc;
};

/** Teleports the player next to monsters and attacks until `done()` or the step budget runs out. */
function grind(hub, s, done, steps = 4000) {
  let seq = 1e6;
  for (let i = 0; i < steps && !done(); i++) {
    const inst = s.instance;
    const m = [...inst.entities.values()].filter(e => e.kind === 'monster' && !e.dead).sort((x, y) => x.level - y.level || x.maxHp - y.maxHp)[0];
    if (!m) break;
    s.ent.x = m.x - (m.r + s.ent.r + 0.3); s.ent.y = m.y;
    s.ent.hp = s.ent.stats.maxHp;
    hub.handle(s, { t: 'in', s: ++seq, mx: 0, my: 0, ax: m.x, ay: m.y, at: true });
    hub.tick();
  }
}

describe('accounts & world', () => {
  test('new players create a hero and land in town', async () => {
    const hub = makeHub();
    const s = await join(hub, 'Alice', 'gunner');
    assert.ok(s.inbox.find(m => m.t === 'needChar'));
    assert.equal(s.char.cls, 'gunner');
    assert.ok(s.instance instanceof WorldInstance);
    ticks(hub, 3);
    const snap = s.last('s');
    assert.ok(snap.me.safe, 'spawns in the safe zone');
    assert.ok(s.all('s').some(sn => (sn.a || []).some(e => e.k === 'npc')), 'sees NPCs');
    assert.equal(s.last('zone').zone.kind, 'world');
  });

  test('players in the same shard see each other and chat', async () => {
    const hub = makeHub();
    const a = await join(hub, 'Alice');
    const b = await join(hub, 'Bob');
    ticks(hub, 3);
    assert.equal(a.instance, b.instance);
    const seesBob = a.all('s').some(s => (s.a || []).some(e => e.k === 'player' && e.n === 'Bob'));
    assert.ok(seesBob);
    hub.handle(a, { t: 'chat', ch: 'say', text: 'hello there' });
    hub.handle(a, { t: 'chat', ch: 'world', text: 'world msg' });
    hub.handle(a, { t: 'chat', ch: 'whisper', to: 'bob', text: 'psst' });
    const chats = b.all('chat').map(m => `${m.ch}:${m.text}`);
    assert.deepEqual(chats, ['say:hello there', 'world:world msg', 'whisper:psst']);
    hub.handle(a, { t: 'chat', ch: 'say', text: '\u0000<script>x</script>' + 'y'.repeat(500) });
    const last = b.last('chat');
    assert.ok(last.text.length <= 200 && !last.text.includes('\u0000'));
  });

  test('cannot fight in town; monsters in the wilds grant xp, gold and loot', async () => {
    const hub = makeHub();
    const s = await join(hub, 'Alice');
    hub.handle(s, { t: 'cast', sl: 'q', ax: s.ent.x + 1, ay: s.ent.y });
    assert.ok(s.inbox.some(m => m.t === 'notice' && /cannot fight/.test(m.text)));
    const gold0 = s.char.gold;
    grind(hub, s, () => s.char.stats.kills >= 15);
    assert.ok(s.char.stats.kills >= 15, `killed ${s.char.stats.kills}`);
    assert.ok(s.char.gold > gold0, 'earned gold');
    assert.ok(s.char.level >= 2 || s.char.xp > 0, 'earned xp');
    // Personal loot is picked up automatically when walking over it.
    ticks(hub, 5);
    for (const l of [...s.instance.entities.values()].filter(e => e.kind === 'loot' && e.owner === s.ent.id)) {
      s.ent.x = l.x; s.ent.y = l.y;
      hub.tick();
    }
    const mats = Object.values(s.char.materials).reduce((a, b) => a + b, 0);
    assert.ok(s.char.inventory.length + mats > 0, 'picked up loot');
  });

  test('death in the world respawns in town with a small gold penalty', async () => {
    const hub = makeHub();
    const s = await join(hub, 'Alice');
    s.char.gold = 1000;
    s.ent.x += 40; // out of town
    s.instance.kill(s.ent, null);
    assert.equal(s.char.gold, 950);
    hub.handle(s, { t: 'respawn' });
    assert.ok(s.ent.dead, 'respawn has a delay');
    ticks(hub, 20 * 5);
    hub.handle(s, { t: 'respawn' });
    assert.equal(s.ent.dead, false);
    assert.ok(!s.instance.combatAllowed(s.ent), 'back in town');
  });

  test('allies revive downed players by standing next to them', async () => {
    const hub = makeHub();
    const a = await join(hub, 'Alice');
    const b = await join(hub, 'Bob');
    a.ent.x = b.ent.x = 84; a.ent.y = b.ent.y = 120;
    a.instance.kill(a.ent, null);
    b.ent.x = a.ent.x + 1;
    ticks(hub, 20 * 3 + 5);
    assert.equal(a.ent.dead, false);
  });

  test('world boss spawns on schedule and is announced', async () => {
    const hub = makeHub({ worldBossFirst: 1 });
    const s = await join(hub, 'Alice');
    ticks(hub, 30);
    assert.ok(hub.worlds[0].boss, 'boss spawned');
    assert.ok(s.inbox.some(m => m.t === 'chat' && /Behemoth/.test(m.text)));
    assert.ok(s.last('meta').meta.boss);
  });

  test('levelling up raises stats and heals', async () => {
    const hub = makeHub();
    const s = await join(hub, 'Alice');
    const hp0 = s.ent.stats.maxHp;
    hub.grantXp(s.ent, xpToNext(1) + xpToNext(2));
    assert.equal(s.char.level, 3);
    assert.ok(s.ent.stats.maxHp > hp0);
    assert.equal(s.ent.hp, s.ent.stats.maxHp);
  });
});

describe('economy', () => {
  test('buy potions and gear, equip, unequip, sell, discard', async () => {
    const hub = makeHub();
    const s = await join(hub, 'Alice');
    s.char.gold = 5000;
    nearNpc(s, 'merchant');
    hub.handle(s, { t: 'npc', type: 'merchant' });
    const shop = s.last('npc');
    assert.equal(shop.type, 'merchant');
    hub.handle(s, { t: 'buy', potion: 'hp', n: 5 });
    assert.equal(s.char.potions.hp, 10);
    const item = shop.data.stock[0];
    hub.handle(s, { t: 'buy', id: item.id });
    assert.equal(s.char.inventory.length, 1);
    assert.equal(s.char.gold, 5000 - 100 - item.price);
    const atk0 = s.ent.stats.atk, hp0 = s.ent.stats.maxHp;
    hub.handle(s, { t: 'equip', id: item.id });
    assert.equal(s.char.equipment[item.slot].id, item.id);
    assert.ok(s.ent.stats.atk >= atk0 && s.ent.stats.maxHp >= hp0);
    hub.handle(s, { t: 'unequip', slot: item.slot });
    assert.equal(s.char.equipment[item.slot], null);
    const gold = s.char.gold;
    hub.handle(s, { t: 'sell', id: item.id });
    assert.equal(s.char.inventory.length, 0);
    assert.ok(s.char.gold > gold);
    s.char.inventory.push(generateItem(new RNG(1), { ilvl: 1 }));
    hub.handle(s, { t: 'discard', id: s.char.inventory[0].id });
    assert.equal(s.char.inventory.length, 0);
  });

  test('equipping enforces level requirements', async () => {
    const hub = makeHub();
    const s = await join(hub, 'Alice');
    const it = generateItem(new RNG(2), { ilvl: 30, slot: 'weapon' });
    s.char.inventory.push(it);
    hub.handle(s, { t: 'equip', id: it.id });
    assert.equal(s.char.equipment.weapon, null);
  });

  test('refinery crafts gear from materials', async () => {
    const hub = makeHub();
    const s = await join(hub, 'Alice');
    s.char.gold = 1000;
    s.char.materials = { pyrite: 3, aether: 0, titanium: 3, catalyst: 0 };
    nearNpc(s, 'blacksmith');
    hub.handle(s, { t: 'craft', a: 'pyrite', b: 'pyrite' });
    assert.equal(s.char.inventory.length, 0, 'needs 6 pyrite');
    hub.handle(s, { t: 'craft', a: 'pyrite', b: 'titanium' });
    assert.equal(s.char.inventory.length, 1);
    assert.equal(s.char.inventory[0].name, 'Titanium Cleaver');
    assert.equal(s.char.materials.pyrite, 0);
    assert.ok(s.last('crafted'));
  });

  test('shops and crafting are not available out in the wilds', async () => {
    const hub = makeHub();
    const s = await join(hub, 'Alice');
    s.char.gold = 1000;
    s.ent.y += 40;
    hub.handle(s, { t: 'buy', potion: 'hp', n: 1 });
    assert.equal(s.char.potions.hp, 5);
  });

  test('class trainer changes class but keeps progress', async () => {
    const hub = makeHub();
    const s = await join(hub, 'Alice', 'paladin');
    s.char.level = 7;
    hub.handle(s, { t: 'class', cls: 'arcanist' });
    assert.equal(s.char.cls, 'arcanist');
    assert.equal(s.char.level, 7);
    assert.equal(s.ent.cls, 'arcanist');
  });
});

describe('parties & dungeons', () => {
  test('party invite, accept, promote, kick and leave', async () => {
    const hub = makeHub();
    const a = await join(hub, 'Alice'), b = await join(hub, 'Bob'), c = await join(hub, 'Cara');
    hub.handle(a, { t: 'party', op: 'invite', name: 'Bob' });
    hub.handle(b, { t: 'party', op: 'accept', party: b.last('invite').party });
    hub.handle(a, { t: 'party', op: 'invite', name: 'cara' });
    hub.handle(c, { t: 'party', op: 'accept', party: c.last('invite').party });
    assert.deepEqual(a.last('party').party.members.map(m => m.name), ['Alice', 'Bob', 'Cara']);
    hub.handle(a, { t: 'chat', ch: 'party', text: 'gg' });
    assert.equal(c.last('chat').text, 'gg');
    hub.handle(a, { t: 'party', op: 'promote', name: 'Bob' });
    assert.equal(hub.parties.get(a.partyId).leader, 'Bob');
    hub.handle(b, { t: 'party', op: 'kick', name: 'Cara' });
    assert.equal(c.partyId, null);
    hub.handle(b, { t: 'party', op: 'leave' });
    assert.equal(a.partyId, null, 'two-person party disbands when one leaves');
    assert.equal(hub.parties.size, 0);
  });

  test('solo dungeon: clear floors, descend, guardian seals the stairs', async () => {
    const hub = makeHub();
    const s = await join(hub, 'Alice');
    s.char.stats.deepestFloor = 5;
    assert.deepEqual(dungeonCheckpoints(5), [1]);
    assert.deepEqual(dungeonCheckpoints(12), [1, 6, 11]);
    hub.handle(s, { t: 'dungeon', op: 'enter', mode: 'solo', floor: 1 });
    const d = s.instance;
    assert.ok(d instanceof DungeonInstance);
    assert.equal(d.mode, 'solo');
    // Descend to floor 5 (a guardian floor).
    while (d.floor < 5) {
      s.ent.x = d.stairs.x; s.ent.y = d.stairs.y;
      hub.handle(s, { t: 'interact', id: d.stairs.id });
    }
    assert.equal(s.char.stats.deepestFloor, 5);
    assert.ok(d.bossEnt, 'guardian present');
    assert.equal(d.stairs.open, false);
    s.ent.x = d.stairs.x; s.ent.y = d.stairs.y;
    hub.handle(s, { t: 'interact', id: d.stairs.id });
    assert.equal(d.floor, 5, 'sealed stairs do not work');
    d.kill(d.bossEnt, s.ent);
    assert.equal(d.stairs.open, true);
    assert.equal(s.char.stats.dungeonsCleared, 1);
    hub.handle(s, { t: 'interact', id: d.stairs.id });
    assert.equal(d.floor, 6);
    assert.deepEqual(dungeonCheckpoints(s.char.stats.deepestFloor), [1, 6]);
  });

  test('solo dungeon: chests drop loot and gold; death ends the run', async () => {
    const hub = makeHub();
    const s = await join(hub, 'Alice');
    hub.handle(s, { t: 'dungeon', op: 'enter', mode: 'solo' });
    const d = s.instance;
    const chest = [...d.entities.values()].find(e => e.kind === 'chest');
    if (chest) {
      const gold = s.char.gold;
      s.ent.x = chest.x; s.ent.y = chest.y + 1;
      hub.handle(s, { t: 'interact', id: chest.id });
      assert.ok(chest.open);
      assert.ok(s.char.gold > gold);
      assert.ok([...d.entities.values()].some(e => e.kind === 'loot' && e.owner === s.ent.id));
    }
    s.char.gold = 200;
    d.kill(s.ent, null);
    ticks(hub, 20 * 4);
    assert.ok(s.instance instanceof WorldInstance, 'returned to town');
    assert.equal(s.last('result').kind, 'dungeonFail');
    assert.equal(s.char.gold, 190);
  });

  test('party dungeon pulls in every member; revives work; leaving returns to town', async () => {
    const hub = makeHub();
    const a = await join(hub, 'Alice'), b = await join(hub, 'Bob', 'arcanist');
    hub.handle(b, { t: 'dungeon', op: 'enter', mode: 'party' });
    assert.ok(b.instance instanceof WorldInstance, 'needs a party');
    hub.handle(a, { t: 'party', op: 'invite', name: 'Bob' });
    hub.handle(b, { t: 'party', op: 'accept', party: b.last('invite').party });
    hub.handle(b, { t: 'dungeon', op: 'enter', mode: 'party' });
    assert.ok(b.instance instanceof WorldInstance, 'only the leader may open the gate');
    hub.handle(a, { t: 'dungeon', op: 'enter', mode: 'party' });
    assert.ok(a.instance instanceof DungeonInstance);
    assert.equal(a.instance, b.instance);
    const d = a.instance;
    const soloHp = new DungeonInstance(hub, { id: 'x', mode: 'solo', floor: 1, seed: d.seed, themeId: 'january', players: 1 });
    const partyMonster = [...d.entities.values()].find(e => e.kind === 'monster');
    const soloMonster = [...soloHp.entities.values()].find(e => e.kind === 'monster' && e.type === partyMonster.type);
    if (soloMonster) assert.ok(partyMonster.maxHp > soloMonster.maxHp, 'monsters scale with party size');
    // Bob goes down, Alice revives him.
    d.kill(b.ent, null);
    a.ent.x = b.ent.x + 1; a.ent.y = b.ent.y;
    ticks(hub, 20 * 3 + 5);
    assert.equal(b.ent.dead, false);
    // Healing ability restores allies.
    a.ent.hp = 10;
    b.ent.x = a.ent.x + 1;
    hub.handle(b, { t: 'cast', sl: 'e' });
    assert.ok(a.ent.hp > 10);
    // Descending moves the whole party.
    a.ent.x = d.stairs.x; a.ent.y = d.stairs.y;
    hub.handle(a, { t: 'interact', id: d.stairs.id });
    assert.equal(d.floor, 2);
    assert.equal(b.char.stats.deepestFloor, 2);
    hub.handle(b, { t: 'dungeon', op: 'leave' });
    assert.ok(b.instance instanceof WorldInstance);
    assert.ok(a.instance instanceof DungeonInstance, 'others keep going');
  });

  test('party wipe sends everyone home', async () => {
    const hub = makeHub();
    const a = await join(hub, 'Alice'), b = await join(hub, 'Bob');
    hub.handle(a, { t: 'party', op: 'invite', name: 'Bob' });
    hub.handle(b, { t: 'party', op: 'accept', party: b.last('invite').party });
    hub.handle(a, { t: 'dungeon', op: 'enter', mode: 'party' });
    const d = a.instance;
    b.ent.x += 30;
    d.kill(a.ent, null);
    d.kill(b.ent, null);
    ticks(hub, 20 * 4);
    assert.ok(a.instance instanceof WorldInstance && b.instance instanceof WorldInstance);
  });

  test('dungeon monsters fight back and use abilities', async () => {
    const hub = makeHub();
    const s = await join(hub, 'Alice');
    s.char.stats.deepestFloor = 10;
    hub.handle(s, { t: 'dungeon', op: 'enter', mode: 'solo', floor: 6 });
    const d = s.instance;
    const m = [...d.entities.values()].find(e => e.kind === 'monster');
    s.ent.x = m.x + 1.5; s.ent.y = m.y;
    const hp0 = s.ent.hp;
    let minHp = hp0;
    for (let i = 0; i < 20 * 6; i++) { hub.tick(); minHp = Math.min(minHp, s.ent.hp); if (s.ent.dead) break; }
    assert.ok(minHp < hp0, 'player took damage');
  });
});

describe('arena', () => {
  test('ranked duel between two players changes ratings and pays out', async () => {
    const hub = makeHub();
    const a = await join(hub, 'Alice'), b = await join(hub, 'Bob');
    hub.handle(a, { t: 'arena', op: 'queue', mode: 'duel' });
    hub.handle(b, { t: 'arena', op: 'queue', mode: 'duel' });
    ticks(hub, 25);
    const arena = a.instance;
    assert.ok(arena instanceof ArenaInstance);
    assert.equal(arena, b.instance);
    assert.equal(arena.ranked, true);
    assert.equal(arena.phase, 'prep');
    assert.ok(!arena.hostile(a.ent, b.ent), 'no damage during countdown');
    ticks(hub, 20 * 5 + 2);
    assert.equal(arena.phase, 'fight');
    hub.handle(a, { t: 'pot', k: 'hp' });
    assert.equal(a.char.potions.hp, 5, 'potions disabled in the arena');
    const gold = a.char.gold;
    for (let round = 0; round < 3 && arena.phase !== 'end'; round++) {
      for (let i = 0; i < 20 * 120 && arena.phase === 'fight'; i++) {
        a.ent.x = b.ent.x - 1.6; a.ent.y = b.ent.y;
        a.ent.hp = a.ent.stats.maxHp;
        hub.handle(a, { t: 'in', s: 1e6 + i + round * 1e4, mx: 0, my: 0, ax: b.ent.x, ay: b.ent.y, at: true });
        hub.tick();
      }
      ticks(hub, 20 * 3 + 5);
    }
    assert.equal(arena.phase, 'end');
    assert.ok(a.char.rating.duel > 1000 && b.char.rating.duel < 1000, `${a.char.rating.duel} / ${b.char.rating.duel}`);
    assert.equal(a.char.pvp.wins, 1);
    assert.equal(b.char.pvp.losses, 1);
    assert.ok(a.char.gold > gold);
    assert.equal(a.last('result').won, true);
    ticks(hub, 20 * 9);
    assert.ok(a.instance instanceof WorldInstance && b.instance instanceof WorldInstance, 'both return to the world');
  });

  test('queue fills empty seats with bots after waiting (unranked)', async () => {
    const hub = makeHub({ queueBotWait: 2 });
    const a = await join(hub, 'Alice');
    hub.handle(a, { t: 'arena', op: 'queue', mode: 'team' });
    ticks(hub, 20 * 4);
    const arena = a.instance;
    assert.ok(arena instanceof ArenaInstance);
    assert.equal(arena.players().length, 6);
    assert.equal(arena.ranked, false);
    assert.equal(arena.players().filter(p => p.bot).length, 5);
  });

  test('team queue keeps a party together', async () => {
    const hub = makeHub({ queueBotWait: 1 });
    const a = await join(hub, 'Alice'), b = await join(hub, 'Bob');
    hub.handle(a, { t: 'party', op: 'invite', name: 'Bob' });
    hub.handle(b, { t: 'party', op: 'accept', party: b.last('invite').party });
    hub.handle(a, { t: 'arena', op: 'queue', mode: 'team' });
    assert.ok(b.queue, 'party member queued too');
    ticks(hub, 20 * 3);
    assert.ok(a.instance instanceof ArenaInstance);
    assert.equal(a.ent.homeTeam, b.ent.homeTeam);
  });

  test('practice FFA with bots plays out with kills, then everyone goes home', async () => {
    const hub = makeHub();
    const a = await join(hub, 'Alice', 'gunner');
    hub.handle(a, { t: 'arena', op: 'practice', mode: 'ffa' });
    const arena = a.instance;
    assert.equal(arena.mode, 'ffa');
    assert.equal(arena.players().length, 6);
    a.ent.hp = 1e9; a.ent.stats.maxHp = 1e9; // keep the human alive so the match runs to completion
    for (let i = 0; i < 20 * 320 && arena.phase !== 'end'; i++) hub.tick();
    const board = arena.dynamicMeta().board;
    assert.ok(board.reduce((s, r) => s + r.kills, 0) > 3, 'bots fight each other');
    assert.equal(arena.phase, 'end');
    ticks(hub, 20 * 9);
    assert.ok(a.instance instanceof WorldInstance);
  });

  test('disconnecting mid-match hands the hero to the AI; leaver loses', async () => {
    const hub = makeHub();
    const a = await join(hub, 'Alice'), b = await join(hub, 'Bob');
    hub.handle(a, { t: 'arena', op: 'queue', mode: 'duel' });
    hub.handle(b, { t: 'arena', op: 'queue', mode: 'duel' });
    ticks(hub, 20 * 7);
    const arena = a.instance;
    const bEnt = b.ent;
    await hub.disconnect(b);
    assert.ok(bEnt.bot, 'AI took over');
    assert.ok(arena.players().includes(bEnt));
    // Remaining player leaves too -> match ends.
    hub.handle(a, { t: 'arena', op: 'leave' });
    ticks(hub, 5);
    assert.equal(arena.phase, 'end');
  });

  test('friendly duel challenge', async () => {
    const hub = makeHub();
    const a = await join(hub, 'Alice'), b = await join(hub, 'Bob');
    hub.handle(a, { t: 'duel', op: 'request', name: 'Bob' });
    assert.equal(b.last('duelReq').from, 'Alice');
    hub.handle(b, { t: 'duel', op: 'accept' });
    assert.ok(a.instance instanceof ArenaInstance);
    assert.equal(a.instance, b.instance);
    assert.equal(a.instance.ranked, false);
  });
});

describe('persistence & social', () => {
  test('characters persist across sessions; one login per account', async () => {
    const hub = makeHub();
    const a = await join(hub, 'Alice', 'gunner');
    a.char.gold = 777;
    a.char.level = 9;
    const a2 = await join(hub, 'Alice');
    assert.ok(a.inbox.some(m => m.t === 'kicked'));
    assert.equal(a2.char.gold, 777);
    assert.equal(a2.char.cls, 'gunner');
    await hub.disconnect(a2);
    const stored = await hub.store.getCharacter('alice');
    assert.equal(stored.level, 9);
  });

  test('who list and leaderboards', async () => {
    const hub = makeHub();
    const a = await join(hub, 'Alice'), b = await join(hub, 'Bob');
    b.char.level = 12;
    b.char.stats.deepestFloor = 8;
    hub.handle(a, { t: 'who' });
    assert.equal(a.last('who').total, 2);
    const lvl = await hub.leaderboard('level');
    assert.equal(lvl[0].name, 'Bob');
    const floor = await hub.leaderboard('floor');
    assert.equal(floor[0].value, 8);
  });

  test('every class can use every ability in combat', async () => {
    const hub = makeHub();
    for (const cls of ['paladin', 'gunner', 'arcanist']) {
      const s = await join(hub, `T${cls}`, cls);
      s.ent.x = getWorldData().spawn.x; s.ent.y = getWorldData().spawn.y + 30;
      s.ent.mp = 9999;
      for (const sl of ['primary', 'dash', 'q', 'e', 'r']) {
        const before = s.ent.cd[sl];
        hub.handle(s, { t: 'cast', sl, ax: s.ent.x + 3, ay: s.ent.y });
        assert.ok(s.ent.cd[sl] > before, `${cls} ${sl} went on cooldown`);
      }
      ticks(hub, 60);
    }
  });
});
