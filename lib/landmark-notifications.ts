/**
 * Proximity landmark notifications.
 *
 * Watches the user's location and fires a local notification when they come
 * within NOTIFY_RADIUS_METERS of a landmark. Anti-spam rules:
 *  - each landmark notifies at most once per NOTIFIED_TTL_MS (12h)
 *  - at most one notification every MIN_INTERVAL_MS (3 min)
 *  - only one outstanding location permission flow; silently disabled if denied
 *
 * Expo Go caveat: background geofencing needs a dev/standalone build; this
 * prototype watches in foreground + app lifecycle background on iOS.
 */
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { landmarks, Landmark } from "@/data/landmarks";

const NOTIFY_RADIUS_METERS = 60;
const MIN_INTERVAL_MS = 3 * 60 * 1000;
const NOTIFIED_TTL_MS = 12 * 60 * 60 * 1000;

let subscription: Location.LocationSubscription | null = null;
const notifiedAt = new Map<string, number>();
let lastNotificationAt = 0;
let started = false;

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function ensurePermissions(): Promise<boolean> {
  const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
  if (locStatus !== "granted") return false;
  const { status: notifStatus } =
    await Notifications.requestPermissionsAsync();
  return notifStatus === "granted";
}

async function maybeNotify(location: Location.LocationObject) {
  const now = Date.now();
  if (now - lastNotificationAt < MIN_INTERVAL_MS) return;

  const { latitude, longitude } = location.coords;
  let nearest: Landmark | null = null;
  let nearestDist = Infinity;
  for (const lm of landmarks) {
    const d = haversineMeters(latitude, longitude, lm.latitude, lm.longitude);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = lm;
    }
  }
  if (!nearest || nearestDist > NOTIFY_RADIUS_METERS) return;

  const last = notifiedAt.get(nearest.id) ?? 0;
  if (now - last < NOTIFIED_TTL_MS) return;

  notifiedAt.set(nearest.id, now);
  lastNotificationAt = now;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: nearest.name,
      body: nearest.address,
      data: { landmarkId: nearest.id },
    },
    trigger: null, // immediate
  });
}

export async function startProximityNotifications(): Promise<boolean> {
  if (started) return true;
  const ok = await ensurePermissions();
  if (!ok) return false;
  started = true;
  subscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 15000,
      distanceInterval: 25,
    },
    maybeNotify
  );
  return true;
}

export function stopProximityNotifications() {
  subscription?.remove();
  subscription = null;
  started = false;
}
