import { describe, expect, it } from 'vitest';
import { buildContent } from './build';
import { poolFor, pullCard } from '../game/packs';

const seeded = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const files = {
  '/content/cards/a.md': 'text: 甲\nrarity: common\ntags: fire',
  '/content/cards/b.md': 'text: 乙\nrarity: common\ntags: water',
  '/content/cards/c.md': 'text: 丙\nrarity: epic\ntags: fire',
  '/content/cards/d.md': 'text: 丁\nrarity: legendary\ntags: fire\nprice: 50\nexclusive: yes',
};
const pack = (extra: object) => ({ id: 'p', name: 'P', cost: 10, weights: { common: 1, epic: 1 }, ...extra });
const build = (p: object, others: object[] = []) => buildContent(files, {}, { dailyPack: 'p', packs: [pack(p), ...others] });

describe('custom packs (game.json)', () => {
  it('reads name, icon, colour, description, tags and hand-picked cards', () => {
    const c = build({ name: ' Fire Pack ', icon: '🔥', color: '#C0561A', description: 'Only fiery monsters', tags: ['Fire'], cards: ['a', 'c'] });
    expect(c.problems).toEqual([]);
    expect(c.config.packs[0]).toMatchObject({ id: 'p', name: 'Fire Pack', icon: '🔥', color: '#C0561A', description: 'Only fiery monsters', tags: ['fire'], cards: ['a', 'c'] });
  });

  it('keeps plain packs plain: no look fields appear', () => {
    const p = build({}).config.packs[0];
    for (const k of ['icon', 'color', 'description', 'cards', 'tags']) expect(p).not.toHaveProperty(k);
  });

  it('says what is wrong with a bad colour or a card that does not exist, and keeps going', () => {
    const c = build({ color: 'red', cards: ['a', 'nope'] });
    const text = c.problems.join('\n');
    expect(text).toMatch(/pack "p" has a colour that isn't like "#a3261e"/);
    expect(text).toMatch(/pack "p" lists the card "nope" which doesn't exist/);
    expect(c.config.packs[0].cards).toEqual(['a']);
    expect(c.config.packs[0]).not.toHaveProperty('color');
  });

  it('drops a hand-picked list that has no valid cards left', () => {
    expect(build({ cards: ['nope'] }).config.packs[0]).not.toHaveProperty('cards');
  });

  it('a hand-picked pack draws only its cards, even shop-only ones; tags and defaults still work', () => {
    const c = build({ cards: ['d', 'b'] }), pk = c.config.packs[0];
    expect(poolFor(pk, c.cards).map(x => x.id).sort()).toEqual(['b', 'd']);
    const rng = seeded(11);
    for (let i = 0; i < 300; i++) expect(['b', 'd']).toContain(pullCard(pk, 0, rng, poolFor(pk, c.cards), 30).card.id);
    expect(poolFor(build({ tags: ['fire'] }).config.packs[0], c.cards).map(x => x.id).sort()).toEqual(['a', 'c']);   // d is shop-only
    expect(poolFor(build({}).config.packs[0], c.cards).map(x => x.id).sort()).toEqual(['a', 'b', 'c']);
  });
});
