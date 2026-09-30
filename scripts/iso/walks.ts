/**
 * The streets the city map's walkers walk (components/iso-walkers.tsx): a
 * network of the streets drawn on the map, laid on their terraces, and — for
 * each stretch of street — where a walker there would be out of sight,
 * behind a house, a tree or a nearer rise of the land. There the walkers are
 * hidden, as the cover's pass behind the Campanile.
 *
 *   npx tsx scripts/iso/walks.ts  → lib/iso-walks.generated.ts
 */
import fs from "node:fs";

import { iso, toLocal } from "../../lib/iso";
import { simplify, type Pt } from "./geom";
import { buildScene, levelAt, levelZ, terrain, type Piece } from "./scene";
import { CITY_BOX } from "./city-proof";

const OUT = "lib/iso-walks.generated.ts";
/** A walker's height on the drawing, metres (the map scales its figures to it). */
export const WALKER_HEIGHT = 11;
/** The streets people walk: those the map draws, less the freeways. */
const WALKABLE = new Set(["primary", "secondary", "tertiary", "residential", "unclassified", "living_street", "pedestrian"]);
/** Networks smaller than this many junctions and bends aren't worth a walker. */
const SMALLEST = 12;
const SAMPLE = 2;
const CELL = 20;

type OsmWay = { id: number; nodes?: number[]; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] };
type P3 = [number, number, number];

async function main() {
  const t0 = Date.now();
  const box = CITY_BOX;
  const t = await terrain();
  const zAt = (u: number, v: number) => Math.max(0, levelZ(levelAt(t, u, v)));

  // ── The network, by OpenStreetMap node ──────────────────────────────────
  const ways: OsmWay[] = JSON.parse(fs.readFileSync("data/osm-streets.json", "utf8")).elements;
  const at = new Map<number, Pt>();
  const adj = new Map<number, Set<number>>();
  const inside = ([u, v]: Pt) => u > box.u0 + 5 && u < box.u1 - 5 && v > box.v0 + 5 && v < box.v1 - 5;
  const link = (a: number, b: number) => {
    if (a === b) return;
    (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
    (adj.get(b) ?? adj.set(b, new Set()).get(b)!).add(a);
  };
  for (const w of ways) {
    if (!WALKABLE.has(w.tags?.highway ?? "") || w.tags?.tunnel === "yes" || !w.nodes || !w.geometry) continue;
    if (w.nodes.length !== w.geometry.length) continue;
    const pts = w.geometry.map(({ lat, lon }) => {
      const q = toLocal(lat, lon);
      return [q.u, q.v] as Pt;
    });
    w.nodes.forEach((id, i) => at.set(id, pts[i]));
    for (let i = 1; i < w.nodes.length; i++) {
      if (inside(pts[i - 1]) && inside(pts[i])) link(w.nodes[i - 1], w.nodes[i]);
    }
  }
  // Only networks of a size to wander.
  const seen = new Set<number>();
  for (const start of [...adj.keys()]) {
    if (seen.has(start)) continue;
    const part = [start];
    seen.add(start);
    for (let i = 0; i < part.length; i++) {
      for (const n of adj.get(part[i])!) if (!seen.has(n)) (seen.add(n), part.push(n));
    }
    if (part.length < SMALLEST) for (const n of part) adj.delete(n);
  }
  for (const [n, ns] of adj) for (const m of ns) if (!adj.has(m)) ns.delete(m);

  // ── Chains between junctions, simplified, stepped onto the terraces ─────
  const key = (n: number) => adj.get(n)!.size !== 2;
  const verts: P3[] = [];
  const vertOf = new Map<number, number>();
  const vertex = (p: P3, id?: number) => {
    if (id !== undefined && vertOf.has(id)) return vertOf.get(id)!;
    verts.push(p);
    if (id !== undefined) vertOf.set(id, verts.length - 1);
    return verts.length - 1;
  };
  const links: [number, number][] = [];
  const done = new Set<string>();
  const walkChain = (a: number, b: number) => {
    const ids = [a, b];
    while (!key(ids[ids.length - 1]) && ids[ids.length - 1] !== a) {
      const [prev, here] = [ids[ids.length - 2], ids[ids.length - 1]];
      const next = [...adj.get(here)!].find((n) => n !== prev)!;
      ids.push(next);
    }
    for (let i = 1; i < ids.length; i++) done.add(`${ids[i - 1]}>${ids[i]}`), done.add(`${ids[i]}>${ids[i - 1]}`);
    const line = simplify(ids.map((id) => at.get(id)!), 1);
    // Up and down the terraces: where the level changes, a step.
    const out: P3[] = [];
    for (let i = 0; i < line.length; i++) {
      const [u, v] = line[i];
      if (i === 0) {
        out.push([u, v, zAt(u, v)]);
        continue;
      }
      const [pu, pv] = line[i - 1];
      const n = Math.max(1, Math.ceil(Math.hypot(u - pu, v - pv) / 4));
      let z = out[out.length - 1][2];
      for (let k = 1; k <= n; k++) {
        const su = pu + ((u - pu) * k) / n;
        const sv = pv + ((v - pv) * k) / n;
        const sz = zAt(su, sv);
        if (sz !== z) {
          out.push([su, sv, z], [su, sv, sz]);
          z = sz;
        }
      }
      const last = out[out.length - 1];
      if (last[0] !== u || last[1] !== v) out.push([u, v, z]);
    }
    const first = vertex(out[0], ids[0]);
    const lastId = ids[ids.length - 1];
    let prev = first;
    for (let i = 1; i < out.length; i++) {
      const v = i === out.length - 1 ? vertex(out[i], lastId) : vertex(out[i]);
      if (v !== prev) links.push([prev, v]);
      prev = v;
    }
  };
  for (const [a, ns] of adj) {
    if (!key(a)) continue;
    for (const b of ns) if (!done.has(`${a}>${b}`)) walkChain(a, b);
  }
  // Rings with no junction on them.
  for (const [a, ns] of adj) for (const b of ns) if (!done.has(`${a}>${b}`)) walkChain(a, b);
  console.log(`network: ${verts.length} points, ${links.length} stretches, ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // ── What stands in front: the scene's buildings and trees, on a grid ────
  const { solids } = await buildScene({ box, heightScale: 1.4, plate: { depth: 30 } });
  type Occluder = { d: number; poly: Pt[]; x0: number; y0: number; x1: number; y1: number };
  const grid = new Map<string, Occluder[]>();
  const flat = (p: P3): Pt => {
    const q = iso(p[0], p[1], p[2]);
    return [q.x, q.y];
  };
  const shapeOf = (p: Piece): Pt[] => {
    if (p.kind === "poly") return p.rings[0].map(flat);
    if (p.kind === "line") {
      const [a, b] = p.pts;
      const w = p.width / 2;
      return [flat([a[0] - w, a[1] + w, a[2]]), flat([a[0] + w, a[1] - w, a[2]]), flat([b[0] + w, b[1] - w, b[2]]), flat([b[0] - w, b[1] + w, b[2]])];
    }
    const [cx, cy] = flat(p.at);
    return Array.from({ length: 12 }, (_, i) => [cx + Math.cos((i / 12) * Math.PI * 2) * p.r, cy + Math.sin((i / 12) * Math.PI * 2) * p.r] as Pt);
  };
  let count = 0;
  for (const s of solids) {
    for (const piece of s.pieces) {
      const poly = shapeOf(piece);
      if (poly.length < 3) continue;
      let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const [x, y] of poly) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
      const o = { d: s.d, poly, x0, y0, x1, y1 };
      for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
        for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) {
          const k = `${cx},${cy}`;
          (grid.get(k) ?? grid.set(k, []).get(k)!).push(o);
        }
      }
      count++;
    }
  }
  console.log(`occluders: ${count}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const pip = ([x, y]: Pt, r: Pt[]) => {
    let inside = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i];
      const [xj, yj] = r[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  /** Whether something nearer covers this point of the drawing, for a walker standing `depth` back. */
  const covered = (p: Pt, depth: number) => {
    for (const o of grid.get(`${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`) ?? []) {
      if (o.d >= depth || p[0] < o.x0 || p[0] > o.x1 || p[1] < o.y0 || p[1] > o.y1) continue;
      if (pip(p, o.poly)) return true;
    }
    return false;
  };
  /** Whether a nearer, higher terrace covers the point `h` over a walker at (u, v, z). */
  const underHill = (u: number, v: number, z: number, h: number) => {
    for (let k = levelAt(t, u, v) + 1; k < 30; k++) {
      const dz = levelZ(k) - (z + h);
      if (dz <= 0) continue;
      // The ground at that height that draws where this point does lies dz nearer, on the diagonal.
      if (levelAt(t, u - dz, v - dz) >= k) return true;
      if (dz > 400) break;
    }
    return false;
  };
  const hiddenAt = (u: number, v: number, z: number) => {
    const [x, y] = flat([u, v, z]);
    return [0.55, 0.9].some((f) => covered([x, y + WALKER_HEIGHT * f], u + v) || underHill(u, v, z, WALKER_HEIGHT * f));
  };

  // ── Where along each stretch a walker is out of sight ───────────────────
  const hidden: Record<number, number[]> = {};
  let total = 0;
  let out = 0;
  links.forEach(([a, b], i) => {
    const [pa, pb] = [verts[a], verts[b]];
    // A step up or down a terrace wall: climbed out of sight.
    if (pa[0] === pb[0] && pa[1] === pb[1]) {
      hidden[i] = [0, 1];
      return;
    }
    const len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
    const n = Math.max(2, Math.round(len / SAMPLE));
    const runs: number[] = [];
    let start = -1;
    for (let k = 0; k < n; k++) {
      const f = (k + 0.5) / n;
      const h = hiddenAt(pa[0] + (pb[0] - pa[0]) * f, pa[1] + (pb[1] - pa[1]) * f, pa[2]);
      total++;
      if (h) out++;
      if (h && start < 0) start = k;
      if ((!h || k === n - 1) && start >= 0) {
        runs.push(+(start / n).toFixed(3), +((h ? n : k) / n).toFixed(3));
        start = -1;
      }
    }
    if (runs.length) hidden[i] = runs;
  });
  console.log(`hidden: ${((out / total) * 100).toFixed(0)}% of ${total} samples, ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // ── Out, as points on the drawing ───────────────────────────────────────
  const nodes: number[] = [];
  for (const p of verts) {
    const [x, y] = flat(p);
    nodes.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
  }
  fs.writeFileSync(
    OUT,
    `// AUTO-GENERATED by scripts/iso/walks.ts — do not edit.\n` +
      `/**\n * The streets the city map's walkers walk: points on the drawing (x, y in metres,\n` +
      ` * in pairs), the stretches between them (pairs of points), and for some stretches\n` +
      ` * where along them a walker is out of sight (from–to fractions, in pairs).\n */\n` +
      `export const ISO_WALKS: { height: number; nodes: number[]; links: number[]; hidden: Record<number, number[]> } = ${JSON.stringify({
        height: WALKER_HEIGHT,
        nodes,
        links: links.flat(),
        hidden,
      })};\n`,
  );
  console.log(`${OUT}: ${(fs.statSync(OUT).size / 1e3).toFixed(0)} kB, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
main();
