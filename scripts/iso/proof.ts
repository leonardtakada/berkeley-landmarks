/**
 * A proof of a walk plate as the app will show it: the printed base with the
 * route, the stops' models, their flags and the street names drawn over it.
 *   npx tsx scripts/iso/proof.ts <tourId> <out.png>
 */
import fs from "node:fs";
import { createCanvas, loadImage, Path2D } from "@napi-rs/canvas";

async function main() {
  const [id, out] = process.argv.slice(2);
  const src = fs.readFileSync("components/walk-plates.generated.ts", "utf8");
  const data = JSON.parse(src.match(/^export const PLATE_DATA(?:: [^=]+)? = (.*);$/m)![1])[id];
  const base = await loadImage(`assets/plates/${id}.png`);
  const c = createCanvas(data.width, data.height);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#FDFAF2";
  ctx.fillRect(0, 0, data.width, data.height);
  ctx.drawImage(base, 0, 0);
  const route: [number, number][] = [];
  for (let i = 0; i < data.route.length; i += 2) route.push([data.route[i], data.route[i + 1]]);
  const ribbon = (pts: [number, number][]) => {
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = "#E4592B";
    ctx.lineWidth = 12;
    ctx.stroke();
  };
  // Route and models by depth, far first.
  const stops = [...data.stops].sort((a: any, b: any) => b.depth - a.depth);
  let from = 0;
  const idx = data.routeDepth.map((d: number, i: number) => [d, i]);
  for (const s of stops) {
    const behind = route.filter((_, i) => data.routeDepth[i] > s.depth);
    void behind;
  }
  void idx;
  void from;
  // (Proof: the whole ribbon, then models, then the dotted line over all.)
  ribbon(route);
  for (const s of stops) for (const [fill, d] of s.faces) {
    ctx.fillStyle = fill;
    ctx.fill(new Path2D(d));
    ctx.strokeStyle = fill;
    ctx.lineWidth = 0.8;
    ctx.stroke(new Path2D(d));
  }
  ctx.setLineDash([2, 12]);
  ctx.beginPath();
  route.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = "#FDFAF2";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.setLineDash([]);
  for (const l of data.labels) {
    ctx.save();
    const n1 = Math.hypot(l.ax, l.ay);
    const n2 = Math.hypot(l.bx, l.by);
    ctx.setTransform(l.ax / n1, l.ay / n1, -l.bx / n2, -l.by / n2, l.x, l.y);
    ctx.font = "500 20px Futura";
    ctx.fillStyle = "#6E6252";
    ctx.textAlign = "center";
    ctx.fillText(l.text, 0, 0);
    ctx.restore();
  }
  for (const s of data.stops) {
    const [ax, ay, x, y] = s.flag;
    ctx.strokeStyle = "#2B2A28";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.fillStyle = "#0B2E8C";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#FDFAF2";
    ctx.stroke();
    ctx.fillStyle = "#FDFAF2";
    ctx.font = "500 26px Futura";
    ctx.textAlign = "center";
    ctx.fillText(String(s.order), x, y + 9);
  }
  fs.writeFileSync(out, await c.encode("png"));
}
main();
