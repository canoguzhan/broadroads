/* Account security routes: email on the account, password reset by email,
   and Google / Discord sign-in. Each part switches on when configured:
     SMTP_URL (e.g. smtps://user:pass@smtp.example.com:465) + MAIL_FROM  → reset emails
     GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET                            → Google sign-in
     DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET                          → Discord sign-in
     PUBLIC_URL (default https://broadroads.com)                         → links and OAuth redirects
   Without SMTP, reset links are written to the server log (for the operator). */
import crypto from 'node:crypto';
import { NAME_RE } from '../shared/constants.js';
import { hashPassword, signToken, verifyToken } from './auth.js';

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const RESET_TTL = 3600e3;

const PROVIDERS = {
  google: {
    auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', scope: 'openid email profile',
    async user(accessToken) {
      const u = await (await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } })).json();
      return { id: u.sub, email: u.email_verified ? u.email : null, name: u.given_name || u.name || 'Player' };
    },
  },
  discord: {
    auth: 'https://discord.com/oauth2/authorize', token: 'https://discord.com/api/oauth2/token', scope: 'identify email',
    async user(accessToken) {
      const u = await (await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${accessToken}` } })).json();
      return { id: u.id, email: u.verified ? u.email : null, name: u.global_name || u.username || 'Player' };
    },
  },
};

export function accountRoutes({ cfg, env = process.env, store, secret, log, json, readBody, limiter, clientIp }) {
  const base = (env.PUBLIC_URL || 'https://broadroads.com').replace(/\/$/, '');
  const creds = p => ({ id: env[`${p.toUpperCase()}_CLIENT_ID`], secret: env[`${p.toUpperCase()}_CLIENT_SECRET`] });
  const enabled = p => !!(creds(p).id && creds(p).secret);
  let mailer = null;
  if (env.SMTP_URL) {
    import('nodemailer').then(m => { mailer = m.default.createTransport(env.SMTP_URL); }).catch(err => log.error('mailer', err.message));
  }
  const tokenFor = acc => signToken(secret, { a: acc.id, n: acc.username });
  const bearer = req => verifyToken(secret, String(req.headers.authorization || '').replace(/^Bearer /, ''));

  async function sendMail(to, subject, text) {
    if (!mailer) { log.info(`[mail to ${to}] ${subject}\n${text}`); return; }
    await mailer.sendMail({ from: env.MAIL_FROM || `BroadRoads <no-reply@${new URL(base).hostname}>`, to, subject, text });
  }

  /** A free username based on a display name (letters, digits, _; starts with a letter). */
  async function freeName(name) {
    let stem = String(name).normalize('NFKD').replace(/[^\w]/g, '').replace(/^[^a-zA-Z]+/, '').slice(0, 12) || 'Player';
    if (stem.length < 3) stem = `${stem}Player`.slice(0, 12);
    for (let i = 0; i < 50; i++) {
      const candidate = i ? `${stem}${Math.floor(Math.random() * 9000 + 1000)}` : stem;
      if (NAME_RE.test(candidate) && !(await store.findAccount(candidate))) return candidate;
    }
    return `Player${Date.now().toString(36).slice(-6)}`;
  }

  // Signed, short-lived OAuth state (CSRF protection), optionally carrying an account to link.
  const signState = data => { const b = Buffer.from(JSON.stringify({ ...data, exp: Date.now() + 600e3, n: crypto.randomBytes(8).toString('hex') })).toString('base64url'); return `${b}.${crypto.createHmac('sha256', secret).update(b).digest('base64url')}`; };
  const readState = s => {
    const [b, sig] = String(s || '').split('.');
    if (!b || !sig) return null;
    const good = crypto.createHmac('sha256', secret).update(b).digest('base64url');
    if (good.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(good), Buffer.from(sig))) return null;
    const d = JSON.parse(Buffer.from(b, 'base64url').toString());
    return d.exp > Date.now() ? d : null;
  };

  const guestLimiter = { hits: new Map(), allow(ip) { const now = Date.now(), list = (this.hits.get(ip) || []).filter(t => now - t < 600e3); if (list.length >= 15) return false; list.push(now); this.hits.set(ip, list); return true; } };

  return async function handle(req, res, p, url, cors) {
    // Play instantly: a guest account (random name, random password). Progress is kept; claiming
    // it later sets a real name, password and email.
    if (p === '/api/auth/guest' && req.method === 'POST') {
      if (!guestLimiter.allow(clientIp(req))) return json(res, 429, { error: 'Too many new players from your network. Try again in a few minutes.' }, cors), true;
      for (let i = 0; i < 20; i++) {
        const name = `Guest${Math.floor(10000 + Math.random() * 90000)}`;
        const acc = await store.createAccount(name, hashPassword(crypto.randomBytes(24).toString('hex')));
        if (!acc) continue;
        if (store.updateAccountMeta) await store.updateAccountMeta(acc.id, { guest: true });
        return json(res, 200, { token: tokenFor(acc), username: acc.username, guest: true }, cors), true;
      }
      return json(res, 503, { error: 'Could not create a guest. Please try again.' }, cors), true;
    }

    if (p === '/api/account/claim' && req.method === 'POST') {
      const tok = bearer(req);
      if (!tok) return json(res, 401, { error: 'Not signed in.' }, cors), true;
      const acc = await store.getAccount(tok.a);
      if (!acc || !acc.meta?.guest) return json(res, 400, { error: 'This account is already saved.' }, cors), true;
      const body = await readBody(req).catch(() => ({}));
      const username = String(body.username || '').trim(), password = String(body.password || ''), email = String(body.email || '').trim().toLowerCase();
      if (!NAME_RE.test(username)) return json(res, 400, { error: 'Username must be 3-16 letters, numbers or _ and start with a letter.' }, cors), true;
      if (password.length < 6 || password.length > 128) return json(res, 400, { error: 'Password must be 6-128 characters.' }, cors), true;
      if (email && !EMAIL_RE.test(email)) return json(res, 400, { error: 'That email address does not look right.' }, cors), true;
      if (email) { const other = await store.findAccountBy('email', email); if (other && other.id !== acc.id) return json(res, 409, { error: 'That email is already used by another account.' }, cors), true; }
      if (username.toLowerCase() !== acc.username.toLowerCase() && !(await store.renameAccount(acc.id, username))) return json(res, 409, { error: 'That username is taken.' }, cors), true;
      await store.updatePasswordHash(acc.id, hashPassword(password));
      await store.updateAccountMeta(acc.id, { guest: null, ...(email ? { email } : {}) });
      return json(res, 200, { token: tokenFor({ id: acc.id, username }), username }, cors), true;
    }

    if (p === '/api/auth/providers') return json(res, 200, { google: enabled('google'), discord: enabled('discord'), email: !!env.SMTP_URL }, cors), true;

    if (p === '/api/account' && req.method === 'GET') {
      const tok = bearer(req);
      if (!tok) return json(res, 401, { error: 'Not signed in.' }, cors), true;
      const acc = store.getAccount ? await store.getAccount(tok.a) : null;
      return json(res, 200, { email: acc?.meta?.email || null, linked: Object.keys(acc?.meta?.oauth || {}), guest: !!acc?.meta?.guest }, cors), true;
    }

    if (p === '/api/account/email' && req.method === 'POST') {
      const tok = bearer(req);
      if (!tok) return json(res, 401, { error: 'Not signed in.' }, cors), true;
      const body = await readBody(req).catch(() => ({}));
      const email = String(body.email || '').trim().toLowerCase();
      if (email && !EMAIL_RE.test(email)) return json(res, 400, { error: 'That email address does not look right.' }, cors), true;
      if (email) { const other = await store.findAccountBy('email', email); if (other && other.id !== tok.a) return json(res, 409, { error: 'That email is already used by another account.' }, cors), true; }
      await store.updateAccountMeta(tok.a, { email: email || null });
      return json(res, 200, { ok: true, email: email || null }, cors), true;
    }

    if (p === '/api/auth/forgot' && req.method === 'POST') {
      if (!limiter.allow(clientIp(req))) return json(res, 429, { error: 'Too many attempts. Try again in a few minutes.' }, cors), true;
      const body = await readBody(req).catch(() => ({}));
      const login = String(body.login || '').trim();
      const acc = login.includes('@') ? await store.findAccountBy('email', login) : await store.findAccount(login);
      const full = acc && store.getAccount ? await store.getAccount(acc.id) : null;
      const email = full?.meta?.email;
      if (email) {
        const token = crypto.randomBytes(24).toString('base64url');
        await store.updateAccountMeta(acc.id, { resetHash: sha(token), resetExp: Date.now() + RESET_TTL });
        const link = `${base}/?reset=${token}`;
        await sendMail(email, 'Reset your BroadRoads password', `Hi ${acc.username},\n\nSomeone (hopefully you) asked to reset your BroadRoads password. Open this link within an hour to choose a new one:\n\n${link}\n\nIf you didn't ask for this, you can ignore this email.`).catch(err => log.error('reset mail failed', err.message));
      }
      // Same answer either way, so the form can't be used to discover accounts.
      return json(res, 200, { ok: true }, cors), true;
    }

    if (p === '/api/auth/reset' && req.method === 'POST') {
      if (!limiter.allow(clientIp(req))) return json(res, 429, { error: 'Too many attempts. Try again in a few minutes.' }, cors), true;
      const body = await readBody(req).catch(() => ({}));
      const password = String(body.password || '');
      if (password.length < 6 || password.length > 128) return json(res, 400, { error: 'Password must be 6-128 characters.' }, cors), true;
      const acc = await store.findAccountBy('resetHash', sha(String(body.token || '')));
      if (!acc || !(acc.meta?.resetExp > Date.now())) return json(res, 400, { error: 'This reset link has expired. Ask for a new one.' }, cors), true;
      await store.updatePasswordHash(acc.id, hashPassword(password));
      await store.updateAccountMeta(acc.id, { resetHash: null, resetExp: null });
      return json(res, 200, { token: tokenFor(acc), username: acc.username }, cors), true;
    }

    const m = /^\/api\/auth\/oauth\/(google|discord)\/(start|callback)$/.exec(p);
    if (m) {
      const [, prov, step] = m;
      const P = PROVIDERS[prov], c = creds(prov);
      if (!enabled(prov)) return json(res, 404, { error: `${prov} sign-in is not configured.` }, cors), true;
      const redirect = `${base}/api/auth/oauth/${prov}/callback`;
      if (step === 'start') {
        const link = url.searchParams.get('link') ? verifyToken(secret, url.searchParams.get('link')) : null;
        const q = new URLSearchParams({ client_id: c.id, redirect_uri: redirect, response_type: 'code', scope: P.scope, state: signState({ prov, link: link ? link.a : null }), prompt: prov === 'google' ? 'select_account' : 'consent' });
        res.writeHead(302, { Location: `${P.auth}?${q}` });
        return res.end(), true;
      }
      const fail = msg => { res.writeHead(302, { Location: `/#oauthError=${encodeURIComponent(msg)}` }); res.end(); return true; };
      const st = readState(url.searchParams.get('state'));
      if (!st || st.prov !== prov || !url.searchParams.get('code')) return fail('Sign-in expired. Please try again.');
      try {
        const tr = await fetch(P.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: new URLSearchParams({ code: url.searchParams.get('code'), client_id: c.id, client_secret: c.secret, redirect_uri: redirect, grant_type: 'authorization_code' }) });
        const tk = await tr.json();
        if (!tk.access_token) return fail('Sign-in was cancelled.');
        const u = await P.user(tk.access_token);
        if (!u.id) return fail('Could not read your account.');
        let acc = await store.findAccountBy(`oauth:${prov}`, u.id);
        if (!acc && st.link) acc = await store.getAccount(st.link); // linking from a signed-in account
        if (!acc && u.email) acc = await store.findAccountBy('email', u.email); // same verified email: same player
        if (!acc) acc = await store.createAccount(await freeName(u.name), hashPassword(crypto.randomBytes(24).toString('hex')));
        const full = await store.getAccount(acc.id);
        await store.updateAccountMeta(acc.id, { oauth: { ...(full?.meta?.oauth || {}), [prov]: u.id }, ...(u.email && !full?.meta?.email ? { email: u.email.toLowerCase() } : {}) });
        res.writeHead(302, { Location: `/#oauth=${encodeURIComponent(tokenFor(acc))}&user=${encodeURIComponent(acc.username)}` });
        return res.end(), true;
      } catch (err) {
        log.error('oauth failed', prov, err.message);
        return fail('Sign-in failed. Please try again.');
      }
    }
    return false;
  };
}
