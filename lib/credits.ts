import { BUNDLED_PHOTOS } from "@/lib/photos.generated";

/**
 * The photographers of the guide's plates, by name, for the colophon: the
 * first part of each Commons credit ("Name · Licence · Wikimedia Commons"),
 * less the anonymous ones, in alphabetical order.
 */
export function commonsPhotographers(): string[] {
  const names = new Set<string>();
  for (const [url, { credit }] of Object.entries(BUNDLED_PHOTOS)) {
    if (url.startsWith("upload:")) continue;
    const parts = credit.split(" · ");
    if (parts[parts.length - 1] !== "Wikimedia Commons") continue;
    const name = parts[0].trim();
    if (name && !/^unknown/i.test(name)) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

/** How the colophon names the guide's other sources of plates. */
const SOURCE_NAMES: Record<string, string> = {
  "Berkeley Historical Plaque Project": "the Berkeley Historical Plaque Project",
  "Calisphere, University of California": "Calisphere, the University of California's collections",
};

/**
 * Other sources of the guide's plates, named as a sentence would: the
 * catalogues and archives, and whoever took the photographs uploaded in the
 * guide editor (the name before the licence in their credit).
 */
export function otherPhotoSources(): string[] {
  const sources = new Set<string>();
  for (const [url, { credit }] of Object.entries(BUNDLED_PHOTOS)) {
    if (url.startsWith("upload:")) sources.add(credit.split(" · ")[0].trim());
    else if (!credit.includes(" · ")) sources.add(credit);
  }
  return [...sources].sort().map((s) => SOURCE_NAMES[s] ?? s);
}

export const PHOTO_COUNT = Object.keys(BUNDLED_PHOTOS).length;
