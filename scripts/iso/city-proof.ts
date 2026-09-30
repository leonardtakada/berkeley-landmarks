/** A proof of the whole city, isometric: npx tsx scripts/iso/city-proof.ts <out.png> [width] */
import fs from "node:fs";

import { toLocal } from "../../lib/iso";
import { canvas, fit, paint, INKS } from "./paint";
import { buildScene } from "./scene";

export const CITY_BOX = (() => {
  const sw = toLocal(37.846, -122.325);
  const ne = toLocal(37.908, -122.225);
  return { u0: Math.round(sw.u), v0: Math.round(sw.v), u1: Math.round(ne.u), v1: Math.round(ne.v) };
})();

async function main() {
  const [out, w = "3000"] = process.argv.slice(2);
  const t0 = Date.now();
  const { pieces } = await buildScene({ box: CITY_BOX, heightScale: 1.4, plate: { depth: 30 } });
  const width = parseInt(w, 10);
  const f0 = fit(pieces, width, width * 3, 30);
  let [ymin, ymax] = [Infinity, -Infinity];
  for (const p of pieces) {
    const pts = p.kind === "poly" ? p.rings.flat() : p.kind === "line" ? p.pts : [p.at];
    for (const q of pts) {
      const y = (f0.y0 - (q[0] + q[1]) * 0.5 - q[2]) * f0.scale;
      [ymin, ymax] = [Math.min(ymin, y), Math.max(ymax, y)];
    }
  }
  const height = Math.ceil(ymax - ymin + 60);
  const f = fit(pieces, width, height, 30);
  const { c, ctx } = canvas(width, height, INKS.leaf);
  paint(ctx, pieces, f);
  fs.writeFileSync(out, await c.encode("png"));
  console.log(`${pieces.length} pieces, ${width}×${height}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
if (process.argv[1]?.endsWith("city-proof.ts")) main();
