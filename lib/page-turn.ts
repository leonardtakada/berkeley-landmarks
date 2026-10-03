import { Easing } from "react-native";
import { Easing as Ease } from "react-native-reanimated";
import type {
  StackCardInterpolatedStyle,
  StackCardInterpolationProps,
  StackNavigationOptions,
} from "expo-router/js-stack";

import { PAGE_TURN_MS } from "@/constants/book";

/**
 * Page-turn geometry shared by the section leaves (tabs) and the entry
 * leaves (stack).
 *
 * A leaf turns about its hinge with its free edge lifting TOWARD the reader,
 * the way paper rises off a book: flat at 0°, edge-on at 90°. Perspective is
 * strong enough that the lifting edge visibly grows as it comes up.
 *
 * - Section pages (cover ↔ registry ↔ tours ↔ appendix) are hinged at the
 *   LEFT spine. Forward, the current leaf lifts away and reveals the next;
 *   back, the previous leaf swings down over the current one.
 * - Entry pages (a landmark, a tour) are leaves laid over the section,
 *   hinged at the RIGHT. They land sweeping right-to-left; swiping back from
 *   the left edge lifts them by the free edge under your finger.
 */
export const PERSPECTIVE = 1500;

const LIFT = Ease.bezierFn(0.45, 0.05, 0.2, 1);
/** How far along that curve the leaf is let fall flat. */
const LANDS_AT = 0.7;
const LANDED = LIFT(LANDS_AT);

/**
 * Paper accelerates as it's lifted, and lands: it comes down flat with a
 * little speed of its own instead of easing to rest. (Eased to rest, a leaf
 * crept its last few degrees for a third of a second — looking landed, but
 * tilted enough to draw its type soft, which read as a blur.) A worklet, so
 * the section leaves (Reanimated) and entry leaves (the stack) share it.
 */
export function PAGE_EASING(t: number): number {
  "worklet";
  return Math.min(1, LIFT(t * LANDS_AT) / LANDED);
}

// ---------------------------------------------------------------------------
// Stack: entry leaves, hinged at the right edge.
// ---------------------------------------------------------------------------

type TransitionSpecs = NonNullable<StackNavigationOptions["transitionSpec"]>;

export const pageTurnSpec: TransitionSpecs = {
  open: { animation: "timing", config: { duration: PAGE_TURN_MS, easing: PAGE_EASING } },
  close: { animation: "timing", config: { duration: Math.round(PAGE_TURN_MS * 0.85), easing: PAGE_EASING } },
};

export function forPageTurn({
  current,
  layouts: { screen },
}: StackCardInterpolationProps): StackCardInterpolatedStyle {
  const w = screen.width;

  // This leaf: lies flat once opened; hinged on the right, the left edge rises.
  const rotateY = current.progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["90deg", "0deg"],
    extrapolate: "clamp",
  });

  return {
    cardStyle: {
      transform: [
        { perspective: PERSPECTIVE },
        { translateX: w / 2 },
        { rotateY },
        { translateX: -w / 2 },
      ],
    },
    // No shade on the page beneath, and no shadow at the edge: flat paper.
  };
}

// ---------------------------------------------------------------------------
// Map: a folded sheet pulled from the back pocket — no hinge, just a quick
// dissolve; the map screen runs its own unfold once it lands.
// ---------------------------------------------------------------------------

export function forUnfold({ current }: StackCardInterpolationProps): StackCardInterpolatedStyle {
  return {
    cardStyle: {
      opacity: current.progress.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1] }),
    },
    overlayStyle: {
      opacity: current.progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.2] }),
    },
  };
}

/** No transition of its own: the screen brings itself in (the map off the Landmarks page's plate). */
export function forNoTransition(): StackCardInterpolatedStyle {
  return {};
}

/** Reduce Motion: a plain dissolve, no hinge and no travel. */
export function forDissolve({ current }: StackCardInterpolationProps): StackCardInterpolatedStyle {
  return {
    cardStyle: {
      opacity: current.progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
    },
  };
}

export const dissolveSpec: TransitionSpecs = {
  open: { animation: "timing", config: { duration: 200, easing: Easing.out(Easing.quad) } },
  close: { animation: "timing", config: { duration: 180, easing: Easing.out(Easing.quad) } },
};
