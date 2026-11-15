import { FIG_H } from "./walker-cast";

/**
 * Cutting a city-map walker where something nearer covers them
 * (components/iso-walkers.tsx): the covers scripts/iso/walks.ts tells in
 * lib/iso-walks.generated.ts, unpacked, and a figure's rings cut along their
 * lines. The cutting runs on the UI thread, as worklets.
 */

/** The digits the covers are told in. */
export const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Each piece of a walker left in sight reaches this far (units of the figure's box) over its neighbour's, so no seam shows. */
export const OVERLAP = 0.25;

/**
 * A cover's lines across a walker's figure, as points in the figure's box (u
 * across from its left edge, v down from its top; the feet at v = FIG_H), left
 * to right: `top` points of its top line, then `foot` points of its foot, for
 * a band.
 */
export type Lines = { us: number[]; vs: number[]; top: number; foot: number };

/**
 * Lanes told one after another in base-64 digits, each keyed by how many keys
 * on from the last: each lane's numbers into `list` (as `lane` reads them,
 * with `next` for a digit and `count` for a count told in as many as it
 * takes), where each begins into `at` — so lane k's are `list[at[k]…at[k + 1]]`,
 * for keys up to `keys`.
 */
export function unpack(
  code: string,
  keys: number,
  at: Uint32Array,
  list: number[],
  lane: (next: () => number, count: () => number) => void,
) {
  let p = 0;
  const next = () => B64.indexOf(code[p++]);
  const count = () => {
    let [n, scale] = [0, 1];
    for (;;) {
      const d = next();
      n += (d & 31) * scale;
      if (d < 32) return n;
      scale *= 32;
    }
  };
  let key = -1;
  while (p < code.length) {
    const to = key + count();
    for (let k = key + 1; k <= to; k++) at[k] = list.length;
    key = to;
    lane(next, count);
  }
  for (let k = key + 1; k <= keys; k++) at[k] = list.length;
}

/** The part of a closed ring (x, y pairs) where a·x + b·y + c < 0. */
export function clipHalf(r: number[], a: number, b: number, c: number): number[] {
  "worklet";
  const out: number[] = [];
  for (let i = 0; i + 3 < r.length; i += 2) {
    const [x0, y0, x1, y1] = [r[i], r[i + 1], r[i + 2], r[i + 3]];
    const [d0, d1] = [a * x0 + b * y0 + c, a * x1 + b * y1 + c];
    if (d0 < 0) out.push(x0, y0);
    if (d0 < 0 !== d1 < 0) {
      const f = d0 / (d0 - d1);
      out.push(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f);
    }
  }
  if (out.length < 6) return [];
  out.push(out[0], out[1]);
  return out;
}

/**
 * What a line across the figure (`count` of the points of `L` from `from`)
 * leaves in sight of a closed ring — above it, or below it — into `out`, as a
 * piece for each stretch of the line: each reaching a little over its
 * neighbours', so no seam shows, and where the line bends toward what's in
 * sight, kept clear of the next stretch too.
 */
export function inSight(r: number[], L: Lines, from: number, count: number, above: boolean, out: number[][]) {
  "worklet";
  const u = (i: number) => L.us[from + i];
  const v = (i: number) => L.vs[from + i];
  const slope = (i: number) => (v(i + 1) - v(i)) / Math.max(1e-6, u(i + 1) - u(i));
  // In sight: (v − the line) < 0 above it, > 0 below it.
  const s = above ? 1 : -1;
  const keep = (p: number[], i: number) => clipHalf(p, -s * slope(i), s, s * (slope(i) * u(i) - v(i)));
  /** Whether the part in sight is convex where the line bends at point i. */
  const convex = (i: number) => (above ? slope(i) < slope(i - 1) : slope(i) > slope(i - 1));
  for (let i = 0; i + 1 < count; i++) {
    // Nothing in sight along this stretch: covered to the top, or (below a band) from the feet.
    if (above ? v(i) <= 0 && v(i + 1) <= 0 : v(i) >= FIG_H && v(i + 1) >= FIG_H) continue;
    let p = keep(r, i);
    if (i > 0 && p.length) {
      p = clipHalf(p, -1, 0, u(i) - OVERLAP);
      if (convex(i) && p.length) p = keep(p, i - 1);
    }
    if (i + 2 < count && p.length) {
      p = clipHalf(p, 1, 0, -(u(i + 1) + OVERLAP));
      if (convex(i + 1) && p.length) p = keep(p, i + 1);
    }
    if (p.length) out.push(p);
  }
}
