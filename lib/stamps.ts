import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Tour-progress "stamps" (Showa travel-book motif): visiting a landmark
 * during an active tour collects a vintage ink stamp for that tour.
 * Storage keys follow the existing AsyncStorage style, e.g.
 * "@berkeley_tour_stamps_tour-downtown" → JSON array of landmark ids.
 */
const STAMPS_KEY_PREFIX = "@berkeley_tour_stamps_";

function keyFor(tourId: string): string {
  return `${STAMPS_KEY_PREFIX}${tourId}`;
}

/** Read the collected landmark ids for a tour (order of collection). */
export async function getStamps(tourId: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(tourId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

/**
 * Idempotently collect a stamp. Returns true only when the stamp was
 * newly added (i.e. this was a real collection, not a duplicate).
 */
export async function addStamp(tourId: string, landmarkId: string): Promise<boolean> {
  try {
    const current = await getStamps(tourId);
    if (current.includes(landmarkId)) return false;
    await AsyncStorage.setItem(keyFor(tourId), JSON.stringify([...current, landmarkId]));
    return true;
  } catch {
    return false;
  }
}

export interface StampsState {
  /** Collected landmark ids for the tour. */
  stamps: Set<string>;
  /** True once the initial AsyncStorage load has completed. */
  loaded: boolean;
  /**
   * Collect a stamp for the tour. Returns true when newly collected
   * (safe to call repeatedly — idempotent).
   */
  collect: (landmarkId: string) => Promise<boolean>;
}

/** Load and expose the collected stamp set for a tour. */
export function useStamps(tourId: string | null): StampsState {
  const [stamps, setStamps] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    if (!tourId) {
      setStamps(new Set());
      setLoaded(true);
      return;
    }
    (async () => {
      const ids = await getStamps(tourId);
      if (cancelled) return;
      setStamps(new Set(ids));
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [tourId]);

  const collect = useCallback(
    async (landmarkId: string) => {
      if (!tourId) return false;
      const added = await addStamp(tourId, landmarkId);
      if (added) {
        setStamps((prev) => {
          if (prev.has(landmarkId)) return prev;
          const next = new Set(prev);
          next.add(landmarkId);
          return next;
        });
      }
      return added;
    },
    [tourId]
  );

  return { stamps, loaded, collect };
}
