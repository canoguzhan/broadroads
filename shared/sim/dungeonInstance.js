/* Dungeon run: solo (single player) or party (MMO co-op). Descends floor by floor. */
import { Instance } from './instance.js';
import { FlowField } from './flow.js';
import { generateDungeon, BOSS_EVERY } from '../dungeon.js';
import { generateItem, rollRarity, rollMaterial } from '../items.js';

export class DungeonInstance extends Instance {
  constructor(hub, { id, mode, floor, seed, themeId, partyId = null, players = 1 }) {
    const gen = generateDungeon(seed + floor * 7919, floor);
    super(hub, { id, kind: 'dungeon', name: '', map: gen.map, theme: themeId, seed });
    this.mode = mode;
    this.seed = seed;
    this.partyId = partyId;
    this.allowRevive = mode === 'party';
    this.wipeT = 0;
    this.expected = players;
    this.setupFloor(gen);
  }

  setupFloor(gen) {
    this.gen = gen;
    this.floor = gen.floor;
    this.name = `${this.mode === 'solo' ? 'Solo' : 'Party'} Dungeon · Floor ${gen.floor}`;
    this.map = gen.map;
    this.flow = new FlowField(this.map);
    this.decor = { torches: gen.torches };
    this.lootLuck = Math.floor(gen.floor / 4);
    this.kills = 0;
    this.bossEnt = null;
    const humans = Math.max(1, this.sessions.size, this.expected || 1);
    for (const e of [...this.entities.values()]) if (e.kind !== 'player') this.remove(e);
    for (const s of gen.spawns) this.spawnMonster(s.type, s.level, s.x, s.y, { elite: s.elite, playerCount: humans });
    for (const c of gen.chests) this.add({ kind: 'chest', x: c.x, y: c.y, r: 0.5, facing: 0, open: false });
    this.add({ kind: 'portal', type: 'exit', label: 'Return to Town', x: gen.exit.x, y: gen.exit.y, r: 0.8, facing: 0, open: true });
    this.stairs = this.add({ kind: 'portal', type: 'stairs', label: gen.boss ? 'Sealed Stairs' : `Descend to Floor ${gen.floor + 1}`, x: gen.stairs.x, y: gen.stairs.y, r: 0.9, facing: 0, open: !gen.boss });
    if (gen.bossSpawn) {
      const b = gen.bossSpawn;
      this.bossEnt = this.spawnMonster(b.type, b.level, b.x, b.y, { playerCount: humans });
    }
  }

  /** Moves everyone to the next floor (or re-sends the zone after regeneration). */
  descend() {
    const next = this.floor + 1;
    this.setupFloor(generateDungeon(this.seed + next * 7919, next));
    for (const p of this.players()) {
      if (p.dead) this.revivePlayer(p, undefined, undefined, 0.5);
      const [x, y] = [this.gen.start.x + this.rng.range(-1, 1), this.gen.start.y + this.rng.range(-1, 1)];
      p.x = x; p.y = y;
      p.inputQueue.length = 0;
      p.dashT = 0; p.kx = 0; p.ky = 0;
      if (p.char) {
        p.char.stats.deepestFloor = Math.max(p.char.stats.deepestFloor, next);
        if (this.mode === 'solo') p.char.stats.deepestSolo = Math.max(p.char.stats.deepestSolo || 0, next);
        this.markCharDirty(p);
      }
      if (p.session) {
        p.session.known = new Map();
        p.session.send({ t: 'zone', zone: this.zoneInfo(), you: p.id });
      }
    }
    this.hub.saveInstancePlayers(this);
  }

  combatAllowed() { return true; }

  onJoin(p) {
    if (p.char) {
      p.char.stats.deepestFloor = Math.max(p.char.stats.deepestFloor, this.floor);
      this.markCharDirty(p);
    }
  }

  onPlayerDeath(p) {
    if (p.char) {
      p.char.stats.deaths++;
      this.markCharDirty(p);
    }
    if (this.players().every(x => x.dead)) this.wipeT = 3;
    else this.hub.notice(p.session, 'You are down! Stand-by allies can revive you, or return to town.', 'bad');
  }

  onMonsterDeath(m) {
    this.kills++;
    if (m === this.bossEnt) {
      this.stairs.open = true;
      this.stairs.label = `Descend to Floor ${this.floor + 1}`;
      this.stairs.ver++;
      for (const p of this.players()) {
        if (!p.char) continue;
        p.char.stats.dungeonsCleared++;
        this.markCharDirty(p);
      }
      this.hub.instanceNotice(this, `🏆 ${m.name} defeated! The stairs are unsealed.`, 'good');
      this.hub.saveInstancePlayers(this);
    }
  }

  onInteract(p, e) {
    if (e.kind === 'chest' && !e.open) {
      e.open = true;
      e.ver++;
      for (const q of this.players()) {
        if (!q.char) continue;
        const luck = this.lootLuck + 1;
        this.dropLoot(q, e.x, e.y, { type: 'item', item: generateItem(this.rng, { ilvl: this.gen.level, rarity: rollRarity(this.rng, luck), cls: q.cls }) }, 0);
        this.dropLoot(q, e.x, e.y, { type: 'mat', mat: rollMaterial(this.rng, luck), n: 2 }, 1);
        const gold = Math.round(15 + this.floor * 6 * this.rng.range(0.8, 1.3));
        this.hub.grantGold(q, gold);
        this.emit({ e: 'reward', id: q.id, to: q.id, xp: 0, gold, x: e.x, y: e.y });
      }
      this.emit({ e: 'chest', x: e.x, y: e.y });
    } else if (e.kind === 'portal' && e.type === 'exit') {
      this.hub.returnToWorld(p.session);
    } else if (e.kind === 'portal' && e.type === 'stairs') {
      if (!e.open) return this.hub.notice(p.session, 'The stairs are sealed. Defeat the guardian first!', 'warn');
      this.hub.instanceNotice(this, `${p.name} leads the way down to floor ${this.floor + 1}…`, 'info');
      this.descend();
    }
  }

  onUpdate(dt) {
    if (this.wipeT > 0) {
      this.wipeT -= dt;
      if (this.wipeT <= 0) {
        const floor = this.floor;
        for (const p of this.players()) {
          if (!p.session) continue;
          const lost = Math.floor(p.char.gold * 0.05);
          p.char.gold -= lost;
          this.markCharDirty(p);
          p.session.send({ t: 'result', kind: 'dungeonFail', floor, gold: lost });
          this.hub.returnToWorld(p.session);
        }
      }
    }
  }

  dynamicMeta() {
    let left = 0;
    for (const e of this.entities.values()) if (e.kind === 'monster' && !e.dead && !e.summoned) left++;
    return {
      mode: this.mode,
      floor: this.floor,
      bossFloor: this.floor % BOSS_EVERY === 0,
      left,
      kills: this.kills,
      boss: this.bossEnt && !this.bossEnt.dead && !this.bossEnt.removed ? { name: this.bossEnt.name, hp: Math.ceil(this.bossEnt.hp), mhp: this.bossEnt.maxHp } : null,
      stairsOpen: this.stairs.open,
      stairs: { x: this.stairs.x, y: this.stairs.y },
    };
  }
}
