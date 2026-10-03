import { sql, hashPassword, sendJson, parseBody } from '../db.js';

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
    const { username, password } = await parseBody(req);
    const cleanUser = (username || '').trim().toLowerCase();
    if (!cleanUser || cleanUser.length < 3) {
      return sendJson(res, 400, { success: false, error: 'Username must be at least 3 characters' });
    }
    if (!password || password.length < 4) {
      return sendJson(res, 400, { success: false, error: 'Password must be at least 4 characters' });
    }

    // Check if user already exists
    const existing = await sql`SELECT id FROM broadroads_users WHERE LOWER(username) = ${cleanUser} LIMIT 1`;
    if (existing.length > 0) {
      return sendJson(res, 409, { success: false, error: 'Username is already taken' });
    }

    const hashed = hashPassword(password);
    const insertedUser = await sql`
      INSERT INTO broadroads_users (username, password_hash)
      VALUES (${cleanUser}, ${hashed})
      RETURNING id, username, created_at;
    `;
    const user = insertedUser[0];

    // Create initial player progress record
    const initialProgress = await sql`
      INSERT INTO broadroads_player_progress (
        user_id, username, dungeon_floor, dungeon_level, max_floor_reached, total_dungeons_cleared, gold
      ) VALUES (
        ${user.id}, ${user.username}, 1, 1, 1, 0, 350
      ) RETURNING *;
    `;

    return sendJson(res, 200, {
      success: true,
      message: 'Registration successful',
      user: { id: user.id, username: user.username },
      progress: initialProgress[0]
    });
  } catch (err) {
    console.error('Registration API error:', err);
    return sendJson(res, 500, { success: false, error: err.message });
  }
}
