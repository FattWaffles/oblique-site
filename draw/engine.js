/* Oblique pattern generator, version 1 (2026-10-25). The engine: no page code, so oblique.so/draw and the tile script
   (Tools-Universal/pattern-generator/make_tiles.mjs) draw the same thing from the same settings.

   Geometry comes from logo v2 (Oblique Logo/V2 golden ratio/logo-v2/README.md and logo-shapeshift.js):
   - the front face leans 20 degrees (tan 20 = 0.36397, the logo's K);
   - the depth recedes up and to the right at 36 degrees (the logo's depth vector 298.388 by -216.793);
   - the depth rises 1/phi of the front face height (logo: 216.793 / 348.173 = 0.6227, within 1 percent).
   Proportions come from golden-ratio-design (examples/oblique.golden.json):
   - columns on the Fibonacci run 2, 3, 5, 8, 13; cells split at 0.618 and 0.382 of their long side;
   - outline and hatch weights on the stroke run 1, 1.618, 2.618, 4.236, 6.854, 11.09 (one step apart);
   - hatch lines one stroke step under the outline, spaced so the faces read as a golden tone ladder:
     side 0.382 ink, top 0.236, front 0.146 (hatch width over spacing);
   - motif margin 1/phi^4 of the leaf's short side, each box seated on its leaf's bottom-left corner;
   - at least one box per tile: if every leaf comes out empty, the largest leaf gets one.
   Joins: miter capped at phi. The box's obtuse corners (110, 144, 146 degrees) stay mitred; the acute ones (34, 36, 70) bevel instead of spiking.
   Every motif stays inside its own cell, so every tile repeats without a seam. */

export const VERSION = '1.0.0';
export const PHI = (1 + Math.sqrt(5)) / 2;
export const SIZE = 1000;

const LEAN = Math.tan(20 * Math.PI / 180);
const T36 = Math.tan(36 * Math.PI / 180);
const DEPTH = 1 / PHI;
const DIR_FRONT = [1, 0];
const DIR_TOP = [Math.cos(36 * Math.PI / 180), -Math.sin(36 * Math.PI / 180)];
const DIR_SIDE = [Math.sin(20 * Math.PI / 180), -Math.cos(20 * Math.PI / 180)];

export const COLUMNS = [2, 3, 5, 8, 13];
export const DENSITIES = [0.146, 0.236, 0.382, 0.618, 1];
const OUTLINE = { 2: 11.09, 3: 6.854, 5: 4.236, 8: 2.618, 13: 1.618 };
const HATCH = { 2: 6.854, 3: 4.236, 5: 2.618, 8: 1.618, 13: 1 };
const RATIOS = [1 / PHI, 1, PHI, PHI * PHI, PHI * PHI * PHI];

/* The palette (04_Graphic_Assets/oblique-palette.svg): mostly white; blue, red and orange in small doses; yellow left out. */
export const GROUNDS = {
  paper: { label: 'Paper', ground: '#FFFFFF', line: '#0E0E14' },
  frost: { label: 'Frost', ground: '#F2F2EF', line: '#0E0E14' },
  ink: { label: 'Ink', ground: '#0E0E14', line: '#FFFFFF' },
  blue: { label: 'Blue', ground: '#1F2BFF', line: '#FFFFFF' },
};
export const ACCENTS = {
  none: { label: 'None', colour: null },
  red: { label: 'Red', colour: '#E8262B' },
  orange: { label: 'Orange', colour: '#FF8A1E' },
};
export const MAX_SEED = 999999;
export const DEFAULTS = { seed: 1618, columns: 5, density: 0.618, ground: 'paper', accent: 'red' };

/* mulberry32: a small seeded generator. One seed always gives the same drawing. */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clean(p) {
  const q = Object.assign({}, DEFAULTS, p || {});
  q.seed = Math.min(MAX_SEED, Math.max(1, Math.round(Number(q.seed)) || DEFAULTS.seed));
  q.columns = COLUMNS.includes(Number(q.columns)) ? Number(q.columns) : DEFAULTS.columns;
  q.density = DENSITIES.includes(Number(q.density)) ? Number(q.density) : DEFAULTS.density;
  q.ground = Object.hasOwn(GROUNDS, q.ground) ? q.ground : DEFAULTS.ground;
  q.accent = Object.hasOwn(ACCENTS, q.accent) ? q.accent : DEFAULTS.accent;
  return q;
}

/* The grid: n by n square cells, each split at the golden section of its long side, deeper when density is higher. */
function layout(p, R) {
  const cell = SIZE / p.columns;
  const minSide = cell * 0.236;
  const out = [];
  function split(x, y, w, h, depth) {
    const chance = depth >= 3 ? 0 : p.density * Math.pow(1 / PHI, depth);
    const roll = R();
    const along = w > h * 1.001 ? 'x' : h > w * 1.001 ? 'y' : (R() < 0.5 ? 'x' : 'y');
    const share = R() < 0.5 ? 1 / PHI : 1 / (PHI * PHI);
    const long = along === 'x' ? w : h;
    const short = along === 'x' ? h : w;
    if (roll < chance && Math.min(long * (1 - 1 / PHI), short) >= minSide) {
      const a = long * share;
      if (along === 'x') { split(x, y, a, h, depth + 1); split(x + a, y, w - a, h, depth + 1); }
      else { split(x, y, w, a, depth + 1); split(x, y + a, w, h - a, depth + 1); }
    } else {
      out.push({ x, y, w, h });
    }
  }
  for (let j = 0; j < p.columns; j++) for (let i = 0; i < p.columns; i++) split(i * cell, j * cell, cell, cell, 0);
  return out;
}

const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const lerp2 = (o, u, v, s, t) => [o[0] + u[0] * s + v[0] * t, o[1] + u[1] * s + v[1] * t];

/* One box in a leaf: the widest front face (a golden ratio of its height) that fits with the lean and the depth. */
function box(leaf, R, outline) {
  const m = Math.min(leaf.w, leaf.h) / Math.pow(PHI, 4);
  const aw = leaf.w - 2 * m, ah = leaf.h - 2 * m;
  const kx = LEAN + DEPTH / T36;
  const fits = RATIOS.map(q => {
    const hf = Math.min(ah / (1 + DEPTH), aw / (q + kx));
    return { q, hf, area: q * hf * hf };
  }).sort((a, b) => b.area - a.area).filter(fit => fit.hf >= outline * Math.pow(PHI, 4));
  if (!fits.length) return null;
  const pick = R() < 1 / PHI ? fits[0] : (fits[1] || fits[0]);
  const { q, hf } = pick;
  const W = hf * (q + kx), H = hf * (1 + DEPTH);
  const ox = leaf.x + m, oy = leaf.y + leaf.h - m - H;
  const BL = [ox, oy + H], BR = [ox + q * hf, oy + H];
  const TL = [ox + LEAN * hf, oy + H - hf], TR = [TL[0] + q * hf, TL[1]];
  const D = [DEPTH * hf / T36, -DEPTH * hf];
  return {
    hf, wf: q * hf,
    front: [BL, BR, TR, TL],
    top: [TL, TR, add(TR, D), add(TL, D)],
    side: [TR, BR, add(BR, D), add(TR, D)],
  };
}

/* Parallel lines across a convex face, phase-locked to the page so neighbouring faces line up. */
function hatch(poly, dir, spacing, inset) {
  const n = [-dir[1], dir[0]];
  const dots = poly.map(pt => pt[0] * n[0] + pt[1] * n[1]);
  const lo = Math.min(...dots) + inset, hi = Math.max(...dots) - inset;
  const segs = [];
  for (let c = Math.ceil(lo / spacing) * spacing; c <= hi; c += spacing) {
    const hits = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const fa = dots[i] - c, fb = dots[(i + 1) % poly.length] - c;
      if ((fa < 0 && fb >= 0) || (fa >= 0 && fb < 0)) {
        const t = fa / (fa - fb);
        hits.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    if (hits.length < 2) continue;
    hits.sort((u, v) => (u[0] * dir[0] + u[1] * dir[1]) - (v[0] * dir[0] + v[1] * dir[1]));
    const s = hits[0], e = hits[hits.length - 1];
    const len = Math.hypot(e[0] - s[0], e[1] - s[1]);
    if (len > inset * 2) segs.push([s, e]);
  }
  return segs;
}

const f = v => String(Math.round(v * 100) / 100);
const poly = pts => 'M' + pts.map(pt => f(pt[0]) + ' ' + f(pt[1])).join('L') + 'Z';
const lines = segs => segs.map(s => 'M' + f(s[0][0]) + ' ' + f(s[0][1]) + 'L' + f(s[1][0]) + ' ' + f(s[1][1])).join('');

/* Four ways to draw a box, picked per motif by the seed. */
const STYLES = [
  { name: 'solid', weight: 0.236 },
  { name: 'engraved', weight: 0.382 },
  { name: 'line', weight: 0.236 },
  { name: 'screen', weight: 0.146 },
];
function pickStyle(R) {
  let r = R() * STYLES.reduce((s, x) => s + x.weight, 0);
  for (const s of STYLES) { if ((r -= s.weight) < 0) return s.name; }
  return STYLES[0].name;
}

function motif(b, style, o, h) {
  const fills = [], outlines = [], hatches = [];
  const top = hatch(b.top, DIR_TOP, h * Math.pow(PHI, 3), o / 2);
  const side = hatch(b.side, DIR_SIDE, h * PHI * PHI, o / 2);
  if (style === 'solid') {
    fills.push(b.front);
    outlines.push(b.front, b.top, b.side);
    hatches.push(...top, ...side);
  } else if (style === 'engraved') {
    outlines.push(b.front, b.top, b.side);
    hatches.push(...hatch(b.front, DIR_FRONT, h * Math.pow(PHI, 4), o / 2), ...top, ...side);
  } else if (style === 'line') {
    outlines.push(b.front, b.top, b.side);
  } else {
    const [BL, BR, , TL] = b.front;
    const u = [BR[0] - BL[0], BR[1] - BL[1]], v = [TL[0] - BL[0], TL[1] - BL[1]];
    const inset = b.hf / Math.pow(PHI, 4);
    const su = inset / b.wf, sv = inset / b.hf;
    const screen = [lerp2(BL, u, v, su, sv), lerp2(BL, u, v, 1 - su, sv), lerp2(BL, u, v, 1 - su, 1 - sv), lerp2(BL, u, v, su, 1 - sv)];
    outlines.push(b.front, b.top, b.side, screen);
    hatches.push(...side);
  }
  return { fills, outlines, hatches };
}

/* Settings to an SVG string. opts.px sets the width and height attributes; opts.transparent leaves the ground out. */
export function render(input, opts) {
  const p = clean(input);
  const o = opts || {};
  const R = rng(p.seed);
  const G = GROUNDS[p.ground];
  const accent = ACCENTS[p.accent].colour;
  const outline = OUTLINE[p.columns], hatchW = HATCH[p.columns];
  const leaves = layout(p, R);
  const motifs = [];
  for (const leaf of leaves) {
    const empty = R() < (1 - p.density) / PHI;
    const style = pickStyle(R);
    const takeSecond = R();
    if (empty) continue;
    const b = box(leaf, () => takeSecond, outline);
    if (!b) continue;
    motifs.push(motif(b, style, outline, hatchW));
  }
  if (!motifs.length) {
    const big = leaves.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0];
    const b = box(big, () => 0, outline);
    if (b) motifs.push(motif(b, 'engraved', outline, hatchW));
  }
  const accentAt = accent && motifs.length ? Math.floor(rng(p.seed ^ 0x5bd1e995)() * motifs.length) : -1;
  const px = o.px || SIZE;
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${px}" height="${px}">`);
  out.push(`<title>Oblique pattern, seed ${p.seed}</title>`);
  out.push(`<desc>${describe(p)}. Oblique pattern generator ${VERSION}. Repeats without a seam.</desc>`);
  if (!o.transparent) out.push(`<rect width="${SIZE}" height="${SIZE}" fill="${G.ground}"/>`);
  out.push(`<g fill="none" stroke="${G.line}" stroke-linejoin="miter" stroke-miterlimit="1.618" stroke-linecap="butt">`);
  motifs.forEach((m, i) => {
    const colour = i === accentAt ? accent : G.line;
    const attr = i === accentAt ? ` stroke="${colour}"` : '';
    out.push(`<g${attr}>`);
    if (m.fills.length) out.push(`<path d="${m.fills.map(poly).join('')}" fill="${colour}" stroke="none"/>`);
    if (m.hatches.length) out.push(`<path d="${lines(m.hatches)}" stroke-width="${hatchW}"/>`);
    out.push(`<path d="${m.outlines.map(poly).join('')}" stroke-width="${outline}"/>`);
    out.push('</g>');
  });
  out.push('</g></svg>');
  return { svg: out.join(''), count: motifs.length, settings: p };
}

export function describe(input) {
  const p = clean(input);
  const parts = [`Seed ${p.seed}`, `${p.columns} columns`, `density ${p.density}`, `${GROUNDS[p.ground].label.toLowerCase()} background`];
  parts.push(p.accent === 'none' ? 'no accent' : `${ACCENTS[p.accent].label.toLowerCase()} accent`);
  return parts.join(', ');
}

export function fileName(input, ext) {
  const p = clean(input);
  return `oblique-pattern-s${p.seed}-c${p.columns}-d${String(p.density).replace('.', '')}-${p.ground}${p.accent === 'none' ? '' : '-' + p.accent}.${ext}`;
}
