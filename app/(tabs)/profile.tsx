import React from "react";
import { Text, View, StyleSheet, Platform } from "react-native";
import Constants from "expo-constants";
import { ScreenContainer } from "@/components/screen-container";
import { PageFlip } from "@/components/page-flip";
import { PaperGrain } from "@/components/paper-grain";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";

const SERIF_BOLD = Platform.select({
  ios: "SourceSerif4_600SemiBold",
  default: "serif",
});

/**
 * Appendix tab — book colophon.
 * Centered serif title, thin rule, edition line, version, BAHA credit.
 */
export default function AppendixScreen() {
  const colors = useColors();
  // The bookmark bar hangs at the top and already eats the top inset.
  const insets = useSafeAreaInsets();
  const version = Constants.expoConfig?.version ?? "1.0.0";

  return (
    <ScreenContainer edges={["left", "right"]}>
      <PageFlip direction={-1}>
      <PaperGrain />
      <View style={[styles.page, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.colophon}>
          <Text style={[styles.appName, { color: colors.foreground }]}>
            Berkeley Landmarks
          </Text>
          <View style={[styles.rule, { backgroundColor: colors.muted + "40" }]} />
          <Text style={[styles.edition, { color: colors.muted }]}>
            First Edition · 2026
          </Text>
          <Text style={[styles.version, { color: colors.muted }]}>
            Version {version}
          </Text>
          <Text style={[styles.credit, { color: colors.muted }]}>
            Historical images &amp; registry data courtesy of the{"\n"}
            Berkeley Architectural Heritage Association (BAHA)
          </Text>
        </View>
      </View>
      </PageFlip>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  colophon: {
    alignItems: "center",
    gap: 8,
  },
  appName: {
    fontFamily: SERIF_BOLD,
    fontSize: 26,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  rule: {
    width: 72,
    height: StyleSheet.hairlineWidth * 2,
  },
  edition: {
    fontSize: 12,
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  version: {
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  credit: {
    marginTop: 20,
    fontSize: 11,
    lineHeight: 17,
    letterSpacing: 0.5,
    fontStyle: "italic",
    textAlign: "center",
  },
});
