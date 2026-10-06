/* BroadRoads dev console: renders /api/overview (polls every 10 s). */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => (n == null ? '—' : Number(n).toLocaleString());
const bytes = b => { if (b == null) return '—'; const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; } return `${b.toFixed(b < 10 && i ? 1 : 0)} ${u[i]}`; };
const dur = s => (s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${(s / 3600).toFixed(1)}h` : `${(s / 86400).toFixed(1)}d`);
const ago = t => (t ? `${dur(Math.max(0, Math.round((Date.now() - t) / 1000)))} ago` : '—');
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const yes = (on, a = 'on', b = 'off') => `<span class="${on ? 'ok' : 'off'}">${on ? '● ' + a : '○ ' + b}</span>`;
const state = s => `<span class="${s === 'active' ? 'ok' : s === 'failed' ? 'off' : 'warn-s'}">${s === 'active' ? '●' : '○'} ${esc(s)}</span>`;
const tile = (v, label, warn) => `<div class="tile${warn ? ' warn' : ''}"><b>${esc(v)}</b><span>${esc(label)}</span></div>`;
const meter = (v, max) => `<progress value="${Math.max(0, v)}" max="${Math.max(1, max)}"></progress>`;

/** cols: [header, cell(row) -> html, numeric?] */
function table(rows, cols, empty = 'Nothing yet') {
  if (!rows || !rows.length) return `<p class="muted">${esc(empty)}</p>`;
  return `<div class="scroll"><table><thead><tr>${cols.map(c => `<th${c[2] ? ' class="n"' : ''}>${c[0]}</th>`).join('')}</tr></thead><tbody>${
    rows.map(r => `<tr>${cols.map(c => `<td${c[2] ? ' class="n"' : ''}>${c[1](r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
const kv = obj => table(Object.entries(obj || {}), [['Setting', r => `<code>${esc(r[0])}</code>`], ['Value', r => esc(typeof r[1] === 'object' ? JSON.stringify(r[1]) : r[1])]]);

/* ---------- single-series bar chart with hover tooltips ---------- */
const tip = $('#tip');
function bars(el, data, { value, label, fmt = num }) {
  const W = 600, H = 140, top = 8, bottom = 18, left = 34;
  const max = Math.max(1, ...data.map(value));
  const nice = (() => { const p = 10 ** Math.floor(Math.log10(max)); return Math.ceil(max / p) * p; })();
  const bw = (W - left) / data.length, gap = Math.min(2, bw * 0.2);
  const y = v => top + (H - top - bottom) * (1 - v / nice);
  let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(el.previousElementSibling?.textContent || '')}">`;
  for (const g of [0, 0.5, 1]) svg += `<line class="gridline" x1="${left}" x2="${W}" y1="${y(nice * g)}" y2="${y(nice * g)}"/><text x="${left - 4}" y="${y(nice * g) + 3}" text-anchor="end">${esc(fmt(nice * g))}</text>`;
  data.forEach((d, i) => {
    const v = value(d), x = left + i * bw, h = Math.max(0, H - bottom - y(v));
    svg += `<rect class="hit" data-i="${i}" x="${x}" y="${top}" width="${bw}" height="${H - top - bottom}"/>`;
    if (v > 0) svg += `<rect class="bar" x="${x + gap / 2}" y="${H - bottom - h}" width="${Math.max(1, bw - gap)}" height="${h}" rx="${Math.min(2, (bw - gap) / 2)}"/>`;
  });
  const first = label(data[0]), last = label(data[data.length - 1]);
  svg += `<text x="${left}" y="${H - 4}">${esc(first)}</text><text x="${W}" y="${H - 4}" text-anchor="end">${esc(last)}</text></svg>`;
  el.innerHTML = svg;
  el.querySelectorAll('.hit').forEach(r => {
    r.addEventListener('mousemove', e => {
      const d = data[Number(r.dataset.i)];
      tip.innerHTML = `${esc(label(d))}<br><b>${esc(fmt(value(d)))}</b>`;
      tip.hidden = false;
      tip.style.left = `${Math.min(window.innerWidth - 140, e.clientX + 12)}px`;
      tip.style.top = `${e.clientY + 12}px`;
    });
    r.addEventListener('mouseleave', () => { tip.hidden = true; });
  });
}

/* ---------- sections ---------- */
function render(d) {
  const m = d.monitor, p = d.process, g = d.game, api = d.api.usage;
  const lastMin = api.timeline.slice(-5).reduce((n, b) => n + b.req, 0) / 5;
  const dbPing = d.database?.pingMs;

  $('#tiles').innerHTML = [
    tile(num(g.online), 'players online'), tile(num(g.matches.length), `live matches (max ${g.capacity.maxMatches})`), tile(num(g.queue), 'in queue'),
    tile(`${p.cpuPercent}%`, `CPU (${p.cpus} core${p.cpus > 1 ? 's' : ''}, load ${p.load[0]})`, p.cpuPercent > 80),
    tile(bytes(p.memory.rss), `memory (system free ${bytes(p.memory.systemFree)})`, p.memory.rss > 900 * 1048576),
    tile(`${g.tickMs} ms`, `tick avg (max ${m.tickMaxMs})`, g.tickMs > 20), tile(`${m.lagMs} ms`, 'event-loop lag', m.lagMs > 50),
    tile(lastMin.toFixed(1), 'requests / min (5-min avg)'), tile(dbPing != null ? `${dbPing} ms` : d.database?.kind || '—', 'database ping', dbPing > 200),
    tile(num(m.errorsLastHour), 'errors last hour', m.errorsLastHour > 10), tile(dur(p.uptime), `uptime${m.crashedLastTime ? ' (after a crash)' : ''}`, m.crashedLastTime),
    tile(p.commit?.sha ? p.commit.sha.slice(0, 7) : '—', 'running commit'),
  ].join('');

  // Services: the game process, then systemd units, then derived services.
  const services = [
    { name: 'Game server (node)', st: 'active', detail: `pid ${p.pid}, ${esc(p.node)}, ${esc(p.platform)}, up ${dur(p.uptime)}, heap ${bytes(p.memory.heapUsed)} / ${bytes(p.memory.heapTotal)}` },
    { name: 'Game hub / tick loop', st: g.tickMs < 30 ? 'active' : 'degraded', detail: `${num(g.ticks)} ticks, ${g.tickMs} ms avg, ${g.capacity.full ? 'FULL' : 'accepting players'}, ${g.capacity.canStartMatch ? 'can start matches' : 'busy — no new matches'}` },
    { name: `Database (${esc(d.database?.kind || '?')})`, st: d.database?.error ? 'failed' : 'active', detail: d.database?.error ? esc(d.database.error) : d.database?.kind === 'postgres' ? `${esc(d.database.host)} · ${esc(d.database.version)} · ping ${dbPing} ms · pool ${d.database.pool.total}/${d.database.pool.max} (${d.database.pool.idle} idle, ${d.database.pool.waiting} waiting)` : `file store in ${esc(d.database?.path)}` },
    ...(d.systemd || []).map(u => ({
      name: `<code>${esc(u.Id)}</code>`, st: u.ActiveState,
      detail: `${esc(u.Description)} · ${esc(u.SubState)}${u.Result && u.Result !== 'success' ? ` · last result <span class="off">${esc(u.Result)}</span>` : ''}${u.NRestarts && u.NRestarts !== '0' && u.NRestarts !== '[not set]' ? ` · ${esc(u.NRestarts)} restarts` : ''}${u.ActiveEnterTimestamp && u.Id.endsWith('.service') && u.ActiveState === 'active' ? ` · since ${esc(u.ActiveEnterTimestamp)}` : ''}${u.LastTriggerUSec && u.LastTriggerUSec !== 'n/a' ? ` · last run ${esc(u.LastTriggerUSec)}` : ''}${u.NextElapseUSecRealtime ? ` · next ${esc(u.NextElapseUSecRealtime)}` : ''}${u.MemoryCurrent && /^\d+$/.test(u.MemoryCurrent) ? ` · ${bytes(Number(u.MemoryCurrent))}` : ''}`,
    })),
  ];
  $('#services-table').innerHTML = table(services, [['Service', r => r.name], ['State', r => state(r.st)], ['Details', r => r.detail]]);
  if (!d.systemd?.length) $('#services-table').insertAdjacentHTML('beforeend', '<p class="muted">systemd units are only probed in production (NODE_ENV=production).</p>');
  $('#integrations').innerHTML = table(d.integrations, [['Integration', r => esc(r.name)], ['Status', r => yes(r.on, 'configured', 'not configured')], ['Details', r => esc(r.detail)]]);
  $('#certs').innerHTML = table(d.certs, [['Host', r => esc(r.host)], ['Valid', r => yes(r.ok, 'valid', r.error || 'invalid')], ['Expires', r => (r.validTo ? `${new Date(r.validTo).toISOString().slice(0, 10)} <span class="${r.validTo - Date.now() < 14 * 86400e3 ? 'off' : 'muted'}">(${Math.round((r.validTo - Date.now()) / 86400e3)} days)</span>` : '—')], ['Issuer', r => esc(r.issuer || '')]], 'Certificates are only probed in production.');

  // API
  $('#api-note').textContent = `${num(api.total)} requests since ${new Date(api.since).toLocaleString()} (counters reset when the server restarts).`;
  bars($('#chart-req'), api.timeline, { value: b => b.req, label: b => new Date(b.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
  const byRoute = new Map(api.routes.map(r => [`${r.method} ${r.route}`, r]));
  const maxN = Math.max(1, ...api.routes.map(r => r.n));
  const catalog = d.api.catalog.map(c => ({ ...c, u: byRoute.get(`${c.method === 'WS' ? 'GET' : c.method} ${c.path}`) }));
  $('#api-table').innerHTML = table(catalog, [
    ['Endpoint', r => `<span class="m">${esc(r.method)}</span> <code>${esc(r.path)}</code><br><span class="muted">${esc(r.desc)}</span>`],
    ['Auth', r => esc(r.auth)], ['Rate limit', r => esc(r.limit)],
    ['Requests', r => (r.method === 'WS' ? `${num(d.api.usage.ws.opened)} conn` : `${num(r.u?.n || 0)}${meter(r.u?.n || 0, maxN)}`), true],
    ['2xx / 4xx / 5xx', r => (r.u ? `${num(r.u.s2)} / ${num(r.u.s4)} / <span class="${r.u.s5 ? 'off' : ''}">${num(r.u.s5)}</span>` : '—'), true],
    ['Avg', r => (r.u ? `${r.u.avg} ms` : '—'), true], ['p95', r => (r.u ? `≤${r.u.p95} ms` : '—'), true], ['Max', r => (r.u ? `${r.u.max} ms` : '—'), true],
    ['Sent', r => (r.method === 'WS' ? bytes(d.api.usage.ws.bytesOut) : r.u ? bytes(r.u.bytes) : '—'), true], ['Last', r => (r.u ? `${ago(r.u.last)} (${r.u.lastStatus})` : '—')],
  ]);
  const known = new Set(catalog.map(c => `${c.method} ${c.path}`));
  $('#api-other').innerHTML = table(api.routes.filter(r => !known.has(`${r.method} ${r.route}`)), [
    ['Route', r => `<span class="m">${esc(r.method)}</span> <code>${esc(r.route)}</code>`], ['Requests', r => num(r.n), true],
    ['2xx / 3xx / 4xx / 5xx', r => `${num(r.s2)} / ${num(r.s3)} / ${num(r.s4)} / ${num(r.s5)}`, true], ['Avg', r => `${r.avg} ms`, true], ['p95', r => `≤${r.p95} ms`, true], ['Sent', r => bytes(r.bytes), true], ['Last', r => ago(r.last)],
  ]);
  $('#api-status').innerHTML = table(Object.entries(api.status).sort((a, b) => b[1] - a[1]), [['Status', r => `<code>${esc(r[0])}</code>`], ['Count', r => num(r[1]), true], ['Share', r => pct(r[1], api.total), true]]);

  // WebSocket
  const ws = api.ws;
  $('#ws-tiles').innerHTML = [
    tile(num(g.wsClients), 'open connections'), tile(num(ws.opened), 'connections since start'), tile(num(ws.authed), 'authenticated'), tile(num(ws.authFailed), 'auth failures', ws.authFailed > 50),
    tile(num(ws.refused), 'upgrades refused'), tile(num(ws.msgIn), `messages in (${bytes(ws.bytesIn)})`), tile(num(ws.msgOut), `messages out (${bytes(ws.bytesOut)})`),
    tile(num(ws.skipped), 'frames skipped (slow links)'), tile(num(ws.flooded), 'flood messages dropped', ws.flooded > 0),
    tile(g.online ? bytes((ws.bytesOut / Math.max(1, p.uptime)) / g.online) + '/s' : '—', 'avg out per player (since start)'),
  ].join('');
  bars($('#chart-ws'), api.timeline, { value: b => b.wsOut, label: b => new Date(b.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
  $('#ws-close').innerHTML = table(Object.entries(ws.closeCodes), [['Code', r => `<code>${esc(r[0])}</code>`], ['Meaning', r => esc({ 1000: 'normal', 1001: 'going away', 1005: 'no status', 1006: 'abnormal (dropped)', 4000: 'replaced by a newer login', 4001: 'auth timeout', 4003: 'bad token', 4005: 'server full' }[r[0]] || '')], ['Count', r => num(r[1]), true]]);

  // Game
  $('#game-tiles').innerHTML = [
    tile(num(g.online), `online / ${num(g.capacity.maxPlayers)} max`, g.capacity.full), ...Object.entries(g.states).map(([k, v]) => tile(num(v), `in ${k}`)),
    tile(num(g.parties), 'parties'), tile(num(g.rooms), 'custom rooms'), tile(num(g.selects), 'champion selects'), tile(num(g.queue), 'queued'),
  ].join('');
  $('#matches').innerHTML = table(g.matches, [['ID', r => `<code>${esc(r.id)}</code>`], ['Mode', r => `${esc(r.mode)}${r.ranked ? ' (ranked)' : ''}`], ['Time', r => dur(r.time), true],
    ['Humans', r => num(r.humans), true], ['Bots', r => num(r.bots), true], ['Spectators', r => num(r.spectators), true], ['Kills', r => (r.kills ? `${r.kills.blue} – ${r.kills.red}` : '—'), true], ['State', r => (r.ended ? 'ending' : 'live')]], 'No matches in progress');
  $('#hub-config').innerHTML = kv(d.settings.hub);

  // Database
  const db = d.database || {};
  $('#db-tiles').innerHTML = db.error ? tile('error', db.error, true) : [
    tile(db.kind, db.kind === 'postgres' ? `${db.host} / ${db.database}` : db.path), tile(num(db.counts?.accounts), 'accounts'), tile(num(db.counts?.characters), 'player profiles'),
    tile(bytes(db.sizeBytes), 'database size'), ...(db.pool ? [tile(`${db.pingMs} ms`, 'ping (SELECT 1)', db.pingMs > 200), tile(`${db.pool.total} / ${db.pool.max}`, `pool (${db.pool.idle} idle, ${db.pool.waiting} waiting)`, db.pool.waiting > 0)] : []),
  ].join('');
  $('#db-tables').innerHTML = db.tables ? table(db.tables, [['Table', r => `<code>${esc(r.table)}</code>`], ['Rows', r => num(r.rows), true], ['Size', r => bytes(r.bytes), true],
    ['Seq scans', r => num(r.seq), true], ['Index scans', r => num(r.idx), true], ['Inserts', r => num(r.ins), true], ['Updates', r => num(r.upd), true], ['Deletes', r => num(r.del), true]]) : '';

  // Storage & ops
  const s = d.storage || {};
  $('#ops-tiles').innerHTML = [
    s.disk ? tile(bytes(s.disk.free), `disk free of ${bytes(s.disk.total)}`, s.disk.free / s.disk.total < 0.1) : '',
    s.replays ? tile(num(s.replays.files), `replay files (${bytes(s.replays.bytes)})`) : '', s.analytics ? tile(num(s.analytics.files), `analytics days (${bytes(s.analytics.bytes)})`) : '',
    s.logs ? tile(bytes(s.logs.bytes), 'log files') : '', s.static ? tile(bytes(s.static.bytes), `client build (${num(s.static.files)} files)`) : '',
    s.backups ? tile(s.backups.latest || '—', `latest backup (${num(s.backups.count)} kept, ${bytes(s.backups.bytes)})`, !s.backups.latest || Date.now() - Date.parse(s.backups.latest) > 2 * 86400e3) : '',
  ].join('');
  $('#backup').innerHTML = s.backups ? `${table(s.backups.latestFiles, [['File', r => `<code>${esc(r.name)}</code>`], ['Size', r => bytes(r.bytes), true]])}${s.backups.summary ? `<pre>${esc(JSON.stringify(s.backups.summary, null, 1))}</pre>` : ''}` : '<p class="muted">No backup folder found.</p>';
  $('#deploys').innerHTML = s.deploys ? table(s.deploys.history, [['When', r => esc(r.at)], ['Commit', r => `<code>${esc((r.sha || '').slice(0, 7))}</code>${r.sha === p.commit?.sha ? ' <span class="ok">running</span>' : ''}`]]) + (s.deploys.bad.length ? `<p class="off">Rolled back (never retried): ${s.deploys.bad.map(b => esc(b.slice(0, 7))).join(', ')}</p>` : '') : '<p class="muted">No autodeploy history found.</p>';

  // Analytics
  const days = [...d.analytics].reverse();
  const dayLabel = r => r.date;
  bars($('#chart-players'), days, { value: r => r.players, label: dayLabel });
  bars($('#chart-matches'), days, { value: r => Object.entries(r.matches).filter(([k]) => k !== 'tutorial').reduce((n, [, v]) => n + v, 0), label: dayLabel });
  $('#funnel').innerHTML = table(d.analytics.filter(r => r.players || r.newPlayers || Object.keys(r.matches).length), [['Day', r => esc(r.date)], ['Players', r => num(r.players), true], ['New', r => num(r.newPlayers), true],
    ['Tutorial', r => `${num(r.tutorialDone)}/${num(r.tutorialStart)} <span class="muted">${pct(r.tutorialDone, r.tutorialStart)}</span>`, true],
    ['1st game', r => num(r.firstGame), true], ['2nd game', r => `${num(r.secondGame)} <span class="muted">${pct(r.secondGame, r.firstGame)}</span>`, true],
    ['Back next day', r => `${num(r.d1Return)} <span class="muted">${pct(r.d1Return, r.newPlayers)}</span>`, true], ['Matches by mode', r => esc(Object.entries(r.matches).map(([k, v]) => `${k} ${v}`).join(', ') || '—')]], 'No activity in the last 30 days');
  const sum = key => { const out = {}; for (const day of d.analytics) for (const [id, v] of Object.entries(day[key] || {})) { const o = out[id] || (out[id] = {}); for (const [k, n] of Object.entries(v)) o[k] = (o[k] || 0) + n; } return Object.entries(out).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.g - a.g); };
  const champs = sum('champs'), games = champs.reduce((n, c) => n + c.g, 0) / 10 || 1;
  $('#champs').innerHTML = table(champs, [['Champion', r => esc(r.id)], ['Games', r => num(r.g), true], ['Win rate', r => `${pct(r.w, r.g)}${meter(r.w, r.g)}`, true], ['Pick rate', r => pct(r.g, games), true],
    ['Human WR', r => (r.hg ? `${pct(r.hw, r.hg)} <span class="muted">(${r.hg})</span>` : '—'), true], ['KDA', r => `${(r.k / r.g).toFixed(1)} / ${(r.d / r.g).toFixed(1)} / ${(r.a / r.g).toFixed(1)}`, true],
    ['Dmg', r => num(Math.round(r.dmg / r.g)), true], ['Gold', r => num(Math.round(r.gold / r.g)), true]]);
  const wr = [['Name', r => esc(r.id)], ['Games', r => num(r.g), true], ['Win rate', r => `${pct(r.w, r.g)}${meter(r.w, r.g)}`, true]];
  $('#items').innerHTML = table(sum('items'), wr);
  $('#keystones').innerHTML = table(sum('keystones'), wr);

  // Settings
  $('#effective').innerHTML = kv(d.settings.effective);
  $('#env').innerHTML = table(d.settings.env, [['Variable', r => `<code>${esc(r.name)}</code>`], ['Value', r => (r.set ? esc(r.value) : '<span class="muted">not set</span>') + (r.note ? ` <span class="muted">(${esc(r.note)})</span>` : '')]]);

  // Errors, reports, access
  $('#err-server').innerHTML = table(d.errors.server, [['When', r => ago(r.at)], ['Where', r => esc(r.where)], ['Error', r => `${esc(r.message)}<pre>${esc(r.stack)}</pre>`]], 'None 🎉');
  $('#err-client').innerHTML = table(d.errors.client, [['When', r => `${ago(r.at)}${r.count > 1 ? `<br><span class="muted">×${r.count}</span>` : ''}`], ['Error', r => `${esc(r.message)}<pre>${esc(r.stack)}</pre>`], ['Context', r => `${esc(r.context)}<br><span class="muted">${esc(r.ua)}</span>`]], 'None 🎉');
  $('#reports').innerHTML = table(d.reports, [['When', r => ago(r.at)], ['Player', r => esc(r.target)], ['Reason', r => esc(r.reason)], ['By', r => esc(r.from)], ['Match', r => esc(r.match)], ['Note', r => esc(r.note)]], 'No reports');
  $('#access').innerHTML = table(d.access, [['When', r => `${new Date(r.at).toLocaleString()}`], ['Event', r => `<span class="${r.event === 'signed in' || r.event === 'signed out' ? 'ok' : 'off'}">${esc(r.event)}</span>`], ['IP', r => `<code>${esc(r.ip)}</code>`], ['Browser', r => `<span class="muted">${esc(r.ua)}</span>`]]);
}

let busy = false;
async function load() {
  if (busy) return;
  busy = true;
  try {
    const res = await fetch('/api/overview', { credentials: 'same-origin', cache: 'no-store' });
    if (res.status === 401) { location.reload(); return; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    render(await res.json());
    $('#status').textContent = '● live'; $('#status').className = 'pill ok';
    $('#updated').textContent = `updated ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    $('#status').textContent = '○ unreachable'; $('#status').className = 'pill off';
    $('#updated').textContent = String(err.message || err);
  } finally { busy = false; }
}
$('#refresh').addEventListener('click', load);
setInterval(() => { if ($('#auto').checked && !document.hidden) load(); }, 10000);
load();
