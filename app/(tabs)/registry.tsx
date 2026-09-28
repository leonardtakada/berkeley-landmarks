import React, { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path, SvgXml } from "react-native-svg";

import { ArchitectPortrait } from "@/components/architect-portrait";
import {
  ChapterOpener,
  Folio,
  InkIn,
  Leader,
  SectionPage,
  useFirstReveal,
} from "@/components/book-page";
import { REGISTRY_FRIEZE_SVG } from "@/components/print-art.generated";
import { Annotation, Rule } from "@/components/print";
import { ScrollClock, useScrollClockHandler } from "@/components/scroll-clock";
import { FONT, INK, MARGIN, PAPER, TYPE } from "@/constants/book";
import { landmarks, type Landmark, type LandmarkCategory } from "@/data/landmarks";
import { ARCHITECTS, architectOf, type ArchitectKey } from "@/lib/architects";

const CATEGORIES: (LandmarkCategory | null)[] = [
  null,
  "civic",
  "residential",
  "religious",
  "commercial",
  "educational",
  "cultural",
];

type Arrangement = "name" | "year" | "architect" | "district";
const ARRANGEMENTS: Arrangement[] = ["name", "year", "architect", "district"];

type Entry = Landmark & { seq: number };
type Section = { key: string; title: string; index: number; architect: ArchitectKey | null; data: Entry[] };

// The index, as a list the page's illustrations can follow the scroll of.
const AnimatedSectionList = Animated.createAnimatedComponent(SectionList) as unknown as React.ComponentType<
  React.ComponentProps<typeof SectionList<Entry, Section>>
>;

function yearOf(l: Landmark) {
  const y = parseInt(l.yearBuilt, 10);
  return Number.isFinite(y) ? y : null;
}

function sectionKey(l: Landmark, by: Arrangement): string {
  switch (by) {
    case "name": {
      const c = l.name.trim().charAt(0).toUpperCase();
      return /[A-Z]/.test(c) ? c : "#";
    }
    case "year": {
      const y = yearOf(l);
      return y ? `${Math.floor(y / 10) * 10}s` : "Undated";
    }
    case "architect": {
      // The notable architects gather every spelling of their name under one heading.
      const notable = architectOf(l);
      if (notable) return ARCHITECTS[notable].name;
      return l.architect?.replace(/^[^A-Za-z]+/, "").trim() || "Unknown";
    }
    case "district":
      return l.neighborhood?.trim() || "Elsewhere";
  }
}

function compare(a: Landmark, b: Landmark, by: Arrangement): number {
  if (by === "year") return (yearOf(a) ?? 9999) - (yearOf(b) ?? 9999) || a.name.localeCompare(b.name);
  const ka = sectionKey(a, by);
  const kb = sectionKey(b, by);
  // Unattributed work files at the back of the index.
  const tail = (k: string) => (/^(unknown|various|undated|#)$/i.test(k) ? 1 : 0);
  return tail(ka) - tail(kb) || ka.localeCompare(kb) || a.name.localeCompare(b.name);
}

/**
 * Part Two — the Registry: every designated landmark, set as the index of
 * the book. Letter (or decade, architect, district) headings; each entry
 * runs on dotted leaders to its registry number.
 */
export default function RegistryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reveal = useFirstReveal();
  const clock = useScrollClockHandler();
  const params = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<LandmarkCategory | null>(null);
  const [arrangement, setArrangement] = useState<Arrangement>("name");

  // Another page can open the registry at an architect's works.
  const [openedAt, setOpenedAt] = useState<string | undefined>(undefined);
  if (params.q !== openedAt) {
    setOpenedAt(params.q);
    if (params.q) {
      setQuery(params.q);
      setArrangement("name");
    }
  }

  const sections = useMemo<Section[]>(() => {
    const q = query.trim().toLowerCase();
    const found = landmarks
      .filter((l) => !category || l.category === category)
      .filter(
        (l) =>
          !q ||
          l.name.toLowerCase().includes(q) ||
          l.architect.toLowerCase().includes(q) ||
          l.address.toLowerCase().includes(q) ||
          l.neighborhood.toLowerCase().includes(q) ||
          l.style.toLowerCase().includes(q),
      )
      .sort((a, b) => compare(a, b, arrangement));
    const out: Section[] = [];
    found.forEach((l, i) => {
      const key = sectionKey(l, arrangement);
      let s = out[out.length - 1];
      if (!s || s.key !== key) {
        s = {
          key,
          title: key,
          index: out.length,
          architect: arrangement === "architect" ? architectOf(l) : null,
          data: [],
        };
        out.push(s);
      }
      s.data.push({ ...l, seq: i });
    });
    return out;
  }, [query, category, arrangement]);

  const total = sections.reduce((n, s) => n + s.data.length, 0);

  return (
    <SectionPage>
      <ScrollClock value={clock.offset}>
      <AnimatedSectionList
        sections={sections}
        onScroll={clock.onScroll}
        scrollEventThrottle={16}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        initialNumToRender={16}
        maxToRenderPerBatch={16}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 36 }}
        ListHeaderComponent={
          <View>
            <ChapterOpener
              kicker="Part Two"
              title="The Registry"
              note="Every designated landmark in the city, set out as an index."
              reveal={reveal}
            />
            <InkIn reveal={reveal} index={1} style={styles.frieze}>
              <View
                style={styles.friezeArt}
                accessible
                accessibilityRole="image"
                accessibilityLabel="A street of Berkeley buildings: a church, a Queen Anne house, the Campanile, City Hall, the library, a cottage and a bungalow"
              >
                <SvgXml xml={REGISTRY_FRIEZE_SVG} width="100%" height="100%" />
              </View>
            </InkIn>
            <InkIn reveal={reveal} index={2} style={styles.controls}>
              <View style={styles.findRow}>
                <Text style={styles.controlLabel}>Find</Text>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="A name, an architect, a style"
                  placeholderTextColor={INK.faded}
                  style={styles.findInput}
                  returnKeyType="search"
                  autoCorrect={false}
                  clearButtonMode="never"
                />
                {query ? (
                  <Pressable
                    onPress={() => setQuery("")}
                    style={styles.clearBox}
                    accessibilityRole="button"
                    accessibilityLabel="Clear the search"
                  >
                    <Text style={styles.clear}>×</Text>
                  </Pressable>
                ) : null}
              </View>
              <Rule color={INK.charcoal} weight={1} />

              <ChoiceRow
                label="Kind"
                options={CATEGORIES.map((c) => ({ key: c ?? "all", label: c ?? "all" }))}
                selected={category ?? "all"}
                onSelect={(k) => setCategory(k === "all" ? null : (k as LandmarkCategory))}
              />
              <ChoiceRow
                label="Order"
                options={ARRANGEMENTS.map((a) => ({ key: a, label: a }))}
                selected={arrangement}
                onSelect={(k) => setArrangement(k as Arrangement)}
              />
              <View style={styles.countRow}>
                <Text style={TYPE.label}>
                  {total} {total === 1 ? "entry" : "entries"}
                </Text>
                <Text style={TYPE.label}>
                  <Text style={styles.nrMark}>※ </Text>National Register
                </Text>
              </View>
            </InkIn>
          </View>
        }
        renderSectionHeader={({ section }) => <SectionHead section={section as Section} arrangement={arrangement} />}
        renderItem={({ item, index, section }) => {
          const row = (
            <IndexEntry
              landmark={item}
              arrangement={arrangement}
              last={index === section.data.length - 1}
              onPress={() => router.push(`/landmark/${item.id}`)}
            />
          );
          return item.seq < 12 ? (
            <InkIn reveal={reveal} index={3 + item.seq} step={0.04}>
              {row}
            </InkIn>
          ) : (
            row
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Annotation>Nothing in the registry answers to that.</Annotation>
          </View>
        }
        ListFooterComponent={total ? <Folio>The Registry · Berkeley</Folio> : null}
      />
      </ScrollClock>
    </SectionPage>
  );
}

/** A row of tracked choices; the chosen one is inked blue with a solid bar beneath. */
function ChoiceRow({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: { key: string; label: string }[];
  selected: string;
  onSelect: (key: string) => void;
}) {
  return (
    <View style={styles.choiceRow}>
      <Text style={styles.controlLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>
        {options.map((o) => {
          const on = o.key === selected;
          return (
            <Pressable
              key={o.key}
              onPress={() => onSelect(o.key)}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={styles.choice}
            >
              <Text style={[styles.choiceText, on && styles.choiceOn]}>{o.label}</Text>
              <View style={[styles.choiceBar, on && styles.choiceBarOn]} />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function SectionHead({ section, arrangement }: { section: Section; arrangement: Arrangement }) {
  if (arrangement === "name") {
    const n = section.data.length;
    return (
      <View style={styles.letterHead}>
        <LetterBlock letter={section.title} index={section.index} />
        <View style={styles.letterRule} />
        <Text style={TYPE.label}>
          {n} {n === 1 ? "entry" : "entries"}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.sectionHead}>
      {section.architect ? (
        <ArchitectPortrait architect={section.architect} width={76} style={styles.headPortrait} />
      ) : null}
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitle} numberOfLines={2}>
          {section.title}
        </Text>
        {section.architect ? <Text style={styles.headYears}>{ARCHITECTS[section.architect].years}</Text> : null}
      </View>
      <Rule color={INK.blue} weight={1.5} />
    </View>
  );
}

const BLOCK = 56;
const BLOCK_SHAPES = [
  // circle, square, arch, gable — the label shapes of the book
  "M0 28 C0 12.5 12.5 0 28 0 C43.5 0 56 12.5 56 28 C56 43.5 43.5 56 28 56 C12.5 56 0 43.5 0 28 Z",
  "M0 0 H56 V56 H0 Z",
  "M0 56 V28 C0 12.5 12.5 0 28 0 C43.5 0 56 12.5 56 28 V56 Z",
  "M0 56 V22 L28 0 L56 22 V56 Z",
];

/**
 * An index letter cut out of a block of flat ink, like the lettering on a
 * Showa travel label. Shapes run circle, square, arch, gable down the index;
 * the ink alternates blue and vermilion, shifting a step each round.
 */
function LetterBlock({ letter, index }: { letter: string; index: number }) {
  const shape = index % BLOCK_SHAPES.length;
  const ink = (index + Math.floor(index / BLOCK_SHAPES.length)) % 2 ? INK.vermilion : INK.blue;
  return (
    <View style={styles.block} accessibilityRole="header" accessibilityLabel={letter}>
      <Svg width={BLOCK} height={BLOCK} viewBox="0 0 56 56" style={StyleSheet.absoluteFill}>
        <Path d={BLOCK_SHAPES[shape]} fill={ink} />
      </Svg>
      <Text style={[styles.blockLetter, shape >= 2 && styles.blockLetterLow]}>{letter}</Text>
    </View>
  );
}

function IndexEntry({
  landmark,
  arrangement,
  last,
  onPress,
}: {
  landmark: Landmark;
  arrangement: Arrangement;
  last: boolean;
  onPress: () => void;
}) {
  const number = landmark.landmarkNumber?.replace(/^#/, "");
  // Say what the heading doesn't: no need to repeat the architect under an architect heading.
  const meta = [
    arrangement !== "architect" ? landmark.architect : null,
    arrangement !== "year" ? landmark.yearBuilt : null,
    arrangement !== "district" ? landmark.neighborhood : null,
  ]
    .filter((x) => x && !/^unknown$/i.test(x))
    .join("  ·  ");
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.entry, pressed && styles.entryPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${landmark.name}${number ? `, landmark number ${number}` : ""}`}
    >
      <View style={styles.entryLine}>
        <Text style={styles.entryName} numberOfLines={2}>
          {landmark.name}
          {landmark.nationalRegister ? <Text style={styles.nrMark}>{" ※"}</Text> : null}
        </Text>
        <Leader />
        <Text style={styles.entryNo}>{number ? `No. ${number}` : "—"}</Text>
      </View>
      {meta ? (
        <Text style={styles.entryMeta} numberOfLines={1}>
          {meta}
        </Text>
      ) : null}
      {!last ? <Rule style={styles.entryRule} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frieze: {
    paddingHorizontal: MARGIN.outer,
    marginBottom: 26,
  },
  friezeArt: {
    width: "100%",
    aspectRatio: 400 / 140,
  },
  controls: {
    paddingHorizontal: MARGIN.outer,
    paddingBottom: 6,
  },
  controlLabel: {
    ...TYPE.label,
    width: 64,
  },
  findRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 4,
  },
  findInput: {
    flex: 1,
    marginRight: 4,
    fontFamily: FONT.regular,
    fontSize: 17,
    color: INK.charcoal,
    paddingVertical: 10,
  },
  clearBox: {
    width: 40,
    height: 40,
    marginRight: -10,
    alignItems: "center",
    justifyContent: "center",
  },
  clear: {
    fontFamily: FONT.light,
    fontSize: 24,
    color: INK.sepia,
  },
  choiceRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
  },
  choices: {
    alignItems: "center",
    gap: 16,
    paddingRight: MARGIN.outer,
  },
  choice: {
    alignItems: "stretch",
  },
  choiceText: {
    fontFamily: FONT.medium,
    fontSize: 11.5,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: INK.faded,
    paddingBottom: 4,
  },
  choiceOn: {
    color: INK.blue,
  },
  choiceBar: {
    height: 2,
  },
  choiceBarOn: {
    backgroundColor: INK.blue,
  },
  countRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 22,
  },
  nrMark: {
    color: INK.vermilion,
  },
  letterHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: MARGIN.outer,
    paddingTop: 34,
    paddingBottom: 4,
  },
  letterRule: {
    flex: 1,
    height: 1.5,
    backgroundColor: INK.blue,
  },
  block: {
    width: BLOCK,
    height: BLOCK,
    alignItems: "center",
    justifyContent: "center",
  },
  blockLetter: {
    fontFamily: FONT.light,
    fontSize: 30,
    lineHeight: 34,
    color: PAPER.cover,
  },
  blockLetterLow: {
    marginTop: 8,
  },
  sectionHead: {
    paddingHorizontal: MARGIN.outer,
    paddingTop: 34,
    paddingBottom: 2,
  },
  headPortrait: {
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingBottom: 6,
  },
  sectionTitle: {
    flexShrink: 1,
    fontFamily: FONT.light,
    fontSize: 24,
    lineHeight: 28,
    color: INK.blue,
  },
  headYears: {
    ...TYPE.label,
    marginBottom: 4,
  },
  entry: {
    paddingHorizontal: MARGIN.outer,
    paddingTop: 14,
  },
  entryPressed: {
    opacity: 0.5,
  },
  entryLine: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  entryName: {
    flexShrink: 1,
    fontFamily: FONT.regular,
    fontSize: 18,
    lineHeight: 23,
    color: INK.charcoal,
  },
  entryNo: {
    fontFamily: FONT.medium,
    fontSize: 11.5,
    letterSpacing: 1.2,
    color: INK.blue,
    marginBottom: 2,
  },
  entryMeta: {
    fontFamily: FONT.regular,
    fontSize: 13,
    letterSpacing: 0.2,
    color: INK.sepia,
    marginTop: 3,
  },
  entryRule: {
    marginTop: 14,
  },
  empty: {
    paddingHorizontal: MARGIN.outer,
    paddingTop: 40,
  },
});
