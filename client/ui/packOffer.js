/* The HD environment pack offer (lobby card) and its Settings row. */
import { h } from './dom.js';
import { packInstalled, packSupported, packInfo, installPack, removePack } from '../render/assetPack.js';

const DISMISS = 'broadroads_hd_pack_dismissed';
const mb = b => `${(b / 1048576).toFixed(1)} MB`;

function installButton(label, onDone, ui) {
  const bar = h('i'), meter = h('span.pack-meter', { hidden: true }, bar);
  const btn = h('button.btn.btn-sm.btn-primary', { type: 'button' }, label);
  btn.addEventListener('click', async () => {
    btn.disabled = true; meter.hidden = false;
    try {
      await installPack(p => { bar.style.width = `${Math.round(p * 100)}%`; });
      ui?.toast('HD pack saved on this device. It shows from your next match.', 'good', 5000);
      onDone();
    } catch (err) {
      btn.disabled = false; meter.hidden = true;
      ui?.toast(err.message || 'Download failed.', 'warn', 5000);
    }
  });
  return [btn, meter];
}

/** Lobby card: shown until the player installs or dismisses it (not on Low quality). */
export function packOffer(app) {
  let dismissed = false;
  try { dismissed = localStorage.getItem(DISMISS) === '1'; } catch { /* ignore */ }
  if (!packSupported() || packInstalled() || dismissed || app.settings.quality === 'low' || app.settings.models === false) return null;
  const size = h('span.muted', { text: '' });
  const card = h('aside.pack-offer', {},
    h('b', { text: '🌲 HD environment pack' }),
    h('p', {}, 'Lush trees, shrubs and grass for the Valley. Downloads once and stays on this device. ', size),
    h('div.pack-actions', {},
      ...installButton('Download', () => card.remove(), app.ui),
      h('button.btn.btn-sm', { type: 'button', onclick: () => { try { localStorage.setItem(DISMISS, '1'); } catch { /* ignore */ } card.remove(); } }, 'Not now')));
  packInfo().then(({ bytes, files }) => { if (!files.length) card.remove(); else size.textContent = `(${mb(bytes)})`; });
  return card;
}

/** Settings row: install or remove. */
export function packSetting(ui) {
  const row = h('div.field.pack-setting');
  const render = () => {
    row.replaceChildren(h('span', { text: 'HD environment pack (trees and foliage; not used on Low quality)' }));
    if (!packSupported()) return row.append(h('span.muted', { text: 'Not supported in this browser' }));
    if (packInstalled()) row.append(h('div.pack-actions', {}, h('span.muted', { text: 'Installed ✓' }), h('button.btn.btn-sm', { type: 'button', onclick: async () => { await removePack(); render(); } }, 'Remove')));
    else row.append(h('div.pack-actions', {}, ...installButton('Download', render, ui)));
  };
  render();
  return row;
}
