import React from "react";
import { Text, View, FlatList, Pressable, StyleSheet, Platform } from "react-native";
// Platform already imported
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { tours } from "@/data/tours";
import type { Tour } from "@/data/tours";

function TourCard({ tour }: { tour: Tour }) {
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
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {/* Gradient accent bar */}
      <LinearGradient
        colors={[tour.color, tour.color + 'AA']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.accentBar}
      />

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
              {tour.neighborhood}
            </Text>
          </View>
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
        renderItem={({ item }) => <TourCard tour={item} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      />
    </ScreenContainer>
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
    fontWeight: "800",
    fontFamily: Platform.select({ ios: "ui-serif", default: "serif" }),
    letterSpacing: -0.5,
    lineHeight: 42,
  },
  screenSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 2,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  tourCard: {
    borderRadius: 14,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: { elevation: 1 },
      web: { boxShadow: "0 1px 4px rgba(0,0,0,0.05)" },
    }),
  },
  accentBar: {
    height: 4,
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
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitleArea: {
    flex: 1,
  },
  tourName: {
    fontSize: 17,
    fontWeight: "700",
    fontFamily: Platform.select({ ios: "ui-serif", default: "serif" }),
    lineHeight: 22,
  },
  tourNeighborhood: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
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
    fontSize: 12,
    fontWeight: "600",
  },
});
