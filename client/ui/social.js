/* Muting (kept on this device) and reporting players. */
const KEY = 'broadroads_muted';
let muted;
try { muted = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { muted = new Set(); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...muted])); } catch { /* ignore */ } };

export const isMuted = name => !!name && muted.has(name.toLowerCase());
export function toggleMute(name) {
  const k = name.toLowerCase();
  if (muted.has(k)) muted.delete(k); else muted.add(k);
  save();
  return muted.has(k);
}

/** Small dialog: pick a reason, optional note, send. */
export function openReport(ui, send, name, matchId) {
  const reasons = [['afk', 'AFK / not playing'], ['abuse', 'Abusive chat or harassment'], ['cheating', 'Cheating or exploiting'], ['other', 'Something else']];
  const wrap = document.createElement('div');
  wrap.className = 'report-dlg';
  wrap.innerHTML = `<div class="rd-card"><h3></h3><div class="rd-reasons"></div><textarea maxlength="200" placeholder="Optional details"></textarea><div class="btn-row"><button class="btn btn-primary" data-send>Send report</button><button class="btn" data-cancel>Cancel</button></div></div>`;
  wrap.querySelector('h3').textContent = `Report ${name}`;
  let reason = 'afk';
  const box = wrap.querySelector('.rd-reasons');
  for (const [id, label] of reasons) {
    const b = document.createElement('button');
    b.className = `summ-btn${id === reason ? ' active' : ''}`;
    b.textContent = label;
    b.onclick = () => { reason = id; for (const x of box.children) x.classList.toggle('active', x === b); };
    box.append(b);
  }
  wrap.querySelector('[data-cancel]').onclick = () => wrap.remove();
  wrap.querySelector('[data-send]').onclick = () => { send({ t: 'report', name, reason, match: matchId, note: wrap.querySelector('textarea').value }); wrap.remove(); };
  wrap.onclick = e => { if (e.target === wrap) wrap.remove(); };
  document.body.append(wrap);
}
