import { describe, expect, it } from 'vitest';
import '../../tools/workshop/sprite-cutter.js';

type Rgba = Uint8ClampedArray;
interface Box { x0: number; y0: number; x1: number; y1: number; label: number; pixels: number }
const SC = (globalThis as unknown as { SpriteCutter: {
  estimateBackground(d: Rgba, w: number, h: number): { transparent: boolean; colors: number[][] };
  removeBackground(d: Rgba, w: number, h: number, o: { colors: number[][]; tolerance: number; inside?: boolean }): Rgba;
  findSprites(d: Rgba, w: number, h: number, o: { gap?: number; minSize?: number }): { boxes: Box[]; cell: number; cw: number; lab: Int32Array };
  cropSprite(d: Rgba, w: number, h: number, box: Box, found: unknown, pad?: number): { rgba: Rgba; w: number; h: number };
} }).SpriteCutter;

/** A tiny canvas: fill with a background, then paint rectangles. */
function sheet(w: number, h: number, bg: number[]) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { d[i * 4] = bg[0]; d[i * 4 + 1] = bg[1]; d[i * 4 + 2] = bg[2]; d[i * 4 + 3] = 255; }
  const rect = (x0: number, y0: number, x1: number, y1: number, c: number[]) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; }
  };
  return { d, w, h, rect, alpha: (x: number, y: number) => d[(y * w + x) * 4 + 3] };
}
const BG = [238, 228, 214];

describe('background detection and removal', () => {
  it('finds a plain background colour from the border', () => {
    const s = sheet(120, 60, BG); s.rect(30, 20, 50, 40, [200, 40, 40]);
    const bg = SC.estimateBackground(s.d, s.w, s.h);
    expect(bg.transparent).toBe(false);
    expect(bg.colors).toHaveLength(1);
    expect(bg.colors[0]).toEqual(BG);
  });

  it('notices a picture that is already transparent', () => {
    const s = sheet(40, 40, BG); for (let i = 0; i < 40 * 40; i++) s.d[i * 4 + 3] = 0; s.rect(10, 10, 20, 20, [1, 2, 3]);
    expect(SC.estimateBackground(s.d, s.w, s.h).transparent).toBe(true);
  });

  it('finds both colours of a fake checkerboard "transparent" background', () => {
    const s = sheet(80, 80, [255, 255, 255]);
    for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) if (((x >> 3) + (y >> 3)) % 2) { const i = (y * 80 + x) * 4; s.d[i] = s.d[i + 1] = s.d[i + 2] = 200; }
    s.rect(30, 30, 50, 50, [180, 40, 40]);
    const bg = SC.estimateBackground(s.d, s.w, s.h);
    expect(bg.colors).toHaveLength(2);
    const out = SC.removeBackground(s.d, s.w, s.h, { colors: bg.colors, tolerance: 30 });
    expect(out[(5 * 80 + 5) * 4 + 3]).toBe(0); expect(out[(5 * 80 + 12) * 4 + 3]).toBe(0);          // both checker colours gone
    expect(out[(40 * 80 + 40) * 4 + 3]).toBe(255);                                                // the sprite stays
  });

  it('removes the outside background but keeps matching colour enclosed inside a sprite (like white eyes)', () => {
    const s = sheet(100, 100, BG); s.rect(20, 20, 79, 79, [60, 120, 200]); s.rect(45, 45, 54, 54, BG);   // a hole the same colour as the background
    const bg = SC.estimateBackground(s.d, s.w, s.h);
    const kept = SC.removeBackground(s.d, s.w, s.h, { colors: bg.colors, tolerance: 30 });
    expect(kept[(5 * 100 + 5) * 4 + 3]).toBe(0);
    expect(kept[(50 * 100 + 50) * 4 + 3]).toBe(255);                                              // the "eye" is kept
    const gone = SC.removeBackground(s.d, s.w, s.h, { colors: bg.colors, tolerance: 30, inside: true });
    expect(gone[(50 * 100 + 50) * 4 + 3]).toBe(0);                                                // unless asked to remove it everywhere
  });

  it('tolerance decides how close a colour must be to count as background', () => {
    const s = sheet(60, 60, BG); s.rect(20, 20, 40, 40, [226, 216, 202]);                         // a very faint shape, 12 off the background
    const bg = SC.estimateBackground(s.d, s.w, s.h);
    expect(SC.removeBackground(s.d, s.w, s.h, { colors: bg.colors, tolerance: 40 })[(30 * 60 + 30) * 4 + 3]).toBe(0);
    expect(SC.removeBackground(s.d, s.w, s.h, { colors: bg.colors, tolerance: 5 })[(30 * 60 + 30) * 4 + 3]).toBe(255);
  });

  it('softens the edge so no background-coloured halo is left behind', () => {
    const s = sheet(60, 60, [255, 255, 255]); s.rect(20, 20, 39, 39, [0, 0, 0]);
    for (let x = 20; x < 40; x++) { const i = (19 * 60 + x) * 4; s.d[i] = s.d[i + 1] = s.d[i + 2] = 128; }     // one row of antialiasing grey
    const bg = SC.estimateBackground(s.d, s.w, s.h), out = SC.removeBackground(s.d, s.w, s.h, { colors: bg.colors, tolerance: 30 });
    const i = (19 * 60 + 30) * 4;
    expect(out[i + 3]).toBeGreaterThan(0); expect(out[i + 3]).toBeLessThan(255);                // partly see-through
    expect(out[i]).toBeLessThan(128);                                                            // and darker than it was: the white tint is taken out
  });
});

describe('finding the sprites on a sheet', () => {
  const four = () => {
    const s = sheet(400, 220, BG);
    s.rect(20, 20, 80, 90, [200, 50, 50]); s.rect(150, 25, 230, 85, [50, 160, 70]);                // top row
    s.rect(30, 130, 100, 200, [60, 90, 200]); s.rect(250, 120, 340, 195, [220, 170, 40]);          // bottom row
    return s;
  };
  const cut = (s: ReturnType<typeof sheet>, o: { tolerance?: number; gap?: number; minSize?: number } = {}) => {
    const bg = SC.estimateBackground(s.d, s.w, s.h);
    const clean = SC.removeBackground(s.d, s.w, s.h, { colors: bg.colors, tolerance: o.tolerance ?? 30 });
    return { clean, found: SC.findSprites(clean, s.w, s.h, { gap: o.gap, minSize: o.minSize }) };
  };

  it('finds four sprites in reading order with tight boxes', () => {
    const { found } = cut(four());
    expect(found.boxes).toHaveLength(4);
    const spot = found.boxes.map(b => [b.x0, b.y0, b.x1, b.y1]);
    expect(spot).toEqual([[20, 20, 80, 90], [150, 25, 230, 85], [30, 130, 100, 200], [250, 120, 340, 195]]);
  });

  it('cuts each sprite out on a transparent background, trimmed, with a little padding', () => {
    const s = four(), { clean, found } = cut(s);
    const sp = SC.cropSprite(clean, s.w, s.h, found.boxes[0], found, 2);
    expect(sp.w).toBe(61 + 4); expect(sp.h).toBe(71 + 4);
    expect(sp.rgba[3]).toBe(0);                                                                     // the padding corner is see-through
    const mid = ((sp.h >> 1) * sp.w + (sp.w >> 1)) * 4;
    expect([sp.rgba[mid], sp.rgba[mid + 1], sp.rgba[mid + 2], sp.rgba[mid + 3]]).toEqual([200, 50, 50, 255]);
  });

  it('keeps a sprite with a detached piece together when the join distance covers the gap, and splits it when not', () => {
    const s = sheet(300, 120, BG); s.rect(20, 30, 90, 100, [200, 50, 50]); s.rect(100, 40, 110, 50, [250, 220, 60]);   // a sparkle 9px away
    expect(cut(s, { gap: 16 }).found.boxes).toHaveLength(1);
    expect(cut(s, { gap: 0, minSize: 8 }).found.boxes).toHaveLength(2);
  });

  it('ignores specks smaller than the minimum size', () => {
    const s = four(); s.rect(300, 20, 303, 23, [90, 90, 90]);                                       // a 4px speck of dust
    expect(cut(s, { minSize: 10 }).found.boxes).toHaveLength(4);
    expect(cut(s, { minSize: 2 }).found.boxes).toHaveLength(5);
  });

  it('a cut never includes pixels from a neighbouring sprite that overlaps its box', () => {
    const s = sheet(200, 100, BG); s.rect(10, 10, 90, 90, [200, 50, 50]); s.rect(95, 40, 190, 60, [50, 160, 70]);   // the green one is close, but separate
    const { clean, found } = cut(s, { gap: 0 });
    expect(found.boxes).toHaveLength(2);
    const sp = SC.cropSprite(clean, s.w, s.h, found.boxes[0], found, 0);
    expect(sp.w).toBe(81);                                                                          // only the red one's width
  });

  it('a hand-drawn box (label 0) copies everything inside the rectangle', () => {
    const s = four(), { clean } = cut(s);
    const sp = SC.cropSprite(clean, s.w, s.h, { x0: 0, y0: 0, x1: 399, y1: 110, label: 0, pixels: 0 }, null, 0);
    expect(sp.w).toBe(230 - 20 + 1);                                                                // the red and green sprites together
  });

  it('copes with a sheet that has no sprites, and with huge ones quickly', () => {
    const empty = sheet(50, 50, BG), r = cut(empty);
    expect(r.found.boxes).toHaveLength(0);
    const big = sheet(2400, 1600, BG); big.rect(100, 100, 400, 400, [10, 10, 200]); big.rect(900, 700, 1300, 1100, [10, 200, 10]);
    const t0 = Date.now(), b = cut(big);
    expect(b.found.boxes).toHaveLength(2); expect(Date.now() - t0).toBeLessThan(5000);
  });
});
