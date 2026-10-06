/* Builds the BroadRoads trailer (about 46 s) from the in-game champions:
     1. key frames: each champion portrait → a photoreal 16:9 still (Higgsfield, Qwen Image 3 edit)
     2. shots: every still animated with Seedance 2.5 image-to-video (Higgsfield)
     3. audio: champion and narrator lines (ElevenLabs v4, each champion's in-game voice),
        a music bed (ElevenLabs Music) and sound effects (ElevenLabs sound generation)
     4. ffmpeg cut: shots + title card, mixed audio → public/trailer/
   Outputs public/trailer/broadroads-trailer.mp4 (full, with sound), bg.mp4 (muted landing-page
   loop) and poster.jpg. Every step is cached in trailer-src/ (git-ignored); delete a file there
   to redo just that piece.
   Needs HF_CREDENTIALS and ELEVENLABS_API_KEY (environment or .env) and ffmpeg
   (FFMPEG=/path/to/ffmpeg, or on PATH).
   Usage: node scripts/trailer/make-trailer.mjs [--only frames|shots|audio|cut] */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { generate, submit, waitFor, uploadImage, loadEnv, SEEDANCE_I2V, SEEDANCE_T2V } from '../higgsfield.mjs';

loadEnv();
const SRC = path.resolve(process.env.TRAILER_SRC || 'trailer-src');
const OUT = path.resolve(process.env.TRAILER_OUT || 'public/trailer');
fs.mkdirSync(SRC, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
/** Clip length in seconds (read from ffmpeg's own report, so no ffprobe is needed). */
const durationOf = file => {
  let out = '';
  try { execFileSync(FFMPEG, ['-hide_banner', '-i', file], { stdio: 'pipe' }); } catch (err) { out = String(err.stderr); }
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(out);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : SHOT;
};
const XI = process.env.ELEVENLABS_API_KEY;
const only = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? process.argv[i + 1] : null; })();
const step = s => !only || only === s;
const SHOT = 6; // seconds per shot (shorter clips are slowed down to fit)
const XF = 0.4; // crossfade
const shotStart = i => i * (SHOT - XF); // 0, 4.6, 9.2, …
const TITLE = 4.6; // the title card holds this long after the last shot

const LOOK = 'photorealistic live-action fantasy film still, cinematic lighting, anamorphic lens, shallow depth of field, volumetric light and atmosphere, highly detailed real materials and skin, epic scale, color graded like a blockbuster trailer, 16:9';
const NEG = 'modern objects, asphalt, guardrail, cars, power lines, buildings from today, cartoon, anime, 3d render, video game graphics, plastic, toy, text, letters, logo, watermark, subtitles, extra limbs, blurry, low quality';

/* The cut. `refs` are in-game portraits used to keep each champion's design. */
const SHOTS = [
  { id: 's1_valley', refs: [],
    still: null,
    motion: 'Slow majestic aerial drone shot at dawn gliding over a vast fantasy valley: three ancient stone roads wind between forests toward two rival fortresses, stone watchtowers with glowing crystals line the roads, a huge glowing blue crystal core pulses at the heart of a fortress, mist in the jungle between the roads, golden sunrise light, photorealistic epic fantasy film, no people, no text' },
  { id: 's2_garrok', refs: ['garrok'],
    still: 'The colossal living stone golem from image 1 (a giant made of cracked tan boulders with glowing molten amber seams in its rocky body) stands on an ancient overgrown cobblestone road through misty mountains at dawn, fists clenched, about to charge, dust and pebbles floating around it. Keep its exact shape, colors and glowing seams',
    motion: 'The giant stone golem roars and charges toward the camera, each heavy step cracking the stone road, boulders and dust exploding around it, the ground shakes, camera shakes and pulls back fast, glowing amber cracks in its body pulse, cinematic slow motion at the end' },
  { id: 's3_lyra_thessa', refs: ['lyra', 'thessa'],
    still: 'On the left, the sun priestess from image 1 (white hair with a golden horned circlet, gleaming white and gold armor, a turquoise gem on her chest) raises a hand that blazes with golden sunlight; on the right, the sea sorceress from image 2 (long flowing teal hair, ornate turquoise gown with silver filigree) commands a towering wave of water rising behind her. They stand side by side on a ruined temple causeway above a stormy sea at dusk. Keep both characters\' designs and colors',
    motion: 'The golden-armored priestess unleashes a blinding beam of sunlight forward while the teal-haired sorceress sweeps her arms and a massive tidal wave surges past them, spray and light flares fill the air, hair and cloth whip in the wind, camera slowly pushes in, epic fantasy film' },
  { id: 's4_kaelen_hale', refs: ['kaelen', 'hale'],
    still: 'Night in a moonlit snowy pine forest: in the foreground the hooded assassin from image 1 (deep hood hiding the face in shadow, layered dark brown and purple leather armor) crouches with twin curved daggers; in the background the winter huntress from image 2 (blue hair, ice-crystal crown, white fur collar, blue and steel armor) draws a bow with an arrow made of glowing ice. Falling snow, cold blue moonlight. Keep both characters\' designs and colors',
    motion: 'In a moonlit snowy forest the hooded figure in dark leather slowly rises from a crouch as swirling shadow smoke curls around him, while behind him the blue-haired winter huntress draws her bow and releases a glowing ice arrow high into the night sky, leaving a trail of frost and sparkling light, snow drifting, slow cinematic push-in, fantasy film' },
  { id: 's5_wyrm', refs: ['thorne', 'brakka', 'rook'],
    still: 'A battlefield of lava and ash under a burning sky: a gigantic ember dragon looms in the background breathing fire; in the foreground three champions charge toward it: the knight from image 1 (black and crimson spiked full plate armor, closed horned helmet, huge axe), the minotaur warrior from image 2 (bull head with great curved horns, heavy black and bronze armor) and the warrior from image 3 (sleek green and silver armor with a horned green helmet, crackling with lightning). Keep all three designs and colors',
    motion: 'The colossal fire dragon roars and sweeps a torrent of flame across the battlefield as the three armored champions charge through the fire toward it, the minotaur lowers his horns, lightning crackles around the green-armored warrior, the knight raises his axe, embers fly past the camera, low tracking shot, epic slow motion' },
  { id: 's7_titan', refs: [], still: null,
    motion: 'Deep underground in a vast dark cavern of black rock and glowing violet crystals, a colossal ancient titan made of obsidian stone and violet magma slowly opens its glowing eyes and rises, dust and boulders falling from its shoulders, ominous purple light, the camera slowly tilts up to its face, photorealistic epic fantasy film, no text' },
  { id: 's8_clash', refs: [], still: null,
    motion: 'Epic wide battle: two armies of fantasy champions under blue and red banners collide on an ancient stone road between stone watchtowers, fire, lightning and light spells explode, warriors in armor clash, ranks of small armored soldiers march along the road, dust and sparks fill the air, dynamic sweeping camera, photorealistic epic fantasy film, no text' },
  { id: 's9_core', refs: [], still: null,
    motion: 'Inside a stone fortress a giant glowing red crystal core cracks under attack, beams of red light burst through the cracks and it shatters in a massive slow-motion explosion of red energy and crystal shards, a shockwave blows dust outward across the courtyard, photorealistic epic fantasy film, no text' },
  { id: 's6_finale', refs: ['borrin', 'mira', 'nyra'],
    still: 'Sunset on a hilltop above the valley with three stone roads leading to an enemy fortress with a glowing red crystal core in the distance: a heroic group stands facing it: the ancient tree guardian from image 1 (a giant humanoid made of twisting wood and bright green leaves), the moon priestess from image 2 (silver crescent halo, blue and silver armor) and the marksman from image 3 (wide brown cowboy hat, long dark hair, brown leather duster coat, rifle). Wind, golden backlight, banners. Keep all three designs and colors',
    motion: 'The heroes stand on the hilltop as the camera slowly rises and circles behind them to reveal the vast valley and the distant enemy fortress glowing red at sunset, their capes, leaves and hair blow in the wind, the marksman tips her hat, the tree guardian\'s leaves glow, epic final shot of a fantasy film trailer' },
];

/* Story narration: one storyteller (ElevenLabs "George", eleven_v4) reads the whole trailer in the
   third person, one line per shot, plus the closing line over the title card. */
const NARRATOR = 'JBFqnCBsd6RMkjVDRZzb';
const STORY = {
  s1_valley: 'Three roads cross the Valley. Every one of them leads to war.',
  s2_garrok: 'Garrok, the Mountain Heart, wakes when the earth is threatened.',
  s3_lyra_thessa: 'Lyra calls the dawn. Thessa commands the tide.',
  s4_kaelen_hale: 'In the frozen woods, Kaelen strikes unseen, and Hale never misses.',
  s5_wyrm: 'When the Ember Wyrm rises, Thorne, Brakka and Rook charge in.',
  s7_titan: 'Far below, the Abyss Titan stirs.',
  s8_clash: 'Five against five, lane by lane, tower by tower...',
  s9_core: '...until one Core falls.',
  s6_finale: 'Borrin, Mira and Nyra stand ready. The Valley is waiting.',
  title: 'Choose your champion. BroadRoads. Play free, in your browser.',
};
const VOICE_STYLE = '[warm, captivating storyteller, epic fantasy trailer narration] ';
const FX = {
  s1_valley: ['fx_wind', 'cinematic deep wind over a vast valley, distant birds, low rumble, trailer atmosphere', 5],
  s2_garrok: ['fx_stomp', 'giant stone golem footsteps shaking the ground, rocks cracking and exploding, heavy cinematic impacts', 4.5],
  s3_lyra_thessa: ['fx_wave', 'massive magical tidal wave crashing with a shimmering light beam blast, cinematic', 4.5],
  s4_kaelen_hale: ['fx_blade', 'shadow teleport whoosh then twin daggers slashing, an ice arrow whistling past and freezing', 4.5],
  s5_wyrm: ['fx_dragon', 'colossal dragon roar with a torrent of fire breath and crackling lightning, epic battle', 4.8],
  s7_titan: ['fx_titan', 'colossal stone titan awakening deep underground, earth-shaking rumble, cracking rock, low monstrous growl, cinematic', 4.8],
  s8_clash: ['fx_clash', 'epic fantasy battle, two armies clashing, swords and shields, magic explosions, war cries, cinematic', 4.8],
  s9_core: ['fx_core', 'giant crystal cracking then shattering in a huge magical explosion with a deep shockwave, cinematic slow motion', 4.8],
  s6_finale: ['fx_finale', 'wind on a hilltop, banners flapping, a rising heroic orchestral swell of air, cinematic', 4.8],
};
// The cut uses every shot that has a clip or at least a key frame (missing ones are left out
// with their narration, e.g. while credits run out) — timings and the score follow from it.
const have = f => fs.existsSync(f) && fs.statSync(f).size > 0;
const CUT = SHOTS.filter(s => have(path.join(SRC, `${s.id}.mp4`)) || have(path.join(SRC, `${s.id}.png`)));
const ORDER = CUT.map(s => s.id);
const lastStart = shotStart(CUT.length - 1);
const TITLE_AT = lastStart + SHOT - 0.4; // title fades in as the last shot ends
const TOTAL = Math.round((TITLE_AT + TITLE) * 10) / 10;
const LINES = [
  ...ORDER.map((id, i) => ({ id: `n_${id}`, at: shotStart(i) + 0.2, voice: NARRATOR, text: VOICE_STYLE + STORY[id] })),
  { id: 'n_title', at: TITLE_AT + 0.3, voice: NARRATOR, text: VOICE_STYLE + STORY.title },
];
const SFX = [
  ...ORDER.map((id, i) => ({ id: FX[id][0], at: shotStart(i) + 0.05, text: FX[id][1], dur: FX[id][2] })),
  { id: 'fx_boom', at: TITLE_AT, text: 'huge cinematic trailer logo hit, deep boom with reverb tail', dur: 2.4 },
];
// Timed sections so the build and the final hit land on the cut.
const ms = x => Math.round(x * 1000);
const MUSIC_FILE = `music_${TOTAL}s.mp3`; // re-scored whenever the cut's length changes
const MUSIC_PLAN = {
  positive_global_styles: ['epic orchestral fantasy trailer', 'cinematic', 'choir', 'taiko drums', 'brass', 'instrumental', 'storytelling'],
  negative_global_styles: ['vocals with lyrics', 'pop', 'electronic', 'lo-fi'],
  sections: (() => {
    // Section boundaries at shot starts: intro, the champions, the war (titan onward), the finale, the title.
    const at = id => { const i = ORDER.indexOf(id); return i < 0 ? null : shotStart(i); };
    const war = at('s7_titan') ?? at('s5_wyrm') ?? shotStart(Math.max(1, CUT.length - 3));
    const fin = shotStart(CUT.length - 1);
    return [
      { section_name: 'Once upon a time', positive_local_styles: ['quiet, mysterious', 'low strings', 'soft choir pad', 'distant horn'], negative_local_styles: ['drums'], duration_ms: ms(shotStart(1)), lines: [] },
      { section_name: 'The champions', positive_local_styles: ['taiko drums enter', 'pulsing strings ostinato', 'rising brass', 'heroic, building'], negative_local_styles: [], duration_ms: ms(war - shotStart(1)), lines: [] },
      { section_name: 'War', positive_local_styles: ['full orchestra and choir', 'driving percussion', 'intense battle', 'climax'], negative_local_styles: [], duration_ms: ms(fin - war), lines: [] },
      { section_name: 'The Valley is waiting', positive_local_styles: ['heroic resolve', 'soaring brass theme', 'choir swell'], negative_local_styles: [], duration_ms: ms(TITLE_AT - fin), lines: [] },
      { section_name: 'Title', positive_local_styles: ['one massive final orchestral hit and boom', 'long reverb tail', 'silence after'], negative_local_styles: ['melody continues'], duration_ms: ms(TOTAL - TITLE_AT), lines: [] },
    ];
  })(),
};

const exists = f => fs.existsSync(f) && fs.statSync(f).size > 0;
async function download(url, file) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${url}: ${r.status}`);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}
async function xi(url, body, file) {
  const r = await fetch(`https://api.elevenlabs.io${url}`, { method: 'POST', headers: { 'xi-api-key': XI, 'Content-Type': 'application/json', Accept: 'audio/mpeg' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`ElevenLabs ${url}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}
const ff = args => execFileSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });

/* 1. key frames */
async function frames() {
  const refUrls = {};
  const ref = async id => {
    if (!refUrls[id]) {
      const png = path.join(SRC, `ref_${id}.png`);
      if (!exists(png)) execFileSync(process.execPath, ['-e', `require('sharp')('public/portraits/${id}.webp').resize(768,768).png().toFile('${png}')`]);
      refUrls[id] = await uploadImage(png);
    }
    return refUrls[id];
  };
  const onlyIds = process.env.SHOT_IDS?.split(',');
  await Promise.all(SHOTS.filter(s => s.still && (!onlyIds || onlyIds.includes(s.id))).map(async s => {
    const file = path.join(SRC, `${s.id}.png`);
    if (exists(file)) return;
    const urls = [];
    for (const r of s.refs) urls.push(await ref(r));
    console.log(`frame ${s.id}…`);
    // Qwen Image 3 edit first; Grok Imagine 2.0 (also reference-guided) when Qwen is unavailable.
    let url;
    try {
      url = await generate('alibaba/qwen-image-3/edit', { prompt: `${s.still}. ${LOOK}`, negative_prompt: NEG, image_urls: urls, aspect_ratio: '16:9', resolution: '2k' });
    } catch (err) {
      console.warn(`  qwen: ${err.message.split(' (request')[0]} → trying grok`);
      url = await generate('xai/grok-imagine-image-2.0', { prompt: `${s.still}. ${LOOK}. Avoid: ${NEG}`, image_urls: urls, aspect_ratio: '16:9', resolution: '2k', quality: 'medium' });
    }
    await download(url, file);
    console.log(`✓ frame ${s.id}`);
  }));
}

/* 2. shots: one at a time, each request id saved as soon as it is submitted so a re-run
   picks up a running or finished request instead of paying for it again. */
async function shots() {
  const reqFile = path.join(SRC, 'requests.json');
  const reqs = exists(reqFile) ? JSON.parse(fs.readFileSync(reqFile, 'utf8')) : {};
  const save = () => fs.writeFileSync(reqFile, JSON.stringify(reqs, null, 1));
  const onlyIds = process.env.SHOT_IDS?.split(',');
  const failed = [];
  for (const s of SHOTS.filter(x => !onlyIds || onlyIds.includes(x.id))) {
    const file = path.join(SRC, `${s.id}.mp4`);
    if (exists(file)) continue;
    if (!reqs[s.id]) {
      const common = { prompt: s.motion, duration: SHOT, resolution: process.env.SHOT_RES || '720p', generate_audio: false, output_format: 'mp4' };
      reqs[s.id] = s.still
        ? await submit(SEEDANCE_I2V, { ...common, image_url: await uploadImage(path.join(SRC, `${s.id}.png`)) })
        : await submit(SEEDANCE_T2V, { ...common, aspect_ratio: '16:9' });
      save();
      console.log(`shot ${s.id} submitted (${reqs[s.id]})`);
    } else console.log(`shot ${s.id}: resuming ${reqs[s.id]}`);
    try {
      await download(await waitFor(reqs[s.id]), file);
      console.log(`✓ shot ${s.id}`);
    } catch (err) {
      if (err.terminal) { delete reqs[s.id]; save(); } // failed requests are refunded; submit fresh next time
      console.error(`✗ shot ${s.id}: ${err.message}`);
      failed.push(s.id);
      if (/balance is too low|not_enough_credits/.test(err.message)) break; // the rest would fail too
    }
  }
  if (failed.length) throw new Error(`shots not generated: ${failed.join(', ')}`);
}

/* 3. audio */
async function audio() {
  if (!XI) throw new Error('Set ELEVENLABS_API_KEY');
  const jobs = [];
  for (const l of LINES) {
    const f = path.join(SRC, `${l.id}.mp3`);
    if (!exists(f)) jobs.push(() => xi(`/v1/text-to-speech/${l.voice}?output_format=mp3_44100_192`, { text: l.text, model_id: 'eleven_v4', voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true } }, f).then(() => console.log(`✓ ${l.id}`)));
  }
  for (const s of SFX) {
    const f = path.join(SRC, `${s.id}.mp3`);
    if (!exists(f)) jobs.push(() => xi('/v1/sound-generation', { text: s.text, duration_seconds: s.dur, prompt_influence: 0.5 }, f).then(() => console.log(`✓ ${s.id}`)));
  }
  const mf = path.join(SRC, MUSIC_FILE);
  if (!exists(mf)) jobs.push(() => xi('/v1/music', { composition_plan: MUSIC_PLAN, model_id: 'music_v1', respect_sections_durations: true }, mf).then(() => console.log('✓ music')));
  for (let i = 0; i < jobs.length; i += 3) await Promise.all(jobs.slice(i, i + 3).map(j => j()));
}

/* Title card (transparent PNG; this ffmpeg build has no text filter). Uses Cinzel if installed. */
async function titleCard(file) {
  const { default: sharp } = await import('sharp');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
    <defs><radialGradient id="g" cx="50%" cy="50%" r="55%"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>
    <rect width="1920" height="1080" fill="url(#g)"/>
    <text x="960" y="540" text-anchor="middle" font-family="Cinzel, DejaVu Serif, serif" font-weight="900" font-size="168" letter-spacing="22" fill="#f6e7b8">BROADROADS</text>
    <rect x="760" y="590" width="400" height="2" fill="#d4af37" opacity=".8"/>
    <text x="960" y="660" text-anchor="middle" font-family="Cinzel, DejaVu Serif, serif" font-weight="700" font-size="46" letter-spacing="4" fill="#d4af37">FREE 5V5 MOBA IN YOUR BROWSER</text>
    <text x="960" y="730" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="38" fill="#ece6da">broadroads.com</text>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
}

/* 4. cut */
async function cut() {
  // Shots are SHOT seconds long and overlap by XF in crossfades; the last one holds its
  // final frame under the title card so the cut runs exactly TOTAL seconds.
  const total = TOTAL;
  // A shot without a generated clip (e.g. credits ran out) becomes a slow push-in on its key frame.
  const clip = (s, i) => {
    const mp4 = path.join(SRC, `${s.id}.mp4`);
    if (exists(mp4)) return mp4;
    const png = path.join(SRC, `${s.id}.png`), still = path.join(SRC, `${s.id}.still.mp4`);
    if (!exists(png)) throw new Error(`shot ${s.id}: no clip and no key frame`);
    if (!exists(still)) {
      const n = SHOT * 30, dir = i % 2 ? -1 : 1; // alternate drift direction
      ff(['-loop', '1', '-i', png, '-vf', `scale=3840:-2,zoompan=z='1.0+0.10*on/${n}':x='iw/2-(iw/zoom/2)+${dir}*on*1.2':y='ih/2-(ih/zoom/2)':d=${n}:s=1920x1080:fps=30,format=yuv420p`, '-frames:v', String(n), '-c:v', 'libx264', '-crf', '17', still]);
    }
    console.log(`  ${s.id}: using a push-in on the key frame (no generated clip yet)`);
    return still;
  };
  const vin = CUT.flatMap((s, i) => ['-i', clip(s, i)]);
  const lastIdx = CUT.length - 1;
  const clips = CUT.map((s, i) => vin[i * 2 + 1]);
  // Every clip is fitted to SHOT seconds: a 5 s clip plays in gentle slow motion.
  const stretch = clips.map(f => Math.max(1, SHOT / durationOf(f)).toFixed(4));
  let fc = CUT.map((_, i) => `[${i}:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setpts=${stretch[i]}*(PTS-STARTPTS),trim=0:${SHOT},setpts=PTS-STARTPTS,fps=30,settb=1/30${i === lastIdx ? `,tpad=stop_mode=clone:stop_duration=${(TOTAL - shotStart(lastIdx) - SHOT + 0.1).toFixed(2)}` : ''},format=yuv420p[v${i}]`).join(';');
  let last = 'v0';
  CUT.slice(1).forEach((_, k) => {
    const i = k + 1;
    fc += `;[${last}][v${i}]xfade=transition=fade:duration=${XF}:offset=${shotStart(i).toFixed(2)}[x${i}]`;
    last = `x${i}`;
  });
  const titleAt = TITLE_AT; // with the music's final hit
  const title = path.join(SRC, 'title.png');
  await titleCard(title);
  vin.push('-loop', '1', '-t', String(TITLE + 0.5), '-i', title);
  fc += `;[${last}]trim=0:${total},fade=t=out:st=${titleAt}:d=0.8:color=black[dim]`; // picture fades out under the title
  fc += `;[${CUT.length}:v]format=rgba,fade=t=in:st=0.4:d=0.7:alpha=1,setpts=PTS-STARTPTS+${titleAt}/TB[title];[dim][title]overlay=0:0:eof_action=pass,format=yuv420p[vout]`;

  // Audio: music bed (ducked under voices), sfx, voice lines at their times.
  const ain = [[MUSIC_FILE.replace('.mp3', ''), 0], ...SFX.map(s => [s.id, s.at]), ...LINES.map(l => [l.id, l.at])];
  const aArgs = ain.flatMap(([id]) => ['-i', path.join(SRC, `${id}.mp3`)]);
  const base = CUT.length + 1; // after the shots and the title card
  const parts = [];
  ain.forEach(([id, at], k) => {
    const idx = base + k;
    const isVo = id.startsWith('n_'), isMusic = id.startsWith('music');
    const vol = isMusic ? 0.55 : isVo ? 1.6 : 0.7;
    parts.push(`[${idx}:a]aresample=44100,aformat=channel_layouts=stereo,${isVo ? 'atempo=1.04,' : ''}volume=${vol},adelay=${Math.round(at * 1000)}|${Math.round(at * 1000)}${isMusic ? `,afade=t=out:st=${total - 1.2}:d=1.2` : ''}[a${k}]`);
  });
  const voIdx = ain.map(([id], k) => (id.startsWith('n_') ? `[a${k}]` : '')).join('');
  const otherIdx = ain.map(([id], k) => (!id.startsWith('n_') && !id.startsWith('music') ? `[a${k}]` : '')).join('');
  const voCount = LINES.length, fxCount = SFX.length;
  parts.push(`${voIdx}amix=inputs=${voCount}:normalize=0,asplit=2[vo][vokey]`);
  parts.push(`[a0][vokey]sidechaincompress=threshold=0.05:ratio=6:attack=20:release=400[musicd]`);
  parts.push(`${otherIdx}amix=inputs=${fxCount}:normalize=0[fx]`);
  parts.push(`[musicd][fx][vo]amix=inputs=3:normalize=0,alimiter=limit=0.95,atrim=0:${total}[aout]`);
  fc += ';' + parts.join(';');

  const full = path.join(OUT, 'broadroads-trailer.mp4');
  ff([...vin, ...aArgs, '-filter_complex', fc, '-map', '[vout]', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', String(total), full]);
  // Landing page background: muted, 720p, no title card (the page has its own headline), loops cleanly.
  const bgLen = Math.round(TITLE_AT * 10) / 10; // everything before the title card
  ff(['-i', full, '-t', String(bgLen), '-an', '-vf', `scale=1280:720,fade=t=in:st=0:d=0.6,fade=t=out:st=${bgLen - 0.6}:d=0.6`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(OUT, 'bg.mp4')]);
  ff(['-ss', '6.5', '-i', full, '-frames:v', '1', '-vf', 'scale=1280:720', '-q:v', '4', path.join(OUT, 'poster.jpg')]);
  for (const f of ['broadroads-trailer.mp4', 'bg.mp4', 'poster.jpg']) console.log(`✓ ${f} ${(fs.statSync(path.join(OUT, f)).size / 1048576).toFixed(1)} MB`);
}

if (step('frames')) await frames();
if (step('shots')) await shots();
if (step('audio')) await audio();
if (step('cut')) await cut();
