import { defineConfig, loadEnv } from 'vite';
import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function hashPassword(pwd) {
  return crypto.createHash('sha256').update(pwd || '').digest('hex');
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const dbUrl = env.DATABASE_URL || env.POSTGRES_URL || 'postgresql://neondb_owner:npg_P0wDzBt3UFZX@ep-still-silence-b8a3rj9f.c-14.us-east-1.aws.neon.tech/neondb?sslmode=require';
  const sql = neon(dbUrl);

  return {
    define: {
      __NEON_DB_URL__: JSON.stringify(dbUrl)
    },
    build: {
      outDir: 'dist'
    },
    plugins: [
      {
        name: 'neon-api-server',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
            
            // Health Check
            if (url.pathname === '/api/health') {
              res.setHeader('Content-Type', 'application/json');
              try {
                const now = await sql`SELECT NOW() as time`;
                res.end(JSON.stringify({ status: 'ok', db: 'connected', time: now[0].time }));
              } catch (e) {
                res.statusCode = 500;
                res.end(JSON.stringify({ status: 'error', error: e.message }));
              }
              return;
            }

            // Register User
            if (url.pathname === '/api/auth/register' && req.method === 'POST') {
              res.setHeader('Content-Type', 'application/json');
              try {
                const { username, password } = await parseBody(req);
                const cleanUser = (username || '').trim().toLowerCase();
                if (!cleanUser || cleanUser.length < 3) {
                  res.statusCode = 400;
                  return res.end(JSON.stringify({ success: false, error: 'Username must be at least 3 characters' }));
                }
                if (!password || password.length < 4) {
                  res.statusCode = 400;
                  return res.end(JSON.stringify({ success: false, error: 'Password must be at least 4 characters' }));
                }

                // Check if user already exists
                const existing = await sql`SELECT id FROM broadroads_users WHERE LOWER(username) = ${cleanUser} LIMIT 1`;
                if (existing.length > 0) {
                  res.statusCode = 409;
                  return res.end(JSON.stringify({ success: false, error: 'Username is already taken' }));
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

                res.end(JSON.stringify({
                  success: true,
                  message: 'Registration successful',
                  user: { id: user.id, username: user.username },
                  progress: initialProgress[0]
                }));
              } catch (err) {
                console.error('Registration API error:', err);
                res.statusCode = 500;
                res.end(JSON.stringify({ success: false, error: err.message }));
              }
              return;
            }

            // Login User
            if (url.pathname === '/api/auth/login' && req.method === 'POST') {
              res.setHeader('Content-Type', 'application/json');
              try {
                const { username, password } = await parseBody(req);
                const cleanUser = (username || '').trim().toLowerCase();
                const hashed = hashPassword(password);

                const users = await sql`
                  SELECT id, username, password_hash, created_at 
                  FROM broadroads_users 
                  WHERE LOWER(username) = ${cleanUser} 
                  LIMIT 1;
                `;

                if (users.length === 0 || users[0].password_hash !== hashed) {
                  res.statusCode = 401;
                  return res.end(JSON.stringify({ success: false, error: 'Invalid username or password' }));
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

                res.end(JSON.stringify({
                  success: true,
                  message: 'Login successful',
                  user: { id: user.id, username: user.username },
                  progress: progressRecords[0]
                }));
              } catch (err) {
                console.error('Login API error:', err);
                res.statusCode = 500;
                res.end(JSON.stringify({ success: false, error: err.message }));
              }
              return;
            }

            // Save Progress
            if (url.pathname === '/api/progress/save' && req.method === 'POST') {
              res.setHeader('Content-Type', 'application/json');
              try {
                const data = await parseBody(req);
                const cleanUser = (data.username || '').trim().toLowerCase();
                if (!cleanUser) {
                  res.statusCode = 400;
                  return res.end(JSON.stringify({ success: false, error: 'Missing username' }));
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

                res.end(JSON.stringify({
                  success: true,
                  message: 'Progress saved successfully to NeonDB',
                  progress: updatedProgress ? updatedProgress[0] : data
                }));
              } catch (err) {
                console.error('Save progress API error:', err);
                res.statusCode = 500;
                res.end(JSON.stringify({ success: false, error: err.message }));
              }
              return;
            }

            // Load Progress
            if (url.pathname === '/api/progress/load' && req.method === 'GET') {
              res.setHeader('Content-Type', 'application/json');
              try {
                const username = url.searchParams.get('username') || '';
                const cleanUser = username.trim().toLowerCase();
                if (!cleanUser) {
                  res.statusCode = 400;
                  return res.end(JSON.stringify({ success: false, error: 'Missing username parameter' }));
                }

                const records = await sql`
                  SELECT p.* 
                  FROM broadroads_player_progress p
                  JOIN broadroads_users u ON p.user_id = u.id
                  WHERE LOWER(u.username) = ${cleanUser}
                  LIMIT 1;
                `;

                if (records.length === 0) {
                  return res.end(JSON.stringify({
                    success: true,
                    exists: false,
                    progress: { dungeon_floor: 1, dungeon_level: 1, max_floor_reached: 1, total_dungeons_cleared: 0, gold: 350 }
                  }));
                }

                res.end(JSON.stringify({
                  success: true,
                  exists: true,
                  progress: records[0]
                }));
              } catch (err) {
                console.error('Load progress API error:', err);
                res.statusCode = 500;
                res.end(JSON.stringify({ success: false, error: err.message }));
              }
              return;
            }

            next();
          });
        }
      }
    ]
  };
});
