/* BroadRoads client entry: auth → lobby → champion select → match. */
import { api, checkServer, OnlineConnection } from './net/connection.js';
import { OfflineConnection, offlineProfileName } from './net/offline.js';
import { MobaRenderer } from './render/mobaRenderer.js';
import { setModelsEnabled } from './render/assetModels.js';
import { iconsReady } from './ui/icons.js';
import './net/report.js';
import { ReplayPlayer } from './game/spectate.js';
import { Game } from './game/game.js';
import { Lobby } from './ui/lobby.js';
import { Select } from './ui/select.js';
import { UI } from './ui/ui.js';
import { $, $$ } from './ui/dom.js';
import { NAME_RE } from '../shared/constants.js';
import { sfx } from './audio/sfx.js';

const TOKEN_KEY = 'broadroads_token';

class App {
  constructor() {
    this.settings = this.loadSettings();
    setModelsEnabled(this.settings.models !== false);
    sfx.setVolume(this.settings.volume);
    sfx.setMusicVolume(this.settings.musicVolume);
    this.ui = new UI();
    this.conn = null;
    this.game = null;
    this.renderer = null;
    this.data = null;
    this.champInfo = {};
    this.ping = 0;
    this.tab = 'login';
    this.serverInfo = null;
  }

  loadSettings() {
    const d = { quality: matchMedia('(pointer: coarse)').matches ? 'low' : 'medium', volume: 0.6, musicVolume: 0.4, showFps: false, cameraLock: true, difficulty: 'normal', models: true };
    try { return { ...d, ...JSON.parse(localStorage.getItem('broadroads_settings') || '{}') }; } catch { return d; }
  }
  saveSettings() { try { localStorage.setItem('broadroads_settings', JSON.stringify(this.settings)); } catch { /* ignore */ } }

  show(id) { for (const s of $$('.screen')) s.hidden = s.id !== id; $('#hud').hidden = id !== 'game'; if (id === 'game') for (const s of $$('.screen')) s.hidden = true; }

  send(msg) { if (this.conn) this.conn.send(msg); }

  /* ---------------- auth screen ---------------- */
  setTab(t) {
    this.tab = t;
    for (const b of $$('.auth-card .tab')) b.classList.toggle('active', b.dataset.tab === t);
    $('#pass-field').hidden = t === 'offline';
    $('#auth-pass').required = t !== 'offline';
    $('#auth-submit').textContent = t === 'register' ? 'Create Account' : t === 'offline' ? 'Play Offline vs AI' : 'Enter the Valley';
    $('#auth-hint').textContent = t === 'offline' ? 'Offline mode runs the full game in your browser against bots. Your profile is saved on this device.' : t === 'register' ? 'Your account name is your player name. 3–16 letters, numbers or _.' : '';
    if (t === 'offline' && !$('#auth-user').value) $('#auth-user').value = offlineProfileName();
    $('#auth-error').textContent = '';
  }

  async refreshServer() {
    this.serverInfo = await checkServer();
    const el = $('#server-status');
    el.classList.toggle('online', !!this.serverInfo);
    el.classList.toggle('offline', !this.serverInfo);
    el.querySelector('.label').textContent = this.serverInfo ? `Servers online · ${this.serverInfo.online} player${this.serverInfo.online === 1 ? '' : 's'} · ${this.serverInfo.matches ?? 0} live match${this.serverInfo.matches === 1 ? '' : 'es'}` : 'Servers unreachable · offline play vs AI available';
    for (const b of $$('.auth-card .tab')) if (b.dataset.tab !== 'offline') b.disabled = !this.serverInfo;
    if (!this.serverInfo && this.tab !== 'offline') this.setTab('offline');
  }

  async submit(ev) {
    ev.preventDefault();
    sfx.init();
    $('#auth-error').textContent = '';
    const name = $('#auth-user').value.trim();
    const pass = $('#auth-pass').value;
    if (!NAME_RE.test(name)) { $('#auth-error').textContent = 'Names are 3–16 letters, numbers or _, starting with a letter.'; return; }
    const btn = $('#auth-submit');
    btn.disabled = true;
    try {
      if (this.tab === 'offline') return await this.startSession(new OfflineConnection(name), name, true);
      const res = await api(this.tab === 'register' ? '/api/auth/register' : '/api/auth/login', { username: name, password: pass });
      try { localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: res.token, username: res.username })); } catch { /* ignore */ }
      $('#auth-pass').value = '';
      await this.startSession(new OnlineConnection(res.token), res.username, false);
    } catch (err) {
      $('#auth-error').textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------------- session ---------------- */
  async startSession(conn, name, offline) {
    this.show('screen-loading');
    $('#loading-text').textContent = offline ? 'Preparing your offline Valley…' : 'Connecting…';
    this.conn = conn;
    this.name = name;
    this.offline = offline;
    conn.on('*', m => this.route(m));
    conn.on('disconnect', m => { if (!m.byUs) this.exit(this.kickedReason || 'Disconnected from the server.'); });
    try {
      await iconsReady; // tiny manifests; the lobby renders portraits and icons
      await conn.connect();
    } catch (err) {
      this.exit(err.message);
      return;
    }
    this.pingTimer = setInterval(() => this.send({ t: 'ping', c: performance.now() }), 3000);
  }

  route(m) {
    if (m.t === 'end' && m.profile) this.lobby?.setProfile(m.profile); // quests, shards, level from this match
    if (this.game && ['s', 'score', 'end'].includes(m.t)) return this.game.onMessage(m);
    switch (m.t) {
      case 'hello':
        this.data = { champions: m.champions, items: m.items, spells: m.spells, second: m.second };
        this.champInfo = Object.fromEntries(m.champions.map(c => [c.id, c]));
        this.lobby = new Lobby(this);
        this.select = new Select(this);
        break;
      case 'profile': this.lobby?.setProfile(m.profile); break;
      case 'lobby':
        if (this.game?.match.replay) { this.lobby.setState(m); break; } // keep watching the replay
        if (this.game) { this.game.destroy(); this.game = null; }
        this.lobby.setState(m);
        this.show('screen-lobby');
        this.inSelect = false;
        sfx.playMusic('music_lobby');
        if (!this.offline) this.send({ t: 'who' });
        break;
      case 'select':
        if (!this.inSelect) {
          this.inSelect = true;
          sfx.play('queue_found', { late: true });
          if (m.select.mode === 'ranked') sfx.announce('vo_match_found', 3);
          sfx.announce('vo_choose', 2);
        }
        this.select.update(m.select);
        this.show('screen-select');
        break;
      case 'match': this.startGame(m); break;
      case 'live': this.lobby?.setLive(m.list); break;
      case 'friends': this.lobby?.setFriends(m); break;
      case 'replays': this.lobby?.setReplays(m.list); break;
      case 'replay': this.startReplay(m.header, m.lines); break;
      case 'replaySaved': this.lastReplay = m; this.game?.panels.refresh(['end']); break;
      case 'party': this.lobby?.setParty(m.party); break;
      case 'invite': sfx.play('ui_notify'); this.ui.prompt(`${m.from} invites you to their party.`, () => this.send({ t: 'party', op: 'accept', party: m.party }), () => this.send({ t: 'party', op: 'decline', party: m.party })); break;
      case 'who': this.lobby?.setWho(m); break;
      case 'lb': this.lobby?.setLeaderboard(m); break;
      case 'chat':
        if (this.game) this.game.onMessage(m);
        else { this.lobby?.chat.add(m); if (m.from && m.from !== this.name) sfx.play('chat_msg', { gap: 0.3 }); }
        break;
      case 'notice': this.ui.toast(m.text, m.kind); break;
      case 'kicked': this.kickedReason = m.reason; break;
      case 'authFail': try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } this.exit(m.error); break;
      case 'pong': this.ping = Math.round(performance.now() - m.c); break;
      default:
    }
  }

  startGame(m) {
    if (this.game) { this.game.destroy(); this.game = null; }
    this.inSelect = false;
    if (!this.renderer) {
      try { this.renderer = new MobaRenderer($('#game-canvas'), this.settings.quality); } catch (err) { console.error(err); this.ui.toast('WebGL is not available in this browser.', 'bad'); return; }
      window.addEventListener('resize', () => this.renderer.resize());
    }
    this.show('game');
    this.game = new Game({ app: this, renderer: this.renderer, settings: this.settings, ui: this.ui, data: this.data, match: m });
    this.game.start();
    $('#orientation-lock').classList.add('active');
    if (m.spectator) this.ui.banner(m.replay ? 'REPLAY' : 'SPECTATING', `${m.players.filter(p => p.team === 'blue').length}v${m.players.filter(p => p.team === 'red').length} · ${m.mode}`);
    else this.ui.banner(m.mode === 'tutorial' ? 'TUTORIAL' : m.mode === 'skirmish' ? 'SKIRMISH 3V3' : m.mode === 'practice' ? 'PRACTICE VS AI' : m.ranked ? 'RANKED MATCH' : '5V5 MATCH', `You are on the ${m.team === 'blue' ? 'Blue' : 'Red'} team`);
  }

  /* ---------------- replays ---------------- */
  async watchReplay(id, startAt = 0) {
    this.replayStart = startAt;
    if (this.offline) return this.send({ t: 'replay', id }); // delivered inline by the offline hub
    try {
      const res = await fetch(`${import.meta.env.BASE_URL || '/'}replays/${id}.ndjson`);
      if (!res.ok) throw new Error('missing');
      const lines = (await res.text()).split('\n');
      this.startReplay(JSON.parse(lines[0]), lines.slice(1));
    } catch { this.ui.toast('That replay is no longer available.', 'warn'); }
  }

  startReplay(header, lines) {
    this.startGame({ t: 'match', id: header.id, mode: header.mode, ranked: header.ranked, you: null, team: 'spectator', spectator: true, replay: true, time: 0, players: header.players });
    if (this.game) this.game.replay = new ReplayPlayer(this.game, header, lines, this.replayStart || 0);
    this.replayStart = 0;
  }

  /** Shared link (?replay=id&t=s): watch without logging in. */
  async openSharedReplay() {
    const q = new URLSearchParams(location.search);
    const id = q.get('replay');
    if (!id) return false;
    try {
      if (!this.data) {
        const d = await (await fetch(`${import.meta.env.BASE_URL || '/'}api/gamedata`)).json();
        this.data = d;
        this.champInfo = Object.fromEntries(d.champions.map(c => [c.id, c]));
      }
      await iconsReady;
      this.guestReplay = !this.conn;
      await this.watchReplay(id, Number(q.get('t')) || 0);
      return true;
    } catch { this.ui.toast('Could not open that replay.', 'warn'); return false; }
  }

  endReplay() {
    if (this.game) { this.game.destroy(); this.game = null; }
    if (new URLSearchParams(location.search).has('replay')) history.replaceState(null, '', location.pathname);
    if (this.guestReplay) { this.guestReplay = false; sfx.playMusic('music_lobby'); return this.show('screen-auth'); }
    sfx.playMusic('music_lobby');
    this.show('screen-lobby');
    this.lobby?.renderCenter();
  }

  exit(reason) {
    clearInterval(this.pingTimer);
    sfx.playMusic(null);
    if (this.game) { this.game.destroy(); this.game = null; }
    if (this.conn) { const c = this.conn; this.conn = null; c.close(); }
    $('#orientation-lock').classList.remove('active');
    this.show('screen-auth');
    if (reason) $('#auth-error').textContent = reason;
    this.refreshServer();
  }

  logout() {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    this.exit(null);
  }

  /** Front page for first-time visitors; returning players and shared links skip it. */
  landing(saved) {
    let seen = false;
    try { seen = localStorage.getItem('broadroads_seen_landing') === '1'; } catch { /* ignore */ }
    const champs = $('#ld-champs');
    if (champs && !champs.children.length) {
      for (const id of ['garrok', 'lyra', 'kaelen', 'hale', 'thorne', 'mira', 'zarak', 'nyra', 'brakka', 'rook']) {
        const img = document.createElement('img');
        img.src = `${import.meta.env.BASE_URL || '/'}portraits/${id}.webp`; img.alt = id; img.title = id[0].toUpperCase() + id.slice(1); img.loading = 'lazy';
        champs.append(img);
      }
    }
    const go = mode => {
      try { localStorage.setItem('broadroads_seen_landing', '1'); } catch { /* ignore */ }
      this.show('screen-auth');
      if (mode === 'offline') { this.setTab('offline'); $('#auth-form').requestSubmit(); }
      else this.setTab(mode === 'login' ? 'login' : this.serverInfo ? 'register' : 'offline');
    };
    for (const b of $$('[data-landing]')) b.addEventListener('click', () => go(b.dataset.landing));
    if (!seen && !(saved && saved.token) && !new URLSearchParams(location.search).has('replay')) this.show('screen-landing');
  }

  async boot() {
    for (const b of $$('.auth-card .tab')) b.addEventListener('click', () => this.setTab(b.dataset.tab));
    $('#auth-form').addEventListener('submit', e => this.submit(e));
    this.setTab('login');
    await this.refreshServer();
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null'); } catch { /* ignore */ }
    this.landing(saved);
    if (saved && saved.token && this.serverInfo) {
      $('#auth-user').value = saved.username;
      this.startSession(new OnlineConnection(saved.token), saved.username, false);
    }
    setInterval(() => { if (!this.conn) this.refreshServer(); }, 15000);
  }
}

const app = new App();
app.boot();
app.openSharedReplay(); // ?replay=<id>&t=<s> links open the replay right away

// Read-only hooks used by the end-to-end browser tests.
Object.defineProperty(window, '__broadroads', { get: () => app.game });
Object.defineProperty(window, '__app', { get: () => app });
Object.defineProperty(window, '__sfx', { get: () => sfx });
