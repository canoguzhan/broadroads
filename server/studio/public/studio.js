/* Studio dashboard: polls /api/state, edits settings, starts/cancels/uploads episodes and
   shows an episode's videos, metadata (editable before upload) and log. */
const $ = s => document.querySelector(s);
const api = async (path, opts = {}) => {
  const r = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', 'X-Studio': '1', ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (r.status === 401) { location.href = '/login'; throw new Error('signed out'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
};
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'style') e.style.cssText = v; // CSSOM, allowed by the strict CSP (style attributes are not)
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k instanceof Node ? k : String(k));
  return e;
};
const ago = t => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(t).toLocaleString(); };
const mmss = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const STATUS = { queued: 'Queued', running: 'Working', ready: 'Ready for review', uploading: 'Uploading', published: 'Published', waiting: 'Waiting to upload', failed: 'Failed', cancelled: 'Cancelled' };

let state = null;
let openId = null;
const toast = (msg, bad) => { const b = $('#banner'); b.textContent = msg; b.className = `banner${bad ? ' bad' : ''}`; b.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { b.hidden = true; }, 6000); };
const act = fn => async (...a) => { try { await fn(...a); await refresh(); } catch (e) { toast(e.message, true); } };

/* ---------- settings ---------- */
const S_KEYS = ['captionsFor', 'maxUploadsPerDay', 'autopilot', 'everyHours', 'autoUpload', 'privacy', 'fights', 'voiceId', 'quality', 'fps', 'renderWorkers', 'busyMatches', 'keepEpisodes', 'useClaude', 'synthetic'];
function fillSettings(s) {
  for (const k of S_KEYS) {
    const i = $(`#s-${k}`);
    if (!i || document.activeElement === i) continue;
    if (i.type === 'checkbox') i.checked = !!s[k]; else i.value = String(s[k]);
  }
}
for (const k of S_KEYS) {
  const i = $(`#s-${k}`);
  i?.addEventListener('change', act(async () => {
    const v = i.type === 'checkbox' ? i.checked : i.type === 'number' ? Number(i.value) : i.value;
    if (k === 'autoUpload' && v && !state.youtube.connected) toast('Connect YouTube first, or uploads will wait.', true);
    await api('/api/settings', { method: 'POST', body: { [k]: v } });
  }));
}
function renderLanguages(list, chosen) {
  const box = $('#s-languages');
  if (box.dataset.ready !== '1') {
    box.dataset.ready = '1';
    box.replaceChildren(el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: true, disabled: true }), 'English (voice)'),
      ...list.map(l => el('label', { class: 'check' }, el('input', { type: 'checkbox', value: l.code, onchange: act(() => api('/api/settings', { method: 'POST', body: { languages: [...box.querySelectorAll('input[value]:checked')].map(i => i.value) } })) }), l.name)));
  }
  for (const i of box.querySelectorAll('input[value]')) i.checked = chosen.includes(i.value);
}

async function loadVoices() {
  const sel = $('#s-voiceId');
  try {
    const { voices } = await api('/api/voices');
    sel.replaceChildren(...voices.map(v => el('option', { value: v.id, text: v.name })));
  } catch { sel.replaceChildren(el('option', { value: state?.settings.voiceId || '', text: 'Default voice' })); }
  if (state) sel.value = state.settings.voiceId;
}

/* ---------- YouTube ---------- */
function renderYouTube(y) {
  const box = $('#yt-body');
  const pill = $('#yt-pill');
  pill.textContent = y.connected ? `YouTube: ${y.channel?.title || 'connected'}` : 'YouTube: not connected';
  pill.className = `pill ${y.connected ? 'ok' : 'warn'}`;
  if (!y.configured) {
    box.replaceChildren(
      el('p', { class: 'muted', text: 'Uploading needs a Google OAuth client. In Google Cloud: enable "YouTube Data API v3", create an OAuth client (Web application) with this redirect URI, then put YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in the studio environment and restart it.' }),
      el('code', { class: 'copy', text: y.redirectUri }));
    return;
  }
  if (!y.connected) {
    box.replaceChildren(el('p', { class: 'muted', text: 'Connect the channel the videos should go to.' }), el('a', { class: 'btn primary', href: '/oauth/youtube/start', text: 'Connect YouTube' }));
    return;
  }
  box.replaceChildren(
    y.canCaption ? null : el('p', { class: 'note' }, 'Subtitles need one more YouTube permission. ', el('a', { href: '/oauth/youtube/start', text: 'Reconnect YouTube' }), ' (same channel) to allow them.'),
    el('div', { class: 'channel' }, y.channel?.thumb ? el('img', { src: y.channel.thumb, alt: '' }) : null, el('div', {}, el('b', { text: y.channel?.title || 'Connected channel' }), el('span', { class: 'muted small', text: y.channel ? `Channel ${y.channel.id}` : '' }))),
    el('button', { class: 'btn ghost', text: 'Disconnect', onclick: act(async () => { if (confirm('Disconnect YouTube? Automatic uploads stop until you connect again.')) await api('/api/youtube/disconnect', { method: 'POST' }); }) }));
}

/* ---------- episodes ---------- */
function progressEl(ep) {
  const p = ep.progress;
  if (!p) return null;
  if (p.parts) return el('div', { class: 'parts' }, ...p.parts.map(x => el('div', { class: 'part' }, el('span', { text: x.name }), el('div', { class: 'bar' }, el('i', { style: `width:${x.pct}%` })), el('span', { class: 'muted small', text: x.pct >= 100 ? 'done' : x.eta ? `${x.pct}% · ~${Math.ceil(x.eta / 60)} min left` : `${x.pct}%` }))));
  return el('div', { class: 'part' }, el('span', { text: p.label }), p.pct !== undefined ? el('div', { class: 'bar' }, el('i', { style: `width:${p.pct}%` })) : null);
}

function episodeRow(ep) {
  const busy = ep.status === 'running' || ep.status === 'uploading' || ep.status === 'queued' || ep.status === 'waiting';
  const links = [];
  if (ep.uploads?.main) links.push(el('a', { href: ep.uploads.main.url, target: '_blank', rel: 'noopener', text: 'Episode ↗' }));
  for (const [n, s] of Object.entries(ep.uploads?.shorts || {})) links.push(el('a', { href: s.url, target: '_blank', rel: 'noopener', text: `Short ${n} ↗` }));
  return el('article', { class: `ep ${ep.status}` },
    el('div', { class: 'ep-main' },
      el('div', { class: 'ep-title' }, el('span', { class: `chip ${ep.status}`, text: STATUS[ep.status] || ep.status }), el('b', { text: ep.title || (ep.match ? `Match · ${ep.match.minutes} min · ${ep.match.kills.blue}–${ep.match.kills.red}` : `Episode ${ep.id}`) })),
      el('div', { class: 'muted small', text: [ago(ep.createdAt), ep.stage ? `stage: ${ep.stage}` : '', ep.duration ? `${mmss(ep.duration)} episode + ${ep.fights} shorts` : '', ep.pruned ? 'files cleaned up' : ''].filter(Boolean).join(' · ') }),
      ep.error ? el('div', { class: ep.status === 'waiting' ? 'muted small' : 'error small', text: ep.error }) : null,
      progressEl(ep),
      links.length ? el('div', { class: 'links' }, ...links) : null),
    el('div', { class: 'ep-actions' },
      el('button', { class: 'btn', text: 'Open', onclick: () => openDetail(ep.id) }),
      busy ? el('button', { class: 'btn ghost', text: ep.status === 'waiting' ? 'Don\'t upload' : 'Cancel', onclick: act(() => api(`/api/episodes/${ep.id}/cancel`, { method: 'POST' })) }) : null,
      (ep.status === 'failed' || ep.status === 'cancelled') && !ep.pruned ? el('button', { class: 'btn', text: 'Resume', onclick: act(() => api(`/api/episodes/${ep.id}/run`, { method: 'POST' })) }) : null,
      ep.status === 'published' && ep.captions && ep.captions.done < ep.captions.expected && state.youtube.canCaption ? el('button', { class: 'btn', text: 'Add subtitles', onclick: act(() => api(`/api/episodes/${ep.id}/upload`, { method: 'POST' })) }) : null,
      ep.status === 'ready' || (ep.status === 'failed' && ep.duration) ? el('button', { class: 'btn primary', text: 'Upload', disabled: !state.youtube.connected, title: state.youtube.connected ? '' : 'Connect YouTube first', onclick: act(() => api(`/api/episodes/${ep.id}/upload`, { method: 'POST' })) }) : null,
      !busy ? el('button', { class: 'btn ghost danger', text: 'Delete', onclick: act(async () => { if (confirm('Delete this episode and its files? Videos already on YouTube stay there.')) await api(`/api/episodes/${ep.id}`, { method: 'DELETE' }); }) }) : null));
}

async function refresh() {
  state = await api('/api/state');
  fillSettings(state.settings);
  renderLanguages(state.languages, state.settings.languages || []);
  if ($('#s-voiceId').options.length === 0) loadVoices();
  renderYouTube(state.youtube);
  const u = state.uploads;
  $('#upload-budget').textContent = `YouTube uploads in the last 24 h: ${u.last24h} of ${u.max}${u.pausedUntil ? ` · paused until ${new Date(u.pausedUntil).toLocaleString()}` : ''}.`;
  const perEpisode = state.settings.fights + 1;
  const fits = Math.max(1, Math.floor(u.max / perEpisode));
  $('#auto-hint').textContent = `Each episode is ${perEpisode} videos, so ${u.max}/day fits about ${fits} episode${fits === 1 ? '' : 's'} a day (every ${Math.ceil(24 / fits)} h or slower).`;
  $('#auto-next').textContent = state.autopilot.enabled ? `Next episode: ${new Date(state.autopilot.next).toLocaleString()}${state.settings.autoUpload ? ', uploaded automatically' : ', kept for review'}.` : 'Off.';
  $('#queue').textContent = state.running ? `Working on ${state.running}${state.queue.length ? ` · ${state.queue.length} queued` : ''}` : state.queue.length ? `${state.queue.length} queued` : 'Idle';
  $('#keys').textContent = `ElevenLabs key: ${state.keys.elevenlabs ? 'set' : 'MISSING (voice-over will fail)'} · Claude key: ${state.keys.anthropic ? 'set' : 'not set (built-in writer is used)'}`;
  $('#claude-key').textContent = state.keys.anthropic ? '' : '(needs ANTHROPIC_API_KEY)';
  $('#run-upload').disabled = !state.youtube.connected;
  $('#run-note').textContent = 'Rendering runs in the background at low priority; expect about 1–2 hours per episode on this server.';
  const list = $('#episodes');
  list.replaceChildren(...(state.episodes.length ? state.episodes.map(episodeRow) : [el('p', { class: 'muted', text: 'No episodes yet. Start one above.' })]));
  if (openId && $('#detail').open) refreshDetail();
}

/* ---------- detail ---------- */
async function openDetail(id) {
  openId = id;
  $('#d-body').replaceChildren(el('p', { class: 'muted', text: 'Loading…' }));
  $('#detail').showModal();
  await refreshDetail(true);
}
$('#d-close').addEventListener('click', () => { $('#detail').close(); openId = null; });

function metaEditor(meta, uploaded, onSave) {
  const title = el('input', { value: meta.title, maxlength: 100, disabled: uploaded });
  const desc = el('textarea', { rows: 7, disabled: uploaded }); desc.value = meta.description;
  const tags = el('input', { value: (meta.tags || []).join(', '), disabled: uploaded });
  return el('div', { class: 'meta' },
    el('label', {}, 'Title', title), el('label', {}, 'Description', desc), el('label', {}, 'Tags', tags),
    meta.hook ? el('p', { class: 'muted small', text: `On-screen hook: “${meta.hook}”` }) : null,
    uploaded ? el('p', { class: 'muted small', text: 'Already uploaded — edit it on YouTube.' }) : el('button', { class: 'btn', text: 'Save', onclick: act(() => onSave({ title: title.value, description: desc.value, tags: tags.value.split(',').map(t => t.trim()).filter(Boolean) })) }));
}

let lastDetail = '';
async function refreshDetail(force) {
  const id = openId;
  const d = await api(`/api/episodes/${id}`);
  const sig = JSON.stringify([d.status, d.stage, d.main?.meta, d.fights.map(f => f.short?.meta), d.uploads, d.log.length]);
  if (!force && sig === lastDetail) return;
  lastDetail = sig;
  $('#d-title').textContent = d.title || `Episode ${d.id}`;
  const media = n => `/media/${d.id}/${n}`;
  const body = [];
  if (d.summary) body.push(el('p', { class: 'muted', text: `Match: ${Math.round(d.summary.duration / 60)} min, ${d.summary.winner ? `${d.summary.winner} won` : 'unfinished'} ${d.summary.kills.blue}–${d.summary.kills.red} · seed ${d.summary.seed}` }));
  if (d.main && !d.pruned) {
    body.push(el('h3', { text: 'Episode' }), el('div', { class: 'main-media' },
      el('video', { src: media('episode.mp4'), controls: true, preload: 'metadata', poster: media('thumb.jpg') }),
      el('div', {}, el('p', { class: 'muted small', text: 'Thumbnail' }), el('img', { src: media('thumb.jpg'), alt: 'Thumbnail', class: 'thumb' }))),
    metaEditor(d.main.meta, !!d.uploads.main, patch => api(`/api/episodes/${d.id}/meta`, { method: 'POST', body: { main: patch } })));
  }
  const locs = [['Episode', d.main?.meta?.localizations], ...d.fights.map(f => [`Short ${f.n}`, f.short?.meta?.localizations])].filter(([, l]) => l && Object.keys(l).length);
  if (locs.length) {
    body.push(el('h3', { text: 'Other languages' }), el('p', { class: 'muted small', text: 'Titles and descriptions YouTube shows to viewers in these languages (written from the same facts; edits to the English title above don\'t change them).' }),
      el('div', { class: 'locs' }, ...locs.map(([what, l]) => el('div', {}, el('b', { text: what }), el('ul', {}, ...Object.entries(l).map(([code, m]) => el('li', {}, el('span', { class: 'muted small', text: `${code} ` }), m.title)))))));
  }
  if (d.fights.some(f => f.short?.file) && !d.pruned) {
    body.push(el('h3', { text: 'Shorts' }), el('div', { class: 'shorts' }, ...d.fights.filter(f => f.short?.file).map(f => el('div', { class: 'short' },
      el('video', { src: media(f.short.file), controls: true, preload: 'metadata' }),
      metaEditor(f.short.meta, !!d.uploads.shorts?.[f.n], patch => api(`/api/episodes/${d.id}/meta`, { method: 'POST', body: { shorts: { [f.n]: patch } } }))))));
  }
  if (d.fights.length) {
    body.push(el('h3', { text: 'Commentary' }), el('div', { class: 'script' }, ...d.fights.map(f => el('div', {},
      el('b', { text: `Fight ${f.n} · ${mmss(f.start)} · ${f.kills} kills${f.facts ? ` · ${f.facts.moment.toLowerCase()} (${f.facts.starName})` : ''}` }),
      el('ol', {}, ...f.lines.map(l => el('li', {}, el('span', { class: 'muted small', text: `${mmss(l.start)} ` }), l.text)))))));
  }
  body.push(el('h3', { text: 'Log' }), el('pre', { class: 'log', text: d.log.map(x => `${new Date(x.at).toLocaleTimeString()}  ${x.msg}`).join('\n') }));
  $('#d-body').replaceChildren(...body);
}

$('#run').addEventListener('click', act(async () => {
  const { id } = await api('/api/episodes', { method: 'POST', body: { upload: $('#run-upload').checked } });
  toast(`Episode ${id} queued.`);
}));
$('#logout').addEventListener('click', async () => { await api('/api/logout', { method: 'POST' }).catch(() => {}); location.href = '/login'; });

const q = new URLSearchParams(location.search).get('youtube');
if (q) {
  toast({ connected: 'YouTube connected.', denied: 'YouTube access was not granted.', failed: 'Could not connect YouTube (see the server log).', state: 'The sign-in link expired — try again.', unconfigured: 'Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET first.' }[q] || q, q !== 'connected');
  history.replaceState(null, '', '/');
}
refresh().then(loadVoices);
setInterval(() => refresh().catch(() => {}), 4000);
