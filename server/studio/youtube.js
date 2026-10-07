/* YouTube Data API v3: OAuth (offline access, refresh token encrypted at rest with the
   studio secret), resumable video uploads and custom thumbnails. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/youtube/v3';
const UPLOAD = 'https://www.googleapis.com/upload/youtube/v3';
export const SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'];

function seal(secret, obj) {
  const key = crypto.createHash('sha256').update(`yt-token:${secret}`).digest();
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64');
}
function unseal(secret, str) {
  const raw = Buffer.from(str, 'base64');
  const key = crypto.createHash('sha256').update(`yt-token:${secret}`).digest();
  const d = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8'));
}

export class YouTube {
  constructor({ clientId, clientSecret, redirectUri, tokenFile, secret, fetchImpl = fetch }) {
    Object.assign(this, { clientId, clientSecret, redirectUri, tokenFile, secret });
    this.fetch = fetchImpl;
    this.access = null;
  }

  get configured() { return !!(this.clientId && this.clientSecret); }

  saved() {
    try { return unseal(this.secret, fs.readFileSync(this.tokenFile, 'utf8')); } catch { return null; }
  }

  get connected() { return !!this.saved()?.refresh_token; }

  authUrl(state) {
    const q = new URLSearchParams({ client_id: this.clientId, redirect_uri: this.redirectUri, response_type: 'code', scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state });
    return `${AUTH}?${q}`;
  }

  async exchange(code) {
    const r = await this.fetch(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: this.clientId, client_secret: this.clientSecret, redirect_uri: this.redirectUri, grant_type: 'authorization_code' }) });
    const j = await r.json();
    if (!r.ok || !j.refresh_token) throw new Error(`Google token exchange failed: ${j.error_description || j.error || r.status}${r.ok ? ' (no refresh token: remove the app at myaccount.google.com/permissions and connect again)' : ''}`);
    this.access = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
    const channel = await this.channel().catch(() => null);
    fs.writeFileSync(this.tokenFile, seal(this.secret, { refresh_token: j.refresh_token, scope: j.scope, channel, at: Date.now() }), { mode: 0o600 });
    return channel;
  }

  disconnect() {
    const s = this.saved();
    try { fs.unlinkSync(this.tokenFile); } catch { /* not connected */ }
    this.access = null;
    if (s?.refresh_token) this.fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(s.refresh_token)}`, { method: 'POST' }).catch(() => {});
  }

  async token() {
    if (this.access && this.access.exp > Date.now()) return this.access.token;
    const s = this.saved();
    if (!s?.refresh_token) throw new Error('YouTube is not connected');
    const r = await this.fetch(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: this.clientId, client_secret: this.clientSecret, refresh_token: s.refresh_token, grant_type: 'refresh_token' }) });
    const j = await r.json();
    if (!r.ok) throw new Error(`Google token refresh failed: ${j.error_description || j.error || r.status}`);
    this.access = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
    return this.access.token;
  }

  async channel() {
    const r = await this.fetch(`${API}/channels?part=snippet&mine=true`, { headers: { Authorization: `Bearer ${await this.token()}` } });
    const j = await r.json();
    const c = j.items?.[0];
    return c ? { id: c.id, title: c.snippet.title, thumb: c.snippet.thumbnails?.default?.url || null } : null;
  }

  /**
   * Uploads a video (resumable, retried) → { id, url }.
   * meta: { title, description, tags, privacy, publishAt?, madeForKids?, synthetic? }
   */
  async upload(file, meta, { onProgress = () => {}, signal } = {}) {
    const size = fs.statSync(file).size;
    const status = { privacyStatus: meta.publishAt ? 'private' : meta.privacy || 'public', selfDeclaredMadeForKids: !!meta.madeForKids, containsSyntheticMedia: !!meta.synthetic };
    if (meta.publishAt) status.publishAt = meta.publishAt;
    const init = await this.fetch(`${UPLOAD}/videos?uploadType=resumable&part=snippet,status`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': String(size) },
      body: JSON.stringify({ snippet: { title: meta.title, description: meta.description, tags: meta.tags, categoryId: '20', defaultLanguage: 'en', defaultAudioLanguage: 'en' }, status }),
    });
    if (!init.ok) { const e = await apiError(init); throw Object.assign(new Error(`YouTube upload refused: ${init.status} ${e.message}`), { reason: e.reason, status: init.status }); }
    const session = init.headers.get('location');
    let offset = 0;
    for (let attempt = 0; attempt < 8; attempt++) {
      if (signal?.aborted) throw new Error('cancelled');
      try {
        const chunk = fs.createReadStream(file, { start: offset });
        let sent = offset;
        chunk.on('data', d => { sent += d.length; onProgress(sent / size); });
        const r = await this.fetch(session, {
          method: 'PUT', duplex: 'half', signal,
          headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Length': String(size - offset), 'Content-Type': 'video/mp4', ...(offset ? { 'Content-Range': `bytes ${offset}-${size - 1}/${size}` } : {}) },
          body: offset === size ? null : Readable.toWeb(chunk),
        });
        if (r.ok) { const j = await r.json(); onProgress(1); return { id: j.id, url: `https://youtu.be/${j.id}`, status: j.status }; }
        if (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429) { const e = await apiError(r); throw Object.assign(new Error(`YouTube upload failed: ${r.status} ${e.message}`), { fatal: true, reason: e.reason, status: r.status }); }
      } catch (err) {
        if (err.fatal || signal?.aborted) throw err;
      }
      // Ask where to resume.
      await new Promise(r => setTimeout(r, Math.min(60000, 2000 * 2 ** attempt)));
      const q = await this.fetch(session, { method: 'PUT', headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Length': '0', 'Content-Range': `bytes */${size}` } });
      if (q.ok) { const j = await q.json(); return { id: j.id, url: `https://youtu.be/${j.id}`, status: j.status }; }
      const range = q.headers.get('range');
      offset = range ? Number(range.split('-')[1]) + 1 : 0;
    }
    throw new Error('YouTube upload kept failing');
  }

  async thumbnail(videoId, jpg) {
    const body = fs.readFileSync(jpg);
    const r = await this.fetch(`${UPLOAD}/thumbnails/set?videoId=${videoId}`, { method: 'POST', headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'image/jpeg', 'Content-Length': String(body.length) }, body });
    if (!r.ok) throw new Error(`thumbnail: ${r.status} ${await errText(r)}`);
  }
}

async function errText(r) { return (await apiError(r)).message; }

async function apiError(r) {
  try { const j = await r.json(); return { message: j.error?.message || JSON.stringify(j).slice(0, 300), reason: j.error?.errors?.[0]?.reason || null }; } catch { return { message: '', reason: null }; }
}

/** YouTube refusals that clear up with time (the channel's daily upload limit, the API quota). */
export function isUploadLimit(err) {
  return ['uploadLimitExceeded', 'quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded', 'userRateLimitExceeded'].includes(err?.reason)
    || /exceeded the number of videos|quota/i.test(String(err?.message || ''));
}
