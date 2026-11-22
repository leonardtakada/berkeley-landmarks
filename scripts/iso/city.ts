/**
 * The city map, isometric: the whole scene (scripts/iso/scene.ts) as vector
 * tiles for MapLibre, laid out on the iso plane as though it were the globe
 * (lib/iso.ts, planeToLngLat) — so the engine pans, zooms and draws it.
 *
 * Layers, each shown from the zoom where it can be seen:
 *   ground   the Bay and the terraces of land              (z11+)
 *   waves    the Bay's ruled waves, and the lakes'          (z14+)
 *   creeks   the creeks, where they run in the open         (z13+)
 *   lawns    where the app's wind blows (not drawn)         (z16)
 *   major    main streets; minor, the rest                 (z11+ / z13+)
 *   lm       the catalogue's landmarks alone, for far out   (z11–13)
 *   solids   every building and tree, back to front        (z14+)
 *   sway     the crowns that sway, nothing in front of them  (z15+)
 *   names    street names, along the streets               (z15+)
 *   names-seen  the same, where the street is in sight      (close in)
 *   places   the districts                                 (z11–15)
 * Each piece carries its colour (c) and its place in the drawing order (s),
 * which the style uses as the fill sort key.
 *
 *   npx tsx scripts/iso/city.ts  → assets/map/iso.pmtiles, lib/iso-terrain.generated.ts
 */
import crypto from "node:crypto";
import fs from "node:fs";
import zlib from "node:zlib";
import geojsonVtMod from "geojson-vt";
import vtPbfMod from "vt-pbf";

import { landmarks } from "../../data/landmarks";
import { iso, planeToLngLat, toLocal } from "../../lib/iso";
import { centroid, clipLine, densify, type Pt } from "./geom";
import { lawnColor, PALETTE, shadowColor, SOFT_TREES, topColor } from "./paint";
import { tileId, writePmtiles } from "./pmtiles";
import { buildScene, levelAt, LEVEL, terrain, type P3, type Piece } from "./scene";
import { CITY_BOX } from "./city-proof";
import { swayingCrowns } from "./sway";
import { occlusion } from "./walks";
import { landmarkMarks, overlap, screenAt, type Box } from "./clusters";

/** How far a crown may lean in the wind, metres (components/iso-tree-sway.tsx keeps within it). */
const SWAY_REACH = 0.8;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const geojsonVt = ((geojsonVtMod as any).default ?? geojsonVtMod) as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const vtPbf = ((vtPbfMod as any).fromGeojsonVt ?? (vtPbfMod as any).default ?? vtPbfMod) as any;

const OUT = "assets/map/iso.pmtiles";
const MODULE = "lib/iso-terrain.generated.ts";
const Z_MIN = 11;
const Z_MAX = 16;
/** How far from the middle of its landmarks a district's name may go to be clear of their pins, metres. */
const DISTRICT_REACH = 900;
/** How finely a street is checked for being in sight, metres; how long a gap (a tree) may be and the stretch still count as one; how short a stretch in sight is too short to name. */
const [SIGHT_STEP, SIGHT_GAP, SIGHT_RUN] = [3, 7, 25];
/** Buildings are drawn this many times their height, so the houses read. */
const HEIGHT_SCALE = 1.4;
/** The grid the app lifts its pins and routes onto the terraces with, metres. */
const GRID = 20;

const LAYERS: Record<string, { min: number; max: number; tolerance: number; buffer?: number }> = {
  ground: { min: 11, max: 16, tolerance: 1.5 },
  /** The ground again with the buildings' shadows laid on it, for z14 and in (where the buildings are). */
  shaded: { min: 14, max: 16, tolerance: 1.5 },
  waves: { min: 14, max: 16, tolerance: 1 },
  creeks: { min: 13, max: 16, tolerance: 1 },
  /** Not drawn: where the app's wind blows over the grass, close in — each lawn's own part in sight, cut at the tiles' edges with no margin, so no two pieces overlap. */
  lawns: { min: 16, max: 16, tolerance: 1, buffer: 0 },
  major: { min: 11, max: 16, tolerance: 1.5 },
  minor: { min: 13, max: 16, tolerance: 1.5 },
  lm: { min: 11, max: 13, tolerance: 1 },
  solids: { min: 14, max: 16, tolerance: 0.4 },
  /** The crowns that sway with the wind (scripts/iso/sway.ts), in groups (w): drawn over everything standing. */
  sway: { min: 14, max: 16, tolerance: 0.4 },
  names: { min: 14, max: 16, tolerance: 2 },
  /** The same, only where the street is in sight (nothing nearer stands over it): close in, where a name laid along a street behind a building would lie across its roof. */
  "names-seen": { min: 16, max: 16, tolerance: 1 },
  places: { min: 11, max: 16, tolerance: 1 },
};

type Feature = { type: "Feature"; properties: Record<string, string | number>; geometry: { type: string; coordinates: unknown } };

const ll = ([u, v, z]: P3) => {
  const p = iso(u, v, z);
  return planeToLngLat(p.x, p.y);
};
const ring = (r: P3[]) => {
  const out = r.map(ll);
  out.push(out[0]);
  return out;
};

async function main() {
  const t0 = Date.now();
  const box = CITY_BOX;
  const { pieces, zAt, solids } = await buildScene({ box, heightScale: HEIGHT_SCALE, plate: { depth: 30 } });
  console.log(`scene: ${pieces.length} pieces, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  // The crowns with nothing in front of them, as far as they lean: to sway with the wind.
  const sway = swayingCrowns(pieces, solids, SWAY_REACH);
  console.log(`swaying: ${sway.size} crowns' pieces, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  /** A tree's crown into the sway layer if it may sway, else among everything standing. */
  const standing = (p: Piece, properties: Record<string, string | number>, geometry: Feature["geometry"]) => {
    const w = sway.get(p);
    if (w === undefined) layers.solids.push({ type: "Feature", properties: { ...properties, t: 1 }, geometry });
    else layers.sway.push({ type: "Feature", properties: { ...properties, w }, geometry });
  };

  const layers: Record<string, Feature[]> = Object.fromEntries(Object.keys(LAYERS).map((k) => [k, []]));
  const GROUND = new Set(["water", "shore", "top", "wall", "cutSouth", "cutWest", "lawn", "court", "chalk", "lake"]);
  // On the city map the trees are a softer blue, so the landmarks' pins stand out from them —
  // and the green's trees a softer green, as light.
  const [TREE, TREE_LIT, GREEN, GREEN_LIT] = [SOFT_TREES.crown, SOFT_TREES.crownLit, SOFT_TREES.green, SOFT_TREES.greenLit];
  /** A landmark's small parts (windows, cornices, open bays): left out far off, where they'd be a pixel. */
  const DETAIL = /^lm(Window|Open|Trim)/;
  let shadowRun = 0;
  pieces.forEach((p: Piece, s) => {
    const level = p.kind === "poly" ? p.level : undefined;
    const color =
      p.role === "top"
        ? topColor(level)
        : p.role === "shadow"
          ? shadowColor(level)
          : p.role === "lawn"
            ? lawnColor(level)
            : p.role === "trunk" || p.role === "crown"
              ? TREE
              : p.role === "crownLit"
                ? TREE_LIT
                : p.role === "greenTrunk" || p.role === "green"
                  ? GREEN
                  : p.role === "greenLit"
                    ? GREEN_LIT
                    : PALETTE[p.role];
    if (p.kind === "poly") {
      const geometry = { type: "Polygon", coordinates: p.rings.map(ring) };
      if (p.role === "shadow") {
        // One terrace's shadows share a colour and a place in the order (the first one's), so
        // the tiles keep one value for them all; they're one ink, so their order among themselves is moot.
        if (pieces[s - 1]?.role !== "shadow") shadowRun = s;
        layers.shaded.push({ type: "Feature", properties: { c: color, s: shadowRun }, geometry });
        return;
      }
      if (p.role === "grassMask") {
        layers.lawns.push({ type: "Feature", properties: { k: level ?? 0 }, geometry });
        return;
      }
      if (GROUND.has(p.role)) {
        layers.ground.push({ type: "Feature", properties: { c: color, s }, geometry });
        layers.shaded.push({ type: "Feature", properties: { c: color, s }, geometry });
        return;
      }
      const lm = p.role.startsWith("lm");
      layers.solids.push({ type: "Feature", properties: { c: color, s, t: lm ? 2 : 0 }, geometry });
      if (lm && !DETAIL.test(p.role)) layers.lm.push({ type: "Feature", properties: { c: color, s }, geometry });
    } else if (p.kind === "line") {
      if (p.role === "wave") {
        layers.waves.push({ type: "Feature", properties: { c: color }, geometry: { type: "LineString", coordinates: p.pts.map(ll) } });
      } else if (p.role === "creek") {
        layers.creeks.push({ type: "Feature", properties: { w: p.width }, geometry: { type: "LineString", coordinates: p.pts.map(ll) } });
      } else if (p.role === "street") {
        layers[p.width >= 12 ? "major" : "minor"].push({
          type: "Feature",
          properties: { w: p.width },
          geometry: { type: "LineString", coordinates: p.pts.map(ll) },
        });
      } else if (p.role === "trunk" || p.role === "greenTrunk") {
        // A trunk: a thin upright strip.
        const [a, b] = p.pts;
        const w = 0.7;
        layers.solids.push({
          type: "Feature",
          properties: { c: color, s, t: 1 },
          geometry: {
            type: "Polygon",
            coordinates: [ring([[a[0] - w, a[1] + w, a[2]], [a[0] + w, a[1] - w, a[2]], [b[0] + w, b[1] - w, b[2]], [b[0] - w, b[1] + w, b[2]]])],
          },
        });
      }
    } else if (p.kind === "flat") {
      // A pine's tier, a eucalyptus or a cypress: a shape standing square to the viewer.
      const c = iso(p.at[0], p.at[1], p.at[2]);
      const polys = p.parts.map((part) => {
        const pts = part.map(([dx, dy]) => planeToLngLat(c.x + dx, c.y + dy));
        pts.push(pts[0]);
        return [pts];
      });
      const geometry = polys.length === 1 ? { type: "Polygon", coordinates: polys[0] } : { type: "MultiPolygon", coordinates: polys };
      standing(p, { c: color, s }, geometry);
    } else {
      // A crown: a disc standing square to the viewer (its highlight, smaller, with fewer sides).
      const c = iso(p.at[0], p.at[1], p.at[2]);
      const n = p.role === "crownLit" || p.role === "greenLit" ? 10 : 16;
      const pts = Array.from({ length: n + 1 }, (_, i) => {
        const a = ((i % n) / n) * Math.PI * 2;
        return planeToLngLat(c.x + Math.cos(a) * p.r, c.y + Math.sin(a) * p.r);
      });
      standing(p, { c: color, s }, { type: "Polygon", coordinates: [pts] });
    }
  });

  // What stands in front of each point of the streets (as the walkers are hidden by: scripts/iso/walks.ts).
  const sight = await occlusion(box);
  /** The stretches of a line (points SIGHT_STEP apart) where the street is in sight; a gap shorter than SIGHT_GAP (a tree's crown) doesn't break one. */
  const inSight = (pts: Pt[]): Pt[][] => {
    const hidden = pts.map(([u, v]) => {
      const z = Math.max(0, zAt(u, v));
      const [lo, hi] = sight.columnAt(u, v, z, 0.3, 3, sight.nearOf(u, v, z, 1));
      return lo < hi;
    });
    // (Short gaps bridged.)
    for (let i = 0; i < hidden.length; ) {
      if (!hidden[i]) {
        i++;
        continue;
      }
      let j = i;
      while (j < hidden.length && hidden[j]) j++;
      if (i > 0 && j < hidden.length && (j - i) * SIGHT_STEP < SIGHT_GAP) for (let k = i; k < j; k++) hidden[k] = false;
      i = j;
    }
    const runs: Pt[][] = [];
    let cur: Pt[] = [];
    pts.forEach((p, i) => {
      if (!hidden[i]) cur.push(p);
      else if (cur.length) {
        runs.push(cur);
        cur = [];
      }
    });
    if (cur.length) runs.push(cur);
    return runs;
  };

  // Street names, along the streets (lifted onto their terraces).
  const osm: { tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] }[] = JSON.parse(
    fs.readFileSync("data/osm-streets.json", "utf8"),
  ).elements;
  const NAMED = new Set(["primary", "secondary", "tertiary", "residential", "unclassified", "living_street"]);
  for (const w of osm) {
    if (!w.tags?.name || !NAMED.has(w.tags.highway ?? "") || !w.geometry) continue;
    const line = w.geometry.map(({ lat, lon }) => {
      const q = toLocal(lat, lon);
      return [q.u, q.v] as Pt;
    });
    for (const run of clipLine(line, box)) {
      const pts = densify(run, 10).map(([u, v]) => ll([u, v, Math.max(0, zAt(u, v)) + 0.5]));
      const major = ["primary", "secondary", "tertiary"].includes(w.tags.highway ?? "") ? 1 : 0;
      layers.names.push({ type: "Feature", properties: { name: w.tags.name, major }, geometry: { type: "LineString", coordinates: pts } });
      // Close in, only the stretches in sight.
      for (const seen of inSight(densify(run, SIGHT_STEP))) {
        if (seen.length < 2 || (seen.length - 1) * SIGHT_STEP < SIGHT_RUN) continue;
        const coordinates = seen.map(([u, v]) => ll([u, v, Math.max(0, zAt(u, v)) + 0.5]));
        layers["names-seen"].push({ type: "Feature", properties: { name: w.tags.name, major }, geometry: { type: "LineString", coordinates } });
      }
    }
  }
  console.log(`names in sight: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // The districts, named where their landmarks gather — but not over their pins: the map clusters those (and its
  // names make way for the clusters), so each name goes where it's clear of them, as near the middle as it may.
  const marks = landmarkMarks();
  /** A district's name on the screen at zoom z (lib/iso-style.ts "places": bold capitals, tracked 0.3, 8 ems a line at most). */
  const nameBox = (name: string, at: number[], z: number): Box => {
    const size = 10 + (Math.min(15, Math.max(11, z)) - 11);
    const lines: string[] = [];
    for (const word of name.split(/\s+/)) {
      if (lines.length && (lines[lines.length - 1] + " " + word).length <= 9) lines[lines.length - 1] += " " + word;
      else lines.push(word);
    }
    const [w, h] = [Math.max(...lines.map((l) => l.length)) * 0.95 * size, lines.length * 1.2 * size];
    const [x, y] = screenAt(at, z);
    return [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
  };
  const named: { name: string; at: number[] }[] = [];
  const DISTRICT_ZOOMS = [12, 13, 13.6];
  const districts = new Map<string, Pt[]>();
  for (const l of landmarks) {
    const d = l.neighborhood?.trim();
    if (!d || /^(various|unknown)$/i.test(d)) continue;
    const q = toLocal(l.latitude, l.longitude);
    districts.set(d, [...(districts.get(d) ?? []), [q.u, q.v]]);
  }
  // (The districts with most landmarks first: their names have first choice.)
  for (const [name, pts] of [...districts].sort((a, b) => b[1].length - a[1].length)) {
    if (pts.length < 3) continue;
    const [cu, cv] = centroid(pts);
    if (cu < box.u0 || cu > box.u1 || cv < box.v0 || cv > box.v1) continue;
    const label = name.toUpperCase();
    let best = { at: ll([cu, cv, Math.max(0, zAt(cu, cv)) + 20]), cost: Infinity };
    for (let du = -DISTRICT_REACH; du <= DISTRICT_REACH; du += 40) {
      for (let dv = -DISTRICT_REACH; dv <= DISTRICT_REACH; dv += 40) {
        const off = Math.hypot(du, dv);
        if (off > DISTRICT_REACH) continue;
        const [u, v] = [cu + du, cv + dv];
        if (u < box.u0 || u > box.u1 || v < box.v0 || v > box.v1) continue;
        const at = ll([u, v, Math.max(0, zAt(u, v)) + 20]);
        let cost = off * 0.5;
        for (const z of DISTRICT_ZOOMS) {
          const b = nameBox(label, at, z);
          for (const m of marks(z)) {
            const o = overlap(b, m.box);
            // (Under a bubble's middle it goes unseen; under a pin, the pin lies over its letters.)
            if (o > 0) cost += m.cluster ? 400 + o * 4 : 150 + o * 3;
          }
          for (const o of named) if (overlap(b, nameBox(o.name, o.at, z)) > 0) cost += 2000;
        }
        if (cost < best.cost) best = { at, cost };
      }
    }
    named.push({ name: label, at: best.at });
    layers.places.push({
      type: "Feature",
      properties: { name: label, n: pts.length },
      geometry: { type: "Point", coordinates: best.at },
    });
  }
  for (const [k, fs2] of Object.entries(layers)) console.log(`  ${k}: ${fs2.length}`);

  // Tiles.
  const indexes = Object.fromEntries(
    Object.entries(layers).map(([k, features]) => [
      k,
      new geojsonVt({ type: "FeatureCollection", features }, { maxZoom: Z_MAX, indexMaxZoom: 5, buffer: LAYERS[k].buffer ?? 64, extent: 4096, tolerance: LAYERS[k].tolerance }),
    ]),
  );
  // The drawing's extent, as the engine sees it.
  let [w0, s0, e0, n0] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of layers.ground) {
    for (const r of f.geometry.coordinates as [number, number][][]) {
      for (const [x, y] of r) [w0, s0, e0, n0] = [Math.min(w0, x), Math.min(s0, y), Math.max(e0, x), Math.max(n0, y)];
    }
  }
  const tx = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z);
  const ty = (lat: number, z: number) => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
  };
  const tiles = new Map<number, Buffer>();
  for (let z = Z_MIN; z <= Z_MAX; z++) {
    for (let x = tx(w0, z); x <= tx(e0, z); x++) {
      for (let y = ty(n0, z); y <= ty(s0, z); y++) {
        const out: Record<string, unknown> = {};
        for (const [k, idx] of Object.entries(indexes)) {
          if (z < LAYERS[k].min || z > LAYERS[k].max) continue;
          // From z14 the ground comes with its shadows: the same layer, so they keep their place in its order.
          if (k === "ground" && z >= LAYERS.shaded.min) continue;
          const t = idx.getTile(z, x, y);
          if (t && t.features.length) out[k === "shaded" ? "ground" : k] = t;
        }
        if (!Object.keys(out).length) continue;
        tiles.set(tileId(z, x, y), zlib.gzipSync(vtPbf(out, { version: 2, extent: 4096 }), { level: 9 }));
      }
    }
    console.log(`  z${z}: ${tiles.size} tiles`);
  }
  const bytes = writePmtiles(OUT, tiles, {
    minZoom: Z_MIN,
    maxZoom: Z_MAX,
    bounds: [w0, s0, e0, n0],
    metadata: {
      name: "berkeley-iso",
      description: "Berkeley, isometric, for the guide's city map",
      attribution: "© OpenStreetMap contributors; elevation USGS 3DEP",
      vector_layers: Object.entries(LAYERS)
        .filter(([id]) => id !== "shaded")
        .map(([id, c]) => ({ id, minzoom: c.min, maxzoom: c.max, fields: {} })),
    },
  });
  console.log(`${OUT}: ${(bytes / 1e6).toFixed(1)} MB, ${tiles.size} tiles`);

  // The terraces as a grid of levels, for lifting pins, routes and the reader onto them.
  const t = await terrain();
  const cols = Math.ceil((box.u1 - box.u0) / GRID) + 1;
  const rows = Math.ceil((box.v1 - box.v0) / GRID) + 1;
  let levels = "";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) levels += String.fromCharCode(64 + levelAt(t, box.u0 + c * GRID, box.v0 + r * GRID));
  }
  fs.writeFileSync(
    MODULE,
    `// AUTO-GENERATED by scripts/iso/city.ts — do not edit.\n` +
      `/** The city map's terraces: the level at each ${GRID} m of the grid, as characters from "@" (-1, the Bay) up. */\n` +
      `export const ISO_TERRAIN = ${JSON.stringify({ u0: box.u0, v0: box.v0, cell: GRID, cols, rows, level: LEVEL, shore: -4, heightScale: HEIGHT_SCALE })};\n` +
      `export const ISO_LEVELS = ${JSON.stringify(levels)};\n` +
      `/** Changes whenever the tiles do, so the app copies the new ones. */\n` +
      `export const ISO_TILES_VERSION = ${JSON.stringify(crypto.createHash("sha1").update(fs.readFileSync(OUT)).digest("hex").slice(0, 10))};\n` +
      `/** The tiles' size in bytes, so a copy cut short is known for one. */\n` +
      `export const ISO_TILES_BYTES = ${fs.statSync(OUT).size};\n` +
      `/** The drawing's extent on the engine's globe: west, south, east, north. */\n` +
      `export const ISO_BOUNDS: [number, number, number, number] = ${JSON.stringify([w0, s0, e0, n0])};\n`,
  );
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
main();
