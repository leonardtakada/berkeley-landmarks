import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { tours } from "@/data/tours";
import {
  EMPTY_COPY,
  collectLabel,
  migrateLists,
  parseCopy,
  setMark,
  today,
  type Day,
  type ReaderCopy,
} from "@/lib/reader-copy";

const KEY = "@berkeley_reader_copy_v1";
// Where earlier versions kept their lists.
const OLD_FAVORITES = "@berkeley_landmarks_favorites";
const OLD_VISITED = "@berkeley_landmarks_visited";
const OLD_STAMPS = "@berkeley_tour_stamps_";

const STOPS: Record<string, string[]> = Object.fromEntries(tours.map((t) => [t.id, t.stops.map((s) => s.landmarkId)]));

type Mark = "visited" | "walked" | "corners";

interface ReaderCopyContext {
  copy: ReaderCopy;
  loaded: boolean;
  /** Collects a walk stop's label today; says whether it's new, and whether it finished the walk. */
  collect: (tourId: string, landmarkId: string) => { added: boolean; finished: boolean };
  /** Stamps (today) or erases one of the copy's marks. */
  mark: (kind: Mark, id: string, on: boolean) => void;
}

const Context = createContext<ReaderCopyContext | undefined>(undefined);

async function readOld(): Promise<ReaderCopy | null> {
  const list = (raw: string | null) => {
    try {
      const v = raw ? JSON.parse(raw) : [];
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  };
  const [favorites, visited, ...stamps] = await Promise.all([
    AsyncStorage.getItem(OLD_FAVORITES),
    AsyncStorage.getItem(OLD_VISITED),
    ...tours.map((t) => AsyncStorage.getItem(OLD_STAMPS + t.id)),
  ]);
  const old = {
    favorites: list(favorites),
    visited: list(visited),
    stamps: Object.fromEntries(tours.map((t, i) => [t.id, list(stamps[i])])),
  };
  const any = old.favorites.length || old.visited.length || Object.values(old.stamps).some((s) => s.length);
  return any ? migrateLists(old, STOPS, today()) : null;
}

/** Keeps the reader's copy, on the device only. */
export function ReaderCopyProvider({ children }: { children: React.ReactNode }) {
  const [copy, setCopy] = useState<ReaderCopy>(EMPTY_COPY);
  const [loaded, setLoaded] = useState(false);
  // The latest copy, for the marks made between renders.
  const latest = useRef<ReaderCopy>(EMPTY_COPY);

  const apply = useCallback((next: ReaderCopy) => {
    latest.current = next;
    setCopy(next);
  }, []);

  useEffect(() => {
    (async () => {
      let stored: ReaderCopy | null = null;
      try {
        stored = parseCopy(await AsyncStorage.getItem(KEY)) ?? (await readOld());
      } catch {
        /* a fresh copy */
      }
      if (stored) apply(stored);
      setLoaded(true);
    })();
  }, [apply]);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(KEY, JSON.stringify(copy)).catch(() => {});
  }, [copy, loaded]);

  const collect = useCallback(
    (tourId: string, landmarkId: string) => {
      const r = collectLabel(latest.current, tourId, STOPS[tourId] ?? [], landmarkId, today());
      if (r.added) apply(r.copy);
      return { added: r.added, finished: r.finished };
    },
    [apply],
  );

  const mark = useCallback(
    (kind: Mark, id: string, on: boolean) => {
      const has = !!latest.current[kind][id];
      if (has !== on) apply(setMark(latest.current, kind, id, on ? today() : null));
    },
    [apply],
  );

  const value = useMemo(() => ({ copy, loaded, collect, mark }), [copy, loaded, collect, mark]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useReaderCopy() {
  const context = useContext(Context);
  if (!context) throw new Error("useReaderCopy must be used within a ReaderCopyProvider");
  return context;
}

export type { Day, ReaderCopy };
