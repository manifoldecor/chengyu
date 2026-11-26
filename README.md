# 成语 Monsters

A daily card-pack game: open a pack, get a 成语 with a monster. Duplicates become ink, ink buys better packs.

## Run it on your computer

```
npm install
npm run dev      # the game, live-reloading as you edit /content
npm test         # checks the game rules AND your content files
```

## Edit the game's content

Cards, art and settings live in `content/` - see [content/README.md](content/README.md). No code needed.

## Put it online (GitHub Pages) - one-time setup

The game and its content are published together, but **players always fetch the latest content when they open the game**,
so adding a card later never needs a new version of the game.

1. Create a new repository on GitHub (e.g. `chengyu-monsters`) and push this folder to its `main` branch.
2. In the repository: **Settings -> Pages -> Build and deployment -> Source: GitHub Actions**.
3. Push (or open the **Actions** tab and run "Publish game and content"). After a minute or two the game is live at
   `https://<your-name>.github.io/<repository>/`.

### Updating the live game afterwards

Edit or add files in `content/` (you can even do it in the GitHub website: **Add file -> Upload files**, drop art into
`content/art/` or a new `.md` into `content/cards/`), then commit. The workflow checks the content, rebuilds and republishes.
If a card file has a mistake, the check fails and **nothing is published**, so the live game never breaks.

### How players get content

1. Opening the game asks the server for the newest content (a quick check; nothing downloads if it hasn't changed).
2. If they're offline, the game uses the copy saved from their last visit.
3. If they've never been online, it uses the content built into the game.

The small grey line at the bottom of the page says which of the three is in use (and the content version).

### Hosting the content somewhere else

By default the content is fetched from `./content/` next to the game. To host it elsewhere, run `npm run content`
(creates `public/content/`), upload that folder to any static host with CORS enabled, and build the game with
`VITE_CONTENT_URL=https://your-host.example/path/ npm run build`. For a quick test without rebuilding, open the game with
`?content=https://your-host.example/path/` on the end of its address.

`public/content/` is generated from `content/` on every build. Never edit it by hand.
