import { CONTENT } from './content';
import { CARDS, DAILY_PACK, INK_VALUE, PACKS } from './game/packs';
import type { PackDef } from './game/types';
import { buyCard, buyPack, collectIdle, idleRate, openPack } from './game/economy';
import { canClaimDaily, claimDaily } from './game/daily';
import { load, save } from './game/save';
import { Card, PullResult, RARITIES } from './game/types';
import { PackStage } from './fx/stage';
import { RARITY_HEX } from './fx/textures';
import { sfx } from './fx/audio';
import { CardViewer } from './fx/viewer';

const state = load();
let tab: 'home' | 'collection' | 'shop' = 'home';
let toast = '';
let stage: PackStage | null = null;
let autoNext = false;

const app = document.getElementById('app')!;
const persist = () => save(state);
const cardById = (id: string) => CARDS.find(c => c.id === id) as Card;
/** Card text now comes from editable files, so escape it before putting it in the page. */
const esc = (s: string) => s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

/** Ink shown in the header hides a pending pack's duplicate refund until the reveal. */
const shownInk = () => state.ink - (state.pending ? state.pending.inkGained + state.pending.bonus : 0);

/** Roll the free daily pack the moment it's available (so reloading can't re-roll it). */
function ensureDailyPending() {
  if (state.pending || !canClaimDaily(state, new Date())) return;
  const bonus = claimDaily(state, new Date());
  const res = openPack(state, DAILY_PACK);
  state.ink += bonus;
  state.pending = { cardId: res.card.id, isNew: res.isNew, inkGained: res.inkGained, bonus, packId: DAILY_PACK.id };
  persist();
}

/** A shop purchase has been rolled: show it on the stage, opening automatically. */
function startReveal(res: PullResult, packId?: string) {
  state.pending = { cardId: res.card.id, isNew: res.isNew, inkGained: res.inkGained, bonus: 0, packId };
  persist(); tab = 'home'; toast = ''; autoNext = true; render(); sfx.coin();
}

function render() {
  stage?.dispose(); stage = null;
  if (viewerEl && tab !== 'collection') closeViewer();
  if (state.pending && !CARDS.some(c => c.id === state.pending!.cardId)) { state.pending = null; persist(); }   // that card was removed from the online content
  if (tab === 'home') ensureDailyPending();
  app.innerHTML = `
    <header><span id="h-streak">🔥 Streak ${state.streak}</span><span id="h-ink">🖋️ Ink ${shownInk()}</span></header>
    ${problemsBanner()}
    <nav>${(['home', 'collection', 'shop'] as const).map(t =>
      `<button data-tab="${t}" class="${t === tab ? 'active' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</nav>
    <main>${tab === 'home' ? home() : tab === 'collection' ? collection() : shop()}</main>
    <footer class="src ${CONTENT.note ? 'warn' : ''}">${esc(CONTENT.note || `Content: ${CONTENT.source}${CONTENT.version === 'built-in' ? '' : ' · v' + CONTENT.version}`)}</footer>`;
  // a picture that fails to load (e.g. offline) falls back to the card's emoji
  app.querySelectorAll<HTMLImageElement>('img.art').forEach(img => img.addEventListener('error', () => {
    const d = document.createElement('div'); d.className = 'm'; d.textContent = img.dataset.fallback || '👾'; img.replaceWith(d);
  }));
  app.querySelectorAll<HTMLElement>('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab as typeof tab; render(); });
  app.querySelectorAll<HTMLElement>('[data-buy]').forEach(b => b.onclick = () => {
    if (state.pending) { toast = 'Open your current pack first!'; tab = 'home'; render(); return; }
    const res = buyPack(state, b.dataset.buy!);
    if (res) startReveal(res, b.dataset.buy!); else { toast = 'Not enough ink'; render(); }
  });
  app.querySelectorAll<HTMLElement>('[data-buycard]').forEach(b => b.onclick = () => {
    if (state.pending) { toast = 'Open your current pack first!'; tab = 'home'; render(); return; }
    const res = buyCard(state, b.dataset.buycard!);
    if (res) startReveal(res); else { toast = 'Not enough ink'; render(); }
  });
  if (tab === 'home' && state.pending) mountStage();
  app.querySelectorAll<HTMLElement>('[data-card]').forEach(b => b.onclick = () => openViewer(b.dataset.card!));
  document.getElementById('continue')?.addEventListener('click', () => { toast = ''; render(); });
}

/** Mistakes in the content files are shown here in plain words instead of silently breaking the game. */
function problemsBanner() {
  if (!CONTENT.problems.length) return '';
  return `<details class="problems" open><summary>⚠️ ${CONTENT.problems.length} problem${CONTENT.problems.length > 1 ? 's' : ''} in your content files</summary>
    <ul>${CONTENT.problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul></details>`;
}

/** A pack with its own icon or colour wears it; the house pack keeps the classic crimson look. */
const packLook = (p: PackDef) => (p.icon || p.color || p.image ? { name: p.name, icon: p.icon, color: p.color, image: p.image } : undefined);

function mountStage() {
  const p = state.pending!, card = cardById(p.cardId);
  const host = document.getElementById('stage')!;
  // a pack bought in the shop opens itself; the free daily pack is hold-to-open
  const pack = PACKS.find(x => x.id === p.packId) ?? DAILY_PACK;   // a pack removed from game.json falls back to the daily look
  stage = new PackStage(host, card, { auto: autoNext, pack: packLook(pack), onRevealed: () => revealed(p) });
  autoNext = false;
}

function revealed(p: NonNullable<typeof state.pending>) {
  state.pending = null; persist();
  const after = document.getElementById('after');
  if (after) after.innerHTML = `
    <div class="toast">${p.isNew ? '✨ New monster added to your collection!' : `Duplicate recycled → +${p.inkGained} ink`}
      ${p.bonus ? `<br>🔥 Streak bonus +${p.bonus} ink!` : ''}</div>
    <button class="btn primary" id="continue">Continue</button>`;
  document.getElementById('continue')?.addEventListener('click', () => { toast = ''; render(); });
  document.getElementById('h-ink')!.textContent = `🖋️ Ink ${state.ink}`;
  if (p.inkGained) setTimeout(sfx.coin, 700);
}

function home() {
  if (state.pending) return `<div id="stage"></div><div id="after"></div>`;
  const idle = Math.floor(idleRate(state));
  return `<div class="toast">${esc(toast)}</div>
    <div class="sleep">💤</div>
    <p>You've opened today's free pack.<br>Come back tomorrow for the next one!</p>
    <p class="dim">Your monsters earn ${idle} ink/hour (up to ${CONTENT.config.idleCapHours} hours stored)</p>
    <p class="dim">Spend ink in the Shop for packs with better odds.</p>`;
}

const thumb = (c: Card) => c.art ? `<img class="art" style="object-fit:${c.artFit === 'contain' ? 'contain;padding:8%' : 'cover'}" src="${esc(c.art)}" data-fallback="${esc(c.monster)}" alt="">` : `<div class="m">${esc(c.monster)}</div>`;

const sortedCards = () => [...CARDS].sort((x, y) => RARITIES.indexOf(x.rarity) - RARITIES.indexOf(y.rarity));

function collection() {
  const owned = CARDS.filter(c => state.owned[c.id]).length;
  return `<p>${owned} / ${CARDS.length} collected</p><p class="dim" style="margin-top:-6px">Tap a card to look at it up close.</p><div class="grid">${sortedCards().map(c => {
    const n = state.owned[c.id];
    return `<button type="button" class="mini ${n ? '' : 'locked'}" data-card="${esc(c.id)}" style="--c:${RARITY_HEX[c.rarity]}" aria-label="${n ? esc(c.text) : 'Undiscovered ' + c.rarity + ' card'}">
      ${n ? thumb(c) : '<div class="m">❓</div>'}<div class="t hanzi">${n ? esc(c.text) : '？？？？'}</div>
      <div class="s">${n ? `×${n} · ${c.rarity}` : c.rarity}</div></button>`;
  }).join('')}</div>`;
}

/* ---------- card viewer (opens from the collection) ---------- */
let viewer: CardViewer | null = null;
let viewerEl: HTMLElement | null = null;
let viewerIdx = 0;

function openViewer(id: string) {
  const list = sortedCards(); viewerIdx = Math.max(0, list.findIndex(c => c.id === id));
  if (!viewerEl) {
    viewerEl = document.createElement('div'); viewerEl.className = 'viewer';
    viewerEl.setAttribute('role', 'dialog'); viewerEl.setAttribute('aria-modal', 'true'); viewerEl.setAttribute('aria-label', 'Card viewer');
    viewerEl.innerHTML = `<button class="vclose" type="button" aria-label="Close">✕</button>
      <button class="vnav prev" type="button" aria-label="Previous card">‹</button><button class="vnav next" type="button" aria-label="Next card">›</button>
      <div class="vstage"></div><div class="vinfo" aria-live="polite"></div>`;
    document.body.appendChild(viewerEl); document.body.classList.add('noscroll');
    viewerEl.querySelector('.vclose')!.addEventListener('click', closeViewer);
    viewerEl.querySelector('.prev')!.addEventListener('click', () => stepViewer(-1));
    viewerEl.querySelector('.next')!.addEventListener('click', () => stepViewer(1));
    viewerEl.addEventListener('click', e => { if (e.target === viewerEl) closeViewer(); });
    document.addEventListener('keydown', viewerKeys);
  }
  showViewerCard();
}
function stepViewer(d: number) { const n = sortedCards().length; viewerIdx = (viewerIdx + d + n) % n; showViewerCard(); }
function showViewerCard() {
  if (!viewerEl) return;
  const c = sortedCards()[viewerIdx], n = state.owned[c.id] ?? 0, host = viewerEl.querySelector<HTMLElement>('.vstage')!;
  viewer?.dispose(); viewer = new CardViewer(host, c, n > 0);
  const tags = c.tags.length ? `<div class="vtags">${c.tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>` : '';
  viewerEl.querySelector('.vinfo')!.innerHTML = n > 0
    ? `<div class="vname">${esc(c.name)}</div><div class="vmeta" style="color:${RARITY_HEX[c.rarity]}"><b>${c.rarity}</b> · you own ×${n} · a duplicate recycles for ${INK_VALUE[c.rarity]} ink</div>
       ${c.story ? `<p class="vstory">${esc(c.story)}</p>` : ''}${tags}<div class="vhint">Drag to turn it · tap to flip · ← → for the next card</div>`
    : `<div class="vname">Not discovered yet</div><div class="vmeta" style="color:${RARITY_HEX[c.rarity]}"><b>${c.rarity}</b> card</div>
       <p class="vstory">Open packs to find it${c.price ? `, or buy it in the Shop for ${c.price} ink` : ''}.</p><div class="vhint">← → for the next card</div>`;
}
function viewerKeys(e: KeyboardEvent) {
  if (e.key === 'Escape') closeViewer(); else if (e.key === 'ArrowLeft') stepViewer(-1); else if (e.key === 'ArrowRight') stepViewer(1);
}
function closeViewer() {
  document.removeEventListener('keydown', viewerKeys);
  viewer?.dispose(); viewer = null; viewerEl?.remove(); viewerEl = null; document.body.classList.remove('noscroll');
}

function shop() {
  const pct = (p: (typeof PACKS)[number], r: (typeof RARITIES)[number]) => {
    const total = RARITIES.reduce((s, x) => s + p.weights[x], 0);
    return +(p.weights[r] / total * 100).toFixed(1);
  };
  const packs = PACKS.filter(p => p.cost > 0).map(p => {
    const theme = p.cards?.length ? `Hand-picked: ${p.cards.length} cards` : p.tags?.length ? `Theme: ${p.tags.map(esc).join(', ')}` : '';
    return `<div class="shop-row pack" style="--pc:${p.color ?? '#c0392b'}"><span class="pk-ico" aria-hidden="true">${p.image ? `<img src="${esc(p.image)}" alt="">` : esc(p.icon ?? '📦')}</span>
      <span class="pk-body"><b>${esc(p.name)}</b>${p.description ? `<br><span class="pk-desc">${esc(p.description)}</span>` : ''}${theme ? `<br><span class="pk-theme">${theme}</span>` : ''}
      <br><small>${RARITIES.filter(r => p.weights[r] > 0).map(r => `${r}: ${pct(p, r)}%`).join(' · ')}</small></span>
      <button class="btn" data-buy="${esc(p.id)}" ${state.ink < p.cost ? 'disabled' : ''}>🖋️ ${p.cost}</button></div>`;
  }).join('');
  const unique = CARDS.filter(c => c.price).map(c => {
    const owned = !!state.owned[c.id];
    return `<div class="shop-row" style="border-color:${RARITY_HEX[c.rarity]}66"><span class="hanzi" style="font-size:20px">${esc(c.text)}</span>
      <span style="flex:1;padding:0 12px"><small>${esc(c.name)} · ${c.rarity}${c.exclusive ? ' · shop only' : ''}</small></span>
      <button class="btn" data-buycard="${esc(c.id)}" ${owned || state.ink < c.price! ? 'disabled' : ''}>${owned ? 'Owned' : `🖋️ ${c.price}`}</button></div>`;
  }).join('');
  return `<div class="toast">${esc(toast)}</div>` + `<h3 class="h">Packs</h3>` + packs +
    (unique ? `<h3 class="h">Unique cards</h3>${unique}` : '') +
    `<p class="dim">Duplicates are recycled into ink: ${RARITIES.map(r => `${r} ${INK_VALUE[r]}`).join(' · ')}</p>`;
}

const gained = collectIdle(state);
if (gained > 0) toast = `Your monsters earned ${gained} ink while you were away.`;
persist();
render();
