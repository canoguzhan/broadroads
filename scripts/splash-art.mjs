/* Champion splash art (Higgsfield image edit guided by each champion's concept or portrait):
   a cinematic, painterly key art in the champion's own setting, written to public/splash/<id>.webp
   (1600×900) for champion select, loading and the champion pages.
   Usage: node scripts/splash-art.mjs [id ...]   (default: every champion) */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { generate, uploadImage } from './higgsfield.mjs';
import { CATALOG } from './model-catalog.mjs';

const OUT = path.resolve('public/splash');
fs.mkdirSync(OUT, { recursive: true });
const SCENE = {
  garrok: 'striding down a misty mountain pass at dawn, boulders crumbling around him',
  lyra: 'on a sunlit marble temple stair, a blazing sun-staff raised, golden light rays and floating motes',
  kaelen: 'crouched on a moonlit rooftop at night, twin daggers drawn, purple shadow smoke curling',
  hale: 'in a snowstorm on a frozen cliff, drawing an ice longbow, frost swirling',
  thorne: 'on a burning battlefield at dusk, raising a huge battle axe, embers in the air',
  mira: 'in a starry night meadow under a giant crescent moon, staff glowing silver',
  zarak: 'in a volcanic cave, conjuring a roaring fireball between his hands, lava glow',
  nyra: 'in a red desert canyon at sunset, rifle at the ready, dust blowing, wide-brimmed hat',
  brakka: 'charging across a dusty plain with a war herd behind him, horns lowered',
  rook: 'on a storm-lashed hilltop, axe crackling with green lightning, clouds swirling',
  thessa: 'on a rocky shore as a huge wave rises behind her, trident raised, sea spray',
  borrin: 'in an ancient mossy forest, roots and vines rising around him, sunbeams through the canopy',
};
const STYLE = 'epic painterly fantasy splash art for a MOBA game, dynamic heroic pose, dramatic cinematic lighting, rich detailed background, wide 16:9 composition with the character on the left third, high detail, no text, no logo, no watermark';

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENE);
await Promise.all(ids.map(async id => {
  const asset = CATALOG.find(a => a.id === id);
  const concept = path.resolve(`models-src/concept/${id}.png`);
  const src = fs.existsSync(concept) ? concept : `public/portraits/${id}.webp`;
  const png = path.resolve(`models-src/concept/splashref_${id}.png`);
  await sharp(src).resize(768, 768, { fit: 'contain', background: '#cccccc' }).png().toFile(png);
  const desc = asset.prompt.split(', stylized fantasy MOBA game character')[0];
  const prompt = `The character from image 1 (${desc}), keep their exact design, colors and costume. ${SCENE[id]}. ${STYLE}`;
  const ref = await uploadImage(png);
  let url;
  try { url = await generate('alibaba/qwen-image-3/edit', { prompt, image_urls: [ref], aspect_ratio: '16:9', resolution: '2k', negative_prompt: 'text, logo, watermark, extra characters, cropped head, blurry' }); }
  catch { url = await generate('xai/grok-imagine-image-2.0', { prompt, image_urls: [ref], aspect_ratio: '16:9', resolution: '2k', quality: 'medium' }); }
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  await sharp(buf).resize(1600, 900, { fit: 'cover' }).webp({ quality: 82 }).toFile(path.join(OUT, `${id}.webp`));
  console.log(`✓ ${id}`);
}));
