/**
 * The guide's walks for the pocket guide: each walk's stops in order, who
 * narrates each (an architect's key, or the guide), the opening line of the
 * narration for the caption, where it stands, where the walk passes it and
 * the street it's on; and each walk's route, the way a walker takes, with the
 * street each stretch of it runs along. Everything comes from the app:
 * data/tours.ts, data/landmarks.ts, lib/architects.ts, lib/route-legs.ts,
 * the scripts in data/narration/stops/, and data/osm-streets.json.
 *
 * Writes device/main/ui/walks_gen.c. Until the SD bundle (Phase 2), this is
 * how the device knows its walks. Also writes device/main/ui/landmarks_gen.c:
 * every landmark in the guide, with where it is, its architect and year, and
 * for those with narration who opens it and its first lines, for the free map
 * (Explore) to show and lead you to.
 *
 * Run from the repo root: npx tsx scripts/device/export-walks.ts
 */
import fs from "node:fs";
import { tours } from "../../data/tours";
import { landmarks } from "../../data/landmarks";
import { ARCHITECTS, architectsOnTour } from "../../lib/architects";
import { stopIndices } from "../../lib/route-legs";

const OUT = "device/main/ui/walks_gen.c";
const OUT_LANDMARKS = "device/main/ui/landmarks_gen.c";
const CAPTION_MAX = 100;

/** The board's fonts carry ASCII, · é — ’ … and °; everything else is brought into that. */
function plain(s: string): string {
  return s
    .replace(/[“”]/g, '"')
    .replace(/‘/g, "’")
    .replace(/–/g, "-")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, (m) => (m === "́" ? m : ""))
    .normalize("NFC")
    .replace(/[^\x20-\x7E°·é—’…]/g, "");
}

/** A C string literal, with non-ASCII as UTF-8 escapes split off so hex digits can't run on. */
function cstr(s: string): string {
  let out = '"';
  for (const ch of plain(s)) {
    if (ch === '"' || ch === "\\") out += "\\" + ch;
    else if (ch.charCodeAt(0) < 0x80) out += ch;
    else out += [...Buffer.from(ch, "utf8")].map((b) => "\\x" + b.toString(16).toUpperCase()).join("") + '""';
  }
  return out + '"';
}

/** Who opens a stop's narration, and its first lines (the architect's self-introduction left out). */
function narration(landmarkId: string): { speaker: string | null; caption: string } {
  const path = `data/narration/stops/${landmarkId}.md`;
  if (!fs.existsSync(path)) return { speaker: null, caption: "" };
  const body = fs.readFileSync(path, "utf8").replace(/^---[\s\S]*?---\s*/, "");
  const m = body.match(/^## (\w+)\s*\n([\s\S]*?)(?=\n## |\s*$)/);
  if (!m) return { speaker: null, caption: "" };
  const speaker = m[1] === "guide" ? null : m[1];
  const text = m[2].replace(/\s+/g, " ").trim();
  let sentences = text.match(/[^.!?]+[.!?]+["”’]?/g) ?? [text];
  sentences = sentences.map((s) => s.trim());
  const who = speaker ? ARCHITECTS[speaker as keyof typeof ARCHITECTS] : null;
  if (who && sentences.length > 1 && sentences[0].length < 40 && sentences[0].includes(who.surname)) sentences.shift();
  let caption = "";
  for (const s of sentences) {
    if (caption && (caption + " " + s).length > CAPTION_MAX) break;
    caption = caption ? caption + " " + s : s;
    if (caption.length >= 60) break;
  }
  if (caption.length > CAPTION_MAX) caption = caption.slice(0, CAPTION_MAX).replace(/\s+\S*$/, "") + "…";
  return { speaker, caption };
}

const e6 = (d: number) => Math.round(d * 1e6);

// ── The streets the walks go along ──────────────────────────────────────────
// The guide has no compass, so standing still it says which street to take
// ("along Center St"). Each stretch of a route is matched to the OpenStreetMap
// street it runs along (data/osm-streets.json, as the guide's map letters
// them): the nearest named one within reach that runs the same way.

type LatLng = { latitude: number; longitude: number };
type Seg = { label: string; ax: number; ay: number; bx: number; by: number };
const STREET_REACH_M = 20; /* a route stretch this near a street, running with it, is along it */
const STREET_ANGLE = 30; /* degrees either way */
const STOP_REACH_M = 60; /* a stop with no stretch of street is on the nearest within this */
const CELL_M = 50;

const LAT0 = 37.87;
const M_LAT = 110540;
const M_LON = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const xy = (lat: number, lon: number): [number, number] => [(lon + 122.27) * M_LON, (lat - LAT0) * M_LAT];

/** As a street sign has it, short enough for a line: Street, Avenue, Boulevard and Junior cut down. */
function signName(s: string): string {
  return s.replace(/\bStreet\b/g, "St").replace(/\bAvenue\b/g, "Ave").replace(/\bBoulevard\b/g, "Blvd").replace(/\bJunior\b/g, "Jr");
}

const streetNames: string[] = [""]; /* 0: none; numbered as the walks come to them */
const nameIndex = new Map<string, number>();
const grid = new Map<string, Seg[]>();
{
  const pts = tours.flatMap((t) => t.routeCoordinates as LatLng[]);
  const lats = pts.map((p) => p.latitude), lons = pts.map((p) => p.longitude);
  const [s, n, w, e] = [Math.min(...lats) - 0.004, Math.max(...lats) + 0.004, Math.min(...lons) - 0.005, Math.max(...lons) + 0.005];
  type OsmWay = { tags?: Record<string, string>; bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number }; geometry?: { lat: number; lon: number }[] };
  const osm: OsmWay[] = JSON.parse(fs.readFileSync("data/osm-streets.json", "utf8")).elements;
  for (const way of osm) {
    const b = way.bounds;
    if (!way.tags?.name || !way.geometry || way.tags.highway === "motorway" || !b) continue;
    if (b.maxlat < s || b.minlat > n || b.maxlon < w || b.minlon > e) continue;
    const label = signName(plain(way.tags.name));
    for (let i = 0; i + 1 < way.geometry.length; i++) {
      const [ax, ay] = xy(way.geometry[i].lat, way.geometry[i].lon);
      const [bx, by] = xy(way.geometry[i + 1].lat, way.geometry[i + 1].lon);
      const seg: Seg = { label, ax, ay, bx, by };
      const cells = new Set<string>();
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / CELL_M));
      for (let j = 0; j <= steps; j++) {
        cells.add(`${Math.floor((ax + ((bx - ax) * j) / steps) / CELL_M)},${Math.floor((ay + ((by - ay) * j) / steps) / CELL_M)}`);
      }
      for (const c of cells) grid.set(c, [...(grid.get(c) ?? []), seg]);
    }
  }
}

/** The number a street goes by in street_names, given it the first time it's used. */
function streetNumber(label: string): number {
  let k = nameIndex.get(label);
  if (k === undefined) {
    k = streetNames.length;
    streetNames.push(label);
    nameIndex.set(label, k);
  }
  return k;
}

function distToSeg(px: number, py: number, s: Seg): number {
  const dx = s.bx - s.ax, dy = s.by - s.ay, len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - s.ax) * dx + (py - s.ay) * dy) / len2)) : 0;
  return Math.hypot(s.ax + t * dx - px, s.ay + t * dy - py);
}

/** The street nearest (x, y) within `reach`, running at `angle` (radians; any if null). */
function streetAt(x: number, y: number, angle: number | null, reach: number): string {
  let best = "", bestD = reach;
  const cx = Math.floor(x / CELL_M), cy = Math.floor(y / CELL_M), r = Math.ceil(reach / CELL_M);
  for (let i = cx - r; i <= cx + r; i++) {
    for (let j = cy - r; j <= cy + r; j++) {
      for (const s of grid.get(`${i},${j}`) ?? []) {
        const d = distToSeg(x, y, s);
        if (d >= bestD) continue;
        if (angle !== null) {
          let diff = Math.abs(Math.atan2(s.by - s.ay, s.bx - s.ax) - angle) % Math.PI;
          diff = Math.min(diff, Math.PI - diff);
          if ((diff * 180) / Math.PI > STREET_ANGLE) continue;
        }
        best = s.label;
        bestD = d;
      }
    }
  }
  return best;
}

/** The street each stretch of `route` runs along ("" where none does), a short gap between the same street filled. */
function routeStreets(route: LatLng[]): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < route.length; i++) {
    const [ax, ay] = xy(route[i].latitude, route[i].longitude);
    const [bx, by] = xy(route[i + 1].latitude, route[i + 1].longitude);
    const short = Math.hypot(bx - ax, by - ay) < 4;
    out.push(streetAt((ax + bx) / 2, (ay + by) / 2, short ? null : Math.atan2(by - ay, bx - ax), STREET_REACH_M));
  }
  for (let i = 1; i + 1 < out.length; i++) {
    if (out[i] !== "") continue;
    let j = i;
    while (j < out.length && out[j] === "") j++;
    if (j < out.length && out[i - 1] === out[j] && j - i <= 2) out.fill(out[j], i, j);
  }
  return out;
}

const lines: string[] = [
  "/* Generated by scripts/device/export-walks.ts from the app's data — do not edit. */",
  '#include "data.h"',
  "",
];
const walkRows: string[] = [];
tours.forEach((t, w) => {
  const { lead, cast } = architectsOnTour(t);
  const host = lead ?? cast[0] ?? null;
  const stops = [...t.stops].sort((a, b) => a.order - b.order);
  const lms = stops.map((s) => landmarks.find((x) => x.id === s.landmarkId)!);
  // Where the walk passes each stop, along its route (lib/route-legs.ts), as the app finds it.
  const route = t.routeCoordinates;
  const passing = route.length > 1 ? stopIndices(route, lms) : lms.map(() => -1);
  const streets = routeStreets(route);
  const rows = lms.map((l, i) => {
    const { speaker, caption } = narration(l.id);
    // The street it's on: the one the walk passes it along, else the nearest to the building.
    const p = passing[i];
    let street = p >= 0 ? streets[Math.min(p, streets.length - 1)] || streets[p - 1] || "" : "";
    if (!street) street = streetAt(...xy(l.latitude, l.longitude), null, STOP_REACH_M);
    return `    {${cstr(l.name)}, ${speaker ? cstr(speaker) : "NULL"}, ${cstr(caption)}, ${e6(l.latitude)}, ${e6(l.longitude)}, ${passing[i]}, ${Number(l.id.replace("lm-", ""))}, ${street ? streetNumber(street) : 0}},`;
  });
  const id = `walk_${String(w + 1).padStart(2, "0")}`;
  lines.push(`static const stop_t ${id}[] = {`, ...rows, "};", "");
  lines.push(`static const int32_t ${id}_route[] = {`);
  for (let k = 0; k < route.length; k += 4) {
    lines.push("    " + route.slice(k, k + 4).map((p) => `${e6(p.latitude)}, ${e6(p.longitude)},`).join(" "));
  }
  lines.push("};", "");
  const along = streets.map((s) => (s ? streetNumber(s) : 0));
  lines.push(`static const uint8_t ${id}_streets[] = {`);
  for (let k = 0; k < along.length; k += 16) lines.push("    " + along.slice(k, k + 16).join(", ") + ",");
  if (!along.length) lines.push("    0,");
  lines.push("};", "");
  walkRows.push(
    `    {${cstr(t.name)}, ${cstr(t.distance)}, ${cstr(t.duration)}, ${host ? cstr(host) : "NULL"}, ${id}, ${stops.length}, ${id}_route, ${route.length}, ${id}_streets},`,
  );
});
if (streetNames.length > 255) throw new Error(`street_names holds 255; the walks use ${streetNames.length}`);
lines.push(`const walk_t walks[WALK_COUNT] = {`, ...walkRows, "};", "");
lines.push(`const char *const street_names[] = {`, ...streetNames.map((s) => `    ${s ? cstr(s) : "NULL"},`), "};", "");
const keys = Object.keys(ARCHITECTS) as (keyof typeof ARCHITECTS)[];
lines.push(
  `const architect_t architects[] = {`,
  ...keys.map((k) => `    {${cstr(k)}, ${cstr(ARCHITECTS[k].name)}},`),
  "};",
  `const int architect_count = ${keys.length};`,
  "",
);
if (tours.length !== 12) throw new Error(`WALK_COUNT is 12; data/tours.ts has ${tours.length}`);
fs.writeFileSync(OUT, lines.join("\n"));
console.log(`${tours.length} walks, ${tours.reduce((n, t) => n + t.stops.length, 0)} stops → ${OUT}`);

/** An architect credit short enough for a line on the guide: up to 40 characters, cut at a word. */
function shortCredit(s: string): string {
  const t = plain(s.split(/[;(]/)[0].trim());
  return t.length <= 40 ? t : t.slice(0, 40).replace(/\s+\S*$/, "") + "…";
}
const rows = landmarks.map((l) => {
  const lm = Number(l.id.replace("lm-", "")) || 0; // one id isn't a plain number (lm-2753bv): no narration, so 0
  const { speaker, caption } = narration(l.id);
  const year = parseInt(l.yearBuilt, 10) || 0;
  const story = fs.existsSync(`data/narration/stops/${l.id}.md`);
  return `    {${cstr(l.name)}, ${cstr(shortCredit(l.architect || ""))}, ${year}, ${Math.round(l.latitude * 1e6)}, ${Math.round(l.longitude * 1e6)}, ${lm}, ${story && speaker ? cstr(speaker) : "NULL"}, ${story ? cstr(caption) : "NULL"}},`;
});
fs.writeFileSync(OUT_LANDMARKS, [
  "/* Generated by scripts/device/export-walks.ts from the app's data — do not edit. */",
  '#include "landmarks.h"',
  "",
  "const landmark_t landmarks[] = {",
  ...rows,
  "};",
  `const int landmark_count = ${landmarks.length};`,
  "",
].join("\n"));
console.log(`${landmarks.length} landmarks → ${OUT_LANDMARKS}`);
