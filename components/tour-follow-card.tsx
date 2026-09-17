import { Text, View, Pressable, StyleSheet, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import type { TourFollowState } from "@/hooks/use-tour-follow";
import type { Tour } from "@/data/tours";

interface TourFollowCardProps {
  tour: Tour;
  follow: TourFollowState;
}

/**
 * Follow-along tour card — a field-guide "plate" pinned above the route:
 * serif headings, ink rules, and plate-numbered progress.
 */
export function TourFollowCard({ tour, follow }: TourFollowCardProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  if (follow.finished) {
    return (
      <View style={[styles.card, styles.finishedCard, { backgroundColor: colors.surface, borderColor: colors.border, bottom: insets.bottom + 84 }]}>
        <View style={[styles.finishedRule, { backgroundColor: colors.border }]} />
        <Text style={[styles.finishedTitle, { color: colors.foreground }]}>Tour Complete</Text>
        <Text style={[styles.finishedSub, { color: colors.muted }]}>
          All {follow.totalStops} plates of {tour.name} visited.
        </Text>
      </View>
    );
  }

  const next = follow.stops[follow.currentStopIndex];
  const stopNumber = follow.currentStopIndex + 1;
  const arrivedLabel =
    follow.distanceToNextM != null && follow.distanceToNextM < 1000
      ? `${Math.round(follow.distanceToNextM)} m`
      : follow.distanceToNextM != null
        ? `${(follow.distanceToNextM / 1000).toFixed(1)} km`
        : follow.active
          ? "locating…"
          : "—";

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          bottom: insets.bottom + 84,
        },
      ]}
    >
      <View style={[styles.rule, { backgroundColor: tour.color }]} />

      <View style={styles.headerRow}>
        <Text style={[styles.headerLabel, { color: colors.muted }]}>
          PLATE {stopNumber} OF {follow.totalStops}
        </Text>
        <Pressable
          onPress={follow.active ? follow.stop : follow.start}
          style={({ pressed }) => [
            styles.followToggle,
            { backgroundColor: follow.active ? tour.color : colors.background, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <IconSymbol
            name={follow.active ? "location.fill" : "figure.walk"}
            size={13}
            color="#FFFFFF"
          />
          <Text style={styles.followToggleText}>{follow.active ? "Following" : "Follow"}</Text>
        </Pressable>
      </View>

      {follow.locationUnavailable && (
        <Text style={[styles.unavailable, { color: colors.muted }]}>
          Location unavailable — step through manually.
        </Text>
      )}

      <Pressable
        onPress={() => router.push(`/landmark/${next.landmark.id}`)}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        <View style={styles.nextRow}>
          <View style={[styles.nextNumber, { backgroundColor: tour.color }]}>
            <Text style={styles.nextNumberText}>{next.stop.order}</Text>
          </View>
          <View style={styles.nextContent}>
            <Text style={[styles.nextName, { color: colors.foreground }]} numberOfLines={1}>
              {next.landmark.name}
            </Text>
            <Text style={[styles.nextMeta, { color: colors.muted }]} numberOfLines={1}>
              NEXT STOP · {arrivedLabel}
            </Text>
          </View>
        </View>
      </Pressable>

      {next.stop.note ? (
        <Text style={[styles.nextNote, { color: tour.color }]} numberOfLines={2}>
          {next.stop.note}
        </Text>
      ) : null}

      <View style={[styles.progressTrack, { backgroundColor: colors.border + "40" }]}>
        <View
          style={[
            styles.progressFill,
            { backgroundColor: tour.color, flex: Math.max(1, stopNumber) },
          ]}
        />
        <View style={{ flex: Math.max(1, follow.totalStops - stopNumber) }} />
      </View>

      <View style={styles.controls}>
        <Pressable
          onPress={follow.rewind}
          disabled={follow.currentStopIndex === 0}
          style={({ pressed }) => [
            styles.controlButton,
            { borderColor: colors.border, opacity: follow.currentStopIndex === 0 ? 0.35 : pressed ? 0.7 : 1 },
          ]}
        >
          <IconSymbol name="arrow.left" size={13} color={colors.foreground} />
          <Text style={[styles.controlText, { color: colors.foreground }]}>Back</Text>
        </Pressable>
        <Pressable
          onPress={follow.advance}
          style={({ pressed }) => [
            styles.controlButton,
            styles.skipButton,
            { backgroundColor: tour.color, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.controlText, styles.skipText]}>
            {follow.currentStopIndex === follow.totalStops - 1 ? "Finish" : "Skip to Next"}
          </Text>
          <IconSymbol name="chevron.right" size={13} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: 6,
    borderWidth: 1,
    padding: 14,
    zIndex: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
      web: { boxShadow: "0 2px 8px rgba(0,0,0,0.08)" },
    }),
  },
  rule: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  headerLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
  },
  followToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
  },
  followToggleText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  unavailable: {
    fontSize: 12,
    fontStyle: "italic",
    marginBottom: 6,
  },
  nextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  nextNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  nextNumberText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  nextContent: {
    flex: 1,
  },
  nextName: {
    fontSize: 16,
    fontWeight: "600",
    fontFamily: Platform.select({ ios: "ui-serif", default: "serif" }),
    lineHeight: 21,
  },
  nextMeta: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
    marginTop: 1,
  },
  nextNote: {
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 6,
    lineHeight: 17,
  },
  progressTrack: {
    flexDirection: "row",
    height: 3,
    borderRadius: 2,
    marginTop: 10,
    overflow: "hidden",
  },
  progressFill: {
    height: 3,
  },
  controls: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  controlButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: 1,
  },
  skipButton: {
    borderWidth: 0,
  },
  controlText: {
    fontSize: 13,
    fontWeight: "700",
  },
  skipText: {
    color: "#FFFFFF",
  },
  finishedCard: {
    alignItems: "center",
    paddingVertical: 16,
  },
  finishedRule: {
    width: 40,
    height: 2,
    marginBottom: 10,
  },
  finishedTitle: {
    fontSize: 18,
    fontWeight: "700",
    fontFamily: Platform.select({ ios: "ui-serif", default: "serif" }),
  },
  finishedSub: {
    fontSize: 13,
    marginTop: 4,
    fontStyle: "italic",
  },
});
