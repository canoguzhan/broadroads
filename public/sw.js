/* BroadRoads service worker: makes the game installable and keeps its heavy
   files on the device so later visits start fast.
   - /assets/* (hashed build output) and versioned models (?v=): cache-first.
   - sounds, icons, portraits and the model manifest: stale-while-revalidate.
   - pages: network-first, falling back to the cached shell when offline.
   - /api and /ws: never touched. */
const VERSION = 'br-v2';
const STATIC = `${VERSION}-static`, MEDIA = `${VERSION}-media`, PAGES = `${VERSION}-pages`;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(PAGES).then(c => c.addAll(['/', '/manifest.webmanifest', '/icon-192.png'])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (!k.startsWith(VERSION) && !k.startsWith('br-pack')) await caches.delete(k); // the HD pack outlives updates
    await self.clients.claim();
  })());
});

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await caches.match(req); // any cache: also finds the HD pack the player downloaded
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, name, e) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  const net = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; });
  if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
  return net;
}

async function networkFirst(req) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put('/', res.clone());
    return res;
  } catch {
    return (await cache.match('/')) || Response.error();
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const p = url.pathname;
  if (p.startsWith('/api') || p.startsWith('/ws') || p === '/sw.js' || p.startsWith('/admin')) return;
  if (req.mode === 'navigate') return e.respondWith(networkFirst(req));
  if (p.startsWith('/assets/') || (p.startsWith('/models/') && url.searchParams.has('v'))) return e.respondWith(cacheFirst(req, STATIC));
  if (/^\/(sfx|icons|portraits|landing|models)\//.test(p) || /\.(png|webp|jpg|webmanifest)$/.test(p)) return e.respondWith(staleWhileRevalidate(req, MEDIA, e));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => (list[0] ? list[0].focus() : self.clients.openWindow('/'))));
});
