import React from "react";
import { Text, View, FlatList, Pressable, StyleSheet, Platform } from "react-native";
// Platform already imported
import { useRouter } from "expo-router";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { tours } from "@/data/tours";
import type { Tour } from "@/data/tours";

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
          <Text style={[styles.plateNo, { color: colors.border }]}>No. {String(tourIndex + 1).padStart(2, "0")}</Text>
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
        <Text style={[styles.screenTitle, { color: colors.foreground }]}>Walking Tours</Text>
        <Text style={[styles.screenSubtitle, { color: colors.muted }]}>
          Explore Berkeley&apos;s architectural heritage with BAHA-inspired walking tours
        </Text>
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
  screenTitle: {
    fontSize: 36,
    fontWeight: "600",
    fontFamily: "SourceSerif4_600SemiBold",
    letterSpacing: -0.3,
    lineHeight: 42,
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
