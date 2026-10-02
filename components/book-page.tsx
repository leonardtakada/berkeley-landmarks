import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { RIBBON_COLUMN, useBookHead } from "@/components/bookmark-ribbons";
import { PaperSheet } from "@/components/paper-grain";
import { Bar, DotRule } from "@/components/print";
import { FONT, INK, MARGIN, PAPER, TYPE } from "@/constants/book";

/**
 * A section leaf of the book: paper stock, with content beginning just
 * under the head-band (the ribbons hang over its top margin).
 */
export function SectionPage({
  stock = "page",
  children,
}: {
  stock?: "cover" | "page";
  children: React.ReactNode;
}) {
  const { contentTop } = useBookHead();
  return (
    <View style={[styles.page, { backgroundColor: PAPER[stock], paddingTop: contentTop }]}>
      <PaperSheet stock={stock} />
      {children}
    </View>
  );
}

/**
 * Section opener: a vermilion bar and tracked kicker, the title in the
 * cut-paper display face, and a line of description.
 */
export function ChapterOpener({
  kicker,
  title,
  note,
  clearRibbons = true,
}: {
  kicker: string;
  title: string;
  note?: string;
  clearRibbons?: boolean;
}) {
  return (
    <View style={[styles.opener, clearRibbons && { paddingRight: RIBBON_COLUMN }]}>
      <Bar />
      <Text style={[TYPE.kicker, styles.kicker]}>{kicker}</Text>
      <Text style={styles.title} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>
        {title}
      </Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

/** Dotted leader between an entry and its number; fills the space left. */
export function Leader() {
  return <DotRule style={styles.leader} gap={5} size={1.5} />;
}

/** Folio at the foot of a section. */
export function Folio({ children }: { children: string }) {
  return (
    <View style={styles.folio}>
      <View style={styles.folioRule} />
      <Text style={TYPE.label}>{children}</Text>
      <View style={styles.folioRule} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  opener: {
    paddingLeft: MARGIN.outer,
    paddingTop: 26,
    paddingBottom: 18,
  },
  kicker: {
    marginTop: 12,
  },
  title: {
    ...TYPE.display,
    marginTop: 8,
  },
  note: {
    fontFamily: FONT.regular,
    fontSize: 15,
    lineHeight: 22,
    color: INK.sepia,
    marginTop: 10,
  },
  leader: {
    flex: 1,
    marginHorizontal: 8,
    marginBottom: 5,
  },
  folio: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 36,
    marginHorizontal: MARGIN.outer,
  },
  folioRule: {
    flex: 1,
    height: 1,
    backgroundColor: INK.rule,
  },
});
