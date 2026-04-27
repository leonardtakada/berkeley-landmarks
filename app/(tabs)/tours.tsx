import React from "react";
import { Text, View, FlatList, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
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
          borderColor: colors.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      {/* Color accent bar */}
      <View style={[styles.accentBar, { backgroundColor: tour.color }]} />

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
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  screenTitle: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  screenSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 4,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  tourCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  accentBar: {
    height: 4,
  },
  cardContent: {
    padding: 16,
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
    marginBottom: 12,
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
