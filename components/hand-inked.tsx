import React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";

/**
 * Hand-inked book details — pure Views, no image assets.
 *
 * - `CornerTicks`: hand-ruled frame corners (small L marks slightly inset,
 *   like a draughtsman ruling a plate frame freehand).
 * - `InkRule`: dash-dot printer's rule (hairline — diamond — hairline),
 *   like an inked divider in a vintage guidebook.
 * - `InkDash`: dashed deckle hairline for list separators (torn-edge hint).
 *
 * All static transforms — no per-frame work.
 */

export interface CornerTicksProps {
  /** Ink color (typically border color). */
  color: string;
  /** Length of each tick arm. Default 10. */
  size?: number;
  /** Inset from the container edges. Default 4. */
  inset?: number;
  /** Tick thickness. Default StyleSheet.hairlineWidth * 2. */
  thickness?: number;
}

/**
 * Four hand-ruled corner marks. Drop inside any relatively-positioned,
 * non-clipping container to give a straight border a hand-inked frame feel.
 */
export function CornerTicks({
  color,
  size = 10,
  inset = 4,
  thickness = StyleSheet.hairlineWidth * 2,
}: CornerTicksProps) {
  const arm: ViewStyle = {
    position: "absolute" as const,
    width: size,
    height: size,
    borderColor: color,
    opacity: 0.9,
  };
  // Slight optical jitter so the frame reads as ruled by hand, not plotted.
  const jitter = 0.75;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View
        style={[
          arm,
          {
            top: inset,
            left: inset + jitter,
            borderTopWidth: thickness,
            borderLeftWidth: thickness,
          },
        ]}
      />
      <View
        style={[
          arm,
          {
            top: inset,
            right: inset,
            borderTopWidth: thickness,
            borderRightWidth: thickness,
          },
        ]}
      />
      <View
        style={[
          arm,
          {
            bottom: inset,
            left: inset,
            borderBottomWidth: thickness,
            borderLeftWidth: thickness,
          },
        ]}
      />
      <View
        style={[
          arm,
          {
            bottom: inset + jitter,
            right: inset + jitter,
            borderBottomWidth: thickness,
            borderRightWidth: thickness,
          },
        ]}
      />
    </View>
  );
}

export interface InkRuleProps {
  color: string;
  /** Overall width. Default "100%". */
  width?: number | `${number}%`;
  /** Diamond size. Default 5. */
  diamond?: number;
}

/** Dash-dot printer's rule: hairline — rotated diamond — hairline. */
export function InkRule({ color, width = "100%", diamond = 5 }: InkRuleProps) {
  return (
    <View style={[styles.ruleRow, { width }]}>
      <View style={[styles.ruleLine, { borderColor: color, borderBottomWidth: StyleSheet.hairlineWidth, borderStyle: "dotted" }]} />
      <View style={[styles.ruleDiamond, { width: diamond, height: diamond, borderColor: color }]} />
      <View style={[styles.ruleLine, { borderColor: color, borderBottomWidth: StyleSheet.hairlineWidth, borderStyle: "dotted" }]} />
    </View>
  );
}

/** Dashed deckle hairline — torn-edge hint for list separators. */
export function InkDash({ color }: { color: string }) {
  return (
    <View
      pointerEvents="none"
      style={{
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderStyle: "dashed",
        borderBottomColor: color,
        opacity: 0.8,
      }}
    />
  );
}

const styles = StyleSheet.create({
  ruleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  ruleLine: {
    flex: 1,
  },
  ruleDiamond: {
    borderWidth: StyleSheet.hairlineWidth,
    transform: [{ rotate: "45deg" }],
  },
});
