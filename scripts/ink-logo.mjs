// Lift the Campanile device off its blue board so the cover can print it
// straight onto its own flat blue. Both inks of the device (cream and
// orange) are strong in red while the board is not, so coverage comes from
// the red channel alone; the board's paper flecks and mottling fall below
// the floor and drop out. Edge colour is un-mixed from the board so nothing
// halos. The blue grid lines in the base become transparent and show the
// cover's blue through them, exactly as in the original.
//
//   node scripts/ink-logo.mjs  →  assets/images/logo-on-blue.png
import sharp from "sharp";

const SRC = "assets/images/logo-blue.jpg";
const OUT = "assets/images/logo-on-blue.png";
const BOARD = [9, 44, 138];
const INK_R = 232; // red channel of both the cream and the orange ink
const FLOOR = 0.3; // coverage below this is board texture, not ink

const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const C = info.channels;

const rgba = Buffer.alloc(W * H * 4);
const cols = new Array(W).fill(0);
const rows = new Array(H).fill(0);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const p = (y * W + x) * C;
    const q = (y * W + x) * 4;
    const a = Math.max(0, Math.min(1, (data[p] - BOARD[0]) / (INK_R - BOARD[0])));
    const alpha = Math.max(0, Math.min(1, (a - FLOOR) / (1 - FLOOR)));
    for (let c = 0; c < 3; c++) {
      const v = data[p + c];
      const ref = BOARD[c];
      rgba[q + c] = a > 0.02 ? Math.max(0, Math.min(255, Math.round((v - (1 - a) * ref) / a))) : 0;
    }
    rgba[q + 3] = Math.round(alpha * 255);
    if (alpha > 0.5) {
      cols[x]++;
      rows[y]++;
    }
  }
}

// Bounds of the artwork: rows / columns with a real run of ink in them.
const minX = cols.findIndex((n) => n > 4);
const maxX = W - 1 - [...cols].reverse().findIndex((n) => n > 4);
const minY = rows.findIndex((n) => n > 4);
const maxY = H - 1 - [...rows].reverse().findIndex((n) => n > 4);
// Clear any isolated specks outside the artwork's bounds.
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++)
    if (x < minX || x > maxX || y < minY || y > maxY) rgba[(y * W + x) * 4 + 3] = 0;

const pad = 8;
const left = Math.max(0, minX - pad);
const top = Math.max(0, minY - pad);
const crop = {
  left,
  top,
  width: Math.min(W, maxX + pad) - left,
  height: Math.min(H, maxY + pad) - top,
};
await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
  .extract(crop)
  .png({ compressionLevel: 9 })
  .toFile(OUT);
console.log(`wrote ${OUT} (${crop.width}x${crop.height})`);
