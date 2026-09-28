import React, { useEffect } from "react";
import { Platform, StyleSheet, View } from "react-native";
import Svg, { Path, Text as SvgText } from "react-native-svg";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { FONT, INK, PAPER } from "@/constants/book";

/**
 * A collected stop, as a Showa-era travel label: a flat shape of ink —
 * circle, square, triangle or arch — with the place set in Jost. Stops not
 * yet visited show only the dashed outline of the label to come.
 */

type Shape = "circle" | "square" | "triangle" | "arch";
const SHAPES: Shape[] = ["circle", "square", "arch", "triangle"];
const INKS: { fill: string; text: string }[] = [
  { fill: INK.blue, text: PAPER.cover },
  { fill: INK.vermilion, text: PAPER.cover },
  { fill: INK.blueTint, text: INK.blue },
];

function hash(s: string) {
  let h = 7;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

function shapePath(shape: Shape, s: number): string {
  const m = 2;
  const e = s - m;
  switch (shape) {
    case "circle": {
      const r = s / 2 - m;
      const c = s / 2;
      const k = r * 0.5523;
      return `M${c} ${c - r} C${c + k} ${c - r} ${c + r} ${c - k} ${c + r} ${c} C${c + r} ${c + k} ${c + k} ${c + r} ${c} ${c + r} C${c - k} ${c + r} ${c - r} ${c + k} ${c - r} ${c} C${c - r} ${c - k} ${c - k} ${c - r} ${c} ${c - r} Z`;
    }
    case "square":
      return `M${m + 4} ${m + 4} H${e - 4} V${e - 4} H${m + 4} Z`;
    case "triangle":
      return `M${s / 2} ${m} L${e} ${e - 4} H${m} Z`;
    case "arch": {
      const w = s * 0.72;
      const x0 = (s - w) / 2;
      const r = w / 2;
      return `M${x0} ${e} V${m + r} C${x0} ${m + r * 0.45} ${x0 + r * 0.45} ${m} ${s / 2} ${m} C${s - x0 - r * 0.45} ${m} ${s - x0} ${m + r * 0.45} ${s - x0} ${m + r} V${e} Z`;
    }
  }
}

/** Break a name into at most two short lines. */
function lines(name: string, max = 11): string[] {
  const words = name.replace(/[(),]/g, "").split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= max) cur += " " + w;
    else {
      out.push(cur);
      cur = w;
    }
    if (out.length === 2) break;
  }
  if (cur && out.length < 2) out.push(cur);
  if (out.length === 2 && words.join(" ").length > out.join(" ").length) {
    out[1] = out[1].length > max - 1 ? out[1].slice(0, max - 1) + "…" : out[1] + "…";
  }
  return out;
}

export interface TravelStampProps {
  landmarkName: string;
  tourName: string;
  collected: boolean;
  /** Press the label onto the page (and one firm haptic) on mount. */
  justCollected?: boolean;
  size?: number;
  /** Chooses the label's shape and ink; defaults to one derived from the name. */
  variant?: number;
  /** @deprecated labels sit square to the page */
  rotation?: number;
}

export function TravelStamp({
  landmarkName,
  collected,
  justCollected = false,
  size = 96,
  variant,
}: TravelStampProps) {
  const v = variant ?? hash(landmarkName);
  const shape = SHAPES[v % SHAPES.length];
  const ink = INKS[v % INKS.length];
  const d = shapePath(shape, size);
  const name = lines(landmarkName.toUpperCase());
  const fs = Math.max(7, size * 0.095);
  // Triangles carry their lettering low, where the label is widest.
  const cy = shape === "triangle" ? size * 0.66 : shape === "arch" ? size * 0.56 : size / 2;

  const art = (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {collected ? (
        <>
          <Path d={d} fill={ink.fill} />
          {name.map((line, i) => (
            <SvgText
              key={i}
              x={size / 2}
              y={cy + (i - (name.length - 1) / 2) * fs * 1.25 + fs * 0.35}
              fontSize={fs}
              fontFamily={FONT.medium}
              letterSpacing={0.8}
              fill={ink.text}
              textAnchor="middle"
            >
              {line}
            </SvgText>
          ))}
        </>
      ) : (
        <Path d={d} fill="none" stroke={INK.faded} strokeWidth={1.2} strokeDasharray="4 4" />
      )}
    </Svg>
  );

  return <Press active={justCollected}>{art}</Press>;
}

/** A clean press onto the page: from slightly large to flat, no spring. */
function Press({ active, children }: { active: boolean; children: React.ReactNode }) {
  const t = useSharedValue(active ? 0 : 1);

  useEffect(() => {
    if (!active) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    t.value = withTiming(1, { duration: 260, easing: Easing.bezier(0.3, 0, 0.1, 1) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once on mount
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, t.value * 2),
    transform: [{ scale: 1.25 - 0.25 * t.value }],
  }));

  return <Animated.View style={[styles.wrap, style]}>{children}</Animated.View>;
}

/** Full-screen flash of a freshly collected label (auto-dismiss). */
export function StampCollectOverlay({
  landmarkName,
  tourName,
  onDismiss,
  durationMs = 1400,
}: {
  landmarkName: string;
  tourName: string;
  onDismiss: () => void;
  durationMs?: number;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot timer
  }, []);

  return (
    <View style={styles.overlay} pointerEvents="none">
      <TravelStamp landmarkName={landmarkName} tourName={tourName} collected justCollected size={180} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
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
