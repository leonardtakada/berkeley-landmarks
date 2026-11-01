/**
 * The walks' buildings as the guide shows them on the way to each stop: the
 * app's photograph of the building, printed as the app prints its plates
 * (components/tipped-in-plate.tsx: a one-ink duotone, shadows in the logo
 * blue, highlights in cream), round, on a cream band lettered at its foot with
 * who took it and on what licence. A stop the app has no photograph of gets
 * the app's drawn plate (lib/building-plate.ts), lettered as an impression,
 * since it's not a likeness. The guide lays the outer ring and the vermilion
 * second plate behind it (device/main/ui/prints.c).
 *
 * Writes pr<N>.jpg (landmark lm-N), 160 px baseline JPEGs, into the folder
 * given (scripts/narration/pack_guide.py passes the card bundle's).
 *
 *   npx tsx scripts/device/pack-prints.ts [out-dir]
 */
import fs from "node:fs";
import path from "node:path";
import { createCanvas, GlobalFonts, ImageData } from "@napi-rs/canvas";
import sharp from "sharp";

import { landmarks } from "../../data/landmarks";
import { tours } from "../../data/tours";
import { buildingPlateSvg } from "../../lib/building-plate";

const SIZE = 160; /* the print on the guide, px */
const PHOTO_R = 64; /* the photograph's radius; the band round it carries the credit */
const LETTER_R = 75.5; /* the credit's baseline, hanging inside the band */
const ARC = (165 * Math.PI) / 180; /* how far round the foot the credit may run */
const BLUE = [11, 46, 140];
const SLIP = [253, 250, 242];
const SEPIA = "#7A6A58";

const JOST = "node_modules/@expo-google-fonts/jost";
GlobalFonts.registerFromPath(`${JOST}/500Medium/Jost_500Medium.ttf`, "Jost Medium");

const out = process.argv[2] ?? "narration-takes/guide";
fs.mkdirSync(out, { recursive: true });

/** The app's bundled photographs (lib/photos.generated.ts): URL → file and credit. */
const photos = new Map<string, { file: string; credit: string }>();
for (const m of fs.readFileSync("lib/photos.generated.ts", "utf8").matchAll(/^\s*"([^"]+)": \{ image: require\("\.\.\/(assets\/photos\/[^"]+)"\), credit: "([^"]*)" \}/gm)) {
  photos.set(m[1], { file: m[2], credit: m[3] });
}

/** The photograph, square, drained of colour and printed in the blue on cream. */
async function duotone(file: string, d: number): Promise<Buffer> {
  const { data } = await sharp(file).resize(d, d, { fit: "cover" }).greyscale().normalise().raw().toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(d * d * 4);
  for (let i = 0; i < d * d; i++) {
    const l = data[i] / 255;
    // As the app's layers: screen in the blue, then multiply the cream.
    for (let c = 0; c < 3; c++) rgba[i * 4 + c] = Math.round(SLIP[c] * (1 - (1 - l) * (1 - BLUE[c] / 255)));
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

/** The app's drawn plate, its middle square: the building stands in the middle of it. */
async function drawnPlate(svg: string, d: number): Promise<Buffer> {
  const png = await sharp(Buffer.from(svg), { density: 288 }).png().toBuffer();
  const m = await sharp(png).metadata();
  const side = m.height!;
  return sharp(png)
    .extract({ left: Math.round((m.width! - side) / 2), top: 0, width: side, height: side })
    .resize(d, d)
    .ensureAlpha()
    .raw()
    .toBuffer();
}

/** Lettering round the foot of the circle, reading left to right, its tops towards the middle. */
function footLettering(ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>, text: string) {
  let size = 10.5;
  const spacing = () => size * 0.12;
  const width = () => [...text].reduce((w, ch) => w + ctx.measureText(ch).width + spacing(), -spacing());
  ctx.font = `${size}px "Jost Medium"`;
  while (width() / LETTER_R > ARC && size > 8.5) {
    size -= 0.5;
    ctx.font = `${size}px "Jost Medium"`;
  }
  while (width() / LETTER_R > ARC) text = text.slice(0, -2) + "…";
  // From the left of the foot round to the right: anticlockwise on screen, which is decreasing angle.
  let a = Math.PI / 2 + width() / LETTER_R / 2;
  ctx.fillStyle = SEPIA;
  ctx.textBaseline = "alphabetic";
  for (const ch of text) {
    const w = ctx.measureText(ch).width;
    const mid = a - w / 2 / LETTER_R;
    ctx.save();
    ctx.translate(SIZE / 2 + LETTER_R * Math.cos(mid), SIZE / 2 + LETTER_R * Math.sin(mid));
    ctx.rotate(mid - Math.PI / 2);
    ctx.fillText(ch, -w / 2, 0);
    ctx.restore();
    a -= (w + spacing()) / LETTER_R;
  }
}

async function print(pixels: Buffer, lettering: string): Promise<Buffer> {
  const c = createCanvas(SIZE, SIZE);
  const ctx = c.getContext("2d");
  ctx.fillStyle = `rgb(${SLIP.join(",")})`;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const d = PHOTO_R * 2;
  const pic = createCanvas(d, d);
  pic.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(pixels), d, d), 0, 0);
  ctx.save();
  ctx.beginPath();
  ctx.arc(SIZE / 2, SIZE / 2, PHOTO_R, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(pic, SIZE / 2 - PHOTO_R, SIZE / 2 - PHOTO_R);
  ctx.restore();
  ctx.strokeStyle = `rgb(${BLUE.join(",")})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(SIZE / 2, SIZE / 2, PHOTO_R + 0.75, 0, Math.PI * 2);
  ctx.stroke();
  footLettering(ctx, lettering.toUpperCase());
  const rgba = Buffer.from(ctx.getImageData(0, 0, SIZE, SIZE).data);
  return sharp(rgba, { raw: { width: SIZE, height: SIZE, channels: 4 } })
    .removeAlpha()
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4", progressive: false, mozjpeg: false })
    .toBuffer();
}

async function main() {
  const stops = new Set(tours.flatMap((t) => t.stops.map((s) => s.landmarkId)));
  let photographed = 0, drawn = 0, bytes = 0;
  for (const id of stops) {
    const l = landmarks.find((x) => x.id === id)!;
    const lm = Number(id.replace("lm-", ""));
    if (!lm) continue;
    const photo = l.photoUrl ? photos.get(l.photoUrl) : undefined;
    let jpeg: Buffer;
    if (photo) {
      const credit = photo.credit.replace(/\s*·\s*Wikimedia Commons$/, "");
      jpeg = await print(await duotone(photo.file, PHOTO_R * 2), credit);
      photographed++;
    } else {
      const { svg, caption } = buildingPlateSvg({ id: l.id, style: l.style ?? "", category: l.category ?? "" });
      jpeg = await print(await drawnPlate(svg, PHOTO_R * 2), caption);
      drawn++;
    }
    fs.writeFileSync(path.join(out, `pr${lm}.jpg`), jpeg);
    bytes += jpeg.length;
  }
  console.log(`prints: ${photographed} photographed, ${drawn} drawn, ${(bytes / 1024).toFixed(0)} KB → ${out}`);
}

main();
