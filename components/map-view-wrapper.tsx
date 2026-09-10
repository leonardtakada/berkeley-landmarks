import React, { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Text, View, StyleSheet } from "react-native";
import MapView, { Marker, Polyline, Polygon, Region, UrlTile } from "react-native-maps";
import SuperCluster from "supercluster";
import { useColors } from "@/hooks/use-colors";
import { prefetchBerkeleyTiles, cachedTileTemplate } from "@/lib/tile-cache";
import { MID_RECT } from "@/lib/tiles-manifest.generated";

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

/**
 * The baked tile set carries the theme out to MID_RECT with a progressive
 * blur; beyond that this solid overlay (theme background, MID_RECT as a hole)
 * hides Apple's default map entirely — no hard edge anywhere.
 */
function FarRingOverlay() {
  const colors = useColors();
  const pad = 1.2; // generous outer bounds; the hole edge is what matters
  const outer: Coordinate[] = [
    { latitude: MID_RECT.minLat - pad, longitude: MID_RECT.minLon - pad * 1.3 },
    { latitude: MID_RECT.minLat - pad, longitude: MID_RECT.maxLon + pad * 1.3 },
    { latitude: MID_RECT.maxLat + pad, longitude: MID_RECT.maxLon + pad * 1.3 },
    { latitude: MID_RECT.maxLat + pad, longitude: MID_RECT.minLon - pad * 1.3 },
  ];
  const inner: Coordinate[] = [
    { latitude: MID_RECT.minLat, longitude: MID_RECT.minLon },
    { latitude: MID_RECT.minLat, longitude: MID_RECT.maxLon },
    { latitude: MID_RECT.maxLat, longitude: MID_RECT.maxLon },
    { latitude: MID_RECT.maxLat, longitude: MID_RECT.minLon },
  ];
  return (
    <Polygon
      coordinates={outer as any}
      holes={[inner] as any}
      fillColor={colors.background}
      strokeColor="transparent"
      strokeWidth={0}
      tappable={false}
    />
  );
}

/** Convert map latitudeDelta to integer zoom level (approximate) */
function regionToZoom(region: RegionLike): number {
  return Math.round(Math.log2(360 / region.latitudeDelta));
}

/**
 * Warm "aged paper" treatment to match the web map's sepia tiles.
 * UrlTile swaps the base layer to OSM; the tint veil sits above the map
 * (but is ignored by touches) like a light varnish on a printed sheet.
 */
function PaperTintOverlay() {
  const colors = useColors();
  const tint = colors.background === "#1C1B19" ? "rgba(28,27,25,0.22)" : "rgba(0,0,0,0)";
  return <View pointerEvents="none" style={[styles.paperTint, { backgroundColor: tint }]} />;
}

const MapViewWrapper = forwardRef<any, MapViewWrapperProps>(
  ({ children, clusterMarkers, clusterRadius = 50, clusterMaxZoom = 17, ...props }, ref) => {
    const [currentRegion, setCurrentRegion] = useState<RegionLike | null>(null);
    // On-disk tile cache: after the Berkeley prefetch completes, serve tiles
    // from the filesystem so the map keeps rendering offline.
    const [tileTemplate, setTileTemplate] = useState(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    );
    useEffect(() => {
      if (Platform.OS === "web") return;
      let cancelled = false;
      prefetchBerkeleyTiles()
        .then(() => cachedTileTemplate())
        .then((template) => {
          if (!cancelled) setTileTemplate(template);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, []);
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
      return clusterEngine.current.getClusters(bounds, zoom);
    }, [currentRegion, points]);

    const handleRegionChangeComplete = useCallback((region: Region) => {
      setCurrentRegion(region as RegionLike);
    }, []);

    // If clustering is enabled and markers are provided, render clustered view
    if (clusterMarkers && clusterMarkers.length > 0) {
      return (
        <View style={styles.mapShell}>
          <MapView
            ref={ref}
            {...props}
            onRegionChangeComplete={handleRegionChangeComplete}
          >
            <UrlTile
              urlTemplate={tileTemplate}
              maximumZ={16}
              zIndex={-1}
            />
            <FarRingOverlay />
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
          <PaperTintOverlay />
        </View>
      );
    }

    // Default: pass through children as-is (no clustering)
    return (
      <View style={styles.mapShell}>
        <MapView ref={ref} {...props}>
          <UrlTile
            urlTemplate={tileTemplate}
            maximumZ={16}
            zIndex={-1}
          />
          <FarRingOverlay />
          {children}
        </MapView>
        <PaperTintOverlay />
      </View>
    );
  }
);

MapViewWrapper.displayName = "MapViewWrapper";

export default MapViewWrapper;

const styles = StyleSheet.create({
  mapShell: { flex: 1 },
  paperTint: { ...StyleSheet.absoluteFillObject },
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
  },
});
