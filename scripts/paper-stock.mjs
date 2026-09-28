// Two tileable print textures, deliberately quiet:
//
//  paper-stock  — the tooth of smooth uncoated stock: a fine, even speckle
//                 with the faintest cloud, nothing you'd notice at a glance.
//  ink-laydown  — lighter specks where paper shows through a flat plane of
//                 ink, as in a lithographed colour block. Laid over fills.
//
//   node scripts/paper-stock.mjs → assets/textures/{paper-stock,ink-laydown}{,@2x,@3x}.png
import { createCanvas } from "@napi-rs/canvas";
import sharp from "sharp";

const PT = 256;
const SCALE = 3;
const W = PT * SCALE;

function prng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

async function save(canvas, base) {
  const png = canvas.toBuffer("image/png");
  await sharp(png).png({ compressionLevel: 9 }).toFile(`${base}@3x.png`);
  await sharp(png).resize(PT * 2, PT * 2).png({ compressionLevel: 9 }).toFile(`${base}@2x.png`);
  await sharp(png).resize(PT, PT).png({ compressionLevel: 9 }).toFile(`${base}.png`);
  console.log(`wrote ${base}{,@2x,@3x}.png`);
}

// --- paper tooth ------------------------------------------------------------
{
  const rand = prng(1930);
  const c = createCanvas(W, W);
  const g = c.getContext("2d");
  // A whisper of cloud, so large fields of cream aren't dead flat.
  for (let i = 0; i < 90; i++) {
    const x = rand() * W;
    const y = rand() * W;
    const r = (30 + rand() * 60) * SCALE;
    for (const dx of [-W, 0, W])
      for (const dy of [-W, 0, W]) {
        const grad = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        const a = 0.006 + rand() * 0.006;
        grad.addColorStop(0, `rgba(90,74,54,${a})`);
        grad.addColorStop(1, "rgba(90,74,54,0)");
        g.fillStyle = grad;
        g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
      }
  }
  // Fine, even tooth.
  for (let i = 0; i < 9000; i++) {
    const x = Math.floor(rand() * W);
    const y = Math.floor(rand() * W);
    g.fillStyle = rand() < 0.7 ? `rgba(70,58,44,${0.03 + rand() * 0.05})` : `rgba(255,253,245,${0.25 + rand() * 0.3})`;
    g.fillRect(x, y, SCALE * 0.7, SCALE * 0.7);
  }
  await save(c, "assets/textures/paper-stock");
}

// --- ink laydown ------------------------------------------------------------
{
  const rand = prng(1937);
  const c = createCanvas(W, W);
  const g = c.getContext("2d");
  // Mottle: slightly thinner patches of ink.
  for (let i = 0; i < 140; i++) {
    const x = rand() * W;
    const y = rand() * W;
    const r = (6 + rand() * 22) * SCALE;
    for (const dx of [-W, 0, W])
      for (const dy of [-W, 0, W]) {
        const grad = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        const a = 0.03 + rand() * 0.05;
        grad.addColorStop(0, `rgba(255,252,242,${a})`);
        grad.addColorStop(1, "rgba(255,252,242,0)");
        g.fillStyle = grad;
        g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
      }
  }
  // Pinholes: paper showing through.
  for (let i = 0; i < 5000; i++) {
    const x = rand() * W;
    const y = rand() * W;
    g.fillStyle = `rgba(255,252,242,${0.08 + rand() * 0.22})`;
    g.beginPath();
    g.arc(x, y, SCALE * (0.3 + rand() * 0.5), 0, Math.PI * 2);
    g.fill();
  }
  await save(c, "assets/textures/ink-laydown");
}
