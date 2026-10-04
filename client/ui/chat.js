/* Chat box. In a match: team chat (default) or /all. In the lobby: global and party. */
import { h, clear } from './dom.js';

const LABEL = { team: 'Team', all: 'All', global: 'Lobby', party: 'Party', whisper: 'Whisper', system: '' };

export class Chat {
  constructor(app, root, mode = 'lobby') {
    this.app = app;
    this.mode = mode;
    this.channel = mode === 'match' ? 'team' : 'global';
    this.lastWhisper = null;
    this.log = h('div.chat-log', { role: 'log' });
    this.input = h('input.chat-input', { maxlength: 200, placeholder: mode === 'match' ? 'Enter: team chat · /all · /ff' : 'Say something · /w name · /p', 'aria-label': 'Chat message' });
    this.chanBtn = h('button.chat-chan', { onclick: () => this.cycle() });
    this.el = h('div.chat', {}, this.log, h('div.chat-row', {}, this.chanBtn, this.input));
    root.append(this.el);
    this.updateChan();
    this.input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const text = this.input.value.trim();
        this.input.value = '';
        if (text) this.submit(text);
        if (this.mode === 'match') this.input.blur();
      } else if (e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); this.cycle(); }
    });
    this.input.addEventListener('focus', () => this.el.classList.add('active'));
    this.input.addEventListener('blur', () => this.el.classList.remove('active'));
  }

  focus(prefix = '') { this.input.focus(); if (prefix) this.input.value = prefix; }

  cycle() {
    const order = this.mode === 'match' ? ['team', 'all'] : ['global', 'party'];
    this.channel = order[(order.indexOf(this.channel) + 1) % order.length];
    this.updateChan();
  }

  updateChan() { this.chanBtn.textContent = LABEL[this.channel]; this.chanBtn.className = `chat-chan ch-${this.channel}`; }

  submit(text) {
    const send = m => this.app.send(m);
    if (text.startsWith('/')) {
      const [cmd, ...rest] = text.slice(1).split(' ');
      const arg = rest.join(' ').trim();
      switch (cmd.toLowerCase()) {
        case 'all': case 'a': return send({ t: 'chat', ch: 'all', text: arg });
        case 'team': return send({ t: 'chat', ch: 'team', text: arg });
        case 'p': case 'party': return send({ t: 'chat', ch: 'party', text: arg });
        case 'w': case 'whisper': case 'msg': { const [to, ...m] = rest; return send({ t: 'chat', ch: 'whisper', to, text: m.join(' ') }); }
        case 'r': if (this.lastWhisper) return send({ t: 'chat', ch: 'whisper', to: this.lastWhisper, text: arg }); return;
        case 'invite': return send({ t: 'party', op: 'invite', name: arg });
        case 'ff': case 'surrender': return send({ t: 'ff', yes: true });
        case 'help': return this.system('/all msg · /team msg · /p msg · /w name msg · /invite name · /ff');
        default: return this.system(`Unknown command /${cmd}`);
      }
    }
    send({ t: 'chat', ch: this.channel, text });
  }

  system(text, kind = '') { this.add({ ch: 'system', from: '', text, kind }); }

  add(m) {
    const ch = m.ch || 'system';
    if (ch === 'whisper' && m.from !== this.app.name) this.lastWhisper = m.from;
    const line = h(`div.chat-line.ch-${ch}${m.kind ? `.k-${m.kind}` : ''}`);
    if (LABEL[ch]) line.append(h('span.chat-tag', { text: `[${LABEL[ch]}] ` }));
    if (m.from) {
      const who = ch === 'whisper' ? (m.from === this.app.name ? `To ${m.to}` : `From ${m.from}`) : m.from;
      const nameEl = h(`span.chat-name${m.team ? `.tn-${m.team}` : ''}`, { text: `${who}: ` });
      nameEl.addEventListener('click', () => this.focus(`/w ${m.from === this.app.name ? m.to : m.from} `));
      line.append(nameEl);
    }
    line.append(h('span.chat-text', { text: m.text }));
    const atBottom = this.log.scrollTop + this.log.clientHeight >= this.log.scrollHeight - 30;
    this.log.append(line);
    while (this.log.children.length > 150) this.log.firstChild.remove();
    if (atBottom) this.log.scrollTop = this.log.scrollHeight;
    this.el.classList.add('recent');
    clearTimeout(this.fadeT);
    this.fadeT = setTimeout(() => this.el.classList.remove('recent'), 8000);
  }

  destroy() { this.el.remove(); }
  clear() { clear(this.log); }
}
