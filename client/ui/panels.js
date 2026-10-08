/* In-match panels: shop, scoreboard, settings, help, end-of-game. */
import { langPicker } from '../i18n.js';
import { packSetting } from './packOffer.js';
import { portalAds, portalRewarded } from '../portal.js';
import { h, $, clear, timeStr } from './dom.js';
import { priceFor } from '../../shared/moba/items.js';
import { CHAMPIONS } from '../../shared/moba/champions.js';
import { sfx } from '../audio/sfx.js';
import { pic, champKey } from './icons.js';
import { QUESTS } from '../../shared/moba/progression.js';
import { share } from './share.js';
import { isMuted, toggleMute, openReport } from './social.js';

const CATS = [['rec', '⭐ Recommended'], ['basic', 'Basic'], ['boots', 'Boots'], ['attack', 'Attack'], ['magic', 'Magic'], ['defense', 'Defense'], ['consumable', 'Consumables']];
const STAT = { ad: 'Attack Damage', ap: 'Ability Power', hp: 'Health', mp: 'Mana', armor: 'Armor', mr: 'Magic Resist', as: '% Attack Speed', crit: '% Crit Chance', ms: 'Move Speed', msPct: '% Move Speed', haste: 'Haste', lifesteal: '% Lifesteal', armorPen: '% Armor Pen', magicPen: 'Magic Pen', magicPenPct: '% Magic Pen', hpRegen: 'HP Regen /s', mpRegen: 'Mana Regen /s', tenacity: '% Tenacity' };

export class Panels {
  constructor(game) {
    this.game = game;
    this.root = $('#panels');
    this.current = null;
    this.shopCat = 'rec';
    this.selectedItem = null;
  }

  isOpen(n) { return this.current === n; }
  toggle(n) { if (this.current === n) this.close(); else this.open(n); }
  open(n) {
    if (this.current === n) return; // already open (e.g. Tab held down and repeating)
    sfx.play('ui_open', { gap: 0.1 });
    this.current = n;
    this.render();
  }
  close() { if (this.current) sfx.play('ui_close', { gap: 0.1 }); this.current = null; clear(this.root); this.game.ui.hideTip(); }
  refresh(names) { if (this.current && (!names || names.includes(this.current))) this.render(); }

  render() {
    const fn = this[`render_${this.current}`];
    if (!fn) return;
    const body = this.root.querySelector('.panel-body');
    const scroll = body ? body.scrollTop : 0;
    const { title, content, wide } = fn.call(this);
    // Same panel already showing (live updates such as the scoreboard every second): swap its
    // contents in place, so it doesn't replay the open animation and flicker.
    const existing = this.root.querySelector(`.panel.panel-${this.current}`);
    if (existing && body) {
      existing.classList.toggle('wide', !!wide);
      existing.querySelector('.panel-head h3').textContent = title;
      body.replaceChildren(content);
      body.scrollTop = scroll;
      return;
    }
    clear(this.root);
    const panel = h(`div.panel.panel-${this.current}${wide ? '.wide' : ''}`, {},
      h('div.panel-head', {}, h('h3', { text: title }), h('button.panel-close', { onclick: () => this.close(), 'aria-label': 'Close' }, '✕')),
      h('div.panel-body', {}, content));
    this.root.append(panel);
    panel.querySelector('.panel-body').scrollTop = scroll;
  }

  itemTooltip(id, owned = false) {
    const d = this.game.data.items[id];
    const me = this.game.world.me;
    const price = me && !owned ? priceFor(id, me.it).price : d.cost;
    return h('div.item-tip', {},
      h('div.tip-title', {}, h('span.tip-ic', {}, pic(`item/${id}`, d.icon)), d.name),
      h('div.tip-sub', { text: owned ? `Sells for ${Math.floor(d.cost * 0.7)} gold` : `Cost ${price} gold${price !== d.cost ? ` (total ${d.cost})` : ''}` }),
      ...Object.entries(d.stats).map(([k, v]) => h('div.tip-stat', { text: `+${k === 'ms' ? Math.round(v * 70) : v} ${STAT[k] || k}` })),
      d.passive ? h('div.tip-desc', { text: d.passive }) : null,
      d.desc ? h('div.tip-desc', { text: d.desc }) : null,
      d.from ? h('div.tip-hint', { text: `Builds from: ${d.from.map(f => this.game.data.items[f].name).join(', ')}` }) : null);
  }

  render_shop() {
    const g = this.game, me = g.world.me;
    const items = g.data.items;
    const champ = CHAMPIONS[g.myChampId()];
    const rec = champ ? ['potion', ...champ.bot.build] : [];
    const list = Object.entries(items).filter(([id, d]) => this.shopCat === 'rec' ? rec.includes(id) : d.cat === this.shopCat);
    if (this.shopCat === 'rec') list.sort((a, b) => rec.indexOf(a[0]) - rec.indexOf(b[0]));
    const canShop = me && me.shop;
    const tabs = h('div.tabs.small.wrap', {}, ...CATS.map(([id, label]) => h(`button.tab${this.shopCat === id ? '.active' : ''}`, { onclick: () => { this.shopCat = id; this.render(); } }, label)));
    const grid = h('div.shop-grid2', {}, ...list.map(([id, d]) => {
      const price = me ? priceFor(id, me.it).price : d.cost;
      const affordable = me && me.g >= price;
      return h(`div.shop-card${affordable ? '' : '.poor'}${this.selectedItem === id ? '.sel' : ''}`, {
        onclick: () => { this.selectedItem = id; this.render(); },
        ondblclick: () => g.send({ t: 'buy', item: id }),
        oncontextmenu: ev => { ev.preventDefault(); g.send({ t: 'buy', item: id }); },
        onmouseenter: ev => g.ui.showTip(ev.currentTarget, this.itemTooltip(id)),
        onmouseleave: () => g.ui.hideTip(),
      }, this.shopCat === 'rec' ? h(`div.sc-step${me && me.it.some(it => it && it.id === id) ? '.owned' : ''}`, { text: me && me.it.some(it => it && it.id === id) ? '✓' : rec.indexOf(id) || '•' }) : null,
      h('div.sc-icon', {}, pic(`item/${id}`, d.icon)), h('div.sc-name', { text: d.name }), h('div.sc-price', { text: `🪙 ${price}` }));
    }));
    const sel = this.selectedItem && items[this.selectedItem];
    const detail = sel ? h('div.shop-detail', {},
      this.itemTooltip(this.selectedItem),
      sel.from ? h('div.build-path', {}, ...sel.from.map(f => h('div.bp-item', { title: items[f].name, onclick: () => { this.selectedItem = f; this.render(); } }, pic(`item/${f}`, items[f].icon)))) : null,
      h('button.btn.btn-primary', { disabled: !canShop || me.g < priceFor(this.selectedItem, me.it).price, onclick: () => g.send({ t: 'buy', item: this.selectedItem }) }, canShop ? `Buy (${priceFor(this.selectedItem, me.it).price})` : 'Return to base to shop'))
      : h('p.muted', { text: 'Select an item. Double-click or right-click to buy instantly.' });
    const inv = h('div.shop-inv', {}, ...(me ? me.it : []).map((it, i) => h(`div.mb-item${it ? '' : '.empty'}`, {
      title: it ? `${items[it.id].name} — click to sell for ${Math.floor(items[it.id].cost * 0.7 * (it.n || 1))}` : '',
      onclick: () => { if (it && canShop) g.send({ t: 'sell', slot: i }); },
    }, h('span.mb-iic', {}, it ? pic(`item/${it.id}`, items[it.id].icon) : ''), h('span.mb-in', { text: it && it.n > 1 ? it.n : '' }))));
    return {
      title: `🛒 Shop · 🪙 ${me ? me.g : 0}${canShop ? '' : ' · (shop only at your base or while dead)'}`,
      wide: true,
      content: h('div.shop-layout', {}, h('div', {}, tabs, grid), h('div', {}, detail, h('h4', { text: 'Your items (click to sell)' }), inv)),
    };
  }

  render_score() {
    const g = this.game, sc = g.world.score;
    if (!sc) return { title: 'Scoreboard', content: h('p', { text: 'Loading…' }) };
    const table = team => h('table.sb-table', {},
      h('tr', {}, h('th', { text: '' }), h('th', { text: 'Player' }), h('th', { text: 'Lv' }), h('th', { text: 'K / D / A' }), h('th', { text: 'CS' }), h('th', { text: 'Items' })),
      ...sc.players.filter(p => p.tm === team).map(p => h(`tr${p.id === g.world.youId ? '.me' : ''}${p.dead ? '.dead' : ''}`, {},
        h('td.sb-c', {}, h('span.sb-pic', {}, pic(champKey(p.c), g.champInfo[p.c]?.icon || '?'))),
        h('td', {}, `${p.name}${p.bot ? ' 🤖' : ''}`, p.dead ? h('small', { text: ` (${p.rs}s)` }) : null,
          !p.bot && p.id !== g.world.youId ? h('span.sb-act', {},
            h('button.btn.btn-xs', { title: isMuted(p.name) ? 'Unmute' : 'Mute chat', onclick: () => { g.ui.toast(toggleMute(p.name) ? `${p.name} muted` : `${p.name} unmuted`); this.render(); } }, isMuted(p.name) ? '🔇' : '🔈'),
            h('button.btn.btn-xs', { title: 'Report', onclick: () => openReport(g.ui, m => g.send(m), p.name, g.match.id) }, '🚩')) : null),
        h('td', { text: p.l }), h('td', { text: `${p.k} / ${p.d} / ${p.a}` }), h('td', { text: p.cs }),
        h('td.sb-items', {}, ...p.it.map(i => h('span.sb-item', {}, i ? pic(`item/${i}`, g.data.items[i].icon) : ''))))));
    return {
      title: `📊 ${timeStr(sc.time)} · Blue ${sc.kills.blue} – ${sc.kills.red} Red`,
      wide: true,
      content: h('div', {}, h('h4.t-blue', { text: `Blue team · 🏰 ${sc.towers.blue} · 🐉 ${sc.wyrms.blue} · 👾 ${sc.titans.blue}` }), table('blue'), h('h4.t-red', { text: `Red team · 🏰 ${sc.towers.red} · 🐉 ${sc.wyrms.red} · 👾 ${sc.titans.red}` }), table('red')),
    };
  }

  render_settings() {
    const g = this.game, s = g.settings;
    const quality = h('select', {}, ...['low', 'medium', 'high'].map(q => h('option', { value: q, text: q[0].toUpperCase() + q.slice(1) })));
    quality.value = s.quality;
    quality.addEventListener('change', () => g.setSetting('quality', quality.value));
    const vol = h('input', { type: 'range', min: 0, max: 100, value: Math.round(s.volume * 100) });
    vol.addEventListener('input', () => g.setSetting('volume', vol.value / 100));
    const music = h('input', { type: 'range', min: 0, max: 100, value: Math.round((s.musicVolume ?? 0.4) * 100) });
    music.addEventListener('input', () => g.setSetting('musicVolume', music.value / 100));
    const fps = h('input', { type: 'checkbox', checked: s.showFps });
    fps.addEventListener('change', () => g.setSetting('showFps', fps.checked));
    const autoLvl = h('input', { type: 'checkbox', checked: s.autoLevel ?? g.input.isTouch });
    autoLvl.addEventListener('change', () => g.setSetting('autoLevel', autoLvl.checked));
    const models = h('input', { type: 'checkbox', checked: s.models !== false });
    models.addEventListener('change', () => g.setSetting('models', models.checked));
    const lock = h('input', { type: 'checkbox', checked: g.renderer.locked });
    lock.addEventListener('change', () => g.toggleLock(lock.checked));
    return {
      title: '⚙️ Settings',
      content: h('div', {},
        h('label.field', {}, h('span', { text: 'Graphics quality' }), quality),
        h('label.field', {}, h('span', { text: 'Language (reloads the page)' }), langPicker()),
        g.input.isTouch ? null : (() => {
          const sel = h('select', {}, ...[['release', 'Show the aim, cast when you release the key'], ['quick', 'Quick cast (instantly at the cursor)'], ['confirm', 'Show the aim, click to cast']].map(([v, t]) => h('option', { value: v, text: t })));
          sel.value = g.castMode();
          sel.addEventListener('change', () => g.setSetting('castMode', sel.value));
          return h('label.field', {}, h('span', { text: 'Ability casting' }), sel);
        })(),
        h('label.field', {}, h('span', { text: 'Master volume' }), vol),
        h('label.field', {}, h('span', { text: 'Music & ambience volume' }), music),
        h('label.field.row', {}, lock, h('span', { text: 'Lock camera to champion (Y)' })),
        h('label.field.row', {}, fps, h('span', { text: 'Show FPS & ping' })),
        h('label.field.row', {}, autoLvl, h('span', { text: 'Auto-level abilities (ultimate first)' })),
        typeof Notification !== 'undefined' && Notification.permission === 'default' ? h('button.btn.btn-sm', { onclick: ev => { Notification.requestPermission(); ev.currentTarget.remove(); } }, '🔔 Enable notifications (match found, invites)') : null,
        h('label.field.row', {}, models, h('span', { text: 'Detailed 3D models (turn off on slow devices; applies next match)' })),
        packSetting(g.ui),
        h('div.btn-row', {},
          h('button.btn', { onclick: () => this.open('help') }, '❔ Controls'),
          h('button.btn', { onclick: () => g.send({ t: 'ff', yes: true }) }, '🏳️ Vote surrender'),
          h('button.btn.btn-danger', { onclick: () => g.quit() }, 'Leave match')),
        h('p.muted', { text: 'If you leave, a bot keeps playing your champion. You can reconnect from the lobby while the match is running.' })),
    };
  }

  render_help() {
    const row = (k, v) => h('tr', {}, h('td', {}, h('kbd', { text: k })), h('td', { text: v }));
    return {
      title: '❔ Controls',
      content: h('div', {}, h('table.keys', {},
        row('Right click', 'Move / attack target (hold to keep moving)'), row('A + cursor', 'Attack-move'), row('S', 'Stop'),
        row('Q W E R', 'Cast at cursor (quick cast)'), row('Ctrl + Q/W/E/R', 'Level up ability'), row('D · F', 'Battle spells'),
        row('1 – 6', 'Use item (potions)'), row('T', 'Place ward at cursor'), row('B', 'Return to base'), row('P', 'Shop'),
        row('Tab (hold)', 'Scoreboard'), row('Space (hold)', 'Center camera'), row('Y', 'Lock / unlock camera'), row('Arrow keys', 'Move directly'),
        row('V / Alt + drag', 'Ping wheel'), row('Enter', 'Team chat (/all for all chat)'), row('Wheel', 'Zoom'), row('Esc', 'Settings')),
        h('h4', { text: 'How to win' }),
        h('p', { text: 'Destroy the enemy Core. Push lanes with your minions: towers must fall in order (outer → inner → spire tower → spire), then the two Core towers. Destroying a spire spawns juggernaut minions. Last-hit minions for gold, kill jungle camps, and slay the Ember Wyrm (permanent team damage) and the Abyss Titan (empowers your minions).' })),
    };
  }

  /** Guests: save the account right after a match, when there's progress worth keeping. */
  guestSave() {
    const app = this.game.app;
    if (!app.isGuest || app.offline || this.game.match.replay) return null;
    return h('div.guest-end', {}, h('span', { text: '💾 Keep this progress: save your account.' }), h('button.btn.btn-primary.btn-sm', { type: 'button', onclick: () => app.claimAccount() }, 'Save my account'));
  }

  /** Game portals: watch an ad for shards (server caps it at 5 a day). */
  adReward() {
    if (!portalAds() || this.game.match.replay) return null;
    const btn = h('button.btn.btn-sm', { type: 'button' }, '📺 Watch an ad: +50 shards');
    btn.addEventListener('click', async () => { btn.disabled = true; if (await portalRewarded()) this.game.send({ t: 'adReward' }); btn.remove(); });
    return btn;
  }

  replayButtons() {
    const g = this.game, rep = g.app.lastReplay;
    if (g.match.replay) return null;
    if (!rep) return h('p.muted.rep-wait', { text: 'Saving the replay…' });
    const best = [...(rep.highlights || [])].sort((a, b) => b.score - a.score)[0];
    return h('div.btn-row.rep-btns', {},
      h('button.btn', { onclick: () => { g.quit(); g.app.watchReplay(rep.id, best ? Math.max(0, best.t - 6) : 0); } }, '▶ Watch replay'),
      best ? h('button.btn', { onclick: () => share(g.ui, { id: rep.id, t: best.t - 6, text: `${best.label} on BroadRoads!` }) }, `🔗 Share: ${best.label}`)
        : h('button.btn', { onclick: () => share(g.ui, { id: rep.id, t: 0, text: 'Watch my BroadRoads match!' }) }, '🔗 Share replay'));
  }

  render_end() {
    const g = this.game, r = g.endResult;
    if (!r) return { title: '', content: h('div') };
    const res = r.result;
    const watching = r.spectator || g.spectating;
    const win = res.winner === g.world.team;
    const table = team => h('table.sb-table', {},
      h('tr', {}, h('th', { text: '' }), h('th', { text: 'Player' }), h('th', { text: 'K / D / A' }), h('th', { text: 'CS' }), h('th', { text: 'Gold' }), h('th', { text: 'Damage' }), h('th', { text: 'Items' })),
      ...res.players.filter(p => p.team === team).map(p => h(`tr${p.id === r.you ? '.me' : ''}`, {},
        h('td.sb-c', {}, h('span.sb-pic', {}, pic(champKey(p.champ), g.champInfo[p.champ]?.icon || '?'))), h('td', {}, p.name, p.id === res.mvp ? h('span.mvp', { text: ' MVP' }) : null),
        h('td', { text: `${p.kills} / ${p.deaths} / ${p.assists}` }), h('td', { text: p.cs }), h('td', { text: p.gold }), h('td', { text: p.dmg }),
        h('td.sb-items', {}, ...p.items.map(i => h('span.sb-item', {}, i ? pic(`item/${i}`, g.data.items[i].icon) : ''))))));
    return {
      title: watching ? `${res.winner === 'blue' ? 'Blue' : 'Red'} team wins · ${timeStr(res.duration)}` : `${win ? 'Victory' : 'Defeat'} · ${timeStr(res.duration)}`,
      wide: true,
      content: h('div.result', {},
        watching ? h('h2.win', { text: `${res.winner === 'blue' ? 'BLUE' : 'RED'} TEAM WINS` }) : h(`h2.${win ? 'win' : 'loss'}`, { text: win ? 'VICTORY' : 'DEFEAT' }),
        r.bonus && r.bonus.firstWin ? h('div.first-win', {}, pic('misc/firstwin', '☀️'), h('b', { text: 'First win of the day!' }), ' +100 💠 +200 XP') : null,
        watching ? null : h('p', {}, `+${r.xp} XP`, r.rated ? ` · Rating ${(r.bonus?.delta ?? r.delta) >= 0 ? '+' : ''}${r.bonus?.delta ?? r.delta} (${r.profile.rating})${r.bonus?.placement ? ` · Placement ${r.bonus.placement}/5` : ''}` : ' · Unranked'),
        r.profile && r.profile.quests ? h('div.end-quests', {}, ...r.profile.quests.list.map(q => { const d = QUESTS[q.id]; return d ? h(`span.eq${q.n >= d.goal ? '.done' : ''}`, { text: `${q.n >= d.goal ? '✓' : '📜'} ${d.text}: ${Math.min(q.n, d.goal).toLocaleString()}/${d.goal.toLocaleString()}` }) : null; }), h('span.eq.sh', { text: `💠 ${r.profile.shards} shards` })) : null,
        this.replayButtons(), this.guestSave(), this.adReward(),
        h('h4.t-blue', { text: 'Blue team' }), table('blue'), h('h4.t-red', { text: 'Red team' }), table('red'),
        h('button.btn.btn-primary', { onclick: () => g.quit() }, 'Return to lobby')),
    };
  }
}
