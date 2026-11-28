import { Card, PackDef, RARITIES, Rarity } from '../game/types';

export interface StreakBonus { every: number; ink: number }
export interface GameConfig {
  dailyPack: string; pityLimit: number; idleCapHours: number;
  inkValue: Record<Rarity, number>; idleInkPerHour: Record<Rarity, number>;
  streakBonuses: StreakBonus[]; packs: PackDef[];
}
export interface Content { cards: Card[]; config: GameConfig; problems: string[] }

export const DEFAULT_CONFIG: GameConfig = {
  dailyPack: 'basic', pityLimit: 30, idleCapHours: 8,
  inkValue: { common: 5, uncommon: 12, rare: 30, epic: 80, legendary: 200 },
  idleInkPerHour: { common: 1, uncommon: 2, rare: 4, epic: 8, legendary: 15 },
  streakBonuses: [{ every: 7, ink: 50 }, { every: 14, ink: 120 }, { every: 30, ink: 300 }],
  packs: [{ id: 'basic', name: 'Basic Pack', cost: 0, weights: { common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 1 } }],
};

/** Chinese words are accepted for rarity so card files can be written entirely in Chinese. */
const RARITY_ALIASES: Record<string, Rarity> = {
  '普通': 'common', '常见': 'common', '优秀': 'uncommon', '少见': 'uncommon', '稀有': 'rare', '史诗': 'epic', '传说': 'legendary', '传奇': 'legendary',
};
const KEYS = new Set(['id', 'text', 'pinyin', 'meaning', 'rarity', 'monster', 'name', 'art', 'sprite', 'tags', 'price', 'exclusive']);
const baseName = (path: string) => path.split('/').pop()!.replace(/\.[^.]+$/, '');
const truthy = (v: string) => /^(yes|true|y|1|是)$/i.test(v.trim());

/** Parse one card file: `key: value` lines, a blank line, then the (optional) story. */
export function parseCardFile(path: string, raw: string, art: Record<string, string>, sprites: Record<string, string> = {}): { card?: Card; problems: string[] } {
  const file = path.split('/').pop()!, problems: string[] = [];
  const warn = (m: string) => problems.push(`${file}: ${m}`);
  const lines = raw.replace(/^﻿/, '').split(/\r?\n/);
  const fields: Record<string, string> = {};
  let i = 0;
  // skip leading comments/blank lines, then read `key: value` lines until the first blank line
  while (i < lines.length && (lines[i].trim() === '' || lines[i].trim().startsWith('#'))) i++;
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') break;
    if (line.startsWith('#')) continue;
    const m = /^([A-Za-z_]+)\s*[:：]\s*(.*)$/.exec(line);
    if (!m) { warn(`couldn't read the line "${line}" (expected "name: value")`); continue; }
    const key = m[1].toLowerCase();
    if (!KEYS.has(key)) { warn(`unknown field "${key}" (known: ${[...KEYS].join(', ')})`); continue; }
    fields[key] = m[2].trim();
  }
  const story = lines.slice(i + 1).filter(l => !l.trim().startsWith('#')).join('\n').trim();

  if (!fields.text) { warn('missing "text:" (the 成语 itself) - skipped'); return { problems }; }
  const rarityRaw = (fields.rarity ?? '').toLowerCase();
  const rarity = (RARITIES as string[]).includes(rarityRaw) ? (rarityRaw as Rarity) : RARITY_ALIASES[fields.rarity ?? ''];
  if (!rarity) {
    warn(`rarity "${fields.rarity ?? ''}" isn't valid - use one of: ${RARITIES.join(', ')} - skipped`);
    return { problems };
  }
  const id = (fields.id || baseName(path)).trim();

  // picture: an explicit `art: file.png` wins, then a `sprite: name` from the sprite library, then any file in content/art named after the card id
  const artKeys = Object.keys(art), spriteKeys = Object.keys(sprites);
  let explicit: string | undefined, spriteUrl: string | undefined, auto: string | undefined;
  if (fields.art) {
    const key = artKeys.find(k => k.split('/').pop()!.toLowerCase() === fields.art.toLowerCase());
    if (key) explicit = art[key]; else warn(`art file "${fields.art}" was not found in content/art (the emoji is used instead)`);
  } else {
    const key = artKeys.find(k => baseName(k).toLowerCase() === id.toLowerCase());
    if (key) auto = art[key];
  }
  const spriteName = fields.sprite?.trim();
  if (spriteName) {
    const key = spriteKeys.find(k => baseName(k).toLowerCase() === spriteName.toLowerCase());
    if (key) spriteUrl = sprites[key]; else warn(`sprite "${spriteName}" was not found in content/sprites (the card's other picture, or its emoji, is used instead)`);
  }
  const artUrl = explicit ?? spriteUrl ?? auto;
  const artFit = artUrl && explicit === undefined && artUrl === spriteUrl ? ('contain' as const) : undefined;

  let price: number | undefined;
  if (fields.price) {
    price = Number(fields.price);
    if (!Number.isFinite(price) || price <= 0) { warn(`price "${fields.price}" must be a positive number - ignored`); price = undefined; }
  }
  const card: Card = {
    id, text: fields.text, pinyin: fields.pinyin ?? '', meaning: fields.meaning ?? '', rarity,
    monster: fields.monster || '👾', name: fields.name || fields.text,
    tags: (fields.tags ?? '').split(/[,，、]/).map(t => t.trim().toLowerCase()).filter(Boolean),
    ...(artUrl ? { art: artUrl } : {}), ...(artFit ? { artFit } : {}), ...(spriteName ? { sprite: spriteName } : {}), ...(story ? { story } : {}), ...(price ? { price } : {}),
    ...(fields.exclusive && truthy(fields.exclusive) ? { exclusive: true } : {}),
  };
  if (card.exclusive && !card.price) warn('"exclusive: yes" but no "price:", so nobody can ever get this card');
  return { card, problems };
}

function num(v: unknown, fallback: number, where: string, problems: string[], min = 0): number {
  if (v === undefined) return fallback;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min) { problems.push(`game.json: ${where} should be a number >= ${min} (using ${fallback})`); return fallback; }
  return v;
}
function perRarity(v: unknown, fallback: Record<Rarity, number>, where: string, problems: string[]): Record<Rarity, number> {
  const out = { ...fallback };
  if (v === undefined) return out;
  if (typeof v !== 'object' || v === null) { problems.push(`game.json: ${where} should look like { "common": 5, ... }`); return out; }
  for (const r of RARITIES) out[r] = num((v as Record<string, unknown>)[r], fallback[r], `${where}.${r}`, problems);
  return out;
}

export function parseConfig(raw: unknown, problems: string[]): GameConfig {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const cfg: GameConfig = {
    dailyPack: typeof c.dailyPack === 'string' ? c.dailyPack : DEFAULT_CONFIG.dailyPack,
    pityLimit: Math.max(1, Math.floor(num(c.pityLimit, DEFAULT_CONFIG.pityLimit, 'pityLimit', problems, 1))),
    idleCapHours: num(c.idleCapHours, DEFAULT_CONFIG.idleCapHours, 'idleCapHours', problems),
    inkValue: perRarity(c.inkValue, DEFAULT_CONFIG.inkValue, 'inkValue', problems),
    idleInkPerHour: perRarity(c.idleInkPerHour, DEFAULT_CONFIG.idleInkPerHour, 'idleInkPerHour', problems),
    streakBonuses: DEFAULT_CONFIG.streakBonuses, packs: [],
  };
  if (Array.isArray(c.streakBonuses)) {
    cfg.streakBonuses = (c.streakBonuses as Record<string, unknown>[]).flatMap((b, i) =>
      Number.isInteger(b?.every) && (b.every as number) > 0 && typeof b.ink === 'number' && b.ink >= 0
        ? [{ every: b.every as number, ink: b.ink }]
        : (problems.push(`game.json: streakBonuses[${i}] needs { "every": days, "ink": amount }`), []));
  }
  const ids = new Set<string>();
  for (const [i, p] of (Array.isArray(c.packs) ? (c.packs as Record<string, unknown>[]) : []).entries()) {
    const id = typeof p?.id === 'string' ? p.id : '';
    if (!id || ids.has(id)) { problems.push(`game.json: packs[${i}] needs a unique "id"`); continue; }
    ids.add(id);
    const weights = perRarity(p.weights, { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 }, `packs[${i}].weights`, problems);
    if (RARITIES.every(r => weights[r] === 0)) { problems.push(`game.json: pack "${id}" has no drop weights - skipped`); ids.delete(id); continue; }
    const color = typeof p.color === 'string' && /^#[0-9a-f]{6}$/i.test(p.color.trim()) ? p.color.trim() : undefined;
    if (p.color !== undefined && !color) problems.push(`game.json: pack "${id}" has a colour that isn't like "#a3261e" - ignored`);
    const icon = typeof p.icon === 'string' && p.icon.trim() ? p.icon.trim().slice(0, 8) : undefined;
    const description = typeof p.description === 'string' && p.description.trim() ? p.description.trim().slice(0, 160) : undefined;
    const cards = Array.isArray(p.cards) ? (p.cards as unknown[]).map(x => String(x)).filter(Boolean) : [];
    cfg.packs.push({
      id, name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : id, cost: num(p.cost, 0, `packs[${i}].cost`, problems), weights,
      ...(Array.isArray(p.tags) && p.tags.length ? { tags: (p.tags as unknown[]).map(t => String(t).toLowerCase()) } : {}),
      ...(cards.length ? { cards } : {}), ...(typeof p.sprite === 'string' && p.sprite.trim() ? { sprite: p.sprite.trim() } : {}), ...(icon ? { icon } : {}), ...(color ? { color } : {}), ...(description ? { description } : {}),
    });
  }
  if (!cfg.packs.length) { problems.push('game.json: no valid packs, using the built-in basic pack'); cfg.packs = DEFAULT_CONFIG.packs; }
  if (!cfg.packs.some(p => p.id === cfg.dailyPack)) {
    problems.push(`game.json: dailyPack "${cfg.dailyPack}" isn't one of your packs - using "${cfg.packs[0].id}"`);
    cfg.dailyPack = cfg.packs[0].id;
  }
  return cfg;
}

/** Turn the raw content files into validated game data. Never throws: problems are collected for display. */
/** `extras.sprites` = content/sprites (cut-out pictures to reuse), `extras.packImages` = content/packs (a picture per pack, named after its id). */
export function buildContent(cardFiles: Record<string, string>, artFiles: Record<string, string>, rawConfig: unknown, extras: { sprites?: Record<string, string>; packImages?: Record<string, string> } = {}): Content {
  const problems: string[] = [];
  const config = parseConfig(rawConfig, problems);
  const cards: Card[] = [], seen = new Set<string>();
  for (const path of Object.keys(cardFiles).sort()) {
    if (baseName(path).startsWith('_')) continue;           // templates / notes
    const r = parseCardFile(path, cardFiles[path], artFiles, extras.sprites ?? {});
    problems.push(...r.problems);
    if (!r.card) continue;
    if (seen.has(r.card.id)) { problems.push(`${path.split('/').pop()}: another card already uses the id "${r.card.id}" - skipped`); continue; }
    seen.add(r.card.id); cards.push(r.card);
  }
  if (!cards.length) problems.push('No cards were found in content/cards - the game needs at least one.');
  const droppable = cards.filter(c => !c.exclusive);
  if (cards.length && !droppable.length) problems.push('Every card is "exclusive", so packs have nothing to give.');
  for (const p of config.packs) if (p.tags?.length && !droppable.some(c => c.tags.some(t => p.tags!.includes(t))))
    problems.push(`game.json: pack "${p.id}" is limited to tags [${p.tags.join(', ')}] but no card has them - it will use all cards`);
  const known = new Set(cards.map(c => c.id));
  for (const p of config.packs) {
    if (!p.cards) continue;
    const missing = p.cards.filter(id => !known.has(id));
    for (const id of missing) problems.push(`game.json: pack "${p.id}" lists the card "${id}" which doesn't exist - skipped`);
    p.cards = p.cards.filter(id => known.has(id));
    if (!p.cards.length) delete p.cards;
  }
  const sprites = extras.sprites ?? {}, packImages = extras.packImages ?? {};
  for (const p of config.packs) {                                    // a pack's picture: its sprite, or the file named after its id
    const spriteKey = p.sprite ? Object.keys(sprites).find(k => baseName(k).toLowerCase() === p.sprite!.toLowerCase()) : undefined;
    if (p.sprite && !spriteKey) problems.push(`game.json: pack "${p.id}" uses the sprite "${p.sprite}" which isn't in content/sprites`);
    const own = Object.keys(packImages).find(k => baseName(k).toLowerCase() === p.id.toLowerCase());
    const url = spriteKey ? sprites[spriteKey] : own ? packImages[own] : undefined;
    if (url) p.image = url;
  }
  return { cards, config, problems };
}
