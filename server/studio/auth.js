/* Admin-only access for the studio: one shared admin token (STUDIO_TOKEN, else ADMIN_TOKEN)
   is exchanged for a signed, HttpOnly, SameSite=Strict session cookie. Failed logins are
   rate-limited per IP and globally. Mutating API calls must also carry a same-origin Origin
   and the X-Studio header (a cross-site page can't send either). */
import crypto from 'node:crypto';

const SESSION_HOURS = 12;

export function makeAuth({ token, secret, secure = true, now = Date.now }) {
  if (!token || token.length < 16) throw new Error('STUDIO_TOKEN (or ADMIN_TOKEN) must be set to at least 16 characters');
  const key = crypto.createHash('sha256').update(`studio-session:${secret || token}`).digest();
  const cookieName = secure ? '__Host-studio' : 'studio';
  const fails = new Map(); // ip → { n, first }
  let globalFails = [];
  let epoch = 1; // bump to sign everyone out

  const hmac = s => crypto.createHmac('sha256', key).update(s).digest('base64url');
  const same = (a, b) => {
    const x = crypto.createHash('sha256').update(String(a)).digest();
    const y = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(x, y);
  };

  function issue() {
    const payload = Buffer.from(JSON.stringify({ exp: now() + SESSION_HOURS * 3600e3, e: epoch, n: crypto.randomBytes(9).toString('base64url') })).toString('base64url');
    const value = `${payload}.${hmac(payload)}`;
    return `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}${secure ? '; Secure' : ''}`;
  }

  function session(req) {
    const raw = (req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith(`${cookieName}=`));
    if (!raw) return null;
    const [payload, sig] = raw.slice(cookieName.length + 1).split('.');
    if (!payload || !sig || !same(hmac(payload), sig)) return null;
    try {
      const s = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      return s.exp > now() && s.e === epoch ? s : null;
    } catch { return null; }
  }

  /** → { ok } or { ok: false, status, error, retryAfter? } */
  function login(ip, given) {
    const t = now();
    globalFails = globalFails.filter(x => t - x < 3600e3);
    const f = fails.get(ip);
    if (f && t - f.first > 15 * 60e3) fails.delete(ip);
    const cur = fails.get(ip);
    if ((cur && cur.n >= 5) || globalFails.length >= 30) {
      const retryAfter = cur && cur.n >= 5 ? Math.ceil((cur.first + 15 * 60e3 - t) / 1000) : 900;
      return { ok: false, status: 429, error: 'Too many attempts. Try again later.', retryAfter };
    }
    if (typeof given === 'string' && given.length <= 512 && same(given, token)) { fails.delete(ip); return { ok: true, cookie: issue() }; }
    const n = fails.get(ip) || { n: 0, first: t };
    n.n++;
    fails.set(ip, n);
    if (fails.size > 10000) fails.clear();
    globalFails.push(t);
    return { ok: false, status: 401, error: 'Wrong token.' };
  }

  const logoutCookie = () => `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;

  /** Mutating requests must come from the studio page itself. */
  function sameOrigin(req, publicOrigin) {
    if (req.headers['x-studio'] !== '1') return false;
    const origin = req.headers.origin;
    return !origin || origin === publicOrigin;
  }

  return { login, session, logoutCookie, sameOrigin, signOutEveryone: () => { epoch++; }, hmac, same };
}

export const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https://i.ytimg.com https://yt3.ggpht.com; media-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cache-Control': 'no-store',
};
