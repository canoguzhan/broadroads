/* JSON-file persistence: zero-setup default for self-hosting and development.
   Writes are debounced and atomic (write to temp file, then rename). */
import fs from 'node:fs';
import path from 'node:path';
import { leaderboardRow } from '../../shared/moba/profile.js';

export class FileStore {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'broadroads.json');
    this.data = { nextId: 1, accounts: {}, chars: {} };
    this.timer = null;
    this.writing = Promise.resolve();
  }

  async init() {
    fs.mkdirSync(this.dir, { recursive: true });
    if (fs.existsSync(this.file)) {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    }
    return this;
  }

  scheduleWrite() {
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.flush(); }, 500);
  }

  flush() {
    const json = JSON.stringify(this.data);
    this.writing = this.writing.then(() => {
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, json);
      fs.renameSync(tmp, this.file);
    }).catch(err => console.error('FileStore write failed', err));
    return this.writing;
  }

  async close() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    await this.flush();
  }

  async findAccount(username) {
    const key = username.toLowerCase();
    return Object.values(this.data.accounts).find(a => a.username.toLowerCase() === key) || null;
  }

  async createAccount(username, passwordHash) {
    if (await this.findAccount(username)) return null;
    const id = String(this.data.nextId++);
    const acc = { id, username, passwordHash, createdAt: Date.now() };
    this.data.accounts[id] = acc;
    this.scheduleWrite();
    return acc;
  }

  /** Account metadata (email, linked logins, reset token). */
  async getAccount(id) { const a = this.data.accounts[id]; return a ? { ...a, meta: a.meta || {} } : null; }

  async updateAccountMeta(id, patch) {
    const a = this.data.accounts[id];
    if (!a) return;
    a.meta = { ...(a.meta || {}) };
    for (const [k, v] of Object.entries(patch)) { if (v === null) delete a.meta[k]; else a.meta[k] = v; }
    this.scheduleWrite();
  }

  /** field: 'email' | 'resetHash' | 'oauth:<provider>' */
  async findAccountBy(field, value) {
    const [k, sub] = field.split(':');
    const v = String(value).toLowerCase();
    const a = Object.values(this.data.accounts).find(x => {
      const m = x.meta || {};
      if (sub) return m.oauth && m.oauth[sub] === value;
      return m[k] != null && (k === 'email' ? String(m[k]).toLowerCase() === v : m[k] === value);
    });
    return a ? { ...a, meta: a.meta || {} } : null;
  }

  async renameAccount(id, username) {
    const other = await this.findAccount(username);
    if (other && other.id !== id) return false;
    if (this.data.accounts[id]) { this.data.accounts[id].username = username; this.scheduleWrite(); }
    return true;
  }

  async updatePasswordHash(id, passwordHash) {
    if (this.data.accounts[id]) { this.data.accounts[id].passwordHash = passwordHash; this.scheduleWrite(); }
  }

  async getCharacter(accountId) {
    const c = this.data.chars[accountId];
    return c ? JSON.parse(JSON.stringify(c)) : null;
  }

  async saveCharacter(accountId, char) {
    this.data.chars[accountId] = JSON.parse(JSON.stringify(char));
    this.scheduleWrite();
  }

  async leaderboard(kind, limit = 50) {
    return Object.values(this.data.chars).map(c => leaderboardRow(c, kind)).sort((a, b) => b.value - a.value).slice(0, limit);
  }

  async counts() {
    return { accounts: Object.keys(this.data.accounts).length, characters: Object.keys(this.data.chars).length };
  }
}
