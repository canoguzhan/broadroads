/* Reports uncaught browser errors to the server (/api/client-error) for the
   admin page: deduplicated, at most 10 per session, never blocking the game. */
const BASE = import.meta.env.BASE_URL || '/';
const seen = new Set();
let sent = 0;

function context() {
  const g = window.__broadroads, screen = [...document.querySelectorAll('.screen')].find(s => !s.hidden)?.id || 'game';
  return g ? `${g.match?.mode || 'match'} ${Math.round(g.world?.time || 0)}s${g.spectating ? ' (spectating)' : ''}` : screen;
}

export function report(message, stack = '') {
  const key = `${message}|${String(stack).slice(0, 200)}`;
  if (sent >= 10 || seen.has(key)) return;
  seen.add(key);
  sent++;
  const body = JSON.stringify({ message: String(message).slice(0, 500), stack: String(stack).slice(0, 4000), url: location.pathname, ua: navigator.userAgent, context: context() });
  try {
    if (navigator.sendBeacon) navigator.sendBeacon(`${BASE}api/client-error`, new Blob([body], { type: 'application/json' }));
    else fetch(`${BASE}api/client-error`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch { /* reporting must never throw */ }
}

window.addEventListener('error', e => { if (e.message) report(e.message, e.error?.stack || `${e.filename}:${e.lineno}:${e.colno}`); });
window.addEventListener('unhandledrejection', e => report(`Unhandled rejection: ${e.reason?.message || e.reason}`, e.reason?.stack || ''));
