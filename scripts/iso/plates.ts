/**
 * The walks' fold-out maps, as isometric plates: for each walk, a block cut
 * from the city around its route — terraces, streets, trees and buildings
 * printed into assets/plates/<walk>.png — and, drawn live over it, the
 * route as a vermilion ribbon, the stops' buildings as models (enlarged,
 * as a pictorial map enlarges its sights, so they rise from the page), the
 * stops' numbered flags and the names of the streets the walk follows.
 *
 *   npx tsx scripts/iso/plates.ts [tourId…]   → components/walk-plates.generated.ts
 *
 * Needs the terrain cache (scripts/iso/terrain.ts fetches it).
 */
import fs from "node:fs";

import { landmarks, type Landmark } from "../../data/landmarks";
import { tours } from "../../data/tours";
import { WALK_STREETS } from "../../data/walk-streets.generated";
import { iso, toLocal } from "../../lib/iso";
import { stopIndices } from "../../lib/route-legs";
import { area, centroid, clipLine, densify, minRect, orient, simplify, type Box, type Pt, type Ring } from "./geom";
import { canvas, fit, paint, PALETTE, toPx, type Frame } from "./paint";
import { buildScene, buildingPieces, buildings, terrain, levelAt, levelZ, type Building, type P3, type Piece } from "./scene";

/** The plate's width in pixels: three times a phone's column. */
const WIDTH = 1080;
const OUT_DIR = "assets/plates";
const MODULE = "components/walk-plates.generated.ts";

const PITCHED =
  /shingle|craftsman|arts|queen anne|tudor|gothic|colonial|bungalow|brown|victorian|stick|chalet|cottage|swiss|church|chapel|english|norman|provincial|storybook/i;
const FLAT = /classical|beaux|modern|deco|moderne|commercial|renaissance|industrial|international|brutal/i;
/** Open to the sky: no roof to give them. */
const OPEN = /theat(re|er)|stadium|amphithea/i;
const TOWER = /\b(tower|campanile)\b/i;
/** Not buildings: places, walks, rocks — marked with a plaque on the ground. */
const SITE = /natural|landscape|prehistoric|open-air/i;
/** Heights the map can't know from its footprints. */
const HEIGHTS: Record<string, number> = { "Sather Tower (Campanile)": 94 };

type Model = {
  landmark: Landmark;
  order: number;
  pass: Pt;
  building: Building;
  radius: number;
};

/** A stop's building as a model: enlarged, cleaned to its outline, roofed after its style. */
function model(l: Landmark, found: Building | undefined, scale: number): Building {
  const { u, v } = toLocal(l.latitude, l.longitude);
  const ring: Ring = found?.ring ?? [
    [u - 9, v - 7],
    [u + 9, v - 7],
    [u + 9, v + 7],
    [u - 9, v + 7],
  ];
  const mr = minRect(ring);
  const boxy = mr.fill > 0.68;
  const base = orient(boxy ? mr.corners : simplify(ring, 1.5), true);
  const c = centroid(base);
  const scaled = base.map(([x, y]) => [c[0] + (x - c[0]) * scale, c[1] + (y - c[1]) * scale] as Pt);
  const trueH = HEIGHTS[l.name] ?? found?.height ?? 9;
  const tower = TOWER.test(l.name) && trueH > 25;
  if (SITE.test(l.style) && !tower) {
    // A plaque: an octagon of ink laid where the place is.
    const r = 11;
    const ring = Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      return [u + Math.cos(a) * r, v + Math.sin(a) * r] as Pt;
    });
    return { id: -1, ring, c: [u, v], height: 0, gable: null, site: true, landmark: l.id, base: found?.base ?? 0 };
  }
  const pitched = boxy && PITCHED.test(`${l.style} ${l.name}`) && !FLAT.test(l.style) && !tower;
  const hipped =
    boxy && !pitched && !tower && !OPEN.test(l.name) && !/modern|deco|moderne|industrial|commercial|international/i.test(l.style);
  // A tower stands at least a street's width across, to read as one.
  const towerScale = tower ? Math.max(scale, 20 / Math.max(1, mr.short)) : scale;
  const sr = minRect(tower ? base.map(([x, y]) => [c[0] + (x - c[0]) * towerScale, c[1] + (y - c[1]) * towerScale] as Pt) : scaled);
  const height = tower ? trueH * 1.1 : Math.max(8, trueH) * Math.min(scale, 2.2) * 0.8;
  return {
    id: -1,
    ring: tower ? orient(sr.corners, true) : scaled,
    c,
    height,
    gable: pitched || hipped ? { corners: orient(sr.corners, true), rise: Math.min(18, sr.short * 0.42) } : null,
    hip: hipped ? Math.min(12, sr.short * 0.28) : undefined,
    spire: tower ? trueH * 0.28 : undefined,
    windows: tower ? 6 : 3.4 * Math.max(1, scale),
    landmark: l.id,
    base: found?.base ?? 0,
  };
}

const move = (b: Building, to: Pt): Building => {
  const [du, dv] = [to[0] - b.c[0], to[1] - b.c[1]];
  const shift = (r: Ring) => r.map(([x, y]) => [x + du, y + dv] as Pt);
  return { ...b, ring: shift(b.ring), c: to, gable: b.gable && { ...b.gable, corners: shift(b.gable.corners) } };
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const pathOf = (rings: P3[][], f: Frame) =>
  rings.map((r) => "M" + r.map((p) => toPx(f, p).map(r1).join(" ")).join("L") + "Z").join("");

async function plate(tourId: string) {
  const tour = tours.find((t) => t.id === tourId)!;
  const t = await terrain();
  const all = await buildings();
  const stops = [...tour.stops]
    .sort((a, b) => a.order - b.order)
    .map((s) => ({ ...s, landmark: landmarks.find((l) => l.id === s.landmarkId)! }))
    .filter((s) => s.landmark);
  const route = tour.routeCoordinates;
  const passAt = stopIndices(route, stops.map((s) => s.landmark));
  const routeLocal: Pt[] = route.map((p) => {
    const q = toLocal(p.latitude, p.longitude);
    return [q.u, q.v];
  });

  // The block: the route and its stops, with a margin of city around them.
  const pts = [...routeLocal, ...stops.map((s) => toLocal(s.landmark.latitude, s.landmark.longitude)).map((q) => [q.u, q.v] as Pt)];
  const m = 150;
  let box: Box = {
    u0: Math.min(...pts.map((p) => p[0])) - m,
    v0: Math.min(...pts.map((p) => p[1])) - m,
    u1: Math.max(...pts.map((p) => p[0])) + m,
    v1: Math.max(...pts.map((p) => p[1])) + m,
  };
  // Not too narrow a strip: at least half as deep as it's wide, either way.
  const [du, dv] = [box.u1 - box.u0, box.v1 - box.v0];
  if (du < dv * 0.6) [box.u0, box.u1] = [box.u0 - (dv * 0.6 - du) / 2, box.u1 + (dv * 0.6 - du) / 2];
  if (dv < du * 0.6) [box.v0, box.v1] = [box.v0 - (du * 0.6 - dv) / 2, box.v1 + (du * 0.6 - dv) / 2];
  box = { u0: Math.round(box.u0), v0: Math.round(box.v0), u1: Math.round(box.u1), v1: Math.round(box.v1) };

  // The stops' models: as large as their neighbours allow, set back from the
  // route — and never smaller than can be seen, however long the walk.
  const pxPerM = WIDTH / ((box.u1 - box.u0 + box.v1 - box.v0) * Math.cos(Math.PI / 6));
  const models: Model[] = stops.map((s, i) => {
    const found = all.find((b) => b.landmark === s.landmark.id);
    const { u, v } = toLocal(s.landmark.latitude, s.landmark.longitude);
    const r0 = found ? Math.sqrt(area(found.ring)) / 2 : 9;
    let nearest = Infinity;
    for (const o of stops) {
      if (o === s) continue;
      const q = toLocal(o.landmark.latitude, o.landmark.longitude);
      nearest = Math.min(nearest, Math.hypot(q.u - u, q.v - v));
    }
    const seen = 15 / (r0 * pxPerM);
    const scale = Math.min(5, Math.max(0.55, seen, Math.min(2.4, 36 / r0, (nearest * 0.45) / r0)));
    const b = model(s.landmark, found, scale);
    return { landmark: s.landmark, order: s.order, pass: routeLocal[passAt[i]], building: b, radius: Math.sqrt(area(b.ring)) / 2 };
  });
  for (const md of models) {
    // Stood back from the route, on the side the building stands.
    const [cu, cv] = md.building.c;
    let w: Pt = [cu - md.pass[0], cv - md.pass[1]];
    let d = Math.hypot(w[0], w[1]);
    if (d < 1) [w, d] = [[Math.SQRT1_2, Math.SQRT1_2], 1];
    w = [w[0] / d, w[1] / d];
    const reach = Math.max(...md.building.ring.map(([x, y]) => -((x - cu) * w[0] + (y - cv) * w[1])));
    const need = reach + 9;
    if (d < need) md.building = move(md.building, [md.pass[0] + w[0] * need, md.pass[1] + w[1] * need]);
  }
  // Models that crowd each other stand apart.
  for (let pass = 0; pass < 60; pass++) {
    let moved = false;
    for (let i = 0; i < models.length; i++) {
      for (let j = i + 1; j < models.length; j++) {
        const [a, b] = [models[i], models[j]];
        const dx = b.building.c[0] - a.building.c[0];
        const dy = b.building.c[1] - a.building.c[1];
        const d = Math.hypot(dx, dy) || 0.01;
        const gap = (a.radius + b.radius) * 1.05 + 4;
        if (d >= gap) continue;
        const push = (gap - d) / 2;
        a.building = move(a.building, [a.building.c[0] - (dx / d) * push, a.building.c[1] - (dy / d) * push]);
        b.building = move(b.building, [b.building.c[0] + (dx / d) * push, b.building.c[1] + (dy / d) * push]);
        moved = true;
      }
    }
    if (!moved) break;
  }
  for (const md of models) md.building = { ...md.building, base: levelZ(Math.max(0, levelAt(t, md.building.c[0], md.building.c[1]))) };

  // Their pieces, and the ground they stand on cleared of whatever would stand in front of them.
  const modelPieces = models.map((md) => buildingPieces(md.building, 1, true));
  const screenBox = (ps: Piece[]) => {
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const p of ps) {
      if (p.kind !== "poly") continue;
      for (const r of p.rings) {
        for (const q of r) {
          const s = iso(q[0], q[1], q[2]);
          [x0, y0, x1, y1] = [Math.min(x0, s.x), Math.min(y0, s.y), Math.max(x1, s.x), Math.max(y1, s.y)];
        }
      }
    }
    return { x0, y0, x1, y1 };
  };
  const boxes = modelPieces.map(screenBox);
  const clear = (b: Building) =>
    models.some((md, i) => {
      if (Math.hypot(b.c[0] - md.building.c[0], b.c[1] - md.building.c[1]) < md.radius * 1.15 + 4) return true;
      if (b.c[0] + b.c[1] >= md.building.c[0] + md.building.c[1]) return false;
      const s = iso(b.c[0], b.c[1], b.base);
      const bb = boxes[i];
      return s.x > bb.x0 - 6 && s.x < bb.x1 + 6 && s.y > bb.y0 - 4 && s.y < bb.y1;
    });

  const { pieces, zAt } = await buildScene({
    box,
    heightScale: 1.25,
    omit: new Set(stops.map((s) => s.landmark.id)),
    clear,
    plate: { depth: 14 },
  });

  // The frame: everything, models and all, across the plate's width.
  const everything = [...pieces, ...modelPieces.flat()];
  const probe = fit(everything, WIDTH, WIDTH * 4, 8);
  let [ymin, ymax] = [Infinity, -Infinity];
  for (const p of everything) {
    const ps = p.kind === "poly" ? p.rings.flat() : p.kind === "line" ? p.pts : [p.at];
    for (const q of ps) {
      const y = toPx(probe, q)[1];
      [ymin, ymax] = [Math.min(ymin, y), Math.max(ymax, y)];
    }
  }
  const height = Math.ceil(ymax - ymin + 16 + 60);
  const f = fit(everything, WIDTH, height, 8);
  // Room above for the flags on the tallest models.
  f.y0 += 30 / f.scale;

  const { c, ctx } = canvas(WIDTH, height);
  paint(ctx, pieces, f);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(`${OUT_DIR}/${tourId}.png`, await c.encode("png"));

  // The route, lifted onto its terraces.
  const lift = ([u, v]: Pt): P3 => [u, v, Math.max(0, zAt(u, v)) + 1];
  const routePx = densify(routeLocal, 8).map((p) => toPx(f, lift(p)).map(r1));
  // Its depth along the way, for laying it among the models.
  const routeDepth = densify(routeLocal, 8).map(([u, v]) => r1(u + v));

  // The flags: a numbered disc on a short pole over each model, nudged apart where they crowd.
  const R = 24;
  const POLE = 34;
  const discs = models.map((md, i) => {
    const b = screenBox(modelPieces[i]);
    const x = (((b.x0 + b.x1) / 2 - f.x0) * f.scale);
    const top = (f.y0 - b.y1) * f.scale;
    return { x, y: top - POLE - R, ax: x, ay: top };
  });
  for (let pass = 0; pass < 120; pass++) {
    let crowded = false;
    for (let i = 0; i < discs.length; i++) {
      for (let j = i + 1; j < discs.length; j++) {
        const [a, b] = [discs[i], discs[j]];
        let [dx, dy] = [b.x - a.x, b.y - a.y];
        let d = Math.hypot(dx, dy);
        if (d >= R * 2 + 6) continue;
        crowded = true;
        if (d < 0.01) [dx, dy, d] = [1, 0, 1];
        const push = (R * 2 + 6 - d) / 2 + 0.1;
        a.x -= (dx / d) * push;
        a.y -= (dy / d) * push;
        b.x += (dx / d) * push;
        b.y += (dy / d) * push;
      }
    }
    for (const dd of discs) [dd.x, dd.y] = [Math.min(WIDTH - R - 4, Math.max(R + 4, dd.x)), Math.max(R + 4, Math.min(dd.y, dd.ay - R - 10))];
    if (!crowded) break;
  }

  const out = {
    width: WIDTH,
    height,
    route: routePx.flat(),
    routeDepth,
    stops: models.map((md, i) => {
      const b = screenBox(modelPieces[i]);
      const tl = [(b.x0 - f.x0) * f.scale, (f.y0 - b.y1) * f.scale];
      const br = [(b.x1 - f.x0) * f.scale, (f.y0 - b.y0) * f.scale];
      return {
        order: md.order,
        id: md.landmark.id,
        depth: r1(md.building.c[0] + md.building.c[1]),
        flag: [r1(discs[i].ax), r1(discs[i].ay), r1(discs[i].x), r1(discs[i].y)],
        top: r1(tl[1]),
        box: [r1(tl[0]), r1(tl[1]), r1(br[0]), r1(br[1])],
        faces: modelPieces[i]
          .filter((p): p is Extract<Piece, { kind: "poly" }> => p.kind === "poly")
          .map((p) => [PALETTE[p.role], pathOf(p.rings, f)]),
      };
    }),
    labels: streetLabels(tourId, routeLocal, box, f, zAt),
    north: (() => {
      const a = toPx(f, [0, 0, 0]);
      const b = toPx(f, [0, 100, 0]);
      return r1((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI);
    })(),
  };
  return out;
}

/** The names of the streets the walk follows, set flat on the ground along them. */
function streetLabels(tourId: string, route: Pt[], box: Box, f: Frame, zAt: (u: number, v: number) => number) {
  const names = (WALK_STREETS[tourId]?.r ?? []).slice(0, 4);
  const osm: { tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] }[] = JSON.parse(
    fs.readFileSync("data/osm-streets.json", "utf8"),
  ).elements;
  const out: { text: string; x: number; y: number; ax: number; ay: number; bx: number; by: number }[] = [];
  for (const name of names) {
    // The longest straight stretch of the street near the route.
    let best: { a: Pt; b: Pt; len: number } | null = null;
    for (const w of osm) {
      if (w.tags?.name !== name || !w.geometry) continue;
      const line = w.geometry.map(({ lat, lon }) => {
        const q = toLocal(lat, lon);
        return [q.u, q.v] as Pt;
      });
      for (const run of clipLine(line, { u0: box.u0 + 40, v0: box.v0 + 40, u1: box.u1 - 40, v1: box.v1 - 40 })) {
        for (let i = 1; i < run.length; i++) {
          const [a, b] = [run[i - 1], run[i]];
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          const near = route.some((p) => Math.hypot(p[0] - mid[0], p[1] - mid[1]) < 40);
          if (near && len > 70 && (!best || len > best.len)) best = { a, b, len };
        }
      }
    }
    if (!best) continue;
    // Read left to right.
    let [a, b] = [best.a, best.b];
    const [pa, pb] = [toPx(f, [a[0], a[1], 0]), toPx(f, [b[0], b[1], 0])];
    if (pb[0] < pa[0]) [a, b] = [b, a];
    const dir: Pt = [(b[0] - a[0]) / best.len, (b[1] - a[1]) / best.len];
    // Set beside the street, on its far side.
    let side: Pt = [-dir[1], dir[0]];
    if (side[0] + side[1] < 0) side = [-side[0], -side[1]];
    const mid: Pt = [(a[0] + b[0]) / 2 + side[0] * 11, (a[1] + b[1]) / 2 + side[1] * 11];
    const z = Math.max(0, zAt(mid[0], mid[1])) + 0.5;
    const p = toPx(f, [mid[0], mid[1], z]);
    const ax = toPx(f, [mid[0] + dir[0], mid[1] + dir[1], z]);
    const ay = toPx(f, [mid[0] + side[0], mid[1] + side[1], z]);
    out.push({
      text: name.toUpperCase(),
      x: r1(p[0]),
      y: r1(p[1]),
      // The ground's axes at the label, one metre each way, in pixels.
      ax: Math.round((ax[0] - p[0]) * 1000) / 1000,
      ay: Math.round((ax[1] - p[1]) * 1000) / 1000,
      bx: Math.round((ay[0] - p[0]) * 1000) / 1000,
      by: Math.round((ay[1] - p[1]) * 1000) / 1000,
    });
  }
  return out;
}

async function main() {
  const only = process.argv.slice(2);
  const ids = only.length ? only : tours.map((t) => t.id);
  const existing = fs.existsSync(MODULE) ? fs.readFileSync(MODULE, "utf8") : "";
  const data: Record<string, unknown> = {};
  // Keep the plates not rebuilt this time.
  const prior = existing.match(/^export const PLATE_DATA(?:: [^=]+)? = (.*);$/m);
  if (prior) Object.assign(data, JSON.parse(prior[1]));
  for (const id of ids) {
    const t0 = Date.now();
    data[id] = await plate(id);
    console.log(`${id}: ${((Date.now() - t0) / 1000).toFixed(1)}s, ${(fs.statSync(`${OUT_DIR}/${id}.png`).size / 1024).toFixed(0)} KB`);
  }
  const keys = Object.keys(data).sort();
  fs.writeFileSync(
    MODULE,
    `// AUTO-GENERATED by scripts/iso/plates.ts — do not edit.\n` +
      `/* eslint-disable @typescript-eslint/no-require-imports */\n` +
      `import type { ImageRequireSource } from "react-native";\n\n` +
      `import type { PlateData } from "@/components/iso-plate";\n\n` +
      `export const PLATE_DATA: Record<string, PlateData> = ${JSON.stringify(Object.fromEntries(keys.map((k) => [k, data[k]])))};\n\n` +
      `export const PLATES: Record<string, PlateData & { image: ImageRequireSource }> = {\n` +
      keys.map((k) => `  ${JSON.stringify(k)}: { ...PLATE_DATA[${JSON.stringify(k)}], image: require("../assets/plates/${k}.png") },`).join("\n") +
      `\n};\n`,
  );
}
main();
