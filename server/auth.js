/* Password hashing (scrypt) and signed session tokens (HMAC-SHA256). */
import crypto from 'node:crypto';

const SCRYPT_N = 16384;
const KEYLEN = 32;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEYLEN, { N: SCRYPT_N });
  return `scrypt$${SCRYPT_N}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  if (!stored) return false;
  if (stored.startsWith('scrypt$')) {
    const [, n, saltB64, hashB64] = stored.split('$');
    const expected = Buffer.from(hashB64, 'base64');
    const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, { N: Number(n) });
    return crypto.timingSafeEqual(expected, actual);
  }
  // Legacy accounts from the original Vercel API stored unsalted SHA-256.
  if (/^[0-9a-f]{64}$/.test(stored)) {
    const actual = crypto.createHash('sha256').update(password).digest();
    return crypto.timingSafeEqual(Buffer.from(stored, 'hex'), actual);
  }
  return false;
}

export function isLegacyHash(stored) { return !String(stored).startsWith('scrypt$'); }

const b64url = buf => Buffer.from(buf).toString('base64url');

export function signToken(secret, payload, ttlSeconds = 60 * 60 * 24 * 30) {
  const body = b64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(secret, token) {
  if (typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!payload.exp || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}
