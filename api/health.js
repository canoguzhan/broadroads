import { sql, sendJson } from './db.js';

export default async function handler(req, res) {
  try {
    const now = await sql`SELECT NOW() as time`;
    return sendJson(res, 200, { status: 'ok', db: 'connected', time: now[0].time });
  } catch (err) {
    return sendJson(res, 500, { status: 'error', error: err.message });
  }
}
