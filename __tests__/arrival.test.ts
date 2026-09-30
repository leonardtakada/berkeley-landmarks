import { describe, expect, it } from "vitest";

import { distanceMeters, howFar, isAtStop, placeCheck } from "../lib/arrival";

// The stamps are earned on the spot (lib/arrival.ts).

const here = { latitude: 37.8703, longitude: -122.2681 };
/** A point `m` metres north of `p`. */
const north = (p: typeof here, m: number) => ({ ...p, latitude: p.latitude + m / 111_195 });

describe("being at a walk's stop", () => {
  it("counts within forty metres, on a good fix", () => {
    expect(distanceMeters(here, north(here, 30))).toBeCloseTo(30, 0);
    expect(isAtStop({ ...north(here, 30), accuracy: 10 }, here)).toBe(true);
    expect(isAtStop({ ...north(here, 60), accuracy: 10 }, here)).toBe(false);
  });

  it("doesn't count on a rough fix, however near it says you are", () => {
    expect(isAtStop({ ...here, accuracy: 120 }, here)).toBe(false);
  });

  it("counts where the walk passes a building set back from the street", () => {
    const building = north(here, 90);
    expect(isAtStop({ ...here, accuracy: 8 }, building)).toBe(false);
    expect(isAtStop({ ...here, accuracy: 8 }, building, north(here, 5))).toBe(true);
  });
});

describe("being at a place, for its Visited stamp", () => {
  it("is there beside a building, and not a street away", () => {
    expect(placeCheck({ ...north(here, 45), accuracy: 12 }, here).at).toBe(true);
    const away = placeCheck({ ...north(here, 400), accuracy: 12 }, here);
    expect(away.at).toBe(false);
    expect(away.unsure).toBe(false);
  });

  it("allows more room in a historic district", () => {
    const district = { ...here, designationType: "Historic District" };
    expect(placeCheck({ ...north(here, 250), accuracy: 12 }, district).at).toBe(true);
    expect(placeCheck({ ...north(here, 250), accuracy: 12 }, here).at).toBe(false);
  });

  it("won't say from a fix too rough to tell", () => {
    const rough = placeCheck({ ...north(here, 80), accuracy: 400 }, here);
    expect(rough.at).toBe(false);
    expect(rough.unsure).toBe(true);
  });

  it("gives the distance as the guide does", () => {
    expect(howFar(40)).toBe("150 ft");
    expect(howFar(2400)).toBe("1.5 mi");
  });
});
