import { CONTENT } from '../content';
import { CARDS, INK_VALUE, PACKS, pullCard } from './packs';
import { PackDef, PullResult, SaveData } from './types';

export const IDLE_CAP_MS = CONTENT.config.idleCapHours * 3600_000;
const IDLE_PER_HOUR = CONTENT.config.idleInkPerHour;

function award(s: SaveData, cardId: string): PullResult {
  const card = CARDS.find(c => c.id === cardId)!;
  const isNew = !s.owned[card.id];
  s.owned[card.id] = (s.owned[card.id] ?? 0) + 1;
  const inkGained = isNew ? 0 : INK_VALUE[card.rarity];   // duplicates auto-recycle into ink
  s.ink += inkGained;
  return { card, isNew, inkGained };
}

export function openPack(s: SaveData, pack: PackDef, rng: () => number = Math.random): PullResult {
  const { card, pity } = pullCard(pack, s.pity, rng);
  s.pity = pity;
  return award(s, card.id);
}

export function buyPack(s: SaveData, packId: string, rng?: () => number): PullResult | null {
  const pack = PACKS.find(p => p.id === packId);
  if (!pack || s.ink < pack.cost) return null;
  s.ink -= pack.cost;
  return openPack(s, pack, rng);
}

/** Shop-listed cards ("price:" in the card file) are bought directly, once. */
export function buyCard(s: SaveData, cardId: string): PullResult | null {
  const card = CARDS.find(c => c.id === cardId);
  if (!card?.price || s.owned[card.id] || s.ink < card.price) return null;
  s.ink -= card.price;
  return award(s, card.id);
}

export function idleRate(s: SaveData): number {
  return CARDS.filter(c => s.owned[c.id]).reduce((t, c) => t + IDLE_PER_HOUR[c.rarity], 0);
}

export function collectIdle(s: SaveData, now = Date.now()): number {
  const ms = Math.min(Math.max(now - s.lastIdle, 0), IDLE_CAP_MS);
  const gain = Math.floor(idleRate(s) * ms / 3600_000);
  s.lastIdle = now;
  s.ink += gain;
  return gain;
}
