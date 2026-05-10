import React, { useRef, useState, useCallback, useMemo } from "react";
import {
  Text,
  View,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
  Image,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import MapViewWrapper, { MapMarker, MapPolyline } from "@/components/map-view-wrapper";
import {
  landmarks,
  BERKELEY_CENTER,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  type LandmarkCategory,
  type Landmark,
} from "@/data/landmarks";
import { tours } from "@/data/tours";

const ALL_CATEGORIES: LandmarkCategory[] = [
  "civic",
  "residential",
  "religious",
  "commercial",
  "educational",
  "cultural",
];

export default function MapScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tourId?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<any>(null);

  const [selectedLandmark, setSelectedLandmark] = useState<Landmark | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<LandmarkCategory>>(
    new Set(ALL_CATEGORIES)
  );
  const [activeTourId, setActiveTourId] = useState<string | null>(
    params.tourId ?? null
  );

  const activeTour = useMemo(
    () => (activeTourId ? tours.find((t) => t.id === activeTourId) : null),
    [activeTourId]
  );

  const tourStopIds = useMemo(
    () => new Set(activeTour?.stops.map((s) => s.landmarkId) ?? []),
    [activeTour]
  );

  const filteredLandmarks = useMemo(() => {
    if (activeTour) {
      return landmarks.filter((l) => tourStopIds.has(l.id));
    }
    return landmarks.filter((l) => activeCategories.has(l.category));
  }, [activeCategories, activeTour, tourStopIds]);

  const toggleCategory = useCallback((cat: LandmarkCategory) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        if (next.size > 1) next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }, []);

  const handleMarkerPress = useCallback((landmark: Landmark) => {
    setSelectedLandmark(landmark);
  }, []);

  const handleMapPress = useCallback(() => {
    setSelectedLandmark(null);
  }, []);

  const clearTour = useCallback(() => {
    setActiveTourId(null);
    setSelectedLandmark(null);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MapViewWrapper
        ref={mapRef}
        style={styles.map}
        initialRegion={BERKELEY_CENTER}
        minZoomLevel={12}
        maxZoomLevel={20}
        region={undefined}
        onPress={handleMapPress}
        showsUserLocation
        showsCompass
        showsScale
        mapType="standard"
      >
        {filteredLandmarks.map((landmark) => (
          <MapMarker
            key={landmark.id}
            coordinate={{
              latitude: landmark.latitude,
              longitude: landmark.longitude,
            }}
            title={landmark.name}
            description={landmark.address}
            onPress={() => handleMarkerPress(landmark)}
            pinColor={CATEGORY_COLORS[landmark.category]}
            tracksViewChanges={false}
            tracksInfoWindowChanges={false}
          />
        ))}

        {activeTour && activeTour.routeCoordinates.length > 1 && (
          <MapPolyline
            coordinates={activeTour.routeCoordinates}
            strokeColor={activeTour.color}
            strokeWidth={4}
            lineDashPattern={[0]}
          />
        )}
      </MapViewWrapper>

      {/* Filter Chips - only show when no tour active */}
      {!activeTour && (
        <View style={[styles.filterContainer, { top: insets.top + 12 }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
          >
            {ALL_CATEGORIES.map((cat) => {
              const isActive = activeCategories.has(cat);
              return (
                <Pressable
                  key={cat}
                  onPress={() => toggleCategory(cat)}
                  style={({ pressed }) => [
                    styles.filterChip,
                    {
                      backgroundColor: isActive ? CATEGORY_COLORS[cat] : colors.surface,
                      borderColor: isActive ? CATEGORY_COLORS[cat] : colors.border,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.chipDot,
                      { backgroundColor: isActive ? "#FFFFFF" : CATEGORY_COLORS[cat] },
                    ]}
                  />
                  <Text
                    style={[
                      styles.chipText,
                      { color: isActive ? "#FFFFFF" : colors.foreground },
                    ]}
                  >
                    {CATEGORY_LABELS[cat]}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Tour Banner */}
      {activeTour && (
        <View style={[styles.tourBanner, { top: insets.top + 12 }]}>
          <LinearGradient
            colors={[activeTour.color + 'F0', activeTour.color + 'D0']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.tourBannerGradient}
          >
            <View style={styles.tourBannerContent}>
              <IconSymbol name="figure.walk" size={16} color="#FFFFFF" />
              <Text style={styles.tourBannerText} numberOfLines={1}>
                {activeTour.name}
              </Text>
            </View>
            <Pressable
              onPress={clearTour}
              style={({ pressed }) => [styles.tourBannerClose, { opacity: pressed ? 0.7 : 1 }]}
            >
              <IconSymbol name="xmark" size={16} color="#FFFFFF" />
            </Pressable>
          </LinearGradient>
        </View>
      )}

      {/* Bottom Sheet - Landmark Preview */}
      {selectedLandmark && (
        <View
          style={[
            styles.bottomSheet,
            {
              backgroundColor: Platform.select({
                ios: 'rgba(255,255,255,0.88)',
                android: colors.surface,
                default: 'rgba(255,255,255,0.88)',
              }),
              paddingBottom: Math.max(insets.bottom, 16) + 60,
            },
          ]}
        >
          <View style={styles.sheetHandle}>
            <View style={[styles.handleBar, { backgroundColor: colors.muted + '40' }]} />
          </View>
          <View style={styles.sheetContent}>
            {selectedLandmark.photoUrl ? (
              <Image
                source={{ uri: selectedLandmark.photoUrl }}
                style={styles.sheetPhoto}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.sheetPhotoPlaceholder, { backgroundColor: colors.background }]}>
                <IconSymbol name="building.2.fill" size={28} color={colors.muted} />
              </View>
            )}
            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleRow}>
                <View
                  style={[
                    styles.sheetCatDot,
                    { backgroundColor: CATEGORY_COLORS[selectedLandmark.category] },
                  ]}
                />
                <Text style={[styles.sheetName, { color: colors.foreground }]} numberOfLines={2}>
                  {selectedLandmark.name}
                </Text>
              </View>
              <Pressable
                onPress={() => setSelectedLandmark(null)}
                style={({ pressed }) => [
                  styles.sheetClose,
                  { backgroundColor: colors.background, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <IconSymbol name="xmark" size={14} color={colors.muted} />
              </Pressable>
            </View>
            <Text style={[styles.sheetAddress, { color: colors.muted }]}>
              {selectedLandmark.address}, Berkeley, CA
            </Text>
            <View style={styles.sheetMeta}>
              <Text style={[styles.sheetMetaText, { color: colors.muted }]}>
                {selectedLandmark.architect} · {selectedLandmark.yearBuilt}
              </Text>
              {selectedLandmark.nationalRegister && (
                <View style={styles.nrBadge}>
                  <IconSymbol name="star.fill" size={10} color="#FF9500" />
                  <Text style={styles.nrText}>NR</Text>
                </View>
              )}
            </View>
            {selectedLandmark.description && (
              <Text
                style={[styles.sheetDescription, { color: colors.muted }]}
                numberOfLines={2}
              >
                {selectedLandmark.description}
              </Text>
            )}
            <Pressable
              onPress={() => {
                setSelectedLandmark(null);
                router.push(`/landmark/${selectedLandmark.id}`);
              }}
              style={({ pressed }) => [
                styles.detailButton,
                { opacity: pressed ? 0.9 : 1 },
              ]}
            >
              <LinearGradient
                colors={['#7B8B6F', '#6B7B5F']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.detailButtonGradient}
              >
                <Text style={styles.detailButtonText}>View Details</Text>
                <IconSymbol name="chevron.right" size={14} color="#FFFFFF" />
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  filterContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 10,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
      },
      android: { elevation: 1 },
      web: { boxShadow: "0 1px 4px rgba(0,0,0,0.04)" },
    }),
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  tourBanner: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: 14,
    zIndex: 10,
    overflow: "hidden",
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
  tourBannerGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tourBannerContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tourBannerText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  tourBannerClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  bottomSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: { elevation: 4 },
      web: { boxShadow: "0 -2px 12px rgba(0,0,0,0.06)" },
    }),
  },
  sheetHandle: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 6,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  sheetContent: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  sheetPhoto: {
    width: '100%',
    height: 140,
    borderRadius: 12,
    marginBottom: 12,
  },
  sheetPhotoPlaceholder: {
    width: '100%',
    height: 80,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetDescription: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  sheetTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
  },
  sheetCatDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  sheetName: {
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 26,
    letterSpacing: -0.2,
    flex: 1,
  },
  sheetClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  sheetAddress: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    marginLeft: 22,
  },
  sheetMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    marginLeft: 22,
    gap: 8,
  },
  sheetMetaText: {
    fontSize: 13,
    lineHeight: 18,
  },
  nrBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: '#C4956A22',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  nrText: {
    fontSize: 11,
    fontWeight: "700",
    color: '#C4956A',
  },
  detailButton: {
    marginTop: 14,
    borderRadius: 12,
    overflow: "hidden",
  },
  detailButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 6,
  },
  detailButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
