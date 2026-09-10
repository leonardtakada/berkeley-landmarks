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
const BG = "#F7F3EC"; // theme background (light)
const Z_MIN = 11;
const Z_MAX = 16;
const REAL_Z_MAX = 13; // beyond this, virtual tiles are cut from z13 parents
const TILE_URL = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
const DL_CACHE = path.join(import.meta.dirname, "..", ".tile-cache");
const OUT_BIN = path.join(import.meta.dirname, "..", "assets", "tiles.bin");
const OUT_INDEX = path.join(import.meta.dirname, "..", "assets", "tiles-index.json");
const OUT_MANIFEST = path.join(import.meta.dirname, "..", "lib", "tiles-manifest.generated.ts");

// ── Filter chain (CSS-equivalent matrix, folded into one 3x3) ──
const SEP = [
  [0.393, 0.769, 0.189],
  [0.349, 0.686, 0.168],
  [0.272, 0.534, 0.131],
];
const SEP_STRENGTH = 0.32;
const SATURATION = 0.55;
const BRIGHTNESS = 1.06;
const CONTRAST = 0.92;
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
const blurSigma = (dKm) => Math.min(7, Math.max(0, (dKm - 0.5) * 0.35));
const bgBlend = (dKm) => Math.min(0.8, Math.max(0, (dKm - 1.2) / 5));

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const BG_RGB = hexToRgb(BG);

/** Apply the CSS-equivalent filter chain to raw RGBA pixels, stage by stage
 *  (sepia → saturate → brightness → contrast → bg blend), clamping between
 *  stages exactly like CSS filters do. */
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
  return out.jpeg({ quality, mozjpeg: true }).toBuffer();
}

// ── Download with disk cache ──
async function downloadTile(z, x, y) {
  const f = path.join(DL_CACHE, `${z}-${x}-${y}.png`);
  try {
    return await fs.readFile(f);
  } catch {}
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(TILE_URL(z, x, y), {
        headers: { "User-Agent": "berkeley-tours-tile-baker/1.0 (dev)" },
      });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        await fs.mkdir(DL_CACHE, { recursive: true });
        await fs.writeFile(f, buf);
        return buf;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  return null;
}

// ── Enumerate tiles ──
function enumerate() {
  const real = []; // {z,x,y}
  for (let z = Z_MIN; z <= Z_MAX; z++) {
    const x0 = Math.floor(lonToX(MID.minLon, z));
    const x1 = Math.floor(lonToX(MID.maxLon, z));
    const y0 = Math.floor(latToY(MID.maxLat, z));
    const y1 = Math.floor(latToY(MID.minLat, z));
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const b = tileBounds(z, x, y);
        if (!overlapsMid(b)) continue;
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
        processed.set(key, await processTile(raw, { sigma: blurSigma(dKm), blend: bgBlend(dKm) }));
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
        const dKm = rectDistKm(b, CORE);
        const data = await processTile(
          await sharp(parent)
            .extract({ left, top, width: size, height: size })
            .resize(256, 256, { kernel: "cubic" })
            .png()
            .toBuffer(),
          { sigma: blurSigma(dKm), blend: bgBlend(dKm) }
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
    JSON.stringify({ version: 2, tileCount: blobs.length, byteLength: all.length, tiles: header })
  );
  await fs.writeFile(
    OUT_MANIFEST,
    `// AUTO-GENERATED by scripts/bake_tiles.mjs — do not edit.
/** Berkeley core (sharp, fully themed). */
export const CORE_BBOX = { minLat: ${CORE.minLat}, maxLat: ${CORE.maxLat}, minLon: ${CORE.minLon}, maxLon: ${CORE.maxLon} } as const;
/** Themed-tile coverage: inside this rect tiles are baked; outside it the map fades to the theme background. */
export const MID_RECT = { minLat: ${MID.minLat.toFixed(5)}, maxLat: ${MID.maxLat.toFixed(5)}, minLon: ${MID.minLon.toFixed(5)}, maxLon: ${MID.maxLon.toFixed(5)} } as const;
export const TILES_VERSION = 2;
`
  );
  const mb = (all.length / 1e6).toFixed(1);
  console.log(`✓ ${blobs.length} tiles → tiles.bin (${mb} MB) + tiles-index.json + tiles-manifest.generated.ts`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
