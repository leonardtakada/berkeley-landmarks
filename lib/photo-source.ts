import type { ImageURISource } from "react-native";

/**
 * Image source for a landmark photograph. Wikimedia asks every client to
 * identify itself with a descriptive User-Agent; requests without one can be
 * throttled or refused, so photographs from Commons carry it.
 */
const WIKIMEDIA_UA = "BerkeleyTours/1.0 (iOS; landmark guide) react-native";

export function photoSource(uri: string): ImageURISource {
  if (uri.startsWith("https://upload.wikimedia.org/")) {
    return { uri, headers: { "User-Agent": WIKIMEDIA_UA } };
  }
  return { uri };
}
