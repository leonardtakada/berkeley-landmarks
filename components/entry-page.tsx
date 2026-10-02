import React, { useEffect } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CornerFold } from "@/components/copy-marks";
import { PaperGrain } from "@/components/paper-grain";
import { Arrow } from "@/components/print";
import { INK, MARGIN, PAPER, TYPE } from "@/constants/book";

/**
 * An entry leaf — a landmark or a tour — laid over the book and hinged at
 * its right edge: flat paper, with no shading as it turns, so the page is as
 * sharp mid-turn as when it lands.
 */
export function EntryPage({ children }: { children: React.ReactNode }) {
  // A tiny tick as the leaf turns over, like the section pages' ribbons.
  useEffect(() => {
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
  }, []);
  return (
    <View style={styles.page}>
      <PaperGrain />
      {children}
    </View>
  );
}

/**
 * Running head of an entry: the way back on the left, the folio on the
 * right — and, on a page the reader can keep, its corner to turn down.
 */
export function RunningHead({
  back,
  folio,
  corner,
}: {
  back: string;
  folio?: string;
  corner?: { on: boolean; onToggle: () => void };
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.head, { paddingTop: insets.top + 8 }]}>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        hitSlop={14}
        style={({ pressed }) => [styles.back, pressed && { opacity: 0.5 }]}
        accessibilityRole="button"
        accessibilityLabel={`Back to ${back}`}
      >
        <Arrow direction="left" length={18} />
        <Text style={[TYPE.kicker, styles.backText]}>{back}</Text>
      </Pressable>
      <View style={styles.right}>
        {folio ? <Text style={TYPE.label}>{folio}</Text> : null}
        {corner ? <CornerFold on={corner.on} onToggle={corner.onToggle} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: PAPER.page,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: MARGIN.outer,
    paddingBottom: 8,
  },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
  },
  backText: {
    color: INK.blue,
  },
});
