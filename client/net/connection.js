/* Client transports. Both expose the same interface so the game client does
   not care whether it is talking to the real server or the offline hub. */

export class Emitter {
  constructor() { this.handlers = new Map(); }
  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type)?.delete(fn);
  }
  emit(type, msg) {
    this.handlers.get(type)?.forEach(fn => fn(msg));
    this.handlers.get('*')?.forEach(fn => fn(msg));
  }
}

export function serverBase() {
  const configured = import.meta.env.VITE_SERVER_URL;
  if (configured) return configured.replace(/\/$/, '');
  return window.location.origin;
}

export function wsUrl() {
  const base = serverBase();
  return base.replace(/^http/, 'ws') + '/ws';
}

export async function api(path, body) {
  const res = await fetch(serverBase() + path, body ? {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  } : undefined);
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function checkServer(timeoutMs = 3500) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(serverBase() + '/api/health', { signal: ctrl.signal });
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.game === 'broadroads' ? data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export class OnlineConnection extends Emitter {
  constructor(token) {
    super();
    this.token = token;
    this.ws = null;
    this.offline = false;
    this.closedByUs = false;
    this.bytesIn = 0;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl());
      this.ws = ws;
      let opened = false;
      ws.onopen = () => {
        opened = true;
        ws.send(JSON.stringify({ t: 'auth', token: this.token }));
        resolve();
      };
      ws.onmessage = ev => {
        this.bytesIn += ev.data.length;
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        this.emit(msg.t, msg);
      };
      ws.onerror = () => { if (!opened) reject(new Error('Could not reach the game server.')); };
      ws.onclose = ev => {
        if (!opened) return;
        this.emit('disconnect', { code: ev.code, reason: ev.reason, byUs: this.closedByUs });
      };
    });
  }

  send(msg) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  close() {
    this.closedByUs = true;
    if (this.ws) this.ws.close();
  }
}
