/**
 * The catalogue's landmarks as models, for the city map: walls, windows,
 * cornices and roofs after what each building is made of and how it's
 * roofed — from its photographs where the guide has them
 * (scripts/iso/landmark-models.ts), otherwise from its style.
 *
 * Still the guide's two inks: stone, stucco and painted wood print in paper
 * with a vermilion shade wall, as every landmark has; brick and brown
 * shingle in a vermilion tint; red tile roofs in vermilion, slate in blue,
 * copper in a pale blue. A model is built of parts (a block, a tower on it, a
 * drum and its dome), each a prism with a roof; only the faces turned to the
 * reader are drawn, so a part's own faces never need sorting.
 */
import type { Landmark } from "../../data/landmarks";
import { area, centroid, minRect, type Pt, type Ring } from "./geom";
import { LANDMARK_MODELS, type Openings, type Part, type Roof, type RoofInk, type Walls } from "./landmark-models";
import type { Building, P3, Piece, Role } from "./scene";

/** The light falls from the west-north-west: walls facing west are lit, walls facing south in shade. */
const lit = (nx: number, ny: number) => -nx > -ny;
/** Seen from the south-west and above: a face is seen if it turns toward (-1, -1, 1). */
const seen = (n: [number, number, number]) => -n[0] - n[1] + n[2] > 1e-9;

function normal(r: P3[]): [number, number, number] {
  // Newell's method: robust for any planar polygon.
  let [x, y, z] = [0, 0, 0];
  for (let i = 0; i < r.length; i++) {
    const [a, b] = [r[i], r[(i + 1) % r.length]];
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return [x, y, z];
}

const WALLS: Record<Walls, { lit: Role; shade: Role; winLit: Role; winShade: Role }> = {
  stone: { lit: "lmLit", shade: "lmShade", winLit: "lmWindowLit", winShade: "lmWindowShade" },
  brick: { lit: "lmBrickLit", shade: "lmShade", winLit: "lmWindowBrick", winShade: "lmWindowShade" },
};
const ROOFS: Record<RoofInk, { lit: Role; shade: Role; deck: Role }> = {
  tile: { lit: "lmTileLit", shade: "lmTileShade", deck: "lmTileLit" },
  slate: { lit: "lmRoofLit", shade: "lmRoofShade", deck: "lmSlateDeck" },
  copper: { lit: "lmCopperLit", shade: "lmCopperShade", deck: "lmCopperLit" },
};

// ── The plan ─────────────────────────────────────────────────────────────

/**
 * The footprint's rectangle, turned so that its long side runs eastward (s)
 * and its short side northward (t): parts are placed in it as fractions.
 */
export function frame(ring: Ring) {
  const mr = minRect(ring);
  let [c0, c1, , c3] = mr.corners;
  let along: Pt = [c1[0] - c0[0], c1[1] - c0[1]];
  let across: Pt = [c3[0] - c0[0], c3[1] - c0[1]];
  // Long side eastward, or northward if it runs more north–south than east–west.
  if (Math.abs(along[0]) >= Math.abs(along[1]) ? along[0] < 0 : along[1] < 0) {
    c0 = [c0[0] + along[0], c0[1] + along[1]];
    along = [-along[0], -along[1]];
  }
  // Short side to the left of the long side, so the rectangle runs counter-clockwise.
  if (along[0] * across[1] - along[1] * across[0] < 0) {
    c0 = [c0[0] + across[0], c0[1] + across[1]];
    across = [-across[0], -across[1]];
  }
  const at = (s: number, t: number): Pt => [c0[0] + along[0] * s + across[0] * t, c0[1] + along[1] * s + across[1] * t];
  return { at, long: Math.hypot(...along), short: Math.hypot(...across), fill: mr.fill };
}

type Frame = ReturnType<typeof frame>;

function rect(f: Frame, [s0, s1, t0, t1]: [number, number, number, number]): Ring {
  return [f.at(s0, t0), f.at(s1, t0), f.at(s1, t1), f.at(s0, t1)];
}

/** An ellipse inscribed in a part of the plan, as a polygon. */
function oval(f: Frame, [s0, s1, t0, t1]: [number, number, number, number], n = 20): Ring {
  const [sc, tc, rs, rt] = [(s0 + s1) / 2, (t0 + t1) / 2, (s1 - s0) / 2, (t1 - t0) / 2];
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return f.at(sc + Math.cos(a) * rs, tc + Math.sin(a) * rt);
  });
}

/** A counter-clockwise ring pushed out by `d` metres (mitred, the sharp corners clamped). */
export function offset(r: Ring, d: number): Ring {
  const n = r.length;
  const normals = r.map((a, i) => {
    const b = r[(i + 1) % n];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[1] - a[1]) / l, -(b[0] - a[0]) / l] as Pt;
  });
  return r.map((p, i) => {
    const [n1, n2] = [normals[(i - 1 + n) % n], normals[i]];
    const k = 1 + n1[0] * n2[0] + n1[1] * n2[1];
    const m = k < 0.3 ? 1 : 2 / k;
    return [p[0] + ((n1[0] + n2[0]) / 2) * d * m, p[1] + ((n1[1] + n2[1]) / 2) * d * m] as Pt;
  });
}

// ── Pieces ───────────────────────────────────────────────────────────────

const poly = (role: Role, ...rings: P3[][]): Piece => ({ kind: "poly", role, rings });
const lift = (r: Ring, z: number): P3[] => r.map(([u, v]) => [u, v, z]);

/** A ring's walls that face the reader, far ones first (a courtyard's far walls show through). */
function walls(rings: Ring[], z0: number, z1: number) {
  const out: { quad: P3[]; west: boolean; depth: number; len: number }[] = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const [a, b] = [ring[i], ring[(i + 1) % ring.length]];
      const nx = b[1] - a[1];
      const ny = -(b[0] - a[0]);
      if (nx + ny >= 0) continue;
      out.push({
        quad: [
          [a[0], a[1], z0],
          [b[0], b[1], z0],
          [b[0], b[1], z1],
          [a[0], a[1], z1],
        ],
        west: lit(nx, ny),
        depth: a[0] + a[1] + b[0] + b[1],
        len: Math.hypot(b[0] - a[0], b[1] - a[1]),
      });
    }
  }
  return out.sort((p, q) => q.depth - p.depth);
}

/** Windows, arches or open bays in rows, one row a storey, up a wall. */
function openingsIn(quad: P3[], kind: Openings, rows: number, bay: number, west: boolean, ink: { winLit: Role; winShade: Role }): Piece[] {
  if (kind === "none" || rows < 1) return [];
  const [a, b] = quad;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const cols = Math.floor(len / bay);
  if (cols < 1) return [];
  const [z0, z1] = [a[2], quad[2][2]];
  const du = (b[0] - a[0]) / len;
  const dv = (b[1] - a[1]) / len;
  const colW = len / cols;
  const rowH = (z1 - z0) / rows;
  const p = (s: number, z: number): P3 => [a[0] + du * s, a[1] + dv * s, z];
  const role: Role = kind === "open" ? "lmOpen" : west ? ink.winLit : ink.winShade;
  const out: Piece[] = [];
  if (kind === "bands") {
    for (let r = 0; r < rows; r++) {
      const [zz0, zz1] = [z0 + r * rowH + rowH * 0.32, z0 + r * rowH + rowH * 0.72];
      out.push(poly(role, [p(colW * 0.25, zz0), p(len - colW * 0.25, zz0), p(len - colW * 0.25, zz1), p(colW * 0.25, zz1)]));
    }
    return out;
  }
  // Tall windows run two storeys (a colonnade's bays); open bays and arches stand one.
  const span = kind === "tall" ? Math.min(2, rows) : 1;
  for (let r = 0; r + span <= rows; r += span) {
    for (let c = 0; c < cols; c++) {
      const w = kind === "open" ? 0.6 : kind === "tall" ? 0.34 : 0.4;
      const [s0, s1] = [c * colW + colW * (0.5 - w / 2), c * colW + colW * (0.5 + w / 2)];
      const bottom = z0 + r * rowH + rowH * (kind === "open" ? 0.12 : 0.28);
      const top = z0 + (r + span) * rowH - rowH * (kind === "open" ? 0.12 : 0.2);
      if (kind === "arched" || kind === "open") {
        // A round head: the spring line, then three points around the arch.
        const rise = Math.min((s1 - s0) * 0.5, (top - bottom) * 0.4);
        const spring = top - rise;
        const mid = (s0 + s1) / 2;
        const half = (s1 - s0) / 2;
        out.push(
          poly(role, [
            p(s0, bottom),
            p(s1, bottom),
            p(s1, spring),
            p(mid + half * 0.71, spring + rise * 0.71),
            p(mid, top),
            p(mid - half * 0.71, spring + rise * 0.71),
            p(s0, spring),
          ]),
        );
      } else {
        out.push(poly(role, [p(s0, bottom), p(s1, bottom), p(s1, top), p(s0, top)]));
      }
    }
  }
  return out;
}

/** A roof over a rectangle (`c` counter-clockwise, `c[0]→c[1]` the long side): its faces, as polygons in 3D. */
function roofFaces(kind: Roof, c: Ring, z: number, rise: number, ringForFlat: Ring, holes: Ring[]): P3[][] {
  const [c0, c1, c2, c3] = c;
  const at = (p: Pt, h = z): P3 => [p[0], p[1], h];
  const mid = (p: Pt, q: Pt): Pt => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const long = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]);
  const short = Math.hypot(c3[0] - c0[0], c3[1] - c0[1]);
  const ax: Pt = [(c1[0] - c0[0]) / long, (c1[1] - c0[1]) / long];
  const ctr = mid(c0, c2);
  switch (kind) {
    case "gable": {
      const [r0, r1] = [mid(c0, c3), mid(c1, c2)];
      return [
        [at(c0), at(c1), at(r1, z + rise), at(r0, z + rise)],
        [at(c2), at(c3), at(r0, z + rise), at(r1, z + rise)],
        [at(c1), at(c2), at(r1, z + rise)],
        [at(c3), at(c0), at(r0, z + rise)],
      ];
    }
    case "hip": {
      const half = Math.max(0, long / 2 - short / 2);
      const r0: Pt = [ctr[0] - ax[0] * half, ctr[1] - ax[1] * half];
      const r1: Pt = [ctr[0] + ax[0] * half, ctr[1] + ax[1] * half];
      return [
        [at(c0), at(c1), at(r1, z + rise), at(r0, z + rise)],
        [at(c1), at(c2), at(r1, z + rise)],
        [at(c2), at(c3), at(r0, z + rise), at(r1, z + rise)],
        [at(c3), at(c0), at(r0, z + rise)],
      ];
    }
    case "pyramid":
    case "spire": {
      const apex = at(ctr, z + rise);
      return [
        [at(c0), at(c1), apex],
        [at(c1), at(c2), apex],
        [at(c2), at(c3), apex],
        [at(c3), at(c0), apex],
      ];
    }
    case "mansard": {
      // Slopes up to a flat deck, set in the same distance all round (a fifth of the width, 5 m at most).
      const inner = offset(c, -Math.min(5, short * 0.2));
      const faces: P3[][] = c.map((p, i) => {
        const q = c[(i + 1) % 4];
        return [at(p), at(q), at(inner[(i + 1) % 4], z + rise), at(inner[i], z + rise)];
      });
      faces.push(inner.map((p) => at(p, z + rise)));
      return faces;
    }
    case "flat":
    default:
      return [lift(ringForFlat, z)];
  }
}

/** A dome on a ring of `n` sides: bands from the springing up to a cap. */
function domeFaces(base: Ring, z: number, rise: number): P3[][] {
  const c = centroid(base);
  const tiers = 5;
  const ringAt = (k: number): P3[] => {
    const phi = (k / tiers) * (Math.PI / 2);
    const s = Math.cos(phi);
    return base.map(([u, v]) => [c[0] + (u - c[0]) * s, c[1] + (v - c[1]) * s, z + rise * Math.sin(phi)]);
  };
  const faces: P3[][] = [];
  for (let k = 0; k < tiers - 1; k++) {
    const [lo, hi] = [ringAt(k), ringAt(k + 1)];
    for (let i = 0; i < base.length; i++) {
      const j = (i + 1) % base.length;
      faces.push([lo[i], lo[j], hi[j], hi[i]]);
    }
  }
  faces.push(ringAt(tiers - 1));
  return faces;
}

/** Every face of a roof the reader can see, lit or in shade. */
function roofPieces(faces: P3[][], ink: { lit: Role; shade: Role }, top: Role): Piece[] {
  const out: Piece[] = [];
  for (const f of faces) {
    const n = normal(f);
    if (!seen(n)) continue;
    // Flat (a deck or a cap): the roof's top colour.
    if (Math.hypot(n[0], n[1]) < Math.abs(n[2]) * 0.05) {
      out.push(poly(top, f));
      continue;
    }
    out.push(poly(lit(n[0], n[1]) ? ink.lit : ink.shade, f));
  }
  return out;
}

// ── A model ──────────────────────────────────────────────────────────────

/** The parts a landmark is built from: its own, written from its photographs, or ones guessed from its style. */
export function partsOf(l: Landmark, b: Building): Part[] {
  return LANDMARK_MODELS[l.id]?.parts ?? fromStyle(l, b);
}

const has = (s: string, re: RegExp) => re.test(s);

/** A landmark without a model of its own: walls, roof and windows after its style and kind. */
export function fromStyle(l: Landmark, b: Building): Part[] {
  const s = `${l.style} ${l.name}`.toLowerCase();
  const campus = /uc campus|uc berkeley/i.test(`${l.neighborhood} ${l.address}`);
  const house = l.category === "residential" && b.height < 12;
  const brick = has(s, /shingle|brown|craftsman|first bay|arts (&|and) crafts|redwood|industrial|brick|chalet|swiss/);
  const tile = has(s, /mission|mediterranean|spanish|italian|renaissance|moorish|monterey|romanesque/) || (campus && has(s, /beaux|classical/));
  const modern = has(s, /modern|deco|moderne|international|brutal|streamline|commercial|industrial|zigzag/);
  const classical = has(s, /beaux|classical|renaissance|neoclassical|italianate|federal|georgian/);
  const steep = has(s, /gothic|tudor|victorian|queen anne|stick|norman|storybook|chalet|swiss|eastlake/);
  const pitched = has(s, /shingle|craftsman|arts|tudor|gothic|colonial|bungalow|brown|victorian|stick|chalet|cottage|swiss|church|chapel|norman|storybook|bay|queen anne/);
  const f = frame(b.ring);
  const boxy = !b.holes?.length && f.fill > 0.72 && f.long / Math.max(1, f.short) < 4;
  // (An irregular plan can't take a pitched roof: it prints as a deck in the roof's ink.)
  const roof: Roof = modern
    ? "flat"
    : (b.gable || pitched) && !tile
      ? "gable"
      : tile || (boxy && !classical)
        ? "hip"
        : "flat";
  const rise = roof === "gable" ? f.short * (steep ? 0.62 : 0.42) : roof === "hip" ? f.short * (tile ? 0.22 : 0.3) : 0;
  const openings: Openings = has(s, /mission|mediterranean|spanish|romanesque|gothic|moorish|renaissance|italian/)
    ? "arched"
    : classical
      ? "tall"
      : has(s, /international|modern(?!e)|brutal/) && !house
        ? "bands"
        : "windows";
  return [
    {
      walls: brick ? "brick" : "stone",
      roof,
      rise,
      roofInk: tile ? "tile" : "slate",
      openings,
      storey: house ? 3.2 : 4,
      cornice: roof === "flat" && (classical || has(s, /deco|commercial|italianate/)),
    },
  ];
}

/**
 * A landmark's model: its parts, back to front, each walled, windowed and roofed.
 * `enlarge`: how many times true size its plan is drawn (a walk plate's stops), so its bays widen with it.
 */
export function landmarkPieces(l: Landmark, b: Building, hs: number, enlarge = 1): Piece[] {
  const f = frame(b.ring);
  const out: Piece[] = [];
  // Pinnacles nearer the reader than their tower's middle: drawn after everything, so they stand before its spire.
  const late: Piece[] = [];
  let below = 0;
  for (const p of partsOf(l, b)) {
    const whole = !p.at && !p.round;
    const span = p.at ?? [0, 1, 0, 1];
    const plan: Ring = p.round ? oval(f, span) : whole ? b.ring : rect(f, span);
    const holes = whole ? (b.holes ?? []) : [];
    const z0 = b.base + (p.on ? below : (p.z ?? 0) * hs);
    const h = (p.h ?? b.height) * hs;
    const z1 = z0 + h;
    below = z1 - b.base;
    const ink = WALLS[p.walls ?? "stone"];
    const rInk = ROOFS[p.roofInk ?? "slate"];

    // Walls, and in them the windows.
    const storey = p.storey ?? 4;
    const rows = Math.max(1, Math.round((p.h ?? b.height) / storey));
    const bay = (p.bay ?? storey * 0.85) * enlarge;
    for (const w of walls([plan, ...holes], z0, z1)) {
      out.push(poly(w.west ? ink.lit : ink.shade, w.quad));
      out.push(...openingsIn(w.quad, p.openings ?? "windows", rows, bay, w.west, ink));
    }
    // The cornice: a pale band round the top of the walls, standing out a little.
    let top = plan;
    if (p.cornice && !p.round) {
      top = offset(plan, 0.45 * enlarge);
      for (const w of walls([top], z1 - 0.9, z1)) out.push(poly(w.west ? "lmTrimLit" : "lmTrimShade", w.quad));
    }
    // The roof.
    const roof = p.roof ?? "flat";
    if (roof === "none") continue;
    const rise = (p.rise ?? 0) * Math.min(hs, 1.6);
    if (roof === "dome") {
      out.push(...roofPieces(domeFaces(p.round ? plan : oval(f, span, 16), z1, rise || f.short * 0.4), rInk, rInk.lit));
    } else if (roof === "flat") {
      out.push(poly("lmTop", ...[top, ...holes].map((r) => lift(r, z1))));
    } else if (whole && (b.holes?.length || f.fill < 0.72 || f.long / Math.max(1, f.short) > 4)) {
      // A pitched roof over a plan no rectangle fits: seen from above, a deck in the roof's own ink.
      out.push(poly(rInk.deck, ...[offset(plan, 0.5), ...holes].map((r) => lift(r, z1))));
    } else if (p.round) {
      // A cone over a round plan (a turret's roof).
      const c = centroid(plan);
      const apex: P3 = [c[0], c[1], z1 + rise];
      out.push(...roofPieces(plan.map((a, i) => [lift([a], z1)[0], lift([plan[(i + 1) % plan.length]], z1)[0], apex]), rInk, rInk.lit));
    } else {
      // Pitched roofs stand over the part's rectangle, with a little eave.
      const g = whole ? frame(b.ring) : frame(plan);
      const eave = (roof === "spire" || roof === "pyramid" ? 0.2 : 0.5) * enlarge;
      const c = offset(rect(g, [0, 1, 0, 1]), eave);
      // A big building's hipped roof is a band of tiled slopes round a flat middle, not one great pyramid.
      const kind: Roof = roof === "hip" && g.short > 24 * enlarge ? "mansard" : roof;
      const deck = kind === "mansard" && roof === "hip" ? rInk.lit : "lmTop";
      out.push(...roofPieces(roofFaces(kind, c, z1, rise || g.short * 0.3, top, holes), rInk, deck));
    }
    // Pinnacles at the corners (a tower's).
    if (p.pinnacles) {
      const g = frame(plan);
      const mid = centroid(plan);
      for (const [s, t] of [
        [0.08, 0.08],
        [0.92, 0.08],
        [0.92, 0.92],
        [0.08, 0.92],
      ] as Pt[]) {
        const r = g.short * 0.07;
        const ctr = g.at(s, t);
        const sq: Ring = [
          [ctr[0] - r, ctr[1] - r],
          [ctr[0] + r, ctr[1] - r],
          [ctr[0] + r, ctr[1] + r],
          [ctr[0] - r, ctr[1] + r],
        ];
        const pieces = roofPieces(roofFaces("pyramid", sq, z1, p.pinnacles * Math.min(hs, 1.6), sq, []), rInk, rInk.lit);
        (ctr[0] + ctr[1] < mid[0] + mid[1] ? late : out).push(...pieces);
      }
    }
  }
  return [...out, ...late];
}

/**
 * A landmark's model as solids, for what it hides (scripts/iso/walks.ts): each
 * part's plan from its foot to its walls' top, and its roof as a profile over
 * the plan — rising `rise` over the distance `D` in from the `edges` it slopes
 * up from (a gable's long sides; every side of a hip, pyramid or mansard),
 * straight, or round for a dome.
 */
export type RoofSolid = { rise: number; D: number; edges: [Pt, Pt][]; round: boolean };
export function landmarkSolids(l: Landmark, b: Building, hs: number): { ring: Ring; z0: number; z1: number; roof: RoofSolid | null }[] {
  const f = frame(b.ring);
  const out: { ring: Ring; z0: number; z1: number; roof: RoofSolid | null }[] = [];
  const sides = (r: Ring): [Pt, Pt][] => r.map((p, i) => [p, r[(i + 1) % r.length]]);
  let below = 0;
  for (const p of partsOf(l, b)) {
    const whole = !p.at && !p.round;
    const span = p.at ?? [0, 1, 0, 1];
    const plan: Ring = p.round ? oval(f, span) : whole ? b.ring : rect(f, span);
    const z0 = b.base + (p.on ? below : (p.z ?? 0) * hs);
    const z1 = z0 + (p.h ?? b.height) * hs;
    below = z1 - b.base;
    const roof = p.roof ?? "flat";
    const rise = (p.rise ?? 0) * Math.min(hs, 1.6);
    let solid: RoofSolid | null = null;
    // (As landmarkPieces roofs them.)
    if (roof === "dome") {
      const base = p.round ? plan : oval(f, span, 16);
      solid = { rise: rise || f.short * 0.4, D: frame(base).short / 2, edges: sides(base), round: true };
    } else if (roof === "flat" || roof === "none") {
      solid = null;
    } else if (whole && (b.holes?.length || f.fill < 0.72 || f.long / Math.max(1, f.short) > 4)) {
      solid = null; // a deck
    } else if (p.round) {
      solid = { rise, D: frame(plan).short / 2, edges: sides(plan), round: false };
    } else {
      const g = whole ? frame(b.ring) : frame(plan);
      const r = rect(g, [0, 1, 0, 1]);
      const up = rise || g.short * 0.3;
      if (roof === "hip" && g.short > 24) solid = { rise: up, D: Math.min(5, g.short * 0.2), edges: sides(r), round: false };
      else if (roof === "mansard") solid = { rise: up, D: Math.min(5, g.short * 0.2), edges: sides(r), round: false };
      else if (roof === "gable") solid = { rise: up, D: g.short / 2, edges: [[r[0], r[1]], [r[2], r[3]]], round: false };
      else solid = { rise: up, D: g.short / 2, edges: sides(r), round: false };
    }
    out.push({ ring: plan, z0, z1, roof: solid });
  }
  return out;
}

/** The ground a model covers, for the clearing round it and its shadow. */
export const footprintArea = (b: Building) => area(b.ring);
