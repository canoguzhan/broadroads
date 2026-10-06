import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getValley, TEAMS } from '../shared/moba/map.js';
import { Match } from '../shared/moba/match.js';
import { CHAMPIONS, CHAMPION_IDS, XP_TO_LEVEL, canRankUp } from '../shared/moba/champions.js';
import { ITEMS, priceFor } from '../shared/moba/items.js';

function bfs(map, sx, sy) {
  const d = new Int32Array(map.w * map.h).fill(-1);
  const q = [sx + sy * map.w];
  d[q[0]] = 0;
  for (let i = 0; i < q.length; i++) {
    const c = q[i], x = c % map.w, y = (c / map.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!map.walkable(nx, ny)) continue;
      const n = nx + ny * map.w;
      if (d[n] < 0) { d[n] = d[c] + 1; q.push(n); }
    }
  }
  return d;
}

function makeMatch(blue = ['hale'], red = ['garrok'], opts = {}) {
  const players = [];
  blue.forEach((c, i) => players.push({ key: `b${i}`, name: `Blue${i}`, team: 'blue', champ: c, bot: !!opts.bots, role: 'mid' }));
  red.forEach((c, i) => players.push({ key: `r${i}`, name: `Red${i}`, team: 'red', champ: c, bot: !!opts.bots, role: 'mid' }));
  return new Match({ id: 't', players, seed: 1 });
}
const run = (m, sec) => { for (let i = 0; i < sec * 20; i++) { m.update(0.05); m.flushFx(); } };

describe('map', () => {
  test('every structure, camp, lane point and pit is reachable', () => {
    const valley = getValley();
    const d = bfs(valley.map, 12, 138);
    const reach = (p, what) => assert.ok(d[Math.floor(p.x) + Math.floor(p.y) * valley.map.w] >= 0, `${what} unreachable`);
    for (const t of TEAMS) {
      const T = valley.teams[t];
      reach(T.fountain, 'fountain'); reach(T.core, 'core');
      T.towers.forEach(x => reach(x, `${t} tower`));
      T.spires.forEach(x => reach(x, `${t} spire`));
      T.camps.forEach(c => reach(c, `camp ${c.id}`));
      for (const lane of Object.keys(T.paths)) T.paths[lane].forEach((p, i) => reach(p, `${t} ${lane} path ${i}`));
    }
    reach(valley.epic.wyrm, 'wyrm'); reach(valley.epic.titan, 'titan');
    assert.ok(valley.bushCount >= 10);
  });

  test('the map is mirrored across the diagonal', () => {
    const { map } = getValley();
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) assert.equal(map.get(x, y), map.get(y, x));
  });
});

describe('items', () => {
  test('recipes discount owned components', () => {
    const inv = [{ id: 'warpick', n: 1 }, null, null, null, null, null];
    const p = priceFor('piercer', inv);
    assert.equal(p.price, ITEMS.piercer.cost - ITEMS.warpick.cost);
    assert.deepEqual(p.consume, [0]);
    assert.equal(priceFor('piercer', Array(6).fill(null)).price, ITEMS.piercer.cost);
  });

  test('every recipe component exists and costs less than the item', () => {
    for (const [id, it] of Object.entries(ITEMS)) for (const c of it.from || []) {
      assert.ok(ITEMS[c], `${id} component ${c}`);
      assert.ok(ITEMS[c].cost < it.cost);
    }
    for (const c of Object.values(CHAMPIONS)) for (const id of c.bot.build) assert.ok(ITEMS[id], `${c.id} build item ${id}`);
  });
});

describe('match rules', () => {
  test('heroes level up, gain points and unlock R at 6', () => {
    const m = makeMatch();
    const h = m.heroes[0];
    assert.equal(h.level, 1);
    assert.equal(h.points, 1);
    assert.ok(!canRankUp(h, 'r'));
    m.addXp(h, XP_TO_LEVEL[6]);
    assert.equal(h.level, 6);
    assert.equal(h.points, 6);
    assert.ok(canRankUp(h, 'r'));
    const hp1 = CHAMPIONS.hale.base.hp;
    assert.ok(h.maxHp > hp1);
  });

  test('minion waves spawn, march and fight', () => {
    const m = makeMatch();
    run(m, 26);
    const minions = [...m.entities.values()].filter(e => e.kind === 'minion');
    assert.equal(minions.length, 36, 'six minions per lane per team');
    run(m, 40);
    assert.ok([...m.entities.values()].some(e => e.kind === 'minion' && e.hp < e.maxHp), 'minions are fighting');
  });

  test('towers must fall in order; core is protected', () => {
    const m = makeMatch();
    const red = m.structures.red;
    const t1 = red.find(s => s.kind === 'tower' && s.lane === 'mid' && s.tier === 1);
    const t2 = red.find(s => s.kind === 'tower' && s.lane === 'mid' && s.tier === 2);
    const core = red.find(s => s.kind === 'core');
    const h = m.heroes[0];
    assert.ok(m.structureProtected(t2));
    assert.equal(m.damage(h, t2, 500, 'physical', { attack: true }), 0);
    assert.equal(m.damage(h, core, 500, 'physical', { attack: true }), 0);
    assert.equal(m.damage(h, t1, 500, 'physical', { ability: true }), 0, 'abilities do not damage structures');
    m.kill(t1, h);
    assert.ok(!m.structureProtected(t2));
    assert.ok(m.damage(h, t2, 500, 'physical', { attack: true }) > 0);
    assert.equal(m.towersDown.blue, 1);
  });

  test('destroying the core ends the match', () => {
    let ended = null;
    const m = makeMatch();
    m.hooks.end = (_, r) => { ended = r; };
    const core = m.structures.red.find(s => s.kind === 'core');
    m.kill(core, m.heroes[0]);
    assert.ok(m.ended);
    assert.equal(ended.winner, 'blue');
    assert.equal(ended.players.length, 2);
  });

  test('champion kills grant gold, first strike and respawn timers', () => {
    const m = makeMatch();
    const [b, r] = m.heroes;
    const gold = b.gold;
    m.damage(b, r, 99999, 'true');
    assert.ok(r.dead);
    assert.equal(b.kills, 1);
    assert.ok(b.gold >= gold + 400, 'kill + first strike bounty');
    assert.ok(m.fx.some(e => e.e === 'ann' && /First Strike/.test(e.text)));
    run(m, 4);
    assert.ok(r.dead);
    run(m, 10);
    assert.ok(!r.dead, 'respawned');
    assert.equal(r.hp, r.maxHp);
  });

  test('shop: only at base, boots are unique, recipes consume parts', () => {
    const m = makeMatch();
    const h = m.heroes[0];
    h.gold = 10000;
    m.command(h, { t: 'buy', item: 'boots' });
    m.command(h, { t: 'buy', item: 'boots' });
    assert.equal(h.items.filter(i => i && i.id === 'boots').length, 1);
    m.command(h, { t: 'buy', item: 'warpick' });
    m.command(h, { t: 'buy', item: 'piercer' });
    assert.ok(h.items.some(i => i && i.id === 'piercer'));
    assert.ok(!h.items.some(i => i && i.id === 'warpick'));
    assert.ok(h.stats.armorPen >= 30);
    m.command(h, { t: 'buy', item: 'rushboots' });
    assert.ok(h.items.some(i => i && i.id === 'rushboots') && !h.items.some(i => i && i.id === 'boots'), 'boots upgrade');
    h.x = 75; h.y = 75;
    const g = h.gold;
    m.command(h, { t: 'buy', item: 'heartgem' });
    assert.equal(h.gold, g, 'cannot shop away from base');
    h.x = h.spawn.x; h.y = h.spawn.y;
    m.command(h, { t: 'buy', item: 'potion' });
    const slot = h.items.findIndex(i => i && i.id === 'potion');
    h.hp = 100;
    m.command(h, { t: 'use', slot });
    run(m, 1);
    assert.ok(h.hp > 100);
  });

  test('every champion can cast every ability', () => {
    for (const id of CHAMPION_IDS) {
      const m = makeMatch([id], ['garrok']);
      const [h, enemy] = m.heroes;
      h.x = 75; h.y = 76; enemy.x = 77; enemy.y = 76;
      m.addXp(h, XP_TO_LEVEL[6]);
      for (const s of ['q', 'w', 'e', 'r']) { h.ranks[s] = 1; }
      const ally = m.addHero({ key: 'ally', name: 'Ally', team: 'blue', champ: id === 'mira' ? 'hale' : 'mira', bot: false });
      ally.x = 74; ally.y = 77; ally.hp = ally.maxHp / 2;
      m.updateVision();
      for (const s of ['q', 'w', 'e', 'r']) {
        h.mp = h.maxMp; h.dash = null; h.buffs = h.buffs.filter(b => !b.cc);
        const target = CHAMPIONS[id].abilities[s].target === 'ally' ? ally : enemy;
        m.command(h, { t: 'cast', sl: s, x: target.x, y: target.y, id: target.id });
        assert.ok(h.cd[s] > 0, `${id} ${s} went on cooldown`);
        run(m, 1.5);
        enemy.hp = enemy.maxHp; enemy.x = h.x + 2; enemy.y = h.y; enemy.dead = false;
      }
    }
  });

  test('fog of war hides distant enemies and bushes hide units', () => {
    const m = makeMatch();
    const [b, r] = m.heroes;
    m.updateVision();
    const known = new Map();
    let snap = m.snapshotFor({ team: 'blue', heroId: b.id, known });
    assert.ok(!(snap.a || []).some(e => e.i === r.id), 'enemy at their fountain is hidden');
    assert.ok((snap.a || []).some(e => e.k === 'tower' && e.tm === 'red'), 'structures are always visible');
    // Put both heroes near each other in the open.
    b.x = 75; b.y = 80; r.x = 78; r.y = 80;
    m.updateVision();
    snap = m.snapshotFor({ team: 'blue', heroId: b.id, known });
    assert.ok((snap.a || []).some(e => e.i === r.id), 'enemy in vision is sent');
    // Enemy steps into a bush away from us.
    const valley = m.valley;
    const bushIdx = valley.bushId.findIndex(v => v >= 0);
    const bx = bushIdx % valley.size + 0.5, by = Math.floor(bushIdx / valley.size) + 0.5;
    r.x = bx; r.y = by; b.x = bx + 5; b.y = by;
    if (!m.map.walkableAt(b.x, b.y)) { b.x = bx; b.y = by + 5; }
    m.updateVision();
    assert.equal(r.vis.blue, false, 'hidden in bush');
    b.x = bx; b.y = by;
    m.updateVision();
    assert.equal(r.vis.blue, true, 'visible from inside the same bush');
  });

  test('recall channels and is interrupted by moving', () => {
    const m = makeMatch();
    const h = m.heroes[0];
    h.x = 60; h.y = 90;
    m.command(h, { t: 'recall' });
    run(m, 3);
    assert.ok(h.recall);
    m.command(h, { t: 'mv', x: 62, y: 88 });
    assert.equal(h.recall, null);
    m.command(h, { t: 'recall' });
    run(m, 6.5);
    assert.ok(m.inFountain(h), 'teleported home');
  });

  test('battle spells: blink teleports, scorch burns', () => {
    const m = makeMatch(['hale'], ['garrok']);
    const [b, r] = m.heroes;
    b.spells.f = 'scorch';
    b.x = 75; b.y = 80; r.x = 78; r.y = 80;
    m.updateVision();
    const x0 = b.x;
    m.command(b, { t: 'summ', k: 'd', x: b.x - 10, y: b.y });
    assert.ok(b.x < x0 - 3, 'blinked');
    assert.ok(b.cd.d > 0);
    b.x = 76;
    const hp = r.hp;
    m.command(b, { t: 'summ', k: 'f', x: r.x, y: r.y, id: r.id });
    run(m, 5.5);
    assert.ok(r.hp < hp, 'scorch damage');
  });

  test('a 10-bot game progresses: farming, levels, kills, towers', () => {
    const roles = ['top', 'jungle', 'mid', 'bot', 'support'];
    const blue = ['thorne', 'rook', 'lyra', 'hale', 'mira'], red = ['garrok', 'kaelen', 'zarak', 'nyra', 'brakka'];
    const players = [];
    blue.forEach((c, i) => players.push({ key: `b${i}`, name: `B${i}`, team: 'blue', champ: c, bot: true, role: roles[i], spell: roles[i] === 'jungle' ? 'strike' : 'mend' }));
    red.forEach((c, i) => players.push({ key: `r${i}`, name: `R${i}`, team: 'red', champ: c, bot: true, role: roles[i], spell: roles[i] === 'jungle' ? 'strike' : 'scorch' }));
    const m = new Match({ id: 'bots', players, seed: 3 });
    run(m, 12 * 60);
    const cs = m.heroes.reduce((a, h) => a + h.cs, 0);
    assert.ok(cs > 200, `total cs ${cs}`);
    assert.ok(m.heroes.every(h => h.level >= 5), `levels ${m.heroes.map(h => h.level)}`);
    assert.ok(m.kills.blue + m.kills.red > 3, 'champions fight');
    assert.ok(m.heroes.every(h => h.items.filter(Boolean).length >= 2), 'bots buy items');
    const junglers = m.heroes.filter(h => h.botRole === 'jungle' || h.bot.role === 'jungle');
    assert.ok(junglers.every(h => h.cs > 20), 'junglers clear camps');
  });
});

describe('damage reflection', () => {
  test('two reflect buffs do not bounce damage back and forth forever', () => {
    const m = makeMatch(['zarak'], ['borrin']);
    const z = m.heroes.find(h => h.champ === 'zarak');
    const b = m.heroes.find(h => h.champ === 'borrin');
    b.x = z.x + 1; b.y = z.y;
    CHAMPIONS.zarak.abilities.e.cast(m, z, 1); // Ember Ward: burns whoever damages Zarak
    CHAMPIONS.borrin.abilities.w.cast(m, b, 1); // Barkskin: thorns against champions
    const bHp = b.hp + b.shields.reduce((a, s) => a + s.amt, 0);
    assert.doesNotThrow(() => m.damage(b, z, 40, 'physical', { attack: true }));
    assert.ok(b.hp + b.shields.reduce((a, s) => a + s.amt, 0) < bHp, 'the attacker takes the reflected damage');
    assert.doesNotThrow(() => m.damage(z, b, 40, 'physical', { attack: true }));
  });
});
