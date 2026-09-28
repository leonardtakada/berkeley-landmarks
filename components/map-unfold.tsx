import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
  runOnJS,
  useReducedMotion,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";

const UNFOLD_DURATION_MS = 450;

export interface MapUnfoldProps {
  children: React.ReactNode;
  /**
   * Play the tri-fold unfold on mount. When false (or when the user has
   * Reduce Motion enabled) children render directly with no animation.
   */
  animated: boolean;
}

/**
 * Fold-out map insert animation (Showa travel-book motif).
 *
 * On mount the map "unfolds" like a tri-fold paper map pulled out of a
 * book spine: it starts as a narrow vertical strip seen edge-on
 * (scaleX ≈ 0.06, rotateY ≈ -40°, faint) and opens flat to identity.
 * Two low-opacity vertical crease shadows at 1/3 and 2/3 width sell the
 * folded-paper illusion and fade out as the unfold completes.
 *
 * The animated values settle exactly to identity (scaleX 1, rotateY 0,
 * opacity 1) so map gestures keep working after the animation, and the
 * crease overlay is pointerEvents="none" and unmounts when done.
 *
 * Whether to animate is decided once, on mount, and the wrapper keeps the
 * same tree either way: a change of structure would remount the map inside
 * it (and drop any camera move waiting for the map to load).
 */
export function MapUnfold({ children, animated }: MapUnfoldProps) {
  const reduceMotion = useReducedMotion();
  const [shouldAnimate] = useState(() => animated && !reduceMotion);
  const progress = useSharedValue(shouldAnimate ? 0 : 1);
  const [creasesVisible, setCreasesVisible] = useState(shouldAnimate);

  useEffect(() => {
    if (!shouldAnimate) return;
    progress.value = 0;
    progress.value = withTiming(
      1,
      { duration: UNFOLD_DURATION_MS, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(setCreasesVisible)(false);
      },
    );
  }, [shouldAnimate, progress]);

  const mapStyle = useAnimatedStyle(() => {
    const t = progress.value;
    return {
      // 0.4 → 1 as the paper catches the light while opening.
      opacity: 0.4 + 0.6 * t,
      transform: [
        { perspective: 1400 },
        // Edge-on folded stack rotating flat: -40° → 0°.
        { rotateY: `${-40 * (1 - t)}deg` },
        // Narrow folded strip opening to full width: 0.06 → 1.
        // RN transforms default to center origin, so this folds
        // symmetrically toward the spine like a real tri-fold.
        { scaleX: 0.06 + 0.94 * t },
      ],
    };
  });

  const creaseStyle = useAnimatedStyle(() => ({
    // Creases read as fresh fold marks that relax away as it opens.
    opacity: 0.55 * (1 - progress.value),
  }));

  return (
    <View style={styles.wrapper}>
      <Animated.View style={[styles.fill, mapStyle]}>{children}</Animated.View>
      {creasesVisible && (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, creaseStyle]}>
          <LinearGradient
            colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.85)", "rgba(0,0,0,0)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.crease}
          />
          <LinearGradient
            colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.85)", "rgba(0,0,0,0)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[styles.crease, styles.creaseRight]}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  fill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  crease: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "33.33%",
    width: 2,
  },
  creaseRight: {
    left: "66.66%",
  },
});
