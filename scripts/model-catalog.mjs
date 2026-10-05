/* Every 3D asset generated with Tripo3D (scripts/generate-models.mjs) and
   packed by scripts/build-models.mjs.
   kind:  biped     → rig v1.0, full preset library (clips: name → preset)
          quadruped → rig v2.5, Tripo only offers a walk cycle
          static    → no rig (structures, props, flying/hopping creatures)
   face:  triangle budget; low: Tripo smart low-poly topology (props)
   tex:   texture size after packing; tris: simplify to this many triangles
   yaw:   turns the model to face +Z (the game's forward), measured from gallery
          renders since Tripo's orientation varies (rigged bipeds default to -90°)
   pose:  'bind' drops the rig and keeps the bind pose as a static model, for
          rigs whose Tripo walk cycle came out broken (wolf, wyrm) */

const HERO = 'stylized fantasy MOBA game character, full body, standing in a T-pose, arms out, clean hand-painted textures, single character, no base, no weapon on the ground';
const UNIT = 'stylized fantasy MOBA minion, chunky cute proportions, full body, standing in a T-pose, arms out, hand-painted textures, single character, no base';
const BEAST = 'stylized fantasy MOBA jungle monster, full body, standing in a neutral pose, hand-painted textures, single creature, no base';
const PROP = 'stylized fantasy MOBA game environment asset, hand-painted textures, single isolated object, no ground plane, no background';

const ATTACK = { punch: 'preset:biped:box_01', slash: 'preset:biped:slash', shoot: 'preset:biped:fire', cast: 'preset:biped:cast_a_spell', chop: 'preset:biped:chop' };
const heroClips = style => ({ idle: 'preset:biped:idle', run: 'preset:biped:run', attack: ATTACK[style], cast: 'preset:biped:cast_a_spell', death: 'preset:biped:fall', stun: 'preset:biped:hurt', dance: 'preset:biped:dance_01', cheer: 'preset:biped:cheer', laugh: 'preset:biped:laugh_01' });
const minionClips = style => ({ run: 'preset:biped:walk', attack: ATTACK[style], death: 'preset:biped:fall' });
const beastClips = style => ({ idle: 'preset:biped:idle', run: 'preset:biped:walk', attack: ATTACK[style], death: 'preset:biped:fall' });
const WALK = { run: 'preset:quadruped:walk' };

const hero = (id, desc, style) => ({ id, group: 'champion', kind: 'biped', prompt: `${desc}, ${HERO}`, clips: heroClips(style), face: 30000, tex: 1024, tris: 15000 });

export const CATALOG = [
  hero('garrok', 'massive stone-skinned golem warrior with glowing amber cracks, rocky shoulders and huge stone fists', 'punch'),
  hero('lyra', 'radiant light mage woman in flowing white and gold robes holding a glowing sun staff', 'cast'),
  hero('kaelen', 'hooded shadow assassin in dark purple leather armor holding twin curved daggers', 'slash'),
  hero('hale', 'frost huntress archer woman in blue fur-lined leather armor holding an ice longbow', 'shoot'),
  hero('thorne', 'armored iron warlord in dark red plate armor holding a huge two-handed battle axe', 'chop'),
  hero('mira', 'moon priestess in pale blue and silver robes with a crescent halo holding a moon staff', 'cast'),
  hero('zarak', 'young fire mage boy in red and orange robes with small flames in his hands', 'cast'),
  hero('nyra', 'desert marshal gunslinger woman in a long brown coat and wide-brimmed hat holding a long rifle', 'shoot'),
  hero('brakka', 'armored minotaur bull warrior with big horns, steel shoulder pads and huge fists', 'punch'),
  hero('rook', 'green-armored storm warrior holding a large axe, with lightning accents on the armor', 'slash'),
];

// Lane minions, one model per team so allegiance reads at a glance.
for (const [team, color] of [['blue', 'blue'], ['red', 'crimson red']]) {
  CATALOG.push(
    { id: `minion_melee_${team}`, group: 'minion', kind: 'biped', prompt: `small armored footsoldier with a ${color} tabard and ${color}-plumed helmet, short sword and round ${color} shield, ${UNIT}`, clips: minionClips('slash'), face: 6000, tex: 512 },
    { id: `minion_caster_${team}`, group: 'minion', kind: 'biped', prompt: `small hooded apprentice mage in ${color} robes holding a short wand with a glowing ${color} gem, ${UNIT}`, clips: minionClips('cast'), face: 6000, tex: 512 },
    { id: `minion_super_${team}`, group: 'minion', kind: 'biped', prompt: `hulking armored juggernaut with heavy steel plate armor trimmed in ${color}, glowing ${color} visor and a huge warhammer, ${UNIT}`, clips: minionClips('slash'), face: 8000, tex: 512 },
    { id: `minion_siege_${team}`, group: 'minion', kind: 'static', prompt: `small wooden siege cannon cart on four wheels with a bronze cannon and a ${color} banner, ${PROP}`, face: 6000, tex: 512 },
  );
}

CATALOG.push(
  // Jungle monsters
  { id: 'mob_mossback', group: 'monster', kind: 'biped', prompt: `ancient moss-covered stone golem with glowing blue runes, vines and small plants growing on its shoulders, ${BEAST}, arms out`, clips: beastClips('punch'), face: 10000, tex: 512 },
  { id: 'mob_brute', group: 'monster', kind: 'biped', prompt: `hulking red-skinned ogre brute with iron armor plates, spiked bracers and glowing red brand marks, ${BEAST}, arms out`, clips: beastClips('punch'), face: 10000, tex: 512 },
  { id: 'mob_stonehulk', group: 'monster', kind: 'biped', prompt: `craggy grey boulder golem with small glowing crystals on its back, ${BEAST}, arms out`, clips: beastClips('punch'), face: 8000, tex: 512 },
  { id: 'mob_titan', group: 'monster', kind: 'biped', prompt: `colossal abyss titan with dark purple armored body, glowing violet cracks, curved horns and massive clawed arms, ${BEAST}, arms out`, clips: beastClips('slash'), face: 20000, tex: 1024, tris: 12000 },
  { id: 'mob_wolf', group: 'monster', kind: 'quadruped', prompt: `large shaggy grey dire wolf with glowing yellow eyes, standing on four legs, side view, ${BEAST}`, clips: WALK, face: 8000, tex: 512 },
  { id: 'mob_wyrm', group: 'monster', kind: 'quadruped', tris: 12000, prompt: `fierce orange-red fire dragon with folded wings, ember-glowing scales and a long tail, standing on four legs, ${BEAST}`, clips: WALK, face: 20000, tex: 1024 },
  { id: 'mob_bat', group: 'monster', kind: 'static', prompt: `giant purple bat creature with leathery wings spread wide, glowing red eyes, flying, ${BEAST}`, face: 6000, tex: 512 },
  { id: 'mob_toad', group: 'monster', kind: 'static', prompt: `huge swamp toad with warty mossy green-brown skin and a glowing yellow belly, sitting, ${BEAST}`, face: 6000, tex: 512 },
);

// Structures, per team
for (const [team, color] of [['blue', 'blue'], ['red', 'crimson red']]) {
  CATALOG.push(
    { id: `tower_${team}`, group: 'structure', kind: 'static', tris: 5000, prompt: `defensive stone guard tower turret, a tall round carved stone pillar with a glowing ${color} crystal floating on top and ${color} banners, ${PROP}`, face: 12000, tex: 1024 },
    { id: `spire_${team}`, group: 'structure', kind: 'static', tris: 5000, prompt: `crystal shrine, a large floating glowing ${color} crystal above a carved round stone pedestal with runes, ${PROP}`, face: 10000, tex: 1024 },
    { id: `core_${team}`, group: 'structure', kind: 'static', tris: 5000, prompt: `nexus monument, a huge glowing ${color} crystal on a tiered round stone base with four stone arches around it, ${PROP}`, face: 16000, tex: 1024 },
    { id: `fountain_${team}`, group: 'structure', kind: 'static', tris: 5000, prompt: `circular healing fountain platform with a glowing ${color} pool and a carved stone obelisk in the middle, ${PROP}`, face: 12000, tex: 1024 },
  );
}

// Environment props, instanced across the map
CATALOG.push(
  { id: 'tree_pine', group: 'prop', kind: 'static', prompt: `stylized low poly pine tree with a short brown trunk, ${PROP}`, face: 500, low: true, tex: 256, tris: 600 },
  { id: 'tree_oak', group: 'prop', kind: 'static', prompt: `stylized low poly round leafy oak tree with a thick trunk, ${PROP}`, face: 500, low: true, tex: 256, tris: 600 },
  { id: 'tree_fir', group: 'prop', kind: 'static', prompt: `stylized low poly tall dark green fir tree, ${PROP}`, face: 500, low: true, tex: 256, tris: 600 },
  { id: 'bush', group: 'prop', kind: 'static', prompt: `dense round clump of tall wild grass and leafy shrub, ${PROP}`, face: 1500, low: true, tex: 256, tris: 900 },
);

// Static models whose generated orientation isn't facing +Z.
const YAW = { minion_siege_blue: Math.PI / 2, mob_toad: -Math.PI / 2, mob_bat: -Math.PI / 2, mob_wolf: Math.PI, mob_wyrm: 0 };
const BIND_POSE = ['mob_wolf', 'mob_wyrm'];
for (const a of CATALOG) {
  if (YAW[a.id] !== undefined) a.yaw = YAW[a.id];
  if (BIND_POSE.includes(a.id)) a.pose = 'bind';
}

export const byId = Object.fromEntries(CATALOG.map(a => [a.id, a]));
