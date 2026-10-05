/* Recommended build: the next item to buy for a champion's build order. */
import { ITEMS, priceFor } from '../../shared/moba/items.js';
import { CHAMPIONS } from '../../shared/moba/champions.js';

export const buildFor = champId => CHAMPIONS[champId]?.bot.build || [];

/** Returns { id, price, target } for the next purchase, or null when the build is complete.
    When the next build item is too expensive, suggests its priciest affordable missing component. */
export function nextBuy(champId, inventory, gold) {
  const owned = id => inventory.some(it => it && it.id === id);
  const target = buildFor(champId).find(id => !owned(id));
  if (!target) return null;
  const full = priceFor(target, inventory);
  if (full && full.price <= gold) return { id: target, price: full.price, target };
  const parts = [];
  const walk = id => { for (const c of ITEMS[id].from || []) { if (!owned(c)) { parts.push(c); walk(c); } } };
  walk(target);
  const affordable = parts.map(id => ({ id, price: priceFor(id, inventory).price })).filter(p => p.price <= gold).sort((a, b) => b.price - a.price)[0];
  return affordable ? { ...affordable, target } : { id: target, price: full ? full.price : ITEMS[target].cost, target };
}
