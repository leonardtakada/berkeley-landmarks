import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { tours } from "../data/tours";
import { iso, lngLatToPlane, planeToLngLat, toLatLon, toLocal } from "../lib/iso";

// The isometric maps (scripts/iso): the projection they share, and the
// walks' plates the fold-out maps show.

describe("the isometric projection", () => {
  it("goes to local metres and back", () => {
    const { u, v } = toLocal(37.8716, -122.2585);
    const back = toLatLon(u, v);
    expect(back.lat).toBeCloseTo(37.8716, 9);
    expect(back.lon).toBeCloseTo(-122.2585, 9);
  });

  it("draws east up to the right and north up to the left", () => {
    const o = iso(0, 0);
    const east = iso(100, 0);
    const north = iso(0, 100);
    expect(east.x).toBeGreaterThan(o.x);
    expect(east.y).toBeGreaterThan(o.y);
    expect(north.x).toBeLessThan(o.x);
    expect(north.y).toBeGreaterThan(o.y);
    // Height rises straight up the drawing.
    expect(iso(0, 0, 10)).toEqual({ x: o.x, y: o.y + 10 });
  });

  it("lays the drawing on the map engine's globe, a metre to a metre", () => {
    for (const [x, y] of [
      [0, 0],
      [5000, -3000],
      [-7000, 4000],
    ]) {
      const [lng, lat] = planeToLngLat(x, y);
      const p = lngLatToPlane(lng, lat);
      expect(p.x).toBeCloseTo(x, 4);
      expect(p.y).toBeCloseTo(y, 4);
    }
  });
});

describe("the walks' plates", () => {
  const src = fs.readFileSync(path.join(__dirname, "../components/walk-plates.generated.ts"), "utf8");
  const plates = JSON.parse(src.match(/^export const PLATE_DATA(?:: [^=]+)? = (.*);$/m)![1]);

  for (const tour of tours) {
    it(`${tour.id} has a plate, with a model and a flag for every stop`, () => {
      const plate = plates[tour.id];
      expect(plate, "run npx tsx scripts/iso/plates.ts").toBeTruthy();
      expect(fs.existsSync(path.join(__dirname, `../assets/plates/${tour.id}.png`))).toBe(true);
      expect(plate.stops.map((s: { order: number }) => s.order).sort((a: number, b: number) => a - b)).toEqual(
        tour.stops.map((s) => s.order).sort((a, b) => a - b),
      );
      for (const s of plate.stops) {
        expect(s.faces.length, s.id).toBeGreaterThan(0);
        const [x0, y0, x1, y1] = s.box;
        expect(x1 > x0 && y1 > y0, s.id).toBe(true);
        // Every flag and model is on the plate.
        for (const [x, y] of [
          [s.flag[2], s.flag[3]],
          [x0, y1],
        ]) {
          expect(x >= 0 && x <= plate.width && y >= 0 && y <= plate.height, `${s.id} at ${x},${y}`).toBe(true);
        }
      }
      expect(plate.route.length / 2).toBeGreaterThan(10);
      expect(plate.routeDepth.length).toBe(plate.route.length / 2);
    });
  }
});

describe("the city map's walkers", () => {
  it("walk a network of the map's streets, hidden only within its stretches", async () => {
    const { ISO_WALKS } = await import("../lib/iso-walks.generated");
    const n = ISO_WALKS.nodes.length / 2;
    expect(n, "run npx tsx scripts/iso/walks.ts").toBeGreaterThan(1000);
    expect(ISO_WALKS.links.every((i) => Number.isInteger(i) && i >= 0 && i < n)).toBe(true);
    const m = ISO_WALKS.links.length / 2;
    for (const [k, runs] of Object.entries(ISO_WALKS.hidden)) {
      expect(Number(k)).toBeLessThan(m);
      expect(runs.length % 2).toBe(0);
      for (let i = 0; i < runs.length; i++) {
        expect(runs[i]).toBeGreaterThanOrEqual(i ? runs[i - 1] : 0);
        expect(runs[i]).toBeLessThanOrEqual(1);
      }
    }
  });

  it("are the cover's architects, printed at every stride and facing either way", async () => {
    const { WALKERS } = await import("../lib/walker-cast");
    const src = fs.readFileSync(path.join(__dirname, "../components/walker-icons.generated.ts"), "utf8");
    const icons = [...src.matchAll(/"([a-z]+-\d[rl])": require\("\.\.\/(assets\/walkers\/[^"]+)"\)/g)];
    expect(icons.length, "run npx tsx scripts/iso/walker-icons.ts").toBe(WALKERS.length * 3 * 2);
    for (const [, name, file] of icons) {
      expect(WALKERS).toContain(name.split("-")[0]);
      expect(fs.existsSync(path.join(__dirname, "..", file)), file).toBe(true);
    }
  });
});
