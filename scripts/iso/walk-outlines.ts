/**
 * The walks on the city map, before one is chosen (components/walk-outlines.tsx):
 * each walk's ground drawn round with an outline — the streets it takes and
 * the blocks between, its bays filled in so it reads as a district rather
 * than a path — and a label tagged to the outline: the walk's travel label
 * (the Tours page's, scripts/build-print-art.ts), its number and its name on
 * a paper slip, on a fine line down to the outline.
 *
 * Each label is pinned where it covers least — of the other labels, the other
 * walks' outlines and the landmarks' pins — as the map opens (app/map.tsx,
 * OPENING_ZOOM); further out, the map leaves out those that collide.
 *
 *   npx tsx scripts/iso/walk-outlines.ts
 *     → lib/walk-outlines.generated.ts, components/walk-labels.generated.ts,
 *       assets/map/walks/<id>.png (@2x, @3x)
 */
import fs from "node:fs";
import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import sharp from "sharp";

import { WALK_LABEL_SVG } from "../../components/print-art.generated";
import { landmarks } from "../../data/landmarks";
import { tours, type Tour } from "../../data/tours";
import { iso, toLatLon, toLocal } from "../../lib/iso";
import { terraceLevel } from "../../lib/iso-map";
import { ISO_TERRAIN } from "../../lib/iso-terrain.generated";

const OUT_DIR = "assets/map/walks";
const DATA = "lib/walk-outlines.generated.ts";
const MODULE = "components/walk-labels.generated.ts";

/** The outline's grid, metres. */
const CELL = 5;
/** How far the outline runs either side of the way and round each stop, metres. */
const REACH = 60;
/** Bays narrower than about twice this are filled in, and corners rounded as wide. */
const CLOSE = 220;

/** The zoom the labels are placed for: the city map's opening one (app/map.tsx). */
const PLACE_ZOOM = 14.6;
const PT_PER_M = (512 * 2 ** PLACE_ZOOM) / 40075016.686;

// ── The outline ────────────────────────────────────────────────────────

type UV = [number, number];

/** Squared distance, in cells, from each cell of a grid to the nearest set one (Felzenszwalb & Huttenlocher). */
function edt(set: Uint8Array, cols: number, rows: number): Float64Array {
  const INF = 1e20;
  const d = new Float64Array(cols * rows);
  for (let i = 0; i < d.length; i++) d[i] = set[i] ? 0 : INF;
  const n = Math.max(cols, rows);
  const f = new Float64Array(n);
  const out = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const pass = (len: number) => {
    let k = 0;
    v[0] = 0;
    z[0] = -Infinity;
    z[1] = Infinity;
    for (let q = 1; q < len; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      out[q] = (q - v[k]) ** 2 + f[v[k]];
    }
  };
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) f[r] = d[r * cols + c];
    pass(rows);
    for (let r = 0; r < rows; r++) d[r * cols + c] = out[r];
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) f[c] = d[r * cols + c];
    pass(cols);
    for (let c = 0; c < cols; c++) d[r * cols + c] = out[c];
  }
  return d;
}

/** The rings where a field on a grid crosses nought (marching squares), in grid units. */
function contours(h: Float64Array, cols: number, rows: number): UV[][] {
  const at = (c: number, r: number) => h[r * cols + c];
  const pts = new Map<string, UV>();
  const links = new Map<string, string[]>();
  const point = (key: string, c0: number, r0: number, c1: number, r1: number) => {
    if (!pts.has(key)) {
      const [a, b] = [at(c0, r0), at(c1, r1)];
      const t = a / (a - b);
      pts.set(key, [c0 + (c1 - c0) * t, r0 + (r1 - r0) * t]);
    }
    return key;
  };
  const link = (a: string, b: string) => {
    (links.get(a) ?? links.set(a, []).get(a)!).push(b);
    (links.get(b) ?? links.set(b, []).get(b)!).push(a);
  };
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const [a, b, cc, d] = [at(c, r) > 0, at(c + 1, r) > 0, at(c + 1, r + 1) > 0, at(c, r + 1) > 0];
      const edges = {
        bottom: a !== b ? point(`h${c},${r}`, c, r, c + 1, r) : null,
        right: b !== cc ? point(`v${c + 1},${r}`, c + 1, r, c + 1, r + 1) : null,
        top: cc !== d ? point(`h${c},${r + 1}`, c, r + 1, c + 1, r + 1) : null,
        left: d !== a ? point(`v${c},${r}`, c, r, c, r + 1) : null,
      };
      const crossed = Object.values(edges).filter((e): e is string => e !== null);
      if (crossed.length === 2) link(crossed[0], crossed[1]);
      else if (crossed.length === 4) {
        // A saddle: the corners unlike the middle are cut off on their own.
        const mid = (at(c, r) + at(c + 1, r) + at(c + 1, r + 1) + at(c, r + 1)) / 4 > 0;
        const corners: [boolean, string, string][] = [
          [a, edges.bottom!, edges.left!],
          [b, edges.bottom!, edges.right!],
          [cc, edges.right!, edges.top!],
          [d, edges.top!, edges.left!],
        ];
        for (const [inside, e0, e1] of corners) if (inside !== mid) link(e0, e1);
      }
    }
  }
  const rings: UV[][] = [];
  const seen = new Set<string>();
  for (const start of links.keys()) {
    if (seen.has(start)) continue;
    const ring: UV[] = [];
    let [prev, cur] = ["", start];
    while (!seen.has(cur)) {
      seen.add(cur);
      ring.push(pts.get(cur)!);
      const next = links.get(cur)!.find((k) => k !== prev && !seen.has(k)) ?? links.get(cur)!.find((k) => k !== prev);
      if (!next) break;
      [prev, cur] = [cur, next];
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}

const signedArea = (r: UV[]) => r.reduce((s, [x0, y0], i) => {
  const [x1, y1] = r[(i + 1) % r.length];
  return s + x0 * y1 - x1 * y0;
}, 0) / 2;

const inRing = ([x, y]: UV, r: UV[]) => {
  let n = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [[xi, yi], [xj, yj]] = [r[i], r[j]];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) n = !n;
  }
  return n;
};

/** A closed ring rounded off (Chaikin's corner cutting). */
function chaikin(r: UV[], times: number): UV[] {
  let out = r;
  for (let t = 0; t < times; t++) {
    const next: UV[] = [];
    for (let i = 0; i < out.length; i++) {
      const [a, b] = [out[i], out[(i + 1) % out.length]];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    out = next;
  }
  return out;
}

/** A line with the points it can do without, to within `tol`, left out (Douglas–Peucker). */
function simplify(line: UV[], tol: number): UV[] {
  if (line.length < 3) return line;
  const [a, b] = [line[0], line[line.length - 1]];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  let [far, at] = [0, 0];
  for (let i = 1; i < line.length - 1; i++) {
    const d = Math.abs((b[0] - a[0]) * (a[1] - line[i][1]) - (a[0] - line[i][0]) * (b[1] - a[1])) / len;
    if (d > far) [far, at] = [d, i];
  }
  if (far <= tol) return [a, b];
  return [...simplify(line.slice(0, at + 1), tol).slice(0, -1), ...simplify(line.slice(at), tol)];
}

/** The ground a walk covers: where it goes, as local metres. */
function ground(tour: Tour): UV[] {
  const pts: UV[] = [];
  const route = tour.routeCoordinates.map((c) => toLocal(c.latitude, c.longitude));
  for (let i = 0; i < route.length; i++) {
    const a = route[i];
    const b = route[i + 1] ?? a;
    const n = Math.max(1, Math.ceil(Math.hypot(b.u - a.u, b.v - a.v) / 2.5));
    for (let k = 0; k < n; k++) pts.push([a.u + ((b.u - a.u) * k) / n, a.v + ((b.v - a.v) * k) / n]);
  }
  for (const s of tour.stops) {
    const l = landmarks.find((x) => x.id === s.landmarkId);
    if (l) {
      const p = toLocal(l.latitude, l.longitude);
      pts.push([p.u, p.v]);
    }
  }
  return pts;
}

/** A walk's outline, local metres, anticlockwise: round where it goes, its bays filled in, its corners rounded. */
export function walkOutline(tour: Tour): UV[] {
  const pts = ground(tour);
  const pad = REACH + CLOSE + 8 * CELL;
  const u0 = Math.min(...pts.map((p) => p[0])) - pad;
  const v0 = Math.min(...pts.map((p) => p[1])) - pad;
  const cols = Math.ceil((Math.max(...pts.map((p) => p[0])) + pad - u0) / CELL) + 1;
  const rows = Math.ceil((Math.max(...pts.map((p) => p[1])) + pad - v0) / CELL) + 1;
  // Where the walk goes…
  const near = new Uint8Array(cols * rows);
  const reach = REACH / CELL;
  for (const [u, v] of pts) {
    const [c, r] = [(u - u0) / CELL, (v - v0) / CELL];
    for (let rr = Math.floor(r - reach); rr <= Math.ceil(r + reach); rr++) {
      for (let cc = Math.floor(c - reach); cc <= Math.ceil(c + reach); cc++) {
        if ((cc - c) ** 2 + (rr - r) ** 2 <= reach * reach) near[rr * cols + cc] = 1;
      }
    }
  }
  // …grown by CLOSE and shrunk back (a closing), the edge where it shrinks to.
  const close = CLOSE / CELL;
  const grown = edt(near, cols, rows);
  const outside = new Uint8Array(cols * rows);
  for (let i = 0; i < outside.length; i++) outside[i] = grown[i] > close * close ? 1 : 0;
  const fromOutside = edt(outside, cols, rows);
  const h = new Float64Array(cols * rows);
  for (let i = 0; i < h.length; i++) h[i] = Math.sqrt(fromOutside[i]) - close;
  // Its outer edge (a loop's middle is the walk's, too).
  const rings = contours(h, cols, rows).map((r) => r.map(([c, rr]) => [u0 + c * CELL, v0 + rr * CELL] as UV));
  rings.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
  const outer = rings[0];
  const strays = rings.slice(1).filter((r) => !inRing(r[0], outer));
  if (strays.length) console.warn(`${tour.id}: ${strays.length} stray piece(s) of outline left out`);
  // (A ring simplified as two lines: from its first point to the point furthest from it, and back.)
  const round = chaikin(outer, 2);
  let far = 0;
  round.forEach((p, i) => {
    if (Math.hypot(p[0] - round[0][0], p[1] - round[0][1]) > Math.hypot(round[far][0] - round[0][0], round[far][1] - round[0][1])) far = i;
  });
  let ring = [...simplify(round.slice(0, far + 1), 1.2).slice(0, -1), ...simplify([...round.slice(far), round[0]], 1.2).slice(0, -1)];
  if (signedArea(ring) < 0) ring = ring.reverse();
  return ring;
}

// ── The label ──────────────────────────────────────────────────────────

const JOST = "node_modules/@expo-google-fonts/jost";
GlobalFonts.registerFromPath(`${JOST}/500Medium/Jost_500Medium.ttf`, "Jost Medium");
GlobalFonts.registerFromPath(`${JOST}/400Regular/Jost_400Regular.ttf`, "Jost Regular");

const INK = { blue: "#0B2E8C", vermilion: "#E4592B", charcoal: "#2E2A27", slip: "#FDFAF2" };
/** The two inks a walk may be outlined in (constants/book.ts INK). */
const INKS = [INK.blue, INK.vermilion];
/** The label's measures, points. */
const L = {
  art: 40, // the travel label's height (its width 200/240 of it)
  artX: 4,
  slipH: 32,
  slipY: 8, // from the art's top
  overlap: 12, // how far the art lies over the slip's left end
  padR: 11,
  textGap: 7, // from the art's right edge to the lettering
  kicker: 8.5,
  kickerTrack: 1.9,
  name: 13,
  lead: 9, // the line down to the outline
  dot: 3.2,
  margin: 4, // round the slip, for its shadow
};

/** Text set with tracking (the canvas's own letter-spacing isn't to be relied on), returning its width. */
function track(ctx: SKRSContext2D, text: string, x: number, y: number, spacing: number, draw = true): number {
  let w = 0;
  for (const ch of text) {
    if (draw) ctx.fillText(ch, x + w, y);
    w += ctx.measureText(ch).width + spacing;
  }
  return w - spacing;
}

type Label = { w: number; h: number; draw: (scale: number) => Promise<Buffer> };

/** A walk's label: its travel label laid over the end of a slip that bears its number and name; a fine line down from it to a dot, in its outline's ink. */
function label(tour: Tour, n: number, ink: string): Label {
  const kicker = `WALK ${String(n).padStart(2, "0")}`;
  const probe = createCanvas(10, 10).getContext("2d");
  probe.font = `${L.kicker}px "Jost Medium"`;
  const kw = track(probe, kicker, 0, 0, L.kickerTrack, false);
  probe.font = `${L.name}px "Jost Regular"`;
  const nw = probe.measureText(tour.name).width;
  const artW = (L.art * 200) / 240;
  const slipX = L.margin + L.artX + artW - L.overlap;
  const textX = L.margin + L.artX + artW + L.textGap;
  const slipW = textX + Math.max(kw, nw) + L.padR - slipX;
  const w = Math.ceil(slipX + slipW + L.margin);
  // Wide enough either side of the middle for the line down, which hangs from the middle.
  const slipTop = L.margin + L.slipY;
  const slipBottom = slipTop + L.slipH;
  const artBottom = L.margin + L.art;
  const h = Math.ceil(Math.max(slipBottom, artBottom) + L.lead + L.dot + 1.5);
  return {
    w,
    h,
    async draw(scale) {
      const c = createCanvas(Math.round(w * scale), Math.round(h * scale));
      const ctx = c.getContext("2d");
      ctx.scale(scale, scale);
      const mid = w / 2;
      // The line down, and the dot it ends in, on the outline.
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(mid, slipBottom - 1);
      ctx.lineTo(mid, h - L.dot - 1.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(mid, h - L.dot - 1.5, L.dot, 0, Math.PI * 2);
      ctx.fillStyle = ink;
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = INK.slip;
      ctx.stroke();
      // The slip, with a slight shadow as the map's other slips have.
      ctx.save();
      ctx.shadowColor = "rgba(42,32,22,0.24)";
      ctx.shadowBlur = 3 * scale;
      ctx.shadowOffsetX = 0.6 * scale;
      ctx.shadowOffsetY = 1.4 * scale;
      ctx.fillStyle = INK.slip;
      ctx.fillRect(slipX, slipTop, slipW, L.slipH);
      ctx.restore();
      // The lettering: the walk's number in tracked blue capitals, its name.
      ctx.fillStyle = INK.blue;
      ctx.font = `${L.kicker}px "Jost Medium"`;
      track(ctx, kicker, textX, slipTop + 12.5, L.kickerTrack);
      ctx.fillStyle = INK.charcoal;
      ctx.font = `${L.name}px "Jost Regular"`;
      ctx.fillText(tour.name, textX, slipTop + 26.5);
      // The travel label, over the slip's end.
      const svg = WALK_LABEL_SVG[tour.id];
      if (svg) {
        const png = await sharp(Buffer.from(svg), { density: 144 })
          .resize(Math.round(artW * scale), Math.round(L.art * scale))
          .png()
          .toBuffer();
        const img = await loadImage(png);
        ctx.drawImage(img, L.margin + L.artX, L.margin, artW, L.art);
      }
      return c.encode("png");
    },
  };
}

// ── Where each label goes ──────────────────────────────────────────────

/** A point of the drawing, in points on the screen at PLACE_ZOOM (y down). */
function screen([u, v]: UV): UV {
  const level = terraceLevel(u, v);
  const z = level < 0 ? 0 : level * ISO_TERRAIN.level;
  const q = iso(u, v, z);
  return [q.x * PT_PER_M, -q.y * PT_PER_M];
}

type Box = [number, number, number, number];
const overlapArea = (a: Box, b: Box) =>
  Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
const within = ([x, y]: UV, b: Box) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];

/**
 * Where on each outline its label is pinned: of the points along it, the one
 * whose label (standing over it) covers least of the others', of the other
 * outlines and of the pins — and, for choice, sits on the top of its own
 * outline, over the ground beyond rather than the walk's.
 */
function placeLabels(outlines: UV[][], sizes: { w: number; h: number }[]): number[] {
  const drawn = outlines.map((r) => r.map(screen));
  // Every outline, a point every few points of the screen.
  const traces = drawn.map((r) => {
    const out: UV[] = [];
    for (let i = 0; i < r.length; i++) {
      const [a, b] = [r[i], r[(i + 1) % r.length]];
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4));
      for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
    return out;
  });
  const pins = landmarks.map((l) => {
    const p = toLocal(l.latitude, l.longitude);
    return screen([p.u, p.v]);
  });
  const boxAt = (i: number, k: number): Box => {
    const [x, y] = drawn[i][k];
    return [x - sizes[i].w / 2, y - sizes[i].h, x + sizes[i].w / 2, y];
  };
  const cost = (i: number, k: number, chosen: (number | null)[]) => {
    const box = boxAt(i, k);
    const inner: Box = [box[0] + 4, box[1] + 4, box[2] - 4, box[3] - 8];
    let c = 0;
    chosen.forEach((kk, j) => {
      if (j !== i && kk !== null) c += overlapArea(box, boxAt(j, kk)) * 2;
    });
    traces.forEach((t, j) => {
      for (const p of t) if (within(p, inner)) c += j === i ? 6 : 25;
    });
    for (const p of pins) if (within(p, inner)) c += 40;
    // As high on its outline as may be.
    const top = Math.min(...drawn[i].map((p) => p[1]));
    c += (drawn[i][k][1] - top) * 1.5;
    return c;
  };
  const chosen: (number | null)[] = outlines.map(() => null);
  // The smallest first (they've the fewest places to go), then each again, given the rest.
  const order = outlines.map((_, i) => i).sort((a, b) => Math.abs(signedArea(outlines[a])) - Math.abs(signedArea(outlines[b])));
  for (let round = 0; round < 4; round++) {
    for (const i of order) {
      let best = { k: 0, c: Infinity };
      for (let k = 0; k < drawn[i].length; k++) {
        const c = cost(i, k, chosen);
        if (c < best.c) best = { k, c };
      }
      chosen[i] = best.k;
    }
  }
  const total = order.reduce((s, i) => s + cost(i, chosen[i]!, chosen), 0);
  console.log(`labels placed, crowding ${total.toFixed(0)}`);
  return chosen as number[];
}

// ── Which ink ──────────────────────────────────────────────────────────

/**
 * Each walk's ink, of the two: those whose grounds overlap most in different
 * inks, so where outlines cross each can be followed — and about as many of
 * either.
 */
function inks(outlines: UV[][]): number[] {
  const STEP = 20;
  const boxes = outlines.map((r) => [Math.min(...r.map((p) => p[0])), Math.min(...r.map((p) => p[1])), Math.max(...r.map((p) => p[0])), Math.max(...r.map((p) => p[1]))]);
  const shared = outlines.map(() => outlines.map(() => 0));
  for (let i = 0; i < outlines.length; i++) {
    for (let j = i + 1; j < outlines.length; j++) {
      const [a, b] = [boxes[i], boxes[j]];
      for (let u = Math.max(a[0], b[0]); u <= Math.min(a[2], b[2]); u += STEP) {
        for (let v = Math.max(a[1], b[1]); v <= Math.min(a[3], b[3]); v += STEP) {
          if (inRing([u, v], outlines[i]) && inRing([u, v], outlines[j])) shared[i][j] += STEP * STEP;
        }
      }
    }
  }
  let best = { pick: 0, cost: Infinity };
  const n = outlines.length;
  for (let pick = 0; pick < 1 << n; pick++) {
    let ones = 0;
    for (let i = 0; i < n; i++) ones += (pick >> i) & 1;
    if (Math.abs(ones * 2 - n) > 2) continue;
    let cost = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (((pick >> i) & 1) === ((pick >> j) & 1)) cost += shared[i][j];
    if (cost < best.cost) best = { pick, cost };
  }
  return outlines.map((_, i) => (best.pick >> i) & 1);
}

// ── Out ────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outlines = tours.map(walkOutline);
  const ink = inks(outlines);
  const labels = tours.map((t, i) => label(t, i + 1, INKS[ink[i]]));
  const anchors = placeLabels(outlines, labels);
  for (let i = 0; i < tours.length; i++) {
    for (const scale of [1, 2, 3]) {
      const file = `${OUT_DIR}/${tours[i].id}${scale === 1 ? "" : `@${scale}x`}.png`;
      const png = await labels[i].draw(scale);
      fs.writeFileSync(file, await sharp(png).png({ palette: true, colors: 128, quality: 95, effort: 10 }).toBuffer());
    }
  }
  const ll = ([u, v]: UV) => {
    const p = toLatLon(u, v);
    return [Number(p.lat.toFixed(6)), Number(p.lon.toFixed(6))];
  };
  const entries = tours.map((t, i) => `  ${JSON.stringify(t.id)}: {\n    outline: ${JSON.stringify(outlines[i].map(ll))},\n    label: ${JSON.stringify(ll(outlines[i][anchors[i]]))},\n    ink: ${ink[i]},\n  },`);
  fs.writeFileSync(
    DATA,
    `// AUTO-GENERATED by scripts/iso/walk-outlines.ts — do not edit.\n\n` +
      `/**\n * Each walk's outline on the city map ([latitude, longitude], anticlockwise), the point on it its label\n * hangs over, and its ink: 0 blue, 1 vermilion (walks that overlap most in different inks).\n */\n` +
      `export const WALK_OUTLINES: Record<string, { outline: [number, number][]; label: [number, number]; ink: 0 | 1 }> = {\n` +
      entries.join("\n") +
      `\n};\n\n` +
      `/** How far the dot at the foot of a label's line is above the label's bottom edge, points. */\n` +
      `export const WALK_LABEL_DOT = ${L.dot + 1.5};\n`,
  );
  fs.writeFileSync(
    MODULE,
    `// AUTO-GENERATED by scripts/iso/walk-outlines.ts — do not edit.\n\n` +
      `/** Each walk's label for the city map, by the image name the map knows it by (its bottom middle hangs over the walk's outline). */\n` +
      `export const WALK_LABEL_IMAGES = {\n` +
      tours.map((t) => `  ${JSON.stringify(`walk-${t.id}`)}: require("../assets/map/walks/${t.id}.png"),`).join("\n") +
      `\n};\n`,
  );
  const bytes = fs.readdirSync(OUT_DIR).reduce((s, f) => s + fs.statSync(`${OUT_DIR}/${f}`).size, 0);
  console.log(`${tours.length} walks: outlines of ${outlines.map((o) => o.length).join(", ")} points; labels ${(bytes / 1024).toFixed(0)} KB`);
}

if (process.argv[1]?.endsWith("walk-outlines.ts")) main();
