/* Packs the raw Tripo downloads in models-src/ (a mesh GLB plus one
   skeleton-only GLB per animation, see generate-models.mjs) into one
   game-ready file per asset: public/models/<id>.glb with its clips merged,
   WebP textures sized per scripts/model-catalog.mjs and meshopt compression.
   Props skip meshopt: the client instances their raw geometry.

   Usage: node scripts/build-models.mjs [id|group ...] */
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, textureCompress, meshopt, weld, simplify } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { byId } from './model-catalog.mjs';

const SRC = path.resolve('models-src');
const OUT = path.resolve('public/models');
fs.mkdirSync(OUT, { recursive: true });
const state = JSON.parse(fs.readFileSync(path.join(SRC, 'tasks.json'), 'utf8'));
const only = process.argv.slice(2);

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

// Tripo's slash/chop/cast presets are multi-second combos; keep one strike.
// Keyed by Tripo's clip name, in seconds (picked from rendered filmstrips).
// Trim windows (seconds) per Tripo preset: just the strike / gesture, picked from scripts/clip-frames strips.
const WINDOWS = {
  box_01: [0, 1.3], slash: [1.1, 2.4], chop: [1.1, 2.4], cast_a_spell: [0.4, 2.5], hurt: [0, 3.5], dance_01: [0, 8], cheer: [0, 4], laugh_01: [0, 4],
  lift_heavy: [3.0, 5.4], pitch_baseball: [0.8, 2.1], box_02: [1.4, 2.6], flip: [0.7, 2.9], angry_01: [0.4, 2.6], volleyball: [1.8, 2.6],
  sing_01: [3.6, 6.2], basketball_shot: [1.2, 2.7], shoot: [0.6, 2.4], front_kick_01: [0.2, 1.6], angry_02: [0.3, 1.5], jump: [0, 2.2],
  football_pass: [2.4, 3.6], victory_celebration: [0.5, 2.6], box_03: [0.2, 1.6], dig: [5.5, 7.5],
  angry_03: [1.1, 3.0], dive: [0.5, 2.4], jump_down: [0.8, 3.0], sing_02: [6.4, 9.0], golf: [6.0, 8.6],
};

function trim(doc, input, output, [t0, t1]) {
  const t = input.getArray(), size = output.getElementSize(), v = output.getArray();
  const keep = [];
  for (let i = 0; i < t.length; i++) if (t[i] >= t0 - 1e-4 && t[i] <= t1 + 1e-4) keep.push(i);
  if (!keep.length) keep.push(0);
  const nt = new Float32Array(keep.length), nv = new Float32Array(keep.length * size);
  keep.forEach((k, j) => { nt[j] = Math.max(0, t[k] - t0); for (let c = 0; c < size; c++) nv[j * size + c] = v[k * size + c]; });
  return [doc.createAccessor().setType(input.getType()).setArray(nt), doc.createAccessor().setType(output.getType()).setArray(nv)];
}

function copyClip(doc, from, name) {
  const nodes = new Map(doc.getRoot().listNodes().map(n => [n.getName(), n]));
  for (const src of from.getRoot().listAnimations()) {
    const anim = doc.createAnimation(name);
    for (const ch of src.listChannels()) {
      const target = nodes.get(ch.getTargetNode()?.getName());
      if (!target) continue;
      const s = ch.getSampler();
      const win = WINDOWS[src.getName()];
      const copy = acc => doc.createAccessor().setType(acc.getType()).setArray(acc.getArray().slice());
      const [input, output] = win ? trim(doc, s.getInput(), s.getOutput(), win) : [copy(s.getInput()), copy(s.getOutput())];
      const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation(s.getInterpolation());
      anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath(ch.getTargetPath()).setSampler(sampler));
    }
  }
}

const manifest = fs.existsSync(path.join(OUT, 'manifest.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8')) : {};
for (const [id, s] of Object.entries(state)) {
  const asset = byId[id] || { group: 'champion', tex: 1024 };
  if (!s.done || (only.length && !only.includes(id) && !only.includes(asset.group))) continue;
  const doc = await io.read(path.join(SRC, `${id}.glb`));
  const root = doc.getRoot();
  root.listAnimations().forEach(a => a.setName(s.base));
  for (const clip of Object.keys(s.anims || {})) {
    if (clip === s.base) continue;
    const file = path.join(SRC, id, `${clip}.glb`);
    if (fs.existsSync(file)) copyClip(doc, await io.read(file), clip);
  }
  if (asset.pose === 'bind') {
    // Keep the bind pose as a plain static mesh.
    root.listAnimations().forEach(a => a.dispose());
    for (const node of root.listNodes()) if (node.getSkin()) node.setSkin(null);
    root.listSkins().forEach(sk => sk.dispose());
    for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) for (const sem of ['JOINTS_0', 'WEIGHTS_0']) prim.setAttribute(sem, null);
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
  const tex = asset.tex || 1024;
  // Cut meshes down to the catalog's `tris` budget (props are instanced thousands of times).
  const tris = root.listMeshes().flatMap(m => m.listPrimitives()).reduce((n, p) => n + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0);
  const ratio = asset.tris ? Math.min(1, asset.tris / tris) : 1;
  await doc.transform(
    dedup(), weld(), resample(), prune(),
    ...(ratio < 1 ? [simplify({ simplifier: MeshoptSimplifier, ratio, error: asset.group === 'prop' ? 0.1 : 0.02 })] : []),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [tex, tex], quality: 85 }),
    ...(asset.group === 'prop' ? [] : [meshopt({ encoder: MeshoptEncoder, level: 'medium' })]),
  );
  const out = path.join(OUT, `${id}.glb`);
  await io.write(out, doc);
  // Low-detail twin for phones and Low quality: ~35% of the triangles, 256px textures.
  let lo = null;
  if (asset.group !== 'prop' && asset.group !== 'pack' && asset.group !== 'decor') { // pack models are opt-in HD, no low twin
    const ld = await io.read(out);
    await ld.transform(
      simplify({ simplifier: MeshoptSimplifier, ratio: 0.35, error: 0.05 }),
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [256, 256], quality: 75 }),
      meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    );
    lo = `${id}.lo.glb`;
    await io.write(path.join(OUT, lo), ld);
  }
  const box = root.listMeshes()[0].listPrimitives()[0].getAttribute('POSITION');
  manifest[id] = { file: `${id}.glb`, ...(lo ? { lo } : {}), group: asset.group, ...(asset.group === 'pack' ? { bytes: fs.statSync(out).size } : {}), ...(asset.yaw !== undefined ? { yaw: +asset.yaw.toFixed(4) } : {}), clips: root.listAnimations().map(a => a.getName()), v: Date.now().toString(36) };
  console.log(`✓ ${id}: ${(fs.statSync(out).size / 1048576).toFixed(2)} MB${lo ? ` (low ${(fs.statSync(path.join(OUT, lo)).size / 1048576).toFixed(2)} MB)` : ''}, clips ${manifest[id].clips.join(', ')}, ${box.getCount()} verts`);
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
