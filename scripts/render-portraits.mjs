/* Renders portrait images from the 3D models (public/models) into
   public/portraits/<id>.webp — champion busts for the UI and creature
   portraits used as profile pictures. Run after build-models.mjs.

   Usage: node scripts/render-portraits.mjs [id ...] */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { CATALOG } from './model-catalog.mjs';

const ROOT = path.resolve('.');
const OUT = path.resolve('public/portraits');
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);

// Champions as busts; a selection of creatures, full body, for profile pictures.
const PORTRAITS = [
  ...CATALOG.filter(a => a.group === 'champion').map(a => ({ id: a.id, frame: 'bust' })),
  ...['mob_mossback', 'mob_brute', 'mob_stonehulk', 'mob_titan', 'mob_wolf', 'mob_wyrm', 'mob_bat', 'mob_toad',
    'minion_melee_blue', 'minion_caster_blue', 'minion_super_blue', 'minion_melee_red', 'minion_caster_red', 'minion_super_red']
    .map(id => ({ id, frame: 'full', yaw: CATALOG.find(a => a.id === id)?.yaw })),
].filter(p => !only.length || only.includes(p.id));

const types = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
for (const p of PORTRAITS) {
  const q = new URLSearchParams({ id: p.id, frame: p.frame, size: '512', ...(p.yaw !== undefined ? { yaw: String(p.yaw) } : {}) });
  await page.goto(`http://localhost:${port}/scripts/portrait.html?${q}`);
  await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
  const status = await page.evaluate(() => window.ready);
  if (status !== true) { console.error(`✗ ${p.id}: ${status}`); continue; }
  const png = await page.locator('canvas').screenshot({ omitBackground: true });
  await sharp(png).resize(256, 256).webp({ quality: 88, alphaQuality: 90 }).toFile(path.join(OUT, `${p.id}.webp`));
  console.log(`✓ ${p.id}`);
}
await browser.close();
server.close();
const ids = fs.readdirSync(OUT).filter(f => f.endsWith('.webp')).map(f => f.replace('.webp', '')).sort();
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(ids));
