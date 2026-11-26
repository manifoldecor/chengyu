import { describe, expect, it } from 'vitest';
import { CONTENT } from '../content';
import { PACKS, PITY_LIMIT, INK_VALUE, pullCard } from './packs';
import { buyPack, collectIdle, IDLE_CAP_MS, openPack } from './economy';
import { claimDaily, dateKey } from './daily';
import { freshSave } from './save';
import { RARITIES } from './types';

// deterministic PRNG
const seeded = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

describe('content/', () => {
  it('loads valid, unique cards with no problems', () => {
    expect(CONTENT.problems).toEqual([]);
    const ids = new Set<string>();
    for (const c of CONTENT.cards) {
      expect(ids.has(c.id)).toBe(false); ids.add(c.id);
      expect(RARITIES).toContain(c.rarity);
      for (const f of ['text', 'pinyin', 'meaning', 'monster', 'name'] as const) expect(c[f]).toBeTruthy();
    }
    for (const r of RARITIES) expect(CONTENT.cards.some(c => c.rarity === r)).toBe(true);
  });
});

describe('pack odds', () => {
  it('basic pack rates match weights over 100k pulls', () => {
    const rng = seeded(42), counts: Record<string, number> = {};
    for (let i = 0; i < 100_000; i++) {
      const { card } = pullCard(PACKS[0], 0, rng);
      counts[card.rarity] = (counts[card.rarity] ?? 0) + 1;
    }
    for (const r of RARITIES) expect(Math.abs(counts[r] / 1000 - PACKS[0].weights[r])).toBeLessThan(1);
  });
  it('pity forces epic+ at the limit', () => {
    const { card, pity } = pullCard(PACKS[0], PITY_LIMIT - 1, seeded(1));
    expect(['epic', 'legendary']).toContain(card.rarity);
    expect(pity).toBe(0);
  });
});

describe('economy', () => {
  it('first copy is new, duplicate becomes ink', () => {
    const s = freshSave(), rng = () => 0; // always first common
    const a = openPack(s, PACKS[0], rng), b = openPack(s, PACKS[0], rng);
    expect(a.isNew).toBe(true); expect(a.inkGained).toBe(0);
    expect(b.isNew).toBe(false); expect(b.inkGained).toBe(INK_VALUE.common);
    expect(s.ink).toBe(INK_VALUE.common);
  });
  it('buyPack needs enough ink', () => {
    const s = freshSave();
    expect(buyPack(s, 'silver')).toBeNull();
    s.ink = 100;
    expect(buyPack(s, 'silver')).not.toBeNull();
    expect(s.ink).toBeLessThanOrEqual(20 + INK_VALUE.legendary);
  });
  it('idle income is capped at 8h', () => {
    const s = freshSave(); s.owned = { yxyy: 1 }; s.lastIdle = 0;
    expect(collectIdle(s, IDLE_CAP_MS * 10)).toBe(8);
  });
});

describe('daily streak', () => {
  it('increments on consecutive days, resets after a gap, milestone bonus on day 7', () => {
    const s = freshSave();
    for (let d = 1; d <= 7; d++) {
      const bonus = claimDaily(s, new Date(2026, 0, d));
      expect(bonus).toBe(d === 7 ? 50 : 0);
    }
    expect(s.streak).toBe(7);
    claimDaily(s, new Date(2026, 0, 10));
    expect(s.streak).toBe(1);
    expect(s.lastDaily).toBe(dateKey(new Date(2026, 0, 10)));
  });
  it('streak survives month boundaries', () => {
    const s = freshSave();
    claimDaily(s, new Date(2026, 0, 31)); claimDaily(s, new Date(2026, 1, 1));
    expect(s.streak).toBe(2);
  });
});
