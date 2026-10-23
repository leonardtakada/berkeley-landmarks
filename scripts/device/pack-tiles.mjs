/**
 * The free map's tiles for the guide's SD card (device/main/ui/mapview.c), from the app's
 * paper map (assets/tiles.bin, baked by scripts/bake_vector.mjs: 256 px JPEGs, zooms 11–16).
 *
 * The app's tiles are progressive JPEGs (mozjpeg's default), which the guide's decoder
 * (esp_new_jpeg) can't read, so each is saved again as a baseline JPEG. Writes, into the
 * folder given (scripts/narration/pack_guide.py passes the card bundle's):
 *   tiles.bin  the tiles end to end
 *   tiles.idx  "TIDX", a count, then for each tile, sorted by zoom, x and y, 16 bytes
 *              little-endian: zoom, x, y, 0 (u16 each), offset, length (u32 each)
 *
 * Run from the repo root: node scripts/device/pack-tiles.mjs narration-takes/guide
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const out = process.argv[2] ?? "narration-takes/guide";
const index = JSON.parse(fs.readFileSync("assets/tiles-index.json", "utf8")).tiles;
const source = fs.readFileSync("assets/tiles.bin");

const tiles = Object.entries(index)
  .map(([key, [off, len]]) => ({ zxy: key.split("-").map(Number), off, len }))
  .sort((a, b) => a.zxy[0] - b.zxy[0] || a.zxy[1] - b.zxy[1] || a.zxy[2] - b.zxy[2]);

const parts = [];
const idx = Buffer.alloc(8 + tiles.length * 16);
idx.write("TIDX", 0, "ascii");
idx.writeUInt32LE(tiles.length, 4);
let at = 0;
for (const [i, t] of tiles.entries()) {
  const baseline = await sharp(source.subarray(t.off, t.off + t.len))
    .jpeg({ quality: 70, progressive: false, mozjpeg: false })
    .toBuffer();
  const e = 8 + i * 16;
  idx.writeUInt16LE(t.zxy[0], e);
  idx.writeUInt16LE(t.zxy[1], e + 2);
  idx.writeUInt16LE(t.zxy[2], e + 4);
  idx.writeUInt16LE(0, e + 6);
  idx.writeUInt32LE(at, e + 8);
  idx.writeUInt32LE(baseline.length, e + 12);
  parts.push(baseline);
  at += baseline.length;
}
fs.writeFileSync(path.join(out, "tiles.bin"), Buffer.concat(parts));
fs.writeFileSync(path.join(out, "tiles.idx"), idx);
console.log(`${tiles.length} map tiles, baseline, ${(at / 1e6).toFixed(1)} MB → ${out}`);
