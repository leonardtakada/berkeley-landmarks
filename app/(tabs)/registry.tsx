import React, { useRef, useState, useMemo } from "react";
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
import Svg, { Circle, Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenContainer } from "@/components/screen-container";
import { PageFlip } from "@/components/page-flip";
import { PaperGrain } from "@/components/paper-grain";
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

const SERIF = Platform.select({ ios: "Georgia", default: "serif" });
const SERIF_BOLD = Platform.select({ ios: "Georgia-Bold", default: "serif" });
const SERIF_SEMI = "SourceSerif4_600SemiBold";

/** Ornamental rule: hairline — diamond — hairline (printer's divider). */

/**
 * Hand-drawn-style ink vignette: Sather Tower (the Campanile) rising over
 * the Berkeley hills, scratchy line art like a Showa-era guidebook plate.
 * Pure stroke paths — no fills except the distant sun.
 */

/**
 * Hanko-style stamped seal accent: a small square red seal in the corner
 * of the plate, like a collector's mark on a vintage cover.
 */

/** Book-styled CTA: bordered serif button with a corner tick. */

const LandmarkRow = React.memo(function LandmarkRow({ landmark, colors }: { landmark: Landmark; colors: ReturnType<typeof useColors> }) {
  const router = useRouter();
  const catColor = CATEGORY_COLORS[landmark.category];
  const rowStyle = useMemo(() => ({
    backgroundColor: colors.surface,
    borderRadius: 6,
    overflow: "hidden" as const,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    borderWidth: 1,
    borderColor: colors.border,
  }), [colors.surface, colors.border]);

  return (
    <Pressable
      onPress={() => router.push(`/landmark/${landmark.id}`)}
      style={({ pressed }) => [
        rowStyle,
        { opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={[styles.catIndicator, { backgroundColor: catColor, opacity: 0.8 }]} />
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
          <View style={[styles.nrBadge, { backgroundColor: colors.accent + '22' }]}>
            <IconSymbol name="star.fill" size={10} color={colors.accent} />
          </View>
        )}
        <IconSymbol name="chevron.right" size={14} color={colors.muted} />
      </View>
    </Pressable>
  );
});

export default function LandmarksScreen() {
  const colors = useColors();
  // The bookmark bar hangs at the top; pad the list bottom by the safe inset.
  const insets = useSafeAreaInsets();
  const listBottomPadding = Math.max(insets.bottom, 12) + 24;
  const listRef = useRef<FlatList<Landmark>>(null);
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
      <PageFlip direction={1}>
      <PaperGrain />
      <FlatList
        ref={listRef}
        data={filteredLandmarks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <LandmarkRow landmark={item} colors={colors} />}
        initialNumToRender={20}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
        ListHeaderComponent={
          <View>
            <View style={styles.screenHeader}>
              <Text style={[styles.screenTitle, { color: colors.foreground }]}>
                THE REGISTRY
              </Text>
              <Text style={[styles.screenSubtitle, { color: colors.muted }]}>
                {landmarks.length} designated landmarks in Berkeley
              </Text>
            </View>
            <View
              style={[
                styles.searchBar,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.searchGlyph, { color: colors.muted }]}>⌕</Text>
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
                        borderColor: isActive ? chipColor : colors.border,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.catChipText,
                        { color: isActive ? colors.foreground : colors.muted },
                      ]}
                    >
                      {cat ? CATEGORY_LABELS[cat].toUpperCase() : "ALL"}
                    </Text>
                  </Pressable>
                );
              }}
            />
            <View style={styles.sortRow}>
              <Pressable
                onPress={() => {
                  const opts: SortOption[] = ["name", "year", "architect", "neighborhood"];
                  const idx = opts.indexOf(sortBy);
                  setSortBy(opts[(idx + 1) % opts.length]);
                }}
                style={({ pressed }) => [
                  styles.sortChip,
                  { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={[styles.sortChipText, { color: colors.primary }]}>
                  SORT · {sortBy.toUpperCase()}
                </Text>
              </Pressable>
              <View style={{ flex: 1 }} />
              <Text style={[styles.resultsText, { color: colors.muted }]}>
                {filteredLandmarks.length} landmark{filteredLandmarks.length !== 1 ? "s" : ""}
              </Text>
            </View>
          </View>
        }
        contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPadding }]}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListFooterComponent={<FolioFooter />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <IconSymbol name="magnifyingglass" size={40} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              No landmarks found matching your search
            </Text>
          </View>
        }
      />
      </PageFlip>
    </ScreenContainer>
  );
}

function FolioFooter() {
  const colors = useColors();
  return (
    <View style={styles.folio}>
      <View style={[styles.folioRule, { backgroundColor: colors.border }]} />
      <Text style={[styles.folioText, { color: colors.border }]}>
        THE REGISTRY · BERKELEY · CALIFORNIA
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // ---- Cover ----
  cover: {
    marginHorizontal: 12,
    marginTop: 16,
    marginBottom: 8,
    padding: 4,
  },
  coverFrame: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 2.5,
  },
  coverFrameInner: {
    position: "absolute",
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  coverContent: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
    gap: 0,
  },
  coverKicker: {
    fontFamily: SERIF,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 3,
    marginBottom: 22,
  },
  coverTitleBlock: {
    alignItems: "center",
  },
  coverTitle: {
    fontFamily: SERIF_BOLD,
    fontSize: 52,
    letterSpacing: 10,
    textAlign: "center",
  },
  coverSubtitle: {
    fontFamily: SERIF,
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: 12,
    marginTop: 10,
    paddingRight: 12, // optically re-center tracked small caps
  },
  coverDedication: {
    fontFamily: SERIF,
    fontSize: 13,
    fontStyle: "italic",
    lineHeight: 19,
    textAlign: "center",
    marginTop: 14,
  },
  plateWrap: {
    width: "100%",
    alignItems: "center",
    marginTop: 26,
  },
  plateCaption: {
    fontFamily: SERIF,
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 2,
    marginTop: 6,
  },
  seal: {
    position: "absolute",
    right: 18,
    top: 12,
    width: 34,
    height: 34,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "-6deg" }],
    opacity: 0.85,
  },
  sealInner: {
    width: 22,
    height: 22,
    borderWidth: 1,
    transform: [{ rotate: "45deg" }],
  },
  sealDot: {
    position: "absolute",
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  coverBtnRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 30,
  },
  coverBtn: {
    borderWidth: 1.5,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  coverBtnText: {
    fontFamily: SERIF_SEMI,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 2.5,
  },
  coverBtnTextGhost: {},
  coverImprint: {
    fontFamily: SERIF,
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 2.5,
    marginTop: 26,
  },
  // ---- Ornamental rule ----
  ruleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    marginBottom: 4,
  },
  ruleLine: {
    height: StyleSheet.hairlineWidth * 2,
  },
  ruleDiamond: {
    width: 7,
    height: 7,
    borderWidth: 1,
    transform: [{ rotate: "45deg" }],
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

  headerTopSpacer: {
    paddingTop: 12,
  },
  screenHeader: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 20,
  },
  screenTitle: {
    fontFamily: SERIF_SEMI,
    fontSize: 22,
    letterSpacing: 4,
    marginBottom: 4,
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 2,
    gap: 10,
  },
  searchGlyph: {
    fontSize: 16,
    lineHeight: 20,
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
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
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 3,
    marginRight: 8,
  },
  catChipText: {
    fontSize: 11,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
    sortChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 2,
  },
  sortChipText: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
  },
  resultsRow: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  resultsText: {
    fontSize: 11,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  landmarkRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 6,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.02,
        shadowRadius: 2,
      },
      android: { elevation: 1 },
      web: { boxShadow: "0 1px 2px rgba(0,0,0,0.02)" },
    }),
  },
  catIndicator: {
    width: 3,
    alignSelf: "stretch",
  },
  rowContent: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
  rowName: {
    fontSize: 16,
    fontWeight: "600",
    fontFamily: "SourceSerif4_600SemiBold",
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
    fontSize: 11,
    lineHeight: 14,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: "500",
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
