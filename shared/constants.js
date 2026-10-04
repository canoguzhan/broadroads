export const TICK_RATE = 20;
export const TICK = 1 / TICK_RATE;
export const PROTOCOL_VERSION = 3;
export const CHAT_MAX = 200;
export const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{2,15}$/;

// Entity status flags sent in snapshots.
export const F = {
  DEAD: 1, STUN: 2, ROOT: 4, SLOW: 8, SILENCE: 16, UNTARGETABLE: 32, AIRBORNE: 64, UNSTOPPABLE: 128,
  SHIELD: 256, RECALL: 512, PROTECTED: 1024, BUSH: 2048, BOT: 4096, BARON: 8192, WINDUP: 16384, DASH: 32768,
};
