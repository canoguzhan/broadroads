/* End-to-end browser test: builds on `npm run build` output, starts a real
   server, and drives two browsers through online play plus offline mode.
   Usage: npm run build && npm run test:e2e   (needs `npx playwright install chromium`) */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../server/index.js';

const OUT = path.resolve('e2e-screenshots');
fs.mkdirSync(OUT, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'br-e2e-'));
const app = await startServer({ port: 0, host: '127.0.0.1', dataDir, quiet: true, databaseUrl: '', queueBotWait: 30, worldBossFirst: 9999 });
const BASE = `http://127.0.0.1:${app.port}`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--renderer-process-limit=3', '--js-flags=--max-old-space-size=256'] });
const errors = [];
let step = 0;

function log(msg) { console.log(`  ✓ ${msg}`); }

async function newPage(label) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
  await ctx.addInitScript(() => localStorage.setItem('broadroads_settings', JSON.stringify({ quality: 'low', volume: 0, showFps: false })));
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`[${label}] ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|fonts\.g/.test(m.text())) errors.push(`[${label}] ${m.text()}`); });
  page.label = label;
  return page;
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${String(++step).padStart(2, '0')}-${page.label}-${name}.png`), animations: 'disabled' });
const game = (page, fn, arg) => page.evaluate(([src, a]) => new Function('g', 'arg', `return (${src})(g, arg)`)(window.__broadroads, a), [fn.toString(), arg]);
const waitGame = (page, fn, arg, timeout = 30000) => page.waitForFunction(([src, a]) => { const g = window.__broadroads; return g && new Function('g', 'arg', `return (${src})(g, arg)`)(g, a); }, [fn.toString(), arg], { timeout, polling: 250 });

async function register(page, name, cls) {
  await page.goto(BASE);
  await page.waitForSelector('#server-status.online', { timeout: 15000 });
  await page.click('.tab[data-tab=register]');
  await page.fill('#auth-user', name);
  await page.fill('#auth-pass', 'secret123');
  await page.click('#auth-submit');
  await page.waitForSelector('#screen-create:not([hidden])', { timeout: 20000 });
  await page.click(`.class-card:nth-child(${cls}) .btn`);
  await waitGame(page, g => g.world.zone && g.world.zone.kind === 'world' && g.world.me);
}

try {
  console.log('Online: two players');
  const a = await newPage('ayla');
  const b = await newPage('brom');
  await register(a, 'Ayla', 1);
  await register(b, 'Brom', 3);
  log('both players registered, chose classes and spawned in town');
  await waitGame(a, g => [...g.world.entities.values()].some(e => e.kind === 'player' && e.n === 'Brom'));
  await waitGame(a, () => [...document.querySelectorAll('.nameplate .np-name')].some(n => n.textContent.includes('Brom')));
  log('players see each other (entity + nameplate)');
  await shot(a, 'town');

  // Chat through the real input box.
  await a.keyboard.press('Enter');
  await a.keyboard.type('Hello from Ayla!');
  await a.keyboard.press('Enter');
  await b.waitForFunction(() => document.querySelector('.chat-log').textContent.includes('Hello from Ayla!'), null, { timeout: 15000 });
  log('chat message delivered through the UI');
  await b.waitForFunction(() => [...document.querySelectorAll('.chat-bubble')].some(el => el.textContent === 'Hello from Ayla!'), null, { timeout: 15000 });
  await shot(b, 'chat-bubble');
  log('chat bubble shown above the speaker');

  // Party invite via slash command, accepted through the prompt card.
  await a.keyboard.press('Enter');
  await a.keyboard.type('/invite Brom');
  await a.keyboard.press('Enter');
  await b.waitForSelector('.prompt-card', { timeout: 15000 });
  await shot(b, 'invite');
  await b.click('.prompt-card .btn-primary');
  await waitGame(a, g => g.party && g.party.members.length === 2);
  await a.waitForSelector('.party-member', { timeout: 10000 });
  log('party invite accepted; party frames visible');

  // Panels.
  for (const [key, sel] of [['i', '.panel-inventory'], ['c', '.panel-character'], ['p', '.panel-social'], ['l', '.panel-leaderboard'], ['h', '.panel-help']]) {
    await a.keyboard.press(key);
    await a.waitForSelector(sel, { timeout: 10000 });
    if (key === 'p') await a.waitForFunction(() => document.querySelector('.panel-social').textContent.includes('Brom'), null, { timeout: 10000 });
    if (key === 'l') await a.waitForSelector('.lb-table', { timeout: 10000 });
    await shot(a, sel.slice(7));
    await a.keyboard.press('Escape');
  }
  await a.keyboard.press('Escape');
  await a.waitForSelector('.panel-settings', { timeout: 5000 });
  await a.keyboard.press('Escape');
  log('inventory, character, social, leaderboard, help and settings panels open');

  // NPC services from town.
  await game(a, g => g.panels.toggle('merchant'));
  await a.waitForSelector('.panel-merchant .shop-row', { timeout: 10000 });
  const gold0 = await game(a, g => g.char.gold);
  await a.click('.panel-merchant .shop-row .btn');
  await waitGame(a, (g, g0) => g.char.gold < g0, gold0);
  await shot(a, 'merchant');
  log('bought a potion from the merchant');
  await game(a, g => g.panels.toggle('blacksmith'));
  await a.waitForSelector('.panel-blacksmith .recipe-row', { timeout: 10000 });
  await shot(a, 'refinery');
  await game(a, g => g.panels.toggle('trainer'));
  await a.waitForSelector('.panel-trainer .class-card', { timeout: 10000 });
  await a.keyboard.press('Escape');
  log('refinery and trainer panels work');

  // Party dungeon.
  await game(a, g => g.panels.toggle('dungeon'));
  await a.waitForSelector('.panel-dungeon', { timeout: 10000 });
  await a.click('.panel-dungeon .mode-card:nth-child(2) .btn');
  await waitGame(a, g => g.world.zone.kind === 'dungeon');
  await waitGame(b, g => g.world.zone.kind === 'dungeon');
  const same = await game(a, g => g.world.zone.id) === await game(b, g => g.world.zone.id);
  if (!same) throw new Error('party members ended up in different dungeons');
  await a.waitForTimeout(2500);
  await shot(a, 'party-dungeon');
  log('party dungeon: both players pulled into the same instance');
  await waitGame(a, g => g.world.meta && g.world.meta.floor === 1 && g.world.meta.left > 0);
  await a.click('.tracker .btn');
  await waitGame(a, g => g.world.zone.kind === 'world');
  log('left the dungeon back to town');

  // Arena practice.
  await game(b, g => g.send({ t: 'dungeon', op: 'leave' }));
  await waitGame(b, g => g.world.zone.kind === 'world');
  await game(b, g => g.panels.toggle('arena'));
  await b.waitForSelector('.panel-arena', { timeout: 10000 });
  await b.click('.panel-arena .mode-card:nth-child(1) .btn-sm');
  await waitGame(b, g => g.world.zone.kind === 'arena');
  await waitGame(b, g => g.world.meta && g.world.meta.phase === 'fight', null, 40000);
  await b.waitForTimeout(2000);
  await shot(b, 'arena');
  log('arena practice duel started and reached the fight phase');
  await game(b, g => g.send({ t: 'arena', op: 'leave' }));
  await waitGame(b, g => g.world.zone.kind === 'world');

  // Ranked duel between the two humans.
  await game(a, g => g.send({ t: 'arena', op: 'queue', mode: 'duel' }));
  await game(b, g => g.send({ t: 'arena', op: 'queue', mode: 'duel' }));
  await waitGame(a, g => g.world.zone.kind === 'arena', null, 30000);
  await waitGame(b, g => g.world.zone.kind === 'arena');
  if (await game(a, g => g.world.zone.id) !== await game(b, g => g.world.zone.id)) throw new Error('duel players were split into different arenas');
  await waitGame(a, g => g.world.meta && g.world.meta.ranked === true);
  log('matchmaking paired both players into the same ranked duel');
  await a.keyboard.press('Escape');
  await a.close();
  // The disconnected hero is taken over by the AI (flag 128 = bot-controlled).
  await waitGame(b, g => [...g.world.entities.values()].some(e => e.kind === 'player' && e.n === 'Ayla' && (e.fl & 128)), null, 40000);
  log('disconnected opponent is taken over by the AI');
  await game(b, g => g.send({ t: 'arena', op: 'leave' }));
  await waitGame(b, g => g.world.zone.kind === 'world');
  await b.context().close();

  console.log('Offline mode');
  const o = await newPage('offline');
  await o.goto(BASE);
  await o.waitForSelector('#server-status.online', { timeout: 15000 });
  await o.click('.tab[data-tab=offline]');
  await o.fill('#auth-user', 'Wanderer');
  await o.click('#auth-submit');
  await o.waitForSelector('#screen-create:not([hidden])', { timeout: 20000 });
  await o.click('.class-card:nth-child(2) .btn');
  await waitGame(o, g => g.offline && g.world.zone && g.world.zone.kind === 'world' && g.world.me);
  log('offline hero created and in town (in-browser server)');
  await game(o, g => g.send({ t: 'dungeon', op: 'enter', mode: 'solo', floor: 1 }));
  await waitGame(o, g => g.world.zone.kind === 'dungeon' && g.world.meta.mode === 'solo');
  await o.waitForTimeout(1500);
  await shot(o, 'solo-dungeon');
  log('offline solo dungeon');
  await game(o, g => g.send({ t: 'arena', op: 'practice', mode: 'team' }));
  await o.waitForTimeout(500);
  await game(o, g => g.send({ t: 'dungeon', op: 'leave' }));
  await waitGame(o, g => g.world.zone.kind === 'world');
  await game(o, g => g.send({ t: 'arena', op: 'practice', mode: 'team' }));
  await waitGame(o, g => g.world.zone.kind === 'arena' && g.world.meta.mode === 'team');
  log('offline team arena vs bots');
  await game(o, g => g.logout());
  await o.waitForSelector('#screen-auth:not([hidden])');
  await o.click('.tab[data-tab=offline]');
  await o.fill('#auth-user', 'Wanderer');
  await o.click('#auth-submit');
  await waitGame(o, g => g.char && g.char.cls === 'gunner' && g.world.zone);
  log('offline hero persisted in localStorage');
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
