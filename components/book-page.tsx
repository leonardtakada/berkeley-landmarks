import React, { useEffect, useRef } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useIsFocused } from "expo-router";

import { RIBBON_COLUMN, useBookHead } from "@/components/bookmark-ribbons";
import { PaperSheet } from "@/components/paper-grain";
import { Bar, DotRule } from "@/components/print";
import { FONT, INK, MARGIN, PAGE_TURN_DELAY_MS, PAGE_TURN_MS, PAPER, TYPE } from "@/constants/book";

/**
 * A section leaf of the book: paper stock, with content beginning just
 * under the head-band (the ribbons hang over its top margin).
 */
export function SectionPage({
  stock = "page",
  children,
}: {
  stock?: "cover" | "page";
  children: React.ReactNode;
}) {
  const { contentTop } = useBookHead();
  return (
    <View style={[styles.page, { backgroundColor: PAPER[stock], paddingTop: contentTop }]}>
      <PaperSheet stock={stock} />
      {children}
    </View>
  );
}

/**
 * 0 → 1 once, the first time this page is turned to — after the leaf has
 * mostly cleared — so printed matter can come up as the page is revealed.
 * (Section pages are bound in while hidden, so mount-time animation would
 * play unseen.)
 */
export function useFirstReveal(duration = 800): SharedValue<number> {
  const reduceMotion = useReducedMotion();
  const focused = useIsFocused();
  const done = useRef(false);
  const reveal = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (!focused || done.current) return;
    done.current = true;
    if (reduceMotion) {
      reveal.value = 1;
      return;
    }
    reveal.value = withDelay(
      PAGE_TURN_DELAY_MS + Math.round(PAGE_TURN_MS * 0.45),
      withTiming(1, { duration, easing: Easing.bezier(0.3, 0, 0.1, 1) }),
    );
  }, [focused, duration, reduceMotion, reveal]);

  return reveal;
}

/** Printed matter coming up with the page reveal; `index` staggers a column. */
export function InkIn({
  reveal,
  index = 0,
  step = 0.06,
  style,
  children,
}: {
  reveal: SharedValue<number>;
  index?: number;
  step?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const start = Math.min(0.7, index * step);
  const anim = useAnimatedStyle(() => {
    const t = interpolate(reveal.value, [start, start + 0.3], [0, 1], "clamp");
    return { opacity: t, transform: [{ translateY: (1 - t) * 8 }] };
  });
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/**
 * Section opener: a vermilion bar and tracked kicker, the title in the
 * cut-paper display face, and a line of description.
 */
export function ChapterOpener({
  kicker,
  title,
  note,
  reveal,
  clearRibbons = true,
}: {
  kicker: string;
  title: string;
  note?: string;
  reveal?: SharedValue<number>;
  clearRibbons?: boolean;
}) {
  const body = (
    <View style={[styles.opener, clearRibbons && { paddingRight: RIBBON_COLUMN }]}>
      <Bar />
      <Text style={[TYPE.kicker, styles.kicker]}>{kicker}</Text>
      <Text style={styles.title} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>
        {title}
      </Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
  return reveal ? <InkIn reveal={reveal}>{body}</InkIn> : body;
}

/** Dotted leader between an entry and its number; fills the space left. */
export function Leader() {
  return <DotRule style={styles.leader} gap={5} size={1.5} />;
}

/** Folio at the foot of a section. */
export function Folio({ children }: { children: string }) {
  return (
    <View style={styles.folio}>
      <View style={styles.folioRule} />
      <Text style={TYPE.label}>{children}</Text>
      <View style={styles.folioRule} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  opener: {
    paddingLeft: MARGIN.outer,
    paddingTop: 26,
    paddingBottom: 18,
  },
  kicker: {
    marginTop: 12,
  },
  title: {
    ...TYPE.display,
    marginTop: 8,
  },
  note: {
    fontFamily: FONT.regular,
    fontSize: 15,
    lineHeight: 22,
    color: INK.sepia,
    marginTop: 10,
  },
  leader: {
    flex: 1,
    marginHorizontal: 8,
    marginBottom: 5,
  },
  folio: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 36,
    marginHorizontal: MARGIN.outer,
  },
  folioRule: {
    flex: 1,
    height: 1,
    backgroundColor: INK.rule,
  },
});
