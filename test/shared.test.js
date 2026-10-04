import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RNG } from '../shared/rng.js';
import { TILE, TileMap, moveCircle, circleBlocked, lineOfSight, encodeTiles, decodeTiles } from '../shared/tiles.js';
import { generateDungeon, bfsDistances, isBossFloor } from '../shared/dungeon.js';
import { generateWorld, generateArena, ARENA_MAPS, zoneAt } from '../shared/worldmap.js';
import { generateItem, craftItem, RECIPES, MATERIAL_IDS, RARITY_ORDER, shopStock } from '../shared/items.js';
import { computeStats, newCharacter, normalizeCharacter, xpToNext, CLASS_IDS, ABILITIES, SLOTS } from '../shared/classes.js';
import { MONSTERS, scaleMonster } from '../shared/monsters.js';

test('RNG is deterministic per seed', () => {
  const a = new RNG(42), b = new RNG(42), c = new RNG(43);
  const sa = Array.from({ length: 10 }, () => a.float());
  const sb = Array.from({ length: 10 }, () => b.float());
  const sc = Array.from({ length: 10 }, () => c.float());
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  assert.ok(sa.every(v => v >= 0 && v < 1));
});

test('tile encoding round-trips', () => {
  const bytes = new Uint8Array(1000).map((_, i) => i % 13);
  assert.deepEqual(decodeTiles(encodeTiles(bytes)), bytes);
});

test('circle movement slides along walls and never enters them', () => {
  const map = new TileMap(10, 10);
  map.fill(1, 1, 8, 8, TILE.FLOOR);
  map.fill(5, 1, 5, 6, TILE.WALL);
  const e = { x: 3, y: 3, r: 0.5 };
  moveCircle(map, e, 5, 0);
  assert.ok(e.x <= 4.5 + 1e-9, `stopped before wall, x=${e.x}`);
  assert.equal(circleBlocked(map, e.x, e.y, e.r), false);
  moveCircle(map, e, 2, 2);
  assert.ok(e.y > 3, 'slides along the wall');
  assert.equal(lineOfSight(map, 3, 3, 7, 3), false);
  assert.equal(lineOfSight(map, 3, 7.5, 7, 7.5), true);
});

test('every dungeon floor is fully connected with valid spawns', () => {
  for (let floor = 1; floor <= 30; floor++) {
    const seed = 1000 + floor * 17;
    const d = generateDungeon(seed, floor);
    const dist = bfsDistances(d.map, Math.floor(d.start.x), Math.floor(d.start.y));
    const reach = (p, what) => assert.ok(dist[Math.floor(p.x) + Math.floor(p.y) * d.map.w] >= 0, `floor ${floor}: ${what} unreachable`);
    reach(d.stairs, 'stairs');
    reach(d.exit, 'exit');
    for (const s of d.spawns) reach(s, `spawn ${s.type}`);
    for (const c of d.chests) reach(c, 'chest');
    for (const r of d.rooms) reach({ x: r.x + r.w / 2, y: r.y + r.h / 2 }, 'room');
    assert.equal(d.boss, isBossFloor(floor));
    if (d.boss) { assert.ok(d.bossSpawn); reach(d.bossSpawn, 'boss'); } else assert.equal(d.bossSpawn, null);
    assert.ok(d.spawns.length >= 5, `floor ${floor} has monsters`);
  }
});

test('dungeon generation is deterministic', () => {
  const a = generateDungeon(77, 3), b = generateDungeon(77, 3);
  assert.deepEqual(a.map.tiles, b.map.tiles);
  assert.deepEqual(a.spawns, b.spawns);
});

test('world map: spawn, NPCs and camps are reachable', () => {
  const w = generateWorld();
  const dist = bfsDistances(w.map, Math.floor(w.spawn.x), Math.floor(w.spawn.y));
  const reachable = p => dist[Math.floor(p.x) + Math.floor(p.y) * w.map.w] >= 0;
  assert.ok(w.map.walkable(Math.floor(w.spawn.x), Math.floor(w.spawn.y)));
  for (const n of w.npcs) assert.ok(reachable(n), `npc ${n.type} reachable`);
  assert.ok(w.camps.length >= 20, `enough camps (${w.camps.length})`);
  const unreachable = w.camps.filter(c => !reachable(c));
  assert.equal(unreachable.length, 0, `unreachable camps: ${JSON.stringify(unreachable.map(c => [c.x, c.y]))}`);
  assert.ok(reachable(w.bossSpot), 'world boss lair reachable');
  assert.equal(zoneAt(w.spawn.x, w.spawn.y).id, 'town');
});

test('arena maps are symmetric and connected', () => {
  for (const v of ARENA_MAPS) {
    const a = generateArena(v);
    const dist = bfsDistances(a.map, Math.floor(a.spawnsA[0].x), Math.floor(a.spawnsA[0].y));
    assert.equal(a.ffa.length, 8);
    for (const p of [...a.spawnsB, ...a.ffa]) {
      assert.ok(!circleBlocked(a.map, p.x, p.y, 0.6), `${v} spawn ${p.x},${p.y} is clear`);
      assert.ok(dist[Math.floor(p.x) + Math.floor(p.y) * a.map.w] >= 0, `${v} spawn reachable`);
    }
  }
});

test('items scale with level and rarity', () => {
  const rng = new RNG(5);
  for (const slot of ['weapon', 'armor', 'boots', 'relic']) {
    const low = generateItem(rng, { ilvl: 1, rarity: 'common', slot });
    const high = generateItem(rng, { ilvl: 30, rarity: 'legendary', slot });
    assert.equal(low.slot, slot);
    assert.ok(Object.keys(high.stats).length > Object.keys(low.stats).length, 'legendary has more affixes');
    assert.ok(high.value > low.value);
    for (const v of Object.values(high.stats)) assert.ok(Number.isFinite(v) && v > 0);
  }
  assert.ok(RARITY_ORDER.length === 5);
});

test('every refinery recipe crafts a rare-or-better item', () => {
  const rng = new RNG(9);
  for (const a of MATERIAL_IDS) {
    for (const b of MATERIAL_IDS) {
      const it = craftItem(rng, a, b, 10);
      assert.ok(it, `${a}+${b}`);
      assert.ok(['rare', 'epic', 'legendary'].includes(it.rarity));
      assert.equal(it.slot, RECIPES[[a, b].sort().join('+')].slot);
      assert.ok(it.crafted);
    }
  }
  assert.equal(shopStock(5, 1).length, 5);
});

test('character stats grow with level and gear', () => {
  for (const cls of CLASS_IDS) {
    const c = newCharacter('Hero', cls);
    const s1 = computeStats(c);
    c.level = 20;
    const s20 = computeStats(c);
    assert.ok(s20.maxHp > s1.maxHp && s20.atk > s1.atk);
    c.equipment.weapon = generateItem(new RNG(1), { ilvl: 20, rarity: 'epic', slot: 'weapon', cls });
    assert.ok(computeStats(c).atk > s20.atk);
    for (const slot of SLOTS) assert.ok(ABILITIES[cls][slot], `${cls} has ${slot}`);
  }
  assert.ok(xpToNext(10) > xpToNext(2));
  const fixed = normalizeCharacter({ name: 'Old', cls: 'gunner', level: 999, materials: { pyrite: 3 } });
  assert.equal(fixed.level, 50);
  assert.equal(fixed.materials.pyrite, 3);
  assert.equal(fixed.materials.catalyst, 0);
});

test('monsters scale up with level, elites and group size', () => {
  const base = scaleMonster(MONSTERS.skeleton, 1);
  const lvl10 = scaleMonster(MONSTERS.skeleton, 10);
  const elite = scaleMonster(MONSTERS.skeleton, 10, { elite: true });
  const group = scaleMonster(MONSTERS.skeleton, 10, { playerCount: 4 });
  assert.ok(lvl10.maxHp > base.maxHp && elite.maxHp > lvl10.maxHp && group.maxHp > lvl10.maxHp);
  assert.ok(elite.xp > lvl10.xp);
});
