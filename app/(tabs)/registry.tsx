import React, { useCallback, useMemo, useState } from "react";
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
import { CheckStamp } from "@/components/copy-marks";
import { REGISTRY_FRIEZE_SVG } from "@/components/print-art.generated";
import { Annotation, Rule } from "@/components/print";
import { ScrollClock, useScrollClockHandler } from "@/components/scroll-clock";
import { FONT, INK, MARGIN, PAPER, TYPE } from "@/constants/book";
import { landmarks, type Landmark, type LandmarkCategory } from "@/data/landmarks";
import { ARCHITECTS, architectOf, type ArchitectKey } from "@/lib/architects";
import { useReaderCopy } from "@/lib/reader-copy-context";
import {
  WALKING_M,
  answers,
  metresBetween,
  parseQuery,
  stylesOf,
  vocabulary,
  walkMinutes,
  without,
  type Facet,
} from "@/lib/registry-index";

const VOCABULARY = vocabulary(landmarks);

const CATEGORIES: (LandmarkCategory | null)[] = [
  null,
  "civic",
  "residential",
  "religious",
  "commercial",
  "educational",
  "cultural",
];

type Arrangement = "name" | "year" | "architect" | "style" | "district";
const ARRANGEMENTS: Arrangement[] = ["name", "year", "architect", "style", "district"];

type Entry = Landmark & { seq: number; metres?: number };
type Section = {
  key: string;
  title: string;
  index: number;
  architect: ArchitectKey | null;
  /** The words that narrow the index to this heading, when a heading can. */
  filter: string | null;
  data: Entry[];
};

/** Where the reader is, for "near me". */
type Where =
  | { state: "idle" | "denied" | "unknown" }
  | { state: "here"; latitude: number; longitude: number };

const FACET_NAMES: Record<Facet, string> = { architect: "Architect", style: "Style", district: "District", era: "Built" };

// The index, as a list the page's illustrations can follow the scroll of.
const AnimatedSectionList = Animated.createAnimatedComponent(SectionList) as unknown as React.ComponentType<
  React.ComponentProps<typeof SectionList<Entry, Section>>
>;

function yearOf(l: Landmark) {
  const y = parseInt(l.yearBuilt, 10);
  return Number.isFinite(y) ? y : null;
}

const titleCase = (s: string) => s.replace(/\b([a-z])/g, (c) => c.toUpperCase());

/** The words that narrow the index to a heading's entries; none for a letter, or a heading of the unrecorded. */
function headingFilter(key: string, by: Arrangement, architect: ArchitectKey | null): string | null {
  if (by === "name" || /^(unknown|undated|elsewhere|style unrecorded|#)$/i.test(key)) return null;
  if (architect) return architect === "thomas" ? "Hudson Thomas" : ARCHITECTS[architect].surname;
  return key;
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
    case "style": {
      const first = stylesOf(l)[0];
      return first ? titleCase(first) : "Style unrecorded";
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
  const tail = (k: string) => (/^(unknown|various|undated|style unrecorded|#)$/i.test(k) ? 1 : 0);
  return tail(ka) - tail(kb) || ka.localeCompare(kb) || a.name.localeCompare(b.name);
}

/** Bands of walking time, for what's near the reader. */
function nearBand(metres: number): string {
  const min = walkMinutes(metres);
  return min <= 5 ? "Within five minutes' walk" : min <= 10 ? "Five to ten minutes' walk" : "Ten to fifteen minutes' walk";
}

/**
 * Part Two — the Registry: every designated landmark, set as the index of
 * the book. Letter (or decade, architect, style, district) headings; each
 * entry runs on dotted leaders to its registry number. The Find line reads
 * a query as the index's terms — "every Maybeck within walking distance",
 * "Queen Anne in Elmwood" — and a heading narrows the index to itself.
 */
export default function RegistryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reveal = useFirstReveal();
  const clock = useScrollClockHandler();
  const params = useLocalSearchParams<{ q?: string }>();
  const { copy } = useReaderCopy();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<LandmarkCategory | null>(null);
  const [arrangement, setArrangement] = useState<Arrangement>("name");
  const [nearOn, setNearOn] = useState(false);
  const [where, setWhere] = useState<Where>({ state: "idle" });

  const parsed = useMemo(() => parseQuery(query, VOCABULARY), [query]);
  const near = nearOn || !!parsed.near;

  // Where the reader is standing, asked for only when they ask what's near.
  const locate = useCallback(async () => {
    setWhere({ state: "idle" });
    try {
      const Location = await import("expo-location");
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setWhere({ state: "denied" });
        return;
      }
      const pos =
        (await Location.getLastKnownPositionAsync({ maxAge: 60_000, requiredAccuracy: 200 })) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      setWhere({ state: "here", latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    } catch {
      setWhere({ state: "unknown" });
    }
  }, []);
  const find = (text: string) => {
    setQuery(text);
    if (!near && parseQuery(text, VOCABULARY).near) void locate();
  };

  // Another page can open the registry at an architect's works.
  const [openedAt, setOpenedAt] = useState<string | undefined>(undefined);
  if (params.q !== openedAt) {
    setOpenedAt(params.q);
    if (params.q) {
      setQuery(params.q);
      setArrangement("name");
    }
  }

  const here = where.state === "here" ? where : null;
  const { sections, readAsWords } = useMemo(() => {
    const kind = landmarks.filter((l) => !category || l.category === category);
    let found = kind.filter((l) => answers(l, parsed));
    // Nothing answers the terms ("Howard Automobile" isn't J. G. Howard's):
    // try the query as plain words instead.
    let asWords = false;
    if (!found.length && parsed.terms.length) {
      const words = query
        .replace(parsed.near ? query.slice(parsed.near.start, parsed.near.end) : "", " ")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 1);
      found = kind.filter((l) => {
        const hay = [l.name, l.address, l.architect, l.style, l.neighborhood, l.yearBuilt].join(" ").toLowerCase();
        return words.every((w) => hay.includes(w));
      });
      asWords = found.length > 0;
    }

    let entries: Entry[];
    if (near) {
      // Near the reader: within a quarter hour's walk, the nearest first.
      entries = here
        ? found
            .map((l) => ({ ...l, seq: 0, metres: metresBetween(here, l) }))
            .filter((l) => l.metres <= WALKING_M)
            .sort((a, b) => a.metres - b.metres)
        : [];
    } else {
      entries = [...found].sort((a, b) => compare(a, b, arrangement)).map((l) => ({ ...l, seq: 0 }));
    }

    const out: Section[] = [];
    entries.forEach((l, i) => {
      const key = near ? nearBand(l.metres ?? 0) : sectionKey(l, arrangement);
      let s = out[out.length - 1];
      if (!s || s.key !== key) {
        const architect = !near && arrangement === "architect" ? architectOf(l) : null;
        s = {
          key,
          title: key,
          index: out.length,
          architect,
          filter: near ? null : headingFilter(key, arrangement, architect),
          data: [],
        };
        out.push(s);
      }
      s.data.push({ ...l, seq: i });
    });
    return { sections: out, readAsWords: asWords };
  }, [query, parsed, category, arrangement, near, here]);

  const total = sections.reduce((n, s) => n + s.data.length, 0);
  const narrowTo = (words: string) => setQuery((q) => `${q} ${words}`.trim());
  const setNear = (on: boolean) => {
    setNearOn(on);
    if (!on && parsed.near) setQuery((q) => without(q, parsed.near!));
    // Asked again, look again: the reader may have walked on.
    if (on) void locate();
  };

  return (
    <SectionPage>
      <ScrollClock value={clock.offset}>
      <AnimatedSectionList
        sections={sections}
        onScroll={clock.onScroll}
        scrollEventThrottle={16}
        keyExtractor={(item) => item.id}
        extraData={copy}
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
                  onChangeText={find}
                  placeholder="“Queen Anne in Elmwood”"
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

              {/* The query as the index read it: each term a slip that can be taken out. */}
              {parsed.terms.length || parsed.near ? (
                <View style={styles.terms}>
                  {parsed.terms.map((t) => (
                    <TermSlip
                      key={`${t.start}-${t.facet}`}
                      facet={FACET_NAMES[t.facet]}
                      label={t.label}
                      struck={readAsWords}
                      onRemove={() => setQuery((q) => without(q, t))}
                    />
                  ))}
                  {parsed.near ? (
                    <TermSlip facet="Near" label="Where you are" onRemove={() => setNear(false)} />
                  ) : null}
                </View>
              ) : null}

              <ChoiceRow
                label="Where"
                options={[
                  { key: "anywhere", label: "anywhere" },
                  { key: "near", label: "near me" },
                ]}
                selected={near ? "near" : "anywhere"}
                onSelect={(k) => setNear(k === "near")}
              />
              <ChoiceRow
                label="Kind"
                options={CATEGORIES.map((c) => ({ key: c ?? "all", label: c ?? "all" }))}
                selected={category ?? "all"}
                onSelect={(k) => setCategory(k === "all" ? null : (k as LandmarkCategory))}
              />
              <ChoiceRow
                label="Order"
                options={(near ? ["distance"] : ARRANGEMENTS).map((a) => ({ key: a, label: a }))}
                selected={near ? "distance" : arrangement}
                onSelect={(k) => k !== "distance" && setArrangement(k as Arrangement)}
              />
              {near && where.state !== "here" ? (
                <Annotation style={styles.whereNote}>
                  {where.state === "idle"
                    ? "Finding where you are…"
                    : where.state === "denied"
                      ? "The guide can't see where you are. Allow it location in Settings to find what's near."
                      : "Where you are can't be found just now."}
                </Annotation>
              ) : null}
              {readAsWords ? (
                <Annotation style={styles.whereNote}>Nothing in the index answers those terms; here are the entries with those words.</Annotation>
              ) : null}
              <View style={styles.countRow}>
                <Text style={TYPE.label}>
                  {total} {total === 1 ? "entry" : "entries"}
                  {near && here ? " within a quarter hour's walk" : ""}
                </Text>
                <Text style={TYPE.label}>
                  <Text style={styles.nrMark}>※ </Text>National Register
                </Text>
              </View>
            </InkIn>
          </View>
        }
        renderSectionHeader={({ section }) => {
          const s = section as Section;
          return (
            <SectionHead
              section={s}
              lettered={!near && arrangement === "name"}
              onNarrow={s.filter && sections.length > 1 ? () => narrowTo(s.filter!) : undefined}
            />
          );
        }}
        renderItem={({ item, index, section }) => {
          const row = (
            <IndexEntry
              landmark={item}
              arrangement={near ? "name" : arrangement}
              metres={item.metres}
              visited={!!copy.visited[item.id]}
              corner={!!copy.corners[item.id]}
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
          near && where.state !== "here" ? null : (
            <View style={styles.empty}>
              <Annotation>
                {near
                  ? "Nothing in the registry is within a quarter hour's walk of where you are."
                  : "Nothing in the registry answers to that."}
              </Annotation>
            </View>
          )
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

/** A term the index read from the query, as a slip with a cross to take it out. */
function TermSlip({
  facet,
  label,
  struck = false,
  onRemove,
}: {
  facet: string;
  label: string;
  /** Read as plain words after all, since nothing answered the terms. */
  struck?: boolean;
  onRemove: () => void;
}) {
  return (
    <Pressable
      onPress={onRemove}
      hitSlop={6}
      style={({ pressed }) => [styles.slip, pressed && { opacity: 0.5 }]}
      accessibilityRole="button"
      accessibilityLabel={`${facet}: ${label}`}
      accessibilityHint="Takes it out of the search"
    >
      <Text style={styles.slipFacet}>{facet}</Text>
      <Text style={[styles.slipLabel, struck && styles.slipStruck]}>{label}</Text>
      <Text style={styles.slipX}>×</Text>
    </Pressable>
  );
}

function SectionHead({
  section,
  lettered,
  onNarrow,
}: {
  section: Section;
  lettered: boolean;
  /** Narrows the index to this heading. */
  onNarrow?: () => void;
}) {
  if (lettered) {
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
  const n = section.data.length;
  return (
    <Pressable
      onPress={onNarrow}
      disabled={!onNarrow}
      style={({ pressed }) => [styles.sectionHead, pressed && { opacity: 0.6 }]}
      accessibilityRole={onNarrow ? "button" : "header"}
      accessibilityLabel={`${section.title}, ${n} ${n === 1 ? "entry" : "entries"}`}
      accessibilityHint={onNarrow ? "Shows only these" : undefined}
    >
      {section.architect ? (
        <ArchitectPortrait architect={section.architect} width={76} style={styles.headPortrait} />
      ) : null}
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitle} numberOfLines={2}>
          {section.title}
        </Text>
        <Text style={styles.headYears}>
          {section.architect ? `${ARCHITECTS[section.architect].years}  ·  ` : ""}
          {n}
        </Text>
      </View>
      <Rule color={INK.blue} weight={1.5} />
    </Pressable>
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
  metres,
  visited,
  corner,
  last,
  onPress,
}: {
  landmark: Landmark;
  arrangement: Arrangement;
  /** How far the reader is from it, when the index is of what's near. */
  metres?: number;
  /** The reader's marks: been there; turned its page down. */
  visited: boolean;
  corner: boolean;
  last: boolean;
  onPress: () => void;
}) {
  const number = landmark.landmarkNumber?.replace(/^#/, "");
  // Say what the heading doesn't: no need to repeat the architect under an architect heading.
  const meta = [
    metres != null ? `${walkMinutes(metres)} min walk` : null,
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
      accessibilityLabel={[
        landmark.name,
        number ? `landmark number ${number}` : null,
        metres != null ? `${walkMinutes(metres)} minutes' walk` : null,
        visited ? "visited" : null,
        corner ? "page turned down" : null,
      ]
        .filter(Boolean)
        .join(", ")}
    >
      <View style={styles.entryLine}>
        <Text style={styles.entryName} numberOfLines={2}>
          {landmark.name}
          {landmark.nationalRegister ? <Text style={styles.nrMark}>{" ※"}</Text> : null}
        </Text>
        {visited ? <CheckStamp size={13} style={styles.mark} /> : null}
        {corner ? <View style={[styles.cornerMark, !visited && styles.mark]} /> : null}
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
    flexWrap: "wrap",
    justifyContent: "space-between",
    columnGap: 16,
    rowGap: 6,
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
  terms: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  slip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingLeft: 9,
    paddingRight: 7,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: INK.blue,
    backgroundColor: PAPER.slip,
  },
  slipFacet: {
    fontFamily: FONT.medium,
    fontSize: 9,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: INK.sepia,
  },
  slipLabel: {
    fontFamily: FONT.medium,
    fontSize: 13,
    color: INK.blue,
  },
  slipStruck: {
    textDecorationLine: "line-through",
    color: INK.faded,
  },
  slipX: {
    fontFamily: FONT.light,
    fontSize: 17,
    lineHeight: 18,
    color: INK.blue,
  },
  whereNote: {
    marginTop: 14,
  },
  mark: {
    marginLeft: 6,
    marginBottom: 4,
  },
  cornerMark: {
    width: 0,
    height: 0,
    marginLeft: 4,
    marginBottom: 4,
    borderTopWidth: 11,
    borderLeftWidth: 11,
    borderTopColor: INK.vermilion,
    borderLeftColor: "transparent",
  },
});
