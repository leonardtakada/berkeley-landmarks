import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { launchScreenLifted, liftLaunchScreen } from "@/lib/launch-screen";

const LOGO_ASPECT = 648 / 737;
const EASE = Easing.bezier(0.3, 0, 0.1, 1);
/** The launch screen's sheet (scripts/splash.mjs): its size, and its Campanile's width and rise above centre, in points. */
const SPLASH = { w: 430, h: 932, logo: 240, rise: 58 };

/**
 * Where the launch screen shows the Campanile, as a move and scale from where
 * the cover lays it out: its sheet fills the screen, cropped to fit. (Only on
 * a phone — on a tablet the sheet is blown up, and the cover just fades in.)
 */
function fromSplash(screen: { width: number; height: number }, at: { x: number; y: number; w: number; h: number }) {
  const fill = Math.max(screen.width / SPLASH.w, screen.height / SPLASH.h);
  const s = (SPLASH.logo * fill) / at.w;
  if (s < 0.8 || s > 1.25) return { dx: 0, dy: 0, s: 1 };
  return {
    dx: screen.width / 2 - (at.x + at.w / 2),
    dy: screen.height / 2 - SPLASH.rise * fill - (at.y + at.h / 2),
    s,
  };
}

/**
 * The cover: solid blue board — the same blue as the launch screen, so the
 * app opens straight onto it — with the Campanile device and the title in
 * cream. No lists, no buttons; the ribbons at the head of the guide open it.
 */
export default function CoverScreen() {
  const insets = useSafeAreaInsets();
  const { contentTop } = useBookHead();
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const press = useSharedValue(reduceMotion ? 1 : 0);
  // The Campanile starts where the launch screen had it, so the two meet
  // without a seam, then settles into its place as the type prints.
  const settle = useSharedValue(reduceMotion ? 1 : 0);
  const [start, setStart] = useState({ dx: 0, dy: 0, s: 1 });
  const logoRef = useRef<View>(null);
  const ready = useRef({ drawn: false, placed: false });
  const readyFor = (part: "drawn" | "placed") => {
    ready.current[part] = true;
    if (ready.current.drawn && ready.current.placed) liftLaunchScreen();
  };
  // (Measured once, before it has moved.)
  const place = () =>
    !ready.current.placed &&
    logoRef.current?.measureInWindow((x, y, w, h) => {
      if (w > 0) setStart(fromSplash({ width, height }, { x, y, w, h }));
      readyFor("placed");
    });
  const settleStyle = useAnimatedStyle(() => {
    const k = 1 - settle.value;
    return {
      transform: [{ translateX: start.dx * k }, { translateY: start.dy * k }, { scale: 1 + (start.s - 1) * k }],
    };
  });

  // Cream status-bar lettering on the blue board; charcoal everywhere else.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle("light", true);
      return () => setStatusBarStyle("dark", true);
    }, []),
  );

  // The type prints up once the launch screen has lifted off the board.
  useEffect(() => {
    if (reduceMotion) return;
    let live = true;
    launchScreenLifted().then(() => {
      if (!live) return;
      settle.value = withDelay(80, withTiming(1, { duration: 900, easing: EASE }));
      press.value = withDelay(80, withTiming(1, { duration: 1100, easing: EASE }));
    });
    return () => {
      live = false;
    };
  }, [press, settle, reduceMotion]);

  const logoW = Math.min(width * 0.58, 240);

  return (
    <InkPlane color={PAPER.board} texture={0.18} style={styles.board}>
      <View style={[styles.frame, { paddingTop: contentTop + 26, paddingBottom: Math.max(insets.bottom, 16) + 18 }]}>
        <Printed press={press} from={0.1} to={0.45} style={{ paddingRight: RIBBON_COLUMN - 24 }}>
          <Text style={styles.kicker}>A field guide{"\n"}to the city</Text>
        </Printed>

        {/* Already on the board as the launch screen fades: it isn't printed again. */}
        <View style={styles.device}>
          <Animated.View
            ref={logoRef}
            onLayout={place}
            style={[{ width: logoW, height: logoW / LOGO_ASPECT }, settleStyle]}
            accessibilityRole="image"
            accessibilityLabel="Berkeley Tours — the Campanile"
          >
            <StreetsLogo width={logoW} height={logoW / LOGO_ASPECT} onLoad={() => readyFor("drawn")} />
          </Animated.View>
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
