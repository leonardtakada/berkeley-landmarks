/**
 * Offline OSM tile cache (web) — IndexedDB-backed.
 *
 * Tiles for the Berkeley area are cached after first view: any tile the map
 * requests at zooms 11–17 is stored, and a modest background prefetch warms
 * the surrounding bbox at low zooms. When offline, cached tiles are served
 * from IndexedDB as blob URLs.
 */

const DB_NAME = "berkeley-tours-tiles";
const STORE = "tiles";
const DB_VERSION = 1;

/** Berkeley tile prefetch window. */
export const WEB_TILE_BBOX = { minLat: 37.85, maxLat: 37.9, minLon: -122.32, maxLon: -122.24 };
export const WEB_CACHE_ZOOMS = { min: 11, max: 17 } as const;
/** Low-zoom background prefetch only — keeps the tile server load tiny. */
const PREFETCH_ZOOMS = { min: 11, max: 14 } as const;
const TILE_URL_TEMPLATE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const MAX_PREFETCH_TILES = 80;
const PREFETCH_CONCURRENCY = 2;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
  return dbPromise;
}

function keyFor(z: number, x: number, y: number): string {
  return `${z}/${x}/${y}`;
}

export function tileUrl(z: number, x: number, y: number): string {
  return TILE_URL_TEMPLATE.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
}

export async function getCachedTile(z: number, x: number, y: number): Promise<Blob | null> {
  try {
    const db = await openDB();
    return await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(keyFor(z, x, y));
      req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export function putCachedTile(z: number, x: number, y: number, blob: Blob): void {
  openDB()
    .then((db) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(blob, keyFor(z, x, y));
    })
    .catch(() => {
      /* cache is best-effort */
    });
}

function lonToTileX(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
}

export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

export function enumerateBBoxTiles(
  bbox = WEB_TILE_BBOX,
  zooms: { min: number; max: number } = PREFETCH_ZOOMS,
  cap = MAX_PREFETCH_TILES
): TileCoord[] {
  const tiles: TileCoord[] = [];
  for (let z = zooms.min; z <= zooms.max; z++) {
    const x0 = lonToTileX(bbox.minLon, z);
    const x1 = lonToTileX(bbox.maxLon, z);
    const y0 = latToTileY(bbox.maxLat, z);
    const y1 = latToTileY(bbox.minLat, z);
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
        tiles.push({ z, x, y });
        if (tiles.length >= cap) return tiles;
      }
    }
  }
  return tiles;
}

let prefetched = false;

/**
 * Warm the cache for the Berkeley bbox at low zooms, two requests at a time.
 * Cached tiles are skipped. Runs once per page load.
 */
export async function prefetchBerkeleyTiles(): Promise<void> {
  if (prefetched || typeof fetch === "undefined") return;
  prefetched = true;
  const tiles = enumerateBBoxTiles();
  const queue = [...tiles];
  const workers = Array.from({ length: PREFETCH_CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const t = queue.shift()!;
      if (await getCachedTile(t.z, t.x, t.y)) continue;
      try {
        const res = await fetch(tileUrl(t.z, t.x, t.y));
        if (!res.ok) continue;
        putCachedTile(t.z, t.x, t.y, await res.blob());
      } catch {
        /* offline or blocked — skip */
      }
    }
  });
  await Promise.all(workers);
}
