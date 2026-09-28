import { describe, expect, it } from "vitest";

import { tours } from "../data/tours";
import { architectOf, architectsIn, architectsOnTour, worksBy } from "../lib/architects";

const tour = (id: string) => {
  const t = tours.find((x) => x.id === id);
  if (!t) throw new Error(`no tour ${id}`);
  return t;
};

describe("architect matching", () => {
  it("recognises every spelling of a notable architect", () => {
    expect(architectOf({ architect: "Walter H. Ratcliff, Jr." })).toBe("ratcliff");
    expect(architectOf({ architect: "Walter Ratcliff, Jr." })).toBe("ratcliff");
    expect(architectOf({ architect: "Julia Morgan, et al." })).toBe("morgan");
    expect(architectOf({ architect: "John Galen Howard" })).toBe("howard");
  });

  it("credits the first-named architect on joint work", () => {
    expect(architectOf({ architect: "Bernard Maybeck / Julia Morgan" })).toBe("maybeck");
    expect(architectsIn("F.H. Thomas/ Julia Morgan")).toEqual(["morgan"]);
  });

  it("recognises William Charles Hays under his several credits", () => {
    expect(architectOf({ architect: "William Charles Hays" })).toBe("hays");
    expect(architectOf({ architect: "Hays / Plachek" })).toBe("hays");
    expect(architectsIn("William C. Hays & Walter H. Ratcliff, Jr.")).toEqual(["hays", "ratcliff"]);
    expect(worksBy("hays").length).toBeGreaterThanOrEqual(5);
  });

  it("leaves everyone else undrawn", () => {
    expect(architectOf({ architect: "A.H. Broad" })).toBeNull();
    expect(architectOf({ architect: "Unknown" })).toBeNull();
    // A different Howard is not John Galen Howard.
    expect(architectOf({ architect: "Howard Moise" })).toBeNull();
  });

  it("counts each architect's entries in the registry", () => {
    expect(worksBy("maybeck").length).toBeGreaterThan(10);
    expect(worksBy("howard").length).toBeGreaterThan(10);
  });
});

describe("a walk's architects", () => {
  it("gives a walk named for an architect to that architect", () => {
    expect(architectsOnTour(tour("tour-maybeck")).lead).toBe("maybeck");
    expect(architectsOnTour(tour("tour-julia-morgan")).lead).toBe("morgan");
  });

  it("gives a walk to whoever designed at least half its stops", () => {
    expect(architectsOnTour(tour("tour-campus")).lead).toBe("howard");
  });

  it("leaves a mixed walk without a lead, but lists its cast", () => {
    const { lead, cast } = architectsOnTour(tour("tour-southside"));
    expect(lead).toBeNull();
    expect(cast).toEqual(expect.arrayContaining(["maybeck", "morgan"]));
  });
});
