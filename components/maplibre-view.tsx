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
import { Directory, File, Paths } from "expo-file-system";
import { useColors } from "@/hooks/use-colors";
import { isoBounds, isoLine, isoPoint } from "@/lib/iso-map";
import { isoStyle } from "@/lib/iso-style";
import { ISO_TILES_VERSION } from "@/lib/iso-terrain.generated";
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
  /**
   * The guide's isometric city (scripts/iso/city.ts) instead of the flat
   * map: every coordinate is placed on the drawing, the view can't be
   * turned or tilted, and the reader's position is drawn by the map.
   */
  iso?: boolean;
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

const stagedPromise: Partial<Record<"flat" | "iso", Promise<{ pmtilesUri: string; glyphsUrl: string }>>> = {};

/** The tile file each map draws from, and the name its copy goes by (a new build gets a new name). */
const TILES = {
  flat: { name: "berkeley.pmtiles", module: () => require("../assets/map/berkeley.pmtiles") },
  iso: { name: `iso-${ISO_TILES_VERSION}.pmtiles`, module: () => require("../assets/map/iso.pmtiles") },
};

/** A bundled asset copied to `dest`: from the dev server in development (the asset loader stalls on large binaries), else from the app. */
async function stage(mod: number, dest: File) {
  if (dest.exists) return;
  const asset = Asset.fromModule(mod);
  if (asset.uri.startsWith("http")) {
    await File.downloadFileAsync(asset.uri, dest, { idempotent: true });
  } else {
    await asset.downloadAsync();
    new File(asset.localUri ?? asset.uri).copy(dest);
  }
}

/** Copy bundled map assets into real files so maplibre-native can mmap them. */
async function stageOfflineAssets(kind: "flat" | "iso"): Promise<{ pmtilesUri: string; glyphsUrl: string }> {
  const tiles = new File(Paths.cache, TILES[kind].name);
  await stage(TILES[kind].module(), tiles);
  // Earlier builds' copies of the isometric tiles go.
  for (const f of Paths.cache.list()) {
    if (f instanceof File && /^iso-.*\.pmtiles$/.test(f.name) && f.name !== TILES.iso.name) f.delete();
  }

  // Glyph PBFs, in their fontstack/range.pbf folders.
  const glyphs = new Directory(Paths.cache, "map-glyphs");
  await Promise.all(
    Object.entries(GLYPH_ASSETS).map(async ([key, mod]) => {
      const [stack, range] = key.split("/");
      const dir = new Directory(glyphs, stack);
      dir.create({ intermediates: true, idempotent: true });
      await stage(mod as number, new File(dir, `${range}.pbf`));
    }),
  );

  return {
    pmtilesUri: `pmtiles://${tiles.uri}`,
    glyphsUrl: `${glyphs.uri.replace(/\/$/, "")}/{fontstack}/{range}.pbf`,
  };
}

function useOfflineAssets(kind: "flat" | "iso") {
  const [uris, setUris] = useState<{ kind: string; pmtilesUri: string; glyphsUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (Platform.OS === "web") return;
    const staged = (stagedPromise[kind] ??= stageOfflineAssets(kind));
    let cancelled = false;
    staged
      .then((u) => !cancelled && setUris({ ...u, kind }))
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [kind]);
  return { uris: uris?.kind === kind ? uris : null, error };
}

/** Where the reader is, watched while the isometric map is open (the native puck can't be placed on the drawing). */
function useReaderPosition(enabled: boolean) {
  const [at, setAt] = useState<Coordinate | null>(null);
  useEffect(() => {
    if (!enabled || Platform.OS === "web") return;
    let sub: { remove: () => void } | null = null;
    let cancelled = false;
    (async () => {
      try {
        const Location = await import("expo-location");
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted" || cancelled) return;
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 5 },
          (p) => setAt({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
        );
        if (cancelled) sub.remove();
      } catch {
        /* no position: no mark */
      }
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [enabled]);
  return at;
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
      iso = false,
      children,
    },
    ref
  ) => {
    const scheme = useColorScheme();
    const colors = useColors();
    const { uris, error } = useOfflineAssets(iso ? "iso" : "flat");
    // Where a coordinate goes on this map: straight on, or onto the drawing.
    const place = useCallback(
      (c: Coordinate, above?: number): [number, number] => (iso ? isoPoint(c, above) : [c.longitude, c.latitude]),
      [iso],
    );
    const reader = useReaderPosition(iso && !!showsUserLocation);
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
              center: place(coord, 6),
              zoom,
              ...(padding ? { padding } : null),
              duration: 900,
            }),
          ),
        fitCoords: (coords, padding = DEFAULT_PADDING) => {
          if (coords.length === 0) return;
          const placed = coords.map((c) => place(c));
          const lats = placed.map((c) => c[1]);
          const lngs = placed.map((c) => c[0]);
          run(() =>
            cameraRef.current?.fitBounds(
              [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
              { padding, duration: 900 },
            ),
          );
        },
      }),
      [run, place],
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
            // On the drawing, a pin stands over its building.
            coordinates: place(m.coordinate, 14),
          },
        })),
      };
    }, [clusterMarkers, place]);
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
      if (iso) return isoStyle(uris) as any;
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
    }, [scheme, uris, iso]);

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

    const center: [number, number] = place(
      initialRegion ? initialRegion : { latitude: 37.8716, longitude: -122.2727 },
    );
    const initialZoom =
      (initialRegion ? Math.log2(360 / Math.max(initialRegion.latitudeDelta, 0.0001)) : 15) - (iso ? 0.6 : 0);

    return (
      <View style={[styles.container, style]}>
        <MLMap
          style={styles.map}
          mapStyle={styleJSON}
          attribution={false}
          logo={false}
          touchRotate={!iso}
          touchPitch={!iso}
          onPress={onPress as any}
          onDidFinishLoadingMap={onMapLoaded}
        >
          <Camera
            ref={cameraRef}
            initialViewState={{ center, zoom: initialZoom }}
            minZoom={iso ? 11.5 : minZoomLevel}
            maxZoom={iso ? 18.5 : maxZoomLevel}
            maxBounds={iso ? isoBounds() : MAX_BOUNDS}
          />
          {showsUserLocation && !iso && <UserLocation accuracy heading />}
          {/* The reader, on the drawing: a vermilion ring and dot on paper. */}
          {iso && reader && (
            <GeoJSONSource
              id="reader"
              data={{ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: place(reader) } }}
            >
              <Layer id="reader-halo" type="circle" paint={{ "circle-radius": 11, "circle-color": CREAM, "circle-opacity": 0.9 }} />
              <Layer
                id="reader-ring"
                type="circle"
                paint={{ "circle-radius": 9, "circle-color": "transparent", "circle-stroke-width": 2.5, "circle-stroke-color": INK_RED }}
              />
              <Layer id="reader-dot" type="circle" paint={{ "circle-radius": 4, "circle-color": INK_RED }} />
            </GeoJSONSource>
          )}

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
                  coordinates: place(highlight, 14),
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
                  coordinates: iso ? isoLine(p.coordinates) : p.coordinates.map((c) => [c.longitude, c.latitude]),
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
              clusterRadius={iso ? Math.min(clusterRadius, 36) : clusterRadius}
              clusterMaxZoom={clusterMaxZoom}
              onPress={handleShapePress}
            >
              {/* Individual landmark pins; numbered when they are tour stops. */}
              <Layer
                id="landmark-pins"
                type="circle"
                filter={["!", ["has", "point_count"]]}
                paint={{
                  // Numbered stops shrink as the map draws out, so a walk's pins don't pile up.
                  "circle-radius": labelled ? (["interpolate", ["linear"], ["zoom"], 11.5, 5, 13, 8, 14.5, 12] as any) : 6,
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
                    "text-size": ["interpolate", ["linear"], ["zoom"], 13, 9, 14.5, 12] as any,
                    "text-anchor": "center",
                    "text-allow-overlap": true,
                    "text-ignore-placement": true,
                    // The baked glyphs sit high; same correction as the cluster counts.
                    "text-offset": [0.05, 1.1],
                  }}
                  paint={{ "text-color": CREAM, "text-opacity": ["step", ["zoom"], 0, 12.8, 1] as any }}
                />
              ) : null}
              {/* Cluster bubble */}
              <Layer
                id="landmark-clusters"
                type="circle"
                filter={["has", "point_count"]}
                paint={{
                  // Smaller on the drawing, which they'd otherwise cover.
                  "circle-radius": (iso
                    ? ["step", ["get", "point_count"], 11, 5, 13, 15, 16, 40, 19, 100, 22]
                    : ["step", ["get", "point_count"], 15, 5, 19, 15, 24, 40, 30, 100, 37]) as any,
                  "circle-color": [
                    "step",
                    ["get", "point_count"],
                    "#F7F3EA",
                    10,
                    "#F7F3EA",
                    50,
                    "#F7F3EA",
                  ] as any,
                  "circle-stroke-width": (iso ? 2 : ["step", ["get", "point_count"], 2.5, 15, 3, 40, 3.5, 100, 4]) as any,
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
                  "text-size": iso ? 11 : 13,
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
