/**
 * The streets the city map's walkers walk (components/iso-walkers.tsx): a
 * network of the streets drawn on the map, laid on their terraces, and — for
 * each stretch of street, on either side of it, where the walkers keep — how
 * much of a walker there something nearer covers: a house, a tree, a nearer
 * rise of the land. Across the figure's width that's a line (a roof's eave
 * slopes, a corner steps) below which they're out of sight — or a band, behind
 * a tree's crown. Where it covers them all, they're hidden, as the cover's
 * pass behind the Campanile.
 *
 *   npx tsx scripts/iso/walks.ts  → lib/iso-walks.generated.ts
 */
import fs from "node:fs";

import { iso, toLocal } from "../../lib/iso";
import { FIG_H, FIG_W } from "../../lib/walker-cast";
import { landmarks } from "../../data/landmarks";
import { pointInRing, segDist, simplify, type Pt, type Ring } from "./geom";
import { landmarkSolids, type RoofSolid } from "./models";
import { buildScene, buildings, levelAt, levelZ, terrain, type Piece } from "./scene";
import { CITY_BOX } from "./city-proof";

const OUT = "lib/iso-walks.generated.ts";
/** A walker's height on the drawing, metres (the map scales its figures to it)… */
export const WALKER_HEIGHT = 11;
/** …and the width of the figure's box. */
export const WALKER_WIDTH = (WALKER_HEIGHT * FIG_W) / FIG_H;
/** Metres a walker keeps to the right of the street's middle. */
export const KEEP_RIGHT = 2.5;
/** The streets people walk: those the map draws, less the freeways. */
const WALKABLE = new Set(["primary", "secondary", "tertiary", "residential", "unclassified", "living_street", "pedestrian"]);
/** Networks smaller than this many junctions and bends aren't worth a walker. */
const SMALLEST = 12;
/** Metres of street between the places a walker's cover is found. */
const SAMPLE = 1;
const CELL = 20;
/** Out of sight for less than this, metres of street, a walker stays in view… */
const SHORTEST_HIDDEN = 6;
/** …and back in view for less than this, they stay hidden. */
const SHORTEST_SEEN = 8;
/** Lines up the figure's box, from its left edge to its right, along which the cover is found… */
export const COLUMNS = 11;
/** …and the steps up a walker's height it's told in. */
export const LEVELS = 24;
/** A glimpse between two covers shorter than this, metres, is covered over (it would only blink). */
const SHORTEST_GAP = 1.5;
/** Cover told along a stretch may run on unchanged while it's within this many levels of the truth (covering more, never less). */
const SLACK = 1;
/** How far the line of a cover may stray from the levels it was found at, before it's bent. */
const BEND = 0.6;
/**
 * Most lanes are told by a skyline: how high, over each point along the lane,
 * something nearer covers it — read by each walker across the width of their
 * figure (a walker's own depth differs from the lane's a figure's width along,
 * little enough where the lane's depth changes no more than SKYLINE_SLANT
 * metres for each across the drawing; those that run steeper are told cover
 * by cover). A skyline is found every SKYLINE_STEP metres across the drawing,
 * in levels of SKY_LEVEL metres from SKY_BASE below the lane, its line kept
 * within SKY_BEND levels of what was found; its points are told in tenths of
 * a metre along the lane, from SKY_BACK tenths before its start.
 */
const SKYLINE_SLANT = 2.5;
const SKYLINE_STEP = 0.2;
const SKY_LEVEL = 0.3;
const SKY_BASE = 3.8;
const SKY_BEND = 1;
const SKY_BACK = 100;

type OsmWay = { id: number; nodes?: number[]; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] };
type P3 = [number, number, number];

/** Hidden runs (from–to fractions of a stretch `len` metres long) without the blinks. */
function steady(runs: number[], len: number): number[] {
  const merged: number[] = [];
  for (let k = 0; k < runs.length; k += 2) {
    const n = merged.length;
    if (n && (runs[k] - merged[n - 1]) * len < SHORTEST_SEEN) merged[n - 1] = runs[k + 1];
    else merged.push(runs[k], runs[k + 1]);
  }
  const out: number[] = [];
  for (let k = 0; k < merged.length; k += 2) {
    // (A run that reaches either end may carry on along the next stretch.)
    const atEnd = merged[k] === 0 || merged[k + 1] === 1;
    if (atEnd || (merged[k + 1] - merged[k]) * len >= SHORTEST_HIDDEN) out.push(merged[k], merged[k + 1]);
  }
  return out;
}

// ── What covers a walker ──────────────────────────────────────────────────

/** A walker's cover, metres up the figure, along each of the COLUMNS: covered from `lo` to `hi` (none where lo > hi). */
export type Cover = { lo: number[]; hi: number[] };
const NONE = () => ({ lo: Array<number>(COLUMNS).fill(Infinity), hi: Array<number>(COLUMNS).fill(-Infinity) });

/**
 * What stands between the reader and a walker anywhere in `box`: the houses
 * and landmarks as solids (a footprint, a base, a top and the roof's true
 * shape), the trees as the shapes they're drawn, and the terraces of the land.
 */
export async function occlusion(box: { u0: number; v0: number; u1: number; v1: number }) {
  const t = await terrain();
  const zAt = (u: number, v: number) => Math.max(0, levelZ(levelAt(t, u, v)));
  const flat = (p: P3): Pt => {
    const q = iso(p[0], p[1], p[2]);
    return [q.x, q.y];
  };

  // ── The trees, as drawn, on a grid of the drawing ───────────────────────
  // (Buildings are tested as solids below: a big building's middle can lie
  // behind a walker its front wall still hides, so a depth per piece won't do.)
  const { solids } = await buildScene({ box, heightScale: 1.4, plate: { depth: 30 } });
  const TREE = new Set(["trunk", "crown", "crownLit", "greenTrunk", "green", "greenLit"]);
  type Occluder = { d: number; poly: Pt[]; x0: number; y0: number; x1: number; y1: number; seen: number };
  const grid = new Map<string, Occluder[]>();
  const shapeOf = (p: Piece): Pt[] => {
    if (p.kind === "poly") return p.rings[0].map(flat);
    if (p.kind === "line") {
      const [a, b] = p.pts;
      const w = p.width / 2;
      return [flat([a[0] - w, a[1] + w, a[2]]), flat([a[0] + w, a[1] - w, a[2]]), flat([b[0] + w, b[1] - w, b[2]]), flat([b[0] - w, b[1] + w, b[2]])];
    }
    // (As the map draws them: scripts/iso/city.ts.)
    const [cx, cy] = flat(p.at);
    if (p.kind === "flat") return p.parts[0].map(([dx, dy]) => [cx + dx, cy + dy] as Pt);
    const n = p.role === "crownLit" || p.role === "greenLit" ? 10 : 16;
    return Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * p.r, cy + Math.sin((i / n) * Math.PI * 2) * p.r] as Pt);
  };
  for (const s of solids) {
    for (const piece of s.pieces) {
      if (!TREE.has(piece.role)) continue;
      const poly = shapeOf(piece);
      if (poly.length < 3) continue;
      let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const [x, y] of poly) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
      const o = { d: s.d, poly, x0, y0, x1, y1, seen: -1 };
      for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
        for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) {
          const k = `${cx},${cy}`;
          (grid.get(k) ?? grid.set(k, []).get(k)!).push(o);
        }
      }
    }
  }

  // ── The buildings as solids: a footprint, its base and its top ──────────
  const HS = 1.4;
  const byId = new Map(landmarks.map((l) => [l.id, l]));
  /** A prism; a house's gable roof as a ridge from r0 to r1, falling `half` metres to either side by its eaves at `top`; a model's roof as its profile. */
  type Solid = {
    ring: Ring;
    base: number;
    top: number;
    /** Its highest point. */
    peak: number;
    ridge?: { r0: Pt; r1: Pt; z: number; half: number };
    roof?: RoofSolid;
    u0: number;
    v0: number;
    u1: number;
    v1: number;
    seen: number;
  };
  const blocks = new Map<string, Solid[]>();
  const B = 25;
  const add = (o: Omit<Solid, "u0" | "v0" | "u1" | "v1" | "peak" | "seen">) => {
    let [u0, v0, u1, v1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [u, v] of o.ring) [u0, v0, u1, v1] = [Math.min(u0, u), Math.min(v0, v), Math.max(u1, u), Math.max(v1, v)];
    const peak = o.ridge ? o.ridge.z : o.roof ? o.top + o.roof.rise : o.top;
    const solid = { ...o, u0, v0, u1, v1, peak, seen: -1 };
    for (let cu = Math.floor(u0 / B); cu <= Math.floor(u1 / B); cu++) {
      for (let cv = Math.floor(v0 / B); cv <= Math.floor(v1 / B); cv++) {
        const k = `${cu},${cv}`;
        (blocks.get(k) ?? blocks.set(k, []).get(k)!).push(solid);
      }
    }
  };
  for (const b of await buildings()) {
    if (b.ring.some(([u, v]) => u < box.u0 || u > box.u1 || v < box.v0 || v > box.v1)) continue;
    const l = b.landmark ? byId.get(b.landmark) : undefined;
    if (l) {
      for (const part of landmarkSolids(l, b, HS)) add({ ring: part.ring, base: part.z0, top: part.z1, roof: part.roof ?? undefined });
      continue;
    }
    const top = b.base + b.height * HS;
    if (b.gable) {
      const [c0, c1, c2, c3] = b.gable.corners;
      const mid = (p: Pt, q: Pt): Pt => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      const half = Math.hypot(c3[0] - c0[0], c3[1] - c0[1]) / 2;
      add({ ring: b.ring, base: b.base, top, ridge: { r0: mid(c0, c3), r1: mid(c1, c2), z: top + b.gable.rise * Math.min(HS, 1.6), half } });
    } else add({ ring: b.ring, base: b.base, top });
  }
  /** The height of a building's roof over a point of its footprint. */
  const roofAt = (o: Solid, pu: number, pv: number) => {
    if (o.roof) {
      // The roof's slopes: as high as it rises this far in from its eaves.
      let d = Infinity;
      for (const [a, b] of o.roof.edges) d = Math.min(d, segDist([pu, pv], a, b));
      const f = Math.min(1, d / o.roof.D);
      return o.top + o.roof.rise * (o.roof.round ? Math.sqrt(1 - (1 - f) * (1 - f)) : f);
    }
    if (!o.ridge) return o.top;
    // A house: falling from the ridge to the eaves either side of it.
    const { r0, r1, z, half } = o.ridge;
    const [dx, dy] = [r1[0] - r0[0], r1[1] - r0[1]];
    const l2 = dx * dx + dy * dy || 1;
    const f = Math.max(0, Math.min(1, ((pu - r0[0]) * dx + (pv - r0[1]) * dy) / l2));
    const off = Math.hypot(pu - r0[0] - f * dx, pv - r0[1] - f * dy);
    return Math.max(o.top, z - ((z - o.top) * off) / half);
  };
  /** Whether a point of the ground's space lies inside a building (under its roof). */
  const inSolid = (pu: number, pv: number, pz: number) => {
    for (const o of blocks.get(`${Math.floor(pu / B)},${Math.floor(pv / B)}`) ?? []) {
      if (pz > o.peak || pz < o.base || pu < o.u0 || pu > o.u1 || pv < o.v0 || pv > o.v1) continue;
      if (pointInRing([pu, pv], o.ring) && pz <= roofAt(o, pu, pv)) return true;
    }
    return false;
  };
  /** Whether a nearer, higher terrace covers the point `h` over a walker at (u, v, z). */
  const underHill = (u: number, v: number, z: number, h: number) => {
    for (let k = levelAt(t, u, v) + 1; k < 30; k++) {
      const dz = levelZ(k) - (z + h);
      if (dz <= 0) continue;
      // The ground at that height that draws where this point does lies dz nearer, on the diagonal.
      if (levelAt(t, u - dz, v - dz) >= k) return true;
      if (dz > 400) break;
    }
    return false;
  };

  /** Toward the reader, (-1, -1, +1) in the drawing's terms: the rays from a walker are looked along this far. */
  const REACH = 140;
  const COS30 = Math.cos(Math.PI / 6);
  /** Ground metres along u (and back along v) to a metre across the drawing. */
  const ACROSS = 1 / (2 * COS30);
  let stamp = 0;

  /** The buildings the rays from a walker at (u, v, z) could pass through: those along the diagonal from there, `c` metres either side. */
  const nearOf = (u: number, v: number, z: number, c: number) => {
    const near: Solid[] = [];
    const id = ++stamp;
    for (let s = -B; s <= REACH + B; s += B / 4) {
      for (const o of [-c, c]) {
        for (const solid of blocks.get(`${Math.floor((u - s + o) / B)},${Math.floor((v - s - o) / B)}`) ?? []) {
          if (solid.seen === id || solid.peak - z < 0) continue;
          solid.seen = id;
          near.push(solid);
        }
      }
    }
    return near;
  };

  /**
   * How far up the line over (cu, cv) — from `h0` to `h1` metres over the
   * ground at `z` — something nearer covers it, found exactly: where each ray
   * toward the reader enters and leaves each building, where each tree's
   * drawing crosses the line, how high the nearer land rises. [lo, hi], or
   * lo > hi if nothing does.
   */
  const columnAt = (cu: number, cv: number, z: number, h0: number, h1: number, near: Solid[]): [number, number] => {
    let [lo, hi] = [Infinity, -Infinity];
    const cover = (a: number, b: number) => {
      [a, b] = [Math.max(h0, a), Math.min(h1, b)];
      if (b > a) [lo, hi] = [Math.min(lo, a), Math.max(hi, b)];
    };
    // Buildings: the stretches of the ray (along u − v = k) inside each footprint.
    const k = cu - cv;
    for (const o of near) {
      if (k < o.u0 - o.v1 || k > o.u1 - o.v0) continue;
      const s0 = Math.max(0, cu - o.u1, cv - o.v1);
      const s1 = Math.min(REACH, cu - o.u0, cv - o.v0);
      if (s1 < s0 || o.peak - z - s0 < h0 || o.base - z - s1 > h1) continue;
      const xs: number[] = [];
      const r = o.ring;
      for (let i = 0, p = r.length - 1; i < r.length; p = i++) {
        const dA = r[p][0] - r[p][1] - k;
        const dB = r[i][0] - r[i][1] - k;
        if (dA > 0 === dB > 0) continue;
        const f = dA / (dA - dB);
        xs.push(cu - (r[p][0] + (r[i][0] - r[p][0]) * f));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const [a, b] = [Math.max(0, xs[i]), Math.min(REACH, xs[i + 1])];
        if (b <= a) continue;
        // The highest the ray is covered: where it goes in, for a flat roof; under a sloping one, wherever it's highest above the ray.
        let top = o.top - z - a;
        if (o.roof || o.ridge) {
          for (let s = a; s <= b + 1e-9; s += 0.2) {
            if (o.peak - z - s <= top) break;
            top = Math.max(top, roofAt(o, cu - s, cv - s) - z - s);
          }
          top = Math.max(top, roofAt(o, cu - b, cv - b) - z - b);
        }
        cover(o.base - z - b, top);
      }
    }
    // Trees: where the line crosses the drawing of each nearer one.
    const [x, y0] = flat([cu, cv, z]);
    const depth = cu + cv;
    const gx = Math.floor(x / CELL);
    const id = ++stamp;
    for (let gy = Math.floor((y0 + h0) / CELL); gy <= Math.floor((y0 + h1) / CELL); gy++) {
      for (const o of grid.get(`${gx},${gy}`) ?? []) {
        if (o.seen === id || o.d >= depth || x < o.x0 || x > o.x1 || o.y1 < y0 + h0 || o.y0 > y0 + h1) continue;
        o.seen = id;
        const ys: number[] = [];
        const p = o.poly;
        for (let i = 0, q = p.length - 1; i < p.length; q = i++) {
          if (p[q][0] > x === p[i][0] > x) continue;
          ys.push(p[q][1] + ((x - p[q][0]) * (p[i][1] - p[q][1])) / (p[i][0] - p[q][0]));
        }
        ys.sort((a, b) => a - b);
        for (let i = 0; i + 1 < ys.length; i += 2) cover(ys[i] - y0, ys[i + 1] - y0);
      }
    }
    // The land: covered from below up to wherever the nearer terrace's edge crosses.
    if (underHill(cu, cv, z, h0)) {
      let [a, b] = [h0, h1];
      if (underHill(cu, cv, z, h1)) a = h1;
      else {
        for (let i = 0; i < 7; i++) {
          if (underHill(cu, cv, z, (a + b) / 2)) a = (a + b) / 2;
          else b = (a + b) / 2;
        }
      }
      cover(h0, a === h1 ? h1 : b);
    }
    return [lo, hi];
  };

  /** How much of a walker standing at (u, v, z) something nearer covers, along each column of their figure. */
  const coverAt = (u: number, v: number, z: number): Cover => {
    const out = NONE();
    const near = nearOf(u, v, z, (WALKER_WIDTH / 2) * ACROSS + 0.5);
    for (let j = 0; j < COLUMNS; j++) {
      const across = (j / (COLUMNS - 1) - 0.5) * WALKER_WIDTH;
      [out.lo[j], out.hi[j]] = columnAt(u + across * ACROSS, v - across * ACROSS, z, 0, WALKER_HEIGHT, near);
    }
    return out;
  };

  /**
   * Whether the point `h` up and `across` metres over (on the drawing) from a
   * walker at (u, v, z) is covered — the slow way, a step at a time along the
   * ray, to check coverAt against.
   */
  const pointCovered = (u: number, v: number, z: number, across: number, h: number) => {
    const [cu, cv] = [u + across * ACROSS, v - across * ACROSS];
    for (let s = 0; s <= REACH; s += 0.1) if (inSolid(cu - s, cv - s, z + h + s)) return true;
    const [x, y] = flat([cu, cv, z]);
    for (const o of grid.get(`${Math.floor(x / CELL)},${Math.floor((y + h) / CELL)}`) ?? []) {
      if (o.d < cu + cv && pointInRing([x, y + h], o.poly)) return true;
    }
    return underHill(cu, cv, z, h);
  };

  return { coverAt, columnAt, nearOf, pointCovered, zAt, terrain: t };
}

// ── A cover, told in levels and lines ─────────────────────────────────────

/** Levels up the figure, covered from `lo` to `hi` along each column — rounded to cover more, never less (none where hi is 0). */
type Levels = { lo: number[]; hi: number[] };
const toLevels = (c: Cover): Levels => {
  const lo: number[] = [];
  const hi: number[] = [];
  for (let j = 0; j < COLUMNS; j++) {
    const none = !(c.hi[j] > c.lo[j]);
    const [a, b] = none ? [0, 0] : [Math.floor((c.lo[j] / WALKER_HEIGHT) * LEVELS + 1e-6), Math.ceil((c.hi[j] / WALKER_HEIGHT) * LEVELS - 1e-6)];
    lo.push(b > a ? a : 0);
    hi.push(b > a ? b : 0);
  }
  return { lo, hi };
};
const covers = (l: Levels) => l.hi.some((h) => h > 0);
/** Two covers together: as much as either covers. */
const union = (a: Levels, b: Levels): Levels => {
  const lo: number[] = [];
  const hi: number[] = [];
  for (let j = 0; j < COLUMNS; j++) {
    const [na, nb] = [a.hi[j] === 0, b.hi[j] === 0];
    lo.push(na ? b.lo[j] : nb ? a.lo[j] : Math.min(a.lo[j], b.lo[j]));
    hi.push(Math.max(a.hi[j], b.hi[j]));
  }
  return { lo, hi };
};
/** How much more `all` covers than `one`, in levels, at the worst column. */
const overBy = (all: Levels, one: Levels) => {
  let worst = 0;
  for (let j = 0; j < COLUMNS; j++) {
    if (all.hi[j] === 0) continue;
    worst = Math.max(worst, one.hi[j] === 0 ? all.hi[j] - all.lo[j] : Math.max(all.hi[j] - one.hi[j], one.lo[j] - all.lo[j]));
  }
  return worst;
};
/** Covered all the way up (bar a hat's tip), across the figure. */
const wholly = (l: Levels) => l.hi.every((h, j) => j === 0 || j === COLUMNS - 1 || h - l.lo[j] >= LEVELS - 1);

/**
 * A line through the points (xs, levels) that's never below those it must
 * `keep` clear of — `under`: never above them — with as few bends as keep it
 * within `bend` levels of all of them (and between 0 and `top`).
 */
function fit(xs: number[], levels: number[], keep: boolean[], under: boolean, bend: number, top: number): [number, number][] {
  const n = xs.length;
  const along = (a: number, b: number, j: number) => levels[a] + ((levels[b] - levels[a]) * (xs[j] - xs[a])) / (xs[b] - xs[a]);
  // Douglas–Peucker: the ends, and whichever point strays furthest from the line between, until none strays far.
  const on = new Uint8Array(n);
  on[0] = on[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let [best, far] = [-1, bend];
    for (let j = a + 1; j < b; j++) {
      const d = Math.abs(levels[j] - along(a, b, j));
      if (d > far) [best, far] = [j, d];
    }
    if (best >= 0) {
      on[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < n; j++) if (on[j]) idx.push(j);
  const pts: [number, number][] = idx.map((j) => [xs[j], levels[j]]);
  // Lifted (or lowered) where it cuts a corner off the points it must keep clear of.
  const worstOf = (i: number) => {
    const [[x0, l0], [x1, l1]] = [pts[i], pts[i + 1]];
    let worst = 0;
    for (let j = idx[i]; j <= idx[i + 1]; j++) {
      if (!keep[j]) continue;
      const at = l0 + ((l1 - l0) * (xs[j] - x0)) / (x1 - x0);
      worst = Math.max(worst, under ? at - levels[j] : levels[j] - at);
    }
    return worst;
  };
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (let i = 0; i + 1 < pts.length; i++) {
      const worst = worstOf(i);
      if (worst <= 1e-6) continue;
      const by = Math.ceil(worst - 1e-6) * (under ? -1 : 1);
      for (const p of [pts[i], pts[i + 1]]) p[1] = Math.max(0, Math.min(top, p[1] + by));
      moved = true;
    }
    if (!moved) break;
  }
  // (Where that can't be done, every point as it is.)
  for (let i = 0; i + 1 < pts.length; i++) if (worstOf(i) > 1e-6) return xs.map((x, j) => [x, levels[j]]);
  return pts;
}
const COLUMN_XS = Array.from({ length: COLUMNS }, (_, j) => j);
const line = (levels: number[], keep: boolean[], under: boolean) => fit(COLUMN_XS, levels, keep, under, BEND, LEVELS);

export const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
/** A cover for the app: its top line, and its bottom line if it's a band — as (column, level) pairs. */
function told(l: Levels): string {
  const band = l.lo.some((a, j) => l.hi[j] > 0 && a > 0);
  // Where a column's uncovered the line comes down to meet it: to the feet, or to the band's foot.
  const nearest = (j: number) => {
    for (let d = 1; d < COLUMNS; d++) for (const k of [j - d, j + d]) if (k >= 0 && k < COLUMNS && l.hi[k] > 0) return k;
    return j;
  };
  const keep = l.hi.map((h) => h > 0);
  const hi = l.hi.map((h, j) => (keep[j] ? h : band ? l.lo[nearest(j)] : 0));
  const lo = l.lo.map((a, j) => (keep[j] ? a : band ? l.lo[nearest(j)] : 0));
  const top = line(hi, keep, false);
  const foot = band ? line(lo, keep, true) : [];
  const bottom = foot.some(([, a]) => a > 0) ? foot : [];
  const pairs = (ps: [number, number][]) => B64[ps.length] + ps.map(([j, a]) => B64[j] + B64[a]).join("");
  return pairs(top) + pairs(bottom);
}
/** A count, in base-64 digits: five bits each, the low ones first, a sixth bit to say more follow. */
const varint = (n: number) => {
  let code = "";
  while (n >= 32) {
    code += B64[32 + (n & 31)];
    n >>= 5;
  }
  return code + B64[n];
};
const frac = (f: number, up: boolean) => {
  const n = Math.max(0, Math.min(4095, up ? Math.ceil(f * 4095) : Math.floor(f * 4095)));
  return B64[n >> 6] + B64[n & 63];
};

/** The network of walkable streets in `box`: points on the ground (u, v, z), and the stretches between them. */
export function network(box: { u0: number; v0: number; u1: number; v1: number }, zAt: (u: number, v: number) => number) {
  // ── By OpenStreetMap node ───────────────────────────────────────────────
  const ways: OsmWay[] = JSON.parse(fs.readFileSync("data/osm-streets.json", "utf8")).elements;
  const at = new Map<number, Pt>();
  const adj = new Map<number, Set<number>>();
  const inside = ([u, v]: Pt) => u > box.u0 + 5 && u < box.u1 - 5 && v > box.v0 + 5 && v < box.v1 - 5;
  const link = (a: number, b: number) => {
    if (a === b) return;
    (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
    (adj.get(b) ?? adj.set(b, new Set()).get(b)!).add(a);
  };
  for (const w of ways) {
    if (!WALKABLE.has(w.tags?.highway ?? "") || w.tags?.tunnel === "yes" || !w.nodes || !w.geometry) continue;
    if (w.nodes.length !== w.geometry.length) continue;
    const pts = w.geometry.map(({ lat, lon }) => {
      const q = toLocal(lat, lon);
      return [q.u, q.v] as Pt;
    });
    w.nodes.forEach((id, i) => at.set(id, pts[i]));
    for (let i = 1; i < w.nodes.length; i++) {
      if (inside(pts[i - 1]) && inside(pts[i])) link(w.nodes[i - 1], w.nodes[i]);
    }
  }
  // Only networks of a size to wander.
  const seen = new Set<number>();
  for (const start of [...adj.keys()]) {
    if (seen.has(start)) continue;
    const part = [start];
    seen.add(start);
    for (let i = 0; i < part.length; i++) {
      for (const n of adj.get(part[i])!) if (!seen.has(n)) (seen.add(n), part.push(n));
    }
    if (part.length < SMALLEST) for (const n of part) adj.delete(n);
  }
  for (const [n, ns] of adj) for (const m of ns) if (!adj.has(m)) ns.delete(m);

  // ── Chains between junctions, simplified, stepped onto the terraces ─────
  const key = (n: number) => adj.get(n)!.size !== 2;
  const verts: P3[] = [];
  const vertOf = new Map<number, number>();
  const vertex = (p: P3, id?: number) => {
    if (id !== undefined && vertOf.has(id)) return vertOf.get(id)!;
    verts.push(p);
    if (id !== undefined) vertOf.set(id, verts.length - 1);
    return verts.length - 1;
  };
  const links: [number, number][] = [];
  const done = new Set<string>();
  const walkChain = (a: number, b: number) => {
    const ids = [a, b];
    while (!key(ids[ids.length - 1]) && ids[ids.length - 1] !== a) {
      const [prev, here] = [ids[ids.length - 2], ids[ids.length - 1]];
      const next = [...adj.get(here)!].find((n) => n !== prev)!;
      ids.push(next);
    }
    for (let i = 1; i < ids.length; i++) done.add(`${ids[i - 1]}>${ids[i]}`), done.add(`${ids[i]}>${ids[i - 1]}`);
    const line = simplify(ids.map((id) => at.get(id)!), 1);
    // Up and down the terraces: where the level changes, a step.
    const out: P3[] = [];
    for (let i = 0; i < line.length; i++) {
      const [u, v] = line[i];
      if (i === 0) {
        out.push([u, v, zAt(u, v)]);
        continue;
      }
      const [pu, pv] = line[i - 1];
      const n = Math.max(1, Math.ceil(Math.hypot(u - pu, v - pv) / 4));
      let z = out[out.length - 1][2];
      for (let k = 1; k <= n; k++) {
        const su = pu + ((u - pu) * k) / n;
        const sv = pv + ((v - pv) * k) / n;
        const sz = zAt(su, sv);
        if (sz !== z) {
          out.push([su, sv, z], [su, sv, sz]);
          z = sz;
        }
      }
      const last = out[out.length - 1];
      if (last[0] !== u || last[1] !== v) out.push([u, v, z]);
    }
    const first = vertex(out[0], ids[0]);
    const lastId = ids[ids.length - 1];
    let prev = first;
    for (let i = 1; i < out.length; i++) {
      const v = i === out.length - 1 ? vertex(out[i], lastId) : vertex(out[i]);
      if (v !== prev) links.push([prev, v]);
      prev = v;
    }
  };
  for (const [a, ns] of adj) {
    if (!key(a)) continue;
    for (const b of ns) if (!done.has(`${a}>${b}`)) walkChain(a, b);
  }
  // Rings with no junction on them.
  for (const [a, ns] of adj) for (const b of ns) if (!done.has(`${a}>${b}`)) walkChain(a, b);
  return { verts, links };
}

async function main() {
  const t0 = Date.now();
  const box = CITY_BOX;
  const { coverAt, columnAt, nearOf, zAt } = await occlusion(box);
  const COS30 = Math.cos(Math.PI / 6);
  const { verts, links } = network(box, zAt);
  console.log(`network: ${verts.length} points, ${links.length} stretches, ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // ── Along each stretch, either side: where a walker's covered, and how ──
  // (Keyed 2 × stretch for those walking a → b, on its right; 2 × stretch + 1 for those walking back.)
  const hidden: Record<number, number[]> = {};
  const skylines: Record<number, string> = {};
  const cuts: Record<number, string> = {};
  let [total, out, covers_, bends, skyLanes, lanes] = [0, 0, 0, 0, 0, 0];
  links.forEach(([a, b], i) => {
    const [pa, pb] = [verts[a], verts[b]];
    // A step up or down a terrace wall: climbed out of sight.
    if (pa[0] === pb[0] && pa[1] === pb[1]) {
      hidden[2 * i] = hidden[2 * i + 1] = [0, 1];
      return;
    }
    const [du, dv] = [pb[0] - pa[0], pb[1] - pa[1]];
    const len = Math.hypot(du, dv);
    const n = Math.max(2, Math.ceil(len / SAMPLE));
    const [ru, rv] = [dv / len, -du / len];
    // Across the drawing, and up it, from a to b.
    const [dX, dY] = [(du - dv) * COS30, (du + dv) / 2];
    const sky = Math.abs(dX) > 0.5 && Math.abs((du + dv) / dX) <= SKYLINE_SLANT;
    for (const side of [0, 1]) {
      const off = (side === 0 ? 1 : -1) * KEEP_RIGHT;
      const P = (f: number): P3 => [pa[0] + du * f + ru * off, pa[1] + dv * f + rv * off, pa[2]];
      lanes++;
      // Where a walker here is covered all over (bar the edges of their box), a fraction along.
      const whole: boolean[] = [];
      if (sky) {
        skyLanes++;
        // The lane's skyline: how far up the line over each point along it (and a figure's width on, beyond its ends) something nearer covers it.
        const slope = dY / dX;
        const ext = (WALKER_WIDTH / 2 + 0.4) / Math.abs(dX);
        const m = Math.ceil(((1 + 2 * ext) * Math.abs(dX)) / SKYLINE_STEP);
        const reach = Math.abs(slope) * (WALKER_WIDTH / 2) + 0.5;
        const ts: number[] = [];
        const top: number[] = [];
        const foot: number[] = [];
        const keep: boolean[] = [];
        let band = false;
        for (let k = 0; k <= m; k++) {
          const f = -ext + ((1 + 2 * ext) * k) / m;
          const [u, v, z] = P(f);
          const [lo, hi] = columnAt(u, v, z, -reach, WALKER_HEIGHT + reach, nearOf(u, v, z, 0.5));
          ts.push(f * Math.abs(dX));
          keep.push(hi > lo);
          top.push(hi > lo ? Math.max(0, Math.min(63, Math.ceil((hi + SKY_BASE) / SKY_LEVEL - 1e-6))) : 0);
          foot.push(hi > lo ? Math.max(0, Math.min(63, Math.floor((lo + SKY_BASE) / SKY_LEVEL + 1e-6))) : 0);
          if (hi > lo && lo > -reach + 0.01) band = true;
        }
        // A walker a fraction f along is covered all over where, across most of their width, the skyline is over their head and down to their feet.
        const sheet = (k: number, f: number) => slope * (ts[k] - f * Math.abs(dX)) * Math.sign(dX);
        for (let q = 0; q < n; q++) {
          const f = (q + 0.5) / n;
          let all = true;
          for (let k = 0; k <= m && all; k++) {
            const across = (ts[k] - f * Math.abs(dX)) * Math.sign(dX);
            if (Math.abs(across) > WALKER_WIDTH * 0.4) continue;
            const lift = sheet(k, f);
            if (!keep[k] || top[k] * SKY_LEVEL - SKY_BASE + lift < WALKER_HEIGHT - 0.5 || foot[k] * SKY_LEVEL - SKY_BASE + lift > 0) all = false;
          }
          whole.push(all);
        }
        if (keep.some(Boolean)) {
          const vertex = (ps: [number, number][]) => {
            bends += ps.length;
            let code = varint(ps.length);
            let last = -SKY_BACK;
            ps.forEach(([t, l]) => {
              const at = Math.round(t * 10);
              code += varint(at - last) + B64[l];
              last = at;
            });
            return code;
          };
          const feet = band ? fit(ts, foot, keep, true, SKY_BEND, 63) : [];
          skylines[2 * i + side] = vertex(fit(ts, top, keep, false, SKY_BEND, 63)) + (feet.length ? vertex(feet) : varint(0));
          covers_++;
        }
      } else {
        // Steep across the drawing: the cover across a walker's figure at each place along the way, and over each step between two: as much as at either end.
        const at: Levels[] = [];
        for (let k = 0; k <= n; k++) at.push(toLevels(coverAt(...P(k / n))));
        const steps = Array.from({ length: n }, (_, k) => union(at[k], at[k + 1]));
        // A glimpse between two covers, covered over.
        for (let k = 0; k < n; k++) {
          if (covers(steps[k])) continue;
          let e = k;
          while (e < n && !covers(steps[e])) e++;
          if (k > 0 && e < n && ((e - k) * len) / n < SHORTEST_GAP) {
            const both = union(steps[k - 1], steps[e]);
            for (let q = k; q < e; q++) steps[q] = both;
          }
          k = e;
        }
        // Runs of a cover: carried on while it stays within SLACK of each step's own.
        type Run = { from: number; to: number; l: Levels; parts: Levels[] };
        const runs: Run[] = [];
        for (let k = 0; k < n; k++) {
          const last = runs[runs.length - 1];
          const st = steps[k];
          if (last && covers(last.l) === covers(st)) {
            const both = union(last.l, st);
            if (!covers(st) || [...last.parts, st].every((p) => overBy(both, p) <= SLACK)) {
              last.to = k + 1;
              last.l = both;
              last.parts.push(st);
              continue;
            }
          }
          runs.push({ from: k, to: k + 1, l: st, parts: [st] });
        }
        let code = "";
        let prev = "";
        let count = 0;
        for (const r of runs) {
          for (let k = r.from; k < r.to; k++) whole[k] = covers(r.l) && wholly(r.l);
          if (!covers(r.l)) {
            prev = "";
            continue;
          }
          const t = told(r.l);
          // (Back to back with the same cover as the last, once told: the last runs on.)
          if (t === prev) code = code.slice(0, code.length - prev.length - 2) + frac(r.to / n, true) + t;
          else {
            code += frac(r.from / n, false) + frac(r.to / n, true) + t;
            covers_++;
            count++;
          }
          prev = t;
        }
        if (code) cuts[2 * i + side] = varint(count) + code;
      }
      // Out of sight: those runs, without the blinks — a glimpse between two houses isn't worth showing, nor a moment behind a lamp-post's worth of something.
      const hide: number[] = [];
      for (let q = 0; q < n; q++) {
        total++;
        if (whole[q]) out++;
        if (!whole[q] || (q > 0 && whole[q - 1])) continue;
        let e = q;
        while (e < n && whole[e]) e++;
        hide.push(+(q / n).toFixed(4), +(e / n).toFixed(4));
      }
      const tidy = steady(hide, len);
      if (tidy.length) hidden[2 * i + side] = tidy;
    }
    if (i % 4000 === 0) console.log(`  ${i}/${links.length} stretches, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  });
  console.log(
    `hidden: ${((out / total) * 100).toFixed(1)}% of ${total} metres; ${skyLanes}/${lanes} lanes by skyline (${bends} points); ${covers_} covers; ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
  /** Each lane's told one after another, keyed by how many keys on from the last. */
  const packed = (lanes: Record<number, string>) => {
    let last = -1;
    return Object.keys(lanes)
      .map(Number)
      .sort((p, q) => p - q)
      .map((k) => {
        const code = varint(k - last) + lanes[k];
        last = k;
        return code;
      })
      .join("");
  };

  // ── Out, as points on the drawing ───────────────────────────────────────
  const nodes: number[] = [];
  for (const p of verts) {
    const q = iso(p[0], p[1], p[2]);
    nodes.push(Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10);
  }
  fs.writeFileSync(
    OUT,
    `// AUTO-GENERATED by scripts/iso/walks.ts — do not edit.\n` +
      `/**\n * The streets the city map's walkers walk: points on the drawing (x, y in metres,\n` +
      ` * in pairs) and the stretches between them (pairs of points). Each stretch has two\n` +
      ` * lanes, keyed 2 × stretch for those walking it from its first point (on the right\n` +
      ` * of its middle) and 2 × stretch + 1 for those walking back. For each: where along\n` +
      ` * it a walker is out of sight (\`hidden\`, from–to fractions in pairs); and how much\n` +
      ` * of them is covered where they're partly so, told in base-64 digits (\`skylines\`\n` +
      ` * and \`cuts\`: lane after lane, each from the count of keys on from the last).\n` +
      ` * A skyline: its top line, then its foot (a count of points, then each as tenths of\n` +
      ` * a metre on across the drawing from the last, from ${SKY_BACK} before the lane's start,\n` +
      ` * and a level of ${SKY_LEVEL} m from ${SKY_BASE} m below the lane); a lane's cuts: a count,\n` +
      ` * then each from and to (two digits each, of 4095ths), its top line and foot (a\n` +
      ` * count, then column and level: ${COLUMNS} columns across the figure, ${LEVELS} levels up it).\n */\n` +
      `export const ISO_WALKS: { height: number; keepRight: number; columns: number; levels: number; sky: { level: number; base: number; back: number }; nodes: number[]; links: number[]; hidden: Record<number, number[]>; skylines: string; cuts: string } = ${JSON.stringify(
        {
          height: WALKER_HEIGHT,
          keepRight: KEEP_RIGHT,
          columns: COLUMNS,
          levels: LEVELS,
          sky: { level: SKY_LEVEL, base: SKY_BASE, back: SKY_BACK },
          nodes,
          links: links.flat(),
          hidden,
          skylines: packed(skylines),
          cuts: packed(cuts),
        },
      )};\n`,
  );
  console.log(`${OUT}: ${(fs.statSync(OUT).size / 1e3).toFixed(0)} kB, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
if (process.argv[1]?.endsWith("walks.ts")) main();
