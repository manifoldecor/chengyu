# Game content: add cards, art and settings here

Everything the game gives players lives in this folder. You never need to touch the code.
While `npm run dev` is running, **save a file and the game reloads by itself**.

```
content/
  cards/      one text file per card         (add a file = add a card)
  art/        pictures for the cards         (drop an image in = the card uses it)
  game.json   packs, drop rates, ink values, streak rewards, idle income
```

## Add a card

1. Copy `cards/_template.md`, rename it (e.g. `ye-gong.md`).
2. Edit the lines. Only `text` and `rarity` are required.
3. Save. The card is in the game.

```
text: 叶公好龙
pinyin: yè gōng hào lóng
meaning: Professing love for what one actually fears
rarity: epic
monster: 🐉
name: Lord Ye's Dragon
tags: dragon
```

Anything after the **first blank line** is the card's story text.

| Field | What it does |
|---|---|
| `text` | The 成语 / saying (required) |
| `rarity` | `common`, `uncommon`, `rare`, `epic`, `legendary` (or 普通 / 优秀 / 稀有 / 史诗 / 传说) |
| `pinyin`, `meaning`, `name` | Shown on the card. `name` is the monster's name |
| `monster` | An emoji used until you add real art |
| `art` | Picture file name in `art/` (optional, see below) |
| `tags` | Words like `dragon, animal`. Packs can be limited to tags |
| `price` | Makes the card buyable in the Shop for that much ink |
| `exclusive: yes` | The card never drops from packs, only the Shop sells it |
| `id` | Defaults to the file name. **Never change it after players own the card** |

Lines starting with `#` are comments. Files starting with `_` are ignored.

## Add art

Put an image in `art/` named after the card's file name: `ye-gong.md` -> `art/ye-gong.png`.
`png`, `jpg`, `webp`, `gif`, `svg` and `avif` all work. A portrait-ish or square picture is best,
it fills the picture area of the card. If a picture isn't there, the emoji is used.
To use a different name, add `art: my-picture.png` to the card file.

## Change the game: `game.json`

* `packs`: the packs players open and buy. **The easiest way is the Packs tab in the Card Workshop**
  (add, edit and remove packs there). In the file, each pack has:
  * `id`, `name`, `cost` (ink; 0 = free, which only makes sense for the daily pack) and `weights`
    (the chance of each rarity; they are relative, so they don't have to add up to 100).
  * Optional look: `icon` (an emoji), `color` (like `"#1f6f8b"`) and `description` (one line for the shop).
    A pack with an icon or colour wears it on the 3D pack you open.
  * Optional contents: `"tags": ["dragon"]` draws only from cards with that tag, or `"cards": ["yghl", "pdjn"]`
    draws only from those hand-picked cards (even shop-only ones).
* `dailyPack`: which pack is the free daily one.
* `inkValue`: ink you get for recycling a duplicate, per rarity.
* `idleInkPerHour`, `idleCapHours`: passive income from owned cards.
* `streakBonuses`: e.g. `{ "every": 7, "ink": 50 }` = 50 ink every 7th day of the streak.
* `pityLimit`: after this many packs without an epic+, the next one is guaranteed.

## If something is wrong

The game never crashes on a content mistake. A red box at the top of the page lists every problem
in plain words (which file, which line, how to fix it), and the broken card is skipped.
`npm test` also fails if the content has problems, so you can check before sharing.

## Publishing

Content is published online with the game, and players fetch the newest version every time they open it.
See the main [README](../README.md) for the one-time GitHub Pages setup.
