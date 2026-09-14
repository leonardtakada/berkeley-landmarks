/**
 * Bake themed map tiles for the native app.
 *
 * Downloads OSM tiles for the Berkeley area, applies the "aged paper"
 * treatment (same filter chain as the web map: sepia(0.32) saturate(0.55)
 * brightness(1.06) contrast(0.92)), and bakes a progressive blur + background
 * fade outside the Berkeley core so the map melts seamlessly into the app
 * theme instead of showing a hard edge against Apple's default map.
 *
 * Output:
 *   assets/tiles.bin          — container with all processed tiles
 *   assets/tiles-index.json   — byte offsets (imported at runtime)
 *   lib/tiles-manifest.generated.ts — geo rects used by the map (far-ring polygon)
 *
 * Run: node scripts/bake_tiles.mjs
 */

import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";

// ── Keep in sync with lib/tiles-manifest.generated.ts (generated below) ──
const CORE = { minLat: 37.85, maxLat: 37.9, minLon: -122.32, maxLon: -122.24 };
const MID_PAD_LON = 0.09; // ≈ 2 tiles at z13
const MID_PAD_LAT = 0.065;
const MID = {
  minLat: CORE.minLat - MID_PAD_LAT,
  maxLat: CORE.maxLat + MID_PAD_LAT,
  minLon: CORE.minLon - MID_PAD_LON,
  maxLon: CORE.maxLon + MID_PAD_LON,
};
const DARK = process.env.TILES_MODE === "dark";
const BG = DARK ? "#1C1B19" : "#F7F3EC"; // theme background
const Z_MIN = 11;
const Z_MAX = 16;
const REAL_Z_MAX = 13; // beyond this, virtual tiles are cut from z13 parents
const TILE_URL_BASE = (z, x, y) =>
  DARK
    ? `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/${z}/${y}/${x}`
    : `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/${z}/${y}/${x}`;
const TILE_URL_REF = (z, x, y) =>
  DARK
    ? `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/${z}/${y}/${x}`
    : `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/${z}/${y}/${x}`;
// ESRI Gray Canvas — minimal geometry + optional labels overlay
const DL_CACHE = path.join(import.meta.dirname, "..", ".tile-cache");
const OUT_BIN = path.join(
  import.meta.dirname,
  "..",
  "assets",
  DARK ? "tiles-dark.bin" : "tiles.bin"
);
const OUT_INDEX = path.join(
  import.meta.dirname,
  "..",
  "assets",
  DARK ? "tiles-dark-index.json" : "tiles-index.json"
);
const OUT_MANIFEST = path.join(import.meta.dirname, "..", "lib", "tiles-manifest.generated.ts");

// ── Paper/print texture: subtle grain overlay on sharp (non-blurred) tiles ──
const PAPER_TEX = await fs.readFile(path.join(import.meta.dirname, "paper-texture.png"));

// ── Filter chain (CSS-equivalent matrix, folded into one 3x3) ──
const SEP = [
  [0.393, 0.769, 0.189],
  [0.349, 0.686, 0.168],
  [0.272, 0.534, 0.131],
];
const SEP_STRENGTH = DARK ? 0.22 : 0.32;
const SATURATION = DARK ? 0.6 : 0.6;
const BRIGHTNESS = DARK ? 1.0 : 0.97;
const CONTRAST = DARK ? 1.25 : 1.12;
const LUMA = [0.2126, 0.7152, 0.0722];

// ── Geo helpers ──
function lonToX(lon, z) { return ((lon + 180) / 360) * 2 ** z; }
function latToY(lat, z) {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z;
}
function tileBounds(z, x, y) {
  const n = 2 ** z;
  const lon0 = (x / n) * 360 - 180;
  const lon1 = ((x + 1) / n) * 360 - 180;
  const latRad = (t) => Math.atan(Math.sinh(Math.PI * (1 - 2 * t)));
  const lat0 = (latRad((y + 1) / n) * 180) / Math.PI;
  const lat1 = (latRad(y / n) * 180) / Math.PI;
  return { minLon: lon0, maxLon: lon1, minLat: lat0, maxLat: lat1 };
}
/** Rect-to-rect distance in km (0 if overlapping). */
function rectDistKm(a, b) {
  const dy = Math.max(0, Math.max(a.minLat - b.maxLat, b.minLat - a.maxLat)) * 111;
  const dx = Math.max(0, Math.max(a.minLon - b.maxLon, b.minLon - a.maxLon)) * 111 * Math.cos((37.87 * Math.PI) / 180);
  return Math.hypot(dx, dy);
}
function intersects(a, b) {
  return a.minLon <= b.maxLon && a.maxLon >= b.minLon && a.minLat <= b.maxLat && a.maxLat >= b.minLat;
}
const overlapsCore = (t) => intersects(t, CORE);
const overlapsMid = (t) => intersects(t, MID);

// ── Blur / fade ramps (zoom-independent, geo distance based) ──
const blurSigma = (dKm) => Math.min(7, Math.max(0, (dKm - 0.5) * 0.22));
const bgBlend = (dKm) => Math.min(0.8, Math.max(0, (dKm - 1.0) / 6));

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const BG_RGB = hexToRgb(BG);

/** Point-to-rect distance in km. */
function pointDistKm(lat, lon, b) {
  const dy = Math.max(b.minLat - lat, 0, lat - b.maxLat) * 111;
  const dx = Math.max(b.minLon - lon, 0, lon - b.maxLon) * 111 * Math.cos((37.87 * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/** Decode tile → raw RGBA buffer (no theme applied). */
async function rawRGBA(buf) {
  return sharp(buf).ensureAlpha(1).toColourspace("srgb").resize(256, 256, { fit: "fill" })
    .raw().toBuffer();
}

/**
 * Process a tile with gradient-feathered blur/fade: instead of one constant
 * sigma per tile (visible tile-sized steps), compute ramp values at the
 * nearest and farthest corners and blend the two processed versions with a
 * linear gradient mask oriented away from the Berkeley core.
 */
async function processTileSmooth(buf, b, zoom = 15) {
  const orig = await rawRGBA(buf);
  const corners = [
    [b.minLat, b.minLon], [b.minLat, b.maxLon],
    [b.maxLat, b.minLon], [b.maxLat, b.maxLon],
  ];
  const ds = corners.map(([la, lo]) => pointDistKm(la, lo, CORE));
  const dNear = Math.min(...ds);
  const dFar = Math.max(...ds);
  const sLo = blurSigma(dNear), sHi = blurSigma(dFar);
  const bLo = bgBlend(dNear), bHi = bgBlend(dFar);

  // render one variant: theme+bg blend, then blur OR ink strokes
  const make = async (sigma, blend) => {
    const themed = applyTheme(Buffer.from(orig), Math.max(blend, 0));
    let out = sharp(themed, { raw: { width: 256, height: 256, channels: 4 } });
    if (sigma > 0.3) return out.blur(sigma).jpeg({ quality: 72, mozjpeg: true }).toBuffer();
    const baseJpeg = await out.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    const ink = await inkLayer(orig, zoom);
    return sharp(baseJpeg)
      .composite([{ input: ink, blend: "over" }, { input: PAPER_TEX, blend: "over" }])
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();
  };

  if (sHi - sLo < 0.6 && Math.abs(bHi - bLo) < 0.05) {
    return make(sLo, bLo);
  }

  // direction from tile center toward nearest point of core bbox
  const clat = (b.minLat + b.maxLat) / 2, clon = (b.minLon + b.maxLon) / 2;
  const px = Math.min(Math.max(clon, CORE.minLon), CORE.maxLon);
  const py = Math.min(Math.max(clat, CORE.minLat), CORE.maxLat);
  const kmPerLon = 111 * Math.cos((37.87 * Math.PI) / 180);
  let vx = (px - clon) * kmPerLon, vy = (py - clat) * 111;
  const vlen = Math.hypot(vx, vy) || 1;
  vx /= vlen; vy /= vlen;
  // gradient runs from the core-facing edge (alpha 0 → keep lo) to the far edge (alpha 1 → hi)
  const cx = 128, cy = 128, r = 190;
  const x1 = cx - vx * r, y1 = cy - vy * r, x2 = cx + vx * r, y2 = cy + vy * r;
  const mask = Buffer.from(
    `<svg width="256" height="256">
      <defs><linearGradient id="g" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" gradientUnits="userSpaceOnUse">
        <stop offset="0.1" stop-color="#fff" stop-opacity="0"/>
        <stop offset="0.9" stop-color="#fff" stop-opacity="1"/>
      </linearGradient></defs>
      <rect width="256" height="256" fill="url(#g)"/>
    </svg>`
  );
  const hiMasked = await make(sHi, bHi);
  const lo = await make(sLo, bLo);
  const hi = await sharp(hiMasked)
    .ensureAlpha()
    .composite([{ input: await sharp(mask).png().toBuffer(), blend: "dest-in" }])
    .png()
    .toBuffer();
  return sharp(lo)
    .composite([{ input: hi, blend: "over" }])
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer();
}

/** Decode + theme (sepia etc.) once → raw RGBA buffer. */
async function themeRaw(buf) {
  const img = sharp(buf).ensureAlpha(1).toColourspace("srgb").resize(256, 256, { fit: "fill" });
  const { data } = await img.raw().toBuffer({ resolveWithObject: true });
  applyTheme(data, 0);
  return data;
}

const INK = DARK ? [240, 231, 212] : [46, 33, 22]; // ink stroke colour
// Ink strength per zoom: thin 1px lines at low zoom need a bigger boost.
const EDGE_GAIN_BY_Z = { 11: 2.6, 12: 2.6, 13: 2.4, 14: 1.6, 15: 1.0, 16: 0.8 };
const EDGE_THRESHOLD = 6; // ignore faint noise

/** Detect edges (street lines, boundaries, labels) → RGBA ink layer.
 *  Laplacian computed manually — sharp's convolve clamps negative responses.
 *  Uses FIXED global levels (no per-tile normalisation) so every tile renders
 *  with identical tone and weight — no patchwork effect. */
async function inkLayer(raw, zoom = 15) {
  const W = 256;
  const lum = new Float32Array(W * W);
  for (let i = 0; i < W * W; i++)
    lum[i] = 0.299 * raw[i * 4] + 0.587 * raw[i * 4 + 1] + 0.114 * raw[i * 4 + 2];

  const edge = new Float32Array(W * W);
  for (let y = 1; y < W - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      edge[i] = Math.max(
        0,
        4 * lum[i] - lum[i - 1] - lum[i + 1] - lum[i - W] - lum[i + W]
      );
    }
  }

  const gain = (EDGE_GAIN_BY_Z[zoom] ?? 1) * (DARK ? 1.15 : 1);
  const ink = Buffer.alloc(W * W * 4);
  for (let i = 0; i < W * W; i++) {
    const v = edge[i];
    const a = v > EDGE_THRESHOLD ? Math.min(230, (v - EDGE_THRESHOLD) * gain * 3) : 0;
    ink[i * 4] = INK[0];
    ink[i * 4 + 1] = INK[1];
    ink[i * 4 + 2] = INK[2];
    ink[i * 4 + 3] = a;
  }
  return sharp(ink, { raw: { width: W, height: W, channels: 4 } })
    .png()
    .toBuffer();
}

/** Blur + fade a raw RGBA buffer and encode. */
function finishRaw(raw, sigma, blend) {
  return (async () => {
    let out = sharp(raw, { raw: { width: 256, height: 256, channels: 4 } });
    if (sigma > 0.3) {
      out = out.blur(sigma);
      return out.jpeg({ quality: 72, mozjpeg: true }).toBuffer();
    }
    // Sharp tile: paper base + synthetic ink strokes (architectural style)
    const baseJpeg = await out.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    const ink = await inkLayer(raw);
    return sharp(baseJpeg)
      .composite([{ input: ink, blend: "over" }, { input: PAPER_TEX, blend: "over" }])
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();
  })();
}
const CLAMP = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
function applyTheme(raw, blend) {
  for (let i = 0; i < raw.length; i += 4) {
    const r = raw[i], g = raw[i + 1], b = raw[i + 2];
    // sepia at strength 0.32
    let nr = (1 - SEP_STRENGTH) * r + SEP_STRENGTH * (SEP[0][0] * r + SEP[0][1] * g + SEP[0][2] * b);
    let ng = (1 - SEP_STRENGTH) * g + SEP_STRENGTH * (SEP[1][0] * r + SEP[1][1] * g + SEP[1][2] * b);
    let nb = (1 - SEP_STRENGTH) * b + SEP_STRENGTH * (SEP[2][0] * r + SEP[2][1] * g + SEP[2][2] * b);
    nr = CLAMP(nr); ng = CLAMP(ng); nb = CLAMP(nb);
    // saturate toward luma (0.55)
    const luma = LUMA[0] * nr + LUMA[1] * ng + LUMA[2] * nb;
    nr = CLAMP(SATURATION * nr + (1 - SATURATION) * luma);
    ng = CLAMP(SATURATION * ng + (1 - SATURATION) * luma);
    nb = CLAMP(SATURATION * nb + (1 - SATURATION) * luma);
    // brightness, contrast, then blend toward theme background
    nr = CLAMP(nr * BRIGHTNESS * CONTRAST + 128 * (1 - CONTRAST));
    ng = CLAMP(ng * BRIGHTNESS * CONTRAST + 128 * (1 - CONTRAST));
    nb = CLAMP(nb * BRIGHTNESS * CONTRAST + 128 * (1 - CONTRAST));
    raw[i] = nr + (BG_RGB[0] - nr) * blend;
    raw[i + 1] = ng + (BG_RGB[1] - ng) * blend;
    raw[i + 2] = nb + (BG_RGB[2] - nb) * blend;
  }
  return raw;
}

// ── Process one tile buffer ──
async function processTile(buf, { sigma, blend }) {
  const img = sharp(buf).ensureAlpha(1).toColourspace("srgb").resize(256, 256, { fit: "fill" });
  const { data } = await img.raw().toBuffer({ resolveWithObject: true });
  applyTheme(data, Math.max(blend, 0));
  let out = sharp(data, { raw: { width: 256, height: 256, channels: 4 } });
  if (sigma > 0.3) out = out.blur(sigma);
  // sharp tiles show jpeg artifacts; blurred ones hide them — tune quality
  const quality = sigma > 0.3 ? 72 : 88;
  if (sigma > 0.3) return out.jpeg({ quality, mozjpeg: true }).toBuffer();
  return out.composite([{ input: PAPER_TEX, blend: "over" }]).jpeg({ quality, mozjpeg: true }).toBuffer();
}

// ── Download with disk cache ──
async function fetchUrl(url, dest) {
  try {
    return await fs.readFile(dest);
  } catch {}
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "berkeley-tours-tile-baker/1.0 (dev)" },
      });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        await fs.mkdir(DL_CACHE, { recursive: true });
        await fs.writeFile(dest, buf);
        return buf;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  return null;
}

/** Base + labels overlay composited into one tile (labels optional per tile). */
async function downloadTile(z, x, y) {
  const base = await fetchUrl(TILE_URL_BASE(z, x, y), path.join(DL_CACHE, `b-${z}-${x}-${y}.jpg`));
  if (!base) return null;
  const ref = await fetchUrl(TILE_URL_REF(z, x, y), path.join(DL_CACHE, `r-${z}-${x}-${y}.png`));
  if (!ref) return base;
  // Reference layer is a transparent PNG with labels; blank tiles are possible
  const refMeta = await sharp(ref).metadata().catch(() => null);
  if (!refMeta || !refMeta.hasAlpha) return base;
  try {
    return await sharp(base)
      .composite([{ input: ref, blend: "over" }])
      .jpeg({ quality: 92 })
      .toBuffer();
  } catch {
    return base;
  }
}

// ── Enumerate tiles ──
// Zooms ≤ 13 are baked over a slightly larger rect than MID: at those zooms
// the viewport can extend a few hundred metres past MID's edge, and Apple's
// base map must never show through.
const VIEW_RECT = {
  minLat: MID.minLat - 0.08,
  maxLat: MID.maxLat + 0.08,
  minLon: MID.minLon - 0.1,
  maxLon: MID.maxLon + 0.1,
};
const intersectsRect = (t, r) => intersects(t, r);
function enumerate() {
  const real = []; // {z,x,y}
  for (let z = Z_MIN; z <= Z_MAX; z++) {
    const R = z <= REAL_Z_MAX ? VIEW_RECT : MID;
    const x0 = Math.floor(lonToX(R.minLon, z));
    const x1 = Math.floor(lonToX(R.maxLon, z));
    const y0 = Math.floor(latToY(R.maxLat, z));
    const y1 = Math.floor(latToY(R.minLat, z));
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const b = tileBounds(z, x, y);
        if (!intersectsRect(b, R)) continue;
        const isReal =
          z <= REAL_Z_MAX ||
          overlapsCore(b) ||
          // near ring (within ~1 tile of core at this zoom): keep real detail
          rectDistKm(b, CORE) < ((360 / 2 ** z) * 111 * Math.cos((37.87 * Math.PI) / 180)) * 1.2;
        if (isReal) real.push({ z, x, y });
      }
    }
  }
  return real;
}

async function main() {
  console.log("Enumerating tiles…");
  const realTiles = enumerate();
  console.log(`Real tiles to bake: ${realTiles.length}`);

  const processed = new Map(); // "z-x-y" -> Buffer
  let done = 0;
  const CONC = 4;
  let cursor = 0;
  async function worker() {
    while (cursor < realTiles.length) {
      const { z, x, y } = realTiles[cursor++];
      const key = `${z}-${x}-${y}`;
      const b = tileBounds(z, x, y);
      const dKm = rectDistKm(b, CORE);
      const raw = await downloadTile(z, x, y);
      if (!raw) {
        console.warn(`  ✗ missing tile ${key}`);
        continue;
      }
      try {
        processed.set(key, await processTileSmooth(raw, b, z));
      } catch (e) {
        console.warn(`  ✗ processing ${key}: ${e.message}`);
      }
      done++;
      if (done % 25 === 0) console.log(`  …${done}/${realTiles.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  console.log(`Real tiles processed: ${processed.size}`);

  // Virtual tiles (z14–16, beyond near ring): cut from processed z13 ancestors
  let virtualCount = 0;
  for (let z = REAL_Z_MAX + 1; z <= Z_MAX; z++) {
    const shift = z - REAL_Z_MAX;
    const x0 = Math.floor(lonToX(MID.minLon, z));
    const x1 = Math.floor(lonToX(MID.maxLon, z));
    const y0 = Math.floor(latToY(MID.maxLat, z));
    const y1 = Math.floor(latToY(MID.minLat, z));
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const key = `${z}-${x}-${y}`;
        if (processed.has(key)) continue; // near-ring real tile
        const b = tileBounds(z, x, y);
        if (!overlapsMid(b)) continue;
        const ax = x >> shift;
        const ay = y >> shift;
        const parent = processed.get(`${REAL_Z_MAX}-${ax}-${ay}`);
        if (!parent) {
          console.warn(`  ✗ no z13 ancestor for ${key}`);
          continue;
        }
        const size = 256 / 2 ** shift; // 128 / 64 / 32
        const left = (x - (ax << shift)) * size;
        const top = (y - (ay << shift)) * size;
        const data = await processTileSmooth(
          await sharp(parent)
            .extract({ left, top, width: size, height: size })
            .resize(256, 256, { kernel: "cubic" })
            .png()
            .toBuffer(),
          b,
          z
        );
        processed.set(key, data);
        virtualCount++;
      }
    }
    console.log(`  virtual tiles through z${z}: ${virtualCount}`);
  }

  // ── Pack container: every blob padded to a multiple of 3 bytes so runtime
  // can slice the base64 string without re-decoding (4 base64 chars = 3 bytes).
  console.log("Packing container…");
  const header = {};
  const blobs = [];
  let offset = 0;
  for (const [key, buf] of [...processed.entries()].sort()) {
    const pad = (3 - (buf.length % 3)) % 3;
    const padded = pad ? Buffer.concat([buf, Buffer.alloc(pad)]) : buf;
    header[key] = [offset, padded.length];
    blobs.push(padded);
    offset += padded.length;
  }
  const all = Buffer.concat(blobs);
  await fs.mkdir(path.dirname(OUT_BIN), { recursive: true });
  await fs.writeFile(OUT_BIN, all);
  await fs.writeFile(
    OUT_INDEX,
    JSON.stringify({ version: 3, tileCount: blobs.length, byteLength: all.length, tiles: header })
  );
  await fs.writeFile(
    OUT_MANIFEST,
    `// AUTO-GENERATED by scripts/bake_tiles.mjs — do not edit.
/** Berkeley core (sharp, fully themed). */
export const CORE_BBOX = { minLat: ${CORE.minLat}, maxLat: ${CORE.maxLat}, minLon: ${CORE.minLon}, maxLon: ${CORE.maxLon} } as const;
/** Themed-tile coverage: inside this rect tiles are baked; outside it the map fades to the theme background. */
export const MID_RECT = { minLat: ${MID.minLat.toFixed(5)}, maxLat: ${MID.maxLat.toFixed(5)}, minLon: ${MID.minLon.toFixed(5)}, maxLon: ${MID.maxLon.toFixed(5)} } as const;
export const TILES_VERSION = 3;
/** Berkeley city boundary (OSM relation, lat/lon ring) — drawn as an accent line. */
export const BERKELEY_BOUNDARY: [number, number][] = ${JSON.stringify(
    JSON.parse(await fs.readFile(new URL("../data/berkeley-boundary.json", import.meta.url), "utf8")).map(([lo, la]) => [la, lo])
  )};
`
  );
  const mb = (all.length / 1e6).toFixed(1);
  console.log(`✓ ${blobs.length} tiles → tiles.bin (${mb} MB) + tiles-index.json + tiles-manifest.generated.ts`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
