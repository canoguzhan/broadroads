/* In-memory character store (tests, and the base for the browser offline store). */
import { leaderboardRow } from './moba/profile.js';

export class MemoryStore {
  constructor() { this.chars = new Map(); }
  async getCharacter(accountId) {
    const c = this.chars.get(accountId);
    return c ? JSON.parse(JSON.stringify(c)) : null;
  }
  async saveCharacter(accountId, char) {
    this.chars.set(accountId, JSON.parse(JSON.stringify(char)));
  }
  async leaderboard(kind, limit = 50) {
    return [...this.chars.values()].map(c => leaderboardRow(c, kind)).sort((a, b) => b.value - a.value).slice(0, limit);
  }
}
