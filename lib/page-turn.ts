import { Easing } from "react-native";
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

/** Paper accelerates as it's lifted and settles as it lands. */
export const PAGE_EASING = Easing.bezier(0.45, 0.05, 0.2, 1);

/**
 * Where a leaf's free edge lands on screen at a given lift angle.
 * Perspective is about the view centre; the hinge is at x = 0 (left hinge)
 * and the free edge starts at x = width.
 */
export function projectedFreeEdge(width: number, deg: number): number {
  "worklet";
  const rad = (deg * Math.PI) / 180;
  const cx = width / 2;
  const x = width * Math.cos(rad) - cx;
  const z = width * Math.sin(rad);
  return cx + (x * PERSPECTIVE) / (PERSPECTIVE - Math.min(z, PERSPECTIVE - 1));
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
    // The leaf's shadow falls on the page beneath: strongest mid-turn when
    // the leaf is lifted highest over it, gone once it lies flat.
    overlayStyle: {
      opacity: current.progress.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0, 0.16, 0.06],
        extrapolate: "clamp",
      }),
    },
    // Edge shadow along the free (left) edge, travelling with the leaf.
    shadowStyle: {
      shadowOpacity: current.progress.interpolate({
        inputRange: [0, 0.3, 0.85, 1],
        outputRange: [0, 0.45, 0.25, 0],
        extrapolate: "clamp",
      }),
    },
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
