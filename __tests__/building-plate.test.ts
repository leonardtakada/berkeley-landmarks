import { describe, expect, it } from "vitest";

import { landmarks } from "../data/landmarks";
import { archetypeOf, buildingPlateSvg } from "../lib/building-plate";
import { WALK_LABEL_SVG } from "../components/print-art.generated";
import { tours } from "../data/tours";

describe("drawn plates", () => {
  it("draws each style as its own kind of building", () => {
    expect(archetypeOf({ style: "Queen Anne", category: "residential" })).toBe("queenanne");
    expect(archetypeOf({ style: "Victorian / Queen Anne", category: "residential" })).toBe("queenanne");
    expect(archetypeOf({ style: "Italianate Victorian", category: "residential" })).toBe("victorian");
    expect(archetypeOf({ style: "Spanish Colonial Revival", category: "historic_district" })).toBe("mediterranean");
    expect(archetypeOf({ style: "Classical Revival", category: "residential" })).toBe("colonial");
    expect(archetypeOf({ style: "Classical Revival", category: "civic" })).toBe("classical");
    expect(archetypeOf({ style: "Collegiate Gothic", category: "educational" })).toBe("collegiate");
    expect(archetypeOf({ style: "Mid-Century Modern", category: "residential" })).toBe("modern");
    expect(archetypeOf({ style: "Moderne / Classical", category: "educational" })).toBe("deco");
    expect(archetypeOf({ style: "Arts & Crafts", category: "commercial" })).toBe("storefront");
    expect(archetypeOf({ style: "Brown Shingle", category: "historic_district" })).toBe("craftsman");
  });

  it("draws the same plate for a landmark every time, and different ones for its neighbours", () => {
    const [a, b] = landmarks.filter((l) => !l.photoUrl && l.style === "Arts & Crafts");
    expect(buildingPlateSvg(a).svg).toBe(buildingPlateSvg(a).svg);
    expect(buildingPlateSvg(a).svg).not.toBe(buildingPlateSvg(b).svg);
  });

  it("can draw every landmark without a photograph, and says it is an impression", () => {
    for (const l of landmarks.filter((x) => !x.photoUrl)) {
      const { svg, caption } = buildingPlateSvg(l);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).not.toMatch(/NaN|undefined/);
      expect(caption).toMatch(/^An impression · /);
    }
  });
});

describe("walk labels", () => {
  it("has a label for every walk", () => {
    for (const t of tours) expect(WALK_LABEL_SVG[t.id]).toMatch(/^<svg/);
  });
});
