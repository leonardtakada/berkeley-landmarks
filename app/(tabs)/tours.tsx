import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ArchitectPortrait } from "@/components/architect-portrait";
import { ChapterOpener, Folio, InkIn, SectionPage, useFirstReveal } from "@/components/book-page";
import { CheckStamp } from "@/components/copy-marks";
import { Rule } from "@/components/print";
import { ScrollClock, useScrollClockHandler } from "@/components/scroll-clock";
import { WalkLabel } from "@/components/walk-label";
import { FONT, INK, MARGIN, TYPE, chapterNo } from "@/constants/book";
import { tours, type Tour } from "@/data/tours";
import { ARCHITECTS, architectsOnTour } from "@/lib/architects";
import { formatDay } from "@/lib/reader-copy";
import { useReaderCopy } from "@/lib/reader-copy-context";

/**
 * Part One — the Tours, set as a table of contents: each walk a numbered
 * chapter with its length and its printed label, the labels alternating
 * sides down the page. A walk that belongs to one architect has their
 * portrait tucked against its label.
 */
export default function ToursScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reveal = useFirstReveal();
  const clock = useScrollClockHandler();
  const { copy } = useReaderCopy();

  return (
    <SectionPage>
      <ScrollClock value={clock.offset}>
      <Animated.FlatList
        data={tours}
        extraData={copy.walked}
        onScroll={clock.onScroll}
        scrollEventThrottle={16}
        keyExtractor={(t) => t.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 36 }}
        ListHeaderComponent={
          <ChapterOpener
            kicker="Part One"
            title="The Tours"
            note={`${spell(tours.length)} walks through the city, each with its own map.`}
            reveal={reveal}
          />
        }
        renderItem={({ item, index }) => (
          <InkIn reveal={reveal} index={2 + index} step={0.07}>
            <ContentsEntry
              tour={item}
              number={index + 1}
              last={index === tours.length - 1}
              walked={copy.walked[item.id]}
              onPress={() => router.push(`/tour/${item.id}`)}
            />
          </InkIn>
        )}
        ListFooterComponent={<Folio>The Tours · Berkeley</Folio>}
      />
      </ScrollClock>
    </SectionPage>
  );
}

function ContentsEntry({
  tour,
  number,
  last,
  walked,
  onPress,
}: {
  tour: Tour;
  number: number;
  last: boolean;
  /** The day the reader walked it, if they have. */
  walked?: string;
  onPress: () => void;
}) {
  const { lead, cast } = architectsOnTour(tour);
  const others = cast.filter((k) => k !== lead).map((k) => ARCHITECTS[k].surname);
  const place = /^various$/i.test(tour.neighborhood) ? "Across the city" : tour.neighborhood;
  // Labels alternate sides down the page, as on a sheet of travel labels.
  const flip = number % 2 === 0;
  const credit = [
    lead ? `Guided by ${ARCHITECTS[lead].surname}` : null,
    others.length
      ? `${lead ? "with" : "With"} the work of ${
          others.length > 1 ? `${others.slice(0, -1).join(", ")} & ${others[others.length - 1]}` : others[0]
        }`
      : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.entry, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Walk ${number}: ${tour.name}, ${tour.distance}${walked ? `. Walked ${formatDay(walked)}` : ""}`}
    >
      <View style={[styles.row, flip && styles.rowFlip]}>
        <View style={styles.labelBox}>
          <WalkLabel tourId={tour.id} title={tour.name} width={LABEL_W} animated={false} />
          {lead ? (
            <ArchitectPortrait
              architect={lead}
              width={46}
              animated={false}
              style={[styles.cameo, flip ? styles.cameoLeft : styles.cameoRight]}
            />
          ) : null}
          {walked ? <CheckStamp size={28} style={[styles.check, flip ? styles.checkRight : styles.checkLeft]} /> : null}
        </View>
        <View style={styles.head}>
          <Text style={styles.numeral}>{chapterNo(number)}</Text>
          <Text style={styles.name}>{tour.name}</Text>
          <Text style={styles.meta}>{place}</Text>
          <Text style={styles.meta}>
            {tour.stops.length} stops  ·  {tour.distance}  ·  {tour.duration}
          </Text>
          {walked ? <Text style={styles.walked}>Walked {formatDay(walked)}</Text> : null}
        </View>
      </View>
      <Text style={styles.desc} numberOfLines={3}>
        {tour.description}
      </Text>
      {credit ? <Text style={styles.cast}>{credit}</Text> : null}
      {!last ? <Rule style={styles.rule} /> : null}
    </Pressable>
  );
}

function spell(n: number): string {
  const words = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
  return words[n] ?? String(n);
}

const LABEL_W = 108;

const styles = StyleSheet.create({
  entry: {
    paddingHorizontal: MARGIN.outer,
    paddingTop: 24,
  },
  pressed: {
    opacity: 0.5,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 20,
  },
  rowFlip: {
    flexDirection: "row-reverse",
  },
  labelBox: {
    width: LABEL_W,
  },
  cameo: {
    position: "absolute",
    bottom: -12,
  },
  cameoRight: {
    right: -16,
  },
  cameoLeft: {
    left: -16,
  },
  check: {
    position: "absolute",
    top: -8,
  },
  checkLeft: {
    left: -10,
  },
  checkRight: {
    right: -10,
  },
  walked: {
    ...TYPE.label,
    fontSize: 9.5,
    letterSpacing: 1.6,
    color: INK.vermilion,
    marginTop: 6,
  },
  head: {
    flex: 1,
    paddingBottom: 4,
  },
  numeral: {
    ...TYPE.numeral,
    fontSize: 40,
    lineHeight: 44,
  },
  name: {
    fontFamily: FONT.regular,
    fontSize: 21,
    lineHeight: 25,
    color: INK.charcoal,
    marginTop: 4,
  },
  meta: {
    ...TYPE.label,
    fontSize: 9.5,
    letterSpacing: 1.6,
    marginTop: 6,
  },
  desc: {
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 21,
    color: INK.charcoal,
    marginTop: 18,
  },
  cast: {
    fontFamily: FONT.regular,
    fontSize: 12.5,
    color: INK.blue,
    marginTop: 8,
  },
  rule: {
    marginTop: 22,
  },
});
