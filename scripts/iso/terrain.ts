/**
 * The ground under the guide's isometric maps: elevation for Berkeley from
 * the Mapzen/Tilezen terrain tiles on AWS (terrarium encoding; in the US
 * they're USGS 3DEP), fetched once into scripts/.cache/terrain and read
 * back as a grid in the iso maps' local metres (lib/iso.ts).
 *
 *   npx tsx scripts/iso/terrain.ts   # fetch what's missing, report the grid
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import { toLatLon, toLocal } from "../../lib/iso";

const Z = 14;
const CACHE = path.join("scripts", ".cache", "terrain");
/** Wide enough for the city, its hills to the ridge and the shore. */
export const TERRAIN_BOX = { minLat: 37.82, maxLat: 37.93, minLon: -122.345, maxLon: -122.195 };
/** Grid spacing, metres. */
export const CELL = 10;

const tileX = (lon: number) => Math.floor(((lon + 180) / 360) * 2 ** Z);
const tileY = (lat: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z);
};
const lonOf = (x: number) => (x / 2 ** Z) * 360 - 180;
const latOf = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** Z))) * 180) / Math.PI;

async function fetchTiles() {
  fs.mkdirSync(CACHE, { recursive: true });
  const [x0, x1] = [tileX(TERRAIN_BOX.minLon), tileX(TERRAIN_BOX.maxLon)];
  const [y0, y1] = [tileY(TERRAIN_BOX.maxLat), tileY(TERRAIN_BOX.minLat)];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const file = path.join(CACHE, `${Z}-${x}-${y}.png`);
      if (fs.existsSync(file)) continue;
      const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`);
      if (!res.ok) throw new Error(`terrain tile ${x},${y}: HTTP ${res.status}`);
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    }
  }
  return { x0, x1, y0, y1 };
}

export interface Terrain {
  /** Local metres of the grid's first cell, and its size. */
  u0: number;
  v0: number;
  cols: number;
  rows: number;
  /** Metres above sea level, row by row from v0 northward. */
  z: Float32Array;
}

/** Elevation over the box, resampled onto a grid in local metres. */
export async function loadTerrain(): Promise<Terrain> {
  const { x0, x1, y0, y1 } = await fetchTiles();
  const tiles = new Map<string, Buffer>();
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const { data } = await sharp(path.join(CACHE, `${Z}-${x}-${y}.png`)).raw().toBuffer({ resolveWithObject: true });
      tiles.set(`${x},${y}`, data);
    }
  }
  // Elevation at a lat/lon, bilinear across the tile pixels.
  const n = 2 ** Z * 256;
  const sample = (lat: number, lon: number) => {
    const fx = ((lon + 180) / 360) * n - 0.5;
    const r = (lat * Math.PI) / 180;
    const fy = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n - 0.5;
    const px = (X: number, Y: number) => {
      const t = tiles.get(`${Math.floor(X / 256)},${Math.floor(Y / 256)}`);
      if (!t) return 0;
      const i = ((Y % 256) * 256 + (X % 256)) * 3;
      return t[i] * 256 + t[i + 1] + t[i + 2] / 256 - 32768;
    };
    const X = Math.floor(fx);
    const Y = Math.floor(fy);
    const ax = fx - X;
    const ay = fy - Y;
    return (
      px(X, Y) * (1 - ax) * (1 - ay) + px(X + 1, Y) * ax * (1 - ay) + px(X, Y + 1) * (1 - ax) * ay + px(X + 1, Y + 1) * ax * ay
    );
  };
  const sw = toLocal(TERRAIN_BOX.minLat, TERRAIN_BOX.minLon);
  const ne = toLocal(TERRAIN_BOX.maxLat, TERRAIN_BOX.maxLon);
  const cols = Math.ceil((ne.u - sw.u) / CELL) + 1;
  const rows = Math.ceil((ne.v - sw.v) / CELL) + 1;
  const z = new Float32Array(cols * rows);
  
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const { lat, lon } = toLatLon(sw.u + c * CELL, sw.v + r * CELL);
      z[r * cols + c] = sample(lat, lon);
    }
  }
  return { u0: sw.u, v0: sw.v, cols, rows, z };
}

/** Elevation at local metres, bilinear on the grid. */
export function elevationAt(t: Terrain, u: number, v: number): number {
  const fx = Math.min(t.cols - 1.001, Math.max(0, (u - t.u0) / CELL));
  const fy = Math.min(t.rows - 1.001, Math.max(0, (v - t.v0) / CELL));
  const c = Math.floor(fx);
  const r = Math.floor(fy);
  const ax = fx - c;
  const ay = fy - r;
  const at = (cc: number, rr: number) => t.z[rr * t.cols + cc];
  return at(c, r) * (1 - ax) * (1 - ay) + at(c + 1, r) * ax * (1 - ay) + at(c, r + 1) * (1 - ax) * ay + at(c + 1, r + 1) * ax * ay;
}

if (process.argv[1]?.endsWith("terrain.ts")) {
  loadTerrain().then((t) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const z of t.z) [lo, hi] = [Math.min(lo, z), Math.max(hi, z)];
    console.log(`${t.cols}×${t.rows} cells of ${CELL} m; ${lo.toFixed(0)} to ${hi.toFixed(0)} m`);
  });
}
