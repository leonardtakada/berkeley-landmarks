import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { landmarks } from "../data/landmarks";
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

describe("the catalogue's icons", () => {
  it("are baked for every landmark, and listed", () => {
    const listed = fs.readFileSync(path.join(__dirname, "../components/landmark-icons.generated.ts"), "utf8");
    const missing = landmarks.filter((l) => !fs.existsSync(path.join(__dirname, `../assets/icons/${l.id}.png`)) || !listed.includes(`"${l.id}"`));
    expect(missing.map((l) => l.id), "run npx tsx scripts/iso/icons.ts").toEqual([]);
  });
});

describe("the walks' outlines on the city map", () => {
  it("go round every walk, route and stops, each with its label hung on it", async () => {
    const { WALK_OUTLINES } = await import("../lib/walk-outlines.generated");
    const listed = fs.readFileSync(path.join(__dirname, "../components/walk-labels.generated.ts"), "utf8");
    const inside = (p: { u: number; v: number }, ring: [number, number][]) => {
      const r = ring.map(([lat, lon]) => toLocal(lat, lon));
      let n = false;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        if (r[i].v > p.v !== r[j].v > p.v && p.u < ((r[j].u - r[i].u) * (p.v - r[i].v)) / (r[j].v - r[i].v) + r[i].u) n = !n;
      }
      return n;
    };
    const stale = tours.filter((t) => {
      const w = WALK_OUTLINES[t.id];
      if (!w || !listed.includes(`"walk-${t.id}"`) || !fs.existsSync(path.join(__dirname, `../assets/map/walks/${t.id}@3x.png`))) return true;
      const stops = t.stops.map((s) => landmarks.find((l) => l.id === s.landmarkId)!).filter(Boolean);
      const places = [...t.routeCoordinates, ...stops].map((c) => toLocal(c.latitude, c.longitude));
      // Its label's foot on the outline itself.
      const onIt = w.outline.some(([lat, lon]) => lat === w.label[0] && lon === w.label[1]);
      return !onIt || places.some((p) => !inside(p, w.outline));
    });
    expect(stale.map((t) => t.id), "run npx tsx scripts/iso/walk-outlines.ts").toEqual([]);
    expect(Object.keys(WALK_OUTLINES).sort()).toEqual(tours.map((t) => t.id).sort());
  });

  it("run anticlockwise, so the band along each one lies inside it", async () => {
    const { WALK_OUTLINES } = await import("../lib/walk-outlines.generated");
    for (const w of Object.values(WALK_OUTLINES)) {
      const r = w.outline.map(([lat, lon]) => toLocal(lat, lon));
      const area = r.reduce((s, a, i) => s + a.u * r[(i + 1) % r.length].v - r[(i + 1) % r.length].u * a.v, 0) / 2;
      expect(area).toBeGreaterThan(0);
    }
  });
});

describe("the wind on the city map's lawns", () => {
  // A lawn on the drawing: a 120 m square with a court (a hole) in it, as the map would report it.
  const R = 6378137;
  const ll = (x: number, y: number) => [(x / R) * (180 / Math.PI), ((2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180) / Math.PI];
  const square = (x0: number, y0: number, x1: number, y1: number, cw: boolean) => {
    const r = [ll(x0, y0), ll(x1, y0), ll(x1, y1), ll(x0, y1), ll(x0, y0)];
    return cw ? r.reverse() : r;
  };
  const feature = { geometry: { type: "Polygon", coordinates: [square(0, 0, 120, 120, false), square(50, 50, 70, 70, true)] } };
  const view = { x0: -100, y0: -100, x1: 250, y1: 250 };
  const toPlane = ([lng, lat]: number[]) => [(lng * Math.PI * R) / 180, R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))];

  it("blows in gusts and lulls, its waves never stopping nor turning back", async () => {
    const { gustiness } = await import("../lib/grass");
    let [last, lo, hi] = [-Infinity, Infinity, -Infinity];
    for (let t = 0; t < 120; t += 0.05) {
      const { travel, power } = gustiness(t);
      expect(travel).toBeGreaterThan(last);
      last = travel;
      [lo, hi] = [Math.min(lo, power), Math.max(hi, power)];
    }
    // Lulls and gusts: the wind's strength ranges widely.
    expect(lo).toBeLessThan(0.3);
    expect(hi).toBeGreaterThan(0.85);
  });

  it("finds the lawns in view, holes and all", async () => {
    const { lawnsOf } = await import("../lib/grass");
    const lawns = lawnsOf([feature], view);
    expect(lawns).toHaveLength(1);
    expect(lawns[0].rings).toHaveLength(2);
    expect(lawns[0].x0).toBeCloseTo(0, 3);
    expect(lawns[0].x1).toBeCloseTo(120, 3);
    // Cut to the view.
    const half = lawnsOf([feature], { x0: -10, y0: -10, x1: 60, y1: 200 });
    expect(half[0].x1).toBeCloseTo(60, 3);
  });

  it("rolls bands of light across the lawns, kept to them, out of their holes", async () => {
    const { lawnsOf, windFrame, WIND, PERIOD } = await import("../lib/grass");
    const lawns = lawnsOf([feature], view);
    const centres = (t: number) => {
      const fc = JSON.parse(windFrame(lawns, view, t, false));
      let bands = 0;
      const xs: number[] = [];
      for (const f of fc.features) {
        if (f.properties.g === WIND.crest) {
          for (const poly of f.geometry.coordinates) {
            const outer = poly[0].map(toPlane);
            bands++;
            // Every corner of a band on the lawn (within a hair of its edge).
            for (const [x, y] of outer) expect(x > -0.01 && x < 120.01 && y > -0.01 && y < 120.01).toBe(true);
            const [cx, cy] = [outer.reduce((s: number, p: number[]) => s + p[0], 0) / outer.length, outer.reduce((s: number, p: number[]) => s + p[1], 0) / outer.length];
            xs.push(cx * Math.cos(Math.PI / 6) + cy * 0.5);
            // Not in the court: the hole goes with it, or the band misses it.
            if (cx > 52 && cx < 68 && cy > 52 && cy < 68) expect(poly.length).toBeGreaterThan(1);
          }
        }
        expect(Object.values(WIND)).toContain(f.properties.g);
        if (f.properties.o !== undefined) expect(f.properties.o).toBeGreaterThan(0);
      }
      return { bands, xs };
    };
    const now = centres(1);
    expect(now.bands).toBeGreaterThan(0);
    // A moment later the light has moved on, east with the wind.
    const later = centres(1 + PERIOD * 0.1);
    expect(later.xs.reduce((a, b) => a + b, 0) / later.xs.length).not.toBeCloseTo(now.xs.reduce((a, b) => a + b, 0) / now.xs.length, 1);
    // Off the lawns, no wind at all.
    expect(JSON.parse(windFrame([], view, 1, false)).features).toEqual([]);
    // Still: the same each time, and only the bands.
    const still = windFrame(lawns, view, 0, true);
    expect(windFrame(lawns, view, 0, true)).toBe(still);
    for (const f of JSON.parse(still).features) expect(f.properties.g).toBeLessThanOrEqual(WIND.crest);
  });
});

describe("the city map's walkers", () => {
  it("walk a network of the map's streets, hidden only within its stretches", async () => {
    const { ISO_WALKS } = await import("../lib/iso-walks.generated");
    const n = ISO_WALKS.nodes.length / 2;
    expect(n, "run npx tsx scripts/iso/walks.ts").toBeGreaterThan(1000);
    expect(ISO_WALKS.links.every((i) => Number.isInteger(i) && i >= 0 && i < n)).toBe(true);
    const m = ISO_WALKS.links.length / 2;
    // (Keyed by lane: two to a stretch, one either way.)
    for (const [k, runs] of Object.entries(ISO_WALKS.hidden)) {
      expect(Number(k)).toBeLessThan(2 * m);
      expect(runs.length % 2).toBe(0);
      for (let i = 0; i < runs.length; i++) {
        expect(runs[i]).toBeGreaterThanOrEqual(i ? runs[i - 1] : 0);
        expect(runs[i]).toBeLessThanOrEqual(1);
      }
    }
  });

  it("know how much of a walker is covered, lane by lane, where they're partly out of sight", async () => {
    const { ISO_WALKS } = await import("../lib/iso-walks.generated");
    const { unpack } = await import("../lib/walker-cover");
    const m = ISO_WALKS.links.length / 2;
    const { level, base } = ISO_WALKS.sky;
    // The skylines: each a top line and a foot, its points on along the lane.
    const skyAt = new Uint32Array(2 * m + 1);
    const sky: number[] = [];
    let lanes = 0;
    unpack(ISO_WALKS.skylines, 2 * m, skyAt, sky, (next, count) => {
      lanes++;
      for (let pass = 0; pass < 2; pass++) {
        const points = count();
        expect(points === 0 ? pass : points).toBeGreaterThan(pass === 0 ? 1 : 0);
        let t = -ISO_WALKS.sky.back;
        for (let q = 0; q < points; q++) {
          const step = count();
          expect(q === 0 || step > 0).toBe(true);
          t += step;
          sky.push(t / 10, next() * level - base);
        }
      }
    });
    expect(lanes, "run npx tsx scripts/iso/walks.ts").toBeGreaterThan(1000);
    expect(skyAt[2 * m]).toBe(sky.length);
    for (const h of sky.filter((_, i) => i % 2)) {
      expect(h).toBeGreaterThanOrEqual(-base);
      expect(h).toBeLessThanOrEqual(63 * level - base + 1e-9);
    }
    // The cover cover by cover, where a lane runs steeply across the drawing.
    const cutAt = new Uint32Array(2 * m + 1);
    const cuts: number[] = [];
    unpack(ISO_WALKS.cuts, 2 * m, cutAt, cuts, (next, count) => {
      let last = 0;
      for (let runs = count(); runs > 0; runs--) {
        const [from, to] = [(next() * 64 + next()) / 4095, (next() * 64 + next()) / 4095];
        // (Each rounded out to cover more, so one may overlap the last by a step.)
        expect(from).toBeGreaterThanOrEqual(last - 1.5 / 4095);
        expect(to).toBeGreaterThan(from);
        expect(to).toBeLessThanOrEqual(1);
        cuts.push(from, to);
        last = to;
        for (let pass = 0; pass < 2; pass++) {
          const points = next();
          expect(points === 0 ? pass : points).toBeGreaterThan(pass === 0 ? 1 : 0);
          let column = -1;
          for (let q = 0; q < points; q++) {
            const [j, l] = [next(), next()];
            expect(j).toBeGreaterThan(column);
            expect(j).toBeLessThan(ISO_WALKS.columns);
            expect(l).toBeLessThanOrEqual(ISO_WALKS.levels);
            column = j;
          }
          expect(points === 0 || column === ISO_WALKS.columns - 1).toBe(true);
        }
      }
    });
    expect(cutAt[2 * m]).toBeGreaterThan(0);
  });

  it("cut a walker along the line of what covers them, leaving all of the rest in sight", async () => {
    const { inSight, clipHalf } = await import("../lib/walker-cover");
    const { FIG_W, FIG_H } = await import("../lib/walker-cast");
    const box = [0, 0, FIG_W, 0, FIG_W, FIG_H, 0, FIG_H, 0, 0];
    const inside = (r: number[], x: number, y: number) => {
      let n = false;
      for (let i = 0; i + 3 < r.length; i += 2) {
        const [x0, y0, x1, y1] = [r[i], r[i + 1], r[i + 2], r[i + 3]];
        if (y0 > y !== y1 > y && x < x0 + ((x1 - x0) * (y - y0)) / (y1 - y0)) n = !n;
      }
      return n;
    };
    expect(clipHalf(box, 0, 1, -10).length).toBe(10);
    // A gable's peak, a gap between two houses, a corner, and a tree's crown (a band).
    const lines = [
      { us: [0, 7, 14], vs: [30, 8, 30], top: 3, foot: 0 },
      { us: [0, 5, 9, 14], vs: [6, 28, 28, 4], top: 4, foot: 0 },
      { us: [0, 6.4, 7.6, 14], vs: [2, 2, 40, 40], top: 4, foot: 0 },
      { us: [0, 4, 10, 14, 0, 4, 10, 14], vs: [40, 6, 8, 40, 40, 20, 22, 40], top: 4, foot: 4 },
    ];
    const at = (us: number[], vs: number[], from: number, n: number, x: number) => {
      for (let i = from; i + 1 < from + n; i++) {
        if (x <= us[i + 1] || i + 2 === from + n) return vs[i] + ((vs[i + 1] - vs[i]) * (x - us[i])) / (us[i + 1] - us[i]);
      }
      return 0;
    };
    for (const L of lines) {
      const pieces: number[][] = [];
      inSight(box, L, 0, L.top, true, pieces);
      if (L.foot) inSight(box, L, L.top, L.foot, false, pieces);
      for (let x = 0.1; x < FIG_W; x += 0.37) {
        for (let y = 0.1; y < FIG_H; y += 0.41) {
          const top = at(L.us, L.vs, 0, L.top, x);
          const foot = L.foot ? at(L.us, L.vs, L.top, L.foot, x) : Infinity;
          // (Within a hair of the line, either will do.)
          if (Math.abs(y - top) < 0.05 || Math.abs(y - foot) < 0.05) continue;
          const seen = y < top || y > foot;
          expect(pieces.some((p) => inside(p, x, y)), `${JSON.stringify(L.vs)} at ${x.toFixed(2)}, ${y.toFixed(2)}`).toBe(seen);
        }
      }
    }
  });

  it("are the cover's architects and the townsfolk, drawn as closed shapes in their box", async () => {
    const { WALKERS, TOWNSFOLK } = await import("../lib/walker-cast");
    const { WALKER_SHAPES, FIRST_TOWNSFOLK } = await import("../lib/walker-shapes");
    expect(WALKER_SHAPES.length).toBe(WALKERS.length + TOWNSFOLK.length);
    expect(FIRST_TOWNSFOLK).toBe(WALKERS.length);
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
