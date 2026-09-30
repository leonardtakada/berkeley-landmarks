import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PaperGrain } from "@/components/paper-grain";
import { Arrow } from "@/components/print";
import { FONT, INK, PAPER, TYPE, chapterNo } from "@/constants/book";
import { tours, type Tour } from "@/data/tours";
import type { TourFollowState } from "@/hooks/use-tour-follow";
import { formatDay } from "@/lib/reader-copy";
import { useReaderCopy } from "@/lib/reader-copy-context";

interface TourFollowCardProps {
  tour: Tour;
  follow: TourFollowState;
  /** Walking stop by stop; otherwise the card shows the walk as a whole. */
  walking: boolean;
  onBegin: () => void;
  onLayout?: (e: LayoutChangeEvent) => void;
}

/**
 * The walk, as a slip laid over the foot of the map. Before setting out it
 * summarises the route; once walking it names the next stop, with steps
 * back and on — each step moves the map to that leg of the walk.
 */
export function TourFollowCard({ tour, follow, walking, onBegin, onLayout }: TourFollowCardProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { copy } = useReaderCopy();
  const no = chapterNo(tours.indexOf(tour) + 1);
  const bottom = { paddingBottom: Math.max(insets.bottom, 14) + 12 };

  if (!walking) {
    return (
      <View style={[styles.card, bottom]} onLayout={onLayout}>
        <PaperGrain />
        <Text style={TYPE.kicker}>Walk {no}</Text>
        <Text style={styles.title}>{tour.name}</Text>
        <Text style={[TYPE.label, styles.meta]}>
          {follow.totalStops} stops · {tour.distance} · {tour.duration}
        </Text>
        <Pressable onPress={onBegin} style={({ pressed }) => [styles.solid, pressed && { opacity: 0.85 }]}>
          <Text style={styles.solidText}>Begin at stop 1</Text>
          <Arrow length={22} color={PAPER.cover} />
        </Pressable>
      </View>
    );
  }

  const labels = copy.labels[tour.id] ?? {};
  const collected = follow.stops.filter((s) => labels[s.landmark.id]).length;

  if (follow.finished) {
    const walked = copy.walked[tour.id];
    return (
      <View style={[styles.card, bottom]} onLayout={onLayout}>
        <PaperGrain />
        <Text style={TYPE.kicker}>Walk {no} · {walked ? "Complete" : "The end of the walk"}</Text>
        <Text style={styles.title}>{tour.name}</Text>
        <Text style={styles.note}>
          {walked
            ? `All ${follow.totalStops} labels collected. Its stamp is in the Appendix, dated ${formatDay(walked)}.`
            : `${collected} of ${follow.totalStops} labels collected. Each is collected standing at its stop; with all of them, the walk is stamped.`}
        </Text>
        <View style={styles.controls}>
          <Pressable onPress={follow.rewind} hitSlop={8} style={styles.linkRow}>
            <Arrow direction="left" length={18} />
            <Text style={styles.link}>Last stop</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/stamps")} hitSlop={8} style={styles.linkRow}>
            <Text style={styles.link}>Your stamps</Text>
            <Arrow length={18} />
          </Pressable>
        </View>
      </View>
    );
  }

  const i = follow.currentStopIndex;
  const next = follow.stops[i];
  const prev = i > 0 ? follow.stops[i - 1] : null;
  const distance =
    follow.distanceToNextM == null
      ? null
      : follow.distanceToNextM < 1000
        ? `${Math.round(follow.distanceToNextM)} m away`
        : `${(follow.distanceToNextM / 1000).toFixed(1)} km away`;

  return (
    <View style={[styles.card, bottom]} onLayout={onLayout}>
      <PaperGrain />
      <View style={styles.headRow}>
        <Text style={TYPE.kicker}>
          Stop {i + 1} of {follow.totalStops}
        </Text>
        <Pressable onPress={follow.active ? follow.stop : follow.start} hitSlop={8}>
          <Text style={[styles.link, follow.active && { color: INK.vermilion }]}>
            {follow.active ? "● Following you" : "Follow my location"}
          </Text>
        </Pressable>
      </View>

      {/* Progress: one segment per stop. */}
      <View style={styles.progress}>
        {follow.stops.map((s, k) => (
          <View
            key={s.landmark.id}
            style={[styles.tick, labels[s.landmark.id] ? styles.tickOn : null, k === i && styles.tickHere]}
          />
        ))}
      </View>

      <Pressable
        onPress={() => router.push(`/landmark/${next.landmark.id}`)}
        style={({ pressed }) => [styles.nextRow, pressed && { opacity: 0.6 }]}
      >
        <View style={styles.dot}>
          <Text style={styles.dotText}>{next.stop.order}</Text>
        </View>
        <View style={styles.nextText}>
          <Text style={styles.nextName} numberOfLines={1}>
            {next.landmark.name}
          </Text>
          <Text style={styles.nextMeta} numberOfLines={1}>
            {prev ? `From ${prev.landmark.name}` : next.landmark.address}
            {distance ? `  ·  ${distance}` : ""}
          </Text>
        </View>
      </Pressable>

      {follow.locationUnavailable ? (
        <Text style={styles.note}>Location is off, so the stops can&apos;t know you&apos;re there: step through by hand. Labels are collected only on the spot.</Text>
      ) : !follow.active ? (
        <Text style={styles.note}>Not following you: the stops you pass won&apos;t collect their labels.</Text>
      ) : labels[next.landmark.id] ? (
        <Text style={styles.note}>Its label is already collected.</Text>
      ) : null}

      <View style={styles.controls}>
        <Pressable
          onPress={follow.rewind}
          disabled={i === 0}
          hitSlop={8}
          style={[styles.linkRow, i === 0 && { opacity: 0.3 }]}
        >
          <Arrow direction="left" length={18} />
          <Text style={styles.link}>Back</Text>
        </Pressable>
        <Pressable onPress={follow.advance} style={({ pressed }) => [styles.solidSmall, pressed && { opacity: 0.85 }]}>
          <Text style={styles.solidText}>{i === follow.totalStops - 1 ? "Finish" : `On to stop ${i + 2}`}</Text>
          <Arrow length={18} color={PAPER.cover} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: PAPER.slip,
    paddingHorizontal: 22,
    paddingTop: 18,
    overflow: "hidden",
    zIndex: 12,
    borderTopWidth: 3,
    borderTopColor: INK.blue,
    shadowColor: "#1E1810",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  title: {
    fontFamily: FONT.light,
    fontSize: 26,
    lineHeight: 30,
    color: INK.charcoal,
    marginTop: 6,
  },
  meta: {
    marginTop: 6,
  },
  note: {
    fontFamily: FONT.regular,
    fontSize: 13.5,
    color: INK.sepia,
    marginTop: 8,
  },
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progress: {
    flexDirection: "row",
    gap: 3,
    marginTop: 12,
  },
  tick: {
    flex: 1,
    height: 3,
    backgroundColor: INK.blueTint,
  },
  tickOn: {
    backgroundColor: INK.blue,
  },
  tickHere: {
    backgroundColor: INK.vermilion,
  },
  nextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 14,
  },
  dot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: INK.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  dotText: {
    fontFamily: FONT.medium,
    fontSize: 14,
    color: PAPER.cover,
  },
  nextText: {
    flex: 1,
  },
  nextName: {
    fontFamily: FONT.regular,
    fontSize: 19,
    lineHeight: 23,
    color: INK.charcoal,
  },
  nextMeta: {
    fontFamily: FONT.regular,
    fontSize: 13,
    color: INK.sepia,
    marginTop: 2,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  link: {
    fontFamily: FONT.medium,
    fontSize: 11.5,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: INK.blue,
  },
  solid: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: INK.blue,
    paddingHorizontal: 18,
    paddingVertical: 15,
    marginTop: 16,
  },
  solidSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: INK.blue,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  solidText: {
    fontFamily: FONT.medium,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: PAPER.cover,
  },
});
