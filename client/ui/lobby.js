/* Home lobby: play modes, custom rooms, party, champions, leaderboards, profile. */
import { langPicker } from '../i18n.js';
import { packOffer } from './packOffer.js';
import { h, $, clear, timeStr } from './dom.js';
import { pic, champKey, abilityKey } from './icons.js';
import { championPreview } from '../render/preview.js';
import { tutorialDone } from '../game/tutorial.js';
import { share } from './share.js';
import { QUESTS, SKINS, AVATARS, avatarUnlocked, avatarOf, ownsSkin, equippedSkin, tierOf, seasonOf, firstWinAvailable, FIRST_WIN_SHARDS, FIRST_WIN_XP, STREAK_REWARDS } from '../../shared/moba/progression.js';
import { profileXpNeeded } from '../../shared/moba/profile.js';
import { Chat } from './chat.js';

const ROLE_ICON = { Tank: '🛡️', Fighter: '🪓', Assassin: '🗡️', Mage: '🔮', Marksman: '🏹', Support: '💖' };

export class Lobby {
  constructor(app) {
    this.app = app;
    this.root = $('#screen-lobby');
    this.tab = 'play';
    this.state = { state: 'lobby' };
    this.lb = null;
    this.lbKind = 'rating';
    this.who = null;
    this.party = null;
    this.selectedChamp = null;
    this.build();
  }

  build() {
    const app = this.app;
    clear(this.root);
    this.profileChip = h('div.lob-profile');
    const nav = h('nav.lob-nav', {}, ...[['play', 'Play'], ['champions', 'Champions'], ['leaderboard', 'Leaderboard'], ['profile', 'Profile']].map(([id, label]) =>
      h(`button.lob-tab${this.tab === id ? '.active' : ''}`, { dataset: { tab: id }, onclick: () => this.setTab(id) }, label)));
    this.header = h('header.lob-header', {}, h('div.lob-brand', {}, h('span', { text: '⚔️' }), h('b', { text: 'BROADROADS' })), nav, this.profileChip,
      langPicker(),
      h('button.btn.btn-sm.install-btn', { type: 'button', hidden: true, title: 'Install BroadRoads as an app' }, '📲 Install'),
      h('button.btn.btn-sm', { onclick: () => app.logout() }, app.offline ? 'Exit' : 'Log out'));
    this.playPanel = h('div.lob-play');
    this.center = h('div.lob-center');
    this.partyEl = h('div.lob-party');
    this.whoEl = h('div.lob-who');
    this.friendsEl = h('div.lob-friends');
    const chatBox = h('div.lob-chat');
    this.root.append(h('div.auth-bg'), this.header, h('div.lob-grid', {}, this.playPanel, this.center, h('aside.lob-side', {}, app.isGuest && !app.offline ? h('aside.guest-card', {}, h('b', { text: '💾 Save your progress' }), h('p', { text: `You're playing as ${app.name}. Pick a name and password to keep your levels, shards and skins on any device.` }), h('button.btn.btn-primary.btn-sm', { type: 'button', onclick: () => app.claimAccount() }, 'Save my account')) : null, packOffer(app), this.partyEl, this.friendsEl, this.whoEl, chatBox)));
    this.chat = new Chat(app, chatBox, 'lobby');
    this.renderPlay();
    this.renderCenter();
    this.renderParty();
    app.syncInstall?.();
  }

  setTab(t) {
    this.tab = t;
    for (const b of this.root.querySelectorAll('.lob-tab')) b.classList.toggle('active', b.dataset.tab === t);
    if (t === 'leaderboard') this.app.send({ t: 'lb', kind: this.lbKind });
    this.renderCenter();
  }

  setProfile(p) {
    this.profile = p;
    const xpPct = Math.min(100, (p.xp / profileXpNeeded(p.level)) * 100);
    clear(this.profileChip).append(
      h('span.lp-avatar', {}, pic(avatarOf(p), '👤')),
      h('span.lp-mid', {}, h('span.lp-name', { text: p.name }), h('span.lp-xp', { title: `${p.xp} / ${profileXpNeeded(p.level)} XP to level ${p.level + 1}` }, h('i', { style: { width: `${xpPct}%` } }))),
      h('span.lp-lvl', { text: `Lv ${p.level}` }), h('span.lp-shards', { title: 'Shards: earned from quests, games and level-ups; spend them on skins' }, h('span.sh-ic', { text: '💠' }), String(p.shards || 0)), h('span.lp-rating', { title: tierOf(p.rating).label }, h('span.lp-tier', {}, pic(`misc/tier_${tierOf(p.rating).id}`, '🏆')), String(p.rating)));
    if (this.tab !== 'leaderboard') this.renderCenter();
    this.renderPlay();
  }

  setLive(list) { this.live = list; if (this.tab === 'play') this.renderCenter(); }
  setReplays(list) { this.replays = list; if (this.tab === 'play') this.renderCenter(); }

  /** Asks for live matches and recent replays (on lobby entry and every 15s on the Play tab). */
  refreshWatch() {
    if (!this.app.offline) this.app.send({ t: 'live' });
    this.app.send({ t: 'replays' });
    clearTimeout(this.watchT);
    this.watchT = setTimeout(() => { if (this.tab === 'play' && !this.app.game) this.refreshWatch(); }, 15000);
  }

  setState(s) {
    if (!this.state || this.state.state !== s.state || !this.watchT) this.refreshWatch();
    this.state = s;
    this.renderPlay();
    this.renderCenter();
  }

  /* ---------------- play panel ---------------- */
  renderPlay() {
    const app = this.app, s = this.state;
    clear(this.playPanel);
    const diff = h('select.diff', {}, ...[['easy', 'Easy bots'], ['normal', 'Normal bots'], ['hard', 'Hard bots']].map(([v, t]) => h('option', { value: v, text: t })));
    diff.value = app.settings.difficulty || 'normal';
    diff.addEventListener('change', () => { app.settings.difficulty = diff.value; app.saveSettings(); });
    const code = h('input.code-input', { placeholder: 'Room code', maxlength: 6, inputmode: 'numeric' });
    const busy = s.state === 'queue' || s.state === 'room';
    put(this.playPanel,
      h('h3', { text: 'Play' }),
      s.rejoin ? h('button.btn.btn-primary.btn-lg.pulse', { onclick: () => app.send({ t: 'rejoin' }) }, '↩ Reconnect to match') : null,
      h('div.play-card', {},
        h('div.pc-title', { text: '⚔️ Ranked 5v5' }),
        h('p', { text: app.offline ? 'Requires the online servers.' : 'Matchmaking with real players. Empty seats are filled by bots after a short wait (unranked).' }),
        this.profile ? this.rankLine(this.profile) : null,
        h('button.btn.btn-primary.btn-lg', { disabled: app.offline || busy, onclick: () => app.send({ t: 'queue', mode: 'ranked' }) }, 'Find Match')),
      h('div.play-card', {},
        h('div.pc-title', { text: '🤖 Practice vs AI' }),
        h('p', { text: 'You (and your party) against bots. Starts instantly.' }),
        diff,
        h('button.btn.btn-lg', { disabled: busy, onclick: () => app.send({ t: 'queue', mode: 'practice', difficulty: diff.value }) }, 'Start Practice')),
      h('div.play-card', {},
        h('div.pc-title', { text: '🏟️ Custom Game' }),
        h('p', { text: 'Create a room and share the code with friends, or join one.' }),
        h('div.row', {}, h('button.btn', { disabled: s.state === 'queue', onclick: () => app.send({ t: 'room', op: 'create' }) }, 'Create Room')),
        h('div.row', {}, code, h('button.btn', { disabled: s.state === 'queue', onclick: () => app.send({ t: 'room', op: 'join', code: code.value.trim() }) }, 'Join'))),
      h('div.play-card', {},
        h('div.pc-title', { text: '⚡ Skirmish 3v3' }),
        h('p', { text: 'A quick 3v3 on the middle lane: start at level 3, faster gold, about 10 minutes. You (and up to 2 friends) against bots.' }),
        h('button.btn.btn-lg', { disabled: busy, onclick: () => app.send({ t: 'queue', mode: 'skirmish', difficulty: diff.value }) }, 'Start Skirmish')),
      h('div.play-card.featured', {},
        h('div.tc-badge', { text: 'Featured mode' }),
        h('div.pc-title', {}, h('span.pc-ic', {}, pic('misc/brawl', '👊')), 'Brawl 5v5'),
        h('p', { text: 'Five against five on one lane with random champions. Start at level 3 and fight from the first second. Bring your whole party.' }),
        h('button.btn.btn-lg', { disabled: busy, onclick: () => app.send({ t: 'queue', mode: 'brawl', difficulty: diff.value }) }, 'Start Brawl')),
      // Last in the DOM (tests address cards by position); CSS lifts it to the top for new players.
      h(`div.play-card.tutorial-card${tutorialDone() ? '' : '.new'}`, {},
        tutorialDone() ? null : h('div.tc-badge', { text: 'New here? Start with this' }),
        h('div.pc-title', { text: '🎓 Tutorial' }),
        h('p', { text: 'A quick guided first match: walking, abilities and last-hitting for gold. About 2 minutes.' }),
        h(`button.btn.btn-lg${tutorialDone() ? '' : '.btn-primary'}`, { disabled: busy, onclick: () => app.send({ t: 'queue', mode: 'tutorial' }) }, tutorialDone() ? 'Replay Tutorial' : 'Start Tutorial')),
      s.state === 'queue' && s.queue ? h('div.queue-box', {},
        h('div.qb-title', { text: `Searching for a match… ${timeStr(s.queue.since)}` }), h('div.spinner.small'),
        h('button.btn.btn-sm', { onclick: () => app.send({ t: 'cancel' }) }, 'Cancel')) : null);
  }

  /* ---------------- centre ---------------- */
  renderCenter() {
    clear(this.center);
    if (this.state.state === 'room' && this.state.room) return this.center.append(this.roomView(this.state.room));
    const fn = { play: () => this.homeView(), champions: () => this.champView(), leaderboard: () => this.lbView(), profile: () => this.profileView() }[this.tab];
    this.center.append(fn());
  }

  watchView() {
    const app = this.app, live = this.live || [], reps = this.replays || [];
    if (!live.length && !reps.length) return null;
    const faces = (players, team) => h('span.w-faces', {}, ...players.filter(p => p.team === team).map(p => h('span.w-face', { title: p.name }, pic(champKey(p.champ), app.champInfo[p.champ]?.icon || '?'))));
    return h('div.card.watch', {},
      h('h4', { text: 'Watch' }),
      ...live.map(m => h('div.w-row', {},
        h('span.w-live', { text: '● LIVE' }), faces(m.players, 'blue'), h('span.w-score', { text: `${m.kills.blue} – ${m.kills.red}` }), faces(m.players, 'red'),
        h('span.muted.w-meta', { text: `${m.mode} · ${timeStr(m.time)}${m.watchers ? ` · ${m.watchers} watching` : ''}` }),
        h('button.btn.btn-sm', { onclick: () => app.send({ t: 'spectate', id: m.id }) }, 'Watch'))),
      ...reps.slice(0, 6).map(r => h('div.w-row', {},
        h('span.w-rep', { text: '⏵ REPLAY' }), faces(r.players, 'blue'), h('span.w-score', { text: `${r.kills.blue} – ${r.kills.red}` }), faces(r.players, 'red'),
        h('span.muted.w-meta', { text: `${r.winner === 'blue' ? 'Blue' : 'Red'} won · ${timeStr(r.duration)} · ${new Date(r.at).toLocaleDateString()}` }),
        h('button.btn.btn-sm', { onclick: () => app.watchReplay(r.id) }, 'Watch'),
        h('button.btn.btn-sm', { title: 'Share', onclick: () => share(app.ui, { id: r.id, t: (r.highlights || []).length ? Math.max(0, [...r.highlights].sort((a, b) => b.score - a.score)[0].t - 6) : 0, text: 'Watch this BroadRoads match!' }) }, '🔗'))));
  }

  rankLine(p) {
    const t = tierOf(p.rating), s = seasonOf();
    const locked = (p.queueLockUntil || 0) > Date.now();
    if ((p.seasonGames || 0) < 5) return h('div.rank-line', {}, h('span.rl-ic', {}, pic('misc/placement', '❔')), h('div.rl-mid', {}, h('b', { text: `Placements ${p.seasonGames || 0}/5` }), h('div.muted.rl-season', { text: locked ? `Ranked locked for ${Math.ceil((p.queueLockUntil - Date.now()) / 60000)} min (left a ranked game)` : `Your first 5 ranked games set your Season ${s.number} rank` })));
    const days = Math.max(0, Math.ceil((s.endsAt - Date.now()) / 86400000));
    return h('div.rank-line', {},
      h('span.rl-ic', {}, pic(`misc/tier_${t.id}`, '🏆')),
      h('div.rl-mid', {}, h('div', {}, h('b', { text: t.label, style: { color: t.color } }), h('span.muted', { text: ` · ${p.rating}` })),
        h('div.rl-bar', {}, h('i', { style: { width: `${t.progress * 100}%`, background: t.color } })),
        h('div.muted.rl-season', { text: `Season ${s.number} · ends in ${days} days` })));
  }

  questsView(p) {
    const left = Math.max(0, Math.ceil((new Date(`${p.quests.day}T00:00:00Z`).getTime() + 86400000 - Date.now()) / 3600000));
    return h('div.card.quests', {},
      h('div.q-head', {}, h('h4', { text: 'Daily quests' }), h('span.muted', { text: `New quests in ${left}h` })),
      h('div.daily', {},
        h('span.d-item', { title: `Log in every day: rewards ${STREAK_REWARDS.join(', ')} shards, then the cycle repeats` }, h('span.d-ic', {}, pic('misc/streak', '🔥')), h('span', {}, h('b', { text: `Day ${p.streak || 1}` }), ' login streak')),
        h(`span.d-item${firstWinAvailable(p) ? '.ready' : ''}`, {}, h('span.d-ic', {}, pic('misc/firstwin', '☀️')),
          h('span', {}, firstWinAvailable(p) ? h('b', { text: 'First win of the day ' }) : 'First win of the day ', firstWinAvailable(p) ? `+${FIRST_WIN_SHARDS} 💠 +${FIRST_WIN_XP} XP` : '✓ earned today'))),
      ...p.quests.list.map(q => {
        const d = QUESTS[q.id];
        if (!d) return null;
        const done = q.n >= d.goal;
        return h(`div.quest${q.claimed ? '.claimed' : done ? '.done' : ''}`, {},
          h('span.q-ic', {}, pic('misc/quest', '📜')),
          h('div.q-mid', {}, h('div.q-text', { text: d.text }),
            h('div.q-bar', {}, h('i', { style: { width: `${Math.min(100, (q.n / d.goal) * 100)}%` } })),
            h('div.q-prog', { text: `${Math.min(q.n, d.goal).toLocaleString()} / ${d.goal.toLocaleString()}` })),
          q.claimed ? h('span.q-claimed', { text: '✓ Claimed' })
            : h('button.btn.btn-sm' + (done ? '.btn-primary' : ''), { disabled: !done, onclick: () => this.app.send({ t: 'claim', id: q.id }) }, `💠 ${d.reward}`));
      }));
  }

  homeView() {
    const app = this.app, p = this.profile;
    const champs = app.data ? app.data.champions : [];
    const featured = champs[Math.floor(Date.now() / 86400000) % Math.max(1, champs.length)];
    return h('div.home', {},
      featured ? h('div.hero-banner', { style: { '--c': '#' + featured.color.toString(16).padStart(6, '0'), '--a': '#' + featured.accent.toString(16).padStart(6, '0') } },
        h('div.hb-icon', {}, pic(champKey(featured.id), featured.icon)),
        h('div', {}, h('div.hb-kicker', { text: 'Champion of the day' }), h('h2', { text: featured.name }), h('div.hb-title', { text: `${featured.title} · ${featured.role}` }), h('p', { text: featured.passive.desc }))) : null,
      p && p.quests ? this.questsView(p) : null,
      this.watchView(),
      h('div.home-grid', {},
        h('div.card', {}, h('h4', { text: 'How to play' }), h('ul.howto', {},
          h('li', { text: 'Right-click to move and attack. Q W E R cast abilities at your cursor.' }),
          h('li', { text: 'Last-hit minions for gold, buy items at your base (P), level abilities (Ctrl+Q/W/E/R).' }),
          h('li', { text: 'Destroy towers lane by lane, then spires, then the enemy Core.' }),
          h('li', { text: 'Slay the Ember Wyrm and the Abyss Titan for team-wide power.' }))),
        h('div.card', {}, h('h4', { text: 'Recent matches' }), p && p.history.length ? h('div.history', {}, ...p.history.slice(0, 8).map(m => this.historyRow(m))) : h('p.muted', { text: 'No matches yet — start a practice game!' }))));
  }

  historyRow(m) {
    const c = this.app.champInfo[m.champ];
    return h(`div.hist-row.${m.win ? 'win' : 'loss'}`, {}, h('span.hr-icon', {}, pic(champKey(m.champ), c ? c.icon : '?')), h('span', { text: c ? c.name : m.champ }), h('span', { text: `${m.k}/${m.d}/${m.a}` }),
      h('span.muted', { text: `${m.mode} · ${timeStr(m.dur)}` }), h('b', { text: m.win ? 'Victory' : 'Defeat' }), m.delta ? h('span', { text: `${m.delta > 0 ? '+' : ''}${m.delta}` }) : null);
  }

  champView() {
    const champs = this.app.data ? this.app.data.champions : [];
    const sel = champs.find(c => c.id === this.selectedChamp) || champs[0];
    return h('div.champ-view', {},
      h('div.champ-grid', {}, ...champs.map(c => h(`button.champ-card${sel && c.id === sel.id ? '.sel' : ''}`, { onclick: () => { this.selectedChamp = c.id; this.renderCenter(); } },
        h('div.cc-ic', {}, pic(champKey(c.id), c.icon)), h('div.cc-n', { text: c.name }), h('div.cc-r', { text: `${ROLE_ICON[c.role] || ''} ${c.role}` })))),
      sel ? h('div.champ-side', {}, this.preview(sel), championDetail(sel)) : null);
  }

  preview(c) {
    const p = this.profile;
    const skin = this.previewSkin && this.previewSkin.champ === c.id ? this.previewSkin.skin : equippedSkin(p, c.id);
    championPreview.show(c.id, c, skin);
    return h('div.preview-wrap', {}, championPreview.mount(), p ? this.skinPicker(c, skin) : null);
  }

  skinPicker(c, shown) {
    const p = this.profile, eq = equippedSkin(p, c.id);
    const sw = (id, name, tint, price) => {
      const owned = ownsSkin(p, c.id, id);
      return h(`button.skin-sw${shown === id ? '.active' : ''}${owned ? '' : '.locked'}`, {
        title: `${name}${owned ? '' : ` (${price} shards)`}`,
        onclick: () => { this.previewSkin = { champ: c.id, skin: id }; this.renderCenter(); },
      }, h('i', { style: { background: tint ? `#${tint.toString(16).padStart(6, '0')}` : 'linear-gradient(135deg,#d6c7a1,#6b5a3e)' } }), h('span', { text: name }), id === eq ? h('b.sw-eq', { text: '✓' }) : null);
    };
    const s = SKINS[shown], owned = ownsSkin(p, c.id, shown);
    return h('div.skins', {},
      h('div.skin-row', {}, sw('base', 'Classic', null, 0), ...Object.entries(SKINS).map(([id, d]) => sw(id, d.name, d.tint, d.price))),
      shown === eq ? h('div.skin-note.muted', { text: 'Equipped' })
        : owned ? h('button.btn.btn-sm.btn-primary', { onclick: () => this.app.send({ t: 'skin', op: 'equip', champ: c.id, skin: shown }) }, 'Equip')
        : h('button.btn.btn-sm.btn-primary', { disabled: (p.shards || 0) < s.price, onclick: () => this.app.send({ t: 'skin', op: 'buy', champ: c.id, skin: shown }) }, `Unlock for 💠 ${s.price}${(p.shards || 0) < s.price ? ' (not enough shards)' : ''}`));
  }

  lbView() {
    const kinds = [['rating', 'Rating'], ['wins', 'Wins'], ['level', 'Level'], ['kills', 'Kills']];
    return h('div.card', {},
      h('div.tabs.small', {}, ...kinds.map(([k, l]) => h(`button.tab${this.lbKind === k ? '.active' : ''}`, { onclick: () => { this.lbKind = k; this.app.send({ t: 'lb', kind: k }); this.renderCenter(); } }, l))),
      this.lb && this.lb.kind === this.lbKind ? h('table.lb-table', {}, h('tr', {}, h('th', { text: '#' }), h('th', { text: 'Player' }), h('th', { text: 'Level' }), h('th', { text: 'Rating' }), h('th', { text: 'W / L' })),
        ...this.lb.rows.map((r, i) => h(`tr${r.name === this.app.name ? '.me' : ''}`, {}, h('td', { text: i + 1 }), h('td.lb-name', {}, h('span.lb-av', {}, pic(r.avatar || 'portrait/minion_melee_blue', '👤')), r.name), h('td', { text: r.level }), h('td.lb-rating', {}, h('span.lb-tier', { title: tierOf(r.rating).label }, pic(`misc/tier_${tierOf(r.rating).id}`, '')), String(r.rating)), h('td', { text: `${r.wins} / ${r.losses}` }))))
        : h('p.muted', { text: 'Loading…' }));
  }

  profileView() {
    const p = this.profile;
    if (!p) return h('p', { text: 'Loading…' });
    const champs = Object.entries(p.champs).sort((a, b) => b[1].games - a[1].games);
    const stat = (l, v) => h('div.stat-row', {}, h('span.stat-l', {}, l), h('b', { text: v }));
    return h('div.home-grid', {},
      h('div.card', {}, h('h4', { text: p.name }), stat('Level', p.level), stat('Rating', p.rating), stat('Games', p.games), stat('Wins / Losses', `${p.wins} / ${p.losses}`),
        stat('Win rate', p.games ? `${Math.round(p.wins / p.games * 100)}%` : '—'), stat('Avg KDA', p.games ? `${(p.kills / p.games).toFixed(1)} / ${(p.deaths / p.games).toFixed(1)} / ${(p.assists / p.games).toFixed(1)}` : '—'),
        h('h4', { text: 'Champions' }), ...champs.slice(0, 6).map(([id, s]) => stat(h('span.stat-champ', {}, h('span.hr-icon', {}, pic(champKey(id), this.app.champInfo[id]?.icon || '')), this.app.champInfo[id]?.name || id), `${s.games} games · ${Math.round(s.wins / s.games * 100)}% WR`))),
      this.rankView(p),
      this.accountView(p),
      this.avatarsView(p),
      h('div.card', {}, h('h4', { text: 'Match history' }), p.history.length ? h('div.history', {}, ...p.history.map(m => this.historyRow(m))) : h('p.muted', { text: 'No matches yet.' })));
  }

  /** Email for recovery and linked Google/Discord sign-in (online accounts only). */
  accountView(p) {
    const app = this.app;
    if (app.offline || p.name !== app.name || !app.token) return null;
    const card = h('div.card.account', {}, h('h4', { text: 'Account' }), h('p.muted', { text: 'Loading…' }));
    const auth = { Authorization: `Bearer ${app.token}` };
    fetch('/api/account', { headers: auth }).then(r => r.json()).then(acc => {
      const input = h('input', { type: 'email', value: acc.email || '', placeholder: 'you@example.com', maxlength: 254 });
      const msg = h('p.muted.acc-msg');
      const save = async () => {
        const r = await fetch('/api/account/email', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: input.value.trim() }) });
        const d = await r.json();
        msg.textContent = r.ok ? (d.email ? 'Saved: you can now reset your password by email.' : 'Email removed.') : d.error;
      };
      const providers = app.providers || {};
      const link = prov => acc.linked.includes(prov) ? h('span.acc-linked', { text: `✓ ${prov[0].toUpperCase()}${prov.slice(1)} linked` })
        : providers[prov] ? h('a.btn.btn-sm.btn-oauth', { href: `/api/auth/oauth/${prov}/start?link=${encodeURIComponent(app.token)}` }, `Link ${prov[0].toUpperCase()}${prov.slice(1)}`) : null;
      card.replaceChildren(h('h4', { text: 'Account' }),
        h('label.field', {}, h('span', { text: 'Email (for password recovery)' }), h('div.invite-row', {}, input, h('button.btn.btn-sm', { onclick: save }, 'Save'))), msg,
        h('div.acc-links', {}, link('google'), link('discord')));
    }).catch(() => { card.lastChild.textContent = 'Could not load account settings.'; });
    return card;
  }

  rankView(p) {
    const t = tierOf(p.rating), peak = tierOf(p.peakRating || p.rating), s = seasonOf();
    return h('div.card.rank-card', {}, h('h4', { text: `Season ${s.number} rank` }),
      h('div.rk-main', {}, h('span.rk-ic', {}, pic(`misc/tier_${t.id}`, '🏆')),
        h('div', {}, h('div.rk-label', { text: t.label, style: { color: t.color } }), h('div.muted', { text: `${p.rating} rating · peak ${peak.label} · ${p.seasonGames || 0} ranked games` }),
          h('div.rl-bar', {}, h('i', { style: { width: `${t.progress * 100}%`, background: t.color } })))),
      (p.seasonHistory || []).length ? h('div.rk-hist', {}, ...p.seasonHistory.map(x => h('span.rk-h', { title: `${x.games} games` }, h('span.rk-hic', {}, pic(`misc/tier_${x.tier}`, '🏆')), `${x.season}: ${x.peak}`))) : h('p.muted', { text: 'Play 5 ranked games in a season to earn its reward when it ends (more shards for higher peaks).' }));
  }

  avatarsView(p) {
    if (p.name !== this.app.name) return null;
    const cur = avatarOf(p);
    return h('div.card.avatars', {}, h('h4', { text: 'Profile picture' }),
      h('div.av-grid', {}, ...AVATARS.map(a => {
        const open = avatarUnlocked(p, a.id);
        return h(`button.av${cur === a.id ? '.active' : ''}${open ? '' : '.locked'}`, { title: open ? 'Use this picture' : a.need, disabled: !open, onclick: () => this.app.send({ t: 'avatar', id: a.id }) },
          pic(a.id, '👤'), open ? null : h('span.av-lock', { text: '🔒' }));
      })));
  }

  roomView(room) {
    const app = this.app;
    const host = room.host === app.name;
    const slot = (team, s, i) => h(`div.room-slot.${team}${s ? '' : '.empty'}`, {},
      s ? h('span', { text: s.bot ? '🤖 Bot' : `👤 ${s.name}` }) : h('span.muted', { text: 'Open' }),
      host && (!s || s.bot) ? h('button.btn.btn-sm', { onclick: () => app.send({ t: 'room', op: 'bot', team, slot: i }) }, s ? 'Remove' : '+ Bot') : null);
    const diff = h('select', { disabled: !host }, ...['easy', 'normal', 'hard'].map(v => h('option', { value: v, text: `${v[0].toUpperCase()}${v.slice(1)} bots` })));
    diff.value = room.difficulty;
    diff.addEventListener('change', () => app.send({ t: 'room', op: 'difficulty', difficulty: diff.value }));
    return h('div.card.room', {},
      h('div.room-head', {}, h('h3', { text: 'Custom Game' }), h('div.room-code', {}, 'Room code ', h('b', { text: room.code })), h('span.muted', { text: `Host: ${room.host}` })),
      h('div.room-teams', {},
        h('div', {}, h('h4.t-blue', { text: 'Blue team' }), ...room.blue.map((s, i) => slot('blue', s, i)), h('button.btn.btn-sm', { onclick: () => app.send({ t: 'room', op: 'team', team: 'blue' }) }, 'Join Blue')),
        h('div', {}, h('h4.t-red', { text: 'Red team' }), ...room.red.map((s, i) => slot('red', s, i)), h('button.btn.btn-sm', { onclick: () => app.send({ t: 'room', op: 'team', team: 'red' }) }, 'Join Red'))),
      h('div.btn-row', {}, diff,
        host ? h('button.btn', { onclick: () => app.send({ t: 'room', op: 'fill' }) }, 'Fill with bots') : null,
        host ? h('button.btn.btn-primary', { onclick: () => app.send({ t: 'room', op: 'start' }) }, 'Start Game') : h('span.muted', { text: 'Waiting for the host to start…' }),
        h('button.btn.btn-danger', { onclick: () => app.send({ t: 'room', op: 'leave' }) }, 'Leave')));
  }

  /* ---------------- side ---------------- */
  setParty(p) { this.party = p; this.renderParty(); }
  setFriends(m) { this.friends = m; this.renderFriends(); }

  renderFriends() {
    const app = this.app, f = this.friends;
    clear(this.friendsEl);
    if (app.offline) return;
    const add = h('input', { placeholder: 'Add a friend by name', maxlength: 16 });
    const send = () => { if (add.value.trim()) app.send({ t: 'friend', op: 'add', name: add.value.trim() }); add.value = ''; };
    add.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
    const list = f ? f.list : [];
    const online = list.filter(x => x.online).length;
    put(this.friendsEl, h('h4', { text: `🤝 Friends${list.length ? ` (${online}/${list.length} online)` : ''}` }),
      ...(f ? f.reqs : []).map(n => h('div.fr-req', {}, h('span', {}, h('b', { text: n }), ' wants to be friends'),
        h('button.btn.btn-sm.btn-primary', { onclick: () => app.send({ t: 'friend', op: 'accept', name: n }) }, 'Accept'),
        h('button.btn.btn-sm', { onclick: () => app.send({ t: 'friend', op: 'decline', name: n }) }, '✕'))),
      list.length ? h('div.fr-list', {}, ...list.map(x => h(`div.fr-row${x.online ? '.on' : ''}`, {},
        h('span.fr-av', {}, pic(x.avatar || 'portrait/minion_melee_blue', '👤'), h('i.fr-dot')),
        h('div.fr-mid', {}, h('b', { text: x.name }), h('small.muted', { text: x.online ? (x.match ? 'In a match' : x.state === 'queue' ? 'In queue' : x.state === 'select' ? 'Picking a champion' : 'In the lobby') + (x.level ? ` · Lv ${x.level}` : '') : 'Offline' })),
        x.match ? h('button.btn.btn-sm', { title: 'Watch their match', onclick: () => app.send({ t: 'spectate', id: x.match }) }, '👁') : null,
        x.online && !x.match && !x.party ? h('button.btn.btn-sm', { title: 'Invite to party', onclick: () => app.send({ t: 'party', op: 'invite', name: x.name }) }, '➕') : null,
        h('button.btn.btn-sm.fr-rm', { title: 'Remove friend', onclick: () => { if (confirm(`Remove ${x.name} from your friends?`)) app.send({ t: 'friend', op: 'remove', name: x.name }); } }, '✕')))) : h('p.muted', { text: 'Add friends to see when they are online, invite them and watch their games.' }),
      h('div.invite-row', {}, add, h('button.btn.btn-sm', { onclick: send }, 'Add')));
  }
  setWho(w) { this.who = w; this.renderParty(); }
  setLeaderboard(lb) { this.lb = lb; if (this.tab === 'leaderboard') this.renderCenter(); }

  renderParty() {
    const app = this.app, p = this.party;
    clear(this.partyEl);
    const inv = h('input', { placeholder: 'Invite player', maxlength: 16 });
    put(this.partyEl,h('h4', { text: `👥 Party${p ? ` (${p.members.length}/5)` : ''}` }),
      p ? h('div', {}, ...p.members.map(m => h('div.party-row', {}, h('span', { text: `${p.leader === m.name ? '👑 ' : ''}${m.name}` }), h('small.muted', { text: m.online ? m.state : 'offline' }),
        p.leader === app.name && m.name !== app.name ? h('button.btn.btn-sm', { onclick: () => app.send({ t: 'party', op: 'kick', name: m.name }) }, '✕') : null)),
        h('button.btn.btn-sm', { onclick: () => app.send({ t: 'party', op: 'leave' }) }, 'Leave party')) : h('p.muted', { text: 'Queue together with friends — invite them by name.' }),
      app.offline ? null : h('div.invite-row', {}, inv, h('button.btn.btn-sm', { onclick: () => { if (inv.value.trim()) app.send({ t: 'party', op: 'invite', name: inv.value.trim() }); inv.value = ''; } }, 'Invite')));
    clear(this.whoEl);
    if (app.offline) return;
    put(this.whoEl,h('h4', {}, `🌐 Online (${this.who ? this.who.total : '…'}) `, h('button.btn.btn-sm', { onclick: () => app.send({ t: 'who' }) }, '↻')),
      h('div.who-list', {}, ...(this.who ? this.who.list : []).map(w => h('div.who-row', {}, h('span', { text: w.name }), h('small.muted', { text: `${w.rating} · ${w.state}` }),
        w.name !== app.name && !w.party ? h('button.btn.btn-sm', { title: 'Invite to party', onclick: () => app.send({ t: 'party', op: 'invite', name: w.name }) }, '➕') : null,
        w.name !== app.name && !(this.friends?.list || []).some(f => f.name === w.name) ? h('button.btn.btn-sm', { title: 'Add friend', onclick: () => app.send({ t: 'friend', op: 'add', name: w.name }) }, '🤝') : null))));
  }
}

/** append() that skips null/false children (native append would render "null"). */
function put(el, ...kids) { el.append(...kids.filter(k => k !== null && k !== undefined && k !== false)); }

const LANE_NAME = { top: 'Top', jungle: 'Jungle', mid: 'Mid', bot: 'Bot lane', support: 'Support' };

export function championDetail(c) {
  const s = c.base;
  return h('div.champ-detail', { style: { '--c': '#' + c.color.toString(16).padStart(6, '0'), '--a': '#' + c.accent.toString(16).padStart(6, '0') } },
    h('div.cd-splash', { style: { backgroundImage: `url(${import.meta.env.BASE_URL || '/'}splash/${c.id}.webp)` } }),
    h('div.cd-head', {}, h('div.cd-icon', {}, pic(champKey(c.id), c.icon)), h('div', {}, h('h3', { text: c.name }), h('div.cd-title', { text: c.title }), h('div.cd-role', { text: `${ROLE_ICON[c.role] || ''} ${c.role} · ${c.ranged ? 'Ranged' : 'Melee'} · ${c.roles.map(r => LANE_NAME[r] || r).join(' / ')}` }))),
    h('div.cd-stats', { text: `HP ${s.hp} · Mana ${s.mp} · AD ${s.ad} · Armor ${s.armor} · AS ${s.as} · Range ${c.range}` }),
    h('div.cd-abil', {}, h('div.cd-ai', {}, pic(`passive/${c.id}`, '◆')), h('div', {}, h('b', { text: `Passive — ${c.passive.name}` }), h('p', { text: c.passive.desc }))),
    ...['q', 'w', 'e', 'r'].map(k => { const a = c.abilities[k]; return h('div.cd-abil', {}, h('div.cd-ai', {}, pic(abilityKey(c.id, k), a.icon)), h('div', {}, h('b', { text: `${k.toUpperCase()} — ${a.name}` }), h('small.muted', { text: ` ${a.cd[0]}s${a.mana[0] ? ` · ${a.mana[0]} mana` : ''}` }), h('p', { text: a.desc }))); }));
}
