import React, { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, StyleSheet, type ViewProps } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useFocusEffect } from "expo-router";

export interface PageFlipProps extends ViewProps {
  /**
   * +1 = page turns in from the right (default), -1 = from the left.
   */
  direction?: 1 | -1;
}

const ENTER_DURATION_MS = 280;
const EXIT_DURATION_MS = 200;

/**
 * Book-style "page turn" illusion for tab screens.
 *
 * A single shared value `p` drives everything:
 *   p = 0  → pre-enter pose (off to the side, tilted, faint)
 *   p = 1  → settled (normal page)
 *   p = 2  → exited pose (lifted the other way, faded out)
 *
 * On focus we animate 0 → 1 (settle in); on blur 1 → 2 (lift away).
 * The first time a screen mounts already focused we snap straight to 1
 * so the initial tab doesn't animate on app open.
 */
export function PageFlip({ children, direction = 1, style, ...props }: PageFlipProps) {
  const p = useSharedValue(1);
  const hasFocusedBefore = useRef(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(enabled);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      mounted = false;
      sub?.remove();
    };
  }, []);

  const enter = useCallback(() => {
    if (!hasFocusedBefore.current) {
      // First mount while already focused: settle instantly.
      hasFocusedBefore.current = true;
      p.value = 1;
      return;
    }
    if (reduceMotion) {
      p.value = 1;
      return;
    }
    p.value = 0;
    p.value = withTiming(1, {
      duration: ENTER_DURATION_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [p, reduceMotion]);

  const exit = useCallback(() => {
    if (!hasFocusedBefore.current || reduceMotion) {
      p.value = reduceMotion ? 0 : p.value;
      return;
    }
    p.value = withTiming(2, {
      duration: EXIT_DURATION_MS,
      easing: Easing.in(Easing.quad),
    });
  }, [p, reduceMotion]);

  useFocusEffect(
    useCallback(() => {
      enter();
      return () => {
        exit();
      };
    }, [enter, exit]),
  );

  const animatedStyle = useAnimatedStyle(() => {
    const t = p.value;
    const translateX =
      t <= 1 ? 40 * direction * (1 - t) : -24 * direction * (t - 1);
    const rotateY = t <= 1 ? -6 * direction * (1 - t) : 4 * direction * (t - 1);
    const opacity = t <= 1 ? 0.6 + 0.4 * t : Math.max(0, 2 - t);
    const shadowOpacity =
      t <= 1 ? 0.25 * (1 - t) : 0.15 * Math.min(1, Math.max(0, t - 1));
    return {
      transform: [{ perspective: 1200 }, { translateX }, { rotateY: `${rotateY}deg` }],
      opacity,
      shadowOpacity,
      pointerEvents: opacity < 0.01 ? ("none" as const) : ("auto" as const),
    };
  });

  return (
    <Animated.View style={[styles.page, animatedStyle, style]} {...props}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
  },
});
