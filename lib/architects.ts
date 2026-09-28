import { landmarks, type Landmark } from "../data/landmarks";
import type { Tour } from "../data/tours";

/**
 * The notable architects of the guide — the eleven whose work fills most of
 * its entries. Each has a drawn portrait (scripts/portraits) that appears on
 * the entries they designed and the walks that feature them.
 */
export type ArchitectKey =
  | "maybeck"
  | "morgan"
  | "howard"
  | "ratcliff"
  | "hays"
  | "coxhead"
  | "thomas"
  | "plachek"
  | "gutterson"
  | "yelland"
  | "esherick";

export interface Architect {
  key: ArchitectKey;
  name: string;
  surname: string;
  /** As lettered on the portrait's banner. */
  banner: string;
  years: string;
  /** One line for the caption under the portrait. */
  note: string;
  /** Matches the free-text `architect` field of a landmark. */
  match: RegExp;
}

export const ARCHITECTS: Record<ArchitectKey, Architect> = {
  howard: {
    key: "howard",
    surname: "Howard",
    name: "John Galen Howard",
    banner: "J. G. Howard",
    years: "1864–1931",
    note: "Supervising architect of the University; he gave the campus its Beaux-Arts plan and the Campanile.",
    match: /galen howard/i,
  },
  maybeck: {
    key: "maybeck",
    surname: "Maybeck",
    name: "Bernard Maybeck",
    banner: "B. Maybeck",
    years: "1862–1957",
    note: "The hills' great romantic — redwood, concrete, Gothic tracery and a tam o' shanter.",
    match: /maybeck/i,
  },
  morgan: {
    key: "morgan",
    surname: "Morgan",
    name: "Julia Morgan",
    banner: "Julia Morgan",
    years: "1872–1957",
    note: "The first woman licensed to practise architecture in California; Berkeley-trained, Paris-schooled.",
    match: /julia morgan|^morgan\b/i,
  },
  ratcliff: {
    key: "ratcliff",
    surname: "Ratcliff",
    name: "Walter H. Ratcliff Jr.",
    banner: "W. Ratcliff",
    years: "1881–1973",
    note: "Berkeley's first city architect, and the hand behind much of its downtown.",
    match: /ratcliff/i,
  },
  hays: {
    key: "hays",
    surname: "Hays",
    name: "William Charles Hays",
    banner: "W. C. Hays",
    years: "1873–1963",
    note: "Taught architecture at the University for nearly forty years; designer of Giannini Hall and several of the city's schools.",
    match: /\bhays\b/i,
  },
  coxhead: {
    key: "coxhead",
    surname: "Coxhead",
    name: "Ernest Coxhead",
    banner: "E. Coxhead",
    years: "1863–1933",
    note: "An English church architect who helped begin the Bay Region's shingled, Arts & Crafts way of building.",
    match: /coxhead/i,
  },
  thomas: {
    key: "thomas",
    surname: "Thomas",
    name: "John Hudson Thomas",
    banner: "J. H. Thomas",
    years: "1878–1945",
    note: "Berkeley's most inventive house architect, mixing Arts & Crafts with the Vienna Secession.",
    match: /hudson thomas/i,
  },
  plachek: {
    key: "plachek",
    surname: "Plachek",
    name: "James W. Plachek",
    banner: "J. W. Plachek",
    years: "1884–1948",
    note: "Downtown's civic architect: the Central Library, schools, churches and a street of commercial blocks.",
    match: /plachek/i,
  },
  gutterson: {
    key: "gutterson",
    surname: "Gutterson",
    name: "Henry Gutterson",
    banner: "H. Gutterson",
    years: "1884–1954",
    note: "Beaux-Arts trained and a collaborator of Maybeck's; Rose Walk and the Berkeley Community Theater.",
    match: /gutterson/i,
  },
  yelland: {
    key: "yelland",
    surname: "Yelland",
    name: "William R. Yelland",
    banner: "W. R. Yelland",
    years: "1890–1966",
    note: "The storybook architect: Normandy Village and the Tupper & Reed building, after the France he saw in the war.",
    match: /yelland/i,
  },
  esherick: {
    key: "esherick",
    surname: "Esherick",
    name: "Joseph Esherick",
    banner: "J. Esherick",
    years: "1914–1998",
    note: "A modernist of the Bay tradition and a longtime Berkeley professor; Greenwood Common and the Sea Ranch.",
    match: /esherick/i,
  },
};

/** In order of birth after the first five, who came first in the guide. */
const ORDER: ArchitectKey[] = [
  "maybeck",
  "morgan",
  "howard",
  "ratcliff",
  "hays",
  "coxhead",
  "thomas",
  "plachek",
  "gutterson",
  "yelland",
  "esherick",
];

/** Every notable architect credited in a free-text architect field, in order of mention. */
export function architectsIn(credit: string): ArchitectKey[] {
  return ORDER.filter((k) => ARCHITECTS[k].match.test(credit)).sort(
    (a, b) => credit.search(ARCHITECTS[a].match) - credit.search(ARCHITECTS[b].match),
  );
}

/** The notable architect of a landmark, if it has one (first credited wins). */
export function architectOf(landmark: Pick<Landmark, "architect">): ArchitectKey | null {
  return architectsIn(landmark.architect)[0] ?? null;
}

/** How many entries in the guide each notable architect is credited on. */
export function worksBy(key: ArchitectKey): Landmark[] {
  return landmarks.filter((l) => ARCHITECTS[key].match.test(l.architect));
}

/**
 * Architects met along a walk, most-featured first. The first is the walk's
 * own architect when the walk is named for them or they designed at least
 * half its stops.
 */
export function architectsOnTour(tour: Tour): { lead: ArchitectKey | null; cast: ArchitectKey[] } {
  const counts = new Map<ArchitectKey, number>();
  for (const stop of tour.stops) {
    const l = landmarks.find((x) => x.id === stop.landmarkId);
    if (!l) continue;
    for (const k of architectsIn(l.architect)) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const cast = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const named = ORDER.find((k) => ARCHITECTS[k].match.test(tour.name));
  const top = cast[0];
  const lead =
    named ?? (top && (counts.get(top) ?? 0) * 2 >= tour.stops.length ? top : null);
  return { lead, cast: lead ? [lead, ...cast.filter((k) => k !== lead)] : cast };
}
