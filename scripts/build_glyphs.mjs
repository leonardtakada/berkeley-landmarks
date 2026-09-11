/**
 * Build MapLibre glyph PBFs (SDF) from local TTFs → assets/map/glyphs/
 *   node scripts/build_glyphs.mjs
 *
 * Fonts: "Noto Serif Regular/Bold" (paper-aesthetic place labels) and
 * "Noto Sans Regular/Bold" (street labels). Ranges 0–8191 (latin).
 * Fully offline: glyphs are bundled with the app so labels render without
 * any network (no demotiles/maptiler dependency).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { GlobalFonts, createCanvas } from "@napi-rs/canvas";
import TinySDFmod from "@mapbox/tiny-sdf";
const TinySDF = TinySDFmod.default ?? TinySDFmod;

// minimal DOM shims for tiny-sdf
globalThis.document = { createElement: () => createCanvas(64, 64) };
Object.defineProperty(globalThis, "navigator", { value: { userAgent: "node" }, configurable: true });

// Only the ranges we need for en/latin map labels — keeps the bundle small
// (basic latin, latin-1 supplement, latin extended-A, general punctuation).
const RANGES = [
  [0, 255],
  [256, 511],
  [768, 1023],
  [8192, 8447],
];
const rangeWanted = (lo) => RANGES.some(([a, b]) => lo === a);
const FONTS = [
  { family: "Noto Serif Reg", file: "/tmp/fonts/NotoSerif-Regular.ttf", out: "Noto Serif Regular" },
  { family: "Noto Serif Bd", file: "/tmp/fonts/NotoSerif-Bold.ttf", out: "Noto Serif Bold" },
  { family: "Noto Sans Reg", file: "/tmp/fonts/NotoSans-Regular.ttf", out: "Noto Sans Regular" },
  { family: "Noto Sans Bd", file: "/tmp/fonts/NotoSans-Bold.ttf", out: "Noto Sans Bold" },
];
const OUT = path.join(import.meta.dirname, "..", "assets", "map", "glyphs");
const FONT_SIZE = 24, BUFFER = 3, RADIUS = 8, CUTOFF = 0.25;

// ── protobuf writers ──
const varintBytes = (n) => {
  if (n < 0 || !Number.isInteger(n)) throw new Error(`bad varint value ${n}`);
  const out = [];
  do {
    let b = n & 0x7f;
    n = Math.floor(n / 128);
    if (n > 0) b |= 0x80;
    out.push(b);
  } while (n > 0);
  return Buffer.from(out);
};
// zigzag encoding for sint32 fields
const zz = (n) => (n < 0 ? -n * 2 - 1 : n * 2);

function field(tag, payload) {
  const key = Buffer.from([(tag << 3) | (payload.length > 65535 ? 5 : 2)]);
  // length-delimited: tag byte(s) + varint length + payload
  const lenBytes = [];
  let n = payload.length;
  do {
    let b = n & 0x7f;
    n = Math.floor(n / 128);
    if (n > 0) b |= 0x80;
    lenBytes.push(b);
  } while (n > 0);
  return Buffer.concat([Buffer.from([(tag << 3) | 2]), Buffer.from(lenBytes), payload]);
}
function varintField(tag, value) {
  return Buffer.concat([Buffer.from([(tag << 3) | 0]), varintBytes(value)]);
}

/**
 * glyphs proto (mapbox glyph pbf):
 * message glyph { uint32 id=1; bytes bitmap=2; uint32 width=3; uint32 height=4; sint32 left=5; sint32 top=6; uint32 advance=7; }
 * message fontstack { string name=1; string range=2; repeated glyph glyphs=3; }
 * message glyphs { repeated fontstack stacks=1; }
 */
function encodeStack(name, range, glyphs) {
  const glyphMsgs = glyphs.map((g) =>
    Buffer.concat([
      varintField(1, g.id),
      g.bitmap && g.bitmap.length ? field(2, g.bitmap) : Buffer.alloc(0),
      varintField(3, g.width ?? 0),
      varintField(4, g.height ?? 0),
      varintField(5, zz(g.left ?? 0)),
      varintField(6, zz(g.top ?? 0)),
      varintField(7, g.advance),
    ])
  );
  const stack = Buffer.concat([
    field(1, Buffer.from(name, "utf8")),
    field(2, Buffer.from(range, "utf8")),
    ...glyphMsgs.map((m) => field(3, m)),
  ]);
  return field(1, stack); // glyphs.stacks[0]
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  let total = 0, count = 0;
  for (const f of FONTS) {
    const ok = GlobalFonts.registerFromPath(f.file, f.family);
    if (!ok) throw new Error(`failed to register ${f.file}`);
    const dir = path.join(OUT, f.out);
    await fs.mkdir(dir, { recursive: true });
    const sdf = new TinySDF(FONT_SIZE, BUFFER, RADIUS, CUTOFF, `"${f.family}"`);
    for (let lo = 0; lo < 8192; lo += 256) {
      if (!rangeWanted(lo)) continue;
      const glyphs = [];
      for (let cp = lo; cp < lo + 256; cp++) {
        if (cp === 0 || (cp >= 0xd800 && cp <= 0xdfff)) continue;
        const ch = String.fromCodePoint(cp);
        const g = sdf.draw(ch);
        if (!g) continue;
        // MapLibre glyph convention: width/height = INK dims, bitmap includes
        // `buffer` px padding on all sides, top = ink top relative to the
        // alphabetic baseline (negative = above), left = ink left of pen.
        const gw = g.glyphWidth, gh = g.glyphHeight;
        if (gw === 0 || gh === 0) {
          // advance-only glyph (space etc.): empty bitmap, zero ink metrics
          glyphs.push({ id: cp, bitmap: Buffer.alloc(0), width: 0, height: 0, forceZeroDims: true, advance: Math.round(g.glyphAdvance) });
          continue;
        }
        if (g.data.length < (gw + 6) * (gh + 6)) continue;
        const buf = Buffer.from(g.data.subarray(0, (gw + 6) * (gh + 6)));
        const gl = Math.round(g.glyphLeft), gt = -Math.round(g.glyphTop);
        const gm = { id: cp, bitmap: buf, advance: Math.round(g.glyphAdvance) };
        // omit zero-valued fields (proto2 convention; maplibre's generic reader
        // treats absent as 0 but present-0 breaks its bitmap size check)
        if (gw) gm.width = gw; if (gh) gm.height = gh; if (gl) gm.left = gl; if (gt) gm.top = gt;
        glyphs.push(gm);
      }
      if (glyphs.length === 0) continue;
      const pbf = encodeStack(f.out, `${lo}-${lo + 255}`, glyphs);
      await fs.writeFile(path.join(dir, `${lo}-${lo + 255}.pbf`), pbf);
      total += pbf.length;
      count++;
    }
    console.log(`✓ ${f.out}`);
  }
  console.log(`✓ ${count} glyph ranges → assets/map/glyphs (${(total / 1e6).toFixed(2)} MB)`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
