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
import { useStamps } from "@/lib/stamps";
import { StampCollectOverlay } from "@/components/travel-stamp";
import { MapUnfold } from "@/components/map-unfold";

const ALL_CATEGORIES: LandmarkCategory[] = [
  "civic",
  "residential",
  "religious",
  "commercial",
  "educational",
  "cultural",
];

// Hand-inked tour route (Showa book motif): a thick red-ink stroke over a
// wider, low-opacity darker underlayer that mimics ink weight variation —
// like a brush S-curve printed on a paper map. Hex-alpha in the underlayer
// color works on all three engines (react-native-maps, MapLibre, Leaflet).
const INK_RED = "#C0392B";
const INK_RED_UNDER = "#7E24185A"; // darker red @ ~35% opacity
const INK_WIDTH = 5.5;
const INK_UNDER_WIDTH = 7.5;

// Showa book serif (see components/chapter-header.tsx)
const SERIF = Platform.select({ ios: "Georgia", default: "serif" });

export default function MapScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tourId?: string; landmarkId?: string }>();
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

  // Fold-out map animation plays once, on the screen's first mount. Push
  // navigation reuses the mounted screen (params change in place), so this
  // ref keeps the unfold from replaying on every subsequent push.
  const hasMounted = useRef(false);
  useEffect(() => {
    hasMounted.current = true;
  }, []);

  // Map is a push route; a fresh push arrives as a param change on an
  // already-mounted screen — sync it.
  useEffect(() => {
    if (params.tourId !== undefined) {
      setActiveTourId(params.tourId as string);
      setSelectedLandmark(null);
    }
  }, [params.tourId]);

  // Deep link / "View on Map" push for a single landmark.
  useEffect(() => {
    if (params.landmarkId !== undefined) {
      const lm = landmarks.find((l) => l.id === params.landmarkId);
      if (lm) {
        setActiveTourId(null);
        setSelectedLandmark(lm);
        // Fly the camera to the landmark so the user actually sees where it
        // is. Delay accounts for map mount (~maplibre asset staging) plus
        // the ~450ms MapUnfold animation — camera commands issued before
        // the view is mounted are silently dropped.
        const t = setTimeout(
          () =>
            mapRef.current?.flyToCoord?.(
              { latitude: lm.latitude, longitude: lm.longitude },
              16
            ),
          900
        );
        return () => clearTimeout(t);
      }
    }
  }, [params.landmarkId]);

  const activeTour = useMemo(
    () => (activeTourId ? tours.find((t) => t.id === activeTourId) : null),
    [activeTourId]
  );
  const tourFollow = useTourFollow(activeTour ?? null);

  // Tour-progress stamps: tapping a stop while its tour is active collects
  // a vintage ink stamp (Showa travel-book motif).
  const stampState = useStamps(activeTour?.id ?? null);
  const [collectedFlash, setCollectedFlash] = useState<{
    landmarkName: string;
    tourName: string;
  } | null>(null);

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
    // Delay: map mount + the ~450ms MapUnfold animation — camera calls
    // issued before the view has mounted are dropped.
    const t = setTimeout(() => mapRef.current?.fitCoords?.(coords), 900);
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

  const handleMarkerPress = useCallback(
    (landmark: Landmark) => {
      setSelectedLandmark(landmark);
      // Stamp collection: marker tap on a stop during its active tour.
      if (activeTour && tourStopIds.has(landmark.id)) {
        stampState.collect(landmark.id).then((added) => {
          if (added) {
            setCollectedFlash({
              landmarkName: landmark.name,
              tourName: activeTour.name,
            });
          }
        });
      }
    },
    [activeTour, tourStopIds, stampState]
  );

  const handleMapPress = useCallback(() => {
    setSelectedLandmark(null);
  }, []);

  const clearTour = useCallback(() => {
    setActiveTourId(null);
    setSelectedLandmark(null);
  }, []);

  // Book-styled close affordance: map is a push route with no tab chrome,
  // so give the map an explicit way out.
  const handleClose = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.pageBackground }]}>
      <MapUnfold animated={!hasMounted.current}>
      {isMapLibre ? (
        <MapLibreMapView
        ref={mapRef}
        style={styles.map}
        initialRegion={BERKELEY_CENTER}
        minZoomLevel={12}
        maxZoomLevel={17}
        onPress={handleMapPress}
        showsUserLocation
        highlight={
          selectedLandmark
            ? {
                latitude: selectedLandmark.latitude,
                longitude: selectedLandmark.longitude,
              }
            : null
        }
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
            {/* Ink weight underlayer: wider, low-opacity dark red */}
            <VectorMapPolyline
              coordinates={activeTour.routeCoordinates}
              strokeColor={INK_RED_UNDER}
              strokeWidth={INK_UNDER_WIDTH}
            />
            {/* Main ink stroke */}
            <VectorMapPolyline
              coordinates={activeTour.routeCoordinates}
              strokeColor={INK_RED}
              strokeWidth={INK_WIDTH}
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
        highlight={
          selectedLandmark
            ? {
                latitude: selectedLandmark.latitude,
                longitude: selectedLandmark.longitude,
              }
            : null
        }
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
            {/* Ink weight underlayer: wider, low-opacity dark red */}
            <MapPolyline
              coordinates={activeTour.routeCoordinates}
              strokeColor={INK_RED_UNDER}
              strokeWidth={INK_UNDER_WIDTH}
            />
            {/* Main ink stroke */}
            <MapPolyline
              coordinates={activeTour.routeCoordinates}
              strokeColor={INK_RED}
              strokeWidth={INK_WIDTH}
            />
          </>
        )}
      </MapViewWrapper>
      )}
      </MapUnfold>

      {/* Book-styled CLOSE button — the map has no tab chrome to escape from */}
      <Pressable
        accessibilityLabel="Close map"
        accessibilityRole="button"
        onPress={handleClose}
        style={({ pressed }) => [
          styles.closeButton,
          {
            top: insets.top + 12,
            backgroundColor: colors.pageSurface,
            borderColor: colors.pageBorder,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <IconSymbol name="xmark" size={12} color={colors.text} />
        <Text style={[styles.closeButtonText, { color: colors.text }]}>Close</Text>
      </Pressable>

      {/* Map engine toggle: MapLibre vector map ⇄ raster fallback */}
      {__DEV__ && engineReady && (
        <Pressable
          accessibilityLabel={
            isMapLibre ? "Switch to raster map" : "Switch to vector map"
          }
          onPress={toggleEngine}
          style={[
            styles.spikeButton,
            {
              top: insets.top + 12,
              backgroundColor: colors.pageBackground,
              borderColor: colors.pageBorder,
            },
          ]}
        >
          <IconSymbol
            name="map.fill"
            size={12}
            color={colors.text}
          />
          <Text style={{ color: colors.text, fontSize: 11, fontFamily: SERIF, letterSpacing: 1.2, textTransform: "uppercase" }}>
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
                      backgroundColor: colors.pageSurface,
                      borderColor: isActive ? CATEGORY_COLORS[cat] : colors.pageBorder,
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
            colors={[colors.pageBackground + "F0", colors.pageBackground + "00"]}
            style={styles.chipFadeLeft}
          />
          <LinearGradient
            pointerEvents="none"
            colors={[colors.pageBackground + "00", colors.pageBackground + "F0"]}
            style={styles.chipFadeRight}
          />
        </View>
      )}

      {/* Tour Banner — printed map-legend strip */}
      {activeTour && (
        <View
          style={[
            styles.tourBanner,
            {
              top: insets.top + 12,
              backgroundColor: colors.pageSurface,
              borderColor: colors.pageBorder,
            },
          ]}
        >
          <View style={[styles.tourBannerContent, { borderLeftColor: activeTour.color }]}>
            <IconSymbol name="figure.walk" size={16} color={activeTour.color} />
            <Text style={[styles.tourBannerText, { color: activeTour.color }]} numberOfLines={1}>
              {activeTour.name}
            </Text>
          </View>
          <Pressable
            onPress={clearTour}
            style={({ pressed }) => [
              styles.tourBannerClose,
              { backgroundColor: colors.pageBorder + "33", opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <IconSymbol name="xmark" size={16} color={colors.muted} />
          </Pressable>
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
                ios: colors.pageSurface + 'E0',
                android: colors.pageSurface,
                default: colors.pageSurface + 'E0',
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
                  { backgroundColor: colors.pageBackground, opacity: pressed ? 0.7 : 1 },
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
                <View style={[styles.nrBadge, { borderColor: colors.accent }]}>
                  <IconSymbol name="star.fill" size={10} color={colors.accent} />
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
      {/* Freshly collected stamp flash (ink-stamp slam + haptic) */}
      {collectedFlash && (
        <StampCollectOverlay
          landmarkName={collectedFlash.landmarkName}
          tourName={collectedFlash.tourName}
          onDismiss={() => setCollectedFlash(null)}
        />
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
    borderRadius: 2,
    borderWidth: 1,
  },
  filterContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 10,
  },
  filterScroll: {
    paddingLeft: 76,
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
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 2,
    borderWidth: 1,
    gap: 6,
  },
  chipDot: {
    width: 7,
    height: 7,
    borderRadius: 1,
  },
  closeButton: {
    position: "absolute" as const,
    left: 12,
    zIndex: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 2,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
      web: { boxShadow: "0 2px 6px rgba(0,0,0,0.06)" },
    }),
  },
  closeButtonText: {
    fontFamily: SERIF,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  chipText: {
    fontFamily: SERIF,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  tourBanner: {
    position: "absolute",
    left: 76,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 8,
    paddingVertical: 4,
    borderRadius: 2,
    borderWidth: 1,
    zIndex: 10,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
      web: { boxShadow: "0 2px 6px rgba(0,0,0,0.06)" },
    }),
  },
  tourBannerContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderLeftWidth: 3,
  },
  tourBannerText: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: SERIF,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  tourBannerClose: {
    width: 28,
    height: 28,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
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
    borderWidth: StyleSheet.hairlineWidth,
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
