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
import { useBottomTabBarHeight } from "expo-router/build/react-navigation/bottom-tabs";
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
function OrnamentalRule({ color, accent, width = 180 }: { color: string; accent: string; width?: number }) {
  return (
    <View style={[styles.ruleRow, { width }]}>
      <View style={[styles.ruleLine, { backgroundColor: color, flex: 1 }]} />
      <View style={[styles.ruleDiamond, { borderColor: accent }]} />
      <View style={[styles.ruleDiamond, { borderColor: color }]} />
      <View style={[styles.ruleDiamond, { borderColor: accent }]} />
      <View style={[styles.ruleLine, { backgroundColor: color, flex: 1 }]} />
    </View>
  );
}

/**
 * Hand-drawn-style ink vignette: Sather Tower (the Campanile) rising over
 * the Berkeley hills, scratchy line art like a Showa-era guidebook plate.
 * Pure stroke paths — no fills except the distant sun.
 */
function CampanileVignette({ ink, accent }: { ink: string; accent: string }) {
  const w = 300;
  const h = 190;
  return (
    <Svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      {/* distant sun — the only accent mark, like a two-color print */}
      <Circle cx={228} cy={40} r={15} fill={accent} opacity={0.85} />
      <Circle cx={228} cy={40} r={20} stroke={accent} strokeWidth={0.75} opacity={0.4} />

      {/* hills behind the campus — layered arcs with slightly wavering strokes */}
      <Path
        d="M8 138 C 40 118, 78 112, 112 122 C 148 132, 176 118, 208 110 C 244 101, 272 108, 292 118"
        stroke={ink}
        strokeWidth={1.1}
        opacity={0.55}
      />
      <Path
        d="M14 150 C 52 136, 92 132, 128 140 C 162 148, 200 136, 236 130 C 258 126, 276 128, 290 132"
        stroke={ink}
        strokeWidth={1.3}
        opacity={0.75}
      />
      {/* eucalyptus-ish trees on the ridge */}
      <Path d="M52 133 q 2 -12 0 -18 M56 133 q 4 -10 8 -14 M48 133 q -4 -9 -8 -12" stroke={ink} strokeWidth={1} opacity={0.6} />
      <Path d="M240 124 q 2 -11 0 -16 M245 124 q 4 -9 8 -12" stroke={ink} strokeWidth={1} opacity={0.55} />

      {/* the Campanile: slender tower, stepped head, clock, open arcades */}
      {/* shaft */}
      <Path d="M136 150 L138 62 L160 62 L162 150" stroke={ink} strokeWidth={1.6} />
      <Path d="M141 150 L142 62 M157 150 L156 62" stroke={ink} strokeWidth={0.7} opacity={0.5} />
      {/* clock stage */}
      <Path d="M133 62 L165 62" stroke={ink} strokeWidth={1.6} />
      <Path d="M134 48 L164 48" stroke={ink} strokeWidth={1.6} />
      <Path d="M133 62 L134 48 M165 62 L164 48" stroke={ink} strokeWidth={1.2} />
      {/* clock face */}
      <Circle cx={139} cy={55} r={4.6} stroke={ink} strokeWidth={1.1} />
      <Path d="M139 55 l0 -3 M139 55 l2.6 1.4" stroke={ink} strokeWidth={0.9} />
      <Circle cx={159} cy={55} r={4.6} stroke={ink} strokeWidth={1.1} />
      <Path d="M159 55 l0 -3 M159 55 l2.6 1.4" stroke={ink} strokeWidth={0.9} />
      {/* stepped crown */}
      <Path d="M132 48 L132 40 L136 40 L136 34 L162 34 L162 40 L166 40 L166 48" stroke={ink} strokeWidth={1.4} />
      {/* lantern + finial */}
      <Path d="M141 34 L141 26 L159 26 L159 34" stroke={ink} strokeWidth={1.3} />
      <Path d="M150 26 L150 14" stroke={ink} strokeWidth={1.1} />
      <Path d="M150 14 l-4 3 M150 14 l4 3 M150 14 l0 4" stroke={ink} strokeWidth={1} />
      {/* base colonnade */}
      <Path d="M120 150 L120 140 L178 140 L178 150" stroke={ink} strokeWidth={1.3} />
      <Path d="M126 150 L126 140 M133 150 L133 140 M167 150 L167 140 M174 150 L174 140" stroke={ink} strokeWidth={0.8} opacity={0.6} />

      {/* ground line with hatching */}
      <Path d="M18 150 C 80 147, 200 153, 284 149" stroke={ink} strokeWidth={1.6} />
      <Path
        d="M30 158 l6 -6 M60 158 l6 -6 M90 158 l6 -6 M120 158 l6 -6 M150 158 l6 -6 M180 158 l6 -6 M210 158 l6 -6 M240 158 l6 -6 M270 158 l6 -6"
        stroke={ink}
        strokeWidth={0.8}
        opacity={0.45}
      />
    </Svg>
  );
}

/**
 * Hanko-style stamped seal accent: a small square red seal in the corner
 * of the plate, like a collector's mark on a vintage cover.
 */
function StampedSeal({ accent }: { accent: string }) {
  return (
    <View style={[styles.seal, { borderColor: accent }]} pointerEvents="none">
      <View style={[styles.sealInner, { borderColor: accent }]} />
      <View style={[styles.sealDot, { backgroundColor: accent }]} />
    </View>
  );
}

/** Book-styled CTA: bordered serif button with a corner tick. */
function CoverButton({
  label,
  onPress,
  primary,
  fg,
  bg,
  border,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  fg: string;
  bg: string;
  border: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.coverBtn,
        { borderColor: primary ? fg : border, opacity: pressed ? 0.8 : 1, backgroundColor: primary ? bg : "transparent" },
      ]}
    >
      <Text
        style={[
          styles.coverBtnText,
          { color: primary ? fg : border },
          !primary && styles.coverBtnTextGhost,
        ]}
      >
        {label.toUpperCase()}
      </Text>
    </Pressable>
  );
}

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
  const router = useRouter();
  const tabBarHeight = useBottomTabBarHeight();
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

  /** Scroll from the cover down into the registry proper. */
  const openRegistry = () => {
    listRef.current?.scrollToOffset({ offset: 340, animated: true });
  };

  const ink = colors.foreground;

  /**
   * The COVER: a 1930s Japanese travel-guide front board — double-ruled
   * frame, spaced serif capitals, ornamental diamond rule, an ink line-art
   * plate of the Campanile over the hills, and a hanko-style seal.
   */
  const Cover = (
    <View style={styles.cover}>
      <View style={[styles.coverFrame, { borderColor: ink }]} />
      <View style={[styles.coverFrameInner, { borderColor: ink }]} />
      <View style={styles.coverContent}>
        <Text style={[styles.coverKicker, { color: colors.accent }]}>
          A FIELD GUIDE IN THE OLD MANNER
        </Text>

        <View style={styles.coverTitleBlock}>
          <Text style={[styles.coverTitle, { color: ink }]}>BERKELEY</Text>
          <OrnamentalRule color={ink} accent={colors.accent} />
          <Text style={[styles.coverSubtitle, { color: ink }]}>TOURS</Text>
        </View>

        <Text style={[styles.coverDedication, { color: colors.muted }]}>
          Being an illustrated companion to the town's
        </Text>
        <Text style={[styles.coverDedication, { color: colors.muted }]}>
          landmarks, walks &amp; quiet corners
        </Text>

        <View style={styles.plateWrap}>
          <CampanileVignette ink={ink} accent={colors.accent} />
          <StampedSeal accent={colors.accent} />
          <Text style={[styles.plateCaption, { color: colors.muted }]}>
            PLATE I — THE CAMPANILE &amp; THE HILLS
          </Text>
        </View>

        <View style={styles.coverBtnRow}>
          <CoverButton
            label="Open the Registry"
            primary
            fg={ink}
            bg={colors.background}
            border={colors.border}
            onPress={openRegistry}
          />
          <CoverButton
            label="Browse the Tours"
            fg={ink}
            bg={colors.background}
            border={colors.muted}
            onPress={() => router.push("/(tabs)/tours" as never)}
          />
        </View>

        <Text style={[styles.coverImprint, { color: colors.muted }]}>
          BERKELEY · CALIFORNIA · MCMXIV
        </Text>
      </View>
    </View>
  );

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
            {Cover}
            <View style={styles.screenHeader}>
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
        contentContainerStyle={[styles.listContent, { paddingBottom: tabBarHeight + 24 }]}
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
