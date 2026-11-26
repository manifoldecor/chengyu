import { BUNDLED, applyContent } from './content';
import { resolveContent } from './content/remote';

// Entry point: load the game's content (online first, see content/remote.ts), THEN start the game, because the game
// modules read the content when they load.
//
// Where content comes from:
//   production build  -> ./content/ next to the game (the folder `npm run build` publishes)
//   `npm run dev`     -> the live /content folder (so edits reload instantly); add ?remote=1 to test the online path
//   anywhere          -> ?content=https://example.com/some/folder/ overrides the address
//   VITE_CONTENT_URL  -> build-time override, if the content is hosted somewhere other than the game
const params = new URLSearchParams(location.search);
const url: string | null =
  params.get('content') ??
  (import.meta.env.VITE_CONTENT_URL as string | undefined) ??
  (import.meta.env.DEV && !params.has('remote') ? null : './content/');

async function start() {
  const app = document.getElementById('app')!;
  if (url) app.innerHTML = '<div class="boot">Loading the latest cards…</div>';
  const r = await resolveContent(url, BUNDLED, { fetchFn: fetch.bind(window), storage: localStorage, baseHref: location.href });
  applyContent(r.content, r.source, r.version, r.note);
  await import('./main');
}
void start();
