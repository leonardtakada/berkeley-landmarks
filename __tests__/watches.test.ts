import { describe, expect, it } from "vitest";

import {
  EMPTY_LEDGER,
  MAX_WATCHES,
  canFire,
  isLapsed,
  noticeCopy,
  parseLedger,
  recordFire,
  retireWatch,
  setWatch,
  shouldQuietlyRetire,
  type Watch,
} from "../lib/watches";

const T0 = Date.parse("2026-10-01T12:00:00Z");

function watch(over: Partial<Watch> = {}): Watch {
  return {
    landmarkId: "chamber-of-commerce",
    watchedAt: new Date(T0).toISOString(),
    lastFiredAt: null,
    firedCount: 0,
    status: "watching",
    notifying: true,
    ...over,
  };
}

describe("the watchlist ledger", () => {
  it("keeps only well-formed watches and fires", () => {
    const ledger = parseLedger(
      JSON.stringify({
        watches: {
          a: { watchedAt: new Date(T0).toISOString(), status: "fired", lastFiredAt: new Date(T0).toISOString(), firedCount: 2 },
          b: { watchedAt: "not-a-date" },
        },
        fires: [new Date(T0).toISOString(), "junk"],
      }),
    );
    expect(Object.keys(ledger!.watches)).toEqual(["a"]);
    expect(ledger!.watches.a.status).toBe("fired");
    expect(ledger!.fires).toHaveLength(1);
  });

  it("round-trips nothing as null", () => {
    expect(parseLedger(null)).toBeNull();
    expect(parseLedger("oops")).toBeNull();
  });

  it("retires without double-retiring", () => {
    let ledger = setWatch(EMPTY_LEDGER, "a", watch());
    ledger = retireWatch(ledger, "a");
    expect(ledger.watches.a.status).toBe("retired");
    expect(retireWatch(ledger, "a")).toBe(ledger);
  });
});

describe("the throttles", () => {
  it("holds one notice an hour and three a day", () => {
    const hour = 3600_000;
    let ledger = { ...EMPTY_LEDGER, fires: [] as string[] };
    expect(canFire(ledger, T0)).toBe(true);
    ledger = { ...ledger, fires: [new Date(T0 - 5 * 60_000).toISOString()] };
    expect(canFire(ledger, T0)).toBe(false); // one this hour
    ledger = { ...ledger, fires: [new Date(T0 - 2 * hour).toISOString(), new Date(T0 - 3 * hour).toISOString(), new Date(T0 - 4 * hour).toISOString()] };
    expect(canFire(ledger, T0)).toBe(false); // three today (same UTC day edge cases aside)
    ledger = { ...ledger, fires: [new Date(T0 - 26 * hour).toISOString()] };
    expect(canFire(ledger, T0)).toBe(true);
  });

  it("records a fire: the watch is fired, the count kept", () => {
    let ledger = setWatch(EMPTY_LEDGER, "a", watch());
    ledger = recordFire(ledger, "a", T0);
    expect(ledger.watches.a.status).toBe("fired");
    expect(ledger.watches.a.firedCount).toBe(1);
    expect(ledger.watches.a.lastFiredAt).toBe(new Date(T0).toISOString());
  });
});

describe("the lapse", () => {
  it("asks after six months, lets go after a year", () => {
    const day = 24 * 3600_000;
    const now = T0 + 200 * day;
    expect(isLapsed(watch({ watchedAt: new Date(T0).toISOString() }), now)).toBe(true);
    expect(isLapsed(watch({ watchedAt: new Date(now - 10 * day).toISOString() }), now)).toBe(false);
    const later = T0 + 400 * day;
    expect(shouldQuietlyRetire(watch({ watchedAt: new Date(T0).toISOString() }), later)).toBe(true);
    expect(shouldQuietlyRetire(watch({ watchedAt: new Date(later - 100 * day).toISOString() }), later)).toBe(false);
  });
});

describe("the notice's voice", () => {
  it("is at the door of a building, at the edge of a district", () => {
    expect(noticeCopy("Chamber of Commerce").body).toBe("You're at the door of Chamber of Commerce.");
    expect(noticeCopy("Elmwood District", "Historic District").body).toBe("You're walking the edge of Elmwood District.");
  });
});

describe("the case", () => {
  it("holds twenty watches", () => {
    expect(MAX_WATCHES).toBe(20);
  });
});
