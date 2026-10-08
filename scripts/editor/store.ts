/**
 * The guide's contents, read and written as the text they live in.
 *
 * `data/landmarks.ts` and `data/tours.ts` are what the app is built from;
 * `data/landmarks.json` mirrors the landmarks for the admin page and the
 * photo scripts. These functions turn an edit into the new text of each file
 * and touch nothing else: an entry is replaced block for block, so a save
 * shows in git as the entry that changed and no others. No file access here
 * (see guide.ts), so all of it is testable on strings.
 */
import { CATEGORY_LABELS, type Landmark, type LandmarkCategory, type LandmarkPhoto } from "../../data/landmarks";
import type { Tour, TourStop } from "../../data/tours";
import { stopIndices, type LatLng } from "../../lib/route-legs";

export const CATEGORIES = Object.keys(CATEGORY_LABELS) as LandmarkCategory[];
export const DESIGNATIONS = ["Landmark", "Structure of Merit", "Historic District", "Notable"] as const;

// ---------------------------------------------------------------------------
// An array of object literals, taken apart and put back as it was.
// ---------------------------------------------------------------------------

export type Block = {
  id: string;
  /** What lies between the previous block and this one: the comma, a blank line, a section comment. */
  before: string;
  /** From the opening brace to the closing one. */
  text: string;
};

export type Blocks = { head: string; blocks: Block[]; tail: string };

const ID = /^\s*id:\s*['"]([^'"]+)['"]/m;

/**
 * Splits the array that starts at `marker` into its entries. An entry opens
 * with `  {` and closes at the next line that is a lone `}` or `},` — the
 * files were written by hand and by scripts, and a few entries close at the
 * margin or a little too far in; the text between entries is kept as it is.
 */
export function splitBlocks(src: string, marker: string): Blocks {
  const open = src.indexOf(marker);
  if (open < 0) throw new Error(`Can't find "${marker.trim()}"`);
  const blocks: Block[] = [];
  let pos = open + marker.length;
  let head = "";
  let prevEnd = -1;
  let start = -1;
  while (pos < src.length) {
    let nl = src.indexOf("\n", pos);
    if (nl < 0) nl = src.length;
    const line = src.slice(pos, nl);
    if (start < 0) {
      if (line === "  {") start = pos;
      else if (line.startsWith("];") && blocks.length) break;
    } else if (/^ {0,4}\},?$/.test(line)) {
      const end = pos + line.indexOf("}") + 1;
      const text = src.slice(start, end);
      const id = ID.exec(text)?.[1];
      if (!id) throw new Error(`An entry near character ${start} has no id`);
      if (!blocks.length) head = src.slice(0, start);
      blocks.push({ id, before: prevEnd < 0 ? "" : src.slice(prevEnd, start), text });
      prevEnd = end;
      start = -1;
    }
    pos = nl + 1;
  }
  if (!blocks.length) throw new Error(`No entries after "${marker.trim()}"`);
  return { head, blocks, tail: src.slice(prevEnd) };
}

export function joinBlocks(b: Blocks): string {
  return b.head + b.blocks.map((x) => x.before + x.text).join("") + b.tail;
}

/** The entries with `text` for `id` put in place of what was there, or added at the end. */
export function putBlock(b: Blocks, id: string, text: string): Blocks {
  const at = b.blocks.findIndex((x) => x.id === id);
  if (at >= 0) {
    const blocks = b.blocks.slice();
    blocks[at] = { ...blocks[at], text };
    return { ...b, blocks };
  }
  return { ...b, blocks: [...b.blocks, { id, before: ",\n", text }] };
}

export function dropBlock(b: Blocks, id: string): Blocks {
  const at = b.blocks.findIndex((x) => x.id === id);
  if (at < 0) return b;
  if (b.blocks.length === 1) throw new Error("That is the last entry");
  const blocks = b.blocks.filter((_, i) => i !== at);
  if (at === 0) blocks[0] = { ...blocks[0], before: "" };
  return { ...b, blocks };
}

// ---------------------------------------------------------------------------
// Writing an entry the way the files write them.
// ---------------------------------------------------------------------------

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n");
const single = (s: string) => `'${esc(s).replace(/'/g, "\\'")}'`;
const template = (s: string) => `\`${esc(s).replace(/`/g, "\\`").replace(/\$\{/g, "\\${")}\``;
/** Single quotes, or a template literal for text that runs to several paragraphs. */
const lit = (s: string) => (s.includes("\n") ? template(s) : single(s));

function photoLine(p: LandmarkPhoto) {
  const parts = [`url: ${JSON.stringify(p.url)}`];
  if (p.caption) parts.push(`caption: ${JSON.stringify(p.caption)}`);
  if (p.credit) parts.push(`credit: ${JSON.stringify(p.credit)}`);
  return `      { ${parts.join(", ")} },`;
}

export function landmarkBlock(l: Landmark): string {
  const out = [
    "  {",
    `    id: ${single(l.id)},`,
    `    name: ${lit(l.name)},`,
    `    address: ${lit(l.address)},`,
    `    latitude: ${l.latitude},`,
    `    longitude: ${l.longitude},`,
    `    architect: ${lit(l.architect)},`,
    `    yearBuilt: ${lit(l.yearBuilt)},`,
    `    category: ${single(l.category)},`,
    `    landmarkNumber: ${lit(l.landmarkNumber)},`,
    `    description: ${lit(l.description)},`,
    `    style: ${lit(l.style)},`,
    `    nationalRegister: ${l.nationalRegister},`,
    `    neighborhood: ${lit(l.neighborhood)},`,
  ];
  if (l.photoUrl) out.push(`    photoUrl: ${single(l.photoUrl)},`);
  if (l.photos?.length) out.push("    photos: [", ...l.photos.map(photoLine), "    ],");
  if (l.designationType) out.push(`    designationType: ${single(l.designationType)},`);
  out.push("  }");
  return out.join("\n");
}

/** The entry as data/landmarks.json keeps it: every key present, nulls for what's blank. */
export function landmarkJson(l: Landmark): Record<string, unknown> {
  return {
    id: l.id,
    name: l.name,
    address: l.address,
    latitude: l.latitude,
    longitude: l.longitude,
    architect: l.architect || null,
    yearBuilt: l.yearBuilt || null,
    category: l.category,
    landmarkNumber: l.landmarkNumber || null,
    description: l.description || null,
    style: l.style || null,
    nationalRegister: l.nationalRegister,
    neighborhood: l.neighborhood || null,
    designationType: l.designationType ?? null,
    photoUrl: l.photoUrl ?? null,
    ...(l.photos?.length ? { photos: l.photos } : {}),
  };
}

export type JsonEntry = Record<string, unknown> & { id: string };

export function parseJson(src: string): JsonEntry[] {
  const all = JSON.parse(src);
  if (!Array.isArray(all)) throw new Error("data/landmarks.json is not a list");
  return all;
}

/** Sorted by id as a string, as the export from the database wrote it. */
export function putJson(all: JsonEntry[], l: Landmark): JsonEntry[] {
  const entry = landmarkJson(l) as JsonEntry;
  const at = all.findIndex((x) => x.id === l.id);
  if (at >= 0) return all.map((x, i) => (i === at ? entry : x));
  return [...all, entry].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export const dropJson = (all: JsonEntry[], id: string) => all.filter((x) => x.id !== id);

/** data/photo-uploads.json: who took each uploaded photograph. */
export type Uploads = Record<string, { credit: string; added: string }>;

export function printUploads(u: Uploads): string {
  const sorted = Object.fromEntries(Object.entries(u).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return JSON.stringify(sorted, null, 2) + "\n";
}
export const printJson = (all: JsonEntry[]) => JSON.stringify(all, null, 2) + "\n";

export function tourBlock(t: Tour): string {
  const stop = (s: TourStop) =>
    `      { landmarkId: ${single(s.landmarkId)}, order: ${s.order}${s.note ? `, note: ${single(s.note)}` : ""} },`;
  const point = (p: LatLng) => `      { latitude: ${p.latitude.toFixed(6)}, longitude: ${p.longitude.toFixed(6)} }`;
  return [
    "  {",
    `    id: ${single(t.id)},`,
    `    name: ${single(t.name)},`,
    `    neighborhood: ${single(t.neighborhood)},`,
    `    description: ${single(t.description)},`,
    `    author: ${single(t.author)},`,
    "    stops: [",
    ...t.stops.map(stop),
    "    ],",
    `    distance: ${single(t.distance)},`,
    `    duration: ${single(t.duration)},`,
    "    routeCoordinates: [",
    t.routeCoordinates.map(point).join(",\n"),
    "    ],",
    `    color: ${single(t.color)},`,
    "  }",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// What a reader of the form sends, made into an entry, and checked.
// ---------------------------------------------------------------------------

const text = (v: unknown) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim() : "");
const url = (v: unknown) => text(v);

/**
 * A photograph uploaded in the editor has no address on the web. It is
 * printed into assets/photos as u-<hash>.jpg and named in the data as
 * `upload:u-<hash>.jpg`, which the app finds in its bundled prints the way it
 * finds a web address.
 */
const UPLOAD_URL = /^upload:(u-[0-9a-f]{12}\.jpg)$/;
export const isUpload = (u: string) => UPLOAD_URL.test(u);
/** The file name of an upload's print. */
export const uploadFile = (u: string) => UPLOAD_URL.exec(u)?.[1];
export const uploadUrl = (file: string) => `upload:${file}`;

/** The city's number as the guide writes it: "5" and "# 5" become "#5"; "UC…" and the like are left alone. */
export function tidyNumber(v: string): string {
  const m = /^#?\s*(\d+)$/.exec(v.trim());
  return m ? `#${Number(m[1])}` : v.trim();
}

const numberOf = (v: string) => /^#(\d+)$/.exec(v)?.[1];

/** The highest city number in the guide, for the hint beside the field. */
export function highestNumber(all: Landmark[]): number {
  return Math.max(0, ...all.map((l) => Number(numberOf(tidyNumber(l.landmarkNumber ?? ""))) || 0));
}

export function cleanLandmark(raw: unknown): Landmark {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const photos = (Array.isArray(r.photos) ? r.photos : [])
    .map((p): LandmarkPhoto => {
      const q = (p ?? {}) as Record<string, unknown>;
      return {
        url: url(q.url),
        ...(text(q.caption) ? { caption: text(q.caption) } : {}),
        ...(text(q.credit) ? { credit: text(q.credit) } : {}),
      };
    })
    .filter((p) => p.url);
  const designation = text(r.designationType);
  return {
    id: text(r.id),
    name: text(r.name),
    address: text(r.address),
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    architect: text(r.architect),
    yearBuilt: text(r.yearBuilt),
    category: text(r.category) as LandmarkCategory,
    landmarkNumber: tidyNumber(text(r.landmarkNumber)),
    description: text(r.description),
    style: text(r.style),
    nationalRegister: r.nationalRegister === true,
    neighborhood: text(r.neighborhood),
    ...(designation ? { designationType: designation as Landmark["designationType"] } : {}),
    ...(url(r.photoUrl) ? { photoUrl: url(r.photoUrl) } : {}),
    ...(photos.length ? { photos } : {}),
  };
}

/** The bounds the data tests hold every landmark and route point to. */
const LAT = [37.84, 37.91] as const;
const LNG = [-122.31, -122.23] as const;

const REQUIRED: [keyof Landmark, string][] = [
  ["name", "a name"],
  ["address", "an address"],
  ["architect", "an architect (\"Unknown\" will do)"],
  ["yearBuilt", "a year"],
  ["style", "a style"],
  ["neighborhood", "a neighborhood"],
  ["description", "a description"],
];

const isWeb = (u: string) => /^https?:\/\/\S+$/.test(u);

export type Twin = { id: string; name: string; why: string };

const lower = (s: string) => s.trim().toLowerCase();

/**
 * Places already in the guide that this one may be a second copy of: the
 * same name, the same street address, or standing in the same spot with a
 * name that contains the other's. (A shared address like "U.C. Berkeley
 * Campus" doesn't count.)
 */
export function twinsOf(l: Landmark, others: Landmark[]): Twin[] {
  const [name, address] = [lower(l.name), lower(l.address)];
  const out: Twin[] = [];
  for (const o of others) {
    if (o.id === l.id) continue;
    const other = lower(o.name);
    const why =
      name && other === name
        ? "has the same name"
        : /^\d/.test(address) && lower(o.address) === address
          ? "has the same address"
          : name && other && Number.isFinite(l.latitude) && metres(l, o) < 30 && (other.includes(name) || name.includes(other))
            ? "stands in the same spot with a similar name"
            : "";
    if (why) out.push({ id: o.id, name: o.name, why });
  }
  return out;
}

export type Check = { errors: string[]; warnings: string[] };

/** What the check needs to know about uploaded photographs, which only the disk can say. */
export type UploadFacts = { has: (file: string) => boolean; credit: (url: string) => string | undefined };

export function checkLandmark(l: Landmark, others: Landmark[], uploads?: UploadFacts): Check {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!/^lm-[a-z0-9-]+$/.test(l.id)) errors.push("The id should look like lm-400");
  for (const [k, what] of REQUIRED) if (!l[k]) errors.push(`It needs ${what}`);
  if (!Number.isFinite(l.latitude) || l.latitude <= LAT[0] || l.latitude >= LAT[1])
    errors.push(`Latitude should be a number between ${LAT[0]} and ${LAT[1]}`);
  if (!Number.isFinite(l.longitude) || l.longitude <= LNG[0] || l.longitude >= LNG[1])
    errors.push(`Longitude should be a number between ${LNG[0]} and ${LNG[1]}`);
  if (!CATEGORIES.includes(l.category)) errors.push("Choose a category");
  if (l.designationType && !DESIGNATIONS.includes(l.designationType)) errors.push("Unknown designation");
  const urls = [l.photoUrl, ...(l.photos ?? []).map((p) => p.url)].filter((u): u is string => !!u);
  for (const u of urls) {
    if (isUpload(u)) {
      if (uploads && !uploads.has(uploadFile(u)!)) errors.push("A photograph you uploaded is gone; upload it again");
      else if (uploads && !uploads.credit(u)) errors.push("Say who took each photograph you upload (the credit)");
    } else if (!isWeb(u)) {
      errors.push(u === l.photoUrl ? "The lead photograph should be a web address or an upload" : `"${u.slice(0, 40)}" is not a web address`);
    }
  }

  for (const t of twinsOf(l, others).slice(0, 3)) warnings.push(`${t.name} (${t.id}) ${t.why}`);
  const number = numberOf(l.landmarkNumber);
  if (number) {
    const same = others.filter((o) => o.id !== l.id && o.landmarkNumber === l.landmarkNumber && o.designationType === l.designationType);
    for (const o of same.slice(0, 2)) warnings.push(`${o.name} (${o.id}) has the same number`);
  }
  return { errors, warnings };
}

/** The next free `lm-N`, past every number in the app's data and in the JSON. */
export function nextLandmarkId(ids: string[]): string {
  let top = 0;
  for (const id of ids) {
    const m = /^lm-(\d+)$/.exec(id);
    if (m) top = Math.max(top, Number(m[1]));
  }
  return `lm-${top + 1}`;
}

const FIELDS = [
  "name", "address", "latitude", "longitude", "architect", "yearBuilt", "category", "landmarkNumber",
  "description", "style", "nationalRegister", "neighborhood", "designationType", "photoUrl", "photos",
] as const;

/** Which fields differ between the app's entry and the JSON's (blank, null and missing count as the same). */
export function differences(a: Landmark, b: Landmark): string[] {
  const norm = (v: unknown) => (v == null || v === "" || (Array.isArray(v) && !v.length) ? null : v);
  const [x, y] = [cleanLandmark(a), cleanLandmark(b)];
  return FIELDS.filter((f) => JSON.stringify(norm(x[f])) !== JSON.stringify(norm(y[f])));
}

/** A JSON entry read as a landmark (null → blank). */
export function fromJson(e: JsonEntry): Landmark {
  return cleanLandmark({ ...e, nationalRegister: e.nationalRegister === true });
}

// ---------------------------------------------------------------------------
// Tours.
// ---------------------------------------------------------------------------

export type TourInput = {
  id: string;
  name: string;
  neighborhood: string;
  description: string;
  author: string;
  color: string;
  stops: { landmarkId: string; note?: string }[];
};

export function cleanTour(raw: unknown): TourInput {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const stops = (Array.isArray(r.stops) ? r.stops : []).map((s) => {
    const q = (s ?? {}) as Record<string, unknown>;
    return { landmarkId: text(q.landmarkId), ...(text(q.note) ? { note: text(q.note).replace(/\n+/g, " ") } : {}) };
  });
  return {
    id: text(r.id),
    name: text(r.name).replace(/\n+/g, " "),
    neighborhood: text(r.neighborhood).replace(/\n+/g, " "),
    description: text(r.description).replace(/\n+/g, " "),
    author: text(r.author).replace(/\n+/g, " "),
    color: text(r.color),
    stops,
  };
}

export function checkTour(t: TourInput, landmarks: Landmark[]): Check {
  const errors: string[] = [];
  const known = new Set(landmarks.map((l) => l.id));
  if (!/^tour-[a-z0-9-]+$/.test(t.id)) errors.push("The id should look like tour-hills");
  for (const [k, what] of [["name", "a name"], ["neighborhood", "a neighborhood"], ["description", "a description"], ["author", "an author"]] as const)
    if (!t[k]) errors.push(`It needs ${what}`);
  if (!/^#[0-9a-fA-F]{6}$/.test(t.color)) errors.push("Choose a colour");
  if (t.stops.length < 2) errors.push("A walk needs at least two stops");
  const seen = new Set<string>();
  for (const s of t.stops) {
    if (!known.has(s.landmarkId)) errors.push(`${s.landmarkId} is not in the guide`);
    if (seen.has(s.landmarkId)) errors.push(`${s.landmarkId} is a stop twice`);
    seen.add(s.landmarkId);
  }
  return { errors, warnings: [] };
}

const K = Math.cos((37.87 * Math.PI) / 180);
const M_PER_DEG = 111_320;
const M_PER_MILE = 1609.344;
export function metres(a: LatLng, b: LatLng) {
  return Math.hypot((a.longitude - b.longitude) * K, a.latitude - b.latitude) * M_PER_DEG;
}

export function lengthOf(line: LatLng[]) {
  let m = 0;
  for (let i = 1; i < line.length; i++) m += metres(line[i - 1], line[i]);
  return m;
}

/** Walking pace and time at each stop, as scripts/route-walks.ts figures a walk's time. */
const MPH = 2.6;
const MIN_PER_STOP = 6;

/**
 * A walk drawn straight from stop to stop, with its length and time, to stand
 * in until scripts/route-walks.ts draws it along the streets.
 */
export function placeholderRoute(stops: LatLng[]) {
  const line = stops.map((s) => ({ latitude: Number(s.latitude.toFixed(6)), longitude: Number(s.longitude.toFixed(6)) }));
  const miles = lengthOf(line) / M_PER_MILE;
  const hrs = Math.max(1, Math.round((miles / MPH + (stops.length * MIN_PER_STOP) / 60) * 2) / 2);
  return { routeCoordinates: line, distance: `${miles.toFixed(1)} mi`, duration: `${hrs} hr${hrs === 1 ? "" : "s"}` };
}

/**
 * The tour with the edits made. Its drawn route stays while the stops do;
 * change a stop or the order and it's reset to a straight line until redrawn.
 */
export function applyTour(input: TourInput, old: Tour | undefined, landmarks: Landmark[]): Tour {
  const stops = input.stops.map((s, i) => ({ landmarkId: s.landmarkId, order: i + 1, ...(s.note ? { note: s.note } : {}) }));
  const same = old && old.stops.length === stops.length && old.stops.every((s, i) => s.landmarkId === stops[i].landmarkId);
  const route = same
    ? { routeCoordinates: old.routeCoordinates, distance: old.distance, duration: old.duration }
    : placeholderRoute(stops.map((s) => landmarks.find((l) => l.id === s.landmarkId)!));
  return {
    id: input.id,
    name: input.name,
    neighborhood: input.neighborhood,
    description: input.description,
    author: input.author,
    stops,
    ...route,
    color: input.color,
  };
}

function distanceToLine(p: LatLng, line: LatLng[]) {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]];
    const ax = a.longitude * K, ay = a.latitude, bx = b.longitude * K, by = b.latitude;
    const px = p.longitude * K, py = p.latitude;
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * M_PER_DEG);
  }
  return best;
}

/** True for the straight line applyTour stands in: its points are the stops. */
export function isPlaceholder(t: Tour, landmarks: Landmark[]) {
  const stops = [...t.stops].sort((a, b) => a.order - b.order).map((s) => landmarks.find((l) => l.id === s.landmarkId));
  if (stops.some((s) => !s) || stops.length !== t.routeCoordinates.length) return false;
  return stops.every((s, i) => metres(s!, t.routeCoordinates[i]) < 0.5);
}

/**
 * What's wrong with a walk's route, by the same measures as
 * __tests__/walk-routes.test.ts: every stop within 170 m of the line, passed
 * in order, the ends at the first and last stop, the length as stated.
 */
export function routeProblems(t: Tour, landmarks: Landmark[]): string[] {
  const byId = new Map(landmarks.map((l) => [l.id, l]));
  const ordered = [...t.stops].sort((a, b) => a.order - b.order);
  const missing = ordered.filter((s) => !byId.has(s.landmarkId));
  if (missing.length) return [`${missing.map((s) => s.landmarkId).join(", ")} is not in the guide`];
  if (isPlaceholder(t, landmarks)) return ["The route is a straight line between stops, not yet drawn along the streets"];
  const stops = ordered.map((s) => byId.get(s.landmarkId)!);
  const route = t.routeCoordinates;
  const out: string[] = [];
  for (const s of stops) if (distanceToLine(s, route) >= 170) out.push(`The route misses ${s.name}`);
  if (!out.length) {
    const at = stopIndices(route, stops);
    for (let i = 1; i < at.length; i++) if (at[i] < at[i - 1]) out.push(`The route reaches ${stops[i].name} before ${stops[i - 1].name}`);
  }
  if (metres(route[0], stops[0]) >= 170) out.push(`The route doesn't start at ${stops[0].name}`);
  if (metres(route[route.length - 1], stops[stops.length - 1]) >= 170) out.push(`The route doesn't end at ${stops[stops.length - 1].name}`);
  if (Math.abs(lengthOf(route) / M_PER_MILE - parseFloat(t.distance)) > 0.06) out.push("The stated length doesn't match the route");
  return out;
}

export function nextTourId(name: string, taken: string[]): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "walk";
  let id = `tour-${slug}`;
  for (let n = 2; taken.includes(id); n++) id = `tour-${slug}-${n}`;
  return id;
}
