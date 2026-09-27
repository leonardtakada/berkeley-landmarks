import React, { useEffect } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

/**
 * Bookmark-ribbon tab bar, hung from the HEAD of the book.
 *
 * The ribbons visibly COME OUT OF the book: their tops are tucked UNDER a
 * glossy dark-ink head-band (the spine's head strip along the very top edge
 * of the page), they overlap the page edge and cast a small drop shadow
 * where they cross it, and they end in a notched (swallow-tail) cut.
 * The selected ribbon hangs longer and is printed in BRAND_BLUE
 * (#0B2E8C); resting ribbons are faded sepia ink. Focus changes animate
 * height/color (~200ms spring).
 */

/** The logo blue — the only blue in the book. */
const BRAND_BLUE = "#0B2E8C";
/** Resting ribbons: faded sepia ink, like old silk. */
const RIBBON_REST = "#7A7168";

/** Height of the glossy head-band strip the ribbons emerge from behind. */
const HEAD_BAND_H = 10;
/** How far the ribbon tops are tucked under the band. */
const TUCK = 7;

const ICONS: Record<string, { focused: string; unfocused: string }> = {
  // index = Landmarks list (home)
  index: { focused: "building.columns.fill", unfocused: "building.columns" },
  tours: { focused: "figure.walk", unfocused: "figure.walk" },
  profile: { focused: "person.crop.circle.fill", unfocused: "person.crop.circle" },
};

// Staggered resting hang lengths — each ribbon drapes at a slightly
// different length, like real book ribbons pulled to different depths.
const STAGGER: Record<string, number> = {
  index: 44,
  tours: 32,
  profile: 38,
};

// hexToRGBA helper (colors are always 6-digit hex here)
function withAlpha(hex: string, alpha: number): string {
  "worklet";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Interpolate two hex colors (same "worklet"-safe style as withAlpha). */
function mixHex(a: string, b: string, t: number): string {
  "worklet";
  const ar = parseInt(a.slice(1, 3), 16),
    ag = parseInt(a.slice(3, 5), 16),
    ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16),
    bg = parseInt(b.slice(3, 5), 16),
    bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl
    .toString(16)
    .padStart(2, "0")}`;
}

/** One animated bookmark ribbon hanging down from behind the head-band. */
function RibbonTab({
  focused,
  routeKey,
  routeName,
  onPress,
  descriptorsTitle,
}: {
  focused: boolean;
  routeKey: string;
  routeName: string;
  onPress: () => void;
  descriptorsTitle?: string;
}) {
  const colors = useColors();
  const focus = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    // Subtle ~200ms spring on extend; timing on settle
    focus.value = focused
      ? withSpring(1, { damping: 20, stiffness: 260, mass: 0.7 })
      : withTiming(0, { duration: 200 });
  }, [focused, focus]);

  const rest = STAGGER[routeName] ?? 40;

  // Ribbon body + tail share one animated color: sepia at rest → brand blue
  // when pulled. Height grows with focus — the selected ribbon hangs longer.
  const color = useAnimatedStyle(() => ({
    backgroundColor: withAlpha(mixHex(RIBBON_REST, BRAND_BLUE, focus.value), 0.82 + 0.18 * focus.value),
  }));
  const ribbonStyle = useAnimatedStyle(() => {
    const height = rest + 16 * focus.value;
    return { height };
  });
  const tailStyle = useAnimatedStyle(() => ({
    borderTopColor: withAlpha(mixHex(RIBBON_REST, BRAND_BLUE, focus.value), 0.82 + 0.18 * focus.value),
  }));

  return (
    <Pressable
      key={routeKey}
      onPress={onPress}
      style={styles.tabBtn}
      hitSlop={{ bottom: 16, left: 8, right: 8 }}
      accessibilityRole="tab"
      accessibilityLabel={descriptorsTitle ?? routeName}
      accessibilityState={{ selected: focused }}
    >
      <View style={styles.ribbonWrap}>
        {/* Ribbon — emerges from behind the head-band and hangs DOWN over
            the page; the drop shadow is cast where it crosses the page edge. */}
        <Animated.View
          style={[
            styles.ribbon,
            ribbonStyle,
            color,
            {
              borderLeftColor: "rgba(0,0,0,0.18)",
              borderRightColor: "rgba(0,0,0,0.18)",
            },
          ]}
        >
          <IconSymbol
            size={focused ? 24 : 20}
            name={
              (focused
                ? ICONS[routeName]?.focused ?? "book.fill"
                : ICONS[routeName]?.unfocused ?? "book") as any
            }
            color="#F2F0E6"
            weight="semibold"
          />
        </Animated.View>
        {/* notched (swallow-tail) ribbon tail — a V cut into the ribbon end */}
        <Animated.View
          style={[
            styles.ribbonTail,
            tailStyle,
            { borderLeftColor: "transparent", borderRightColor: "transparent" },
          ]}
        />
      </View>
      {/* Label */}
      <Text
        style={[
          styles.label,
          {
            color: focused ? BRAND_BLUE : colors.muted,
          },
        ]}
        numberOfLines={1}
      >
        {descriptorsTitle ?? routeName}
      </Text>
    </Pressable>
  );
}

export function BookmarkTabBar(props: {
  state: { routes: { name: string; key: string }[]; index: number };
  navigation: { emit: (e: any) => any; navigate: (n: string) => void };
  descriptors: Record<string, { options: { title?: string } }>;
}) {
  const { state, navigation } = props;
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // The bar sits at the head of the book: respect the top inset.
  const topPadding = Math.max(insets.top, 12);

  const onSelect = (routeName: string, key: string, i: number) => {
    const event = navigation.emit({
      type: "tabPress",
      target: key,
      canPreventDefault: true,
    });
    if (!event.defaultPrevented) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      if (i === state.index) {
        // re-tap current tab: pop to top (system behavior)
      } else {
        const target = routeName === "index" ? "/(tabs)" : `/(tabs)/${routeName}`;
        router.push(target as any);
      }
    }
  };

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.pageBackground,
          paddingTop: topPadding,
          borderBottomColor: colors.pageBorder,
        },
      ]}
    >
      <View style={styles.bookHead}>
        {/* Ribbons — rendered FIRST so the head-band below covers their tops. */}
        <View style={[styles.row, { paddingTop: HEAD_BAND_H - TUCK }]}>
          {state.routes.map((route, i) => (
            <RibbonTab
              key={route.key}
              routeKey={route.key}
              routeName={route.name}
              focused={i === state.index}
              descriptorsTitle={props.descriptors[route.key]?.options?.title}
              onPress={() => onSelect(route.name, route.key, i)}
            />
          ))}
        </View>

        {/*
         * HEAD-BAND: the glossy dark ink strip along the very top edge of
         * the book. The ribbons tuck under it — this is what makes them read
         * as coming OUT of the book rather than pasted onto the page.
         */}
        <View pointerEvents="none" style={styles.headBand}>
          {/* gloss: a bright catch-light along the lower edge of the band */}
          <View style={styles.headBandGloss} />
          {/* page edge: hairline where the page meets the head of the book */}
          <View style={[styles.pageEdge, { borderBottomColor: colors.pageBorder }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Draped over the head of the book; the navigator renders this bar
  // above the tab screens (tabBarPosition: 'top').
  bar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bookHead: {
    // Ribbons absolutely tuck under the band; keep a little room below.
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
  },
  ribbonWrap: {
    alignItems: "center",
  },
  ribbon: {
    width: 54,
    borderWidth: StyleSheet.hairlineWidth,
    borderTopWidth: 0,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 7,
    // Drop shadow cast onto the page where the ribbon crosses its edge.
    shadowColor: "#241D15",
    shadowOpacity: 0.3,
    shadowRadius: 2.5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  // Swallow-tail: triangle NOTCH cut into the bottom of the ribbon.
  ribbonTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 27,
    borderRightWidth: 27,
    borderTopWidth: 9,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#000", // overridden by animated tailStyle
    // The notch is part of the ribbon — it carries the same page shadow.
    shadowColor: "#241D15",
    shadowOpacity: 0.18,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 2 },
  },
  label: {
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontSize: 12,
    fontWeight: "700",
    fontStyle: "italic",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 6,
  },
  // ---- Head-band (the book's head strip the ribbons emerge from) ----
  headBand: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: HEAD_BAND_H,
    // Glossy dark ink — near-black with a touch of sepia warmth.
    backgroundColor: "#241D15",
    zIndex: 2,
    // The band presses onto the page — a tight shadow just below it.
    shadowColor: "#241D15",
    shadowOpacity: 0.4,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  headBandGloss: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 1.5,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  pageEdge: {
    position: "absolute",
    left: 12,
    right: 12,
    top: HEAD_BAND_H,
    height: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
