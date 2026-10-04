/* BroadRoads client entry: title screen, auth, class creation and game start. */
import { api, checkServer, OnlineConnection } from './net/connection.js';
import { OfflineConnection, offlineProfileName } from './net/offline.js';
import { GameRenderer } from './render/renderer.js';
import { Game, applyThemeCss } from './game/game.js';
import { UI } from './ui/ui.js';
import { classCard } from './ui/panels.js';
import { $, $$, clear } from './ui/dom.js';
import { CLASS_IDS, currentTheme } from '../shared/classes.js';
import { NAME_RE } from '../shared/constants.js';
import { sound } from './audio/sound.js';

const TOKEN_KEY = 'broadroads_token';
const theme = currentTheme();
applyThemeCss(theme);

const settings = loadSettings();
sound.setVolume(settings.volume);
const ui = new UI();
let renderer = null;
let game = null;
let serverInfo = null;
let tab = 'login';

function loadSettings() {
  const defaults = { quality: matchMedia('(pointer: coarse)').matches ? 'low' : 'medium', volume: 0.6, showFps: false };
  try { return { ...defaults, ...JSON.parse(localStorage.getItem('broadroads_settings') || '{}') }; } catch { return defaults; }
}

function show(id) {
  for (const s of $$('.screen')) s.hidden = s.id !== id;
}

function setError(msg) { $('#auth-error').textContent = msg || ''; }

function setTab(t) {
  tab = t;
  for (const b of $$('.auth-card .tab')) b.classList.toggle('active', b.dataset.tab === t);
  $('#pass-field').hidden = t === 'offline';
  $('#auth-pass').required = t !== 'offline';
  $('#auth-pass').autocomplete = t === 'register' ? 'new-password' : 'current-password';
  $('#auth-submit').textContent = t === 'register' ? 'Create Hero Account' : t === 'offline' ? 'Play Offline' : 'Enter the Broadroads';
  $('#auth-hint').textContent = t === 'offline'
    ? 'Offline mode runs the full game in your browser. Your hero is saved on this device; arena opponents are bots.'
    : t === 'register' ? 'Your account name is your hero name. 3–16 letters, numbers or _.' : '';
  if (t === 'offline' && !$('#auth-user').value) $('#auth-user').value = offlineProfileName();
  setError('');
}

function updateServerStatus() {
  const el = $('#server-status');
  el.classList.toggle('online', !!serverInfo);
  el.classList.toggle('offline', !serverInfo);
  el.querySelector('.label').textContent = serverInfo
    ? `Servers online · ${serverInfo.online} hero${serverInfo.online === 1 ? '' : 'es'} in the realm`
    : 'Servers unreachable · offline play available';
  for (const b of $$('.auth-card .tab')) if (b.dataset.tab !== 'offline') b.disabled = !serverInfo;
  if (!serverInfo && tab !== 'offline') setTab('offline');
}

function ensureRenderer() {
  if (renderer) return renderer;
  try {
    renderer = new GameRenderer($('#game-canvas'), settings.quality);
  } catch (err) {
    console.error(err);
    throw new Error('Your browser could not start WebGL. Try enabling hardware acceleration.');
  }
  window.addEventListener('resize', () => renderer.resize());
  return renderer;
}

async function startGame(conn, name, offline) {
  show('screen-loading');
  $('#loading-text').textContent = offline ? 'Preparing your offline realm…' : 'Connecting to the Broadroads…';
  ensureRenderer();
  game = new Game({
    conn, name, offline, renderer, settings, ui,
    onExit: (reason, voluntary) => exitToTitle(reason, voluntary),
    onNeedChar: g => showCreate(g),
  });
  conn.on('authFail', m => {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    exitToTitle(m.error);
  });
  game.start();
  $('#orientation-lock').classList.add('active');
  try {
    await conn.connect();
  } catch (err) {
    exitToTitle(err.message);
  }
}

function showCreate(g) {
  show('screen-create');
  $('#create-sub').textContent = `Welcome, ${g.name}. Season of ${theme.monthName}: ${theme.icon} ${theme.name}. Your class can be changed later at the trainer.`;
  const cards = clear($('#class-cards'));
  for (const cls of CLASS_IDS) {
    cards.append(classCard(cls, theme, 'Choose', false, () => {
      show('screen-loading');
      $('#loading-text').textContent = 'Forging your hero…';
      g.send({ t: 'create', cls });
    }));
  }
}

function exitToTitle(reason, voluntary = false) {
  if (game) { game.destroy(); game = null; }
  $('#orientation-lock').classList.remove('active');
  show('screen-auth');
  $('#hud').hidden = true;
  if (voluntary && tab !== 'offline') { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } }
  if (reason) setError(reason);
  refreshServer();
}

async function refreshServer() {
  serverInfo = await checkServer();
  updateServerStatus();
}

async function submit(ev) {
  ev.preventDefault();
  sound.init();
  setError('');
  const name = $('#auth-user').value.trim();
  const pass = $('#auth-pass').value;
  if (!NAME_RE.test(name)) return setError('Names are 3–16 letters, numbers or _, starting with a letter.');
  const btn = $('#auth-submit');
  btn.disabled = true;
  try {
    if (tab === 'offline') {
      await startGame(new OfflineConnection(name), name, true);
      return;
    }
    const res = await api(tab === 'register' ? '/api/auth/register' : '/api/auth/login', { username: name, password: pass });
    try { localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: res.token, username: res.username })); } catch { /* ignore */ }
    $('#auth-pass').value = '';
    await startGame(new OnlineConnection(res.token), res.username, false);
  } catch (err) {
    setError(err.message);
  } finally {
    btn.disabled = false;
  }
}

async function boot() {
  $('#season-badge').textContent = `${theme.icon} Season of ${theme.monthName}: ${theme.name}`;
  for (const b of $$('.auth-card .tab')) b.addEventListener('click', () => setTab(b.dataset.tab));
  $('#auth-form').addEventListener('submit', submit);
  setTab('login');
  await refreshServer();
  // Resume a saved session.
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null'); } catch { /* ignore */ }
  if (saved && saved.token && serverInfo) {
    $('#auth-user').value = saved.username;
    startGame(new OnlineConnection(saved.token), saved.username, false);
  }
  setInterval(() => { if (!game) refreshServer(); }, 15000);
}

boot();

// Read-only hook used by the end-to-end browser tests.
Object.defineProperty(window, '__broadroads', { get: () => game });
