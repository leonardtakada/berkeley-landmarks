// Street context for each walk's fold-out map.
//
// For every tour, takes the named streets of OpenStreetMap (data/osm-streets.json,
// © OpenStreetMap contributors, ODbL) that fall inside the walk's map frame,
// simplifies them, packs them as small integer offsets, and works out which
// streets the route itself follows (ranked by how far the walk goes along
// each) so the map can name them.
//
//   npx tsx scripts/bake-walk-streets.ts  →  data/walk-streets.generated.ts
import fs from "node:fs";

import { tours } from "../data/tours";
import { landmarks } from "../data/landmarks";

type LL = { lat: number; lon: number };
type Way = { tags?: Record<string, string>; geometry?: LL[] };

const KEEP: Record<string, number> = {
  // class: 2 major, 1 minor, 0 path
  trunk: 2,
  primary: 2,
  secondary: 2,
  tertiary: 1,
  residential: 1,
  unclassified: 1,
  living_street: 1,
  pedestrian: 0,
};
const Q = 1e5; // quantisation: 1e-5° ≈ 1 m
const K = Math.cos((37.87 * Math.PI) / 180);
const M_PER_DEG = 111_320;

const osm = JSON.parse(fs.readFileSync("data/osm-streets.json", "utf8")) as { elements: Way[] };
const ways = osm.elements.filter((w) => w.tags?.name && w.tags.highway && w.tags.highway in KEEP && w.geometry?.length);

/** Metres between two points (planar, fine at walking scale). */
function dist(a: LL, b: LL) {
  return Math.hypot((a.lon - b.lon) * K, a.lat - b.lat) * M_PER_DEG;
}

/** Distance in metres from p to segment ab. */
function segDist(p: LL, a: LL, b: LL) {
  const ax = a.lon * K, ay = a.lat, bx = b.lon * K, by = b.lat, px = p.lon * K, py = p.lat;
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * M_PER_DEG;
}

/** Douglas–Peucker simplification with a tolerance in metres. */
function simplify(pts: LL[], tol: number): LL[] {
  if (pts.length < 3) return pts;
  let idx = -1, max = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = segDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > max) { max = d; idx = i; }
  }
  if (max <= tol) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, idx + 1), tol).slice(0, -1), ...simplify(pts.slice(idx), tol)];
}

const out: Record<string, { o: [number, number]; n: string[]; r: string[]; s: number[][] }> = {};
let totalPts = 0;

for (const tour of tours) {
  const stops = tour.stops
    .map((s) => landmarks.find((l) => l.id === s.landmarkId))
    .filter((l): l is NonNullable<typeof l> => !!l)
    .map((l) => ({ lat: l.latitude, lon: l.longitude }));
  const route = tour.routeCoordinates.map((c) => ({ lat: c.latitude, lon: c.longitude }));
  const pts = [...route, ...stops];
  if (pts.length < 2) continue;

  // The frame the fold-out map can show, generously: the walk's extent grown
  // to the map's shape plus its margins.
  const minLat = Math.min(...pts.map((p) => p.lat)), maxLat = Math.max(...pts.map((p) => p.lat));
  const minLon = Math.min(...pts.map((p) => p.lon)), maxLon = Math.max(...pts.map((p) => p.lon));
  const cLat = (minLat + maxLat) / 2, cLon = (minLon + maxLon) / 2;
  const s = Math.max((maxLon - minLon) * K, (maxLat - minLat) / 0.95, 0.002);
  const box = { w: cLon - (0.8 * s) / K, e: cLon + (0.8 * s) / K, s: cLat - 0.75 * s, n: cLat + 0.75 * s };
  const inside = (p: LL) => p.lon >= box.w && p.lon <= box.e && p.lat >= box.s && p.lat <= box.n;

  // Clip each way to runs that touch the frame.
  const runs: { name: string; cls: number; pts: LL[] }[] = [];
  for (const w of ways) {
    const g = w.geometry!;
    let run: LL[] = [];
    for (let i = 0; i < g.length; i++) {
      const inNow = inside(g[i]);
      const inNext = i + 1 < g.length && inside(g[i + 1]);
      const inPrev = i > 0 && inside(g[i - 1]);
      if (inNow || inNext || inPrev) run.push(g[i]);
      else if (run.length) { runs.push({ name: w.tags!.name, cls: KEEP[w.tags!.highway], pts: run }); run = []; }
    }
    if (run.length > 1) runs.push({ name: w.tags!.name, cls: KEEP[w.tags!.highway], pts: run });
  }

  // Which streets the walk follows: sample the route every ~8 m and credit
  // the nearest street within 14 m.
  const along = new Map<string, number>();
  for (let i = 0; i + 1 < route.length; i++) {
    const a = route[i], b = route[i + 1];
    const len = dist(a, b);
    const steps = Math.max(1, Math.ceil(len / 8));
    for (let k = 0; k < steps; k++) {
      const t = (k + 0.5) / steps;
      const p = { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t };
      let best: string | null = null, bestD = 14;
      for (const r of runs) {
        if (r.cls === 0) continue;
        for (let j = 0; j + 1 < r.pts.length; j++) {
          const d = segDist(p, r.pts[j], r.pts[j + 1]);
          if (d < bestD) { bestD = d; best = r.name; }
        }
      }
      if (best) along.set(best, (along.get(best) ?? 0) + len / steps);
    }
  }
  const routeStreets = [...along.entries()].filter(([, m]) => m >= 60).sort((a, b) => b[1] - a[1]).map(([n]) => n);

  const names: string[] = [];
  const nameIdx = (n: string) => {
    let i = names.indexOf(n);
    if (i < 0) { names.push(n); i = names.length - 1; }
    return i;
  };
  const o: [number, number] = [Math.round(box.w * Q) / Q, Math.round(box.s * Q) / Q];
  const packed = runs.map((r) => {
    const simple = simplify(r.pts, 2.5);
    totalPts += simple.length;
    return [r.cls, nameIdx(r.name), ...simple.flatMap((p) => [Math.round((p.lon - o[0]) * Q), Math.round((p.lat - o[1]) * Q)])];
  });
  out[tour.id] = { o, n: names, r: routeStreets.slice(0, 6), s: packed };
  console.log(`${tour.id}: ${runs.length} street runs, follows ${routeStreets.slice(0, 4).join(", ")}`);
}

fs.writeFileSync(
  "data/walk-streets.generated.ts",
  "// Generated by scripts/bake-walk-streets.ts from OpenStreetMap data\n" +
    "// (© OpenStreetMap contributors, ODbL). Do not edit.\n" +
    "//\n" +
    "// Per tour: o = origin [lon, lat]; n = street names; r = streets the walk\n" +
    "// follows, most-walked first; s = runs as [class, nameIndex, x0, y0, x1, y1…]\n" +
    "// with x/y in 1e-5° offsets from o. Class: 2 major, 1 minor, 0 path.\n" +
    "export const WALK_STREETS: Record<string, { o: [number, number]; n: string[]; r: string[]; s: number[][] }> = " +
    JSON.stringify(out) +
    ";\n",
);
console.log(`wrote data/walk-streets.generated.ts (${totalPts} points)`);
