import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, View, Pressable, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tours } from "@/data/tours";
import { landmarks, CATEGORY_COLORS } from "@/data/landmarks";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { AccordionMap } from "@/components/accordion-map";

function romanNumeral(n: number): string {
  const table: [number, string][] = [
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  for (const [v, s] of table) while (n >= v) { out += s; n -= v; }
  return out || "I";
}

export default function TourDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const tour = tours.find((t) => t.id === id);
  const tourIndex = tours.findIndex((t) => t.id === id) + 1;

  if (!tour) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Text style={{ color: colors.foreground }}>Tour not found</Text>
      </View>
    );
  }

  const tourLandmarks = tour.stops
    .sort((a, b) => a.order - b.order)
    .map((stop) => ({
      ...stop,
      landmark: landmarks.find((l) => l.id === stop.landmarkId),
    }))
    .filter((s) => s.landmark);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
        >
          <IconSymbol name="arrow.left" size={20} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
          {tour.name}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Tour Hero — chapter opener */}
        <View style={[styles.heroBanner, { backgroundColor: tour.color + '15' }]}>
          <View style={[styles.chapterRule, { backgroundColor: tour.color + '55' }]} />
          <View style={styles.chapterRow}>
            <Text style={[styles.chapterNumeral, { color: tour.color }]}>{romanNumeral(tourIndex)}</Text>
            <View style={styles.chapterMeta}>
              <Text style={[styles.chapterLabel, { color: colors.muted }]}>CHAPTER</Text>
              <Text style={[styles.heroName, { color: colors.foreground }]}>{tour.name}</Text>
              <Text style={[styles.heroNeighborhood, { color: colors.muted }]}>{tour.neighborhood}</Text>
            </View>
          </View>
          <View style={[styles.tourBadge, { backgroundColor: tour.color, alignSelf: 'center' }]}>
            <IconSymbol name="figure.walk" size={14} color="#FFFFFF" />
            <Text style={styles.tourBadgeText}>Walking Tour</Text>
          </View>
        </View>

        {/* Tour Stats — catalog line */}
        <View style={styles.statsRule}>
          <Text style={[styles.statLine, { color: colors.muted }]}>
            {tour.distance.toUpperCase()} · {tour.duration.toUpperCase()} · {tour.stops.length} STOPS
          </Text>
          <View style={[styles.statsRuleLine, { backgroundColor: colors.border }]} />
        </View>

        {/* Description */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>About This Tour</Text>
          <Text style={[styles.description, { color: colors.foreground }]}>
            <Text style={[styles.dropCap, { color: tour.color }]}>{tour.description.charAt(0)}</Text>
            {tour.description.slice(1)}
          </Text>
          <Text style={[styles.author, { color: colors.muted }]}>Guide by {tour.author}</Text>
        </View>

        {/* Fold-out route map insert */}
        <AccordionMap
          stops={tourLandmarks.map((s) => ({
            id: s.landmarkId,
            name: s.landmark!.name,
            order: s.order,
            latitude: s.landmark!.latitude,
            longitude: s.landmark!.longitude,
          }))}
          color={tour.color}
          foreground={colors.foreground}
          muted={colors.muted}
          border={colors.border}
          surface={colors.surface}
          onOpenFullMap={() => router.push({ pathname: "/(tabs)", params: { tourId: tour.id } })}
        />

        {/* Tour Stops */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Tour Stops</Text>
          {tourLandmarks.map((stop, index) => (
            <Pressable
              key={stop.landmarkId}
              onPress={() => router.push(`/landmark/${stop.landmarkId}`)}
              style={({ pressed }) => [
                styles.stopItem,
                { opacity: pressed ? 0.7 : 1 },
                index < tourLandmarks.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: 0.5 },
              ]}
            >
              <View style={styles.stopLeft}>
                <View style={[styles.stopNumber, { backgroundColor: tour.color }]}>
                  <Text style={styles.stopNumberText}>{stop.order}</Text>
                </View>
                {index < tourLandmarks.length - 1 && (
                  <View style={[styles.stopLine, { backgroundColor: tour.color + '40' }]} />
                )}
              </View>
              <View style={styles.stopContent}>
                <Text style={[styles.stopName, { color: colors.foreground }]} numberOfLines={2}>
                  {stop.landmark!.name}
                </Text>
                <Text style={[styles.stopAddress, { color: colors.muted }]} numberOfLines={1}>
                  {stop.landmark!.address}
                </Text>
                {stop.note && (
                  <Text style={[styles.stopNote, { color: tour.color }]}>{stop.note}</Text>
                )}
              </View>
              <View style={[styles.stopCatDot, { backgroundColor: CATEGORY_COLORS[stop.landmark!.category] }]} />
            </Pressable>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center",
    marginHorizontal: 8,
  },
  scrollContent: { paddingBottom: 20 },
  heroBanner: {
    padding: 24,
    paddingTop: 20,
  },
  chapterRule: {
    height: 3,
    marginBottom: 14,
  },
  chapterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 14,
  },
  chapterNumeral: {
    fontSize: 56,
    fontWeight: "600",
    fontFamily: "SourceSerif4_600SemiBold",
    lineHeight: 60,
    minWidth: 64,
    textAlign: "center",
  },
  chapterMeta: {
    flex: 1,
  },
  chapterLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2.5,
    marginBottom: 2,
  },
  tourBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 4,
    marginBottom: 12,
  },
  tourBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  heroName: {
    fontSize: 26,
    fontWeight: "600",
    lineHeight: 32,
    marginBottom: 4,
  },
  heroNeighborhood: {
    fontSize: 15,
    lineHeight: 20,
  },
  statsRule: {
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginTop: 18,
    marginBottom: 4,
  },
  statLine: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1.6,
  },
  statsRuleLine: {
    marginTop: 2,
    alignSelf: "stretch",
    height: StyleSheet.hairlineWidth,
  },
  dropCap: {
    fontSize: 44,
    lineHeight: 38,
    fontWeight: "600",
    fontFamily: Platform.select({ ios: "ui-serif", default: "serif" }),
    paddingRight: 6,
  },
  section: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 6,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    fontFamily: Platform.select({ ios: "ui-serif", default: "serif" }),
    marginBottom: 10,
  },
  description: {
    fontSize: 15,
    lineHeight: 24,
  },
  author: {
    fontSize: 13,
    marginTop: 10,
    fontStyle: "italic",
  },
  stopItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 14,
    gap: 12,
  },
  stopLeft: {
    alignItems: "center",
    width: 32,
  },
  stopNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  stopNumberText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  stopLine: {
    width: 2,
    flex: 1,
    marginTop: 4,
    minHeight: 20,
  },
  stopContent: {
    flex: 1,
  },
  stopName: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
  },
  stopAddress: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  stopNote: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
  },
  stopCatDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
});
