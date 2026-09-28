/**
 * MapLibre vector map view — production counterpart to map-view-wrapper.tsx.
 *
 * Renders the bundled Berkeley PMTiles (offline, via the `pmtiles://` file
 * scheme) with the paper-light / paper-dark styles and offline Noto glyph
 * PBFs. Implements the same feature surface the map screen needs:
 *
 *  - initialRegion / min & max zoom, camera clamped to the Berkeley area
 *    (maxBounds lat 37.785–37.965, lon -122.41…-122.15)
 *  - onPress for tap-to-dismiss
 *  - user-location puck
 *  - native GeoJSON clustering for landmark markers (pinColor kept)
 *  - tour route polyline children
 *  - light/dark style swap on scheme change
 *
 * The city boundary is already drawn by the style's `boundary` layer; the
 * raster-only "dim outside Berkeley" overlay is unnecessary because the
 * vector map simply ends at the baked bbox.
 *
 * Uses the new @maplibre/maplibre-react-native v11 API (Map / Camera /
 * GeoJSONSource / Layer components — no default export).
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useColorScheme } from "react-native";
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MLMap,
  UserLocation,
} from "@maplibre/maplibre-react-native";
import type { CameraRef, GeoJSONSourceRef } from "@maplibre/maplibre-react-native";
import { Asset } from "expo-asset";
import type * as LegacyFS from "expo-file-system/legacy";
import { useColors } from "@/hooks/use-colors";
import { GLYPH_ASSETS } from "@/lib/map-glyphs.generated";

/* ------------------------------------------------------------------ */
/* Shared prop shapes (mirror map-view-wrapper)                        */
/* ------------------------------------------------------------------ */

interface Coordinate {
  latitude: number;
  longitude: number;
}

interface RegionLike extends Coordinate {
  latitudeDelta: number;
  longitudeDelta: number;
}

interface MarkerProps {
  coordinate: Coordinate;
  title?: string;
  description?: string;
  onPress?: () => void;
  pinColor?: string;
  children?: React.ReactNode;
}

interface PolylineProps {
  coordinates: Coordinate[];
  strokeColor?: string;
  strokeWidth?: number;
  lineDashPattern?: number[];
}

interface PolygonProps {
  coordinates: Coordinate[];
  holes?: Coordinate[][];
  strokeColor?: string;
  strokeWidth?: number;
  fillColor?: string;
}

/** Camera padding in points, keeping focus clear of the screen's chrome. */
export interface CameraPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** The camera API map screens use, whichever engine is mounted. */
export interface MapCameraHandle {
  flyToCoord: (coord: Coordinate, zoom?: number, padding?: CameraPadding) => void;
  fitCoords: (coords: Coordinate[], padding?: CameraPadding) => void;
}

interface ClusterMarker {
  id: string;
  coordinate: Coordinate;
  pinColor?: string;
  /** Printed on the pin (tour stop numbers); labelled pins never cluster. */
  label?: string;
  onPress?: () => void;
}

interface MapLibreViewProps {
  style?: any;
  initialRegion?: RegionLike;
  minZoomLevel?: number;
  maxZoomLevel?: number;
  onPress?: () => void;
  showsUserLocation?: boolean;
  clusterMarkers?: ClusterMarker[];
  clusterRadius?: number;
  clusterMaxZoom?: number;
  /** Emphasized landmark (deep-link / selection): ink crosshair ring */
  highlight?: Coordinate | null;
  children?: React.ReactNode;
}

/* Descriptor children — interpreted below so callers can use the same
 * MapPolyline / MapPolygon elements they pass to the raster wrapper. */
export function MapMarker(_props: MarkerProps) {
  return null;
}

export function MapPolyline(_props: PolylineProps) {
  return null;
}

export function MapPolygon(_props: PolygonProps) {
  return null;
}

/* ------------------------------------------------------------------ */
/* Offline asset staging (pmtiles + glyph PBFs → cache dir)            */
/* ------------------------------------------------------------------ */

let fsPromise: Promise<typeof LegacyFS> | null = null;
function fs(): Promise<typeof LegacyFS> {
  fsPromise ??= import("expo-file-system/legacy") as Promise<typeof LegacyFS>;
  return fsPromise;
}

let stagedPromise: Promise<{ pmtilesUri: string; glyphsUrl: string }> | null = null;

/** Copy bundled map assets into real files so maplibre-native can mmap them. */
async function stageOfflineAssets(): Promise<{ pmtilesUri: string; glyphsUrl: string }> {
  const F = await fs();
  const cache = F.cacheDirectory ?? F.documentDirectory;
  if (!cache) throw new Error("no cache directory");

  // --- PMTiles -------------------------------------------------------
  const pmDest = `${cache}berkeley.pmtiles`;
  if (!(await F.getInfoAsync(pmDest)).exists) {
    const [asset] = await Asset.loadAsync(require("../assets/map/berkeley.pmtiles"));
    await F.copyAsync({ from: asset.localUri ?? asset.uri, to: pmDest });
  }

  // --- Glyph PBFs (fontstack/range.pbf structure) ---------------------
  const glyphsRoot = `${cache}map-glyphs`;
  await Promise.all(
    Object.entries(GLYPH_ASSETS).map(async ([key, mod]) => {
      const [stack, range] = key.split("/");
      const dir = `${glyphsRoot}/${stack}`;
      const dest = `${dir}/${range}.pbf`;
      if ((await F.getInfoAsync(dest)).exists) return;
      await F.makeDirectoryAsync(dir, { intermediates: true });
      const [asset] = await Asset.loadAsync(mod);
      await F.copyAsync({ from: asset.localUri ?? asset.uri, to: dest });
    })
  );

  return {
    pmtilesUri: `pmtiles://${pmDest}`,
    glyphsUrl: `${glyphsRoot}/{fontstack}/{range}.pbf`,
  };
}

function useOfflineAssets() {
  const [uris, setUris] = useState<{ pmtilesUri: string; glyphsUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (Platform.OS === "web") return;
    stagedPromise ??= stageOfflineAssets();
    let cancelled = false;
    stagedPromise
      .then((u) => !cancelled && setUris(u))
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, []);
  return { uris, error };
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

// Keep the viewport inside the Berkeley area (parity with the raster
// wrapper's region clamps; maplibre-native enforces these natively).
// LngLatBounds tuple order: [west, south, east, north].
const MAX_BOUNDS: [number, number, number, number] = [-122.41, 37.785, -122.15, 37.965];

// Vermilion — the logo's second ink — marks the highlighted landmark.
const INK_RED = "#E4592B";
const PIN_BLUE = "#0B2E8C";
const CREAM = "#F2F0E6";

const DEFAULT_PADDING: CameraPadding = { top: 80, right: 48, bottom: 200, left: 48 };

const MapLibreMapView = forwardRef<MapCameraHandle | null, MapLibreViewProps>(
  (
    {
      style,
      initialRegion,
      minZoomLevel = 12,
      maxZoomLevel = 17,
      onPress,
      showsUserLocation,
      clusterMarkers,
      clusterRadius = 50,
      clusterMaxZoom = 15,
      highlight,
      children,
    },
    ref
  ) => {
    const scheme = useColorScheme();
    const colors = useColors();
    const { uris, error } = useOfflineAssets();
    const cameraRef = useRef<CameraRef>(null);
    const shapeRef = useRef<GeoJSONSourceRef>(null);

    // Camera moves asked for before the map has loaded (the offline tiles
    // stage asynchronously) wait here and run once it has; only the latest
    // request matters.
    const loaded = useRef(false);
    const pending = useRef<(() => void) | null>(null);
    const run = useCallback((move: () => void) => {
      if (loaded.current && cameraRef.current) move();
      else pending.current = move;
    }, []);
    const onMapLoaded = useCallback(() => {
      loaded.current = true;
      const move = pending.current;
      pending.current = null;
      // One frame for the camera to attach before it is driven.
      if (move) requestAnimationFrame(move);
    }, []);

    // The screen's camera API. (The native MapRef is kept private: forwarding
    // it through the same ref would replace this handle once the map mounts.)
    useImperativeHandle(
      ref,
      () => ({
        flyToCoord: (coord, zoom = 16, padding) =>
          run(() =>
            cameraRef.current?.flyTo({
              center: [coord.longitude, coord.latitude],
              zoom,
              ...(padding ? { padding } : null),
              duration: 900,
            }),
          ),
        fitCoords: (coords, padding = DEFAULT_PADDING) => {
          if (coords.length === 0) return;
          const lats = coords.map((c) => c.latitude);
          const lngs = coords.map((c) => c.longitude);
          run(() =>
            cameraRef.current?.fitBounds(
              [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
              { padding, duration: 900 },
            ),
          );
        },
      }),
      [run],
    );

    // onPress callbacks by landmark id (layer features can't hold functions).
    const pressById = useMemo(() => {
      const m = new Map<string, () => void>();
      for (const mk of clusterMarkers ?? []) if (mk.onPress) m.set(mk.id, mk.onPress);
      return m;
    }, [clusterMarkers]);

    const markerGeoJSON = useMemo(() => {
      if (!clusterMarkers?.length) return null;
      return {
        type: "FeatureCollection" as const,
        features: clusterMarkers.map((m) => ({
          type: "Feature" as const,
          properties: { id: m.id, pinColor: m.pinColor ?? PIN_BLUE, label: m.label ?? "" },
          geometry: {
            type: "Point" as const,
            coordinates: [m.coordinate.longitude, m.coordinate.latitude],
          },
        })),
      };
    }, [clusterMarkers]);
    const labelled = useMemo(() => !!clusterMarkers?.some((m) => m.label), [clusterMarkers]);

    // Polyline descriptor children (tour route etc.). Polygon children
    // (boundary / dim overlay) are skipped — the vector style already draws
    // the boundary, and the map ends at the baked bbox.
    const polylines = useMemo(() => {
      const polys: PolylineProps[] = [];
      // Walk into fragments too: screens group a route's ink layers in one.
      const visit = (nodes: React.ReactNode) =>
        React.Children.forEach(nodes, (child) => {
          if (!React.isValidElement(child)) return;
          if (child.type === React.Fragment) visit((child.props as { children?: React.ReactNode }).children);
          else if (child.type === MapPolyline) polys.push(child.props as PolylineProps);
        });
      visit(children);
      return polys;
    }, [children]);

    const styleJSON = useMemo(() => {
      if (!uris) return null;
      const base =
        scheme === "dark"
          ? require("../assets/map/paper-dark.json")
          : require("../assets/map/paper-light.json");
      return {
        ...base,
        glyphs: uris.glyphsUrl,
        sources: {
          berkeley: { type: "vector", url: uris.pmtilesUri },
        },
      } as any;
    }, [scheme, uris]);

    const handleShapePress = useCallback(
      async (event: any) => {
        const feature = event?.features?.[0];
        if (!feature) return;
        if (feature.properties?.cluster) {
          try {
            const zoom = await shapeRef.current?.getClusterExpansionZoom(
              feature.properties.cluster_id
            );
            const [lng, lat] = feature.geometry.coordinates;
            cameraRef.current?.flyTo({
              center: [lng, lat],
              zoom: Math.max(zoom ?? 15, minZoomLevel + 1),
            });
          } catch {}
          return;
        }
        const cb = pressById.get(feature.properties?.id);
        cb?.();
      },
      [pressById, minZoomLevel]
    );

    if (Platform.OS === "web" || error) {
      return (
        <View style={[styles.container, style]}>
          <Text style={styles.note}>
            {error ? `MapLibre failed: ${error}` : "MapLibre view is native-only."}
          </Text>
        </View>
      );
    }

    if (!styleJSON) {
      return (
        <View style={[styles.container, { backgroundColor: colors.background }, style]}>
          <Text style={[styles.note, { color: colors.muted }]}>Preparing the map…</Text>
        </View>
      );
    }

    const center: [number, number] = initialRegion
      ? [initialRegion.longitude, initialRegion.latitude]
      : [-122.2727, 37.8716];
    const initialZoom = initialRegion
      ? Math.log2(360 / Math.max(initialRegion.latitudeDelta, 0.0001))
      : 15;

    return (
      <View style={[styles.container, style]}>
        <MLMap
          style={styles.map}
          mapStyle={styleJSON}
          attribution={false}
          logo={false}
          onPress={onPress as any}
          onDidFinishLoadingMap={onMapLoaded}
        >
          <Camera
            ref={cameraRef}
            initialViewState={{ center, zoom: initialZoom }}
            minZoom={minZoomLevel}
            maxZoom={maxZoomLevel}
            maxBounds={MAX_BOUNDS}
          />
          {showsUserLocation && <UserLocation accuracy heading />}

          {/* Highlighted landmark — paper halo + red-ink crosshair ring so a
              deep-linked landmark is unmistakable after the camera flies in. */}
          {highlight && (
            <GeoJSONSource
              id="highlight-marker"
              data={{
                type: "Feature" as const,
                properties: {},
                geometry: {
                  type: "Point" as const,
                  coordinates: [highlight.longitude, highlight.latitude],
                },
              }}
            >
              <Layer
                id="highlight-halo"
                type="circle"
                paint={{
                  "circle-radius": 18,
                  "circle-color": "#F7F3EA",
                  "circle-opacity": 0.8,
                }}
              />
              <Layer
                id="highlight-ring"
                type="circle"
                paint={{
                  "circle-radius": 14,
                  "circle-color": "transparent",
                  "circle-stroke-width": 2.5,
                  "circle-stroke-color": INK_RED,
                }}
              />
              <Layer
                id="highlight-dot"
                type="circle"
                paint={{ "circle-radius": 4, "circle-color": INK_RED }}
              />
            </GeoJSONSource>
          )}

          {polylines.map((p, i) => (
            <GeoJSONSource
              key={`polyline-${i}`}
              id={`polyline-${i}`}
              data={{
                type: "Feature" as const,
                properties: {},
                geometry: {
                  type: "LineString" as const,
                  coordinates: p.coordinates.map((c) => [c.longitude, c.latitude]),
                },
              }}
            >
              <Layer
                id={`polyline-line-${i}`}
                type="line"
                layout={{
                  "line-cap": "round",
                  "line-join": "round",
                  ...(p.lineDashPattern ? { "line-dasharray": p.lineDashPattern } : {}),
                }}
                paint={{
                  "line-color": p.strokeColor ?? colors.tint,
                  "line-width": p.strokeWidth ?? 3,
                }}
              />
            </GeoJSONSource>
          ))}

          {markerGeoJSON && (
            <GeoJSONSource
              ref={shapeRef}
              id="landmarks"
              data={markerGeoJSON}
              cluster={!labelled}
              clusterRadius={clusterRadius}
              clusterMaxZoom={clusterMaxZoom}
              onPress={handleShapePress}
            >
              {/* Individual landmark pins; numbered when they are tour stops. */}
              <Layer
                id="landmark-pins"
                type="circle"
                filter={["!", ["has", "point_count"]]}
                paint={{
                  "circle-radius": labelled ? 12 : 6,
                  "circle-color": ["get", "pinColor"] as any,
                  "circle-stroke-width": 2,
                  "circle-stroke-color": CREAM,
                }}
              />
              {labelled ? (
                <Layer
                  id="landmark-pin-labels"
                  type="symbol"
                  filter={["!", ["has", "point_count"]]}
                  layout={{
                    "text-field": ["get", "label"] as any,
                    "text-font": ["Noto Sans Bold"],
                    "text-size": 12,
                    "text-anchor": "center",
                    "text-allow-overlap": true,
                    "text-ignore-placement": true,
                    // The baked glyphs sit high; same correction as the cluster counts.
                    "text-offset": [0.05, 1.1],
                  }}
                  paint={{ "text-color": CREAM }}
                />
              ) : null}
              {/* Cluster bubble */}
              <Layer
                id="landmark-clusters"
                type="circle"
                filter={["has", "point_count"]}
                paint={{
                  "circle-radius": [
                    "step",
                    ["get", "point_count"],
                    15,
                    5,
                    19,
                    15,
                    24,
                    40,
                    30,
                    100,
                    37,
                  ] as any,
                  "circle-color": [
                    "step",
                    ["get", "point_count"],
                    "#F7F3EA",
                    10,
                    "#F7F3EA",
                    50,
                    "#F7F3EA",
                  ] as any,
                  "circle-stroke-width": ["step", ["get", "point_count"], 2.5, 15, 3, 40, 3.5, 100, 4] as any,
                  "circle-stroke-color": "#0B2E8C",
                }}
              />
              {/* Cluster count */}
              <Layer
                id="landmark-cluster-count"
                type="symbol"
                filter={["has", "point_count"]}
                layout={{
                  "text-field": ["get", "point_count_abbreviated"] as any,
                  "text-font": ["Noto Sans Bold"],
                  "text-size": 13,
                  "text-anchor": "center",
                  "text-justify": "center",
                  "text-pitch-alignment": "viewport",
                  "text-rotation-alignment": "viewport",
                  "text-allow-overlap": true,
                  "text-ignore-placement": true,
                  "text-offset": [0.05, 1.1],
                }}
                paint={{ "text-color": "#423F3B" }}
              />
            </GeoJSONSource>
          )}

        </MLMap>
      </View>
    );
  }
);

MapLibreMapView.displayName = "MapLibreMapView";

export default MapLibreMapView;

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  note: { fontSize: 13, textAlign: "center", padding: 24 },
});
