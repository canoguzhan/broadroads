/* Renders frame strips of animation clips (public/models/<id>.glb) so trim windows for
   attack/cast clips (WINDOWS in build-models.mjs) can be picked by eye.
   Usage: OUT=dir node scripts/clip-frames.mjs id:clip [id:clip ...]   (12 frames per clip, times labelled) */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { chromium } from 'playwright'; import sharp from 'sharp';
const ROOT = path.resolve('.'), OUT = path.resolve(process.env.OUT || 'clip-frames');
fs.mkdirSync(OUT, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => { const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(b); }); }).listen(0);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 256, height: 256 } });
for (const spec of process.argv.slice(2)) {
  const [id, clip] = spec.split(':');
  await page.goto(`http://localhost:${server.address().port}/scripts/clip-frames.html?id=${id}&clip=${clip}`);
  await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
  const dur = await page.evaluate(() => window.duration);
  const N = 12, tiles = [];
  for (let i = 0; i < N; i++) {
    const t = (dur * i) / (N - 1);
    const url = await page.evaluate(t => window.frameAt(t), t);
    const label = Buffer.from(`<svg width="256" height="256"><text x="8" y="24" font-size="20" fill="#fde047" font-family="DejaVu Sans">${t.toFixed(2)}s</text></svg>`);
    tiles.push({ input: await sharp(Buffer.from(url.split(',')[1], 'base64')).composite([{ input: label }]).toBuffer(), left: (i % 6) * 256, top: Math.floor(i / 6) * 256 });
  }
  await sharp({ create: { width: 1536, height: 512, channels: 3, background: '#000' } }).composite(tiles).jpeg({ quality: 75 }).toFile(path.join(OUT, `${id}_${clip}.jpg`));
  console.log(`✓ ${id}:${clip} (${dur.toFixed(2)}s)`);
}
await browser.close(); server.close();
