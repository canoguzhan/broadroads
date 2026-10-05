/* Generates item, battle spell, ability and passive icons with Tripo's
   text-to-image API. Nine icons are drawn per 1024px sheet (one task, 5
   credits) in a 3x3 grid, then cropped along the light gutters into
   public/icons/<kind>/<id>.webp (128px). Sheets are kept in models-src/icons
   and task ids in models-src/icons/tasks.json, so reruns are free.

   Usage: TRIPO_API_KEY=... node scripts/generate-icons.mjs [--force sheetIndex ...] */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ITEMS, SPELLS } from '../shared/moba/items.js';
import { CHAMPIONS } from '../shared/moba/champions.js';

const KEY = process.env.TRIPO_API_KEY;
if (!KEY) { console.error('Set TRIPO_API_KEY'); process.exit(1); }
const API = 'https://openapi.tripo3d.ai/v3';
const SRC = path.resolve('models-src/icons');
const OUT = path.resolve('public/icons');
fs.mkdirSync(SRC, { recursive: true });
const args = process.argv.slice(2);
const force = new Set(args.filter(a => /^\d+$/.test(a)).map(Number));

// What each item looks like (names alone are often too abstract).
const ITEM_LOOK = {
  potion: 'a round glass bottle of glowing red healing potion with a cork',
  blade: 'a plain iron short sword',
  tome: 'a closed red leather spellbook with a brass clasp',
  vest: 'a quilted padded leather vest',
  veil: 'a shimmering blue silk scarf with protective runes',
  heartgem: 'a glowing red heart-shaped ruby',
  managem: 'a glowing blue faceted mana crystal',
  knife: 'a small curved dagger with motion streaks',
  boots: 'a pair of simple brown leather travel boots',
  warpick: 'a heavy iron war pick',
  wand: 'a short wand with an ember glowing at the tip',
  girdle: 'a massive leather belt with a golden titan buckle',
  feather: 'a pale blue feather with wind swirls',
  windboots: 'light boots with small wings and wind swirls',
  ironboots: 'heavy iron-plated armored boots',
  warboots: 'sturdy steel-capped marching boots',
  spellboots: 'purple cloth shoes stitched with glowing arcane runes',
  sageboots: 'sandals with an hourglass charm',
  rushboots: 'red running boots trailing speed lines',
  vampblade: 'a crimson curved sword dripping glowing blood',
  starblade: 'a golden sword with a star-shaped glowing crossguard',
  galebow: 'an elegant longbow wrapped in swirling wind',
  cleaver: 'a huge jagged cleaver axe',
  piercer: 'a spear-tipped blade cracking through a steel plate',
  crown: 'a jeweled golden crown radiating arcane light',
  nullstaff: 'a black staff with a swirling void orb on top',
  frostorb: 'a glowing ice orb with frost crystals',
  codex: 'an open blue tome with floating glowing pages',
  spikeplate: 'a spiked steel breastplate',
  grovecharm: 'a green leaf amulet with glowing nature magic',
  colossus: 'a giant pink crystal heart encased in stone',
  emberplate: 'a burning molten armor plate with flames',
  maul: 'a huge two-handed executioner maul with a dark iron head', stormrod: 'a silver rod crackling with blue lightning', lifeorb: 'a green orb with a sprouting seedling inside', wardenmail: 'a sturdy chainmail shirt with steel pauldrons',
};
const SPELL_LOOK = {
  blink: 'a burst of golden sparkles teleport flash',
  mend: 'a green healing cross with soft light',
  scorch: 'a swirling ball of orange fire',
  strike: 'a lightning-charged hunter spear hitting a claw mark',
  haste: 'a ghostly running figure with speed trails',
  bulwark: 'a glowing translucent golden shield bubble',
};

const ICONS = [
  ...Object.keys(ITEMS).map(id => ({ kind: 'item', id, look: ITEM_LOOK[id] || ITEMS[id].name })),
  ...Object.keys(SPELLS).map(id => ({ kind: 'spell', id, look: SPELL_LOOK[id] || SPELLS[id].name })),
];
for (const c of Object.values(CHAMPIONS)) {
  const theme = `${c.title.replace(/^the /, '')} colour theme`; // no names: they get painted as text
  ICONS.push({ kind: 'passive', id: c.id, look: `${c.passive.desc.split('.')[0].toLowerCase()} (${theme})` });
  for (const k of ['q', 'w', 'e', 'r']) {
    const a = c.abilities[k];
    ICONS.push({ kind: 'ability', id: `${c.id}_${k}`, look: `${a.desc.split('.')[0].toLowerCase()} (${theme})` });
  }
}

const STYLE = {
  item: 'fantasy MOBA item icons, a single object per tile',
  spell: 'fantasy MOBA spell icons, a single magical effect per tile',
  passive: 'fantasy MOBA ability icons, dynamic magical effects',
  ability: 'fantasy MOBA ability icons, dynamic magical effects',
};
// UI icons used to pad sheets to a full 3x3 (the model always draws 3x3 and
// scatters empty tiles otherwise).
const MISC = {
  ward: 'a glowing green eye totem on a wooden stake', recall: 'a blue portal swirl of returning home', gold: 'a pile of shiny gold coins',
  trophy: 'a golden victory trophy cup', tower: 'a stone guard tower with a glowing crystal', kill: 'a white skull with crossed swords',
  shop: 'a merchant pouch with coins spilling out', wyrm: 'a fierce orange dragon head', titan: 'a dark purple horned titan head',
  levelup: 'a glowing upward golden arrow with sparkles', quest: 'a parchment scroll with a red wax seal',
  tier_bronze: 'a bronze shield emblem with a single wing, ranked badge', tier_silver: 'a polished silver shield emblem with two wings, ranked badge',
  tier_gold: 'a shining gold shield emblem with laurel wings, ranked badge', tier_platinum: 'a teal platinum crest emblem with crystal wings, ranked badge',
  tier_diamond: 'a brilliant blue diamond crest emblem with large wings, ranked badge', tier_master: 'a purple master crest emblem with a crown and flames, ranked badge',
  tier_champion: 'a radiant red and gold champion crest emblem with a crown and blazing wings, ranked badge', streak: 'a burning orange flame over a calendar page', firstwin: 'a golden sunrise over a victory trophy',
};
const misc = (...ids) => ids.map(id => ({ kind: 'misc', id, look: MISC[id] || id }));
const of = kind => ICONS.filter(i => i.kind === kind);
const pick = (kind, ids) => ids.map(id => ICONS.find(i => i.kind === kind && i.id === id));
// The first sheets are pinned to the original lists (new entries must not shift them).
const ORIGINAL_ITEMS = ['potion', 'blade', 'tome', 'vest', 'veil', 'heartgem', 'managem', 'knife', 'boots', 'warpick', 'wand', 'girdle', 'feather', 'windboots', 'ironboots', 'warboots', 'spellboots', 'sageboots', 'rushboots', 'vampblade', 'starblade', 'galebow', 'cleaver', 'piercer', 'crown', 'nullstaff', 'frostorb', 'codex', 'spikeplate', 'grovecharm', 'colossus', 'emberplate'];
const ORIGINAL_CHAMPS = ['garrok', 'lyra', 'kaelen', 'hale', 'thorne', 'mira', 'zarak', 'nyra', 'brakka', 'rook'];
const items = pick('item', ORIGINAL_ITEMS), spells = of('spell');
const abilities = pick('ability', ORIGINAL_CHAMPS.flatMap(c => ['q', 'w', 'e', 'r'].map(k => `${c}_${k}`)));
const passives = pick('passive', ORIGINAL_CHAMPS);
Object.assign(MISC, {
  ks_warpath: 'crossed swords wrapped in rising red war banners', ks_starfall: 'a glowing star falling from the night sky with a trail', ks_ironroot: 'an iron-banded tree trunk with deep glowing roots', ks_swiftwind: 'a swirl of green leaves in a gust of wind',
  brawl: 'two clashing fists over a single bridge', report: 'a red warning flag on a pole', placement: 'a silver medal with a question mark', ban: 'a champion silhouette crossed out with a red slash', mute: 'a speech bubble with a slash through it',
  notify: 'a golden bell ringing', install: 'a glowing phone with a downward arrow', language: 'a globe with speech bubbles', afk: 'a sleeping hourglass with zzz', backup: 'a vault door with a shield',
});
const sheets = [
  items.slice(0, 9), items.slice(9, 18), items.slice(18, 27), [...items.slice(27), ...misc('ward', 'recall', 'gold', 'trophy')],
  [...spells, ...misc('tower', 'kill', 'shop')],
  abilities.slice(0, 9), abilities.slice(9, 18), abilities.slice(18, 27), abilities.slice(27, 36),
  [...abilities.slice(36), passives.find(p => p.id === 'rook'), ...misc('wyrm', 'titan', 'levelup', 'quest')],
  passives.filter(p => p.id !== 'rook'),
  misc('tier_bronze', 'tier_silver', 'tier_gold', 'tier_platinum', 'tier_diamond', 'tier_master', 'tier_champion', 'streak', 'firstwin'),
  // New in the second roster update.
  [...pick('ability', ['thessa_q', 'thessa_w', 'thessa_e', 'thessa_r', 'borrin_q', 'borrin_w', 'borrin_e', 'borrin_r']), ...pick('passive', ['thessa'])],
  [...pick('passive', ['borrin']), ...misc('ks_warpath', 'ks_starfall', 'ks_ironroot', 'ks_swiftwind'), ...pick('item', ['maul', 'stormrod', 'lifeorb', 'wardenmail'])],
  misc('brawl', 'report', 'placement', 'ban', 'mute', 'notify', 'install', 'language', 'afk'),
];
for (const sh of sheets) if (sh.length !== 9) throw new Error(`sheet has ${sh.length} icons: ${sh.map(i => i.id)}`);
STYLE.misc = 'fantasy MOBA interface icons, a single object per tile';

const state = fs.existsSync(path.join(SRC, 'tasks.json')) ? JSON.parse(fs.readFileSync(path.join(SRC, 'tasks.json'), 'utf8')) : {};
const save = () => fs.writeFileSync(path.join(SRC, 'tasks.json'), JSON.stringify(state, null, 1));
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(method, url, body) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(API + url, { method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    if ((res.status === 429 || json.code === 2000) && attempt < 40) { await sleep(5000); continue; } // image tasks run one at a time
    if (json.code !== 0) throw new Error(`${url}: ${json.code} ${json.message || res.status}`);
    return json.data;
  }
}

function prompt(sheet) {
  const rows = [0, 1, 2].map(r => sheet.slice(r * 3, r * 3 + 3));
  return `A 3x3 grid sheet of nine separate square ${STYLE[sheet[0].kind]}, evenly spaced in 3 rows and 3 columns with thin light gutters between tiles, each icon centered on its own dark blue gradient square tile, stylized hand-painted, bold readable silhouettes, rich colors, absolutely no text, no letters, no words, no labels, no numbers. `
    + rows.map((r, i) => `Row ${i + 1} left to right: ${r.map(x => x.look).join('; ')}.`).join(' ');
}

// Finds the 3 tile runs along one axis from an edge-energy profile: the
// artwork is busy, the gutters/margins around tiles are smooth.
function runs(profile, want) {
  const n = profile.length, k = Math.round(n / 100);
  const sm = profile.map((_, i) => { let t = 0, c = 0; for (let j = Math.max(0, i - k); j <= Math.min(n - 1, i + k); j++) { t += profile[j]; c++; } return t / c; });
  const sorted = [...sm].sort((x, y) => x - y);
  const thr = sorted[Math.floor(n * 0.1)] + (sorted[Math.floor(n * 0.9)] - sorted[Math.floor(n * 0.1)]) * 0.3;
  const segs = [];
  let start = -1;
  sm.forEach((v, i) => {
    if (v >= thr && start < 0) start = i;
    if ((v < thr || i === n - 1) && start >= 0) { segs.push([start, v < thr ? i - 1 : i]); start = -1; }
  });
  return segs.filter(([x, y]) => y - x > n / 8).sort((x, y) => (y[1] - y[0]) - (x[1] - x[0])).slice(0, want).sort((x, y) => x[0] - y[0]);
}

async function crop(file, sheet) {
  const img = sharp(file);
  const { width, height } = await img.metadata();
  const { data } = await img.clone().greyscale().raw().toBuffer({ resolveWithObject: true });
  const colP = new Array(width).fill(0), rowP = new Array(height).fill(0);
  for (let y = 1; y < height; y++) for (let x = 1; x < width; x++) {
    const v = data[y * width + x], e = Math.abs(v - data[y * width + x - 1]) + Math.abs(v - data[(y - 1) * width + x]);
    colP[x] += e; rowP[y] += e;
  }
  // Tile centres come from the detail runs (icons are centred in their tiles);
  // the crop size comes from the spacing between centres, so smooth tiles with
  // a small object aren't zoomed in.
  const centres = (prof, n) => { const r = runs(prof, 3); return r.length === 3 ? r.map(([a, b]) => (a + b) / 2) : [n / 6, n / 2, n * 5 / 6]; };
  const cx = centres(colP, width), cy = centres(rowP, height);
  const side = Math.round(Math.min((cx[2] - cx[0]) / 2, (cy[2] - cy[0]) / 2) * 0.8);
  for (let i = 0; i < sheet.length; i++) {
    const x = cx[i % 3], y = cy[Math.floor(i / 3)];
    const left = Math.min(width - side, Math.max(0, Math.round(x - side / 2))), top = Math.min(height - side, Math.max(0, Math.round(y - side / 2)));
    const dir = path.join(OUT, sheet[i].kind);
    fs.mkdirSync(dir, { recursive: true });
    await sharp(file).extract({ left, top, width: side, height: side }).resize(128, 128).webp({ quality: 86 }).toFile(path.join(dir, `${sheet[i].id}.webp`));
  }
  const cols = cx.map(Math.round), rows = cy.map(Math.round);
  return { cols, rows };
}

const { balance } = await api('GET', '/account/balance');
const todo = sheets.map((s, i) => [s, i]).filter(([, i]) => force.has(i) || !fs.existsSync(path.join(SRC, `sheet${i}.png`)));
console.log(`${ICONS.length} icons in ${sheets.length} sheets; ${todo.length} to generate (~${todo.length * 5} credits, balance ${balance}).`);
for (const [sheet, i] of todo) await (async () => { // the account runs one image task at a time
  if (force.has(i)) delete state[i];
  if (!state[i]) { state[i] = (await api('POST', '/generation/text-to-image', { model: 'banana', size: '1024x1024', output_format: 'png', prompt: prompt(sheet) })).task_id; save(); }
  for (;;) {
    const t = await api('GET', `/tasks/${state[i]}`);
    if (t.status === 'success') {
      const res = await fetch(t.output.generated_image_url);
      fs.writeFileSync(path.join(SRC, `sheet${i}.png`), Buffer.from(await res.arrayBuffer()));
      console.log(`✓ sheet ${i} (${sheet[0].kind}: ${sheet.map(s => s.id).join(', ')})`);
      return;
    }
    if (t.status === 'failed' || t.status === 'cancelled') { console.error(`✗ sheet ${i}: ${t.status}`); delete state[i]; save(); return; }
    await sleep(3000);
  }
})();
for (const [i, sheet] of sheets.entries()) {
  const file = path.join(SRC, `sheet${i}.png`);
  if (fs.existsSync(file)) { const g = await crop(file, sheet); if (process.env.DEBUG) console.log(i, JSON.stringify(g)); }
}
const list = [];
for (const kind of fs.existsSync(OUT) ? fs.readdirSync(OUT) : []) {
  if (!fs.statSync(path.join(OUT, kind)).isDirectory()) continue;
  for (const f of fs.readdirSync(path.join(OUT, kind))) if (f.endsWith('.webp')) list.push(`${kind}/${f.replace('.webp', '')}`);
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(list.sort()));
console.log(`${list.length} icons in public/icons`);
