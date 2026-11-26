import { describe, expect, it } from 'vitest';
import { buildContent } from './build';
import { contentFromManifest, isManifest, manifestUrlFor, resolveContent, type Deps, type Manifest } from './remote';

const bundled = buildContent({ '/content/cards/built.md': 'text: 内置\nrarity: common' }, {}, {});
const manifest = (version: string, text = '在线'): Manifest => ({
  schema: 1, version, config: { packs: [{ id: 'p', weights: { common: 1 } }], dailyPack: 'p' },
  cards: { 'online.md': `text: ${text}\nrarity: rare\nname: Online` }, art: { 'online.png': 'art/online.png' },
});
const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
const respond = (body: unknown, ok = true): typeof fetch => (async () => ({ ok, status: ok ? 200 : 500, json: async () => body })) as unknown as typeof fetch;
const failing: typeof fetch = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
const deps = (fetchFn: typeof fetch, storage = memory()): Deps => ({ fetchFn, storage, baseHref: 'https://me.github.io/game/', timeoutMs: 200 });

describe('manifestUrlFor', () => {
  it('accepts folders and full addresses, relative to the page', () => {
    expect(manifestUrlFor('./content/', 'https://me.github.io/game/')).toBe('https://me.github.io/game/content/manifest.json');
    expect(manifestUrlFor('https://cdn.example.com/x', 'https://me.github.io/game/')).toBe('https://cdn.example.com/x/manifest.json');
    expect(manifestUrlFor('https://cdn.example.com/a/m.json', 'https://me.github.io/')).toBe('https://cdn.example.com/a/m.json');
  });
});

describe('manifest', () => {
  it('is validated before use', () => {
    expect(isManifest(manifest('1'))).toBe(true);
    for (const bad of [null, {}, { ...manifest('1'), schema: 2 }, { ...manifest('1'), cards: { a: 5 } }, '<html>404</html>']) expect(isManifest(bad)).toBe(false);
  });
  it('resolves art addresses against where the manifest came from', () => {
    const c = contentFromManifest(manifest('1'), 'https://me.github.io/game/content/manifest.json');
    expect(c.cards[0]).toMatchObject({ id: 'online', rarity: 'rare', art: 'https://me.github.io/game/content/art/online.png' });
  });
});

describe('resolveContent (always-fresh, falls back when offline)', () => {
  it('uses the online copy and saves it for later', async () => {
    const storage = memory();
    const r = await resolveContent('./content/', bundled, deps(respond(manifest('v1')), storage));
    expect(r).toMatchObject({ source: 'online', version: 'v1', note: '' });
    expect(r.content.cards[0].id).toBe('online');
    expect(storage.getItem('chengyu-content-cache-v1')).toContain('"v1"');
  });

  it('new content appears immediately: a second visit gets the newer version', async () => {
    const storage = memory();
    await resolveContent('./content/', bundled, deps(respond(manifest('v1')), storage));
    const r = await resolveContent('./content/', bundled, deps(respond(manifest('v2', '新卡')), storage));
    expect(r.version).toBe('v2');
    expect(r.content.cards[0].text).toBe('新卡');
  });

  it('offline: uses the saved copy, with its art still pointing at the right place', async () => {
    const storage = memory();
    await resolveContent('./content/', bundled, deps(respond(manifest('v1')), storage));
    const r = await resolveContent('./content/', bundled, deps(failing, storage));
    expect(r.source).toBe('saved');
    expect(r.version).toBe('v1');
    expect(r.note).toMatch(/saved on this device/);
    expect(r.content.cards[0].art).toBe('https://me.github.io/game/content/art/online.png');
  });

  it('offline on first visit: uses the content built into the game', async () => {
    const r = await resolveContent('./content/', bundled, deps(failing));
    expect(r).toMatchObject({ source: 'built-in', content: bundled });
    expect(r.note).toMatch(/built into the game/);
  });

  it('treats a server error, a non-manifest reply or an empty card set as a failed fetch', async () => {
    const storage = memory();
    await resolveContent('./content/', bundled, deps(respond(manifest('v1')), storage));
    for (const f of [respond({}, false), respond('<html>'), respond({ ...manifest('v9'), cards: {} })]) {
      const r = await resolveContent('./content/', bundled, deps(f, storage));
      expect(r.source).toBe('saved');
      expect(r.version).toBe('v1');                               // a bad upload never replaces the good saved copy
    }
  });

  it('times out instead of hanging the game', async () => {
    const hang: typeof fetch = ((_: unknown, init?: RequestInit) => new Promise((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))))) as unknown as typeof fetch;
    const r = await resolveContent('./content/', bundled, deps(hang));
    expect(r.source).toBe('built-in');
  });

  it('url=null (dev) uses the built-in content without any network', async () => {
    const r = await resolveContent(null, bundled, deps(failing));
    expect(r).toMatchObject({ source: 'built-in', note: '' });
  });
});
