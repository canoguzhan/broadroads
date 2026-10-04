/* Chat box with channels and slash commands. */
import { h, clear } from './dom.js';
import { CLASS_ICON } from './hud.js';

const CHANNELS = { say: 'Say', world: 'World', party: 'Party', whisper: 'Whisper', system: 'System' };
const HELP = [
  '/s <msg> — say (everyone in this zone)', '/w <name> <msg> — whisper', '/p <msg> — party chat', '/world <msg> — world chat',
  '/invite <name> — party invite', '/leave — leave party', '/kick <name> — remove from party', '/duel <name> — challenge to a duel',
  '/who — online players', '/help — this list',
];

export class Chat {
  constructor(game, root) {
    this.game = game;
    this.channel = 'say';
    this.filter = 'all';
    this.lastWhisper = null;
    this.log = h('div.chat-log', { role: 'log' });
    this.input = h('input.chat-input', { maxlength: 200, placeholder: 'Press Enter to chat · /help', 'aria-label': 'Chat message' });
    this.chanBtn = h('button.chat-chan', { onclick: () => this.cycleChannel(), title: 'Change channel' });
    const tabs = h('div.chat-tabs', {}, ...['all', 'world', 'party', 'system'].map(f =>
      h(`button.chat-tab${f === 'all' ? '.active' : ''}`, { onclick: ev => this.setFilter(f, ev.currentTarget) }, f[0].toUpperCase() + f.slice(1))));
    this.el = h('div.chat', {}, tabs, this.log, h('div.chat-row', {}, this.chanBtn, this.input));
    root.append(this.el);
    this.updateChan();
    this.input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation(); // do not let the global "Enter opens chat" handler refocus us
        const text = this.input.value.trim();
        this.input.value = '';
        if (text) this.submit(text);
        this.input.blur();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        this.cycleChannel();
      }
    });
    this.input.addEventListener('focus', () => this.el.classList.add('active'));
    this.input.addEventListener('blur', () => this.el.classList.remove('active'));
  }

  focus(prefix = '') {
    this.input.focus();
    if (prefix) this.input.value = prefix;
  }

  cycleChannel() {
    const order = this.game.party ? ['say', 'world', 'party'] : ['say', 'world'];
    this.channel = order[(order.indexOf(this.channel) + 1) % order.length];
    this.updateChan();
  }

  updateChan() {
    this.chanBtn.textContent = CHANNELS[this.channel];
    this.chanBtn.className = `chat-chan ch-${this.channel}`;
  }

  setFilter(f, btn) {
    this.filter = f;
    for (const b of this.el.querySelectorAll('.chat-tab')) b.classList.toggle('active', b === btn);
    for (const line of this.log.children) line.hidden = !this.matches(line.dataset.ch);
  }

  matches(ch) {
    if (this.filter === 'all') return true;
    if (this.filter === 'party') return ch === 'party';
    if (this.filter === 'world') return ch === 'world';
    return ch === 'system';
  }

  submit(text) {
    const g = this.game;
    if (text.startsWith('/')) {
      const [cmd, ...rest] = text.slice(1).split(' ');
      const arg = rest.join(' ').trim();
      switch (cmd.toLowerCase()) {
        case 's': case 'say': return g.send({ t: 'chat', ch: 'say', text: arg });
        case 'w': case 'whisper': case 'msg': case 't': {
          const [to, ...msg] = rest;
          if (!to) return this.system('Usage: /w <name> <message>');
          return g.send({ t: 'chat', ch: 'whisper', to, text: msg.join(' ') });
        }
        case 'r': case 'reply':
          if (!this.lastWhisper) return this.system('Nobody to reply to.');
          return g.send({ t: 'chat', ch: 'whisper', to: this.lastWhisper, text: arg });
        case 'p': case 'party': return g.send({ t: 'chat', ch: 'party', text: arg });
        case 'world': case '1': case 'y': return g.send({ t: 'chat', ch: 'world', text: arg });
        case 'invite': case 'inv': return g.send({ t: 'party', op: 'invite', name: arg });
        case 'leave': return g.send({ t: 'party', op: 'leave' });
        case 'kick': return g.send({ t: 'party', op: 'kick', name: arg });
        case 'promote': return g.send({ t: 'party', op: 'promote', name: arg });
        case 'duel': return g.send({ t: 'duel', op: 'request', name: arg });
        case 'who': return g.panels.open('social');
        case 'help': case '?': return HELP.forEach(l => this.system(l));
        default: return this.system(`Unknown command /${cmd}. Type /help.`);
      }
    }
    g.send({ t: 'chat', ch: this.channel, text });
  }

  system(text, kind = 'system') { this.add({ ch: 'system', from: '', text, kind }); }

  add(m) {
    const ch = m.ch || 'system';
    if (ch === 'whisper' && m.from !== this.game.name) this.lastWhisper = m.from;
    const line = h(`div.chat-line.ch-${ch}${m.kind ? `.k-${m.kind}` : ''}`, { dataset: { ch } });
    if (ch !== 'system') line.append(h('span.chat-tag', { text: `[${CHANNELS[ch] || ch}] ` }));
    if (m.from) {
      const who = ch === 'whisper' ? (m.from === this.game.name ? `To ${m.to}` : `From ${m.from}`) : m.from;
      const nameEl = h('span.chat-name', { text: `${CLASS_ICON[m.cls] || ''}${who}: `, title: 'Click to whisper' });
      nameEl.addEventListener('click', () => this.focus(`/w ${m.from === this.game.name ? m.to : m.from} `));
      line.append(nameEl);
    }
    line.append(h('span.chat-text', { text: m.text }));
    line.hidden = !this.matches(ch);
    const atBottom = this.log.scrollTop + this.log.clientHeight >= this.log.scrollHeight - 30;
    this.log.append(line);
    while (this.log.children.length > 150) this.log.firstChild.remove();
    if (atBottom) this.log.scrollTop = this.log.scrollHeight;
    this.el.classList.add('recent');
    clearTimeout(this.fadeT);
    this.fadeT = setTimeout(() => this.el.classList.remove('recent'), 8000);
  }

  clear() { clear(this.log); }
}
