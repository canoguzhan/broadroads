/* Generates rigged, animated 3D champions with the Tripo v3 API.
   Pipeline per champion: text-to-model → rig-check (free) → rig (biped) →
   retarget (one batch: idle, run, attack, cast, hurt, death) → download GLB.
   Progress is saved to public/models/tasks.json so reruns resume without
   paying twice. Raw GLBs land in models-src/ (git-ignored) for review.

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
const ATTACK = { punch: 'preset:biped:box_01', slash: 'preset:biped:slash', shoot: 'preset:biped:shoot', cast: 'preset:biped:cast_a_spell', chop: 'preset:biped:chop' };
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
const animationsFor = style => ['preset:biped:idle', 'preset:biped:run', ATTACK[style], 'preset:biped:cast_a_spell', 'preset:biped:hurt', 'preset:biped:fall']
  .filter((a, i, arr) => arr.indexOf(a) === i);

const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};
const save = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));

async function api(method, url, body) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(API + url, { method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    if (res.status === 429 && attempt < 6) { await sleep(3000 * attempt); continue; }
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
  if (!force && fs.existsSync(file)) { console.log(`• ${id}: already generated`); return; }
  if (force) delete state[id];
  console.log(`▶ ${id}`);
  await step(id, 'model', () => api('POST', '/generation/text-to-model', {
    prompt: `${desc}, ${STYLE}`, model: 'v3.1-20260211', negative_prompt: 'multiple characters, base, pedestal, text, blurry, broken mesh',
    texture: true, pbr: true, texture_quality: 'standard', face_limit: 30000,
  }), 'model');
  const check = await step(id, 'rigcheck', () => api('POST', '/animations/rig-check', { input: state[id].model }), 'rig check');
  const out = check.output || {};
  if (out.riggable === false) throw new Error(`${id} is not riggable (rig_type ${out.rig_type}); try a different prompt`);
  await step(id, 'rig', () => api('POST', '/animations/rig', { input: state[id].model, model: 'v1.0-20240301', rig_type: 'biped', spec: 'tripo', out_format: 'glb' }), 'rig');
  const anim = await step(id, 'retarget', () => api('POST', '/animations/retarget', {
    input: state[id].rig, animations: animationsFor(style), out_format: 'glb', bake_animation: true, export_with_geometry: true, animate_in_place: true,
  }), 'animations');
  const url = anim.output && (anim.output.model_url || anim.output.model);
  if (!url) throw new Error(`${id}: no model_url in ${JSON.stringify(anim.output)}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${id}: download failed ${res.status}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  state[id].done = true;
  state[id].animations = animationsFor(style);
  save();
  console.log(`✓ ${id} → ${path.relative(process.cwd(), file)} (${(fs.statSync(file).size / 1048576).toFixed(1)} MB)`);
}

const list = CHAMPIONS.filter(c => !only.length || only.includes(c[0]));
const { balance, frozen } = await api('GET', '/account/balance');
const todo = list.filter(c => force || !fs.existsSync(path.join(OUT, `${c[0]}.glb`)));
const estimate = todo.length * (40 + 25 + 10 * 6);
console.log(`Balance: ${balance} credits (${frozen} frozen). ${todo.length} champion(s) to generate, estimated ≤ ${estimate} credits.`);
if (dryRun) process.exit(0);
if (todo.length && balance < 50) { console.error('Not enough API credits. Top up at https://platform.tripo3d.ai (API billing is separate from Tripo Studio plans).'); process.exit(2); }
let failed = 0;
for (const c of todo) {
  try { await generate(c); } catch (err) { failed++; console.error(`✗ ${c[0]}: ${err.message}`); if (/2010|credit/i.test(err.message)) break; }
}
const after = await api('GET', '/account/balance');
console.log(`\nDone. Balance now ${after.balance} credits. ${failed ? `${failed} failed — rerun to resume.` : 'All good.'}`);
process.exit(failed ? 1 : 0);
