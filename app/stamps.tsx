import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Leader } from "@/components/book-page";
import { CheckStamp, StampedLabel } from "@/components/copy-marks";
import { EntryPage, RunningHead } from "@/components/entry-page";
import { Bar, Rule } from "@/components/print";
import { ScrollClock, useScrollClockHandler } from "@/components/scroll-clock";
import { FONT, INK, MARGIN, TYPE, chapterNo } from "@/constants/book";
import { landmarks } from "@/data/landmarks";
import { tours } from "@/data/tours";
import { formatDay } from "@/lib/reader-copy";
import { useReaderCopy } from "@/lib/reader-copy-context";
import { useWatchPlaces } from "@/lib/watch-places";

const byId = new Map(landmarks.map((l) => [l.id, l]));

/**
 * The reader's page at the back of the guide, kept like a passport: a stamp
 * for every walk they've finished, the places they've been, day by day, and
 * the pages they've turned down.
 */
export default function StampsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const clock = useScrollClockHandler();
  const { width } = useWindowDimensions();
  const { copy } = useReaderCopy();
  const { ledger } = useWatchPlaces();

  const cols = 3;
  const gap = 14;
  const slot = Math.floor((width - MARGIN.outer * 2 - gap * (cols - 1)) / cols);
  const label = Math.round(slot * 0.74);

  // Places visited, the latest day first.
  const days = new Map<string, string[]>();
  for (const [id, day] of Object.entries(copy.visited).sort(([, a], [, b]) => b.localeCompare(a))) {
    if (byId.has(id)) days.set(day, [...(days.get(day) ?? []), id]);
  }
  const visited = [...days.values()].reduce((n, ids) => n + ids.length, 0);
  const corners = Object.entries(copy.corners)
    .filter(([id]) => byId.has(id))
    .sort(([, a], [, b]) => b.localeCompare(a));
  const walked = tours.filter((t) => copy.walked[t.id]).length;
  const watching = Object.values(ledger.watches)
    .filter((w) => w.status !== "retired" && byId.has(w.landmarkId))
    .sort((a, b) => b.watchedAt.localeCompare(a.watchedAt));

  return (
    <EntryPage>
      <RunningHead back="Appendix" folio="Stamps" />
      <ScrollClock value={clock.offset}>
        <Animated.ScrollView
          onScroll={clock.onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 48 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.block}>
            <Bar />
            <Text style={[TYPE.kicker, styles.kicker]}>Appendix</Text>
            <Text style={styles.title} accessibilityRole="header">
              Stamps
            </Text>
            <Text style={styles.note}>
              Your guide, as you&apos;ve used it: a stamp for every walk you finish, and the places you&apos;ve been.
            </Text>
          </View>

          {/* The walks, as a passport's pages */}
          <View style={styles.block}>
            <View style={styles.head}>
              <Text style={TYPE.label}>The walks</Text>
              <Text style={styles.count}>
                {walked} / {tours.length}
              </Text>
            </View>
            <Rule color={INK.charcoal} weight={1} />
            <View style={[styles.grid, { gap, rowGap: 26 }]}>
              {tours.map((t, i) => {
                const day = copy.walked[t.id];
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => router.push(`/tour/${t.id}`)}
                    style={({ pressed }) => [{ width: slot }, pressed && { opacity: 0.6 }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Walk ${i + 1}, ${t.name}: ${day ? `walked ${formatDay(day)}` : "not yet walked"}`}
                  >
                    {day ? (
                      <StampedLabel tourId={t.id} title={t.name} walk={i + 1} day={day} width={label} />
                    ) : (
                      <View style={[styles.empty, { width: label, height: label * 1.2 }]}>
                        <Text style={styles.emptyNo}>{chapterNo(i + 1)}</Text>
                      </View>
                    )}
                    <Text style={[styles.slotName, !day && styles.faded]} numberOfLines={2}>
                      {t.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {walked === 0 ? (
              <Text style={styles.hint}>
                Set out on a walk with the guide and stand at each of its stops: with every label collected, its stamp is set
                here.
              </Text>
            ) : null}
          </View>

          {/* Places visited */}
          <View style={styles.block}>
            <View style={styles.head}>
              <Text style={TYPE.label}>Places visited</Text>
              <Text style={styles.count}>
                {visited} / {landmarks.length}
              </Text>
            </View>
            <Rule color={INK.charcoal} weight={1} />
            {visited === 0 ? (
              <Text style={styles.hint}>
                Standing at a place, mark its entry visited — or reach it on a walk — and it&apos;s listed here with the day.
              </Text>
            ) : (
              [...days].map(([day, ids]) => (
                <View key={day} style={styles.day}>
                  <View style={styles.dayHead}>
                    <CheckStamp size={16} />
                    <Text style={styles.dayText}>{formatDay(day, "stamp")}</Text>
                  </View>
                  {ids.map((id) => (
                    <EntryLink key={id} id={id} onPress={() => router.push(`/landmark/${id}`)} />
                  ))}
                </View>
              ))
            )}
          </View>

          {/* Places you're watching */}
          <View style={styles.block}>
            <View style={styles.head}>
              <Text style={TYPE.label}>Places you&apos;re watching</Text>
              <Text style={styles.count}>{watching.length}</Text>
            </View>
            <Rule color={INK.charcoal} weight={1} />
            {watching.length === 0 ? (
              <Text style={styles.hint}>
                Turn a page of the guide toward a place — “Watch this place” on its entry — and the guide will say, next time
                you&apos;re near it with the phone in your pocket, that it&apos;s close by.
              </Text>
            ) : (
              watching.map((w) => {
                const l = byId.get(w.landmarkId)!;
                const waiting = w.status === "fired";
                return (
                  <Pressable
                    key={w.landmarkId}
                    onPress={() => router.push(`/landmark/${w.landmarkId}`)}
                    style={({ pressed }) => [styles.entry, pressed && { opacity: 0.5 }]}
                    accessibilityRole="button"
                    accessibilityLabel={`${l.name}${waiting ? ", waiting at the door" : ", watching"}`}
                  >
                    <View style={styles.watchDot} />
                    <Text style={styles.entryName} numberOfLines={1}>
                      {l.name}
                    </Text>
                    <Leader />
                    <Text style={styles.watchNote}>{waiting ? "waiting at the door" : w.notifying ? "watching" : "kept as a bookmark"}</Text>
                  </Pressable>
                );
              })
            )}
          </View>

          {/* Pages turned down */}
          <View style={styles.block}>
            <View style={styles.head}>
              <Text style={TYPE.label}>Pages turned down</Text>
              <Text style={styles.count}>{corners.length}</Text>
            </View>
            <Rule color={INK.charcoal} weight={1} />
            {corners.length === 0 ? (
              <Text style={styles.hint}>Turn down the corner of an entry, at the top of its page, to keep it here.</Text>
            ) : (
              corners.map(([id]) => <EntryLink key={id} id={id} onPress={() => router.push(`/landmark/${id}`)} />)
            )}
          </View>
        </Animated.ScrollView>
      </ScrollClock>
    </EntryPage>
  );
}

function EntryLink({ id, onPress }: { id: string; onPress: () => void }) {
  const l = byId.get(id)!;
  const number = l.landmarkNumber?.replace(/^#/, "");
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.entry, pressed && { opacity: 0.5 }]}
      accessibilityRole="button"
      accessibilityLabel={l.name}
    >
      <Text style={styles.entryName} numberOfLines={1}>
        {l.name}
      </Text>
      <Leader />
      <Text style={styles.entryNo}>{number ? `No. ${number}` : "—"}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: {
    paddingHorizontal: MARGIN.outer,
    marginTop: 30,
  },
  kicker: {
    marginTop: 10,
  },
  title: {
    fontFamily: FONT.light,
    fontSize: 34,
    lineHeight: 40,
    color: INK.charcoal,
    marginTop: 6,
  },
  note: {
    fontFamily: FONT.regular,
    fontSize: 15,
    lineHeight: 22,
    color: INK.sepia,
    marginTop: 8,
  },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 8,
  },
  count: {
    fontFamily: FONT.medium,
    fontSize: 12,
    letterSpacing: 1.6,
    color: INK.blue,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 18,
  },
  empty: {
    borderWidth: 1.2,
    borderColor: INK.faded,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyNo: {
    ...TYPE.numeral,
    fontSize: 30,
    lineHeight: 34,
    color: INK.faded,
  },
  slotName: {
    fontFamily: FONT.regular,
    fontSize: 12,
    lineHeight: 15,
    color: INK.charcoal,
    marginTop: 8,
  },
  faded: {
    color: INK.faded,
  },
  hint: {
    fontFamily: FONT.regular,
    fontSize: 13.5,
    lineHeight: 20,
    color: INK.sepia,
    marginTop: 14,
  },
  day: {
    marginTop: 14,
  },
  dayHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  dayText: {
    fontFamily: FONT.medium,
    fontSize: 11.5,
    letterSpacing: 1.6,
    color: INK.vermilion,
  },
  entry: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingVertical: 8,
  },
  watchDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderColor: INK.vermilion,
    borderWidth: 1.3,
    marginRight: 8,
    marginBottom: 6,
  },
  watchNote: {
    fontFamily: FONT.medium,
    fontSize: 10.5,
    letterSpacing: 1,
    color: INK.vermilion,
    marginBottom: 2,
    marginLeft: 8,
  },
  entryName: {
    flexShrink: 1,
    fontFamily: FONT.regular,
    fontSize: 16,
    lineHeight: 21,
    color: INK.charcoal,
  },
  entryNo: {
    fontFamily: FONT.medium,
    fontSize: 11.5,
    letterSpacing: 1.2,
    color: INK.blue,
    marginBottom: 2,
  },
});
