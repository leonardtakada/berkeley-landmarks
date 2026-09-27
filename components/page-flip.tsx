import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Dimensions,
  StyleSheet,
  type ViewProps,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
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

// A page turn should read as paper: slow enough to see the sheet sweep,
// quick enough to stay snappy. ~700ms enter (out-quart) + ~450ms exit.
const ENTER_DURATION_MS = 700;
const EXIT_DURATION_MS = 450;
const EASE_OUT_QUART = Easing.out(Easing.poly(4)); // out-quart

/**
 * Book-style "page turn" for tab screens.
 *
 * A single shared value `p` drives everything:
 *   p = 0  → pre-enter pose (fully off to the side, edge-on, shadowed)
 *   p = 1  → settled (identity transforms — the resting page)
 *   p = 2  → exited pose (receded, darkened, lifted away)
 *
 * Enter (0 → 1): the incoming page sweeps in from the screen edge like a
 * sheet being turned — full-width translate with a slight rotateY around
 * the spine, and a soft moving shadow gradient along the leading edge
 * (the "paper lifting" shadow that travels with the curl).
 *
 * Exit (1 → 2): the outgoing page recedes — it slides toward the spine,
 * scales down slightly and darkens, like the page being turned past.
 *
 * All animation is transform + opacity only (60fps friendly) and settles
 * to exact identity transforms at p = 1. Reduce Motion skips to no
 * animation (snap straight to 1).
 */
export function PageFlip({ children, direction = 1, style, ...props }: PageFlipProps) {
  const p = useSharedValue(1);
  const hasFocusedBefore = useRef(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const screenWidth = useRef(Dimensions.get("window").width).current;

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
    // Sweep in from the far edge, decelerating like a falling sheet.
    p.value = 0;
    p.value = withTiming(1, { duration: ENTER_DURATION_MS, easing: EASE_OUT_QUART });
  }, [p, reduceMotion]);

  const exit = useCallback(() => {
    if (!hasFocusedBefore.current || reduceMotion) {
      p.value = reduceMotion ? 1 : p.value;
      return;
    }
    // Recede toward the spine and darken, like the page being turned past.
    p.value = withTiming(2, { duration: EXIT_DURATION_MS, easing: EASE_OUT_QUART });
  }, [p, reduceMotion]);

  useFocusEffect(
    useCallback(() => {
      enter();
      return () => {
        exit();
      };
    }, [enter, exit]),
  );

  // Sheet sweep + lift (transform + shadow only; identity at p = 1).
  const pageStyle = useAnimatedStyle(() => {
    const t = p.value;
    if (t <= 1) {
      const inv = 1 - t; // 1 at start, exactly 0 when settled
      return {
        transform: [
          { perspective: 1400 },
          { translateX: screenWidth * direction * inv },
          { rotateY: `${-10 * direction * inv}deg` },
          { scale: 1 + 0.02 * inv },
        ],
        shadowOpacity: 0.4 * inv,
        pointerEvents: inv > 0.02 ? ("none" as const) : ("auto" as const),
      };
    }
    // Outgoing page: recede toward the spine, shrink, go inert.
    const k = t - 1;
    return {
      transform: [
        { perspective: 1400 },
        { translateX: -screenWidth * 0.18 * direction * k },
        { rotateY: "0deg" },
        { scale: 1 - 0.035 * k },
      ],
      shadowOpacity: 0,
      pointerEvents: k > 0.02 ? ("none" as const) : ("auto" as const),
    };
  });

  // Paper-lift tint: dims the underside of the sheet while it travels,
  // clearing to nothing at rest.
  const tintStyle = useAnimatedStyle(() => {
    const t = p.value;
    const tint = t <= 1 ? 0.22 * (1 - t) : 0.16 * (t - 1);
    return { opacity: Math.max(0, Math.min(1, tint)) };
  });

  // Leading-edge shadow: a soft gradient at the sweeping edge, strongest
  // mid-turn and gone at rest — the shadow that travels with the curl.
  const edgeShadowStyle = useAnimatedStyle(() => {
    const t = p.value;
    if (t <= 1) {
      const a = t < 0.35 ? t / 0.35 : 1 - (t - 0.35) / 0.65;
      return { opacity: Math.max(0, Math.min(1, a)) * 0.55 };
    }
    return { opacity: 0 };
  });

  return (
    <Animated.View style={[styles.page, pageStyle, style]} {...props}>
      {children}
      {/* Paper-lift tint on the underside of the turning sheet */}
      <Animated.View pointerEvents="none" style={[styles.tintOverlay, tintStyle]}>
        <LinearGradient
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.35)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: direction === 1 ? 1 : 0, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      {/* Soft moving shadow at the leading edge (the curl) */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.edgeShadow,
          direction === 1 ? styles.edgeShadowRight : styles.edgeShadowLeft,
          edgeShadowStyle,
        ]}
      >
        <LinearGradient
          colors={
            direction === 1
              ? ["rgba(31,26,20,0)", "rgba(31,26,20,0.45)", "rgba(31,26,20,0.78)"]
              : ["rgba(31,26,20,0.78)", "rgba(31,26,20,0.45)", "rgba(31,26,20,0)"]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    shadowColor: "#241d15",
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
  },
  tintOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  edgeShadow: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 56,
  },
  edgeShadowRight: {
    right: 0,
  },
  edgeShadowLeft: {
    left: 0,
  },
});
