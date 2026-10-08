/* Heavy tools the studio needs but the game server doesn't: Playwright (Chromium) and ffmpeg.
   In development they come from the repo's devDependencies; in production (where devDependencies
   are pruned) from STUDIO_TOOLS, a separate folder set up by deploy/studio-setup.sh. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const TOOLS = process.env.STUDIO_TOOLS || '/opt/broadroads-studio-tools';

async function load(name) {
  try { return await import(name); } catch { /* not in the repo's node_modules */ }
  const req = createRequire(path.join(TOOLS, 'package.json'));
  return import(pathToFileURL(req.resolve(name)).href);
}

export async function playwright() {
  const m = await load('playwright');
  return m.chromium ? m : m.default;
}

let ffmpegPath = null;
export async function ffmpeg() {
  if (ffmpegPath) return ffmpegPath;
  if (process.env.FFMPEG && fs.existsSync(process.env.FFMPEG)) return (ffmpegPath = process.env.FFMPEG);
  const m = await load('ffmpeg-static');
  ffmpegPath = m.default || m;
  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) throw new Error('ffmpeg not found (set FFMPEG or run deploy/studio-setup.sh)');
  return ffmpegPath;
}


export const CHROMIUM_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--mute-audio', '--js-flags=--max-old-space-size=768'];
