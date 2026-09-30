import type { Landmark } from "../data/landmarks";
import { ARCHITECTS, architectsIn, type ArchitectKey } from "./architects";

/**
 * The Registry's index: a query read the way a reader would put it —
 * "every Maybeck within walking distance", "Queen Anne in Elmwood",
 * "1920s downtown" — into the terms of the index (architect, style,
 * district, era), whether it's to be near where they're standing, and any
 * words left over, which are looked for anywhere in an entry.
 *
 * Terms of one kind widen the search ("Maybeck Morgan": either); terms of
 * different kinds narrow it ("Maybeck Elmwood": both).
 */

export type Facet = "architect" | "style" | "district" | "era";

export interface Term {
  facet: Facet;
  /** The words of the query it was read from, and where they were. */
  text: string;
  start: number;
  end: number;
  /** How the index names it. */
  label: string;
  /** What it matches: an architect's key or name, a style or district phrase, a decade or a year. */
  value: string;
}

export interface Query {
  terms: Term[];
  /** Asked for what's near the reader. */
  near: { start: number; end: number } | null;
  /** Words that aren't terms of the index, each to be found somewhere in an entry. */
  words: { text: string; start: number; end: number }[];
}

/** A quarter hour's walk, as the crow flies: streets add a quarter again. */
export const WALKING_M = 850;
/** Walking pace, metres a minute (the guide's own 2.6 mph), and how much longer the streets are than the crow's line. */
const M_PER_MIN = 69.7;
const DETOUR = 1.25;

export function walkMinutes(metres: number): number {
  return Math.max(1, Math.round((metres * DETOUR) / M_PER_MIN));
}

export function metresBetween(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const title = (s: string) => s.replace(/\b([a-z])/g, (c) => c.toUpperCase());

/** Words that only carry the question, never its sense. */
const STOP = new Set(
  "every all any the a an in on at of by from for to and or with show me find what which where is are was were built designed buildings building berkeley s".split(" "),
);

/** Ways of saying "near where I am". */
const NEAR = [
  "within walking distance of where i m standing",
  "within walking distance of where i am",
  "within walking distance of me",
  "within walking distance",
  "in walking distance",
  "walking distance",
  "near where i am",
  "near me",
  "near here",
  "nearby",
  "close by",
  "close to me",
  "around me",
  "around here",
];

const NUMBERS: Record<string, number> = {
  twenties: 1920,
  thirties: 1930,
  forties: 1940,
  fifties: 1950,
  sixties: 1960,
  seventies: 1970,
  eighties: 1980,
  nineties: 1890,
};

/** An entry's style, split into its parts: "Arts and Crafts / Shingle" → two. */
export function stylesOf(l: Pick<Landmark, "style">): string[] {
  return l.style
    .split(/[/,;]/)
    .map(norm)
    .filter((s) => s && !/^(unknown|n a|none|various|other)$/.test(s));
}

export function yearOf(l: Pick<Landmark, "yearBuilt">): number | null {
  const m = l.yearBuilt.match(/\d{4}/);
  return m ? parseInt(m[0], 10) : null;
}

export interface Vocabulary {
  /** Alias → architect: a notable architect's key, or another's name. */
  architects: Map<string, { label: string; value: string }>;
  /** Every run of words found in a style (so "revival" and "queen anne" both read as styles). */
  styles: Set<string>;
  /** District names, and the runs of words in them. */
  districts: Map<string, string>;
}

/** The words the index knows, gathered from the entries themselves. */
export function vocabulary(entries: Landmark[]): Vocabulary {
  const architects = new Map<string, { label: string; value: string }>();
  for (const k of Object.keys(ARCHITECTS) as ArchitectKey[]) {
    const a = ARCHITECTS[k];
    const entry = { label: a.name, value: k };
    architects.set(norm(a.name), entry);
    architects.set(norm(a.banner), entry);
    // A surname alone, unless it's one a reader might mean otherwise.
    architects.set(k === "thomas" ? "hudson thomas" : norm(a.surname), entry);
  }
  const runs = (phrase: string, into: (run: string) => void) => {
    const w = phrase.split(" ");
    for (let i = 0; i < w.length; i++) for (let j = i + 1; j <= w.length; j++) into(w.slice(i, j).join(" "));
  };
  const styles = new Set<string>();
  const districts = new Map<string, string>();
  for (const l of entries) {
    for (const part of l.architect.split(/\s*(?:[;,&]|\band\b|\bwith\b)\s*/)) {
      const name = norm(part);
      if (name.split(" ").length >= 2 && !architects.has(name) && !/unknown|various/.test(name)) {
        architects.set(name, { label: title(name), value: name });
      }
    }
    for (const s of stylesOf(l)) runs(s, (r) => !STOP.has(r) && styles.add(r));
    const d = norm(l.neighborhood);
    if (d && !/^(various|unknown)$/.test(d)) {
      districts.set(d, title(d));
      runs(d, (r) => !STOP.has(r) && !districts.has(r) && districts.set(r, title(r)));
    }
  }
  return { architects, styles, districts };
}

/** Reads a query into the index's terms. */
export function parseQuery(q: string, v: Vocabulary): Query {
  // Words, with where each lies in the query as typed.
  const words: { w: string; start: number; end: number }[] = [];
  for (const m of q.matchAll(/[A-Za-z0-9][A-Za-z0-9'’.-]*/g)) {
    const w = norm(m[0].replace(/['’]/g, " "));
    for (const part of w.split(" ").filter(Boolean)) words.push({ w: part, start: m.index!, end: m.index! + m[0].length });
  }
  const terms: Term[] = [];
  const left: Query["words"] = [];
  let near: Query["near"] = null;

  let i = 0;
  outer: while (i < words.length) {
    // "Near me", however it's said.
    for (const phrase of NEAR) {
      const n = phrase.split(" ").length;
      if (words.slice(i, i + n).map((x) => x.w).join(" ") === phrase) {
        near = { start: words[i].start, end: words[i + n - 1].end };
        i += n;
        continue outer;
      }
    }
    // The longest run of words that's a term of the index.
    for (let n = Math.min(5, words.length - i); n >= 1; n--) {
      const run = words.slice(i, i + n);
      const text = run.map((x) => x.w).join(" ");
      const span = { start: run[0].start, end: run[n - 1].end, text: q.slice(run[0].start, run[n - 1].end) };
      const architect = v.architects.get(text);
      let term: Term | null = null;
      if (architect) term = { facet: "architect", ...span, label: architect.label, value: architect.value };
      else if (v.districts.has(text)) term = { facet: "district", ...span, label: v.districts.get(text)!, value: text };
      else if (v.styles.has(text)) term = { facet: "style", ...span, label: title(text), value: text };
      else if (n === 1 && /^1[89]\d0s$/.test(text)) term = { facet: "era", ...span, label: text, value: text.slice(0, 4) };
      else if (n === 1 && /^[2-9]0s$/.test(text)) {
        const decade = String(1900 + parseInt(text, 10));
        term = { facet: "era", ...span, label: `${decade}s`, value: decade };
      } else if (n === 1 && NUMBERS[text]) term = { facet: "era", ...span, label: `${NUMBERS[text]}s`, value: String(NUMBERS[text]) };
      else if (n === 1 && /^1[89]\d\d$/.test(text)) term = { facet: "era", ...span, label: text, value: text };
      if (term) {
        terms.push(term);
        i += n;
        continue outer;
      }
    }
    if (!STOP.has(words[i].w)) left.push({ text: words[i].w, start: words[i].start, end: words[i].end });
    i++;
  }
  return { terms, near, words: left };
}

function matches(l: Landmark, t: Term): boolean {
  switch (t.facet) {
    case "architect":
      return t.value in ARCHITECTS ? architectsIn(l.architect).includes(t.value as ArchitectKey) : norm(l.architect).includes(t.value);
    case "style":
      return stylesOf(l).some((s) => ` ${s} `.includes(` ${t.value} `));
    case "district":
      return ` ${norm(l.neighborhood)} `.includes(` ${t.value} `);
    case "era": {
      const y = yearOf(l);
      if (y == null) return false;
      return t.value.length === 4 && t.label.endsWith("s") ? Math.floor(y / 10) * 10 === parseInt(t.value, 10) : l.yearBuilt.includes(t.value);
    }
  }
}

/** Whether an entry answers the query (setting aside nearness, which needs the reader's position). */
export function answers(l: Landmark, query: Query): boolean {
  const byFacet = new Map<Facet, Term[]>();
  for (const t of query.terms) byFacet.set(t.facet, [...(byFacet.get(t.facet) ?? []), t]);
  for (const ts of byFacet.values()) if (!ts.some((t) => matches(l, t))) return false;
  if (!query.words.length) return true;
  const hay = norm([l.name, l.address, l.architect, l.style, l.neighborhood, l.yearBuilt, l.description].join(" "));
  return query.words.every((w) => hay.includes(w.text));
}

/** The query with one of its terms (or its "near me") taken out. */
export function without(q: string, span: { start: number; end: number }): string {
  return (q.slice(0, span.start) + q.slice(span.end))
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(in|by|of|from|every|all)\s+/i, "")
    .replace(/\s+(in|by|of|from)$/i, "");
}
