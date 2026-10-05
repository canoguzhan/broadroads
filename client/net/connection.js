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

import { decodeSnapshot } from '../../shared/protocol.js';

// Close codes that mean "do not come back": replaced by another login, bad token, server full.
const FINAL_CODES = new Set([4000, 4001, 4003, 4005]);
const BACKOFF = [300, 800, 1500, 2500, 4000, 6000, 8000, 8000];

export class OnlineConnection extends Emitter {
  constructor(token) {
    super();
    this.token = token;
    this.ws = null;
    this.offline = false;
    this.closedByUs = false;
    this.bytesIn = 0;
    this.lastMsgAt = 0;
  }

  /** Opens the socket and authenticates. Rejects if the server can't be reached. */
  open() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl());
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      let opened = false;
      ws.onopen = () => {
        opened = true;
        this.lastMsgAt = Date.now();
        ws.send(JSON.stringify({ t: 'auth', token: this.token }));
        resolve();
      };
      ws.onmessage = ev => {
        this.lastMsgAt = Date.now();
        this.bytesIn += ev.data.byteLength ?? ev.data.length;
        let msg;
        try { msg = typeof ev.data === 'string' ? JSON.parse(ev.data) : decodeSnapshot(ev.data); } catch { return; }
        this.emit(msg.t, msg);
      };
      ws.onerror = () => { if (!opened) reject(new Error('Could not reach the game server.')); };
      ws.onclose = ev => {
        if (!opened || ws !== this.ws) return;
        if (this.closedByUs || FINAL_CODES.has(ev.code)) return this.emit('disconnect', { code: ev.code, reason: ev.reason, byUs: this.closedByUs });
        this.reconnect();
      };
    });
  }

  async connect() {
    await this.open();
    // Silent drops (mobile networks) never fire 'close' quickly: the server
    // answers our 3-second pings, so 8 seconds of silence means the link is dead.
    clearInterval(this.watch);
    this.watch = setInterval(() => {
      if (this.ws && this.ws.readyState === 1 && Date.now() - this.lastMsgAt > 8000) this.ws.close(4100, 'stale');
    }, 2000);
  }

  async reconnect() {
    if (this.reconnecting) return;
    this.reconnecting = true;
    for (let i = 0; i < BACKOFF.length && !this.closedByUs; i++) {
      this.emit('reconnecting', { attempt: i + 1 });
      await new Promise(r => setTimeout(r, BACKOFF[i]));
      try { await this.open(); this.reconnecting = false; this.emit('reconnected', {}); return; } catch { /* try again */ }
    }
    this.reconnecting = false;
    if (!this.closedByUs) this.emit('disconnect', { code: 1006, reason: 'lost', byUs: false });
  }

  send(msg) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  close() {
    this.closedByUs = true;
    clearInterval(this.watch);
    if (this.ws) this.ws.close();
  }
}
