/* Champion select screen. */
import { h, $, clear } from './dom.js';
import { championDetail } from './lobby.js';
import { sfx } from '../audio/sfx.js';
import { pic, champKey } from './icons.js';
import { championPreview } from '../render/preview.js';
import { preloadModels } from '../render/assetModels.js';

const ROLES = ['All', 'Tank', 'Fighter', 'Assassin', 'Mage', 'Marksman', 'Support'];

export class Select {
  constructor(app) {
    this.app = app;
    this.root = $('#screen-select');
    this.role = 'All';
    this.hovered = null;
    this.state = null;
  }

  update(sel) {
    const prev = this.state;
    const me = sel.players.find(p => p.you);
    const wasLocked = prev && prev.id === sel.id && prev.players.find(p => p.you)?.locked;
    if (me && me.locked && !wasLocked) { sfx.play('lock_in', { late: true }); championPreview.flourish('attack'); if (me.champ) setTimeout(() => sfx.play(`cv_${me.champ}_pick`, { bus: 'voice', late: true }), 350); }
    if (sel.timeLeft <= 5 && sel.timeLeft > 0 && (!prev || prev.timeLeft !== sel.timeLeft)) sfx.play('select_tick', { gap: 0.5 });
    if (me && me.champ && prev && prev.id === sel.id && prev.players.find(p => p.you)?.champ !== me.champ) sfx.play('ui_skill', { gap: 0.1 });
    // Fetch the match's models while players pick: everything shared once, then each champion as it's revealed.
    preloadModels(sel.players.map(p => p.champ).filter(Boolean), { common: !prev || prev.id !== sel.id, first: true });
    this.state = sel;
    this.render();
  }

  render() {
    const app = this.app, sel = this.state;
    if (!sel) return;
    const me = sel.players.find(p => p.you);
    const myTeam = me.team;
    const champs = app.data.champions;
    const takenByTeam = new Set(sel.players.filter(p => p.team === myTeam && !p.you && p.champ).map(p => p.champ));
    const shown = champs.find(c => c.id === (this.hovered || me.champ)) || null;
    const teamList = (team, own) => h(`div.sel-team.${team}`, {}, h('h4', { text: own ? 'Your team' : 'Enemy team' }),
      ...sel.players.filter(p => p.team === team).map(p => {
        const c = p.champ ? app.champInfo[p.champ] : null;
        return h(`div.sel-player${p.you ? '.you' : ''}${p.locked ? '.locked' : ''}`, {},
          h('div.sp-icon', {}, c ? pic(champKey(c.id), c.icon) : '❔'),
          h('div', {}, h('div.sp-name', { text: `${p.name}${p.bot ? ' 🤖' : ''}` }), h('div.sp-champ', { text: c ? c.name : own ? 'Picking…' : p.locked ? '' : 'Picking…' })),
          own && p.summ ? h('div.sp-summ', {}, pic('spell/blink', '✨'), pic(`spell/${p.summ}`, app.data.spells[p.summ]?.icon || '')) : null,
          p.locked ? h('div.sp-lock', { text: '🔒' }) : null);
      }));
    const grid = h('div.sel-grid', {}, ...champs.filter(c => this.role === 'All' || c.role === this.role).map(c => {
      const taken = takenByTeam.has(c.id);
      return h(`button.champ-card${me.champ === c.id ? '.sel' : ''}${taken ? '.taken' : ''}`, {
        disabled: taken || me.locked,
        onclick: () => app.send({ t: 'pick', champ: c.id }),
        onmouseenter: () => { this.hovered = c.id; this.renderDetail(shownDetail, c); championPreview.show(c.id, c); },
        onmouseleave: () => { this.hovered = null; if (me.champ) championPreview.show(me.champ, app.champInfo[me.champ]); },
      }, h('div.cc-ic', {}, pic(champKey(c.id), c.icon)), h('div.cc-n', { text: c.name }), h('div.cc-r', { text: c.role }));
    }));
    const shownDetail = h('div.sel-detail');
    const previewId = this.hovered || me.champ;
    if (previewId) championPreview.show(previewId, app.champInfo[previewId]);
    const preview = championPreview.mount();
    preview.hidden = !previewId;
    if (shown) this.renderDetail(shownDetail, shown);
    const summs = h('div.sel-summs', {}, h('span.muted', { text: 'Spells: ✨ Blink + ' }),
      ...app.data.second.map(s => { const d = app.data.spells[s]; return h(`button.summ-btn${me.summ === s ? '.active' : ''}`, { title: `${d.name}: ${d.desc}`, disabled: me.locked, onclick: () => app.send({ t: 'csumm', spell: s }) }, h('span.summ-ic', {}, pic(`spell/${s}`, d.icon)), d.name); }));
    clear(this.root);
    this.root.append(h('div.auth-bg'), h('div.sel-wrap', {},
      h('div.sel-top', {}, h('div.sel-mode', { text: `${sel.mode === 'practice' ? 'Practice vs AI' : sel.mode === 'custom' ? 'Custom Game' : sel.ranked ? 'Ranked 5v5' : 'Matchmade 5v5'} · Choose your champion` }), h('div.sel-timer', { text: sel.timeLeft })),
      h('div.sel-main', {},
        teamList(myTeam, true),
        h('div.sel-center', {},
          h('div.tabs.small.wrap', {}, ...ROLES.map(r => h(`button.tab${this.role === r ? '.active' : ''}`, { onclick: () => { this.role = r; this.render(); } }, r))),
          grid, summs,
          h('button.btn.btn-primary.btn-lg', { disabled: !me.champ || me.locked, onclick: () => app.send({ t: 'lock' }) }, me.locked ? 'Locked in — waiting for others' : 'Lock In')),
        h('div.sel-right', {}, preview, shownDetail, teamList(myTeam === 'blue' ? 'red' : 'blue', false)))));
  }

  renderDetail(el, c) { clear(el).append(championDetail(c)); }
}
