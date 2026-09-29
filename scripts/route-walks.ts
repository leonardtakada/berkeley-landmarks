// Walking routes for the tours, drawn along the ways a walker actually takes.
//
// Builds a walking network from OpenStreetMap (streets, footpaths, steps and
// campus walks; © OpenStreetMap contributors, ODbL), stands each stop on the
// street it faces (its address's street where one is near, so the route
// passes the front of the building instead of turning up its drive), and
// routes stop to stop, in the tour's order, by the shortest way.
//
//   npx tsx scripts/route-walks.ts          rewrites each tour's routeCoordinates,
//                                           distance and duration in data/tours.ts
//   npx tsx scripts/route-walks.ts --plan   prints, per walk, its length and how
//                                           much of it doubles back, beside the
//                                           shortest order for the same stops
//
// The network is fetched from the Overpass API once and kept in
// scripts/.cache (delete it to refresh).
import fs from "node:fs";

import { landmarks } from "../data/landmarks";
import { tours, type Tour } from "../data/tours";

const CACHE = "scripts/.cache/osm-walkways.json";
const DEBUG_OUT = "scripts/.cache/routes.json";
const BBOX = [37.845, -122.325, 37.895, -122.225];
const K = Math.cos((37.87 * Math.PI) / 180);
const M_PER_DEG = 111_320;
/** Walking pace for the time on the page, and a few minutes at each stop. */
const MPH = 2.6;
const MIN_PER_STOP = 6;

type LL = { lat: number; lon: number };
type Way = { id: number; tags: Record<string, string>; nodes: number[]; geometry: LL[] };

// How much a walker would rather not take each kind of way: a quiet street or
// a path is 1; a busy road, a service lane or a flight of steps costs more.
const COST: Record<string, number> = {
  residential: 1,
  living_street: 1,
  unclassified: 1,
  tertiary: 1,
  tertiary_link: 1,
  pedestrian: 0.95,
  footway: 0.95,
  path: 0.95,
  secondary: 1.08,
  secondary_link: 1.08,
  primary: 1.15,
  primary_link: 1.15,
  trunk: 1.3,
  steps: 1.15,
  track: 1.2,
  cycleway: 1.1,
  service: 1.4,
};

function fetchNetwork(): { elements: Way[] } {
  if (!fs.existsSync(CACHE)) {
    throw new Error(
      `No walking network at ${CACHE}. Fetch it first:\n  curl -s --data-urlencode 'data=[out:json][timeout:240];` +
        `(way["highway"~"^(${Object.keys(COST).join("|")})$"](${BBOX.join(",")}););out body geom;' ` +
        `https://overpass-api.de/api/interpreter -o ${CACHE}`,
    );
  }
  return JSON.parse(fs.readFileSync(CACHE, "utf8"));
}

function metres(a: LL, b: LL) {
  return Math.hypot((a.lon - b.lon) * K, a.lat - b.lat) * M_PER_DEG;
}

/** Whether a walker may use the way, and at what cost per metre. */
function wayCost(t: Record<string, string>): number | null {
  const base = COST[t.highway];
  if (base === undefined) return null;
  const footOk = ["yes", "designated", "permissive"].includes(t.foot);
  if (t.foot === "no" || t.indoor === "yes") return null;
  if (["private", "no"].includes(t.access) && !footOk) return null;
  if (["driveway", "parking_aisle", "drive-through"].includes(t.service)) return null;
  // Sidewalks and crossings are drawn beside the street itself: keep them
  // for joining paths to streets, but walk the street.
  if (t.footway === "sidewalk" || t.footway === "crossing") return 1.6;
  return base;
}

// ---------------------------------------------------------------------------
// The network
// ---------------------------------------------------------------------------

type Edge = { to: number; len: number; cost: number };

class Network {
  pos = new Map<number, LL>();
  adj = new Map<number, Edge[]>();
  segs: { a: number; b: number; cost: number; name: string; kind: string }[] = [];
  private grid = new Map<string, number[]>();
  private nextVirtual = -1;

  constructor(ways: Way[]) {
    for (const w of ways) {
      const cost = wayCost(w.tags ?? {});
      if (cost === null || !w.geometry) continue;
      w.nodes.forEach((n, i) => this.pos.set(n, w.geometry[i]));
      for (let i = 1; i < w.nodes.length; i++) {
        const [a, b] = [w.nodes[i - 1], w.nodes[i]];
        this.link(a, b, cost);
        const s = this.segs.push({ a, b, cost, name: w.tags.name ?? "", kind: w.tags.footway ?? w.tags.highway }) - 1;
        for (const cell of this.cellsOf(a, b)) {
          const list = this.grid.get(cell);
          if (list) list.push(s);
          else this.grid.set(cell, [s]);
        }
      }
    }
  }

  private link(a: number, b: number, cost: number) {
    const len = metres(this.pos.get(a)!, this.pos.get(b)!);
    for (const [x, y] of [
      [a, b],
      [b, a],
    ]) {
      const list = this.adj.get(x);
      const e = { to: y, len, cost: len * cost };
      if (list) list.push(e);
      else this.adj.set(x, [e]);
    }
  }

  private cell(p: LL) {
    return `${Math.floor(p.lat / 0.0005)},${Math.floor(p.lon / 0.0005)}`;
  }

  private cellsOf(a: number, b: number) {
    const [pa, pb] = [this.pos.get(a)!, this.pos.get(b)!];
    const cells = new Set<string>();
    const n = Math.ceil(metres(pa, pb) / 20) + 1;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      cells.add(this.cell({ lat: pa.lat + (pb.lat - pa.lat) * t, lon: pa.lon + (pb.lon - pa.lon) * t }));
    }
    return cells;
  }

  /**
   * Stands a stop on the network: the nearest point of a way within reach,
   * preferring the street of its address (its front), and streets and paths
   * over sidewalks and service lanes. Returns a new node at that point.
   */
  standAt(p: LL, street: string | null, reach = 140): { node: number; on: string; off: number } {
    const [ci, cj] = this.cell(p).split(",").map(Number);
    const r = Math.ceil(reach / 50);
    let best: { s: number; t: number; d: number; score: number } | null = null;
    for (let i = ci - r; i <= ci + r; i++) {
      for (let j = cj - r; j <= cj + r; j++) {
        for (const s of this.grid.get(`${i},${j}`) ?? []) {
          const seg = this.segs[s];
          const [a, b] = [this.pos.get(seg.a)!, this.pos.get(seg.b)!];
          const ax = a.lon * K, ay = a.lat, bx = b.lon * K, by = b.lat, px = p.lon * K, py = p.lat;
          const dx = bx - ax, dy = by - ay;
          const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
          const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * M_PER_DEG;
          if (d > reach) continue;
          let score = d * seg.cost;
          if (street && normStreet(seg.name) === street) score *= 0.35;
          if (seg.kind === "sidewalk" || seg.kind === "crossing") score *= 1.5;
          if (!best || score < best.score) best = { s, t, d, score };
        }
      }
    }
    if (!best) throw new Error(`Nothing walkable within ${reach} m of ${p.lat},${p.lon}`);
    const seg = this.segs[best.s];
    const [a, b] = [this.pos.get(seg.a)!, this.pos.get(seg.b)!];
    const v = this.nextVirtual--;
    this.pos.set(v, { lat: a.lat + (b.lat - a.lat) * best.t, lon: a.lon + (b.lon - a.lon) * best.t });
    this.link(v, seg.a, seg.cost);
    this.link(v, seg.b, seg.cost);
    return { node: v, on: seg.name || seg.kind, off: best.d };
  }

  /** Cheapest ways from one node to every other: cost, and the node each was reached from. */
  dijkstra(from: number) {
    const cost = new Map<number, number>([[from, 0]]);
    const prev = new Map<number, number>();
    const heap = new MinHeap();
    heap.push(0, from);
    for (let top = heap.pop(); top; top = heap.pop()) {
      const [c, n] = top;
      if (c > (cost.get(n) ?? Infinity)) continue;
      for (const e of this.adj.get(n) ?? []) {
        const nc = c + e.cost;
        if (nc < (cost.get(e.to) ?? Infinity)) {
          cost.set(e.to, nc);
          prev.set(e.to, n);
          heap.push(nc, e.to);
        }
      }
    }
    return { cost, prev };
  }
}

class MinHeap {
  private a: [number, number][] = [];
  push(k: number, v: number) {
    const a = this.a;
    a.push([k, v]);
    for (let i = a.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): [number, number] | undefined {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

// ---------------------------------------------------------------------------
// Stops
// ---------------------------------------------------------------------------

const ORDINAL: Record<string, string> = { first: "1st", second: "2nd", third: "3rd", fourth: "4th", fifth: "5th", sixth: "6th", seventh: "7th", eighth: "8th", ninth: "9th", tenth: "10th" };
const SUFFIX: Record<string, string> = { ave: "avenue", av: "avenue", st: "street", rd: "road", dr: "drive", pl: "place", ct: "court", ln: "lane", blvd: "boulevard", ter: "terrace" };

function normStreet(s: string): string {
  const w = s
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\bm ?l ?k(ing)?( jr)?\b/, "martin luther king junior")
    .replace(/martin luther king jr\b/, "martin luther king junior")
    .replace(/\ble ?roy\b/, "leroy")
    .split(/\s+/)
    .map((x) => ORDINAL[x] ?? x);
  const last = w.length - 1;
  if (SUFFIX[w[last]]) w[last] = SUFFIX[w[last]];
  return w.join(" ");
}

/** The street a landmark's address is on ("2619 Dwight Way" → "dwight way"), if it has one. */
function addressStreet(address: string): string | null {
  const m = address.split(/ at |,/)[0].match(/^\d+(?:\s*[-–]\s*\d+)?\s+(?:block of\s+)?(.+)$/);
  return m ? normStreet(m[1]) : null;
}

type Stop = { id: string; name: string; at: LL; street: string | null; reach?: number };

/**
 * The street a building faces, for those whose address doesn't name one
 * (campus buildings): without it they'd be reached by the nearest campus
 * path, round the back.
 */
const FACES: Record<string, string> = {
  "lm-92": "Bancroft Way", // Hearst Gymnasium
  "lm-130": "Piedmont Avenue", // Memorial Stadium
};

function stopsOf(tour: Tour): Stop[] {
  return [...tour.stops]
    .sort((a, b) => a.order - b.order)
    .map((s) => {
      const l = landmarks.find((x) => x.id === s.landmarkId);
      if (!l) throw new Error(`${tour.id}: no landmark ${s.landmarkId}`);
      const street = FACES[l.id] ? normStreet(FACES[l.id]) : addressStreet(l.address);
      // (A big building can be further from the street it faces than the reach allows.)
      return { id: l.id, name: l.name, at: { lat: l.latitude, lon: l.longitude }, street, reach: FACES[l.id] ? 260 : undefined };
    });
}

// ---------------------------------------------------------------------------
// Orders and routes
// ---------------------------------------------------------------------------

/** The cheapest order to walk n stops, visiting each once; `start` and `end` fix the first and last. */
function shortestOrder(cost: number[][], start?: number, end?: number): number[] {
  const n = cost.length;
  const full = (1 << n) - 1;
  const dp = Array.from({ length: 1 << n }, () => new Float64Array(n).fill(Infinity));
  const from = Array.from({ length: 1 << n }, () => new Int8Array(n).fill(-1));
  for (let j = 0; j < n; j++) if (start === undefined || j === start) dp[1 << j][j] = 0;
  for (let mask = 1; mask <= full; mask++) {
    for (let j = 0; j < n; j++) {
      const c = dp[mask][j];
      if (c === Infinity) continue;
      for (let k = 0; k < n; k++) {
        if (mask & (1 << k)) continue;
        const m2 = mask | (1 << k);
        if (c + cost[j][k] < dp[m2][k]) {
          dp[m2][k] = c + cost[j][k];
          from[m2][k] = j;
        }
      }
    }
  }
  let last = end ?? 0;
  if (end === undefined) for (let j = 1; j < n; j++) if (dp[full][j] < dp[full][last]) last = j;
  const order: number[] = [];
  for (let mask = full, j = last; j !== -1; ) {
    order.push(j);
    const p = from[mask][j];
    mask &= ~(1 << j);
    j = p;
  }
  return order.reverse();
}

type Leg = { nodes: number[] };

function walk(net: Network, stops: Stop[]) {
  const stood = stops.map((s) => ({ ...s, ...net.standAt(s.at, s.street, s.reach) }));
  const trees = stood.map((s) => net.dijkstra(s.node));
  const cost = stood.map((_, i) => stood.map((t) => trees[i].cost.get(t.node) ?? Infinity));
  for (let i = 0; i < stood.length; i++)
    for (let j = 0; j < stood.length; j++)
      if (cost[i][j] === Infinity) throw new Error(`${stood[i].name} can't reach ${stood[j].name}`);

  const legs: Leg[] = [];
  for (let i = 1; i < stood.length; i++) {
    const { prev } = trees[i - 1];
    const nodes = [stood[i].node];
    while (nodes[nodes.length - 1] !== stood[i - 1].node) nodes.push(prev.get(nodes[nodes.length - 1])!);
    legs.push({ nodes: nodes.reverse() });
  }
  // Length walked, and how much of it goes over ground already walked.
  let length = 0;
  let doubled = 0;
  const seen = new Set<string>();
  for (const leg of legs) {
    for (let i = 1; i < leg.nodes.length; i++) {
      const [a, b] = [leg.nodes[i - 1], leg.nodes[i]];
      const d = metres(net.pos.get(a)!, net.pos.get(b)!);
      length += d;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (seen.has(key)) doubled += d;
      seen.add(key);
    }
  }
  return { stood, cost, legs, length, doubled };
}

/** Douglas–Peucker, keeping the points marked `keep` (the stops). */
function simplify(pts: LL[], keep: Set<number>, tol = 1.5): LL[] {
  const out = new Set<number>([0, pts.length - 1, ...keep]);
  const segDist = (p: LL, a: LL, b: LL) => {
    const ax = a.lon * K, ay = a.lat, bx = b.lon * K, by = b.lat, px = p.lon * K, py = p.lat;
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * M_PER_DEG;
  };
  const anchors = [...out].sort((a, b) => a - b);
  const rec = (i: number, j: number) => {
    let far = -1;
    let max = tol;
    for (let k = i + 1; k < j; k++) {
      const d = segDist(pts[k], pts[i], pts[j]);
      if (d > max) {
        max = d;
        far = k;
      }
    }
    if (far < 0) return;
    out.add(far);
    rec(i, far);
    rec(far, j);
  };
  for (let a = 1; a < anchors.length; a++) rec(anchors[a - 1], anchors[a]);
  return [...out].sort((a, b) => a - b).map((i) => pts[i]);
}

function routeLine(net: Network, legs: Leg[]): LL[] {
  const pts: LL[] = [];
  const keep = new Set<number>();
  for (const leg of legs) {
    for (const [k, n] of leg.nodes.entries()) {
      if (k === 0 && pts.length) continue;
      if (n < 0) keep.add(pts.length);
      pts.push(net.pos.get(n)!);
    }
  }
  return simplify(pts, keep);
}

const miles = (m: number) => m / 1609.344;

/** "1 hr", "1.5 hrs", "2 hrs". */
const hoursText = (h: number) => `${h} hr${h === 1 ? "" : "s"}`;

function hours(m: number, stops: number) {
  const h = miles(m) / MPH + (stops * MIN_PER_STOP) / 60;
  return Math.max(1, Math.round(h * 2) / 2);
}

// ---------------------------------------------------------------------------

function writeTours(results: Map<string, { line: LL[]; length: number; stops: number }>) {
  const path = "data/tours.ts";
  let src = fs.readFileSync(path, "utf8");
  for (const [id, r] of results) {
    const at = src.indexOf(`id: '${id}'`);
    const open = src.indexOf("routeCoordinates: [", at);
    const close = src.indexOf("\n    ],", open);
    if (at < 0 || open < 0 || close < 0) throw new Error(`can't find ${id} in ${path}`);
    const coords = r.line
      .map((p) => `      { latitude: ${p.lat.toFixed(6)}, longitude: ${p.lon.toFixed(6)} }`)
      .join(",\n");
    src = src.slice(0, open) + `routeCoordinates: [\n${coords}` + src.slice(close);
    const block = (from: number) => src.slice(from, src.indexOf("\n  }", from));
    const head = block(at);
    const next = head
      .replace(/distance: '[^']*'/, `distance: '${miles(r.length).toFixed(1)} mi'`)
      .replace(/duration: '[^']*'/, `duration: '${hoursText(hours(r.length, r.stops))}'`);
    src = src.slice(0, at) + next + src.slice(at + head.length);
  }
  fs.writeFileSync(path, src);
}

function main() {
  const plan = process.argv.includes("--plan");
  const only = process.argv.find((a) => a.startsWith("--tour="))?.slice(7);
  const net = new Network(fetchNetwork().elements);
  const results = new Map<string, { line: LL[]; length: number; stops: number }>();
  const debug: Record<string, unknown> = {};

  for (const tour of tours) {
    if (only && tour.id !== only) continue;
    const stops = stopsOf(tour);
    const w = walk(net, stops);
    const line = routeLine(net, w.legs);
    results.set(tour.id, { line, length: w.length, stops: stops.length });
    debug[tour.id] = {
      name: tour.name,
      line: line.map((p) => [p.lat, p.lon]),
      stops: w.stood.map((s) => ({ id: s.id, name: s.name, at: [s.at.lat, s.at.lon], stood: net.pos.get(s.node), on: s.on, off: Math.round(s.off) })),
    };
    const pct = Math.round((100 * w.doubled) / w.length);
    console.log(
      `${tour.id.padEnd(24)} ${miles(w.length).toFixed(2)} mi, ${pct}% doubled back, ${hoursText(hours(w.length, stops.length))}, ${line.length} points`,
    );
    for (const s of w.stood) if (s.off > 45) console.log(`    ! ${s.name} stands ${Math.round(s.off)} m off, on ${s.on}`);
    if (plan) {
      for (const [label, order] of [
        ["shortest", shortestOrder(w.cost)],
        ["from the same start", shortestOrder(w.cost, 0)],
        ["between the same ends", shortestOrder(w.cost, 0, stops.length - 1)],
      ] as const) {
        const alt = walk(net, order.map((i) => stops[i]));
        console.log(
          `    ${label}: ${miles(alt.length).toFixed(2)} mi, ${Math.round((100 * alt.doubled) / alt.length)}% doubled\n      ` +
            order.map((i) => `${stops[i].name} (${stops[i].id})`).join(" → "),
        );
      }
    }
  }
  fs.writeFileSync(DEBUG_OUT, JSON.stringify(debug));
  if (!plan) {
    writeTours(results);
    console.log("data/tours.ts updated. Now re-run scripts/bake-walk-streets.ts.");
  }
}

main();
