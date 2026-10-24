/**
 * The guide's map, isometric: the app's city map (scripts/iso/city.ts tiles the same
 * scene for MapLibre) painted for the guide's SD card, where device/main/ui/mapview.c
 * shows it. The guide can't draw vector tiles, so each of its four zooms is painted
 * here, street and district names included, and cut into 256 px baseline JPEGs.
 *
 * Writes, into the folder given (scripts/narration/pack_guide.py passes the card bundle's):
 *   iso.bin  the tiles end to end
 *   iso.idx  how to find a place on them, little-endian:
 *            "ISO1"
 *            f64 × 6  the origin's lat and lon, metres to a degree of lat and of lon (lib/iso.ts),
 *                     and the drawing's top-left corner x0, y0 (metres of the drawing)
 *            u32      zooms, then for each: f32 px to a metre of the drawing, u16 columns, u16 rows
 *            terraces (lib/iso-map.ts): f32 u0, v0, cell, metres a level, u16 columns, rows,
 *                     then a signed byte a cell, the level (−1 the Bay)
 *            u32      tiles, then for each, sorted by zoom, column and row, 16 bytes:
 *                     zoom, column, row, 0 (u16 each), offset, length (u32 each)
 *   A point at (x, y) on the drawing is at ((x − x0) × px, (y0 − y) × px) on its zoom's
 *   tiles. Tiles that would be only paper are left out.
 *
 *   npx tsx scripts/device/pack-iso.ts [out-dir]
 *   npx tsx scripts/device/pack-iso.ts --proof <lat> <lon> <zoom 0–3> <out.png>
 *       the 466 px circle the guide would show there, for judging the look
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";
import sharp from "sharp";

import { landmarks } from "../../data/landmarks";
import { iso, ORIGIN, toLocal } from "../../lib/iso";
import { CITY_BOX } from "../iso/city-proof";
import { centroid, clipLine, densify, type Pt } from "../iso/geom";
import { canvas, INKS, paint, PALETTE, type Frame } from "../iso/paint";
import { buildScene, levelAt, LEVEL, terrain, type P3, type Piece } from "../iso/scene";

/** Pixels to a metre of the drawing at each of the guide's zooms, far to near. */
const ZOOMS = [0.1875, 0.375, 0.75, 1.5];
const TILE = 256;
const CHUNK = 8; /* tiles a side painted at once */
const HEIGHT_SCALE = 1.4; /* as the app's city map */
const GRID = 20; /* the terraces' grid, metres, as the app's */
const SCREEN = 466;
const PAPER = INKS.leaf;
/** On the city map the trees are a softer blue, so the landmarks stand out from them (scripts/iso/city.ts). */
const TREE = "#6E84C2";
const SHORE_Z = -4;

const JOST = "node_modules/@expo-google-fonts/jost";
GlobalFonts.registerFromPath(`${JOST}/500Medium/Jost_500Medium.ttf`, "Jost Medium");
GlobalFonts.registerFromPath(`${JOST}/600SemiBold/Jost_600SemiBold.ttf`, "Jost SemiBold");

// ── The drawing ─────────────────────────────────────────────────────────────

type Box2 = [number, number, number, number]; /* xmin, ymin, xmax, ymax, metres of the drawing */

function pieceBox(p: Piece): Box2 {
  let [a, b, c, d] = [Infinity, Infinity, -Infinity, -Infinity];
  const see = (q: P3) => {
    const r = iso(q[0], q[1], q[2]);
    [a, b, c, d] = [Math.min(a, r.x), Math.min(b, r.y), Math.max(c, r.x), Math.max(d, r.y)];
  };
  if (p.kind === "poly") p.rings.forEach((r) => r.forEach(see));
  else if (p.kind === "line") p.pts.forEach(see);
  else see(p.at);
  const pad = p.kind === "line" ? p.width : p.kind === "dot" ? p.r : 0;
  return [a - pad, b - pad, c + pad, d + pad];
}

const TREES = new Set(["trunk", "crown"]);
const GROUND = new Set(["water", "wave", "shore", "top", "wall", "cutSouth", "cutWest", "cutLine", "street", "path"]);

/** What each zoom shows, as the app's style does at the zooms they match (z14 to z17). */
function shown(p: Piece, zoom: number): boolean {
  if (GROUND.has(p.role)) return true;
  if (TREES.has(p.role)) return zoom >= 1;
  return zoom >= 1 || p.role.startsWith("lm");
}

// ── Names ─────────────────────────────────────────────────────────────────────

interface Label {
  text: string;
  x: number; /* centre, px of the zoom */
  y: number;
  angle: number;
  w: number;
  font: string;
  size: number;
  spacing: number;
  color: string;
  halo: string;
}

const STREET_FONT = { font: "Jost Medium", size: 14, spacing: 1.6, color: INKS.sepia, halo: INKS.slip };
const PLACE_FONT = { font: "Jost SemiBold", size: 16, spacing: 3, color: INKS.blue, halo: PAPER };

const measure = canvas(10, 10).ctx;
function textWidth(text: string, f: { font: string; size: number; spacing: number }): number {
  measure.font = `${f.size}px "${f.font}"`;
  measure.letterSpacing = `${f.spacing}px`;
  return measure.measureText(text).width;
}

/** Names placed so they don't collide: each a row of discs along it, in a grid. */
class Placed {
  private grid = new Map<string, [number, number, number][]>();
  private discs(l: { x: number; y: number; angle: number; w: number; size: number }) {
    const r = l.size / 2 + 4;
    const n = Math.max(1, Math.ceil(l.w / r));
    const out: [number, number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const t = -l.w / 2 + (l.w * i) / n;
      out.push([l.x + Math.cos(l.angle) * t, l.y + Math.sin(l.angle) * t, r]);
    }
    return out;
  }
  fits(l: Parameters<Placed["discs"]>[0]): boolean {
    for (const [x, y, r] of this.discs(l)) {
      for (let gx = Math.floor((x - 40) / 40); gx <= Math.floor((x + 40) / 40); gx++) {
        for (let gy = Math.floor((y - 40) / 40); gy <= Math.floor((y + 40) / 40); gy++) {
          for (const [x2, y2, r2] of this.grid.get(`${gx},${gy}`) ?? []) if (Math.hypot(x - x2, y - y2) < r + r2) return false;
        }
      }
    }
    return true;
  }
  add(l: Parameters<Placed["discs"]>[0]) {
    for (const d of this.discs(l)) {
      const k = `${Math.floor(d[0] / 40)},${Math.floor(d[1] / 40)}`;
      this.grid.set(k, [...(this.grid.get(k) ?? []), d]);
    }
  }
}

type OsmWay = { tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] };
const NAMED = new Set(["primary", "secondary", "tertiary", "residential", "unclassified", "living_street"]);
const MAJOR = new Set(["primary", "secondary", "tertiary"]);

/** The names drawn at a zoom: the districts far out, the streets (main ones first) close in. */
function labels(zoom: number, toPx: (u: number, v: number, z: number) => Pt, zAt: (u: number, v: number) => number): Label[] {
  const placed = new Placed();
  const out: Label[] = [];
  const s = ZOOMS[zoom];

  if (zoom <= 1) {
    const districts = new Map<string, Pt[]>();
    for (const l of landmarks) {
      const d = l.neighborhood?.trim();
      if (!d || /^(various|unknown)$/i.test(d)) continue;
      const q = toLocal(l.latitude, l.longitude);
      districts.set(d, [...(districts.get(d) ?? []), [q.u, q.v]]);
    }
    const ranked = [...districts].filter(([, pts]) => pts.length >= 3).sort((a, b) => b[1].length - a[1].length);
    for (const [name, pts] of ranked) {
      const [u, v] = centroid(pts);
      const [x, y] = toPx(u, v, Math.max(0, zAt(u, v)) + 20);
      const text = name.toUpperCase();
      const l = { text, x, y, angle: 0, w: textWidth(text, PLACE_FONT), ...PLACE_FONT };
      if (placed.fits(l)) {
        placed.add(l);
        out.push(l);
      }
    }
  }

  if (zoom >= 1) {
    const osm: OsmWay[] = JSON.parse(fs.readFileSync("data/osm-streets.json", "utf8")).elements;
    // OSM cuts a street into a way a block or so long, too short to letter: joined up again by name.
    const byStreet = new Map<string, { major: boolean; lines: Pt[][] }>();
    for (const w of osm) {
      if (!w.tags?.name || !NAMED.has(w.tags.highway ?? "") || !w.geometry) continue;
      const major = MAJOR.has(w.tags.highway ?? "");
      if (zoom < 2 && !major) continue;
      const s0 = byStreet.get(w.tags.name) ?? { major: false, lines: [] };
      s0.major ||= major;
      s0.lines.push(w.geometry.map(({ lat, lon }) => toLocal(lat, lon)).map((q) => [q.u, q.v] as Pt));
      byStreet.set(w.tags.name, s0);
    }
    const ways = [...byStreet].flatMap(([name, st]) => joined(st.lines).map((line) => ({ name, major: st.major, line })));
    ways.sort((a, b) => Number(b.major) - Number(a.major) || length(b.line) - length(a.line));
    const byName = new Map<string, Pt[]>();
    /* Far enough apart that a name comes round about once a screen. */
    const repeat = SCREEN * 0.9;
    for (const w of ways) {
      const text = w.name.toUpperCase();
      const width = textWidth(text, STREET_FONT);
      for (const run of clipLine(w.line, CITY_BOX)) {
        const px = densify(run, 4 / s).map(([u, v]) => toPx(u, v, Math.max(0, zAt(u, v)) + 0.5));
        const want = width + 12;
        // Windows along the run where it's straight enough to letter, each tried in turn.
        for (let i = 0; i < px.length; i++) {
          let j = i, len = 0;
          while (j + 1 < px.length && len < want) {
            len += Math.hypot(px[j + 1][0] - px[j][0], px[j + 1][1] - px[j][1]);
            j++;
          }
          if (len < want) break;
          const [a, b] = [px[i], px[j]];
          const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (chord < want * 0.97) continue;
          let angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
          if (angle > Math.PI / 2) angle -= Math.PI;
          if (angle < -Math.PI / 2) angle += Math.PI;
          const x = (a[0] + b[0]) / 2, y = (a[1] + b[1]) / 2;
          const near = (byName.get(text) ?? []).some(([x2, y2]) => Math.hypot(x - x2, y - y2) < repeat);
          if (near) continue;
          const l = { text, x, y, angle, w: width, ...STREET_FONT };
          if (!placed.fits(l)) continue;
          placed.add(l);
          out.push(l);
          byName.set(text, [...(byName.get(text) ?? []), [x, y]]);
          i = j;
        }
      }
    }
  }
  return out;
}

function length(line: Pt[]): number {
  let n = 0;
  for (let i = 1; i < line.length; i++) n += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
  return n;
}

/** Lines that meet end to end, joined into the longest runs they make. */
function joined(lines: Pt[][]): Pt[][] {
  const near = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 2;
  const pool = lines.map((l) => [...l]);
  const out: Pt[][] = [];
  while (pool.length) {
    let chain = pool.pop()!;
    for (let grown = true; grown; ) {
      grown = false;
      for (let i = 0; i < pool.length; i++) {
        const l = pool[i];
        const [s, e] = [chain[0], chain[chain.length - 1]];
        if (near(e, l[0])) chain = [...chain, ...l.slice(1)];
        else if (near(e, l[l.length - 1])) chain = [...chain, ...l.slice(0, -1).reverse()];
        else if (near(s, l[l.length - 1])) chain = [...l.slice(0, -1), ...chain];
        else if (near(s, l[0])) chain = [...l.slice(1).reverse(), ...chain];
        else continue;
        pool.splice(i, 1);
        grown = true;
        break;
      }
    }
    out.push(chain);
  }
  return out;
}

function letter(ctx: SKRSContext2D, l: Label, dx: number, dy: number) {
  ctx.save();
  ctx.translate(l.x - dx, l.y - dy);
  ctx.rotate(l.angle);
  ctx.font = `${l.size}px "${l.font}"`;
  ctx.letterSpacing = `${l.spacing}px`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = l.halo;
  ctx.lineWidth = 4;
  ctx.strokeText(l.text, 0, 0);
  ctx.fillStyle = l.color;
  ctx.fillText(l.text, 0, 0);
  ctx.restore();
}

// ── Painting ─────────────────────────────────────────────────────────────────

async function main() {
  const proof = process.argv[2] === "--proof";
  const out = proof ? "" : process.argv[2] ?? "narration-takes/guide";
  const t0 = Date.now();
  const { pieces, zAt } = await buildScene({ box: CITY_BOX, heightScale: HEIGHT_SCALE, plate: { depth: 30 } });
  const boxes = pieces.map(pieceBox);
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [a, b, c, d] of boxes) [x0, y0, x1, y1] = [Math.min(x0, a), Math.min(y0, b), Math.max(x1, c), Math.max(y1, d)];
  [x0, y1] = [Math.floor(x0) - 10, Math.ceil(y1) + 10]; /* the top-left corner, with a margin */
  console.log(`scene: ${pieces.length} pieces, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const palette = { ...PALETTE, trunk: TREE, crown: TREE };

  /** Paints the zoom's drawing from px (left, top), w × h, onto a canvas of paper. */
  const paintAt = (zoom: number, names: Label[], left: number, top: number, w: number, h: number) => {
    const s = ZOOMS[zoom];
    const { c, ctx } = canvas(w, h, PAPER);
    const f: Frame = { scale: s, x0: x0 + left / s, y0: y1 - top / s };
    const [bx0, bx1, by0, by1] = [f.x0, f.x0 + w / s, f.y0 - h / s, f.y0];
    const these = pieces.filter((p, i) => {
      const [a, b, cc, d] = boxes[i];
      return cc >= bx0 && a <= bx1 && d >= by0 && b <= by1 && shown(p, zoom);
    });
    paint(ctx, these, f, palette);
    for (const l of names) {
      const r = l.w / 2 + 12;
      if (l.x + r < left || l.x - r > left + w || l.y + r < top || l.y - r > top + h) continue;
      letter(ctx, l, left, top);
    }
    return { c, ctx };
  };
  const toPxAt = (zoom: number) => (u: number, v: number, z: number): Pt => {
    const q = iso(u, v, z);
    return [(q.x - x0) * ZOOMS[zoom], (y1 - q.y) * ZOOMS[zoom]];
  };

  if (proof) {
    const [lat, lon, zs, file] = process.argv.slice(3);
    const zoom = Number(zs);
    const q = toLocal(Number(lat), Number(lon));
    const [cx, cy] = toPxAt(zoom)(q.u, q.v, Math.max(0, zAt(q.u, q.v)));
    const names = labels(zoom, toPxAt(zoom), zAt);
    const { c, ctx } = paintAt(zoom, names, Math.round(cx - SCREEN / 2), Math.round(cy - SCREEN / 2), SCREEN, SCREEN);
    // The guide's round glass.
    ctx.globalCompositeOperation = "destination-in";
    ctx.beginPath();
    ctx.arc(SCREEN / 2, SCREEN / 2, SCREEN / 2, 0, Math.PI * 2);
    ctx.fill();
    fs.writeFileSync(file, await c.encode("png"));
    console.log(`proof → ${file}`);
    return;
  }

  // The tiles, a chunk at a time.
  const entries: { zoom: number; col: number; row: number; off: number; len: number }[] = [];
  const parts: Buffer[] = [];
  const seen = new Map<string, { off: number; len: number }>();
  const grid: { scale: number; cols: number; rows: number }[] = [];
  let at = 0;
  const paper = Buffer.from(PAPER.slice(1), "hex");
  for (let zoom = 0; zoom < ZOOMS.length; zoom++) {
    const s = ZOOMS[zoom];
    const cols = Math.ceil(((x1 - x0) * s) / TILE), rows = Math.ceil(((y1 - y0) * s) / TILE);
    grid.push({ scale: s, cols, rows });
    const names = labels(zoom, toPxAt(zoom), zAt);
    let kept = 0;
    for (let cr = 0; cr < rows; cr += CHUNK) {
      for (let cc = 0; cc < cols; cc += CHUNK) {
        const w = Math.min(CHUNK, cols - cc) * TILE, h = Math.min(CHUNK, rows - cr) * TILE;
        const { ctx } = paintAt(zoom, names, cc * TILE, cr * TILE, w, h);
        for (let r = 0; r < h / TILE; r++) {
          for (let c = 0; c < w / TILE; c++) {
            const img = ctx.getImageData(c * TILE, r * TILE, TILE, TILE).data;
            let blank = true;
            for (let i = 0; i < img.length && blank; i += 4) {
              blank = img[i] === paper[0] && img[i + 1] === paper[1] && img[i + 2] === paper[2];
            }
            if (blank) continue;
            const jpeg = await sharp(Buffer.from(img.buffer), { raw: { width: TILE, height: TILE, channels: 4 } })
              .removeAlpha()
              .jpeg({ quality: 85, chromaSubsampling: "4:4:4", progressive: false, mozjpeg: false })
              .toBuffer();
            const hash = crypto.createHash("sha1").update(jpeg).digest("hex");
            let where = seen.get(hash);
            if (!where) {
              where = { off: at, len: jpeg.length };
              seen.set(hash, where);
              parts.push(jpeg);
              at += jpeg.length;
            }
            entries.push({ zoom, col: cc + c, row: cr + r, ...where });
            kept++;
          }
        }
      }
    }
    console.log(`  zoom ${zoom} (${s} px/m): ${cols}×${rows}, ${kept} tiles, ${names.length} names, ${(at / 1e6).toFixed(1)} MB so far`);
  }
  entries.sort((a, b) => a.zoom - b.zoom || a.col - b.col || a.row - b.row);

  // The terraces, as the app lifts its pins onto them.
  const t = await terrain();
  const box = CITY_BOX;
  const tcols = Math.ceil((box.u1 - box.u0) / GRID) + 1, trows = Math.ceil((box.v1 - box.v0) / GRID) + 1;
  const levels = Buffer.alloc(tcols * trows);
  for (let r = 0; r < trows; r++) for (let c = 0; c < tcols; c++) levels.writeInt8(levelAt(t, box.u0 + c * GRID, box.v0 + r * GRID), r * tcols + c);

  const head = Buffer.alloc(4 + 48 + 4 + grid.length * 8 + 24);
  let o = head.write("ISO1", 0, "ascii");
  const m = toLocal(ORIGIN.lat + 1, ORIGIN.lon + 1); /* metres to a degree */
  for (const v of [ORIGIN.lat, ORIGIN.lon, m.v, m.u, x0, y1]) o = head.writeDoubleLE(v, o);
  o = head.writeUInt32LE(grid.length, o);
  for (const g of grid) {
    o = head.writeFloatLE(g.scale, o);
    o = head.writeUInt16LE(g.cols, o);
    o = head.writeUInt16LE(g.rows, o);
  }
  for (const v of [box.u0, box.v0, GRID, LEVEL, SHORE_Z]) o = head.writeFloatLE(v, o);
  o = head.writeUInt16LE(tcols, o);
  o = head.writeUInt16LE(trows, o);
  const idx = Buffer.alloc(4 + entries.length * 16);
  idx.writeUInt32LE(entries.length, 0);
  entries.forEach((e, i) => {
    const b = 4 + i * 16;
    idx.writeUInt16LE(e.zoom, b);
    idx.writeUInt16LE(e.col, b + 2);
    idx.writeUInt16LE(e.row, b + 4);
    idx.writeUInt16LE(0, b + 6);
    idx.writeUInt32LE(e.off, b + 8);
    idx.writeUInt32LE(e.len, b + 12);
  });
  fs.writeFileSync(path.join(out, "iso.bin"), Buffer.concat(parts));
  fs.writeFileSync(path.join(out, "iso.idx"), Buffer.concat([head.subarray(0, o), levels, idx]));
  console.log(`${entries.length} tiles (${parts.length} different), ${(at / 1e6).toFixed(1)} MB → ${out}, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
main();
