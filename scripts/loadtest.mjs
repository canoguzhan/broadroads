/* Load test: many players at once against a BroadRoads server, from any
   machine (run it from outside the server to include the real network path).

     node scripts/loadtest.mjs --url https://broadroads.com --clients 30 --duration 120
     node scripts/loadtest.mjs --local --clients 60          # a throwaway server on this machine
     node scripts/loadtest.mjs --url ... --browsers 3        # also real headless Chrome players

   Each synthetic client logs in, queues for a practice match (its own match
   against 9 bots, the heaviest thing a player can ask of the server) and
   keeps moving its champion around. It measures time to get into a match,
   snapshot rate and gaps (lag spikes), and ping. --mode idle only connects
   (tests connection count, not simulation). Browsers report frames per second.

   Accounts: created through the normal sign-up (cached in
   .loadtest-accounts.json and reused). Sign-up is limited to 20 per 10
   minutes per IP, so a big first run either waits for later runs or uses
   --secret <TOKEN_SECRET or data/.token-secret> to sign session tokens
   directly (operator only; creates "Load…" profiles). */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import WebSocket from 'ws';
import { decodeSnapshot } from '../shared/protocol.js';
import { CHAMPIONS } from '../shared/moba/champions.js';

const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i < 0 ? def : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const CLIENTS = Number(opt('clients', 20));
const DURATION = Number(opt('duration', 90)) * 1000;
const BROWSERS = Number(opt('browsers', 0));
const MODE = opt('mode', 'practice');
const RAMP = Number(opt('ramp', 150)); // ms between client starts
const CACHE = path.resolve(opt('accounts', '.loadtest-accounts.json'));

let base = String(opt('url', 'http://127.0.0.1:8080')).replace(/\/$/, '');
let local = null;
if (opt('local', false)) {
  const { startServer } = await import('../server/index.js');
  local = await startServer({ port: 0, host: '127.0.0.1', dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'br-load-')), quiet: true, databaseUrl: '', maxPlayers: 10000, maxMatches: 10000 });
  base = `http://127.0.0.1:${local.port}`;
}
const wsUrl = base.replace(/^http/, 'ws') + '/ws';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/* ---------- accounts ---------- */
async function accounts(n) {
  const secret = opt('secret', null);
  if (secret) {
    const { signToken } = await import('../server/auth.js');
    const run = Date.now().toString(36).slice(-4);
    return Array.from({ length: n }, (_, i) => ({ username: `Load${run}${i}`, token: signToken(secret, { a: `loadtest-${run}-${i}`, n: `Load${run}${i}` }) }));
  }
  let cached = [];
  try { cached = JSON.parse(fs.readFileSync(CACHE, 'utf8'))[base] || []; } catch { /* first run */ }
  const out = [];
  for (const a of cached) {
    if (out.length >= n) break;
    const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: a.username, password: a.password }) });
    if (r.ok) out.push({ ...a, token: (await r.json()).token });
  }
  while (out.length < n) {
    const username = `lt${Math.random().toString(36).slice(2, 10)}`, password = Math.random().toString(36).slice(2) + 'Aa1';
    const r = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    if (r.status === 429) { console.warn(`Sign-up limit reached: running with ${out.length} accounts (rerun later for more, or pass --secret).`); break; }
    if (!r.ok) throw new Error(`register failed: ${r.status} ${await r.text()}`);
    out.push({ username, password, token: (await r.json()).token });
  }
  let all = {};
  try { all = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { /* new file */ }
  const known = new Map((all[base] || []).map(a => [a.username, a]));
  for (const a of out) if (a.password) known.set(a.username, { username: a.username, password: a.password });
  all[base] = [...known.values()];
  fs.writeFileSync(CACHE, JSON.stringify(all, null, 1));
  return out;
}

/* ---------- synthetic client ---------- */
function runClient(acc, stats) {
  return new Promise(resolve => {
    const st = { name: acc.username, connected: false, inMatch: false, queueAt: 0, matchMs: null, snaps: 0, gaps: [], pings: [], errors: [], closed: null };
    stats.push(st);
    const ws = new WebSocket(wsUrl);
    let lastSnap = 0, me = null, timer = null, pingTimer = null;
    const send = m => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
    const end = () => { if (st.matchAt && !st.playedMs) st.playedMs = performance.now() - st.matchAt; clearInterval(timer); clearInterval(pingTimer); try { ws.close(); } catch { /* closed */ } resolve(st); };
    ws.on('open', () => { st.connected = true; send({ t: 'auth', token: acc.token }); });
    ws.on('error', e => { st.errors.push(e.message); });
    ws.on('close', code => { st.closed = code; end(); });
    ws.on('message', (data, binary) => {
      const now = performance.now();
      if (binary) {
        const s = decodeSnapshot(data);
        if (s.me) me = { ...me, ...s.me };
        // Full snapshots come at 10 Hz; effect-only messages (hits, casts) in between don't count.
        if (s.fx && !s.a && !s.u && !s.r && !s.me) return;
        st.snaps++;
        if (lastSnap) st.gaps.push(now - lastSnap);
        lastSnap = now;
        return;
      }
      const m = JSON.parse(data);
      if (m.t === 'authFail') { st.errors.push(m.error); end(); }
      else if (m.t === 'profile' && !st.queueAt) {
        if (MODE === 'idle') return;
        st.queueAt = now;
        send({ t: 'queue', mode: 'practice', difficulty: 'normal' });
      } else if (m.t === 'select') {
        const sel = m.select, mine = sel.players?.find(p => p.you);
        const taken = new Set([...sel.bans, ...sel.players.filter(p => p.team === mine?.team).map(p => p.champ)]);
        const free = Object.keys(CHAMPIONS).filter(c => !taken.has(c));
        if (mine && !mine.champ) send({ t: 'pick', champ: free[Math.floor(Math.random() * free.length)] });
        else if (mine && !mine.locked) send({ t: 'lock' });
      } else if (m.t === 'match' && !st.inMatch) {
        st.inMatch = true;
        st.matchMs = now - st.queueAt;
        st.matchAt = now;
        // Wander: a move order every 600 ms, like a player clicking around.
        timer = setInterval(() => {
          const x = 20 + Math.random() * 120, y = 20 + Math.random() * 120;
          send({ t: 'mv', x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, a: Math.random() < 0.3 ? 1 : 0 });
        }, 600);
      } else if (m.t === 'pong') st.pings.push(Date.now() - m.c);
      else if (m.t === 'notice' && m.kind === 'error') st.errors.push(m.text);
    });
    pingTimer = setInterval(() => send({ t: 'ping', c: Date.now() }), 2000);
    setTimeout(end, DURATION);
  });
}

/* ---------- real browsers ---------- */
async function runBrowsers(accs) {
  let chromium;
  try { ({ chromium } = await import('playwright')); } catch { console.warn('Playwright is not installed: skipping browsers (npm i -D playwright && npx playwright install chromium).'); return []; }
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const results = await Promise.all(accs.map(async acc => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(([tok, user]) => {
      localStorage.setItem('broadroads_token', JSON.stringify({ token: tok, username: user }));
      localStorage.setItem('broadroads_seen_landing', '1');
      localStorage.setItem('broadroads_settings', JSON.stringify({ volume: 0 }));
    }, [acc.token, acc.username]);
    const page = await ctx.newPage();
    const r = { name: acc.username, fps: null, ok: false, error: null };
    try {
      await page.goto(base);
      await page.waitForSelector('#screen-lobby:not([hidden]) .lob-play', { timeout: 30000 });
      await page.click('.play-card:nth-of-type(2) .btn');
      await page.waitForSelector('#screen-select:not([hidden]) .sel-grid', { timeout: 30000 });
      await page.locator('.sel-grid .champ-card').first().click();
      await page.click('.sel-center .btn-primary');
      await page.waitForFunction(() => window.__broadroads?.world?.me, null, { timeout: 90000 });
      r.fps = await page.evaluate(ms => new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(Math.round((n * 1000) / (performance.now() - t0))); }; requestAnimationFrame(f); }), Math.min(30000, DURATION / 2));
      r.ok = true;
    } catch (err) { r.error = err.message.split('\n')[0]; }
    await ctx.close();
    return r;
  }));
  await browser.close();
  return results;
}

/* ---------- run ---------- */
console.log(`Load test → ${base}  clients=${CLIENTS} browsers=${BROWSERS} mode=${MODE} duration=${DURATION / 1000}s`);
const accs = await accounts(CLIENTS + BROWSERS);
const clientAccs = accs.slice(0, Math.max(0, accs.length - BROWSERS)), browserAccs = accs.slice(clientAccs.length);
const health = [];
const healthTimer = setInterval(async () => {
  try { const h = await (await fetch(`${base}/api/health`)).json(); health.push(h); } catch { health.push(null); }
}, 5000);
const stats = [];
const runs = [];
for (const acc of clientAccs) { runs.push(runClient(acc, stats)); await sleep(RAMP); }
const browserRun = BROWSERS ? runBrowsers(browserAccs) : Promise.resolve([]);
const [, browsers] = await Promise.all([Promise.all(runs), browserRun]);
clearInterval(healthTimer);

const gaps = stats.flatMap(s => s.gaps), pings = stats.flatMap(s => s.pings);
const inMatch = stats.filter(s => s.inMatch);
const ok = health.filter(Boolean);
console.log('\n=== Results ===');
console.log(`clients: ${stats.filter(s => s.connected).length}/${stats.length} connected, ${inMatch.length} reached a match${MODE === 'idle' ? ' (idle mode)' : ''}`);
if (inMatch.length) console.log(`time to match: median ${Math.round(pct(inMatch.map(s => s.matchMs), 0.5))} ms, p95 ${Math.round(pct(inMatch.map(s => s.matchMs), 0.95))} ms`);
if (gaps.length) {
  console.log(`snapshots: ${avg(inMatch.map(s => s.snaps / (s.playedMs / 1000))).toFixed(1)}/s per client (the server sends 10/s; fewer means dropped frames)`);
  console.log(`snapshot gaps: median ${pct(gaps, 0.5).toFixed(0)} ms, p95 ${pct(gaps, 0.95).toFixed(0)} ms, p99 ${pct(gaps, 0.99).toFixed(0)} ms, worst ${Math.max(...gaps).toFixed(0)} ms`);
}
if (pings.length) console.log(`ping: median ${pct(pings, 0.5)} ms, p95 ${pct(pings, 0.95)} ms`);
if (ok.length) console.log(`server: up to ${Math.max(...ok.map(h => h.online))} online, ${Math.max(...ok.map(h => h.matches))} matches, tick avg ${avg(ok.map(h => h.tickMs)).toFixed(2)} ms (max ${Math.max(...ok.map(h => h.tickMs)).toFixed(2)} ms of a 50 ms budget)${ok.some(h => h.busy) ? ', reported BUSY (match limit reached)' : ''}`);
if (health.some(h => !h)) console.log(`health endpoint failed ${health.filter(h => !h).length} time(s)`);
const errs = {}; for (const s of stats) for (const e of s.errors) errs[e] = (errs[e] || 0) + 1;
if (Object.keys(errs).length) console.log('errors:', errs);
for (const b of browsers) console.log(`browser ${b.name}: ${b.ok ? `${b.fps} fps in a match` : `failed: ${b.error}`}`);
const healthy = stats.length > 0 && stats.every(s => s.connected) && (MODE === 'idle' || inMatch.length === stats.length) && (!gaps.length || pct(gaps, 0.95) < 150);
console.log(healthy ? '\nPASS: every client played smoothly (p95 snapshot gap under 150 ms).' : '\nCHECK: see the numbers above.');
if (local) await local.stop();
process.exit(healthy ? 0 : 1);
