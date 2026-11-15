/**
 * The city's green and its inland water, for the isometric scene
 * (scripts/iso/scene.ts): parks, lawns, gardens and the cemetery as green
 * ground, playing fields with their chalk lines, hard courts a shade deeper,
 * lakes and lagoons as water with ruled waves like the Bay's — each laid on
 * the terraces it lies across, cut to their edges, so none floats over a
 * lower one.
 */
import { contours } from "d3-contour";

import { toLocal } from "../../lib/iso";
import { area, clipRing, minRect, open, orient, pointInRing, simplify, smooth, type Box, type Pt, type Ring } from "./geom";

type P3 = [number, number, number];
type OsmWay = { tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] };

/** What a green (or wet) area is, for how it's drawn and what grows on it. */
export type GreenKind = "park" | "lawn" | "garden" | "cemetery" | "pitch" | "court" | "water";

export type GreenArea = { kind: GreenKind; ring: Ring; area: number; name?: string };

/** Sports played on grass; any other pitch is a hard court. */
const GRASS_SPORTS = /^(soccer|baseball|softball|american_football|rugby|rugby_union|field_hockey|cricket|multi|athletics|lacrosse|ultimate|kickball|baseball;soccer|soccer;baseball)$/;

function kindOf(t: Record<string, string>): GreenKind | null {
  if (t.natural === "water" || ["pond", "lake", "reservoir", "lagoon"].includes(t.water ?? "")) {
    return t.water === "wastewater" ? null : "water";
  }
  if (t.leisure === "pitch") {
    const grass = /grass/.test(t.surface ?? "") || (!t.surface && GRASS_SPORTS.test(t.sport ?? ""));
    return grass ? "pitch" : "court";
  }
  if (["park", "common", "nature_reserve"].includes(t.leisure ?? "") || ["recreation_ground", "village_green"].includes(t.landuse ?? "")) return "park";
  if (["grass", "meadow"].includes(t.landuse ?? "") || t.natural === "grassland") return "lawn";
  if (t.leisure === "garden") return "garden";
  if (t.landuse === "cemetery") return "cemetery";
  return null;
}

/** The green and wet areas in `box` (and a little beyond), largest first. */
export function greenAreas(features: OsmWay[], box: Box): GreenArea[] {
  const out: GreenArea[] = [];
  for (const w of features) {
    const kind = w.tags ? kindOf(w.tags) : null;
    if (!kind || !w.geometry || w.geometry.length < 4) continue;
    const ring = orient(open(w.geometry.map(({ lat, lon }) => toLocal(lat, lon)).map(({ u, v }) => [u, v] as Pt)), true);
    let [u0, v0, u1, v1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [u, v] of ring) [u0, v0, u1, v1] = [Math.min(u0, u), Math.min(v0, v), Math.max(u1, u), Math.max(v1, v)];
    if (u1 < box.u0 || u0 > box.u1 || v1 < box.v0 || v0 > box.v1) continue;
    const a = area(ring);
    if (a < 40) continue;
    out.push({ kind, ring, area: a, name: w.tags?.name });
  }
  return out.sort((p, q) => q.area - p.area);
}

/** Which green area (the smallest, so a field over its park) a point lies in, if any. */
export function greenIndex(areas: GreenArea[]) {
  const CELL = 100;
  const grid = new Map<string, GreenArea[]>();
  for (const g of areas) {
    let [u0, v0, u1, v1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [u, v] of g.ring) [u0, v0, u1, v1] = [Math.min(u0, u), Math.min(v0, v), Math.max(u1, u), Math.max(v1, v)];
    for (let cu = Math.floor(u0 / CELL); cu <= Math.floor(u1 / CELL); cu++) {
      for (let cv = Math.floor(v0 / CELL); cv <= Math.floor(v1 / CELL); cv++) {
        const k = `${cu},${cv}`;
        (grid.get(k) ?? grid.set(k, []).get(k)!).push(g);
      }
    }
  }
  return (p: Pt): GreenArea | null => {
    let best: GreenArea | null = null;
    for (const g of grid.get(`${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`) ?? []) {
      if ((!best || g.area < best.area) && pointInRing(p, g.ring)) best = g;
    }
    return best;
  };
}

/** The terraces as drawn: for each level, the rings of land at or above it (outer rings and holes). */
export type Terraces = Map<number, Ring[]>;

/** The grid lawns are cut to the terraces on, metres: the same everywhere. */
const GRID = 2;

/**
 * A ring laid on the terraces: for each level it lies across, the part of it
 * on that level's land (`polys`: the parts under higher terraces are covered
 * by them, as they're drawn later), and the part of that left in sight
 * (`open`: not under a higher terrace, nor in any of `minus` — the smaller
 * lawns and the courts and lakes on it, which have their own). On one level,
 * the whole ring; across several, cut on a grid to the terraces as drawn, a
 * little inside their edges — a grid the same for every ring, so one's `open`
 * meets the next's without a gap or an overlap.
 */
export function onTerraces(
  ring: Ring,
  box: Box,
  terraces: Terraces,
  levelAt: (u: number, v: number) => number,
  minus: Ring[] = [],
): { level: number; polys: Ring[][]; open: Ring[][] }[] {
  const r = clipRing(ring, box);
  if (r.length < 3 || area(r) < 20) return [];
  let [u0, v0, u1, v1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [u, v] of r) [u0, v0, u1, v1] = [Math.min(u0, u), Math.min(v0, v), Math.max(u1, u), Math.max(v1, v)];
  // The levels it lies across: at its corners, and over its inside.
  const levels = new Set<number>();
  for (const [u, v] of r) levels.add(levelAt(u, v));
  const step = Math.max(3, Math.sqrt(area(r)) / 14);
  for (let u = u0 + step / 2; u < u1; u += step) {
    for (let v = v0 + step / 2; v < v1; v += step) if (pointInRing([u, v], r)) levels.add(levelAt(u, v));
  }
  const near = (level: number, pad: number) =>
    (terraces.get(level) ?? []).filter((rr) => rr.some(([u, v]) => u > u0 - pad && u < u1 + pad && v > v0 - pad && v < v1 + pad));
  const single = levels.size === 1 ? [...levels][0] : null;
  if (single !== null && single < 0) return [];
  // On one level, with no higher terrace near and nothing to leave out: all of it, and all in sight.
  if (single !== null && !near(single + 1, 10).length && !minus.length) return [{ level: single, polys: [[r]], open: [[r]] }];
  // Otherwise: a mask of the ring and of each level's land, on the grid.
  const cell = GRID;
  const [gu, gv] = [Math.floor(u0 / cell) * cell - cell, Math.floor(v0 / cell) * cell - cell];
  const cols = Math.ceil((u1 - gu) / cell) + 2;
  const rows = Math.ceil((v1 - gv) / cell) + 2;
  const mask = (rings: Ring[]) => {
    const m = new Uint8Array(cols * rows);
    for (let j = 0; j < rows; j++) {
      const v = gv + j * cell;
      const xs: number[] = [];
      for (const rr of rings) {
        for (let i = 0, p = rr.length - 1; i < rr.length; p = i++) {
          const [a, b] = [rr[p], rr[i]];
          if (a[1] > v === b[1] > v) continue;
          xs.push(a[0] + ((v - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const i0 = Math.max(0, Math.ceil((xs[k] - gu) / cell));
        const i1 = Math.min(cols - 1, Math.floor((xs[k + 1] - gu) / cell));
        for (let i = i0; i <= i1; i++) m[j * cols + i] = 1;
      }
    }
    return m;
  };
  /** A cell and its four neighbours all in the mask (eroded), or any of them (dilated). */
  const all = (m: Uint8Array, k: number) => m[k] && m[k - 1] && m[k + 1] && m[k - cols] && m[k + cols];
  const some = (m: Uint8Array, k: number) => m[k] || m[k - 1] || m[k + 1] || m[k - cols] || m[k + cols];
  const shapes = (values: Float64Array): Ring[][] => {
    const out: Ring[][] = [];
    for (const poly of contours().size([cols, rows]).thresholds([0.5])(Array.from(values))[0].coordinates) {
      const rings = poly
        .map((rr, i) => orient(simplify(smooth(open(rr.map(([x, y]) => [gu + x * cell, gv + y * cell] as Pt)), 1), cell * 0.35), i === 0))
        .filter((rr) => rr.length >= 3 && area(rr) > 4);
      if (rings.length && area(rings[0]) > 20) out.push(rings);
    }
    return out;
  };
  const inside = mask([r]);
  const cut = minus.length ? mask(minus) : null;
  const out: { level: number; polys: Ring[][]; open: Ring[][] }[] = [];
  for (const level of [...levels].sort((a, b) => a - b)) {
    if (level < 0) continue;
    const ground = single !== null ? null : mask(near(level, 500));
    const above = mask(near(level + 1, 500));
    const on = new Float64Array(cols * rows);
    const seen = new Float64Array(cols * rows);
    let any = false;
    for (let j = 1; j < rows - 1; j++) {
      for (let i = 1; i < cols - 1; i++) {
        const k = j * cols + i;
        // On this level's land, kept a little inside the terrace's edge; in sight where no higher one is near.
        if (!inside[k] || (ground && !all(ground, k))) continue;
        on[k] = 1;
        any = true;
        if (!some(above, k) && !(cut && cut[k])) seen[k] = 1;
      }
    }
    if (!any) continue;
    out.push({ level, polys: single !== null ? [[r]] : shapes(on), open: shapes(seen) });
  }
  return out;
}

/**
 * A playing field's chalk lines, inset from its edge: the touchline round
 * it, and across a long field the halfway line and centre circle — or a
 * court's outline and net. Rings in local metres, or none for a field
 * that isn't near enough rectangular.
 */
export function chalkLines(ring: Ring, court: boolean): Ring[][] {
  const m = minRect(ring);
  if (m.fill < 0.8 || m.short < 8) return [];
  const [c0, c1, c2, c3] = m.corners;
  // Along the long side (c0 → c1), and across (c0 → c3).
  const L: Pt = [(c1[0] - c0[0]) / m.long, (c1[1] - c0[1]) / m.long];
  const S: Pt = [(c3[0] - c0[0]) / m.short, (c3[1] - c0[1]) / m.short];
  const at = (s: number, t: number): Pt => [c0[0] + L[0] * s + S[0] * t, c0[1] + L[1] * s + S[1] * t];
  void c2;
  const inset = court ? 1 : Math.min(3, m.short * 0.06);
  const w = court ? 0.35 : 0.6;
  const rect = (s0: number, t0: number, s1: number, t1: number): Ring => [at(s0, t0), at(s1, t0), at(s1, t1), at(s0, t1)];
  const out: Ring[][] = [];
  // The touchline: a frame, the outer rectangle less the inner.
  const [a, b] = [inset, inset + w];
  out.push([rect(a, a, m.long - a, m.short - a), [...rect(b, b, m.long - b, m.short - b)].reverse()]);
  // Halfway (a court's net).
  out.push([rect(m.long / 2 - w / 2, a, m.long / 2 + w / 2, m.short - a)]);
  if (!court && m.long > 40) {
    const rad = Math.min(9, m.short * 0.15);
    const circle = (rr: number) => Array.from({ length: 24 }, (_, i) => at(m.long / 2 + Math.cos((i / 24) * 2 * Math.PI) * rr, m.short / 2 + Math.sin((i / 24) * 2 * Math.PI) * rr));
    out.push([circle(rad + w / 2), circle(rad - w / 2).reverse()]);
  }
  return out;
}

/** Ruled waves across a lake: short dashes in rows, as on the Bay, kept inside it. */
export function lakeWaves(rings: Ring[], z: number): P3[][] {
  const [outer, ...holes] = rings;
  let [u0, v0, u1, v1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [u, v] of outer) [u0, v0, u1, v1] = [Math.min(u0, u), Math.min(v0, v), Math.max(u1, u), Math.max(v1, v)];
  const wet = (p: Pt) => pointInRing(p, outer) && !holes.some((h) => pointInRing(p, h));
  const len = Math.max(8, Math.min(40, (u1 - u0) / 4));
  const gap = len * 2.4;
  const row = Math.max(10, Math.min(50, (v1 - v0) / 4));
  const out: P3[][] = [];
  let n = 0;
  for (let v = v0 + row / 2; v < v1; v += row, n++) {
    for (let u = u0 + (n % 2 ? gap / 2 : 0) + len * 0.3; u + len < u1; u += gap) {
      if (wet([u, v]) && wet([u + len, v]) && wet([u + len / 2, v])) out.push([[u, v, z], [u + len, v, z]]);
    }
  }
  return out;
}
