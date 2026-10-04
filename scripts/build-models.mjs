/* Merges the raw Tripo downloads in models-src/ (a mesh GLB plus one
   skeleton-only GLB per animation, see generate-champions.mjs) into a single
   game-ready file per champion: public/models/<id>.glb with clips
   idle/run/attack/cast/death, 1024px WebP textures and meshopt compression.

   Usage: node scripts/build-models.mjs [champ ...] */
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, textureCompress, meshopt, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const SRC = path.resolve('models-src');
const OUT = path.resolve('public/models');
fs.mkdirSync(OUT, { recursive: true });
const state = JSON.parse(fs.readFileSync(path.join(SRC, 'tasks.json'), 'utf8'));
const only = process.argv.slice(2);

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

function copyClip(doc, from, name) {
  const nodes = new Map(doc.getRoot().listNodes().map(n => [n.getName(), n]));
  for (const src of from.getRoot().listAnimations()) {
    const anim = doc.createAnimation(name);
    for (const ch of src.listChannels()) {
      const target = nodes.get(ch.getTargetNode()?.getName());
      if (!target) continue;
      const s = ch.getSampler();
      const copy = acc => doc.createAccessor().setType(acc.getType()).setArray(acc.getArray().slice());
      const sampler = doc.createAnimationSampler().setInput(copy(s.getInput())).setOutput(copy(s.getOutput())).setInterpolation(s.getInterpolation());
      anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath(ch.getTargetPath()).setSampler(sampler));
    }
  }
}

const manifest = fs.existsSync(path.join(OUT, 'manifest.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8')) : {};
for (const [id, s] of Object.entries(state)) {
  if (!s.done || (only.length && !only.includes(id))) continue;
  const doc = await io.read(path.join(SRC, `${id}.glb`));
  const root = doc.getRoot();
  root.listAnimations().forEach(a => a.setName(s.base));
  for (const clip of Object.keys(s.anims)) {
    if (clip === s.base) continue;
    const file = path.join(SRC, id, `${clip}.glb`);
    if (fs.existsSync(file)) copyClip(doc, await io.read(file), clip);
  }
  // Tripo's "animate in place" doesn't always hold (run drifts ~2 units), so
  // pin the hips horizontally in every clip but death. Under the rotated Root
  // bone, Hip-local x/y are horizontal and z is height.
  const hip = root.listNodes().find(n => n.getName() === 'Hip');
  if (hip) {
    const [rx, ry] = hip.getTranslation();
    for (const anim of root.listAnimations()) {
      if (anim.getName() === 'death') continue;
      for (const ch of anim.listChannels()) {
        if (ch.getTargetNode() !== hip || ch.getTargetPath() !== 'translation') continue;
        const out = ch.getSampler().getOutput(), arr = out.getArray().slice();
        for (let i = 0; i < arr.length; i += 3) { arr[i] = rx; arr[i + 1] = ry; }
        out.setArray(arr);
      }
    }
  }
  // Share one buffer and drop the leftover ones from merged files.
  const buffer = root.listBuffers()[0];
  for (const acc of root.listAccessors()) acc.setBuffer(buffer);
  root.listBuffers().slice(1).forEach(b => b.dispose());
  await doc.transform(
    dedup(), weld(), resample(), prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 85 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const out = path.join(OUT, `${id}.glb`);
  await io.write(out, doc);
  const box = root.listMeshes()[0].listPrimitives()[0].getAttribute('POSITION');
  manifest[id] = { file: `${id}.glb`, clips: root.listAnimations().map(a => a.getName()), v: Date.now().toString(36) };
  console.log(`✓ ${id}: ${(fs.statSync(out).size / 1048576).toFixed(2)} MB, clips ${manifest[id].clips.join(', ')}, ${box.getCount()} verts`);
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
