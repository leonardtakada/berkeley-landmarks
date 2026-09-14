import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Platform, Text, View, StyleSheet } from "react-native";
import MapView, { Marker, Polyline, Polygon, Region, UrlTile } from "react-native-maps";
import SuperCluster from "supercluster";
import { useColors } from "@/hooks/use-colors";
import {
  prefetchBerkeleyTiles,
  cachedTileTemplate,
  noteMapInteraction,
  type TileScheme,
} from "@/lib/tile-cache";
import { MID_RECT, BERKELEY_BOUNDARY } from "@/lib/tiles-manifest.generated";
import { useColorScheme } from "@/hooks/use-color-scheme";

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
  onSelect?: () => void;
  pinColor?: string;
  tracksViewChanges?: boolean;
  tracksInfoWindowChanges?: boolean;
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

interface MapViewWrapperProps {
  style?: any;
  initialRegion?: RegionLike;
  minZoomLevel?: number;
  onRegionChangeComplete?: (region: Region) => void;
  maxZoomLevel?: number;
  region?: RegionLike | undefined;
  onPress?: () => void;
  showsUserLocation?: boolean;
  showsCompass?: boolean;
  showsScale?: boolean;
  mapType?: "standard" | "satellite" | "hybrid" | "terrain" | "mutedStandard";
  children?: React.ReactNode;
  /** Marker data for clustering (replaces children markers when provided) */
  clusterMarkers?: Array<{
    id: string;
    coordinate: Coordinate;
    pinColor?: string;
    onPress?: () => void;
  }>;
  clusterRadius?: number;
  clusterMaxZoom?: number;
}

export function MapMarker(props: MarkerProps) {
  const { title: _t, description: _d, ...rest } = props;
  return (
    <Marker
      {...rest}
      onSelect={props.onPress}
    />
  );
}

export function MapPolyline(props: PolylineProps) {
  return <Polyline {...props} />;
}

export function MapPolygon(props: PolygonProps) {
  const { holes, ...rest } = props;
  // react-native-maps requires `holes` on iOS; cast to satisfy its types.
  return <Polygon {...(rest as any)} holes={holes as any} />;
}

/** Convert map latitudeDelta to integer zoom level (approximate) */
function regionToZoom(region: RegionLike): number {
  return Math.round(Math.log2(360 / region.latitudeDelta));
}

/** Startup cover: themed paper hides Apple's base map until tiles are live. */
function LoadingCover({ progress }: { progress: number }) {
  const colors = useColors();
  return (
    <View style={styles.paperTint} pointerEvents="none">
      <View style={{ ...styles.paperTint, backgroundColor: colors.background }} />
      <View
        style={{
          ...styles.paperTint,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: colors.muted, fontSize: 13, letterSpacing: 1 }}>
          {progress > 0 && progress < 100
            ? `Preparing the map… ${progress}%`
            : "Preparing the map…"}
        </Text>
      </View>
    </View>
  );
}

/** Real Berkeley city boundary (OSM) drawn as an accent ink line. */
function CityBoundaryOverlay() {
  const colors = useColors();
  const coords = BERKELEY_BOUNDARY.map(([la, lo]) => ({ latitude: la, longitude: lo }));
  return (
    <Polyline
      coordinates={coords as any}
      strokeColor={colors.tint}
      strokeWidth={2.5}
      tappable={false}
    />
  );
}

function PaperTintOverlay() {
  const colors = useColors();
  const dark = colors.background === "#1C1B19";
  const tint = dark ? "rgba(28,27,25,0.15)" : "rgba(0,0,0,0)";
  return <View pointerEvents="none" style={[styles.paperTint, { backgroundColor: tint }]} />;
}

const MapViewWrapper = forwardRef<any, MapViewWrapperProps>(
  ({ children, clusterMarkers, clusterRadius = 50, clusterMaxZoom = 15, ...props }, ref) => {
    const [currentRegion, setCurrentRegion] = useState<RegionLike | null>(null);
    const systemScheme = useColorScheme();
    const scheme: TileScheme = systemScheme === "dark" ? "dark" : "light";
    const mapRef = useRef<any>(null);
    // Wrap the inner MapView ref with a common camera API (matching the
    // MapLibre wrapper) plus all native MapView methods.
    useImperativeHandle(
      ref as any,
      () => {
        const inner = mapRef.current ?? {};
        const merged: any = { ...inner };
        merged.flyToCoord = (coord: { latitude: number; longitude: number }) =>
          mapRef.current?.animateToRegion(
            { ...coord, latitudeDelta: 0.004, longitudeDelta: 0.004 },
            500
          );
        merged.fitCoords = (coords: Array<{ latitude: number; longitude: number }>) =>
          mapRef.current?.fitBounds(coords, {
            edgePadding: { top: 80, right: 40, bottom: 200, left: 40 },
            animated: true,
          });
        return merged;
      },
      []
    );
    const setRefs = useCallback(
      (r: any) => {
        mapRef.current = r;
        if (typeof ref === "function") ref(r);
        else if (ref && typeof ref === "object") (ref as any).current = r;
      },
      [ref]
    );
    // On-disk tile cache: after the Berkeley prefetch completes, serve tiles
    // from the filesystem so the map keeps rendering offline.
    const [tileTemplate, setTileTemplate] = useState(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    );
    const [mapProgress, setMapProgress] = useState(0);
    // Deep-zoom (z17) tiles ship baked in the container — no on-device
    // generation, so the full zoom range is available immediately.
    // Clamp-animation guard: see handleRegionChangeComplete.
    const lastClampAtRef = useRef(0);
    const maxZ = 17;
    // Don't reveal the map until our themed tiles are live — never flash
    // Apple's default base map during startup.
    const tilesReady =
      Platform.OS === "web" || tileTemplate.startsWith("file://");
    useEffect(() => {
      if (Platform.OS === "web") return;
      let cancelled = false;
      prefetchBerkeleyTiles(scheme, (done, total) => {
        if (!cancelled) setMapProgress(Math.round((done / total) * 100));
      })
        .then(() => cachedTileTemplate(scheme))
      .then((template) => {
        if (!cancelled) setTileTemplate(template);
      })
      .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [scheme]);
    const clusterEngine = useRef<SuperCluster>(
      new SuperCluster({ radius: clusterRadius, maxZoom: clusterMaxZoom })
    );

    // Index markers into supercluster
    const points = useMemo(() => {
      if (!clusterMarkers) return [];
      return clusterMarkers.map((m) => ({
        type: "Feature" as const,
        properties: {
          cluster: false,
          id: m.id,
          pinColor: m.pinColor,
          onPress: m.onPress,
        },
        geometry: {
          type: "Point" as const,
          coordinates: [m.coordinate.longitude, m.coordinate.latitude],
        },
      }));
    }, [clusterMarkers]);

    useEffect(() => {
      if (points.length > 0) {
        clusterEngine.current.load(points);
      }
    }, [points]);

    // Get clusters for current viewport
    const clusters = useMemo(() => {
      if (!currentRegion || points.length === 0) return [];
      const { longitudeDelta, latitude, longitude } = currentRegion;
      const bounds: [number, number, number, number] = [
        longitude - longitudeDelta,
        latitude - longitudeDelta,
        longitude + longitudeDelta,
        latitude + longitudeDelta,
      ];
      const zoom = regionToZoom(currentRegion);
      // eslint-disable-next-line react-hooks/refs -- ref holds a stable engine instance; safe to read here
      return clusterEngine.current.getClusters(bounds, zoom);
    }, [currentRegion, points]);

    // Keep the user inside the themed area: the map only exists out to
    // MID_RECT (baked tiles + far-ring fade), so clamp panning/zooming there.
    // Guard: a clamp fires animateToRegion, which itself triggers
    // onRegionChangeComplete. During a pinch-out MapKit also emits many
    // region events, and stacking animateToRegion calls on top of an active
    // gesture / our own in-flight clamp animation creates a feedback loop
    // (re-clamp → re-animate → …) that destabilized/crashed the app. Skip
    // clamping while our previous clamp animation is still settling.
    const handleRegionChangeComplete = useCallback((region: Region) => {
      const r = region as RegionLike;
      // Baked tiles only exist for z11–16 inside MID_RECT. Keep the max
      // zoom-out at ~z12 (delta ≈ 360/2^12) so tiles never run out, and keep
      // the viewport fully inside MID_RECT (no half-outside blank edges).
      const PAD_LAT = 0.006, PAD_LON = 0.008;
      const MAX_DELTA = 0.085;
      // iOS ignores maxZoomLevel on Apple Maps — baked tiles stop at z16,
      // so zooming past ~z16 (delta < 360/2^16) blanks the map. Clamp it here.
      // Zoom-in: no clamp — at full zoom any correction reads as "the map
      // zooms out by itself". z17 is baked; users who pinch past it just get
      // empty paper, which is normal map behavior.
      const MIN_DELTA = 0;
      const lonDelta = Math.min(
        Math.max(r.longitudeDelta, MIN_DELTA),
        MAX_DELTA * 1.35
      );
      const latDelta = Math.min(Math.max(r.latitudeDelta, MIN_DELTA), MAX_DELTA);
      const lat = Math.min(
        Math.max(r.latitude, MID_RECT.minLat - PAD_LAT + latDelta / 2),
        MID_RECT.maxLat + PAD_LAT - latDelta / 2
      );
      const lon = Math.min(
        Math.max(r.longitude, MID_RECT.minLon - PAD_LON + lonDelta / 2),
        MID_RECT.maxLon + PAD_LON - lonDelta / 2
      );
      if (Date.now() - lastClampAtRef.current < 450) {
        // Our own clamp animation (or a gesture still settling) — don't
        // re-clamp on top of it; just record the region.
        setCurrentRegion(r);
        return;
      }
      if (
        Math.abs(latDelta - r.latitudeDelta) > r.latitudeDelta * 0.15 ||
        Math.abs(lonDelta - r.longitudeDelta) > r.longitudeDelta * 0.15 ||
        Math.abs(lat - r.latitude) > 0.002 ||
        Math.abs(lon - r.longitude) > 0.002
      ) {
        lastClampAtRef.current = Date.now();
        mapRef.current?.animateToRegion(
          { latitude: lat, longitude: lon, latitudeDelta: latDelta, longitudeDelta: lonDelta },
          350
        );
      }
      setCurrentRegion(r);
    }, []);

    // If clustering is enabled and markers are provided, render clustered view
    if (clusterMarkers && clusterMarkers.length > 0) {
      return (
        <View style={styles.mapShell}>
          <MapView
            ref={setRefs}
            onRegionChange={() => noteMapInteraction()}
            maxZoomLevel={maxZ}
            {...props}
            onRegionChangeComplete={handleRegionChangeComplete}
          >
            <UrlTile
              urlTemplate={tileTemplate}
              minimumZ={11}
              maximumZ={maxZ}
              shouldReplaceMapContent
              zIndex={-1}
            />
            <CityBoundaryOverlay />
            {/* Non-marker children (polygons, polylines) */}
          {React.Children.toArray(children).filter((child) => {
            if (!React.isValidElement(child)) return false;
            // Pass through everything except MapMarker
            return (child.type as any)?.name !== "MapMarker" && (child.type as any) !== MapMarker;
          })}

          {clusters.map((cluster) => {
            if (cluster.properties.cluster) {
              // Cluster bubble
              const [lng, lat] = cluster.geometry.coordinates;
              const count = cluster.properties.point_count;
              const size = count < 10 ? 36 : count < 50 ? 44 : 52;
              const bgColor = count < 10 ? "#7B8B6F" : count < 50 ? "#5D6B52" : "#3F4B36";
              return (
                <Marker
                  key={`cluster-${cluster.id}`}
                  coordinate={{ latitude: lat, longitude: lng }}
                  tracksViewChanges={false}
                  anchor={{ x: 0.5, y: 0.5 }}
                >
                  <View style={[styles.clusterBubble, { width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor }]}>
                    <Text style={styles.clusterText}>
                      {count}
                    </Text>
                  </View>
                </Marker>
              );
            }
            // Individual marker
            const [lng, lat] = cluster.geometry.coordinates;
            return (
              <Marker
                key={cluster.properties.id}
                coordinate={{ latitude: lat, longitude: lng }}
                pinColor={cluster.properties.pinColor}
                tracksViewChanges={false}
                onSelect={cluster.properties.onPress}
              />
            );
            })}
          </MapView>
          {tilesReady ? null : <LoadingCover progress={mapProgress} />}
          <PaperTintOverlay />
        </View>
      );
    }

    // Default: pass through children as-is (no clustering)
    return (
      <View style={styles.mapShell}>
        <MapView
          ref={setRefs}
          onRegionChange={() => noteMapInteraction()}
          maxZoomLevel={maxZ}
          {...props}
          onRegionChangeComplete={(r: Region) => {
            handleRegionChangeComplete(r);
            props.onRegionChangeComplete?.(r);
          }}
        >
          <UrlTile
            urlTemplate={tileTemplate}
            minimumZ={11}
            maximumZ={maxZ}
            shouldReplaceMapContent
            zIndex={-1}
          />
          <CityBoundaryOverlay />
          {children}
        </MapView>
        {tilesReady ? null : <LoadingCover progress={mapProgress} />}
        <PaperTintOverlay />
      </View>
    );
  }
);

MapViewWrapper.displayName = "MapViewWrapper";

export default MapViewWrapper;

const styles = StyleSheet.create({
  mapShell: { flex: 1 },
  paperTint: { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0 },
  clusterBubble: {
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.25,
        shadowRadius: 2,
      },
      android: { elevation: 3 },
    }),
  },
  clusterText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
    lineHeight: 15,
    textAlign: "center",
    includeFontPadding: false,
  },
});
