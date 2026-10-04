/* Champion select screen. */
import { h, $, clear } from './dom.js';
import { championDetail } from './lobby.js';

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
          h('div.sp-icon', { text: c ? c.icon : '❔' }),
          h('div', {}, h('div.sp-name', { text: `${p.name}${p.bot ? ' 🤖' : ''}` }), h('div.sp-champ', { text: c ? c.name : own ? 'Picking…' : p.locked ? '' : 'Picking…' })),
          own && p.summ ? h('div.sp-summ', { text: `✨${app.data.summoners[p.summ]?.icon || ''}` }) : null,
          p.locked ? h('div.sp-lock', { text: '🔒' }) : null);
      }));
    const grid = h('div.sel-grid', {}, ...champs.filter(c => this.role === 'All' || c.role === this.role).map(c => {
      const taken = takenByTeam.has(c.id);
      return h(`button.champ-card${me.champ === c.id ? '.sel' : ''}${taken ? '.taken' : ''}`, {
        disabled: taken || me.locked,
        onclick: () => app.send({ t: 'pick', champ: c.id }),
        onmouseenter: () => { this.hovered = c.id; this.renderDetail(shownDetail, c); },
        onmouseleave: () => { this.hovered = null; },
      }, h('div.cc-ic', { text: c.icon }), h('div.cc-n', { text: c.name }), h('div.cc-r', { text: c.role }));
    }));
    const shownDetail = h('div.sel-detail');
    if (shown) this.renderDetail(shownDetail, shown);
    const summs = h('div.sel-summs', {}, h('span.muted', { text: 'Summoners: ✨ Flash + ' }),
      ...app.data.second.map(s => { const d = app.data.summoners[s]; return h(`button.summ-btn${me.summ === s ? '.active' : ''}`, { title: `${d.name}: ${d.desc}`, disabled: me.locked, onclick: () => app.send({ t: 'csumm', spell: s }) }, `${d.icon} ${d.name}`); }));
    clear(this.root);
    this.root.append(h('div.auth-bg'), h('div.sel-wrap', {},
      h('div.sel-top', {}, h('div.sel-mode', { text: `${sel.mode === 'practice' ? 'Practice vs AI' : sel.mode === 'custom' ? 'Custom Game' : sel.ranked ? 'Ranked 5v5' : 'Matchmade 5v5'} · Choose your champion` }), h('div.sel-timer', { text: sel.timeLeft })),
      h('div.sel-main', {},
        teamList(myTeam, true),
        h('div.sel-center', {},
          h('div.tabs.small.wrap', {}, ...ROLES.map(r => h(`button.tab${this.role === r ? '.active' : ''}`, { onclick: () => { this.role = r; this.render(); } }, r))),
          grid, summs,
          h('button.btn.btn-primary.btn-lg', { disabled: !me.champ || me.locked, onclick: () => app.send({ t: 'lock' }) }, me.locked ? 'Locked in — waiting for others' : 'Lock In')),
        h('div.sel-right', {}, shownDetail, teamList(myTeam === 'blue' ? 'red' : 'blue', false)))));
  }

  renderDetail(el, c) { clear(el).append(championDetail(c)); }
}
