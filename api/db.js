import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';

const dbUrl = process.env.DATABASE_URL || 
  process.env.POSTGRES_URL || 
  'postgresql://neondb_owner:npg_P0wDzBt3UFZX@ep-still-silence-b8a3rj9f-pooler.c-14.us-east-1.aws.neon.tech/neondb?sslmode=require';

export const sql = neon(dbUrl);

export function hashPassword(pwd) {
  return crypto.createHash('sha256').update(pwd || '').digest('hex');
}

export function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(statusCode).json(data);
  }
  return res.end(JSON.stringify(data));
}

export async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch(e) { return {}; }
  }
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch(e) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}
