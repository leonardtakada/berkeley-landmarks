import type { Fix } from "@/lib/arrival";

/**
 * One good fix of where the reader is now, for stamping a visit: a recent
 * one if the phone has it, else a fresh one. Says so if location is off.
 */
export async function whereYouAre(): Promise<Fix | "denied" | "unavailable"> {
  try {
    const Location = await import("expo-location");
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return "denied";
    const recent = await Location.getLastKnownPositionAsync({ maxAge: 20_000, requiredAccuracy: 40 });
    const pos =
      recent ??
      (await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 15_000)),
      ]));
    if (!pos) return "unavailable";
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy };
  } catch {
    return "unavailable";
  }
}
