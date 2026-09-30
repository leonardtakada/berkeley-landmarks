import React, { useRef, useState, useCallback, useEffect, useMemo } from "react";
import {
  Text,
  View,
  Pressable,
  StyleSheet,
  ScrollView,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import Svg, { Path, Text as SvgText } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import MapViewWrapper, { MapPolyline, MapPolygon } from "@/components/map-view-wrapper";
import MapLibreMapView, {
  MapPolyline as VectorMapPolyline,
  type MapCameraHandle,
} from "@/components/maplibre-view";
import { useMapEngine } from "@/constants/map-engine";
import {
  landmarks,
  BERKELEY_CENTER,
  CATEGORY_LABELS,
  type LandmarkCategory,
  type Landmark,
} from "@/data/landmarks";
import { BERKELEY_BOUNDARY } from "@/data/berkeley-boundary";
import { tours } from "@/data/tours";
import { useTourFollow } from "@/hooks/use-tour-follow";
import { TourFollowCard } from "@/components/tour-follow-card";
import { StampCollectOverlay } from "@/components/travel-stamp";
import { WalkStampOverlay } from "@/components/copy-marks";
import { today } from "@/lib/reader-copy";
import { useReaderCopy } from "@/lib/reader-copy-context";
import { MapUnfold } from "@/components/map-unfold";
import { ArchitectPortrait } from "@/components/architect-portrait";
import { Arrow, Rule } from "@/components/print";
import { PaperGrain } from "@/components/paper-grain";
import { TippedInPlate } from "@/components/tipped-in-plate";
import { FONT, INK, PAPER, TYPE, chapterNo } from "@/constants/book";
import { architectOf } from "@/lib/architects";
import { photoSource } from "@/lib/photo-source";
import { legBetween } from "@/lib/route-legs";

const ALL_CATEGORIES: LandmarkCategory[] = [
  "civic",
  "residential",
  "religious",
  "commercial",
  "educational",
  "cultural",
];

// The walk: a vermilion stroke over a wider, pale underlayer that mimics ink
// spreading into the paper — the same line as the fold-out map. Hex-alpha in the underlayer
// color works on all three engines (react-native-maps, MapLibre, Leaflet).
const INK_RED = INK.vermilion;
/** Rough height of the landmark entry sheet, for camera padding. */
const SHEET_ESTIMATE = 330;
const INK_RED_UNDER = "#E4592B38"; // vermilion @ ~22% opacity
const INK_WIDTH = 4.5;
const INK_UNDER_WIDTH = 9;

export default function MapScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tourId?: string; landmarkId?: string; walk?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapCameraHandle | null>(null);
  const { engine, isMapLibre, isIso, toggleEngine, ready: engineReady } = useMapEngine();

  const [selectedLandmark, setSelectedLandmark] = useState<Landmark | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<LandmarkCategory>>(
    new Set(ALL_CATEGORIES)
  );
  const [activeTourId, setActiveTourId] = useState<string | null>(
    params.tourId ?? null
  );

  // "Set out on foot" arrives walking, stop by stop; "the large map" arrives
  // with the walk laid out whole until the reader begins it.
  const [walking, setWalking] = useState(params.walk === "1");

  // Map is a push route; a fresh push arrives as a param change on an
  // already-mounted screen — sync it.
  useEffect(() => {
    if (params.tourId !== undefined) {
      setActiveTourId(params.tourId as string);
      setWalking(params.walk === "1");
      setSelectedLandmark(null);
    }
  }, [params.tourId, params.walk]);

  // Camera padding keeps whatever is in focus clear of the slips laid over
  // the map: the banner at the top, the walk card or entry sheet below.
  const [cardHeight, setCardHeight] = useState(250);
  const padFor = useCallback(
    (bottom: number) => ({ top: insets.top + 80, right: 36, bottom: bottom + 24, left: 36 }),
    [insets.top],
  );

  // "Find it on the map": fly in to the landmark, above its entry sheet.
  useEffect(() => {
    if (params.landmarkId !== undefined) {
      const lm = landmarks.find((l) => l.id === params.landmarkId);
      if (lm) {
        setActiveTourId(null);
        setSelectedLandmark(lm);
        mapRef.current?.flyToCoord(
          { latitude: lm.latitude, longitude: lm.longitude },
          17,
          padFor(SHEET_ESTIMATE),
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- camera command on arrival
  }, [params.landmarkId]);

  const activeTour = useMemo(
    () => (activeTourId ? tours.find((t) => t.id === activeTourId) : null),
    [activeTourId]
  );
  // A walk's labels: each stop the walker reaches adds its label to the
  // walk's page; the last presses the walk's stamp into the Appendix.
  const { collect } = useReaderCopy();
  const [collectedFlash, setCollectedFlash] = useState<{
    landmarkName: string;
    tourName: string;
  } | null>(null);
  const [walkStamp, setWalkStamp] = useState<{ tourId: string; title: string; walk: number; day: string } | null>(null);
  const onReach = useCallback(
    (landmarkId: string) => {
      if (!activeTour) return;
      const { added, finished } = collect(activeTour.id, landmarkId);
      if (finished) {
        setCollectedFlash(null);
        setWalkStamp({ tourId: activeTour.id, title: activeTour.name, walk: tours.indexOf(activeTour) + 1, day: today() });
      } else if (added) {
        const landmark = landmarks.find((l) => l.id === landmarkId);
        if (landmark) setCollectedFlash({ landmarkName: landmark.name, tourName: activeTour.name });
      }
    },
    [activeTour, collect],
  );
  const tourFollow = useTourFollow(activeTour ?? null, onReach);

  // Frame the walk: the whole route until the reader sets out; then the
  // first stop; then, at each step, the leg of the route between the stop
  // just left and the next.
  const stepIndex = tourFollow.currentStopIndex;
  useEffect(() => {
    if (!activeTour) return;
    const stops = tourFollow.stops.map((s) => ({
      latitude: s.landmark.latitude,
      longitude: s.landmark.longitude,
    }));
    if (!stops.length) return;
    const route = activeTour.routeCoordinates;
    const pad = padFor(cardHeight);
    if (!walking || tourFollow.finished) {
      mapRef.current?.fitCoords(route.length > 1 ? [...route, ...stops] : stops, pad);
    } else if (stepIndex === 0) {
      mapRef.current?.flyToCoord(stops[0], 17, pad);
    } else {
      mapRef.current?.fitCoords(legBetween(route, stops, stepIndex - 1, stepIndex), pad);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- camera command, values read fresh
  }, [activeTour?.id, walking, stepIndex, tourFollow.finished, cardHeight]);

  const tourStopIds = useMemo(
    () => new Set(activeTour?.stops.map((s) => s.landmarkId) ?? []),
    [activeTour]
  );
  const stopOrder = useMemo(
    () => new Map(activeTour?.stops.map((s) => [s.landmarkId, String(s.order)]) ?? []),
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

  // Book-styled close affordance: map is a push route with no tab chrome,
  // so give the map an explicit way out.
  const handleClose = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.pageBackground }]}>
      {/* Unfolds once, when the screen mounts; later pushes reuse it in place. */}
      <MapUnfold animated>
      {isMapLibre ? (
        <MapLibreMapView
        key={isIso ? "iso" : "flat"}
        iso={isIso}
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
          pinColor: INK.blue,
          label: stopOrder.get(landmark.id),
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
          pinColor: INK.blue,
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

      {/* Fold the map away — the map is a loose sheet with no ribbons to escape by. */}
      <Pressable
        accessibilityLabel="Fold the map away"
        accessibilityRole="button"
        onPress={handleClose}
        style={({ pressed }) => [styles.closeButton, { top: insets.top + 10, opacity: pressed ? 0.6 : 1 }]}
      >
        <PaperGrain opacity={0.7} />
        <Arrow direction="left" length={16} />
        <Text style={styles.closeButtonText}>Close</Text>
      </Pressable>

      {/* Map engine toggle: MapLibre vector map ⇄ raster fallback */}
      {__DEV__ && engineReady && (
        <Pressable
          accessibilityLabel={
            `Map: ${engine}. Switch to the next.`
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
          <Text style={{ color: INK.blue, fontSize: 11, fontFamily: FONT.medium, letterSpacing: 1.4, textTransform: "uppercase" }}>
            {engine}
          </Text>
        </Pressable>
      )}

      {/* The legend: kinds of building, struck through when hidden. */}
      {!activeTour && (
        <View style={[styles.filterContainer, { top: insets.top + 10 }]}>
          <View style={styles.legend}>
            <PaperGrain opacity={0.7} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterScroll}
            >
              {ALL_CATEGORIES.map((cat, i) => {
                const isActive = activeCategories.has(cat);
                return (
                  <React.Fragment key={cat}>
                    {i > 0 ? <Text style={styles.chipDot}>·</Text> : null}
                    <Pressable
                      onPress={() => toggleCategory(cat)}
                      hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          { color: isActive ? INK.blue : INK.faded },
                          !isActive && styles.chipOff,
                        ]}
                      >
                        {CATEGORY_LABELS[cat]}
                      </Text>
                    </Pressable>
                  </React.Fragment>
                );
              })}
            </ScrollView>
          </View>
        </View>
      )}

      {/* The walk being followed, as a slip laid on the map. */}
      {activeTour && (
        <View style={[styles.tourBanner, { top: insets.top + 10 }]}>
          <PaperGrain opacity={0.7} />
          <View style={styles.tourBannerContent}>
            <Text style={styles.tourBannerKicker}>
              Walk {chapterNo(tours.indexOf(activeTour) + 1)}
            </Text>
            <Text style={styles.tourBannerText} numberOfLines={1}>
              {activeTour.name}
            </Text>
          </View>
          <Pressable
            onPress={clearTour}
            hitSlop={10}
            accessibilityLabel="Leave this walk"
            style={({ pressed }) => [styles.tourBannerClose, { opacity: pressed ? 0.5 : 1 }]}
          >
            <Text style={styles.tourBannerX}>×</Text>
          </Pressable>
        </View>
      )}

      {/* On the isometric city north isn't up: a north point says where it is. */}
      {isIso && !selectedLandmark ? (
        <View
          pointerEvents="none"
          style={[
            styles.north,
            { bottom: (activeTour && !selectedLandmark ? cardHeight : Math.max(insets.bottom, 12)) + 6 },
          ]}
          accessible
          accessibilityLabel="North is up and to the left"
        >
          <Svg width={40} height={30} viewBox="0 0 40 30">
            <Path d="M14 10 L36 15.8 L27.3 17.7 L30 26.2 Z" fill={INK.charcoal} />
            <SvgText x={2} y={12} fontSize={11} fontFamily={FONT.medium} fill={INK.charcoal}>
              N
            </SvgText>
          </Svg>
        </View>
      ) : null}

      {/* The map's imprint: its streets are OpenStreetMap's, and say so. */}
      <Text
        style={[
          styles.imprint,
          { bottom: (activeTour && !selectedLandmark ? cardHeight : Math.max(insets.bottom, 12)) + 6 },
        ]}
        accessibilityRole="text"
      >
        © OpenStreetMap contributors
      </Text>

      {/* Follow-along tour card */}
      {activeTour && !selectedLandmark && (
        <TourFollowCard
          tour={activeTour}
          follow={tourFollow}
          walking={walking}
          onBegin={() => setWalking(true)}
          onLayout={(e) => {
            const h = Math.round(e.nativeEvent.layout.height);
            if (Math.abs(h - cardHeight) > 12) setCardHeight(h);
          }}
        />
      )}

      {/* The entry, torn from the registry and laid on the map. */}
      {selectedLandmark && (
        <View style={[styles.bottomSheet, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
          <PaperGrain opacity={0.8} />
          <View style={styles.sheetContent}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleRow}>
                <Text style={styles.sheetKicker}>
                  {CATEGORY_LABELS[selectedLandmark.category]}
                  {selectedLandmark.landmarkNumber
                    ? `  ·  No. ${selectedLandmark.landmarkNumber.replace(/^#/, "")}`
                    : ""}
                </Text>
                <Text style={styles.sheetName} numberOfLines={2}>
                  {selectedLandmark.name}
                </Text>
                <Text style={styles.sheetAddress}>{selectedLandmark.address}</Text>
              </View>
              <Pressable
                onPress={() => setSelectedLandmark(null)}
                hitSlop={10}
                accessibilityLabel="Put the entry away"
                style={({ pressed }) => [styles.sheetClose, { opacity: pressed ? 0.5 : 1 }]}
              >
                <Text style={styles.tourBannerX}>×</Text>
              </Pressable>
            </View>
            <View style={styles.sheetBody}>
              {selectedLandmark.photoUrl ? (
                <TippedInPlate
                  source={photoSource(selectedLandmark.photoUrl)}
                  index={1}
                  width={118}
                  height={86}
                  offset={6}
                  style={styles.sheetPlate}
                />
              ) : architectOf(selectedLandmark) ? (
                <ArchitectPortrait architect={architectOf(selectedLandmark)!} width={78} delay={120} />
              ) : null}
              <View style={styles.sheetMeta}>
                <Text style={styles.sheetMetaLabel}>Architect</Text>
                <Text style={styles.sheetMetaText} numberOfLines={2}>
                  {selectedLandmark.architect}
                </Text>
                <Text style={[styles.sheetMetaLabel, { marginTop: 10 }]}>Built</Text>
                <Text style={styles.sheetMetaText}>{selectedLandmark.yearBuilt}</Text>
              </View>
            </View>
            <Rule style={{ marginTop: 16 }} />
            <Pressable
              onPress={() => {
                setSelectedLandmark(null);
                router.push(`/landmark/${selectedLandmark.id}`);
              }}
              style={({ pressed }) => [styles.detailButton, { opacity: pressed ? 0.5 : 1 }]}
            >
              <Text style={styles.detailButtonText}>Read the entry</Text>
              <Arrow length={22} />
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
      {walkStamp && (
        <WalkStampOverlay
          tourId={walkStamp.tourId}
          title={walkStamp.title}
          walk={walkStamp.walk}
          day={walkStamp.day}
          onDismiss={() => setWalkStamp(null)}
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
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  legend: {
    marginLeft: 140,
    marginRight: 12,
    backgroundColor: PAPER.slip,
    overflow: "hidden",
    shadowColor: "#2A2016",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 1, height: 2 },
  },
  chipDot: {
    fontFamily: FONT.regular,
    fontSize: 12,
    color: INK.faded,
    marginHorizontal: 6,
  },
  chipText: {
    fontFamily: FONT.medium,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  chipOff: {
    textDecorationLine: "line-through",
    textDecorationColor: INK.sepia,
  },
  closeButton: {
    position: "absolute" as const,
    left: 12,
    zIndex: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: PAPER.slip,
    overflow: "hidden",
    shadowColor: "#2A2016",
    shadowOpacity: 0.22,
    shadowRadius: 4,
    shadowOffset: { width: 1, height: 2 },
  },
  north: {
    position: "absolute" as const,
    right: 10,
    zIndex: 5,
    padding: 4,
    backgroundColor: "rgba(250,246,236,0.8)",
  },
  imprint: {
    position: "absolute" as const,
    left: 10,
    zIndex: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: "rgba(250,246,236,0.8)",
    fontFamily: FONT.regular,
    fontSize: 10,
    color: INK.sepia,
  },
  closeButtonText: {
    fontFamily: FONT.medium,
    fontSize: 11.5,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: INK.blue,
  },
  tourBanner: {
    position: "absolute",
    left: 140,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingLeft: 14,
    paddingRight: 8,
    backgroundColor: PAPER.slip,
    zIndex: 10,
    overflow: "hidden",
    shadowColor: "#2A2016",
    shadowOpacity: 0.22,
    shadowRadius: 4,
    shadowOffset: { width: 1, height: 2 },
  },
  tourBannerContent: {
    flex: 1,
  },
  tourBannerKicker: {
    ...TYPE.kicker,
    fontSize: 10,
  },
  tourBannerText: {
    fontFamily: FONT.regular,
    fontSize: 17,
    color: INK.charcoal,
  },
  tourBannerClose: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  tourBannerX: {
    fontFamily: FONT.light,
    fontSize: 26,
    color: INK.sepia,
  },
  bottomSheet: {
    position: "absolute",
    bottom: 0,
    left: 8,
    right: 8,
    backgroundColor: PAPER.slip,
    overflow: "hidden",
    shadowColor: "#2A2016",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  sheetContent: {
    paddingHorizontal: 22,
    paddingTop: 20,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  sheetTitleRow: {
    flex: 1,
  },
  sheetKicker: {
    ...TYPE.kicker,
  },
  sheetName: {
    fontFamily: FONT.light,
    fontSize: 26,
    lineHeight: 30,
    color: INK.charcoal,
    marginTop: 6,
  },
  sheetClose: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
    marginTop: -4,
  },
  sheetAddress: {
    fontFamily: FONT.regular,
    fontSize: 14,
    color: INK.sepia,
    marginTop: 4,
  },
  sheetBody: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    marginTop: 14,
  },
  sheetPlate: {
    alignSelf: "flex-start",
  },
  sheetMeta: {
    flex: 1,
    paddingTop: 4,
  },
  sheetMetaLabel: {
    ...TYPE.label,
  },
  sheetMetaText: {
    fontFamily: FONT.regular,
    fontSize: 16,
    color: INK.charcoal,
    marginTop: 2,
  },
  detailButton: {
    marginTop: 12,
    paddingVertical: 6,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  detailButtonText: {
    fontFamily: FONT.medium,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: INK.blue,
  },
});
