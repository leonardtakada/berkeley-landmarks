import { createContext, useContext } from "react";
import { useAnimatedScrollHandler, useSharedValue, type SharedValue } from "react-native-reanimated";

/**
 * The page's scroll, as a clock for its illustrations: the architects look
 * about and blink as the reader scrolls, and the suns and moons on the walk
 * labels cross their skies. A page that scrolls puts its offset here; art
 * outside any scrolling page just sits still.
 */
const ScrollClockContext = createContext<SharedValue<number> | null>(null);

export const ScrollClock = ScrollClockContext.Provider;

/** The scroll offset of the page this is drawn on, if it scrolls. */
export function useScrollClock() {
  return useContext(ScrollClockContext);
}

/**
 * For a page's scroll view: the offset to provide, and the handler to give an
 * Animated scroll view's `onScroll` (with `scrollEventThrottle={16}`).
 */
export function useScrollClockHandler() {
  const offset = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    offset.value = e.contentOffset.y;
  });
  return { offset, onScroll };
}
