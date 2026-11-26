import { describe, expect, it } from 'vitest';
import { buildContent, parseCardFile } from './build';
import { buyCard } from '../game/economy';
import { poolFor, pullCard } from '../game/packs';
import { freshSave } from '../game/save';

const seeded = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

describe('parseCardFile', () => {
  it('reads fields, tags, price, exclusive and the story', () => {
    const { card, problems } = parseCardFile('/content/cards/x.md',
      '# a comment\ntext: 画蛇添足\npinyin: huà shé tiān zú\nrarity: Uncommon\nmonster: 🐍\ntags: Serpent, 动物\nprice: 120\nexclusive: yes\n\nLine one\nLine two\n', {});
    expect(problems).toEqual([]);
    expect(card).toMatchObject({ id: 'x', text: '画蛇添足', rarity: 'uncommon', tags: ['serpent', '动物'], price: 120, exclusive: true, story: 'Line one\nLine two' });
  });

  it('accepts Chinese rarity names, full-width colons, Windows line endings and a BOM', () => {
    const { card, problems } = parseCardFile('/content/cards/y.md', '﻿text：一心一意\r\nrarity：传说\r\n', {});
    expect(problems).toEqual([]);
    expect(card?.rarity).toBe('legendary');
    expect(card?.name).toBe('一心一意');           // defaults fill the gaps
    expect(card?.monster).toBe('👾');
  });

  it('finds art by explicit name or by card id (case-insensitive)', () => {
    const art = { '/content/art/Dragon.PNG': '/a/dragon.png', '/content/art/other.webp': '/a/other.webp' };
    expect(parseCardFile('/content/cards/dragon.md', 'text: 龙\nrarity: epic', art).card?.art).toBe('/a/dragon.png');
    expect(parseCardFile('/content/cards/z.md', 'text: 龙\nrarity: epic\nart: OTHER.webp', art).card?.art).toBe('/a/other.webp');
  });

  it('reports mistakes in plain language instead of throwing', () => {
    const missingText = parseCardFile('/content/cards/a.md', 'rarity: rare', {});
    expect(missingText.card).toBeUndefined();
    expect(missingText.problems[0]).toMatch(/a\.md: missing "text:"/);

    const badRarity = parseCardFile('/content/cards/b.md', 'text: 龙\nrarity: super', {});
    expect(badRarity.card).toBeUndefined();
    expect(badRarity.problems[0]).toMatch(/rarity "super" isn't valid/);

    const noArt = parseCardFile('/content/cards/c.md', 'text: 龙\nrarity: rare\nart: nope.png\nprice: abc\ncolour: red', {});
    expect(noArt.card).toBeDefined();
    expect(noArt.problems.join('\n')).toMatch(/nope\.png.*not found/);
    expect(noArt.problems.join('\n')).toMatch(/price "abc"/);
    expect(noArt.problems.join('\n')).toMatch(/unknown field "colour"/);
  });
});

describe('buildContent', () => {
  const card = (t: string, extra = '') => `text: ${t}\nrarity: common\n${extra}`;

  it('skips templates, flags duplicate ids, and falls back to safe defaults on a broken game.json', () => {
    const c = buildContent({ '/content/cards/_template.md': 'junk', '/content/cards/a.md': card('一'), '/content/cards/b.md': card('二', 'id: a') }, {},
      { pityLimit: 'lots', packs: [{ id: 'x', weights: {} }], dailyPack: 'nope' });
    expect(c.cards.map(x => x.id)).toEqual(['a']);
    const p = c.problems.join('\n');
    expect(p).toMatch(/already uses the id "a"/);
    expect(p).toMatch(/pityLimit/);
    expect(p).toMatch(/pack "x" has no drop weights/);
    expect(c.config.packs.length).toBeGreaterThan(0);            // built-in pack used
    expect(c.config.packs.some(pk => pk.id === c.config.dailyPack)).toBe(true);
  });

  it('warns when exclusive cards have no price, and when there are no cards at all', () => {
    expect(buildContent({ '/content/cards/a.md': card('一', 'exclusive: yes') }, {}, {}).problems.join('\n')).toMatch(/no "price:"/);
    expect(buildContent({}, {}, {}).problems.join('\n')).toMatch(/No cards were found/);
  });
});

describe('game rules use the content', () => {
  const content = buildContent({
    '/content/cards/a.md': 'text: 甲\nrarity: common\ntags: fire',
    '/content/cards/b.md': 'text: 乙\nrarity: common\ntags: water',
    '/content/cards/c.md': 'text: 丙\nrarity: epic\ntags: fire',
    '/content/cards/d.md': 'text: 丁\nrarity: legendary\ntags: fire\nprice: 50\nexclusive: yes',
  }, {}, { packs: [{ id: 'fire', cost: 1, weights: { common: 1, epic: 1 }, tags: ['Fire'] }], dailyPack: 'fire' });

  it('themed packs only draw matching tags and never draw shop-exclusive cards', () => {
    const pack = content.config.packs[0], pool = poolFor(pack, content.cards);
    expect(pool.map(c => c.id).sort()).toEqual(['a', 'c']);
    const rng = seeded(7);
    for (let i = 0; i < 500; i++) expect(['a', 'c']).toContain(pullCard(pack, 0, rng, pool, 30).card.id);
  });

  it('shop cards can be bought once with enough ink (real content)', () => {
    const s = freshSave();
    expect(buyCard(s, 'lthy')).toBeNull();                         // too poor
    s.ink = 1000;
    const res = buyCard(s, 'lthy');
    expect(res?.isNew).toBe(true);
    expect(s.ink).toBe(400);
    expect(buyCard(s, 'lthy')).toBeNull();                         // already owned
    expect(buyCard(s, 'yxyy')).toBeNull();                         // has no price
  });
});
