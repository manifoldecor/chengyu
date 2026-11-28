/*
 * Sprite cutter: finds the background of a sprite sheet, makes it transparent, and finds each separate sprite.
 * Plain functions on RGBA pixel arrays (no DOM), so the same file runs inside the Card Workshop page and in the tests.
 *
 *   estimateBackground(rgba, w, h)            -> { transparent, colors: [[r,g,b], ...] }
 *   removeBackground(rgba, w, h, opts)        -> new RGBA with the background transparent (edges softened)
 *   findSprites(rgba, w, h, { gap, minSize }) -> { boxes, cell, cw, lab }  (reading order)
 *   cropSprite(rgba, w, h, box, found, pad)   -> { rgba, w, h } just that sprite, trimmed, on transparency
 */
(function (root) {
  'use strict';

  var dist = function (r1, g1, b1, c) { var dr = r1 - c[0], dg = g1 - c[1], db = b1 - c[2]; return Math.sqrt(dr * dr + dg * dg + db * db); };

  /** Look at the picture's border: mostly see-through, or one (or two, for a fake checkerboard) solid colours. */
  function estimateBackground(d, w, h) {
    var buckets = {}, total = 0, clear = 0;
    function visit(x, y) {
      var i = (y * w + x) * 4; total++;
      if (d[i + 3] < 128) { clear++; return; }
      var key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
      var b = buckets[key] || (buckets[key] = { n: 0, r: 0, g: 0, b: 0 });
      b.n++; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2];
    }
    for (var x = 0; x < w; x++) { visit(x, 0); if (h > 1) visit(x, h - 1); }
    for (var y = 1; y < h - 1; y++) { visit(0, y); if (w > 1) visit(w - 1, y); }
    if (clear > total * 0.5) return { transparent: true, colors: [] };
    var list = Object.keys(buckets).map(function (k) { return buckets[k]; }).sort(function (a, b) { return b.n - a.n; });
    if (!list.length) return { transparent: false, colors: [[255, 255, 255]] };
    var colors = [], mean = function (b) { return [Math.round(b.r / b.n), Math.round(b.g / b.n), Math.round(b.b / b.n)]; };
    colors.push(mean(list[0]));
    for (var i = 1; i < list.length && colors.length < 2; i++) {            // a second solid colour that is a big share of the border = a checkerboard
      var c = mean(list[i]);
      if (list[i].n / total >= 0.12 && dist(c[0], c[1], c[2], colors[0]) > 24) colors.push(c);
    }
    return { transparent: false, colors: colors };
  }

  /**
   * Flood-fills the background in from the picture's edges (so colour that is *inside* a sprite is kept, such as white eyes),
   * then softens the edge so there is no halo. opts: { colors, tolerance (0-160), inside (also remove that colour inside shapes) }.
   */
  function removeBackground(d, w, h, opts) {
    var n = w * h, out = new Uint8ClampedArray(d), bg = new Uint8Array(n), tol = opts.tolerance, cols = opts.colors || [];
    function nearest(i) { var best = 1e9, bc = null; for (var k = 0; k < cols.length; k++) { var v = dist(d[i], d[i + 1], d[i + 2], cols[k]); if (v < best) { best = v; bc = cols[k]; } } return { d: best, c: bc }; }
    function isBg(p) { var i = p * 4; if (d[i + 3] < 16) return true; return cols.length > 0 && nearest(i).d <= tol; }
    if (cols.length || true) {
      var stack = new Int32Array(n), sp = 0, p, x, y;
      var seed = function (q) { if (!bg[q] && isBg(q)) { bg[q] = 1; stack[sp++] = q; } };
      for (x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
      for (y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
      while (sp) {
        p = stack[--sp]; x = p % w; y = (p / w) | 0;
        if (x > 0) seed(p - 1); if (x < w - 1) seed(p + 1); if (y > 0) seed(p - w); if (y < h - 1) seed(p + w);
      }
    }
    if (opts.inside) for (var q = 0; q < n; q++) if (!bg[q] && isBg(q)) bg[q] = 1;
    for (var k = 0; k < n; k++) if (bg[k]) out[k * 4 + 3] = 0;
    // Soften the edge. A pixel touching the background is a blend of sprite colour and background colour, so: take the sprite
    // colour from the solid pixels just inside it, work out how much of the pixel is sprite, and make the rest transparent.
    if (cols.length) {
      var edge = new Uint8Array(n), list = [];
      for (var py = 0; py < h; py++) for (var px = 0; px < w; px++) {
        var pi = py * w + px; if (bg[pi]) continue;
        if ((px > 0 && bg[pi - 1]) || (px < w - 1 && bg[pi + 1]) || (py > 0 && bg[pi - w]) || (py < h - 1 && bg[pi + w])) { edge[pi] = 1; list.push(pi); }
      }
      for (var e = 0; e < list.length; e++) {
        var p2 = list[e], i = p2 * 4, ex = p2 % w, ey = (p2 / w) | 0, nn = nearest(i), fr = 0, fg = 0, fb = 0, fn = 0;
        for (var yy = Math.max(0, ey - 2); yy <= Math.min(h - 1, ey + 2); yy++) for (var xx = Math.max(0, ex - 2); xx <= Math.min(w - 1, ex + 2); xx++) {
          var q2 = yy * w + xx; if (bg[q2] || edge[q2]) continue; var j = q2 * 4; fr += d[j]; fg += d[j + 1]; fb += d[j + 2]; fn++;
        }
        if (!fn) continue;
        fr /= fn; fg /= fn; fb /= fn;
        var vr = fr - nn.c[0], vg = fg - nn.c[1], vb = fb - nn.c[2], len2 = vr * vr + vg * vg + vb * vb;
        if (len2 < 100) continue;                                       // sprite colour is about the same as the background: nothing to separate
        var a = ((d[i] - nn.c[0]) * vr + (d[i + 1] - nn.c[1]) * vg + (d[i + 2] - nn.c[2]) * vb) / len2;
        if (a >= 0.92) continue; if (a < 0) a = 0;
        out[i + 3] = Math.round(d[i + 3] * a); out[i] = fr; out[i + 1] = fg; out[i + 2] = fb;
      }
    }
    return out;
  }

  /** Spread each set cell by r cells in every direction (a fast box blur on 0/1 using running sums). */
  function dilate(src, cw, ch, r) {
    if (!r) return src.slice();
    var tmp = new Uint8Array(cw * ch), out = new Uint8Array(cw * ch), pre = new Int32Array(Math.max(cw, ch) + 1), x, y;
    for (y = 0; y < ch; y++) {
      for (x = 0; x < cw; x++) pre[x + 1] = pre[x] + src[y * cw + x];
      for (x = 0; x < cw; x++) tmp[y * cw + x] = pre[Math.min(x + r, cw - 1) + 1] - pre[Math.max(x - r, 0)] > 0 ? 1 : 0;
    }
    for (x = 0; x < cw; x++) {
      for (y = 0; y < ch; y++) pre[y + 1] = pre[y] + tmp[y * cw + x];
      for (y = 0; y < ch; y++) out[y * cw + x] = pre[Math.min(y + r, ch - 1) + 1] - pre[Math.max(y - r, 0)] > 0 ? 1 : 0;
    }
    return out;
  }

  /**
   * Groups the non-transparent pixels into separate sprites. Pieces closer than `gap` pixels belong together (so a sprite
   * with a detached sparkle stays one sprite); specks whose longest side is under `minSize` are ignored.
   */
  function findSprites(d, w, h, o) {
    var gap = o.gap == null ? 6 : o.gap, minSize = o.minSize == null ? 10 : o.minSize;
    var cell = gap <= 3 ? 1 : gap < 8 ? 2 : 4;        // the grouping grid is as fine as the join distance needs, so close-but-separate sprites aren't merged
    var cw = Math.ceil(w / cell), ch = Math.ceil(h / cell), coarse = new Uint8Array(cw * ch), x, y;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 24) coarse[((y / cell) | 0) * cw + ((x / cell) | 0)] = 1;
    var dil = dilate(coarse, cw, ch, Math.round(gap / cell)), lab = new Int32Array(cw * ch), count = 0, queue = new Int32Array(cw * ch);
    for (var s = 0; s < dil.length; s++) {
      if (!dil[s] || lab[s]) continue;
      count++; var qh = 0, qt = 0; queue[qt++] = s; lab[s] = count;
      while (qh < qt) {
        var c = queue[qh++], cx = c % cw, cy = (c / cw) | 0;
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          var nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
          var nq = ny * cw + nx; if (dil[nq] && !lab[nq]) { lab[nq] = count; queue[qt++] = nq; }
        }
      }
    }
    var boxes = []; for (var k = 1; k <= count; k++) boxes[k] = { x0: w, y0: h, x1: -1, y1: -1, pixels: 0, label: k };
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] <= 24) continue;
      var b = boxes[lab[((y / cell) | 0) * cw + ((x / cell) | 0)]];
      if (x < b.x0) b.x0 = x; if (y < b.y0) b.y0 = y; if (x > b.x1) b.x1 = x; if (y > b.y1) b.y1 = y; b.pixels++;
    }
    var list = boxes.filter(function (b) { return b && b.x1 >= 0 && Math.max(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1) >= minSize && b.pixels >= minSize; });
    // reading order: rows from the top, left to right within a row
    list.sort(function (a, b) { return a.y0 - b.y0; });
    var rows = [];
    list.forEach(function (b) {
      var cy = (b.y0 + b.y1) / 2, hh = b.y1 - b.y0 + 1, row = null;
      for (var r = 0; r < rows.length; r++) if (Math.abs(cy - rows[r].cy) < Math.max(hh, rows[r].h) * 0.5) { row = rows[r]; break; }
      if (!row) rows.push(row = { cy: cy, h: hh, items: [] });
      row.items.push(b);
    });
    var ordered = []; rows.forEach(function (r) { r.items.sort(function (a, b) { return a.x0 - b.x0; }); ordered = ordered.concat(r.items); });
    return { boxes: ordered, cell: cell, cw: cw, lab: lab };
  }

  /** Cuts one sprite out. Auto-detected boxes copy only their own pieces; hand-drawn boxes (label 0) copy everything inside. */
  function cropSprite(d, w, h, box, found, pad) {
    pad = pad == null ? 2 : pad;
    var x0 = Math.max(0, Math.floor(box.x0)), y0 = Math.max(0, Math.floor(box.y0)), x1 = Math.min(w - 1, Math.ceil(box.x1)), y1 = Math.min(h - 1, Math.ceil(box.y1));
    var bw = x1 - x0 + 1, bh = y1 - y0 + 1; if (bw < 1 || bh < 1) return { rgba: new Uint8ClampedArray(4), w: 1, h: 1 };
    var tmp = new Uint8ClampedArray(bw * bh * 4), minX = bw, minY = bh, maxX = -1, maxY = -1;
    for (var y = 0; y < bh; y++) for (var x = 0; x < bw; x++) {
      var si = ((y0 + y) * w + (x0 + x)) * 4; if (d[si + 3] === 0) continue;
      if (box.label > 0 && found && found.lab[(((y0 + y) / found.cell) | 0) * found.cw + (((x0 + x) / found.cell) | 0)] !== box.label) continue;
      var di = (y * bw + x) * 4; tmp[di] = d[si]; tmp[di + 1] = d[si + 1]; tmp[di + 2] = d[si + 2]; tmp[di + 3] = d[si + 3];
      if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    }
    if (maxX < 0) return { rgba: new Uint8ClampedArray(4), w: 1, h: 1 };           // nothing visible in this box
    var ow = maxX - minX + 1 + pad * 2, oh = maxY - minY + 1 + pad * 2, out = new Uint8ClampedArray(ow * oh * 4);
    for (var yy = minY; yy <= maxY; yy++) for (var xx = minX; xx <= maxX; xx++) {
      var a = (yy * bw + xx) * 4, b = ((yy - minY + pad) * ow + (xx - minX + pad)) * 4;
      out[b] = tmp[a]; out[b + 1] = tmp[a + 1]; out[b + 2] = tmp[a + 2]; out[b + 3] = tmp[a + 3];
    }
    return { rgba: out, w: ow, h: oh };
  }

  root.SpriteCutter = { estimateBackground: estimateBackground, removeBackground: removeBackground, findSprites: findSprites, cropSprite: cropSprite };
})(typeof window !== 'undefined' ? window : globalThis);
