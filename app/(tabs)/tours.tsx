import React from "react";
import { Text, View, FlatList, Pressable, StyleSheet, Platform } from "react-native";
// Platform already imported
import { useRouter } from "expo-router";
import { useBottomTabBarHeight } from "expo-router/build/react-navigation/bottom-tabs";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { tours } from "@/data/tours";
import type { Tour } from "@/data/tours";

function roman(n: number): string {
  const table: [number, string][] = [
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  for (const [v, s] of table) while (n >= v) { out += s; n -= v; }
  return out;
}

function TourCard({ tour, tourIndex }: { tour: Tour; tourIndex: number }) {
  const router = useRouter();
  const colors = useColors();

  const stopCount = tour.stops.length;

  return (
    <Pressable
      onPress={() => router.push(`/tour/${tour.id}`)}
      style={({ pressed }) => [
        styles.tourCard,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {/* Thin accent rule — like a pencil underline */}
      <View style={[styles.accentBar, { backgroundColor: tour.color + '66' }]} />

      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <View style={[styles.tourIcon, { backgroundColor: tour.color + '18' }]}>
            <IconSymbol name="figure.walk" size={20} color={tour.color} />
          </View>
          <View style={styles.cardTitleArea}>
            <Text style={[styles.tourName, { color: colors.foreground }]} numberOfLines={1}>
              {tour.name}
            </Text>
            <Text style={[styles.tourNeighborhood, { color: colors.muted }]}>
              [ {tour.neighborhood.toUpperCase()} ]
            </Text>
          </View>
          <Text style={[styles.plateNo, { color: colors.muted }]}>Ch. {roman(tourIndex + 1)}</Text>
        </View>

        <Text style={[styles.tourDescription, { color: colors.muted }]} numberOfLines={2}>
          {tour.description}
        </Text>

        <View style={styles.cardFooter}>
          <View style={styles.statItem}>
            <IconSymbol name="mappin.and.ellipse" size={13} color={colors.muted} />
            <Text style={[styles.statText, { color: colors.muted }]}>{stopCount} stops</Text>
          </View>
          <View style={styles.statItem}>
            <IconSymbol name="ruler.fill" size={13} color={colors.muted} />
            <Text style={[styles.statText, { color: colors.muted }]}>{tour.distance}</Text>
          </View>
          <View style={styles.statItem}>
            <IconSymbol name="clock.fill" size={13} color={colors.muted} />
            <Text style={[styles.statText, { color: colors.muted }]}>{tour.duration}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function ToursScreen() {
  const colors = useColors();
  const tabBarHeight = useBottomTabBarHeight();

  return (
    <ScreenContainer>
      <View style={styles.screenHeader}>
        {/* Showa book cover: double-rule frame, seal, stacked title */}
        <View style={[styles.coverFrame, { borderColor: colors.primary }]}>
          <View style={[styles.coverRule, { backgroundColor: colors.primary }]} />
          <View style={styles.coverRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.coverKicker, { color: colors.muted }]}>BERKELEY ARCHITECTURAL HERITAGE</Text>
              <Text style={[styles.screenTitle, { color: colors.primary }]}>Walking{"\n"}Tours</Text>
              <View>
                <View style={[styles.underlineRule, { backgroundColor: "#E15A3E" }]} />
              </View>
              <Text style={[styles.screenSubtitle, { color: colors.muted }]}>
                A field folio of the city&apos;s architectural heritage — five walking routes, illustrated
              </Text>
            </View>
            <View style={[styles.hanko, { backgroundColor: "#B14A38" }]}>
              <Text style={styles.hankoGlyph}>博</Text>
              <Text style={styles.hankoSub}>BERKELEY</Text>
            </View>
          </View>
        </View>
        <Text style={[styles.tocLabel, { color: "#E15A3E" }]}>目次 · Table of Contents</Text>
      </View>
      <FlatList
        data={tours}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => <TourCard tour={item} tourIndex={index} />}
        contentContainerStyle={[styles.listContent, { paddingBottom: tabBarHeight + 24 }]}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListFooterComponent={<FolioFooter />}
      />
    </ScreenContainer>
  );
}

function FolioFooter() {
  const colors = useColors();
  return (
    <View style={styles.folio}>
      <View style={[styles.folioRule, { backgroundColor: colors.border }]} />
      <Text style={[styles.folioText, { color: colors.border }]}>
        BERKELEY ARCHITECTURAL HERITAGE · FIELD FOLIO · 2026
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screenHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  coverFrame: {
    borderWidth: 1.5,
    padding: 18,
    paddingBottom: 16,
    borderRadius: 2,
  },
  coverRule: {
    position: "absolute",
    top: 5,
    left: 5,
    right: 5,
    bottom: 5,
    borderWidth: 0.75,
    borderColor: "rgba(43,58,103,0.45)",
    borderRadius: 1,
  },
  coverRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  coverKicker: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 2.2,
    marginBottom: 8,
  },
  hanko: {
    width: 52,
    borderRadius: 4,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#B14A38",
    shadowOpacity: 0.35,
    shadowRadius: 3,
    shadowOffset: { width: 1, height: 2 },
    elevation: 3,
    transform: [{ rotate: "-3deg" }],
  },
  hankoGlyph: {
    color: "#F2F0E6",
    fontSize: 26,
    fontWeight: "700",
    lineHeight: 30,
  },
  hankoSub: {
    color: "#F2F0E6",
    fontSize: 6.5,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginTop: 2,
  },
  underlineRule: {
    width: 56,
    height: 3,
    marginTop: 10,
    marginBottom: 10,
  },
  tocLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.5,
    textTransform: "uppercase",
    marginTop: 18,
    marginBottom: 2,
  },
  screenTitle: {
    fontSize: 44,
    fontWeight: "600",
    fontFamily: "SourceSerif4_600SemiBold",
    letterSpacing: -0.5,
    lineHeight: 46,
  },
  screenSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 2,
  },
  folio: {
    alignItems: "center",
    marginTop: 28,
    gap: 8,
  },
  folioRule: {
    width: 48,
    height: StyleSheet.hairlineWidth,
  },
  folioText: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 2,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  tourCard: {
    borderRadius: 6,
    overflow: "hidden",
    borderWidth: 1,
  },
  accentBar: {
    height: 2,
  },
  cardContent: {
    padding: 18,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  tourIcon: {
    width: 44,
    height: 44,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitleArea: {
    flex: 1,
  },
  tourName: {
    fontSize: 17,
    fontWeight: "600",
    fontFamily: "SourceSerif4_600SemiBold",
    lineHeight: 22,
  },
  tourNeighborhood: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    fontWeight: "500",
  },
  plateNo: {
    fontSize: 11,
    fontStyle: "italic",
    fontFamily: Platform.select({ ios: "ui-serif", default: "serif" }),
    letterSpacing: 0.5,
  },
  tourDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  cardFooter: {
    flexDirection: "row",
    gap: 16,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statText: {
    fontSize: 11,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
});
