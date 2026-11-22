/**
 * The landmarks' pins as the city map shows them (components/maplibre-view.tsx):
 * clustered on the drawing (radius 36, up to zoom 15, apart after), each a
 * bubble or a pin on the screen — for the scripts that lay lettering on the
 * map (the walks' tags, the districts' names) to keep clear of.
 */
import Supercluster from "supercluster";

import { landmarks } from "../../data/landmarks";
import { isoPoint } from "../../lib/iso-map";

/** A box on the screen, points: [left, top, right, bottom]. */
export type Box = [number, number, number, number];
export type Mark = { box: Box; cluster: boolean };

/** As the map clusters its pins (components/maplibre-view.tsx), and how far a bubble (with its stroke) or a pin reaches, points. */
const CLUSTERING = { radius: 36, maxZoom: 15, extent: 512 };
const bubble = (count: number) => (count < 5 ? 11 : count < 15 ? 13 : count < 40 ? 16 : count < 100 ? 19 : 22) + 2;
const PIN = 8;

/** A point of the drawing (the engine's longitude and latitude), on the screen at zoom z: Web Mercator points, as the map lays out the drawing. */
export const screenAt = ([lng, lat]: number[], z: number): [number, number] => {
  const world = 512 * 2 ** z;
  return [((lng + 180) / 360) * world, ((1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2) * world];
};

/** How much two boxes overlap, square points. */
export const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));

/** The pins and bubbles on the screen at zoom z (clustered at the zoom's whole number). */
export function landmarkMarks(): (z: number) => Mark[] {
  const index = new Supercluster(CLUSTERING).load(
    landmarks.map((l) => ({
      type: "Feature" as const,
      properties: {},
      // (Where the map stands its pins: over their buildings.)
      geometry: { type: "Point" as const, coordinates: isoPoint({ latitude: l.latitude, longitude: l.longitude }, 14) },
    })),
  );
  const cache = new Map<number, Mark[]>();
  return (z) => {
    if (!cache.has(z)) {
      cache.set(
        z,
        index.getClusters([-180, -85, 180, 85], z).map((f) => {
          const [x, y] = screenAt(f.geometry.coordinates, z);
          const cluster = !!f.properties?.cluster;
          const r = cluster ? bubble(f.properties.point_count) : PIN;
          return { box: [x - r, y - r, x + r, y + r] as Box, cluster };
        }),
      );
    }
    return cache.get(z)!;
  };
}
