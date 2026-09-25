/**
 * Build assets/map/berkeley.pmtiles from the repo's OSM data (Overpass extracts).
 *   node scripts/build_pmtiles.mjs
 *
 * Pure-JS pipeline: geojson-vt (tiling/simplification) + vt-pbf (MVT encode)
 * + a minimal PMTiles v3 writer (gzip). No tilemaker/osmium required.
 *
 * Bbox: lat 37.75–37.95, lon -122.42 to -122.20 · zooms z8–17
 * Layers: roads(z8+), roads-minor(z12+), buildings(z13+), water(z8+),
 *         waterway(z11+), green(z10+), boundary(z8+), places(z9+)
 */
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import geojsonVtMod from "geojson-vt";
const geojsonVt = geojsonVtMod.default ?? geojsonVtMod;
import vtPbfMod from "vt-pbf";
const vtPbf = (vtPbfMod.fromGeojsonVt ?? vtPbfMod.default ?? vtPbfMod);

const ROOT = path.join(import.meta.dirname, "..");
const OUT = path.join(ROOT, "assets", "map", "berkeley.pmtiles");

const Z_MIN = 8, Z_MAX = 17;
const BBOX = { minLat: 37.75, maxLat: 37.95, minLon: -122.42, maxLon: -122.20 };

const MAJOR = new Set(["motorway", "trunk", "primary", "secondary", "tertiary",
  "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link"]);
const GREEN_KEYS = new Set(["park", "garden", "grass", "forest", "cemetery", "recreation_ground", "meadow", "dog_park", "playground"]);
const WATERWAY_KEYS = new Set(["stream", "river", "canal", "tidal_channel", "ditch", "drain"]);

const inBbox = (lon, lat) =>
  lon >= BBOX.minLon - 0.01 && lon <= BBOX.maxLon + 0.01 &&
  lat >= BBOX.minLat - 0.01 && lat <= BBOX.maxLat + 0.01;

// ── Hilbert tile id (zxy → id), per PMTiles spec ──
function rotate(n, xy, rx, ry) {
  if (ry === 0) {
    if (rx === 1) { xy[0] = n - 1 - xy[0]; xy[1] = n - 1 - xy[1]; }
    const t = xy[0]; xy[0] = xy[1]; xy[1] = t;
  }
}
function zxyToTileId(z, x, y) {
  let acc = 0;
  for (let tz = 0; tz < z; tz++) acc += (1 << tz) * (1 << tz);
  const n = 1 << z;
  let rx, ry, d = 0;
  const xy = [x, y];
  for (let s = n / 2; s > 0; s = Math.floor(s / 2)) {
    rx = (xy[0] & s) > 0 ? 1 : 0;
    ry = (xy[1] & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    rotate(n, xy, rx, ry);
  }
  return acc + d;
}

// ── varint + directory serialization (PMTiles v3 spec §4.2) ──
function varintBuf(n) {
  const out = [];
  do {
    let b = n & 0x7f;
    n = Math.floor(n / 128);
    if (n > 0) b |= 0x80;
    out.push(b);
  } while (n > 0);
  return Buffer.from(out);
}
function serializeDir(entries) {
  const parts = [varintBuf(entries.length)];
  let lastId = 0;
  for (const e of entries) { parts.push(varintBuf(e.tileId - lastId)); lastId = e.tileId; }
  for (const e of entries) parts.push(varintBuf(e.runLength));
  for (const e of entries) parts.push(varintBuf(e.length));
  let nextByte = 0;
  entries.forEach((e, i) => {
    if (i > 0 && e.offset === nextByte) parts.push(varintBuf(0));
    else parts.push(varintBuf(e.offset + 1));
    nextByte = e.offset + e.length;
  });
  return Buffer.concat(parts);
}

// ── Load & bucket data ──
async function load() {
  const [streetsJ, featsJ, waterJ, boundaryJ] = await Promise.all([
    fs.readFile(path.join(ROOT, "data/osm-streets.json"), "utf8"),
    fs.readFile(path.join(ROOT, "data/osm-features.json"), "utf8"),
    fs.readFile(path.join(ROOT, "data/osm-waterways.json"), "utf8"),
    fs.readFile(path.join(ROOT, "data/berkeley-boundary.json"), "utf8"),
  ]);
  const L = { roads: [], roadsMinor: [], buildings: [], water: [], waterway: [], green: [], places: [] };
  const line = (e) => e.geometry?.every?.((p) => typeof p === "object") && e.geometry.length > 1 &&
    e.geometry.some((p) => inBbox(p.lon, p.lat))
    ? e.geometry.map((p) => [p.lon, p.lat]) : null;

  for (const e of JSON.parse(streetsJ).elements) {
    const pts = line(e);
    if (!pts) continue;
    const h = e.tags?.highway;
    if (!h) continue;
    const f = { cls: h, name: e.tags?.name || "" };
    if (MAJOR.has(h)) L.roads.push({ type: "Feature", properties: f, geometry: { type: "LineString", coordinates: pts } });
    else L.roadsMinor.push({ type: "Feature", properties: f, geometry: { type: "LineString", coordinates: pts } });
  }
  for (const e of JSON.parse(featsJ).elements) {
    if (!e.geometry || e.geometry.length < 3) continue;
    if (!e.geometry.some((p) => inBbox(p.lon, p.lat))) continue;
    const t = e.tags || {};
    const coords = e.geometry.map((p) => [p.lon, p.lat]);
    if (t.natural === "water" || t.water) L.water.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords] } });
    else if (GREEN_KEYS.has(t.leisure) || GREEN_KEYS.has(t.landuse))
      L.green.push({ type: "Feature", properties: { name: t.name || "" }, geometry: { type: "Polygon", coordinates: [coords] } });
    else if (t.building && t.building !== "no")
      L.buildings.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords] } });
  }
  for (const e of JSON.parse(waterJ).elements) {
    const t = e.tags || {};
    if (e.type === "node" && t.place) {
      const [lon, lat] = [e.lon, e.lat];
      if (!inBbox(lon, lat)) continue;
      const rank = { city: 10, town: 12, suburb: 14, quarter: 14, neighbourhood: 16, village: 15, island: 17, islet: 18 }[t.place] ?? 16;
      L.places.push({ type: "Feature", properties: { name: t.name || "", place: t.place, rank }, geometry: { type: "Point", coordinates: [lon, lat] } });
    } else if (t.waterway && WATERWAY_KEYS.has(t.waterway)) {
      const pts = line(e);
      if (!pts) continue;
      L.waterway.push({ type: "Feature", properties: { kind: t.waterway, name: t.name || "" }, geometry: { type: "LineString", coordinates: pts } });
    }
  }
  const ring = JSON.parse(boundaryJ).map(([lon, lat]) => [lon, lat]);
  L.boundary = [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: ring.concat([ring[0]]) } }];
  return L;
}

const LAYER_CONF = {
  boundary: { minZoom: 8, tolerance: 1 },
  water: { minZoom: 8, tolerance: 10 },
  roads: { minZoom: 8, tolerance: 3, buffer: 32 },
  green: { minZoom: 10, tolerance: 8 },
  waterway: { minZoom: 11, tolerance: 1 },
  places: { minZoom: 9, tolerance: 0 },
  roadsMinor: { minZoom: 12, tolerance: 4, buffer: 32 },
  buildings: { minZoom: 14, tolerance: 20, buffer: 8 },
};

const lonToX = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const latToY = (lat, z) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z);
};

async function main() {
  console.log("Loading OSM data…");
  const data = await load();
  for (const k of Object.keys(data)) console.log(`  ${k}: ${data[k].length}`);

  const indexes = {};
  for (const [name, fc] of Object.entries(data)) {
    const conf = LAYER_CONF[name];
    indexes[name] = new geojsonVt({ type: "FeatureCollection", features: fc }, {
      maxZoom: Z_MAX, minZoom: conf.minZoom, buffer: 64, extent: 4096,
      tolerance: conf.tolerance, generateId: false,
    });
  }

  console.log("Encoding tiles…");
  const tileMap = new Map(); // tileId -> gzip MVT buffer
  let count = 0;
  for (let z = Z_MIN; z <= Z_MAX; z++) {
    const x0 = lonToX(BBOX.minLon, z), x1 = lonToX(BBOX.maxLon, z);
    const y0 = latToY(BBOX.maxLat, z), y1 = latToY(BBOX.minLat, z);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const layers = {};
        for (const [name, idx] of Object.entries(indexes)) {
          const t = idx.getTile(z, x, y);
          if (t && t.features.length) layers[name] = t;
        }
        if (Object.keys(layers).length === 0) continue;
        const mvt = vtPbf(layers, { version: 2, extent: 4096 });
        tileMap.set(zxyToTileId(z, x, y), zlib.gzipSync(mvt, { level: 9 }));
        count++;
      }
    }
    console.log(`  z${z}: cumulative ${count} tiles`);
  }

  // tile data section: contiguous, ordered by tile id
  const ids = [...tileMap.keys()].sort((a, b) => a - b);
  const entries = [];
  const blobs = [];
  let off = 0;
  for (const id of ids) {
    const buf = tileMap.get(id);
    entries.push({ tileId: id, offset: off, length: buf.length, runLength: 1 });
    blobs.push(buf);
    off += buf.length;
  }
  const tileData = Buffer.concat(blobs);

  const root = zlib.gzipSync(serializeDir(entries), { level: 9 });
  if (root.length > 16257) throw new Error(`root directory too large (${root.length}B) — needs leaf dirs`);
  const metadata = zlib.gzipSync(Buffer.from(JSON.stringify({
    name: "berkeley-paper",
    description: "Berkeley OSM vector tiles for the tours app (paper style)",
    format: "pmtiles",
    type: "baselayer",
    attribution: "© OpenStreetMap contributors",
    vector_layers: Object.entries(LAYER_CONF).map(([id, c]) => ({ id, description: "", minzoom: c.minZoom, maxzoom: Z_MAX })),
  })));

  const header = Buffer.alloc(127);
  header.write("PMTiles", 0, "utf8");
  header.writeUInt8(3, 7);
  let pos = 127;
  const rootOff = pos; pos += root.length;
  const metaOff = pos; pos += metadata.length;
  const dataOff = pos;
  header.writeBigUInt64LE(BigInt(rootOff), 8);
  header.writeBigUInt64LE(BigInt(root.length), 16);
  header.writeBigUInt64LE(BigInt(metaOff), 24);
  header.writeBigUInt64LE(BigInt(metadata.length), 32);
  header.writeBigUInt64LE(0n, 40); // leaf dirs offset
  header.writeBigUInt64LE(0n, 48); // leaf dirs length
  header.writeBigUInt64LE(BigInt(dataOff), 56);
  header.writeBigUInt64LE(BigInt(tileData.length), 64);
  header.writeBigUInt64LE(BigInt(entries.length), 72); // addressed
  header.writeBigUInt64LE(BigInt(entries.length), 80); // entries
  header.writeBigUInt64LE(BigInt(blobs.length), 88);   // contents
  header.writeUInt8(1, 96);  // clustered
  header.writeUInt8(2, 97);  // internal compression: gzip
  header.writeUInt8(2, 98);  // tile compression: gzip
  header.writeUInt8(1, 99);  // tile type: MVT
  header.writeUInt8(Z_MIN, 100);
  header.writeUInt8(Z_MAX, 101);
  header.writeInt32LE(Math.round(BBOX.minLon * 1e7), 102);
  header.writeInt32LE(Math.round(BBOX.minLat * 1e7), 106);
  header.writeInt32LE(Math.round(BBOX.maxLon * 1e7), 110);
  header.writeInt32LE(Math.round(BBOX.maxLat * 1e7), 114);
  header.writeUInt8(13, 118);
  header.writeInt32LE(Math.round(((BBOX.minLon + BBOX.maxLon) / 2) * 1e7), 119);
  header.writeInt32LE(Math.round(((BBOX.minLat + BBOX.maxLat) / 2) * 1e7), 123);

  const out = Buffer.concat([header, root, metadata, tileData]);
  await fs.writeFile(OUT, out);
  console.log(`✓ ${OUT} — ${(out.length / 1e6).toFixed(1)} MB, ${entries.length} tiles (z${Z_MIN}–${Z_MAX})`);
}
main().catch((e) => { console.error(e); process.exit(1); });
