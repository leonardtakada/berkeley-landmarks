import { BODY, CAST, HEAD, HEAD_INK, LEGS, WALKERS, type Figure } from "./walker-cast";

/**
 * The architects as flat shapes for the city map, where they're drawn as
 * filled polygons on the drawing itself (components/iso-walkers.tsx): each
 * figure's parts in the order they're laid down, as rings of x, y pairs in
 * the figure's 14 × 34 box (y down, feet at 34). The legs aren't here — they
 * swing, so they're worked out for each frame.
 */
export type Part = { ink: string; rings: number[][] };

/** The fine charcoal keyline round coat and head, so a paper coat still reads on paper streets. */
export const KEYLINE = 0.55;
const CURVE_STEPS = 4;
const ELLIPSE_STEPS = 14;

/**
 * An SVG path (the few commands the cast is drawn with: M L H V Q Z, their
 * relative forms, and the half-ellipse arcs of lib/walker-cast's ellipse())
 * as closed rings of points.
 */
export function flatten(d: string): number[][] {
  const rings: number[][] = [];
  let ring: number[] = [];
  let [x, y] = [0, 0];
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  let i = 0;
  const num = () => Number(tokens[i++]);
  const close = () => {
    if (ring.length >= 6) rings.push(ring);
    ring = [];
  };
  let cmd = "";
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const [ox, oy] = rel ? [x, y] : [0, 0];
    switch (cmd.toUpperCase()) {
      case "M":
        close();
        [x, y] = [ox + num(), oy + num()];
        ring.push(x, y);
        cmd = rel ? "l" : "L"; // (Further pairs after a move are lines.)
        break;
      case "L":
        [x, y] = [ox + num(), oy + num()];
        ring.push(x, y);
        break;
      case "H":
        x = (rel ? x : 0) + num();
        ring.push(x, y);
        break;
      case "V":
        y = (rel ? y : 0) + num();
        ring.push(x, y);
        break;
      case "Q": {
        const [cx, cy, ex, ey] = [ox + num(), oy + num(), ox + num(), oy + num()];
        for (let k = 1; k <= CURVE_STEPS; k++) {
          const t = k / CURVE_STEPS;
          const u = 1 - t;
          ring.push(u * u * x + 2 * u * t * cx + t * t * ex, u * u * y + 2 * u * t * cy + t * t * ey);
        }
        [x, y] = [ex, ey];
        break;
      }
      case "A": {
        // Half an ellipse, from one end of its width to the other.
        const [rx, ry] = [num(), num()];
        num(); // (rotation: none in the cast)
        num(); // (large-arc: always half)
        const sweep = num();
        const [ex, ey] = [ox + num(), oy + num()];
        const [cx, cy] = [(x + ex) / 2, (y + ey) / 2];
        const from = ex > x ? Math.PI : 0;
        for (let k = 1; k <= ELLIPSE_STEPS / 2; k++) {
          const th = from + (sweep ? 1 : -1) * (Math.PI * k) / (ELLIPSE_STEPS / 2);
          ring.push(cx + rx * Math.cos(th), cy + ry * Math.sin(th));
        }
        [x, y] = [ex, ey];
        break;
      }
      case "Z":
        close();
        break;
      default:
        i++;
    }
  }
  close();
  // Rings end where they began, as GeoJSON has them.
  return rings.map((r) => {
    const n = r.length;
    return r[0] === r[n - 2] && r[1] === r[n - 1] ? r : [...r, r[0], r[1]];
  });
}

/** A convex ring grown outward by `by` on every side. */
export function grow(ring: number[], by: number): number[] {
  const n = ring.length / 2 - 1; // (closed: the last point repeats the first)
  let area = 0;
  for (let i = 0; i < n; i++) area += ring[2 * i] * ring[2 * i + 3] - ring[2 * i + 2] * ring[2 * i + 1];
  const out: number[] = [];
  const side = area > 0 ? 1 : -1;
  // Each edge pushed out, and each corner where the pushed edges meet.
  const edge = (i: number) => {
    const [x0, y0, x1, y1] = [ring[2 * i], ring[2 * i + 1], ring[2 * i + 2], ring[2 * i + 3]];
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const [nx, ny] = [(side * (y1 - y0)) / len, (-side * (x1 - x0)) / len];
    return [x0 + nx * by, y0 + ny * by, x1 + nx * by, y1 + ny * by];
  };
  for (let i = 0; i < n; i++) {
    const [a0x, a0y, a1x, a1y] = edge((i + n - 1) % n);
    const [b0x, b0y, b1x, b1y] = edge(i);
    const den = (a1x - a0x) * (b1y - b0y) - (a1y - a0y) * (b1x - b0x);
    if (Math.abs(den) < 1e-9) out.push(b0x, b0y);
    else {
      const t = ((b0x - a0x) * (b1y - b0y) - (b0y - a0y) * (b1x - b0x)) / den;
      out.push(a0x + t * (a1x - a0x), a0y + t * (a1y - a0y));
    }
  }
  out.push(out[0], out[1]);
  return out;
}

function shapesOf(fig: Figure): Part[] {
  const coat = flatten(fig.skirt ? BODY.skirt : BODY.coat);
  const head = flatten(HEAD);
  const parts: Part[] = [
    { ink: LEGS.ink, rings: [...coat.map((r) => grow(r, KEYLINE)), ...head.map((r) => grow(r, KEYLINE))] },
    { ink: fig.coat, rings: coat },
    { ink: fig.head ?? HEAD_INK, rings: head },
  ];
  for (const m of fig.marks) {
    const last = parts[parts.length - 1];
    // (Consecutive parts of one ink go as one.)
    if (last.ink === m.fill) last.rings.push(...flatten(m.d));
    else parts.push({ ink: m.fill, rings: flatten(m.d) });
  }
  return parts;
}

/** Every walker's parts, in the order of WALKERS. */
export const WALKER_SHAPES: Part[][] = WALKERS.map((k) => shapesOf(CAST[k]));
