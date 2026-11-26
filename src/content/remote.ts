import { buildContent, Content } from './build';
import type { ContentSource } from './index';

/** What `scripts/build-content.mjs` publishes at <site>/content/manifest.json. */
export interface Manifest {
  schema: 1; version: string; generatedAt?: string;
  config: unknown; cards: Record<string, string>; art: Record<string, string>;
}

const CACHE_KEY = 'chengyu-content-cache-v1';

const isRecordOfStrings = (v: unknown): v is Record<string, string> =>
  !!v && typeof v === 'object' && Object.values(v as object).every(x => typeof x === 'string');

export function isManifest(x: unknown): x is Manifest {
  const m = x as Manifest;
  return !!m && m.schema === 1 && typeof m.version === 'string' && !!m.config && typeof m.config === 'object'
    && isRecordOfStrings(m.cards) && isRecordOfStrings(m.art);
}

/** Turn a downloaded manifest into game content. Art paths in the manifest are relative to where it was fetched from. */
export function contentFromManifest(m: Manifest, manifestUrl: string): Content {
  const cardFiles: Record<string, string> = {}, artFiles: Record<string, string> = {};
  for (const [name, text] of Object.entries(m.cards)) cardFiles[`/content/cards/${name}`] = text;
  for (const [name, rel] of Object.entries(m.art)) artFiles[`/content/art/${name}`] = new URL(rel, manifestUrl).href;
  return buildContent(cardFiles, artFiles, m.config);
}

export interface Deps {
  fetchFn: typeof fetch;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  baseHref: string;                 // the page's own address, to resolve a relative content URL against
  timeoutMs?: number;
}
export interface Resolved { content: Content; source: ContentSource; version: string; note: string }

/** `url` may be a folder ("./content/") or a full ".../manifest.json" address. */
export function manifestUrlFor(url: string, baseHref: string): string {
  const u = new URL(url, baseHref);
  if (!u.pathname.endsWith('.json')) u.pathname = u.pathname.replace(/\/?$/, '/') + 'manifest.json';
  return u.href;
}

async function fetchManifest(url: string, d: Deps): Promise<Manifest> {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), d.timeoutMs ?? 6000);
  try {
    // "no-cache" = always ask the server whether it changed (cheap 304 if not), so new cards appear immediately.
    const res = await d.fetchFn(url, { cache: 'no-cache', signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: unknown = await res.json().catch(() => { throw new Error("the address didn't return a content file"); });
    if (!isManifest(json)) throw new Error("that file isn't a valid content manifest");
    return json;
  } finally { clearTimeout(timer); }
}

function readSaved(d: Deps): { manifest: Manifest; url: string } | null {
  try {
    const raw = d.storage.getItem(CACHE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as { manifest: unknown; url: string };
    return isManifest(s.manifest) && typeof s.url === 'string' ? { manifest: s.manifest, url: s.url } : null;
  } catch { return null; }
}

/**
 * Always-fresh strategy: ask the server first. If that fails (offline, timeout, bad file), use the copy saved from the
 * last successful visit, and if there is none, the content compiled into the game. Never throws.
 */
export async function resolveContent(url: string | null, bundled: Content, d: Deps): Promise<Resolved> {
  if (url === null) return { content: bundled, source: 'built-in', version: 'built-in', note: '' };
  const manifestUrl = manifestUrlFor(url, d.baseHref);
  let why = '';
  try {
    const manifest = await fetchManifest(manifestUrl, d);
    const content = contentFromManifest(manifest, manifestUrl);
    if (!content.cards.length) throw new Error('it contains no valid cards');
    try { d.storage.setItem(CACHE_KEY, JSON.stringify({ manifest, url: manifestUrl })); } catch { /* storage full/blocked: fine */ }
    return { content, source: 'online', version: manifest.version, note: '' };
  } catch (e) { why = e instanceof Error ? e.message : String(e); }

  const saved = readSaved(d);
  if (saved) {
    const content = contentFromManifest(saved.manifest, saved.url);
    if (content.cards.length) return { content, source: 'saved', version: saved.manifest.version, note: `Couldn't reach the online content (${why}); using the copy saved on this device.` };
  }
  return { content: bundled, source: 'built-in', version: 'built-in', note: `Couldn't reach the online content (${why}); using the version built into the game.` };
}
