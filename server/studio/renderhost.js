/* Loopback-only web server the studio's headless browser renders from: the built game
   client (dist/), the studio's fight replays at /replays/<id>.ndjson and /api/gamedata.
   It binds 127.0.0.1 on a random port and is never exposed through Caddy. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { CHAMPION_IDS, championInfo } from '../../shared/moba/champions.js';
import { ITEMS, SPELLS, SECOND_SPELLS } from '../../shared/moba/items.js';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json',
};

/** replayFile(id) → absolute path of a gzipped replay or null. Resolves to { url, close }. */
export function startRenderHost({ staticDir, replayFile }) {
  const gameData = JSON.stringify({ champions: CHAMPION_IDS.map(championInfo), items: ITEMS, spells: SPELLS, second: SECOND_SPELLS });
  const server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/api/gamedata') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(gameData); }
    const rp = /^\/replays\/([a-z0-9-]+)\.ndjson$/.exec(p);
    if (rp) {
      const f = replayFile(rp[1]);
      if (!f) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      return fs.createReadStream(f).pipe(zlib.createGunzip()).pipe(res);
    }
    let rel = decodeURIComponent(p);
    if (rel.endsWith('/')) rel += 'index.html';
    let file = path.normalize(path.join(staticDir, rel));
    if (!file.startsWith(staticDir)) { res.writeHead(403); return res.end(); }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      if (path.extname(rel)) { res.writeHead(404); return res.end(); }
      file = path.join(staticDir, 'index.html');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'max-age=3600' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(r => server.close(r)) }));
  });
}
