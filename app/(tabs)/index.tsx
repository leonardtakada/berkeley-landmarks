import React, { useCallback, useEffect } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { setStatusBarStyle } from "expo-status-bar";

import { RIBBON_COLUMN, useBookHead } from "@/components/bookmark-ribbons";
import { StreetsLogo } from "@/components/logo-walkers";
import { Bar, InkPlane } from "@/components/print";
import { FONT, INK, PAPER } from "@/constants/book";

const LOGO_ASPECT = 648 / 737;
const EASE = Easing.bezier(0.3, 0, 0.1, 1);

/**
 * The cover: solid blue board — the same blue as the launch screen, so the
 * app opens straight onto it — with the Campanile device and the title in
 * cream. No lists, no buttons; the ribbons at the head of the guide open it.
 */
export default function CoverScreen() {
  const insets = useSafeAreaInsets();
  const { contentTop } = useBookHead();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const press = useSharedValue(reduceMotion ? 1 : 0);

  // Cream status-bar lettering on the blue board; charcoal everywhere else.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle("light", true);
      return () => setStatusBarStyle("dark", true);
    }, []),
  );

  useEffect(() => {
    if (reduceMotion) return;
    press.value = withDelay(120, withTiming(1, { duration: 1100, easing: EASE }));
  }, [press, reduceMotion]);

  const logoW = Math.min(width * 0.58, 240);

  return (
    <InkPlane color={PAPER.board} texture={0.18} style={styles.board}>
      <View style={[styles.frame, { paddingTop: contentTop + 26, paddingBottom: Math.max(insets.bottom, 16) + 18 }]}>
        <Printed press={press} from={0.1} to={0.45} style={{ paddingRight: RIBBON_COLUMN - 24 }}>
          <Text style={styles.kicker}>A field guide{"\n"}to the city</Text>
        </Printed>

        <View style={styles.device}>
          <Printed press={press} from={0} to={0.6} lift={4}>
            <View
              style={{ width: logoW, height: logoW / LOGO_ASPECT }}
              accessibilityRole="image"
              accessibilityLabel="Berkeley Tours — the Campanile"
            >
              <StreetsLogo width={logoW} height={logoW / LOGO_ASPECT} />
            </View>
          </Printed>
        </View>

        <Printed press={press} from={0.4} to={0.85}>
          <View style={styles.titleBlock}>
            <Bar color={INK.vermilion} width={32} height={4} />
            <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>
              Berkeley Tours
            </Text>
            <Text style={styles.subtitle}>Landmarks, Architects &amp; Walks</Text>
          </View>
        </Printed>
        <Printed press={press} from={0.65} to={1}>
          <View style={styles.imprintRow}>
            <View style={styles.imprintRule} />
            <Text style={styles.imprint}>Berkeley · California</Text>
            <View style={styles.imprintRule} />
          </View>
        </Printed>
      </View>
    </InkPlane>
  );
}

/** Printed matter coming up off the board: a fade with a slight settle. */
function Printed({
  press,
  from,
  to,
  lift = 6,
  style,
  children,
}: {
  press: SharedValue<number>;
  from: number;
  to: number;
  lift?: number;
  style?: object;
  children: React.ReactNode;
}) {
  const anim = useAnimatedStyle(() => {
    const t = interpolate(press.value, [from, to], [0, 1], "clamp");
    return { opacity: t, transform: [{ translateY: (1 - t) * lift }] };
  });
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

const CREAM = PAPER.cover;

const styles = StyleSheet.create({
  board: {
    flex: 1,
  },
  frame: {
    flex: 1,
    paddingHorizontal: 24,
  },
  kicker: {
    fontFamily: FONT.medium,
    fontSize: 11,
    lineHeight: 17,
    letterSpacing: 2.8,
    textTransform: "uppercase",
    color: CREAM,
  },
  device: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  titleBlock: {
    alignItems: "center",
  },
  title: {
    fontFamily: FONT.display,
    fontSize: 52,
    lineHeight: 58,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: CREAM,
    textAlign: "center",
    marginTop: 18,
  },
  subtitle: {
    fontFamily: FONT.regular,
    fontSize: 17,
    letterSpacing: 0.2,
    color: "rgba(242,240,230,0.8)",
    textAlign: "center",
    marginTop: 2,
  },
  imprintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 26,
  },
  imprintRule: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(242,240,230,0.3)",
  },
  imprint: {
    fontFamily: FONT.medium,
    fontSize: 10,
    letterSpacing: 2.6,
    textTransform: "uppercase",
    color: "rgba(242,240,230,0.7)",
  },
});
