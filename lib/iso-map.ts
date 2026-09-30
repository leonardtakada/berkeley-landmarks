/**
 * Placing things on the isometric city map (scripts/iso/city.ts): a place's
 * lat/lon → its point on the terrace it stands on → the engine's
 * longitude/latitude for that point of the drawing. Pins, walk routes and
 * the reader's own position all go through here.
 */
import { ISO_BOUNDS, ISO_LEVELS, ISO_TERRAIN } from "@/lib/iso-terrain.generated";
import { iso, lngLatToPlane, planeToLngLat, toLatLon, toLocal } from "@/lib/iso";

type LatLng = { latitude: number; longitude: number };

/** The height of the terrace under a point, metres of the drawing. */
function terraceZ(u: number, v: number): number {
  const t = ISO_TERRAIN;
  const c = Math.round((u - t.u0) / t.cell);
  const r = Math.round((v - t.v0) / t.cell);
  if (c < 0 || r < 0 || c >= t.cols || r >= t.rows) return 0;
  const level = ISO_LEVELS.charCodeAt(r * t.cols + c) - 64;
  return level < 0 ? t.shore : level * t.level;
}

/** A place's position on the map, standing `above` metres over its terrace. */
export function isoPoint(p: LatLng, above = 1): [number, number] {
  const { u, v } = toLocal(p.latitude, p.longitude);
  const q = iso(u, v, Math.max(0, terraceZ(u, v)) + above);
  return planeToLngLat(q.x, q.y);
}

/** A line on the map, following the terraces up and down (points every few metres, so it steps with them). */
export function isoLine(line: LatLng[], step = 8): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < line.length; i++) {
    const a = toLocal(line[i].latitude, line[i].longitude);
    if (i === 0) {
      out.push(isoPoint(line[i]));
      continue;
    }
    const b = toLocal(line[i - 1].latitude, line[i - 1].longitude);
    const n = Math.max(1, Math.ceil(Math.hypot(a.u - b.u, a.v - b.v) / step));
    for (let k = 1; k <= n; k++) {
      const u = b.u + ((a.u - b.u) * k) / n;
      const v = b.v + ((a.v - b.v) * k) / n;
      const q = iso(u, v, Math.max(0, terraceZ(u, v)) + 1);
      out.push(planeToLngLat(q.x, q.y));
    }
  }
  return out;
}

/** The drawing's bounds on the engine's globe, with a margin to pan into. */
export function isoBounds(margin = 0.004): [number, number, number, number] {
  const [w, s, e, n] = ISO_BOUNDS;
  return [w - margin, s - margin, e + margin, n + margin];
}

/** Where a point of the drawing lies in the city, on the ground (for a tap on the map). */
export function isoToLatLng(lng: number, lat: number): LatLng {
  const { x, y } = lngLatToPlane(lng, lat);
  // On flat ground: x = (u - v)·cos30, y = (u + v)/2.
  const c = Math.cos(Math.PI / 6);
  const u = y + x / (2 * c);
  const v = y - x / (2 * c);
  const p = toLatLon(u, v);
  return { latitude: p.lat, longitude: p.lon };
}
