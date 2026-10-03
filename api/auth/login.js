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
    const hashed = hashPassword(password);

    if (!cleanUser || !password) {
      return sendJson(res, 400, { success: false, error: 'Username and password required' });
    }

    const users = await sql`
      SELECT id, username, password_hash, created_at 
      FROM broadroads_users 
      WHERE LOWER(username) = ${cleanUser} 
      LIMIT 1;
    `;

    if (users.length === 0 || users[0].password_hash !== hashed) {
      return sendJson(res, 401, { success: false, error: 'Invalid username or password' });
    }

    const user = users[0];
    await sql`UPDATE broadroads_users SET last_login = CURRENT_TIMESTAMP WHERE id = ${user.id}`;

    let progressRecords = await sql`
      SELECT * FROM broadroads_player_progress WHERE user_id = ${user.id} LIMIT 1;
    `;

    if (progressRecords.length === 0) {
      progressRecords = await sql`
        INSERT INTO broadroads_player_progress (
          user_id, username, dungeon_floor, dungeon_level, max_floor_reached, total_dungeons_cleared, gold
        ) VALUES (
          ${user.id}, ${user.username}, 1, 1, 1, 0, 350
        ) RETURNING *;
      `;
    }

    return sendJson(res, 200, {
      success: true,
      message: 'Login successful',
      user: { id: user.id, username: user.username },
      progress: progressRecords[0]
    });
  } catch (err) {
    console.error('Login API error:', err);
    return sendJson(res, 500, { success: false, error: err.message });
  }
}
