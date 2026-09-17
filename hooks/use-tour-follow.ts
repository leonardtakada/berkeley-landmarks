import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import type { Tour } from "@/data/tours";
import { landmarks, type Landmark } from "@/data/landmarks";

/** Distance (meters) at which a stop counts as "arrived". */
export const ARRIVAL_RADIUS_M = 40;

export interface TourFollowState {
  /** Whether follow mode is currently watching the user's location. */
  active: boolean;
  /** 0-based index of the stop the walker is heading toward. */
  currentStopIndex: number;
  /** Ordered stops resolved to their landmarks (landmark-less stops dropped). */
  stops: Array<{ stop: Tour["stops"][number]; landmark: Landmark }>;
  totalStops: number;
  /** Latest known user location, if any. */
  location: { latitude: number; longitude: number } | null;
  /** Straight-line distance in meters to the next stop, if located. */
  distanceToNextM: number | null;
  /** Location unavailable (denied / unsupported) — degrade to manual mode. */
  locationUnavailable: boolean;
  /** Tour finished (last stop arrived or skipped past). */
  finished: boolean;
  start: () => void;
  stop: () => void;
  /** Manually advance to the next stop (skips arrival check). */
  advance: () => void;
  /** Step back to the previous stop. */
  rewind: () => void;
}

/** Haversine distance in meters between two coordinates. */
export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function fireArrivalHaptic() {
  if (Platform.OS === "web") return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/**
 * Follow-along tour mode: watches the user's location along a tour route,
 * auto-advances when they come within ARRIVAL_RADIUS_M of the next stop,
 * and fires haptic feedback on arrival. Falls back to manual step-through
 * when geolocation is unavailable or denied.
 */
export function useTourFollow(tour: Tour | null): TourFollowState {
  const [active, setActive] = useState(false);
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationUnavailable, setLocationUnavailable] = useState(false);

  const stops = useRef(
    (tour?.stops ?? [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((stop) => ({ stop, landmark: landmarks.find((l) => l.id === stop.landmarkId) }))
      .filter((s): s is { stop: Tour["stops"][number]; landmark: Landmark } => !!s.landmark)
  );
  stops.current =
    (tour?.stops ?? [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((stop) => ({ stop, landmark: landmarks.find((l) => l.id === stop.landmarkId) }))
      .filter((s): s is { stop: Tour["stops"][number]; landmark: Landmark } => !!s.landmark);

  // Reset progress when the tour changes.
  useEffect(() => {
    setActive(false);
    setCurrentStopIndex(0);
    setLocation(null);
    setLocationUnavailable(false);
  }, [tour?.id]);

  const totalStops = stops.current.length;
  const finished = currentStopIndex >= totalStops;

  const advance = useCallback(() => {
    setCurrentStopIndex((i) => {
      const next = Math.min(i + 1, stops.current.length);
      if (next > i) fireArrivalHaptic();
      return next;
    });
  }, []);

  const rewind = useCallback(() => {
    setCurrentStopIndex((i) => Math.max(0, i - 1));
  }, []);

  const start = useCallback(() => setActive(true), []);
  const stop = useCallback(() => setActive(false), []);

  const nextStop = !finished ? stops.current[currentStopIndex] : null;
  const distanceToNextM =
    location && nextStop
      ? distanceMeters(location, {
          latitude: nextStop.landmark.latitude,
          longitude: nextStop.landmark.longitude,
        })
      : null;

  // Location watch: expo-location on native, navigator.geolocation on web.
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
          setLocationUnavailable(true);
          setActive(false);
          return;
        }
        sub = await ExpoLocation.watchPositionAsync(
          {
            accuracy: ExpoLocation.Accuracy.Balanced,
            distanceInterval: 10,
          },
          (pos) => {
            const { latitude, longitude } = pos.coords;
            setLocation({ latitude, longitude });
          }
        );
      } catch {
        if (!cancelled) {
          setLocationUnavailable(true);
          setActive(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [active]);

  useEffect(() => {
    if (!active || Platform.OS !== "web") return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationUnavailable(true);
      setActive(false);
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      },
      () => {
        setLocationUnavailable(true);
        setActive(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active]);

  // Auto-advance on arrival.
  useEffect(() => {
    if (!active || finished || distanceToNextM == null) return;
    if (distanceToNextM <= ARRIVAL_RADIUS_M) advance();
  }, [active, finished, distanceToNextM, advance]);

  return {
    active,
    currentStopIndex,
    stops: stops.current,
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
