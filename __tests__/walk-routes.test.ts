import { describe, expect, it } from "vitest";

import { landmarks } from "../data/landmarks";
import { tours } from "../data/tours";
import { stopIndices, type LatLng } from "../lib/route-legs";

// The walks are routed along the streets and paths by scripts/route-walks.ts;
// these check what that promises.

const K = Math.cos((37.87 * Math.PI) / 180);
const metres = (a: LatLng, b: LatLng) => Math.hypot((a.longitude - b.longitude) * K, a.latitude - b.latitude) * 111_320;

function distanceToLine(p: LatLng, line: LatLng[]) {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]];
    const ax = a.longitude * K, ay = a.latitude, bx = b.longitude * K, by = b.latitude;
    const px = p.longitude * K, py = p.latitude;
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * 111_320);
  }
  return best;
}

describe("the walks", () => {
  for (const tour of tours) {
    const stops = [...tour.stops]
      .sort((a, b) => a.order - b.order)
      .map((s) => landmarks.find((l) => l.id === s.landmarkId)!);
    const route = tour.routeCoordinates;

    it(`${tour.id} passes every stop, in order`, () => {
      for (const s of stops) expect(distanceToLine(s, route), s.name).toBeLessThan(170);
      const at = stopIndices(route, stops);
      for (let i = 1; i < at.length; i++) expect(at[i], stops[i].name).toBeGreaterThanOrEqual(at[i - 1]);
      // It starts at the first stop and ends at the last.
      expect(metres(route[0], stops[0])).toBeLessThan(170);
      expect(metres(route[route.length - 1], stops[stops.length - 1])).toBeLessThan(170);
    });

    it(`${tour.id} is as long as it says`, () => {
      let m = 0;
      for (let i = 1; i < route.length; i++) m += metres(route[i - 1], route[i]);
      expect(Math.abs(m / 1609.344 - parseFloat(tour.distance))).toBeLessThanOrEqual(0.06);
    });
  }
});
