/**
 * The pocket guide's pictures, baked for the board.
 *
 * Everything is the app's own art: the walk labels (components/print-art
 * .generated.ts), the architects' portraits (scripts/portraits/*.svg), the
 * Campanile device and the walk plates. Each picture is split into the parts
 * that move, so LVGL slides, squashes and swaps small layers instead of
 * redrawing the screen (docs/tour-device-plan.md, "Motion and the companion"):
 *
 *   portraits  body · head · eye · brow · mouth · smile, filling the screen
 *              on the portrait's own ground colour
 *   scenes     the walk's label scene, full-bleed in the 466 px circle, with
 *              its sky (sun or moon) and clouds as separate layers
 *
 * Writes raw pixel files (RGB565, or RGB565A8 where there's alpha) to
 * device/main/art/, embedded by the build, plus art.c/art.h describing them.
 *
 * Run from the repo root: node scripts/device/build-art.mjs
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const OUT = "device/main/art";
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const assets = []; // { name, w, h, cf, bytes }
const decls = [];

// ---------------------------------------------------------------------------
// Pixels → LVGL formats
// ---------------------------------------------------------------------------

function rgb565(r, g, b) {
  return ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3);
}

/** Writes RGBA pixels as RGB565 (opaque) or RGB565A8 (colour plane, then alpha plane). */
function writeImage(name, { data, info }, alpha) {
  const { width: w, height: h } = info;
  const ch = info.channels;
  const colour = Buffer.alloc(w * h * 2);
  const a8 = alpha ? Buffer.alloc(w * h) : null;
  for (let i = 0; i < w * h; i++) {
    const r = data[i * ch], g = data[i * ch + 1], b = data[i * ch + 2];
    colour.writeUInt16LE(rgb565(r, g, b), i * 2);
    if (a8) a8[i] = ch === 4 ? data[i * ch + 3] : 255;
  }
  const bytes = a8 ? Buffer.concat([colour, a8]) : colour;
  fs.writeFileSync(path.join(OUT, `${name}.bin`), bytes);
  assets.push({ name, w, h, cf: a8 ? "LV_COLOR_FORMAT_RGB565A8" : "LV_COLOR_FORMAT_RGB565", bytes: bytes.length });
  return { w, h };
}

/** Renders SVG text to RGBA at its own width/height. */
async function render(svg) {
  return sharp(Buffer.from(svg), { density: 72 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

/** Crops transparent margins; returns the cropped pixels and where they sat. */
function cropAlpha({ data, info }, pad = 2) {
  const { width: w, height: h, channels: ch } = info;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * ch + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const cw = x1 - x0 + 1, chh = y1 - y0 + 1;
  const out = Buffer.alloc(cw * chh * 4);
  for (let y = 0; y < chh; y++) data.copy(out, y * cw * 4, ((y + y0) * w + x0) * ch, ((y + y0) * w + x0 + cw) * ch);
  return { pixels: { data: out, info: { width: cw, height: chh, channels: 4 } }, x: x0, y: y0 };
}

async function layer(name, svg) {
  const cropped = cropAlpha(await render(svg));
  if (!cropped) return null;
  writeImage(name, cropped.pixels, true);
  return { name, x: cropped.x, y: cropped.y, w: cropped.pixels.info.width, h: cropped.pixels.info.height };
}

/** Cuts a rectangle (in px) out of RGBA pixels. */
function extract({ data, info }, x, y, w, h) {
  const ch = info.channels;
  x = Math.max(0, Math.floor(x)); y = Math.max(0, Math.floor(y));
  w = Math.min(info.width - x, Math.ceil(w)); h = Math.min(info.height - y, Math.ceil(h));
  const out = Buffer.alloc(w * h * 4);
  for (let r = 0; r < h; r++) data.copy(out, r * w * 4, ((r + y) * info.width + x) * ch, ((r + y) * info.width + x + w) * ch);
  return { pixels: { data: out, info: { width: w, height: h, channels: 4 } }, x, y };
}

// ---------------------------------------------------------------------------
// Portraits
// ---------------------------------------------------------------------------

/** The top of an element in the drawing's 200 × 240 units. */
function topOf(el) {
  const num = (k) => Number((el.match(new RegExp(`\\s${k}="(-?[\\d.]+)"`)) || [])[1]);
  if (/^<circle/.test(el)) return num("cy") - num("r");
  if (/^<ellipse/.test(el)) return num("cy") - num("ry");
  const d = (el.match(/\sd="([^"]+)"/) || [])[1] || "";
  const ys = [];
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+/g) || [];
  let cmd = "", args = [];
  for (const t of tokens) {
    if (/[A-Za-z]/.test(t)) { cmd = t; args = []; continue; }
    args.push(Number(t));
    if (cmd === "V") { ys.push(args.pop()); }
    else if (cmd === "H" || cmd === "h") { args.pop(); }
    else if (args.length === 2 && "MLQCTS".includes(cmd)) { ys.push(args[1]); args = []; }
    else if (args.length === 2) { args = []; }
  }
  return Math.min(...ys);
}

/**
 * Splits a portrait into layers. Parts marked data-anim are their own layers;
 * the smile is the mouth's data-smile shape; everything else in the frame is
 * body (from the neck down) or head. The frame's own fill becomes the ground.
 */
function splitPortrait(svg) {
  const ground = svg.match(/<(?:path|circle|rect)\b[^>]*fill="(#[0-9A-Fa-f]{6})"\/>\s*(?:<!--[^>]*-->\s*)?<g clip-path/)[1];
  const inner = svg.match(/<g clip-path="url\(#frame\)">([\s\S]*)<\/g>/)[1];
  const els = (inner.match(/<(path|circle|ellipse|rect)\b[^>]*\/>/g) || []).map((e) => e.trim());
  const parts = { body: [], head: [], eye: [], brow: [], mouth: [], smile: [] };
  for (const el of els) {
    const anim = (el.match(/data-anim="(\w+)"/) || [])[1];
    if (anim === "mouth") {
      parts.mouth.push(el.replace(/\sdata-smile="[^"]*"/, ""));
      const smile = (el.match(/data-smile="([^"]+)"/) || [])[1];
      if (smile) parts.smile.push(el.replace(/\sd="[^"]*"/, ` d="${smile}"`).replace(/\sdata-smile="[^"]*"/, ""));
    } else if (anim === "eye" || anim === "brow") parts[anim].push(el);
    else if (anim) parts.head.push(el);
    else parts[topOf(el) >= 140 ? "body" : "head"].push(el);
  }
  return { ground, parts };
}

/*
 * The companion fills the screen: no frame, the face a little above the
 * middle, the shoulders running off the foot of the circle. The drawings are
 * 200 × 240 units with the face about (100, 114). A few need fitting:
 * Morgan's face is drawn smaller than the rest, so she's brought up to size;
 * Maybeck's tam sits so high it would cover the kicker, so he stands lower.
 */
const PORTRAIT_SCALE = 2.8; // px per unit
const FACE_Y = 208; // where the face's centre sits on screen
const FIT = { morgan: { scale: 1.25, faceY: 108 }, maybeck: { faceY: 92 } };
const CAMEO_PX = 88;
// Every host can hand over, so each has a cameo: the face's centre and the circle's radius, in units.
const CAMEO_FACE = { morgan: { cy: 108, r: 38 } };

async function portrait(key) {
  const src = fs.readFileSync(`scripts/portraits/${key}.svg`, "utf8");
  const { ground, parts } = splitPortrait(src);
  const fit = FIT[key] || {};
  const k = PORTRAIT_SCALE * (fit.scale || 1);
  const tx = 233 - 100 * k, ty = FACE_Y - (fit.faceY || 114) * k;
  const wrap = (els) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 466 466" width="466" height="466"><g transform="translate(${tx} ${ty}) scale(${k})">${els.join("")}</g></svg>`;
  const L = {};
  for (const part of ["body", "head", "eye", "brow", "mouth", "smile"]) {
    L[part] = parts[part].length ? await layer(`pt_${key}_${part}`, wrap(parts[part])) : null;
  }
  const field = (l) => (l ? `{ &art_${l.name}, ${l.x}, ${l.y} }` : "{ NULL, 0, 0 }");
  // The cameo the host steps aside into at a handover: their face in a circle.
  {
    const c = CAMEO_PX;
    const { cy, r } = CAMEO_FACE[key] || { cy: 114, r: 48 };
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${100 - r} ${cy - r} ${2 * r} ${2 * r}" width="${c}" height="${c}"><defs><clipPath id="r"><circle cx="100" cy="${cy}" r="${r}"/></clipPath></defs><g clip-path="url(#r)"><rect x="0" y="0" width="200" height="240" fill="${ground}"/>${parts.body.join("")}${parts.head.join("")}${parts.eye.join("")}${parts.brow.join("")}${parts.mouth.join("")}</g></svg>`;
    writeImage(`cameo_${key}`, await render(svg), true);
  }
  decls.push(`const art_portrait_t art_portrait_${key} = { ${Math.round(200 * k)}, 0x${ground.slice(1)}, ${field(L.body)}, ${field(L.head)}, ${field(L.eye)}, ${field(L.brow)}, ${field(L.mouth)}, ${field(L.smile)} };`);
}

// ---------------------------------------------------------------------------
// Walk scenes, full-bleed
// ---------------------------------------------------------------------------

// The square of each label's scene that fills the circle (from the label's
// clip shape; see the design canvas).
const SCENES = [
  ["tour-downtown", "14 34 172 172"],
  ["tour-southside", "22 52 156 156"],
  ["tour-northside", "6 25 188 188"],
  ["tour-campus", "38 58 124 124"],
  ["tour-west-berkeley", "14 34 172 172"],
  ["tour-elmwood", "8 30 184 184"],
  ["tour-historic-landmarks", "18 45 164 164"],
  ["tour-maybeck", "22 52 156 156"],
  ["tour-julia-morgan", "38 58 124 124"],
  ["tour-buena-vista", "6 25 188 188"],
  ["tour-industrial", "8 30 184 184"],
  ["tour-piedmont", "38 58 124 124"],
];

function labels() {
  const ts = fs.readFileSync("components/print-art.generated.ts", "utf8");
  const out = {};
  for (const m of ts.matchAll(/"(tour-[a-z-]+)":\s*"((?:[^"\\]|\\.)*)"/g)) out[m[1]] = JSON.parse(`"${m[2]}"`);
  return out;
}

/** Top-level elements of the label's scene group (a <g> counts as one). */
function sceneElements(svg) {
  const body = svg.match(/<g clip-path="url\(#[^"]+\)">([\s\S]*)<\/g>\s*<path[^>]*\/>\s*<\/svg>$/)[1];
  const els = [];
  let i = 0;
  while (i < body.length) {
    if (body.startsWith("<g", i)) {
      let depth = 0, j = i;
      while (j < body.length) {
        if (body.startsWith("<g", j)) depth++;
        if (body.startsWith("</g>", j)) { depth--; if (depth === 0) { j += 4; break; } }
        j++;
      }
      els.push(body.slice(i, j)); i = j;
    } else if (body[i] === "<") {
      const j = body.indexOf("/>", i) + 2;
      els.push(body.slice(i, j)); i = j;
    } else i++;
  }
  return els;
}

async function scene(id, viewBox, k) {
  const svg = labels()[id];
  const els = sceneElements(svg);
  const animOf = (e) => (e.match(/^<\w+[^>]*data-anim="(\w+)"/) || [])[1];
  const sinks = /data-path="sink"/.test(svg);
  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="466" height="466" preserveAspectRatio="xMidYMid slice">`;
  const base = els.filter((e) => !animOf(e));
  const name = `scene_${k}`;
  writeImage(`${name}_base`, await sharp(Buffer.from(`${head}${base.join("")}</svg>`)).flatten({ background: "#FAF6EC" }).raw().toBuffer({ resolveWithObject: true }), false);
  const sky = [], clouds = [];
  // A moving part travels up to AMP units each way (the firmware keeps to
  // this). Whatever the label draws over it, inside that reach, is cut out as
  // a patch laid back on top, so a sun stays behind its tower as it moves.
  const AMP = 12;
  const scale = 466 / Number(viewBox.split(" ")[2]);
  for (let i = 0; i < els.length; i++) {
    const a = animOf(els[i]);
    if (!a) continue;
    const n = a === "sky" ? sky.length : clouds.length;
    const l = await layer(`${name}_${a}${n}`, `${head}${els[i]}</svg>`);
    if (!l) continue;
    const over = els.slice(i + 1).filter((e) => !animOf(e));
    let front = null;
    if (over.length) {
      const reach = AMP * scale;
      const full = await render(`${head}${over.join("")}</svg>`);
      const box = extract(full, l.x - reach, l.y - reach, l.w + 2 * reach, l.h + 2 * reach);
      const tight = cropAlpha(box.pixels, 0);
      if (tight) {
        front = { name: `${name}_${a}${n}_front`, x: box.x + tight.x, y: box.y + tight.y };
        writeImage(front.name, tight.pixels, true);
      }
    }
    (a === "sky" ? sky : clouds).push({ ...l, front });
  }
  const f = (l) => `{ { &art_${l.name}, ${l.x}, ${l.y} }, ${l.front ? `{ &art_${l.front.name}, ${l.front.x}, ${l.front.y} }` : "{ NULL, 0, 0 }"} }`;
  const none = "{ { NULL, 0, 0 }, { NULL, 0, 0 } }";
  decls.push(`static const art_moving_t ${name}_sky[] = { ${sky.map(f).join(", ") || none} };`);
  decls.push(`static const art_moving_t ${name}_clouds[] = { ${clouds.map(f).join(", ") || none} };`);
  return `{ &art_${name}_base, ${name}_sky, ${sky.length}, ${name}_clouds, ${clouds.length}, ${sinks ? "true" : "false"} }`;
}

// ---------------------------------------------------------------------------
// Plates and the cover device
// ---------------------------------------------------------------------------

async function cover() {
  const img = await sharp("assets/images/logo-on-blue.png").resize(140, 159, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  writeImage("cover_tower", img, true);
}

/** The Follow arrow and its out-of-register shadow, pointing up; the firmware turns them. */
async function arrow() {
  const shape = "M0 -60 L42 -6 L14 -6 L14 58 L-14 58 L-14 -6 L-42 -6 Z";
  for (const [name, fill] of [["arrow", "#E4592B"], ["arrow_shadow", "#C9D0E4"], ["arrow_shadow_board", "#061E63"]]) {
    const img = await render(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-70 -70 140 140" width="140" height="140"><path d="${shape}" fill="${fill}"/></svg>`);
    writeImage(name, img, true);
  }
}

async function plate() {
  // As the canvas's Map screen draws it: 846 px wide, offset -184, -30, with
  // room to drift 12 px left and 7 up.
  const img = await sharp("assets/plates/tour-downtown.png").resize(846).flatten({ background: "#FAF6EC" })
    .extract({ left: 184, top: 30, width: 478, height: 473 }).raw().toBuffer({ resolveWithObject: true });
  writeImage("plate_tour_downtown", img, false);
}

// ---------------------------------------------------------------------------

await cover();
await arrow();
await plate();
const PORTRAITS = ["ratcliff", "plachek", "maybeck", "morgan"];
for (const key of PORTRAITS) await portrait(key);
const scenes = [];
for (let k = 0; k < SCENES.length; k++) scenes.push(await scene(SCENES[k][0], SCENES[k][1], k));

// art.c / art.h
const c = [
  "/* Generated by scripts/device/build-art.mjs — do not edit. */",
  '#include "art.h"',
  "",
  ...assets.map((a) =>
    [
      `extern const uint8_t _binary_${a.name}_bin_start[] asm("_binary_${a.name}_bin_start");`,
      `const lv_image_dsc_t art_${a.name} = { .header = { .magic = LV_IMAGE_HEADER_MAGIC, .cf = ${a.cf}, .w = ${a.w}, .h = ${a.h}, .stride = ${a.w * 2} }, .data_size = ${a.bytes}, .data = _binary_${a.name}_bin_start };`,
    ].join("\n"),
  ),
  "",
  ...decls,
  "",
  `const art_scene_t art_scenes[${scenes.length}] = {\n  ${scenes.join(",\n  ")}\n};`,
  "",
];
fs.writeFileSync(path.join(OUT, "art.c"), c.join("\n"));
const h = [
  "/* Generated by scripts/device/build-art.mjs — do not edit. */",
  "#pragma once",
  '#include "lvgl.h"',
  "#include <stdbool.h>",
  "",
  "/** A picture and where its top-left sits in the box it belongs to. */",
  "typedef struct { const lv_image_dsc_t *img; int16_t x, y; } art_layer_t;",
  "",
  "/**",
  " * A portrait split into its moving parts (any may be NULL), each placed on the",
  " * 466 px screen. `unit` is the drawing's 200 units in px, for scaling motion;",
  " * `ground` is the colour to lay behind it.",
  " */",
  "typedef struct { int16_t unit; uint32_t ground; art_layer_t body, head, eye, brow, mouth, smile; } art_portrait_t;",
  "",
  "/** Where every portrait's face centre sits: the middle across, this far down. */",
  `#define ART_FACE_Y ${FACE_Y}`,
  "",
  "/** A moving part of a scene, and the patch of scenery drawn back over it (img NULL if none). */",
  "typedef struct { art_layer_t part, front; } art_moving_t;",
  "",
  "/** How far, in px at 466, a scene's moving parts may travel each way before the front patch runs out. */",
  "#define ART_SCENE_REACH_UNITS 12",
  "",
  "/** A walk's label scene, full-bleed at 466 px, and its moving sky. */",
  "typedef struct { const lv_image_dsc_t *base; const art_moving_t *sky; uint8_t sky_n; const art_moving_t *clouds; uint8_t cloud_n; bool sky_sinks; } art_scene_t;",
  "",
  ...assets.map((a) => `extern const lv_image_dsc_t art_${a.name};`),
  "",
  ...PORTRAITS.map((k) => `extern const art_portrait_t art_portrait_${k};`),
  `#define ART_CAMEO_PX ${CAMEO_PX}`,
  `extern const art_scene_t art_scenes[${scenes.length}];`,
  "",
];
fs.writeFileSync(path.join(OUT, "art.h"), h.join("\n"));
fs.writeFileSync(path.join(OUT, "art_files.cmake"), `set(ART_FILES\n${assets.map((a) => `  art/${a.name}.bin`).join("\n")}\n)\n`);

const total = assets.reduce((s, a) => s + a.bytes, 0);
console.log(`${assets.length} pictures, ${(total / 1e6).toFixed(2)} MB`);
