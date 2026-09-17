/**
 * Offline OSM tile cache (native) — expo-file-system backed.
 *
 * Prefetches OSM tiles for the Berkeley bbox (37.85–37.90, -122.32 to -122.24)
 * at zooms 11–16 into the app's cache directory, a few hundred tiles at most,
 * downloading two at a time to stay polite to the tile server. Once complete,
 * the map's UrlTile template can be pointed at the on-disk cache so tiles
 * render while offline.
 */

import { Platform } from "react-native";
import type * as LegacyFS from "expo-file-system/legacy";

const BERKELEY_BBOX = { minLat: 37.85, maxLat: 37.9, minLon: -122.32, maxLon: -122.24 };
const MIN_ZOOM = 11;
const MAX_ZOOM = 16;
const MAX_TILES = 500;
const CONCURRENCY = 2;
const TILE_URL_TEMPLATE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/** UrlTile template that resolves tiles from the on-disk cache. */
export const CACHE_TEMPLATE = "file:///__tilecache__/{z}-{x}-{y}.png";

let fs: typeof LegacyFS | null = null;
async function getFS(): Promise<typeof LegacyFS | null> {
  if (Platform.OS === "web") return null;
  if (fs) return fs;
  fs = (await import("expo-file-system/legacy")) as unknown as typeof LegacyFS;
  return fs;
}

function cacheDir(F: typeof LegacyFS): string {
  return `${F.cacheDirectory ?? ""}osm-tiles`;
}

export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

function lonToTileX(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
}

/** All tile coordinates covering the Berkeley bbox at zooms 11–16 (capped). */
export function enumerateBerkeleyTiles(): TileCoord[] {
  const tiles: TileCoord[] = [];
  for (let z = MIN_ZOOM; z <= MAX_ZOOM; z++) {
    const x0 = Math.min(lonToTileX(BERKELEY_BBOX.minLon, z), lonToTileX(BERKELEY_BBOX.maxLon, z));
    const x1 = Math.max(lonToTileX(BERKELEY_BBOX.minLon, z), lonToTileX(BERKELEY_BBOX.maxLon, z));
    const y0 = Math.min(latToTileY(BERKELEY_BBOX.maxLat, z), latToTileY(BERKELEY_BBOX.minLat, z));
    const y1 = Math.max(latToTileY(BERKELEY_BBOX.maxLat, z), latToTileY(BERKELEY_BBOX.minLat, z));
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        tiles.push({ z, x, y });
        if (tiles.length >= MAX_TILES) return tiles;
      }
    }
  }
  return tiles;
}

function localPath(F: typeof LegacyFS, z: number, x: number, y: number): string {
  return `${cacheDir(F)}/${z}-${x}-${y}.png`;
}

/**
 * Prefetch Berkeley tiles into the on-disk cache. Skips files already present;
 * downloads CONCURRENCY at a time. Resolves when the queue drains.
 */
export async function prefetchBerkeleyTiles(
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const F = await getFS();
  if (!F) return;

  try {
    await F.makeDirectoryAsync(cacheDir(F), { intermediates: true });
  } catch {
    /* already exists */
  }

  const queue = enumerateBerkeleyTiles();
  const total = queue.length;
  let done = 0;
  let cursor = 0;

  const worker = async () => {
    while (cursor < queue.length) {
      const t = queue[cursor++];
      const dest = localPath(F, t.z, t.x, t.y);
      let exists = false;
      try {
        exists = await F.getInfoAsync(dest).then((i) => i.exists);
      } catch {
        exists = false;
      }
      if (!exists) {
        try {
          const url = TILE_URL_TEMPLATE.replace("{z}", String(t.z))
            .replace("{x}", String(t.x))
            .replace("{y}", String(t.y));
          const res = await F.downloadAsync(url, dest);
          if (res?.status && res.status >= 400) {
            try {
              await F.deleteAsync(dest, { idempotent: true });
            } catch {}
          }
        } catch {
          /* skip failed tile */
        }
      }
      done++;
      onProgress?.(done, total);
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

/**
 * A UrlTile template that serves cached tiles from the filesystem. Call after
 * prefetch completes; cached tiles render offline, uncached areas fall back to
 * the network template by the caller if it prefers.
 */
export function cachedTileTemplate(): Promise<string> {
  return getFS().then((F) => (F ? `file://${cacheDir(F)}/{z}-{x}-{y}.png` : CACHE_TEMPLATE));
}
