/**
 * Themed tile cache (native) — serves pre-baked tiles bundled in the app.
 *
 * scripts/bake_tiles.mjs produces two containers: assets/tiles.bin (light
 * "aged paper") and assets/tiles-dark.bin (dark theme), each with an index
 * JSON of byte offsets. On first launch per theme the container is unpacked
 * into the app cache directory and the map's UrlTile template points at the
 * files — offline, instant, fully themed.
 *
 * Container layout: blobs are byte-aligned to multiples of 3 so the base64
 * asset string can be sliced directly (4 base64 chars ↔ 3 bytes).
 */

import { Platform } from "react-native";
import {
  MID_RECT,
} from "./tiles-manifest.generated";
const MID_RECT_MIN_LAT = MID_RECT.minLat;
const MID_RECT_MAX_LAT = MID_RECT.maxLat;
const MID_RECT_MIN_LON = MID_RECT.minLon;
const MID_RECT_MAX_LON = MID_RECT.maxLon;
import type * as LegacyFS from "expo-file-system/legacy";
import { Asset } from "expo-asset";
import * as ImageManipulator from "expo-image-manipulator";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const lightIndex = require("../assets/tiles-index.json") as TileIndex;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const darkIndex = require("../assets/tiles-dark-index.json") as TileIndex;

type TileIndex = {
  version: number;
  byteLength: number;
  tiles: Record<string, [number, number]>;
};

export type TileScheme = "light" | "dark";

const INDICES: Record<TileScheme, TileIndex> = { light: lightIndex, dark: darkIndex };
const ASSETS: Record<TileScheme, any> = {
  light: require("../assets/tiles.bin"),
  dark: require("../assets/tiles-dark.bin"),
};

export const CACHE_TEMPLATE = "file:///__tilecache__/{z}-{x}-{y}.png";

let fs: typeof LegacyFS | null = null;
async function getFS(): Promise<typeof LegacyFS | null> {
  if (Platform.OS === "web") return null;
  if (fs) return fs;
  fs = (await import("expo-file-system/legacy")) as unknown as typeof LegacyFS;
  return fs;
}

function cacheDir(F: typeof LegacyFS, scheme: TileScheme): string {
  return `${F.cacheDirectory ?? ""}osm-tiles-v${INDICES[scheme].version}-${scheme}`;
}

const unpackPromises: Partial<Record<TileScheme, Promise<void>>> = {};
const unpacked: Partial<Record<TileScheme, boolean>> = {};

/**
 * Unpack the bundled tile container for a theme into the cache directory
 * (idempotent — reuses files already on disk, re-extracts if evicted).
 */
export async function prefetchBerkeleyTiles(
  scheme: TileScheme = "light",
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  if (Platform.OS === "web") return;
  console.warn(`[tiles] prefetch start (${scheme})`);
  if (unpackPromises[scheme]) return unpackPromises[scheme];
  unpackPromises[scheme] = (async () => {
    const F = await getFS();
    console.warn(`[tiles] fs ready: ${!!F}`);
    if (!F) return;
    const index = INDICES[scheme];
    const dir = cacheDir(F, scheme);
    const total = Object.keys(index.tiles).length;
    const marker = `${dir}/.complete`;
    try {
      const info = await F.getInfoAsync(marker);
      if (info.exists) {
        unpacked[scheme] = true; // tiles already on disk from a previous run
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

    const asset = Asset.fromModule(ASSETS[scheme]);
    let containerUri = asset.localUri;

    if (asset.uri?.startsWith("http")) {
      // Dev (Expo Go/Metro): the asset module hangs on large binaries —
      // stream the container over HTTP with the file-system downloader instead.
      const dlDest = `${F.cacheDirectory || F.documentDirectory}tiles-${scheme}-${INDICES[scheme].version}.bin`;
      console.warn(`[tiles] streaming container (${scheme}) from ${asset.uri}`);
      const dl = await F.downloadAsync(asset.uri, dlDest);
      if (dl.status !== 200 || !dl.uri) {
        console.warn(`[tiles] container HTTP download failed (${scheme}): status=${dl.status}`);
        throw new Error(`tile container download failed: HTTP ${dl.status}`);
      }
      containerUri = dl.uri;
      console.warn(`[tiles] container streamed (${scheme}): ${dl.status}`);
    } else {
      // Production build: asset is bundled/file-local, download via asset module.
      await asset.downloadAsync();
      containerUri = asset.localUri;
      console.warn(`[tiles] container via asset (${scheme}): ${containerUri ?? "no-uri"} downloaded=${asset.downloaded}`);
    }

    if (!containerUri) {
      console.warn(`[tiles] container download failed (${scheme})`);
      throw new Error("tile container download failed");
    }
    let b64: string;
    try {
      b64 = await F.readAsStringAsync(containerUri, { encoding: "base64" });
    } catch (e: any) {
      console.warn(`[tiles] container read failed (${scheme}): ${e?.message ?? e}`);
      throw e;
    }
    console.warn(`[tiles] unpacking ${scheme}: ${(b64.length / 1e6).toFixed(1)}MB base64, ${total} tiles`);

    const entries = Object.entries(index.tiles);
    let done = 0;
    const BATCH = 100;
    for (let i = 0; i < entries.length; i += BATCH) {
      const slice = entries.slice(i, i + BATCH);
      await Promise.all(
        slice.map(async ([key, [offset, len]]) => {
          const dest = `${dir}/${key}.png`;
          // blobs are 3-byte aligned: base64 index = 4 × (offset / 3)
          const start = (offset / 3) * 4;
          const chars = (len / 3) * 4;
          try {
            await F.writeAsStringAsync(dest, b64.substr(start, chars), { encoding: "base64" });
          } catch (e: any) {
            console.warn(`[tiles] write failed ${key}: ${e?.message ?? e}`);
          }
        })
      );
      done = Math.min(entries.length, i + BATCH);
      if (done % 1000 < BATCH) console.warn(`[tiles] ${scheme}: ${done}/${total}`);
      onProgress?.(done, total);
    }
    console.warn(`[tiles] unpacked ${done}/${total} tiles (${scheme})`);

    try {
      await F.writeAsStringAsync(marker, String(Date.now()));
    } catch {
      /* marker is an optimization only */
    }
    unpacked[scheme] = true;
  })().catch((e: any) => {
    console.warn(`[tiles] prefetch failed (${scheme}): ${e?.message ?? e}`);
    unpackPromises[scheme] = undefined; // allow retry on next mount
  });
  return unpackPromises[scheme]!;
}

/** UrlTile template resolving tiles for a theme from the on-disk cache.
 *  Falls back to remote OSM if the container never unpacked — never point
 *  UrlTile at an empty directory (that renders a blank map). */
export function cachedTileTemplate(scheme: TileScheme = "light"): Promise<string> {
  return getFS().then((F) => {
    if (!F) return CACHE_TEMPLATE;
    if (!unpacked[scheme]) return CACHE_TEMPLATE; // not unpacked yet/failed
    return `file://${cacheDir(F, scheme)}/{z}-{x}-{y}.png`;
  });
}

const Z17_MARKER = ".z17-complete-v2"; // v2: quadrant math fix — regenerates z17 tiles
const z17Promises: Partial<Record<TileScheme, Promise<boolean>>> = {};

// Map interaction pause: generation yields while the user pans/zooms so
// tile decoding and image ops never compete for memory (Expo Go ceiling).
let lastInteraction = 0;
export function noteMapInteraction(): void {
  lastInteraction = Date.now();
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Generate zoom-17 tiles by splitting each baked zoom-16 tile into 4
 * quadrants (upscaled 2x). Runs after unpack, off the UI path — the map is
 * usable at z<=16 meanwhile. Enables deep zoom without blank tiles and
 * without growing the bundle (tiles live in the cache dir).
 */
export async function ensureUpsampledTiles(
  scheme: TileScheme = "light"
): Promise<boolean> {
  if (Platform.OS === "web") return false;
  if (z17Promises[scheme]) return z17Promises[scheme]!;
  z17Promises[scheme] = (async () => {
    try {
      const F = await getFS();
      if (!F || !unpacked[scheme]) return false;
      const dir = cacheDir(F, scheme);
      try {
        const marker = await F.getInfoAsync(`${dir}/${Z17_MARKER}`);
        if (marker.exists) return true;
      } catch {
        /* generate */
      }
      // Only z16 tiles inside MID_RECT can ever be requested at z17 (the
      // map clamps panning to MID_RECT) — skip the thousands of blank fill
      // tiles so upsample stays fast and light.
      const z16 = Object.keys(INDICES[scheme].tiles).filter((k) => {
        if (!k.startsWith("16-")) return false;
        const [, xS, yS] = k.split("-");
        const x = parseInt(xS, 10), y = parseInt(yS, 10);
        const n = 2 ** 16;
        const lon = (x / n) * 360 - 180;
        const lat =
          (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
        const lonMax = ((x + 1) / n) * 360 - 180;
        const latMin =
          (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * 180) /
          Math.PI;
        return (
          lonMax > MID_RECT_MIN_LON &&
          lon < MID_RECT_MAX_LON &&
          latMin < MID_RECT_MAX_LAT &&
          lat > MID_RECT_MIN_LAT
        );
      });
      // v2 marker: previous z17 tiles were generated with wrong quadrant
      // math (source tiles are 341px, not 256px) and some were left
      // half-written by crashes — regenerate them all.
      try {
        const stale = await F.readDirectoryAsync(dir);
        await Promise.all(
          stale
            .filter((f) => f.startsWith("17-"))
            .map((f) => F.deleteAsync(`${dir}/${f}`, { idempotent: true }))
        );
      } catch {
        /* best effort */
      }
      let done = 0;
      for (const key of z16) {
        const [, xS, yS] = key.split("-");
        const x = parseInt(xS, 10);
        const y = parseInt(yS, 10);
        const src = `${dir}/${key}.png`;
        // Sequential on purpose: thousands of parallel native image ops
        // churned memory and crashed Expo Go. One op at a time + a small
        // yield keeps it boring and resumable (existing tiles are skipped).
        for (const [dx, dy] of [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ] as const) {
          const dest = `${dir}/17-${2 * x + dx}-${2 * y + dy}.png`;
          try {
            const info = await F.getInfoAsync(dest);
            if (info.exists) continue;
          } catch {
            /* generate */
          }
          try {
            const r = await ImageManipulator.manipulateAsync(
              src,
              [
                // Baked z16 tiles are 341×341 (rendered with label margin),
                // not 256. Normalize to 512 first so quadrant math is exact
                // and each z17 tile actually covers its quarter of the map.
                { resize: { width: 512, height: 512 } },
                {
                  crop: {
                    originX: dx * 256,
                    originY: dy * 256,
                    width: 256,
                    height: 256,
                  },
                },
              ],
              { format: ImageManipulator.SaveFormat.JPEG, compress: 0.8 }
            );
            await F.copyAsync({ from: r.uri, to: dest });
            await new Promise((res) => setTimeout(res, 5));
          } catch (e: any) {
            console.warn(`[tiles] z17 quadrant failed ${key}/${dx},${dy}: ${e?.message ?? e}`);
          }
        }
        done++;
        // Stand down while the user is actively using the map.
        while (Date.now() - lastInteraction < 600) {
          await sleep(250);
        }
        if (done % 256 === 0) console.warn(`[tiles] z17 upsample ${scheme}: ${done}/${z16.length}`);
      }
      try {
        await F.writeAsStringAsync(`${dir}/${Z17_MARKER}`, String(Date.now()));
      } catch {
        /* marker is an optimization only */
      }
      console.warn(`[tiles] z17 upsample complete (${scheme})`);
      return true;
    } catch (e: any) {
      console.warn(`[tiles] z17 upsample failed (${scheme}): ${e?.message ?? e}`);
      z17Promises[scheme] = undefined;
      return false;
    }
  })();
  return z17Promises[scheme]!;
}
