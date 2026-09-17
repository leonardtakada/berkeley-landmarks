import React, { useState, useMemo } from "react";
import {
  Text,
  View,
  FlatList,
  Pressable,
  TextInput,
  StyleSheet,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  landmarks,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  type Landmark,
  type LandmarkCategory,
} from "@/data/landmarks";

const ALL_CATEGORIES: LandmarkCategory[] = [
  "civic",
  "residential",
  "religious",
  "commercial",
  "educational",
  "cultural",
];

type SortOption = "name" | "year" | "architect" | "neighborhood";

function LandmarkRow({ landmark }: { landmark: Landmark }) {
  const router = useRouter();
  const colors = useColors();
  const catColor = CATEGORY_COLORS[landmark.category];

  return (
    <Pressable
      onPress={() => router.push(`/landmark/${landmark.id}`)}
      style={({ pressed }) => [
        styles.landmarkRow,
        {
          backgroundColor: colors.surface,
          opacity: pressed ? 0.85 : 1,
          ...Platform.select({
            ios: {
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.06,
              shadowRadius: 4,
            },
            android: { elevation: 1 },
            web: { boxShadow: "0 1px 4px rgba(0,0,0,0.06)" },
          }),
        },
      ]}
    >
      <View style={[styles.catIndicator, { backgroundColor: catColor }]} />
      <View style={styles.rowContent}>
        <Text style={[styles.rowName, { color: colors.foreground }]} numberOfLines={1}>
          {landmark.name}
        </Text>
        <Text style={[styles.rowAddress, { color: colors.muted }]} numberOfLines={1}>
          {landmark.address}
        </Text>
        <View style={styles.rowMeta}>
          <Text style={[styles.rowMetaText, { color: colors.muted }]}>
            {landmark.architect} · {landmark.yearBuilt}
          </Text>
        </View>
      </View>
      <View style={styles.rowRight}>
        {landmark.nationalRegister && (
          <View style={styles.nrBadge}>
            <IconSymbol name="star.fill" size={10} color="#FF9500" />
          </View>
        )}
        <IconSymbol name="chevron.right" size={14} color={colors.muted} />
      </View>
    </Pressable>
  );
}

export default function LandmarksScreen() {
  const colors = useColors();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<LandmarkCategory | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("name");

  const filteredLandmarks = useMemo(() => {
    let result = [...landmarks];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.architect.toLowerCase().includes(q) ||
          l.address.toLowerCase().includes(q) ||
          l.neighborhood.toLowerCase().includes(q) ||
          l.style.toLowerCase().includes(q)
      );
    }

    if (selectedCategory) {
      result = result.filter((l) => l.category === selectedCategory);
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "year":
          return (parseInt(a.yearBuilt) || 0) - (parseInt(b.yearBuilt) || 0);
        case "architect":
          return a.architect.localeCompare(b.architect);
        case "neighborhood":
          return a.neighborhood.localeCompare(b.neighborhood);
        default:
          return 0;
      }
    });

    return result;
  }, [searchQuery, selectedCategory, sortBy]);

  return (
    <ScreenContainer>
      <View style={styles.screenHeader}>
        <Text style={[styles.screenTitle, { color: colors.foreground }]}>Landmarks</Text>
        <Text style={[styles.screenSubtitle, { color: colors.muted }]}>
          {landmarks.length} designated landmarks in Berkeley
        </Text>
      </View>

      <View style={[styles.searchBar, { backgroundColor: Platform.select({ ios: 'rgba(142,142,147,0.12)', default: colors.surface }) }]}>
        <IconSymbol name="magnifyingglass" size={18} color={colors.muted} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Search landmarks, architects, styles..."
          placeholderTextColor={colors.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="done"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery("")}>
            <IconSymbol name="xmark" size={16} color={colors.muted} />
          </Pressable>
        )}
      </View>

      <FlatList
        horizontal
        data={[null, ...ALL_CATEGORIES]}
        keyExtractor={(item) => item ?? "all"}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryScroll}
        renderItem={({ item: cat }) => {
          const isActive = cat === selectedCategory || (cat === null && selectedCategory === null);
          const chipColor = cat ? CATEGORY_COLORS[cat] : colors.primary;
          return (
            <Pressable
              onPress={() => setSelectedCategory(cat)}
              style={({ pressed }) => [
                styles.catChip,
                {
                  backgroundColor: isActive ? chipColor : Platform.select({ ios: 'rgba(142,142,147,0.12)', default: colors.surface }),
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.catChipText,
                  { color: isActive ? "#FFFFFF" : colors.foreground },
                ]}
              >
                {cat ? CATEGORY_LABELS[cat] : "All"}
              </Text>
            </Pressable>
          );
        }}
      />

      <View style={styles.sortRow}>
        <Text style={[styles.sortLabel, { color: colors.muted }]}>Sort by:</Text>
        {(["name", "year", "architect", "neighborhood"] as SortOption[]).map((opt) => (
          <Pressable
            key={opt}
            onPress={() => setSortBy(opt)}
            style={({ pressed }) => [
              styles.sortChip,
              {
                backgroundColor: sortBy === opt ? colors.primary + '18' : "transparent",
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.sortChipText,
                { color: sortBy === opt ? colors.primary : colors.muted },
              ]}
            >
              {opt.charAt(0).toUpperCase() + opt.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.resultsRow}>
        <Text style={[styles.resultsText, { color: colors.muted }]}>
          {filteredLandmarks.length} landmark{filteredLandmarks.length !== 1 ? "s" : ""}
        </Text>
      </View>

      <FlatList
        data={filteredLandmarks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <LandmarkRow landmark={item} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <IconSymbol name="magnifyingglass" size={40} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              No landmarks found matching your search
            </Text>
          </View>
        }
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screenHeader: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  screenTitle: {
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  screenSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 2,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 20,
    padding: 0,
  },
  categoryScroll: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  catChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 4,
    marginBottom: 8,
  },
  sortLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginRight: 4,
  },
  sortChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  sortChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  resultsRow: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  resultsText: {
    fontSize: 12,
    fontWeight: "500",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  landmarkRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    overflow: "hidden",
  },
  catIndicator: {
    width: 4,
    alignSelf: "stretch",
  },
  rowContent: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  rowName: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
  },
  rowAddress: {
    fontSize: 14,
    lineHeight: 18,
    marginTop: 2,
  },
  rowMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 6,
  },
  rowMetaText: {
    fontSize: 13,
    lineHeight: 16,
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingRight: 14,
  },
  nrBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FF950022",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    textAlign: "center",
  },
});
