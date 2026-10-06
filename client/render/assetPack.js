/* HD environment pack: higher-detail trees, shrubs and grass (group 'pack' in
   public/models/manifest.json). Players opt in once; the files go into the
   browser's Cache Storage (the service worker serves them from there) and
   the browser is asked to keep that storage, so later visits don't download
   them again. Low quality never uses the pack. */
const BASE = `${import.meta.env.BASE_URL || '/'}models/`;
const CACHE = 'br-pack-v1';
const FLAG = 'broadroads_hd_pack';

export const packInstalled = () => { try { return localStorage.getItem(FLAG) === CACHE; } catch { return false; } };
export const packSupported = () => typeof caches !== 'undefined';

/** The pack's files and total size, from the model manifest. */
export async function packInfo() {
  const m = await fetch(`${BASE}manifest.json`).then(r => r.json()).catch(() => ({}));
  const files = Object.entries(m).filter(([, e]) => e.group === 'pack').map(([id, e]) => ({ id, url: `${BASE}${e.file}?v=${e.v}`, bytes: e.bytes || 0 }));
  return { files, bytes: files.reduce((n, f) => n + f.bytes, 0) };
}

/** Downloads the pack into Cache Storage; onProgress(0..1). Resolves when everything is stored. */
export async function installPack(onProgress = () => {}) {
  const { files, bytes } = await packInfo();
  if (!files.length) throw new Error('The HD pack is not available on this server.');
  const cache = await caches.open(CACHE);
  let done = 0;
  for (const f of files) {
    const res = await fetch(f.url, { cache: 'no-store' });
    if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}).`);
    const reader = res.body.getReader(), chunks = [];
    for (;;) {
      const { done: end, value } = await reader.read();
      if (end) break;
      chunks.push(value);
      done += value.length;
      onProgress(bytes ? Math.min(1, done / bytes) : 0);
    }
    await cache.put(f.url, new Response(new Blob(chunks), { headers: { 'Content-Type': 'model/gltf-binary' } }));
  }
  try { await navigator.storage?.persist?.(); } catch { /* best effort */ }
  try { localStorage.setItem(FLAG, CACHE); } catch { /* ignore */ }
  onProgress(1);
}

export async function removePack() {
  try { localStorage.removeItem(FLAG); } catch { /* ignore */ }
  if (packSupported()) await caches.delete(CACHE);
}
