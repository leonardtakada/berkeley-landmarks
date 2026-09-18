import React, { useRef, useState, useCallback, useEffect, useMemo } from "react";
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
import { CategoryPlaceholder } from "@/components/category-placeholder";
import MapViewWrapper, { MapPolyline, MapPolygon } from "@/components/map-view-wrapper";
import MapLibreMapView, {
  MapPolyline as VectorMapPolyline,
} from "@/components/maplibre-view";
import { useMapEngine } from "@/constants/map-engine";
import {
  landmarks,
  BERKELEY_CENTER,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  type LandmarkCategory,
  type Landmark,
} from "@/data/landmarks";
import { BERKELEY_BOUNDARY } from "@/data/berkeley-boundary";
import { tours } from "@/data/tours";
import { useTourFollow } from "@/hooks/use-tour-follow";
import { TourFollowCard } from "@/components/tour-follow-card";

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
  const { isMapLibre, toggleEngine, ready: engineReady } = useMapEngine();

  const [selectedLandmark, setSelectedLandmark] = useState<Landmark | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<LandmarkCategory>>(
    new Set(ALL_CATEGORIES)
  );
  const [activeTourId, setActiveTourId] = useState<string | null>(
    params.tourId ?? null
  );

  // Tabs stay mounted, so a fresh "View Route on Map" push arrives as a
  // param change on an already-mounted screen — sync it.
  useEffect(() => {
    if (params.tourId !== undefined) {
      setActiveTourId(params.tourId as string);
      setSelectedLandmark(null);
    }
  }, [params.tourId]);

  const activeTour = useMemo(
    () => (activeTourId ? tours.find((t) => t.id === activeTourId) : null),
    [activeTourId]
  );
  const tourFollow = useTourFollow(activeTour ?? null);

  // Focus the whole tour route when a tour becomes active on the map.
  const tourIdForFocus = activeTour?.id;
  useEffect(() => {
    if (!activeTour || !mapRef.current?.fitCoords) return;
    const coords = activeTour.routeCoordinates.length
      ? activeTour.routeCoordinates
      : activeTour.stops.map((s) => {
          const l = landmarks.find((lm) => lm.id === s.landmarkId);
          return { latitude: l!.latitude, longitude: l!.longitude };
        });
    if (coords.length < 2) return;
    // Small delay: the MapLibre view may still be (re)mounting when the
    // tab first opens, and camera calls before mount are dropped.
    const t = setTimeout(() => mapRef.current?.fitCoords?.(coords), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refocus only when the tour changes
  }, [tourIdForFocus]);

  // Follow the current stop as the user cycles through landmarks.
  const currentStopIndex = tourFollow.currentStopIndex;
  useEffect(() => {
    if (!activeTour) return;
    const stop = tourFollow.stops[currentStopIndex];
    if (!stop) return;
    const t = setTimeout(() => {
      mapRef.current?.flyToCoord?.(
        {
          latitude: stop.landmark.latitude,
          longitude: stop.landmark.longitude,
        },
        16
      );
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- camera command, values read fresh
  }, [activeTour?.id, currentStopIndex]);

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
      {isMapLibre ? (
        <MapLibreMapView
        ref={mapRef}
        style={styles.map}
        initialRegion={BERKELEY_CENTER}
        minZoomLevel={12}
        maxZoomLevel={17}
        onPress={handleMapPress}
        showsUserLocation
        clusterMarkers={filteredLandmarks.map((landmark) => ({
          id: landmark.id,
          coordinate: { latitude: landmark.latitude, longitude: landmark.longitude },
          pinColor: CATEGORY_COLORS[landmark.category],
          onPress: () => handleMarkerPress(landmark),
        }))}
      >
        {/* The vector style draws the city boundary natively; only the tour
            route polyline is needed as an overlay. */}
        {activeTour && activeTour.routeCoordinates.length > 1 && (
          <>
            {/* Soft casing under the route for contrast against the map */}
            <VectorMapPolyline
              coordinates={activeTour.routeCoordinates}
              strokeColor={activeTour.color + "55"}
              strokeWidth={7}
            />
            <VectorMapPolyline
              coordinates={activeTour.routeCoordinates}
              strokeColor="#FFFFFF"
              strokeWidth={4.5}
            />
            <VectorMapPolyline
              coordinates={activeTour.routeCoordinates}
              strokeColor={activeTour.color}
              strokeWidth={3}
              lineDashPattern={[6, 7]}
            />
          </>
        )}
      </MapLibreMapView>
      ) : (
        <MapViewWrapper
        ref={mapRef}
        style={styles.map}
        initialRegion={BERKELEY_CENTER}
        minZoomLevel={12}
        maxZoomLevel={16}
        region={undefined}
        onPress={handleMapPress}
        showsUserLocation
        showsCompass
        showsScale
        mapType="standard"
        clusterMarkers={filteredLandmarks.map((landmark) => ({
          id: landmark.id,
          coordinate: { latitude: landmark.latitude, longitude: landmark.longitude },
          pinColor: CATEGORY_COLORS[landmark.category],
          onPress: () => handleMarkerPress(landmark),
        }))}
      >
        {/* Berkeley city boundary outline */}
        <MapPolygon
          coordinates={BERKELEY_BOUNDARY}
          strokeColor="#7B8B6F"
          strokeWidth={2.5}
          fillColor="rgba(123, 139, 111, 0.06)"
        />
        {/* Dimming overlay outside Berkeley (large rect with boundary as inner ring) */}
        <MapPolygon
          coordinates={[
            // Outer rectangle (clockwise) — huge bounding box
            { latitude: 38, longitude: -123 },
            { latitude: 38, longitude: -121 },
            { latitude: 37, longitude: -121 },
            { latitude: 37, longitude: -123 },
            // Inner hole: Berkeley boundary reversed (counter-clockwise)
            ...[...BERKELEY_BOUNDARY].reverse(),
          ]}
          strokeColor="transparent"
          strokeWidth={0}
          fillColor="rgba(26, 26, 26, 0.35)"
        />

        {activeTour && activeTour.routeCoordinates.length > 1 && (
          <>
            <MapPolyline
              coordinates={activeTour.routeCoordinates}
              strokeColor={activeTour.color + "55"}
              strokeWidth={7}
            />
            <MapPolyline
              coordinates={activeTour.routeCoordinates}
              strokeColor="#FFFFFF"
              strokeWidth={4.5}
            />
            <MapPolyline
              coordinates={activeTour.routeCoordinates}
              strokeColor={activeTour.color}
              strokeWidth={3}
              lineDashPattern={[6, 7]}
            />
          </>
        )}
      </MapViewWrapper>
      )}

      {/* Map engine toggle: MapLibre vector map ⇄ raster fallback */}
      {engineReady && (
        <Pressable
          accessibilityLabel={
            isMapLibre ? "Switch to raster map" : "Switch to vector map"
          }
          onPress={toggleEngine}
          style={[
            styles.spikeButton,
            {
              top: insets.top + 12,
              backgroundColor: colors.background,
              borderColor: colors.border,
            },
          ]}
        >
          <IconSymbol
            name="map.fill"
            size={12}
            color={colors.text}
          />
          <Text style={{ color: colors.text, fontSize: 11 }}>
            {isMapLibre ? "Vector" : "Raster"}
          </Text>
        </Pressable>
      )}

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
                      backgroundColor: colors.surface,
                      borderColor: isActive ? CATEGORY_COLORS[cat] : colors.border,
                      borderWidth: isActive ? 2 : 1,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.chipDot,
                      { backgroundColor: CATEGORY_COLORS[cat] },
                    ]}
                  />
                  <Text
                    style={[
                      styles.chipText,
                      { color: isActive ? colors.foreground : colors.muted },
                    ]}
                  >
                    {CATEGORY_LABELS[cat]}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {/* Edge fades: signals the row scrolls */}
          <LinearGradient
            pointerEvents="none"
            colors={[colors.background + "F0", colors.background + "00"]}
            style={styles.chipFadeLeft}
          />
          <LinearGradient
            pointerEvents="none"
            colors={[colors.background + "00", colors.background + "F0"]}
            style={styles.chipFadeRight}
          />
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

      {/* Follow-along tour card */}
      {activeTour && !selectedLandmark && (
        <TourFollowCard tour={activeTour} follow={tourFollow} />
      )}

      {/* Bottom Sheet - Landmark Preview */}
      {selectedLandmark && (
        <View
          style={[
            styles.bottomSheet,
            {
              backgroundColor: Platform.select({
                ios: colors.surface + 'E0',
                android: colors.surface,
                default: colors.surface + 'E0',
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
              <CategoryPlaceholder
                category={selectedLandmark.category}
                color={CATEGORY_COLORS[selectedLandmark.category]}
                size={120}
                style={styles.sheetPhotoPlaceholder}
              />
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
                <View style={[styles.nrBadge, { backgroundColor: colors.accent + '22' }]}>
                  <IconSymbol name="star.fill" size={10} color="#FF9500" />
                  <Text style={[styles.nrText, { color: colors.accent }]}>NR</Text>
                </View>
              )}
            </View>
            <Pressable
              onPress={() => {
                setSelectedLandmark(null);
                router.push(`/landmark/${selectedLandmark.id}`);
              }}
              style={({ pressed }) => [
                styles.detailButton,
                {
                  borderColor: colors.primary,
                  borderWidth: 1,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text style={[styles.detailButtonText, { color: colors.primary }]}>View Details</Text>
              <IconSymbol name="chevron.right" size={14} color={colors.primary} />
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
    position: "absolute" as const,
    top: 0, left: 0, right: 0, bottom: 0,
  },
  spikeButton: {
    position: "absolute" as const,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  filterContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 10,
  },
  filterScroll: {
    paddingHorizontal: 16,
    paddingRight: 40,
    gap: 8,
  },
  chipFadeLeft: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 20,
  },
  chipFadeRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 20,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 4,
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
      web: { boxShadow: "0 1px 2px rgba(0,0,0,0.02)" },
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
    borderRadius: 6,
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
    height: 120,
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
    fontFamily: Platform.select({ ios: "ui-serif", default: "serif" }),
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
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  nrText: {
    fontSize: 11,
    fontWeight: "700",
  },
  detailButton: {
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 6,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  detailButtonText: {
    fontSize: 15,
    fontWeight: "700",
  },
});
