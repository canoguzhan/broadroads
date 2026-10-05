/* Monitoring: client and server error reports (ring buffers plus a rotating
   log file), live metrics for the admin page, crash detection across
   restarts and optional webhook alerts (Discord/Slack-compatible JSON). */
import fs from 'node:fs';
import path from 'node:path';

const MAX_LOG = 5 * 1024 * 1024;

export class Monitor {
  constructor({ dataDir, log = console, webhook = '', hub = null }) {
    this.log = log;
    this.webhook = webhook;
    this.hub = hub;
    this.startedAt = Date.now();
    this.client = [];
    this.server = [];
    this.counts = { client: 0, server: 0 };
    this.recent = []; // timestamps of errors in the last hour (spike detection)
    this.limits = new Map();
    this.alertedAt = new Map();
    this.tickMax = 0;
    this.lag = 0;
    this.dir = path.join(dataDir, 'logs');
    fs.mkdirSync(this.dir, { recursive: true });
    this.file = path.join(this.dir, 'errors.ndjson');
    // Crash detection: a marker that a clean shutdown removes.
    this.marker = path.join(dataDir, '.running');
    this.crashedLastTime = fs.existsSync(this.marker);
    fs.writeFileSync(this.marker, String(this.startedAt));
    // Event loop lag sampler.
    let last = process.hrtime.bigint();
    this.lagTimer = setInterval(() => {
      const now = process.hrtime.bigint();
      const drift = Number(now - last) / 1e6 - 1000;
      this.lag = Math.max(0, this.lag * 0.8 + Math.max(0, drift) * 0.2);
      last = now;
    }, 1000);
    this.lagTimer.unref();
  }

  started() {
    if (this.crashedLastTime) this.alert('crash', '⚠️ BroadRoads restarted after a crash (or an unclean shutdown).');
  }

  shutdown() {
    clearInterval(this.lagTimer);
    try { fs.unlinkSync(this.marker); } catch { /* already gone */ }
  }

  write(entry) {
    try {
      if (fs.existsSync(this.file) && fs.statSync(this.file).size > MAX_LOG) fs.renameSync(this.file, path.join(this.dir, 'errors.1.ndjson'));
      fs.appendFileSync(this.file, JSON.stringify(entry) + '\n');
    } catch (err) { this.log.error('monitor write failed', err.message); }
  }

  spike() {
    const now = Date.now();
    this.recent.push(now);
    while (this.recent.length && now - this.recent[0] > 3600e3) this.recent.shift();
    const lastTen = this.recent.filter(t => now - t < 600e3).length;
    if (lastTen >= 25) this.alert('spike', `⚠️ BroadRoads: ${lastTen} errors in the last 10 minutes. Check /admin.`);
  }

  /** A browser error report (rate-limited per IP). Returns false when dropped. */
  clientError(ip, body) {
    const now = Date.now();
    const l = this.limits.get(ip) || { n: 0, t: now };
    if (now - l.t > 60e3) { l.n = 0; l.t = now; }
    if (++l.n > 20) return false;
    this.limits.set(ip, l);
    if (this.limits.size > 5000) this.limits.clear();
    const str = (v, n) => String(v ?? '').slice(0, n);
    const e = { at: now, kind: 'client', message: str(body.message, 500), stack: str(body.stack, 4000), url: str(body.url, 300), ua: str(body.ua, 300), context: str(body.context, 300), ip };
    const dup = this.client.find(x => x.message === e.message && x.stack === e.stack);
    if (dup) { dup.count = (dup.count || 1) + 1; dup.at = now; } else { this.client.unshift(e); this.client.length = Math.min(this.client.length, 200); }
    this.counts.client++;
    this.write(e);
    this.spike();
    return true;
  }

  serverError(where, err) {
    const e = { at: Date.now(), kind: 'server', where, message: String(err?.message || err).slice(0, 500), stack: String(err?.stack || '').slice(0, 4000) };
    this.server.unshift(e);
    this.server.length = Math.min(this.server.length, 100);
    this.counts.server++;
    this.write(e);
    this.spike();
  }

  noteTick(ms) { this.tickMax = Math.max(this.tickMax * 0.999, ms); }

  metrics() {
    const mem = process.memoryUsage();
    const hub = this.hub;
    return {
      uptime: Math.round((Date.now() - this.startedAt) / 1000),
      online: hub ? hub.sessions.size : 0,
      matches: hub ? hub.matches.size : 0,
      spectators: hub ? [...hub.matches.values()].reduce((n, m) => n + (m.spectators?.size || 0), 0) : 0,
      queue: hub ? hub.queue.length : 0,
      tickMs: hub ? Math.round(hub.stats.tickMs * 100) / 100 : 0,
      tickMaxMs: Math.round(this.tickMax * 10) / 10,
      lagMs: Math.round(this.lag * 10) / 10,
      rssMB: Math.round(mem.rss / 1048576),
      heapMB: Math.round(mem.heapUsed / 1048576),
      errorsLastHour: this.recent.length,
      counts: this.counts,
      crashedLastTime: this.crashedLastTime,
      node: process.version,
    };
  }

  async alert(kind, text) {
    if (!this.webhook) return;
    const last = this.alertedAt.get(kind) || 0;
    if (Date.now() - last < 600e3) return; // at most one alert per kind every 10 minutes
    this.alertedAt.set(kind, Date.now());
    try {
      await fetch(this.webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: text, text }) });
    } catch (err) { this.log.error('alert failed', err.message); }
  }
}
