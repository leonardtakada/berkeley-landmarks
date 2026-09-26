import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

/**
 * Bookmark-ribbon tab bar ("book chrome" phase 1).
 * Each tab is a ribbon protruding from the page edge at staggered heights.
 * Active ribbon extends and shows the label; inactive ribbons sit lower.
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
  index: { focused: "map.fill", unfocused: "map" },
  tours: { focused: "figure.walk", unfocused: "figure.walk" },
  landmarks: { focused: "building.columns.fill", unfocused: "building.columns" },
};

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

  // Ribbon palette: indigo / terracotta / sage (Showa Modern)
  const ribbonPalette = ["#2B3A67", "#E15A3E", "#6B8E6D"];
  const stagger = [22, 14, 18];

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
      <View style={[styles.trim, styles.trim2, { borderColor: colors.border }]} />

      <View style={styles.row}>
        {state.routes.map((route, i) => {
          const focused = i === state.index;
          const ribbonColor = ribbonPalette[i % ribbonPalette.length];
          const rest = stagger[i % stagger.length];
          const height = focused ? rest + 12 : rest;
          return (
            <Pressable
              key={route.key}
              onPress={() => onSelect(route.name, route.key, i)}
              style={styles.tabBtn}
              hitSlop={{ top: 16, left: 8, right: 8 }}
              accessibilityRole="tab"
              accessibilityLabel={props.descriptors[route.key]?.options?.title ?? route.name}
              accessibilityState={{ selected: focused }}
            >
              {/* Ribbon */}
              <View style={styles.ribbonWrap}>
                <View
                  style={[
                    styles.ribbon,
                    {
                      height,
                      backgroundColor: focused ? ribbonColor : `${ribbonColor}B3`,
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
                        ? ICONS[route.name]?.focused ?? "book.fill"
                        : ICONS[route.name]?.unfocused ?? "book") as any
                    }
                    color="#F2F0E6"
                    weight="semibold"
                  />
                </View>
                {/* notched ribbon tail */}
                <View
                  style={[
                    styles.ribbonTail,
                    {
                      borderTopColor: focused ? ribbonColor : `${ribbonColor}B3`,
                      borderLeftColor: focused ? ribbonColor : `${ribbonColor}B3`,
                      borderRightColor: focused ? ribbonColor : `${ribbonColor}B3`,
                    },
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
                {props.descriptors[route.key]?.options?.title ?? route.name}
              </Text>
            </Pressable>
          );
        })}
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
    top: 3,
    left: 20,
    right: 20,
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
});
