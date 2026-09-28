import React from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useCardAnimation } from "expo-router/js-stack";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PaperGrain } from "@/components/paper-grain";
import { Arrow } from "@/components/print";
import { INK, MARGIN, PAPER, TYPE } from "@/constants/book";

/**
 * An entry leaf — a landmark or a tour — laid over the book and hinged at
 * its right edge. Carries the paper and the shading the leaf picks up while
 * it is lifted mid-turn.
 */
export function EntryPage({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.page}>
      <PaperGrain />
      {children}
      <LiftShade />
    </View>
  );
}

/** Darkens the leaf toward its free (left) edge while it is off the page. */
function LiftShade() {
  const { current } = useCardAnimation();
  const opacity = current.progress.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [0.6, 0.18, 0],
    extrapolate: "clamp",
  });
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
      <LinearGradient
        colors={["rgba(40,30,18,0.5)", "rgba(40,30,18,0.18)", "rgba(40,30,18,0.03)"]}
        locations={[0, 0.45, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/** Running head of an entry: the way back on the left, the folio on the right. */
export function RunningHead({ back, folio }: { back: string; folio?: string }) {
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
      {folio ? <Text style={TYPE.label}>{folio}</Text> : null}
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
  backText: {
    color: INK.blue,
  },
});
