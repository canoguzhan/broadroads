/* Modal panels: inventory, character, NPC services, social, leaderboards, settings. */
import { h, $, clear, fmt } from './dom.js';
import { ABILITIES, ARCHETYPES, CLASS_IDS, GEAR_SLOTS, SLOTS, abilityInfo, computeStats, seasonalClass, xpToNext, MAX_LEVEL } from '../../shared/classes.js';
import { RARITIES, STAT_NAMES, MATERIALS, MATERIAL_IDS, INVENTORY_SIZE, recipeKey, sellPrice, itemScore } from '../../shared/items.js';
import { ARENA_MODES } from '../../shared/sim/arena.js';
import { CLASS_ICON } from './hud.js';

const SLOT_LABEL = { weapon: 'Weapon', armor: 'Armor', boots: 'Boots', relic: 'Relic' };
const SLOT_ICON = { weapon: '🗡️', armor: '🛡️', boots: '🥾', relic: '💍' };
const PCT = new Set(['crit', 'speed', 'cdr', 'lifesteal']);
const LB_KINDS = [['level', 'Level'], ['floor', 'Deepest Floor'], ['duel', 'Duel Rating'], ['team', 'Team Rating'], ['ffa', 'FFA Rating'], ['kills', 'Monster Kills']];

export function statLine(k, v) {
  const val = PCT.has(k) ? `${v}%` : k === 'regen' ? `${v}/s` : v;
  return `+${val} ${STAT_NAMES[k].replace('% ', '')}`;
}

export function itemTooltip(item, char, extra) {
  const r = RARITIES[item.rarity] || RARITIES.common;
  const req = Math.max(1, item.ilvl - 3);
  const eq = char && char.equipment[item.slot];
  const lines = Object.entries(item.stats).map(([k, v]) => {
    const cmp = eq && eq !== item ? v - (eq.stats[k] || 0) : 0;
    return h('div.tip-stat', {}, statLine(k, v), cmp ? h(`span.${cmp > 0 ? 'up' : 'down'}`, { text: ` (${cmp > 0 ? '+' : ''}${Math.round(cmp * 10) / 10})` }) : null);
  });
  if (eq && eq !== item) {
    for (const [k, v] of Object.entries(eq.stats)) if (!(k in item.stats)) lines.push(h('div.tip-stat', {}, h('span.down', { text: `(−${v} ${STAT_NAMES[k].replace('% ', '')})` })));
  }
  const delta = eq && eq !== item ? Math.round(itemScore(item) - itemScore(eq)) : null;
  return h('div.item-tip', {},
    h('div.tip-title', { style: { color: r.color }, text: `${item.icon} ${item.name}` }),
    h('div.tip-sub', { text: `${r.name} ${SLOT_LABEL[item.slot]} · Item level ${item.ilvl}${item.crafted ? ' · Crafted' : ''}` }),
    ...lines,
    char && char.level < req ? h('div.tip-warn', { text: `Requires level ${req}` }) : null,
    delta !== null ? h(`div.tip-score.${delta >= 0 ? 'up' : 'down'}`, { text: delta >= 0 ? `▲ Upgrade (+${delta} power)` : `▼ Downgrade (${delta} power)` }) : null,
    !eq && item !== (char && char.equipment[item.slot]) ? h('div.tip-score.up', { text: '▲ Empty slot' }) : null,
    h('div.tip-value', { text: `Sells for ${sellPrice(item)} 🪙` }),
    extra ? h('div.tip-hint', { text: extra }) : null);
}

export class Panels {
  constructor(game) {
    this.game = game;
    this.root = $('#panels');
    this.current = null;
    this.data = {};
    this.state = { merchantTab: 'buy', lbKind: 'level', craftA: null, craftB: null, discardArm: null };
  }

  isOpen(name) { return this.current === name; }

  open(name, data) {
    if (data !== undefined) this.data[name] = data;
    const opening = this.current !== name;
    this.current = name;
    if (opening) {
      if (name === 'social') this.game.send({ t: 'who' });
      if (name === 'leaderboard') this.game.send({ t: 'lb', kind: this.state.lbKind });
    }
    this.render();
  }

  toggle(name) {
    if (this.current === name) return this.close();
    if (['merchant', 'blacksmith', 'dungeon', 'arena', 'trainer'].includes(name)) return this.game.send({ t: 'npc', type: name });
    this.open(name);
  }

  close() {
    this.current = null;
    clear(this.root);
    this.game.ui.hideTip();
  }

  refresh(names) {
    if (!this.current) return;
    if (names && !names.includes(this.current)) return;
    this.render();
  }

  render() {
    const name = this.current;
    const fn = this[`render_${name}`];
    if (!fn) return;
    const prevBody = this.root.querySelector('.panel-body');
    const scroll = prevBody ? prevBody.scrollTop : 0;
    const { title, body, wide } = fn.call(this);
    clear(this.root);
    const panel = h(`div.panel.panel-${name}${wide ? '.wide' : ''}`, { role: 'dialog', 'aria-label': title },
      h('div.panel-head', {}, h('h3', { text: title }), h('button.panel-close', { onclick: () => this.close(), 'aria-label': 'Close' }, '✕')),
      h('div.panel-body', {}, body));
    this.root.append(panel);
    panel.querySelector('.panel-body').scrollTop = scroll;
  }

  /* ---------- helpers ---------- */
  itemCell(item, { onClick, hint, price, extraClass = '' } = {}) {
    const g = this.game;
    if (!item) return h('div.item-cell.empty');
    const r = RARITIES[item.rarity] || RARITIES.common;
    const cell = h(`div.item-cell.r-${item.rarity}${extraClass}`, {
      style: { borderColor: r.color },
      onclick: onClick,
      onmouseenter: ev => g.ui.showTip(ev.currentTarget, itemTooltip(item, g.char, hint)),
      onmouseleave: () => g.ui.hideTip(),
    }, h('div.item-icon', { text: item.icon }), price !== undefined ? h('div.item-price', { text: `${fmt(price)}🪙` }) : null,
    g.char && g.char.level < Math.max(1, item.ilvl - 3) ? h('div.item-lock', { text: '🔒' }) : null);
    return cell;
  }

  goldLine() {
    const c = this.game.char;
    return h('div.gold-line', {}, h('span', { text: `🪙 ${fmt(c.gold)} gold` }), h('span', { text: `❤️ ${c.potions.hp}  💧 ${c.potions.mp}` }));
  }

  /* ---------- inventory ---------- */
  render_inventory() {
    const g = this.game, c = g.char;
    const equip = h('div.equip-grid', {}, ...GEAR_SLOTS.map(slot => {
      const it = c.equipment[slot];
      return h('div.equip-slot', {},
        h('div.equip-label', { text: `${SLOT_ICON[slot]} ${SLOT_LABEL[slot]}` }),
        it ? this.itemCell(it, { onClick: () => g.send({ t: 'unequip', slot }), hint: 'Click to unequip' }) : h('div.item-cell.empty', { text: SLOT_ICON[slot] }));
    }));
    const cells = [];
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const it = c.inventory[i];
      if (!it) { cells.push(h('div.item-cell.empty')); continue; }
      const armed = this.state.discardArm === it.id;
      const cell = this.itemCell(it, { onClick: () => g.send({ t: 'equip', id: it.id }), hint: 'Click to equip · Right-click to destroy', extraClass: armed ? '.armed' : '' });
      cell.addEventListener('contextmenu', ev => {
        ev.preventDefault();
        if (this.state.discardArm === it.id) { g.send({ t: 'discard', id: it.id }); this.state.discardArm = null; }
        else { this.state.discardArm = it.id; g.ui.toast('Right-click again to destroy this item.', 'warn'); this.render(); }
      });
      cells.push(cell);
    }
    const mats = h('div.mats', {}, ...MATERIAL_IDS.map(m => h('div.mat', { title: MATERIALS[m].name }, h('span', { text: MATERIALS[m].icon }), h('b', { text: c.materials[m] || 0 }), h('small', { text: MATERIALS[m].name }))));
    return {
      title: 'Inventory',
      wide: true,
      body: h('div.inv-layout', {},
        h('div.inv-left', {}, h('h4', { text: 'Equipped' }), equip, h('h4', { text: 'Refinery Materials' }), mats, this.goldLine()),
        h('div.inv-right', {}, h('h4', { text: `Backpack (${c.inventory.length}/${INVENTORY_SIZE})` }), h('div.inv-grid', {}, cells),
          h('p.muted', { text: 'Sell items at Mira the Merchant in town. Craft gear from materials at Dorran\'s refinery.' }))),
    };
  }

  /* ---------- character ---------- */
  render_character() {
    const g = this.game, c = g.char;
    const s = computeStats(c);
    const sc = seasonalClass(c.cls, g.theme);
    const stat = (label, val) => h('div.stat-row', {}, h('span', { text: label }), h('b', { text: val }));
    const abil = SLOTS.map(slot => {
      const a = abilityInfo(c.cls, slot, g.theme);
      return h('div.abil-row', {}, h('div.abil-icon', { text: a.icon }), h('div', {}, h('b', { text: `${a.name}` }), h('small', { text: ` · ${a.cd}s${a.mana ? ` · ${a.mana} mana` : ''}` }), h('p', { text: a.desc })));
    });
    return {
      title: 'Character',
      wide: true,
      body: h('div.char-layout', {},
        h('div.char-col', {},
          h('div.char-head', {}, h('div.char-portrait', { text: CLASS_ICON[c.cls] }), h('div', {}, h('h4', { text: c.name }), h('div', { text: `Level ${c.level} ${sc.name}` }), h('small.muted', { text: ARCHETYPES[c.cls].role }))),
          h('div.xp-line', { text: c.level >= MAX_LEVEL ? 'Max level reached' : `XP ${fmt(c.xp)} / ${fmt(xpToNext(c.level))}` }),
          h('h4', { text: 'Attributes' }),
          stat('Power', s.power), stat('Health', s.maxHp), stat('Mana', s.maxMp), stat('Attack', s.atk), stat('Armor', s.armor),
          stat('Critical chance', `${Math.round(s.crit * 100)}%`), stat('Move speed', s.speed.toFixed(2)), stat('Cooldown reduction', `${Math.round(s.cdr * 100)}%`),
          stat('Lifesteal', `${Math.round(s.lifesteal * 100)}%`), stat('Health regen', `${s.regen.toFixed(1)}/s`)),
        h('div.char-col', {},
          h('h4', { text: 'Abilities' }), ...abil,
          h('h4', { text: 'Records' }),
          stat('Monsters slain', fmt(c.stats.kills)), stat('Bosses slain', c.stats.bossKills), stat('Deepest floor', c.stats.deepestFloor), stat('Guardians defeated', c.stats.dungeonsCleared),
          stat('PvP W / L', `${c.pvp.wins} / ${c.pvp.losses}`), stat('PvP kills', c.stats.pvpKills),
          stat('Ratings', `Duel ${c.rating.duel} · Team ${c.rating.team} · FFA ${c.rating.ffa}`))),
    };
  }

  /* ---------- merchant ---------- */
  render_merchant() {
    const g = this.game, c = g.char, d = this.data.merchant || { stock: [], potions: {} };
    const tab = this.state.merchantTab;
    const tabs = h('div.tabs.small', {}, ...[['buy', 'Buy'], ['sell', 'Sell']].map(([id, label]) =>
      h(`button.tab${tab === id ? '.active' : ''}`, { onclick: () => { this.state.merchantTab = id; this.render(); } }, label)));
    let body;
    if (tab === 'buy') {
      const pots = Object.values(d.potions || {}).map(p => h('div.shop-row', {},
        h('span.shop-icon', { text: p.icon }), h('div.shop-name', {}, h('b', { text: p.name }), h('small', { text: `${p.price} gold · you have ${c.potions[p.id]}/${d.maxPotions}` })),
        h('button.btn.btn-sm', { onclick: () => g.send({ t: 'buy', potion: p.id, n: 1 }) }, 'Buy 1'),
        h('button.btn.btn-sm', { onclick: () => g.send({ t: 'buy', potion: p.id, n: 5 }) }, 'Buy 5')));
      const gear = h('div.shop-grid', {}, ...d.stock.map(it => h('div.shop-item', {},
        this.itemCell(it, { price: it.price, onClick: () => g.send({ t: 'buy', id: it.id }), hint: `Click to buy for ${it.price} gold` }),
        h('small', { text: it.name }))));
      body = h('div', {}, h('h4', { text: 'Potions' }), ...pots, h('h4', { text: 'Wares (restocks every 10 minutes)' }), d.stock.length ? gear : h('p.muted', { text: 'Sold out! Come back later.' }));
    } else {
      body = h('div', {}, h('p.muted', { text: 'Click an item to sell it.' }),
        h('div.inv-grid', {}, ...c.inventory.map(it => this.itemCell(it, { price: sellPrice(it), onClick: () => g.send({ t: 'sell', id: it.id }), hint: `Click to sell for ${sellPrice(it)} gold` }))),
        c.inventory.length ? null : h('p.muted', { text: 'Your backpack is empty.' }));
    }
    return { title: '💰 Mira the Merchant', body: h('div', {}, tabs, this.goldLine(), body) };
  }

  /* ---------- blacksmith ---------- */
  render_blacksmith() {
    const g = this.game, c = g.char, d = this.data.blacksmith || { recipes: {}, cost: 0, per: 3 };
    const { craftA: a, craftB: b } = this.state;
    const pick = which => h('div.mat-picker', {}, ...MATERIAL_IDS.map(m => {
      const sel = this.state[which] === m;
      return h(`button.mat-btn${sel ? '.active' : ''}`, { onclick: () => { this.state[which] = m; this.render(); } },
        h('span', { text: MATERIALS[m].icon }), h('small', { text: `${MATERIALS[m].name} (${c.materials[m] || 0})` }));
    }));
    const recipe = a && b ? d.recipes[recipeKey(a, b)] : null;
    const need = {};
    if (a) need[a] = (need[a] || 0) + d.per;
    if (b) need[b] = (need[b] || 0) + d.per;
    const enough = a && b && Object.entries(need).every(([m, n]) => (c.materials[m] || 0) >= n) && c.gold >= d.cost;
    const preview = recipe ? h('div.recipe-preview', {},
      h('div.recipe-icon', { text: recipe.icon }),
      h('div', {}, h('b', { text: recipe.name }), h('div.muted', { text: `${SLOT_LABEL[recipe.slot]} · ${recipe.tier === 2 ? 'Epic / Legendary' : 'Rare / Epic'}` }),
        h('div', { text: `Cost: ${Object.entries(need).map(([m, n]) => `${n} ${MATERIALS[m].name}`).join(' + ')} + ${d.cost} gold` })))
      : h('p.muted', { text: 'Choose two materials to see what the refinery can forge.' });
    const book = h('div.recipe-book', {}, ...Object.entries(d.recipes).map(([key, r]) => {
      const [x, y] = key.split('+');
      return h('div.recipe-row', { onclick: () => { this.state.craftA = x; this.state.craftB = y; this.render(); } },
        h('span', { text: `${MATERIALS[x].icon}+${MATERIALS[y].icon}` }), h('b', { text: ` ${r.icon} ${r.name}` }), h('small.muted', { text: ` ${SLOT_LABEL[r.slot]}` }));
    }));
    return {
      title: '⚒️ Gear Refinery',
      wide: true,
      body: h('div.craft-layout', {},
        h('div', {}, h('h4', { text: 'First material' }), pick('craftA'), h('h4', { text: 'Second material' }), pick('craftB'), preview,
          h('button.btn.btn-primary', { disabled: !enough, onclick: () => g.send({ t: 'craft', a, b }) }, '🔨 Strike the Anvil'), this.goldLine()),
        h('div', {}, h('h4', { text: 'Recipe Book' }), book, h('p.muted', { text: 'Materials drop from monsters, chests and bosses. Crafted gear is always Rare or better.' }))),
    };
  }

  /* ---------- dungeon ---------- */
  render_dungeon() {
    const g = this.game, d = this.data.dungeon || { checkpoints: [1], deepest: 0 };
    const party = g.party;
    const leader = party && party.leader === g.name;
    const floorSel = h('select.floor-select', {}, ...d.checkpoints.map(f => h('option', { value: f, text: `Floor ${f}${f > 1 ? ' (checkpoint)' : ''}` })));
    floorSel.value = d.checkpoints[d.checkpoints.length - 1];
    const floor = () => Number(floorSel.value);
    return {
      title: '🌀 The Dungeon Gate',
      body: h('div', {},
        h('p', { text: 'Endless procedurally generated floors. A guardian waits every 5 floors — defeat it to unseal the stairs and unlock a checkpoint.' }),
        h('div.stat-row', {}, h('span', { text: 'Your deepest floor' }), h('b', { text: d.deepest || 0 })),
        h('label.field', {}, h('span', { text: 'Starting floor' }), floorSel),
        h('div.dungeon-modes', {},
          h('div.mode-card', {}, h('h4', { text: '🗡️ Solo Delve' }), h('p', { text: 'Single-player. Monsters scale to you alone. If you fall, the run ends.' }),
            h('button.btn.btn-primary', { onclick: () => { g.send({ t: 'dungeon', op: 'enter', mode: 'solo', floor: floor() }); this.close(); } }, 'Enter Solo')),
          h('div.mode-card', {}, h('h4', { text: '👥 Party Delve' }),
            h('p', { text: party ? `Your party of ${party.members.length} enters together. Fallen members can be revived.` : 'Invite friends with the Social panel (P) or /invite name.' }),
            h('button.btn.btn-primary', { disabled: !leader, onclick: () => { g.send({ t: 'dungeon', op: 'enter', mode: 'party', floor: floor() }); this.close(); } }, leader ? 'Enter with Party' : party ? 'Leader only' : 'Need a party'))),
      ),
    };
  }

  /* ---------- arena ---------- */
  render_arena() {
    const g = this.game, c = g.char;
    const q = g.queue && g.queue.state === 'searching' ? g.queue : null;
    const card = (mode, desc) => h('div.mode-card', {},
      h('h4', { text: ARENA_MODES[mode].name }), h('p', { text: desc }),
      h('div.rating', { text: `Rating ${c.rating[mode]}` }),
      q && q.mode === mode
        ? h('button.btn', { onclick: () => g.send({ t: 'arena', op: 'cancel' }) }, `Searching… ${q.since || 0}s · Cancel`)
        : h('button.btn.btn-primary', { disabled: !!q, onclick: () => g.send({ t: 'arena', op: 'queue', mode }) }, 'Find Ranked Match'),
      h('button.btn.btn-sm', { disabled: !!q, onclick: () => { g.send({ t: 'arena', op: 'practice', mode }); this.close(); } }, 'Practice vs Bots'));
    return {
      title: '⚔️ The Arena',
      wide: true,
      body: h('div', {},
        h('p', { text: `PvP damage is scaled for fair fights and potions are disabled. Matches with bots are unranked. ${g.offline ? 'Offline: opponents are bots.' : 'If the queue is quiet, bots fill empty seats.'}` }),
        h('div.dungeon-modes', {},
          card('duel', 'Best of three rounds, one on one.'),
          card('team', 'Three versus three. First team to 15 kills. Queue with your party!'),
          card('ffa', 'Everyone for themselves. First to 10 kills.')),
        h('div.stat-row', {}, h('span', { text: 'Record' }), h('b', { text: `${c.pvp.wins} wins · ${c.pvp.losses} losses` })),
        h('p.muted', { text: 'Tip: challenge anyone online to a friendly duel with /duel name.' })),
    };
  }

  /* ---------- trainer ---------- */
  render_trainer() {
    const g = this.game, c = g.char;
    return {
      title: '📜 Master Oren — Class Trainer',
      wide: true,
      body: h('div', {}, h('p', { text: 'Retrain your hero in another discipline. You keep your level, gear and progress.' }),
        h('div.class-cards.compact', {}, ...CLASS_IDS.map(cls => classCard(cls, g.theme, c.cls === cls ? 'Current class' : 'Retrain', c.cls === cls, () => g.send({ t: 'class', cls }))))),
    };
  }

  /* ---------- leaderboard ---------- */
  render_leaderboard() {
    const g = this.game;
    const d = this.data.leaderboard;
    const kind = this.state.lbKind;
    const tabs = h('div.tabs.small.wrap', {}, ...LB_KINDS.map(([k, label]) => h(`button.tab${k === kind ? '.active' : ''}`, { onclick: () => { this.state.lbKind = k; g.send({ t: 'lb', kind: k }); this.render(); } }, label)));
    const rows = d && d.kind === kind ? d.rows : null;
    const val = r => kind === 'level' ? `Lv ${r.level}` : fmt(r.value);
    return {
      title: '🏆 Hall of Legends',
      body: h('div', {}, tabs, rows ? h('table.lb-table', {},
        h('tr', {}, h('th', { text: '#' }), h('th', { text: 'Hero' }), h('th', { text: 'Level' }), h('th', { text: LB_KINDS.find(k => k[0] === kind)[1] })),
        ...rows.map((r, i) => h(`tr${r.name === g.name ? '.me' : ''}`, {}, h('td', { text: i + 1 }), h('td', { text: `${CLASS_ICON[r.cls] || ''} ${r.name}` }), h('td', { text: r.level }), h('td', { text: val(r) }))))
        : h('p.muted', { text: 'Loading…' })),
    };
  }

  /* ---------- social ---------- */
  render_social() {
    const g = this.game;
    const who = this.data.social || { list: [], total: 0 };
    const party = g.party;
    const leader = party && party.leader === g.name;
    const inviteInput = h('input', { placeholder: 'Player name', maxlength: 16 });
    const partyBox = party ? h('div.party-box', {},
      ...party.members.map(m => h('div.party-row', {},
        h('span', { text: `${party.leader === m.name ? '👑 ' : ''}${CLASS_ICON[m.cls] || ''} ${m.name} ${m.level ? `(Lv ${m.level})` : ''}` }),
        h('small.muted', { text: m.online ? m.zone : 'Offline' }),
        leader && m.name !== g.name ? h('button.btn.btn-sm', { onclick: () => g.send({ t: 'party', op: 'promote', name: m.name }) }, 'Promote') : null,
        leader && m.name !== g.name ? h('button.btn.btn-sm.btn-danger', { onclick: () => g.send({ t: 'party', op: 'kick', name: m.name }) }, 'Kick') : null)),
      h('button.btn.btn-sm', { onclick: () => g.send({ t: 'party', op: 'leave' }) }, 'Leave Party'))
      : h('p.muted', { text: 'You are not in a party. Invite someone below — parties share dungeon runs, chat and revives.' });
    const list = h('div.who-list', {}, ...who.list.map(p => h('div.who-row', {},
      h('span', { text: `${CLASS_ICON[p.cls] || ''} ${p.name}` }), h('small', { text: `Lv ${p.level} · ${p.zone}` }),
      p.name !== g.name ? h('span.who-actions', {},
        h('button.btn.btn-sm', { title: 'Whisper', onclick: () => { this.close(); g.chat.focus(`/w ${p.name} `); } }, '💬'),
        !p.party ? h('button.btn.btn-sm', { title: 'Invite to party', onclick: () => g.send({ t: 'party', op: 'invite', name: p.name }) }, '➕') : null,
        h('button.btn.btn-sm', { title: 'Challenge to a duel', onclick: () => g.send({ t: 'duel', op: 'request', name: p.name }) }, '⚔️')) : h('small.muted', { text: '(you)' }))));
    return {
      title: '👥 Social',
      body: h('div', {},
        h('h4', { text: 'Party' }), partyBox,
        h('div.invite-row', {}, inviteInput, h('button.btn.btn-sm', { onclick: () => { if (inviteInput.value.trim()) g.send({ t: 'party', op: 'invite', name: inviteInput.value.trim() }); } }, 'Invite')),
        h('h4', {}, `Online (${who.total})`, h('button.btn.btn-sm', { style: { marginLeft: '8px' }, onclick: () => g.send({ t: 'who' }) }, '↻')),
        g.offline ? h('p.muted', { text: 'You are playing offline. Log in online to meet other players.' }) : list),
    };
  }

  /* ---------- settings / help ---------- */
  render_settings() {
    const g = this.game, s = g.settings;
    const quality = h('select', {}, ...['low', 'medium', 'high'].map(q => h('option', { value: q, text: q[0].toUpperCase() + q.slice(1) })));
    quality.value = s.quality;
    quality.addEventListener('change', () => g.setSetting('quality', quality.value));
    const vol = h('input', { type: 'range', min: 0, max: 100, value: Math.round(s.volume * 100) });
    vol.addEventListener('input', () => g.setSetting('volume', vol.value / 100));
    const fps = h('input', { type: 'checkbox', checked: s.showFps });
    fps.addEventListener('change', () => g.setSetting('showFps', fps.checked));
    return {
      title: '⚙️ Settings',
      body: h('div', {},
        h('label.field', {}, h('span', { text: 'Graphics quality' }), quality),
        h('label.field', {}, h('span', { text: 'Sound volume' }), vol),
        h('label.field.row', {}, fps, h('span', { text: 'Show FPS & ping' })),
        h('div.btn-row', {},
          h('button.btn', { onclick: () => this.open('help') }, '❔ Controls'),
          h('button.btn.btn-danger', { onclick: () => g.logout() }, g.offline ? 'Exit to Title' : 'Log Out')),
        h('p.muted', { text: g.offline ? 'Offline mode: your hero is saved in this browser.' : `Connected as ${g.name}.` })),
    };
  }

  render_help() {
    const row = (k, v) => h('tr', {}, h('td', {}, h('kbd', { text: k })), h('td', { text: v }));
    return {
      title: '❔ How to Play',
      body: h('div', {},
        h('table.keys', {},
          row('W A S D', 'Move'), row('Mouse', 'Aim'), row('Left click (hold)', 'Primary attack'), row('Space / Shift / Right click', 'Dash'),
          row('Q · E · R', 'Abilities (R = ultimate)'), row('1 · 2', 'Health / mana potion'), row('F', 'Talk, open chests, use portals'),
          row('I / B', 'Inventory'), row('C', 'Character'), row('P / O', 'Social & party'), row('L', 'Leaderboards'), row('M', 'Big map'),
          row('Tab', 'Arena scoreboard'), row('Enter', 'Chat (/help for commands)'), row('Mouse wheel', 'Zoom'), row('Esc', 'Close / settings')),
        h('h4', { text: 'Getting started' }),
        h('ol', {},
          h('li', { text: 'Visit the NPCs in town: Mira sells potions and gear, Dorran forges gear from materials, Seer Ilya opens dungeons, Warden Kael runs the arena.' }),
          h('li', { text: 'Leave town through any gate to hunt monsters. The further from town, the stronger they get.' }),
          h('li', { text: 'Dungeons get harder every floor. Guardians wait on every 5th floor and unlock checkpoints.' }),
          h('li', { text: 'Team up: /invite name, then enter a Party Delve. Stand next to a fallen ally to revive them.' }),
          h('li', { text: 'A world boss awakens in the south-east wastes every 15 minutes. Bring friends!' }))),
    };
  }

  render_result() {
    const g = this.game, r = this.data.result;
    if (!r) return { title: '', body: h('div') };
    if (r.kind === 'dungeonFail') {
      return { title: '💀 Run Over', body: h('div.result', {}, h('h2', { text: `You fell on floor ${r.floor}` }), h('p', { text: `You lost ${r.gold} gold. Your loot and experience are kept.` }), h('button.btn.btn-primary', { onclick: () => this.close() }, 'Continue')) };
    }
    const title = r.draw ? 'Draw' : r.won ? 'Victory!' : 'Defeat';
    return {
      title: `⚔️ ${ARENA_MODES[r.mode].name}`,
      wide: true,
      body: h('div.result', {},
        h(`h2.${r.won ? 'win' : r.draw ? 'draw' : 'loss'}`, { text: title }),
        h('p', {}, `+${r.gold} gold`, r.rated ? ` · Rating ${r.delta >= 0 ? '+' : ''}${r.delta}` : ' · Unranked'),
        h('table.score-table.full', {},
          h('tr', {}, h('th', { text: 'Player' }), h('th', { text: 'K' }), h('th', { text: 'D' }), h('th', { text: 'Result' }), h('th', { text: 'Rating' })),
          ...r.scoreboard.map(s => h(`tr${s.name === g.name ? '.me' : ''}${r.mode !== 'ffa' ? `.t-${s.team}` : ''}`, {},
            h('td', { text: `${CLASS_ICON[s.cls] || ''} ${s.name}${s.bot ? ' 🤖' : ''}${s.left ? ' (left)' : ''}` }), h('td', { text: s.kills }), h('td', { text: s.deaths }),
            h('td', { text: s.win ? '🏆' : '' }), h('td', { text: s.bot ? '—' : `${s.rating}${s.delta ? ` (${s.delta > 0 ? '+' : ''}${s.delta})` : ''}` })))),
        h('button.btn.btn-primary', { onclick: () => this.close() }, 'Continue')),
    };
  }

  render_scoreboard() {
    const meta = this.game.world.meta;
    return { title: '⚔️ Scoreboard', body: meta && meta.board ? this.game.hud.scoreTable(meta, true) : h('p.muted', { text: 'No match in progress.' }) };
  }
}

export function classCard(cls, theme, label, disabled, onPick) {
  const sc = seasonalClass(cls, theme);
  const arch = ARCHETYPES[cls];
  return h('div.class-card', {},
    h('div.cc-icon', { text: sc.icon }),
    h('h3', { text: sc.name }),
    h('div.cc-role', { text: arch.role }),
    h('p.cc-desc', { text: sc.desc }),
    h('ul.cc-abils', {}, ...SLOTS.map(slot => {
      const a = abilityInfo(cls, slot, theme);
      return h('li', { title: a.desc }, h('span', { text: a.icon }), ` ${a.name}`);
    })),
    h('div.cc-stats', { text: `HP ${arch.base.hp} · MP ${arch.base.mp} · ATK ${arch.base.atk} · ARM ${arch.base.armor}` }),
    h('button.btn.btn-primary', { disabled, onclick: onPick }, label));
}

export { ABILITIES };
