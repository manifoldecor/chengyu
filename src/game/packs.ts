import { CONTENT } from '../content';
import { Card, PackDef, Rarity, RARITIES } from './types';

// All of this comes from /content (cards/*.md, game.json) - see content/README.md.
export const CARDS: Card[] = CONTENT.cards;
export const PACKS: PackDef[] = CONTENT.config.packs;
export const DAILY_PACK: PackDef = PACKS.find(p => p.id === CONTENT.config.dailyPack) ?? PACKS[0];
export const PITY_LIMIT = CONTENT.config.pityLimit;
export const INK_VALUE: Record<Rarity, number> = CONTENT.config.inkValue;
export const isEpicPlus = (r: Rarity) => r === 'epic' || r === 'legendary';

export function rollRarity(weights: Record<Rarity, number>, rng: () => number): Rarity {
  const total = RARITIES.reduce((s, r) => s + weights[r], 0);
  let x = rng() * total;
  for (const r of RARITIES) {
    if (weights[r] <= 0) continue;
    x -= weights[r];
    if (x < 0) return r;
  }
  return RARITIES.find(r => weights[r] > 0) ?? 'common';
}

/** The cards a pack can give: no shop-exclusive cards, and only matching tags when the pack is themed. */
export function poolFor(pack: PackDef, cards: Card[] = CARDS): Card[] {
  const normal = cards.filter(c => !c.exclusive);
  const themed = pack.tags?.length ? normal.filter(c => c.tags.some(t => pack.tags!.includes(t))) : normal;
  return themed.length ? themed : normal.length ? normal : cards;
}

/** Pulls one card. pity = packs since last epic+; the PITY_LIMIT-th pack is forced epic+. */
export function pullCard(pack: PackDef, pity: number, rng: () => number = Math.random, pool: Card[] = poolFor(pack), pityLimit = PITY_LIMIT) {
  const forced = pity + 1 >= pityLimit && pool.some(c => isEpicPlus(c.rarity));
  const weights: Record<Rarity, number> = forced
    ? { common: 0, uncommon: 0, rare: 0, epic: pack.weights.epic || 1, legendary: pack.weights.legendary }
    : pack.weights;
  let rarity = rollRarity(weights, rng);
  let candidates = pool.filter(c => c.rarity === rarity);
  if (!candidates.length) {                      // no card of that rarity in this pool: fall back to the nearest one that exists
    const order = [...RARITIES].sort((a, b) => Math.abs(RARITIES.indexOf(a) - RARITIES.indexOf(rarity)) - Math.abs(RARITIES.indexOf(b) - RARITIES.indexOf(rarity)));
    rarity = order.find(r => pool.some(c => c.rarity === r)) ?? rarity;
    candidates = pool.filter(c => c.rarity === rarity);
  }
  const card = candidates[Math.floor(rng() * candidates.length)];
  return { card, pity: isEpicPlus(card.rarity) ? 0 : pity + 1 };
}
