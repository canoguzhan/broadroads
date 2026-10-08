/* Concept art for rebuilding a champion model: a full-body T-pose painting in the shared
   BroadRoads style, guided by the champion's current portrait (Higgsfield image edit).
   The image URL is saved to models-src/concept/<id>.json and used by generate-models
   (image-to-model) when the catalog entry has `concept: true`.
   Usage: node scripts/concept-art.mjs id [id ...] */
import fs from 'node:fs';
import path from 'node:path';
import { generate, uploadImage } from './higgsfield.mjs';
import { CATALOG } from './model-catalog.mjs';

const OUT = path.resolve('models-src/concept');
fs.mkdirSync(OUT, { recursive: true });
export const CONCEPT_STYLE = 'full body character concept art for a stylized fantasy MOBA game, polished hand-painted 3D game art style like a modern hero brawler, adult proportions, strong readable silhouette, standing in a neutral T-pose with both arms straight out to the sides and legs slightly apart, facing the camera, whole body visible from head to feet, plain flat light grey background, soft even studio lighting, no shadow on the ground, single character, no text';

for (const id of process.argv.slice(2)) {
  const asset = CATALOG.find(a => a.id === id);
  if (!asset) { console.error(`unknown ${id}`); continue; }
  // Skins restyle their base champion's concept (same build and silhouette, new materials).
  const base = asset.skinOf || id;
  const src = asset.skinOf && fs.existsSync(path.join(OUT, `${base}.png`)) ? path.join(OUT, `${base}.png`) : `public/portraits/${base}.webp`;
  const png = path.join(OUT, `ref_${id}.png`);
  if (!fs.existsSync(png)) {
    const sharp = (await import('sharp')).default;
    await sharp(src).resize(768, 1024, { fit: 'contain', background: '#cccccc' }).png().toFile(png);
  }
  const desc = asset.prompt.split(', stylized fantasy MOBA game character')[0];
  const ref = await uploadImage(png);
  const prompt = asset.restyle
    ? `Restyle the character from image 1 (${desc}) as a new skin: ${asset.restyle}. Keep exactly the same body shape, proportions, pose and silhouette; change only materials and colors. ${CONCEPT_STYLE}`
    : `The character from image 1 (${desc}). Keep their identity, colors and costume details. ${CONCEPT_STYLE}`;
  let url;
  try { url = await generate('alibaba/qwen-image-3/edit', { prompt, image_urls: [ref], aspect_ratio: '3:4', resolution: '2k', negative_prompt: 'cropped, cut off feet, multiple characters, weapon on the floor, text, watermark, background scenery, dramatic pose' }); }
  catch (err) { console.warn(`  qwen: ${err.message.split(' (request')[0]} → grok`); url = await generate('xai/grok-imagine-image-2.0', { prompt, image_urls: [ref], aspect_ratio: '3:4', resolution: '2k', quality: 'medium' }); }
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  fs.writeFileSync(path.join(OUT, `${id}.png`), buf);
  fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify({ url, at: new Date().toISOString() }));
  console.log(`✓ ${id} ${url}`);
}
