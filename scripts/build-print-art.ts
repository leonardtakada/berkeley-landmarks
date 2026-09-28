// The book's printed art, after Showa Modern:
//
// - Walk labels: one flat scene for each walk, after the Showa-era travel
//   labels — a geometric label (square, arch, triangle, tall panel, circle,
//   gable) holding a landscape cut from two inks and their tints, with the
//   paper left showing.
// - The Registry frieze: a street of Berkeley buildings in line, knocked out
//   of a solid blue band, after the line-drawn friezes on the book's cover.
//
// Composed here from a few flat shapes; every path coordinate then gets the
// same slight seeded wobble as the architect portraits, so edges read as cut
// rather than plotted.
//
//   npx tsx scripts/build-print-art.ts            →  components/print-art.generated.ts
//   npx tsx scripts/build-print-art.ts --preview  →  also a contact sheet PNG (path as next arg)
import fs from "node:fs";

import {
  B,
  BT,
  C,
  P,
  V,
  VT,
  archD,
  cypressD,
  dashes,
  disc,
  fill,
  grid,
  lancetD,
  oval,
  rect,
  redwood,
  rng,
  roundTree,
  seedOf,
  stroke,
  wobble,
} from "../lib/cut-paper";

const OUT = "components/print-art.generated.ts";

// ── Label shapes (viewBox 200 × 240, the portraits' proportions) ──────────
const FRAME = {
  square: "M14 30 H186 V210 H14 Z",
  arch: "M22 232 V108 C22 64 57 28 100 28 C143 28 178 64 178 108 V232 Z",
  triangle: "M100 12 L194 226 H6 Z",
  tall: "M38 8 H162 V232 H38 Z",
  circle: "M8 122 C8 71.2 49.2 30 100 30 C150.8 30 192 71.2 192 122 C192 172.8 150.8 214 100 214 C49.2 214 8 172.8 8 122 Z",
  gable: "M18 232 V104 L100 22 L182 104 V232 Z",
};

// ── The sky ─────────────────────────────────────────────────────────────
// The parts of a label that move as it is scrolled (components/walk-label.tsx):
// a sun or moon crosses the sky on an arc, rising from behind the scenery,
// passing its drawn place mid-screen and setting on the far side — or, where
// the scene runs to a vanishing point, sinks straight into it — and clouds
// drift. They're drawn in the scene's order, so the scenery stays in front.
const sun = (cx: number, cy: number, r: number, color: string, path: "arc" | "sink" = "arc") =>
  disc(cx, cy, r, color).replace("<circle", `<circle data-anim="sky" data-path="${path}"`);
/** A crescent: a disc with a disc of the sky's colour cut from it. */
const moon = (cx: number, cy: number, r: number, color: string, [dx, dy, r2, skyColor]: [number, number, number, string]) =>
  `<g data-anim="sky" data-path="arc">${disc(cx, cy, r, color)}${disc(cx + dx, cy + dy, r2, skyColor)}</g>`;
const cloud = (cx: number, cy: number, rx: number, ry: number, color: string) =>
  oval(cx, cy, rx, ry, color).replace("<ellipse", '<ellipse data-anim="cloud"');

// ── The walks ───────────────────────────────────────────────────────────
type Scene = { shape: keyof typeof FRAME; art: () => string };

const SCENES: Record<string, Scene> = {
  // 01 Downtown: the Chamber of Commerce tower, the Art Deco library and a
  // Shattuck Avenue streetcar under its wire.
  "tour-downtown": {
    shape: "square",
    art: () =>
      fill(rect(0, 0, 200, 240), VT) +
      sun(146, 76, 24, V) +
      // library, stepped and finned
      fill(rect(116, 118, 62, 92) + rect(126, 108, 42, 12) + rect(138, 100, 18, 10), P) +
      fill(grid(123, 126, 7, 1, 2.6, 60, 7.4, 0), B) +
      fill(rect(140, 192, 14, 18), B) +
      // a low block on the left
      fill(rect(8, 146, 44, 64), BT) +
      fill(grid(14, 154, 3, 2, 8, 10, 13, 16), B) +
      // the tower
      fill(rect(58, 70, 50, 140) + rect(64, 56, 38, 14) + rect(72, 46, 22, 10), B) +
      fill(grid(64, 78, 4, 9, 5, 7, 11, 12), P) +
      stroke("M83 46 V32", B, 1.6) +
      fill("M83 32 L95 35 L83 38 Z", V) +
      // street, wire and car
      stroke("M0 158 H200", C, 0.9) +
      fill(rect(0, 196, 200, 20), B) +
      stroke(dashes(4, 200, 204, 1, 0, 9, 7, false), P, 1.6) +
      stroke("M62 172 L78 158", C, 1.2) +
      fill("M28 196 V178 C28 175 30 173 33 173 H97 C100 173 102 175 102 178 V196 Z", V) +
      fill(grid(34, 178, 6, 1, 7, 7, 10.8, 0), P) +
      fill(rect(28, 189, 74, 2.4), B) +
      disc(42, 197, 3.6, C) +
      disc(88, 197, 3.6, C),
  },

  // 02 South of Campus: Maybeck's First Church of Christ, Scientist — low
  // spreading gables, tracery and a trellis hung with wisteria.
  "tour-southside": {
    shape: "arch",
    art: () =>
      fill(rect(0, 0, 200, 240), BT) +
      sun(132, 82, 20, P) +
      oval(40, 120, 34, 20, B) + // oaks behind
      oval(170, 128, 28, 18, B) +
      // the main hall
      fill(rect(40, 150, 124, 64), P) +
      fill("M14 154 L100 104 L186 154 L176 156 L100 114 L24 156 Z", V) +
      fill("M30 154 L100 114 L170 154 Z", B) +
      stroke("M100 120 V152 M84 130 V152 M116 130 V152 M68 140 V152 M132 140 V152 M52 150 H148", P, 1.3) +
      fill(lancetD(124, 162, 26, 38), B) +
      stroke("M137 168 V200 M124 182 H150", P, 1.4) +
      // the low front wing with its trellis
      fill(rect(22, 176, 92, 38), P) +
      fill("M14 180 L68 150 L122 180 L114 182 L68 158 L22 182 Z", V) +
      stroke("M26 184 L50 208 M40 184 L64 208 M54 184 L78 208 M68 184 L92 208 M82 184 L106 208 M96 184 L110 198 M26 198 L40 184 M26 208 L50 184 M40 208 L64 184 M54 208 L78 184 M68 208 L92 184 M82 208 L106 184 M96 208 L110 194", B, 1.1) +
      // wisteria hanging from the eaves
      [30, 44, 58, 72, 86, 100]
        .map((x: number, i: number) => oval(x, 188 + (i % 2) * 3, 3.4, 7 + (i % 3), VT) + oval(x + 5, 186, 2.6, 5, VT))
        .join("") +
      fill(rect(0, 214, 200, 30), B) +
      stroke(dashes(20, 190, 222, 2, 6, 5, 6), BT, 1.2),
  },

  // 03 Northside & Hills: Rose Walk climbing the hill to a storybook
  // cottage at the top.
  "tour-northside": {
    shape: "triangle",
    art: () =>
      fill(rect(0, 0, 200, 240), VT) +
      sun(100, 70, 13, V) +
      fill("M0 150 C40 130 70 128 100 110 C130 122 160 134 200 146 V240 H0 Z", BT) +
      fill("M0 196 C30 176 64 160 104 140 C136 150 170 170 200 184 V240 H0 Z", B) +
      // the walk, with its steps
      stroke("M124 230 C152 214 98 206 116 188 C132 172 94 168 104 150", P, 6, "round") +
      stroke("M112 209 h10 M112 190 h10 M109 172 h10 M100 158 h9", B, 1.4) +
      // the cottage at the top
      fill(rect(92, 128, 24, 18), V) +
      fill("M87 130 L104 106 L121 130 Z", C) +
      fill(rect(111, 110, 4, 12), C) +
      fill(rect(96, 134, 5, 6) + rect(107, 134, 5, 6), P) +
      // and one below
      fill(rect(44, 180, 22, 16), V) +
      fill("M40 182 L55 162 L70 182 Z", C) +
      fill(rect(48, 185, 5, 6) + rect(57, 185, 5, 6), P) +
      roundTree(146, 200, 9, BT, BT) +
      roundTree(78, 174, 6, BT, BT) +
      roundTree(34, 214, 8, BT, BT) +
      fill(cypressD(134, 160, 26, 9), C),
  },

  // 04 UC Berkeley Campus: the Campanile against the sun going down over
  // the Golden Gate.
  "tour-campus": {
    shape: "tall",
    art: () =>
      fill(rect(0, 0, 200, 240), VT) +
      sun(118, 136, 40, V) +
      fill("M38 158 C58 146 74 150 92 144 C104 140 112 146 124 150 V158 Z", BT) +
      fill("M132 158 C144 150 156 148 170 152 V158 Z", BT) +
      // the Gate, against the sun
      stroke("M124 158 V124 M150 158 V124", B, 2.4) +
      stroke("M104 150 H162", B, 1.6) +
      stroke("M104 146 C114 138 120 130 124 125 C132 141 142 141 150 125 C154 132 158 138 162 142", B, 1) +
      fill(rect(0, 158, 200, 82), B) +
      stroke(dashes(40, 170, 168, 7, 9, 10, 8), BT, 1.4) +
      // the tower
      fill(rect(66, 74, 32, 166) + rect(62, 64, 40, 10) + rect(64, 60, 36, 4) + "M64 60 L82 26 L100 60 Z", B) +
      fill(archD(69, 66, 7, 16) + archD(78.5, 66, 7, 16) + archD(88, 66, 7, 16), P) +
      stroke("M82 26 V14", B, 1.6) +
      disc(82, 13, 2.4, B) +
      disc(82, 100, 7, P) +
      stroke("M82 100 V95 M82 100 L86 102", B, 1.2) +
      stroke("M70 112 V236 M94 112 V236", P, 0.9) +
      // eucalyptus at its foot
      oval(52, 222, 26, 16, C) +
      oval(150, 226, 30, 14, C),
  },

  // 05 West Berkeley Heritage: the little Gothic Church of the Good
  // Shepherd, a Victorian cottage, and a sail on the bay beyond the railway.
  "tour-west-berkeley": {
    shape: "square",
    art: () =>
      fill(rect(0, 0, 200, 240), BT) +
      sun(160, 64, 14, P) +
      fill("M0 146 C30 138 60 142 90 136 C120 130 160 140 200 134 V150 H0 Z", VT) +
      fill(rect(0, 150, 200, 26), B) +
      stroke(dashes(4, 200, 158, 3, 6, 8, 7), BT, 1.2) +
      // a Victorian cottage
      fill(rect(16, 134, 42, 62), V) +
      fill("M10 136 L37 108 L64 136 Z", B) +
      fill(rect(22, 144, 7, 15) + rect(45, 144, 7, 15), P) +
      fill(rect(18, 166, 20, 18), P) +
      fill(rect(21, 169, 5, 12) + rect(30, 169, 5, 12), B) +
      fill(rect(44, 170, 9, 26), B) +
      // the church and its spire
      fill(rect(92, 122, 52, 74), P) +
      fill("M88 126 L118 96 L148 126 Z", V) +
      fill(rect(72, 108, 20, 88), P) +
      fill("M69 110 L82 50 L95 110 Z", V) +
      fill(lancetD(78, 118, 8, 18) + lancetD(100, 136, 9, 22) + lancetD(114, 136, 9, 22) + lancetD(128, 136, 9, 22), B) +
      fill(lancetD(77, 170, 10, 26), B) +
      // a sail out on the bay, and the line along the shore
      fill("M170 172 V132 L190 172 Z", P) +
      fill("M166 172 V144 L152 172 Z", P) +
      fill("M148 174 H194 L188 182 H154 Z", V) +
      fill(rect(0, 196, 200, 20), C) +
      stroke("M0 201 H200", P, 1) +
      stroke(dashes(2, 200, 205, 1, 0, 3, 6, false), P, 3),
  },

  // 06 Elmwood & Claremont: the Claremont Hotel lit up on its hill at night.
  "tour-elmwood": {
    shape: "circle",
    art: () =>
      fill(rect(0, 0, 200, 240), B) +
      moon(148, 70, 12, P, [12, -4, 11, B]) +
      fill(rect(44, 58, 2, 2) + rect(70, 44, 2, 2) + rect(118, 52, 2, 2) + rect(30, 92, 2, 2) + rect(176, 104, 2, 2) + rect(96, 40, 2, 2), P) +
      fill("M0 128 C30 104 58 110 82 100 C112 88 144 96 200 110 V240 H0 Z", C) +
      // the hotel
      fill(rect(34, 124, 132, 48) + rect(86, 96, 30, 30) + rect(40, 112, 30, 14) + rect(130, 112, 30, 14), P) +
      fill("M82 98 L101 68 L120 98 Z M36 114 L55 98 L74 114 Z M126 114 L145 98 L164 114 Z", V) +
      fill("M30 126 H170 L166 120 H34 Z", V) +
      fill(grid(92, 104, 3, 2, 4, 5, 8, 10) + grid(40, 132, 13, 3, 4, 5, 9.8, 11) + grid(46, 116, 3, 1, 4, 5, 8, 0) + grid(136, 116, 3, 1, 4, 5, 8, 0), VT) +
      fill(grid(40, 132, 13, 1, 4, 5, 9.8, 0), V) +
      // gardens and eucalyptus in the dark
      fill("M0 186 C40 172 80 180 100 176 C130 170 170 180 200 176 V240 H0 Z", C) +
      fill(cypressD(26, 190, 70, 20) + cypressD(176, 188, 64, 18), C) +
      stroke(dashes(40, 170, 196, 3, 7, 4, 7), B, 1.4),
  },

  // 07 Historic Landmarks: the storybook Tupper & Reed building, all steep
  // gable and half-timber.
  "tour-historic-landmarks": {
    shape: "gable",
    art: () =>
      fill(rect(0, 0, 200, 240), VT) +
      cloud(150, 70, 22, 10, P) +
      cloud(166, 62, 14, 8, P) +
      cloud(50, 86, 16, 7, P) +
      roundTree(36, 214, 22, BT, B) +
      // the building
      fill("M50 232 V140 L102 64 L154 140 V232 Z", P) +
      fill("M40 146 L102 54 L164 146 L152 146 L102 72 L52 146 Z", B) +
      fill(rect(128, 70, 14, 58) + rect(125, 66, 20, 6), V) +
      // half-timber in the gable
      fill(rect(100, 80, 4, 64) + "M66 140 L100 94 L100 102 L70 142 Z M138 140 L104 94 L104 102 L134 142 Z", B) +
      fill(rect(56, 140, 92, 4), B) +
      // the great window and door
      fill(archD(70, 154, 64, 42), V) +
      stroke("M86 160 V196 M102 154 V196 M118 160 V196 M70 176 H134", P, 1.6) +
      fill(archD(92, 204, 20, 28), B) +
      disc(108, 219, 1.4, P) +
      fill(rect(0, 226, 200, 20), B),
  },

  // 08 Bernard Maybeck Trail: a Maybeck house in the redwoods — broad
  // gable, shingles, a balcony.
  "tour-maybeck": {
    shape: "arch",
    art: () =>
      fill(rect(0, 0, 200, 240), P) +
      sun(100, 70, 22, VT) +
      redwood(40, 214, 170, 26, V, B) +
      redwood(168, 214, 150, 22, V, B) +
      // the house
      fill(rect(62, 146, 84, 68), BT) +
      stroke(dashes(64, 146, 152, 9, 7, 5, 3), B, 1.2) +
      fill("M48 150 L104 112 L160 150 L152 152 L104 122 L56 152 Z", V) +
      fill("M62 150 L104 122 L146 150 Z", BT) +
      fill(rect(92, 132, 24, 14), P) +
      stroke("M98 132 V146 M104 132 V146 M110 132 V146", B, 1.1) +
      fill(rect(56, 178, 96, 4), V) +
      stroke("M60 182 V192 M68 182 V192 M76 182 V192 M84 182 V192 M92 182 V192 M100 182 V192 M108 182 V192 M116 182 V192 M124 182 V192 M132 182 V192 M140 182 V192 M148 182 V192 M56 192 H152", V, 1.4) +
      fill(rect(72, 158, 14, 16) + rect(122, 158, 14, 16) + rect(98, 196, 14, 18), B) +
      fill(rect(0, 214, 200, 26), B) +
      stroke("M104 214 C98 222 110 226 100 234", P, 4, "round"),
  },

  // 09 Julia Morgan Legacy: the tower of her Berkeley City Club, Moorish
  // arches against a vermilion sky.
  "tour-julia-morgan": {
    shape: "tall",
    art: () =>
      fill(rect(0, 0, 200, 240), V) +
      moon(132, 44, 11, P, [6, -4, 10, V]) +
      // the tower
      fill(rect(74, 54, 52, 186), P) +
      fill("M70 56 L100 32 L130 56 Z", B) +
      fill(rect(70, 54, 60, 5), B) +
      fill(archD(80, 64, 12, 26) + archD(94, 64, 12, 26) + archD(108, 64, 12, 26), B) +
      fill(rect(78, 94, 44, 3) + rect(78, 150, 44, 3), B) +
      fill(lancetD(86, 108, 10, 30) + lancetD(104, 108, 10, 30), B) +
      fill(lancetD(95, 164, 10, 24), B) +
      // the arcade at its foot
      fill(rect(38, 190, 124, 50), B) +
      fill(archD(44, 200, 14, 40) + archD(64, 200, 14, 40) + archD(122, 200, 14, 40) + archD(142, 200, 14, 40), VT) +
      fill(archD(88, 196, 24, 44), P) +
      fill(cypressD(52, 190, 80, 18) + cypressD(150, 190, 64, 16), B),
  },

  // 10 Buena Vista & Hilltop: Maybeck's open-air Temple of Wings on its
  // hilltop, the path winding up.
  "tour-buena-vista": {
    shape: "triangle",
    art: () =>
      fill(rect(0, 0, 200, 240), BT) +
      sun(100, 110, 26, V) +
      fill("M0 188 C40 172 70 168 100 166 C130 168 160 172 200 188 V240 H0 Z", B) +
      stroke("M128 232 C104 220 132 206 110 194 C98 188 102 180 100 174", P, 6, "round") +
      // the colonnade: its ring of columns and curved entablature
      fill("M50 128 C72 122 128 122 150 128 V136 C128 130 72 130 50 136 Z", P) +
      fill(
        [56, 70, 85, 100, 115, 130, 144]
          .map((x) => rect(x - 2.6, 132, 5.2, 36) + rect(x - 4, 131, 8, 3))
          .join(""),
        P,
      ) +
      fill("M48 166 C72 162 128 162 152 166 V174 C128 170 72 170 48 174 Z", P) +
      roundTree(40, 204, 9, C, C) +
      roundTree(162, 206, 10, C, C) +
      stroke(dashes(30, 180, 214, 2, 8, 3, 9), BT, 1.4),
  },

  // 11 Industrial Heritage: sawtooth roofs, a stack and a water tower along
  // the tracks.
  "tour-industrial": {
    shape: "circle",
    art: () =>
      fill(rect(0, 0, 200, 240), VT) +
      sun(60, 72, 16, P) +
      // smoke
      oval(150, 62, 18, 10, P) +
      oval(126, 54, 14, 8, P) +
      oval(106, 50, 10, 6, P) +
      // stack
      fill("M152 74 H166 L170 170 H148 Z", V) +
      fill(rect(151, 80, 16, 4) + rect(151, 90, 16, 4), B) +
      // water tower
      fill(rect(34, 100, 34, 26) + "M32 102 L51 88 L70 102 Z", B) +
      stroke("M38 126 L46 170 M64 126 L56 170 M38 126 L64 150 M64 126 L38 150", B, 1.8) +
      // the sawtooth sheds
      fill("M20 140 L44 120 V140 L68 120 V140 L92 120 V140 L116 120 V140 L140 120 V140 L164 120 V140 L188 120 V186 H20 Z", B) +
      fill("M44 122 V140 L40 140 Z M68 122 V140 L64 140 Z M92 122 V140 L88 140 Z M116 122 V140 L112 140 Z M140 122 V140 L136 140 Z M164 122 V140 L160 140 Z M188 122 V140 L184 140 Z", BT) +
      fill(grid(28, 150, 8, 2, 14, 10, 20, 14), P) +
      stroke("M28 155 H178 M35 150 V160 M55 150 V160 M75 150 V160 M95 150 V160 M115 150 V160 M135 150 V160 M155 150 V160 M175 150 V160", B, 0.9) +
      // the spur line
      fill(rect(0, 186, 200, 60), C) +
      stroke("M0 192 H200 M0 200 H200", P, 1.2) +
      stroke(dashes(2, 200, 196, 1, 0, 3, 7, false), P, 8),
  },

  // 12 Piedmont Avenue: Olmsted's parkway — two files of trees and the
  // planted median running away to the sun.
  "tour-piedmont": {
    shape: "tall",
    art: () =>
      fill(rect(0, 0, 200, 240), P) +
      sun(100, 108, 22, V, "sink") +
      fill(rect(0, 118, 200, 122), BT) +
      fill("M56 240 L97 118 H103 L144 240 Z", C) +
      fill("M90 240 L99.4 118 H100.6 L110 240 Z", VT) +
      stroke("M88 240 L99.2 118 M112 240 L100.8 118", P, 1.2) +
      // the files of trees, shrinking towards the sun
      [
        [89, 130, 4.6],
        [83, 142, 6.4],
        [74, 160, 9],
        [60, 188, 13],
        [38, 234, 20],
      ]
        .map(([x, y, r]: number[]) => roundTree(x, y, r, B, C) + roundTree(200 - x, y, r, B, C))
        .join(""),
  },
};

// ── The Registry frieze (viewBox 400 × 140) ───────────────────────────────
// A street of the city's buildings drawn in cream line on the blue: Maybeck's
// church, a Queen Anne, the Campanile, City Hall under the sun, the Art Deco
// library, a storybook cottage, a bungalow under its tree.
const LINE = 1.6;
const cut = (d: string) => `<path d="${d.trim()}" fill="${B}" stroke="${P}" stroke-width="${LINE}" stroke-linejoin="round"/>`;
const ink = (d: string, w = LINE) => stroke(d, P, w, "round");

function frieze() {
  return (
    fill(rect(0, 0, 400, 140), B) +
    ink("M5 87 C40 76 80 82 120 72 C160 62 200 74 240 66 C280 60 320 72 360 64 C378 61 388 62 395 63", 1.2) +
    disc(232, 50, 22, V) +
    // clouds, curled
    ink("M34 44 C30 36 40 30 46 36 C48 26 64 26 66 36 C72 32 80 38 76 44 Z", 1.2) +
    ink("M292 30 C290 24 298 20 302 25 C305 18 316 18 318 25 C322 22 328 26 325 30 Z", 1.2) +
    // First Church of Christ, Scientist
    cut("M12 122 V98 L46 76 L80 98 V122 Z") +
    ink(lancetD(58, 100, 12, 22)) +
    cut("M4 122 V106 L28 92 L52 106 V122 Z") +
    ink("M8 110 L20 122 M16 110 L28 122 M24 110 L36 122 M32 110 L44 122 M40 110 L50 120 M8 122 L20 110 M16 122 L28 110 M24 122 L36 110 M32 122 L44 110 M40 122 L50 112", 1) +
    // a Queen Anne and its turret
    cut("M86 122 V92 H114 V122 Z") +
    cut("M82 94 L100 72 L118 94 Z") +
    cut("M114 122 V84 H126 V122 Z") +
    cut("M112 86 L120 60 L128 86 Z") +
    ink("M120 60 V53 M92 98 h6 v10 h-6 Z M103 98 h6 v10 h-6 Z M91 112 h18 v10 M118 92 v8 M118 106 v8") +
    // the Campanile
    cut("M137 122 V44 H153 V122 Z") +
    cut("M133 44 H157 V39 H133 Z") +
    cut("M134 39 L145 12 L156 39 Z") +
    ink("M145 12 V6") +
    ink(archD(139, 47, 3.6, 9) + archD(143.2, 47, 3.6, 9) + archD(147.4, 47, 3.6, 9), 1) +
    `<circle cx="145" cy="66" r="3.4" fill="none" stroke="${P}" stroke-width="1"/>` +
    // City Hall, domed
    cut("M194 92 V72 H210 V92 Z") +
    cut("M195 72 V66 H209 V72 Z") +
    cut("M195 66 C195 55 209 55 209 66 Z") +
    ink("M202 57 V44") +
    fill("M202 44 L211 46.5 L202 49 Z", V) +
    cut("M166 122 V92 H238 V122 Z") +
    ink("M163 92 H241 M175 97 V118 M183 97 V118 M191 97 V118 M199 97 V118 M205 97 V118 M213 97 V118 M221 97 V118 M229 97 V118 M166 118 H238") +
    // the library, stepped and finned
    cut("M248 122 V88 H256 V80 H264 V72 H276 V80 H284 V88 H292 V122 Z") +
    ink("M254 93 V116 M260 93 V116 M266 85 V108 M274 85 V108 M280 93 V116 M286 93 V116 M266 122 V112 H274 V122", 1.2) +
    // a storybook cottage
    cut("M326 92 V70 H333 V92 Z") +
    cut("M300 122 V100 L318 70 L336 100 V122 Z") +
    ink("M318 72 V100 M306 90 L318 100 L330 90 M300 100 H336") +
    ink(archD(313, 108, 10, 14)) +
    // a bungalow under its tree
    ink("M378 94 V104") +
    cut("M366 96 C358 96 356 86 362 82 C358 72 368 64 376 68 C380 60 392 62 392 72 C398 76 396 88 388 90 C388 96 380 98 376 94 C372 98 368 98 366 96 Z") +
    cut("M346 122 V106 L372 90 L398 106 V122 Z") +
    ink("M343 107 L372 88 L395 103 M353 122 V110 M391 122 V110 M362 112 h8 v6 h-8 Z M376 112 h8 v6 h-8 Z", 1.2) +
    // the street
    ink("M5 122 H395") +
    stroke(dashes(10, 392, 130, 1, 0, 6, 8, false), P, 1.2) +
    `<rect x="4.5" y="4.5" width="391" height="131" fill="none" stroke="${P}" stroke-width="1"/>`
  );
}

// ── Bake ────────────────────────────────────────────────────────────────
function label(key: string, { shape, art }: Scene) {
  const r = rng(seedOf(key, 11));
  const id = `lf-${key}`;
  const body = wobble(art(), r);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" width="200" height="240">` +
    `<defs><clipPath id="${id}"><path d="${FRAME[shape]}"/></clipPath></defs>` +
    `<g clip-path="url(#${id})">${body}</g>` +
    `<path d="${FRAME[shape]}" fill="none" stroke="${B}" stroke-width="3" stroke-linejoin="miter"/>` +
    `</svg>`
  );
}

const baked = Object.entries(SCENES).map(([k, s]) => [k, s.shape, label(k, s)]);
const friezeSvg =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 140" width="400" height="140">` +
  wobble(frieze(), rng(1937)) +
  `</svg>`;
fs.writeFileSync(
  OUT,
  `// Generated by scripts/build-print-art.ts — edit the drawings there.\n` +
    `export const WALK_LABEL_SVG: Record<string, string> = {\n` +
    baked.map(([k, , v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join("\n") +
    `\n};\n\n` +
    `export const REGISTRY_FRIEZE_SVG = ${JSON.stringify(friezeSvg)};\n`,
);
console.log(`wrote ${OUT} (${baked.length} labels, the frieze)`);

/** A contact sheet of everything drawn, for looking at. */
async function preview(out: string) {
  const { default: sharp } = await import("sharp");
  const cell = { w: 300, h: 360 };
  const cols = 4;
  const rows = Math.ceil(baked.length / cols);
  const tiles = await Promise.all(
    baked.map(async ([, , svg], i) => ({
      input: await sharp(Buffer.from(svg.replace('width="200" height="240"', `width="${cell.w - 40}" height="${cell.h - 48}"`)))
        .png()
        .toBuffer(),
      left: (i % cols) * cell.w + 20,
      top: Math.floor(i / cols) * cell.h + 24,
    })),
  );
  tiles.push({
    input: await sharp(Buffer.from(friezeSvg.replace('width="400" height="140"', 'width="1000" height="350"')))
      .png()
      .toBuffer(),
    left: 100,
    top: rows * cell.h + 20,
  });
  await sharp({ create: { width: cols * cell.w, height: rows * cell.h + 400, channels: 3, background: "#FAF6EC" } })
    .composite(tiles)
    .png()
    .toFile(out);
  console.log(`preview → ${out}`);
}

if (process.argv.includes("--preview")) {
  void preview(process.argv[process.argv.indexOf("--preview") + 1] ?? "print-art-preview.png");
}
