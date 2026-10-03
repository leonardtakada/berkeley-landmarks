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
import React, { forwardRef, useCallback, useEffect, useEffectEvent, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useColorScheme } from "react-native";
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MLMap,
  UserLocation,
} from "@maplibre/maplibre-react-native";
import type { CameraRef, GeoJSONSourceRef, MapRef } from "@maplibre/maplibre-react-native";
import { useReducedMotion, useSharedValue } from "react-native-reanimated";
import { Asset } from "expo-asset";
import { Directory, File, Paths } from "expo-file-system";
import { IsoWalkers, type MapView } from "@/components/iso-walkers";
import { useColors } from "@/hooks/use-colors";
import type { Fix } from "@/lib/arrival";
import { isoBounds, isoGroundShape, isoLine, isoPoint, onDrawing } from "@/lib/iso-map";
import { isoStyle } from "@/lib/iso-style";
import { ISO_TILES_BYTES, ISO_TILES_VERSION } from "@/lib/iso-terrain.generated";
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
  /** Brings a place into the clear (inside `padding`) if it isn't already, at the same zoom. */
  reveal?: (coord: Coordinate, padding: CameraPadding) => void;
  fitCoords: (coords: Coordinate[], padding?: CameraPadding) => void;
  /**
   * Finds the reader and keeps them in view as they walk, until the map is
   * moved by hand. Resolves to how that went.
   */
  locate?: () => Promise<LocateResult>;
}

/** Finding the reader: shown and followed, off the map, location refused, or not found in time. */
export type LocateResult = "shown" | "off-map" | "denied" | "unknown";

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
  /** Where the camera opens, overriding the zoom `initialRegion`'s span would give. */
  initialZoom?: number;
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
  /** Hears when following the reader starts, and stops (the map moved by hand, or sent elsewhere). */
  onFollowChange?: (following: boolean) => void;
  /** Hears when the map has first drawn, tiles and all. */
  onLoaded?: () => void;
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

/** The tile file each map draws from, the name its copy goes by (a new build gets a new name), and its size when known. */
const TILES = {
  // (The flat map is a development fallback: a release build leaves its tiles out — constants/map-engine.)
  flat: { name: "berkeley.pmtiles", module: () => (__DEV__ ? require("../assets/map/berkeley.pmtiles") : 0), bytes: undefined },
  iso: { name: `iso-${ISO_TILES_VERSION}.pmtiles`, module: () => require("../assets/map/iso.pmtiles"), bytes: ISO_TILES_BYTES },
};

/**
 * A bundled asset copied to `dest`, whole: from the dev server in development
 * (the asset loader stalls on large binaries), else from the app. It's written
 * beside `dest` and moved into place once complete, so a copy cut short (the
 * app closed part way) is never taken for the real thing, and a copy already
 * there of the wrong size is made again.
 */
async function stage(mod: number, dest: File, bytes?: number) {
  const asset = Asset.fromModule(mod);
  const remote = asset.uri.startsWith("http");
  if (!remote) await asset.downloadAsync();
  const source = remote ? null : new File(asset.localUri ?? asset.uri);
  const size = bytes ?? source?.size;
  if (dest.exists && (!size || dest.size === size)) return;
  const part = new File(dest.parentDirectory, `${dest.name}.part`);
  if (part.exists) part.delete();
  if (source) await source.copy(part);
  else await File.downloadFileAsync(asset.uri, part, { idempotent: true });
  if (size && part.size !== size) {
    part.delete();
    throw new Error(`${dest.name}: copied ${part.size} of ${size} bytes`);
  }
  if (dest.exists) dest.delete();
  await part.move(dest);
}

/** Copy bundled map assets into real files so maplibre-native can mmap them. */
async function stageOfflineAssets(kind: "flat" | "iso"): Promise<{ pmtilesUri: string; glyphsUrl: string }> {
  const tiles = new File(Paths.cache, TILES[kind].name);
  await stage(TILES[kind].module(), tiles, TILES[kind].bytes);
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
    // (A copy that failed is tried again the next time the map opens.)
    const staged = (stagedPromise[kind] ??= stageOfflineAssets(kind).catch((e) => {
      delete stagedPromise[kind];
      throw e;
    }));
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

/**
 * Where the reader is, and which way they face, watched while the map is
 * open: every few metres, as closely as the phone can tell. (On the
 * isometric map the native puck can't be placed on the drawing, so the
 * reader is drawn by the map; either map can follow them.)
 */
function useReaderPosition(enabled: boolean, onFix: (fix: Fix) => void) {
  const [fix, setFix] = useState<Fix | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [denied, setDenied] = useState(false);
  const heard = useEffectEvent((f: Fix) => {
    setFix(f);
    onFix(f);
  });
  const refused = useEffectEvent(() => setDenied(true));
  useEffect(() => {
    if (!enabled || Platform.OS === "web") return;
    const subs: { remove: () => void }[] = [];
    let cancelled = false;
    (async () => {
      try {
        const Location = await import("expo-location");
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status !== "granted") {
          refused();
          return;
        }
        subs.push(
          await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 2 }, (p) =>
            heard({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }),
          ),
        );
        try {
          subs.push(
            await Location.watchHeadingAsync((h) => {
              const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
              if (deg < 0 || h.accuracy === 0) return;
              // Only a real turn redraws it.
              setHeading((was) => (was != null && Math.abs(((deg - was + 540) % 360) - 180) < 4 ? was : deg));
            }),
          );
        } catch {
          /* no compass: no facing */
        }
        if (cancelled) subs.forEach((s) => s.remove());
      } catch {
        /* no position: no mark */
      }
    })();
    return () => {
      cancelled = true;
      subs.forEach((s) => s.remove());
    };
  }, [enabled]);
  return { fix, heading, denied };
}

/** A point that glides to each new fix rather than jumping (straight there with Reduce Motion). */
function useGlide(target: Coordinate | null, ms = 600): Coordinate | null {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState<Coordinate | null>(target);
  const last = useRef<Coordinate | null>(target);
  const lat = target?.latitude;
  const lng = target?.longitude;
  useEffect(() => {
    if (lat == null || lng == null) return;
    const from = last.current ?? { latitude: lat, longitude: lng };
    const t0 = Date.now();
    let raf = 0;
    const step = () => {
      const k = reduceMotion ? 1 : Math.min(1, (Date.now() - t0) / ms);
      const e = 1 - (1 - k) ** 3;
      const p = { latitude: from.latitude + (lat - from.latitude) * e, longitude: from.longitude + (lng - from.longitude) * e };
      last.current = p;
      setShown(p);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [lat, lng, ms, reduceMotion]);
  return shown;
}

const NOTHING = { type: "FeatureCollection" as const, features: [] };
/** How far the reader's facing reaches across the ground, metres, and how wide it opens. */
const FACING_M = 26;
const FACING_DEG = 32;

/**
 * The reader, on the drawing: the fix's uncertainty as a disc lying on the
 * ground, the way they face as a wedge on the ground before them, and a
 * vermilion ring and dot on paper where they stand. Always mounted (empty
 * until there's a fix), so the other marks can be laid beneath it.
 */
function ReaderOnDrawing({ fix, heading }: { fix: Fix | null; heading: number | null }) {
  const at = useGlide(fix);
  const accuracy = fix?.accuracy ?? null;
  const ground = useMemo(() => {
    if (!at) return NOTHING;
    const features = [];
    if (accuracy != null && accuracy > 8) {
      const r = Math.min(accuracy, 250);
      const disc = Array.from({ length: 41 }, (_, i) => {
        const a = ((i % 40) / 40) * Math.PI * 2;
        return [Math.cos(a) * r, Math.sin(a) * r] as [number, number];
      });
      features.push({ type: "Feature" as const, properties: { k: "a" }, geometry: { type: "Polygon" as const, coordinates: [isoGroundShape(at, disc)] } });
    }
    if (heading != null) {
      const arc = (radius: number) =>
        Array.from({ length: 9 }, (_, i) => {
          const a = ((heading - FACING_DEG + (i * FACING_DEG * 2) / 8) * Math.PI) / 180;
          return [Math.sin(a) * radius, Math.cos(a) * radius] as [number, number];
        });
      const wedge = [...arc(4), ...arc(FACING_M).reverse()];
      wedge.push(wedge[0]);
      features.push({ type: "Feature" as const, properties: { k: "h" }, geometry: { type: "Polygon" as const, coordinates: [isoGroundShape(at, wedge)] } });
    }
    return { type: "FeatureCollection" as const, features };
  }, [at, accuracy, heading]);
  const point = at ? { type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: isoPoint(at) } } : NOTHING;
  return (
    <>
      <GeoJSONSource id="reader-ground" data={ground}>
        <Layer id="reader-accuracy" type="fill" filter={["==", ["get", "k"], "a"]} paint={{ "fill-color": INK_RED, "fill-opacity": 0.1 }} />
        <Layer id="reader-facing" type="fill" filter={["==", ["get", "k"], "h"]} paint={{ "fill-color": INK_RED, "fill-opacity": 0.3 }} />
      </GeoJSONSource>
      <GeoJSONSource id="reader" data={point}>
        <Layer id="reader-halo" type="circle" paint={{ "circle-radius": 11, "circle-color": CREAM, "circle-opacity": 0.9 }} />
        <Layer
          id="reader-ring"
          type="circle"
          paint={{ "circle-radius": 9, "circle-color": "transparent", "circle-stroke-width": 2.5, "circle-stroke-color": INK_RED }}
        />
        <Layer id="reader-dot" type="circle" paint={{ "circle-radius": 4, "circle-color": INK_RED }} />
      </GeoJSONSource>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

// Keep the viewport inside the Berkeley area (parity with the raster
// wrapper's region clamps; maplibre-native enforces these natively).
// LngLatBounds tuple order: [west, south, east, north].
const MAX_BOUNDS: [number, number, number, number] = [-122.41, 37.785, -122.15, 37.965];
const inBounds = (c: Coordinate) =>
  c.longitude >= MAX_BOUNDS[0] && c.latitude >= MAX_BOUNDS[1] && c.longitude <= MAX_BOUNDS[2] && c.latitude <= MAX_BOUNDS[3];

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
      initialZoom: openingZoom,
      minZoomLevel = 12,
      maxZoomLevel = 17,
      onPress,
      showsUserLocation,
      clusterMarkers,
      clusterRadius = 50,
      clusterMaxZoom = 15,
      highlight,
      iso = false,
      onFollowChange,
      onLoaded,
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
    const cameraRef = useRef<CameraRef>(null);
    const mapRef = useRef<MapRef>(null);
    const shapeRef = useRef<GeoJSONSourceRef>(null);
    const size = useRef({ width: 0, height: 0 });

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
      onLoaded?.();
      const move = pending.current;
      pending.current = null;
      // One frame for the camera to attach before it is driven.
      if (move) requestAnimationFrame(move);
    }, [onLoaded]);

    // Following the reader: the camera keeps them in view as they walk,
    // until the map is moved by hand or sent somewhere else.
    const following = useRef(false);
    const follow = (on: boolean) => {
      if (following.current === on) return;
      following.current = on;
      onFollowChange?.(on);
    };
    const zoom = useRef(15);
    // What the map shows, for the walkers to keep to (read each frame on the UI thread, so no render).
    const view = useSharedValue<MapView>(null);
    const locating = useRef<((r: LocateResult) => void) | null>(null);
    const latest = useRef<Fix | null>(null);
    /** Takes the camera to the reader, and follows them from there. */
    const showReader = (fix: Fix): LocateResult => {
      if (iso ? !onDrawing(fix) : !inBounds(fix)) return "off-map";
      follow(true);
      run(() => cameraRef.current?.flyTo({ center: place(fix), zoom: Math.max(zoom.current, 16.5), duration: 900 }));
      return "shown";
    };
    const reader = useReaderPosition(!!showsUserLocation, (fix) => {
      latest.current = fix;
      if (locating.current) {
        const done = locating.current;
        locating.current = null;
        done(showReader(fix));
      } else if (following.current) {
        run(() => cameraRef.current?.easeTo({ center: place(fix), duration: 800, easing: "linear" }));
      }
    });
    const denied = reader.denied;
    // On the drawing, everything laid on the map goes under the reader's mark;
    // a walk's route goes under the walkers too, who walk along it.
    const under = iso ? "reader-accuracy" : undefined;
    const underWalkers = iso ? "walkers" : undefined;

    // The screen's camera API. (The native MapRef is kept private: forwarding
    // it through the same ref would replace this handle once the map mounts.)
    useImperativeHandle(
      ref,
      () => ({
        flyToCoord: (coord, to = 16, padding) => {
          follow(false);
          run(() =>
            cameraRef.current?.flyTo({
              center: place(coord, 6),
              zoom: to,
              ...(padding ? { padding } : null),
              duration: 900,
            }),
          );
        },
        reveal: (coord, padding) => {
          run(async () => {
            const at = place(coord, 6);
            try {
              const [x, y] = (await mapRef.current?.project(at)) ?? [0, 0];
              const { width, height } = size.current;
              const clear =
                x >= (padding.left ?? 0) &&
                x <= width - (padding.right ?? 0) &&
                y >= (padding.top ?? 0) &&
                y <= height - (padding.bottom ?? 0);
              if (clear) return;
            } catch {
              /* (unknown: move it to be sure) */
            }
            follow(false);
            cameraRef.current?.easeTo({ center: at, padding, duration: 500 });
          });
        },
        fitCoords: (coords, padding = DEFAULT_PADDING) => {
          if (coords.length === 0) return;
          follow(false);
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
        locate: () =>
          new Promise<LocateResult>((resolve) => {
            if (denied) return resolve("denied");
            if (latest.current) return resolve(showReader(latest.current));
            // Not found yet: the first fix answers, or the wait runs out.
            locating.current?.("unknown");
            locating.current = resolve;
            setTimeout(() => {
              if (locating.current !== resolve) return;
              locating.current = null;
              resolve("unknown");
            }, 15_000);
          }),
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps -- follow/showReader read refs
      [run, place, denied],
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
        // (The press also reaches the map, which would put the entry away.)
        event?.stopPropagation?.();
        const feature = event?.nativeEvent?.features?.[0];
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

    /**
     * On the drawing, the landmarks are buildings as well as pins: close in,
     * a press on a landmark's building — anywhere from its foot up past its
     * pin, or a little to either side — opens it, the nearest if two are
     * close. Further out, where buildings are specks, the pins answer alone.
     */
    const landmarkAt = useCallback(
      (lngLat: [number, number]) => {
        if (!iso || zoom.current < 14.5 || !clusterMarkers?.length) return null;
        const perDeg = (512 * 2 ** zoom.current) / 360;
        let best: { mk: ClusterMarker; d: number } | null = null;
        for (const mk of clusterMarkers) {
          if (!mk.onPress) continue;
          const foot = place(mk.coordinate, 0);
          const top = place(mk.coordinate, 20);
          // Points from the press to the building's upright, foot to top.
          const [ax, ay, bx, by] = [foot[0], foot[1], top[0], top[1]];
          const [px, py] = lngLat;
          const len2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
          const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / len2));
          const d = Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay))) * perDeg;
          // As wide as the building, roughly (about 12 m either side), never under a fingertip.
          const reach = Math.max(22, (Math.sqrt(len2) / 20) * 12 * perDeg);
          if (d <= reach && (!best || d < best.d)) best = { mk, d };
        }
        return best?.mk ?? null;
      },
      [iso, clusterMarkers, place],
    );

    const handleMapPress = useCallback(
      (event: any) => {
        const lngLat = event?.nativeEvent?.lngLat as [number, number] | undefined;
        const hit = lngLat ? landmarkAt(lngLat) : null;
        if (hit) hit.onPress?.();
        else onPress?.();
      },
      [landmarkAt, onPress],
    );

    if (Platform.OS === "web" || error) {
      return (
        <View style={[styles.container, style]}>
          <Text style={styles.note}>
            {error
              ? __DEV__
                ? `MapLibre failed: ${error}`
                : "The map couldn't be laid out just now. Fold it away and open it again."
              : "MapLibre view is native-only."}
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
      openingZoom ??
      (initialRegion ? Math.log2(360 / Math.max(initialRegion.latitudeDelta, 0.0001)) : 15) - (iso ? 0.6 : 0);

    return (
      <View
        style={[styles.container, style]}
        onLayout={(e) => {
          size.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height };
        }}
      >
        <MLMap
          ref={mapRef}
          style={styles.map}
          mapStyle={styleJSON}
          attribution={false}
          logo={false}
          touchRotate={!iso}
          touchPitch={!iso}
          onPress={handleMapPress}
          onDidFinishLoadingMap={onMapLoaded}
          onRegionWillChange={(e) => {
            if (e.nativeEvent.userInteraction) follow(false);
          }}
          onRegionIsChanging={(e) => {
            view.set({ bounds: e.nativeEvent.bounds, zoom: e.nativeEvent.zoom });
          }}
          onRegionDidChange={(e) => {
            zoom.current = e.nativeEvent.zoom;
            view.set({ bounds: e.nativeEvent.bounds, zoom: e.nativeEvent.zoom });
          }}
        >
          <Camera
            ref={cameraRef}
            initialViewState={{ center, zoom: initialZoom }}
            minZoom={iso ? 11.5 : minZoomLevel}
            maxZoom={iso ? 18.5 : maxZoomLevel}
            maxBounds={iso ? isoBounds() : MAX_BOUNDS}
          />
          {showsUserLocation && !iso && <UserLocation accuracy heading />}
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
                beforeId={under}
                type="circle"
                paint={{
                  "circle-radius": 18,
                  "circle-color": "#F7F3EA",
                  "circle-opacity": 0.8,
                }}
              />
              <Layer
                id="highlight-ring"
                beforeId={under}
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
                beforeId={under}
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
                beforeId={underWalkers}
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
                beforeId={under}
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
                beforeId={under}
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
                beforeId={under}
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
                beforeId={under}
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

          {/* The architects out walking, among the houses. */}
          {iso && <IsoWalkers view={view} />}
          {/* Last, so it's drawn over everything else laid on the map. */}
          {iso && <ReaderOnDrawing fix={reader.fix} heading={reader.heading} />}
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
