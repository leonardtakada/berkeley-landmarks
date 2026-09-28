import React, { useMemo } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { SvgXml } from "react-native-svg";

import { InkPlane } from "@/components/print";
import { FONT, INK, PAPER, TYPE, chapterNo } from "@/constants/book";
import { PLATE_H, PLATE_W, buildingPlateSvg, type PlateSubject } from "@/lib/building-plate";

/**
 * A photograph printed as a plate of the book: a one-ink duotone — shadows
 * in the logo blue, highlights in cream — with a flat block of vermilion
 * set behind it a little out of register, like the second plate of a
 * two-colour print. Captioned as a figure.
 */
export function TippedInPlate({
  source,
  index,
  caption,
  width,
  height,
  offset = 10,
  onPress,
  style,
}: {
  source: ImageSourcePropType;
  /** Figure number (1-based). */
  index: number;
  caption?: string;
  width: number;
  height: number;
  /** How far the vermilion block sits out of register; 0 for none. */
  offset?: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const body = (
    <View style={[{ width: width + offset }, style]}>
      <View style={{ width: width + offset, height: height + offset }}>
        {offset ? (
          <InkPlane color={INK.vermilion} style={[styles.block, { left: offset, top: offset, width, height }]} />
        ) : null}
        <View style={[styles.photo, { width, height }]}>
          <Image source={source} style={StyleSheet.absoluteFill} resizeMode="cover" />
          {/* One-ink duotone: drain the colour, screen in the blue, multiply the cream. */}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.grey]} />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.ink]} />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.paper]} />
        </View>
      </View>
      <Text style={[TYPE.label, styles.caption]} numberOfLines={1}>
        <Text style={styles.fig}>Fig. {chapterNo(index)}</Text>
        {caption ? `  ${caption}` : ""}
      </Text>
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="imagebutton" accessibilityLabel={caption ?? `Figure ${index}`}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

/**
 * Where the book has no photograph: a plate drawn instead — a cut-paper
 * print of a building of the landmark's style and kind (lib/building-plate).
 * An impression of the type, not a likeness, and captioned so.
 */
export function DrawnPlate({
  subject,
  index,
  width,
  style,
}: {
  subject: PlateSubject;
  /** Figure number (1-based). */
  index: number;
  width: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { svg, caption } = useMemo(
    () => buildingPlateSvg(subject),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [subject.id, subject.style, subject.category],
  );
  const height = Math.round((width * PLATE_H) / PLATE_W);
  return (
    <View style={[{ width }, style]}>
      <View
        style={[styles.drawn, { width, height }]}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`A drawing: ${caption}`}
      >
        <SvgXml xml={svg} width={width - 4} height={height - 4} />
      </View>
      <Text style={[TYPE.label, styles.caption]} numberOfLines={1}>
        <Text style={styles.fig}>Fig. {chapterNo(index)}</Text>
        {`  ${caption}`}
      </Text>
      <Text style={styles.drawnNote}>Drawn after its style; no photograph of it in the guide yet.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    position: "absolute",
  },
  photo: {
    overflow: "hidden",
    backgroundColor: PAPER.slip,
    isolation: "isolate",
  },
  grey: {
    backgroundColor: "#808080",
    mixBlendMode: "saturation",
  },
  ink: {
    backgroundColor: INK.blue,
    mixBlendMode: "screen",
  },
  paper: {
    backgroundColor: PAPER.slip,
    mixBlendMode: "multiply",
  },
  caption: {
    marginTop: 10,
  },
  fig: {
    color: INK.vermilion,
    fontFamily: FONT.medium,
  },
  drawn: {
    borderWidth: 2,
    borderColor: INK.blue,
    overflow: "hidden",
  },
  drawnNote: {
    fontFamily: FONT.regular,
    fontSize: 12.5,
    color: INK.sepia,
    marginTop: 4,
  },
});
