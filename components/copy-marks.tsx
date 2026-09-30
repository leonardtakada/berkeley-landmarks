import React, { useEffect, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle, G, Path, Text as SvgText } from "react-native-svg";
import * as Haptics from "expo-haptics";

import { WalkLabel } from "@/components/walk-label";
import { FONT, INK, PAPER, chapterNo } from "@/constants/book";
import { formatDay, type Day } from "@/lib/reader-copy";

/**
 * The marks a reader makes in their copy: a date stamp on a place they've
 * been or a walk they've walked, a tick against it in the contents and the
 * index, a page's corner turned down, and a walk's stamp in the Appendix.
 * All in the vermilion of a rubber stamp; the blue stays the guide's own.
 */

const STAMP = INK.vermilion;

function thump() {
  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
}

/** Pressed onto the page: from a little large to flat, no bounce. */
function Pressed({ fresh, children, style }: { fresh: boolean; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(fresh && !reduceMotion ? 0 : 1);
  useEffect(() => {
    if (!fresh) return;
    thump();
    if (!reduceMotion) t.value = withTiming(1, { duration: 240, easing: Easing.bezier(0.3, 0, 0.1, 1) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as it lands
  }, []);
  const anim = useAnimatedStyle(() => ({
    opacity: Math.min(1, t.value * 2.5),
    transform: [{ scale: 1.3 - 0.3 * t.value }],
  }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/** A tick in a solid disc of vermilion: done. */
export function CheckStamp({ size = 22, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={style} pointerEvents="none">
      <Circle cx={12} cy={12} r={12} fill={STAMP} />
      <Path d="M6.6 12.6 L10.3 16.1 L17.6 8.4" stroke={PAPER.cover} strokeWidth={2.6} fill="none" strokeLinecap="square" />
    </Svg>
  );
}

/**
 * The reader's date stamp: "Visited" or "Walked" and the day, beside a
 * tick. Unstamped, a dotted ring and the word to press it with. Pressing it
 * stamps today — once `check`, if given, allows it (a visit is stamped only
 * on the spot); pressing a stamp offers to erase it.
 */
export function DateStamp({
  word,
  day,
  onStamp,
  onErase,
  check,
  prompt,
  style,
}: {
  word: "Visited" | "Walked";
  day: Day | undefined;
  onStamp: () => void;
  onErase: () => void;
  /** Before stamping: resolves to null to stamp, or to a note saying why not. */
  check?: () => Promise<string | null>;
  /** What the unstamped mark says, e.g. "Mark as visited". */
  prompt: string;
  style?: StyleProp<ViewStyle>;
}) {
  // Only a stamp pressed here, now, is pressed onto the page.
  const [fresh, setFresh] = useState(false);
  if (!day && fresh) setFresh(false);
  const [checking, setChecking] = useState(false);
  const [why, setWhy] = useState<string | null>(null);

  if (!day) {
    const press = async () => {
      if (checking) return;
      if (check) {
        setChecking(true);
        setWhy(null);
        const no = await check();
        setChecking(false);
        if (no) {
          setWhy(no);
          return;
        }
      }
      setFresh(true);
      onStamp();
    };
    return (
      <View style={style}>
        <Pressable
          onPress={press}
          hitSlop={10}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.5 }]}
          accessibilityRole="button"
          accessibilityLabel={prompt}
          accessibilityState={{ busy: checking }}
        >
          <Svg width={22} height={22} viewBox="0 0 24 24">
            <Circle cx={12} cy={12} r={11} stroke={INK.faded} strokeWidth={1.2} strokeDasharray="3 3" fill="none" />
          </Svg>
          <Text style={[styles.prompt, checking && { color: INK.faded }]}>{checking ? "Finding where you are…" : prompt}</Text>
        </Pressable>
        {why ? (
          <Text style={styles.why} accessibilityLiveRegion="polite">
            {why}
          </Text>
        ) : null}
      </View>
    );
  }
  return (
    <Pressable
      onPress={() =>
        Alert.alert(`Erase the “${word}” stamp?`, `It's dated ${formatDay(day)}.`, [
          { text: "Keep it", style: "cancel" },
          { text: "Erase", style: "destructive", onPress: onErase },
        ])
      }
      hitSlop={10}
      style={({ pressed }) => [style, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
      accessibilityLabel={`${word} on ${formatDay(day)}`}
      accessibilityHint="Offers to erase the stamp"
    >
      <Pressed fresh={fresh} style={styles.row}>
        <CheckStamp size={22} />
        <View style={styles.stampBox}>
          <Text style={styles.stampWord}>{word}</Text>
          <Text style={styles.stampDay}>{formatDay(day, "stamp")}</Text>
        </View>
      </Pressed>
    </Pressable>
  );
}

/**
 * A page's corner, for the running head: turned down, it's a fold of
 * vermilion; smooth, the outline of the page.
 */
export function CornerFold({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={() => {
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onToggle();
      }}
      hitSlop={12}
      style={({ pressed }) => [styles.corner, pressed && { opacity: 0.5 }]}
      accessibilityRole="button"
      accessibilityLabel={on ? "Page turned down" : "Turn down this page"}
      accessibilityState={{ selected: on }}
      accessibilityHint={on ? "Smooths the corner out again" : "Keeps it among your turned-down pages, in the Appendix"}
    >
      <Svg width={20} height={22} viewBox="0 0 20 22">
        <Path
          d={on ? "M1 1 H12 L19 8 V21 H1 Z" : "M1 1 H19 V21 H1 Z"}
          stroke={on ? INK.blue : INK.faded}
          strokeWidth={1.3}
          fill="none"
          strokeLinejoin="miter"
        />
        {on ? <Path d="M12 1 V8 H19 Z" fill={STAMP} stroke={STAMP} strokeWidth={1.3} strokeLinejoin="miter" /> : null}
      </Svg>
    </Pressable>
  );
}

/**
 * A walk's stamp, as a passport's: a double ring of vermilion with the
 * walk's number, the day and the city.
 */
export function RingStamp({ walk, day, size = 84 }: { walk: number; day: Day; size?: number }) {
  const [d, m, y] = formatDay(day, "stamp").split(" ");
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" pointerEvents="none">
      <G opacity={0.94}>
        <Circle cx={50} cy={50} r={47} stroke={STAMP} strokeWidth={3.2} fill="none" />
        <Circle cx={50} cy={50} r={40} stroke={STAMP} strokeWidth={1.2} fill="none" />
        <SvgText x={50} y={30} fontSize={9.5} fontFamily={FONT.medium} letterSpacing={1.6} fill={STAMP} textAnchor="middle">
          {`WALK ${chapterNo(walk)}`}
        </SvgText>
        <Path d="M20 37 H80 M20 64 H80" stroke={STAMP} strokeWidth={1.2} />
        <SvgText x={50} y={57} fontSize={17} fontFamily={FONT.medium} letterSpacing={0.6} fill={STAMP} textAnchor="middle">
          {`${d} ${m}`}
        </SvgText>
        <SvgText x={50} y={78} fontSize={9.5} fontFamily={FONT.medium} letterSpacing={1.6} fill={STAMP} textAnchor="middle">
          {y}
        </SvgText>
      </G>
    </Svg>
  );
}

/** A walk's label with its stamp struck across the corner. */
export function StampedLabel({
  tourId,
  title,
  walk,
  day,
  width,
  fresh = false,
}: {
  tourId: string;
  title: string;
  walk: number;
  day: Day;
  width: number;
  fresh?: boolean;
}) {
  const ring = Math.round(width * 0.72);
  return (
    <View style={{ width, height: width * 1.2 }}>
      <WalkLabel tourId={tourId} title={title} width={width} animated={false} />
      <Pressed fresh={fresh} style={[styles.ring, { width: ring, height: ring, right: -ring * 0.3, bottom: -ring * 0.18 }]}>
        <RingStamp walk={walk} day={day} size={ring} />
      </Pressed>
    </View>
  );
}

/** A finished walk's stamp, pressed on over the map, then gone. */
export function WalkStampOverlay({
  tourId,
  title,
  walk,
  day,
  onDismiss,
}: {
  tourId: string;
  title: string;
  walk: number;
  day: Day;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 2200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot timer
  }, []);
  return (
    <View style={styles.overlay} pointerEvents="none" accessibilityLiveRegion="polite">
      <View style={styles.overlaySheet} accessible accessibilityLabel={`Walk ${walk} walked, ${formatDay(day)}. Its stamp is in the Appendix.`}>
        <StampedLabel tourId={tourId} title={title} walk={walk} day={day} width={150} fresh />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 10,
  },
  why: {
    fontFamily: FONT.regular,
    fontSize: 13.5,
    lineHeight: 19,
    color: INK.sepia,
    marginTop: 8,
    maxWidth: 320,
  },
  prompt: {
    fontFamily: FONT.medium,
    fontSize: 11.5,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: INK.blue,
  },
  stampBox: {
    borderLeftWidth: 1.5,
    borderLeftColor: STAMP,
    paddingLeft: 9,
  },
  stampWord: {
    fontFamily: FONT.medium,
    fontSize: 10.5,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: STAMP,
  },
  stampDay: {
    fontFamily: FONT.medium,
    fontSize: 14,
    letterSpacing: 1.2,
    color: STAMP,
    marginTop: 1,
  },
  corner: {
    marginLeft: 16,
  },
  ring: {
    position: "absolute",
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
  },
  overlaySheet: {
    padding: 34,
    paddingRight: 60,
    paddingBottom: 50,
    backgroundColor: PAPER.slip,
    shadowColor: "#1E1810",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
});
