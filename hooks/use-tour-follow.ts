import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import type { Tour } from "@/data/tours";
import { landmarks, type Landmark } from "@/data/landmarks";
import { distanceToStop, isAtStop, type Fix } from "@/lib/arrival";
import { stopIndices } from "@/lib/route-legs";

export interface TourFollowState {
  /** Whether follow mode is currently watching the user's location. */
  active: boolean;
  /** 0-based index of the stop the walker is heading toward. */
  currentStopIndex: number;
  /** Ordered stops resolved to their landmarks (landmark-less stops dropped). */
  stops: { stop: Tour["stops"][number]; landmark: Landmark }[];
  totalStops: number;
  /** Latest known user location, if any. */
  location: Fix | null;
  /** Straight-line distance in meters to the next stop, if located. */
  distanceToNextM: number | null;
  /** Location unavailable (denied / unsupported) — degrade to manual mode. */
  locationUnavailable: boolean;
  /** Tour finished (last stop arrived or skipped past). */
  finished: boolean;
  start: () => void;
  stop: () => void;
  /** On to the next stop, by hand. (Only reaching a stop collects its label.) */
  advance: () => void;
  /** Step back to the previous stop. */
  rewind: () => void;
}

/** A browser that can't say where it is. */
const NO_GEOLOCATION = Platform.OS === "web" && (typeof navigator === "undefined" || !navigator.geolocation);

function fireArrivalHaptic() {
  if (Platform.OS === "web") return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/**
 * Follow-along tour mode. While walking, it watches the reader's location
 * along the route: standing at any of the walk's stops collects that stop's
 * label (`onReach`), and reaching the next one moves the walk on, with a
 * haptic. The reader can also step on and back by hand — to skip a stop, or
 * when location is off — but a stop passed by hand collects nothing: the
 * labels are earned on the spot.
 */
export function useTourFollow(
  tour: Tour | null,
  { walking, onReach }: { walking: boolean; onReach?: (landmarkId: string) => void },
): TourFollowState {
  const [paused, setPaused] = useState(false);
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [location, setLocation] = useState<Fix | null>(null);
  const [lost, setLost] = useState(false);
  const locationUnavailable = lost || NO_GEOLOCATION;
  // Stops reached on foot this walk, so stepping back to one you're
  // standing at doesn't carry you straight on again.
  const reached = useRef(new Set<number>());

  const stops = useMemo(
    () =>
      (tour?.stops ?? [])
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((stop) => ({ stop, landmark: landmarks.find((l) => l.id === stop.landmarkId) }))
        .filter((s): s is { stop: Tour["stops"][number]; landmark: Landmark } => !!s.landmark),
    [tour],
  );

  // Reset progress when the tour changes.
  const [forTour, setForTour] = useState(tour?.id);
  if (forTour !== tour?.id) {
    setForTour(tour?.id);
    setPaused(false);
    setCurrentStopIndex(0);
    setLocation(null);
    setLost(false);
  }

  const active = walking && !paused && !locationUnavailable && !!tour;
  const totalStops = stops.length;
  const finished = currentStopIndex >= totalStops;

  const advance = useCallback(() => {
    if (currentStopIndex >= totalStops) return;
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    setCurrentStopIndex(currentStopIndex + 1);
  }, [currentStopIndex, totalStops]);

  const rewind = useCallback(() => {
    setCurrentStopIndex((i) => Math.max(0, i - 1));
  }, []);

  const start = useCallback(() => {
    setLost(false);
    setPaused(false);
  }, []);
  const stop = useCallback(() => setPaused(true), []);

  // Where the walk passes each stop.
  const route = useMemo(() => tour?.routeCoordinates ?? [], [tour]);
  const passing = useMemo(
    () =>
      route.length > 1
        ? stopIndices(
            route,
            stops.map((s) => s.landmark),
          ).map((i) => route[i])
        : [],
    [route, stops],
  );

  const nextStop = !finished ? stops[currentStopIndex] : null;
  const distanceToNextM =
    location && nextStop ? distanceToStop(location, nextStop.landmark, passing[currentStopIndex]) : null;

  // Each fix: collect the label of every stop the reader stands at, and
  // move on if it's the one they were heading for.
  const onFix = useEffectEvent((fix: Fix) => {
    setLocation(fix);
    let next = currentStopIndex;
    stops.forEach((s, k) => {
      if (!isAtStop(fix, s.landmark, passing[k])) return;
      onReach?.(s.landmark.id);
      if (k === next && !reached.current.has(k)) {
        fireArrivalHaptic();
        next = k + 1;
      }
      reached.current.add(k);
    });
    if (next !== currentStopIndex) setCurrentStopIndex(next);
  });
  const onLost = useEffectEvent(() => {
    setLost(true);
  });

  // A new walk is a fresh start.
  useEffect(() => {
    reached.current = new Set();
  }, [tour?.id]);

  // Location watch: expo-location on native, navigator.geolocation on web.
  // Close enough to tell one side of the street from the other.
  useEffect(() => {
    if (!active || Platform.OS === "web") return;
    let sub: { remove: () => void } | null = null;
    let cancelled = false;

    (async () => {
      try {
        const ExpoLocation = await import("expo-location");
        const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status !== "granted") {
          onLost();
          return;
        }
        sub = await ExpoLocation.watchPositionAsync(
          { accuracy: ExpoLocation.Accuracy.High, distanceInterval: 4 },
          (pos) => onFix({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        );
        if (cancelled) sub.remove();
      } catch {
        if (!cancelled) onLost();
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [active]);

  useEffect(() => {
    if (!active || Platform.OS !== "web" || NO_GEOLOCATION) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => onFix({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => onLost(),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active]);

  return {
    active,
    currentStopIndex,
    stops,
    totalStops,
    location,
    distanceToNextM,
    locationUnavailable,
    finished,
    start,
    stop,
    advance,
    rewind,
  };
}
