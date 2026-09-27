import React from "react";
import { StyleSheet, Text, View, Platform } from "react-native";
import { InkRule } from "@/components/hand-inked";

const SERIF = Platform.select({
  ios: "Georgia",
  default: "serif",
});
const SERIF_BOLD = Platform.select({
  ios: "Georgia-Bold",
  default: "serif",
});

export interface ChapterHeaderProps {
  /** Small-caps kicker, e.g. "Chapter I" */
  kicker: string;
  /** Large serif chapter title */
  title: string;
  /** Optional descriptive subtitle */
  subtitle?: string;
  /** Divider + kicker accent color (hex). */
  accentColor: string;
  /** Text color for title/kicker. */
  foregroundColor: string;
  /** Muted text color for subtitle. */
  mutedColor: string;
  /** Optional folio number rendered right-aligned in small caps (e.g. "FOLIO II"). Reserved word "Plate" is only for photo plates. */
  romanNumeral?: string;
}

/**
 * Editorial chapter header in the Showa Modern book style:
 * small-caps kicker, large serif title, thin accent rule,
 * generous whitespace.
 */
export function ChapterHeader({
  kicker,
  title,
  subtitle,
  accentColor,
  foregroundColor,
  mutedColor,
  romanNumeral,
}: ChapterHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.kickerRow}>
        <Text style={[styles.kicker, { color: accentColor }]}>{kicker.toUpperCase()}</Text>
        {romanNumeral ? (
          <Text style={[styles.plate, { color: mutedColor }]}>
            FOLIO {romanNumeral.toUpperCase()}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.title, { color: foregroundColor }]}>{title}</Text>
      <View style={styles.ruleWrap}>
        <InkRule color={accentColor} width={72} diamond={5} />
      </View>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: mutedColor }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
  },
  kickerRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  kicker: {
    fontFamily: SERIF,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2.5,
    textTransform: "uppercase",
    transform: [{ rotate: "-0.45deg" }],
  },
  plate: {
    fontFamily: SERIF,
    fontSize: 10,
    letterSpacing: 1.5,
  },
  title: {
    fontFamily: SERIF_BOLD,
    fontSize: 38,
    lineHeight: 44,
    letterSpacing: -0.4,
  },
  ruleWrap: {
    marginTop: 12,
    marginBottom: 12,
    transform: [{ rotate: "0.3deg" }],
  },
  subtitle: {
    fontFamily: SERIF,
    fontSize: 15,
    lineHeight: 22,
    fontStyle: "italic",
  },
});
