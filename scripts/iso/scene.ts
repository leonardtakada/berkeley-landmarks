/**
 * The isometric scene of Berkeley, as flat printed pieces in the order
 * they're laid down (back to front): the Bay, the land as stacked paper
 * terraces (one sheet per contour), the streets, trees, and every building
 * extruded from its OpenStreetMap footprint — the registry's landmarks in
 * vermilion. Geometry stays in local metres (u east, v north, z up); the
 * renderers (walk plates, the city map) project it with lib/iso.ts.
 *
 * Shading is flat, two tones a surface, lit from the west as on the cover:
 * walls facing west print light, walls facing south print in shade.
 */
import fs from "node:fs";
import { contours } from "d3-contour";

import { landmarks } from "../../data/landmarks";
import { toLocal } from "../../lib/iso";
import {
  area,
  centroid,
  clipLine,
  clipRing,
  densify,
  minRect,
  open,
  orient,
  pointInRing,
  simplify,
  smooth,
  type Box,
  type Pt,
  type Ring,
} from "./geom";
import { CELL, elevationAt, loadTerrain, type Terrain } from "./terrain";

export type P3 = [number, number, number];

export type Role =
  | "water"
  | "wave"
  | "shore"
  | "top"
  | "wall"
  | "cutSouth"
  | "cutWest"
  | "cutLine"
  | "street"
  | "path"
  | "trunk"
  | "crown"
  | "bldTop"
  | "bldLit"
  | "bldShade"
  | "roofLit"
  | "roofShade"
  | "lmTop"
  | "lmLit"
  | "lmShade"
  | "lmRoofLit"
  | "lmRoofShade"
  | "lmWindowLit"
  | "lmWindowShade";

export type Piece =
  | { kind: "poly"; role: Role; rings: P3[][]; level?: number }
  | { kind: "line"; role: Role; pts: P3[]; width: number }
  | { kind: "dot"; role: Role; at: P3; r: number };

/** Height of one terrace of the land, metres. */
export const LEVEL = 25;
/** How far the shore stands above the water. */
const SHORE = 4;

export interface SceneOptions {
  box: Box;
  /** Buildings' heights are drawn this many times true (the plates exaggerate). */
  heightScale?: number;
  /** Landmarks to leave out of the scene (drawn separately), by id. */
  omit?: Set<string>;
  /** Areas to clear of other buildings (around a separately drawn landmark), as screen-space tests. */
  clear?: (b: Building) => boolean;
  /** A plate: a block cut from the city, showing its cut faces to the south and west. */
  plate?: { depth: number };
}

export interface Building {
  id: number;
  ring: Ring;
  c: Pt;
  height: number;
  gable: { corners: Ring; rise: number } | null;
  /** A spire (or a pyramid roof) this tall over the walls. */
  spire?: number;
  /** A hipped roof, rising this far over a rectangular plan (`gable.corners`, long side first). */
  hip?: number;
  /** Not a building: a site, marked by a plaque laid on the ground. */
  site?: boolean;
  /** Windows in rows up the walls, this far apart (metres of the model). */
  windows?: number;
  landmark: string | null;
  base: number;
}

// ── Terrain ──────────────────────────────────────────────────────────────
let terrainP: Promise<Terrain> | null = null;
export const terrain = () => (terrainP ??= loadTerrain());

/** The terrace a point stands on: -1 in the water. */
export function levelAt(t: Terrain, u: number, v: number): number {
  const e = elevationAt(t, u, v);
  return e < 0.5 ? -1 : Math.floor(e / LEVEL);
}
export const levelZ = (k: number) => (k < 0 ? -SHORE : k * LEVEL);

/** The land above each terrace's contour, as smoothed rings in local metres. */
export function terraceRings(t: Terrain): { level: number; polys: Ring[][] }[] {
  let hi = 0;
  for (const z of t.z) hi = Math.max(hi, z);
  const thresholds = [0.5];
  for (let k = 1; k * LEVEL <= hi; k++) thresholds.push(k * LEVEL);
  const gen = contours().size([t.cols, t.rows]).thresholds(thresholds);
  return gen(Array.from(t.z)).map((mp, k) => ({
    level: k,
    polys: mp.coordinates
      .map((poly) =>
        poly
          .map((ring, i) =>
            orient(
              simplify(
                smooth(
                  open(ring.map(([x, y]) => [t.u0 + x * CELL, t.v0 + y * CELL] as Pt)),
                  2,
                ),
                2.5,
              ),
              i === 0,
            ),
          )
          .filter((r) => r.length >= 3 && area(r) > 400),
      )
      .filter((p) => p.length && area(p[0]) > 1500),
  }));
}

/** Edges of a ring that face the viewer (from the south-west), as wall quads. */
function walls(ring: Ring, z0: number, z1: number, box?: Box): { quad: P3[]; west: boolean }[] {
  const out: { quad: P3[]; west: boolean }[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    // Outward normal of a counter-clockwise ring (holes run clockwise, so theirs points into the hole).
    const nx = b[1] - a[1];
    const ny = -(b[0] - a[0]);
    if (nx + ny >= 0) continue;
    // A plate's own cut edges aren't walls: the cut faces are drawn for them.
    if (box && onEdge(a, b, box)) continue;
    out.push({
      quad: [
        [a[0], a[1], z0],
        [b[0], b[1], z0],
        [b[0], b[1], z1],
        [a[0], a[1], z1],
      ],
      west: -nx > -ny,
    });
  }
  return out;
}

function onEdge(a: Pt, b: Pt, box: Box) {
  const e = 0.01;
  return (
    (Math.abs(a[0] - box.u0) < e && Math.abs(b[0] - box.u0) < e) ||
    (Math.abs(a[0] - box.u1) < e && Math.abs(b[0] - box.u1) < e) ||
    (Math.abs(a[1] - box.v0) < e && Math.abs(b[1] - box.v0) < e) ||
    (Math.abs(a[1] - box.v1) < e && Math.abs(b[1] - box.v1) < e)
  );
}

// ── OpenStreetMap ────────────────────────────────────────────────────────
type OsmWay = { type: string; id: number; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] };
let features: OsmWay[] | null = null;
let streets: OsmWay[] | null = null;
const load = (f: string): OsmWay[] => JSON.parse(fs.readFileSync(f, "utf8")).elements;
const localRing = (g: { lat: number; lon: number }[]): Ring => g.map(({ lat, lon }) => toLocal(lat, lon)).map(({ u, v }) => [u, v] as Pt);

const HOUSE = new Set(["house", "detached", "residential", "semidetached_house", "bungalow", "terrace", "church", "chapel", "cabin"]);

/** Height of a building, metres: from its tags, else guessed from its kind and size. */
function heightOf(tags: Record<string, string>, a: number): number {
  const h = parseFloat(tags.height ?? "");
  if (Number.isFinite(h) && h > 2) return h;
  const levels = parseFloat(tags["building:levels"] ?? "");
  if (Number.isFinite(levels) && levels > 0) return levels * 3.3 + 1;
  const kind = tags.building;
  if (kind === "garage" || kind === "garages" || kind === "shed" || kind === "carport" || kind === "roof") return 3;
  if (HOUSE.has(kind) && kind !== "church") return a < 120 ? 6 : 7.5;
  if (kind === "church" || kind === "cathedral") return 12;
  if (a < 150) return 6;
  if (a < 450) return 8;
  if (a < 1500) return 11;
  if (a < 4000) return 14;
  return 17;
}

let buildingsCache: Building[] | null = null;

/** Every building in the terrain box, with its height, roof and landmark. */
export async function buildings(): Promise<Building[]> {
  if (buildingsCache) return buildingsCache;
  const t = await terrain();
  features ??= load("data/osm-features.json");
  const out: Building[] = [];
  const umin = t.u0;
  const vmin = t.v0;
  const umax = t.u0 + (t.cols - 1) * CELL;
  const vmax = t.v0 + (t.rows - 1) * CELL;
  for (const w of features) {
    if (w.type !== "way" || !w.tags?.building || !w.geometry || w.geometry.length < 4) continue;
    const ring = orient(open(localRing(w.geometry)), true);
    const c = centroid(ring);
    if (c[0] < umin || c[0] > umax || c[1] < vmin || c[1] > vmax) continue;
    const a = area(ring);
    if (a < 12) continue;
    const kind = w.tags.building;
    const mr = minRect(ring);
    const pitched =
      (HOUSE.has(kind) || (kind === "yes" && a < 260)) && mr.fill > 0.72 && mr.long / Math.max(1, mr.short) < 3.2 && a < 600;
    out.push({
      id: w.id,
      ring: pitched ? orient(mr.corners, true) : simplify(ring, 0.6),
      c,
      height: heightOf(w.tags, a),
      gable: pitched ? { corners: mr.corners, rise: Math.min(5, Math.max(2, mr.short * 0.42)) } : null,
      landmark: null,
      base: levelZ(Math.max(0, levelAt(t, c[0], c[1]))),
    });
  }
  // The registry's landmarks: the building each one stands in.
  const grid = new Map<string, Building[]>();
  const key = (u: number, v: number) => `${Math.floor(u / 100)},${Math.floor(v / 100)}`;
  for (const b of out) grid.set(key(b.c[0], b.c[1]), [...(grid.get(key(b.c[0], b.c[1])) ?? []), b]);
  for (const l of landmarks) {
    if (l.category === "historic_district") continue;
    const { u, v } = toLocal(l.latitude, l.longitude);
    let best: Building | null = null;
    let bestD = 30;
    for (let du = -1; du <= 1; du++) {
      for (let dv = -1; dv <= 1; dv++) {
        for (const b of grid.get(key(u + du * 100, v + dv * 100)) ?? []) {
          if (pointInRing([u, v], b.ring)) [best, bestD] = [b, 0];
          else if (bestD > 0) {
            const d = Math.hypot(b.c[0] - u, b.c[1] - v);
            if (d < bestD) [best, bestD] = [b, d];
          }
        }
      }
    }
    if (best && !best.landmark) best.landmark = l.id;
  }
  return (buildingsCache = out);
}

/** A building's faces, back to front. */
export function buildingPieces(b: Building, hs: number, landmark = !!b.landmark): Piece[] {
  const z0 = b.base;
  const h = b.height * hs;
  const R = landmark
    ? { top: "lmTop", lit: "lmLit", shade: "lmShade", roofLit: "lmRoofLit", roofShade: "lmRoofShade" }
    : { top: "bldTop", lit: "bldLit", shade: "bldShade", roofLit: "roofLit", roofShade: "roofShade" };
  const out: Piece[] = [];
  const wallPieces: Piece[] = [];
  for (const w of walls(b.ring, z0, z0 + h)) {
    wallPieces.push({ kind: "poly", role: (w.west ? R.lit : R.shade) as Role, rings: [w.quad] });
    if (b.windows) wallPieces.push(...windowsIn(w.quad, b.windows, w.west));
  }
  if (b.site) {
    const ring = b.ring.map(([u, v]) => [u, v, z0 + 0.6] as P3);
    return [
      { kind: "poly", role: R.shade as Role, rings: [b.ring.map(([u, v]) => [u, v, z0] as P3)] },
      { kind: "poly", role: R.top as Role, rings: [ring] },
    ];
  }
  if (b.hip && b.gable) {
    const [c0, c1, c2, c3] = b.gable.corners;
    const zt = z0 + h;
    const zr = zt + b.hip;
    const cx = (c0[0] + c2[0]) / 2;
    const cy = (c0[1] + c2[1]) / 2;
    const long = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]);
    const short = Math.hypot(c2[0] - c1[0], c2[1] - c1[1]);
    const ax = (c1[0] - c0[0]) / long;
    const ay = (c1[1] - c0[1]) / long;
    const half = Math.max(0, long / 2 - short / 2);
    const r0: P3 = [cx - ax * half, cy - ay * half, zr];
    const r1: P3 = [cx + ax * half, cy + ay * half, zr];
    const at = (p: Pt): P3 => [p[0], p[1], zt];
    const ccw = (c1[0] - c0[0]) * (c2[1] - c1[1]) - (c1[1] - c0[1]) * (c2[0] - c1[0]) > 0;
    const face = (p: Pt, q: Pt, ring: P3[]) => {
      const nx = (q[1] - p[1]) * (ccw ? 1 : -1);
      const ny = -(q[0] - p[0]) * (ccw ? 1 : -1);
      return { ring, toward: nx + ny < 0, west: -nx > -ny };
    };
    const faces = [
      face(c0, c1, [at(c0), at(c1), r1, r0]),
      face(c1, c2, [at(c1), at(c2), r1]),
      face(c2, c3, [at(c2), at(c3), r0, r1]),
      face(c3, c0, [at(c3), at(c0), r0]),
    ];
    for (const f of faces.filter((f) => !f.toward)) out.push({ kind: "poly", role: R.roofShade as Role, rings: [f.ring] });
    out.push(...wallPieces);
    for (const f of faces.filter((f) => f.toward)) {
      out.push({ kind: "poly", role: (f.west ? R.roofLit : R.roofShade) as Role, rings: [f.ring] });
    }
    return out;
  }
  if (b.spire) {
    out.push(...wallPieces);
    const c = centroid(b.ring);
    const apex: P3 = [c[0], c[1], z0 + h + b.spire];
    const faces = b.ring.map((a, i) => {
      const q = b.ring[(i + 1) % b.ring.length];
      const nx = q[1] - a[1];
      const ny = -(q[0] - a[0]);
      return { tri: [[a[0], a[1], z0 + h], [q[0], q[1], z0 + h], apex] as P3[], toward: nx + ny < 0, west: -nx > -ny };
    });
    for (const f of faces.filter((f) => !f.toward)) out.push({ kind: "poly", role: R.roofShade as Role, rings: [f.tri] });
    for (const f of faces.filter((f) => f.toward)) {
      out.push({ kind: "poly", role: (f.west ? R.lit : R.shade) as Role, rings: [f.tri] });
    }
    return out;
  }
  if (!b.gable) {
    out.push(...wallPieces);
    out.push({ kind: "poly", role: R.top as Role, rings: [b.ring.map(([u, v]) => [u, v, z0 + h] as P3)] });
    return out;
  }
  const [c0, c1, c2, c3] = b.gable.corners;
  const mid = (p: Pt, q: Pt): Pt => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const r0 = mid(c0, c3);
  const r1 = mid(c1, c2);
  const zt = z0 + h;
  const zr = zt + b.gable.rise * Math.min(hs, 1.6);
  const slopes: { quad: P3[]; eave: [Pt, Pt] }[] = [
    { quad: [[c0[0], c0[1], zt], [c1[0], c1[1], zt], [r1[0], r1[1], zr], [r0[0], r0[1], zr]], eave: [c0, c1] },
    { quad: [[c2[0], c2[1], zt], [c3[0], c3[1], zt], [r0[0], r0[1], zr], [r1[0], r1[1], zr]], eave: [c2, c3] },
  ];
  const facing = ([a, q]: [Pt, Pt]) => {
    // Outward normal of an eave on a counter-clockwise ring.
    const ccw = (c1[0] - c0[0]) * (c2[1] - c1[1]) - (c1[1] - c0[1]) * (c2[0] - c1[0]) > 0;
    const nx = (q[1] - a[1]) * (ccw ? 1 : -1);
    const ny = -(q[0] - a[0]) * (ccw ? 1 : -1);
    return { toward: nx + ny < 0, west: -nx > -ny };
  };
  const slopeRole = (f: { toward: boolean; west: boolean }) => (f.toward && f.west ? R.roofLit : R.roofShade) as Role;
  for (const s of slopes) if (!facing(s.eave).toward) out.push({ kind: "poly", role: slopeRole(facing(s.eave)), rings: [s.quad] });
  out.push(...wallPieces);
  // Gable ends above the short walls that face the viewer.
  for (const [p, q, r] of [
    [c1, c2, r1],
    [c3, c0, r0],
  ] as [Pt, Pt, Pt][]) {
    const f = facing([p, q]);
    if (!f.toward) continue;
    out.push({ kind: "poly", role: (f.west ? R.lit : R.shade) as Role, rings: [[[p[0], p[1], zt], [q[0], q[1], zt], [r[0], r[1], zr]]] });
  }
  for (const s of slopes) if (facing(s.eave).toward) out.push({ kind: "poly", role: slopeRole(facing(s.eave)), rings: [s.quad] });
  return out;
}

/** Knocked-out windows, in rows and columns up a wall. */
function windowsIn(quad: P3[], pitch: number, west: boolean): Piece[] {
  const [a, b] = [quad[0], quad[1]];
  const z0 = a[2];
  const z1 = quad[2][2];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const cols = Math.floor(len / pitch);
  const rows = Math.floor((z1 - z0) / (pitch * 1.15));
  if (cols < 1 || rows < 1) return [];
  const out: Piece[] = [];
  const du = (b[0] - a[0]) / len;
  const dv = (b[1] - a[1]) / len;
  const colW = len / cols;
  const rowH = (z1 - z0) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const s0 = c * colW + colW * 0.3;
      const s1 = c * colW + colW * 0.7;
      const zz0 = z0 + r * rowH + rowH * 0.3;
      const zz1 = z0 + r * rowH + rowH * 0.78;
      const p = (s: number, z: number): P3 => [a[0] + du * s, a[1] + dv * s, z];
      out.push({ kind: "poly", role: west ? "lmWindowLit" : "lmWindowShade", rings: [[p(s0, zz0), p(s1, zz0), p(s1, zz1), p(s0, zz1)]] });
    }
  }
  return out;
}

// ── The scene ────────────────────────────────────────────────────────────
const STREET_WIDTH: Record<string, number> = {
  motorway: 22,
  trunk: 18,
  primary: 15,
  secondary: 14,
  tertiary: 12,
  residential: 9,
  unclassified: 9,
  living_street: 7,
  pedestrian: 6,
};

/** A building or tree, and how far back it stands (u + v): the drawing order among them, far first. */
export type Solid = { d: number; pieces: Piece[] };

export async function buildScene(
  o: SceneOptions,
): Promise<{ pieces: Piece[]; zAt: (u: number, v: number) => number; solids: Solid[] }> {
  const t = await terrain();
  const { box } = o;
  const hs = o.heightScale ?? 1;
  const pieces: Piece[] = [];
  const zAt = (u: number, v: number) => levelZ(levelAt(t, u, v));
  const rect: Ring = [
    [box.u0, box.v0],
    [box.u1, box.v0],
    [box.u1, box.v1],
    [box.u0, box.v1],
  ];
  const floor = o.plate ? -o.plate.depth : -SHORE - 2;

  // The Bay.
  pieces.push({ kind: "poly", role: "water", rings: [rect.map(([u, v]) => [u, v, -SHORE] as P3)] });
  for (let v = box.v0 + 40; v < box.v1; v += 80) {
    for (let u = box.u0 + ((v / 80) % 2) * 60; u < box.u1 - 60; u += 150) {
      if (levelAt(t, u, v) >= 0 || levelAt(t, u + 60, v) >= 0) continue;
      pieces.push({ kind: "line", role: "wave", pts: [[u, v, -SHORE], [u + 60, v, -SHORE]], width: 3 });
    }
  }

  // The land, a sheet of paper for each terrace, lowest first.
  for (const { level, polys } of terraceRings(t)) {
    const z1 = levelZ(level);
    const z0 = level === 0 ? -SHORE : levelZ(level - 1);
    for (const poly of polys) {
      const rings = poly.map((r) => clipRing(r, box)).filter((r) => r.length >= 3);
      if (!rings.length || rings[0].length < 3 || area(rings[0]) < 1) continue;
      for (const r of rings) {
        for (const w of walls(r, z0, z1, o.plate ? box : undefined)) {
          pieces.push({ kind: "poly", role: level === 0 ? "shore" : "wall", rings: [w.quad], level });
        }
      }
      pieces.push({ kind: "poly", role: "top", rings: rings.map((r) => r.map(([u, v]) => [u, v, z1] as P3)), level });
    }
  }

  // A plate's cut faces, to the south and west: the terraces in section.
  if (o.plate) {
    const profile = (from: Pt, to: Pt) => {
      const pts: P3[] = [];
      const n = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 4);
      let prev: number | null = null;
      for (let i = 0; i <= n; i++) {
        const u = from[0] + ((to[0] - from[0]) * i) / n;
        const v = from[1] + ((to[1] - from[1]) * i) / n;
        const z = zAt(u, v);
        if (prev !== null && z !== prev) pts.push([u, v, prev]);
        pts.push([u, v, z]);
        prev = z;
      }
      return pts;
    };
    const south = profile([box.u0, box.v0], [box.u1, box.v0]);
    const west = profile([box.u0, box.v1], [box.u0, box.v0]);
    pieces.push({
      kind: "poly",
      role: "cutWest",
      rings: [[[box.u0, box.v1, floor], ...west, [box.u0, box.v0, floor]]],
    });
    pieces.push({
      kind: "poly",
      role: "cutSouth",
      rings: [[[box.u0, box.v0, floor], ...south, [box.u1, box.v0, floor]]],
    });
  }

  // Streets, laid on the terraces.
  streets ??= load("data/osm-streets.json");
  for (const w of streets) {
    const width = w.tags?.highway ? STREET_WIDTH[w.tags.highway] : undefined;
    if (!width || !w.geometry) continue;
    if (w.tags?.tunnel === "yes" || w.tags?.bridge === "yes" && w.tags.highway === "motorway") continue;
    for (const run of clipLine(localRing(w.geometry), box)) {
      const pts = densify(run, 6).map(([u, v]) => [u, v, Math.max(0, zAt(u, v))] as P3);
      pieces.push({ kind: "line", role: "street", pts, width });
    }
  }

  // Trees in the parks and gardens, and along the creeks' green.
  features ??= load("data/osm-features.json");
  const GREEN = new Set(["park", "garden", "recreation_ground", "forest", "wood", "cemetery", "meadow", "nature_reserve"]);
  const trees: P3[] = [];
  for (const w of features) {
    const kind = w.tags?.leisure ?? w.tags?.landuse ?? w.tags?.natural;
    if (!kind || !GREEN.has(kind) || !w.geometry || w.geometry.length < 4) continue;
    const ring = open(localRing(w.geometry));
    const c = centroid(ring);
    if (c[0] < box.u0 - 300 || c[0] > box.u1 + 300 || c[1] < box.v0 - 300 || c[1] > box.v1 + 300) continue;
    let [a, b, cc, d] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const p of ring) [a, b, cc, d] = [Math.min(a, p[0]), Math.min(b, p[1]), Math.max(cc, p[0]), Math.max(d, p[1])];
    const step = kind === "forest" || kind === "wood" || kind === "nature_reserve" ? 22 : 30;
    for (let u = a + step / 2; u < cc; u += step) {
      for (let v = b + step / 2; v < d; v += step) {
        const jitter: Pt = [u + ((Math.sin(u * 12.9898 + v * 78.233) * 43758.5453) % 1) * 9, v + ((Math.sin(u * 39.3 + v * 11.1) * 9131.7) % 1) * 9];
        if (jitter[0] < box.u0 || jitter[0] > box.u1 || jitter[1] < box.v0 || jitter[1] > box.v1) continue;
        if (!pointInRing(jitter, ring) || levelAt(t, jitter[0], jitter[1]) < 0) continue;
        trees.push([jitter[0], jitter[1], zAt(jitter[0], jitter[1])]);
      }
    }
  }

  // And trees wherever there's room: along the blocks of houses, and
  // thick on the hills.
  const bs = (await buildings()).filter(
    (b) => b.c[0] > box.u0 - 50 && b.c[0] < box.u1 + 50 && b.c[1] > box.v0 - 50 && b.c[1] < box.v1 + 50,
  );
  const cellOf = (u: number, v: number) => `${Math.floor(u / 40)},${Math.floor(v / 40)}`;
  const near = new Map<string, Building[]>();
  for (const b of bs) {
    for (const [u, v] of b.ring) {
      const k = cellOf(u, v);
      const list = near.get(k) ?? [];
      if (!list.includes(b)) list.push(b);
      near.set(k, list);
    }
  }
  const roads = new Map<string, [Pt, Pt][]>();
  for (const w of streets) {
    if (!w.tags?.highway || !STREET_WIDTH[w.tags.highway] || !w.geometry) continue;
    const line = localRing(w.geometry);
    for (let i = 1; i < line.length; i++) {
      const k = cellOf((line[i][0] + line[i - 1][0]) / 2, (line[i][1] + line[i - 1][1]) / 2);
      roads.set(k, [...(roads.get(k) ?? []), [line[i - 1], line[i]]]);
    }
  }
  const rand = (u: number, v: number, s: number) => {
    const x = Math.sin(u * 12.9898 + v * 78.233 + s * 3.7) * 43758.5453;
    return x - Math.floor(x);
  };
  // Groves: a smooth field of more and fewer trees, so they gather.
  const grove = (u: number, v: number) => {
    const g = 90;
    const [iu, iv] = [Math.floor(u / g), Math.floor(v / g)];
    const [fu, fv] = [u / g - iu, v / g - iv];
    const sm = (x: number) => x * x * (3 - 2 * x);
    const n = (a: number, b: number) => rand(a * 7.1, b * 3.3, 9);
    const top = n(iu, iv) + (n(iu + 1, iv) - n(iu, iv)) * sm(fu);
    const bot = n(iu, iv + 1) + (n(iu + 1, iv + 1) - n(iu, iv + 1)) * sm(fu);
    return top + (bot - top) * sm(fv);
  };
  const clearOf = (p: Pt) => {
    const [cu, cv] = [Math.floor(p[0] / 40), Math.floor(p[1] / 40)];
    for (let du = -1; du <= 1; du++) {
      for (let dv = -1; dv <= 1; dv++) {
        const k = `${cu + du},${cv + dv}`;
        for (const b of near.get(k) ?? []) {
          if (pointInRing(p, b.ring)) return false;
          if (Math.hypot(b.c[0] - p[0], b.c[1] - p[1]) < Math.sqrt(area(b.ring)) * 0.5 + 4) return false;
        }
        for (const [a, b] of roads.get(k) ?? []) {
          const dx = b[0] - a[0];
          const dy = b[1] - a[1];
          const l = dx * dx + dy * dy || 1;
          const tt = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l));
          if (Math.hypot(p[0] - a[0] - tt * dx, p[1] - a[1] - tt * dy) < 9) return false;
        }
      }
    }
    return true;
  };
  for (let u = box.u0 + 6; u < box.u1 - 6; u += 16) {
    for (let v = box.v0 + 6; v < box.v1 - 6; v += 16) {
      const p: Pt = [u + (rand(u, v, 1) - 0.5) * 12, v + (rand(u, v, 2) - 0.5) * 12];
      const k = levelAt(t, p[0], p[1]);
      if (k < 0) continue;
      const g = grove(p[0], p[1]);
      const odds = (k >= 4 ? 0.9 : k >= 2 ? 0.55 : 0.4) * Math.max(0, g * 1.6 - 0.45);
      if (rand(u, v, 3) > odds || !clearOf(p)) continue;
      trees.push([p[0], p[1], zAt(p[0], p[1])]);
    }
  }

  // Buildings and trees, back to front.
  const solids: Solid[] = [];
  for (const b of await buildings()) {
    if (b.c[0] < box.u0 || b.c[0] > box.u1 || b.c[1] < box.v0 || b.c[1] > box.v1) continue;
    if (b.ring.some(([u, v]) => u < box.u0 || u > box.u1 || v < box.v0 || v > box.v1)) continue;
    if (b.landmark && o.omit?.has(b.landmark)) continue;
    if (o.clear?.(b)) continue;
    solids.push({ d: b.c[0] + b.c[1], pieces: buildingPieces(b, hs) });
  }
  for (const [u, v, z] of trees) {
    solids.push({
      d: u + v,
      pieces: [
        { kind: "line", role: "trunk", pts: [[u, v, z], [u, v, z + 6]], width: 1.4 },
        { kind: "dot", role: "crown", at: [u, v, z + 8.5], r: 4.2 },
      ],
    });
  }
  solids.sort((a, b) => b.d - a.d);
  for (const s of solids) pieces.push(...s.pieces);
  return { pieces, zAt, solids };
}
