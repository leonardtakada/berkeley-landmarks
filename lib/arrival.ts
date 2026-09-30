/**
 * Being there. The guide's stamps are earned on the spot: a walk's label
 * when the reader stands at its stop, a place's "Visited" when they stand
 * at the place. These say whether a position fix puts them there.
 */

export interface Fix {
  latitude: number;
  longitude: number;
  /** The fix's horizontal accuracy, in metres, where known. */
  accuracy?: number | null;
}

type LatLng = { latitude: number; longitude: number };

/** Within this many metres of a walk's stop, the reader is at it. */
export const ARRIVAL_RADIUS_M = 40;
/** A fix vaguer than this can't say the reader is at a stop. */
export const STOP_FIX_M = 50;
/** Within this of a building in the registry (or of a historic district's middle), the reader is there. */
export const VISIT_RADIUS_M = { building: 60, district: 300 } as const;
/** A fix vaguer than this can't say the reader is at a place. */
export const VISIT_FIX_M = 100;

/** Haversine distance in metres between two coordinates. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * How far the reader is from a walk's stop: from the building, or from
 * where the walk passes it, whichever is nearer — a big building (the
 * stadium, a school) can stand well back from the street.
 */
export function distanceToStop(fix: LatLng, stop: LatLng, passing?: LatLng | null): number {
  return Math.min(distanceMeters(fix, stop), passing ? distanceMeters(fix, passing) : Infinity);
}

/** Whether a fix puts the reader at a walk's stop: near enough, and sure enough. */
export function isAtStop(fix: Fix, stop: LatLng, passing?: LatLng | null): boolean {
  if (fix.accuracy != null && fix.accuracy > STOP_FIX_M) return false;
  return distanceToStop(fix, stop, passing) <= ARRIVAL_RADIUS_M;
}

/**
 * Where a fix puts the reader relative to a place in the registry: there
 * (allowing for the fix's own uncertainty), not there, or too unsure to say.
 */
export function placeCheck(
  fix: Fix,
  place: LatLng & { designationType?: string },
): { at: boolean; unsure: boolean; metres: number } {
  const metres = distanceMeters(fix, place);
  const radius = place.designationType === "Historic District" ? VISIT_RADIUS_M.district : VISIT_RADIUS_M.building;
  const slack = Math.min(fix.accuracy ?? 0, 30);
  const unsure = fix.accuracy != null && fix.accuracy > VISIT_FIX_M && metres <= radius + fix.accuracy;
  return { at: !unsure && metres <= radius + slack, unsure, metres };
}

/** A distance as the guide gives one: feet nearby, miles further off. */
export function howFar(metres: number): string {
  const miles = metres / 1609.34;
  return miles < 0.2 ? `${Math.max(100, Math.round((miles * 5280) / 50) * 50)} ft` : `${miles.toFixed(1)} mi`;
}
