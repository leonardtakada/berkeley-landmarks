/**
 * The guide's isometric view of Berkeley, as the cover device draws it:
 * seen from the south-west and above, so east runs up to the right and
 * north up to the left, the flats in front and the hills rising behind.
 *
 * Positions go lat/lon → local metres (u east, v north, about the centre of
 * the city) → the iso plane (x right, y up, in metres of the drawing).
 * Heights (z) rise straight up the drawing, at the same scale.
 */

export const ORIGIN = { lat: 37.87, lon: -122.27 };
const M_PER_DEG_LAT = 110_950;
const M_PER_DEG_LON = 111_320 * Math.cos((ORIGIN.lat * Math.PI) / 180);
const COS30 = Math.cos(Math.PI / 6);

/** Local metres east (u) and north (v) of the origin. */
export function toLocal(lat: number, lon: number): { u: number; v: number } {
  return { u: (lon - ORIGIN.lon) * M_PER_DEG_LON, v: (lat - ORIGIN.lat) * M_PER_DEG_LAT };
}

export function toLatLon(u: number, v: number): { lat: number; lon: number } {
  return { lat: ORIGIN.lat + v / M_PER_DEG_LAT, lon: ORIGIN.lon + u / M_PER_DEG_LON };
}

/** A point on the iso plane, metres: x to the right, y up the drawing. */
export function iso(u: number, v: number, z = 0): { x: number; y: number } {
  return { x: (u - v) * COS30, y: (u + v) * 0.5 + z };
}

/** How far into the drawing a point lies: larger is further back, drawn first. */
export function depth(u: number, v: number): number {
  return u + v;
}

/**
 * The iso plane laid out as if it were the globe, for the map engine: its
 * metres become longitude and latitude near 0°, 0° (Web Mercator, where a
 * metre is a metre at the equator), so the engine pans, zooms and tiles the
 * drawing as it would a map.
 */
const R = 6378137;
export function planeToLngLat(x: number, y: number): [number, number] {
  return [((x / R) * 180) / Math.PI, ((2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180) / Math.PI];
}

export function lngLatToPlane(lng: number, lat: number): { x: number; y: number } {
  return { x: (lng * Math.PI * R) / 180, y: R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) };
}
