import React, { useEffect } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, Path, Text as SvgText, TextPath, TSpan } from "react-native-svg";
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useColorScheme } from "@/hooks/use-color-scheme";

/** Indigo ink on light paper, cream ink on dark paper. */
const INK_LIGHT = "#2B3A67";
const INK_DARK = "#EDE9DC";

function abbreviate(name: string, max = 14): string {
  const cleaned = name.replace(/[·—–-]/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  const initials = cleaned
    .split(" ")
    .map((w) => w[0])
    .join("");
  return initials.length >= 3 ? initials.toUpperCase() : cleaned.slice(0, max);
}

export interface TravelStampProps {
  landmarkName: string;
  tourName: string;
  collected: boolean;
  /** Fire the ink-stamp slam animation (and one heavy haptic) on mount. */
  justCollected?: boolean;
  size?: number;
  /** Deterministic-feeling rotation so stamps sit slightly askew. */
  rotation?: number;
}

/**
 * Vintage travel-stamp: a double-ring circular rubber stamp with curved
 * small-caps serif lettering (landmark abbreviation on top arc, tour name
 * on the bottom arc) and a star motif. Collected = fully inked; otherwise
 * a dashed-outline placeholder.
 */
export function TravelStamp({
  landmarkName,
  tourName,
  collected,
  justCollected = false,
  size = 96,
  rotation = -6,
}: TravelStampProps) {
  const scheme = useColorScheme();
  const ink = scheme === "dark" ? INK_DARK : INK_LIGHT;

  // Rough double ring: outer solid, inner with tiny gaps to mimic ink skips.
  const r = size / 2;
  const outerR = r - 3;
  const innerR = r - 9;
  const c = r; // center

  // Arc paths for curved text (sweep flag 1 = clockwise readable on top).
  const topArcR = outerR - 11;
  const bottomArcR = topArcR - 2;
  const topArc = `M ${c - topArcR * 0.92} ${c} A ${topArcR} ${topArcR} 0 0 1 ${c + topArcR * 0.92} ${c}`;
  const bottomArc = `M ${c - bottomArcR * 0.8} ${c} A ${bottomArcR} ${bottomArcR} 0 0 0 ${c + bottomArcR * 0.8} ${c}`;

  const stamp = (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Defs>
        <Path id={`top-arc-${size}`} d={topArc} />
        <Path id={`bottom-arc-${size}`} d={bottomArc} />
      </Defs>

      {/* Outer ring */}
      <Circle
        cx={c}
        cy={c}
        r={outerR}
        fill="none"
        stroke={ink}
        strokeWidth={2.5}
        strokeDasharray={collected ? "34 1.5 22 1 40 1" : "5 4"}
        opacity={collected ? 0.9 : 0.55}
      />
      {/* Inner ring */}
      <Circle
        cx={c}
        cy={c}
        r={innerR}
        fill="none"
        stroke={ink}
        strokeWidth={1.5}
        strokeDasharray={collected ? "26 1 18 1 30 1" : "3 4"}
        opacity={collected ? 0.8 : 0.45}
      />

      {collected && (
        <>
          {/* Landmark name curved along the top */}
          <SvgText
            fill={ink}
            fontSize={Math.max(8, size * 0.095)}
            fontFamily={Platform.select({ ios: "ui-serif", default: "serif" })}
            fontWeight="600"
            letterSpacing={1}
          >
            <TextPath href={`#top-arc-${size}`} startOffset="50%" textAnchor="middle">
              <TSpan>{abbreviate(landmarkName).toUpperCase()}</TSpan>
            </TextPath>
          </SvgText>

          {/* Tour name curved along the bottom */}
          <SvgText
            fill={ink}
            fontSize={Math.max(7, size * 0.08)}
            fontFamily={Platform.select({ ios: "ui-serif", default: "serif" })}
            fontWeight="600"
            letterSpacing={1}
          >
            <TextPath href={`#bottom-arc-${size}`} startOffset="50%" textAnchor="middle">
              <TSpan>{abbreviate(tourName, 16).toUpperCase()}</TSpan>
            </TextPath>
          </SvgText>

          {/* Star motif */}
          <SvgText
            fill={ink}
            fontSize={size * 0.22}
            textAnchor="middle"
            x={c}
            y={c + size * 0.075}
            fontFamily={Platform.select({ ios: "ui-serif", default: "serif" })}
          >
            ★
          </SvgText>

          {/* Date line under the star */}
          <SvgText
            fill={ink}
            fontSize={Math.max(6, size * 0.065)}
            textAnchor="middle"
            x={c}
            y={c + size * 0.21}
            fontFamily={Platform.select({ ios: "ui-serif", default: "serif" })}
            opacity={0.85}
          >
            BERKELEY
          </SvgText>
        </>
      )}

      {!collected && (
        /* Placeholder center: "not yet stamped" dot */
        <Circle cx={c} cy={c} r={2.5} fill={ink} opacity={0.35} />
      )}
    </Svg>
  );

  return (
    <InkStampAnimation active={justCollected} rotation={rotation}>
      {stamp}
    </InkStampAnimation>
  );
}

interface InkStampAnimationProps {
  active: boolean;
  rotation: number;
  children: React.ReactNode;
}

/**
 * Ink-stamp slam: scales from ~1.6 → 1 with a springy rotation settle and
 * a fast opacity ramp, firing one heavy haptic impact on mount. When
 * inactive, renders statically with the resting rotation.
 */
function InkStampAnimation({ active, rotation, children }: InkStampAnimationProps) {
  const scale = useSharedValue(active ? 1.6 : 1);
  const rotate = useSharedValue(active ? rotation + 14 : rotation);
  const opacity = useSharedValue(active ? 0 : 1);

  useEffect(() => {
    if (!active) {
      scale.value = 1;
      rotate.value = rotation;
      opacity.value = 1;
      return;
    }
    // One heavy thump as the stamp hits the page.
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    }
    opacity.value = withTiming(1, { duration: 110 });
    scale.value = withSpring(1, { mass: 0.7, damping: 9, stiffness: 190, overshootClamping: false });
    rotate.value = withSpring(rotation, { mass: 0.7, damping: 8, stiffness: 160, overshootClamping: false });
    return () => {
      cancelAnimation(scale);
      cancelAnimation(rotate);
      cancelAnimation(opacity);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once on mount
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
    opacity: opacity.value,
  }));

  return <Animated.View style={[styles.stampWrap, animatedStyle]}>{children}</Animated.View>;
}

/** Full-screen overlay flash of a freshly collected stamp (auto-dismiss). */
export function StampCollectOverlay({
  landmarkName,
  tourName,
  onDismiss,
  durationMs = 1200,
}: {
  landmarkName: string;
  tourName: string;
  onDismiss: () => void;
  durationMs?: number;
}) {
  useEffect(() => {
    const t = setTimeout(() => {
      onDismiss();
    }, durationMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot timer
  }, []);

  return (
    <View style={styles.overlay} pointerEvents="none">
      <TravelStamp
        landmarkName={landmarkName}
        tourName={tourName}
        collected
        justCollected
        size={180}
        rotation={-5}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stampWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
  },
});

// Silence unused-import warnings if Text/View usage changes; kept minimal.
export const __unused = { Text };
