/**
 * Map engine feature flag: the guide's isometric city ("iso", drawn by
 * MapLibre from scripts/iso/city.ts), the flat offline MapLibre vector map
 * ("maplibre"), or the legacy raster tile map ("raster").
 *
 * - `MAPLIBRE_ENABLED` is the compile-time default.
 * - A runtime override is persisted in AsyncStorage so the engine can be
 *   flipped from the map screen without a rebuild (nice for demos / if the
 *   vector map ever misbehaves on a specific device).
 * - Web always falls back to the raster pipeline (MapLibre view is
 *   native-only).
 */
import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type MapEngine = "iso" | "maplibre" | "raster";
const ENGINES: MapEngine[] = ["iso", "maplibre", "raster"];

export const MAPLIBRE_ENABLED = true;

const OVERRIDE_KEY = "map.engine.override";

let cachedOverride: MapEngine | null = null;

export function defaultMapEngine(): MapEngine {
  if (Platform.OS === "web") return "raster";
  return MAPLIBRE_ENABLED ? "iso" : "raster";
}

export async function getStoredMapEngine(): Promise<MapEngine | null> {
  if (cachedOverride) return cachedOverride;
  try {
    const v = await AsyncStorage.getItem(OVERRIDE_KEY);
    if (v === "iso" || v === "maplibre" || v === "raster") {
      cachedOverride = v;
      return v;
    }
  } catch {}
  return null;
}

export async function setStoredMapEngine(engine: MapEngine): Promise<void> {
  cachedOverride = engine;
  try {
    await AsyncStorage.setItem(OVERRIDE_KEY, engine);
  } catch {}
}

/** Reactive hook: current engine + a setter that persists the override. */
export function useMapEngine(): {
  engine: MapEngine;
  isMapLibre: boolean;
  isIso: boolean;
  toggleEngine: () => void;
  ready: boolean;
} {
  const [override, setOverride] = useState<MapEngine | null>(cachedOverride);
  const [ready, setReady] = useState(cachedOverride !== null || false);

  useEffect(() => {
    let cancelled = false;
    getStoredMapEngine().then((v) => {
      if (!cancelled) {
        setOverride(v);
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleEngine = useCallback(() => {
    const next = ENGINES[(ENGINES.indexOf(override ?? defaultMapEngine()) + 1) % ENGINES.length];
    setOverride(next);
    setStoredMapEngine(next);
  }, [override]);

  const engine = override ?? defaultMapEngine();
  return { engine, isMapLibre: engine !== "raster", isIso: engine === "iso", toggleEngine, ready };
}
