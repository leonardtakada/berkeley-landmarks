/**
 * Themed tile cache (native) — serves pre-baked tiles bundled in the app.
 *
 * scripts/bake_tiles.mjs produces assets/tiles.bin (sepia/aged-paper themed
 * OSM tiles with a progressive blur fade outside Berkeley) plus
 * assets/tiles-index.json with byte offsets. On first launch the container is
 * unpacked into the app cache directory and the map's UrlTile template points
 * at the files — offline, instant, fully themed. Outside the baked area the
 * map's far-ring polygon fades to the theme background (see
 * map-view-wrapper).
 *
 * Container layout: blobs are byte-aligned to multiples of 3 so the base64
 * asset string can be sliced directly (4 base64 chars ↔ 3 bytes).
 */

import { Platform } from "react-native";
import type * as LegacyFS from "expo-file-system/legacy";
import { Asset } from "expo-asset";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tileIndex = require("../assets/tiles-index.json") as {
  version: number;
  byteLength: number;
  tiles: Record<string, [number, number]>;
};

export const CACHE_TEMPLATE = "file:///__tilecache__/{z}-{x}-{y}.png";

let fs: typeof LegacyFS | null = null;
async function getFS(): Promise<typeof LegacyFS | null> {
  if (Platform.OS === "web") return null;
  if (fs) return fs;
  fs = (await import("expo-file-system/legacy")) as unknown as typeof LegacyFS;
  return fs;
}

function cacheDir(F: typeof LegacyFS): string {
  return `${F.cacheDirectory ?? ""}osm-tiles-v${tileIndex.version}`;
}

let unpackPromise: Promise<void> | null = null;

/**
 * Unpack the bundled tile container into the cache directory (idempotent —
 * reuses files already on disk, re-extracts if the cache was evicted).
 */
export async function prefetchBerkeleyTiles(
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  if (Platform.OS === "web") return;
  if (unpackPromise) return unpackPromise;
  unpackPromise = (async () => {
    const F = await getFS();
    if (!F) return;
    const dir = cacheDir(F);
    const total = Object.keys(tileIndex.tiles).length;
    const marker = `${dir}/.complete`;
    try {
      const info = await F.getInfoAsync(marker);
      if (info.exists) {
        onProgress?.(total, total);
        return;
      }
    } catch {
      /* re-extract */
    }

    try {
      await F.makeDirectoryAsync(dir, { intermediates: true });
    } catch {
      /* already exists */
    }

    const asset = Asset.fromModule(require("../assets/tiles.bin"));
    await asset.downloadAsync();
    if (!asset.localUri) throw new Error("tile container download failed");
    const b64 = await F.readAsStringAsync(asset.localUri, {
      encoding: "base64",
    });

    const entries = Object.entries(tileIndex.tiles);
    let done = 0;
    const BATCH = 40;
    for (let i = 0; i < entries.length; i += BATCH) {
      const slice = entries.slice(i, i + BATCH);
      await Promise.all(
        slice.map(async ([key, [offset, len]]) => {
          const dest = `${dir}/${key}.png`;
          try {
            const info = await F.getInfoAsync(dest);
            if (info.exists) return;
          } catch {
            /* write it */
          }
          // blobs are 3-byte aligned: base64 index = 4 × (offset / 3)
          const start = (offset / 3) * 4;
          const chars = (len / 3) * 4;
          const tileB64 = b64.substr(start, chars);
          await F.writeAsStringAsync(dest, tileB64, { encoding: "base64" });
        })
      );
      done = Math.min(entries.length, i + BATCH);
      onProgress?.(done, total);
    }

    try {
      await F.writeAsStringAsync(marker, String(Date.now()));
    } catch {
      /* marker is an optimization only */
    }
  })().catch(() => {
    unpackPromise = null; // allow retry on next mount
  });
  return unpackPromise;
}

/** UrlTile template resolving tiles from the on-disk cache. */
export function cachedTileTemplate(): Promise<string> {
  return getFS().then(
    (F) => (F ? `file://${cacheDir(F)}/{z}-{x}-{y}.png` : CACHE_TEMPLATE)
  );
}
