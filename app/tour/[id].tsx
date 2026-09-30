import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ArchitectPortrait } from "@/components/architect-portrait";
import { DateStamp, RingStamp } from "@/components/copy-marks";
import { EntryPage, RunningHead } from "@/components/entry-page";
import { FoldOutMap } from "@/components/fold-out-map";
import { Annotation, Arrow, Bar, Rule } from "@/components/print";
import { ScrollClock, useScrollClockHandler } from "@/components/scroll-clock";
import { TravelStamp } from "@/components/travel-stamp";
import { WalkLabel } from "@/components/walk-label";
import { FONT, INK, MARGIN, PAGE_TURN_MS, PAPER, TYPE, chapterNo } from "@/constants/book";
import { landmarks } from "@/data/landmarks";
import { tours } from "@/data/tours";
import { ARCHITECTS, architectOf, architectsOnTour } from "@/lib/architects";
import { formatDay } from "@/lib/reader-copy";
import { useReaderCopy } from "@/lib/reader-copy-context";

/**
 * A walk, printed as a chapter: its label, number, title and particulars; the
 * architect who owns it, drawn; the fold-out map; the itinerary with each
 * stop numbered as on the map; and the labels collected along the way.
 */
export default function TourChapterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const index = tours.findIndex((t) => t.id === id);
  const tour = tours[index];
  const { copy, mark } = useReaderCopy();
  const clock = useScrollClockHandler();

  if (!tour) {
    return (
      <EntryPage>
        <RunningHead back="The Tours" />
        <View style={styles.missing}>
          <Annotation>This walk isn&apos;t in the guide.</Annotation>
        </View>
      </EntryPage>
    );
  }

  const no = chapterNo(index + 1);
  const place = /^various$/i.test(tour.neighborhood) ? "Across the city" : tour.neighborhood;
  const stops = [...tour.stops]
    .sort((a, b) => a.order - b.order)
    .map((s) => ({ ...s, landmark: landmarks.find((l) => l.id === s.landmarkId) }))
    .filter((s): s is typeof s & { landmark: NonNullable<typeof s.landmark> } => !!s.landmark);
  const { lead, cast } = architectsOnTour(tour);
  const others = cast.filter((k) => k !== lead);
  const labels = copy.labels[tour.id] ?? {};
  const collected = stops.filter((s) => labels[s.landmarkId]).length;
  const walked = copy.walked[tour.id];
  const words = tour.description.split(" ");

  return (
    <EntryPage>
      <RunningHead back="The Tours" folio={`Walk ${no}`} />
      <ScrollClock value={clock.offset}>
      <Animated.ScrollView
        onScroll={clock.onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Chapter opener */}
        <View style={styles.opener}>
          <View style={styles.labelBox}>
            <WalkLabel tourId={tour.id} title={tour.name} width={140} delay={PAGE_TURN_MS * 0.6} />
            {walked ? (
              <View style={styles.ring} accessible accessibilityLabel={`Stamped: walked ${formatDay(walked)}`}>
                <RingStamp walk={index + 1} day={walked} size={84} />
              </View>
            ) : null}
          </View>
          <View style={styles.openerText}>
            <Text style={styles.numeral}>{no}</Text>
            <Bar />
            <Text style={[TYPE.kicker, styles.kicker]}>{place}</Text>
            <Text style={styles.title}>{tour.name}</Text>
          </View>
        </View>
        <View style={[styles.block, styles.facts]}>
          {[
            ["Stops", String(stops.length)],
            ["Distance", tour.distance],
            ["Time", tour.duration],
          ].map(([k, v], i) => (
            <View key={k} style={[styles.fact, i > 0 && styles.factDivider]}>
              <Text style={TYPE.label}>{k}</Text>
              <Text style={styles.factValue}>{v}</Text>
            </View>
          ))}
        </View>
        {/* Stamped only by walking it: every stop's label, collected on the spot. */}
        {walked ? (
          <DateStamp
            word="Walked"
            day={walked}
            prompt="Walked"
            onStamp={() => {}}
            onErase={() => mark("walked", tour.id, false)}
            style={styles.walked}
          />
        ) : null}

        {/* The walk's own architect */}
        {lead ? (
          <View style={[styles.block, styles.leadRow]}>
            <ArchitectPortrait architect={lead} width={116} delay={PAGE_TURN_MS} />
            <View style={styles.leadText}>
              <Text style={TYPE.label}>Your guide on this walk</Text>
              <Text style={styles.leadName}>{ARCHITECTS[lead].name}</Text>
              <Text style={[TYPE.label, styles.leadYears]}>{ARCHITECTS[lead].years}</Text>
              <Text style={styles.leadNote}>{ARCHITECTS[lead].note}</Text>
              <Pressable
                onPress={() => router.push(`/architect/${lead}`)}
                hitSlop={8}
                style={({ pressed }) => [styles.bioLink, pressed && { opacity: 0.5 }]}
                accessibilityRole="button"
                accessibilityLabel={`Biography of ${ARCHITECTS[lead].name}`}
              >
                <Text style={styles.bioLinkText}>Biography</Text>
                <Arrow length={16} />
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Introduction */}
        <View style={styles.block}>
          <Rule color={INK.charcoal} weight={1} style={styles.rule} />
          <Text style={styles.body}>
            <Text style={styles.leadIn}>{words.slice(0, 3).join(" ").toUpperCase()}</Text>{" "}
            {words.slice(3).join(" ")}
          </Text>
          <Text style={[TYPE.label, styles.byline]}>Walk by {tour.author}</Text>
          {others.length ? (
            <View style={styles.cameos}>
              <Text style={TYPE.label}>Also met along the way</Text>
              <View style={styles.cameoRow}>
                {others.map((k, i) => (
                  <View key={k} style={styles.cameo}>
                    <ArchitectPortrait architect={k} width={64} delay={PAGE_TURN_MS + 120 * (i + 1)} />
                    <Text style={styles.cameoName}>{ARCHITECTS[k].surname}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>

        {/* The fold-out map */}
        <View style={styles.mapBlock}>
          <FoldOutMap
            tourId={tour.id}
            title={tour.name}
            distance={tour.distance}
            stops={stops.map((s) => ({
              id: s.landmarkId,
              name: s.landmark.name,
              order: s.order,
              latitude: s.landmark.latitude,
              longitude: s.landmark.longitude,
            }))}
            route={tour.routeCoordinates}
            onOpenFullMap={() => router.push({ pathname: "/map", params: { tourId: tour.id } })}
          />
        </View>

        {/* Itinerary */}
        <View style={styles.block}>
          <Text style={[TYPE.label, styles.subhead]}>The itinerary</Text>
          <Rule color={INK.charcoal} weight={1} />
          {stops.map((s, i) => {
            const by = architectOf(s.landmark);
            return (
              <Pressable
                key={s.landmarkId}
                onPress={() => router.push(`/landmark/${s.landmarkId}`)}
                style={({ pressed }) => [styles.stop, pressed && { opacity: 0.5 }]}
              >
                <View style={styles.stopRow}>
                  <View style={styles.stopDot}>
                    <Text style={styles.stopNo}>{s.order}</Text>
                  </View>
                  <View style={styles.stopText}>
                    <Text style={styles.stopName}>{s.landmark.name}</Text>
                    <Text style={styles.stopAddr}>{s.landmark.address}</Text>
                    {s.note ? <Text style={styles.stopNote}>{s.note}</Text> : null}
                  </View>
                  {by && by !== lead ? (
                    <ArchitectPortrait architect={by} width={40} animated={false} />
                  ) : null}
                </View>
                {i < stops.length - 1 ? <Rule style={styles.stopRule} /> : null}
              </Pressable>
            );
          })}
        </View>

        {/* Labels */}
        <View style={styles.block}>
          <View style={styles.stampHead}>
            <Text style={TYPE.label}>Labels for this walk</Text>
            <Text style={styles.stampCount}>
              {collected} / {stops.length}
            </Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stamps}>
            {stops.map((s, i) => {
              const got = labels[s.landmarkId];
              return (
                <View
                  key={s.landmarkId}
                  style={styles.stampSlot}
                  accessible
                  accessibilityLabel={`${s.landmark.name}: ${got ? `label collected ${formatDay(got)}` : "not yet collected"}`}
                >
                  <TravelStamp landmarkName={s.landmark.name} tourName={tour.name} collected={!!got} size={80} variant={i} />
                  <Text style={[styles.stampName, !!got && { color: INK.charcoal }]} numberOfLines={2}>
                    {s.landmark.name}
                  </Text>
                  {got ? <Text style={styles.stampDay}>{formatDay(got, "stamp")}</Text> : null}
                </View>
              );
            })}
          </ScrollView>
          {!collected ? (
            <Text style={styles.stampHint}>
              Set out on foot with the guide: each stop adds its label to this page when you stand there, and with every
              label the walk is stamped.
            </Text>
          ) : null}
        </View>

        {/* Set out */}
        <Pressable
          onPress={() => router.push({ pathname: "/map", params: { tourId: tour.id, walk: "1" } })}
          style={({ pressed }) => [styles.block, styles.setOut, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          <Text style={styles.setOutText}>Set out on foot</Text>
          <Arrow length={24} color={PAPER.cover} />
        </Pressable>
      </Animated.ScrollView>
      </ScrollClock>
    </EntryPage>
  );
}

const styles = StyleSheet.create({
  missing: {
    padding: MARGIN.outer,
    paddingTop: 60,
  },
  opener: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: MARGIN.outer,
    paddingTop: 22,
    gap: 14,
  },
  numeral: {
    ...TYPE.numeral,
    fontSize: 64,
    lineHeight: 76,
    marginBottom: 6,
  },
  openerText: {
    flex: 1,
  },
  kicker: {
    marginTop: 10,
  },
  title: {
    fontFamily: FONT.light,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.3,
    color: INK.charcoal,
    marginTop: 6,
  },
  block: {
    paddingHorizontal: MARGIN.outer,
    marginTop: 28,
  },
  facts: {
    flexDirection: "row",
    marginHorizontal: MARGIN.outer,
    paddingHorizontal: 0,
    borderTopWidth: 1.5,
    borderTopColor: INK.blue,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: INK.rule,
  },
  fact: {
    flex: 1,
    paddingVertical: 12,
  },
  factDivider: {
    paddingLeft: 14,
    borderLeftWidth: StyleSheet.hairlineWidth * 2,
    borderLeftColor: INK.rule,
  },
  factValue: {
    fontFamily: FONT.light,
    fontSize: 22,
    color: INK.charcoal,
    marginTop: 4,
  },
  leadRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 18,
    marginTop: 34,
  },
  leadText: {
    flex: 1,
    paddingTop: 4,
  },
  leadName: {
    fontFamily: FONT.regular,
    fontSize: 21,
    lineHeight: 25,
    color: INK.charcoal,
    marginTop: 6,
  },
  leadYears: {
    marginTop: 4,
  },
  leadNote: {
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    color: INK.charcoal,
    marginTop: 10,
  },
  bioLink: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
    marginTop: 12,
  },
  bioLinkText: {
    fontFamily: FONT.medium,
    fontSize: 11.5,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: INK.blue,
  },
  rule: {
    marginBottom: 18,
  },
  body: {
    fontFamily: FONT.regular,
    fontSize: 16,
    lineHeight: 26,
    color: INK.charcoal,
  },
  leadIn: {
    fontFamily: FONT.medium,
    fontSize: 13,
    letterSpacing: 1.6,
    color: INK.blue,
  },
  byline: {
    marginTop: 14,
  },
  cameos: {
    marginTop: 28,
  },
  cameoRow: {
    flexDirection: "row",
    gap: 18,
    marginTop: 12,
  },
  cameo: {
    alignItems: "center",
  },
  cameoName: {
    fontFamily: FONT.regular,
    fontSize: 12,
    color: INK.sepia,
    marginTop: 6,
  },
  mapBlock: {
    marginTop: 40,
  },
  subhead: {
    marginBottom: 10,
  },
  stop: {
    paddingTop: 14,
  },
  stopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  stopDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: INK.blue,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  stopNo: {
    fontFamily: FONT.medium,
    fontSize: 12,
    color: PAPER.cover,
  },
  stopText: {
    flex: 1,
  },
  stopName: {
    fontFamily: FONT.regular,
    fontSize: 18,
    lineHeight: 23,
    color: INK.charcoal,
  },
  stopAddr: {
    fontFamily: FONT.regular,
    fontSize: 13,
    color: INK.sepia,
    marginTop: 2,
  },
  stopNote: {
    fontFamily: FONT.lightItalic,
    fontSize: 14,
    color: INK.vermilion,
    marginTop: 6,
  },
  stopRule: {
    marginTop: 14,
    marginLeft: 40,
  },
  stampHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  stampCount: {
    fontFamily: FONT.medium,
    fontSize: 12,
    letterSpacing: 1.6,
    color: INK.blue,
  },
  stamps: {
    gap: 14,
    paddingVertical: 16,
  },
  stampSlot: {
    width: 88,
    alignItems: "center",
  },
  stampName: {
    marginTop: 8,
    fontFamily: FONT.regular,
    fontSize: 11,
    lineHeight: 14,
    color: INK.faded,
    textAlign: "center",
  },
  stampDay: {
    fontFamily: FONT.medium,
    fontSize: 9.5,
    letterSpacing: 1.2,
    color: INK.vermilion,
    marginTop: 3,
  },
  labelBox: {
    // The stamp struck across the label's corner lies over the title beside it.
    zIndex: 1,
  },
  ring: {
    position: "absolute",
    right: -24,
    bottom: -18,
  },
  walked: {
    marginHorizontal: MARGIN.outer,
    marginTop: 18,
  },
  stampHint: {
    fontFamily: FONT.regular,
    fontSize: 13,
    color: INK.sepia,
  },
  setOut: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: MARGIN.outer,
    marginTop: 40,
    paddingVertical: 18,
    backgroundColor: INK.blue,
  },
  setOutText: {
    fontFamily: FONT.medium,
    fontSize: 13,
    letterSpacing: 2.4,
    textTransform: "uppercase",
    color: PAPER.cover,
  },
});
