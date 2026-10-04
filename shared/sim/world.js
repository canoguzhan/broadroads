/* MMO overworld shard: safe town with NPCs, monster camps, world boss events. */
import { Instance } from './instance.js';
import { generateWorld, isInTown, zoneAt } from '../worldmap.js';
import { dist } from '../math.js';

let cachedWorld = null;
export function getWorldData() {
  if (!cachedWorld) cachedWorld = generateWorld();
  return cachedWorld;
}

const CAMP_RESPAWN = 25;

export class WorldInstance extends Instance {
  constructor(hub, { shard = 1, themeId }) {
    const w = getWorldData();
    super(hub, {
      id: `world-${shard}`,
      kind: 'world',
      name: `The Broadroads · Shard ${shard}`,
      map: w.map,
      theme: themeId,
      decor: { camps: w.camps.map(c => ({ x: c.x, y: c.y, zone: c.zone, level: c.level })), bossSpot: w.bossSpot, town: w.town },
    });
    this.shard = shard;
    this.world = w;
    this.allowRevive = true;
    this.bossInterval = hub.config.worldBossInterval ?? 900;
    this.bossTimer = hub.config.worldBossFirst ?? 300;
    this.boss = null;
    this.bossDespawn = 0;

    for (const n of w.npcs) {
      this.add({ ...n, id: undefined, npcId: n.id, kind: 'npc', r: 0.6, facing: Math.PI / 2 });
    }
    this.camps = w.camps.map(c => ({ ...c, slots: Array.from({ length: c.count }, () => ({ mid: null, t: 0 })) }));
    for (const camp of this.camps) for (const slot of camp.slots) this.spawnCampMonster(camp, slot);
  }

  spawnCampMonster(camp, slot) {
    const a = this.rng.range(0, Math.PI * 2), rr = this.rng.range(0, camp.radius - 1);
    const elite = this.rng.chance(0.06);
    const m = this.spawnMonster(this.rng.pick(camp.pool), camp.level, camp.x + Math.cos(a) * rr, camp.y + Math.sin(a) * rr, { elite, spawnRef: slot });
    m.home = { x: camp.x, y: camp.y };
    slot.mid = m.id;
    slot.t = 0;
  }

  combatAllowed(p) { return !isInTown(this.world, p.x, p.y); }
  respawnDelay() { return 4; }

  onPlayerDeath(p) {
    p.respawnAt = this.time + this.respawnDelay();
    if (p.char) {
      p.char.stats.deaths++;
      const lost = Math.floor(p.char.gold * 0.05);
      p.char.gold -= lost;
      this.markCharDirty(p);
      if (lost > 0) this.hub.notice(p.session, `You died and dropped ${lost} gold.`, 'bad');
    }
  }

  respawn(p) {
    if (!p.dead || this.time < (p.respawnAt || 0)) return;
    const s = this.world.spawn;
    this.revivePlayer(p, s.x + this.rng.range(-2, 2), s.y + this.rng.range(-1, 1), 0.6);
  }

  onMonsterDeath(m) {
    if (m === this.boss) {
      this.hub.announce(`⚔️ ${m.name} has been slain in Shard ${this.shard}!`, 'event');
      this.boss = null;
      this.bossTimer = this.bossInterval;
    }
    if (m.spawnRef) m.spawnRef.t = CAMP_RESPAWN;
  }

  onInteract(p, e) {
    if (e.kind === 'npc') this.hub.openNpc(p.session, e.type);
  }

  spawnWorldBoss() {
    const near = this.humanPlayers().length;
    const s = this.world.bossSpot;
    this.boss = this.spawnMonster('behemoth', 20, s.x, s.y, { playerCount: Math.max(2, near) });
    this.boss.home = { x: s.x, y: s.y };
    this.bossDespawn = 600;
    this.hub.announce(`🔥 The Broadroad Behemoth has awoken in the south-east wastes of Shard ${this.shard}!`, 'event', this);
  }

  onUpdate(dt) {
    for (const camp of this.camps) {
      for (const slot of camp.slots) {
        if (slot.t > 0) {
          slot.t -= dt;
          if (slot.t <= 0) this.spawnCampMonster(camp, slot);
        }
      }
    }
    if (this.boss) {
      this.bossDespawn -= dt;
      // Behemoth stays near its lair.
      if (dist(this.boss.x, this.boss.y, this.boss.home.x, this.boss.home.y) > 22) {
        this.boss.target = null;
        this.boss.x = this.boss.home.x; this.boss.y = this.boss.home.y;
        this.boss.hp = this.boss.maxHp;
      }
      if (this.bossDespawn <= 0 && !this.boss.dead) {
        this.remove(this.boss);
        this.boss = null;
        this.bossTimer = this.bossInterval;
        this.hub.announce('The Behemoth retreats into the wastes…', 'event', this);
      }
    } else if (this.bossInterval > 0) {
      this.bossTimer -= dt;
      if (this.bossTimer <= 0) this.spawnWorldBoss();
    }
  }

  dynamicMeta() {
    return {
      shard: this.shard,
      players: this.humanPlayers().length,
      boss: this.boss ? { hp: Math.ceil(this.boss.hp), mhp: this.boss.maxHp, x: this.boss.x, y: this.boss.y } : null,
      bossIn: this.boss ? 0 : Math.ceil(this.bossTimer),
    };
  }

  zoneNameAt(x, y) { return zoneAt(x, y).name; }
}
