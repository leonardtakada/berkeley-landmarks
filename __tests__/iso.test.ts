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

  it("are the cover's architects, drawn as closed shapes in their box", async () => {
    const { WALKERS } = await import("../lib/walker-cast");
    const { WALKER_SHAPES } = await import("../lib/walker-shapes");
    expect(WALKER_SHAPES.length).toBe(WALKERS.length);
    for (const parts of WALKER_SHAPES) {
      expect(parts.length).toBeGreaterThanOrEqual(3); // keyline, coat, head…
      for (const { ink, rings } of parts) {
        expect(ink).toMatch(/^#[0-9A-F]{6}$/i);
        for (const r of rings) {
          expect(r.length % 2).toBe(0);
          expect(r.length).toBeGreaterThanOrEqual(8);
          expect([r[0], r[1]]).toEqual([r[r.length - 2], r[r.length - 1]]);
          for (let i = 0; i < r.length; i += 2) {
            expect(r[i]).toBeGreaterThan(-1.5);
            expect(r[i]).toBeLessThan(15.5);
            expect(r[i + 1]).toBeGreaterThan(-1.5);
            expect(r[i + 1]).toBeLessThan(35);
          }
        }
      }
    }
  });

  it("flatten paths and grow keylines outward", async () => {
    const { flatten, grow } = await import("../lib/walker-shapes");
    const area = (r: number[]) => {
      let a = 0;
      for (let i = 0; i < r.length - 2; i += 2) a += r[i] * r[i + 3] - r[i + 2] * r[i + 1];
      return Math.abs(a / 2);
    };
    // A circle of radius 2, by two half-ellipse arcs: close to π·4.
    const [disc] = flatten("M3 5 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 Z");
    expect(area(disc)).toBeGreaterThan(Math.PI * 4 * 0.95);
    expect(area(disc)).toBeLessThan(Math.PI * 4);
    // A 2 × 3 rectangle, relative moves; grown by ½ it's 3 × 4, either way round.
    const [box] = flatten("M1 1 h2 v3 h-2 Z");
    expect(area(box)).toBeCloseTo(6);
    expect(area(grow(box, 0.5))).toBeCloseTo(12);
    expect(area(grow([...box].reverse().flatMap((_, i, a) => (i % 2 ? [] : [a[i + 1], a[i]])), 0.5))).toBeCloseTo(12);
    // Two shapes in one path are two rings.
    expect(flatten("M0 0 L1 0 L1 1 Z M3 3 L4 3 L4 4 Z")).toHaveLength(2);
  });
});
