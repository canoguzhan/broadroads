/* Generates every sound effect, music loop and announcer line with the
   ElevenLabs API and writes them to public/sfx/.
   Usage: ELEVENLABS_API_KEY=... node scripts/generate-audio.mjs [--force] [key ...]
   Existing files are skipped unless --force is given. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

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
  ['ui_click', "a single crisp satisfying click of a polished wooden game menu button with a tiny metallic tick, very short and dry, no reverb", 0.5, 0.5],
  ['ui_hover', "an extremely soft short paper tick, barely audible, dry and close", 0.5, 0.22],
  ['ui_open', "a leather-bound book cover opening with a soft paper flutter, short and warm", 0.6, 0.5],
  ['ui_close', "a leather-bound book closing with a soft muffled thump, short", 0.5, 0.45],
  ['ui_error', "a short low muted wooden double knock, dry, gentle", 0.5, 0.5],
  ['ui_notify', "two clear warm bell chimes, gentle and soft, short fantasy game notification", 0.8, 0.6],
  ['ui_buy', "a handful of gold coins clinking into a leather purse, bright and short", 0.7, 0.6],
  ['ui_sell', "a few gold coins sliding across a wooden counter and dropping into a drawer", 0.7, 0.6],
  ['ui_skill', "a short bright rising harp glissando with a soft sparkle, ability upgraded", 0.7, 0.55],
  ['queue_found', "epic match found stinger, one deep war drum hit and a short heroic brass fanfare with a cymbal swell, no vocals", 2.2, 0.8],
  ['lock_in', "a sword slammed into a stone pedestal with a deep metallic clang and a short hall echo", 1.0, 0.7],
  ['select_tick', "a single soft mechanical pocket watch tick, dry and close", 0.5, 0.35],
  ['chat_msg', "a soft short wooden pop like a cork, quiet and round", 0.5, 0.35],
  ['match_start', "a huge war horn blowing across a mountain valley with distant war drums, echoing", 3.0, 0.75],
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
  ['atk_sword', "a short sword striking a wooden shield, crisp thwack, no whoosh", 0.5, 0.4],
  ['atk_axe', 'heavy battle axe swing whoosh', 0.5, 0.45],
  ['atk_fist', 'heavy stone fist punch with a dull impact', 0.5, 0.45],
  ['atk_bow', 'bowstring release and arrow whizzing away', 0.6, 0.45],
  ['atk_gun', 'old flintlock musket shot, short and punchy', 0.6, 0.45],
  ['atk_magic', 'small magic missile cast, sparkly zap', 0.6, 0.45],
  ['hit_physical', "a solid weapon impact on armor, punchy thud with a light metal clank, very short", 0.5, 0.45],
  ['hit_magic', "a short soft magical impact thump with a warm crackle, very short, no buzzing, no hiss", 0.5, 0.45],
  ['hit_crit', "a powerful critical hit, heavy blade impact with a sharp metallic ring and a deep bass punch", 0.7, 0.6],
  ['hurt', "a muffled body blow thud with a short grunt-less impact, close", 0.5, 0.5],
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
  ['tower_shot', "a crystal turret firing, a deep resonant crystal thump with a short sizzle tail", 0.8, 0.55],
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
  ['garrok_q', "a huge boulder ripped from the ground, grinding rock and a heavy throw grunt-less heave", 1.0, 0.6],
  ['garrok_w', "crackling thunder charging into stone fists, sharp electric crackle with a low rumble", 1.0, 0.55],
  ['garrok_e', "a giant stone foot stomping the ground, deep earthquake boom with rocks cracking and dust", 1.2, 0.7],
  ['garrok_r', "a stone giant charging, thundering heavy footsteps and an avalanche of rocks rumbling", 1.2, 0.7],
  ['lyra_q', "bright golden chains of light whipping out and snapping tight with a metallic shimmer", 1.0, 0.55],
  ['lyra_w', "a warm protective dome of holy light forming, soft choir swell and glassy shimmer", 1.2, 0.5],
  ['lyra_e', "a glowing sun orb gathering energy, warm rising hum with sparkles", 1.4, 0.55],
  ['lyra_r', "a massive beam of holy light charging up, rising choir and building energy hum", 1.2, 0.7],
  ['kaelen_q', "a steel shuriken thrown, fast metallic spinning whirr cutting the air", 0.8, 0.55],
  ['kaelen_w', "a shadowy step, soft dark cloth swish and a muffled puff of smoke", 0.7, 0.55],
  ['kaelen_e', "two rapid dagger slashes in a circle, crisp steel cuts", 0.7, 0.6],
  ['kaelen_r', "an assassin vanishing and reappearing, dark whoosh then a chilling deep resonant boom", 1.3, 0.7],
  ['hale_q', "frost gathering on a bowstring, icy crackle and creaking string drawn tight", 0.9, 0.5],
  ['hale_w', "a volley of five arrows released at once, layered bow twangs and arrows whistling", 1.0, 0.6],
  ['hale_e', "a quick light glide over snow, soft crunch and swish", 0.6, 0.5],
  ['hale_r', "a giant spear of ice hurled, heavy throw with freezing crackle and wind howl", 1.3, 0.7],
  ['thorne_q', "a huge battle axe swung in a full circle, heavy iron sweep with chain rattle", 1.0, 0.6],
  ['thorne_w', "an axe edge being drawn and gleaming, quick metallic scrape and ring", 0.8, 0.55],
  ['thorne_e', "a heavy iron chain hook thrown, rattling chain links whipping out", 1.0, 0.6],
  ['thorne_r', "a warrior leaping into the air with a heavy executioner axe, armor clank and rising whoosh", 1.0, 0.65],
  ['mira_q', "a falling star whistling down from the sky, high crystalline whistle descending", 1.0, 0.55],
  ['mira_w', "a gentle moonlight blessing, soft harp notes and a calm shimmering chime", 1.0, 0.5],
  ['mira_e', "an eclipse zone forming, deep muted hum and a sudden silence like air being sucked away", 1.4, 0.55],
  ['mira_r', "a lunar hymn, ethereal wordless choir and harp swelling, healing and calm", 2.0, 0.65],
  ['zarak_q', "a fireball conjured and hurled, roaring flame burst with crackling embers", 0.9, 0.55],
  ['zarak_w', "a cone of fire blasted forward, roaring flamethrower burst and crackle", 1.0, 0.6],
  ['zarak_e', "a ring of fire igniting around a mage, whoosh of flames and crackling", 1.0, 0.55],
  ['zarak_r', "a meteor summoned, deep rumbling roar of fire growing louder from the sky", 1.2, 0.7],
  ['nyra_q', "a long rifle firing a charged shot, loud sharp crack with a ringing echo", 1.0, 0.65],
  ['nyra_w', "a steel bear trap being set on the ground, springs creak and a metal click", 0.7, 0.5],
  ['nyra_e', "a weighted bola thrown, rope whirling with a rhythmic whoop whoop", 0.8, 0.55],
  ['nyra_r', "a sniper aiming then firing, a long tense breath then one massive deep rifle boom", 1.6, 0.75],
  ['brakka_q', "giant hooves smashing the ground, heavy quake boom and rocks flying", 1.1, 0.7],
  ['brakka_w', "a bull warrior charging and ramming, galloping hooves then a heavy armored impact", 1.0, 0.65],
  ['brakka_e', "a mighty bull war bellow, deep animal roar with a battle horn feel", 1.3, 0.6],
  ['brakka_r', "armor hardening into iron, deep resonant metal clang and a rising metallic hum", 1.2, 0.6],
  ['rook_q', "a warrior spinning with a blade in a cyclone, rhythmic whirling steel and gusting wind", 1.5, 0.55],
  ['rook_w', "a hand axe thrown spinning through the air, rhythmic whirr", 0.8, 0.55],
  ['rook_e', "a leap into the sky then a slam with a lightning strike, crackling thunder impact", 1.1, 0.65],
  ['rook_r', "a storm gathering, rolling thunder and howling wind building up", 1.3, 0.7],
  ['thessa_q', "a lance of water shot forward, pressurized water jet rushing and a splash", 0.9, 0.55],
  ['thessa_w', "a whirlpool forming, rushing water swirling and gurgling", 1.2, 0.6],
  ['thessa_e', "a shimmering water bubble forming around someone, soft liquid wobble and a gentle shimmer", 1.0, 0.5],
  ['thessa_r', "a huge ocean wave rising, deep rumbling surge of water building", 1.0, 0.7],
  ['borrin_q', "a thorny vine lashing out, woody whip crack with leaves rustling", 0.8, 0.55],
  ['borrin_w', "tree bark hardening over a body, deep creaking wood and rustling leaves", 1.2, 0.55],
  ['borrin_e', "thorny brambles sprouting from the ground, creaking wood and rustling thorns", 1.3, 0.55],
  ['borrin_r', "roots stirring underground, deep creaking wood and rumbling earth", 1.0, 0.7],
  // Champion basic attacks (one each)
  ['atk_garrok', "a giant stone fist punching, heavy rock-on-armor thud with crumbling pebbles, short, no whoosh", 0.6, 0.45],
  ['atk_lyra', "a quick bright pulse of holy light, a soft crystal chime struck once with a warm shimmer, short", 0.6, 0.45],
  ['atk_kaelen', "a fast dagger slash, sharp steel swipe and a quick cut, short and crisp", 0.6, 0.45],
  ['atk_hale', "a wooden longbow firing, bowstring twang and arrow release, short", 0.6, 0.45],
  ['atk_thorne', "a heavy iron axe chopping into armor, brutal metallic chop, short", 0.6, 0.45],
  ['atk_mira', "a soft moonlight bolt, a short glassy bell-like ping with a gentle airy shimmer", 0.6, 0.45],
  ['atk_zarak', "a small fireball launched, a short flame burst with a crackle", 0.6, 0.45],
  ['atk_nyra', "a single old western revolver shot, punchy with a short tail", 0.6, 0.45],
  ['atk_brakka', "a huge bull warrior shoving with horns and an armored shoulder, heavy leather and metal thud", 0.6, 0.45],
  ['atk_rook', "a steel sword swing that cracks with a small electric snap, slash with a spark, short", 0.6, 0.45],
  ['atk_thessa', "a small water orb thrown, short liquid splash and slosh", 0.6, 0.45],
  ['atk_borrin', "a heavy wooden club strike, thick branch smacking with a woody thud and a leaf rustle", 0.6, 0.45],
  // Ability payoffs that land later than the cast (zone explosions, beams, impacts)
  ['garrok_r_hit', "a stone giant crashing into the ground, enormous rock explosion, debris and a deep boom", 1.6, 0.8],
  ['lyra_e_hit', "a sun orb exploding, bright radiant burst with a warm boom and shimmering tail", 1.2, 0.7],
  ['lyra_r_hit', "a massive beam of holy light firing across the land, searing roar with a choir blast", 1.8, 0.8],
  ['kaelen_r_hit', "a shadow mark detonating, dark implosion followed by a sharp blade slice", 1.0, 0.75],
  ['hale_r_hit', "a giant ice spear shattering on impact, cracking ice explosion and freezing hiss", 1.2, 0.75],
  ['thorne_q_hit', "a giant axe blade cleaving through several armored enemies, brutal heavy chop", 1.0, 0.7],
  ['thorne_r_hit', "an executioner axe slamming down into the ground, huge metal impact and stone cracking", 1.2, 0.8],
  ['mira_q_hit', "a falling star hitting the ground, crystalline impact burst with sparkling chimes", 1.0, 0.65],
  ['zarak_r_hit', "a meteor crashing into the ground, huge fiery explosion with deep rumble and crackling flames", 2.0, 0.85],
  ['rook_r_hit', "a thunderstorm unleashed, several lightning strikes cracking and a booming shockwave", 1.6, 0.8],
  ['thessa_w_hit', "water crashing inward from a whirlpool, heavy splash and slosh", 1.0, 0.65],
  ['thessa_r_hit', "a tsunami wave crashing down, enormous roaring wave and spray", 2.0, 0.85],
  ['borrin_r_hit', "giant roots erupting from the earth, wood cracking and ground bursting open", 1.6, 0.8],
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

// Sound effects are polished after download: leading silence trimmed (so attacks land instantly)
// and loudness evened out. Needs ffmpeg (FFMPEG=/path/to/ffmpeg or on PATH); skipped without it.
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
function polish(file) {
  const tmp = `${file}.tmp.mp3`;
  try {
    execFileSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-i', file, '-af', 'silenceremove=start_periods=1:start_duration=0:start_threshold=-48dB,loudnorm=I=-18:TP=-2:LRA=11', '-ar', '44100', '-c:a', 'libmp3lame', '-q:a', '3', tmp]);
    fs.renameSync(tmp, file);
  } catch (err) { fs.rmSync(tmp, { force: true }); if (!polish.warned) { polish.warned = true; console.warn(`(not polishing: ${err.message.split('\n')[0]})`); } }
}

const jobs = [];
const manifest = {};
for (const [key, prompt, seconds, vol] of SFX) {
  manifest[key] = { file: `${key}.mp3`, kind: 'sfx', vol };
  jobs.push({ key, sfx: true, run: () => post('https://api.elevenlabs.io/v1/sound-generation', { text: prompt, duration_seconds: seconds, prompt_influence: 0.6 }) });
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
      if (job.sfx) polish(file);
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
