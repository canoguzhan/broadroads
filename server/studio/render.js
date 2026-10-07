/* Renders one fight from its replay in headless Chromium: the game client runs in studio
   capture mode (client/game/studio.js), one video frame per step, frames stream as JPEG into
   ffmpeg (H.264, no audio). Also returns the game's sound log and a clean thumbnail frame. */
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { playwright, ffmpeg, CHROMIUM_ARGS } from './tools.js';

// A frame normally takes about a second. Minutes without one means the renderer is starved
// (e.g. throttled at the service's memory limit): fail loudly instead of crawling for hours.
const STALL_MS = 3 * 60e3;
function stall(promise) {
  let timer;
  const timeout = new Promise((_, fail) => { timer = setTimeout(() => fail(new Error('Rendering stalled: no frame for 3 minutes (the server may be out of memory). Press Resume to retry.')), STALL_MS); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export const SIZES = { landscape: { width: 1920, height: 1080 }, portrait: { width: 1080, height: 1920 } };

/**
 * opts: { hostUrl, replayId, layout, start, end, fps, quality, captions, track, tag, hook,
 *         outFile, thumbAt, thumbFile, onProgress, signal }
 * Returns { sounds, frames }.
 */
export async function renderFight(opts) {
  const { hostUrl, replayId, layout, start, end, fps = 30, quality = 'medium', outFile, onProgress = () => {}, signal } = opts;
  const { chromium } = await playwright();
  const ff = await ffmpeg();
  const size = SIZES[layout];
  const browser = await chromium.launch({ args: CHROMIUM_ARGS });
  let enc = null;
  try {
    const ctx = await browser.newContext({ viewport: size, serviceWorkers: 'block', deviceScaleFactor: 1 });
    await ctx.addInitScript(q => {
      try { localStorage.setItem('broadroads_settings', JSON.stringify({ quality: q, volume: 0, musicVolume: 0, models: true, lang: 'en' })); } catch { /* storage blocked */ }
    }, quality);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${hostUrl}/?replay=${replayId}&t=${start}&studio=${layout}`, { timeout: 120000 });
    await page.waitForFunction(() => window.__studio?.ready, null, { timeout: 180000 }).catch(() => { throw new Error(`studio mode did not start${errors.length ? `: ${errors[0]}` : ''}`); });
    await page.waitForLoadState('networkidle', { timeout: 120000 }).catch(() => {});
    await page.evaluate(o => window.__studio.setup(o), { captions: opts.captions || [], track: opts.track || [], tag: opts.tag || '', hook: opts.hook || '', hookUntil: opts.hookUntil || 0 });
    // Warm-up: a few frames so models, textures and shaders are resident before recording.
    for (let i = 0; i < 6; i++) await page.evaluate(() => window.__studio.warm());
    await page.evaluate(() => window.__studio.sounds());

    enc = spawn(ff, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-threads', '3', '-x264-params', 'rc-lookahead=20', '-pix_fmt', 'yuv420p', '-r', String(fps), '-movflags', '+faststart', outFile], { stdio: ['pipe', 'ignore', 'pipe'] });
    let encErr = '';
    enc.stderr.on('data', d => { encErr += d; });
    const encDone = new Promise((ok, fail) => enc.on('close', code => (code === 0 ? ok() : fail(new Error(`ffmpeg encode failed: ${encErr.slice(-400)}`)))));
    enc.stdin.on('error', () => {});

    const cdp = await ctx.newCDPSession(page);
    const total = Math.ceil((end - start) * fps);
    const sounds = [];
    let thumbDone = !opts.thumbFile;
    const t0 = Date.now();
    for (let i = 0; i < total; i++) {
      if (signal?.aborted) throw new Error('cancelled');
      const clock = await stall(page.evaluate(dt => window.__studio.step(dt), 1 / fps));
      if (!thumbDone && clock >= opts.thumbAt) {
        thumbDone = true;
        await page.evaluate(() => window.__studio.overlay(false));
        const png = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
        fs.writeFileSync(opts.thumbFile, Buffer.from(png.data, 'base64'));
        await page.evaluate(() => window.__studio.overlay(true));
      }
      const shot = await stall(cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 90, optimizeForSpeed: true }));
      if (!enc.stdin.write(Buffer.from(shot.data, 'base64'))) await new Promise(r => enc.stdin.once('drain', r));
      if (i % 15 === 0) {
        sounds.push(...await page.evaluate(() => window.__studio.sounds()));
        const per = (Date.now() - t0) / (i + 1);
        onProgress({ frame: i + 1, total, etaSec: Math.round((total - i - 1) * per / 1000) });
      }
    }
    sounds.push(...await page.evaluate(() => window.__studio.sounds()));
    enc.stdin.end();
    await encDone;
    if (errors.length) onProgress({ warn: errors.slice(0, 3).join(' | ') });
    return { sounds: sounds.map(s => ({ ...s, t: Math.round((s.t - start) * 1000) / 1000 })).filter(s => s.t >= 0), frames: total };
  } finally {
    if (enc && enc.exitCode === null) { try { enc.stdin.end(); } catch { /* closed */ } }
    await browser.close().catch(() => {});
  }
}

/** Renders a static HTML card (title/outro/thumbnail) to a JPEG. */
export async function renderCard(html, { width, height, file }) {
  const { chromium } = await playwright();
  const browser = await chromium.launch({ args: CHROMIUM_ARGS });
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.setContent(html, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
  } finally { await browser.close().catch(() => {}); }
  return file;
}
