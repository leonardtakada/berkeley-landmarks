import type { ImageSourcePropType } from "react-native";

import { BUNDLED_PHOTOS } from "@/lib/photos.generated";

/**
 * Image source for a landmark photograph. The guide's own photographs are
 * printed into the app (scripts/bundle-photos.mjs), so they're there with no
 * signal; anything else — readers' photographs — comes over the network.
 * Wikimedia asks every client to identify itself with a descriptive
 * User-Agent; requests without one can be throttled or refused, so
 * photographs from Commons carry it.
 */
const WIKIMEDIA_UA = "BerkeleyTours/1.0 (iOS; landmark guide) react-native";

export function photoSource(uri: string): ImageSourcePropType {
  const bundled = BUNDLED_PHOTOS[uri];
  if (bundled) return bundled.image;
  if (/^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(uri)) {
    return { uri, headers: { "User-Agent": WIKIMEDIA_UA } };
  }
  return { uri };
}

/** Who took one of the guide's photographs, and on what licence. */
export function photoCredit(uri: string): string | undefined {
  return BUNDLED_PHOTOS[uri]?.credit;
}
