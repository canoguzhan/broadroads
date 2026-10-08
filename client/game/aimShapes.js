/* Aim indicator shapes for every ability, read from the shared ability definitions:
   self → ring of the effect radius; direction → a lane of the skillshot width (or a cone);
   point → range ring + impact circle at the cursor; unit-targeted → range ring + target highlight. */
import { CHAMPIONS } from '../../shared/moba/champions.js';

const num = (re, src) => { const m = re.exec(src); return m ? Number(m[1]) : null; };

function shapeOf(a) {
  const src = a.cast.toString();
  const width = num(/width:\s*([\d.]+)/, src);
  const radius = num(/radius:\s*([\d.]+)/, src) ?? num(/enemiesNear\([^,]+,[^,]+,[^,]+,\s*([\d.]+)/, src) ?? num(/alliesNear\([^,]+,[^,]+,[^,]+,\s*([\d.]+)/, src);
  const cone = /e:\s*'cone'/.test(src);
  switch (a.target) {
    case 'self': return { kind: 'self', radius: radius || 0 };
    case 'direction': return cone ? { kind: 'cone', range: a.range || 5 } : { kind: 'line', range: Math.min(a.range || 8, 30), width: width || 1 };
    case 'point': return { kind: 'point', range: a.range || 6, radius: radius || 0.8 }; // no radius: a dash or blink landing spot
    default: return { kind: 'unit', range: a.range || 6 };
  }
}

const cache = {};
export function aimShape(champ, slot) {
  const key = `${champ}_${slot}`;
  if (!(key in cache)) { const a = CHAMPIONS[champ]?.abilities[slot]; cache[key] = a ? shapeOf(a) : null; }
  return cache[key];
}

// Battle spells: Blink and the rest are point / self casts with a short range.
export const SPELL_SHAPE = { blink: { kind: 'point', range: 6, radius: 0.8 }, default: { kind: 'self', radius: 3 } };
