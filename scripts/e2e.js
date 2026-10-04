/* End-to-end browser test for the MOBA: builds on `npm run build` output,
   starts a real server and drives two browsers plus offline mode.
   Usage: npm run build && npm run test:e2e   (needs `npx playwright install chromium`) */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../server/index.js';

const OUT = path.resolve('e2e-screenshots');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'br-e2e-'));
const app = await startServer({ port: 0, host: '127.0.0.1', dataDir, quiet: true, databaseUrl: '', queueBotWait: 30, selectTime: 25 });
const BASE = `http://127.0.0.1:${app.port}`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--renderer-process-limit=3', '--js-flags=--max-old-space-size=256'] });
const errors = [];
let step = 0;
const log = msg => console.log(`  ✓ ${msg}`);

async function newPage(label, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 680 }, ...opts });
  await ctx.addInitScript(() => localStorage.setItem('broadroads_settings', JSON.stringify({ quality: 'low', volume: 0, showFps: false })));
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`[${label}] ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|fonts\.g/.test(m.text())) errors.push(`[${label}] ${m.text()}`); });
  page.label = label;
  return page;
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${String(++step).padStart(2, '0')}-${page.label}-${name}.png`), animations: 'disabled' });
const waitFor = (page, fn, arg, timeout = 30000) => page.waitForFunction(([src, a]) => new Function('app', 'g', 'arg', `return (${src})(app, g, arg)`)(window.__app, window.__broadroads, a), [fn.toString(), arg], { timeout, polling: 250 });
const evalIn = (page, fn, arg) => page.evaluate(([src, a]) => new Function('app', 'g', 'arg', `return (${src})(app, g, arg)`)(window.__app, window.__broadroads, a), [fn.toString(), arg]);

async function register(page, name) {
  await page.goto(BASE);
  await page.waitForSelector('#server-status.online', { timeout: 15000 });
  await page.click('.tab[data-tab=register]');
  await page.fill('#auth-user', name);
  await page.fill('#auth-pass', 'secret123');
  await page.click('#auth-submit');
  await page.waitForSelector('#screen-lobby:not([hidden]) .lob-play', { timeout: 20000 });
}

try {
  console.log('Online: two players');
  const a = await newPage('ayla');
  const b = await newPage('brom');
  await register(a, 'Ayla');
  await register(b, 'Brom');
  log('both players registered and reached the lobby');
  await shot(a, 'lobby');

  await a.fill('.lob-chat .chat-input', 'Hello from Ayla!');
  await a.press('.lob-chat .chat-input', 'Enter');
  await b.waitForFunction(() => document.querySelector('.lob-chat .chat-log').textContent.includes('Hello from Ayla!'), null, { timeout: 15000 });
  log('lobby chat delivered');

  await a.fill('.lob-party .invite-row input', 'Brom');
  await a.click('.lob-party .invite-row .btn');
  await b.waitForSelector('.prompt-card', { timeout: 15000 });
  await b.click('.prompt-card .btn-primary');
  await a.waitForFunction(() => document.querySelector('.lob-party').textContent.includes('Brom'), null, { timeout: 10000 });
  log('party invite accepted');

  for (const t of ['champions', 'leaderboard', 'profile', 'play']) {
    await a.click(`.lob-tab[data-tab=${t}]`);
    await a.waitForTimeout(300);
    if (t !== 'play') await shot(a, `tab-${t}`);
  }
  log('champions, leaderboard and profile tabs render');

  await a.click('.play-card:nth-of-type(3) .btn');
  await a.waitForSelector('.room-code b', { timeout: 10000 });
  const code = await a.textContent('.room-code b');
  await b.fill('.code-input', code);
  await b.click('.play-card:nth-of-type(3) .row:last-child .btn');
  await a.waitForFunction(() => document.querySelectorAll('.room-slot:not(.empty)').length >= 2, null, { timeout: 10000 });
  await a.click('.room .btn-row .btn:not(.btn-primary):not(.btn-danger)');
  await a.waitForFunction(() => document.querySelectorAll('.room-slot.empty').length === 0, null, { timeout: 10000 });
  await shot(a, 'room');
  await a.click('.room .btn-primary');
  log(`custom room ${code}: joined by code, filled with bots, started`);

  for (const [p, nth] of [[a, 2], [b, 4]]) {
    await p.waitForSelector('#screen-select:not([hidden]) .sel-grid', { timeout: 15000 });
    await p.click(`.sel-grid .champ-card:nth-child(${nth})`);
  }
  await shot(a, 'select');
  for (const p of [a, b]) await p.click('.sel-center .btn-primary');
  await waitFor(a, (app, g) => g && g.world.me);
  await waitFor(b, (app, g) => g && g.world.me);
  const ids = [await evalIn(a, (app, g) => g.match.id), await evalIn(b, (app, g) => g.match.id)];
  if (ids[0] !== ids[1]) throw new Error('players are in different matches');
  log('champion select locked in; both players loaded into the same match');
  await a.waitForTimeout(2500);
  await shot(a, 'match');

  await a.keyboard.press('Enter');
  await a.keyboard.type('gl hf team');
  await a.keyboard.press('Enter');
  await b.waitForFunction(() => document.querySelector('.m-chat .chat-log').textContent.includes('gl hf team'), null, { timeout: 15000 });
  log('team chat delivered in match');
  await a.keyboard.press('p');
  await a.waitForSelector('.panel-shop .shop-card', { timeout: 5000 });
  await a.dblclick('.panel-shop .shop-card:first-child');
  await waitFor(a, (app, g) => g.world.me.it.some(i => i && i.id === 'potion'));
  await shot(a, 'shop');
  await a.keyboard.press('Escape');
  log('bought a potion from the shop');
  await a.click('.mb-slot .mb-up:not([hidden])');
  await waitFor(a, (app, g) => Object.values(g.world.me.rk).some(r => r === 1));
  log('leveled an ability with the + button');
  const start = await evalIn(a, (app, g) => { const y = g.world.you(); return { x: y.x, y: y.y }; });
  const mini = await a.locator('.m-mini').boundingBox();
  await a.mouse.click(mini.x + mini.width * 0.4, mini.y + mini.height * 0.6, { button: 'right' });
  await waitFor(a, (app, g, s) => { const y = g.world.you(); return Math.hypot(y.x - s.x, y.y - s.y) > 4; }, start);
  log('right-click on the minimap moves the champion');
  await a.keyboard.down('Tab');
  await a.waitForSelector('.panel-score .sb-table', { timeout: 5000 });
  await shot(a, 'scoreboard');
  await a.keyboard.up('Tab');
  log('scoreboard (Tab) shows both teams');

  await evalIn(b, (app, g) => g.quit());
  await b.waitForSelector('#screen-lobby:not([hidden]) .pulse', { timeout: 15000 });
  await b.click('.pulse');
  await waitFor(b, (app, g) => g && g.world.me);
  log('left the match (AI took over) and reconnected from the lobby');
  await a.context().close();
  await b.context().close();

  console.log('Offline mode');
  const o = await newPage('offline');
  await o.goto(BASE);
  await o.waitForSelector('#server-status.online', { timeout: 15000 });
  await o.click('.tab[data-tab=offline]');
  await o.fill('#auth-user', 'Wanderer');
  await o.click('#auth-submit');
  await o.waitForSelector('#screen-lobby:not([hidden]) .lob-play', { timeout: 20000 });
  await o.click('.play-card:nth-of-type(2) .btn');
  await o.waitForSelector('#screen-select:not([hidden]) .sel-grid', { timeout: 15000 });
  await o.click('.sel-grid .champ-card:nth-child(8)');
  await o.click('.sel-center .btn-primary');
  await waitFor(o, (app, g) => g && g.world.me && app.offline);
  await o.waitForTimeout(2000);
  await shot(o, 'practice');
  log('offline practice vs AI runs in the browser');
  await evalIn(o, (app) => app.send({ t: 'abandon' }));
  await o.waitForSelector('#screen-lobby:not([hidden])', { timeout: 15000 });
  log('offline: returned to the lobby');
} catch (err) {
  errors.push(`FAILED: ${err.message}`);
} finally {
  await browser.close();
  await app.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
}

if (errors.length) {
  console.error('\nE2E problems:\n' + errors.map(e => '  ✗ ' + e).join('\n'));
  process.exit(1);
}
console.log(`\nE2E passed. Screenshots in ${OUT}`);
