import React from "react";
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { TiledTexture } from "@/components/tiled-texture";
import { INK, TYPE } from "@/constants/book";

const LAYDOWN = require("@/assets/textures/ink-laydown.png");

/**
 * Print primitives in the Showa Modern manner: crisp rules, rows of dots,
 * flat planes of ink. Geometry does the decorating; nothing is ornamented.
 */

/** A flat plane of ink, with the faint pinholes of lithographed colour. */
export function InkPlane({
  color,
  texture = 0.45,
  style,
  children,
}: {
  color: string;
  /** Strength of the laydown texture, 0–1. */
  texture?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  return (
    <View style={[{ backgroundColor: color, overflow: "hidden" }, style]}>
      <TiledTexture source={LAYDOWN} opacity={texture} />
      {children}
    </View>
  );
}

/** A single crisp rule. */
export function Rule({
  color = INK.rule,
  weight = StyleSheet.hairlineWidth * 2,
  style,
}: {
  color?: string;
  weight?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <View pointerEvents="none" style={[{ height: weight, backgroundColor: color }, style]} />;
}

/**
 * A row of round dots — the dotted leaders and dash rows of 1930s
 * commercial print. Fills its width.
 */
export function DotRule({
  color = INK.faded,
  gap = 6,
  size = 1.6,
  style,
}: {
  color?: string;
  gap?: number;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [w, setW] = React.useState(0);
  const n = Math.max(0, Math.floor(w / gap));
  return (
    <View
      pointerEvents="none"
      style={[{ height: size + 2, justifyContent: "center" }, style]}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
    >
      {n > 0 ? (
        <Svg width={w} height={size + 2}>
          {Array.from({ length: n }, (_, i) => (
            <Circle key={i} cx={i * gap + size / 2 + (w - (n - 1) * gap - size) / 2} cy={size / 2 + 1} r={size / 2} fill={color} />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

/** A short bar of solid ink: the mark that opens a section. */
export function Bar({ color = INK.vermilion, width = 28, height = 4 }: { color?: string; width?: number; height?: number }) {
  return <View style={{ width, height, backgroundColor: color }} />;
}

/** A straight arrow with a solid head, for links and directions. */
export function Arrow({
  length = 22,
  color = INK.blue,
  direction = "right",
  weight = 1.4,
}: {
  length?: number;
  color?: string;
  direction?: "right" | "left" | "up" | "down";
  weight?: number;
}) {
  const h = 9;
  const rotate = { right: "0deg", left: "180deg", up: "-90deg", down: "90deg" }[direction];
  return (
    <Svg width={length} height={h} style={{ transform: [{ rotate }] }}>
      <Path d={`M0 ${h / 2} H${length - 5}`} stroke={color} strokeWidth={weight} />
      <Path d={`M${length - 7} 0.8 L${length} ${h / 2} L${length - 7} ${h - 0.8} Z`} fill={color} />
    </Svg>
  );
}

/** A marginal note: Jost light italic. */
export function Annotation({
  children,
  style,
  numberOfLines,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  return (
    <Text numberOfLines={numberOfLines} style={[TYPE.annotation, style]}>
      {children}
    </Text>
  );
}

/** Tracked capital label with an optional leading ink dot. */
export function Label({
  children,
  dot,
  color,
  style,
}: {
  children: React.ReactNode;
  dot?: string;
  color?: string;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <View style={styles.labelRow}>
      {dot ? <View style={[styles.labelDot, { backgroundColor: dot }]} /> : null}
      <Text style={[TYPE.label, color ? { color } : null, style]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  labelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
