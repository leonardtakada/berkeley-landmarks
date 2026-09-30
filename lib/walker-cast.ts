import type { ArchitectKey } from "./architects";

/**
 * The guide's architects as tiny cut-paper walkers: a coat, and the hat,
 * hair or beard each is known by. Drawn in a 14 × 34 box, feet at the
 * bottom middle — out walking the cover's streets (components/logo-walkers)
 * and the city map's (scripts/iso/walker-icons.ts prints them for it).
 */
export const FIG_W = 14;
export const FIG_H = 34;

export const WALKER_INK = {
  charcoal: "#2E2A27",
  paper: "#FDFAF2",
  blueTint: "#C9D0E4",
  vermilionTint: "#F4CDB9",
  grey: "#D9D2C4",
};
const { charcoal: C, paper: P, blueTint: BT, vermilionTint: VT, grey: GREY } = WALKER_INK;

/** A shape of one ink, as an SVG path in the figure's box. */
export type Mark = { d: string; fill: string };
export type Figure = { coat: string; skirt?: boolean; head?: string; marks: Mark[] };

const ellipse = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx - rx} ${cy} a${rx} ${ry} 0 1 0 ${2 * rx} 0 a${rx} ${ry} 0 1 0 ${-2 * rx} 0 Z`;
const circle = (cx: number, cy: number, r: number) => ellipse(cx, cy, r, r);
const rect = (x: number, y: number, w: number, h: number) => `M${x} ${y} h${w} v${h} h${-w} Z`;

/** The coat, straight or skirted; the head. */
export const BODY = { coat: "M4 11.4 H10 L11.2 24.4 H2.8 Z", skirt: "M4.2 11.4 H9.8 L12.4 26 H1.6 Z" };
export const HEAD = circle(7, 7.6, 3.6);
export const HEAD_INK = VT;
/** The legs: strips hung from the hip, swinging about their tops as the walker strides. */
export const LEGS = { top: 22, width: 2.2, height: 12, left: [4.8, 7], swing: 26, ink: C };

export const CAST: Record<ArchitectKey, Figure> = {
  maybeck: {
    coat: C,
    marks: [
      { d: "M4 8.6 Q7 17 10 8.6 Z", fill: P },
      { d: ellipse(7.6, 4.6, 4.6, 1.7), fill: C },
      { d: circle(8, 2.9, 1), fill: C },
    ],
  },
  morgan: {
    coat: BT,
    skirt: true,
    marks: [
      { d: "M3.4 8 Q3.6 3.6 7 3.6 Q10.4 3.6 10.6 8 Q9.6 5.8 7 5.8 Q4.4 5.8 3.4 8 Z", fill: C },
      { d: circle(10.4, 5.8, 1.9), fill: C },
    ],
  },
  howard: {
    coat: C,
    marks: [
      { d: rect(4.4, 0.2, 5.2, 4.4), fill: C },
      { d: rect(3, 4.2, 8, 1.1), fill: C },
    ],
  },
  ratcliff: {
    coat: BT,
    marks: [
      { d: "M3.4 7.4 Q3.6 3.8 7 3.8 Q10.4 3.8 10.6 7.4 Q9 5.8 7 5.8 Q5 5.8 3.4 7.4 Z", fill: C },
      { d: rect(4.2, 7.4, 5.6, 1), fill: C },
    ],
  },
  hays: {
    coat: P,
    marks: [
      { d: "M3.4 8 Q3.4 3.8 7 3.8 Q10.6 3.8 10.6 8 Q9.4 6 7 6 Q4.6 6 3.4 8 Z", fill: GREY },
      { d: rect(4.2, 7.6, 5.6, 0.8), fill: C },
    ],
  },
  coxhead: {
    coat: C,
    marks: [
      { d: "M3.4 9 Q3.2 6.4 4.2 5.8 L4.8 8.4 Z M10.6 9 Q10.8 6.4 9.8 5.8 L9.2 8.4 Z", fill: GREY },
      { d: "M5 10 Q7 14.6 9 10 Z", fill: GREY },
    ],
  },
  thomas: {
    coat: P,
    marks: [{ d: "M3.2 8 Q3.2 3.6 7 3.6 Q10.8 3.6 10.8 8 Q9.4 5.4 7 6.2 Q4.6 5.4 3.2 8 Z", fill: C }],
  },
  plachek: {
    coat: C,
    marks: [
      { d: "M3.4 7.6 Q3.4 3.4 7 3.4 Q10.6 3.4 10.6 7.6 Q9.6 5.4 7 6.6 Q4.4 5.4 3.4 7.6 Z", fill: C },
      { d: "M5.6 12.4 L7 16 L8.4 12.4 Z", fill: P },
    ],
  },
  gutterson: {
    coat: VT,
    marks: [
      { d: "M3.4 9 Q3.2 6.6 4 6 L4.8 8.6 Z M10.6 9 Q10.8 6.6 10 6 L9.2 8.6 Z", fill: C },
      { d: "M8.4 9.8 H11.4 V11.4 H10.4 Z", fill: C },
    ],
  },
  yelland: {
    coat: BT,
    head: P,
    marks: [{ d: "M3 6.2 Q3.4 3 7 3 Q10.6 3 11 5.2 L12.6 6.4 Z", fill: C }],
  },
  esherick: {
    coat: P,
    marks: [
      { d: "M3.4 7 Q3.4 3.8 7 3.8 Q10.6 3.8 10.6 7 Q9.4 5.6 7 5.6 Q4.6 5.6 3.4 7 Z", fill: GREY },
      { d: rect(4, 7.2, 6, 1.3), fill: C },
      { d: rect(4.6, 11.2, 4.8, 2.2), fill: C },
    ],
  },
};

export const WALKERS = Object.keys(CAST) as ArchitectKey[];
