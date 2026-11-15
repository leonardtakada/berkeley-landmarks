/**
 * The isometric scene of Berkeley, as flat printed pieces in the order
 * they're laid down (back to front): the Bay, the land as stacked paper
 * terraces (one sheet per contour), the streets, trees, and every building
 * extruded from its OpenStreetMap footprint — the catalogue's landmarks in
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
import { chalkLines, greenAreas, greenIndex, lakeWaves, onTerraces, type GreenArea, type Terraces } from "./greens";
import { landmarkPieces } from "./models";
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
  | "crownLit"
  | "shadow"
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
  | "lmWindowShade"
  // The landmarks' models (scripts/iso/models.ts): brick, tile and copper, open bays and cornices.
  | "lmBrickLit"
  | "lmWindowBrick"
  | "lmTileLit"
  | "lmTileShade"
  | "lmCopperLit"
  | "lmCopperShade"
  | "lmOpen"
  | "lmTrimLit"
  | "lmTrimShade"
  | "lmSlateDeck"
  // The green (scripts/iso/greens.ts): lawns, hard courts, chalk lines, lakes, creeks — and the green's own trees.
  | "lawn"
  | "court"
  | "chalk"
  | "lake"
  | "creek"
  | "greenTrunk"
  | "green"
  | "greenLit"
  // Not drawn: where the city map's wind blows over the grass (a lawn's part in sight, its own alone).
  | "grassMask";

export type Piece =
  | { kind: "poly"; role: Role; rings: P3[][]; level?: number }
  | { kind: "line"; role: Role; pts: P3[]; width: number }
  | { kind: "dot"; role: Role; at: P3; r: number }
  /** Shapes standing square to the viewer, like a crown's disc: each part's points across and up the drawing (metres) from `at`. */
  | { kind: "flat"; role: Role; at: P3; parts: [number, number][][] };

/** Where a building's shadow falls, per metre of its height: east-south-east, and not quite as long. */
const SHADOW: Pt = [0.5, -0.17];
/** Buildings lower than this (true metres) cast no shadow worth drawing. */
const SHADOW_MIN = 8;

/**
 * What grows where: a street's or garden's tree, round, in the map's blue; a
 * park's, round, in green; the wild hills' pines, eucalyptus and oaks, in
 * green; a cemetery's cypress.
 */
export type TreeKind = "street" | "park" | "wild" | "cypress";

/**
 * A tree of its kind, `k` (0–1) its size, `pick` (0–1) which of the wild
 * hills' trees it is: a trunk and a crown, flat as cut paper, its western
 * half (or a highlight there) lit.
 */
export function treePieces(u: number, v: number, z: number, k: number, kind: TreeKind, pick: number): Piece[] {
  const r = 3.3 + k * 2.4;
  const trunk = 3.5 + k * 2;
  const at: P3 = [u, v, z];
  const round = kind === "street" || kind === "park" || (kind === "wild" && pick < 0.3);
  if (round) {
    const [t, c, l]: Role[] = kind === "street" ? ["trunk", "crown", "crownLit"] : ["greenTrunk", "green", "greenLit"];
    const top = z + trunk + r * 0.75;
    const a = r * 0.2;
    return [
      { kind: "line", role: t, pts: [[u, v, z], [u, v, z + trunk + r * 0.3]], width: 1.1 },
      { kind: "dot", role: c, at: [u, v, top], r },
      { kind: "dot", role: l, at: [u - a, v + a, top + r * 0.18], r: r * 0.6 },
    ];
  }
  /** A shape and its western half, lit: points (across, up) from the left round to the right, the middle ones on the axis. */
  const halves = (pts: [number, number][]): Piece[] => [
    { kind: "flat", role: "green", at, parts: [pts] },
    { kind: "flat", role: "greenLit", at, parts: [pts.filter(([x]) => x <= 1e-9)] },
  ];
  const trunkTo = (h: number): Piece => ({ kind: "line", role: "greenTrunk", pts: [[u, v, z], [u, v, z + h]], width: 1 });
  if (kind === "cypress") {
    // A cypress: a tall flame.
    const [w, b, h] = [r * 0.4, 1.2, r * 3.3];
    return [trunkTo(b + 1), ...halves([[0, b], [-w * 0.8, b + h * 0.12], [-w, b + h * 0.4], [-w * 0.6, b + h * 0.78], [0, b + h], [w * 0.6, b + h * 0.78], [w, b + h * 0.4], [w * 0.8, b + h * 0.12]])];
  }
  if (pick < 0.68) {
    // A pine: three tiers, each narrower, the higher over the lower — drawn as one silhouette,
    // and the western half of each tier lit up to where the tier above covers it.
    const tiers = [0, 1, 2].map((i) => ({ w: r * (1.02 - 0.24 * i), y: r * (0.7 + 0.78 * i) }));
    const h = r * 1.25;
    const left: [number, number][] = [];
    tiers.forEach(({ w, y }, i) => {
      left.push([-w, y]);
      const next = tiers[i + 1];
      left.push(next ? [-w * (1 - (next.y - y) / h), next.y] : [0, y + h]);
    });
    const outline: [number, number][] = [[0, tiers[0].y], ...left, ...[...left].reverse().slice(1).map(([x, y]) => [-x, y] as [number, number])];
    const lit = tiers.map(({ w, y }, i) => {
      const top = tiers[i + 1]?.y ?? y + h;
      const x = -w * (1 - (top - y) / h);
      return (top < y + h ? [[0, y], [-w, y], [x, top], [0, top]] : [[0, y], [-w, y], [0, top]]) as [number, number][];
    });
    return [trunkTo(r * 0.9), { kind: "flat", role: "green", at, parts: [outline] }, { kind: "flat", role: "greenLit", at, parts: lit }];
  }
  // A eucalyptus: a tall, ragged crown on a long bare trunk.
  const [w, b] = [r * 0.62, r * 1.1];
  return [
    trunkTo(b + r * 0.6),
    ...halves([[0, b], [-w * 0.5, b + r * 0.1], [-w, b + r * 0.6], [-w * 0.85, b + r * 1.3], [-w, b + r * 1.8], [-w * 0.55, b + r * 2.45], [0, b + r * 2.6], [w * 0.5, b + r * 2.3], [w * 0.95, b + r * 1.7], [w * 0.8, b + r * 1.1], [w, b + r * 0.55], [w * 0.5, b + r * 0.12]]),
  ];
}

/** The convex hull of some points (monotone chain), counter-clockwise. */
function hull(pts: Pt[]): Ring {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Pt[]) => {
    const out: Pt[] = [];
    for (const q of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop();
      out.push(q);
    }
    return out.slice(0, -1);
  };
  return [...half(p), ...half([...p].reverse())];
}

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
  /** Courtyards and light wells: holes in the plan, run clockwise. */
  holes?: Ring[];
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
/** A multipolygon building: one with a courtyard, or in several pieces. */
type OsmRelation = {
  type: string;
  id: number;
  tags?: Record<string, string>;
  members?: { type: string; role: string; geometry?: { lat: number; lon: number }[] }[];
};
let features: OsmWay[] | null = null;
let relations: OsmRelation[] | null = null;
let streets: OsmWay[] | null = null;
let waterways: OsmWay[] | null = null;
const load = (f: string): OsmWay[] => JSON.parse(fs.readFileSync(f, "utf8")).elements;
const localRing = (g: { lat: number; lon: number }[]): Ring => g.map(({ lat, lon }) => toLocal(lat, lon)).map(({ u, v }) => [u, v] as Pt);

/** A relation's member ways joined end to end into closed rings. */
function assemble(parts: Ring[]): Ring[] {
  const same = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) < 1e-3 && Math.abs(a[1] - b[1]) < 1e-3;
  const left = parts.filter((p) => p.length >= 2);
  const rings: Ring[] = [];
  while (left.length) {
    let cur = left.shift()!;
    while (!same(cur[0], cur[cur.length - 1])) {
      const end = cur[cur.length - 1];
      const i = left.findIndex((p) => same(p[0], end) || same(p[p.length - 1], end));
      if (i < 0) break;
      const next = left.splice(i, 1)[0];
      cur = cur.concat((same(next[0], end) ? next : [...next].reverse()).slice(1));
    }
    if (cur.length >= 4 && same(cur[0], cur[cur.length - 1])) rings.push(cur);
  }
  return rings;
}

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
  // Buildings drawn as multipolygons in OpenStreetMap: those around a
  // courtyard (Doe Library, Hearst Gym, the City Club…) and those in pieces.
  // (data/osm-building-relations.json; the features extract has none.)
  relations ??= JSON.parse(fs.readFileSync("data/osm-building-relations.json", "utf8")).elements as OsmRelation[];
  const ways = out.slice();
  for (const r of relations) {
    if (r.type !== "relation" || !r.tags?.building || !r.members) continue;
    const ringsOf = (role: string) =>
      assemble(r.members!.filter((m) => m.type === "way" && m.role === role && m.geometry).map((m) => localRing(m.geometry!)));
    const inners = ringsOf("inner").map((h) => orient(open(h), false));
    for (const o of ringsOf("outer")) {
      const ring = orient(open(o), true);
      const c = centroid(ring);
      if (c[0] < umin || c[0] > umax || c[1] < vmin || c[1] > vmax) continue;
      const holes = inners.filter((h) => pointInRing(h[0], ring) && area(h) > 4);
      const a = area(ring) - holes.reduce((s, h) => s + area(h), 0);
      if (a < 12) continue;
      // Already drawn from a way of its own.
      if (ways.some((w) => Math.abs(w.c[0] - c[0]) < 150 && Math.abs(w.c[1] - c[1]) < 150 && pointInRing(w.c, ring) && area(w.ring) > a * 0.5)) continue;
      out.push({
        id: r.id,
        ring: simplify(ring, 0.6),
        holes: holes.map((h) => simplify(h, 0.6)),
        c,
        height: heightOf(r.tags, a),
        gable: null,
        landmark: null,
        base: levelZ(Math.max(0, levelAt(t, c[0], c[1]))),
      });
    }
  }

  // The catalogue's landmarks: the building each one stands in.
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
  // A courtyard's far walls first: the building's own front stands before them.
  for (const ring of [...(b.holes ?? []), b.ring]) {
    for (const w of walls(ring, z0, z0 + h)) {
      wallPieces.push({ kind: "poly", role: (w.west ? R.lit : R.shade) as Role, rings: [w.quad] });
      if (b.windows) wallPieces.push(...windowsIn(w.quad, b.windows, w.west));
    }
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
    out.push({ kind: "poly", role: R.top as Role, rings: [b.ring, ...(b.holes ?? [])].map((r) => r.map(([u, v]) => [u, v, z0 + h] as P3)) });
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

  // Shadows, cast to the east-south-east (the light is from the west-north-west), each on the
  // terrace its building stands on: drawn after that terrace's paper, before the next one up.
  const shadows = new Map<number, Piece[]>();
  for (const b of await buildings()) {
    // (The same buildings as are drawn below: none cut by the edge.)
    if (b.c[0] < box.u0 || b.c[0] > box.u1 || b.c[1] < box.v0 || b.c[1] > box.v1) continue;
    if (b.ring.some(([u, v]) => u < box.u0 || u > box.u1 || v < box.v0 || v > box.v1)) continue;
    if (b.site || (b.landmark && o.omit?.has(b.landmark)) || o.clear?.(b)) continue;
    // A house's shadow is a sliver hidden behind it: not worth its place in the tiles.
    if (b.height < SHADOW_MIN) continue;
    const h = b.height * hs + (b.gable ? b.gable.rise : 0);
    const [du, dv] = [SHADOW[0] * h, SHADOW[1] * h];
    const ring = hull([...b.ring, ...b.ring.map(([u, v]) => [u + du, v + dv] as Pt)])
      .map(([u, v]) => [Math.min(box.u1, Math.max(box.u0, u)), Math.min(box.v1, Math.max(box.v0, v))] as Pt);
    const level = Math.max(0, levelAt(t, b.c[0], b.c[1]));
    const list = shadows.get(level) ?? [];
    list.push({ kind: "poly", role: "shadow", rings: [ring.map(([u, v]) => [u, v, b.base] as P3)], level });
    shadows.set(level, list);
  }

  // The land as drawn: each terrace's sheets, cut to the box.
  const sheets = terraceRings(t).map(({ level, polys }) => ({
    level,
    polys: polys
      .map((poly) => poly.map((r) => clipRing(r, box)).filter((r) => r.length >= 3))
      .filter((rings) => rings.length && rings[0].length >= 3 && area(rings[0]) >= 1),
  }));
  const terraces: Terraces = new Map(sheets.map(({ level, polys }) => [level, polys.flat()]));

  // The green and the lakes, on the terraces they lie across: largest first, so a field lies on its park.
  features ??= load("data/osm-features.json");
  const greens = greenAreas(features, box);
  const greenOn = new Map<number, Piece[]>();
  const boxOf = (r: Ring) => {
    let [u0, v0, u1, v1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [u, v] of r) [u0, v0, u1, v1] = [Math.min(u0, u), Math.min(v0, v), Math.max(u1, u), Math.max(v1, v)];
    return { u0, v0, u1, v1 };
  };
  const greenBox = new Map(greens.map((g) => [g, boxOf(g.ring)]));
  const lawnish = (g: GreenArea) => g.kind !== "court" && g.kind !== "water";
  for (const g of greens) {
    // Where the grass grows on it: not on the smaller lawns over it (they have their own), nor its courts and lakes.
    const b = greenBox.get(g)!;
    const minus = lawnish(g)
      ? greens
          .filter((o) => o !== g && (!lawnish(o) || o.area < g.area))
          .filter((o) => {
            const q = greenBox.get(o)!;
            return q.u1 > b.u0 && q.u0 < b.u1 && q.v1 > b.v0 && q.v0 < b.v1;
          })
          .map((o) => o.ring)
      : [];
    for (const { level, polys, open: seen } of onTerraces(g.ring, box, terraces, (u, v) => levelAt(t, u, v), minus)) {
      const z = levelZ(level);
      const list = greenOn.get(level) ?? greenOn.set(level, []).get(level)!;
      const lift = (rs: Ring[]) => rs.map((r) => r.map(([u, v]) => [u, v, z] as P3));
      const role: Role = g.kind === "water" ? "lake" : g.kind === "court" ? "court" : "lawn";
      for (const rings of polys) {
        list.push({ kind: "poly", role, rings: lift(rings), level });
        if (g.kind === "water") for (const w of lakeWaves(rings, z)) list.push({ kind: "line", role: "wave", pts: w, width: 3 });
      }
      // A field's chalk lines, where it lies whole on one terrace.
      if ((g.kind === "pitch" || g.kind === "court") && polys.length === 1 && polys[0].length === 1 && area(polys[0][0]) > 0.95 * g.area) {
        for (const c of chalkLines(g.ring, g.kind === "court")) list.push({ kind: "poly", role: "chalk", rings: lift(c), level });
      }
      // Where the map's wind blows over the grass: a lawn's part in sight, its own alone.
      if (role === "lawn") for (const rings of seen) list.push({ kind: "poly", role: "grassMask", rings: lift(rings), level });
    }
  }

  // The land, a sheet of paper for each terrace, lowest first: its green, then the shadows on it.
  for (const { level, polys } of sheets) {
    const z1 = levelZ(level);
    const z0 = level === 0 ? -SHORE : levelZ(level - 1);
    for (const rings of polys) {
      for (const r of rings) {
        for (const w of walls(r, z0, z1, o.plate ? box : undefined)) {
          pieces.push({ kind: "poly", role: level === 0 ? "shore" : "wall", rings: [w.quad], level });
        }
      }
      pieces.push({ kind: "poly", role: "top", rings: rings.map((r) => r.map(([u, v]) => [u, v, z1] as P3)), level });
    }
    pieces.push(...(greenOn.get(level) ?? []));
    pieces.push(...(shadows.get(level) ?? []));
    shadows.delete(level);
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

  // The creeks, where they run in the open (not in a culvert), laid on the terraces as the streets are.
  waterways ??= load("data/osm-waterways.json");
  for (const w of waterways) {
    const kind = w.tags?.waterway;
    if (!kind || !["stream", "river", "canal"].includes(kind) || w.tags?.tunnel || !w.geometry) continue;
    for (const run of clipLine(localRing(w.geometry), box)) {
      if (run.every(([u, v]) => levelAt(t, u, v) < 0)) continue;
      // A run for each terrace it crosses: over a terrace's edge, the creek falls out of sight.
      let pts: P3[] = [];
      const flush = () => {
        if (pts.length > 1) pieces.push({ kind: "line", role: "creek", pts, width: kind === "stream" ? 3 : 6 });
        pts = [];
      };
      for (const [u, v] of densify(run, 5)) {
        const z = Math.max(0, zAt(u, v));
        if (pts.length && pts[pts.length - 1][2] !== z) flush();
        pts.push([u, v, z]);
      }
      flush();
    }
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

  const greenAt = greenIndex(greens);
  const trees: [number, number, number, TreeKind][] = [];

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
  /** High on the hills, with no house near: the wild land, wooded. */
  const wild = (p: Pt, k: number) => {
    if (k < 3) return false;
    const [cu, cv] = [Math.floor(p[0] / 40), Math.floor(p[1] / 40)];
    for (let du = -1; du <= 1; du++) for (let dv = -1; dv <= 1; dv++) if (near.get(`${cu + du},${cv + dv}`)?.length) return false;
    return true;
  };
  // Trees in the parks, gardens and the cemetery (not on their fields, nor in their lakes): a park's
  // round, in green, gathered in groves with open lawn between; the wild hill parks' pines,
  // eucalyptus and oaks, thicker; the cemetery's cypresses, in rows.
  for (const g of greens) {
    if (!(["park", "garden", "cemetery"] as GreenArea["kind"][]).includes(g.kind) && !(g.kind === "lawn" && g.area > 3000)) continue;
    let [a, b, cc, d] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const p of g.ring) [a, b, cc, d] = [Math.min(a, p[0]), Math.min(b, p[1]), Math.max(cc, p[0]), Math.max(d, p[1])];
    if (cc < box.u0 || a > box.u1 || d < box.v0 || b > box.v1) continue;
    const hill = levelAt(t, (a + cc) / 2, (b + d) / 2) >= 2;
    const step = hill ? 20 : 30;
    for (let u = a + step / 2; u < cc; u += step) {
      for (let v = b + step / 2; v < d; v += step) {
        // (Rows for the cemetery's cypresses; anywhere about its place for the rest.)
        const loose = g.kind === "cemetery" ? 0.15 : 0.9;
        const jitter: Pt = [u + (rand(u, v, 21) - 0.5) * step * loose, v + (rand(u, v, 22) - 0.5) * step * loose];
        if (jitter[0] < box.u0 || jitter[0] > box.u1 || jitter[1] < box.v0 || jitter[1] > box.v1) continue;
        if (!pointInRing(jitter, g.ring) || levelAt(t, jitter[0], jitter[1]) < 0) continue;
        const under = greenAt(jitter);
        if (under && (under.kind === "pitch" || under.kind === "court" || under.kind === "water")) continue;
        if (g.kind !== "cemetery" && grove(jitter[0], jitter[1]) < (hill ? 0.3 : 0.6)) continue;
        trees.push([jitter[0], jitter[1], zAt(jitter[0], jitter[1]), g.kind === "cemetery" ? "cypress" : hill ? "wild" : "park"]);
      }
    }
  }

  for (let u = box.u0 + 6; u < box.u1 - 6; u += 16) {
    for (let v = box.v0 + 6; v < box.v1 - 6; v += 16) {
      const p: Pt = [u + (rand(u, v, 1) - 0.5) * 12, v + (rand(u, v, 2) - 0.5) * 12];
      const k = levelAt(t, p[0], p[1]);
      if (k < 0) continue;
      const g = grove(p[0], p[1]);
      const woods = wild(p, k);
      const odds = (woods ? 1.1 : k >= 4 ? 0.9 : k >= 2 ? 0.55 : 0.4) * Math.max(0, g * 1.6 - 0.45);
      if (rand(u, v, 3) > odds || !clearOf(p)) continue;
      // Not in the green: its own trees are above.
      const under = greenAt(p);
      if (under) continue;
      const kind: TreeKind = woods ? "wild" : "street";
      trees.push([p[0], p[1], zAt(p[0], p[1]), kind]);
      // The woods, thicker: another tree between.
      const q: Pt = [p[0] + 8 + (rand(u, v, 4) - 0.5) * 6, p[1] + 8 + (rand(u, v, 5) - 0.5) * 6];
      if (woods && rand(u, v, 6) < odds * 0.8 && levelAt(t, q[0], q[1]) === k && clearOf(q)) trees.push([q[0], q[1], zAt(q[0], q[1]), "wild"]);
    }
  }

  // Buildings and trees, back to front: the landmarks modelled after their photographs or styles.
  const byId = new Map(landmarks.map((l) => [l.id, l]));
  const solids: Solid[] = [];
  for (const b of await buildings()) {
    if (b.c[0] < box.u0 || b.c[0] > box.u1 || b.c[1] < box.v0 || b.c[1] > box.v1) continue;
    if (b.ring.some(([u, v]) => u < box.u0 || u > box.u1 || v < box.v0 || v > box.v1)) continue;
    if (b.landmark && o.omit?.has(b.landmark)) continue;
    if (o.clear?.(b)) continue;
    const l = b.landmark ? byId.get(b.landmark) : undefined;
    solids.push({ d: b.c[0] + b.c[1], pieces: l ? landmarkPieces(l, b, hs) : buildingPieces(b, hs) });
  }
  // Each tree its own size and kind, lit on the west, where the light comes from.
  for (const [u, v, z, kind] of trees) solids.push({ d: u + v, pieces: treePieces(u, v, z, rand(u, v, 7), kind, rand(u, v, 11)) });
  solids.sort((a, b) => b.d - a.d);
  for (const s of solids) pieces.push(...s.pieces);
  return { pieces, zAt, solids };
}
