/**
 * Landmarks modelled after their photographs, for the city map
 * (scripts/iso/models.ts draws them). Each says what the photographs show,
 * then the parts it's built from. A landmark not listed here is modelled
 * from its style.
 *
 * A part is a prism with a roof, placed on the footprint's rectangle as
 * fractions: `at: [s0, s1, t0, t1]`, s along the long side from its west
 * (or south) end, t across it from its south (or east) side. Without `at`,
 * a part is the whole footprint. Heights are true metres (the map
 * exaggerates them).
 */

/** Stone, stucco, concrete and painted wood print in paper; brick and brown shingle in a vermilion tint. */
export type Walls = "stone" | "brick";
/** Red clay tile prints in vermilion, slate and dark shingle in blue, copper in a pale blue. */
export type RoofInk = "tile" | "slate" | "copper";
export type Roof = "flat" | "hip" | "gable" | "mansard" | "pyramid" | "spire" | "dome" | "none";
/** windows; arched heads; tall bays two storeys high (a colonnade); open, dark bays (a belfry, an arcade); bands (modern strip windows). */
export type Openings = "windows" | "arched" | "tall" | "open" | "bands" | "none";

export interface Part {
  at?: [number, number, number, number];
  /** An ellipse inscribed in `at` (a drum, a turret, a stadium's bowl). */
  round?: boolean;
  /** Wall height, true metres; omitted, the building's own. */
  h?: number;
  /** Stands on the previous part's walls. */
  on?: boolean;
  /** Or starts this high, true metres. */
  z?: number;
  walls?: Walls;
  roof?: Roof;
  /** How far the roof rises, true metres. */
  rise?: number;
  roofInk?: RoofInk;
  openings?: Openings;
  /** A storey, true metres (one row of openings). */
  storey?: number;
  /** A bay, true metres (one column of openings). */
  bay?: number;
  cornice?: boolean;
  /** Pinnacles at the corners, this tall. */
  pinnacles?: number;
}

export interface LandmarkModel {
  /** What the photographs show, briefly. */
  seen: string;
  parts: Part[];
}

export const LANDMARK_MODELS: Record<string, LandmarkModel> = {
  // ── The campus ──────────────────────────────────────────────────────────
  "lm-37": {
    seen: "Sather Tower: a plain granite shaft to the clock; a belfry with three tall open arches a side; a balustrade with a pinnacle at each corner; a pyramidal spire, pale green-grey.",
    parts: [
      { h: 52, openings: "none" },
      { on: true, h: 16, openings: "open", storey: 16, bay: 3.4, cornice: true, roof: "flat", pinnacles: 4 },
      { on: true, at: [0.15, 0.85, 0.15, 0.85], h: 0.5, openings: "none", roof: "spire", rise: 22, roofInk: "copper" },
    ],
  },
  "lm-40": {
    seen: "Sather Gate: a bronze arch, green with age, on two granite piers topped with lamps, iron gates either side; no building, a gateway across the walk.",
    parts: [
      { at: [0.04, 0.2, 0.35, 0.65], h: 6, openings: "none", cornice: true, roof: "pyramid", rise: 2, roofInk: "copper" },
      { at: [0.8, 0.96, 0.35, 0.65], h: 6, openings: "none", cornice: true, roof: "pyramid", rise: 2, roofInk: "copper" },
      { z: 5, at: [0.2, 0.8, 0.44, 0.56], h: 1.6, openings: "none", walls: "stone", roof: "gable", rise: 1.2, roofInk: "copper" },
    ],
  },
  "lm-39": {
    seen: "Doe Library: a white granite Beaux-Arts block, a colonnade of giant columns along its length, a great arched window in its end pavilion, a low red tile roof set with skylights.",
    parts: [{ h: 20, openings: "tall", storey: 5, bay: 4.5, cornice: true, roof: "hip", rise: 4, roofInk: "tile" }],
  },
  "lm-61": {
    seen: "Hearst Mining Building: white walls of three storeys, three great arches at the entrance, red tile hipped roofs, green glass skylights over the middle.",
    parts: [
      { h: 15, openings: "arched", storey: 5, bay: 4.5, cornice: true, roof: "hip", rise: 4, roofInk: "tile" },
      { z: 19, at: [0.32, 0.68, 0.3, 0.7], h: 0.5, openings: "none", roof: "hip", rise: 2.5, roofInk: "copper" },
    ],
  },
  "lm-63": {
    seen: "Wheeler Hall: white granite, an arcade of round arches along the ground floor, a giant colonnade above it, a red tile roof.",
    parts: [
      { h: 5, openings: "arched", storey: 5, bay: 4.5, roof: "none" },
      { on: true, h: 14, openings: "tall", storey: 4.5, bay: 4.5, cornice: true, roof: "hip", rise: 4, roofInk: "tile" },
    ],
  },
  "lm-62": {
    seen: "South Hall: red brick with pale stone trim, three storeys of tall arched windows, a slate mansard roof.",
    parts: [{ walls: "brick", h: 14, openings: "arched", storey: 4.6, bay: 3.2, cornice: true, roof: "mansard", rise: 4.5, roofInk: "slate" }],
  },
  "lm-38": {
    seen: "Hearst Greek Theatre: open to the sky, tiers of seats in a half-circle before a stage wall of columns.",
    parts: [
      { h: 2.5, openings: "none", roof: "flat" },
      { at: [0, 0.14, 0.12, 0.88], h: 12, openings: "tall", storey: 6, bay: 4, cornice: true, roof: "flat" },
    ],
  },
  "lm-130": {
    seen: "Memorial Stadium: a great oval of pale concrete, its outer wall a ring of tall round arches.",
    parts: [{ h: 16, openings: "open", storey: 11, bay: 8, roof: "flat" }],
  },
  "lm-60": {
    seen: "Bowles Hall: grey granite Collegiate Gothic, steep gables roofed in red tile, rows of small-paned windows.",
    parts: [{ h: 15, openings: "windows", storey: 3.3, roof: "gable", rise: 6, roofInk: "tile" }],
  },
  "lm-89": {
    seen: "Giannini Hall: a pale Classical block with a row of tall columns before the entrance, a low red tile roof.",
    parts: [{ h: 12, openings: "tall", storey: 4, bay: 4, cornice: true, roof: "hip", rise: 3, roofInk: "tile" }],
  },
  "lm-66": {
    seen: "Hilgard Hall: pale stone, a long front of giant columns under a carved frieze, a flat roof.",
    parts: [{ h: 13, openings: "tall", storey: 4.2, bay: 4, cornice: true, roof: "flat" }],
  },
  "lm-65": {
    seen: "The Faculty Club: pale stucco and red tile, low and rambling among the oaks.",
    parts: [{ h: 7, openings: "arched", storey: 3.5, roof: "hip", rise: 3, roofInk: "tile" }],
  },

  // ── Downtown ────────────────────────────────────────────────────────────
  "lm-7": {
    seen: "City Hall: a grey stone Beaux-Arts front of three storeys behind a colonnade, a low slate roof, and on its ridge a green copper cupola, an open lantern under a tall spire.",
    parts: [
      { h: 13, openings: "tall", storey: 4.3, bay: 3.6, cornice: true, roof: "hip", rise: 4, roofInk: "slate" },
      { z: 17, at: [0.43, 0.57, 0.33, 0.67], h: 6, openings: "open", storey: 6, bay: 1.6, roof: "spire", rise: 9, roofInk: "copper" },
    ],
  },
  "lm-17": {
    seen: "The Central Library: pale grey concrete, Art Deco, tall windows between flat piers, a flat roof.",
    parts: [{ h: 14, openings: "tall", storey: 4.5, bay: 3.5, roof: "flat" }],
  },
  "lm-18": {
    seen: "The Chamber of Commerce Building: twelve storeys, two of pale stone with tall arches at the foot, a brick shaft, pale stone again at the top under a cornice.",
    parts: [
      { h: 8, openings: "arched", storey: 8, bay: 5, roof: "none" },
      { on: true, h: 28, walls: "brick", openings: "windows", storey: 3.4, bay: 2.6, roof: "none" },
      { on: true, h: 5, openings: "windows", storey: 2.5, bay: 2.6, cornice: true, roof: "flat" },
    ],
  },
  "lm-24": {
    seen: "The Veterans Memorial Building: pale stone, Classical with Deco carving, tall windows between fluted piers, a frieze, a flat roof.",
    parts: [{ h: 12, openings: "tall", storey: 4, bay: 3.6, cornice: true, roof: "flat" }],
  },
  "lm-15": {
    seen: "The Masonic Temple: buff brick and pale stone, four storeys, round-arched windows along the top floor, a projecting cornice.",
    parts: [
      { h: 12, openings: "windows", storey: 3.6, bay: 3, roof: "none" },
      { on: true, h: 4, openings: "arched", storey: 4, bay: 3, cornice: true, roof: "flat" },
    ],
  },
  "lm-28": {
    seen: "The Post Office: a pale stone Renaissance front, a long arcade of round arches, a row of small windows above, a cornice.",
    parts: [
      { h: 9, openings: "arched", storey: 9, bay: 4.3, roof: "none" },
      { on: true, h: 3, openings: "windows", storey: 3, bay: 4.3, cornice: true, roof: "flat" },
    ],
  },
  "lm-46": {
    seen: "The Corder Building: five storeys of salmon stucco, shopfronts along the street, iron balconies, a deep bracketed cornice.",
    parts: [
      { h: 4.5, openings: "bands", storey: 4.5, roof: "none" },
      { on: true, h: 13, openings: "windows", storey: 3.3, bay: 3, cornice: true, roof: "flat" },
    ],
  },
  "lm-16": {
    seen: "The Tupper & Reed Building: a Storybook front in brick, a steep gable, a tall chimney with a piper on top.",
    parts: [{ walls: "brick", h: 9, openings: "arched", storey: 4.5, bay: 3, roof: "gable", rise: 6, roofInk: "slate" }],
  },

  // ── Southside and the hills ─────────────────────────────────────────────
  "lm-1": {
    seen: "First Church of Christ, Scientist: low and spreading under broad dark gables with deep eaves, pale walls, tall Gothic tracery windows.",
    parts: [
      { h: 4.5, openings: "windows", storey: 4.5, roof: "flat" },
      { on: true, at: [0.12, 0.88, 0.2, 0.8], h: 3.5, openings: "arched", storey: 3.5, bay: 4, roof: "gable", rise: 8, roofInk: "slate" },
    ],
  },
  "lm-5": {
    seen: "The Berkeley City Club: pale stucco, six storeys along the street, rows of Gothic-arched windows, red tile at the eaves.",
    parts: [
      { h: 9, openings: "arched", storey: 3.6, roof: "flat" },
      { at: [0.04, 0.96, 0, 0.42], h: 23, openings: "arched", storey: 3.4, bay: 3.2, cornice: true, roof: "flat" },
    ],
  },
  "lm-21": {
    seen: "Cloyne Court: brown shingle, four storeys, rows of small-paned windows, a low dark roof.",
    parts: [{ walls: "brick", h: 13, openings: "windows", storey: 3.3, bay: 3, roof: "hip", rise: 3, roofInk: "slate" }],
  },
  "lm-14": {
    seen: "The Bancroft Hotel: yellow stucco, four storeys, a low hipped roof with deep dark eaves.",
    parts: [{ h: 13, openings: "windows", storey: 3.3, bay: 3, roof: "hip", rise: 3, roofInk: "slate" }],
  },
  "lm-32": {
    seen: "The Anna Head School: brown shingle halls of three storeys under steep gables, one front in red shingle with a gambrel gable.",
    parts: [{ walls: "brick", h: 11, openings: "windows", storey: 3.4, bay: 3, roof: "gable", rise: 6, roofInk: "slate" }],
  },
  "lm-4": {
    seen: "The Julia Morgan Center: a dark brown shingle church, broad low gables with deep eaves, banks of windows.",
    parts: [{ walls: "brick", h: 6, openings: "windows", storey: 6, bay: 3, roof: "gable", rise: 6, roofInk: "slate" }],
  },
  "lm-2": {
    seen: "The Church of the Good Shepherd: a board-and-batten Gothic chapel, a steep dark gable roof, pointed windows, a square tower with a tall shingled spire.",
    parts: [
      { at: [0.18, 1, 0.1, 0.9], h: 6, openings: "arched", storey: 6, bay: 3.5, roof: "gable", rise: 7, roofInk: "slate" },
      { at: [0, 0.26, 0.6, 1], h: 13, openings: "arched", storey: 6.5, bay: 2.5, roof: "spire", rise: 11, roofInk: "slate" },
    ],
  },
  "lm-36": {
    seen: "The Claremont Hotel: a great white hotel of many gabled wings on the hillside, a tall tower at its middle.",
    parts: [
      { h: 18, openings: "windows", storey: 3.4, bay: 3.2, roof: "gable", rise: 6, roofInk: "slate" },
      { at: [0.44, 0.56, 0.38, 0.62], h: 34, openings: "windows", storey: 3.4, bay: 3, roof: "pyramid", rise: 9, roofInk: "slate" },
    ],
  },
};
