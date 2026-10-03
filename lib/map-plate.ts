import { makeMutable } from "react-native-reanimated";

/** Where a plate lies on the screen, in window points. */
export type PlateRect = { x: number; y: number; width: number; height: number };

/**
 * The Landmarks page's plate is the city map, folded: pressed, it lifts off
 * the page and unfolds into the map, and folds back into its place when the
 * map is closed. The page leaves where the plate lies here for the map to
 * pick up; `plateOut` is 1 while the plate is off the page (the map draws
 * it then), so the page leaves its place empty.
 */
let lying: PlateRect | null = null;

export const plateOut = makeMutable(0);

export function layPlate(rect: PlateRect) {
  lying = rect;
}

/** Where the plate was laid, once: a later map opened another way unfolds as it always has. */
export function takePlate(): PlateRect | null {
  const rect = lying;
  lying = null;
  return rect;
}

/** The map route's param when it's opened from the plate. */
export const FROM_PLATE = "plate";
