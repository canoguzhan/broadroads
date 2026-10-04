export const TICK_RATE = 20;
export const TICK = 1 / TICK_RATE;
export const VIEW_RADIUS = 34;
export const PROTOCOL_VERSION = 2;

// PvP balance: player-vs-player damage, healing and crowd control are scaled down.
export const PVP_DAMAGE = 0.6;
export const PVP_HEAL = 0.7;
export const PVP_CC = 0.6;

export const POTION_CD = 8;
export const OUT_OF_COMBAT = 5;
export const REVIVE_TIME = 3;
export const REVIVE_RANGE = 2.6;
export const INTERACT_RANGE = 3.2;
export const PICKUP_RANGE = 1.4;

export const PARTY_MAX = 4;
export const WORLD_SHARD_CAP = 60;
export const CHAT_MAX = 200;
export const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{2,15}$/;

// Status flags sent with each entity update.
export const F = {
  DEAD: 1, STUN: 2, SLOW: 4, GUARD: 8, INVULN: 16, DASH: 32, WINDUP: 64,
  BOT: 128, HOSTILE: 256, OPEN: 512, REVIVING: 1024, PARTY: 2048,
};
