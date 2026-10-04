/* PostgreSQL persistence (works with Neon, Supabase, RDS or a local Postgres).
   Enabled when DATABASE_URL is set. */
import pg from 'pg';

const LB_EXPR = {
  level: "(data->>'level')::int * 10000000 + COALESCE((data->>'xp')::int, 0)",
  floor: "COALESCE((data->'stats'->>'deepestFloor')::int, 0)",
  duel: "COALESCE((data->'rating'->>'duel')::int, 1000)",
  team: "COALESCE((data->'rating'->>'team')::int, 1000)",
  ffa: "COALESCE((data->'rating'->>'ffa')::int, 1000)",
  kills: "COALESCE((data->'stats'->>'kills')::int, 0)",
};

export class PgStore {
  constructor(url) {
    // SSL is configured explicitly; libpq-only URL parameters are stripped so pg does not warn about them.
    const u = new URL(url);
    const wantSsl = /^(require|verify-ca|verify-full)$/.test(u.searchParams.get('sslmode') || '') || /neon\.tech|supabase/.test(u.hostname);
    for (const k of ['sslmode', 'channel_binding', 'uselibpqcompat']) u.searchParams.delete(k);
    this.pool = new pg.Pool({ connectionString: u.toString(), ssl: wantSsl ? { rejectUnauthorized: true } : undefined, max: 5 });
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS br_accounts (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS br_accounts_username ON br_accounts (lower(username));
      CREATE TABLE IF NOT EXISTS br_characters (
        account_id INTEGER PRIMARY KEY REFERENCES br_accounts(id) ON DELETE CASCADE,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    return this;
  }

  async close() { await this.pool.end(); }

  async findAccount(username) {
    const { rows } = await this.pool.query(
      'SELECT id::text, username, password_hash AS "passwordHash" FROM br_accounts WHERE lower(username) = lower($1)', [username]);
    if (rows[0]) return rows[0];
    return this.migrateLegacy(username);
  }

  /** Imports an account from the original Vercel API's broadroads_users table, if present. */
  async migrateLegacy(username) {
    try {
      const { rows } = await this.pool.query('SELECT username, password_hash FROM broadroads_users WHERE lower(username) = lower($1) LIMIT 1', [username]);
      if (!rows[0]) return null;
      return await this.createAccount(rows[0].username, rows[0].password_hash);
    } catch {
      return null; // legacy table does not exist
    }
  }

  async createAccount(username, passwordHash) {
    try {
      const { rows } = await this.pool.query(
        'INSERT INTO br_accounts (username, password_hash) VALUES ($1, $2) RETURNING id::text, username, password_hash AS "passwordHash"',
        [username, passwordHash]);
      return rows[0];
    } catch (err) {
      if (err.code === '23505') return null; // unique violation
      throw err;
    }
  }

  async updatePasswordHash(id, passwordHash) {
    await this.pool.query('UPDATE br_accounts SET password_hash = $2 WHERE id = $1', [id, passwordHash]);
  }

  async getCharacter(accountId) {
    const { rows } = await this.pool.query('SELECT data FROM br_characters WHERE account_id = $1', [accountId]);
    return rows[0] ? rows[0].data : null;
  }

  async saveCharacter(accountId, char) {
    await this.pool.query(
      `INSERT INTO br_characters (account_id, data, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (account_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [accountId, JSON.stringify(char)]);
  }

  async leaderboard(kind, limit = 50) {
    const expr = LB_EXPR[kind] || LB_EXPR.level;
    const { rows } = await this.pool.query(
      `SELECT data->>'name' AS name, data->>'cls' AS cls, (data->>'level')::int AS level, ${expr} AS value
       FROM br_characters ORDER BY value DESC LIMIT $1`, [limit]);
    return rows.map(r => ({ ...r, value: Number(r.value) }));
  }

  async counts() {
    const a = await this.pool.query('SELECT count(*)::int AS n FROM br_accounts');
    const c = await this.pool.query('SELECT count(*)::int AS n FROM br_characters');
    return { accounts: a.rows[0].n, characters: c.rows[0].n };
  }
}
