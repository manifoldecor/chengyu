import * as THREE from 'three';
import { Card, Rarity, RARITIES } from '../game/types';

// Calligraphy-style hanzi (KaiTi ships with Windows/macOS/most Linux CJK packs), clean sans for Latin/pinyin.
export const HANZI = '"KaiTi","Kaiti SC","STKaiti","AR PL UKai CN","Noto Serif CJK SC","Noto Serif SC","Songti SC","Microsoft YaHei",serif';
export const SANS = '"Segoe UI","SF Pro Text","Helvetica Neue",Arial,"Noto Sans",sans-serif';
const EMOJI = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';

export const RARITY_HEX: Record<Rarity, string> = {
  common: '#d8c8a0', uncommon: '#5fd068', rare: '#4aa3ff', epic: '#b872ff', legendary: '#ffb62e',
};
const DARK: Record<Rarity, [string, string]> = {
  common: ['#2a2420', '#14100e'], uncommon: ['#16301a', '#0b1a0d'], rare: ['#12284a', '#081428'],
  epic: ['#2c1450', '#150a28'], legendary: ['#4a2e08', '#241404'],
};

const W = 768, H = 1152;
function canvas(w = W, h = H) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.roundRect(x, y, w, h, r);
}
function wrap(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(' '), lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

export function cardFrontTexture(card: Card): THREE.CanvasTexture {
  const c = canvas(); paintFront(c, card, null);
  const t = tex(c);
  if (card.art) {                       // illustration from content/art: repaint the card once it has loaded
    const img = new Image(); img.crossOrigin = 'anonymous';   // art may be hosted on another address
    img.onload = () => { paintFront(c, card, img); t.needsUpdate = true; };
    img.src = card.art;
  }
  return t;
}

function paintFront(c: HTMLCanvasElement, card: Card, img: HTMLImageElement | null) {
  const g = c.getContext('2d')!; g.clearRect(0, 0, c.width, c.height);
  const col = RARITY_HEX[card.rarity], [d0, d1] = DARK[card.rarity];
  const tier = RARITIES.indexOf(card.rarity);

  rr(g, 0, 0, W, H, 54); g.save(); g.clip();
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, d0); bg.addColorStop(1, d1);
  g.fillStyle = bg; g.fillRect(0, 0, W, H);

  // art panel
  const ax = 58, ay = 120, aw = W - 116, ah = 520;
  rr(g, ax, ay, aw, ah, 30); g.save(); g.clip();
  const rg = g.createRadialGradient(W / 2, ay + ah * 0.55, 20, W / 2, ay + ah * 0.55, 380);
  rg.addColorStop(0, col + 'aa'); rg.addColorStop(0.55, col + '33'); rg.addColorStop(1, '#0a0706');
  g.fillStyle = rg; g.fillRect(ax, ay, aw, ah);
  // ink-wash enso behind the monster
  g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = 26; g.lineCap = 'round';
  g.beginPath(); g.arc(W / 2, ay + ah * 0.52, 190, 0.35, Math.PI * 2 - 0.5); g.stroke();
  // mountains
  g.fillStyle = 'rgba(0,0,0,.35)';
  g.beginPath(); g.moveTo(ax, ay + ah); g.lineTo(ax, ay + ah - 110);
  g.quadraticCurveTo(ax + 120, ay + ah - 230, ax + 240, ay + ah - 100);
  g.quadraticCurveTo(ax + 380, ay + ah - 210, ax + 520, ay + ah - 90);
  g.lineTo(ax + aw, ay + ah - 140); g.lineTo(ax + aw, ay + ah); g.fill();
  // monster
  if (img) {                            // illustration fills the art panel (cover-fit, centred)
    const k = Math.max(aw / img.width, ah / img.height), dw = img.width * k, dh = img.height * k;
    g.drawImage(img, ax + (aw - dw) / 2, ay + (ah - dh) / 2, dw, dh);
  } else {
    g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 30; g.shadowOffsetY = 14;
    g.font = `300px ${EMOJI}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(card.monster, W / 2, ay + ah * 0.5);
  }
  g.restore();
  g.save(); rr(g, ax, ay, aw, ah, 30); g.lineWidth = 5; g.strokeStyle = col; g.stroke(); g.restore();

  // header: monster name + stars
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f3e9d2';
  g.font = `600 34px ${SANS}`; g.fillText(card.name, W / 2, 66);
  g.fillStyle = col; g.font = `34px ${SANS}`;
  g.fillText('★'.repeat(tier + 1), W / 2, ay + ah + 36);

  // 成语
  const chars = [...card.text], size = Math.min(150, 620 / chars.length), gap = size * 1.08;
  g.font = `${size}px ${HANZI}`; g.fillStyle = '#fff6e0';
  g.shadowColor = col; g.shadowBlur = 24; g.shadowOffsetY = 0;
  const x0 = W / 2 - ((chars.length - 1) * gap) / 2;
  chars.forEach((ch, i) => g.fillText(ch, x0 + i * gap, 780));
  g.shadowBlur = 0;

  // divider
  g.strokeStyle = col + '99'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(W / 2 - 150, 868); g.lineTo(W / 2 + 150, 868); g.stroke();
  g.fillStyle = col; g.beginPath(); g.arc(W / 2, 868, 7, 0, 7); g.fill();

  // pinyin + meaning
  g.fillStyle = col; g.font = `italic 42px ${SANS}`; g.fillText(card.pinyin, W / 2, 920);
  g.fillStyle = '#e6dcc4'; g.font = `32px ${SANS}`;
  const lines = wrap(g, card.meaning, W - 150).slice(0, 3);
  lines.forEach((l, i) => g.fillText(l, W / 2, 990 + i * 44));
  g.restore();

  // frame
  rr(g, 8, 8, W - 16, H - 16, 48); g.lineWidth = 14;
  const fg = g.createLinearGradient(0, 0, W, H);
  fg.addColorStop(0, col); fg.addColorStop(0.5, '#ffffffcc'); fg.addColorStop(1, col);
  g.strokeStyle = fg; g.stroke();
  rr(g, 28, 28, W - 56, H - 56, 36); g.lineWidth = 2; g.strokeStyle = col + '77'; g.stroke();
}

export function cardBackTexture(rarity: Rarity): THREE.CanvasTexture {
  const c = canvas(), g = c.getContext('2d')!, col = RARITY_HEX[rarity];
  rr(g, 0, 0, W, H, 54); g.save(); g.clip();
  const bg = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, 700);
  bg.addColorStop(0, '#3b1612'); bg.addColorStop(1, '#14090a'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // seigaiha wave pattern
  g.strokeStyle = 'rgba(224,182,90,.18)'; g.lineWidth = 3;
  for (let y = 40; y < H + 60; y += 36) for (let x = (y / 36) % 2 ? 0 : 36; x < W + 72; x += 72)
    for (let r = 14; r <= 34; r += 10) { g.beginPath(); g.arc(x, y, r, Math.PI, 0); g.stroke(); }
  // seal
  g.fillStyle = 'rgba(12,6,6,.85)'; g.beginPath(); g.arc(W / 2, H / 2, 210, 0, 7); g.fill();
  g.lineWidth = 8; g.strokeStyle = col; g.beginPath(); g.arc(W / 2, H / 2, 210, 0, 7); g.stroke();
  g.lineWidth = 2; g.beginPath(); g.arc(W / 2, H / 2, 192, 0, 7); g.stroke();
  g.fillStyle = '#e0b65a'; g.font = `260px ${HANZI}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = col; g.shadowBlur = 30; g.fillText('成', W / 2, H / 2 + 14);
  g.restore();
  rr(g, 8, 8, W - 16, H - 16, 48); g.lineWidth = 14; g.strokeStyle = col; g.stroke();
  rr(g, 28, 28, W - 56, H - 56, 36); g.lineWidth = 2; g.strokeStyle = '#e0b65a99'; g.stroke();
  return tex(c);
}

export interface PackLook { name?: string; icon?: string; color?: string }
const hexRgb = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mixRgb = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgba = (c: number[], a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** The foil pack: the house crimson by default, or the colour, emoji and name of a custom pack. */
export function packTexture(look: PackLook = {}): THREE.CanvasTexture {
  const c = canvas(), g = c.getContext('2d')!;
  const custom = !!(look.icon || look.color);
  const base = hexRgb(look.color && /^#[0-9a-f]{6}$/i.test(look.color) ? look.color : '#a3261c');
  const mid = custom ? mixRgb(base, [0, 0, 0], 0.32) : [110, 19, 15], low = custom ? mixRgb(base, [0, 0, 0], 0.64) : [58, 9, 8];
  const glow = custom ? mixRgb(base, [255, 190, 90], 0.6) : [255, 190, 90];
  const gold = custom ? rgba(mixRgb(base, [246, 213, 138], 0.78)) : '#f6d58a';
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, rgba(base)); bg.addColorStop(0.5, rgba(mid)); bg.addColorStop(1, rgba(low));
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // waves
  g.strokeStyle = 'rgba(255,210,120,.16)'; g.lineWidth = 3;
  for (let y = 360; y < H + 60; y += 34) for (let x = (y / 34) % 2 ? 0 : 36; x < W + 72; x += 72)
    for (let r = 12; r <= 32; r += 10) { g.beginPath(); g.arc(x, y, r, Math.PI, 0); g.stroke(); }
  // glow behind the emblem
  const rg = g.createRadialGradient(W / 2, 470, 10, W / 2, 470, 340);
  rg.addColorStop(0, rgba(glow, 0.55)); rg.addColorStop(1, rgba(glow, 0));
  g.fillStyle = rg; g.fillRect(0, 100, W, 760);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = rgba(glow); g.shadowBlur = 40;
  if (look.icon) { g.font = `300px ${EMOJI}`; g.fillText(look.icon, W / 2, 470); }
  else { g.font = `420px ${HANZI}`; g.fillStyle = gold; g.fillText('妖', W / 2, 480); }
  g.shadowBlur = 0;
  // title: the pack's name, shrunk to fit the pack
  const title = (look.name && look.name.trim()) || '成语', cjk = /[\u3400-\u9fff]/.test(title);
  let size = cjk ? 110 : 92; const face = (s: number) => (cjk ? `${s}px ${HANZI}` : `700 ${s}px ${SANS}`);
  g.font = face(size); while (g.measureText(title).width > 600 && size > 34) { size -= 4; g.font = face(size); }
  g.fillStyle = gold; g.fillText(title, W / 2, 760);
  g.font = `600 34px ${SANS}`; g.fillText(custom ? 'C A R D   P A C K' : 'M O N S T E R   P A C K', W / 2, 860);
  g.font = `28px ${SANS}`; g.fillStyle = custom ? gold : 'rgba(246,213,138,.7)'; g.fillText(custom ? '1 CARD' : '1 CARD · DAILY', W / 2, 912);
  // border
  g.strokeStyle = gold; g.lineWidth = 8; g.strokeRect(40, 150, W - 80, H - 300);
  g.lineWidth = 2; g.strokeRect(58, 168, W - 116, H - 336);
  // crimped edges
  g.fillStyle = 'rgba(0,0,0,.28)';
  g.fillRect(0, 0, W, 100); g.fillRect(0, H - 100, W, 100);
  g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 3;
  for (let x = 0; x < W; x += 12) {
    g.beginPath(); g.moveTo(x, 6); g.lineTo(x, 94); g.stroke();
    g.beginPath(); g.moveTo(x, H - 94); g.lineTo(x, H - 6); g.stroke();
  }
  return tex(c);
}

export function spriteTexture(): THREE.CanvasTexture {
  const c = canvas(64, 64), g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,.6)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
