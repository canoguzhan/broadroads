/* Generates rigged, animated 3D champions with the Tripo v3 API.
   Pipeline per champion: text-to-model → rig-check (free) → rig (biped) →
   retarget each animation (idle, run, attack, cast, death) → download GLBs.
   Batch retargets only return the last clip, so each animation is its own
   task: the first includes the mesh, the rest are skeleton-only (~50 KB).
   Progress is saved to models-src/tasks.json so reruns resume without paying
   twice. Raw files land in models-src/ (git-ignored); then run
   `node scripts/build-models.mjs` to merge and compress them into public/models.

   Usage: TRIPO_API_KEY=... node scripts/generate-champions.mjs [champ ...] [--dry-run] [--force] */
import fs from 'node:fs';
import path from 'node:path';

const KEY = process.env.TRIPO_API_KEY;
if (!KEY) { console.error('Set TRIPO_API_KEY'); process.exit(1); }
const API = 'https://openapi.tripo3d.ai/v3';
const OUT = path.resolve('models-src');
const STATE_FILE = path.resolve('models-src/tasks.json');
fs.mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const only = args.filter(a => !a.startsWith('--'));

const STYLE = 'stylized fantasy MOBA game character, full body, standing in a T-pose, arms out, clean hand-painted textures, single character, no base, no weapon on the ground';
const ATTACK = { punch: 'preset:biped:box_01', slash: 'preset:biped:slash', shoot: 'preset:biped:fire', cast: 'preset:biped:cast_a_spell', chop: 'preset:biped:chop' };
// [id, description, attack style]
const CHAMPIONS = [
  ['garrok', 'massive stone-skinned golem warrior with glowing amber cracks, rocky shoulders and huge stone fists', 'punch'],
  ['lyra', 'radiant light mage woman in flowing white and gold robes holding a glowing sun staff', 'cast'],
  ['kaelen', 'hooded shadow assassin in dark purple leather armor holding twin curved daggers', 'slash'],
  ['hale', 'frost huntress archer woman in blue fur-lined leather armor holding an ice longbow', 'shoot'],
  ['thorne', 'armored iron warlord in dark red plate armor holding a huge two-handed battle axe', 'chop'],
  ['mira', 'moon priestess in pale blue and silver robes with a crescent halo holding a moon staff', 'cast'],
  ['zarak', 'young fire mage boy in red and orange robes with small flames in his hands', 'cast'],
  ['nyra', 'desert marshal gunslinger woman in a long brown coat and wide-brimmed hat holding a long rifle', 'shoot'],
  ['brakka', 'armored minotaur bull warrior with big horns, steel shoulder pads and huge fists', 'punch'],
  ['rook', 'green-armored storm warrior holding a large axe, with lightning accents on the armor', 'slash'],
];
// clip name in the final GLB → Tripo preset
const animationsFor = style => ({ idle: 'preset:biped:idle', run: 'preset:biped:run', attack: ATTACK[style], cast: 'preset:biped:cast_a_spell', death: 'preset:biped:fall' });

const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};
const save = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));

async function api(method, url, body) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(API + url, { method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    if (res.status === 429 && attempt < 10) { await sleep(5000 * attempt); continue; }
    if (json.code !== 0) throw new Error(`${url}: ${json.code} ${json.message || res.status}${json.suggestion ? ` (${json.suggestion})` : ''}`);
    return json.data;
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitTask(id, label) {
  let last = -1;
  for (;;) {
    const t = await api('GET', `/tasks/${id}`);
    if (t.progress !== last) { last = t.progress; process.stdout.write(`  ${label}: ${t.status} ${t.progress}%\n`); }
    if (t.status === 'success') return t;
    if (t.status === 'failed' || t.status === 'cancelled') throw new Error(`${label} ${t.status}: ${t.error_code || ''} ${t.error_message || ''}`);
    await sleep(4000);
  }
}

async function step(champ, name, create, label) {
  const s = state[champ] || (state[champ] = {});
  if (!s[name]) { s[name] = (await create()).task_id; save(); }
  const t = await waitTask(s[name], `${champ} ${label}`);
  return t;
}

async function generate([id, desc, style]) {
  const file = path.join(OUT, `${id}.glb`);
  if (!force && state[id]?.done) { console.log(`• ${id}: already generated`); return; }
  if (force) { delete state[id]; fs.rmSync(file, { force: true }); fs.rmSync(path.join(OUT, id), { recursive: true, force: true }); }
  console.log(`▶ ${id}`);
  await step(id, 'model', () => api('POST', '/generation/text-to-model', {
    prompt: `${desc}, ${STYLE}`, model: 'v3.1-20260211', negative_prompt: 'multiple characters, base, pedestal, text, blurry, broken mesh',
    texture: true, pbr: true, texture_quality: 'standard', face_limit: 30000,
  }), 'model');
  const check = await step(id, 'rigcheck', () => api('POST', '/animations/rig-check', { input: state[id].model }), 'rig check');
  const out = check.output || {};
  if (out.riggable === false) throw new Error(`${id} is not riggable (rig_type ${out.rig_type}); try a different prompt`);
  await step(id, 'rig', () => api('POST', '/animations/rig', { input: state[id].model, model: 'v1.0-20240301', rig_type: 'biped', spec: 'tripo', out_format: 'glb' }), 'rig');
  const s = state[id];
  s.anims = s.anims || {};
  if (s.retarget && !s.base) { s.anims.death = s.retarget; s.base = 'death'; } // earlier batch run: mesh + last clip
  if (!s.base) s.base = 'idle';
  fs.mkdirSync(path.join(OUT, id), { recursive: true });
  for (const [clip, preset] of Object.entries(animationsFor(style))) {
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
    const url = t.output && t.output.model_url;
    if (!url) throw new Error(`${id} ${clip}: no model_url in ${JSON.stringify(t.output)}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${id} ${clip}: download failed ${res.status}`);
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  }
  s.done = true;
  save();
  console.log(`✓ ${id} → ${path.relative(process.cwd(), file)} (${(fs.statSync(file).size / 1048576).toFixed(1)} MB)`);
}

const list = CHAMPIONS.filter(c => !only.length || only.includes(c[0]));
const { balance, frozen } = await api('GET', '/account/balance');
const todo = list.filter(c => force || !state[c[0]]?.done);
const estimate = todo.length * (40 + 25 + 10 * 5); // H-series pricing is lower (~95)
console.log(`Balance: ${balance} credits (${frozen} frozen). ${todo.length} champion(s) to generate, estimated ≤ ${estimate} credits.`);
if (dryRun) process.exit(0);
if (todo.length && balance < 50) { console.error('Not enough API credits. Top up at https://platform.tripo3d.ai (API billing is separate from Tripo Studio plans).'); process.exit(2); }
// The account runs up to 10 tasks per category at once; 5 workers leave headroom.
let failed = 0, outOfCredits = false;
const queue = [...todo];
await Promise.all(Array.from({ length: Math.min(5, queue.length) }, async () => {
  while (queue.length && !outOfCredits) {
    const c = queue.shift();
    try { await generate(c); } catch (err) { failed++; console.error(`✗ ${c[0]}: ${err.message}`); if (/2010|credit/i.test(err.message)) outOfCredits = true; }
  }
}));
const after = await api('GET', '/account/balance');
console.log(`\nDone. Balance now ${after.balance} credits. ${failed ? `${failed} failed — rerun to resume.` : 'All good.'}`);
process.exit(failed ? 1 : 0);
