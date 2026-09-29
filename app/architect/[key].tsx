import { useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { openBrowserAsync, WebBrowserPresentationStyle } from "expo-web-browser";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ArchitectPortrait } from "@/components/architect-portrait";
import { EntryPage, RunningHead } from "@/components/entry-page";
import { Annotation, Arrow, Bar, Rule } from "@/components/print";
import { FONT, INK, MARGIN, PAGE_TURN_MS, TYPE } from "@/constants/book";
import { BIOGRAPHIES, citations } from "@/lib/architect-bios";
import { ARCHITECTS, worksBy, type ArchitectKey } from "@/lib/architects";

/**
 * An architect's page in the Appendix: their portrait held at the head of the
 * page, going through its gestures, with their name beside it; below, the
 * biography — noted to its sources — and the entries of theirs in the guide.
 */
export default function ArchitectScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const architect = key && key in ARCHITECTS ? ARCHITECTS[key as ArchitectKey] : null;

  if (!architect) {
    return (
      <EntryPage>
        <RunningHead back="The Architects" />
        <View style={styles.missing}>
          <Annotation>This architect isn&apos;t in the guide.</Annotation>
        </View>
      </EntryPage>
    );
  }

  const bio = BIOGRAPHIES[architect.key];
  const works = [...worksBy(architect.key)].sort((a, b) => year(a.yearBuilt) - year(b.yearBuilt));

  return (
    <EntryPage>
      <RunningHead back="The Architects" folio="Biography" />

      {/* The sitter, held in frame while the text scrolls beneath */}
      <View style={styles.sitter}>
        <ArchitectPortrait architect={architect.key} width={112} delay={PAGE_TURN_MS * 0.6} loop={focused} />
        <View style={styles.sitterText}>
          <Bar />
          <Text style={[TYPE.kicker, styles.kicker]}>{architect.years}</Text>
          <Text style={styles.name}>{architect.name}</Text>
        </View>
      </View>
      <Rule color={INK.blue} weight={1.5} style={styles.headRule} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 48 }}
      >
        {/* The life */}
        <View style={styles.block}>
          {bio.text.map((para, i) => (
            <Text key={i} style={[styles.body, i > 0 && styles.para]}>
              {citations(para).map((run, j) =>
                run.notes ? (
                  <Text key={j} style={styles.note}>
                    {run.notes.map(superscript).join("\u00a0")}
                  </Text>
                ) : i === 0 && j === 0 ? (
                  <LeadIn key={j} text={run.text} />
                ) : (
                  run.text
                ),
              )}
            </Text>
          ))}
        </View>

        {/* Notes */}
        <View style={styles.block}>
          <Text style={[TYPE.label, styles.subhead]}>Sources</Text>
          <Rule />
          {bio.sources.map((s, i) => (
            <Pressable
              key={i}
              disabled={!s.url}
              onPress={() =>
                s.url && openBrowserAsync(s.url, { presentationStyle: WebBrowserPresentationStyle.AUTOMATIC })
              }
              style={({ pressed }) => [styles.source, pressed && { opacity: 0.5 }]}
              accessibilityRole={s.url ? "link" : "text"}
            >
              <Text style={styles.sourceNo}>{i + 1}</Text>
              <Text style={styles.sourceText}>
                {s.author ? `${s.author.replace(/\.$/, "")}. ` : ""}
                <Text style={s.url ? styles.sourceTitleLink : styles.sourceTitle}>{s.title}</Text>
                {s.detail ? `. ${s.detail}` : ""}.
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Their entries */}
        <View style={styles.block}>
          <View style={styles.worksHead}>
            <Text style={TYPE.label}>In the guide</Text>
            <Text style={styles.worksCount}>
              {works.length} {works.length === 1 ? "entry" : "entries"}
            </Text>
          </View>
          <Rule color={INK.charcoal} weight={1} />
          {works.map((l, i) => (
            <Pressable
              key={l.id}
              onPress={() => router.push(`/landmark/${l.id}`)}
              style={({ pressed }) => [styles.work, pressed && { opacity: 0.5 }]}
              accessibilityRole="button"
            >
              <View style={styles.workRow}>
                <View style={styles.workText}>
                  <Text style={styles.workName}>{l.name}</Text>
                  <Text style={styles.workAddr}>
                    {l.address}
                    {/^\d{4}/.test(l.yearBuilt) ? ` · ${l.yearBuilt}` : ""}
                  </Text>
                </View>
                <Arrow length={16} />
              </View>
              {i < works.length - 1 ? <Rule style={styles.workRule} /> : null}
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </EntryPage>
  );
}

/** The first words of the life in tracked blue capitals, as the walks open. */
function LeadIn({ text }: { text: string }) {
  const words = text.split(" ");
  return (
    <>
      <Text style={styles.leadIn}>{words.slice(0, 3).join(" ").toUpperCase()}</Text> {words.slice(3).join(" ")}
    </>
  );
}

const SUPERSCRIPT = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const superscript = (n: number) => String(n).replace(/\d/g, (d) => SUPERSCRIPT[Number(d)]);

/** "c. 1905" → 1905; undated entries last. */
const year = (s: string) => Number(s.match(/\d{4}/)?.[0] ?? 9999);

const styles = StyleSheet.create({
  missing: {
    padding: MARGIN.outer,
    paddingTop: 60,
  },
  sitter: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 18,
    paddingHorizontal: MARGIN.outer,
    paddingTop: 14,
  },
  sitterText: {
    flex: 1,
    paddingBottom: 4,
  },
  kicker: {
    marginTop: 10,
  },
  name: {
    fontFamily: FONT.light,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.3,
    color: INK.charcoal,
    marginTop: 6,
  },
  headRule: {
    marginHorizontal: MARGIN.outer,
    marginTop: 16,
  },
  block: {
    paddingHorizontal: MARGIN.outer,
    marginTop: 24,
  },
  body: {
    fontFamily: FONT.regular,
    fontSize: 16,
    lineHeight: 26,
    color: INK.charcoal,
  },
  para: {
    marginTop: 14,
  },
  leadIn: {
    fontFamily: FONT.medium,
    fontSize: 13,
    letterSpacing: 1.6,
    color: INK.blue,
  },
  note: {
    fontFamily: FONT.medium,
    color: INK.blue,
  },
  subhead: {
    marginTop: 8,
    marginBottom: 10,
  },
  source: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 10,
  },
  sourceNo: {
    width: 18,
    fontFamily: FONT.medium,
    fontSize: 12,
    lineHeight: 19,
    color: INK.blue,
    textAlign: "right",
  },
  sourceText: {
    flex: 1,
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 19,
    color: INK.sepia,
  },
  sourceTitle: {
    fontFamily: FONT.italic,
  },
  sourceTitleLink: {
    fontFamily: FONT.italic,
    color: INK.blue,
  },
  worksHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: 20,
    marginBottom: 10,
  },
  worksCount: {
    fontFamily: FONT.medium,
    fontSize: 12,
    letterSpacing: 1.6,
    color: INK.blue,
    textTransform: "uppercase",
  },
  work: {
    paddingTop: 14,
  },
  workRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  workText: {
    flex: 1,
  },
  workName: {
    fontFamily: FONT.regular,
    fontSize: 17,
    lineHeight: 22,
    color: INK.charcoal,
  },
  workAddr: {
    fontFamily: FONT.regular,
    fontSize: 13,
    color: INK.sepia,
    marginTop: 2,
  },
  workRule: {
    marginTop: 14,
  },
});
