import { sql, sendJson, parseBody } from '../db.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.statusCode = 200;
    return res.end();
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { success: false, error: 'Method Not Allowed' });
  }

  try {
    const data = await parseBody(req);
    const cleanUser = (data.username || '').trim().toLowerCase();
    if (!cleanUser) {
      return sendJson(res, 400, { success: false, error: 'Missing username' });
    }

    const users = await sql`SELECT id FROM broadroads_users WHERE LOWER(username) = ${cleanUser} LIMIT 1`;
    const userId = users.length > 0 ? users[0].id : null;

    const floor = parseInt(data.dungeon_floor, 10) || 1;
    const level = Math.min(100, Math.max(1, parseInt(data.dungeon_level, 10) || Math.floor((floor - 1) / 10) + 1));
    const maxFloor = Math.max(floor, parseInt(data.max_floor_reached, 10) || floor);
    const cleared = parseInt(data.total_dungeons_cleared, 10) || 0;
    const gold = parseInt(data.gold, 10) || 0;
    const mats = JSON.stringify(data.materials || {});
    const gear = JSON.stringify(data.equipped_gear || {});
    const stats = JSON.stringify(data.stats || {});

    let updatedProgress;
    if (userId) {
      updatedProgress = await sql`
        INSERT INTO broadroads_player_progress (
          user_id, username, dungeon_floor, dungeon_level, max_floor_reached, total_dungeons_cleared, gold, materials, equipped_gear, stats, updated_at
        ) VALUES (
          ${userId}, ${cleanUser}, ${floor}, ${level}, ${maxFloor}, ${cleared}, ${gold}, ${mats}, ${gear}, ${stats}, CURRENT_TIMESTAMP
        )
        ON CONFLICT (user_id) DO UPDATE SET
          dungeon_floor = GREATEST(broadroads_player_progress.dungeon_floor, EXCLUDED.dungeon_floor),
          dungeon_level = GREATEST(broadroads_player_progress.dungeon_level, EXCLUDED.dungeon_level),
          max_floor_reached = GREATEST(broadroads_player_progress.max_floor_reached, EXCLUDED.max_floor_reached),
          total_dungeons_cleared = GREATEST(broadroads_player_progress.total_dungeons_cleared, EXCLUDED.total_dungeons_cleared),
          gold = EXCLUDED.gold,
          materials = EXCLUDED.materials,
          equipped_gear = EXCLUDED.equipped_gear,
          stats = EXCLUDED.stats,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *;
      `;
    }

    return sendJson(res, 200, {
      success: true,
      message: 'Progress saved successfully to NeonDB',
      progress: updatedProgress ? updatedProgress[0] : data
    });
  } catch (err) {
    console.error('Save progress API error:', err);
    return sendJson(res, 500, { success: false, error: err.message });
  }
}
