import { describe, expect, it } from 'vitest';
import { buildContent, parseCardFile } from './build';
import { contentFromManifest, isManifest, type Manifest } from './remote';

const sprites = { '/content/sprites/green-dragon.png': '/s/green-dragon.png', '/content/sprites/Red-Fox.png': '/s/red-fox.png' };
const art = { '/content/art/hsty.png': '/a/hsty.png', '/content/art/other.png': '/a/other.png' };

describe('sprites on cards', () => {
  it('a sprite becomes the card picture, shown whole', () => {
    const { card, problems } = parseCardFile('/content/cards/x.md', 'text: 龙\nrarity: epic\nsprite: Green-Dragon', {}, sprites);
    expect(problems).toEqual([]);
    expect(card).toMatchObject({ art: '/s/green-dragon.png', artFit: 'contain', sprite: 'Green-Dragon' });
  });

  it('picture priority: an explicit art file beats a sprite, and a sprite beats a picture named after the card', () => {
    const explicit = parseCardFile('/content/cards/hsty.md', 'text: 蛇\nrarity: rare\nart: other.png\nsprite: red-fox', art, sprites).card!;
    expect(explicit.art).toBe('/a/other.png'); expect(explicit.artFit).toBeUndefined();
    const bySprite = parseCardFile('/content/cards/hsty.md', 'text: 蛇\nrarity: rare\nsprite: red-fox', art, sprites).card!;
    expect(bySprite.art).toBe('/s/red-fox.png'); expect(bySprite.artFit).toBe('contain');
    const byName = parseCardFile('/content/cards/hsty.md', 'text: 蛇\nrarity: rare', art, sprites).card!;
    expect(byName.art).toBe('/a/hsty.png'); expect(byName.artFit).toBeUndefined();
  });

  it('a sprite that does not exist is reported, and the card falls back to its normal picture', () => {
    const r = parseCardFile('/content/cards/hsty.md', 'text: 蛇\nrarity: rare\nsprite: ghost', art, sprites);
    expect(r.problems.join('\n')).toMatch(/sprite "ghost" was not found in content\/sprites/);
    expect(r.card!.art).toBe('/a/hsty.png');
  });
});

describe('pack pictures', () => {
  const files = { '/content/cards/a.md': 'text: 甲\nrarity: common' };
  const cfg = (extra: object) => ({ dailyPack: 'p', packs: [{ id: 'p', name: 'P', cost: 0, weights: { common: 1 }, ...extra }] });

  it('a pack uses its own picture file, named after its id', () => {
    const c = buildContent(files, {}, cfg({}), { packImages: { '/content/packs/P.png': '/pk/p.png' } });
    expect(c.problems).toEqual([]);
    expect(c.config.packs[0].image).toBe('/pk/p.png');
  });

  it('or a sprite from the library; a sprite wins over the file; an unknown sprite is reported', () => {
    const both = buildContent(files, {}, cfg({ sprite: 'red-fox' }), { sprites, packImages: { '/content/packs/p.png': '/pk/p.png' } });
    expect(both.config.packs[0]).toMatchObject({ sprite: 'red-fox', image: '/s/red-fox.png' });
    const missing = buildContent(files, {}, cfg({ sprite: 'ghost' }), { sprites });
    expect(missing.problems.join('\n')).toMatch(/pack "p" uses the sprite "ghost" which isn't in content\/sprites/);
    expect(missing.config.packs[0].image).toBeUndefined();
  });

  it('packs without any picture are unchanged', () => {
    expect(buildContent(files, {}, cfg({})).config.packs[0]).not.toHaveProperty('image');
  });
});

describe('published manifest with sprites', () => {
  const m: Manifest = {
    schema: 1, version: 'v', config: { dailyPack: 'p', packs: [{ id: 'p', name: 'P', cost: 0, weights: { common: 1 }, sprite: 'red-fox' }] },
    cards: { 'a.md': 'text: 甲\nrarity: common\nsprite: green-dragon' }, art: {},
    sprites: { 'green-dragon.png': 'sprites/green-dragon.png', 'red-fox.png': 'sprites/red-fox.png' }, packImages: {},
  };
  it('resolves sprite addresses against the manifest and accepts older manifests without them', () => {
    expect(isManifest(m)).toBe(true);
    const c = contentFromManifest(m, 'https://me.github.io/game/content/manifest.json');
    expect(c.cards[0].art).toBe('https://me.github.io/game/content/sprites/green-dragon.png');
    expect(c.config.packs[0].image).toBe('https://me.github.io/game/content/sprites/red-fox.png');
    const { sprites: _s, packImages: _p, ...old } = m; void _s; void _p;
    expect(isManifest(old)).toBe(true);
    expect(isManifest({ ...m, sprites: { a: 5 } })).toBe(false);
  });
});
