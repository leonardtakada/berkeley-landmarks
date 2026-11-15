/**
 * The catalogue's little isometric icons: each landmark's model (as the city
 * map and the walk plates build it, scripts/iso/models.ts — after its
 * photographs where it has them, else after its style) standing on a small
 * plinth cut from the city, a lawn for a house, the ground's tint for the
 * rest; a site that isn't a building (a rock, a park, a shellmound) as a
 * small vignette of one.
 *
 *   npx tsx scripts/iso/icons.ts  → assets/icons/<id>.png, components/landmark-icons.generated.ts
 */
import fs from "node:fs";
import sharp from "sharp";

import { landmarks, type Landmark } from "../../data/landmarks";
import { toLocal } from "../../lib/iso";
import { area, centroid, pointInRing, type Pt, type Ring } from "./geom";
import { LANDMARK_MODELS } from "./landmark-models";
import { landmarkPieces } from "./models";
import { canvas, fit, paint, PALETTE, SOFT_TREES } from "./paint";
import { buildings, treePieces, type Building, type P3, type Piece } from "./scene";

const OUT_DIR = "assets/icons";
const MODULE = "components/landmark-icons.generated.ts";
/** The icon's side in pixels: three times its 44 points. */
const SIZE = 132;
/** Heights drawn this many times true, as on the city map, so a house reads as one. */
const HS = 1.3;
/** Houses (and parks) stand on a lawn. */
const HOMELY = /victorian|queen anne|arts|crafts|shingle|colonial|storybook|tudor|bay (region|area)|cottage|bungalow|stick|eastlake|chalet|swiss|craftsman/i;
const SITE = /natural|landscape|prehistoric/i;
/** The icons' inks: the plates', the trees soft as on the city map. */
const ICON_PALETTE = { ...PALETTE, ...SOFT_TREES };

const quad = (pts: P3[], role: Piece["role"]): Piece => ({ kind: "poly", role, rings: [pts] });

/** A plinth under a plan: a slab of ground `pad` metres round it, its two faces toward the reader cut as a plate's are. */
function plinth(ring: Ring, pad: number, lawn: boolean): Piece[] {
  let [u0, v0, u1, v1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [u, v] of ring) [u0, v0, u1, v1] = [Math.min(u0, u), Math.min(v0, v), Math.max(u1, u), Math.max(v1, v)];
  [u0, v0, u1, v1] = [u0 - pad, v0 - pad, u1 + pad, v1 + pad];
  const t = Math.max(1.6, Math.max(u1 - u0, v1 - v0) * 0.07);
  return [
    // (The west face, then the south: both seen from the south-west.)
    quad([[u0, v1, 0], [u0, v0, 0], [u0, v0, -t], [u0, v1, -t]], "cutWest"),
    quad([[u0, v0, 0], [u1, v0, 0], [u1, v0, -t], [u0, v0, -t]], "cutSouth"),
    { kind: "poly", role: lawn ? "lawn" : "top", rings: [[[u0, v0, 0], [u1, v0, 0], [u1, v1, 0], [u0, v1, 0]]], level: 0 },
  ];
}

/** A boulder: a low, rounded, faceted block of blue-grey stone, lit on the west. */
function boulder(c: Pt, r: number, h: number): Piece[] {
  const ring: Ring = Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    const k = 0.8 + 0.2 * Math.sin(i * 2.3);
    return [c[0] + Math.cos(a) * r * k, c[1] + Math.sin(a) * r * k] as Pt;
  });
  const out: Piece[] = [];
  const top = ring.map(([u, v]) => [c[0] + (u - c[0]) * 0.55 + r * 0.08, c[1] + (v - c[1]) * 0.55 + r * 0.08] as Pt);
  for (let i = 0; i < ring.length; i++) {
    const [a, b] = [ring[i], ring[(i + 1) % ring.length]];
    const [ta, tb] = [top[i], top[(i + 1) % ring.length]];
    // Facing the reader (south-west), lit if it faces the west more.
    const [nx, ny] = [b[1] - a[1], -(b[0] - a[0])];
    if (nx + ny >= 0) continue;
    out.push(quad([[a[0], a[1], 0], [b[0], b[1], 0], [tb[0], tb[1], h], [ta[0], ta[1], h]], -nx > -ny ? "bldShade" : "wall"));
  }
  out.push({ kind: "poly", role: "path", rings: [top.map(([u, v]) => [u, v, h] as P3)] });
  return out;
}

/** A site that isn't a building, as a little scene of what's there. */
function vignette(l: Landmark): Piece[] {
  const tree = (u: number, v: number, k: number, kind: "park" | "wild", pick = 0.1) => treePieces(u, v, 0, k, kind, pick);
  const ground: Ring = [[-14, -14], [14, -14], [14, 14], [-14, 14]];
  if (/natural/i.test(l.style)) {
    // A rock, and an oak by it.
    return [...plinth(ground, 0, true), ...tree(7, 9, 0.6, "park"), ...boulder([-1, -1], 10, 4.5), ...boulder([-8, -9], 3.5, 2)];
  }
  if (/prehistoric/i.test(l.style)) {
    // A mound, and a rock on it.
    const mound: Ring = Array.from({ length: 10 }, (_, i) => [Math.cos((i / 10) * Math.PI * 2) * 10, Math.sin((i / 10) * Math.PI * 2) * 10] as Pt);
    const step: Piece[] = [];
    for (let i = 0; i < mound.length; i++) {
      const [a, b] = [mound[i], mound[(i + 1) % mound.length]];
      if (b[1] - a[1] - (b[0] - a[0]) >= 0) continue;
      step.push(quad([[a[0], a[1], 0], [b[0], b[1], 0], [b[0] * 0.75, b[1] * 0.75, 3.5], [a[0] * 0.75, a[1] * 0.75, 3.5]], "greenLit"));
    }
    step.push({ kind: "poly", role: "court", rings: [mound.map(([u, v]) => [u * 0.75, v * 0.75, 3.5] as P3)] });
    return [...plinth(ground, 0, true), ...tree(8, 9, 0.4, "wild", 0.5), ...step, ...boulder([0, 0], 3.5, 3).map((p) => lift(p, 3.5))];
  }
  if (/architecture/i.test(l.style) || /way|walk|path/i.test(l.name)) {
    // A way between trees.
    const road = quad([[-14, -3, 0.05], [14, -3, 0.05], [14, 3, 0.05], [-14, 3, 0.05]], "street");
    const row: Piece[] = [];
    for (const u of [10, 2, -6]) row.push(...tree(u, 7.5, 0.4, "park"));
    for (const u of [10, 2, -6]) row.push(...tree(u, -7.5, 0.4, "park"));
    return [...plinth(ground, 0, true), ...row.slice(0, 9), { ...road, kind: "poly" } as Piece, ...row.slice(9)];
  }
  // A park: a lawn and its trees.
  return [...plinth(ground, 0, true), ...tree(7, 8, 0.7, "park"), ...tree(-6, 6, 0.45, "park"), ...tree(4, -6, 0.3, "park", 0.2)];
}

/** A piece raised `dz` metres. */
function lift(p: Piece, dz: number): Piece {
  const up = ([u, v, z]: P3): P3 => [u, v, z + dz];
  if (p.kind === "poly") return { ...p, rings: p.rings.map((r) => r.map(up)) };
  if (p.kind === "line") return { ...p, pts: p.pts.map(up) };
  return { ...p, at: up(p.at) };
}

async function main() {
  const t0 = Date.now();
  const all = await buildings();
  const byLandmark = new Map(all.filter((b) => b.landmark).map((b) => [b.landmark!, b]));
  const byId = new Map(landmarks.map((l) => [l.id, l]));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const made: string[] = [];
  let borrowed = 0;
  let guessed = 0;
  for (const l of landmarks) {
    const { u, v } = toLocal(l.latitude, l.longitude);
    let model = l;
    let b = byLandmark.get(l.id);
    if (!b) {
      // The same building under another entry of the catalogue (its model with it, if it has one of its own)…
      const twin = [...byLandmark.entries()].find(([, o]) => pointInRing([u, v], o.ring) || Math.hypot(o.c[0] - u, o.c[1] - v) < 25);
      if (twin) {
        b = twin[1];
        const other = byId.get(twin[0]);
        if (other && !LANDMARK_MODELS[l.id] && LANDMARK_MODELS[other.id]) model = other;
        borrowed++;
      } else {
        // …or the building it stands in…
        b = all.find((o) => !o.landmark && (pointInRing([u, v], o.ring) || Math.hypot(o.c[0] - u, o.c[1] - v) < 10));
        // …or one of a size for its kind.
        if (!b) {
          const house = HOMELY.test(l.style) || l.category === "residential";
          const [w, d, h] = house ? [11, 15, 8] : [22, 28, 12];
          b = { id: -1, ring: [[u - w / 2, v - d / 2], [u + w / 2, v - d / 2], [u + w / 2, v + d / 2], [u - w / 2, v + d / 2]], c: [u, v], height: h, gable: null, landmark: l.id, base: 0 };
          guessed++;
        }
      }
    }
    let pieces: Piece[];
    if (SITE.test(l.style)) pieces = vignette(l);
    else {
      // The building at the origin, on the ground.
      const c = centroid(b.ring);
      const at = ([x, y]: Pt): Pt => [x - c[0], y - c[1]];
      const home: Building = { ...b, ring: b.ring.map(at), holes: b.holes?.map((h) => h.map(at)), c: [0, 0], base: 0, gable: b.gable && { ...b.gable, corners: b.gable.corners.map(at) } };
      const size = Math.sqrt(area(home.ring));
      pieces = [...plinth(home.ring, Math.max(2.5, size * 0.16), HOMELY.test(l.style) || l.category === "residential"), ...landmarkPieces(model, home, HS)];
    }
    // Too small for its windows and trim to read: left out.
    const f0 = fit(pieces, SIZE, SIZE, 5);
    if (f0.scale < 0.9) pieces = pieces.filter((p) => !/^lm(Window|Trim)/.test(p.role));
    const f = fit(pieces, SIZE, SIZE, 5);
    const { c, ctx } = canvas(SIZE, SIZE);
    paint(ctx, pieces, f, ICON_PALETTE);
    // (Flat inks: a palette of a few dozen colours keeps them small, edges and all.)
    fs.writeFileSync(`${OUT_DIR}/${l.id}.png`, await sharp(await c.encode("png")).png({ palette: true, colors: 64, quality: 95, effort: 10 }).toBuffer());
    made.push(l.id);
  }
  made.sort();
  fs.writeFileSync(
    MODULE,
    `// AUTO-GENERATED by scripts/iso/icons.ts — do not edit.\n` +
      `/* eslint-disable @typescript-eslint/no-require-imports */\n` +
      `import type { ImageRequireSource } from "react-native";\n\n` +
      `/** Each landmark's little isometric icon, by id. */\n` +
      `export const LANDMARK_ICONS: Record<string, ImageRequireSource> = {\n` +
      made.map((id) => `  ${JSON.stringify(id)}: require("../assets/icons/${id}.png"),`).join("\n") +
      `\n};\n`,
  );
  const bytes = made.reduce((s, id) => s + fs.statSync(`${OUT_DIR}/${id}.png`).size, 0);
  console.log(`${made.length} icons (${borrowed} from another entry's building, ${guessed} guessed), ${(bytes / 1e6).toFixed(2)} MB, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
main();
