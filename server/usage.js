/* API and WebSocket usage counters for the dev console: per-route request
   counts, status classes, latency percentiles (fixed histogram buckets) and
   bytes, a per-minute timeline for the last hour, and WebSocket traffic.
   In memory only; resets when the server restarts. */

const BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 10000, Infinity];
const MAX_ROUTES = 150;
const STATIC_DIRS = new Set(['assets', 'models', 'sfx', 'trailer', 'icons', 'portraits', 'fonts', 'img']);

/** Collapses a request path into a bounded route key ("/replays/:id", "/models/*", …). */
export function routeKey(p, known = new Set()) {
  if (p.startsWith('/api/')) {
    if (known.has(p)) return p;
    const oauth = /^\/api\/auth\/oauth\/(google|discord)\/(start|callback)$/.exec(p);
    if (oauth) return `/api/auth/oauth/${oauth[1]}/${oauth[2]}`;
    return '/api/* (unknown)';
  }
  if (/^\/replays\/[a-z0-9]+\.ndjson$/.test(p)) return '/replays/:id.ndjson';
  if (p === '/' || p === '/index.html') return '/ (game client)';
  if (p === '/admin' || p === '/ws') return p;
  const seg = p.split('/')[1];
  if (STATIC_DIRS.has(seg)) return `/${seg}/*`;
  return 'static (other)';
}

export class Usage {
  constructor() {
    this.startedAt = Date.now();
    this.routes = new Map();
    this.minutes = [];
    this.status = {};
    this.ws = { opened: 0, authed: 0, authFailed: 0, msgIn: 0, bytesIn: 0, msgOut: 0, bytesOut: 0, flooded: 0, skipped: 0, refused: 0, closeCodes: {} };
  }

  bucket() {
    const m = Math.floor(Date.now() / 60e3);
    let b = this.minutes[this.minutes.length - 1];
    if (!b || b.m !== m) {
      b = { m, req: 0, err: 0, ms: 0, bytes: 0, wsIn: 0, wsOut: 0 };
      this.minutes.push(b);
      while (this.minutes.length > 60) this.minutes.shift();
    }
    return b;
  }

  http(method, route, status, ms, bytes) {
    const key = `${method} ${route}`;
    let r = this.routes.get(key);
    if (!r) {
      if (this.routes.size >= MAX_ROUTES && route !== 'static (other)') return this.http(method, 'static (other)', status, ms, bytes);
      r = { method, route, n: 0, s2: 0, s3: 0, s4: 0, s5: 0, ms: 0, max: 0, bytes: 0, hist: BUCKETS.map(() => 0), last: 0, lastStatus: 0 };
      this.routes.set(key, r);
    }
    const cls = Math.min(5, Math.max(2, Math.floor(status / 100)));
    r.n++; r[`s${cls}`]++; r.ms += ms; r.max = Math.max(r.max, ms); r.bytes += bytes; r.last = Date.now(); r.lastStatus = status;
    r.hist[BUCKETS.findIndex(b => ms <= b)]++;
    this.status[status] = (this.status[status] || 0) + 1;
    const b = this.bucket();
    b.req++; b.ms += ms; b.bytes += bytes;
    if (status >= 500) b.err++;
  }

  wsMessageIn(bytes) { this.ws.msgIn++; this.ws.bytesIn += bytes; this.bucket().wsIn++; }
  wsMessageOut(bytes) { this.ws.msgOut++; this.ws.bytesOut += bytes; this.bucket().wsOut++; }
  wsClosed(code) { this.ws.closeCodes[code] = (this.ws.closeCodes[code] || 0) + 1; }

  snapshot() {
    const pct = (hist, n, q) => {
      if (!n) return 0;
      let acc = 0;
      for (let i = 0; i < hist.length; i++) { acc += hist[i]; if (acc >= n * q) return BUCKETS[i] === Infinity ? BUCKETS[i - 1] : BUCKETS[i]; }
      return 0;
    };
    const routes = [...this.routes.values()].map(({ hist, ...r }) => ({
      ...r, avg: r.n ? Math.round((r.ms / r.n) * 10) / 10 : 0, max: Math.round(r.max * 10) / 10, ms: undefined,
      p50: pct(hist, r.n, 0.5), p95: pct(hist, r.n, 0.95), p99: pct(hist, r.n, 0.99),
    })).sort((a, b) => b.n - a.n);
    // A full 60-minute timeline, with empty minutes filled in.
    const now = Math.floor(Date.now() / 60e3);
    const byMin = new Map(this.minutes.map(b => [b.m, b]));
    const timeline = [];
    for (let m = now - 59; m <= now; m++) {
      const b = byMin.get(m);
      timeline.push({ t: m * 60e3, req: b?.req || 0, err: b?.err || 0, avgMs: b?.req ? Math.round((b.ms / b.req) * 10) / 10 : 0, bytes: b?.bytes || 0, wsIn: b?.wsIn || 0, wsOut: b?.wsOut || 0 });
    }
    const total = routes.reduce((n, r) => n + r.n, 0);
    return { since: this.startedAt, total, status: this.status, routes, timeline, ws: this.ws, buckets: BUCKETS.slice(0, -1) };
  }
}
