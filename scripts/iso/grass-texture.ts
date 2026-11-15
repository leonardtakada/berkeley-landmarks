/**
 * The lawns' painted grass, as seamless tiles for the city map (fill
 * patterns): fine tapered blades in the lawns' sea green — the same blades
 * three ways, so a gust passing over seems to bend the very grass beneath it:
 *
 *   grass       at rest, leaning a little east with the wind off the Bay
 *   grass-bent  pressed over in a gust, their pale sides and tips in the light
 *   grass-back  springing back after it, upright and past, in the shade
 *
 *   npx tsx scripts/iso/grass-texture.ts  → assets/map/grass*.png (@2x, @3x)
 */
import fs from "node:fs";
import { createCanvas } from "@napi-rs/canvas";

/** The tile's side, points. */
const SIZE = 96;
const BLADES = 150;

let seed = 7;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

/** The blades: where each grows, how long, how it leans of itself, and whether it's one that catches the light. */
const blades = Array.from({ length: BLADES }, () => {
  const r = rand();
  return {
    x: rand() * SIZE,
    y: rand() * SIZE,
    len: 5 + rand() * 9,
    lean: 0.15 + rand() * 0.35,
    curl: 0.1 + rand() * 0.25,
    width: 0.9 + rand() * 0.8,
    tone: r < 0.62 ? 0 : r < 0.88 ? 1 : 2,
  };
});
// Pale ones last, over the rest.
blades.sort((a, b) => a.tone - b.tone);

type Way = { name: string; lean: (b: (typeof blades)[number]) => number; curl: (b: (typeof blades)[number]) => number; reach: number; inks: string[] };
const WAYS: Way[] = [
  { name: "grass", lean: (b) => b.lean, curl: (b) => b.curl, reach: 1, inks: ["rgba(52,116,104,0.30)", "rgba(80,140,128,0.24)", "rgba(246,253,250,0.55)"] },
  // Pressed over: leaning far east and curled further, shorter to the eye, their pale sides showing.
  { name: "grass-bent", lean: (b) => 0.7 + b.lean * 0.5, curl: (b) => 0.35 + b.curl * 0.6, reach: 0.95, inks: ["rgba(72,138,124,0.42)", "rgba(150,204,188,0.70)", "rgba(255,255,252,0.92)"] },
  // Springing back: upright and a little past it, into the wind, darker.
  { name: "grass-back", lean: (b) => -0.25 + b.lean * 0.3, curl: (b) => -0.15, reach: 1.05, inks: ["rgba(40,100,92,0.38)", "rgba(62,124,112,0.30)", "rgba(200,232,222,0.40)"] },
];

async function main() {
  for (const way of WAYS) {
    for (const scale of [1, 2, 3]) {
      const px = SIZE * scale;
      const c = createCanvas(px, px);
      const ctx = c.getContext("2d");
      for (const b of blades) {
        const [lean, curl] = [way.lean(b), way.curl(b)];
        // Each blade where it grows and wrapped round the tile's edges, so the tiles meet unseen.
        for (const dx of [-SIZE, 0, SIZE]) {
          for (const dy of [-SIZE, 0, SIZE]) {
            const [x, y] = [(b.x + dx) * scale, (b.y + dy) * scale];
            const len = b.len * way.reach * scale;
            const w = (b.width * scale) / 2;
            // A tapered blade from its root, curving over at the tip.
            const [mx, my] = [x + Math.sin(lean) * len * 0.5, y - Math.cos(lean) * len * 0.5];
            const [tx, ty] = [x + Math.sin(lean + curl) * len, y - Math.cos(lean + curl) * len];
            ctx.beginPath();
            ctx.moveTo(x - w, y);
            ctx.quadraticCurveTo(mx - w * 0.6, my, tx, ty);
            ctx.quadraticCurveTo(mx + w * 0.6, my, x + w, y);
            ctx.closePath();
            ctx.fillStyle = way.inks[b.tone];
            ctx.fill();
          }
        }
      }
      const name = `${way.name}${scale === 1 ? "" : `@${scale}x`}.png`;
      fs.writeFileSync(`assets/map/${name}`, await c.encode("png"));
      console.log(`assets/map/${name}: ${px}px, ${(fs.statSync(`assets/map/${name}`).size / 1024).toFixed(0)} KB`);
    }
  }
}
main();
