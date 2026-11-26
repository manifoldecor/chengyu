// Packs /content into public/content/ so it can be published and fetched by the game:
//   public/content/manifest.json   every card file + game.json + the list of art files, with a version hash
//   public/content/art/*           the card pictures
// Runs automatically as part of `npm run build`. Run it by hand with `npm run content`.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = join(root, 'content'), out = join(root, 'public', 'content');
const ART_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif']);

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'art'), { recursive: true });

const hash = createHash('sha1');
const cards = {};
for (const f of readdirSync(join(src, 'cards')).sort()) {
  if (!f.endsWith('.md') || f.startsWith('_')) continue;
  cards[f] = readFileSync(join(src, 'cards', f), 'utf8');
  hash.update(f).update(cards[f]);
}

const art = {};
const artDir = join(src, 'art');
if (existsSync(artDir)) for (const f of readdirSync(artDir).sort()) {
  if (!ART_EXT.has(extname(f).toLowerCase())) continue;
  copyFileSync(join(artDir, f), join(out, 'art', f));
  art[f] = `art/${encodeURIComponent(f)}`;
  hash.update(f).update(readFileSync(join(artDir, f)));
}

const config = JSON.parse(readFileSync(join(src, 'game.json'), 'utf8').replace(/^﻿/, ''));
hash.update(JSON.stringify(config));

const version = hash.digest('hex').slice(0, 10);
writeFileSync(join(out, 'manifest.json'), JSON.stringify({ schema: 1, version, generatedAt: new Date().toISOString(), config, cards, art }));
console.log(`content bundle ${version}: ${Object.keys(cards).length} cards, ${Object.keys(art).length} art files -> public/content/`);
