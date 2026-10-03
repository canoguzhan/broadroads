import { sql, sendJson } from '../db.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.statusCode = 200;
    return res.end();
  }

  if (req.method !== 'GET') {
    return sendJson(res, 405, { success: false, error: 'Method Not Allowed' });
  }

  try {
    const host = (req.headers && req.headers.host) ? req.headers.host : 'localhost';
    const url = new URL(req.url, `http://${host}`);
    const username = (req.query && req.query.username) || url.searchParams.get('username') || '';
    const cleanUser = username.trim().toLowerCase();
    if (!cleanUser) {
      return sendJson(res, 400, { success: false, error: 'Missing username parameter' });
    }

    const records = await sql`
      SELECT p.* 
      FROM broadroads_player_progress p
      JOIN broadroads_users u ON p.user_id = u.id
      WHERE LOWER(u.username) = ${cleanUser}
      LIMIT 1;
    `;

    if (records.length === 0) {
      return sendJson(res, 200, {
        success: true,
        exists: false,
        progress: { dungeon_floor: 1, dungeon_level: 1, max_floor_reached: 1, total_dungeons_cleared: 0, gold: 350 }
      });
    }

    return sendJson(res, 200, {
      success: true,
      exists: true,
      progress: records[0]
    });
  } catch (err) {
    console.error('Load progress API error:', err);
    return sendJson(res, 500, { success: false, error: err.message });
  }
}
