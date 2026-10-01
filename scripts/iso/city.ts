/**
 * The city map, isometric: the whole scene (scripts/iso/scene.ts) as vector
 * tiles for MapLibre, laid out on the iso plane as though it were the globe
 * (lib/iso.ts, planeToLngLat) — so the engine pans, zooms and draws it.
 *
 * Layers, each shown from the zoom where it can be seen:
 *   ground   the Bay and the terraces of land              (z11+)
 *   waves    the Bay's ruled waves                         (z14+)
 *   major    main streets; minor, the rest                 (z11+ / z13+)
 *   lm       the registry's landmarks alone, for far out   (z11–13)
 *   solids   every building and tree, back to front        (z14+)
 *   names    street names, along the streets               (z15+)
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
import { PALETTE, topColor } from "./paint";
import { tileId, writePmtiles } from "./pmtiles";
import { buildScene, levelAt, LEVEL, terrain, type P3, type Piece } from "./scene";
import { CITY_BOX } from "./city-proof";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const geojsonVt = ((geojsonVtMod as any).default ?? geojsonVtMod) as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const vtPbf = ((vtPbfMod as any).fromGeojsonVt ?? (vtPbfMod as any).default ?? vtPbfMod) as any;

const OUT = "assets/map/iso.pmtiles";
const MODULE = "lib/iso-terrain.generated.ts";
const Z_MIN = 11;
const Z_MAX = 16;
/** Buildings are drawn this many times their height, so the houses read. */
const HEIGHT_SCALE = 1.4;
/** The grid the app lifts its pins and routes onto the terraces with, metres. */
const GRID = 20;

const LAYERS: Record<string, { min: number; max: number; tolerance: number }> = {
  ground: { min: 11, max: 16, tolerance: 1.5 },
  waves: { min: 14, max: 16, tolerance: 1 },
  major: { min: 11, max: 16, tolerance: 1.5 },
  minor: { min: 13, max: 16, tolerance: 1.5 },
  lm: { min: 11, max: 13, tolerance: 1 },
  solids: { min: 14, max: 16, tolerance: 0.4 },
  names: { min: 14, max: 16, tolerance: 2 },
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
  const { pieces, zAt } = await buildScene({ box, heightScale: HEIGHT_SCALE, plate: { depth: 30 } });
  console.log(`scene: ${pieces.length} pieces, ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const layers: Record<string, Feature[]> = Object.fromEntries(Object.keys(LAYERS).map((k) => [k, []]));
  const GROUND = new Set(["water", "shore", "top", "wall", "cutSouth", "cutWest"]);
  // On the city map the trees are a softer blue, so the landmarks' pins stand out from them.
  const TREE = "#6E84C2";
  pieces.forEach((p: Piece, s) => {
    const color =
      p.role === "top" && p.kind === "poly" ? topColor(p.level) : p.role === "trunk" || p.role === "crown" ? TREE : PALETTE[p.role];
    if (p.kind === "poly") {
      const geometry = { type: "Polygon", coordinates: p.rings.map(ring) };
      if (GROUND.has(p.role)) {
        layers.ground.push({ type: "Feature", properties: { c: color, s }, geometry });
        return;
      }
      const lm = p.role.startsWith("lm");
      layers.solids.push({ type: "Feature", properties: { c: color, s, t: lm ? 2 : 0 }, geometry });
      if (lm) layers.lm.push({ type: "Feature", properties: { c: color, s }, geometry });
    } else if (p.kind === "line") {
      if (p.role === "wave") {
        layers.waves.push({ type: "Feature", properties: { c: color }, geometry: { type: "LineString", coordinates: p.pts.map(ll) } });
      } else if (p.role === "street") {
        layers[p.width >= 12 ? "major" : "minor"].push({
          type: "Feature",
          properties: { w: p.width },
          geometry: { type: "LineString", coordinates: p.pts.map(ll) },
        });
      } else if (p.role === "trunk") {
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
    } else {
      // A crown: a disc, as an octagon standing square to the viewer.
      const c = iso(p.at[0], p.at[1], p.at[2]);
      const pts = Array.from({ length: 17 }, (_, i) => {
        const a = ((i % 16) / 16) * Math.PI * 2;
        return planeToLngLat(c.x + Math.cos(a) * p.r, c.y + Math.sin(a) * p.r);
      });
      layers.solids.push({ type: "Feature", properties: { c: color, s, t: 1 }, geometry: { type: "Polygon", coordinates: [pts] } });
    }
  });

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
    }
  }

  // The districts, named where their landmarks gather.
  const districts = new Map<string, Pt[]>();
  for (const l of landmarks) {
    const d = l.neighborhood?.trim();
    if (!d || /^(various|unknown)$/i.test(d)) continue;
    const q = toLocal(l.latitude, l.longitude);
    districts.set(d, [...(districts.get(d) ?? []), [q.u, q.v]]);
  }
  for (const [name, pts] of districts) {
    if (pts.length < 3) continue;
    const [u, v] = centroid(pts);
    if (u < box.u0 || u > box.u1 || v < box.v0 || v > box.v1) continue;
    layers.places.push({
      type: "Feature",
      properties: { name: name.toUpperCase(), n: pts.length },
      geometry: { type: "Point", coordinates: ll([u, v, Math.max(0, zAt(u, v)) + 20]) },
    });
  }
  for (const [k, fs2] of Object.entries(layers)) console.log(`  ${k}: ${fs2.length}`);

  // Tiles.
  const indexes = Object.fromEntries(
    Object.entries(layers).map(([k, features]) => [
      k,
      new geojsonVt({ type: "FeatureCollection", features }, { maxZoom: Z_MAX, indexMaxZoom: 5, buffer: 64, extent: 4096, tolerance: LAYERS[k].tolerance }),
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
          const t = idx.getTile(z, x, y);
          if (t && t.features.length) out[k] = t;
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
      vector_layers: Object.entries(LAYERS).map(([id, c]) => ({ id, minzoom: c.min, maxzoom: c.max, fields: {} })),
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
