/**
 * Bake the Berkeley map from RAW VECTOR data (Overpass/OSM) — a designed
 * cartographic style, not a filtered raster:
 *   • street hierarchy with zoom-scaled ink weights
 *   • park / water / building fills
 *   • real Berkeley city boundary + hand-placed serif labels
 *   • flat paper background → uniform tone, seamless tiles
 *
 * Outputs (same container format as bake_tiles.mjs):
 *   assets/tiles[-dark].bin + tiles-...-index.json + lib/tiles-manifest.generated.ts
 * Run: node scripts/bake_vector.mjs   (TILES_MODE=dark for dark theme)
 */

import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";

const DARK = process.env.TILES_MODE === "dark";

// ── Palette ──
const P = DARK
  ? {
      paper: "#201E1B",
      green: "#272C23",
      water: "#1F2A31",
      building: "#2B2721",
      ink: "#D8CDB8",
      inkSoft: "#B3A88F",
      boundary: "#B8956A",
      label: "#E4DAC6",
    }
  : {
      paper: "#F3EDDF",
      green: "#D9E0C6",
      water: "#B9CCC9",
      building: "#E3D9C4",
      ink: "#4A3A28",
      inkSoft: "#6B5A42",
      boundary: "#8B6D4A",
      label: "#3A2E20",
    };

const BG = DARK ? "#1C1B19" : "#F7F3EC";

// ── Geo rects (same as bake_tiles) ──
const CORE = { minLat: 37.85, maxLat: 37.9, minLon: -122.32, maxLon: -122.24 };
const MID = { minLat: 37.785, maxLat: 37.965, minLon: -122.41, maxLon: -122.15 };
const VIEW_RECT = {
  minLat: MID.minLat - 0.08,
  maxLat: MID.maxLat + 0.08,
  minLon: MID.minLon - 0.1,
  maxLon: MID.maxLon + 0.1,
};

const Z_MIN = 11;
const Z_MAX = 16;
const REAL_Z_MAX = 13;
const W = 256;

const OUT_BIN = path.join(import.meta.dirname, "..", "assets", DARK ? "tiles-dark.bin" : "tiles.bin");
const OUT_INDEX = path.join(import.meta.dirname, "..", "assets", DARK ? "tiles-dark-index.json" : "tiles-index.json");
const OUT_MANIFEST = path.join(import.meta.dirname, "..", "lib", "tiles-manifest.generated.ts");

// ── Mercator projection → global pixel space at zoom z ──
const lonPx = (lon, z) => ((lon + 180) / 360) * W * 2 ** z;
const latPx = (lat, z) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * W * 2 ** z;
};

function tileBounds(z, x, y) {
  const west = (x / 2 ** z) * 360 - 180;
  const east = ((x + 1) / 2 ** z) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  const s = Math.PI - (2 * Math.PI * (y + 1)) / 2 ** z;
  return {
    minLat: (180 / Math.PI) * Math.atan(Math.sinh(s)),
    maxLat: (180 / Math.PI) * Math.atan(Math.sinh(n)),
    minLon: west,
    maxLon: east,
  };
}

const lonToX = (lon, z) => Math.floor((lon + 180) / 360 * 2 ** z);
const latToY = (lat, z) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z);
};

function intersects(a, b) {
  return !(a.maxLat < b.minLat || a.minLat > b.maxLat || a.maxLon < b.minLon || a.minLon > b.maxLon);
}
const overlapsCore = (t) => intersects(t, CORE);
const overlapsMid = (t) => intersects(t, MID);

function rectDistKm(a, b) {
  const dy = Math.max(b.minLat - a.maxLat, a.minLat - b.maxLat, 0) * 111;
  const kmLon = 111 * Math.cos((37.87 * Math.PI) / 180);
  const dx = Math.max(b.minLon - a.maxLon, a.minLon - b.maxLon, 0) * kmLon;
  return Math.hypot(dx, dy);
}
function pointDistKm(lat, lon, b) {
  const dy = Math.max(b.minLat - lat, 0, lat - b.maxLat) * 111;
  const dx = Math.max(b.minLon - lon, 0, lon - b.maxLon) * 111 * Math.cos((37.87 * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

// ── Blur / fade ramps ──
const blurSigma = (dKm) => Math.min(7, Math.max(0, (dKm - 0.5) * 0.22));
const bgBlend = (dKm) => Math.min(1.0, Math.max(0, (dKm - 1.0) / 6)); // full fade — must reach BG exactly to match blank fill tiles (else visible square seams)

// ── Load OSM data ──
async function loadData() {
  const [streets, feats, boundary] = await Promise.all([
    fs.readFile(path.join(import.meta.dirname, "..", "data", "osm-streets.json"), "utf8"),
    fs.readFile(path.join(import.meta.dirname, "..", "data", "osm-features.json"), "utf8"),
    fs.readFile(path.join(import.meta.dirname, "..", "data", "berkeley-boundary.json"), "utf8"),
  ]);
  const parse = (j) => JSON.parse(j).elements;

  const GREEN_KEYS = new Set(["park", "garden", "grass", "forest", "cemetery", "recreation_ground", "meadow"]);
  const streetsArr = [];
  const greens = [];
  const waters = [];
  const buildings = [];
  const coast = [];

  for (const e of parse(streets)) {
    if (!e.geometry) continue;
    streetsArr.push({ cls: e.tags.highway, name: e.tags.name, pts: e.geometry.map((p) => [p.lon, p.lat]) });
  }
  for (const e of parse(feats)) {
    if (!e.geometry) continue;
    const t = e.tags || {};
    const pts = e.geometry.map((p) => [p.lon, p.lat]);
    if (t.natural === "coastline") coast.push({ pts });
    else if (t.natural === "water") waters.push({ pts });
    else if (GREEN_KEYS.has(t.leisure) || GREEN_KEYS.has(t.landuse)) greens.push({ pts });
    else if (t.building && t.building !== "no" && pts.length > 2) buildings.push({ pts });
  }
  return { streetsArr, greens, waters, buildings, coast, boundary: JSON.parse(boundary) };
}

// ── Coastline: stitch segments into longest chain, close polygon westward ──
function stitchCoast(chain) {
  const key = (p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
  const startMap = new Map();
  const endMap = new Map();
  for (const seg of chain) {
    startMap.set(key(seg[0]), seg);
    endMap.set(key(seg[seg.length - 1]), seg);
  }
  const used = new Set();
  let best = [];
  for (const seg of chain) {
    if (used.has(seg)) continue;
    const line = [...seg];
    used.add(seg);
    // extend forward
    let cont = endMap.get(key(line[line.length - 1]));
    while (cont && !used.has(cont)) {
      used.add(cont);
      line.push(...cont.slice(1));
      cont = endMap.get(key(line[line.length - 1]));
    }
    // extend backward
    cont = startMap.get(key(line[0]));
    while (cont && !used.has(cont)) {
      used.add(cont);
      line.unshift(...cont.slice(0, -1));
      cont = startMap.get(key(line[0]));
    }
    if (line.length > best.length) best = line;
  }
  return best;
}

// ── Spatial index: bucket features by z14 cell for fast per-tile lookup ──
class Grid {
  constructor(features) {
    this.cells = new Map();
    for (const f of features) {
      let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
      for (const [lon, lat] of f.pts) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
      f.bb = { minLat, maxLat, minLon, maxLon };
      const x0 = lonToX(minLon, 14), x1 = lonToX(maxLon, 14);
      const y0 = latToY(maxLat, 14), y1 = latToY(minLat, 14);
      for (let x = x0; x <= x1; x++)
        for (let y = y0; y <= y1; y++) {
          const k = `${x}/${y}`;
          let a = this.cells.get(k);
          if (!a) this.cells.set(k, (a = []));
          a.push(f);
        }
    }
  }
  query(z, x, y) {
    // map this tile onto the z14 cells it covers (z<14 spans many, z>14 sits inside one)
    let x0, x1, y0, y1;
    if (z <= 14) {
      const s = 2 ** (14 - z);
      x0 = x * s; x1 = (x + 1) * s - 1;
      y0 = y * s; y1 = (y + 1) * s - 1;
    } else {
      const s = 2 ** (z - 14);
      x0 = Math.floor(x / s); x1 = Math.floor((x + 1) / s);
      y0 = Math.floor(y / s); y1 = Math.floor((y + 1) / s);
    }
    const res = [];
    const seen = new Set();
    const bb = tileBounds(z, x, y);
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const arr = this.cells.get(`${cx}/${cy}`);
        if (!arr) continue;
        for (const f of arr) {
          if (seen.has(f)) continue;
          seen.add(f);
          if (intersects(f.bb, bb)) res.push(f);
        }
      }
    return res;
  }
}

// ── Style tables ──
const ROAD_ORDER = [
  "service", "pedestrian", "residential", "unclassified", "living_street",
  "tertiary", "secondary", "primary", "trunk", "motorway",
];
// widths in px at each zoom (undefined = not drawn)
function roadWidth(cls, z) {
  const t = {
    motorway:  { 11: 1.8, 12: 2.2, 13: 2.8, 14: 3.4, 15: 4.4, 16: 6 },
    trunk:     { 11: 1.6, 12: 2.0, 13: 2.6, 14: 3.2, 15: 4.0, 16: 5.4 },
    primary:   { 11: 1.4, 12: 1.8, 13: 2.4, 14: 3.0, 15: 3.8, 16: 5 },
    secondary: { 11: 1.0, 12: 1.4, 13: 1.8, 14: 2.4, 15: 3.0, 16: 3.8 },
    tertiary:  { 12: 0.9, 13: 1.3, 14: 1.7, 15: 2.5, 16: 3.2 },
    residential:{ 12: 0.6, 13: 0.8, 14: 1.1, 15: 1.7, 16: 2.3 },
    unclassified:{ 12: 0.6, 13: 0.8, 14: 1.1, 15: 1.7, 16: 2.3 },
    living_street:{ 13: 0.7, 14: 1.0, 15: 1.5, 16: 2.1 },
    service:   { 14: 0.7, 15: 0.9, 16: 1.5 },
    pedestrian:{ 14: 0.6, 15: 0.8, 16: 1.3 },
  }[cls];
  return t ? t[z] : undefined;
}

const LABELS = [
  { lat: 37.8915, lon: -122.2955, text: "B E R K E L E Y", z: 12, size: 17, spacing: 3 },
  { lat: 37.8722, lon: -122.2598, text: "UC Berkeley", z: 14, size: 12.5, italic: true },
  { lat: 37.8695, lon: -122.2715, text: "Downtown", z: 15, size: 11 },
  { lat: 37.8885, lon: -122.2845, text: "North Berkeley", z: 14, size: 11 },
  { lat: 37.8562, lon: -122.2625, text: "Elmwood", z: 15, size: 10.5 },
  { lat: 37.8465, lon: -122.2515, text: "Rockridge", z: 14, size: 10.5 },
  { lat: 37.8555, lon: -122.2955, text: "West Berkeley", z: 15, size: 10.5 },
  { lat: 37.8660, lon: -122.3095, text: "Marina", z: 14, size: 10.5 },
  { lat: 37.9050, lon: -122.2560, text: "Berkeley Hills", z: 13, size: 11, italic: true },
  { lat: 37.8430, lon: -122.3350, text: "San Francisco Bay", z: 12, size: 12, italic: true, spacing: 1.5 },
];

// landmark ink markers (National Register sites) parsed from the app data
async function loadLandmarks() {
  const src = await fs.readFile(path.join(import.meta.dirname, "..", "data", "landmarks.ts"), "utf8");
  const re = /latitude:\s*([\d.-]+),\s*\n\s*longitude:\s*([\d.-]+),[\s\S]*?nationalRegister:\s*true/g;
  const out = [];
  let m;
  while ((m = re.exec(src))) out.push({ lat: +m[1], lon: +m[2] });
  return out;
}

// ── Render one tile to SVG → JPEG ──
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}
function renderTile(z, x, y, data, grids, coastlinePoly) {
  const bb = tileBounds(z, x, y);
  const px = (lon) => lonPx(lon, z) - x * W;
  const py = (lat) => latPx(lat, z) - y * W;
  const path = (pts, close = false) =>
    pts.map(([lon, lat], i) => `${i ? "L" : "M"}${px(lon).toFixed(1)} ${py(lat).toFixed(1)}`).join("") + (close ? "Z" : "");

  const s = [];
  s.push(`<rect width="${W}" height="${W}" fill="${P.paper}"/>`);

  // bay water (coastline polygon closed far west)
  if (coastlinePoly.length > 2) {
    const farWest = -122.9;
    const ring = [...coastlinePoly, [farWest, coastlinePoly[coastlinePoly.length - 1][1]], [farWest, coastlinePoly[0][1]]];
    s.push(`<path d="${path(ring, true)}" fill="${P.water}" stroke="none"/>`);
  }
  // inland water
  for (const w of grids.water.query(z, x, y)) s.push(`<path d="${path(w.pts, true)}" fill="${P.water}" stroke="none"/>`);
  // green
  if (z >= 12) for (const g of grids.green.query(z, x, y)) s.push(`<path d="${path(g.pts, true)}" fill="${P.green}" stroke="none"/>`);
  // buildings
  if (z >= 15) for (const b of grids.building.query(z, x, y)) s.push(`<path d="${path(b.pts, true)}" fill="${P.building}" stroke="none"/>`);

  // roads: minor → major
  const roads = grids.streets.query(z, x, y);
  for (const cls of ROAD_ORDER) {
    const w = roadWidth(cls, z);
    if (!w) continue;
    const color = w >= 2.4 ? P.ink : P.inkSoft;
    for (const r of roads) {
      if (r.cls !== cls) continue;
      s.push(`<path d="${path(r.pts)}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
  }

  // street names, rotated along the road
  if (z >= 13) {
    const pxPerDeg = (W * 2 ** z) / 360;
    for (const L of data.streetLabels) {
      const minZ = /^(motorway|trunk|primary)/.test(L.cls) ? 13 : /^(secondary|tertiary)/.test(L.cls) ? 14 : 15;
      if (z < minZ) continue;
      if (L.mlen * pxPerDeg < 34) continue; // too cramped at this zoom
      const lx = px(L.lon), ly = py(L.lat);
      if (lx < -70 || lx > W + 70 || ly < -20 || ly > W + 20) continue;
      const size = minZ === 13 ? 12.5 : minZ === 14 ? 11.5 : 10.5;
      s.push(
        `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" transform="rotate(${L.angle.toFixed(1)} ${lx.toFixed(1)} ${ly.toFixed(1)})" font-family="Georgia, 'Times New Roman', serif" font-size="${size}" fill="${P.label}" stroke="${P.paper}" stroke-width="2.6" stroke-opacity="0.9" paint-order="stroke" stroke-linejoin="round" text-anchor="middle" opacity="0.92" letter-spacing="0.2">${esc(L.text)}</text>`
      );
    }
  }

  // city boundary: dashed accent
  s.push(`<path d="${path(data.boundary.map(([lon, lat]) => [lon, lat]))}" fill="none" stroke="${P.boundary}" stroke-width="1.5" stroke-dasharray="5 3.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>`);

  // landmark ink markers (National Register)
  if (z >= 15) {
    for (const L of data.landmarks) {
      const lx = px(L.lon), ly = py(L.lat);
      if (lx < -8 || lx > W + 8 || ly < -8 || ly > W + 8) continue;
      const r = 3.2;
      s.push(
        `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="${r}" fill="none" stroke="${P.ink}" stroke-width="1.3"/>` +
        `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="1.1" fill="${P.ink}"/>`
      );
    }
  }

  // labels
  if (z >= 12) {
    for (const L of LABELS) {
      if (z < L.z) continue;
      const lx = px(L.lon), ly = py(L.lat);
      // generous margin so a label near a tile edge is drawn (fully) on every tile it spans
      const m = L.size * 12 + 40;
      if (lx < -m || lx > W + m || ly < -20 || ly > W + 20) continue;
      s.push(
        `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-family="Georgia, 'Times New Roman', serif" font-size="${L.size}"` +
          `${L.italic ? ' font-style="italic"' : ""} letter-spacing="${L.spacing ?? 0.5}" fill="${P.label}"` +
          ` stroke="${P.paper}" stroke-width="3.4" stroke-opacity="0.85" paint-order="stroke" stroke-linejoin="round" text-anchor="middle">${esc(L.text)}</text>`
      );
    }
  }

  return Buffer.from(`<svg width="${W}" height="${W}" xmlns="http://www.w3.org/2000/svg">${s.join("")}</svg>`);
}

// ── Blur / fade finish (gradient-feathered, from bake_tiles) ──
async function processTileSmooth(svgBuf, b, zoom) {
  const corners = [
    [b.minLat, b.minLon], [b.minLat, b.maxLon],
    [b.maxLat, b.minLon], [b.maxLat, b.maxLon],
  ];
  const ds = corners.map(([la, lo]) => pointDistKm(la, lo, CORE));
  const dNear = Math.min(...ds), dFar = Math.max(...ds);
  const sLo = blurSigma(dNear), sHi = blurSigma(dFar);
  const bLo = bgBlend(dNear), bHi = bgBlend(dFar);

  const bAvg = bgBlend((dNear + dFar) / 2);
  const make = async (sigma, blend) => {
    let out = sharp(svgBuf, { density: 96 });
    if (blend > 0) {
      // blend toward theme background via overlay wash
      const wash = Buffer.from(
        `<svg width="${W}" height="${W}"><rect width="${W}" height="${W}" fill="${BG}" fill-opacity="${blend}"/></svg>`
      );
      out = sharp(await out.png().toBuffer()).composite([{ input: await sharp(wash).png().toBuffer(), blend: "over" }]);
    }
    if (sigma > 0.3) return out.blur(sigma).jpeg({ quality: 52, mozjpeg: true }).toBuffer();
    return out.jpeg({ quality: 58, mozjpeg: true }).toBuffer();
  };

  if (sHi - sLo < 0.6) return make(sLo, bAvg);

  const clat = (b.minLat + b.maxLat) / 2, clon = (b.minLon + b.maxLon) / 2;
  const pxn = Math.min(Math.max(clon, CORE.minLon), CORE.maxLon);
  const pyn = Math.min(Math.max(clat, CORE.minLat), CORE.maxLat);
  const kmLon = 111 * Math.cos((37.87 * Math.PI) / 180);
  let vx = (pxn - clon) * kmLon, vy = (pyn - clat) * 111;
  const vlen = Math.hypot(vx, vy) || 1;
  vx /= vlen; vy /= vlen;
  const cx = 128, cy = 128, r = 190;
  const mask = Buffer.from(
    `<svg width="${W}" height="${W}">
      <defs><linearGradient id="g" x1="${cx - vx * r}" y1="${cy - vy * r}" x2="${cx + vx * r}" y2="${cy + vy * r}" gradientUnits="userSpaceOnUse">
        <stop offset="0.1" stop-color="#fff" stop-opacity="0"/>
        <stop offset="0.9" stop-color="#fff" stop-opacity="1"/>
      </linearGradient></defs>
      <rect width="${W}" height="${W}" fill="url(#g)"/>
    </svg>`
  );
  const hiMasked = await make(sHi, bAvg);
  const lo = await make(sLo, bAvg);
  const hi = await sharp(hiMasked)
    .ensureAlpha()
    .composite([{ input: await sharp(mask).png().toBuffer(), blend: "dest-in" }])
    .png()
    .toBuffer();
  return sharp(lo).composite([{ input: hi, blend: "over" }]).jpeg({ quality: 52, mozjpeg: true }).toBuffer();
}

// ── Main ──
async function main() {
  console.log("Loading OSM data…");
  const data = await loadData();
  data.landmarks = await loadLandmarks();
  console.log(`landmarks: ${data.landmarks.length}`);
  // street-name labels: for each named street, take its longest straight run
  const byName = new Map();
  for (const st of data.streetsArr) {
    if (!st.name || st.pts.length < 2) continue;
    const m = st.pts.map(([lon, lat]) => [lon, Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))]);
    const segAng = (i) => Math.atan2(m[i + 1][1] - m[i][1], m[i + 1][0] - m[i][0]);
    const runs = [];
    let cur = [0];
    for (let i = 1; i < m.length - 1; i++) {
      if (Math.abs(segAng(i) - segAng(i - 1)) > 0.61) { runs.push(cur); cur = [i]; }
      else cur.push(i);
    }
    runs.push(cur);
    let best = null;
    for (const r of runs) {
      let len = 0;
      for (let i = 1; i < r.length; i++) len += Math.hypot(m[r[i]][0] - m[r[i - 1]][0], m[r[i]][1] - m[r[i - 1]][1]);
      if (!best || len > best.len) best = { r, len };
    }
    if (!best || best.len < 0.0015) continue; // skip stubs
    const r = best.r;
    const midPos = Math.floor(r.length / 2);
    const mid = r[midPos];
    const i0 = Math.max(midPos - 1, 0), i1 = Math.min(midPos + 1, r.length - 1);
    let angle = (Math.atan2(m[r[i1]][1] - m[r[i0]][1], m[r[i1]][0] - m[r[i0]][0]) * 180) / Math.PI;
    if (angle > 90 || angle < -90) angle += 180; // keep upright
    const arr = byName.get(st.name) ?? [];
    arr.push({ lon: st.pts[mid][0], lat: st.pts[mid][1], angle, text: st.name, cls: st.cls, mlen: best.len });
    byName.set(st.name, arr);
  }
  // keep the 3 longest placements per name, spaced apart
  data.streetLabels = [];
  for (const arr of byName.values()) {
    arr.sort((a, b) => b.mlen - a.mlen);
    const kept = [];
    for (const L of arr) {
      if (kept.length >= 3) break;
      if (kept.some((k) => Math.hypot(k.lon - L.lon, k.lat - L.lat) < 0.012)) continue;
      kept.push(L);
    }
    data.streetLabels.push(...kept);
  }
  console.log(`street labels: ${data.streetLabels.length}`);

  console.log("Indexing features…");
  const grids = {
    streets: new Grid(data.streetsArr),
    green: new Grid(data.greens),
    water: new Grid(data.waters),
    building: new Grid(data.buildings),
  };
  const coastlinePoly = stitchCoast(data.coast.map((f) => f.pts));
  console.log(`coastline chain: ${coastlinePoly.length} pts`);
  data.boundary = data.boundary.map(([lon, lat]) => [lon, lat]); // [lon,lat] ring

  // enumerate tiles (same policy as bake_tiles)
  const real = [];
  for (let z = Z_MIN; z <= Z_MAX; z++) {
    const R = z <= REAL_Z_MAX ? VIEW_RECT : MID;
    const x0 = lonToX(R.minLon, z), x1 = lonToX(R.maxLon, z);
    const y0 = latToY(R.maxLat, z), y1 = latToY(R.minLat, z);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const b = tileBounds(z, x, y);
        if (!intersects(b, R)) continue;
        const isReal =
          z <= REAL_Z_MAX || overlapsCore(b) || rectDistKm(b, CORE) < (360 / 2 ** z) * 111 * Math.cos((37.87 * Math.PI) / 180) * 1.2;
        if (isReal) real.push({ z, x, y });
      }
  }
  console.log(`Real tiles to render: ${real.length}`);

  const processed = new Map();
  let cursor = 0, done = 0;
  const CONC = 6;
  async function worker() {
    while (cursor < real.length) {
      const { z, x, y } = real[cursor++];
      const key = `${z}-${x}-${y}`;
      try {
        const svg = renderTile(z, x, y, data, grids, coastlinePoly);
        const b = tileBounds(z, x, y);
        // No fade/blur: the outer-edge wash produced visible tonal squares.
        // Tiles render flat; blank fill matches P.paper so everything blends.
        processed.set(
          key,
          await sharp(svg, { density: 96 }).jpeg({ quality: 58, mozjpeg: true }).toBuffer()
        );
      } catch (e) {
        console.warn(`  ✗ ${key}: ${e.message}`);
      }
      if (++done % 100 === 0) console.log(`  ${done}/${real.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));

  // virtual tiles: upscale z13 parents into z14-16 gaps (far ring)
  let virtualCount = 0;
  for (let z = REAL_Z_MAX + 1; z <= Z_MAX; z++) {
    const shift = z - 13;
    const R = MID;
    const x0 = lonToX(R.minLon, z), x1 = lonToX(R.maxLon, z);
    const y0 = latToY(R.maxLat, z), y1 = latToY(R.minLat, z);
    let count = 0;
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const key = `${z}-${x}-${y}`;
        if (processed.has(key)) continue;
        const b = tileBounds(z, x, y);
        if (!overlapsMid(b)) continue;
        const ax = x >> shift, ay = y >> shift;
        const parent = processed.get(`${REAL_Z_MAX}-${ax}-${ay}`);
        if (!parent) continue;
        const size = 256 / 2 ** shift;
        const left = (x - (ax << shift)) * size;
        const top = (y - (ay << shift)) * size;
        processed.set(
          key,
          await sharp(parent)
            .extract({ left, top, width: size, height: size })
            .resize(256, 256, { kernel: "cubic" })
            .jpeg({ quality: 52, mozjpeg: true })
            .toBuffer()
        );
        count++;
      }
    }
    virtualCount += count;
    console.log(`  virtual tiles through z${z}: ${count}`);
  }

  // Blank paper fill: iOS MapKit renders failed tile requests (404) as BLACK
  // squares when shouldReplaceMapContent is set. Every tile coord inside an
  // expanded rect around the baked zone must therefore resolve — emit a plain
  // theme-background JPEG for any grid cell not already baked (real or
  // virtual). At higher zooms a blank child is pixel-identical to its blank
  // z-parent (solid color upscales to itself), so one shared blank buffer
  // covers the whole ladder; packing dedupes it to a single blob.
  const EXPAND = 0.2;
  const BLANK_RECT = {
    minLat: MID.minLat - EXPAND,
    maxLat: MID.maxLat + EXPAND,
    minLon: MID.minLon - EXPAND,
    maxLon: MID.maxLon + EXPAND,
  };
  const blankBuf = await sharp(
    Buffer.from(`<svg width="${W}" height="${W}"><rect width="${W}" height="${W}" fill="${P.paper}"/></svg>`)
  )
    .jpeg({ quality: 52, mozjpeg: true })
    .toBuffer();
  let blankCount = 0;
  for (let z = Z_MIN; z <= Z_MAX; z++) {
    const x0 = lonToX(BLANK_RECT.minLon, z), x1 = lonToX(BLANK_RECT.maxLon, z);
    const y0 = latToY(BLANK_RECT.maxLat, z), y1 = latToY(BLANK_RECT.minLat, z);
    let zc = 0;
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const key = `${z}-${x}-${y}`;
        if (processed.has(key)) continue;
        processed.set(key, blankBuf);
        zc++;
      }
    blankCount += zc;
    console.log(`  blank fill z${z}: +${zc}`);
  }
  console.log(`blank tiles: ${blankCount}`);

  // z17 pass: iOS ignores maxZoomLevel, so users can always zoom one level
  // past Z_MAX — and MapKit requests z17 tile keys exclusively (no fallback
  // to z16). Bake z17 by splitting each z16 parent into 4 quadrants so the
  // deep-zoom level never goes blank. Blank parents yield the shared blank
  // buffer directly (identical pixels → dedupe keeps the container small).
  {
    console.log("z17 pass (quadrant split)…");
    const Q = Math.floor(W / 2); // 128px quadrant of the 256pt render
    let zc = 0;
    const z17x0 = lonToX(BLANK_RECT.minLon, 17), z17x1 = lonToX(BLANK_RECT.maxLon, 17);
    const z17y0 = latToY(BLANK_RECT.maxLat, 17), z17y1 = latToY(BLANK_RECT.minLat, 17);
    for (let x = z17x0; x <= z17x1; x++) {
      for (let y = z17y0; y <= z17y1; y++) {
        const key = `17-${x}-${y}`;
        if (processed.has(key)) continue;
        const parent = processed.get(`16-${x >> 1}-${y >> 1}`);
        if (!parent) continue;
        if (parent === blankBuf) {
          processed.set(key, blankBuf);
        } else {
          // Deep zoom is used constantly (dense adjacent properties) — render
          // core-area z17 tiles for real at 2x resolution instead of
          // upscaling blurry z16 quadrants.
          const b = tileBounds(17, x, y);
          const isReal =
            overlapsCore(b) ||
            rectDistKm(b, CORE) < (360 / 2 ** 17) * 111 * Math.cos((37.87 * Math.PI) / 180) * 1.2;
          if (isReal) {
            const svg = renderTile(17, x, y, data, grids, coastlinePoly);
            processed.set(
              key,
              await sharp(svg, { density: 144 }).jpeg({ quality: 58, mozjpeg: true }).toBuffer()
            );
          } else {
          const dx = x & 1, dy = y & 1;
          // rendered tiles are 341px (density 96 on a 256pt SVG), but
          // virtual far-ring tiles are plain 256px upscales — split into
          // half-size quadrants of whatever the parent actually is.
          const meta = await sharp(parent).metadata();
          const side = Math.floor((meta.width ?? W) / 2);
          const buf = await sharp(parent)
            .extract({ left: dx * side, top: dy * side, width: side, height: side })
            .resize(W, W, { kernel: "cubic" })
            .jpeg({ quality: 52, mozjpeg: true })
            .toBuffer();
          processed.set(key, buf);
          }
        }
        zc++;
      }
    }
    console.log(`z17 tiles: +${zc}`);
  }

  // pack (3-byte aligned for runtime base64 slicing)
  console.log("Packing container…");
  const header = {};
  const blobs = [];
  let offset = 0;
  const dedupe = new Map(); // shared buffer (e.g. blank fill) -> stored [offset, len]
  for (const [key, buf] of [...processed.entries()].sort()) {
    let entry = dedupe.get(buf);
    if (!entry) {
      const pad = (3 - (buf.length % 3)) % 3;
      const padded = pad ? Buffer.concat([buf, Buffer.alloc(pad)]) : buf;
      entry = [offset, padded.length];
      dedupe.set(buf, entry);
      blobs.push(padded);
      offset += padded.length;
    }
    header[key] = entry;
  }
  const all = Buffer.concat(blobs);
  await fs.mkdir(path.dirname(OUT_BIN), { recursive: true });
  await fs.writeFile(OUT_BIN, all);
  await fs.writeFile(
    OUT_INDEX,
    JSON.stringify({ version: 12, tileCount: Object.keys(header).length, byteLength: all.length, tiles: header })
  );
  await fs.writeFile(
    OUT_MANIFEST,
    `// AUTO-GENERATED by scripts/bake_vector.mjs — do not edit.
/** Berkeley core (sharp, fully themed). */
export const CORE_BBOX = { minLat: ${CORE.minLat}, maxLat: ${CORE.maxLat}, minLon: ${CORE.minLon}, maxLon: ${CORE.maxLon} } as const;
/** Themed-tile coverage: inside this rect tiles are baked; outside it the map fades to the theme background. */
export const MID_RECT = { minLat: ${MID.minLat.toFixed(5)}, maxLat: ${MID.maxLat.toFixed(5)}, minLon: ${MID.minLon.toFixed(5)}, maxLon: ${MID.maxLon.toFixed(5)} } as const;
export const TILES_VERSION = 5;
/** Berkeley city boundary (OSM relation, lat/lon ring) — drawn as an accent line. */
export const BERKELEY_BOUNDARY: [number, number][] = ${JSON.stringify(data.boundary.map(([lo, la]) => [la, lo]))};
`
  );
  const mb = (all.length / 1e6).toFixed(1);
  console.log(`✓ ${Object.keys(header).length} tiles → tiles.bin (${mb} MB) + manifest (v5)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
