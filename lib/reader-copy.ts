/**
 * The reader's own copy of the guide: what they've done with it, and when.
 *
 * - `visited`: places they've been — stamped on the entry with the day.
 * - `labels`: on each walk, the travel label of every stop they've stood at.
 * - `walked`: walks walked to the end (or stamped as walked by hand); a
 *   walked walk's stamp goes in the Appendix, like a passport's.
 * - `corners`: pages they've turned a corner down on.
 *
 * Days are the reader's own calendar days, "YYYY-MM-DD". Everything here is
 * a pure function of the copy; lib/reader-copy-context.tsx keeps it.
 */

export type Day = string;

export interface ReaderCopy {
  visited: Record<string, Day>;
  labels: Record<string, Record<string, Day>>;
  walked: Record<string, Day>;
  corners: Record<string, Day>;
}

export const EMPTY_COPY: ReaderCopy = { visited: {}, labels: {}, walked: {}, corners: {} };

export function today(now = new Date()): Day {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "April 17, 2027", or as a date stamp sets it, "17 APR 2027". */
export function formatDay(day: Day, style: "long" | "stamp" = "long"): string {
  const [y, m, d] = day.split("-").map(Number);
  const month = MONTHS[m - 1] ?? "";
  return style === "stamp" ? `${d} ${month.slice(0, 3).toUpperCase()} ${y}` : `${month} ${d}, ${y}`;
}

/**
 * The label of a walk's stop, collected on the day. Standing there counts as
 * a visit too; and the last of a walk's labels finishes the walk.
 */
export function collectLabel(copy: ReaderCopy, tourId: string, stopIds: string[], landmarkId: string, day: Day) {
  const had = copy.labels[tourId] ?? {};
  if (had[landmarkId]) return { copy, added: false, finished: false };
  const labels = { ...had, [landmarkId]: day };
  const finished = !copy.walked[tourId] && stopIds.every((id) => labels[id]);
  return {
    copy: {
      ...copy,
      labels: { ...copy.labels, [tourId]: labels },
      visited: copy.visited[landmarkId] ? copy.visited : { ...copy.visited, [landmarkId]: day },
      walked: finished ? { ...copy.walked, [tourId]: day } : copy.walked,
    },
    added: true,
    finished,
  };
}

/** Sets or clears one of the copy's marks: a visit, a walk, a turned-down corner. */
export function setMark(copy: ReaderCopy, kind: "visited" | "walked" | "corners", id: string, day: Day | null): ReaderCopy {
  const marks = { ...copy[kind] };
  if (day) marks[id] = day;
  else delete marks[id];
  const next = { ...copy };
  next[kind] = marks;
  return next;
}

/** Reads a stored copy, keeping only what's well formed. */
export function parseCopy(raw: string | null): ReaderCopy | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    const days = (o: unknown): Record<string, Day> =>
      Object.fromEntries(
        Object.entries(o && typeof o === "object" ? o : {}).filter(
          ([, d]) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d),
        ),
      );
    return {
      visited: days(v.visited),
      labels: Object.fromEntries(Object.entries(v.labels && typeof v.labels === "object" ? v.labels : {}).map(([k, o]) => [k, days(o)])),
      walked: days(v.walked),
      corners: days(v.corners),
    };
  } catch {
    return null;
  }
}

/**
 * Earlier versions kept favourites, visits and walk stamps as bare lists of
 * ids, with no days; they come across dated the day they're read.
 */
export function migrateLists(
  old: { favorites?: string[]; visited?: string[]; stamps?: Record<string, string[]> },
  stops: Record<string, string[]>,
  day: Day,
): ReaderCopy {
  let copy: ReaderCopy = EMPTY_COPY;
  for (const id of old.favorites ?? []) copy = setMark(copy, "corners", id, day);
  for (const id of old.visited ?? []) copy = setMark(copy, "visited", id, day);
  for (const [tourId, ids] of Object.entries(old.stamps ?? {})) {
    for (const id of ids) copy = collectLabel(copy, tourId, stops[tourId] ?? [], id, day).copy;
  }
  return copy;
}
