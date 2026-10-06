/* Generates every sound effect, music loop and announcer line with the
   ElevenLabs API and writes them to public/sfx/.
   Usage: ELEVENLABS_API_KEY=... node scripts/generate-audio.mjs [--force] [key ...]
   Existing files are skipped unless --force is given. */
import fs from 'node:fs';
import path from 'node:path';

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) { console.error('Set ELEVENLABS_API_KEY'); process.exit(1); }
const OUT = path.resolve('public/sfx');
fs.mkdirSync(OUT, { recursive: true });
for (const l of ['tr', 'es']) fs.mkdirSync(path.join(OUT, l), { recursive: true });
const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter(a => !a.startsWith('--'));

const ANNOUNCER_VOICE = 'nPczCjzI2devNBz1zQrb'; // "Brian" — deep, resonant

// [key, prompt, seconds, volume]
const SFX = [
  // UI
  ['ui_click', 'short crisp fantasy game UI button click, soft wooden tick', 0.5, 0.5],
  ['ui_hover', 'very soft subtle UI hover tick, airy and quiet', 0.5, 0.25],
  ['ui_open', 'fantasy game menu panel opening, soft parchment swoosh', 0.7, 0.5],
  ['ui_close', 'fantasy game menu panel closing, short soft swoosh down', 0.5, 0.45],
  ['ui_error', 'short soft muted negative UI buzz, error blip', 0.5, 0.5],
  ['ui_notify', 'gentle magical notification chime, two bright notes', 0.8, 0.6],
  ['ui_buy', 'gold coins dropping into a leather pouch, purchase confirmation', 0.8, 0.6],
  ['ui_sell', 'coins sliding across a wooden counter with a small bell ding', 0.8, 0.6],
  ['ui_skill', 'short bright magical power-up sparkle, ability unlocked', 0.7, 0.55],
  ['queue_found', 'epic match found, war horn blast and big drum hit, triumphant and short', 2.0, 0.8],
  ['lock_in', 'heavy sword locking into place with a magical shimmer', 1.0, 0.7],
  ['select_tick', 'single wooden clock tick, short', 0.5, 0.35],
  ['chat_msg', 'soft pop of a chat message bubble', 0.5, 0.35],
  ['match_start', 'deep war horn blowing across a fantasy valley, echoing', 3.0, 0.75],
  // Movement
  ['step_1', 'single footstep on a dirt path, leather boot, close', 0.5, 0.18],
  ['step_2', 'single footstep on gravel, leather boot, close', 0.5, 0.18],
  ['step_3', 'single soft footstep on grass, leather boot, close', 0.5, 0.18],
  ['dash', 'fast whoosh of a warrior dashing forward', 0.6, 0.6],
  ['blink', 'magical teleport blink, crystalline zap', 0.7, 0.6],
  ['recall_channel', 'mystical humming portal charging up, rising shimmering tone', 4.0, 0.5],
  ['recall_done', 'teleport arrival, magical whoosh ending in a soft chime', 1.0, 0.6],
  ['respawn', 'holy revival chime with a rising choir shimmer', 1.5, 0.6],
  // Basic attacks
  ['atk_sword', 'heavy sword swing whoosh', 0.5, 0.45],
  ['atk_axe', 'heavy battle axe swing whoosh', 0.5, 0.45],
  ['atk_fist', 'heavy stone fist punch with a dull impact', 0.5, 0.45],
  ['atk_bow', 'bowstring release and arrow whizzing away', 0.6, 0.45],
  ['atk_gun', 'old flintlock musket shot, short and punchy', 0.6, 0.45],
  ['atk_magic', 'small magic missile cast, sparkly zap', 0.6, 0.45],
  ['hit_physical', 'blade striking armor and flesh, short impact', 0.5, 0.45],
  ['hit_magic', 'magic energy impact, fizzling spark', 0.5, 0.45],
  ['hit_crit', 'powerful critical slash impact with a metallic ring', 0.7, 0.6],
  ['hurt', 'muffled body hit thud, taking damage', 0.5, 0.5],
  ['death_hero', 'heroic character death, heavy body fall with a low dramatic boom', 1.5, 0.7],
  ['death_minion', 'small creature defeated, short magical poof', 0.5, 0.3],
  ['gold', 'short coin pickup jingle', 0.5, 0.35],
  ['levelup', 'level up fanfare, bright magical ascending chime', 1.5, 0.7],
  ['potion', 'drinking a potion, gulp with bubbling liquid', 1.0, 0.6],
  ['ward', 'placing a magical totem, soft thump and a glowing hum', 0.8, 0.5],
  ['trap', 'metal bear trap snapping shut', 0.6, 0.65],
  ['shield', 'magical shield forming, glassy shimmer', 0.7, 0.5],
  ['heal', 'healing spell, warm gentle chime', 0.8, 0.5],
  ['stun', 'dazed and stunned, little twittering birds and a bonk', 0.7, 0.5],
  // Battle spells
  ['sp_scorch', 'flames igniting with a whoosh and crackle', 0.8, 0.6],
  ['sp_strike', 'lightning bolt smiting the ground, sharp crack', 0.8, 0.65],
  ['sp_haste', 'rush of wind, speed boost whoosh', 0.8, 0.55],
  // Structures, monsters, objectives
  ['tower_shot', 'crystal tower firing a heavy energy bolt, deep zap', 0.8, 0.55],
  ['tower_destroyed', 'large stone tower crumbling and collapsing', 2.5, 0.8],
  ['spire_destroyed', 'giant magic crystal shattering in an explosion', 2.0, 0.8],
  ['core_destroyed', 'massive magical crystal core exploding, epic and booming', 3.5, 0.9],
  ['wyrm_roar', 'huge fire dragon roar', 2.0, 0.75],
  ['titan_roar', 'colossal otherworldly abyss monster roar, deep and rumbling', 2.5, 0.8],
  ['monster_roar', 'wild jungle beast growl, short', 0.8, 0.5],
  // Pings
  ['ping_go', 'short clear positive ping beep', 0.5, 0.5],
  ['ping_danger', 'urgent warning ping, two quick alarm beeps', 0.7, 0.55],
  ['ping_help', 'bright assistance ping chime', 0.6, 0.5],
  ['ping_omw', 'quick ascending blips, on my way ping', 0.6, 0.5],
  // Stingers
  ['victory', 'short triumphant orchestral victory fanfare', 4.0, 0.8],
  ['defeat', 'short somber orchestral defeat sting with low brass', 4.0, 0.8],
  // Champion abilities
  ['garrok_q', 'boulder thrown through the air then crunching impact', 1.0, 0.6],
  ['garrok_w', 'crackling electricity charging stone fists', 1.0, 0.55],
  ['garrok_e', 'heavy ground stomp, earthquake thud', 1.0, 0.65],
  ['garrok_r', 'avalanche charge, rumbling rocks and a massive crash', 2.0, 0.75],
  ['lyra_q', 'magical chains of light snapping tight', 1.0, 0.55],
  ['lyra_w', 'bright protective magic shield humming', 1.0, 0.5],
  ['lyra_e', 'orb of solar energy swelling then bursting', 1.5, 0.6],
  ['lyra_r', 'massive laser beam of light charging up and firing', 2.0, 0.75],
  ['kaelen_q', 'throwing star whirling through the air', 0.8, 0.55],
  ['kaelen_w', 'shadowy teleport dash whoosh', 0.8, 0.55],
  ['kaelen_e', 'rapid double blade slash', 0.8, 0.55],
  ['kaelen_r', 'dark assassin strike with an ominous echoing boom', 1.5, 0.7],
  ['hale_q', 'bowstring tightening with a frosty sparkle', 0.8, 0.5],
  ['hale_w', 'volley of icy arrows whistling', 1.0, 0.6],
  ['hale_e', 'quick light dodge roll whoosh', 0.6, 0.5],
  ['hale_r', 'giant spear of ice launched with a freezing crackle', 1.5, 0.7],
  ['thorne_q', 'huge axe spinning around in a heavy whoosh', 1.0, 0.6],
  ['thorne_w', 'brutal crippling axe hit', 0.8, 0.6],
  ['thorne_e', 'heavy iron chain hook thrown and yanked back', 1.0, 0.6],
  ['thorne_r', 'massive executioner axe slamming down', 1.5, 0.75],
  ['mira_q', 'falling star impact with sparkles', 1.0, 0.55],
  ['mira_w', 'soft healing blessing chime', 1.0, 0.5],
  ['mira_e', 'eerie humming zone of magical silence', 1.5, 0.55],
  ['mira_r', 'angelic choir healing hymn swelling', 2.0, 0.65],
  ['zarak_q', 'fireball whoosh', 0.8, 0.55],
  ['zarak_w', 'roaring cone of fire blast', 1.0, 0.6],
  ['zarak_e', 'fire shield igniting around a mage', 1.0, 0.55],
  ['zarak_r', 'meteor falling and a huge fiery explosion', 2.0, 0.8],
  ['nyra_q', 'long rifle charged shot, powerful crack', 1.0, 0.65],
  ['nyra_w', 'metal trap being set with a click', 0.6, 0.5],
  ['nyra_e', 'weighted bola thrown and whirling', 0.8, 0.55],
  ['nyra_r', 'sniper rifle focused shot, slow heavy boom', 1.5, 0.75],
  ['brakka_q', 'giant hooves smashing the ground, quake', 1.0, 0.65],
  ['brakka_w', 'charging bull headbutt impact', 1.0, 0.65],
  ['brakka_e', 'bull war bellow roar', 1.2, 0.6],
  ['brakka_r', 'metal armor hardening with a deep clang', 1.2, 0.6],
  ['rook_q', 'spinning blade cyclone whirling', 1.5, 0.55],
  ['rook_w', 'axe thrown spinning through the air', 0.8, 0.55],
  ['rook_e', 'leap and heavy landing slam', 1.0, 0.65],
  ['rook_r', 'storm shockwave with thunder', 1.5, 0.75],
  ['thessa_q', 'water spear launched with a splash', 0.9, 0.55],
  ['thessa_w', 'swirling whirlpool rushing water pulling inward', 1.4, 0.6],
  ['thessa_e', 'magical bubble forming with a soft shimmering pop', 1.0, 0.5],
  ['thessa_r', 'massive ocean wave crashing tsunami roar', 2.0, 0.8],
  ['borrin_q', 'thorny vine whip crack', 0.8, 0.55],
  ['borrin_w', 'creaking wood bark hardening, deep rustle', 1.2, 0.55],
  ['borrin_e', 'thorns sprouting from the ground, rustling brambles', 1.4, 0.55],
  ['borrin_r', 'giant roots erupting from the earth, cracking ground', 2.0, 0.8],
];

// [key, prompt, seconds, volume] — long loops.
const MUSIC = [
  ['music_lobby', 'calm epic fantasy orchestral menu music, strings and soft drums, loopable', 22, 0.35],
  ['amb_valley', 'peaceful fantasy valley ambience, light wind, distant birds, soft river, loopable', 20, 0.3],
];

const VOICE = [
  ['vo_welcome', 'Welcome to the Valley.'],
  ['vo_minions_soon', 'Thirty seconds until minions spawn.'],
  ['vo_minions', 'Minions have spawned.'],
  ['vo_first_strike', 'First strike!'],
  ['vo_multi2', 'Double takedown!'],
  ['vo_multi3', 'Triple takedown!'],
  ['vo_multi4', 'Quad takedown!'],
  ['vo_multi5', 'Total takedown!'],
  ['vo_you_slain', 'You have been slain.'],
  ['vo_you_killed', 'You have slain an enemy.'],
  ['vo_ally_slain', 'An ally has been slain.'],
  ['vo_enemy_slain', 'An enemy has been slain.'],
  ['vo_streak3', 'Heating up!'],
  ['vo_streak4', 'On fire!'],
  ['vo_streak5', 'Relentless!'],
  ['vo_streak6', 'Overwhelming!'],
  ['vo_streak7', 'Mythic!'],
  ['vo_streak8', 'Beyond legend!'],
  ['vo_streak_end', 'Streak ended!'],
  ['vo_team_wipe', 'Team wipe!'],
  ['vo_ally_tower', 'Your tower has fallen.'],
  ['vo_enemy_tower', 'Enemy tower destroyed.'],
  ['vo_ally_spire', 'Your spire has been destroyed.'],
  ['vo_enemy_spire', 'Enemy spire destroyed. Juggernaut minions incoming!'],
  ['vo_spire_restored', 'A spire has been restored.'],
  ['vo_wyrm_spawn', 'The Ember Wyrm has spawned.'],
  ['vo_titan_spawn', 'The Abyss Titan has awoken.'],
  ['vo_ally_wyrm', 'Your team has slain the Ember Wyrm.'],
  ['vo_enemy_wyrm', 'The enemy has slain the Ember Wyrm.'],
  ['vo_ally_titan', 'Your team has slain the Abyss Titan.'],
  ['vo_enemy_titan', 'The enemy has slain the Abyss Titan.'],
  ['vo_victory', 'Victory!'],
  ['vo_defeat', 'Defeat.'],
  ['vo_match_found', 'Match found.'],
  ['vo_choose', 'Choose your champion.'],
];

// Announcer lines in the other interface languages (public/sfx/<lang>/<key>.mp3).
const VOICE_I18N = {
  tr: {
    vo_welcome: 'Vadiye hoş geldiniz.', vo_minions_soon: 'Minyonların doğmasına otuz saniye.', vo_minions: 'Minyonlar doğdu.',
    vo_first_strike: 'İlk kan!', vo_multi2: 'Çifte alaşağı!', vo_multi3: 'Üçlü alaşağı!', vo_multi4: 'Dörtlü alaşağı!', vo_multi5: 'Tam alaşağı!',
    vo_you_slain: 'Öldürüldün.', vo_you_killed: 'Bir düşmanı öldürdün.', vo_ally_slain: 'Bir müttefik öldürüldü.', vo_enemy_slain: 'Bir düşman öldürüldü.',
    vo_streak3: 'Isınıyor!', vo_streak4: 'Alev aldı!', vo_streak5: 'Durdurulamıyor!', vo_streak6: 'Ezip geçiyor!', vo_streak7: 'Efsaneleşti!', vo_streak8: 'Efsanenin ötesinde!',
    vo_streak_end: 'Seri sona erdi!', vo_team_wipe: 'Takım silindi!',
    vo_ally_tower: 'Kulen yıkıldı.', vo_enemy_tower: 'Düşman kulesi yıkıldı.', vo_ally_spire: 'Sütunun yıkıldı.', vo_enemy_spire: 'Düşman sütunu yıkıldı. Dev minyonlar geliyor!', vo_spire_restored: 'Bir sütun yeniden kuruldu.',
    vo_wyrm_spawn: 'Kor Ejderi ortaya çıktı.', vo_titan_spawn: 'Uçurum Titanı uyandı.',
    vo_ally_wyrm: "Takımın Kor Ejderi'ni kesti.", vo_enemy_wyrm: "Düşman Kor Ejderi'ni kesti.", vo_ally_titan: "Takımın Uçurum Titanı'nı kesti.", vo_enemy_titan: "Düşman Uçurum Titanı'nı kesti.",
    vo_victory: 'Zafer!', vo_defeat: 'Yenilgi.', vo_match_found: 'Maç bulundu.', vo_choose: 'Şampiyonunu seç.',
  },
  es: {
    vo_welcome: 'Bienvenidos al Valle.', vo_minions_soon: 'Treinta segundos para que aparezcan los súbditos.', vo_minions: 'Han aparecido los súbditos.',
    vo_first_strike: '¡Primera sangre!', vo_multi2: '¡Doble derribo!', vo_multi3: '¡Triple derribo!', vo_multi4: '¡Cuádruple derribo!', vo_multi5: '¡Derribo total!',
    vo_you_slain: 'Te han eliminado.', vo_you_killed: 'Has eliminado a un enemigo.', vo_ally_slain: 'Han eliminado a un aliado.', vo_enemy_slain: 'Un enemigo ha sido eliminado.',
    vo_streak3: '¡Se está calentando!', vo_streak4: '¡Está que arde!', vo_streak5: '¡Implacable!', vo_streak6: '¡Arrollador!', vo_streak7: '¡Mítico!', vo_streak8: '¡Más que una leyenda!',
    vo_streak_end: '¡Racha terminada!', vo_team_wipe: '¡Equipo arrasado!',
    vo_ally_tower: 'Ha caído tu torre.', vo_enemy_tower: 'Torre enemiga destruida.', vo_ally_spire: 'Han destruido tu aguja.', vo_enemy_spire: 'Aguja enemiga destruida. ¡Llegan súbditos colosales!', vo_spire_restored: 'Una aguja ha sido restaurada.',
    vo_wyrm_spawn: 'Ha aparecido el Wyrm de Ascuas.', vo_titan_spawn: 'El Titán del Abismo ha despertado.',
    vo_ally_wyrm: 'Tu equipo ha derrotado al Wyrm de Ascuas.', vo_enemy_wyrm: 'El enemigo ha derrotado al Wyrm de Ascuas.', vo_ally_titan: 'Tu equipo ha derrotado al Titán del Abismo.', vo_enemy_titan: 'El enemigo ha derrotado al Titán del Abismo.',
    vo_victory: '¡Victoria!', vo_defeat: 'Derrota.', vo_match_found: 'Partida encontrada.', vo_choose: 'Elige a tu campeón.',
  },
};

// Champion voice lines: [champion, voice id, pick, ultimate, kill, death].
const CHAMP_VOICES = [
  ['garrok', 'pNInz6obpgDQGcFmaJgB', 'The mountain stands with you.', 'Avalanche!', 'Crumbled.', 'I return... to stone.'],
  ['lyra', 'pFZP5JQG7iQjIQuC4Bku', 'Dawn breaks for those who fight.', 'Behold, the daybreak!', 'The light finds you.', 'The sun... sets.'],
  ['kaelen', 'N2lVS1w4EtoT3dr4eOWO', 'No one sees the knife coming.', 'Your verdict is final.', 'Quiet now.', 'Caught... in the light.'],
  ['hale', 'EXAVITQu4vr4xnSDxMaL', 'The hunt begins in silence.', "Feel winter's bite!", 'Clean shot.', 'The cold... takes me.'],
  ['thorne', 'SOYHLrjzK2X1ezoPC6cr', 'Iron does not bend.', 'Your execution is now!', 'Bleed for me.', 'Even iron... breaks.'],
  ['mira', 'Xb7hH8MSUJpSbSDYk0k2', 'The moon watches over us.', 'Hear the lunar hymn!', 'Rest beneath the stars.', 'The moon... dims.'],
  ['zarak', 'TX3LPaxmHKxFdv7VOQHJ', "Let's light this place up!", 'Meteor, incoming!', 'Too hot to handle!', 'Aw... burned out.'],
  ['nyra', 'FGY2WhTYpPnrIDTdsKH5', 'Badge on. Safety off.', 'Dead eye. Dead you.', 'Bounty collected.', "Should've seen that coming."],
  ['brakka', 'IKne3meq5aSn9XLyUdCD', 'The herd charges as one!', 'Iron hide! Bring it on!', 'Trampled!', 'The herd... will remember.'],
  ['rook', 'CwhRBWXzGAHq8TQ4Fs17', 'The storm answers my call.', 'Tempest, rage!', 'Swept away.', 'The storm... passes.'],
  ['thessa', 'cgSgspJ2msm6clMCkdW9', 'The tide is with us.', 'Rise, ocean!', 'Washed away.', 'Back... to the sea.'],
  ['borrin', 'pqHfZKP75CvOlQylNhV4', 'Roots run deep.', 'Overgrow them all!', 'Back to the soil.', 'Even oaks... fall.'],
];

async function post(url, body, attempt = 1) {
  const res = await fetch(url, { method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' }, body: JSON.stringify(body) });
  if (res.ok) return Buffer.from(await res.arrayBuffer());
  const text = await res.text();
  if ((res.status === 429 || res.status >= 500) && attempt < 5) {
    await new Promise(r => setTimeout(r, 2000 * attempt));
    return post(url, body, attempt + 1);
  }
  throw new Error(`${res.status} ${text.slice(0, 200)}`);
}

const jobs = [];
const manifest = {};
for (const [key, prompt, seconds, vol] of SFX) {
  manifest[key] = { file: `${key}.mp3`, kind: 'sfx', vol };
  jobs.push({ key, run: () => post('https://api.elevenlabs.io/v1/sound-generation', { text: prompt, duration_seconds: seconds, prompt_influence: 0.6 }) });
}
for (const [key, prompt, seconds, vol] of MUSIC) {
  manifest[key] = { file: `${key}.mp3`, kind: 'music', vol, loop: true };
  jobs.push({ key, run: () => post('https://api.elevenlabs.io/v1/sound-generation', { text: prompt, duration_seconds: seconds, prompt_influence: 0.4, loop: true })
    .catch(() => post('https://api.elevenlabs.io/v1/sound-generation', { text: prompt, duration_seconds: seconds, prompt_influence: 0.4 })) });
}
const announce = text => () => post(`https://api.elevenlabs.io/v1/text-to-speech/${ANNOUNCER_VOICE}?output_format=mp3_44100_128`, {
  text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.55, use_speaker_boost: true },
});
for (const [key, text] of VOICE) {
  manifest[key] = { file: `${key}.mp3`, kind: 'voice', vol: 0.9, text };
  jobs.push({ key, run: announce(text) });
  for (const [lang, lines] of Object.entries(VOICE_I18N)) {
    if (!lines[key]) continue;
    (manifest[key].i18n ||= {})[lang] = `${lang}/${key}.mp3`;
    jobs.push({ key: `${lang}/${key}`, run: announce(lines[key]) });
  }
}
for (const [champ, voice, ...lines] of CHAMP_VOICES) {
  ['pick', 'ult', 'kill', 'death'].forEach((kind, i) => {
    const key = `cv_${champ}_${kind}`, text = lines[i];
    manifest[key] = { file: `${key}.mp3`, kind: 'voice', vol: 0.85, text };
    jobs.push({ key, run: () => post(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
      text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.35, similarity_boost: 0.8, style: 0.7, use_speaker_boost: true },
    }) });
  });
}

let done = 0, made = 0, failed = 0;
async function worker() {
  while (jobs.length) {
    const job = jobs.shift();
    const file = path.join(OUT, `${job.key}.mp3`);
    if ((only.length && !only.includes(job.key)) || (!force && fs.existsSync(file))) { done++; continue; }
    try {
      const buf = await job.run();
      fs.writeFileSync(file, buf);
      made++;
      console.log(`✓ ${job.key} (${(buf.length / 1024).toFixed(0)} KB)`);
    } catch (err) {
      failed++;
      console.error(`✗ ${job.key}: ${err.message}`);
    }
    done++;
  }
}
await Promise.all([worker(), worker(), worker()]);
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`\nGenerated ${made}, failed ${failed}, total entries ${Object.keys(manifest).length}`);
if (failed) process.exit(1);
