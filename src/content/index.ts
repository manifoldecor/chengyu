import config from '../../content/game.json';
import { buildContent, Content } from './build';

// The copy of /content that is compiled into the game. It is the last-resort fallback (first run while offline) and
// what `npm run dev` uses, so edits to /content live-reload while you work.
const cardFiles = import.meta.glob('/content/cards/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const artFiles = import.meta.glob('/content/art/*.{png,jpg,jpeg,webp,gif,svg,avif}', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

const spriteFiles = import.meta.glob('/content/sprites/*.{png,webp,gif}', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const packImageFiles = import.meta.glob('/content/packs/*.{png,jpg,jpeg,webp,gif,svg}', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

export type ContentSource = 'online' | 'saved' | 'built-in';
export interface LiveContent extends Content { source: ContentSource; version: string; note: string }

export const BUNDLED: Content = buildContent(cardFiles, artFiles, config, { sprites: spriteFiles, packImages: packImageFiles });

/** The content the game is using right now. Filled in once at start-up (see boot.ts) before the game modules load. */
export const CONTENT: LiveContent = { ...BUNDLED, source: 'built-in', version: 'built-in', note: '' };

export function applyContent(c: Content, source: ContentSource, version: string, note = '') {
  Object.assign(CONTENT, c, { source, version, note });
}
