/**
 * A proof of the isometric scene, for judging the look.
 *   npx tsx scripts/iso/preview.ts <out.png> [tourId | u0,v0,u1,v1] [width] [heightScale]
 */
import fs from "node:fs";

import { tours } from "../../data/tours";
import { toLocal } from "../../lib/iso";
import { canvas, fit, paint, INKS } from "./paint";
import { buildScene } from "./scene";

async function main() {
  const [out, what = "tour-campus", w = "1400", hs = "1"] = process.argv.slice(2);
  let box;
  const tour = tours.find((t) => t.id === what);
  if (tour) {
    const pts = tour.routeCoordinates.map((p) => toLocal(p.latitude, p.longitude));
    const us = pts.map((p) => p.u);
    const vs = pts.map((p) => p.v);
    const m = 220;
    box = { u0: Math.min(...us) - m, v0: Math.min(...vs) - m, u1: Math.max(...us) + m, v1: Math.max(...vs) + m };
  } else {
    const [u0, v0, u1, v1] = what.split(",").map(Number);
    box = { u0, v0, u1, v1 };
  }
  const t0 = Date.now();
  const { pieces } = await buildScene({ box, heightScale: parseFloat(hs), plate: { depth: 18 } });
  const width = parseInt(w, 10);
  const probe = fit(pieces, width, 10_000);
  // Height to suit the drawing.
  let [ymin, ymax] = [Infinity, -Infinity];
  void probe;
  const f0 = fit(pieces, width, width * 3, 20);
  for (const p of pieces) {
    const pts = p.kind === "poly" ? p.rings.flat() : p.kind === "line" ? p.pts : [p.at];
    for (const q of pts) {
      const y = (f0.y0 - (q[0] + q[1]) * 0.5 - q[2]) * f0.scale;
      [ymin, ymax] = [Math.min(ymin, y), Math.max(ymax, y)];
    }
  }
  const height = Math.ceil(ymax - ymin + 40);
  const f = fit(pieces, width, height, 20);
  const { c, ctx } = canvas(width, height, INKS.leaf);
  paint(ctx, pieces, f);
  fs.writeFileSync(out, await c.encode("png"));
  console.log(`${pieces.length} pieces, ${width}×${height}, ${((Date.now() - t0) / 1000).toFixed(1)}s, ${f.scale.toFixed(3)} px/m`);
}
main();
