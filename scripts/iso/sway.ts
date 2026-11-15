/**
 * Which trees' crowns may sway on the city map (components/iso-tree-sway.tsx
 * leans them with the wind): those with nothing drawn in front of the crown —
 * no building, no nearer tree, trunk or crown — as far as it may lean. Those
 * crowns go into the tiles' `sway` layer, drawn over everything standing, so
 * it can be moved as a whole without the order of the drawing coming wrong;
 * each into one of a few groups that sway out of step with each other.
 */
import { iso } from "../../lib/iso";
import type { Pt } from "./geom";
import type { Piece, Solid } from "./scene";

/** How many groups the swaying crowns are dealt into, each leaning in its own time. */
export const SWAY_GROUPS = 4;
const CROWN = new Set(["crown", "crownLit", "green", "greenLit"]);
const TREE = new Set([...CROWN, "trunk", "greenTrunk"]);
const CELL = 16;

type Shape = { pts: Pt[]; x0: number; y0: number; x1: number; y1: number };

const flat = ([u, v, z]: [number, number, number]): Pt => {
  const q = iso(u, v, z);
  return [q.x, q.y];
};
const boxed = (pts: Pt[]): Shape => {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of pts) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  return { pts, x0, y0, x1, y1 };
};

/** A piece as the map draws it, on the drawing (metres): an outline for each of its parts, each grown by `grow`. */
function shapes(p: Piece, grow = 0): Shape[] {
  if (p.kind === "poly") return [boxed(p.rings[0].map(flat))];
  if (p.kind === "line") {
    const [a, b] = p.pts;
    const w = Math.max(0.7, p.width / 2);
    return [boxed([flat([a[0] - w, a[1] + w, a[2]]), flat([a[0] + w, a[1] - w, a[2]]), flat([b[0] + w, b[1] - w, b[2]]), flat([b[0] - w, b[1] + w, b[2]])])];
  }
  const [cx, cy] = flat(p.at);
  if (p.kind === "dot") {
    const r = p.r + grow;
    return [boxed(Array.from({ length: 16 }, (_, i) => [cx + Math.cos((i / 16) * Math.PI * 2) * r, cy + Math.sin((i / 16) * Math.PI * 2) * r] as Pt))];
  }
  return p.parts
    .filter((part) => part.length >= 3)
    .map((part) => {
      const [mx, my] = [part.reduce((s, q) => s + q[0], 0) / part.length, part.reduce((s, q) => s + q[1], 0) / part.length];
      return boxed(
        part.map(([dx, dy]) => {
          const [ox, oy] = [dx - mx, dy - my];
          const d = Math.hypot(ox, oy) || 1;
          return [cx + dx + (ox / d) * grow, cy + dy + (oy / d) * grow] as Pt;
        }),
      );
    });
}

const inside = ([x, y]: Pt, r: Pt[]) => {
  let n = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [[xi, yi], [xj, yj]] = [r[i], r[j]];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) n = !n;
  }
  return n;
};
const cross = (a: Pt, b: Pt, c: Pt, d: Pt) => {
  const o = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
};
/** Whether two outlines overlap. */
function overlap(a: Shape, b: Shape) {
  if (a.x1 < b.x0 || a.x0 > b.x1 || a.y1 < b.y0 || a.y0 > b.y1) return false;
  if (a.pts.some((p) => inside(p, b.pts)) || b.pts.some((p) => inside(p, a.pts))) return true;
  for (let i = 0; i < a.pts.length; i++) {
    for (let j = 0; j < b.pts.length; j++) {
      if (cross(a.pts[i], a.pts[(i + 1) % a.pts.length], b.pts[j], b.pts[(j + 1) % b.pts.length])) return true;
    }
  }
  return false;
}

/**
 * The crowns that may sway, `reach` metres either way, and the group each is
 * dealt into: those of the trees in `solids` with nothing among `pieces`
 * drawn after the tree that overlaps its crown, leaning.
 */
export function swayingCrowns(pieces: Piece[], solids: Solid[], reach: number): Map<Piece, number> {
  const order = new Map<Piece, number>();
  pieces.forEach((p, i) => order.set(p, i));
  // Everything standing, on a grid of the drawing.
  const grid = new Map<string, { s: number; shape: Shape; solid: Solid }[]>();
  for (const solid of solids) {
    for (const p of solid.pieces) {
      const s = order.get(p);
      if (s === undefined) continue;
      for (const shape of shapes(p)) {
        for (let gx = Math.floor(shape.x0 / CELL); gx <= Math.floor(shape.x1 / CELL); gx++) {
          for (let gy = Math.floor(shape.y0 / CELL); gy <= Math.floor(shape.y1 / CELL); gy++) {
            const k = `${gx},${gy}`;
            (grid.get(k) ?? grid.set(k, []).get(k)!).push({ s, shape, solid });
          }
        }
      }
    }
  }
  const out = new Map<Piece, number>();
  for (const solid of solids) {
    if (!solid.pieces.length || !solid.pieces.every((p) => TREE.has(p.role))) continue;
    const crowns = solid.pieces.filter((p) => CROWN.has(p.role));
    if (!crowns.length) continue;
    const last = Math.max(...solid.pieces.map((p) => order.get(p) ?? -1));
    let clear = true;
    for (const p of crowns) {
      for (const shape of shapes(p, reach)) {
        for (let gx = Math.floor(shape.x0 / CELL); gx <= Math.floor(shape.x1 / CELL) && clear; gx++) {
          for (let gy = Math.floor(shape.y0 / CELL); gy <= Math.floor(shape.y1 / CELL) && clear; gy++) {
            for (const o of grid.get(`${gx},${gy}`) ?? []) {
              if (o.s > last && o.solid !== solid && overlap(shape, o.shape)) {
                clear = false;
                break;
              }
            }
          }
        }
        if (!clear) break;
      }
      if (!clear) break;
    }
    if (!clear) continue;
    // Dealt into a group by where it stands, at random.
    const first = crowns[0];
    const at = first.kind === "dot" || first.kind === "flat" ? first.at : [0, 0];
    const h = Math.sin(at[0] * 12.9898 + at[1] * 78.233) * 43758.5453;
    const group = Math.floor((h - Math.floor(h)) * SWAY_GROUPS);
    for (const p of crowns) out.set(p, group);
  }
  return out;
}
