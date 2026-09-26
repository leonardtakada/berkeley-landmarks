import React, { useEffect } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
} from "react-native-reanimated";
import { useRouter, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

/**
 * Bookmark-ribbon tab bar ("book chrome" phase 1).
 * Each tab is a ribbon protruding from the page edge at staggered heights.
 * Active ribbon extends and shows the label; inactive ribbons sit lower.
 * Focus changes animate (height/color ~180ms) and the focused tab gets a
 * subtle "page corner lift" fold shadow at the top edge above the ribbon.
 */

type Bookmark = {
  name: string; // route name in (tabs)
  href: string;
  label: string;
  icon: { focused: string; unfocused: string };
  /** ribbon color; falls back to theme accent */
  color: string;
  /** staggered resting height above the bar */
  restHeight: number;
};

const ICONS: Record<string, { focused: string; unfocused: string }> = {
  // index = Landmarks list (home)
  index: { focused: "building.columns.fill", unfocused: "building.columns" },
  tours: { focused: "figure.walk", unfocused: "figure.walk" },
  profile: { focused: "person.crop.circle.fill", unfocused: "person.crop.circle" },
};

// Ribbon color per tab route (Showa Modern): Landmarks=terracotta, Tours=indigo, Profile=sage
const RIBBON_COLORS: Record<string, string> = {
  index: "#E15A3E",
  tours: "#2B3A67",
  profile: "#6B8E6D",
};
// Staggered resting heights — each ribbon sits at a slightly different height
const STAGGER: Record<string, number> = {
  index: 22,
  tours: 15,
  profile: 18,
};

// hexToRGBA helper (colors are always 6-digit hex here)
function withAlpha(hex: string, alpha: number): string {
  "worklet";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** One animated bookmark ribbon + label. */
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
    // Subtle ~180ms spring on extend; timing on settle
    focus.value = focused
      ? withSpring(1, { damping: 20, stiffness: 260, mass: 0.7 })
      : withTiming(0, { duration: 180 });
  }, [focused, focus]);

  const ribbonPalette = ["#2B3A67", "#E15A3E", "#6B8E6D"];
  const stagger = [22, 14, 18];
  const ribbonColor = RIBBON_COLORS[routeName] ?? ribbonPalette[0];
  const rest = STAGGER[routeName] ?? stagger[0];

  const ribbonStyle = useAnimatedStyle(() => {
    const height = rest + 12 * focus.value;
    const alpha = 0.7 + 0.3 * focus.value;
    return {
      height,
      backgroundColor: withAlpha(ribbonColor, alpha),
    };
  });

  const tailStyle = useAnimatedStyle(() => {
    const alpha = 0.7 + 0.3 * focus.value;
    return {
      borderTopColor: withAlpha(ribbonColor, alpha),
    };
  });

  // Page corner lift: small triangular fold shadow above the ribbon,
  // fading in/out with focus (~180ms, low opacity — subtle).
  const cornerStyle = useAnimatedStyle(() => {
    return {
      opacity: 0.35 * focus.value,
      transform: [{ translateY: -4 - 4 * focus.value }],
    };
  });

  return (
    <Pressable
      key={routeKey}
      onPress={onPress}
      style={styles.tabBtn}
      hitSlop={{ top: 16, left: 8, right: 8 }}
      accessibilityRole="tab"
      accessibilityLabel={descriptorsTitle ?? routeName}
      accessibilityState={{ selected: focused }}
    >
      <View style={styles.ribbonWrap}>
        {/* page corner lift fold (focused only, animated opacity) */}
        <Animated.View
          pointerEvents="none"
          style={[styles.cornerLift, cornerStyle]}
        >
          <View style={styles.cornerFold} />
        </Animated.View>
        {/* Ribbon */}
        <Animated.View
          style={[
            styles.ribbon,
            ribbonStyle,
            {
              borderLeftColor: ribbonColor,
              borderRightColor: ribbonColor,
              borderTopColor: ribbonColor,
            },
          ]}
        >
          <IconSymbol
            size={focused ? 17 : 15}
            name={
              (focused
                ? ICONS[routeName]?.focused ?? "book.fill"
                : ICONS[routeName]?.unfocused ?? "book") as any
            }
            color="#F2F0E6"
            weight="semibold"
          />
        </Animated.View>
        {/* notched ribbon tail */}
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
            color: focused ? ribbonColor : colors.muted,
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
  const pathname = usePathname();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 10);

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
          backgroundColor: colors.background,
          paddingBottom: bottomPadding,
          borderColor: colors.border,
        },
      ]}
    >
      {/* thin double rule like a book page trim */}
      <View style={[styles.trim, { borderColor: colors.border }]} />
      <View style={[styles.trim2, { borderColor: colors.border }]} />

      <View style={styles.row}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  trim: {
    position: "absolute",
    top: 0,
    left: 12,
    right: 12,
    height: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  trim2: {
    position: "absolute",
    top: 3,
    left: 20,
    right: 20,
    height: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 8,
    paddingTop: 0,
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
  },
  ribbonWrap: {
    alignItems: "center",
    marginTop: -20, // protrude above the bar edge
  },
  ribbon: {
    width: 36,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 4,
  },
  ribbonTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 18,
    borderRightWidth: 18,
    borderTopWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#000",
  },
  label: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: 5,
  },
  // Page corner lift: rotated square with a light top/left edge and soft
  // shadow — reads as the page lifting where the ribbon is inserted.
  cornerLift: {
    position: "absolute",
    top: -14,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  cornerFold: {
    width: 18,
    height: 18,
    transform: [{ rotate: "45deg" }],
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderTopColor: "rgba(255,255,255,0.7)",
    borderLeftColor: "rgba(255,255,255,0.7)",
    backgroundColor: "rgba(0,0,0,0.06)",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 2,
    shadowOffset: { width: -1, height: -1 },
    elevation: 2,
  },
});
