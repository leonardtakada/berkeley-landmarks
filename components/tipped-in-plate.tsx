import React from "react";
import { Image, Pressable, StyleSheet, Text, View, Platform } from "react-native";
import type { ImageSourcePropType, StyleProp, ImageStyle, ViewStyle } from "react-native";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useColors } from "@/hooks/use-colors";

/**
 * TippedInPlate — wraps a photo like a tipped-in plate in a Showa-era art book:
 * a paper border around the image, a small-caps serif italic caption beneath
 * ("Plate I", "Plate II", …), a deterministic slight rotation, and a subtle
 * shadow so the plate feels physically pasted onto the page.
 */

/** Deterministic rotation in degrees, stable across renders. */
function plateRotation(index: number): number {
  return ((index % 5) - 2) * 0.9;
}

const ROMAN_NUMERAL_PAIRS: [number, string][] = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

/** Small local roman-numeral helper (I, II, III, …). */
function toRoman(n: number): string {
  if (n <= 0) return "I";
  let value = n;
  let result = "";
  for (const [num, sym] of ROMAN_NUMERAL_PAIRS) {
    while (value >= num) {
      result += sym;
      value -= num;
    }
  }
  return result;
}

export interface TippedInPlateProps {
  /** Image source (uri or require()).
   */
  source: ImageSourcePropType;
  /** Plate number (1-based). Determines roman numeral and rotation. */
  index: number;
  /** Optional short caption text after "Plate II — ". */
  caption?: string;
  /** Style for the outer (paper) frame. */
  style?: StyleProp<ViewStyle>;
  /** Style for the image itself (size etc.). */
  imageStyle?: StyleProp<ImageStyle>;
  /** Image resize mode; plates default to "cover". */
  resizeMode?: "cover" | "contain" | "stretch" | "center";
  /** Optional press handler (e.g. open viewer). */
  onPress?: () => void;
  /** Disable the paper shadow (e.g. for full-bleed usage). */
  noShadow?: boolean;
}

const SERIF = Platform.select({ ios: "ui-serif", default: "serif" }) ?? "serif";

export function TippedInPlate({
  source,
  index,
  caption,
  style,
  imageStyle,
  resizeMode = "cover",
  onPress,
  noShadow = false,
}: TippedInPlateProps) {
  const colors = useColors();
  const scheme = useColorScheme();

  // Paper stays paper even in dark mode — a warm off-white pasted plate —
  // while caption ink follows the theme so it reads against the page.
  const paper = scheme === "dark" ? "#EDE9DF" : "#FEFDF8";
  const ink = colors.muted;

  const label = caption
    ? `Plate ${toRoman(index)} — ${caption}`
    : `Plate ${toRoman(index)}`;

  const frame = (
    <View
      style={[
        styles.paper,
        {
          backgroundColor: paper,
          transform: [{ rotate: `${plateRotation(index)}deg` }],
        },
        !noShadow && styles.shadow,
        style,
      ]}
    >
      <Image
        source={source}
        style={[styles.image, imageStyle]}
        resizeMode={resizeMode}
      />
      <Text style={[styles.caption, { color: ink }]} numberOfLines={1}>
        {label.toUpperCase()}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={styles.pressable}>
        {frame}
      </Pressable>
    );
  }
  return frame;
}

const styles = StyleSheet.create({
  paper: {
    padding: 8,
    alignSelf: "flex-start",
  },
  shadow: {
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 1, height: 2 },
    elevation: 3,
  },
  image: {
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  caption: {
    marginTop: 6,
    fontSize: 9,
    fontFamily: SERIF,
    fontStyle: "italic",
    fontWeight: "600",
    letterSpacing: 2,
    textTransform: "uppercase",
    alignSelf: "stretch",
    textAlign: "center",
  },
  pressable: {
    alignSelf: "flex-start",
  },
});
