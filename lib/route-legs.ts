export type LatLng = { latitude: number; longitude: number };

/** Squared planar distance, with longitude scaled for Berkeley's latitude. */
function d2(a: LatLng, b: LatLng) {
  const k = Math.cos((37.87 * Math.PI) / 180);
  const dx = (a.longitude - b.longitude) * k;
  const dy = a.latitude - b.latitude;
  return dx * dx + dy * dy;
}

function nearest(route: LatLng[], p: LatLng, from = 0): number {
  let best = from;
  let bestD = Infinity;
  for (let i = from; i < route.length; i++) {
    const d = d2(route[i], p);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Where each stop falls along the walking route, as indices into `route`.
 * Stops are walked in order, so each is searched for only beyond the
 * previous one — a route that doubles back past an earlier stop doesn't
 * confuse the order.
 */
export function stopIndices(route: LatLng[], stops: LatLng[]): number[] {
  const out: number[] = [];
  let from = 0;
  for (const s of stops) {
    const i = route.length ? nearest(route, s, from) : 0;
    out.push(i);
    from = i;
  }
  return out;
}

/**
 * The stretch of the walking route between two consecutive stops (0-based),
 * including the stops themselves. Falls back to the straight line between
 * them when the tour has no route drawn.
 */
export function legBetween(route: LatLng[], stops: LatLng[], from: number, to: number): LatLng[] {
  const a = stops[from];
  const b = stops[to];
  if (!a || !b) return [];
  if (route.length < 2) return [a, b];
  const idx = stopIndices(route, stops);
  const [i, j] = [idx[from], idx[to]].sort((x, y) => x - y);
  return [a, ...route.slice(i, j + 1), b];
}
