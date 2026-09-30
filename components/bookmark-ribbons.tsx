import React, { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { FONT, INK, PAGE_TURN_DELAY_MS, PAGE_TURN_MS, PAPER } from "@/constants/book";

const LAYDOWN = require("@/assets/textures/ink-laydown.png");

/**
 * Bookmark ribbons hanging from the head of the book.
 *
 * Flat tapes of ink, square-cut, tucked under a solid band of logo blue at
 * the top edge. The open section's ribbon is drawn out further and printed
 * in solid blue; the others rest in a blue tint, like a screened plate
 * beside a solid one. Tapping the open section's ribbon closes the book.
 *
 * Each ribbon is drawn at full length and slid out from under the band, so
 * the band hides whatever is still tucked in.
 *
 * The ribbons lie over the open page, so they fade away while a leaf turns
 * — all of them, quickly — and come back on the new page as it lands, the
 * open section's already drawn out in solid blue. Nothing moves but the
 * leaf.
 */

export const HEAD_BAND_H = 5;
const RIBBON_W = 54;
const GAP = 8;
const RIGHT_MARGIN = 20;
const LEN = 160;
const EXTEND = 22;
const EASE = Easing.bezier(0.3, 0, 0.1, 1);

const FADE_OUT_MS = 120;
const FADE_IN_AT_MS = PAGE_TURN_DELAY_MS + Math.round(PAGE_TURN_MS * 0.55);
const FADE_IN_MS = 200;

/** Width of the column the ribbons occupy at the head of a page. */
export const RIBBON_COLUMN = RIGHT_MARGIN + RIBBON_W * 3 + GAP * 2 + 12;

type Section = { name: string; label: string; rest: number };

export const SECTIONS: Section[] = [
  // Each ribbon hangs long enough to show its whole label.
  { name: "tours", label: "Tours", rest: 100 },
  { name: "registry", label: "Landmarks", rest: 128 },
  { name: "profile", label: "Appendix", rest: 116 },
];

/** Offset of the page content so it begins under the head-band. */
export function useBookHead() {
  const insets = useSafeAreaInsets();
  return { top: insets.top, contentTop: insets.top + HEAD_BAND_H };
}

function Ribbon({
  section,
  index,
  left,
  selected,
  turn,
  onPress,
}: {
  section: Section;
  index: number;
  left: number;
  selected: boolean;
  /** Counts the page turns. */
  turn: number;
  onPress: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const drop = useSharedValue(reduceMotion ? 1 : 0);
  const focus = useSharedValue(selected ? 1 : 0);
  const shown = useSharedValue(1);

  // Drawn out onto the page when the book first opens, one after another.
  useEffect(() => {
    if (reduceMotion) return;
    drop.value = withDelay(220 + index * 90, withTiming(1, { duration: 620, easing: EASE }));
  }, [drop, index, reduceMotion]);

  // Out of the way while the leaf turns.
  useEffect(() => {
    if (turn === 0 || reduceMotion) return;
    shown.value = withSequence(
      withTiming(0, { duration: FADE_OUT_MS, easing: Easing.out(Easing.quad) }),
      withDelay(FADE_IN_AT_MS - FADE_OUT_MS, withTiming(1, { duration: FADE_IN_MS, easing: Easing.inOut(Easing.quad) })),
    );
  }, [turn, shown, reduceMotion]);

  // A new section: each ribbon changes while it's away, so it comes back
  // already drawn out (or in) and in its new ink.
  useEffect(() => {
    focus.value = withDelay(turn === 0 || reduceMotion ? 0 : FADE_OUT_MS, withTiming(selected ? 1 : 0, { duration: 0 }));
  }, [selected, turn, focus, reduceMotion]);

  const rest = section.rest;
  const fade = useAnimatedStyle(() => ({ opacity: shown.value }));
  const slide = useAnimatedStyle(() => ({
    transform: [{ translateY: HEAD_BAND_H + drop.value * (rest + EXTEND * focus.value) - LEN }],
  }));
  const tape = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(focus.value, [0, 1], [INK.blueTint, INK.blue]),
  }));
  const label = useAnimatedStyle(() => ({
    color: interpolateColor(focus.value, [0, 1], [INK.blue, PAPER.cover]),
  }));
  const hit = useAnimatedStyle(() => ({
    height: Math.max(0, drop.value * (rest + EXTEND * focus.value)),
  }));

  return (
    <View pointerEvents="box-none" style={[styles.column, { left }]}>
      <Animated.View pointerEvents="none" style={[styles.ribbonShadow, fade, slide]}>
        <View style={styles.ribbon}>
          <Animated.View style={[StyleSheet.absoluteFill, tape]} />
          <Image source={LAYDOWN} style={styles.grain} />
          <View style={styles.labelBox}>
            <Animated.Text style={[styles.label, label]} numberOfLines={1}>
              {section.label.toUpperCase()}
            </Animated.Text>
          </View>
        </View>
      </Animated.View>
      <Animated.View style={[styles.hit, hit]}>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            onPress();
          }}
          style={StyleSheet.absoluteFill}
          hitSlop={{ left: 4, right: 4, bottom: 12 }}
          accessibilityRole="tab"
          accessibilityLabel={section.label}
          accessibilityState={{ selected }}
          accessibilityHint={selected ? "Returns to the cover" : undefined}
        />
      </Animated.View>
    </View>
  );
}

export function BookmarkRibbons({
  focused,
  onSelect,
}: {
  /** Route name of the open section ("index" for the cover). */
  focused: string;
  onSelect: (routeName: string) => void;
}) {
  const { width } = useWindowDimensions();
  const { top } = useBookHead();
  const start = width - RIGHT_MARGIN - RIBBON_W * SECTIONS.length - GAP * (SECTIONS.length - 1);

  // Every change of section is a page turn.
  const [turns, setTurns] = useState({ count: 0, at: focused });
  if (turns.at !== focused) setTurns({ count: turns.count + 1, at: focused });

  return (
    <View pointerEvents="box-none" style={[styles.head, { top }]}>
      <View pointerEvents="box-none" style={styles.clip}>
        {SECTIONS.map((section, i) => (
          <Ribbon
            key={section.name}
            section={section}
            index={i}
            left={start + i * (RIBBON_W + GAP)}
            selected={focused === section.name}
            turn={turns.count}
            onPress={() => onSelect(focused === section.name ? "index" : section.name)}
          />
        ))}
      </View>
      {/* The head-band: one solid bar of the logo blue. */}
      <View pointerEvents="none" style={styles.band} />
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(30,24,16,0.14)", "rgba(30,24,16,0)"]}
        style={styles.bandShadow}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    position: "absolute",
    left: 0,
    right: 0,
    height: HEAD_BAND_H + LEN,
    zIndex: 20,
    elevation: 20,
  },
  clip: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: HEAD_BAND_H + LEN,
    overflow: "hidden",
  },
  column: {
    position: "absolute",
    top: 0,
    width: RIBBON_W + 6,
    height: HEAD_BAND_H + LEN,
  },
  ribbonShadow: {
    width: RIBBON_W,
    height: LEN,
    // The tape lies on the page and casts a small, soft shadow.
    shadowColor: "#1E1810",
    shadowOpacity: 0.16,
    shadowRadius: 2,
    shadowOffset: { width: 1, height: 1.5 },
  },
  ribbon: {
    width: RIBBON_W,
    height: LEN,
    overflow: "hidden",
  },
  grain: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 256,
    height: 256,
    opacity: 0.28,
  },
  labelBox: {
    position: "absolute",
    width: 120,
    height: RIBBON_W,
    left: (RIBBON_W - 120) / 2,
    // The label reads top to bottom and ends a little above the cut.
    top: LEN - 14 - 60 - RIBBON_W / 2,
    justifyContent: "center",
    transform: [{ rotate: "90deg" }],
  },
  label: {
    fontFamily: FONT.medium,
    fontSize: 12,
    letterSpacing: 2.6,
    textAlign: "right",
  },
  hit: {
    position: "absolute",
    top: HEAD_BAND_H,
    left: 0,
    width: RIBBON_W,
  },
  band: {
    height: HEAD_BAND_H,
    backgroundColor: INK.blue,
  },
  bandShadow: {
    height: 4,
  },
});
