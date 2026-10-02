/**
 * The reader's watchlist: the places they've asked the guide to keep an eye
 * out for — "Watch this place" — so that the next time they're near one,
 * with the phone in pocket or bag, the guide quietly tells them.
 *
 * Everything here is on-device: the ledger lives beside the reader's copy
 * in the local store, and no landmark is ever announced unless the reader
 * asked to watch it. A reader's fullest case holds twenty watches.
 *
 * The logic is pure; lib/watch-places.tsx keeps the fences and the notices.
 */

export type WatchStatus = "watching" | "fired" | "retired";

export interface Watch {
  landmarkId: string;
  /** When the reader chose the place, ISO. */
  watchedAt: string;
  /** When its notice last went out, ISO — null if it never has. */
  lastFiredAt: string | null;
  firedCount: number;
  status: WatchStatus;
  /**
   * Whether notices can be delivered for this watch. False is the quiet
   * degradation to a bookmark: kept, listed, never a word.
   */
  notifying: boolean;
}

export interface WatchLedger {
  watches: Record<string, Watch>;
  /** When each notice went out, ISO — the throttle's memory, kept across restarts. */
  fires: string[];
}

export const EMPTY_LEDGER: WatchLedger = { watches: {}, fires: [] };

/** A reader's fullest case holds twenty watches (and so does the phone). */
export const MAX_WATCHES = 20;

/** Notices are few on purpose: no more than this many… */
export const MAX_PER_HOUR = 1;
/** …per hour, and… */
export const MAX_PER_DAY = 3;
/** …a watch that fired and was left — not tapped — stays quiet this long. */
export const RE_FIRE_BLOCK_MS = 30 * 24 * 3600 * 1000;
/** A watch unvisited by its reader for six months is asked after; … */
export const LAPSE_MS = 182 * 24 * 3600 * 1000;
/** …one left a year is let go quietly, so no fence grows stale. */
export const QUIET_RETIRE_MS = 365 * 24 * 3600 * 1000;

const ISO = /^\d{4}-\d{2}-\d{2}T/;

/** Reads a stored ledger, keeping only what's well formed. */
export function parseLedger(raw: string | null): WatchLedger | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    const iso = (s: unknown): string | null => (typeof s === "string" && ISO.test(s) ? s : null);
    const watches: Record<string, Watch> = {};
    for (const [id, w] of Object.entries(v.watches && typeof v.watches === "object" ? v.watches : {})) {
      const w2 = w as Partial<Watch>;
      const watchedAt = iso(w2.watchedAt);
      if (!w2 || typeof w2 !== "object" || !watchedAt) continue;
      const status = w2.status === "fired" || w2.status === "retired" ? w2.status : "watching";
      watches[id] = {
        landmarkId: id,
        watchedAt,
        lastFiredAt: iso(w2.lastFiredAt),
        firedCount: typeof w2.firedCount === "number" ? w2.firedCount : 0,
        status,
        notifying: w2.notifying !== false,
      };
    }
    const fires = Array.isArray(v.fires) ? v.fires.filter((s: unknown): s is string => iso(s) != null) : [];
    return { watches, fires };
  } catch {
    return null;
  }
}

/** Sets or clears one watch in the ledger. */
export function setWatch(ledger: WatchLedger, landmarkId: string, watch: Watch | null): WatchLedger {
  const watches = { ...ledger.watches };
  if (watch) watches[landmarkId] = watch;
  else delete watches[landmarkId];
  return { ...ledger, watches };
}

/** Marks a watch as it retires — tapped through, stamped, or let go. */
export function retireWatch(ledger: WatchLedger, landmarkId: string): WatchLedger {
  const w = ledger.watches[landmarkId];
  if (!w || w.status === "retired") return ledger;
  return setWatch(ledger, landmarkId, { ...w, status: "retired" });
}

/** A watch six months unvisited is asked after, not renewed silently. */
export function isLapsed(watch: Watch, now = Date.now()): boolean {
  return now - Date.parse(watch.watchedAt) > LAPSE_MS;
}

/** A watch a year untouched is let go quietly, during fence sync. */
export function shouldQuietlyRetire(watch: Watch, now = Date.now()): boolean {
  return now - Date.parse(watch.watchedAt) > QUIET_RETIRE_MS;
}

/** Whether the throttles allow a notice out just now: an hour holds one, a day three. */
export function canFire(ledger: WatchLedger, now = Date.now()): boolean {
  const recent = ledger.fires.map((t) => Date.parse(t)).filter((t) => Number.isFinite(t) && now - t >= 0);
  if (recent.some((t) => now - t < 3600_000)) return false;
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  if (recent.filter((t) => t >= midnight.getTime()).length >= MAX_PER_DAY) return false;
  return true;
}

/** Records a notice as sent: its watch is fired, the throttle remembers. */
export function recordFire(ledger: WatchLedger, landmarkId: string, now = Date.now()): WatchLedger {
  const w = ledger.watches[landmarkId];
  if (!w) return ledger;
  return {
    watches: {
      ...ledger.watches,
      [landmarkId]: { ...w, status: "fired", lastFiredAt: new Date(now).toISOString(), firedCount: w.firedCount + 1 },
    },
    fires: [...ledger.fires.slice(-8), new Date(now).toISOString()],
  };
}

/**
 * What the notice says, in the guide's voice: at the door of a building,
 * at the edge of a district — distance-honest, no exclamations.
 */
export function noticeCopy(name: string, designationType?: string): { title: string; body: string } {
  if (designationType === "Historic District") {
    return { title: "Nearby", body: `You're walking the edge of ${name}.` };
  }
  return { title: "Nearby", body: `You're at the door of ${name}.` };
}
