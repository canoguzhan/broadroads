/* Generates the game's 3D assets with the Tripo v3 API from scripts/model-catalog.mjs.
   static:    text-to-model → download
   biped:     text-to-model → rig-check (free) → rig v1.0 → one retarget per clip
   quadruped: same, with rig v2.5 (Tripo offers only a walk cycle)
   Batch retargets only return the last clip, so each animation is its own
   task: the first includes the mesh, the rest are skeleton-only (~50 KB).
   Progress is saved to models-src/tasks.json so reruns resume without paying
   twice. Raw files land in models-src/ (git-ignored); then run
   `node scripts/build-models.mjs` to pack them into public/models.

   Usage: TRIPO_API_KEY=... node scripts/generate-models.mjs [id|group ...] [--dry-run] [--force]
   e.g.   node scripts/generate-models.mjs minion monster tree_oak */
import fs from 'node:fs';
import path from 'node:path';
import { CATALOG } from './model-catalog.mjs';

const KEY = process.env.TRIPO_API_KEY;
if (!KEY) { console.error('Set TRIPO_API_KEY'); process.exit(1); }
const API = 'https://openapi.tripo3d.ai/v3';
const OUT = path.resolve('models-src');
const STATE_FILE = path.join(OUT, 'tasks.json');
fs.mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const only = args.filter(a => !a.startsWith('--'));

const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};
const save = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(method, url, body) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(API + url, { method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    if (res.status === 429 && attempt < 10) { await sleep(5000 * attempt); continue; }
    if (json.code !== 0) throw new Error(`${url}: ${json.code} ${json.message || res.status}${json.suggestion ? ` (${json.suggestion})` : ''}`);
    return json.data;
  }
}

async function waitTask(id, label) {
  let last = -1;
  for (;;) {
    const t = await api('GET', `/tasks/${id}`);
    if (t.status !== 'running' && t.progress !== last) { last = t.progress; console.log(`  ${label}: ${t.status} ${t.progress}%`); }
    if (t.status === 'success') return t;
    if (t.status === 'failed' || t.status === 'cancelled') throw new Error(`${label} ${t.status}: ${t.error_code || ''} ${t.error_message || ''}`);
    await sleep(4000);
  }
}

async function step(id, name, create, label) {
  const s = state[id] || (state[id] = {});
  if (!s[name]) { s[name] = (await create()).task_id; save(); }
  return waitTask(s[name], `${id} ${label}`);
}

async function download(url, dest, label) {
  if (!url) throw new Error(`${label}: no model_url`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label}: download failed ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

async function generate(asset) {
  const { id } = asset;
  const file = path.join(OUT, `${id}.glb`);
  if (state[id]?.done && !force) state[id].done = false; // adding clips
  if (force) { delete state[id]; fs.rmSync(file, { force: true }); fs.rmSync(path.join(OUT, id), { recursive: true, force: true }); }
  console.log(`▶ ${id}`);
  const model = await step(id, 'model', () => api('POST', '/generation/text-to-model', {
    prompt: asset.prompt, model: 'v3.1-20260211', negative_prompt: 'multiple objects, base, pedestal, ground plane, text, blurry, broken mesh',
    texture: true, pbr: true, texture_quality: 'standard', face_limit: asset.face, ...(asset.low ? { smart_low_poly: true } : {}),
  }), 'model');
  const s = state[id];
  s.kind = asset.kind;
  if (asset.kind !== 'static') {
    const check = (await step(id, 'rigcheck', () => api('POST', '/animations/rig-check', { input: s.model }), 'rig check')).output || {};
    if (check.riggable === false) { console.log(`  ${id}: not riggable (${check.rig_type}), keeping it static`); s.kind = 'static'; }
    else {
      const RIG_TYPES = ['quadruped', 'hexapod', 'octopod', 'avian', 'serpentine', 'aquatic'];
      s.rigType = asset.kind === 'biped' ? 'biped' : RIG_TYPES.includes(check.rig_type) ? check.rig_type : 'quadruped'; // rig-check may say "others"
    }
  }
  if (s.kind === 'static') {
    await download(model.output && model.output.model_url, file, id);
  } else {
    await step(id, 'rig', () => api('POST', '/animations/rig', {
      input: s.model, model: s.rigType === 'biped' ? 'v1.0-20240301' : 'v2.5-20260210', rig_type: s.rigType, spec: 'tripo', out_format: 'glb',
    }), 'rig');
    s.anims = s.anims || {};
    if (s.retarget && !s.base) { s.anims.death = s.retarget; s.base = 'death'; } // earliest batch run: mesh + last clip
    if (!s.base) s.base = Object.keys(asset.clips)[0];
    fs.mkdirSync(path.join(OUT, id), { recursive: true });
    for (const [clip, preset] of Object.entries(asset.clips)) {
      const withMesh = clip === s.base;
      const dest = withMesh ? file : path.join(OUT, id, `${clip}.glb`);
      if (fs.existsSync(dest)) continue;
      if (!s.anims[clip]) {
        s.anims[clip] = (await api('POST', '/animations/retarget', {
          input: s.rig, animation: preset, out_format: 'glb', bake_animation: true, export_with_geometry: withMesh, animate_in_place: true,
        })).task_id;
        save();
      }
      const t = await waitTask(s.anims[clip], `${id} ${clip}`);
      await download(t.output && t.output.model_url, dest, `${id} ${clip}`);
    }
  }
  s.done = true;
  save();
  console.log(`✓ ${id} → ${path.relative(process.cwd(), file)} (${(fs.statSync(file).size / 1048576).toFixed(1)} MB)`);
}

const cost = a => (a.kind === 'static' ? 20 : 45 + 10 * Object.keys(a.clips).length);
const list = CATALOG.filter(a => !only.length || only.includes(a.id) || only.includes(a.group));
// Also picks up clips added to the catalog after an asset was generated.
const missingClips = a => a.kind !== 'static' && state[a.id]?.kind !== 'static' && Object.keys(a.clips || {}).some(c => c !== state[a.id]?.base && !fs.existsSync(path.join(OUT, a.id, `${c}.glb`)));
const todo = list.filter(a => force || !state[a.id]?.done || missingClips(a));
const { balance, frozen } = await api('GET', '/account/balance');
console.log(`Balance: ${balance} credits (${frozen} frozen). ${todo.length} asset(s) to generate, about ${todo.reduce((n, a) => n + cost(a), 0)} credits.`);
if (dryRun) { for (const a of todo) console.log(`  ${a.id.padEnd(20)} ${a.kind.padEnd(10)} ${cost(a)}`); process.exit(0); }
if (todo.length && balance < 20) { console.error('Not enough API credits. Top up at https://platform.tripo3d.ai (API billing is separate from Tripo Studio plans).'); process.exit(2); }

// The account runs up to 10 tasks per category at once; 6 workers leave headroom.
let failed = 0, outOfCredits = false;
const queue = [...todo];
await Promise.all(Array.from({ length: Math.min(6, queue.length) }, async () => {
  while (queue.length && !outOfCredits) {
    const a = queue.shift();
    try { await generate(a); } catch (err) { failed++; console.error(`✗ ${a.id}: ${err.message}`); if (/2010|credit/i.test(err.message)) outOfCredits = true; }
  }
}));
const after = await api('GET', '/account/balance');
console.log(`\nDone. Balance now ${after.balance} credits. ${failed ? `${failed} failed — rerun to resume.` : 'All good.'}`);
process.exit(failed ? 1 : 0);
