/** Small plane-geometry helpers for the isometric maps. Points are [u, v] in local metres. */

export type Pt = [number, number];
export type Ring = Pt[];

export function signedArea(r: Ring): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return a / 2; // > 0 counter-clockwise (v north, u east)
}

export function area(r: Ring): number {
  return Math.abs(signedArea(r));
}

export function centroid(r: Ring): Pt {
  let x = 0;
  let y = 0;
  for (const p of r) [x, y] = [x + p[0], y + p[1]];
  return [x / r.length, y / r.length];
}

/** Drops a closing point that repeats the first. */
export function open(r: Ring): Ring {
  const [a, b] = [r[0], r[r.length - 1]];
  return r.length > 1 && a[0] === b[0] && a[1] === b[1] ? r.slice(0, -1) : r;
}

/** Counter-clockwise for an outer ring, clockwise for a hole. */
export function orient(r: Ring, outer: boolean): Ring {
  const ccw = signedArea(r) > 0;
  return ccw === outer ? r : [...r].reverse();
}

export function pointInRing(p: Pt, r: Ring): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Douglas–Peucker, keeping ring closure. */
export function simplify(r: Ring, tol: number): Ring {
  if (r.length < 5) return r;
  const keep = new Uint8Array(r.length);
  keep[0] = keep[r.length - 1] = 1;
  const stack: [number, number][] = [[0, r.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let best = -1;
    let dist = tol;
    for (let i = a + 1; i < b; i++) {
      const d = segDist(r[i], r[a], r[b]);
      if (d > dist) [best, dist] = [i, d];
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  const out = r.filter((_, i) => keep[i]);
  return out.length >= 3 ? out : r;
}

export function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Chaikin corner cutting on a closed ring. */
export function smooth(r: Ring, passes = 1): Ring {
  let out = r;
  for (let k = 0; k < passes; k++) {
    const next: Ring = [];
    for (let i = 0; i < out.length; i++) {
      const a = out[i];
      const b = out[(i + 1) % out.length];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    out = next;
  }
  return out;
}

export interface Box {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/** Sutherland–Hodgman against an axis-aligned box. */
export function clipRing(r: Ring, b: Box): Ring {
  let out = r;
  const edges: [(p: Pt) => boolean, (p: Pt, q: Pt) => Pt][] = [
    [(p) => p[0] >= b.u0, (p, q) => at(p, q, (b.u0 - p[0]) / (q[0] - p[0]))],
    [(p) => p[0] <= b.u1, (p, q) => at(p, q, (b.u1 - p[0]) / (q[0] - p[0]))],
    [(p) => p[1] >= b.v0, (p, q) => at(p, q, (b.v0 - p[1]) / (q[1] - p[1]))],
    [(p) => p[1] <= b.v1, (p, q) => at(p, q, (b.v1 - p[1]) / (q[1] - p[1]))],
  ];
  for (const [inside, cross] of edges) {
    if (!out.length) break;
    const next: Ring = [];
    for (let i = 0; i < out.length; i++) {
      const p = out[i];
      const q = out[(i + 1) % out.length];
      const [pi, qi] = [inside(p), inside(q)];
      if (pi) next.push(p);
      if (pi !== qi) next.push(cross(p, q));
    }
    out = next;
  }
  return out;
}

const at = (p: Pt, q: Pt, t: number): Pt => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];

/** A polyline cut to a box: the runs of it inside. */
export function clipLine(line: Pt[], b: Box): Pt[][] {
  const runs: Pt[][] = [];
  let run: Pt[] = [];
  for (let i = 1; i < line.length; i++) {
    const seg = clipSeg(line[i - 1], line[i], b);
    if (!seg) {
      if (run.length > 1) runs.push(run);
      run = [];
      continue;
    }
    const [p, q] = seg;
    if (!run.length || run[run.length - 1][0] !== p[0] || run[run.length - 1][1] !== p[1]) {
      if (run.length > 1) runs.push(run);
      run = [p];
    }
    run.push(q);
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

function clipSeg(p: Pt, q: Pt, b: Box): [Pt, Pt] | null {
  let t0 = 0;
  let t1 = 1;
  const d = [q[0] - p[0], q[1] - p[1]];
  const checks: [number, number][] = [
    [-d[0], p[0] - b.u0],
    [d[0], b.u1 - p[0]],
    [-d[1], p[1] - b.v0],
    [d[1], b.v1 - p[1]],
  ];
  for (const [pp, qq] of checks) {
    if (pp === 0) {
      if (qq < 0) return null;
    } else {
      const t = qq / pp;
      if (pp < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return null;
    }
  }
  return [at(p, q, t0), at(p, q, t1)];
}

/** Points every `step` metres along a polyline, keeping its corners. */
export function densify(line: Pt[], step: number): Pt[] {
  const out: Pt[] = [line[0]];
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 1; k <= n; k++) out.push(at(a, b, k / n));
  }
  return out;
}

/**
 * The smallest rectangle around a ring (rotating calipers over its hull
 * edges, brute force — footprints are small): its corners, long side first.
 */
export function minRect(r: Ring): { corners: Ring; long: number; short: number; fill: number } {
  let best: { corners: Ring; long: number; short: number; a: number } | null = null;
  for (let i = 0; i < r.length; i++) {
    const [a, b] = [r[i], r[(i + 1) % r.length]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) continue;
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;
    let [lo1, hi1, lo2, hi2] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const p of r) {
      const s = p[0] * ux + p[1] * uy;
      const t = -p[0] * uy + p[1] * ux;
      [lo1, hi1, lo2, hi2] = [Math.min(lo1, s), Math.max(hi1, s), Math.min(lo2, t), Math.max(hi2, t)];
    }
    const a2 = (hi1 - lo1) * (hi2 - lo2);
    if (!best || a2 < best.a) {
      const c = (s: number, t: number): Pt => [s * ux - t * uy, s * uy + t * ux];
      const w = hi1 - lo1;
      const h = hi2 - lo2;
      const corners = w >= h ? [c(lo1, lo2), c(hi1, lo2), c(hi1, hi2), c(lo1, hi2)] : [c(hi1, lo2), c(hi1, hi2), c(lo1, hi2), c(lo1, lo2)];
      best = { corners, long: Math.max(w, h), short: Math.min(w, h), a: a2 };
    }
  }
  if (!best) return { corners: r, long: 0, short: 0, fill: 0 };
  return { corners: best.corners, long: best.long, short: best.short, fill: area(r) / best.a };
}
