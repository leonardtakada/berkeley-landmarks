import { clipHalf } from "./walker-cover";

/**
 * The wind on the city map's lawns (components/iso-grass.tsx), as an animated
 * film paints a meadow in a breeze: not blade by blade, but the field itself
 * — gusts off the Bay rolling east across the grass, never evenly: the wind
 * rising and falling (gusts and lulls), its crests unevenly spaced, each
 * building and dying as it goes, broken into patches that drift; small quick
 * flurries between. Each crest is a band where the grass is pressed over and
 * shows its pale side, a shadow in its wake as it springs back (each with the
 * lawns' painted grass drawn that way: assets/map/grass-bent, grass-back);
 * bright streaks stream through the crests, long white wind lines ride them,
 * and now and then a leaf tumbles along ahead. The trees lean with the same
 * gusts (components/iso-tree-sway.tsx, gustiness()).
 */

/** From this zoom the wind is drawn on the lawns (the tiles mark them from z16). */
export const GRASS_FROM_ZOOM = 16.1;

/** What each feature of the wind is, for the map's layers to draw it as. */
export const WIND = { trough: 0, halo: 1, crest: 2, streak: 3, line: 4, leaf: 5 } as const;

/** The wind's way across the drawing: east, which the drawing lays right and a little up. */
const [WX, WY] = [Math.cos(Math.PI / 6), 0.5];
/** Metres between the gusts' crests, and seconds for one to pass a place. */
export const WAVE = 90;
export const PERIOD = 4.5;
/** Metres across the wind between the points a crest's front is shaped at: close enough that its edges read as curves. */
const STEP = 8;
/** A crest's bands, as cel shading lays them: along the wind from the crest's front, metres — the shadow in its wake, the light, its brightest. */
const BANDS: [number, number, number][] = [
  [WIND.trough, -34, -14],
  [WIND.halo, -14, 10],
  [WIND.crest, -6, 3],
];
/** The flurries between: closer, quicker, narrower, light alone. */
const RIPPLE = 37;
const RIPPLE_BANDS: [number, number, number][] = [[WIND.halo, -5, 4]];
/** How far a crest's front strays from its line, at most, metres (front()). */
const STRAY = 12;

/** A lawn on the drawing (metres): its rings (closed, x, y pairs: the outer, then any holes) and their box. */
export type Lawn = { rings: number[][]; x0: number; y0: number; x1: number; y1: number };

type Box = { x0: number; y0: number; x1: number; y1: number };
const R = 6378137;
const toPlane = (lng: number, lat: number): [number, number] => [(lng * Math.PI * R) / 180, R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))];

/** A closed ring simplified (Douglas–Peucker) to within `tol` metres. */
function simplify(r: number[], tol: number): number[] {
  const n = r.length / 2;
  if (n < 6) return r;
  const keep = new Uint8Array(n);
  const mid = Math.floor(n / 2);
  keep[0] = keep[n - 1] = keep[mid] = 1;
  const stack: [number, number][] = [
    [0, mid],
    [mid, n - 1],
  ];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay, bx, by] = [r[2 * a], r[2 * a + 1], r[2 * b], r[2 * b + 1]];
    const [dx, dy] = [bx - ax, by - ay];
    const l = Math.hypot(dx, dy) || 1;
    let [best, far] = [-1, tol];
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((r[2 * i] - ax) * dy - (r[2 * i + 1] - ay) * dx) / l;
      if (d > far) [best, far] = [i, d];
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(r[2 * i], r[2 * i + 1]);
  return out.length >= 8 ? out : r;
}

/** A closed ring cut to a box. */
function toBox(r: number[], b: Box): number[] {
  let p = clipHalf(r, -1, 0, b.x0);
  if (p.length) p = clipHalf(p, 1, 0, -b.x1);
  if (p.length) p = clipHalf(p, 0, -1, b.y0);
  if (p.length) p = clipHalf(p, 0, 1, -b.y1);
  return p;
}

/**
 * The lawns among the map's `lawns` features (each a lawn's own part in
 * sight), on the drawing, cut to `box` and simplified — as the wind needs them.
 */
export function lawnsOf(features: { geometry?: { type: string; coordinates: unknown } | null }[], box: Box): Lawn[] {
  const out: Lawn[] = [];
  for (const f of features) {
    if (!f.geometry) continue;
    const polys =
      f.geometry.type === "Polygon"
        ? [f.geometry.coordinates as [number, number][][]]
        : f.geometry.type === "MultiPolygon"
          ? (f.geometry.coordinates as [number, number][][][])
          : [];
    for (const poly of polys) {
      const rings: number[][] = [];
      for (const ring of poly) {
        const flat: number[] = [];
        for (const [lng, lat] of ring) flat.push(...toPlane(lng, lat));
        if (flat[0] !== flat[flat.length - 2] || flat[1] !== flat[flat.length - 1]) flat.push(flat[0], flat[1]);
        const cut = toBox(simplify(flat, 0.5), box);
        if (cut.length >= 8) rings.push(cut);
        else if (!rings.length) break;
      }
      if (!rings.length) continue;
      let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
      const outer = rings[0];
      for (let i = 0; i < outer.length; i += 2) {
        [x0, y0, x1, y1] = [Math.min(x0, outer[i]), Math.min(y0, outer[i + 1]), Math.max(x1, outer[i]), Math.max(y1, outer[i + 1])];
      }
      out.push({ rings, x0, y0, x1, y1 });
    }
  }
  return out;
}

/** A number from 0 to 1 for a pair of numbers, always the same. */
function hash(i: number, j: number) {
  "worklet";
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** The wind's time, seconds: the wall clock's (within a day, so the sums stay exact), the same for the grass and the trees. */
export function windTime() {
  "worklet";
  return (Date.now() % 86_400_000) / 1000;
}

/**
 * The wind at time `t` (seconds): how far its waves have travelled, in waves
 * (it blows harder and softer, so they hurry and dawdle), and how hard it's
 * blowing, 0.12–1 — gusts and lulls.
 */
export function gustiness(t: number) {
  "worklet";
  // Its speed, a wave a PERIOD at its mean: s(t) = 1 + Σ a·sin(t/p + φ), never still; travelled, its integral.
  const s = 1 + 0.45 * Math.sin(t / 3.1) + 0.3 * Math.sin(t / 1.7 + 1.3) + 0.15 * Math.sin(t / 0.9 + 0.4);
  const travel = (t - 0.45 * 3.1 * Math.cos(t / 3.1) - 0.3 * 1.7 * Math.cos(t / 1.7 + 1.3) - 0.15 * 0.9 * Math.cos(t / 0.9 + 0.4)) / PERIOD;
  return { travel, power: Math.max(0.12, Math.min(1, (s - 0.35) / 1.3)) };
}

/** How far ahead (or behind) its line a crest's front runs at `c` across the wind: ragged, and changing as it goes. */
export function front(c: number, k: number, t: number) {
  "worklet";
  return 6 * Math.sin(c / 47 + k * 2.3) + 2 * Math.sin(c / 26 + k * 0.7) + 3.5 * Math.sin(t * 0.35 + c / 71 + k);
}

/** How strong a crest's gust is at `c` across the wind, 0–1: broken into patches that drift along it, some stretches calm. */
export function strength(c: number, k: number, t = 0) {
  "worklet";
  const d = c + t * (hash(k, 3.3) - 0.5) * 9;
  const g = 0.5 + 0.55 * Math.sin(d / 57 + k * 1.9) + 0.25 * Math.sin(d / 31 + k * 3.1);
  // (Eased, so a patch narrows to a point rather than ending square.)
  const e = Math.max(0, Math.min(1, g));
  return e * e * (3 - 2 * e);
}

/** How alive a crest is as it travels, 0.3–1: each building, then dying away. */
function life(k: number, t: number) {
  "worklet";
  return 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 0.45 + hash(k, 2.2) * 6.283));
}

/** Whether a point of the drawing lies on a lawn. */
function onLawn(lawns: Lawn[], x: number, y: number) {
  "worklet";
  for (const l of lawns) {
    if (x < l.x0 || x > l.x1 || y < l.y0 || y > l.y1) continue;
    let inside = false;
    for (const r of l.rings) {
      for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
        const [xi, yi, xj, yj] = [r[i], r[i + 1], r[j], r[j + 1]];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    if (inside) return true;
  }
  return false;
}

const DEG = 180 / (Math.PI * R);

/**
 * A crest's bands cut to the lawns: for the crest whose line lies `A` along
 * the wind, its bands `bands` (each widened by `scale`), shaped by `front`
 * and patched by `strength` (`k` its number), into `polys` (one string of
 * polygons for each band).
 */
function cutBands(lawns: Lawn[], A: number, k: number, t: number, bands: [number, number, number][], scale: number, polys: string[], pt: (x: number, y: number) => string) {
  "worklet";
  let [reach0, reach1] = [Infinity, -Infinity];
  for (const [, lo, hi] of bands) [reach0, reach1] = [Math.min(reach0, A + lo * scale - STRAY), Math.max(reach1, A + hi * scale + STRAY)];
  for (const l of lawns) {
    // The lawn cut to the reach of this crest along the wind, once: its steps are cut from that.
    const slab = (r: number[]) => {
      const p = clipHalf(r, -WX, -WY, reach0);
      return p.length ? clipHalf(p, WX, WY, -reach1) : p;
    };
    const outer = slab(l.rings[0]);
    if (!outer.length) continue;
    const rings = [outer];
    for (let q = 1; q < l.rings.length; q++) {
      const h = slab(l.rings[q]);
      if (h.length) rings.push(h);
    }
    // Its extent across the wind: the steps to cut it in.
    let [lc0, lc1] = [Infinity, -Infinity];
    for (let j = 0; j < outer.length; j += 2) {
      const c = -outer[j] * WY + outer[j + 1] * WX;
      [lc0, lc1] = [Math.min(lc0, c), Math.max(lc1, c)];
    }
    for (let i = Math.floor(lc0 / STEP); i < Math.ceil(lc1 / STEP); i++) {
      const [ca, cb] = [i * STEP, (i + 1) * STEP];
      const [sa, sb] = [strength(ca, k, t) * scale, strength(cb, k, t) * scale];
      if (sa < 0.03 && sb < 0.03) continue;
      const [fa, fb] = [A + front(ca, k, t), A + front(cb, k, t)];
      for (let n = 0; n < bands.length; n++) {
        const [, lo, hi] = bands[n];
        // The band's near and far edges either side of the step, narrowing to nothing where the gust is calm.
        const [la, lb, ha, hb] = [fa + lo * sa, fb + lo * sb, fa + hi * sa, fb + hi * sb];
        const [mh, ml] = [(hb - ha) / STEP, (lb - la) / STEP];
        // Between the two lines across, behind the band's far edge and ahead of its near one.
        const cutRing = (r: number[]) => {
          let p = clipHalf(r, WY, -WX, ca);
          if (p.length) p = clipHalf(p, -WY, WX, -cb);
          if (p.length) p = clipHalf(p, WX + mh * WY, WY - mh * WX, mh * ca - ha);
          if (p.length) p = clipHalf(p, -(WX + ml * WY), -(WY - ml * WX), la - ml * ca);
          return p;
        };
        let out = "";
        for (let q = 0; q < rings.length; q++) {
          const r = cutRing(rings[q]);
          if (!r.length) {
            if (q === 0) break;
            continue;
          }
          let str = "";
          for (let j = 0; j < r.length; j += 2) str += (j ? "," : "") + pt(r[j], r[j + 1]);
          out += `${out ? "," : ""}[${str}]`;
        }
        if (out) polys[n] += `${polys[n] ? "," : ""}[${out}]`;
      }
    }
  }
}

/**
 * The wind at time `t` (seconds) over the lawns in `view` (the drawing's
 * metres), as GeoJSON for the map: each crest's bands and the flurries'
 * (features marked `g` with what they are, WIND, and `o` with how strong),
 * cut to the lawns; the streaks in the crests, the wind lines riding them,
 * the leaves blown along. Still, with Reduce Motion: the bands where they
 * lie, no wind.
 */
export function windFrame(lawns: Lawn[], view: Box, t: number, still: boolean): string {
  "worklet";
  if (!lawns.length) return '{"type":"FeatureCollection","features":[]}';
  const pt = (x: number, y: number) => `[${Math.round(x * DEG * 1e7) / 1e7},${Math.round(y * DEG * 1e7) / 1e7}]`;
  /** From along and across the wind back to the drawing. */
  const X = (a: number, c: number) => a * WX - c * WY;
  const Y = (a: number, c: number) => a * WY + c * WX;
  // The view, along and across the wind.
  let [a0, a1, c0, c1] = [Infinity, -Infinity, Infinity, -Infinity];
  const corners = [
    [view.x0, view.y0],
    [view.x1, view.y0],
    [view.x0, view.y1],
    [view.x1, view.y1],
  ];
  for (const [x, y] of corners) {
    const [a, c] = [x * WX + y * WY, -x * WY + y * WX];
    [a0, a1, c0, c1] = [Math.min(a0, a), Math.max(a1, a), Math.min(c0, c), Math.max(c1, c)];
  }
  const { travel, power } = still ? { travel: 0, power: 0.7 } : gustiness(t);
  let features = "";
  let extras = "";
  const feature = (g: number, o: number, polys: string) => {
    if (polys) features += `${features ? "," : ""}{"type":"Feature","properties":{"g":${g},"o":${o}},"geometry":{"type":"MultiPolygon","coordinates":[${polys}]}}`;
  };
  // The flurries between the crests: closer, quicker, fainter, coming and going with the wind.
  if (!still && power > 0.3) {
    const shift = travel * WAVE * 1.45;
    for (let k = Math.floor((a0 - 20 - shift) / RIPPLE); k <= Math.ceil((a1 + 20 - shift) / RIPPLE); k++) {
      const kk = k + 5000;
      const lively = life(kk, t * 1.6) * (power - 0.3) * 1.4;
      if (lively < 0.12) continue;
      const polys = [""];
      cutBands(lawns, k * RIPPLE + (hash(kk, 1.1) - 0.5) * 16 + shift, kk, t, RIPPLE_BANDS, Math.min(1, lively), polys, pt);
      feature(WIND.halo, Math.round(lively * 0.6 * 100) / 100, polys[0]);
    }
  }
  const shift = travel * WAVE;
  for (let k = Math.floor((a0 - 60 - shift) / WAVE); k <= Math.ceil((a1 + 60 - shift) / WAVE); k++) {
    // Not evenly spaced, and each building and dying as it goes.
    const A = k * WAVE + (hash(k, 1.1) - 0.5) * 36 + shift;
    const lively = still ? 0.8 : life(k, t) * (0.35 + 0.65 * power);
    const o = Math.round(Math.min(1, (0.45 + 0.55 * hash(k, 7.3)) * (0.4 + 0.6 * lively)) * 100) / 100;
    const polys = ["", "", ""];
    cutBands(lawns, A, k, t, BANDS, 0.45 + 0.55 * lively, polys, pt);
    for (let n = 0; n < BANDS.length; n++) feature(BANDS[n][0], o, polys[n]);
    if (still) continue;
    // Streaks of light streaming through the crest: strokes along the wind, a few to every 20 metres across it where the gust is strong.
    let streaks = "";
    for (let i = Math.floor(c0 / 20) - 1; i <= Math.ceil(c1 / 20); i++) {
      for (let j = 0; j < 4; j++) {
        const c = (i + hash(i * 4 + j, k)) * 20;
        const s = strength(c, k, t) * lively;
        if (s < 0.3) continue;
        const a = A + front(c, k, t) + (hash(k, i * 4 + j) - 0.65) * 12 * s;
        const len = (9 + hash(i + j * 7, k * 3) * 16) * s;
        const [xa, ya] = [X(a - len / 2, c), Y(a - len / 2, c)];
        const [xb, yb] = [X(a + len / 2, c + 0.4), Y(a + len / 2, c + 0.4)];
        if (!onLawn(lawns, xa, ya) || !onLawn(lawns, xb, yb)) continue;
        streaks += `${streaks ? "," : ""}[${pt(xa, ya)},${pt(X(a, c + 0.9), Y(a, c + 0.9))},${pt(xb, yb)}]`;
      }
    }
    if (streaks) extras += `,{"type":"Feature","properties":{"g":${WIND.streak},"o":${o}},"geometry":{"type":"MultiLineString","coordinates":[${streaks}]}}`;
    // Wind lines riding the crest in a gust: long, curving, one every hundred metres or so across it, over the lawns.
    for (let m = Math.floor(c0 / 110) - 1; m <= Math.ceil(c1 / 110); m++) {
      const c = (m + 0.2 + hash(m, k) * 0.6) * 110;
      if (strength(c, k, t) * lively < 0.35 || hash(k, m * 3.7) > 0.75) continue;
      const a = A + front(c, k, t) + 2;
      if (!onLawn(lawns, X(a, c), Y(a, c))) continue;
      const len = (40 + hash(m * 2.1, k) * 70) * (0.6 + 0.4 * lively);
      let line = "";
      for (let n = 0; n <= 10; n++) {
        const f = n / 10 - 0.5;
        const [aa, cc] = [a + f * len, c + Math.sin((f + 0.5) * Math.PI) * 3.5 + Math.sin(f * 9 + m) * 0.8];
        line += `${line ? "," : ""}${pt(X(aa, cc), Y(aa, cc) + 2.5)}`;
      }
      extras += `,{"type":"Feature","properties":{"g":${WIND.line},"o":${o}},"geometry":{"type":"LineString","coordinates":[${line}]}}`;
    }
    // A leaf now and then, tumbling along ahead of the crest — more of them in a gust.
    for (let m = Math.floor(c0 / 70); m <= Math.ceil(c1 / 70); m++) {
      if (hash(m * 1.3, k * 2.9) > 0.2 + 0.3 * lively) continue;
      const c = (m + hash(m, k * 5.1)) * 70;
      const run = ((t / PERIOD + hash(k, m)) % 1) * 22;
      const a = A + front(c, k, t) + 4 + run;
      if (!onLawn(lawns, X(a, c), Y(a, c))) continue;
      const [lx, ly] = [X(a, c), Y(a, c) + 1.5 + Math.abs(Math.sin(run / 3)) * 3];
      const spin = t * 5 + hash(m, k) * 90;
      const [cs, sn] = [Math.cos(spin), Math.sin(spin)];
      const shape = [
        [0.9, 0],
        [0, 0.35],
        [-0.9, 0],
        [0, -0.35],
        [0.9, 0],
      ];
      const leaf = shape.map(([u, v]) => pt(lx + u * cs - v * sn * 0.6, ly + u * sn + v * cs * 0.6)).join(",");
      extras += `,{"type":"Feature","properties":{"g":${WIND.leaf},"c":${hash(m, k * 7) > 0.6 ? 1 : 0}},"geometry":{"type":"Polygon","coordinates":[[${leaf}]]}}`;
    }
  }
  return `{"type":"FeatureCollection","features":[${features}${features ? extras : extras.slice(1)}]}`;
}
