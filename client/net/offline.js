/* Offline mode: runs the authoritative Hub inside the browser. Same game rules,
   same protocol; your hero is saved to localStorage. Other players are bots. */
import { Hub, leaderboardRow } from '../../shared/hub.js';
import { Emitter } from './connection.js';

const KEY = 'broadroads_offline_v2';

class LocalStore {
  load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
  }
  async getCharacter(accountId) { return this.load()[accountId] || null; }
  async saveCharacter(accountId, char) {
    const all = this.load();
    all[accountId] = char;
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage full or blocked */ }
  }
  async leaderboard(kind, limit = 50) {
    return Object.values(this.load()).map(c => leaderboardRow(c, kind)).sort((a, b) => b.value - a.value).slice(0, limit);
  }
}

export function offlineProfileName() {
  try { return localStorage.getItem('broadroads_offline_name') || ''; } catch { return ''; }
}

/* Offline replays live in memory for the session (the last few matches). */
function memoryReplays(keep = 5) {
  const items = [];
  return {
    async save(header, lines) { items.unshift({ header, lines }); items.length = Math.min(items.length, keep); },
    async list() { return items.map(({ header: { t, v, ...meta } }) => meta); },
    async load(id) { const r = items.find(x => x.header.id === id); return r ? { header: r.header, lines: r.lines } : null; },
  };
}

export class OfflineConnection extends Emitter {
  constructor(name) {
    super();
    this.name = name;
    this.offline = true;
    this.hub = new Hub({ store: new LocalStore(), offline: true, config: { selectTime: 25 }, replays: memoryReplays() });
    this.session = null;
    this.bytesIn = 0;
  }

  async connect() {
    try { localStorage.setItem('broadroads_offline_name', this.name); } catch { /* ignore */ }
    this.hub.start();
    // Deliver asynchronously, like a network would, so handlers never re-enter the hub.
    // Messages are cloned so the client never shares objects with the simulation.
    const deliver = msg => {
      const copy = structuredClone(msg);
      queueMicrotask(() => this.emit(copy.t, copy));
    };
    this.session = await this.hub.connect({ accountId: `local:${this.name.toLowerCase()}`, name: this.name, send: deliver });
  }

  send(msg) {
    if (!this.session) return;
    const copy = JSON.parse(JSON.stringify(msg));
    queueMicrotask(() => this.hub.handle(this.session, copy));
  }

  close() {
    if (this.session) this.hub.disconnect(this.session);
    this.hub.stop();
    this.emit('disconnect', { byUs: true });
  }
}
