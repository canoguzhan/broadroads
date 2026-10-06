/* Nightly backup: every br_* table in Postgres (as gzipped JSON lines) plus
   the data folder (replays, analytics, reports, file store), into
   BACKUP_DIR/<date>/. Keeps the newest BACKUP_KEEP days (default 14).
   Installed as broadroads-backup.timer; needs no pg_dump.
     node scripts/backup.mjs                       make a backup
     node scripts/backup.mjs --restore <dir> --yes      put a backup's tables back
     node scripts/backup.mjs --restore <dir> --dry-run  check that a backup restores (rolled back)
   Reads DATABASE_URL and DATA_DIR like the server does. */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const OUT = path.resolve(env.BACKUP_DIR || '/var/backups/broadroads');
const KEEP = Number(env.BACKUP_KEEP || 14);
const DATA = path.resolve(env.DATA_DIR || path.join(ROOT, 'data'));
const args = process.argv.slice(2);

async function db() {
  if (!env.DATABASE_URL) return null;
  const { default: pg } = await import('pg');
  // Same connection handling as server/store/pg.js.
  const u = new URL(env.DATABASE_URL);
  const wantSsl = /^(require|verify-ca|verify-full)$/.test(u.searchParams.get('sslmode') || '') || /neon\.tech|supabase/.test(u.hostname);
  for (const k of ['sslmode', 'channel_binding', 'uselibpqcompat']) u.searchParams.delete(k);
  const client = new pg.Client({ connectionString: u.toString(), ssl: wantSsl ? { rejectUnauthorized: true } : undefined });
  await client.connect();
  return client;
}

async function backup() {
  const dir = path.join(OUT, new Date().toISOString().slice(0, 10));
  fs.mkdirSync(dir, { recursive: true });
  const summary = { at: new Date().toISOString(), tables: {} };
  const client = await db();
  if (client) {
    const { rows } = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'br\\_%' ORDER BY 1");
    for (const { table_name: t } of rows) {
      const res = await client.query(`SELECT * FROM "${t}"`);
      fs.writeFileSync(path.join(dir, `${t}.ndjson.gz`), zlib.gzipSync(res.rows.map(r => JSON.stringify(r)).join('\n')));
      summary.tables[t] = res.rows.length;
    }
    await client.end();
  }
  if (fs.existsSync(DATA)) {
    execFileSync('tar', ['-czf', path.join(dir, 'data.tar.gz'), '-C', path.dirname(DATA), path.basename(DATA)]);
    summary.dataBytes = fs.statSync(path.join(dir, 'data.tar.gz')).size;
  }
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 1));
  // Rotate: keep the newest KEEP dated folders.
  const old = fs.readdirSync(OUT).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().slice(0, -KEEP);
  for (const d of old) fs.rmSync(path.join(OUT, d), { recursive: true, force: true });
  console.log(`backup ${dir}: ${JSON.stringify(summary.tables)} data ${summary.dataBytes ?? 0} bytes, removed ${old.length} old`);
}

async function restore(dir) {
  const dry = args.includes('--dry-run'); // restore inside a transaction, then roll back (checks a backup)
  if (!dry && !args.includes('--yes')) { console.error('This replaces the database tables with the backup. Add --yes to continue.'); process.exit(1); }
  const client = await db();
  if (!client) { console.error('DATABASE_URL is not set.'); process.exit(1); }
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.ndjson.gz'));
  await client.query('BEGIN');
  try {
    for (const f of files) {
      const t = f.replace('.ndjson.gz', '');
      const rows = zlib.gunzipSync(fs.readFileSync(path.join(dir, f))).toString().split('\n').filter(Boolean).map(l => JSON.parse(l));
      await client.query(`DELETE FROM "${t}"`);
      for (const r of rows) {
        const cols = Object.keys(r);
        const vals = cols.map(c => (r[c] !== null && typeof r[c] === 'object' && !(r[c] instanceof Date) ? JSON.stringify(r[c]) : r[c]));
        await client.query(`INSERT INTO "${t}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, vals);
      }
      console.log(`restored ${t}: ${rows.length} rows`);
    }
    await client.query(dry ? 'ROLLBACK' : 'COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally { await client.end(); }
  if (dry) { console.log('Dry run: everything restored cleanly and was rolled back.'); return; }
  console.log(`Tables restored. The data folder is in ${path.join(dir, 'data.tar.gz')} (extract it over ${DATA} with the server stopped).`);
}

const ri = args.indexOf('--restore');
(ri >= 0 ? restore(path.resolve(args[ri + 1])) : backup()).catch(err => { console.error('backup failed:', err.message); process.exit(1); });
