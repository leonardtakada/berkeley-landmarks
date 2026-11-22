/**
 * The walks on the city map, before one is chosen (components/walk-trails.tsx),
 * as a pictorial guide map marks its walking courses: a dotted trail along
 * the streets the walks take — each stretch drawn once, however many walks
 * share it, so the dots never fall out of step — and its tag: the walk's
 * number in a vermilion roundel and its name in tracked capitals, printed on
 * the map in the guide's type; once for each walk far out, more often the
 * closer in, about one of a walk's to a screen (far out and close in, the
 * roundel alone).
 *
 *   npx tsx scripts/iso/walk-trails.ts
 *     → lib/walk-trails.generated.ts, components/walk-tags.generated.ts,
 *       assets/map/walks/<id>.png and <id>-no.png, the roundel alone (@2x, @3x)
 */
import fs from "node:fs";
import { createCanvas, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";
import sharp from "sharp";

import { landmarks } from "../../data/landmarks";
import { tours, type Tour } from "../../data/tours";
import { toLatLon, toLocal } from "../../lib/iso";
import { isoPoint } from "../../lib/iso-map";
import { landmarkMarks, overlap, screenAt, type Box } from "./clusters";

const OUT_DIR = "assets/map/walks";
const DATA = "lib/walk-trails.generated.ts";
const MODULE = "components/walk-tags.generated.ts";

// ── The trails ─────────────────────────────────────────────────────────

type UV = [number, number];

/** How far apart the walks' ways are sampled, metres. */
const SAMPLE = 2;
/** A stretch this close to one already drawn is the same street. */
const SAME = 4;
const CELL = 12;

const distToSegment = ([px, py]: UV, [ax, ay]: UV, [bx, by]: UV) => {
  const [dx, dy] = [bx - ax, by - ay];
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};

/** A line with the points it can do without, to within `tol`, left out (Douglas–Peucker). */
function simplify(line: UV[], tol: number): UV[] {
  if (line.length < 3) return line;
  let [far, at] = [0, 0];
  for (let i = 1; i < line.length - 1; i++) {
    const d = distToSegment(line[i], line[0], line[line.length - 1]);
    if (d > far) [far, at] = [d, i];
  }
  if (far <= tol) return [line[0], line[line.length - 1]];
  return [...simplify(line.slice(0, at + 1), tol).slice(0, -1), ...simplify(line.slice(at), tol)];
}

/** A walk's way, a point every SAMPLE metres. */
function samples(tour: Tour): UV[] {
  const r = tour.routeCoordinates.map((c) => toLocal(c.latitude, c.longitude));
  const out: UV[] = [];
  for (let i = 0; i + 1 < r.length; i++) {
    const n = Math.max(1, Math.ceil(Math.hypot(r[i + 1].u - r[i].u, r[i + 1].v - r[i].v) / SAMPLE));
    for (let k = 0; k < n; k++) out.push([r[i].u + ((r[i + 1].u - r[i].u) * k) / n, r[i].v + ((r[i + 1].v - r[i].v) * k) / n]);
  }
  if (r.length) out.push([r[r.length - 1].u, r[r.length - 1].v]);
  return out;
}

/**
 * The trails: every walk's way, each stretch once. Walk by walk, the parts
 * not already drawn (by an earlier walk, or earlier in the same one) are
 * added, joined at their ends to the trail they leave or meet.
 */
export function walkTrails(): UV[][] {
  const trails: UV[][] = [];
  const grid = new Map<string, [UV, UV][]>();
  const cellOf = ([u, v]: UV) => [Math.floor(u / CELL), Math.floor(v / CELL)];
  const drawn = (p: UV) => {
    const [cu, cv] = cellOf(p);
    for (let i = cu - 1; i <= cu + 1; i++) {
      for (let j = cv - 1; j <= cv + 1; j++) {
        for (const [a, b] of grid.get(`${i},${j}`) ?? []) if (distToSegment(p, a, b) < SAME) return true;
      }
    }
    return false;
  };
  const keep = (run: UV[]) => {
    let len = 0;
    for (let i = 1; i < run.length; i++) len += Math.hypot(run[i][0] - run[i - 1][0], run[i][1] - run[i - 1][1]);
    if (len < SAME) return;
    const line = simplify(run, 0.5);
    trails.push(line);
    for (let i = 1; i < line.length; i++) {
      const [a, b] = [line[i - 1], line[i]];
      const [c0, r0] = cellOf([Math.min(a[0], b[0]), Math.min(a[1], b[1])]);
      const [c1, r1] = cellOf([Math.max(a[0], b[0]), Math.max(a[1], b[1])]);
      for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) (grid.get(`${c},${r}`) ?? grid.set(`${c},${r}`, []).get(`${c},${r}`)!).push([a, b]);
    }
  };
  for (const tour of tours) {
    const pts = samples(tour);
    let run: UV[] = [];
    for (let i = 0; i < pts.length; i++) {
      if (!drawn(pts[i])) {
        // (From the trail it leaves.)
        if (!run.length && i > 0) run.push(pts[i - 1]);
        run.push(pts[i]);
      } else if (run.length) {
        // (To the trail it meets.)
        run.push(pts[i]);
        keep(run);
        run = [];
      }
    }
    keep(run);
  }
  return trails;
}

// ── The tags ───────────────────────────────────────────────────────────

const JOST = "node_modules/@expo-google-fonts/jost";
GlobalFonts.registerFromPath(`${JOST}/500Medium/Jost_500Medium.ttf`, "Jost Medium");

const INK = { blue: "#0B2E8C", vermilion: "#E4592B", cream: "#F2F0E6", slip: "#FDFAF2" };
/** The tag's measures, points. */
const T = {
  roundel: 18, // across
  number: 8.5,
  name: 8.5,
  track: 1.5,
  band: 14, // the slip the name is set on, high
  gap: 5, // roundel's edge to the name
  pad: 7, // after the name
  margin: 1,
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

/**
 * A walk's tag, printed on the map along its trail: its name in tracked blue
 * capitals on a flat slip of paper, square-cut, and over the slip's end its
 * number in cream on a vermilion roundel, rimmed with paper.
 */
async function tag(tour: Tour, n: number, scale: number, named = true): Promise<{ png: Buffer; w: number; h: number }> {
  const name = tour.name.toUpperCase();
  const probe = createCanvas(10, 10).getContext("2d");
  probe.font = `${T.name}px "Jost Medium"`;
  const nw = track(probe, name, 0, 0, T.track, false);
  const w = Math.ceil(named ? T.margin * 2 + T.roundel + T.gap + nw + T.pad : T.margin * 2 + T.roundel);
  const h = Math.ceil(T.margin * 2 + T.roundel);
  const c = createCanvas(Math.round(w * scale), Math.round(h * scale));
  const ctx = c.getContext("2d");
  ctx.scale(scale, scale);
  const mid = h / 2;
  const [cx, r] = [T.margin + T.roundel / 2, T.roundel / 2];
  // The slip, from under the roundel's middle to past the name.
  ctx.fillStyle = INK.slip;
  if (named) ctx.fillRect(cx, mid - T.band / 2, w - T.margin - cx, T.band);
  // The roundel, rimmed with paper so it stands off the drawing.
  ctx.beginPath();
  ctx.arc(cx, mid, r, 0, Math.PI * 2);
  ctx.fillStyle = INK.slip;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, mid, r - 1.3, 0, Math.PI * 2);
  ctx.fillStyle = INK.vermilion;
  ctx.fill();
  ctx.font = `${T.number}px "Jost Medium"`;
  ctx.fillStyle = INK.cream;
  const no = String(n).padStart(2, "0");
  const now = track(ctx, no, 0, 0, 0.4, false);
  track(ctx, no, cx - now / 2, mid + T.number * 0.36, 0.4);
  // The name.
  if (named) {
    ctx.font = `${T.name}px "Jost Medium"`;
    ctx.fillStyle = INK.blue;
    track(ctx, name, T.margin + T.roundel + T.gap, mid + T.name * 0.36, T.track);
  }
  return { png: await c.encode("png"), w, h };
}

// ── Where the tags go ──────────────────────────────────────────────────

/** Another walk within this of a point shares its street there, metres. */
const SHARED = 8;
/**
 * How far apart a walk's tags lie on the map (not just along its way, which
 * may wind back), metres, at each rank after its one tag: each rank is shown
 * from a closer zoom (RANK_FROM_ZOOM), about where the screen's height covers
 * that much ground (it covers more than its width), so there's about one of
 * a walk's tags to a screen at any zoom.
 */
const TAG_APART = [2000, 1000, 500];
/** The zoom each rank is shown from (components/walk-trails.tsx), and the zooms its name is shown between. */
const RANK_FROM_ZOOM = [12.5, 15.3, 16.3, 17.3];
const NAMED_ZOOMS = [14, 16];
/** The map as it opens (app/map.tsx OPENING, OPENING_ZOOM), and the part of the screen the slips laid over it leave clear, points. */
const OPENING = { at: { latitude: 37.8712, longitude: -122.2662 }, zoom: 14.6 };
const SCREEN = { w: 402, h: 874, top: 160, bottom: 80, side: 8 };
type TagPoint = { id: string; at: UV; rank: number };

/**
 * Where each walk's tags go, judged on the screen at the zooms each is shown
 * at: where the landmarks' clusters (which a tag makes way for, so it would
 * go unseen) and pins (which lie over it) aren't, nor the other walks' tags,
 * and where the walk has the street to itself. Each walk's one tag (rank 0,
 * shown at every zoom) inside the map as it opens, if the walk passes
 * through it; then, rank by rank for closer in, more along its way, none
 * within that rank's TAG_APART of another of its own.
 */
export function tagPoints(widths: number[]): TagPoint[] {
  const ways = tours.map(samples);
  // Every walk's way, on a grid, to ask who else passes a point.
  const grid = new Map<string, { w: number; a: UV; b: UV }[]>();
  ways.forEach((pts, w) => {
    for (let i = 1; i < pts.length; i++) {
      const [a, b] = [pts[i - 1], pts[i]];
      const k = `${Math.floor(a[0] / CELL)},${Math.floor(a[1] / CELL)}`;
      (grid.get(k) ?? grid.set(k, []).get(k)!).push({ w, a, b });
    }
  });
  const sharers = (p: UV, self: number) => {
    const found = new Set<number>();
    const [cu, cv] = [Math.floor(p[0] / CELL), Math.floor(p[1] / CELL)];
    for (let i = cu - 1; i <= cu + 1; i++) {
      for (let j = cv - 1; j <= cv + 1; j++) {
        for (const s of grid.get(`${i},${j}`) ?? []) if (s.w !== self && distToSegment(p, s.a, s.b) < SHARED) found.add(s.w);
      }
    }
    return found.size;
  };
  const dist = (a: UV, b: UV) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const shared = ways.map((pts, w) => pts.map((p) => sharers(p, w)));
  // Where a point of the ground lies on the drawing (as the app places it: lib/iso-map.ts).
  const drawn = ([u, v]: UV, above = 1) => {
    const p = toLatLon(u, v);
    return isoPoint({ latitude: p.lat, longitude: p.lon }, above);
  };
  // The landmarks' pins and clusters at each zoom.
  const marks = landmarkMarks();
  // A tag's box on the screen at zoom z: its roundel on the point, the name (if shown) running off to the right.
  const iconSize = (z: number) => (z >= 14 ? 1 : 0.85 + ((Math.max(12.5, z) - 12.5) / 1.5) * 0.15);
  const boxOf = (w: number, at: UV, z: number): Box => {
    const [x, y] = screenAt(drawn(at), z);
    const k = iconSize(z);
    const named = z >= NAMED_ZOOMS[0] && z < NAMED_ZOOMS[1];
    return [x - 10 * k, y - 10 * k, x + (named ? widths[w] - 10 : 10) * k, y + 10 * k];
  };
  // The zooms a tag of each rank is judged at, and how much each counts.
  const zoomsOf = (rank: number) =>
    rank === 0
      ? [
          [13, 1],
          [14, 1],
          [OPENING.zoom, 3],
          [15, 1],
        ]
      : [
          [RANK_FROM_ZOOM[rank], 1],
          [RANK_FROM_ZOOM[rank] + 0.6, 1],
        ];
  const out: { w: number; at: UV; rank: number }[] = [];
  /** How badly a tag at `at` would sit among the pins, the clusters and the tags already placed. */
  const crowding = (w: number, at: UV, rank: number, others: typeof out) => {
    let c = 0;
    for (const [z, weight] of zoomsOf(rank)) {
      const box = boxOf(w, at, z);
      for (const m of marks(z)) {
        const o = overlap(box, m.box);
        // Under a cluster's room it goes unseen; under a pin, half covered.
        if (o > 0) c += weight * (m.cluster ? 400 + o * 4 : o * 2);
      }
      for (const t of others) {
        if (t.w === w || t.rank > rank) continue;
        const o = overlap(box, boxOf(t.w, t.at, z));
        if (o > 0) c += weight * (300 + o * 3);
      }
    }
    return c;
  };
  // The map as it opens: the part of the screen left clear, and the walks that pass through it.
  const [ox, oy] = screenAt(isoPoint(OPENING.at), OPENING.zoom);
  const clear: Box = [ox - SCREEN.w / 2 + SCREEN.side, oy - SCREEN.h / 2 + SCREEN.top, ox + SCREEN.w / 2 - SCREEN.side, oy + SCREEN.h / 2 - SCREEN.bottom];
  const inOpening = (w: number, at: UV) => {
    const b = boxOf(w, at, OPENING.zoom);
    return b[0] >= clear[0] && b[1] >= clear[1] && b[2] <= clear[2] && b[3] <= clear[3];
  };
  const passes = ways.map((pts, w) => pts.some((p, i) => i % 5 === 0 && inOpening(w, p)));

  // Each walk's one tag: the earlier walks first (their tags win where they meet), then each again, given the rest.
  const first: (UV | null)[] = ways.map(() => null);
  for (let round = 0; round < 3; round++) {
    ways.forEach((pts, w) => {
      if (pts.length < 2) return;
      const others = first.flatMap((at, o) => (at && o !== w ? [{ w: o, at, rank: 0 }] : []));
      let best = { at: pts[0], cost: Infinity };
      for (let i = Math.floor(pts.length * 0.05); i < Math.ceil(pts.length * 0.95); i += 5) {
        const at = pts[i];
        let cost = shared[w][i] * 60 + crowding(w, at, 0, others);
        if (passes[w] && !inOpening(w, at)) cost += 5000;
        if (cost < best.cost) best = { at, cost };
      }
      first[w] = best.at;
    });
  }
  first.forEach((at, w) => at && out.push({ w, at, rank: 0 }));

  // And its others, rank by rank, for closer in.
  TAG_APART.forEach((apart, r) => {
    const rank = r + 1;
    ways.forEach((pts, w) => {
      const mine = () => out.filter((t) => t.w === w).map((t) => t.at);
      const stretch = Math.round(apart / 4 / SAMPLE);
      for (let i = 0; i < pts.length; i++) {
        if (mine().some((q) => dist(q, pts[i]) < apart)) continue;
        // The best point of the stretch ahead that's as clear of its own.
        let best = { j: -1, cost: Infinity };
        for (let j = i; j < Math.min(pts.length, i + stretch); j += 2) {
          if (mine().some((q) => dist(q, pts[j]) < apart)) continue;
          const cost = shared[w][j] * 60 + (j - i) * SAMPLE * 0.1 + crowding(w, pts[j], rank, out);
          if (cost < best.cost) best = { j, cost };
        }
        if (best.j < 0) continue;
        out.push({ w, at: pts[best.j], rank });
        i = best.j;
      }
    });
  });
  const hidden = out.filter((t) => t.rank === 0 && crowding(t.w, t.at, 0, out.filter((o) => o.rank === 0 && o.w < t.w)) >= 400).length;
  const opening = out.filter((t) => t.rank === 0 && inOpening(t.w, t.at)).length;
  console.log(`tags: ${opening} of ${passes.filter(Boolean).length} walks through the opening view named in it; ${hidden} first tags crowded somewhere`);
  return out.map((t) => ({ id: tours[t.w].id, at: t.at, rank: t.rank }));
}

// ── Out ────────────────────────────────────────────────────────────────

async function main() {
  const trails = walkTrails();
  const widths = await Promise.all(tours.map(async (t, i) => (await tag(t, i + 1, 1)).w));
  const tags = tagPoints(widths);
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (let i = 0; i < tours.length; i++) {
    for (const scale of [1, 2, 3]) {
      for (const named of [true, false]) {
        const { png } = await tag(tours[i], i + 1, scale, named);
        const file = `${OUT_DIR}/${tours[i].id}${named ? "" : "-no"}${scale === 1 ? "" : `@${scale}x`}.png`;
        fs.writeFileSync(file, await sharp(png).png({ palette: true, colors: 64, quality: 95, effort: 10 }).toBuffer());
      }
    }
  }
  const ll = ([u, v]: UV) => {
    const p = toLatLon(u, v);
    return [Number(p.lat.toFixed(6)), Number(p.lon.toFixed(6))];
  };
  fs.writeFileSync(
    DATA,
    `// AUTO-GENERATED by scripts/iso/walk-trails.ts — do not edit.\n\n` +
      `/** The walks' trails on the city map: every walk's way, each stretch once, as lines of [latitude, longitude]. */\n` +
      `export const WALK_TRAILS: [number, number][][] = [\n` +
      trails.map((t) => `  ${JSON.stringify(t.map(ll))},`).join("\n") +
      `\n];\n\n` +
      `/** Where the walks' tags go along their ways: [walk, latitude, longitude, rank] — rank 0 each walk's one tag, shown at every zoom; the higher ranks closer in. */\n` +
      `export const WALK_TAGS: [string, number, number, number][] = [\n` +
      tags.map((t) => `  ${JSON.stringify([t.id, ...ll(t.at), t.rank])},`).join("\n") +
      `\n];\n\n` +
      `/** How far the roundel's middle is from a tag's left edge, points (the tag hangs from it, on its point). */\n` +
      `export const WALK_TAG_ROUNDEL = ${T.margin + T.roundel / 2};\n`,
  );
  fs.writeFileSync(
    MODULE,
    `// AUTO-GENERATED by scripts/iso/walk-trails.ts — do not edit.\n\n` +
      `/** Each walk's tags for the city map — its number and name, and its number alone — by the image names the map knows them by. */\n` +
      `export const WALK_TAG_IMAGES = {\n` +
      tours.map((t) => `  ${JSON.stringify(`walk-${t.id}`)}: require("../assets/map/walks/${t.id}.png"),\n  ${JSON.stringify(`walk-no-${t.id}`)}: require("../assets/map/walks/${t.id}-no.png"),`).join("\n") +
      `\n};\n`,
  );
  const km = tours.reduce((s, t) => s + samples(t).length * SAMPLE, 0) / 1000;
  const drawnKm = trails.reduce((s, t) => s + t.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - t[i][0], p[1] - t[i][1]), 0), 0) / 1000;
  const bytes = fs.readdirSync(OUT_DIR).reduce((s, f) => s + fs.statSync(`${OUT_DIR}/${f}`).size, 0);
  console.log(`${tours.length} walks, ${km.toFixed(1)} km of way → ${trails.length} trails, ${drawnKm.toFixed(1)} km; ${tags.length} tags, ${(bytes / 1024).toFixed(0)} KB`);
}

if (process.argv[1]?.endsWith("walk-trails.ts")) main();
