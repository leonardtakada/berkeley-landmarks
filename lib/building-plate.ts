// Plates drawn for landmarks the book has no photograph of: a flat
// cut-paper print of a building of the landmark's style and kind, in the
// book's inks, after the Showa Modern labels. Not a likeness — an
// impression of the type — so the caption says so.
//
// Composed at run time from the landmark's style, category and id (which
// seeds the variations), so neighbouring entries don't repeat.
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
  oakTree,
  oval,
  palm,
  rect,
  redwood,
  rng,
  roundTree,
  seedOf,
  stroke,
  wobble,
} from "./cut-paper";

export const PLATE_W = 300;
export const PLATE_H = 204;
const G = 178; // the ground line

export type Archetype =
  | "craftsman"
  | "bungalow"
  | "storybook"
  | "victorian"
  | "queenanne"
  | "colonial"
  | "classical"
  | "mediterranean"
  | "deco"
  | "modern"
  | "storefront"
  | "industrial"
  | "church"
  | "collegiate"
  | "mound";

export interface PlateSubject {
  id: string;
  style: string;
  category: string;
}

/** What kind of building to draw for a landmark. */
export function archetypeOf({ style, category }: Pick<PlateSubject, "style" | "category">): Archetype {
  const s = style.toLowerCase();
  if (/prehistoric|shellmound/.test(s)) return "mound";
  if (/industrial/.test(s)) return "industrial";
  if (/gothic/.test(s)) return category === "educational" ? "collegiate" : "church";
  if (category === "religious") return "church";
  if (/deco|moderne|streamline/.test(s)) return "deco";
  if (/modern/.test(s)) return "modern";
  if (/mediterranean|spanish|mission/.test(s)) return "mediterranean";
  if (/queen anne/.test(s)) return "queenanne";
  if (/victorian|italianate/.test(s)) return "victorian";
  if (/classical|beaux|renaissance|colonial/.test(s)) return category === "residential" ? "colonial" : "classical";
  if (/tudor|storybook|norman|cotswold|medieval|period/.test(s)) return "storybook";
  if (category === "commercial") return "storefront";
  return "craftsman";
}

/** What to call it in the caption. */
const KIND: Record<Archetype, string> = {
  craftsman: "Arts & Crafts",
  bungalow: "Craftsman bungalow",
  storybook: "Period Revival",
  victorian: "Victorian",
  queenanne: "Queen Anne",
  colonial: "Classical Revival",
  classical: "Classical",
  mediterranean: "Mediterranean Revival",
  deco: "Art Deco",
  modern: "Modern",
  storefront: "Commercial block",
  industrial: "Industrial",
  church: "Gothic Revival",
  collegiate: "Collegiate Gothic",
  mound: "Shellmound",
};

// ── Colour schemes: which ink does what ───────────────────────────────────
interface Scheme {
  sky: string;
  sun: string;
  hills: string;
  ground: string;
  wall: string;
  roof: string;
  trim: string;
  glass: string;
  accent: string;
  tree: string;
  trunk: string;
  night?: boolean;
}

const SCHEMES: [number, Scheme][] = [
  [0.3, { sky: VT, sun: V, hills: BT, ground: B, wall: P, roof: B, trim: B, glass: B, accent: V, tree: B, trunk: C }],
  [0.25, { sky: BT, sun: P, hills: VT, ground: B, wall: V, roof: B, trim: P, glass: P, accent: P, tree: B, trunk: C }],
  [0.2, { sky: P, sun: V, hills: BT, ground: B, wall: B, roof: V, trim: P, glass: P, accent: V, tree: C, trunk: C }],
  [0.15, { sky: V, sun: P, hills: VT, ground: B, wall: P, roof: B, trim: B, glass: B, accent: B, tree: B, trunk: B }],
  [0.1, { sky: B, sun: P, hills: C, ground: C, wall: P, roof: V, trim: B, glass: V, accent: V, tree: C, trunk: C, night: true }],
];

function pickScheme(r: () => number): Scheme {
  let t = r();
  for (const [w, s] of SCHEMES) {
    if ((t -= w) <= 0) return { ...s };
  }
  return { ...SCHEMES[0][1] };
}

/** Lines laid lightly over a surface: shingles, tiles, siding. */
const hatch = (d: string, color: string, w: number, opacity: number) =>
  `<g opacity="${opacity}">${stroke(d, color, w)}</g>`;

/** A second ink that reads against `c`. */
const against = (c: string) => (c === B || c === C || c === V ? P : B);

// ── The buildings, drawn about (0, 0) = the middle of their front at the
// ground; y runs up into negatives. Each returns its markup and half-width.
/** `tall`: where a spire, stack or tower rises, so the sun can keep clear of it. */
type Drawn = { svg: string; hw: number; tall?: number };
type Draw = (s: Scheme, r: () => number) => Drawn;

const craftsman: Draw = (s, r) => {
  const hw = 58;
  const wh = 54;
  const rise = 32 + r() * 8;
  const ov = 12;
  const line = against(s.wall);
  return {
    hw: hw + ov,
    svg:
      fill(rect(hw - 6, -wh - 22, 11, wh + 22), s.trunk) +
      fill(rect(-hw, -wh, hw * 2, wh), s.wall) +
      hatch(dashes(-hw + 3, hw - 3, -wh + 6, 8, 6, 5, 3), line, 1, 0.35) +
      fill(`M${-hw} ${-wh} L0 ${-wh - rise + 6} L${hw} ${-wh} Z`, s.wall) +
      fill(
        `M${-hw - ov} ${-wh + 6} L0 ${-wh - rise} L${hw + ov} ${-wh + 6} L${hw + ov - 9} ${-wh + 6} L0 ${-wh - rise + 10} L${-hw - ov + 9} ${-wh + 6} Z`,
        s.roof,
      ) +
      fill(`M${hw - 2} ${-wh + 2} L${hw + 8} ${-wh + 4} L${hw - 2} ${-wh + 12} Z M${-hw + 2} ${-wh + 2} L${-hw - 8} ${-wh + 4} L${-hw + 2} ${-wh + 12} Z`, s.roof) +
      fill(grid(-11, -wh - 16, 3, 1, 5, 9, 8, 0), s.glass) +
      fill(grid(-40, -48, 3, 1, 16, 14, 28, 0), s.glass) +
      // the porch
      fill(rect(-hw - 6, -27, hw * 2 + 12, 5), s.roof) +
      fill([-hw + 1, -hw / 3 - 4, hw / 3 - 4, hw - 9].map((x) => `M${x} 0 L${x + 2} -22 H${x + 6} L${x + 8} 0 Z `).join(""), s.roof) +
      fill(rect(8, -20, 11, 20) + grid(-36, -17, 2, 1, 13, 11, 17, 0), s.glass),
  };
};

const bungalow: Draw = (s) => {
  const hw = 76;
  const wh = 40;
  const line = against(s.wall);
  return {
    hw: hw + 12,
    svg:
      fill(rect(-hw + 14, -wh - 44, 11, 40), s.trunk) +
      fill(rect(-hw, -wh, hw * 2, wh), s.wall) +
      hatch(dashes(-hw + 3, hw - 3, -wh + 5, 6, 6, 5, 3), line, 1, 0.35) +
      fill(`M${-hw - 12} ${-wh + 4} L${-hw + 26} ${-wh - 32} H${hw - 26} L${hw + 12} ${-wh + 4} Z`, s.roof) +
      // the dormer
      fill(rect(-19, -wh - 30, 38, 20), s.wall) +
      fill(`M-26 ${-wh - 28} L0 ${-wh - 44} L26 ${-wh - 28} L20 ${-wh - 28} L0 ${-wh - 38} L-20 ${-wh - 28} Z`, s.roof) +
      fill(grid(-13, -wh - 26, 3, 1, 6, 11, 10, 0), s.glass) +
      // windows, door, and the porch on its stone piers
      fill(grid(-hw + 10, -30, 2, 1, 16, 16, 21, 0) + grid(hw - 47, -30, 2, 1, 16, 16, 21, 0) + rect(-7, -26, 14, 26), s.glass) +
      fill(rect(-36, -33, 72, 4), s.roof) +
      fill([-34, 26].map((x) => `M${x} 0 V-12 L${x + 2} -29 H${x + 6} L${x + 8} -12 V0 Z `).join(""), s.roof),
  };
};

const storybook: Draw = (s, r) => {
  const hw = 38;
  const wh = 50;
  const rise = 60;
  const tower = r() < 0.4;
  let out = "";
  if (tower) {
    out +=
      fill(rect(-hw - 22, -84, 26, 84), s.wall) +
      fill(`M${-hw - 27} -82 L${-hw - 9} -126 L${-hw + 9} -82 Z`, s.roof) +
      fill(rect(-hw - 12, -70, 5, 12) + rect(-hw - 12, -44, 5, 12), s.glass);
  } else {
    out += fill(rect(-hw - 2, -wh - 50, 12, 60) + rect(-hw - 4, -wh - 54, 16, 5), s.trunk);
  }
  out +=
    // the cross wing
    fill(rect(hw - 8, -38, 52, 38), s.wall) +
    fill(`M${hw - 12} -34 L${hw + 18} -70 L${hw + 48} -34 L${hw + 41} -34 L${hw + 18} -60 L${hw - 5} -34 Z`, s.roof) +
    fill(`M${hw - 8} -36 L${hw + 18} -60 L${hw + 44} -36 Z`, s.wall) +
    fill(grid(hw + 4, -28, 2, 1, 11, 14, 17, 0), s.glass) +
    // the main gable, steep
    fill(rect(-hw, -wh, hw * 2, wh), s.wall) +
    fill(`M${-hw + 4} ${-wh} L0 ${-wh - rise + 14} L${hw - 4} ${-wh} Z`, s.wall) +
    fill(
      `M${-hw - 7} ${-wh + 6} L0 ${-wh - rise} L${hw + 7} ${-wh + 6} L${hw - 3} ${-wh + 6} L0 ${-wh - rise + 13} L${-hw + 3} ${-wh + 6} Z`,
      s.roof,
    ) +
    // half-timber in the gable
    fill(
      rect(-2, -wh - rise + 16, 4, rise - 16) +
        rect(-hw + 2, -wh - 2, hw * 2 - 4, 4) +
        `M-24 ${-wh - 2} L-2 ${-wh - 32} V${-wh - 24} L-18 ${-wh - 2} Z M24 ${-wh - 2} L2 ${-wh - 32} V${-wh - 24} L18 ${-wh - 2} Z`,
      s.trim === P && s.wall === P ? B : s.trim === s.wall ? against(s.wall) : s.trim,
    ) +
    fill(archD(-9, -28, 18, 28) + rect(-31, -42, 14, 14) + rect(17, -42, 14, 14), s.glass) +
    stroke("M-24 -42 V-28 M-31 -35 H-17 M24 -42 V-28 M17 -35 H31", s.wall, 1.2);
  return { svg: out, hw: hw + 44, tall: tower ? -hw - 9 : -hw + 4 };
};

const victorian: Draw = (s, r) => {
  const hw = 38;
  const wh = 100;
  const italianate = r() < 0.4;
  const line = against(s.wall);
  let top: string;
  if (italianate) {
    top =
      fill(rect(-hw - 6, -wh - 8, hw * 2 + 12, 8), s.roof) +
      fill([-34, -20, -6, 8, 22, 34].map((x) => rect(x - 1.5, -wh, 3, 6)).join(""), s.roof);
  } else {
    const rise = 34;
    top =
      fill(`M${-hw} ${-wh} L0 ${-wh - rise + 6} L${hw} ${-wh} Z`, s.wall) +
      fill(
        `M${-hw - 6} ${-wh + 4} L0 ${-wh - rise} L${hw + 6} ${-wh + 4} L${hw - 2} ${-wh + 4} L0 ${-wh - rise + 8} L${-hw + 2} ${-wh + 4} Z`,
        s.roof,
      ) +
      disc(0, -wh - 12, 5, s.glass);
  }
  return {
    hw: hw + 6,
    svg:
      fill(rect(-hw, -wh, hw * 2, wh), s.wall) +
      hatch(dashes(-hw + 2, hw - 2, -wh + 4, 16, 6, 30, 0, false), line, 0.8, 0.28) +
      top +
      fill(rect(-hw, -54, hw * 2, 3), s.roof) +
      fill(grid(-26, -88, 3, 1, 10, 26, 20, 0), s.glass) +
      fill(grid(-28, -93, 3, 1, 14, 3, 20, 0), s.roof) +
      // the slanted bay
      fill("M-36 0 V-40 L-30 -46 H-8 L-2 -40 V0 Z", s.wall) +
      fill("M-38 -40 L-30 -49 H-8 L0 -40 Z", s.roof) +
      fill(grid(-31, -38, 3, 1, 6, 24, 9, 0), s.glass) +
      // the porch
      fill(rect(12, -36, 12, 36), s.glass) +
      fill(rect(4, -44, 36, 4) + rect(6, -40, 3, 40) + rect(35, -40, 3, 40) + rect(2, -4, 40, 4), s.roof),
  };
};

const queenanne: Draw = (s) => {
  const hw = 46;
  const wh = 86;
  const line = against(s.wall);
  return {
    hw: hw + 18,
    tall: -hw + 1,
    svg:
      fill(rect(-hw, -wh, hw * 2, wh), s.wall) +
      fill(`M${-hw - 4} ${-wh} L${-hw + 16} ${-wh - 28} H${hw - 26} L${hw - 16} ${-wh} Z`, s.roof) +
      // the front gable, its shingles scalloped
      fill(`M0 ${-wh} L${hw / 2 + 3} ${-wh - 40} L${hw + 6} ${-wh} Z`, s.wall) +
      hatch(dashes(8, hw - 2, -wh - 20, 3, 6, 4, 2), line, 1.4, 0.4) +
      fill(
        `M-4 ${-wh + 4} L${hw / 2 + 3} ${-wh - 44} L${hw + 10} ${-wh + 4} L${hw + 2} ${-wh + 4} L${hw / 2 + 3} ${-wh - 34} L4 ${-wh + 4} Z`,
        s.roof,
      ) +
      // the turret
      fill(rect(-hw - 14, -wh - 10, 30, wh + 10), s.wall) +
      fill(`M${-hw - 18} ${-wh - 8} L${-hw + 1} ${-wh - 62} L${-hw + 20} ${-wh - 8} Z`, s.roof) +
      stroke(`M${-hw + 1} ${-wh - 62} V${-wh - 70}`, s.roof, 1.6) +
      fill(grid(-hw - 8, -wh + 2, 2, 1, 7, 18, 11, 0) + grid(-hw - 8, -58, 2, 1, 7, 18, 11, 0), s.glass) +
      fill(grid(10, -wh + 18, 2, 1, 12, 22, 20, 0) + grid(10, -52, 2, 1, 12, 20, 20, 0) + rect(-10, -28, 12, 28), s.glass) +
      // the wraparound porch
      fill(rect(-hw - 18, -32, hw * 2 + 36, 5), s.roof) +
      fill(
        [-60, -46, -32, -18, 6, 20, 34, 48, 60].map((x) => rect(x - 1.2, -27, 2.4, 27)).join("") + rect(-hw - 18, -4, hw * 2 + 36, 4),
        s.roof,
      ),
  };
};

const colonial: Draw = (s) => {
  const hw = 64;
  const wh = 62;
  const col = s.wall === P ? s.roof : P;
  const win = [-54, -34, 22, 42];
  return {
    hw: hw + 6,
    svg:
      fill(rect(-hw + 8, -wh - 36, 10, 32) + rect(hw - 18, -wh - 36, 10, 32), s.trunk) +
      fill(rect(-hw, -wh, hw * 2, wh), s.wall) +
      fill(`M${-hw - 6} ${-wh + 2} L${-hw + 22} ${-wh - 28} H${hw - 22} L${hw + 6} ${-wh + 2} Z`, s.roof) +
      fill(win.map((x) => rect(x, -52, 12, 16) + rect(x, -26, 12, 16)).join(""), s.glass) +
      fill(win.map((x) => rect(x - 4, -52, 3, 16) + rect(x + 13, -52, 3, 16) + rect(x - 4, -26, 3, 16) + rect(x + 13, -26, 3, 16)).join(""), s.accent === s.wall ? s.roof : s.accent) +
      // the portico
      fill(`M-24 -46 L0 -62 L24 -46 Z`, s.roof) +
      fill(`M-18 -47 L0 -58 L18 -47 Z`, s.wall) +
      fill(rect(-22, -46, 44, 4) + [-19, -9, 5, 15].map((x) => rect(x, -42, 4, 42)).join(""), col) +
      fill(archD(-6, -32, 12, 32), s.glass),
  };
};

function classical(s: Scheme, dome = false): Drawn {
  const hw = 86;
  const wh = 70;
  const col = P;
  const recess = s.wall === P ? s.roof : s.roof === s.sky ? C : s.roof;
  let out = "";
  if (dome) {
    out +=
      fill(rect(-17, -wh - 48, 34, 20), s.wall) +
      fill(grid(-12, -wh - 44, 4, 1, 3, 10, 7.5, 0), recess) +
      fill(`M-19 ${-wh - 48} C-19 ${-wh - 76} 19 ${-wh - 76} 19 ${-wh - 48} Z`, s.roof) +
      fill(rect(-3, -wh - 80, 6, 9), s.wall) +
      stroke(`M0 ${-wh - 80} V${-wh - 94}`, s.roof, 1.4) +
      fill(`M0 ${-wh - 94} L10 ${-wh - 91} L0 ${-wh - 88} Z`, s.accent === s.sky ? s.roof : s.accent);
  }
  out +=
    fill(rect(-hw, -wh, hw * 2, wh - 8), s.wall) +
    fill(rect(-44, -wh + 2, 88, wh - 10), recess) +
    fill([-38, -23, -8, 7, 22, 37].map((x) => rect(x - 3, -wh + 4, 6, wh - 12) + rect(x - 4.5, -wh + 3, 9, 3)).join(""), col) +
    fill(grid(-hw + 8, -wh + 12, 2, 2, 10, 16, 18, 26) + grid(hw - 36, -wh + 12, 2, 2, 10, 16, 18, 26), recess) +
    fill(rect(-hw - 4, -wh - 6, hw * 2 + 8, 6), s.roof) +
    fill(`M-52 ${-wh - 6} L0 ${-wh - 30} L52 ${-wh - 6} Z`, s.roof) +
    fill(`M-42 ${-wh - 8} L0 ${-wh - 25} L42 ${-wh - 8} Z`, s.wall) +
    fill(rect(-hw - 4, -8, hw * 2 + 8, 8), s.roof) +
    fill(rect(-50, -8, 100, 3) + rect(-46, -12, 92, 4), col);
  return { svg: out, hw: hw + 4, tall: dome ? 0 : undefined };
}

const mediterranean: Draw = (s, r) => {
  const hw = 60;
  const wh = 58;
  const wall = s.wall === V || s.wall === s.sky ? P : s.wall;
  const roof = V;
  const tower = r() < 0.55;
  let out = "";
  if (tower) {
    out +=
      fill(rect(hw - 32, -wh - 34, 26, wh + 34), wall) +
      fill(`M${hw - 36} ${-wh - 32} L${hw - 19} ${-wh - 50} L${hw - 2} ${-wh - 32} Z`, roof) +
      fill(archD(hw - 24, -wh - 26, 10, 16), s.glass === wall ? B : s.glass);
  }
  out +=
    fill(rect(-hw, -wh, hw * 2, wh), wall) +
    fill(`M${-hw - 8} ${-wh + 2} L${-hw + 16} ${-wh - 16} H${hw - 16} L${hw + 8} ${-wh + 2} Z`, roof) +
    hatch(`M${-hw - 2} ${-wh - 3} H${hw + 2} M${-hw + 5} ${-wh - 8} H${hw - 5} M${-hw + 11} ${-wh - 13} H${hw - 11}`, VT, 1.1, 0.8) +
    fill(archD(-hw + 12, -42, 14, 24) + archD(-hw + 34, -42, 14, 24) + archD(hw - 44, -42, 14, 24), s.glass === wall ? B : s.glass) +
    fill(archD(-6, -36, 22, 36), s.roof === wall ? B : s.roof) +
    fill(rect(-hw + 10, -16, 40, 3), roof);
  return { svg: out, hw: hw + 8, tall: tower ? hw - 19 : undefined };
};

const deco: Draw = (s) => {
  const hw = 46;
  const wh = 112;
  const fin = s.trim === s.wall ? against(s.wall) : s.trim;
  return {
    hw,
    tall: 0,
    svg:
      fill(rect(-3, -wh - 18, 6, 16), fin) +
      fill(rect(-hw, -wh + 22, hw * 2, wh - 22) + rect(-hw + 12, -wh + 8, hw * 2 - 24, 16) + rect(-15, -wh - 4, 30, 14), s.wall) +
      fill(grid(-40, -wh + 30, 7, 6, 6, 9, 12.4, 13), s.glass) +
      fill([-43, -31, -19, -7, 5, 17, 29, 41].map((x) => rect(x - 1, -wh + 26, 2, wh - 64)).join(""), fin) +
      // the zigzag at the parapets
      fill(
        [...Array(12)].map((_, i) => `M${-hw + i * 8} ${-wh + 22} L${-hw + 4 + i * 8} ${-wh + 16} L${-hw + 8 + i * 8} ${-wh + 22} Z `).join(""),
        s.accent === s.wall ? fin : s.accent,
      ) +
      fill(rect(-hw, -38, hw * 2, 2) + rect(-hw, -33, hw * 2, 2) + rect(-hw, -28, hw * 2, 2), fin) +
      fill(rect(-10, -24, 20, 24), s.glass) +
      stroke("M0 -26 L0 -36 M0 -26 L-9 -33 M0 -26 L9 -33 M0 -26 L-12 -27 M0 -26 L12 -27", fin, 1.4),
  };
};

const modern: Draw = (s, r) => {
  const butterfly = r() < 0.4;
  const mull = s.wall;
  return {
    hw: 80,
    tall: 58,
    svg:
      fill(rect(52, -90, 12, 34), s.accent === s.sky ? s.roof : s.accent) +
      fill(rect(-66, -18, 4, 18) + rect(-18, -18, 4, 18) + rect(40, -18, 4, 18), s.roof) +
      fill(rect(-40, -18, 60, 18), s.glass) +
      fill(rect(-72, -58, 144, 40), s.wall) +
      fill(rect(-64, -50, 128, 24), s.glass) +
      stroke([-48, -32, -16, 0, 16, 32, 48].map((x) => `M${x} -50 V-26`).join(" "), mull, 1.4) +
      (butterfly
        ? fill("M-80 -70 L-2 -60 L80 -72 V-64 L-2 -54 L-80 -62 Z", s.roof)
        : fill(rect(-80, -64, 160, 6), s.roof)),
  };
};

const storefront: Draw = (s) => {
  const hw = 70;
  const wh = 92;
  const sign = s.accent === s.wall ? s.roof : s.accent;
  const awning = sign;
  const stripe = awning === P ? B : P;
  return {
    hw: hw + 4,
    svg:
      fill(rect(-hw, -wh, hw * 2, wh), s.wall) +
      fill(rect(-hw - 4, -wh - 8, hw * 2 + 8, 8) + [-62, -36, -10, 16, 42, 64].map((x) => rect(x - 2, -wh, 4, 6)).join(""), s.roof) +
      fill(grid(-hw + 10, -wh + 12, 5, 2, 14, 18, 26, 25), s.glass) +
      fill(rect(-hw, -44, hw * 2, 8), sign) +
      // the awning, striped, its edge cut in scallops
      fill(`M${-hw + 2} -36 H${hw - 2} V-28 ` + [...Array(14)].map((_, i) => `L${hw - 2 - (i + 0.5) * 10} -24 L${hw - 2 - (i + 1) * 10} -28 `).join("") + "Z", awning) +
      fill([...Array(7)].map((_, i) => rect(-hw + 7 + i * 20, -36, 10, 8)).join(""), stripe) +
      fill(rect(-hw + 6, -22, 48, 22) + rect(hw - 54, -22, 48, 22), s.glass) +
      fill(rect(-8, -24, 16, 24), s.roof),
  };
};

const industrial: Draw = (s, r) => {
  const sawtooth = r() < 0.6;
  const smoke = s.night ? BT : P;
  let out =
    oval(90, -150, 16, 8, smoke) +
    oval(106, -160, 12, 6, smoke) +
    fill("M60 0 L64 -136 H74 L78 0 Z", s.accent === s.sky ? s.roof : s.accent) +
    fill(rect(63, -128, 12, 3) + rect(63, -120, 12, 3), s.roof === s.accent ? against(s.roof) : s.roof);
  if (sawtooth) {
    out +=
      fill(rect(-92, -44, 184, 44), s.wall) +
      fill("M-92 -44 V-66 L-55 -44 V-66 L-18 -44 V-66 L19 -44 V-66 L56 -44 V-66 L92 -44 Z", s.roof) +
      fill([-92, -55, -18, 19, 56].map((x) => rect(x + 1, -64, 4, 16)).join(""), s.glass === s.roof ? P : s.glass);
  } else {
    out +=
      fill(rect(-92, -50, 184, 50), s.wall) +
      fill("M-96 -48 L0 -76 L96 -48 Z", s.roof) +
      fill(rect(-30, -84, 60, 18), s.wall) +
      fill("M-34 -82 L0 -94 L34 -82 Z", s.roof);
  }
  out +=
    fill(grid(-84, -38, 6, 1, 20, 24, 28, 0), s.glass) +
    stroke([-74, -46, -18, 10, 38, 66].map((x) => `M${x} -38 V-14`).join(" ") + " M-84 -26 H84", s.wall, 1) +
    fill(archD(-10, -30, 20, 30), s.roof);
  return { svg: out, hw: 96, tall: 69 };
};

const church: Draw = (s) => {
  const glass = s.glass;
  return {
    hw: 64,
    tall: -36,
    svg:
      fill(rect(-20, -58, 82, 58), s.wall) +
      fill("M-26 -54 L21 -98 L68 -54 L60 -54 L21 -88 L-18 -54 Z", s.roof) +
      fill("M-18 -58 L21 -88 L60 -58 Z", s.wall) +
      disc(21, -70, 8, glass) +
      stroke("M21 -78 V-62 M13 -70 H29", s.wall, 1.2) +
      fill(lancetD(0, -48, 10, 28) + lancetD(16, -48, 10, 28) + lancetD(32, -48, 10, 28) + lancetD(48, -48, 8, 24), glass) +
      // the tower and spire
      fill(rect(-52, -98, 32, 98), s.wall) +
      fill("M-57 -96 L-36 -170 L-15 -96 Z", s.roof) +
      fill(lancetD(-42, -88, 12, 22) + lancetD(-44, -36, 16, 36), glass),
  };
};

const collegiate: Draw = (s) => {
  const merlons = (x0: number, x1: number, y: number) => {
    let d = "";
    for (let x = x0; x + 6 <= x1; x += 10) d += rect(x, y - 6, 6, 6);
    return d;
  };
  return {
    hw: 92,
    tall: 0,
    svg:
      fill(rect(-92, -54, 184, 54) + merlons(-92, 92, -54), s.wall) +
      fill(rect(-20, -110, 40, 110) + merlons(-20, 20, -110) + rect(-24, -120, 7, 20) + rect(17, -120, 7, 20), s.wall) +
      fill(
        [-82, -66, -50, 34, 50, 66].map((x) => lancetD(x, -44, 10, 22)).join("") + lancetD(-8, -96, 16, 34) + lancetD(-10, -40, 20, 40),
        s.glass,
      ) +
      fill(rect(-92, -48, 72, 3) + rect(20, -48, 72, 3), s.roof),
  };
};

const DRAW: Record<Exclude<Archetype, "mound">, Draw> = {
  craftsman,
  bungalow,
  storybook,
  victorian,
  queenanne,
  colonial,
  classical: (s) => classical(s),
  mediterranean,
  deco,
  modern,
  storefront,
  industrial,
  church,
  collegiate,
};

// ── The plate ─────────────────────────────────────────────────────────────
function trees(kind: Archetype, x: number, s: Scheme, r: () => number, big = 1): string {
  const tall = s.tree;
  switch (kind) {
    case "craftsman":
    case "bungalow":
      return r() < 0.5 ? redwood(x, G, 120 * big, 20 * big, s.sky === V || s.wall === V ? s.trunk : V, tall) : oakTree(x, G, 20 * big, tall, s.trunk);
    case "mediterranean":
      return r() < 0.5 ? palm(x, G, 90 * big, tall) : fill(cypressD(x, G, 90 * big, 22 * big), tall);
    case "church":
    case "collegiate":
    case "classical":
      return fill(cypressD(x, G, 70 * big, 18 * big), tall);
    case "industrial":
      return "";
    case "storybook":
      return oakTree(x, G, 22 * big, tall, s.trunk);
    default:
      return roundTree(x, G, 16 * big, tall, s.trunk);
  }
}

function hills(s: Scheme, r: () => number): string {
  const y = () => 108 + r() * 30;
  return fill(`M-4 ${y()} C60 ${y()} 90 ${y()} 150 ${y()} C210 ${y()} 240 ${y()} 304 ${y()} V${G} H-4 Z`, s.hills);
}

/** The whole plate for a landmark, as SVG. */
export function buildingPlateSvg(subject: PlateSubject): { svg: string; caption: string; archetype: Archetype } {
  const r = rng(seedOf(subject.id, 13));
  let kind = archetypeOf(subject);
  if (kind === "craftsman" && subject.category === "residential" && r() < 0.45) kind = "bungalow";
  const s = pickScheme(r);
  if (s.wall === s.sky) s.wall = s.sky === P ? B : P;
  if (s.roof === s.sky) s.roof = s.sky === B ? V : B;
  const district = subject.category === "historic_district";

  // The building (or row, or mound) first, so the sun can be set clear of it.
  let scene = "";
  let tallX: number | null = null;
  if (kind === "mound") {
    // The bay, and the mound raised on its shore.
    scene +=
      fill(rect(-4, 128, PLATE_W + 8, G - 128), B) +
      stroke(dashes(8, 292, 138, 5, 8, 12, 9), BT, 1.4) +
      fill(`M20 ${G} C80 ${G - 58} 220 ${G - 58} 280 ${G} Z`, s.hills === C ? VT : s.hills === B ? BT : s.hills) +
      fill(dashes(70, 230, G - 26, 3, 7, 4, 7), P) +
      oakTree(118, G - 38, 16, s.tree === B ? C : s.tree, C) +
      oakTree(176, G - 36, 13, s.tree === B ? C : s.tree, C) +
      fill(rect(-4, G, PLATE_W + 8, PLATE_H - G + 4), s.ground);
  } else {
    scene += hills(s, r);
    const draw = DRAW[kind];
    const domed = kind === "classical" && (subject.category === "civic" || r() < 0.35);
    if (district) {
      // A historic district: three of its houses in a row, each its own colour.
      const others = [V, BT, P, VT, B].filter((w) => w !== s.sky && w !== s.roof && w !== s.wall);
      const walls = [s.wall, others[0], others[1]];
      scene += trees(kind, 150 + (r() < 0.5 ? -128 : 128), s, r, 0.7);
      [-92, 0, 92].forEach((dx, i) => {
        const d = draw({ ...s, wall: walls[i] }, r);
        scene += `<g transform="translate(${150 + dx} ${G}) scale(0.56)">${d.svg}</g>`;
      });
    } else {
      const d = domed ? classical(s, true) : draw(s, r);
      const cx = 150 + (r() - 0.5) * 36;
      const side = d.tall != null ? (d.tall > 0 ? -1 : 1) : r() < 0.5 ? -1 : 1;
      scene += trees(kind, cx + side * (d.hw + 26 + r() * 10), s, r);
      if (r() < 0.4) scene += trees(kind, cx - side * (d.hw + 30), s, r, 0.8);
      scene += `<g transform="translate(${cx.toFixed(1)} ${G})">${d.svg}</g>`;
      if (d.tall != null) tallX = cx + d.tall;
    }
    scene +=
      fill(rect(-4, G, PLATE_W + 8, PLATE_H - G + 4), s.ground) +
      stroke(dashes(6, 296, G + 13, 1, 0, 10, 8, false), BT, 1.4);
  }

  // The sky: the sun (or the moon) on the side away from any spire or stack.
  // (Full-bleed planes run past the edges, so the hand-cut wobble never leaves a sliver.)
  let body = fill(rect(-4, -4, PLATE_W + 8, PLATE_H + 8), s.sky);
  const left = tallX != null ? tallX > 150 : r() < 0.5;
  const sunX = left ? 44 + r() * 36 : 220 + r() * 36;
  const sunY = 40 + r() * 22;
  const sunR = 18 + r() * 9;
  body += disc(sunX, sunY, sunR, s.sun);
  if (s.night) {
    body += disc(sunX + sunR * 0.45, sunY - sunR * 0.2, sunR * 0.85, s.sky);
    body += fill([...Array(9)].map(() => rect(10 + r() * 280, 10 + r() * 70, 2, 2)).join(""), P);
  } else if (r() < 0.5) {
    const cx = left ? 190 + r() * 60 : 40 + r() * 50;
    const cloud = s.sky === P ? BT : P;
    body += oval(cx, 34 + r() * 14, 22, 8, cloud) + oval(cx + 16, 28 + r() * 8, 14, 7, cloud);
  }
  body += scene;

  const id = `pl-${subject.id.replace(/[^a-z0-9-]/gi, "")}`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PLATE_W} ${PLATE_H}" width="${PLATE_W}" height="${PLATE_H}" preserveAspectRatio="xMidYMid slice">` +
    `<defs><clipPath id="${id}"><rect x="0" y="0" width="${PLATE_W}" height="${PLATE_H}"/></clipPath></defs>` +
    `<g clip-path="url(#${id})">${wobble(body, r)}</g></svg>`;
  return { svg, caption: `An impression · ${district ? `${KIND[kind]} district` : KIND[kind]}`, archetype: kind };
}
